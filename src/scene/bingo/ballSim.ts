import * as THREE from 'three';

/**
 * Lightweight rigid-ball physics for the cage: gravity, a rotating spherical
 * wall that drags balls up by friction, and ball-ball collisions through a
 * spatial hash. Purely visual: nothing here decides who wins.
 */

export type BallMode = 'cage' | 'held';

export interface BallState {
  readonly id: string;
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly rotation: THREE.Quaternion;
  /** 0→1 when a ball is added, 1→0 when removed. */
  scale: number;
  targetScale: number;
  /** "held" balls are driven by the extraction animation, not by physics. */
  mode: BallMode;
}

const GRAVITY = 9.81;
const WALL_RESTITUTION = 0.35;
const BALL_RESTITUTION = 0.45;
const WALL_FRICTION = 0.32;
const MAX_SPEED = 3.2;
const SUBSTEPS = 3;

const tmpN = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpT = new THREE.Vector3();
const tmpAxis = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export class BallSim {
  readonly balls = new Map<string, BallState>();
  radius: number;
  /** Cage spin, rad/s around +X. */
  omega = 0;
  private sleepTimer = 0;
  private grid = new Map<number, BallState[]>();

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
   * Adds balls for new ids (growing in at the port) and drops the ones whose
   * option was deleted: they leave with their option, never linger unlinked.
   */
  sync(ids: readonly string[], radius: number, initial = false) {
    this.radius = radius;
    const wanted = new Set(ids);
    for (const id of this.balls.keys()) {
      if (!wanted.has(id)) this.balls.delete(id);
    }
    let k = 0;
    for (const id of ids) {
      if (this.balls.has(id)) continue;
      const position = initial ? this.randomRestingPoint(k++) : this.spawnPoint.clone();
      const velocity = initial ? new THREE.Vector3() : new THREE.Vector3(-0.9, 0.15, (Math.random() - 0.5) * 0.3);
      this.balls.set(id, {
        id,
        position,
        velocity,
        rotation: new THREE.Quaternion().setFromEuler(
          new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28),
        ),
        scale: initial ? 1 : 0,
        targetScale: 1,
        mode: 'cage',
      });
    }
    this.wake();
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

  step(dt: number) {
    const moving = this.omega !== 0 || [...this.balls.values()].some((b) => b.scale !== b.targetScale);
    if (!moving && !this.awake) return;

    const h = Math.min(dt, 1 / 30) / SUBSTEPS;
    let maxSpeed = 0;
    for (let s = 0; s < SUBSTEPS; s++) {
      for (const ball of this.balls.values()) {
        if (ball.mode !== 'cage') continue;
        ball.velocity.y -= GRAVITY * h;
        ball.velocity.multiplyScalar(0.9995);
        if (ball.velocity.lengthSq() > MAX_SPEED * MAX_SPEED) ball.velocity.setLength(MAX_SPEED);
        ball.position.addScaledVector(ball.velocity, h);
      }
      this.collideBalls();
      for (const ball of this.balls.values()) {
        if (ball.mode === 'cage') this.collideWall(ball);
      }
    }

    for (const ball of this.balls.values()) {
      if (ball.mode === 'cage') {
        const speed = ball.velocity.length();
        maxSpeed = Math.max(maxSpeed, speed);
        // Rolling: spin about the axis perpendicular to the motion.
        if (speed > 1e-4) {
          tmpAxis.crossVectors(UP, ball.velocity).normalize();
          if (tmpAxis.lengthSq() > 0.5) {
            tmpQ.setFromAxisAngle(tmpAxis, (speed * Math.min(dt, 1 / 30)) / this.radius);
            ball.rotation.premultiply(tmpQ);
          }
        }
      }
      if (ball.scale !== ball.targetScale) {
        const delta = Math.min(dt, 1 / 30) * 4;
        ball.scale =
          ball.targetScale > ball.scale
            ? Math.min(ball.targetScale, ball.scale + delta)
            : Math.max(ball.targetScale, ball.scale - delta);
      }
    }
    this.sleepTimer = this.omega === 0 && maxSpeed < 0.03 ? this.sleepTimer + dt : 0;
  }

  private collideWall(ball: BallState) {
    const limit = this.cageRadius - this.radius;
    tmpN.subVectors(ball.position, this.center);
    const d = tmpN.length();
    if (d <= limit || d === 0) return;
    tmpN.divideScalar(d);
    ball.position.copy(this.center).addScaledVector(tmpN, limit);

    const vn = ball.velocity.dot(tmpN);
    if (vn > 0) ball.velocity.addScaledVector(tmpN, -(1 + WALL_RESTITUTION) * vn);

    // Friction against the moving wall: ω × r, with ω along +X.
    tmpW.set(0, -this.omega * (ball.position.z - this.center.z), this.omega * (ball.position.y - this.center.y));
    tmpT.copy(ball.velocity).sub(tmpW);
    tmpT.addScaledVector(tmpN, -tmpT.dot(tmpN));
    ball.velocity.addScaledVector(tmpT, -WALL_FRICTION);
  }

  private collideBalls() {
    const cell = this.radius * 2;
    const grid = this.grid;
    grid.clear();
    const key = (x: number, y: number, z: number) => ((x + 512) << 20) | ((y + 512) << 10) | (z + 512);
    const cellOf = (v: number) => Math.floor(v / cell);

    for (const ball of this.balls.values()) {
      if (ball.mode !== 'cage') continue;
      const k = key(cellOf(ball.position.x), cellOf(ball.position.y), cellOf(ball.position.z));
      const bucket = grid.get(k);
      if (bucket) bucket.push(ball);
      else grid.set(k, [ball]);
    }

    const minDist = this.radius * 2;
    const minDistSq = minDist * minDist;
    for (const a of this.balls.values()) {
      if (a.mode !== 'cage') continue;
      const cx = cellOf(a.position.x);
      const cy = cellOf(a.position.y);
      const cz = cellOf(a.position.z);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++) {
            const bucket = grid.get(key(cx + dx, cy + dy, cz + dz));
            if (!bucket) continue;
            for (const b of bucket) {
              if (b.id <= a.id) continue;
              tmpN.subVectors(b.position, a.position);
              const dSq = tmpN.lengthSq();
              if (dSq >= minDistSq || dSq === 0) continue;
              const d = Math.sqrt(dSq);
              tmpN.divideScalar(d);
              const push = (minDist - d) / 2;
              a.position.addScaledVector(tmpN, -push);
              b.position.addScaledVector(tmpN, push);
              const rel = tmpT.subVectors(b.velocity, a.velocity).dot(tmpN);
              if (rel < 0) {
                const j = (-(1 + BALL_RESTITUTION) * rel) / 2;
                a.velocity.addScaledVector(tmpN, -j);
                b.velocity.addScaledVector(tmpN, j);
              }
            }
          }
    }
  }
}
