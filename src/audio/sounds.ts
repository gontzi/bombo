/**
 * Machine sounds synthesised with Web Audio (no files). Impacts use modal
 * synthesis: a hard object rings at a few inharmonic partials that die away
 * within milliseconds, plus a very short contact transient. Each collision
 * from the ball simulation triggers its own hit, so what you hear follows
 * what the balls actually do. Nothing plays until unlockAudio() runs from a click.
 */

import type { Impact, ImpactKind } from '../scene/bingo/ballSim';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
const banks: Partial<Record<ImpactKind | 'tray' | 'button', AudioBuffer[]>> = {};

const VOLUME = 0.55;
/** Simultaneous hits at most, and the minimum spacing between them. */
const MAX_VOICES = 20;
const MIN_GAP_MS = 3;
const VARIANTS = 8;

interface Mode {
  /** Frequency ratio to the fundamental. */
  ratio: number;
  gain: number;
  /** Decay time constant, seconds. */
  decay: number;
}

interface Body {
  fundamental: [number, number];
  modes: Mode[];
  /** Contact transient: duration (s) and level. */
  click: [number, number];
  length: number;
}

/**
 * Bodies measured by ear against real bingo balls: hard phenolic plastic
 * gives a bright, very short "tock"; a ball on the brass wire adds a thin
 * metallic ring; landing in the brass dish rings lower and longer.
 */
const BODIES: Record<ImpactKind | 'tray' | 'button', Body> = {
  ball: {
    fundamental: [2300, 3300],
    modes: [
      { ratio: 1, gain: 1, decay: 0.016 },
      { ratio: 1.59, gain: 0.55, decay: 0.009 },
      { ratio: 2.41, gain: 0.32, decay: 0.006 },
      { ratio: 3.7, gain: 0.12, decay: 0.004 },
    ],
    click: [0.0012, 0.45],
    length: 0.09,
  },
  wire: {
    fundamental: [3900, 5200],
    modes: [
      { ratio: 1, gain: 0.55, decay: 0.05 },
      { ratio: 2.76, gain: 0.3, decay: 0.03 },
      { ratio: 5.4, gain: 0.14, decay: 0.016 },
      // The ball's own body under the ring.
      { ratio: 0.62, gain: 0.6, decay: 0.01 },
    ],
    click: [0.0008, 0.3],
    length: 0.16,
  },
  // Push button: a dull wooden-console "thock" with a short spring click.
  button: {
    fundamental: [420, 520],
    modes: [
      { ratio: 1, gain: 1, decay: 0.035 },
      { ratio: 2.3, gain: 0.45, decay: 0.016 },
      { ratio: 6.1, gain: 0.25, decay: 0.006 },
    ],
    click: [0.002, 0.7],
    length: 0.14,
  },
  tray: {
    fundamental: [1050, 1200],
    modes: [
      { ratio: 1, gain: 0.8, decay: 0.2 },
      { ratio: 1.63, gain: 0.5, decay: 0.13 },
      { ratio: 2.71, gain: 0.35, decay: 0.08 },
      { ratio: 3.98, gain: 0.2, decay: 0.05 },
      { ratio: 2.6, gain: 0.7, decay: 0.012 },
    ],
    click: [0.0015, 0.5],
    length: 0.6,
  },
};

