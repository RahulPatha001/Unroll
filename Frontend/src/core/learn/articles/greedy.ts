import type { Article } from '../types.ts';

/**
 * Two articles, one boundary.
 *
 * `GREEDY` and `DP_SHAPES` are grouped because they are the two answers to the same
 * question — "this sub-problem has a best answer, what do I do with it?" — and the
 * only honest way to teach where that line falls is to put them in the same file. The
 * general theory of dynamic programming already lives in `techniques.ts`; this file is
 * the working half of it: the specific patterns, and the greedy proofs.
 */

/**
 * Greedy.
 *
 * The distinction this article insists on is between an algorithm that *makes a choice*
 * and an algorithm that *proves the choice was safe*. Every greedy algorithm in this
 * app has the same shape and a different proof, and the proofs are the content.
 */
export const GREEDY: Article = {
  slug: 'greedy',
  title: 'Greedy: the local choice that needs a proof',
  dek: 'Every greedy algorithm is a decision plus an obligation, and the obligation is the whole difficulty.',
  category: 'greedy',
  tags: ['greedy', 'exchange argument', 'optimality', 'coin change', 'layering'],
  readMinutes: 12,
  algoId: 'activity-selection',
  body: [
    {
      kind: 'p',
      text: 'A greedy algorithm makes one decision, commits to it, and never looks at the alternatives again. That is the entire mechanism, and it is why greedy is the fastest thing in this app — and also why it is the easiest thing in this app to get wrong.',
    },
    {
      kind: 'p',
      text: 'The interesting claim is never "my rule picks the cheapest thing". It is **"committing to that thing never costs me anything"**, and that claim needs an argument. An algorithm without one is a heuristic that happens to work on the test data.',
    },

    { kind: 'h2', text: 'The canonical proof: activity selection' },
    {
      kind: 'p',
      text: 'Take the activity that **finishes earliest**, schedule it, and repeat among those that start after it finishes. That is the whole algorithm. The justification takes one paragraph and is worth memorising, because the shape recurs in every greedy proof you will meet.',
    },
    {
      kind: 'p',
      text: 'Let `A` be the earliest-finishing activity. Take any optimal schedule `S` and look at its first activity, `B`. Since `A` finishes earliest, `A` finishes no later than `B`. Replace `B` with `A`: everything in `S` after `B` started at or after `B` finished, and `A` finishes no later than that, so nothing downstream is disturbed. The result is still a valid schedule of the same size, and it starts with `A`. **So some optimal schedule begins with the greedy choice**, and the same argument applies to what is left.',
    },
    {
      kind: 'stepper',
      algoId: 'activity-selection',
      caption:
        'Activity selection. Two rows: finish times above, start times below. Each pick is the earliest finisher available, and the compatibility test is one comparison.',
      preset: 'mixed',
    },
    {
      kind: 'callout',
      tone: 'warn',
      title: 'One character decides the whole answer',
      text: 'The test is `start >= lastFinish`, not `start > lastFinish`. With `>` you lose the last interval every single run — an activity may start at the exact moment another finishes, and that is not an overlap. There is a preset in the app whose entire purpose is to make this visible, and it is the only one where nothing is ever skipped.',
    },
    {
      kind: 'p',
      text: 'The second observation is about what "optimal" means here: the answer is the **count**, and the count is not something the trace had to guess. The machine-checked expectation for this preset is deliberately computed by a completely different method — an `O(n²)` dynamic program — so the two have to agree on every input before either is believed.',
    },

    { kind: 'h2', text: 'Three things every greedy proof has to establish' },
    {
      kind: 'ol',
      items: [
        '**Local safety.** The choice beats every alternative it discards, **given the same state**. Activity selection compares against other activities available now; coin change compares against other coins available now.',
        '**Reachability.** A state you cannot get to is not an option. If the greedy rule might produce a configuration that the optimal solution could never be in, then "it was locally best" is not enough — you have proved something about an unreachable world. This is the failure mode that separates greedy from DP.',
        '**A deliberate tie-break.** If two candidates are equally good, which one you take is a decision, not a detail. [Prim and Kruskal](/learn/minimum-spanning-trees) both satisfy local safety and reachability and still disagree about **which** tree they return, purely on tie-breaks.',
      ],
    },
    {
      kind: 'p',
      text: 'Notice what is **not** on that list: "the answer is correct". That is what the proof concludes, and writing it as a requirement turns the whole thing into a tautology.',
    },

    { kind: 'h2', text: 'What the failure looks like' },
    {
      kind: 'p',
      text: 'The famous counterexample is coin change, and it is famous because the greedy rule — take the largest coin you can — is not merely wrong sometimes. It is **right for some denominations and wrong for others, with the identical algorithm**.',
    },
    {
      kind: 'stepper',
      algoId: 'coin-change',
      caption:
        'Coins 1, 3, 4 making 6. Greedy takes 4 then 1 then 1 — three coins. The table finds 3 + 3 — two.',
      preset: 'greedy-counterexample',
    },
    {
      kind: 'p',
      text: 'Greedy cannot see that spending the 4 leaves a remainder it cannot make well. Nothing is wrong with the rule locally: 4 **is** the largest coin that fits. The damage is entirely in the future, and there is no amount of local cleverness that prevents it.',
    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'The fix is a property of the input, not of the algorithm',
      text: 'The same greedy code is correct for 1, 5, 10 and 25 — and that correctness is a theorem about those denominations (a greedy choice must leave a remainder the system can still finish), not an accident. Systems engineer real currencies to make greedy work, which is why nobody hands out an 18-cent coin. Change the denominations and you have to re-prove the theorem.',
    },

    { kind: 'h2', text: 'Greedy as elimination' },
    {
      kind: 'p',
      text: 'There is a second flavour of greedy that does not construct an answer so much as **rule candidates out**. The gas station problem is the clean example: driving a circular route, each leg costs what you gain minus what you spend, and you want the station to start from.',
    },
    {
      kind: 'stepper',
      algoId: 'gas-station',
      caption:
        'The reset. If the tank goes negative at station i, every start at or before i shares this prefix and dies in the same place — so the whole prefix is disqualified at once.',
      preset: 'reset-hard',
    },
    {
      kind: 'p',
      text: 'The reasoning is an elimination, and that is the whole algorithm in one sentence: **if the tank is empty after station `i`, then every start at or before `i` runs dry at or before `i` too**, because they all traverse the same prefix and the partial sums are identical. So move the candidate to `i + 1` and reset — and the subtle bit is resetting the tank to `0`, not to `delta`, because the station that emptied it has already been paid for.',
    },
    {
      kind: 'p',
      text: 'And impossibility is one comparison on the total. If the whole route sums to negative, no lap works, and that is the only check needed — no candidate ever has to be simulated. The verification for this algorithm tries **every** start station independently, so the elimination argument is not taken on trust by the test suite either.',
    },

    { kind: 'h2', text: 'Greedy that is breadth-first search in disguise' },
    {
      kind: 'p',
      text: 'Minimum jumps is the third one, and it is the most instructive because the "greedy" part is not a choice at all — it is a **decision not to build a queue**.',
    },
    {
      kind: 'p',
      text: 'The textbook solution is breadth-first search: expand every position reachable in one jump, then two, counting layers. That needs `O(n)` memory for the queue. The version here keeps two integers — the last index reachable in `jumps` jumps, and the furthest index anything scanned so far can reach — and sweeps. Each time the sweep passes the current boundary, one jump is counted and the boundary moves out. Same answer, no queue, `O(1)` space.',
    },
    {
      kind: 'stepper',
      algoId: 'jump-game-2',
      caption:
        'The two-integer sweep. The highlighted band is the current layer; every jump counted is one boundary crossing.',
      preset: 'small-steps',
    },
    {
      kind: 'p',
      text: 'The stuck case is the same argument as everywhere else in this article: if the furthest reachable index did not move past the boundary, no number of further jumps helps, and the answer is `-1`. And the expectation here is a genuine BFS with a distance array, so the two-integer claim is checked against the thing it claims to replace.',
    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'What these three have in common',
      text: 'Each one makes a decision that is locally justified and globally safe, and each one\'s correctness rests on a one-paragraph argument about swapping. None of them can be "adapted" to a slightly different problem without redoing the argument — which is precisely the difference between a technique and a formula.',
    },

    { kind: 'h2', text: 'Choosing between the four' },
    {
      kind: 'table',
      head: ['', 'Brute force', 'Greedy', 'Divide and conquer', 'Dynamic programming'],
      rows: [
        ['Decides', 'nothing', 'one option, now', 'nothing — it recurses', 'keeps every option'],
        ['Needs a proof of', 'nothing', 'local safety', 'the split', 'optimal substructure'],
        ['Typical cost', 'exponential', 'best available', '`n log n`', 'states × work'],
        [
          'Fails when',
          'always, eventually',
          'the local choice traps you',
          'the subproblems overlap',
          'the subproblems do not decompose',
        ],
        [
          'In this app',
          '—',
          'activity selection, Prim, Kruskal',
          '[merge sort](/learn/divide-and-conquer), quicksort',
          '[knapsack, LCS, edit distance](/learn/dp-state-shapes)',
        ],
      ],
    },
    {
      kind: 'p',
      text: 'The failure column is the useful one. Greedy and DP are not competitors — they are two answers to the same question, and [coin change](/learn/dp-state-shapes) is answered by either depending on the denominations. The tell is the reachability question: if you cannot say **why committing here was safe**, you do not have a greedy solution, you have a hope for one.',
    },
    {
      kind: 'p',
      text: 'Worth internalising as a habit rather than a fact about four algorithms: **the correctness of a greedy step rests on a property of the input, and that property is usually an assumption in a comment rather than a check.** [Dijkstra](/learn/shortest-paths) assumes non-negative weights and returns a wrong answer without complaining if they are not. The comment is the entire safety system.',
    },
  ],
};

