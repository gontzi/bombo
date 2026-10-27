/**
 * Background music for the hall, synthesised with Web Audio (no files): a
 * slow brushed-swing lounge trio, the sort of band that plays in the corner
 * of an old bingo hall. Electric piano comping, walking upright bass, brushes
 * and ride, and now and then a vibraphone phrase. Everything is generated
 * bar by bar from a small set of changes, so it never loops audibly.
 *
 * A look-ahead scheduler queues notes slightly ahead of the audio clock; the
 * timer only decides *when to schedule*, the audio clock decides when notes
 * actually sound, so timing stays tight even if the main thread is busy.
 */

import { audioContext } from './sounds';

const BPM = 74;
const BEAT = 60 / BPM;
/** Swung eighths: the off-beat lands two thirds into the beat. */
const SWING = 0.64;
const VOLUME = 0.2;
/** How much the band backs off while a ball is being drawn. */
const DUCKED = 0.45;
const LOOKAHEAD = 0.25;
const TICK_MS = 50;

interface Chord {
  /** Bass root, MIDI. */
  root: number;
  /** Rootless piano voicing, MIDI. */
  voicing: number[];
  /** Notes that sound good on top, MIDI (any octave). */
  colour: number[];
}

// MIDI note numbers in F major: warm, a little old-fashioned.
const F = 41, D = 38, G = 43, C = 36, BB = 46, A = 45, E = 40;
const CHORDS: Record<string, Chord> = {
  Fmaj9: { root: F, voicing: [57, 60, 64, 67], colour: [65, 69, 72, 76, 79] },
  Dm9: { root: D, voicing: [53, 57, 60, 64], colour: [62, 65, 69, 72, 76] },
  Gm9: { root: G, voicing: [58, 62, 65, 69], colour: [67, 70, 74, 77, 69] },
  C13: { root: C, voicing: [58, 64, 69, 62], colour: [67, 70, 72, 76, 69] },
  Bbmaj9: { root: BB, voicing: [57, 60, 62, 65], colour: [65, 69, 70, 72, 74] },
  Am7: { root: A, voicing: [55, 60, 64, 67], colour: [64, 67, 69, 72, 76] },
  E7alt: { root: E, voicing: [56, 62, 67, 60], colour: [68, 71, 74, 76] },
};

/** AABA, eight bars per section. */
const SECTIONS: string[][] = [
  ['Fmaj9', 'Dm9', 'Gm9', 'C13', 'Fmaj9', 'Dm9', 'Gm9', 'C13'],
  ['Bbmaj9', 'Bbmaj9', 'Am7', 'Dm9', 'Gm9', 'Gm9', 'E7alt', 'C13'],
];
const FORM = [0, 0, 1, 0];

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]!;

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let piano: GainNode | null = null;
let noise: AudioBuffer | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let nextBar = 0;
let bar = 0;
let playing = false;
let ducked = false;
/** Bars the vibraphone still has to play in its current phrase (negative: resting). */
let phrase = -4;
let lastMelody = 72;

function impulse(c: AudioContext, seconds: number): AudioBuffer {
  const n = Math.floor(c.sampleRate * seconds);
  const buffer = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
  }
  return buffer;
}

