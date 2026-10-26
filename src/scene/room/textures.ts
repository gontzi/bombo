import * as THREE from 'three';

/**
 * Procedural canvas textures for the hall: drawn at start-up, no image
 * downloads. A seeded generator keeps them identical on every visit.
 */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement, repeat: [number, number], color = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  return t;
}

/** Dark walnut: long wavy grain lines with occasional darker streaks. */
export function woodTexture(repeat: [number, number] = [1, 1], seed = 7): THREE.CanvasTexture {
  const [c, ctx] = canvas(1024, 256);
  const r = rng(seed);
  ctx.fillStyle = '#3b2116';
  ctx.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 150; i++) {
    const y0 = r() * 256;
    const amp = 2 + r() * 6;
    const freq = 0.004 + r() * 0.01;
    const phase = r() * 6.28;
    const dark = r() < 0.5;
    ctx.strokeStyle = dark ? `rgba(20,9,4,${0.12 + r() * 0.25})` : `rgba(120,72,40,${0.05 + r() * 0.12})`;
    ctx.lineWidth = 0.6 + r() * 2.2;
    ctx.beginPath();
    for (let x = 0; x <= 1024; x += 8) {
      const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1 + phase) * amp * 0.3;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return finish(c, repeat);
}

/** Baize: deep green with a fine fibre speckle. */
export function feltTexture(repeat: [number, number] = [6, 4]): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const r = rng(3);
  ctx.fillStyle = '#1d4634';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const light = r() < 0.5;
    ctx.fillStyle = light ? `rgba(90,140,105,${r() * 0.16})` : `rgba(5,20,12,${r() * 0.22})`;
    ctx.fillRect(r() * 256, r() * 256, 1 + r() * 1.5, 1);
  }
  return finish(c, repeat);
}

/** Hall carpet: deep burgundy with a small gold lattice, like old bingo halls. */
export function carpetTexture(repeat: [number, number] = [10, 10]): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const r = rng(11);
  ctx.fillStyle = '#3a1215';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(176,128,58,0.45)';
  ctx.lineWidth = 3;
  for (const [x, y] of [[128, 0], [0, 128], [256, 128], [128, 256]] as const) {
    ctx.beginPath();
    ctx.moveTo(x, y - 60);
    ctx.lineTo(x + 60, y);
    ctx.lineTo(x, y + 60);
    ctx.lineTo(x - 60, y);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(176,128,58,0.55)';
  for (const [x, y] of [[128, 128], [0, 0], [256, 0], [0, 256], [256, 256]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = `rgba(0,0,0,${r() * 0.18})`;
    ctx.fillRect(r() * 256, r() * 256, 1, 1);
  }
  return finish(c, repeat);
}

/** Bottle-green wallpaper with a soft vertical stripe. */
export function wallpaperTexture(repeat: [number, number] = [8, 2]): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 256);
  ctx.fillStyle = '#18302a';
  ctx.fillRect(0, 0, 128, 256);
  ctx.fillStyle = 'rgba(210,180,110,0.08)';
  ctx.fillRect(56, 0, 16, 256);
  ctx.fillStyle = 'rgba(210,180,110,0.12)';
  ctx.fillRect(62, 0, 4, 256);
  for (let y = 16; y < 256; y += 32) {
    ctx.beginPath();
    ctx.ellipse(20, y, 5, 9, 0, 0, Math.PI * 2);
    ctx.ellipse(108, y + 16, 5, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c, repeat);
}
