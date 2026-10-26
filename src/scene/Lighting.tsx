import { Environment, Lightformer, SoftShadows } from '@react-three/drei';
import { FLOOR_Y } from './dimensions';

/**
 * Studio lighting built from lightformers (no downloaded HDRI): a large soft
 * key from the upper left, a warm strip on the right for the lacquer
 * highlights, and a faint fill from below.
 */
export function Lighting() {
  return (
    <>
      <SoftShadows size={22} samples={12} focus={0.5} />
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#3a332c']} />
        <Lightformer form="rect" intensity={3} color="#fff6ea" position={[-3, 3.5, 4]} scale={[5, 3, 1]} />
        <Lightformer form="rect" intensity={1.8} color="#ffd9a8" position={[4.5, 0.5, 2.5]} scale={[1.2, 6, 1]} />
        <Lightformer form="rect" intensity={0.6} color="#ffffff" position={[0, -4, 3]} scale={[8, 1, 1]} />
        <Lightformer form="ring" intensity={1.2} color="#ffffff" position={[1.5, 2.5, 5]} scale={1.2} />
      </Environment>
      <ambientLight intensity={0.15} />
      <directionalLight
        // High and frontal, so the floor shadow falls behind the object, inside the canvas.
        position={[-1.1, 5.2, 3.4]}
        intensity={2.4}
        color="#fff3e0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.015}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-camera-near={1}
        shadow-camera-far={14}
      />
      {/* Transparent shadow catcher: the object stands on the page itself. */}
      <mesh position-y={FLOOR_Y} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[16, 16]} />
        <shadowMaterial transparent opacity={0.24} color="#2a1a0c" />
      </mesh>
    </>
  );
}
