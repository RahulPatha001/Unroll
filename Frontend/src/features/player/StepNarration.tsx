import {
  Activity,
  AlertTriangle,
  AlignLeft,
  ChevronDown,
  CircleCheck,
  Keyboard,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Em } from '../../lib/richText.tsx';
import { cn } from '../../lib/utils.ts';
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
 * The step narration — what just happened — as a floating card.
 *
 * The old narration was a fixed 104px bar *above* the visualisation: a strip
 * the note never fit in (median 248 chars in ~3 lines of room), so the
 * sentence was cut mid-word on most steps and the visualisation below it paid
 * for the chrome with lost height. Every step fired three separate animations
 * (note, code line, accent thread) at three durations, which is what made
 * stepping feel busy.
 *
 * Now the narration floats *over* the stage instead of pushing it:
 *
 *  - `absolute`, so the visualisation never moves because a sentence got
 *    longer. The region's height is a function of the window, never of the
 *    step — the same guarantee as before, kept by position rather than by a
 *    fixed height.
 *  - Glassy and compact: step pill, anchor, result, ops on one strip; the
 *    sentence in up to three real lines; variables in a sideways-scrolling
 *    middle; caption and wall-clock pinned right. Everything the old card
 *    showed, in a card that costs the stage nothing.
 *  - One entrance (`narration-float`, same spring as the stage) and one beat:
 *    the accent thread, the sentence (`note-enter`) and the code line
 *    (`line-flash`/`line-locate`) still share `--step-beat`, so a step reads
 *    as one event rather than three facts.
 *
 * The clamp still truncates visually only — the full sentence stays in the
 * DOM for screen readers — and overflow is still measured (`scrollHeight >
 * clientHeight`) rather than guessed, with the reader dialog for the long
 * tail. The parent positions this card; it only needs `pointer-events-auto`
 * so clicks land on it and not on the stage behind.
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

  const cardRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLParagraphElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [clipped, setClipped] = useState(false);
  const [reading, setReading] = useState<Expanded | null>(null);

  // Re-measured after every render: `key={index}` remounts the note so the
  // entry animation re-runs, which means the previously measured node is
  // detached. "After every render" is the honest dependency.
  useLayoutEffect(() => {
    const el = noteRef.current;
    if (el) setClipped(isClamped(el));
  });

  // And again when the card's width changes (the card is the stable ancestor;
  // the note remounts per step) or when the webfont arrives and rewraps text.
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const measure = () => {
      const el = noteRef.current;
      if (el) setClipped(isClamped(el));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(card);
    void document.fonts.ready.then(measure);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (reading) closeRef.current?.focus();
  }, [reading]);

  const closeNote = () => {
    setReading(null);
    (triggerRef.current ?? cardRef.current)?.focus();
  };

  const canExpand = clipped && frame !== null;

  return (
    <>
      <div
        ref={cardRef}
        tabIndex={-1}
        data-narration="true"
        className={cn(
          'narration-float pointer-events-auto relative w-full max-w-xl',
          'rounded-2xl border border-border/80 bg-surface-raised/85',
          'shadow-xl shadow-black/30 backdrop-blur-md',
          'px-4 pt-2.5 pb-3',
        )}
      >
        <span
          key={index}
          aria-hidden="true"
          className="line-locate pointer-events-none absolute inset-y-3 left-0 w-0.5 rounded-full bg-gradient-to-b from-accent via-accent to-accent/15"
        />
        <div className="flex h-6 items-center gap-2 pl-2">
          <span
            className="flex h-6 shrink-0 items-center gap-1 rounded-full bg-surface-inset/90 px-2 font-mono text-[11px] tabular-nums ring-1 ring-border/50 ring-inset"
            title="Step"
          >
            <span className="font-bold text-accent-hover">{length === 0 ? '—' : index + 1}</span>
            <span className="text-text-faint">/</span>
            <span className="text-text-subtle">{length || '—'}</span>
          </span>

          {frame?.anchor ? (
            <span
              className="h-6 max-w-[12rem] shrink-0 truncate rounded-full border border-accent/25 bg-accent/10 px-2.5 font-mono text-[11px] leading-6 text-accent-hover"
              title={frame.anchor}
            >
              {frame.anchor}
            </span>
          ) : null}

          {frame?.result ? (
            <span className="flex h-6 shrink-0 items-center gap-1 rounded-full bg-success/15 px-2.5 text-[11px] font-semibold text-success-strong ring-1 ring-success/20 ring-inset">
              <CircleCheck className="size-3" />
              result: {frame.result}
            </span>
          ) : null}

          {frame?.ops !== undefined ? (
            <span className="hidden h-6 shrink-0 items-center gap-1 rounded-full bg-surface-inset/70 px-2.5 text-[11px] text-text-muted sm:flex">
              <Activity className="size-3" />
              <span className="tabular-nums">{frame.ops}</span> ops
            </span>
          ) : null}

          <div className="scroll-fade-x hidden h-6 min-w-0 flex-1 items-center sm:flex">
            {vars ? (
              <div className="flex h-6 w-max items-center gap-1.5">
                {Object.entries(vars).map(([k, v]) => (
                  <span
                    key={k}
                    className="flex h-6 shrink-0 items-center gap-1 rounded-full border border-border-strong/60 bg-surface-inset/60 px-2 font-mono text-[11px] whitespace-nowrap"
                  >
                    <span className="text-info">{k}</span>
                    <span className="text-text-faint">=</span>
                    <span className="font-bold text-text-strong tabular-nums">{String(v)}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-text-subtle">
            {frame?.caption ? (
              <span className="max-w-[10rem] truncate uppercase">{frame.caption}</span>
            ) : null}
            {runMs > 0 ? (
              <span title="Time to materialise the whole trace" className="tabular-nums">
                {runMs.toFixed(1)}ms
                {offThread ? ' · worker' : ''}
              </span>
            ) : null}
          </span>

          <div className="flex h-6 w-7 shrink-0 items-center justify-center">
            {canExpand ? (
              <button
                ref={triggerRef}
                type="button"
                onClick={() =>
                  setReading({
                    note,
                    anchor: frame.anchor ?? null,
                    step: index + 1,
                    total: length,
                  })
                }
                onKeyDown={stopStepKeys}
                aria-haspopup="dialog"
                aria-expanded={reading !== null}
                aria-label="Read the whole step note"
                title="This note is cut off — read all of it"
                className={cn(
                  'flex size-6 items-center justify-center rounded-full text-text-subtle transition-all duration-150',
                  'hover:scale-105 hover:bg-surface-overlay/80 hover:text-accent-strong active:scale-95',
                  reading !== null && 'bg-surface-overlay/80 text-accent-strong',
                )}
              >
                <ChevronDown className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        <p
          key={index}
          ref={noteRef}
          className="note-enter mt-1.5 line-clamp-3 min-h-0 pl-2 text-[14px] leading-[1.5] text-text"
          title={note}
          aria-live="polite"
          aria-atomic="true"
        >
          <Em text={note} />
        </p>

        {error || truncated ? (
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-danger-deep/20 bg-danger-deep/10 px-3 py-1.5 text-[12px] text-danger-strong">
            <AlertTriangle className="size-3.5 shrink-0" />
            {error ? `Run failed: ${error}` : null}
            {truncated ? 'Trace hit the 50,000-frame cap and was cut short.' : null}
          </div>
        ) : null}
      </div>

      {reading ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-surface/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Step narration"
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
              closeNote();
            } else if (e.key === 'Tab') {
              e.preventDefault();
              closeRef.current?.focus();
            }
          }}
        >
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="absolute inset-0 cursor-default"
            onClick={closeNote}
          />
          <div className="pop-in relative flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col rounded-2xl border border-border-strong/80 bg-surface-raised p-5 shadow-2xl shadow-black/50">
            <div className="mb-3 flex items-center gap-2">
              <AlignLeft className="size-4 text-accent" />
              <h2 className="text-sm font-bold text-text">Step narration</h2>
              <button
                ref={closeRef}
                type="button"
                onClick={closeNote}
                aria-label="Close the step narration"
                className="ml-auto rounded px-1.5 py-0.5 text-xs text-text-subtle transition-colors hover:bg-surface-inset hover:text-text-muted"
              >
                esc
              </button>
            </div>
            <p className="mb-2 font-mono text-[10.5px] text-text-subtle tabular-nums">
              step {reading.step}/{reading.total}
              {reading.anchor ? ` · ${reading.anchor}` : ''}
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto text-[14px] leading-relaxed text-text">
              <Em text={reading.note} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** The note a reader opened, snapshotted. */
interface Expanded {
  note: string;
  /** The semantic step, or `null` for a frame that names none. */
  anchor: string | null;
  step: number;
  total: number;
}

/**
 * Is the sentence genuinely clipped?
 *
 * `scrollHeight > clientHeight`, and nothing inferred from the text. A character
 * count cannot work — the same sentence needs four lines at 1920 and ten at 390.
 */
function isClamped(el: HTMLElement): boolean {
  return el.scrollHeight > el.clientHeight;
}

const STEP_KEYS = new Set([
  ' ',
  'Enter',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
]);

function stopStepKeys(e: React.KeyboardEvent) {
  if (STEP_KEYS.has(e.key)) e.stopPropagation();
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
  const sidebarOpenRef = useRef(sidebarOpen);
  sidebarOpenRef.current = sidebarOpen;
  const cycleLang = useRef(lang);
  cycleLang.current = lang;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        onClick={() => setOpen(false)}
      />
      <div className="pop-in relative w-full max-w-sm rounded-2xl border border-border-strong/80 bg-surface-raised p-5 shadow-2xl shadow-black/50">
        <div className="mb-3 flex items-center gap-2">
          <Keyboard className="size-4 text-accent" />
          <h2 className="text-sm font-bold text-text">Keyboard</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ml-auto rounded px-1.5 py-0.5 text-xs text-text-subtle transition-colors hover:bg-surface-inset hover:text-text-muted"
          >
            esc
          </button>
        </div>
        <dl className="space-y-1">
          {SHORTCUTS.map(([k, v]) => (
            <div
              key={k}
              className="flex items-center gap-3 rounded px-1 py-0.5 text-[12px] transition-colors hover:bg-surface-inset/50"
            >
              <dt className="w-28 shrink-0">
                <kbd className="rounded border border-border-strong bg-surface-inset px-1.5 py-0.5 font-mono text-[10.5px] text-accent-hover">
                  {k}
                </kbd>
              </dt>
              <dd className="text-text-muted">{v}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onOpenCode?.();
          }}
          className="mt-4 w-full rounded-xl border border-border-strong px-2 py-1.5 text-[11px] text-text-muted transition-colors hover:border-border-subtle hover:bg-surface-inset"
        >
          Open the code panel
        </button>
        {algo ? (
          <p className="mt-4 border-t border-border pt-3 text-[11px] text-text-subtle">
            {algo.title} · {algo.presets.length} presets · {algo.expectations.length} verified cases
            across JavaScript, Python, Java and C++.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export { Transport };
