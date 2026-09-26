import { coinChangeAlgo } from './dynamic-programming/coin-change.ts';
import { editDistanceAlgo } from './dynamic-programming/edit-distance.ts';
import { fibonacciAlgo } from './dynamic-programming/fibonacci.ts';
import { knapsackAlgo } from './dynamic-programming/knapsack.ts';
import { lcsAlgo } from './dynamic-programming/lcs.ts';
import { lisAlgo } from './dynamic-programming/lis.ts';
import { rodCuttingAlgo } from './dynamic-programming/rod-cutting.ts';
import { aStarSearchAlgo } from './graphs/a-star-search.ts';
import { bellmanFordAlgo } from './graphs/bellman-ford.ts';
import { bfsAlgo } from './graphs/bfs.ts';
import { dfsAlgo } from './graphs/dfs.ts';
import { dijkstraAlgo } from './graphs/dijkstra.ts';
import { floodFillAlgo } from './graphs/flood-fill.ts';
import { kruskalAlgo } from './graphs/kruskal.ts';
import { numberOfIslandsAlgo } from './graphs/number-of-islands.ts';
import { primsMstAlgo } from './graphs/prims-mst.ts';
import { topologicalSortAlgo } from './graphs/topological-sort.ts';
import { activitySelectionAlgo } from './greedy/activity-selection.ts';
import { gasStationAlgo } from './greedy/gas-station.ts';
import { jumpGame2Algo } from './greedy/jump-game-2.ts';
import { hashTableAlgo } from './hashing/hash-table.ts';
import { topKFrequentAlgo } from './hashing/top-k-frequent.ts';
import { twoSumHashAlgo } from './hashing/two-sum-hash.ts';
import { buildHeapAlgo } from './heaps/build-heap.ts';
import { heapSortExtractAlgo } from './heaps/heapsort.ts';
import { detectCycleAlgo } from './linked-lists/detect-cycle.ts';
import { mergeTwoSortedAlgo } from './linked-lists/merge-two-sorted.ts';
import { reverseListAlgo } from './linked-lists/reverse-list.ts';
import { towerOfHanoiAlgo } from './recursion/tower-of-hanoi.ts';
import { binarySearchAlgo } from './searching/binary-search.ts';
import { exponentialSearchAlgo } from './searching/exponential-search.ts';
import { jumpSearchAlgo } from './searching/jump-search.ts';
import { linearSearchAlgo } from './searching/linear-search.ts';
import { lowerBoundAlgo } from './searching/lower-bound.ts';
import { searchRotatedAlgo } from './searching/search-rotated.ts';
import { kadaneAlgo } from './sliding-window/kadane.ts';
import { longestRepeatingReplacementAlgo } from './sliding-window/longest-repeating-replacement.ts';
import { longestSubstringAlgo } from './sliding-window/longest-substring.ts';
import { minWindowSubstringAlgo } from './sliding-window/min-window-substring.ts';
import { bubbleSortAlgo } from './sorting/bubble-sort.ts';
import { countingSortAlgo } from './sorting/counting-sort.ts';
import { heapSortAlgo } from './sorting/heap-sort.ts';
import { insertionSortAlgo } from './sorting/insertion-sort.ts';
import { mergeSortAlgo } from './sorting/merge-sort.ts';
import { quickSortAlgo } from './sorting/quick-sort.ts';
import { radixSortAlgo } from './sorting/radix-sort.ts';
import { selectionSortAlgo } from './sorting/selection-sort.ts';
import { shellSortAlgo } from './sorting/shell-sort.ts';
import { balancedBracketsAlgo } from './stacks-queues/balanced-brackets.ts';
import { largestRectangleAlgo } from './stacks-queues/largest-rectangle.ts';
import { minStackAlgo } from './stacks-queues/min-stack.ts';
import { nextGreaterElementAlgo } from './stacks-queues/next-greater-element.ts';
import { slidingWindowMaxAlgo } from './stacks-queues/sliding-window-max.ts';
import { validPostfixAlgo } from './stacks-queues/valid-postfix.ts';
import { avlRotateAlgo } from './trees/avl-rotate.ts';
import { bstDeleteAlgo } from './trees/bst-delete.ts';
import { bstInsertAlgo } from './trees/bst-insert.ts';
import { bstSearchAlgo } from './trees/bst-search.ts';
import { inorderTraversalAlgo } from './trees/inorder-traversal.ts';
import { treeHeightAlgo } from './trees/tree-height.ts';
import { trieAlgo } from './tries/trie.ts';
import { containerMostWaterAlgo } from './two-pointers/container-most-water.ts';
import { dutchNationalFlagAlgo } from './two-pointers/dutch-national-flag.ts';
import { pairSumAlgo } from './two-pointers/pair-sum.ts';
import { trappingRainWaterAlgo } from './two-pointers/trapping-rain-water.ts';
import { validPalindromeAlgo } from './two-pointers/valid-palindrome.ts';
import type { AlgoDef } from './types.ts';
import { CATEGORIES, type Category } from './types.ts';

