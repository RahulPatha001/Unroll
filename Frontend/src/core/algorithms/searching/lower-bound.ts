import { byLanguage } from '../../code/anchors.ts';
import { distinctArray, fewDistinctArray, randomArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Lower Bound — the first index whose value is at least the target.
 *
 * Structurally this *is* binary search with one change: the answer is not a cell
 * you recognise when you hit it, it is a boundary you fall off. So the loop runs
 * until the window is empty rather than until the target is found, and the
 * invariant is "everything before `low` is too small, everything from `high` on
 * is big enough".
 *
 * That is why the bounds are half-open (`high` starts at `n`, not `n - 1`) and
 * why the return value is never `-1`: `n` is a perfectly good answer meaning
 * "past the end". The four `lower_bound` presets cover the three interesting
 * answers — a value, a gap, and past-the-end — plus the tie case, where this
 * returns the *first* of a run and plain binary search does not.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 401;

/** Searching algorithms need sorted input, so every preset sorts before use. */
const sortedOf = (values: number[]): number[] => [...values].sort((a, b) => a - b);

const UNIQUE = sortedOf(distinctArray(SEED, 12, 1, 140));
const TIES = sortedOf(fewDistinctArray(SEED + 4, 14, 3, 1));
const SPARSE = sortedOf(distinctArray(SEED + 8, 11, 1, 200));
const DENSE = sortedOf(randomArray(SEED + 12, 12, 5, 95));
const TOPEND = sortedOf(distinctArray(SEED + 16, 11, 1, 160));

/** A value guaranteed to be absent, and inside the array's own range. */
const missingBetween = (sorted: number[]): number => {
  for (let i = 1; i < sorted.length; i++) {
    const lo = sorted[i - 1] as number;
    const hi = sorted[i] as number;
    if (hi - lo > 1) return lo + 1;
  }
  return (sorted[sorted.length - 1] as number) + 1000;
};

const PRESETS: Preset[] = [
  {
    id: 'exact-hit',
    label: 'Exact hit',
    blurb:
      'The target is present, once. The window still empties rather than stopping on a hit, because a lower bound is a position, not a value.',
    input: { type: 'numbers', values: UNIQUE },
    params: { size: UNIQUE.length, target: UNIQUE[7] as number },
  },
  {
    id: 'between',
    label: 'In a gap',
    blurb:
      'The target falls between two values, so the answer is the index of the *next* value up. This is the case a plain equality search cannot express at all.',
    input: { type: 'numbers', values: SPARSE },
    params: { size: SPARSE.length, target: missingBetween(SPARSE) },
  },
  {
    id: 'ties',
    label: 'First of a run',
    blurb:
      'The target appears four times. Lower bound returns the first of them, every time — which is the guarantee that makes it the building block for count-of-smaller-than and range queries.',
    input: { type: 'numbers', values: TIES },
    params: { size: TIES.length, target: 2 },
  },
  {
    id: 'before-start',
    label: 'Before everything',
    blurb:
      'The target is smaller than every value, so the window collapses immediately to the single answer 0. The smallest possible search.',
    input: { type: 'numbers', values: DENSE },
    params: { size: DENSE.length, target: 1 },
  },
  {
    id: 'past-end',
    label: 'Past the end',
    blurb:
      'The target is bigger than every value, so the answer is n itself. Lower bound never fails: "not found" is a position at the end of the array, not an error.',
    input: { type: 'numbers', values: TOPEND },
    params: { size: TOPEND.length, target: 999 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

export function* lowerBound(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const size = Number(ctx.params.size ?? input.values.length);
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const values = [...source].slice(0, Math.max(0, size));
  const n = values.length;
  const target = Number(ctx.params.target ?? 0);

  let ops = 0;
  /** Half-open window: the answer is somewhere in `[low, high]`. */
  let low = 0;
  let high = n;
  let mid = n === 0 ? 0 : low + Math.floor((high - low) / 2);

  /** `[0, low)` is proven too small, `[high, n)` is proven big enough. */
  const ruled = (): number[] => [...range(0, low), ...range(high, n)];

  const cursors = (): Record<string, number> => {
    const out: Record<string, number> = {};
    if (low >= 0) out.low = low;
    if (high >= 0) out.high = high;
    if (low < high) out.mid = mid;
    return out;
  };

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    note:
      n < 1
        ? 'The array is empty, so the only possible answer is 0 — which is also n. Not a single comparison needed.'
        : `Looking for the first index whose value is at least ${target}. The window is the half-open range [${low}, ${high}) — note \`high\` starts at ${n}, not ${n - 1}, because "past the end" is a legal answer here.`,
    values: [...values],
    pointers: cursors(),
    highlight: { window: range(0, n) },
    vars: { low, mid, high, target, n },
  };

  while (low < high) {
    if (ctx.shouldStop()) return;
    ops++;
    mid = low + Math.floor((high - low) / 2);
    const value = values[mid] as number;
    const keepIt = value < target;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'compare',
      caption: `Probe ${ops}`,
      note: `Probe index ${mid}: ${value} against a target of ${target}. ${keepIt ? `${value} is smaller than the target, so the answer must be to its right.` : `${value} is already big enough, so the answer is at ${mid} or earlier — this one can be the answer.`}`,
      values: [...values],
      pointers: cursors(),
      highlight: { compare: [mid], window: range(low, high), outOfPlace: ruled() },
      ops,
      vars: { low, mid, high, value, target },
    };

    if (keepIt) {
      low = mid + 1;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'move-right',
        caption: `Probe ${ops}`,
        note: `${value} is too small, and the array is sorted, so everything up to index ${mid} is too small too. The answer is after ${mid}: \`low\` moves to ${mid + 1}. The window keeps its right edge and loses its left half.`,
        values: [...values],
        pointers: cursors(),
        highlight: { window: range(low, high), outOfPlace: ruled() },
        ops,
        vars: { low, mid, high, target, ops },
      };
    } else {
      high = mid;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'move-left',
        caption: `Probe ${ops}`,
        note: `${value} is big enough, so the answer is at ${mid} or before it. \`high\` moves to ${mid} — inclusive, because unlike binary search this index is a *candidate answer* and must not be discarded.`,
        values: [...values],
        pointers: cursors(),
        highlight: { window: range(low, high), outOfPlace: ruled() },
        ops,
        vars: { low, mid, high, target, ops },
      };
    }

    mid = low + Math.floor((high - low) / 2);
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'answer',
    caption: `Probe ${ops}`,
    note:
      low >= n
        ? `The window is empty and the answer is ${n} — one past the last index. Every value in the array is smaller than ${target}, so "the first value at least ${target}" simply does not exist, and its position is the end of the array. This is not a failure — lower bound has no failure case, and -1 is never one of its answers.`
        : `${values[low] as number} at index ${low} is the first value at least ${target}, so the answer is ${low} after ${ops} comparison${ops === 1 ? '' : 's'}. ${low > 0 ? `Index ${low - 1} holds ${values[low - 1] as number}, which is smaller — that is what makes ${low} the *first* such index.` : 'It is the very first cell, so the answer is 0.'}`,
    values: [...values],
    pointers: { low, ...(low < n ? {} : { past: n }) },
    highlight: { ...(low < n ? { answer: [low] } : {}), outOfPlace: ruled() },
    result: low >= n ? 'not-found' : 'found',
    ops,
    vars: { low, target, ops },
  };
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Array (sorted)',
      kind: 'numbers' as const,
      default: PRESETS[0]?.input.type === 'numbers' ? PRESETS[0].input.values : [],
    },
  ],
  build: (values: Record<string, unknown>): AlgoInput => ({
    type: 'numbers',
    values: Array.isArray(values.values)
      ? [...(values.values as number[])].sort((a, b) => a - b)
      : [],
  }),
  sizeOf: (input: AlgoInput): number => (input.type === 'numbers' ? input.values.length : 0),
};

