import { byLanguage } from '../../code/anchors.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isKeys } from '../../input/types.ts';
import type { CellValue, GridFrame, Highlight } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * 0/1 Knapsack — the table where the tag *is* the argument.
 *
 * Every cell answers "with the items above me and at most this much capacity,
 * what is the best value?". Both of the things a cell could be are sitting in
 * cells you have already seen — one directly above (skip this item) and one
 * diagonally up-left (take it) — so the table can be filled in one forward
 * sweep with no recursion and no revisiting.
 *
 * Three provenance tags, and each one is a different *reason* the number in a
 * cell is what it is:
 *
 *   `fromAbove` — the value was copied straight down from the row above: either
 *                 this item is too heavy for this capacity, or taking it was not
 *                 worth more than leaving it behind;
 *   `diag`      — a genuinely new number: this item was taken, and the rest of
 *                 the knapsack was solved with the capacity it left behind.
 *
 * There is deliberately **no** `fromLeft` tag in this table, and its absence is
 * the lesson. With items down the rows and capacity across the columns, *both*
 * candidates live in the previous row, so nothing can flow leftwards along a
 * row. A DP diagram whose arrows all point one way is a smell; the shape of
 * this table and the shape of its dependencies are the same thing.
 *
 * The input is a *flat* interleaved list of weight/value pairs. That is
 * deliberate: the `keys` field is the only numeric-sequence editor there is, a
 * flat list is the only shape that survives the JSON round-trip into the
 * verification harness, and it keeps the two numbers of an item adjacent, which
 * is how a student reads them.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const PRESETS: Preset[] = [
  {
    id: 'classic',
    label: '4 items, capacity 8',
    blurb:
      'The textbook table. Watch the diagonal cells light up on the four cells where taking the item beats skipping it — those are the only places the answer changes.',
    input: { type: 'keys', values: [3, 30, 4, 40, 5, 50, 6, 60] },
    params: { capacity: 8, itemCount: 4 },
  },
  {
    id: 'too-heavy',
    label: 'One item too heavy',
    blurb:
      'The 9-weight item never fits in a capacity of 8, so its whole row is a copy of the row above it. Those cells are the "carried down" tag, and they are free.',
    input: { type: 'keys', values: [9, 90, 3, 30, 4, 40, 2, 25] },
    params: { capacity: 8, itemCount: 4 },
  },
  {
    id: 'all-fit',
    label: 'Everything fits',
    blurb:
      'Capacity 12 swallows all four items, so the last column is just the sum of the values. The DP is doing real work and the answer is still obvious — which is how you check a table.',
    input: { type: 'keys', values: [3, 30, 4, 40, 5, 50, 6, 60] },
    params: { capacity: 12, itemCount: 4 },
  },
  {
    id: 'larger',
    label: '6 items, capacity 16',
    blurb:
      'Past the readable-by-eye size. The frontier where the value stops increasing is the actual answer, and reading it off a row is the payoff for building the whole table.',
    input: { type: 'keys', values: [2, 20, 4, 35, 5, 50, 6, 60, 3, 40, 7, 75] },
    params: { capacity: 16, itemCount: 6 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

export function* knapsack(ctx: RunContext): Generator<GridFrame> {
  const raw: number[] = isKeys(ctx.input) ? ctx.input.values.map((v) => Number(v)) : [];
  const pairs = raw.length >= 2 ? raw : [1, 10, 2, 20];
  const wanted = Math.trunc(Number(ctx.params.itemCount ?? 4)) || 4;
  const itemCount = Math.max(1, Math.min(6, wanted, Math.floor(pairs.length / 2)));
  const capacity = Math.max(1, Math.min(20, Math.trunc(Number(ctx.params.capacity ?? 8)) || 8));

  const weights: number[] = [];
  const values: number[] = [];
  for (let k = 0; k < itemCount; k++) {
    weights.push(pairs[2 * k] as number);
    values.push(pairs[2 * k + 1] as number);
  }

  const rows = itemCount + 1;
  const cols = capacity + 1;
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
    rowHeader: ['0 items', ...values.map((v) => `v${v}`)],
    colHeader: Array.from({ length: cols }, (_, c) => String(c)),
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
    `The table: ${itemCount} item rows plus a "no items yet" row, and capacities 0 to ${capacity} across the top. Column 0 is always 0 because a knapsack with no room holds nothing, and row 0 is all zeros because no items make no value.`,
    { window: [] },
    { items: itemCount, capacity, ops },
  );

  yield frame(
    'base',
    'Row 0 and column 0 are the base cases, and they are zero by allocation rather than by computation. Every other cell is defined as "the better of two cells that already exist", which is the entire reason this table can be filled in one sweep.',
    { window: [...rowCells(0), ...colCells(0)] },
    { items: itemCount, capacity, ops },
  );

  for (let i = 1; i <= itemCount; i++) {
    const w = weights[i - 1] as number;
    const v = values[i - 1] as number;

    for (let c = 1; c <= capacity; c++) {
      if (ctx.shouldStop()) return;
      ops++;

      if (w > c) {
        dp[cell(i, c)] = dp[cell(i - 1, c)] as number;
        tags[cell(i, c)] = 'fromAbove';
        yield frame(
          'carry',
          `Item ${i} weighs ${w}, more than the capacity ${c} on offer, so it cannot be in any knapsack this size. The cell is a straight copy of the row above — a value inherited rather than a decision made, and the reason it is tagged rather than computed.`,
          { current: [cell(i, c)], path: [...rowCells(i - 1)], window: rowCells(i) },
          { i, weight: w, value: v, capacity: c, ops },
        );
        continue;
      }

      const skip = dp[cell(i - 1, c)] as number;
      yield frame(
        'skip',
        `Candidate one: leave item ${i} (w${w}, v${v}) behind and keep whatever the ${i - 1} items above managed with capacity ${c} — that is ${skip}.`,
        {
          compare: [cell(i - 1, c)],
          current: [cell(i, c)],
          window: [...rowCells(i - 1), ...rowCells(i)],
        },
        { i, weight: w, value: v, capacity: c, skip, ops },
      );

      const take = (dp[cell(i - 1, c - w)] as number) + v;
      yield frame(
        'take',
        `Candidate two: spend ${w} of the ${c} capacity on item ${i} and add its ${v}, then solve the leftover capacity ${c - w} with the items above. That leftover cell is already filled, so this is arithmetic, not a new question.`,
        {
          compare: [cell(i - 1, c - w)],
          current: [cell(i, c)],
          window: [...rowCells(i - 1), ...rowCells(i)],
        },
        { i, weight: w, value: v, capacity: c, leftover: c - w, take, ops },
      );

      const best = Math.max(skip, take);
      dp[cell(i, c)] = best;
      tags[cell(i, c)] = take > skip ? 'diag' : 'fromAbove';
      yield frame(
        'best',
        `Take the larger: ${take} ${take > skip ? '>' : '<='} ${skip}, so this cell is ${best} and it came ${take > skip ? `from the diagonal, which means item ${i} really is in the optimal knapsack for this capacity` : `from directly above, which means item ${i} is worth nothing here and the answer is the same as without it`}.`,
        { answer: [cell(i, c)], window: [...rowCells(i - 1), ...rowCells(i)] },
        { i, weight: w, value: v, capacity: c, skip, take, best, ops },
      );
    }
  }

  const answer = dp[cell(itemCount, capacity)] as number;
  yield frame(
    'done',
    `Bottom-right cell: ${answer}, the best value that fits in capacity ${capacity}. Two facts make the table correct rather than merely plausible — every cell depends only on cells above or up-left, and "at most capacity c" means the answer never decreases as c grows, so the useful reading is the frontier where the row stops climbing.`,
    { answer: [cell(itemCount, capacity)], window: rowCells(itemCount) },
    { capacity, result: answer, ops },
  );
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Items (weight, value pairs, flat)',
      kind: 'keys' as const,
      default: PRESETS[0]?.input.type === 'keys' ? PRESETS[0].input.values : [],
    },
  ],
  build: (values: Record<string, unknown>): AlgoInput => ({
    type: 'keys',
    values: Array.isArray(values.values) ? (values.values as number[]) : [],
  }),
  sizeOf: (input: AlgoInput): number =>
    input.type === 'keys' ? Math.floor(input.values.length / 2) : 0,
};

