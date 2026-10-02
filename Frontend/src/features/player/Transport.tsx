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
 * Transport controls.
 *
 * The one component in the app that must *not* subscribe to `index`. It
 * subscribes to `useTransportFlags`, which is derived booleans that change at
 * human speed. If this component subscribed to the index it would re-render 60
 * times a second for the privilege of drawing a playhead that moved one pixel.
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
      The transport.

      ## One row or two, decided by a container query and not by a breakpoint

      This used to be two rows at every width: controls, then a scrubber. At 1440 the
      middle column is 692px — `1440 − 288` sidebar − `32vw` code panel — and the
      control row needs about 450px on its own, so the scrubber genuinely did not fit
      beside it and the second row was not laziness.

      But the width that matters is the *middle column's*, which is
      `viewport − 288 − clamp(360px, 32vw, 560px)` and therefore not monotonic in the
      viewport: at 1280 the column is 532px and at 1440 it is 692px, but at 1600 the
      code panel's own clamp starts widening the gap again. A `xl:` or `2xl:` variant
      would be guessing at that with a hardcoded threshold that is wrong at some
      width and right at another.

      So the parent is `@container` and this row switches on `@min-[620px]` of *its
      own* width — the number at which the controls plus a usable scrubber actually
      fit. That is the property being tested, so it is also the property being
      measured.

      Below that it is two rows, exactly as before. The transport's height may vary
      with the column's width, which is fine: the invariant that matters is that it
      does not vary with the *step*, and nothing in here reads `index`.
    */
    <div className="flex flex-col gap-2.5 border-t border-border/80 bg-surface-raised/70 px-3.5 py-3 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2">
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
            btn,
            'size-10 rounded-lg bg-accent text-text-inverse shadow-lg shadow-accent-deep/25 transition-all hover:bg-accent-hover hover:shadow-accent-deep/35',
            'disabled:hover:bg-accent disabled:hover:shadow-accent-deep/25',
          )}
          title="Play / pause (Space)"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
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

        {/*
          `ml-auto` only once the scrubber has joined the row.

          Before that it stays un-margined and sits immediately after the playback
          buttons, which is what it used to do — and at 390 that is measurably
          better. An earlier version forced this group onto its own full-width line
          below the container threshold, which read as tidier and cost 28px of
          visualisation on a phone: the scrubber had already wrapped to a third row
          below it, and pushing the speeds down as well made a four-row transport out
          of what used to be three.
        */}
        <div className="flex items-center gap-2 @min-[620px]:ml-auto">
          <label className="flex items-center gap-1.5 text-[10px] font-medium text-text-subtle">
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => setLoop(e.target.checked)}
              className="size-3 accent-accent"
            />
            loop
          </label>
          {/*
            A segmented control rather than a <select>. Two reasons, one visual and
            one functional: it reads as a *control* rather than a data field, and
            it shows all four speeds at once instead of hiding three of them behind
            a dropdown. Under reduced motion it collapses to a single honest label,
            because a disabled four-way selector invites the student to keep
            clicking it.
          */}
          {reduced ? (
            <span
              className="rounded-lg border border-border bg-surface-raised px-2.5 py-0.5 text-[10px] font-medium text-text-subtle"
              title="Reduced motion is on: playback is fixed at one step per second. Change it in your OS accessibility settings."
            >
              1/s · reduced motion
            </span>
          ) : (
            <fieldset
              className="flex overflow-hidden rounded-md border border-border-strong/80"
              title="Playback speed"
            >
              <legend className="sr-only">Playback speed</legend>
              {/*
                Real radios, visually replaced by their labels, rather than
                `role="radio"` on a row of buttons. Three things come free and
                would otherwise each have to be hand-built: the group is announced
                as a group of choices, arrow keys move between the speeds, and
                `Space` on a focused speed selects it rather than also toggling
                playback — which is exactly what happens with a button, since the
                global shortcut handler does not ignore <button>.
              */}
              {SPEEDS.map((s) => (
                <label
                  key={s}
                  className={cn(
                    'cursor-pointer px-2 py-0.5 font-mono text-[10.5px] tabular-nums transition-colors select-none',
                    'has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-accent',
                    s === speed
                      ? 'bg-accent font-bold text-text-inverse shadow-sm shadow-accent-deep/20'
                      : 'bg-surface-raised text-text-muted hover:bg-surface-inset hover:text-text',
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
        {/*
        The scrubber, and the one-row layout.

        `order-last basis-full w-full` below the container threshold — its own row,
        exactly as before — and `@min-[620px]` returns it to the control row, taking
        the slack with `flex-1`. `basis-0` rather than relying on `flex-1`'s default
        basis, so the track is sized by the space *remaining* after the fixed
        controls rather than by its own content; otherwise the track's intrinsic
        width competes with the controls and the row wraps at a width where it
        appears not to.
      */}
        <Scrubber
          className="order-last w-full basis-full @min-[620px]:order-none @min-[620px]:w-auto @min-[620px]:basis-0 @min-[620px]:flex-1"
          index={index}
          length={length}
          onSeek={(v) => dispatch({ type: 'seek', index: v })}
          label="Scrub through steps"
          valueText={`Step ${index + 1} of ${length}`}
          before={
            <span className="w-12 shrink-0 text-right font-mono text-[10px] font-medium text-text-subtle tabular-nums">
              {length === 0 ? '—' : `${index + 1}/${length}`}
            </span>
          }
          after={
            <span className="w-11 shrink-0 font-mono text-[10px] font-medium text-text-subtle tabular-nums">
              {length === 0 ? '—' : `${Math.round((index / Math.max(1, length - 1)) * 100)}%`}
            </span>
          }
        />
      </div>
    </div>
  );
}

/**
 * Subscribe to the media query.
 *
 * A tiny hook rather than a `useState` in the store: it changes at most a couple
 * of times in a session, and putting it in the store would make every other
 * component's selector chain depend on it.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => onReducedMotionChange(setReduced), []);
  return reduced;
}

const btn = cn(
  'flex size-8 items-center justify-center rounded-lg text-text-muted transition-colors',
  'hover:bg-surface-overlay/80 hover:text-white disabled:pointer-events-none disabled:opacity-30',
);
