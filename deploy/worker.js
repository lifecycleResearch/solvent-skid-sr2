// The Worker behind the figure.
//
//   GET  /api/context   the skid's description, as JSON
//   GET  /api/describe  the same, in prose; ?q= asks a question
//   POST /api/chat      a chat completion, streamed back as SSE
//   GET  /api/health    what this Worker can do, and which keys it holds
//
// The chat endpoint is a relay for the visitor's own key (BYOK): the key is
// taken from the request and used for that request only. If the Worker holds a
// key of its own it will only use it when the request carries the shared
// secret, so a deployed key is never spent by a stranger.

import { describe } from "./describe.mjs";
import { search, papers } from "./search.mjs";
import { route, availableProviders } from "./router.mjs";
import { gradeDeterministic, rubricPrompt, parseRubricVerdict } from "./grade.mjs";
import { judgeContext } from "./design.mjs";
import { compound, bibliography } from "./science.mjs";
import { legitimacyOf } from "../figures/lib/legitimacy.mjs";
import { mermaidSet } from "../figures/lib/mermaid.mjs";
import { safetyOf } from "../figures/lib/safety.mjs";
import {
  hashPassword,
  randomSalt,
  sha256,
  sealKey,
  sessionCookie,
  clearCookie,
  cookieOf,
  signSession,
  sessionUser,
  keyFor,
  recentAttempts,
  noteAttempt,
  clearAttempts,
  storeOf,
  userKey,
  sessionKey,
  keyKey,
} from "./auth.mjs";
import { systemPrompt, estimateTokens } from "./prompt.mjs";
import { oauth, oauthProviders } from "./oauth.mjs";
import { run as parametricsRun, rankMedia, MEDIA_LIBRARY, FILTRATION_STAGES, roModel } from "../sim/parametrics.mjs";
import { pack as pmPack } from "./pm.mjs";
import RUBRIC from "../evals/rubrics/design.json" with { type: "json" };

const DEPLOYED = "https://solvent-skid-sr2.lifecyclerd.workers.dev";

let contextCache = null;

async function contextOf(env) {
  if (contextCache) return contextCache;
  const res = await env.ASSETS.fetch(new Request("https://assets/skid-context.json"));
  if (!res.ok) throw new Error("the context asset is missing from the deploy");
  contextCache = await res.json();
  return contextCache;
}

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

// The client's own stream format: one JSON object per SSE line.
function sse(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function stateNote(context, state) {
  if (!state) return "";
  const bits = [];
  const mode = context.modes && context.modes[state.mode];
  if (mode) bits.push(`The drawing is on the ${mode.title} setup.`);
  if (state.stages) {
    const vac = (context.vacuum || []).find((v) => v.stages === state.stages);
    if (vac) bits.push(`The vacuum set is ${vac.stages} stage: ${vac.mbar} mbar, the solvent boils at ${vac.boilC} °C and the condenser needs ${vac.coolantC} °C of coolant.`);
  }
  if (state.cuts && state.cuts.length) {
    const grades = state.cuts.map((i) => (context.beds || [])[i] && context.beds[i].grade).filter(Boolean);
    if (grades.length) bits.push(`The ${grades.join(", ")} bed${grades.length > 1 ? "s are" : " is"} cut into ${grades.length > 1 ? "their" : "its"} collection can.`);
  }
  return bits.join(" ");
}

function asMessages(messages) {
  return (messages || [])
    .filter((m) => m && typeof m.content === "string" && m.content.trim())
    .slice(-24)
    .map((m) => ({ role: m.role === "assistant" || m.role === "model" ? "model" : "user", content: m.content.slice(0, 8000) }));
}

// ------------------------------------------------------------------ Gemini ---

async function gemini(context, { model, key, messages, state, system, catalogue = null }) {
  const prompt = system || [context.prompt, stateNote(context, state)].filter(Boolean).join("\n\n");
  const contents = asMessages(messages).map((m) => ({
    role: m.role,
    parts: [{ text: m.content }],
  }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || "gemini-2.5-flash")}:streamGenerateContent?alt=sse`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: prompt }] },
      contents,
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
    }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 400)}`);
  }
  return res.body;
}

// ------------------------------------------------------------- OpenAI-ish ---

