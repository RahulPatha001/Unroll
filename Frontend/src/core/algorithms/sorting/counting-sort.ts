import { byLanguage } from '../../code/anchors.ts';
import { distinctArray, fewDistinctArray, reversedArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Counting Sort — the first sort in this list that never compares two elements.
 *
 * The whole idea fits in one sentence: *if you know how many copies of each
 * value there are, you know where every value belongs.* Tabulate the counts,
 * turn the counts into running totals, and the totals are write positions. No
 * ordering question is ever asked of the data, which is why this is the only
 * sort here that is not a lower-bound story — and also why it is the only one
 * that is not a comparison sort.
 *
 * Three things make it worth animating rather than reading.
 *
 *  1. **The counter row is the algorithm.** It is `max - min + 1` cells wide,
 *     and `max - min + 1` has nothing to do with `n`. That single ratio — k
 *     against n — is the whole trade, so the counter row is the `overlay` of
 *     every frame from the moment the range is known. The `wide-range` preset
 *     exists to make the trade fail: 272 counters to order 6 values.
 *
 *  2. **The placement reads from a saved copy of the input.** This is not an
 *     optimisation and not a stylistic choice, and getting it wrong is the
 *     single most common counting-sort bug on the internet. The tempting
 *     version reads `a[i]` and writes `a[--count[a[i] - min]] = a[i]` into the
 *     same array, walking right to left "so it cannot overwrite something it
 *     has not read yet". It can, and it does. See the long comment on `src`
 *     below for the three-element proof.
 *
 *  3. **The output row cannot exist.** There is exactly one `overlay` in the
 *     frame contract, and the counter row has already spent it. So the
 *     placement writes final values back into the main `values` array. That
 *     turns out to be the better animation anyway: a cell is written exactly
 *     once, so the cells that already hold a final value stay final, and they
 *     fill in scattered rather than as a tidy run at the end — which is
 *     precisely what the `output` highlight has to show and precisely what a
 *     second row would have hidden.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 41;

/**
 * One array per preset, hoisted so a preset's `size` and its `values` can never
 * disagree — the generator honours `params.size`, so a preset that stored more
 * values than it asked for would be silently truncated and the animation would
 * stop matching the code the verification harness runs.
 */
const SMALL_RANGE = fewDistinctArray(SEED, 11, 4, 1);
const WIDE_RANGE = distinctArray(SEED + 1, 6, 1, 400);
const REVERSED = reversedArray(SEED + 2, 9, 3, 26);
const ALL_EQUAL = fewDistinctArray(SEED + 3, 10, 1, 7);

const PRESETS: Preset[] = [
  {
    id: 'small-range',
    label: 'Small range, many ties',
    blurb:
      'Counting sort at its best: 11 values drawn from just 4 distinct numbers, so k = 4 and the counter row is four cells wide. Every comparison sort does strictly more work here, and the ties are what make the stability claim worth reading.',
    input: { type: 'numbers', values: SMALL_RANGE },
    params: { size: SMALL_RANGE.length },
  },
  {
    id: 'wide-range',
    label: 'Wide range (the blow-up)',
    blurb:
      'The preset that matters. Six values, no duplicates, spread over a range of 272 — so the algorithm allocates 272 counters, zeroes them, walks them 271 times to build the prefix sums, and does all of that to order six numbers. A comparison sort would have used about 15 comparisons and no extra memory at all. Step through the counter row and count the cells holding nothing but zero.',
    input: { type: 'numbers', values: WIDE_RANGE },
    params: { size: WIDE_RANGE.length },
  },
  {
    id: 'reverse',
    label: 'Reversed',
    blurb:
      'Descending input, and counting sort could not care less: the cost is a function of the multiset, not of the order. Same 23 counters, same 9 writes, exactly as on the shuffled array. The only thing that changes is which counter each value finds on its way out — and every one of those writes lands somewhere to the left of where it was read.',
    input: { type: 'numbers', values: REVERSED },
    params: { size: REVERSED.length },
  },
  {
    id: 'all-equal',
    label: 'Every value identical',
    blurb:
      'Ten copies of one number, so k = 1: the entire algorithm collapses into a single counter cell that counts up to 10 and then back down to zero. Note that k - 1 = 0, so the prefix-sum loop has nothing to do at all — the shape of the code changes with the data, and the `prefix-sum` anchor never fires on this preset.',
    input: { type: 'numbers', values: ALL_EQUAL },
    params: { size: ALL_EQUAL.length },
  },
  {
    id: 'empty',
    label: 'Empty',
    blurb:
      'The degenerate case, and the only sort here whose zero-length input costs literally nothing: no minimum, no maximum, no counter row, no writes. Watch that the run still produces a valid frame rather than dividing by nothing.',
    input: { type: 'numbers', values: [] },
    params: { size: 0 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

const COUNT_LABEL = 'count — one counter per integer from min to max';

/**
 * The widest counter row this module will draw.
 *
 * Not a theoretical limit, a memory one. The row is copied into *every* frame,
 * and the number of frames is at least `k`, so the trace holds O(k²) numbers:
 * at k = 512 that is already a quarter of a million, and a user who types
 * `1, 1000000` into the input editor would otherwise ask for 10¹². Refusing is
 * also the honest answer, because the refusal *is* the lesson — see the
 * `wide-range` preset.
 */
const MAX_COUNTERS = 512;

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

export function* countingSort(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const size = Number(ctx.params.size ?? input.values.length);
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const values = [...source].slice(0, Math.max(0, size));
  const n = values.length;

  let ops = 0;

  /*
   * The integer contract, checked before anything is allocated.
   *
   * `count[a[i] - min]++` has no meaning for 3.5: there is no cell 3.5 - min
   * positions along, and `new Array(3.5)` is a RangeError in JavaScript. A
   * library that quietly rounds the index is worse than one that refuses,
   * because the rounded sort *looks* right on 1.1, 1.2, 1.4 and quietly
   * shuffles 1.45 with 1.5. The real fixes are scaling (multiply, sort,
   * divide) or a comparison sort, and both belong in the note.
   */
  const fractional = values.some((v) => !Number.isInteger(v));

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    caption: `${n} values`,
    note:
      n === 0
        ? 'An empty array has no minimum and no maximum, so there is no range to tabulate and nothing to place. Counting sort is the only sort here whose zero-length case is free.'
        : fractional
          ? `${n} values, and at least one of them is not a whole number. Counting sort has no bucket for that: the counter row is indexed by an integer offset from the minimum, so a fractional value would need a counter that does not exist. This run refuses rather than rounding, because a rounded index merges 1.45 with 1.5 and returns a confidently wrong answer.`
          : `${n} values, and not one of them will be compared with another to decide its order. What happens instead: tabulate how many times each value occurs, then let the tallies say where each value goes. The counter row is not allocated yet — it is max - min + 1 cells wide, and the range is only known once every value has been seen.`,
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
      note: 'The array is empty, so it is sorted by definition: no minimum, no maximum, no counters, no writes, and not one operation performed.',
      values: [],
      highlight: {},
      result: 'sorted',
      ops,
      vars: { ops, n },
    };
    return;
  }

  if (fractional) {
    yield {
      kind: 'array',
      index: 0,
      anchor: 'done',
      caption: 'refused',
      note: 'Stopping here, with the array exactly as it arrived. The usual repair is to scale the values into a small integer range, sort those, and divide back — which is precisely the advice counting sort forces on you, and precisely why it is not the general-purpose answer it looks like.',
      values: [...values],
      highlight: { unvisited: range(0, n) },
      result: 'fractional value',
      ops,
      vars: { ops, n },
    };
    return;
  }

  /* -- Phase 1: the range, which sizes the counter row ------------------ */

  let min = values[0] as number;
  let max = values[0] as number;
  let k = 1;
  /** Allocated only once the range is closed, and never resized. */
  let counts: number[] = [];

  for (let i = 0; i < n; i++) {
    if (ctx.shouldStop()) return;
    const prevMin = min;
    const prevMax = max;
    if (i > 0) {
      ops++;
      const v = values[i] as number;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    k = max - min + 1;

    // The guard is inside the loop, before anything is allocated, because the
    // refusal is only honest if it costs nothing. Checking it after the
    // allocation would mean building the very array the user was too polite to
    // ask for.
    if (k > MAX_COUNTERS) {
      yield {
        kind: 'array',
        index: 0,
        anchor: 'done',
        caption: 'refused',
        note: `Stopping here, with the array untouched. The range ${min} to ${max} needs ${k} counters — about ${Math.round(k / n)} for every value in the array, which is far more memory than the data itself — and the row would also be walked k times to build the prefix sums. A comparison sort would have needed neither. The n + k bound is only flattering while k is small, and this is what "worse than O(n log n) in practice" looks like.`,
        values: [...values],
        highlight: { unvisited: range(0, n) },
        result: 'range too wide',
        ops,
        vars: { ops, n, k, min, max },
      };
      return;
    }

    // Whether the range *actually* moved, not whether this value happens to sit
    // outside the previous one. Two equal values in a row both look extreme to
    // the second test and neither of them widens anything, so the note would
    // claim the row had grown when it had not.
    const grew = min !== prevMin || max !== prevMax;
    const which =
      min !== prevMin && max !== prevMax
        ? 'outside the range on both sides'
        : min !== prevMin
          ? 'a new minimum'
          : 'a new maximum';

    yield {
      kind: 'array',
      index: 0,
      anchor: 'find-range',
      caption: `min ${min} · max ${max}`,
      note:
        i === 0
          ? `${values[i]} seeds both ends of the range: min and max both start here, and every later value is compared against these two running numbers. These ${n - 1} checks are the only comparisons in the whole algorithm.`
          : grew
            ? `${values[i]} is ${which}, so the range widens to ${min} to ${max} (${max - min} apart). The counter row will have to be ${k} ${k === 1 ? 'cell' : 'cells'} wide because of it, and the row is paid for whether or not the integers in between ever occur.`
            : `${values[i]} sits inside the running extremes ${min} and ${max}, so neither moves. ${i + 1} of ${n} values scanned, and the row will be ${k} ${k === 1 ? 'cell' : 'cells'} wide.`,
      values: [...values],
      pointers: { i },
      highlight: { active: [i], unvisited: range(i + 1, n) },
      ops,
      vars: { i, min, max, k },
    };
  }

  // The allocation is k writes, and it happens before any sorting at all. That
  // is why counting sort's real cost is n + k and not n.
  counts = Array.from({ length: k }, () => 0);
  ops += k;

  yield {
    kind: 'array',
    index: 0,
    anchor: 'find-range',
    caption: `min ${min} · max ${max}`,
    note: `The range is closed at ${min} to ${max}, so the counter row is max - min + 1 = ${k} ${k === 1 ? 'cell' : 'cells'} wide and every one of them starts at zero. Read that number next to n = ${n}: the algorithm has just committed ${k} writes before it has sorted anything.`,
    values: [...values],
    // The overlay appears with the row it exists to show. An empty second row
    // would render as a label with no cells under it, which reads as a bug.
    overlay: { label: COUNT_LABEL, values: [...counts], pointers: {} },
    ops,
    vars: { min, max, k, n },
  };

  /* -- Phase 2: tally --------------------------------------------------- */

  for (let i = 0; i < n; i++) {
    if (ctx.shouldStop()) return;
    const v = values[i] as number;
    const b = v - min;
    const before = counts[b] as number;
    counts[b] = before + 1;
    ops++;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'count',
      caption: `tally ${i + 1} of ${n}`,
      note: `The value ${v} increments counter ${b} — the index is the *offset from the minimum*, ${v} - ${min} = ${b}, not the value itself, which is why a run of values 90 to 99 still needs only 10 counters. That counter now reads ${before + 1}. ${i + 1 === n ? 'That is every value: the row is a histogram, and the array itself has still not been touched.' : `${n - i - 1} to go — so far the only thing that has changed anywhere is this row.`}`,
      values: [...values],
      pointers: { i },
      highlight: { active: [i] },
      overlay: { label: COUNT_LABEL, values: [...counts], pointers: { x: b } },
      ops,
      vars: { i, min, v, counter: b, tally: before + 1 },
    };
  }

  /* -- Phase 3: tallies become write positions -------------------------- */

  let running = counts[0] as number;
  for (let x = 1; x < k; x++) {
    if (ctx.shouldStop()) return;
    ops++;
    running += counts[x] as number;
    counts[x] = running;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'prefix-sum',
      caption: `counter ${x} of ${k}`,
      note: `Counter ${x} absorbs counter ${x - 1} and now reads ${running}, which is the number of values at or below ${x + min}. The row has changed meaning: it is no longer a histogram, it is a set of write positions, and ${running} is one past the last slot the value ${x + min} may occupy.${x === k - 1 ? ' The answer key is complete — every value now knows exactly where its last copy goes.' : ''}`,
      values: [...values],
      highlight: { unvisited: range(0, n) },
      overlay: { label: COUNT_LABEL, values: [...counts], pointers: { x } },
      ops,
      vars: { x, place: x + min, running },
    };
  }

  /* -- Phase 4: place, back to front, into the same array ---------------- */

  /*
   * The saved copy, and the reason it exists.
   *
   * The folklore version of this phase reads and writes the same array,
   * right to left, on the argument that a value's slot is its rank among the
   * values *not yet read* and therefore can never sit to the right of the
   * index it was read from. The argument is true and completely useless. The
   * proof, on three values:
   *
   *     a = [3, 1, 2],  min = 1,  count = [1, 2, 3]   (after the prefix sums)
   *     i = 2: v = a[2] = 2, slot = count[1] - 1 = 1, a = [3, 2, 2]
   *     i = 1: v = a[1] = 2   <-- WRONG. 2 was already placed; a[1] was 1.
   *     a = [2, 2, 2]
   *
   * The write at i = 2 landed on index 1, which had not been read yet. Going
   * backwards guarantees the *destination* never exceeds the read index, which
   * is not the same thing as never destroying an unread value — here it
   * destroys one every single time the array is not already sorted. Symmetric
   * disaster if you go left to right with the same prefix sums: on the same
   * input the first write clobbers index 2 and the array comes out [1, 3, 3].
   *
   * So the placement reads from `src`, a copy nobody writes to. That is the
   * whole of the O(n) extra space, and it is the same n the textbook version
   * spends on a second output array — just spent on a copy that is provably
   * read-only instead of one that is provably written. The animation below
   * calls out every frame where the read cursor is standing on a cell that an
   * earlier write has already moved, because those are the frames where an
   * in-place reader would visibly be holding the wrong value.
   */
  const src = [...values];

  /**
   * The cells that already hold their final value. Scattered, not a suffix: the
   * value written into slot 6 is not the value that was standing there, and
   * slot 6 is final while its neighbours are still pending.
   */
  const written: number[] = [];
  const isFinal = new Array<boolean>(n).fill(false);

  /** Every cell that does not hold its final value yet, so every pending one. */
  const pending = (): number[] => {
    const out: number[] = [];
    for (let j = 0; j < n; j++) if (!isFinal[j]) out.push(j);
    return out;
  };

  for (let i = n - 1; i >= 0; i--) {
    if (ctx.shouldStop()) return;
    const v = src[i] as number;
    const b = v - min;
    const free = counts[b] as number;
    const slot = free - 1;
    // The destination can land on either side of the read index, and the
    // asymmetry is the whole hazard: a write to the right can only touch cells
    // this loop has already read, while a write to the left lands squarely on
    // the unread ones. A run that never moves anything rightwards is one where
    // the naive in-place version happens to survive, which is exactly why the
    // bug ships.
    const left = i - slot;
    const where =
      left === 0
        ? 'the very cell it came from'
        : left > 0
          ? `${plural(left, 'cell')} to the left of it`
          : `${plural(-left, 'cell')} to the right of it`;
    // True when a previous write has already moved the cell we are reading from.
    const clobbered = isFinal[i] === true;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'place',
      caption: `placing ${n - i} of ${n}`,
      note: `Take the rightmost value still to place, ${v}, which the saved copy still holds at index ${i}. Counter ${b} reads ${free}, so the last free slot for ${v} is ${slot} — ${where}. Writing to the right is the safe direction: every cell it can land on has already been read. Writing to the left is the dangerous one, because those cells have not been read yet, which is precisely what the saved copy is for.${clobbered ? ` And index ${i} is already showing its final value, not ${v} — an earlier write landed on it, so an in-place reader would be holding the wrong number here.` : ''}`,
      values: [...values],
      // `slot` is not a variable in the JavaScript, Java or C++ listings —
      // it is the index the pre-decrement produced. Naming the pointer after
      // the value rather than after the syntax keeps the four languages showing
      // the same cursor.
      pointers: { i, slot },
      highlight: { active: [i], output: [...written], outOfPlace: pending() },
      overlay: { label: COUNT_LABEL, values: [...counts], pointers: { x: b } },
      ops,
      vars: { i, min, v, counter: b, slot, next: free },
    };

    // The write. `v` came out of `src` on the line above, so overwriting the
    // array cannot lose it, and `slot` is one of the k prefix-sum slots, so
    // every cell is written exactly once: the placement and the answer key
    // update are the same operation.
    values[slot] = v;
    counts[b] = slot;
    written.push(slot);
    isFinal[slot] = true;
    ops++;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'written',
      caption: `slot ${slot} · ${written.length} of ${n} placed`,
      note: `${v} is now final at index ${slot}, and counter ${b} drops to ${slot} so the next ${v} will take the slot below it — equal values therefore come out in the order they went in, which is the whole of counting sort's stability. ${written.length} of ${n} ${n === 1 ? 'cell' : 'cells'} now hold their final value${written.length === n ? ', and the array is sorted' : ', scattered across the row rather than gathered at the end'}.`,
      values: [...values],
      pointers: { slot },
      highlight: { output: [...written], outOfPlace: pending() },
      overlay: { label: COUNT_LABEL, values: [...counts], pointers: { x: b } },
      ops,
      vars: { i, min, v, counter: b, slot, next: slot, placed: written.length },
    };
  }

  const ratio = k / n;
  const blowUp =
    ratio > 1
      ? ` Here k = ${k} is ${Math.round(ratio)} times n = ${n}, and that ratio — not n — is what counting sort actually costs.`
      : ` Here k = ${k} against n = ${n}, which is the arrangement counting sort is built for.`;

  yield {
    kind: 'array',
    index: 0,
    anchor: 'done',
    caption: `sorted · ${ops} operations`,
    note: `All ${n} values are in place after ${ops} operations: ${n - 1} range checks, ${k} counters zeroed, ${n} tallies, ${k - 1} prefix sums and ${n} writes. The price is n + k, and not one of those steps asked two values which should come first. The counter row has been wound back to the bucket boundaries — every cell now names the first slot it did *not* hand out, so the row is the set of block starts the placement began from.${blowUp}`,
    values: [...values],
    highlight: { sorted: range(0, n) },
    sorted: [0, n],
    result: 'sorted',
    overlay: { label: COUNT_LABEL, values: [...counts], pointers: {} },
    ops,
    vars: { ops, n, k, min, max },
  };
}

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

