/** Returns a uniformly distributed unsigned 32-bit integer. */
export type Uint32Source = () => number;

/** Returns a float in [0, 1). */
export type FloatSource = () => number;

const UINT32_RANGE = 0x1_0000_0000;
const buffer = new Uint32Array(1);

export const cryptoUint32: Uint32Source = () => {
  crypto.getRandomValues(buffer);
  return buffer[0]!;
};

/**
 * Uniform integer in [0, n). Uses rejection sampling so that `x % n`
 * carries no modulo bias, whatever the value of n.
 */
export function randomInt(n: number, source: Uint32Source = cryptoUint32): number {
  if (!Number.isInteger(n) || n <= 0 || n > UINT32_RANGE) {
    throw new RangeError(`randomInt: n must be an integer in [1, 2^32], got ${n}`);
  }
  const limit = Math.floor(UINT32_RANGE / n) * n;
  for (;;) {
    const x = source();
    if (x < limit) return x % n;
  }
}

export function randomFloat(source: Uint32Source = cryptoUint32): number {
  return source() / UINT32_RANGE;
}

export const cryptoFloat: FloatSource = () => randomFloat();
