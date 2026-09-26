import { describe, expect, it } from 'vitest';
import { styleForKey } from '../../../features/viewport/palette.ts';
import { anchorsInTrace } from '../../code/anchors.ts';
import { runEveryPreset, runTrace, validateTrace } from '../../trace/materialise.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { Preset } from '../types.ts';
import { dutchNationalFlagAlgo } from './dutch-national-flag.ts';

/**
 * Per-algorithm tests for Dutch National Flag.
 *
 * Two of these checks exist because of how this algorithm fails. The famous bug
 * — advancing `mid` after a swap with `high` — leaves a value stranded in the
 * middle band, and the *four-language parity run cannot see it*: all four
 * listings would strand the same value and agree perfectly. So the re-examine
 * rule is asserted directly on the frames, and the regions the picture draws are
 * checked against the cursors that produced them rather than against each other.
 */

const preset = (id: string): Preset => {
  const p = dutchNationalFlagAlgo.presets.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const run = (id: string): ArrayFrame[] =>
  runTrace(dutchNationalFlagAlgo, { input: preset(id).input, presetParams: preset(id).params })
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
 * One highlight group, as numbers.
 *
 * `Highlight` is `Record<string, Array<NodeId | number>>` — node ids and indices
 * share one type, because one viewport renders both. The array kind only ever
 * holds indices, so the narrowing is stated once here rather than cast at every
 * call site.
 */
const group = (f: ArrayFrame, key: string): number[] => (f.highlight?.[key] ?? []) as number[];

describe('dutch national flag', () => {
  it('produces a structurally valid trace on every preset', () => {
    for (const { presetId, result } of runEveryPreset(dutchNationalFlagAlgo)) {
      expect(result.error, `preset ${presetId}`).toBeUndefined();
      expect(result.trace.length, `preset ${presetId}`).toBeGreaterThan(0);
      expect(result.truncated, `preset ${presetId}`).toBe(false);
      expect(validateTrace(result.trace), `preset ${presetId}`).toEqual([]);
    }
  });

  it('pins the narration for the small-case preset', () => {
    // A golden narration snapshot. If this changes, the *teaching* changed, not
    // just the implementation. `small-case` is the preset chosen because an
    // unexamined value reaches index 0 within two steps, which is the only place
    // the "re-examine, do not advance" rule is visible at all.
    expect(
      run('small-case')
        .slice(0, 9)
        .map((f) => f.note),
    ).toMatchInlineSnapshot(`
      [
        "6 values drawn from 0, 1 and 2, and three cursors aimed at the same place. The array is always exactly four bands: 0s up to low, 1s from low to mid, unclassified from mid to high, 2s after high. All four are empty, and only the third one is still allowed to change.",
        "The unclassified band is indices 0 to 5 — 6 values nobody has looked at yet. The value under inspection is 2 at index 0, and mid cannot step past it: a swap from the far end drops an unexamined value straight onto index 0, so this cell may have to be classified twice.",
        "The value at index 0 is 2, the high value, so it goes to the back: it trades with the unexamined 0 at index 5 and the settled 2-run grows to start at index 5. mid stays at 0, because the 0 that just arrived has never been looked at — and advancing here is exactly how a value gets stranded in the middle band of an array the pass has already declared finished.",
        "The unclassified band is indices 0 to 4 — 5 values nobody has looked at yet. The value under inspection is 0 at index 0, and mid cannot step past it: a swap from the far end drops an unexamined value straight onto index 0, so this cell may have to be classified twice.",
        "The value at index 0 is 0, the low value, and it belongs at the front of the unclassified run. The 0-run has caught up with the cursor, so the swap is with itself at index 0, and the settled 0-run grows to [0, 1). mid does advance to 1 here, and that is the asymmetry with the far-end swap: the value that landed on index 0 came from inside the finished 1-run — or from index 0 itself, when the swap was a no-op — so it is already classified and needs no second look.",
        "The unclassified band is indices 1 to 4 — 4 values nobody has looked at yet. The value under inspection is 0 at index 1, and mid cannot step past it: a swap from the far end drops an unexamined value straight onto index 1, so this cell may have to be classified twice.",
        "The value at index 1 is 0, the low value, and it belongs at the front of the unclassified run. The 0-run has caught up with the cursor, so the swap is with itself at index 1, and the settled 0-run grows to [0, 2). mid does advance to 2 here, and that is the asymmetry with the far-end swap: the value that landed on index 1 came from inside the finished 1-run — or from index 1 itself, when the swap was a no-op — so it is already classified and needs no second look.",
        "The unclassified band is indices 2 to 4 — 3 values nobody has looked at yet. The value under inspection is 2 at index 2, and mid cannot step past it: a swap from the far end drops an unexamined value straight onto index 2, so this cell may have to be classified twice.",
        "The value at index 2 is 2, the high value, so it goes to the back: it trades with the unexamined 1 at index 4 and the settled 2-run grows to start at index 4. mid stays at 2, because the 1 that just arrived has never been looked at — and advancing here is exactly how a value gets stranded in the middle band of an array the pass has already declared finished.",
      ]
    `);
  });

  it('is deterministic: the same input always yields the same trace', () => {
    expect(run('mixed').length).toBeGreaterThan(1);
    expect(JSON.stringify(run('small-case'))).toBe(JSON.stringify(run('small-case')));
    expect(JSON.stringify(run('mixed'))).toBe(JSON.stringify(run('mixed')));
  });

  it('terminates on degenerate input', () => {
    for (const values of [[], [1], [2], [0, 0, 0], [2, 2, 2], [1, 2, 0, 1, 2, 0]]) {
      const { trace, error, aborted } = runTrace(dutchNationalFlagAlgo, {
        input: { type: 'numbers', values },
      });
      const where = JSON.stringify(values);
      expect(error, where).toBeUndefined();
      expect(aborted, where).toBe(false);
      expect(validateTrace(trace), where).toEqual([]);
      expect(trace.at(-1)?.anchor, where).toBe('done');
      // The claim, checked by an independent sort rather than by the generator.
      expect((trace.at(-1) as { values: number[] }).values, where).toEqual(
        [...values].sort((a, b) => a - b),
      );
    }
  });

  it('never shows two same-coloured highlight groups in one frame', () => {
    /*
     * The palette deliberately reuses hues across tiers, so the guarantee that
     * holds — and that the eye and the legend both depend on — is that the
     * groups visible in a *single frame* never collide. `contract.test.ts` checks
     * this across the registry, which cannot see this module until it is
     * registered, so it is checked locally instead.
     */
    for (const p of dutchNationalFlagAlgo.presets) {
      for (const f of run(p.id)) {
        const byColour = new Map<string, string[]>();
        for (const key of Object.keys(f.highlight ?? {})) {
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

  it('ends on an array that is in order, and conserves the multiset', () => {
    for (const p of dutchNationalFlagAlgo.presets) {
      const final = last(p.id);
      const values = final.values as number[];
      const input = valuesOf(p);
      expect(values, `preset ${p.id}: not in order`).toEqual([...values].sort((a, b) => a - b));
      // Being sorted is not the whole claim: a pass that simply deleted the
      // awkward values would also come out sorted. A partition may only change
      // the order, never the contents, so the multiset is checked too.
      expect(
        [...values].sort((a, b) => a - b),
        `preset ${p.id}: multiset changed`,
      ).toEqual([...input].sort((a, b) => a - b));
      expect(final.result, `preset ${p.id}`).toBe('sorted');
      expect(final.sorted, `preset ${p.id}: whole array is in final position`).toEqual([
        0,
        values.length,
      ]);
    }
  });

  it('draws the three regions exactly where the cursors say they are, and never overlapping', () => {
    /*
     * The picture is the lesson here: three settled bands and one unclassified
     * run. So the bands are checked against `low`, `mid` and `high` directly
     * rather than against each other — a highlight group that has drifted away
     * from its cursor is exactly the kind of bug that leaves a trace which is
     * structurally valid and completely misleading.
     */
    for (const p of dutchNationalFlagAlgo.presets) {
      const n = valuesOf(p).length;
      for (const f of run(p.id)) {
        const low = numberVar(f, 'low');
        const mid = numberVar(f, 'mid');
        const high = numberVar(f, 'high');
        const where = `${p.id} @${f.index} (${f.anchor})`;

        if (f.highlight?.['output'] !== undefined) {
          expect(group(f, 'output'), `${where}: 0-run`).toEqual(range(0, low));
        }
        if (f.highlight?.['sorted'] !== undefined) {
          expect(group(f, 'sorted'), `${where}: 1-run`).toEqual(range(low, mid));
        }
        if (f.highlight?.['window'] !== undefined) {
          expect(group(f, 'window'), `${where}: unclassified run`).toEqual(range(mid, high + 1));
        }
        if (f.highlight?.['picked'] !== undefined) {
          // The settled high band is `[high + 1, n)`, and `picked` must never
          // reach outside it. The one frame that paints *less* than the whole
          // band is the far-end swap, where the cell that has just joined the
          // band is painted as part of the swap instead — so anything missing
          // from `picked` has to be one of the two swapped cells.
          const outside = group(f, 'picked').filter((i) => i < high + 1 || i >= n);
          expect(outside, `${where}: 2-run reaches outside the cursor`).toEqual([]);
          const missing = range(high + 1, n).filter((i) => !group(f, 'picked').includes(i));
          expect(
            missing.every((i) => group(f, 'swapping').includes(i)),
            `${where}: a 2-run cell is neither painted nor part of the swap`,
          ).toBe(true);
        }

        // The bands are disjoint by construction; assert it so a future edit that
        // widens one of them fails here rather than in front of a student.
        const regions = ['output', 'sorted', 'picked', 'window'].map(
          (k) => [k, group(f, k)] as const,
        );
        for (const [aKey, a] of regions) {
          for (const [bKey, b] of regions) {
            if (aKey >= bKey) continue;
            const overlap = a.filter((i) => b.includes(i));
            expect(overlap, `${where}: ${aKey} overlaps ${bKey} at ${overlap.join(', ')}`).toEqual(
              [],
            );
          }
        }
      }
    }
  });

  it('re-examines the same cell after a far-end swap and steps past it after a near one', () => {
    /*
     * The one rule the whole algorithm turns on, asserted on the frames rather
     * than on the code, because four listings that each forgot the `mid` step
     * would agree with one another and with the generator and still strand a
     * value in the middle band.
     *
     * Each branch frame is compared against the `loop` frame on either side of
     * it, so "did not advance" is checked against a measurement rather than
     * against the value the frame happens to report.
     */
    let highSwaps = 0;
    let lowSwaps = 0;
    let alreadyMid = 0;
    for (const p of dutchNationalFlagAlgo.presets) {
      const frames = run(p.id);
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i] as ArrayFrame;
        const anchor = f.anchor;
        if (anchor !== 'swap-high' && anchor !== 'swap-low' && anchor !== 'already-mid') continue;
        const prev = frames[i - 1] as ArrayFrame | undefined;
        const next = frames[i + 1] as ArrayFrame | undefined;
        if (prev?.anchor !== 'loop') continue;
        const where = `${p.id} @${i} (${anchor})`;

        // `low` and `high` are the two ends of the unclassified band and are
        // never touched except by their own swap.
        if (anchor === 'swap-high') {
          highSwaps++;
          expect(numberVar(f, 'mid'), `${where}: mid advanced after a far-end swap`).toBe(
            numberVar(prev, 'mid'),
          );
          expect(numberVar(f, 'low'), `${where}: low moved`).toBe(numberVar(prev, 'low'));
          expect(numberVar(f, 'high'), `${where}: high did not shrink by one`).toBe(
            numberVar(prev, 'high') - 1,
          );
          if (next)
            expect(numberVar(next, 'mid'), `${where}: mid moved afterwards`).toBe(
              numberVar(f, 'mid'),
            );
          // And the value now sitting on `mid` is the one that was on `high`,
          // which is the whole reason `mid` has to stay put.
          const at = numberVar(f, 'mid');
          expect((f.values as number[])[at], `${where}: nothing was dragged onto mid`).toBe(
            (prev.values as number[])[numberVar(prev, 'high')],
          );
        } else {
          if (anchor === 'swap-low') lowSwaps++;
          else alreadyMid++;
          expect(numberVar(f, 'mid'), `${where}: mid did not advance`).toBe(
            numberVar(prev, 'mid') + 1,
          );
          expect(numberVar(f, 'high'), `${where}: high moved`).toBe(numberVar(prev, 'high'));
          if (anchor === 'swap-low') {
            expect(numberVar(f, 'low'), `${where}: low did not grow by one`).toBe(
              numberVar(prev, 'low') + 1,
            );
          } else {
            expect(numberVar(f, 'low'), `${where}: low moved`).toBe(numberVar(prev, 'low'));
            expect(f.values as number[], `${where}: already-mid wrote to the array`).toEqual(
              prev.values,
            );
          }
        }
      }
    }
    // Every arm has to have run somewhere, or the assertions above are vacuous.
    expect(highSwaps).toBeGreaterThan(0);
    expect(lowSwaps).toBeGreaterThan(0);
    expect(alreadyMid).toBeGreaterThan(0);
  });

  it('classifies every cell exactly once and never swaps more than once per cell', () => {
    for (const p of dutchNationalFlagAlgo.presets) {
      const frames = run(p.id);
      const n = valuesOf(p).length;
      // `ops` is the count the O(n) claim is made from, so it has a closed form:
      // one classification per cell, no more and no fewer.
      expect(numberVar(last(p.id), 'ops'), `preset ${p.id}`).toBe(n);
      expect(frames.filter((f) => f.anchor === 'loop').length, `preset ${p.id}`).toBe(n);
      expect(
        numberVar(last(p.id), 'swaps'),
        `preset ${p.id}: swaps exceed classifications`,
      ).toBeLessThanOrEqual(n);
      // `low` and `high` only ever move inwards, by exactly one, and `mid` is
      // the only cursor that can stay put — that is what bounds the pass.
      let low = 0;
      let high = n - 1;
      for (const f of frames) {
        if (f.vars?.['high'] === undefined) continue;
        expect(
          numberVar(f, 'low'),
          `preset ${p.id} @${f.index}: low went left`,
        ).toBeGreaterThanOrEqual(low);
        expect(
          numberVar(f, 'high'),
          `preset ${p.id} @${f.index}: high went right`,
        ).toBeLessThanOrEqual(high);
        low = numberVar(f, 'low');
        high = numberVar(f, 'high');
      }
    }
  });

  it('leaves the array untouched on the already-partitioned preset', () => {
    // The best case, and the input on which the missing-`mid`-increment bug
    // hides: every swap here either is with itself or exchanges two equal
    // values, so the array must come out byte-identical.
    const input = valuesOf(preset('partitioned'));
    expect(last('partitioned').values as number[]).toEqual(input);
  });

  it('reaches every declared anchor from some preset', () => {
    const reachable = new Set<string>();
    for (const p of dutchNationalFlagAlgo.presets) {
      for (const a of anchorsInTrace(run(p.id))) reachable.add(a);
    }
    for (const a of dutchNationalFlagAlgo.anchors) {
      expect(reachable.has(a), `anchor ${a} is never emitted by any preset`).toBe(true);
    }
  });

  it('covers the whole array with the three bands on the final frame', () => {
    for (const p of dutchNationalFlagAlgo.presets) {
      const f = last(p.id);
      const n = valuesOf(p).length;
      const covered = [...group(f, 'output'), ...group(f, 'sorted'), ...group(f, 'picked')].sort(
        (a, b) => a - b,
      );
      expect(covered, `preset ${p.id}: the final bands do not tile the array`).toEqual(range(0, n));
      const low = numberVar(f, 'low');
      const mid = numberVar(f, 'mid');
      expect(group(f, 'output').length, `preset ${p.id}: zero count`).toBe(low);
      expect(group(f, 'sorted').length, `preset ${p.id}: one count`).toBe(mid - low);
      expect(group(f, 'picked').length, `preset ${p.id}: two count`).toBe(n - mid);
    }
  });
});
