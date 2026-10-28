import * as THREE from 'three';

/** The plate's face, metres (its aspect sets the canvas). */
export const PLATE_W = 0.2;
export const PLATE_H = 0.05;
const H = 200;
const W = Math.round((H * PLATE_W) / PLATE_H);
const FONT = '"Fraunces Variable", "Iowan Old Style", Georgia, serif';
const SIGN_FONT = '"Barlow Condensed", "Arial Narrow", sans-serif';

export interface PlateContent {
  text: string;
  caret: boolean;
  /** Balls in the rack and cups in all, for the small count in the corner. */
  count: number;
  slots: number;
}

/**
 * The brass plate in front of the ball rack, engraved with whatever is being
 * typed: deep-cut letters filled with black enamel on a white map the brass
 * material tints, as on the push button's plate. Empty, it shows what to do
 * in lighter, shallower lettering. Long text shrinks, then keeps its end in view.
 */
export function paintPlate(canvas: HTMLCanvasElement, { text, caret, count, slots }: PlateContent) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(40,24,8,0.6)';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, W - 20, H - 20);
  ctx.lineWidth = 2;
  ctx.strokeRect(22, 22, W - 44, H - 44);

  // The count, stamped small in the top right corner.
  ctx.font = `700 30px ${SIGN_FONT}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(28,16,6,0.7)';
  ctx.fillText(`${count}/${slots}`, W - 38, 30);

  const left = 44;
  const width = W - left - 120;
  const baseline = H * 0.66;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (!text) {
    ctx.font = `italic 500 76px ${FONT}`;
    ctx.fillStyle = 'rgba(28,16,6,0.38)';
    ctx.fillText('Escribe una opción…', left, baseline);
    if (caret) ctx.fillRect(left - 10, baseline - 72, 5, 90);
    return;
  }

  let size = 104;
  ctx.font = `600 ${size}px ${FONT}`;
  while (size > 46 && ctx.measureText(text).width > width) {
    size -= 4;
    ctx.font = `600 ${size}px ${FONT}`;
  }
  // Still too long: show the end, where the typing is.
  let shown = text;
  while (shown.length > 1 && ctx.measureText(`…${shown}`).width > width) shown = shown.slice(1);
  if (shown !== text) shown = `…${shown}`;
  // The cut catches light on its lower edge.
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(shown, left, baseline + 3);
  ctx.fillStyle = '#1c1006';
  ctx.fillText(shown, left, baseline);
  if (caret) {
    const x = left + ctx.measureText(shown).width + 8;
    ctx.fillRect(x, baseline - size * 0.78, 5, size * 0.95);
  }
}

export function createPlateTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