/** Builds the band's mixing desk once: warm low-pass, a small room, piano tremolo. */
function desk(): boolean {
  if (out) return true;
  ctx = audioContext();
  if (!ctx) return false;
  const c = ctx;

  out = c.createGain();
  out.gain.value = 0;
  const warm = c.createBiquadFilter();
  warm.type = 'lowpass';
  warm.frequency.value = 5200;
  warm.Q.value = 0.5;
  const dry = c.createGain();
  dry.gain.value = 0.8;
  const room = c.createConvolver();
  room.buffer = impulse(c, 2.2);
  const wet = c.createGain();
  wet.gain.value = 0.3;
  out.connect(warm);
  warm.connect(dry).connect(c.destination);
  warm.connect(room).connect(wet).connect(c.destination);

  // Electric piano tremolo: the amp's slow wobble.
  piano = c.createGain();
  piano.gain.value = 0.85;
  const lfo = c.createOscillator();
  lfo.frequency.value = 4.6;
  const depth = c.createGain();
  depth.gain.value = 0.12;
  lfo.connect(depth).connect(piano.gain);
  lfo.start();
  piano.connect(out);

  const length = c.sampleRate;
  noise = c.createBuffer(1, length, c.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return true;
}

/** Envelope helper: quick attack, exponential fall to silence. */
function envelope(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setTargetAtTime(0.0001, t + attack, decay / 4);
}

/** Electric piano: two-operator FM, the bell of the tine fading into a round tone. */
function rhodes(midi: number, t: number, length: number, velocity: number) {
  const c = ctx!;
  const f = hz(midi);
  const carrier = c.createOscillator();
  carrier.frequency.value = f;
  const mod = c.createOscillator();
  mod.frequency.value = f;
  const index = c.createGain();
  index.gain.setValueAtTime(f * 1.6 * velocity, t);
  index.gain.setTargetAtTime(f * 0.15, t, 0.12);
  mod.connect(index).connect(carrier.frequency);
  const g = c.createGain();
  envelope(g, t, 0.07 * velocity, 0.006, length * 2.4);
  g.gain.setTargetAtTime(0.0001, t + length, 0.12);
  const pan = c.createStereoPanner();
  pan.pan.value = (midi - 62) / 24;
  carrier.connect(g).connect(pan).connect(piano!);
  const end = t + length + 0.8;
  carrier.start(t);
  mod.start(t);
  carrier.stop(end);
  mod.stop(end);
}

/** Upright bass: a soft sawtooth through a closing low-pass, plucked. */
function bass(midi: number, t: number, length: number, velocity: number) {
  const c = ctx!;
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = hz(midi);
  const sub = c.createOscillator();
  sub.frequency.value = hz(midi);
  const tone = c.createBiquadFilter();
  tone.type = 'lowpass';
  tone.Q.value = 2;
  tone.frequency.setValueAtTime(900, t);
  tone.frequency.setTargetAtTime(220, t, 0.06);
  const g = c.createGain();
  envelope(g, t, 0.2 * velocity, 0.008, length * 2.2);
  g.gain.setTargetAtTime(0.0001, t + length * 0.92, 0.04);
  osc.connect(tone);
  sub.connect(tone);
  tone.connect(g).connect(out!);
  const end = t + length + 0.3;
  osc.start(t);
  sub.start(t);
  osc.stop(end);
  sub.stop(end);
}

/** Vibraphone: a pure bar with its fourth-harmonic shimmer and motor vibrato. */
function vibes(midi: number, t: number, velocity: number) {
  const c = ctx!;
  const f = hz(midi);
  const g = c.createGain();
  envelope(g, t, 0.06 * velocity, 0.004, 2.2);
  const motor = c.createOscillator();
  motor.frequency.value = 5.5;
  const motorDepth = c.createGain();
  motorDepth.gain.value = 0.25;
  const trem = c.createGain();
  trem.gain.value = 0.75;
  motor.connect(motorDepth).connect(trem.gain);
  const pan = c.createStereoPanner();
  pan.pan.value = 0.3;
  g.connect(trem).connect(pan).connect(out!);
  const end = t + 2.6;
  for (const [ratio, level] of [[1, 1], [4, 0.18], [10, 0.04]] as const) {
    const osc = c.createOscillator();
    osc.frequency.value = f * ratio;
    const partial = c.createGain();
    partial.gain.value = level;
    osc.connect(partial).connect(g);
    osc.start(t);
    osc.stop(end);
  }
  motor.start(t);
  motor.stop(end);
}

/** Brushes and ride: band-passed noise, shaped differently for each stroke. */
function brush(t: number, kind: 'sweep' | 'tap' | 'ride', velocity: number) {
  const c = ctx!;
  const source = c.createBufferSource();
  source.buffer = noise;
  const filter = c.createBiquadFilter();
  const g = c.createGain();
  const pan = c.createStereoPanner();
  let length: number;
  if (kind === 'sweep') {
    // The circular brush stroke on the snare, swelling into the beat.
    filter.type = 'bandpass';
    filter.frequency.value = 2600;
    filter.Q.value = 0.6;
    length = BEAT * 0.9;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.03 * velocity, t + length * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + length);
    pan.pan.value = -0.25;
  } else if (kind === 'tap') {
    // Brush slap on 2 and 4.
    filter.type = 'bandpass';
    filter.frequency.value = 3400;
    filter.Q.value = 0.9;
    length = 0.22;
    envelope(g, t, 0.07 * velocity, 0.003, 0.18);
    pan.pan.value = -0.2;
  } else {
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    length = 0.7;
    envelope(g, t, 0.022 * velocity, 0.002, 0.6);
    pan.pan.value = 0.35;
  }
  source.connect(filter).connect(g).connect(pan).connect(out!);
  source.start(t, Math.random() * 0.5, length + 0.05);
}

/** Start time of eighth note `n` (0–7) in a bar starting at `t`. */
const eighth = (t: number, n: number) => t + BEAT * (Math.floor(n / 2) + (n % 2 ? SWING : 0));
/** A human hand is never exactly on the grid. */
const loose = (t: number) => t + (Math.random() - 0.5) * 0.012;

