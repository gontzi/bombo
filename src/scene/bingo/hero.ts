import * as THREE from 'three';

/** Where the extracted ball is right now, for the camera and the effects to follow. Written by Machine each frame. */
export const heroTracker = {
  position: new THREE.Vector3(),
  visible: false,
};
