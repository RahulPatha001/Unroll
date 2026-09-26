import { describe, expect, it } from 'vitest';
import { styleForKey } from '../../../features/viewport/palette.ts';
import { anchorsInTrace } from '../../code/anchors.ts';
import { runEveryPreset, runTrace, validateTrace } from '../../trace/materialise.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { Preset } from '../types.ts';
import { trappingRainWaterAlgo } from './trapping-rain-water.ts';

/**
 * Per-algorithm tests for Trapping Rain Water.
 *
 * The contract suite looks *down* from the registry, so until this module is
 * registered in `registry.ts` nothing up there can see it. Everything that would
 * normally be checked globally is therefore checked locally here: structural
 * validity, the same-frame colour rule, and every declared anchor being
 * reachable. Only the "unregistered module" failure in `contract.test.ts` is
 * expected to fail in the meantime, and it is not this file's business.
 *
 * The checks that matter most are the last two. Four language listings that all
 * implement the same wrong idea will agree with each other perfectly, so parity
 * proves nothing about the *frames*; agreeing with an independent O(n^2) scan of
 * the same formula does.
 */

const preset = (id: string): Preset => {
  const p = trappingRainWaterAlgo.presets.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const run = (id: string): ArrayFrame[] =>
  runTrace(trappingRainWaterAlgo, { input: preset(id).input, presetParams: preset(id).params })
    .trace;

const valuesOf = (p: Preset): number[] => (p.input.type === 'numbers' ? p.input.values : []);

const last = (id: string): ArrayFrame => {
  const f = run(id).at(-1);
  if (!f) throw new Error(`preset ${id} produced no frames`);
  return f;
};

const numberVar = (f: ArrayFrame, key: string): number => Number(f.vars?.[key] ?? Number.NaN);

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

/**
 * The answer, the slow and obviously-correct way: for every column, the tallest
 * bar at or to its left, the tallest at or to its right, the lesser of the two,
 * minus the column, floored at zero.
 *
 * Written out again here rather than imported, on purpose. Re-deriving it in
 * the test is the whole point — a shared helper would let one wrong reading of
 * "trapped water" pass unnoticed in both the generator and its own reference.
 */
const waterByScan = (values: number[]): number => {
  let total = 0;
  for (let i = 0; i < values.length; i++) {
    const here = values[i] as number;
    let maxLeft = here;
    for (let k = 0; k <= i; k++) maxLeft = Math.max(maxLeft, values[k] as number);
    let maxRight = here;
    for (let k = i; k < values.length; k++) maxRight = Math.max(maxRight, values[k] as number);
    total += Math.max(0, Math.min(maxLeft, maxRight) - here);
  }
  return total;
};

describe('trapping rain water', () => {
  it('produces a structurally valid trace on every preset', () => {
    for (const { presetId, result } of runEveryPreset(trappingRainWaterAlgo)) {
      expect(result.error, `preset ${presetId}`).toBeUndefined();
      expect(result.trace.length, `preset ${presetId}`).toBeGreaterThan(0);
      expect(result.truncated, `preset ${presetId}`).toBe(false);
      expect(validateTrace(result.trace), `preset ${presetId}`).toEqual([]);
    }
  });

  it('pins the narration for the valley preset', () => {
    // A golden narration snapshot. If this changes, the *teaching* changed, not
    // just the implementation — which is exactly the kind of diff a reviewer
    // wants to see rather than absorb. The valley is the preset chosen because
    // it exercises both arms and the unequal-ceiling case the algorithm turns on.
    expect(
      run('valley')
        .slice(0, 11)
        .map((f) => f.note),
    ).toMatchInlineSnapshot(`
      [
        "Two cursors start at the ends: index 0 is 9 high, index 7 is 9 high, and nothing has been measured yet. Both ceilings start at 0 — the ground — so the first bar to exceed one becomes its own wall.",
        "The window is indices 0 to 7: 8 columns that can still change. Neither ceiling has risen above the ground yet, so 0 is the only ceiling there is and the column at index 0 cannot be filled deeper than that however tall anything in between turns out to be. Whichever cursor meets a bar first will raise one ceiling, and from that step on the comparison has teeth.",
        "The bar at index 0 is 9, taller than every bar already passed from the left, so leftMax rises to 9 and the column holds nothing: a new wall is its own ceiling. That raised ceiling is what every bar further right will be measured against.",
        "The left cursor steps to index 1, leaving a window of 7 columns. The window can only shrink and every column inside it is measured exactly once, so 8 steps is the whole budget: a quadratic version that computed a max-left and a max-right per column would look at 64 bars instead of 8.",
        "The window is indices 1 to 7: 7 columns that can still change. leftMax is 9 and rightMax is 0, and rightMax at 0 is the smaller — so the right side is the final one. A bar of 9 already stands on the far side of the column at index 7, so that column cannot be filled deeper than 0 however the 6 columns in between turn out, and the other side never has to be looked at.",
        "The bar at index 7 is 9, taller than every bar already passed from the right, so rightMax rises to 9 and the column holds nothing: a new wall is its own ceiling. That raised ceiling is what every bar further left will be measured against.",
        "The right cursor steps to index 6, leaving a window of 6 columns. The window can only shrink and every column inside it is measured exactly once, so 8 steps is the whole budget: a quadratic version that computed a max-left and a max-right per column would look at 64 bars instead of 8.",
        "The window is indices 1 to 6: 6 columns that can still change. Both ceilings are 9, so neither side is the smaller one and either could be settled — the tie-break picks the left only so the trace stays reproducible. It is safe for the same reason the unequal case is: the far side already stands at 9, so the column at index 1 is capped at 9 no matter what the 5 columns in between turn out to be.",
        "The left ceiling is 9 and the bar at index 1 is only 5, so the column holds 9 - 5 = 4 units of water, and it is final: a running maximum only ever rises, so nothing further right can make it deeper.",
        "4 units land on the total, which is now 4, and 3 of 8 columns have been settled. The column keeps its water in the picture and the algorithm keeps nothing about it — no per-column record and no prefix table, which is exactly the O(1) space the quadratic version cannot avoid.",
        "The left cursor steps to index 2, leaving a window of 5 columns. The window can only shrink and every column inside it is measured exactly once, so 8 steps is the whole budget: a quadratic version that computed a max-left and a max-right per column would look at 64 bars instead of 8.",
      ]
    `);
  });

  it('is deterministic: the same input always yields the same trace', () => {
    // A golden snapshot is only meaningful if the same input really does
    // reproduce the same frames, and the non-empty check is there so a
    // regression that emptied the trace cannot pass by comparing nothing.
    expect(run('valley').length).toBeGreaterThan(1);
    expect(JSON.stringify(run('valley'))).toBe(JSON.stringify(run('valley')));
    expect(JSON.stringify(run('staircase'))).toBe(JSON.stringify(run('staircase')));
  });

  it('terminates on degenerate input', () => {
    for (const values of [[], [42], [7, 7, 7], [0, 0, 0], [3, 0, 4]]) {
      const { trace, error, aborted } = runTrace(trappingRainWaterAlgo, {
        input: { type: 'numbers', values },
      });
      const where = JSON.stringify(values);
      expect(error, where).toBeUndefined();
      expect(aborted, where).toBe(false);
      expect(validateTrace(trace), where).toEqual([]);
      expect(trace.at(-1)?.anchor, where).toBe('done');
      expect(numberVar(trace.at(-1) as ArrayFrame, 'total'), where).toBe(waterByScan(values));
    }
  });

  it('never shows two same-coloured highlight groups in one frame', () => {
    /*
     * The palette deliberately reuses hues across tiers, so what is guaranteed —
     * and what the eye and the legend both depend on — is that the groups
     * *visible in a single frame* never collide. `contract.test.ts` asserts this
     * across the registry, which cannot see this module until it is registered,
     * so it is asserted here instead.
     */
    for (const p of trappingRainWaterAlgo.presets) {
      for (const f of run(p.id)) {
        const byColour = new Map<string, string[]>();
        for (const key of Object.keys(f.highlight ?? {})) {
          // A group with no members is not visible, so it cannot collide.
          if ((f.highlight?.[key]?.length ?? 0) === 0) continue;
          const colour = styleForKey(key).fill;
          byColour.set(colour, [...(byColour.get(colour) ?? []), key]);
        }
        for (const [colour, keys] of byColour) {
          expect(
            keys.length,
            `${p.id} @${f.index}: ${keys.join(' + ')} share ${colour}`,
          ).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('agrees with the quadratic scan on every preset, and never reports negative water', () => {
    for (const p of trappingRainWaterAlgo.presets) {
      const frames = run(p.id);
      const reference = waterByScan(valuesOf(p));
      expect(numberVar(last(p.id), 'total'), `preset ${p.id}`).toBe(reference);
      expect(last(p.id).result, `preset ${p.id}`).toBe(`${reference} units of water`);

      // The per-column depths the narration quotes have to be internally
      // consistent and non-negative, or the picture is showing water that the
      // total does not contain. Only the `add-water` frames are summed: the
      // `settle-*` frame reports the same depth one step earlier, and counting
      // both would double every column.
      let summed = 0;
      let reported = 0;
      for (const f of frames) {
        if (f.vars?.['depth'] === undefined) continue;
        if (f.vars?.['ceiling'] === undefined || f.vars?.['height'] === undefined) continue;
        const depth = numberVar(f, 'depth');
        const ceiling = numberVar(f, 'ceiling');
        const height = numberVar(f, 'height');
        expect(depth, `${p.id} @${f.index}: negative depth`).toBeGreaterThanOrEqual(0);
        expect(depth, `${p.id} @${f.index}: depth != ceiling - height`).toBe(ceiling - height);
        expect(ceiling, `${p.id} @${f.index}: ceiling below the bar`).toBeGreaterThanOrEqual(
          height,
        );
        if (f.anchor === 'add-water') summed += depth;
        reported = numberVar(f, 'total');
      }
      expect(summed, `preset ${p.id}: depths do not add up to the total`).toBe(reference);
      expect(reported, `preset ${p.id}: the last reported total`).toBe(reference);
    }
  });

  it('counts one step per column, and a settled column is never revisited', () => {
    for (const p of trappingRainWaterAlgo.presets) {
      const frames = run(p.id);
      const n = valuesOf(p).length;
      // `ops` is the claim the O(n) argument is made from, so it has a closed
      // form: exactly one step per column, no more and no fewer.
      expect(numberVar(last(p.id), 'ops'), `preset ${p.id}`).toBe(n);
      expect(frames.filter((f) => f.anchor === 'loop').length, `preset ${p.id}`).toBe(n);
      expect(frames.filter((f) => f.anchor === 'move').length, `preset ${p.id}`).toBe(n);
      // One settle per step, and the two settle anchors together account for all
      // of them — a frame that measured the same column twice would break this.
      const settles = frames.filter(
        (f) => f.anchor === 'settle-left' || f.anchor === 'settle-right',
      );
      expect(settles.length, `preset ${p.id}`).toBe(n);

      // Both running ceilings are monotone, which is the only reason one pass
      // is enough: a column already measured against a ceiling that can only
      // rise can never turn out to need more water.
      let leftMax = 0;
      let rightMax = 0;
      for (const f of frames) {
        if (f.vars?.['leftMax'] === undefined) continue;
        const l = numberVar(f, 'leftMax');
        const r = numberVar(f, 'rightMax');
        expect(l, `preset ${p.id} @${f.index}: leftMax went down`).toBeGreaterThanOrEqual(leftMax);
        expect(r, `preset ${p.id} @${f.index}: rightMax went down`).toBeGreaterThanOrEqual(
          rightMax,
        );
        leftMax = l;
        rightMax = r;
      }
    }
  });

  it('always paints the live window and the settled region as a partition of the array', () => {
    /*
     * `window` and `measured` are the two halves of the story, and if they ever
     * fail to cover the array — or overlap — then a column is either being
     * measured twice or not at all, and the picture is lying about the algorithm.
     */
    for (const p of trappingRainWaterAlgo.presets) {
      const n = valuesOf(p).length;
      for (const f of run(p.id)) {
        const window = f.highlight?.['window'] as number[] | undefined;
        const measured = f.highlight?.['measured'] as number[] | undefined;
        if (window === undefined || measured === undefined) continue;
        const all = [...window, ...measured].sort((a, b) => a - b);
        expect(all, `preset ${p.id} @${f.index}: bands do not tile the array`).toEqual(range(0, n));
      }
    }
  });

  it('reaches every declared anchor from some preset', () => {
    const reachable = new Set<string>();
    for (const p of trappingRainWaterAlgo.presets) {
      for (const a of anchorsInTrace(run(p.id))) reachable.add(a);
    }
    for (const a of trappingRainWaterAlgo.anchors) {
      expect(reachable.has(a), `anchor ${a} is never emitted by any preset`).toBe(true);
    }
  });

  it('drives both arms, and only the presets that should hold water do', () => {
    // The point of the preset set: each one is a different behaviour. The valley
    // settles almost everything from the left, the staircase almost everything
    // from the right, and the two zero-water presets exist to prove the bound at
    // ground level rather than to assume it.
    const countOf = (id: string, anchor: string): number =>
      run(id).filter((f) => f.anchor === anchor).length;
    expect(countOf('valley', 'settle-left')).toBeGreaterThan(countOf('valley', 'settle-right'));
    expect(countOf('staircase', 'settle-right')).toBeGreaterThan(
      countOf('staircase', 'settle-left'),
    );
    expect(countOf('valley', 'add-water')).toBeGreaterThan(0);
    expect(countOf('staircase', 'add-water')).toBeGreaterThan(0);
    for (const id of ['spike', 'flat', 'ground', 'degenerate']) {
      expect(countOf(id, 'add-water'), `preset ${id}`).toBe(0);
    }
  });
});
