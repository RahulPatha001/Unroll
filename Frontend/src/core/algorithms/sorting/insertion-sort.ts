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
 * Insertion Sort — the way a human sorts a hand of cards.
 *
 * The invariant that makes it beautiful: before the loop body, `values[0..i)` is
 * already sorted. The body inserts `values[i]` into that sorted prefix by
 * walking left and sliding bigger values one place right. So the sorted region
 * grows at the *front*, which is why insertion sort is the only comparison sort
 * here that is genuinely online — it never needs to see the rest of the input.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 53;

/**
 * One array per preset, hoisted so a preset's `size` and its `values` can
 * never disagree — the generator honours `params.size`, so a preset that
 * stored more values than it asked for would be silently truncated and the
 * animation would stop matching the code the verification harness runs.
 */
const RANDOM = randomArray(SEED, 9, 10, 98);
const NEARLY_SORTED = nearlySortedArray(SEED + 4, 9, 1, 99);
const REVERSE = reversedArray(SEED + 6, 9, 1, 99);
const DUPLICATES = fewDistinctArray(SEED + 10, 10, 3, 1);

const PRESETS: Preset[] = [
  {
    id: 'random',
    label: 'Random',
    blurb:
      'The everyday case. Each new value walks left past roughly half the sorted prefix on average.',
    input: { type: 'numbers', values: RANDOM },
    params: { size: RANDOM.length },
  },
  {
    id: 'nearly-sorted',
    label: 'Nearly sorted',
    blurb:
      'The best case, and the reason this algorithm exists. Every value is already bigger than its left neighbour, so each pass compares once and writes once: O(n).',
    input: { type: 'numbers', values: NEARLY_SORTED },
    params: { size: NEARLY_SORTED.length },
  },
  {
    id: 'reverse',
    label: 'Reversed',
    blurb:
      'The worst case. Every new value is smaller than everything in the prefix, so it walks the whole prefix rightwards and the shift count is the maximum.',
    input: { type: 'numbers', values: REVERSE },
    params: { size: REVERSE.length },
  },
  {
    id: 'duplicates',
    label: 'Lots of ties',
    blurb:
      'Only three distinct values. The strict `>` refuses to slide past an equal value, so ties never cross and the sort stays stable.',
    input: { type: 'numbers', values: DUPLICATES },
    params: { size: DUPLICATES.length },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

export function* insertionSort(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const size = Number(ctx.params.size ?? input.values.length);
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const values = [...source].slice(0, Math.max(0, size));
  const n = values.length;

  let ops = 0;
  let shifts = 0;

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    note:
      n < 2
        ? 'Fewer than two elements, so there is no second value to insert. Done.'
        : `A single element is sorted by definition, so the sorted prefix starts as index 0. Indices 1 to ${n - 1} get inserted one at a time.`,
    values: [...values],
    // The sorted prefix is index 0 when there *is* an index 0. An empty array
    // has no sorted prefix at all, and claiming one would put both a highlight
    // and a half-open range outside the array.
    highlight: { sorted: range(0, Math.min(1, n)), unvisited: range(1, n) },
    ...(n > 0 ? { sorted: [0, 1] as [number, number] } : {}),
    vars: { n },
  };

  for (let i = 1; i < n; i++) {
    const key = values[i] as number;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'pick',
      caption: `Inserting index ${i} of ${n - 1}`,
      note: `Lift ${key} out of index ${i} and hold it. The prefix 0 to ${i - 1} is already sorted, so the job is to slide everything bigger than ${key} one place right and drop ${key} into the gap.`,
      values: [...values],
      pointers: { i },
      highlight: { temp: [i], sorted: range(0, i), unvisited: range(i, n) },
      sorted: [0, i],
      ops,
      vars: { i, key },
    };

    let j = i - 1;
    while (j >= 0) {
      if (ctx.shouldStop()) return;
      ops++;
      const left = values[j] as number;
      const slide = left > key;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'compare',
        caption: `Inserting index ${i} of ${n - 1}`,
        note: slide
          ? `${left} is bigger than the held ${key}, so it is in the wrong place and must move one step right.`
          : `${left} is not bigger than the held ${key}, so the sorted prefix already ends in the right place and the insertion stops here.`,
        values: [...values],
        pointers: { i, ...(j >= 0 ? { j } : {}) },
        highlight: {
          compare: [j],
          temp: [i],
          sorted: range(0, i),
          unvisited: range(i, n),
        },
        sorted: [0, i],
        ops,
        vars: { i, j, key, left },
      };

      if (!slide) break;

      const from = j + 1;
      values[from] = left;
      shifts++;
      j--;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'shift',
        caption: `Inserting index ${i} of ${n - 1}`,
        note: `Slide ${left} one place right, from index ${from} to ${from + 1}, opening a gap. The held ${key} is still not written anywhere — it waits in the local variable until the walk stops.`,
        values: [...values],
        pointers: { i, ...(j >= 0 ? { j } : {}) },
        highlight: {
          swapping: [from, from + 1].filter((k) => k < n),
          temp: [i],
          sorted: range(0, i),
          unvisited: range(i, n),
        },
        sorted: [0, i],
        ops,
        vars: { i, j, key, left, shifts },
      };
    }

    values[j + 1] = key;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'insert',
      caption: `Inserting index ${i} of ${n - 1}`,
      note: `Drop ${key} into index ${j + 1}, the gap. The sorted prefix is now 0 to ${i}, one element longer, and it is still in order.`,
      values: [...values],
      pointers: { i, ...(j + 1 >= 0 ? { j: j + 1 } : {}) },
      highlight: { found: [j + 1], sorted: range(0, i + 1), unvisited: range(i + 1, n) },
      sorted: [0, i + 1],
      ops,
      vars: { i, j, key, shifts },
    };
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'done',
    note:
      shifts === 0
        ? 'Every value was already bigger than everything to its left, so the array came in sorted and not one shift was needed.'
        : `The last value is home. ${ops} comparison${ops === 1 ? '' : 's'} and ${shifts} shift${shifts === 1 ? '' : 's'} — note how few writes the same input cost compared with selection or bubble sort.`,
    values: [...values],
    highlight: { sorted: range(0, n) },
    sorted: [0, n],
    result: 'sorted',
    ops,
    vars: { ops, shifts },
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

