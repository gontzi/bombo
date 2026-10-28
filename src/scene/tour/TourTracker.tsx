import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useBingoStore } from '../../state/store';
import { frameDelta } from '../CameraRig';
import { TOUR_OVERLAY_ID, TOUR_STEPS, useTour } from '../../state/tour';
import { TOUR_STOPS, TRAY_STOP } from './stops';

/** Smallest ring on screen around a part, px. */
const MIN_RING = 26;

/**
 * Tells the guide's overlay where its spotlight falls on the canvas, every
 * frame the camera moves (CSS variables for its centre and radius). It glides
 * from one part to the next and grows or shrinks to fit, never jumps; during
 * a draw it lets the whole hall show.
 */
export function TourTracker() {
  const camera = useThree((s) => s.camera);
  const canvas = useThree((s) => s.gl.domElement);
  const invalidate = useThree((s) => s.invalidate);
  const reducedMotion = useReducedMotion();
  const step = useTour((s) => s.step);
  const p = useMemo(() => new THREE.Vector3(), []);
  const q = useMemo(() => new THREE.Vector3(), []);
  /** The spotlight as it stands, in world space: easing towards the current step's. */
  const spot = useRef({ anchor: new THREE.Vector3(), radius: 0, placed: false });
  const last = useRef('');

  // A new step moves the camera and the spotlight; the frame loop has to wake for them.
  useEffect(() => {
    if (step === null) spot.current.placed = false;
    invalidate();
  }, [step, invalidate]);

  useFrame((_, delta) => {
    const overlay = document.getElementById(TOUR_OVERLAY_ID);
    if (!overlay || step === null) return;
    const { showResult } = useTour.getState();
    const stop = showResult ? TRAY_STOP : TOUR_STOPS[TOUR_STEPS[step]!.id];
    const s = spot.current;
    const k = reducedMotion ? 1 : 1 - Math.exp(-frameDelta(delta) * 4.5);
    if (stop.anchor) {
      if (!s.placed) s.anchor.copy(stop.anchor);
      else s.anchor.lerp(stop.anchor, k);
      s.placed = true;
    }
    const goalRadius = stop.anchor ? stop.radius : 0;
    s.radius += (goalRadius - s.radius) * k;
    const moving = s.anchor.distanceToSquared(stop.anchor ?? s.anchor) > 1e-8 || Math.abs(goalRadius - s.radius) > 1e-4;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const toScreen = (v: THREE.Vector3) => [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h] as const;
    let [x, y] = [w / 2, h / 2];
    let r = 0;
    if (s.placed) {
      [x, y] = toScreen(p.copy(s.anchor).project(camera));
      // The radius as seen: the anchor's distance on screen to a point `radius` to its side.
      const [qx, qy] = toScreen(q.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(s.radius).add(s.anchor).project(camera));
      const grown = goalRadius > 0 ? Math.min(1, s.radius / goalRadius) : s.radius / 0.05;
      r = Math.max(Math.hypot(qx - x, qy - y), MIN_RING * Math.min(1, grown));
    }

    const dim = useBingoStore.getState().draw ? 'off' : 'on';

    const key = [x, y, r].map(Math.round).join() + dim;
    if (moving) invalidate();
    if (key === last.current) return;
    last.current = key;
    overlay.style.setProperty('--spot-x', `${Math.round(x)}px`);
    overlay.style.setProperty('--spot-y', `${Math.round(y)}px`);
    overlay.style.setProperty('--spot-r', `${Math.round(r)}px`);
    overlay.dataset.dim = dim;
  });

  return null;
}
