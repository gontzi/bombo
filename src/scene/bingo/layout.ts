import * as THREE from 'three';
import raw from '../bingoLayout.json';

/** Typed view of bingoLayout.json (shared with the Blender build script). */
export const LAYOUT = raw;

const v3 = (p: readonly number[]) => new THREE.Vector3(p[0], p[1], p[2]);

export const CAGE_CENTER = v3(LAYOUT.cage.center);
export const CAGE_RADIUS = LAYOUT.cage.radius;

/** The fixed exit port sits on the cage's axis at the +X pole, so it never moves while the cage turns. */
export const PORT_INSIDE = new THREE.Vector3(LAYOUT.cage.poleX - 0.05, CAGE_CENTER.y, CAGE_CENTER.z);

export const TUBE_POINTS = LAYOUT.chute.tube.map(v3);
export const RAMP_POINTS = LAYOUT.chute.ramp.map(v3);
export const TRAY_CENTER = v3(LAYOUT.tray.center);

/**
 * Ball radius for a given number of balls: real-size balls for small lists,
 * smaller ones for big lists so every option still fits in the cage.
 */
export function ballRadiusFor(count: number): number {
  const { maxRadius, minRadius, fill } = LAYOUT.balls;
  if (count <= 0) return maxRadius;
  const fit = (CAGE_RADIUS - LAYOUT.cage.wireRadius) * Math.cbrt(fill / count);
  return THREE.MathUtils.clamp(fit, minRadius, maxRadius);
}

export const trayRestPosition = (radius: number) =>
  new THREE.Vector3(TRAY_CENTER.x, LAYOUT.tray.floorY + radius, TRAY_CENTER.z);
