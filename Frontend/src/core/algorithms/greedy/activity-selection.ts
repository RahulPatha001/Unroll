import { byLanguage } from '../../code/anchors.ts';
import { randomArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Activity Selection — the exchange argument in its smallest form.
 *
 * Every interval-selection problem in this family is this one plus an extra
 * weight. The greedy is: take the interval that finishes earliest, then repeat
 * on what starts after it. The proof is an exchange argument that fits in one
 * sentence — in any optimal schedule, replace its first interval with the
 * earliest-finishing one and nothing afterwards can start earlier than before,
 * so no interval is lost. That single swap is the entire reason the greedy is
 * safe, and it is also why this problem has *no* dynamic-programming version
 * worth writing: there is nothing to remember.
 *
 * Two things are on screen at once, which the array viewport can do with an
 * overlay row. The main row holds the finish times — the values the greedy
 * actually compares — and the row underneath holds the start times, because the
 * decision `start >= lastFinish` is otherwise invisible: you cannot see what
 * you are comparing without them.
 *
 * The intervals arrive sorted by finish time, which is sorting done during input
 * construction rather than inside the algorithm, for the same reason the
 * two-pointer family sorts: the sort is not the lesson, and the greedy choice is.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 1515;

const sortedOf = (values: number[]): number[] => [...values].sort((a, b) => a - b);

/** Derive plausible start times from generated finish times, so start < finish always. */
const startsBefore = (finishes: number[], slack: number): number[] =>
  finishes.map((f, i) => Math.max(0, f - 1 - ((i + slack) % 3)));

/** Interleaved, so some overlap and some do not. */
const MIXED_FINISH = sortedOf(randomArray(SEED + 8, 7, 2, 30));
/** Finish times far apart with starts at 0, 1, 2, ... so every pair overlaps. */
const NESTED_FINISH = sortedOf(randomArray(SEED, 5, 10, 25));
/** Each interval starts exactly where the previous one finished. */
const CHAIN_FINISH = sortedOf(randomArray(SEED + 4, 6, 3, 28));
const SINGLE_FINISH = sortedOf(randomArray(SEED + 12, 1, 2, 20));

const PRESETS: Preset[] = [
  {
    id: 'mixed',
    label: 'Some overlap, some do not',
    blurb:
      'Seven intervals of mixed length. Four get picked and three are skipped, and the skips are the lesson: an interval that starts before the last finish is not wasted work, it is a decision that the earliest-finishing interval in hand beats it.',
    input: { type: 'numbers', values: MIXED_FINISH },
    params: { startTimes: startsBefore(MIXED_FINISH, 0).join(',') },
  },
  {
    id: 'all-overlap',
    label: 'Everything overlaps',
    blurb:
      'Every interval starts within the first five units and none finishes before the tenth, so all five overlap every other. The greedy picks exactly one — the earliest finisher — and the answer is the smallest it can possibly be.',
    input: { type: 'numbers', values: NESTED_FINISH },
    params: { startTimes: NESTED_FINISH.map((_, i) => i).join(',') },
  },
  {
    id: 'back-to-back',
    label: 'Back to back',
    blurb:
      'Every interval starts exactly where the previous one finished, so all six can be taken. This preset exists for one character: the test is `start >= lastFinish`, not `start > lastFinish`. Writing `>` loses the last interval every single time.',
    input: { type: 'numbers', values: CHAIN_FINISH },
    params: { startTimes: [0, ...CHAIN_FINISH.slice(0, -1)].join(',') },
  },
  {
    id: 'single',
    label: 'One interval',
    blurb:
      'A single interval, which is always compatible with itself. The degenerate case matters because `lastFinish` has to be initialised to something before the loop, and on this input the initialisation is what decides the answer.',
    input: { type: 'numbers', values: SINGLE_FINISH },
    params: { startTimes: '0' },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

/** `"1,3,4,8"` → `[1, 3, 4, 8]`, so the start times live in a text param. */
const parseTimes = (raw: unknown, count: number): number[] => {
  const parsed = String(raw ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n));
  return Array.from({ length: count }, (_, i) => parsed[i] ?? 0);
};

export function* activitySelection(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const size = Number(ctx.params.size ?? source.length);
  // Sorted by finish time: the greedy's precondition, applied on the way in so
  // the trace can show the choice rather than the sort.
  const values = sortedOf(source).slice(0, Math.max(0, size));
  const n = values.length;
  const starts = parseTimes(ctx.params.startTimes, n);

  let ops = 0;
  /** Finish time of the last interval taken; an interval must start at or after it. */
  let lastFinish = Number.NEGATIVE_INFINITY;
  let count = 0;
  const picked: number[] = [];
  const startRow = {
    label: 'start times',
    values: starts,
    mode: 'number' as const,
  };

  const cursor = (i: number): Record<string, number> => (n > 0 ? { i } : {});

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    note:
      n === 0
        ? 'No intervals at all, so there is nothing to schedule and the answer is 0.'
        : `Sorted by finish time, because that is the order the greedy needs. Start times are on the row underneath. The rule: take the first interval, then take each later interval whose start is at or after the finish of the last one taken.`,
    values: [...values],
    pointers: cursor(0),
    highlight: { unvisited: range(0, n) },
    overlay: { ...startRow, pointers: cursor(0) },
    vars: { n, lastFinish: 'none yet', count },
  };

  for (let i = 0; i < n; i++) {
    if (ctx.shouldStop()) return;
    ops++;
    const finish = values[i] as number;
    const start = starts[i] as number;
    const fits = start >= lastFinish;
    /** The boundary as it was *before* this step, so the note can quote it. */
    const boundary = lastFinish;

    if (fits) {
      const first = picked.length === 0;
      lastFinish = finish;
      count = count + 1;
      picked.push(i);
      yield {
        kind: 'array',
        index: 0,
        anchor: 'pick',
        caption: `Interval ${i + 1} of ${n}`,
        note: first
          ? `Take it. The first interval is taken unconditionally — there is nothing to be compatible with yet, and taking the earliest finisher is what leaves the most room for everything after it. Running total: ${count}.`
          : `It starts at ${start}, which is at or after the last finish of ${boundary}, so it fits. Take it and move the boundary to ${finish}. Running total: ${count}.`,
        values: [...values],
        pointers: cursor(i),
        highlight: { picked: [...picked], current: [i], unvisited: range(i + 1, n) },
        overlay: { ...startRow, pointers: cursor(i) },
        ops,
        vars: { i, start, finish, lastFinish: finish, count },
      };
    } else {
      yield {
        kind: 'array',
        index: 0,
        anchor: 'skip',
        caption: `Interval ${i + 1} of ${n}`,
        note: `It starts at ${start}, before the last finish of ${boundary}, so it overlaps something already taken and cannot be scheduled. Skip it — and note what skipping costs: nothing, because the interval already taken finishes at ${boundary}, which is no later than this one's ${finish}.`,
        values: [...values],
        pointers: cursor(i),
        highlight: { picked: [...picked], compare: [i], unvisited: range(i + 1, n) },
        overlay: { ...startRow, pointers: cursor(i) },
        ops,
        vars: { i, start, finish, lastFinish: boundary, count },
      };
    }
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'done',
    note:
      count === 0
        ? 'Nothing could be taken, which happens only for an empty input. The answer is 0.'
        : `${count} of ${n} interval${n === 1 ? '' : 's'} scheduled, and that is the maximum possible: each time the greedy took an interval it took the earliest finisher available, which is the exchange argument. The chosen finishes were ${picked.map((i) => values[i] as number).join(', ')}.`,
    values: [...values],
    pointers: cursor(n > 0 ? n - 1 : 0),
    highlight: { picked: [...picked], unvisited: [] },
    overlay: { ...startRow, pointers: cursor(n > 0 ? n - 1 : 0) },
    result: 'found',
    ops,
    vars: { count, ops, n },
  };
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Finish times (sorted)',
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

const JS = `function activitySelection(start, finish) {
  let lastFinish = -Infinity, count = 0;            // @anchor start
  for (let i = 0; i < finish.length; i++) {
    if (start[i] >= lastFinish) {                    // @anchor pick
      count++;
      lastFinish = finish[i];
    }
    // otherwise: this interval overlaps the last one taken, skip it.   // @anchor skip
  }
  return count;                                      // @anchor done
}`;

const PY = `def activity_selection(start, finish):
    last_finish = float("-inf")                      # @anchor start
    count = 0
    for i in range(len(finish)):
        if start[i] >= last_finish:                 # @anchor pick
            count += 1
            last_finish = finish[i]
        # otherwise this interval overlaps the last one taken:  # @anchor skip
        # skip it
    return count                                     # @anchor done`;

const JAVA = `class ActivitySelection {
    static int activitySelection(int[] start, int[] finish) {
        int lastFinish = Integer.MIN_VALUE, count = 0;  // @anchor start
        for (int i = 0; i < finish.length; i++) {
            if (start[i] >= lastFinish) {               // @anchor pick
                count++;
                lastFinish = finish[i];
            }
            // otherwise: overlaps the last one taken, skip it.  // @anchor skip
        }
        return count;                                   // @anchor done
    }
}`;

const CPP = `#include <climits>
#include <vector>
using std::vector;

int activity_selection(const vector<int>& start, const vector<int>& finish) {
    int lastFinish = INT_MIN, count = 0;                 // @anchor start
    for (int i = 0; i < (int)finish.size(); i++) {
        if (start[i] >= lastFinish) {                    // @anchor pick
            count++;
            lastFinish = finish[i];
        }
        // otherwise: overlaps the last one taken, skip it.   // @anchor skip
    }
    return count;                                        // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'The boundary starts at negative infinity, not at 0, which is deliberate: intervals may legitimately start before time zero, and seeding with 0 would silently reject the first one. A `let` binding rather than a `const` because this is the one line written to later. The loop below walks the *finish* times while the body compares a start against the boundary, and that asymmetry is the algorithm: the order is set by the value being minimised, and the value being minimised is the finish time.',
    python:
      '`float("-inf")` rather than `-1` or `0`, and the reason is a real one — a sentinel that could coincide with a legitimate value is a bug waiting for a negative start time. Python has a dedicated infinity literal, where JavaScript only gets one from the `Number` namespace and Java and C++ only from a constant in their standard library. The loop walks the finish list and shares its index with the start list, so the two must be parallel — a precondition the caller has to guarantee.',
    java: '`Integer.MIN_VALUE`, the smallest `int` there is, for exactly the reason the other three use negative infinity: a sentinel smaller than any real start time, so the first interval always passes. It is less obviously correct than the others, and a comment saying why is not optional in real code. The loop walks `finish.length` and indexes both arrays with the same `i`, so the two must be the same length and parallel — a production version would validate that.',
    cpp: '`INT_MIN` from `<climits>`, the same reasoning as the Java line: the smallest representable `int`, so the first interval always fits. This is a C-style limit macro rather than a `constexpr` in a namespace, a fossil of a time before C++ had a proper numeric limits facility — `std::numeric_limits<int>::min()` is the modern spelling. The loop walks the finish vector and indexes both vectors with the same `i`, so zipping the two into `vector<pair<int,int>>` on the way in would move that precondition somewhere it can be checked once.',
  },
  pick: {
    javascript:
      'The greedy choice, and `>=` rather than `>` is the whole boundary condition. An interval starting exactly where the last one ends is compatible, and the `back-to-back` preset exists to make the cost of writing `>` visible: it loses the final interval every time without ever looking wrong.',
    python:
      'The greedy choice. Note what the code does *not* do: it does not compare this interval against every previously taken one. Compatibility with the last taken interval is enough, because the chosen finishes are increasing by construction, so compatibility with the last implies compatibility with all of them.',
    java: 'The greedy choice. `>=` rather than `>` is the boundary, and it is the one character most likely to be wrong in a hand-written version of this function. The exchange argument that justifies taking this interval at all — replacing the first interval of any optimal schedule with the earliest finisher costs nothing later — is not visible in the code and belongs in the note.',
    cpp: 'The greedy choice, with `>=` rather than `>`. A C++ caller with a vector of pairs would write `intervals[i].second <= ...` on the other side of the same comparison; keeping the boundary on the start time is what makes the two argument orders of this function produce identical results, which is worth checking rather than assuming.',
  },
  skip: {
    javascript:
      'The skipped case, which is not a branch at all — the `if` simply does not fire and the loop moves on. That is what "skip" means here: no work, no bookkeeping, no change to the boundary. The reason skipping is free is on the previous line: the interval in hand finishes no later than this one does.',
    python:
      'The skipped case, and in Python it is only a comment — the `if` does not fire and the loop body ends. The exchange argument in one sentence: replacing the first interval of an optimal schedule with the earliest finisher cannot push any later interval out, so the greedy is optimal and no dynamic programming is needed.',
    java: 'The skipped case, and again there is no branch — an `if` with a single body and no `else` is the whole implementation. This is the reason the algorithm is O(n) after the sort: every interval is examined once and at most two lines of work happen for it.',
    cpp: 'The skipped case, and the absence of an `else` is the design. Adding one to record *why* an interval was skipped would be fine, but adding a second scan of the picked set to check compatibility would turn O(n) into O(n^2) — and it would be redundant, since the picked finishes are increasing.',
  },
  done: {
    javascript:
      'A count, not the intervals themselves. That is a real limitation: the count is the same whichever of several equally good schedules the greedy builds, and a caller who needs the schedule has to re-run the loop recording indices. Returning the count keeps the return type identical in all four languages, which is worth more here than convenience.',
    python:
      'A count, matching the other three. A Python caller who wants the schedule would `append` inside the `if` and return the list, and that would be the better API — but then Java would need an `int[]` out-parameter or a `List<Integer>`, and the four listings would stop being line-for-line comparable.',
    java: 'A count, and the reason is portability: `int` is the only return type all four languages can produce identically. A `List<Integer>` would also work in Java and Python, and C++ would return a `vector<int>`, but the harness compares the JSON shapes, and a bare number is the one shape with no ambiguity about ordering or length.',
    cpp: 'A count. A C++ implementation could return `vector<int>` of the chosen indices at the cost of one push_back per pick, and honestly should — the greedy already knows them. What it could not do cheaply is return *intervals*, because the two input vectors are const references the caller may not want copied.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'activitySelection',
    python: 'activity_selection',
    java: 'ActivitySelection.activitySelection',
    cpp: 'activity_selection',
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

const finishOf = (p: Preset): number[] => (p.input.type === 'numbers' ? p.input.values : []);
const startOf = (p: Preset, n: number): number[] => {
  const raw = String(p.params?.startTimes ?? '');
  const parsed = raw
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((x) => Number.isFinite(x));
  return Array.from({ length: n }, (_, i) => parsed[i] ?? 0);
};

/**
 * The claim, computed by the O(n^2) dynamic program rather than the greedy:
 * sort by finish time, then for each interval ask whether taking it plus the
 * best schedule that fits before it beats skipping it. Independent of the
 * exchange argument being verified, and it agrees with the greedy because both
 * are optimal — not because they are the same code.
 */
const scheduleSizeOf = (start: number[], finish: number[]): number => {
  const order = finish
    .map((_, i) => i)
    .sort((a, b) => (finish[a] as number) - (finish[b] as number));
  const m = order.length;
  const dp = new Array<number>(m + 1).fill(0);
  for (let k = 1; k <= m; k++) {
    const i = order[k - 1] as number;
    let compatible = 0;
    for (let j = 0; j < k - 1; j++) {
      if ((finish[order[j] as number] as number) <= (start[i] as number)) compatible = j + 1;
    }
    dp[k] = Math.max(dp[k - 1] as number, (dp[compatible] as number) + 1);
  }
  return dp[m] as number;
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const finish = finishOf(p);
  const start = startOf(p, finish.length);
  return { presetId: p.id, args: [start, finish], result: scheduleSizeOf(start, finish) };
});

export const activitySelectionAlgo: AlgoDef<ArrayFrame> = {
  id: 'activity-selection',
  title: 'Activity Selection',
  category: 'greedy',
  summary:
    'Take the interval that finishes earliest, then take each later interval that starts at or after the finish of the last one taken — a greedy whose exchange argument is one sentence long and needs no dynamic programming.',
  intuition:
    'Reach for this whenever you are packing as many fixed-length events as possible into a day with no dependencies between them — booking meeting rooms, scheduling interviews, fitting as many jobs as possible onto one machine, choosing ad slots. The reason it is worth knowing cold is that the "obvious" version people write first — sort by start time, take anything that fits — is *not* optimal, and the difference shows up as soon as one long event starts early and blocks four short ones after it. The extra insight is that there is no dynamic-programming version worth writing here, which is unusual in scheduling and worth recognising: greedy is optimal exactly when nothing is weighted and nothing depends on anything else.',
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    note: 'O(n) *after* the sort, and the sort is not free: the algorithm as written assumes intervals arrive ordered by finish time, and this module does that sorting during input construction so the trace shows the greedy rather than the sort. With the sort included this is O(n log n), and the space is O(1) only because the sort is not being counted — an in-place sort such as heapsort would make the whole thing O(1) space.',
  },
  traits: {
    inPlace: true,
    offline: true,
    allowsDuplicates: true,
    tags: ['read-only', 'no extra space', 'pre-sorted input', 'greedy is provably optimal'],
  },
  viewport: 'array',
  level: 'intro',
  params: [
    {
      key: 'size',
      label: 'Intervals',
      kind: 'number',
      min: 1,
      max: 60,
      step: 1,
      default: 8,
      regeneratesInput: true,
      help: 'Beyond 60 the viewport switches to canvas.',
    },
    {
      key: 'startTimes',
      label: 'Start times',
      kind: 'text',
      default: '0,1,2,3,4,5,6,7',
      help: 'Comma separated, parallel to the finish times above. A missing entry counts as 0.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: activitySelection,
  lesson,
  expectations,
  formatResult: (r) => `${r as number} activities scheduled`,
  anchors: ['start', 'pick', 'skip', 'done'],
};

export default activitySelectionAlgo;
