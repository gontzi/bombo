import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { playHiss } from '../../audio/sounds';
import { crankDrive, useCrank } from '../../state/crank';
import { useBingoStore } from '../../state/store';
import { frameDelta } from '../CameraRig';
import { CAGE_CENTER, LAYOUT } from './layout';

/** Turned by hand faster than this (rad/s, near the hand's top speed) the bearing starts to heat up. */
const HOT_SPIN = 6.6;
/** Heat gained per second while turned too fast, and lost per second otherwise (0 to 1). */
const HEAT_UP = 0.6;
const COOL_DOWN = 0.22;
/** Heat at which the smoke starts. */
const SMOKES = 0.45;
const PUFFS = 48;
const LIFE = 2.4;
/** Where the smoke comes out: the crank's hub, where the axle runs in its bearing. */
const ORIGIN = CAGE_CENTER.clone().setX(CAGE_CENTER.x + LAYOUT.crank.x - 0.012);

function puffTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  // A few soft overlapping blobs, so each puff is lumpy rather than a perfect disc.
  for (let i = 0; i < 6; i++) {
    const x = size / 2 + (Math.random() - 0.5) * size * 0.3;
    const y = size / 2 + (Math.random() - 0.5) * size * 0.3;
    const r = size * (0.22 + Math.random() * 0.18);
    const gradient = g.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

type Puff = { sprite: THREE.Sprite; velocity: THREE.Vector3; age: number; spin: number };

/**
 * Easter egg: crank the cage by hand flat out for a couple of seconds and the
 * bearing overheats: it hisses and smoke curls up off the crank's hub, more
 * the longer it goes on, until the cage is let be and it cools down.
 */
export function CrankSmoke() {
  const invalidate = useThree((s) => s.invalidate);
  const heat = useRef(0);
  const emit = useRef(0);

  const { group, puffs, texture } = useMemo(() => {
    const texture = puffTexture();
    const group = new THREE.Group();
    const puffs: Puff[] = Array.from({ length: PUFFS }, () => {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, color: '#8f877d', transparent: true, opacity: 0, depthWrite: false }),
      );
      sprite.visible = false;
      group.add(sprite);
      return { sprite, velocity: new THREE.Vector3(), age: LIFE, spin: 0 };
    });
    return { group, puffs, texture };
  }, []);

  useEffect(
    () => () => {
      texture.dispose();
      for (const p of puffs) p.sprite.material.dispose();
    },
    [texture, puffs],
  );

  useFrame((_, delta) => {
    const dt = frameDelta(delta);
    const fast = crankDrive.dragging && Math.abs(crankDrive.spin) > HOT_SPIN;
    const was = heat.current;
    heat.current = THREE.MathUtils.clamp(was + (fast ? HEAT_UP : -COOL_DOWN) * dt, 0, 1);
    const smoking = heat.current > SMOKES;
    if (smoking !== useCrank.getState().smoking) {
      useCrank.setState({ smoking });
      if (smoking && useBingoStore.getState().sound) playHiss();
    }

    // New puffs, more the hotter it is.
    if (smoking) {
      emit.current += dt * (8 + 34 * ((heat.current - SMOKES) / (1 - SMOKES)));
      while (emit.current >= 1) {
        emit.current -= 1;
        const p = puffs.find((q) => q.age >= LIFE);
        if (!p) break;
        p.age = 0;
        p.spin = (Math.random() - 0.5) * 1.2;
        p.sprite.position.copy(ORIGIN).add(new THREE.Vector3((Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.03));
        // Thrown off the turning hub a little, then rising.
        p.velocity.set(-0.02 - Math.random() * 0.05, 0.1 + Math.random() * 0.1, (Math.random() - 0.5) * 0.08);
        p.sprite.visible = true;
      }
    } else emit.current = 0;

    let alive = false;
    for (const p of puffs) {
      if (p.age >= LIFE) continue;
      p.age += dt;
      if (p.age >= LIFE) {
        p.sprite.visible = false;
        continue;
      }
      alive = true;
      const t = p.age / LIFE;
      // Rises, slows, and spreads as it thins out.
      p.velocity.y *= Math.exp(-dt * 0.4);
      p.velocity.x += (Math.random() - 0.5) * 0.04 * dt;
      p.velocity.z += (Math.random() - 0.5) * 0.04 * dt;
      p.sprite.position.addScaledVector(p.velocity, dt);
      p.sprite.scale.setScalar(0.03 + 0.24 * Math.sqrt(t));
      p.sprite.material.rotation += p.spin * dt;
      p.sprite.material.opacity = 0.32 * Math.min(1, t * 5) * (1 - t) ** 1.5;
    }
    if (alive || heat.current > 0) invalidate();
  });

  return <primitive object={group} />;
}
