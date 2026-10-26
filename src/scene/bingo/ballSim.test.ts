import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BallSim } from './ballSim';
import { CAGE_CENTER, CAGE_RADIUS, PORT_INSIDE, ballRadiusFor } from './layout';
import { ExtractionPath } from './extraction';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `b${i}`);

describe('BallSim', () => {
  it('keeps every ball inside the cage while it spins, even with a full list', () => {
    for (const n of [1, 8, 75, 300]) {
      const radius = ballRadiusFor(n);
      const sim = new BallSim(CAGE_CENTER, CAGE_RADIUS, radius, PORT_INSIDE);
      sim.sync(ids(n), radius, true);
      sim.omega = 5;
      for (let f = 0; f < 180; f++) sim.step(1 / 60);
      sim.omega = 0;
      for (let f = 0; f < 120; f++) sim.step(1 / 60);
      for (const ball of sim.balls.values()) {
        expect(ball.position.distanceTo(CAGE_CENTER)).toBeLessThanOrEqual(CAGE_RADIUS - radius + 1e-6);
        expect(Number.isFinite(ball.position.x)).toBe(true);
      }
      expect(sim.balls.size).toBe(n);
    }
  });

  it('removes balls that leave the list and adds new ones at the port', () => {
    const radius = ballRadiusFor(3);
    const sim = new BallSim(CAGE_CENTER, CAGE_RADIUS, radius, PORT_INSIDE);
    sim.sync(['a', 'b', 'c'], radius, true);
    sim.sync(['a', 'c', 'd'], radius);
    expect([...sim.balls.keys()].sort()).toEqual(['a', 'c', 'd']);
    expect(sim.balls.get('d')!.position.distanceTo(PORT_INSIDE)).toBeLessThan(1e-9);
  });

  it('settles and goes to sleep when the cage stops', () => {
    const radius = ballRadiusFor(10);
    const sim = new BallSim(CAGE_CENTER, CAGE_RADIUS, radius, PORT_INSIDE);
    sim.sync(ids(10), radius, true);
    for (let f = 0; f < 60 * 6; f++) sim.step(1 / 60);
    expect(sim.awake).toBe(false);
  });
});

describe('ExtractionPath', () => {
  it('is continuous from the pile to the tray', () => {
    const radius = ballRadiusFor(8);
    const start = CAGE_CENTER.clone().add(new THREE.Vector3(-0.05, -0.15, 0.04));
    const path = new ExtractionPath(start, radius);
    const p = new THREE.Vector3();
    expect(path.at('pull', 0, p).distanceTo(start)).toBeLessThan(1e-6);
    const joins: Array<[Parameters<ExtractionPath['at']>[0], Parameters<ExtractionPath['at']>[0]]> = [
      ['pull', 'chute'],
      ['chute', 'settle'],
      ['settle', 'done'],
    ];
    for (const [a, b] of joins) {
      const end = path.at(a, 1, new THREE.Vector3());
      const begin = path.at(b, 0, new THREE.Vector3());
      expect(end.distanceTo(begin)).toBeLessThan(1e-3);
    }
  });

  it('stays inside the cage until it reaches the port', () => {
    const radius = ballRadiusFor(8);
    const path = new ExtractionPath(CAGE_CENTER.clone().add(new THREE.Vector3(0, -0.2, 0)), radius);
    const p = new THREE.Vector3();
    for (let u = 0; u <= 1; u += 0.02) {
      path.at('pull', u, p);
      expect(p.distanceTo(CAGE_CENTER)).toBeLessThan(CAGE_RADIUS - radius + 1e-6);
    }
  });
});

describe('impacts', () => {
  it('reports audible hits while mixing and none once the balls rest', () => {
    const radius = ballRadiusFor(20);
    const sim = new BallSim(CAGE_CENTER, CAGE_RADIUS, radius, PORT_INSIDE);
    sim.sync(ids(20), radius, true);
    sim.omega = 5;
    let heard = 0;
    for (let f = 0; f < 120; f++) {
      sim.step(1 / 60);
      const impacts = sim.drainImpacts();
      heard += impacts.length;
      for (const i of impacts) {
        expect(i.strength).toBeGreaterThanOrEqual(0);
        expect(i.strength).toBeLessThanOrEqual(1);
      }
    }
    expect(heard).toBeGreaterThan(20);

    sim.omega = 0;
    for (let f = 0; f < 60 * 6; f++) sim.step(1 / 60);
    sim.drainImpacts();
    for (let f = 0; f < 30; f++) sim.step(1 / 60);
    expect(sim.drainImpacts()).toHaveLength(0);
  });
});
