// The API, on Vercel.
//
// The Worker in deploy/worker.js is the same code, with the same handler and
// the same endpoints; this file is the adapter that turns Vercel's Node
// request into the Web Request the Worker expects, and the response back.
//
// The one difference is the context asset. On Cloudflare it comes from the
// ASSETS binding; here it is read from the file the build wrote. Everything
// else -- the chat, the describe, the search, the papers, the route, the
// grade -- is the same code, so the two deployments cannot drift apart.
//
// Workers AI is the one thing that does not travel: it is a Cloudflare
// binding, so on Vercel the chat has the local describer and the visitor's
// own key, and the local describer needs neither.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import worker from "../deploy/worker.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTEXT = join(HERE, "..", "deploy", "public", "skid-context.json");

const env = {
  ASSETS: {
    async fetch() {
      return new Response(readFileSync(CONTEXT), { headers: { "content-type": "application/json" } });
    },
  },
};

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  // Vercel parses a JSON body for us, so it has to go back to being text.
  let body;
  if (req.method !== "GET" && req.method !== "HEAD" && req.body !== undefined) {
    body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  }
  const request = new Request(url, {
    method: req.method,
    headers: new Headers(req.headers),
    body,
  });

  let response;
  try {
    response = await worker.fetch(request, env);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: String(err.message || err) }));
    return;
  }

  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  res.end();
}
