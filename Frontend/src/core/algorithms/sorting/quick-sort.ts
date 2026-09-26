import { byLanguage } from '../../code/anchors.ts';
import {
  distinctArray,
  fewDistinctArray,
  nearlySortedArray,
  randomArray,
} from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Quick Sort — Lomuto partition, last element as the pivot.
 *
 * The teaching decision here is deliberate: the *bad* pivot choice. Taking the
 * last element means that on already-sorted input the pivot is always the
 * maximum, so the split is always 0 versus n-1 and the recursion is n deep.
 * That is quicksort's worst case in plain sight, and the `sorted` preset exists
 * so you can watch a 10-element array turn into a 10-level stack.
 *
 * Lomuto (one forward scan, one swap pointer) rather than Hoare (two converging
 * pointers) because Lomuto has exactly one line that puts the pivot in its
 * final place, which gives the animation a clean moment to stop on.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 113;

/**
 * One array per preset, hoisted so a preset's `size` and its `values` can
 * never disagree — the generator honours `params.size`, so a preset that
 * stored more values than it asked for would be silently truncated and the
 * animation would stop matching the code the verification harness runs.
 */
const RANDOM = randomArray(SEED, 9, 10, 98);
const SORTED = nearlySortedArray(SEED + 4, 9, 1, 99).sort((a, b) => a - b);
const DISTINCT = distinctArray(SEED + 6, 9, 1, 120);
const DUPLICATES = fewDistinctArray(SEED + 10, 10, 3, 1);

