import type { Article } from '../types.ts';

/**
 * The cross-cutting techniques.
 *
 * These are the ideas that cut across categories — the ones a student meets in
 * eight different chapters of a textbook and, without naming them, has to
 * re-invent each time. Filed under `concepts` rather than any of the 14
 * algorithm categories, because filing them would misfile them.
 */

export const TWO_POINTERS: Article = {
  slug: 'two-pointers',
  title: 'The two-pointer technique',
  dek: 'One loop, two indices, and an invariant that makes the search space halve every step.',
  category: 'concepts',
  tags: ['technique', 'invariant', 'O(1) space', 'O(n) time'],
  readMinutes: 9,
  body: [
    {
      kind: 'p',
      text: 'Two pointers is not an algorithm. It is a *shape* that a surprising number of linear-or-better algorithms share, and recognising it is worth more than memorising any one instance of it.',
    },
    {
      kind: 'p',
      text: 'The shape is: a single pass over the data, two indices moving through it, and no auxiliary storage. What makes it work is that each iteration **rules out a region**, so the space you still have to consider shrinks. That is the difference between `O(n)` and `O(n²)` — not a faster inner step, but never entering the inner step.',
    },

    { kind: 'h2', text: 'The canonical instance: two-sum' },
    {
      kind: 'p',
      text: 'Given an array and a target, find two indices that sum to it. The naive answer checks every pair: `O(n²)`. The two-pointer answer sorts the array first, then walks one pointer from each end inward.',
    },
    {
      kind: 'code',
      lang: 'typescript',
      caption:
        'After sorting, a sum that is too small can only be fixed by moving `left` right, and a sum too large only by moving `right` left.',
      code: `function twoSum(sorted: number[], target: number): [number, number] | null {
  let left = 0;
  let right = sorted.length - 1;

  while (left < right) {
    const sum = sorted[left] + sorted[right];

    if (sum === target) return [left, right];
    // Too small. sorted[left] is the smallest value still in play, so no pair
    // using it can reach the target — discard it and move right.
    if (sum < target) left += 1;
    else right -= 1;
  }
  return null;
}`,
    },
    {
      kind: 'p',
      text: 'The reasoning in those comments is the whole technique. When the sum is too small, we do not merely conclude "this pair failed" — we conclude "**every** pair using `sorted[left]` fails", because `sorted[left]` is the smallest remaining value and pairing it with anything at or below `right` gives an equal or smaller sum. So `left` can be discarded permanently. Same argument, mirrored, for `right`.',
    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'The precondition the complexity hides',
      text: 'Note the cost of the sort. Two-sum in `O(n)` requires the array to arrive sorted; if it does not, you have paid `O(n log n)` first. The honest total is `O(n log n)`, not `O(n)` — a good example of a complexity claim that depends on a precondition nobody mentions.',
    },
    {
      kind: 'stepper',
      algoId: 'two-sum-hash',
      caption:
        'Two-sum by hash lookup. The map is the whole algorithm — one probe per candidate instead of a nested scan.',
      preset: 'exact-pair',
    },

    { kind: 'h2', text: 'The sliding window is the same idea, contiguous' },
    {
      kind: 'p',
      text: 'Where two pointers converge from both ends, a **sliding window** moves both forward: a `right` that always advances, and a `left` that advances when the window is invalid. The rule that makes it linear is that neither pointer ever moves backwards, so the total work is bounded by `2n` pointer movements regardless of how many times the inner logic runs.',
    },
    {
      kind: 'p',
      text: 'The pattern appears under a lot of names — longest substring without repeating characters, minimum size subarray sum, permutation in string, longest subarray with sum at most k — and they are all the same algorithm with a different validity test. Find the thing that makes a window good or bad, then move `left` exactly until it is good again.',
    },
    {
      kind: 'stepper',
      algoId: 'min-window-substring',
      caption:
        'Minimum window substring. The window grows on the right and is trimmed on the left — the two-pointer shape with a moving window.',
      preset: 'both-long',
    },

    { kind: 'h2', text: 'The third pointer: partitioning' },
    {
      kind: 'p',
      text: 'Lomuto partition — the one in this app’s quicksort — uses three indices. A third one is needed when the data moves rather than merely being excluded: elements are being **swapped into place**, so you need a boundary marking where the "less than pivot" region ends.',
    },
    {
      kind: 'code',
      lang: 'typescript',
      caption:
        'Lomuto. `i` is the boundary of the partitioned region; `j` scans ahead looking for something that belongs on the left of it.',
      code: `function partition(a: number[], lo: number, hi: number): number {
  const pivot = a[hi];
  let i = lo;              // boundary: everything before i is <= pivot

  for (let j = lo; j < hi; j++) {
    if (a[j] <= pivot) {
      [a[i], a[j]] = [a[j], a[i]];
      i++;
    }
  }
  // Put the pivot in the gap, which is exactly where it belongs.
  [a[i], a[hi]] = [a[hi], a[i]];
  return i;
}`,
    },
    {
      kind: 'p',
      text: 'The subtle line is the final swap. After the loop, everything in `[lo, i)` is at most the pivot and everything in `[i, hi)` is greater — and the pivot itself is still sitting at `hi`, outside its own partition. Swapping it into `i` closes the region and returns the boundary that quicksort recurses on.',
    },

    { kind: 'h2', text: 'When it is the wrong shape' },
    {
      kind: 'p',
      text: 'Two pointers requires you to be able to discard a region permanently. If a failed comparison leaves open the possibility that an earlier element matters — "is there a subarray with sum *exactly* `k`?" over unsorted data, say — then no index can be ruled out, and you are back to a hash map or a prefix-sum table. The technique does not fail because it is weak; it fails because the problem does not have the structure it needs.',
    },
    {
      kind: 'p',
      text: 'The tell is worth memorising: if you cannot state *why* discarding index `i` is safe in one sentence, you do not have a two-pointer solution, you have a hope for one.',
    },
  ],
};

