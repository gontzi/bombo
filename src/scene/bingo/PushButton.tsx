import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { playButton, unlockAudio } from '../../audio/sounds';
import { requestDraw } from '../../hooks/useDraw';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useBingoStore } from '../../state/store';
import { glowRef } from '../bloom';
import { brass, brushedSteel } from '../materials';
import { woodTexture } from '../room/textures';
import { LAYOUT } from './layout';

const BTN = LAYOUT.button;
const SLOPE = Math.atan2(BTN.backHeight - BTN.frontHeight, BTN.depth);

/** Name plate size on the console, metres: as wide as the slope allows, so it reads from the camera. */
const PLATE_W = 0.17;
const PLATE_H = 0.036;
/** The lamp in the cap breathes now and then while a draw is possible: a few breaths every so often. */
const BREATH_EVERY = 9;
const BREATH_FOR = 3;

/** Engraved brass name plate: deep-cut lettering filled with black enamel, on a white map tinted by the brass. */
function plateTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 680;
  c.height = Math.round((680 * PLATE_H) / PLATE_W);
  const ctx = c.getContext('2d')!;
  const w = c.width;
  const h = c.height;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(40,24,8,0.6)';
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(16, 16, w - 32, h - 32);
  ctx.font = `800 ${Math.round(h * 0.6)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  ctx.letterSpacing = `${Math.round(h * 0.08)}px`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // The cut catches light on its lower edge.
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText('SACAR BOLA', w / 2, h / 2 + 4);
  ctx.fillStyle = '#1c1006';
  ctx.fillText('SACAR BOLA', w / 2, h / 2 + 2);
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

  // Wake the frame loop as each breath starts; the frame loop keeps itself going until it ends.
  useEffect(() => {
    if (!canDraw || reducedMotion) return;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      const wait = (BREATH_EVERY - ((performance.now() / 1000) % BREATH_EVERY)) * 1000;
      timer = setTimeout(() => {
        invalidate();
        next();
      }, wait + 20);
    };
    next();
    return () => clearTimeout(timer);
  }, [canDraw, reducedMotion, invalidate]);

  useFrame((state, delta) => {
    const down = pressed.current || drawing;
    const goal = down ? BTN.travel : 0;
    const k = reducedMotion ? 1 : 1 - Math.exp(-delta * 28);
    travel.current += (goal - travel.current) * k;
    if (capRef.current) capRef.current.position.y = -travel.current;

    // Lamp inside the cap: soft glow when ready (breathing now and then to invite a press),
    // a quick pulse while drawing, dark when empty.
    const t = state.clock.elapsedTime;
    const phase = (performance.now() / 1000) % BREATH_EVERY;
    const breathing = canDraw && !hovered && !reducedMotion && phase < BREATH_FOR;
    const breath = breathing ? Math.sin((Math.PI * phase) / (BREATH_FOR / 2)) ** 2 : 0;
    const idle = hovered ? 0.6 : 0.28 + 0.5 * breath;
    const glow = drawing ? (reducedMotion ? 0.9 : 0.6 + 0.45 * Math.sin(t * 6)) : canDraw ? idle : 0;
    parts.capMaterial.emissiveIntensity += (glow - parts.capMaterial.emissiveIntensity) * Math.min(1, delta * 10);
    parts.capMaterial.color.set(canDraw || drawing ? '#c3271f' : '#5a4a44');

    if (
      drawing ||
      breathing ||
      Math.abs(goal - travel.current) > 1e-5 ||
      Math.abs(glow - parts.capMaterial.emissiveIntensity) > 0.01
    ) {
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
          <mesh geometry={parts.cap} material={parts.capMaterial} castShadow position-y={0.002} ref={glowRef} />
        </group>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * BTN.capRadius * 2.4, 0.0, 0.0]} material={brushedSteel}>
            <cylinderGeometry args={[0.0045, 0.0045, 0.003, 12]} />
          </mesh>
        ))}
        {/* Engraved plate in front of the button, facing the player. */}
        <mesh position={[0, 0.0005, BTN.capRadius + 0.012 + PLATE_H / 2]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[PLATE_W, PLATE_H]} />
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
