import { useEffect } from 'react';
import { useWheelStore } from '../state/store';
import { requestSpin } from './useSpin';

const INTERACTIVE = 'input, textarea, select, button, a, [contenteditable="true"], [role="tab"]';

/** Space / Enter spin the wheel from anywhere that is not itself a control; Escape closes the result. */
export function useHotkeys() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target instanceof Element ? event.target : null;

      if (event.key === 'Escape') {
        if (useWheelStore.getState().lastResult) useWheelStore.getState().dismissResult();
        return;
      }
      if (event.key !== ' ' && event.key !== 'Enter') return;
      if (target?.closest(INTERACTIVE)) return;
      event.preventDefault();
      if (!event.repeat) requestSpin();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
