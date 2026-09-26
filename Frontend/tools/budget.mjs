#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
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
 */
import { gzipSync } from 'node:zlib';

const DIST = 'dist/assets';
const BUDGET_KB = 200; // plan §7: 200KB gzip for the initial bundle

const files = readdirSync(DIST);

const isInitial = (name) =>
  // The entry chunk, plus the vendor chunk it statically imports. Vite names the
  // entry `index-*`; anything else without a hyphenated name is a shared chunk.
  /^index-.*\.(js|css)$/.test(name) || /^[a-z-]+\.(js|css)$/.test(name);

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
    initial: isInitial(name),
  });
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
console.log(`budget:          ${kb(BUDGET_KB * 1024)}`);
console.log('');

if (total > BUDGET_KB * 1024) {
  console.error(`BUDGET EXCEEDED by ${kb(total - BUDGET_KB * 1024)}.`);
  console.error('Likely causes, in order of how often they are actually true here:');
  console.error('  - something in src/features/ imported algorithms/registry.ts, which');
  console.error('    statically imports every algorithm. This is the #1 cause and it');
  console.error('    does not look wrong in review. See the lazy-loading boundary');
  console.error('    test in src/core/boundary.test.ts.');
  console.error('  - a new runtime dependency added to the initial graph');
  console.error('  - a static import in src/core/ (breaks the worker boundary too)');
  console.error('  - Shiki pulled in eagerly instead of via dynamic import()');
  console.error('');
  console.error('For reference, each algorithm is its own lazy chunk of roughly');
  console.error('5-12 kB gzip, so the curriculum is not supposed to cost anything up front.');
  process.exit(1);
}

const lazyShiki = rows.some((r) => r.name.startsWith('cpp-'));
if (!lazyShiki) {
  console.warn('note: the C++ grammar chunk is missing — is Shiki still lazy?');
}

console.log('within budget.');
