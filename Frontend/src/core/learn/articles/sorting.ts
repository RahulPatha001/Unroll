import type { Article } from '../types.ts';

/**
 * The sorting family.
 *
 * Grouped in one file rather than one-per-article because these three are
 * genuinely one conversation: what bubble sort does, why the other seven exist,
 * and how to choose between them. Splitting them puts the answer to "which should
 * I use" in a different file from the question that motivates it.
 */
export const BUBBLE_SORT: Article = {
  slug: 'bubble-sort',
  title: 'Bubble sort, explained slowly',
  dek: 'The slowest sort is still the clearest one. Here is what each pass actually guarantees.',
  category: 'sorting',
  tags: ['quadratic', 'swap', 'stable', 'intro'],
  readMinutes: 6,
  algoId: 'bubble-sort',
  body: [
    {
      kind: 'p',
      text: 'Bubble sort has a reputation for being a bad algorithm, and it earned that reputation honestly: it is **O(n²)** in the worst case, and no amount of cleverness in the surrounding code changes that. But it is also the sort that almost everyone can draw correctly from memory, and that is not a coincidence. It is the sort whose correctness argument fits in one sentence.',
    },
    { kind: 'h2', text: 'The one-sentence invariant' },
    {
      kind: 'p',
      text: 'After the end of pass `k`, the **k largest elements are in their final positions at the right-hand end**. Not approximately. Not "probably". Final.',
    },
    {
      kind: 'p',
      text: 'That is the entire argument. A single pass walks left to right comparing adjacent pairs, and swaps whenever the left one is bigger. When the walk reaches position `n-1`, whatever is sitting there is the largest element that has not already been parked — because if a larger one were anywhere earlier in the array, the walk would have carried it along as it swapped. So the largest element ends the pass in the last slot, and is never touched again.',
    },
    {
      kind: 'p',
      text: 'Run that pass `n-1` times and everything has been parked. The correctness proof is finished. This is why bubble sort is worth understanding even if you never write it: it is the cleanest example of a **loop invariant** doing real work in a piece of teaching code.',
    },
    {
      kind: 'stepper',
      algoId: 'bubble-sort',
      caption:
        'Bubble sort. Step slowly and watch the right-hand end lock in — that is the invariant.',
      preset: 'random',
    },

    { kind: 'h2', text: 'Why it is quadratic, and what "quadratic" costs' },
    {
      kind: 'p',
      text: 'A full pass is `n-1` comparisons. You need `n-1` passes. That is `(n-1)²` comparisons, which is the definition of quadratic.',
    },
    {
      kind: 'p',
      text: 'The number that matters is what that means in wall-clock time. At n = 10,000 a quadratic sort performs about 50 million comparisons — roughly a second of work. At n = 100,000, about 5 billion — **fifty seconds**. Quadratic growth means the step from "fine" to "impossible" is one order of magnitude of input, which is why the crossover point where bubble sort stops being acceptable is so low.',
    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'The one property worth keeping',
      text: 'Bubble sort is **stable**: equal elements never swap, because the swap condition is strictly greater-than. That makes it the right answer for a genuinely small, genuinely stability-sensitive sort — which in practice is almost never.',
    },

    { kind: 'h2', text: 'The optimisation nobody should bother with' },
    {
      kind: 'p',
      text: 'Every tutorial adds an early-exit flag: if a whole pass completes without a single swap, stop. The array is sorted, because a pass with no swaps means every adjacent pair is already in order, and that is the definition of sorted.',
    },
    {
      kind: 'p',
      text: 'It is correct, it takes one boolean, and it changes the **worst case** not at all — an already-reversed array still does every comparison. What it improves is **best case**, from O(n²) to O(n). If your data is nearly sorted, that is a big deal. If your data is random, it saves you one pass out of `n`.',
    },
    {
      kind: 'p',
      text: 'Which is the honest summary of bubble sort: it is a teaching algorithm with two good properties, one of which (stability) is genuinely useful and one of which (the early exit) only pays off on data that some other algorithm would already have handled faster.',
    },
    {
      kind: 'stepper',
      algoId: 'bubble-sort',
      caption:
        'The reversed preset is the worst case: every pass does a full sweep and swaps every pair.',
      preset: 'reverse',
    },

    { kind: 'h2', text: 'What to actually use instead' },
    {
      kind: 'p',
      text: 'Never bubble sort in production. But keep the mental model, because it is the same model underneath insertion sort, and insertion sort is genuinely useful — it is what you want for a nearly-sorted array, and it is the algorithm inside most hybrid sorts for small runs.',
    },
    {
      kind: 'p',
      text: 'The [sorting landscape](/learn/sorting-landscape) article compares all eight sorts in this app side by side, including the two that beat the comparison barrier entirely.',
    },
  ],
};

