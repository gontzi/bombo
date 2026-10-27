import { useEffect } from 'react';
import { duckMusic, startMusic, stopMusic } from '../audio/music';
import { useBingoStore } from '../state/store';

/**
 * Plays the background music while it's switched on. Browsers only let audio
 * start inside a user gesture, so the band waits for the first click or key
 * press. It fades out while the tab is hidden and backs off during a draw.
 */
export function useMusic() {
  const music = useBingoStore((s) => s.music);
  const drawing = useBingoStore((s) => s.draw !== null);

  useEffect(() => {
    if (!music) {
      stopMusic();
      return;
    }
    let unlocked = false;
    const play = () => {
      if (document.visibilityState === 'visible') startMusic();
    };
    const onGesture = () => {
      unlocked = true;
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      play();
    };
    const onVisibility = () => {
      if (!unlocked) return;
      if (document.visibilityState === 'visible') play();
      else stopMusic();
    };
    // Already unlocked by an earlier gesture (e.g. switching music back on).
    if (navigator.userActivation?.hasBeenActive) onGesture();
    else {
      window.addEventListener('pointerdown', onGesture);
      window.addEventListener('keydown', onGesture);
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [music]);

  useEffect(() => duckMusic(drawing), [drawing]);
}