const PRESETS: Preset[] = [
  {
    id: 'random',
    label: 'Random',
    blurb:
      'The everyday case, and the one quicksort is built for. The last element is a decent pivot, so the splits are roughly even.',
    input: { type: 'numbers', values: RANDOM },
    params: { size: RANDOM.length },
  },
  {
    id: 'sorted',
    label: 'Already sorted',
    blurb:
      'The worst case for this pivot rule. The last element is the maximum, so the pivot always lands at the far end and the recursion goes n deep: O(n²) on data that is already free.',
    input: { type: 'numbers', values: SORTED },
    params: { size: SORTED.length },
  },
  {
    id: 'distinct',
    label: 'All distinct',
    blurb:
      'No ties at all, so `<=` never fires on equality. The split is a clean partition into "at most the pivot" and "greater than the pivot", with no ambiguity about where equals belong.',
    input: { type: 'numbers', values: DISTINCT },
    params: { size: DISTINCT.length },
  },
  {
    id: 'duplicates',
    label: 'Lots of ties',
    blurb:
      'Only three distinct values, so the 3-way problem shows up: the pivot value is split across the whole range and no amount of sorting those regions will shrink them. This is what motivates median-of-three and Dutch-flag partitioning.',
    input: { type: 'numbers', values: DUPLICATES },
    params: { size: DUPLICATES.length },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

export function* quickSort(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const size = Number(ctx.params.size ?? input.values.length);
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const values = [...source].slice(0, Math.max(0, size));
  const n = values.length;

  let ops = 0;
  let depth = 0;
  let maxDepth = 0;

  /** Everything outside `[lo, hi]` is final — that is quicksort's invariant. */
  const outside = (lo: number, hi: number): number[] => [...range(0, lo), ...range(hi + 1, n)];

  function* partition(lo: number, hi: number): Generator<ArrayFrame, number, void> {
    const pivot = values[hi] as number;
    const pivotValue = pivot;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'pivot',
      caption: `Range [${lo}, ${hi}] — depth ${depth}`,
      note: `Take the last value, ${pivotValue}, as the pivot for [${lo}, ${hi}]. Everything smaller than it will be collected to its left; everything else stays behind it.`,
      values: [...values],
      pointers: { lo, hi },
      highlight: { pivot: [hi], sorted: outside(lo, hi), window: range(lo, hi + 1) },
      sorted: [hi + 1, n],
      ops,
      vars: { lo, hi, pivot: pivotValue, depth },
    };

    let i = lo;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'partition',
      caption: `Range [${lo}, ${hi}] — depth ${depth}`,
      note: `Two cursors: \`j\` scans forward from ${lo}, and \`i\` marks the end of the values already moved to the pivot's left. The pivot itself is parked at index ${hi} and never touched by the scan.`,
      values: [...values],
      pointers: { lo, i, j: lo, hi },
      highlight: { pivot: [hi], sorted: outside(lo, hi), window: range(lo, hi + 1) },
      sorted: [hi + 1, n],
      ops,
      vars: { lo, i, j: lo, hi, pivot: pivotValue },
    };

    for (let j = lo; j < hi; j++) {
      if (ctx.shouldStop()) return -1;
      ops++;
      const value = values[j] as number;
      const take = value <= pivotValue;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'compare',
        caption: `Range [${lo}, ${hi}] — depth ${depth}`,
        note: `Compare ${value} with the pivot ${pivotValue}. ${take ? `It is not bigger, so it belongs on the pivot's left and moves to the collection boundary at index ${i}.` : `It is bigger, so it stays where it is and \`j\` simply steps on.`}`,
        values: [...values],
        pointers: { lo, i, j, hi },
        highlight: {
          compare: [j, hi],
          pivot: [hi],
          sorted: outside(lo, hi),
          window: range(lo, hi + 1),
        },
        sorted: [hi + 1, n],
        ops,
        vars: { lo, i, j, hi, value, pivot: pivotValue },
      };

      if (take) {
        const moved = values[i] as number;
        values[i] = value;
        values[j] = moved;
        i++;

        yield {
          kind: 'array',
          index: 0,
          anchor: 'swap',
          caption: `Range [${lo}, ${hi}] — depth ${depth}`,
          note:
            j === i - 1
              ? `Swap indices ${j} and ${i - 1} — the same cell, so nothing actually moves. ${value} was already on the pivot's left, and the collection boundary steps on to ${i}. Lomuto pays this no-op exchange on the first element of every partition.`
              : `Swap indices ${j} and ${i - 1}. ${value} joins the block of values that are at most the pivot, and ${moved} is displaced to index ${j}, where it was read from. The collection boundary is now ${i}.`,
          values: [...values],
          pointers: { lo, i, j, hi },
          highlight: {
            swapping: [j, i - 1],
            pivot: [hi],
            sorted: outside(lo, hi),
            window: range(lo, hi + 1),
          },
          sorted: [hi + 1, n],
          ops,
          vars: { lo, i, j, hi, value, displaced: moved },
        };
      }
    }

    const placed = values[i] as number;
    values[i] = pivotValue;
    values[hi] = placed;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'pivot-place',
      caption: `Range [${lo}, ${hi}] — depth ${depth}`,
      note: `Swap the pivot into index ${i}, the boundary. It is now bigger than everything in ${lo} to ${i - 1} and smaller than everything in ${i + 1} to ${hi}, so index ${i} is final and the range splits into two independent problems.`,
      values: [...values],
      pointers: { lo, i, hi },
      highlight: {
        found: [i],
        sorted: [...outside(lo, i), ...range(i + 1, n)],
        window: range(lo, i),
      },
      sorted: [i + 1, n],
      ops,
      vars: { lo, i, hi, pivot: pivotValue, displaced: placed },
    };

    return i;
  }

  function* sortRange(lo: number, hi: number): Generator<ArrayFrame> {
    if (lo >= hi) {
      yield {
        kind: 'array',
        index: 0,
        anchor: 'base-case',
        caption: `Range [${lo}, ${hi}] — depth ${depth}`,
        note:
          lo > hi
            ? `The range [${lo}, ${hi}] is empty — one half of the split was empty. Nothing to sort, and the recursion unwinds.`
            : `A single value at index ${lo} needs no partition: with no range to split there is nothing to order, so it is already final.`,
        values: [...values],
        pointers: { lo, ...(hi >= 0 ? { hi } : {}) },
        highlight: { sorted: outside(lo, hi) },
        ops,
        vars: { lo, hi, depth, maxDepth },
      };
      return;
    }

    maxDepth = Math.max(maxDepth, depth + 1);
    const pivotAt = yield* partition(lo, hi);
    if (pivotAt < 0) return; // cancelled mid-partition

    yield {
      kind: 'array',
      index: 0,
      anchor: 'recurse-smaller',
      caption: `Range [${lo}, ${pivotAt - 1}] — depth ${depth}`,
      note: `Recurse on [${lo}, ${pivotAt - 1}], the ${pivotAt - lo} value${pivotAt - lo === 1 ? '' : 's'} that must end up left of the pivot. The pivot index is now off limits, which is what guarantees the recursion makes progress.`,
      values: [...values],
      pointers: { lo, pivot: pivotAt, ...(pivotAt > lo ? { hi: pivotAt - 1 } : {}) },
      highlight: { sorted: outside(lo, pivotAt - 1), window: range(lo, pivotAt) },
      sorted: [pivotAt + 1, n],
      ops,
      vars: { lo, hi, pivotAt, depth, maxDepth },
    };

    depth++;
    yield* sortRange(lo, pivotAt - 1);
    depth--;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'recurse-larger',
      caption: `Range [${pivotAt + 1}, ${hi}] — depth ${depth}`,
      note: `Recurse on [${pivotAt + 1}, ${hi}], the ${hi - pivotAt} value${hi - pivotAt === 1 ? '' : 's'} that must end up right of the pivot. Together with the left half this accounts for every index except ${pivotAt} itself.`,
      values: [...values],
      pointers: { lo, pivot: pivotAt, hi },
      highlight: { sorted: outside(pivotAt, hi), window: range(pivotAt + 1, hi + 1) },
      sorted: [pivotAt + 1, n],
      ops,
      vars: { lo, hi, pivotAt, depth, maxDepth },
    };

    depth++;
    yield* sortRange(pivotAt + 1, hi);
    depth--;
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    note:
      n < 2
        ? 'Fewer than two elements, so there is nothing to partition. Done.'
        : `The whole array is one range to partition. Each partition puts one value in its final place and splits the rest in two, so the average depth is log2(${n}) — but the pivot rule decides whether you get that or something much worse.`,
    values: [...values],
    highlight: { window: range(0, n) },
    vars: { n, depth: 0 },
  };

  if (n >= 2) yield* sortRange(0, n - 1);

  yield {
    kind: 'array',
    index: 0,
    anchor: 'done',
    note: `Sorted in ${ops} comparison${ops === 1 ? '' : 's'}, with a recursion that got ${maxDepth} level${maxDepth === 1 ? '' : 's'} deep. Compare that with merge sort's guaranteed log2(${Math.max(1, Math.ceil(Math.log2(n)))}) — the depth is the whole story on bad pivots.`,
    values: [...values],
    highlight: { sorted: range(0, n) },
    sorted: [0, n],
    result: 'sorted',
    ops,
    vars: { ops, maxDepth, n },
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

const JS = `function quickSort(a) {
  sortRange(a, 0, a.length - 1);                    // @anchor start
  return a;                                         // @anchor done
}

function sortRange(a, lo, hi) {
  if (lo >= hi) return;                             // @anchor base-case
  const pivot = a[hi];                              // @anchor pivot
  let i = lo;                                       // @anchor partition
  for (let j = lo; j < hi; j++) {                   // @anchor compare
    if (a[j] <= pivot) {
      const t = a[i];                               // @anchor swap
      a[i] = a[j];
      a[j] = t;
      i++;
    }
  }
  const t = a[i];                                   // @anchor pivot-place
  a[i] = a[hi];
  a[hi] = t;
  sortRange(a, lo, i - 1);                          // @anchor recurse-smaller
  sortRange(a, i + 1, hi);                          // @anchor recurse-larger
}`;

const PY = `def quick_sort(a):
    sort_range(a, 0, len(a) - 1)                    # @anchor start
    return a                                       # @anchor done

def sort_range(a, lo, hi):
    if lo >= hi:                                    # @anchor base-case
        return
    pivot = a[hi]                                   # @anchor pivot
    i = lo                                          # @anchor partition
    for j in range(lo, hi):                         # @anchor compare
        if a[j] <= pivot:
            a[i], a[j] = a[j], a[i]                 # @anchor swap
            i += 1
    a[i], a[hi] = a[hi], a[i]                       # @anchor pivot-place
    sort_range(a, lo, i - 1)                        # @anchor recurse-smaller
    sort_range(a, i + 1, hi)                        # @anchor recurse-larger`;

const JAVA = `class QuickSort {
    static int[] quickSort(int[] a) {
        sortRange(a, 0, a.length - 1);              // @anchor start
        return a;                                   // @anchor done
    }

    static void sortRange(int[] a, int lo, int hi) {
        if (lo >= hi) return;                       // @anchor base-case
        int pivot = a[hi];                           // @anchor pivot
        int i = lo;                                  // @anchor partition
        for (int j = lo; j < hi; j++) {              // @anchor compare
            if (a[j] <= pivot) {
                int t = a[i];                        // @anchor swap
                a[i] = a[j];
                a[j] = t;
                i++;
            }
        }
        int t = a[i];                                // @anchor pivot-place
        a[i] = a[hi];
        a[hi] = t;
        sortRange(a, lo, i - 1);                    // @anchor recurse-smaller
        sortRange(a, i + 1, hi);                    // @anchor recurse-larger
    }
}`;

const CPP = `#include <vector>
using std::vector;

void sort_range(vector<int>& a, int lo, int hi);

vector<int> quick_sort(vector<int> a) {
    sort_range(a, 0, (int)a.size() - 1);            // @anchor start
    return a;                                       // @anchor done
}

void sort_range(vector<int>& a, int lo, int hi) {
    if (lo >= hi) return;                           // @anchor base-case
    int pivot = a[hi];                              // @anchor pivot
    int i = lo;                                     // @anchor partition
    for (int j = lo; j < hi; j++) {                 // @anchor compare
        if (a[j] <= pivot) {
            int t = a[i];                           // @anchor swap
            a[i] = a[j];
            a[j] = t;
            i++;
        }
    }
    int t = a[i];                                   // @anchor pivot-place
    a[i] = a[hi];
    a[hi] = t;
    sort_range(a, lo, i - 1);                       // @anchor recurse-smaller
    sort_range(a, i + 1, hi);                       // @anchor recurse-larger
}`;

const NOTES = {
  start: {
    javascript:
      'The whole sort is one recursive call, and the array is passed by reference so every level edits the same storage — quicksort is genuinely in place, unlike merge sort. The `hi` bound is inclusive, which is a deliberate choice: it makes the pivot "the last element" rather than "one past the end".',
    python:
      'The whole sort is one recursive call, and the list is mutated rather than copied, so every level works on the same storage. The `hi` bound is inclusive, which is what makes the pivot the last element rather than one past the end — a purely stylistic decision that changes the indexing in every line below.',
    java: 'The whole sort is one recursive call. The array is a reference, so the recursion edits the same storage — quicksort is in place, unlike merge sort. The one caveat is the stack: on sorted input this pivot rule recurses n deep, which on a million elements would overflow, and real implementations switch to median-of-three or an explicit stack for exactly that reason.',
    cpp: "The whole sort is one recursive call, and `sort_range` takes `vector<int>&` so the recursion edits the caller's vector in place. Only the top-level `a` is taken by value, which is what makes `quick_sort` return a sorted copy while every internal call works by reference. The forward declaration above is what lets the wrapper come first.",
  },
  'base-case': {
    javascript:
      'Ranges of zero or one element are already sorted, and that check is what terminates the recursion. It also fires constantly: a partition that lands the pivot at one end produces an empty half, so on bad input the "base case" is a single-element range and the recursion walks all the way down. The condition is `lo >= hi`, not `lo == hi`, because empty ranges are normal here.',
    python:
      'Ranges of zero or one element are already sorted, and that check is what terminates the recursion. `lo >= hi` rather than `lo == hi` because empty ranges are entirely normal here — a pivot that lands at one end produces one. On bad pivots this is the difference between a log-depth recursion and an n-deep one.',
    java: 'Ranges of zero or one element are already sorted, and that check is what terminates the recursion. Empty ranges are normal here, so the test is `lo >= hi` and not `lo == hi`. A one-element range costs a stack frame for nothing, which is the hidden constant that makes a bad pivot rule so slow.',
    cpp: 'Ranges of zero or one element are already sorted, and that check is what terminates the recursion. Empty ranges are normal here, so the test is `lo >= hi` and not `lo == hi`. Note the signed `int` bounds: passing `hi + 1` into an `unsigned` would be a compile error here, which is one small mercy of using `int`.',
  },
  pivot: {
    javascript:
      'The pivot is the last element, and it is stored in a local. That single choice is the whole difference between a sort that is fast on average and one that is fast on *your* data: a sorted array hands the maximum to every partition, so the split is always 0 versus n - 1. Median-of-three, or a random pivot, removes the failure mode at the cost of one extra comparison.',
    python:
      'The pivot is the last element, copied into a local so later swaps cannot lose it. This is the whole difference between a sort that is fast on average and one that is fast on *your* data: a sorted array hands the maximum to every partition, so the split is always 0 versus n - 1 and the recursion goes n deep. Median-of-three or a random pivot removes the failure mode for the price of one comparison.',
    java: 'The pivot is the last element, copied into a local `int` — which matters, because the loop below will overwrite index `hi` before the pivot is put back. Storing the pivot in a variable rather than re-reading `a[hi]` each time is not just tidier here; it is required.',
    cpp: 'The pivot is the last element, copied into a local `int`. Storing it in a variable is not an optimisation but a requirement: the loop below overwrites `a[hi]`, so a pivot that were re-read from the array each time would be destroyed halfway through. Taking the pivot value rather than its index is what makes this partition safe.',
  },
  partition: {
    javascript:
      "One boundary pointer, and the pivot parked out of harm's way at `hi`. Everything in `lo` to `i - 1` is already known to be at most the pivot, and `i` is the first slot where a bigger value can sit. Unlike Hoare partitioning there is no second scanning pointer coming back towards `i`, which is why Lomuto makes more swaps — and why it is the version everyone learns first.",
    python:
      "One boundary pointer, and the pivot parked out of harm's way at `hi`. Everything in `lo` to `i - 1` is already known to be at most the pivot, and `i` is the first slot where a bigger value can sit. Unlike Hoare partitioning, no second pointer converges from the right, so Lomuto performs more swaps — roughly three times as many — which is a real cost when swaps dominate.",
    java: "One boundary pointer, and the pivot parked out of harm's way at `hi`. Everything in `lo` to `i - 1` is already known to be at most the pivot. This single-pointer scan is Lomuto partitioning: simpler than Hoare, but it does more swaps, and when swaps are the expensive operation that difference is measurable.",
    cpp: "One boundary pointer, and the pivot parked out of harm's way at `hi`. Everything in `lo` to `i - 1` is already at most the pivot. This is Lomuto partitioning: one forward scan instead of Hoare's two converging pointers, at the price of roughly three times as many swaps.",
  },
  compare: {
    javascript:
      "One comparison per element, and the `<=` is not an arbitrary choice. It puts values *equal* to the pivot on the pivot's left, which is what makes this version stable. Note the loop stops at `j < hi`, never reading the pivot slot — that is why the pivot can sit at the end of the range while the scan runs.",
    python:
      "One comparison per element, and the `<=` is not an arbitrary choice: it puts values *equal* to the pivot on the pivot's left, which is what makes this version stable. The loop stops at `j < hi` and never reads the pivot slot, which is why the pivot can sit at the end of the range while the scan runs.",
    java: "One comparison per element, and the `<=` puts values equal to the pivot on the pivot's left — that is what makes this version stable. The loop bound `j < hi` deliberately excludes the pivot slot, so the scan can leave the pivot parked at the end of the range.",
    cpp: "One comparison per element, and the `<=` puts values equal to the pivot on the pivot's left, which is what makes this version stable. The bound `j < hi` deliberately excludes the pivot slot so the scan never disturbs the value it is partitioning around.",
  },
  swap: {
    javascript:
      'The swap that grows the "at most the pivot" block by one. When `i === j` it swaps a slot with itself, which is wasted work but harmless — and it happens for the first element of every partition, so it is a small, constant tax on every call. Hoare partitioning avoids it.',
    python:
      'The swap that grows the "at most the pivot" block by one. Python does it in a single statement; the other three languages need a temporary because there is no tuple assignment. When `i === j` the swap is with itself, which is wasted work but harmless — and it happens on the first element of every partition, so it is a small constant tax on every call.',
    java: 'The swap that grows the "at most the pivot" block by one. Java has no tuple assignment, so `t` is unavoidable. When `i === j` the swap is with itself: wasted work, but harmless, and it happens on the first element of every partition — a small constant tax on every call, which Hoare partitioning does not pay.',
    cpp: 'The swap that grows the "at most the pivot" block by one. `std::swap` would do it in one call; writing the three steps out is what makes the three memory writes visible. When `i === j` the swap is with itself — wasted work, but harmless, and it happens on the first element of every partition.',
  },
  'pivot-place': {
    javascript:
      'The moment the algorithm earns its name. The pivot is exchanged with whatever is at index `i`, which is the boundary between "at most the pivot" and "bigger than the pivot" — so after this swap, index `i` holds the right value in the right place, and the two sides can be sorted without ever consulting `i` again.',
    python:
      'The moment the algorithm earns its name. The pivot is exchanged with whatever is at index `i`, the boundary between "at most the pivot" and "bigger than the pivot" — so after this swap index `i` is right and final, and neither half of the recursion will touch it. Every value ends up placed by exactly one of these swaps.',
    java: 'The moment the algorithm earns its name. The pivot is exchanged with whatever is at index `i`, the boundary between "at most the pivot" and "bigger than the pivot" — so after this swap index `i` is right and final. Every value in the array is placed by exactly one of these swaps, which is why the final pass is free.',
    cpp: 'The moment the algorithm earns its name. The pivot is exchanged with whatever is at index `i`, the boundary between "at most the pivot" and "bigger than the pivot" — so after this swap index `i` is right and final, and neither recursive call can disturb it.',
  },
  'recurse-smaller': {
    javascript:
      'Sort the values that belong left of the pivot. The range ends at `i - 1` because index `i` is now correct, and starting at `lo` means the pivot itself is excluded. If `i` turned out to be `lo`, this call is empty and returns immediately — which is exactly the n-deep pathology on sorted input.',
    python:
      'Sort the values that belong left of the pivot. The range ends at `i - 1` because index `i` is now correct. If `i` turned out to be `lo` this call is empty and returns immediately — the n-deep pathology you see on sorted input, where every partition splits 0 against n - 1.',
    java: 'Sort the values that belong left of the pivot. The range ends at `i - 1` because index `i` is now correct. When `i` is `lo` the call is empty and returns at once — the n-deep pathology on sorted input, where every partition splits 0 against n - 1 and the JVM stack is the first thing to give.',
    cpp: 'Sort the values that belong left of the pivot. The range ends at `i - 1` because index `i` is now correct. When `i` is `lo` the call is empty and returns at once — the n-deep pathology on sorted input, where every partition splits 0 against n - 1.',
  },
  'recurse-larger': {
    javascript:
      'Sort the values that belong right of the pivot, then let the stack unwind. Note the order: the smaller half is sorted *first* and the larger half is left on the stack. That costs nothing here, but it is a tail-call-shaped recursion on the right branch, which is the part of quicksort an iterative implementation can turn into a loop.',
    python:
      'Sort the values that belong right of the pivot, then let the stack unwind. The smaller half was sorted first, leaving the larger half on the stack — which costs nothing here, but it is a tail-call-shaped recursion on the right branch, the part an iterative implementation can turn into a plain loop.',
    java: 'Sort the values that belong right of the pivot, then let the stack unwind. The smaller half is sorted first and the larger half is left on the stack: a tail-call-shaped recursion on the right branch, which is what an iterative implementation turns into a loop to avoid stack growth on adversarial input.',
    cpp: 'Sort the values that belong right of the pivot, then let the stack unwind. The smaller half was sorted first, leaving the larger half on the stack — a tail-call-shaped recursion on the right branch, which is the branch an iterative implementation can turn into a loop.',
  },
  done: {
    javascript:
      'The top-level call has returned, so every pivot has been placed. There is no final pass and no buffer copy: because each value was put in its final slot by a pivot swap, the array is sorted the moment the recursion bottoms out.',
    python:
      'The top-level call has returned, so every pivot has been placed. There is no final pass and no buffer copy: because each value was put in its final slot by a pivot swap, the list is sorted the moment the recursion bottoms out.',
    java: 'The top-level call has returned, so every pivot has been placed. There is no final pass and no buffer copy: each value reached its final slot by a pivot swap, so the array is sorted the moment the recursion bottoms out.',
    cpp: 'The top-level call has returned, so every pivot has been placed. There is no final pass and no buffer copy: each value reached its final slot by a pivot swap, so the vector is sorted the moment the recursion bottoms out — and the return-by-value is the only copy in the program.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'quickSort',
    python: 'quick_sort',
    java: 'QuickSort.quickSort',
    cpp: 'quick_sort',
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

export const quickSortAlgo: AlgoDef<ArrayFrame> = {
  id: 'quick-sort',
  title: 'Quick Sort',
  category: 'sorting',
  summary:
    'Partition around a pivot so everything smaller ends up left of it, then sort the two halves independently.',
  intuition:
    "Reach for it for general-purpose in-memory sorting: it has the smallest constant factor of the O(n log n) family, it sorts in place, and it is cache-friendly because the recursion works on contiguous slices. Do *not* reach for it when you cannot rule out adversarial input — the last-element pivot shown here is O(n²) and n stack frames deep on sorted data, which is exactly the shape an attacker would send. Median-of-three, introsort's heapsort fallback, or a randomised pivot are the standard defences.",
  complexity: {
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n^2)',
    space: 'O(log n)',
    note: 'In place, but the *stack* is O(log n) on average and O(n) in the worst case — the last-element pivot makes that a real risk, not a formality. Not stable in the general case; the `<=` here happens to make this variant stable, but changing the comparison or the partition scheme breaks it.',
  },
  traits: {
    stable: false,
    inPlace: true,
    online: false,
    allowsDuplicates: true,
    tags: ['divide and conquer', 'lomuto', 'in place', 'quadratic worst case'],
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
      default: 9,
      regeneratesInput: true,
      help: 'Beyond 150 the viewport switches to canvas.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: quickSort,
  lesson,
  expectations,
  formatResult: (r) => `[${(r as number[]).join(', ')}]`,
  anchors: [
    'start',
    'base-case',
    'pivot',
    'partition',
    'compare',
    'swap',
    'pivot-place',
    'recurse-smaller',
    'recurse-larger',
    'done',
  ],
};

export default quickSortAlgo;
