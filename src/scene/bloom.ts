import type * as THREE from 'three';

/**
 * Layer for things that give off light of their own (bulbs, neon, the lit
 * board, the button's lamp, sparks). Only these bloom: the bloom pass draws
 * this layer alone, with no lights, so lit brass and chrome never glow however
 * bright their highlights get under the pendant.
 */
export const BLOOM_LAYER = 10;

/** Ref callback that adds an object to the bloom layer. */
export const glowRef = (object: THREE.Object3D | null) => {
  object?.layers.enable(BLOOM_LAYER);
};
