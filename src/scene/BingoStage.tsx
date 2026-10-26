import { Component, Suspense, useEffect, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSceneStatus } from '../state/sceneStatus';
import { Machine } from './bingo/Machine';
import { CameraRig } from './CameraRig';
import { Lighting } from './Lighting';
import { MODEL_URLS } from './models';
import { Room } from './room/Room';
import { Table } from './room/Table';

/** With demand rendering, a tab that loaded hidden may never draw its first frame. */
function RedrawWhenVisible() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const redraw = () => invalidate();
    document.addEventListener('visibilitychange', redraw);
    window.addEventListener('focus', redraw);
    document.fonts?.ready.then(redraw);
    return () => {
      document.removeEventListener('visibilitychange', redraw);
      window.removeEventListener('focus', redraw);
    };
  }, [invalidate]);
  return null;
}

/** Flags the DOM overlay once every machine model has loaded (or failed, and fallbacks show). */
function ModelsReady() {
  for (const url of Object.values(MODEL_URLS)) useGLTF(url, false, false);
  const setReady = useSceneStatus((s) => s.setModelsReady);
  useEffect(() => setReady(), [setReady]);
  return null;
}

class ReadyBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    useSceneStatus.getState().setModelsReady();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Lazily loaded 3D hall; everything three.js lives behind this import. */
export default function BingoStage() {
  return (
    <Canvas
      shadows
      frameloop="demand"
      dpr={[1, 1.75]}
      camera={{ fov: 30, near: 0.05, far: 30, position: [1.2, 1, 1.6] }}
      gl={{ antialias: true }}
      onCreated={({ gl, invalidate }) => {
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.toneMappingExposure = 1.15;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
        invalidate();
      }}
      aria-hidden
    >
      <color attach="background" args={['#140c08']} />
      <fog attach="fog" args={['#160d09', 2.6, 8.5]} />
      <RedrawWhenVisible />
      <CameraRig />
      <Lighting />
      <Room />
      <Table />
      <Machine />
      <ReadyBoundary>
        <Suspense fallback={null}>
          <ModelsReady />
        </Suspense>
      </ReadyBoundary>
    </Canvas>
  );
}
