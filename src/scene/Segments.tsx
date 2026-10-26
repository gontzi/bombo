import { useEffect, useMemo } from 'react';
import { segmentStart } from '../domain/wheelMath';
import { paletteIndex } from '../theme/palette';
import { createSegmentGeometry } from './geometry';
import { segmentMaterials, winnerMaterials } from './materials';

interface Props {
  count: number;
  winnerIndex: number;
}

export function Segments({ count, winnerIndex }: Props) {
  // An empty list still shows a blank cream face rather than a hole.
  const geometry = useMemo(() => createSegmentGeometry(Math.max(1, count)), [count]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  if (count === 0) {
    return <mesh geometry={geometry} material={segmentMaterials[1]} castShadow receiveShadow />;
  }

  return (
    <group>
      {Array.from({ length: count }, (_, i) => {
        const slot = paletteIndex(i, count);
        return (
          <mesh
            key={i}
            geometry={geometry}
            material={(i === winnerIndex ? winnerMaterials : segmentMaterials)[slot]}
            rotation-z={segmentStart(i, count)}
            castShadow
            receiveShadow
          />
        );
      })}
    </group>
  );
}
