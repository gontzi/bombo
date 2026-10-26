import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { segmentStart } from '../domain/wheelMath';
import { MAX_PEGS, PEG_HEIGHT, PEG_RADIUS, RIM_FRONT } from './dimensions';
import { brass } from './materials';
import { usePegParts, WithFallback } from './models';

/** Pegs sink slightly into the rim face. */
const PEG_BASE_Z = RIM_FRONT - 0.006;

interface InstancesProps {
  count: number;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/** One peg at every segment boundary; geometry has its origin at the peg's base. */
function PegInstances({ count, geometry, material }: InstancesProps) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const a = segmentStart(i, count);
      m.makeTranslation(Math.cos(a) * PEG_RADIUS, Math.sin(a) * PEG_RADIUS, PEG_BASE_Z);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [count, geometry]);

  return <instancedMesh key={`${count}-${geometry.uuid}`} ref={ref} args={[geometry, material, count]} castShadow />;
}

function ModelPegs({ count }: { count: number }) {
  const { geometry, material } = usePegParts();
  return <PegInstances count={count} geometry={geometry} material={material} />;
}

function ProceduralPegs({ count }: { count: number }) {
  const geometry = useMemo(() => {
    const g = new THREE.CapsuleGeometry(0.014, PEG_HEIGHT - 0.028, 4, 16);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, PEG_HEIGHT / 2);
    return g;
  }, []);
  return <PegInstances count={count} geometry={geometry} material={brass} />;
}

export function Pegs({ count }: { count: number }) {
  if (count < 2 || count > MAX_PEGS) return null;
  return (
    <WithFallback fallback={<ProceduralPegs count={count} />}>
      <ModelPegs count={count} />
    </WithFallback>
  );
}
