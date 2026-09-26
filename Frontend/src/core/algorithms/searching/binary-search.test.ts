import { describe, expect, it } from 'vitest';
import { anchorsInTrace } from '../../code/anchors.ts';
import { runEveryPreset, runTrace, validateTrace } from '../../trace/materialise.ts';
import type { Preset } from '../types.ts';
import { binarySearchAlgo } from './binary-search.ts';

const preset = (id: string): Preset => {
  const p = binarySearchAlgo.presets.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const run = (id: string) =>
  runTrace(binarySearchAlgo, { input: preset(id).input, presetParams: preset(id).params });

const countOf = (id: string, anchor: string): number =>
  run(id).trace.filter((f) => f.anchor === anchor).length;

const valuesOf = (id: string): number[] => {
  const input = preset(id).input;
  return input.type === 'numbers' ? input.values : [];
};

const targetOf = (id: string): number => Number(preset(id).params?.['target'] ?? 0);

describe('binary search', () => {
  it('produces a structurally valid trace on every preset', () => {
    for (const { presetId, result } of runEveryPreset(binarySearchAlgo)) {
      expect(validateTrace(result.trace), `preset ${presetId}`).toEqual([]);
      expect(result.trace.length).toBeGreaterThan(0);
      expect(result.truncated).toBe(false);
    }
  });

  it('pins the narration for the hit-middle preset', () => {
    // A golden narration snapshot. If this changes, the *teaching* changed, not
    // just the implementation — which is exactly the kind of diff a reviewer
    // wants to see rather than absorb.
    expect(
      run('hit-middle')
        .trace.slice(0, 6)
        .map((f) => f.note),
    ).toMatchInlineSnapshot(`
      [
        "Looking for 102 in 12 sorted values. The search space is the whole array, and every probe throws away about half of whatever is left — so this will take at most 4 comparisons, however unlucky the probes are.",
        "The search space is the inclusive range [0, 11] — 12 candidate cells, and \`mid\` starts at 5 by halving it. Every probe from here on throws away one half of this range and recomputes \`mid\` from what is left; nothing else in the function ever changes.",
        "Probe index 5: the value there is 76, against a target of 102. Too small, so the answer — if it exists — is strictly to the right.",
        "76 is smaller than 102, and the array is sorted, so every value up to index 5 is also too small. Discard them and restart at index 6 — not 5, because that one has just been ruled out. The live window is now 6 to 11.",
        "Probe index 8: the value there is 116, against a target of 102. Too big, so the answer — if it exists — is strictly to the left.",
        "116 is bigger than 102, and the array is sorted, so every value from index 8 onwards is also too big. Discard them and restart at index 7. The live window is now 6 to 7 — 2 cells.",
      ]
    `);
  });

  it('reports the index of a match, or -1, matching the expectation', () => {
    for (const p of binarySearchAlgo.presets) {
      const result = runTrace(binarySearchAlgo, { input: p.input, presetParams: p.params });
      const last = result.trace.at(-1);
      const expected = binarySearchAlgo.expectations.find((e) => e.presetId === p.id)?.result;
      expect(expected, `preset ${p.id}`).toBe(valuesOf(p.id).indexOf(targetOf(p.id)));
      if ((expected as number) < 0) {
        expect(last?.result, `preset ${p.id}`).toBe('not-found');
      } else {
        expect(last?.result, `preset ${p.id}`).toBe('found');
        expect(Object.values(last?.pointers ?? {}), `preset ${p.id}`).toContain(expected);
      }
    }
  });

  it('never uses more than ceil(log2(n + 1)) comparisons, on any input', () => {
    // The guarantee. n = 12, so the bound is 4, and every preset comes in at 3
    // or 4 — including the two misses. A miss costs no more than a hit, which is
    // the opposite of linear search and the reason an index beats a scan.
    const n = valuesOf('hit-middle').length;
    const bound = Math.ceil(Math.log2(n + 1));
    expect(bound).toBe(4);
    for (const p of binarySearchAlgo.presets) {
      const ops = Number(run(p.id).trace.at(-1)?.vars?.['ops'] ?? -1);
      expect(ops, `preset ${p.id}`).toBeLessThanOrEqual(bound);
      expect(countOf(p.id, 'compare'), `preset ${p.id}`).toBe(ops);
    }
  });

  it('a lucky hit at the middle beats a miss, and a miss costs the same as the worst hit', () => {
    // The first probe lands on the target, so the search stops after one
    // comparison; a gap or a past-the-end target needs the full halving. Same
    // array size, three comparisons against four.
    expect(Number(run('hit-middle').trace.at(-1)?.vars?.['ops'] ?? -1)).toBe(3);
    expect(Number(run('not-found').trace.at(-1)?.vars?.['ops'] ?? -1)).toBe(4);
    expect(Number(run('past-end').trace.at(-1)?.vars?.['ops'] ?? -1)).toBe(4);
    expect(run('hit-middle').count).toBeLessThan(run('not-found').count);
    expect(run('hit-middle').count).toBeLessThan(run('past-end').count);
  });

  it('halves the window on every probe, and always discards the probed cell', () => {
    // `low = mid + 1` / `high = mid - 1` rather than `mid`: the probed value was
    // just compared and rejected, so it is not a candidate. If either branch
    // kept `mid` the loop would never terminate, and the window sizes below
    // would stop shrinking geometrically.
    for (const p of binarySearchAlgo.presets) {
      const probes = run(p.id).trace.filter((f) => f.anchor === 'compare');
      expect(probes.length, `preset ${p.id}`).toBeGreaterThan(0);
      // The first probe is the baseline: it opens the window at its full size.
      // Every probe *after* it must be strictly narrower than the one before.
      let previous = Number.POSITIVE_INFINITY;
      for (const frame of probes) {
        const low = Number(frame.vars?.['low'] ?? 0);
        const high = Number(frame.vars?.['high'] ?? 0);
        const width = high - low + 1;
        expect(width, `preset ${p.id}`).toBeLessThan(previous);
        previous = width;
      }
    }
  });

  it('is deterministic: the same input always yields the same trace', () => {
    expect(JSON.stringify(run('hit-middle').trace)).toBe(JSON.stringify(run('hit-middle').trace));
  });

  it('terminates on degenerate input', () => {
    for (const values of [[], [42]]) {
      const { trace, error, aborted } = runTrace(binarySearchAlgo, {
        input: { type: 'numbers', values },
        presetParams: { target: 42 },
      });
      expect(error, `values ${JSON.stringify(values)}`).toBeUndefined();
      expect(aborted).toBe(false);
      expect(validateTrace(trace)).toEqual([]);
      expect(trace.at(-1)?.result).toBe(values.length === 0 ? 'not-found' : 'found');
    }
  });

  it('stops when asked to', () => {
    let calls = 0;
    const result = runTrace(
      binarySearchAlgo,
      { input: preset('past-end').input, presetParams: preset('past-end').params },
      {
        shouldStop: () => {
          calls += 1;
          return calls > 3;
        },
      },
    );
    expect(result.aborted).toBe(true);
    expect(result.trace.length).toBeLessThan(10);
  });

  it('declares only anchors that its own code can highlight', () => {
    // Union across every preset: a hit emits `hit` and a miss emits `exhausted`,
    // so neither preset on its own reaches every anchor.
    const reachable = new Set(
      binarySearchAlgo.presets.flatMap((p) => anchorsInTrace(run(p.id).trace)),
    );
    for (const a of binarySearchAlgo.anchors) {
      expect(reachable.has(a), `anchor ${a} is never emitted by any preset`).toBe(true);
    }
  });
});
