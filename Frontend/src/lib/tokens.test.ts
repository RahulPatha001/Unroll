import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from './stripSource.ts';

/**
 * The token layer is load-bearing, and this is what makes it so.
 *
 * ## Why a test and not a lint rule
 *
 * Because a typo in a token name is **silent**, and silence is the whole problem.
 * Tailwind v4 generates `bg-surface-raised` from `--color-surface-raised` and
 * generates absolutely nothing for `bg-suface-raised`. No error, no warning, no
 * failed build: the class simply does not exist, the element renders with no
 * background, and it looks like a spacing bug three components away. The repo's
 * own note that "lint has failed silently here before" applies with more force
 * here than to most rules, and `boundary.test.ts` already argues the general
 * case — which is why this is a test rather than another Biome override.
 *
 * ## Why it does not scan for `var(--…)`
 *
 * The obvious implementation greps for `var(--…)` and checks each name is
 * declared. That test passes *vacuously*, which is worse than not having it.
 * Components consume tokens as utilities — `bg-surface`, `text-text-muted` — and
 * almost never write `var(--color-surface)`; the only `var(--…)` in the whole
 * source tree is `--font-sans` in `index.css`. A `var(--…)` scan finds one
 * reference today and none after migration, and would keep passing while every
 * typo in every `.tsx` went unnoticed.
 *
 * ## What is excluded, and why
 *
 * - **`src/features/viewport/palette.ts`.** Its 33 colours are a closed
 *   vocabulary of literal class strings, enforced by `palette.test.ts` reading
 *   the file from disk. They are deliberately not tokens — see the note in
 *   `index.css`. Migrating them would undo existing work and break a test.
 * - **Comments.** Handled by `stripComments`, the mirror of
 *   `stripCommentsAndStrings`. Prose that *mentions* a token name is not a use of
 *   it, and this file's own comment names several.
 * - **String contents are kept**, unavoidably: the colours are in `className`
 *   attributes, which are strings. The cost is that ordinary English in the
 *   algorithms' narration gets scanned too — see the edit-distance note below for
 *   why that is survivable.
 */

const ROOT = join(import.meta.dirname, '..', '..');
const THEME = join(ROOT, 'src', 'index.css');

/**
 * Utilities Tailwind derives colour tokens into. Kept explicit rather than
 * derived from Tailwind's source so that changing this list is a decision someone
 * made rather than a silent behaviour change in a dependency.
 */
const COLOUR_UTILITIES = [
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
] as const;

const PREFIX_RE = `(?:${COLOUR_UTILITIES.join('|')})`;

/** Files whose colour literals are a closed vocabulary, not loose usage. */
const EXEMPT = new Set(['src/features/viewport/palette.ts']);

const TOKENS = [
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
] as const;

const tokenSet = new Set<string>(TOKENS);

/** Stock Tailwind hue names, so `slate-950` is recognised as a colour, not a typo. */
const STOCK_HUE =
  /^(slate|amber|emerald|sky|rose|red|green|blue|yellow|orange|violet|indigo|cyan|teal|lime|fuchsia|pink|zinc|neutral|stone)-\d{2,3}$/;

