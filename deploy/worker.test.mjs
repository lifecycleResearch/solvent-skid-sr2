// The Worker's streaming path, without a key and without the network.
//
// The upstream provider is stubbed, so this proves the two things that are
// easy to break: that the Worker's request to Gemini or to an OpenAI-shaped
// endpoint is well formed, and that the provider's SSE is turned back into
// the frames the page reads.
//
//   node deploy/worker.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import worker from "./worker.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const context = JSON.parse(readFileSync(join(HERE, "..", "figures", "skid", "skid-context.json"), "utf8"));

const env = {
  ASSETS: {
    async fetch() {
      return new Response(JSON.stringify(context), { headers: { "content-type": "application/json" } });
    },
  },
};

const sse = (frames) => new Response(frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join(""), {
  headers: { "content-type": "text/event-stream" },
});

test("the chat endpoint refuses without a key", async () => {
  const res = await worker.fetch(
    new Request("https://skid/api/chat", { method: "POST", body: JSON.stringify({ provider: "gemini", messages: [{ role: "user", content: "hi" }] }) }),
    env,
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /no key/);
});

test("the local describer answers without a key", async () => {
  const res = await worker.fetch(
    new Request("https://skid/api/chat", { method: "POST", body: JSON.stringify({ provider: "local", messages: [{ role: "user", content: "what does the 13X bed take" }] }) }),
    env,
  );
  const text = await res.text();
  assert.match(text, /13X/);
  assert.match(text, /C₂–C₃/);
});

test("a Gemini answer is streamed back in the page's own frames", async () => {
  const seen = {};
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.url = String(url);
    seen.headers = init.headers;
    seen.body = JSON.parse(init.body);
    return sse([
      { candidates: [{ content: { parts: [{ text: "The 13X bed " }] } }] },
      { candidates: [{ content: { parts: [{ text: "takes the C₂–C₃ and the heavy ends." }] } }] },
    ]);
  };
  try {
    const res = await worker.fetch(
      new Request("https://skid/api/chat", {
        method: "POST",
        body: JSON.stringify({ provider: "gemini", model: "gemini-2.5-flash", key: "test-key", messages: [{ role: "user", content: "what does the 13X bed take" }] }),
      }),
      env,
    );
    assert.equal(res.status, 200);
    const text = await res.text();
    const frames = text.split("\n\n").filter(Boolean).map((f) => JSON.parse(f.slice(5)));
    assert.equal(frames.at(-1).done, true);
    assert.equal(frames.map((f) => f.text).join(""), "The 13X bed takes the C₂–C₃ and the heavy ends.");
  } finally {
    globalThis.fetch = real;
  }
  assert.match(seen.url, /generativelanguage\.googleapis\.com.*gemini-2\.5-flash:streamGenerateContent/);
  assert.equal(seen.headers["x-goog-api-key"], "test-key");
  assert.match(seen.body.systemInstruction.parts[0].text, /molecular sieve stack/i);
});

test("an OpenAI-shaped answer is streamed back too", async () => {
  const seen = {};
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.url = String(url);
    seen.body = JSON.parse(init.body);
    return sse([
      { choices: [{ delta: { content: "Two stage: " } }] },
      { choices: [{ delta: { content: "8 mbar." } }] },
    ]);
  };
  try {
    const res = await worker.fetch(
      new Request("https://skid/api/chat", {
        method: "POST",
        body: JSON.stringify({ provider: "openai", model: "gpt-4o-mini", baseUrl: "https://example.invalid/v1", key: "test-key", messages: [{ role: "user", content: "two stage?" }] }),
      }),
      env,
    );
    const text = await res.text();
    const frames = text.split("\n\n").filter(Boolean).map((f) => JSON.parse(f.slice(5)));
    assert.equal(frames.map((f) => f.text).join(""), "Two stage: 8 mbar.");
  } finally {
    globalThis.fetch = real;
  }
  assert.equal(seen.url, "https://example.invalid/v1/chat/completions");
  assert.equal(seen.body.messages[0].role, "system");
  assert.equal(seen.body.messages[1].content, "two stage?");
});

test("the context and the description are served", async () => {
  const ctx = await worker.fetch(new Request("https://skid/api/context"), env);
  const body = await ctx.json();
  assert.equal(body.name, "Solvent recovery skid SR-2");
  assert.ok(body.equipment.length >= 14);

  const desc = await worker.fetch(new Request("https://skid/api/describe?q=gas%20scrubber"), env);
  const text = await desc.json();
  assert.match(text.answer, /gas scrubber/i);
});
