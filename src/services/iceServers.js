import { auth } from "./firebase";

/**
 * Where a call looks for a way through. The free public servers only tell a
 * device its own address; the relay (from /api/turn, see api/_turn.js) carries
 * the call when two networks won't connect directly, as mobile data often won't.
 * Without the relay set up, calls still work wherever a direct route exists.
 */
export const DIRECT_ONLY = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

let cached = null; // { servers, until }

export const hasRelay = (servers) => servers.some((server) => [].concat(server.urls).some((url) => /^turns?:/.test(url)));

export const loadIceServers = async () => {
  if (cached && cached.until > Date.now()) return cached.servers;
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return DIRECT_ONLY;
    const response = await fetch("/api/turn", { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return DIRECT_ONLY;
    const { iceServers, ttl } = await response.json();
    if (!Array.isArray(iceServers) || !iceServers.length) return DIRECT_ONLY;
    // Google's direct-route servers first, then Cloudflare's relay.
    const servers = [...DIRECT_ONLY, ...iceServers];
    cached = { servers, until: Date.now() + Math.max(60, (ttl || 3600) - 600) * 1000 };
    return servers;
  } catch {
    return DIRECT_ONLY;
  }
};
