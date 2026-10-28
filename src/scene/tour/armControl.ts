import * as THREE from 'three';

/**
 * The usual shoulder: out to the right and ahead of the camera, so the arm
 * comes in from the side of the shot and the hand, cuff and watch are seen in
 * profile rather than hidden behind the sleeve.
 */
export const FROM_SIDE = { right: 0.5, down: 0.16, forward: 0.38 };
/** From below the shot, for the crank: the arm stays clear of the cage it turns. */
export const FROM_BELOW = { right: 0.12, down: 0.42, forward: 0.3 };

/** Hovering just off what it is about to press. */
export const HOVER_GAP = 0.06;

/**
 * What the guide's arm is told to do (scene/tour/Arm.tsx), by TourDirector:
 * reach in from the viewer's side until the index fingertip (or, as a fist,
 * the grip) is `gap` metres short of `target` along the line it comes in on,
 * or go back out of sight (`gap` null). A negative gap pushes through a button.
 */
export const tourArm = {
  target: new THREE.Vector3(),
  gap: null as number | null,
  /** 0 pointing with the index, 1 a fist round the crank's handle. */
  fist: 0,
  /** How briskly it moves: about 7 to travel, 25 for a press or a tap. */
  stiffness: 7,
  /** Where it reaches from, relative to the camera (metres right, down and ahead). */
  from: FROM_SIDE,
};
