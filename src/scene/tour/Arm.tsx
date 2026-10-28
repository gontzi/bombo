import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { frameDelta } from '../CameraRig';
import { brass } from '../materials';
import { tourArm } from './armControl';

/**
 * Fingers of a right hand, palm down, in the hand's frame (+Z along the
 * fingers, +Y the back of the hand, +X the thumb's side): knuckle, phalanx
 * lengths and radius, and how far each joint bends (about X, downwards) when
 * pointing and when gripping. Metres and radians, life size like the table.
 */
const FINGERS = [
  { x: 0.027, z: 0.086, l: [0.044, 0.027, 0.022], r: 0.0092, point: [0.05, 0.08, 0.05], fist: [1.45, 1.5, 0.9], tip: true },
  { x: 0.008, z: 0.09, l: [0.048, 0.031, 0.024], r: 0.0095, point: [1.35, 1.55, 0.9], fist: [1.5, 1.55, 0.9] },
  { x: -0.011, z: 0.087, l: [0.045, 0.029, 0.023], r: 0.009, point: [1.4, 1.55, 0.9], fist: [1.55, 1.55, 0.9] },
  { x: -0.028, z: 0.079, l: [0.036, 0.022, 0.019], r: 0.008, point: [1.45, 1.55, 0.9], fist: [1.6, 1.55, 0.9] },
] as const;
const THUMB = { at: [0.034, -0.01, 0.024] as const, l: [0.038, 0.03, 0.026], r: 0.0112 };
/** Where a fist closes round the crank's handle, in the hand's frame. */
const GRIP = new THREE.Vector3(0, -0.024, 0.092);

type Joint = { group: THREE.Group; point: number; fist: number };

function materials() {
  const skin = new THREE.MeshPhysicalMaterial({
    color: '#d6a07f',
    roughness: 0.5,
    sheen: 0.45,
    sheenColor: new THREE.Color('#ffb59a'),
    sheenRoughness: 0.5,
  });
  const suit = new THREE.MeshPhysicalMaterial({
    color: '#121216',
    roughness: 0.82,
    sheen: 1,
    sheenColor: new THREE.Color('#4a4f5c'),
    sheenRoughness: 0.55,
  });
  const shirt = new THREE.MeshPhysicalMaterial({
    color: '#f3f1ea',
    roughness: 0.72,
    sheen: 0.6,
    sheenColor: new THREE.Color('#ffffff'),
  });
  const leather = new THREE.MeshStandardMaterial({ color: '#2b160b', roughness: 0.45, side: THREE.DoubleSide });
  const dial = new THREE.MeshStandardMaterial({ color: '#f4ead2', roughness: 0.35 });
  const ink = new THREE.MeshStandardMaterial({ color: '#16110c', roughness: 0.4 });
  const horn = new THREE.MeshStandardMaterial({ color: '#0b0b0d', roughness: 0.3 });
  return { skin, suit, shirt, leather, dial, ink, horn };
}

/** A cylinder along +Z from z0 to z1, squashed into the wrist's oval. */
function tube(r0: number, r1: number, z0: number, z1: number, open = false) {
  const g = new THREE.CylinderGeometry(r1, r0, z1 - z0, 32, 1, open);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, (z0 + z1) / 2);
  return g;
}

/** A phalanx: a capsule from its joint (origin) to the next, along +Z. */
function bone(length: number, radius: number) {
  const g = new THREE.CapsuleGeometry(radius, length, 6, 14);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, length / 2);
  return g;
}

/**
 * The demo's arm: a gentleman's right arm in a black suit, a white shirt cuff
 * with a gold cufflink and a gold watch on a leather strap, reaching in from
 * the viewer's side of the table to press what the guide is showing. It
 * points with its index or closes its fist round the crank's handle (tourArm),
 * moves on a spring, and casts its shadow on the felt like everything else.
 */
