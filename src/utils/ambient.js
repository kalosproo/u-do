/**
 * Focus sounds, generated in the browser — no audio files, nothing fetched.
 *
 * Each sound is a few seconds of shaped noise looped seamlessly, run through
 * filters and, for waves, a slow swell. One AudioContext for the whole app,
 * created or resumed inside a tap (iOS will not start audio any other way).
 * Changes fade over a second or so; nothing ever clicks on or off.
 */

export const SOUNDS = [
  ["off", "Off"],
  ["rain", "Rain"],
  ["waves", "Waves"],
  ["brown", "Deep"],
  ["white", "White noise"],
];

const SECONDS = 6;
const FADE = 1.2;

let ctx = null;
let master = null;
let current = null; // { kind, nodes: [] }
const buffers = {};

const audioContext = () => {
  if (ctx) return ctx;
  const Ctor = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!Ctor) return null;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  return ctx;
};

/** Call from a click or tap handler: creates or wakes the audio context. */
export const unlockAudio = () => {
  const c = audioContext();
  if (c && c.state === "suspended") c.resume().catch(() => {});
};

const noiseBuffer = (kind) => {
  if (buffers[kind]) return buffers[kind];
  const length = ctx.sampleRate * SECONDS;
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);

  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; // pink
    let last = 0; // brown
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      if (kind === "white") {
        data[i] = white * 0.35;
      } else if (kind === "brown") {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.2;
      } else {
        // Pink noise (Paul Kellet's filter): the hiss of steady rain.
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        let sample = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
        // Rain also has drops: sparse, short ticks on top of the hiss.
        if (kind === "rain" && Math.random() < 0.0009) sample += (Math.random() * 2 - 1) * 0.6;
        data[i] = sample;
      }
    }
    // Cross-fade the loop's ends so the seam is inaudible.
    const blend = Math.floor(ctx.sampleRate * 0.25);
    for (let i = 0; i < blend; i += 1) {
      const t = i / blend;
      data[i] = data[i] * t + data[length - blend + i] * (1 - t);
    }
  }
  buffers[kind] = buffer;
  return buffer;
};

const build = (kind) => {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(kind === "waves" ? "brown" : kind);
  source.loop = true;
  // Slightly different start points per sound, so it never sounds like a restart.
  const nodes = [source];
  let tail = source;

  const filter = (type, frequency, q = 0.7) => {
    const node = ctx.createBiquadFilter();
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    tail.connect(node);
    tail = node;
    nodes.push(node);
  };

  if (kind === "rain") {
    filter("highpass", 350);
    filter("lowpass", 7000);
  } else if (kind === "brown") {
    filter("lowpass", 900);
  } else if (kind === "white") {
    filter("lowpass", 9000);
  } else if (kind === "waves") {
    filter("lowpass", 1100);
    // A slow swell, roughly one wave every ten seconds.
    const swell = ctx.createGain();
    swell.gain.value = 0.55;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.1;
    const depth = ctx.createGain();
    depth.gain.value = 0.45;
    lfo.connect(depth);
    depth.connect(swell.gain);
    tail.connect(swell);
    tail = swell;
    lfo.start();
    nodes.push(swell, lfo, depth);
  }

  tail.connect(master);
  source.start(0, Math.random() * SECONDS);
  return nodes;
};

const stopNodes = (nodes, at) => {
  nodes.forEach((node) => {
    try {
      if (typeof node.stop === "function") node.stop(at);
    } catch {
      /* Already stopped. */
    }
  });
  setTimeout(() => nodes.forEach((node) => node.disconnect?.()), (at - ctx.currentTime) * 1000 + 100);
};

/** Plays `kind` at `volume` (0–1), cross-fading from whatever was playing. */
export const playAmbient = (kind, volume = 0.5) => {
  const c = audioContext();
  if (!c) return;
  if (!kind || kind === "off") {
    stopAmbient();
    return;
  }
  const now = c.currentTime;
  const level = Math.max(0, Math.min(1, volume)) * 0.9;

  if (current?.kind === kind) {
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(level, now, 0.25);
    return;
  }

  if (current) {
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(0, now, FADE / 4);
    stopNodes(current.nodes, now + FADE);
    const nodes = build(kind);
    current = { kind, nodes };
    master.gain.setTargetAtTime(level, now + FADE, FADE / 3);
    return;
  }

  current = { kind, nodes: build(kind) };
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(0, now);
  master.gain.setTargetAtTime(level, now, FADE / 3);
};

/** Fades out and stops. */
export const stopAmbient = () => {
  if (!ctx || !current) return;
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setTargetAtTime(0, now, FADE / 4);
  stopNodes(current.nodes, now + FADE);
  current = null;
};
