import { byLanguage } from '../../code/anchors.ts';
import { distinctArray, randomArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Binary Search — halve the search space on every comparison.
 *
 * The one precondition is the whole algorithm: **the array must be sorted**.
 * Every step is three lines of index arithmetic, and the value of each step is
 * that it throws away half of what is left. The frames are built around the
 * three cursors `low` / `mid` / `high` because those are the only moving parts
 * — everything a student needs to understand is in the relationship between
 * them.
 *
 * The half-open form (`high = a.length - 1`, inclusive) is used throughout, and
 * the note on `low-half` explains why `mid + 1` and not `mid` — off-by-one
 * errors in binary search are almost always exactly that.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 307;

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

/**
 * A value guaranteed to be absent, and chosen *inside* the array's own range so
 * the "not found" preset is a real gap rather than a target off the end.
 */
const missingBetween = (sorted: number[]): number => {
  for (let i = 1; i < sorted.length; i++) {
    const lo = sorted[i - 1] as number;
    const hi = sorted[i] as number;
    if (hi - lo > 1) return lo + 1;
  }
  return (sorted[sorted.length - 1] as number) + 1000;
};

const UNIQUE = sortedOf(distinctArray(SEED, 12, 1, 140));
const SPARSE = sortedOf(distinctArray(SEED + 4, 12, 1, 200));
const HIGH = sortedOf(randomArray(SEED + 8, 11, 5, 95));
const TIES = withTie(distinctArray(SEED + 12, 10, 1, 90), 0);
const GAPPED = sortedOf(distinctArray(SEED + 16, 11, 1, 200));
const TOPEND = sortedOf(distinctArray(SEED + 20, 12, 1, 160));

const PRESETS: Preset[] = [
  {
    id: 'hit-middle',
    label: 'Found at the middle',
    blurb:
      'The luckiest case. The first probe lands straight on the target, so the search does one comparison instead of log2(n).',
    input: { type: 'numbers', values: UNIQUE },
    params: { size: UNIQUE.length, target: UNIQUE[6] as number },
  },
  {
    id: 'hit-low',
    label: 'Found near the start',
    blurb:
      'Every probe has to go *right*, discarding the upper half each time — the usual shape of a successful search.',
    input: { type: 'numbers', values: SPARSE },
    params: { size: SPARSE.length, target: SPARSE[1] as number },
  },
  {
    id: 'hit-high',
    label: 'Found near the end',
    blurb:
      'Every probe goes *left*. The gap between `low` and `high` is the whole algorithm, and here you watch it halve four times.',
    input: { type: 'numbers', values: HIGH },
    params: { size: HIGH.length, target: HIGH[HIGH.length - 2] as number },
  },
  {
    id: 'ties',
    label: 'Lots of ties',
    blurb:
      'Only four distinct values, so the target appears three or four times. Binary search returns whichever copy the probe happened to land on — not necessarily the first.',
    input: { type: 'numbers', values: TIES },
    params: { size: TIES.length, target: TIES[6] as number },
  },
  {
    id: 'not-found',
    label: 'Not found',
    blurb:
      'The target falls in a gap between two values. The search still gets to a single empty range and stops — it never has to look at the whole array.',
    input: { type: 'numbers', values: GAPPED },
    params: { size: GAPPED.length, target: missingBetween(GAPPED) },
  },
  {
    id: 'past-end',
    label: 'Past the end',
    blurb:
      'The target is bigger than every value, so every probe goes left and the window empties from the right. A miss that costs the full log n, and the clearest way to see the two halves being discarded.',
    input: { type: 'numbers', values: TOPEND },
    params: { size: TOPEND.length, target: 999 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

export function* binarySearch(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const size = Number(ctx.params.size ?? input.values.length);
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const values = [...source].slice(0, Math.max(0, size));
  const n = values.length;
  const target = Number(ctx.params.target ?? 0);

  let ops = 0;
  let low = 0;
  let high = n - 1;
  let mid = n === 0 ? 0 : Math.floor((low + high) / 2);

  /** Everything outside `[low, high]` has been proven not to hold the target. */
  const discarded = (): number[] => [...range(0, low), ...range(high + 1, n)];

  /**
   * The three cursors, minus any that sit outside the array. An exhausted
   * search leaves `high` at -1, and a cursor at -1 is not a cell, so it is
   * dropped rather than drawn.
   */
  const cursors = (): Record<string, number> => {
    const out: Record<string, number> = {};
    if (low >= 0) out.low = low;
    if (high >= 0) out.high = high;
    if (low <= high) out.mid = mid;
    return out;
  };

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    note:
      n < 1
        ? 'The array is empty, so there is no range to halve. Not found.'
        : `Looking for ${target} in ${n} sorted value${n === 1 ? '' : 's'}. The search space is the whole array, and every probe throws away about half of whatever is left — so this will take at most ${Math.ceil(Math.log2(n + 1))} comparisons, however unlucky the probes are.`,
    values: [...values],
    pointers: cursors(),
    highlight: { window: range(0, n) },
    vars: { low, mid, high, target, n },
  };

  yield {
    kind: 'array',
    index: 0,
    anchor: 'mid',
    caption: 'Window opened',
    note: `The search space is the inclusive range [${low}, ${high}] — ${n} candidate cells, and \`mid\` starts at ${mid} by halving it. Every probe from here on throws away one half of this range and recomputes \`mid\` from what is left; nothing else in the function ever changes.`,
    values: [...values],
    pointers: cursors(),
    // An empty array has no index to point at, so the first probe is not marked.
    highlight: { ...(n > 0 ? { compare: [mid] } : {}), window: range(low, high + 1) },
    vars: { low, mid, high, target, n },
  };

  while (low <= high) {
    if (ctx.shouldStop()) return;
    ops++;
    mid = low + Math.floor((high - low) / 2);
    const value = values[mid] as number;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'compare',
      caption: `Probe ${ops}`,
      note: `Probe index ${mid}: the value there is ${value}, against a target of ${target}. ${value === target ? 'Equal.' : value < target ? 'Too small, so the answer — if it exists — is strictly to the right.' : 'Too big, so the answer — if it exists — is strictly to the left.'}`,
      values: [...values],
      pointers: cursors(),
      highlight: { compare: [mid], window: range(low, high + 1), outOfPlace: discarded() },
      ops,
      vars: { low, mid, high, value, target },
    };

    if (value === target) {
      yield {
        kind: 'array',
        index: 0,
        anchor: 'hit',
        caption: `Probe ${ops}`,
        note: `${value} equals the target at index ${mid}, so the search returns ${mid} after ${ops} comparison${ops === 1 ? '' : 's'}. Note that this is *a* matching index, not necessarily the first: with duplicates, the copy you land on is whichever one the probe happened to reach.`,
        values: [...values],
        pointers: cursors(),
        highlight: { answer: [mid], window: range(low, high + 1), outOfPlace: discarded() },
        result: 'found',
        ops,
        vars: { low, mid, high, target, ops },
      };
      return;
    }

    if (value < target) {
      low = mid + 1;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'low-half',
        caption: `Probe ${ops}`,
        note: `${value} is smaller than ${target}, and the array is sorted, so every value up to index ${mid} is also too small. Discard them and restart at index ${mid + 1} — not ${mid}, because that one has just been ruled out. The live window is now ${low} to ${high}.`,
        values: [...values],
        pointers: cursors(),
        highlight: { window: range(low, high + 1), outOfPlace: discarded() },
        ops,
        vars: { low, mid, high, target, ops },
      };
    } else {
      high = mid - 1;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'high-half',
        caption: `Probe ${ops}`,
        note: `${value} is bigger than ${target}, and the array is sorted, so every value from index ${mid} onwards is also too big. Discard them and restart at index ${mid - 1}. The live window is now ${low} to ${high} — ${high >= low ? `${high - low + 1} cells` : 'empty'}.`,
        values: [...values],
        pointers: cursors(),
        highlight: { window: range(low, high + 1), outOfPlace: discarded() },
        ops,
        vars: { low, mid, high, target, ops },
      };
    }

    mid = low + Math.floor((high - low) / 2);
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'exhausted',
    caption: `Probe ${ops}`,
    note: `${low} > ${high}, so the live window is empty: there is nowhere left the target could be. The search returns -1 after ${ops} comparison${ops === 1 ? '' : 's'}. This is the important asymmetry — a *miss* still cost only a handful of comparisons, because each one threw away half the rest.`,
    values: [...values],
    pointers: cursors(),
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
    // Sorted here rather than in the generator: binary search's precondition is
    // the algorithm, so a hand-edited array that breaks it should be visible as
    // a wrong answer rather than quietly fixed up behind the student's back.
    values: Array.isArray(values.values)
      ? [...(values.values as number[])].sort((a, b) => a - b)
      : [],
  }),
  sizeOf: (input: AlgoInput): number => (input.type === 'numbers' ? input.values.length : 0),
};

