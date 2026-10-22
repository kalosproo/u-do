/**
 * Focus sounds, generated in the browser — no audio files, nothing fetched.
 *
 * Made to be lived with for an hour: nothing sharp, nothing that ticks or
 * crackles, no sudden changes. "Calm" is a slow, warm chord pad that drifts
 * between four bright, easy chords; the rest are soft, dark noise beds.
 * One AudioContext for the whole app, created or resumed inside a tap (iOS
 * will not start audio any other way). Changes fade; nothing clicks on or off.
 *
 * The chime is separate: a bell that rings for several seconds when focus
 * ends, scheduled on the audio clock so it is on time even in a background tab.
 */

export const SOUNDS = [
  ["off", "Off"],
  ["calm", "Calm"],
  ["rain", "Soft rain"],
  ["waves", "Ocean"],
  ["brown", "Deep"],
];

// Older choices map onto the gentler set.
const RENAMED = { white: "brown" };

const SECONDS = 8;
const FADE = 1.6;

let ctx = null;
let master = null;
let current = null; // { kind, nodes: [], timer }
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
      if (kind === "brown") {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.2;
      } else {
        // Pink noise (Paul Kellet's filter): steady, even rain with no drops.
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    }
    // Cross-fade the loop's ends so the seam is inaudible.
    const blend = Math.floor(ctx.sampleRate * 0.5);
    for (let i = 0; i < blend; i += 1) {
      const t = i / blend;
      data[i] = data[i] * t + data[length - blend + i] * (1 - t);
    }
  }
  buffers[kind] = buffer;
  return buffer;
};

/** A looping noise bed through a chain of filters. */
const bed = (noise, { lowpass, highpass, gain = 1, swell }) => {
  const nodes = [];
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(noise);
  source.loop = true;
  nodes.push(source);
  let tail = source;
  const add = (node) => {
    tail.connect(node);
    tail = node;
    nodes.push(node);
  };
  if (highpass) {
    const node = ctx.createBiquadFilter();
    node.type = "highpass";
    node.frequency.value = highpass;
    add(node);
  }
  const low = ctx.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = lowpass;
  low.Q.value = 0.5;
  add(low);
  const level = ctx.createGain();
  level.gain.value = gain;
  add(level);
  if (swell) {
    // A slow, shallow rise and fall, like distant waves.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = swell;
    const depth = ctx.createGain();
    depth.gain.value = gain * 0.3;
    lfo.connect(depth);
    depth.connect(level.gain);
    lfo.start();
    nodes.push(lfo, depth);
  }
  tail.connect(master);
  source.start(0, Math.random() * SECONDS);
  return nodes;
};

const midi = (note) => 440 * 2 ** ((note - 69) / 12);

// Four warm, bright chords (major 9ths and a 6/9), low and close together.
const CHORDS = [
  [48, 55, 59, 62, 64], // Cmaj9
  [45, 52, 55, 59, 60], // Am9
  [41, 48, 52, 55, 57], // Fmaj9
  [43, 50, 52, 57, 59], // G6/9
];
const CHORD_SECONDS = 9;

/** One chord: soft sines with a breath of triangle, fading in and out slowly. */
const playChord = (bus, notes, at) => {
  const nodes = [];
  for (const note of notes) {
    const voice = ctx.createGain();
    voice.gain.setValueAtTime(0, at);
    voice.gain.linearRampToValueAtTime(0.05, at + 3.5);
    voice.gain.setValueAtTime(0.05, at + CHORD_SECONDS - 1);
    voice.gain.linearRampToValueAtTime(0, at + CHORD_SECONDS + 4);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) pan.pan.value = (Math.random() - 0.5) * 0.6;
    if (pan) {
      voice.connect(pan);
      pan.connect(bus);
    } else {
      voice.connect(bus);
    }
    for (const [type, cents, level] of [["sine", -4, 1], ["sine", 4, 1], ["triangle", 0, 0.25]]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = midi(note);
      osc.detune.value = cents;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g);
      g.connect(voice);
      osc.start(at);
      osc.stop(at + CHORD_SECONDS + 4.2);
      nodes.push(osc, g);
    }
    nodes.push(voice);
    if (pan) nodes.push(pan);
  }
  // Each chord tidies itself away once it has faded.
  setTimeout(() => nodes.forEach((node) => node.disconnect?.()), (at - ctx.currentTime + CHORD_SECONDS + 5) * 1000);
};

