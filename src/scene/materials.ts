import * as THREE from 'three';

/** Shared materials for procedural parts, matched to the Blender ones. */

export const brass = new THREE.MeshStandardMaterial({ color: '#c9a04a', metalness: 1, roughness: 0.28 });
export const brushedSteel = new THREE.MeshStandardMaterial({ color: '#b4b1ab', metalness: 1, roughness: 0.36 });
export const chrome = new THREE.MeshStandardMaterial({
  color: '#dadada',
  metalness: 1,
  roughness: 0.12,
  side: THREE.DoubleSide,
});
export const enamel = new THREE.MeshPhysicalMaterial({
  color: '#4a1410',
  roughness: 0.3,
  clearcoat: 0.9,
  clearcoatRoughness: 0.12,
});
export const walnutLacquer = new THREE.MeshPhysicalMaterial({
  color: '#33190f',
  roughness: 0.42,
  clearcoat: 0.7,
  clearcoatRoughness: 0.18,
});
