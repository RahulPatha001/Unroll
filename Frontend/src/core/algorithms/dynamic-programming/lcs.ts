import { byLanguage } from '../../code/anchors.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isWords } from '../../input/types.ts';
import type { CellValue, GridFrame, Highlight } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Longest Common Subsequence — the best DP demo there is, because the answer is
 * a *thing you can see* rather than a number you have to trust.
 *
 * Two details make the table readable instead of a grid of anonymous numbers:
 *
 *  1. **The strings are the headers.** Row `i` is the first `i` characters of
 *     `a`, column `j` is the first `j` characters of `b`. So cell (i, j) is
 *     literally "how much of a's prefix do these two prefixes share?", and a
 *     student can verify any single cell by hand in two seconds.
 *  2. **The cells are tagged `match` / `mismatch`.** The tag records the
 *     *comparison* that produced the cell, which is the one fact about the
 *     pair of characters that decides the whole recurrence.
 *
 * The trace also walks the finished table backwards to recover the subsequence
 * itself. That is half of what LCS means, and it is why the table is worth
 * building: the length is a by-product, the sequence is the product.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const PRESETS: Preset[] = [
  {
    id: 'classic',
    label: 'AGGTAB / GXTXAYB',
    blurb:
      'The textbook pair. The answer is GTAB, length 4, and you can watch the four `match` cells in the last row march diagonally — that staircase *is* the subsequence.',
    input: { type: 'words', values: ['AGGTAB', 'GXTXAYB'] },
    params: { limit: 6 },
  },
  {
    id: 'identical',
    label: 'Same string twice',
    blurb:
      'Every cell on the diagonal matches, so the table is just the identity and the answer is the whole string. The cheapest possible sanity check on a table.',
    input: { type: 'words', values: ['ABCABC', 'ABCABC'] },
    params: { limit: 6 },
  },
  {
    id: 'disjoint',
    label: 'No letter in common',
    blurb:
      'Every cell is a `mismatch`, every value is 0, and the subsequence is the empty string. A DP table that has an all-zero answer is telling you the answer is 0 — not that it failed.',
    input: { type: 'words', values: ['ABC', 'XYZ'] },
    params: { limit: 6 },
  },
  {
    id: 'with-space',
    label: 'A real sentence',
    blurb:
      'Includes a space, which the viewport renders as ␣ so an alignment mistake in the headers is visible. LCS is how diff and "what changed" tools decide that a line *moved* rather than being deleted and retyped.',
    input: { type: 'words', values: ['the quick fox', 'quick brown fox'] },
    params: { limit: 9 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

export function* lcs(ctx: RunContext): Generator<GridFrame> {
  const words: string[] = isWords(ctx.input) ? ctx.input.values : [];
  const limit = Math.max(1, Math.min(10, Math.trunc(Number(ctx.params.limit ?? 6)) || 6));
  const a = [...(words[0] ?? 'ABC')].slice(0, limit).join('');
  const b = [...(words[1] ?? 'ABC')].slice(0, limit).join('');

  const rows = a.length + 1;
  const cols = b.length + 1;
  const cell = (row: number, col: number): number => row * cols + col;

  const dp: number[] = new Array<number>(rows * cols).fill(0);
  const tags: Record<number, string> = {};
  /** Cells the backward walk has claimed, so the staircase is visible as it grows. */
  const claimed: number[] = [];
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
    // The empty leading entry is the corner of the table, not a character.
    rowHeader: ['', ...a.split('')],
    colHeader: ['', ...b.split('')],
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
    `Two strings, one table. Row i is the first i characters of "${a}", column j is the first j of "${b}", and cell (i, j) holds the length of the longest common subsequence of those two *prefixes*. The headers are the string characters themselves, so any cell can be checked by hand.`,
    { window: [] },
    { m: a.length, n: b.length, ops },
  );

  yield frame(
    'base',
    'Row 0 and column 0 are 0 because a prefix against nothing shares nothing. These are the only cells that are not the result of a comparison, and every other cell refers back to them, so the sweep can start at the top-left corner and move right and down.',
    { window: [...rowCells(0), ...colCells(0)] },
    { m: a.length, n: b.length, ops },
  );

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (ctx.shouldStop()) return;
      ops++;
      const chA = a[i - 1] as string;
      const chB = b[j - 1] as string;
      const same = chA === chB;
      const up = dp[cell(i - 1, j)] as number;
      const left = dp[cell(i, j - 1)] as number;
      const value = same ? (dp[cell(i - 1, j - 1)] as number) + 1 : Math.max(up, left);
      dp[cell(i, j)] = value;
      tags[cell(i, j)] = same ? 'match' : 'mismatch';

      yield frame(
        same ? 'match' : 'mismatch',
        same
          ? `Both prefixes end in "${chA}", so the characters are the same and this cell is the diagonal neighbour plus one: ${dp[cell(i - 1, j - 1)]} + 1 = ${value}. Taking a matching pair is always at least as good as dropping one of the letters, which is why this branch never compares against the neighbours.`
          : `"${chA}" against "${chB}" — different, so the pair cannot be used and the best of the two prefixes is the best of the two prefixes above and to the left: max(${up}, ${left}) = ${value}.`,
        {
          compare: [cell(i - 1, j - 1), cell(i - 1, j), cell(i, j - 1)],
          current: [cell(i, j)],
          window: rowCells(i),
        },
        { i, j, a: chA, b: chB, value, ops },
      );
    }
  }

  const length = dp[cell(a.length, b.length)] as number;
  yield frame(
    'trace',
    `The table is finished and says ${length}, but a length is not an answer anybody wanted. Walk back from the bottom-right corner: at every step, if the two characters match, that character is in the subsequence, so claim the cell and step diagonally.`,
    { current: [cell(a.length, b.length)], path: [...claimed], window: rowCells(a.length) },
    { i: a.length, j: b.length, length, ops },
  );

  let i = a.length;
  let j = b.length;
  const sub: string[] = [];
  while (i > 0 && j > 0) {
    if (ctx.shouldStop()) return;
    ops++;
    const chA = a[i - 1] as string;
    const chB = b[j - 1] as string;
    if (chA === chB) {
      claimed.push(cell(i, j));
      sub.push(chA);
      i--;
      j--;
      yield frame(
        'pick',
        `"${chA}" is in both prefixes at this corner, so it is part of the answer: step to the diagonal and keep going. The claimed cells will form a staircase, and the characters along it are the subsequence in order.`,
        { answer: [...claimed], current: [cell(i + 1, j + 1)], path: [...claimed] },
        { i: i + 1, j: j + 1, picked: [...sub].reverse().join(''), ops },
      );
    } else {
      const up = dp[cell(i - 1, j)] as number;
      const left = dp[cell(i, j - 1)] as number;
      if (up >= left) i--;
      else j--;
      yield frame(
        'trace',
        `The corner characters "${chA}" and "${chB}" differ, so nothing is claimed here — the sequence must live in one of the two neighbours, and the larger of their values (${up} above against ${left} to the left) is the only one worth walking into.`,
        { answer: [...claimed], current: [cell(i, j)], path: [...claimed] },
        { i, j, a: chA, b: chB, up, left, ops },
      );
    }
  }

  yield frame(
    'done',
    `The staircase is complete: "${sub.reverse().join('')}", length ${length}. Note the asymmetry in what the table stores — it stores only lengths, and the walk-back recovers the sequence, so the table is 4 bytes per cell in C and a whole second pass to use. A real LCS library often stores a byte per cell saying which neighbour won, precisely to avoid the second pass.`,
    { answer: [...claimed], current: [cell(0, 0)] },
    { length, result: sub.join(''), ops },
  );
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Two strings to compare',
      kind: 'words' as const,
      default: PRESETS[0]?.input.type === 'words' ? PRESETS[0].input.values : [],
    },
  ],
  build: (values: Record<string, unknown>): AlgoInput => ({
    type: 'words',
    values: Array.isArray(values.values) ? (values.values as string[]) : [],
  }),
  sizeOf: (input: AlgoInput): number => (input.type === 'words' ? input.values.length : 0),
};

