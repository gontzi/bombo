/**
 * Single source of truth for the wheel's angular convention. Geometry,
 * labels, pegs, the pointer and the spin planner all go through here.
 *
 * - Angles are radians, counter-clockwise, measured from the wheel's local +X axis.
 * - Segment i spans local angles [i·s, (i+1)·s), with s = 2π / n.
 * - The wheel's rotation θ is its rotation about +Z (Three.js `rotation.z`):
 *   a local angle a appears at world angle a + θ.
 * - The pointer is fixed at world angle POINTER_ANGLE (3 o'clock), so the
 *   local angle under it is POINTER_ANGLE − θ.
 * - Spinning is clockwise on screen, i.e. θ decreases.
 */

export const TAU = Math.PI * 2;
export const POINTER_ANGLE = 0;

export function normalizeAngle(angle: number): number {
  const r = angle % TAU;
  const positive = r < 0 ? r + TAU : r;
  // `r + TAU` can round up to exactly TAU for tiny negative r.
  return positive >= TAU ? 0 : positive;
}

export const segmentSize = (n: number): number => TAU / n;
export const segmentStart = (i: number, n: number): number => (i * TAU) / n;
export const segmentCenter = (i: number, n: number): number => ((i + 0.5) * TAU) / n;

export function localAngleUnderPointer(rotation: number): number {
  return normalizeAngle(POINTER_ANGLE - rotation);
}

/** Index of the segment under the pointer for a wheel rotation, or -1 for an empty wheel. */
export function indexUnderPointer(rotation: number, n: number): number {
  if (n <= 0) return -1;
  const index = Math.floor(localAngleUnderPointer(rotation) / segmentSize(n));
  return Math.min(index, n - 1);
}

/** Wheel rotation in [0, 2π) that places `localAngle` exactly under the pointer. */
export function rotationForLocalAngle(localAngle: number): number {
  return normalizeAngle(POINTER_ANGLE - localAngle);
}

/**
 * How many segment boundaries have crossed the pointer, unwrapped. It grows
 * by one each time a boundary (and its peg) passes while spinning clockwise.
 */
export function boundaryCount(rotation: number, n: number): number {
  return Math.floor((POINTER_ANGLE - rotation) / segmentSize(n));
}
