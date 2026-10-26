import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function getMedia(): MediaQueryList | null {
  return typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY) : null;
}

export function prefersReducedMotion(): boolean {
  return getMedia()?.matches ?? false;
}

function subscribe(onChange: () => void) {
  const media = getMedia();
  media?.addEventListener('change', onChange);
  return () => media?.removeEventListener('change', onChange);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
