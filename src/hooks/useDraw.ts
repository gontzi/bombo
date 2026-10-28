import { useCallback } from 'react';
import { unlockAudio } from '../audio/sounds';
import { useCrank } from '../state/crank';
import { useRack } from '../state/rack';
import { selectIsDrawing, useBingoStore } from '../state/store';
import { prefersReducedMotion } from './useReducedMotion';

const MOBILE_QUERY = '(max-width: 860px)';

/** Starts a draw from any control (button, hotkey, or letting go of the crank after turning it: `hand`). */
export function requestDraw({ hand = false } = {}): boolean {
  const { startDraw, sound } = useBingoStore.getState();
  const reducedMotion = prefersReducedMotion();
  // Unlock audio inside the user's gesture, before anything plays.
  if (sound) unlockAudio();
  // Balls still flying in from the rack: let them land first.
  if (useRack.getState().tipping) return false;
  if (!startDraw({ reducedMotion, hand })) return false;
  // The draw takes the cage (and the camera) back from the hand.
  useCrank.getState().setActive(false);
  useRack.getState().setOpen(false);

  // On phones the list can be scrolled far below the machine: bring it back.
  const stage = document.getElementById('stage');
  if (stage && window.matchMedia(MOBILE_QUERY).matches && stage.getBoundingClientRect().top < -40) {
    stage.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  }
  return true;
}

export function useDraw() {
  const isDrawing = useBingoStore(selectIsDrawing);
  const canDraw = useBingoStore((s) => s.entries.length > 0 && s.draw === null);
  const draw = useCallback(() => requestDraw(), []);
  return { isDrawing, canDraw, draw };
}