async function openai(context, { model, baseUrl, key, messages, state, system }) {
  const prompt = system || [context.prompt, stateNote(context, state)].filter(Boolean).join("\n\n");
  const base = (baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      stream: true,
      temperature: 0.3,
      max_tokens: 2048,
      messages: [{ role: "system", content: prompt }, ...asMessages(messages).map((m) => ({ role: m.role === "model" ? "assistant" : "user", content: m.content }))],
    }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`${base} ${res.status}: ${body.slice(0, 400)}`);
  }
  return res.body;
}

// ----------------------------------------------------------- Workers AI ---
//
// The model that comes with the Cloudflare plan: no key, no account of its
// own, and it never leaves the account.

// The text of whatever the model answered with. The binding answers in a few
// shapes depending on the model and the size of the prompt, so this takes
// them all rather than assuming one.
function textOf(out) {
  if (out === null || out === undefined) return "";
  if (typeof out === "string") return out;
  // The chat-completion shape the binding answers with when it does not
  // stream.
  const choice = out.choices && out.choices[0];
  if (choice) {
    if (choice.message && typeof choice.message.content === "string") return choice.message.content;
    if (typeof choice.text === "string") return choice.text;
    if (choice.delta && typeof choice.delta.content === "string") return choice.delta.content;
  }
  if (typeof out.response === "string") return out.response;
  if (out.response && typeof out.response.text === "string") return out.response.text;
  if (typeof out.text === "string") return out.text;
  if (typeof out.text === "function") return out.text();
  if (Array.isArray(out)) return out.map((item) => textOf(item)).join("");
  return JSON.stringify(out);
}

async function workersAi(env, { model, messages, state, context }) {
  if (!env.AI) throw new Error("this Worker has no AI binding");
  const prompt = [context.prompt, stateNote(context, state)].filter(Boolean).join("\n\n");
  const out = await env.AI.run(model || "@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
    messages: [
      { role: "system", content: prompt },
      ...asMessages(messages).map((m) => ({ role: m.role === "model" ? "assistant" : "user", content: m.content })),
    ],
  });
  // The binding answers with a stream of text chunks.
  if (out && typeof out.getReader === "function") {
    const reader = out.getReader();
    const decoder = new TextDecoder();
    return new Response(
      new ReadableStream({
        async pull(controller) {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              return;
            }
            const text = typeof value === "string" ? value : value instanceof Uint8Array ? decoder.decode(value) : textOf(value);
            if (text) controller.enqueue(encoder.encode(text));
          }
        },
      }),
    );
  }
  return new Response(textOf(out));
}

// ---------------------------------------------------------------- the chat ---

