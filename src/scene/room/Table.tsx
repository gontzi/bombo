import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { LAYOUT } from '../bingo/layout';
import { feltTexture, woodTexture } from './textures';

const T = LAYOUT.table;

function roundedRectShape(w: number, d: number, r: number, hole?: { w: number; d: number; r: number }) {
  const shape = new THREE.Shape();
  const rr = (path: THREE.Path, width: number, depth: number, radius: number) => {
    const x = -width / 2;
    const y = -depth / 2;
    path.moveTo(x + radius, y);
    path.lineTo(x + width - radius, y);
    path.quadraticCurveTo(x + width, y, x + width, y + radius);
    path.lineTo(x + width, y + depth - radius);
    path.quadraticCurveTo(x + width, y + depth, x + width - radius, y + depth);
    path.lineTo(x + radius, y + depth);
    path.quadraticCurveTo(x, y + depth, x, y + depth - radius);
    path.lineTo(x, y + radius);
    path.quadraticCurveTo(x, y, x + radius, y);
  };
  rr(shape, w, d, r);
  if (hole) {
    const h = new THREE.Path();
    rr(h, hole.w, hole.d, hole.r);
    shape.holes.push(h);
  }
  return shape;
}

/**
 * Solid walnut card table: felt playing surface (y = 0) framed by a raised,
 * rounded wooden rail, a deep apron and four turned legs.
 */
export function Table() {
  const { wood, woodEnd, felt, rail, apron, legGeometry } = useMemo(() => {
    const woodMap = woodTexture([1.6, 1]);
    const woodEndMap = woodTexture([0.6, 1], 21);
    const feltMap = feltTexture([7, 4]);
    const wood = new THREE.MeshPhysicalMaterial({
      map: woodMap,
      roughness: 0.38,
      clearcoat: 0.55,
      clearcoatRoughness: 0.22,
    });
    const woodEnd = new THREE.MeshPhysicalMaterial({ map: woodEndMap, roughness: 0.45, clearcoat: 0.4 });
    const felt = new THREE.MeshStandardMaterial({ map: feltMap, roughness: 0.96 });

    const inner = { w: T.width - T.railWidth * 2, d: T.depth - T.railWidth * 2, r: 0.02 };
    const railShape = roundedRectShape(T.width, T.depth, 0.06, inner);
    const rail = new THREE.ExtrudeGeometry(railShape, {
      depth: T.railHeight + 0.03,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.012,
      bevelSegments: 4,
      curveSegments: 10,
    });
    // UVs from ExtrudeGeometry are in metres: scale them to the texture.
    const uv = rail.attributes.uv!;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / T.width, uv.getY(i) / T.depth);
    rail.rotateX(-Math.PI / 2);
    rail.translate(T.centerX, -0.03, T.centerZ);

    const apron = new THREE.BoxGeometry(T.width - 0.1, T.apronDepth, T.depth - 0.1);
    apron.translate(T.centerX, -0.03 - T.apronDepth / 2, T.centerZ);

    const profile = [
      [0.0, 0],
      [0.022, 0],
      [0.03, 0.02],
      [0.026, 0.06],
      [0.02, 0.32],
      [0.03, 0.4],
      [0.034, 0.44],
      [0.026, 0.48],
      [0.035, 0.62],
      [0.04, T.legHeight - 0.09],
      [0.0, T.legHeight - 0.09],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const legGeometry = new THREE.LatheGeometry(profile, 20);

    return { wood, woodEnd, felt, rail, apron, legGeometry, feltMap, woodMap, woodEndMap };
  }, []);

  useEffect(
    () => () => {
      for (const m of [wood, woodEnd, felt]) {
        m.map?.dispose();
        m.dispose();
      }
      rail.dispose();
      apron.dispose();
      legGeometry.dispose();
    },
    [wood, woodEnd, felt, rail, apron, legGeometry],
  );

  const legX = T.width / 2 - 0.14;
  const legZ = T.depth / 2 - 0.12;

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[T.centerX, 0, T.centerZ]} receiveShadow material={felt}>
        <planeGeometry args={[T.width - T.railWidth * 2 + 0.02, T.depth - T.railWidth * 2 + 0.02]} />
      </mesh>
      <mesh geometry={rail} material={wood} castShadow receiveShadow />
      <mesh geometry={apron} material={woodEnd} castShadow receiveShadow />
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`${sx}${sz}`}
            geometry={legGeometry}
            material={woodEnd}
            position={[T.centerX + sx * legX, LAYOUT.floorY, T.centerZ + sz * legZ]}
            castShadow
          />
        )),
      )}
    </group>
  );
}
