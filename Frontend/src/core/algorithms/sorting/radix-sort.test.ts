import { describe, expect, it } from 'vitest';
import { styleForKey } from '../../../features/viewport/palette.ts';
import { anchorsInTrace, LANGS } from '../../code/anchors.ts';
import { runEveryPreset, runTrace, validateTrace } from '../../trace/materialise.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import { PALETTE_ORDER } from '../../trace/types.ts';
import type { Preset } from '../types.ts';
import { radixSortAlgo } from './radix-sort.ts';

const preset = (id: string): Preset => {
  const p = radixSortAlgo.presets.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const run = (id: string) =>
  runTrace(radixSortAlgo, { input: preset(id).input, presetParams: preset(id).params });

const framesOf = (id: string, anchor: string): ArrayFrame[] =>
  run(id).trace.filter((f) => f.anchor === anchor);

const valuesOf = (id: string): number[] => {
  const input = preset(id).input;
  return input.type === 'numbers' ? input.values : [];
};

const sortedCopy = (a: readonly number[]): number[] => [...a].sort((x, y) => x - y);

const rowOf = (f: ArrayFrame): number[] => f.values as number[];

const overlayOf = (f: ArrayFrame): number[] | null =>
  f.overlay ? (f.overlay.values as number[]) : null;

const sameMultiset = (a: readonly number[], b: readonly number[]): boolean =>
  JSON.stringify(sortedCopy(a)) === JSON.stringify(sortedCopy(b));

/** True when the row is non-decreasing under `key`. */
const sortedBy = (row: readonly number[], key: (v: number) => number): boolean =>
  row.every((v, i) => i === 0 || key(row[i - 1] as number) <= key(v));

/** Split into fixed-size chunks — one per pass. */
const chunk = <T>(xs: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
};

describe('radix sort', () => {
  it('produces a structurally valid trace on every preset', () => {
    for (const { presetId, result } of runEveryPreset(radixSortAlgo)) {
      expect(validateTrace(result.trace), `preset ${presetId}`).toEqual([]);
      expect(result.trace.length).toBeGreaterThan(0);
      expect(result.truncated, `preset ${presetId}`).toBe(false);
      expect(result.error, `preset ${presetId}`).toBeUndefined();
    }
  });

  it('pins the narration for the three-passes preset', () => {
    // A golden narration snapshot, and the preset chosen on purpose: three passes
    // is the only shape in which LSD's ordering requirement is visible at all.
    // The selection is deliberately mixed — the opening, the pass header, one
    // value's digit and tally, the cursor conversion, a write that changes the
    // row, a write that does not, and the closing frame.
    const trace = run('three-passes').trace;
    const withAnchor = (a: string) => trace.filter((f) => f.anchor === a);
    expect([
      ...trace.slice(0, 2).map((f) => f.note),
      ...withAnchor('place')
        .slice(0, 1)
        .map((f) => f.note),
      ...withAnchor('digit')
        .slice(0, 1)
        .map((f) => f.note),
      ...withAnchor('count')
        .slice(0, 1)
        .map((f) => f.note),
      ...withAnchor('bucket-starts')
        .slice(-1)
        .map((f) => f.note),
      ...withAnchor('stable-place')
        .slice(0, 1)
        .map((f) => f.note),
      ...withAnchor('done').map((f) => f.note),
    ]).toMatchInlineSnapshot(`
      [
        "9 non-negative whole numbers. Radix sort never looks at a whole number: it looks at one digit at a time, and every pass is a counting sort over a range of exactly ten. That fixed width is the deal. From here on the cost stops depending on how large the values are and starts depending on how many digits they have.",
        "The largest value is 880, which has 3 digits, so this will take 3 passes: units, then tens, then hundreds. This one loop is the reason radix sort's cost follows the size of the numbers rather than the number of them, and it is the only place a value is ever compared with anything at all.",
        "Pass 1 of 3 keys on one digit: the digit worth 1. Ten counters, one per digit from 0 to 9, and ten is the same ten whatever the values are — so this pass cannot have counting sort's wide-range failure, and its cost is n plus a constant. The array has not been touched yet.",
        "The value 548 contributes exactly one number to this pass: floor(548 / 1) % 10 = 8. Everything else about it is invisible here — the other digits are not read, and no two values are compared. That is the whole trick: each pass knows one digit, and the passes before it are the only thing holding the rest of each value in order.",
        "Bucket 8 now holds 1 of the 9 values. One tally per value, constant work whatever the digit, and that is where the n in a pass comes from. The array is still exactly as it was when the pass began; the only thing that has changed anywhere is this row.",
        "Bucket 9 is empty — no value has that digit at this place — so its cursor does not move and it owns no slots at all. An empty bucket costs exactly as much as a full one, and that is the point: the row is ten cells wide whatever the data looks like, so there is no version of this pass that gets slower because the digits are spread out.",
        "548, read from index 0 of the array as it stood when this pass began, goes to slot 7 — the lowest free slot in bucket 8, whose cursor has just moved to 8. It replaces 421, and the row changes for the first time in this pass. Reading the source left to right and filling each bucket left to right is what makes this pass stable, and on the first pass there is nothing yet to preserve. 1 of 9 slots now holds this pass's value.",
        "All 9 values are in ascending order after 3 passes and 122 operations. Each pass cost 10 counters, 9 tallies, 10 running totals and 9 writes — 38 — and 3 is a function of the digit count of 880, not of 9. So the price is d times (n + 10): not one comparison, and a cost that would barely move if every value were a hundred times larger.",
      ]
    `);
  });

  it('ends on a correctly sorted array on every preset', () => {
    for (const { presetId, result } of runEveryPreset(radixSortAlgo)) {
      const last = result.trace.at(-1);
      expect(last?.result, `preset ${presetId}`).toBe('sorted');
      const values = rowOf(last as ArrayFrame);
      expect(values, `preset ${presetId}`).toEqual(sortedCopy(values));
      // The independent reference, not the generator: a permutation check would
      // happily pass a pass that dropped or duplicated a value on its way out.
      expect(values, `preset ${presetId}`).toEqual(sortedCopy(valuesOf(presetId)));
      if (valuesOf(presetId).length > 0) {
        expect((last as ArrayFrame).sorted, `preset ${presetId}`).toEqual([
          0,
          valuesOf(presetId).length,
        ]);
      }
    }
  });

  it('keeps the array sorted by the digits seen so far, pass by pass', () => {
    /*
     * The invariant that makes LSD radix sort work, and the strongest structural
     * claim this module can make about its own frames.
     *
     * The `place` frame of pass p + 1 is the array exactly as pass p left it, so
     * it must be non-decreasing under "the lowest p digits" — and under nothing
     * else. For the three-passes preset that means: sorted by units after one
     * pass, by the last two digits after two, and by everything after three.
     * A generator that ran its passes in the wrong order, or that lost the
     * earlier ordering, cannot satisfy this, and neither can one whose
     * placement silently skipped a value.
     */
    for (const { presetId } of runEveryPreset(radixSortAlgo)) {
      const n = valuesOf(presetId).length;
      if (n === 0) continue;
      const openings = framesOf(presetId, 'place');
      expect(openings.length, `preset ${presetId}`).toBeGreaterThan(0);
      expect(
        openings[0]?.values,
        `preset ${presetId}: the first pass must start from the input`,
      ).toEqual(valuesOf(presetId));

      for (let p = 1; p < openings.length; p++) {
        const mod = 10 ** p;
        const row = rowOf(openings[p] as ArrayFrame);
        expect(
          sortedBy(row, (v) => v % mod),
          `preset ${presetId}: after ${p} pass(es) the row is not sorted by the last ${p} digit(s): ${row}`,
        ).toBe(true);
        // Still the same multiset, and still not more sorted than that: a pass
        // that fully sorted the array on its first go would be doing something
        // else, and p = 1 is where that would show.
        expect(sameMultiset(row, valuesOf(presetId)), `preset ${presetId} after ${p}`).toBe(true);
      }
      // The `place` frame of the *last* pass is not the answer — it is the input
      // to that pass, sorted by all but its top digit. Only the `done` frame is.
      const lastOpening = openings[openings.length - 1] as ArrayFrame;
      expect(
        sortedBy(rowOf(lastOpening), (v) => v % 10 ** (openings.length - 1)),
        `preset ${presetId}`,
      ).toBe(true);
    }
  });

  it('is a permutation of the input at every pass boundary, and mid-pass it deliberately is not', () => {
    /*
     * The row is the *destination*, seeded with a copy of the source, so halfway
     * through a pass it holds a mixture: written cells already carry this pass's
     * values and the rest still carry the previous pass's. That is not a bug and
     * it is not a permutation — a cell that has been overwritten has lost the
     * value it was holding, and that value may already be sitting in another
     * cell. Asserting a permutation mid-pass would be asserting a property the
     * visualisation deliberately does not have. The pass boundary is where the
     * claim becomes true, and it must be true there.
     */
    for (const { presetId } of runEveryPreset(radixSortAlgo)) {
      const n = valuesOf(presetId).length;
      if (n === 0) continue;
      const boundaries = [
        ...framesOf(presetId, 'place'),
        ...chunk(framesOf(presetId, 'stable-place'), n).map((c) => c.at(-1) as ArrayFrame),
        run(presetId).trace.at(-1) as ArrayFrame,
      ];
      for (const f of boundaries) {
        expect(
          sameMultiset(rowOf(f), valuesOf(presetId)),
          `preset ${presetId} @${f.index}: ${rowOf(f)} is not a permutation of the input`,
        ).toBe(true);
      }
    }
  });

  it('hands each pass the array the previous pass built', () => {
    // The pass boundary is the one place the two arrays swap roles, and getting
    // it wrong — carrying the old array forward — would still look plausible for
    // one pass and fall apart on the second.
    for (const { presetId } of runEveryPreset(radixSortAlgo)) {
      const openings = framesOf(presetId, 'place');
      const writes = framesOf(presetId, 'stable-place');
      for (let p = 1; p < openings.length; p++) {
        const pass = writes.slice(
          (p - 1) * valuesOf(presetId).length,
          p * valuesOf(presetId).length,
        );
        expect(pass.length, `preset ${presetId} pass ${p}`).toBe(valuesOf(presetId).length);
        expect(rowOf(openings[p] as ArrayFrame), `preset ${presetId} pass ${p}`).toEqual(
          rowOf(pass.at(-1) as ArrayFrame),
        );
      }
    }
  });

  it('does the same structural work in every pass, and the number of passes is the digit count', () => {
    // 1 place frame, n digit frames, n count frames, 10 cursor frames, n writes —
    // per pass. The pass count is the one quantity a comparison sort does not
    // have, and it is a function of the largest value alone.
    for (const p of radixSortAlgo.presets) {
      const input = p.input.type === 'numbers' ? p.input.values : [];
      const n = input.length;
      const max = n > 0 ? Math.max(...input) : 0;
      const passes = max === 0 ? 0 : String(max).length;
      expect(framesOf(p.id, 'max-digits').length, `preset ${p.id}`).toBe(n > 0 ? 1 : 0);
      expect(framesOf(p.id, 'place').length, `preset ${p.id}`).toBe(passes);
      expect(framesOf(p.id, 'digit').length, `preset ${p.id}`).toBe(passes * n);
      expect(framesOf(p.id, 'count').length, `preset ${p.id}`).toBe(passes * n);
      expect(framesOf(p.id, 'bucket-starts').length, `preset ${p.id}`).toBe(passes * 10);
      expect(framesOf(p.id, 'stable-place').length, `preset ${p.id}`).toBe(passes * n);
      // n - 1 comparisons for the maximum, then 2n + 20 per pass.
      const ops = n > 0 ? n - 1 + passes * (2 * n + 20) : 0;
      expect(Number(run(p.id).trace.at(-1)?.vars?.['ops']), `preset ${p.id}`).toBe(ops);
    }
  });

  it('never lets k grow: the counter row is always ten cells', () => {
    // The whole difference from counting sort. k is pinned at 10 whatever the
    // values are, so this module cannot have counting sort's wide-range
    // failure — and the trace proves it structurally rather than in prose.
    for (const { presetId, result } of runEveryPreset(radixSortAlgo)) {
      for (const f of result.trace as ArrayFrame[]) {
        const row = overlayOf(f);
        if (row === null) continue;
        expect(row.length, `preset ${presetId} @${f.index}`).toBe(10);
        for (const v of row) expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('runs one complete cursor lifecycle per pass, and the blocks tile the array', () => {
    /*
     * `count[d]` means two different things in one pass — first a tally, then the
     * first free slot for that digit — and the transition is where a two-cells-
     * per-bucket bug would show. The whole lifecycle is checkable from the frames
     * alone, and this walks all of it:
     *
     *   1. the last `count` frame of a pass holds the finished histogram;
     *   2. each `bucket-starts` frame changes exactly one cell;
     *   3. the tenth of them holds the running totals of that histogram, and they
     *      sum to n, which is what "the buckets tile the array" means;
     *   4. after the last write every cursor sits at its block's *end*.
     */
    for (const { presetId } of runEveryPreset(radixSortAlgo)) {
      const n = valuesOf(presetId).length;
      if (n === 0) continue;
      const talliesPerPass = chunk(framesOf(presetId, 'count'), n);
      const startFrames = chunk(framesOf(presetId, 'bucket-starts'), 10);
      const writeFrames = chunk(framesOf(presetId, 'stable-place'), n);
      expect(startFrames.length, `preset ${presetId}`).toBeGreaterThan(0);
      expect(writeFrames.length, `preset ${presetId}`).toBe(startFrames.length);

      for (let p = 0; p < startFrames.length; p++) {
        const tallies = overlayOf(
          (talliesPerPass[p] as ArrayFrame[]).at(-1) as ArrayFrame,
        ) as number[];
        expect(tallies, `preset ${presetId} pass ${p + 1}`).toBeDefined();

        // 2. exactly one cell moves per frame.
        for (let d = 1; d < 10; d++) {
          const prev = overlayOf((startFrames[p] as ArrayFrame[])[d - 1] as ArrayFrame) as number[];
          const row = overlayOf((startFrames[p] as ArrayFrame[])[d] as ArrayFrame) as number[];
          for (let other = 0; other < 10; other++) {
            if (other === d) continue;
            expect(row[other], `preset ${presetId} pass ${p + 1} cell ${other}`).toBe(prev[other]);
          }
        }

        // 3. the finished row is the running totals of that histogram, and they
        // add up to n — so the ten blocks are contiguous, ordered and complete.
        const starts = overlayOf((startFrames[p] as ArrayFrame[])[9] as ArrayFrame) as number[];
        let acc = 0;
        for (let d = 0; d < 10; d++) {
          expect(starts[d], `preset ${presetId} pass ${p + 1} cell ${d}`).toBe(acc);
          acc += tallies[d] as number;
        }
        expect(acc, `preset ${presetId} pass ${p + 1}`).toBe(n);

        // 4. and every cursor ends at its block's end once the pass is done.
        const ends = overlayOf((writeFrames[p] as ArrayFrame[]).at(-1) as ArrayFrame) as number[];
        for (let d = 0; d < 10; d++) {
          expect(ends[d], `preset ${presetId} pass ${p + 1} cell ${d}`).toBe(
            (starts[d] as number) + (tallies[d] as number),
          );
        }
        expect(ends[9], `preset ${presetId} pass ${p + 1}`).toBe(n);
      }
    }
  });

  it('keeps the placement groups disjoint and complete', () => {
    // `output` is "this cell already holds this pass's value" and `outOfPlace`
    // is "it does not". They must partition the array: no cell in both, none in
    // neither, and together exactly n — which is also what proves the buckets
    // never collide, since a collision would be one cell claimed twice and
    // another cell claimed by nobody.
    for (const { presetId, result } of runEveryPreset(radixSortAlgo)) {
      const n = valuesOf(presetId).length;
      for (const f of result.trace as ArrayFrame[]) {
        if (f.anchor !== 'stable-place') continue;
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

  it('never shows two same-coloured groups in the same frame', () => {
    /*
     * The contract test does this for every *registered* algorithm, and it
     * cannot see this module until someone adds it to `registry.ts`. The palette
     * deliberately reuses hues across tiers, so "the groups visible in one frame
     * never collide" is the guarantee a student can actually rely on — and it is
     * per frame, not per algorithm. So it has to be checked here too, or
     * nowhere.
     */
    const known = new Set<string>(PALETTE_ORDER);
    const clashes: string[] = [];
    const unknown = new Set<string>();
    for (const { presetId, result } of runEveryPreset(radixSortAlgo)) {
      for (const f of result.trace as ArrayFrame[]) {
        const byColour = new Map<string, string[]>();
        for (const [key, idxs] of Object.entries(f.highlight ?? {})) {
          if (!known.has(key)) unknown.add(key);
          // A group with no members is not visible, so it cannot collide.
          if (idxs.length === 0) continue;
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
    expect([...unknown], 'highlight keys outside PALETTE_ORDER').toEqual([]);
    expect([...clashes].sort(), `${clashes.length} same-frame colour collision(s)`).toEqual([]);
  });

  it('gives every frame its own copy of the data — no shared array references', () => {
    /*
     * The documented frame-structure failure mode, and the one the parity
     * harness structurally cannot see: it compares each language's *reported
     * output* against the reference, so four listings and a generator can share
     * a bug perfectly. A frame that shares its `values` — or its
     * `overlay.values` — with a neighbour mutates retroactively, and stepping
     * backwards then shows the future. Here it would be doubly bad: the row is
     * rewritten by every write of every pass, so one shared reference would make
     * the whole array look finished from the first frame.
     */
    for (const { presetId, result } of runEveryPreset(radixSortAlgo)) {
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

  it('is deterministic: the same input always yields the same trace', () => {
    for (const p of radixSortAlgo.presets) {
      expect(JSON.stringify(run(p.id).trace), `preset ${p.id}`).toBe(
        JSON.stringify(run(p.id).trace),
      );
    }
  });

  it('terminates on degenerate input', () => {
    for (const values of [[], [42], [7, 7, 7], [0, 0, 0], [10, 1], [1, 10, 100, 1000]]) {
      const { trace, error, aborted } = runTrace(radixSortAlgo, {
        input: { type: 'numbers', values },
      });
      expect(error, `values ${JSON.stringify(values)}`).toBeUndefined();
      expect(aborted, `values ${JSON.stringify(values)}`).toBe(false);
      expect(validateTrace(trace), `values ${JSON.stringify(values)}`).toEqual([]);
      expect(trace.at(-1)?.result, `values ${JSON.stringify(values)}`).toBe('sorted');
      expect((trace.at(-1) as ArrayFrame).values).toEqual(sortedCopy(values));
    }
  });

  it('runs no passes at all when the largest value is 0', () => {
    // `place <= max` fails immediately, so the answer is the input — which is
    // already sorted. A pass count of 1 for an array of zeros would be a lie
    // about the code the listings show.
    const { trace } = runTrace(radixSortAlgo, { input: { type: 'numbers', values: [0, 0, 0] } });
    expect(trace.filter((f) => f.anchor === 'place')).toHaveLength(0);
    expect(Number(trace.at(-1)?.vars?.['passes'])).toBe(0);
  });

  it('refuses a negative value rather than filing it under the wrong digit', () => {
    // floor(-47 / 10) % 10 is 3 in JavaScript and Python and -4 truncated in
    // Java and C++, and every one of those is an ordinary bucket. The sign is
    // the reason the offset trick exists, so the module says so and stops.
    const { trace, error } = runTrace(radixSortAlgo, {
      input: { type: 'numbers', values: [3, -47, 12] },
    });
    expect(error).toBeUndefined();
    expect(trace.at(-1)?.result).toBe('negative value');
    expect((trace.at(-1) as ArrayFrame).values).toEqual([3, -47, 12]);
    expect(trace.filter((f) => f.anchor === 'place')).toHaveLength(0);
  });

  it('refuses a fractional value for the same reason', () => {
    const { trace, error } = runTrace(radixSortAlgo, {
      input: { type: 'numbers', values: [1, 12.5, 30] },
    });
    expect(error).toBeUndefined();
    expect(trace.at(-1)?.result).toBe('fractional value');
    expect((trace.at(-1) as ArrayFrame).values).toEqual([1, 12.5, 30]);
  });

  it('is one pass on single-digit input and three on three-digit input', () => {
    // The best case the brief asks for, and the reason the `single-digit` preset
    // exists: d = 1 collapses the whole algorithm into one counting sort.
    expect(framesOf('single-digit', 'place')).toHaveLength(1);
    expect(framesOf('all-equal', 'place')).toHaveLength(1);
    expect(framesOf('two-digit', 'place')).toHaveLength(2);
    expect(framesOf('reverse', 'place')).toHaveLength(2);
    expect(framesOf('three-passes', 'place')).toHaveLength(3);
    // The interesting preset really is mid-sort after two passes. 44 is the
    // smallest value in the array, and its hundreds digit is a zero that nobody
    // has read yet, so it walks inwards: 6th after the units pass, 5th after the
    // tens pass, first only once the hundreds pass has run. `place` frame p is
    // the array *before* pass p, so the finished answer is the `done` frame.
    const openings = framesOf('three-passes', 'place');
    expect(rowOf(openings[0] as ArrayFrame)).toEqual(valuesOf('three-passes'));
    expect(rowOf(openings[1] as ArrayFrame).indexOf(44)).toBe(6);
    expect(rowOf(openings[2] as ArrayFrame).indexOf(44)).toBe(4);
    const finished = rowOf(run('three-passes').trace.at(-1) as ArrayFrame);
    expect(finished.indexOf(44)).toBe(0);
    expect(finished).toEqual([44, 201, 392, 421, 548, 573, 708, 731, 880]);
  });

  it('leaves the array alone on the all-equal preset, because a pass has nothing to do', () => {
    // Every value lands in the cell it came from, so every write frame says so
    // and no row ever changes. This is the cheapest demonstration that the
    // buckets tile the array rather than overlapping.
    const input = valuesOf('all-equal');
    for (const f of framesOf('all-equal', 'stable-place')) {
      expect(rowOf(f)).toEqual(input);
      expect(f.note).toContain('already held');
    }
  });

  it('leaves stability unobservable — and says so in the listing', () => {
    /*
     * Not a test of the algorithm; a test of an admission. Sorting plain integers
     * makes stability invisible, because two equal values are the same number and
     * the picture has nothing to distinguish them. It only becomes a wrong answer
     * when the values carry something else. So the claim is not asserted here —
     * it is asserted in the `stable-place` notes, with a worked counterexample:
     * an unstable pass over [122, 2, 122, 2, 1002] returns
     * [122, 122, 2, 2, 1002] and the stable one returns [2, 2, 122, 122, 1002].
     */
    const input = [122, 2, 122, 2, 1002];
    // The stable generator gets it right...
    const stable = runTrace(radixSortAlgo, { input: { type: 'numbers', values: input } });
    expect((stable.trace.at(-1) as ArrayFrame).values).toEqual([2, 2, 122, 122, 1002]);
    // ...and the reversed-payload version of the claim is what the notes warn
    // about, so a reader has something concrete to picture.
    const reversed = [...input];
    expect(sortedCopy(reversed)).toEqual([2, 2, 122, 122, 1002]);
    expect(sortedCopy(reversed)).not.toEqual([122, 122, 2, 2, 1002]);
    // Every language has to name the requirement, and at least one has to show
    // the failure. The worked example deliberately lives in exactly one note and
    // the other three point at it, so a reader who switches tabs is not made to
    // re-read the same counterexample four times.
    let withExample = 0;
    for (const lang of LANGS) {
      const note = radixSortAlgo.lesson.notes[lang]?.['stable-place'];
      expect(note, `${lang}/stable-place has no note`).toBeDefined();
      expect(note as string, `${lang}`).toMatch(/stab/i);
      expect((note as string).length, `${lang}`).toBeGreaterThan(200);
      if ((note as string).includes('122')) withExample++;
    }
    expect(withExample, 'no listing note carries the [122, 2, 122, 2, 1002] example').toBe(1);
  });

  it('stops when asked to', () => {
    let calls = 0;
    const result = runTrace(
      radixSortAlgo,
      { input: preset('three-passes').input },
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
    for (const { result } of runEveryPreset(radixSortAlgo)) {
      for (const a of anchorsInTrace(result.trace)) reachable.add(a);
    }
    for (const a of radixSortAlgo.anchors) {
      expect(reachable.has(a), `anchor ${a} is never emitted by any preset`).toBe(true);
    }
    const declared = new Set(radixSortAlgo.anchors);
    for (const a of reachable) expect(declared.has(a), `undeclared anchor ${a}`).toBe(true);
  });

  it('ships the same anchor set and a note per language for every one', () => {
    // The four listings are separate artefacts, so the markers are parsed the
    // same way the code panel does rather than trusting the declared list — a
    // marker that drifts out of a listing is exactly the bug this catches.
    const perLanguage = LANGS.map((lang) =>
      [...(radixSortAlgo.lesson.code[lang] ?? '').matchAll(/@anchor\s+([\w-]+)/g)].map((m) =>
        (m[1] as string).trim(),
      ),
    );
    for (const [i, lang] of LANGS.entries()) {
      expect([...new Set(perLanguage[i])].sort(), `${lang} markers`).toEqual(
        [...radixSortAlgo.anchors].sort(),
      );
      const notes = radixSortAlgo.lesson.notes[lang] ?? {};
      for (const anchor of radixSortAlgo.anchors) {
        const note = notes[anchor];
        expect(note, `${lang}/${anchor} has no note`).toBeDefined();
        expect((note as string).length, `${lang}/${anchor} note is too short`).toBeGreaterThan(15);
      }
    }
    // Every listing must expose the identical set — the same set in all four is
    // what makes the highlighted line mean the same step in each language.
    expect(new Set(perLanguage.map((s) => [...s].sort().join(','))).size).toBe(1);
  });

  it('declares one expectation per preset, computed by an independent sort', () => {
    expect(radixSortAlgo.expectations).toHaveLength(radixSortAlgo.presets.length);
    for (const e of radixSortAlgo.expectations) {
      const p = preset(e.presetId);
      const input = p.input.type === 'numbers' ? p.input.values : [];
      expect(e.args, `preset ${e.presetId}`).toEqual([input]);
      expect(e.result, `preset ${e.presetId}`).toEqual(sortedCopy(input));
    }
  });

  it('declares the trace fields it actually emits', () => {
    expect(radixSortAlgo.id).toBe('radix-sort');
    expect(radixSortAlgo.viewport).toBe('array');
    expect(radixSortAlgo.category).toBe('sorting');
    expect(radixSortAlgo.inputSpec.sizeOf({ type: 'numbers', values: [1, 2, 3] })).toBe(3);
    // No two presets share a seed: two presets that call the same generator with
    // the same seed produce the same multiset, which looks like variety and is
    // not.
    const fingerprints = radixSortAlgo.presets.map((p) =>
      JSON.stringify(p.input.type === 'numbers' ? p.input.values : []),
    );
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
    const highlightKeys = new Set<string>();
    for (const { result } of runEveryPreset(radixSortAlgo)) {
      for (const f of result.trace) {
        for (const k of Object.keys((f as ArrayFrame).highlight ?? {})) highlightKeys.add(k);
      }
    }
    // Three groups at a time is the most a student can hold, and the set is
    // short on purpose.
    expect([...highlightKeys].sort()).toEqual([
      'active',
      'current',
      'outOfPlace',
      'output',
      'sorted',
      'unvisited',
    ]);
  });
});
