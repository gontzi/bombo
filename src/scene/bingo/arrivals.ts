import type * as THREE from 'three';

/**
 * Balls arriving in the cage from somewhere in the scene (the ball rack):
 * where and how fast each enters, by entry id. The cage simulation takes them
 * from here when the entry joins the list, instead of growing the ball in at
 * the exit port.
 */
export const arrivals = new Map<string, { position: THREE.Vector3; velocity: THREE.Vector3 }>();