const JS = `function countingSort(a) {
  // Whole numbers only, and a[] is both the input and the output. // @anchor start
  const n = a.length;
  if (n === 0) return a;
  let min = a[0];
  let max = a[0];
  for (let i = 1; i < n; i++) {                          // @anchor find-range
    if (a[i] < min) min = a[i];
    if (a[i] > max) max = a[i];
  }
  const count = new Array(max - min + 1).fill(0);
  for (let i = 0; i < n; i++) {                          // @anchor count
    count[a[i] - min]++;
  }
  // count[x] now means "how many values are <= x", so count[x] - 1 is the last
  // free slot for x. The histogram is its own answer key.
  for (let x = 1; x < count.length; x++) {              // @anchor prefix-sum
    count[x] += count[x - 1];
  }
  // Read-only copy: the next loop writes into a, so a[i] is not safe to read.
  const src = a.slice();
  for (let i = n - 1; i >= 0; i--) {                    // @anchor place
    const v = src[i];
    a[--count[v - min]] = v;                            // @anchor written
  }
  return a;                                             // @anchor done
}`;

const PY = `def counting_sort(a):
    n = len(a)                                            # @anchor start
    if n == 0:
        return a
    lo = hi = a[0]
    for i in range(1, n):                                 # @anchor find-range
        if a[i] < lo:
            lo = a[i]
        if a[i] > hi:
            hi = a[i]
    count = [0] * (hi - lo + 1)
    for i in range(n):                                    # @anchor count
        count[a[i] - lo] += 1
    # count[x] is now "how many values are <= x", so count[x] - 1 is the last
    # free slot for x: the histogram is its own answer key.
    for x in range(1, len(count)):                        # @anchor prefix-sum
        count[x] += count[x - 1]
    src = list(a)                                         # read-only copy
    for i in range(n - 1, -1, -1):                        # @anchor place
        v = src[i]
        slot = count[v - lo] - 1                          # @anchor written
        a[slot] = v
        count[v - lo] = slot
    return a                                              # @anchor done`;

