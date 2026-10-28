import { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useBingoStore } from '../../state/store';
import { BLOOM_LAYER } from '../bloom';
import { MODEL_URLS } from '../models';
import { queueWarmup } from '../warmup';
import { createSignTexture, paintSign, signFontsReady } from './signTexture';

/** Where the chains hang from (the model's origin), lowered. Above the cage, a little behind it. */
export const SIGN_HOOK = new THREE.Vector3(0.2, 1.5, -0.32);
/** How far it is hauled up out of sight when there is nothing to announce. */
const RAISED = 1.25;
/** Chain length plus half the board (build_sign.py), for the pendulum. */
const PENDULUM = 0.72;
const FLASH_MS = 2600;
const STEP = 1 / 120;
const GLOW = 0.5;

interface Motion {
  y: number;
  vy: number;
  swing: number;
  swingV: number;
  tilt: number;
  tiltV: number;
  shown: boolean;
  shownAt: number;
}

/**
 * The winner sign, modelled in Blender (assets-src/blender/build_sign.py):
 * it drops from the ceiling on its chains when a ball is called, bounces and
 * swings to rest with its bulbs flashing, and is hauled back up when the
 * result is cleared or the next draw starts. It only announces; nothing on
 * it is clickable.
 */
export function WinnerSign() {
  const { scene } = useGLTF(MODEL_URLS.sign, false, false);
  const invalidate = useThree((s) => s.invalidate);
  const reducedMotion = useReducedMotion();
  const result = useBingoStore((s) => (s.draw ? null : s.lastResult));
  const group = useRef<THREE.Group>(null);
  const glow = useRef<THREE.PointLight>(null);

  const { sign, texture, canvas, bulbs } = useMemo(() => {
    const sign = scene.clone(true);
    const canvas = document.createElement('canvas');
    const texture = createSignTexture(canvas);
    let bulbs: THREE.MeshStandardMaterial | null = null;
    sign.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // It hangs right under the pendant: a shadow would black out the machine.
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      const source = mesh.material as THREE.MeshStandardMaterial;
      if (source.name === 'SignFace') {
        mesh.material = new THREE.MeshStandardMaterial({
          map: texture,
          emissiveMap: texture,
          emissive: new THREE.Color('#ffffff'),
          // A lit marquee: it hangs outside the pendant's pool and must read on its own.
          emissiveIntensity: 0.6,
          roughness: 0.4,
          side: THREE.DoubleSide,
        });
      } else if (source.name === 'Bulb') {
        bulbs = source.clone();
        mesh.layers.enable(BLOOM_LAYER);
        bulbs.emissive = new THREE.Color('#ffcf7a');
        mesh.material = bulbs;
      }
    });
    return { sign, texture, canvas, bulbs: bulbs as THREE.MeshStandardMaterial | null };
  }, [scene]);

  useEffect(() => () => texture.dispose(), [texture]);

  // Get the first showing's work done now: the face painted at full size (so later results only
  // overwrite the same texture), its fonts fetched, and every material compiled (warmup.tsx).
  useEffect(() => {
    paintSign(canvas, { ball: 1, label: '' });
    texture.needsUpdate = true;
    queueWarmup(sign);
    void signFontsReady();
  }, [sign, canvas, texture]);

  // Paint the winner as soon as it is known; repaint once the fonts are in.
  useEffect(() => {
    if (!result) return;
    let live = true;
    // Easter egg: a draw with a single ball in the cage is no surprise, and the sign says so.
    const alone = useBingoStore.getState().entries.length === 1;
    const paint = () => {
      paintSign(canvas, alone ? { ...result, kicker: '¡QUÉ SORPRESA!' } : result);
      texture.needsUpdate = true;
      invalidate();
    };
    paint();
    void signFontsReady().then(() => live && paint());
    return () => {
      live = false;
    };
  }, [result, canvas, texture, invalidate]);

  const motion = useRef<Motion>({ y: RAISED, vy: 0, swing: 0, swingV: 0, tilt: 0, tiltV: 0, shown: false, shownAt: 0 });

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const m = motion.current;
    const shown = result !== null;
    if (shown !== m.shown) {
      m.shown = shown;
      m.shownAt = performance.now();
      // Let go from the ceiling with a little sideways nudge, so it swings as it lands.
      if (shown) {
        m.swingV = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.2);
        m.tiltV = 0.25;
      }
    }

    const target = shown ? 0 : RAISED;
    if (reducedMotion) {
      Object.assign(m, { y: target, vy: 0, swing: 0, swingV: 0, tilt: 0, tiltV: 0 });
    } else {
      // Small fixed steps, so it lands in real time even on a slow frame rate.
      const k = shown ? 42 : 26;
      const c = 2 * Math.sqrt(k) * (shown ? 0.3 : 0.95);
      const w2 = 9.8 / PENDULUM;
      for (let left = Math.min(delta, 0.25); left > 0; left -= STEP) {
        const dt = Math.min(STEP, left);
        // Dropping: a lively spring, so it overshoots on the chains and bounces. Hauling up: steady.
        m.vy += (-k * (m.y - target) - c * m.vy) * dt;
        m.y += m.vy * dt;
        // Pendulum on the chains, and a smaller rock front to back.
        m.swingV += (-w2 * m.swing - 1.1 * m.swingV) * dt;
        m.swing += m.swingV * dt;
        m.tiltV += (-w2 * 1.6 * m.tilt - 1.6 * m.tiltV) * dt;
        m.tilt += m.tiltV * dt;
      }
    }

    g.position.set(SIGN_HOOK.x, SIGN_HOOK.y + m.y, SIGN_HOOK.z);
    g.rotation.set(m.tilt * 0.4, 0, m.swing * 0.35);
    // Only the model hides: the light stays in the scene (dark) so that showing the sign never changes
    // the light count, which would make three.js recompile every material in the hall on the spot.
    sign.visible = m.y < RAISED - 0.01 || shown;
    if (glow.current) glow.current.intensity = sign.visible ? GLOW : 0;

    // Marquee bulbs: a burst of flashing as it arrives, then a steady warm glow.
    const since = performance.now() - m.shownAt;
    const flashing = shown && since < FLASH_MS && !reducedMotion;
    if (bulbs) {
      bulbs.emissiveIntensity = !shown ? 0.4 : flashing ? (Math.floor(since / 140) % 2 ? 3.6 : 0.6) : 2.4;
    }

    const moving =
      Math.abs(m.y - target) > 1e-4 || Math.abs(m.vy) > 1e-4 || Math.abs(m.swing) > 1e-4 || Math.abs(m.swingV) > 1e-4;
    if (moving || flashing) invalidate();
  });

  return (
    <group ref={group} position={[SIGN_HOOK.x, SIGN_HOOK.y + RAISED, SIGN_HOOK.z]}>
      <primitive object={sign} visible={false} />
      {/* The bulbs' own glow on the brass and walnut. */}
      <pointLight ref={glow} position={[0, -0.72, 0.3]} color="#ffcf8a" intensity={0} distance={1.1} decay={2} />
    </group>
  );
}
