/**
 * The decisions behind a study room call, kept pure so they can be tested:
 * who is still here, who hosts next, which device calls which, and how much
 * video each link can carry right now.
 */

/** How often everyone in a room checks in. */
export const HEARTBEAT_MS = 30_000;

/** Silent this long and you count as gone. Mirrors the 90s in the rules. */
export const AWAY_MS = 90_000;

/** Video and voice go device to device, so every extra person costs everyone. */
export const MAX_ON_CALL = 4;

export const isLive = (member, now = Date.now()) => Boolean(member?.seenAt) && now - member.seenAt < AWAY_MS;

/**
 * Who takes over when the host leaves or goes quiet: whoever has been in the
 * room longest and is still here. Everyone works this out the same way, so
 * only one person ever tries.
 */
export const nextHost = (members, host, now = Date.now()) =>
  members
    .filter((member) => member.uid !== host && isLive(member, now))
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) || a.uid.localeCompare(b.uid))[0] || null;

/** Whether the host has left or stopped checking in. */
export const hostIsGone = (members, host, now = Date.now()) => {
  const seat = members.find((member) => member.uid === host);
  return !seat || !isLive(seat, now);
};

/** The people on the call: in the room, live, with a device on the call. */
export const onCall = (members, now = Date.now()) => members.filter((member) => member.session && isLive(member, now));

/** One link per pair of devices, named the same from either end. */
export const linkIdFor = (a, b) => (a < b ? `${a}__${b}` : `${b}__${a}`);

/** The device with the smaller id makes the offer; the other answers. */
export const makesOffer = (mine, theirs) => mine < theirs;

/**
 * Video steps, best first. Voice is never in here: it always goes at full
 * quality, and video only uses what is left over.
 */
export const TIERS = {
  hd: { label: "HD", active: true, maxBitrate: 1_200_000, scaleResolutionDownBy: 1, maxFramerate: 30 },
  sd: { label: "SD", active: true, maxBitrate: 500_000, scaleResolutionDownBy: 2, maxFramerate: 24 },
  low: { label: "Low", active: true, maxBitrate: 150_000, scaleResolutionDownBy: 4, maxFramerate: 15 },
  voice: { label: "Voice only", active: false, maxBitrate: 0, scaleResolutionDownBy: 4, maxFramerate: 10 },
};

const ORDER = ["voice", "low", "sd", "hd"];

/** The best step this much bandwidth and loss can carry. */
export const tierFor = ({ bitrate, loss = 0 }) => {
  if (!Number.isFinite(bitrate)) return "sd";
  if (loss > 0.15 || bitrate < 150_000) return "voice";
  if (bitrate < 500_000 || loss > 0.08) return "low";
  if (bitrate < 1_200_000 || loss > 0.03) return "sd";
  return "hd";
};

/**
 * Drops at once when the link gets worse; climbs one step at a time, and only
 * after it has looked better for `patience` checks in a row, so video doesn't
 * flicker between steps.
 */
export const nextTier = (current, reading, streak, patience = 3) => {
  const target = tierFor(reading);
  const from = ORDER.indexOf(current);
  const to = ORDER.indexOf(target);
  if (to < from) return { tier: target, streak: 0 };
  if (to === from) return { tier: current, streak: 0 };
  if (streak + 1 >= patience) return { tier: ORDER[from + 1], streak: 0 };
  return { tier: current, streak: streak + 1 };
};