/* ------------------------------------------------------------------ *
 * 4. The lesson — four languages, one set of anchors
 * ------------------------------------------------------------------ */

const JS = `function binarySearch(a, target) {
  // The array must already be sorted.                   // @anchor start
  let low = 0, high = a.length - 1;                     // @anchor mid
  while (low <= high) {
    const mid = low + Math.floor((high - low) / 2);      // @anchor compare
    if (a[mid] === target) {
      return mid;                                       // @anchor hit
    } else if (a[mid] < target) {
      low = mid + 1;                                    // @anchor low-half
    } else {
      high = mid - 1;                                   // @anchor high-half
    }
  }
  return -1;                                            // @anchor exhausted
}`;

const PY = `def binary_search(a, target):
    # The list must already be sorted.                    # @anchor start
    low, high = 0, len(a) - 1                           # @anchor mid
    while low <= high:
        mid = low + (high - low) // 2                    # @anchor compare
        if a[mid] == target:
            return mid                                   # @anchor hit
        elif a[mid] < target:
            low = mid + 1                                # @anchor low-half
        else:
            high = mid - 1                               # @anchor high-half
    return -1                                            # @anchor exhausted`;

const JAVA = `class BinarySearch {
    static int binarySearch(int[] a, int target) {
        // The array must already be sorted.               // @anchor start
        int low = 0, high = a.length - 1;                 // @anchor mid
        while (low <= high) {
            int mid = low + (high - low) / 2;             // @anchor compare
            if (a[mid] == target) {
                return mid;                               // @anchor hit
            } else if (a[mid] < target) {
                low = mid + 1;                            // @anchor low-half
            } else {
                high = mid - 1;                           // @anchor high-half
            }
        }
        return -1;                                        // @anchor exhausted
    }
}`;

