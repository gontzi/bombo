import { beforeEach, describe, expect, it } from 'vitest';
import { useRack } from './rack';
import { useBingoStore } from './store';
import { TOUR_STEPS, demoChanged, endTour, goToStep, nextStep, restoreDemo, startTour, useTour } from './tour';

const step = () => useTour.getState().step;

beforeEach(() => {
  restoreDemo();
  useTour.setState({ step: null });
  useBingoStore.setState({ draw: null, entries: [], pending: [], history: [], lastResult: null });
  useRack.setState({ open: false, tipping: false });
});

describe('guided tour', () => {
  it('walks every step and closes after the last', () => {
    expect(startTour()).toBe(true);
    for (let i = 0; i < TOUR_STEPS.length; i++) {
      expect(step()).toBe(i);
      nextStep();
    }
    expect(step()).toBeNull();
  });

  it('closes the rack when it starts', () => {
    useRack.setState({ open: true });
    startTour();
    expect(useRack.getState().open).toBe(false);
  });

  it('keeps jumps within the steps, and does nothing while closed', () => {
    goToStep(3);
    expect(step()).toBeNull();
    startTour();
    goToStep(-2);
    expect(step()).toBe(0);
    goToStep(99);
    expect(step()).toBe(TOUR_STEPS.length - 1);
    endTour();
    expect(step()).toBeNull();
  });

  it('does not start during a draw', () => {
    useBingoStore.setState({ draw: {} as never });
    expect(startTour()).toBe(false);
    expect(step()).toBeNull();
  });

  it('puts back what was there before its demo', () => {
    useBingoStore.getState().replaceAll(['Mío']);
    const before = useBingoStore.getState().entries;
    startTour();
    expect(demoChanged()).toBe(false);
    useBingoStore.getState().addPending(['Pizza']);
    useBingoStore.getState().addEntries(['Sushi']);
    endTour();
    expect(demoChanged()).toBe(true);
    restoreDemo();
    expect(useBingoStore.getState().entries).toBe(before);
    expect(useBingoStore.getState().pending).toEqual([]);
  });
});
