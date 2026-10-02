import { ChevronLeft, ChevronRight, Play, RotateCcw, Square } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AlgoDef, Preset } from '../../core/algorithms/types.ts';
import type { Frame } from '../../core/trace/types.ts';
import { cn } from '../../lib/utils.ts';
import { Scrubber } from '../player/Scrubber.tsx';
import { buildTrace } from '../player/traceBuilder.ts';
import { loadAlgorithm } from '../registry/loaders.ts';
import { Viewport } from '../viewport/Viewport.tsx';

/**
 * A live, scrubbable visualisation embedded in an article.
 *
 * ## Why this exists
 *
 * Every other explainer of bubble sort on the internet is a picture or a GIF. A
 * picture cannot answer "what happens if I only do one pass", because the reader
 * cannot make the picture go differently. This one can: the reader presses play,
 * steps, and watches the invariant hold — which is the entire argument of the
 * article, and the thing a static illustration is structurally unable to make.
 *
 * ## It is not a second player
 *
 * The temptation is to reuse `features/player` — the store, the transport, the
 * lesson header. That would be wrong, for a reason worth stating: `playerStore`
 * is a *singleton*. Mounting two of them in one page is not possible, and even if
 * it were, the article's stepper would be fighting the main player over the URL,
 * the pane model and the keyboard shortcuts. A student with the main visualiser
 * open in another tab, or with an article open and the player mounted behind it,
 * would find `Space` and `Escape` driving the wrong thing.
 *
 * So this is a deliberately small, self-contained, read-only player: local state,
 * no store, no URL, no global shortcuts. It gets its own frame range and its own
 * two buttons.
 *
 * ## The fallback is the important part
 *
 * `loadAlgorithm` is a dynamic import and can genuinely fail — an offline PWA
 * visit with the chunk not yet cached, a deploy that removed an old chunk while a
 * tab held a link to it. The failure renders an inline note **and a direct link to
 * the full visualiser**, which needs the same chunk but is the page the reader
 * would have been sent to anyway. So the worst case for a failed stepper is a
 * smaller version of the thing the reader was going to get regardless.
 */

/** How the stepper loads, and the states it can be in. */
type StepperState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; algo: AlgoDef; trace: Frame[]; preset: Preset };