const CPP = `#include <vector>
using std::vector;

int binary_search(vector<int> a, int target) {
    // The vector must already be sorted.                  // @anchor start
    int low = 0, high = (int)a.size() - 1;               // @anchor mid
    while (low <= high) {
        int mid = low + (high - low) / 2;                 // @anchor compare
        if (a[mid] == target) {
            return mid;                                   // @anchor hit
        } else if (a[mid] < target) {
            low = mid + 1;                                // @anchor low-half
        } else {
            high = mid - 1;                               // @anchor high-half
        }
    }
    return -1;                                            // @anchor exhausted
}`;

const NOTES = {
  start: {
    javascript:
      'The precondition, and the only one: sorted, ascending, and *that*. If it is not, this returns a confident wrong answer rather than an error, which is the single most common way people get hurt by binary search. `low` and `high` are inclusive bounds, so `high` starts at `length - 1` rather than `length`.',
    python:
      'The precondition, and the only one: sorted, ascending, and *that*. If the list is not sorted this returns a confident wrong answer rather than raising, which is the most common way people get hurt by binary search. `low` and `high` are inclusive, so `high` starts at `len(a) - 1` — and `len` is O(1) here, so the loop condition is free.',
    java: 'The precondition, and the only one: sorted, ascending, and *that*. A broken precondition gives a confident wrong answer, never an exception, which is why `Arrays.binarySearch` documents it so loudly. `high` starts at `a.length - 1` because the bounds are inclusive.',
    cpp: "The precondition, and the only one: sorted, ascending, and *that*. A broken precondition gives a confident wrong answer, never a throw — the reason `std::binary_search` and `std::lower_bound` document the requirement at the top of the page. The parameter is taken by value, so the function works on its own copy and cannot even accidentally sort the caller's array; in production you would take it by const reference and pay nothing for that safety.",
  },
  mid: {
    javascript:
      'Two inclusive bounds, and nothing else to keep track of. Between `low` and `high` there are `high - low + 1` candidate cells, and the whole job is to make that number smaller by about half each round. Note there is no `mid` variable yet — JavaScript and Python and Java and C++ all compute the middle differently, which is the next line.',
    python:
      "Two inclusive bounds. Between `low` and `high` there are `high - low + 1` candidate cells, and the whole job is to halve that number each round. `low, high = 0, len(a) - 1` is Python's tuple assignment; the other three languages need two declarations on one line.",
    java: 'Two inclusive bounds. Between `low` and `high` there are `high - low + 1` candidate cells, and the whole job is to halve that number each round. `int low = 0, high = a.length - 1;` declares and initialises both on one line — legal in Java, and the only reason the line reads as a unit.',
    cpp: 'Two inclusive bounds. Between `low` and `high` there are `high - low + 1` candidate cells, and the whole job is to halve that number each round. The cast on `a.size()` is the one C++-specific hazard: `size()` is unsigned, so `low` and `high` must be `int` or the subtraction below would wrap.',
  },
  compare: {
    javascript:
      'The middle index, then the only comparison that matters. `low + Math.floor((high - low) / 2)` is written the long way on purpose: `(low + high) / 2` gives the same answer until the two indices get big enough that their sum overflows a fixed-width integer, at which point this form is still correct and the short one silently returns a negative index.',
    python:
      'The middle index, then the only comparison that matters. `low + (high - low) // 2` is written the long way on purpose: `(low + high) // 2` overflows on fixed-width integers, and although Python has bignums, the same expression is the one you have to write in C, Java or JavaScript — and in C it is the classic off-by-a-billion bug.',
    java: 'The middle index, then the only comparison that matters. `low + (high - low) / 2` rather than `(low + high) / 2`: the sum can overflow a 32-bit `int` for arrays near a billion elements, and the overflow would wrap `mid` negative and throw `ArrayIndexOutOfBoundsException` on a perfectly valid input.',
    cpp: 'The middle index, then the only comparison that matters. `low + (high - low) / 2` rather than `(low + high) / 2`, because the sum can overflow a signed `int` and wrap `mid` negative. Since `low` and `high` are both non-negative here, the overflow is a genuine possibility rather than a theoretical one — this is the single most important line in the function.',
  },
  hit: {
    javascript:
      'The only exit that reports success, and it returns `mid` rather than `true`. That is worth pausing on: with duplicates, `mid` is *a* matching index, not the first one, so `binarySearch` and `lowerBound` genuinely return different things for the same input. Which one you want depends on whether your data has ties.',
    python:
      'The only exit that reports success, and it returns the index rather than a boolean. With duplicates, `mid` is *a* matching index and not necessarily the first — which is exactly the difference between this function and a lower-bound search, and the reason the two are separate algorithms rather than one function with a flag.',
    java: 'The only exit that reports success, and it returns the index rather than a boolean. With duplicates, `mid` is *a* matching index and not necessarily the first. `Arrays.binarySearch` in the standard library has the same behaviour, which surprises people regularly.',
    cpp: 'The only exit that reports success, and it returns the index rather than a boolean. With duplicates, `mid` is *a* matching index and not necessarily the first — the same behaviour as `std::lower_bound` *without* its tie-breaking guarantee, which is the main reason the standard library offers both.',
  },
  'low-half': {
    javascript:
      'Throw away the lower half. Because the array is sorted, everything at or before `mid` is smaller than the target, and `mid` itself has just been compared and rejected. So `low` becomes `mid + 1` — writing `mid` here is the single most common bug in binary search, and it loops forever.',
    python:
      'Throw away the lower half. Because the list is sorted, everything at or before `mid` is smaller than the target, and `mid` itself was just rejected. So `low` becomes `mid + 1`; writing `mid` here is the single most common binary search bug, and it loops forever.',
    java: 'Throw away the lower half. Because the array is sorted, everything at or before `mid` is smaller than the target, and `mid` itself was just rejected — so `low` becomes `mid + 1`. Writing `mid` here is the single most common binary search bug, and the symptom is an infinite loop rather than a wrong answer, which at least makes it easy to spot.',
    cpp: 'Throw away the lower half. Because the vector is sorted, everything at or before `mid` is smaller than the target, and `mid` itself was just rejected — so `low` becomes `mid + 1`. Writing `mid` here is the single most common binary search bug; the symptom is an infinite loop, which is at least easy to notice.',
  },
  'high-half': {
    javascript:
      'Throw away the upper half, symmetrically. `high = mid - 1` for the same reason `low = mid + 1`: `mid` itself is not a candidate, because it was the value that was too big. The window is now half the size it was, and the loop runs again with a new `mid` computed from the new bounds.',
    python:
      'Throw away the upper half, symmetrically. `high = mid - 1` for the same reason `low = mid + 1`: `mid` itself is not a candidate, because it was the value that was too big. The window is now half the size it was, and the loop recomputes `mid` from the new bounds.',
    java: 'Throw away the upper half, symmetrically. `high = mid - 1` for the same reason `low = mid + 1`: `mid` itself is not a candidate. The window is now half the size it was, and the loop recomputes `mid` from the new bounds — that recomputation is why `mid` is an expression inside the loop rather than a value computed once before it.',
    cpp: 'Throw away the upper half, symmetrically. `high = mid - 1` for the same reason `low = mid + 1`: `mid` itself is not a candidate. The window is now half the size it was, and the loop recomputes `mid` from the new bounds — which is why `mid` is an expression inside the loop, not a value computed once before it.',
  },
  exhausted: {
    javascript:
      'The loop condition failed, which means `low > high` and the window is empty. Returning `-1` is the only honest answer left: every cell in the array has either been compared or was eliminated by a comparison on a sorted array, so nothing was skipped. This is the property that makes a miss as cheap as a hit.',
    python:
      'The loop condition failed, which means `low > high` and the window is empty. Returning `-1` is the only honest answer: every cell was either compared directly or eliminated by a comparison on a sorted list, so nothing was skipped. That is what makes a miss as cheap as a hit — the opposite of linear search.',
    java: 'The loop condition failed, which means `low > high` and the window is empty. Returning `-1` is the only honest answer: every cell was either compared directly or eliminated by a comparison on a sorted array. Note that Java cannot return "no value" from an `int` method, so the sentinel is a contract the caller must know about.',
    cpp: 'The loop condition failed, which means `low > high` and the window is empty. Returning `-1` is the only honest answer: every cell was either compared directly or eliminated by a comparison on a sorted vector. C++ could have returned `std::optional<int>` here, which would move the "not found" case into the type system instead of into a comment.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'binarySearch',
    python: 'binary_search',
    java: 'BinarySearch.binarySearch',
    cpp: 'binary_search',
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
  return { presetId: p.id, args: [values, target], result: values.indexOf(target) };
});

