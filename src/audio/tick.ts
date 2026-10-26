/** Peg "clack" synthesised with Web Audio: no audio files to load. */

let context: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let lastTick = 0;

const MIN_GAP_MS = 28;

function getContext(): AudioContext | null {
  if (context) return context;
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  const length = Math.floor(context.sampleRate * 0.03);
  noise = context.createBuffer(1, length, context.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 4;
  return context;
}

/** Call from a user gesture so browsers allow audio later on. */
export function unlockAudio(): void {
  const ctx = getContext();
  if (ctx?.state === 'suspended') void ctx.resume();
}

export function playTick(strength = 1): void {
  const now = performance.now();
  if (now - lastTick < MIN_GAP_MS) return;
  lastTick = now;
  const ctx = getContext();
  if (!ctx || !noise || ctx.state !== 'running') return;

  const source = ctx.createBufferSource();
  source.buffer = noise;
  source.playbackRate.value = 0.9 + Math.random() * 0.2;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2400;
  filter.Q.value = 1.4;
  const gain = ctx.createGain();
  gain.gain.value = 0.22 * Math.max(0.25, Math.min(1, strength));
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start();
}
