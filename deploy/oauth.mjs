// OAuth sign-in, hand-rolled: no npm, no identity service to pay for.
//
// Two providers, both free to register:
//
//   GitHub  an OAuth app at github.com/settings/developers
//   Google  a web OAuth client at console.cloud.google.com
//
// The flow is the ordinary authorization-code flow with a PKCE-free server
// exchange, because the client secret never leaves the Worker. The state
// parameter is a signed, short-lived payload that is also held in an HttpOnly
// cookie, so a callback that arrives without its twin is rejected.
//
// The redirect URI is derived from the request, so it works on the live
// Worker, the review Worker and localhost without a second configuration.
// Register the callback URLs in each provider as:
//   https://<host>/api/auth/github/callback
//   https://<host>/api/auth/google/callback

import { signPayload, readPayload, signSession, sessionCookie, randomSalt, hashPassword, userKey } from "./auth.mjs";

const ENDPOINTS = {
  github: {
    authorize: "https://github.com/login/oauth/authorize",
    token: "https://github.com/login/oauth/access_token",
    scope: "read:user user:email",
  },
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
  },
};

export const OAUTH_COOKIE = "sr2_oauth";

/** The configured providers, so the page can hide what is not set up. */
export function oauthProviders(env) {
  return {
    github: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
    google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  };
}

function configOf(env, provider) {
  if (provider === "github") return { id: env.GITHUB_CLIENT_ID, secret: env.GITHUB_CLIENT_SECRET };
  if (provider === "google") return { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET };
  return null;
}

/** Where the user is sent after signing in. Only same-origin paths are kept. */
function safeReturnTo(value) {
  const text = String(value || "/studio.html");
  if (!text.startsWith("/") || text.startsWith("//")) return "/studio.html";
  return text.slice(0, 400);
}

/** Build the provider's authorization URL. Pure, so it is testable. */
export function authorizationUrl(provider, { clientId, redirectUri, state }) {
  const p = ENDPOINTS[provider];
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: p.scope,
    state,
  });
  if (provider === "google") {
    params.set("response_type", "code");
    params.set("access_type", "online");
    params.set("prompt", "select_account");
  }
  return `${p.authorize}?${params}`;
}

/** Exchange a code, and read the person's email. Throws on any failure. */
async function fetchIdentity(provider, code, cfg, redirectUri, fetchImpl = fetch) {
  const p = ENDPOINTS[provider];
  const res = await fetchImpl(p.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      client_id: cfg.id,
      client_secret: cfg.secret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const token = await res.json();
  if (!res.ok || !token.access_token) throw new Error(`token exchange failed: ${res.status}`);

  if (provider === "github") {
    const user = await (await fetchImpl("https://api.github.com/user", {
      headers: { authorization: `Bearer ${token.access_token}`, "user-agent": "grea-process-studio", accept: "application/vnd.github+json" },
    })).json();
    let email = user.email;
    if (!email) {
      const emails = await (await fetchImpl("https://api.github.com/user/emails", {
        headers: { authorization: `Bearer ${token.access_token}`, "user-agent": "grea-process-studio", accept: "application/vnd.github+json" },
      })).json();
      const primary = (Array.isArray(emails) ? emails : []).find((e) => e.primary && e.verified) || (Array.isArray(emails) ? emails : []).find((e) => e.verified);
      email = primary && primary.email;
    }
    if (!email) throw new Error("GitHub gave no verified email");
    return { email: String(email).toLowerCase(), name: user.name || user.login || null, via: "github" };
  }

  const info = await (await fetchImpl("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${token.access_token}` },
  })).json();
  if (!info.email) throw new Error("Google gave no email");
  return { email: String(info.email).toLowerCase(), name: info.name || null, via: "google" };
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8" } });

/**
 * Handle /api/auth/<provider>/start and /callback.
 *
 * `deps` is injectable for tests: fetchImpl replaces the network, store the
 * account store, now the clock.
 */
export async function oauth(request, env, provider, action, store, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const url = new URL(request.url);
  const cfg = configOf(env, provider);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo") || deps.returnTo);

  if (!cfg || !cfg.id || !cfg.secret || !ENDPOINTS[provider]) {
    return json(
      {
        error: `${provider} sign-in is not configured`,
        setup: `set ${provider.toUpperCase()}_CLIENT_ID and ${provider.toUpperCase()}_CLIENT_SECRET as Worker secrets, and register ${url.origin}/api/auth/${provider}/callback as the callback URL`,
      },
      501,
    );
  }
  if (!env.SESSION_SECRET) return json({ error: "this Worker has no session secret" }, 501);
  const redirectUri = `${url.origin}/api/auth/${provider}/callback`;

  if (action === "start") {
    const state = await signPayload({ provider, nonce: crypto.randomUUID(), returnTo }, env.SESSION_SECRET, { ttl: 600 });
    const location = authorizationUrl(provider, { clientId: cfg.id, redirectUri, state });
    return new Response(null, {
      status: 302,
      headers: {
        location,
        "set-cookie": `${OAUTH_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
        "cache-control": "no-store",
      },
    });
  }

  if (action !== "callback") return json({ error: "no such OAuth action" }, 404);

  const fail = (reason) =>
    new Response(null, {
      status: 302,
      headers: { location: `${returnTo}${returnTo.includes("?") ? "&" : "?"}auth=denied&reason=${encodeURIComponent(reason)}` },
    });
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookie = (request.headers.get("cookie") || "").split(";").map((s) => s.trim()).find((s) => s.startsWith(`${OAUTH_COOKIE}=`));
  const cookieState = cookie ? decodeURIComponent(cookie.slice(OAUTH_COOKIE.length + 1)) : null;

  if (!code || !state || !cookieState || state !== cookieState) return fail("state-mismatch");
  const claim = await readPayload(state, env.SESSION_SECRET);
  if (!claim || claim.provider !== provider) return fail("state-invalid");

  let identity;
  try {
    identity = await fetchIdentity(provider, code, cfg, redirectUri, fetchImpl);
  } catch (err) {
    return fail(String(err.message || err).slice(0, 120));
  }

  // Upsert the person. A password is generated because this account signs in
  // with OAuth, not with a password; it is stored hashed like any other.
  const existing = await store.get(userKey(identity.email));
  const id = existing ? existing.id : crypto.randomUUID();
  const salt = existing ? existing.salt : randomSalt();
  const passwordHash = existing ? existing.passwordHash : await hashPassword(crypto.randomUUID(), salt);
  await store.put(userKey(identity.email), {
    id,
    email: identity.email,
    salt,
    passwordHash,
    name: identity.name,
    via: identity.via,
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
  });
  const token = await signSession({ id, email: identity.email }, env.SESSION_SECRET);
  return new Response(null, {
    status: 302,
    headers: {
      location: `${claim.returnTo || returnTo}${(claim.returnTo || returnTo).includes("?") ? "&" : "?"}auth=ok`,
      "set-cookie": sessionCookie(token),
      "cache-control": "no-store",
    },
  });
}
