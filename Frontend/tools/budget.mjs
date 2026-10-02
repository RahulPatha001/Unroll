#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

/**
 * Bundle budget.
 *
 * A hand-rolled check rather than a dependency. The rule being enforced is one
 * sentence long, and a 40-line script that prints a table is easier to reason
 * about than a config file for a plugin that would do the same job.
 *
 * The number that matters is the **initial** payload: what a student downloads
 * before the code panel opens. Everything else is lazy by design — Shiki and the
 * per-algorithm chunks load on demand — so counting them would be measuring the
 * wrong thing and would fail every time a new algorithm is added.
 *
 * ## How "initial" is decided, and why it used to be wrong
 *
 * The first version of this classified a file as initial if its name matched
 * `/^index-.*\.(js|css)$/` or `/^[a-z-]+\.(js|css)$/`. Both patterns are wrong,
 * and the second one is wrong in the dangerous direction.
 *
 * Vite and rolldown hash every emitted filename. So a chunk called `react.js` is
 * actually emitted as `react-BhrwgiWi.js`, the regex does not match, and **React
 * was never counted**. It was 78.6 kB gzip — the single largest thing a visitor
 * downloads — and the gate reported a total that excluded it. The same went for
 * every other statically-imported chunk: the build emitted `catalog-*.js` at
 * 16.4 kB gzip, statically imported by the entry, also uncounted.
 *
 * That is the worst class of budget bug. The gate was green, the number looked
 * plausible, and the real first load was roughly 95 kB larger than reported — close
 * enough to the ceiling that the difference was the difference between passing and
 * failing. A safety net that does not measure the thing it names is worse than no
 * safety net, because it is trusted.
 *
 * So "initial" is now computed the only way it can be computed honestly: **walk the
 * static import graph from the entry chunk and sum everything reachable without a
 * `dynamic import()`.** A regex cannot do this, because whether a chunk is initial
 * is a property of the graph, not of its name.
 */
const DIST = 'dist/assets';
const BUDGET_KB = 200; // plan §7: 200KB gzip for the initial bundle

if (!statSync('dist/assets').isDirectory()) {
  console.error('no dist/assets — run `npm run build` before this script');
  process.exit(1);
}

const files = readdirSync(DIST);

/**
 * Static imports only.
 *
 * Two details, and both were wrong in the first attempt.
 *
 * **The space before `from` is optional.** Minified output is `import{r as
 * e}from"./a.js"` — no space at all. A pattern written as `\sfrom` matches
 * nothing in a minified bundle, which is exactly what happened: the walk found
 * zero imports, every chunk was classified lazy, and the guard at the bottom of
 * this file caught it. Hence `from\s*`.
 *
 * **The specifier body excludes `(` and `)`**, which is what separates
 * `import{x}from"./a.js"` (static — follow it) from `import("./a.js")` (dynamic —
 * do not). Without that exclusion the pattern matches a dynamic import's argument
 * and walks the entire lazy curriculum into the initial total.
 *
 * Specifiers are required to start with `./`, which also skips `__vite__mapDeps`'s
 * `"assets/…"` string table — that is the dynamic-import manifest, and following it
 * would count every algorithm as up-front.
 */
