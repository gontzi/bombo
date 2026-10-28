import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { playClack, playImpacts, playRoll } from '../../audio/sounds';
import { cageSpeed, extractionPhase, type DrawPlan, type ExtractionPhase } from '../../domain/draw';
import { MAX_ENTRIES } from '../../domain/entries';
import { crankDrive } from '../../state/crank';
import { useBingoStore } from '../../state/store';
import { ChuteModel, CrankModel, FrameModel, WithFallback } from '../models';
import { queueWarmup } from '../warmup';
import { arrivals } from './arrivals';
import { BallSim } from './ballSim';
import { BallAtlas, createBallMaterial, createHeroTexture } from './ballTextures';
import { Cage } from './Cage';
import { CrankControl } from './CrankControl';
import { ExtractionPath, RETURN_MS, ReturnPath } from './extraction';
import { FallbackChute, FallbackCrank, FallbackFrame } from './fallbacks';
import { heroTracker } from './hero';
import { CAGE_CENTER, CAGE_RADIUS, LAYOUT, PORT_INSIDE, ballRadiusFor, trayRestPosition } from './layout';

/** Top cage speed in rad/s (about a turn per second, like a real hall cage). */
const OMEGA_MAX = 6.3;
/** Picking the winner out of the tray: it hops up and shrinks away before leaving the list. */
const PICK_MS = 320;
/** Turned by hand: the fastest the cage will go, and how quickly it coasts down once let go (per second). */
const HAND_MAX = OMEGA_MAX * 1.3;
const COAST = 0.7;
/**
 * Drawn by hand: let go, the cage keeps turning at least this fast (a last flick of the crank) until
 * the timeline's `slowEnd`, then the operator's hand on the crank brings it to rest as the ball comes out.
 */
const HAND_SPIN = OMEGA_MAX * 0.6;
const BRAKE = 1.4;

type HeldMode = 'return' | 'extract' | 'tray';

interface Held {
  id: string;
  ball: number;
  mode: HeldMode;
  extraction?: ExtractionPath;
  back?: ReturnPath;
  startedAt: number;
}

/**
 * The machine and everything that moves in it. One frame loop drives the
 * cage, the crank, the instanced balls and the extracted ball, all from the
 * store's draw plan: the winner is already decided, this only shows it.
 */
