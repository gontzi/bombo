import { describe, expect, it } from 'vitest';
import { randomInt, type Uint32Source } from './random';
import { spinEase, gentleEase } from './easing';
import { planSpin, rotationAt, SPIN_SETTINGS } from './planSpin';
import {
  TAU,
  boundaryCount,
  indexUnderPointer,
  normalizeAngle,
  rotationForLocalAngle,
  segmentCenter,
  segmentSize,
} from './wheelMath';
import { decideSpin } from './selection';
import { createEntries, parseLines, replaceLabels } from './entries';
import { paletteIndex } from '../theme/palette';

/** Small deterministic PRNG (mulberry32) so failures are reproducible. */
function seeded(seed: number) {
  let a = seed >>> 0;
  const uint32: Uint32Source = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  return { uint32, float: () => uint32() / 0x1_0000_0000 };
}

describe('randomInt', () => {
  it('rejects values that would bias the modulo', () => {
    // For n = 3, limit = 4294967295; the top value must be rejected.
    const values = [0xffffffff, 7];
    const source = () => values.shift()!;
    expect(randomInt(3, source)).toBe(7 % 3);
  });

  it('is roughly uniform (chi-square, 10 buckets)', () => {
    const { uint32 } = seeded(42);
    const n = 10;
    const draws = 100_000;
    const counts = new Array<number>(n).fill(0);
    for (let i = 0; i < draws; i++) counts[randomInt(n, uint32)]!++;
    const expected = draws / n;
    const chi = counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
    // 99.9th percentile of chi-square with 9 degrees of freedom ≈ 27.9.
    expect(chi).toBeLessThan(27.9);
  });

  it('throws for invalid n', () => {
    expect(() => randomInt(0)).toThrow(RangeError);
    expect(() => randomInt(2.5)).toThrow(RangeError);
  });
});

describe('wheelMath', () => {
  it('normalizes into [0, 2π)', () => {
    expect(normalizeAngle(-1e-17)).toBe(0);
    expect(normalizeAngle(TAU)).toBe(0);
    expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2);
  });

  it('maps every segment centre back to its index', () => {
    for (let n = 1; n <= 200; n++) {
      for (let i = 0; i < n; i++) {
        expect(indexUnderPointer(rotationForLocalAngle(segmentCenter(i, n)), n)).toBe(i);
      }
    }
  });

  it('returns -1 for an empty wheel', () => {
    expect(indexUnderPointer(1, 0)).toBe(-1);
  });

  it('counts one boundary per segment of clockwise travel', () => {
    const n = 8;
    expect(boundaryCount(-segmentSize(n) * 3 - 1e-9, n) - boundaryCount(-1e-9, n)).toBe(3);
  });
});

describe('easing', () => {
  it('starts at 0, ends at 1 and never goes backwards', () => {
    for (const ease of [spinEase, gentleEase]) {
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBeCloseTo(1, 12);
      let prev = 0;
      for (let t = 0; t <= 1; t += 0.001) {
        const v = ease(t);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
        prev = v;
      }
    }
  });

  it('comes to rest smoothly', () => {
    const h = 1e-4;
    expect((spinEase(1) - spinEase(1 - h)) / h).toBeLessThan(1e-6);
    // ...and starts from rest too.
    expect(spinEase(h) / h).toBeLessThan(0.01);
  });
});

describe('planSpin', () => {
  it('always stops on the chosen segment, away from its edges', () => {
    const rng = seeded(7).float;
    for (let n = 1; n <= 200; n++) {
      const s = segmentSize(n);
      for (let k = 0; k < 25; k++) {
        const winner = Math.floor(rng() * n);
        const start = (rng() - 0.5) * 40;
        const plan = planSpin(winner, n, start, { rng });
        expect(indexUnderPointer(plan.targetRotation, n)).toBe(winner);

        const local = normalizeAngle(-plan.targetRotation);
        const offsetInSegment = local - winner * s;
        expect(offsetInSegment).toBeGreaterThan(s * SPIN_SETTINGS.edgeMargin * 0.999);
        expect(offsetInSegment).toBeLessThan(s * (1 - SPIN_SETTINGS.edgeMargin * 0.999));
      }
    }
  });

  it('spins clockwise for several full turns', () => {
    const rng = seeded(3).float;
    for (let k = 0; k < 200; k++) {
      const plan = planSpin(2, 7, rng() * TAU, { rng });
      const travel = plan.startRotation - plan.targetRotation;
      expect(travel).toBeGreaterThanOrEqual(SPIN_SETTINGS.minTurns * TAU);
      expect(travel).toBeLessThan((SPIN_SETTINGS.minTurns + SPIN_SETTINGS.extraTurns + 1) * TAU);
    }
  });

  it('uses a short, turn-free move for reduced motion', () => {
    const plan = planSpin(0, 4, 1, { reducedMotion: true, rng: () => 0.5 });
    expect(plan.durationMs).toBe(SPIN_SETTINGS.reducedDurationMs);
    expect(plan.startRotation - plan.targetRotation).toBeLessThan(TAU);
    expect(indexUnderPointer(plan.targetRotation, 4)).toBe(0);
  });

  it('rotationAt hits the exact endpoints', () => {
    const plan = planSpin(3, 9, 0.4, { rng: seeded(1).float });
    expect(rotationAt(plan, -5)).toBe(plan.startRotation);
    expect(rotationAt(plan, plan.durationMs)).toBe(plan.targetRotation);
    expect(rotationAt(plan, plan.durationMs * 10)).toBe(plan.targetRotation);
  });

  it('rejects invalid input', () => {
    expect(() => planSpin(0, 0, 0)).toThrow(RangeError);
    expect(() => planSpin(5, 5, 0)).toThrow(RangeError);
  });
});

describe('decideSpin', () => {
  it('returns the entry at the planned index, duplicates included', () => {
    const entries = createEntries(['A', 'A', 'B']);
    const { uint32, float } = seeded(11);
    for (let k = 0; k < 100; k++) {
      const { plan, winner } = decideSpin(entries, 0, { source: uint32, rng: float });
      expect(winner).toBe(entries[plan.winnerIndex]);
      expect(indexUnderPointer(plan.targetRotation, entries.length)).toBe(plan.winnerIndex);
    }
  });

  it('refuses an empty list', () => {
    expect(() => decideSpin([], 0)).toThrow();
  });
});

describe('entries', () => {
  it('parses one option per line', () => {
    expect(parseLines('  Pizza \r\n\nSushi\n   \n  Tacos   al  pastor ')).toEqual([
      'Pizza',
      'Sushi',
      'Tacos al pastor',
    ]);
  });

  it('keeps ids of unchanged rows', () => {
    const current = createEntries(['A', 'B', 'C']);
    const next = replaceLabels(current, ['A', 'X', 'C', 'D']);
    expect(next[0]).toBe(current[0]);
    expect(next[1]!.id).not.toBe(current[1]!.id);
    expect(next[2]).toBe(current[2]);
    expect(next).toHaveLength(4);
  });
});

describe('paletteIndex', () => {
  it('never gives touching segments the same colour', () => {
    for (let n = 2; n <= 60; n++) {
      for (let i = 0; i < n; i++) {
        expect(paletteIndex(i, n)).not.toBe(paletteIndex((i + 1) % n, n));
      }
    }
  });
});
