import { byLanguage } from '../../code/anchors.ts';
import { fewDistinctArray, randomArray, reversedArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Radix Sort (LSD) — counting sort, run once per digit, least significant first.
 *
 * The idea is one sentence long: *a number is a stack of digits, and a stack
 * sorts from the bottom up.* Counting sort cannot look at a whole number — it
 * can only count. Radix sort therefore never asks to sort a number at all: it
 * asks to sort by the units digit, then the tens digit, then the hundreds
 * digit, and each of those requests is a counting sort over a range of exactly
 * ten. Because LSD is the only order that works, the passes run from the least
 * significant digit upwards, and every one of them has to be **stable** or it
 * quietly undoes the pass before it.
 *
 * Three things make it worth animating.
 *
 *  1. **k is 10. Always.** Every pass is a counting sort over a range of ten,
 *     so `k` has nothing to do with the size of the values. That single fact is
 *     the whole difference from counting sort and the reason radix sort does
 *     not have counting sort's failure mode: sorting 4 000 000 ninety-digit
 *     numbers costs about what sorting nine single-digit ones costs. What it
 *     spends that factor on instead is `d`, the number of digits.
 *
 *  2. **The row is the destination, and frozen on the way in.** There is
 *     exactly one row available and a pass needs two arrays, so one of them has
 *     to be invisible. The row shows the one being *built*: showing the source
 *     instead would leave the array unchanged for the whole pass and make every
 *     write invisible, which teaches nothing. The ten bucket cursors are the
 *     source-side bookkeeping, and they earn an overlay precisely because they
 *     are small, always ten, and always the interesting part — `count[d]`
 *     walks right as bucket `d` fills.
 *
 *  3. **After pass p the array is sorted by its lowest p digits.** That is a far
 *     weaker claim than "sorted", it is the invariant every pass maintains, and
 *     watching it hold pass by pass is the whole lesson. The final pass is the
 *     only one that produces the answer.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 53;

/**
 * One array per preset, hoisted so a preset's `size` and its `values` can never
 * disagree — the generator honours `params.size`, so a preset that stored more
 * values than it asked for would be silently truncated and the animation would
 * stop matching the code the verification harness runs.
 */
const SINGLE_DIGIT = fewDistinctArray(SEED, 10, 5, 2);
const TWO_DIGIT = randomArray(SEED + 1, 8, 10, 99);
const THREE_PASSES = randomArray(SEED + 8, 9, 1, 999);
const ALL_EQUAL = fewDistinctArray(SEED + 14, 8, 1, 6);
const REVERSED = reversedArray(SEED + 15, 8, 10, 99);

const PRESETS: Preset[] = [
  {
    id: 'single-digit',
    label: 'Single digit (best case)',
    blurb:
      'The best case, and the only one that is genuinely a single pass. Every value is below 10, so the largest has one digit, the pass loop runs exactly once, and radix sort collapses into one counting sort. Compare the `max-digits` caption with the three-passes preset: 1, not 3.',
    input: { type: 'numbers', values: SINGLE_DIGIT },
    params: { size: SINGLE_DIGIT.length },
  },
  {
    id: 'two-digit',
    label: 'Two digits',
    blurb:
      'The ordinary case: two passes, units then tens. The first pass groups the values by their last digit and leaves the tens digits in whatever order they arrived; the second pass groups by the tens digit and — this is the part worth watching — carries the units order along with it, because the second pass is stable.',
    input: { type: 'numbers', values: TWO_DIGIT },
    params: { size: TWO_DIGIT.length },
  },
  {
    id: 'three-passes',
    label: 'Three passes',
    blurb:
      'The interesting one, and the reason LSD is the only order that works. After pass 1 the array is sorted by units alone. After pass 2 it is sorted by the last two digits — and nothing of pass 1 survives except through the stability of pass 2. Watch 44: it is the smallest value in the array and it is nowhere near the front after two passes, because its hundreds digit is a zero and nobody has read it yet. Only the third pass moves it.',
    input: { type: 'numbers', values: THREE_PASSES },
    params: { size: THREE_PASSES.length },
  },
  {
    id: 'all-equal',
    label: 'Every value identical',
    blurb:
      'Eight copies of one digit, so one pass that changes nothing: every value lands in the cell it came from. This is the shape of a pass with no work to do, and it is the cheapest way to see that the ten buckets tile the array rather than overlapping.',
    input: { type: 'numbers', values: ALL_EQUAL },
    params: { size: ALL_EQUAL.length },
  },
  {
    id: 'reverse',
    label: 'Reversed',
    blurb:
      'Descending input, two digits. Radix sort has no worst case in the comparison-sort sense — the cost is a function of n and d, not of the arrangement — but the first pass still has real work here, because descending order is the least convenient starting point a units pass can be handed.',
    input: { type: 'numbers', values: REVERSED },
    params: { size: REVERSED.length },
  },
  {
    id: 'empty',
    label: 'Empty',
    blurb:
      'The degenerate case. There is no largest value, so there is no digit count, so the pass loop never runs and there is nothing to animate. The run still has to produce a valid frame rather than reading a[0] of nothing.',
    input: { type: 'numbers', values: [] },
    params: { size: 0 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

const BUCKET_LABEL = 'buckets 0-9 — one counter per digit at the current place';

/**
 * The widest value this module will accept.
 *
 * Not a memory limit — a sanity one. A pass emits 2n + 21 frames, so at n = 40
 * and nine digits that is upwards of 700 frames, each holding a copy of the
 * array and the ten counters. Nine digits is also where radix sort stops being
 * competitive for its own reasons: thirteen passes over the data to reproduce
 * what 40 comparisons would have done, which is the same "worse than O(n log n)
 * in practice" wall counting sort hits from the other side.
 */
const MAX_DIGITS = 9;

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** "pass" pluralises to "passes", so it cannot go through `plural`. */
const passesWord = (count: number): string => `${count} ${count === 1 ? 'pass' : 'passes'}`;

export function* radixSort(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const size = Number(ctx.params.size ?? input.values.length);
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  // `let`, not `const`: each pass replaces the array with the one it built, and
  // the next pass then reads *that*. Rebinding is the whole data flow.
  let values = [...source].slice(0, Math.max(0, size));
  const n = values.length;

  let ops = 0;

  /*
   * The domain, checked before the first frame claims anything about it.
   *
   * Two requirements hide behind one word, and both are arithmetic rather than
   * policy. `Math.floor(v / place) % 10` only names a digit for `v >= 0`: for
   * `v = -47` and `place = 1` it returns 3, an entirely ordinary bucket, so a
   * negative value sorts itself into the array with no error and no guarantee.
   * The real repairs are an offset — add a constant large enough to lift every
   * value non-negative, sort, subtract it back, and pay d extra additions — or
   * a signed-digit trick, which shifts each number left by one bit so the sign
   * bit becomes the top digit, and a final pass puts the negatives back in
   * order.
   *
   * The division is the second trap and it is a real cross-language one.
   * JavaScript's `/` always produces a float, so the floor is mandatory there;
   * Python's `//` is already a floor; Java and C++ truncate towards zero. On
   * non-negative input the three agree. On negative input Python and
   * JavaScript say -5 where Java and C++ say -4, which is one more reason the
   * non-negative precondition is load-bearing rather than decorative.
   */
  const hasNegative = values.some((v) => v < 0);
  const hasFractional = values.some((v) => !Number.isInteger(v));

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    caption: `${n} value${n === 1 ? '' : 's'}`,
    note:
      n === 0
        ? 'Nothing to sort. There is no largest value, so there is no digit count, so there is no pass to run — the only zero-length case in this whole family that costs literally nothing.'
        : `${n} non-negative whole numbers. Radix sort never looks at a whole number: it looks at one digit at a time, and every pass is a counting sort over a range of exactly ten. That fixed width is the deal. From here on the cost stops depending on how large the values are and starts depending on how many digits they have.`,
    values: [...values],
    highlight: { unvisited: range(0, n) },
    vars: { n },
  };

  if (n === 0) {
    yield {
      kind: 'array',
      index: 0,
      anchor: 'done',
      caption: 'nothing to sort',
      note: 'The array is empty, so it is sorted by definition: no largest value, no digit count, no passes, and not one operation performed.',
      values: [],
      highlight: {},
      result: 'sorted',
      ops,
      vars: { ops, n },
    };
    return;
  }

  if (hasNegative || hasFractional) {
    yield {
      kind: 'array',
      index: 0,
      anchor: 'done',
      caption: 'refused',
      note: hasNegative
        ? 'Stopping here, with the array exactly as it arrived. A negative number has no digit in a place value — -47 does not have a tens digit of 4, it has a sign and a magnitude — and `floor(v / place) % 10` will file it under bucket 3 as if it were 3-something. The standard repair is an offset: add a constant large enough to lift every value non-negative, sort, subtract it back. A signed-digit shift is the other, and both are extra work that the non-negative version gets for free.'
        : 'Stopping here, with the array exactly as it arrived. `floor(v / place) % 10` names a digit only for whole numbers: 12.5 has no tens digit of 1 in any sense a radix sort can use, and rounding it into shape first would be a different algorithm with a different answer.',
      values: [...values],
      highlight: { unvisited: range(0, n) },
      result: hasNegative ? 'negative value' : 'fractional value',
      ops,
      vars: { ops, n },
    };
    return;
  }

  /* -- How many passes, and therefore how much work ---------------------- */

  let max = values[0] as number;
  for (let i = 1; i < n; i++) {
    if (ctx.shouldStop()) return;
    ops++;
    const v = values[i] as number;
    if (v > max) max = v;
  }

  // A maximum of 0 needs no pass at all, which is exactly what the
  // `place <= max` loop condition in all four listings says for itself. Every
  // other maximum needs one pass per decimal digit.
  const passes = max === 0 ? 0 : String(max).length;

  yield {
    kind: 'array',
    index: 0,
    anchor: 'max-digits',
    caption: `max ${max} · ${passesWord(passes)}`,
    note:
      passes === 0
        ? 'The largest value is 0, so there are no place values to visit and the array is already in order. Everything else about radix sort is the general case of this sentence.'
        : `The largest value is ${max}, which has ${plural(passes, 'digit')}, so this will take ${passesWord(passes)}: units, then tens${passes > 2 ? ', then hundreds' : ''}. This one loop is the reason radix sort's cost follows the size of the numbers rather than the number of them, and it is the only place a value is ever compared with anything at all.`,
    values: [...values],
    highlight: { unvisited: range(0, n) },
    ops,
    vars: { max, passes },
  };

  if (passes > MAX_DIGITS) {
    yield {
      kind: 'array',
      index: 0,
      anchor: 'done',
      caption: 'refused',
      note: `Stopping here, with the array untouched. The largest value has ${passes} digits, so this would be ${passesWord(passes)} over ${n} values — around ${passes * (2 * n + 20)} operations, none of them a comparison, to reproduce what about ${Math.ceil(n * (Math.log2(n) || 1))} comparisons would have done. That is the wall radix sort hits from the opposite side to counting sort: there, k grows with the range; here, d grows with the width, and past about d = log2 n the linear-per-pass advantage is spent.`,
      values: [...values],
      highlight: { unvisited: range(0, n) },
      result: 'too many digits',
      ops,
      vars: { ops, n, max, passes },
    };
    return;
  }

  /* -- One stable counting-sort pass per digit place --------------------- */

  for (let p = 0; p < passes; p++) {
    if (ctx.shouldStop()) return;
    const place = 10 ** p;

    /*
     * The two arrays a pass genuinely needs, and the one the student sees.
     *
     * A counting-sort-by-digit pass reads `src` and writes `out`, and neither
     * can be the other: a value's destination is in a different bucket and can
     * be anywhere at all, so writing into the array being read is the same read
     * hazard the counting-sort listing is built around, only less obviously
     * fatal. So a pass spends n cells of scratch.
     *
     * The row on screen is `out`, seeded with a copy of `src`, and that is the
     * honest version of the trick. A cell that has not been written yet still
     * shows what it held when the pass began, and since every cell is written
     * exactly once, the cells whose value never changes are precisely the cells
     * that were already in the right relative order for this digit. Those are
     * the `outOfPlace` cells, and watching them thin out is the visual proof
     * that the buckets really do tile the array.
     */
    const src = [...values];
    const out = [...values];
    /** Ten counters: first a histogram of digits, then ten write cursors. */
    const count: number[] = new Array<number>(10).fill(0);
    ops += 10;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'place',
      caption: `pass ${p + 1} of ${passes} · place ${place}`,
      note: `Pass ${p + 1} of ${passes} keys on one digit: the digit worth ${place}. Ten counters, one per digit from 0 to 9, and ten is the same ten whatever the values are — so this pass cannot have counting sort's wide-range failure, and its cost is n plus a constant. The array has not been touched yet.`,
      values: [...values],
      highlight: { unvisited: range(0, n) },
      overlay: { label: BUCKET_LABEL, values: [...count], pointers: {} },
      ops,
      vars: { pass: p + 1, passes, place, n },
    };

    /* -- Tally the digits: still counting sort, still no comparisons ----- */

    for (let i = 0; i < n; i++) {
      if (ctx.shouldStop()) return;
      const v = src[i] as number;
      const d = Math.floor(v / place) % 10;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'digit',
        caption: `pass ${p + 1} of ${passes} · place ${place}`,
        note: `The value ${v} contributes exactly one number to this pass: floor(${v} / ${place}) % 10 = ${d}. Everything else about it is invisible here — the other digits are not read, and no two values are compared. That is the whole trick: each pass knows one digit, and the passes before it are the only thing holding the rest of each value in order.`,
        values: [...values],
        pointers: { i },
        highlight: { active: [i] },
        overlay: { label: BUCKET_LABEL, values: [...count], pointers: { digit: d } },
        ops,
        vars: { i, v, place, digit: d },
      };

      const before = count[d] as number;
      count[d] = before + 1;
      ops++;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'count',
        caption: `pass ${p + 1} of ${passes} · place ${place}`,
        note: `Bucket ${d} now holds ${before + 1} of the ${n} values. One tally per value, constant work whatever the digit, and that is where the n in a pass comes from. The array is still exactly as it was when the pass began; the only thing that has changed anywhere is this row.`,
        values: [...values],
        pointers: { i },
        highlight: { active: [i] },
        overlay: { label: BUCKET_LABEL, values: [...count], pointers: { digit: d } },
        ops,
        vars: { i, v, place, digit: d, tally: before + 1 },
      };
    }

    /* -- Tallies become write cursors ------------------------------------ */

    let acc = 0;
    for (let d = 0; d < 10; d++) {
      if (ctx.shouldStop()) return;
      const tallies = count[d] as number;
      count[d] = acc;
      acc += tallies;
      ops++;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'bucket-starts',
        caption: `pass ${p + 1} of ${passes} · place ${place}`,
        note:
          d === 0
            ? `Nothing sorts below digit 0, so bucket 0 starts writing at slot 0. From here on the row means something different: cell ${d} is no longer a count, it is the next free destination for a value whose digit is ${d}. The ten cursors together claim slots 0 to ${n - 1}, each exactly once.`
            : tallies === 0
              ? `Bucket ${d} is empty — no value has that digit at this place — so its cursor does not move and it owns no slots at all. An empty bucket costs exactly as much as a full one, and that is the point: the row is ten cells wide whatever the data looks like, so there is no version of this pass that gets slower because the digits are spread out.`
              : `Bucket ${d} holds ${plural(tallies, 'value')}, so its cursor starts at ${acc} and those values own slots ${acc} to ${acc + tallies - 1}. Summing left to right is what makes the buckets contiguous: ${acc} of the ${n} slots are now claimed by the digits below ${d}, and no two of them can want the same one.`,
        values: [...values],
        highlight: { unvisited: range(0, n) },
        overlay: { label: BUCKET_LABEL, values: [...count], pointers: { digit: d } },
        ops,
        vars: { digit: d, tallies, slot: acc, claimed: acc },
      };
    }

    /* -- Place, in order, which is the entire requirement ----------------- */

    const filled: boolean[] = new Array<boolean>(n).fill(false);
    let placed = 0;

    for (let i = 0; i < n; i++) {
      if (ctx.shouldStop()) return;
      const v = src[i] as number;
      const d = Math.floor(v / place) % 10;
      const slot = count[d] as number;
      const occupant = out[slot] as number;

      out[slot] = v;
      count[d] = slot + 1;
      filled[slot] = true;
      placed++;
      ops++;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'stable-place',
        caption: `pass ${p + 1} of ${passes} · place ${place}`,
        note: `${v}, read from index ${i} of the array as it stood when this pass began, goes to slot ${slot} — the lowest free slot in bucket ${d}, whose cursor has just moved to ${slot + 1}. ${occupant === v ? `That cell already held ${v}, so nothing in the row changes: the value was already in the right relative order for this digit.` : `It replaces ${occupant}, and the row changes${placed === 1 ? ' for the first time in this pass' : ''}.`} Reading the source left to right and filling each bucket left to right is what makes this pass stable${p === 0 ? ', and on the first pass there is nothing yet to preserve' : `, and it is the only reason the ${plural(p, 'earlier pass')} survives this one`}. ${placed} of ${n} slots now ${placed === 1 ? 'holds' : 'hold'} this pass's value.`,
        values: [...out],
        pointers: { slot },
        highlight: {
          current: [slot],
          output: cellsWhere(filled, true),
          outOfPlace: cellsWhere(filled, false),
        },
        overlay: { label: BUCKET_LABEL, values: [...count], pointers: { digit: d } },
        ops,
        vars: { read: i, v, place, digit: d, slot, next: slot + 1, placed },
      };
    }

    // The pass is over and the row *is* the new array. Rebinding rather than
    // mutating in place is what lets the next pass read a snapshot that nothing
    // in this pass can still reach.
    values = [...out];
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'done',
    caption: `sorted · ${ops} operations`,
    note: `All ${n} values are in ascending order after ${passesWord(passes)} and ${ops} operations. Each pass cost 10 counters, ${n} tallies, 10 running totals and ${n} writes — ${2 * n + 20} — and ${passes} is a function of the digit count of ${max}, not of ${n}. So the price is d times (n + 10): not one comparison, and a cost that would barely move if every value were a hundred times larger.`,
    values: [...values],
    highlight: { sorted: range(0, n) },
    sorted: [0, n],
    result: 'sorted',
    ops,
    vars: { ops, n, passes, max },
  };
}