/* ------------------------------------------------------------------ *
 * 4. The lesson — four languages, one set of anchors
 * ------------------------------------------------------------------ */

const JS = `function lowerBound(a, target) {
  // Half-open window: the answer is somewhere in [low, high]. // @anchor start
  let low = 0, high = a.length;                         // high === n is a legal answer
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);      // @anchor compare
    if (a[mid] < target) {
      low = mid + 1;                                     // @anchor move-right
    } else {
      high = mid;                                        // @anchor move-left
    }
  }
  return low;                                            // @anchor answer
}`;

const PY = `def lower_bound(a, target):
    # Half-open window: the answer is somewhere in [low, high]. # @anchor start
    low, high = 0, len(a)                                # high == len(a) is a legal answer
    while low < high:
        mid = low + (high - low) // 2                    # @anchor compare
        if a[mid] < target:
            low = mid + 1                                # @anchor move-right
        else:
            high = mid                                   # @anchor move-left
    return low                                           # @anchor answer`;

const JAVA = `class LowerBound {
    static int lowerBound(int[] a, int target) {
        // Half-open window: the answer is somewhere in [low, high]. // @anchor start
        int low = 0, high = a.length;                    // high == a.length is a legal answer
        while (low < high) {
            int mid = low + (high - low) / 2;             // @anchor compare
            if (a[mid] < target) {
                low = mid + 1;                           // @anchor move-right
            } else {
                high = mid;                              // @anchor move-left
            }
        }
        return low;                                      // @anchor answer
    }
}`;

