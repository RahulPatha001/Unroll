import { describe, expect, it } from 'vitest';
import { anchorsInTrace } from '../../code/anchors.ts';
import { runEveryPreset, runTrace, validateTrace } from '../../trace/materialise.ts';
import type { Preset } from '../types.ts';
import { quickSortAlgo } from './quick-sort.ts';

const preset = (id: string): Preset => {
  const p = quickSortAlgo.presets.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const run = (id: string) =>
  runTrace(quickSortAlgo, { input: preset(id).input, presetParams: preset(id).params });

const countOf = (id: string, anchor: string): number =>
  run(id).trace.filter((f) => f.anchor === anchor).length;

const depthOf = (id: string): number => Number(run(id).trace.at(-1)?.vars?.['maxDepth'] ?? -1);

describe('quick sort — Lomuto, last element as pivot', () => {
  it('produces a structurally valid trace on every preset', () => {
    for (const { presetId, result } of runEveryPreset(quickSortAlgo)) {
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
        "The whole array is one range to partition. Each partition puts one value in its final place and splits the rest in two, so the average depth is log2(9) — but the pivot rule decides whether you get that or something much worse.",
        "Take the last value, 81, as the pivot for [0, 8]. Everything smaller than it will be collected to its left; everything else stays behind it.",
        "Two cursors: \`j\` scans forward from 0, and \`i\` marks the end of the values already moved to the pivot's left. The pivot itself is parked at index 8 and never touched by the scan.",
        "Compare 73 with the pivot 81. It is not bigger, so it belongs on the pivot's left and moves to the collection boundary at index 0.",
        "Swap indices 0 and 0 — the same cell, so nothing actually moves. 73 was already on the pivot's left, and the collection boundary steps on to 1. Lomuto pays this no-op exchange on the first element of every partition.",
        "Compare 73 with the pivot 81. It is not bigger, so it belongs on the pivot's left and moves to the collection boundary at index 1.",
      ]
    `);
  });

  it('ends on a fully sorted array on every preset', () => {
    for (const { presetId, result } of runEveryPreset(quickSortAlgo)) {
      const last = result.trace.at(-1);
      expect(last?.result, `preset ${presetId}`).toBe('sorted');
      const values = (last as { values: number[] }).values;
      expect(values, `preset ${presetId}`).toEqual([...values].sort((a, b) => a - b));
    }
  });

  it('goes n levels deep on already-sorted input', () => {
    // The pathology the last-element pivot rule creates, in one assertion. The
    // pivot is the maximum, so every split is 0 against n - 1, the left half is
    // always empty, and the recursion is a staircase. n = 9, so the depth is
    // exactly n - 1 = 8, against 6 on random data. This is the reason real
    // implementations use median-of-three or introsort.
    expect(depthOf('sorted')).toBe(8);
    expect(depthOf('random')).toBe(6);
    expect(depthOf('sorted')).toBeGreaterThan(depthOf('random'));
    expect(run('sorted').count).toBeGreaterThan(run('random').count);
  });

  it('does the most comparisons on already-sorted input', () => {
    // n = 9: 8 + 7 + ... + 1 = 36 comparisons when every split is degenerate,
    // against 28 when the splits are roughly even. Same input size, same code,
    // 29% more work — which is the whole argument for a better pivot rule.
    expect(Number(run('sorted').trace.at(-1)?.vars?.['ops'] ?? -1)).toBe(36);
    expect(Number(run('random').trace.at(-1)?.vars?.['ops'] ?? -1)).toBe(28);
    expect(countOf('sorted', 'compare')).toBe(36);
  });

  it('places exactly one pivot per partition, and the counts agree', () => {
    for (const p of quickSortAlgo.presets) {
      const partitions = countOf(p.id, 'pivot');
      expect(partitions, `preset ${p.id}`).toBe(countOf(p.id, 'pivot-place'));
      expect(partitions, `preset ${p.id}`).toBe(countOf(p.id, 'recurse-smaller'));
      expect(partitions, `preset ${p.id}`).toBe(countOf(p.id, 'recurse-larger'));
      // One base case per partition (the empty half) plus one for the final
      // single element, so the recursion terminates.
      expect(countOf(p.id, 'base-case'), `preset ${p.id}`).toBe(partitions + 1);
    }
  });

  it('is deterministic: the same input always yields the same trace', () => {
    expect(JSON.stringify(run('random').trace)).toBe(JSON.stringify(run('random').trace));
  });

  it('terminates on degenerate input', () => {
    for (const values of [[], [42], [7, 7]]) {
      const { trace, error, aborted } = runTrace(quickSortAlgo, {
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
      quickSortAlgo,
      { input: preset('sorted').input },
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
    for (const a of quickSortAlgo.anchors) {
      expect(reachable.has(a), `anchor ${a} is never emitted by the random preset`).toBe(true);
    }
  });
});