const calm = () => {
  const bus = ctx.createGain();
  bus.gain.value = 1;
  const warmth = ctx.createBiquadFilter();
  warmth.type = "lowpass";
  warmth.frequency.value = 1500;
  warmth.Q.value = 0.3;
  bus.connect(warmth);
  warmth.connect(master);
  // A whisper of deep noise underneath, so the quiet between chords isn't empty.
  const floor = bed("brown", { lowpass: 380, gain: 0.18 });

  let index = 0;
  let next = ctx.currentTime + 0.05;
  const schedule = () => {
    // Keep the next chord or two queued on the audio clock.
    while (next < ctx.currentTime + 12) {
      playChord(bus, CHORDS[index % CHORDS.length], next);
      index += 1;
      next += CHORD_SECONDS;
    }
  };
  schedule();
  const timer = setInterval(schedule, 3000);
  return { nodes: [bus, warmth, ...floor], timer };
};

const build = (kind) => {
  if (kind === "calm") return calm();
  if (kind === "rain") return { nodes: bed("pink", { highpass: 180, lowpass: 2200, gain: 0.85 }) };
  if (kind === "waves") return { nodes: bed("brown", { lowpass: 650, gain: 0.8, swell: 0.07 }) };
  return { nodes: bed("brown", { lowpass: 480, gain: 0.9 }) };
};

const stopNodes = (sound, at) => {
  clearInterval(sound.timer);
  sound.nodes.forEach((node) => {
    try {
      if (typeof node.stop === "function") node.stop(at);
    } catch {
      /* Already stopped. */
    }
  });
  setTimeout(() => sound.nodes.forEach((node) => node.disconnect?.()), (at - ctx.currentTime) * 1000 + 100);
};

/** Plays `kind` at `volume` (0–1), cross-fading from whatever was playing. */
export const playAmbient = (choice, volume = 0.5) => {
  const c = audioContext();
  if (!c) return;
  const kind = RENAMED[choice] || choice;
  if (!kind || kind === "off" || !SOUNDS.some(([id]) => id === kind)) {
    stopAmbient();
    return;
  }
  const now = c.currentTime;
  const level = Math.max(0, Math.min(1, volume)) * 0.8;

  if (current?.kind === kind) {
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(level, now, 0.3);
    return;
  }

  if (current) {
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(0, now, FADE / 4);
    stopNodes(current, now + FADE);
    current = { kind, ...build(kind) };
    master.gain.setTargetAtTime(level, now + FADE, FADE / 3);
    return;
  }

  current = { kind, ...build(kind) };
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(0, now);
  master.gain.setTargetAtTime(level, now, FADE / 2);
};

/** Fades out and stops. */
export const stopAmbient = () => {
  if (!ctx || !current) return;
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setTargetAtTime(0, now, FADE / 4);
  stopNodes(current, now + FADE);
  current = null;
};

// ------------------------------------------------------------------ chime

/** One soft bell strike: a pure tone with a quiet overtone, ringing out. */
const bell = (out, frequency, at, peak) => {
  const nodes = [];
  for (const [ratio, level, decay] of [[1, 1, 2.6], [2, 0.22, 1.4], [3.01, 0.06, 0.8]]) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = frequency * ratio;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak * level, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    osc.connect(g);
    g.connect(out);
    osc.start(at);
    osc.stop(at + decay + 0.05);
    nodes.push(osc, g);
  }
  return nodes;
};

// "Break time": a rising C-major arpeggio, three times — about eight seconds.
const BREAK_TUNE = [[0, 79], [0.32, 84], [0.64, 88], [0.96, 91]];
// "Back to focus": a gentle falling pair, twice — about five seconds.
const FOCUS_TUNE = [[0, 88], [0.45, 84]];

/**
 * Rings the chime `inSeconds` from now, on the audio clock, so it's on time
 * even if the tab is in the background. `kind` is "break" (focus is over) or
 * "focus" (the break is). Returns a handle whose cancel() withdraws it if it
 * hasn't started — a pause or a stop — and leaves it ringing if it has.
 */
export const scheduleChime = (inSeconds, kind = "break") => {
  const c = audioContext();
  if (!c || c.state !== "running") return null;
  const out = c.createGain();
  out.gain.value = 1;
  out.connect(c.destination);
  const start = c.currentTime + Math.max(0, inSeconds);
  const [tune, repeats, gap, peak] = kind === "break" ? [BREAK_TUNE, 3, 2.6, 0.32] : [FOCUS_TUNE, 2, 2.2, 0.26];
  const nodes = [];
  for (let r = 0; r < repeats; r += 1) {
    for (const [offset, note] of tune) nodes.push(...bell(out, midi(note), start + r * gap + offset, peak));
  }
  const total = (repeats - 1) * gap + 3.5;
  const tidy = setTimeout(() => out.disconnect(), (start - c.currentTime + total) * 1000);
  return {
    cancel() {
      if (c.currentTime >= start - 0.05) return;
      clearTimeout(tidy);
      nodes.forEach((node) => {
        try {
          node.stop?.();
        } catch {
          /* Not started. */
        }
      });
      out.disconnect();
    },
  };
};
