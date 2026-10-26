import { Component, Suspense, useMemo, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Static GLB assets built in Blender (assets-src/blender/build_assets.py).
 * They share the scene's units and axes, so they mount at identity:
 * wheel-space parts have their origin at the wheel centre on its back plane,
 * the pointer flap at its pivot and the peg at the centre of its base.
 */
const base = import.meta.env.BASE_URL;
export const MODEL_URLS = {
  pedestal: `${base}models/rueda-pedestal.glb`,
  axleHousing: `${base}models/rueda-axle-housing.glb`,
  hubCap: `${base}models/rueda-hub-cap.glb`,
  pointer: `${base}models/rueda-pointer.glb`,
  peg: `${base}models/rueda-peg.glb`,
} as const;

type ModelKey = keyof typeof MODEL_URLS;

// No Draco or Meshopt in these files, so no decoder is ever fetched.
const load = (key: ModelKey) => useGLTF(MODEL_URLS[key], false, false);

for (const url of Object.values(MODEL_URLS)) useGLTF.preload(url, false, false);

/** A shadow-casting copy of a model's scene (materials stay shared). */
function useModelScene(key: ModelKey): THREE.Object3D {
  const { scene } = load(key);
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

export const PedestalModel = () => <primitive object={useModelScene('pedestal')} />;
export const AxleHousingModel = () => <primitive object={useModelScene('axleHousing')} />;
export const HubCapModel = () => <primitive object={useModelScene('hubCap')} />;
export const PointerFlapModel = () => <primitive object={useModelScene('pointer')} />;

/** Geometry and material of the peg, for an InstancedMesh. */
export function usePegParts(): { geometry: THREE.BufferGeometry; material: THREE.Material } {
  const { scene } = load('peg');
  return useMemo(() => {
    let mesh: THREE.Mesh | undefined;
    scene.traverse((o) => {
      if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
    });
    if (!mesh) throw new Error('rueda-peg.glb has no mesh');
    return { geometry: mesh.geometry, material: mesh.material as THREE.Material };
  }, [scene]);
}

class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('Rueda: a 3D model failed to load, using the built-in shape instead.', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Shows `fallback` while the model loads and if it fails, so the wheel
 * always works and never waits on the network for its core shapes.
 */
export function WithFallback({ fallback = null, children }: { fallback?: ReactNode; children: ReactNode }) {
  return (
    <ModelBoundary fallback={fallback}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </ModelBoundary>
  );
}
