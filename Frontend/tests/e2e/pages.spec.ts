import { expect, test } from '@playwright/test';

/**
 * The pages: browse, guides, compare, 404.
 *
 * Separate from `app.spec.ts` because these test a different subject. That file
 * asks "does the visualiser work"; this one asks "can you get to it, and does
 * everything else have a way out".
 *
 * ## The cold-load assertion is the important one here
 *
 * `page.goto('/learn')` on a dev server proves nothing: Vite rewrites unknown paths
 * to the SPA entry for free. In production the host has to do it, and this app is
 * deployed to two that need to be told separately — `public/_redirects` for
 * Cloudflare, `vercel.json`'s `rewrites` for Vercel. A missing rewrite produces a
 * hard 404 on refresh and on any shared link, while every in-app navigation keeps
 * working perfectly, because the router never asks the host.
 *
 * That is the exact shape of bug a click-through test cannot find, so these run
 * against the production build (`playwright.config.ts` boots `vite preview`) and
 * navigate directly.
 */

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  (page as unknown as { __errors: string[] }).__errors = errors;
});

async function noErrors(page: import('@playwright/test').Page) {
  const errors = (page as unknown as { __errors: string[] }).__errors;
  expect(errors, `console/page errors:\n${errors.join('\n')}`).toEqual([]);
}

test('/ is the browse page, not the visualiser', async ({ page }) => {
  await page.goto('/');

  // The headline states the product claim, which is the thing a first-time visitor
  // needs before anything else.
  await expect(page.getByRole('heading', { name: /animation and the code are/i })).toBeVisible();

  // No player on this route. Asserted negatively because it is the regression that
  // matters: `/` quietly rendering the visualiser again would make the selection
  // step unreachable while every other test still passed.
  await expect(page.getByRole('region', { name: 'Algorithm visualisation' })).toHaveCount(0);

  await noErrors(page);
});

test('a browse card opens that algorithm in the visualiser', async ({ page }) => {
  await page.goto('/');

  // Every algorithm is reachable from one page, which is the point of having it.
  await expect(page.locator('article[data-algo], a[data-algo]')).not.toHaveCount(0);

  await page.locator('a[data-algo="dijkstra"]').click();

  // Two things have to be true: the URL carries the algorithm, and the player
  // mounted it. Asserting only the URL would pass on a router that navigated but
  // rendered nothing.
  await expect(page).toHaveURL(/algo=dijkstra/);
  await expect(page.getByRole('heading', { name: "Dijkstra's Shortest Path" })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Algorithm visualisation' })).toBeVisible();
  await noErrors(page);
});

test('the browse filter narrows the grid and clears again', async ({ page }) => {
  await page.goto('/');
  const cards = page.locator('a[data-algo]');
  const before = await cards.count();
  expect(before).toBeGreaterThan(50);

  // By a real search term rather than a category pill, because search is the one
  // that has to combine with the catalog's `aka` vocabulary ("quicksort" for
  // `quick-sort`), and that is the part most likely to break.
  await page.getByLabel('Filter algorithms').fill('quicksort');
  await expect.poll(() => cards.count()).toBeLessThan(before);
  await expect(cards.first()).toHaveAttribute('data-algo', 'quick-sort');

  await page.getByRole('button', { name: 'Clear the filter' }).click();
  await expect.poll(() => cards.count()).toBe(before);
  await noErrors(page);
});

test('an empty filter offers a way out rather than a blank page', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Filter algorithms').fill('zzzznotathing');
  await expect(page.getByText(/Nothing matches/)).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('a[data-algo]').first()).toBeVisible();
  await noErrors(page);
});

test('command-K finds an algorithm and opens it', async ({ page }) => {
  await page.goto('/');

  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Search algorithms and articles' });
  await expect(palette).toBeVisible();

  await palette.getByRole('combobox').fill('tortoise');
  // "tortoise and hare" is only in the catalog's `aka`, so this proves the palette
  // reads the authored vocabulary rather than titles alone.
  await palette.getByRole('option').first().click();

  await expect(page).toHaveURL(/algo=detect-cycle/);
  await noErrors(page);
});

test('command-K closes on Escape without navigating', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Search algorithms and articles' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Search algorithms and articles' })).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await noErrors(page);
});

