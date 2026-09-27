#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every colour token referenced in `src/` must emit a rule in the built CSS.
 *
 * ## Why this is a build-output check and not a source check
 *
 * A misspelled or undeclared token is the most silent failure in a Tailwind
 * codebase. `bg-dnager-deep` is not a colour, so Tailwind generates nothing for
 * it, the element renders with no background, and the build is green. There is no
 * error to catch and no warning to read.
 *
 * The unit test at `src/lib/tokens.test.ts` covers the *typo* case — a value within
 * two edits of a declared token — but it structurally cannot cover the
 * *undeclared* case, and that is not a gap in its logic, it is a gap in its
 * premise. `bg-dnager-deep` is far in edit distance from every declared token, so
 * a near-miss test correctly classifies it as "not a typo of anything" and moves
 * on. It was only caught by hand: the migration notes named four tokens
 * (`surface-overlay`, `success-deep`, `danger-deep`, `info-deep`) that had never
 * been added to `@theme`, and 15 call sites rendered with no background until
 * someone grepped the output.
 *
 * So this reads the answer from the only place it exists. It runs after a build.
 *
 * Usage: `npm run build && node tools/checkTokens.mjs`
 */

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist', 'assets');

/** Must mirror the `@theme` block in `src/index.css`. */
const TOKENS = new Set([
  'surface',
  'surface-raised',
  'surface-inset',
  'surface-overlay',
  'border',
  'border-strong',
  'border-subtle',
  'text',
  'text-strong',
  'text-muted',
  'text-subtle',
  'text-faint',
  'text-inverse',
  'accent',
  'accent-hover',
  'accent-strong',
  'accent-deep',
  'success',
  'success-strong',
  'success-deep',
  'danger',
  'danger-strong',
  'danger-deep',
  'info',
  'info-deep',
]);

/** Utilities Tailwind derives colour tokens into. */
const PREFIXES = [
  'bg',
  'text',
  'border',
  'ring',
  'fill',
  'stroke',
  'shadow',
  'from',
  'via',
  'to',
  'decoration',
  'outline',
  'caret',
  'accent',
  'divide',
];

/**
 * `src/features/viewport/palette.ts` is a deliberately closed vocabulary of
 * literal class strings, enforced by `palette.test.ts` reading it from disk. It
 * has no tokens and must not acquire any.
 */
const EXEMPT = new Set(['src/features/viewport/palette.ts']);

/**
 * Remove comments, preserving newlines.
 *
 * A local strip rather than importing `src/lib/stripSource.ts`, because that file
 * is TypeScript and this is a plain Node script that CI runs directly. The
 * semantics that matter here are the same: a token name inside a comment is
 * prose, not a use.
 */
const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));

function walk(dir, out = []) {
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const rel = `${dir}/${entry}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(rel);
  }
  return out;
}

const used = new Map();
for (const rel of walk('src')) {
  if (EXEMPT.has(rel)) continue;
  const body = stripComments(readFileSync(join(ROOT, rel), 'utf8'));
  const re = new RegExp(
    `(?:^|[\\s"'\x60])((?:[a-z-]+:)?)(${PREFIXES.join('|')})-([a-z][a-z0-9-]*)(/\\d{1,3})(?![a-z0-9-])`,
    'g',
  );
  for (const m of body.matchAll(re)) {
    if (!TOKENS.has(m[3])) continue;
    used.set(`${m[1]}${m[2]}-${m[3]}${m[4]}`, rel);
  }
}

let cssFile;
try {
  cssFile = readdirSync(DIST).find((f) => f.endsWith('.css'));
} catch {
  console.error('no dist/assets — run `npm run build` before this script');
  process.exit(2);
}
if (!cssFile) {
  console.error('no CSS emitted — run `npm run build` before this script');
  process.exit(2);
}
const css = readFileSync(join(DIST, cssFile), 'utf8');

/*
 * Tailwind escapes `:` and `/` with a literal backslash in the class selector —
 * `.hover\:bg-surface-inset\/40:hover` — so the pattern has to account for the
 * backslash character itself. An earlier version of this check did not, and
 * reported 59 phantom failures against CSS that was working perfectly, which is
 * the failure mode of a check nobody trusts: it is easier to delete than to
 * debug, and deleting it loses the only guard against the real bug.
 */
const patternFor = (util) => {
  const escaped = util.replace(/[\\:/.]/g, (c) => `\\\\${c}`);
  return new RegExp(`\\.${escaped}(?![a-z0-9_-])`);
};

const missing = [];
for (const [util, rel] of used) {
  if (!patternFor(util).test(css)) missing.push({ util, rel });
}

console.log('');
console.log(`  token utilities referenced in src : ${used.size}`);
console.log(`  emitted in ${cssFile.padEnd(24)}: ${used.size - missing.length}`);

if (missing.length) {
  console.log('');
  console.error(`  ${missing.length} token utility(ies) emit NO CSS. Each renders as an`);
  console.error('  element with no colour, and the build is green:');
  for (const { util, rel } of missing) console.error(`    ${util}   (${rel})`);
  console.error('');
  console.error('  Either the token is not declared in the @theme block in src/index.css,');
  console.error('  or the utility is not one Tailwind generates. Check @theme first.');
  process.exit(1);
}

console.log('  every referenced token emits a rule');
console.log('');
