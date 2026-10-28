import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { requestDraw } from '../../hooks/useDraw';
import { unlockAudio } from '../../audio/sounds';
import { TURNS_TO_DRAW, crankDrive, useCrank } from '../../state/crank';
import { useBingoStore } from '../../state/store';
import { CAGE_CENTER, LAYOUT } from './layout';

const CRANK = LAYOUT.crank;
/** The crank's hub in world space: it turns about +X through here. */
const HUB = CAGE_CENTER.clone().setX(CAGE_CENTER.x + CRANK.x);
const FULL = Math.PI * 2;

/**
 * Takes hold of the crank. Pressing on it (an invisible target round the
 * whole sweep of the handle, which is small on screen) grabs it at once and
 * puts the hall in crank mode; from then on dragging anywhere turns it. The
 * pointer is projected onto the plane the handle turns in, and the angle it
 * sweeps round the hub is what the crank turns, so it stays under the hand
 * from any camera angle. After `TURNS_TO_DRAW` turns, letting go draws a
 * ball, just like the red button. Local origin = cage centre.
 */
export function CrankControl() {
  const camera = useThree((s) => s.camera);
  const canvas = useThree((s) => s.gl.domElement);
  const invalidate = useThree((s) => s.invalidate);
  const active = useCrank((s) => s.active);
  const drawing = useBingoStore((s) => s.draw !== null);
  const [hovered, setHovered] = useState(false);
  const hit = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), []);
  useEffect(() => () => hit.dispose(), [hit]);

  /** Starts a hold with a pointer that went down, wherever it went down. */
  const grab = useRef<(e: PointerEvent) => void>(() => {});

  useEffect(() => {
    if (!hovered || active) return;
    document.body.style.cursor = drawing ? '' : 'grab';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered, active, drawing]);

  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -HUB.x);
    const point = new THREE.Vector3();
    let last: number | null = null;

    const angleAt = (e: PointerEvent): number | null => {
      const rect = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(plane, point)) return null;
      const y = point.y - HUB.y;
      const z = point.z - HUB.z;
      // Too near the hub, a tiny move would spin it wildly.
      if (Math.hypot(y, z) < 0.02) return null;
      // A turn of θ about +X carries (y, z) = (1, 0) to (cos θ, sin θ).
      return Math.atan2(z, y);
    };

    grab.current = (e) => {
      if (e.button !== 0 || useBingoStore.getState().draw) return;
      unlockAudio();
      crankDrive.dragging = true;
      last = angleAt(e);
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // The pointer may already be gone (a very quick tap): the hold just ends on its own.
      }
      document.body.style.cursor = 'grabbing';
      invalidate();
    };
    const onDown = (e: PointerEvent) => {
      if (useCrank.getState().active) grab.current(e);
    };
    const onMove = (e: PointerEvent) => {
      if (!crankDrive.dragging) return;
      const a = angleAt(e);
      if (a !== null && last !== null) {
        let d = a - last;
        d -= FULL * Math.round(d / FULL);
        crankDrive.turned += d;
        crankDrive.total += d;
        const progress = Math.min(1, Math.floor((Math.abs(crankDrive.total) / (FULL * TURNS_TO_DRAW)) * 8) / 8);
        if (progress !== useCrank.getState().progress) useCrank.getState().setProgress(progress);
        invalidate();
      }
      last = a;
    };
    const onUp = (e: PointerEvent) => {
      if (!crankDrive.dragging) return;
      crankDrive.dragging = false;
      last = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      document.body.style.cursor = useCrank.getState().active ? 'grab' : '';
      // Turned enough: letting go lets a ball out (requestDraw hands the camera back to the draw).
      if (useCrank.getState().progress >= 1) requestDraw({ hand: true });
      invalidate();
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    return () => {
      crankDrive.dragging = false;
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    };
  }, [camera, canvas, invalidate]);

  // In crank mode, dragging must turn the crank, not scroll the page.
  useEffect(() => {
    if (!active) return;
    const touchAction = canvas.style.touchAction;
    canvas.style.touchAction = 'none';
    document.body.style.cursor = 'grab';
    return () => {
      canvas.style.touchAction = touchAction;
      document.body.style.cursor = '';
    };
  }, [active, canvas]);

  const onGrab = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (useCrank.getState().active || useBingoStore.getState().draw) return;
    useCrank.getState().setActive(true);
    grab.current(e.nativeEvent);
  };

  return (
    <mesh
      material={hit}
      position-x={CRANK.x - 0.03}
      rotation-z={Math.PI / 2}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onPointerDown={onGrab}
    >
      <cylinderGeometry args={[CRANK.armLength + 0.03, CRANK.armLength + 0.03, 0.1, 24]} />
    </mesh>
  );
}
