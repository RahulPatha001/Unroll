import { byLanguage } from '../../code/anchors.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isKeys } from '../../input/types.ts';
import type { CellValue, GridFrame, Highlight } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Coin Change — the DP with an unreachable case, which is where the design
 * decisions actually show up.
 *
 * Same shape as knapsack (rows = the coins processed so far, columns =
 * amounts) and one crucial difference: **the cell to the left of the one being
 * filled is now a dependency**, because using a coin repeatedly means reading
 * the row you are currently writing. That is what makes this the *unbounded*
 * variant, and it is why a left-to-right sweep of each row is still correct
 * here while an in-place 0/1 knapsack sweep would silently let you take the
 * same item twice.
 *
 * Three provenance tags, and each one is a different *reason* a number is where
 * it is:
 *
 *   `fromAbove` — the value was copied straight down from the row above, because
 *                 this coin is worth more than the whole amount;
 *   `fromLeft`  — the winning subproblem was in *this* row at a smaller amount,
 *                 which is the unbounded reuse of the coin;
 *   `diag`      — the winning subproblem was in the row above at the same amount,
 *                 i.e. this coin contributed nothing.
 *
 * Unreachable cells carry no tag at all. A -1 has no provenance, because it is
 * not an answer — and an untagged cell is the honest way to say so.
 *
 * `-1` is the unreachable marker rather than a large sentinel, because the
 * answer *is* allowed to be -1 and because a huge number leaks into arithmetic:
 * `INF + 1` is still huge, and eventually you compare two infinities and get a
 * wrong answer. Java, C++ and Python all have a way to say "no value"
 * (Optional, optional, None) and all three of them need it here.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const PRESETS: Preset[] = [
  {
    id: 'canonical',
    label: '1 5 10 25, amount 11',
    blurb:
      'US coins, and the amount where the greedy answer is already right. Worth checking: greedy fails from 30 onwards with these coins, which is the whole reason this table exists.',
    input: { type: 'keys', values: [1, 5, 10, 25] },
    params: { amount: 11 },
  },
  {
    id: 'wide',
    label: '1 5 10 25, amount 30',
    blurb:
      'Wide enough for the tags to tell a story: the small amounts are built from the left (coins being reused, one column at a time), and the moment the 25 coin enters the table every amount it can reach flips to a cell taken from above.',
    input: { type: 'keys', values: [1, 5, 10, 25] },
    params: { amount: 30 },
  },
  {
    id: 'greedy-counterexample',
    label: '1 3 4, amount 6 (greedy fails)',
    blurb:
      'The textbook counterexample. Greedy takes 4 + 1 + 1 = 3 coins; 3 + 3 = 2 coins wins. No local rule about "take the biggest coin you can" survives this column of the table.',
    input: { type: 'keys', values: [1, 3, 4] },
    params: { amount: 6 },
  },
  {
    id: 'impossible',
    label: 'Coins 3 and 5, amount 7',
    blurb:
      'Nothing reaches 7, and the table says so with -1 rather than with a big number that might accidentally win a comparison later. In the last row only the cell at 5 is not -1.',
    input: { type: 'keys', values: [3, 5] },
    params: { amount: 7 },
  },
  {
    id: 'zero',
    label: 'Amount 0',
    blurb:
      'The degenerate answer: making nothing from nothing takes 0 coins. The column 0 is the one place the table is not made of -1, and it is the base case the whole recurrence leans on.',
    input: { type: 'keys', values: [1, 5, 10, 25] },
    params: { amount: 0 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

export function* coinChange(ctx: RunContext): Generator<GridFrame> {
  const raw: number[] = isKeys(ctx.input) ? ctx.input.values.map((v) => Number(v)) : [];
  const coins = (raw.length > 0 ? raw : [1, 5, 10, 25]).filter((c) => c > 0).slice(0, 6);
  const amount = Math.max(0, Math.min(40, Math.trunc(Number(ctx.params.amount ?? 11)) || 0));

  const rows = coins.length + 1;
  const cols = amount + 1;
  const cell = (row: number, col: number): number => row * cols + col;

  const dp: number[] = new Array<number>(rows * cols).fill(-1);
  const tags: Record<number, string> = {};
  let ops = 0;

  // Column 0 is 0 from the start: making nothing from nothing costs no coins.
  for (let r = 0; r < rows; r++) dp[cell(r, 0)] = 0;

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
    rowHeader: ['no coins', ...coins.map((c) => `${c}c`)],
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

  yield frame(
    'start',
    `Rows are the coins processed so far, columns are amounts 0 to ${amount}. -1 means "no combination of these coins reaches this amount yet" — and unlike knapsack, unreachable is a real, common state here rather than an impossibility.`,
    { window: rowCells(0) },
    { coins: coins.length, amount, ops },
  );

  yield frame(
    'base',
    'Two base cases, both by allocation. Column 0 is 0 everywhere, because making nothing costs nothing. Row 0 is -1 everywhere else, because no coins can only make amount 0. The sweep therefore starts at (1, 1) and moves right, and every cell it writes depends only on cells already written.',
    { window: [...rowCells(0), ...[...Array(coins.length)].map((_, k) => cell(k + 1, 0))] },
    { coins: coins.length, amount, ops },
  );

  for (let i = 1; i <= coins.length; i++) {
    const coin = coins[i - 1] as number;

    for (let a = 1; a <= amount; a++) {
      if (ctx.shouldStop()) return;
      ops++;

      if (coin > a) {
        dp[cell(i, a)] = dp[cell(i - 1, a)] as number;
        tags[cell(i, a)] = 'fromAbove';
        yield frame(
          'carry',
          `A ${coin} coin is worth more than the whole amount ${a}, so it cannot be used at all. The cell is a copy of the row above, and if that was -1 then this stays unreachable: the coin is not just useless here, it makes nothing new reachable.`,
          { current: [cell(i, a)], path: [...rowCells(i - 1)], window: rowCells(i) },
          { i, coin, amount: a, ops },
        );
        continue;
      }

      const above = dp[cell(i - 1, a)] as number;
      yield frame(
        'above',
        `Candidate one: ignore the ${coin} coin and keep the best answer the smaller coins managed for amount ${a}, which is ${above < 0 ? 'nothing — still unreachable' : `${above} coin${above === 1 ? '' : 's'}`}.`,
        {
          compare: [cell(i - 1, a)],
          current: [cell(i, a)],
          window: [...rowCells(i - 1), ...rowCells(i)],
        },
        { i, coin, amount: a, above, ops },
      );

      const leftRaw = dp[cell(i, a - coin)] as number;
      const use = leftRaw < 0 ? -1 : leftRaw + 1;
      yield frame(
        'use-coin',
        `Candidate two: add one ${coin} coin to the best answer for amount ${a - coin} using *this row's* coins, so the ${coin} can be used again and again. That is the ${leftRaw < 0 ? 'unreachable' : use} answer — reading from the left, not from above, is exactly what makes this the unbounded variant.`,
        { compare: [cell(i, a - coin)], current: [cell(i, a)], window: rowCells(i) },
        { i, coin, amount: a, leftover: a - coin, use, ops },
      );

      const best = above < 0 ? use : use < 0 ? above : Math.min(above, use);
      dp[cell(i, a)] = best;
      // Unreachable cells get no tag at all: there is no value here, so there is
      // no provenance to record. Tagging them would be a lie with a legend entry.
      if (best >= 0) tags[cell(i, a)] = use <= above ? 'fromLeft' : 'diag';
      yield frame(
        best < 0 ? 'unreachable' : 'best',
        best < 0
          ? `Both candidates are unreachable, so this cell stays -1: no combination of the coins above plus the ${coin} coin makes amount ${a}. A -1 here is not a failure of the algorithm, it is the answer for this prefix of the coin list.`
          : `Keep the smaller: ${use < 0 ? above : above < 0 ? use : `${use} against ${above}`}, so this cell is ${best} ${use <= above && use >= 0 ? 'and it came from the left, meaning the answer reuses the coin you are currently adding' : above <= use ? 'and it came from the row above, meaning this coin is worth nothing here' : ''}.`,
        {
          answer: [cell(i, a)],
          window: [...rowCells(i - 1), ...rowCells(i)],
        },
        { i, coin, amount: a, above, use, best, ops },
      );
    }
  }

  const answer = dp[cell(coins.length, amount)] as number;
  yield frame(
    'done',
    answer < 0
      ? `The bottom-right cell is -1: amount ${amount} cannot be made from these coins at all, and the sentinel is part of the contract rather than an accident. Any caller that forgot to test for it would go on to use -1 as a coin count, which is why every one of these four languages grew a dedicated "no value" type and why the function should arguably return one.`
      : `The bottom-right cell is ${answer}: amount ${amount} needs ${answer} coin${answer === 1 ? '' : 's'}. With the coins 1 3 4 the greedy answer to the same question is 3 where this table says 2 — that disagreement, and not the runtime, is the reason this table is worth building.`,
    { answer: [cell(coins.length, amount)], window: rowCells(coins.length) },
    { amount, result: answer, ops },
  );
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Coin denominations',
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

const JS = `function coinChange(coins, amount) {
  const k = coins.length;                                    // @anchor start
  // -1 means unreachable; column 0 is 0 because nothing costs nothing.
  const dp = Array.from({ length: k + 1 }, () => new Array(amount + 1).fill(-1));  // @anchor base
  for (let i = 0; i <= k; i++) dp[i][0] = 0;
  for (let i = 1; i <= k; i++) {
    const c = coins[i - 1];
    for (let a = 1; a <= amount; a++) {
      if (c > a) { dp[i][a] = dp[i - 1][a]; continue; }        // @anchor carry
      const above = dp[i - 1][a];                             // @anchor above
      const use = dp[i][a - c] < 0 ? -1 : dp[i][a - c] + 1;   // @anchor use-coin
      // \`use\` is the leftover count, and -1 + 1 is 0 — a plausible wrong answer.
      if (use < 0) dp[i][a] = above;                          // @anchor unreachable
      else if (above < 0) dp[i][a] = use;
      else dp[i][a] = Math.min(above, use);                   // @anchor best
    }
  }
  return dp[k][amount];                                       // @anchor done
}`;

const PY = `def coin_change(coins, amount):
    k = len(coins)                                            # @anchor start
    # -1 means unreachable; column 0 is 0 because nothing costs nothing.
    dp = [[-1] * (amount + 1) for _ in range(k + 1)]           # @anchor base
    for i in range(k + 1):
        dp[i][0] = 0
    for i in range(1, k + 1):
        c = coins[i - 1]
        for a in range(1, amount + 1):
            if c > a:
                dp[i][a] = dp[i - 1][a]                         # @anchor carry
                continue
            above = dp[i - 1][a]                               # @anchor above
            use = dp[i][a - c]                                 # @anchor use-coin
            if use >= 0:
                use += 1
            # \`use\` is the leftover count, and -1 + 1 is 0: a plausible wrong answer.
            if use < 0:
                dp[i][a] = above                               # @anchor unreachable
            elif above < 0:
                dp[i][a] = use
            else:
                dp[i][a] = min(above, use)                     # @anchor best
    return dp[k][amount]                                       # @anchor done`;

const JAVA = `class CoinChange {
    static int coinChange(int[] coins, int amount) {
        int k = coins.length;                                  // @anchor start
        // -1 means unreachable; column 0 is 0 because nothing costs nothing.
        int[][] dp = new int[k + 1][amount + 1];
        for (int[] row : dp) java.util.Arrays.fill(row, -1);   // @anchor base
        for (int i = 0; i <= k; i++) dp[i][0] = 0;
        for (int i = 1; i <= k; i++) {
            int c = coins[i - 1];
            for (int a = 1; a <= amount; a++) {
                if (c > a) { dp[i][a] = dp[i - 1][a]; continue; }  // @anchor carry
                int above = dp[i - 1][a];                       // @anchor above
                int use = dp[i][a - c];                         // @anchor use-coin
                if (use >= 0) use += 1;
                // \`use\` is the leftover count, and -1 + 1 is 0: a plausible wrong answer.
                if (use < 0) dp[i][a] = above;                 // @anchor unreachable
                else if (above < 0) dp[i][a] = use;
                else dp[i][a] = Math.min(above, use);          // @anchor best
            }
        }
        return dp[k][amount];                                  // @anchor done
    }
}`;

const CPP = `#include <algorithm>
#include <vector>
using std::vector;

int coin_change(vector<int> coins, int amount) {
    int k = (int)coins.size();                                 // @anchor start
    // -1 means unreachable; column 0 is 0 because nothing costs nothing.
    vector<vector<int> > dp(k + 1, vector<int>(amount + 1, -1));  // @anchor base
    for (int i = 0; i <= k; i++) dp[i][0] = 0;
    for (int i = 1; i <= k; i++) {
        int c = coins[i - 1];
        for (int a = 1; a <= amount; a++) {
            if (c > a) { dp[i][a] = dp[i - 1][a]; continue; }  // @anchor carry
            int above = dp[i - 1][a];                           // @anchor above
            int use = dp[i][a - c];                             // @anchor use-coin
            if (use >= 0) use += 1;
            // \`use\` is the leftover count, and -1 + 1 is 0: a plausible wrong answer.
            if (use < 0) dp[i][a] = above;                      // @anchor unreachable
            else if (above < 0) dp[i][a] = use;
            else dp[i][a] = std::min(above, use);               // @anchor best
        }
    }
    return dp[k][amount];                                      // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'How many coin rows the table needs. One row per coin plus a row for "none of them", which is what makes the first coin\'s row able to answer "what is the best I can do without this coin" — the same reason knapsack has a row 0.',
    python:
      'How many coin rows the table needs: one per coin plus the "none of them" row. `len(coins)` is O(1) on a list, so the row count is free to compute; the same expression on a Java `Set` or a C++ `unordered_set` would be O(n), because there the size is not stored.',
    java: 'How many coin rows the table needs. The array is `int[]` because a coin is a count of something and nobody wants to think about a denomination in a double — but note the answer is a count too, so the natural Java return type would be `Optional<Integer>` if the impossible case mattered, and it does.',
    cpp: 'How many coin rows the table needs. `(int)coins.size()` needs the cast because size() returns an unsigned type and mixing it with a signed loop counter invites exactly the "loop runs one time too many" bug; the cast puts the whole expression in int land where the arithmetic behaves.',
  },
  base: {
    javascript:
      'The table starts entirely unreachable, then column 0 is opened up. Note the `fill(-1)`: a fresh `Array(n + 1)` is full of holes, and `holes.length - 1` is a legitimate JavaScript value, so an uninitialised table would produce NaN rather than an obvious error. Filling with -1 makes "not reachable yet" a value the arithmetic can reason about.',
    python:
      'The table starts entirely unreachable, then column 0 is opened up. `[[-1] * (amount + 1) for _ in range(k + 1)]` rebuilds the inner list per row, so the rows are independent — the `[[-1] * (amount + 1)] * (k + 1)` shortcut would alias one row k + 1 times and every write would leak sideways.',
    java: 'The table starts entirely unreachable, and here that takes an explicit `Arrays.fill` on every row, because a fresh int[][] is zeroed rather than undefined — and 0 would be the *right* answer for the empty case, so zeros would quietly invent a solution. The for-each over `dp` is the idiomatic way to touch every row; `Arrays.fill(dp, ...)` would not compile, since the array holds references.',
    cpp: 'The table starts entirely unreachable, and the (count, value) constructor is what does it in one expression. Compare the other three: Python and JavaScript can multiply or fill an existing container, C++ has no such thing and needs a constructor or a loop. The initialiser is also the reason every later read has to guard against -1 rather than assuming a number.',
  },
  carry: {
    javascript:
      'This coin is larger than the entire amount, so it cannot appear in any solution for it. The cell copies the row above unchanged, and if that was -1 it stays -1 — a coin that is too big does not make anything newly reachable, it only fails to help.',
    python:
      'This coin is larger than the entire amount, so it cannot appear in any solution for it and the cell copies the row above. The `continue` matters more here than elsewhere: without it, `dp[i][a - c]` indexes with a negative number, which Python resolves by counting from the *end* of the row — a wrong answer and no exception at all.',
    java: 'This coin is larger than the entire amount, so the cell copies the row above. The `continue` protects `dp[i][a - c]`, which with a negative index throws ArrayIndexOutOfBoundsException rather than wrapping — the same bug that is a silent wrong answer in Python, and undefined behaviour in C++ where `vector::operator[]` does not check either.',
    cpp: 'This coin is larger than the entire amount, so the cell copies the row above. `c > a` with both ints is fine, but the *index* `a - c` below would be a negative int, and `vector::operator[]` takes a size_t — so the negative value converts to an enormous unsigned number and the read lands outside the buffer with no diagnostic whatsoever.',
  },
  above: {
    javascript:
      'Candidate one: the best answer using only the coins above this row. Because the sweep fills rows top to bottom, that value is already final, so this is a read and not a question. It is the value that stays -1 when the smaller coins cannot make this amount either.',
    python:
      'Candidate one: the best answer using only the coins above. Already final, so this is a read. It is the value that stays -1 when the smaller coins cannot make this amount — which is exactly the "we have not found a solution yet" state the rest of the recurrence has to test for.',
    java: 'Candidate one: the best answer using only the coins above, already final so this is a read. Because the array is a reference, `above` is a *copy* of the int — Java has no pass-by-reference for primitives, so every "update a cell from a neighbour" pattern here is read-into-a-local, combine, write-back.',
    cpp: 'Candidate one: the best answer using only the coins above, already final so this is a read. `int above = ...` is a copy too, and the alternative — passing neighbours by reference so they could be updated in place — would be a different algorithm, because it would let a later cell change a value an earlier cell already relied on.',
  },
  'use-coin': {
    javascript:
      'Candidate two, and the line that makes this the *unbounded* problem: the dependency is `dp[i][a - c]`, a cell in the row being written right now, at a smaller column. Because columns are filled left to right, that cell is already final — which is precisely why sweeping left to right is correct here and would be catastrophic for 0/1 knapsack.',
    python:
      'Candidate two, and the line that makes this the unbounded problem: the dependency is `dp[i][a - c]`, in the row currently being written, at a smaller column. Reading from the left is what lets the same coin be used twice; reading from `dp[i - 1][...]` instead would silently make it 0/1 knapsack and give a different, larger answer.',
    java: 'Candidate two, and the line that makes this the unbounded problem: the dependency is the cell to the left in the same row. A real implementation usually drops the second dimension entirely and keeps a single 1-D array updated in increasing order of `a` — same table, same sweep, a fraction of the memory, because the row above is never needed after it has been read once.',
    cpp: 'Candidate two, and the line that makes this the unbounded problem: the dependency is the cell to the left in the same row, already final because the sweep is left to right. The 1-D optimisation works here for the same reason it does in knapsack: once a cell has been read, the row above is dead weight, and `vector<int>` of size amount + 1 replaces k + 1 rows.',
  },
  unreachable: {
    javascript:
      'The write, and the only genuinely awkward line in the algorithm. `use` is the *leftover* count, so a naive `Math.min(above, use + 1)` computes -1 + 1 = 0 for an unreachable neighbour and produces a confident, wrong, beautiful-looking zero. The branch is the price of a sentinel. This is the argument for `null` — and JavaScript has one, but arithmetic on `null` is also 0, so the sentinel does not go away, it just moves.',
    python:
      'The write, and the awkward line. A tempting `min(above, use + 1)` computes -1 + 1 = 0 for an unreachable neighbour, so the table claims 0 coins make this amount. Python has `None` for the unreachable state and would read `min(x for x in (above, use) if x is not None) + 1`, but then column 0 needs a different rule and the code stops looking like the textbook version.',
    java: 'The write, and the awkward line: `above < 0` has to be tested separately because -1 + 1 = 0, and "0 coins makes this amount" is a plausible-looking answer. This is precisely the case that made `Optional<Integer>` exist — the impossible state is not an error, it is a *value*. A `List<Integer>` return with null for impossible is the modern Java answer to the same problem.',
    cpp: 'The write, and the awkward line. `std::optional<int>` would make the impossible state a type-level fact rather than a magic number: `std::min` does not work on optionals, but looping over the two candidates and testing `has_value()` is both correct and self-documenting — and the caller cannot forget the -1 test, because there is no -1 to forget.',
  },
  best: {
    javascript:
      'Both candidates are real counts, so the smaller one wins and the cell is settled. The tag recorded alongside says which: a cell taken from the left means this coin is genuinely part of the best way to make the amount, and a cell copied from above means the new coin added nothing here. Reading the tags along the last row tells you which denominations actually earn their place.',
    python:
      'Both candidates are real counts, so `min` settles the cell. `min` is a builtin taking any number of arguments, which is why the whole three-candidate decision can be one expression in Python and JavaScript; the other two languages have no variadic min and would need std::min/std::min or a ternary.',
    java: 'Both candidates are real counts, so `Math.min` settles the cell. `Math.min(int, int)` and `Math.min(double, double)` overloads make this safe for ints — a naive `Math.min(above, use + 1)` would still be int arithmetic, but `Math.pow`-style promotion traps are what make the double overloads a hazard elsewhere in the same table.',
    cpp: 'Both candidates are real counts, so `std::min` settles the cell. It is a template rather than a function, which is why it needs `<algorithm>`, why it returns a *reference* to one of its arguments, and why the assignment is what actually copies the value into the cell.',
  },
  done: {
    javascript:
      'The bottom-right cell, which is -1 when the amount is impossible. The function returns that sentinel rather than throwing, so *every* caller has to test for -1 — a contract enforced by nothing but this comment. In JavaScript you would return `null` and let the type of the problem, not a magic number, carry it.',
    python:
      'The bottom-right cell, and -1 for an impossible amount. `float("inf")` is the textbook alternative, and it is worse: inf + 1 is still inf, so an unreachable neighbour quietly stays unreachable without a branch, but a table full of inf prints as `inf` and stops being readable.',
    java: 'The bottom-right cell. An `int` return means "impossible" has to be -1, because a primitive cannot be null — which is the whole argument for `OptionalInt`. Note the harness-visible consequence: a Java caller that ignores the sentinel gets a negative coin count and finds out much later.',
    cpp: 'The bottom-right cell. The by-value `int` return is what forces the -1 sentinel; `std::optional<int>` would move the impossible case into the type system, at the cost of a driver that has to know how to print it. Same algorithm, better interface, one more type to explain.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'coinChange',
    python: 'coin_change',
    java: 'CoinChange.coinChange',
    cpp: 'coin_change',
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

const coinsOf = (p: Preset): number[] => {
  const raw = p.input.type === 'keys' ? p.input.values.map((v) => Number(v)) : [];
  return (raw.length > 0 ? raw : [1, 5, 10, 25]).filter((c) => c > 0).slice(0, 6);
};

/** Breadth-first search over amounts — a different algorithm, same answer. */
const minCoins = (coins: number[], amount: number): number => {
  const dist = new Array<number>(amount + 1).fill(-1);
  dist[0] = 0;
  const queue: number[] = [0];
  for (let head = 0; head < queue.length; head++) {
    const here = queue[head] as number;
    for (const c of coins) {
      const next = here + c;
      if (next <= amount && (dist[next] as number) < 0) {
        dist[next] = (dist[here] as number) + 1;
        queue.push(next);
      }
    }
  }
  return dist[amount] as number;
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const coins = coinsOf(p);
  const amount = Number(p.params?.amount ?? 0);
  return { presetId: p.id, args: [coins, amount], result: minCoins(coins, amount) };
});

export const coinChangeAlgo: AlgoDef<GridFrame> = {
  id: 'coin-change',
  title: 'Coin Change',
  category: 'dynamic-programming',
  summary:
    'Fill a table of "fewest coins to make this amount using the coins in the rows above me", reading leftwards so a coin can be reused.',
  intuition:
    'Reach for it when denominations are arbitrary — foreign currency, postage, or a reward system where 7 and 11 exist. The moment all denominations divide evenly into each other, a greedy "take the biggest that fits" loop is simpler and provably just as good, so the table earns its keep only in the messy case. If you must answer this per transaction in a hot loop, precompute the whole row once for every amount up to your maximum and keep it in memory: the table is a lookup after that.',
  complexity: {
    best: 'O(kA)',
    average: 'O(kA)',
    worst: 'O(kA)',
    space: 'O(kA)',
    note: 'k denominations, A the amount. The 1-D form (one row, updated in increasing order of amount) gives O(A) space and is the version to write by hand, since the row above is dead after it has been read once.',
  },
  traits: {
    stable: true,
    inPlace: false,
    online: false,
    offline: true,
    allowsDuplicates: true,
    tags: ['table', 'unbounded', 'sentinel', 'quadratic'],
  },
  viewport: 'grid',
  level: 'intermediate',
  params: [
    {
      key: 'amount',
      label: 'Amount',
      kind: 'number',
      min: 0,
      max: 40,
      step: 1,
      default: 11,
      help: 'One column per unit of amount, so past ~25 the table is wider than the screen.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: coinChange,
  lesson,
  expectations,
  formatResult: (r) => ((r as number) < 0 ? 'impossible (-1)' : `${r as number} coins`),
  anchors: ['start', 'base', 'carry', 'above', 'use-coin', 'unreachable', 'best', 'done'],
};

export default coinChangeAlgo;
