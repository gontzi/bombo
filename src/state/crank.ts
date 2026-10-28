import { create } from 'zustand';

/** Full turns of the crank that mix the balls enough to let one out when the handle is let go. */
export const TURNS_TO_DRAW = 2;

/**
 * Turning the cage by hand, as another way to draw: grabbing the crank swings
 * the camera round to it, and once it has been turned `TURNS_TO_DRAW` times,
 * letting go lets a ball out. `active` drives the camera and the DOM hint,
 * `progress` (0–1, in eighths, so it re-renders little) the hint's count;
 * the drag itself goes through `crankDrive`, read every frame by the machine.
 */
export const useCrank = create<{
  active: boolean;
  progress: number;
  /** Turned far too fast for far too long: the bearing smokes (scene/bingo/CrankSmoke.tsx). */
  smoking: boolean;
  setActive: (on: boolean) => void;
  setProgress: (p: number) => void;
}>((set) => ({
  active: false,
  progress: 0,
  smoking: false,
  setActive: (on) => {
    if (!on) {
      crankDrive.dragging = false;
      crankDrive.total = 0;
    }
    set({ active: on, progress: 0 });
  },
  setProgress: (p) => set({ progress: p }),
}));

export const crankDrive = {
  /** A finger or the mouse is holding the handle. */
  dragging: false,
  /** Radians turned by hand since the machine last looked (around +X, like the cage). */
  turned: 0,
  /** Radians turned by hand (either way) since the crank was taken, towards a draw. */
  total: 0,
  /** Where the crank (and the cage) stands, radians about +X: written by the machine every frame. */
  angle: 0,
  /** How fast the cage is turning, rad/s: written by the machine every frame. */
  spin: 0,
  /** Takes what has been turned since the last call. */
  take(): number {
    const t = this.turned;
    this.turned = 0;
    return t;
  },
};