export const RECURSION_IS_A_STACK: Article = {
  slug: 'recursion-is-a-stack',
  title: 'Recursion is a stack you can watch',
  dek: 'Every recursive call is a push. Every return is a pop. That is the entire mental model.',
  category: 'concepts',
  tags: ['recursion', 'call stack', 'backtracking', 'space complexity'],
  readMinutes: 8,
  body: [
    {
      kind: 'p',
      text: 'Recursion is taught as a way to avoid loops, and that framing makes it much harder than it is. Recursion is not an alternative to iteration. It is **iteration with an explicit stack**, and the compiler was doing it for you anyway.',
    },
    {
      kind: 'p',
      text: 'When a function calls itself, the machine pushes a frame — the parameters, the local variables, the return address — onto a call stack, and jumps. When the call returns, the machine pops that frame and resumes the caller. A recursive function is a loop whose body pushes a frame and whose `return` statement pops one.',
    },

    { kind: 'h2', text: 'What the stack buys you, and what it costs' },
    {
      kind: 'p',
      text: 'The stack is the entire reason recursion can express things a loop cannot easily. When a function calls twice — once for each half of a problem — it has to do the first half, hold its result while the second runs, and return to the right place. A loop variable cannot express that. A frame can, for free, because the return address *is* that information.',
    },
    {
      kind: 'callout',
      tone: 'warn',
      title: 'And the cost is space',
      text: 'Recursion depth grows with the size of the input, so a recursive algorithm is usually **O(n) space**, not O(1) — even when the naive loop version is O(1). A naive recursive quicksort on an already-sorted array descends `n` levels deep and holds `n` frames. This is the stack overflow you have seen, and it is a space-complexity result, not a mysterious crash.',
    },
    {
      kind: 'p',
      text: 'The standard mitigations are all the same idea: make the recursion shallower. Sort the pivot so partitions are balanced, recurse on the smaller half and loop on the larger, or keep an explicit stack on the heap — which is exactly what turns tree traversal back into iteration.',
    },

    { kind: 'h2', text: 'Fibonacci, and why it is a trap' },
    {
      kind: 'p',
      text: 'The classic example is also the classic mistake, so it is worth dissecting.',
    },
    {
      kind: 'code',
      lang: 'typescript',
      code: `// Naive: correct, and the textbook example of exponential time.
function fib(n: number): number {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
}`,
    },
    {
      kind: 'p',
      text: 'This computes `fib(40)` in about a billion calls. Not because the algorithm is slow per call — each call is trivial — but because the **call tree has a billion nodes**. `fib(n)` calls `fib(n-1)`, which calls `fib(n-1)` again, and those two computations never learn that they are the same problem.',
    },
    {
      kind: 'p',
      text: 'That is the real lesson. Naive recursion is exponential whenever the sub-problems overlap, because a stack frames nothing about work already done. Two fixes, and they are the same fix:',
    },
    {
      kind: 'ol',
      items: [
        '**Memoisation** — remember the result of each sub-problem the first time you compute it. Turns the call tree into a DAG, and `fib(n)` drops to O(n).',
        '**Bottom-up dynamic programming** — compute the same table, but in an array and in the right order. Same O(n), better constant and no recursion depth.',
      ],
    },
    {
      kind: 'p',
      text: 'Both are O(n). The difference is that the recursive version is genuinely more readable, which is why memoised recursion is usually the better first attempt and the iterative version is usually the better shipped one.',
    },

    { kind: 'h2', text: 'Backtracking: the stack as a decision log' },
    {
      kind: 'p',
      text: 'Backtracking is recursion used for search, and the frame is doing something more interesting than storing a parameter: it is storing the **decisions made so far**. Push a decision, explore, and if the branch fails, pop it and take it back.',
    },
    {
      kind: 'p',
      text: 'This is why backtracking is cleanest written as *make a choice, recurse, undo the choice*. The undo is not optional bookkeeping — it is what makes the search exhaustive rather than merely deep-first down a single path.',
    },
    {
      kind: 'stepper',
      algoId: 'tower-of-hanoi',
      caption:
        'Tower of Hanoi. Each frame is one call; each legal move is one pop off the stack followed by a push.',
      preset: 'three-disks',
    },

    { kind: 'h2', text: 'The three questions for any recursion' },
    {
      kind: 'ol',
      items: [
        '**What is the base case?** Not "when should I stop" — what is the *answer* at the smallest input? A base case that returns a wrong-shaped value is the most common recursive bug.',
        '**Does the recursive call make the problem smaller?** If a call can pass the same `n` it received, there is no termination argument and no complexity bound.',
        '**Will the calls overlap?** If two calls solve the same sub-problem, you need memoisation or a table, or the complexity is exponential and the stack depth is misleadingly small.',
      ],
    },
  ],
};

