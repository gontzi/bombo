import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useBingoStore } from '../state/store';
import { drama } from './cinematic';

const DUST = 420;

interface Props {
  /** Where the light comes from (the pendant's bulb) and where it lands. */
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** Half-angle of the beam, radians. */
  angle: number;
}

const beamVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  uniform float uLength;
  varying float vAlong;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - world.xyz);
    // 0 at the lamp, 1 on the table (the cylinder is centred on its own origin).
    vAlong = 0.5 - position.y / uLength;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const beamFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vAlong;
  void main() {
    // Brightest where we look through the most air: the middle of the cone, not its rim.
    float facing = pow(abs(dot(normalize(vNormal), normalize(vView))), 1.6);
    // Fades in below the shade and out before it reaches the felt.
    float along = smoothstep(0.0, 0.18, vAlong) * (1.0 - smoothstep(0.55, 1.0, vAlong));
    gl_FragColor = vec4(uColor * facing * along * uStrength, 1.0);
  }
`;

const dustVertex = /* glsl */ `
  uniform float uTime;
  uniform float uLength;
  uniform float uRadius;
  uniform float uPixelRatio;
  attribute vec3 seed;
  varying float vFade;
  void main() {
    // Each mote drifts down slowly and sways, wrapping round inside the cone.
    float h = fract(seed.z - uTime * 0.012);
    float a = seed.y * 6.2831 + sin(uTime * 0.17 + seed.x * 40.0) * 0.6;
    float r = sqrt(seed.x) * uRadius * h;
    vec3 local = vec3(cos(a) * r, -h * uLength, sin(a) * r);
    vec4 view = modelViewMatrix * vec4(local, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = (1.6 + 2.2 * fract(seed.x * 13.0)) * uPixelRatio * (3.0 / -view.z);
    // Only lit inside the beam: dim at its edge, at the shade and near the table.
    vFade = (1.0 - seed.x) * smoothstep(0.05, 0.2, h) * (1.0 - smoothstep(0.7, 1.0, h))
      * (0.6 + 0.4 * sin(uTime * 1.3 + seed.y * 30.0));
  }
`;

const dustFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying float vFade;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float soft = 1.0 - smoothstep(0.1, 0.5, d);
    gl_FragColor = vec4(uColor * soft * vFade * uStrength, 1.0);
  }
`;

/**
 * The pendant's light made visible: a soft cone of warm haze from the shade
 * to the table, with dust turning slowly in it. Both are additive and cheap;
 * the dust moves whenever the scene redraws (the pointer, a draw) and rests
 * when nothing else does, so it never keeps the frame loop busy on its own.
 * The beam strengthens while the house lights are down during a draw.
 */
export function LightShaft({ from, to, angle }: Props) {
  const reducedMotion = useReducedMotion();
  const length = from.distanceTo(to);
  const radius = Math.tan(angle) * length;

  const { beam, dust, orientation } = useMemo(() => {
    const beam = new THREE.ShaderMaterial({
      vertexShader: beamVertex,
      fragmentShader: beamFragment,
      uniforms: { uColor: { value: new THREE.Color('#ffc887') }, uStrength: { value: 0.085 }, uLength: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.ShaderMaterial({
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      uniforms: {
        uColor: { value: new THREE.Color('#ffdcaa') },
        uStrength: { value: 0.55 },
        uTime: { value: 0 },
        uLength: { value: 1 },
        uRadius: { value: 1 },
        uPixelRatio: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    // Point the local -Y axis from the lamp towards the table.
    const orientation = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, -1, 0),
      to.clone().sub(from).normalize(),
    );
    return { beam, dust, orientation };
  }, [from, to]);

  const seeds = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const seed = new Float32Array(DUST * 3);
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
    // Positions are computed in the shader; three still wants an attribute to size the draw.
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST * 3), 3));
    return g;
  }, []);

  useEffect(
    () => () => {
      beam.dispose();
      dust.dispose();
      seeds.dispose();
    },
    [beam, dust, seeds],
  );

  useFrame((state) => {
    const draw = useBingoStore.getState().draw;
    const d = draw && !draw.plan.reducedMotion ? drama(draw.plan.timeline, performance.now() - draw.startedAt) : 0;
    beam.uniforms.uStrength!.value = 0.085 + 0.08 * d;
    beam.uniforms.uLength!.value = length;
    dust.uniforms.uStrength!.value = 1.1 + 0.8 * d;
    dust.uniforms.uTime!.value = reducedMotion ? 0 : state.clock.elapsedTime;
    dust.uniforms.uLength!.value = length;
    dust.uniforms.uRadius!.value = radius;
    dust.uniforms.uPixelRatio!.value = state.gl.getPixelRatio();
  });

  return (
    <group position={from} quaternion={orientation}>
      {/* Open cone, apex at the lamp. */}
      <mesh position-y={-length / 2} material={beam} renderOrder={2} raycast={() => null}>
        <cylinderGeometry args={[0.05, radius, length, 48, 1, true]} />
      </mesh>
      <points geometry={seeds} material={dust} frustumCulled={false} renderOrder={3} raycast={() => null} />
    </group>
  );
}
