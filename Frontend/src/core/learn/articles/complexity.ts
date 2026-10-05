import type { Article } from '../types.ts';

/**
 * The one piece of background every other article in this section assumes.
 *
 * ## Why this is here, and not on the algorithm page
 *
 * Every one of the 66 algorithms in this app carries a complexity line, and it is the
 * most repeated claim in computing and the most often quoted without the three parts
 * that make it mean anything. A complexity line on its own is a sentence with the
 * subject and the verb missing: "O(n log n)" — of what, in which case, at what cost
 * in memory?
 *
 * So it gets its own article instead. Everything else here can be read for the idea
 * and skipped for the arithmetic; this one is the arithmetic.
 *
 * ## The rule every number below obeys
 *
 * No claim in this article is asymptotic theatre: each one is counted from an
 * implementation that is in this app and can be stepped through. Where the count is
 * `O(n²)`, the stepper is showing you the `n²`.
 */
export const COMPLEXITY: Article = {
  slug: 'reading-big-o',
  title: 'How to read O(n log n)',
  dek: 'What the notation promises, the four things it never says, and how to count the operations yourself.',
  category: 'concepts',
  tags: ['big-O', 'amortised', 'space complexity', 'constants'],
  readMinutes: 11,
  body: [
    {
      kind: 'p',
      text: 'Every algorithm here has a complexity line, and it is the most repeated claim in computing and the most frequently quoted without the parts that make it mean anything. Big-O is one function. The sentence around it — **of what, in which case, at what cost in memory** — is the rest of the claim, and it is the part people drop.',
    },

    { kind: 'h2', text: 'What the notation actually claims' },
    {
      kind: 'p',
      text: '`O(f(n))` is a ceiling, not an estimate. It says: beyond some input size, the operation count never exceeds a constant multiple of `f(n)`. Two consequences follow, and both are routinely forgotten.',
    },
    {
      kind: 'ul',
      items: [
        '**It is about the limit, not the present.** `O(n²)` on ten elements is faster than `O(n log n)` on ten elements, and would be on any small input. Big-O describes a crossover that may be far outside any input you will ever see.',
        '**The constant is not part of the claim.** Two functions both `O(n log n)` can differ by a factor of ten forever. The notation cannot tell them apart, so it does not try — and neither should you when you quote it.',
      ],
    },
    {
      kind: 'p',
      text: 'This is why the growth classes are so widely separated. The gap between `O(n)` and `O(n log n)` is a factor that grows without bound; the gap between two `O(n log n)` sorts is a factor that stays where it is. Complexity classes are worth arguing about. Constants are worth measuring.',
    },
    {
      kind: 'table',
      head: ['Growth', 'n = 1,000', 'n = 1,000,000', 'The step between those two'],
      rows: [
        ['`O(1)`', '1', '1', 'nothing changes'],
        ['`O(log n)`', '10', '20', 'doubles for each extra thousand'],
        ['`O(n)`', '1,000', '1,000,000', 'a thousand times more'],
        ['`O(n log n)`', '10,000', '20,000,000', 'two thousand times more'],
        ['`O(n²)`', '1,000,000', '10¹²', 'a million times more'],
        ['`O(2ⁿ)`', '10³⁰¹', '—', 'never finishes, at any size'],
      ],
    },
    {
      kind: 'p',
      text: 'The last row is the one that matters pedagogically. `O(2ⁿ)` is not "slow", it is a different category: it does not get worse with size so much as it **exits the realm of arithmetic**. Doubling the input does not make the job twice as long, it makes the answer 10¹⁵ times longer. Naive recursion produces it by accident — which is the subject of [recursion is a stack you can watch](/learn/recursion-is-a-stack).',
    },

    { kind: 'h2', text: 'Counting it yourself' },
    {
      kind: 'p',
      text: 'You do not need to derive a complexity from first principles to know one when you see it. Find the line that runs once per element of the input, and ask how many times control reaches it. If it is inside one loop it is `O(n)`. Inside two nested loops it is `O(n²)`. Inside a loop over `n/2` items where the body splits the work in half, it is `O(n log n)` — because the total is `n/2 + n/4 + n/8 + …`, which is `n`.',
    },
    {
      kind: 'p',
      text: 'That last sum is worth doing once, because it is the only place `n log n` comes from. Merge sort splits into halves, and **each** half is sorted at the same price. The work is not `n` at the top level and `n` at the next — it is `n` at the top level and `n/2 + n/2` at the next, and `n/4 · 4` at the one after. Summing the series gives `n` per level, and there are `log₂ n` levels.',
    },
    {
      kind: 'stepper',
      algoId: 'merge-sort',
      caption:
        'Merge sort. Count the widths of the run being merged at each level: n, then n again, then n again — for log₂(n) levels.',
      preset: 'random',
    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'The counting trick that catches almost everything',
      text: 'Find the operation that repeats, then ask what makes the **next** instance of it cheaper. If the next one is the same size, you have a second loop hiding and the answer is `O(n²)`. If it is half the size, the series is `n + n/2 + n/4 …` and the answer is `O(n log n)`. Nothing else generates the classes people actually meet.',
    },

    { kind: 'h2', text: 'The four things the notation does not say' },
    {
      kind: 'p',
      text: 'A bare `O(n log n)` leaves four questions open, and every one of them has changed a real engineering decision.',
    },
    {
      kind: 'ol',
      items: [
        "**Which case?** Best, average and worst are three different functions wearing the same notation. Quicksort is `O(n log n)` on average and `O(n²)` in the worst case, and the worst case is not exotic — it is a sorted array. Quicksort's defence is to make the worst case a 1-in-n chance per level by picking a random pivot, which converts a statement about the data into a statement about randomness.",
        '**What is `n`?** Complexity is a function of one variable, so the count of "elements" has to be chosen deliberately. `O(n log n)` for sorting means `n` items **and** the cost of comparing two of them. Where the comparison is expensive — long strings, 128-bit keys — the second factor dominates and the sort is really `O(n · cost_of_a_comparison)`.',
        '**How much space?** Time is only half the resource. Recursion depth is `O(n)` space on an `O(n)`-time algorithm, and a hash table that never frees a deleted slot grows forever. Space is the claim people leave off and then discover in production.',
        '**Is the bound tight?** `O(n)` and `O(n²)` are both true statements about binary search, one of which is useful. The upper bound is `O(f(n))`; the matching lower bound is `Ω(f(n))`, and it is the pair, written `Θ(f(n))`, that says what the algorithm actually does.',
      ],
    },

    { kind: 'h2', text: 'Space counts, and recursion makes it worse' },
    {
      kind: 'p',
      text: 'The same algorithm can be `O(1)` or `O(n)` in space depending only on how it was written, which is why every complexity line in this app has a space field beside it. Two examples from this app, both `O(n)` time:',
    },
    {
      kind: 'table',
      head: ['Algorithm', 'Time', 'Space', 'What the space actually is'],
      rows: [
        ['Bubble sort', '`O(n²)`', '`O(1)`', 'nothing — the array is already there'],
        ['Merge sort', '`O(n log n)`', '`O(n)`', 'a buffer the size of the input'],
        ['Quicksort', '`O(n log n)`', '`O(log n)`', 'the recursion, which is the partition depth'],
        ['Naive recursive fibonacci', '`O(2ⁿ)`', '`O(n)`', '`n` frames, each holding two ints'],
        ['Build a heap', '`O(n)`', '`O(1)`', 'nothing — the array **is** the heap'],
        ['Hash table', '`O(1)`', '`O(n + capacity)`', 'the buckets, which grow past `n`'],
      ],
    },
    {
      kind: 'p',
      text: 'The quicksort row is the one worth pausing on. Its space cost is the **recursion**, so the familiar fix for a deep quicksort — recurse into the smaller half and loop on the larger — is really a space optimisation that happens to fix a time problem too. The recursion depth is what makes the sorted-input case a stack overflow, and it is also what an explicit stack on the heap would replace.',
    },

    { kind: 'h2', text: 'Amortised cost is a different kind of claim' },
    {
      kind: 'p',
      text: 'Some operations are not bounded by one function of `n` at all — they are bounded by an **average over a sequence of calls**. This is worth separating, because "amortised `O(1)`" and "`O(1)`" are different promises and only one of them is true for any single call.',
    },
    {
      kind: 'p',
      text: 'The hash table in this app is the clean example. It inserts with **doubling**: when the load factor passes 0.75 the table allocates twice as many buckets and walks **every key it holds** to rehash it. That resize is `O(n)` — and it happens, so any one insert can cost `O(n)`. No individual insert is `O(1)`.',
    },
    {
      kind: 'stepper',
      algoId: 'hash-table',
      caption:
        'The resize. Every key is rehashed, and three of the four land in a different bucket — a hash is a function of the key **and** the capacity.',
      preset: 'resize-once',
    },
    {
      kind: 'p',
      text: 'The resolution is that doubling is what makes the average work out. To get from `n` keys to `2n` keys the table does `n` rehashing work — but it crossed `n` inserts to get there, and before that `n/2` inserts paid for the previous resize. Total work over `n` inserts is `n/2 + n/4 + … + n = O(n)`, so the **average** insert is `O(1)`. That is the whole argument for geometric growth, and it is why every dynamic array in every language does the same thing: halving the growth factor makes the total `O(n²)` again.',
    },
    {
      kind: 'callout',
      tone: 'warn',
      title: 'The tell for an amortised claim',
      text: 'If a data structure occasionally does work proportional to **everything it has stored so far**, the per-operation bound is amortised and not worst-case. Reading one element of an `ArrayList` is `O(1)`; **appending** to one is amortised `O(1)` and occasionally `O(n)`. Both claims are true, and only one of them describes a call you can time.',
    },
    {
      kind: 'p',
      text: 'Amortised bounds have a second, subtler use: **a bound on a whole sequence of operations, not on one.** Quicksort\'s `O(n log n)` is amortised over all `n` elements in the sense that the algorithm as a whole is `O(n log n)` even though one unlucky partition is `O(n)`. That is a different statement from "any one element is found in `O(log n)`", and conflating the two is how people come to believe quicksort has no bad case.',
    },

    { kind: 'h2', text: 'A checklist for any complexity claim you read' },
    {
      kind: 'ol',
      items: [
        '**Which case is it?** If it is not stated, assume the worst one.',
        '**What is `n`, and what is the unit of work?** "Per comparison", "per element", "per character" are different claims with different constants.',
        '**What is the space, and is the recursion included?**',
        '**Is it amortised?** If so, what is the worst **single** operation?',
        '**Where is the crossover?** If the input never gets that big, the class is academic — and if it always does, the constant is the only thing left.',
      ],
    },
    {
      kind: 'callout',
      tone: 'good',
      title: 'If you remember one thing from this page',
      text: 'A complexity class is a shape, not a number. Before quoting one, ask four questions: which case, what is `n`, how much space, and is it amortised. Three of those four are not in the notation — and all three are where the engineering decisions actually live.',
    },
    {
      kind: 'p',
      text: 'The next articles apply this rather than restate it: [the eight sorts, side by side](/learn/sorting-landscape) for what the classes are once they are real, [hash tables](/learn/hash-tables) for the `O(1)` claim that is really an amortised one, and [greedy](/learn/greedy) for a technique whose entire difficulty is an argument about the worst case.',
    },
  ],
};
