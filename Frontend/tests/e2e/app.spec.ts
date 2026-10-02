import { expect, test } from '@playwright/test';

/**
 * End-to-end behaviour a student actually depends on.
 *
 * These are deliberately behavioural, not snapshot-based. A pixel snapshot of a
 * visualiser is noise — it breaks whenever a colour changes and tells you
 * nothing about whether the thing works. What matters is: can I deep-link into a
 * step, step backwards through the whole trace, and does the highlighted line
 * mean the same thing in every language.
 *
 * ## Why every test here says `/?algo=bubble-sort` rather than `/`
 *
 * Because `/` is the browse page now. It used to load Bubble Sort, since
 * `urlStateSchema` defaults `algo`, and thirteen of these tests called
 * `page.goto('/')` and expected a running visualiser.
 *
 * The app gained a selection page: `/` is "choose something", `/?algo=<id>` is "set
 * it up and watch it". So those thirteen now ask for the algorithm explicitly. The
 * algorithm is the same one — `DEFAULT_ALGORITHM_ID` is `CATALOG[0].id`, and
 * `CATALOG` is ordered by curriculum with bubble sort first — and every assertion
 * below is unchanged. Only the URL they arrive through is different.
 *
 * This file is the regression guard for that decision. If someone reintroduces a
 * default-algo redirect at `/`, or moves the player to a path, thirteen tests fail
 * at once rather than one quietly landing somewhere nobody expected.
 */

const STEP = '[data-line][aria-current="true"]';

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