/** The indices of a per-cell boolean, in order. Two fresh arrays per call. */
const cellsWhere = (flags: boolean[], wanted: boolean): number[] => {
  const out: number[] = [];
  for (let j = 0; j < flags.length; j++) if (flags[j] === wanted) out.push(j);
  return out;
};

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Array',
      kind: 'numbers' as const,
      default: PRESETS[0]?.input.type === 'numbers' ? PRESETS[0].input.values : [],
    },
  ],
  build: (values: Record<string, unknown>): AlgoInput => ({
    type: 'numbers',
    values: Array.isArray(values.values) ? (values.values as number[]) : [],
  }),
  sizeOf: (input: AlgoInput): number => (input.type === 'numbers' ? input.values.length : 0),
};

/* ------------------------------------------------------------------ *
 * 4. The lesson — four languages, one set of anchors
 * ------------------------------------------------------------------ */

const JS = `function radixSort(a) {
  // Non-negative whole numbers. src is the array the current pass reads. // @anchor start
  const n = a.length;
  if (n === 0) return a;
  let max = a[0];
  for (let i = 1; i < n; i++) {                       // @anchor max-digits
    if (a[i] > max) max = a[i];
  }
  let src = a;
  for (let place = 1; place <= max; place *= 10) {    // @anchor place
    const count = new Array(10).fill(0);
    for (let i = 0; i < n; i++) {                     // @anchor digit
      // / is a float in JavaScript, so the floor is not optional here.
      const d = Math.floor(src[i] / place) % 10;
      count[d]++;                                    // @anchor count
    }
    // The ten tallies are now ten write cursors: cell d is the first free slot
    // for a value whose digit is d, so the buckets tile 0..n-1 in digit order.
    let next = 0;
    for (let d = 0; d < 10; d++) {                   // @anchor bucket-starts
      const tallies = count[d];
      count[d] = next;
      next += tallies;
    }
    const out = new Array(n);
    for (let i = 0; i < n; i++) {                     // @anchor stable-place
      const d = Math.floor(src[i] / place) % 10;
      // Left to right into a left-to-right cursor: the whole of stability.
      out[count[d]++] = src[i];
    }
    src = out;
  }
  return src;                                        // @anchor done
}`;

