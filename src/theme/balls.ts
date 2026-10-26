export interface BallStyle {
  /** Shell colour. */
  readonly shell: string;
  /** Colour of the printed number inside the white disc. */
  readonly ink: string;
  readonly name: string;
}

/**
 * Classic 75-ball bingo colour bands (B-I-N-G-O), repeated every 75 so any
 * number has a colour: 1–15 blue, 16–30 red, 31–45 ivory, 46–60 green, 61–75 amber.
 */
const BANDS: readonly BallStyle[] = [
  { name: 'azul', shell: '#2459a8', ink: '#16325f' },
  { name: 'roja', shell: '#c3322a', ink: '#7a1712' },
  { name: 'marfil', shell: '#ece2c8', ink: '#b52a22' },
  { name: 'verde', shell: '#2c7a4c', ink: '#163f27' },
  { name: 'ámbar', shell: '#e09a26', ink: '#6b4208' },
];

export function ballStyle(ball: number): BallStyle {
  return BANDS[Math.floor(((ball - 1) % 75) / 15)]!;
}

export const BINGO_LETTERS = ['B', 'I', 'N', 'G', 'O'] as const;

/** Bingo-call letter for a number, e.g. 7 → "B", 52 → "G". */
export function ballLetter(ball: number): string {
  return BINGO_LETTERS[Math.floor(((ball - 1) % 75) / 15)]!;
}