/* ------------------------------------------------------------------ *
 * 4. The lesson — four languages, one set of anchors
 * ------------------------------------------------------------------ */

const JS = `function knapsack(weights, values, capacity) {
  const m = weights.length;                                                 // @anchor start
  const dp = Array.from({ length: m + 1 }, () => new Array(capacity + 1).fill(0));  // @anchor base
  for (let i = 1; i <= m; i++) {
    const w = weights[i - 1];
    const v = values[i - 1];
    for (let c = 1; c <= capacity; c++) {
      // Too heavy for this capacity: inherit the row above untouched.
      if (w > c) { dp[i][c] = dp[i - 1][c]; continue; }                    // @anchor carry
      const skip = dp[i - 1][c];                                            // @anchor skip
      const take = dp[i - 1][c - w] + v;                                    // @anchor take
      dp[i][c] = take > skip ? take : skip;                                 // @anchor best
    }
  }
  return dp[m][capacity];                                                   // @anchor done
}`;

const PY = `def knapsack(weights, values, capacity):
    m = len(weights)                                                        # @anchor start
    dp = [[0] * (capacity + 1) for _ in range(m + 1)]                       # @anchor base
    for i in range(1, m + 1):
        w = weights[i - 1]
        v = values[i - 1]
        for c in range(1, capacity + 1):
            # Too heavy for this capacity: inherit the row above untouched.
            if w > c:
                dp[i][c] = dp[i - 1][c]                                     # @anchor carry
                continue
            skip = dp[i - 1][c]                                             # @anchor skip
            take = dp[i - 1][c - w] + v                                     # @anchor take
            dp[i][c] = take if take > skip else skip                        # @anchor best
    return dp[m][capacity]                                                  # @anchor done`;

