import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { playButton } from '../../audio/sounds';
import { requestDraw } from '../../hooks/useDraw';
import { TURNS_TO_DRAW, crankDrive, useCrank } from '../../state/crank';
import { tipRack, useRack } from '../../state/rack';
import { useBingoStore } from '../../state/store';
import { DEMO_LABELS, TOUR_STEPS, demoSettled, endTour, nextStep, useTour, type TourStepId } from '../../state/tour';
import { RACK_FOCUS } from '../rack/layout';
import { FROM_BELOW, FROM_SIDE, HOVER_GAP, tourArm } from './armControl';
import { GREEN_BUTTON, GUIDE_CARD_POSITION, PLATE, RED_BUTTON, crankHandle } from './stops';

/** Time for the camera to get to a step before the arm comes in, ms. */
const ARRIVE = 1200;
/** How far the demo turns the crank before letting go: a little past the turns a draw needs. */
const DEMO_TURNS = TURNS_TO_DRAW + 0.15;
const FULL = Math.PI * 2;
/** Long enough to read a step's card: a base plus a little per character. */
const readingTime = (id: TourStepId) => 1600 + 30 * TOUR_STEPS.find((s) => s.id === id)!.body.length;

class Cancelled extends Error {}

/** What a step's demo can do: every wait ends early (throwing) once the guide moves on. */
function director(signal: AbortSignal, invalidate: () => void) {
  const wait = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Cancelled());
      });
    });
  /** Resolves once `ready()` holds, checked as the stores change. */
  const until = (ready: () => boolean) =>
    new Promise<void>((resolve, reject) => {
      const offs: (() => void)[] = [];
      const done = (fn: () => void) => {
        offs.forEach((off) => off());
        fn();
      };
      const test = () => ready() && done(resolve);
      offs.push(useBingoStore.subscribe(test), useRack.subscribe(test));
      signal.addEventListener('abort', () => done(() => reject(new Cancelled())));
      test();
    });
  /** Calls `frame(t)` every animation frame for `ms`, t going 0 to 1. */
  const animate = (ms: number, frame: (t: number) => void) =>
    new Promise<void>((resolve, reject) => {
      const start = performance.now();
      let raf = 0;
      const tick = () => {
        const t = Math.min(1, (performance.now() - start) / ms);
        frame(t);
        invalidate();
        if (t < 1) raf = requestAnimationFrame(tick);
        else resolve();
      };
      raf = requestAnimationFrame(tick);
      signal.addEventListener('abort', () => {
        cancelAnimationFrame(raf);
        reject(new Cancelled());
      });
    });
  /** Tells the arm where to be (`gap` short of `target`, or out of sight with null). */
  const arm = (gap: number | null, stiffness = 7, target?: THREE.Vector3, fist?: number) => {
    if (target) tourArm.target.copy(target);
    if (fist !== undefined) tourArm.fist = fist;
    Object.assign(tourArm, { gap, stiffness });
    invalidate();
  };
  /** The arm reaches in and hovers over `point`, pointing. */
  const reach = async (point: THREE.Vector3) => {
    arm(HOVER_GAP, 7, point, 0);
    await wait(1100);
  };
  /** A press with the fingertip, doing `action` as it bottoms out. */
  const press = async (action: () => void, depth = 0.008) => {
    arm(-depth, 26);
    await wait(170);
    if (useBingoStore.getState().sound) playButton();
    action();
    await wait(260);
    arm(HOVER_GAP, 18);
    await wait(380);
  };
  const withdraw = async (ms = 700) => {
    arm(null, 6);
    await wait(ms);
  };
  /** Makes sure there are balls in the cage, tipping in what waits in the rack (or the demo's own) if not. */
  const fillCage = async () => {
    await until(demoSettled);
    const store = useBingoStore.getState();
    if (store.entries.length > 0) return;
    if (store.pending.length === 0) store.addPending(DEMO_LABELS);
    await wait(400);
    tipRack();
    await until(demoSettled);
  };
  return { wait, until, animate, arm, reach, press, withdraw, fillCage };
}

type Director = ReturnType<typeof director>;

