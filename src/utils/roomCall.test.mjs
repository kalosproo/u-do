import test from "node:test";
import assert from "node:assert/strict";

import { AWAY_MS, hostIsGone, isLive, linkIdFor, makesOffer, nextHost, nextTier, onCall, tierFor } from "./roomCall.js";

const now = 1_000_000;
const seat = (uid, joinedAt, seenAgo = 0, extra = {}) => ({ uid, joinedAt, seenAt: now - seenAgo, ...extra });

test("someone silent for the away window is gone", () => {
  assert.equal(isLive(seat("a", 1, 10_000), now), true);
  assert.equal(isLive(seat("a", 1, AWAY_MS + 1), now), false);
  assert.equal(isLive({ uid: "a" }, now), false);
});

test("the longest-staying live member hosts next", () => {
  const members = [seat("host", 1), seat("late", 30), seat("early", 10), seat("ghost", 5, AWAY_MS + 5)];
  assert.equal(nextHost(members, "host", now).uid, "early");
});

test("nobody hosts next in an empty room", () => {
  assert.equal(nextHost([seat("host", 1)], "host", now), null);
});

test("a host who left or went quiet is gone", () => {
  assert.equal(hostIsGone([seat("b", 2)], "host", now), true);
  assert.equal(hostIsGone([seat("host", 1, AWAY_MS + 1)], "host", now), true);
  assert.equal(hostIsGone([seat("host", 1, 5_000)], "host", now), false);
});

test("only live members with a device count as on the call", () => {
  const members = [seat("a", 1, 0, { session: "s1" }), seat("b", 2), seat("c", 3, AWAY_MS + 1, { session: "s3" })];
  assert.deepEqual(onCall(members, now).map((m) => m.uid), ["a"]);
});

test("a link has one name from either end, and one side offers", () => {
  assert.equal(linkIdFor("b", "a"), linkIdFor("a", "b"));
  assert.notEqual(makesOffer("a", "b"), makesOffer("b", "a"));
});

test("bandwidth picks the video step", () => {
  assert.equal(tierFor({ bitrate: 3_000_000 }), "hd");
  assert.equal(tierFor({ bitrate: 800_000 }), "sd");
  assert.equal(tierFor({ bitrate: 300_000 }), "low");
  assert.equal(tierFor({ bitrate: 100_000 }), "voice");
  assert.equal(tierFor({ bitrate: 3_000_000, loss: 0.2 }), "voice");
  assert.equal(tierFor({ bitrate: Number.NaN }), "sd");
});

test("video drops at once but climbs one step after a steady stretch", () => {
  assert.deepEqual(nextTier("hd", { bitrate: 100_000 }, 0), { tier: "voice", streak: 0 });
  let state = { tier: "voice", streak: 0 };
  const good = { bitrate: 5_000_000 };
  state = nextTier(state.tier, good, state.streak);
  state = nextTier(state.tier, good, state.streak);
  assert.equal(state.tier, "voice");
  state = nextTier(state.tier, good, state.streak);
  assert.equal(state.tier, "low");
});
