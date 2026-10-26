import { useEffect, useMemo } from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CAGE_CENTER } from './bingo/layout';
import { Pendant } from './room/Room';

/**
 * Hall lighting kept to a few sources: a warm pendant over our table (the
 * only shadow-casting light), a dim warm/brown hemisphere for bounce, and an
 * environment of soft lightformers so brass, chrome and the balls' lacquer
 * pick up believable reflections. Background lamps add their own small lights.
 */
export function Lighting() {
  const scene = useThree((s) => s.scene);
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0.1, CAGE_CENTER.y * 0.45, 0.08);
    return o;
  }, []);

  useEffect(() => {
    scene.add(target);
    scene.environmentIntensity = 0.55;
    return () => {
      scene.remove(target);
    };
  }, [scene, target]);

  return (
    <>
      <hemisphereLight args={['#ffd6a0', '#2a1208', 0.7]} />
      <spotLight
        position={[0.05, 1.62, 0.32]}
        target={target}
        angle={0.78}
        penumbra={0.85}
        intensity={20}
        distance={6}
        decay={2}
        color="#ffd09a"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00015}
        shadow-normalBias={0.008}
        shadow-camera-near={0.3}
        shadow-camera-far={4}
      />
      <Pendant position={[0.05, 1.66, 0.32]} light={false} />
      <Environment resolution={128} frames={1}>
        <color attach="background" args={['#1c120c']} />
        <Lightformer form="circle" intensity={4} color="#ffd29a" position={[0, 3, 0.4]} scale={2} />
        <Lightformer form="rect" intensity={1.2} color="#ffb870" position={[-3, 1.2, -2]} scale={[3, 1.2, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#ffe2b8" position={[3, 1.5, 2]} scale={[2, 2, 1]} />
        <Lightformer form="ring" intensity={0.8} color="#ffcf8a" position={[1.2, 1.5, -3]} scale={1} />
      </Environment>
    </>
  );
}
