/**
 * Machine sounds synthesised with Web Audio (no files): the rattle of balls
 * in the turning cage, the ball rolling down the chute and the clack as it
 * lands in the tray. Nothing plays until unlockAudio() runs from a click.
 */

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let rattle: { gain: GainNode; filter: BiquadFilterNode } | null = null;
let master: GainNode | null = null;

const VOLUME = 0.5;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = VOLUME;
  master.connect(ctx.destination);
  const length = ctx.sampleRate * 2;
  noise = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noise.getChannelData(0);
  // Sparse clicks rather than white noise: sounds like many small impacts.
  for (let i = 0; i < length; i++) data[i] = Math.random() < 0.04 ? (Math.random() * 2 - 1) * 0.9 : (Math.random() * 2 - 1) * 0.05;
  return ctx;
}

/** Must be called from a user gesture (the draw button). */
export function unlockAudio(): void {
  const c = context();
  if (c?.state === 'suspended') void c.resume();
}

const ready = () => !!ctx && ctx.state === 'running' && !!noise && !!master;

/** Rattle level follows the cage speed (0 = silent). */
export function setRattle(level: number): void {
  if (!ready()) return;
  const c = ctx!;
  if (!rattle && level > 0.01) {
    const source = c.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.8;
    const gain = c.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(master!);
    source.start();
    rattle = { gain, filter };
  }
  if (rattle) {
    rattle.gain.gain.setTargetAtTime(Math.min(1, level) * 0.35, c.currentTime, 0.08);
    rattle.filter.frequency.setTargetAtTime(900 + level * 1800, c.currentTime, 0.1);
  }
}

function burst(duration: number, frequency: number, q: number, gainValue: number, decay: number) {
  if (!ready()) return;
  const c = ctx!;
  const source = c.createBufferSource();
  source.buffer = noise;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = frequency;
  filter.Q.value = q;
  const gain = c.createGain();
  const t = c.currentTime;
  gain.gain.setValueAtTime(gainValue, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  source.connect(filter).connect(gain).connect(master!);
  source.start(t, Math.random(), duration);
}

/** Ball rolling down the chute. */
export function playRoll(durationSec: number): void {
  burst(durationSec, 520, 0.7, 0.5, durationSec);
}

/** Hard plastic ball hitting the brass tray. */
export function playClack(strength = 1): void {
  if (!ready()) return;
  const c = ctx!;
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = 1650;
  const gain = c.createGain();
  const t = c.currentTime;
  gain.gain.setValueAtTime(0.35 * strength, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  osc.connect(gain).connect(master!);
  osc.start(t);
  osc.stop(t + 0.13);
  burst(0.05, 3200, 1.5, 0.6 * strength, 0.05);
}
