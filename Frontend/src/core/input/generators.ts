import { makeRng } from './rng.ts';
import type { AlgoGraphEdge, AlgoGraphNode } from './types.ts';
import { graph } from './types.ts';

/**
 * Seeded input generators.
 *
 * Every one of these is a pure function of its seed, which is what makes a
 * shared URL reproduce byte-identical output. Each has a "hard" variant that
 * stresses the algorithm's worst case, because an algorithm visualised only on
 * friendly input teaches the wrong thing — you cannot see why bubble sort is
 * O(n^2) unless you watch it on nearly-sorted and reverse-sorted data.
 */

/** Uniform random integers. The default array input. */
export function randomArray(seed: number, size: number, min = 5, max = 99): number[] {
  const rng = makeRng(seed);
  return Array.from({ length: size }, () => rng.int(min, max));
}

/** Distinct integers, for algorithms that assume uniqueness. */
export function distinctArray(seed: number, size: number, min = 1, max = 200): number[] {
  const rng = makeRng(seed);
  const pool = new Set<number>();
  while (pool.size < Math.min(size, max - min + 1)) pool.add(rng.int(min, max));
  return rng.shuffle([...pool]).slice(0, size);
}

/** Reverse-sorted: the worst case for bubble, insertion, selection and merge. */
export function reversedArray(seed: number, size: number, min = 1, max = 200): number[] {
  return randomArray(seed, size, min, max).sort((a, b) => b - a);
}

/** Already sorted, with a few perturbations: the best case, for contrast. */
export function nearlySortedArray(seed: number, size: number, min = 1, max = 200): number[] {
  const rng = makeRng(seed);
  const a = randomArray(seed, size, min, max).sort((x, y) => x - y);
  const swaps = Math.max(1, Math.floor(size / 10));
  for (let k = 0; k < swaps; k++) {
    const i = rng.int(0, size - 2);
    const t = a[i] as number;
    a[i] = a[i + 1] as number;
    a[i + 1] = t;
  }
  return a;
}

/** Many duplicates: exposes what happens to stability and to `>=` vs `>`. */
export function fewDistinctArray(seed: number, size: number, distinct = 3, min = 1): number[] {
  const rng = makeRng(seed);
  return Array.from({ length: size }, () => rng.int(min, min + distinct - 1));
}

/** Two ascending runs, the classic Shell-sort shape. */
export function hillyArray(_seed: number, size: number): number[] {
  const h = Math.max(2, Math.floor(size / 4));
  return Array.from({ length: size }, (_, i) => (i % h === 0 ? i * 3 : i + (i % 5)));
}

/**
 * An array containing a guaranteed pair summing to `target`, so the
 * "found" path is always reachable regardless of the seed.
 */
export function arrayWithPairSum(seed: number, size: number, target: number): number[] {
  const rng = makeRng(seed);
  const a = randomArray(seed, size, 1, Math.max(2, Math.floor(target / 2)));
  // Guarantee the pair actually exists at distinct indices, whatever the seed.
  const p = rng.int(1, Math.max(1, a.length - 1));
  const left = a[p] as number;
  let right = target - left;
  if (right < 1) right = target - 1;
  a[p] = left;
  a[(p + 1) % a.length] = right;
  return a;
}

/** A random lowercase word, for string algorithms. */
export function randomWord(seed: number, length: number): string {
  const rng = makeRng(seed);
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  let s = '';
  for (let i = 0; i < length; i++) s += alphabet[rng.int(0, alphabet.length - 1)];
  return s;
}

/** A string built from `alphabet` with a guaranteed run of length `runLen`. */
export function stringWithRun(seed: number, length: number, runLen: number): string {
  const rng = makeRng(seed);
  const alphabet = 'abc';
  const chars: string[] = [];
  for (let i = 0; i < length; i++) chars.push(alphabet[rng.int(0, alphabet.length - 1)] as string);
  // Overwrite a window with a single repeated character.
  const start = rng.int(0, Math.max(0, length - runLen - 1));
  for (let i = 0; i < runLen; i++) chars[start + i] = 'a';
  return chars.join('');
}

/** Two strings with a guaranteed common subsequence of `len` characters. */
export function stringPairWithLcs(seed: number, len: number): [string, string] {
  const rng = makeRng(seed);
  const alphabet = 'abcd';
  let core = '';
  for (let i = 0; i < len; i++) core += alphabet[rng.int(0, alphabet.length - 1)];
  const noise = (): string => {
    let s = '';
    for (let i = 0; i < len; i++) s += alphabet[rng.int(0, alphabet.length - 1)];
    return s;
  };
  // Interleave core with noise so a real subsequence of length `len` exists.
  const a = [...core].map((c, i) => (i % 2 === 0 ? c : (noise()[i % len] as string))).join('');
  const b = [...core].map((c, i) => (i % 3 === 0 ? c : (noise()[i % len] as string))).join('');
  return [a, b];
}

/* ------------------------------------------------------------------ *
 * Graphs
 * ------------------------------------------------------------------ */