async function chat(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "the body is not JSON" }, 400);
  }
  const provider = String(body.provider || "gemini").toLowerCase();
  const context = await contextOf(env);

  if (provider === "local") {
    const answer = describe(context, body.messages && body.messages.length ? body.messages[body.messages.length - 1].content : "", body.state);
    return new Response(sse({ text: answer }) + sse({ done: true }), {
      headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" },
    });
  }

  // The visitor's key, or the Worker's own if the request carries the secret.
  const secret = request.headers.get("x-chat-secret");
  const serverAllowed = env.CHAT_SECRET && secret === env.CHAT_SECRET;
  const serverKey = provider === "gemini" ? env.GEMINI_API_KEY : provider === "kimi" ? env.KIMI_API_KEY : env.OPENAI_API_KEY;
  let key = String(body.key || "").trim() || (serverAllowed ? serverKey : "");

  // A signed-in person's own key, used for them, without them pasting it
  // every time: this is what lets an agent act under someone's identity.
  const accountStore = storeOf(env);
  if (!key && accountStore && env.SESSION_SECRET) {
    const user = await sessionUser(request, env.SESSION_SECRET, accountStore);
    if (user) {
      const stored = await keyFor(accountStore, user.id, provider, env.SESSION_SECRET);
      if (stored) key = stored;
      body.as = user.email;
    }
  }

  const messages = asMessages(body.messages);
  if (!messages.length) return json({ error: "no messages" }, 400);

  // The context is trimmed to the parts the question touches, and the rules
  // go in front of it: that is what keeps the answer short, cited and honest.
  let catalogue = null;
  let prompt = null;
  if (body.trim !== false && env.ASSETS) {
    const question = messages[messages.length - 1].content;
    const slug = body.spec || "blend";
    const res = await env.ASSETS.fetch(new Request(`https://assets/catalogue-${slug}.json`)).catch(() => null);
    if (res && res.ok) {
      const data = await res.json();
      catalogue = data.parts || [];
      const context = await contextOf(env);
      prompt = systemPrompt({
        context: { ...context, assumptions: null },
        catalogue,
        question,
        state: body.state,
      });
    }
  }
  if (prompt) {
    body.trimmed = {
      tokens: estimateTokens(prompt),
      parts: catalogue ? catalogue.length : 0,
      question: messages[messages.length - 1].content.slice(0, 120),
    };
  }

  // Workers AI needs no key: it is the model that comes with the plan.
  if (provider === "workers-ai") {
    try {
      const upstream = await workersAi(env, { model: body.model, messages, state: body.state, context: { prompt: prompt || (await contextOf(env)).prompt } });
      return asSseText(upstream);
    } catch (err) {
      return json({ error: String(err.message || err) }, 502);
    }
  }

  if (!key) {
    return json(
      {
        error: "no key for this provider",
        how: "put your own key in the chat settings, or add one to the Worker as a secret and send it as the x-chat-secret header",
        providers: { gemini: "a Google AI Studio key", openai: "an OpenAI or OpenAI-compatible key", kimi: "a Moonshot AI key (OpenAI-compatible)", "workers-ai": "no key needed" },
      },
      400,
    );
  }

  let upstream;
  try {
    upstream =
      provider === "kimi"
        ? // Kimi speaks the OpenAI chat-completions protocol. The model name is
          // the caller's, because the available Kimi revisions change.
          await openai(context, {
            model: body.model || "kimi-k3.1",
            baseUrl: body.baseUrl || env.KIMI_BASE_URL || "https://api.moonshot.ai/v1",
            key,
            messages,
            state: body.state,
            system: prompt,
          })
        : provider === "openai"
        ? await openai(context, { model: body.model, baseUrl: body.baseUrl, key, messages, state: body.state, system: prompt })
        : await gemini(context, { model: body.model, key, messages, state: body.state, system: prompt });
  } catch (err) {
    return json({ error: String(err.message || err) }, 502);
  }

  // Both providers speak SSE; read it, and hand the text on in our own frames.
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const stream = new ReadableStream({
    async pull(controller) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          controller.enqueue(encoder.encode(sse({ done: true })));
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        let text = "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          let obj;
          try {
            obj = JSON.parse(payload);
          } catch {
            continue;
          }
          if (provider === "openai") {
            const delta = obj.choices && obj.choices[0] && obj.choices[0].delta;
            if (delta && delta.content) text += delta.content;
          } else {
            const parts = obj.candidates && obj.candidates[0] && obj.candidates[0].content && obj.candidates[0].content.parts;
            if (parts) for (const part of parts) if (part.text) text += part.text;
          }
        }
        if (text) {
          controller.enqueue(encoder.encode(sse({ text })));
          return;
        }
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}

const encoder = new TextEncoder();

/**
 * Durable project state for the studio, one record per signed-in person.
 *
 * Anonymous visitors keep their work in the browser; the response says so
 * rather than pretending to have saved it. Images never come here: they stay
 * in the browser, and only their names and notes are part of the state.
 */
async function studioState(request, env) {
  const store = storeOf(env);
  if (!store || !env.SESSION_SECRET) return json({ user: null, state: null, persistence: "browser" });
  const user = await sessionUser(request, env.SESSION_SECRET, store);
  if (!user) return json({ user: null, state: null, persistence: "browser" });
  const key = `studio:${user.id}`;

  if (request.method === "GET") {
    return json({ user, state: await store.get(key), persistence: "account" });
  }
  if (request.method === "DELETE") {
    await store.delete(key);
    return json({ ok: true });
  }
  if (request.method === "PUT" || request.method === "POST") {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 400000) return json({ error: "the project is too large; keep images in the browser" }, 413);
    const body = await request.json().catch(() => null);
    if (!body || typeof body.state !== "object" || body.state === null) return json({ error: "send { state: { ... } }" }, 400);
    const record = { ...body.state, updatedAt: new Date().toISOString() };
    await store.put(key, record);
    return json({ ok: true, updatedAt: record.updatedAt });
  }
  return json({ error: "method not allowed" }, 405);
}