function nearest(target: number, pitchClasses: readonly number[]): number {
  let best = target;
  let bestDistance = Infinity;
  for (const pc of pitchClasses) {
    for (let octave = -2; octave <= 2; octave++) {
      const midi = (pc % 12) + 12 * (Math.floor(target / 12) + octave);
      const distance = Math.abs(midi - target);
      if (distance < bestDistance) {
        best = midi;
        bestDistance = distance;
      }
    }
  }
  return best;
}

function scheduleBar(t: number, index: number) {
  const section = SECTIONS[FORM[Math.floor(index / 8) % FORM.length]!]!;
  const chord = CHORDS[section[index % 8]!]!;
  const nextSection = SECTIONS[FORM[Math.floor((index + 1) / 8) % FORM.length]!]!;
  const next = CHORDS[nextSection[(index + 1) % 8]!]!;

  // Walking bass: root, chord tones, then a half step into the next root.
  const tones = [chord.root, chord.root + 7, chord.root + (chord.voicing.includes(chord.root + 15) ? 3 : 4), chord.root + 12];
  const walk = [chord.root, pick(tones.slice(1)), pick(tones), next.root + pick([-1, 1])];
  walk.forEach((note, beat) => bass(note, loose(t + beat * BEAT), BEAT * 0.95, beat === 0 ? 1 : 0.85));

  // Piano comping: a Charleston-ish figure, varied so it doesn't repeat.
  const rhythms = [[0, 3], [0], [1, 4], [0, 5], [3, 6], [2]];
  const hits = index % 8 === 7 ? [0] : pick(rhythms);
  for (const n of hits) {
    const at = eighth(t, n);
    const velocity = 0.65 + Math.random() * 0.3;
    chord.voicing.forEach((note, i) => rhodes(note, at + i * 0.012, n === 0 ? BEAT * 1.6 : BEAT * 0.7, velocity));
  }

  // Ride: ding, ding-a ding, ding-a.
  for (const n of [0, 2, 3, 4, 6, 7]) brush(loose(eighth(t, n)), 'ride', n % 2 ? 0.6 : 1);
  // Brushes: sweeps on 1 and 3, slaps on 2 and 4.
  brush(t, 'sweep', 1);
  brush(t + 2 * BEAT, 'sweep', 0.9);
  brush(loose(t + BEAT), 'tap', 0.9);
  brush(loose(t + 3 * BEAT), 'tap', 1);

  // Vibraphone: two-bar phrases with rests between, stepping around the chord.
  if (phrase > 0) {
    const slots = [0, 1, 2, 3, 4, 5, 6, 7].filter(() => Math.random() < 0.38);
    for (const n of slots) {
      lastMelody = nearest(lastMelody + pick([-4, -2, -1, 1, 2, 3, 5]), chord.colour);
      lastMelody = Math.min(84, Math.max(67, lastMelody));
      vibes(lastMelody, loose(eighth(t, n)), 0.7 + Math.random() * 0.3);
    }
    phrase--;
    if (phrase === 0) phrase = -(2 + Math.floor(Math.random() * 3));
  } else if (++phrase === 0) {
    phrase = 2;
  }
}

function tick() {
  if (!ctx) return;
  // If the tab was throttled and fell behind, rejoin the clock instead of rushing to catch up.
  if (nextBar < ctx.currentTime) nextBar = ctx.currentTime + 0.05;
  while (nextBar < ctx.currentTime + LOOKAHEAD) {
    scheduleBar(nextBar, bar++);
    nextBar += BEAT * 4;
  }
}

function level(seconds: number) {
  if (!ctx || !out) return;
  const target = playing ? VOLUME * (ducked ? DUCKED : 1) : 0.0001;
  const now = ctx.currentTime;
  out.gain.cancelScheduledValues(now);
  out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), now);
  out.gain.linearRampToValueAtTime(target, now + seconds);
}

/** Starts the band. Must first be called from a user gesture so the context can run. */
export function startMusic(): void {
  if (!desk() || !ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  if (playing) return;
  playing = true;
  if (timer === undefined) {
    nextBar = ctx.currentTime + 0.1;
    timer = setInterval(tick, TICK_MS);
    tick();
  }
  level(3);
}

/** Fades the band out and stops scheduling once it is silent. */
export function stopMusic(): void {
  if (!playing) return;
  playing = false;
  level(0.8);
  const stopping = timer;
  setTimeout(() => {
    if (playing || timer !== stopping) return;
    clearInterval(timer);
    timer = undefined;
  }, 900);
}

/** Lowers the band while the machine has the floor. */
export function duckMusic(on: boolean): void {
  if (ducked === on) return;
  ducked = on;
  if (playing) level(on ? 0.4 : 2);
}
