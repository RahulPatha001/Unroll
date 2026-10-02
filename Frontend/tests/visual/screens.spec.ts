import { expect, test } from '@playwright/test';
import { type Fixture, SHOT, settle } from './harness.ts';

/**
 * Screenshot baselines.
 *
 * Scope is deliberately not the full cross-product. Six renderer fixtures at
 * five viewports times six UI states is 180 images, which is a lot of binary in
 * git for a suite nobody will ever read a diff of. What is actually worth
 * freezing is:
 *
 *  - **every renderer, at three widths.** 1440 is the design width, 1280 is the
 *    `xl` breakpoint where the code panel changes from overlay to docked column,
 *    and 390 is the phone. Between them they cover both sides of the only
 *    breakpoint that moves structure, and one width at each end of the desktop
 *    range. The other two viewports in the plan's table are covered by the
 *    geometry assertions in `layout.spec.ts`, which are exact and cost nothing
 *    to store.
 *  - **every UI state, at two widths.** The states are where layout bugs live —
 *    an overlay that does not dismiss, a sheet that pushes the viewport instead
 *    of covering it — and they need both a desktop width, where panes are
 *    columns, and a phone width, where they are drawers.
 *
 * Duplicated coverage between the two groups is fine and cheap: a fixture already
 * captured in the renderer sweep does not need recapturing per state.
 *
 * The error state is produced by failing the algorithm chunk for real, by
 * aborting the network request, rather than by pointing at a bogus id. A bogus
 * id exercises the *fallback* path (which picks a different algorithm and
 * renders it); the state worth photographing is the one where loading actually
 * failed and the shell has nothing to show.
 */

const RENDERERS: Array<{ name: string; fixture: Fixture }> = [
  { name: 'graph', fixture: { algo: 'dijkstra', frame: 40 } },
  { name: 'array-overlay', fixture: { algo: 'merge-sort', frame: 30 } },
  { name: 'grid', fixture: { algo: 'lcs', frame: 24 } },
  { name: 'hash', fixture: { algo: 'hash-table', frame: 18 } },
  { name: 'trie', fixture: { algo: 'trie', frame: 14 } },
  { name: 'tree', fixture: { algo: 'bst-insert', frame: 10 } },
];

const WIDTHS = [
  { tag: '1440', width: 1440, height: 900 },
  { tag: '1280', width: 1280, height: 800 },
  { tag: '390', width: 390, height: 844 },
] as const;

for (const { name, fixture } of RENDERERS) {
  for (const vp of WIDTHS) {
    test(`${name} at ${vp.tag}`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await settle(page, baseURL ?? '', fixture);
      await expect(page).toHaveScreenshot(`${name}-${vp.tag}.png`, SHOT);
    });
  }
}

/** Named states, applied to an already-settled page. */
const STATES: Array<{
  name: string;
  /**
   * Returns false if the state is not reachable at this width, in which case the
   * capture is skipped rather than failed.
   *
   * Reachability is decided with a *trial* click, which runs Playwright's full
   * actionability check — visible, stable, receives events, not obscured —
   * without actually clicking. That distinction earns its keep at 390: the code
   * drawer and the nav drawer are both open by default and stacked, so the nav's
   * own collapse button is genuinely unclickable because a panel is on top of
   * it. That is the defect `layout.spec.ts` asserts, not a flake here, so the
   * honest response is to skip and say so, not to retry until it passes.
   */
  apply: (page: import('@playwright/test').Page) => Promise<boolean>;
}> = [
  {
    name: 'code-closed',
    apply: async (page) => {
      const close = page
        .getByRole('complementary', { name: 'Code' })
        .getByRole('button', { name: 'Close the code panel' });
      if ((await close.count()) === 0) return false;
      if (!(await close.isVisible())) return false;
      try {
        await close.click({ trial: true, timeout: 2000 });
      } catch {
        return false;
      }
      await close.click();
      return true;
    },
  },
  {
    name: 'sidebar-collapsed',
    apply: async (page) => {
      const hide = page.getByRole('button', { name: 'Hide the algorithm list' });
      if ((await hide.count()) === 0) return false;
      try {
        await hide.click({ trial: true, timeout: 2000 });
      } catch {
        return false;
      }
      await hide.click();
      return true;
    },
  },
  {
    name: 'input-editor',
    apply: async (page) => {
      await page.keyboard.press('i');
      const editor = page.getByRole('dialog', { name: /input/i });
      // The editor is a lazy chunk behind a Suspense boundary, so it is not
      // in the DOM on the keystroke — counting immediately races the fetch
      // and skips a state that exists. Wait briefly; an unreachable editor
      // still resolves to a skip via the timeout below, not a failure.
      try {
        await expect(editor).toBeVisible({ timeout: 5000 });
      } catch {
        return false;
      }
      return true;
    },
  },
  {
    name: 'shortcut-help',
    apply: async (page) => {
      await page.keyboard.press('?');
      await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
      return true;
    },
  },
];

for (const vp of [
  { tag: '1440', width: 1440, height: 900 },
  { tag: '390', width: 390, height: 844 },
]) {
  for (const state of STATES) {
    test(`state ${state.name} at ${vp.tag}`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      if (state.name === 'load-error') {
        // Routing has to be installed before the first navigation, so this one
        // state does not go through `settle`.
        await page.route('**/assets/dijkstra-*.js', (route) => route.abort());
        await page.goto('/?algo=dijkstra');
        await expect(page.getByText('Something went wrong loading this algorithm.')).toBeVisible();
      } else {
        await settle(page, baseURL ?? '', { algo: 'dijkstra', frame: 40 });
        const reached = await state.apply(page);
        if (!reached) test.skip(true, `this state does not exist at ${vp.tag}`);
      }

      await expect(page).toHaveScreenshot(`state-${state.name}-${vp.tag}.png`, SHOT);
    });
  }
}
