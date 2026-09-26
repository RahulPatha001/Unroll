import type { Frame } from './types.ts';

/**
 * trace + index -> what to draw.
 *
 * A pure reducer. It knows nothing about any algorithm, which is the entire
 * point: the player is generic, so the 56th algorithm costs exactly what the
 * first one cost. Keeping it pure (no timers, no mutation) is what lets the
 * Zustand store be a thin wrapper and lets the whole transport be unit-tested
 * without React or a DOM.
 */

export interface PlayerView {
  frame: Frame | null;
  index: number;
  /** Total frames, for the scrub bar. 0 when there is no trace yet. */
  length: number;
  progress: number;
  isPlaying: boolean;
  canStepBack: boolean;
  canStepForward: boolean;
  atStart: boolean;
  atEnd: boolean;
  /** True once the last frame has been shown at least once. */
  completed: boolean;
}

/** Speeds offered in the UI, in steps per second. Deliberately coarse. */
export const SPEEDS = [1, 2, 4, 8, 16, 32, 60] as const;
export type Speed = (typeof SPEEDS)[number];
export const DEFAULT_SPEED: Speed = 4;

export function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, Math.floor(index)));
}

export function deriveView(
  trace: readonly Frame[],
  index: number,
  isPlaying: boolean,
  completed: boolean,
): PlayerView {
  const length = trace.length;
  const i = clampIndex(index, length);
  return {
    frame: length > 0 ? (trace[i] ?? null) : null,
    index: i,
    length,
    progress: length > 1 ? i / (length - 1) : length > 0 ? 1 : 0,
    isPlaying,
    canStepBack: length > 0 && i > 0,
    canStepForward: length > 0 && i < length - 1,
    atStart: length === 0 || i === 0,
    atEnd: length === 0 || i === length - 1,
    completed: completed && length > 0,
  };
}

export type TransportAction =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'stepForward' }
  | { type: 'stepBack' }
  | { type: 'jump'; delta: number }
  | { type: 'seek'; index: number }
  | { type: 'first' }
  | { type: 'last' }
  | { type: 'reset' }
  | { type: 'setSpeed'; speed: Speed };

export interface TransportState {
  index: number;
  isPlaying: boolean;
  speed: Speed;
  completed: boolean;
}

export function initialTransport(): TransportState {
  return { index: 0, isPlaying: false, speed: DEFAULT_SPEED, completed: false };
}

/**
 * Pure transport reducer.
 *
 * Two behaviours worth calling out, because they are the difference between a
 * toy player and one students actually use:
 *
 *  - **Reaching the end pauses.** It does not loop silently. Looping is
 *    available, but it is an explicit mode, because a student who thinks the
 *    animation "finished" and is actually on pass 1 of 6 has been misled.
 *
 *  - **Stepping backwards mid-playback keeps playing.** Pressing ← to re-read a
 *    step should not cancel the animation. Cancelling on manual input is the
 *    more common choice and the wrong one.
 */
export function transport(
  state: TransportState,
  action: TransportAction,
  length: number,
): TransportState {
  const at = (i: number): number => clampIndex(i, length);
  const last = length - 1;
  // `length` is the trace size and is the only thing that decides whether an
  // action is a no-op, so it is threaded through rather than read from state —
  // the store holds `trace`, not `length`, and duplicating it would let the two
  // drift.

  switch (action.type) {
    case 'play':
      // Restarting from the end is almost always what "play" means once the
      // animation has run out, so send it back to the start first.
      return length === 0
        ? state
        : state.index >= last
          ? { ...state, index: 0, isPlaying: true, completed: false }
          : { ...state, isPlaying: true };

    case 'pause':
      return { ...state, isPlaying: false };

    case 'toggle':
      return transport(state, state.isPlaying ? { type: 'pause' } : { type: 'play' }, length);

    case 'stepForward': {
      const index = at(state.index + 1);
      return {
        ...state,
        index,
        // Stepping onto the final frame counts as having seen it all, and
        // stepping past it stops the animation.
        completed: state.completed || index >= last,
        isPlaying: state.isPlaying && index < last,
      };
    }

    case 'stepBack':
      // Deliberately leaves `isPlaying` alone. Students scrub backwards
      // mid-playback to re-read a step, and cancelling the animation on manual
      // input is the more common choice and the wrong one.
      return { ...state, index: at(state.index - 1), completed: false };

    case 'jump':
      return { ...state, index: at(state.index + action.delta), completed: false };

    case 'seek': {
      const index = at(action.index);
      return {
        ...state,
        index,
        isPlaying: state.isPlaying && index < last,
        completed: index >= last && last >= 0 ? true : state.completed,
      };
    }

    case 'first':
      return { ...state, index: 0, isPlaying: false, completed: false };

    case 'last':
      return { ...state, index: Math.max(0, last), isPlaying: false, completed: length > 0 };

    case 'reset':
      return { ...state, index: 0, isPlaying: false, completed: false };

    case 'setSpeed':
      return { ...state, speed: action.speed };

    default:
      return state;
  }
}

/** Milliseconds per step at a given speed. The floor keeps 60fps sane. */
export function stepInterval(speed: Speed): number {
  return Math.max(16, Math.round(1000 / speed));
}