export const DYNAMIC_PROGRAMMING: Article = {
  slug: 'dynamic-programming',
  title: 'Dynamic programming: remember the sub-answer',
  dek: 'Two questions decide it. If they have yes and yes, memoise and stop worrying.',
  category: 'concepts',
  tags: ['memoisation', 'tabulation', 'overlapping subproblems', 'state'],
  readMinutes: 12,
  body: [
    {
      kind: 'p',
      text: 'Dynamic programming is a technique, not a family of algorithms. It applies to a startling range of problems and has almost nothing in common with them. What it actually is: **do not recompute a sub-answer you have already computed**.',
    },
    {
      kind: 'p',
      text: 'That is genuinely all of it. Everything else — the tables, the bottom-up order, the "principle of optimality" — is bookkeeping for not recomputing things.',
    },

    { kind: 'h2', text: 'The two questions' },
    {
      kind: 'p',
      text: 'Before writing any DP, check these. They are necessary and sufficient, and most problems that feel hard fail one of them.',
    },
    {
      kind: 'ol',
      items: [
        '**Does the problem have optimal substructure?** Is the best answer to the whole thing built out of the best answers to sub-problems? Longest path in a DAG: yes. Longest path in a general graph: no, because the best path through a node may depend on how you arrived at it.',
        '**Do the sub-problems overlap?** Will the same sub-problem be solved many times by the naive recursion? Fibonacci: yes, catastrophically. Merge sort: no — the two halves are disjoint, so memoisation would buy nothing.',
      ],
    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'Both yes',
      text: 'Memoise, or tabulate. Both are O(states × work-per-state). If either answer is no, DP is the wrong tool and you want a different algorithm entirely — greedy for some, exhaustive search for others.',
    },

    { kind: 'h2', text: 'Two forms, one recurrence' },
    {
      kind: 'p',
      text: 'Every DP problem has a **recurrence**: an expression for the answer to a state in terms of answers to smaller states. You can evaluate that recurrence two ways, and they are the same algorithm with different trade-offs.',
    },

    { kind: 'h3', text: 'Top-down: memoisation' },
    {
      kind: 'p',
      text: 'Write the recurrence as a recursive function and add a cache. States are computed lazily, so you only pay for the ones that turn out to be reachable.',
    },
    {
      kind: 'code',
      lang: 'typescript',
      caption:
        'Longest increasing subsequence, top-down. The cache key must identify the state completely — here, the index.',
      code: `function lisLengths(a: number[]): number[] {
  const memo = new Map<number, number>();

  function from(i: number): number {
    // The check is the memoisation. Without it this is exponential.
    const hit = memo.get(i);
    if (hit !== undefined) return hit;

    let best = 1;                    // the element itself
    for (let j = i + 1; j < a.length; j++) {
      if (a[j] > a[i]) best = Math.max(best, from(j) + 1);
    }
    memo.set(i, best);
    return best;
  }

  return a.map((_, i) => from(i));
}`,
    },
    {
      kind: 'p',
      text: 'Memoisation is usually easier to get right, because you write the recurrence the way you reasoned about it and let the cache handle the rest.',
    },

    { kind: 'h3', text: 'Bottom-up: tabulation' },
    {
      kind: 'p',
      text: 'Same recurrence, evaluated in a table in an order where every dependency is already filled in. You lose laziness but gain predictability: no recursion depth, no call overhead, and often a smaller working set.',
    },
    {
      kind: 'code',
      lang: 'typescript',
      caption:
        'The same LIS, bottom-up. `dp[i]` depends only on `dp[j]` for j > i, so iterating i forwards is already safe.',
      code: `function lisLengthsTabulated(a: number[]): number[] {
  const n = a.length;
  const dp = new Array<number>(n).fill(1);

  for (let i = 1; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (a[j] < a[i]) dp[i] = Math.max(dp[i], dp[j] + 1);
    }
  }
  return dp;
}`,
    },
    {
      kind: 'p',
      text: 'For a one-dimensional recurrence like this the two are near-identical in cost. Bottom-up earns its keep when the state is multi-dimensional and only a slice of the table is ever needed — knapsack in particular, where you can halve the memory by keeping only the previous layer.',
    },

    { kind: 'h2', text: 'Counting states is the real skill' },
    {
      kind: 'p',
      text: 'The hard part is never writing the loop. It is deciding **what a state is** — and getting it wrong is the failure mode that produces a table of the wrong size or an answer that is silently incorrect.',
    },
    {
      kind: 'ul',
      items: [
        '**Knapsack (0/1):** state is *(items considered, capacity remaining)*. The "remaining capacity" framing is the one that works, because it makes the transition a single comparison instead of an index-arithmetic puzzle.',
        '**Coin change:** state is *amount*. Iterate amounts ascending, because amount `x` depends on amounts strictly below it.',
        '**Grid paths:** state is *(row, col)*, and the order is rows-then-columns so the cell above and to the left are both filled.',
        '**Edit distance:** state is *(prefix of a, prefix of b)*, with the classic three-way recurrence — match, delete, insert.',
        '**Interval problems:** state is a pair of endpoints *(i, j)*, which is `O(n²)` states rather than `O(n)`. This is where people go wrong by trying to find a 1-D state that does not exist.',
      ],
    },
    {
      kind: 'stepper',
      algoId: 'lis',
      caption:
        'Longest increasing subsequence. The narration names the state being computed at each step, which is the DP analogue of a code anchor.',
      preset: 'mixed',
    },

    { kind: 'h2', text: 'How to recognise a DP problem when you do not' },
    {
      kind: 'p',
      text: 'Three signals, in rough order of reliability:',
    },
    {
      kind: 'ol',
      items: [
        '**You wrote a recursive solution and it is exponential.** This is the clearest signal there is, and the fix is almost always memoisation.',
        '**There is an obvious way to over-solve the problem.** "Find the longest increasing subsequence" invites computing the answer for every prefix — that is a table whether or not you have named it.',
        '**The problem asks for "the best", or "how many ways", over a constrained space.** Both are usually counts over states, and both usually decompose.',
      ],
    },
    {
      kind: 'p',
      text: 'And one counter-signal worth keeping: if your recurrence needs a *set* of states rather than a single number, or if deciding the order to fill the table is genuinely hard, the answer is usually greedy or graph search instead. Not every hard problem is a DP problem, and forcing it produces tables that are correct and useless.',
    },
  ],
};