const JAVA = `class CountingSort {
    static int[] countingSort(int[] a) {
        int n = a.length;                                   // @anchor start
        if (n == 0) return a;
        int min = a[0];
        int max = a[0];
        for (int i = 1; i < n; i++) {                       // @anchor find-range
            if (a[i] < min) min = a[i];
            if (a[i] > max) max = a[i];
        }
        int[] count = new int[max - min + 1];               // already all zeros
        for (int i = 0; i < n; i++) {                       // @anchor count
            count[a[i] - min]++;
        }
        // count[x] is now "how many values are <= x": the last free slot for x
        // is count[x] - 1, so the histogram is its own answer key.
        for (int x = 1; x < count.length; x++) {            // @anchor prefix-sum
            count[x] += count[x - 1];
        }
        int[] src = a.clone();                              // read-only copy
        for (int i = n - 1; i >= 0; i--) {                  // @anchor place
            int v = src[i];
            a[--count[v - min]] = v;                        // @anchor written
        }
        return a;                                           // @anchor done
    }
}`;

const CPP = `#include <vector>
using std::vector;

vector<int> counting_sort(vector<int> a) {
    int n = (int)a.size();                                  // @anchor start
    if (n == 0) return a;
    int lo = a[0], hi = a[0];
    for (int i = 1; i < n; i++) {                           // @anchor find-range
        if (a[i] < lo) lo = a[i];
        if (a[i] > hi) hi = a[i];
    }
    vector<int> count(hi - lo + 1, 0);                      // value-initialised
    for (int i = 0; i < n; i++) {                           // @anchor count
        count[a[i] - lo]++;
    }
    // count[x] is now "how many values are <= x": the last free slot for x is
    // count[x] - 1, so the histogram is its own answer key.
    for (int x = 1; x < (int)count.size(); x++) {           // @anchor prefix-sum
        count[x] += count[x - 1];
    }
    vector<int> src = a;                                    // read-only copy
    for (int i = n - 1; i >= 0; i--) {                      // @anchor place
        int v = src[i];
        a[--count[v - lo]] = v;                             // @anchor written
    }
    return a;                                               // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'A plain array of whole numbers, read once from left to right and never written to until the last loop. The counter row does not exist yet: it is `max - min + 1` cells wide, and neither end of that range is known until the whole array has been seen. `new Array(k).fill(0)` is needed rather than `new Array(k)`, which would give a sparse array of holes — `count[x]++` on a hole yields `NaN`, and a histogram of `NaN` is a silent wrong answer.',
    python:
      'A plain list of whole numbers, and the same two facts: nothing is written here, and the counter list cannot be sized until both extremes are known. `[0] * (hi - lo + 1)` allocates and fills in one step, and it is why this row is cheap in Python — the list holds references, so 272 zeros is one allocation and 272 pointers, not 272 machine words. The `n == 0` guard is not decoration either: `a[0]` on an empty list raises `IndexError`, so without it the one input counting sort ought to handle for free is the one it crashes on.',
    java: 'A plain `int[]` of whole numbers, and a deliberate difference from the Python version: `new int[max - min + 1]` is *already* zero-filled by the JVM, so there is no fill call anywhere. Java arrays are fixed size too, which is the second constraint — the scan has to finish before the size is even a legal argument, so the allocation cannot move into the loop the way an amortised `ArrayList` would allow.',
    cpp: 'A `vector<int>` taken **by value**, so the caller gets a sorted copy back and its own vector is untouched — the cheapest possible answer to "did you mutate my input?". `vector<int> count(hi - lo + 1, 0)` is value-initialised in a single constructor call. Watch the type of the range arithmetic: `hi - lo + 1` is computed in `int`, so a vector whose extremes are more than `INT_MAX` apart overflows before the counter vector is even sized. That is why production counting sort is a template over the value type rather than a plain function over `int`.',
  },
  'find-range': {
    javascript:
      'The only comparisons in the whole algorithm: each value against two running numbers, never against another element of the array. That is n - 1 iterations, and they are not what makes counting sort linear — they would cost the same in any sort that needs to know its range. The payoff is the number they produce, `k = max - min + 1`, because that is the width of the row the next phase has to walk.',
    python:
      'Two running variables absorbing one comparison each per value. Python could write `lo, hi = min(a), max(a)` in one line, and those builtins are C-speed loops over the same data — the hand-written version is here because it is the shape you need if you want the range *as you go*, and because the animation exists to show the range growing one cell at a time.',
    java: 'n - 1 iterations, and the only part of the algorithm that looks at two values and decides something. `Math.min`/`Math.max` would do each step in one call, but the explicit `if` is what every textbook uses and it keeps the two running extremes visible. Note that this is where an `int` sort quietly starts to lie: `max - min + 1` on a 32-bit `int` overflows for a range wider than about two billion, and the resulting `NegativeArraySizeException` arrives four lines later, far from the arithmetic that caused it.',
    cpp: 'One pair of `int`s, updated by `std::min`/`std::max` or a bare `if` — the same code either way. The trap is signedness and range, not style: `hi - lo + 1` is `int` arithmetic, so a wide range wraps to a negative size and the constructor throws, while a *narrow* overflow of the running maximum would only ever produce a wrong answer. This is the line a reviewer should always look at twice in any counting sort.',
  },
  count: {
    javascript:
      'A scatter increment, one per value, at index `a[i] - min`. The offset is the entire trick for a large minimum: a row indexed by the raw value would need `max + 1` cells, and this one needs `max - min + 1`. No comparison, no write to `a` — after this loop the array is still exactly as it arrived and the only thing that has changed anywhere is the histogram.',
    python:
      'One `+= 1` per value, at index `a[i] - lo`. The same offset, spelled with `lo` because `min` and `max` are builtins and shadowing them inside a sort is the kind of cute that bites later. A list comprehension would not help here: the index has to be computed per value, so the loop body is three lines and always will be.',
    java: 'A scatter increment with the same offset. Note what Java does *not* need: `new int[k]` is already zeroed by the language, where the JavaScript version has to call `.fill(0)` explicitly and Python gets its zeros from `[0] * k`. The counters hold totals up to n, so a `byte[]` histogram would wrap at 128 values and sort the array into confident nonsense — the integer width of this one array is part of the algorithm, not an implementation detail.',
    cpp: 'Scatter increment, same offset, and the same width warning as before with a sharper edge: `std::vector<unsigned char>` counts wrap at 256, which is exactly the size of an old-school pixel histogram, which is exactly the kind of code that still exists in image libraries. The zeros come from the constructor here, so the classic C bug of a `malloc` without zeroing — every tally starting from garbage — cannot happen in this spelling.',
  },
  'prefix-sum': {
    javascript:
      'The histogram quietly becomes an answer key. After `count[x] += count[x - 1]`, the cell no longer holds "how many x there are" but "how many values are at or below x" — so the last free slot for the value `x` is `count[x] - 1`, and the placement phase can place without comparing anything. It accumulates in place, so no second array is needed and the row is k cells, not 2k.',
    python:
      'The same running total, mutated in place rather than built by `itertools.accumulate`. Both are correct and the second is shorter, but `accumulate` produces a *new* list — and the placement phase needs the running totals to be readable as it walks them leftwards through the buckets, one cell at a time, so the algorithm wants this array and not a generator over one.',
    java: 'In-place accumulation over the same `int[]` the tally wrote into. This is the one place in counting sort where integer overflow is a real algorithmic hazard rather than a theoretical one: the cells now hold totals up to n, so a `short[]` version starts wrapping at 32768 and the write positions it produces are all wrong while looking entirely reasonable.',
    cpp: 'The row accumulates in place, so the histogram and the answer key are the same array — there is no moment at which both exist. Signed `int` is safe up to n, and the same loop over `unsigned char` counters wraps silently at 256. That failure is nastier than a crash: every write position is wrong, the values still land in a permutation of the array, and the result is an array that looks shuffled rather than one that obviously failed.',
  },
  place: {
    javascript:
      'The value comes out of `src`, the copy taken one line above, and *not* out of `a`. That is not tidiness — it is the whole correctness of the phase. Walking right to left guarantees the destination never sits to the right of the index it was read from, which sounds like a safety argument and is not one: on `[3, 1, 2]` the first write lands on index 1, the next read of index 1 returns the value already placed there, and the array comes out `[2, 2, 2]`. Reading from `a` would return the wrong value with no error anywhere.',
    python:
      '`range(n - 1, -1, -1)` walks the list backwards, and `src[i]` is a copy rather than `a[i]` for the reason the other three languages give: the writes below destroy cells that have not been read yet. The exclusive `range` is also the only place this listing reads differently — there is no `i--`, and therefore no way to get the `>= 0` bound wrong.',
    java: 'The backwards loop, and the read comes from `src` rather than from the caller’s array. The bound is worth stating out loud, because the folklore version of this line claims a backwards walk makes it safe to read and write the same array: after reading index `i`, the counter for that value holds the number of values at or below it that have not been placed, so the write index is at most `i` — which is exactly the problem, since a destination at or left of `i` can be an index that has not been read yet.',
    cpp: 'A backwards loop over the vector, reading from `src`. The same one-line statement of why the copy exists: the write index is the rank of the value among the values still to be placed, which is at most `i`, so the write lands at or to the *left* of the read cursor — precisely where the unread values are. `a[--count[v - lo]] = v` on `a` itself compiles, runs, and returns a permutation of the input that looks like a shuffle.',
  },
  written: {
    javascript:
      '`a[--count[v - min]] = v` pre-decrements, so the index used is the *old* counter minus one: the last free slot for `v`. The decrement is what makes the next `v` land one slot lower, and that is the whole of counting sort’s stability — equal values are consumed from the same counter in the order they were read, so they leave in the order they arrived. One statement, and it is both the placement and the update of the answer key.',
    python:
      'Python has no `--` prefix form and no way to put a side effect inside a subscript, so the same step takes three statements: find the slot, write the value, decrement the counter. This is the one place the Python listing is longer than the other three, and the order matters — decrementing before the write would put the value one slot too high and interleave the equal values.',
    java: 'The same pre-decrement, and the same single statement. One evaluation-order detail is worth knowing: Java evaluates the array reference and the index *before* the right-hand side, so `count[v - min]` changes before `v` is stored. That is harmless — `v` is a local, read on the previous line — but the same line written `a[--count[a[i] - min]] = a[i]` would depend on that ordering being the one you assumed, which is exactly the kind of assumption a different language’s rules turn into a bug.',
    cpp: 'C++17 sequences the right operand of an assignment *before* the left one, so `v` is read before `--count` runs; Java and JavaScript evaluate the index first. With `v` in a local all three agree, which is precisely why the local is not decorative: inline the read as `a[--count[a[i] - lo]] = a[i]` and the same line is a different program in each language, for no reason a reader could see.',
  },
  done: {
    javascript:
      'The array is in order, and it is the same array object that came in — `a` was edited in place, so the caller sees sorted values with no copy at the boundary. The cost was n + k: the range scan, k zeros, n tallies, k - 1 running totals and n writes. The extra space is n + k and not k, because `src` is n; that is the price of the read hazard, and the textbook version spends the same n on an output array instead.',
    python:
      'Every value is in place, and the counter list is still there at the end holding the block boundaries: each cell was decremented exactly as many times as its value occurred, so every cell names the first slot it did not hand out. The list the caller passed in has been sorted in place, which is the cheap way to return a result in Python — no output list, and the garbage collector has nothing extra to reclaim.',
    java: 'Sorted, and `a` — the caller’s own array — has been edited in place, so there is no output array anywhere in the method. The two allocations counting sort cannot avoid are `max - min + 1` counters and, because of the read hazard, one copy of the input; the first is a property of the data’s range, not of its size, and nothing in the signature warns you when it is too large.',
    cpp: 'Sorted, and the vector handed back is the copy this function made of its by-value parameter — so the caller’s own vector is unchanged, and both the counter vector and `src` are allocated and freed inside the call. The honest cost line is therefore O(n + k) time and O(n + k) extra space, with `k = max - lo + 1`: a `std::vector<double>` of ages or coordinates would make `k` astronomically large, and this is exactly the case where a comparison sort is the right answer.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'countingSort',
    python: 'counting_sort',
    java: 'CountingSort.countingSort',
    cpp: 'counting_sort',
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

export const countingSortAlgo: AlgoDef<ArrayFrame> = {
  id: 'counting-sort',
  title: 'Counting Sort',
  category: 'sorting',
  summary:
    'Tabulate how many times each value occurs in a row indexed by value, turn the tallies into running totals, and write every value into the slot its total names.',
  intuition:
    'Reach for it when the values are small, dense whole numbers and you will keep sorting them: ages, months, a 0-255 byte, a short status code, a board file, a month index. Two conditions decide it, and both are cheap to check before you commit — the values must be integers, and the range between the smallest and the largest must be small enough to tabulate. What makes it worth knowing is what it refuses to do: it never compares two values, so it does not slow down as the number of distinct values grows, and it is stable for free because the counter hands out slots rather than a comparison deciding an order. The trap is always the same one: k is the width of the range, not the length of the array, and a k ten times larger than n turns a linear sort into a memory allocation that dwarfs the data. Check k against n first — that ratio is the entire decision.',
  complexity: {
    best: 'O(n + k)',
    average: 'O(n + k)',
    worst: 'O(n + k)',
    space: 'O(n + k)',
    note: 'k = max - min + 1, so the honest bound is O(n + k) and not O(n): every integer in the range is paid for whether or not it occurs, and doubling the range doubles both the time and the memory. Integers only — there is no counter for 3.5, and rounding one merges it with its neighbour. Space is n + k and not the k the picture suggests, because the placement has to read from a copy of the input: the writes go back into the values array, but reading them from there would hand back a value that an earlier write had already moved. The textbook version spends that same n on a second output array instead.',
  },
  traits: {
    stable: true,
    inPlace: false,
    offline: true,
    allowsDuplicates: true,
    tags: ['non-comparative', 'linear in n + k', 'stable', 'integers only', 'k can dominate'],
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
      default: SMALL_RANGE.length,
      regeneratesInput: true,
      help: 'The counter row is max − min + 1 cells wide regardless of this. That is the number that goes wrong.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: countingSort,
  lesson,
  expectations,
  formatResult: (r) => `[${(r as number[]).join(', ')}]`,
  anchors: ['start', 'find-range', 'count', 'prefix-sum', 'place', 'written', 'done'],
};

export default countingSortAlgo;
