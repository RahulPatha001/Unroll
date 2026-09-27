import { byLanguage } from '../../code/anchors.ts';
import { fewDistinctArray, randomArray, reversedArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Linear Search — the algorithm you already use without noticing.
 *
 * Its whole value is that it makes *no* assumption: no sortedness, no hashing,
 * no index, no precondition of any kind. That is why it is the first thing you
 * reach for on a five-element list, and why it is still the right answer for a
 * million-element unsorted array you only have to look at once. The trace is
 * deliberately dull — one comparison per cell — because that dullness *is* the
 * lesson: the cost is linear and there is no clever way around it without a
 * precondition.
 *
 * Note the return convention: `-1` for "not found", in all four languages, so
 * the verification harness can diff them against a single JSON number.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 211;

const EARLY = randomArray(SEED, 11, 5, 95);
const LATE = reversedArray(SEED + 4, 11, 5, 95);
const TIED = fewDistinctArray(SEED + 8, 12, 3, 1);
const ABSENT = fewDistinctArray(SEED + 12, 12, 4, 1);

const PRESETS: Preset[] = [
  {
    id: 'hit-early',
    label: 'Found early',
    blurb:
      'The target sits three cells in, so the scan stops almost immediately. Best case: one comparison per cell examined, no more.',
    input: { type: 'numbers', values: EARLY },
    params: { size: EARLY.length, target: EARLY[2] as number },
  },
  {
    id: 'hit-late',
    label: 'Found at the end',
    blurb:
      'The target is the very last cell, so every one of the n comparisons happens. This is the shape that makes people reach for binary search.',
    input: { type: 'numbers', values: LATE },
    params: { size: LATE.length, target: LATE[LATE.length - 1] as number },
  },
  {
    id: 'first-of-many',
    label: 'First of many',
    blurb:
      'The target appears five times. Linear search returns the *first* match and stops — it never gets to reveal that the others are there.',
    input: { type: 'numbers', values: TIED },
    params: { size: TIED.length, target: 2 },
  },
  {
    id: 'not-found',
    label: 'Not found',
    blurb:
      'The target 99 is above every value, so the scan exhausts the array and returns -1. The failure case has to be a real, visible path, not an afterthought.',
    input: { type: 'numbers', values: ABSENT },
    params: { size: ABSENT.length, target: 99 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

export function* linearSearch(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const size = Number(ctx.params.size ?? input.values.length);
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const values = [...source].slice(0, Math.max(0, size));
  const n = values.length;
  const target = Number(ctx.params.target ?? 0);

  let ops = 0;

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    note:
      n < 1
        ? 'The array is empty, so there is nothing to compare against. Not found.'
        : `Looking for ${target} in ${n} value${n === 1 ? '' : 's'}. The array is in whatever order it arrived — linear search asks nothing of it, which is both its convenience and its limit.`,
    values: [...values],
    highlight: { unvisited: range(0, n) },
    vars: { target, n },
  };

  for (let i = 0; i < n; i++) {
    if (ctx.shouldStop()) return;
    ops++;
    const value = values[i] as number;
    const hit = value === target;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'scan',
      caption: `Cell ${i + 1} of ${n}`,
      note: `Compare index ${i}: ${value} against the target ${target}. ${hit ? 'They are equal.' : 'Not equal — the scan moves one cell right and everything before this index is now ruled out.'}`,
      values: [...values],
      pointers: { i },
      highlight: {
        compare: [i],
        outOfPlace: range(0, i),
        unvisited: range(i + 1, n),
      },
      ops,
      vars: { i, value, target },
    };

    if (hit) {
      yield {
        kind: 'array',
        index: 0,
        anchor: 'found',
        caption: `Cell ${i + 1} of ${n}`,
        note: `${value} equals the target at index ${i}, so the scan stops and returns ${i}. The ${i} cell${i === 1 ? '' : 's'} already visited were never the answer — that is the whole cost model, one comparison per cell.`,
        values: [...values],
        pointers: { i },
        highlight: { answer: [i], outOfPlace: range(0, i), unvisited: range(i + 1, n) },
        result: 'found',
        ops,
        vars: { i, target, ops },
      };
      return;
    }
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'exhausted',
    caption: `Cell ${n} of ${n}`,
    note: `Every one of the ${n} cells has been compared and none matched, so the search returns -1. There is no shortcut to a "no" here: without an ordering or an index, proving a value is absent means looking at all of it.`,
    values: [...values],
    highlight: { outOfPlace: range(0, n) },
    result: 'not-found',
    ops,
    vars: { target, ops, n },
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

const JS = `function linearSearch(a, target) {
  // No precondition: the array need not be sorted.     // @anchor start
  for (let i = 0; i < a.length; i++) {                  // @anchor scan
    if (a[i] === target) {
      return i;                                        // @anchor found
    }
  }
  return -1;                                            // @anchor exhausted
}`;

const PY = `def linear_search(a, target):
    # No precondition: the list need not be sorted.      # @anchor start
    for i in range(len(a)):                             # @anchor scan
        if a[i] == target:
            return i                                    # @anchor found
    return -1                                          # @anchor exhausted`;

const JAVA = `class LinearSearch {
    static int linearSearch(int[] a, int target) {
        // No precondition: the array need not be sorted. // @anchor start
        for (int i = 0; i < a.length; i++) {            // @anchor scan
            if (a[i] == target) {
                return i;                               // @anchor found
            }
        }
        return -1;                                      // @anchor exhausted
    }
}`;

const CPP = `#include <vector>
using std::vector;

int linear_search(vector<int> a, int target) {
    // No precondition: the vector need not be sorted.   // @anchor start
    for (int i = 0; i < (int)a.size(); i++) {           // @anchor scan
        if (a[i] == target) {
            return i;                                   // @anchor found
        }
    }
    return -1;                                          // @anchor exhausted
}`;

const NOTES = {
  start: {
    javascript:
      'Nothing is assumed about the array. That is the whole point: no sortedness, no index, no hash — which is why this is the correct answer for a five-element list and the wrong answer for a million. Note the cost that freedom buys: every answer, found or not, may take n comparisons.',
    python:
      'Nothing is assumed about the list — not even that it is sorted, which the very next function in this family will demand. That freedom is exactly why this is right for a short list and wrong for a long one, and why the answer is often "just use `in`" in Python: `a.index(target)` is this loop, written once, in C.',
    java: 'Nothing is assumed about the array — not even that it is sorted, which the next function in this family requires. Java has no built-in linear search for arrays, which is itself a hint: the language expects you to have a key, not to scan.',
    cpp: 'Nothing is assumed about the vector. The parameter is taken by value, so the search gets its own copy and is structurally incapable of modifying what it searches — a guarantee the compiler enforces, and one Java and Python have no way to express. Production C++ would take it by const reference and keep the same guarantee for free; the copy here costs one allocation, which is honest to call out rather than pretend around.',
  },
  scan: {
    javascript:
      'One comparison per cell, left to right, with no early exit and no cleverness. This is the entire algorithm, and its cost is exactly the number of cells examined — nothing amortises, nothing is remembered, nothing carries over to the next search. A second search over the same array starts again from index 0.',
    python:
      'One comparison per cell, left to right, with no early exit and no cleverness. The cost is exactly the number of cells examined, and a second search over the same list starts again from index 0 — there is no state left behind between searches.',
    java: 'One comparison per cell, left to right, with no early exit and no cleverness. The cost is exactly the number of cells examined, and a second search over the same array starts again from index 0 — there is no state left behind between searches.',
    cpp: 'One comparison per cell, left to right, with no early exit and no cleverness. The cost is exactly the number of cells examined, and a second search over the same vector starts again from index 0. Because the parameter is a by-value copy, the compiler knows nothing in the loop can write to it, so it can keep the data in registers across a whole block of comparisons — the same freedom the other three languages get for free.',
  },
  found: {
    javascript:
      'The first match, returned immediately. Because the scan ran in index order, this is the *leftmost* occurrence — which matters whenever the array holds duplicates, and is the one behavioural difference from a hash-based lookup. `return` rather than `break`, because there is nothing useful left to do after a hit.',
    python:
      'The first match, returned immediately. Because the scan ran in index order this is the *leftmost* occurrence, which matters whenever the list holds duplicates — and is the one behavioural difference from a dict lookup. `return` rather than `break`: there is nothing useful left to do after a hit.',
    java: 'The first match, returned immediately. Because the scan ran in index order this is the *leftmost* occurrence, which matters whenever the array holds duplicates. `return` rather than `break`, because there is nothing useful left to do after a hit — a `break` would fall through to the same `-1` below and report "not found" for a value that is right there.',
    cpp: 'The first match, returned immediately. Because the scan ran in index order this is the *leftmost* occurrence, which matters whenever the vector holds duplicates. `return` rather than `break`: a `break` would fall through to the same `-1` below and report "not found" for a value that is sitting at index `i`.',
  },
  exhausted: {
    javascript:
      'Falling off the end of the loop is the failure case, and it is the one that costs the most: proving a value is *absent* from an unordered array takes n comparisons, whereas finding it took however many happened to precede it. That asymmetry is the reason for every index, hash table and sorted array in the rest of this family.',
    python:
      'Falling off the end of the loop is the failure case, and it is the one that always costs the full n — proving a value is absent from an unordered list takes every comparison, whereas finding it took however many preceded it. That asymmetry is the reason for every index and hash table in the rest of this family.',
    java: 'Falling off the end of the loop is the failure case, and it always costs the full n. Java has no way to signal "not found" other than a sentinel value, and `-1` is the convention here because no valid index is negative — which is why the loop below could not start at index -1 without breaking the contract.',
    cpp: 'Falling off the end of the loop is the failure case, and it always costs the full n. The function returns a plain `int` rather than an `optional<int>` or a `std::pair`, so "not found" has to be a value the caller can distinguish — `-1` works because it cannot collide with a real index, at the price of one magic number the caller must remember.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'linearSearch',
    python: 'linear_search',
    java: 'LinearSearch.linearSearch',
    cpp: 'linear_search',
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
const targetOf = (p: Preset): number => Number(p.params?.target ?? 0);

const expectations: Expectation[] = PRESETS.map((p) => {
  const values = valuesOf(p);
  const target = targetOf(p);
  return {
    presetId: p.id,
    args: [values, target],
    result: values.indexOf(target),
  };
});

export const linearSearchAlgo: AlgoDef<ArrayFrame> = {
  id: 'linear-search',
  title: 'Linear Search',
  category: 'searching',
  summary:
    'Walk the array from one end to the other, comparing each value with the target until they match or the array runs out.',
  intuition:
    'Reach for it on small arrays, on arrays that are not sorted and will never be, and when you only need one lookup — sorting a five-element list to search it once would cost far more than the scan. Reach for it too when the data is in a place you cannot index: a linked list you have to walk anyway, a file you cannot afford to index, or a one-off pass where building a structure would dominate. If you *will* search repeatedly, this is the wrong choice — the second search costs exactly as much as the first.',
  complexity: {
    best: 'O(1)',
    average: 'O(n/2)',
    worst: 'O(n)',
    space: 'O(1)',
    note: 'O(1) needs no precondition at all, which is why the average is a flat n/2 rather than a distribution: half the array on a coin flip. A miss is always O(n) — you cannot prove absence without looking.',
  },
  traits: {
    stable: false,
    inPlace: true,
    online: false,
    allowsDuplicates: true,
    tags: ['unsorted', 'no precondition', 'single lookup'],
  },
  viewport: 'array',
  level: 'intro',
  params: [
    {
      key: 'size',
      label: 'Elements',
      kind: 'number',
      min: 1,
      max: 150,
      step: 1,
      default: 11,
      regeneratesInput: true,
      help: 'Past 150 elements the cells get too small to read, and a long run can hit the frame cap and stop early.',
    },
    {
      key: 'target',
      label: 'Target',
      kind: 'number',
      min: 0,
      max: 200,
      step: 1,
      default: 42,
      help: 'The value to look for. Change it and the scan restarts from index 0.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: linearSearch,
  lesson,
  expectations,
  formatResult: (r) => ((r as number) < 0 ? 'not found (-1)' : `index ${r as number}`),
  anchors: ['start', 'scan', 'found', 'exhausted'],
};

export default linearSearchAlgo;