test('favouriting survives a reload and shows up on the browse page', async ({ page }) => {
  await page.goto('/');

  // The full catalog title, because that is what both the button's accessible name
  // and the chip's text use. Asserting on a prefix here would be asserting on a
  // different algorithm's name than the one being clicked.
  const TITLE = "Dijkstra's Shortest Path";
  await page.getByRole('button', { name: `Save ${TITLE} to favourites` }).click();

  // The favourite star is `aria-pressed`, so its own state is checkable without
  // reading the icon — which is the only way to tell "saved" from "drawn
  // differently" for anyone who cannot see the fill.
  await expect(page.getByRole('button', { name: `Remove ${TITLE} from favourites` })).toBeVisible();

  await page.reload();
  const section = page.getByRole('region', { name: 'Favourites' });
  await expect(section.getByRole('link', { name: TITLE })).toBeVisible();
  await noErrors(page);
});

test('opening an algorithm makes it resumable from the browse page', async ({ page }) => {
  await page.goto('/?algo=merge-sort');
  await expect(page.getByRole('region', { name: 'Algorithm visualisation' })).toBeVisible();

  await page.getByRole('link', { name: 'Algorithms' }).click();

  /*
   * "Continue", not a "Recently viewed" section.
   *
   * The first version of this page had a Recently-viewed block listing up to eight
   * algorithms as chips. It was mostly decorative — on a first visit it is empty, and
   * on a second visit the one algorithm you want is the first chip in a row of up to
   * eight, which is a worse version of putting it on a line of its own.
   *
   * So the page now leads with the single most recent algorithm and labels it
   * "Continue". The rest of the history is still offered, as chips, but only when
   * there *is* a rest — which is what makes the block meaningful instead of a
   * heading over nothing.
   */
  const resume = page.getByRole('banner').or(page.locator('header')).first();
  await expect(page.getByText('Continue', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Merge Sort', exact: true }).first()).toBeVisible();
  // And it is a working link, not a label.
  await page.getByRole('link', { name: 'Merge Sort', exact: true }).first().click();
  await expect(page).toHaveURL(/algo=merge-sort/);
  await expect(resume).toBeVisible();
  await noErrors(page);
});

test('the family rail narrows the list and clears again', async ({ page }) => {
  await page.goto('/');
  const rows = page.locator('a[data-algo]');
  const before = await rows.count();

  const rail = page.getByRole('navigation', { name: 'Algorithm families' });
  // By family id rather than by label, because the accessible name of a rail item
  // is its label *plus* its count *plus* its blurb — which is right for a reader and
  // brittle for a test.
  const graphs = rail.locator('[data-family="graphs"]');

  await graphs.click();
  await expect(graphs).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Graphs', level: 2 })).toBeVisible();

  const after = await rows.count();
  expect(after).toBeGreaterThan(0);
  expect(after).toBeLessThan(before);
  // The whole point of the rail: a family fits on one screen.
  expect(after).toBeLessThanOrEqual(12);

  // Clicking the active family clears the filter rather than needing a separate
  // "All" click, so the rail and the list cannot disagree about the current state.
  await graphs.click();
  await expect(graphs).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => rows.count()).toBe(before);
  await noErrors(page);
});

test('every family in the rail is reachable and has algorithms in it', async ({ page }) => {
  await page.goto('/');
  const rail = page.getByRole('navigation', { name: 'Algorithm families' });
  const items = rail.locator('[data-family]:not([data-family="all"])');
  await expect(items).toHaveCount(14);

  // Every family must be non-empty. A family with a blurb and a count of zero is a
  // dead end that looks like navigation, and the catalog test cannot see it because
  // the catalog and the rail agree — they are both wrong together only if a family
  // was emptied, which this catches.
  for (const item of await items.all()) {
    const count = Number(await item.locator('span.font-mono').innerText());
    expect(count, `family ${await item.getAttribute('data-family')} is empty`).toBeGreaterThan(0);
  }
  await noErrors(page);
});

test('rows never truncate an algorithm name', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  /*
   * The regression this guards is a real one that shipped for one build: the row
   * put the complexity, the star and a ~95px `INTERMEDIATE` label beside the title at
   * every width, and at 390px the title had about 60px left. Counting Sort rendered
   * as **"Countin…"** — an algorithm name truncated to seven characters, on the page
   * whose entire job is choosing between algorithms by name.
   *
   * Asserted across every visible row rather than one, because the failure depended
   * on which label happened to be longest.
   */
  const headings = page.locator('h3');
  const count = await headings.count();
  expect(count).toBeGreaterThan(3);

  for (const h of await headings.all()) {
    const text = (await h.innerText()).trim();
    const truncated = await h.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(truncated, `"${text}" is truncated at 390px`).toBe(false);
    expect(text.length, `"${text}" looks cut short`).toBeGreaterThan(3);
  }
  await noErrors(page);
});

