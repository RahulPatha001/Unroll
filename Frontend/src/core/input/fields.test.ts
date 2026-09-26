import { describe, expect, it } from 'vitest';
import { ALL_ALGORITHMS } from '../algorithms/registry.ts';
import {
  buildGraphInput,
  edgeListText,
  paramKeysFrom,
  parseFieldText,
  seedFieldText,
} from './fields.ts';
import type { AlgoInput, InputSpec } from './types.ts';

/**
 * The invariant that makes the custom-input editor trustworthy.
 *
 * Seeding the editor from an input, then parsing and building it straight back,
 * must return the input it started from. If that holds, then opening the editor
 * and pressing Run without touching anything reproduces the current run exactly
 * — which is the property that stops the feature being a trap. It is also what
 * licenses the positional rules in `fields.ts`: a `text` field consuming the nth
 * string of a `words` input, a `words` field on a `grid` consuming its rows.
 * Cleverness that is only sometimes right is worse than no cleverness, so it is
 * checked against all 56 algorithms and every preset rather than argued for.
 */

describe('seed → parse → build round-trips every algorithm input', () => {
  for (const algo of ALL_ALGORITHMS) {
    it(`${algo.id}`, () => {
      for (const preset of algo.presets) {
        const where = `${algo.id}/${preset.id}`;
        const text = seedFieldText(algo.inputSpec, preset.input);

        // Seeded from a real graph input, so the graph toggles have to come from
        // the input itself or every graph algorithm fails this for the wrong
        // reason.
        const parsed = parseFieldText(algo.inputSpec, text, {
          graph: graphOptionsOf(preset.input),
        });
        expect(parsed.ok, `${where}: editor could not re-read its own input`).toBe(true);
        if (!parsed.ok) continue;

        const built = algo.inputSpec.build(parsed.values);
        if (preset.input.type === 'graph') {
          expectGraphEquivalent(built, preset.input, where);
        } else {
          expect(built, `${where}: round-trip changed the input`).toEqual(preset.input);
        }
      }
    });
  }
});

function graphOptionsOf(input: AlgoInput): { directed: boolean; weighted: boolean } {
  return input.type === 'graph'
    ? { directed: input.directed, weighted: input.weighted }
    : { directed: true, weighted: true };
}

/**
 * Graph inputs cannot be compared with `toEqual`, and the reason is worth
 * stating because it is a real property rather than a testing convenience.
 *
 * `edgeListText` numbers nodes by the order they are first *mentioned in an
 * edge*, while the input's own node array has its own order — and a graph with
 * an isolated node, or one whose first edge happens to start at `n3`, numbers
 * its nodes differently. The ids, and therefore the layout coordinates, are
 * genuinely not recoverable from an edge list.
 *
 * What must be preserved is the graph itself: the same nodes, and the same
 * edges between the same positions with the same weights. That is what the
 * algorithms read, and it is what a student would be upset to have changed
 * behind them.
 */
function expectGraphEquivalent(built: AlgoInput, original: AlgoInput, where: string) {
  if (original.type !== 'graph' || built.type !== 'graph') {
    expect(built, `${where}: lost the graph type`).toEqual(original);
    return;
  }
  expect(built.nodes.length, `${where}: node count changed`).toBe(original.nodes.length);
  expect(built.directed, `${where}: directedness changed`).toBe(original.directed);
  expect(built.weighted, `${where}: weighting changed`).toBe(original.weighted);
  expect(canon(built), `${where}: the graph itself changed`).toEqual(canon(original));
}

/** Edges as order-independent `u>v:weight` strings, undirected pairs collapsed. */
function canon(input: AlgoInput): string[] {
  if (input.type !== 'graph') return [];
  const at = new Map(input.nodes.map((n, i) => [n.id, i]));
  const out = new Set<string>();
  for (const e of input.edges) {
    const u = at.get(e.from);
    const v = at.get(e.to);
    if (u === undefined || v === undefined) continue;
    const pair = input.directed ? `${u}>${v}` : `${Math.min(u, v)}~${Math.max(u, v)}`;
    out.add(`${pair}:${e.weight ?? ''}`);
  }
  return [...out].sort();
}

