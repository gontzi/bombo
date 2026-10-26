import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { indexUnderPointer } from '../domain/wheelMath';
import { SETTLE_MS, useWheelStore } from './store';

const store = () => useWheelStore.getState();

beforeEach(() => {
  vi.useFakeTimers();
  useWheelStore.setState({ spin: null, lastResult: null, history: [], rotation: 0 });
  store().replaceAll(['A', 'B', 'C', 'D']);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('spinning', () => {
  it('records the pre-chosen winner, which is what ends under the pointer', () => {
    for (let k = 0; k < 30; k++) {
      expect(store().startSpin()).toBe(true);
      const { plan, winner } = store().spin!;
      vi.advanceTimersByTime(plan.durationMs + SETTLE_MS);

      const { lastResult, rotation, entries } = store();
      expect(lastResult?.entryId).toBe(winner.id);
      expect(entries[indexUnderPointer(rotation, entries.length)]!.id).toBe(winner.id);
    }
    expect(store().history).toHaveLength(30);
  });

  it('ignores new spins and edits while one is running', () => {
    store().startSpin();
    const first = store().spin;
    expect(store().startSpin()).toBe(false);
    expect(store().spin).toBe(first);

    store().addEntries(['E']);
    store().removeEntry(store().entries[0]!.id);
    store().clearEntries();
    expect(store().entries.map((e) => e.label)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('does nothing on an empty list', () => {
    store().clearEntries();
    expect(store().startSpin()).toBe(false);
    expect(store().spin).toBeNull();
  });

  it('works with a single option', () => {
    store().replaceAll(['Solo']);
    store().startSpin({ reducedMotion: true });
    vi.runAllTimers();
    expect(store().lastResult?.label).toBe('Solo');
  });
});

describe('removing the winner', () => {
  it('removes exactly the winning entry when labels repeat', () => {
    store().replaceAll(['Igual', 'Igual', 'Igual']);
    store().startSpin({ reducedMotion: true });
    const winnerId = store().spin!.winner.id;
    vi.runAllTimers();

    store().removeWinner();
    const ids = store().entries.map((e) => e.id);
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain(winnerId);
    expect(store().lastResult).toBeNull();
    // History keeps the record.
    expect(store().history[0]!.entryId).toBe(winnerId);
  });

  it('is never automatic', () => {
    store().startSpin();
    vi.runAllTimers();
    expect(store().entries).toHaveLength(4);
  });
});

describe('entries', () => {
  it('adds several at once and trims', () => {
    expect(store().addEntries(['  x ', '', 'y'])).toBe(2);
    expect(store().entries.map((e) => e.label)).toEqual(['A', 'B', 'C', 'D', 'x', 'y']);
  });

  it('ignores blank edits', () => {
    const id = store().entries[0]!.id;
    store().updateEntry(id, '   ');
    expect(store().entries[0]!.label).toBe('A');
  });
});