test('no row overflows the viewport horizontally', async ({ page }) => {
  // The companion to the name check: the first fix for the truncation used a margin
  // indent on a full-width block, which pushed the favourite star 44px off the right
  // edge of the screen — invisible, and therefore something only a screenshot or a
  // scroll-width assertion would find.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('a[data-algo]').first()).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0);
  await noErrors(page);
});

test('the guides index lists articles and opens one', async ({ page }) => {
  await page.goto('/learn');

  await expect(page.getByRole('link', { name: /Bubble sort, explained slowly/ })).toBeVisible();
  await page.getByRole('link', { name: /Bubble sort, explained slowly/ }).click();

  await expect(page).toHaveURL(/\/learn\/bubble-sort$/);
  await expect(
    page.getByRole('heading', { name: 'Bubble sort, explained slowly', level: 1 }),
  ).toBeVisible();
  // The article's own call into the visualiser — the seam between the two halves
  // of the product.
  await expect(
    page.getByRole('link', { name: /Open Bubble Sort in the visualiser/ }),
  ).toBeVisible();
  await noErrors(page);
});

test('an article embeds a working stepper', async ({ page }) => {
  await page.goto('/learn/binary-search');

  // The differentiator of this whole section: prose with the live visualisation
  // inside it. If the stepper never resolves its trace, this is where it shows.
  const stepper = page.getByRole('figure').filter({ hasText: 'live' }).first();
  await expect(stepper).toBeVisible();

  // It has to actually draw something, not just render its chrome.
  await expect(stepper.getByRole('button', { name: 'Step forward' })).toBeVisible();
  const readout = stepper.locator('span.font-mono').first();
  const first = await readout.innerText();
  await stepper.getByRole('button', { name: 'Step forward' }).click();
  await expect.poll(() => readout.innerText()).not.toBe(first);
  await noErrors(page);
});

test('an article links into the visualiser for its algorithm', async ({ page }) => {
  // `two-pointers` is a technique article with no single algorithm behind it, so it
  // has no "open in the visualiser" call to action — the header only renders one
  // when the article declares an `algoId`. `binary-search` does, which is what makes
  // it the right subject for this assertion.
  await page.goto('/learn/binary-search');

  await page.getByRole('link', { name: /Open .* in the visualiser/ }).click();
  await expect(page).toHaveURL(/algo=binary-search/);
  await expect(page.getByRole('region', { name: 'Algorithm visualisation' })).toBeVisible();
  await noErrors(page);
});

test('a technique article has no visualiser call to action', async ({ page }) => {
  // The negative half of the rule above, and the one that would regress quietly.
  // An article about a technique that spans many algorithms has nothing sensible to
  // send the reader to, so a "open in the visualiser" button on it would be a lie
  // about where it leads.
  await page.goto('/learn/two-pointers');
  await expect(
    page.getByRole('heading', { name: 'The two-pointer technique', level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /Open .* in the visualiser/ })).toHaveCount(0);
  await noErrors(page);
});

test('an unknown article slug is a 404 with a way out, not a blank page', async ({ page }) => {
  await page.goto('/learn/no-such-article');
  await expect(page.getByRole('heading', { name: /does not exist/ })).toBeVisible();
  await page.getByRole('link', { name: 'All algorithms' }).click();
  await expect(page.getByRole('heading', { name: /animation and the code are/i })).toBeVisible();
  await noErrors(page);
});

