import type { Entry } from './entries';
import { cryptoUint32, randomInt, type Uint32Source } from './random';

/**
 * Moments of a draw, in milliseconds from its start. The winner is fixed
 * before any of this plays; the timeline only says when the machine moves.
 */
export interface DrawTimeline {
  readonly spinUpEnd: number;
  readonly mixEnd: number;
  readonly slowEnd: number;
  /** Winner leaves the pile and heads for the exit port at the cage's pole. */
  readonly extractStart: number;
  /** Winner enters the fixed exit tube. */
  readonly portArrive: number;
  /** Winner reaches the end of the ramp, above the tray. */
  readonly rampEnd: number;
  /** Winner at rest in the tray. */
  readonly settleEnd: number;
  readonly totalMs: number;
}

export interface DrawPlan {
  readonly winnerId: string;
  readonly winnerIndex: number;
  readonly entryCount: number;
  readonly reducedMotion: boolean;
  readonly timeline: DrawTimeline;
}

export interface DrawDecision {
  readonly plan: DrawPlan;
  readonly winner: Entry;
}

export const FULL_TIMELINE: DrawTimeline = {
  spinUpEnd: 900,
  mixEnd: 2400,
  slowEnd: 4300,
  extractStart: 3300,
  portArrive: 4050,
  rampEnd: 4950,
  settleEnd: 5450,
  totalMs: 5600,
};

/** No spinning, no mixing: the chosen ball simply travels out (prefers-reduced-motion). */
export const REDUCED_TIMELINE: DrawTimeline = {
  spinUpEnd: 0,
  mixEnd: 0,
  slowEnd: 0,
  extractStart: 0,
  portArrive: 450,
  rampEnd: 1050,
  settleEnd: 1250,
  totalMs: 1300,
};

export interface DecideOptions {
  reducedMotion?: boolean;
  source?: Uint32Source;
}

/**
 * Picks the winner uniformly (every entry, duplicates included, has the
 * same 1/n chance) and only then plans the animation that extracts it.
 * Nothing downstream re-draws or reads the winner back from the scene.
 */
export function decideDraw(
  entries: readonly Entry[],
  { reducedMotion = false, source = cryptoUint32 }: DecideOptions = {},
): DrawDecision {
  if (entries.length === 0) throw new Error('decideDraw: no entries');
  const winnerIndex = randomInt(entries.length, source);
  const winner = entries[winnerIndex]!;
  return {
    winner,
    plan: {
      winnerId: winner.id,
      winnerIndex,
      entryCount: entries.length,
      reducedMotion,
      timeline: reducedMotion ? REDUCED_TIMELINE : FULL_TIMELINE,
    },
  };
}

const clamp01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x);
export const smoothstep = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/** Speed the cage turns at, as a fraction of its top speed. */
export function cageSpeed(t: DrawTimeline, ms: number): number {
  if (t.spinUpEnd === 0 && t.slowEnd === 0) return 0;
  if (ms <= 0) return 0;
  if (ms < t.spinUpEnd) return smoothstep(ms / t.spinUpEnd);
  if (ms < t.mixEnd) return 1;
  if (ms < t.slowEnd) return 1 - 0.88 * smoothstep((ms - t.mixEnd) / (t.slowEnd - t.mixEnd));
  // A slow final coast to rest, like a cage being let go.
  return 0.12 * (1 - smoothstep((ms - t.slowEnd) / 700));
}

export type ExtractionPhase = 'waiting' | 'pull' | 'chute' | 'settle' | 'done';

export function extractionPhase(t: DrawTimeline, ms: number): { phase: ExtractionPhase; u: number } {
  if (ms < t.extractStart) return { phase: 'waiting', u: 0 };
  if (ms < t.portArrive) return { phase: 'pull', u: (ms - t.extractStart) / (t.portArrive - t.extractStart) };
  if (ms < t.rampEnd) return { phase: 'chute', u: (ms - t.portArrive) / (t.rampEnd - t.portArrive) };
  if (ms < t.settleEnd) return { phase: 'settle', u: (ms - t.rampEnd) / (t.settleEnd - t.rampEnd) };
  return { phase: 'done', u: 1 };
}
