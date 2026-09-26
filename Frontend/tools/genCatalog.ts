import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CatalogEntry } from '../src/core/algorithms/catalog-types.ts';
import { ALL_ALGORITHMS } from '../src/core/algorithms/registry.ts';
import { CATEGORIES } from '../src/core/algorithms/types.ts';

/**
 * Regenerate `src/core/algorithms/catalog.ts`.
 *
 * The catalog is a *static* file with no imports of the algorithm modules — that
 * is the whole point, since the sidebar renders from it and the browser must not
 * download 50 algorithms' generators and 200 source listings to draw a navigation
 * list. But a hand-maintained duplicate of six fields per algorithm is a
 * duplicate that will drift.
 *
 * So: generate it from the modules, and let `contract.test.ts` assert the two
 * still agree. A forgotten regeneration is then a failing test rather than a
 * stale sidebar.
 *
 * The header (imports, doc comment, trailing helpers) lives in
 * `catalog-header.txt` rather than inline here. An escaped multi-line string
 * constant in a source file is unreviewable in a diff; a text file is not.
 *
 * It writes the file itself, via a temp file and a rename, rather than printing to
 * stdout for the shell to redirect. That is not a style preference. The npm script
 * used to be `vite-node tools/genCatalog.ts > src/core/algorithms/catalog.ts`, and
 * the shell truncates the target *before* the process starts — so if the generator
 * threw, it left a zero-byte catalog checked in and the next `tsc` failed with a
 * baffling "does not provide an export named DEFAULT_ALGORITHM_ID". It did exactly
 * that. A generator that can destroy its own input needs to write atomically.
 *
 * Run with `npm run gen:catalog`.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Search terms, which are *not* generated.
 *
 * These are the words a student would actually type — "divide and conquer",
 * "nlogn", "tortoise and hare", "in place" — and no amount of reading a module
 * tells you them. The algorithm's own `traits.tags` are generated from the
 * module; this map is the human layer on top.
 */
