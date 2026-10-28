import * as THREE from 'three';
import { LAYOUT } from '../bingo/layout';

/** The ball rack's measurements (bingoLayout.json, shared with assets-src/blender/build_rack.py). */
export const RACK = LAYOUT.rack;
export const RACK_BALL_RADIUS = RACK.ballRadius;

const FRONT = (RACK.tiers * RACK.tierDepth) / 2;
/** How high a ball's centre sits above the step it rests on: on the cup's lip (build_rack.py: cup()). */
const SEAT = 0.0035 + Math.sqrt(RACK.ballRadius ** 2 - RACK.cupRadius ** 2);

/** The rack's place on the table: its centre on the felt, turned towards the usual camera. */
export const RACK_MATRIX = new THREE.Matrix4().compose(
  new THREE.Vector3(...(RACK.center as [number, number, number])),
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), RACK.yaw),
  new THREE.Vector3(1, 1, 1),
);

/** Where ball `slot` rests, in world space. Slots fill the front row first, left to right. */
export function rackSlot(slot: number, out = new THREE.Vector3()): THREE.Vector3 {
  const tier = Math.floor(slot / RACK.perTier);
  const i = slot % RACK.perTier;
  return out
    .set(
      (i - (RACK.perTier - 1) / 2) * RACK.pitch,
      RACK.plinth + RACK.baseHeight + RACK.tierRise * tier + SEAT,
      FRONT - (tier + 0.5) * RACK.tierDepth,
    )
    .applyMatrix4(RACK_MATRIX);
}

/** The middle of the rack, a little above its steps: what the camera looks at when it comes in. */
export const RACK_FOCUS = new THREE.Vector3(0, 0.06, 0.03).applyMatrix4(RACK_MATRIX);
/** The green button's base, in world space. */
export const RACK_BUTTON = new THREE.Vector3(...(RACK.button as [number, number, number])).applyMatrix4(RACK_MATRIX);
