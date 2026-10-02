import { lazy, Suspense, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useLibrary } from './app/library.ts';
import { TopNav } from './app/TopNav.tsx';
import { CodePanel } from './features/code-panel/CodePanel.tsx';
import { LessonHeader } from './features/controls/LessonHeader.tsx';
import { Sidebar } from './features/nav/Sidebar.tsx';
import { CODE_DOCKED_QUERY, NAV_DOCKED_QUERY } from './features/player/panes.ts';
import {
  useAlgo,
  useCurrentFrame,
  useInputOpen,
  usePlayer,
  useShowPointerLabels,
  useStatus,
} from './features/player/playerStore.ts';
import {
  ShortcutHelp,
  StepNarration,
  Transport,
  useKeyboardShortcuts,
} from './features/player/StepNarration.tsx';
import { loadFromUrl, useUrlSync } from './features/player/useUrlSync.ts';
import { Viewport } from './features/viewport/Viewport.tsx';

/**
 * The custom-input editor, lazily loaded.
 *
 * It is ~19 kB of source and a transient sheet that is *already* only mounted when
 * `inputOpen` is true — so the code is cold for every student who never opens it,
 * and eagerly importing it charged all of them. `React.lazy` here is not a
 * micro-optimisation; with `tools/budget.mjs` corrected to walk the real static
 * import graph, this import was the difference between 202.9 kB and a build inside
 * the 200 kB budget.
 *
 * The cost is one fetch when the student presses "your input", which is paid in the
 * background while the sheet animates in — a far better trade than every visitor
 * paying for it up front to save a student one wait they will barely notice.
 */
const InputEditor = lazy(() =>
  import('./features/input/InputEditor.tsx').then((m) => ({ default: m.InputEditor })),
);

/**
 * The visualiser.
 *
 * This is a *route* (`/?algo=<id>`), not the application — the application is
 * `app/routes.tsx`, which puts the browse page at a bare `/` and this at a URL that
 * names an algorithm. That is the two-step flow: choose something, then set it up
 * and watch it. Nothing below has changed as a result; the shell is still the same
 * three columns, and `/?algo=…` still carries the entire URL contract.
 *
 * ## What the top nav costs, and why it is 44px
 *
 * The nav sits *outside* the three-column flex row rather than inside the header,
 * so the height it takes is one explicit 44px and not an emergent property of
 * whatever the header happens to wrap to. The player's vertical budget is the
 * tightest constraint in the app — the narration card is a fixed-height box and
 * `tests/visual/layout.spec.ts` asserts that the header measures the same at every
 * width and that opening the detail panel resizes nothing — so the number is
 * asserted rather than trusted.
 *
 * Three columns: index, visualisation, code. The code panel is a first-class
 * column rather than a tab, because the product claim is that the animation and
 * the code are the same program — hiding one of them behind a toggle would
 * quietly contradict that. On narrow screens it becomes a drawer instead, since
 * a 300px code listing next to a 300px viewport helps nobody.
 *
 * ## The breakpoint bands
 *
 * | Width | Nav | Code |
 * | --- | --- | --- |
 * | >= 1280 (`xl`) | column | column |
 * | 1024-1279 (`lg`) | column | drawer |
 * | < 1024 | drawer | drawer, one at a time |
 *
 * The 1024-1279 band is the interesting one and the reason the pane model is
 * about drawers rather than about panes: the nav is a genuine column there while
 * the code panel is a drawer over it, so two panes are visible at once and only
 * one of them is an overlay. A rule of "at most one pane visible" would have
 * forced the nav away in a width that has room for it.
 *
 * What this deliberately does *not* do is un-dock the nav below 1536. There is
 * room for a 288px rail beside a 460px code panel and a 690px visualisation at
 * 1440, and an e2e test asserts the rail is there. The original plan proposed
 * making it a slide-over across that whole band; that would have bought nothing
 * (the metric that matters is *height*, and the rail is a horizontal column) and
 * cost a test rewrite at the exact viewport the metric is measured at.
 */