const EXTRA: Record<string, { aka?: string[]; tags?: string[] }> = {
  'bubble-sort': { aka: ['sinking sort', 'exchange sort'] },
  'counting-sort': {
    aka: ['frequency sort', 'non comparison sort', 'prefix sums', 'linear time sort'],
  },
  'radix-sort': {
    aka: ['lsd', 'least significant digit', 'non comparison sort', 'stable sort by digit'],
  },
  'selection-sort': { aka: ['sel sort'] },
  'insertion-sort': { aka: ['insort', 'online sort'] },
  'shell-sort': { aka: ['shellsort', 'gap sort', 'diminishing increments'] },
  'merge-sort': { aka: ['mergesort', 'divide and conquer', 'stable sort'] },
  'quick-sort': { aka: ['quicksort', 'divide and conquer', 'partition'] },
  'heap-sort': { aka: ['heapsort', 'in place', 'worst case O(nlogn)'] },
  'linear-search': { aka: ['sequential search', 'brute force'] },
  'binary-search': { aka: ['binsearch', 'halving', 'logarithmic'] },
  'lower-bound': { aka: ['bisect', 'first index at least', 'partition point'] },
  'jump-search': { aka: ['block search', 'sqrt decomposition'] },
  'exponential-search': { aka: ['doubling search', 'galloping'] },
  'search-rotated': { aka: ['rotated sorted', 'unknown pivot'] },
  'pair-sum': { aka: ['two sum', 'sorted two pointers'] },
  'container-most-water': { aka: ['max area', 'two pointers'] },
  'trapping-rain-water': {
    aka: ['rain water', 'water trapping', 'two pointers', 'max left max right'],
  },
  'dutch-national-flag': {
    aka: ['sort colors', 'sort colours', 'three way partition', '3 way partition', 'one pass'],
  },
  'valid-palindrome': { aka: ['palindrome', 'in place'] },
  'next-greater-element': {
    aka: ['next greater', 'next larger element', 'monotonic stack', 'stack'],
  },
  'largest-rectangle': {
    aka: ['largest rectangle in histogram', 'histogram', 'maximal rectangle', 'monotonic stack'],
  },
  'longest-substring': { aka: ['longest substring without repeating', 'sliding window'] },
  kadane: { aka: ['max subarray', 'prefix minimum'] },
  'min-window-substring': { aka: ['smallest window', 'sliding window'] },
  'longest-repeating-replacement': { aka: ['character replacement', 'sliding window'] },
  'jump-game-2': { aka: ['jump game', 'greedy', 'fewest jumps'] },
  'gas-station': { aka: ['gas', 'greedy', 'circular'] },
  'activity-selection': { aka: ['interval scheduling', 'greedy', 'earliest finish'] },
  'reverse-list': { aka: ['linked list reversal', 'pointer rewiring'] },
  'detect-cycle': { aka: ['floyd', 'tortoise and hare', 'linked list cycle'] },
  'merge-two-sorted': { aka: ['merge lists', 'linked list'] },
  'balanced-brackets': { aka: ['valid parentheses', 'stack'] },
  'min-stack': { aka: ['stack with min', 'auxiliary stack'] },
  'valid-postfix': { aka: ['postfix', 'rpn', 'stack'] },
  'sliding-window-max': { aka: ['monotonic deque', 'sliding window maximum'] },
  'hash-table': { aka: ['separate chaining', 'rehash', 'load factor'] },
  'top-k-frequent': {
    aka: ['top k', 'k most frequent', 'frequency map', 'tie break', 'bucket sort'],
  },
  'two-sum-hash': { aka: ['two sum', 'hash map'] },
  'bst-insert': { aka: ['binary search tree', 'insert'] },
  'bst-search': { aka: ['binary search tree', 'find'] },
  'bst-delete': { aka: ['binary search tree', 'remove', 'successor'] },
  'inorder-traversal': { aka: ['in order', 'recursion', 'sorted output'] },
  'avl-rotate': { aka: ['avl', 'self balancing', 'rotate', 'rebalance'] },
  'tree-height': { aka: ['post order', 'balanced check', 'depth'] },
  'build-heap': { aka: ['heapify', 'bottom up', 'heap'] },
  heapsort: { aka: ['heap sort', 'priority queue', 'in place'] },
  trie: { aka: ['prefix tree', 'radix', 'insert', 'prefix search'] },
  fibonacci: { aka: ['fib', 'memoisation', 'tabulation', 'naive recursion'] },
  knapsack: { aka: ['0/1 knapsack', 'dp', 'value per weight'] },
  lcs: { aka: ['longest common subsequence', 'dp', 'string'] },
  'coin-change': { aka: ['minimum coins', 'dp', 'unbounded'] },
  lis: { aka: ['longest increasing subsequence', 'dp', 'tails'] },
  'edit-distance': { aka: ['levenshtein', 'dp', 'distance'] },
  'rod-cutting': { aka: ['rod cut', 'dp', 'unbounded'] },
  bfs: { aka: ['breadth first', 'queue', 'shortest path unweighted', 'level order'] },
  dfs: { aka: ['depth first', 'stack', 'backtracking'] },
  dijkstra: { aka: ['shortest path', 'priority queue', 'greedy', 'non negative'] },
  'bellman-ford': { aka: ['shortest path', 'negative weights', 'relaxation'] },
  'topological-sort': { aka: ['toposort', 'kahn', 'dag', 'in degrees'] },
  kruskal: { aka: ['mst', 'minimum spanning tree', 'union find', 'disjoint set'] },
  'prims-mst': { aka: ['prim', 'minimum spanning tree', 'mst', 'grow a tree'] },
  'a-star-search': { aka: ['a star', 'astar', 'a*', 'heuristic', 'informed search', 'admissible'] },
  'number-of-islands': {
    aka: ['islands', 'connected components', 'grid dfs', 'four connected', 'eight connected'],
  },
  'flood-fill': { aka: ['floodfill', 'four connected', 'region fill'] },
  'tower-of-hanoi': { aka: ['hanoi', 'recursion', 'call stack'] },
};

