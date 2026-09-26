import { byLanguage } from '../../code/anchors.ts';
import {
  fewDistinctArray,
  nearlySortedArray,
  randomArray,
  reversedArray,
} from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Merge Sort — top-down, recursive, and the only sort here that spends memory
 * to buy time.
 *
 * The invariant: `values[lo..hi)` is the region under construction, and
 * everything strictly left of `lo` is already in its final position. Two
 * recursive calls sort the halves; the merge then interleaves them into the
 * auxiliary buffer and copies the result back.
 *
 * The `overlay` row in every frame is that buffer. It is the whole point of the
 * visualisation: you can watch the merge fill the scratch space front to back
 * while the real array is frozen, and then watch the copy-back overwrite it.
 * Without the second row, merge sort is a recursion diagram; with it, it is a
 * data movement you can count.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 97;

/**
 * One array per preset, hoisted so a preset's `size` and its `values` can
 * never disagree — the generator honours `params.size`, so a preset that
 * stored more values than it asked for would be silently truncated and the
 * animation would stop matching the code the verification harness runs.
 */
const RANDOM = randomArray(SEED, 8, 10, 98);
const NEARLY_SORTED = nearlySortedArray(SEED + 4, 8, 1, 99);
const REVERSE = reversedArray(SEED + 6, 8, 1, 99);
const DUPLICATES = fewDistinctArray(SEED + 10, 9, 3, 1);

