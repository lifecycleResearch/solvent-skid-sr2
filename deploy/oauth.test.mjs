// OAuth and the signed payloads it stands on.
//
//   node --test deploy/oauth.test.mjs
//
// No network: the token exchange and the identity lookup are replaced with a
// scripted fetch. The important properties are that a callback with no twin
// state cookie is refused, and that a good callback creates the account and
// issues the same signed session the password flow issues.

import test from "node:test";
import assert from "node:assert/strict";
import { authorizationUrl, oauth, oauthProviders } from "./oauth.mjs";
import { signPayload, readPayload, verifySession, userKey } from "./auth.mjs";

const SECRET = "0123456789abcdef0123456789abcdef";

function memoryStore() {
  const rows = new Map();
  return {
    rows,
    async get(key) { return rows.has(key) ? JSON.parse(rows.get(key)) : null; },
    async put(key, value) { rows.set(key, JSON.stringify(value)); },
    async delete(key) { rows.delete(key); },
    async list({ prefix = "" } = {}) { return { keys: [...rows.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }; },
  };
}

const env = (extra = {}) => ({
  SESSION_SECRET: SECRET,
  GITHUB_CLIENT_ID: "gh-id",
  GITHUB_CLIENT_SECRET: "gh-secret",
  GOOGLE_CLIENT_ID: "g-id",
  GOOGLE_CLIENT_SECRET: "g-secret",
  ...extra,
});

function identityFetch() {
  const calls = [];
  const impl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes("access_token") || url.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "the-access-token" }), { status: 200 });
    }
    if (url === "https://api.github.com/user") {
      return new Response(JSON.stringify({ email: null, login: "octo" }), { status: 200 });
    }
    if (url === "https://api.github.com/user/emails") {
      return new Response(JSON.stringify([{ email: "octo@example.com", primary: true, verified: true }]), { status: 200 });
    }
    if (url.includes("userinfo")) {
      return new Response(JSON.stringify({ email: "person@example.com", name: "Person" }), { status: 200 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  return { impl, calls };
}

test("a signed payload round-trips, and a forged one does not", async () => {
  const token = await signPayload({ provider: "github", nonce: "n1" }, SECRET, { ttl: 60 });
  const claim = await readPayload(token, SECRET);
  assert.equal(claim.provider, "github");
  assert.equal(claim.nonce, "n1");
  assert.equal(await readPayload(`${token}x`, SECRET), null);
  assert.equal(await readPayload(token, "another-secret"), null);
  const expired = await signPayload({ provider: "github" }, SECRET, { ttl: -5 });
  assert.equal(await readPayload(expired, SECRET), null);
});

test("authorization URLs carry the client, the callback and the state", () => {
  const github = authorizationUrl("github", { clientId: "id", redirectUri: "https://host/api/auth/github/callback", state: "s1" });
  assert.match(github, /^https:\/\/github\.com\/login\/oauth\/authorize\?/);
  assert.match(github, /client_id=id/);
  assert.match(github, /state=s1/);
  const google = authorizationUrl("google", { clientId: "id", redirectUri: "https://host/api/auth/google/callback", state: "s2" });
  assert.match(google, /response_type=code/);
  assert.match(google, /scope=openid\+email\+profile|scope=openid%20email%20profile/);
});

test("the page can be told which providers are configured", () => {
  assert.deepEqual(oauthProviders(env()), { github: true, google: true });
  assert.deepEqual(oauthProviders(env({ GITHUB_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" })), { github: false, google: false });
});

test("an unconfigured provider says how to configure it", async () => {
  const res = await oauth(new Request("https://host/api/auth/github/start"), env({ GITHUB_CLIENT_ID: "" }), "github", "start", memoryStore());
  assert.equal(res.status, 501);
  const body = await res.json();
  assert.match(body.setup, /GITHUB_CLIENT_ID/);
});

test("start redirects to the provider and sets the state cookie", async () => {
  const res = await oauth(new Request("https://host/api/auth/github/start?returnTo=/studio.html"), env(), "github", "start", memoryStore());
  assert.equal(res.status, 302);
  const location = res.headers.get("location");
  assert.match(location, /^https:\/\/github\.com\/login\/oauth\/authorize/);
  const cookie = res.headers.get("set-cookie");
  assert.match(cookie, /sr2_oauth=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  const state = new URL(location).searchParams.get("state");
  assert.ok(cookie.includes(state), "the state is in the cookie and in the URL");
});

test("a callback without its twin state cookie is refused", async () => {
  const start = await oauth(new Request("https://host/api/auth/github/start"), env(), "github", "start", memoryStore());
  const state = new URL(start.headers.get("location")).searchParams.get("state");
  const res = await oauth(
    new Request(`https://host/api/auth/github/callback?code=abc&state=${state}`),
    env(),
    "github",
    "callback",
    memoryStore(),
    { fetchImpl: identityFetch().impl },
  );
  assert.equal(res.status, 302);
  assert.match(res.headers.get("location"), /auth=denied&reason=state-mismatch/);
});

test("a good callback creates the account and signs it in", async () => {
  const store = memoryStore();
  const start = await oauth(new Request("https://host/api/auth/github/start?returnTo=/studio.html"), env(), "github", "start", store);
  const state = new URL(start.headers.get("location")).searchParams.get("state");
  const { impl, calls } = identityFetch();
  const res = await oauth(
    new Request(`https://host/api/auth/github/callback?code=abc&state=${state}`, { headers: { cookie: `sr2_oauth=${state}` } }),
    env(),
    "github",
    "callback",
    store,
    { fetchImpl: impl },
  );
  assert.equal(res.status, 302);
  assert.match(res.headers.get("location"), /^\/studio\.html\?auth=ok/);
  const cookie = res.headers.get("set-cookie");
  assert.match(cookie, /sr2_session=/);

  const session = await verifySession(new Request("https://host/studio.html", { headers: { cookie: cookie.split(";")[0] } }), SECRET);
  assert.equal(session.email, "octo@example.com");

  const record = await store.get(userKey("octo@example.com"));
  assert.equal(record.via, "github");
  assert.equal(record.id, session.id, "the session names the stored account");
  assert.ok(!rowsContainSecret(store.rows), "no provider token is stored");
  assert.ok(calls.some((c) => c.url === "https://api.github.com/user/emails"), "a private email is looked up");
});

test("a Google callback works the same way", async () => {
  const store = memoryStore();
  const start = await oauth(new Request("https://host/api/auth/google/start"), env(), "google", "start", store);
  const state = new URL(start.headers.get("location")).searchParams.get("state");
  const res = await oauth(
    new Request(`https://host/api/auth/google/callback?code=abc&state=${state}`, { headers: { cookie: `sr2_oauth=${state}` } }),
    env(),
    "google",
    "callback",
    store,
    { fetchImpl: identityFetch().impl },
  );
  assert.match(res.headers.get("location"), /auth=ok/);
  const record = await store.get(userKey("person@example.com"));
  assert.equal(record.via, "google");
});

test("an off-site return target is never honoured", async () => {
  const start = await oauth(new Request("https://host/api/auth/github/start?returnTo=//evil.example/phish"), env(), "github", "start", memoryStore());
  const state = new URL(start.headers.get("location")).searchParams.get("state");
  const claim = await readPayload(state, SECRET);
  assert.equal(claim.returnTo, "/studio.html");
});

function rowsContainSecret(rows) {
  return [...rows.values()].some((v) => v.includes("the-access-token"));
}