/**
 * Dynamic programming, concretely.
 *
 * `techniques.ts` covers *when* to reach for DP. This covers the four state shapes
 * that recur, what each one looks like in a table, and the two details — base cases
 * and loop direction — that are where hand-written DP actually goes wrong.
 */
export const DP_SHAPES: Article = {
  slug: 'dp-state-shapes',
  title: 'The four shapes of a DP state',
  dek: 'Counting, optimising, and reconstructing — plus the one index that separates 0/1 from unbounded.',
  category: 'dynamic-programming',
  tags: ['state', 'tabulation', 'base case', 'reconstruction', 'unbounded'],
  readMinutes: 12,
  body: [
    {
      kind: 'p',
      text: 'The theory of dynamic programming is two questions and a table, and it is covered in [remember the sub-answer](/learn/dynamic-programming). What theory does not give you is the part where you are actually writing one: what the state **is**, in a form you can index, and which of the four shapes your problem is.',
    },
    {
      kind: 'p',
      text: 'There are four, and they are not four algorithms — they are four ways of counting things.',
    },

    { kind: 'h2', text: 'Shape one: a single index' },
    {
      kind: 'p',
      text: 'The state is `F(k)` — the answer for a prefix of the input of length `k`. Fibonacci is the pure case, and this app draws the top-down and bottom-up versions **in the same grid, row against row**, because the interesting thing about them is not that they differ but that they agree cell for cell.',
    },
    {
      kind: 'stepper',
      algoId: 'fibonacci',
      caption:
        'Fibonacci, memoised on top and tabulated below. The naive recursion would make 13,581 calls for this input; the table makes 21.',
      preset: 'cache-hit',
    },
    {
      kind: 'p',
      text: 'What the grid makes visible is the **order**. The top row is filled in the order the recursion demanded it — scattered, out of order, with the call stack drawn as a path — while the bottom row fills left to right. Same recurrence, same answer, and the difference in cost is entirely the order the states were visited.',
    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'Count the states, not the work',
      text: 'This is the only DP shape where the state count is obvious, which is why it is the only one that gets taught first. When the state has two indices the state count is a **product**, and that product is the thing that runs out of memory — a 1,000,000-capacity knapsack with 100 items is a hundred million cells, and the algorithm is "too slow" mostly because nobody checked that product before starting.',
    },

    { kind: 'h2', text: 'Shape two: two indices, one of which is a budget' },
    {
      kind: 'p',
      text: "Knapsack's state is **items considered, capacity remaining**. Both indices are necessary, and there is a choice about which one you use that decides whether the table is easy to read.",
    },
    {
      kind: 'stepper',
      algoId: 'knapsack',
      caption:
        '0/1 knapsack. Items run down the rows, capacity across the columns, and both candidates for every cell live in the row above — which is why no arrow ever points left.',
      preset: 'classic',
    },
    {
      kind: 'p',
      text: 'The "capacity remaining" framing is the one worth memorising. Capacity **used** turns the transition into an index-arithmetic puzzle with two index shifts; capacity **remaining** turns it into "spend `w`, and here is the answer for what is left over". One of those you can do in your head.',
    },
    {
      kind: 'p',
      text: "There is a diagnostic detail in that visualisation worth stealing: every cell's candidates are in the row **above**, so the table has no leftward dependencies at all. A DP diagram whose arrows all point one way is usually a sign that the state was chosen badly — and it also means the whole table can be rolled into one array, which is the standard trick when memory is the binding constraint.",
    },
    {
      kind: 'p',
      text: 'The other thing to notice is the base row. It is all zeros, and those zeros are **answers, not placeholders** — "the best value with no items is 0" is a true statement. That is the detail that distinguishes a knapsack table from a coin-change table, and getting it wrong is how unreachable states end up holding a confident-looking zero.',
    },

    { kind: 'h3', text: '0/1 versus unbounded is one index' },
    {
      kind: 'p',
      text: 'Coin change looks like knapsack and is not. The state is the same shape — **denominations considered, amount remaining** — and the table looks nearly identical. The entire difference is which neighbour a cell reads from.',
    },
    {
      kind: 'p',
      text: '**Knapsack reads from the row above** (`dp[i-1][c-w]`), which means the item was already considered and cannot be reused. **Coin change reads from its own row to the left** (`dp[i][a-coin]`), which means this coin is still available — as many times as you like.',
    },
    {
      kind: 'stepper',
      algoId: 'coin-change',
      caption:
        'Coin change, unbounded. The arrow comes from the left, not from above, and that single index is the whole difference from knapsack.',
      preset: 'canonical',
    },
    {
      kind: 'callout',
      tone: 'warn',
      title: 'This one index is the whole difference, and getting it backwards is silent',
      text: 'Point coin change at the row above and you have quietly written 0/1 coin change, which is a different problem with a worse answer and no error message. Point knapsack at its own row and you get an unbounded knapsack that can pick the same item twice — and **that** one will look wrong, because unbounded knapsack genuinely returns more value. One of the two mistakes is detectable by looking at the answer and one is not.',
    },
    {
      kind: 'p',
      text: 'Coin change also needs a second decision the knapsack does not: **what does "impossible" look like in the table?** Here it is `-1`, not a large number, for two reasons — the answer is genuinely allowed to be negative, and `INF + 1` is still enormous, so a big sentinel quietly poisons every sum it touches. Unreachable cells carry no provenance, because a `-1` is not an answer.',
    },

    { kind: 'h2', text: 'Shape three: two sequences' },
    {
      kind: 'p',
      text: 'When the input is two sequences, the state is a pair of prefixes: **how much of `a`, how much of `b`**. This is where the most useful DP problems live, and where the base cases carry the most information about the problem.',
    },
    {
      kind: 'stepper',
      algoId: 'edit-distance',
      caption:
        'Edit distance. The borders are `i` and `j`, not zeros — and that is the visible difference from every other table in this family.',
      preset: 'one-substitution',
    },
    {
      kind: 'p',
      text: 'Every cell considers three candidates: match or substitute (the diagonal, free if the characters agree and costing 1 if not), delete from `a` (from above), insert into `a` (from the left). Three neighbours and one of them is usually free, which is what makes it cheap.',
    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'Base cases are where problems differ most visibly',
      text: 'Edit distance\'s borders are `i` and `j` — "turn an empty string into `b` and you insert `j` characters". Longest common subsequence\'s borders are **zero** — "a prefix against nothing shares nothing". Two tables with identical-looking interiors, different recurrences, and opposite base cases, and if you forget to set the border the interior silently computes nonsense.',
    },
    {
      kind: 'stepper',
      algoId: 'lcs',
      caption:
        'Longest common subsequence. Same grid, opposite base case, and a match always wins — no comparison of the other two neighbours is needed.',
      preset: 'classic',
    },
    {
      kind: 'p',
      text: 'LCS has a second half that is worth knowing because it is a general technique. A table of lengths is not an answer anybody wanted, so **walk back from the corner**: at each step, if the two characters match, claim the cell and step diagonally; otherwise step toward whichever neighbour held the value you just saw. The claimed cells form a staircase and the characters along it are the subsequence.',
    },
    {
      kind: 'p',
      text: 'And here is the trade-off: the table stores only lengths, so recovery costs a whole second pass. A real LCS implementation stores a byte per cell saying which neighbour won, trading memory for the pass. Either is defensible; deciding without thinking about it is not.',
    },

    { kind: 'h2', text: 'Shape four: an interval' },
    {
      kind: 'p',
      text: 'When the answer to a problem about a range depends on smaller ranges **overlapping**, the state is a **pair of endpoints** — and that is `O(n²)` states, not `O(n)`. This is the shape people fail to find, and the reason is that they go looking for a one-dimensional state that does not exist.',
    },
    {
      kind: 'stepper',
      algoId: 'rod-cutting',
      caption:
        'Rod cutting, laid out with the rod down the rows and the piece length across. Note the single-cut option losing in almost every cell.',
      preset: 'classic',
    },
    {
      kind: 'p',
      text: 'Rod cutting is the gentlest example of the shape: the table is small, the recurrence is two candidates, and the surprising part is visible — cutting the rod **once** is almost never optimal, so the answer is nearly always a sum of many pieces. Which is the general shape of interval problems: **the single decision looks available and is almost always dominated.**',
    },
    {
      kind: 'p',
      text: 'The layout choice is worth copying. Rows are the rod length, columns the piece length, which makes the two candidates structurally different — one to the left, one diagonally down — instead of both being in the row above. When you can choose an orientation that makes the candidates **look** different, the table explains itself.',
    },

    { kind: 'h2', text: 'And one that is not a table at all' },
    {
      kind: 'p',
      text: 'Longest increasing subsequence is the odd one out, and it is included because it shows that a DP answer does not have to be a table — it can be a **frontier**, one value per state, kept in sorted order.',
    },
    {
      kind: 'stepper',
      algoId: 'lis',
      caption:
        'LIS. The row underneath is not a table of answers — it is the frontier: the smallest tail of every run length found so far.',
      preset: 'duplicates',
    },
    {
      kind: 'p',
      text: '`tails[k]` holds the smallest possible last element of an increasing run of length `k + 1`. It is never a subsequence — it is the **frontier** of what is achievable, and the frontier is all you need. A binary search over it makes the whole thing `O(n log n)` instead of `O(n²)`.',
    },
    {
      kind: 'p',
      text: 'Two details here are the classic hand-written bugs. The comparison is strictly `<`, so an equal value **replaces** a tail rather than extending it — that is exactly what keeps the result strictly increasing, and relaxing it to `<=` gives you the longest non-decreasing subsequence instead, for free. And to recover the subsequence you need a second array recording **which element** placed each tail; linking to the wrong index quietly returns a shorter answer with no error.',
    },

    { kind: 'h2', text: 'The reference table' },
    {
      kind: 'table',
      head: ['Algorithm', 'State', 'Reads from', 'Border', 'Answer'],
      rows: [
        [
          'Fibonacci',
          '`F(k)` for a prefix',
          'two smaller prefixes',
          '`F(0)=0, F(1)=1`',
          'length or value',
        ],
        [
          '0/1 knapsack',
          '`(items, capacity left)`',
          'the row **above**',
          'all zeros — real answers',
          'value',
        ],
        [
          'Coin change',
          '`(coins, amount left)`',
          'its **own row**, left',
          '`-1` unreachable, `0` column',
          'count or `-1`',
        ],
        [
          'Edit distance',
          '`(prefix of a, prefix of b)`',
          'three neighbours',
          '`i` and `j`',
          'cost',
        ],
        [
          'LCS',
          '`(prefix of a, prefix of b)`',
          'diagonal, else two',
          'all zeros',
          'length, then walk back',
        ],
        [
          'Rod cutting',
          '`(length, longest piece)`',
          'left and diagonal',
          'zeros along both borders',
          'revenue',
        ],
        ['LIS', 'a frontier of tails', 'binary search in place', 'empty frontier', 'chain length'],
      ],
    },
    {
      kind: 'callout',
      tone: 'good',
      title: 'If you remember one thing from this page',
      text: 'Count the states before you write the loop, and check the product. Then pick the state that makes the transition a single comparison — usually "remaining" rather than "used" — and set the borders deliberately, because an unset border produces a table that is confident and wrong rather than obviously broken.',
    },
    {
      kind: 'p',
      text: 'The counter-signal is worth keeping too: if your recurrence needs a **set** of states rather than one number, or if filling order is genuinely hard to determine, DP is the wrong tool. That is not a failure of DP — it is the same two questions from [remember the sub-answer](/learn/dynamic-programming) answering "no". [Greedy](/learn/greedy) is what to reach for when the local choice can be proved safe, and brute force when neither holds.',
    },
  ],
};
