export interface Entry {
  readonly id: string;
  readonly label: string;
  /** Number printed on this option's ball. Stable while the entry exists, unique in the list. */
  readonly ball: number;
}

export const MAX_LABEL_LENGTH = 80;
export const MAX_ENTRIES = 300;

let fallbackId = 0;
export function createId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `e${Date.now().toString(36)}${(fallbackId++).toString(36)}`;
}

export function cleanLabel(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL_LENGTH);
}

/** One option per line; blank lines are dropped. */
export function parseLines(text: string): string[] {
  return text.split(/\r?\n/).map(cleanLabel).filter((label) => label.length > 0);
}

/** Hands out the lowest ball numbers not already in use, like refilling a real bingo set. */
function ballAllocator(taken: Iterable<number>) {
  const used = new Set(taken);
  let next = 1;
  return () => {
    while (used.has(next)) next++;
    used.add(next);
    return next;
  };
}

/** New entries for `labels`, numbered around the balls already in `existing`. */
export function createEntries(labels: readonly string[], existing: readonly Entry[] = []): Entry[] {
  const nextBall = ballAllocator(existing.map((e) => e.ball));
  return labels.map((label) => ({ id: createId(), label, ball: nextBall() }));
}

/**
 * Replaces a list with new labels, keeping the entry (id and ball) of any row
 * whose label is unchanged at the same position, so history and balls survive.
 */
export function replaceLabels(current: readonly Entry[], labels: readonly string[]): Entry[] {
  const kept = labels.map((label, i) => {
    const existing = current[i];
    return existing && existing.label === label ? existing : null;
  });
  const nextBall = ballAllocator(kept.flatMap((e) => (e ? [e.ball] : [])));
  return labels.map((label, i) => kept[i] ?? { id: createId(), label, ball: nextBall() });
}

/** Gives every entry a valid, unique ball number (used when loading older saved lists). */
export function ensureBallNumbers(entries: ReadonlyArray<{ id: string; label: string; ball?: unknown }>): Entry[] {
  const seen = new Set<number>();
  const valid = entries.map((e) => {
    const ball = typeof e.ball === 'number' && Number.isInteger(e.ball) && e.ball > 0 && !seen.has(e.ball) ? e.ball : null;
    if (ball !== null) seen.add(ball);
    return ball;
  });
  const nextBall = ballAllocator(seen);
  return entries.map((e, i) => ({ id: e.id, label: e.label, ball: valid[i] ?? nextBall() }));
}
