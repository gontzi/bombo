import type { Entry } from './entries';
import { planSpin, type PlanOptions, type SpinPlan } from './planSpin';
import { cryptoUint32, randomInt, type Uint32Source } from './random';
import { indexUnderPointer } from './wheelMath';

export interface SpinDecision {
  readonly plan: SpinPlan;
  readonly winner: Entry;
}

export interface DecideOptions extends PlanOptions {
  source?: Uint32Source;
}

/**
 * Picks the winner first, then plans the animation that lands on it.
 * The result is final: nothing downstream reads it back from the wheel.
 */
export function decideSpin(
  entries: readonly Entry[],
  startRotation: number,
  { source = cryptoUint32, ...planOptions }: DecideOptions = {},
): SpinDecision {
  if (entries.length === 0) throw new Error('decideSpin: no entries');
  const winnerIndex = randomInt(entries.length, source);
  const plan = planSpin(winnerIndex, entries.length, startRotation, planOptions);

  if (import.meta.env?.DEV && indexUnderPointer(plan.targetRotation, entries.length) !== winnerIndex) {
    throw new Error('decideSpin: planned stop does not land on the winner');
  }
  return { plan, winner: entries[winnerIndex]! };
}
