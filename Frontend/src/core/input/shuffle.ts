import { makeRng } from './rng.ts';
import type { AlgoGraphEdge, AlgoInput } from './types.ts';

/**
 * "Shuffle" — a different input of the same shape.
 *
 * ## Why this lives in `core/` and takes a seed
 *
 * It used to be a private function in `LessonHeader.tsx` that switched on
 * `input.type` and had a `default: return input` branch. That default is a silent
 * no-op, and it was hit by every algorithm whose input is not a flat list — so
 * **the shuffle button did nothing at all on the six graph algorithms**, on grids
 * and on matrices. It looked enabled, it was enabled, and clicking it produced an
 * identical run every time.
 *
 * Two changes fix that class of bug for good rather than one instance of it:
 *
 *  - the switch is **exhaustive over `AlgoInput`** with no default branch, so
 *    adding an eighth input shape is a compile error instead of another no-op;
 *  - it is pure and takes a seed, so it is testable and still obeys the
 *    `core/` rule that forbids `Math.random`.
 *
 * ## "Same shape" means the parts an algorithm's behaviour depends on
 *
 * Same element count, same flags, same value range. A reshuffle that quietly
 * changed an algorithm's complexity class would be teaching something false: an
 * O(n²) sort handed a 500-element array looks like a different algorithm.
 *
 * The one subtlety is graphs, where the *structure* is a property worth
 * preserving. Rewiring a DAG's edges at random turns it into a graph with cycles,
 * and `topological-sort` would then report a cycle on a preset whose whole point
 * is that it is acyclic. So acyclicity is detected and maintained — see
 * `topoOrder`.
 */

/**
 * A new input of the same shape as `input`, deterministically from `seed`.
 *
 * Two calls with the same seed return the same input, and the caller's seed
 * strategy (a click counter, in the app) decides what "different" means.
 */
export function shuffleInput(input: AlgoInput, seed: number): AlgoInput {
  const rng = makeRng(seed);

  switch (input.type) {
    case 'numbers':
      return {
        ...input,
        values: Array.from({ length: input.values.length }, () => rng.int(5, 99)),
      };

    case 'keys':
      // Keep keys numeric or textual, matching what the algorithm was handed: a
      // `keys` field of coins reshuffled into words would not be the same exercise.
      return {
        ...input,
        values: Array.from({ length: input.values.length }, () =>
          typeof input.values[0] === 'string' ? `key${rng.int(5, 99)}` : rng.int(1, 99),
        ),
      };

    case 'tree':
      // Distinct values, because a BST drawn from ties is a degenerate tree and
      // the rotation presets stop meaning anything.
      return {
        ...input,
        values: rng
          .shuffle(Array.from({ length: input.values.length }, (_, i) => i + 1))
          .slice(0, input.values.length),
      };

    case 'words':
      return { ...input, values: wordsLike(input.values, rng) };

    case 'chars':
      return { ...input, values: charsLike(input.values, rng) };

    case 'grid':
      return { ...input, values: gridLike(input.values, rng) };

    case 'matrix':
      // `rows` is an array of row indices rather than a count, so the shape to
      // preserve is `rows.length` by `cols` — and the value count follows from it.
      return {
        ...input,
        values: Array.from({ length: input.rows.length * input.cols }, () => rng.int(0, 9)),
      };

    case 'graph':
      return shuffleGraph(input, rng);
  }
}

/* ------------------------------------------------------------------ *
 * Shapes
 * ------------------------------------------------------------------ */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

/** Same length, same character set, so a palindrome test is still a real test. */
function charsLike(values: string, rng: ReturnType<typeof makeRng>): string {
  const from = new Set([...values].map((c) => ALPHABET.indexOf(c)).filter((i) => i >= 0));
  const pool = from.size > 0 ? [...from] : [...ALPHABET].map((_, i) => i);
  return [...values].map(() => ALPHABET[rng.pick(pool)] as string).join('');
}

