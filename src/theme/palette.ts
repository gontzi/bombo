export interface SegmentColor {
  readonly name: string;
  readonly fill: string;
  readonly label: string;
}

const INK = '#22190F';
const CREAM = '#FFF4E2';

/** Lacquer palette, ordered so neighbours alternate in value. */
export const SEGMENT_PALETTE: readonly SegmentColor[] = [
  { name: 'bermellón', fill: '#D4462C', label: CREAM },
  { name: 'crema', fill: '#EFDFC0', label: INK },
  { name: 'verde pino', fill: '#1F6B5C', label: CREAM },
  { name: 'ocre', fill: '#E2A93B', label: INK },
  { name: 'azul tinta', fill: '#25406E', label: CREAM },
  { name: 'ciruela', fill: '#7A2F4C', label: CREAM },
];

/**
 * Palette slot for segment i of n. When the cycle would leave the last
 * segment the same colour as the first (they touch), it takes a colour
 * that differs from both neighbours.
 */
export function paletteIndex(i: number, n: number, size = SEGMENT_PALETTE.length): number {
  if (n > 1 && n % size === 1 && i === n - 1) return Math.floor(size / 2) - 1;
  return i % size;
}

export function segmentColor(i: number, n: number): SegmentColor {
  return SEGMENT_PALETTE[paletteIndex(i, n)]!;
}
