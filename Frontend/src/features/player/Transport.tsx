import {
  ChevronFirst,
  ChevronLast,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SPEEDS, type Speed, stepInterval } from '../../core/trace/player.ts';
import {
  onReducedMotionChange,
  prefersReducedMotion,
  REDUCED_STEPS_PER_SECOND,
} from '../../lib/reducedMotion.ts';
import { cn } from '../../lib/utils.ts';
import { usePlayer, useTransportFlags } from './playerStore.ts';
import { Scrubber } from './Scrubber.tsx';

/**
 * Transport controls — the control surface for stepping through a trace.
 *
 * A floating dock rather than a flush bar: rounded, bordered, elevated, and
 * visually separate from the visualisation above it. The old transport was a
 * full-width strip whose rows wrapped with the column width, so its height
 * varied with the window and it read as more chrome competing with the stage.
 * The dock has one job and one silhouette, and it keeps it at every width.
 *
 * What did not change, deliberately:
 *
 *  - The playback clock below is byte-for-byte the same `setTimeout` +
 *    `requestAnimationFrame` loop with refs for speed/loop/reduced-motion, the
 *    4-step catch-up bound, and loop handling. Smoothness here comes from the
 *    *renderers* settling on one spring, not from retiming the clock.
 *  - This component still subscribes to `useTransportFlags` (human-speed
 *    booleans) rather than `index` (60Hz), so it re-renders per interaction
 *    rather than per tick.
 *  - Every accessible name is unchanged: First step, Step back, Play/Pause,
 *    Step forward, Last step, Reset, "Scrub through steps", "Playback speed".
 *    The e2e suite drives all of these.
 */
