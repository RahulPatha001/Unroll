import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PALETTE_ORDER } from '../../core/trace/types.ts';
import {
  BASE,
  IDLE,
  rankedKeys,
  resolveGlyph,
  resolveStyle,
  STYLE_COUNT,
  styleForKey,
} from './palette.ts';

/**
 * The palette is the single source of truth for how a highlight group looks, in
 * both DOM and SVG. These tests exist because two real bugs got through, and they
 * are the same bug seen twice.
 *
 * **Picking the wrong class family fails silently.** `bg-*` sets
 * `background-color` and `border-*` sets `border-*`; neither means anything to an
 * SVG shape, which is painted with `fill` and `stroke`. Styling an SVG `<circle>`
 * with `bg-amber-400` leaves it at the SVG default of **black**. And `text-*`
 * sets `color`, which an SVG glyph does not read — a `<text>` styled only with
 * `text-slate-400` is also black on black.
 *
 * So every node in the tree, graph, trie and linked-list viewports was rendering
 * as an unlabelled black dot: no amber "this is the current node", no visible
 * label, no border. Every test passed, every trace was correct, and the entire
 * visual language of four viewport families was absent. A black dot is not an
 * error — it is just missing.
 *
 * Hence the rule asserted below: every style carries a *matched pair* of DOM and
 * SVG classes, all four derived from one colour.
 */

const EVERY_KEY: string[] = [...PALETTE_ORDER, 'a-key-not-in-the-palette', 'answer'];

/**
 * Each style names one colour twice, once per rendering target, and the two
 * classes for the same role must never drift.
 *
 * There are **three** pairs, not two, and the third exists because of a bug: an
 * SVG *shape* is filled with the background colour, while SVG *text* is filled
 * with the ink colour. Those are different colours. Collapsing them into one
 * `fill` field meant every strongly-highlighted node was painted
 * `fill-slate-950` — near-black on a near-black canvas — because the ink colour
 * was being used to paint the shape. A second attempt at the fix reintroduced the
 * same conflation, which is why the distinction is now spelled out and covered by
 * a test instead of being left to be re-derived.
 */
function assertCoherent(
  name: string,
  style: { bg: string; fill: string; text: string; ink: string; border: string; stroke: string },
): void {
  expect(style.fill, `${name}: shape fill must match bg`).toBe(style.bg.replace(/^bg-/, 'fill-'));
  expect(style.ink, `${name}: text ink must match text`).toBe(
    style.text.replace(/^text-/, 'fill-'),
  );
  expect(style.stroke, `${name}: stroke must match border`).toBe(
    style.border.replace(/^border-/, 'stroke-'),
  );
}

