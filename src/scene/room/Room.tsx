import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useBingoStore } from '../../state/store';
import { ballStyle } from '../../theme/balls';
import { LAYOUT } from '../bingo/layout';
import { brass } from '../materials';
import { Table } from './Table';
import { carpetTexture, wallpaperTexture, woodTexture } from './textures';

const FLOOR = LAYOUT.floorY;
const BACK_Z = -2.7;
const SIDE_X = -3.4;
const WAINSCOT = 1.05;

/** "BINGO" board on the back wall, lit with the last balls called. */
function CallBoard() {
  const history = useBingoStore((s) => s.history);
  const { canvas, texture } = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 384;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { canvas: c, texture: t };
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);

  const last = history.slice(0, 5).map((r) => r.ball);
  const key = last.join(',');
  useEffect(() => {
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#120a07';
    ctx.fillRect(0, 0, 1024, 384);
    ctx.font = '800 120px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffcf7a';
    ctx.shadowColor = 'rgba(255,170,60,0.9)';
    ctx.shadowBlur = 24;
    'BINGO'.split('').forEach((l, i) => ctx.fillText(l, 152 + i * 180, 92));
    ctx.shadowBlur = 0;
    for (let i = 0; i < 5; i++) {
      const cx = 152 + i * 180;
      const ball = last[i];
      ctx.beginPath();
      ctx.arc(cx, 262, 70, 0, Math.PI * 2);
      ctx.fillStyle = ball ? ballStyle(ball).shell : '#2a1a12';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, 262, 46, 0, Math.PI * 2);
      ctx.fillStyle = ball ? '#fbf7ec' : '#1d120c';
      ctx.fill();
      if (ball) {
        ctx.fillStyle = ballStyle(ball).ink;
        ctx.font = `800 ${ball > 99 ? 48 : 62}px "Barlow Condensed", "Arial Narrow", sans-serif`;
        ctx.fillText(String(ball), cx, 266);
      }
    }
    texture.needsUpdate = true;
    // `key` stands in for `last`: repaint when the called numbers change.
  }, [canvas, texture, key]);

  return (
    <group position={[0.6, 1.62, BACK_Z + 0.06]}>
      <mesh position-z={-0.03}>
        <boxGeometry args={[2.3, 0.95, 0.06]} />
        <meshStandardMaterial color="#2a160d" roughness={0.5} />
      </mesh>
      <mesh>
        <planeGeometry args={[2.16, 0.81]} />
        <meshStandardMaterial map={texture} emissiveMap={texture} emissive="#ffffff" emissiveIntensity={0.9} roughness={0.7} />
      </mesh>
    </group>
  );
}

/** Hanging brass lamp; the bulb glows, and a soft point light fills the space around it. */
function Pendant({ position, light = true }: { position: [number, number, number]; light?: boolean }) {
  const shade = useMemo(
    () =>
      new THREE.LatheGeometry(
        [
          [0.012, 0.16],
          [0.03, 0.15],
          [0.06, 0.1],
          [0.15, 0.02],
          [0.17, 0.0],
        ].map(([r, y]) => new THREE.Vector2(r, y)),
        32,
      ),
    [],
  );
  useEffect(() => () => shade.dispose(), [shade]);
  return (
    <group position={position}>
      <mesh geometry={shade}>
        <meshStandardMaterial color="#8a6a32" metalness={0.9} roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh position-y={0.04}>
        <sphereGeometry args={[0.045, 16, 12]} />
        <meshStandardMaterial color="#fff2d6" emissive="#ffcc80" emissiveIntensity={6} />
      </mesh>
      <mesh position-y={1.2}>
        <cylinderGeometry args={[0.004, 0.004, 2.1, 6]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      {light && <pointLight position-y={-0.05} intensity={2.2} distance={4} decay={2} color="#ffbf73" />}
    </group>
  );
}

function Chair({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position-y={0.46} castShadow>
        <boxGeometry args={[0.42, 0.05, 0.42]} />
        <meshStandardMaterial color="#4a1d18" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.82, -0.19]} castShadow>
        <boxGeometry args={[0.4, 0.5, 0.04]} />
        <meshStandardMaterial color="#2e1a12" roughness={0.5} />
      </mesh>
      {[-0.18, 0.18].flatMap((x) =>
        [-0.18, 0.18].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.22, z]}>
            <cylinderGeometry args={[0.016, 0.014, 0.44, 8]} />
            <meshStandardMaterial color="#2e1a12" roughness={0.5} />
          </mesh>
        )),
      )}
    </group>
  );
}