const JS = `function insertionSort(a) {
  // A single element is sorted by definition, so index 0 starts sorted. // @anchor start
  for (let i = 1; i < a.length; i++) {                  // @anchor pick
    const key = a[i];                                    // the value being inserted
    let j = i - 1;
    while (j >= 0 && a[j] > key) {                      // @anchor compare
      a[j + 1] = a[j];                                   // @anchor shift
      j--;
    }
    a[j + 1] = key;                                      // @anchor insert
  }
  return a;                                              // @anchor done
}`;

const PY = `def insertion_sort(a):
    # A single element is sorted by definition, so index 0 starts sorted. # @anchor start
    for i in range(1, len(a)):                           # @anchor pick
        key = a[i]                                       # the value being inserted
        j = i - 1
        while j >= 0 and a[j] > key:                     # @anchor compare
            a[j + 1] = a[j]                              # @anchor shift
            j -= 1
        a[j + 1] = key                                   # @anchor insert
    return a                                             # @anchor done`;

const JAVA = `class InsertionSort {
    static int[] insertionSort(int[] a) {
        // A single element is sorted by definition, so index 0 starts sorted. // @anchor start
        for (int i = 1; i < a.length; i++) {              // @anchor pick
            int key = a[i];                               // the value being inserted
            int j = i - 1;
            while (j >= 0 && a[j] > key) {                // @anchor compare
                a[j + 1] = a[j];                          // @anchor shift
                j--;
            }
            a[j + 1] = key;                               // @anchor insert
        }
        return a;                                         // @anchor done
    }
}`;