/** Levenshtein distance, capped: the answer is only ever "0, 1, 2 or far". */
function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        (prev[j] as number) + 1,
        (row[j - 1] as number) + 1,
        (prev[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return Math.min(prev[b.length] as number, cap + 1);
}

function nearestToken(value: string): { token: string; distance: number } | null {
  let best: { token: string; distance: number } | null = null;
  for (const token of TOKENS) {
    const distance = editDistance(value, token);
    if (distance <= 2 && (!best || distance < best.distance)) best = { token, distance };
  }
  return best;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const rel = `${dir}/${entry}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(entry)) out.push(rel);
  }
  return out;
}

const sources = walk('src')
  .filter((p) => !/\.test\.tsx?$/.test(p))
  .filter((p) => !EXEMPT.has(p))
  /*
   * `src/core/` is excluded, and not as a convenience.
   *
   * `core/` emits data and is forbidden from importing anything view-related —
   * that boundary is enforced twice, in `boundary.test.ts` and in `biome.jsonc`.
   * What it *does* contain is the algorithms' own prose: `help:` strings, notes,
   * lesson text. And prose collides with utility prefixes, because English
   * contains `to-int` ("cast to int"), `from-above`, `to-front` and
   * `divide-by-zero` (divide and conquer). Those arrived as 13 false positives
   * before this exclusion, and no amount of keyword-filtering fixes a language.
   *
   * A styling rule has no business reading `core/`.
   */
  .filter((p) => !p.startsWith('src/core/'));

/**
 * The handful of non-colour utilities that share a colour utility's prefix and
 * sit *one edit* from a token name.
 *
 * `text-left` is one edit from `text`, so the near-miss test cannot tell them
 * apart without help. This is a short, closed list on purpose — the first
 * version of this test tried to enumerate every non-colour utility and produced
 * 45 false positives, which is what a list like this must not become. If a new
 * one shows up, add it here with a reason rather than loosening the test.
 */
const SHARED_PREFIX_KEYWORDS = new Set(['left', 'right', 'center', 'justify', 'start', 'end']);

/** Count of declared-token utilities, so "nobody uses it" is a real failure. */
function tokenUseCount(): number {
  let n = 0;
  for (const path of sources) {
    const body = stripComments(readFileSync(join(ROOT, path), 'utf8'));
    for (const m of body.matchAll(
      new RegExp(`\\b${PREFIX_RE}-([a-z][a-z0-9-]*)(?:/\\d{1,3})?(?![a-z0-9-])`, 'g'),
    )) {
      if (tokenSet.has(m[1] as string)) n++;
    }
  }
  return n;
}

describe('the token layer', () => {
  it('declares every token it is supposed to declare', () => {
    // The premise. If `@theme` loses a token, the checks below pass vacuously.
    const css = readFileSync(THEME, 'utf8');
    const missing = TOKENS.filter((t) => !new RegExp(`--color-${t}\\s*:`).test(css));
    expect(missing, `not declared in @theme: ${missing.join(', ')}`).toEqual([]);
  });

  it('is used — a token layer nobody consumes is just a comment', () => {
    expect(tokenUseCount(), 'no component uses a semantic token yet').toBeGreaterThan(0);
  });

  it('has no consumer that spells a token wrongly', () => {
    /*
     * Detection is **edit distance to the nearest token**, not "is this utility a
     * colour?", and the reason is worth recording because the first attempt got
     * it wrong.
     *
     * Asking "is `bg-foo` a colour?" is unwinnable here. `text-`, `border-`,
     * `bg-`, `from-`, `to-` and `divide-` are all shared with non-colour
     * utilities *and* with ordinary English in the algorithms' own narration, and
     * the class strings have to stay in the scan for the colours to be in it at
     * all. Scanning for "colour utilities" returned 45 hits, every one a false
     * positive: `border-t`, `shadow-md`, `outline-offset-2`, `bg-gradient-to-r`,
     * and nine copies each of `divide-by-zero`, `from-above` and `to-front` —
     * the last three being English words from prose about divide-and-conquer and
     * pointers moving from above and below.
     *
     * A near-miss test has none of that noise, because the noise is not *near* a
     * token. `border-t` is far from every name in the list; so is
     * `divide-by-zero`. `bg-suface-raised` is one edit from `surface-raised`.
     *
     * What it cannot catch is a typo that lands on a real Tailwind colour —
     * `bg-surfce` where `slate-something` was meant. That class exists, so it
     * renders in the wrong colour rather than not at all: a much less silent
     * failure, and a different test to write (forbidding the stock palette
     * outside `palette.ts`).
     */
    const problems: string[] = [];
    const seen = new Set<string>();

    for (const path of sources) {
      const body = stripComments(readFileSync(join(ROOT, path), 'utf8'));
      const re = new RegExp(`\\b${PREFIX_RE}-([a-z][a-z0-9-]*)(?:/\\d{1,3})?(?![a-z0-9-])`, 'g');
      for (const m of body.matchAll(re)) {
        const value = m[1] as string;
        if (tokenSet.has(value)) continue;
        if (STOCK_HUE.test(value)) continue;
        if (m[0].includes('[')) continue; // arbitrary value: `text-[13px]`
        if (/^(inherit|current|transparent|black|white|none)$/.test(value)) continue;
        if (SHARED_PREFIX_KEYWORDS.has(value)) continue;

        const near = nearestToken(value);
        if (near) {
          const key = `${path}:${m[0]}`;
          if (seen.has(key)) continue;
          seen.add(key);
          problems.push(`${path}: ${m[0]}  (did you mean --color-${near.token}?)`);
        }
      }
    }

    expect(
      problems,
      `${problems.length} probable token typo(s). Each renders as an element with no ` +
        `colour and no error at all:\n  ${problems.join('\n  ')}`,
    ).toEqual([]);
  });

  it('resolves every token to a stock Tailwind colour, never to a copied hex', () => {
    // A token written as `#0f172a` is a second copy of the palette, and the whole
    // point of aliasing through `var()` is that there is no second copy to drift.
    const css = stripComments(readFileSync(THEME, 'utf8'));
    const hexTokens = [...css.matchAll(/--color-[a-z-]+\s*:\s*(#[0-9a-f]{3,8})\s*;/gi)].map(
      (m) => m[1] as string,
    );
    expect(
      hexTokens,
      `${hexTokens.length} token(s) hardcode a hex; alias through var(--color-…) instead`,
    ).toEqual([]);
  });
});