/**
 * The hall around the table: carpeted floor, wainscoted green walls, the
 * call board, sconces and other tables under their lamps, fading into the
 * warm haze (scene fog) so the machine stays the focus.
 */
export function Room() {
  const { carpet, wallpaper, panelWood } = useMemo(
    () => ({ carpet: carpetTexture([14, 14]), wallpaper: wallpaperTexture([14, 2]), panelWood: woodTexture([3, 1], 5) }),
    [],
  );
  useEffect(
    () => () => {
      carpet.dispose();
      wallpaper.dispose();
      panelWood.dispose();
    },
    [carpet, wallpaper, panelWood],
  );

  const wallHeight = 3.2;
  const panels = useMemo(() => Array.from({ length: 9 }, (_, i) => -3 + i * 0.78), []);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, FLOOR, -1]} receiveShadow>
        <planeGeometry args={[16, 14]} />
        <meshStandardMaterial map={carpet} roughness={0.95} />
      </mesh>

      {/* Back wall: wallpaper above, wooden wainscot with raised panels below. */}
      <mesh position={[0, FLOOR + WAINSCOT + (wallHeight - WAINSCOT) / 2, BACK_Z]}>
        <planeGeometry args={[16, wallHeight - WAINSCOT]} />
        <meshStandardMaterial map={wallpaper} roughness={0.85} />
      </mesh>
      <mesh position={[0, FLOOR + WAINSCOT / 2, BACK_Z + 0.02]}>
        <boxGeometry args={[16, WAINSCOT, 0.04]} />
        <meshStandardMaterial map={panelWood} roughness={0.5} color="#a07a64" />
      </mesh>
      <mesh position={[0, FLOOR + WAINSCOT + 0.03, BACK_Z + 0.05]}>
        <boxGeometry args={[16, 0.06, 0.06]} />
        <meshStandardMaterial map={panelWood} roughness={0.45} />
      </mesh>
      {panels.map((x) => (
        <mesh key={x} position={[x + 0.5, FLOOR + WAINSCOT / 2, BACK_Z + 0.05]}>
          <boxGeometry args={[0.6, WAINSCOT * 0.62, 0.02]} />
          <meshStandardMaterial map={panelWood} roughness={0.45} color="#c4a088" />
        </mesh>
      ))}

      {/* Side wall for a corner, so the hall has depth on the left. */}
      <mesh position={[SIDE_X, FLOOR + wallHeight / 2, -0.5]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[6, wallHeight]} />
        <meshStandardMaterial map={wallpaper} roughness={0.85} />
      </mesh>
      <mesh position={[SIDE_X + 0.02, FLOOR + WAINSCOT / 2, -0.5]} rotation-y={Math.PI / 2}>
        <boxGeometry args={[6, WAINSCOT, 0.04]} />
        <meshStandardMaterial map={panelWood} roughness={0.5} color="#a07a64" />
      </mesh>

      <CallBoard />

      {/* Wall sconces either side of the board. */}
      {[-0.9, 2.1].map((x) => (
        <group key={x} position={[x, FLOOR + 2.05, BACK_Z + 0.08]}>
          <mesh material={brass}>
            <cylinderGeometry args={[0.05, 0.07, 0.04, 16]} />
          </mesh>
          <mesh position-y={0.09}>
            <sphereGeometry args={[0.06, 16, 12]} />
            <meshStandardMaterial color="#fff2d6" emissive="#ffb866" emissiveIntensity={4} />
          </mesh>
        </group>
      ))}

      {/* Other tables in the hall, under their own lamps. */}
      <group position={[-1.9, 0, -1.7]} rotation-y={0.25}>
        <Table />
        <Chair position={[0, FLOOR, 0.85]} rotation={Math.PI} />
        <Chair position={[0.6, FLOOR, 0.85]} rotation={Math.PI} />
        <Chair position={[0.3, FLOOR, -0.75]} rotation={0} />
      </group>
      <group position={[2.3, 0, -1.9]} rotation-y={-0.2}>
        <Table />
        <Chair position={[-0.3, FLOOR, 0.85]} rotation={Math.PI} />
        <Chair position={[0.4, FLOOR, -0.75]} rotation={0} />
      </group>
      <Pendant position={[-1.8, 1.15, -1.6]} />
      <Pendant position={[2.35, 1.2, -1.85]} />
    </group>
  );
}

export { Pendant };
