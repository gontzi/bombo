export type EasingKind = 'spin' | 'gentle';

const clamp01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t);

/** Fraction of the spin spent accelerating from rest. */
const ACCEL_PORTION = 0.07;
/** Higher means a longer, lazier coast before the wheel stops. */
const DECAY_POWER = 3;

/**
 * Normalised distance for a wheel spin, built from a velocity profile:
 * a sin² ramp up to full speed, then a (1 − u)^p decay to a dead stop.
 * Velocity is continuous at the hand-off and reaches exactly zero at t = 1.
 */
export function spinEase(t: number): number {
  const x = clamp01(t);
  const ta = ACCEL_PORTION;
  const p = DECAY_POWER;
  const total = ta / 2 + (1 - ta) / (p + 1);
  let distance: number;
  if (x <= ta) {
    distance = x / 2 - (ta / (2 * Math.PI)) * Math.sin((Math.PI * x) / ta);
  } else {
    const u = (x - ta) / (1 - ta);
    distance = ta / 2 + ((1 - ta) * (1 - (1 - u) ** (p + 1))) / (p + 1);
  }
  return distance / total;
}

/** Short ease-out used when the user prefers reduced motion. */
export function gentleEase(t: number): number {
  return 1 - (1 - clamp01(t)) ** 3;
}

export const easings: Record<EasingKind, (t: number) => number> = {
  spin: spinEase,
  gentle: gentleEase,
};
