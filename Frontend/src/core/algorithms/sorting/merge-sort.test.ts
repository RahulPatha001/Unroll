import { describe, expect, it } from 'vitest';
import { anchorsInTrace } from '../../code/anchors.ts';
import { runEveryPreset, runTrace, validateTrace } from '../../trace/materialise.ts';
import type { Preset } from '../types.ts';
import { mergeSortAlgo } from './merge-sort.ts';

const preset = (id: string): Preset => {
  const p = mergeSortAlgo.presets.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const run = (id: string) =>
  runTrace(mergeSortAlgo, { input: preset(id).input, presetParams: preset(id).params });

const countOf = (id: string, anchor: string): number =>
  run(id).trace.filter((f) => f.anchor === anchor).length;

/** One write into the auxiliary buffer — the only work the merge actually does. */
const writesOf = (id: string): number => countOf(id, 'take-left') + countOf(id, 'take-right');

const lengthOf = (id: string): number => {
  const input = preset(id).input;
  return input.type === 'numbers' ? input.values.length : 0;
};

describe('merge sort', () => {
  it('produces a structurally valid trace on every preset', () => {
    for (const { presetId, result } of runEveryPreset(mergeSortAlgo)) {
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
        "One run of 8 values, and one scratch buffer of the same length. Merge sort will halve this range 3 times, so every value is compared about 3 times no matter what the input looks like.",
        "Split [0, 7] at index 3: the left half 4 values (0 to 3) and the right half 4 values (4 to 7). The left half is sorted first, and once it is done, every index below it is final.",
        "Split [0, 3] at index 1: the left half 2 values (0 to 1) and the right half 2 values (2 to 3). The left half is sorted first, and once it is done, every index below it is final.",
        "Split [0, 1] at index 0: the left half 1 value (0 to 0) and the right half 1 value (1 to 1). The left half is sorted first, and once it is done, every index below it is final.",
        "A single value at index 0 is sorted by definition, so the recursion stops here. Every run of length 1 is a base case, and there are n of them.",
        "A single value at index 1 is sorted by definition, so the recursion stops here. Every run of length 1 is a base case, and there are n of them.",
      ]
    `);
  });

  it('ends on a fully sorted array on every preset', () => {
    for (const { presetId, result } of runEveryPreset(mergeSortAlgo)) {
      const last = result.trace.at(-1);
      expect(last?.result, `preset ${presetId}`).toBe('sorted');
      const values = (last as { values: number[] }).values;
      expect(values, `preset ${presetId}`).toEqual([...values].sort((a, b) => a - b));
    }
  });

  it('costs exactly the same on every input of a given size — that is the point', () => {
    // The guarantee that distinguishes merge sort from every other sort here.
    // For n = 8 the merges write 8 * log2(8) = 24 values into the buffer however
    // the input is arranged; the three n = 8 presets are sorted, reversed and
    // random data and all three cost exactly that. Note the *frame* counts differ
    // slightly (the drain loops skip a comparison frame when one half is already
    // spent), which is why the invariant is asserted on the writes and not on the
    // animation length.
    const eight = mergeSortAlgo.presets.filter((p) => lengthOf(p.id) === 8);
    expect(eight.length).toBeGreaterThanOrEqual(3);
    for (const p of eight) {
      expect(writesOf(p.id), `preset ${p.id}`).toBe(24);
      expect(Number(run(p.id).trace.at(-1)?.vars?.['ops'] ?? -1), `preset ${p.id}`).toBe(24);
    }
    // Cost tracks n, not the data: the n = 9 preset writes more than any of them.
    const bigger = mergeSortAlgo.presets.filter((p) => lengthOf(p.id) > 8);
    expect(bigger.length).toBeGreaterThan(0);
    for (const p of bigger) expect(writesOf(p.id), `preset ${p.id}`).toBeGreaterThan(24);
  });

  it('splits every range down to single elements, once per element', () => {
    // The recursion shape is a function of n alone: n base cases (one per
    // element) and n - 1 internal nodes, each of which splits once and copies
    // its result back once.
    for (const p of mergeSortAlgo.presets) {
      const n = lengthOf(p.id);
      expect(countOf(p.id, 'base-case'), `preset ${p.id}`).toBe(n);
      expect(countOf(p.id, 'split'), `preset ${p.id}`).toBe(n - 1);
      expect(countOf(p.id, 'merge'), `preset ${p.id}`).toBe(n - 1);
      expect(countOf(p.id, 'copy-back'), `preset ${p.id}`).toBe(n - 1);
    }
  });

  it('shows the auxiliary buffer on every single frame', () => {
    // The overlay is what makes merge sort legible: the array is frozen while
    // the scratch row fills, and the copy-back is visible as the two rows
    // converging. A frame without it would be a recursion diagram instead of a
    // data movement a student can count.
    for (const { presetId, result } of runEveryPreset(mergeSortAlgo)) {
      const withOverlay = result.trace.filter((f) => 'overlay' in f && f.overlay);
      expect(withOverlay.length, `preset ${presetId}`).toBe(result.trace.length);
      for (const f of withOverlay) {
        const overlay = (f as { overlay?: { label: string; values: number[] } }).overlay;
        expect(overlay?.label, `preset ${presetId}`).toContain('aux');
        // The scratch buffer is exactly as long as the array, once per element.
        expect(overlay?.values.length, `preset ${presetId}`).toBe(lengthOf(presetId));
      }
    }
  });

  it('is deterministic: the same input always yields the same trace', () => {
    expect(JSON.stringify(run('random').trace)).toBe(JSON.stringify(run('random').trace));
  });

  it('terminates on degenerate input', () => {
    for (const values of [[], [42], [7, 7, 7]]) {
      const { trace, error, aborted } = runTrace(mergeSortAlgo, {
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
      mergeSortAlgo,
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
    for (const a of mergeSortAlgo.anchors) {
      expect(reachable.has(a), `anchor ${a} is never emitted by the random preset`).toBe(true);
    }
  });
});
