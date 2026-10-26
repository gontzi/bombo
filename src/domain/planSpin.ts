import { cryptoFloat, type FloatSource } from './random';
import { easings, type EasingKind } from './easing';
import { TAU, normalizeAngle, rotationForLocalAngle, segmentCenter, segmentSize } from './wheelMath';

export interface SpinPlan {
  readonly winnerIndex: number;
  readonly segmentCount: number;
  readonly startRotation: number;
  /** Unwrapped final rotation; always ≤ startRotation (clockwise). */
  readonly targetRotation: number;
  readonly durationMs: number;
  readonly easing: EasingKind;
}

export const SPIN_SETTINGS = {
  durationMs: 6000,
  durationJitterMs: 700,
  minTurns: 5,
  extraTurns: 2,
  /** Portion of a segment kept clear at each edge so the stop is never ambiguous. */
  edgeMargin: 0.18,
  reducedDurationMs: 900,
} as const;

export interface PlanOptions {
  reducedMotion?: boolean;
  rng?: FloatSource;
}

/**
 * Turns an already chosen winner into an exact animation target. The stop
 * point lands somewhere inside the winner's segment (never near its edges),
 * after a whole number of extra turns.
 */
export function planSpin(
  winnerIndex: number,
  segmentCount: number,
  startRotation: number,
  { reducedMotion = false, rng = cryptoFloat }: PlanOptions = {},
): SpinPlan {
  if (!Number.isInteger(segmentCount) || segmentCount < 1) {
    throw new RangeError(`planSpin: segmentCount must be ≥ 1, got ${segmentCount}`);
  }
  if (!Number.isInteger(winnerIndex) || winnerIndex < 0 || winnerIndex >= segmentCount) {
    throw new RangeError(`planSpin: winnerIndex ${winnerIndex} out of range`);
  }

  const s = segmentSize(segmentCount);
  const halfSpan = (0.5 - SPIN_SETTINGS.edgeMargin) * s;
  const jitter = (rng() * 2 - 1) * halfSpan;
  const restRotation = rotationForLocalAngle(segmentCenter(winnerIndex, segmentCount) + jitter);

  const clockwiseDistance = normalizeAngle(startRotation - restRotation);
  const turns = reducedMotion
    ? 0
    : SPIN_SETTINGS.minTurns + Math.floor(rng() * (SPIN_SETTINGS.extraTurns + 1));

  const durationMs = reducedMotion
    ? SPIN_SETTINGS.reducedDurationMs
    : Math.round(SPIN_SETTINGS.durationMs + (rng() - 0.5) * SPIN_SETTINGS.durationJitterMs);

  return {
    winnerIndex,
    segmentCount,
    startRotation,
    targetRotation: startRotation - clockwiseDistance - turns * TAU,
    durationMs,
    easing: reducedMotion ? 'gentle' : 'spin',
  };
}

/** Wheel rotation at a point in time of a plan. Exactly `targetRotation` once finished. */
export function rotationAt(plan: SpinPlan, elapsedMs: number): number {
  const t = elapsedMs / plan.durationMs;
  if (t >= 1) return plan.targetRotation;
  if (t <= 0) return plan.startRotation;
  return plan.startRotation + (plan.targetRotation - plan.startRotation) * easings[plan.easing](t);
}
