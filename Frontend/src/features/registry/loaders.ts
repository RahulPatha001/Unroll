import { CATALOG_BY_ID } from '../../core/algorithms/catalog.ts';
import type { AlgoDef } from '../../core/algorithms/types.ts';

/**
 * Lazy algorithm loading.
 *
 * The catalog gives the sidebar everything it needs with no code, so opening
 * the app does not pull in 50+ generators and 200+ source listings. Only the
 * algorithm a student actually selects gets imported.
 *
 * The glob is `eager: false` and every match becomes its own chunk, so opening
 * one algorithm downloads that algorithm and nothing else.
 */
const modules = import.meta.glob<{ default?: AlgoDef; [k: string]: unknown }>([
  '../../core/algorithms/**/*.ts',
  // The exclusion has to live *here*, not in an `if` below. `import.meta.glob`
  // emits a dynamic import for every match and the bundler resolves all of them
  // at build time, so a test file that survives into the graph fails the
  // production build on one of its own imports. Vite's negative-pattern form is
  // the supported way to exclude; the extglob `!(*.test).ts` is not portable
  // across Vite's glob backends and silently matched nothing when tried.
  '!**/*.test.ts',
]);

/** Files in that tree that are not algorithm modules. */
const NOT_ALGORITHMS = new Set(['index', 'types', 'catalog', 'registry']);

const byId = new Map<string, () => Promise<AlgoDef>>();
for (const [path, load] of Object.entries(modules)) {
  // .../algorithms/<family>/<name>.ts  ->  <name>
  const name = path.split('/').pop()?.replace(/\.ts$/, '') ?? '';
  if (!name || NOT_ALGORITHMS.has(name)) continue;
  byId.set(name, async () => {
    const mod = await load();
    const algo = (mod.default ?? mod) as AlgoDef;
    if (!algo?.id) throw new Error(`module ${path} has no default-exported AlgoDef`);
    return algo;
  });
}

/** Algorithm ids the app can load. Derived from the catalog so they cannot drift. */
export function loadableIds(): string[] {
  return Object.keys(CATALOG_BY_ID);
}

export function canLoad(id: string): boolean {
  return byId.has(id);
}

const cache = new Map<string, AlgoDef>();

export async function loadAlgorithm(id: string): Promise<AlgoDef> {
  const hit = cache.get(id);
  if (hit) return hit;
  const load = byId.get(id);
  if (!load) {
    throw new Error(
      `no lazy module for "${id}". Add src/core/algorithms/<family>/${id}.ts and list it in registry.ts.`,
    );
  }
  const algo = await load();
  cache.set(id, algo);
  return algo;
}

/** Preload without blocking; used to warm the next likely algorithm. */
export function prefetchAlgorithm(id: string): void {
  if (!cache.has(id) && byId.has(id)) void loadAlgorithm(id);
}
