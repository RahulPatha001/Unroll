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
 * The visualiser — redesigned as a calm studio rather than a stack of bars.
 *
 * The old page was four competing strips: a two-row header, a fixed 104px
 * narration bar the note never fit in, a viewport squeezed between them, and a
 * transport whose rows wrapped with the column width. Every step fired three
 * animations at three durations. It worked, and it felt congested, because the
 * chrome never stopped competing with the algorithm.
 *
 * The new page has three zones with one job each:
 *
 *  1. `LessonHeader` — identity + setup. Two slim, airy rows; the only place
 *     that changes the run.
 *  2. The stage — a large rounded card with a dot-grid surface, generous
 *     padding, and the narration floating *over* it instead of pushing it.
 *     The visualisation gets the room; the sentence costs it nothing.
 *  3. The transport dock — a floating pill below the stage with the scrubber
 *     on top and the cluster + speed below. One silhouette at every width.
 *
 * What did not change, and why it matters that it did not:
 *
 *  - The route contract (`/?algo=<id>` + query state), `useUrlSync` ordering
 *    (read before subscribe), pane reconciliation (`syncPanesToWidth`), the
 *    visit recording, keyboard shortcuts, and lazy `InputEditor` boundary are
 *    all identical. A redesign that breaks deep links or the Back button is
 *    not a redesign, it is a regression.
 *  - Breakpoints are identical: nav column ≥1024 (`lg`), code column ≥1280
 *    (`xl`), one drawer at a time below that. The pane model in `panes.ts`
 *    still owns the rule; this file only renders it.
 *  - Every accessible name the e2e suite drives is preserved: the `h1`, the
 *    `Algorithm visualisation` region, `Scrub through steps`, the transport
 *    buttons, `Search algorithms`, `details`, `code`, `share`, `your input`,
 *    `yours`, `result: …`, `[data-line]`/`[data-anchor]`, `aria-live="polite"`.
 *  - Motion is opacity + transform only, on one spring (`--stage-ease`), so it
 *    stays on the compositor while the trace rebuilds. `prefers-reduced-motion`
 *    neutralises all of it via the global rule in `index.css`.
 */

const InputEditor = lazy(() =>
  import('./features/input/InputEditor.tsx').then((m) => ({ default: m.InputEditor })),
);

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

  const algoId = usePlayer((s) => s.algoId);
  useEffect(() => {
    visit(algoId);
  }, [algoId, visit]);

  useUrlSync();

  useEffect(() => {
    void loadFromUrl();
  }, []);

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

      <div className="flex min-h-0 flex-1">
        <Sidebar />

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
            <div className="flex min-h-0 flex-1 gap-4 p-4 sm:p-5">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
                <section
                  className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border/70 bg-surface/60 shadow-2xl shadow-black/30"
                  aria-label="Algorithm visualisation"
                >
                  <div
                    aria-hidden="true"
                    className="stage-dots pointer-events-none absolute inset-0 opacity-60"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        'radial-gradient(36rem 22rem at 50% -10%, rgb(251 191 36 / 0.07), transparent 60%), radial-gradient(30rem 20rem at 100% 110%, rgb(56 189 248 / 0.05), transparent 60%)',
                    }}
                  />

                  <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-4 sm:justify-start sm:p-5">
                    <StepNarration />
                  </div>

                  <div className="relative flex min-h-0 flex-1 flex-col px-5 pt-32 pb-5 sm:px-9 sm:pt-28">
                    <div
                      key={algoId}
                      className="stage-swap stage-enter flex min-h-0 flex-1 flex-col"
                    >
                      <Viewport frame={frame} showPointerLabels={showPointerLabels} />
                    </div>
                    {inputOpen && algo ? (
                      <Suspense
                        fallback={
                          <div className="pop-in absolute inset-0 flex items-center justify-center rounded-3xl bg-surface/95 text-[13px] text-text-subtle">
                            Loading the editor…
                          </div>
                        }
                      >
                        <InputEditor algo={algo} />
                      </Suspense>
                    ) : null}
                  </div>
                </section>

                <Transport />
              </div>

              <aside
                className={[
                  'flex shrink-0 flex-col overflow-hidden border border-border/70 bg-surface-raised/60 shadow-xl shadow-black/25 backdrop-blur-sm',
                  'fixed inset-y-0 right-0 z-40 m-2 w-[min(92vw,520px)] rounded-3xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                  'xl:static xl:m-0 xl:w-[clamp(360px,32vw,560px)] xl:translate-x-0 xl:rounded-none xl:rounded-l-3xl xl:border-y-0 xl:border-r-0',
                  codeOpen ? 'translate-x-0' : 'translate-x-[calc(100%+0.5rem)] xl:hidden',
                ].join(' ')}
                aria-label="Code"
                id="code-panel"
              >
                <CodePanel onClose={() => setCodeOpen(false)} />
              </aside>

              {codeOpen ? (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  className="fixed inset-0 z-30 bg-surface/60 backdrop-blur-[2px] xl:hidden"
                  onClick={() => setCodeOpen(false)}
                />
              ) : null}
            </div>
          ) : null}
        </main>
      </div>

      <ShortcutHelp onOpenCode={() => setCodeOpen(true)} />
    </div>
  );
}