const STATIC_IMPORT = /(?:^|[;}\s])(?:import|export)\s*(?:[^"'()]*?from\s*)?["'](\.[^"']+)["']/g;

/** The entry chunk Vite emits, which is `index.html`'s module script. */
const ENTRY_RE = /^index-[\w-]+\.js$/;

/** CSS the HTML actually links. A `<link>` in the document is initial by definition. */
function cssFromHtml() {
  const html = readFileSync('dist/index.html', 'utf8');
  const out = [];
  for (const m of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\/assets\/([^"]+\.css)"/g)) {
    out.push(m[1]);
  }
  return out;
}

const rows = [];
for (const name of files) {
  const path = join(DIST, name);
  if (!statSync(path).isFile()) continue;
  if (!/\.(js|css)$/.test(name)) continue;
  const raw = readFileSync(path);
  rows.push({
    name,
    raw: raw.length,
    gzip: gzipSync(raw, { level: 9 }).length,
    initial: false,
  });
}

const byName = new Map(rows.map((r) => [r.name, r]));

/**
 * Breadth-first walk of the static graph from the entry.
 *
 * A `Set` rather than an array of visited names, and the membership test happens
 * *before* the read, because the graph is not a tree: two chunks commonly import
 * the same shared chunk, and without the guard a diamond would be counted twice.
 * That is not a hypothetical — `types-*.js` is imported by several chunks here.
 */
const entry = rows.find((r) => ENTRY_RE.test(r.name));
if (!entry) {
  console.error(
    `no entry chunk matching ${ENTRY_RE} in dist/assets — is the build shaped as expected?`,
  );
  process.exit(1);
}

const queue = [entry.name];
const initialNames = new Set();
while (queue.length > 0) {
  const name = queue.pop();
  if (initialNames.has(name)) continue;
  const row = byName.get(name);
  if (!row) continue; // an import we cannot see on disk; not ours to count
  initialNames.add(name);
  row.initial = true;
  if (!name.endsWith('.js')) continue;
  const src = readFileSync(join(DIST, name), 'utf8');
  STATIC_IMPORT.lastIndex = 0;
  let m = STATIC_IMPORT.exec(src);
  while (m) {
    const spec = m[1];
    if (spec) {
      // Specifiers are emitted as `./name-hash.js` relative to the assets dir.
      const resolved = spec.replace(/^\.\//, '').split('?')[0];
      if (byName.has(resolved)) queue.push(resolved);
    }
    m = STATIC_IMPORT.exec(src);
  }
}

// CSS from <link> tags counts even though no JS chunk imports it.
for (const css of cssFromHtml()) {
  const row = byName.get(css);
  if (row) {
    row.initial = true;
    initialNames.add(css);
  }
}

rows.sort((a, b) => b.gzip - a.gzip);

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
const pad = (s, n) => String(s).padEnd(n);

console.log('');
console.log(pad('asset', 46), pad('raw', 11), pad('gzip', 11), 'load');
console.log('-'.repeat(82));
for (const r of rows.slice(0, 18)) {
  console.log(
    pad(r.name.slice(0, 44), 46),
    pad(kb(r.raw), 11),
    pad(kb(r.gzip), 11),
    r.initial ? 'initial' : 'lazy',
  );
}

const initial = rows.filter((r) => r.initial);
const total = initial.reduce((n, r) => n + r.gzip, 0);

console.log('');
console.log(`initial payload: ${kb(total)} gzip across ${initial.length} file(s)`);
for (const r of initial) {
  console.log(`  ${pad(r.name.slice(0, 44), 46)} ${pad(kb(r.gzip), 11)}`);
}
console.log(`budget:          ${kb(BUDGET_KB * 1024)}`);
console.log('');

if (total > BUDGET_KB * 1024) {
  console.error(`BUDGET EXCEEDED by ${kb(total - BUDGET_KB * 1024)}.`);
  console.error('Likely causes, in order of how often they are actually true here:');
  console.error('  - something in src/features/ or src/app/ imported algorithms/registry.ts,');
  console.error('    which statically imports every algorithm. This is the #1 cause and it');
  console.error('    does not look wrong in review. See the lazy-loading boundary');
  console.error('    test in src/core/boundary.test.ts.');
  console.error('  - a new runtime dependency added to the initial graph');
  console.error('  - a static import in src/core/ (breaks the worker boundary too)');
  console.error('  - Shiki pulled in eagerly instead of via dynamic import()');
  console.error('  - a route component imported eagerly instead of through React.lazy()');
  console.error('');
  console.error('For reference, each algorithm is its own lazy chunk of roughly');
  console.error('5-12 kB gzip, so the curriculum is not supposed to cost anything up front.');
  process.exit(1);
}

const lazyShiki = rows.some((r) => r.name.startsWith('cpp-'));
if (!lazyShiki) {
  console.warn('note: the C++ grammar chunk is missing — is Shiki still lazy?');
}

/**
 * A regression guard for the bug described at the top of this file.
 *
 * The vendor chunk is the largest static import in any React build, so if it is
 * ever missing from the initial set, the graph walk has broken again and the total
 * above is understated. Cheap, and it fails loudly rather than reporting a
 * comfortable number.
 */
const vendorInitial = initial.some((r) => r.name.startsWith('react-'));
if (!vendorInitial) {
  console.error('MEASUREMENT BROKEN: the react vendor chunk is not counted as initial.');
  console.error('The static-import walk has regressed, so the total above is understated.');
  process.exit(1);
}

console.log('within budget.');
