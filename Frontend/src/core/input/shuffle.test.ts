import { describe, expect, it } from 'vitest';
import { ALL_ALGORITHMS } from '../algorithms/registry.ts';
import { runTrace } from '../trace/materialise.ts';
import { shuffleInput } from './shuffle.ts';
import type { AlgoGraphEdge, AlgoInput } from './types.ts';

/**
 * "Shuffle" has to change the input, for *every* input type.
 *
 * The version this replaces was a private function in `LessonHeader.tsx` whose
 * switch ended in `default: return input` — a silent no-op that hit every
 * algorithm whose input is not a flat list, so the button did nothing at all on
 * the graph algorithms, on grids and on matrices. It looked enabled. It was
 * enabled. It produced an identical run every time.
 *
 * So the assertions here are mostly "it changed", plus the properties that make
 * a reshuffle honest: the *shape* has to survive, or a reshuffle quietly changes
 * which algorithm you are looking at.
 */

const seed = (n: number) => n * 2654435761;

describe('shuffle changes the input', () => {
  it('replaces a flat array', () => {
    const before: AlgoInput = { type: 'numbers', values: [1, 2, 3, 4, 5, 6, 7, 8] };
    const after = shuffleInput(before, seed(1));
    expect(after).not.toEqual(before);
  });

  it('gives a different result on each call, so the button is not a no-op', () => {
    const before: AlgoInput = { type: 'numbers', values: [1, 2, 3, 4, 5, 6, 7, 8] };
    const a = shuffleInput(before, seed(1));
    const b = shuffleInput(before, seed(2));
    const c = shuffleInput(before, seed(3));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(JSON.stringify(b)).not.toBe(JSON.stringify(c));
  });

  it('is deterministic: the same seed gives the same input', () => {
    // Otherwise a share link that captured a reshuffled run would not reproduce,
    // which is the whole reason the seed is threaded through instead of random.
    const before: AlgoInput = { type: 'numbers', values: [3, 1, 4, 1, 5, 9, 2, 6] };
    expect(shuffleInput(before, seed(7))).toEqual(shuffleInput(before, seed(7)));
  });

  it('covers every input type, and none of them is a no-op', () => {
    // The regression test for the original bug, written as a sweep so a future
    // eighth input shape cannot be added without being listed here.
    const samples: AlgoInput[] = [
      { type: 'numbers', values: [4, 8, 15, 16, 23, 42] },
      { type: 'chars', values: 'racecar' },
      { type: 'words', values: ['the quick fox', 'quick brown fox'] },
      { type: 'keys', values: [1, 5, 10, 25] },
      { type: 'keys', values: ['a', 'bb', 'ccc'] },
      { type: 'tree', values: [8, 3, 10, 1, 6, 14] },
      { type: 'matrix', rows: [0, 1, 2], cols: 2, values: [1, 2, 3, 4, 5, 6] },
      { type: 'grid', rows: 2, cols: 3, values: [1, 0, 1, 0, 1, 0] },
      { type: 'grid', rows: 2, cols: 2, values: ['.', '#', '.', '.'] },
      {
        type: 'graph',
        nodes: [
          { id: 'n0', label: '0', x: 100, y: 100 },
          { id: 'n1', label: '1', x: 200, y: 200 },
          { id: 'n2', label: '2', x: 300, y: 100 },
        ],
        edges: [
          { from: 'n0', to: 'n1', weight: 4, directed: true },
          { from: 'n1', to: 'n2', weight: 2, directed: true },
        ],
        directed: true,
        weighted: true,
      },
      {
        type: 'graph',
        nodes: [
          { id: 'n0', label: '0', x: 100, y: 100 },
          { id: 'n1', label: '1', x: 200, y: 200 },
        ],
        edges: [{ from: 'n0', to: 'n1', weight: 3, directed: false }],
        directed: false,
        weighted: true,
      },
    ];

    for (const sample of samples) {
      const after = shuffleInput(sample, seed(11));
      expect(JSON.stringify(after), `${sample.type} was not reshuffled`).not.toBe(
        JSON.stringify(sample),
      );
    }
  });
});