export function EmbeddedStepper({
  algoId,
  preset: presetId,
  frame: startFrame,
  caption,
}: {
  algoId: string;
  preset?: string;
  frame?: number;
  caption: string;
}) {
  const [state, setState] = useState<StepperState>({ kind: 'loading' });
  const [index, setIndex] = useState(startFrame ?? 0);
  const [playing, setPlaying] = useState(false);

  /*
   * Guards against setting state after unmount.
   *
   * Not belt-and-braces: an article can contain several steppers, and a reader who
   * clicks a heading link while one is mid-import unmounts it. The import then
   * resolves and calls `setState` on a component that no longer exists, which React
   * 19 tolerates silently and which nonetheless means the whole `readArticles`
   * module is doing work for a page nobody is on.
   */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });

    void (async () => {
      try {
        const algo = await loadAlgorithm(algoId);
        if (cancelled || !alive.current) return;
        /*
         * The preset fallback is the second layer of the same defence as the error
         * state. `learn.test.ts` asserts every preset named here exists, so this
         * branch is unreachable in a green build — which is exactly why it should
         * be here rather than assumed away. A renamed preset would otherwise throw
         * inside `buildTrace` and land in the catch below, reporting a *load*
         * failure for what is really a content bug.
         */
        const preset =
          (presetId ? algo.presets.find((p) => p.id === presetId) : undefined) ?? algo.presets[0];
        if (!preset) throw new Error(`${algo.title} has no presets`);

        const built = await buildTrace(algo, preset.input, {
          ...Object.fromEntries(algo.params.map((p) => [p.key, p.default])),
          ...(preset.params ?? {}),
        });
        if (cancelled || !alive.current) return;
        setState({ kind: 'ready', algo, trace: built.trace, preset });
        // Clamped rather than trusted: `learn.test.ts` checks the frame is a
        // non-negative integer, not that it is *in range for this trace*, and a
        // frame beyond the end would render as an empty viewport with no error.
        setIndex(Math.min(startFrame ?? 0, Math.max(0, built.trace.length - 1)));
      } catch (e) {
        if (cancelled || !alive.current) return;
        setState({
          kind: 'error',
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [algoId, presetId, startFrame]);

  /*
   * A local playback clock.
   *
   * `setInterval` at 8 steps/second rather than the main transport's full speed
   * range, and for a reason that is about reading rather than about taste: an
   * article's stepper has no scrubber and no step counter the reader is watching
   * closely, so a fast run is a blur with no way to catch up. One state change per
   * 125 ms is slow enough to follow with your eyes while reading a sentence.
   *
   * Honours `prefers-reduced-motion` by refusing to auto-play at all, rather than
   * by playing slowly. A decorative animation in a scrollable page is exactly what
   * that setting is asking to be spared.
   */
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!playing) return;
    if (reduced) {
      setPlaying(false);
      return;
    }
    const timer = window.setInterval(() => {
      setIndex((i) => {
        const max = state.kind === 'ready' ? state.trace.length - 1 : 0;
        if (i >= max) {
          setPlaying(false);
          return max;
        }
        return i + 1;
      });
    }, 125);
    return () => window.clearInterval(timer);
  }, [playing, reduced, state]);

  const step = useCallback(
    (delta: number) => {
      setPlaying(false);
      setIndex((i) => {
        const max = state.kind === 'ready' ? state.trace.length - 1 : 0;
        return Math.max(0, Math.min(max, i + delta));
      });
    },
    [state],
  );

  const frame = state.kind === 'ready' ? (state.trace[index] ?? null) : null;

  return (
    <figure className="my-6 overflow-hidden rounded-xl border border-border-strong bg-surface-raised/40">
      <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
        <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wide text-accent uppercase">
          live
        </span>
        <figcaption className="min-w-0 flex-1 truncate text-[11.5px] text-text-muted">
          {caption}
        </figcaption>
        {state.kind === 'ready' ? (
          <span className="shrink-0 font-mono text-[10px] text-text-subtle tabular-nums">
            {index + 1}/{state.trace.length}
          </span>
        ) : null}
      </div>

      {/*
        `flex flex-col`, and load-bearing rather than decorative.

        Every viewport's root element is `flex-1` inside a column, which is how the
        player's `<section>` gives it a definite height — and a percentage bar height
        resolves against nothing without one. This box was a plain block, so
        `flex-1` resolved against no parent and the chart collapsed to its content
        height: the bars drew as a thin strip at the top of a 256px box with dead
        space beneath it. Same structure as the player's region, deliberately.

        The height is fixed rather than content-derived so that stepping through a
        trace never changes the page's layout — the one element on an article that
        must only change because the algorithm changed it.
      */}
      <div className="relative flex h-64 flex-col overflow-hidden bg-surface/40">
        {state.kind === 'loading' ? (
          <div className="flex h-full items-center justify-center text-[12px] text-text-subtle">
            Loading the trace…
          </div>
        ) : null}

        {state.kind === 'error' ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="text-[12px] text-text-muted">
              This stepper could not load ({state.message}).
            </p>
            <a
              href={`/?algo=${algoId}`}
              className="rounded-md border border-border-strong px-2.5 py-1 text-[11.5px] font-medium text-text-muted transition-colors hover:border-accent/50 hover:text-text"
            >
              Open {algoId} in the full visualiser →
            </a>
          </div>
        ) : null}

        {state.kind === 'ready' ? <Viewport frame={frame} showPointerLabels={false} /> : null}
      </div>

      {state.kind === 'ready' ? (
        <div className="flex items-center gap-1.5 border-t border-border/70 px-2.5 py-2">
          <StepButton onClick={() => step(-1)} disabled={index === 0} label="Step back">
            <ChevronLeft className="size-3.5" />
          </StepButton>
          <StepButton
            onClick={() => setPlaying((p) => !p)}
            label={playing ? 'Pause' : 'Play'}
            primary
          >
            {playing ? <Square className="size-3" /> : <Play className="size-3" />}
          </StepButton>
          <StepButton
            onClick={() => step(1)}
            disabled={index >= state.trace.length - 1}
            label="Step forward"
          >
            <ChevronRight className="size-3.5" />
          </StepButton>
          <StepButton
            onClick={() => {
              setPlaying(false);
              setIndex(0);
            }}
            disabled={index === 0}
            label="Back to the start"
          >
            <RotateCcw className="size-3" />
          </StepButton>

          <Scrubber
            className="ml-1"
            index={index}
            length={state.trace.length}
            onSeek={(v) => {
              setPlaying(false);
              setIndex(v);
            }}
            label={`Scrub through ${state.algo.title}`}
            valueText={`Step ${index + 1} of ${state.trace.length}`}
          />
        </div>
      ) : null}
    </figure>
  );
}

function StepButton({
  children,
  onClick,
  label,
  disabled,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-md transition-all duration-150',
        'disabled:pointer-events-none disabled:opacity-30',
        primary
          ? 'bg-accent text-text-inverse shadow-sm hover:bg-accent-hover'
          : 'text-text-muted hover:bg-surface-inset hover:text-text',
      )}
    >
      {children}
    </button>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}
