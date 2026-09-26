import { describe, expect, it } from 'vitest';
import { anchorsInTrace } from '../../code/anchors.ts';
import { runEveryPreset, runTrace, validateTrace } from '../../trace/materialise.ts';
import type { Preset } from '../types.ts';
import { lowerBoundAlgo } from './lower-bound.ts';

const preset = (id: string): Preset => {
  const p = lowerBoundAlgo.presets.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const run = (id: string) =>
  runTrace(lowerBoundAlgo, { input: preset(id).input, presetParams: preset(id).params });

const countOf = (id: string, anchor: string): number =>
  run(id).trace.filter((f) => f.anchor === anchor).length;

const valuesOf = (id: string): number[] => {
  const input = preset(id).input;
  return input.type === 'numbers' ? input.values : [];
};

const targetOf = (id: string): number => Number(preset(id).params?.['target'] ?? 0);

/** The contract, written independently of the implementation under test. */
const lowerBoundOf = (values: number[], target: number): number => {
  for (let i = 0; i < values.length; i++) if ((values[i] as number) >= target) return i;
  return values.length;
};

describe('lower bound', () => {
  it('produces a structurally valid trace on every preset', () => {
    for (const { presetId, result } of runEveryPreset(lowerBoundAlgo)) {
      expect(validateTrace(result.trace), `preset ${presetId}`).toEqual([]);
      expect(result.trace.length).toBeGreaterThan(0);
      expect(result.truncated).toBe(false);
    }
  });

  it('pins the narration for the exact-hit preset', () => {
    // A golden narration snapshot. If this changes, the *teaching* changed, not
    // just the implementation — which is exactly the kind of diff a reviewer
    // wants to see rather than absorb.
    expect(
      run('exact-hit')
        .trace.slice(0, 6)
        .map((f) => f.note),
    ).toMatchInlineSnapshot(`
      [
        "Looking for the first index whose value is at least 62. The window is the half-open range [0, 12) — note \`high\` starts at 12, not 11, because "past the end" is a legal answer here.",
        "Probe index 6: 61 against a target of 62. 61 is smaller than the target, so the answer must be to its right.",
        "61 is too small, and the array is sorted, so everything up to index 6 is too small too. The answer is after 6: \`low\` moves to 7. The window keeps its right edge and loses its left half.",
        "Probe index 9: 107 against a target of 62. 107 is already big enough, so the answer is at 9 or earlier — this one can be the answer.",
        "107 is big enough, so the answer is at 9 or before it. \`high\` moves to 9 — inclusive, because unlike binary search this index is a *candidate answer* and must not be discarded.",
        "Probe index 8: 97 against a target of 62. 97 is already big enough, so the answer is at 8 or earlier — this one can be the answer.",
      ]
    `);
  });

  it('answers "the first index at least target" on every preset, never -1', () => {
    // The whole contract, and the thing that distinguishes this from binary
    // search. "Not found" is answered with n — a real position at the end of the
    // array — so there is no failure case and nothing to check for a sentinel.
    for (const p of lowerBoundAlgo.presets) {
      const values = valuesOf(p.id);
      const target = targetOf(p.id);
      const result = runTrace(lowerBoundAlgo, { input: p.input, presetParams: p.params });
      const last = result.trace.at(-1);
      const expected = lowerBoundOf(values, target);

      expect(last?.result, `preset ${p.id}`).toBe(expected < values.length ? 'found' : 'not-found');
      expect(Object.values(last?.pointers ?? {}), `preset ${p.id}`).toContain(expected);
      expect(
        lowerBoundAlgo.expectations.find((e) => e.presetId === p.id)?.result,
        `preset ${p.id}`,
      ).toBe(expected);
      // The defining property: a[low - 1] < target <= a[low], so the run of
      // equals is never split.
      if (expected > 0) expect(values[expected - 1], `preset ${p.id}`).toBeLessThan(target);
      if (expected < values.length)
        expect(values[expected], `preset ${p.id}`).toBeGreaterThanOrEqual(target);
    }
  });

  it('splits a run of duplicates at its first element', () => {
    // Fourteen cells, three distinct values, so the value 2 appears five or six
    // times consecutively. Lower bound returns the *first* of that run every
    // time — the guarantee plain binary search does not give, and the reason
    // `lower_bound(x + 1) - lower_bound(x)` counts the copies of x.
    const values = valuesOf('ties');
    const target = targetOf('ties');
    const copies = values.filter((v) => v === target).length;
    expect(copies, 'the preset needs a real run of duplicates to mean anything').toBeGreaterThan(2);
    // The values are consecutive, so the copies really are one unbroken run.
    expect(values.filter((v) => v === target).join(',')).toBe(
      Array.from({ length: copies }, () => String(target)).join(','),
    );
    expect(values.indexOf(target)).toBe(lowerBoundOf(values, target));
    expect(Object.values(run('ties').trace.at(-1)?.pointers ?? {})).toContain(
      values.indexOf(target),
    );
  });

  it('a miss costs no more than a hit — there is no early exit', () => {
    // The contrast with binary search. Here the loop always runs until the
    // window is empty, so a target below the first element costs the same as one
    // that is present: four probes either way. Only the answer differs.
    const n = valuesOf('exact-hit').length;
    const bound = Math.ceil(Math.log2(n + 1));
    for (const p of lowerBoundAlgo.presets) {
      const ops = Number(run(p.id).trace.at(-1)?.vars?.['ops'] ?? -1);
      expect(ops, `preset ${p.id}`).toBeLessThanOrEqual(bound);
      expect(countOf(p.id, 'compare'), `preset ${p.id}`).toBe(ops);
    }
    expect(Number(run('exact-hit').trace.at(-1)?.vars?.['ops'] ?? -1)).toBe(4);
    expect(Number(run('before-start').trace.at(-1)?.vars?.['ops'] ?? -1)).toBe(4);
    expect(Number(run('past-end').trace.at(-1)?.vars?.['ops'] ?? -1)).toBe(3);
  });

  it('answers 0 below the array and n above it, and both are answers not errors', () => {
    expect(Object.values(run('before-start').trace.at(-1)?.pointers ?? {})).toContain(0);
    expect(Object.values(run('past-end').trace.at(-1)?.pointers ?? {})).toContain(
      valuesOf('past-end').length,
    );
    // The extreme targets are genuinely outside the array, which is what makes
    // these two presets safe rather than accidental.
    expect(targetOf('before-start')).toBeLessThan(Math.min(...valuesOf('before-start')));
    expect(targetOf('past-end')).toBeGreaterThan(Math.max(...valuesOf('past-end')));
  });

  it('is deterministic: the same input always yields the same trace', () => {
    expect(JSON.stringify(run('exact-hit').trace)).toBe(JSON.stringify(run('exact-hit').trace));
  });

  it('terminates on degenerate input', () => {
    for (const values of [[], [42]]) {
      const { trace, error, aborted } = runTrace(lowerBoundAlgo, {
        input: { type: 'numbers', values },
        presetParams: { target: 42 },
      });
      expect(error, `values ${JSON.stringify(values)}`).toBeUndefined();
      expect(aborted).toBe(false);
      expect(validateTrace(trace)).toEqual([]);
      expect(Object.values(trace.at(-1)?.pointers ?? {})).toContain(0);
    }
  });

  it('stops when asked to', () => {
    let calls = 0;
    const result = runTrace(
      lowerBoundAlgo,
      { input: preset('exact-hit').input, presetParams: preset('exact-hit').params },
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
    const reachable = new Set(anchorsInTrace(run('exact-hit').trace));
    for (const a of lowerBoundAlgo.anchors) {
      expect(reachable.has(a), `anchor ${a} is never emitted by the exact-hit preset`).toBe(true);
    }
  });
});
