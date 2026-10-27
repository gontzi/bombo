import { Component, Suspense, useMemo, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import type * as THREE from 'three';

/**
 * Bingo machine parts built in Blender (assets-src/blender/build_bingo.py,
 * measurements from bingoLayout.json). They share the scene's units and axes:
 * frame and chute mount at the origin; the crank's origin is on the cage axle.
 */
const base = import.meta.env.BASE_URL;
export const MODEL_URLS = {
  frame: `${base}models/bingo-frame.glb`,
  chute: `${base}models/bingo-chute.glb`,
  crank: `${base}models/bingo-crank.glb`,
  /** The winner sign (assets-src/blender/build_sign.py); origin at the hook its chains hang from. */
  sign: `${base}models/bingo-sign.glb`,
} as const;

type ModelKey = keyof typeof MODEL_URLS;

// No Draco or Meshopt in these files, so no decoder is ever fetched.
for (const url of Object.values(MODEL_URLS)) useGLTF.preload(url, false, false);

/** A shadow-casting copy of a model's scene (materials stay shared). */
function useModelScene(key: ModelKey): THREE.Object3D {
  const { scene } = useGLTF(MODEL_URLS[key], false, false);
  return useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return copy;
  }, [scene]);
}

export const FrameModel = () => <primitive object={useModelScene('frame')} />;
export const ChuteModel = () => <primitive object={useModelScene('chute')} />;
export const CrankModel = () => <primitive object={useModelScene('crank')} />;

class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('Bombo: a 3D model failed to load, using the built-in shape instead.', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Shows `fallback` while the model loads and if it fails, so the machine always works. */
export function WithFallback({ fallback = null, children }: { fallback?: ReactNode; children: ReactNode }) {
  return (
    <ModelBoundary fallback={fallback}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </ModelBoundary>
  );
}
