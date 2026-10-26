import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBingoStore } from './store';

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
