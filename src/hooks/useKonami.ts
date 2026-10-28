import { useEffect } from 'react';
import { playFanfare, unlockAudio } from '../audio/sounds';
import { KONAMI, PARTY_MS, useEggs } from '../state/eggs';
import { useBingoStore } from '../state/store';

/** Easter egg: the Konami code, typed anywhere, throws a party in the hall (state/eggs.ts). */
export function useKonami() {
  useEffect(() => {
    let at = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      // A third ↑ still leaves the first two counted.
      at = key === KONAMI[at] ? at + 1 : key === KONAMI[0] ? (at === 2 ? 2 : 1) : 0;
      if (at < KONAMI.length) return;
      at = 0;
      if (useBingoStore.getState().sound) {
        unlockAudio();
        playFanfare();
      }
      useEggs.setState({ partyUntil: performance.now() + PARTY_MS });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