export function Machine() {
  const entries = useBingoStore((s) => s.entries);
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const radius = ballRadiusFor(entries.length);

  // Created once; sync() keeps it up to date with the list.
  const [sim] = useState(() => new BallSim(CAGE_CENTER, CAGE_RADIUS - LAYOUT.cage.wireRadius, radius, PORT_INSIDE));
  const atlas = useMemo(() => new BallAtlas(), []);
  const ballMaterial = useMemo(() => createBallMaterial(atlas), [atlas]);
  const sphere = useMemo(() => new THREE.SphereGeometry(1, 28, 18), []);
  const heroMaterial = useMemo(() => createBallMaterial(), []);
  const heroTextures = useRef(new Map<number, THREE.CanvasTexture>());

  const cageRef = useRef<THREE.Group>(null);
  const crankRef = useRef<THREE.Group>(null);
  const ballsRef = useRef<THREE.InstancedMesh>(null);
  const heroRef = useRef<THREE.Mesh>(null);

  const rt = useRef({
    initialised: false,
    angle: 0,
    /** Cage speed between draws, rad/s: what the hand gives it, coasting down when let go. */
    spin: 0,
    plan: null as DrawPlan | null,
    held: null as Held | null,
    lastPhase: 'waiting' as ExtractionPhase,
    heroPrev: new THREE.Vector3(),
    /** When the ball in the tray was clicked to take it out of the cage. */
    pickedAt: null as number | null,
  });

  /** The ball resting in the tray, if it can be taken out (not mid-draw, still in the list). */
  const pickable = () => {
    const held = rt.current.held;
    const { draw, entries: list } = useBingoStore.getState();
    return held?.mode === 'tray' && !draw && rt.current.pickedAt === null && list.some((e) => e.id === held.id);
  };

  // Balls follow the list: same ids, same numbers, new ones roll in at the port.
  useEffect(() => {
    sim.sync(
      entries.map((e) => e.id),
      radius,
      !rt.current.initialised,
      arrivals,
    );
    for (const e of entries) arrivals.delete(e.id);
    rt.current.initialised = true;
    atlas.draw(entries.map((e) => e.ball));
    (ballMaterial.userData.atlasRows as { value: number }).value = atlas.rows;
    const held = rt.current.held;
    if (held && !entries.some((e) => e.id === held.id)) {
      rt.current.held = null;
      rt.current.pickedAt = null;
    }
    invalidate();
  }, [entries, radius, sim, atlas, ballMaterial, invalidate]);

  // Demand rendering: a new draw (or result) must wake the frame loop even when every ball is asleep.
  useEffect(() => useBingoStore.subscribe(() => invalidate()), [invalidate]);

  useEffect(
    () => () => {
      atlas.dispose();
      ballMaterial.dispose();
      heroMaterial.dispose();
      sphere.dispose();
      for (const t of heroTextures.current.values()) t.dispose();
    },
    [atlas, ballMaterial, heroMaterial, sphere],
  );

  const heroTexture = (ball: number) => {
    let t = heroTextures.current.get(ball);
    if (!t) {
      t = createHeroTexture(ball);
      heroTextures.current.set(ball, t);
    }
    return t;
  };

  // The extracted ball only shows mid-draw: compile it now, with a map so it is the same shader it will use.
  useEffect(() => {
    heroMaterial.map = heroTexture(useBingoStore.getState().entries[0]?.ball ?? 1);
    queueWarmup(heroRef.current);
  }, [heroMaterial]);

  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const zero = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), []);
  const scaleV = useMemo(() => new THREE.Vector3(), []);
  const heroPos = useMemo(() => new THREE.Vector3(), []);
  const rollAxis = useMemo(() => new THREE.Vector3(), []);
  const rollQ = useMemo(() => new THREE.Quaternion(), []);
  const UP = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20);
    const now = performance.now();
    const { draw, entries: list, sound } = useBingoStore.getState();
    const state = rt.current;
    const r = ballRadiusFor(list.length);
    let heroVisible = false;

    if (draw) {
      const t = draw.plan.timeline;
      const ms = now - draw.startedAt;

      if (state.plan !== draw.plan) {
        state.plan = draw.plan;
        state.lastPhase = 'waiting';
        // Paint and upload the winner's texture now, seconds before it leaves the cage.
        gl.initTexture(heroTexture(draw.winner.ball));
        // The previous winner goes back into the cage before mixing starts.
        const held = state.held;
        if (held?.mode === 'tray' && sim.balls.has(held.id)) {
          if (draw.plan.reducedMotion) {
            releaseIntoCage(sim, held.id, CAGE_CENTER.clone().setY(CAGE_CENTER.y + CAGE_RADIUS * 0.4));
            state.held = null;
          } else {
            state.held = { ...held, mode: 'return', back: new ReturnPath(r), startedAt: now };
          }
        } else {
          state.held = null;
        }
      }

      if (draw.plan.hand) {
        // Keep the way and the speed the hand gave it, then slow it down.
        if (ms < t.slowEnd) {
          const goal = (state.spin < 0 ? -1 : 1) * Math.max(Math.abs(state.spin), HAND_SPIN);
          state.spin += (goal - state.spin) * (1 - Math.exp(-dt * 3));
        } else {
          state.spin *= Math.exp(-dt * BRAKE);
          if (Math.abs(state.spin) < 0.02) state.spin = 0;
        }
        crankDrive.take();
      } else {
        state.spin = cageSpeed(t, ms) * OMEGA_MAX;
      }
      sim.omega = state.spin;
      state.angle += sim.omega * dt;

      const held = state.held;
      if (held?.mode === 'return' && held.back) {
        const u = (now - held.startedAt) / RETURN_MS;
        held.back.at(Math.min(1, u), heroPos);
        heroVisible = true;
        if (u >= 1) {
          releaseIntoCage(sim, held.id, heroPos);
          state.held = null;
          heroVisible = false;
        }
      }

      const { phase, u } = extractionPhase(t, ms);
      if (phase !== 'waiting') {
        let current = state.held;
        if (!current || current.mode !== 'extract' || current.id !== draw.winner.id) {
          if (current?.mode === 'return') releaseIntoCage(sim, current.id, heroPos);
          const ball = sim.balls.get(draw.winner.id);
          const start = ball ? ball.position.clone() : PORT_INSIDE.clone();
          if (ball) ball.mode = 'held';
          current = {
            id: draw.winner.id,
            ball: draw.winner.ball,
            mode: 'extract',
            extraction: new ExtractionPath(start, r),
            startedAt: now,
          };
          state.held = current;
          state.heroPrev.copy(start);
        }
        current.extraction!.at(phase, u, heroPos);
        heroVisible = true;
        if (sound && phase !== state.lastPhase) {
          if (phase === 'chute') playRoll((t.rampEnd - t.portArrive) / 1000);
          if (phase === 'settle') playClack(1);
        }
        state.lastPhase = phase;
      }
    } else {
      // Between draws the cage only turns by hand: the crank follows the hand exactly, the balls feel how
      // fast that is, and once let go it coasts to a stop on its bearings.
      const turned = crankDrive.take();
      if (crankDrive.dragging) {
        state.angle += turned;
        const hand = THREE.MathUtils.clamp(turned / dt, -HAND_MAX, HAND_MAX);
        state.spin += (hand - state.spin) * (1 - Math.exp(-dt * 18));
      } else {
        state.spin *= Math.exp(-dt * COAST);
        if (Math.abs(state.spin) < 0.02) state.spin = 0;
        state.angle += state.spin * dt;
      }
      sim.omega = state.spin;
      state.plan = null;
      const held = state.held;
      if (held && (held.mode === 'extract' || held.mode === 'tray')) {
        held.mode = 'tray';
        heroPos.copy(trayRestPosition(r));
        heroVisible = true;
      }
    }

    sim.radius = r;
    sim.angle = state.angle;
    sim.step(dt);
    // Every audible collision of this frame becomes its own hit; smaller balls ring higher.
    const impacts = sim.drainImpacts();
    if (sound) playImpacts(impacts, Math.sqrt(LAYOUT.balls.maxRadius / r), CAGE_CENTER.x);
    if (cageRef.current) cageRef.current.rotation.x = state.angle;
    if (crankRef.current) crankRef.current.rotation.x = state.angle;

    // Instances: one per option, in list order (matching the atlas cells).
    const mesh = ballsRef.current;
    if (mesh) {
      mesh.count = list.length;
      list.forEach((entry, i) => {
        const b = sim.balls.get(entry.id);
        if (!b || b.mode === 'held') {
          mesh.setMatrixAt(i, zero);
          return;
        }
        scaleV.setScalar(r * b.scale);
        m4.compose(b.position, b.rotation, scaleV);
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }

    // The extracted ball: its own mesh and a sharper texture, rolling as it moves.
    const hero = heroRef.current;
    const held = state.held;
    if (hero) {
      hero.visible = heroVisible && !!held;
      if (hero.visible && held) {
        const map = heroTexture(held.ball);
        if (heroMaterial.map !== map) {
          heroMaterial.map = map;
          heroMaterial.needsUpdate = true;
        }
        rollAxis.subVectors(heroPos, state.heroPrev);
        const dist = rollAxis.length();
        if (dist > 1e-6) {
          rollAxis.crossVectors(UP, rollAxis).normalize();
          if (rollAxis.lengthSq() > 0.5) {
            rollQ.setFromAxisAngle(rollAxis, dist / r);
            hero.quaternion.premultiply(rollQ);
          }
        }
        let scale = r;
        if (state.pickedAt !== null) {
          const u = Math.min(1, (now - state.pickedAt) / PICK_MS);
          heroPos.y += Math.sin(u * Math.PI) * r * 2.2;
          scale = r * (1 - u * u);
          if (u >= 1) {
            state.pickedAt = null;
            useBingoStore.getState().removeEntry(held.id);
          }
        }
        hero.position.copy(heroPos);
        hero.scale.setScalar(Math.max(scale, 1e-4));
        const ball = sim.balls.get(held.id);
        if (ball) ball.position.copy(heroPos);
      }
      state.heroPrev.copy(heroPos);
      heroTracker.visible = hero.visible;
      if (hero.visible) heroTracker.position.copy(heroPos);
    }

    if (draw || sim.awake || state.spin !== 0 || crankDrive.dragging || state.held?.mode === 'return' || state.pickedAt !== null) {
      invalidate();
    }
  });

  return (
    <group>
      <WithFallback fallback={<FallbackFrame />}>
        <FrameModel />
      </WithFallback>
      <WithFallback fallback={<FallbackChute />}>
        <ChuteModel />
      </WithFallback>
      <group position={CAGE_CENTER}>
        <group ref={crankRef}>
          <WithFallback fallback={<FallbackCrank />}>
            <CrankModel />
          </WithFallback>
        </group>
        <Cage ref={cageRef} />
        <CrankControl />
      </group>
      <instancedMesh ref={ballsRef} args={[sphere, ballMaterial, MAX_ENTRIES]} castShadow receiveShadow frustumCulled={false} />
      <mesh
        ref={heroRef}
        geometry={sphere}
        material={heroMaterial}
        castShadow
        visible={false}
        // Hidden, it must not catch the pointer: three.js raycasts invisible meshes too, and this
        // one (and its wide target) would swallow clicks meant for anything behind it.
        raycast={heroRaycast}
        onClick={(e) => {
          if (!pickable()) return;
          e.stopPropagation();
          rt.current.pickedAt = performance.now();
          document.body.style.cursor = '';
          invalidate();
        }}
        onPointerOver={(e) => {
          if (!pickable()) return;
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
        }}
      >
        {/* A bigger, invisible target round the ball: it is small on screen. */}
        <mesh scale={2.2} raycast={heroRaycast}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </mesh>
    </group>
  );
}

/** Raycasts like any mesh, but only while the extracted ball (the parent of its wide target, or itself) shows. */
function heroRaycast(this: THREE.Mesh, raycaster: THREE.Raycaster, hits: THREE.Intersection[]) {
  const hero = (this.parent as THREE.Mesh | null)?.isMesh ? this.parent! : this;
  if (hero.visible) THREE.Mesh.prototype.raycast.call(this, raycaster, hits);
}

function releaseIntoCage(sim: BallSim, id: string, at: THREE.Vector3) {
  const ball = sim.balls.get(id);
  if (!ball) return;
  ball.mode = 'cage';
  ball.position.copy(at);
  ball.velocity.set(0, -0.6, 0);
  sim.wake();
}
