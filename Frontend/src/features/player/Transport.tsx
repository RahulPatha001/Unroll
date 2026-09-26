import {
  ChevronFirst,
  ChevronLast,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SPEEDS, type Speed, stepInterval } from '../../core/trace/player.ts';
import {
  onReducedMotionChange,
  prefersReducedMotion,
  REDUCED_STEPS_PER_SECOND,
} from '../../lib/reducedMotion.ts';
import { cn } from '../../lib/utils.ts';
import { usePlayer, useTransportFlags } from './playerStore.ts';

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

  const onScrub = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      dispatch({ type: 'seek', index: Number(e.target.value) });
    },
    [dispatch],
  );

  return (
    <div className="flex flex-col gap-2.5 border-t border-slate-800/80 bg-slate-900/70 px-3.5 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-2">
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
            'size-10 rounded-lg bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/25 transition-all hover:bg-amber-300 hover:shadow-amber-500/35',
            'disabled:hover:bg-amber-400 disabled:hover:shadow-amber-500/25',
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

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500">
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => setLoop(e.target.checked)}
              className="size-3 accent-amber-400"
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
              className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-0.5 text-[10px] font-medium text-slate-500"
              title="Reduced motion is on: playback is fixed at one step per second. Change it in your OS accessibility settings."
            >
              1/s · reduced motion
            </span>
          ) : (
            <fieldset
              className="flex overflow-hidden rounded-md border border-slate-700/80"
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
                    'has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-amber-400',
                    s === speed
                      ? 'bg-amber-400 font-bold text-slate-950 shadow-sm shadow-amber-500/20'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200',
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

      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-right font-mono text-[10px] font-medium text-slate-500 tabular-nums">
          {length === 0 ? '—' : `${index + 1}/${length}`}
        </span>
        <div className="relative min-w-0 flex-1">
          {/*
            A filled track behind the range input. The input's own track is
            transparent, so without this the slider is a bare thumb on a flat
            line and "how far through am I" has to be read off the thumb's
            position by eye.
          */}
          <div className="pointer-events-none absolute top-1/2 h-2 w-full -translate-y-1/2 overflow-hidden rounded-full bg-slate-800/80">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300 shadow-sm shadow-amber-500/30"
              style={{
                width: `${length > 1 ? (index / (length - 1)) * 100 : 0}%`,
              }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0, length - 1)}
            value={index}
            onChange={onScrub}
            disabled={length === 0}
            className="relative h-2 w-full cursor-pointer appearance-none rounded-full bg-transparent disabled:opacity-40"
            aria-label="Scrub through steps"
            aria-valuetext={`Step ${index + 1} of ${length}`}
          />
        </div>
        <span className="w-14 shrink-0 font-mono text-[10px] font-medium text-slate-500 tabular-nums">
          {length === 0 ? '—' : `${Math.round((index / Math.max(1, length - 1)) * 100)}%`}
        </span>
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
  'flex size-8 items-center justify-center rounded-lg text-slate-300 transition-colors',
  'hover:bg-slate-700/80 hover:text-white disabled:pointer-events-none disabled:opacity-30',
);
