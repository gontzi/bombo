import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { brass, brushedSteel, chrome, enamel, walnutLacquer } from '../materials';
import { CAGE_CENTER, LAYOUT, RAMP_POINTS, TRAY_CENTER, TUBE_POINTS } from './layout';

/**
 * Simple built-in versions of the Blender parts, shown while the GLBs load
 * or if they fail. Same measurements, fewer details, so the draw still reads.
 */

const BASE = LAYOUT.base;

export function FallbackFrame() {
  const w = BASE.maxX - BASE.minX;
  const d = BASE.maxZ - BASE.minZ;
  return (
    <group>
      <mesh position={[(BASE.minX + BASE.maxX) / 2, BASE.height / 2, (BASE.minZ + BASE.maxZ) / 2]} material={walnutLacquer} castShadow receiveShadow>
        <boxGeometry args={[w, BASE.height, d]} />
      </mesh>
      {[-LAYOUT.axle.bearingX, LAYOUT.axle.bearingX].map((x) => (
        <group key={x}>
          <mesh position={[x, (BASE.height + CAGE_CENTER.y) / 2, 0]} material={enamel} castShadow>
            <boxGeometry args={[0.022, CAGE_CENTER.y - BASE.height, 0.12]} />
          </mesh>
          <mesh position={[x, CAGE_CENTER.y, 0]} rotation-z={Math.PI / 2} material={brass}>
            <cylinderGeometry args={[0.034, 0.034, 0.064, 24]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function FallbackChute() {
  const geo = useMemo(() => {
    const r = LAYOUT.chute.tubeInnerRadius + 0.004;
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(TUBE_POINTS, false, 'centripetal'), 24, r, 16);
    const ramp = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(RAMP_POINTS, false, 'centripetal'), 32, r, 16);
    return { tube, ramp };
  }, []);
  useEffect(() => () => {
    geo.tube.dispose();
    geo.ramp.dispose();
  }, [geo]);
  return (
    <group>
      <mesh geometry={geo.tube} material={chrome} castShadow />
      {/* Drawn from below only, so the ball stays visible as it rolls. */}
      <mesh geometry={geo.ramp} castShadow>
        <meshStandardMaterial color="#dadada" metalness={1} roughness={0.12} side={THREE.BackSide} />
      </mesh>
      <mesh position={[TRAY_CENTER.x, 0.008, TRAY_CENTER.z]} material={brass} receiveShadow castShadow>
        <cylinderGeometry args={[LAYOUT.tray.innerRadius + 0.014, LAYOUT.tray.innerRadius + 0.006, 0.016, 40]} />
      </mesh>
    </group>
  );
}

export function FallbackCrank() {
  const x = LAYOUT.crank.x;
  return (
    <group>
      <mesh position-x={(x - LAYOUT.cage.poleX) / 2} rotation-z={Math.PI / 2} material={brushedSteel}>
        <cylinderGeometry args={[LAYOUT.axle.radius, LAYOUT.axle.radius, LAYOUT.cage.poleX - x + 0.02, 16]} />
      </mesh>
      <mesh position={[x, -LAYOUT.crank.armLength / 2, 0]} material={brass}>
        <boxGeometry args={[0.009, LAYOUT.crank.armLength, 0.026]} />
      </mesh>
      <mesh position={[x - 0.06, -LAYOUT.crank.armLength, 0]} rotation-z={Math.PI / 2} material={walnutLacquer}>
        <cylinderGeometry args={[0.011, 0.012, 0.085, 16]} />
      </mesh>
    </group>
  );
}