const q = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const order = new Map(CATEGORIES.map((c, i) => [c.id, i]));

const entries: CatalogEntry[] = [...ALL_ALGORITHMS]
  .sort((a, b) => {
    const c = (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99);
    return c !== 0 ? c : a.title.localeCompare(b.title);
  })
  .map((a) => {
    const extra = EXTRA[a.id] ?? {};
    return {
      id: a.id,
      title: a.title,
      category: a.category,
      summary: a.summary,
      viewport: a.viewport,
      level: a.level,
      tags: [...new Set([...(a.traits.tags ?? []), ...(extra.tags ?? [])])],
      ...(extra.aka ? { aka: extra.aka } : {}),
    };
  });

const body = entries
  .map(
    (e) => `  {
    id: ${q(e.id)},
    title: ${q(e.title)},
    category: ${q(e.category)},
    summary: ${q(e.summary)},
    viewport: ${q(e.viewport)},
    level: ${q(e.level)},
    tags: [${e.tags.map(q).join(', ')}],${e.aka ? `\n    aka: [${e.aka.map(q).join(', ')}],` : ''}
  },`,
  )
  .join('\n');

/**
 * The closing half of the generated file. Kept here rather than in the header
 * file so both halves are reviewable as source rather than one of them being an
 * escaped blob.
 */
const POSTLUDE = `];

export const CATALOG_BY_ID: Record<string, CatalogEntry> = Object.fromEntries(
  CATALOG.map((e) => [e.id, e]),
);

export function catalogInCategory(category: Category): CatalogEntry[] {
  return CATALOG.filter((e) => e.category === category);
}

export const CATEGORY_ORDER: Category[] = CATEGORIES.map((c) => c.id);

/**
 * What the app opens on.
 *
 * Generated rather than hand-written, and derived from \`CATALOG[0]\` so it cannot
 * drift from what exists. It lives here rather than in \`registry.ts\`, and that
 * placement is load-bearing: \`registry.ts\` statically imports *every* algorithm
 * module, so importing anything from it — even a string constant — drags every
 * generator and all four source listings per algorithm into the initial bundle.
 * That one import took the payload from 60 kB to 371 kB gzip, and nothing about
 * it looked wrong in review.
 *
 * \`catalog.ts\` is pure data, so anything derived from it is free.
 */
export const DEFAULT_ALGORITHM_ID = CATALOG[0]?.id ?? 'bubble-sort';

export const CATEGORY_BLURB: Record<Category, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.blurb]),
) as Record<Category, string>;

/**
 * Case-insensitive search across title, summary, tags and alternate names.
 *
 * Every whitespace-separated term must match somewhere, so "stable in place"
 * narrows rather than widening. Plain \`includes\` rather than a token index: the
 * catalog is a few dozen entries and a student types three characters, not
 * three hundred.
 */
export function searchCatalog(query: string): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return CATALOG;
  const terms = q.split(/\\s+/);
  return CATALOG.filter((e) => {
    const haystack = [e.title, e.summary, ...e.tags, ...(e.aka ?? []), e.category]
      .join(' ')
      .toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
}
`;

const header = readFileSync(join(HERE, 'catalog-header.txt'), 'utf8');
const out = `${header}${body}\n${POSTLUDE}`;

const TARGET = join(HERE, '..', 'src', 'core', 'algorithms', 'catalog.ts');
const TEMP = `${TARGET}.tmp`;

// Write then rename. A reader either sees the whole old file or the whole new one,
// and a crash mid-write leaves the previous catalog intact.
writeFileSync(TEMP, out, 'utf8');
renameSync(TEMP, TARGET);

console.error(`gen:catalog — ${entries.length} algorithms across ${CATEGORIES.length} categories`);