/**
 * The flat list of every algorithm in the app.
 *
 * Explicit imports rather than glob-based auto-discovery, on purpose. This file
 * is only ever loaded by Node — the test suite, the verification harness, and
 * `tools/genCatalog.ts` — so eager loading costs nothing, and a hand-maintained
 * list means adding an algorithm is a *visible* one-line diff rather than a
 * directory scan that silently picks up a half-written file.
 *
 * The browser never loads this. It reads `catalog.ts` (pure metadata, no code
 * and no lesson strings) for the sidebar, then dynamically imports the single
 * module the student selected.
 */
export const ALL_ALGORITHMS: AlgoDef[] = [
  coinChangeAlgo,
  editDistanceAlgo,
  lisAlgo,
  rodCuttingAlgo,
  balancedBracketsAlgo,
  minStackAlgo,
  slidingWindowMaxAlgo,
  validPostfixAlgo,
  nextGreaterElementAlgo,
  largestRectangleAlgo,
  hashTableAlgo,
  twoSumHashAlgo,
  topKFrequentAlgo,
  bstDeleteAlgo,
  bstInsertAlgo,
  bstSearchAlgo,
  inorderTraversalAlgo,
  avlRotateAlgo,
  treeHeightAlgo,
  buildHeapAlgo,
  heapSortExtractAlgo,
  trieAlgo,
  bellmanFordAlgo,
  dfsAlgo,
  dijkstraAlgo,
  floodFillAlgo,
  kruskalAlgo,
  topologicalSortAlgo,
  // sorting
  bubbleSortAlgo,
  countingSortAlgo,
  radixSortAlgo,
  selectionSortAlgo,
  insertionSortAlgo,
  shellSortAlgo,
  mergeSortAlgo,
  quickSortAlgo,
  heapSortAlgo,
  // searching
  linearSearchAlgo,
  binarySearchAlgo,
  lowerBoundAlgo,
  jumpSearchAlgo,
  exponentialSearchAlgo,
  searchRotatedAlgo,
  // two-pointers
  pairSumAlgo,
  trappingRainWaterAlgo,
  dutchNationalFlagAlgo,
  containerMostWaterAlgo,
  validPalindromeAlgo,
  // sliding-window
  longestSubstringAlgo,
  kadaneAlgo,
  minWindowSubstringAlgo,
  longestRepeatingReplacementAlgo,
  // greedy
  jumpGame2Algo,
  gasStationAlgo,
  activitySelectionAlgo,
  // recursion
  towerOfHanoiAlgo,
  // dynamic-programming
  fibonacciAlgo,
  knapsackAlgo,
  lcsAlgo,
  // linked-lists
  reverseListAlgo,
  detectCycleAlgo,
  mergeTwoSortedAlgo,
  // graphs
  bfsAlgo,
  aStarSearchAlgo,
  primsMstAlgo,
  numberOfIslandsAlgo,
];

const byId = new Map(ALL_ALGORITHMS.map((a) => [a.id, a]));

export function getAlgorithm(id: string): AlgoDef | undefined {
  return byId.get(id);
}

export function requireAlgorithm(id: string): AlgoDef {
  const algo = byId.get(id);
  if (!algo) throw new Error(`unknown algorithm id: ${id}`);
  return algo;
}

export function algorithmsIn(category: Category): AlgoDef[] {
  return ALL_ALGORITHMS.filter((a) => a.category === category);
}

/** Grouped, in the curriculum order declared by CATEGORIES. */
export function groupedAlgorithms(): Array<{
  category: Category;
  label: string;
  blurb: string;
  items: AlgoDef[];
}> {
  return CATEGORIES.map((c) => ({
    category: c.id,
    label: c.label,
    blurb: c.blurb,
    items: algorithmsIn(c.id),
  })).filter((g) => g.items.length > 0);
}
