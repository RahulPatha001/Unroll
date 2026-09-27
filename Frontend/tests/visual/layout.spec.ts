import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { type Fixture, settle } from './harness.ts';

/**
 * Geometry baselines.
 *
 * This is the half of Phase 0 that a screenshot cannot do. A pixel diff answers
 * "does this look the same"; it cannot answer "did anything move", because a
 * 2px reflow of the narration card is a handful of antialiased pixels against a
 * tolerance chosen to absorb font-rendering differences, and it scores as a
 * pass. The plan is explicit that a 2px reflow is *the* regression this phase
 * exists to catch, so it needs a measurement that cannot be absorbed.
 *
 * So: bounding boxes, in JSON, compared numerically. A shift shows up as a diff
 * in a data file, which is reviewable in the pull request — you can see that the
 * header went from 281px to 77px without opening a single image.
 *
 * Updating is `npm run snapshots:update`, the same command that refreshes the
 * screenshots. Both write through the *same* measuring code that does the
 * comparing, because a separate generator script is a second implementation
 * that silently drifts from the first.
 *
 * Two kinds of assertion live here, and the difference matters:
 *
 *  - **Baselines** pin the geometry as it is today, warts included. A change is
 *    by definition a regression, and the diff is reviewable as data.
 *  - **Invariants** state properties that must hold at every viewport. These are
 *    the ones that actually caught the layout defects, because a defect is a
 *    relationship between two measurements, and a single pinned number cannot
 *    express a relationship.
 */

const BASELINE = join(dirname(fileURLToPath(import.meta.url)), '__baselines__', 'layout.json');
const UPDATING = Boolean(process.env.UPDATE_LAYOUT);

interface Reading {
  header: number;
  narration: number;
  region: number;
  transport: number;
  viewportWidth: number;
  documentScrollWidth: number;
}

function readBaseline(): { readings?: Record<string, Reading> } | null {
  if (!existsSync(BASELINE)) return null;
  return JSON.parse(readFileSync(BASELINE, 'utf8'));
}

const existing = readBaseline();
if (!existing && !UPDATING) {
  throw new Error(
    `No geometry baseline at ${BASELINE}. Run \`npm run snapshots:update\` to create one.`,
  );
}

/**
 * The four boxes whose heights the layout is actually made of.
 *
 * Measured through `getBoundingClientRect` on the same elements the e2e suite
 * already treats as canonical — the `Algorithm visualisation` region by
 * accessible name, the narration card by its `h-[104px]` box — so this file and
 * `tests/e2e/app.spec.ts` cannot disagree about what "the narration card" is.
 */
async function measure(page: import('@playwright/test').Page): Promise<Reading> {
  return page.evaluate(() => {
    const height = (el: Element | null | undefined) =>
      el ? Math.round(el.getBoundingClientRect().height) : -1;

    const main = document.querySelector('main');
    const region = document.querySelector('section[aria-label="Algorithm visualisation"]');
    const narrationCard = document.querySelector('.h-\\[104px\\]');

    /*
     * The player's own wrapper, addressed structurally rather than by
     * sibling-offset. It is the second child of `main` (after the header) and
     * has exactly three children, in this order:
     *
     *     <StepNarration/>  the narration card
     *     <div class="p-3"> the padding wrapper around the region
     *     <Transport/>      the transport bar
     *
     * Walking to a fixed offset from the narration card is how the transport
     * got measured as 415px — that is the padding wrapper (391 + 24), one step
     * short. Nothing failed; the number was simply the wrong box, and a
     * geometry baseline that pins the wrong box is worse than none, because it
     * looks authoritative.
     */
    const player = main?.children[1] ?? null;
    const padWrap = region?.parentElement ?? null;
    const narrationRoot =
      [...(player?.children ?? [])].find((c) => c.contains(narrationCard)) ?? null;
    const transport =
      [...(player?.children ?? [])].find((c) => c !== narrationRoot && c !== padWrap) ?? null;

    return {
      header: height(main?.firstElementChild),
      narration: height(narrationCard),
      region: height(region),
      transport: height(transport),
      viewportWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
    };
  });
}

/** Viewports from the plan's diagnosis table. */
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
] as const;

/** Two fixtures, deliberately: a graph and the array default. */
const FIXTURES: Array<{ name: string; fixture: Fixture }> = [
  { name: 'dijkstra', fixture: { algo: 'dijkstra', frame: 12 } },
  { name: 'bubble-sort', fixture: { algo: 'bubble-sort', frame: 12 } },
];

