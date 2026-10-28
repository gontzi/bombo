import * as THREE from 'three';
import { LAYOUT } from './layout';

/**
 * Rigid-ball physics for the cage: gravity, air, a rotating spherical wall
 * and ball-ball collisions through a spatial hash. Every ball carries its own
 * spin, and contacts (wire or ball) have Coulomb friction at the contact
 * point, so balls roll along the drum, get carried up by it, set each other
 * spinning when they rub and tumble back down instead of sliding about like
 * ice. The meridian wires stand proud of the drum and catch the balls as it
 * turns, which is what really lifts them in a bingo cage. Purely visual:
 * nothing here decides who wins.
 */

export type BallMode = 'cage' | 'held';

export interface BallState {
  readonly id: string;
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  /** Angular velocity, rad/s about world axes. */
  readonly spin: THREE.Vector3;
  readonly rotation: THREE.Quaternion;
  /** 0→1 when a ball is added, 1→0 when removed. */
  scale: number;
  targetScale: number;
  /** "held" balls are driven by the extraction animation, not by physics. */
  mode: BallMode;
}

const GRAVITY = 9.81;
/** The wire gives a little, so balls come off it softer than off each other. */
const WALL_RESTITUTION = 0.5;
const BALL_RESTITUTION = 0.72;
/** Approach speeds below this (m/s) are resting contact: no bounce, so piles sit still instead of buzzing. */
const REST_SPEED = 0.12;
/** Coulomb friction: plastic on brass wire, and plastic on plastic. */
const WALL_FRICTION = 0.4;
const BALL_FRICTION = 0.15;
/** Hollow plastic shell: I = k·m·r². */
const INERTIA = 2 / 3;
/** Rolling resistance, per second of spin. */
const SPIN_DAMPING = 1.1;
/** Air, per second of speed. */
const AIR_DRAG = 0.08;
/** A meridian under the ball holds it this much (0–1) and bumps it inwards in proportion to the slip. */
const RIB_GRIP = 0.8;
const RIB_KICK = 0.65;
const MAX_SPEED = 4;
const SUBSTEPS = 4;
/** Approach speeds below this (m/s) are resting contact, not audible hits. */
const AUDIBLE_SPEED = 0.1;
const MAX_IMPACTS = 64;

export type ImpactKind = 'ball' | 'wire';

/** A collision worth hearing, collected for the audio layer. */
export interface Impact {
  kind: ImpactKind;
  /** 0–1, from the approach speed. */
  strength: number;
  /** World x of the contact, for stereo panning. */
  x: number;
}

const strengthFor = (speed: number) => Math.min(1, (speed - AUDIBLE_SPEED) / 1.2);

const tmpN = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpT = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpJ = new THREE.Vector3();
const tmpAxis = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

export class BallSim {
  readonly balls = new Map<string, BallState>();
  radius: number;
  /** Cage spin, rad/s around +X. */
  omega = 0;
  /** How far the cage has turned, rad around +X: where its meridian wires are. */
  angle = 0;
  /** Meridian wires round the drum, evenly spaced from angle 0. */
  meridians = LAYOUT.cage.meridians;
  private sleepTimer = 0;
  private grid = new Map<number, number[]>();
  /** This substep's balls, with where they started it and how fast they were going. */
  private live: BallState[] = [];
  private before: THREE.Vector3[] = [];
  private prior: THREE.Vector3[] = [];
  /** Flat list of this substep's contacts: ball, other ball (-1 for the wall), normal xyz, overlap. */
  private contacts: number[] = [];
  private impacts: Impact[] = [];

  /** Returns and clears the collisions since the last call, loudest first. */
  drainImpacts(): Impact[] {
    const out = this.impacts.sort((a, b) => b.strength - a.strength);
    this.impacts = [];
    return out;
  }

  private recordImpact(kind: ImpactKind, speed: number, x: number) {
    if (speed < AUDIBLE_SPEED) return;
    const impact = { kind, strength: strengthFor(speed), x };
    if (this.impacts.length < MAX_IMPACTS) {
      this.impacts.push(impact);
      return;
    }
    // Full: keep the louder hit.
    let quietest = 0;
    for (let i = 1; i < this.impacts.length; i++) {
      if (this.impacts[i]!.strength < this.impacts[quietest]!.strength) quietest = i;
    }
    if (this.impacts[quietest]!.strength < impact.strength) this.impacts[quietest] = impact;
  }

