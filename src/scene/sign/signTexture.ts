import * as THREE from 'three';
import { ballLetter, ballStyle } from '../../theme/balls';
import { BALL_FONT } from '../bingo/ballTextures';

/** Face opening of the sign in metres (build_sign.py: W - 2·BAND by H - 2·BAND). */
export const FACE_ASPECT = 0.808 / 0.288;
const HEIGHT = 512;
const WIDTH = Math.round(HEIGHT * FACE_ASPECT);
const LABEL_FONT = '"Fraunces Variable", "Iowan Old Style", Georgia, serif';

export interface SignContent {
  ball: number;
  label: string;
  /** Said over the label instead of the ball's number. */
  kicker?: string;
}

/** Splits `text` into at most `maxLines` lines that fit `width`, or returns null. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] | null {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width) {
      line = next;
      continue;
    }
    if (!line || ctx.measureText(word).width > width) return null;
    lines.push(line);
    line = word;
  }
  lines.push(line);
  return lines.length <= maxLines ? lines : null;
}

/** Last resort for very long words or text: one line cut with an ellipsis. */
function truncate(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/**
 * The sign's enamel face: the ball on the left as a big painted roundel,
 * the bingo call in brass capitals and the winning option in cream serif,
 * as large as it fits on up to two lines.
 */
export function paintSign(canvas: HTMLCanvasElement, { ball, label, kicker }: SignContent) {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d')!;

  const bg = ctx.createRadialGradient(WIDTH * 0.45, HEIGHT * 0.4, 40, WIDTH * 0.5, HEIGHT * 0.5, WIDTH * 0.7);
  bg.addColorStop(0, '#6a1c15');
  bg.addColorStop(1, '#2c0906');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Ball roundel with a brass ring.
  const style = ballStyle(ball);
  const r = HEIGHT * 0.34;
  const cx = HEIGHT * 0.5;
  const cy = HEIGHT * 0.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 14, 0, Math.PI * 2);
  ctx.fillStyle = '#c9a04a';
  ctx.fill();
  const shell = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  shell.addColorStop(0, 'rgba(255,255,255,0.35)');
  shell.addColorStop(0.4, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = style.shell;
  ctx.fill();
  ctx.fillStyle = shell;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = '#fbf7ec';
  ctx.fill();
  ctx.fillStyle = style.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${r * 0.3}px ${BALL_FONT}`;
  ctx.fillText(ballLetter(ball), cx, cy - r * 0.3);
  const number = String(ball);
  ctx.font = `800 ${r * (number.length > 2 ? 0.52 : 0.68)}px ${BALL_FONT}`;
  ctx.fillText(number, cx, cy + r * 0.12);

  // Text column.
  const left = HEIGHT * 0.98;
  const right = WIDTH - 44;
  const width = right - left;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#e8c97c';
  ctx.font = `600 60px ${BALL_FONT}`;
  ctx.letterSpacing = '10px';
  ctx.fillText(kicker ?? `BOLA ${ballLetter(ball)}-${ball}`, left, 118);
  ctx.letterSpacing = '0px';
  ctx.fillRect(left, 140, width * 0.35, 4);

  let size = 210;
  let lines: string[] | null = null;
  for (; size >= 64; size -= 6) {
    ctx.font = `600 ${size}px ${LABEL_FONT}`;
    lines = wrap(ctx, label, width, 2);
    if (lines) break;
  }
  if (!lines) {
    size = 64;
    ctx.font = `600 ${size}px ${LABEL_FONT}`;
    lines = [truncate(ctx, label, width)];
  }
  const lineHeight = size * 1.05;
  const block = lineHeight * lines.length;
  let y = 160 + (HEIGHT - 160 - 30 - block) / 2 + size * 0.82;
  ctx.fillStyle = '#f6e9cb';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  for (const line of lines) {
    ctx.fillText(line, left, y);
    y += lineHeight;
  }
  ctx.shadowColor = 'transparent';
}

export function createSignTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  // glTF UVs run top-down, unlike three's own geometry.
  texture.flipY = false;
  return texture;
}

/** Loads the fonts the face uses; the canvas would otherwise silently fall back. */
export function signFontsReady(): Promise<unknown> {
  if (!document.fonts) return Promise.resolve();
  return Promise.all([
    document.fonts.load(`600 100px ${LABEL_FONT}`),
    document.fonts.load(`800 100px ${BALL_FONT}`),
    document.fonts.load(`600 50px ${BALL_FONT}`),
  ]).catch(() => undefined);
}