const JAVA = `class Knapsack {
    static int knapsack(int[] weights, int[] values, int capacity) {
        int m = weights.length;                                             // @anchor start
        int[][] dp = new int[m + 1][capacity + 1];                          // @anchor base
        for (int i = 1; i <= m; i++) {
            int w = weights[i - 1];
            int v = values[i - 1];
            for (int c = 1; c <= capacity; c++) {
                // Too heavy for this capacity: inherit the row above untouched.
                if (w > c) { dp[i][c] = dp[i - 1][c]; continue; }           // @anchor carry
                int skip = dp[i - 1][c];                                    // @anchor skip
                int take = dp[i - 1][c - w] + v;                            // @anchor take
                dp[i][c] = take > skip ? take : skip;                       // @anchor best
            }
        }
        return dp[m][capacity];                                             // @anchor done
    }
}`;

const CPP = `#include <vector>
using std::vector;

int knapsack(vector<int> weights, vector<int> values, int capacity) {
    int m = (int)weights.size();                                            // @anchor start
    // One row per item, one column per capacity. Both are zero-initialised, which
    // is what makes row 0 and column 0 the base cases for free.
    vector<vector<int> > dp(m + 1, vector<int>(capacity + 1, 0));           // @anchor base
    for (int i = 1; i <= m; i++) {
        int w = weights[i - 1];
        int v = values[i - 1];
        for (int c = 1; c <= capacity; c++) {
            // Too heavy for this capacity: inherit the row above untouched.
            if (w > c) { dp[i][c] = dp[i - 1][c]; continue; }              // @anchor carry
            int skip = dp[i - 1][c];                                        // @anchor skip
            int take = dp[i - 1][c - w] + v;                                // @anchor take
            dp[i][c] = take > skip ? take : skip;                           // @anchor best
        }
    }
    return dp[m][capacity];                                                 // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'How many rows the table needs: one per item, plus one for "no items chosen yet". The +1 is the row that makes the recurrence non-recursive — without it the first item would have nothing to look at, and the whole trick of 0/1 knapsack is that there is always a row of "nothing yet" to fall back on.',
    python:
      'How many rows the table needs: one per item, plus one for "no items chosen yet". `range(m + 1)` is what produces the extra row, and it is the row that makes the recurrence non-recursive — without it the first item has nothing to look at, and 0/1 knapsack only works because "nothing yet" is always an available answer.',
    java: 'How many rows the table needs: one per item, plus one for "no items chosen yet". Note that `new int[m + 1][capacity + 1]` builds a genuine 2D array of arrays, not a flat one — Java has no `vector<vector<int>>` equivalent in the standard library, so jagged rows are the idiomatic shape here and cost one extra indirection per access.',
    cpp: 'How many rows the table needs: one per item, plus one for "no items chosen yet". `vector<vector<int>>` is the jagged shape Java also has to use, and the nested construction here copies the inner vector m + 1 times — for a hot loop that is a real allocation cost, which is why people flatten this table into one vector and index it by hand. The parameters are by value only because that is how the harness builds them from JSON.',
  },
  base: {
    javascript:
      'The allocation, and it does the base cases for free. JavaScript fills a fresh `Array(n + 1)` with zeros, so row 0 is "no items, no value" and column 0 is "no room, no value" — the two boundary answers the recurrence refers to. Both are genuinely 0 rather than a sentinel, which is why this table has no "unreachable" cells at all.',
    python:
      'The allocation, and it does the base cases for free: a list of `m + 1` independent rows, each `capacity + 1` zeros. Row 0 is "no items, no value", column 0 is "no room, no value". The `[0] * (capacity + 1)` is a *repeat of one list object*, but the outer comprehension rebuilds the row for every i, so the rows are not aliased — a classic Python list-comprehension trap that this particular line avoids.',
    java: 'The allocation, and it does the base cases for free — every int in a new int[][] is zero. Row 0 is "no items, no value", column 0 is "no room, no value". This table therefore has no "unreachable" cells at all, which is a genuine advantage over the coin-change table in the same category: a zero here is a real answer, never a placeholder.',
    cpp: 'The allocation, and it does the base cases for free — every int in a fresh vector is zero. Row 0 is "no items, no value", column 0 is "no room, no value", and no cell is ever "unreachable", so this table needs no infinity sentinel. The nested vector is copied m + 1 times, which is the one avoidable cost in the whole algorithm.',
  },
  carry: {
    javascript:
      'The item is heavier than the whole capacity on offer, so it cannot be in any knapsack this size and the value is inherited unchanged from the row above. `continue` is doing real work here: it is what stops the `w > c` case from also running the two candidates below, where `dp[i - 1][c - w]` would index a *negative* column and quietly read a property of the array instead.',
    python:
      "The item is heavier than the capacity, so it cannot be in any knapsack this size and the value is inherited from the row above. The `continue` matters more here than in the other three languages: without it, `dp[i - 1][c - w]` with a negative index would wrap around and read from the *end* of the row — a wrong answer with no error at all, which is Python's negative-indexing footgun.",
    java: 'The item is heavier than the capacity, so it cannot be in any knapsack this size and the value is inherited from the row above. The `continue` prevents `dp[i - 1][c - w]` from being evaluated with a negative index — which in Java throws ArrayIndexOutOfBoundsException rather than wrapping, so the failure would at least be loud. This asymmetry is why the same bug is a crash here and a silent wrong answer in Python.',
    cpp: 'The item is heavier than the capacity, so it cannot be in any knapsack this size and the value is inherited from the row above. `[]` on a std::vector does not bounds-check, so the `continue` is what stops `c - w` from underflowing into a huge unsigned index and reading outside the allocation — undefined behaviour that usually manifests as a garbage value rather than a crash.',
  },
  skip: {
    javascript:
      'Candidate one, from the cell directly above: the best value achievable without this item at all. Reading it costs nothing — that cell was finalised in the previous row — and it is a complete answer on its own, because "leave the item behind" is always a legal knapsack. The recurrence is a max of two *complete* solutions, not a search.',
    python:
      'Candidate one, from the cell directly above: the best value without this item. That cell was finalised in the previous row, so this is a read, not a question. "Leave the item behind" is always a legal knapsack, which is why the recurrence is a maximum of two complete solutions rather than a search over subsets.',
    java: 'Candidate one, from the cell directly above: the best value without this item. Because the table is filled row by row, that cell is already final — this is a read. And since "leave the item behind" is always legal, the recurrence is a maximum of two *complete* solutions; the exponential subset enumeration is replaced by one comparison per cell.',
    cpp: 'Candidate one, from the cell directly above: the best value without this item, already finalised by the previous row. Since "leave the item behind" is always legal, the recurrence is a maximum of two complete solutions, and that single comparison per cell is what replaces the 2^m subset enumeration a naive solver would run.',
  },
  take: {
    javascript:
      'Candidate two, from the cell diagonally up-left: this item plus the best knapsack in the capacity it leaves behind. Adding the value is safe precisely because the *weight* was already spent by jumping back `w` columns, so no capacity is counted twice. That is what makes this 0/1 knapsack; the unbounded variant reads from this same row instead, and that single character is the whole difference between the two problems.',
    python:
      'Candidate two, from the cell diagonally up-left: this item plus the best knapsack in the capacity it leaves behind. The weight is spent by jumping back `w` columns, so no capacity is double-counted — that is what makes this 0/1 knapsack. The unbounded variant reads from `dp[i][c - w]`, the same row, and that one index change is the entire difference between the two problems.',
    java: 'Candidate two, from the cell diagonally up-left: this item plus the best knapsack in the capacity it leaves behind. The weight is already spent by jumping back `w` columns, so capacity is never counted twice. The unbounded variant would read `dp[i][c - w]` — the same row — and that one index change is the whole difference between 0/1 and unbounded knapsack.',
    cpp: 'Candidate two, from the cell diagonally up-left: this item plus the best knapsack in the capacity it leaves behind. The weight is already spent by jumping back `w` columns, so no capacity is double-counted, and both subsolutions were finalised in earlier rows — so the whole cell is two loads, an add and a compare. That is the entire algorithm: a fixed amount of work per cell, replacing the 2^m subset enumeration.',
  },
  best: {
    javascript:
      'Keep the larger of the two and store it. Whichever won is also the *provenance* of this cell, and the animation marks that: an amber `diag` ring means this item is genuinely in the optimal knapsack for this capacity, a plain copy means it is worth nothing here. Reading the tags down a column is a readable summary of which items the knapsack actually bought.',
    python:
      "Keep the larger of the two and store it. Whichever won is the provenance of this cell, and that is what the table's tags record: `diag` means this item really is in the optimal knapsack for this capacity, a copy from above means it is worth nothing here. Reading the tags down a column is a readable summary of which items got bought.",
    java: "Keep the larger of the two and store it. The `?:` is Java's only conditional expression, and it is an expression rather than a statement, so it can sit on the right of an assignment — the same trick Python gets from a conditional expression and JavaScript from `take > skip ? … : …`. Neither C nor Go have one, which is why those languages need a full if/else here.",
    cpp: "Keep the larger of the two and store it. C++ has no conditional expression, so the ternary is spelled out — and unlike the other three languages this is the one place the two branches must produce the same type, which is why a table of `double` here would silently promote the whole cell. The winner is also the cell's provenance, which is what the tags show.",
  },
  done: {
    javascript:
      'The bottom-right cell is the answer, and reading the whole table is how you sanity-check it: the last row must be non-decreasing, and every cell must be at least the cell above it. This is the one DP where the answer is guaranteed to exist — with 0/1 items and an "at most" capacity, the empty knapsack is always valid, so there is no unreachable case to invent a sentinel for.',
    python:
      'The bottom-right cell is the answer, and the whole table is the proof: the last row is non-decreasing, and no cell is smaller than the cell above it. This is the DP with no unreachable case — the empty knapsack is always legal, so unlike coin change there is no sentinel, and `return` is the only exit.',
    java: 'The bottom-right cell is the answer. A `static int[][]` would be the thing to return if you needed the whole table (a real library would), but returning one int keeps the signature honest about what the caller asked for. Java arrays are mutable references, so handing back `dp` would let the caller rewrite the table you just built.',
    cpp: 'The bottom-right cell is the answer. Returning `dp` itself would be free in C++ thanks to move semantics — no copy, just a pointer transfer — so if the caller wanted the table, that is strictly better than returning an int. Returning a single int keeps the interface honest about what was asked for, at the cost of throwing the table away.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'knapsack',
    python: 'knapsack',
    java: 'Knapsack.knapsack',
    cpp: 'knapsack',
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

const pairsOf = (p: Preset): { w: number[]; v: number[] } => {
  const flat = p.input.type === 'keys' ? p.input.values.map((v) => Number(v)) : [];
  const w: number[] = [];
  const v: number[] = [];
  const count = Math.min(
    Math.max(1, Number(p.params?.itemCount ?? 4)),
    Math.floor(flat.length / 2),
  );
  for (let k = 0; k < count; k++) {
    w.push(flat[2 * k] as number);
    v.push(flat[2 * k + 1] as number);
  }
  return { w, v };
};

/**
 * Brute force over all 2^m subsets — deliberately *not* the DP, so the claim is
 * an independent check rather than a restatement of the code under test.
 */
const bruteForce = (w: number[], v: number[], capacity: number): number => {
  let best = 0;
  for (let mask = 0; mask < 1 << w.length; mask++) {
    let weight = 0;
    let value = 0;
    for (let k = 0; k < w.length; k++) {
      if ((mask >> k) & 1) {
        weight += w[k] as number;
        value += v[k] as number;
      }
    }
    if (weight <= capacity) best = Math.max(best, value);
  }
  return best;
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const { w, v } = pairsOf(p);
  const capacity = Number(p.params?.capacity ?? 8);
  return { presetId: p.id, args: [w, v, capacity], result: bruteForce(w, v, capacity) };
});

export const knapsackAlgo: AlgoDef<GridFrame> = {
  id: 'knapsack',
  title: '0/1 Knapsack',
  category: 'dynamic-programming',
  summary:
    'Fill a table of "best value using the items above me and at most this capacity", taking the better of the cell above and the cell diagonally up-left.',
  intuition:
    'Reach for it when you have a hard capacity and indivisible things that each cost something and are worth something — which video to transcode, which tests to run first, what to pack, which ads to serve. The tell is that a greedy rule is tempting and wrong: the most valuable item is often the heaviest, and the table is what makes that visible instead of letting you ship a heuristic that quietly loses 12% of the value.',
  complexity: {
    best: 'O(mC)',
    average: 'O(mC)',
    worst: 'O(mC)',
    space: 'O(mC)',
    note: 'm items, C capacity. With m = 100 items and C = 100,000 weight units that is ten million cells — which is why the practical trick is to shrink one dimension (group items by weight, or keep a 1-D table of "best value for weight at most w" processed backwards). Every cell is constant work, so there is no interesting best case.',
  },
  traits: {
    stable: true,
    inPlace: false,
    online: false,
    offline: true,
    allowsDuplicates: true,
    tags: ['table', '0/1 choice', 'capacity', 'provenance tags', 'quadratic'],
  },
  viewport: 'grid',
  level: 'intermediate',
  params: [
    {
      key: 'capacity',
      label: 'Capacity',
      kind: 'number',
      min: 1,
      max: 20,
      step: 1,
      default: 8,
      help: 'One column per capacity, so 20 is about as wide as the viewport stays readable.',
    },
    {
      key: 'itemCount',
      label: 'Items',
      kind: 'number',
      min: 1,
      max: 6,
      step: 1,
      default: 4,
      help: 'Reads that many weight/value pairs out of the input list.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: knapsack,
  lesson,
  expectations,
  formatResult: (r) => `best value ${r as number}`,
  anchors: ['start', 'base', 'carry', 'skip', 'take', 'best', 'done'],
};

export default knapsackAlgo;
