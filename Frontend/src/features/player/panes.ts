/**
 * Panes: what is a column and what is a drawer.
 *
 * ## Why this file exists
 *
 * The layout used to be two independent booleans, `sidebarOpen` and `codeOpen`,
 * both initialised `true`. That is not a styling problem and no amount of CSS
 * fixes it: below `xl` the code panel becomes a `fixed` drawer while the
 * sidebar is still a column, so the store said "both open" and the DOM said
 * "one column and one drawer on top of it". Measured, at 390x844: a 288px nav
 * drawer, a 359px code drawer, a scrim, a 403px header and a 214px
 * visualisation, all on a 390px screen. The header, the narration, the viewport
 * and the transport were all unreachable.
 *
 * A single `Overlay = 'none' | 'nav' | 'code' | 'input'` union — the obvious
 * fix — is *also* wrong, and wrong in the direction that breaks the product. It
 * can only ever describe one visible pane, but at 1280px and above the nav and
 * the code panel are **both** meant to be visible at once. That is the product
 * claim: the animation and the code are the same program, so hiding one behind
 * a toggle would quietly contradict it. A type that cannot express "two panes
 * visible" will get "two panes visible" deleted to make the type compile.
 *
 * So the distinction that matters is not *which* pane is open. It is **whether a
 * pane is a column or a drawer**, and the rule is:
 *
 * > At most one pane may be a drawer at a time. Any number may be columns.
 *
 * `reconcilePanes` below is that rule, as a pure function.
 */

/** The three things that can cover or divide the page. */
export type Pane = 'nav' | 'code' | 'input';

/**
 * The width at which each pane stops being a drawer and becomes a column.
 *
 * These are Tailwind's `lg` and `xl`, and they are spelled out here rather than
 * derived, because they now have to agree with class names in three different
 * components and there is nothing but this comment and a test keeping them in
 * step. `App.tsx`, `Sidebar.tsx` and `LessonHeader.tsx` all carry `lg:`/`xl:`
 * variants for the same two thresholds.
 */
export const NAV_DOCKED_QUERY = '(min-width: 1024px)';
export const CODE_DOCKED_QUERY = '(min-width: 1280px)';

export interface PaneFlags {
  sidebarOpen: boolean;
  codeOpen: boolean;
  inputOpen: boolean;
}

/** Injected so the rule below is testable without a DOM. */
export type DockedFn = (pane: Pane) => boolean;

/**
 * Is this pane a column at the current width?
 *
 * A `matchMedia` per call rather than a cached listener: it is called on user
 * action, not per frame, and a stale cache is a layout bug that reproduces only
 * on some machines. `window` is guarded because the store is imported by unit
 * tests running in plain Node, where the honest answer is "assume a desktop",
 * which is also what makes those tests independent of viewport.
 */
export function isDocked(pane: Pane): boolean {
  const query = pane === 'nav' ? NAV_DOCKED_QUERY : pane === 'code' ? CODE_DOCKED_QUERY : null;
  /*
   * The input editor is never a column. It is a sheet over the visualisation at
   * every width, because there is no width at which "edit your own input" and
   * "watch the algorithm" can usefully share the screen.
   *
   * Checked *before* the `window` guard, not after. The guard's answer is
   * "assume a desktop", and assuming a desktop for the input sheet would report
   * it as a column — which is how a test running in Node can disagree with the
   * browser about whether the sheet is a drawer.
   */
  if (query === null) return false;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia(query).matches;
}

/** `isDocked`, curried, for passing to `reconcilePanes`. */
export const dockedFn: DockedFn = isDocked;

/**
 * Apply an open/close intent, enforcing "at most one drawer".
 *
 * The three cases, and the reason each is different:
 *
 *  - **Closing** a pane only closes that pane. Nothing else moves. Someone who
 *    dismisses the code drawer should not lose the nav column beside it.
 *  - **Opening a column** leaves every other pane exactly as it was. It neither
 *    forces the nav open nor closes a drawer that was already up.
 *  - **Opening a drawer** closes every *other drawer* and leaves every column
 *    alone. This is the case the bug lived in. The subtlety is the second half:
 *    a naive "close everything else" would hide the nav column at 1024-1279px,
 *    where the nav is legitimately docked and the code panel is a drawer over
 *    it. Two panes are fine; two *drawers* are not.
 *
 * The last two rules are applied on every call, not only when the target is a
 * drawer, so an innocent action cannot carry a pre-existing violation forward.
 */
export function reconcilePanes(
  state: PaneFlags,
  target: Pane,
  open: boolean,
  docked: DockedFn = dockedFn,
): PaneFlags {
  if (!open) {
    return { ...state, [flagFor(target)]: false } as PaneFlags;
  }

  const next: PaneFlags = { ...state, [flagFor(target)]: true };

  /*
   * The invariant is enforced whatever the target turned out to be, and the
   * target is the one pane exempt from it.
   *
   * Enforcing it only on the drawer branch looks tidier and is wrong. It leaves
   * a pre-existing violation in place: at 1024-1279 the nav is a column and the
   * code panel is a drawer, so a state with the code drawer *and* the input
   * sheet open is already two drawers — and opening the nav column, which takes
   * the "docked" early return, would carry that violation forward. A function
   * whose job is "apply this intent and keep the invariant" should keep the
   * invariant even when the intent is innocent.
   */
  for (const pane of ALL_PANES) {
    if (pane === target) continue;
    if (docked(pane)) continue; // a column may coexist with a drawer
    next[flagFor(pane)] = false;
  }
  return next;
}

const ALL_PANES: readonly Pane[] = ['nav', 'code', 'input'];

function flagFor(pane: Pane): keyof PaneFlags {
  switch (pane) {
    case 'nav':
      return 'sidebarOpen';
    case 'code':
      return 'codeOpen';
    case 'input':
      return 'inputOpen';
  }
}

/**
 * The state a visitor should arrive to.
 *
 * A pane starts open only if it is a column at this width. On a desktop that is
 * both, which is unchanged behaviour. On a phone it is neither, so a first-time
 * visitor lands on the algorithm instead of on two stacked drawers — which is
 * the difference between an app and a menu.
 *
 * A student who *dismisses* a column on a desktop and then narrows the window
 * keeps their preference for the widths where it is a column; this only
 * decides the starting point, and only from the width at load.
 */
export function initialPaneFlags(docked: DockedFn = dockedFn): PaneFlags {
  return {
    sidebarOpen: docked('nav'),
    codeOpen: docked('code'),
    inputOpen: false,
  };
}

/**
 * Called when the viewport crosses a docking threshold.
 *
 * A student who has the nav column open at 1440px and then drags the window
 * down to 900px should not end up with the nav *and* the code panel stacked as
 * drawers, which is precisely the state the store is now forbidden from
 * representing — except that the store only enforces the rule on user action.
 * A resize is not a user action on a pane, so something has to reconcile it.
 *
 * Resolving the conflict by closing the drawer pane (rather than the column)
 * because the student most recently asked for the column by resizing to a width
 * that has one.
 */
export function reconcileForWidth(state: PaneFlags, docked: DockedFn = dockedFn): PaneFlags {
  const drawers = ALL_PANES.filter((p) => state[flagFor(p)] && !docked(p));
  if (drawers.length <= 1) return state;
  // Keep the first, close the rest. `ALL_PANES` order is nav, code, input, so a
  // student who narrowed the window keeps their algorithm list.
  const keep = drawers[0] as Pane;
  const next = { ...state };
  for (const pane of drawers) {
    if (pane !== keep) next[flagFor(pane)] = false;
  }
  return next;
}