const PY = `def radix_sort(a):
    # Non-negative whole numbers. src is what the current pass reads. # @anchor start
    n = len(a)
    if n == 0:
        return a
    biggest = a[0]
    for i in range(1, n):                             # @anchor max-digits
        if a[i] > biggest:
            biggest = a[i]
    src = a
    place = 1
    while place <= biggest:                           # @anchor place
        count = [0] * 10
        for i in range(n):                            # @anchor digit
            d = (src[i] // place) % 10                # // is already a floor
            count[d] += 1                             # @anchor count
        # The ten tallies are now ten write cursors: cell d is the first free
        # slot for a value whose digit is d, so the buckets tile 0..n-1.
        nxt = 0
        for d in range(10):                           # @anchor bucket-starts
            tallies = count[d]
            count[d] = nxt
            nxt += tallies
        out = [0] * n
        for i in range(n):                            # @anchor stable-place
            d = (src[i] // place) % 10
            out[count[d]] = src[i]  # left to right into a left-to-right cursor
            count[d] += 1
        src = out
        place *= 10
    return src                                        # @anchor done`;

const JAVA = `class RadixSort {
    static int[] radixSort(int[] a) {
        // Non-negative whole numbers; src is what the current pass reads. // @anchor start
        int n = a.length;
        if (n == 0) return a;
        int max = a[0];
        for (int i = 1; i < n; i++) {                      // @anchor max-digits
            if (a[i] > max) max = a[i];
        }
        int[] src = a;
        for (int place = 1; place <= max; place *= 10) {    // @anchor place
            int[] count = new int[10];
            for (int i = 0; i < n; i++) {                   // @anchor digit
                // int division truncates toward zero, which is the floor
                // only because every value here is non-negative.
                int d = src[i] / place % 10;
                count[d]++;                                // @anchor count
            }
            // The ten tallies are now ten write cursors: cell d is the first
            // free slot for a value whose digit is d.
            int next = 0;
            for (int d = 0; d < 10; d++) {                 // @anchor bucket-starts
                int tallies = count[d];
                count[d] = next;
                next += tallies;
            }
            int[] out = new int[n];
            for (int i = 0; i < n; i++) {                   // @anchor stable-place
                int d = src[i] / place % 10;
                // Left to right into a left-to-right cursor: the whole of stability.
                out[count[d]++] = src[i];
            }
            src = out;
        }
        return src;                                           // @anchor done
    }
}`;

