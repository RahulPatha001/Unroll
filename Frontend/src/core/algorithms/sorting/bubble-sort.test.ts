import { describe, expect, it } from 'vitest';
import { anchorsInTrace } from '../../code/anchors.ts';
import { runEveryPreset, runTrace, validateTrace } from '../../trace/materialise.ts';
import type { Preset } from '../types.ts';
import { bubbleSortAlgo } from './bubble-sort.ts';

const preset = (id: string): Preset => {
  const p = bubbleSortAlgo.presets.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const run = (id: string) => runTrace(bubbleSortAlgo, { input: preset(id).input });

describe('bubble sort — the reference module', () => {
  it('produces a structurally valid trace on every preset', () => {
    for (const { presetId, result } of runEveryPreset(bubbleSortAlgo)) {
      expect(validateTrace(result.trace), `preset ${presetId}`).toEqual([]);
      expect(result.trace.length).toBeGreaterThan(0);
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
        "Nothing is sorted yet, so the unsorted region is the whole array. Pass 1 will compare 7 adjacent pairs.",
        "Pass 1 begins. Compare the first 7 adjacent pairs; the last 0 values are already home.",
        "Compare 12 and 17. In order already — leave them.",
        "12 <= 17, so leave them alone. Nothing has moved in this pass yet — if that stays true until the pass ends, the early exit fires.",
        "Compare 17 and 95. In order already — leave them.",
        "17 <= 95, so leave them alone. Nothing has moved in this pass yet — if that stays true until the pass ends, the early exit fires.",
      ]
    `);
  });

  it('ends on a fully sorted array on every preset', () => {
    for (const { presetId, result } of runEveryPreset(bubbleSortAlgo)) {
      const last = result.trace[result.trace.length - 1];
      expect(last?.result, `preset ${presetId}`).toBe('sorted');
      const values = (last as { values: number[] }).values;
      expect(values, `preset ${presetId}`).toEqual([...values].sort((a, b) => a - b));
    }
  });

  it('frame count is proportional to the comparisons it performed', () => {
    // Reverse-sorted input is the worst case: every comparison swaps and the
    // early exit never fires. Nearly-sorted input fires the early exit on pass
    // one. If these two ever converge, the worst case has regressed.
    const reverse = run('reverse');
    const nearly = run('nearly-sorted');
    expect(reverse.count).toBeGreaterThan(nearly.count * 2);
    expect(reverse.truncated).toBe(false);
    expect(nearly.truncated).toBe(false);
  });

  it('is deterministic: the same input always yields the same trace', () => {
    expect(JSON.stringify(run('random').trace)).toBe(JSON.stringify(run('random').trace));
  });

  it('terminates on degenerate input', () => {
    const { trace, error } = runTrace(bubbleSortAlgo, { input: { type: 'numbers', values: [] } });
    expect(error).toBeUndefined();
    expect(trace.length).toBeGreaterThan(0);
  });

  it('handles a single element', () => {
    const { trace, error } = runTrace(bubbleSortAlgo, { input: { type: 'numbers', values: [42] } });
    expect(error).toBeUndefined();
    expect(trace[trace.length - 1]?.result).toBe('sorted');
  });

  it('stops when asked to', () => {
    // `runTrace` polls `shouldStop` between frames, which is exactly how the
    // app's worker cancels a runaway algorithm.
    let calls = 0;
    const result = runTrace(
      bubbleSortAlgo,
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
    for (const a of bubbleSortAlgo.anchors) {
      expect(reachable.has(a), `anchor ${a} is never emitted`).toBe(true);
    }
  });

  it('reaches the early exit only when a pass swaps nothing', () => {
    const nearly = run('nearly-sorted');
    const reverse = run('reverse');
    expect(anchorsInTrace(nearly.trace)).toContain('early-exit');
    expect(anchorsInTrace(reverse.trace)).not.toContain('early-exit');
  });
});
