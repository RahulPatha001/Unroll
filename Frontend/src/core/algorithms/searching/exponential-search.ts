import { byLanguage } from '../../code/anchors.ts';
import { distinctArray, randomArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Exponential Search — double the range until you overshoot, then halve it.
 *
 * The right algorithm for one specific situation: the data is sorted but you do
 * not know how *big* it is. Binary search needs both ends up front; exponential
 * search discovers the upper bound by doubling — 1, 2, 4, 8 … — and only then
 * bisects the window it just proved the target lies in. So the cost is
 * O(log i) in the *index* of the answer, not in the length of the array, and a
 * target near the front of a million-element list costs a handful of
 * comparisons.
 *
 * The doubling loop and the bisection loop are the same shape as two other
 * algorithms in this family, which is the point: the visualisation puts the
 * cursor on the boundary that moves from "1, 2, 4, 8" to "low, high" and the
 * jump is visible.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 601;

/** Searching algorithms need sorted input, so every preset sorts before use. */
const sortedOf = (values: number[]): number[] => [...values].sort((a, b) => a - b);

/**
 * Distinct values plus one deliberate duplicate — the shape that makes
 * `a[low] <= a[mid]` an *equality* test, which is the branch duplicated data
 * actually exercises. The target used with this array is always a unique value,
 * so the expected answer is the same in all four languages rather than
 * "whichever copy of the duplicate the probe happened to reach".
 */
const withTie = (distinct: number[], at: number): number[] =>
  sortedOf([...distinct, distinct[at] as number]);

/** A value guaranteed to be absent, and inside the array's own range. */
const missingBetween = (sorted: number[]): number => {
  for (let i = 1; i < sorted.length; i++) {
    const lo = sorted[i - 1] as number;
    const hi = sorted[i] as number;
    if (hi - lo > 1) return lo + 1;
  }
  return (sorted[sorted.length - 1] as number) + 1000;
};

const UNIQUE = sortedOf(distinctArray(SEED, 13, 1, 160));
const DENSE = sortedOf(randomArray(SEED + 4, 12, 5, 95));
const TIES = withTie(distinctArray(SEED + 8, 10, 1, 90), 0);
const SPARSE = sortedOf(distinctArray(SEED + 12, 11, 1, 200));
const TOPEND = sortedOf(distinctArray(SEED + 16, 12, 1, 160));

const PRESETS: Preset[] = [
  {
    id: 'hit-at-front',
    label: 'Found at the front',
    blurb:
      'The target is in the first few cells, so the doubling loop stops almost at once. This is exponential search at its best: O(log i), not O(log n).',
    input: { type: 'numbers', values: UNIQUE },
    params: { size: UNIQUE.length, target: UNIQUE[2] as number },
  },
  {
    id: 'hit-at-back',
    label: 'Found at the back',
    blurb:
      'The target is near the end, so the doubling loop has to run all the way to the end of the array and then bisect a small window. Worst case for the doubling phase.',
    input: { type: 'numbers', values: DENSE },
    params: { size: DENSE.length, target: DENSE[DENSE.length - 1] as number },
  },
  {
    id: 'ties',
    label: 'Lots of ties',
    blurb:
      'Four distinct values across 14 cells, so the doubling phase cannot tell a run of equals from a smaller value and keeps going until it overshoots. The bisection then returns whichever copy it lands on.',
    input: { type: 'numbers', values: TIES },
    params: { size: TIES.length, target: TIES[6] as number },
  },
  {
    id: 'not-found',
    label: 'Not found in a gap',
    blurb:
      'The target falls between two values. The doubling loop overshoots it, the window is bisected, and the window empties — a miss still costs only log n comparisons.',
    input: { type: 'numbers', values: SPARSE },
    params: { size: SPARSE.length, target: missingBetween(SPARSE) },
  },
  {
    id: 'past-end',
    label: 'Past the end',
    blurb:
      'The target is bigger than every value, so the doubling loop runs out of array before it runs out of target. The loop guard `i < n` is what stops it, and the search returns -1.',
    input: { type: 'numbers', values: TOPEND },
    params: { size: TOPEND.length, target: 999 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

export function* exponentialSearch(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const size = Number(ctx.params.size ?? input.values.length);
  const values = [...source].slice(0, Math.max(0, size));
  const n = values.length;
  const target = Number(ctx.params.target ?? 0);

  let ops = 0;
  /** Doubling probes and bisection probes are counted apart: they are different
   *  phases with different costs, and the narration must not conflate them. */
  let doubles = 0;
  let probes = 0;
  let i = 1;
  let low = 0;
  let high = n === 0 ? -1 : 0;

  const cursors = (): Record<string, number> => {
    const out: Record<string, number> = {};
    if (low >= 0) out.low = low;
    if (high >= 0) out.high = high;
    if (low <= high && low < n) out.mid = Math.floor((low + high) / 2);
    if (i > 0) out.bound = Math.min(i, n);
    return out;
  };

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    note:
      n < 1
        ? 'The array is empty, so there is nothing to double towards. Not found.'
        : `Looking for ${target} in ${n} sorted value${n === 1 ? '' : 's'} without being told n in advance. Start at index 1 and double: each step covers twice as much ground as the last, so the number of comparisons is driven by *where the answer is*, not by how long the array is.`,
    values: [...values],
    // There is no index 1 in an empty array, and a cursor at one is not a cell.
    pointers: n > 0 ? { bound: 1 } : {},
    highlight: { window: range(0, n) },
    vars: { bound: 1, target, n },
  };

  // ---- phase 1: double the bound until it is big enough ------------------

  while (i < n && (values[i] as number) < target) {
    if (ctx.shouldStop()) return;
    ops++;
    doubles++;
    const value = values[i] as number;
    const overshot = i * 2;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'double',
      caption: `Bound ${i}`,
      note: `Probe index ${i}: ${value} against a target of ${target}. ${value < target ? 'Still too small, and because the array is sorted everything up to here is too small — double the bound.' : 'Big enough already, so the answer is at or before this index. Stop doubling.'}`,
      values: [...values],
      pointers: { bound: i },
      highlight: { compare: [i], window: range(0, n), outOfPlace: range(0, i + 1) },
      ops,
      vars: { bound: i, next: overshot, value, target },
    };

    if (value >= target) break;
    i = overshot;
  }

  // ---- phase 2: bisect the window the doubling loop proved --------------

  low = Math.floor(i / 2);
  high = Math.min(i, n - 1);

  yield {
    kind: 'array',
    index: 0,
    anchor: 'window',
    caption: `Bisect [${low}, ${high}]`,
    note:
      low > high
        ? `The doubling loop stopped because it ran out of array at index ${i}, not because it overshot the target. The window is empty, so the answer is -1 — proven in ${ops} comparison${ops === 1 ? '' : 's'} without a single bisection.`
        : `The doubling loop stopped at bound ${i}, so the target — if it exists — is in [${low}, ${high}]: everything below ${low} was measured as too small, and index ${high} is the first cell measured as big enough (or the end of the array). That window is at most ${high - low + 1} cells wide, and now ordinary binary search finishes it.`,
    values: [...values],
    pointers: cursors(),
    highlight: {
      window: range(low, high + 1),
      outOfPlace: [...range(0, low), ...range(high + 1, n)],
    },
    ops,
    vars: { low, high, bound: i, target, ops },
  };

  while (low <= high) {
    if (ctx.shouldStop()) return;
    ops++;
    probes++;
    const mid = low + Math.floor((high - low) / 2);
    const value = values[mid] as number;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'compare',
      caption: `Probe ${ops}`,
      note: `Bisect [${low}, ${high}] at index ${mid}: ${value} against a target of ${target}. ${value === target ? 'Equal.' : value < target ? 'Too small — discard the left half.' : 'Too big — discard the right half.'}`,
      values: [...values],
      pointers: { low, mid, high },
      highlight: {
        compare: [mid],
        window: range(low, high + 1),
        outOfPlace: [...range(0, low), ...range(high + 1, n)],
      },
      ops,
      vars: { low, mid, high, value, target },
    };

    if (value === target) {
      yield {
        kind: 'array',
        index: 0,
        anchor: 'hit',
        caption: `Probe ${ops}`,
        note: `${value} equals the target at index ${mid}, so the search returns ${mid}: ${doubles} doubling step${doubles === 1 ? '' : 's'} to find the window, then ${probes} bisection${probes === 1 ? '' : 's'} inside it. With duplicates this is *a* matching index, not the first one.`,
        values: [...values],
        pointers: { low, mid, high },
        highlight: {
          answer: [mid],
          window: range(low, high + 1),
          outOfPlace: [...range(0, low), ...range(high + 1, n)],
        },
        result: 'found',
        ops,
        vars: { low, mid, high, target, ops },
      };
      return;
    }

    if (value < target) low = mid + 1;
    else high = mid - 1;
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'exhausted',
    caption: `Probe ${ops}`,
    note: `The window [${low}, ${high}] is empty, so the target is not in the array and the search returns -1. Both phases together still cost only ${ops} comparison${ops === 1 ? '' : 's'} — the doubling found the neighbourhood and the bisection ruled it out.`,
    values: [...values],
    // An exhausted window leaves `high` below `low`; a cursor below 0 is not a
    // position in the array, so it is dropped rather than drawn.
    pointers: { low, ...(high >= 0 ? { high } : {}) },
    highlight: { outOfPlace: range(0, n) },
    result: 'not-found',
    ops,
    vars: { low, high, target, ops },
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

const JS = `function exponentialSearch(a, target) {
  if (a.length === 0) return -1;                         // @anchor start
  let i = 1;
  while (i < a.length && a[i] < target) {                // @anchor double
    i *= 2;
  }
  let low = Math.floor(i / 2), high = Math.min(i, a.length - 1); // @anchor window
  if (low > high) return -1;
  while (low <= high) {                                  // @anchor compare
    const mid = low + Math.floor((high - low) / 2);
    if (a[mid] === target) {
      return mid;                                        // @anchor hit
    } else if (a[mid] < target) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return -1;                                             // @anchor exhausted
}`;

const PY = `def exponential_search(a, target):
    if not a:                                            # @anchor start
        return -1
    i = 1
    while i < len(a) and a[i] < target:                   # @anchor double
        i *= 2
    low, high = i // 2, min(i, len(a) - 1)                # @anchor window
    if low > high:
        return -1
    while low <= high:                                   # @anchor compare
        mid = low + (high - low) // 2
        if a[mid] == target:
            return mid                                   # @anchor hit
        elif a[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    return -1                                            # @anchor exhausted`;

const JAVA = `class ExponentialSearch {
    static int exponentialSearch(int[] a, int target) {
        if (a.length == 0) return -1;                    // @anchor start
        int i = 1;
        while (i < a.length && a[i] < target) {           // @anchor double
            i *= 2;
        }
        int low = i / 2, high = Math.min(i, a.length - 1); // @anchor window
        if (low > high) return -1;
        while (low <= high) {                             // @anchor compare
            int mid = low + (high - low) / 2;
            if (a[mid] == target) {
                return mid;                               // @anchor hit
            } else if (a[mid] < target) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return -1;                                        // @anchor exhausted
    }
}`;

const CPP = `#include <algorithm>
#include <vector>
using std::vector;

int exponential_search(vector<int> a, int target) {
    if (a.empty()) return -1;                             // @anchor start
    int i = 1;
    while (i < (int)a.size() && a[i] < target) {           // @anchor double
        i *= 2;
    }
    int low = i / 2, high = std::min(i, (int)a.size() - 1); // @anchor window
    if (low > high) return -1;
    while (low <= high) {                                 // @anchor compare
        int mid = low + (high - low) / 2;
        if (a[mid] == target) {
            return mid;                                   // @anchor hit
        } else if (a[mid] < target) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    return -1;                                            // @anchor exhausted
}`;

const NOTES = {
  start: {
    javascript:
      'The one case this algorithm can answer without a loop: an empty array. Note that binary search does *not* need this guard — its `high` starts at `-1` and its loop condition fails by itself. Exponential search does, because its first move is to index 1 unconditionally, and reading `a[1]` of a one-element array is `undefined` rather than an error.',
    python:
      'The one case this algorithm can answer without a loop: an empty list. `if not a` is the Python spelling; the other three languages compare against a length, which is two extra tokens for the same thought. Note that binary search needs no such guard — its loop condition fails by itself, which is one of the small ways it is more robust.',
    java: 'The one case this algorithm can answer without a loop: an empty array. Java would throw `ArrayIndexOutOfBoundsException` on `a[1]` for a zero- or one-element array, so the guard is not optional here — a thrown exception is a very different contract from the `-1` this function promises everywhere else.',
    cpp: 'The one case this algorithm can answer without a loop: an empty vector. `a.empty()` is the idiomatic form; `a.size() == 0` also works. And unlike Java, reading `a[1]` on a short vector is undefined behaviour rather than a catchable exception, so the guard is not optional — the failure would be silent and would not show up in a test.',
  },
  double: {
    javascript:
      'The discovery loop, and the reason this algorithm exists. Each comparison covers twice the ground of the last — 1, 2, 4, 8 — so the number of steps is the *position* of the answer, not the length of the array. The `i < a.length` half of the condition is what stops the loop when the target is past the end, instead of letting `i` run away to infinity.',
    python:
      'The discovery loop, and the reason this algorithm exists. Each comparison covers twice the ground of the last — 1, 2, 4, 8 — so the number of steps is the *position* of the answer, not the length of the list. The `i < len(a)` half of the condition is what stops the loop when the target is past the end.',
    java: 'The discovery loop, and the reason this algorithm exists. Each comparison covers twice the ground of the last, so the number of steps is the *position* of the answer, not the length of the array. `i *= 2` is safe to the last iteration: the condition is checked first, so `i` never overflows an `int` here — the doubling stops at the array length, not at 2^31.',
    cpp: 'The discovery loop, and the reason this algorithm exists. Each comparison covers twice the ground of the last, so the number of steps is the *position* of the answer, not the length of the vector. `i *= 2` is safe because the condition is checked first, so `i` never reaches the point where doubling an `int` would overflow — that would be a genuine hazard in a variant that doubled before testing.',
  },
  window: {
    javascript:
      "The hand-off, and the trickiest line in the function. The `- 1` belongs *inside* the `min`, not outside it: the loop above stopped because `a[i] >= target`, so index `i` is itself a candidate answer and must stay in the window. Because `i` is always a power of two, halving it gives exactly the last bound that was measured as too small — so the target, if it exists, is in `[i/2, min(i, n - 1)]`, a window at most half the bound wide. `Math.floor` is *not* optional here: JavaScript's `/` is floating-point division, so `i / 2` is 0.5 when i is 1, and every index downstream of it would be fractional. Java and C++ get the truncation from integer division and Python has to ask for `//` explicitly — the one line in this function where the languages genuinely disagree.",
    python:
      'The hand-off, and the trickiest line in the function. The `- 1` belongs *inside* the `min`, not outside it: the loop above stopped because `a[i] >= target`, so index `i` is itself a candidate answer and must stay in the window. Because `i` is always a power of two, `i // 2` is exactly the last bound that was measured as too small — so the target, if it exists, is in `[i // 2, min(i, n - 1)]`. That window is at most half the bound, which is what makes the second phase cheap. `i // 2` and `i / 2` agree here only because `i` is a power of two; in general Python needs the floor form.',
    java: "The hand-off, and the trickiest line in the function. The `- 1` belongs *inside* the `min`, not outside it: the loop above stopped because `a[i] >= target`, so index `i` is itself a candidate answer and must stay in the window. Because `i` is always a power of two, `i / 2` is exactly the last bound that was measured as too small — so the target, if it exists, is in `[i / 2, min(i, n - 1)]`. That window is at most half the bound. Java's `Math.min` is the only reason this line fits on one; the C++ version needs `std::min` and the Python version needs `min()`.",
    cpp: 'The hand-off, and the trickiest line in the function. The `- 1` belongs *inside* the `min`, not outside it: the loop above stopped because `a[i] >= target`, so index `i` is itself a candidate answer and must stay in the window. Because `i` is always a power of two, `i / 2` is exactly the last bound measured as too small, so the target lies in `[i / 2, min(i, n - 1)]`. Note the `- 1` is *inside* the `min`: the bound itself is a candidate answer, because the loop above stopped on `a[i] >= target`, not on `i >= n`. Writing `min(i, n) - 1` instead silently drops index `i` and loses any hit sitting exactly on the bound.',
  },
  compare: {
    javascript:
      'Ordinary binary search, from here on. The interesting observation for a reader is that this loop is *character for character* the loop in the binary search module — exponential search is not a new search, it is a way of finding the two numbers that make the old one legal. Nothing here needs the array to be longer than the window.',
    python:
      'Ordinary binary search, from here on. The interesting observation is that this loop is character for character the loop in the binary search module — exponential search is not a new search, it is a way of finding the two numbers that make the old one legal.',
    java: 'Ordinary binary search, from here on. The interesting observation is that this loop is character for character the loop in the binary search module — exponential search is not a new search, it is a way of finding the two numbers that make the old one legal. Java has no `while (true)` idiom to simplify here, so the guard is written out as `low <= high`.',
    cpp: 'Ordinary binary search, from here on. The interesting observation is that this loop is character for character the loop in the binary search module — exponential search is not a new search, it is a way of finding the two numbers that make the old one legal. Everything above this line is the only part that is new.',
  },
  hit: {
    javascript:
      "The return. The cost decomposes as log(i) doubling steps plus log(hi - low + 1) bisections, where `i` is the answer's own position — so a hit near the front of a very long array is nearly free, which is the entire selling point. With duplicates this is *a* matching index; use a lower bound if you need the first one.",
    python:
      "The return. The cost decomposes as log(i) doubling steps plus log(hi - low + 1) bisections, where `i` is the answer's own position — so a hit near the front of a very long list is nearly free, which is the entire selling point. With duplicates this is *a* matching index; use a lower bound if you need the first one.",
    java: "The return. The cost decomposes as log(i) doubling steps plus log(hi - low + 1) bisections, where `i` is the answer's own position — so a hit near the front of a very long array is nearly free. With duplicates this is *a* matching index; use a lower bound if you need the first one.",
    cpp: "The return. The cost decomposes as log(i) doubling steps plus log(hi - low + 1) bisections, where `i` is the answer's own position — so a hit near the front of a very long vector is nearly free. With duplicates this is *a* matching index; use `std::lower_bound` if you need the first one.",
  },
  exhausted: {
    javascript:
      'The window emptied, so the target is not in the array. Note that both failure paths return the same `-1`: the early one when the doubling loop ran out of array, this one when the bisection did. Returning from two places with the same sentinel is the only reason the contract is simple enough to state in one sentence.',
    python:
      'The window emptied, so the target is not in the list. Note that both failure paths return the same `-1`: the early one when the doubling loop ran out of list, this one when the bisection did. Returning from two places with the same sentinel is the only reason the contract is simple enough to state in one sentence.',
    java: 'The window emptied, so the target is not in the array. Both failure paths return the same `-1`: the early one when the doubling loop ran out of array, this one when the bisection did. Note the early return sits above the `low > high` check rather than inside the loop, so there are two exits and both carry the same sentinel.',
    cpp: 'The window emptied, so the target is not in the vector. Both failure paths return the same `-1`: the early one when the doubling loop ran out of vector, this one when the bisection did. C++ could have made the whole function return `std::optional<int>`, which would put the failure into the type rather than into a magic number.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'exponentialSearch',
    python: 'exponential_search',
    java: 'ExponentialSearch.exponentialSearch',
    cpp: 'exponential_search',
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
  return { presetId: p.id, args: [values, targetOf(p)], result: values.indexOf(targetOf(p)) };
});

export const exponentialSearchAlgo: AlgoDef<ArrayFrame> = {
  id: 'exponential-search',
  title: 'Exponential Search',
  category: 'searching',
  summary:
    'Double a bound until it is past the target, then binary search only the window the doubling proved the answer lies in.',
  intuition:
    "Reach for it when the data is sorted but unbounded — a stream, a lazily-loaded chunk, a table whose length you have not looked up yet — because it never needs the length up front, only an upper bound it discovers itself. Also the right shape when the answer is usually near the front, since the cost is O(log i) in the answer's own index rather than in the array length. On a fixed array where you already know n, it is strictly worse than binary search and there is no reason to prefer it.",
  complexity: {
    best: 'O(1)',
    average: 'O(log i)',
    worst: 'O(log n)',
    space: 'O(1)',
    note: 'O(log i) where i is the index of the answer, not the length of the array — that is the whole difference from binary search and it only matters when the length is unknown or the answer is usually early. Worst case is still O(log n), so this is never asymptotically better, only differently shaped.',
  },
  traits: {
    stable: false,
    inPlace: true,
    online: false,
    allowsDuplicates: true,
    tags: ['sorted input', 'unbounded input', 'log of the answer'],
  },
  viewport: 'array',
  level: 'advanced',
  params: [
    {
      key: 'size',
      label: 'Elements',
      kind: 'number',
      min: 1,
      max: 150,
      step: 1,
      default: 13,
      regeneratesInput: true,
      help: 'Beyond 150 the viewport switches to canvas.',
    },
    {
      key: 'target',
      label: 'Target',
      kind: 'number',
      min: 0,
      max: 200,
      step: 1,
      default: 42,
      help: 'Move it towards the front and watch the doubling loop shorten.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: exponentialSearch,
  lesson,
  expectations,
  formatResult: (r) => ((r as number) < 0 ? 'not found (-1)' : `index ${r as number}`),
  anchors: ['start', 'double', 'window', 'compare', 'hit', 'exhausted'],
};

export default exponentialSearchAlgo;
