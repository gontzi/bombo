/**
 * Wheel measurements in scene units (1 = segment outer radius). Every
 * part derives its position from here so nothing intersects by accident.
 * Depth runs along +Z, towards the camera; the wheel's back sits at z = 0.
 */

export const SEGMENT_OUTER = 1;
export const SEGMENT_INNER = 0.21;
export const SEGMENT_GAP = 0.012;
export const SEGMENT_DEPTH = 0.07;
export const SEGMENT_BEVEL = 0.012;
/** Front face of the segments (extrusion depth plus bevel on both sides). */
export const SEGMENT_FRONT = SEGMENT_DEPTH + SEGMENT_BEVEL * 2;

export const LABEL_Z = SEGMENT_FRONT + 0.0015;
export const LABEL_INNER = 0.3;
export const LABEL_OUTER = 0.88;

export const BACKPLATE_DEPTH = 0.035;

export const RIM_INNER = SEGMENT_OUTER + 0.004;
export const RIM_OUTER = 1.1;
export const RIM_FRONT = SEGMENT_FRONT + 0.03;

export const PEG_RADIUS = (SEGMENT_OUTER + RIM_OUTER) / 2;
export const PEG_HEIGHT = 0.05;
/** Above this many segments the pegs would touch, so they are left out. */
export const MAX_PEGS = 72;

export const HUB_RADIUS = 0.18;

/** The pointer floats in front of the pegs so they can pass beneath its tip. */
export const POINTER_Z = RIM_FRONT + PEG_HEIGHT + 0.025;
export const POINTER_PIVOT_X = RIM_OUTER + 0.14;
export const POINTER_TIP_X = SEGMENT_OUTER - 0.07;

/** Underside of the Blender pedestal: the floor the whole object stands on. */
export const FLOOR_Y = -1.495;

/** Box the camera keeps in frame: wheel, pointer mast and pedestal (from the GLB bounds). */
export const FRAME_BOUNDS = {
  minX: -1.17,
  maxX: 1.51,
  minY: FLOOR_Y,
  maxY: RIM_OUTER,
  minZ: -0.41,
  maxZ: 0.37,
} as const;
