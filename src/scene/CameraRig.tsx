import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { DrawPlan } from '../domain/draw';
import { useBingoStore } from '../state/store';
import { heroTracker } from './bingo/hero';
import { LAYOUT, PORT_INSIDE, TRAY_CENTER } from './bingo/layout';
import { cinematicEnd, cinematicShots, evaluateShots, landingShake, placeCamera, type Pose, type Shot } from './cinematic';

/** Three-quarter view from the front right and above: table top, cage depth and the chute all read. */
const VIEW_DIRECTION = new THREE.Vector3(0.62, 0.5, 0.8).normalize();
/** Portrait screens look from a little higher and more frontally, so the machine fills the width. */
const PORTRAIT_DIRECTION = new THREE.Vector3(0.42, 0.55, 0.9).normalize();
const MARGIN = 0.95;

const F = LAYOUT.frame;
const CORNERS = [F.minX, F.maxX].flatMap((x) =>
  [F.minY, F.maxY].flatMap((y) => [F.minZ, F.maxZ].map((z) => new THREE.Vector3(x, y, z))),
);
const RESULT_Y = 0.62;
const FRAME_CENTER = new THREE.Vector3((F.minX + F.maxX) / 2, (F.minY + F.maxY) / 2, (F.minZ + F.maxZ) / 2);
/** Leaning towards the tray, aimed and pulled back so the winner sign hanging above the cage is in shot. */
const RESULT_TARGET = FRAME_CENTER.clone().lerp(TRAY_CENTER, 0.25).setY(RESULT_Y);
/** Result framing distance, as a fraction of the machine's own framing distance. */
export const RESULT_DISTANCE = 1.15;
/** At rest the camera tilts up a touch, so the back wall's signs come into shot above the machine. */
const IDLE_PITCH = 0.045;
/** Parallax: how far the view swings with the pointer across the screen (radians each way). */
const PARALLAX_AZIMUTH = 0.07;
const PARALLAX_ELEVATION = 0.035;

/** Width of the options panel when it overlays the scene (desktop), so the machine centres in the free area. */
function panelOverlap(width: number): number {
  if (!window.matchMedia('(min-width: 861px)').matches) return 0;
  const panel = document.querySelector('.sidebar');
  return panel ? Math.min(width * 0.5, panel.getBoundingClientRect().width) : 0;
}

/** Closest distance at which every corner of the machine's bounds fits on screen. */
function fitDistance(fov: number, aspect: number, direction: THREE.Vector3, pitch = 0): number {
  const probe = new THREE.PerspectiveCamera(fov, aspect, 0.05, 50);
  const p = new THREE.Vector3();
  const fits = (d: number) => {
    probe.position.copy(FRAME_CENTER).addScaledVector(direction, d);
    probe.lookAt(FRAME_CENTER);
    probe.rotateX(pitch);
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

/** The pointer's position over the window, -1 to 1 each way (mouse and pen only: touch is for scrolling). */
const pointer = { x: 0, y: 0 };
if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  });
  document.documentElement.addEventListener('pointerleave', () => {
    pointer.x = 0;
    pointer.y = 0;
  });
}

const angles = (direction: THREE.Vector3) => ({
  azimuth: Math.atan2(direction.x, direction.z),
  elevation: Math.asin(direction.y),
});