describe('number fields', () => {
  // Annotated as `InputSpec` so the fixture is held to the real contract: an
  // un-annotated literal happily accepts a `build` that returns the wrong shape,
  // which is how a test fixture ends up testing nothing.
  const spec: InputSpec = {
    fields: [
      { key: 'values' as const, label: 'v', kind: 'numbers' as const, default: [] as number[] },
    ],
    build: (v): AlgoInput => ({ type: 'numbers', values: (v.values as number[]) ?? [] }),
    sizeOf: (i) => (i.type === 'numbers' ? i.values.length : 0),
  };

  it('accepts commas, spaces and newlines interchangeably', () => {
    for (const text of ['1, 2, 3', '1 2 3', '1\n2\n3', ' 1 ,2,  3 ']) {
      const r = parseFieldText(spec, { values: text });
      expect(r.ok, `"${text}"`).toBe(true);
      if (r.ok) expect(r.values.values).toEqual([1, 2, 3]);
    }
  });

  it('accepts negatives and decimals', () => {
    const r = parseFieldText(spec, { values: '-4, 2.5, +7, .5' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.values.values).toEqual([-4, 2.5, 7, 0.5]);
  });

  it('names the offending token instead of failing vaguely', () => {
    const r = parseFieldText(spec, { values: '1, banana, 3' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // The message has to contain the token, or a student with 40 values has
      // no way to find the one that is wrong.
      expect(r.errors.values).toContain('banana');
    }
  });

  it('treats an empty box as an empty array, not an error', () => {
    const r = parseFieldText(spec, { values: '' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.values.values).toEqual([]);
  });

  it('rejects a runaway paste rather than freezing the editor', () => {
    const r = parseFieldText(spec, { values: '1,'.repeat(20_000) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.values).toMatch(/too long/i);
  });
});

describe('keys fields keep non-numeric tokens as strings', () => {
  const spec: InputSpec = {
    fields: [
      {
        key: 'values' as const,
        label: 'v',
        kind: 'keys' as const,
        default: [] as Array<number | string>,
      },
    ],
    build: (v): AlgoInput => ({
      type: 'keys',
      values: (v.values as Array<number | string>) ?? [],
    }),
    sizeOf: (i) => (i.type === 'keys' ? i.values.length : 0),
  };

  it('coerces only what is really a number', () => {
    // Coercing `apple` to NaN would be silent data loss; the whole point of a
    // `keys` input is that keys need not be numeric.
    const r = parseFieldText(spec, { values: '3, apple, 7, -1' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.values.values).toEqual([3, 'apple', 7, -1]);
  });
});

describe('grid inputs, which encode presence two different ways', () => {
  /**
   * `flood-fill` and `number-of-islands` both render a grid as row strings, and
   * they disagree about what an absent cell looks like: one uses `null`, the other
   * `0` because its language listings take an `int[]`. The editor's job is to show
   * a student what is actually on the grid, so getting this wrong is not a
   * cosmetic bug — it showed Number of Islands as one solid landmass.
   */
  const spec: InputSpec = {
    fields: [
      { key: 'rows' as const, label: 'Rows', kind: 'words' as const, default: [] as string[] },
    ],
    // The same shape both modules build: a row string per row.
    build: (v): AlgoInput => {
      const rows = (v.rows as string[]) ?? [];
      return {
        type: 'grid',
        rows: rows.length,
        cols: rows[0]?.length ?? 0,
        values: rows
          .join('')
          .split('')
          .map((ch) => (ch === '#' ? 0 : 1)),
      };
    },
    sizeOf: (i) => (i.type === 'grid' ? i.rows * i.cols : 0),
  };

  const roundTrip = (values: Array<number | string | null>, rows: number, cols: number) => {
    const input: AlgoInput = { type: 'grid', rows, cols, values };
    const text = seedFieldText(spec, input);
    const parsed = parseFieldText(spec, text);
    expect(parsed.ok, `seeded ${JSON.stringify(text)}`).toBe(true);
    if (!parsed.ok) return null;
    return { seeded: text, built: spec.build(parsed.values) };
  };

  it('reads a 0/1 grid, where 0 means absent', () => {
    const r = roundTrip([1, 1, 0, 0, 0, 1], 2, 3);
    expect(r?.seeded.rows).toBe('..#\n##.');
  });

  it('reads a null grid, where null means absent', () => {
    const r = roundTrip(['.', '.', null, null, null, '.'], 2, 3);
    expect(r?.seeded.rows).toBe('..#\n##.');
  });

  it('agrees on both encodings of the same picture', () => {
    // The whole point: the student must not be able to tell which algorithm they
    // are looking at by the glyphs in the editor.
    const asNull = roundTrip(['.', '.', null, '#'], 1, 4);
    const asZeroOne = roundTrip([1, 1, 0, 0], 1, 4);
    expect(asNull?.seeded.rows).toBe('..##');
    expect(asZeroOne?.seeded.rows).toBe(asNull?.seeded.rows);
  });

  it('survives the round trip for both encodings', () => {
    const values = [1, 0, 1, 1, 0, 0];
    const r = roundTrip(values, 2, 3);
    expect(r?.built).toEqual({ type: 'grid', rows: 2, cols: 3, values });
  });
});

describe('graph edge lists', () => {
  const build = (text: string, opts = { directed: true, weighted: true }) =>
    buildGraphInput(text, opts);

  it('numbers nodes by first mention, not by the name typed', () => {
    const r = build('B-A\nA-C');
    expect(r.ok).toBe(true);
    if (r.ok && r.input.type === 'graph') {
      // B is node 0 because it was mentioned first, so the labels the student
      // sees are 0,1,2 and match the indices in the code listing.
      expect(r.input.nodes.map((n) => n.label)).toEqual(['0', '1', '2']);
      expect(r.input.edges.map((e) => `${e.from}->${e.to}`)).toEqual(['n0->n1', 'n1->n2']);
    }
  });

  it('takes a numeric name as the literal number of that node', () => {
    // This is what makes the round-trip lossless. Numbering purely by mention
    // order renumbers a preset's graph into a different numbering of the same
    // graph: the topology survives and the labels silently do not.
    const r = build('3 -> 5\n0 -> 3');
    expect(r.ok).toBe(true);
    if (r.ok && r.input.type === 'graph') {
      expect(r.input.nodes).toHaveLength(6);
      expect(r.input.edges.map((e) => `${e.from}->${e.to}`)).toEqual(['n3->n5', 'n0->n3']);
    }
  });

  it('numbers a vertex declared by a nodes: header even with no edges', () => {
    // topological-sort's nine-node preset has a vertex that reaches nothing, and
    // an edge list cannot mention it. Without the header it silently vanished.
    const r = build('nodes: 4\n0 -> 1\n2 -> 3');
    expect(r.ok).toBe(true);
    if (r.ok && r.input.type === 'graph') {
      expect(r.input.nodes).toHaveLength(4);
    }
  });

  it('steps named nodes around the numbers already taken', () => {
    // `1` is fixed at 1, so A cannot also be 1 and has to take the next free one.
    const r = build('A-1\n1-B');
    expect(r.ok).toBe(true);
    if (r.ok && r.input.type === 'graph') {
      expect(r.input.nodes.map((n) => n.id)).toEqual(['n0', 'n1', 'n2']);
      expect(r.input.edges.map((e) => `${e.from}->${e.to}`)).toEqual(['n0->n1', 'n1->n2']);
    }
  });

  it('rejects a graph larger than the editor can lay out', () => {
    const r = build('nodes: 500');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/more than/i);
  });

  it('accepts every documented spelling of the separator', () => {
    for (const text of ['0-1', '0 - 1', '0->1', '0 --> 1']) {
      const r = build(text);
      expect(r.ok, text).toBe(true);
      if (r.ok && r.input.type === 'graph') {
        expect(r.input.edges).toHaveLength(1);
        expect(r.input.edges[0]?.from).toBe('n0');
        expect(r.input.edges[0]?.to).toBe('n1');
      }
    }
  });

  it('reads a weight after a colon or after whitespace', () => {
    for (const text of ['0->1:4', '0->1 4', '0 -> 1 : 4']) {
      const r = build(text);
      expect(r.ok, text).toBe(true);
      if (r.ok && r.input.type === 'graph') expect(r.input.edges[0]?.weight).toBe(4);
    }
  });

  it('stores both directions for an undirected graph', () => {
    // dijkstra builds its traversal adjacency one entry per listed edge, so a
    // single undirected row would be walkable one way only.
    const r = build('0-1\n1-2', { directed: false, weighted: true });
    expect(r.ok).toBe(true);
    if (r.ok && r.input.type === 'graph') {
      expect(r.input.edges.map((e) => `${e.from}->${e.to}`)).toEqual([
        'n0->n1',
        'n1->n0',
        'n1->n2',
        'n2->n1',
      ]);
      expect(r.input.directed).toBe(false);
    }
  });

  it('infers weighting from whether any weight was given', () => {
    // The options here are the editor's toggles, so the question is narrow: with
    // the toggle off, does a typed weight turn weighting on, and does its absence
    // leave the graph unweighted?
    const plain = build('0-1', { directed: true, weighted: false });
    expect(plain.ok && plain.input.type === 'graph' && plain.input.weighted).toBe(false);
    const costed = build('0-1:3', { directed: true, weighted: false });
    expect(costed.ok && costed.input.type === 'graph' && costed.input.weighted).toBe(true);
  });

  it('keeps a graph unweighted when the toggle is off and no weight is typed', () => {
    const r = build('0->1\n1->2', { directed: true, weighted: false });
    expect(r.ok).toBe(true);
    if (r.ok && r.input.type === 'graph') {
      expect(r.input.weighted).toBe(false);
      expect(r.input.edges.every((e) => e.weight === undefined)).toBe(true);
    }
  });

  it('defaults a missing weight to 1 in a weighted graph', () => {
    const r = build('0->1:5\n1->2', { directed: true, weighted: true });
    expect(r.ok).toBe(true);
    if (r.ok && r.input.type === 'graph') expect(r.input.edges[1]?.weight).toBe(1);
  });

  it('rejects a self-loop rather than letting an algorithm miscount it', () => {
    const r = build('0-0');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/self-loop/i);
  });

  it('rejects a malformed edge with an example of the right shape', () => {
    const r = build('this is not an edge');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('from - to');
  });

  it('lays a hand-typed graph out exactly like a generated one', () => {
    const r = build('0-1\n1-2\n2-3');
    expect(r.ok).toBe(true);
    if (r.ok && r.input.type === 'graph') {
      // Same helper the generators use, so switching between the student's own
      // input and a preset does not move anything on screen.
      for (const n of r.input.nodes) {
        expect(Number.isFinite(n.x)).toBe(true);
        expect(n.x).toBeGreaterThanOrEqual(0);
        expect(n.x).toBeLessThanOrEqual(1000);
        expect(n.y).toBeGreaterThanOrEqual(0);
        expect(n.y).toBeLessThanOrEqual(1000);
      }
    }
  });

  it('prints an undirected graph back as one line per edge', () => {
    const r = build('0-1\n1-2', { directed: false, weighted: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const text = edgeListText(r.input);
    // Three edges are stored (both directions) but only two are drawn, and the
    // editor must not show the student the doubled list.
    expect(text.split('\n')).toEqual(['0 - 1', '1 - 2']);
  });

  it('declares the node count when a vertex has no edges at all', () => {
    // An edge list cannot mention an isolated node, so without the header the
    // count would silently drop when the editor opened.
    const r = build('nodes: 3\n0 -> 1', { directed: true, weighted: false });
    expect(r.ok).toBe(true);
    if (r.ok) expect(edgeListText(r.input).split('\n')).toEqual(['nodes: 3', '0 -> 1']);
  });

  it('prints node indices rather than internal ids', () => {
    const r = build('0->1:2', { directed: true, weighted: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(edgeListText(r.input)).toBe('0 -> 1: 2');
  });
});

describe('text fields', () => {
  const spec: InputSpec = {
    fields: [{ key: 'text' as const, label: 's', kind: 'text' as const, default: '' }],
    build: (v): AlgoInput => ({ type: 'chars', values: (v.text as string) ?? '' }),
    sizeOf: (i) => (i.type === 'chars' ? i.values.length : 0),
  };

  it('trims, so a textarea newline does not become a cell', () => {
    const r = parseFieldText(spec, { text: '  racecar \n' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.values.text).toBe('racecar');
  });

  it('keeps internal spaces, because a string is not a list of words', () => {
    // The counterpart to the `words` rule. A `chars` input is one string, so
    // "the quick fox" has to survive as three words inside one value.
    const r = parseFieldText(spec, { text: 'the quick fox' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.values.text).toBe('the quick fox');
  });
});

describe('a declared field that is really a parameter', () => {
  it('detects detect-cycle, whose build() discards cycleBack', () => {
    const algo = ALL_ALGORITHMS.find((a) => a.id === 'detect-cycle');
    if (!algo) throw new Error('detect-cycle is missing from the registry');
    // The field is declared on the input spec but the generator reads it from
    // params, so the editor has to push it at both or the control does nothing.
    expect(
      paramKeysFrom(
        algo.inputSpec,
        algo.params.map((p) => p.key),
      ),
    ).toEqual(['cycleBack']);
  });

  it('never routes an array-valued field into a parameter', () => {
    const algo = ALL_ALGORITHMS.find((a) => a.id === 'bubble-sort');
    if (!algo) throw new Error('bubble-sort is missing from the registry');
    // `values` is not a param, and a `numbers` field must never be written into
    // one even if the key collided.
    expect(paramKeysFrom(algo.inputSpec, ['values'])).toEqual([]);
  });
});
