import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { playTick } from '../audio/tick';
import { rotationAt } from '../domain/planSpin';
import { boundaryCount } from '../domain/wheelMath';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useWheelStore } from '../state/store';
import { MAX_PEGS, POINTER_PIVOT_X, POINTER_TIP_X, POINTER_Z } from './dimensions';
import { createPointerGeometry } from './geometry';
import { brass, inkLacquer } from './materials';
import { PointerFlapModel, WithFallback } from './models';

const LENGTH = POINTER_PIVOT_X - POINTER_TIP_X;
const WIDTH = 0.075;
const DEPTH = 0.045;

/** Built-in flap, shown while the Blender pointer loads or if it fails. */
function ProceduralFlap() {
  const geometry = useMemo(() => createPointerGeometry(LENGTH, WIDTH, DEPTH), []);
  return (
    <>
      <mesh geometry={geometry} material={inkLacquer} castShadow />
      <mesh position-z={DEPTH + 0.006} rotation-x={Math.PI / 2} material={brass}>
        <cylinderGeometry args={[0.032, 0.034, 0.022, 32]} />
      </mesh>
    </>
  );
}

/** Spring that lets the flapper kick when a peg passes, then settle. */
const STIFFNESS = 260;
const DAMPING = 15;
const MAX_KICK = 0.42;

/**
 * Fixed pointer at 3 o'clock. Its flap is purely cosmetic: it reacts to the
 * wheel's rotation and never feeds anything back into the result.
 */
export function Pointer() {
  const flap = useRef<THREE.Group>(null);
  const reducedMotion = useReducedMotion();

  const sim = useRef({ angle: 0, velocity: 0, lastCount: Number.NaN, lastRotation: 0, planKey: null as unknown });

  useFrame((state, delta) => {
    const { spin, rotation, entries, sound } = useWheelStore.getState();
    const s = sim.current;
    const n = entries.length;
    const current = spin ? rotationAt(spin.plan, performance.now() - spin.startedAt) : rotation;
    const dt = Math.min(delta, 1 / 30);

    if (spin && n > 1) {
      if (s.planKey !== spin.plan) {
        s.planKey = spin.plan;
        s.lastCount = boundaryCount(current, n);
        s.lastRotation = current;
      }
      const count = boundaryCount(current, n);
      const speed = Math.abs(current - s.lastRotation) / Math.max(dt, 1e-3);
      if (count !== s.lastCount) {
        const strength = Math.min(1, speed / 18);
        if (!reducedMotion && n <= MAX_PEGS) {
          s.velocity += 14 * (0.35 + strength);
        }
        if (sound) playTick(0.35 + strength);
        s.lastCount = count;
      }
      s.lastRotation = current;
    } else {
      s.planKey = null;
    }

    // Damped spring back to rest, integrated in small steps for stability.
    const steps = 4;
    const h = dt / steps;
    for (let k = 0; k < steps; k++) {
      const accel = -STIFFNESS * s.angle - DAMPING * s.velocity;
      s.velocity += accel * h;
      s.angle = Math.min(MAX_KICK, s.angle + s.velocity * h);
    }
    if (flap.current) flap.current.rotation.z = s.angle;

    if (Math.abs(s.angle) > 1e-4 || Math.abs(s.velocity) > 1e-3) state.invalidate();
    else {
      s.angle = 0;
      s.velocity = 0;
    }
  });

  // The mast and pivot head belong to the static pedestal; only the flap moves.
  return (
    <group ref={flap} position={[POINTER_PIVOT_X, 0, POINTER_Z]}>
      <WithFallback fallback={<ProceduralFlap />}>
        <PointerFlapModel />
      </WithFallback>
    </group>
  );
}
