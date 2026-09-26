import { describe, expect, it } from 'vitest';
import { anchorsInTrace } from '../../code/anchors.ts';
import { runEveryPreset, runTrace, validateTrace } from '../../trace/materialise.ts';
import type { Preset } from '../types.ts';
import { insertionSortAlgo } from './insertion-sort.ts';

const preset = (id: string): Preset => {
  const p = insertionSortAlgo.presets.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const run = (id: string) =>
  runTrace(insertionSortAlgo, { input: preset(id).input, presetParams: preset(id).params });

/** `ops` on the final frame is the comparison count; `shifts` the write count. */
const final = (id: string): { ops: number; shifts: number } => {
  const last = run(id).trace.at(-1);
  return { ops: Number(last?.vars?.['ops'] ?? -1), shifts: Number(last?.vars?.['shifts'] ?? -1) };
};

describe('insertion sort', () => {
  it('produces a structurally valid trace on every preset', () => {
    for (const { presetId, result } of runEveryPreset(insertionSortAlgo)) {
      expect(validateTrace(result.trace), `preset ${presetId}`).toEqual([]);
      expect(result.trace.length).toBeGreaterThan(0);
      expect(result.truncated).toBe(false);
    }
  });

  it('pins the narration for the random preset', () => {
    // A golden narration snapshot. If this changes, the *teaching* changed, not
    // just the implementation — which is exactly the kind of diff a reviewer
    // wants to see rather than absorb.
    expect(
      run('random')
        .trace.slice(0, 6)
        .map((f) => f.note),
    ).toMatchInlineSnapshot(`
      [
        "A single element is sorted by definition, so the sorted prefix starts as index 0. Indices 1 to 8 get inserted one at a time.",
        "Lift 83 out of index 1 and hold it. The prefix 0 to 0 is already sorted, so the job is to slide everything bigger than 83 one place right and drop 83 into the gap.",
        "15 is not bigger than the held 83, so the sorted prefix already ends in the right place and the insertion stops here.",
        "Drop 83 into index 1, the gap. The sorted prefix is now 0 to 1, one element longer, and it is still in order.",
        "Lift 15 out of index 2 and hold it. The prefix 0 to 1 is already sorted, so the job is to slide everything bigger than 15 one place right and drop 15 into the gap.",
        "83 is bigger than the held 15, so it is in the wrong place and must move one step right.",
      ]
    `);
  });

  it('ends on a fully sorted array on every preset', () => {
    for (const { presetId, result } of runEveryPreset(insertionSortAlgo)) {
      const last = result.trace.at(-1);
      expect(last?.result, `preset ${presetId}`).toBe('sorted');
      const values = (last as { values: number[] }).values;
      expect(values, `preset ${presetId}`).toEqual([...values].sort((a, b) => a - b));
    }
  });

  it('costs far more on reversed input than on nearly-sorted input', () => {
    // The reason this algorithm is worth knowing. Best case O(n): every value is
    // already bigger than its left neighbour, so each pass compares once and
    // writes once. Worst case O(n^2): every value walks the whole prefix. If
    // these two ever converge, the early exit that makes insertion sort
    // adaptive has regressed.
    const worst = run('reverse');
    const best = run('nearly-sorted');
    expect(final('reverse').ops).toBe(36);
    expect(final('nearly-sorted').ops).toBe(9);
    expect(worst.count).toBeGreaterThan(best.count * 2);
    expect(final('reverse').shifts).toBeGreaterThan(final('nearly-sorted').shifts * 10);
    // Worst case: every value walks the whole prefix, so the comparison count is
    // 1 + 2 + ... + (n-1) = n(n-1)/2. The *shift* count is one lower, because the
    // very first value of a reversed array lands at index 0 with no shift needed
    // to make room for it.
    const n = lengthOf('reverse');
    expect(final('reverse').shifts).toBe((n * (n - 1)) / 2 - 1);
    expect(worst.truncated).toBe(false);
  });

  it('inserts exactly one value per pass, and the held value is never lost', () => {
    // `pick` and `insert` must pair up one-to-one: every value lifted out of the
    // array is put back, so the multiset is conserved. If `pick` ever outnumbers
    // `insert` the array is silently losing elements.
    for (const p of insertionSortAlgo.presets) {
      expect(countOf(p.id, 'insert'), `preset ${p.id}`).toBe(lengthOf(p.id) - 1);
      expect(countOf(p.id, 'pick'), `preset ${p.id}`).toBe(lengthOf(p.id) - 1);
    }
  });

  it('is deterministic: the same input always yields the same trace', () => {
    expect(JSON.stringify(run('random').trace)).toBe(JSON.stringify(run('random').trace));
  });

  it('terminates on degenerate input', () => {
    for (const values of [[], [42], [7, 7, 7]]) {
      const { trace, error, aborted } = runTrace(insertionSortAlgo, {
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
      insertionSortAlgo,
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
    const reachable = new Set(anchorsInTrace(run('random').trace));
    for (const a of insertionSortAlgo.anchors) {
      expect(reachable.has(a), `anchor ${a} is never emitted by the random preset`).toBe(true);
    }
  });
});

function countOf(id: string, anchor: string): number {
  return run(id).trace.filter((f) => f.anchor === anchor).length;
}

function lengthOf(id: string): number {
  const input = preset(id).input;
  return input.type === 'numbers' ? input.values.length : 0;
}
