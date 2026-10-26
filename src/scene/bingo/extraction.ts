import * as THREE from 'three';
import type { ExtractionPhase } from '../../domain/draw';
import { smoothstep } from '../../domain/draw';
import { CAGE_CENTER, CAGE_RADIUS, LAYOUT, PORT_INSIDE, RAMP_POINTS, TUBE_POINTS, trayRestPosition } from './layout';

const easeInOut = (u: number) => smoothstep(u);
const easeOutCubic = (u: number) => 1 - (1 - u) ** 3;

/**
 * The winner's journey, built when it leaves the pile: a scooping curve to
 * the fixed exit port on the cage's axis, the enclosed tube, the open ramp
 * (rolling on the channel floor) and a short drop with a bounce into the tray.
 * Every segment starts where the previous one ends, so the ball never jumps.
 */
export class ExtractionPath {
  private readonly pull: THREE.CatmullRomCurve3;
  private readonly chute: THREE.CatmullRomCurve3;
  private readonly rampEnd: THREE.Vector3;
  private readonly rest: THREE.Vector3;

  constructor(start: THREE.Vector3, radius: number) {
    // Scoop: rise towards the axis, staying inside the cage.
    const mid = start.clone().lerp(PORT_INSIDE, 0.5);
    mid.y += 0.05;
    const limit = CAGE_RADIUS - radius - 0.01;
    const offset = mid.clone().sub(CAGE_CENTER);
    if (offset.length() > limit) mid.copy(CAGE_CENTER).addScaledVector(offset.normalize(), limit);
    this.pull = new THREE.CatmullRomCurve3([start.clone(), mid, PORT_INSIDE.clone()], false, 'centripetal');

    // The ball rolls on the bottom of the tube and of the ramp channel.
    const drop = LAYOUT.chute.tubeInnerRadius - radius;
    const floor = (p: THREE.Vector3) => p.clone().setY(p.y - drop);
    const chutePoints = [PORT_INSIDE.clone(), ...TUBE_POINTS.map(floor), ...RAMP_POINTS.slice(1).map(floor)];
    this.chute = new THREE.CatmullRomCurve3(chutePoints, false, 'centripetal');
    this.rampEnd = chutePoints[chutePoints.length - 1]!.clone();
    this.rest = trayRestPosition(radius);
  }

  /** Position for a phase and its local progress u ∈ [0, 1]. */
  at(phase: ExtractionPhase, u: number, out: THREE.Vector3): THREE.Vector3 {
    switch (phase) {
      case 'pull':
        return this.pull.getPointAt(easeInOut(u), out);
      case 'chute':
        // Gravity: slow out of the tube, fastest at the bottom of the ramp.
        return this.chute.getPointAt(Math.min(1, u * (0.35 + 0.65 * u)), out);
      case 'settle':
        return this.settle(u, out);
      case 'done':
        return out.copy(this.rest);
      default:
        return this.pull.getPointAt(0, out);
    }
  }

  private settle(u: number, out: THREE.Vector3) {
    const across = easeOutCubic(Math.min(1, u / 0.7));
    out.lerpVectors(this.rampEnd, this.rest, across);
    // Fall into the dish, then two small, damped bounces.
    const fall = this.rampEnd.y - this.rest.y;
    let y: number;
    if (u < 0.32) {
      const f = u / 0.32;
      y = this.rampEnd.y - fall * f * f;
    } else {
      const b = (u - 0.32) / 0.68;
      y = this.rest.y + Math.abs(Math.sin(b * Math.PI * 2)) * 0.014 * (1 - b) ** 2;
    }
    out.y = y;
    return out;
  }
}

/**
 * Previous winner going back into the cage at the start of a draw: lifted
 * from the tray in an arc and dropped through a gap at the top of the cage
 * (the wire spacing there is wider than a ball).
 */
export class ReturnPath {
  private readonly curve: THREE.CatmullRomCurve3;

  constructor(radius: number) {
    const rest = trayRestPosition(radius);
    const top = CAGE_CENTER.clone().setY(CAGE_CENTER.y + CAGE_RADIUS * 0.55).setX(0.04);
    this.curve = new THREE.CatmullRomCurve3(
      [
        rest,
        rest.clone().add(new THREE.Vector3(-0.02, 0.16, -0.04)),
        new THREE.Vector3(0.22, CAGE_CENTER.y + CAGE_RADIUS + 0.12, 0.06),
        new THREE.Vector3(0.06, CAGE_CENTER.y + CAGE_RADIUS + 0.06, 0),
        top,
      ],
      false,
      'centripetal',
    );
  }

  at(u: number, out: THREE.Vector3) {
    return this.curve.getPointAt(easeInOut(u), out);
  }
}

export const RETURN_MS = 650;
