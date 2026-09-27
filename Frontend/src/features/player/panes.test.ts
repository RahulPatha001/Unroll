import { describe, expect, it } from 'vitest';
import {
  type DockedFn,
  initialPaneFlags,
  isDocked,
  reconcileForWidth,
  reconcilePanes,
} from './panes.ts';

/**
 * The "at most one drawer" rule.
 *
 * Tested as a pure function with the viewport injected, because the bug this
 * fixes was never a CSS bug — it was two booleans that could both be `true`.
 * A rule that lives only in a media query cannot be unit tested, and a rule that
 * cannot be unit tested is a rule that comes back.
 */

const NOTHING_DOCKED: DockedFn = () => false;
const EVERYTHING_DOCKED: DockedFn = () => true;
/** The real desktop case: nav is a column from 1024, code from 1280. */
const DESKTOP: DockedFn = (pane) => pane === 'nav' || pane === 'code';
/** 1024-1279: the nav is a column but the code panel is still a drawer. */
const TABLET: DockedFn = (pane) => pane === 'nav';

const CLOSED = { sidebarOpen: false, codeOpen: false, inputOpen: false };
const ALL_OPEN = { sidebarOpen: true, codeOpen: true, inputOpen: true };

describe('reconcilePanes', () => {
  it('opening a drawer closes every other drawer', () => {
    // The bug, stated as a test. Both drawers open on a phone is unreachable.
    const after = reconcilePanes(
      { sidebarOpen: true, codeOpen: true, inputOpen: false },
      'code',
      true,
      NOTHING_DOCKED,
    );
    expect(after).toEqual({ sidebarOpen: false, codeOpen: true, inputOpen: false });
  });

  it('opening the nav drawer closes an open code drawer', () => {
    const after = reconcilePanes(
      { sidebarOpen: false, codeOpen: true, inputOpen: false },
      'nav',
      true,
      NOTHING_DOCKED,
    );
    expect(after.sidebarOpen).toBe(true);
    expect(after.codeOpen).toBe(false);
  });

  it('opening the input sheet closes both drawers', () => {
    const after = reconcilePanes(
      { sidebarOpen: true, codeOpen: true, inputOpen: false },
      'input',
      true,
      NOTHING_DOCKED,
    );
    expect(after).toEqual({ sidebarOpen: false, codeOpen: false, inputOpen: true });
  });

  it('leaves a docked column alone when a drawer opens over it', () => {
    // 1024-1279. The nav is a real column and must survive opening the code
    // drawer. A naive "close everything else" would break this, which is why the
    // rule is about *drawers* and not about panes.
    const after = reconcilePanes(
      { sidebarOpen: true, codeOpen: false, inputOpen: false },
      'code',
      true,
      TABLET,
    );
    expect(after).toEqual({ sidebarOpen: true, codeOpen: true, inputOpen: false });
  });

  it('opening a column leaves every other pane exactly as it was', () => {
    // Not "opening a column opens the other column too". The rule is about
    // *drawers*, not about panes: a student who closed the nav column must not
    // have it reopened because they later opened the code panel. Two columns
    // being simultaneously open is legal and intended (that is the desktop
    // layout, asserted in `reconcileForWidth`), but nothing here *causes* it.
    const after = reconcilePanes(CLOSED, 'code', true, DESKTOP);
    expect(after.sidebarOpen).toBe(false);
    expect(after.codeOpen).toBe(true);
  });

  it('enforces the invariant even when the target is a column', () => {
    // 1024-1279: nav is a column, code is a drawer. A state with the code drawer
    // and the input sheet open already has two drawers, and opening the nav
    // column — an action that changes nothing about either — must not carry that
    // violation forward.
    const stranded = { sidebarOpen: false, codeOpen: true, inputOpen: true };
    const after = reconcilePanes(stranded, 'nav', true, TABLET);
    expect(after.sidebarOpen).toBe(true);
    expect(after.codeOpen).toBe(false);
    expect(after.inputOpen).toBe(false);
  });

  it('opening a column does not close a drawer that was already open', () => {
    const after = reconcilePanes(
      { sidebarOpen: false, codeOpen: true, inputOpen: false },
      'nav',
      true,
      DESKTOP,
    );
    expect(after.sidebarOpen).toBe(true);
    expect(after.codeOpen).toBe(true);
  });

  it('closing one pane never touches another', () => {
    const after = reconcilePanes(ALL_OPEN, 'code', false, DESKTOP);
    expect(after).toEqual({ sidebarOpen: true, codeOpen: false, inputOpen: true });
  });

  it('is idempotent, so a double click cannot produce a different state', () => {
    const once = reconcilePanes(ALL_OPEN, 'nav', true, NOTHING_DOCKED);
    const twice = reconcilePanes(once, 'nav', true, NOTHING_DOCKED);
    expect(twice).toEqual(once);
  });

  it('never leaves two drawers open, from any starting state', () => {
    // Exhaustive rather than exemplary: the rule is small enough to enumerate,
    // and an exhaustive check is the only thing that actually proves a
    // combinatorial invariant.
    const flags = [false, true];
    for (const sidebarOpen of flags) {
      for (const codeOpen of flags) {
        for (const inputOpen of flags) {
          for (const target of ['nav', 'code', 'input'] as const) {
            for (const docked of [NOTHING_DOCKED, TABLET, DESKTOP, EVERYTHING_DOCKED]) {
              const start = { sidebarOpen, codeOpen, inputOpen };
              const after = reconcilePanes(start, target, true, docked);
              const drawers = (
                [
                  ['nav', after.sidebarOpen],
                  ['code', after.codeOpen],
                  ['input', after.inputOpen],
                ] as const
              ).filter(([pane, open]) => open && !docked(pane));
              expect(
                drawers.length,
                `${JSON.stringify(start)} + open ${target} @ ${docked('nav') ? 'nav-docked' : 'nav-drawer'} left ${drawers.length} drawers`,
              ).toBeLessThanOrEqual(1);
              // The pane asked for is always open.
              expect(
                after[
                  target === 'nav' ? 'sidebarOpen' : target === 'code' ? 'codeOpen' : 'inputOpen'
                ],
              ).toBe(true);
            }
          }
        }
      }
    }
  });
});