/* ------------------------------------------------------------------ *
 * 4. The lesson — four languages, one set of anchors
 * ------------------------------------------------------------------ */

const JS = `function lcs(a, b) {
  const m = a.length, n = b.length;                              // @anchor start
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));  // @anchor base
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;   // @anchor match
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);         // @anchor mismatch
    }
  }
  // The table holds lengths; the walk below turns a length back into a string.
  let i = m, j = n;                                             // @anchor trace
  const chosen = [];
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { chosen.push(a[i - 1]); i--; j--; }  // @anchor pick
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  return dp[m][n];                                              // @anchor done
}`;

const PY = `def lcs(a, b):
    m, n = len(a), len(b)                                        # @anchor start
    dp = [[0] * (n + 1) for _ in range(m + 1)]                   # @anchor base
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1                   # @anchor match
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])        # @anchor mismatch
    # The table holds lengths; the walk below turns a length back into a string.
    i, j = m, n                                                  # @anchor trace
    chosen = []
    while i > 0 and j > 0:
        if a[i - 1] == b[j - 1]:
            chosen.append(a[i - 1])                              # @anchor pick
            i -= 1
            j -= 1
        elif dp[i - 1][j] >= dp[i][j - 1]:
            i -= 1
        else:
            j -= 1
    return dp[m][n]                                              # @anchor done`;

