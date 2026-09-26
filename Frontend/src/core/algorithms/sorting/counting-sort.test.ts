import { describe, expect, it } from 'vitest';
import { styleForKey } from '../../../features/viewport/palette.ts';
import { anchorsInTrace, LANGS } from '../../code/anchors.ts';
import { runEveryPreset, runTrace, validateTrace } from '../../trace/materialise.ts';
import type { ArrayFrame, Highlight } from '../../trace/types.ts';
import { PALETTE_ORDER } from '../../trace/types.ts';
import type { Preset } from '../types.ts';
import { countingSortAlgo } from './counting-sort.ts';

const preset = (id: string): Preset => {
  const p = countingSortAlgo.presets.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const run = (id: string) =>
  runTrace(countingSortAlgo, { input: preset(id).input, presetParams: preset(id).params });

const framesOf = (id: string, anchor: string): ArrayFrame[] =>
  run(id).trace.filter((f) => f.anchor === anchor);

const valuesOf = (id: string): number[] => {
  const input = preset(id).input;
  return input.type === 'numbers' ? input.values : [];
};

const sortedCopy = (a: readonly number[]): number[] => [...a].sort((x, y) => x - y);

const overlayOf = (f: ArrayFrame): number[] | null =>
  f.overlay ? (f.overlay.values as number[]) : null;

const isNonDecreasing = (a: readonly number[]): boolean =>
  a.every((v, i) => i === 0 || (a[i - 1] as number) <= v);

describe('counting sort', () => {
  it('produces a structurally valid trace on every preset', () => {
    for (const { presetId, result } of runEveryPreset(countingSortAlgo)) {
      expect(validateTrace(result.trace), `preset ${presetId}`).toEqual([]);
      expect(result.trace.length).toBeGreaterThan(0);
      expect(result.truncated, `preset ${presetId}`).toBe(false);
      expect(result.error, `preset ${presetId}`).toBeUndefined();
    }
  });

  it('pins the narration for the small-range preset', () => {
    // A golden narration snapshot. If this changes, the *teaching* changed, not
    // just the implementation — which is exactly the kind of diff a reviewer
    // wants to see rather than absorb. The selection is deliberately mixed: the
    // four opening frames, the last prefix-sum step, a placement that writes onto
    // its own cell, one that writes to its left, one that lands on a cell an
    // earlier write has already moved, the final write, and the close.
    const trace = run('small-range').trace;
    const withAnchor = (a: string) => trace.filter((f) => f.anchor === a);
    // The frame that makes the read hazard concrete: the read cursor is standing
    // on a cell an earlier write has already moved, so an in-place reader would
    // be holding the wrong value.
    const readHazard = withAnchor('place').filter((f) =>
      (f.highlight?.['output'] ?? []).includes(f.pointers?.['i'] ?? -1),
    );
    expect(readHazard.length, 'no read-hazard frame in small-range').toBeGreaterThan(0);
    expect([
      ...trace.slice(0, 4).map((f) => f.note),
      ...withAnchor('prefix-sum')
        .slice(-1)
        .map((f) => f.note),
      ...withAnchor('place')
        .slice(0, 2)
        .map((f) => f.note),
      ...readHazard.slice(0, 1).map((f) => f.note),
      ...withAnchor('written')
        .slice(-1)
        .map((f) => f.note),
      ...withAnchor('done').map((f) => f.note),
    ]).toMatchInlineSnapshot(`
      [
        "11 values, and not one of them will be compared with another to decide its order. What happens instead: tabulate how many times each value occurs, then let the tallies say where each value goes. The counter row is not allocated yet — it is max - min + 1 cells wide, and the range is only known once every value has been seen.",
        "4 seeds both ends of the range: min and max both start here, and every later value is compared against these two running numbers. These 10 checks are the only comparisons in the whole algorithm.",
        "3 is a new minimum, so the range widens to 3 to 4 (1 apart). The counter row will have to be 2 cells wide because of it, and the row is paid for whether or not the integers in between ever occur.",
        "3 sits inside the running extremes 3 and 4, so neither moves. 3 of 11 values scanned, and the row will be 2 cells wide.",
        "Counter 3 absorbs counter 2 and now reads 11, which is the number of values at or below 4. The row has changed meaning: it is no longer a histogram, it is a set of write positions, and 11 is one past the last slot the value 4 may occupy. The answer key is complete — every value now knows exactly where its last copy goes.",
        "Take the rightmost value still to place, 4, which the saved copy still holds at index 10. Counter 3 reads 11, so the last free slot for 4 is 10 — the very cell it came from. Writing to the right is the safe direction: every cell it can land on has already been read. Writing to the left is the dangerous one, because those cells have not been read yet, which is precisely what the saved copy is for.",
        "Take the rightmost value still to place, 3, which the saved copy still holds at index 9. Counter 2 reads 7, so the last free slot for 3 is 6 — 3 cells to the left of it. Writing to the right is the safe direction: every cell it can land on has already been read. Writing to the left is the dangerous one, because those cells have not been read yet, which is precisely what the saved copy is for.",
        "Take the rightmost value still to place, 4, which the saved copy still holds at index 6. Counter 3 reads 10, so the last free slot for 4 is 9 — 3 cells to the right of it. Writing to the right is the safe direction: every cell it can land on has already been read. Writing to the left is the dangerous one, because those cells have not been read yet, which is precisely what the saved copy is for. And index 6 is already showing its final value, not 4 — an earlier write landed on it, so an in-place reader would be holding the wrong number here.",
        "4 is now final at index 7, and counter 3 drops to 7 so the next 4 will take the slot below it — equal values therefore come out in the order they went in, which is the whole of counting sort's stability. 11 of 11 cells now hold their final value, and the array is sorted.",
        "All 11 values are in place after 39 operations: 10 range checks, 4 counters zeroed, 11 tallies, 3 prefix sums and 11 writes. The price is n + k, and not one of those steps asked two values which should come first. The counter row has been wound back to the bucket boundaries — every cell now names the first slot it did *not* hand out, so the row is the set of block starts the placement began from. Here k = 4 against n = 11, which is the arrangement counting sort is built for.",
      ]
    `);
  });

  it('ends on a correctly sorted array on every preset', () => {
    for (const { presetId, result } of runEveryPreset(countingSortAlgo)) {
      const last = result.trace.at(-1);
      expect(last?.result, `preset ${presetId}`).toBe('sorted');
      const values = (last as ArrayFrame).values as number[];
      expect(values, `preset ${presetId}`).toEqual(sortedCopy(values));
      // The independent reference, not the generator: a permutation check would
      // pass on the naive in-place version that turns [3, 1, 2] into [2, 2, 2].
      expect(values, `preset ${presetId}`).toEqual(sortedCopy(valuesOf(presetId)));
      if (valuesOf(presetId).length > 0) {
        expect((last as ArrayFrame).sorted, `preset ${presetId}`).toEqual([
          0,
          valuesOf(presetId).length,
        ]);
      }
    }
  });

  it('never shows two same-coloured groups in the same frame', () => {
    /*
     * The contract test does this for every *registered* algorithm, and it
     * cannot see this module until someone adds it to `registry.ts`. The
     * palette deliberately reuses hues across tiers, so "the groups visible in
     * one frame never collide" is the guarantee a student can actually rely on
     * — and it is per frame, not per algorithm. So it has to be checked here
     * too, locally, or it is checked nowhere.
     */
    const known = new Set<string>(PALETTE_ORDER);
    const clashes: string[] = [];
    const unknown = new Set<string>();
    for (const { presetId, result } of runEveryPreset(countingSortAlgo)) {
      for (const f of result.trace as ArrayFrame[]) {
        const byColour = new Map<string, string[]>();
        for (const [key, idxs] of Object.entries(f.highlight ?? {})) {
          if (!known.has(key)) unknown.add(key);
          // A group with no members is not visible, so it cannot collide.
          if (idxs.length === 0) continue;
          byColour.set(styleForKey(key).fill, [
            ...(byColour.get(styleForKey(key).fill) ?? []),
            key,
          ]);
        }
        for (const [colour, keys] of byColour) {
          if (keys.length > 1) {
            clashes.push(`${presetId} @${f.index}: ${keys.join(' + ')} share ${colour}`);
          }
        }
      }
    }
    expect([...unknown], 'highlight keys outside PALETTE_ORDER').toEqual([]);
    expect([...clashes].sort(), `${clashes.length} same-frame colour collision(s)`).toEqual([]);
  });

  it('gives every frame its own copy of the data — no shared array references', () => {
    /*
     * The documented frame-structure failure mode, and the one the parity
     * harness structurally cannot see: it compares each language's *reported
     * output* against the reference, so four listings and a generator can share
     * a bug perfectly. A frame that shares its `values` — or its
     * `overlay.values` — with a neighbour is a frame that mutates retroactively,
     * and stepping backwards then shows the future. For this module the overlay
     * is the more dangerous of the two: it is rewritten by every phase, so a
     * single shared reference turns the entire prefix-sum story into a row of
     * final values.
     */
    for (const { presetId, result } of runEveryPreset(countingSortAlgo)) {
      const trace = result.trace as ArrayFrame[];
      for (let i = 0; i < trace.length; i++) {
        for (let j = i + 1; j < trace.length; j++) {
          const a = trace[i] as ArrayFrame;
          const b = trace[j] as ArrayFrame;
          expect(a.values, `${presetId}: frames ${i} and ${j} share values`).not.toBe(b.values);
          if (a.overlay && b.overlay) {
            expect(
              a.overlay.values,
              `${presetId}: frames ${i} and ${j} share overlay.values`,
            ).not.toBe(b.overlay.values);
          }
        }
      }
    }
  });

  it('shows the count row as a histogram, then as a non-decreasing answer key', () => {
    /*
     * The phase the whole algorithm turns on, and the one place a plausible
     * looking generator can be quietly wrong.
     *
     * While the prefix sums are *running* the row is a mixture: cells to the
     * left hold running totals, cells to the right still hold raw tallies.
     * For this module that mixture is not monotone — the small-range preset
     * passes through `1, 3, 7, 4` — and it is not supposed to be. The row
     * becomes a genuine prefix-sum array only when the loop finishes.
     *
     * From there on it stays monotone for the whole placement, and that is not
     * obvious: every write decrements one cell. It cannot break the ordering,
     * because a bucket's cursor only ever moves *inside its own block* — so it
     * stays at or above the block's start, which is the previous cell, and below
     * the next block's start, which is the next cell. A cursor that ever fell
     * below its predecessor's start would be handing out a slot another bucket
     * owns, and two values would land in the same cell.
     */
    for (const { presetId } of runEveryPreset(countingSortAlgo)) {
      const input = valuesOf(presetId);
      const n = input.length;
      if (n === 0) continue;
      const k = Math.max(...input) - Math.min(...input) + 1;
      const sums = framesOf(presetId, 'prefix-sum');
      const places = framesOf(presetId, 'place');
      const writes = framesOf(presetId, 'written');
      const completed = [...sums.slice(-1), ...places, ...writes].filter(Boolean) as ArrayFrame[];

      expect(completed.length, `preset ${presetId}`).toBeGreaterThan(0);
      for (const f of completed) {
        const row = overlayOf(f) as number[];
        expect(row?.length, `preset ${presetId} @${f.index}`).toBe(k);
        expect(
          isNonDecreasing(row),
          `preset ${presetId} @${f.index}: the row is not non-decreasing: ${row}`,
        ).toBe(true);
      }

      // The answer key is complete when the prefix-sum loop ends: the last cell
      // is the number of values — one past the last writable slot — and the first
      // is the size of the smallest value's block.
      for (const f of [sums.at(-1), places[0]].filter(Boolean) as ArrayFrame[]) {
        const row = overlayOf(f) as number[];
        expect(row.at(-1), `preset ${presetId} @${f.index}`).toBe(n);
        expect(row[0], `preset ${presetId} @${f.index}`).toBeGreaterThan(0);
      }

      // The contrast, so the checks above cannot pass on a row that never moved:
      // the histogram is the right width, and the last placement has wound every
      // cell back to the first slot it did not hand out — which is the set of
      // block starts, so the row is the prefix sums shifted along by one.
      for (const f of framesOf(presetId, 'count')) {
        expect(overlayOf(f)?.length, `preset ${presetId} @${f.index}`).toBe(k);
      }
      const key = sums.at(-1);
      const lastWrite = writes.at(-1);
      if (key && lastWrite) {
        const prefix = overlayOf(key) as number[];
        expect(overlayOf(lastWrite), `preset ${presetId}`).toEqual([0, ...prefix.slice(0, k - 1)]);
      }
    }
  });

  it('allocates exactly max - min + 1 counters, and says so in the caption', () => {
    // The counter row is the algorithm, and its width is the entire trade. It
    // must be sized by the range and by nothing else — not by n, not by the
    // number of distinct values.
    for (const p of countingSortAlgo.presets) {
      const values = p.input.type === 'numbers' ? p.input.values : [];
      if (values.length === 0) continue;
      const k = Math.max(...values) - Math.min(...values) + 1;
      const rows = runEveryPreset(countingSortAlgo)
        .filter((r) => r.presetId === p.id)
        .flatMap((r) => r.result.trace as ArrayFrame[])
        .map(overlayOf)
        .filter((r): r is number[] => r !== null);
      expect(rows.length, `preset ${p.id}`).toBeGreaterThan(0);
      for (const row of rows) expect(row.length, `preset ${p.id}`).toBe(k);
      expect(framesOf(p.id, 'find-range').at(-1)?.caption, `preset ${p.id}`).toContain(
        `max ${Math.max(...values)}`,
      );
    }
  });

  it('puts the read cursor on an already-moved cell at least once', () => {
    /*
     * The read hazard, made structural rather than asserted in prose.
     *
     * The placement walks the input backwards and writes each value into the
     * slot its prefix sum names. That slot can be *left* of the index it was
     * read from — the destination is the value's rank among the values not yet
     * placed, and there are only `i` of those — so an earlier write can land on
     * a cell that has not been read yet. That is why the phase reads from a
     * saved copy. These frames, where the `i` cursor is already inside the
     * `output` group, are exactly the frames on which an in-place reader would
     * be holding a value that has already been moved.
     */
    let seen = 0;
    for (const { result } of runEveryPreset(countingSortAlgo)) {
      for (const f of result.trace as ArrayFrame[]) {
        if (f.anchor !== 'place') continue;
        const cursor = f.pointers?.['i'];
        if (cursor === undefined) continue;
        if ((f.highlight?.['output'] as number[] | undefined)?.includes(cursor)) seen++;
      }
    }
    expect(
      seen,
      'no placement frame shows the read cursor on an already-written cell',
    ).toBeGreaterThan(0);
  });

  it('keeps the placement groups disjoint and complete', () => {
    // `output` is "this cell already holds its final value" and `outOfPlace` is
    // "it does not". They must partition the array: no cell in both, no cell in
    // neither, and together exactly n. The legend count is derived from these
    // arrays, so a bug here is a legend that says 4 and 7 on an array of 11.
    for (const { presetId, result } of runEveryPreset(countingSortAlgo)) {
      const n = valuesOf(presetId).length;
      for (const f of result.trace as ArrayFrame[]) {
        if (f.anchor !== 'place' && f.anchor !== 'written') continue;
        const done = (f.highlight?.['output'] ?? []) as number[];
        const pending = (f.highlight?.['outOfPlace'] ?? []) as number[];
        expect(new Set(done).size, `preset ${presetId} @${f.index}`).toBe(done.length);
        expect(new Set(pending).size, `preset ${presetId} @${f.index}`).toBe(pending.length);
        expect(
          done.filter((i) => pending.includes(i)),
          `preset ${presetId} @${f.index}: a cell is in both groups`,
        ).toEqual([]);
        expect(
          [...done, ...pending].sort((x, y) => x - y),
          `preset ${presetId} @${f.index}`,
        ).toEqual(Array.from({ length: n }, (_, i) => i));
      }
    }
  });

  it('is deterministic: the same input always yields the same trace', () => {
    for (const p of countingSortAlgo.presets) {
      const a = JSON.stringify(run(p.id).trace);
      const b = JSON.stringify(run(p.id).trace);
      expect(a, `preset ${p.id}`).toBe(b);
    }
  });

  it('terminates on degenerate input', () => {
    for (const values of [[], [42], [7, 7, 7], [1], [3, 1, 2], [5, 5, 1, 1, 9, 9, 9]]) {
      const { trace, error, aborted } = runTrace(countingSortAlgo, {
        input: { type: 'numbers', values },
      });
      expect(error, `values ${JSON.stringify(values)}`).toBeUndefined();
      expect(aborted, `values ${JSON.stringify(values)}`).toBe(false);
      expect(validateTrace(trace), `values ${JSON.stringify(values)}`).toEqual([]);
      expect(trace.at(-1)?.result, `values ${JSON.stringify(values)}`).toBe('sorted');
      expect((trace.at(-1) as ArrayFrame).values).toEqual(sortedCopy(values));
    }
  });

  it('refuses a fractional value rather than rounding it into a bucket', () => {
    // Rounding the counter index looks right on 1.1, 1.2, 1.4 and quietly
    // shuffles 1.45 with 1.5. A refusal is the honest answer.
    const { trace, error } = runTrace(countingSortAlgo, {
      input: { type: 'numbers', values: [1, 2, 2.5, 3] },
    });
    expect(error).toBeUndefined();
    expect(trace.at(-1)?.result).toBe('fractional value');
    expect((trace.at(-1) as ArrayFrame).values).toEqual([1, 2, 2.5, 3]);
  });

  it('costs n + k and not n — the preset that makes that visible', () => {
    // The blow-up preset is the lesson: six values, 272 counters, and every one
    // of the 272 is paid for whether or not the integer it stands for occurs.
    const wide = countingSortAlgo.presets.find((p) => p.id === 'wide-range');
    const values = wide?.input.type === 'numbers' ? wide.input.values : [];
    const k = Math.max(...values) - Math.min(...values) + 1;
    expect(values.length).toBe(6);
    expect(k).toBe(272);
    const last = run('wide-range').trace.at(-1);
    // 3n + 2k - 2 operations: n - 1 range checks, k zeros, n tallies, k - 1
    // prefix sums, n writes.
    expect(Number(last?.vars?.['ops'])).toBe(3 * values.length + 2 * k - 2);
    expect(Number(last?.vars?.['k'])).toBe(k);
    // A comparison sort would have used about 15 comparisons and no counters.
    expect(run('wide-range').count).toBeGreaterThan(5 * values.length);
  });

  it('skips the prefix-sum phase entirely when the range is one counter wide', () => {
    // k - 1 = 0, so the loop that turns tallies into write positions has nothing
    // to do. The declared anchor is still reachable — from every other preset —
    // but the code's shape genuinely changes with the data, and a visualiser
    // that always shows seven phases is lying about this one.
    expect(framesOf('all-equal', 'prefix-sum')).toHaveLength(0);
    expect(framesOf('all-equal', 'count')).toHaveLength(10);
    expect(run('all-equal').count).toBeLessThan(run('small-range').count + 40);
  });

  it('costs the same number of operations whatever order the values arrive in', () => {
    // Not a comparison sort, so there is no worst case to be afraid of: the cost
    // is a function of the multiset, not of the arrangement. The reversed preset
    // and a shuffled n = 9 array pay exactly 3n + 2k - 2.
    const cost = (values: readonly number[]): number => {
      const k = Math.max(...values) - Math.min(...values) + 1;
      return 3 * values.length + 2 * k - 2;
    };
    const ops = (id: string): number => Number(run(id).trace.at(-1)?.vars?.['ops']);
    expect(ops('reverse')).toBe(cost(valuesOf('reverse')));
    expect(ops('small-range')).toBe(cost(valuesOf('small-range')));
    expect(ops('all-equal')).toBe(cost(valuesOf('all-equal')));
  });

  it('stops when asked to', () => {
    let calls = 0;
    const result = runTrace(
      countingSortAlgo,
      { input: preset('small-range').input },
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

  it('declares an anchor only if some preset emits it', () => {
    const reachable = new Set<string>();
    for (const { result } of runEveryPreset(countingSortAlgo)) {
      for (const a of anchorsInTrace(result.trace)) reachable.add(a);
    }
    for (const a of countingSortAlgo.anchors) {
      expect(reachable.has(a), `anchor ${a} is never emitted by any preset`).toBe(true);
    }
    // And nothing emitted is undeclared.
    const declared = new Set(countingSortAlgo.anchors);
    for (const a of reachable) expect(declared.has(a), `undeclared anchor ${a}`).toBe(true);
  });

  it('ships the same anchor set and a note per language for every one', () => {
    const sets = LANGS.map((lang) =>
      Object.keys(countingSortAlgo.lesson.code[lang] ?? '').join('\n'),
    );
    // The listings are the source of truth for the anchor markers; parse them
    // the same way the code panel does rather than trusting the declared list.
    const perLanguage = LANGS.map((lang) =>
      [...(countingSortAlgo.lesson.code[lang] ?? '').matchAll(/@anchor\s+([\w-]+)/g)].map((m) =>
        (m[1] as string).trim(),
      ),
    );
    for (const [i, lang] of LANGS.entries()) {
      const marked = new Set(perLanguage[i]);
      expect([...marked].sort(), `${lang} markers`).toEqual([...countingSortAlgo.anchors].sort());
      const notes = countingSortAlgo.lesson.notes[lang] ?? {};
      for (const anchor of countingSortAlgo.anchors) {
        const note = notes[anchor];
        expect(note, `${lang}/${anchor} has no note`).toBeDefined();
        expect((note as string).length, `${lang}/${anchor} note is too short`).toBeGreaterThan(15);
      }
    }
    // Every listing must expose the identical set — the same set in all four is
    // what makes the highlighted line mean the same step in each language.
    expect(new Set(perLanguage.map((s) => [...s].sort().join(','))).size).toBe(1);
    expect(sets.length).toBe(4);
  });

  it('declares one expectation per preset, computed by an independent sort', () => {
    expect(countingSortAlgo.expectations).toHaveLength(countingSortAlgo.presets.length);
    for (const e of countingSortAlgo.expectations) {
      const p = preset(e.presetId);
      const input = p.input.type === 'numbers' ? p.input.values : [];
      expect(e.args, `preset ${e.presetId}`).toEqual([input]);
      expect(e.result, `preset ${e.presetId}`).toEqual(sortedCopy(input));
    }
  });

  it('declares the trace fields it actually emits', () => {
    expect(countingSortAlgo.viewport).toBe('array');
    expect(countingSortAlgo.category).toBe('sorting');
    expect(countingSortAlgo.id).toBe('counting-sort');
    expect(countingSortAlgo.inputSpec.sizeOf({ type: 'numbers', values: [1, 2, 3] })).toBe(3);
    const highlightKeys = new Set<string>();
    for (const { result } of runEveryPreset(countingSortAlgo)) {
      for (const f of result.trace) {
        for (const k of Object.keys((f as ArrayFrame).highlight ?? {})) highlightKeys.add(k);
        const hl: Highlight = (f as ArrayFrame).highlight ?? {};
        for (const idxs of Object.values(hl)) expect(typeof idxs).toBe('object');
      }
    }
    // Every emitted key is a real palette name, and the set is small on purpose:
    // three groups at a time is the most a student can hold.
    expect([...highlightKeys].sort()).toEqual([
      'active',
      'outOfPlace',
      'output',
      'sorted',
      'unvisited',
    ]);
  });
});
