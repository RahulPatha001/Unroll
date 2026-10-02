import { expect, test } from '@playwright/test';
import { SHOT, settlePage } from './harness.ts';

/**
 * Baselines for the pages that are not the player.
 *
 * ## Why these are separate from `screens.spec.ts`
 *
 * Because the settle conditions are different in kind, not just in detail. A player
 * fixture is photographable once the trace is built and Shiki has resolved; a page
 * is photographable once its own asynchronous work is done, and each page has a
 * different answer — an article has to load an algorithm chunk and materialise a
 * trace *per stepper*, and the compare page has to build two.
 *
 * Bolting them onto the existing spec would mean one `settle` that waits for
 * everything, which would make every capture pay for every other page's loading and
 * would hide exactly the failures worth catching (a stepper that never resolves
 * would just make the whole suite slow rather than making one baseline wrong).
 *
 * ## The wait is content-based, never a timeout
 *
 * Each page below waits for the thing it is about. A `waitForTimeout` here would be
 * a flake generator: a slow CI runner photographs a spinner and commits it.
 */
test.describe.configure({ mode: 'parallel' });

const WIDTHS = [
  { tag: '1440', width: 1440, height: 900 },
  { tag: '390', width: 390, height: 844 },
] as const;

/** The browse page. */
for (const vp of WIDTHS) {
  test(`page browse at ${vp.tag}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`${baseURL ?? ''}/`);

    // The grid is the subject. One card is not "loaded" — all of them are, because
    // a partial grid is what a card that failed to render would look like.
    await expect(page.locator('a[data-algo]')).not.toHaveCount(0);
    await expect(page.getByRole('heading', { name: /animation and the code are/i })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    await expect(page).toHaveScreenshot(`page-browse-${vp.tag}.png`, SHOT);
  });
}

/** The browse page with a family filter applied, so the grouped state is frozen too. */
for (const vp of WIDTHS) {
  test(`page browse-filtered at ${vp.tag}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`${baseURL ?? ''}/`);
    await expect(page.locator('a[data-algo]').first()).toBeVisible();

    /*
     * The family pill, not a text search.
     *
     * `searchCatalog` matches a term anywhere in title, summary, tags, `aka`,
     * category *and* complexity — so "graph" legitimately pulls in algorithms from
     * eight families, and the browse page correctly declines to group them under
     * one heading. Filtering by the pill is the deterministic way to reach a
     * single-family view, which is the state worth freezing.
     */
    const pill = page.getByRole('button', { name: 'Graphs' });
    await pill.click();
    await expect(pill).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Graphs' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    await expect(page).toHaveScreenshot(`page-browse-filtered-${vp.tag}.png`, SHOT);
  });
}

/**
 * An article, photographed partway down.
 *
 * Scrolled deliberately. The top of an article is a heading and a paragraph, which
 * is the least interesting thing about it — the design work is in the callouts, the
 * tables and the embedded stepper, and a baseline of the intro freezes none of it.
 */
for (const vp of WIDTHS) {
  test(`page article at ${vp.tag}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`${baseURL ?? ''}/learn/bubble-sort`);

    await expect(
      page.getByRole('heading', { name: 'Bubble sort, explained slowly', level: 1 }),
    ).toBeVisible();

    // The stepper is the point of this section, so the capture waits for it to have
    // actually drawn a frame rather than for its chrome to exist.
    const stepper = page.getByRole('figure').filter({ hasText: 'live' }).first();
    await expect(stepper).toBeVisible();
    await settlePage(stepper);

    // To the first stepper, so the frozen image contains the differentiator rather
    // than three paragraphs of prose above it.
    await stepper.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);

    await expect(page).toHaveScreenshot(`page-article-${vp.tag}.png`, SHOT);
  });
}

/** The compare page, once both traces exist. */
for (const vp of WIDTHS) {
  test(`page compare at ${vp.tag}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`${baseURL ?? ''}/compare/bubble-sort/quick-sort`);

    // Both side panels with their step counts rendered — which means both traces
    // built, which is the only thing worth photographing here.
    await expect(page.getByRole('region', { name: /Bubble Sort visualisation/ })).toBeVisible();
    await expect(page.getByRole('region', { name: /Quick Sort visualisation/ })).toBeVisible();
    await expect(page.getByLabel('Scrub both algorithms')).toBeVisible();
    await settlePage(page.getByRole('region', { name: /Quick Sort visualisation/ }));
    await page.evaluate(() => document.fonts.ready);

    await expect(page).toHaveScreenshot(`page-compare-${vp.tag}.png`, SHOT);
  });
}

/** The 404, because a blank page is the failure this page exists to prevent. */
for (const vp of WIDTHS) {
  test(`page not-found at ${vp.tag}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`${baseURL ?? ''}/no/such/page`);
    await expect(page.getByRole('heading', { name: /does not exist/ })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`page-not-found-${vp.tag}.png`, SHOT);
  });
}

/** The command palette, open and populated. */
test('page command-palette at 1440', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL ?? ''}/`);
  await expect(page.locator('a[data-algo]').first()).toBeVisible();

  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Search algorithms and articles' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox').fill('sort');
  // At least one option, so the frozen image is a populated list and not an
  // empty-state that happens to be passing.
  await expect(dialog.getByRole('option').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  await expect(page).toHaveScreenshot('page-command-palette-1440.png', SHOT);
});
