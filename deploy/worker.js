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

async function gemini(context, { model, key, messages, state }) {
  const prompt = [context.prompt, stateNote(context, state)].filter(Boolean).join("\n\n");
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

async function openai(context, { model, baseUrl, key, messages, state }) {
  const prompt = [context.prompt, stateNote(context, state)].filter(Boolean).join("\n\n");
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
  const serverKey = provider === "gemini" ? env.GEMINI_API_KEY : env.OPENAI_API_KEY;
  const key = String(body.key || "").trim() || (serverAllowed ? serverKey : "");
  if (!key) {
    return json(
      {
        error: "no key for this provider",
        how: "put your own key in the chat settings, or add one to the Worker as a secret and send it as the x-chat-secret header",
        providers: { gemini: "a Google AI Studio key", openai: "an OpenAI or OpenAI-compatible key" },
      },
      400,
    );
  }

  const messages = asMessages(body.messages);
  if (!messages.length) return json({ error: "no messages" }, 400);

  let upstream;
  try {
    upstream =
      provider === "openai"
        ? await openai(context, { model: body.model, baseUrl: body.baseUrl, key, messages, state: body.state })
        : await gemini(context, { model: body.model, key, messages, state: body.state });
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
            local: { needsKey: false },
          },
          agent: { configured: Boolean(env.AGENT_GATEWAY_URL), note: "the OpenShell gateway over the tailnet, if one is configured" },
        });
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
    } catch (err) {
      return json({ error: String(err.message || err) }, 500);
    }

    // Everything else is the figure itself.
    return env.ASSETS.fetch(request);
  },
};
