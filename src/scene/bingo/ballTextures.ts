import * as THREE from 'three';
import { ballStyle } from '../../theme/balls';

export const BALL_FONT = '"Barlow Condensed", "Arial Narrow", sans-serif';

/**
 * Paints one ball in equirectangular layout (as SphereGeometry maps its UVs):
 * the shell colour all round and two opposite white discs with the number,
 * like a real bingo ball. At the equator this projection is nearly
 * conformal, so the discs stay round on the sphere.
 */
export function paintBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  ball: number,
) {
  const style = ballStyle(ball);
  ctx.fillStyle = style.shell;
  ctx.fillRect(x, y, w, h);

  const discR = w * 0.12;
  const label = String(ball);
  const fontSize = discR * (label.length > 2 ? 1.05 : 1.3);
  for (const cx of [x + w * 0.25, x + w * 0.75]) {
    const cy = y + h / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, discR, 0, Math.PI * 2);
    ctx.fillStyle = '#fbf7ec';
    ctx.fill();
    ctx.lineWidth = Math.max(1, discR * 0.07);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.stroke();
    ctx.fillStyle = style.ink;
    ctx.font = `700 ${fontSize}px ${BALL_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + fontSize * 0.06);
    // Underline 6 and 9 so they read the right way up, as bingo balls do.
    if (label === '6' || label === '9') {
      ctx.fillRect(cx - fontSize * 0.2, cy + fontSize * 0.42, fontSize * 0.4, Math.max(1, fontSize * 0.07));
    }
  }
}

export const ATLAS_COLUMNS = 16;
const CELL_W = 128;
const CELL_H = 64;

/** One texture holding every ball, cell i = instance i. */
export class BallAtlas {
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  rows = 1;

  constructor() {
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  draw(balls: readonly number[]) {
    const rows = Math.max(1, Math.ceil(balls.length / ATLAS_COLUMNS));
    const width = ATLAS_COLUMNS * CELL_W;
    const height = rows * CELL_H;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      // A resized canvas needs a fresh GPU texture.
      this.texture.dispose();
    }
    this.rows = rows;
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, width, height);
    balls.forEach((ball, i) => {
      paintBall(ctx, (i % ATLAS_COLUMNS) * CELL_W, Math.floor(i / ATLAS_COLUMNS) * CELL_H, CELL_W, CELL_H, ball);
    });
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
  }
}

/** Glossy ball plastic; with an atlas, each instance reads its own cell via gl_InstanceID. */
export function createBallMaterial(atlas?: BallAtlas): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({
    roughness: 0.24,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    map: atlas?.texture ?? null,
  });
  if (atlas) {
    const uniforms = { uAtlasRows: { value: atlas.rows } };
    material.userData.atlasRows = uniforms.uAtlasRows;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uAtlasRows = uniforms.uAtlasRows;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uAtlasRows;')
        .replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
          #ifdef USE_INSTANCING
            float cellIndex = float(gl_InstanceID);
            vec2 cell = vec2(mod(cellIndex, ${ATLAS_COLUMNS.toFixed(1)}), uAtlasRows - 1.0 - floor(cellIndex / ${ATLAS_COLUMNS.toFixed(1)}));
            vMapUv = (cell + uv) / vec2(${ATLAS_COLUMNS.toFixed(1)}, uAtlasRows);
          #endif`,
        );
    };
  }
  return material;
}

/** Crisp single-ball texture for the ball that leaves the cage and sits in the tray. */
export function createHeroTexture(ball: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  paintBall(canvas.getContext('2d')!, 0, 0, 512, 256, ball);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
