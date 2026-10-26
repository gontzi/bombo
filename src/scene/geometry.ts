import * as THREE from 'three';
import { TAU, segmentSize } from '../domain/wheelMath';
import {
  SEGMENT_BEVEL,
  SEGMENT_DEPTH,
  SEGMENT_FRONT,
  SEGMENT_GAP,
  SEGMENT_INNER,
  SEGMENT_OUTER,
} from './dimensions';

/** Points along an arc up to its end; `skipFirst` when the path already sits on its start. */
function arc(path: THREE.Shape, radius: number, from: number, to: number, steps: number, skipFirst = false) {
  for (let k = skipFirst ? 1 : 0; k <= steps; k++) {
    const a = from + ((to - from) * k) / steps;
    path.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
  }
}

/**
 * One bevelled segment spanning local angles [0, 2π/n]. Its straight edges
 * are offset inwards so neighbours leave an even groove, and the offset
 * shrinks for very thin segments so the shape never inverts near the hub.
 */
export function createSegmentGeometry(n: number): THREE.BufferGeometry {
  const s = segmentSize(n);
  let bevel = SEGMENT_BEVEL;
  let shape: THREE.Shape;

  if (n === 1) {
    shape = new THREE.Shape();
    shape.absarc(0, 0, SEGMENT_OUTER - bevel, 0, TAU, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, SEGMENT_INNER + bevel, 0, TAU, true);
    shape.holes.push(hole);
  } else {
    const maxInset = (SEGMENT_INNER + bevel) * Math.sin(s * 0.35);
    const inset = Math.min(SEGMENT_GAP / 2 + bevel, maxInset);
    bevel = Math.max(0, Math.min(bevel, inset - SEGMENT_GAP / 4));

    const outer = SEGMENT_OUTER - bevel;
    const inner = SEGMENT_INNER + bevel;
    const outerOffset = Math.asin(inset / outer);
    const innerOffset = Math.asin(inset / inner);
    const steps = Math.max(2, Math.ceil((s / TAU) * 180));

    shape = new THREE.Shape();
    shape.moveTo(Math.cos(outerOffset) * outer, Math.sin(outerOffset) * outer);
    arc(shape, outer, outerOffset, s - outerOffset, steps, true);
    arc(shape, inner, s - innerOffset, innerOffset, Math.max(1, Math.ceil(steps / 3)));
    shape.closePath();
  }

  const bevelEnabled = bevel > 0.0005;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: bevelEnabled ? SEGMENT_DEPTH : SEGMENT_FRONT,
    bevelEnabled,
    bevelThickness: SEGMENT_BEVEL,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: n === 1 ? 160 : 1,
  });
  if (bevelEnabled) geometry.translate(0, 0, SEGMENT_BEVEL);
  return geometry;
}

/** Flat ring extruded along +Z, used for the rim. */
export function createRingGeometry(inner: number, outer: number, depth: number, bevel: number) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer - bevel, 0, TAU, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, inner + bevel, 0, TAU, true);
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 160,
  });
  geometry.translate(0, 0, bevel);
  return geometry;
}

/** Lathe around the Z axis from a (radius, z) profile listed from the front inwards. */
export function createLatheZ(profile: Array<[number, number]>, segments = 64) {
  // LatheGeometry faces outwards when the profile runs bottom to top.
  const points = profile.map(([r, z]) => new THREE.Vector2(r, z)).reverse();
  const geometry = new THREE.LatheGeometry(points, segments);
  // LatheGeometry spins around +Y; turn it so the profile's height runs along +Z.
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/**
 * Pointer outline in its own frame: pivot at the origin, tip at (-length, 0).
 */
export function createPointerGeometry(length: number, width: number, depth: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-length, 0);
  shape.quadraticCurveTo(-length * 0.45, width * 0.55, 0, width);
  shape.absarc(0, 0, width, Math.PI / 2, -Math.PI / 2, true);
  shape.quadraticCurveTo(-length * 0.45, -width * 0.55, -length, 0);
  const bevel = 0.012;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 4,
    curveSegments: 32,
  });
  geometry.translate(0, 0, bevel);
  return geometry;
}
