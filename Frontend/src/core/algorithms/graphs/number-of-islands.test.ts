import { describe, expect, it } from 'vitest';
import { styleForKey } from '../../../features/viewport/palette.ts';
import { anchorsInTrace, LANGS, parseCode, resolveAnchor } from '../../code/anchors.ts';
import type { MaterialiseResult } from '../../trace/materialise.ts';
import { runEveryPreset, runTrace, validateTrace } from '../../trace/materialise.ts';
import type { GridFrame } from '../../trace/types.ts';
import { PALETTE_ORDER } from '../../trace/types.ts';
import type { Preset } from '../types.ts';
import { naiveIslandCount, numberOfIslandsAlgo } from './number-of-islands.ts';

/**
 * Number of Islands — the per-module test.
 *
 * The contract test looks *down* from the registry, so it cannot see this module
 * until somebody registers it, and until then it cannot check the two things most
 * likely to be wrong here: a palette collision inside a single frame, and a frame
 * that shares a collection with its neighbour. Both are asserted locally below,
 * against `styleForKey` itself rather than a re-implementation of it.
 */

const preset = (id: string): Preset => {
  const p = numberOfIslandsAlgo.presets.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const run = (id: string): MaterialiseResult<GridFrame> =>
  runTrace(numberOfIslandsAlgo, { input: preset(id).input, presetParams: preset(id).params });

/**
 * `runEveryPreset` over every preset, re-typed so the frames are `GridFrame`s.
 * The helper is still the one the contract test uses, so nothing here can drift
 * from what the registry-wide sweep will do once this module is registered.
 */
const everyPreset = (): Array<{ presetId: string; result: MaterialiseResult<GridFrame> }> =>
  runEveryPreset(numberOfIslandsAlgo).map((r) => ({
    presetId: r.presetId,
    result: r.result as MaterialiseResult<GridFrame>,
  }));

/** The `rows`/`cols`/cells triple a preset declares, narrowed once. */
const gridOf = (
  id: string,
): { rows: number; cols: number; values: Array<number | string | null> } => {
  const input = preset(id).input;
  if (input.type !== 'grid') throw new Error(`preset ${id} is not a grid`);
  return { rows: input.rows, cols: input.cols, values: input.values ?? [] };
};

/** The claim a preset makes, computed by the independent naive reference. */
const claimedResult = (id: string): number => {
  const e = numberOfIslandsAlgo.expectations.find((x) => x.presetId === id);
  if (!e) throw new Error(`no expectation for ${id}`);
  return e.result as number;
};

/** `result` on the last frame, which is where the count is reported. */
const finalCount = (trace: GridFrame[]): number => Number(trace[trace.length - 1]?.result);

/**
 * The finished islands themselves, as sets, in order.
 *
 * `filled` is cumulative — it grows and never shrinks — so island N's cells are
 * the *difference* between the `island` frame's `filled` and the previous one's.
 * Two of those sets sharing a cell is exactly the "counted an island twice" bug.
 */
const finishedIslands = (trace: GridFrame[]): number[][] => {
  const out: number[][] = [];
  let previous: number[] = [];
  for (const f of trace) {
    if (f.anchor !== 'island') continue;
    const now = [...(f.filled ?? [])];
    const fresh = now.filter((c) => !previous.includes(c));
    out.push(fresh);
    previous = now;
  }
  return out;
};

describe('number of islands — trace shape', () => {
  it('produces a structurally valid trace on every preset', () => {
    for (const { presetId, result } of everyPreset()) {
      expect(validateTrace(result.trace), `preset ${presetId}`).toEqual([]);
      expect(result.trace.length, `preset ${presetId}: no frames`).toBeGreaterThan(0);
      expect(result.truncated, `preset ${presetId}: hit the frame cap`).toBe(false);
      expect(result.error, `preset ${presetId}: threw`).toBeUndefined();
    }
  });

  it('pins the narration for the diagonal-touch preset', () => {
    // A golden narration snapshot. If this changes, the *teaching* changed, not
    // just the implementation — and the diagonal preset is where the 4-versus-8
    // lesson lives, so its wording is the thing most worth pinning.
    expect(
      run('diagonal-touch')
        .trace.slice(0, 6)
        .map((f) => f.note),
    ).toMatchInlineSnapshot(`
      [
        "16 cells in a 4×4 grid, 8 of them land. Nothing is claimed yet, and the answer will be the number of times the scan meets land nobody has reached. A flood can only step to a cell that shares a *side*, so a corner touch is not a connection: adding the four diagonals to the delta table would make this the 8-connected version and merge every pair of corner-touching islands.",
        "The scan reaches row 0, col 0 — cell 0 of 16. It is land and nobody has claimed it, so it is about to start island 1. 8 unclaimed land cells remain, and every one of them is a candidate for the count, so this is the line that decides the answer.",
        "row 0, col 0 is unclaimed land, so island 1 starts here and the count goes from 0 to 1. The cell is marked and pushed in the same breath: claiming *before* flooding rather than after is the one decision that keeps this terminating, because a cell can then be on the stack at most once.",
        "Cell 0 goes on the stack and the flood starts. Stack depth 1 — that is the call depth a recursive \`floodFill(r, c)\` calling itself four times would be at right now, which is the number a recursive version hides completely. 1 land cell claimed so far in this island.",
        "Pop row 0, col 0 off the stack and look at its four side-neighbours. Depth drops to 0, and this island now has 1 cell. The four *diagonal* neighbours are not examined at all: they are not generated, so nothing rejects them — which is the honest description of 4-connectivity, and the reason a diagonal wall is a genuine barrier rather than a thin one.",
        "row -1, col 0 falls above the top row, so the bounds guard drops it before any array read. This is the algorithm rather than defensive coding: a flat index of row * cols + col does not know where a row ends, so column 4 is *arithmetically* the first cell of the next row, and column -1 the last cell of this one. Skip the guard and the flood leaks across row boundaries, reporting too few islands, with no out-of-range access to catch it.",
      ]
    `);
  });

  it('is deterministic: the same input always yields the same trace', () => {
    for (const p of numberOfIslandsAlgo.presets) {
      const a = runTrace(numberOfIslandsAlgo, { input: p.input, presetParams: p.params });
      const b = runTrace(numberOfIslandsAlgo, { input: p.input, presetParams: p.params });
      expect(JSON.stringify(a.trace), p.id).toBe(JSON.stringify(b.trace));
    }
  });

  it('does not throw on a 0×0 grid or on a 1×1 one', () => {
    const empty = runTrace(numberOfIslandsAlgo, {
      input: { type: 'grid', rows: 0, cols: 0, values: [] },
    });
    expect(empty.error).toBeUndefined();
    expect(empty.trace.length).toBeGreaterThan(0);
    expect(finalCount(empty.trace)).toBe(0);

    for (const cells of [[1], [0], [1, 0]]) {
      const { trace, error, truncated } = runTrace(numberOfIslandsAlgo, {
        input: { type: 'grid', rows: 1, cols: cells.length, values: cells },
      });
      expect(error).toBeUndefined();
      expect(trace.length).toBeGreaterThan(0);
      expect(truncated).toBe(false);
    }
  });

  it('never emits an undeclared anchor, and every declared anchor is emitted', () => {
    const declared = new Set(numberOfIslandsAlgo.anchors);
    const reachable = new Set<string>();
    for (const { presetId, result } of everyPreset()) {
      for (const f of result.trace) {
        expect(declared.has(f.anchor), `${presetId}: undeclared anchor "${f.anchor}"`).toBe(true);
        reachable.add(f.anchor);
      }
    }
    for (const a of numberOfIslandsAlgo.anchors) {
      expect(reachable.has(a), `anchor "${a}" is never emitted by any preset`).toBe(true);
    }
  });

  it('marks the same line in all four listings for every anchor', () => {
    const perLang = LANGS.map((l) =>
      Object.keys(parseCode(l, numberOfIslandsAlgo.lesson.code[l]).anchors).sort(),
    );
    for (let i = 1; i < perLang.length; i++) {
      expect(perLang[i], `anchor set differs in ${LANGS[i]}`).toEqual(perLang[0]);
    }
    for (const a of numberOfIslandsAlgo.anchors) {
      for (const l of LANGS) {
        const p = parseCode(l, numberOfIslandsAlgo.lesson.code[l]);
        const range = resolveAnchor(p, a);
        expect(range, `${l}: anchor "${a}" has no line`).not.toBeNull();
        expect(p.lines[(range?.start ?? 1) - 1] ?? '', `${l}/${a}`).toContain('@anchor');
        const note = numberOfIslandsAlgo.lesson.notes[l]?.[a] ?? '';
        expect(note.length, `${l}/${a}: missing note`).toBeGreaterThan(15);
      }
    }
  });

  it('explains the 8-connected variant in the code, not only in the copy', () => {
    // The lesson is "one line changes the answer", so the line has to be there.
    for (const l of LANGS) {
      expect(numberOfIslandsAlgo.lesson.code[l], `${l}: no 8-connected hint`).toMatch(
        /8-connected|diagonal/i,
      );
    }
  });
});

describe('number of islands — palette and snapshots', () => {
  it('never shows two same-coloured highlight groups in one frame', () => {
    // The contract test asserts this for registered algorithms and cannot see
    // this module yet, so it is asserted here.
    const known = new Set<string>(PALETTE_ORDER);
    const clashes: string[] = [];
    for (const { presetId, result } of everyPreset()) {
      for (const f of result.trace) {
        const byColour = new Map<string, string[]>();
        for (const key of Object.keys(f.highlight ?? {})) {
          expect(known.has(key), `${presetId}: "${key}" is not in PALETTE_ORDER`).toBe(true);
          // A group with no members is not on screen, so it cannot collide.
          if ((f.highlight?.[key]?.length ?? 0) === 0) continue;
          const colour = styleForKey(key).fill;
          byColour.set(colour, [...(byColour.get(colour) ?? []), key]);
        }
        for (const [colour, keys] of byColour) {
          if (keys.length > 1) {
            clashes.push(`${presetId} @${f.index}: ${keys.join(' + ')} share ${colour}`);
          }
        }
      }
    }
    expect(clashes, clashes.join('; ')).toEqual([]);
  });

  it('keeps at most three highlight groups visible in any frame', () => {
    for (const { presetId, result } of everyPreset()) {
      for (const f of result.trace) {
        const live = Object.keys(f.highlight ?? {}).filter(
          (key) => (f.highlight?.[key]?.length ?? 0) > 0,
        );
        expect(live.length, `${presetId} @${f.index}: ${live.join(' + ')}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('copies cells and filled into every frame, so no two frames share a reference', () => {
    // Frames are snapshots. A shared `cells` or `filled` array means stepping
    // backwards shows the future, and nothing in the trace layer can catch it.
    for (const { presetId, result } of everyPreset()) {
      const seenCells = new Set<unknown>();
      const seenFilled = new Set<unknown>();
      for (const f of result.trace) {
        expect(seenCells.has(f.cells), `${presetId} @${f.index}: cells array is shared`).toBe(
          false,
        );
        seenCells.add(f.cells);
        expect(seenFilled.has(f.filled), `${presetId} @${f.index}: filled array is shared`).toBe(
          false,
        );
        seenFilled.add(f.filled);
      }
    }
  });

  it('re-copies the cells array even on frames that changed nothing', () => {
    // Specifically: a frame that mutates nothing still has to carry a copy,
    // because a later frame will. A `sinks` frame is exactly such a frame.
    const { trace } = run('all-land');
    expect(trace.length).toBeGreaterThan(3);
    const first = trace[0]?.cells;
    for (const f of trace.slice(1)) expect(f.cells).not.toBe(first);
  });
});

describe('number of islands — the answer', () => {
  it('agrees with the naive reference on every preset', () => {
    for (const { presetId, result } of everyPreset()) {
      const { rows, cols, values } = gridOf(presetId);
      // The generator's own answer, read back out of the trace.
      expect(finalCount(result.trace), presetId).toBe(naiveIslandCount(rows, cols, values));
      // ...and the machine-checkable claim, which is what the four language
      // listings are verified against. Same number, two independent routes.
      expect(claimedResult(presetId), `${presetId}: expectation`).toBe(
        naiveIslandCount(rows, cols, values),
      );
    }
  });

  it('produces pairwise-disjoint islands, so nothing is counted twice', () => {
    // The classic bug in this family. The `island` frames are exactly the
    // finished regions, so their `filled` sets must not intersect.
    for (const { presetId, result } of everyPreset()) {
      const islands = finishedIslands(result.trace);
      const times = new Map<number, number>();
      islands.forEach((cells, n) => {
        expect(new Set(cells).size, `${presetId}: island ${n + 1} repeats a cell`).toBe(
          cells.length,
        );
        for (const c of cells) times.set(c, (times.get(c) ?? 0) + 1);
      });
      for (const [cell, count] of times) {
        expect(count, `${presetId}: cell ${cell} appears in ${count} finished islands`).toBe(1);
      }
    }
  });

  it('only ever fills land, and `filled` grows monotonically', () => {
    for (const { presetId, result } of everyPreset()) {
      const { values } = gridOf(presetId);
      let previous = 0;
      for (const f of result.trace) {
        const filled = f.filled ?? [];
        expect(filled.length, `${presetId} @${f.index}: filled shrank`).toBeGreaterThanOrEqual(
          previous,
        );
        previous = filled.length;
        for (const c of filled) {
          expect(values[c], `${presetId} @${f.index}: filled water cell ${c}`).toBe(1);
        }
      }
    }
  });

  it('reads 3 on the diagonal preset, and 1 under 8-connectivity', () => {
    // The teaching claim of the whole module, pinned as a number. The
    // diagonal-touch grid has two cells that touch the central block only at a
    // corner, so 4-connected counting gives three regions and 8-connected
    // counting gives one.
    const { values } = gridOf('diagonal-touch');
    expect(naiveIslandCount(4, 4, values)).toBe(3);
    expect(claimedResult('diagonal-touch')).toBe(3);
    const { trace } = run('diagonal-touch');
    expect(finalCount(trace)).toBe(3);
    // Three finished islands of sizes 1, 6 and 1 — the two singletons are the
    // corner touches, and they are the whole lesson.
    expect(
      finishedIslands(trace)
        .map((s) => s.length)
        .sort((a, b) => a - b),
    ).toEqual([1, 1, 6]);
    const closing = trace[trace.length - 1];
    expect(closing?.note).toContain('8-connectivity');
    expect(closing?.note).toContain('1 island');
  });

  it('gets the textbook numbers on the unambiguous presets', () => {
    expect(claimedResult('four-islands')).toBe(4);
    expect(claimedResult('one-landmass')).toBe(1);
    expect(claimedResult('all-land')).toBe(1);
    expect(claimedResult('all-water')).toBe(0);
    expect(claimedResult('one-cell')).toBe(1);
  });

  it('only emits the water-only path on the all-water preset', () => {
    // Every cell is a `sinks` and no flood ever starts, so `new-island`,
    // `flood`, `mark`, `land` and `island` are all dead on that preset. That is
    // the point of the preset, and it is why the other presets are mandatory.
    const anchors = new Set(anchorsInTrace(run('all-water').trace));
    expect(anchors.has('sinks')).toBe(true);
    for (const dead of ['new-island', 'flood', 'mark', 'land', 'island']) {
      expect(anchors.has(dead), `all-water should not reach "${dead}"`).toBe(false);
    }
  });

  it('only emits the 1×1 path on the 1×1 preset', () => {
    // One cell means no neighbour is ever *land*, so `land` is unreachable and
    // the flood is a single pop. The bounds guard does fire, four times, which
    // is the point: a 1×1 grid is the case that catches a flood assuming a
    // neighbour exists.
    const anchors = anchorsInTrace(run('one-cell').trace);
    expect(anchors).toContain('new-island');
    expect(anchors).toContain('island');
    expect(anchors).toContain('sinks');
    expect(anchors).not.toContain('land');
  });

  it('starts exactly one flood on the single-landmass preset', () => {
    expect(
      anchorsInTrace(run('one-landmass').trace).filter((a) => a === 'new-island'),
    ).toHaveLength(1);
  });

  it('declares one expectation per preset, with rows, cols and 0/1 cells', () => {
    const ids = numberOfIslandsAlgo.presets.map((p) => p.id);
    expect(numberOfIslandsAlgo.expectations.map((e) => e.presetId)).toEqual(ids);
    for (const e of numberOfIslandsAlgo.expectations) {
      expect(e.args, e.presetId).toHaveLength(3);
      const [rows, cols, cells] = e.args as [number, number, number[]];
      expect(typeof rows, e.presetId).toBe('number');
      expect(typeof cols, e.presetId).toBe('number');
      // The four listings are handed a plain `int[]`, so a `null` would not
      // survive the trip to C++ or Java. Land is 1, water is 0, nothing else.
      expect(cells.length, e.presetId).toBe(rows * cols);
      for (const c of cells) expect([0, 1], `${e.presetId}: cell ${c}`).toContain(c);
      expect(typeof e.result, e.presetId).toBe('number');
    }
  });

  it('stops when asked to', () => {
    // `runTrace` polls `shouldStop` between frames, which is exactly how the
    // app's worker cancels a runaway algorithm.
    let calls = 0;
    const result = runTrace(
      numberOfIslandsAlgo,
      { input: preset('all-land').input, presetParams: preset('all-land').params },
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
});