/**
 * Frames the machine for any screen. During a draw it plays the shot list in
 * cinematic.ts (in close on the spinning cage, then after the ball down the
 * chute) and ends on the result view; otherwise it eases between the idle
 * and result framings and drifts gently with the pointer, so the hall has
 * depth. No moves at all when the user prefers reduced motion.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const invalidate = useThree((s) => s.invalidate);
  const reducedMotion = useReducedMotion();
  const drawing = useBingoStore((s) => s.draw !== null);
  const hasResult = useBingoStore((s) => s.lastResult !== null);

  /** `distance` frames the machine head-on; `idleDistance` frames it with the camera tilted up. */
  const base = useRef({ distance: 2, idleDistance: 2, direction: VIEW_DIRECTION.clone() });
  const current = useRef({ distance: 0, target: FRAME_CENTER.clone(), pitch: IDLE_PITCH });
  /** Smoothed pointer, and how much of it applies (0 right after a draw's shot list, easing back to 1). */
  const parallax = useRef({ x: 0, y: 0, weight: 1 });
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useLayoutEffect(() => {
    const overlap = panelOverlap(width);
    const free = Math.max(1, width - overlap);
    const aspect = free / Math.max(1, height);
    const direction = aspect < 0.9 ? PORTRAIT_DIRECTION : VIEW_DIRECTION;
    base.current = {
      distance: fitDistance(camera.fov, aspect, direction),
      idleDistance: fitDistance(camera.fov, aspect, direction, IDLE_PITCH),
      direction,
    };
    if (current.current.distance === 0) current.current.distance = base.current.idleDistance;
    camera.aspect = width / Math.max(1, height);
    if (overlap > 0) camera.setViewOffset(width, height, overlap / 2, 0, width, height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, width, height, invalidate]);

  // Demand rendering: moving the pointer has to wake the frame loop for the parallax.
  useEffect(() => {
    if (reducedMotion) return;
    const wake = () => invalidate();
    window.addEventListener('pointermove', wake);
    return () => window.removeEventListener('pointermove', wake);
  }, [invalidate, reducedMotion]);

  /** The camera as last placed, so a draw can start from wherever it is. */
  const pose = useRef<Pose>({ target: FRAME_CENTER.clone(), azimuth: 0, elevation: 0, distance: 0, roll: 0, pitch: 0 });
  const cine = useRef<{ plan: DrawPlan | null; startedAt: number; shots: Shot[] }>({ plan: null, startedAt: 0, shots: [] });

  useFrame((_, delta) => {
    const c = current.current;
    const { direction, distance, idleDistance } = base.current;
    const par = parallax.current;
    const draw = useBingoStore.getState().draw;

    if (draw && draw.plan !== cine.current.plan && !draw.plan.reducedMotion && !reducedMotion) {
      const rest = { target: FRAME_CENTER, ...angles(direction), distance, roll: 0, pitch: 0 };
      cine.current = {
        plan: draw.plan,
        startedAt: draw.startedAt,
        shots: cinematicShots(draw.plan.timeline, pose.current, rest, RESULT_TARGET, RESULT_DISTANCE),
      };
    }

    const plan = cine.current.plan;
    const ms = performance.now() - cine.current.startedAt;
    if (plan && ms < cinematicEnd(plan.timeline)) {
      const hero = heroTracker.visible ? heroTracker.position : PORT_INSIDE;
      const p = evaluateShots(cine.current.shots, ms, hero, pose.current);
      p.roll += landingShake(plan.timeline, ms) * 0.012;
      placeCamera(camera, p);
      // Hand over to the regular framing exactly where the shot list ends.
      c.target.copy(RESULT_TARGET);
      c.distance = distance * RESULT_DISTANCE;
      c.pitch = 0;
      par.weight = 0;
      camera.near = 0.03;
      camera.far = p.distance + 14;
      camera.updateProjectionMatrix();
      invalidate();
      return;
    }

    const focus = reducedMotion ? 'idle' : hasResult ? 'result' : drawing ? 'drawing' : 'idle';
    const goalDistance =
      focus === 'result' ? distance * RESULT_DISTANCE : idleDistance * (focus === 'drawing' ? 0.94 : 1);
    const goalTarget = focus === 'result' ? RESULT_TARGET : FRAME_CENTER;
    const goalPitch = focus === 'result' ? 0 : IDLE_PITCH;
    const k = reducedMotion ? 1 : 1 - Math.exp(-delta * 2.2);
    c.distance += (goalDistance - c.distance) * k;
    c.target.lerp(goalTarget, k);
    c.pitch += (goalPitch - c.pitch) * k;

    // The pointer is followed lazily, and fades back in after a draw's shot list.
    const follow = reducedMotion ? 0 : 1;
    const kp = 1 - Math.exp(-delta * 2.5);
    par.x += (pointer.x * follow - par.x) * kp;
    par.y += (pointer.y * follow - par.y) * kp;
    par.weight += (1 - par.weight) * (1 - Math.exp(-delta * 1.2));

    const rest = angles(direction);
    pose.current.target.copy(c.target);
    Object.assign(pose.current, {
      azimuth: rest.azimuth + par.x * PARALLAX_AZIMUTH * par.weight,
      elevation: rest.elevation - par.y * PARALLAX_ELEVATION * par.weight,
      distance: c.distance,
      roll: 0,
      pitch: c.pitch,
    });
    placeCamera(camera, pose.current);
    camera.near = 0.05;
    camera.far = c.distance + 14;
    camera.updateProjectionMatrix();

    const settling =
      Math.abs(goalDistance - c.distance) > 1e-4 ||
      Math.abs(goalPitch - c.pitch) > 1e-5 ||
      tmp.subVectors(goalTarget, c.target).lengthSq() > 1e-8;
    const drifting =
      Math.abs(pointer.x * follow - par.x) > 1e-4 || Math.abs(pointer.y * follow - par.y) > 1e-4 || 1 - par.weight > 1e-3;
    if (settling || drifting) invalidate();
  });

  return null;
}