const CPP = `#include <vector>
using std::vector;

vector<int> insertion_sort(vector<int> a) {
    // A single element is sorted by definition, so index 0 starts sorted. // @anchor start
    for (int i = 1; i < (int)a.size(); i++) {             // @anchor pick
        int key = a[i];                                   // the value being inserted
        int j = i - 1;
        while (j >= 0 && a[j] > key) {                    // @anchor compare
            a[j + 1] = a[j];                              // @anchor shift
            j--;
        }
        a[j + 1] = key;                                   // @anchor insert
    }
    return a;                                             // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'The sorted region is the *prefix*, and it starts as a single element. This is the invariant the whole algorithm rests on: at the top of the outer loop, everything left of `i` is already in order. Because it is a prefix and not a suffix, the algorithm is online — it could stop half way and still have a sorted run.',
    python:
      'The sorted region is the prefix, and it starts as a single element — the loop begins at `1`, not `0`, because one element needs no work. A prefix (rather than a suffix) is what makes insertion sort online: it can be handed values one at a time and stay correct.',
    java: 'The sorted region is the prefix, and it starts as a single element — the loop begins at `i = 1`, not `0`. A Java array cannot grow, so "online" here means the algorithm never reads past `i`; it would work identically on a stream it appended to itself.',
    cpp: 'The sorted region is the prefix, and it starts as a single element. The loop reads `a.size()` on every iteration rather than caching it in an `n`, which costs nothing here but is the one habit worth breaking for very large vectors. Everything left of `i` is already in order when the body begins.',
  },
  pick: {
    javascript:
      'Lift the value out and hold it in a local. This is the "hole" technique: once `key` is in a variable, index `i` is free to be overwritten repeatedly as the prefix slides right, and the held value is not read from the array again until the very end.',
    python:
      'Lift the value out and hold it in a local. Once `key` lives in a variable, `a[i]` is free to be overwritten repeatedly as the prefix slides right, and the array is not read again until the final write. That is the whole reason the inner loop is a simple forward-writing walk rather than a swap loop.',
    java: 'Lift the value out into a local `int`. Java has no references to worry about here — `key` is a copy of the element, not an alias — so overwriting `a[i]` cannot damage the value being inserted.',
    cpp: 'Lift the value out into a local `int`. The copy is by value, so the element sitting in `a[i]` can be overwritten as many times as the slide requires without touching the value being inserted.',
  },
  compare: {
    javascript:
      'The whole decision, in one condition. `j >= 0` is the guard that stops the walk at the start of the array, and `a[j] > key` is *strict* — an equal value does not move, which is precisely what keeps insertion sort stable. Flip `>` to `>=` and equal values start crossing each other.',
    python:
      "The whole decision, in one condition. `j >= 0` guards the start of the list, and `a[j] > key` is *strict* — an equal neighbour is left alone. That strictness is the whole of insertion sort's stability: equal values never slide past one another, so their original order survives. `>` would also work for descending data, but the walk direction is baked in here.",
    java: 'The whole decision, in one condition. `j >= 0` guards the start of the array, and `a[j] > key` is *strict*, so an equal value is never slid past another. That single character is the difference between a stable sort and one that silently reorders ties.',
    cpp: 'The whole decision, in one condition. `j >= 0` guards the start of the vector, and `a[j] > key` is *strict*, so equal values never slide past each other. Note the indexing hazard `j >= 0 && ...`: C++ evaluates left to right with short-circuit, so `a[j]` is never evaluated for `j == -1`. Writing the two tests the other way round would be an out-of-bounds read.',
  },
  shift: {
    javascript:
      'One write, rightwards, and `j` steps back. Every value in the prefix that is bigger than `key` moves exactly one place, which is what keeps the prefix sorted at every instant — the array is a valid sorted run plus a hole throughout, not just at the end. The held value is still nowhere in the array.',
    python:
      'One write, rightwards, and `j` steps back. Because each big value only moves one place, the prefix is a valid sorted run at every instant, not just at the end. The held value is still nowhere in the list, so `a` is momentarily one element short of its original contents.',
    java: 'One write, rightwards, and `j` steps back. The prefix is a valid sorted run at every instant, so an observer mid-loop sees sorted data with a single gap — never a disordered half-inserted state. The held `key` is still only in the local variable.',
    cpp: 'One write, rightwards, and `j` steps back. The copy to `a[j + 1]` is a read-then-write of the same element, so the prefix stays a valid sorted run at every instant and the only thing missing from the array is the held value.',
  },
  insert: {
    javascript:
      'The single write that closes the gap. `j + 1` is either `i` (nothing moved) or the index just past the last value that slid — and in both cases it is exactly the first position in the sorted prefix where `key` belongs. After this line the invariant for the next iteration holds: the prefix 0 to `i` is sorted.',
    python:
      'The single write that closes the gap. `j + 1` is either `i` (nothing moved) or the index just past the last value that slid, and in both cases it is the first position where `key` belongs. After this line the invariant for the next iteration holds: the prefix 0 to `i` is sorted. This happens once per element, so the whole sort performs exactly `n - 1` of these writes plus however many shifts were needed.',
    java: 'The single write that closes the gap. Java evaluates `j + 1` from the *already decremented* `j`, so the landing index is one past the last value that slid. After this line the prefix 0 to `i` is sorted and the outer loop can advance.',
    cpp: 'The single write that closes the gap, evaluated from the already-decremented `j` so the landing index is one past the last value that slid. After this line the prefix 0 to `i` is sorted, and that is the invariant the next iteration relies on.',
  },
  done: {
    javascript:
      'The loop ends when `i` reaches `a.length`, which means the sorted prefix has swallowed the whole array. An empty or single-element array never enters the loop at all — no guard clause needed, because the bound `i = 1` is already false.',
    python:
      'The loop ends when `i` reaches `len(a)`, so the sorted prefix has swallowed the whole list. An empty or single-element list never enters the loop: `range(1, 0)` and `range(1, 1)` are both empty, which is why this needs no length check.',
    java: 'The loop ends when `i` reaches `a.length`, so the sorted prefix has swallowed the whole array. For `a.length` of 0 or 1 the bound `i = 1 < a.length` is false immediately, so degenerate input needs no special case.',
    cpp: 'The loop ends when `i` reaches `a.size()`, so the sorted prefix has swallowed the whole vector. With fewer than two elements the loop never runs — the `i = 1` start is the entire guard.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'insertionSort',
    python: 'insertion_sort',
    java: 'InsertionSort.insertionSort',
    cpp: 'insertion_sort',
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

export const insertionSortAlgo: AlgoDef<ArrayFrame> = {
  id: 'insertion-sort',
  title: 'Insertion Sort',
  category: 'sorting',
  summary:
    'Grow a sorted prefix one element at a time, sliding every bigger value in that prefix one place to the right.',
  intuition:
    'Reach for it when the input arrives as a stream, or when it is already nearly ordered — a log file that is appended to and periodically sorted, a merge window, or a list you insert into one item at a time. It is O(n) on sorted data, the only comparison sort here that is online, and it beats every other quadratic sort on small or nearly-sorted inputs because its inner loop exits the moment it finds a value in the right place. In production you usually meet it inside Timsort or Shell sort rather than as a standalone call.',
  complexity: {
    best: 'O(n)',
    average: 'O(n²)',
    worst: 'O(n²)',
    space: 'O(1)',
    note: "Stable, because the walk stops on `>` rather than `>=`. In place, and the number of writes is the shift count plus one per element — a better bound than selection sort's average, but far worse than its worst case.",
  },
  traits: {
    stable: true,
    inPlace: true,
    online: true,
    allowsDuplicates: true,
    tags: ['quadratic', 'online', 'adaptive'],
  },
  viewport: 'array',
  level: 'intro',
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
      help: 'Past 150 elements the cells get too small to read, and a long run can hit the frame cap and stop early.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: insertionSort,
  lesson,
  expectations,
  formatResult: (r) => `[${(r as number[]).join(', ')}]`,
  anchors: ['start', 'pick', 'compare', 'shift', 'insert', 'done'],
};

export default insertionSortAlgo;
