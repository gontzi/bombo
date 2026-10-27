import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { DrawPlan } from '../../domain/draw';
import { useBingoStore } from '../../state/store';
import { glowRef } from '../bloom';
import { ballRadiusFor, trayRestPosition } from './layout';

const COUNT = 120;
const LIFE = 1.5;
const GRAVITY = 1.4;

function glowTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,248,225,1)');
  gradient.addColorStop(0.25, 'rgba(255,214,130,0.85)');
  gradient.addColorStop(1, 'rgba(255,180,80,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * A burst of brass-coloured sparks out of the tray the moment the winner
 * lands: thrown up in a fountain, falling back and winking out. Skipped when
 * the user prefers reduced motion.
 */
export function Sparkles() {
  const invalidate = useThree((s) => s.invalidate);
  const points = useRef<THREE.Points>(null);
  const state = useRef<{ plan: DrawPlan | null; age: number }>({ plan: null, age: Infinity });

  const { geometry, velocity, material } = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    const material = new THREE.PointsMaterial({
      size: 0.026,
      map: glowTexture(),
      color: '#ffd38a',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geometry, velocity: Array.from({ length: COUNT }, () => new THREE.Vector3()), material };
  }, []);

  useFrame((_, delta) => {
    const s = state.current;
    const { draw, entries } = useBingoStore.getState();
    if (draw && draw.plan !== s.plan && !draw.plan.reducedMotion) {
      if (performance.now() - draw.startedAt >= draw.plan.timeline.rampEnd) {
        s.plan = draw.plan;
        s.age = 0;
        const origin = trayRestPosition(ballRadiusFor(entries.length));
        const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < COUNT; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spread = 0.08 + Math.random() * 0.22;
          const up = 0.45 + Math.random() * 0.5;
          velocity[i]!.set(Math.cos(angle) * spread, up, Math.sin(angle) * spread);
          pos.setXYZ(i, origin.x, origin.y, origin.z);
        }
      }
    }

    const mesh = points.current;
    if (!mesh) return;
    if (s.age >= LIFE) {
      mesh.visible = false;
      return;
    }
    const dt = Math.min(delta, 1 / 30);
    s.age += dt;
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < COUNT; i++) {
      const v = velocity[i]!;
      v.y -= GRAVITY * dt;
      // A little air drag so the fountain blooms and then hangs.
      v.x *= 1 - 1.6 * dt;
      v.z *= 1 - 1.6 * dt;
      pos.setXYZ(i, pos.getX(i) + v.x * dt, pos.getY(i) + v.y * dt, pos.getZ(i) + v.z * dt);
    }
    pos.needsUpdate = true;
    const life = s.age / LIFE;
    // Bright flash, then a flickering fade.
    material.opacity = (1 - life) ** 1.5 * (0.75 + 0.25 * Math.sin(s.age * 40));
    mesh.visible = true;
    invalidate();
  });

  // Sparks glow (bloom.ts).
  useEffect(() => glowRef(points.current), []);

  return <points ref={points} geometry={geometry} material={material} visible={false} frustumCulled={false} />;
}
