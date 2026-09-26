/**
 * Seeded RNG.
 *
 * Every "random" input in this app comes from here, never from `Math.random`
 * (which Biome denies outright inside `core/`). The reason is not stylistic: a
 * golden trace snapshot is only meaningful if the input that produced it is
 * reproducible. A student who clicks "reshuffle" gets a new array, the URL
 * carries the seed, and a shared link reproduces the exact same run — including
 * the same trace.
 */

/** mulberry32 — small, fast, and good enough for shuffling demo data. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Uniform element of a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** Fisher-Yates, returning a new array. */
  shuffle<T>(items: readonly T[]): T[];
  /** Approximately standard normal, via the Irwin-Hall approximation. */
  normal(mean?: number, sd?: number): number;
}

export function makeRng(seed: number): Rng {
  const next = mulberry32(seed);
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('rng.pick called with an empty array');
      return items[int(0, items.length - 1)] as T;
    },
    shuffle: <T>(items: readonly T[]): T[] => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        const a = out[i] as T;
        const b = out[j] as T;
        out[i] = b;
        out[j] = a;
      }
      return out;
    },
    normal: (mean = 0, sd = 1) => {
      // Sum of 6 uniforms, centred — cheap, bounded, and plenty for visuals.
      let s = 0;
      for (let i = 0; i < 6; i++) s += next();
      return mean + ((s - 3) / 1.2247) * sd;
    },
  };
}

/** A short, URL-friendly, human-typable seed. */
export function randomSeed(): number {
  // The one legitimate use of an unseeded value: generating a *seed*, before
  // any trace exists. Everything downstream is deterministic from here.
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

export function seedToString(seed: number): string {
  return (seed >>> 0).toString(36);
}

export function seedFromString(s: string): number {
  const n = Number.parseInt(s, 36);
  return Number.isFinite(n) ? n >>> 0 : 1;
}
