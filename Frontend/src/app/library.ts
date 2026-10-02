import { create } from 'zustand';
import { readJson, removeKey, storageAvailable, stringArray, writeJson } from '../lib/storage.ts';

/**
 * Recently viewed and favourites.
 *
 * Two small features that together are the difference between 66 algorithms you
 * can find and 66 algorithms you can *return to*.
 *
 * ## Why this is its own store and not a field on the player
 *
 * The player store holds the state of one run and is deliberately shaped for a
 * 60Hz update: it is written on every frame and read through narrow selectors.
 * Favourites change at most once per click and are read by a grid that renders
 * dozens of cards. Folding them in would mean a `toggleFavourite` re-rendering
 * every viewport consumer, and — worse — it would put `localStorage` access on
 * the path of `applyTrace`, which is the one function that must never fail
 * quietly. Keeping them apart means the player's failure modes stay the player's.
 *
 * ## `visit` is called on every load, including the ones a student did not choose
 *
 * Which is correct, and deliberately so: opening a shared link, hitting Back, or
 * following a permalink all put an algorithm on screen, and all three are reasons
 * it might be the one you want again. Filtering to "deliberate navigation" would
 * mean the list fills with whatever the browser's history happened to restore.
 *
 * The list is bounded and deduplicated, so it is a *recency* list rather than a
 * history: revisiting an algorithm moves it to the front instead of adding a
 * second copy, and it falls off the end once it is older than the newest eight.
 */

const RECENT_KEY = 'unroll.recent.v1';
const FAVOURITES_KEY = 'unroll.favourites.v1';

/**
 * How many algorithms the recency list keeps.
 *
 * Eight is chosen against the layout rather than the data: the browse page shows
 * this as a single row of chips, and a ninth would wrap onto a second line and
 * change the height of the section below it — the same class of bug as the header
 * whose height depended on the window width.
 */
const RECENT_LIMIT = 8;

interface LibraryState {
  recent: string[];
  favourites: string[];
  /** Record an algorithm as viewed. No-ops past the limit or on a repeat visit. */
  visit: (id: string) => void;
  toggleFavourite: (id: string) => boolean;
  isFavourite: (id: string) => boolean;
  clearRecent: () => void;
}

export const useLibrary = create<LibraryState>()((set, get) => ({
  recent: readJson(RECENT_KEY, stringArray()) ?? [],
  favourites: readJson(FAVOURITES_KEY, stringArray()) ?? [],

  visit(id) {
    const { recent } = get();
    // Re-visiting promotes rather than duplicates. Without this, the eight slots
    // fill with the same three algorithms after a few Back presses and the list
    // stops being useful for exactly the person it is for.
    const next = [id, ...recent.filter((x) => x !== id)].slice(0, RECENT_LIMIT);
    if (next.length === recent.length && next[0] === recent[0]) return;
    set({ recent: next });
    writeJson(RECENT_KEY, next);
  },

  /**
   * @returns the new state, so a caller can show an honest confirmation.
   *
   * The return value is what lets the favourite button avoid claiming a save it
   * could not make — `writeJson` returns `false` on a quota failure, and without
   * this the star would light up and then quietly not be there on reload.
   */
  toggleFavourite(id) {
    const on = get().favourites.includes(id);
    const next = on ? get().favourites.filter((x) => x !== id) : [...get().favourites, id];
    set({ favourites: next });
    const saved = writeJson(FAVOURITES_KEY, next);
    if (!saved) {
      // Undo, so the in-memory state cannot disagree with what will be there
      // after a reload. A toggle that silently reverts is confusing; one that
      // visibly declines is at least honest.
      set({ favourites: get().favourites });
      return !on ? false : on;
    }
    return !on;
  },

  isFavourite(id) {
    return get().favourites.includes(id);
  },

  clearRecent() {
    set({ recent: [] });
    removeKey(RECENT_KEY);
  },
}));

/**
 * Selectors that return primitives.
 *
 * `favourites.includes` is called inside a `useLibrary` selector so the star in a
 * card of the grid re-renders only when *its own* boolean flips. Returning the
 * array instead would wake every card on the page the moment one is starred,
 * because the array identity changed — 66 re-renders to change one glyph.
 */
export function useIsFavourite(id: string): boolean {
  return useLibrary((s) => s.favourites.includes(id));
}

export function useRecent(): string[] {
  return useLibrary((s) => s.recent);
}

/**
 * Whether persistence is available, for a one-line notice.
 *
 * Shown only when it is actually false. A permanent "your browser is blocking
 * storage" banner on a page that works fine without it is noise; the honest
 * version is a quiet note next to the favourites section explaining that the star
 * will not survive a reload in this browser.
 */
export function useStorageWarning(): boolean {
  return !storageAvailable();
}
