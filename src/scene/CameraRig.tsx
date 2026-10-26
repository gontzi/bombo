import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FRAME_BOUNDS } from './dimensions';

/** Slightly off-axis and above, so the wheel's depth and the plinth's top read. */
const VIEW_DIRECTION = new THREE.Vector3(0.16, 0.17, 1).normalize();
/** Portion of the canvas (in NDC) the object may fill. */
const MARGIN = 0.94;

const { minX, maxX, minY, maxY, minZ, maxZ } = FRAME_BOUNDS;
const CORNERS = [minX, maxX].flatMap((x) =>
  [minY, maxY].flatMap((y) => [minZ, maxZ].map((z) => new THREE.Vector3(x, y, z))),
);
const TARGET = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, 0);

function place(camera: THREE.PerspectiveCamera, distance: number) {
  camera.position.copy(TARGET).addScaledVector(VIEW_DIRECTION, distance);
  camera.lookAt(TARGET);
  camera.updateMatrixWorld();
}

function fits(camera: THREE.PerspectiveCamera): boolean {
  const p = new THREE.Vector3();
  return CORNERS.every((c) => {
    p.copy(c).project(camera);
    return Math.abs(p.x) <= MARGIN && Math.abs(p.y) <= MARGIN;
  });
}

/** Keeps the whole object (wheel, pointer and pedestal) in frame at any aspect ratio. */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const invalidate = useThree((s) => s.invalidate);

  useLayoutEffect(() => {
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    // Closest distance at which every corner of the bounds stays on screen.
    let near = 1;
    let far = 60;
    for (let i = 0; i < 24; i++) {
      const mid = (near + far) / 2;
      place(camera, mid);
      if (fits(camera)) far = mid;
      else near = mid;
    }
    place(camera, far);
    camera.near = 0.1;
    camera.far = far + 10;
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, width, height, invalidate]);

  return null;
}
