import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { playButton, unlockAudio } from '../../audio/sounds';
import type { Entry } from '../../domain/entries';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { tipRack, useRack } from '../../state/rack';
import { RACK_SLOTS, useBingoStore } from '../../state/store';
import { arrivals } from '../bingo/arrivals';
import { createBallMaterial, createHeroTexture } from '../bingo/ballTextures';
import { TossPath } from '../bingo/extraction';
import { ballRadiusFor } from '../bingo/layout';
import { glowRef } from '../bloom';
import { brass } from '../materials';
import { RackModel, WithFallback } from '../models';
import { woodTexture } from '../room/textures';
import { RACK, RACK_BALL_RADIUS, rackSlot } from './layout';
import { RackPlate } from './RackPlate';

/** A new ball drops into its cup from this high, and takes this long to settle. */
const DROP = 0.09;
const APPEAR_MS = 420;
/** Tipping into the cage: one ball after another. */
const STAGGER_MS = 140;
const CAP_R = RACK.buttonRadius;

type Phase = 'appear' | 'rest' | 'fly';

interface RackBall {
  entry: Entry;
  slot: number;
  mesh: number;
  phase: Phase;
  startedAt: number;
  path?: TossPath;
}

const RACK_SIZE = {
  w: RACK.perTier * RACK.pitch + 2 * RACK.sideMargin + 2 * RACK.cheek + 0.02,
  d: RACK.tiers * RACK.tierDepth + 0.02,
  h: RACK.plinth + RACK.baseHeight + RACK.tierRise * RACK.tiers + 0.05,
};

function FallbackRack() {
  return (
    <mesh position-y={RACK_SIZE.h / 3} castShadow receiveShadow>
      <boxGeometry args={[RACK_SIZE.w, (RACK_SIZE.h * 2) / 3, RACK_SIZE.d]} />
      <meshStandardMaterial color="#33190f" roughness={0.45} />
    </mesh>
  );
}

/** Raycasts like any mesh, but only while it shows: a hidden ball must not catch the pointer. */
function visibleRaycast(this: THREE.Mesh, raycaster: THREE.Raycaster, hits: THREE.Intersection[]) {
  if (this.visible) THREE.Mesh.prototype.raycast.call(this, raycaster, hits);
}

/** The target that opens the rack wraps its balls: once open, it lets the pointer through to them. */
function closedRaycast(this: THREE.Mesh, raycaster: THREE.Raycaster, hits: THREE.Intersection[]) {
  if (!useRack.getState().open) THREE.Mesh.prototype.raycast.call(this, raycaster, hits);
}

/**
 * The ball rack beside the machine, where options are added: tapping it
 * brings the camera in, options are written on the brass plate in front
 * (RackPlate) and each drops into the next free cup as a numbered ball
 * (tap one to take it out again), and the green button tips them all into
 * the cage, one after another, through the gap at its top.
 */