export function Arm() {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const reducedMotion = useReducedMotion();
  const root = useRef<THREE.Group>(null);

  const rig = useMemo(() => {
    const m = materials();
    const disposables: { dispose: () => void }[] = Object.values(m);
    const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
      disposables.push(geometry);
      const o = new THREE.Mesh(geometry, material);
      o.castShadow = true;
      o.receiveShadow = true;
      return o;
    };

    const arm = new THREE.Group();
    // Forearm: the suit sleeve with its hem and three buttons, the shirt cuff and cufflink, then the watch.
    const oval = (o: THREE.Object3D, x = 1.22, y = 0.86) => (o.scale.set(x, y, 1), o);
    // Long enough to always run out of the shot, whatever the camera.
    arm.add(oval(mesh(tube(0.056, 0.041, -2.4, -0.08), m.suit), 1.18, 0.95));
    const hem = mesh(new THREE.TorusGeometry(0.041, 0.0035, 8, 40), m.suit);
    hem.position.z = -0.081;
    arm.add(oval(hem, 1.18, 0.95));
    for (let i = 0; i < 3; i++) {
      const button = mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.003, 14), m.horn);
      button.rotation.z = Math.PI / 2;
      button.position.set(-0.049, -0.006, -0.11 - i * 0.017);
      arm.add(button);
    }
    arm.add(oval(mesh(tube(0.035, 0.034, -0.092, -0.05), m.shirt)));
    const link = mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.004, 18), brass);
    link.rotation.z = Math.PI / 2;
    link.position.set(0.044, 0.002, -0.068);
    arm.add(link);
    arm.add(oval(mesh(tube(0.028, 0.026, -0.06, 0.012), m.skin), 1.3, 0.8));
    const strap = mesh(tube(0.0285, 0.0285, -0.046, -0.028, true), m.leather);
    arm.add(oval(strap, 1.3, 0.82));
    const watch = new THREE.Group();
    watch.position.set(0, 0.024, -0.037);
    watch.add(mesh(new THREE.CylinderGeometry(0.0165, 0.0175, 0.007, 36), brass));
    const face = mesh(new THREE.CircleGeometry(0.014, 36), m.dial);
    face.rotation.x = -Math.PI / 2;
    face.position.y = 0.0036;
    watch.add(face);
    const bezel = mesh(new THREE.TorusGeometry(0.0152, 0.0013, 8, 36), brass);
    bezel.rotation.x = Math.PI / 2;
    bezel.position.y = 0.0036;
    watch.add(bezel);
    for (const [len, angle] of [
      [0.0085, 0.6],
      [0.012, 2.4],
    ] as const) {
      const hand = mesh(new THREE.BoxGeometry(0.0012, 0.0006, len), m.ink);
      hand.geometry.translate(0, 0, len / 2);
      hand.rotation.y = angle;
      hand.position.y = 0.0042;
      watch.add(hand);
    }
    const crown = mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.004, 12), brass);
    crown.rotation.z = Math.PI / 2;
    crown.position.set(0.0195, 0, 0);
    watch.add(crown);
    arm.add(watch);

    // The hand, bent a little down at the wrist.
    const hand = new THREE.Group();
    arm.add(hand);
    const palm = mesh(new RoundedBoxGeometry(0.084, 0.03, 0.094, 4, 0.013), m.skin);
    palm.position.set(0, -0.002, 0.044);
    hand.add(palm);

    const joints: Joint[] = [];
    const tip = new THREE.Object3D();
    const chain = (parent: THREE.Object3D, lengths: readonly number[], radius: number, point: readonly number[], fist: readonly number[]) => {
      let at = parent;
      lengths.forEach((l, i) => {
        const group = new THREE.Group();
        if (i > 0) group.position.z = lengths[i - 1]!;
        group.add(mesh(bone(l, radius * (1 - i * 0.08)), m.skin));
        at.add(group);
        joints.push({ group, point: point[i]!, fist: fist[i]! });
        at = group;
      });
      return at;
    };
    for (const f of FINGERS) {
      const knuckle = new THREE.Group();
      knuckle.position.set(f.x, 0.004, f.z);
      hand.add(knuckle);
      const end = chain(knuckle, f.l, f.r, f.point, f.fist);
      if ('tip' in f) {
        tip.position.z = f.l[2] + f.r * 0.8;
        end.add(tip);
      }
    }
    const thumb = new THREE.Group();
    thumb.position.set(...THUMB.at);
    thumb.rotation.set(0.45, -0.6, -0.5);
    hand.add(thumb);
    chain(thumb, THUMB.l, THUMB.r, [0.2, 0.3, 0.25], [0.55, 0.65, 0.5]);
    const grip = new THREE.Object3D();
    grip.position.copy(GRIP);
    hand.add(grip);

    arm.visible = false;
    return { arm, hand, thumb, joints, tip, grip, dispose: () => disposables.forEach((d) => d.dispose()) };
  }, []);

  useEffect(() => () => rig.dispose(), [rig]);

  const v = useMemo(
    () => ({
      shoulder: new THREE.Vector3(),
      d: new THREE.Vector3(),
      x: new THREE.Vector3(),
      y: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      basis: new THREE.Matrix4(),
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
    }),
    [],
  );
  /** The spring: how far short of its target the arm is, and how fast that is changing. */
  const motion = useRef({ gap: 0, speed: 0, fist: 0, out: true });

  useFrame((_, delta) => {
    const group = root.current;
    if (!group) return;
    const mo = motion.current;
    const { target } = tourArm;

    // The shoulder it reaches from, placed relative to the camera.
    const from = tourArm.from;
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    v.shoulder
      .setFromMatrixPosition(camera.matrixWorld)
      .add(v.a.set(e[0]!, e[1]!, e[2]!).multiplyScalar(from.right))
      .add(v.a.set(e[4]!, e[5]!, e[6]!).multiplyScalar(-from.down))
      .add(v.a.set(e[8]!, e[9]!, e[10]!).multiplyScalar(-from.forward));
    v.d.subVectors(target, v.shoulder);
    const reach = v.d.length();
    v.d.divideScalar(reach || 1);

    const goal = tourArm.gap ?? reach;
    if (mo.out) {
      if (tourArm.gap === null) {
        rig.arm.visible = false;
        return;
      }
      // Coming in: from the shoulder, at rest.
      Object.assign(mo, { gap: reach, speed: 0, out: false });
    }

    // Critically damped spring, in small steps so it stays steady at any frame rate.
    const dt = frameDelta(delta);
    if (reducedMotion) Object.assign(mo, { gap: goal, speed: 0 });
    else {
      const w = tourArm.stiffness;
      for (let t = 0; t < dt; t += 1 / 240) {
        const h = Math.min(1 / 240, dt - t);
        mo.speed += (w * w * (goal - mo.gap) - 2 * w * mo.speed) * h;
        mo.gap += mo.speed * h;
      }
    }
    mo.fist += (tourArm.fist - mo.fist) * (reducedMotion ? 1 : 1 - Math.exp(-dt * 9));
    if (tourArm.gap === null && mo.gap > reach - 0.03) {
      mo.out = true;
      rig.arm.visible = false;
      invalidate();
      return;
    }

    // Pose: each joint between pointing and gripping; the wrist bends down a touch more to point.
    for (const j of rig.joints) j.group.rotation.x = THREE.MathUtils.lerp(j.point, j.fist, mo.fist);
    rig.hand.rotation.x = THREE.MathUtils.lerp(0.24, 0.05, mo.fist);
    rig.thumb.rotation.y = THREE.MathUtils.lerp(-0.6, -0.95, mo.fist);

    // Oriented along the line from the shoulder, the back of the hand up.
    v.x.crossVectors(v.up, v.d).normalize();
    v.y.crossVectors(v.d, v.x);
    rig.arm.position.set(0, 0, 0);
    rig.arm.quaternion.setFromRotationMatrix(v.basis.makeBasis(v.x, v.y, v.d));
    rig.arm.updateMatrixWorld(true);
    // What touches the target: the fingertip, or the inside of the fist.
    const anchor = rig.tip.getWorldPosition(v.a).lerp(rig.grip.getWorldPosition(v.b), mo.fist);
    rig.arm.position.copy(target).sub(anchor).addScaledVector(v.d, -mo.gap);
    rig.arm.visible = true;

    if (Math.abs(goal - mo.gap) > 1e-4 || Math.abs(mo.speed) > 1e-4 || Math.abs(tourArm.fist - mo.fist) > 1e-3) invalidate();
  });

  return (
    <group ref={root}>
      <primitive object={rig.arm} />
    </group>
  );
}
