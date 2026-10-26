export interface Entry {
  readonly id: string;
  readonly label: string;
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

export function createEntries(labels: readonly string[]): Entry[] {
  return labels.map((label) => ({ id: createId(), label }));
}

/**
 * Replaces a list with new labels, keeping the id of any entry whose label
 * is unchanged at the same position so history highlights survive.
 */
export function replaceLabels(current: readonly Entry[], labels: readonly string[]): Entry[] {
  return labels.map((label, i) => {
    const existing = current[i];
    return existing && existing.label === label ? existing : { id: createId(), label };
  });
}