export const binarySearchAlgo: AlgoDef<ArrayFrame> = {
  id: 'binary-search',
  title: 'Binary Search',
  category: 'searching',
  summary:
    'Probe the middle of the remaining range, then discard the half that cannot hold the target.',
  intuition:
    'Reach for it whenever the data is already sorted or you can sort it once and query many times — an index of a million documents, a sorted on-disk table, a dictionary trie of prefix keys. The precondition is the price and the deal: sorting costs O(n log n) once, and after that a lookup is log2(n) comparisons regardless of how badly the probes fall. Do not reach for it on unsorted data, on a collection that changes between queries, or when you only need one lookup — a single linear scan is cheaper than building the order at all.',
  complexity: {
    best: 'O(1)',
    average: 'O(log n)',
    worst: 'O(log n)',
    space: 'O(1)',
    note: 'Best and worst are the same up to a constant because the halving is driven by the indices, not by the data. The real cost is the precondition: whoever sorted the array paid O(n log n), and that bill is only worth it if you search more than about log n times.',
  },
  traits: {
    stable: false,
    inPlace: true,
    online: false,
    allowsDuplicates: true,
    tags: ['sorted input', 'logarithmic', 'divide and conquer'],
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
      default: 12,
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
      help: 'The value to look for. Change it and the search restarts from the whole array.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: binarySearch,
  lesson,
  expectations,
  formatResult: (r) => ((r as number) < 0 ? 'not found (-1)' : `index ${r as number}`),
  anchors: ['start', 'mid', 'compare', 'hit', 'low-half', 'high-half', 'exhausted'],
};

export default binarySearchAlgo;
