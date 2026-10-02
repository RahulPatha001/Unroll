import { byLanguage } from '../../code/anchors.ts';
import { fewDistinctArray, randomArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Kadane's Algorithm — maximum-sum subarray in one pass, with one decision.
 *
 * The textbook question is "what is the best subarray that ends *here*", and the
 * answer is a two-way choice: either extend the previous best, or start again at
 * this element. Which one is better depends on a single test — is the previous
 * running sum negative? If so, carrying it forward can only make things worse,
 * so it is thrown away *including* every element that went into it. That is the
 * whole algorithm, and it is why `start` has to be tracked at all: the running
 * sum is a value, but the answer is a *range*, and the range is the part students
 * forget.
 *
 * The overlay row exists for that reason. It shows `current` — the best sum
 * ending at each position — for the whole array as it is discovered, which
 * turns "Kadane is O(n)" from a claim into something you can watch: a value per
 * position, one pass, no backtracking.
 *
 * The `all-negative` preset is the one that breaks naive implementations. The
 * answer there is the single *least negative* element, not 0, which means `best`
 * has to be seeded with a real element rather than with 0 — the classic bug.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 1107;

const PRESETS: Preset[] = [
  {
    id: 'mixed-signs',
    label: 'Mixed signs',
    blurb:
      'Negatives and positives, and the -7 in the middle is *kept* — the running sum in front of it is still positive, so extending beats restarting. The best subarray starts at the 8, not at the 9, which is the opposite of the greedy-looking guess.',
    input: { type: 'numbers', values: randomArray(SEED, 9, -8, 12) },
  },
  {
    id: 'all-negative',
    label: 'All negative',
    blurb:
      'Every value is negative, so the best subarray is a single element and `best` must never be seeded with 0 — the answer is -1, not 0. This is the preset that separates a correct Kadane from the one everybody writes first.',
    input: { type: 'numbers', values: randomArray(SEED + 4, 7, -9, -1) },
  },
  {
    id: 'all-positive',
    label: 'All positive',
    blurb:
      'Nothing is ever negative, so the reset branch never fires and the answer is simply every element. The best case: n additions, one comparison per element, and the window never moves.',
    input: { type: 'numbers', values: randomArray(SEED + 8, 8, 2, 9) },
  },
  {
    id: 'few-distinct',
    label: 'Ties everywhere',
    blurb:
      'Only three distinct values, most of them -2, -3 and -4. Several positions tie for the best sum, and the strict `>` means the *first* one recorded is the one kept — which of the tied ranges you get depends on scan order, not on which is larger.',
    input: { type: 'numbers', values: fewDistinctArray(SEED + 12, 10, 3, -4) },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

export function* kadane(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const size = Number(ctx.params.size ?? source.length);
  const values = [...source].slice(0, Math.max(0, size));
  const n = values.length;

  let ops = 0;
  /** Sum of the window `[start, i]` — the best subarray that ends at `i`. */
  let current = 0;
  let start = 0;
  let best = 0;
  let bestStart = 0;
  let bestEnd = -1;

  /**
   * One cell per array position: the best sum of a subarray *ending* there.
   * A dash marks a position the scan has not reached yet, which is the whole
   * point of the row — you can watch the array being filled left to right and
   * see that nothing is ever revisited.
   */
  const ending: Array<number | string> = values.map(() => '-');

  const window = (i: number): number[] => range(start, i + 1);
  const answer = (): number[] => (bestEnd >= bestStart ? range(bestStart, bestEnd + 1) : []);
  const ahead = (i: number): number[] => range(i + 1, n);
  const before = (i: number): number[] => range(0, i);

  if (n === 0) {
    yield {
      kind: 'array',
      index: 0,
      anchor: 'start',
      note: 'The array is empty, so there is no subarray at all. The answer is 0 — the one case where a sum of nothing beats a sum of something.',
      values: [],
      highlight: {},
      vars: { n, best: 0 },
    };
    yield {
      kind: 'array',
      index: 0,
      anchor: 'done',
      note: 'Nothing to scan. Return 0.',
      values: [],
      result: 'empty',
      ops,
      vars: { best: 0, ops },
    };
    return;
  }

  current = values[0] as number;
  best = current;
  bestStart = 0;
  bestEnd = 0;
  ending[0] = current;

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    note: `Seed the window with the first element, ${current}, and make it the best so far. Seeding with 0 instead would be the bug this algorithm is famous for: on an all-negative array the answer would come out as 0 rather than the least negative element.`,
    values: [...values],
    pointers: { i: 0, start: 0 },
    highlight: { window: window(0), answer: answer() },
    overlay: { label: 'best sum ending here', values: [...ending], pointers: { i: 0 } },
    ops,
    vars: { i: 0, start, current, best, n },
  };

  for (let i = 1; i < n; i++) {
    if (ctx.shouldStop()) return;
    ops++;
    const value = values[i] as number;
    const carried = current;
    const restart = current < 0;
    current = restart ? value : carried + value;
    if (restart) start = i;
    ending[i] = current;

    if (restart) {
      yield {
        kind: 'array',
        index: 0,
        anchor: 'reset',
        caption: `Element ${i + 1} of ${n}`,
        note: `The window's sum is ${carried}, which is negative — dragging it along would make every later total worse, so the whole window is abandoned at once. Start again at index ${i} with ${value}, and \`start\` becomes ${i}. Abandoning the sum and the range together is the step naive versions miss.`,
        values: [...values],
        pointers: { i, start },
        highlight: {
          window: window(i),
          answer: answer(),
          outOfPlace: [...range(0, i), ...ahead(i)],
        },
        overlay: { label: 'best sum ending here', values: [...ending], pointers: { i } },
        ops,
        vars: { i, start, current, best, dropped: carried },
      };
    } else {
      yield {
        kind: 'array',
        index: 0,
        anchor: 'extend',
        caption: `Element ${i + 1} of ${n}`,
        note: `The window's sum is still ${carried}, which is positive, so keeping it pays: ${carried} + ${value} = ${current}. The window grows by one element and \`start\` does not move — this is the branch that carries the -7 in the mixed-signs preset instead of restarting after it.`,
        values: [...values],
        pointers: { i, start },
        highlight: { window: window(i), answer: answer(), outOfPlace: ahead(i) },
        overlay: { label: 'best sum ending here', values: [...ending], pointers: { i } },
        ops,
        vars: { i, start, current, best, added: value },
      };
    }

    if (current > best) {
      const record = best;
      best = current;
      bestStart = start;
      bestEnd = i;
      yield {
        kind: 'array',
        index: 0,
        anchor: 'update',
        caption: `Element ${i + 1} of ${n}`,
        note: `The best sum ending at index ${i} is ${current}, which beats the previous record of ${record}. Record the range as well: indices ${bestStart} to ${bestEnd}, summing to ${best}. A sum with no remembered start index is not yet an answer to "which subarray".`,
        values: [...values],
        pointers: { i: bestEnd, start: bestStart },
        highlight: { answer: answer(), window: window(i), outOfPlace: before(bestStart) },
        overlay: { label: 'best sum ending here', values: [...ending], pointers: { i } },
        ops,
        vars: { best, bestStart, bestEnd, current, i },
      };
    }
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'done',
    note: `The scan reached the end. The best subarray is indices ${bestStart} to ${bestEnd}, summing to ${best}, found after ${ops} step${ops === 1 ? '' : 's'}. Every position was visited once and the overlay row shows the best sum ending there — no position was ever revisited, which is where the linearity comes from.`,
    values: [...values],
    pointers: { i: bestEnd, start: bestStart },
    highlight: { answer: answer(), sorted: range(0, n) },
    overlay: { label: 'best sum ending here', values: [...ending], pointers: { i: n - 1 } },
    result: 'found',
    ops,
    vars: { best, bestStart, bestEnd, ops },
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

const JS = `function kadane(a) {
  if (a.length === 0) return 0;                        // @anchor start
  let current = a[0], best = a[0];
  let start = 0, bestStart = 0;
  for (let i = 1; i < a.length; i++) {
    if (current < 0) {                                 // @anchor reset
      current = a[i];
      start = i;
    } else {
      current = current + a[i];                        // @anchor extend
    }
    if (current > best) {                              // @anchor update
      best = current;
      bestStart = start;
    }
  }
  return best;                                         // @anchor done
}`;

const PY = `def kadane(a):
    if not a:                                          # @anchor start
        return 0
    current = best = a[0]
    start = best_start = 0
    for i in range(1, len(a)):
        if current < 0:                                # @anchor reset
            current = a[i]
            start = i
        else:
            current = current + a[i]                   # @anchor extend
        if current > best:                             # @anchor update
            best = current
            best_start = start
    return best                                        # @anchor done`;

const JAVA = `class Kadane {
    static int kadane(int[] a) {
        if (a.length == 0) return 0;                   // @anchor start
        int current = a[0], best = a[0];
        int start = 0, bestStart = 0;
        for (int i = 1; i < a.length; i++) {
            if (current < 0) {                         // @anchor reset
                current = a[i];
                start = i;
            } else {
                current = current + a[i];              // @anchor extend
            }
            if (current > best) {                      // @anchor update
                best = current;
                bestStart = start;
            }
        }
        return best;                                   // @anchor done
    }
}`;

const CPP = `#include <vector>
using std::vector;

int kadane(const vector<int>& a) {
    if (a.empty()) return 0;                            // @anchor start
    int current = a[0], best = a[0];
    int start = 0, bestStart = 0;
    for (int i = 1; i < (int)a.size(); i++) {
        if (current < 0) {                              // @anchor reset
            current = a[i];
            start = i;
        } else {
            current = current + a[i];                   // @anchor extend
        }
        if (current > best) {                           // @anchor update
            best = current;
            bestStart = start;
        }
    }
    return best;                                        // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'The empty guard exists only so `a[0]` is safe, and it is the reason the answer for an empty array is 0 rather than undefined. Seeding `best` with `a[0]` rather than 0 is the second half of the same line and is what makes the all-negative case come out right.',
    python:
      '`if not a:` is a truthiness test, so it is true for an empty list and false for a list containing a single 0 — which is a genuine trap when the array is generated. `current = best = a[0]` chains two assignments to one value, so both names point at the same immutable integer; there is no aliasing risk because ints are immutable in Python.',
    java: 'Two `int`s seeded from the same cell. Java arrays are fixed size but their elements are mutable, so `a[0]` is a read that costs the same as any other — unlike C++, where the same read on a `vector<int>` is also free but on a `std::deque` would not be.',
    cpp: "`a.empty()` rather than `a.size() == 0`: the container concept has a dedicated predicate for it, and `empty()` is guaranteed to be O(1) even for a container where `size()` might not be. The `const vector<int>&` means the caller's data is read, never written, and never copied.",
  },
  reset: {
    javascript:
      'A negative running sum is worse than useless: every future total it takes part in is dragged down by it, so it is dropped along with the *entire range* that produced it. Note that `start` moves at the same time as `current` — resetting one without the other leaves a `current` that no longer belongs to any subarray of the array.',
    python:
      'The test is `current < 0`, not `<= 0`, and that is a real distinction: a running sum of exactly 0 does no harm, so throwing it away throws away a window that was fine. Python writes the branch out as a statement and needs no `begin`/`end` to close it, where Java and C++ do — which is why this step is three lines here and seven there.',
    java: 'The test is `current < 0`, not `<= 0`: a running sum of exactly 0 costs nothing and may as well be kept, so discarding it would only shrink the search. This is the one branch the all-positive preset never reaches, and the one the all-negative preset reaches at every single step.',
    cpp: 'The test is `current < 0`, not `<= 0`, for the same reason in all four languages — the algorithm is the same algorithm, and the boundary case is part of it. What differs is the loop scaffolding: C++ needs braces and a semicolon here, where Python needs neither, and that is the entire ergonomic gap between the two listings.',
  },
  extend: {
    javascript:
      'The positive case: keeping the previous window pays off, so the sum grows by one more element and `start` stays where it is. This is the branch that surprises people — a large negative in the middle of the array is *not* automatically a place to restart, only if it makes the running total itself negative.',
    python:
      'The positive case, and the reason this algorithm is not the "restart at every negative number" heuristic it gets mistaken for. Here the decision has already been made by the test above, and this line only does the addition; splitting the two steps is what lets the visualiser show you which decision produced which sum.',
    java: 'The positive case. `current + a[i]` can overflow `int` for long arrays even when every individual value is small, so a production version would accumulate in `long` — the O(n) cost would be identical and the O(1) space claim would be unaffected.',
    cpp: 'The positive case. Note that the array is never modified, so the `const` reference stays honest: Kadane is a read-only pass, and an `int` overflow here is a signed-overflow undefined behaviour rather than a Java-style wrap, which is a stronger promise of disaster and a weaker promise of predictability.',
  },
  update: {
    javascript:
      'Recording the range and not just the sum. This line is the difference between "the maximum subarray sum is 23" and "the maximum subarray sum is 23, at indices 1 to 8" — and the strict `>` is why the *first* window to reach a given total is the one kept, which matters when several ranges tie.',
    python:
      'Recording the range, not just the sum. A caller asking "which subarray" needs `best_start` and the length, and the pair is the smallest amount of state that answers it. A strict `>` keeps the earliest of several tied ranges, so the answer is deterministic without any tie-breaking rule.',
    java: 'Recording the range. `bestStart` is not returned by this function — the return type is a bare `int` so all four languages agree on the shape — but it is computed because the cost of tracking it is one integer and the cost of not tracking it is a second pass nobody wants to write.',
    cpp: 'Recording the range, at the cost of one extra `int` that the return value does not use. That is a deliberate trade: a real caller usually wants the subarray, not just its sum, and the O(1) space claim is unaffected by holding on to two more indices.',
  },
  done: {
    javascript:
      'One integer back, and the overlay row is the proof of the complexity claim rather than part of it: one value per position, discovered left to right, and no position revisited. Kadane is O(n) not because it is clever but because it only ever has one candidate alive at a time.',
    python:
      'One integer back. The same algorithm written as `max(a[i], current + a[i])` is the one-liner everyone remembers, and it is genuinely the same thing — the branch above exists only so the trace can show *which* of the two candidates won at each step.',
    java: 'One integer back, with no array allocated anywhere in the method, so the constant space is structural. The class-and-static-method shape is only there so the verification harness has something to call: as free code this would be a static method on a utility class, or a local function.',
    cpp: 'One integer back, with nothing retained. The alternative formulation — a `vector<int>` of best-sums-ending-here, which is what the overlay row draws — costs O(n) space and is the version to reach for when the caller wants the running values rather than the answer.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'kadane',
    python: 'kadane',
    java: 'Kadane.kadane',
    cpp: 'kadane',
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

/**
 * The claim, computed by exhaustive enumeration over all O(n^2) subarrays. That
 * is a genuinely different algorithm from the one-pass scan in the listings, and
 * for a ten-element array the cost is irrelevant — so this really is an
 * independent check rather than a transcription.
 */
const maxSubarrayOf = (values: number[]): number => {
  if (values.length === 0) return 0;
  let best = values[0] as number;
  for (let i = 0; i < values.length; i++) {
    let running = 0;
    for (let j = i; j < values.length; j++) {
      running += values[j] as number;
      if (running > best) best = running;
    }
  }
  return best;
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const values = valuesOf(p);
  return { presetId: p.id, args: [values], result: maxSubarrayOf(values) };
});

export const kadaneAlgo: AlgoDef<ArrayFrame> = {
  id: 'kadane',
  title: "Kadane's Algorithm",
  category: 'sliding-window',
  summary:
    'Scan left to right keeping the largest sum of any subarray that ends at the current position, throwing the running window away entirely the moment its sum turns negative.',
  intuition:
    'Reach for this the moment the question is "best contiguous stretch" over a sequence you can afford one pass over — the largest-sum trading window in a price series, the longest run of above-threshold sensor readings with the best total, the most profitable gap in a diff. What makes it worth knowing rather than deriving is the single test: a negative running sum is *always* worth discarding, together with every element that built it, which means the search never needs to look back. The same structure solves "minimum sum subarray" (flip the signs) and "longest subarray with sum at most k" is the harder cousin that needs more than one candidate alive.',
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    note: 'Linear in every case, which is unusual for a maximum-subarray problem where the brute force is O(n^2) — and it stays O(1) space only because exactly one candidate window is kept alive. The number of *distinct* subarrays that were ever "the best ending here" is n, and the overlay row is the honest picture of that; storing it costs O(n) and is the version to use when the caller wants the running values.',
  },
  traits: {
    inPlace: true,
    online: true,
    allowsDuplicates: true,
    tags: ['single pass', 'no extra space', 'returns a range', 'negative numbers'],
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
      default: 10,
      regeneratesInput: true,
      help: 'Past 150 elements the cells get too small to read, and a long run can hit the frame cap and stop early.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: kadane,
  lesson,
  expectations,
  formatResult: (r) => `best sum ${r as number}`,
  anchors: ['start', 'reset', 'extend', 'update', 'done'],
};

export default kadaneAlgo;
