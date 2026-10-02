import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Deterministic capture.
 *
 * A screenshot baseline is only worth committing if re-running it twice produces
 * the same bytes. That is not free, because three separate things in this app
 * are asynchronous *and visible*:
 *
 *  1. **Shiki.** Highlighting is four dynamic `import()`s — the core engine, a
 *     theme, the JS regex engine, then a per-language grammar. Until they
 *     resolve the listing is plain monospace text, and it then repaints with
 *     colour. At every viewport at or above `xl` the code panel is a docked
 *     column, so a capture taken during that window is a picture of unhighlighted
 *     code that will never be reproduced. Hence `data-highlighted`: `ready`
 *     means wait, `unavailable` means the documented plain-text fallback *is*
 *     the answer and waiting longer changes nothing.
 *
 *  2. **The trace.** A lazily imported algorithm chunk has to arrive and be
 *     materialised before there is anything to photograph. The shell renders
 *     `Loading…` in the meantime.
 *
 *  3. **Playback.** The clock is a `requestAnimationFrame` loop, so a capture
 *     taken mid-playback is a picture of whatever frame happened to be on
 *     screen. Load leaves it paused; asserting that is cheaper and more honest
 *     than trying to freeze a clock that is not injectable.
 *
 * Fonts are the fourth, quieter one: Inter is a variable webfont, and a capture
 * that lands mid-swap photographs fallback metrics.
 *
 * What is deliberately *not* done here is emulating `prefers-reduced-motion`.
 * It would freeze transitions, but the app honours it as a real user setting
 * that also disables the speed control — so a baseline captured under it would
 * not match what a default visitor sees. `animations: 'disabled'` in the
 * screenshot options freezes CSS animations and transitions without changing
 * what is drawn.
 */

/** A pinned app state. Every field is part of the URL contract in `lib/urlState.ts`. */
export interface Fixture {
  /** Catalog id, e.g. `dijkstra`. */
  algo: string;
  /** Preset id, so the input is identical run to run. */
  preset?: string;
  /** Pin the frame so the visualisation is not merely "whatever loaded first". */
  frame?: number;
  /** Pin the language, because the code panel renders a different listing per tab. */
  lang?: string;
}

export function urlFor(baseURL: string, fixture: Fixture): string {
  const url = new URL(baseURL);
  url.searchParams.set('algo', fixture.algo);
  if (fixture.preset) url.searchParams.set('preset', fixture.preset);
  if (fixture.frame !== undefined) url.searchParams.set('frame', String(fixture.frame));
  if (fixture.lang) url.searchParams.set('lang', fixture.lang);
  return url.toString();
}

/**
 * Load a fixture and hold still until the frame is photographable.
 *
 * `highlight: 'ready'` is the default because a baseline of the plain-text
 * fallback is only meaningful as a deliberate record of that fallback. Pass
 * `'unavailable'` to wait for the fallback specifically, and `'any'` to accept
 * either — which is what a test that only cares about geometry wants, since
 * geometry does not depend on token colours.
 */
export async function settle(
  page: Page,
  baseURL: string,
  fixture: Fixture,
  options: { highlight?: 'ready' | 'unavailable' | 'any' } = {},
): Promise<void> {
  const { highlight = 'ready' } = options;

  await page.goto(urlFor(baseURL, fixture));

  // The trace. `Loading…` is the shell's own word for "not ready", which beats
  // guessing at a class name.
  await expect(page.getByText('Loading…')).toHaveCount(0);
  await expect(page.getByText('Something went wrong loading this algorithm.')).toHaveCount(0);

  // The visualisation itself, which is the thing being photographed.
  await expect(page.getByRole('region', { name: 'Algorithm visualisation' })).toBeVisible();

  // Playback is not in flight. `aria-label` flips to `Pause` while playing.
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

  // Shiki.
  if (highlight !== 'any') {
    const listing = page.locator('aside[aria-label="Code"] [data-highlighted]');
    if (await listing.count()) {
      await expect(listing).toHaveAttribute('data-highlighted', highlight, { timeout: 20_000 });
    }
  }

  // Inter, if it is being fetched at all.
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Screenshot options shared by every baseline.
 *
 * ## The tolerance, and why it is 0.0004 and not something comfortable
 *
 * The first version of this was `0.002` — 0.2% of the image, about 2,600 pixels
 * at 1440x900 — on the reasoning that it only needed to absorb antialiasing. That
 * reasoning was wrong, and the token migration proved it.
 *
 * Migrating the colour layer changed one header badge from `slate-400` to
 * `slate-300`: a 10px label, roughly 150 differing pixels, in an image allowed
 * 2,600. The screenshot test **passed**. A real, deliberate, app-wide colour
 * change was invisible to the suite whose entire job is noticing that things
 * changed, and worse, it was invisible in the way that *looks* like success.
 *
 * 0.0004 is about 520 pixels at 1440x900: still generous for subpixel
 * antialiasing, and roughly one small text label. A colour shift on a badge
 * fails; a colour shift on a heading fails; a whole theme changing fails
 * loudly, which is the behaviour you want from a baseline.
 *
 * The honest cost is that a genuine cross-platform font change now fails rather
 * than being absorbed. That is the correct trade: the baselines are Chromium
 * only and are committed from one platform, so a font-metric difference is a
 * real visual difference and deserves a human to look at it and regenerate
 * deliberately, rather than being quietly tolerated forever.
 *
 * ## Layout shift is not this file's job
 *
 * A layout change moves thousands of pixels and no tolerance small enough to be
 * useful would miss it — but a *small* reflow, the kind that is actually
 * dangerous, is a handful of pixels and is exactly what a loose threshold
 * swallows. That is caught numerically in `layout.spec.ts`, which compares
 * bounding boxes and cannot be absorbed by anything.
 */
export const SHOT = {
  animations: 'disabled' as const,
  caret: 'hide' as const,
  scale: 'css' as const,
  maxDiffPixelRatio: 0.0004,
};
