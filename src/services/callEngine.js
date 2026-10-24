import { addDoc, deleteDoc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";

import { hasRelay, loadIceServers } from "./iceServers";
import { roomLinkDoc, roomLinkIceCollection, roomLinksCollection } from "./paths";
import { TIERS, linkIdFor, makesOffer, nextTier } from "../utils/roomCall";

/**
 * A study room call. Every device on the call connects straight to every
 * other one; Firestore only carries the hand-shake (offer, answer, network
 * candidates). Each link watches its own connection every few seconds and
 * picks a video step for it, so a friend on fast Wi-Fi gets HD while one on
 * a weak connection gets less — and voice always goes first.
 */

const CHECK_MS = 4000;
// A link that hasn't connected by now isn't going to; say so and try again.
const CONNECT_TIMEOUT_MS = 15_000;
const RETRIES = 1;

const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const VIDEO = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } };

/** One id per page load: the "device" a call link belongs to. */
export const SESSION = (() => {
  try {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  } catch {
    return Math.random().toString(36).slice(2, 22);
  }
})();

/** "host", "srflx" or "relay" — what kind of route a candidate offers. */
const typeOf = (candidate) => /\btyp (\w+)/.exec(candidate || "")?.[1] || null;

/** Why a link didn't connect, in words, from what each side found. */
const reasonFor = (peer, relay) => {
  if (!relay) return "Your two networks won't connect directly (common on mobile data), and the relay isn't switched on yet.";
  if (!peer.remoteTypes.size) return "No answer from their device — they may have lost connection.";
  if (!peer.localTypes.has("relay")) return "Couldn't reach the relay from this network. Try Wi-Fi.";
  return "Couldn't connect. Check both internet connections and try again.";
};

const qualityOf = (height) => (height >= 600 ? "HD" : height >= 300 ? "SD" : height > 0 ? "Low" : null);

const deleteLink = async (roomId, linkId) => {
  // Only what's there: a delete the rules refuse can hold up the writes after it.
  const link = await getDoc(roomLinkDoc(roomId, linkId)).catch(() => null);
  if (!link?.exists()) return;
  const ice = await getDocs(roomLinkIceCollection(roomId, linkId)).catch(() => null);
  await Promise.all((ice?.docs || []).map((item) => deleteDoc(item.ref).catch(() => {})));
  await deleteDoc(roomLinkDoc(roomId, linkId)).catch(() => {});
};

export class CallEngine {
  constructor({ roomId, uid, onChange }) {
    this.roomId = roomId;
    this.uid = uid;
    this.onChange = onChange;
    this.audio = null;
    this.video = null;
    // The self-view: one stream object per camera start, so the picture doesn't reload.
    this.preview = null;
    this.peers = new Map();
    this.closed = false;
    this.wanted = [];
    this.iceServers = null;
    this.timer = setInterval(() => this.checkQuality(), CHECK_MS);
    // Links wait for the relay passwords, then connect.
    loadIceServers().then((servers) => {
      this.iceServers = servers;
      this.sync(this.wanted);
    });
  }

  /** What the UI shows: my own tracks, and each other device's stream and state. */
  snapshot() {
    return {
      local: { audio: Boolean(this.audio), video: this.preview },
      peers: [...this.peers.values()].map((peer) => ({
        uid: peer.uid,
        session: peer.session,
        stream: peer.stream,
        status: peer.status,
        reason: peer.status === "failed" ? peer.reason : null,
        sending: TIERS[peer.tier].label,
        receiving: peer.receiving,
      })),
    };
  }

  emit() {
    if (!this.closed) this.onChange?.(this.snapshot());
  }

  // ---------------------------------------------------------------- my media

