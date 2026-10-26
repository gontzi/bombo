import { useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CameraRig } from './CameraRig';
import { Lighting } from './Lighting';
import { Pointer } from './Pointer';
import { Stand } from './Stand';
import { Wheel } from './Wheel';

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

/** Lazily loaded 3D stage; everything three.js lives behind this import. */
export default function WheelStage() {
  return (
    <Canvas
      shadows
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ fov: 28, position: [0, 0, 6] }}
      gl={{ antialias: true, alpha: true }}
      onCreated={({ gl, invalidate }) => {
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.toneMappingExposure = 1.05;
        invalidate();
      }}
      aria-hidden
    >
      <RedrawWhenVisible />
      <CameraRig />
      <Lighting />
      <Stand />
      <Wheel />
      <Pointer />
    </Canvas>
  );
}