test.describe('geometry baselines', () => {
  test('the four boxes are where they were', async ({ page, baseURL }) => {
    const readings: Record<string, Reading> = {};

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const { name, fixture } of FIXTURES) {
        // Geometry does not depend on token colours, so do not wait on Shiki
        // here — that would make this file as slow as the screenshot suite for
        // no benefit.
        await settle(page, baseURL ?? '', fixture, { highlight: 'any' });
        readings[`${name}@${viewport.width}x${viewport.height}`] = await measure(page);
      }
    }

    if (UPDATING) {
      const previous = existing?.readings ?? {};
      for (const [key, reading] of Object.entries(readings)) {
        const before = previous[key];
        if (before && JSON.stringify(before) !== JSON.stringify(reading)) {
          console.log(
            `  layout ${key}: ` +
              `${before.header}/${before.narration}/${before.region}/${before.transport}` +
              ` -> ${reading.header}/${reading.narration}/${reading.region}/${reading.transport}`,
          );
        }
      }
      mkdirSync(dirname(BASELINE), { recursive: true });
      writeFileSync(BASELINE, `${JSON.stringify({ readings }, null, 2)}\n`);
      test.skip(true, 'baselines updated');
      return;
    }

    expect(readings).toEqual(existing?.readings);
  });
});

test.describe('invariants that hold at every viewport', () => {
  for (const viewport of VIEWPORTS) {
    test(`the narration card is 104px tall at ${viewport.width}`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await settle(page, baseURL ?? '', { algo: 'bubble-sort', frame: 12 }, { highlight: 'any' });
      expect((await measure(page)).narration, 'the narration card is a fixed-height box').toBe(104);
    });

    test(`nothing overflows horizontally at ${viewport.width}`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await settle(page, baseURL ?? '', { algo: 'dijkstra', frame: 12 }, { highlight: 'any' });
      const reading = await measure(page);
      expect(
        reading.documentScrollWidth,
        'the document is exactly as wide as the window — no sideways scroll',
      ).toBeLessThanOrEqual(reading.viewportWidth);
    });
  }
});

/** Open `fixed` panes. A docked column is not an overlay — see below. */
async function openOverlays(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => {
    const overlays: string[] = [];
    for (const label of ['Algorithms', 'Code']) {
      const el = document.querySelector(`aside[aria-label="${label}"]`);
      if (!el) continue;
      // At >= 1280 nav and code are *both* meant to be visible at once; that is
      // the product claim, not a violation. Only a `fixed` pane that is actually
      // on screen counts as an overlay.
      if (getComputedStyle(el).position !== 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.right > 0 && r.left < window.innerWidth) overlays.push(label);
    }
    return overlays;
  });
}

test.describe('a visitor arrives at the algorithm, not at a menu', () => {
  /*
   * Both of these failed before, at 1024 and at 390. The store initialised
   * `sidebarOpen: true, codeOpen: true` as two independent booleans, so a phone
   * visitor got a 288px nav drawer, a 359px code drawer, a scrim, a 403px header
   * and a 214px visualisation all at once, with the header, narration, viewport
   * and transport behind them.
   *
   * Fixed by the pane model: a pane starts open only where it is a *column*, and
   * every mutation goes through a rule that allows at most one drawer. On a
   * desktop both columns still start open, so this costs the desktop nothing.
   */
  for (const viewport of VIEWPORTS) {
    test(`no drawer is open on arrival at ${viewport.width}`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await settle(page, baseURL ?? '', { algo: 'dijkstra', frame: 12 }, { highlight: 'any' });
      const open = await openOverlays(page);
      expect(open, `open overlays: ${open.join(' + ') || 'none'}`).toHaveLength(0);
    });

    test(`opening one drawer closes the other at ${viewport.width}`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await settle(page, baseURL ?? '', { algo: 'dijkstra', frame: 12 }, { highlight: 'any' });

      /*
       * The expected count is not hardcoded, because the same button opens a
       * *column* at some widths and a *drawer* at others: "code" is a docked
       * column at >= 1280 and a drawer below it, and the nav is the mirror image
       * at 1024. Hardcoding `1` failed at 1280, 1440 and 1920 — the click was
       * correct there and the assertion was not.
       *
       * So the test asks the DOM what it just opened. If the pane it clicked is
       * `position: fixed` it is a drawer and exactly one overlay must be open;
       * if it is `static` it is a column and there must be none. That keeps the
       * breakpoints in one place — `panes.ts` and the `lg:`/`xl:` class names —
       * rather than duplicating them here where they would rot.
       */
      const TARGETS = [
        { button: 'Show the algorithm list', pane: 'Algorithms' },
        { button: 'code', pane: 'Code' },
      ];

      for (const { button: name, pane } of TARGETS) {
        const button = page.getByRole('button', { name });
        if (!(await button.isVisible().catch(() => false))) continue;
        await button.click();
        await page.waitForTimeout(350);

        const { isDrawer, open } = await page.evaluate((label) => {
          const overlays: string[] = [];
          for (const other of ['Algorithms', 'Code']) {
            const el = document.querySelector(`aside[aria-label="${other}"]`);
            if (!el) continue;
            if (getComputedStyle(el).position !== 'fixed') continue;
            const r = el.getBoundingClientRect();
            if (r.right > 0 && r.left < window.innerWidth) overlays.push(other);
          }
          const target = document.querySelector(`aside[aria-label="${label}"]`);
          return {
            isDrawer: target ? getComputedStyle(target).position === 'fixed' : false,
            open: overlays,
          };
        }, pane);

        expect(
          open,
          `after clicking "${name}" at ${viewport.width}: the ${pane} pane is a ` +
            `${isDrawer ? 'drawer' : 'column'}, so expected ${isDrawer ? 1 : 0} open, ` +
            `got [${open.join(' + ') || 'none'}]`,
        ).toHaveLength(isDrawer ? 1 : 0);
      }
    });
  }
});