export const SORTING_LANDSCAPE: Article = {
  slug: 'sorting-landscape',
  title: 'The eight sorts, side by side',
  dek: 'What each sorting algorithm is actually good at, and the two that beat the comparison barrier.',
  category: 'sorting',
  tags: ['comparison', 'non-comparative', 'stability', 'choose'],
  readMinutes: 11,
  body: [
    {
      kind: 'p',
      text: 'Eight sorting algorithms in this app, and picking between them is mostly a question of three things: **do you know the range of your values**, **does the order of equal elements matter**, and **how much extra memory may you spend**. Get those three answers and the choice is usually forced.',
    },

    { kind: 'h2', text: 'The barrier you cannot cross with comparisons' },
    {
      kind: 'p',
      text: 'There is a hard lower bound on any sort that works by comparing two elements: **Ω(n log n)** comparisons. The proof is short — a comparison sort builds a decision tree, and to place `n` elements in order it must distinguish `n!` possible arrangements, so the tree needs `log₂(n!) ≈ n log₂ n` levels.',
    },
    {
      kind: 'p',
      text: 'This is why quicksort, merge sort and heapsort all land on `O(n log n)` average or worst case: they are not cleverer than each other by a meaningful margin, they are all **at the bound**. The only question between them is the constant factor and the memory behaviour.',
    },
    {
      kind: 'callout',
      tone: 'warn',
      title: 'But the bound has a door in it',
      text: 'The proof assumes every decision comes from a comparison. Counting sort and radix sort never compare two values at all — they **count** them, or bucket them by digit. That is not a trick that avoids the lower bound, it is a different model: it trades generality for knowledge of the value range.',
    },

    { kind: 'h2', text: 'The comparison' },
    {
      kind: 'table',
      head: ['Algorithm', 'Average', 'Worst', 'Space', 'Stable', 'Use it when'],
      rows: [
        [
          'Bubble sort',
          'O(n²)',
          'O(n²)',
          'O(1)',
          'yes',
          'teaching, or n < 20 and you want to see it',
        ],
        ['Selection sort', 'O(n²)', 'O(n²)', 'O(1)', 'no', 'nothing — see below'],
        [
          'Insertion sort',
          'O(n²)',
          'O(n²)',
          'O(1)',
          'yes',
          'the input is nearly sorted, or n is tiny',
        ],
        [
          'Merge sort',
          'O(n log n)',
          'O(n log n)',
          'O(n)',
          'yes',
          'you need stability and a worst-case guarantee',
        ],
        [
          'Quicksort',
          'O(n log n)',
          'O(n²)',
          'O(log n)',
          'no',
          'the default. fastest in practice, in memory',
        ],
        [
          'Heap sort',
          'O(n log n)',
          'O(n log n)',
          'O(1)',
          'no',
          'worst-case guarantee **and** no extra memory',
        ],
        [
          'Counting sort',
          'O(n + k)',
          'O(n + k)',
          'O(k)',
          'yes',
          'values are integers in a known, small range',
        ],
        [
          'Radix sort',
          'O(d·(n+k))',
          'O(d·(n+k))',
          'O(n+k)',
          'yes',
          'fixed-width integers, like 32-bit or 64-bit keys',
        ],
      ],
    },
    {
      kind: 'p',
      text: 'Selection sort earns its row mostly so the table is complete. It does exactly `n²/2` comparisons **always** — the count does not depend on the input at all — and it performs more writes than any other sort here. There is no input for which it is the right choice. Its one genuine merit is that it is trivial to write correctly, which is why it survives in textbooks.',
    },

    { kind: 'h2', text: 'The three questions, answered' },
    { kind: 'h3', text: 'Do you know the range of your values?' },
    {
      kind: 'p',
      text: 'If yes, skip the comparison sorts entirely. Counting sort on integers 0–1000 is linear and beats every `n log n` sort at every meaningful `n`, because it does no comparisons at all. Radix sort extends the idea to fixed-width integers: run counting sort once per digit, from the least significant up, and each pass has to be **stable** for the result to come out sorted.',
    },
    {
      kind: 'stepper',
      algoId: 'counting-sort',
      caption:
        'Counting sort. Watch the tallies become running totals, then watch each value land in the slot its total names.',
      preset: 'small-range',
    },
    {
      kind: 'p',
      text: 'That stability requirement is the whole reason radix sort is built out of counting sort and not something else. LSD radix only works because a stable pass preserves the relative order of everything it did not move, so after sorting by the units digit and then the tens digit, the array is ordered by the full number.',
    },
    {
      kind: 'stepper',
      algoId: 'radix-sort',
      caption:
        'LSD radix sort. Each pass is a stable counting sort on one digit place — the last pass is the first one to produce a fully ordered array.',
      preset: 'two-digit',
    },

    { kind: 'h3', text: 'Does the order of equal elements matter?' },
    {
      kind: 'p',
      text: 'If you are sorting records by one field while other fields carry meaning, stability is not a nicety. A stable sort preserves the input order of equal keys; an unstable one is free to permute them. Merge sort, counting sort and radix sort are all stable. Quicksort, heapsort and selection sort are not.',
    },
    {
      kind: 'p',
      text: 'If you do not care, drop the requirement and use quicksort — it is the fastest of the three comparison sorts in practice, because its inner loop is a tight scan over contiguous memory with excellent cache behaviour, and because the recursion is shallow.',
    },

    { kind: 'h3', text: 'How much extra memory may you spend?' },
    {
      kind: 'p',
      text: 'Merge sort allocates an auxiliary buffer the size of the input. On a 100 MB array that is another 100 MB, and on a memory-constrained machine that is the difference between working and not. Heap sort is in-place **and** has a worst-case guarantee, which is a genuinely rare combination — but its constant factor is bad enough that it usually loses to quicksort when memory is available.',
    },
    {
      kind: 'stepper',
      algoId: 'quick-sort',
      caption:
        'Quicksort partitioning. The pivot in amber is the value every remaining decision is relative to.',
      preset: 'random',
    },

    { kind: 'h2', text: 'What quicksort does when it goes wrong' },
    {
      kind: 'p',
      text: 'Quick sort is `O(n²)` in the worst case, and the worst case is not exotic: pick a pivot that is always the smallest or largest remaining element — an already-sorted array with the first element as pivot — and every partition splits off exactly one element. You get `n` levels of recursion and `O(n²)` comparisons.',
    },
    {
      kind: 'p',
      text: 'Three standard defences, and they are not equally good. Picking a random pivot makes the bad case a 1-in-n chance per level, which is usually enough. Picking the **median of three** (first, middle, last) defeats the sorted-input case specifically. And introsort — quicksort that counts its recursion depth and switches to heapsort past a `2·log n` threshold — gives up the `O(n log n)` worst case only in the case where nobody cares, because by then the input is pathological enough that the constant factor is academic.',
    },

    { kind: 'h2', text: 'The one-line answer' },
    {
      kind: 'callout',
      tone: 'good',
      title: 'If you remember one thing from this page',
      text: 'Integers in a known range → counting sort. Fixed-width integers → radix sort. Otherwise → quicksort, unless you need stability (merge sort) or a worst-case guarantee with no extra memory (heap sort). Everything else in the table is for learning.',
    },
  ],
};
