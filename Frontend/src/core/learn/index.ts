import { COMPLEXITY } from './articles/complexity.ts';
import { BINARY_SEARCH, HASH_TABLES, STRINGS_AS_KEYS } from './articles/foundations.ts';
import { BFS_AND_DFS, MIN_SPANNING_TREE, SHORTEST_PATHS } from './articles/graphs.ts';
import { DP_SHAPES, GREEDY } from './articles/greedy.ts';
import { HEAPS } from './articles/heaps.ts';
import { POINTER_PROBLEMS } from './articles/linked-lists.ts';
import { BUBBLE_SORT, SORTING_LANDSCAPE } from './articles/sorting.ts';
import { MONOTONIC_STACK } from './articles/stacks.ts';
import {
  DIVIDE_AND_CONQUER,
  DYNAMIC_PROGRAMMING,
  RECURSION_IS_A_STACK,
  TWO_POINTERS,
} from './articles/techniques.ts';
import { BINARY_SEARCH_TREES } from './articles/trees.ts';
import type { Article } from './types.ts';

export type { Article, Block } from './types.ts';

/**
 * The article registry.
 *
 * ## Pure data, on purpose
 *
 * This module and everything under `articles/` are plain TypeScript with no React
 * and no DOM, which is what keeps them inside `core/`'s boundary — see
 * `boundary.test.ts`, which forbids a `react` import anywhere below `src/core`.
 * The *renderer* is a separate module under `src/features/learn/`.
 *
 * That split is not pedantry. It buys two concrete things:
 *
 *  - **The articles are testable in plain Node.** `learn.test.ts` walks every
 *    article and asserts its `algoId` names a real algorithm, that its `stepper`
 *    blocks point at real presets, and that its slugs are unique and URL-safe.
 *    Those are the checks that keep a link from silently rotting, and they would
 *    need a DOM and a React renderer to run otherwise.
 *  - **The renderer stays boring.** It maps blocks to elements and has no
 *    knowledge of any particular article's content.
 *
 * ## Import cost
 *
 * Every article is in this one module, so all of them are in the chunk that
 * contains this registry. That is deliberate and it is small: the articles are
 * prose, and the *embedded steppers* — which do pull in an algorithm module — are
 * the expensive part, and those are dynamically imported per `stepper` block by
 * `EmbeddedStepper`. So the blog costs a few kilobytes of text up front and
 * nothing per algorithm until a stepper on screen actually needs one.
 *
 * The alternative, one dynamic import per article, would mean a second round trip
 * before a single word renders on `/learn/quick-sort-vs-merge-sort`. Trading a
 * few kB of prose for a guaranteed paint is the right way round.
 */

/**
 * Every article, in the order they should be listed.
 *
 * Hand-ordered rather than sorted, for the same reason `catalog.ts` is: this is
 * curriculum order, not alphabetical. Someone opening the Learn tab should meet
 * bubble sort before the sorting landscape, and the techniques articles before
 * the ones that use them.
 */
/**
 * Every article, in the order they should be listed.
 *
 * Hand-ordered rather than sorted, for the same reason `catalog.ts` is: this is
 * curriculum order, not alphabetical. Someone opening the Learn tab should meet
 * bubble sort before the sorting landscape, and the techniques articles before
 * the ones that use them.
 *
 * ## The shape of the order
 *
 * Reading top to bottom is roughly a course:
 *
 *  1. **Sorting**, because it is the first place the cost of an algorithm becomes
 *     visible — bubble sort is `O(n²)` in a way you can actually see.
 *  2. **The general techniques**, because most of what follows is an instance of one
 *     of them: two pointers, recursion as a stack, divide and conquer, dynamic
 *     programming, greedy.
 *  3. **The data-structure-adjacent algorithms**: binary search, hash tables, tries.
 *  4. **The families that had no article at all**: stacks, linked lists, heaps,
 *     trees, and the three graph articles.
 *
 * The cross-references do the rest of the work. `reading-big-o` is deliberately
 * filed with the concepts it explains rather than in front of them: it is the one
 * article here that assumes the reader already has something specific to be confused
 * about, and opening with it would answer questions nobody has asked yet.
 */
export const ARTICLE_LIST: readonly Article[] = [
  BUBBLE_SORT,
  SORTING_LANDSCAPE,
  TWO_POINTERS,
  RECURSION_IS_A_STACK,
  DIVIDE_AND_CONQUER,
  DYNAMIC_PROGRAMMING,
  DP_SHAPES,
  GREEDY,
  COMPLEXITY,
  BINARY_SEARCH,
  HASH_TABLES,
  STRINGS_AS_KEYS,
  MONOTONIC_STACK,
  POINTER_PROBLEMS,
  HEAPS,
  BINARY_SEARCH_TREES,
  BFS_AND_DFS,
  SHORTEST_PATHS,
  MIN_SPANNING_TREE,
] as const;

const BY_SLUG: Record<string, Article> = Object.fromEntries(ARTICLE_LIST.map((a) => [a.slug, a]));

/** Look up one article. `undefined` for an unknown slug — the page 404s on it. */
export function getArticle(slug: string): Article | undefined {
  return BY_SLUG[slug];
}

/**
 * Whether an article embeds a live visualisation.
 *
 * ## Not the same question as "does it have an `algoId`"
 *
 * `algoId` means "this article is about exactly one algorithm, so give the reader a
 * button into the full visualiser". A `stepper` block means "there is something here
 * to step through". They only sometimes agree: `sorting-landscape` has three
 * steppers and no `algoId`, because it is about eight sorts and no single one of them
 * is the subject.
 *
 * The index used to badge cards with `algoId`, labelled "has a stepper" — so it
 * claimed the opposite of the truth for the technique articles, and stayed silent
 * about the ones that do have steppers. With the section this size, a badge that
 * means the wrong thing is worse than no badge.
 */
export function articleHasStepper(article: Article): boolean {
  return article.body.some((b) => b.kind === 'stepper');
}

/**
 * Articles grouped for the index, preserving `ARTICLE_LIST` order within a group.
 *
 * A `Map` keyed by category, emitted in first-appearance order, so adding an
 * article to a new category puts that category where the author put it rather
 * than at the end of an alphabetical list.
 */
export function articlesByCategory(): Array<{ category: Article['category']; items: Article[] }> {
  const groups = new Map<Article['category'], Article[]>();
  for (const a of ARTICLE_LIST) {
    const list = groups.get(a.category) ?? [];
    list.push(a);
    groups.set(a.category, list);
  }
  return [...groups].map(([category, items]) => ({ category, items }));
}

/** The human label for an article category. */
export const ARTICLE_CATEGORY_LABEL: Record<Article['category'], string> = {
  sorting: 'Sorting',
  searching: 'Searching',
  'two-pointers': 'Two Pointers',
  'sliding-window': 'Sliding Window',
  greedy: 'Greedy',
  'dynamic-programming': 'Dynamic Programming',
  'linked-lists': 'Linked Lists',
  'stacks-queues': 'Stacks & Queues',
  hashing: 'Hashing',
  trees: 'Trees',
  heaps: 'Heaps',
  tries: 'Tries',
  graphs: 'Graphs',
  recursion: 'Recursion',
  concepts: 'Concepts',
};
