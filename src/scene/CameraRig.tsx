import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useBingoStore } from '../state/store';
import { LAYOUT, TRAY_CENTER } from './bingo/layout';

/** Three-quarter view from the front right and above: table top, cage depth and the chute all read. */
const VIEW_DIRECTION = new THREE.Vector3(0.62, 0.5, 0.8).normalize();
/** Portrait screens look from a little higher and more frontally, so the machine fills the width. */
const PORTRAIT_DIRECTION = new THREE.Vector3(0.42, 0.55, 0.9).normalize();
const MARGIN = 0.95;

const F = LAYOUT.frame;
const CORNERS = [F.minX, F.maxX].flatMap((x) =>
  [F.minY, F.maxY].flatMap((y) => [F.minZ, F.maxZ].map((z) => new THREE.Vector3(x, y, z))),
);
const FRAME_CENTER = new THREE.Vector3((F.minX + F.maxX) / 2, (F.minY + F.maxY) / 2, (F.minZ + F.maxZ) / 2);
/** Leaning towards the tray, and aimed higher so the machine sits lower, below the result plate. */
const RESULT_TARGET = FRAME_CENTER.clone().lerp(TRAY_CENTER, 0.3).setY(FRAME_CENTER.y + 0.12);

/** Width of the options panel when it overlays the scene (desktop), so the machine centres in the free area. */
function panelOverlap(width: number): number {
  if (!window.matchMedia('(min-width: 861px)').matches) return 0;
  const panel = document.querySelector('.sidebar');
  return panel ? Math.min(width * 0.5, panel.getBoundingClientRect().width) : 0;
}

/** Closest distance at which every corner of the machine's bounds fits on screen. */
function fitDistance(fov: number, aspect: number, direction: THREE.Vector3): number {
  const probe = new THREE.PerspectiveCamera(fov, aspect, 0.05, 50);
  const p = new THREE.Vector3();
  const fits = (d: number) => {
    probe.position.copy(FRAME_CENTER).addScaledVector(direction, d);
    probe.lookAt(FRAME_CENTER);
    probe.updateMatrixWorld();
    probe.updateProjectionMatrix();
    return CORNERS.every((c) => {
      p.copy(c).project(probe);
      return Math.abs(p.x) <= MARGIN && Math.abs(p.y) <= MARGIN;
    });
  };
  let near = 0.3;
  let far = 20;
  for (let i = 0; i < 24; i++) {
    const mid = (near + far) / 2;
    if (fits(mid)) far = mid;
    else near = mid;
  }
  return far;
}

/**
 * Frames the machine for any screen, then eases in slightly while the cage
 * turns and moves towards the tray when the ball lands. No moves at all when
 * the user prefers reduced motion.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const invalidate = useThree((s) => s.invalidate);
  const reducedMotion = useReducedMotion();
  const drawing = useBingoStore((s) => s.draw !== null);
  const hasResult = useBingoStore((s) => s.lastResult !== null);

  const base = useRef({ distance: 2, direction: VIEW_DIRECTION.clone() });
  const current = useRef({ distance: 0, target: FRAME_CENTER.clone() });
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useLayoutEffect(() => {
    const overlap = panelOverlap(width);
    const free = Math.max(1, width - overlap);
    const aspect = free / Math.max(1, height);
    const direction = aspect < 0.9 ? PORTRAIT_DIRECTION : VIEW_DIRECTION;
    base.current = { distance: fitDistance(camera.fov, aspect, direction), direction };
    if (current.current.distance === 0) current.current.distance = base.current.distance;
    camera.aspect = width / Math.max(1, height);
    if (overlap > 0) camera.setViewOffset(width, height, overlap / 2, 0, width, height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, width, height, invalidate]);

  useFrame((_, delta) => {
    const focus = reducedMotion ? 'idle' : hasResult ? 'result' : drawing ? 'drawing' : 'idle';
    const goalDistance = base.current.distance * (focus === 'result' ? 0.92 : focus === 'drawing' ? 0.94 : 1);
    const goalTarget = focus === 'result' ? RESULT_TARGET : FRAME_CENTER;
    const c = current.current;
    const k = reducedMotion ? 1 : 1 - Math.exp(-delta * 2.2);
    c.distance += (goalDistance - c.distance) * k;
    c.target.lerp(goalTarget, k);

    camera.position.copy(c.target).addScaledVector(base.current.direction, c.distance);
    camera.lookAt(c.target);
    camera.near = 0.05;
    camera.far = c.distance + 14;
    camera.updateProjectionMatrix();

    if (Math.abs(goalDistance - c.distance) > 1e-4 || tmp.subVectors(goalTarget, c.target).lengthSq() > 1e-8) {
      invalidate();
    }
  });

  return null;
}
