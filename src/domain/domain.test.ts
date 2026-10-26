import { describe, expect, it } from 'vitest';
import { randomInt, type Uint32Source } from './random';
import { FULL_TIMELINE, REDUCED_TIMELINE, cageSpeed, decideDraw, extractionPhase } from './draw';
import { createEntries, ensureBallNumbers, parseLines, replaceLabels } from './entries';
import { ballLetter, ballStyle } from '../theme/balls';

/** Small deterministic PRNG (mulberry32) so failures are reproducible. */
export function seeded(seed: number): Uint32Source {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

describe('randomInt', () => {
  it('rejects values that would bias the modulo', () => {
    const values = [0xffffffff, 7];
    expect(randomInt(3, () => values.shift()!)).toBe(7 % 3);
  });

  it('is uniform (chi-square, 10 buckets)', () => {
    const source = seeded(42);
    const counts = new Array<number>(10).fill(0);
    for (let i = 0; i < 100_000; i++) counts[randomInt(10, source)]!++;
    const chi = counts.reduce((sum, c) => sum + (c - 10_000) ** 2 / 10_000, 0);
    // 99.9th percentile of chi-square with 9 degrees of freedom ≈ 27.9.
    expect(chi).toBeLessThan(27.9);
  });

  it('throws for invalid n', () => {
    expect(() => randomInt(0)).toThrow(RangeError);
    expect(() => randomInt(2.5)).toThrow(RangeError);
  });
});

describe('decideDraw', () => {
  it('gives every ball, duplicates included, the same chance', () => {
    const entries = createEntries(['Pizza', 'Pizza', 'Sushi', 'Tacos']);
    const source = seeded(9);
    const counts = new Map(entries.map((e) => [e.id, 0]));
    const draws = 40_000;
    for (let i = 0; i < draws; i++) {
      const { winner } = decideDraw(entries, { source });
      counts.set(winner.id, counts.get(winner.id)! + 1);
    }
    const expected = draws / entries.length;
    const chi = [...counts.values()].reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
    // 99.9th percentile with 3 degrees of freedom ≈ 16.3.
    expect(chi).toBeLessThan(16.3);
  });

  it('plans exactly the entry it returns', () => {
    const entries = createEntries(['A', 'B', 'C']);
    const source = seeded(1);
    for (let i = 0; i < 50; i++) {
      const { plan, winner } = decideDraw(entries, { source });
      expect(entries[plan.winnerIndex]).toBe(winner);
      expect(plan.winnerId).toBe(winner.id);
      expect(plan.entryCount).toBe(3);
    }
  });

  it('uses the short timeline for reduced motion', () => {
    const { plan } = decideDraw(createEntries(['A']), { reducedMotion: true });
    expect(plan.timeline).toBe(REDUCED_TIMELINE);
    expect(cageSpeed(plan.timeline, 300)).toBe(0);
  });

  it('refuses an empty list', () => {
    expect(() => decideDraw([])).toThrow();
  });
});

describe('timeline', () => {
  it('is ordered so the ball leaves while the cage is slowing down', () => {
    for (const t of [FULL_TIMELINE, REDUCED_TIMELINE]) {
      expect(t.extractStart).toBeLessThanOrEqual(t.portArrive);
      expect(t.portArrive).toBeLessThan(t.rampEnd);
      expect(t.rampEnd).toBeLessThan(t.settleEnd);
      expect(t.settleEnd).toBeLessThanOrEqual(t.totalMs);
    }
    expect(FULL_TIMELINE.extractStart).toBeGreaterThan(FULL_TIMELINE.mixEnd);
  });

  it('accelerates, holds and slows the cage to rest', () => {
    const t = FULL_TIMELINE;
    expect(cageSpeed(t, 0)).toBe(0);
    expect(cageSpeed(t, t.spinUpEnd / 2)).toBeGreaterThan(0.3);
    expect(cageSpeed(t, (t.spinUpEnd + t.mixEnd) / 2)).toBe(1);
    expect(cageSpeed(t, t.slowEnd)).toBeCloseTo(0.12);
    expect(cageSpeed(t, t.slowEnd + 1000)).toBe(0);
  });

  it('walks through the extraction phases in order', () => {
    const t = FULL_TIMELINE;
    expect(extractionPhase(t, 100).phase).toBe('waiting');
    expect(extractionPhase(t, t.extractStart + 10).phase).toBe('pull');
    expect(extractionPhase(t, t.portArrive + 10).phase).toBe('chute');
    expect(extractionPhase(t, t.rampEnd + 10).phase).toBe('settle');
    expect(extractionPhase(t, t.settleEnd).phase).toBe('done');
  });
});

describe('entries and ball numbers', () => {
  it('parses one option per line', () => {
    expect(parseLines('  Pizza \r\n\nSushi\n   \n  Tacos   al  pastor ')).toEqual(['Pizza', 'Sushi', 'Tacos al pastor']);
  });

  it('numbers new balls with the lowest free numbers', () => {
    const first = createEntries(['A', 'B', 'C']);
    expect(first.map((e) => e.ball)).toEqual([1, 2, 3]);
    const withoutB = first.filter((e) => e.label !== 'B');
    expect(createEntries(['D', 'E'], withoutB).map((e) => e.ball)).toEqual([2, 4]);
  });

  it('keeps id and ball of unchanged rows and never repeats a number', () => {
    const current = createEntries(['A', 'B', 'C']);
    const next = replaceLabels(current, ['A', 'X', 'C', 'D']);
    expect(next[0]).toBe(current[0]);
    expect(next[2]).toBe(current[2]);
    expect(next[1]!.id).not.toBe(current[1]!.id);
    expect(new Set(next.map((e) => e.ball)).size).toBe(4);
  });

  it('repairs missing or repeated numbers from older saves', () => {
    const fixed = ensureBallNumbers([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B', ball: 1 },
      { id: 'c', label: 'C', ball: 1 },
      { id: 'd', label: 'D', ball: -3 },
    ]);
    expect(fixed.map((e) => e.ball)).toEqual([2, 1, 3, 4]);
  });
});

describe('ball styles', () => {
  it('follows the B-I-N-G-O colour bands', () => {
    expect(ballLetter(1)).toBe('B');
    expect(ballLetter(15)).toBe('B');
    expect(ballLetter(16)).toBe('I');
    expect(ballLetter(75)).toBe('O');
    expect(ballLetter(76)).toBe('B');
    expect(ballStyle(31).name).toBe('marfil');
  });
});