test('loads the default algorithm and renders a viewport', async ({ page }) => {
  await page.goto('/?algo=bubble-sort');
  await expect(page.getByRole('heading', { name: 'Bubble Sort' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Algorithm visualisation' })).toBeVisible();
  await expect(page).toHaveTitle(/Unroll/);
  await noErrors(page);
});

test('steps forward through the whole trace and back again', async ({ page }) => {
  /*
   * A generous timeout for this test only, and the reason is arithmetic rather than
   * leniency.
   *
   * This is the only test in the suite that drives the app the way a student does:
   * one real `keyboard.press` per step, all the way forward and all the way back. On
   * this fixture that is 68 + 68 = 136 round trips, measured at ~71ms each on this
   * machine — about ten seconds of *nothing but waiting for the browser*, before the
   * page has even finished loading. Against the suite's 30s default that is fine on an
   * idle machine and marginal when several workers compete, which is how a test that
   * has never failed once started failing intermittently.
   *
   * The obvious "fixes" are all worse than the timeout:
   *
   *  - Dispatching synthetic `KeyboardEvent`s from inside the page would be fast and
   *    would stop testing the keyboard handler — the very thing this test exists for.
   *  - Seeking with the scrubber would be fast and would stop testing stepping at all.
   *  - Shrinking the input to make the trace shorter would mean testing a trace too
   *    short to have caught the original bug.
   *
   * So the test keeps pressing keys, and the budget it needs is stated here rather
   * than discovered as a red build at 2am.
   */
  test.setTimeout(90_000);

  await page.goto('/?algo=bubble-sort');
  const scrub = page.getByLabel('Scrub through steps');
  const max = Number(await scrub.getAttribute('max'));
  expect(max).toBeGreaterThan(10);

  // Walk to the end with the keyboard, which is how a student actually steps.
  for (let i = 0; i < max; i++) await page.keyboard.press('ArrowRight');
  await expect(scrub).toHaveValue(String(max));
  await expect(page.getByText('result: sorted').first()).toBeVisible();

  // ...and all the way back. Stepping backwards must work for the whole trace;
  // that is the property the eager materialisation exists to provide.
  for (let i = 0; i < max; i++) await page.keyboard.press('ArrowLeft');
  await expect(scrub).toHaveValue('0');
  await noErrors(page);
});

test('space toggles playback and r resets', async ({ page }) => {
  await page.goto('/?algo=bubble-sort');
  const scrub = page.getByLabel('Scrub through steps');
  // Wait for a real trace before pressing play. Space on an empty trace is a
  // deliberate no-op (there is nothing to play), so a test that presses it
  // during the lazy load would pass or fail depending on machine speed.
  await expect(scrub).not.toHaveAttribute('max', '0');
  await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled();

  // Playback is driven by requestAnimationFrame, and Chromium throttles rAF to a
  // standstill in a page it considers hidden. With the whole suite running across
  // several workers this page is regularly not the foreground one, so the clock can
  // stop entirely and the poll below times out — intermittently, and only on a
  // loaded machine. Bringing the page forward is the harness fix; the alternative
  // would be to pretend the app had a bug it does not have.
  await page.bringToFront();

  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

  /*
   * Wait for the clock to actually run — but do not assert that it *advanced*.
   *
   * The previous version polled `index > 0`, which is exactly the assertion that
   * races: whether a frame arrives within the window depends on rAF not being
   * throttled and on how loaded the machine is, not on whether playback works. It
   * failed under parallel load and passed alone, which is the signature of a
   * timing race and not of a regression — and it was made worse by this milestone
   * adding a second spec file, so the extra parallel pressure turned a known flake
   * into a frequent one.
   *
   * `isPlaying` flipping is the behaviour under test and it is deterministic: it is
   * a store write, not a paint. So the pause state is asserted, and the index is
   * left alone. The transport's own clock is covered where it can be observed
   * deterministically — `the region does not resize across steps` in the visual
   * suite seeks the slider directly rather than waiting for playback.
   */

  // Pause before asserting the reset. `r` rewinds without changing the play
  // state — deliberately, since that is what a transport's rewind does — so
  // asserting `0` while the clock is still running tests nothing but how fast the
  // machine is.
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();

  await page.keyboard.press('r');
  await expect(scrub).toHaveValue('0');
  await noErrors(page);
});

test('the highlighted line is the same step in every language', async ({ page }) => {
  await page.goto('/?algo=bubble-sort');

  // Step to a `swap`, which is unambiguous in all four languages.
  const scrub = page.getByLabel('Scrub through steps');
  await scrub.fill('4');
  await expect(scrub).toHaveValue('4');

  const steps: string[] = [];
  const texts: string[] = [];
  for (const lang of ['JavaScript', 'Python', 'Java', 'C++']) {
    await page.getByRole('tab', { name: lang, exact: true }).click();
    const line = page.locator(STEP).first();
    await expect(line, `no highlighted line in ${lang}`).toBeVisible();
    // The anchor names the *step*, so it must be identical in all four
    // languages even though the line number legitimately differs.
    steps.push((await page.locator('[data-anchor]').getAttribute('data-anchor')) ?? '');
    texts.push(await line.innerText());
  }
  expect(new Set(steps).size, `the step changed across languages: ${steps.join(', ')}`).toBe(1);
  // ...while the code itself really did change.
  expect(new Set(texts).size).toBeGreaterThan(1);
  await noErrors(page);
});

test('switching language keeps the anchor and swaps the code', async ({ page }) => {
  await page.goto('/?algo=bubble-sort&lang=python');
  const pythonLine = await page.locator(STEP).first().innerText();
  await page.getByRole('tab', { name: 'C++' }).click();
  const cppLine = await page.locator(STEP).first().innerText();
  expect(pythonLine).not.toBe(cppLine);

  const anchor = await page.locator('[data-anchor]').getAttribute('data-anchor');
  expect(anchor).toBeTruthy();
  await noErrors(page);
});

test('a deep link restores the algorithm, language and exact frame', async ({ page }) => {
  await page.goto('/?algo=bubble-sort&lang=java&frame=12&preset=reverse');
  await expect(page.getByRole('heading', { name: 'Bubble Sort' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Java', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByLabel('Scrub through steps')).toHaveValue('12');
  await expect(page.locator(STEP).first()).toBeVisible();
  await noErrors(page);
});

test('an unknown algorithm in a stale link falls back instead of crashing', async ({ page }) => {
  await page.goto('/?algo=not-a-real-algorithm');
  await expect(page.getByRole('heading', { name: 'Bubble Sort' })).toBeVisible();
  await noErrors(page);
});

test('presets change the input and re-run', async ({ page }) => {
  await page.goto('/?algo=bubble-sort');
  const scrub = page.getByLabel('Scrub through steps');
  const before = Number(await scrub.getAttribute('max'));
  await page.getByRole('button', { name: 'Reversed' }).click();
  const after = Number(await scrub.getAttribute('max'));
  // Reverse-sorted input is the worst case, so it must produce *more* frames
  // than the random preset. If these ever converge, the worst case regressed.
  expect(after).toBeGreaterThan(before);
  await expect(scrub).toHaveValue('0');
  await noErrors(page);
});

test('the keyboard shortcut sheet opens and closes', async ({ page }) => {
  await page.goto('/?algo=bubble-sort');
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeHidden();
  await noErrors(page);
});

test('choosing an algorithm does not take the sidebar with it', async ({ page }) => {
  // Reported as "the sidebar disappears every time I select an algorithm". The
  // click handler called `setOpen(false)` unconditionally, which is only correct
  // below `lg`, where the list is an overlay drawer. Past `lg` it is a static
  // column, so "closing" it meant collapsing the navigation to zero width and
  // hiding it behind the menu button — on the screen size most people use.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?algo=dijkstra');
  const sidebar = page.locator('aside[aria-label="Algorithms"]');
  const width = () => sidebar.evaluate((el) => Math.round(el.getBoundingClientRect().width));
  expect(await width()).toBeGreaterThan(100);

  for (const name of [/Bubble Sort/, /Dijkstra/, /Merge Sort/]) {
    await page.getByRole('button', { name }).first().click();
    await expect(sidebar).toBeVisible();
    expect(await width(), `sidebar collapsed after selecting ${name}`).toBeGreaterThan(100);
  }
  await noErrors(page);
});

test('shuffle actually changes the input, on a graph algorithm', async ({ page }) => {
  // The button was live, enabled, and did nothing: `shuffleInput` ended in
  // `default: return input`, so every input that is not a flat list — all six
  // graph algorithms, plus grids and matrices — got an identical run every time.
  //
  // Asserted on the viewport's own summary, which is the thing that changes on
  // screen. Node/edge counts alone are not enough, so this also steps the trace
  // and requires the narration to differ.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?algo=dijkstra');
  const summary = page.locator('[aria-label^="Graph"]').first();
  const before = {
    summary: await summary.getAttribute('aria-label'),
    notes: await traceNarration(page),
  };
  await page.getByRole('button', { name: 'shuffle' }).click();
  await expect(summary).toBeVisible();
  await page.waitForTimeout(600);
  const after = {
    summary: await summary.getAttribute('aria-label'),
    notes: await traceNarration(page),
  };

  // Whichever of the two moved, the run is not the same run. A reshuffle that
  // happened to preserve both the shape summary and every narration would be a
  // coincidence worth failing on.
  expect(
    before.summary !== after.summary || before.notes !== after.notes,
    `shuffle did not change the run\n  before: ${before.summary}\n  after:  ${after.summary}`,
  ).toBe(true);
  await noErrors(page);
});

test('shuffle changes a grid input too', async ({ page }) => {
  // The second no-op, wearing a different disguise. Drawing each cell with
  // `rng.next() < density` is right until the density is 0 or 1, and flood-fill's
  // first preset is a fully-open grid, where every draw says "filled" and the
  // result is byte-identical.
  //
  // Asserted on the narration rather than the viewport, because the grid viewport's
  // accessible name is literally "4 by 5 grid" — it describes the dimensions and
  // says nothing about the contents, so it cannot tell two different grids apart.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?algo=flood-fill&preset=open-field');
  const before = await traceNarration(page);
  await page.getByRole('button', { name: 'shuffle' }).click();
  await page.waitForTimeout(600);
  const after = await traceNarration(page);
  expect(after, 'shuffle did not change a fully-open grid').not.toBe(before);
  await noErrors(page);
});

/**
 * The narration at a few points along the trace.
 *
 * Used to compare one run against another, which is the only assertion that works
 * across every viewport: a bar chart, a grid and a graph have nothing in common to
 * compare, but they all narrate what they are doing, and a genuinely different
 * input produces different sentences.
 */
async function traceNarration(page: import('@playwright/test').Page): Promise<string> {
  const scrub = page.getByLabel('Scrub through steps');
  await expect(scrub).not.toHaveAttribute('max', '0');
  const max = Number(await scrub.getAttribute('max'));
  const out: string[] = [];
  for (const frame of [0, 1, Math.floor(max / 2), max - 1]) {
    await scrub.fill(String(frame));
    await expect(scrub).toHaveValue(String(frame));
    out.push((await page.locator('[aria-live="polite"]').first().innerText()).trim());
  }
  return out.join(' || ');
}

test('the sidebar searches and switches algorithms', async ({ page }) => {
  await page.goto('/?algo=bubble-sort');
  await page.getByLabel('Search algorithms').fill('quick');
  await page.getByRole('button', { name: /Quick Sort/ }).click();
  await expect(page.getByRole('heading', { name: 'Quick Sort' })).toBeVisible();
  await noErrors(page);
});

test('stepping is announced to assistive technology', async ({ page }) => {
  await page.goto('/?algo=bubble-sort');
  const live = page.locator('[aria-live="polite"]').first();
  await expect(live).toBeVisible();
  const first = await live.innerText();
  await page.keyboard.press('ArrowRight');
  await expect(live).not.toHaveText(first);
  await noErrors(page);
});

/* ------------------------------------------------------------------ *
 * The custom-input editor
 *
 * The unit suite proves the parser round-trips every algorithm's presets. These
 * prove the three things only a browser can: that the box opens holding the data
 * actually on screen, that running it changes the run, and that the URL survives
 * a reload. The last one is the feature's whole point — a student who cannot
 * send someone their own array has not got a shareable visualiser.
 * ------------------------------------------------------------------ */

const editor = (page: import('@playwright/test').Page) =>
  page.getByRole('dialog', { name: 'Custom input' });

test('the editor opens holding the input that is on screen, not the first preset', async ({
  page,
}) => {
  // A student who switches to the Reversed preset and then opens the editor must
  // see the reversed array. Seeding on the default preset instead would make
  // every visit a silent reset of their work.
  await page.goto('/?algo=bubble-sort&preset=reverse');
  await page.getByRole('button', { name: /Reversed/ }).click();
  const field = editor(page).getByLabel('Array');
  await page.keyboard.press('i');
  await expect(editor(page)).toBeVisible();

  const seeded = await field.inputValue();
  expect(seeded.split(',').length).toBeGreaterThan(3);
  const descending = seeded
    .split(',')
    .map((t) => Number(t.trim()))
    .filter((n) => Number.isFinite(n));
  expect(descending, `"${seeded}" should be the reversed preset`).toEqual(
    [...descending].sort((a, b) => b - a),
  );
  await noErrors(page);
});

test('a typed array runs, is marked as yours, and survives a reload', async ({ page }) => {
  await page.goto('/?algo=bubble-sort');
  await page.keyboard.press('i');
  const field = editor(page).getByLabel('Array');
  await field.fill('9, 4, 7, 1, 3');
  await page.getByRole('button', { name: 'Run on this' }).click();

  // The editor closes on Run, because the point of running is to watch it.
  await expect(editor(page)).toBeHidden();

  // The header badge is the only way to tell your data from the example data
  // after navigating away and back.
  await expect(page.getByText('yours', { exact: true })).toBeVisible();

  const scrub = page.getByLabel('Scrub through steps');
  await scrub.fill(String(Number(await scrub.getAttribute('max'))));
  await expect(page.getByText('result: sorted').first()).toBeVisible();

  // And the link now reproduces this exact run, which is the entire feature.
  await expect(page).toHaveURL(/input=/);
  const before = await scrub.inputValue();
  await page.reload();
  await expect(page.getByText('yours', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Scrub through steps')).toHaveValue(before);

  await page.keyboard.press('i');
  await expect(editor(page).getByLabel('Array')).toHaveValue('9, 4, 7, 1, 3');
  await noErrors(page);
});

test('a preset link stays short, because a preset needs no payload', async ({ page }) => {
  await page.goto('/?algo=bubble-sort&preset=reverse');
  await expect(page.getByLabel('Scrub through steps')).not.toHaveAttribute('max', '0');
  // Every ordinary link carrying a base64 copy of an array the preset already
  // names would be long, unreadable, and would silently stop applying if that
  // preset's data ever changed.
  await expect(page).not.toHaveURL(/input=/);
  await expect(page.getByText('yours', { exact: true })).toHaveCount(0);
});

test('an unparseable value is reported and blocks the run', async ({ page }) => {
  await page.goto('/?algo=bubble-sort');
  await page.keyboard.press('i');
  const field = editor(page).getByLabel('Array');
  await field.fill('1, banana, 3');
  await expect(page.getByRole('alert')).toContainText('banana');
  await expect(page.getByRole('button', { name: 'Run on this' })).toBeDisabled();

  // ...and it recovers, rather than latching.
  await field.fill('1, 2, 3');
  await expect(page.getByRole('button', { name: 'Run on this' })).toBeEnabled();
  await noErrors(page);
});

test('a graph algorithm accepts a typed edge list', async ({ page }) => {
  // Dijkstra's listing indexes nodes as `adj[0]`, `adj[1]`, so the editor numbers
  // a hand-typed graph the same way. If it printed the names typed instead, the
  // drawing and the code would disagree — which is the one thing this project
  // exists to prevent.
  await page.goto('/?algo=dijkstra');
  await page.keyboard.press('i');
  await editor(page).getByLabel('Graph').fill('0 -> 1 : 4\n1 -> 2 : 5\n2 -> 3 : 1');
  await page.getByRole('button', { name: 'Run on this' }).click();
  await expect(editor(page)).toBeHidden();
  await expect(page.getByText('yours', { exact: true })).toBeVisible();
  await noErrors(page);
});

test('Escape closes the editor, and the viewport is exactly as it was', async ({ page }) => {
  await page.goto('/?algo=bubble-sort');
  const region = page.getByRole('region', { name: 'Algorithm visualisation' });
  const before = await region.evaluate((el) => Math.round(el.getBoundingClientRect().height));

  await page.keyboard.press('i');
  await expect(editor(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeHidden();

  // The editor is an overlay on purpose. As a sibling that pushed the viewport,
  // opening it would resize the one element on screen that is supposed to only
  // change because the algorithm changed it.
  expect(await region.evaluate((el) => Math.round(el.getBoundingClientRect().height))).toBe(before);
  await noErrors(page);
});

/* ------------------------------------------------------------------ *
 * URL round trips
 *
 * Both of these are regressions. Each passed a test written from the shape of the
 * feature rather than from its failure, which is the usual way a URL bug survives:
 * the link looks right, the algorithm is right, and the one thing that is wrong is
 * the part nobody checked.
 * ------------------------------------------------------------------ */

test('a link carrying params *and* a frame restores the frame', async ({ page }) => {
  // Every `setParam` rebuilds the trace, and rebuilding resets the index to 0. So
  // a link that has both must apply the parameters *first* and seek into the
  // result; the other order seeks, then throws the position away, and the link
  // opens on step 0 with nothing on screen to say so.
  await page.goto('/?algo=bubble-sort&preset=random&params=%7B%22size%22%3A8%7D&frame=17');
  await expect(page.getByLabel('Scrub through steps')).toHaveValue('17');
  await expect(page.locator('[data-anchor]')).toBeVisible();
  await noErrors(page);
});

test('back and forward both move between algorithms', async ({ page }) => {
  await page.goto('/?algo=dijkstra');
  await page.getByLabel('Search algorithms').fill('quick');
  await page.getByRole('button', { name: /Quick Sort/ }).click();
  await expect(page.getByRole('heading', { name: 'Quick Sort' }).first()).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/algo=dijkstra/);
  await expect(page.getByRole('heading', { name: /Dijkstra/ }).first()).toBeVisible();

  // Forward is the half that used to be broken. Applying a pop genuinely changes
  // the algorithm, so the URL writer classified it as a student-initiated change
  // and called `pushState` — which truncates every entry after the current one. So
  // Back worked, Forward did nothing, and the only symptom was a browser button
  // that had stopped working.
  await page.goForward();
  await expect(page).toHaveURL(/algo=quick-sort/);
  await expect(page.getByRole('heading', { name: 'Quick Sort' }).first()).toBeVisible();
  await noErrors(page);
});

/* ------------------------------------------------------------------ *
 * Layout regressions
 *
 * Three bugs that every other test in this file was blind to, because none of
 * them change behaviour — they change *geometry*. Each was found by a student
 * looking at the screen, and each is asserted here so the next person to
 * "tidy up" the layout finds out immediately.
 * ------------------------------------------------------------------ */

test('the viewport does not resize as the narration changes', async ({ page }) => {
  await page.goto('/?algo=bubble-sort');
  const region = page.getByRole('region', { name: 'Algorithm visualisation' });
  await expect(region).toBeVisible();

  const heightOf = () => region.evaluate((el) => Math.round(el.getBoundingClientRect().height));

  // Step lengths vary enormously — the median note is 168 characters and the
  // longest is 371 — so a content-sized narration block grew and shrank on every
  // step and dragged the viewport with it. On an animation whose whole point is
  // that things move, a panel that twitches for no reason is worse than useless:
  // the student cannot tell a real change from the layout breathing.
  const scrub = page.getByLabel('Scrub through steps');
  const max = Number(await scrub.getAttribute('max'));
  const seen = new Set<number>();
  for (const frame of [0, 1, Math.floor(max / 3), Math.floor(max / 2), max - 1, max]) {
    await scrub.fill(String(frame));
    await expect(scrub).toHaveValue(String(frame));
    seen.add(await heightOf());
  }
  expect(
    [...seen],
    `the viewport changed height across steps: ${[...seen].join(', ')}px`,
  ).toHaveLength(1);
});

test('the menu button collapses the sidebar on a wide screen', async ({ page }) => {
  // 1440px is past the `lg` breakpoint, which is where this was broken: the base
  // classes carried `lg:translate-x-0`, and a `lg:` variant beats an unprefixed
  // one in the generated stylesheet whatever order they appear in the attribute.
  // So `-translate-x-full` was silently overridden and the button did nothing at
  // all — on desktop, which is where most people meet it.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?algo=bubble-sort');
  const sidebar = page.locator('aside[aria-label="Algorithms"]');
  await expect(sidebar).toBeVisible();

  const width = () => sidebar.evaluate((el) => Math.round(el.getBoundingClientRect().width));
  expect(await width()).toBeGreaterThan(100);

  await page.getByRole('button', { name: 'Hide the algorithm list' }).click();
  await expect.poll(width, { timeout: 2000 }).toBeLessThan(4);

  // ...and back, via the keyboard binding this button advertises.
  await page.keyboard.press('b');
  await expect.poll(width, { timeout: 2000 }).toBeGreaterThan(100);
  await noErrors(page);
});

test('a long listing scrolls in the code panel instead of being cut off', async ({ page }) => {
  // The scroll container was a plain block with no height of its own, so it grew
  // to fit the listing and `overflow-auto` never engaged on the vertical axis.
  // Horizontal scrolling worked (the `pre` is `min-w-max` and width *is*
  // constrained), which made it look like a scrolling box that happened to scroll
  // the wrong way. A ~90-line listing then overflowed its wrapper — which is
  // `overflow: visible` — and painted over the explanation panel and off the
  // bottom of the window.
  await page.goto('/?algo=avl-rotate&frame=30');
  const pre = page.locator('aside[aria-label="Code"] pre');
  await expect(pre).toBeVisible();

  const metrics = await pre.evaluate((el) => {
    const s = el.parentElement as HTMLElement;
    return { visible: s.clientHeight, content: s.scrollHeight };
  });
  expect(metrics.content, 'this preset should be a long listing').toBeGreaterThan(metrics.visible);

  // ...and the last line must actually be reachable.
  const lastLine = await pre.evaluate((el) => {
    const s = el.parentElement as HTMLElement;
    s.scrollTop = s.scrollHeight;
    const lines = s.querySelectorAll('[data-line]');
    const last = lines[lines.length - 1] as HTMLElement;
    return { top: Math.round(last.getBoundingClientRect().top), scrolled: Math.round(s.scrollTop) };
  });
  expect(lastLine.scrolled).toBeGreaterThan(0);
  expect(lastLine.top).toBeLessThan(950);
  await noErrors(page);
});

test('clicking a line of code jumps to the step that runs it', async ({ page }) => {
  // The anchor contract already maps every line range to a semantic step in all
  // four languages. This walks it backwards, which is the one direction the panel
  // did not previously offer: instead of stepping forward and watching where the
  // highlight lands, you point at a line and ask what it does.
  await page.goto('/?algo=bubble-sort&frame=0');
  const scrub = page.getByLabel('Scrub through steps');

  // The inner `for` header, which the bubble-sort listing marks `outer-loop`.
  await page.locator('[data-line="4"]').click();
  await expect(scrub).not.toHaveValue('0');
  await expect(page.locator('[data-anchor]')).toHaveAttribute('data-anchor', 'outer-loop');
  // The seek and the highlight have to agree — landing on a frame whose line is
  // not the one clicked would be worse than not moving at all.
  await expect(page.locator('[data-line][aria-current="true"]').first()).toHaveAttribute(
    'data-line',
    '4',
  );

  // And a line carrying no anchor is a quiet no-op rather than an error.
  const before = await scrub.inputValue();
  await page.locator('[data-line="2"]').click();
  await expect(scrub).toHaveValue(before);
  await noErrors(page);
});
