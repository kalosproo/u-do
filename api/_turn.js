/**
 * Relay passwords for study room calls.
 *
 * When two devices can't reach each other directly (mobile data, strict
 * office Wi-Fi), the call goes through Cloudflare's relay instead. The relay
 * key stays here on the server; a signed-in person gets short-lived
 * passwords made from it, never the key itself.
 */

import { webcrypto } from "node:crypto";

const subtle = webcrypto.subtle;
const GOOGLE_KEYS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const CLOUDFLARE = "https://rtc.live.cloudflare.com/v1/turn/keys";

/** How long a set of relay passwords works. */
export const TTL_SECONDS = 4 * 60 * 60;

const base64url = (text) => Buffer.from(text.replace(/-/g, "+").replace(/_/g, "/"), "base64");

let keyCache = { at: 0, keys: [] };

const googleKeys = async (fetchFn) => {
  if (Date.now() - keyCache.at < 60 * 60_000 && keyCache.keys.length) return keyCache.keys;
  const response = await fetchFn(GOOGLE_KEYS);
  if (!response.ok) throw new Error("Couldn't load Google's signing keys");
  keyCache = { at: Date.now(), keys: (await response.json()).keys || [] };
  return keyCache.keys;
};

/**
 * Checks a Firebase sign-in token the way Firebase's own servers do: signed
 * by Google, for this project, not expired. Returns the user's id, or throws.
 */
export const verifyIdToken = async (token, { projectId, keys, now = Date.now() }) => {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Not a token");
  const [head, body, signature] = parts;
  const header = JSON.parse(base64url(head).toString("utf8"));
  const claims = JSON.parse(base64url(body).toString("utf8"));
  if (header.alg !== "RS256") throw new Error("Wrong algorithm");
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error("Unknown signing key");
  const key = await subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await subtle.verify("RSASSA-PKCS1-v1_5", key, base64url(signature), new TextEncoder().encode(`${head}.${body}`));
  if (!valid) throw new Error("Bad signature");
  const seconds = now / 1000;
  if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`) throw new Error("Wrong project");
  if (!(claims.exp > seconds) || !(claims.iat <= seconds + 300)) throw new Error("Expired");
  if (typeof claims.sub !== "string" || !claims.sub) throw new Error("No user");
  return claims.sub;
};

/** Cloudflare's answer, in the shape RTCPeerConnection takes, minus port 53, which browsers block. */
export const cleanIceServers = (raw) =>
  (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .map((server) => ({
      ...server,
      urls: (Array.isArray(server.urls) ? server.urls : [server.urls]).filter((url) => typeof url === "string" && !/:53(\?|$)/.test(url)),
    }))
    .filter((server) => server.urls.length);

const relayServers = async (fetchFn, keyId, token) => {
  const ask = (path) =>
    fetchFn(`${CLOUDFLARE}/${encodeURIComponent(keyId)}/credentials/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: TTL_SECONDS }),
    });
  // The current endpoint, then the older one it replaced.
  let response = await ask("generate-ice-servers");
  if (response.status === 404) response = await ask("generate");
  if (!response.ok) throw new Error(`Cloudflare said ${response.status}`);
  return cleanIceServers((await response.json()).iceServers);
};

/** Builds the request handler; the pieces are passed in so tests can stand in for them. */
export const makeHandler = ({ env = process.env, fetchFn = fetch, verify = verifyIdToken } = {}) =>
  async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") {
      res.status(405).json({ error: "Use GET" });
      return;
    }
    const keyId = env.CLOUDFLARE_TURN_KEY_ID;
    const apiToken = env.CLOUDFLARE_TURN_API_TOKEN;
    if (!keyId || !apiToken) {
      // Not set up yet: the app falls back to direct connections only.
      res.status(503).json({ error: "Relay not configured" });
      return;
    }
    const auth = String(req.headers?.authorization || "");
    if (!auth.startsWith("Bearer ")) {
      res.status(401).json({ error: "Sign in first" });
      return;
    }
    try {
      const projectId = env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID || "u-do-0";
      await verify(auth.slice(7), { projectId, keys: await googleKeys(fetchFn) });
    } catch {
      res.status(401).json({ error: "Sign in again" });
      return;
    }
    try {
      res.status(200).json({ iceServers: await relayServers(fetchFn, keyId, apiToken), ttl: TTL_SECONDS });
    } catch {
      res.status(502).json({ error: "Relay unavailable" });
    }
  };
