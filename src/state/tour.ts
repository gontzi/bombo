import { create } from 'zustand';
import { useCrank } from './crank';
import { useRack } from './rack';
import { sanitizePersisted, useBingoStore, type BingoState } from './store';

/** The guide's overlay, which the scene keeps told where its spotlight falls (scene/tour/TourTracker.tsx). */
export const TOUR_OVERLAY_ID = 'tour';

/** Set once the guide has been seen through or skipped, so it only opens by itself on a first visit. */
const SEEN_KEY = 'bombo:guide-seen';
/** The options and history from before the guide's demo, kept in case the page closes mid-guide. */
const RESTORE_KEY = 'bombo:guide-restore';

/** What the demo writes into the plate, one ball each. */
export const DEMO_LABELS = ['Pizza', 'Sushi', 'Tacos', 'Paella'] as const;

/**
 * The guided tour of the hall: each step flies the camera to one part of the
 * table (scene/tour/stops.ts), spotlights it with a card that says what it is
 * for (ui/Tour.tsx) and shows it working (scene/tour/TourDirector.tsx): an arm
 * taps options out on the plate, presses the buttons and turns the crank, and
 * the guide moves on by itself.
 * The tent card on the table (scene/tour/GuideCard.tsx) plays it again.
 */
export const TOUR_STEPS = [
  {
    id: 'welcome',
    title: 'Bienvenido a la sala',
    body: 'Aquí cualquier decisión se sortea con un bombo de bingo. No toques nada: mira cómo se hace, vamos a sortear qué se cena hoy.',
  },
  {
    id: 'rack',
    title: 'El portabolas',
    body: 'Las opciones empiezan aquí. Al tocarlo, la cámara se acerca para que las escribas.',
  },
  {
    id: 'plate',
    title: 'La placa de latón',
    body: 'Lo que escribes se graba en la placa y, con Intro, cae como bola numerada a una cazoleta. Si pegas una lista, cae una bola por línea; toca una bola para quitarla.',
  },
  {
    id: 'tip',
    title: 'El botón verde',
    body: 'Echa al bombo todas las bolas que esperan en el portabolas.',
  },
  {
    id: 'draw',
    title: 'El botón rojo',
    body: 'Gira el bombo y saca una bola al azar. Con teclado, también la barra espaciadora.',
  },
  {
    id: 'tray',
    title: 'La ganadora',
    body: 'Baja por el conducto hasta la bandeja y el cartel la canta desde el techo. Tócala en la bandeja para quitarla del bombo.',
  },
  {
    id: 'crank',
    title: 'O a mano, con la manivela',
    body: 'Agárrala, dale dos vueltas al bombo y suéltala: sale bola.',
  },
  {
    id: 'replay',
    title: '¿Se te olvida?',
    body: 'Este cartelito de la mesa repite la guía cuando quieras. Ahora recojo las bolas del ejemplo y la sala es tuya.',
  },
] as const;

export type TourStepId = (typeof TOUR_STEPS)[number]['id'];

export const useTour = create<{
  step: number | null;
  /** The demo has just drawn a ball by hand: the camera and the spotlight go to the tray. */
  showResult: boolean;
  /** The overlay is on screen, opening, open or fading out (the hall's own hints wait for it). */
  overlay: boolean;
}>(() => ({ step: null, showResult: false, overlay: false }));

type Saved = Pick<BingoState, 'entries' | 'history' | 'pending'>;
let saved: Saved | null = null;

const storage = {
  get: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable: keep working in memory */
    }
  },
  remove: (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

// The page closed mid-guide: put back what was there before its demo.
{
  const raw = storage.get(RESTORE_KEY);
  if (raw) {
    storage.remove(RESTORE_KEY);
    try {
      const restored = sanitizePersisted(JSON.parse(raw));
      useBingoStore.setState({ entries: restored.entries ?? [], history: restored.history ?? [] });
    } catch {
      /* unreadable: leave things as they are */
    }
  }
}

export const tourSeen = () => storage.get(SEEN_KEY) !== null;

/** Opens the guide at its first step, putting down whatever was in hand. Not while a ball is being drawn. */
export function startTour(): boolean {
  const { draw, entries, history, pending } = useBingoStore.getState();
  if (draw || useRack.getState().tipping || useTour.getState().step !== null) return false;
  useRack.getState().setOpen(false);
  useCrank.getState().setActive(false);
  saved ??= { entries, history, pending };
  storage.set(RESTORE_KEY, JSON.stringify({ entries, history }));
  useTour.setState({ step: 0, showResult: false });
  return true;
}

export function goToStep(step: number) {
  if (useTour.getState().step === null) return;
  useTour.setState({ step: Math.max(0, Math.min(TOUR_STEPS.length - 1, step)), showResult: false });
}

/** Next step, or the end of the guide after the last one. */
export function nextStep() {
  const { step } = useTour.getState();
  if (step === null) return;
  if (step >= TOUR_STEPS.length - 1) endTour();
  else goToStep(step + 1);
}

/** Closes the guide (its overlay then puts the demo away). */
export function endTour() {
  if (useTour.getState().step === null) return;
  storage.set(SEEN_KEY, '1');
  useCrank.getState().setActive(false);
  useRack.getState().setDraft('');
  useTour.setState({ step: null, showResult: false });
}

/** Nothing is moving: no ball being drawn, none flying from the rack into the cage. */
export const demoSettled = () => !useBingoStore.getState().draw && !useRack.getState().tipping;

/** Whether the demo left anything behind to put away. */
export function demoChanged(): boolean {
  const { entries, history, pending, lastResult } = useBingoStore.getState();
  return !!saved && (entries !== saved.entries || history !== saved.history || pending !== saved.pending || lastResult !== null);
}

/** Puts back the options and history from before the guide (call once the demo has settled). */
export function restoreDemo() {
  if (saved) {
    useBingoStore.setState({ ...saved, lastResult: null });
    saved = null;
  }
  storage.remove(RESTORE_KEY);
}