export function App() {
  const status = useStatus();
  const algo = useAlgo();
  const frame = useCurrentFrame();
  const showPointerLabels = useShowPointerLabels();
  const codeOpen = usePlayer((s) => s.codeOpen);
  const setCodeOpen = usePlayer((s) => s.setCodeOpen);
  const inputOpen = useInputOpen();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const visit = useLibrary((s) => s.visit);

  useKeyboardShortcuts(() => setCodeOpen(true));

  /*
   * Record the algorithm as viewed, so the browse page can offer it back.
   *
   * Keyed on `algoId` and read straight from the store rather than passed as a
   * prop, so it fires exactly once per load however the load was triggered — a
   * card click, a shared link, a browser Back, or the mount effect below. Reading
   * `algo?.id` instead would fire on every re-render of the header.
   *
   * It is also why this is a *route*: because navigating away from the player
   * unmounts this component, the effect's cleanup boundary and the visit boundary
   * are the same boundary.
   */
  const algoId = usePlayer((s) => s.algoId);
  useEffect(() => {
    visit(algoId);
  }, [algoId, visit]);

  /*
   * Two halves of one feature, and the order matters.
   *
   * `loadFromUrl` is a *read* — it restores the algorithm, the frame, the
   * parameters and any custom input the link carries. `useUrlSync` is a
   * *subscription* that writes all of that back as the student works. The read
   * has to happen first: a subscription that fires before the read completes
   * would write the default preset over a custom input from the link, and the
   * link would quietly stop working.
   */
  useUrlSync();

  useEffect(() => {
    // Once, on mount. `loadFromUrl` reads the store directly rather than taking
    // it as a dependency, so there is nothing here to re-run on.
    void loadFromUrl();
  }, []);

  /*
   * Re-reconcile the panes when the window crosses a docking threshold.
   *
   * The store guarantees "at most one drawer" when a *pane* is opened or closed,
   * and a resize is not that. A student with the nav column and the code column
   * both open at 1440px who drags the window down to 900px would otherwise land
   * in exactly the stacked-drawer state the whole pane model exists to prevent
   * — reached by the one route that does not go through a setter.
   *
   * `matchMedia` rather than a `resize` listener because this only cares about
   * two thresholds, and a listener would fire on every pixel of a drag.
   */
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const sync = () => usePlayer.getState().syncPanesToWidth();
    const queries = [NAV_DOCKED_QUERY, CODE_DOCKED_QUERY].map((q) => window.matchMedia(q));
    for (const q of queries) q.addEventListener('change', sync);
    return () => {
      for (const q of queries) q.removeEventListener('change', sync);
    };
  }, []);

  return (
    <div className="app-backdrop flex h-dvh flex-col overflow-hidden text-text">
      <TopNav pathname={pathname} onNavigate={(to) => void navigate(to)} />

      {/*
        The three columns, in a `min-h-0 flex-1` row.

        The `min-h-0` is load-bearing and is the single most common way this layout
        breaks: `flex-1` alone resolves the child's basis to 0% but does not cap its
        height, so this row grows past the viewport, `h-dvh` on the parent stops
        meaning anything, and the transport bar scrolls out of reach. Capping it is
        what makes the fixed-viewport contract hold now that there is a nav above it.
      */}
      <div className="flex min-h-0 flex-1">
        <Sidebar />

        {/*
          `@container`, and it is on *this* element rather than on an ancestor.

          The transport below decides whether its scrubber fits on the control row
          from the width of **this column**, which is
          `viewport − 288px sidebar − clamp(360px, 32vw, 560px)` code panel. That
          expression is not monotonic in the viewport — the code panel's own clamp
          widens again past 1536 — so a viewport breakpoint would be a hardcoded
          guess that is right at some widths and wrong at others. A container query
          measures the thing that actually decides it.

          `container-type: inline-size` implies `contain: layout style inline-size`.
          The `layout` part makes this a containing block for absolutely-positioned
          descendants and a stacking context; both are already true here (the region
          is `relative`, the drawer carries its own `z-40`), and the inline-size part
          is the point — the column's width stops depending on its contents, which it
          never did.
        */}
        <main className="@container flex min-w-0 flex-1 flex-col">
          {algo ? <LessonHeader algo={algo} /> : null}

          {status === 'loading' ? (
            <div className="flex flex-1 items-center justify-center text-sm text-text-subtle">
              Loading…
            </div>
          ) : null}

          {status === 'error' ? (
            <div className="flex flex-1 items-center justify-center text-sm text-danger">
              Something went wrong loading this algorithm.
            </div>
          ) : null}

          {algo ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <StepNarration />
              {/*
                `flex-1` rather than `h-full` on the region, deliberately.
                A percentage height does not resolve against a `flex: 1 1 0%`
                parent, so `h-full` here silently collapsed the viewport to its
                content height — and every bar chart inside it then sized its bars
                against the wrong box. Filling space with `flex-1` is the idiom
                that always works.
              */}
              <div className="flex min-h-0 flex-1 flex-col p-3">
                {/* A <section> with an accessible name *is* a region; a div with
                    role="region" is the same thing spelled wrong.

                    `relative` so the input editor can anchor to the viewport box
                    rather than the page. It is an overlay sheet on purpose: a
                    sibling that pushed the viewport would resize the one element
                    on screen that is supposed to only ever change because the
                    algorithm changed it. */}
                <section
                  className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/80 bg-surface/50 shadow-xl shadow-black/25"
                  aria-label="Algorithm visualisation"
                >
                  {/*
                    The stage cross-fade, keyed on the algorithm.

                    Switching algorithms currently cuts: the old trace disappears and
                    the new one is already there, with nothing in between. `key` on
                    the algorithm id remounts the subtree, which both re-runs the
                    entrance animation *and* discards any state a renderer was
                    holding — which is the correct thing to do, since a renderer's
                    state describes the trace it was last showing.

                    Opacity only, and it has to be. A reflow inside this box is
                    indistinguishable from the algorithm having changed something,
                    and this box is the one region of the app whose whole promise is
                    that it only moves when the algorithm moves. So the fade
                    communicates "the content changed" without ever making the box
                    move.

                    Keyed on `algoId` and not on `index`, so it does **not** re-run on
                    every step. That is the difference between a transition that
                    explains a discontinuity and one that fires sixty times a second.
                  */}
                  <div key={algoId} className="stage-swap flex min-h-0 flex-1 flex-col">
                    <Viewport frame={frame} showPointerLabels={showPointerLabels} />
                  </div>
                  {/*
                    Mounted only while open, rather than rendered and hidden. The
                    editor holds draft text in local state, and a hidden-but-mounted
                    sheet would be a form full of values from ten minutes ago that
                    the student cannot see, waiting to be submitted.

                    The `Suspense` boundary is here rather than around the whole
                    player so the fetch does not blank the visualisation behind it —
                    the sheet fades in over a viewport that is still drawing.
                  */}
                  {inputOpen && algo ? (
                    <Suspense
                      fallback={
                        <div className="pop-in absolute inset-0 flex items-center justify-center bg-surface/95 text-[13px] text-text-subtle">
                          Loading the editor…
                        </div>
                      }
                    >
                      <InputEditor algo={algo} />
                    </Suspense>
                  ) : null}
                </section>
              </div>
              <Transport />
            </div>
          ) : null}
        </main>

        <aside
          className={[
            'flex shrink-0 flex-col border-l border-border/80',
            // A real column on wide screens, an overlay drawer below that.
            'fixed inset-y-0 right-0 z-40 w-[min(92vw,520px)] transition-transform duration-200',
            'xl:static xl:w-[clamp(360px,32vw,560px)] xl:translate-x-0',
            codeOpen ? 'translate-x-0' : 'translate-x-full xl:hidden',
          ].join(' ')}
          aria-label="Code"
          id="code-panel"
        >
          <CodePanel onClose={() => setCodeOpen(false)} />
        </aside>

        {/*
          The scrim: a click-anywhere-else convenience, and deliberately *not* in
          the accessibility tree.

          It used to carry `aria-label="Close the code panel"`, which is the same
          accessible name as the panel's own X button — so a screen-reader user
          heard two identically named buttons, one of which was an invisible
          full-screen backdrop, and neither `getByRole` nor `getByLabel` could
          tell them apart without `.first()`. Duplicated names are worse than a
          missing affordance here, because the real affordances already exist:
          Escape dismisses, and the X is a visible, correctly named button. So the
          scrim keeps its click target and leaves the tree, with `tabIndex={-1}`
          so it cannot become a focus trap's first stop.
        */}
        {codeOpen ? (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="fixed inset-0 z-30 bg-surface/60 xl:hidden"
            onClick={() => setCodeOpen(false)}
          />
        ) : null}
      </div>

      <ShortcutHelp onOpenCode={() => setCodeOpen(true)} />
    </div>
  );
}
