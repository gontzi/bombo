import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_ENTRIES } from '../domain/entries';
import { RACK_SLOTS, useBingoStore } from './store';

const store = () => useBingoStore.getState();

beforeEach(() => {
  vi.useFakeTimers();
  useBingoStore.setState({ draw: null, lastResult: null, history: [] });
  store().replaceAll(['A', 'B', 'C', 'D']);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('drawing', () => {
  it('records exactly the winner chosen before the animation', () => {
    for (let k = 0; k < 30; k++) {
      expect(store().startDraw()).toBe(true);
      const { plan, winner } = store().draw!;
      vi.advanceTimersByTime(plan.timeline.totalMs);
      const { lastResult } = store();
      expect(lastResult?.entryId).toBe(winner.id);
      expect(lastResult?.ball).toBe(winner.ball);
      expect(lastResult?.label).toBe(winner.label);
    }
    expect(store().history).toHaveLength(30);
  });

  it('ignores new draws and edits while one is running', () => {
    store().startDraw();
    const first = store().draw;
    expect(store().startDraw()).toBe(false);
    expect(store().draw).toBe(first);

    store().addEntries(['E']);
    store().removeEntry(store().entries[0]!.id);
    store().clearEntries();
    expect(store().entries.map((e) => e.label)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('does nothing on an empty list', () => {
    store().clearEntries();
    expect(store().startDraw()).toBe(false);
    expect(store().draw).toBeNull();
  });

  it('works with a single ball', () => {
    store().replaceAll(['Solo']);
    store().startDraw({ reducedMotion: true });
    vi.runAllTimers();
    expect(store().lastResult?.label).toBe('Solo');
  });
});

describe('removing the winner', () => {
  it('removes exactly the winning ball when labels repeat', () => {
    store().replaceAll(['Igual', 'Igual', 'Igual']);
    store().startDraw({ reducedMotion: true });
    const winner = store().draw!.winner;
    vi.runAllTimers();

    store().removeWinner();
    const remaining = store().entries;
    expect(remaining).toHaveLength(2);
    expect(remaining.map((e) => e.id)).not.toContain(winner.id);
    expect(remaining.map((e) => e.ball)).not.toContain(winner.ball);
    expect(store().history[0]!.entryId).toBe(winner.id);
  });

  it('is never automatic', () => {
    store().startDraw();
    vi.runAllTimers();
    expect(store().entries).toHaveLength(4);
  });
});

describe('entries', () => {
  it('adds several at once with fresh ball numbers', () => {
    expect(store().addEntries(['  x ', '', 'y'])).toBe(2);
    const entries = store().entries;
    expect(entries.map((e) => e.label)).toEqual(['A', 'B', 'C', 'D', 'x', 'y']);
    expect(new Set(entries.map((e) => e.ball)).size).toBe(6);
  });

  it('keeps the ball number when an option is renamed', () => {
    const { id, ball } = store().entries[1]!;
    store().updateEntry(id, 'Nuevo nombre');
    expect(store().entries[1]).toMatchObject({ id, ball, label: 'Nuevo nombre' });
  });

  it('ignores blank edits', () => {
    const id = store().entries[0]!.id;
    store().updateEntry(id, '   ');
    expect(store().entries[0]!.label).toBe('A');
  });
});

describe('ball rack', () => {
  beforeEach(() => useBingoStore.setState({ pending: [] }));

  it('numbers waiting balls around the cage and moves them in one by one', () => {
    expect(store().addPending(['E', 'F'])).toBe(2);
    const [e, f] = store().pending;
    const inCage = store().entries.map((x) => x.ball);
    expect(inCage).not.toContain(e!.ball);
    expect(e!.ball).not.toBe(f!.ball);

    store().commitPending(e!.id);
    expect(store().pending.map((x) => x.label)).toEqual(['F']);
    expect(store().entries.at(-1)).toEqual(e);
  });

  it('drops the sample options into the rack, not the cage', () => {
    const before = store().entries.length;
    expect(store().addSample()).toBeGreaterThan(0);
    expect(store().entries).toHaveLength(before);
    expect(store().pending.length).toBeGreaterThan(0);
  });

  it('keeps more options waiting than it has cups, up to what the cage holds', () => {
    const labels = Array.from({ length: RACK_SLOTS + 5 }, (_, i) => `O${i}`);
    expect(store().addPending(labels)).toBe(RACK_SLOTS + 5);
    const room = MAX_ENTRIES - store().entries.length - store().pending.length;
    expect(store().addPending(Array.from({ length: room + 3 }, (_, i) => `P${i}`))).toBe(room);
    expect(store().addPending(['one more'])).toBe(0);
  });

  it('keeps ball numbers unique if the cage changed while they waited', () => {
    store().addPending(['E']);
    const waiting = store().pending[0]!;
    useBingoStore.setState((s) => ({ entries: [...s.entries, { id: 'x', label: 'X', ball: waiting.ball }] }));
    store().commitPending(waiting.id);
    const balls = store().entries.map((x) => x.ball);
    expect(new Set(balls).size).toBe(balls.length);
  });
});

describe('drawing by hand', () => {
  it('uses the short timeline and the same fair pick', () => {
    expect(store().startDraw({ hand: true })).toBe(true);
    const { plan } = store().draw!;
    expect(plan.hand).toBe(true);
    expect(plan.timeline.mixEnd).toBe(0);
    // Let go, the cage keeps spinning a while before the ball heads for the exit.
    expect(plan.timeline.extractStart).toBeGreaterThanOrEqual(plan.timeline.slowEnd);
    expect(plan.timeline.extractStart).toBeGreaterThan(0);
    vi.advanceTimersByTime(plan.timeline.totalMs);
    expect(store().lastResult?.entryId).toBe(plan.winnerId);
  });
});
