import { useEffect } from 'react';
import { useCrank } from '../state/crank';
import { useRack } from '../state/rack';
import { useBingoStore } from '../state/store';
import { requestDraw } from './useDraw';

const INTERACTIVE = 'input, textarea, select, button, a, [contenteditable="true"], [role="tab"]';

/** Space / Enter draw a ball from anywhere that is not itself a control; Escape lets go of the crank, or closes the result. */
export function useHotkeys() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target instanceof Element ? event.target : null;

      if (event.key === 'Escape') {
        if (useRack.getState().open && (!useRack.getState().tipping || useRack.getState().auto)) useRack.getState().setOpen(false);
        else if (useCrank.getState().active) useCrank.getState().setActive(false);
        else if (useBingoStore.getState().lastResult) useBingoStore.getState().dismissResult();
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