const CPP = `#include <vector>
using std::vector;

int lower_bound(vector<int> a, int target) {
    // Half-open window: the answer is somewhere in [low, high]. // @anchor start
    int low = 0, high = (int)a.size();                   // high == size() is a legal answer
    while (low < high) {
        int mid = low + (high - low) / 2;                 // @anchor compare
        if (a[mid] < target) {
            low = mid + 1;                               // @anchor move-right
        } else {
            high = mid;                                  // @anchor move-left
        }
    }
    return low;                                          // @anchor answer
}`;

const NOTES = {
  start: {
    javascript:
      'The half-open window is the whole design. `high` starts at `a.length`, one past the last index, because "the answer is at the end of the array" is a real answer here — so unlike binary search, this function has no failure case and never returns `-1`.',
    python:
      'The half-open window is the whole design. `high` starts at `len(a)`, one past the last index, because "the answer is at the end of the list" is a real answer here — so this function has no failure case and never returns `-1`, and it does not even need a length check before its loop.',
    java: 'The half-open window is the whole design. `high` starts at `a.length`, one past the last index, because "the answer is at the end of the array" is a real answer — so this function has no failure case. Note that `a[mid]` is only ever read while `low < high`, which means `mid` is always a valid index and no bounds check is needed anywhere.',
    cpp: 'The half-open window is the whole design. `high` starts at `a.size()`, one past the last index, because "the answer is at the end of the vector" is a real answer — so there is no failure case. This function is character-for-character the standard library\'s `std::lower_bound`, which is the strongest argument that the shape is the right one.',
  },
  compare: {
    javascript:
      'The comparison is `<` rather than `===`, and that is the entire difference from binary search. Nothing is ever "found": every probe only answers one question — *is this cell too small to be the answer?* — and the loop runs until the window is empty rather than until a match turns up.',
    python:
      'The comparison is `<` rather than `==`, and that is the entire difference from binary search. Nothing is ever "found": every probe only answers one question — *is this cell too small to be the answer?* — and the loop runs until the window is empty. Python spells the condition out in full where the other three languages get `elif` for free from the preceding `return`, so the two branches read more symmetrically here than anywhere else in the family.',
    java: 'The comparison is `<` rather than `==`, and that is the entire difference from binary search. Every probe only answers one question: *is this cell too small to be the answer?* The loop runs until the window is empty, never stopping early on a match, which is why the cost is the same whether the target is present or not.',
    cpp: 'The comparison is `<` rather than `==`, and that is the entire difference from binary search. Every probe only answers one question: *is this cell too small to be the answer?* The loop runs until the window is empty, so the cost is identical whether the target is present, absent, or past the end.',
  },
  'move-right': {
    javascript:
      '`a[mid]` is too small, so everything at or before `mid` is too small, and the answer moves strictly past it: `low = mid + 1`. The `+ 1` is not an off-by-one to be sorry about — it is the assertion that index `mid` is *not* the answer, which is exactly what the comparison just proved.',
    python:
      '`a[mid]` is too small, so everything at or before `mid` is too small, and the answer moves strictly past it: `low = mid + 1`. The `+ 1` encodes the conclusion the comparison reached — that index `mid` is not the answer — rather than being an off-by-one to apologise for.',
    java: '`a[mid]` is too small, so everything at or before `mid` is too small, and the answer moves strictly past it: `low = mid + 1`. The `+ 1` encodes the conclusion the comparison reached — that index `mid` is not the answer — rather than being an off-by-one to apologise for.',
    cpp: '`a[mid]` is too small, so everything at or before `mid` is too small, and the answer moves strictly past it: `low = mid + 1`. The `+ 1` encodes the conclusion the comparison reached — that index `mid` is not the answer — rather than being an off-by-one to apologise for.',
  },
  'move-left': {
    javascript:
      '`a[mid]` is big enough, so the answer is at `mid` or earlier — and here `high = mid` is **inclusive**, unlike the `mid + 1` on the other branch. That asymmetry is the whole trick: `mid` is a candidate answer, not a rejected probe, so it must be kept inside the window. Writing `mid + 1` here is the classic lower-bound bug and it returns an index one too far right.',
    python:
      '`a[mid]` is big enough, so the answer is at `mid` or earlier — and here `high = mid` is **inclusive**, unlike the `mid + 1` on the other branch. That asymmetry is the whole trick: `mid` is a candidate answer, not a rejected probe, so it must stay inside the window. Writing `mid + 1` here returns an index one too far right whenever the array has duplicates.',
    java: '`a[mid]` is big enough, so the answer is at `mid` or earlier — and here `high = mid` is **inclusive**, unlike the `mid + 1` on the other branch. That asymmetry is the whole trick: `mid` is a candidate answer, not a rejected probe, so it must stay inside the window. Writing `mid + 1` here is the classic lower-bound bug.',
    cpp: '`a[mid]` is big enough, so the answer is at `mid` or earlier — and here `high = mid` is **inclusive**, unlike the `mid + 1` on the other branch. That asymmetry is the whole trick: `mid` is a candidate answer, not a rejected probe, so it must stay inside the window. This is exactly why `std::upper_bound`, which wants the first value *greater* than the target, uses `mid + 1` here instead.',
  },
  answer: {
    javascript:
      'The window has collapsed to a single point, and that point is the answer. Two things follow. First, when `low` equals `a.length` this returns n — "past the end" is an answer, not an error, so the function cannot fail. Second, when duplicates exist, `a[low - 1] < target <= a[low]`, so `low` is always the *first* such index: the run of equals is never split.',
    python:
      'The window has collapsed to a single point, and that point is the answer. Two things follow. First, when `low` equals `len(a)` this returns n — "past the end" is an answer, not an error, so the function cannot fail. Second, when duplicates exist, `a[low - 1] < target <= a[low]`, so `low` is always the *first* such index: the run of equals is never split. That is the guarantee `bisect_left` gives you in Python.',
    java: 'The window has collapsed to a single point, and that point is the answer. When duplicates exist, `a[low - 1] < target <= a[low]`, so `low` is always the *first* such index — the run of equals is never split. `Arrays.binarySearch` does *not* give you that guarantee, which is the whole reason this function exists alongside it.',
    cpp: 'The window has collapsed to a single point, and that point is the answer. When duplicates exist, `a[low - 1] < target <= a[low]`, so `low` is always the *first* such index — the run of equals is never split. This is the guarantee that makes `std::lower_bound` composable: `upper_bound - lower_bound` is the number of elements equal to the target.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'lowerBound',
    python: 'lower_bound',
    java: 'LowerBound.lowerBound',
    cpp: 'lower_bound',
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

/** The machine-checked claim: the first index whose value is >= target, or n. */
const lowerBoundOf = (values: number[], target: number): number => {
  for (let i = 0; i < values.length; i++) if ((values[i] as number) >= target) return i;
  return values.length;
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const values = valuesOf(p);
  return { presetId: p.id, args: [values, targetOf(p)], result: lowerBoundOf(values, targetOf(p)) };
});

export const lowerBoundAlgo: AlgoDef<ArrayFrame> = {
  id: 'lower-bound',
  title: 'Lower Bound',
  category: 'searching',
  summary:
    'Binary search that never looks for equality — it halves the window until one index is left, and that index is the first value at least the target.',
  intuition:
    'Reach for it whenever the question is "where would this go?" rather than "is this here?" — insertion points, range counts, prefix queries, or finding the first element satisfying a monotone predicate (a log timestamp, a prefix sum, a page number). With duplicates it gives you a stronger guarantee than binary search: the *first* matching index, every time, so `lower_bound(x+1) - lower_bound(x)` is exactly how many copies of `x` exist. It costs the same as binary search and has no failure case, which makes it strictly easier to compose.',
  complexity: {
    best: 'O(1)',
    average: 'O(log n)',
    worst: 'O(log n)',
    space: 'O(1)',
    note: 'The cost does not depend on whether the target is present — a hit and a miss both take log n probes, which is the property binary search does not have. Space is O(1) but note this is a *distinct* function from binary search, not a flag on it: the two disagree whenever there are duplicates.',
  },
  traits: {
    stable: false,
    inPlace: true,
    online: false,
    allowsDuplicates: true,
    tags: ['sorted input', 'insertion point', 'logarithmic', 'no failure case'],
  },
  viewport: 'array',
  level: 'intermediate',
  params: [
    {
      key: 'size',
      label: 'Elements',
      kind: 'number',
      min: 1,
      max: 150,
      step: 1,
      default: 12,
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
      help: 'Returns the first index whose value is >= this. Try a value above every element: the answer is n.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: lowerBound,
  lesson,
  expectations,
  formatResult: (r) => `index ${r as number}`,
  anchors: ['start', 'compare', 'move-right', 'move-left', 'answer'],
};

export default lowerBoundAlgo;