describe('shuffle preserves the shape', () => {
  it('keeps the element count, so a complexity claim still holds', () => {
    for (const type of ['numbers', 'keys', 'words', 'tree'] as const) {
      const values =
        type === 'numbers'
          ? [1, 2, 3, 4]
          : type === 'keys'
            ? [1, 2, 3, 4]
            : type === 'words'
              ? ['alpha', 'bravo', 'delta']
              : [5, 3, 9, 1];
      const before = { type, values } as AlgoInput;
      const after = shuffleInput(before, seed(3));
      expect(after.type).toBe(type);
      expect((after as { values: unknown[] }).values).toHaveLength(values.length);
    }
  });

  it('keeps a string the same length and on the same alphabet', () => {
    // A palindrome test handed a different length is testing something else.
    const after = shuffleInput({ type: 'chars', values: 'racecar' }, seed(5));
    expect(after.type).toBe('chars');
    expect((after as { values: string }).values).toHaveLength(7);
    expect((after as { values: string }).values).toMatch(/^[a-z]+$/);
  });

  it('keeps a grid the same size and roughly as dense', () => {
    const before: AlgoInput = {
      type: 'grid',
      rows: 3,
      cols: 4,
      values: [1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 0],
    };
    const density = (v: Array<number | string | null>) =>
      v.filter((x) => x !== null && x !== 0).length / v.length;
    for (const s of [1, 2, 3, 4, 5]) {
      const after = shuffleInput(before, seed(s));
      expect(after.type).toBe('grid');
      const a = after as { rows: number; cols: number; values: Array<number | string | null> };
      expect(a.rows).toBe(3);
      expect(a.cols).toBe(4);
      expect(a.values).toHaveLength(12);
      // Density is the lesson in a flood fill, so it must not be reshuffled away.
      expect(Math.abs(density(a.values) - density(before.values))).toBeLessThan(0.3);
    }
  });

  it('changes a grid that is entirely filled, rather than reproducing it', () => {
    // The second no-op, found by checking the *presets* rather than the switch.
    // Drawing each cell with `rng.next() < density` is correct until the density
    // is 0 or 1, and at 1.0 every draw says "filled" — so a fully-open grid came
    // back byte-identical. `flood-fill`'s own first preset is exactly that grid.
    for (let s = 1; s <= 25; s++) {
      const before: AlgoInput = { type: 'grid', rows: 4, cols: 5, values: Array(20).fill(1) };
      const after = shuffleInput(before, seed(s));
      expect(JSON.stringify(after), `seed ${s} was a no-op`).not.toBe(JSON.stringify(before));
    }
  });

  it('changes a grid that is entirely empty', () => {
    for (let s = 1; s <= 25; s++) {
      const before: AlgoInput = { type: 'grid', rows: 3, cols: 3, values: Array(9).fill(0) };
      const after = shuffleInput(before, seed(s));
      expect(JSON.stringify(after), `seed ${s} was a no-op`).not.toBe(JSON.stringify(before));
    }
  });

  it('changes a single-cell grid', () => {
    // `number-of-islands` has a 1x1 preset, and there is only one arrangement of
    // one cell — so this is the degenerate case of the case above.
    const before: AlgoInput = { type: 'grid', rows: 1, cols: 1, values: [1] };
    expect(JSON.stringify(shuffleInput(before, seed(1)))).not.toBe(JSON.stringify(before));
  });

  it('keeps a matrix the same shape', () => {
    const before: AlgoInput = {
      type: 'matrix',
      rows: [0, 1, 2],
      cols: 4,
      values: Array(12).fill(7),
    };
    const after = shuffleInput(before, seed(2));
    expect(after.type).toBe('matrix');
    const a = after as { rows: number[]; cols: number; values: number[] };
    expect(a.rows).toHaveLength(3);
    expect(a.cols).toBe(4);
    expect(a.values).toHaveLength(12);
  });

  it('keeps a tree’s values distinct, so it does not become degenerate', () => {
    const after = shuffleInput({ type: 'tree', values: [8, 3, 10, 1, 6] }, seed(9));
    const values = (after as { values: number[] }).values;
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('shuffle preserves what a graph is', () => {
  const graph = (
    edges: AlgoGraphEdge[],
    directed: boolean,
    weighted = true,
    size = 5,
  ): AlgoInput => ({
    type: 'graph',
    nodes: Array.from({ length: size }, (_, i) => ({
      id: `n${i}`,
      label: String(i),
      x: 100 + i * 50,
      y: 100,
    })),
    edges,
    directed,
    weighted,
  });

  it('keeps the node count, so the drawing is still readable', () => {
    const before = graph([{ from: 'n0', to: 'n1', weight: 2, directed: false }], false);
    const after = shuffleInput(before, seed(4)) as { nodes: unknown[] };
    expect(after.nodes).toHaveLength(5);
  });

  it('keeps the directed and weighted flags', () => {
    for (const directed of [true, false]) {
      for (const weighted of [true, false]) {
        const before = graph([{ from: 'n0', to: 'n1', directed }], directed, weighted);
        const after = shuffleInput(before, seed(6)) as { directed: boolean; weighted: boolean };
        expect(after.directed, `directed=${directed}`).toBe(directed);
        expect(after.weighted, `weighted=${weighted}`).toBe(weighted);
      }
    }
  });

  it('keeps roughly as many edges, so the density lesson survives', () => {
    const before = graph(
      [
        { from: 'n0', to: 'n1', weight: 1, directed: true },
        { from: 'n1', to: 'n2', weight: 2, directed: true },
        { from: 'n2', to: 'n3', weight: 3, directed: true },
      ],
      true,
    );
    const after = shuffleInput(before, seed(8)) as { edges: AlgoGraphEdge[] };
    expect(after.edges).toHaveLength(3);
  });

  it('keeps the weights, because the weights are the point of a weighted graph', () => {
    const before = graph(
      [
        { from: 'n0', to: 'n1', weight: 17, directed: true },
        { from: 'n1', to: 'n2', weight: 4, directed: true },
      ],
      true,
    );
    const after = shuffleInput(before, seed(10)) as { edges: AlgoGraphEdge[] };
    expect(after.edges.map((e) => e.weight).sort((a, b) => (a as number) - (b as number))).toEqual([
      4, 17,
    ]);
  });

  it('never produces a self-loop, which these algorithms do not handle', () => {
    // The custom-input editor rejects a self-loop outright, so a reshuffle that
    // produced one would hand the student an input the app's own parser calls
    // invalid.
    for (let s = 1; s <= 40; s++) {
      const before = graph(
        [
          { from: 'n0', to: 'n1', weight: 1, directed: true },
          { from: 'n1', to: 'n2', weight: 1, directed: true },
        ],
        true,
      );
      const after = shuffleInput(before, seed(s)) as { edges: AlgoGraphEdge[] };
      for (const e of after.edges) expect(e.from, `seed ${s}`).not.toBe(e.to);
    }
  });

  it('keeps an undirected graph undirected, storing both directions', () => {
    // Every module builds traversal adjacency one entry per listed edge, so a
    // single `A-B` row would make the edge walkable one way only.
    //
    // The invariant is that the two stored rows are reverses of *each other* —
    // not that they still involve the original nodes, because rewiring the
    // endpoints is the entire point of a reshuffle.
    const before = graph([{ from: 'n0', to: 'n1', weight: 5, directed: false }], false);
    const after = shuffleInput(before, seed(12)) as { edges: AlgoGraphEdge[] };
    expect(after.edges).toHaveLength(2);
    expect(after.edges.every((e) => e.directed === false)).toBe(true);
    const [a, b] = after.edges as [AlgoGraphEdge, AlgoGraphEdge];
    expect(b.from).toBe(a.to);
    expect(b.to).toBe(a.from);
    expect(b.weight).toBe(a.weight);
  });

  it('keeps a DAG acyclic, so topological sort does not report a cycle', () => {
    // The one structural property a reshuffle must not lose. Rewiring a DAG's edges
    // freely turns it into a graph with cycles, and the preset's entire point is
    // that it is acyclic.
    const before = graph(
      [
        { from: 'n0', to: 'n2', directed: true },
        { from: 'n0', to: 'n3', directed: true },
        { from: 'n1', to: 'n3', directed: true },
        { from: 'n2', to: 'n4', directed: true },
        { from: 'n3', to: 'n4', directed: true },
      ],
      true,
      false,
    );
    for (let s = 1; s <= 60; s++) {
      const after = shuffleInput(before, seed(s)) as { edges: AlgoGraphEdge[] };
      expect(hasCycle(after.edges), `seed ${s} produced a cycle`).toBe(false);
    }
  });

  it('leaves a graph with no edges alone rather than inventing some', () => {
    // There is nothing to rewire, and fabricating an edge would silently give a
    // student an "isolated node" case they did not ask for.
    const before = graph([], true);
    expect(shuffleInput(before, seed(3))).toEqual(before);
  });

  it('leaves a graph with no nodes alone', () => {
    const before: AlgoInput = {
      type: 'graph',
      nodes: [],
      edges: [],
      directed: true,
      weighted: false,
    };
    expect(shuffleInput(before, seed(3))).toEqual(before);
  });
});

describe('a reshuffle is visible in the trace, not just in the input', () => {
  /*
   * The strongest form of the whole bug, and the one worth keeping: a reshuffle
   * can change the input and still leave the animation identical, because the
   * generator may not read the input the way you assumed.
   *
   * That is not hypothetical. `flood-fill` asks "is this cell non-null?", so a
   * reshuffle that wrote `0` for a wall produced a byte-different input and a
   * byte-identical 86-frame trace — the hole it punched was read as open floor and
   * filled. `number-of-islands` asks "is this cell exactly 1?", so the same `0` is
   * water there. The two modules disagree, the input does not say which convention
   * it follows, and the only thing that caught it was running the algorithm.
   */
  it.each(['flood-fill', 'number-of-islands'])('changes the %s trace on every preset', (id) => {
    const algo = ALL_ALGORITHMS.find((a) => a.id === id);
    if (!algo) throw new Error(`${id} is not registered`);

    for (const preset of algo.presets) {
      const shuffled = shuffleInput(preset.input, 2654435761);
      const before = runTrace(algo, { input: preset.input, presetParams: preset.params });
      const after = runTrace(algo, { input: shuffled, presetParams: preset.params });
      const narration = (t: typeof before) => JSON.stringify(t.trace.map((f) => f.note));
      expect(narration(after), `${id}/${preset.id}: the trace did not change`).not.toBe(
        narration(before),
      );
    }
  });

  it('writes a hole both grid algorithms agree is a hole', () => {
    // `null` is the only value `flood-fill` reads as a wall *and* `number-of-islands`
    // reads as water, so it is the only safe way to punch a hole in a numeric grid.
    const allOpen: AlgoInput = { type: 'grid', rows: 2, cols: 3, values: [1, 1, 1, 1, 1, 1] };
    const after = shuffleInput(allOpen, 2654435761) as { values: Array<number | null> };
    expect(after.values.filter((v) => v === null)).toHaveLength(1);
    expect(after.values.filter((v) => v === 1)).toHaveLength(5);
  });
});

/** Independent cycle check, so the property is not asserted by the code that creates it. */
function hasCycle(edges: AlgoGraphEdge[]): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.from) ?? [];
    list.push(e.to);
    adj.set(e.from, list);
  }
  const state = new Map<string, 0 | 1 | 2>();
  const walk = (id: string): boolean => {
    const s = state.get(id) ?? 0;
    if (s === 1) return true;
    if (s === 2) return false;
    state.set(id, 1);
    for (const next of adj.get(id) ?? []) if (walk(next)) return true;
    state.set(id, 2);
    return false;
  };
  return [...new Set(edges.flatMap((e) => [e.from, e.to]))].some(walk);
}
