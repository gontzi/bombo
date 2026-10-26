import { useCallback } from 'react';
import { unlockAudio } from '../audio/tick';
import { selectIsSpinning, useWheelStore } from '../state/store';
import { prefersReducedMotion } from './useReducedMotion';

const MOBILE_QUERY = '(max-width: 860px)';

/** Starts a spin from any control (button, hotkey, clicking the hub). */
export function requestSpin(): boolean {
  const { startSpin, sound } = useWheelStore.getState();
  const reducedMotion = prefersReducedMotion();
  const started = startSpin({ reducedMotion });
  if (!started) return false;
  if (sound) unlockAudio();

  // On phones the list can be scrolled far below the wheel: bring it back.
  const stage = document.getElementById('stage');
  if (stage && window.matchMedia(MOBILE_QUERY).matches && stage.getBoundingClientRect().top < -40) {
    stage.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  }
  return true;
}

export function useSpin() {
  const isSpinning = useWheelStore(selectIsSpinning);
  const canSpin = useWheelStore((s) => s.entries.length > 0 && s.spin === null);
  const spin = useCallback(() => requestSpin(), []);
  return { isSpinning, canSpin, spin };
}
