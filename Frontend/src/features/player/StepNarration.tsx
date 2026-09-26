import { Activity, AlertTriangle, CircleCheck, Keyboard } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Em } from '../../lib/richText.tsx';
import {
  useAlgo,
  useCurrentFrame,
  useOffThread,
  usePlayer,
  useRunError,
  useRunMs,
  useTruncated,
} from './playerStore.ts';
import { Transport } from './Transport.tsx';

/**
 * The step narration: what just happened, in one fixed-height card.
 *
 * **The height is fixed, and that is the whole point of this component's layout.**
 *
 * This used to be a content-sized block sitting above the viewport. Step lengths
 * vary enormously — the median note is 168 characters and the longest is 371 — so
 * the block grew and shrank on every single step, and the visualisation below it
 * resized with it. A student watching an algorithm being *reshaped* could not tell
 * a real change from the panel twitching, which is a genuinely awful thing to do to
 * the one part of the screen that is supposed to be trustworthy.
 *
 * So: a fixed height, and the note is clamped to the number of lines that height
 * affords. `line-clamp` truncates *visually* only — the full sentence stays in the
 * DOM, so a screen reader announces all of it, `textContent` still returns it, and
 * the `title` gives a mouse user the whole thing on hover. The layout cannot move
 * because the container's height is not derived from its content.
 *
 * The variable chips get the same treatment for the same reason: one row,
 * `flex-nowrap`, scrolling sideways if it overflows. A chip row that wraps adds a
 * line when an algorithm has six variables and removes it when it has four, which
 * is the same twitch by another route.
 */
