import type { Article } from '../types.ts';

/**
 * Heaps.
 *
 * Two algorithms in this category, and the article is really about the structure that
 * makes both of them short. Build-heap is in `heaps/`, the extraction sort is in
 * `heaps/` too, and a *different* max-heap sort lives in `sorting/` — the contrast
 * between them is the last section, because it is the most useful thing in the
 * category.
 */
export const HEAPS: Article = {
  slug: 'heaps',
  title: 'The heap is a partial order, not a sorted list',
  dek: 'One invariant about parents and children, and building, extracting and sorting all fall out of it.',
  category: 'heaps',
  tags: ['heap', 'sift-down', 'priority queue', 'Floyd heapify', 'linear build'],
  readMinutes: 10,
  algoId: 'build-heap',
  body: [
    {
      kind: 'p',
      text: 'A heap is the data structure that gives up almost everything in exchange for one guarantee: **you can get the smallest (or largest) element in `O(1)` and remove it in `O(log n)`**. That is all it promises, and the discipline of not promising more is the entire difficulty of using one.',
    },
    {
      kind: 'p',
      text: 'The concrete rule is one sentence: **every parent is smaller than both its children** (a min-heap), or larger than both (a max-heap). Nothing else is required. Not that the left subtree is smaller than the right, not that the array is sorted, not that siblings are in any order.',
    },

    { kind: 'h2', text: 'The array is the tree' },
    {
      kind: 'p',
      text: 'There are no pointers. A complete binary tree — every level full except possibly the last — packs into an array with no holes, and the child/parent relationships are arithmetic:',
    },
    {
      kind: 'table',
      head: ['Relationship', 'Index', 'Notes'],
      rows: [
        ['left child of `i`', '`2i + 1`', 'may be past the end, which means `i` is a leaf'],
        ['right child of `i`', '`2i + 2`', 'always present if the left one is'],
        ['parent of `i`', '`⌊(i − 1) / 2⌋`', '`i > 0` only; index 0 is the root'],
        [
          'last internal node',
          '`⌊n/2⌋ − 1`',
          'everything after this is a leaf, and a leaf is never the problem',
        ],
      ],
    },
    {
      kind: 'p',
      text: 'Exactly `⌊n/2⌋` of `n` nodes have children, so **half the array is already a valid heap when you start**. That single fact is the reason a heap can be built in linear time and the reason it cannot be built in constant time. Both halves of that sentence matter.',
    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'Why the visualiser prints the indices',
      text: 'A heap drawn as a tree hides the most important thing about it, which is that it is an array. The visualisation shows the tree with `[i]` printed under every box and a legend entry for it, because a student should never have to infer `2i + 1` from a picture of a tree. The arithmetic is the data structure; the drawing is only a convenience.',
    },

    { kind: 'h2', text: 'Sift-down is the only interesting operation' },
    {
      kind: 'p',
      text: 'Everything else in this category is sift-down applied at the right times. Sift-down at index `i`: look at the children, find the **smaller** one, and if it is smaller than the parent, swap and carry on from the new index. Two exits — you hit a leaf, or the parent already beats both children.',
    },
    {
      kind: 'stepper',
      algoId: 'build-heap',
      caption:
        'Bottom-up heapify. Watch the spine: after a swap the sift continues from the new index, which is the whole trick.',
      preset: 'random',
    },
    {
      kind: 'p',
      text: 'The line that is easy to miss is "**continue from the new index**". A node is not fixed where it lands; it is fixed when nothing below it is smaller. That is why a single sift can be `O(log n)` even though the whole build is `O(n)`.',
    },
    {
      kind: 'ul',
      items: [
        '**Ties pick the left child and do not swap** — the comparison is `>=`, so an equal pair stops the sift. Swapping equal values would loop forever.',
        '**A leaf is always in its final place.** No children, nothing to compare against, done.',
        '**`⌊n/2⌋ − 1` down to `0`, not `n−1` down to `0`.** Starting at the end would sift leaves, which do nothing.',
      ],
    },
    {
      kind: 'p',
      text: 'Two presets show the extremes. An already-sorted array is already a min-heap, so the build performs **zero swaps** — which is worth seeing, because "no work" is different from "not reported". A reverse-sorted array does the most moving possible and is still `O(n)`.',
    },

    { kind: 'h2', text: 'Building is linear, and that is the surprise' },
    {
      kind: 'p',
      text: 'Sift-down is `O(log n)` and there are `n/2` calls to it, so the multiplication suggests `O(n log n)`. The real answer is `O(n)`, and the argument is a sum rather than a product:',
    },
    {
      kind: 'p',
      text: 'The nodes near the bottom — the ones with the longest sifts — are exponentially numerous, and the ones near the root, with the shortest sifts, are exponentially few. A node at depth `d` has at most `d` levels below it, and there are `2^d` nodes at that depth. So the work is `Σ 2^d · d`, which converges to a constant times `n`.',
    },
    {
      kind: 'table',
      head: ['Depth', 'Nodes', 'Max sift length', 'Work at this depth'],
      rows: [
        ['bottom', '`n/2`', '1', '`n/2`'],
        ['next up', '`n/4`', '2', '`n/2`'],
        ['next up', '`n/8`', '3', '`3n/8`'],
        ['…', '`n/2ᵈ`', '`d`', '`d·n/2ᵈ`'],
        ['**total**', '**`n`**', '**`log n`**', '**`O(n)`**'],
      ],
    },
    {
      kind: 'callout',
      tone: 'warn',
      title: 'The obvious implementation is the slow one',
      text: 'Pushing each element into the heap one at a time is `O(n log n)` and much easier to write. Bottom-up Floyd heapify is `O(n)` and barely harder. If you are about to build a heap by repeated pushes, you are leaving a factor of `log n` on the table for no reason — and the visualisation makes the difference easy to see, because the bottom-up version does its longest sifts first, on the most nodes.',
    },

    { kind: 'h2', text: 'Extraction: heapsort in six lines' },
    {
      kind: 'p',
      text: 'Once you can build a heap, sorting is: repeatedly swap the root to the end of the active region, shrink the region by one, and sift the root back down. That is the entire algorithm.',
    },
    {
      kind: 'stepper',
      algoId: 'heapsort',
      caption:
        'Heapsort by extraction. Each step parks the root in its final position at the right-hand end — the green suffix is never touched again.',
      preset: 'random',
    },
    {
      kind: 'p',
      text: 'Two details carry the whole correctness argument. The **extract** step is the only move in the algorithm, and the **boundary** is the invariant: everything at or past the end of the active region is final and will never be read again. In a min-heap the root is the smallest remaining value and it is parked at the far right, so this particular visualisation sorts **descending**.',
    },
    {
      kind: 'p',
      text: 'The complexity is `O(n log n)` in every case — `O(n)` to build plus `n − 1` extractions at `O(log n)` each — with `O(1)` extra space and no auxiliary array at all. That combination is genuinely rare: a comparison sort with a worst-case guarantee **and** no extra memory.',
    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'And it usually loses anyway',
      text: 'Worst-case `O(n log n)` with `O(1)` space sounds unbeatable, and quicksort still beats it in practice because its inner loop scans contiguous memory with excellent cache behaviour while a heap jumps around the array. Heapsort is the right answer when memory is tight and the data is on disk — where cache misses dominate everything — and the wrong answer for an in-memory array of a million ints.',
    },

    { kind: 'h2', text: 'When you actually want a heap' },
    {
      kind: 'p',
      text: 'Not for sorting, usually. A heap is a **priority queue**: a collection you need to repeatedly take the extreme element out of, while the priorities change. That is a much narrower job than it first appears, and it is worth being able to recognise:',
    },
    {
      kind: 'ul',
      items: [
        "**Dijkstra's and A*** — [both](/learn/shortest-paths) need the cheapest unsettled node, over and over, while new cheaper routes appear.",
        '**Merging k sorted streams** — repeatedly take the smallest head among `k` lists. A heap makes it `O(log k)` per output instead of a linear scan.',
        '**Event simulation and scheduling** — "what happens next" with insertions between steps.',
        '**Top-k without sorting everything** — `O(n log k)` and you never hold more than `k` elements. (The top-k algorithm in this app deliberately takes the other route, because with a small `k` re-sorting a handful of candidates is faster in practice than maintaining a heap.)',
        '**Interrupts and timers, and the runnable queues in every thread scheduler.**',
      ],
    },
    {
      kind: 'h2',
      text: 'What a heap is not',
    },
    {
      kind: 'table',
      head: ['You might expect', 'Reality', 'What to use instead'],
      rows: [
        [
          'the array is sorted',
          'only the root is known',
          'sort it — see [the sorts](/learn/sorting-landscape)',
        ],
        [
          'I can binary search it',
          'no, only one comparison is guaranteed',
          'a sorted array, or a BST',
        ],
        ['I can index element `i`', 'you can, but position means nothing', 'an array, or a BST'],
        [
          'range or neighbour queries',
          'no ordering between siblings',
          'a [balanced tree](/learn/binary-search-trees)',
        ],
        [
          'it is cheap to build incrementally',
          '`O(log n)` per push',
          'build it bottom-up in `O(n)`',
        ],
      ],
    },
    {
      kind: 'p',
      text: 'The first row is the one that catches people. `[1, 5, 2, 6, 3]` is a perfectly valid min-heap, and it is not sorted, and there is nothing you can do with the heap that depends on it being either. A heap encodes a **partial order** — enough to answer "what is the minimum" and nothing else — and a data structure that gives you more than its invariant can promise is a data structure you will eventually misread.',
    },
    {
      kind: 'callout',
      tone: 'good',
      title: 'The min-heap and max-heap version, in one line',
      text: 'This app has both, and the difference is three comparisons. The heap builder and the extraction sort here are min-heaps, chosen so that the array-ordering the visualisation draws matches the implicit array; the sort in the sorting category is a max-heap, chosen for the conventional reason, and it therefore sorts ascending. Same structure, same operations, opposite output — which is exactly what "a partial order" predicts.',
    },
    {
      kind: 'p',
      text: 'The heap is the purest example in this app of a structure whose value is entirely in what it **declines** to do, and that is why it pairs so well with the rest of the material here: a heap is [a tree](/learn/binary-search-trees) with the ordering requirement deleted, and the deletion is what buys the `O(1)` minimum.',
    },
  ],
};
