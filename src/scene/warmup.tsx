import { useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';

/**
 * Things that stay hidden until a draw (the winner sign, the extracted ball,
 * the sparks) would otherwise have their shaders compiled and their textures
 * uploaded the first time they show, for every pass (main, shadow, bloom):
 * a visible hitch right at the big moment, worse on slow devices. Each queues
 * itself here when it mounts, and is drawn once, shrunk to nothing, so that
 * work happens up front behind the loading veil instead.
 */
const queue = new Set<THREE.Object3D>();
let wake: (() => void) | null = null;

export function queueWarmup(object: THREE.Object3D | null) {
  if (!object) return;
  queue.add(object);
  wake?.();
}

interface Saved {
  object: THREE.Object3D;
  visible: boolean;
  scale: THREE.Vector3;
  culled: Map<THREE.Object3D, boolean>;
}

/** Runs between the scene's own frame callbacks (0) and the composer's render (1), then restores (2). */
export function Warmup() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    wake = invalidate;
    if (queue.size) invalidate();
    return () => {
      wake = null;
    };
  }, [invalidate]);

  const [saved] = useState<Saved[]>(() => []);

  useFrame(() => {
    for (const object of queue) {
      const culled = new Map<THREE.Object3D, boolean>();
      object.traverse((o) => {
        culled.set(o, o.frustumCulled);
        o.frustumCulled = false;
      });
      saved.push({ object, visible: object.visible, scale: object.scale.clone(), culled });
      object.visible = true;
      object.scale.setScalar(1e-5);
    }
    queue.clear();
  }, 0.5);

  useFrame(() => {
    for (const { object, visible, scale, culled } of saved.splice(0)) {
      object.visible = visible;
      object.scale.copy(scale);
      for (const [o, c] of culled) o.frustumCulled = c;
    }
  }, 2);

  return null;
}
