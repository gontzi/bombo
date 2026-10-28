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
 * A ball going into the cage from outside: lifted in an arc and dropped
 * through a gap at the top of the cage (the wire spacing there is wider than
 * a ball). By default from the tray (the previous winner, at the start of a
 * draw); the ball rack passes its cups.
 */
export class ReturnPath {
  private readonly curve: THREE.CatmullRomCurve3;

  constructor(radius: number, from?: THREE.Vector3) {
    const rest = from?.clone() ?? trayRestPosition(radius);
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

const GRAVITY = 9.81;
/** How far above the higher of start and landing a tossed ball peaks. */
const TOSS_RISE = 0.16;

/**
 * A ball tossed into the cage from the ball rack: a true ballistic arc under
 * gravity, from its cup up over the cage and down through the gap at its top
 * to a point just inside, picked a little apart for each ball so they do not
 * all land on the same spot. It ends with the speed it was falling at, which
 * the cage simulation carries on with, so it drops onto the pile as if it had
 * never left it.
 */
export class TossPath {
  /** Seconds in the air. */
  readonly duration: number;
  /** Where it lands, inside the cage, and how fast it is going then. */
  readonly end: THREE.Vector3;
  readonly endVelocity: THREE.Vector3;
  private readonly start: THREE.Vector3;
  private readonly velocity: THREE.Vector3;

  constructor(from: THREE.Vector3, radius: number, spread = Math.random()) {
    const angle = spread * Math.PI * 2;
    const reach = 0.02 + ((spread * 7.31) % 1) * 0.05;
    this.end = CAGE_CENTER.clone().add(new THREE.Vector3(Math.cos(angle) * reach, CAGE_RADIUS * 0.6, Math.sin(angle) * reach));
    const limit = CAGE_RADIUS - radius - 0.01;
    const offset = this.end.clone().sub(CAGE_CENTER);
    if (offset.length() > limit) this.end.copy(CAGE_CENTER).addScaledVector(offset.normalize(), limit);

    this.start = from.clone();
    const apex = Math.max(from.y, this.end.y) + TOSS_RISE;
    const up = Math.sqrt(2 * GRAVITY * (apex - from.y));
    this.duration = up / GRAVITY + Math.sqrt((2 * (apex - this.end.y)) / GRAVITY);
    this.velocity = new THREE.Vector3(
      (this.end.x - from.x) / this.duration,
      up,
      (this.end.z - from.z) / this.duration,
    );
    this.endVelocity = this.velocity.clone().setY(up - GRAVITY * this.duration);
  }

  /** Position `t` seconds into the toss. */
  at(t: number, out: THREE.Vector3) {
    const s = Math.min(Math.max(t, 0), this.duration);
    return out.copy(this.start).addScaledVector(this.velocity, s).setY(this.start.y + this.velocity.y * s - 0.5 * GRAVITY * s * s);
  }
}
