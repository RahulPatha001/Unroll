import { useEffect } from 'react';
import { CodePanel } from './features/code-panel/CodePanel.tsx';
import { LessonHeader } from './features/controls/LessonHeader.tsx';
import { InputEditor } from './features/input/InputEditor.tsx';
import { Sidebar } from './features/nav/Sidebar.tsx';
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
 * The app shell.
 *
 * Three columns: index, visualisation, code. The code panel is a first-class
 * column rather than a tab, because the product claim is that the animation and
 * the code are the same program — hiding one of them behind a toggle would
 * quietly contradict that. On narrow screens it becomes a drawer instead, since
 * a 300px code listing next to a 300px viewport helps nobody.
 */
export function App() {
  const status = useStatus();
  const algo = useAlgo();
  const frame = useCurrentFrame();
  const showPointerLabels = useShowPointerLabels();
  const codeOpen = usePlayer((s) => s.codeOpen);
  const setCodeOpen = usePlayer((s) => s.setCodeOpen);
  const inputOpen = useInputOpen();

  useKeyboardShortcuts(() => setCodeOpen(true));

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

  return (
    <div className="app-backdrop flex h-dvh overflow-hidden text-slate-100">
      <Sidebar />

      <main className="flex min-w-0 flex-1 flex-col">
        {algo ? <LessonHeader algo={algo} /> : null}

        {status === 'loading' ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            Loading…
          </div>
        ) : null}

        {status === 'error' ? (
          <div className="flex flex-1 items-center justify-center text-sm text-rose-400">
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
                className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/50 shadow-xl shadow-black/25"
                aria-label="Algorithm visualisation"
              >
                <Viewport frame={frame} showPointerLabels={showPointerLabels} />
                {/*
                  Mounted only while open, rather than rendered and hidden. The
                  editor holds draft text in local state, and a hidden-but-mounted
                  sheet would be a form full of values from ten minutes ago that
                  the student cannot see, waiting to be submitted.
                */}
                {inputOpen && algo ? <InputEditor algo={algo} /> : null}
              </section>
            </div>
            <Transport />
          </div>
        ) : null}
      </main>

      <aside
        className={[
          'flex shrink-0 flex-col border-l border-slate-800/80',
          // A real column on wide screens, an overlay drawer below that.
          'fixed inset-y-0 right-0 z-40 w-[min(92vw,520px)] transition-transform duration-200',
          'xl:static xl:w-[clamp(360px,32vw,560px)] xl:translate-x-0',
          codeOpen ? 'translate-x-0' : 'translate-x-full xl:hidden',
        ].join(' ')}
        aria-label="Code"
      >
        <CodePanel onClose={() => setCodeOpen(false)} />
      </aside>

      {codeOpen ? (
        <button
          type="button"
          aria-label="Close the code panel"
          className="fixed inset-0 z-30 bg-slate-950/60 xl:hidden"
          onClick={() => setCodeOpen(false)}
        />
      ) : null}

      <ShortcutHelp onOpenCode={() => setCodeOpen(true)} />
    </div>
  );
}