const JAVA = `class Lcs {
    static int lcs(String a, String b) {
        int m = a.length(), n = b.length();                      // @anchor start
        int[][] dp = new int[m + 1][n + 1];                      // @anchor base
        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                if (a.charAt(i - 1) == b.charAt(j - 1)) dp[i][j] = dp[i - 1][j - 1] + 1;  // @anchor match
                else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);                       // @anchor mismatch
            }
        }
        // The table holds lengths; the walk below turns a length back into a string.
        int i = m, j = n;                                         // @anchor trace
        StringBuilder chosen = new StringBuilder();
        while (i > 0 && j > 0) {
            if (a.charAt(i - 1) == b.charAt(j - 1)) {             // @anchor pick
                chosen.append(a.charAt(i - 1));
                i--;
                j--;
            } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
            else j--;
        }
        return dp[m][n];                                          // @anchor done
    }
}`;

const CPP = `#include <string>
#include <vector>
using std::string;
using std::vector;

// The strings arrive by value, because that is how the verification driver
// builds them from JSON; a production signature would take const string& and
// avoid the copy, with identical behaviour.
int lcs(string a, string b) {
    int m = (int)a.size(), n = (int)b.size();                     // @anchor start
    vector<vector<int> > dp(m + 1, vector<int>(n + 1, 0));        // @anchor base
    for (int i = 1; i <= m; i++) {
        for (int j = 1; j <= n; j++) {
            if (a[i - 1] == b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;   // @anchor match
            else dp[i][j] = std::max(dp[i - 1][j], dp[i][j - 1]);        // @anchor mismatch
        }
    }
    // The table holds lengths; the walk below turns a length back into a string.
    int i = m, j = n;                                             // @anchor trace
    string chosen;
    while (i > 0 && j > 0) {
        if (a[i - 1] == b[j - 1]) {                               // @anchor pick
            chosen += a[i - 1];
            i--;
            j--;
        } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
        else j--;
    }
    return dp[m][n];                                              // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'Two lengths, and nothing else is needed up front. JavaScript strings are UTF-16 code units, so a[i - 1] is a *code unit*, not a user-perceived character: an emoji or an accented letter made of two units is two "characters" here, which silently gives a wrong answer for non-BMP text. `codePointAt` is the fix and it changes the table shape too.',
    python:
      'Two lengths. Python 3 strings are sequences of code points rather than UTF-16 units, so a[i - 1] really is one user-perceived character and the emoji problem the other three languages have does not arise. That is not free — indexing a Python str is O(1) only because every str is interned as compact UCS-4, which costs memory.',
    java: 'Two lengths. `charAt` returns a UTF-16 code unit, exactly like the JavaScript indexing above, so a surrogate pair counts as two characters and the table will happily compute an LCS of a string no human would recognise. Java has no built-in "code point at index" — you reach for `codePoints().toArray()` and change the table shape.',
    cpp: 'Two lengths. `std::string::operator[]` returns a char, and for UTF-8 a single accented letter is *several* bytes, so this computes an LCS over bytes rather than characters. A UTF-8-aware version decodes first and works on code points — again, a change of index type, not of algorithm. The parameters are by value only because that is how the harness builds them; a real signature would take `const string&`.',
  },
  base: {
    javascript:
      'Row 0 and column 0 are 0 because a prefix against nothing shares nothing. `Array.from({length: m+1}, ...)` builds m + 1 *independent* inner arrays — the same trap as the Python list comprehension, and `new Array(n + 1).fill(0)` is needed because a bare `new Array(n + 1)` would be full of holes, which render as `undefined` rather than 0.',
    python:
      'Row 0 and column 0 are 0 because a prefix against nothing shares nothing. The comprehension rebuilds the inner list for every row, so the rows are not aliased — writing `[[0] * (n + 1)] * (m + 1)` instead would give m + 1 references to *one* list, and every row would silently overwrite every other.',
    java: 'Row 0 and column 0 are 0 because a prefix against nothing shares nothing, and a fresh int[][] is already zeroed, so there is no fill step to forget. That is a real advantage over JavaScript and C++ here: neither of those languages gives you a zeroed table for free, and forgetting the fill is a bug that shows up as NaN rather than as a crash.',
    cpp: "Row 0 and column 0 are 0 because a prefix against nothing shares nothing, and `vector<int>(n + 1, 0)` zero-initialises. Note that vector's constructor *copies* the inner vector once per row, so this line allocates m + 1 times; a flattened `vector<int>((m+1)*(n+1))` with `dp[i*stride + j]` is the same algorithm with one allocation and better cache behaviour.",
  },
  match: {
    javascript:
      'The two prefixes end in the same character, so that character is free to extend whatever the prefixes *without* it shared. Skipping it is never better: any common subsequence that drops this final pair can be re-extended with it, so the diagonal plus one is provably optimal and needs no comparison with the neighbours.',
    python:
      'The two prefixes end in the same character, so it extends whatever the shorter prefixes shared. Skipping it is never better — any subsequence that drops this final pair can be re-extended with it — so the diagonal plus one is provably optimal, and that is why this branch never compares against the neighbours.',
    java: 'The two prefixes end in the same character, so it extends whatever the shorter prefixes shared. Skipping it is never better, so the diagonal plus one is provably optimal and needs no comparison. The `charAt` comparison is a reference comparison on chars, not a `String.equals` call, because these are single characters — comparing one-character substrings with `equals` would be correct and needlessly slow.',
    cpp: 'The two prefixes end in the same character, so it extends whatever the shorter prefixes shared, and skipping it is never better. Note the parameter types: `const string&` means no copy, and comparing `a[i-1] == b[j-1]` compares chars, so the whole inner loop is pointer arithmetic on two contiguous buffers — about as fast as an LCS table can be made.',
  },
  mismatch: {
    javascript:
      'Different characters, so the pair is unusable and the answer is the better of the two shorter prefixes. Both neighbours are already final, so this cell costs a compare and a max — no search, no recursion. `Math.max` is a variadic builtin, which is why the two-argument case reads as cleanly here as anywhere.',
    python:
      'Different characters, so the pair is unusable and the answer is the better of the two shorter prefixes. `max` is a builtin here too, and takes any number of arguments — the same variadic shape as Math.max, which is why this line is one call rather than an if/else in every language.',
    java: 'Different characters, so the pair is unusable and the answer is the better of the two shorter prefixes. `Math.max` is a static call rather than a language feature, so the line is longer than its Python equivalent for no reason other than history — which is a decent proxy for how much ceremony the same algorithm attracts in each language.',
    cpp: 'Different characters, so the pair is unusable and the answer is the better of the two shorter prefixes. `std::max` is a template, so it needs `<algorithm>` and the `std::` prefix, and it returns a *reference* to one of its arguments — the copy into the cell is what actually stores the value.',
  },
  trace: {
    javascript:
      'The table is finished, but a length is not what anybody asked for. The walk starts at the bottom-right corner and only ever moves left, up, or diagonally up-left; it terminates because every move strictly decreases i + j, so the recursion depth you would get from the same logic is bounded by m + n rather than by mn.',
    python:
      'The table is finished, but a length is not what anybody asked for. The walk starts at the bottom-right corner and only moves left, up or diagonally, so it terminates after at most m + n steps. Python could also find this by recursion with an lru_cache — the memoised version is arguably the more natural thing to write in Python, and it gives the same answer in the same order.',
    java: 'The table is finished, but a length is not what anybody asked for. The corner is (m, n) and every move strictly decreases i + j, so at most m + n iterations. Note that the `StringBuilder` is built back-to-front here; a real API would `reverse()` it, because LCS can only be recovered in one direction from the table as stored.',
    cpp: 'The table is finished, but a length is not what anybody asked for. The corner is (m, n) and every move strictly decreases i + j. `chosen` accumulates in reverse order and is never reversed here, because the function returns the length; had it returned the string it would need `std::reverse` first, which is the one piece of post-processing this walk always needs.',
  },
  pick: {
    javascript:
      'The two characters are equal, so this character is definitely in the answer and both indices step back at once. Every cell claimed this way lies on a diagonal staircase, and reading the characters along it gives the subsequence in order — that staircase is what the animation draws, and it is the part of LCS that is genuinely hard to reconstruct.',
    python:
      'The two characters are equal, so this character is in the answer and both indices step back at once. `chosen.append` pushes onto a list, which is O(1) amortised; `chosen.insert(0, c)` would be O(n) per character and turn a linear walk into a quadratic one. The claimed cells form the diagonal staircase the animation draws.',
    java: 'The two characters are equal, so this character is in the answer and both indices step back at once. `StringBuilder.append` is amortised O(1) and, unlike `String`, does not copy the whole buffer on every append — a detail that matters here because the same pattern is catastrophic when people use string concatenation in a loop.',
    cpp: "The two characters are equal, so this character is in the answer and both indices step back at once. `chosen += a[i-1]` appends in amortised O(1) via `std::string`'s capacity doubling; if the buffer were a `char*` this would be a realloc per character. Neither language lets you index a string as if it were an array of ints, which is why the walk is a loop rather than a range expression.",
  },
  done: {
    javascript:
      'The length is returned, not the string — which is a deliberate mismatch worth noticing. The table stores only lengths, so the caller gets a number and the staircase stays private. If you need the sequence, either return it or store one byte per cell recording which neighbour won, and pay O(mn) memory instead of a second pass.',
    python:
      "The length is returned, not the string. The table stores only lengths, so the walk above is thrown away. Returning `''.join(reversed(chosen))` instead would be the other API, and then you would keep the O(mn) table in memory anyway — so for a one-shot question the length is the cheaper contract, not a worse one.",
    java: 'The length is returned, not the string, so `chosen` is dead on arrival. A library that wanted the sequence would store a byte per cell saying which neighbour won and walk forward, trading O(mn) extra memory for not needing a second pass. The int[][] itself would be 4 bytes per cell here and would be the dominant allocation for long strings.',
    cpp: 'The length is returned, not the string. The nested vector is the real memory cost here — (m + 1) * (n + 1) ints, so two 2000-character strings need 16 MB — and a memory-conscious implementation keeps a single row plus a direction bit per cell, which is the standard trick when the *sequence* is needed and the *table* is not.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'lcs',
    python: 'lcs',
    java: 'Lcs.lcs',
    cpp: 'lcs',
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

const pairOf = (p: Preset): [string, string] => {
  const w = p.input.type === 'words' ? p.input.values : [];
  const limit = Math.max(1, Math.min(10, Number(p.params?.limit ?? 6)));
  return [
    [...(w[0] ?? 'ABC')].slice(0, limit).join(''),
    [...(w[1] ?? 'ABC')].slice(0, limit).join(''),
  ];
};

/**
 * The same recurrence, evaluated top-down with memoisation instead of
 * bottom-up into a table — a different implementation that must agree on the
 * length. (A greedy two-pointer scan would *not* do: it is only correct on
 * sorted strings, which is a genuinely useful thing for a student to be wrong
 * about.)
 */
const lcsLength = (a: string, b: string): number => {
  const memo = new Map<string, number>();
  const go = (i: number, j: number): number => {
    if (i === 0 || j === 0) return 0;
    const key = `${i},${j}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const value =
      a[i - 1] === b[j - 1] ? go(i - 1, j - 1) + 1 : Math.max(go(i - 1, j), go(i, j - 1));
    memo.set(key, value);
    return value;
  };
  return go(a.length, b.length);
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const [a, b] = pairOf(p);
  return { presetId: p.id, args: [a, b], result: lcsLength(a, b) };
});

