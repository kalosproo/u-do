import test from "node:test";
import assert from "node:assert/strict";

import { cleanIceServers, makeHandler, verifyIdToken } from "./_turn.js";

const b64 = (data) => Buffer.from(data).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

// A real RS256 key pair, standing in for Google's.
const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const publicJwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
const now = Date.now();
const sign = async (claims, kid = "k1") => {
  const head = b64(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const body = b64(JSON.stringify(claims));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64(new Uint8Array(sig))}`;
};
const good = { aud: "u-do-0", iss: "https://securetoken.google.com/u-do-0", sub: "user1", iat: now / 1000 - 10, exp: now / 1000 + 3000 };

test("a real sign-in token for this project is accepted", async () => {
  assert.equal(await verifyIdToken(await sign(good), { projectId: "u-do-0", keys: [publicJwk], now }), "user1");
});

test("tokens for another project, expired, tampered or unsigned are refused", async () => {
  const opts = { projectId: "u-do-0", keys: [publicJwk], now };
  await assert.rejects(verifyIdToken(await sign({ ...good, aud: "other" }), opts));
  await assert.rejects(verifyIdToken(await sign({ ...good, exp: now / 1000 - 1 }), opts));
  await assert.rejects(verifyIdToken(await sign(good, "unknown"), opts));
  const token = await sign(good);
  const [h, , s] = token.split(".");
  await assert.rejects(verifyIdToken(`${h}.${b64(JSON.stringify({ ...good, sub: "someone-else" }))}.${s}`, opts));
  await assert.rejects(verifyIdToken("not-a-token", opts));
});

test("relay addresses on port 53 are dropped; old and new response shapes both work", () => {
  const servers = cleanIceServers([
    { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
    { urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:53?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], username: "u", credential: "c" },
  ]);
  assert.deepEqual(servers[0].urls, ["stun:stun.cloudflare.com:3478"]);
  assert.deepEqual(servers[1].urls, ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"]);
  assert.equal(servers[1].credential, "c");
  assert.equal(cleanIceServers({ urls: "turn:turn.cloudflare.com:3478", username: "u", credential: "c" }).length, 1);
});

const fakeRes = () => {
  const res = { headers: {}, code: 0, body: null };
  res.setHeader = (k, v) => (res.headers[k] = v);
  res.status = (code) => ((res.code = code), res);
  res.json = (body) => ((res.body = body), res);
  return res;
};
const env = { CLOUDFLARE_TURN_KEY_ID: "key1", CLOUDFLARE_TURN_API_TOKEN: "secret" };
const calls = [];
const fetchFn = async (url, init) => {
  calls.push({ url, init });
  if (url.includes("googleapis")) return { ok: true, json: async () => ({ keys: [publicJwk] }) };
  return { ok: true, status: 200, json: async () => ({ iceServers: [{ urls: ["turn:turn.cloudflare.com:3478"], username: "u", credential: "c" }] }) };
};

test("a signed-in request gets relay passwords, and the key never leaves the server", async () => {
  const res = fakeRes();
  await makeHandler({ env, fetchFn })({ method: "GET", headers: { authorization: `Bearer ${await sign(good)}` } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.iceServers[0].username, "u");
  assert.ok(!JSON.stringify(res.body).includes("secret"));
  const cf = calls.find((call) => call.url.includes("rtc.live.cloudflare.com"));
  assert.equal(cf.url, "https://rtc.live.cloudflare.com/v1/turn/keys/key1/credentials/generate-ice-servers");
  assert.equal(cf.init.headers.Authorization, "Bearer secret");
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("no sign-in, a bad token, or no relay set up are refused clearly", async () => {
  let res = fakeRes();
  await makeHandler({ env, fetchFn })({ method: "GET", headers: {} }, res);
  assert.equal(res.code, 401);
  res = fakeRes();
  await makeHandler({ env, fetchFn })({ method: "GET", headers: { authorization: "Bearer junk" } }, res);
  assert.equal(res.code, 401);
  res = fakeRes();
  await makeHandler({ env: {}, fetchFn })({ method: "GET", headers: { authorization: `Bearer ${await sign(good)}` } }, res);
  assert.equal(res.code, 503);
});

test("falls back to Cloudflare's older endpoint if the new one isn't there", async () => {
  const seen = [];
  const oldOnly = async (url) => {
    seen.push(url);
    if (url.includes("googleapis")) return { ok: true, json: async () => ({ keys: [publicJwk] }) };
    if (url.endsWith("generate-ice-servers")) return { ok: false, status: 404 };
    return { ok: true, status: 200, json: async () => ({ iceServers: { urls: ["turn:turn.cloudflare.com:3478"], username: "u", credential: "c" } }) };
  };
  const res = fakeRes();
  await makeHandler({ env, fetchFn: oldOnly })({ method: "GET", headers: { authorization: `Bearer ${await sign(good)}` } }, res);
  assert.equal(res.code, 200);
  assert.ok(seen.some((url) => url.endsWith("/credentials/generate")));
});
