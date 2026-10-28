import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { RACK_INPUT_ID, useRack } from '../../state/rack';
import { RACK_SLOTS, useBingoStore } from '../../state/store';
import { woodTexture } from '../room/textures';
import { PLATE_H, PLATE_W, createPlateTexture, paintPlate } from './plateTexture';

/** The walnut wedge the plate is screwed to: low at the front, so it faces whoever is typing. */
const WEDGE = { w: PLATE_W + 0.03, d: 0.064, front: 0.016, back: 0.044 };
const SLOPE = Math.atan2(WEDGE.back - WEDGE.front, WEDGE.d);
const BLINK_MS = 530;

/**
 * The engraved brass plate in front of the ball rack, where options are
 * written: the text being typed is cut into it as you go, with a caret, and
 * Enter drops it into the rack as a ball. The typing goes into an invisible
 * HTML field kept exactly over the plate on screen, so the keyboard, paste,
 * screen readers and a phone's own keyboard all work; tapping the plate
 * focuses it. Local origin: the plate's spot on the table, in rack space.
 */
export function RackPlate({ position }: { position: [number, number, number] }) {
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera);
  const canvas = useThree((s) => s.gl.domElement);
  const plateRef = useRef<THREE.Mesh>(null);

  const parts = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-WEDGE.d / 2, 0);
    shape.lineTo(WEDGE.d / 2, 0);
    shape.lineTo(WEDGE.d / 2, WEDGE.front);
    shape.lineTo(-WEDGE.d / 2, WEDGE.back);
    shape.closePath();
    const wedge = new THREE.ExtrudeGeometry(shape, {
      depth: WEDGE.w,
      bevelEnabled: true,
      bevelThickness: 0.003,
      bevelSize: 0.003,
      bevelSegments: 2,
    });
    wedge.translate(0, 0, -WEDGE.w / 2);
    wedge.rotateY(-Math.PI / 2);
    const woodMap = woodTexture([1, 1], 61);
    const wood = new THREE.MeshPhysicalMaterial({ map: woodMap, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.2 });
    const face = document.createElement('canvas');
    // Painted at full size before the texture exists: a canvas texture cannot change size once uploaded.
    paintPlate(face, { text: '', caret: false, count: 0, slots: RACK_SLOTS });
    const map = createPlateTexture(face);
    const plate = new THREE.MeshStandardMaterial({ color: '#c9a04a', metalness: 1, roughness: 0.3, map });
    return { wedge, woodMap, wood, face, map, plate };
  }, []);

  useEffect(
    () => () => {
      parts.wedge.dispose();
      parts.woodMap.dispose();
      parts.wood.dispose();
      parts.map.dispose();
      parts.plate.dispose();
    },
    [parts],
  );

  // Repaint whenever the text, the caret or the count changes; the caret blinks while typing.
  useEffect(() => {
    let caretOn = true;
    const paint = () => {
      const { draft, focused, open } = useRack.getState();
      paintPlate(parts.face, {
        text: draft,
        caret: open && focused && caretOn,
        count: Math.min(useBingoStore.getState().pending.length, RACK_SLOTS),
        slots: RACK_SLOTS,
      });
      parts.map.needsUpdate = true;
      invalidate();
    };
    paint();
    void document.fonts?.ready.then(paint);
    const timer = setInterval(() => {
      const { focused, open } = useRack.getState();
      if (!focused || !open) return;
      caretOn = !caretOn;
      paint();
    }, BLINK_MS);
    const off = [
      useRack.subscribe(() => {
        caretOn = true;
        paint();
      }),
      useBingoStore.subscribe((s, prev) => s.pending !== prev.pending && paint()),
    ];
    return () => {
      clearInterval(timer);
      off.forEach((f) => f());
    };
  }, [parts, invalidate]);

  // While the rack is open, keep the invisible field over the plate as the camera moves or the page scrolls.
  useEffect(() => {
    const wake = () => invalidate();
    window.addEventListener('scroll', wake, { passive: true });
    return () => window.removeEventListener('scroll', wake);
  }, [invalidate]);

  const corner = useMemo(() => new THREE.Vector3(), []);
  const last = useRef('');
  useFrame(() => {
    const input = document.getElementById(RACK_INPUT_ID);
    const plate = plateRef.current;
    if (!input || !plate || !useRack.getState().open) return;
    const rect = canvas.getBoundingClientRect();
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      plate.localToWorld(corner.set((sx * PLATE_W) / 2, (sy * PLATE_H) / 2, 0)).project(camera);
      const x = rect.left + ((corner.x + 1) / 2) * rect.width;
      const y = rect.top + ((1 - corner.y) / 2) * rect.height;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    const style = `${Math.round(x0)},${Math.round(y0)},${Math.round(x1 - x0)},${Math.round(y1 - y0)}`;
    if (style === last.current) return;
    last.current = style;
    const [l, t, w, h] = style.split(',');
    Object.assign(input.style, { left: `${l}px`, top: `${t}px`, width: `${w}px`, height: `${h}px` });
  });

  const onTap = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const rack = useRack.getState();
    if (!rack.open && !rack.tipping && !useBingoStore.getState().draw) rack.setOpen(true);
    document.getElementById(RACK_INPUT_ID)?.focus({ preventScroll: true });
  };

  const mid = (WEDGE.front + WEDGE.back) / 2;
  return (
    <group position={position}>
      <mesh geometry={parts.wedge} material={parts.wood} castShadow receiveShadow />
      <mesh
        ref={plateRef}
        material={parts.plate}
        // Just proud of the wedge's top, which its bevel lifts by bevelSize.
        position={[0, mid + 0.0045, 0]}
        rotation-x={-Math.PI / 2 + SLOPE}
        receiveShadow
        onClick={onTap}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'text';
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
        }}
      >
        <planeGeometry args={[PLATE_W, PLATE_H]} />
      </mesh>
    </group>
  );
}