/**
 * The accounts: register, sign in, sign out, who am I, and the key that
 * belongs to me.
 *
 * The session is a cookie; the key is sealed with a Worker secret before it
 * is written; and the failed sign-ins are counted, so a password cannot be
 * guessed by repetition.
 */
async function auth(request, env, path) {
  const store = storeOf(env);
  if (!store) return json({ error: "this Worker has no account store" }, 501);
  const secret = env.SESSION_SECRET;
  if (!secret) return json({ error: "this Worker has no session secret" }, 501);

  if (path === "/api/auth/me") {
    const user = await sessionUser(request, secret, store);
    if (!user) return json({ user: null });
    const listed = await store.list({ prefix: `key:${user.id}:`, limit: 10 });
    return json({ user, keys: (listed.keys || []).map((k) => k.name.split(":")[2]) });
  }

  if (path === "/api/auth/logout") {
    const token = cookieOf(request);
    if (token) await store.delete(sessionKey(await sha256(token)));
    return json({ ok: true }, 200, { "set-cookie": clearCookie() });
  }

  if (path === "/api/auth/register") {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "that is not an email address" }, 400);
    if (password.length < 10) return json({ error: "use at least ten characters" }, 400);
    if (await store.get(userKey(email))) return json({ error: "there is already an account with that address" }, 409);
    const salt = randomSalt();
    const hash = await hashPassword(password, salt);
    const id = crypto.randomUUID();
    await store.put(userKey(email), { id, email, salt, passwordHash: hash, createdAt: new Date().toISOString() });
    return json({ ok: true, email }, 201);
  }

  if (path === "/api/auth/login") {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (await recentAttempts(store, email) > 10) return json({ error: "too many attempts; wait a quarter of an hour" }, 429);
    const user = await store.get(userKey(email));
    const hash = user ? await hashPassword(password, user.salt) : null;
    if (!user || hash !== user.passwordHash || user.disabled) {
      await noteAttempt(store, email);
      return json({ error: "the address or the password is wrong" }, 401);
    }
    await clearAttempts(store, email);
    // A signed cookie, so the next request does not have to wait for KV to
    // catch up. The user record was read here, where consistency matters.
    const token = await signSession({ id: user.id, email: user.email }, secret);
    return json({ ok: true, email: user.email }, 200, { "set-cookie": sessionCookie(token) });
  }

  if (path === "/api/auth/key") {
    const user = await sessionUser(request, secret, store);
    if (!user) return json({ error: "sign in first" }, 401);
    const body = await request.json().catch(() => ({}));
    const provider = String(body.provider || "gemini").toLowerCase();
    const key = String(body.key || "").trim();
    if (!key) {
      await store.delete(keyKey(user.id, provider));
      return json({ ok: true, provider, cleared: true });
    }
    await store.put(keyKey(user.id, provider), { sealed: await sealKey(key, secret) });
    return json({ ok: true, provider });
  }

  return json({ error: "no such account route" }, 404);
}