/** Same count, same length range, same "is it a word or a phrase" character. */
function wordsLike(values: string[], rng: ReturnType<typeof makeRng>): string[] {
  return values.map((w) => {
    const len = w.length;
    // Preserve any non-alphabetic character the original used (a space, a dash),
    // because those are frequently the thing being tested.
    const fixed = [...w]
      .map((c, i) => (ALPHABET.includes(c) ? null : { at: i, c }))
      .filter(Boolean) as Array<{
      at: number;
      c: string;
    }>;
    const out: string[] = Array.from({ length: len }, () => ALPHABET[rng.int(0, 25)] as string);
    for (const f of fixed) out[f.at] = f.c;
    return out.join('');
  });
}

/**
 * A grid with the same number of filled cells, in a different arrangement.
 *
 * Density is the lesson in a flood fill or an islands count, so the *count* is
 * preserved exactly and only the arrangement moves.
 *
 * And that is where the first version of this was a no-op all over again. It drew
 * each cell independently with `rng.next() < density`, which is correct until the
 * density is 0 or 1 — at 1.0 every draw is "filled", so a fully-open grid came
 * back byte-identical. `flood-fill`'s own first preset is exactly such a grid, so
 * the button was still dead on the algorithm that opens the app's flood-fill
 * lesson. A probabilistic rule has no way to express "and it must differ".
 *
 * So: choose exactly the same number of cells, but choose *which* ones by
 * shuffling the positions. A uniform grid has only one arrangement, so there the
 * rule has to give — one cell is toggled, which is both a real change and a more
 * interesting input than the one it replaced.
 */
function gridLike(
  values: Array<number | string | null>,
  rng: ReturnType<typeof makeRng>,
): Array<number | string | null> {
  const n = values.length;
  if (n === 0) return values;

  const present = values.map((v) => isPresentCell(v));
  const filledCount = present.filter(Boolean).length;
  const positions = rng.shuffle(values.map((_, i) => i));
  const chosen = new Set(positions.slice(0, filledCount));
  let next = values.map((_, i) => chosen.has(i));

  if (next.every((v, i) => v === present[i])) {
    // Uniform grid: there is no second arrangement, so move exactly one cell.
    const at = rng.int(0, n - 1);
    next = next.map((v, i) => (i === at ? !v : v));
  }

  /*
   * An absent cell is written as `null`, and that is not a style choice.
   *
   * The two grid algorithms in the curriculum disagree about what an absent cell
   * looks like in a numeric grid, and neither is wrong on its own terms:
   *
   *  - `flood-fill` asks `c !== null && c !== undefined` — so **any** number is
   *    open, including `0`.
   *  - `number-of-islands` asks `cells[i] === 1` — so `0` is water.
   *
   * A reshuffle that wrote `0` for a wall therefore left `flood-fill`'s trace
   * byte-identical: the generator read the "wall" as open and filled it. Which is
   * the second version of this bug, and it is why the fix is not "write what the
   * module's own rows use" — there is no way to tell from the input which of the
   * two conventions it follows.
   *
   * `null` is the one value both read as absent, so it is what goes in a hole.
   * On-cells keep the numeric representation they arrived with, which is what
   * `number-of-islands` needs for its `int[]` listings.
   */
  return values.map((v, i) => {
    if (next[i]) return typeof v === 'number' ? v || 1 : '.';
    return typeof v === 'string' ? '#' : null;
  });
}

function isPresentCell(v: number | string | null): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'number') return v !== 0;
  return v !== '#';
}

/* ------------------------------------------------------------------ *
 * Graphs — the case that was silently broken
 * ------------------------------------------------------------------ */