function render(c: AudioContext, body: Body, seed: number): AudioBuffer {
  const rate = c.sampleRate;
  const n = Math.floor(rate * body.length);
  const buffer = c.createBuffer(1, n, rate);
  const data = buffer.getChannelData(0);
  let s = seed * 9301 + 49297;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const f0 = body.fundamental[0] + (body.fundamental[1] - body.fundamental[0]) * rand();
  const modes = body.modes.map((m) => ({
    w: 2 * Math.PI * f0 * m.ratio * (0.97 + rand() * 0.06),
    gain: m.gain * (0.8 + rand() * 0.4),
    decay: m.decay * (0.85 + rand() * 0.3),
    phase: rand() * Math.PI * 2,
  }));
  const [clickLen, clickGain] = body.click;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    let v = 0;
    for (const m of modes) v += m.gain * Math.exp(-t / m.decay) * Math.sin(m.w * t + m.phase);
    v += (rand() * 2 - 1) * clickGain * Math.exp(-t / clickLen);
    // 0.3 ms attack so the onset doesn't click digitally.
    v *= Math.min(1, t / 0.0003);
    data[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  for (let i = 0; i < n; i++) data[i]! /= peak || 1;
  return buffer;
}

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  // A gentle compressor keeps bursts of many hits from clipping.
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.12;
  master = ctx.createGain();
  master.gain.value = VOLUME;
  master.connect(compressor).connect(ctx.destination);
  for (const kind of Object.keys(BODIES) as Array<keyof typeof BODIES>) {
    banks[kind] = Array.from({ length: VARIANTS }, (_, i) => render(ctx!, BODIES[kind], i + 1));
  }
  const length = ctx.sampleRate;
  noise = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

/** The shared context, created on first use (the background music plays through it too). */
export function audioContext(): AudioContext | null {
  return context();
}

/** Must be called from a user gesture (the draw button). */
export function unlockAudio(): void {
  const c = context();
  if (c?.state === 'suspended') void c.resume();
}

const ready = () => !!ctx && ctx.state === 'running' && !!master;

let voices = 0;
let lastHit = 0;

function hit(kind: keyof typeof BODIES, gain: number, pan: number, rate: number) {
  if (!ready()) return;
  const now = performance.now();
  if (voices >= MAX_VOICES || now - lastHit < MIN_GAP_MS) return;
  lastHit = now;
  const c = ctx!;
  const bank = banks[kind]!;
  const source = c.createBufferSource();
  source.buffer = bank[Math.floor(Math.random() * bank.length)]!;
  source.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
  const g = c.createGain();
  g.gain.value = gain;
  const panner = c.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  source.connect(g).connect(panner).connect(master!);
  voices++;
  source.onended = () => {
    voices--;
    source.disconnect();
  };
  source.start();
}

/**
 * Plays the loudest collisions of the last frame. `pitch` > 1 for smaller
 * balls (long lists), which really do sound higher and lighter.
 */
export function playImpacts(impacts: readonly Impact[], pitch: number, centerX: number): void {
  if (!ready() || impacts.length === 0) return;
  for (const impact of impacts.slice(0, 8)) {
    const level = impact.strength ** 1.2;
    if (level < 0.01) continue;
    const gain = (impact.kind === 'wire' ? 0.2 : 0.3) * level;
    hit(impact.kind, gain, (impact.x - centerX) * 2.4, pitch);
  }
}

/** Ball rolling down the chrome chute: low, even rumble. */
export function playRoll(durationSec: number): void {
  if (!ready() || !noise) return;
  const c = ctx!;
  const source = c.createBufferSource();
  source.buffer = noise;
  const low = c.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 420;
  low.Q.value = 0.9;
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22, t + durationSec * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + durationSec);
  source.connect(low).connect(g).connect(master!);
  source.start(t, Math.random() * 0.4, durationSec);
}

/** Ball landing in the brass tray. */
export function playClack(strength = 1): void {
  hit('tray', 0.42 * strength, 0.35, 1);
}

/** The push button on the table going down. */
export function playButton(): void {
  hit('button', 0.38, -0.35, 1);
}

/** Hot metal fizzing: a hiss that swells and fades, for the smoking crank. */
export function playHiss(durationSec = 1.6): void {
  if (!ready() || !noise) return;
  const c = ctx!;
  const source = c.createBufferSource();
  source.buffer = noise;
  source.loop = true;
  const high = c.createBiquadFilter();
  high.type = 'bandpass';
  high.frequency.value = 5200;
  high.Q.value = 0.7;
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + durationSec);
  source.connect(high).connect(g).connect(master!);
  source.start(t, Math.random() * 0.5);
  source.stop(t + durationSec);
}

/** A neon tube shorting out: a mains buzz with a crackle on top, then a pop. */
export function playShort(): void {
  if (!ready() || !noise) return;
  const c = ctx!;
  const t = c.currentTime;
  const buzz = c.createOscillator();
  buzz.type = 'sawtooth';
  buzz.frequency.value = 100;
  const bg = c.createGain();
  bg.gain.setValueAtTime(0.0001, t);
  bg.gain.exponentialRampToValueAtTime(0.05, t + 0.05);
  bg.gain.setValueAtTime(0.05, t + 0.55);
  bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
  buzz.connect(bg).connect(master!);
  buzz.start(t);
  buzz.stop(t + 0.65);
  const crackle = c.createBufferSource();
  crackle.buffer = noise;
  const cf = c.createBiquadFilter();
  cf.type = 'highpass';
  cf.frequency.value = 2500;
  const cg = c.createGain();
  // Irregular bursts, like arcing.
  cg.gain.setValueAtTime(0.0001, t);
  for (let i = 0; i < 9; i++) {
    const at = t + 0.04 + Math.random() * 0.5;
    cg.gain.setValueAtTime(0.12 * Math.random(), at);
    cg.gain.setValueAtTime(0.0001, at + 0.02);
  }
  cg.gain.setValueAtTime(0.3, t + 0.6);
  cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
  crackle.connect(cf).connect(cg).connect(master!);
  crackle.start(t, Math.random() * 0.3, 0.8);
}

/** A little brass fanfare: a rising arpeggio and a held chord. */
export function playFanfare(): void {
  if (!ready()) return;
  const c = ctx!;
  const t = c.currentTime;
  const note = (freq: number, at: number, length: number, gain: number) => {
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2200;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t + at);
    g.gain.exponentialRampToValueAtTime(gain, t + at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + length);
    o.connect(f).connect(g).connect(master!);
    o.start(t + at);
    o.stop(t + at + length + 0.05);
  };
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, i * 0.11, 0.18, 0.05));
  for (const f of [523.25, 659.25, 783.99, 1046.5]) note(f, 0.48, 0.9, 0.035);
}
