import { useMemo } from 'react';
import { create } from 'zustand';
import { readJson, removeKey, stringArray, writeJson } from '../../lib/storage.ts';

/**
 * Which roadmap questions the learner has ticked off.
 *
 * ## Why this is a separate store, and not a field on `useLibrary`
 *
 * `app/library.ts` holds recently-viewed *algorithms* and favourite algorithms. This
 * holds *questions*, on a page that only `/roadmap` mounts. Three reasons for the
 * split, in increasing order of how much they would have hurt:
 *
 *  1. **Different keys, different lifetimes.** A favourite is a bookmark you might
 *     want in a year; a ticked question is a claim about work already done. They are
 *     also written by different interactions — a star click versus a checkbox — so
 *     sharing a store means every reader of `library.ts` re-renders on every tick.
 *  2. **Different failure semantics.** `toggleFavourite` *undoes itself* on a failed
 *     write, because a star that lights up and then forgets is a lie about a bookmark.
 *     A checkbox should not silently revert: the learner ticked it, it stays ticked in
 *     this session, and a one-line note tells them it will not survive a reload. The
 *     failure is handled the same way and the *response* is opposite, which is
 *     clearest as two stores.
 *  3. **`RECENT_LIMIT` would not fit it.** The library store is bounded on purpose —
 *     a recent list that grows forever stops being a recent list. Solved questions are
 *     the opposite: truncating them would delete real progress.
 *
 * ## Bounded, but generously, and by a different rule
 *
 * See `SOLVED_LIMIT`. The bound exists only to stop a hand-edited or corrupted value
 * from being written back forever, not to keep the list short.
 */

/**
 * The cap on stored question ids.
 *
 * Two hundred and fifty-six, not eight and not unlimited. It has to exceed the size
 * of the largest plausible roadmap a person actually finishes — so it is comfortably
 * above the current total rather than a round UI number — and it has to be a bound at
 * all, because `stringArray`'s validator is the only thing standing between a corrupted
 * `localStorage` value and an unbounded read on every page load.
 */
const SOLVED_LIMIT = 256;

const SOLVED_KEY = 'unroll.roadmap.solved.v1';

interface SolvedState {
  /** Question ids, in the order they were ticked. */
  solved: string[];
  /** @returns the new state, so a caller can report honestly whether it persisted. */
  toggleSolved: (id: string) => boolean;
  clearSolved: () => void;
}

export const useSolved = create<SolvedState>()((set, get) => ({
  solved: readJson(SOLVED_KEY, stringArray(SOLVED_LIMIT)) ?? [],

  toggleSolved(id) {
    const on = get().solved.includes(id);
    const next = on ? get().solved.filter((x) => x !== id) : [...get().solved, id];
    set({ solved: next });
    const saved = writeJson(SOLVED_KEY, next);
    if (!saved) {
      // Undo, so the in-memory state cannot disagree with what is there after a
      // reload. Same reasoning as `library.ts`: a control that visibly declines is
      // honest, and one that silently forgets is not. The caller shows a note.
      set({ solved: get().solved });
      return on;
    }
    return !on;
  },

  clearSolved() {
    set({ solved: [] });
    removeKey(SOLVED_KEY);
  },
}));

/**
 * Whether one question is ticked.
 *
 * The same primitive-selector trick `useIsFavourite` uses, and for the same reason:
 * returning `solved` would wake every question row on the page — over three hundred of
 * them — for one click, because the array identity changed. Selecting the boolean means
 * exactly one row re-renders.
 */
export function useIsSolved(id: string): boolean {
  return useSolved((s) => s.solved.includes(id));
}

/** The ticked ids as a `Set`, for the many-at-once progress maths. */
export function useSolvedSet(): ReadonlySet<string> {
  const solved = useSolved((s) => s.solved);
  // Memoised on the array identity, so the Set is rebuilt exactly when the list
  // changes. The phase headers ask it `has` for every question in the phase, and
  // allocating a fresh 256-entry Set on every render to answer a handful of `has`
  // calls is pure waste — and, worse, it would be a new identity every render, which
  // makes it useless as a dependency.
  return useMemo(() => new Set<string>(solved), [solved]);
}