export function StepNarration() {
  const frame = useCurrentFrame();
  const error = useRunError();
  const truncated = useTruncated();
  const runMs = useRunMs();
  const offThread = useOffThread();
  const index = usePlayer((s) => s.index);
  const length = usePlayer((s) => s.trace.length);

  const note = frame?.note ?? 'Press play to step through the algorithm.';
  const vars = frame?.vars && Object.keys(frame.vars).length > 0 ? frame.vars : null;

  return (
    <div className="shrink-0 border-b border-slate-800/80 bg-slate-900/50">
      {/*
        A fixed `h`, not a `min-h`. A minimum still grows with the content, which
        is the bug being fixed here.
      */}
      <div className="flex h-[104px] flex-col px-4 py-2.5">
        {/* Row 1 — where we are, and what is in scope. Never wraps. */}
        <div className="flex h-6 shrink-0 items-center gap-2">
          <span
            className="flex h-6 shrink-0 items-center gap-1 rounded-lg bg-slate-800/90 px-1.5 font-mono text-[11px] tabular-nums"
            title="Step"
          >
            <span className="font-bold text-amber-300">{length === 0 ? '—' : index + 1}</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-500">{length || '—'}</span>
          </span>

          {frame?.anchor ? (
            <span
              className="h-6 max-w-[16rem] shrink-0 truncate rounded-md border border-amber-400/25 bg-amber-400/10 px-2 font-mono text-[11px] leading-6 text-amber-300"
              title={`Semantic step: ${frame.anchor}`}
            >
              {frame.anchor}
            </span>
          ) : null}

          {frame?.result ? (
            /*
              `result: {value}` in one text node, not an icon plus a bare value.
              The label is what makes the chip readable on its own, and the e2e
              suite asserts on this exact string when it walks a trace to the end —
              so the phrasing is a contract with the test, not decoration.
            */
            <span className="flex h-6 shrink-0 items-center gap-1 rounded-md bg-emerald-400/15 px-2 text-[11px] font-semibold text-emerald-300">
              <CircleCheck className="size-3" />
              result: {frame.result}
            </span>
          ) : null}

          {frame?.ops !== undefined ? (
            <span className="hidden h-6 shrink-0 items-center gap-1 rounded-lg bg-slate-800/70 px-2 text-[11px] text-slate-400 sm:flex">
              <Activity className="size-3" />
              <span className="tabular-nums">{frame.ops}</span> ops
            </span>
          ) : null}

          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[10px] text-slate-600">
            {frame?.caption ? (
              <span className="max-w-[14rem] truncate uppercase">{frame.caption}</span>
            ) : null}
            {runMs > 0 ? (
              <span title="Time to materialise the whole trace" className="tabular-nums">
                {runMs.toFixed(1)}ms
                {offThread ? ' · worker' : ''}
              </span>
            ) : null}
          </span>
        </div>

        {/* Row 2 — the sentence. Clamped; the full text stays in the DOM. */}
        <p
          // Remounting on every step is what re-runs the entry animation. A CSS
          // keyframe beats a JS animation library here: it costs no bundle, and
          // `index.css` already disables animations under `prefers-reduced-motion`.
          key={index}
          className="note-enter mt-1.5 line-clamp-3 min-h-0 flex-1 text-[14px] leading-[1.45] text-slate-100"
          title={note}
          aria-live="polite"
          aria-atomic="true"
        >
          <Em text={note} />
        </p>

        {/* Row 3 — the live variables. One row, sideways scroll, never wraps. */}
        <div className="mt-1.5 h-6 shrink-0">
          {vars ? (
            <div className="h-full overflow-x-auto overflow-y-hidden">
              <div className="flex h-6 w-max items-center gap-1.5">
                {Object.entries(vars).map(([k, v]) => (
                  <span
                    key={k}
                    className="flex h-6 shrink-0 items-center gap-1 rounded-lg border border-slate-700/70 bg-slate-800/60 px-1.5 font-mono text-[11px] whitespace-nowrap"
                  >
                    <span className="text-sky-300">{k}</span>
                    <span className="text-slate-600">=</span>
                    <span className="font-bold text-slate-50 tabular-nums">{String(v)}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {error || truncated ? (
        <div className="flex items-center gap-2 border-t border-rose-500/20 bg-rose-500/10 px-4 py-1.5 text-[12px] text-rose-300">
          <AlertTriangle className="size-3.5 shrink-0" />
          {error ? `Run failed: ${error}` : null}
          {truncated ? 'Trace hit the 50,000-frame cap and was cut short.' : null}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Keyboard control
 * ------------------------------------------------------------------ */

/**
 * Global, because a student watching an animation should be able to step without
 * reaching for the mouse — stepping *is* the activity. Every binding is listed in
 * the help sheet so it is discoverable, which is the only reason shortcuts exist
 * at all.
 *
 * Inputs are ignored on purpose: typing "r" into the input editor must not reset
 * playback.
 */
const JUMP = 10;

export function useKeyboardShortcuts(onOpenCode?: () => void): void {
  const onOpenCodeRef = useRef(onOpenCode);
  onOpenCodeRef.current = onOpenCode;
  const dispatch = usePlayer((s) => s.dispatch);
  const setLang = usePlayer((s) => s.setLang);
  const lang = usePlayer((s) => s.lang);
  const setShortcutsOpen = usePlayer((s) => s.setShortcutsOpen);
  const togglePointerLabels = usePlayer((s) => s.togglePointerLabels);
  const setSidebarOpen = usePlayer((s) => s.setSidebarOpen);
  const sidebarOpen = usePlayer((s) => s.sidebarOpen);
  const toggleInput = usePlayer((s) => s.toggleInput);
  // Read inside the handler through a ref, so toggling does not have to
  // re-subscribe the listener on every change.
  const sidebarOpenRef = useRef(sidebarOpen);
  sidebarOpenRef.current = sidebarOpen;
  const cycleLang = useRef(lang);
  cycleLang.current = lang;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      /*
       * Escape is handled *before* the typing guard, and it has to be.
       *
       * The guard below is right for everything else: typing "r" into the custom
       * input must not rewind playback. But the editor focuses its first box the
       * moment it opens, so with Escape behind that guard the key did nothing at
       * all — open the editor with `I`, press Escape, and the sheet stayed put
       * until you clicked somewhere else first. A dismissal that only works if
       * you first give up focus is not a dismissal.
       *
       * Escape is also the one key that is never a character anyone means to
       * type, so there is no conflict to lose.
       */
      if (e.key === 'Escape') {
        setShortcutsOpen(false);
        usePlayer.getState().setInputOpen(false);
        return;
      }

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable)
          return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          dispatch({ type: 'toggle' });
          break;
        case 'ArrowRight':
          e.preventDefault();
          dispatch({
            type: e.shiftKey ? 'jump' : 'stepForward',
            ...(e.shiftKey ? { delta: JUMP } : {}),
          } as never);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          dispatch({ type: 'stepBack' });
          break;
        case 'Home':
          e.preventDefault();
          dispatch({ type: 'first' });
          break;
        case 'End':
          e.preventDefault();
          dispatch({ type: 'last' });
          break;
        case 'r':
        case 'R':
          dispatch({ type: 'reset' });
          break;
        case 'l':
        case 'L': {
          const order = ['javascript', 'python', 'java', 'cpp'] as const;
          const i = order.indexOf(cycleLang.current);
          setLang(order[(i + 1) % order.length] ?? 'javascript');
          break;
        }
        case 'p':
        case 'P':
          togglePointerLabels();
          break;
        case 'c':
        case 'C':
          onOpenCodeRef.current?.();
          break;
        case 'b':
        case 'B':
          setSidebarOpen(!sidebarOpenRef.current);
          break;
        case 'i':
        case 'I':
          /*
           * `preventDefault` is load-bearing here, not hygiene.
           *
           * This handler opens the editor, React renders it, and the editor's own
           * effect focuses its first box — all of which happens before the browser
           * dispatches the text-insertion default action for the keypress. Without
           * this line the letter lands *in the box*: pressing `I` opened a form
           * containing `i12, 17, 95, …` with an error complaining about `"i12"`,
           * which is a thoroughly baffling way to start typing an array.
           *
           * The other letter shortcuts do not need this, because none of them move
           * focus into a text field. `Space` and `?` already had it for the same
           * class of reason.
           */
          e.preventDefault();
          toggleInput();
          break;
        case '?':
          e.preventDefault();
          setShortcutsOpen(true);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, setLang, setShortcutsOpen, togglePointerLabels, setSidebarOpen, toggleInput]);
}

const SHORTCUTS: Array<[string, string]> = [
  ['Space', 'Play / pause'],
  ['←  →', 'Step one frame back / forward'],
  ['Shift + ←  →', 'Jump 10 frames'],
  ['Home / End', 'First / last frame'],
  ['R', 'Reset to the start'],
  ['L', 'Cycle language'],
  ['I', 'Type your own input'],
  ['C', 'Show or hide the code panel'],
  ['P', 'Toggle pointer labels'],
  ['B', 'Toggle the sidebar'],
  ['Esc', 'Close whatever is open'],
  ['?', 'This help'],
];

export function ShortcutHelp({ onOpenCode }: { onOpenCode?: () => void } = {}) {
  const open = usePlayer((s) => s.shortcutsOpen);
  const setOpen = usePlayer((s) => s.setShortcutsOpen);
  const algo = useAlgo();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      {/*
        The backdrop is a real <button>, not a div with an onClick. A div is
        unreachable by keyboard and invisible to a screen reader, so a student who
        opened the sheet with `?` could not dismiss it without knowing to press
        Escape.
      */}
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        onClick={() => setOpen(false)}
      />
      <div className="pop-in relative w-full max-w-sm rounded-xl border border-slate-700/80 bg-slate-900 p-5 shadow-2xl shadow-black/50">
        <div className="mb-3 flex items-center gap-2">
          <Keyboard className="size-4 text-amber-400" />
          <h2 className="text-sm font-bold text-slate-100">Keyboard</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ml-auto rounded px-1.5 py-0.5 text-xs text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
          >
            esc
          </button>
        </div>
        <dl className="space-y-1">
          {SHORTCUTS.map(([k, v]) => (
            <div
              key={k}
              className="flex items-center gap-3 rounded px-1 py-0.5 text-[12px] transition-colors hover:bg-slate-800/50"
            >
              <dt className="w-28 shrink-0">
                <kbd className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-mono text-[10.5px] text-amber-300">
                  {k}
                </kbd>
              </dt>
              <dd className="text-slate-300">{v}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onOpenCode?.();
          }}
          className="mt-4 w-full rounded-lg border border-slate-700 px-2 py-1.5 text-[11px] text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800"
        >
          Open the code panel
        </button>
        {algo ? (
          <p className="mt-4 border-t border-slate-800 pt-3 text-[11px] text-slate-500">
            {algo.title} · {algo.presets.length} presets · {algo.expectations.length} verified cases
            across JavaScript, Python, Java and C++.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export { Transport };