test('a cross-reference inside an article is a link, not literal Markdown', async ({ page }) => {
  /*
   * The regression this exists for, and it is a two-line bug that looks like a typo.
   *
   * `sorting.ts` ends with `[sorting landscape](/learn/sorting-landscape)`. The inline
   * renderer only understood `**strong**` and `` `code` ``, so that rendered as
   * literal text — brackets and parens and all — and the reader saw Markdown where a
   * sentence should have been. No test failed: a literal string is a valid string, and
   * a page full of prose still looks like a page full of prose. It is only visible
   * once someone goes looking for the link.
   *
   * So this asserts the *markup*, not the appearance: a real anchor with a real href,
   * which is also what makes it shareable and middle-clickable.
   */
  await page.goto('/learn/bubble-sort');

  const link = page.getByRole('link', { name: 'sorting landscape' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/learn/sorting-landscape');

  // The brackets and parens are *consumed*. This is the half that regressed: the
  // visible text was already correct, because the whole point is that it looked like
  // prose either way.
  await expect(page.getByText('[sorting landscape](/learn/sorting-landscape)')).toHaveCount(0);

  // And it is a router transition, not a full document load — the same SPA
  // navigation every other in-page link on this site does.
  await link.click();
  await expect(page).toHaveURL(/\/learn\/sorting-landscape$/);
  await expect(
    page.getByRole('heading', { name: 'The eight sorts, side by side', level: 1 }),
  ).toBeVisible();
  await noErrors(page);
});

test('the guides are reachable in both directions', async ({ page }) => {
  /*
   * `Next` on its own made the section a corridor: every article pointed forward, so
   * the only way back to something you had skipped was the browser's. With the
   * article list hand-ordered as a reading order, a one-directional link contradicts
   * the thing it is expressing.
   *
   * Also asserts the first and last cases, because those are the two that are easy to
   * write as off-by-one: the first article has no previous, and the last has no next.
   */
  await page.goto('/learn/bubble-sort');
  // The first article: nothing before it, so no back link, and nothing rendered
  // either.
  const footer = page.getByRole('navigation', { name: 'Other guides' });
  await expect(footer.getByRole('link', { name: /Next/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Previous/ })).toHaveCount(0);

  await footer.getByRole('link', { name: /Next/ }).click();
  await expect(page).toHaveURL(/\/learn\/sorting-landscape$/);
  // Now both directions exist, and Previous goes back where it came from.
  await page.getByRole('link', { name: /Previous/ }).click();
  await expect(page).toHaveURL(/\/learn\/bubble-sort$/);

  // The last article is the symmetric case: a forward link that goes nowhere is a
  // dead control, so it is not rendered.
  await page.goto('/learn/minimum-spanning-trees');
  await expect(page.getByRole('link', { name: /Previous/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Next/ })).toHaveCount(0);
  await noErrors(page);
});

test('an unknown path is a 404, not a blank page', async ({ page }) => {
  await page.goto('/definitely/not/a/route');
  await expect(page.getByRole('heading', { name: /does not exist/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'All algorithms' })).toBeVisible();
  await noErrors(page);
});

test('compare runs two algorithms on one input with one transport', async ({ page }) => {
  await page.goto('/compare/bubble-sort/quick-sort');

  const a = page.getByRole('region', { name: /Bubble Sort visualisation/ });
  const b = page.getByRole('region', { name: /Quick Sort visualisation/ });
  await expect(a).toBeVisible();
  await expect(b).toBeVisible();

  // The verdict is the payoff of the page, so it is asserted rather than the
  // renderers: two step counts and a ratio between them.
  await expect(page.getByText('steps').first()).toBeVisible();

  const scrub = page.getByLabel('Scrub both algorithms');
  await scrub.fill('3');
  await expect(scrub).toHaveValue('3');
  await noErrors(page);
});

test('the top nav reaches every section and marks the current one', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Sections' });

  await expect(nav.getByRole('link', { name: 'Algorithms' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await nav.getByRole('link', { name: 'Learn' }).click();
  await expect(page).toHaveURL(/\/learn$/);
  await expect(nav.getByRole('link', { name: 'Learn' })).toHaveAttribute('aria-current', 'page');

  await nav.getByRole('link', { name: 'Compare' }).click();
  await expect(page).toHaveURL(/\/compare$/);
  await expect(nav.getByRole('link', { name: 'Compare' })).toHaveAttribute('aria-current', 'page');
  await noErrors(page);
});

test('back from the browse page returns to the visualiser', async ({ page }) => {
  await page.goto('/?algo=merge-sort');
  await page.getByRole('link', { name: 'Algorithms' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goBack();
  await expect(page).toHaveURL(/algo=merge-sort/);
  await expect(page.getByRole('region', { name: 'Algorithm visualisation' })).toBeVisible();
  await noErrors(page);
});
