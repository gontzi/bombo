import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { playButton, unlockAudio } from '../../audio/sounds';
import { requestDraw } from '../../hooks/useDraw';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useBingoStore } from '../../state/store';
import { brass, brushedSteel } from '../materials';
import { woodTexture } from '../room/textures';
import { LAYOUT } from './layout';

const BTN = LAYOUT.button;
const SLOPE = Math.atan2(BTN.backHeight - BTN.frontHeight, BTN.depth);

/** Engraved brass name plate: dark lettering on a white map, tinted by the brass colour. */
function plateTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 512, 96);
  ctx.strokeStyle = 'rgba(40,24,8,0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, 492, 76);
  ctx.fillStyle = '#2a1806';
  ctx.font = '800 54px "Barlow Condensed", "Arial Narrow", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SACAR  BOLA', 256, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * The draw button, mounted on the table: a walnut console with a sloped top,
 * a turned brass bezel and a red mushroom cap that sinks when pressed, stays
 * down while the cage turns, and glows from inside when a draw is possible.
 * It calls the same requestDraw() as the keyboard and the HTML control.
 */
export function PushButton() {
  const invalidate = useThree((s) => s.invalidate);
  const reducedMotion = useReducedMotion();
  const canDraw = useBingoStore((s) => s.entries.length > 0 && s.draw === null);
  const drawing = useBingoStore((s) => s.draw !== null);
  const [hovered, setHovered] = useState(false);
  const pressed = useRef(false);
  const capRef = useRef<THREE.Group>(null);
  const travel = useRef(0);

  const parts = useMemo(() => {
    // Side profile of the console (z forward, y up), extruded across its width.
    const shape = new THREE.Shape();
    shape.moveTo(-BTN.depth / 2, 0);
    shape.lineTo(BTN.depth / 2, 0);
    shape.lineTo(BTN.depth / 2, BTN.frontHeight);
    shape.lineTo(-BTN.depth / 2, BTN.backHeight);
    shape.closePath();
    const body = new THREE.ExtrudeGeometry(shape, {
      depth: BTN.width - 0.012,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.006,
      bevelSegments: 3,
    });
    body.translate(0, 0, -(BTN.width - 0.012) / 2);
    body.rotateY(-Math.PI / 2);
    // Planar UVs for the grain.
    const uv = body.attributes.uv!;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 4);

    const bezel = new THREE.LatheGeometry(
      [
        [BTN.capRadius + 0.002, 0.0],
        [BTN.capRadius + 0.012, 0.0],
        [BTN.capRadius + 0.013, 0.006],
        [BTN.capRadius + 0.009, 0.011],
        [BTN.capRadius + 0.003, 0.012],
        [BTN.capRadius + 0.002, 0.004],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      48,
    );
    const cap = new THREE.LatheGeometry(
      [
        [0, 0.03],
        [BTN.capRadius * 0.45, 0.029],
        [BTN.capRadius * 0.8, 0.025],
        [BTN.capRadius, 0.018],
        [BTN.capRadius * 1.02, 0.012],
        [BTN.capRadius * 0.9, 0.01],
        [BTN.capRadius * 0.8, 0.0],
        [0, 0.0],
      ]
        .reverse()
        .map(([r, y]) => new THREE.Vector2(r, y)),
      48,
    );
    const woodMap = woodTexture([1, 1], 33);
    const wood = new THREE.MeshPhysicalMaterial({ map: woodMap, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.2 });
    const capMaterial = new THREE.MeshPhysicalMaterial({
      color: '#c3271f',
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      emissive: new THREE.Color('#ff2a10'),
      emissiveIntensity: 0,
    });
    const label = plateTexture();
    const plate = new THREE.MeshStandardMaterial({ color: '#c9a04a', metalness: 1, roughness: 0.32, map: label });
    const hit = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    return { body, bezel, cap, wood, woodMap, capMaterial, label, plate, hit };
  }, []);

  useEffect(
    () => () => {
      for (const g of [parts.body, parts.bezel, parts.cap]) g.dispose();
      for (const m of [parts.wood, parts.capMaterial, parts.plate, parts.hit]) m.dispose();
      parts.woodMap.dispose();
      parts.label.dispose();
    },
    [parts],
  );

  useEffect(() => {
    document.body.style.cursor = hovered && canDraw ? 'pointer' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered, canDraw]);

  useFrame((state, delta) => {
    const down = pressed.current || drawing;
    const goal = down ? BTN.travel : 0;
    const k = reducedMotion ? 1 : 1 - Math.exp(-delta * 28);
    travel.current += (goal - travel.current) * k;
    if (capRef.current) capRef.current.position.y = -travel.current;

    // Lamp inside the cap: soft glow when ready, a slow pulse while drawing, dark when empty.
    const t = state.clock.elapsedTime;
    const glow = drawing ? (reducedMotion ? 0.9 : 0.6 + 0.45 * Math.sin(t * 6)) : canDraw ? (hovered ? 0.55 : 0.28) : 0;
    parts.capMaterial.emissiveIntensity += (glow - parts.capMaterial.emissiveIntensity) * Math.min(1, delta * 10);
    parts.capMaterial.color.set(canDraw || drawing ? '#c3271f' : '#5a4a44');

    if (drawing || Math.abs(goal - travel.current) > 1e-5 || Math.abs(glow - parts.capMaterial.emissiveIntensity) > 0.01) {
      invalidate();
    }
  });

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!canDraw) return;
    pressed.current = true;
    unlockAudio();
    if (useBingoStore.getState().sound) playButton();
    invalidate();
  };
  const onUp = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (pressed.current) {
      pressed.current = false;
      requestDraw();
    }
    invalidate();
  };

  const [x = 0, , z = 0] = BTN.center;
  // Point on the sloped top where the bezel sits, slightly behind the middle.
  const mountZ = -0.018;
  const mountY = BTN.frontHeight + (BTN.backHeight - BTN.frontHeight) * (0.5 - mountZ / BTN.depth) + 0.006;

  return (
    <group position={[x, 0, z]} rotation-y={0.18}>
      <mesh geometry={parts.body} material={parts.wood} castShadow receiveShadow />
      {/* Everything mounted on the slope shares its tilt. */}
      <group position={[0, mountY, mountZ]} rotation-x={SLOPE}>
        <mesh geometry={parts.bezel} material={brass} castShadow />
        <group ref={capRef}>
          <mesh geometry={parts.cap} material={parts.capMaterial} castShadow position-y={0.002} />
        </group>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * BTN.capRadius * 2.4, 0.0, 0.0]} material={brushedSteel}>
            <cylinderGeometry args={[0.0045, 0.0045, 0.003, 12]} />
          </mesh>
        ))}
        {/* Engraved plate in front of the button, facing the player. */}
        <mesh position={[0, 0.0005, BTN.capRadius + 0.026]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[BTN.capRadius * 4, BTN.capRadius * 0.76]} />
          <primitive object={parts.plate} attach="material" />
        </mesh>
        {/* Generous invisible hit area, so the button is easy to press on small screens. */}
        <mesh
          material={parts.hit}
          position-y={0.02}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
          }}
          onPointerOut={() => {
            setHovered(false);
            pressed.current = false;
          }}
          onPointerDown={onDown}
          onPointerUp={onUp}
        >
          <cylinderGeometry args={[BTN.capRadius * 2.6, BTN.capRadius * 2.6, 0.07, 24]} />
        </mesh>
      </group>
    </group>
  );
}
