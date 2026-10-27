import { useEffect, useMemo, useRef } from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useBingoStore } from '../state/store';
import { CAGE_CENTER } from './bingo/layout';
import { drama } from './cinematic';
import { Pendant } from './room/Room';

const HEMI = 0.16;
const SPOT = 42;
const SPOT_ANGLE = 0.5;
const ENVIRONMENT = 0.32;

/**
 * Hall lighting kept to a few sources: a warm pendant over our table (the
 * only shadow-casting light), a dim warm/brown hemisphere for bounce, and an
 * environment of soft lightformers so brass, chrome and the balls' lacquer
 * pick up believable reflections. Background lamps add their own small lights.
 * During a draw the house lights go down and the pendant tightens on the
 * machine, like a stage, until the winner lands.
 */
export function Lighting() {
  const scene = useThree((s) => s.scene);
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0.1, CAGE_CENTER.y * 0.45, 0.08);
    return o;
  }, []);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const spot = useRef<THREE.SpotLight>(null);
  const level = useRef(0);

  useFrame(() => {
    const draw = useBingoStore.getState().draw;
    const d = draw && !draw.plan.reducedMotion ? drama(draw.plan.timeline, performance.now() - draw.startedAt) : 0;
    if (d === level.current) return;
    level.current = d;
    scene.environmentIntensity = ENVIRONMENT * (1 - 0.45 * d);
    if (hemi.current) hemi.current.intensity = HEMI * (1 - 0.7 * d);
    if (spot.current) {
      spot.current.intensity = SPOT * (1 + 0.3 * d);
      spot.current.angle = SPOT_ANGLE - 0.13 * d;
    }
  });

  useEffect(() => {
    scene.add(target);
    // Reflections only: enough for brass, chrome and lacquer to read, not enough to light the hall.
    scene.environmentIntensity = ENVIRONMENT;
    return () => {
      scene.remove(target);
    };
  }, [scene, target]);

  return (
    <>
      <hemisphereLight ref={hemi} args={['#ffd6a0', '#2a1208', HEMI]} />
      {/* A tight pool of light from the pendant: the table and the machine, little beyond. */}
      <spotLight
        ref={spot}
        position={[0.05, 1.62, 0.32]}
        target={target}
        angle={SPOT_ANGLE}
        penumbra={0.55}
        intensity={SPOT}
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
