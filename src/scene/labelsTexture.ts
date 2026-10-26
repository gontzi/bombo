import * as THREE from 'three';
import { segmentCenter, segmentSize } from '../domain/wheelMath';
import { segmentColor } from '../theme/palette';
import { LABEL_INNER, LABEL_OUTER, SEGMENT_OUTER } from './dimensions';

export const LABEL_FONT_FAMILY = '"Fraunces Variable", Georgia, serif';
const FONT_WEIGHT = 620;
const MAX_FONT = 0.12;
const MIN_FONT = 0.032;

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, mid).trimEnd()}…`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo).trimEnd()}…`;
}

/**
 * Draws every label onto one transparent texture that covers the wheel face
 * (disc of radius SEGMENT_OUTER). Text runs along each segment's centre line
 * and ends near the rim, so the winner reads left-to-right beside the pointer.
 */
export function drawLabels(canvas: HTMLCanvasElement, labels: readonly string[]): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const size = canvas.width;
  const k = size / (2 * SEGMENT_OUTER);
  ctx.clearRect(0, 0, size, size);

  const n = labels.length;
  if (n === 0) return;

  const s = segmentSize(n);
  const available = (LABEL_OUTER - LABEL_INNER) * k;
  // Chord height at the inner end of the text bounds the font size for thin segments.
  const chord = n === 1 ? Infinity : 2 * (LABEL_INNER + 0.12) * Math.sin(s / 2);
  const baseFont = Math.min(MAX_FONT, chord * 0.62);

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  labels.forEach((label, i) => {
    let font = baseFont;
    ctx.font = `${FONT_WEIGHT} ${font * k}px ${LABEL_FONT_FAMILY}`;
    const width = ctx.measureText(label).width;
    if (width > available) {
      font = Math.max(MIN_FONT, font * (available / width));
      ctx.font = `${FONT_WEIGHT} ${font * k}px ${LABEL_FONT_FAMILY}`;
    }
    const text = fitText(ctx, label, available);

    ctx.save();
    ctx.translate(size / 2, size / 2);
    // Canvas y grows downwards, so a counter-clockwise local angle is a negative canvas rotation.
    ctx.rotate(-segmentCenter(i, n));
    ctx.fillStyle = segmentColor(i, n).label;
    ctx.fillText(text, LABEL_OUTER * k, font * k * 0.04);
    ctx.restore();
  });
}

export function createLabelsTexture(size: number): { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return { canvas, texture };
}