function shuffleGraph(
  input: Extract<AlgoInput, { type: 'graph' }>,
  rng: ReturnType<typeof makeRng>,
): AlgoInput {
  const size = input.nodes.length;
  if (size === 0) return input;

  // One logical edge per drawn edge: an undirected graph stores both directions,
  // and duplicating that work here would halve the apparent edge count.
  const logical = dedupeUndirected(input);
  if (logical.length === 0) return input;

  const order = input.directed && isAcyclic(logical) ? topoOrder(logical, size) : undefined;
  const edges: AlgoGraphEdge[] = [];

  for (const e of logical) {
    const weight = e.weight;
    let from = 0;
    let to = 1;
    /*
     * Pick a fresh pair, never a self-loop. The custom-input editor rejects
     * self-loops outright because these algorithms do not handle them, so
     * producing one here would be handing the student an input the app's own
     * validator calls invalid.
     */
    for (let attempt = 0; attempt < 12; attempt++) {
      if (order) {
        // Earlier → later in a topological order keeps the result acyclic.
        const i = rng.int(0, order.length - 1);
        const j = rng.int(i + 1, order.length - 1);
        from = order[i] as number;
        to = order[j] as number;
      } else {
        from = rng.int(0, size - 1);
        to = rng.int(0, size - 1);
      }
      if (from !== to) break;
    }
    if (from === to) continue;

    const forward: AlgoGraphEdge = {
      from: `n${from}`,
      to: `n${to}`,
      directed: input.directed,
      ...(weight === undefined ? {} : { weight }),
    };
    edges.push(forward);
    if (!input.directed) {
      edges.push({ ...forward, from: `n${to}`, to: `n${from}`, directed: false });
    }
  }

  return {
    type: 'graph',
    nodes: input.nodes.map((n) => ({ ...n })),
    edges,
    directed: input.directed,
    weighted: input.weighted,
  };
}

/** One entry per *drawn* edge, collapsing the two directions of an undirected pair. */
function dedupeUndirected(input: Extract<AlgoInput, { type: 'graph' }>): AlgoGraphEdge[] {
  if (input.directed) return input.edges;
  const seen = new Set<string>();
  const out: AlgoGraphEdge[] = [];
  for (const e of input.edges) {
    const key = e.from < e.to ? `${e.from}~${e.to}` : `${e.to}~${e.from}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/** Kahn's algorithm, used only as a test. Small graphs, so the O(V+E) is free. */
function isAcyclic(edges: AlgoGraphEdge[]): boolean {
  const at = new Map<string, number>();
  const adj = new Map<number, number[]>();
  const indeg = new Map<number, number>();
  const touch = (id: string): number => {
    let i = at.get(id);
    if (i === undefined) {
      i = at.size;
      at.set(id, i);
      adj.set(i, []);
      indeg.set(i, 0);
    }
    return i;
  };
  for (const e of edges) {
    const u = touch(e.from);
    const v = touch(e.to);
    (adj.get(u) as number[]).push(v);
    indeg.set(v, (indeg.get(v) as number) + 1);
  }
  const queue = [...indeg.entries()].filter(([, d]) => d === 0).map(([n]) => n);
  let seen = 0;
  while (queue.length > 0) {
    const u = queue.shift() as number;
    seen += 1;
    for (const v of adj.get(u) as number[]) {
      const d = (indeg.get(v) as number) - 1;
      indeg.set(v, d);
      if (d === 0) queue.push(v);
    }
  }
  return seen === at.size;
}

/**
 * Node indices in a topological order, for rewiring a DAG without breaking it.
 *
 * Falls back to identity order if the input is not actually acyclic, which keeps
 * this total — the caller only uses it when `isAcyclic` said yes, but a helper
 * that can return a permutation unconditionally is easier to reason about.
 */
function topoOrder(edges: AlgoGraphEdge[], size: number): number[] {
  const ids = Array.from({ length: size }, (_, i) => `n${i}`);
  const adj = new Map<number, number[]>();
  const indeg = new Map<number, number>();
  for (let i = 0; i < size; i++) {
    adj.set(i, []);
    indeg.set(i, 0);
  }
  const at = new Map<string, number>(ids.map((id, i) => [id, i]));
  for (const e of edges) {
    const u = at.get(e.from);
    const v = at.get(e.to);
    if (u === undefined || v === undefined) continue;
    (adj.get(u) as number[]).push(v);
    indeg.set(v, (indeg.get(v) as number) + 1);
  }
  const queue = [...indeg.entries()].filter(([, d]) => d === 0).map(([n]) => n);
  const out: number[] = [];
  while (queue.length > 0) {
    const u = queue.shift() as number;
    out.push(u);
    for (const v of adj.get(u) as number[]) {
      const d = (indeg.get(v) as number) - 1;
      indeg.set(v, d);
      if (d === 0) queue.push(v);
    }
  }
  return out.length === size ? out : ids.map((_, i) => i);
}
