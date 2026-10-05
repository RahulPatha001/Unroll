import type { Topic } from '../types.ts';

/**
 * Phase 4 — Advanced & interview-ready.
 *
 * ## Dynamic programming is split into two topics, and this is the important split
 *
 * The subject is identical in both: describe the problem as a table of states, write
 * the recurrence, fill the table in an order where every dependency already has a
 * value. But the *first* time you meet it you cannot hold a 2-D table in your head
 * while also working out what the state means, so 1-D alone comes first — a single
 * array, one decision, and a previous value to look back at.
 *
 * "Dynamic programming is just recursion with memoisation" is true and is the reason
 * 1-D comes first: the memo array *is* the 1-D table. Then the second topic adds the
 * dimension and asks a harder question — what are the columns? — which is the actual
 * skill at interview level.
 *
 * ## The three shape questions, stated once
 *
 * Every DP problem is one of: a count of ways, the best value, or a yes/no. Name
 * which one and the base cases fall out. Then, in order: what is a state, what is
 * the decision inside it, and what smaller states does it need. Write that sentence
 * before the code; every wrong DP solution is a solution to a *different* problem
 * that happens to share the input format.
 *
 * ## Weighted graphs last
 *
 * Dijkstra, MST, and Bellman-Ford are the same idea as the unweighted traversals
 * with one new ingredient — edge weights — and the new ingredient is what makes them
 * look like a different subject. They sit last because they are the natural
 * consequence of BFS, not a new data structure.
 */
