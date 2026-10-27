import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FULL_TIMELINE } from '../domain/draw';
import { cinematicEnd, cinematicShots, drama, evaluateShots, type Pose } from './cinematic';

const pose = (target: THREE.Vector3, distance: number): Pose => ({
  target,
  azimuth: 0.66,
  elevation: 0.46,
  distance,
  roll: 0,
  pitch: 0,
});

describe('cinematic camera', () => {
  const from = pose(new THREE.Vector3(0, 0.3, 0.1), 2.4);
  const rest = pose(new THREE.Vector3(0, 0.3, 0.1), 2.5);
  const result = new THREE.Vector3(0.1, 0.4, 0.2);
  const shots = cinematicShots(FULL_TIMELINE, from, rest, result, 1.1);
  const hero = new THREE.Vector3(0.4, 0.2, 0.2);
  const at = (ms: number) => evaluateShots(shots, ms, hero, pose(new THREE.Vector3(), 0));

  it('starts where the camera was and ends on the result view', () => {
    const start = at(0);
    expect(start.distance).toBeCloseTo(2.4);
    expect(start.target.distanceTo(from.target)).toBeLessThan(1e-9);
    const end = at(cinematicEnd(FULL_TIMELINE));
    expect(end.distance).toBeCloseTo(2.5 * 1.1);
    expect(end.azimuth).toBeCloseTo(rest.azimuth);
    expect(end.elevation).toBeCloseTo(rest.elevation);
    expect(end.roll).toBeCloseTo(0);
    expect(end.target.distanceTo(result)).toBeLessThan(1e-9);
  });

  it('locks on to the ball while it runs down the chute', () => {
    const mid = at((FULL_TIMELINE.portArrive + FULL_TIMELINE.rampEnd) / 2);
    expect(mid.target.distanceTo(hero)).toBeLessThan(1e-9);
  });

  it('moves smoothly, without jumps between frames', () => {
    let prev = at(0);
    for (let ms = 16; ms <= cinematicEnd(FULL_TIMELINE); ms += 16) {
      const p = at(ms);
      expect(Number.isFinite(p.distance)).toBe(true);
      expect(Math.abs(p.azimuth - prev.azimuth)).toBeLessThan(0.05);
      expect(Math.abs(p.distance - prev.distance)).toBeLessThan(0.08);
      expect(p.distance).toBeGreaterThan(0.5);
      prev = { ...p, target: p.target.clone() };
    }
  });

  it('dims the lights only during the draw', () => {
    expect(drama(FULL_TIMELINE, 0)).toBe(0);
    expect(drama(FULL_TIMELINE, FULL_TIMELINE.mixEnd)).toBeCloseTo(1);
    expect(drama(FULL_TIMELINE, FULL_TIMELINE.totalMs)).toBe(0);
  });
});