describe('highlight palette', () => {
  it('has exactly one style per palette rank', () => {
    // The two lists live in different files. When the style list was one short,
    // the last two highlight names wrapped onto the *first* two colours and
    // `visited` rendered identically to `picked` — two unrelated states sharing
    // a colour, which is the one thing this ranked palette exists to prevent.
    expect(STYLE_COUNT).toBe(PALETTE_ORDER.length);
  });

  it('reuses no colour between two ranks that ever appear together', () => {
    /*
     * Hues are deliberately reused across tiers, because 33 globally distinct
     * colours is not something a student can hold in their head and pretending
     * otherwise would be dishonest. The guarantee that *is* real, and that the
     * legend and the eye both rely on, is narrower: two groups a student can see
     * in the same frame never share a colour.
     *
     * Rank-adjacency is the cheap local check; `contract.test.ts` then asserts
     * the real thing per frame, per algorithm, against actual traces.
     */
    for (let i = 1; i < PALETTE_ORDER.length; i++) {
      const prev = styleForKey(PALETTE_ORDER[i - 1] as string);
      const cur = styleForKey(PALETTE_ORDER[i] as string);
      expect(cur.bg, `${PALETTE_ORDER[i - 1]} vs ${PALETTE_ORDER[i]}`).not.toBe(prev.bg);
    }
  });

  it('gives every style a coherent DOM and SVG class set', () => {
    for (const key of EVERY_KEY) {
      const style = styleForKey(key);
      expect(style.bg, `${key}: bg`).toMatch(/^bg-/);
      expect(style.text, `${key}: text`).toMatch(/^text-/);
      expect(style.fill, `${key}: shape fill`).toMatch(/^fill-/);
      expect(style.ink, `${key}: text ink`).toMatch(/^fill-/);
      expect(style.border, `${key}: border`).toMatch(/^border-/);
      expect(style.stroke, `${key}: stroke`).toMatch(/^stroke-/);
      assertCoherent(key, style);
    }
  });

  it('gives the standalone styles a coherent class set too', () => {
    for (const [name, style] of [
      ['BASE', BASE],
      ['IDLE', IDLE],
    ] as const) {
      expect(style.fill, name).toMatch(/^fill-/);
      expect(style.ink, name).toMatch(/^fill-/);
      expect(style.stroke, name).toMatch(/^stroke-/);
      assertCoherent(name, style);
    }
  });

  it('writes every class name literally, never assembled at runtime', () => {
    // Tailwind finds utilities by scanning *source text* for class-shaped
    // strings. A class built at runtime — `text.replace('text-', 'fill-')` —
    // appears in no file, is never emitted, and silently does nothing. This is
    // why the palette is verbose instead of derived, and the test is what keeps
    // that decision from being "tidied up" later.
    const source = readFileSync(new URL('./palette.ts', import.meta.url), 'utf8');
    const body = source.slice(
      source.indexOf('const STYLES'),
      source.indexOf('\n];', source.indexOf('const STYLES')),
    );
    const families = ['bg', 'fill', 'text', 'ink', 'border', 'stroke'];
    for (const family of families) {
      const authored = body.match(new RegExp(`^\\s+${family}: '`, 'gm')) ?? [];
      // Two per rank (STYLES + IDLE + BASE is outside this slice; STYLES only).
      expect(authored.length, `${family}- classes in the STYLES list`).toBe(PALETTE_ORDER.length);
    }
    // The derivation that must *not* be used in the STYLES list.
    expect(body).not.toMatch(/\.replace\(\s*\/\\\^?text-/);
    expect(body).not.toMatch(/\.replace\(\s*\/\\\^?border-/);
  });

  it('gives a glyph only on the high-contrast ranks', () => {
    // The glyph is the non-colour fallback for meaning, so it belongs only where
    // the fill is strong enough to carry it. On the muted background ranks it
    // would be decoration competing with the value.
    //
    // The split must be a clean prefix of PALETTE_ORDER, which is what makes
    // "the strong ranks carry a glyph, the background ranks do not" a rule
    // rather than a coincidence.
    const firstWithoutGlyph = PALETTE_ORDER.findIndex((k) => styleForKey(k).glyph === undefined);
    expect(firstWithoutGlyph, 'at least one strong rank has a glyph').toBeGreaterThan(0);
    for (const key of PALETTE_ORDER.slice(0, firstWithoutGlyph)) {
      expect(styleForKey(key).glyph, `${key} should carry a glyph`).toBeTruthy();
    }
    for (const key of PALETTE_ORDER.slice(firstWithoutGlyph)) {
      expect(styleForKey(key).glyph, `${key} should not carry a glyph`).toBeUndefined();
    }
  });

  it('resolves the most specific group when several cover one cell', () => {
    // This is the whole point of ranking: a cell in both `compare` and `sorted`
    // must render as `compare`, or the specific thing happening now is hidden by
    // the broad background state.
    const highlight = { compare: [3, 4], sorted: [0, 1, 2, 3, 4, 5] };
    expect(resolveStyle(3, highlight)).toBe(styleForKey('compare'));
    expect(resolveStyle(0, highlight)).toBe(styleForKey('sorted'));
    expect(resolveStyle(99, highlight)).toBe(BASE);
    expect(resolveStyle(3, undefined)).toBe(BASE);
  });

  it('ranks keys by specificity, not by declaration order', () => {
    // `highlight` object key order is the algorithm author's, and must not
    // change what a student sees.
    const a = { sorted: [0, 1], compare: [1] };
    const b = { compare: [1], sorted: [0, 1] };
    expect(resolveStyle(1, a).bg).toBe(resolveStyle(1, b).bg);
    expect(rankedKeys(a)[0]).toBe('compare');
  });

  it('returns a stable style for an unknown key', () => {
    // A typo in an anchor's highlight name must not crash the viewport, and must
    // not make the cell invisible. It is *not* an error: algorithms are allowed
    // to invent a state name, and the legend names it either way.
    const s = styleForKey('a-key-not-in-the-palette');
    expect(s.bg).toBeTruthy();
    expect(styleForKey('a-key-not-in-the-palette')).toBe(s);
  });

  it('resolves a glyph for the winning group only', () => {
    expect(resolveGlyph(2, { answer: [0], current: [2] })).toBe(
      styleForKey('current').glyph ?? null,
    );
  });
});
