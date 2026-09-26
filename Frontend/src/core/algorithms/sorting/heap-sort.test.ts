import { describe, expect, it } from 'vitest';
import { anchorsInTrace } from '../../code/anchors.ts';
import { runEveryPreset, runTrace, validateTrace } from '../../trace/materialise.ts';
import type { Preset } from '../types.ts';
import { heapSortAlgo } from './heap-sort.ts';

const preset = (id: string): Preset => {
  const p = heapSortAlgo.presets.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const run = (id: string) =>
  runTrace(heapSortAlgo, { input: preset(id).input, presetParams: preset(id).params });

const countOf = (id: string, anchor: string): number =>
  run(id).trace.filter((f) => f.anchor === anchor).length;

const siftsOf = (id: string): number => Number(run(id).trace.at(-1)?.vars?.['sifts'] ?? -1);

describe('heap sort', () => {
  it('produces a structurally valid trace on every preset', () => {
    for (const { presetId, result } of runEveryPreset(heapSortAlgo)) {
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
        "No heap yet — just 9 values in a row. Building a max-heap will put the largest value at index 0 and make every parent at least as big as its children at 2i+1 and 2i+2.",
        "Start at index 3, the last index that has any children, and work upwards. That direction is what makes the build linear: every node below has already been repaired, so each sift-down only walks a subtree that was already a heap. 4 of 4 nodes done.",
        "Sift the value at index 3 (15) down. It is too small to sit above its children, so it has to keep moving until it reaches a leaf or until the children turn out to be smaller.",
        "The children of index 3 are at 2·3+1 = 7 and 2·3+2 = 8. Both are inside the live heap, so the bigger of them is the candidate to lift above 15.",
        "Left child 44 at index 7, right child 20 at index 8. 44 is the bigger of the two, so the candidate stays on the left. The parent 15 now has to beat index 7.",
        "Swap. 44 rises from index 7 to index 3, and 15 drops into the child's slot. 15 may still be too big down there, so the sift continues from index 7.",
      ]
    `);
  });

  it('ends on a fully sorted array on every preset', () => {
    for (const { presetId, result } of runEveryPreset(heapSortAlgo)) {
      const last = result.trace.at(-1);
      expect(last?.result, `preset ${presetId}`).toBe('sorted');
      const values = (last as { values: number[] }).values;
      expect(values, `preset ${presetId}`).toEqual([...values].sort((a, b) => a - b));
      // The last value left in the heap was the smallest of everything.
      expect(last?.vars?.['heapSize']).toBe(1);
    }
  });

  it('does the same structural work on every input', () => {
    // n = 9, so the build phase sifts the 4 nodes that have children (indices
    // 3, 2, 1, 0) and the extraction phase runs n - 1 = 8 times. Neither count
    // depends on the data — that is the guaranteed O(n log n). Only the *depth*
    // of each sift varies, which is the next test.
    for (const p of heapSortAlgo.presets) {
      expect(countOf(p.id, 'build-heap'), `preset ${p.id}`).toBe(4);
      expect(countOf(p.id, 'extract'), `preset ${p.id}`).toBe(8);
    }
  });

  it('already-sorted input is the *worst* case, not the best', () => {
    // The counter-intuitive result, and the reason the preset exists. Building a
    // max-heap from ascending data is trivial — the parent is already the
    // largest, so no sift-down finds anything to fix — but every extraction then
    // swaps in the smallest remaining value, which has to travel to the bottom
    // of the heap. Reversed data does the opposite: expensive to build, cheap to
    // drain. 18 downward swaps against 12.
    expect(siftsOf('sorted')).toBe(18);
    expect(siftsOf('reverse')).toBe(12);
    expect(siftsOf('sorted')).toBeGreaterThan(siftsOf('reverse'));
    expect(siftsOf('sorted')).toBeGreaterThan(siftsOf('random'));
    expect(run('sorted').count).toBeGreaterThan(run('reverse').count);
  });

  it('marks the live heap and the subtree being sifted on every sift frame', () => {
    // The two highlight groups the visualisation is built around. If either goes
    // missing the sift becomes unreadable: without `sorted` the student cannot
    // see where the heap ends, and without `compare` they cannot see which
    // subtree the sift can still touch.
    for (const p of heapSortAlgo.presets) {
      for (const frame of run(p.id).trace) {
        if (frame.anchor !== 'sift' && frame.anchor !== 'compare') continue;
        expect(frame.highlight?.['sorted']?.length, `${p.id}/${frame.anchor}`).toBeGreaterThan(0);
        expect(frame.highlight?.['compare']?.length, `${p.id}/${frame.anchor}`).toBeGreaterThan(0);
      }
    }
  });

  it('is deterministic: the same input always yields the same trace', () => {
    expect(JSON.stringify(run('random').trace)).toBe(JSON.stringify(run('random').trace));
  });

  it('terminates on degenerate input', () => {
    for (const values of [[], [42], [7, 7]]) {
      const { trace, error, aborted } = runTrace(heapSortAlgo, {
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
      heapSortAlgo,
      { input: preset('random').input },
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
    for (const a of heapSortAlgo.anchors) {
      expect(reachable.has(a), `anchor ${a} is never emitted by the random preset`).toBe(true);
    }
  });
});
