import * as THREE from 'three';
import type { TourStepId } from '../../state/tour';
import { CAGE_CENTER, LAYOUT, TRAY_CENTER } from '../bingo/layout';
import { RACK, RACK_BUTTON, RACK_FOCUS, RACK_MATRIX } from '../rack/layout';

/** Where the tent card that replays the guide stands on the felt: in front of the rack, right of the tray. */
export const GUIDE_CARD_POSITION = new THREE.Vector3(0.6, 0, 0.42);
/** Turned to face the usual three-quarter camera. */
export const GUIDE_CARD_YAW = 0.6;

/**
 * Camera for a step: the idle or result framing, or a close-up on `target`
 * from `azimuth`/`elevation` (radians, as in CameraRig) at `distance` times
 * the distance that frames the whole machine.
 */
export type TourView = 'idle' | 'result' | { target: THREE.Vector3; azimuth: number; elevation: number; distance: number };

export interface TourStop {
  /** What the spotlight rings, in world space (none: the card sits in the middle of the hall). */
  anchor: THREE.Vector3 | null;
  /** The ring's radius around it, metres. */
  radius: number;
  view: TourView;
}

export const PLATE = new THREE.Vector3(-0.065, 0.035, 0.18).applyMatrix4(RACK_MATRIX);
export const RED_BUTTON = new THREE.Vector3(LAYOUT.button.center[0], 0.075, LAYOUT.button.center[2]);
export const GREEN_BUTTON = RACK_BUTTON.clone().setY(0.03);
const CRANK_HUB = new THREE.Vector3(LAYOUT.crank.x - 0.02, CAGE_CENTER.y, CAGE_CENTER.z);
/** The spotlight on the tray, for the result of a draw. */
export const TRAY_STOP = { anchor: TRAY_CENTER.clone().setY(0.03), radius: 0.09 };

/** The crank's walnut handle in world space, with the crank at `angle` (build_bingo.py: build_crank). */
export function crankHandle(angle: number, out = new THREE.Vector3()): THREE.Vector3 {
  const arm = LAYOUT.crank.armLength;
  return out.set(LAYOUT.crank.x - 0.06, -arm * Math.cos(angle), -arm * Math.sin(angle)).add(CAGE_CENTER);
}

export const TOUR_STOPS: Record<TourStepId, TourStop> = {
  welcome: { anchor: null, radius: 0, view: 'idle' },
  rack: {
    anchor: RACK_FOCUS,
    radius: 0.19,
    view: { target: RACK_FOCUS, azimuth: RACK.yaw + 0.2, elevation: 0.7, distance: 0.55 },
  },
  plate: {
    anchor: PLATE,
    radius: 0.075,
    view: { target: PLATE, azimuth: RACK.yaw + 0.12, elevation: 0.62, distance: 0.38 },
  },
  tip: {
    anchor: GREEN_BUTTON,
    radius: 0.045,
    view: { target: RACK_FOCUS.clone().lerp(RACK_BUTTON, 0.5), azimuth: RACK.yaw + 0.3, elevation: 0.62, distance: 0.42 },
  },
  draw: {
    anchor: RED_BUTTON,
    radius: 0.07,
    view: { target: RED_BUTTON.clone().setY(0.05), azimuth: 0.45, elevation: 0.5, distance: 0.45 },
  },
  crank: {
    anchor: CRANK_HUB,
    radius: LAYOUT.crank.armLength + 0.03,
    view: { target: CRANK_HUB.clone().add(new THREE.Vector3(0.08, -0.04, 0.02)), azimuth: -1.2, elevation: 0.22, distance: 0.62 },
  },
  tray: { ...TRAY_STOP, view: 'result' },
  replay: {
    anchor: GUIDE_CARD_POSITION.clone().setY(0.03),
    radius: 0.065,
    view: { target: GUIDE_CARD_POSITION.clone().setY(0.03), azimuth: 0.62, elevation: 0.5, distance: 0.42 },
  },
};
