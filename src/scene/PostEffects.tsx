import { useMemo } from 'react';
import { EffectComposer, SelectiveBloom, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { BLOOM_LAYER } from './bloom';

/** Phones and tablets: skip the multisampled buffers, the most expensive part here. */
const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/**
 * Lens and film on top of the hall: the bulbs, the neon, the lit board, the
 * button's lamp and the sparks bloom into the haze (see bloom.ts), and a
 * soft vignette pulls the eye to the table. The composer turns the
 * renderer's own tone mapping off, so the same neutral curve is applied last.
 */
export function PostEffects() {
  // The bloom pass draws only the glowing layer and needs a light to do so; emissive surfaces need none,
  // so it gets one that adds nothing.
  const unlit = useMemo(() => new THREE.AmbientLight('#000000', 0), []);
  return (
    <EffectComposer multisampling={coarse ? 0 : 4}>
      <SelectiveBloom
        selectionLayer={BLOOM_LAYER}
        lights={[unlit]}
        mipmapBlur
        luminanceThreshold={0.2}
        luminanceSmoothing={0.3}
        intensity={1.1}
        radius={0.72}
      />
      <Vignette offset={0.32} darkness={0.6} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  );
}