export function Transport() {
  const dispatch = usePlayer((s) => s.dispatch);
  const setSpeed = usePlayer((s) => s.setSpeed);
  const speed = usePlayer((s) => s.speed);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const reduced = usePrefersReducedMotion();
  const loop = usePlayer((s) => s.loop);
  const setLoop = usePlayer((s) => s.setLoop);
  const index = usePlayer((s) => s.index);
  const length = usePlayer((s) => s.trace.length);
  const flags = useTransportFlags();

  // The playback clock. A `setInterval` whose delay is re-read each tick, rather
  // than one interval per speed, so changing speed does not have to tear down and
  // recreate a timer (which is where dropped-frame bugs live).
  // `speed` and `loop` are read inside the tick callback, which is created once
  // per playback run. Routing them through refs means changing speed mid-run
  // takes effect on the next tick instead of restarting the timer.
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const loopRef = useRef(loop);
  loopRef.current = loop;
  // Reduced motion does not disable playback — a static picture is not a
  // visualiser. It pins the clock to one step per second so each state change is
  // legible and nothing appears to animate.
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  useEffect(() => {
    if (!isPlaying || length <= 1) return;
    let timer: number | undefined;
    let last = performance.now();
    let carry = 0;

    const tick = (now: number) => {
      const interval = reducedRef.current
        ? stepInterval(REDUCED_STEPS_PER_SECOND)
        : stepInterval(speedRef.current);
      carry += now - last;
      last = now;
      // Catch up in a loop, but bound it: a backgrounded tab can produce a huge
      // `carry`, and fast-forwarding through 500 frames is not helpful.
      let steps = 0;
      while (carry >= interval && steps < 4) {
        carry -= interval;
        steps += 1;
      }
      if (steps > 0) {
        const state = usePlayer.getState();
        const atEnd = state.index >= state.trace.length - 1;
        if (atEnd) {
          if (loopRef.current && state.trace.length > 1) {
            dispatch({ type: 'seek', index: 0 });
            dispatch({ type: 'play' });
            carry = 0;
          } else {
            dispatch({ type: 'pause' });
            return;
          }
        } else {
          dispatch({ type: 'jump', delta: steps });
        }
      }
      timer = window.setTimeout(() => requestAnimationFrame(tick), interval);
    };

    timer = window.setTimeout(
      () => requestAnimationFrame(tick),
      reducedRef.current ? stepInterval(REDUCED_STEPS_PER_SECOND) : stepInterval(speedRef.current),
    );
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [isPlaying, length, dispatch]);

  return (
    /*
      The dock. One rounded surface with two zones:
        1. the scrubber row — position, always full width;
        2. the control row — cluster, speed, loop.

      On narrow columns the two zones stack (the invariant that matters is that
      the height never depends on the *step* — nothing here reads `index`
      except the scrubber value). Past `@min-[640px]` of the *column's* width
      the scrubber joins the control row. A container query, not a viewport
      breakpoint, because the width that matters is
      `viewport − sidebar − code panel`, which is not monotonic in the viewport.
    */
    <div
      className={cn(
        'dock-enter shrink-0 rounded-2xl border border-border/80 bg-surface-raised/85',
        'shadow-xl shadow-black/30 backdrop-blur-md',
        'px-4 pt-3 pb-3',
      )}
    >
      <Scrubber
        className="w-full"
        index={index}
        length={length}
        onSeek={(v) => dispatch({ type: 'seek', index: v })}
        label="Scrub through steps"
        valueText={`Step ${index + 1} of ${length}`}
        before={
          <span className="w-14 shrink-0 rounded-md bg-surface-inset/80 px-1.5 py-0.5 text-center font-mono text-[10.5px] font-semibold text-text-muted tabular-nums ring-1 ring-border/60 ring-inset">
            {length === 0 ? '—' : `${index + 1}/${length}`}
          </span>
        }
        after={
          <span className="w-12 shrink-0 text-right font-mono text-[10.5px] font-medium text-text-subtle tabular-nums">
            {length === 0 ? '—' : `${Math.round((index / Math.max(1, length - 1)) * 100)}%`}
          </span>
        }
      />

      <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5 sm:justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => dispatch({ type: 'first' })}
            disabled={flags.atStart}
            className={btn}
            title="First step (Home)"
            aria-label="First step"
          >
            <ChevronFirst className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'stepBack' })}
            disabled={!flags.canStepBack}
            className={btn}
            title="Step back (←)"
            aria-label="Step back"
          >
            <SkipBack className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'toggle' })}
            disabled={length === 0}
            className={cn(
              playBtn,
              'mx-1 size-11 rounded-full bg-accent text-text-inverse shadow-lg shadow-accent-deep/30',
              'transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
              'hover:scale-105 hover:bg-accent-hover hover:shadow-accent-deep/40',
              'active:scale-95',
              'disabled:hover:scale-100 disabled:hover:bg-accent',
            )}
            title="Play / pause (Space)"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="size-4 fill-current" />
            ) : (
              <Play className="size-4 translate-x-px fill-current" />
            )}
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'stepForward' })}
            disabled={!flags.canStepForward}
            className={btn}
            title="Step forward (→)"
            aria-label="Step forward"
          >
            <SkipForward className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'last' })}
            disabled={flags.atEnd}
            className={btn}
            title="Last step (End)"
            aria-label="Last step"
          >
            <ChevronLast className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'reset' })}
            className={btn}
            title="Reset (R)"
            aria-label="Reset"
          >
            <RotateCcw className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-transparent px-2 py-1 text-[11px] font-medium text-text-subtle transition-colors select-none hover:border-border/60 hover:text-text-muted">
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => setLoop(e.target.checked)}
              className="size-3.5 accent-accent"
            />
            loop
          </label>
          {reduced ? (
            <span
              className="rounded-full border border-border bg-surface-inset px-2.5 py-1 text-[10.5px] font-medium text-text-subtle"
              title="Reduced motion is on: playback is fixed at one step per second. Change it in your OS accessibility settings."
            >
              1/s · reduced motion
            </span>
          ) : (
            <fieldset
              className="flex overflow-hidden rounded-full border border-border-strong/80 bg-surface-inset/60 p-0.5"
              title="Playback speed"
            >
              <legend className="sr-only">Playback speed</legend>
              {SPEEDS.map((s) => (
                <label
                  key={s}
                  className={cn(
                    'cursor-pointer rounded-full px-2.5 py-1 font-mono text-[10.5px] tabular-nums transition-all duration-150 select-none',
                    'has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-accent',
                    s === speed
                      ? 'bg-accent font-bold text-text-inverse shadow-sm shadow-accent-deep/20'
                      : 'text-text-muted hover:bg-surface-overlay/60 hover:text-text',
                  )}
                >
                  <input
                    type="radio"
                    name="playback-speed"
                    className="sr-only"
                    checked={s === speed}
                    onChange={() => setSpeed(s as Speed)}
                  />
                  {s}
                </label>
              ))}
            </fieldset>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Subscribe to the media query.
 *
 * A tiny hook rather than `useState` in the store: it changes at most a couple
 * of times in a session, and putting it in the store would make every other
 * component's selector chain depend on it.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => onReducedMotionChange(setReduced), []);
  return reduced;
}

const btn = cn(
  'flex size-9 items-center justify-center rounded-full text-text-muted',
  'transition-all duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]',
  'hover:scale-105 hover:bg-surface-overlay/70 hover:text-white active:scale-95',
  'disabled:pointer-events-none disabled:opacity-30',
);

const playBtn = cn('flex items-center justify-center');