/**
 * A ring plus a few chords. Connected, planar-looking, and easy to read.
 *
 * The ring guarantees connectivity for any size, which matters: a random graph
 * that happens to be disconnected makes Dijkstra's "unreachable" case the
 * default, which is a distraction rather than a lesson.
 */
export function ringGraph(
  _seed: number,
  size: number,
  directed = true,
  weighted = false,
): {
  nodes: AlgoGraphNode[];
  edges: AlgoGraphEdge[];
} {
  const nodes = circleNodes(size);
  const edges: AlgoGraphEdge[] = [];
  for (let i = 0; i < size; i++) {
    const j = (i + 1) % size;
    const e: AlgoGraphEdge = { from: `n${i}`, to: `n${j}`, directed };
    if (weighted) e.weight = 1 + ((i * 7) % 9);
    edges.push(e);
    if (!directed) {
      const back: AlgoGraphEdge = { from: `n${j}`, to: `n${i}`, directed };
      if (weighted) back.weight = e.weight;
      edges.push(back);
    }
  }
  if (size >= 4) {
    for (let k = 0; k < Math.floor(size / 3); k++) {
      const a = (k * 2) % size;
      const b = (a + 2 + (k % Math.max(1, size - 3))) % size;
      if (a === b) continue;
      const e: AlgoGraphEdge = { from: `n${a}`, to: `n${b}`, directed };
      if (weighted) e.weight = 1 + ((k * 5) % 9);
      edges.push(e);
    }
  }
  return { nodes, edges };
}

/** A directed acyclic graph, laid out in columns so topological sort reads cleanly. */
export function dagGraph(
  seed: number,
  columns: number,
  rows: number,
  weighted = false,
): { nodes: AlgoGraphNode[]; edges: AlgoGraphEdge[] } {
  const rng = makeRng(seed);
  const nodes: AlgoGraphNode[] = [];
  for (let c = 0; c < columns; c++) {
    for (let r = 0; r < rows; r++) {
      nodes.push({
        id: `n${c}_${r}`,
        label: `${c * rows + r}`,
        x: 90 + (c * 820) / Math.max(1, columns - 1),
        y: 90 + (r * 820) / Math.max(1, rows - 1),
      });
    }
  }
  const edges: AlgoGraphEdge[] = [];
  for (let c = 0; c < columns - 1; c++) {
    for (let r = 0; r < rows; r++) {
      // Every node in column c points to one or two in column c+1. Edges only
      // ever go right, which guarantees acyclicity without needing to verify.
      const targets = new Set<number>();
      targets.add(rng.int(0, rows - 1));
      if (rng.next() > 0.55) targets.add(rng.int(0, rows - 1));
      for (const t of targets) {
        const e: AlgoGraphEdge = { from: `n${c}_${r}`, to: `n${c + 1}_${t}`, directed: true };
        if (weighted) e.weight = rng.int(1, 9);
        edges.push(e);
      }
    }
  }
  return { nodes, edges };
}

/** A random connected undirected graph with integer weights. */
export function weightedGraph(
  seed: number,
  size: number,
): {
  nodes: AlgoGraphNode[];
  edges: AlgoGraphEdge[];
} {
  const rng = makeRng(seed);
  const nodes = circleNodes(size);
  const edges: AlgoGraphEdge[] = [];
  for (let i = 1; i < size; i++) {
    const p = rng.int(0, i - 1);
    edges.push({ from: `n${p}`, to: `n${i}`, directed: false, weight: rng.int(1, 9) });
  }
  const extra = Math.floor(size * 0.7);
  for (let k = 0; k < extra; k++) {
    const a = rng.int(0, size - 1);
    const b = rng.int(0, size - 1);
    if (a === b) continue;
    if (
      edges.some(
        (e) => (e.from === `n${a}` && e.to === `n${b}`) || (e.from === `n${b}` && e.to === `n${a}`),
      )
    ) {
      continue;
    }
    edges.push({ from: `n${a}`, to: `n${b}`, directed: false, weight: rng.int(1, 9) });
  }
  return { nodes, edges };
}

export function circleNodes(size: number, radius = 400, cx = 500, cy = 500): AlgoGraphNode[] {
  return Array.from({ length: size }, (_, i) => {
    const angle = (2 * Math.PI * i) / size - Math.PI / 2;
    return {
      id: `n${i}`,
      label: String(i),
      x: Math.round(cx + radius * Math.cos(angle)),
      y: Math.round(cy + radius * Math.sin(angle)),
    };
  });
}

/** Build an `AlgoInput` graph from parts, applying the shared defaults. */
export function graphInput(
  nodes: AlgoGraphNode[],
  edges: AlgoGraphEdge[],
  opts: { directed?: boolean; weighted?: boolean } = {},
): ReturnType<typeof graph> {
  return graph({
    nodes,
    edges: edges.map((e) => ({ ...e, directed: e.directed ?? opts.directed ?? true })),
    ...(opts.directed === undefined ? {} : { directed: opts.directed }),
    ...(opts.weighted === undefined ? {} : { weighted: opts.weighted }),
  });
}
