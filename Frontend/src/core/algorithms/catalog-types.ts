import type { Frame } from '../trace/types.ts';
import type { Category } from './types.ts';

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
  /** Free-text search tags: "stable", "divide and conquer", "in place", ... */
  tags: string[];
  /** Names students might actually type: "quicksort", "floyd", "nlogn". */
  aka?: string[];
}