test.describe('the header does not resize with the window', () => {
  /*
   * This failed before, and worse than a five-row table suggests, because it was
   * not monotonic. The header used to oscillate across the desktop range rather
   * than growing as the window narrowed:
   *
   *     1024 -> 265    1200 -> 236    1320 -> 281    1536 -> 265
   *     1100 -> 265    1280 -> 315    1440 -> 281    1920 -> 236
   *
   * so 1200 was *shorter* than 1440, and 1280 was the tallest point in the range.
   * A pair of assertions at 1280 and 1440 alone would not have caught that,
   * which is why this sweeps the band.
   *
   * It took three fixes, and each one only moved the problem somewhere else —
   * which is the argument for sweeping a range rather than spot-checking two
   * widths:
   *
   *  1. The complexity row used `flex-wrap`, and wrapped at some widths.
   *  2. `flex-nowrap` + `overflow-x: auto` moved the non-determinism to the
   *     *scrollbar*, which takes layout space and so appeared only when the
   *     toolbar overflowed — which depended on whether the code panel was a
   *     docked column taking 461px. `scroll-fade-x` scrolls without a line.
   *  3. Even then each parameter label could still shrink, and a flex row that
   *     can shrink wraps rather than overflow, so a label wrapped to two or three
   *     lines inside its own box: 36px, 46px, 63px, 79px for one algorithm as
   *     the window narrowed. `shrink-0 whitespace-nowrap` closed it.
   *
   * Several algorithms are checked, because the third cause was per-algorithm:
   * `lcs` and `trie` have long parameter labels and were the worst offenders,
   * while `bubble-sort` and `merge-sort` were accidentally already constant and
   * would have sailed through a one-algorithm sweep.
   */
  const ALGOS = ['dijkstra', 'bubble-sort', 'lcs', 'trie', 'hash-table', 'avl-rotate'];
  const WIDTHS = [1024, 1100, 1200, 1280, 1320, 1440, 1536, 1600, 1920, 2560];

  for (const algo of ALGOS) {
    test(`header height is constant across 1024-2560 for ${algo}`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width: 1920, height: 900 });
      await settle(page, baseURL ?? '', { algo, frame: 12 }, { highlight: 'any' });

      const heights: number[] = [];
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        // A resize reflows synchronously, but the chips and disclosure settle on
        // the next frame; a double rAF is enough and keeps this honest.
        await page.evaluate(
          () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
        );
        heights.push((await measure(page)).header);
      }

      expect(
        [...new Set(heights)],
        `${algo} header height varied across 1024-2560: ${heights.join(', ')}px`,
      ).toHaveLength(1);
    });
  }
});

test.describe('the visualisation only changes because the algorithm changed it', () => {
  /*
   * The project's own principle, and the reason the detail panel is an overlay
   * rather than an inline expansion. Opening a disclosure that pushed the page
   * down would be the same class of bug as the input editor: one element on
   * screen is supposed to only ever change because the algorithm changed it.
   */
  test('opening the detail panel resizes nothing', async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await settle(page, baseURL ?? '', { algo: 'dijkstra', frame: 12 }, { highlight: 'any' });

    const before = await measure(page);
    await page.getByRole('button', { name: 'details' }).click();
    await expect(page.locator('#algorithm-detail')).toBeVisible();
    const after = await measure(page);

    expect(after.header, 'the header grew to fit the panel').toBe(before.header);
    expect(after.region, 'the panel pushed the visualisation down').toBe(before.region);
    expect(after.narration).toBe(before.narration);
  });

  test('the region does not resize across steps', async ({ page, baseURL }) => {
    // Also covered by the e2e suite at one viewport; repeated here because the
    // geometry file is the one that gets run when a layout change lands.
    await page.setViewportSize({ width: 1440, height: 900 });
    await settle(page, baseURL ?? '', { algo: 'bubble-sort', frame: 0 }, { highlight: 'any' });

    const scrub = page.getByLabel('Scrub through steps');
    const max = Number(await scrub.getAttribute('max'));
    const seen = new Set<number>();
    for (const frame of [0, 1, Math.floor(max / 3), Math.floor(max / 2), max - 1, max]) {
      await scrub.fill(String(frame));
      await expect(scrub).toHaveValue(String(frame));
      seen.add((await measure(page)).region);
    }
    expect(
      [...seen],
      `the region changed height across steps: ${[...seen].join(', ')}px`,
    ).toHaveLength(1);
  });
});