describe('initialPaneFlags', () => {
  it('opens nothing on a phone, so a visitor lands on the algorithm', () => {
    expect(initialPaneFlags(NOTHING_DOCKED)).toEqual(CLOSED);
  });

  it('opens both columns on a desktop, which is unchanged behaviour', () => {
    expect(initialPaneFlags(DESKTOP)).toEqual({
      sidebarOpen: true,
      codeOpen: true,
      inputOpen: false,
    });
  });

  it('opens only the nav column in the 1024-1279 band', () => {
    expect(initialPaneFlags(TABLET)).toEqual({
      sidebarOpen: true,
      codeOpen: false,
      inputOpen: false,
    });
  });
});

describe('reconcileForWidth', () => {
  it('closes the extra drawer when a resize strands two of them', () => {
    // The store enforces the rule on user action, but a resize is not an action
    // on a pane. Without this, opening both on a desktop and then dragging the
    // window narrow would produce exactly the stacked-drawers state the store
    // exists to prevent.
    const after = reconcileForWidth(ALL_OPEN, NOTHING_DOCKED);
    expect(after).toEqual({ sidebarOpen: true, codeOpen: false, inputOpen: false });
  });

  it('is a no-op when one or fewer drawers are open', () => {
    expect(reconcileForWidth(CLOSED, NOTHING_DOCKED)).toBe(CLOSED);
    const one = { sidebarOpen: false, codeOpen: true, inputOpen: false };
    expect(reconcileForWidth(one, NOTHING_DOCKED)).toBe(one);
  });

  it('leaves two columns alone, because that is the desktop layout', () => {
    const both = { sidebarOpen: true, codeOpen: true, inputOpen: false };
    expect(reconcileForWidth(both, DESKTOP)).toBe(both);
  });

  it('counts the input sheet as a drawer even at desktop width', () => {
    // `isDocked('input')` is false at every width by design, and a test that
    // only ever passed DESKTOP would not notice if that changed — the guard for
    // "assume a desktop" in Node sits in the same function.
    expect(isDocked('input')).toBe(false);

    // At desktop width the nav and the code panel are both columns, so the open
    // input sheet is the *only* drawer and the state is already legal. It must
    // survive, not be closed for being a drawer.
    const after = reconcileForWidth(
      { sidebarOpen: true, codeOpen: true, inputOpen: true },
      DESKTOP,
    );
    expect(after.inputOpen).toBe(true);

    // Narrow to a phone, where all three are drawers: one must go, and nav wins
    // because ALL_PANES order is nav, code, input.
    const narrow = reconcileForWidth(
      { sidebarOpen: true, codeOpen: true, inputOpen: true },
      NOTHING_DOCKED,
    );
    expect(narrow).toEqual({ sidebarOpen: true, codeOpen: false, inputOpen: false });
  });
});
