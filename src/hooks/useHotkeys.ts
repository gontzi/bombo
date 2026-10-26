import { useEffect } from 'react';
import { useBingoStore } from '../state/store';
import { requestDraw } from './useDraw';

const INTERACTIVE = 'input, textarea, select, button, a, [contenteditable="true"], [role="tab"]';

/** Space / Enter draw a ball from anywhere that is not itself a control; Escape closes the result. */
export function useHotkeys() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target instanceof Element ? event.target : null;

      if (event.key === 'Escape') {
        if (useBingoStore.getState().lastResult) useBingoStore.getState().dismissResult();
        return;
      }
      if (event.key !== ' ' && event.key !== 'Enter') return;
      if (target?.closest(INTERACTIVE)) return;
      event.preventDefault();
      if (!event.repeat) requestDraw();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
