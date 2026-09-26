import { byLanguage } from '../../code/anchors.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isKeys } from '../../input/types.ts';
import type { CellValue, GridFrame, Highlight } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Fibonacci — the smallest table that makes dynamic programming legible.
 *
 * Two rows, and the whole lesson is in the second one. Row 0 (`memo`) is filled
 * top-down by the recursive definition; row 1 (`tab`) is filled bottom-up by the
 * same recurrence. They agree, cell for cell — and the reason they agree is
 * that **the recurrence only ever mentions smaller subproblems**, so both
 * orders are valid. That single sentence is the difference between "I memorised
 * this code" and "I know when DP is possible".
 *
 * `''` is the "not computed yet" marker rather than 0 or `null`, because
 * `F(0) = 0` is a real answer and the grid renderer paints an empty string as an
 * empty cell — so "unknown" and "zero" can never be confused.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

/** The column headers, `F(0) … F(n)`. Also the fallback input if the field is empty. */
const indicesUpTo = (n: number): number[] => Array.from({ length: n + 1 }, (_, i) => i);

const PRESETS: Preset[] = [
  {
    id: 'tiny',
    label: 'n = 6',
    blurb:
      'Small enough to hold in your head: F(6) = 8. Watch the top-down row re-visit subproblems it has already solved, then watch the bottom-up row need no revisiting at all.',
    input: { type: 'keys', values: indicesUpTo(6) },
    params: { n: 6 },
  },
  {
    id: 'base-only',
    label: 'n = 2 (all base cases)',
    blurb:
      'The smallest table with any arithmetic in it. F(2) = F(1) + F(0) = 1, and both operands are base cases, so the memo table is never consulted a second time.',
    input: { type: 'keys', values: indicesUpTo(2) },
    params: { n: 2 },
  },
  {
    id: 'cache-hit',
    label: 'n = 20 (memo hits everywhere)',
    blurb:
      'The naive recursion would make 13,581 calls for this. With the memo table it makes 21, because every subproblem is computed once and the rest are lookups.',
    input: { type: 'keys', values: indicesUpTo(20) },
    params: { n: 20 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const ROWS = ['memo (top-down)', 'tab (bottom-up)'];

export function* fibonacci(ctx: RunContext): Generator<GridFrame> {
  const raw: number[] = isKeys(ctx.input) ? ctx.input.values.map((v) => Number(v)) : [];
  const requested = Math.trunc(Number(ctx.params.n ?? 6)) || 6;
  // The input *is* the table's column list, so an emptied field regenerates it
  // rather than leaving the student with an empty viewport.
  const indices: number[] = raw.length >= 2 ? raw : indicesUpTo(requested);
  const n = Math.max(1, Math.min(40, requested, indices.length - 1));
  const cols = n + 1;

  /** Row-major cell index. Highlight keys are indices, never (row, col) pairs. */
  const cell = (row: number, col: number): number => row * cols + col;

  const memo: Array<number | string> = new Array<number | string>(cols).fill('');
  const tab: Array<number | string> = new Array<number | string>(cols).fill('');
  /** The live call stack, as column indices — the top-down recursion spine. */
  const spine: number[] = [];
  let ops = 0;

  const filledIn = (row: number, arr: readonly (number | string)[]): number[] => {
    const out: number[] = [];
    for (let c = 0; c < cols; c++) if (typeof arr[c] === 'number') out.push(cell(row, c));
    return out;
  };

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
    rows: 2,
    cols,
    // Fresh snapshot every frame: sharing this array would make every frame
    // show the finished table when you scrub backwards.
    cells: [...memo, ...tab],
    rowHeader: [...ROWS],
    colHeader: indices.slice(0, cols).map((i) => String(i)),
    mode: 'number',
    highlight,
    ops,
    vars,
  });

  yield frame(
    'start',
    `Two rows, one per strategy. F(0) to F(n) with n = ${n}, so ${cols} columns. Nothing is computed yet — the top-down row will be filled by the recursive definition and the bottom-up row by the same recurrence walked forwards, and the two must agree.`,
    { current: [cell(0, 0)], window: [] },
    { n, cols, ops },
  );

  function* walk(k: number): Generator<GridFrame> {
    if (ctx.shouldStop()) return;
    const known = memo[k];
    if (typeof known === 'number') {
      ops++;
      yield frame(
        'memo-hit',
        `F(${k}) is already in the table as ${known}, so this call returns straight away. That single line is the whole of memoisation: the same subproblem is *solved* once and merely *read* every time after that.`,
        { current: [cell(0, k)], path: spine.map((c) => cell(0, c)), window: filledIn(0, memo) },
        { k, memoised: known, ops },
      );
      return;
    }
    if (k <= 1) {
      memo[k] = k;
      ops++;
      yield frame(
        'base-case',
        `k = ${k} is a base case, so the recursion stops here and the table records F(${k}) = ${k}. Hard-coding these two is what stops the definition from being infinitely recursive.`,
        { current: [cell(0, k)], path: spine.map((c) => cell(0, c)), window: filledIn(0, memo) },
        { k, value: k, ops },
      );
      return;
    }

    spine.push(k);
    ops++;
    yield frame(
      'recurse',
      `F(${k}) = F(${k - 1}) + F(${k - 2}), so neither answer is known yet. Go after F(${k - 1}) first and hold the other one in the call frame — the stack is now ${spine.length} deep.`,
      {
        current: [cell(0, k)],
        path: spine.map((c) => cell(0, c)),
        window: filledIn(0, memo),
      },
      { k, needs: `${k - 1}+${k - 2}`, depth: spine.length, ops },
    );

    yield* walk(k - 1);
    if (ctx.shouldStop()) return;
    yield* walk(k - 2);
    if (ctx.shouldStop()) return;

    const left = memo[k - 1] as number;
    const right = memo[k - 2] as number;
    memo[k] = left + right;
    ops++;
    yield frame(
      'combine',
      `Both operands came back, so F(${k}) = ${left} + ${right} = ${left + right} and the table records it. This frame is the only place a new Fibonacci number is *created*; everything else was a lookup.`,
      {
        answer: [cell(0, k)],
        path: spine.map((c) => cell(0, c)),
        window: filledIn(0, memo),
      },
      { k, left, right, value: left + right, ops },
    );
    spine.pop();
  }

  yield* walk(n);

  const fromMemo = memo[n] as number;
  tab[0] = 0;
  tab[1] = 1;
  ops++;
  yield frame(
    'tabulate',
    `The recursive pass produced F(${n}) = ${fromMemo}. Now the second row: the same recurrence, but driven by increasing index instead of by the call stack, which is why it needs the base cases written in by hand rather than discovered.`,
    { current: [cell(0, n), cell(1, 0), cell(1, 1)], window: filledIn(0, memo) },
    { n, fromMemo, left: 0, right: 1, ops },
  );

  for (let k = 2; k <= n; k++) {
    if (ctx.shouldStop()) return;
    const left = tab[k - 1] as number;
    const right = tab[k - 2] as number;
    tab[k] = left + right;
    ops++;
    yield frame(
      'tabulate-fill',
      `F(${k}) = F(${k - 1}) + F(${k - 2}) = ${left} + ${right} = ${left + right}. Both operands are in the same row at smaller columns, so no recursion, no call stack, and no cell can be computed twice.`,
      { current: [cell(1, k)], window: filledIn(1, tab) },
      { k, left, right, value: left + right, ops },
    );
  }

  const fromTab = tab[n] as number;
  yield frame(
    'done',
    `Both rows read F(${n}) = ${fromTab} ${fromMemo === fromTab ? 'and they agree, cell for cell' : 'and they DISAGREE'}. The lesson is not the number: it is that a recurrence whose subproblems are all strictly smaller is order-independent, so you can pay for the recursion (recomputing nothing, but paying a call per level) or pay for memory (the table) and get the same answer.`,
    { answer: [cell(0, n), cell(1, n)], window: [...filledIn(0, memo), ...filledIn(1, tab)] },
    { n, result: fromTab, ops },
  );
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Subproblem indices (F(0) … F(n))',
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

const JS = `function fibonacci(n) {
  const memo = new Array(n + 1).fill(-1);          // @anchor start
  function fib(k) {
    if (memo[k] !== -1) return memo[k];            // @anchor memo-hit
    if (k <= 1) return (memo[k] = k);              // @anchor base-case
    const left = fib(k - 1);                        // @anchor recurse
    const right = fib(k - 2);
    return (memo[k] = left + right);               // @anchor combine
  }
  const answer = fib(n);
  // Same recurrence, same numbers, driven by a loop instead of the stack.
  const tab = [0, 1];                               // @anchor tabulate
  for (let k = 2; k <= n; k++) tab[k] = tab[k - 1] + tab[k - 2];  // @anchor tabulate-fill
  return answer;                                    // @anchor done
}`;

const PY = `def fibonacci(n):
    memo = [-1] * (n + 1)                            # @anchor start
    def fib(k):
        if memo[k] != -1:                            # @anchor memo-hit
            return memo[k]
        if k <= 1:                                   # @anchor base-case
            memo[k] = k
            return k
        left = fib(k - 1)                             # @anchor recurse
        right = fib(k - 2)
        memo[k] = left + right                       # @anchor combine
        return memo[k]
    answer = fib(n)
    # The same recurrence, the same numbers, driven by a loop instead of the stack.
    tab = [0] * (n + 1)                              # @anchor tabulate
    if n >= 1:
        tab[1] = 1
    for k in range(2, n + 1):
        tab[k] = tab[k - 1] + tab[k - 2]             # @anchor tabulate-fill
    return answer                                    # @anchor done`;

const JAVA = `class Fibonacci {
    static int fibonacci(int n) {
        int[] memo = new int[n + 1];
        java.util.Arrays.fill(memo, -1);             // @anchor start
        int answer = fib(n, memo);
        // Same recurrence, same numbers, driven by a loop instead of the stack.
        int[] tab = new int[n + 1];                   // @anchor tabulate
        tab[0] = 0;
        if (n >= 1) tab[1] = 1;
        for (int k = 2; k <= n; k++) tab[k] = tab[k - 1] + tab[k - 2];  // @anchor tabulate-fill
        return answer;                                // @anchor done
    }

    // Java has no pass-by-reference for an int, so the table is threaded through
    // as a parameter. The array is a reference, so the callee still mutates the
    // caller's table in place — which is why the method can return a value and
    // the caller does not need the table back.
    static int fib(int k, int[] memo) {
        if (memo[k] != -1) return memo[k];            // @anchor memo-hit
        if (k <= 1) { memo[k] = k; return k; }        // @anchor base-case
        int left = fib(k - 1, memo);                  // @anchor recurse
        int right = fib(k - 2, memo);
        memo[k] = left + right;                       // @anchor combine
        return memo[k];
    }
}`;

const CPP = `#include <vector>
using std::vector;

// The table is passed by reference (vector<int>&) because C++ copies a vector
// argument by default: without the &, every recursive call would copy the whole
// table and the memo would never be shared. A Java int[] and a Python list are
// both reference-like out of the box, so only C++ needs to be told.
static int fib(int k, vector<int>& memo) {
    if (memo[k] != -1) return memo[k];            // @anchor memo-hit
    if (k <= 1) return (memo[k] = k);             // @anchor base-case
    int left = fib(k - 1, memo);                   // @anchor recurse
    int right = fib(k - 2, memo);
    return (memo[k] = left + right);               // @anchor combine
}

int fibonacci(int n) {
    vector<int> memo(n + 1, -1);                   // @anchor start
    int answer = fib(n, memo);
    // Same recurrence, same numbers, driven by a loop instead of the stack.
    vector<int> tab(n + 1, 0);                     // @anchor tabulate
    tab[0] = 0;
    if (n >= 1) tab[1] = 1;
    for (int k = 2; k <= n; k++) tab[k] = tab[k - 1] + tab[k - 2];  // @anchor tabulate-fill
    return answer;                                 // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'The memo table is an array of -1, chosen because every Fibonacci number is >= 0, so -1 can mean "never solved" without a second structure. JavaScript has no integer overflow, so n = 90 still returns an exact Number here — but the Number is a double, so F(90) is the last value that is *exactly* representable.',
    python:
      'A list of -1, because every Fibonacci number is >= 0, so one sentinel does the work of a separate "solved?" set. `[-1] * (n + 1)` builds it in one shot; Python integers are arbitrary precision, so this function has no upper limit at all — F(2000) computes, given the stack.',
    java: 'An int[] pre-filled with -1, because every Fibonacci number is >= 0. `Arrays.fill` is needed because a fresh int[] is zero-filled, and 0 is a *legitimate* Fibonacci value (F(0)) that would otherwise look pre-solved. The `int` return type is a real ceiling: F(47) = 2,971,215,073 already overflows a 32-bit int, and this would silently return a negative number rather than throw.',
    cpp: 'A vector<int> of -1, constructed with the (count, value) overload so it starts pre-filled. -1 is a safe sentinel because every Fibonacci number is >= 0. `int` is a 32-bit signed type here exactly as in Java, so F(47) and above overflow the same way; the standards-compliant answer is std::int64_t, and the compiler is under no obligation to warn you.',
  },
  'memo-hit': {
    javascript:
      'The only reason the table exists. Without this line the naive version of this function makes F(n) calls; with it, the first visit to a subproblem solves it and every later visit is a read. Note it returns *before* touching `memo[k]` — the caller gets the value, the table is unchanged, so the read is idempotent.',
    python:
      'The only reason the table exists. Without this line the naive version makes F(n) calls; with it, the first visit solves a subproblem and every later visit is a read. Python closures see the enclosing list, so `memo` needs no `nonlocal` — you are mutating an element, not rebinding the name, which is the one case where that distinction does not bite.',
    java: 'The only reason the table exists, and the reason the table is a parameter at all. Java cannot pass an int by reference, but an int[] *is* a reference, so mutating memo[k] inside fib is visible to the caller — no return-the-whole-table dance needed. Change the parameter to int and the memoisation would silently do nothing, which is the classic Java trap.',
    cpp: 'The only reason the table exists. It compiles only because the parameter is `vector<int>&`: with a by-value `vector<int> memo`, each recursive call would get its own copy, write to it, and throw it away — the code would look memoised and behave exponentially. The `&` is the difference between an optimisation and a lie.',
  },
  'base-case': {
    javascript:
      'k <= 1 is the entire base case, and it has to be checked *after* the memo test, not before: F(0) and F(1) are real answers that belong in the table like any other, and putting the base test first would recompute them on every visit.',
    python:
      'k <= 1 is the whole base case, and it is checked *after* the memo test on purpose. F(0) and F(1) are real answers and belong in the table like any other; testing for them first would recompute them on every visit and quietly cost you the memo hit you just added.',
    java: 'k <= 1 is the whole base case, checked *after* the memo test on purpose: F(0) and F(1) are real answers that belong in the table, and testing for them first would recompute them on every visit. The braces are needed because the statement here assigns *and* returns, and Java has no comma-tuple return to fold them together.',
    cpp: 'k <= 1 is the whole base case, checked *after* the memo test: F(0) and F(1) are real answers and belong in the table, so testing for them first would recompute them on every visit. `return (memo[k] = k)` writes the base value into the table as it returns it — a comma expression, which is the C++ way of saying "do the assignment, then hand back its value".',
  },
  recurse: {
    javascript:
      'The only place a new call frame is created, and it happens twice per node. That is the expensive part memoisation is removing: the table kills the *repeated* work, not this line. Read the two calls as "resolve the left operand, blocking until it is done, then resolve the right" — the value of the second call is not even requested until the first returns.',
    python:
      'The only place a new frame is created, and it happens twice per node — that is the cost memoisation removes, not this line. Python keeps its own recursion limit near 1000, which is why the memoised version survives to n ~ 900 while the naive one dies far earlier with RecursionError; the bottom-up loop below has no limit at all.',
    java: "The only place a frame is created, twice per node, and it is the cost memoisation removes rather than the cost it pays. The JVM sizes its stack far more generously than Python's counter — roughly a megabyte of frames — so this is where a deeply recursive Java version throws StackOverflowError rather than returning a wrong answer.",
    cpp: 'The only place a frame is created, twice per node. C++ gives you no recursion limit at all, only the real stack: blow through it and you get a segmentation fault, not an exception, which is the worst of the three failure modes. That is a large part of why the loop below is the version you would actually ship.',
  },
  combine: {
    javascript:
      'Both operands are known numbers, so this is pure arithmetic and it is the only statement that creates a value. The assignment `memo[k] = left + right` happens before the return, so a caller one level up always sees a table with its operands already in place — that ordering is the invariant the whole memo rests on.',
    python:
      'Both operands are known numbers, so this is pure arithmetic, and the only statement in the function that creates a value. `memo[k]` is written before returning, so any caller above this frame finds its operands already in the table. That ordering is the invariant the whole memo rests on.',
    java: 'Both operands are known numbers, so this is pure arithmetic and the only statement that creates a value. The write into memo happens before the return, so the caller above always finds its operands in place. Unlike the local variables, this write reaches the caller, because memo is a shared array rather than a copy.',
    cpp: 'Both operands are known numbers, so this is pure arithmetic and the only statement that creates a value. The write reaches the caller only because memo is a reference parameter; with a by-value vector this line would be invisible above the return and the function would be quietly exponential.',
  },
  tabulate: {
    javascript:
      'The bottom-up pass, and the one you would actually write. Seeding [0, 1] and filling forwards makes every dependency available before it is needed, so there is no call stack, no memo test and no possibility of computing the same cell twice. Note the two rows hold identical numbers — the strategy changed, the recurrence did not.',
    python:
      'The bottom-up pass, and the one you would actually write. Seeding [0, 1] and filling forwards means every dependency exists before it is needed, so there is no call stack, no memo test, and no recursion limit to worry about — this line runs for n = 100000 where the version above raises RecursionError.',
    java: 'The bottom-up pass, and the one you would actually write. Seeding the first two cells and filling forwards means every dependency exists before it is needed: no stack frames, no memo test, no StackOverflowError. tab[0] is written unconditionally while tab[1] needs a guard, because n can legitimately be 0 and Java would throw rather than quietly ignore the out-of-range write.',
    cpp: 'The bottom-up pass, and the one you would actually write: no stack frames, so no stack overflow, and the compiler can hoist the two loads out of the loop. The `if (n >= 1)` guard exists because vector(n + 1) and `[]` do not check that the index you are about to write is in range — bounds checking is off by default in all four of these languages.',
  },
  'tabulate-fill': {
    javascript:
      'One iteration, one cell, no branching at all. This is the shape of most dynamic programs once the base row exists: the recurrence refers only to cells above and to the left, so a single forward sweep is provably enough. There is no way for this loop to do redundant work, which is exactly what the recursive version could not promise.',
    python:
      'One iteration, one cell, no branching. The recurrence refers only to cells earlier in the same row, so a single forward sweep is provably sufficient. No cell can be recomputed, which is the guarantee the recursive version can only make by remembering — and that guarantee is why the bottom-up form is the one to reach for in production code.',
    java: 'One iteration, one cell, no branching. The recurrence only refers to cells earlier in the same row, so a single forward sweep is provably sufficient and the compiler can unroll it. Compare that with the recursive version: identical numbers, but here the work per cell is a fixed three memory reads and one write, and it is all in cache.',
    cpp: 'One iteration, one cell, no branching. Everything the recurrence needs is earlier in the same vector, so a single forward sweep is provably sufficient — and at -O1 the compiler turns it into a couple of registers, since the previous two values are in the same cache line.',
  },
  done: {
    javascript:
      'The function returns the *recursive* answer, not the table\'s, and the table is discarded with it. In JavaScript that silently costs you the only copy of the work: a caller who needs several Fibonacci values must either call again or keep the table, which is why real libraries expose a memoised "create a Fibonacci object" instead of a bare function.',
    python:
      'The function returns the recursive answer and throws the table away, which in Python means the table is garbage-collected the moment this returns. If you needed several values you would build the table once and return it, and that change — returning the table instead of the number — is the practical difference between memoisation and a tabulated generator.',
    java: 'The table is a local array, so it is garbage after this frame and the caller gets only the number. Note the earlier overflow warning applies here: this is a 32-bit int, so past n = 46 the return value is meaningless. A real library would return a long, or make the table a field so it survives between calls.',
    cpp: 'The table is a local vector and dies with the frame, so the caller receives only the number. This is the shape that motivates an object: keep the table as a member, and a second call costs a lookup instead of a rebuild. The free-function form is the right one for a one-shot question and the wrong one for a sequence of them.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'fibonacci',
    python: 'fibonacci',
    java: 'Fibonacci.fibonacci',
    cpp: 'fibonacci',
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

const nOf = (p: Preset): number => Number(p.params?.n ?? 6);

/** The same recurrence, written differently so the claim is not self-fulfilling. */
const fib = (n: number): number => {
  let a = 0;
  let b = 1;
  for (let k = 0; k < n; k++) {
    const t = a + b;
    a = b;
    b = t;
  }
  return a;
};

const expectations: Expectation[] = PRESETS.map((p) => ({
  presetId: p.id,
  args: [nOf(p)],
  result: fib(nOf(p)),
}));

export const fibonacciAlgo: AlgoDef<GridFrame> = {
  id: 'fibonacci',
  title: 'Fibonacci',
  category: 'dynamic-programming',
  summary:
    'Compute each subproblem once by remembering the answers, then compute the same sequence again in increasing order and watch the two agree.',
  intuition:
    'Reach for it the moment you notice a recursive function calling itself with the *same* argument twice. The tell is easy — count the calls, or ask "is any answer used more than once?" — and the fix is always the same: a table keyed by the argument. It is also the cheapest way to see the real question behind DP, which is not "can I memoise this?" but "is there an order in which every dependency is available before its dependent?".',
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(n)',
    note: 'Both strategies are Θ(n) time. The naive recursion is O(φ^n) — about 1.618^n calls — because it re-derives F(k-1) for every k. The n = 20 preset is the whole argument: 21 calls with the table, 13,581 without.',
  },
  traits: {
    stable: true,
    inPlace: false,
    online: false,
    offline: true,
    allowsDuplicates: true,
    tags: ['memoisation', 'tabulation', 'top-down', 'bottom-up', 'recursion'],
  },
  viewport: 'grid',
  level: 'intro',
  params: [
    {
      key: 'n',
      label: 'n (compute F(n))',
      kind: 'number',
      min: 1,
      max: 40,
      step: 1,
      default: 6,
      help: 'Capped at 40 so the table stays on screen — and so F(n) still fits a 32-bit int in Java and C++ (F(47) does not).',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: fibonacci,
  lesson,
  expectations,
  formatResult: (r) => `F(n) = ${r as number}`,
  anchors: [
    'start',
    'memo-hit',
    'base-case',
    'recurse',
    'combine',
    'tabulate',
    'tabulate-fill',
    'done',
  ],
};

export default fibonacciAlgo;
