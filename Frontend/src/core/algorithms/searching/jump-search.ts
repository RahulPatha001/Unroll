import { byLanguage } from '../../code/anchors.ts';
import { distinctArray, randomArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Jump Search — skip over blocks, then look inside one.
 *
 * The observation is purely arithmetic: in a sorted array of `n` elements, a
 * linear scan costs n comparisons, and comparing just the *last* element of
 * every √n-sized block costs only √n of them. Do that first, land inside or
 * just past the right block, then scan the ≤ √n cells of that one block. The
 * total is √n + √n, which is O(√n) — much worse than binary search's log n, but
 * the one property that makes it worth knowing is that it makes **no branches**,
 * so it is the friendly algorithm for branch-predictor-hostile, cache-oblivious
 * or SIMD hardware.
 *
 * The `overlay` row holds the *block boundaries* — the index each block ends on.
 * Without it the jumps are invisible, because the main array looks identical
 * before and after a jump. With it you can see which fence post the cursor is
 * standing on.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 503;

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

const UNIQUE = sortedOf(distinctArray(SEED, 12, 1, 140));
const TIES = withTie(distinctArray(SEED + 4, 10, 1, 90), 0);
const SPARSE = sortedOf(distinctArray(SEED + 8, 11, 1, 200));
const DENSE = sortedOf(randomArray(SEED + 12, 10, 5, 95));
const TOPEND = sortedOf(distinctArray(SEED + 16, 12, 1, 160));

const PRESETS: Preset[] = [
  {
    id: 'hit-first-block',
    label: 'Found in block 0',
    blurb:
      'The very first fence post is already too small, so the cursor jumps straight to block 0 and the target turns up in the first two or three cells of the scan.',
    input: { type: 'numbers', values: UNIQUE },
    params: { size: UNIQUE.length, target: UNIQUE[1] as number },
  },
  {
    id: 'hit-last-block',
    label: 'Found in the last block',
    blurb:
      'The target is in the final, short block. Every earlier block is skipped with a single comparison, which is the best case for the jump phase.',
    input: { type: 'numbers', values: SPARSE },
    params: { size: SPARSE.length, target: SPARSE[SPARSE.length - 1] as number },
  },
  {
    id: 'ties',
    label: 'Lots of ties',
    blurb:
      'Four distinct values across 13 cells, so a whole block can be equal to the target. The block scan returns the first cell of that block, and the block phase is almost useless at telling them apart.',
    input: { type: 'numbers', values: TIES },
    params: { size: TIES.length, target: TIES[6] as number },
  },
  {
    id: 'not-in-array',
    label: 'Not found',
    blurb:
      'The target sits in a gap, so the jump phase lands on the block that must contain it, the block scan walks all of it, and the answer is -1. The most expensive path.',
    input: { type: 'numbers', values: DENSE },
    params: { size: DENSE.length, target: missingBetween(DENSE) },
  },
  {
    id: 'past-end',
    label: 'Past the end',
    blurb:
      'The target is bigger than every value, so the jump phase walks off the end of the block list. There is no block to scan, and the search returns -1 after only √n comparisons.',
    input: { type: 'numbers', values: TOPEND },
    params: { size: TOPEND.length, target: 999 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

export function* jumpSearch(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const size = Number(ctx.params.size ?? input.values.length);
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const values = [...source].slice(0, Math.max(0, size));
  const n = values.length;
  const target = Number(ctx.params.target ?? 0);

  const step = Math.max(1, Math.floor(Math.sqrt(n)));
  /** The last index of every block — the overlay row, and the whole algorithm. */
  const blocks = Array.from(
    { length: Math.ceil(n / step) },
    (_, b) => Math.min((b + 1) * step, n) - 1,
  );

  let ops = 0;
  let block = 0;

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    note:
      n < 1
        ? 'The array is empty, so there are no blocks to step over. Not found.'
        : `Looking for ${target} in ${n} sorted value${n === 1 ? '' : 's'}, cut into ${blocks.length} block${blocks.length === 1 ? '' : 's'} of ${step}. The overlay row is the last index of each block — the only ${blocks.length} cells the first phase will ever look at.`,
    values: [...values],
    highlight: { window: range(0, n) },
    overlay: { label: `block ends (step ${step})`, values: [...blocks], pointers: {} },
    vars: { step, blocks: blocks.length, target, n },
  };

  // ---- phase 1: leapfrog over whole blocks -----------------------------

  // An empty array has no blocks, and `blocks[0]` would be `undefined` — which
  // is why the guard is on the block count and not on the cursor.
  while (block < blocks.length) {
    if (ctx.shouldStop()) return;
    const end = blocks[block] as number;
    const endValue = values[end] as number;
    const keepGoing = endValue < target;

    ops++;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'jump',
      caption: `Block ${block + 1} of ${blocks.length}`,
      note: `Check the last cell of block ${block}, index ${end}: ${endValue} against a target of ${target}. ${keepGoing ? 'Too small, so the answer — if it exists — is in a later block. Jump the whole block in one comparison.' : 'Big enough, so this block is where the answer has to be, if it is here at all.'}`,
      values: [...values],
      pointers: { cursor: end },
      highlight: { compare: [end], window: range(0, n), frontier: range(block * step, end + 1) },
      overlay: {
        label: `block ends (step ${step})`,
        values: [...blocks],
        pointers: { block },
      },
      ops,
      vars: { block, end, endValue, step, target },
    };

    if (!keepGoing) break;
    block++;
    if (block >= blocks.length) break;
  }

  if (block >= blocks.length) {
    yield {
      kind: 'array',
      index: 0,
      anchor: 'past-end',
      caption: `Block ${blocks.length} of ${blocks.length}`,
      note: `The cursor walked past block ${blocks.length - 1}, whose last value ${values[n - 1] as number} is still smaller than ${target}. There is no block left to search, so the answer is -1 — and it cost only ${ops} comparison${ops === 1 ? '' : 's'}, one per block, with no scan at all.`,
      values: [...values],
      highlight: { outOfPlace: range(0, n) },
      overlay: {
        label: `block ends (step ${step})`,
        values: [...blocks],
        pointers: { block: blocks.length - 1 },
      },
      result: 'not-found',
      ops,
      vars: { block, target, ops, n },
    };
    return;
  }

  // ---- phase 2: scan the one block that could hold the answer -----------

  const lo = block * step;
  const hi = blocks[block] as number;

  yield {
    kind: 'array',
    index: 0,
    anchor: 'block-boundary',
    caption: `Block ${block + 1} of ${blocks.length}`,
    note: `Block ${block} is the first block whose last value is big enough, so if the target is present it is in [${lo}, ${hi}] — at most ${hi - lo + 1} cells, and the jump phase proved every earlier block is too small. Now scan it.`,
    values: [...values],
    pointers: { cursor: lo },
    highlight: { window: range(lo, hi + 1), outOfPlace: [...range(0, lo), ...range(hi + 1, n)] },
    overlay: { label: `block ends (step ${step})`, values: [...blocks], pointers: { block } },
    ops,
    vars: { block, lo, hi, step, target },
  };

  for (let i = lo; i <= hi; i++) {
    if (ctx.shouldStop()) return;
    ops++;
    const value = values[i] as number;
    const hit = value === target;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'scan',
      caption: `Block ${block + 1}, cell ${i - lo + 1} of ${hi - lo + 1}`,
      note: `Compare index ${i}: ${value} against the target ${target}. ${hit ? 'Equal.' : 'Not equal — and since the array is sorted, nothing later in this block can be equal either.'}`,
      values: [...values],
      pointers: { cursor: i },
      highlight: {
        compare: [i],
        window: range(lo, hi + 1),
        outOfPlace: [...range(0, lo), ...range(hi + 1, n)],
      },
      overlay: { label: `block ends (step ${step})`, values: [...blocks], pointers: { block } },
      ops,
      vars: { i, value, target, block },
    };

    if (hit) {
      yield {
        kind: 'array',
        index: 0,
        anchor: 'hit',
        caption: `Block ${block + 1}, cell ${i - lo + 1} of ${hi - lo + 1}`,
        note: `${value} equals the target at index ${i}, so the search returns ${i} after ${ops} comparison${ops === 1 ? '' : 's'} in total — ${block + 1} for the jumps and ${i - lo + 1} for the scan.`,
        values: [...values],
        pointers: { cursor: i },
        highlight: {
          answer: [i],
          window: range(lo, hi + 1),
          outOfPlace: [...range(0, lo), ...range(hi + 1, n)],
        },
        result: 'found',
        ops,
        vars: { i, target, ops, block },
      };
      return;
    }
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'exhausted',
    caption: `Block ${block + 1} of ${blocks.length}`,
    note: `The whole of block ${block}, indices ${lo} to ${hi}, has been compared and nothing matched, so the target is not in the array and the search returns -1. The jump phase had already proved every other block too small, so nothing outside this block was ever needed.`,
    values: [...values],
    pointers: { cursor: hi },
    highlight: { outOfPlace: range(0, n) },
    overlay: { label: `block ends (step ${step})`, values: [...blocks], pointers: { block } },
    result: 'not-found',
    ops,
    vars: { lo, hi, target, ops },
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

const JS = `function jumpSearch(a, target) {
  // Cut the array into blocks of about sqrt(n).         // @anchor start
  const n = a.length, step = Math.max(1, Math.floor(Math.sqrt(n)));
  let block = 0;
  while (block * step < n && a[Math.min((block + 1) * step, n) - 1] < target) { // @anchor jump
    block++;
  }
  if (block * step >= n) return -1;                     // @anchor past-end
  const lo = block * step, hi = Math.min((block + 1) * step, n) - 1;
  // One block left to scan.                             // @anchor block-boundary
  for (let i = lo; i <= hi; i++) {                      // @anchor scan
    if (a[i] === target) {
      return i;                                         // @anchor hit
    }
  }
  return -1;                                            // @anchor exhausted
}`;

const PY = `def jump_search(a, target):
    # Cut the list into blocks of about sqrt(n).          # @anchor start
    n = len(a)
    step = max(1, int(n ** 0.5))
    block = 0
    while block * step < n and a[min((block + 1) * step, n) - 1] < target:  # @anchor jump
        block += 1
    if block * step >= n:                                # @anchor past-end
        return -1
    lo, hi = block * step, min((block + 1) * step, n) - 1
    # One block left to scan.                            # @anchor block-boundary
    for i in range(lo, hi + 1):                          # @anchor scan
        if a[i] == target:
            return i                                     # @anchor hit
    return -1                                            # @anchor exhausted`;

const JAVA = `class JumpSearch {
    static int jumpSearch(int[] a, int target) {
        // Cut the array into blocks of about sqrt(n).     // @anchor start
        int n = a.length;
        int step = Math.max(1, (int) Math.sqrt(n));
        int block = 0;
        while (block * step < n && a[Math.min((block + 1) * step, n) - 1] < target) { // @anchor jump
            block++;
        }
        if (block * step >= n) return -1;                // @anchor past-end
        int lo = block * step, hi = Math.min((block + 1) * step, n) - 1;
        // One block left to scan.                        // @anchor block-boundary
        for (int i = lo; i <= hi; i++) {                 // @anchor scan
            if (a[i] == target) {
                return i;                               // @anchor hit
            }
        }
        return -1;                                       // @anchor exhausted
    }
}`;

const CPP = `#include <algorithm>
#include <cmath>
#include <vector>
using std::vector;

int jump_search(vector<int> a, int target) {
    // Cut the vector into blocks of about sqrt(n).       // @anchor start
    int n = (int)a.size();
    int step = std::max(1, (int)std::sqrt((double)n));
    int block = 0;
    while (block * step < n && a[std::min((block + 1) * step, n) - 1] < target) { // @anchor jump
        block++;
    }
    if (block * step >= n) return -1;                    // @anchor past-end
    int lo = block * step, hi = std::min((block + 1) * step, n) - 1;
    // One block left to scan.                            // @anchor block-boundary
    for (int i = lo; i <= hi; i++) {                     // @anchor scan
        if (a[i] == target) {
            return i;                                   // @anchor hit
        }
    }
    return -1;                                          // @anchor exhausted
}`;

const NOTES = {
  start: {
    javascript:
      'The block size, and the only decision in the algorithm. √n is not arbitrary: with blocks of size √n there are √n blocks, so the jump phase and the scan phase each cost about √n and the total is 2√n. `Math.max(1, ...)` is the guard for an empty array, where `sqrt(0)` is 0 and the step must still be at least 1.',
    python:
      'The block size, and the only decision in the algorithm. √n is not arbitrary: blocks of size √n give √n blocks, so each phase costs about √n and the total is 2√n. `int(n ** 0.5)` is the float-to-int conversion every language here needs, and `max(1, ...)` guards the empty case where `n ** 0.5` is 0.0.',
    java: 'The block size, and the only decision in the algorithm. `(int) Math.sqrt(n)` is the idiom: `Math.sqrt` returns a `double`, and the cast truncates. Java has no `cmath`, no `std::min` and no `Math.max`-style integer overload problem here, but it does need the explicit cast that C++ also needs and Python gets from `int()`.',
    cpp: 'The block size, and the only decision in the algorithm. `(int)std::sqrt((double)n)` needs two things C++ has and the others do not: an explicit `double` conversion for the argument, and `<cmath>`. `std::max` is a template, so `max(1, ...)` deduces `int` from the literal — the reason the `1` must not be written as `1.0`, which would deduce `double` and fail to compile.',
  },
  jump: {
    javascript:
      "The leapfrog, and the only reason this algorithm exists. One comparison of the block's *last* cell discards the entire block, so the jump phase touches only the √n fence posts instead of all n cells. Because the array is sorted, a fence post that is too small proves every cell behind it is too small too — that is the only fact the jump relies on.",
    python:
      "The leapfrog, and the only reason this algorithm exists. One comparison of the block's *last* cell discards the entire block, so the jump phase touches only the √n fence posts instead of all n cells. Sortedness is the only fact it relies on: a fence post that is too small proves every cell behind it is too small.",
    java: "The leapfrog, and the only reason this algorithm exists. One comparison of the block's *last* cell discards the entire block, so the jump phase touches only the √n fence posts instead of all n cells. The doubled `block * step` in the index expression is a deliberate readability trade: recomputing the array bound on every iteration is free at this size.",
    cpp: "The leapfrog, and the only reason this algorithm exists. One comparison of the block's *last* cell discards the entire block, so the jump phase touches only the √n fence posts instead of all n cells. `std::min` is what keeps the index inside the vector on the final, short block — without it the last fence post would read one past the end.",
  },
  'past-end': {
    javascript:
      'The jump phase ran off the end without finding a fence post that was big enough, which is a proof of absence: every cell in the array is smaller than the target, because the last cell is. The search returns -1 having made only √n comparisons and zero scan comparisons — the cheapest failure path in the whole family.',
    python:
      'The jump phase ran off the end without finding a fence post that was big enough, and that is a proof of absence: every cell is smaller than the target, because the last one is. The search returns -1 after only √n comparisons and no scan at all — the cheapest failure path in this family.',
    java: 'The jump phase ran off the end without finding a fence post that was big enough, and that is a proof of absence: every cell is smaller than the target, because the last one is. Note the guard `block * step >= n` rather than `block * step > n` — off by one here would mean scanning one block too many.',
    cpp: 'The jump phase ran off the end without finding a fence post that was big enough, and that is a proof of absence: every cell is smaller than the target, because the last one is. Note the guard `block * step >= n` rather than `> n`; off by one here would mean scanning one block too many.',
  },
  'block-boundary': {
    javascript:
      'The hand-off between the two phases, and where the √n becomes two √n. The jump phase has proved every cell before `lo` is too small and every cell after `hi` is too big, so the answer — if it exists — is inside a window of at most `step` cells. This is the line a reader should look at twice: it is where the "n comparisons" of a linear scan become "√n + √n".',
    python:
      'The hand-off between the two phases, and where the √n becomes two √n. The jump phase proved every cell before `lo` is too small and every cell after `hi` is too big, so the answer — if it exists — is inside a window of at most `step` cells. This is the line worth looking at twice: it is where n comparisons become √n + √n.',
    java: 'The hand-off between the two phases, and where the √n becomes two √n. The jump phase proved every cell before `lo` is too small and every cell after `hi` is too big, so the answer — if it exists — is inside a window of at most `step` cells. `lo` and `hi` are both computed from `block` and `step`, so neither can be out of range by more than the final short block.',
    cpp: 'The hand-off between the two phases, and where the √n becomes two √n. The jump phase proved every cell before `lo` is too small and every cell after `hi` is too big, so the answer — if it exists — is inside a window of at most `step` cells. `std::min` on `hi` is what makes the final, short block safe.',
  },
  scan: {
    javascript:
      'A plain linear scan — and only ever over one block, so at most √n comparisons. The loop is written as a `for` with a `let`, which scopes `i` to the loop: `i` does not survive it, and the `return` inside is the only exit that matters. This is deliberately the least clever code in the family.',
    python:
      'A plain linear scan — and only ever over one block, so at most √n comparisons. `range(lo, hi + 1)` is half-open, so the `+ 1` is not optional: dropping it would silently skip the last cell of the block and turn a hit into a miss. Nothing here is clever, and that is the point.',
    java: 'A plain linear scan — and only ever over one block, so at most √n comparisons. Java\'s enhanced `for` cannot be used here, because the window is a sub-range rather than the whole array; a plain index `for` is the only form that expresses "scan from `lo` to `hi`".',
    cpp: "A plain linear scan — and only ever over one block, so at most √n comparisons. Nothing here is clever, and that is the point: jump search's appeal is precisely that the second phase is dumb enough for a compiler to unroll and vectorise, which is why it survives on hardware where a branchy binary search does not.",
  },
  hit: {
    javascript:
      "The return, and the total cost is already spent: `block + 1` comparisons to find the block, `i - lo + 1` to find the value inside it. Neither number is small enough to matter next to binary search's log n, which is exactly why jump search is not the algorithm you should reach for by default.",
    python:
      "The return, and the total cost is already spent: `block + 1` comparisons to find the block, `i - lo + 1` to find the value inside it. Neither is small next to binary search's log n, which is why jump search is the algorithm you reach for on branch-unfriendly hardware rather than the one you reach for by default.",
    java: "The return, and the total cost is already spent: `block + 1` comparisons to find the block, `i - lo + 1` to find the value inside it. Neither is small next to binary search's log n — jump search is the algorithm you reach for on branch-unfriendly hardware, not the one you reach for by default.",
    cpp: "The return, and the total cost is already spent: `block + 1` comparisons to find the block, `i - lo + 1` to find the value inside it. Neither is small next to binary search's log n, which is the honest summary of this algorithm: √n beats n, and loses to log n.",
  },
  exhausted: {
    javascript:
      'The block scan ran out without a match, and because the jump phase had already eliminated every other block, that is a proof the target is not in the array. Both failure paths return -1, the same sentinel linear search and binary search use — which is the one thing all four algorithms in this family agree on.',
    python:
      'The block scan ran out without a match, and because the jump phase had already eliminated every other block, that is a proof the target is not in the array. Both failure paths return -1, the same sentinel the rest of this family uses — the one thing all of them agree on.',
    java: 'The block scan ran out without a match, and because the jump phase had already eliminated every other block, that is a proof the target is not in the array. Both failure paths return -1, the same sentinel the rest of this family uses — the one thing all of them agree on.',
    cpp: 'The block scan ran out without a match, and because the jump phase had already eliminated every other block, that is a proof the target is not in the array. Both failure paths return -1, the same sentinel the rest of this family uses. C++ could return `std::optional<int>` and put that fact in the type instead of in a comment.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'jumpSearch',
    python: 'jump_search',
    java: 'JumpSearch.jumpSearch',
    cpp: 'jump_search',
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

export const jumpSearchAlgo: AlgoDef<ArrayFrame> = {
  id: 'jump-search',
  title: 'Jump Search',
  category: 'searching',
  summary:
    'Compare only the last cell of each √n-sized block to skip whole blocks, then linearly scan the one block that could hold the target.',
  intuition:
    "Reach for it on hardware where branches are expensive and memory access is predictable — GPU-ish or DSP code, some branchless kernels, or an architecture with a very short branch-miss penalty, where binary search's unpredictable `if` is a real cost and jump search's sequential reads are not. On an ordinary CPU with a decent cache you should use binary search: log n beats √n by an enormous margin. The teaching value is the block arithmetic, which shows up later in every bucketed hash table and every √n decomposition.",
  complexity: {
    best: 'O(1)',
    average: 'O(sqrt n)',
    worst: 'O(sqrt n)',
    space: 'O(1)',
    note: '√n for the jumps plus √n for the scan, so the worst case is 2√n. Strictly worse than binary search asymptotically, and its real virtue is that it makes no data-dependent branches — which is a hardware argument, not a complexity one.',
  },
  traits: {
    stable: false,
    inPlace: true,
    online: false,
    allowsDuplicates: true,
    tags: ['sorted input', 'sqrt decomposition', 'branch friendly'],
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
      help: 'Above every element the jump phase runs off the end and returns -1 after only sqrt(n) comparisons.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: jumpSearch,
  lesson,
  expectations,
  formatResult: (r) => ((r as number) < 0 ? 'not found (-1)' : `index ${r as number}`),
  anchors: ['start', 'jump', 'past-end', 'block-boundary', 'scan', 'hit', 'exhausted'],
};

export default jumpSearchAlgo;