const PRESETS: Preset[] = [
  {
    id: 'random',
    label: 'Random',
    blurb:
      'The everyday case. Watch the merge at every level pick alternately from the two halves, and the aux row fill left to right.',
    input: { type: 'numbers', values: RANDOM },
    params: { size: RANDOM.length },
  },
  {
    id: 'nearly-sorted',
    label: 'Nearly sorted',
    blurb:
      'The merge barely has to interleave: the left half almost always wins each comparison, so the aux row ends up a near-copy of the input.',
    input: { type: 'numbers', values: NEARLY_SORTED },
    params: { size: NEARLY_SORTED.length },
  },
  {
    id: 'reverse',
    label: 'Reversed',
    blurb:
      'Every merge has to drain the right half first. Same n log n cost, but the pattern in the aux row is the exact mirror of the nearly-sorted case.',
    input: { type: 'numbers', values: REVERSE },
    params: { size: REVERSE.length },
  },
  {
    id: 'duplicates',
    label: 'Lots of ties',
    blurb:
      'Only three distinct values, so `<=` is exercised hard. Taking from the *left* half on a tie is what makes merge sort stable — the tie group never overtakes itself.',
    input: { type: 'numbers', values: DUPLICATES },
    params: { size: DUPLICATES.length },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

const AUX_LABEL = 'aux — shared scratch buffer';

/** `3 values` / `1 value` — a split of two is not a rare sight worth an `s`. */
const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

export function* mergeSort(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const size = Number(ctx.params.size ?? input.values.length);
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const values = [...source].slice(0, Math.max(0, size));
  const n = values.length;

  /** The single scratch buffer, shared by every merge — that is the O(n) space. */
  const aux: number[] = Array.from({ length: n }, () => 0);

  let ops = 0;
  let depth = 0;

  /**
   * The overlay row plus the active-range highlight, shared by every frame.
   *
   * Pointers are filtered because an empty range legitimately has `hi = lo - 1`,
   * and a cursor at -1 is not a position in the array. The `window` group is
   * likewise empty for an empty range, which is exactly what it should be.
   */
  const context = (
    lo: number,
    hi: number,
    extra: Record<string, number[]>,
    pointers: Record<string, number>,
  ) => {
    const cursors: Record<string, number> = {};
    for (const [name, at] of Object.entries(pointers)) if (at >= 0) cursors[name] = at;
    return {
      pointers: cursors,
      highlight: { ...extra, sorted: range(0, lo), window: range(lo, hi + 1) },
      overlay: { label: AUX_LABEL, values: [...aux], pointers: { ...cursors } },
    };
  };
  function* sortRange(lo: number, hi: number): Generator<ArrayFrame> {
    if (hi - lo <= 0) {
      yield {
        kind: 'array',
        index: 0,
        anchor: 'base-case',
        caption: `Range ${lo}..${hi} — depth ${depth}`,
        note:
          hi < lo
            ? `This half of the split came out empty — indices ${lo} to ${hi} hold nothing. There is nothing to sort, and the recursion unwinds one level.`
            : `A single value at index ${lo} is sorted by definition, so the recursion stops here. Every run of length 1 is a base case, and there are n of them.`,
        values: [...values],
        ...context(lo, hi, { current: hi >= lo ? [lo] : [] }, { lo, hi }),
        ops,
        vars: { lo, hi, depth, ops },
      };
      return;
    }

    const mid = Math.floor((lo + hi) / 2);

    yield {
      kind: 'array',
      index: 0,
      anchor: 'split',
      caption: `Range [${lo}, ${hi}] — depth ${depth}`,
      note: `Split [${lo}, ${hi}] at index ${mid}: the left half ${plural(mid - lo + 1, 'value')} (${lo} to ${mid}) and the right half ${plural(hi - mid, 'value')} (${mid + 1} to ${hi}). The left half is sorted first, and once it is done, every index below it is final.`,
      values: [...values],
      ...context(lo, hi, { compare: [mid] }, { lo, mid, hi }),
      ops,
      vars: { lo, mid, hi, depth, ops },
    };

    depth++;
    yield* sortRange(lo, mid);
    yield* sortRange(mid + 1, hi);
    depth--;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'merge',
      caption: `Range [${lo}, ${hi}] — depth ${depth}`,
      note: `Both halves are sorted now: ${lo} to ${mid} and ${mid + 1} to ${hi}. Merge them into aux starting at index ${lo} — two pointers walk the halves and the smaller of the two heads is written to aux[k] each time. The array itself is frozen until the copy-back.`,
      values: [...values],
      ...context(lo, hi, { picked: range(lo, mid + 1), current: [mid + 1] }, { lo, mid, hi }),
      ops,
      vars: { lo, mid, hi, depth, ops },
    };

    let i = lo;
    let j = mid + 1;
    let k = lo;

    while (i <= mid && j <= hi) {
      if (ctx.shouldStop()) return;
      ops++;
      const leftValue = values[i] as number;
      const rightValue = values[j] as number;
      const takeLeft = leftValue <= rightValue;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'compare',
        caption: `Merging [${lo}, ${mid}] and [${mid + 1}, ${hi}]`,
        note: `aux[${k}] takes the smaller of the two heads: ${leftValue} at index ${i} versus ${rightValue} at index ${j}. ${takeLeft ? 'The left half wins' : 'The right half wins'}, and that half's pointer steps on.`,
        values: [...values],
        ...context(lo, hi, { compare: [i, j], temp: [k] }, { lo, i, j, k, hi }),
        ops,
        vars: { lo, i, j, k, hi, left: leftValue, right: rightValue },
      };

      if (takeLeft) {
        aux[k] = leftValue;
        i++;
      } else {
        aux[k] = rightValue;
        j++;
      }
      k++;

      yield {
        kind: 'array',
        index: 0,
        anchor: takeLeft ? 'take-left' : 'take-right',
        caption: `Merging [${lo}, ${mid}] and [${mid + 1}, ${hi}]`,
        note: takeLeft
          ? `${leftValue} lands in aux[${k - 1}]. The left pointer is now at ${i}, still inside the half, so the left half has another value to offer.`
          : `${rightValue} lands in aux[${k - 1}]. The right pointer is now at ${j}, so the right half still has values to offer.`,
        values: [...values],
        ...context(lo, hi, { active: [k - 1] }, { lo, i, j, k, hi }),
        ops,
        vars: { lo, i, j, k, hi, written: aux[k - 1] ?? 0 },
      };
    }

    while (i <= mid) {
      if (ctx.shouldStop()) return;
      ops++;
      const rest = values[i] as number;
      aux[k] = rest;
      i++;
      const slot = k;
      k++;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'take-left',
        caption: `Merging [${lo}, ${mid}] and [${mid + 1}, ${hi}]`,
        note: `The right half is exhausted, so the rest of the left half copies straight across. ${rest} lands in aux[${slot}] and index ${i - 1} of the left half is done.`,
        values: [...values],
        ...context(lo, hi, { active: [slot] }, { lo, i, j, k, hi }),
        ops,
        vars: { lo, i, j, k, hi, written: rest },
      };
    }

    while (j <= hi) {
      if (ctx.shouldStop()) return;
      ops++;
      const rest = values[j] as number;
      aux[k] = rest;
      j++;
      const slot = k;
      k++;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'take-right',
        caption: `Merging [${lo}, ${mid}] and [${mid + 1}, ${hi}]`,
        note: `The left half is exhausted, so the rest of the right half copies straight across. ${rest} lands in aux[${slot}] and index ${j - 1} of the right half is done.`,
        values: [...values],
        ...context(lo, hi, { active: [slot] }, { lo, i, j, k, hi }),
        ops,
        vars: { lo, i, j, k, hi, written: rest },
      };
    }

    for (let p = lo; p <= hi; p++) {
      values[p] = aux[p] as number;
    }

    yield {
      kind: 'array',
      index: 0,
      anchor: 'copy-back',
      caption: `Range [${lo}, ${hi}] — depth ${depth}`,
      note: `Copy aux[${lo}..${hi}] back over the array. The range is now in order in the real array, so from here on the left half of the next merge up can rely on it. This extra pass is the price of the O(n) buffer.`,
      values: [...values],
      ...context(lo, hi, { active: range(lo, hi + 1) }, { lo, hi }),
      ops,
      vars: { lo, hi, depth, ops },
    };
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    note:
      n < 2
        ? 'Fewer than two elements, so there is nothing to split. Done.'
        : `One run of ${n} values, and one scratch buffer of the same length. Merge sort will halve this range ${Math.ceil(Math.log2(n))} times, so every value is compared about ${Math.ceil(Math.log2(n))} times no matter what the input looks like.`,
    values: [...values],
    highlight: { window: range(0, n) },
    overlay: { label: AUX_LABEL, values: [...aux], pointers: {} },
    vars: { n, depth: 0 },
  };

  if (n >= 2) yield* sortRange(0, n - 1);

  yield {
    kind: 'array',
    index: 0,
    anchor: 'done',
    note: `The whole array is one sorted run, in ${ops} comparison${ops === 1 ? '' : 's'} and ${n} extra cells of memory. The aux row is still there — that buffer is exactly what was bought with the O(n) space.`,
    values: [...values],
    highlight: { sorted: range(0, n) },
    sorted: [0, n],
    overlay: { label: AUX_LABEL, values: [...aux], pointers: {} },
    result: 'sorted',
    ops,
    vars: { ops, n },
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

const JS = `function mergeSort(a) {
  const aux = new Array(a.length).fill(0);         // one scratch buffer for the whole run
  sortRange(a, aux, 0, a.length - 1);              // @anchor start
  return a;                                        // @anchor done
}

function sortRange(a, aux, lo, hi) {
  if (hi <= lo) return;                            // @anchor base-case
  const mid = Math.floor((lo + hi) / 2);           // @anchor split
  sortRange(a, aux, lo, mid);
  sortRange(a, aux, mid + 1, hi);
  let i = lo, j = mid + 1, k = lo;                 // @anchor merge
  while (i <= mid && j <= hi) {
    if (a[i] <= a[j]) {                            // @anchor compare
      aux[k++] = a[i++];                           // @anchor take-left
    } else {
      aux[k++] = a[j++];                           // @anchor take-right
    }
  }
  while (i <= mid) aux[k++] = a[i++];
  while (j <= hi) aux[k++] = a[j++];
  for (let p = lo; p <= hi; p++) a[p] = aux[p];    // @anchor copy-back
}`;

const PY = `def merge_sort(a):
    aux = [0] * len(a)                              # one scratch buffer for the whole run
    sort_range(a, aux, 0, len(a) - 1)              # @anchor start
    return a                                       # @anchor done

def sort_range(a, aux, lo, hi):
    if hi <= lo:                                    # @anchor base-case
        return
    mid = (lo + hi) // 2                           # @anchor split
    sort_range(a, aux, lo, mid)
    sort_range(a, aux, mid + 1, hi)
    i, j, k = lo, mid + 1, lo                      # @anchor merge
    while i <= mid and j <= hi:
        if a[i] <= a[j]:                            # @anchor compare
            aux[k] = a[i]                           # @anchor take-left
            k += 1
            i += 1
        else:
            aux[k] = a[j]                           # @anchor take-right
            k += 1
            j += 1
    while i <= mid:                                 # leftover of the left half
        aux[k] = a[i]; k += 1; i += 1
    while j <= hi:                                  # leftover of the right half
        aux[k] = a[j]; k += 1; j += 1
    for p in range(lo, hi + 1):                     # @anchor copy-back
        a[p] = aux[p]`;

const JAVA = `class MergeSort {
    static int[] mergeSort(int[] a) {
        int[] aux = new int[a.length];              // one scratch buffer for the whole run
        sortRange(a, aux, 0, a.length - 1);         // @anchor start
        return a;                                   // @anchor done
    }

    static void sortRange(int[] a, int[] aux, int lo, int hi) {
        if (hi <= lo) return;                       // @anchor base-case
        int mid = (lo + hi) / 2;                    // @anchor split
        sortRange(a, aux, lo, mid);
        sortRange(a, aux, mid + 1, hi);
        int i = lo, j = mid + 1, k = lo;            // @anchor merge
        while (i <= mid && j <= hi) {
            if (a[i] <= a[j]) {                     // @anchor compare
                aux[k++] = a[i++];                  // @anchor take-left
            } else {
                aux[k++] = a[j++];                  // @anchor take-right
            }
        }
        while (i <= mid) aux[k++] = a[i++];
        while (j <= hi) aux[k++] = a[j++];
        for (int p = lo; p <= hi; p++) a[p] = aux[p]; // @anchor copy-back
    }
}`;

const CPP = `#include <vector>
using std::vector;

void sort_range(vector<int>& a, vector<int>& aux, int lo, int hi);

vector<int> merge_sort(vector<int> a) {
    vector<int> aux(a.size(), 0);                   // one scratch buffer for the whole run
    sort_range(a, aux, 0, (int)a.size() - 1);       // @anchor start
    return a;                                       // @anchor done
}

void sort_range(vector<int>& a, vector<int>& aux, int lo, int hi) {
    if (hi <= lo) return;                           // @anchor base-case
    int mid = (lo + hi) / 2;                        // @anchor split
    sort_range(a, aux, lo, mid);
    sort_range(a, aux, mid + 1, hi);
    int i = lo, j = mid + 1, k = lo;                // @anchor merge
    while (i <= mid && j <= hi) {
        if (a[i] <= a[j]) {                         // @anchor compare
            aux[k++] = a[i++];                      // @anchor take-left
        } else {
            aux[k++] = a[j++];                      // @anchor take-right
        }
    }
    while (i <= mid) aux[k++] = a[i++];
    while (j <= hi) aux[k++] = a[j++];
    for (int p = lo; p <= hi; p++) a[p] = aux[p];   // @anchor copy-back
}`;

const NOTES = {
  start: {
    javascript:
      'One buffer, allocated once, shared by every merge — that is where the O(n) space goes. `new Array(n)` would give a sparse array full of holes, so `.fill(0)` is needed to make it a real row of values the visualisation can show. The recursive call takes the array by reference, so every level works on the same storage.',
    python:
      'One buffer, allocated once, shared by every merge. `[0] * n` allocates and fills in a single step; `[0] * n` and `[0 for _ in range(n)]` differ only in style here, but both give a real list of zeros rather than a sparse structure. Python lists are mutable, so the array and the buffer are both edited in place and nothing is copied on the recursive calls.',
    java: 'One buffer, allocated once, shared by every merge — this line is the O(n) space. Java zero-initialises every array on creation, so no `fill` call is needed; and because `a` is a reference, every recursive call edits the same storage. The only copy in the whole algorithm is the final return value.',
    cpp: "One buffer, allocated once, shared by every merge. `vector<int> aux(a.size(), 0)` value-initialises in a single constructor call — the `std::vector<int> aux(n)` spelling would be equally correct. Note the parameters are `vector<int>&` references, so the recursion and the merge both edit the caller's vector in place; only the top-level `a` is taken by value, which is what lets this function return a sorted copy.",
  },
  'base-case': {
    javascript:
      'The recursion stops on runs of length 0 or 1. There are `n` of these across the whole sort, and reaching them is the entire termination argument — no depth limit, no iteration, just "a single element is already sorted".',
    python:
      'The recursion stops on runs of length 0 or 1. There are `n` of these across the whole sort, and reaching them is the entire termination argument: a single element is sorted by definition, so there is nothing left to do.',
    java: 'The recursion stops on runs of length 0 or 1. `hi <= lo` covers both the single-element and the empty case in one comparison, so no length arithmetic is needed. There are `n` such calls across the whole sort, and they are the entire termination proof.',
    cpp: 'The recursion stops on runs of length 0 or 1. `hi <= lo` covers the single-element and the empty case in one comparison. The recursion is log2(n) deep — far shallower than the n sequential insertions of bubble sort, which is why merge sort is the first algorithm here where the call stack stops mattering.',
  },
  split: {
    javascript:
      'Cut the range in two, floor-biased so the left half is the larger one. The two recursive calls below run the left half first, and that ordering is not arbitrary: when the left half finishes, every index below `lo` of the *parent* range is final, which is what lets the parent merge treat it as a sorted run.',
    python:
      'Cut the range in two with integer floor division, which makes the left half the larger one when the length is odd. Python has no integer overflow here, so the same expression would be wrong only for negative bounds — which `lo` never is, because the base case returns before this line is reached.',
    java: 'Cut the range in two with integer division, floor-biased so the left half is the larger one when the length is odd. The recursion is log2(n) deep, so the JVM stack is never a practical limit here — unlike, say, a naive quicksort on sorted input.',
    cpp: 'Cut the range in two with integer division, floor-biased so the left half is larger when the length is odd. Watch the signedness: `lo` and `hi` are `int`, and mixing them with `size()` values (which are `size_t`) in a mid-calculation is a classic source of unsigned underflow bugs in hand-rolled C++ sorts.',
  },
  merge: {
    javascript:
      'Three cursors, and the array is frozen. `i` walks the sorted left half, `j` the sorted right half, and `k` writes forward through the buffer — it never moves backwards, which is the whole reason a single pass is enough. This is the step that makes the algorithm merge sort, and it is the only step that is not a simple sort.',
    python:
      "Three cursors, and the array is frozen. `i` walks the sorted left half, `j` the right half, and `k` writes forward through the buffer. The parallel-assignment form `i, j, k = lo, mid + 1, lo` is a Python convenience; the other three languages need three declarations and Python's is the only one that reads as a single statement.",
    java: "Three cursors, and the array is frozen. `i` walks the sorted left half, `j` the right half, `k` writes forward through the buffer. Java declares all three in one `int` statement, which is as close as the language comes to Python's tuple assignment.",
    cpp: 'Three cursors, and the array is frozen. `i` walks the sorted left half, `j` the right half, `k` writes forward through the buffer. C++ has no tuple assignment either, so the three declarators share one `int` statement — and because `k` only ever advances, the merge never has to re-examine a slot it has already written.',
  },
  compare: {
    javascript:
      "The only comparison in the algorithm, and it is `<=` rather than `<`. That single character is the whole of merge sort's stability: on a tie, the value from the left half — which contains the values that were already earlier in the input — is taken first, so equal values never reverse. Changing it to `<` makes the sort correct but no longer stable.",
    python:
      "The only comparison in the algorithm, and it is `<=` rather than `<`. That single character is the whole of merge sort's stability: on a tie the left half wins, and the left half holds the values that came first in the input, so equal values never reverse. Change it to `<` and the sort is still correct but no longer stable.",
    java: "The only comparison in the algorithm, and it is `<=` rather than `<`. On a tie the left half wins, and the left half holds the values that came first in the input — so equal values never reverse. That is merge sort's stability, and it is decided by this one character.",
    cpp: "The only comparison in the algorithm, and it is `<=` rather than `<`. On a tie the left half wins, and the left half holds the values that came first in the input, so equal values never reverse. That one character is the whole of merge sort's stability.",
  },
  'take-left': {
    javascript:
      'One write into the buffer, and the left cursor steps on. Because `k` advances in the same statement, the buffer is always a valid sorted prefix of the merged range — the array is untouched, but the output is already correct as far as it goes. When the right half runs out this same line drains the rest of the left half.',
    python:
      'One write into the buffer, and the left cursor steps on. The buffer is always a valid sorted prefix of the merged range, so the output is correct as far as it goes even though the array itself has not been touched. When the right half runs out, this same line drains the rest of the left half.',
    java: 'One write into the buffer, and the left cursor steps on. The buffer is always a valid sorted prefix of the merged range. The trailing drain loops that follow use this identical expression, which is why they carry no anchor of their own — they are the same step with one cursor already exhausted.',
    cpp: 'One write into the buffer, and the left cursor steps on. `aux[k++] = a[i++]` relies on the fact that `k` and `i` are different variables, so there is no sequencing hazard here — the same expression would be undefined behaviour in C++ if it were `a[i++] = a[k++]`.',
  },
  'take-right': {
    javascript:
      'The mirror of the previous line: the right cursor steps on instead. Values arrive from the right half already in ascending order within that half, so no sorting happens here — the merge is a pure interleaving of two sorted runs, which is why it is linear in the size of the range.',
    python:
      'The mirror of the previous line: the right cursor steps on instead. Values arrive from the right half already ascending within that half, so nothing is being sorted here — the merge is a pure interleaving of two sorted runs, which is why it is linear in the size of the range.',
    java: 'The mirror of the previous line: the right cursor steps on instead. Nothing is sorted here — the merge only interleaves two runs that are each already ascending, which is why it takes linear time in the size of the range.',
    cpp: 'The mirror of the previous line: the right cursor steps on instead. Nothing is sorted here — the merge only interleaves two runs that are each already ascending, which is why it takes linear time in the size of the range.',
  },
  'copy-back': {
    javascript:
      'The price of the buffer, and the reason merge sort is not in place: the merged run lives in `aux`, so every element has to be written a second time to get it into the array. Without this loop the algorithm would be sorting into a side buffer nobody reads. The final `return a` copies once more — the object identity is unchanged, but the contents are.',
    python:
      'The price of the buffer, and the reason merge sort is not in place: the merged run lives in `aux`, so every element is written a second time to get it into the list. This loop is the one place the array changes during a merge, and it is where the "half the work is copying" observation comes from — which is why bottom-up merge sort is written to avoid it.',
    java: 'The price of the buffer, and the reason merge sort is not in place: the merged run lives in `aux`, so every element is written twice. Java writes the primitive directly, so the copy is a raw `int` move with no object overhead — this loop is one of the few places where Java is as fast as the C++ version.',
    cpp: 'The price of the buffer, and the reason merge sort is not in place: the merged run lives in `aux`, so every element is written twice. The buffers are passed as `vector<int>&`, so this is a `memcpy`-shaped loop over contiguous ints — about as fast as a copy can be, which is the usual defence of merge sort on modern hardware.',
  },
  done: {
    javascript:
      'The top-level call has returned, so the one run that started as the whole array is now the whole array, sorted. Nothing further is needed: every index is final because the range that contained it has been merged exactly once, at the top.',
    python:
      'The top-level call has returned, so the one run that started as the whole list is now the whole list, sorted. Every index is final because the range that contained it was merged exactly once — at the top.',
    java: 'The top-level call has returned, so the run that started as the whole array is now sorted. Every index is final because the range containing it was merged exactly once, at the top of the recursion.',
    cpp: 'The top-level call has returned, so the run that started as the whole vector is now sorted. Every index is final because the range containing it was merged exactly once, at the top of the recursion — and the return-by-value is the only copy in the whole program.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'mergeSort',
    python: 'merge_sort',
    java: 'MergeSort.mergeSort',
    cpp: 'merge_sort',
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

const expectations: Expectation[] = PRESETS.map((p) => ({
  presetId: p.id,
  args: [valuesOf(p)],
  result: [...valuesOf(p)].sort((a, b) => a - b),
}));

export const mergeSortAlgo: AlgoDef<ArrayFrame> = {
  id: 'merge-sort',
  title: 'Merge Sort',
  category: 'sorting',
  summary:
    'Split the array in half, sort each half recursively, then interleave the two sorted runs into a shared auxiliary buffer.',
  intuition:
    'Reach for it when the data will not fit in memory, when you are sorting linked lists (where it is the only O(n log n) sort that needs no random access), or when you want a worst-case guarantee rather than an average one. The cost is a second buffer and the copy-back pass, so if you have n cells to spare and no reason to doubt the input, heap sort or introsort will usually beat it. Its real strength is that its cost is the same on every input — sorted, reversed, or random — which is why external merge sort is still how databases sort files bigger than RAM.',
  complexity: {
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(n)',
    note: 'Not in place, and not just because of the buffer: the recursion also costs O(log n) stack, though that vanishes next to the buffer. Stable, because the merge takes from the left half on a tie. Every input costs exactly the same, which is the property most worth having.',
  },
  traits: {
    stable: true,
    inPlace: false,
    online: false,
    allowsDuplicates: true,
    tags: ['divide and conquer', 'guaranteed n log n', 'external sort'],
  },
  viewport: 'array',
  level: 'intermediate',
  params: [
    {
      key: 'size',
      label: 'Elements',
      kind: 'number',
      min: 2,
      max: 150,
      step: 1,
      default: 8,
      regeneratesInput: true,
      help: 'Beyond 150 the viewport switches to canvas.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: mergeSort,
  lesson,
  expectations,
  formatResult: (r) => `[${(r as number[]).join(', ')}]`,
  anchors: [
    'start',
    'base-case',
    'split',
    'merge',
    'compare',
    'take-left',
    'take-right',
    'copy-back',
    'done',
  ],
};

export default mergeSortAlgo;