  async setMic(on) {
    if (on && !this.audio) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO });
      this.audio = stream.getAudioTracks()[0];
    } else if (!on && this.audio) {
      // Stopped, not just muted, so the mic light goes off too.
      this.audio.stop();
      this.audio = null;
    }
    await this.applyTracks();
  }

  async setCam(on) {
    if (on && !this.video) {
      const stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO });
      this.video = stream.getVideoTracks()[0];
      this.video.contentHint = "motion";
      this.preview = new MediaStream([this.video]);
    } else if (!on && this.video) {
      this.video.stop();
      this.video = null;
      this.preview = null;
    }
    await this.applyTracks();
  }

  async applyTracks() {
    await Promise.all(
      [...this.peers.values()].map(async (peer) => {
        await peer.audioSender?.replaceTrack(this.audio).catch(() => {});
        await peer.videoSender?.replaceTrack(this.video).catch(() => {});
      })
    );
    this.emit();
  }

  // ---------------------------------------------------------------- links

  /** Matches the open links to whoever else is on the call right now. */
  sync(others) {
    this.wanted = others;
    if (this.closed || !this.iceServers) return;
    const wanted = new Map(others.map((member) => [linkIdFor(SESSION, member.session), member]));
    for (const [linkId, peer] of this.peers) {
      if (!wanted.has(linkId)) this.drop(linkId, peer, true);
    }
    for (const [linkId, member] of wanted) {
      if (!this.peers.has(linkId)) this.connect(linkId, member, 0);
    }
  }

  connect(linkId, member, attempt) {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const peer = {
      pc,
      uid: member.uid,
      session: member.session,
      offerer: makesOffer(SESSION, member.session),
      stream: new MediaStream(),
      status: "connecting",
      tier: "sd",
      streak: 0,
      receiving: null,
      attempt,
      pending: [],
      // Candidates found before the link exists wait here, or the rules would refuse them.
      outbox: [],
      linkReady: false,
      offerSdp: null,
      stops: [],
      // Which kinds of route each side found, to explain a failure.
      localTypes: new Set(),
      remoteTypes: new Set(),
      reason: null,
    };
    this.peers.set(linkId, peer);
    peer.deadline = setTimeout(() => {
      if (peer.status === "connected" || this.peers.get(linkId) !== peer) return;
      if (peer.offerer) this.retry(linkId, peer);
      else this.fail(peer, "timed out");
    }, CONNECT_TIMEOUT_MS);

    pc.ontrack = (event) => {
      peer.stream.addTrack(event.track);
      // A fresh MediaStream object makes <video> and <audio> pick it up again.
      peer.stream = new MediaStream(peer.stream.getTracks());
      this.emit();
    };
    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      const type = typeOf(event.candidate.candidate);
      if (type) peer.localTypes.add(type);
      peer.outbox.push(JSON.stringify(event.candidate.toJSON()));
      this.sendIce(linkId, peer);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        peer.status = "connected";
        this.prioritise(peer);
      } else if (pc.connectionState === "failed") {
        // The offering side starts over; the answering side waits for its new offer.
        if (peer.offerer) {
          this.retry(linkId, peer);
          return;
        }
        peer.status = "failed";
        peer.reason = reasonFor(peer, hasRelay(this.iceServers || []));
      }
      this.emit();
    };

    if (peer.offerer) this.offer(linkId, peer, member);
    else this.awaitOffer(linkId, peer);
    this.emit();
  }

  async offer(linkId, peer, member) {
    const { pc } = peer;
    peer.audioSender = pc.addTransceiver("audio", { direction: "sendrecv" }).sender;
    peer.videoSender = pc.addTransceiver("video", { direction: "sendrecv" }).sender;
    await peer.audioSender.replaceTrack(this.audio);
    await peer.videoSender.replaceTrack(this.video);
    try {
      // A retry starts from a clean link; a first try has nothing to clear.
      if (peer.attempt > 0) await deleteLink(this.roomId, linkId);
      peer.step = "offer";
      await pc.setLocalDescription(await pc.createOffer());
      peer.step = "write offer";
      await setDoc(roomLinkDoc(this.roomId, linkId), {
        users: [this.uid, member.uid],
        sessions: [SESSION, member.session],
        offer: { type: "offer", sdp: pc.localDescription.sdp },
        answer: null,
        createdAt: serverTimestamp(),
      });
      peer.linkReady = true;
      this.sendIce(linkId, peer);
    } catch (error) {
      this.fail(peer, error);
      return;
    }
    peer.stops.push(
      onSnapshot(roomLinkDoc(this.roomId, linkId), async (snap) => {
        const answer = snap.data()?.answer;
        if (!answer || pc.currentRemoteDescription || pc.signalingState !== "have-local-offer") return;
        await pc.setRemoteDescription(answer).catch((error) => this.fail(peer, error));
        this.flushIce(peer);
      }, () => {})
    );
    this.listenIce(linkId, peer);
  }

  awaitOffer(linkId, peer) {
    const { pc } = peer;
    peer.stops.push(
      onSnapshot(roomLinkDoc(this.roomId, linkId), async (snap) => {
        const offer = snap.data()?.offer;
        if (!offer || peer.offerSdp === offer.sdp) return;
        if (peer.offerSdp) {
          // The other side started over: so do we.
          this.drop(linkId, peer, false);
          this.connect(linkId, { uid: peer.uid, session: peer.session }, peer.attempt + 1);
          return;
        }
        peer.offerSdp = offer.sdp;
        // The link exists: anything found from here on can be sent at once.
        peer.linkReady = true;
        try {
          peer.step = "read offer";
          await pc.setRemoteDescription(offer);
          for (const transceiver of pc.getTransceivers()) {
            transceiver.direction = "sendrecv";
            if (transceiver.receiver.track.kind === "audio") peer.audioSender = transceiver.sender;
            else peer.videoSender = transceiver.sender;
          }
          await peer.audioSender?.replaceTrack(this.audio);
          await peer.videoSender?.replaceTrack(this.video);
          await pc.setLocalDescription(await pc.createAnswer());
          peer.step = "write answer";
          await updateDoc(roomLinkDoc(this.roomId, linkId), { answer: { type: "answer", sdp: pc.localDescription.sdp } });
          // The link exists now, so its candidates can be read.
          this.listenIce(linkId, peer);
        } catch (error) {
          this.fail(peer, error);
        }
      }, () => {})
    );
  }

  sendIce(linkId, peer) {
    if (!peer.linkReady) return;
    for (const c of peer.outbox.splice(0)) {
      addDoc(roomLinkIceCollection(this.roomId, linkId), { from: SESSION, c, at: serverTimestamp() }).catch(() => {});
    }
  }

  listenIce(linkId, peer) {
    peer.stops.push(
      onSnapshot(query(roomLinkIceCollection(this.roomId, linkId), where("from", "==", peer.session)), (snap) => {
        for (const change of snap.docChanges()) {
          if (change.type !== "added") continue;
          try {
            const candidate = JSON.parse(change.doc.data().c);
            const type = typeOf(candidate.candidate);
            if (type) peer.remoteTypes.add(type);
            peer.pending.push(candidate);
          } catch {
            /* A malformed candidate is just skipped. */
          }
        }
        this.flushIce(peer);
      }, () => {})
    );
  }

  flushIce(peer) {
    if (!peer.pc.remoteDescription) return;
    for (const candidate of peer.pending.splice(0)) peer.pc.addIceCandidate(candidate).catch(() => {});
  }

  /** Voice first: if the network has to choose, it keeps the audio. */
  async prioritise(peer) {
    for (const [sender, level] of [[peer.audioSender, "high"], [peer.videoSender, "low"]]) {
      if (!sender) continue;
      const params = sender.getParameters();
      if (!params.encodings?.length) params.encodings = [{}];
      params.encodings[0].priority = level;
      params.encodings[0].networkPriority = level;
      if (sender === peer.videoSender) params.degradationPreference = "balanced";
      await sender.setParameters(params).catch(() => {});
    }
    await this.applyTier(peer);
  }

  async applyTier(peer) {
    const sender = peer.videoSender;
    if (!sender) return;
    const step = TIERS[peer.tier];
    const params = sender.getParameters();
    if (!params.encodings?.length) params.encodings = [{}];
    Object.assign(params.encodings[0], {
      active: step.active,
      scaleResolutionDownBy: step.scaleResolutionDownBy,
      maxFramerate: step.maxFramerate,
      ...(step.maxBitrate ? { maxBitrate: step.maxBitrate } : {}),
    });
    await sender.setParameters(params).catch(() => {});
  }

  /** Every few seconds: how much can each link carry, and what is arriving. */
  async checkQuality() {
    for (const peer of this.peers.values()) {
      if (peer.status !== "connected") continue;
      const stats = await peer.pc.getStats().catch(() => null);
      if (!stats) continue;
      let bitrate = Number.NaN;
      let loss = 0;
      let height = 0;
      stats.forEach((report) => {
        if (report.type === "candidate-pair" && report.nominated && report.state === "succeeded") {
          bitrate = report.availableOutgoingBitrate ?? bitrate;
        }
        if (report.type === "remote-inbound-rtp" && report.kind === "video" && Number.isFinite(report.fractionLost)) {
          loss = Math.max(loss, report.fractionLost);
        }
        if (report.type === "inbound-rtp" && report.kind === "video" && report.frameHeight) height = report.frameHeight;
      });
      const next = nextTier(peer.tier, { bitrate, loss }, peer.streak);
      peer.streak = next.streak;
      peer.receiving = qualityOf(height);
      if (next.tier !== peer.tier) {
        peer.tier = next.tier;
        await this.applyTier(peer);
      }
    }
    this.emit();
  }

  retry(linkId, peer) {
    this.drop(linkId, peer, true);
    if (peer.attempt + 1 > RETRIES) {
      // Gave up: keep a placeholder so the UI can say why there's no video.
      this.peers.set(linkId, { ...peer, pc: null, status: "failed", stops: [], reason: reasonFor(peer, hasRelay(this.iceServers)) });
      this.emit();
      return;
    }
    setTimeout(() => {
      if (!this.closed && !this.peers.has(linkId)) this.connect(linkId, { uid: peer.uid, session: peer.session }, peer.attempt + 1);
    }, 1500);
  }

  fail(peer, error) {
    if (import.meta.env?.DEV) console.warn("call link failed at", peer.step, peer.offerer ? "offerer" : "answerer", String(error).slice(0, 60));
    peer.status = "failed";
    peer.reason = reasonFor(peer, hasRelay(this.iceServers || []));
    this.emit();
  }

  /** "Try again": forget the links that gave up and connect them afresh. */
  reconnect() {
    for (const [linkId, peer] of [...this.peers]) {
      if (peer.status === "failed") this.drop(linkId, peer, true);
    }
    this.sync(this.wanted);
  }

  drop(linkId, peer, clean) {
    clearTimeout(peer.deadline);
    peer.stops.forEach((stop) => stop());
    peer.pc?.close();
    this.peers.delete(linkId);
    if (clean) deleteLink(this.roomId, linkId);
    this.emit();
  }

  /** Hangs up: every link closed and cleaned away, camera and mic released. */
  close() {
    for (const [linkId, peer] of [...this.peers]) this.drop(linkId, peer, true);
    this.audio?.stop();
    this.video?.stop();
    this.audio = null;
    this.video = null;
    this.preview = null;
    clearInterval(this.timer);
    this.closed = true;
  }
}

/** Old links this person left behind, e.g. after their tab crashed. */
export const sweepMyLinks = async (roomId, uid, liveSessions) => {
  const snap = await getDocs(query(roomLinksCollection(roomId), where("users", "array-contains", uid))).catch(() => null);
  await Promise.all(
    (snap?.docs || [])
      .filter((link) => !(link.data().sessions || []).every((session) => liveSessions.has(session)))
      .map((link) => deleteLink(roomId, link.id))
  );
};
