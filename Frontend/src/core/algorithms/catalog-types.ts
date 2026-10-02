import type { Frame } from '../trace/types.ts';
import type { Category, Complexity } from './types.ts';

/**
 * The shape of a catalog entry.
 *
 * In its own file so `catalog.ts` can be *generated* while still being typed: a
 * generated file cannot import a type from itself, and duplicating the interface
 * inside the generated output would mean the generator and the artifact could
 * disagree silently. This is a type-only module, so it costs nothing at runtime
 * and nothing in the bundle.
 */
export interface CatalogEntry {
  id: string;
  title: string;
  category: Category;
  /** One line, shown in search results and as a tooltip. */
  summary: string;
  viewport: Frame['kind'];
  level: 'intro' | 'intermediate' | 'advanced';
  /**
   * The cost, carried here so a page that has not loaded the algorithm can show it.
   *
   * This is the same object the module declares, duplicated into the generated
   * file — the deal `genCatalog.ts` exists to keep honest, and `contract.test.ts`
   * asserts the two agree. Before it existed, the browse grid had to choose
   * between showing no complexity at all or loading all 66 algorithm modules to
   * read it, and the second option is precisely what the lazy-loading boundary
   * forbids. So the numbers are duplicated rather than the curriculum.
   *
   * Roughly 30 characters per algorithm, which is about 2 kB across the catalog —
   * against a 200 kB budget, and against 371 kB for the mistake of importing
   * `registry.ts` instead.
   */
  complexity: Complexity;
  /** Free-text search tags: "stable", "divide and conquer", "in place", ... */
  tags: string[];
  /** Names students might actually type: "quicksort", "floyd", "nlogn". */
  aka?: string[];
}
