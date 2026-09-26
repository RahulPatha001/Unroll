import { describe, expect, it } from 'vitest';
import { anchorsInTrace } from '../../code/anchors.ts';
import { runEveryPreset, runTrace, validateTrace } from '../../trace/materialise.ts';
import type { Preset } from '../types.ts';
import { shellSortAlgo } from './shell-sort.ts';

const preset = (id: string): Preset => {
  const p = shellSortAlgo.presets.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const run = (id: string) =>
  runTrace(shellSortAlgo, { input: preset(id).input, presetParams: preset(id).params });

const countOf = (id: string, anchor: string): number =>
  run(id).trace.filter((f) => f.anchor === anchor).length;

const shiftsOf = (id: string): number => Number(run(id).trace.at(-1)?.vars?.['shifts'] ?? -1);

const lengthOf = (id: string): number => {
  const input = preset(id).input;
  return input.type === 'numbers' ? input.values.length : 0;
};

describe('shell sort', () => {
  it('produces a structurally valid trace on every preset', () => {
    for (const { presetId, result } of runEveryPreset(shellSortAlgo)) {
      expect(validateTrace(result.trace), `preset ${presetId}`).toEqual([]);
      expect(result.trace.length).toBeGreaterThan(0);
      expect(result.truncated).toBe(false);
    }
  });

  it('pins the narration for the hilly preset', () => {
    // A golden narration snapshot. If this changes, the *teaching* changed, not
    // just the implementation — which is exactly the kind of diff a reviewer
    // wants to see rather than absorb. The hilly preset is the one Shell sort
    // was designed for, so its narration is the most representative.
    expect(
      run('hilly')
        .trace.slice(0, 6)
        .map((f) => f.note),
    ).toMatchInlineSnapshot(`
      [
        "Nothing is sorted yet. The gaps 5, 2, 1 will be used in turn, each one an insertion sort over values that far apart.",
        "Gap 5: sort every subsequence of values 5 places apart. The array is now a weave of 5 nearly-sorted runs, which is exactly what makes the final gap-1 pass cheap.",
        "Take 5 from index 5 and insert it into the run of values 5 apart that ends at index 0. Values in between are ignored for now — a later gap handles them.",
        "0 is not bigger than 5, so this subsequence is in order at index 0 and the walk stops.",
        "Land 5 at index 5. Every value at indices 5, 0 and so on down to the run start is now in order for gap 5.",
        "Take 18 from index 6 and insert it into the run of values 5 apart that ends at index 1. Values in between are ignored for now — a later gap handles them.",
      ]
    `);
  });

  it('ends on a fully sorted array on every preset', () => {
    for (const { presetId, result } of runEveryPreset(shellSortAlgo)) {
      const last = result.trace.at(-1);
      expect(last?.result, `preset ${presetId}`).toBe('sorted');
      const values = (last as { values: number[] }).values;
      expect(values, `preset ${presetId}`).toEqual([...values].sort((a, b) => a - b));
    }
  });

  it('runs a fixed gap sequence derived from n, not from the data', () => {
    // The gap sequence is a function of n alone, so the *shape* of the run is
    // fixed: gaps of floor(n/2) halving down to 1, and n - gap insertions in
    // each. n = 10 gives 5, 2, 1 and 5 + 8 + 9 = 22 picks; n = 11 gives the same
    // three gaps and 25. Only the work *inside* each pass varies. This is the
    // structural difference from an adaptive sort like insertion sort, whose loop
    // count depends on the input.
    for (const p of shellSortAlgo.presets) {
      const n = lengthOf(p.id);
      const gaps: number[] = [];
      for (let g = Math.floor(n / 2); g >= 1; g = Math.floor(g / 2)) gaps.push(g);
      expect(countOf(p.id, 'gap'), `preset ${p.id}`).toBe(gaps.length);
      expect(countOf(p.id, 'gap-done'), `preset ${p.id}`).toBe(gaps.length);
      expect(countOf(p.id, 'pick'), `preset ${p.id}`).toBe(
        gaps.reduce((sum, g) => sum + (n - g), 0),
      );
      // The last gap is always 1, which is the plain insertion-sort pass that
      // actually finishes the sort.
      expect(gaps.at(-1), `preset ${p.id}`).toBe(1);
    }
  });

  it('reversed input needs the most shifts of any preset', () => {
    // Reversed data is the worst case: every value has to travel to the far
    // end, and the early gaps still cannot get it there in one stride. The `hilly`
    // and `duplicates` presets both need far fewer writes, which is the payoff
    // the gap sequence buys.
    expect(shiftsOf('reverse')).toBe(13);
    expect(shiftsOf('reverse')).toBeGreaterThan(shiftsOf('random'));
    expect(shiftsOf('reverse')).toBeGreaterThan(shiftsOf('hilly'));
    expect(shiftsOf('reverse')).toBeGreaterThan(shiftsOf('duplicates'));
    expect(run('reverse').count).toBeGreaterThan(run('random').count);
  });

  it('is deterministic: the same input always yields the same trace', () => {
    expect(JSON.stringify(run('hilly').trace)).toBe(JSON.stringify(run('hilly').trace));
  });

  it('terminates on degenerate input', () => {
    for (const values of [[], [42], [7, 7]]) {
      const { trace, error, aborted } = runTrace(shellSortAlgo, {
        input: { type: 'numbers', values },
      });
      expect(error, `values ${JSON.stringify(values)}`).toBeUndefined();
      expect(aborted).toBe(false);
      expect(validateTrace(trace)).toEqual([]);
      expect(trace.at(-1)?.result).toBe('sorted');
      expect((trace.at(-1) as { values: number[] }).values).toEqual(
        [...values].sort((a, b) => a - b),
      );
    }
  });

  it('stops when asked to', () => {
    let calls = 0;
    const result = runTrace(
      shellSortAlgo,
      { input: preset('reverse').input },
      {
        shouldStop: () => {
          calls += 1;
          return calls > 5;
        },
      },
    );
    expect(result.aborted).toBe(true);
    expect(result.trace.length).toBeLessThan(20);
  });

  it('declares only anchors that its own code can highlight', () => {
    const reachable = new Set(anchorsInTrace(run('hilly').trace));
    for (const a of shellSortAlgo.anchors) {
      expect(reachable.has(a), `anchor ${a} is never emitted by the hilly preset`).toBe(true);
    }
  });
});
