import { useMemo } from 'react';
import {
  BACKPLATE_DEPTH,
  HUB_RADIUS,
  RIM_FRONT,
  RIM_INNER,
  RIM_OUTER,
  SEGMENT_FRONT,
  SEGMENT_OUTER,
} from './dimensions';
import { createLatheZ, createRingGeometry } from './geometry';
import { brass, darkMetal, inkLacquer } from './materials';
import { HubCapModel, WithFallback } from './models';

/** Built-in hub, shown while the Blender hub cap loads or if it fails. */
function ProceduralHub() {
  const hub = useMemo(
    () =>
      createLatheZ([
        [0, SEGMENT_FRONT + 0.075],
        [HUB_RADIUS * 0.35, SEGMENT_FRONT + 0.07],
        [HUB_RADIUS * 0.62, SEGMENT_FRONT + 0.055],
        [HUB_RADIUS * 0.8, SEGMENT_FRONT + 0.032],
        [HUB_RADIUS * 0.86, SEGMENT_FRONT + 0.03],
        [HUB_RADIUS * 0.9, SEGMENT_FRONT + 0.034],
        [HUB_RADIUS, SEGMENT_FRONT + 0.026],
        [HUB_RADIUS * 1.02, SEGMENT_FRONT + 0.012],
        [HUB_RADIUS * 1.02, 0],
      ]),
    [],
  );
  return <mesh geometry={hub} material={brass} castShadow />;
}

/** Rotating structure around the segments: backplate, rim and hub cap. */
export function WheelBody({ onHubClick }: { onHubClick?: () => void }) {
  const rim = useMemo(
    () => createRingGeometry(RIM_INNER, RIM_OUTER, RIM_FRONT + BACKPLATE_DEPTH, 0.018),
    [],
  );

  return (
    <group>
      <mesh position-z={-BACKPLATE_DEPTH / 2} rotation-x={Math.PI / 2} material={darkMetal} receiveShadow castShadow>
        <cylinderGeometry args={[SEGMENT_OUTER + 0.01, SEGMENT_OUTER + 0.01, BACKPLATE_DEPTH, 128]} />
      </mesh>
      <mesh geometry={rim} position-z={-BACKPLATE_DEPTH} material={inkLacquer} castShadow receiveShadow />
      <group
        onClick={(e) => {
          e.stopPropagation();
          onHubClick?.();
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <WithFallback fallback={<ProceduralHub />}>
          <HubCapModel />
        </WithFallback>
      </group>
    </group>
  );
}