export const lcsAlgo: AlgoDef<GridFrame> = {
  id: 'lcs',
  title: 'Longest Common Subsequence',
  category: 'dynamic-programming',
  summary:
    'Build a table of how much each pair of prefixes shares, then walk it backwards to recover the shared sequence itself.',
  intuition:
    'Reach for it when you have two orderings of overlapping content and need to know what survived the difference — two versions of a file, two DNA strands, two revisions of a spec. It is *not* a substring search: the shared characters may be scattered across both inputs, which is why the naive "find the longest run" heuristic is wrong in a way that only shows up on real data. If you need characters adjacent as well as in order, that is longest common substring and it is a different, much simpler table.',
  complexity: {
    best: 'O(mn)',
    average: 'O(mn)',
    worst: 'O(mn)',
    space: 'O(mn)',
    note: 'Every cell is constant work, so there is no interesting best case. The table is irreducible for reconstruction but not for the length: keeping two rows instead of the whole table drops space to O(n) and still gives the exact answer, at the cost of a second pass to recover the sequence.',
  },
  traits: {
    stable: true,
    inPlace: false,
    online: false,
    offline: true,
    allowsDuplicates: true,
    tags: ['table', 'strings', 'reconstruction', 'quadratic'],
  },
  viewport: 'grid',
  level: 'intermediate',
  params: [
    {
      key: 'limit',
      label: 'Max string length',
      kind: 'number',
      min: 1,
      max: 10,
      step: 1,
      default: 6,
      help: 'Truncates both strings so the (m+1) x (n+1) table stays on screen.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: lcs,
  lesson,
  expectations,
  formatResult: (r) => `length ${r as number}`,
  anchors: ['start', 'base', 'match', 'mismatch', 'trace', 'pick', 'done'],
};

export default lcsAlgo;
