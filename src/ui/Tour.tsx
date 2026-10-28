import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSceneStatus } from '../state/sceneStatus';
import { useRack } from '../state/rack';
import { useBingoStore } from '../state/store';
import {
  TOUR_OVERLAY_ID,
  TOUR_STEPS,
  demoChanged,
  demoSettled,
  endTour,
  restoreDemo,
  startTour,
  tourSeen,
  useTour,
} from '../state/tour';

/** How long after the hall appears the guide opens by itself on a first visit. */
const FIRST_VISIT_DELAY = 900;

/** open → leaving (the card goes, the demo finishes what it started) → curtain (its balls are put away in the dark) → out. */
type Phase = 'open' | 'leaving' | 'curtain' | 'out';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Resolves once no ball is being drawn and none is flying into the cage. */
const settled = () =>
  new Promise<void>((resolve) => {
    if (demoSettled()) return resolve();
    const test = () => {
      if (!demoSettled()) return;
      offs.forEach((off) => off());
      resolve();
    };
    const offs = [useBingoStore.subscribe(test), useRack.subscribe(test)];
  });

/**
 * The guided tour over the hall, which plays by itself from start to end:
 * dims everything but a ring around the part of the table being explained
 * (kept on it by scene/tour/TourTracker.tsx as the camera flies there), with
 * a card docked beside the hall that says what it is for while the arm shows
 * it working (scene/tour/TourDirector.tsx). Nothing can be touched meanwhile.
 * Opens by itself on a first visit; the tent card on the table plays it again.
 * On the way out the demo's balls are put away behind a short fade to black.
 */
export function Tour() {
  const step = useTour((s) => s.step);
  const ready = useSceneStatus((s) => s.modelsReady);
  const [phase, setPhase] = useState<Phase | null>(null);
  /** The demo's balls were put away in the dark: the hall fades back in from it. */
  const [dark, setDark] = useState(false);
  const shown = useRef(0);
  if (step !== null) shown.current = step;
  const cardRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();

  useEffect(() => {
    if (!ready || tourSeen()) return;
    const timer = setTimeout(startTour, FIRST_VISIT_DELAY);
    return () => clearTimeout(timer);
  }, [ready]);

  // Opening and closing, each run cut short if the guide is opened again meanwhile.
  const opened = useRef(false);
  useEffect(() => {
    if (step !== null) {
      opened.current = true;
      setPhase('open');
      setDark(false);
      return;
    }
    if (!opened.current) return;
    opened.current = false;
    let current = true;
    void (async () => {
      setPhase('leaving');
      await settled();
      if (!current) return;
      if (demoChanged()) {
        setDark(true);
        setPhase('curtain');
        await sleep(450);
        if (!current) return;
        restoreDemo();
        await sleep(200);
      } else restoreDemo();
      if (!current) return;
      setPhase('out');
      await sleep(650);
      if (current) setPhase(null);
    })();
    return () => {
      current = false;
    };
  }, [step]);

  useEffect(() => useTour.setState({ overlay: phase !== null && phase !== 'out' }), [phase]);

  // Nothing in the hall is to be touched while the guide plays: it lets go of any focus.
  useEffect(() => {
    if (step !== null && document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, [step]);

  // The card grows and shrinks to its text instead of snapping.
  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const observer = new ResizeObserver(() => setHeight(inner.offsetHeight));
    observer.observe(inner);
    return () => observer.disconnect();
  }, [phase !== null]);

  // The guide plays by itself: keys, scrolling and taps do nothing meanwhile (Escape, quietly, still leaves).
  useEffect(() => {
    if (step === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') endTour();
      event.preventDefault();
      event.stopPropagation();
    };
    const block = (event: Event) => event.preventDefault();
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('wheel', block, { capture: true, passive: false });
    window.addEventListener('touchmove', block, { capture: true, passive: false });
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('wheel', block, true);
      window.removeEventListener('touchmove', block, true);
    };
  }, [step]);

  if (phase === null && step === null) return null;
  const index = shown.current;
  const current = TOUR_STEPS[index]!;

  return (
    <div id={TOUR_OVERLAY_ID} className={`tour is-${phase ?? 'open'}${dark ? ' is-dark' : ''}`} data-dim="on">
      <div className="tour__shade" aria-hidden />
      <div className="tour__ring" aria-hidden />
      <div className="tour__curtain" aria-hidden />
      <div ref={cardRef} className="tour__card" style={{ height }} role="status" aria-live="polite" aria-atomic="true">
        <div ref={innerRef} className="tour__inner">
          <div key={current.id} className="tour__content">
            <p className="tour__count">
              Guía · {index + 1} de {TOUR_STEPS.length}
            </p>
            <h2 className="tour__title">{current.title}</h2>
            <p className="tour__body">{current.body}</p>
          </div>
          <div className="tour__dots" aria-hidden>
            {TOUR_STEPS.map((s, i) => (
              <span key={s.id} className={`tour__dot${i < index ? ' is-done' : i === index ? ' is-current' : ''}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