const CPP = `#include <vector>
using std::vector;

vector<int> radix_sort(vector<int> a) {
    // Non-negative whole numbers; src is what the current pass reads. // @anchor start
    int n = (int)a.size();
    if (n == 0) return a;
    int max = a[0];
    for (int i = 1; i < n; i++) {                      // @anchor max-digits
        if (a[i] > max) max = a[i];
    }
    vector<int> src = a;
    for (int place = 1; place <= max; place *= 10) {   // @anchor place
        vector<int> count(10, 0);
        for (int i = 0; i < n; i++) {                   // @anchor digit
            // int division truncates toward zero: the floor only because
            // every value here is non-negative.
            int d = src[i] / place % 10;
            count[d]++;                                // @anchor count
        }
        // The ten tallies are now ten write cursors: cell d is the first free
        // slot for a value whose digit is d.
        int next = 0;
        for (int d = 0; d < 10; d++) {                 // @anchor bucket-starts
            int tallies = count[d];
            count[d] = next;
            next += tallies;
        }
        vector<int> out(n);
        for (int i = 0; i < n; i++) {                   // @anchor stable-place
            int d = src[i] / place % 10;
            // Left to right into a left-to-right cursor: the whole of stability.
            out[count[d]++] = src[i];
        }
        src.swap(out);
    }
    return src;                                        // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'A plain array of non-negative whole numbers, and one name worth stopping on: `src` is the array the *current* pass reads, which is not the caller’s array after the first pass. That indirection is not decoration — a pass must read one array and write another, and `src` is how this listing says so. It is also why the function returns a fresh array and leaves the caller’s input untouched, which is a real difference from the other three, where the copy is unavoidable anyway.',
    python:
      'A plain list of non-negative whole numbers. `while place <= biggest:` is the Python spelling of the `for (place = 1; place <= max; place *= 10)` the other three use, and it exists so that `place` survives past the loop body — Python has no three-clause `for` header in which to declare and update a counter. A maximum below 10 fails the condition immediately and the function hands its input straight back, which is correct and needed no special case.',
    java: 'A plain `int[]` of non-negative whole numbers, with two Java-specific facts hiding in three characters. `new int[10]` is already zeroed by the language, so the JavaScript version’s explicit `.fill(0)` has no counterpart here; and `count[d]++` is legal inside a subscript because a subscript is an assignable lvalue, which is the same reason `out[count[d]++] = src[i]` is one statement here and two in the Python listing.',
    cpp: 'A `vector<int>` taken **by value**, so `vector<int> src = a;` costs one copy and the caller’s vector is never modified. The `src.swap(out)` at the end of each pass is the idiomatic way to move the result on: swap exchanges two buffers, where `src = out` would copy n ints per pass and quietly double the work. The real trap in this file is one character further up — `place *= 10` overflows a 32-bit `int` above a billion, the loop condition then compares against a negative number, and the loop never ends.',
  },
  'max-digits': {
    javascript:
      'One comparison per element, and the only comparisons in the entire algorithm — everything after this line is arithmetic. What it produces is not a sorted value but a *count of passes*, because a number with d digits has d place values to visit. That is the term radix sort is usually quoted as, O(d(n + k)) with k pinned at 10: the cost tracks the width of the numbers, not how many of them there are.',
    python:
      'The same n - 1 comparisons, and Python’s `max(a)` would make them in one C-speed call. The loop is here because the animation exists to show the maximum being found, and because a reader should see the one number the rest of the program hangs off. A maximum of 0 leaves `place = 1` failing the loop condition at once, so the function returns its input — correct, and with no special case written anywhere.',
    java: 'n - 1 comparisons, and the bound is 1 rather than 0 precisely because `a[0]` seeds the maximum and needs nothing to compare itself against. A `Stream.max` would be tidier and would hide the one quantity the algorithm is built from: the digit count of the largest value, which is a property of the data rather than of the container, and which no amount of container metadata can tell you in advance.',
    cpp: 'Identical logic to the other three, and identical in cost. Worth naming what this loop is *not*: it is not the sort, and it is not what makes radix sort linear. It is the measurement that tells the sort how many times to run — the digital counterpart of `n = a.size()`, except that `n` is fixed by the container and this is a property of the contents, which is the whole reason the algorithm cannot be a drop-in for a comparison sort.',
  },
  place: {
    javascript:
      'The pass loop, and its direction is the algorithm rather than a preference: units first, then tens, then hundreds. Most-significant-first also sorts digit by digit, but each pass has to recurse into ten sub-buckets, which turns the linear-per-pass structure into a quicksort-shaped recursive mess and hands back the comparison sort you were trying to avoid. LSD needs no recursion at all, and pays for the simplicity in passes rather than in bookkeeping. The loop stops when `place` overtakes `max`, so an array of single digits runs exactly once.',
    python:
      'One pass, keyed on the place value `place`. The while condition is the Python form of `place <= max`, and the `place *= 10` at the bottom of the body is what the C-style `for` header does in the other three listings. The ten zeros are the entire memory cost of a pass: k is 10, permanently, whether the values are 9 or nine billion — which is the one sentence that separates radix sort from counting sort.',
    java: 'The pass loop, and the shape of it is the algorithm. The count array is a fresh `int[10]` per pass rather than one array cleared and reused, which is the honest expression of what happens: the cursors are consumed destructively by the placement, so there is nothing left worth clearing. The bound `place <= max` is also the overflow warning — `place *= 10` past a billion wraps to a negative `int`, the condition stays true, and the loop runs forever on data that is in perfectly good order.',
    cpp: 'A pass keyed on one decimal place. `place *= 10` is the line to review in any radix sort: `int` overflow makes `place` negative, the loop condition stays true, and the program spins writing through a cursor that has run off the end of the array. Declaring the loop variable `long long` costs nothing and removes the whole class of bug, which is the general argument for making an index wider than the data whenever the data can be large.',
  },
  digit: {
    javascript:
      'Extract the digit: divide by the place value, drop the fraction, take the remainder modulo ten. `Math.floor` is required, not stylistic — JavaScript’s `/` always returns a float, so without it `548 / 100` is 5.48 and `% 10` is 5.48, and every bucket is silently wrong while the array still ends up a permutation of its input. Note what the line does *not* do: it never compares `src[i]` with another element, and it never reads a digit other than the one this pass is keyed on.',
    python:
      'The same extraction, and `//` is already a floor, so there is no `math.floor` call and no float anywhere in this loop — which matters more than it looks, because the loop *is* the pass and a float divide plus a cast per element is a real cost at a million values. The one place this listing genuinely differs from the other three is the rounding: Python floors towards negative infinity, Java and C++ truncate towards zero, so on a negative value these four lines disagree with each other.',
    java: 'Integer division truncates towards zero, which equals the floor for every value this algorithm admits — and "for every value this algorithm admits" is carrying a lot of weight in that sentence. On `v = -47` and `place = 10`, Java computes -4 where the Python and JavaScript listings compute -5. Both are wrong for a radix sort and they are wrong *differently*, which is the strongest argument available for testing the sign at the top of the function rather than documenting the precondition in a comment.',
    cpp: 'The same expression, and the same truncation-towards-zero caveat as Java: `-47 / 10` is -4 here and -5 in the Python listing. Both are nonetheless correct on the promised input, and the reason is the useful one — a non-negative quotient has only one rounding, which is exactly why the domain check at the top of this function is a correctness requirement and not a courtesy. C++17 offers `std::div` for when the floor really is what you want.',
  },
  count: {
    javascript:
      'One increment per value, into the bucket its digit names. The input array is untouched by this whole loop: after it, `src` is exactly as it was and the only thing that has changed anywhere is the histogram. This is counting sort, verbatim, over a range of ten — and that is the sentence worth remembering, because it is the whole difference between an algorithm whose k is the width of the data and one whose k is a constant.',
    python:
      'The same single tally, and `count[d] += 1` is the idiomatic spelling; `count[d] = count[d] + 1` says the same thing more slowly. This is where a pass spends its n: one list index and one addition per element, no comparison, no branch on the data, and nothing that depends on how large the values are. Everything the pass knows about the input, it learned here.',
    java: 'A scatter increment into an `int[10]`, and the integer width matters more here than anywhere else in the file: a `byte[10]` histogram wraps at 128 values in a bucket, and a pass whose cursors wrap produces an array that is a permutation of the input and looks merely shuffled. `short[10]` survives to 32767 and is a real trap at scale. Note also what this version does not need: the language zero-fills `new int[10]`, where the JavaScript listing has to say `.fill(0)` out loud.',
    cpp: 'A scatter increment into `vector<int> count(10, 0)`, value-initialised by the constructor — the C++ spelling of the same two facts. The interesting part of this loop is what it is *not* doing: no comparison, no unpredictable branch, ten counters inside a single cache line. That is why a radix pass runs at memory bandwidth while a comparison sort over the same data runs an order of magnitude slower, even though both are O(n) per pass.',
  },
  'bucket-starts': {
    javascript:
      'The row changes meaning. Before this loop, cell d holds "how many values have digit d"; after it, cell d holds "the first free slot for a value whose digit is d". Summing left to right is what makes the buckets contiguous, so the ten blocks tile 0..n-1 with no gaps and no overlap — which is why the placement loop can write without checking a single bound. The histogram and the cursors are the same ten integers in place, so a pass still only needs k cells.',
    python:
      'The same left-to-right running total, in place over the same list. `itertools.accumulate` would produce the same numbers in one call, but it builds a *new* list — and the placement loop needs these ten cells to be readable and writable as it walks them, one bucket at a time. A generator over `accumulate` cannot be indexed, let alone incremented, so the three-line loop is the shortest spelling that is actually usable.',
    java: 'In-place conversion of the histogram into the write cursors, over the same `int[]` the tally wrote into. The local `tallies` is not optional: it has to be read *before* `count[d]` is overwritten, because after that line the cell no longer holds the count. Every textbook keeps that temporary for the same reason, and the mistake of dropping it is a counter that feeds on its own output and walks off the end of the array.',
    cpp: 'Ten running totals, in place, with the same hazard as the other three in a different costume: the tally for bucket d must be read before the cell is overwritten, or the sum includes its own output. What this language adds is that the ten cells are adjacent, so the whole conversion is one or two cache lines — which is why this loop never shows up as the bottleneck in a radix sort, whatever the data.',
  },
  'stable-place': {
    javascript:
      'The line the algorithm lives or dies on. Reading the source left to right and filling each bucket left to right is what makes the pass **stable**: values that share a digit keep their relative order, so the previous pass’s work is carried forward rather than shuffled. It is not optional. On `[122, 2, 122, 2, 1002]` every value has units digit 2, so an unstable pass simply reverses them, and the finished array comes out `[122, 122, 2, 2, 1002]` — the 2s above the 122s and the four-digit value in the middle. The stable pass gives `[2, 2, 122, 122, 1002]`.',
    python:
      'Three statements where JavaScript and Java need one, because Python allows no side effect inside a subscript: read the cursor, write the value, advance the cursor. The order is load-bearing — advancing first would put each value one slot too high and overlap the buckets. Stability is a property of this *pair* of facts, the left-to-right source walk and the left-to-right cursor walk, and it is why the reversal the JavaScript note describes is a wrong answer rather than a different answer.',
    java: 'The same two walks, and the same stability requirement, with one hazard the other three do not have. Written as `out[count[src[i] / place % 10]++] = src[i]`, Java evaluates the array reference and the index before the right-hand side, so the cursor has already moved by the time `src[i]` is read. With the digit in a local the two orders coincide and nothing breaks — which is precisely why nobody notices the difference until they inline the expression.',
    cpp: 'The same two walks, and the same stability requirement. C++17 sequences the right operand of an assignment before the left one, so `src[i]` is read before `count[d]++` runs; Java and JavaScript evaluate the index first. All three agree when `d` is already in a local, which is exactly why the local is not decorative: write `out[count[src[i] / place % 10]++] = src[i]` instead and the line is a different program in each of the four languages, for no reason a reader could see.',
  },
  done: {
    javascript:
      'The array the last pass built — not the array that came in, because `src` was replaced every pass. Nothing here is a comparison, and the total work was d passes of n + 10, so the figure that matters is the digit count of the largest value. On the `single-digit` preset that is 1: the whole algorithm is one counting sort and the second pass never happens.',
    python:
      'The list the last pass built, returned rather than mutated into place, so the caller’s original list is untouched. Note how the loop terminates — by its own condition. With a maximum of 9, `place` becomes 10 and the `while` fails, which is why an array of single digits needs no special case at any point in this function.',
    java: 'The array the last pass built, and `src` rather than the caller’s `a` is what comes back — so this method is genuinely not in place: every pass allocates a fresh `int[n]` and the previous one becomes garbage. The honest cost line is O(d(n + 10)) time and O(n + 10) space, and the space is not removable by cleverness, because a pass reads one array while writing another and that is the same read hazard the counting-sort listing exists to warn about.',
    cpp: 'The vector the last pass built, and `src.swap(out)` is why handing it back is cheap: each pass reuses the buffer the previous one wrote, so a d-pass sort allocates d + 1 vectors in total rather than 2d. The caller’s own vector is untouched and the returned value is a copy of it, and the only per-pass allocation is the ten counters — the one part of radix sort that really is constant.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'radixSort',
    python: 'radix_sort',
    java: 'RadixSort.radixSort',
    cpp: 'radix_sort',
  },
  glue: {
    javascript: 'auto' as const,
    python: 'auto' as const,
    java: 'auto' as const,
    cpp: 'auto' as const,
  },
};