/** Each step's demo; when it ends, the guide moves on by itself. */
const ACTS: Record<TourStepId, (d: Director) => Promise<void>> = {
  welcome: async (d) => {
    await d.wait(readingTime('welcome'));
  },

  rack: async (d) => {
    await d.wait(ARRIVE);
    await d.reach(RACK_FOCUS);
    await d.press(() => {}, 0.004);
    await d.withdraw();
    await d.wait(readingTime('rack') - 2500);
  },

  plate: async (d) => {
    await d.wait(ARRIVE);
    await d.reach(PLATE);
    const { setDraft } = useRack.getState();
    for (const label of DEMO_LABELS) {
      const { entries, pending } = useBingoStore.getState();
      if ([...entries, ...pending].some((e) => e.label === label)) continue;
      // Each letter a tap of the fingertip on the plate, and the letter cut into it.
      for (let i = 1; i <= label.length; i++) {
        d.arm(-0.002, 30);
        await d.wait(70);
        setDraft(label.slice(0, i));
        d.arm(0.022, 30);
        await d.wait(70 + Math.random() * 60);
      }
      // Enter: a firmer press, and the ball drops into the rack.
      await d.wait(220);
      await d.press(() => {
        useBingoStore.getState().addPending([label]);
        setDraft('');
      }, 0.004);
      await d.wait(250);
    }
    await d.withdraw();
    await d.wait(1200);
  },

  tip: async (d) => {
    await d.until(demoSettled);
    const store = useBingoStore.getState();
    if (store.pending.length === 0 && store.entries.length === 0) store.addPending(DEMO_LABELS);
    await d.wait(ARRIVE);
    if (useBingoStore.getState().pending.length > 0) {
      await d.reach(GREEN_BUTTON);
      await d.press(() => tipRack());
      await d.withdraw();
    }
    await d.until(demoSettled);
    await d.wait(1600);
  },

  draw: async (d) => {
    await d.fillCage();
    await d.wait(ARRIVE);
    await d.reach(RED_BUTTON);
    await d.press(() => requestDraw());
    // Out of the way before the camera follows the ball.
    d.arm(null, 9);
    await d.until(() => !useBingoStore.getState().draw);
    await d.wait(700);
  },

  tray: async (d) => {
    await d.wait(readingTime('tray'));
  },

  crank: async (d) => {
    await d.fillCage();
    await d.wait(ARRIVE);
    const handle = crankHandle(crankDrive.angle);
    tourArm.from = FROM_BELOW;
    // Comes in open-handed, closes round the handle.
    d.arm(0.05, 7, handle, 0.2);
    await d.wait(1000);
    d.arm(0, 14, handle, 1);
    await d.wait(500);
    useCrank.getState().setActive(true);
    let turned = 0;
    try {
      await d.animate(3600, (t) => {
        // Eases in and out, like a hand getting going and slowing to let go.
        const goal = t * t * (3 - 2 * t) * DEMO_TURNS * FULL;
        const step = goal - turned;
        turned = goal;
        crankDrive.dragging = true;
        crankDrive.turned += step;
        crankDrive.total += step;
        const progress = Math.min(1, Math.floor((turned / (FULL * TURNS_TO_DRAW)) * 8) / 8);
        if (progress !== useCrank.getState().progress) useCrank.getState().setProgress(progress);
        // The fist rides the handle round.
        crankHandle(crankDrive.angle + step, tourArm.target);
      });
    } finally {
      crankDrive.dragging = false;
    }
    // Lets go: the hand opens and the ball comes out.
    d.arm(0.06, 10, undefined, 0.2);
    if (requestDraw({ hand: true })) useTour.setState({ showResult: true });
    else useCrank.getState().setActive(false);
    await d.wait(300);
    d.arm(null, 8);
    await d.until(() => !useBingoStore.getState().draw);
    await d.wait(2200);
  },

  replay: async (d) => {
    await d.wait(ARRIVE);
    // Points at the tent card without touching it.
    d.arm(0.035, 7, GUIDE_CARD_POSITION.clone().setY(0.05), 0);
    await d.wait(readingTime('replay'));
    await d.withdraw(900);
  },
};

/**
 * Plays the guide from start to end with nobody touching anything: on each
 * step, once the camera has arrived, the arm shows the part working (taps out
 * options on the plate, presses the buttons, turns the crank), then the guide
 * moves on by itself, and after the last step it closes.
 */
export function TourDirector() {
  const invalidate = useThree((s) => s.invalidate);
  const step = useTour((s) => s.step);

  useEffect(() => {
    if (step === null) return;
    const abort = new AbortController();
    const last = step === TOUR_STEPS.length - 1;
    ACTS[TOUR_STEPS[step]!.id](director(abort.signal, invalidate))
      .then(() => (last ? endTour() : nextStep()))
      .catch((error: unknown) => {
        if (!(error instanceof Cancelled)) throw error;
      });
    return () => {
      abort.abort();
      tourArm.gap = null;
      tourArm.from = FROM_SIDE;
      useRack.getState().setDraft('');
      // Stopped mid-turn: the crank is let go without a draw.
      crankDrive.dragging = false;
      if (useCrank.getState().active && !useBingoStore.getState().draw) useCrank.getState().setActive(false);
      invalidate();
    };
  }, [step, invalidate]);

  return null;
}
