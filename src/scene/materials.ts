import * as THREE from 'three';
import { SEGMENT_PALETTE } from '../theme/palette';

/** Shared materials: created once, reused by every wheel size. */

export const lacquer = (color: string) =>
  new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.85,
    clearcoatRoughness: 0.2,
  });

export const segmentMaterials = SEGMENT_PALETTE.map((c) => lacquer(c.fill));

export const winnerMaterials = SEGMENT_PALETTE.map((c) => {
  const m = lacquer(c.fill);
  m.emissive = new THREE.Color(c.fill);
  m.emissiveIntensity = 0.35;
  return m;
});

export const inkLacquer = new THREE.MeshPhysicalMaterial({
  color: '#1c1714',
  roughness: 0.32,
  clearcoat: 1,
  clearcoatRoughness: 0.12,
});

export const brass = new THREE.MeshStandardMaterial({
  color: '#c9a04a',
  metalness: 1,
  roughness: 0.3,
});

export const darkMetal = new THREE.MeshStandardMaterial({
  color: '#2b2520',
  metalness: 0.7,
  roughness: 0.45,
});