export const ADVANCED: readonly Topic[] = [
  {
    id: 'dynamic-programming-1d',
    title: 'Dynamic programming I — 1-D states',
    blurb:
      'The first hard idea in the roadmap, and the one most beginners meet as a wall. It is really one idea: do not recompute the same subproblem. The state fits in a single array and each cell looks back a fixed distance.',
    phase: 'advanced',
    algoIds: ['fibonacci', 'lis', 'knapsack', 'coin-change'],
    learnSlugs: ['dynamic-programming', 'dp-state-shapes'],
    keyPoints: [
      'Name the state before writing code: `dp[i]` is the answer for *what exactly*? If the sentence does not end in a value, the state is wrong.',
      'Write the recurrence as an equation on paper first: `dp[i] = f(dp[i-1], dp[i-2], …)`. The code is a transcription of that sentence.',
      'A one-dimensional table is always a two-dimensional table with one dimension fixed. Naming it honestly is how you stop being surprised by it.',
      'If the subproblems do not overlap, memoisation is unnecessary and you probably want greedy instead. Overlap is the whole test.',
    ],
    questions: [
      {
        id: 'lc-climbing-stairs',
        title: 'Climbing Stairs',
        platform: 'leetcode',
        level: 'easy',
        url: 'https://leetcode.com/problems/climbing-stairs/',
      },
      {
        id: 'lc-min-cost-climbing-stairs',
        title: 'Min Cost Climbing Stairs',
        platform: 'leetcode',
        level: 'easy',
        url: 'https://leetcode.com/problems/min-cost-climbing-stairs/',
      },
      {
        id: 'hr-maxsubarray',
        title: 'The Maximum Subarray',
        platform: 'hackerrank',
        level: 'medium',
        url: 'https://www.hackerrank.com/challenges/maxsubarray/problem',
      },
      {
        id: 'lc-maximum-subarray',
        title: 'Maximum Subarray',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/maximum-subarray/',
      },
      {
        id: 'gfg-maximum-product-subarray',
        title: 'Maximum Product Subarray',
        platform: 'gfg',
        level: 'medium',
        url: 'https://www.geeksforgeeks.org/problems/maximum-product-subarray/1',
      },
      {
        id: 'lc-maximum-product-subarray',
        title: 'Maximum Product Subarray',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/maximum-product-subarray/',
      },
      {
        id: 'lc-house-robber',
        title: 'House Robber',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/house-robber/',
      },
      {
        id: 'lc-house-robber-ii',
        title: 'House Robber II',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/house-robber-ii/',
      },
      {
        id: 'lc-longest-increasing-subsequence',
        title: 'Longest Increasing Subsequence',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/longest-increasing-subsequence/',
      },
      {
        id: 'gfg-longest-increasing-subsequence',
        title: 'Longest Increasing Subsequence',
        platform: 'gfg',
        level: 'medium',
        url: 'https://www.geeksforgeeks.org/problems/longest-increasing-subsequence/1',
      },
      {
        id: 'cc-coins',
        title: 'COINS — Bytelandian gold coins',
        platform: 'codechef',
        level: 'easy',
        url: 'https://www.codechef.com/problems/COINS',
      },
      {
        id: 'lc-coin-change',
        title: 'Coin Change',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/coin-change/',
      },
      {
        id: 'gfg-coin-change',
        title: 'Coin Change (Count Ways)',
        platform: 'gfg',
        level: 'medium',
        url: 'https://www.geeksforgeeks.org/problems/coin-change/1',
      },
      {
        id: 'hr-coin-change',
        title: 'The Coin Change Problem',
        platform: 'hackerrank',
        level: 'medium',
        url: 'https://www.hackerrank.com/challenges/coin-change/problem',
      },
      {
        id: 'lc-coin-change-ii',
        title: 'Coin Change II',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/coin-change-ii/',
      },
      {
        id: 'hr-unbounded-knapsack',
        title: 'Knapsack',
        platform: 'hackerrank',
        level: 'medium',
        url: 'https://www.hackerrank.com/challenges/unbounded-knapsack/problem',
      },
      {
        id: 'lc-target-sum',
        title: 'Target Sum',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/target-sum/',
      },
      {
        id: 'cc-numgame',
        title: 'NUMGAME — Yet Another Number Game',
        platform: 'codechef',
        level: 'medium',
        url: 'https://www.codechef.com/problems/NUMGAME',
      },
      {
        id: 'he-samu-and-her-birthday-party',
        title: 'Samu and her Birthday Party',
        platform: 'hackerearth',
        level: 'medium',
        url: 'https://www.hackerearth.com/problem/algorithm/samu-and-her-birthday-party/',
      },
      {
        id: 'hr-wet-shark-and-two-subsequences',
        title: 'Wet Shark and Two Subsequences',
        platform: 'hackerrank',
        level: 'medium',
        url: 'https://www.hackerrank.com/challenges/wet-shark-and-two-subsequences/problem',
      },
      {
        id: 'lc-subsets-ii',
        title: 'Subsets II',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/subsets-ii/',
      },
      {
        id: 'lc-combination-sum-iii',
        title: 'Combination Sum III',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/combination-sum-iii/',
      },
      {
        id: 'lc-split-array-largest-sum',
        title: 'Split Array Largest Sum',
        platform: 'leetcode',
        level: 'hard',
        url: 'https://leetcode.com/problems/split-array-largest-sum/',
      },
      {
        id: 'ib-max-product-subarray',
        title: 'Max Product Subarray',
        platform: 'interviewbit',
        level: 'medium',
        url: 'https://www.interviewbit.com/problems/max-product-subarray/',
      },
    ],
  },

  {
    id: 'dynamic-programming-2d',
    title: 'Dynamic programming II — 2-D states and grids',
    blurb:
      'Now the state needs two dimensions. Grids, two sequences, and "up to k edits" all want a table, and the skill is knowing which two numbers are the axes.',
    phase: 'advanced',
    algoIds: ['lcs', 'edit-distance', 'rod-cutting'],
    learnSlugs: ['dynamic-programming', 'dp-state-shapes'],
    keyPoints: [
      'Two sequences or two prefixes in play? Make the axes the two prefixes. The grid problem becomes a rectangle of prefix pairs.',
      'The fill order is part of the definition: bottom-up needs every dependency already written, so fill rows top to bottom and columns left to right.',
      'Recursive with memoisation first, then the table. Doing it in that order is not baby steps — it is how you find the state before you commit to a layout.',
      'Edit-distance variants share one skeleton. Learn the insert/delete/replace recurrence properly and the others are substitutions.',
    ],
    questions: [
      {
        id: 'lc-unique-paths',
        title: 'Unique Paths',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/unique-paths/',
      },
      {
        id: 'lc-unique-paths-ii',
        title: 'Unique Paths II',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/unique-paths-ii/',
      },
      {
        id: 'hr-lucy-and-flowers',
        title: 'Lucy and Flowers',
        platform: 'hackerrank',
        level: 'medium',
        url: 'https://www.hackerrank.com/challenges/lucy-and-flowers/problem',
      },
      {
        id: 'lc-longest-common-subsequence',
        title: 'Longest Common Subsequence',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/longest-common-subsequence/',
      },
      {
        id: 'gfg-longest-common-subsequence',
        title: 'Longest Common Subsequence',
        platform: 'gfg',
        level: 'medium',
        url: 'https://www.geeksforgeeks.org/problems/longest-common-subsequence/1',
      },
      {
        id: 'hr-dynamic-programming-classics-the-longest-common-subsequence',
        title: 'The Longest Common Subsequence',
        platform: 'hackerrank',
        level: 'medium',
        url: 'https://www.hackerrank.com/challenges/dynamic-programming-classics-the-longest-common-subsequence/problem',
      },
      {
        id: 'lc-edit-distance',
        title: 'Edit Distance',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/edit-distance/',
      },
      {
        id: 'gfg-edit-distance',
        title: 'Edit Distance',
        platform: 'gfg',
        level: 'medium',
        url: 'https://www.geeksforgeeks.org/problems/edit-distance/1',
      },
      {
        id: 'lc-word-break',
        title: 'Word Break',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/word-break/',
      },
      {
        id: 'gfg-word-break-check',
        title: 'Word Break Check',
        platform: 'gfg',
        level: 'medium',
        url: 'https://www.geeksforgeeks.org/problems/word-break/1',
      },
      {
        id: 'lc-decode-ways',
        title: 'Decode Ways',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/decode-ways/',
      },
      {
        id: 'lc-distinct-subsequences',
        title: 'Distinct Subsequences',
        platform: 'leetcode',
        level: 'hard',
        url: 'https://leetcode.com/problems/distinct-subsequences/',
      },
      {
        id: 'lc-regular-expression-matching',
        title: 'Regular Expression Matching',
        platform: 'leetcode',
        level: 'hard',
        url: 'https://leetcode.com/problems/regular-expression-matching/',
      },
      {
        id: 'lc-wildcard-matching',
        title: 'Wildcard Matching',
        platform: 'leetcode',
        level: 'hard',
        url: 'https://leetcode.com/problems/wildcard-matching/',
      },
      {
        id: 'lc-interleaving-string',
        title: 'Interleaving String',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/interleaving-string/',
      },
      {
        id: 'lc-minimum-path-sum',
        title: 'Minimum Path Sum',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/minimum-path-sum/',
      },
      {
        id: 'lc-palindrome-partitioning',
        title: 'Palindrome Partitioning',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/palindrome-partitioning/',
      },
      {
        id: 'lc-palindrome-partitioning-ii',
        title: 'Palindrome Partitioning II',
        platform: 'leetcode',
        level: 'hard',
        url: 'https://leetcode.com/problems/palindrome-partitioning-ii/',
      },
      {
        id: 'hr-longest-palindromic-subsequence',
        title: 'Longest Palindromic Subsequence',
        platform: 'hackerrank',
        level: 'hard',
        url: 'https://www.hackerrank.com/challenges/longest-palindromic-subsequence/problem',
      },
      {
        id: 'hr-gridland-provinces',
        title: 'Gridland Provinces',
        platform: 'hackerrank',
        level: 'hard',
        url: 'https://www.hackerrank.com/challenges/gridland-provinces/problem',
      },
      {
        id: 'hr-gridland-metro',
        title: 'Gridland Metro',
        platform: 'hackerrank',
        level: 'medium',
        url: 'https://www.hackerrank.com/challenges/gridland-metro/problem',
      },
      {
        id: 'hr-sherlock-and-permutation',
        title: 'Sherlock and Permutations',
        platform: 'hackerrank',
        level: 'medium',
        url: 'https://www.hackerrank.com/challenges/sherlock-and-permutations/problem',
      },
      {
        id: 'lc-burst-balloons',
        title: 'Burst Balloons',
        platform: 'leetcode',
        level: 'hard',
        url: 'https://leetcode.com/problems/burst-balloons/',
      },
      {
        id: 'he-twin-towers',
        title: 'Twin Towers',
        platform: 'hackerearth',
        level: 'hard',
        url: 'https://www.hackerearth.com/problem/algorithm/twin-towers/',
      },
    ],
  },

  {
    id: 'shortest-paths-and-mst',
    title: 'Shortest paths and minimum spanning trees',
    blurb:
      'BFS with edge weights. One new ingredient turns the traversals you already know into the algorithms that finish the interview curriculum.',
    phase: 'advanced',
    algoIds: ['dijkstra', 'bellman-ford', 'a-star-search', 'kruskal', 'prims-mst'],
    learnSlugs: ['shortest-paths', 'minimum-spanning-trees'],
    keyPoints: [
      'Dijkstra requires non-negative weights. One negative edge and the "settled vertex" assumption it relies on stops holding — that is exactly the case Bellman-Ford covers.',
      'BFS is Dijkstra with all weights equal to 1. When you reach for Dijkstra on an unweighted graph, stop: BFS is faster and simpler.',
      'Kruskal sorts edges and uses union-find; Prim grows one tree from a single vertex. Same answer, different order.',
      'A Dijkstra implementation with a stale-entry check in the priority queue is the difference between correct and wrong on graphs with repeated edges.',
    ],
    questions: [
      {
        id: 'hr-bfsshortreach',
        title: 'Breadth First Search: Shortest Reach',
        platform: 'hackerrank',
        level: 'medium',
        url: 'https://www.hackerrank.com/challenges/bfsshortreach/problem',
      },
      {
        id: 'hr-dijkstrashortreach',
        title: 'Dijkstra: Shortest Reach 2',
        platform: 'hackerrank',
        level: 'hard',
        url: 'https://www.hackerrank.com/challenges/dijkstrashortreach/problem',
      },
      {
        id: 'hr-shortest-path',
        title: 'Find the Path',
        platform: 'hackerrank',
        level: 'hard',
        url: 'https://www.hackerrank.com/challenges/shortest-path/problem',
      },
      {
        id: 'he-monk-and-the-islands',
        title: 'Monk and the Islands',
        platform: 'hackerearth',
        level: 'easy',
        url: 'https://www.hackerearth.com/problem/algorithm/monk-and-the-islands/',
      },
      {
        id: 'lc-network-delay-time',
        title: 'Network Delay Time',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/network-delay-time/',
      },
      {
        id: 'lc-cheapest-flights-within-k-stops',
        title: 'Cheapest Flights Within K Stops',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/cheapest-flights-within-k-stops/',
      },
      {
        id: 'lc-word-ladder',
        title: 'Word Ladder',
        platform: 'leetcode',
        level: 'hard',
        url: 'https://leetcode.com/problems/word-ladder/',
      },
      {
        id: 'ib-word-ladder',
        title: 'Word Ladder',
        platform: 'interviewbit',
        level: 'medium',
        url: 'https://www.interviewbit.com/problems/word-ladder/',
      },
      {
        id: 'gfg-word-ladder',
        title: 'Shortest Transformation Length in a Word List',
        platform: 'gfg',
        level: 'medium',
        url: 'https://www.geeksforgeeks.org/problems/word-ladder/1',
      },
      {
        id: 'hr-red-knights-shortest-path',
        title: 'Red Knights Shortest Path',
        platform: 'hackerrank',
        level: 'medium',
        url: 'https://www.hackerrank.com/challenges/red-knights-shortest-path/problem',
      },
      {
        id: 'hr-road-network',
        title: 'Road Network',
        platform: 'hackerrank',
        level: 'hard',
        url: 'https://www.hackerrank.com/challenges/road-network/problem',
      },
      {
        id: 'hr-counting-road-networks',
        title: 'Counting Road Networks',
        platform: 'hackerrank',
        level: 'hard',
        url: 'https://www.hackerrank.com/challenges/counting-road-networks/problem',
      },
      {
        id: 'ib-knight-on-a-chessboard',
        title: 'Knight On a Chessboard',
        platform: 'interviewbit',
        level: 'medium',
        url: 'https://www.interviewbit.com/problems/knight-on-a-chessboard/',
      },
      {
        id: 'ib-snakes-and-ladders',
        title: 'Snakes and Ladders',
        platform: 'interviewbit',
        level: 'medium',
        url: 'https://www.interviewbit.com/problems/snakes-and-ladders/',
      },
      {
        id: 'ib-0-1-matrix',
        title: '0-1 Matrix',
        platform: 'interviewbit',
        level: 'medium',
        url: 'https://www.interviewbit.com/problems/0-1-matrix/',
      },
      {
        id: 'lc-redundant-connection',
        title: 'Redundant Connection',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/redundant-connection/',
      },
      {
        id: 'he-tom-and-jerry',
        title: 'Tom and Jerry',
        platform: 'hackerearth',
        level: 'medium',
        url: 'https://www.hackerearth.com/problem/algorithm/tom-and-jerry/',
      },
    ],
  },

  {
    id: 'topological-sort-and-union-find',
    title: 'Topological sort and union-find',
    blurb:
      'The last two structural tools. Topological sort answers "in what order can I do these?"; union-find answers "are these two things already connected?". Between them they finish most graph questions you will be asked.',
    phase: 'advanced',
    algoIds: ['topological-sort', 'kruskal', 'prims-mst'],
    learnSlugs: ['shortest-paths', 'minimum-spanning-trees'],
    keyPoints: [
      "Topological order only exists for a DAG. Before looking for one, check for a cycle — Kahn's algorithm and DFS both leave nodes out when there is one, and that is your detection.",
      'Union-find is amortised O(α(n)), which is "constant" in practice. Path compression plus union by rank is the whole implementation.',
      'The classic tell for union-find: "count the components", "is there a redundant edge", "can everyone reach everyone".',
      'Do not hand-roll either in an interview. Describe the idea, name the data structure, and say you would use the standard library version.',
    ],
    questions: [
      {
        id: 'lc-course-schedule',
        title: 'Course Schedule',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/course-schedule/',
      },
      {
        id: 'lc-course-schedule-ii',
        title: 'Course Schedule II',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/course-schedule-ii/',
      },
      {
        id: 'gfg-topological-sort',
        title: 'Topological Sort',
        platform: 'gfg',
        level: 'medium',
        url: 'https://www.geeksforgeeks.org/problems/topological-sort/1',
      },
      {
        id: 'lc-accounts-merge',
        title: 'Accounts Merge',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/accounts-merge/',
      },
      {
        id: 'lc-design-twitter',
        title: 'Design Twitter',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/design-twitter/',
      },
      {
        id: 'lc-course-schedule-iii',
        title: 'Course Schedule III',
        platform: 'leetcode',
        level: 'hard',
        url: 'https://leetcode.com/problems/course-schedule-iii/',
      },
      {
        id: 'lc-minimum-height-trees',
        title: 'Minimum Height Trees',
        platform: 'leetcode',
        level: 'medium',
        url: 'https://leetcode.com/problems/minimum-height-trees/',
      },
      {
        id: 'he-count-the-substrings',
        title: 'Count the Substrings',
        platform: 'hackerearth',
        level: 'hard',
        url: 'https://www.hackerearth.com/problem/algorithm/count-the-substrings/',
      },
      {
        id: 'he-a-game-of-words',
        title: 'A Game of Words',
        platform: 'hackerearth',
        level: 'hard',
        url: 'https://www.hackerearth.com/problem/algorithm/a-game-of-words/',
      },
    ],
  },
] as const;
