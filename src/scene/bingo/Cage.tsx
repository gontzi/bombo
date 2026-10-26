import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { brass } from '../materials';
import { CAGE_RADIUS, LAYOUT } from './layout';

const C = LAYOUT.cage;
/** Where the meridians meet the pole rings (exactly on the sphere). */
const POLE_X = Math.sqrt(CAGE_RADIUS ** 2 - C.poleRingRadius ** 2);

/**
 * The rotating wire drum, built in code so it can turn freely: latitude
 * rings, meridian wires (instanced) between two pole rings, and short spokes
 * that tie the drum to the axle on the left and to the collar around the
 * fixed exit tube on the right. Local origin = cage centre; turns about X.
 */
export const Cage = forwardRef<THREE.Group>(function Cage(_, ref) {
  const meridianRef = useRef<THREE.InstancedMesh>(null);

  const geo = useMemo(() => {
    const R = CAGE_RADIUS;
    const w = C.wireRadius;
    const rings = C.latitudes.map((x) => {
      const r = Math.sqrt(R * R - x * x);
      const g = new THREE.TorusGeometry(r, w, 8, 112);
      g.rotateY(Math.PI / 2);
      g.translate(x, 0, 0);
      return g;
    });
    const pole = (x: number) => {
      const g = new THREE.TorusGeometry(C.poleRingRadius, w * 1.6, 8, 48);
      g.rotateY(Math.PI / 2);
      g.translate(x, 0, 0);
      return g;
    };
    const theta0 = Math.asin(C.poleRingRadius / R);
    const points: THREE.Vector3[] = [];
    for (let k = 0; k <= 40; k++) {
      const th = theta0 + ((Math.PI - 2 * theta0) * k) / 40;
      points.push(new THREE.Vector3(R * Math.cos(th), R * Math.sin(th), 0));
    }
    const meridian = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, w, 6, false);

    // Spokes from each pole ring in to the hub (axle on the left, collar on the right).
    const spokes: THREE.BufferGeometry[] = [];
    for (const [x, inner] of [
      [-POLE_X, LAYOUT.axle.radius],
      [POLE_X, LAYOUT.chute.tubeInnerRadius + 0.016],
    ] as const) {
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + Math.PI / 4;
        const len = C.poleRingRadius - inner;
        const g = new THREE.CylinderGeometry(w * 1.4, w * 1.4, len, 6);
        g.translate(0, inner + len / 2, 0);
        g.rotateX(a);
        g.translate(x, 0, 0);
        spokes.push(g);
      }
    }
    const hubLeft = new THREE.CylinderGeometry(0.024, 0.024, 0.03, 20);
    hubLeft.rotateZ(Math.PI / 2);
    hubLeft.translate(-POLE_X, 0, 0);
    const collar = new THREE.CylinderGeometry(LAYOUT.chute.tubeInnerRadius + 0.018, LAYOUT.chute.tubeInnerRadius + 0.018, 0.022, 32, 1, true);
    collar.rotateZ(Math.PI / 2);
    collar.translate(POLE_X, 0, 0);

    return { rings, poles: [pole(-POLE_X), pole(POLE_X)], meridian, spokes, hubLeft, collar };
  }, []);

  useEffect(
    () => () => {
      for (const g of [...geo.rings, ...geo.poles, ...geo.spokes, geo.meridian, geo.hubLeft, geo.collar]) g.dispose();
    },
    [geo],
  );

  useLayoutEffect(() => {
    const mesh = meridianRef.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < C.meridians; i++) {
      m.makeRotationX((i / C.meridians) * Math.PI * 2);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, []);

  return (
    <group ref={ref}>
      {geo.rings.map((g, i) => (
        <mesh key={i} geometry={g} material={brass} castShadow />
      ))}
      {geo.poles.map((g, i) => (
        <mesh key={i} geometry={g} material={brass} castShadow />
      ))}
      <instancedMesh ref={meridianRef} args={[geo.meridian, brass, C.meridians]} castShadow />
      {geo.spokes.map((g, i) => (
        <mesh key={i} geometry={g} material={brass} castShadow />
      ))}
      <mesh geometry={geo.hubLeft} material={brass} />
      <mesh geometry={geo.collar} material={brass} />
    </group>
  );
});
