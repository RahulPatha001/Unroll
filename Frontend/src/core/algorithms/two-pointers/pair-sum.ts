import { byLanguage } from '../../code/anchors.ts';
import { distinctArray, fewDistinctArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Pair Sum — the smallest complete two-pointer algorithm.
 *
 * Everything about the speed comes from one precondition: the array is already
 * sorted. With a monotone array, `a[left] + a[right]` is not just a number, it
 * is a *certificate*. If the sum is too small then the right value is already as
 * large as it will ever get, so no partner to its left can help — the left value
 * is dead, and throwing it away cannot lose the answer. That is a one-paragraph
 * proof of correctness, and it is the reason the family is called two pointers
 * rather than "searching": no index table, no hashing, one pass, O(1) space.
 *
 * The presets are chosen so each one breaks a different belief. `ties` shows
 * that the answer is *a* pair and not *the* pair, which is the whole reason a
 * caller who needs every pair cannot use this. `single-element` shows that the
 * loop guard `left < right` — never `left <= right` — is what stops a single
 * value being paired with itself.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 811;

/** Two pointers need a monotone array, so every preset is sorted on the way in. */
const sortedOf = (values: number[]): number[] => [...values].sort((a, b) => a - b);

/** `[3, 8, 11, 15, 17, 18, 24, 47, 57, 59]` — a hit that takes five steps. */
const UNIQUE = sortedOf(distinctArray(SEED, 10, 1, 60));
/** `[2, 5, 14, 16, 23, 27, 38, 46, 51, 57]` — the first sum overshoots badly. */
const TIGHT = sortedOf(distinctArray(SEED + 16, 10, 1, 60));
/** Mostly ones and threes: no pair of distinct indices can reach 20. */
const SPARSE = sortedOf(fewDistinctArray(SEED + 4, 11, 3, 1));
/** Long runs of 1, 2 and 3, so the target is reachable several different ways. */
const TIES = sortedOf(fewDistinctArray(SEED + 8, 11, 3, 1));

const PRESETS: Preset[] = [
  {
    id: 'hit-from-below',
    label: 'A hit, reached from below',
    blurb:
      'Distinct values and a target of 77. The sum starts far too low, so the left pointer has to walk in five steps before the pair 18 + 59 turns up. The first probe is never the answer.',
    input: { type: 'numbers', values: UNIQUE },
    params: { target: 77 },
  },
  {
    id: 'hit-from-above',
    label: 'A hit, reached from above',
    blurb:
      'The mirror case, and the one that catches people out: a target of 30 against values up to 57 makes the *first* sum overshoot by a mile. The right pointer walks in four steps, then the two pointers start trading turns, and 14 + 16 is the pair.',
    input: { type: 'numbers', values: TIGHT },
    params: { target: 30 },
  },
  {
    id: 'miss',
    label: 'No such pair',
    blurb:
      'A target of 20 is larger than any two values can reach. The pointers meet in the middle having proved, one discarded value at a time, that the answer does not exist.',
    input: { type: 'numbers', values: SPARSE },
    params: { target: 20 },
  },
  {
    id: 'ties',
    label: 'Four ways to be right',
    blurb:
      'Target 4 can be made from 1 + 3 or from 2 + 2. The algorithm returns the pair the pointers happen to meet first, so "a pair" is all it promises — a caller who needs every pair must do more work.',
    input: { type: 'numbers', values: TIES },
    params: { target: 4 },
  },
  {
    id: 'single-element',
    label: 'One value',
    blurb:
      'A single cell has no partner, and the loop never runs. The guard is `left < right`, never `left <= right` — that is the only thing stopping 42 being paired with itself.',
    input: { type: 'numbers', values: sortedOf(distinctArray(SEED + 12, 1, 1, 60)) },
    params: { target: 84 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

export function* pairSum(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const size = Number(ctx.params.size ?? source.length);
  // Sorting here as well as in `inputSpec.build`: the algorithm's precondition
  // is part of its correctness argument, so a hand-edited input that arrives
  // unsorted must not be able to lie to the trace.
  const values = sortedOf(source).slice(0, Math.max(0, size));
  const n = values.length;
  const target = Number(ctx.params.target ?? 0);

  let ops = 0;
  let left = 0;
  let right = n - 1;

  /** `right` is -1 on an empty array, and a pointer may not leave the array. */
  const cursors = (): Record<string, number> => {
    const out: Record<string, number> = { left };
    if (right >= 0) out.right = right;
    return out;
  };

  /** Everything the two pointers still bracket is the live search space. */
  const live = (): number[] => (n < 2 ? [] : range(left, right + 1));

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    note:
      n < 2
        ? 'Fewer than two values, so no pair of distinct cells can exist. The answer is the "not found" pair.'
        : `Sorted, so the two ends carry the extremes: ${values[0] as number} and ${values[n - 1] as number}. Start one pointer at each end and look for a pair that adds up to ${target}.`,
    values: [...values],
    pointers: cursors(),
    highlight: { window: range(0, n) },
    vars: { n, target, left, right },
  };

  while (left < right) {
    if (ctx.shouldStop()) return;
    ops++;
    const lv = values[left] as number;
    const rv = values[right] as number;
    const sum = lv + rv;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'compare',
      caption: `Pair ${ops}`,
      note: `Add the two ends: ${lv} + ${rv} = ${sum}, against a target of ${target}. One addition, one comparison, and the sortedness does the rest.`,
      values: [...values],
      pointers: cursors(),
      highlight: { compare: [left, right], window: live() },
      ops,
      vars: { left, right, sum, target },
    };

    if (sum === target) {
      yield {
        kind: 'array',
        index: 0,
        anchor: 'found',
        caption: `Pair ${ops}`,
        note: `Stop. ${lv} at index ${left} and ${rv} at index ${right} add up to exactly ${target}. The search returns the first pair the two pointers meet, which is not necessarily the only pair that works — with duplicates there may be several — but every value outside this window was proved incapable of taking part, so nothing earlier was missed.`,
        values: [...values],
        pointers: { left, right },
        highlight: { answer: [left, right], window: live() },
        result: 'found',
        ops,
        vars: { left, right, sum, target, ops },
      };
      return;
    }

    if (sum < target) {
      left = left + 1;
      yield {
        kind: 'array',
        index: 0,
        anchor: 'too-small',
        caption: `Pair ${ops}`,
        note: `${sum} is short of ${target}. The right value is the largest one left in the search, so ${lv} cannot reach the target with *any* partner still in the array. Drop it: the left pointer takes over ${values[left] as number} at index ${left}, and ${lv} is eliminated for good.`,
        values: [...values],
        pointers: cursors(),
        highlight: { window: live(), outOfPlace: [...range(0, left), ...range(right + 1, n)] },
        ops,
        vars: { left, right, sum, target },
      };
    } else {
      right = right - 1;
      yield {
        kind: 'array',
        index: 0,
        anchor: 'too-big',
        caption: `Pair ${ops}`,
        note: `${sum} overshoots ${target}. The left value is the smallest one still in play, so ${rv} cannot be shrunk to reach the target by any partner the array still has. Drop it — and the search space has lost its right edge.`,
        values: [...values],
        pointers: cursors(),
        highlight: { window: live(), outOfPlace: [...range(0, left), ...range(right + 1, n)] },
        ops,
        vars: { left, right, sum, target },
      };
    }
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'exhausted',
    note:
      n < 2
        ? 'Nothing to pair up. Return the "not found" pair rather than null, so the answer has the same shape in all four languages.'
        : `The pointers have met, so every value has been either used or eliminated as impossible. ${ops} addition${ops === 1 ? '' : 's'} were enough to rule out all ${(n * (n - 1)) / 2} possible pairs at once.`,
    values: [...values],
    pointers: cursors(),
    highlight: { outOfPlace: range(0, n) },
    result: 'not-found',
    ops,
    vars: { left, right, target, ops },
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
    // The algorithm's precondition is part of its proof, so the editor sorts on
    // the way out rather than trusting whatever the user typed.
    values: Array.isArray(values.values)
      ? [...(values.values as number[])].sort((a, b) => a - b)
      : [],
  }),
  sizeOf: (input: AlgoInput): number => (input.type === 'numbers' ? input.values.length : 0),
};

/* ------------------------------------------------------------------ *
 * 4. The lesson — four languages, one set of anchors
 * ------------------------------------------------------------------ */

const JS = `function pairSum(a, target) {
  let left = 0, right = a.length - 1;                 // @anchor start
  while (left < right) {
    const sum = a[left] + a[right];                   // @anchor compare
    if (sum === target) return [left, right];         // @anchor found
    if (sum < target) left = left + 1;                // @anchor too-small
    else right = right - 1;                           // @anchor too-big
  }
  return [-1, -1];                                    // @anchor exhausted
}`;

const PY = `def pair_sum(a, target):
    left, right = 0, len(a) - 1                       # @anchor start
    while left < right:
        total = a[left] + a[right]                    # @anchor compare
        if total == target:                           # @anchor found
            return [left, right]
        if total < target:                            # @anchor too-small
            left = left + 1
        else:                                         # @anchor too-big
            right = right - 1
    return [-1, -1]                                   # @anchor exhausted`;

const JAVA = `class PairSum {
    static int[] pairSum(int[] a, int target) {
        int left = 0, right = a.length - 1;           // @anchor start
        while (left < right) {
            int sum = a[left] + a[right];             // @anchor compare
            if (sum == target) return new int[] { left, right };   // @anchor found
            if (sum < target) left = left + 1;        // @anchor too-small
            else right = right - 1;                   // @anchor too-big
        }
        return new int[] { -1, -1 };                  // @anchor exhausted
    }
}`;

const CPP = `#include <vector>
using std::vector;

vector<int> pair_sum(const vector<int>& a, int target) {
    int left = 0, right = (int)a.size() - 1;          // @anchor start
    while (left < right) {
        int sum = a[left] + a[right];                 // @anchor compare
        if (sum == target) return { left, right };    // @anchor found
        if (sum < target) left = left + 1;            // @anchor too-small
        else right = right - 1;                       // @anchor too-big
    }
    return { -1, -1 };                                // @anchor exhausted
}`;

const NOTES = {
  start: {
    javascript:
      'Both pointers go to opposite ends of a *sorted* array, so the search space is the whole array and every probe sees the widest possible span. A negative index is possible here (`[]` gives `right === -1`), which is exactly why the loop guard below is written `<` and not `<=`.',
    python:
      'Both pointers go to opposite ends of a *sorted* list, so the search space is the whole list. Python can initialise two names in one statement — `left, right = 0, len(a) - 1` — which is a tuple assignment: both right-hand sides are evaluated before either name is bound.',
    java: 'Both pointers go to opposite ends of a *sorted* array. Java cannot write `int left = 0, right = a.length - 1` as two independent ideas any more than C or C++ could, but unlike them it does allow two declarators in one statement, so the initialisation reads as one line.',
    cpp: "Both pointers go to opposite ends of a *sorted* vector. The parameter is a `const vector<int>&` — a reference to a const — so the function can read the caller's data at full speed and provably cannot modify it, which is what the `const` is for.",
  },
  compare: {
    javascript:
      'One addition and one comparison, and the sortedness turns the result into a proof. JavaScript has no unsigned or fixed-width integers, so a large enough array could silently lose precision here; `int` in the other three languages would wrap or overflow instead, and all four are equally silent.',
    python:
      'One addition and one comparison, and the sortedness turns the result into a proof. Python integers are arbitrary precision, so this line can never overflow — a difference worth remembering when you port the same code to a fixed-width language.',
    java: 'One addition and one comparison, and the sortedness turns the result into a proof. `a[left] + a[right]` is computed in `int` arithmetic, so a target near `Integer.MAX_VALUE` would overflow silently rather than throwing; the same hazard the C++ listing has with `int`.',
    cpp: 'One addition and one comparison, and the sortedness turns the result into a proof. Note the indexing: `a[left]` and `a[right]` each bounds-check against `a.size()`, so this line is safe only because the guard above already established `left < right < a.size()`.',
  },
  found: {
    javascript:
      'The answer is *indices*, not values — the caller usually wants to mutate the pair it was handed, or to report where it came from. Returning an array literal means a fresh two-element array every call, which is one tiny allocation on a path that runs at most once.',
    python:
      'The answer is *positions*, not values, and a list is the only sequence a caller can mutate. Returning a bare tuple would be marginally cheaper but then no caller could ever repair the array in place, which is usually the whole reason they asked where the pair is.',
    java: 'The answer is an `int[]` rather than two separate values, because that is the only shape that survives the same trip through a JSON round-trip as the other three languages. `new int[] { left, right }` is an array literal; there is no such thing as a Java array value that is a first-class object you can return and mutate in place.',
    cpp: 'A braced list of two ints is a `std::vector<int>`, so this is a heap allocation of exactly two ints. `std::pair<int,int>` would describe the shape better, but the verification harness serialises results through JSON, and a vector is a shape all four languages can agree on.',
  },
  'too-small': {
    javascript:
      "The left value is discarded, not the right. Because the array is sorted, every value still bracketed by the pointers is at least as big as `right`'s, so a sum built on `a[left]` can only get bigger — never reach a target it fell short of. One step permanently eliminates one value.",
    python:
      "The left value is discarded, not the right: everything still bracketed is at least as large as `a[right]`, so any partner for `a[left]` would make the sum larger, never larger *enough*. Note that Python's `if`/`else` here is the reason the `too-big` branch needs no second test.",
    java: 'The left value is discarded, not the right: everything still bracketed is at least as large as `a[right]`, so any partner for `a[left]` would only increase the sum. The jump is exactly one index — the value at `left` is *kept* as a partner, it is the *value* that is being retired.',
    cpp: 'The left value is discarded, not the right: everything still bracketed is at least as large as `a[right]`, so any partner for `a[left]` would only increase the sum. Note `a` is taken by const reference, so the vector is never resized and `a[left]` on the next iteration is the same cell the trace calls "index left".',
  },
  'too-big': {
    javascript:
      'The mirror image of the line above: the right value is retired, because the left value is the smallest one still in play and cannot make an overshooting sum smaller. Between the two branches the search space shrinks by exactly one value per iteration, which is the whole termination argument.',
    python:
      'The mirror image of the line above: the right value is retired, because the left value is the smallest one still in play and cannot make an overshooting sum smaller. Python reaches it through `else` rather than a second `if total > target`, because the equality case already returned.',
    java: 'The mirror image of the line above: the right value is retired, because the left value is the smallest one still in play and cannot make an overshooting sum smaller. `right = right - 1` rather than `--right` only because it reads symmetrically with `left = left + 1` on the other branch.',
    cpp: 'The mirror image of the line above: the right value is retired, because the left value is the smallest one still in play and cannot make an overshooting sum smaller. `right = right - 1` rather than `--right` only because it reads symmetrically with `left = left + 1` on the other branch.',
  },
  exhausted: {
    javascript:
      'The two pointers have met, so every value has been retired or used. Note the sentinel: `[-1, -1]`, never `null` and never `[]`, because an empty array is indistinguishable from "the answer is the empty pair" and `null` has no counterpart in C++. A caller can test `pair[0] === -1` in every language identically.',
    python:
      'The two pointers have met, so every value has been retired or used. The sentinel is `[-1, -1]` rather than `None`, because the harness compares results across four languages and `null` in JSON has no honest equivalent in a `vector<int>` — a value has to be returned, not the absence of one.',
    java: 'The two pointers have met, so every value has been retired or used. The sentinel is `new int[] { -1, -1 }` rather than `null`: a primitive array can never be null in a useful way, and returning `-1` keeps the returned shape identical to the success case, so the caller never branches on null first.',
    cpp: 'The two pointers have met, so every value has been retired or used. The sentinel is `{-1, -1}` rather than an empty vector or a null pointer: a `vector<int>` of length two always has the same shape, so the caller checks `result[0] < 0` in the same way it would in Python or JavaScript.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'pairSum',
    python: 'pair_sum',
    java: 'PairSum.pairSum',
    cpp: 'pair_sum',
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

/**
 * The claim, written out independently of the generator above: the two indices
 * whose values add to the target, or the `[-1, -1]` sentinel. Deliberately the
 * same algorithm rather than an O(n^2) brute force — the four listings are this
 * algorithm, so checking them against a *different* algorithm would be checking
 * that pair sum equals quadratic search, which is not the claim being made.
 */
const pairSumOf = (values: number[], target: number): number[] => {
  let left = 0;
  let right = values.length - 1;
  while (left < right) {
    const sum = (values[left] as number) + (values[right] as number);
    if (sum === target) return [left, right];
    if (sum < target) left = left + 1;
    else right = right - 1;
  }
  return [-1, -1];
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const values = valuesOf(p);
  return { presetId: p.id, args: [values, targetOf(p)], result: pairSumOf(values, targetOf(p)) };
});

export const pairSumAlgo: AlgoDef<ArrayFrame> = {
  id: 'pair-sum',
  title: 'Pair Sum',
  category: 'two-pointers',
  summary:
    'Walk two pointers in from the ends of a sorted array, adding them up and throwing away whichever one could not possibly be part of a pair that hits the target.',
  intuition:
    'Reach for this the moment the input is sorted and the question is "do these two things belong together" — a two-sum interview question, matching a transaction against a target balance, or checking whether a list of sorted measurements brackets a reading. The thing that makes it worth knowing is the precondition: given sortedness you get a linear scan with no extra memory and no hash table, where a hash-table version needs O(n) space and a second pass. It is also the algorithm to reach for *instead of* sorting when you can sort once and then answer many pair queries.',
  complexity: {
    best: 'O(1)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    note: 'The cost is the number of pairs the pointers actually meet, so a hit on the first probe is O(1) and a miss is always the full n - 1 steps. The O(1) space claim only holds because it reports indices; returning the two values would be the same cost.',
  },
  traits: {
    inPlace: true,
    offline: true,
    allowsDuplicates: true,
    tags: ['sorted input', 'no extra space', 'returns indices', 'sentinel for not-found'],
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
      default: 77,
      help: 'Returns the two indices that add up to this, or [-1, -1].',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: pairSum,
  lesson,
  expectations,
  formatResult: (r) => {
    const p = r as number[];
    return (p[0] ?? -1) < 0 ? 'no pair' : `indices ${p[0]} and ${p[1]}`;
  },
  anchors: ['start', 'compare', 'found', 'too-small', 'too-big', 'exhausted'],
};

export default pairSumAlgo;
