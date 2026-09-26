import { byLanguage } from '../../code/anchors.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isKeys } from '../../input/types.ts';
import type { CellValue, GridFrame, Highlight } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Rod Cutting — the classic DP that shows up in interviews and then in real
 * pricing code, and the one where the *table orientation* is a genuine design
 * decision rather than a convention.
 *
 * Rows are rod lengths, columns are "the longest piece I am allowed to cut".
 * That orientation is what makes the two candidate sources genuinely different:
 *
 *   `fromLeft` — do not cut a piece of length p at all, so the answer is the
 *                cell to the left: same rod, one fewer piece length available;
 *   `diag`     — cut one piece of length p, add its price, and solve the
 *                leftover rod of length `len - p` with the *same* piece budget.
 *
 * Read the diagonal dependency twice: the leftover rod is shorter but the
 * budget is unchanged, which is what stops the recursion from using an
 * unbounded supply of every piece. One column, and you have the whole problem.
 *
 * The input is a list of prices indexed by piece length, so `prices[0]` is a
 * piece of length 1. The table is `(L+1) x (L+1)` and the answer is the
 * bottom-right cell.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const PRICES = [1, 5, 8, 9, 10, 17, 17, 20];

const PRESETS: Preset[] = [
  {
    id: 'classic',
    label: 'L = 4, the textbook prices',
    blurb:
      'The interview example. A rod of 4 is worth 4 + 5 = 9 as two pieces or 5 as one piece of 4 — and the table shows the single-cut option losing in every single cell, which is the surprise.',
    input: { type: 'keys', values: PRICES },
    params: { rodLength: 4, priceCount: 8 },
  },
  {
    id: 'uniform',
    label: 'Every piece worth 1',
    blurb:
      'All prices equal, so revenue equals the number of pieces and the answer is simply the rod length — reached with L pieces of length 1. A flat frontier is the honest shape for data with no structure to exploit.',
    input: { type: 'keys', values: [1, 1, 1, 1, 1, 1] },
    params: { rodLength: 6, priceCount: 6 },
  },
  {
    id: 'short-pieces',
    label: 'Only pieces of length 1 and 2',
    blurb:
      'Two price entries, so every column past 2 has no piece to cut and simply repeats its left neighbour. Those carried columns are what a real price list looks like, and they cost nothing.',
    input: { type: 'keys', values: [3, 5] },
    params: { rodLength: 5, priceCount: 2 },
  },
  {
    id: 'single',
    label: 'L = 1, one piece fits',
    blurb:
      'The degenerate case. One row, one column, and the base cases do all the work — which is worth seeing once, because a table of all zeros is also the correct first row for every larger input.',
    input: { type: 'keys', values: [7, 4, 9] },
    params: { rodLength: 1, priceCount: 3 },
  },
  {
    id: 'larger',
    label: 'L = 8 (the full table)',
    blurb:
      'The 9x9 table, where the diagonal cells start winning regularly. Revenue 22 out of a possible 8 — the table is how you find out that a long rod is worth roughly 2.75 per unit, not 8.',
    input: { type: 'keys', values: PRICES },
    params: { rodLength: 8, priceCount: 8 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

export function* rodCutting(ctx: RunContext): Generator<GridFrame> {
  const raw: number[] = isKeys(ctx.input) ? ctx.input.values.map((v) => Number(v)) : [];
  const all = raw.length > 0 ? raw : PRICES;
  const wanted = Math.trunc(Number(ctx.params.priceCount ?? 8)) || 8;
  const prices = all.slice(0, Math.max(1, Math.min(12, Math.min(wanted, all.length))));
  const L = Math.max(1, Math.min(12, Math.trunc(Number(ctx.params.rodLength ?? 4)) || 4));
  /** How many piece lengths actually exist in the price list. */
  const m = Math.min(prices.length, L);

  const rows = L + 1;
  const cols = L + 1;
  const cell = (row: number, col: number): number => row * cols + col;

  const dp: number[] = new Array<number>(rows * cols).fill(0);
  const tags: Record<number, string> = {};
  let ops = 0;

  const frame = (
    anchor: string,
    note: string,
    highlight: Highlight,
    vars: Record<string, CellValue | boolean>,
  ): GridFrame => ({
    kind: 'grid',
    index: 0,
    anchor,
    note,
    rows,
    cols,
    cells: [...dp],
    rowHeader: [...Array(L + 1)].map((_, r) => `L=${r}`),
    colHeader: ['', ...[...Array(L)].map((_, p) => `≤${p + 1}`)],
    mode: 'number',
    tags: { ...tags },
    highlight,
    ops,
    vars,
  });

  const rowCells = (row: number): number[] => {
    const out: number[] = [];
    for (let c = 0; c < cols; c++) out.push(cell(row, c));
    return out;
  };

  const colCells = (col: number): number[] => {
    const out: number[] = [];
    for (let r = 0; r < rows; r++) out.push(cell(r, col));
    return out;
  };

  yield frame(
    'start',
    `Row = rod length, column = the longest piece allowed, so cell (len, p) is the best revenue from a rod of length ${'len'} cut into pieces of length at most p. Column 0 is "no pieces at all", which is worth 0 everywhere. The answer is the bottom-right cell.`,
    { window: [] },
    { L, pieces: m, ops },
  );

  yield frame(
    'base',
    'Row 0 and column 0 are 0: a rod of length 0 is worth nothing, and with no pieces allowed nothing can be cut. Those are the two borders every other cell leans on, and the diagonal dependency never escapes them — `len - p` shrinks the row, `p - 1` shrinks the column.',
    { window: [...rowCells(0), ...colCells(0)] },
    { L, pieces: m, ops },
  );

  for (let len = 1; len <= L; len++) {
    for (let p = 1; p <= L; p++) {
      if (ctx.shouldStop()) return;
      ops++;

      if (p > m || p > len) {
        dp[cell(len, p)] = dp[cell(len, p - 1)] as number;
        tags[cell(len, p)] = 'fromLeft';
        yield frame(
          'carry',
          p > m
            ? `There is no piece of length ${p} in the price list at all, so this column has nothing new to offer and repeats the cell on its left. Cheap columns like these are why the answer plateaus instead of climbing all the way to the corner.`
            : `A piece of length ${p} is longer than the rod itself (length ${len}), so it cannot be cut. The cell repeats its left neighbour, and the rod has to be made of smaller pieces.`,
          { current: [cell(len, p)], path: [...rowCells(len - 1)], window: rowCells(len) },
          { len, p, ops },
        );
        continue;
      }

      const keep = dp[cell(len, p - 1)] as number;
      yield frame(
        'keep',
        `Candidate one: no piece of length ${p}, so the best is whatever the rod could make with pieces up to ${p - 1} — ${keep}. This is the cell on the left, same rod, one fewer option.`,
        { compare: [cell(len, p - 1)], current: [cell(len, p)], window: rowCells(len) },
        { len, p, keep, ops },
      );

      const price = prices[p - 1] as number;
      const cut = (dp[cell(len - p, p)] as number) + price;
      yield frame(
        'cut',
        `Candidate two: cut one piece of length ${p} for ${price}, leaving a rod of length ${len - p} that may still use pieces up to ${p}. Note the *same* column: the budget does not shrink, so this cell can chain into ${Math.floor(len / p)} copies of the same piece.`,
        { compare: [cell(len - p, p)], current: [cell(len, p)], window: rowCells(len) },
        { len, p, price, leftover: len - p, cut, ops },
      );

      const best = Math.max(keep, cut);
      dp[cell(len, p)] = best;
      tags[cell(len, p)] = cut > keep ? 'diag' : 'fromLeft';
      yield frame(
        'best',
        `Take the larger: ${cut} ${cut > keep ? '>' : '<='} ${keep}, so this cell is ${best}, taken from the ${cut > keep ? `diagonal — a piece of length ${p} really is worth cutting here` : `left — the best plan for this rod does not use a piece of length ${p} at all`}.`,
        { answer: [cell(len, p)], window: rowCells(len) },
        { len, p, keep, cut, best, ops },
      );
    }
  }

  const answer = dp[cell(L, L)] as number;
  yield frame(
    'done',
    `Bottom-right cell: ${answer}, the most a rod of length ${L} is worth. Read the last column downwards and you can see the revenue curve flattening — each extra unit of rod adds less than the one before, which is exactly why a shop that sells by the piece and a shop that sells by the length have different incentives.`,
    { answer: [cell(L, L)], window: [...rowCells(L), ...colCells(L)] },
    { L, revenue: answer, ops },
  );
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Price of a piece of length 1, 2, 3, …',
      kind: 'keys' as const,
      default: PRESETS[0]?.input.type === 'keys' ? PRESETS[0].input.values : [],
    },
  ],
  build: (values: Record<string, unknown>): AlgoInput => ({
    type: 'keys',
    values: Array.isArray(values.values) ? (values.values as number[]) : [],
  }),
  sizeOf: (input: AlgoInput): number => (input.type === 'keys' ? input.values.length : 0),
};

/* ------------------------------------------------------------------ *
 * 4. The lesson — four languages, one set of anchors
 * ------------------------------------------------------------------ */

const JS = `function rodCutting(prices, length) {
  const L = length, m = prices.length;                          // @anchor start
  // Rows are rod lengths, columns are the longest piece allowed. Both borders 0.
  const dp = Array.from({ length: L + 1 }, () => new Array(L + 1).fill(0));  // @anchor base
  for (let len = 1; len <= L; len++) {
    for (let p = 1; p <= L; p++) {
      // No such piece, or it is longer than the rod: nothing new to try.
      if (p > m || p > len) { dp[len][p] = dp[len][p - 1]; continue; }  // @anchor carry
      const keep = dp[len][p - 1];                               // @anchor keep
      // Same column, shorter rod: the piece budget does not shrink.
      const cut = dp[len - p][p] + prices[p - 1];                // @anchor cut
      dp[len][p] = Math.max(keep, cut);                          // @anchor best
    }
  }
  return dp[L][L];                                               // @anchor done
}`;

const PY = `def rod_cutting(prices, length):
    L, m = length, len(prices)                                    # @anchor start
    # Rows are rod lengths, columns are the longest piece allowed. Both borders 0.
    dp = [[0] * (L + 1) for _ in range(L + 1)]                    # @anchor base
    for length in range(1, L + 1):
        for p in range(1, L + 1):
            # No such piece, or it is longer than the rod: nothing new to try.
            if p > m or p > length:
                dp[length][p] = dp[length][p - 1]                 # @anchor carry
                continue
            keep = dp[length][p - 1]                              # @anchor keep
            # Same column, shorter rod: the piece budget does not shrink.
            cut = dp[length - p][p] + prices[p - 1]               # @anchor cut
            dp[length][p] = max(keep, cut)                        # @anchor best
    return dp[L][L]                                              # @anchor done`;

const JAVA = `class RodCutting {
    static int rodCutting(int[] prices, int length) {
        int L = length, m = prices.length;                        // @anchor start
        // Rows are rod lengths, columns are the longest piece allowed. Both borders 0.
        int[][] dp = new int[L + 1][L + 1];                       // @anchor base
        for (int len = 1; len <= L; len++) {
            for (int p = 1; p <= L; p++) {
                // No such piece, or it is longer than the rod: nothing new to try.
                if (p > m || p > len) { dp[len][p] = dp[len][p - 1]; continue; }  // @anchor carry
                int keep = dp[len][p - 1];                        // @anchor keep
                // Same column, shorter rod: the piece budget does not shrink.
                int cut = dp[len - p][p] + prices[p - 1];         // @anchor cut
                dp[len][p] = Math.max(keep, cut);                 // @anchor best
            }
        }
        return dp[L][L];                                          // @anchor done
    }
}`;

const CPP = `#include <algorithm>
#include <vector>
using std::vector;

int rod_cutting(vector<int> prices, int length) {
    int L = length, m = (int)prices.size();                       // @anchor start
    // Rows are rod lengths, columns are the longest piece allowed. Both borders 0.
    vector<vector<int> > dp(L + 1, vector<int>(L + 1, 0));         // @anchor base
    for (int len = 1; len <= L; len++) {
        for (int p = 1; p <= L; p++) {
            // No such piece, or it is longer than the rod: nothing new to try.
            if (p > m || p > len) { dp[len][p] = dp[len][p - 1]; continue; }  // @anchor carry
            int keep = dp[len][p - 1];                            // @anchor keep
            // Same column, shorter rod: the piece budget does not shrink.
            int cut = dp[len - p][p] + prices[p - 1];             // @anchor cut
            dp[len][p] = std::max(keep, cut);                     // @anchor best
        }
    }
    return dp[L][L];                                             // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'The two bounds, and note what the second one is: the number of *price entries*, not the number of piece lengths. A price list of three entries means pieces of length 1, 2 and 3 exist and nothing longer does — which is a real modelling decision, and the reason the answer stops climbing partway across the table.',
    python:
      'The two bounds, and note what the second one is: the number of price entries, not the rod length. Three prices means pieces of length 1..3 exist and nothing longer, so the table is wider than the useful answer. A `L, m = length, len(prices)` tuple assignment is one statement here and two declarations in Java and C++.',
    java: 'The two bounds on one line — `int L = length, m = prices.length;` is legal in Java and is the only reason the line reads as a unit. `m` is the number of price entries, which is a *different* thing from the rod length, and conflating the two is the bug that produces a table full of illegal pieces.',
    cpp: 'The two bounds, with `(int)prices.size()` because size() is unsigned. Keep both in `int`: every index below is computed as `len - p` or `p - 1`, and mixing an unsigned bound with signed indices is how a rod of length 0 turns into four billion.',
  },
  base: {
    javascript:
      'A (L+1) x (L+1) table of zeros, where both borders being 0 *is* the base case: a rod of length 0 is worth nothing, and with no piece length allowed nothing can be cut. The `+1` in both dimensions is what makes those borders exist at all.',
    python:
      'A (L+1) x (L+1) table of zeros, where both borders being 0 *is* the base case. The nested comprehension rebuilds the inner list per row, so the rows are independent — `[[0] * (L + 1)] * (L + 1)` would alias one row L + 1 times and every write would leak sideways.',
    java: 'A (L+1) x (L+1) int[][], already zeroed by the language, so no fill loop is needed. Both borders being 0 is the base case. This is the one table in the category where Java is the *shortest* of the four: the other three need an explicit initialiser, because neither JavaScript nor C++ hands you a zeroed table for free.',
    cpp: 'A (L+1) x (L+1) nested vector, zeroed by the (count, value) constructor. Both borders being 0 is the base case. The nested vector copies the inner one L + 1 times; flattening this to `vector<int>((L+1)*(L+1))` and indexing `len * (L+1) + p` is the same algorithm with a single allocation, and for the 1-D version of this problem it is also the version you would ship.',
  },
  carry: {
    javascript:
      'Either there is no piece of that length in the price list, or the piece is longer than the rod. Both cases mean this column has nothing new to try, so the cell repeats its left neighbour. The `||` is doing real work: checking `p > m` protects the price lookup below from reading past the end of the array, which in JavaScript would be `undefined` and a NaN.',
    python:
      'Either there is no piece of that length, or the piece is longer than the rod, so the cell repeats its left neighbour. The `or` short-circuits, so when `p > m` is already true the second test never runs — which matters because `len - p` would be a negative index in the line below, and Python resolves a negative index by counting from the end of the row.',
    java: "Either there is no piece of that length, or the piece is longer than the rod, so the cell repeats its left neighbour. The `||` short-circuits, so the second test is skipped once the first is true. Without the `p > m` test the price lookup would throw ArrayIndexOutOfBoundsException, which is a louder failure than C++'s undefined behaviour and a quieter one than JavaScript's `undefined`.",
    cpp: 'Either there is no piece of that length, or the piece is longer than the rod, so the cell repeats its left neighbour. `||` short-circuits in C++ exactly as it does in the other three. Without the `p > m` guard, `prices[p-1]` is an out-of-bounds read on a std::vector — undefined behaviour, which on a small allocation is usually a plausible-looking wrong price rather than a crash.',
  },
  keep: {
    javascript:
      'Candidate one: do not use a piece of length p at all, so the best is the answer for the same rod with one fewer piece length available. This is the cell on the left, and reading it rather than the cell above is what the table orientation buys: the row is the rod, so "fewer options" is a step to the left.',
    python:
      'Candidate one: no piece of length p, so the best is the same rod cut with pieces up to p - 1. The cell on the left, because the row is the rod and the column is the option set — turning the table 90 degrees would make this read from above instead, and nothing else would change.',
    java: 'Candidate one: no piece of length p, so the best is the same rod with one fewer option. `int keep = ...` is a copy, because Java cannot pass an int by reference — a read-into-a-local, combine, write-back, which is the shape of every cell write in all four of these listings.',
    cpp: 'Candidate one: no piece of length p, so the best is the same rod with one fewer option. The temptation is to write the max directly into `dp[len][p-1]` to save a variable; resist it, because that cell is still needed by the *next* row as its own "keep" candidate, and overwriting it would silently corrupt the table.',
  },
  cut: {
    javascript:
      'Candidate two, and the whole algorithm: cut one piece of length p, add its price, and solve the leftover rod of length len - p. The dependency is `dp[len - p][p]` — a *shorter row, same column* — which is exactly the property that bounds the recursion: the row index strictly decreases, so the table is acyclic and the sweep order is forced.',
    python:
      'Candidate two, and the whole algorithm. The dependency is `dp[length - p][p]`, a shorter row in the same column, so the piece budget does not shrink and the same piece can be used again and again — but the rod always gets shorter, which is what guarantees the recurrence terminates. Change the column to `p - 1` and you have written a *different* problem.',
    java: 'Candidate two: one piece of length p plus the best answer for the leftover rod, read from a shorter row of the same column. `dp[len - p][p]` is safe from bounds checking for the same reason the whole table is: `len >= p` is guaranteed by the carry test above, so the row index cannot go negative.',
    cpp: 'Candidate two: one piece of length p plus the best answer for the leftover rod. Note the column index is `p` and not `p - 1`: keeping the same column is what allows an unlimited supply of length-p pieces, and dropping to `p - 1` would silently turn the problem into "cut each piece length at most once".',
  },
  best: {
    javascript:
      'Keep the larger, and the tag records which one won. A cell taken from the diagonal means a piece of length p really is part of the optimal cut for this rod; a cell carried from the left means it is not, and the optimal plan uses only shorter pieces. Reading the diagonal cells down the last column is the actual answer written out as a set of cuts.',
    python:
      'Keep the larger. `max` is variadic in Python and JavaScript, so two candidates are one call; the compiled languages have no variadic max and would need std::max/std::max or a ternary — the same ceremony edit distance pays for the same reason.',
    java: 'Keep the larger, with `Math.max(int, int)` returning an int and no promotion hazard. The written cell is the only new information in the whole table, and the code never reads it again for this row — which is why the outer loop can move on and why the table is a cache of answers rather than a mutable structure.',
    cpp: 'Keep the larger. `std::max` returns a const reference to one of its arguments, so the assignment is the copy; and the write is the only place `dp[len][p]` changes, which is the invariant that makes a single forward sweep correct.',
  },
  done: {
    javascript:
      'The bottom-right cell, and it is the *whole* table: every plan for a rod of length L uses pieces of length at most L, so the corner has no artificial restriction left. If you wanted the number of pieces as well as the revenue you would need a second table, because the optimal revenue and the optimal piece count are not always the same plan.',
    python:
      'The bottom-right cell. The full table is (L+1)^2 ints, which is small enough here and hopeless in general: for a 1000-length rod that is a million cells, and the one-dimensional version — a list of length L+1 filled from a loop over rod lengths — gets the same answer in O(L) space. Same recurrence, transposed.',
    java: 'The bottom-right cell, with the jagged int[][] and its L+1 separate allocations being the only real cost. A production version would flatten the table to a single int[] with a stride, which removes every bounds-check and lets the JIT unroll the inner loop — for L in the thousands that is a measurable multiple, not a cosmetic gain.',
    cpp: 'The bottom-right cell. The same answer comes out of a one-dimensional vector filled in increasing rod length, and that is the version to write in production: the whole table exists here only so a student can see where each number came from, which is a trade the visualisation makes on purpose and the allocation-heavy code should not.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'rodCutting',
    python: 'rod_cutting',
    java: 'RodCutting.rodCutting',
    cpp: 'rod_cutting',
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

const pricesOf = (p: Preset): number[] => {
  const all = p.input.type === 'keys' ? p.input.values.map((v) => Number(v)) : PRICES;
  const wanted = Number(p.params?.priceCount ?? 8);
  return all.slice(0, Math.max(1, Math.min(12, Math.min(wanted, all.length))));
};

const LOf = (p: Preset): number => Number(p.params?.rodLength ?? 4);

/**
 * Top-down memoisation over a *one-dimensional* table indexed by rod length —
 * the same recurrence, transposed and evaluated in the opposite order, so
 * agreement is a genuine check on the 2-D sweep.
 */
const rodRevenue = (prices: number[], length: number, memo = new Map<number, number>()): number => {
  if (length <= 0) return 0;
  const hit = memo.get(length);
  if (hit !== undefined) return hit;
  let best = 0;
  const limit = Math.min(prices.length, length);
  for (let p = 1; p <= limit; p++) {
    best = Math.max(best, (prices[p - 1] as number) + rodRevenue(prices, length - p, memo));
  }
  memo.set(length, best);
  return best;
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const prices = pricesOf(p);
  const L = LOf(p);
  return { presetId: p.id, args: [prices, L], result: rodRevenue(prices, L) };
});

export const rodCuttingAlgo: AlgoDef<GridFrame> = {
  id: 'rod-cutting',
  title: 'Rod Cutting',
  category: 'dynamic-programming',
  summary:
    'Split a rod into priced pieces for the maximum revenue, tracking for every rod length and every piece budget the best revenue found so far.',
  intuition:
    'Reach for it whenever a fixed resource is divisible and every division has its own value: cutting stock, setting print runs, packaging sizes, or a publishing contract that pays more per chapter the shorter the chapter. The reason to compute the table rather than greedily take the best price-per-unit piece is the same reason it shows up in interviews — the greedy choice is wrong surprisingly often (two pieces of 2 beats one of 3 at length 4 here), and a wrong pricing decision is expensive in a way a slow loop is not.',
  complexity: {
    best: 'O(L²)',
    average: 'O(L²)',
    worst: 'O(L²)',
    space: 'O(L²)',
    note: 'L is the rod length, not the number of pieces. The 1-D form — one entry per rod length, filled in increasing order — is the same recurrence in O(L) space, and for L in the thousands that is the only version that fits in cache.',
  },
  traits: {
    stable: true,
    inPlace: false,
    online: false,
    offline: true,
    allowsDuplicates: true,
    tags: ['table', 'unbounded', 'optimisation', 'quadratic'],
  },
  viewport: 'grid',
  level: 'intermediate',
  params: [
    {
      key: 'rodLength',
      label: 'Rod length',
      kind: 'number',
      min: 1,
      max: 12,
      step: 1,
      default: 4,
      help: 'One row per length and one column per piece budget, so the table is (L+1) square.',
    },
    {
      key: 'priceCount',
      label: 'Pieces for sale',
      kind: 'number',
      min: 1,
      max: 12,
      step: 1,
      default: 8,
      help: 'Reads that many prices out of the list; the rest of the table becomes carry columns.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: rodCutting,
  lesson,
  expectations,
  formatResult: (r) => `revenue ${r as number}`,
  anchors: ['start', 'base', 'carry', 'keep', 'cut', 'best', 'done'],
};

export default rodCuttingAlgo;
