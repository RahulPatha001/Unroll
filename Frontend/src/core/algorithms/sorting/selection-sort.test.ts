import { describe, expect, it } from 'vitest';
import { anchorsInTrace } from '../../code/anchors.ts';
import { runEveryPreset, runTrace, validateTrace } from '../../trace/materialise.ts';
import type { Preset } from '../types.ts';
import { selectionSortAlgo } from './selection-sort.ts';

const preset = (id: string): Preset => {
  const p = selectionSortAlgo.presets.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const run = (id: string) =>
  runTrace(selectionSortAlgo, { input: preset(id).input, presetParams: preset(id).params });

/** `ops` on the final frame is the comparison count; `swaps` the write count. */
const final = (id: string): { ops: number; swaps: number } => {
  const last = run(id).trace.at(-1);
  return { ops: Number(last?.vars?.['ops'] ?? -1), swaps: Number(last?.vars?.['swaps'] ?? -1) };
};

const countOf = (id: string, anchor: string): number =>
  run(id).trace.filter((f) => f.anchor === anchor).length;

const lengthOf = (id: string): number => {
  const input = preset(id).input;
  return input.type === 'numbers' ? input.values.length : 0;
};

describe('selection sort', () => {
  it('produces a structurally valid trace on every preset', () => {
    for (const { presetId, result } of runEveryPreset(selectionSortAlgo)) {
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
        "Nothing is settled yet, so the sorted region is empty. Pass 1 will scan all 9 values to find the smallest.",
        "Pass 1 fixes index 0. Scan indices 1 to 8 remembering the smallest, then put it at 0 — the one position that will never be touched again.",
        "Compare 84 with the smallest seen so far, 69. No change — the candidate stays where it is. Nothing is written.",
        "Compare 76 with the smallest seen so far, 69. No change — the candidate stays where it is. Nothing is written.",
        "Compare 14 with the smallest seen so far, 69. 14 wins, so it becomes the candidate. Nothing is written.",
        "14 becomes the new smallest seen so far, so the candidate moves from index 0 to 3. Not one value changed position — only the index being watched did.",
      ]
    `);
  });

  it('ends on a fully sorted array on every preset', () => {
    for (const { presetId, result } of runEveryPreset(selectionSortAlgo)) {
      const last = result.trace.at(-1);
      expect(last?.result, `preset ${presetId}`).toBe('sorted');
      const values = (last as { values: number[] }).values;
      expect(values, `preset ${presetId}`).toEqual([...values].sort((a, b) => a - b));
    }
  });

  it('makes exactly n(n-1)/2 comparisons whatever the input', () => {
    // This is the defining weakness of selection sort: there is no early exit,
    // so the comparison count is a pure function of n — 36 for n = 9, 45 for
    // n = 10 — and identical across every arrangement of the same array. If this
    // ever varied between presets of the same size, an early exit would have
    // crept in and the complexity claim in the module header would be wrong.
    for (const p of selectionSortAlgo.presets) {
      const n = lengthOf(p.id);
      expect(countOf(p.id, 'compare'), `preset ${p.id}`).toBe((n * (n - 1)) / 2);
      expect(final(p.id).ops, `preset ${p.id}`).toBe((n * (n - 1)) / 2);
    }
    // The three n = 9 presets are different data of the same size, and all
    // three cost the same. That is the claim in one comparison.
    const nine = selectionSortAlgo.presets.filter((p) => lengthOf(p.id) === 9);
    expect(nine.length).toBeGreaterThanOrEqual(3);
    for (const p of nine) expect(countOf(p.id, 'compare'), `preset ${p.id}`).toBe(36);
  });

  it('nearly-sorted input collapses the write count, not the comparison count', () => {
    // The trade the algorithm is named for. Nearly-sorted data needs exactly one
    // exchange and seven passes that write nothing; random data needs six. The
    // comparisons are identical either way, which is the previous test's point.
    expect(final('nearly-sorted').swaps).toBe(1);
    expect(countOf('nearly-sorted', 'swap-in')).toBe(1);
    expect(countOf('nearly-sorted', 'no-swap')).toBe(lengthOf('nearly-sorted') - 2);
    expect(final('random').swaps).toBeGreaterThan(final('nearly-sorted').swaps);
  });

  it('settles exactly one position per pass', () => {
    for (const p of selectionSortAlgo.presets) {
      expect(countOf(p.id, 'pass'), `preset ${p.id}`).toBe(lengthOf(p.id) - 1);
      expect(countOf(p.id, 'swap-in') + countOf(p.id, 'no-swap'), `preset ${p.id}`).toBe(
        lengthOf(p.id) - 1,
      );
    }
  });

  it('is deterministic: the same input always yields the same trace', () => {
    expect(JSON.stringify(run('random').trace)).toBe(JSON.stringify(run('random').trace));
  });

  it('terminates on degenerate input', () => {
    for (const values of [[], [42], [7, 7]]) {
      const { trace, error, aborted } = runTrace(selectionSortAlgo, {
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
    // `runTrace` polls `shouldStop` between frames, which is exactly how the
    // app's worker cancels a runaway algorithm.
    let calls = 0;
    const result = runTrace(
      selectionSortAlgo,
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
    for (const a of selectionSortAlgo.anchors) {
      expect(reachable.has(a), `anchor ${a} is never emitted by the random preset`).toBe(true);
    }
  });
});
