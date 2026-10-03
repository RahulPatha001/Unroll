import type { Article } from '../types.ts';

/**
 * The cross-cutting techniques.
 *
 * These are the ideas that cut across categories — the ones a student meets in
 * eight different chapters of a textbook and, without naming them, has to
 * re-invent each time. Three of them are filed under `concepts` rather than any of
 * the 14 algorithm categories, because filing them would misfile them.
 *
 * `DIVIDE_AND_CONQUER` is the exception: it is filed under `recursion`, because
 * divide and conquer and recursion are not two ideas that happen to be related —
 * the shape *is* the recursion, and an article that separates them hides the one
 * fact that decides whether the algorithm works.
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

/**
 * Divide and conquer.
 *
 * Filed under `recursion` rather than `concepts` for the obvious reason: this is the
 * one place where the two subjects are the same subject. It is also the article that
 * has to answer a question the recursion article deliberately leaves open — recursion
 * is the *mechanism*, this is the *shape*, and the shape is what determines whether
 * your program takes a second or an eternity.
 */
export const DIVIDE_AND_CONQUER: Article = {
  slug: 'divide-and-conquer',
  title: 'Divide and conquer: what the halving is for',
  dek: 'The same three steps produce n log n or 2ⁿ, and the difference is entirely in the size of the sub-problem.',
  category: 'recursion',
  tags: ['divide and conquer', 'merge sort', 'quicksort', 'master theorem', 'combination step'],
  readMinutes: 11,
  algoId: 'merge-sort',
  body: [
    {
      kind: 'p',
      text: 'Divide and conquer is a shape, not a technique for avoiding loops. Three steps, always the same three: **divide** the problem into smaller independent pieces, **conquer** each piece recursively, and **combine** the answers into one.',
    },
    {
      kind: 'p',
      text: 'Almost everyone gets the first two right and then forgets the third exists — because "solve the two halves" is where the *code* is, while "put the halves back together" is where the *complexity* is.',
    },

    { kind: 'h2', text: 'The three steps, and the one that is optional' },
    {
      kind: 'p',
      text: 'Work through merge sort as the template:',
    },
    {
      kind: 'ol',
      items: [
        '**Divide:** split the array at `⌊n/2⌋`. Two problems of half the size.',
        '**Conquer:** sort each half. Both calls are the same function on a smaller input.',
        '**Combine:** merge the two sorted halves into one, with a single linear scan.',
      ],
    },
    {
      kind: 'p',
      text: 'The merge is the interesting step and it is *not* free. It is `O(n)`, it needs somewhere to put the output, and it is the reason merge sort is `O(n)` in space while quicksort is `O(log n)`. An algorithm that divides and conquers but never combines is legal — [binary search](/learn/binary-search) is exactly that — and the combine step is simply absent.',
    },
    {
      kind: 'stepper',
      algoId: 'merge-sort',
      caption:
        'Merge sort. Count the widths of the runs being merged at each level: n, then n again, then n again — for log₂(n) levels.',
      preset: 'random',
    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'The combine step is why a bottom-up version exists',
      text: 'Since each merge is `O(n)` and there are `log₂ n` levels, the whole sort is `n · log₂ n`. You can flip it around: merge *passes* of pairwise runs, each pass costing `O(n)`, doubling the run length each time. Same work, but with no recursion at all — which is what a bottom-up merge sort actually is, and why it is the better choice when the data is on disk and the recursion stack is a real cost.',
    },

    { kind: 'h2', text: 'Halving by two versus halving by one' },
    {
      kind: 'p',
      text: 'This is the part worth the whole article, and it is one comparison of two algorithms that look structurally identical.',
    },
    {
      kind: 'table',
      head: ['', 'Merge sort', 'Tower of Hanoi'],
      rows: [
        ['Sub-problem', 'sort each half', 'move `n−1` disks to the spare peg'],
        ['How many', '2', '2'],
        ['Recurrence', '`T(n) = 2T(n/2) + O(n)`', '`T(n) = 2T(n−1) + O(1)`'],
        ['Per level', '`n`', '1'],
        ['Levels', '`log₂ n`', '`n`'],
        ['Total', '`O(n log n)`', '`O(2ⁿ)`'],
      ],
    },
    {
      kind: 'stepper',
      algoId: 'tower-of-hanoi',
      caption:
        'Five disks: 31 moves, and a call stack three deep. The stack is tiny and the work is enormous — the two are completely independent.',
      preset: 'five-disks',
    },
    {
      kind: 'p',
      text: 'Both recurse twice. Neither has a loop. But merge sort halves the problem, so the recursion tree is wide and shallow and there are only `log₂ n` levels — and Hanoi subtracts one from the problem, so the tree is narrow and deep with `n` levels, and the branching compounds.',
    },
    {
      kind: 'p',
      text: 'The general form is `T(n) = a·T(n/b) + O(nᵈ)`, and the three terms say everything: `a` sub-problems, each a `1/b`-th the size, plus work done at this level. What matters is not whether `a > 1` but **how fast the size shrinks**. Two sub-problems of half the size is the good case. Two sub-problems one unit smaller is the case where the algorithm does not work at all.',
    },
    {
      kind: 'callout',
      tone: 'warn',
      title: 'The mistake this catches',
      text: 'The reflex is "divide and conquer makes things `n log n`". It makes things `n log n` *when the sub-problem is a fraction of the original*. If you have written a recursive algorithm whose sub-problem is `n − 1` and you called it divide and conquer because it splits the work in two, you have built an exponential algorithm with a good name.',
    },

    { kind: 'h2', text: 'Quicksort: the same shape, worse promises' },
    {
      kind: 'p',
      text: 'Quicksort divides around a **pivot** rather than at the midpoint, which makes it faster in practice and *worse* in theory — and the difference between those two statements is entirely about how the pivot is chosen.',
    },
    {
      kind: 'p',
      text: 'The partitioning step is [Lomuto](/learn/two-pointers): one scan of the region, everything `≤ pivot` shuffled to the left of a boundary, pivot dropped into the gap, and the boundary returned. That single pass is the combine step, and it is `O(n)` — the same combine cost as merging, for a division that costs nothing.',
    },
    {
      kind: 'stepper',
      algoId: 'quick-sort',
      caption:
        'Quicksort partitioning. The pivot is the only value whose final position is known at the moment the scan ends — everything else is still relative.',
      preset: 'random',
    },
    {
      kind: 'p',
      text: 'So the balance of the recursion tree is decided by the pivot, and nothing in the algorithm can guarantee it. The worst case is not exotic: pick the smallest or largest remaining element every time, and every partition splits off exactly one element. An already-sorted array with a fixed pivot does this on every level, giving `n` levels and `O(n²)` comparisons.',
    },
    {
      kind: 'ul',
      items: [
        '**Random pivot** turns the bad case into a 1-in-n chance per level — a claim about randomness rather than about the data, which is the only reason it is available at all.',
        '**Median of three** (first, middle, last) defeats the sorted-input case specifically, for free.',
        '**Introsort** counts recursion depth and switches to [heapsort](/learn/heaps) past a `2·log n` threshold, giving up the worst case only in the situation where the input is already pathological enough that the constant factor is academic.',
      ],
    },
    {
      kind: 'p',
      text: 'And quicksort is not stable — equal elements can be reordered by the partition — which is the one guarantee merge sort gives up nothing to get. If you are sorting by one field while other fields carry meaning, that decides it.',
    },

    { kind: 'h2', text: 'The degenerate case' },
    {
      kind: 'p',
      text: 'Binary search divides and never combines. Split the range in half, look at one half, and recurse into that half. There is no work at any level except the comparison, and there is nothing to merge — the answer is wherever the range stops containing it.',
    },
    {
      kind: 'p',
      text: 'It is worth including as a member of the family because it shows what the shape looks like when one step is missing. `T(n) = T(n/2) + O(1)` is `O(log n)` not because the constant is small but because the *only* work is per-level, with `log n` levels and nothing else. Merge sort pays `O(n)` per level and still wins on a big array, because it has to build a sorted result; binary search pays nothing per level, because it only has to find one.',
    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'And the one that is neither',
      text: 'Insertion sort is divide and conquer with the divide step removed: sort a one-element prefix, then insert the next element into it by shifting. That is the entire algorithm, it is `O(n²)` in general and `O(n)` on nearly-sorted input, and it is exactly what hybrid sorts call for their small runs — below about 16 elements, insertion sort beats both merge sort and quicksort because the constant factor is smaller than the overhead of recursing.',
    },

    { kind: 'h2', text: 'How to tell it apart from dynamic programming' },
    {
      kind: 'p',
      text: 'Both recurse on smaller inputs, so they are easy to confuse. The distinguishing question is **whether the sub-problems overlap**:',
    },
    {
      kind: 'ul',
      items: [
        "**Disjoint** — merge sort's halves, quicksort's partitions, binary search's halves. Each element is in exactly one sub-problem, so the recursion tree is a *tree* and memoising anything buys nothing. This is divide and conquer.",
        '**Overlapping** — naive Fibonacci, where `fib(n−1)` and `fib(n−2)` both need `fib(n−2)`. The recursion is a *DAG* drawn as a tree, and memoising collapses it. This is [dynamic programming](/learn/dynamic-programming).',
      ],
    },
    {
      kind: 'p',
      text: 'There is a second difference that catches people: divide and conquer splits by **position or structure** — "the left half", "the sub-tree" — while DP splits by **state** — "the best answer for this amount", "this pair of prefixes". When you find yourself unable to phrase the split, you probably do not have a divide and conquer yet.',
    },
    {
      kind: 'callout',
      tone: 'good',
      title: 'If you remember one thing from this page',
      text: 'Divide and conquer is not a complexity class — it is a shape, and the complexity falls out of how fast the sub-problem shrinks. Halve it and you get `n log n`; subtract one and you get `2ⁿ`. Then do not forget the combine step: that is where the space and the remaining `n` per level live.',
    },
    {
      kind: 'p',
      text: 'The recursion is the easy half of the story, and [recursion is a stack you can watch](/learn/recursion-is-a-stack) is about that: the machine was doing this bookkeeping invisibly, and these are the algorithms where the shape of the call tree is the thing you actually have to understand.',
    },
  ],
};
