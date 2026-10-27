import * as THREE from 'three';
import { smoothstep, type DrawTimeline } from '../domain/draw';
import { CAGE_CENTER, PORT_INSIDE, TRAY_CENTER } from './bingo/layout';

/**
 * The camera's choreography for a draw, written as a shot list tied to the
 * draw timeline: push in low on the cage as it spins up, circle it while the
 * balls tumble, swing round to the exit, follow the winner down the chute,
 * catch it landing in the tray and pull back to the result view.
 */

/** A camera placement: what it looks at, from which angle and how far, and its tilt. */
export interface Pose {
  target: THREE.Vector3;
  /** Around the vertical axis, radians; 0 looks from +Z. */
  azimuth: number;
  /** Above the horizon, radians. */
  elevation: number;
  distance: number;
  roll: number;
  /** Tilt up from looking straight at the target, radians: lets more of the hall into shot. */
  pitch: number;
}

export interface Shot extends Omit<Pose, 'target'> {
  /** Milliseconds from the start of the draw. */
  at: number;
  /** A fixed point, or the extracted ball wherever it is. */
  target: THREE.Vector3 | 'hero';
}

/** How long the pull-back to the result view lasts after the draw itself ends. */
const PULL_BACK_MS = 1300;
const PORT_VIEW = CAGE_CENTER.clone().lerp(PORT_INSIDE, 0.55);
const TRAY_VIEW = TRAY_CENTER.clone().setY(TRAY_CENTER.y + 0.03);

export const cinematicEnd = (t: DrawTimeline) => t.totalMs + PULL_BACK_MS;

/**
 * The shots for one draw. `from` is wherever the camera is when the button is
 * pressed; `rest` is the usual three-quarter view, where it ends up. Angles
 * are offsets from that view, distances fractions of its framing distance, so
 * the moves scale with the screen.
 */
export function cinematicShots(
  t: DrawTimeline,
  from: Pose,
  rest: Pose,
  resultTarget: THREE.Vector3,
  resultDistance: number,
): Shot[] {
  const az = rest.azimuth;
  const d = rest.distance;
  return [
    { at: 0, ...from, target: from.target.clone() },
    // Low and close while the cage gets going.
    { at: t.spinUpEnd + 300, target: CAGE_CENTER, azimuth: az - 0.35, elevation: 0.2, distance: d * 0.6, roll: 0.035, pitch: 0 },
    // Circling round the front as the balls tumble.
    { at: t.mixEnd, target: CAGE_CENTER, azimuth: az - 1.05, elevation: 0.36, distance: d * 0.52, roll: -0.04, pitch: 0 },
    // Swing back round towards the exit as it slows.
    { at: t.extractStart, target: PORT_VIEW, azimuth: az + 0.15, elevation: 0.3, distance: d * 0.5, roll: 0, pitch: 0 },
    // Tight on the winner as it enters the tube...
    { at: t.portArrive, target: 'hero', azimuth: az + 0.7, elevation: 0.32, distance: d * 0.33, roll: 0.02, pitch: 0 },
    // ...and following it down the ramp, low.
    { at: t.rampEnd, target: 'hero', azimuth: az + 0.35, elevation: 0.17, distance: d * 0.34, roll: 0, pitch: 0 },
    { at: t.settleEnd, target: TRAY_VIEW, azimuth: az + 0.2, elevation: 0.42, distance: d * 0.36, roll: 0, pitch: 0 },
    // Back to the result view: same as the camera rig's own, so the hand-off is seamless.
    { at: cinematicEnd(t), target: resultTarget, azimuth: az, elevation: rest.elevation, distance: d * resultDistance, roll: 0, pitch: 0 },
  ];
}

type Scalar = 'azimuth' | 'elevation' | 'distance' | 'roll' | 'pitch';
const SCALARS: Scalar[] = ['azimuth', 'elevation', 'distance', 'roll', 'pitch'];

/** Cubic Hermite through the shots, tangents from the neighbours: smooth through every shot, still at both ends. */
function hermite(shots: readonly Shot[], key: Scalar, i: number, u: number): number {
  const n = shots.length;
  const slope = (j: number) =>
    j <= 0 || j >= n - 1 ? 0 : (shots[j + 1]![key] - shots[j - 1]![key]) / (shots[j + 1]!.at - shots[j - 1]!.at);
  const dt = shots[i + 1]!.at - shots[i]!.at;
  const p0 = shots[i]![key];
  const p1 = shots[i + 1]![key];
  const m0 = slope(i) * dt;
  const m1 = slope(i + 1) * dt;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
}

const smootherstep = (u: number) => u * u * u * (u * (u * 6 - 15) + 10);

/** The camera pose `ms` into the draw. `hero` is the extracted ball's current position. */
export function evaluateShots(shots: readonly Shot[], ms: number, hero: THREE.Vector3, out: Pose): Pose {
  const last = shots.length - 1;
  let i = 0;
  while (i < last - 1 && ms >= shots[i + 1]!.at) i++;
  const a = shots[i]!;
  const b = shots[i + 1]!;
  const u = THREE.MathUtils.clamp((ms - a.at) / (b.at - a.at), 0, 1);
  for (const key of SCALARS) out[key] = hermite(shots, key, i, u);
  // The aim eases between fixed points; on the ball it stays locked on.
  const from = a.target === 'hero' ? hero : a.target;
  const to = b.target === 'hero' ? hero : b.target;
  out.target.lerpVectors(from, to, smootherstep(u));
  return out;
}

/** Camera position for a pose. */
export function placeCamera(camera: THREE.PerspectiveCamera, pose: Pose) {
  const flat = Math.cos(pose.elevation) * pose.distance;
  camera.position.set(
    pose.target.x + Math.sin(pose.azimuth) * flat,
    pose.target.y + Math.sin(pose.elevation) * pose.distance,
    pose.target.z + Math.cos(pose.azimuth) * flat,
  );
  camera.up.set(0, 1, 0);
  camera.lookAt(pose.target);
  camera.rotateX(pose.pitch);
  camera.rotateZ(pose.roll);
}

/** A small, quickly damped jolt when the ball hits the tray. */
export function landingShake(t: DrawTimeline, ms: number): number {
  const since = ms - t.rampEnd;
  if (since < 0 || since > 500) return 0;
  return Math.sin(since * 0.06) * Math.exp(-since / 110);
}

/**
 * How far the house lights are down, 0–1: they dim as the cage starts and
 * come back up when the winner lands, leaving the machine in its own pool.
 */
export function drama(t: DrawTimeline, ms: number): number {
  if (ms <= 0 || ms >= t.totalMs) return 0;
  return smoothstep(ms / 900) * (1 - smoothstep((ms - t.rampEnd) / (t.totalMs - t.rampEnd)));
}
