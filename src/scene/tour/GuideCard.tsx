import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { unlockAudio } from '../../audio/sounds';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { startTour, useTour } from '../../state/tour';
import { useBingoStore } from '../../state/store';
import { GUIDE_CARD_POSITION, GUIDE_CARD_YAW } from './stops';

/** Each leaf of the tent card, metres, and how far it leans back from upright. */
const CARD_W = 0.088;
const CARD_H = 0.062;
const CARD_T = 0.0016;
const LEAN = 0.3;

/** The printed face: a bingo ball with a question mark over «¿CÓMO SE JUEGA?», framed in brass on cream board. */
function faceTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = Math.round((512 * CARD_H) / CARD_W);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const paint = () => {
    const ctx = c.getContext('2d')!;
    const w = c.width;
    const h = c.height;
    ctx.fillStyle = '#f1e2bf';
    ctx.fillRect(0, 0, w, h);
    // Board grain.
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(120,80,30,${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    ctx.strokeStyle = '#a77d2c';
    ctx.lineWidth = 7;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.lineWidth = 2;
    ctx.strokeRect(28, 28, w - 56, h - 56);

    const bx = w / 2;
    const by = h * 0.4;
    const br = h * 0.2;
    const ball = ctx.createRadialGradient(bx - br * 0.35, by - br * 0.4, br * 0.1, bx, by, br);
    ball.addColorStop(0, '#ff6a52');
    ball.addColorStop(1, '#9e1d16');
    ctx.fillStyle = ball;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fbf3df';
    ctx.beginPath();
    ctx.arc(bx, by, br * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1c1006';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(br * 0.95)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    ctx.fillText('?', bx, by + br * 0.04);

    ctx.font = `800 ${Math.round(h * 0.15)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    ctx.letterSpacing = `${Math.round(h * 0.012)}px`;
    ctx.fillStyle = '#2a1608';
    ctx.fillText('¿CÓMO SE JUEGA?', w / 2, h * 0.76);
    t.needsUpdate = true;
  };
  paint();
  document.fonts?.ready.then(paint);
  return t;
}

/**
 * A folded tent card standing on the felt, like the ones on a bar table:
 * printed «¿Cómo se juega?» on both leaves. Tapping it plays the guide again.
 */
export function GuideCard() {
  const invalidate = useThree((s) => s.invalidate);
  const reducedMotion = useReducedMotion();
  const available = useBingoStore((s) => s.draw === null);
  const touring = useTour((s) => s.step !== null);
  const [hovered, setHovered] = useState(false);
  const liftRef = useRef<THREE.Group>(null);
  const lift = useRef(0);

  const parts = useMemo(() => {
    const face = faceTexture();
    const printed = new THREE.MeshStandardMaterial({ map: face, roughness: 0.75 });
    const board = new THREE.MeshStandardMaterial({ color: '#e6d3a8', roughness: 0.85 });
    const leaf = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_T);
    const hit = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    // Box faces: +x, -x, +y, -y, +z (printed), -z.
    return { face, printed, board, leaf, hit, materials: [board, board, board, board, printed, board] };
  }, []);

  useEffect(
    () => () => {
      parts.face.dispose();
      for (const m of [parts.printed, parts.board, parts.hit]) m.dispose();
      parts.leaf.dispose();
    },
    [parts],
  );

  const pressable = available && !touring;
  useEffect(() => {
    document.body.style.cursor = hovered && pressable ? 'pointer' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered, pressable]);

  // Lifts a little under the pointer, as if picked up.
  useFrame((_, delta) => {
    const goal = hovered && pressable ? 0.006 : 0;
    const k = reducedMotion ? 1 : 1 - Math.exp(-delta * 18);
    lift.current += (goal - lift.current) * k;
    if (liftRef.current) liftRef.current.position.y = lift.current;
    if (Math.abs(goal - lift.current) > 1e-5) invalidate();
  });

  const onTap = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!pressable) return;
    // A tap is a gesture: the demo's buttons and the draw can sound.
    unlockAudio();
    startTour();
  };

  // A leaf leaning back from its bottom edge, which stands `foot` in front of the fold's line.
  const foot = (CARD_H / 2) * Math.sin(LEAN);
  const leafPosition: [number, number, number] = [0, (CARD_H / 2) * Math.cos(LEAN), foot];

  return (
    <group position={GUIDE_CARD_POSITION} rotation-y={GUIDE_CARD_YAW}>
      <group ref={liftRef}>
        {[0, Math.PI].map((turn) => (
          <group key={turn} rotation-y={turn}>
            <mesh geometry={parts.leaf} material={parts.materials} position={leafPosition} rotation-x={-LEAN} castShadow receiveShadow />
          </group>
        ))}
      </group>
      {/* Generous invisible hit area, so the card is easy to tap on small screens. */}
      <mesh
        material={parts.hit}
        position-y={CARD_H / 2}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          invalidate();
        }}
        onPointerOut={() => {
          setHovered(false);
          invalidate();
        }}
        onClick={onTap}
      >
        <boxGeometry args={[CARD_W * 1.5, CARD_H * 1.4, CARD_H * 1.2]} />
      </mesh>
    </group>
  );
}
