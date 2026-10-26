import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { rotationAt } from '../domain/planSpin';
import { requestSpin } from '../hooks/useSpin';
import { useWheelStore } from '../state/store';
import { LABEL_Z, SEGMENT_OUTER } from './dimensions';
import { Pegs } from './Pegs';
import { Segments } from './Segments';
import { useLabelsTexture } from './useLabelsTexture';
import { WheelBody } from './WheelBody';

/**
 * The rotating wheel. It only plays back the store's SpinPlan; it never
 * decides or reads back the result.
 */
export function Wheel() {
  const group = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const entries = useWheelStore((s) => s.entries);
  const winnerId = useWheelStore((s) => s.lastResult?.entryId);
  const labels = entries.map((e) => e.label);
  const texture = useLabelsTexture(labels);
  const winnerIndex = winnerId ? entries.findIndex((e) => e.id === winnerId) : -1;

  // Demand-driven rendering: draw a frame whenever the store changes.
  useEffect(() => useWheelStore.subscribe(() => invalidate()), [invalidate]);

  useFrame(() => {
    const { spin, rotation } = useWheelStore.getState();
    const current = spin ? rotationAt(spin.plan, performance.now() - spin.startedAt) : rotation;
    if (group.current) group.current.rotation.z = current;
    if (spin) invalidate();
  });

  return (
    <group>
      <group ref={group}>
        <WheelBody onHubClick={requestSpin} />
        <Segments count={entries.length} winnerIndex={winnerIndex} />
        {entries.length > 0 && (
          <mesh position-z={LABEL_Z} renderOrder={1}>
            <circleGeometry args={[SEGMENT_OUTER, 128]} />
            <meshStandardMaterial
              map={texture}
              transparent
              depthWrite={false}
              roughness={0.55}
              polygonOffset
              polygonOffsetFactor={-2}
            />
          </mesh>
        )}
        <Pegs count={entries.length} />
      </group>
    </group>
  );
}
