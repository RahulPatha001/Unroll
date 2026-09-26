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
 * Bubble Sort — the reference module for the whole codebase.
 *
 * If you are here to learn how an algorithm module is written, read this one
 * top to bottom. Every other algorithm follows the same five-part shape:
 *
 *   1. `presets`      — the inputs a student can click, each chosen to expose
 *                       a different behaviour (worst case, best case, ties).
 *   2. `run`          — a pure generator. One `yield` per meaningful state
 *                       change. Never mutates `ctx`, never random.
 *   3. `inputSpec`    — declares the input shape so the editor stays generic.
 *   4. `lesson`       — four clean, idiomatic implementations with `@anchor`
 *                       markers, plus a plain-English note per anchor per
 *                       language. The generator above and the code the student
 *                       reads are deliberately *different artefacts*; the
 *                       verification harness is what keeps them honest.
 *   5. `expectations` — one machine-checkable claim per preset. The harness
 *                       runs all four implementations and diffs the results.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 7;

const PRESETS: Preset[] = [
  {
    id: 'random',
    label: 'Random',
    blurb: 'The everyday case. Adjacent pairs swap often, so the flags stay busy.',
    input: { type: 'numbers', values: randomArray(SEED, 8, 12, 96) },
  },
  {
    id: 'nearly-sorted',
    label: 'Nearly sorted',
    blurb:
      'Only a few pairs are out of order, so one pass finds no swap and the early exit fires. This is bubble sort at its best: O(n).',
    input: { type: 'numbers', values: nearlySortedArray(SEED + 4, 8, 12, 96) },
  },
  {
    id: 'reverse',
    label: 'Reversed',
    blurb:
      'The worst case. Every single comparison swaps, and the largest value has to walk all the way to the end one step at a time: O(n²).',
    input: { type: 'numbers', values: reversedArray(SEED + 6, 8, 12, 96) },
  },
  {
    id: 'duplicates',
    label: 'Lots of ties',
    blurb:
      'Only three distinct values. Watch `>` never swap equal neighbours, which is exactly what makes bubble sort stable.',
    input: { type: 'numbers', values: fewDistinctArray(SEED + 10, 9, 3, 1) },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

export function* bubbleSort(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const size = Number(ctx.params.size ?? input.values.length);
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const values = [...source].slice(0, Math.max(0, size));
  const n = values.length;

  let ops = 0;
  const unsorted = range(0, n);

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    note:
      n < 2
        ? 'Fewer than two elements, so there is nothing to compare. Done.'
        : `Nothing is sorted yet, so the unsorted region is the whole array. Pass 1 will compare ${n - 1} adjacent pairs.`,
    values: [...values],
    highlight: { unvisited: unsorted },
    vars: { n },
  };

  let lastSwapped = -1;

  for (let i = 0; i < n - 1; i++) {
    let swapped = false;
    const unsortedEnd = n - i;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'outer-loop',
      caption: `Pass ${i + 1} of ${n - 1}`,
      note: `Pass ${i + 1} begins. Compare the first ${unsortedEnd - 1} adjacent pair${unsortedEnd - 1 === 1 ? '' : 's'}; the last ${i} value${i === 1 ? ' is' : 's are'} already home.`,
      values: [...values],
      highlight: { unvisited: range(0, unsortedEnd), sorted: range(unsortedEnd, n) },
      ops,
      vars: { i, j: 0, limit: unsortedEnd - 1 },
    };

    for (let j = 0; j < unsortedEnd - 1; j++) {
      if (ctx.shouldStop()) return;
      ops++;
      const left = values[j] as number;
      const right = values[j + 1] as number;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'compare',
        caption: `Pass ${i + 1} of ${n - 1}`,
        note: `Compare ${left} and ${right}. ${left > right ? `${left} is bigger, so it belongs further right.` : 'In order already — leave them.'}`,
        values: [...values],
        pointers: { j },
        highlight: {
          compare: [j, j + 1],
          unvisited: range(0, unsortedEnd),
          sorted: range(unsortedEnd, n),
        },
        ops,
        vars: { i, j, left, right },
      };

      if (left > right) {
        values[j] = right;
        values[j + 1] = left;
        swapped = true;
        lastSwapped = j;

        yield {
          kind: 'array',
          index: 0,
          anchor: 'swap',
          caption: `Pass ${i + 1} of ${n - 1}`,
          note: `Swap them. ${left} moves one step right — the biggest value in the region drifts towards the end one place per comparison.`,
          values: [...values],
          pointers: { j },
          highlight: {
            swapping: [j, j + 1],
            unvisited: range(0, unsortedEnd),
            sorted: range(unsortedEnd, n),
          },
          ops,
          vars: { i, j, left, right },
        };
      } else {
        yield {
          kind: 'array',
          index: 0,
          anchor: 'no-swap',
          caption: `Pass ${i + 1} of ${n - 1}`,
          note: `${left} <= ${right}, so leave them alone. Nothing has moved in this pass yet — if that stays true until the pass ends, the early exit fires.`,
          values: [...values],
          pointers: { j },
          highlight: {
            current: [j],
            unvisited: range(0, unsortedEnd),
            sorted: range(unsortedEnd, n),
          },
          ops,
          vars: { i, j, left, right },
        };
      }
    }

    const settledAt = unsortedEnd - 1;
    yield {
      kind: 'array',
      index: 0,
      anchor: 'settle',
      caption: `Pass ${i + 1} of ${n - 1}`,
      note: `Pass ${i + 1} done. ${values[settledAt]} drifted to index ${settledAt}, the far end of the unsorted region, so it is now in its final position. No later pass will touch it.`,
      values: [...values],
      highlight: { sorted: range(settledAt, n), unvisited: range(0, settledAt) },
      sorted: [settledAt, n],
      ops,
      vars: { i, settledAt },
    };

    if (!swapped) {
      yield {
        kind: 'array',
        index: 0,
        anchor: 'early-exit',
        caption: `Pass ${i + 1} of ${n - 1}`,
        note: `A whole pass with no swaps. If no adjacent pair is out of order then nothing is out of order, so the array is sorted — stop instead of grinding through the remaining passes.`,
        values: [...values],
        highlight: { sorted: range(0, n) },
        sorted: [0, n],
        result: 'sorted',
        ops,
        vars: { i, swapped },
      };
      break;
    }
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'done',
    note:
      lastSwapped === -1
        ? 'The array was already sorted, so nothing moved at all.'
        : `Every value is in place. ${ops} comparison${ops === 1 ? '' : 's'} in total.`,
    values: [...values],
    highlight: { sorted: range(0, n) },
    sorted: [0, n],
    result: 'sorted',
    ops,
    vars: { ops },
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

const JS = `function bubbleSort(a) {
  const n = a.length;
  // Nothing is sorted yet: the unsorted region is the whole array.  // @anchor start
  for (let i = 0; i < n - 1; i++) {                        // @anchor outer-loop
    let swapped = false;
    for (let j = 0; j < n - 1 - i; j++) {                  // @anchor compare
      if (a[j] > a[j + 1]) {
        const t = a[j];                                    // @anchor swap
        a[j] = a[j + 1];
        a[j + 1] = t;
        swapped = true;
      } else {                                             // @anchor no-swap
        // a[j] <= a[j+1]: already ordered, nothing to do
      }
    }
    // a[n - 1 - i] has bubbled to its final position.    // @anchor settle
    if (!swapped) {                                        // @anchor early-exit
      break;
    }
  }
  return a;                                                // @anchor done
}`;

const PY = `def bubble_sort(a):
    n = len(a)
    # Nothing is sorted yet: the unsorted region is the whole list. # @anchor start
    for i in range(n - 1):                                 # @anchor outer-loop
        swapped = False
        for j in range(n - 1 - i):                         # @anchor compare
            if a[j] > a[j + 1]:
                a[j], a[j + 1] = a[j + 1], a[j]            # @anchor swap
                swapped = True
            else:                                          # @anchor no-swap
                pass  # already ordered, nothing to do
        # a[n - 1 - i] has bubbled to its final position.  # @anchor settle
        if not swapped:                                    # @anchor early-exit
            break
    return a                                               # @anchor done`;

const JAVA = `class BubbleSort {
    static int[] bubbleSort(int[] a) {
        int n = a.length;
        // Nothing is sorted yet: the unsorted region is the whole array. // @anchor start
        for (int i = 0; i < n - 1; i++) {                        // @anchor outer-loop
            boolean swapped = false;
            for (int j = 0; j < n - 1 - i; j++) {               // @anchor compare
                if (a[j] > a[j + 1]) {
                    int t = a[j];                                // @anchor swap
                    a[j] = a[j + 1];
                    a[j + 1] = t;
                    swapped = true;
                } else {                                         // @anchor no-swap
                    // already ordered, nothing to do
                }
            }
            // a[n - 1 - i] has bubbled to its final position.  // @anchor settle
            if (!swapped) {                                      // @anchor early-exit
                break;
            }
        }
        return a;                                                 // @anchor done
    }
}`;

const CPP = `#include <vector>
using std::vector;

vector<int> bubble_sort(vector<int> a) {
    int n = (int)a.size();
    // Nothing is sorted yet: the unsorted region is the whole vector. // @anchor start
    for (int i = 0; i < n - 1; i++) {                    // @anchor outer-loop
        bool swapped = false;
        for (int j = 0; j < n - 1 - i; j++) {            // @anchor compare
            if (a[j] > a[j + 1]) {
                int t = a[j];                            // @anchor swap
                a[j] = a[j + 1];
                a[j + 1] = t;
                swapped = true;
            } else {                                     // @anchor no-swap
                // already ordered, nothing to do
            }
        }
        // a[n - 1 - i] has bubbled to its final position.// @anchor settle
        if (!swapped) {                                  // @anchor early-exit
            break;
        }
    }
    return a;                                            // @anchor done
}`;

const NOTES = {
  'outer-loop': {
    javascript:
      'One pass. Each pass guarantees the largest remaining value bubbles all the way to the end, so after pass i the last i values are settled and `j` never needs to look at them again — that is why the limit is `n - 1 - i`.',
    python:
      'One pass. Each pass guarantees the largest remaining value bubbles all the way to the end, so after pass i the last i values are settled and `j` never needs to look at them again — that is why the limit is `n - 1 - i`.',
    java: 'One pass. Each pass guarantees the largest remaining value bubbles all the way to the end, so after pass i the last i values are settled and `j` never needs to look at them again — that is why the limit is `n - 1 - i`.',
    cpp: 'One pass. Each pass guarantees the largest remaining value bubbles all the way to the end, so after pass i the last i values are settled and `j` never needs to look at them again — that is why the limit is `n - 1 - i`.',
  },
  compare: {
    javascript:
      'The inner loop walks `j` across every adjacent pair still inside the unsorted region. Both values are read from the array; nothing has been written yet.',
    python:
      'The inner loop walks `j` across every adjacent pair still inside the unsorted region. Both values are read from the list; nothing has been written yet.',
    java: 'The inner loop walks `j` across every adjacent pair still inside the unsorted region. Java arrays are fixed size, but their *elements* are mutable — so `a` is edited in place, just like a Python list.',
    cpp: 'The inner loop walks `j` across every adjacent pair still inside the unsorted region. `a` was taken by value, so this is a copy — the caller’s vector is never modified, which is why the function returns it.',
  },
  swap: {
    javascript:
      'Save `a[j]` in `t`, shift the right value left, then write `t` into `a[j+1]`. `t` exists only because you cannot swap two array slots in one JavaScript statement without a temporary (destructuring `[a[j], a[j+1]] = [a[j+1], a[j]]` is the same three steps in one line).',
    python:
      'Python can swap in one statement, so no temporary is needed: `a[j], a[j+1] = a[j+1], a[j]` reads both right-hand sides before writing either left-hand side.',
    java: 'Save `a[j]` in `t`, shift the right value left, then write `t` into `a[j+1]`. Same three steps as every other language — Java has no tuple assignment, so the temporary is unavoidable.',
    cpp: 'Save `a[j]` in `t`, shift the right value left, then write `t` into `a[j+1]`. `std::swap` would do this for you in one call; writing it out is what makes the "hole" visible.',
  },
  'no-swap': {
    javascript:
      'The pair is already ordered. The `else` branch deliberately does nothing: not swapping equal-or-smaller neighbours is precisely what makes bubble sort *stable* — equal values never cross, so their original relative order survives.',
    python:
      'The pair is already ordered, and `pass` marks "nothing to do". Not swapping equal neighbours is what makes bubble sort *stable*: equal values never cross each other.',
    java: 'The pair is already ordered, so the body is empty. Leaving equal values untouched is what makes bubble sort *stable*.',
    cpp: 'The pair is already ordered, so the body is empty. Leaving equal values untouched is what makes bubble sort *stable*.',
  },
  'early-exit': {
    javascript:
      'The optimisation that rescues bubble sort. If a whole pass swapped nothing, then every adjacent pair is in order — which for an array means the whole array is sorted. Break out instead of grinding through the remaining passes. This is why the *best* case is O(n) even though the worst case is O(n²).',
    python:
      'The optimisation that rescues bubble sort. If a whole pass swapped nothing, then every adjacent pair is in order — which for a list means the whole list is sorted. `break` instead of grinding through the remaining passes. This is why the *best* case is O(n) even though the worst case is O(n²).',
    java: 'The optimisation that rescues bubble sort. A pass with no swaps means every adjacent pair is in order, so the array is sorted. `break` leaves the loop early, which is what makes the best case O(n).',
    cpp: 'The optimisation that rescues bubble sort. A pass with no swaps means every adjacent pair is in order, so the array is sorted. `break` leaves the loop early, which is what makes the best case O(n).',
  },
  settle: {
    javascript:
      'The end of a pass. Whatever is sitting at index `n - 1 - i` is the largest value in the region, and it arrived there by drifting right one place per comparison. It is now final: every later pass stops short of this index, so it will never move again. One settled position per pass is exactly why the outer loop needs `n - 1` passes.',
    python:
      'The end of a pass. Whatever is sitting at index `n - 1 - i` is the largest value in the region, and it arrived there by drifting right one place per comparison. It is now final: every later pass stops short of this index, so it will never move again. One settled position per pass is exactly why the outer loop needs `n - 1` passes.',
    java: 'The end of a pass. Whatever is sitting at index `n - 1 - i` is the largest value in the region, and it arrived there by drifting right one place per comparison. It is now final: every later pass stops short of this index, so it will never move again. One settled position per pass is exactly why the outer loop needs `n - 1` passes.',
    cpp: 'The end of a pass. Whatever is sitting at index `n - 1 - i` is the largest value in the region, and it arrived there by drifting right one place per comparison. It is now final: every later pass stops short of this index, so it will never move again. One settled position per pass is exactly why the outer loop needs `n - 1` passes.',
  },
  done: {
    javascript:
      'Every value is in place. Note there is no `return` inside the loop: the early exit uses `break`, so control always falls through to here.',
    python:
      'Every value is in place. There is no `return` inside the loop — the early exit uses `break`, so control always falls through to the final `return`.',
    java: 'Every value is in place. The early exit uses `break`, never `return`, so control always falls through to the single `return` at the end.',
    cpp: 'Every value is in place. The early exit uses `break`, never `return`, so control always falls through to the single `return` at the end.',
  },
  start: {
    javascript: 'The unsorted region starts as the entire array. Every element is "unvisited".',
    python: 'The unsorted region starts as the entire list. Every element is "unvisited".',
    java: 'The unsorted region starts as the entire array. Every element is "unvisited".',
    cpp: 'The unsorted region starts as the entire vector. Every element is "unvisited".',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'bubbleSort',
    python: 'bubble_sort',
    java: 'BubbleSort.bubbleSort',
    cpp: 'bubble_sort',
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

export const bubbleSortAlgo: AlgoDef<ArrayFrame> = {
  id: 'bubble-sort',
  title: 'Bubble Sort',
  category: 'sorting',
  summary:
    'Repeatedly swap adjacent pairs that are out of order, until a whole pass finds nothing to fix.',
  intuition:
    'You would only reach for this to *watch* how repeated local fixes turn into a global ordering — it is the clearest possible example of an O(n²) algorithm with an O(n) best case. Never write it for real: its constant factor is so large that 10,000 elements takes ~50 million comparisons, where merge sort takes ~130,000.',
  complexity: {
    best: 'O(n)',
    average: 'O(n²)',
    worst: 'O(n²)',
    space: 'O(1)',
    note: 'In place, and stable — because it only swaps on a strict `>`.',
  },
  traits: {
    stable: true,
    inPlace: true,
    online: true,
    allowsDuplicates: true,
    tags: ['quadratic'],
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
      default: 8,
      regeneratesInput: true,
      help: 'Beyond 150 the viewport switches to canvas.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: bubbleSort,
  lesson,
  expectations,
  formatResult: (r) => `[${(r as number[]).join(', ')}]`,
  anchors: ['start', 'outer-loop', 'compare', 'swap', 'no-swap', 'early-exit', 'settle', 'done'],
};

export default bubbleSortAlgo;
