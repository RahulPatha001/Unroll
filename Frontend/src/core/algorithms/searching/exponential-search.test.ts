import { describe, expect, it } from 'vitest';
import { anchorsInTrace } from '../../code/anchors.ts';
import { runEveryPreset, runTrace, validateTrace } from '../../trace/materialise.ts';
import type { Preset } from '../types.ts';
import { exponentialSearchAlgo } from './exponential-search.ts';

const preset = (id: string): Preset => {
  const p = exponentialSearchAlgo.presets.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const run = (id: string) =>
  runTrace(exponentialSearchAlgo, { input: preset(id).input, presetParams: preset(id).params });

const countOf = (id: string, anchor: string): number =>
  run(id).trace.filter((f) => f.anchor === anchor).length;

const valuesOf = (id: string): number[] => {
  const input = preset(id).input;
  return input.type === 'numbers' ? input.values : [];
};

const targetOf = (id: string): number => Number(preset(id).params?.['target'] ?? 0);

describe('exponential search', () => {
  it('produces a structurally valid trace on every preset', () => {
    for (const { presetId, result } of runEveryPreset(exponentialSearchAlgo)) {
      expect(validateTrace(result.trace), `preset ${presetId}`).toEqual([]);
      expect(result.trace.length).toBeGreaterThan(0);
      expect(result.truncated).toBe(false);
    }
  });

  it('pins the narration for the hit-at-front preset', () => {
    // A golden narration snapshot. If this changes, the *teaching* changed, not
    // just the implementation — which is exactly the kind of diff a reviewer
    // wants to see rather than absorb.
    expect(
      run('hit-at-front')
        .trace.slice(0, 6)
        .map((f) => f.note),
    ).toMatchInlineSnapshot(`
      [
        "Looking for 21 in 13 sorted values without being told n in advance. Start at index 1 and double: each step covers twice as much ground as the last, so the number of comparisons is driven by *where the answer is*, not by how long the array is.",
        "Probe index 1: 18 against a target of 21. Still too small, and because the array is sorted everything up to here is too small — double the bound.",
        "The doubling loop stopped at bound 2, so the target — if it exists — is in [1, 2]: everything below 1 was measured as too small, and index 2 is the first cell measured as big enough (or the end of the array). That window is at most 2 cells wide, and now ordinary binary search finishes it.",
        "Bisect [1, 2] at index 1: 18 against a target of 21. Too small — discard the left half.",
        "Bisect [2, 2] at index 2: 21 against a target of 21. Equal.",
        "21 equals the target at index 2, so the search returns 2: 1 doubling step to find the window, then 2 bisections inside it. With duplicates this is *a* matching index, not the first one.",
      ]
    `);
  });

  it('reports the index of a match, or -1, matching the expectation', () => {
    for (const p of exponentialSearchAlgo.presets) {
      const result = runTrace(exponentialSearchAlgo, { input: p.input, presetParams: p.params });
      const last = result.trace.at(-1);
      const expected = exponentialSearchAlgo.expectations.find((e) => e.presetId === p.id)?.result;
      expect(expected, `preset ${p.id}`).toBe(valuesOf(p.id).indexOf(targetOf(p.id)));
      if ((expected as number) < 0) {
        expect(last?.result, `preset ${p.id}`).toBe('not-found');
      } else {
        expect(last?.result, `preset ${p.id}`).toBe('found');
        expect(Object.values(last?.pointers ?? {}), `preset ${p.id}`).toContain(expected);
      }
    }
  });

  it('costs more to find a late value than an early one', () => {
    // The defining property, and the reason this algorithm exists. The cost is
    // O(log i) in the *index of the answer*, not in the length of the array: a
    // target three cells in costs three comparisons, one at the far end costs
    // seven. Binary search cannot do this — it always pays for the whole array
    // up front, so its cost is the same whichever end the answer is on.
    const early = Number(run('hit-at-front').trace.at(-1)?.vars?.['ops'] ?? -1);
    const late = Number(run('hit-at-back').trace.at(-1)?.vars?.['ops'] ?? -1);
    expect(early).toBe(3);
    expect(late).toBe(7);
    expect(run('hit-at-front').count).toBeLessThan(run('hit-at-back').count);
    // The two presets are different sizes, which is the point: the early hit is
    // on the *larger* array and still costs less than half as much.
    expect(valuesOf('hit-at-front').length).toBeGreaterThan(valuesOf('hit-at-back').length);
  });

  it('spends its early comparisons doubling and its later ones bisecting', () => {
    // n = 13, so the doubling loop probes 1, 2, 4, 8 and stops when the bound
    // reaches the end of the array. Four probes for a target at the back, one
    // for a target at index 2.
    expect(countOf('hit-at-back', 'double')).toBe(4);
    expect(countOf('hit-at-front', 'double')).toBe(1);
    // Both phases end in a `window` frame, and the bisection that follows is
    // ordinary binary search over a window at most half the bound wide.
    expect(countOf('hit-at-back', 'window')).toBe(1);
    expect(countOf('hit-at-front', 'window')).toBe(1);
  });

  it('stops the doubling loop when it runs out of array, then bisects what is left', () => {
    // A target above every value. The bound walks 1, 2, 4, 8, 16 and the `i < n`
    // half of the condition fails, so the doubling phase ends without ever
    // overshooting the target. `i / 2` is still the last bound measured as too
    // small, so the window [8, 11] is genuinely searched and genuinely empty —
    // which is why the bisection runs three times rather than being skipped.
    expect(countOf('past-end', 'double')).toBe(4);
    expect(countOf('past-end', 'window')).toBe(1);
    expect(countOf('past-end', 'compare')).toBe(3);
    expect(countOf('past-end', 'exhausted')).toBe(1);
    expect(targetOf('past-end')).toBeGreaterThan(Math.max(...valuesOf('past-end')));
    // The terminal frame's note has to say which of the two exits was taken.
    expect(run('past-end').trace.at(-1)?.note).toContain('-1');
  });

  it('is deterministic: the same input always yields the same trace', () => {
    expect(JSON.stringify(run('hit-at-front').trace)).toBe(
      JSON.stringify(run('hit-at-front').trace),
    );
  });

  it('terminates on degenerate input', () => {
    for (const values of [[], [42]]) {
      const { trace, error, aborted } = runTrace(exponentialSearchAlgo, {
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
      exponentialSearchAlgo,
      { input: preset('hit-at-back').input, presetParams: preset('hit-at-back').params },
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
    // Union across every preset: a hit emits `hit` and a miss emits `exhausted`.
    const reachable = new Set(
      exponentialSearchAlgo.presets.flatMap((p) => anchorsInTrace(run(p.id).trace)),
    );
    for (const a of exponentialSearchAlgo.anchors) {
      expect(reachable.has(a), `anchor ${a} is never emitted by any preset`).toBe(true);
    }
  });
});
