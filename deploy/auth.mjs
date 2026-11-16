// Users, sessions, and the keys that belong to them.
//
// Email and a password, stored hashed, with a session cookie. The point is not
// the sign-in: it is that an agent can act under a person's identity, and that
// the person's own key is used rather than the account's.
//
// The password is hashed with PBKDF2 (WebCrypto, 100 000 rounds, a per-user
// salt) and the session token is stored hashed too, so a copy of the store
// does not give anyone a password or a live session.
//
// A user's own model key is encrypted at rest with AES-GCM under a Worker
// secret, so it is not sitting in the store in the clear.
//
// The store is Cloudflare KV: the accounts are a handful of records, the reads
// are on signed-in requests, and the free allowance is a hundred thousand
// reads a day. The SQL in deploy/schema.sql is the shape to migrate to when
// the account has a database to spare.

const encoder = new TextEncoder();

// The Workers runtime caps PBKDF2 at 100 000 iterations (it refuses more with
// a NotSupportedError), so that is the number: the strongest the platform
// allows. The default is stated once here rather than repeated at each call.
export function hashPassword(password, salt, { rounds = 100000 } = {}) {
  return crypto.subtle
    .importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"])
    .then((key) =>
      crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: encoder.encode(salt), iterations: rounds, hash: "SHA-256" },
        key,
        256,
      ),
    )
    .then((bits) => [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join(""));
}

export function randomSalt() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function newToken() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const b64 = {
  encode: (bytes) => btoa(String.fromCharCode(...bytes)),
  decode: (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0)),
};

const aesKey = (secret) =>
  crypto.subtle.digest("SHA-256", encoder.encode(secret)).then((bits) => crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["encrypt", "decrypt"]));

/** A key at rest: encrypted under a secret that never leaves the Worker. */
export async function sealKey(plaintext, secret) {
  const key = await aesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plaintext));
  return `${b64.encode(iv)}.${b64.encode(new Uint8Array(sealed))}`;
}

export async function openKey(sealed, secret) {
  const [ivText, dataText] = String(sealed).split(".");
  const key = await aesKey(secret);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64.decode(ivText) }, key, b64.decode(dataText));
  return new TextDecoder().decode(plain);
}

const SESSION_COOKIE = "sr2_session";
export const THIRTY_DAYS = 60 * 60 * 24 * 30;

export function sessionCookie(token, { maxAge = THIRTY_DAYS } = {}) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function cookieOf(request, name = SESSION_COOKIE) {
  const header = request.headers.get("cookie") || "";
  for (const piece of header.split(";")) {
    const [key, ...rest] = piece.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

const url64 = {
  encode: (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  decode: (text) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
};

/**
 * A signed session cookie, with no store lookup on the way in.
 *
 * Cloudflare KV is eventually consistent: a session written on one request
 * can be unreadable on the next, which makes it unfit for this. The cookie
 * carries its own subject, id and expiry, under an HMAC keyed by a Worker
 * secret. The account record itself stays in KV; only the session is
 * self-contained. The cost is that a session cannot be revoked one at a
 * time: logging out clears the cookie, and changing the secret revokes all
 * sessions at once. Both are stated in the docs.
 */
export async function signSession({ id, email }, secret, { ttl = THIRTY_DAYS } = {}) {
  const body = url64.encode(encoder.encode(JSON.stringify({ uid: id, sub: email, exp: Math.floor(Date.now() / 1000) + ttl })));
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = url64.encode(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body))));
  return `${body}.${mac}`;
}

/** The person behind a signed cookie, or null if it is wrong or expired. */
export async function verifySession(request, secret) {
  if (!secret) return null;
  const token = cookieOf(request);
  if (!token) return null;
  const [body, mac] = String(token).split(".");
  if (!body || !mac) return null;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("HMAC", key, url64.decode(mac), encoder.encode(body));
  if (!valid) return null;
  try {
    const claim = JSON.parse(new TextDecoder().decode(url64.decode(body)));
    if (!claim.exp || claim.exp * 1000 < Date.now() || !claim.sub) return null;
    return { id: claim.uid || claim.sub, email: claim.sub };
  } catch {
    return null;
  }
}

/** Signed first, then the old KV sessions, so an upgrade signs people out. */
export async function sessionUser(request, secret, store) {
  const signed = await verifySession(request, secret);
  return signed || userFor(request, store);
}

const userKey = (email) => `user:${String(email || "").trim().toLowerCase()}`;
const sessionKey = (tokenHash) => `session:${tokenHash}`;
const keyKey = (userId, provider) => `key:${userId}:${provider}`;
const attemptPrefix = (email) => `attempt:${String(email || "").trim().toLowerCase()}:`;

/** The user behind a request, or null. */
export async function userFor(request, store) {
  const token = cookieOf(request);
  if (!token || !store) return null;
  const tokenHash = await sha256(token);
  const session = await store.get(sessionKey(tokenHash));
  if (!session || !session.expiresAt || Date.parse(session.expiresAt) < Date.now()) return null;
  const user = await store.get(userKey(session.email));
  if (!user || user.disabled) return null;
  return { id: user.id, email: user.email };
}

/** The user's own key for a provider, decrypted. */
export async function keyFor(store, userId, provider, secret) {
  if (!store || !userId || !secret) return null;
  const row = await store.get(keyKey(userId, provider));
  if (!row || !row.sealed) return null;
  try {
    return await openKey(row.sealed, secret);
  } catch {
    return null;
  }
}

/** How many failed sign-ins from an address in the last quarter of an hour. */
export async function recentAttempts(store, email) {
  if (!store) return 0;
  const listed = await store.list({ prefix: attemptPrefix(email), limit: 20 });
  const cutoff = Date.now() - 15 * 60 * 1000;
  // The timestamp is the last piece of the key, as a number. Date.parse
  // cannot read a bare epoch, so it is converted rather than parsed.
  return (listed.keys || []).filter((key) => Number(String(key.name.split(":").pop()).split("-")[0]) > cutoff).length;
}

/** A record a failed sign-in leaves behind. */
export async function noteAttempt(store, email) {
  if (!store) return;
  // The silly suffix is not decoration: two failed sign-ins in the same
  // millisecond would otherwise be one key, and one attempt would vanish.
  const stamp = `${Date.now()}-${randomSalt().slice(0, 8)}`;
  await store.put(`${attemptPrefix(email)}${stamp}`, { at: Date.now() }, { expirationTtl: 900 });
}

export async function clearAttempts(store, email) {
  if (!store) return;
  const listed = await store.list({ prefix: attemptPrefix(email), limit: 40 });
  for (const key of listed.keys || []) await store.delete(key.name);
}

/** The stores, for the Worker. */
export function storeOf(env) {
  if (env.ACCOUNTS && typeof env.ACCOUNTS.get === "function") {
    return {
      async get(key) {
        return env.ACCOUNTS.get(key, "json");
      },
      async put(key, value, options) {
        return env.ACCOUNTS.put(key, JSON.stringify(value), options);
      },
      async delete(key) {
        return env.ACCOUNTS.delete(key);
      },
      async list(options) {
        const result = await env.ACCOUNTS.list(options);
        return { keys: result.keys || [] };
      },
    };
  }
  return null;
}

export { userKey, sessionKey, keyKey };