/* ------------------------------------------------------------------ *
 * 5. Expectations — one machine-checked claim per preset
 * ------------------------------------------------------------------ */

const valuesOf = (p: Preset): number[] => (p.input.type === 'numbers' ? p.input.values : []);

// Computed by an independent reference — a plain ascending sort — and never by
// calling the generator above, which is the whole point of the harness: four
// listings and one generator can share a bug, and only a separate answer does
// not.
const expectations: Expectation[] = PRESETS.map((p) => ({
  presetId: p.id,
  args: [valuesOf(p)],
  result: [...valuesOf(p)].sort((a, b) => a - b),
}));

export const radixSortAlgo: AlgoDef<ArrayFrame> = {
  id: 'radix-sort',
  title: 'Radix Sort (LSD)',
  category: 'sorting',
  summary:
    'Counting sort by the units digit, then by the tens digit, then by the hundreds digit: one stable pass per place value, from the least significant digit up.',
  intuition:
    'Reach for it when the values are fixed-width integers, there are far more of them than they have digits, and you will sort them repeatedly: a million account numbers, a column of three-digit lot codes, a batch of same-width IDs, anything read from a file that promises a length. The decision is one comparison — narrow and numerous beats wide and few, essentially always. If the digit count stays below about log₂ n then d(n + 10) genuinely undercuts n log n, and the crossover is easy to compute before you commit. On floats or strings the answer is no before the question is finished: a radix pass needs a place value to shift by, and "shift by one and a half characters" is not an operation. The part worth knowing is the requirement you cannot see — each pass must be stable — and the fact that on plain integers its failure can be invisible, which is exactly why it gets broken.',
  complexity: {
    best: 'O(d · (n + 10))',
    average: 'O(d · (n + 10))',
    worst: 'O(d · (n + 10))',
    space: 'O(n + 10)',
    note: 'd is the number of digits in the largest value, so the cost follows the size of the numbers rather than the number of them — 1,000 nine-digit values cost about what 1,000 single-digit ones do, and doubles are not admitted at all. Since k is pinned at 10 this never has counting sort’s blow-up, but it is not in place: a pass reads one array while writing another, which is O(n) of scratch and the same read hazard that makes the in-place counting sort wrong. Past d ≈ log₂ n the linear-per-pass advantage is spent and a comparison sort wins again.',
  },
  traits: {
    stable: true,
    inPlace: false,
    offline: true,
    allowsDuplicates: true,
    tags: ['non-comparative', 'LSD', 'k is always 10', 'stable passes', 'integers only'],
  },
  viewport: 'array',
  level: 'intermediate',
  params: [
    {
      key: 'size',
      label: 'Elements',
      kind: 'number',
      min: 0,
      max: 40,
      step: 1,
      default: SINGLE_DIGIT.length,
      regeneratesInput: true,
      help: 'Every pass costs n + 10. The pass count is the digit count of the largest value, not this.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: radixSort,
  lesson,
  expectations,
  formatResult: (r) => `[${(r as number[]).join(', ')}]`,
  anchors: [
    'start',
    'max-digits',
    'place',
    'digit',
    'count',
    'bucket-starts',
    'stable-place',
    'done',
  ],
};

export default radixSortAlgo;
