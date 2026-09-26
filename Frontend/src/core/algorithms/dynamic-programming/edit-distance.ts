import { byLanguage } from '../../code/anchors.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isWords } from '../../input/types.ts';
import type { CellValue, GridFrame, Highlight } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Edit Distance — the same table shape as LCS with three candidates instead of
 * two, and that is the entire difference between the two algorithms.
 *
 * Levenshtein distance counts single-character insertions, deletions and
 * substitutions. Every cell answers "how many edits turn a's first i characters
 * into b's first j characters?", and the three candidates are the three ways
 * the last step could have gone:
 *
 *   diag      — match or substitute: both prefixes shrink by one, cost 0 or 1
 *   fromAbove — delete from a: a's prefix shrinks, b's does not, cost 1
 *   fromLeft  — insert into a: b's prefix shrinks, a's does not, cost 1
 *
 * All five tag names in the grid renderer earn their keep here, because they
 * answer two different questions and the legend keeps them apart: the *tag* says
 * what the characters were (`match` / `mismatch`), the *highlight* says which
 * neighbour the winning number came from. A cell that is a `mismatch` and a
 * `fromAbove` is telling you two independent facts, and both matter.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const PRESETS: Preset[] = [
  {
    id: 'one-substitution',
    label: 'kitten / sitting',
    blurb:
      'The canonical example: distance 3. The whole cost is one substitution (e → s) plus two insertions, and the diagonal staircase shows exactly which three cells paid.',
    input: { type: 'words', values: ['kitten', 'sitting'] },
    params: { limit: 7 },
  },
  {
    id: 'identical',
    label: 'Same string twice',
    blurb:
      'Distance 0. Every cell is a `match` taken from the diagonal, the table is the identity, and this is the check that costs nothing and catches every off-by-one in the base row.',
    input: { type: 'words', values: ['banana', 'banana'] },
    params: { limit: 6 },
  },
  {
    id: 'insert-only',
    label: 'cat / catalog',
    blurb:
      'One string is a prefix of the other, so every extra character is an insertion and every answer comes from the cell to the left. No substitution ever wins here.',
    input: { type: 'words', values: ['cat', 'catalog'] },
    params: { limit: 7 },
  },
  {
    id: 'disjoint',
    label: 'abc / xyz',
    blurb:
      'No character in common, so the answer is the length of the longer string and every cell is a tie between the three candidates. The `mismatch` ring plus a highlight that jumps around is what an ambiguous cell looks like.',
    input: { type: 'words', values: ['abc', 'xyz'] },
    params: { limit: 6 },
  },
  {
    id: 'larger',
    label: '8 + 8 characters',
    blurb:
      'Past the size you can check by eye. The last row is a running edit-distance-to-prefix table, and the last column is the same thing the other way round — which is how a diff tool finds the cheapest edit script.',
    input: { type: 'words', values: ['flawless', 'lawnless'] },
    params: { limit: 8 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

export function* editDistance(ctx: RunContext): Generator<GridFrame> {
  const words: string[] = isWords(ctx.input) ? ctx.input.values : [];
  const limit = Math.max(1, Math.min(10, Math.trunc(Number(ctx.params.limit ?? 7)) || 7));
  const a = [...(words[0] ?? 'abc')].slice(0, limit).join('');
  const b = [...(words[1] ?? 'abc')].slice(0, limit).join('');

  const rows = a.length + 1;
  const cols = b.length + 1;
  const cell = (row: number, col: number): number => row * cols + col;

  const dp: number[] = new Array<number>(rows * cols).fill(0);
  const tags: Record<number, string> = {};
  /** Where the winning number in each cell came from, as highlight keys. */
  const from: Highlight = {};
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
    `"${a}" down the rows, "${b}" across the columns, and cell (i, j) is the number of single-character edits that turn the first i characters of one into the first j of the other. The empty corner entries are the base cases, and everything else is the cheapest of three ways to end.`,
    { window: [] },
    { m: a.length, n: b.length, ops },
  );

  yield frame(
    'base',
    'Row 0 and column 0 are 0 because an empty string converts into a prefix for free — well, not for free, but the *distance* is just the length, so the whole first row is 0, 1, 2, 3… one insertion per character. Same down column 0, one deletion each. These are the only cells with no character comparison behind them.',
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
      const cost = same ? 0 : 1;
      const diag = (dp[cell(i - 1, j - 1)] as number) + cost;
      const above = (dp[cell(i - 1, j)] as number) + 1;
      const left = (dp[cell(i, j - 1)] as number) + 1;
      const best = Math.min(diag, above, left);

      tags[cell(i, j)] = same ? 'match' : 'mismatch';
      const tagDiag = cell(i - 1, j - 1);
      const tagAbove = cell(i - 1, j);
      const tagLeft = cell(i, j - 1);

      yield frame(
        same ? 'match' : 'mismatch',
        same
          ? `Both prefixes end in "${chA}", so no edit is needed for this pair: the cell is the diagonal ${dp[cell(i - 1, j - 1)] as number} + 0. When the characters match, the diagonal is not merely the cheapest option, it is provably optimal — a deletion or an insertion would cost 1 more and could not save anything further along.`
          : `"${chA}" against "${chB}" — a substitution, which costs 1. The diagonal is ${dp[cell(i - 1, j - 1)] as number} + 1 = ${diag}. This is the only candidate that consumes a character from *both* strings, which is why it is the one to check first.`,
        {
          compare: [tagDiag],
          current: [cell(i, j)],
          window: rowCells(i),
        },
        { i, j, a: chA, b: chB, cost, diag, ops },
      );

      yield frame(
        'diag',
        `Candidate: substitute. ${dp[cell(i - 1, j - 1)] as number} + ${cost} = ${diag}, from the cell diagonally up-left. One edit, and both prefixes shrink by one character.`,
        { compare: [tagDiag], current: [cell(i, j)], window: rowCells(i) },
        { i, j, diag, ops },
      );

      yield frame(
        'fromAbove',
        `Candidate: delete "${chA}". The cell above is ${dp[cell(i - 1, j)] as number}, and removing one character from a costs 1, so ${dp[cell(i - 1, j)] as number} + 1 = ${above}. Note this candidate never looks at "${chB}" — it consumes a character of a only.`,
        { compare: [tagAbove], current: [cell(i, j)], window: rowCells(i) },
        { i, j, above, ops },
      );

      yield frame(
        'fromLeft',
        `Candidate: insert "${chB}". The cell to the left is ${dp[cell(i, j - 1)] as number}, and adding one character of b costs 1, so ${dp[cell(i, j - 1)] as number} + 1 = ${left}. This is the candidate that reads the row being written, which is why a left-to-right sweep is required.`,
        { compare: [tagLeft], current: [cell(i, j)], window: rowCells(i) },
        { i, j, left, ops },
      );

      const tied = [diag, above, left].filter((v) => v === best).length > 1;
      dp[cell(i, j)] = best;
      const winner = best === diag ? 'diag' : best === above ? 'fromAbove' : 'fromLeft';
      const fromKey = winner;
      from[fromKey] = [...(from[fromKey] ?? []), cell(i, j)];

      yield frame(
        'best',
        tied
          ? `All three candidates meet at ${best}, so this cell is ${best} and the table genuinely does not say which edit to make. Any of the three is a valid first move, and the rest of the algorithm will find out which one finishes cheapest.`
          : `The cheapest is ${best}, from the ${winner === 'diag' ? 'diagonal' : winner === 'fromAbove' ? 'cell above' : 'cell to the left'} — ${winner === 'diag' ? `one ${cost === 0 ? 'free match' : 'substitution'}` : winner === 'fromAbove' ? `deleting "${chA}"` : `inserting "${chB}"`}. That is the last edit of an optimal script for this pair of prefixes.`,
        { ...from, current: [cell(i, j)], window: rowCells(i) },
        { i, j, diag, above, left, best, ops },
      );
    }
  }

  const answer = dp[cell(a.length, b.length)] as number;
  yield frame(
    'done',
    `The bottom-right cell is ${answer} edit${answer === 1 ? '' : 's'}. Two sanity checks that catch almost every bug: the last row never decreases, and the last column never decreases either — both are true because adding a character to a prefix can never make the answer cheaper.`,
    { answer: [cell(a.length, b.length)], window: [...rowCells(a.length), ...colCells(b.length)] },
    { distance: answer, ops },
  );
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Two strings to convert',
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

const JS = `function editDistance(a, b) {
  const m = a.length, n = b.length;                              // @anchor start
  // Row 0 and column 0 are the length of the other prefix: one edit per char.
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : i)));  // @anchor base
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      // Same character: no edit needed. Different: pay 1 to substitute.
      // One line, two outcomes: cost 0 on a match, 1 on a substitution. Both
      // anchors resolve here, because the line is the same either way.
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;                // @anchor match  @anchor mismatch
      const diag = dp[i - 1][j - 1] + cost;                      // @anchor diag
      const above = dp[i - 1][j] + 1;                           // @anchor fromAbove
      const left = dp[i][j - 1] + 1;                            // @anchor fromLeft
      dp[i][j] = Math.min(diag, above, left);                   // @anchor best
    }
  }
  return dp[m][n];                                              // @anchor done
}`;

const PY = `def edit_distance(a, b):
    m, n = len(a), len(b)                                        # @anchor start
    # Row 0 and column 0 are the length of the other prefix: one edit per char.
    dp = [[j if i == 0 else i for j in range(n + 1)] for i in range(m + 1)]  # @anchor base
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            # Same character: no edit needed. Different: pay 1 to substitute.
            # One line, two outcomes: cost 0 on a match, 1 on a substitution. Both
            # anchors resolve here, because the line is the same either way.
            cost = 0 if a[i - 1] == b[j - 1] else 1              # @anchor match  @anchor mismatch
            diag = dp[i - 1][j - 1] + cost                       # @anchor diag
            above = dp[i - 1][j] + 1                             # @anchor fromAbove
            left = dp[i][j - 1] + 1                              # @anchor fromLeft
            dp[i][j] = min(diag, above, left)                    # @anchor best
    return dp[m][n]                                              # @anchor done`;

const JAVA = `class EditDistance {
    static int editDistance(String a, String b) {
        int m = a.length(), n = b.length();                      // @anchor start
        // Row 0 and column 0 are the length of the other prefix: one edit per char.
        int[][] dp = new int[m + 1][n + 1];                      // @anchor base
        for (int i = 0; i <= m; i++) dp[i][0] = i;
        for (int j = 0; j <= n; j++) dp[0][j] = j;
        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                // Same character: no edit needed. Different: pay 1 to substitute.
                // One line, two outcomes: cost 0 on a match, 1 on a substitution.
                // Both anchors resolve here, because the line is the same either way.
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;   // @anchor match  @anchor mismatch
                int diag = dp[i - 1][j - 1] + cost;               // @anchor diag
                int above = dp[i - 1][j] + 1;                    // @anchor fromAbove
                int left = dp[i][j - 1] + 1;                     // @anchor fromLeft
                dp[i][j] = Math.min(diag, Math.min(above, left));  // @anchor best
            }
        }
        return dp[m][n];                                          // @anchor done
    }
}`;

const CPP = `#include <algorithm>
#include <string>
#include <vector>
using std::string;
using std::vector;

int edit_distance(string a, string b) {
    int m = (int)a.size(), n = (int)b.size();                     // @anchor start
    // Row 0 and column 0 are the length of the other prefix: one edit per char.
    vector<vector<int> > dp(m + 1, vector<int>(n + 1, 0));        // @anchor base
    for (int i = 0; i <= m; i++) dp[i][0] = i;
    for (int j = 0; j <= n; j++) dp[0][j] = j;
    for (int i = 1; i <= m; i++) {
        for (int j = 1; j <= n; j++) {
            // Same character: no edit needed. Different: pay 1 to substitute.
            // One line, two outcomes: cost 0 on a match, 1 on a substitution.
            // Both anchors resolve here, because the line is the same either way.
            int cost = (a[i - 1] == b[j - 1]) ? 0 : 1;            // @anchor match  @anchor mismatch
            int diag = dp[i - 1][j - 1] + cost;                   // @anchor diag
            int above = dp[i - 1][j] + 1;                        // @anchor fromAbove
            int left = dp[i][j - 1] + 1;                         // @anchor fromLeft
            dp[i][j] = std::min(diag, std::min(above, left));     // @anchor best
        }
    }
    return dp[m][n];                                              // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'The two lengths, and the only setup the algorithm needs. As in LCS, `a[i - 1]` is a UTF-16 code unit rather than a user-perceived character, so an emoji counts as two characters here and the distance comes out too high — a real spell-checker has to normalise to code points first.',
    python:
      'The two lengths. Python 3 strings are sequences of code points, so `a[i - 1]` is one user-perceived character and the emoji problem the other three have does not exist. Strings are immutable and interned as compact UCS-4, so that correctness is paid for in memory rather than in code.',
    java: "The two lengths, and `charAt` is a UTF-16 code unit, so a surrogate pair is two edits rather than one. `String.codePoints().toArray()` would fix it and change the table's element type from char to int — again, a change of index type, not of algorithm.",
    cpp: 'The two lengths. `std::string` is a byte string, so a multi-byte UTF-8 letter is several *edits* here rather than one; a UTF-8-aware version decodes first. The parameters are by value only because that is how the verification harness builds them — a production signature would take `const string&` and copy nothing.',
  },
  base: {
    javascript:
      'The base row and column are built by the *initialiser* rather than by a fill, because here they are not all zero: converting an empty string into a prefix of length j takes j insertions, so row 0 is 0, 1, 2, 3… and column 0 is 0, 1, 2, 3… Getting this wrong is the classic edit-distance bug, because the table still produces a plausible number.',
    python:
      'The base row and column come from the initialiser, and they are not zeros: an empty string to a prefix of length j is j insertions, so row 0 counts up and column 0 counts up. The nested comprehension builds each cell from its own (i, j), which is the one way to get both borders right in a single expression.',
    java: 'The base row and column are not zeros — they are `i` and `j`. Two separate loops set the two borders, because a fresh int[][] is zeroed and an edit distance of 0 for every prefix pair would make the whole table collapse to 0. Compare LCS, where zeros *were* the right base case: the borders are where the two algorithms differ most visibly.',
    cpp: 'The base row and column are `i` and `j`, not zeros. The vector constructor initialises the borders to 0 and then two loops overwrite them, which is one more pass than necessary — a flat 1-D table with a stride would let the borders be filled in the same sweep as everything else.',
  },
  match: {
    javascript:
      'The cost of the last character pair: 0 if the characters agree, 1 if they do not. That single ternary is the whole difference between Levenshtein distance and its cousin Damerau-Levenshtein, which also allows *transposition* of two adjacent characters and needs a fourth candidate reading a cell two positions up and two to the left.',
    python:
      "The cost of the last character pair: 0 if the characters agree, 1 if not. `0 if … else 1` is Python's conditional expression, which is why the line is an assignment rather than an if/else block — the same shape as `cond ? 0 : 1` in C-family languages, and the reason all four listings have one line here.",
    java: 'The cost of the last character pair, as a conditional expression. Java has exactly one ternary and it is an *expression*, so it can sit on the right of `=`; C and Go have none at all, which is why those languages would need an if/else statement spanning two lines for the same idea.',
    cpp: 'The cost of the last character pair. C++ has the ternary but no way to elide the parentheses around it, so the comparison needs its own bracketing — a small syntactic tax that exists because the ternary has lower precedence than `==`.',
  },
  mismatch: {
    javascript:
      'The two characters differ, so the diagonal candidate costs 1 rather than 0. The recurrence does not change shape: a substitution is the diagonal candidate with a cost, and that is the *only* difference from the match case. A `mismatch` ring on a cell therefore means "this pair of characters was rewritten", which is exactly what a diff wants to show.',
    python:
      'The two characters differ, so the diagonal candidate costs 1. The recurrence does not change shape — a substitution is the diagonal candidate plus a cost — and a `mismatch` cell is a cell where one character was rewritten. The ring is on the *cell*, not on the characters, so the viewport never shows the characters themselves, only the verdict on that pair.',
    java: 'The two characters differ, so the diagonal candidate costs 1. `charAt` is compared directly rather than via a one-character `String.equals`, which would be correct and needlessly slow — comparing chars is a primitive comparison, and this table does three of them per cell.',
    cpp: 'The two characters differ, so the diagonal candidate costs 1. Comparing `char`s is locale-independent and fast, but it also means the distance is computed over bytes for UTF-8 input: a multi-byte letter is several substitutions instead of one, and no amount of care in the recurrence will fix that.',
  },
  diag: {
    javascript:
      'Substitute, or match for free. This is the only candidate that consumes a character from *both* prefixes, so it is the only one that can be cheaper than the others by more than one. When the characters match, this is provably the minimum and the other two candidates are dead work — but the table still computes them, because it cannot know that without branching.',
    python:
      "Substitute, or match for free. The only candidate that consumes a character from both prefixes, so the only one that can win by more than one. A common optimisation is to skip the other two candidates when `cost == 0`, on the grounds that a match is always optimal — correct, and worth about a third of the table's work on text with many equal characters.",
    java: 'Substitute, or match for free, reading the cell diagonally up-left. Because `dp` is a jagged `int[][]`, this is two array dereferences: one to get the row object and one to get the element. A flattened `int[]` with a stride would be one dereference and measurably faster for large tables — the standard optimisation once the table stops fitting in cache.',
    cpp: 'Substitute, or match for free, reading the cell diagonally up-left. `dp[i-1]` is a vector<int> reference and `dp[i-1][j-1]` is the element, so this is the same two-level indirection as the Java version — the price of a jagged table. Both are correct; both are slower than a flat vector for the inner loop.',
  },
  fromAbove: {
    javascript:
      'Delete one character from `a`. The cell above has already turned a prefix of length i - 1 into the same prefix of b, so deleting the last character of a finishes the job for one edit. Note it never inspects `b[j - 1]` — that is the structural difference from the diagonal, and it is why deletions and insertions can be charged independently.',
    python:
      'Delete one character from a. The cell above has already turned a prefix one shorter into the same prefix of b, so one deletion finishes the job. It never looks at `b[j-1]`, which is the structural difference from the diagonal candidate and the reason a "swap two characters" edit cannot be expressed by this table at all.',
    java: 'Delete one character from a, reading the cell above. Java has no pass-by-reference for ints, so this is a read into a local rather than an in-place update of the neighbour — a pattern that appears in every one of these four listings and is the reason the table is written cell by cell rather than relaxed in place.',
    cpp: 'Delete one character from a, reading the cell above. A reader could be tempted to update the neighbour in place here, since `dp[i-1][j]` is reachable and C++ would allow it — and that would be a *different algorithm*, because an already-computed cell is not obliged to keep the value it was given.',
  },
  fromLeft: {
    javascript:
      'Insert one character of `b`. The cell to the left is in the row being written, at a smaller column, so it is already final — which is exactly why the sweep has to run left to right. Reading from above instead would be 0/1 behaviour, and for edit distance there is no such thing: an edit never removes a character you already paid to insert.',
    python:
      'Insert one character of b, reading the cell to the left in the row currently being written. The column-major/row-major distinction is invisible in Python, where `dp[i][j-1]` is just a lookup, but in C this is why the loop nests `i` outside `j`: reversing the two loops would read a row that is not finished.',
    java: 'Insert one character of b, reading the cell to the left. This is the only candidate that reads the row being written, which makes the sweep order load-bearing: the loops are `i` outside, `j` inside, and swapping them computes a table full of zeroes for any pair of strings that differ in the first character.',
    cpp: 'Insert one character of b, reading the cell to the left. Because `dp[i][j-1]` is the previous element of the same row, this is the candidate that makes a flat 1-D table natural: the three candidates are at offsets -(n+1), -1 and -(n+2), so the whole recurrence is three loads at fixed strides.',
  },
  best: {
    javascript:
      'Take the cheapest of the three, and record which one it was — that record is the provenance the viewport colours by, and reading it along a path from the top-left to the bottom-right gives you an actual edit script. Two candidates tying is common in real text and means the distance is unique while the script is not.',
    python:
      'Take the cheapest of the three. `min` is variadic in Python and in JavaScript, so three candidates are one call; the two compiled languages have no variadic min, so they nest two two-argument calls — which is a good illustration of how much ceremony the same line attracts.',
    java: 'Take the cheapest of the three, with `Math.min` nested because Java has no variadic min. `Math.min(int, int)` returns an int, so there is no promotion hazard here — but the same call with a double argument would silently promote the whole expression, and that is the classic edit-distance bug when costs are not uniform.',
    cpp: 'Take the cheapest of the three. `std::min` returns a const reference to one of its arguments, so the assignment is what copies the value in; and since there is no variadic overload, the two-argument form has to nest, exactly as in the Java version.',
  },
  done: {
    javascript:
      'The bottom-right cell is the distance, and it is symmetric even though the loop that computes it is not: `editDistance(a, b)` and `editDistance(b, a)` come out equal because the same set of edit scripts is available in both directions. A useful property to assert in a test, and one that catches an asymmetric bug immediately.',
    python:
      'The bottom-right cell is the distance. The table is (m + 1)(n + 1) ints, which for two 10,000-character strings is 400 MB in Python — which is why the practical version keeps one row plus a direction bit per cell, and why nobody runs this DP on whole files without a banding trick.',
    java: 'The bottom-right cell. The int[][] is the real memory cost — two 10,000-character strings need 400 MB of ints — and a production implementation would use a short[][] or a single rolled row with a parallel byte array recording the chosen direction, which is how diff tools get edit scripts without the full table.',
    cpp: 'The bottom-right cell, and the only place the answer comes from. The nested vector allocates m + 1 separate buffers; flattening to `vector<int>((m+1)*(n+1))` and indexing `i * (n+1) + j` is the same algorithm with one allocation, contiguous memory, and a loop the compiler can vectorise — the single biggest constant-factor win available in this whole listing.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'editDistance',
    python: 'edit_distance',
    java: 'EditDistance.editDistance',
    cpp: 'edit_distance',
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
  const limit = Math.max(1, Math.min(10, Number(p.params?.limit ?? 7)));
  return [
    [...(w[0] ?? 'abc')].slice(0, limit).join(''),
    [...(w[1] ?? 'abc')].slice(0, limit).join(''),
  ];
};

/**
 * Levenshtein distance by memoised recursion over the same recurrence — a
 * different evaluation order from the bottom-up table, so agreement is a real
 * check rather than a restatement.
 */
const recursiveDistance = (a: string, b: string): number => {
  const memo = new Map<string, number>();
  const go = (i: number, j: number): number => {
    if (i === 0) return j;
    if (j === 0) return i;
    const key = `${i},${j}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const cost = a[i - 1] === b[j - 1] ? 0 : 1;
    const value = Math.min(go(i - 1, j - 1) + cost, go(i - 1, j) + 1, go(i, j - 1) + 1);
    memo.set(key, value);
    return value;
  };
  return go(a.length, b.length);
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const [a, b] = pairOf(p);
  return { presetId: p.id, args: [a, b], result: recursiveDistance(a, b) };
});

