// The accounts, and the safety questions.
//
//   node --test deploy/auth.test.mjs
//
// The account tests do not touch the network: they exercise the password
// hash, the sealed key, and the session lookup against an in-memory store
// shaped like KV. The point of the test is that a copy of the store gives
// away neither a password nor a live session.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  hashPassword,
  randomSalt,
  newToken,
  sha256,
  sealKey,
  openKey,
  signSession,
  verifySession,
  sessionUser,
  sessionCookie,
  clearCookie,
  userFor,
  keyFor,
  recentAttempts,
  noteAttempt,
  clearAttempts,
  storeOf,
  userKey,
  sessionKey,
  keyKey,
} from "./auth.mjs";
import { gradeDesign } from "./design.mjs";

function memoryStore() {
  const rows = new Map();
  return {
    rows,
    async get(key) {
      return rows.has(key) ? JSON.parse(rows.get(key)) : null;
    },
    async put(key, value, options = {}) {
      rows.set(key, JSON.stringify(value));
      if (options && options.expirationTtl) rows.set(`ttl:${key}`, options.expirationTtl);
    },
    async delete(key) {
      rows.delete(key);
    },
    async list({ prefix = "" } = {}) {
      return { keys: [...rows.keys()].filter((k) => k.startsWith(prefix) && !k.startsWith("ttl:")).map((name) => ({ name })) };
    },
  };
}

const requestWith = (cookie) => new Request("https://example.test/", { headers: cookie ? { cookie } : {} });

test("a password is stored as a salted hash, and the same password gives a different hash each time", async () => {
  const saltA = randomSalt();
  const saltB = randomSalt();
  assert.notEqual(saltA, saltB);
  const a = await hashPassword("a-long-enough-password", saltA);
  const b = await hashPassword("a-long-enough-password", saltB);
  assert.equal(a.length, 64);
  assert.notEqual(a, b, "the salt has to change the hash");
  assert.equal(a, await hashPassword("a-long-enough-password", saltA), "and it has to be deterministic");
  assert.notEqual(a, await hashPassword("a-long-enough-passworD", saltA));
});

test("a model key is sealed at rest and comes back only with the secret", async () => {
  const secret = "0123456789abcdef0123456789abcdef";
  const sealed = await sealKey("AIza-the-visitors-key", secret);
  assert.ok(!sealed.includes("AIza"), "the key must not be readable in the store");
  assert.equal(await openKey(sealed, secret), "AIza-the-visitors-key");
  await assert.rejects(() => openKey(sealed, "another-secret-entirely"));

  // A Worker secret is not necessarily 32 bytes. Hash it to a key first, or
  // AES-GCM refuses a 64-character hex string with a DataError.
  const long = "a".repeat(79);
  const sealedLong = await sealKey("AIza-the-visitors-key", long);
  assert.equal(await openKey(sealedLong, long), "AIza-the-visitors-key");
});

test("a session is a hashed token, and it expires", async () => {
  const store = memoryStore();
  await store.put(userKey("person@example.com"), { id: "u1", email: "person@example.com", salt: "s", passwordHash: "h" });
  const token = newToken();
  await store.put(
    sessionKey(await sha256(token)),
    { email: "person@example.com", expiresAt: new Date(Date.now() + 60000).toISOString() },
    { expirationTtl: 60 },
  );
  assert.ok(!store.rows.has(sessionKey(token)), "the raw token must not be a key in the store");

  const header = sessionCookie(token);
  assert.match(header, /HttpOnly/);
  assert.match(header, /Secure/);
  assert.match(header, /SameSite=Lax/);
  const cookie = header.split(";")[0];
  const found = await userFor(requestWith(cookie), store);
  assert.equal(found && found.email, "person@example.com");

  // An expired session is nobody.
  await store.put(sessionKey(await sha256(token)), { email: "person@example.com", expiresAt: new Date(Date.now() - 1000).toISOString() });
  assert.equal(await userFor(requestWith(cookie), store), null);
  assert.equal(await userFor(requestWith(null), store), null);
  assert.equal(await userFor(requestWith("sr2_session=not-a-token"), store), null);
  assert.match(clearCookie(), /Max-Age=0/);
});

test("a signed session survives without a store, and cannot be changed", async () => {
  const secret = "0123456789abcdef0123456789abcdef";
  const token = await signSession({ id: "u1", email: "person@example.com" }, secret);
  const cookie = sessionCookie(token);
  const request = requestWith(cookie.split(";")[0]);

  assert.equal(await verifySession(request, secret).then((u) => u && u.email), "person@example.com");
  assert.equal(await sessionUser(request, secret, null).then((u) => u && u.id), "u1", "no KV read is needed");

  // Change one character of the signature and the person disappears.
  const [body, mac] = token.split(".");
  const changed = `${body}.${mac.slice(0, -1)}${mac.endsWith("A") ? "B" : "A"}`;
  assert.equal(await verifySession(requestWith(`sr2_session=${changed}`), secret), null);
  assert.equal(await verifySession(request, "a-different-secret-entirely"), null);

  // An expired claim is nobody, even with a valid signature.
  const expired = await signSession({ id: "u1", email: "person@example.com" }, secret, { ttl: -10 });
  assert.equal(await verifySession(requestWith(`sr2_session=${expired}`), secret), null);
});

test("a person's own key is found for them and for nobody else", async () => {
  const store = memoryStore();
  const secret = "0123456789abcdef0123456789abcdef";
  await store.put(keyKey("u1", "gemini"), { sealed: await sealKey("their-key", secret) });
  assert.equal(await keyFor(store, "u1", "gemini", secret), "their-key");
  assert.equal(await keyFor(store, "u2", "gemini", secret), null);
  assert.equal(await keyFor(store, "u1", "openai", secret), null);
  assert.equal(await keyFor(store, "u1", "gemini", "the-wrong-secret"), null);
});

test("failed sign-ins are counted, and forgotten when one works", async () => {
  const store = memoryStore();
  for (let i = 0; i < 3; i += 1) await noteAttempt(store, "Person@Example.com");
  assert.equal(await recentAttempts(store, "person@example.com"), 3, "the address is normalised");
  await clearAttempts(store, "person@example.com");
  assert.equal(await recentAttempts(store, "person@example.com"), 0);
});

test("the store is only offered when the binding is a KV namespace", () => {
  assert.equal(storeOf({}), null);
  const fake = { async get() {}, async put() {}, async delete() {}, async list() { return { keys: [] }; } };
  assert.ok(storeOf({ ACCOUNTS: fake }), "a KV-shaped binding is a store");
});

test("the spec writes the safety questions down, with a rule and an owner for each", () => {
  const spec = JSON.parse(readFileSync(new URL("../spec/subzero-blend.json", import.meta.url), "utf8"));
  const questions = spec.safety.questions;
  assert.ok(questions.length >= 8);
  for (const q of questions) {
    assert.match(q.id, /^S-\d{2}$/);
    assert.ok(q.rule && q.topic && q.question && q.owner, `${q.id} is missing a field`);
    assert.equal(q.closed, false, `${q.id} cannot be closed by us`);
  }
  const grade = gradeDesign({ spec, catalogue: [] });
  const check = grade.checks.find((c) => c.name === "the safety questions are written down");
  assert.ok(check, "the grader must have a check for the safety section");
  assert.ok(check.ok, check.detail);
});