export function Rack() {
  const invalidate = useThree((s) => s.invalidate);
  const reducedMotion = useReducedMotion();
  const open = useRack((s) => s.open);
  const tipping = useRack((s) => s.tipping);
  const pendingCount = useBingoStore((s) => s.pending.length);
  const drawing = useBingoStore((s) => s.draw !== null);
  const [hovered, setHovered] = useState<'rack' | 'button' | 'ball' | null>(null);

  const sphere = useMemo(() => new THREE.SphereGeometry(1, 28, 18), []);
  const materials = useMemo(() => Array.from({ length: RACK_SLOTS }, () => createBallMaterial()), []);
  const textures = useRef(new Map<number, THREE.CanvasTexture>());
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const balls = useRef(new Map<string, RackBall>());
  /** When the current tip started, and whether the rack did it itself to make room (it then stays open). */
  const tipStart = useRef<number | null>(null);
  const tipAuto = useRef(false);

  const button = useMemo(() => {
    const cap = new THREE.LatheGeometry(
      [
        [0, 0.026],
        [CAP_R * 0.5, 0.025],
        [CAP_R * 0.85, 0.021],
        [CAP_R, 0.014],
        [CAP_R * 1.02, 0.009],
        [CAP_R * 0.85, 0.006],
        [CAP_R * 0.8, 0],
        [0, 0],
      ]
        .reverse()
        .map(([r, y]) => new THREE.Vector2(r, y)),
      40,
    );
    const bezel = new THREE.LatheGeometry(
      [
        [CAP_R + 0.002, 0],
        [CAP_R + 0.011, 0],
        [CAP_R + 0.012, 0.005],
        [CAP_R + 0.003, 0.009],
        [CAP_R + 0.002, 0.003],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      40,
    );
    const capMaterial = new THREE.MeshPhysicalMaterial({
      color: '#1f7a3a',
      roughness: 0.26,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      emissive: new THREE.Color('#33ff77'),
      emissiveIntensity: 0,
    });
    const woodMap = woodTexture([1, 1], 47);
    const wood = new THREE.MeshPhysicalMaterial({ map: woodMap, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.2 });
    const hit = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    return { cap, bezel, capMaterial, woodMap, wood, hit };
  }, []);
  const capRef = useRef<THREE.Group>(null);
  const travel = useRef(0);
  const pressed = useRef(false);

  useEffect(
    () => () => {
      sphere.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures.current.values()) t.dispose();
      button.cap.dispose();
      button.bezel.dispose();
      button.capMaterial.dispose();
      button.woodMap.dispose();
      button.wood.dispose();
      button.hit.dispose();
    },
    [sphere, materials, button],
  );

  useEffect(() => {
    const canPick =
      hovered === 'rack'
        ? !open && !drawing && !tipping
        : hovered === 'button'
          ? pendingCount > 0 && !drawing
          : hovered === 'ball' && open && !tipping;
    document.body.style.cursor = canPick ? 'pointer' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered, open, drawing, tipping, pendingCount]);

  // Demand rendering: the list changing (or the green button) has to wake the frame loop.
  useEffect(() => useBingoStore.subscribe(() => invalidate()), [invalidate]);
  useEffect(() => useRack.subscribe(() => invalidate()), [invalidate]);

  const texture = (ball: number) => {
    let t = textures.current.get(ball);
    if (!t) {
      t = createHeroTexture(ball);
      textures.current.set(ball, t);
    }
    return t;
  };

  const p = useMemo(() => new THREE.Vector3(), []);
  const yaw = useMemo(() => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), RACK.yaw), []);

  useFrame((_, delta) => {
    const now = performance.now();
    const { pending, entries } = useBingoStore.getState();
    const map = balls.current;
    let moving = false;

    // Follow the store: new options drop into free cups, removed ones go.
    const wanted = new Set(pending.map((e) => e.id));
    for (const [id, b] of map) if (b.phase !== 'fly' && !wanted.has(id)) map.delete(id);
    for (const entry of pending) {
      if (map.has(entry.id)) continue;
      const used = new Set([...map.values()].map((b) => b.slot));
      const meshesUsed = new Set([...map.values()].map((b) => b.mesh));
      let slot = 0;
      while (used.has(slot)) slot++;
      let mesh = 0;
      while (meshesUsed.has(mesh)) mesh++;
      if (slot >= RACK_SLOTS || mesh >= RACK_SLOTS) break;
      map.set(entry.id, { entry, slot, mesh, phase: reducedMotion ? 'rest' : 'appear', startedAt: now });
      const material = materials[mesh]!;
      material.map = texture(entry.ball);
      material.needsUpdate = true;
    }

    // Full, with more options waiting: the rack tips itself into the cage to make room for them.
    const rack = useRack.getState();
    if (pending.length > RACK_SLOTS && !rack.tipping && !useBingoStore.getState().draw) tipRack(true);

    // The green button (or the rack itself): start every ball in a cup on its way, front row first.
    if (useRack.getState().tipping && tipStart.current === null) {
      tipStart.current = now;
      tipAuto.current = useRack.getState().auto;
      const order = [...map.values()].filter((b) => b.phase !== 'fly').sort((a, b) => a.slot - b.slot);
      order.forEach((b, k) => {
        b.phase = 'fly';
        b.startedAt = now + (reducedMotion ? 0 : k * STAGGER_MS);
        b.path = new TossPath(rackSlot(b.slot), ballRadiusFor(entries.length + pending.length));
      });
    }

    const cageRadius = ballRadiusFor(entries.length + pending.length);
    for (const [id, b] of map) {
      const mesh = meshes.current[b.mesh];
      if (!mesh) continue;
      const u = (now - b.startedAt) / (b.phase === 'fly' ? (reducedMotion ? 1 : b.path!.duration * 1000) : APPEAR_MS);
      rackSlot(b.slot, p);
      let scale = RACK_BALL_RADIUS;
      if (b.phase === 'appear') {
        // Dropped into the cup: falls, then two small bounces.
        const t = Math.min(1, Math.max(0, u));
        const fall = t < 0.45 ? 1 - (t / 0.45) ** 2 : Math.abs(Math.sin(((t - 0.45) / 0.55) * Math.PI * 2)) * 0.12 * (1 - t);
        p.y += fall * DROP;
        if (u >= 1) b.phase = 'rest';
        else moving = true;
      } else if (b.phase === 'fly') {
        if (u < 0) {
          moving = true;
        } else {
          const path = b.path!;
          path.at(Math.min(1, u) * path.duration, p);
          scale = THREE.MathUtils.lerp(RACK_BALL_RADIUS, cageRadius, Math.min(1, u));
          moving = true;
          if (u >= 1) {
            // Into the cage, still falling: the simulation carries on from exactly here, at this speed.
            arrivals.set(id, { position: path.end.clone(), velocity: path.endVelocity.clone() });
            map.delete(id);
            mesh.visible = false;
            useBingoStore.getState().commitPending(id);
            continue;
          }
        }
      }
      mesh.visible = true;
      mesh.position.copy(p);
      mesh.scale.setScalar(scale);
      // One of its numbered faces looks out of the front of the rack.
      mesh.quaternion.copy(yaw);
    }
    for (let i = 0; i < RACK_SLOTS; i++) {
      const mesh = meshes.current[i];
      if (mesh && ![...map.values()].some((b) => b.mesh === i)) mesh.visible = false;
    }

    // Everything has gone in: hand the camera back to the machine, unless the rack only made room.
    if (tipStart.current !== null && ![...map.values()].some((b) => b.phase === 'fly')) {
      tipStart.current = null;
      useRack.getState().setTipping(false);
      if (!tipAuto.current) useRack.getState().setOpen(false);
    }

    // Green button: sinks while pressed and while tipping, lit while there is something to tip.
    const down = pressed.current || useRack.getState().tipping;
    const k = reducedMotion ? 1 : 1 - Math.exp(-delta * 28);
    travel.current += ((down ? 0.008 : 0) - travel.current) * k;
    if (capRef.current) capRef.current.position.y = -travel.current;
    const ready = pending.length > 0 && !useBingoStore.getState().draw;
    // While the rack is open it pulses, to say where the balls go next.
    const pulsing = ready && useRack.getState().open && !reducedMotion;
    const glow = ready ? (hovered === 'button' ? 0.9 : 0.45 + (pulsing ? 0.25 * Math.sin(now / 320) : 0)) : 0;
    button.capMaterial.emissiveIntensity += (glow - button.capMaterial.emissiveIntensity) * Math.min(1, delta * 10);
    button.capMaterial.color.set(ready || down ? '#1f7a3a' : '#3d4a40');

    if (moving || pulsing || Math.abs(glow - button.capMaterial.emissiveIntensity) > 0.01 || Math.abs(travel.current - (down ? 0.008 : 0)) > 1e-5) invalidate();
  });

  const onRack = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const rack = useRack.getState();
    if (rack.open || rack.tipping || useBingoStore.getState().draw) return;
    rack.setOpen(true);
  };

  const onButtonDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (useBingoStore.getState().pending.length === 0 || useBingoStore.getState().draw) return;
    pressed.current = true;
    unlockAudio();
    if (useBingoStore.getState().sound) playButton();
    invalidate();
  };
  const onButtonUp = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (pressed.current) {
      pressed.current = false;
      tipRack();
    }
    invalidate();
  };

  const balls3d: ReactNode[] = Array.from({ length: RACK_SLOTS }, (_, i) => (
    <mesh
      key={i}
      ref={(m) => {
        meshes.current[i] = m;
      }}
      geometry={sphere}
      material={materials[i]}
      castShadow
      receiveShadow
      visible={false}
      raycast={visibleRaycast}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered('ball');
      }}
      onPointerOut={() => setHovered(null)}
      onClick={(e) => {
        // Changed your mind: tap a waiting ball to take it back out of the rack.
        e.stopPropagation();
        if (!useRack.getState().open || useRack.getState().tipping) return;
        const ball = [...balls.current.values()].find((b) => b.mesh === i && b.phase !== 'fly');
        if (ball) useBingoStore.getState().removePending(ball.entry.id);
      }}
    />
  ));

  const [bx, , bz] = RACK.button as [number, number, number];

  return (
    <group>
      <group position={RACK.center as [number, number, number]} rotation-y={RACK.yaw}>
        <WithFallback fallback={<FallbackRack />}>
          <RackModel />
        </WithFallback>
        {/* Tap anywhere on the rack to open it. */}
        <mesh
          material={button.hit}
          position-y={RACK_SIZE.h / 2}
          raycast={closedRaycast}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered('rack');
          }}
          onPointerOut={() => setHovered(null)}
          onClick={onRack}
        >
          <boxGeometry args={[RACK_SIZE.w + 0.02, RACK_SIZE.h, RACK_SIZE.d + 0.02]} />
        </mesh>
        <RackPlate position={[-0.065, 0, 0.18]} />
        {/* The green button on its own little walnut pedestal in front of the rack. */}
        <group position={[bx, 0, bz]}>
          <mesh material={button.wood} position-y={0.012} castShadow receiveShadow>
            <cylinderGeometry args={[CAP_R + 0.02, CAP_R + 0.026, 0.024, 32]} />
          </mesh>
          <group position-y={0.024}>
            <mesh geometry={button.bezel} material={brass} castShadow />
            <group ref={capRef}>
              <mesh geometry={button.cap} material={button.capMaterial} castShadow position-y={0.002} ref={glowRef} />
            </group>
          </group>
          <mesh
            material={button.hit}
            position-y={0.03}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHovered('button');
            }}
            onPointerOut={() => {
              setHovered(null);
              pressed.current = false;
            }}
            onPointerDown={onButtonDown}
            onPointerUp={onButtonUp}
          >
            <cylinderGeometry args={[CAP_R * 2, CAP_R * 2, 0.07, 20]} />
          </mesh>
        </group>
      </group>
      {balls3d}
    </group>
  );
}