export const editDistanceAlgo: AlgoDef<GridFrame> = {
  id: 'edit-distance',
  title: 'Edit Distance',
  category: 'dynamic-programming',
  summary:
    'Turn two strings into each other for the fewest single-character insertions, deletions and substitutions, and record which edit each cell paid for.',
  intuition:
    'Reach for it when "how different are these two things" needs to be a number a program can compare — fuzzy search ranking, spell correction, deduplicating near-identical records, measuring churn between two versions. Two things to know before you reach for it: the cost model is a *choice* (transposing two characters should probably cost 1, not 2, and then you need Damerau), and the answer bounds how different two strings can be before you should stop comparing them at all — beyond a threshold the strings are simply not the same thing.',
  complexity: {
    best: 'O(mn)',
    average: 'O(mn)',
    worst: 'O(mn)',
    space: 'O(mn)',
    note: 'Every cell is three candidates and a min, so there is no interesting best case. The 1-D form — one row, updated in place, plus a byte per cell recording the direction — gets space to O(n) and still yields an edit script, which is what diff actually needs.',
  },
  traits: {
    stable: true,
    inPlace: false,
    online: false,
    offline: true,
    allowsDuplicates: true,
    tags: ['table', 'strings', 'edit script', 'symmetric'],
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
      default: 7,
      help: 'Truncates both strings so the (m+1) x (n+1) table stays on screen.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: editDistance,
  lesson,
  expectations,
  formatResult: (r) => `distance ${r as number}`,
  anchors: ['start', 'base', 'match', 'mismatch', 'diag', 'fromAbove', 'fromLeft', 'best', 'done'],
};

export default editDistanceAlgo;
