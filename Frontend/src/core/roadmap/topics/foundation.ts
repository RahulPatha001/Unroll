import type { Topic } from '../types.ts';

/**
 * Phase 1 — Foundation.
 *
 * ## Why a topic called "thinking in Big O" is in a practice roadmap
 *
 * Because it is the one that changes what a beginner does at the keyboard. A learner
 * who cannot name a cost writes a nested loop, gets an "accepted" verdict from a
 * problem with 10^4 inputs, and concludes they can code. Every timeout they hit
 * afterwards is a disguised lesson about complexity that nobody chose to teach them.
 *
 * So this first topic has almost no hard problems, and the two hardest questions in
 * it are number theory and a precision trap. That is deliberate: the subject is
 * judgement, not difficulty, and it is the only topic in the roadmap whose questions
 * are mostly easy by design.
 *
 * The three CodeChef `FLOW` problems are here for a second reason. They are the
 * easiest way to practise reading an input format you have never seen — CodeChef
 * states the shape in prose and gives no example beyond the samples — and that is a
 * skill, and a transferrable one.
 */
export const FOUNDATION: readonly Topic[] = [
  {
    id: 'complexity-and-big-o',
    title: 'Thinking in Big O',
    blurb:
      'Count operations instead of running them. Before you optimise anything, you have to be able to say what you are paying and how you know — because "it worked" is not evidence and an accepted verdict on 10^4 inputs is not a proof.',
    phase: 'foundation',
    algoIds: ['linear-search'],
    learnSlugs: ['reading-big-o'],
    keyPoints: [
      'Read a loop out loud and count the work per iteration; the inner loop is the one that decides the cost.',
      'Know the cost of every collection you can reach for: array access is O(1), `Array.shift` is O(n), `Set.has` is O(1) amortised.',
      'Separate the O(n) part from the O(n log n) part. Almost every "my solution is O(n^2) and it times out" story ends in a sort that could have been outside the loop.',
      'Multiply rather than add when loops are nested, and add rather than multiply when they are sequential.',
    ],
    questions: [
      {
        id: 'cc-flow006',
        title: 'FLOW006 — Sum of Digits',
        platform: 'codechef',
        level: 'easy',
        url: 'https://www.codechef.com/problems/FLOW006',
      },
      {
        id: 'cc-flow018',
        title: 'FLOW018 — Small Factorial',
        platform: 'codechef',
        level: 'easy',
        url: 'https://www.codechef.com/problems/FLOW018',
      },
      {
        id: 'cc-csub',
        title: 'CSUB — Count Substrings',
        platform: 'codechef',
        level: 'easy',
        url: 'https://www.codechef.com/problems/CSUB',
      },
      {
        id: 'cc-qset',
        title: 'QSET — Queries on the String',
        platform: 'codechef',
        level: 'hard',
        url: 'https://www.codechef.com/problems/QSET',
      },
      {
        id: 'lc-three-sum',
        title: '3Sum',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/3sum/',
      },
      {
        id: 'hr-array-left-rotation',
        title: 'Left Rotation',
        platform: 'hackerrank',
        level: 'easy',
        url: 'https://www.hackerrank.com/challenges/array-left-rotation/problem',
      },
      {
        id: 'cc-intest',
        title: 'INTEST — Enormous Input Test',
        platform: 'codechef',
        level: 'medium',
        url: 'https://www.codechef.com/problems/INTEST',
      },
    ],
  },

  {
    id: 'arrays-basics',
    title: 'Arrays and traversal',
    blurb:
      'Indices, in-place edits, and the habit of reading the input before writing the loop. Most "easy" array problems are not about a clever idea — they are about not losing track of where you are.',
    phase: 'foundation',
    algoIds: ['linear-search', 'pair-sum'],
    learnSlugs: ['pointer-problems'],
    keyPoints: [
      'A loop index is not a value. Write `for (i in 0..n)` before `for (x in a)` and know which one you need.',
      'In-place means O(1) extra space, which usually means a read index and a write index that never cross.',
      'Off-by-one lives in the boundary: an empty array, a single element, and the last element deserve their own line or three.',
      'Prefer returning an index or a boolean over mutating, until you have a reason.',
    ],
    questions: [
      {
        id: 'cc-flow001',
        title: 'FLOW001 — Add Two Numbers',
        platform: 'codechef',
        level: 'easy',
        url: 'https://www.codechef.com/problems/FLOW001',
      },
      {
        id: 'cc-flow002',
        title: 'FLOW002 — Find Remainder',
        platform: 'codechef',
        level: 'easy',
        url: 'https://www.codechef.com/problems/FLOW002',
      },
      {
        id: 'lc-two-sum',
        title: 'Two Sum',
        platform: 'leetcode',
        level: 'easy',
        url: 'https://leetcode.com/problems/two-sum/',
      },
      {
        id: 'lc-best-time-to-buy-and-sell-stock',
        title: 'Best Time to Buy and Sell Stock',
        platform: 'leetcode',
        level: 'easy',
        url: 'https://leetcode.com/problems/best-time-to-buy-and-sell-stock/',
      },
      {
        id: 'lc-best-time-to-buy-and-sell-stock-ii',
        title: 'Best Time to Buy and Sell Stock II',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/best-time-to-buy-and-sell-stock-ii/',
      },
      {
        id: 'lc-remove-duplicates',
        title: 'Remove Duplicates from Sorted Array',
        platform: 'leetcode',
        level: 'easy',
        url: 'https://leetcode.com/problems/remove-duplicates-from-sorted-array/',
      },
      {
        id: 'lc-move-zeroes',
        title: 'Move Zeroes',
        platform: 'leetcode',
        level: 'easy',
        url: 'https://leetcode.com/problems/move-zeroes/',
      },
      {
        id: 'gfg-missing-number',
        title: 'Missing in Array',
        platform: 'gfg',
        level: 'easy',
        url: 'https://www.geeksforgeeks.org/problems/missing-number-in-array/1',
      },
      {
        id: 'hr-simple-array-sum',
        title: 'Simple Array Sum',
        platform: 'hackerrank',
        level: 'easy',
        url: 'https://www.hackerrank.com/challenges/simple-array-sum/problem',
      },
    ],
  },

  {
    id: 'strings-basics',
    title: 'Strings and characters',
    blurb:
      'Strings are arrays with an API that lies: `+` copies, `sort` allocates, and a "character" can be a grapheme, a code unit, or a code point. Learn which one you are holding.',
    phase: 'foundation',
    algoIds: ['valid-palindrome'],
    learnSlugs: ['strings-as-keys'],
    keyPoints: [
      'Strings are immutable: `s += "a"` builds a new string. Inside a loop that is O(n²), and it is the single most common avoidable timeout on CodeChef.',
      'In most problem languages the alphabet is fixed size, so a 26- or 256-slot frequency array is a valid map and it beats a hash map.',
      'Case folding and whitespace normalisation are part of the problem, not a detail — read the statement twice.',
      'Build the answer in a list and join once, if your language makes repeated concatenation copy.',
    ],
    questions: [
      {
        id: 'cc-flow007',
        title: 'FLOW007 — Reverse The Number',
        platform: 'codechef',
        level: 'easy',
        url: 'https://www.codechef.com/problems/FLOW007',
      },
      {
        id: 'gfg-palindrome-string',
        title: 'Palindrome String',
        platform: 'gfg',
        level: 'easy',
        url: 'https://www.geeksforgeeks.org/problems/palindrome-string/1',
      },
      {
        id: 'lc-valid-anagram',
        title: 'Valid Anagram',
        platform: 'leetcode',
        level: 'easy',
        url: 'https://leetcode.com/problems/valid-anagram/',
      },
      {
        id: 'ib-valid-anagram',
        title: 'Valid Anagram',
        platform: 'interviewbit',
        level: 'easy',
        url: 'https://www.interviewbit.com/problems/valid-anagram/',
      },
      {
        id: 'ib-convert-string-to-integer',
        title: 'Convert String to Integer',
        platform: 'interviewbit',
        level: 'easy',
        url: 'https://www.interviewbit.com/problems/convert-string-to-integer/',
      },
      {
        id: 'hr-palindrome-index',
        title: 'Palindrome Index',
        platform: 'hackerrank',
        level: 'easy',
        url: 'https://www.hackerrank.com/challenges/palindrome-index/problem',
      },
      {
        id: 'cc-chrl2',
        title: 'CHRL2 — Chef and String',
        platform: 'codechef',
        level: 'medium',
        url: 'https://www.codechef.com/problems/CHRL2',
      },
      {
        id: 'hr-morgan-and-a-string',
        title: 'Morgan and a String',
        platform: 'hackerrank',
        level: 'hard',
        url: 'https://www.hackerrank.com/challenges/morgan-and-a-string/problem',
      },
    ],
  },

  {
    id: 'hash-tables',
    title: 'Hash tables, sets and counting',
    blurb:
      'The first data structure that buys you a factor of n. Learn to ask "what have I already seen?" — that question is the whole topic, and it answers itself with one of three things.',
    phase: 'foundation',
    algoIds: ['hash-table', 'top-k-frequent', 'two-sum-hash'],
    learnSlugs: ['hash-tables', 'strings-as-keys'],
    keyPoints: [
      'Three shapes: a `Set` for "have I seen this", a map value for "how many times", and a map of index for "where did I see it".',
      'Counting is the default. If the problem mentions duplicates, frequency, unique, or "the element that appears only once", reach for counting first.',
      'A hash map is O(1) *expected*. The expectation is over the hash function, and a test set built to collide is the standard interview trap.',
      'One pass is often enough: the moment you need a second pass, ask whether the first could have stored the answer instead.',
    ],
    questions: [
      {
        id: 'lc-contains-duplicate',
        title: 'Contains Duplicate',
        platform: 'leetcode',
        level: 'easy',
        url: 'https://leetcode.com/problems/contains-duplicate/',
      },
      {
        id: 'lc-single-number',
        title: 'Single Number',
        platform: 'leetcode',
        level: 'easy',
        url: 'https://leetcode.com/problems/single-number/',
      },
      {
        id: 'ib-single-number',
        title: 'Single Number',
        platform: 'interviewbit',
        level: 'easy',
        url: 'https://www.interviewbit.com/problems/single-number/',
      },
      {
        id: 'ib-single-number-ii',
        title: 'Single Number II',
        platform: 'interviewbit',
        level: 'medium',
        url: 'https://www.interviewbit.com/problems/single-number-ii/',
      },
      {
        id: 'lc-missing-number',
        title: 'Missing Number',
        platform: 'leetcode',
        level: 'easy',
        url: 'https://leetcode.com/problems/missing-number/',
      },
      {
        id: 'lc-group-anagrams',
        title: 'Group Anagrams',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/group-anagrams/',
      },
      {
        id: 'gfg-majority-element',
        title: 'Majority Element',
        platform: 'gfg',
        level: 'easy',
        url: 'https://www.geeksforgeeks.org/problems/majority-element/1',
      },
      {
        id: 'ib-majority-element',
        title: 'Majority Element',
        platform: 'interviewbit',
        level: 'easy',
        url: 'https://www.interviewbit.com/problems/majority-element/',
      },
      {
        id: 'lc-top-k-frequent',
        title: 'Top K Frequent Elements',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/top-k-frequent-elements/',
      },
      {
        id: 'he-rhezo-and-character-frequency',
        title: 'Rhezo and Character Frequency',
        platform: 'hackerearth',
        level: 'easy',
        url: 'https://www.hackerearth.com/problem/algorithm/rhezo-and-character-frequency/',
      },
      {
        id: 'he-duplicate-characters',
        title: 'Duplicate Characters',
        platform: 'hackerearth',
        level: 'easy',
        url: 'https://www.hackerearth.com/problem/algorithm/duplicate-characters/',
      },
      {
        id: 'he-elections',
        title: 'Elections',
        platform: 'hackerearth',
        level: 'medium',
        url: 'https://www.hackerearth.com/problem/algorithm/elections/',
      },
    ],
  },

  {
    id: 'sorting-basics',
    title: 'Sorting and its questions',
    blurb:
      'Sorting is the only algorithm class where you never need to implement it — and you always need to know what it costs, when it is stable, and what the input being sorted *enables*.',
    phase: 'foundation',
    algoIds: ['bubble-sort', 'selection-sort', 'insertion-sort', 'merge-sort', 'quick-sort'],
    learnSlugs: ['bubble-sort', 'sorting-landscape'],
    keyPoints: [
      'The comparison lower bound is Ω(n log n). If your solution beats that on arbitrary input, either the input is special or your code is wrong.',
      'Stability decides whether equal elements keep their relative order. It is what makes "sort by key, then by key" correct.',
      'Counting and radix sort are O(n + k) and only apply to bounded or digit keys. Recognising *when* a linear sort is legal is the skill.',
      'Sorting first is almost always available as a fix: if you can state an ordering, an interval merge, or "group by", sort and scan.',
    ],
    questions: [
      {
        id: 'cc-flow013',
        title: 'FLOW013 — Valid Triangles',
        platform: 'codechef',
        level: 'easy',
        url: 'https://www.codechef.com/problems/FLOW013',
      },
      {
        id: 'hr-insertionsort1',
        title: 'Insertion Sort — Part 1',
        platform: 'hackerrank',
        level: 'easy',
        url: 'https://www.hackerrank.com/challenges/insertionsort1/problem',
      },
      {
        id: 'hr-countingsort1',
        title: 'Counting Sort 1',
        platform: 'hackerrank',
        level: 'easy',
        url: 'https://www.hackerrank.com/challenges/countingsort1/problem',
      },
      {
        id: 'gfg-insertion-sort',
        title: 'Insertion Sort',
        platform: 'gfg',
        level: 'easy',
        url: 'https://www.geeksforgeeks.org/problems/insertion-sort/1',
      },
      {
        id: 'gfg-selection-sort',
        title: 'Selection Sort',
        platform: 'gfg',
        level: 'easy',
        url: 'https://www.geeksforgeeks.org/problems/selection-sort/1',
      },
      {
        id: 'lc-sort-colors',
        title: 'Sort Colors',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/sort-colors/',
      },
      {
        id: 'gfg-sort-0s-1s-and-2s',
        title: 'Sort 0s, 1s and 2s',
        platform: 'gfg',
        level: 'medium',
        url: 'https://www.geeksforgeeks.org/problems/sort-an-array-of-0s-1s-and-2s/1',
      },
      {
        id: 'lc-merge-intervals',
        title: 'Merge Intervals',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/merge-intervals/',
      },
      {
        id: 'hr-big-sorting',
        title: 'Big Sorting',
        platform: 'hackerrank',
        level: 'medium',
        url: 'https://www.hackerrank.com/challenges/big-sorting/problem',
      },
      {
        id: 'gfg-next-permutation',
        title: 'Next Permutation',
        platform: 'gfg',
        level: 'medium',
        url: 'https://www.geeksforgeeks.org/problems/next-permutation/1',
      },
      {
        id: 'hr-closest-numbers',
        title: 'Closest Numbers',
        platform: 'hackerrank',
        level: 'easy',
        url: 'https://www.hackerrank.com/challenges/closest-numbers/problem',
      },
    ],
  },
] as const;