// A plain text stream, wrapped in the frames the page reads.
function asSseText(upstream) {
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const stream = new ReadableStream({
    async pull(controller) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          controller.enqueue(encoder.encode(sse({ done: true })));
          controller.close();
          return;
        }
        const text = typeof value === "string" ? value : decoder.decode(value, { stream: true });
        if (text) controller.enqueue(encoder.encode(sse({ text })));
        return;
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}

// ----------------------------------------------------------------- router ---

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (path === "/api/chat") {
        if (request.method !== "POST") return json({ error: "POST here" }, 405);
        return await chat(request, env);
      }
      if (path === "/api/context") {
        return json(await contextOf(env), 200, { "cache-control": "public, max-age=300" });
      }
      if (path === "/api/describe") {
        const context = await contextOf(env);
        const question = url.searchParams.get("q") || "";
        const state = url.searchParams.get("mode") ? { mode: url.searchParams.get("mode"), stages: Number(url.searchParams.get("stages") || 0) || undefined } : null;
        return json({ question, answer: describe(context, question, state) }, 200, { "cache-control": "public, max-age=300" });
      }
      if (path === "/api/health") {
        return json({
          ok: true,
          deployed: DEPLOYED,
          providers: {
            gemini: { needsKey: true, serverKey: Boolean(env.GEMINI_API_KEY) },
            openai: { needsKey: true, serverKey: Boolean(env.OPENAI_API_KEY) },
            "workers-ai": { needsKey: false, available: Boolean(env.AI) },
            local: { needsKey: false },
          },
          agent: { configured: Boolean(env.AGENT_GATEWAY_URL), note: "the OpenShell gateway over the tailnet, if one is configured" },
        });
      }
      if (path === "/api/legitimacy") {
        // What each component is built to, what applies to it, and what is
        // still open. The open questions are the point.
        const slug = url.searchParams.get("spec") || "blend";
        const [specRes, catalogueRes] = await Promise.all([
          env.ASSETS.fetch(new Request(`https://assets/spec-${slug}.json`)),
          env.ASSETS.fetch(new Request(`https://assets/catalogue-${slug}.json`)),
        ]);
        if (!specRes.ok) return json({ error: "the specification is not built yet" }, 404);
        const spec = await specRes.json();
        const catalogue = await catalogueRes.json();
        return json(legitimacyOf(spec, catalogue.parts || [], {}), 200, { "cache-control": "public, max-age=300" });
      }
      if (path === "/api/mermaid") {
        // One diagram per process, in Mermaid.
        const slug = url.searchParams.get("spec") || "blend";
        const step = url.searchParams.get("step");
        const res = await env.ASSETS.fetch(new Request(`https://assets/spec-${slug}.json`));
        if (!res.ok) return json({ error: "the specification is not built yet" }, 404);
        const spec = await res.json();
        const set = mermaidSet(spec);
        if (step) {
          if (!set.steps[step]) return json({ error: `no step with the id ${step}` }, 404);
          return json({ step, mermaid: set.steps[step] }, 200, { "cache-control": "public, max-age=600" });
        }
        return json(set, 200, { "cache-control": "public, max-age=600" });
      }
      if (path === "/api/references") {
        // The evidence, as a bibliography.
        const slug = url.searchParams.get("spec") || "blend";
        const [specRes, evidenceRes] = await Promise.all([
          env.ASSETS.fetch(new Request(`https://assets/spec-${slug}.json`)),
          env.ASSETS.fetch(new Request(`https://assets/evidence-${slug}.json`)),
        ]);
        if (!specRes.ok) return json({ error: "the specification is not built yet" }, 404);
        const spec = await specRes.json();
        const evidence = await evidenceRes.json();
        const bib = bibliography(spec, evidence);
        return new Response(bib, {
          headers: { "content-type": "application/x-bibtex; charset=utf-8", "cache-control": "public, max-age=600" },
        });
      }
      if (path === "/api/compound") {
        // A CAS number, resolved: the structure, the identifiers and the
        // hazard statements the label has to carry.
        const cas = url.searchParams.get("cas");
        if (!cas) return json({ error: "give a CAS number" }, 400);
        const found = await compound(cas);
        return json(found, 200, { "cache-control": "public, max-age=86400" });
      }
      if (path === "/api/auth/providers") {
        // What sign-in this deployment actually offers, so the page never
        // shows a button that leads nowhere.
        return json({ ...oauthProviders(env), email: Boolean(storeOf(env) && env.SESSION_SECRET) });
      }
      const oauthRoute = path.match(/^\/api\/auth\/(github|google)\/(start|callback)$/);
      if (oauthRoute) {
        const store = storeOf(env);
        if (!store) return json({ error: "this Worker has no account store" }, 501);
        return oauth(request, env, oauthRoute[1], oauthRoute[2], store);
      }
      if (path === "/api/studio/state") {
        return studioState(request, env);
      }
      if (path === "/api/auth/register" || path === "/api/auth/login" || path === "/api/auth/logout" || path === "/api/auth/me" || path === "/api/auth/key") {
        return auth(request, env, path);
      }
      if (path === "/api/parametrics") {
        // Everything the sliders and the balancer need, in one deterministic
        // call. Same inputs, same outputs, in the Worker and in the tests.
        const q = url.searchParams;
        const num = (name, fallback) => {
          const v = Number(q.get(name));
          return Number.isFinite(v) && q.has(name) ? v : fallback;
        };
        let result;
        try {
          result = parametricsRun({
            tC: num("tC", 2), torr: num("torr", 100), psi: num("psi", 15),
            dose: num("dose", 5), media: q.get("media") || "MED-0001",
            biomass: num("biomass", 120), cbd: num("cbd", 8), moisture: num("moisture", 10),
            ratio: num("ratio", 8), passes: num("passes", 2),
          });
        } catch (err) {
          return json({ error: `the model could not run: ${String(err.message || err)}` }, 500);
        }
        return json(result, 200, { "cache-control": "no-store" });
      }
      if (path === "/api/media") {
        // The media list, ranked by the published rule: accessible first,
        // regenerable in-house, then reuse cycles.
        const ranked = rankMedia();
        return json({ library: MEDIA_LIBRARY(), ranked: ranked.ranked, rule: ranked.rule, filtration: FILTRATION_STAGES(), ro: roModel() }, 200, { "cache-control": "public, max-age=300" });
      }
      if (path === "/api/pmpack") {
        return json(pmPack(), 200, { "cache-control": "public, max-age=300" });
      }
      if (path === "/api/safety") {
        // The safety questions: what has to be closed, and by whom.
        const slug = url.searchParams.get("spec") || "blend";
        const res = await env.ASSETS.fetch(new Request(`https://assets/spec-${slug}.json`));
        if (!res.ok) return json({ error: "the specification is not built yet" }, 404);
        return json(safetyOf(await res.json()), 200, { "cache-control": "public, max-age=300" });
      }
      if (path === "/api/specs") {
        // Which experiments this deployment carries.
        const res = await env.ASSETS.fetch(new Request("https://assets/specs.json"));
        if (!res.ok) return json({ error: "no manifest" }, 404);
        return json(await res.json(), 200, { "cache-control": "public, max-age=300" });
      }
      if (path === "/api/catalogue") {
        // The part catalogue: what every part is, does, and its place in the
        // process. The same records the page shows when a part is clicked.
        const id = url.searchParams.get("id");
        const slug = url.searchParams.get("spec") || "blend";
        const res = await env.ASSETS.fetch(new Request(`https://assets/catalogue-${slug}.json`));
        if (!res.ok) return json({ error: "the catalogue is not built yet" }, 404);
        const catalogue = await res.json();
        if (id) {
          const part = (catalogue.parts || []).find((p) => p.id === id);
          return part ? json(part) : json({ error: `no part with the id ${id}` }, 404);
        }
        return json(catalogue, 200, { "cache-control": "public, max-age=300" });
      }
      if (path === "/api/evidence") {
        // The literature and the patents, by part or by topic.
        const slug = url.searchParams.get("spec") || "blend";
        const res = await env.ASSETS.fetch(new Request(`https://assets/evidence-${slug}.json`));
        if (!res.ok) return json({ error: "the evidence has not been retrieved yet" }, 404);
        const evidence = await res.json();
        const topic = url.searchParams.get("topic");
        if (topic) {
          const found = evidence.topics && evidence.topics[topic];
          return found ? json(found) : json({ error: `no evidence for the topic ${topic}` }, 404);
        }
        return json(evidence, 200, { "cache-control": "public, max-age=600" });
      }
      if (path === "/api/design") {
        // The design grade: the checks, the verdict, and the state of each part.
        // With ?judge=1 and a key, the rubric judge adds its verdict on top.
        const slug = url.searchParams.get("spec") || "blend";
        const res = await env.ASSETS.fetch(new Request(`https://assets/design-grade-${slug}.json`));
        if (!res.ok) return json({ error: "the design grade has not been run yet" }, 404);
        const grade = await res.json();

        if (url.searchParams.get("judge") !== "1") return json(grade, 200, { "cache-control": "public, max-age=300" });

        const key = String(url.searchParams.get("key") || "") || (env.CHAT_SECRET && request.headers.get("x-chat-secret") === env.CHAT_SECRET ? env.GEMINI_API_KEY : "");
        const [specRes, catalogueRes, evidenceRes] = await Promise.all([
          env.ASSETS.fetch(new Request(`https://assets/spec-${slug}.json`)),
          env.ASSETS.fetch(new Request(`https://assets/catalogue-${slug}.json`)),
          env.ASSETS.fetch(new Request(`https://assets/evidence-${slug}.json`)),
        ]);
        const spec = await specRes.json();
        const catalogue = await catalogueRes.json();
        const evidence = await evidenceRes.json();
        const context = judgeContext(spec, catalogue.parts || [], evidence);
        const prompt = rubricPrompt(RUBRIC, context);

        // Workers AI needs no key, so on Cloudflare the judge works with
        // nothing set up; elsewhere the visitor's key is used.
        let raw;
        if (!key && env.AI) {
          const upstream = await workersAi(env, { model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", messages: [{ role: "user", content: prompt }], state: null, context: { prompt } });
          raw = await upstream.text();
        } else if (key) {
          const upstream = await gemini(context, {
            model: url.searchParams.get("model") || "gemini-2.5-flash",
            key,
            messages: [{ role: "user", content: prompt }],
            state: null,
            system: prompt,
          });
          raw = await upstream.text();
        } else {
          return json({ error: "the rubric judge needs a model key, or Workers AI on this Worker", grade }, 400);
        }
        const verdict = parseRubricVerdict(raw, RUBRIC);
        return json({ grade, rubric: verdict }, 200, { "cache-control": "no-store" });
      }
      if (path === "/api/agent") {
        const target = env.AGENT_GATEWAY_URL;
        if (!target) {
          return json({ error: "no agent gateway is configured", how: "set AGENT_GATEWAY_URL (and AGENT_TOKEN) as a Worker secret" }, 501);
        }
        const body = await request.json().catch(() => ({}));
        const res = await fetch(target, {
          method: "POST",
          headers: { "content-type": "application/json", ...(env.AGENT_TOKEN ? { authorization: `Bearer ${env.AGENT_TOKEN}` } : {}) },
          body: JSON.stringify(body),
        });
        return new Response(res.body, { status: res.status, headers: { "content-type": res.headers.get("content-type") || "application/json" } });
      }
      if (path === "/api/search") {
        // Free, no key, no quota: DuckDuckGo, Wikipedia, arXiv, OpenAlex, Crossref.
        const q = url.searchParams.get("q") || "";
        const limit = Math.min(10, Number(url.searchParams.get("limit") || 5));
        const result = await search(q, { limit });
        return json(result, 200, { "cache-control": "public, max-age=600" });
      }
      if (path === "/api/papers") {
        const q = url.searchParams.get("q") || "";
        const limit = Math.min(15, Number(url.searchParams.get("limit") || 8));
        return json(await papers(q, { limit }), 200, { "cache-control": "public, max-age=600" });
      }
      if (path === "/api/route") {
        // Which model would answer a task, and why. No keys are shown, only
        // which ones are present.
        const task = {
          class: url.searchParams.get("class") || "summarise",
          confidential: url.searchParams.get("confidential") === "true",
          allowPaid: url.searchParams.get("allowPaid") === "true",
          prefer: url.searchParams.get("prefer") || undefined,
        };
        const decision = route(task, env);
        return json({ task, decision, available: availableProviders(env) }, 200, { "cache-control": "no-store" });
      }
      if (path === "/api/grade") {
        const body = await request.json().catch(() => ({}));
        const answer = String(body.answer || "");
        const verdicts = [];
        if (body.checks) verdicts.push(gradeDeterministic(answer, body.checks));
        if (body.rubric) {
          const key = String(body.key || "").trim() || (env.CHAT_SECRET && request.headers.get("x-chat-secret") === env.CHAT_SECRET ? env.GEMINI_API_KEY : "");
          if (!key) {
            verdicts.push({ kind: "rubric", score: 0, passed: false, error: "the rubric judge needs a model key" });
          } else {
            const prompt = rubricPrompt(body.rubric, answer, body.context || "");
            const upstream = await gemini(context, { model: body.model || "gemini-2.5-flash", key, messages: [{ role: "user", content: prompt }], state: null, system: prompt });
            const raw = await upstream.text();
            verdicts.push(parseRubricVerdict(raw, body.rubric));
          }
        }
        const overall = verdicts.length ? verdicts.reduce((sum, v) => sum + (v.score || 0), 0) / verdicts.length : 0;
        return json({ verdicts, overall, passed: verdicts.length > 0 && verdicts.every((v) => v.passed) }, 200, { "cache-control": "no-store" });
      }
    } catch (err) {
      return json({ error: String(err.message || err) }, 500);
    }

    // Everything else is the figure itself.
    return env.ASSETS.fetch(request);
  },
};