  constructor(
    readonly center: THREE.Vector3,
    readonly cageRadius: number,
    radius: number,
    private readonly spawnPoint: THREE.Vector3,
  ) {
    this.radius = radius;
  }

  get awake(): boolean {
    return this.sleepTimer < 1.2;
  }

  wake() {
    this.sleepTimer = 0;
  }

  /**
   * Adds balls for new ids (growing in at the port, or full size where
   * `arrivals` says they come in) and drops the ones whose option was
   * deleted: they leave with their option, never linger unlinked.
   */
  sync(
    ids: readonly string[],
    radius: number,
    initial = false,
    arrivals?: ReadonlyMap<string, { position: THREE.Vector3; velocity: THREE.Vector3 }>,
  ) {
    this.radius = radius;
    const wanted = new Set(ids);
    for (const id of this.balls.keys()) {
      if (!wanted.has(id)) this.balls.delete(id);
    }
    let k = 0;
    for (const id of ids) {
      if (this.balls.has(id)) continue;
      const arrival = arrivals?.get(id);
      const position = arrival ? arrival.position.clone() : initial ? this.randomRestingPoint(k++) : this.spawnPoint.clone();
      const velocity = arrival
        ? arrival.velocity.clone()
        : initial
          ? new THREE.Vector3()
          : new THREE.Vector3(-0.9, 0.15, (Math.random() - 0.5) * 0.3);
      this.balls.set(id, {
        id,
        position,
        velocity,
        spin: new THREE.Vector3(),
        rotation: new THREE.Quaternion().setFromEuler(
          new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28),
        ),
        scale: initial || arrival ? 1 : 0,
        targetScale: 1,
        mode: 'cage',
      });
    }
    if (initial) this.relax();
    this.wake();
  }

  /** Pushes a fresh pile apart without giving it any speed, so it does not burst open on load. */
  private relax() {
    this.live.length = 0;
    for (const ball of this.balls.values()) if (ball.mode === 'cage') this.live.push(ball);
    for (let k = 0; k < 24; k++) {
      this.separateBalls();
      this.live.forEach((ball, i) => this.separateWall(ball, i));
    }
    this.contacts.length = 0;
  }

  /** Scatters initial balls in the lower half of the cage so they settle quickly. */
  private randomRestingPoint(k: number): THREE.Vector3 {
    const inner = this.cageRadius - this.radius * 1.2;
    const golden = 2.399963;
    const r = inner * Math.sqrt(0.15 + 0.8 * ((k * 0.618) % 1));
    const a = k * golden;
    return new THREE.Vector3(
      this.center.x + Math.cos(a) * r * 0.85,
      this.center.y - inner * 0.35 + ((k * 0.37) % 1) * inner * 0.6,
      this.center.z + Math.sin(a) * r * 0.85,
    );
  }

  /**
   * One frame, in substeps. Each substep is position-based: move every ball,
   * push overlaps apart (ball on ball, then ball on wire), and take the
   * velocity from how far the ball really went, so stacked balls rest
   * instead of buzzing. A velocity pass over the contacts found then adds
   * the bounce and the friction.
   */
  step(dt: number) {
    const moving = this.omega !== 0 || [...this.balls.values()].some((b) => b.scale !== b.targetScale);
    if (!moving && !this.awake) return;

    const frame = Math.min(dt, 1 / 30);
    const h = frame / SUBSTEPS;
    const live = this.live;
    live.length = 0;
    for (const ball of this.balls.values()) if (ball.mode === 'cage') live.push(ball);
    while (this.before.length < live.length) this.before.push(new THREE.Vector3());
    while (this.prior.length < live.length) this.prior.push(new THREE.Vector3());

    const air = 1 - AIR_DRAG * h;
    const roll = 1 - SPIN_DAMPING * h;
    for (let s = 0; s < SUBSTEPS; s++) {
      live.forEach((ball, i) => {
        ball.velocity.y -= GRAVITY * h;
        ball.velocity.multiplyScalar(air);
        if (ball.velocity.lengthSq() > MAX_SPEED * MAX_SPEED) ball.velocity.setLength(MAX_SPEED);
        this.before[i]!.copy(ball.position);
        this.prior[i]!.copy(ball.velocity);
        ball.position.addScaledVector(ball.velocity, h);
        ball.spin.multiplyScalar(roll);
      });
      this.angle += this.omega * h;
      this.contacts.length = 0;
      this.separateBalls();
      live.forEach((ball, i) => this.separateWall(ball, i));
      live.forEach((ball, i) => ball.velocity.subVectors(ball.position, this.before[i]!).divideScalar(h));
      this.resolveContacts(h);
    }

    let maxSpeed = 0;
    for (const ball of live) {
      maxSpeed = Math.max(maxSpeed, ball.velocity.length());
      // Turn each ball by its own spin, so the numbers tumble the way it really rolls.
      const w = ball.spin.length();
      if (w > 1e-4) {
        tmpQ.setFromAxisAngle(tmpAxis.copy(ball.spin).divideScalar(w), w * frame);
        ball.rotation.premultiply(tmpQ);
      }
    }
    for (const ball of this.balls.values()) {
      if (ball.scale !== ball.targetScale) {
        const delta = frame * 4;
        ball.scale =
          ball.targetScale > ball.scale
            ? Math.min(ball.targetScale, ball.scale + delta)
            : Math.max(ball.targetScale, ball.scale - delta);
      }
    }
    this.sleepTimer = this.omega === 0 && maxSpeed < 0.03 ? this.sleepTimer + dt : 0;
  }

  private addContact(a: number, b: number, n: THREE.Vector3, depth: number) {
    this.contacts.push(a, b, n.x, n.y, n.z, depth);
  }

  private separateWall(ball: BallState, i: number) {
    const limit = this.cageRadius - this.radius;
    tmpN.subVectors(ball.position, this.center);
    const d = tmpN.length();
    if (d <= limit || d === 0) return;
    tmpN.divideScalar(d);
    ball.position.copy(this.center).addScaledVector(tmpN, limit);
    this.addContact(i, -1, tmpN, d - limit);
  }

  private separateBalls() {
    const cell = this.radius * 2;
    const grid = this.grid;
    const live = this.live;
    grid.clear();
    const key = (x: number, y: number, z: number) => ((x + 512) << 20) | ((y + 512) << 10) | (z + 512);
    const cellOf = (v: number) => Math.floor(v / cell);

    live.forEach((ball, i) => {
      const k = key(cellOf(ball.position.x), cellOf(ball.position.y), cellOf(ball.position.z));
      const bucket = grid.get(k);
      if (bucket) bucket.push(i);
      else grid.set(k, [i]);
    });

    const minDist = this.radius * 2;
    const minDistSq = minDist * minDist;
    for (let i = 0; i < live.length; i++) {
      const a = live[i]!;
      const cx = cellOf(a.position.x);
      const cy = cellOf(a.position.y);
      const cz = cellOf(a.position.z);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++) {
            const bucket = grid.get(key(cx + dx, cy + dy, cz + dz));
            if (!bucket) continue;
            for (const j of bucket) {
              if (j <= i) continue;
              const b = live[j]!;
              tmpN.subVectors(b.position, a.position);
              const dSq = tmpN.lengthSq();
              if (dSq >= minDistSq || dSq === 0) continue;
              const d = Math.sqrt(dSq);
              tmpN.divideScalar(d);
              const push = (minDist - d) / 2;
              a.position.addScaledVector(tmpN, -push);
              b.position.addScaledVector(tmpN, push);
              this.addContact(i, j, tmpN, minDist - d);
            }
          }
    }
  }

  /**
   * Friction at a contact: the impulse that would stop the contact point
   * slipping, shared between the ball's travel and its spin, capped by
   * Coulomb's law. `share` is 1 against the wall, 2 between two equal balls.
   */
  private frictionImpulse(slip: THREE.Vector3, share: number, limit: number, out: THREE.Vector3) {
    out.copy(slip).multiplyScalar(-1 / (share * (1 + 1 / INERTIA)));
    const j = out.length();
    if (j > limit) out.multiplyScalar(limit / j);
    return out;
  }

  /** Bounce and friction for this substep's contacts; how hard each was pressed comes from how far it was pushed. */
  private resolveContacts(h: number) {
    const live = this.live;
    const c = this.contacts;
    for (let k = 0; k < c.length; k += 6) {
      const a = live[c[k]!]!;
      const bi = c[k + 1]!;
      tmpN.set(c[k + 2]!, c[k + 3]!, c[k + 4]!);
      const depth = c[k + 5]!;
      if (bi < 0) this.resolveWall(a, this.prior[c[k]!]!, depth, h);
      else this.resolvePair(a, live[bi]!, this.prior[c[k]!]!, this.prior[bi]!, depth, h);
    }
  }

  private resolveWall(ball: BallState, prior: THREE.Vector3, depth: number, h: number) {
    const r = this.radius;
    const R = this.cageRadius;
    // How fast it was heading into the wire before the push, and how hard the push pressed it.
    const approach = prior.dot(tmpN);
    let jn = depth / h;
    if (approach > 0) this.recordImpact('wire', approach, ball.position.x);
    if (approach > REST_SPEED) {
      const vn = ball.velocity.dot(tmpN);
      const bounce = -WALL_RESTITUTION * approach - vn;
      ball.velocity.addScaledVector(tmpN, bounce);
      jn += Math.abs(bounce);
    }

    // Slip at the contact: the ball's surface (v + ω × r·n) against the drum there (Ω × R·n, Ω along +X).
    tmpW.set(0, -this.omega * R * tmpN.z, this.omega * R * tmpN.y);
    tmpC.crossVectors(ball.spin, tmpN).multiplyScalar(r).add(ball.velocity).sub(tmpW);
    tmpT.copy(tmpC).addScaledVector(tmpN, -tmpC.dot(tmpN));
    this.frictionImpulse(tmpT, 1, WALL_FRICTION * jn, tmpJ);
    ball.velocity.add(tmpJ);
    ball.spin.add(tmpAxis.crossVectors(tmpN, tmpJ).divideScalar(INERTIA * r));

    // A meridian wire under the ball catches it (away from the poles, where they bunch up).
    const rho = Math.hypot(tmpN.y, tmpN.z);
    if (rho < 0.3) return;
    const gap = (Math.PI * 2) / this.meridians;
    let off = Math.atan2(tmpN.z, tmpN.y) - this.angle;
    off -= gap * Math.round(off / gap);
    if (Math.abs(off * rho * R) > r * 0.6) return;
    // Round the axis, the way the drum turns: how far the ball's centre lags the wire's own speed there.
    // A smooth drum would only make the ball roll on the spot at the bottom; the wire is a paddle,
    // and shoves a ball sitting just ahead of it up the side until it tumbles off.
    tmpAxis.set(0, -tmpN.z / rho, tmpN.y / rho);
    const lag = ball.velocity.dot(tmpAxis) - this.omega * rho * (R - r);
    if (off * this.omega > 0 && lag * this.omega < 0) {
      ball.velocity.addScaledVector(tmpAxis, -lag * RIB_GRIP);
    } else {
      // Running over the wire instead: it bumps the ball off the drum.
      ball.velocity.addScaledVector(tmpN, -Math.abs(lag) * RIB_KICK);
    }
  }

  private resolvePair(a: BallState, b: BallState, priorA: THREE.Vector3, priorB: THREE.Vector3, depth: number, h: number) {
    const r = this.radius;
    const approach = tmpT.subVectors(priorA, priorB).dot(tmpN);
    let jn = depth / (2 * h);
    if (approach > 0) this.recordImpact('ball', approach, (a.position.x + b.position.x) / 2);
    if (approach > REST_SPEED) {
      const separating = tmpT.subVectors(b.velocity, a.velocity).dot(tmpN);
      const bounce = (BALL_RESTITUTION * approach - separating) / 2;
      if (bounce > 0) {
        a.velocity.addScaledVector(tmpN, -bounce);
        b.velocity.addScaledVector(tmpN, bounce);
        jn += bounce;
      }
    }

    // Rubbing surfaces: b's contact point (v - ω × r·n) against a's (v + ω × r·n).
    tmpC.crossVectors(a.spin, tmpN).add(tmpW.crossVectors(b.spin, tmpN)).multiplyScalar(-r);
    tmpC.add(b.velocity).sub(a.velocity);
    tmpT.copy(tmpC).addScaledVector(tmpN, -tmpC.dot(tmpN));
    this.frictionImpulse(tmpT, 2, BALL_FRICTION * jn, tmpJ);
    b.velocity.add(tmpJ);
    a.velocity.sub(tmpJ);
    // The same torque turns both balls the same way, so their surfaces roll off each other.
    tmpAxis.crossVectors(tmpN, tmpJ).divideScalar(-INERTIA * r);
    a.spin.add(tmpAxis);
    b.spin.add(tmpAxis);
  }
}
