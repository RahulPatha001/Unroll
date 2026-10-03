import { ArrowRight, BookOpen, CornerDownLeft, Search, Shapes } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type CatalogEntry, searchCatalog } from '../core/algorithms/catalog.ts';
import { CATEGORY_LABEL } from '../core/algorithms/types.ts';
import { ARTICLE_LIST } from '../core/learn/index.ts';
import { cn } from '../lib/utils.ts';

/**
 * ⌘K search across algorithms and articles.
 *
 * ## Why this exists when there is already a search box on the browse page
 *
 * Because they answer different questions at different moments. The browse page's
 * input is a *browsing* control: it filters a grid the student is looking at, and
 * it is off-screen once they scroll past the hero. This is a *recall* control,
 * reachable from anywhere without moving the mouse or the focus, and it searches
 * articles as well as algorithms — so "how does a heap actually work" can find
 * the explainer and "heap" can find the visualiser, from the same keystrokes.
 *
 * With 66 algorithms across 14 families, plain recall is genuinely hard. The
 * sidebar's search only sees you if you know the app has a sidebar.
 *
 * ## Ranking
 *
 * Subsequence matching, not substring. Typing `bs` should find Bubble Sort, and a
 * substring search cannot do that — but "the words a student would type" is
 * exactly what the catalog's `aka` and `tags` fields were authored for, so those
 * are searched as ordinary substrings and the title gets the subsequence pass.
 *
 * Scores are coarse integers on purpose. The only thing being asked of the sort
 * is "is this a better match than that", and a float precision that nobody can
 * perceive costs a comparator that is harder to read than it is to justify.
 */

/** A search result. `kind` drives the icon and the group heading. */
interface Hit {
  kind: 'algorithm' | 'article';
  /** The path to navigate to. */
  to: string;
  title: string;
  subtitle: string;
  score: number;
}

/**
 * A subsequence match score, or `null` if `q` is not a subsequence of `text`.
 *
 * Consecutive runs and prefix hits are rewarded, so `bs` ranks "bubble sort" over
 * a title that merely happens to contain a `b` and later an `s`. Returns a
 * position rather than a boolean so the caller can highlight the matched run.
 */
function subsequenceScore(text: string, q: string): number | null {
  if (!q) return 0;
  let score = 0;
  let ti = 0;
  let streak = 0;
  for (const ch of q) {
    const at = text.indexOf(ch, ti);
    if (at === -1) return null;
    // A match at the start of the word, or immediately after the previous one, is
    // worth much more than a match buried in the middle.
    if (at === ti && ti > 0) streak += 1;
    else streak = 0;
    score += 10 + streak * 6;
    if (at === 0) score += 20;
    else if (text[at - 1] === ' ' || text[at - 1] === '-') score += 8;
    ti = at + 1;
  }
  // A shorter title that used the whole query is the better match.
  score += Math.max(0, 20 - text.length / 4);
  return score;
}

function hitFor(entry: CatalogEntry, q: string): Hit | null {
  const title = entry.title.toLowerCase();
  const base: Hit = {
    kind: 'algorithm',
    to: `/?algo=${entry.id}`,
    title: entry.title,
    subtitle: `${CATEGORY_LABEL[entry.category]} · ${entry.summary}`,
    score: 0,
  };

  if (!q) return { ...base, score: 0 };

  // An exact title is unbeatable, and it is the case that matters most: someone
  // who has learned the name and is retyping it should land on it first.
  if (title === q) return { ...base, score: 10_000 };

  // `tags` and `aka` are authored search vocabulary — "nlogn", "tortoise and
  // hare", "divide and conquer". A hit there is a real hit and ranks above a
  // scattered subsequence match in the summary.
  const vocabulary = [entry.summary, ...entry.tags, ...(entry.aka ?? [])].join(' ').toLowerCase();
  if (vocabulary.includes(q)) return { ...base, score: 400 };

  const sub = subsequenceScore(title, q);
  if (sub !== null) return { ...base, score: 100 + sub };

  return null;
}

function articleHit(
  a: { slug: string; title: string; dek: string; tags: readonly string[] },
  q: string,
): Hit | null {
  const title = a.title.toLowerCase();
  const base: Hit = {
    kind: 'article',
    to: `/learn/${a.slug}`,
    title: a.title,
    subtitle: a.dek,
    score: 0,
  };
  if (!q) return { ...base, score: 0 };
  if (title === q) return { ...base, score: 10_000 };
  if ([a.dek, ...a.tags].join(' ').toLowerCase().includes(q)) return { ...base, score: 400 };
  const sub = subsequenceScore(title, q);
  if (sub !== null) return { ...base, score: 100 + sub };
  return null;
}

/**
 * The results, for tests and for the palette.
 *
 * Exported and pure so the ranking can be unit-tested without a DOM. `limit` is
 * applied per group rather than overall, because "the four best articles, then no
 * algorithms at all" is a worse answer than one of each.
 */
export function searchEverything(query: string, limit = 6): Hit[] {
  const q = query.trim().toLowerCase();
  const algorithms = searchCatalog(q)
    .map((e) => hitFor(e, q))
    .filter((h): h is Hit => h !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  const articles = ARTICLE_LIST.map((a) => articleHit(a, q))
    .filter((h): h is Hit => h !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return [...algorithms, ...articles];
}

export function CommandPaletteDialog({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (to: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const hits = useMemo(() => (open ? searchEverything(query) : []), [open, query]);

  // Reset on open, so reopening the palette never shows the previous search's
  // results or a cursor pointing past the end of a shorter new list.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCursor(0);
    // The input has to be focused after the dialog is in the DOM, not
    // simultaneously with it, or the focus lands on the node being inserted and
    // is then dropped by the browser's own autofocus handling.
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  const go = useCallback(
    (to: string) => {
      onNavigate(to);
      onClose();
    },
    [onNavigate, onClose],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (hits.length === 0 ? 0 : (c + 1) % hits.length));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (hits.length === 0 ? 0 : (c - 1 + hits.length) % hits.length));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const hit = hits[cursor];
      if (hit) go(hit.to);
    }
  };

  // Keep the active row in view when arrowing through a long list.
  useEffect(() => {
    const el = listRef.current?.children[cursor] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh] sm:pt-[16vh]">
      {/*
        The backdrop carries no accessible name and no `onClick`-to-dismiss role,
        for the same reason the player's two scrims do: it is a convenience, not an
        affordance. `Escape` and the close button are the real ones, and giving the
        backdrop a name means a screen-reader user hears two identically-labelled
        controls and cannot tell them apart.
      */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="fade-in absolute inset-0 bg-surface/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search algorithms and articles"
        className="pop-in relative flex max-h-[min(70vh,560px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border-strong bg-surface-raised shadow-2xl shadow-black/60"
      >
        <div className="flex shrink-0 items-center gap-2.5 border-b border-border/80 px-3.5">
          <Search className="size-4 shrink-0 text-text-subtle" />
          {/*
            The keyboard handler is on the input rather than on a wrapper.

            Two reasons, and the second is the good one. First, every key it handles
            — Escape, arrows, Enter — is meaningful in a text field, so a user who
            tabs *into* the list and then presses ArrowDown still gets the right
            behaviour; bound to a wrapper, it only works while the input happens to
            hold focus. Second, a `keydown` handler on a non-interactive `<div>` is
            invisible to assistive technology and unreachable by keyboard, which is
            the same defect the a11y linter is pointing at — a handler that appears
            to work and is only wired to a focus path that exists by accident.
          */}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search 66 algorithms and guides…"
            aria-label="Search algorithms and articles"
            aria-controls="palette-results"
            aria-activedescendant={hits[cursor] ? `palette-hit-${cursor}` : undefined}
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            // `autoComplete="off"` matters more than it looks: without it Chrome
            // offers previously-typed *URLs* for a field shaped like a search box,
            // and hitting Enter can then submit a browser suggestion instead of the
            // highlighted result.
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent py-3 text-[14px] text-text-strong outline-none placeholder:text-text-subtle"
          />
          <kbd className="hidden shrink-0 rounded border border-border-strong px-1.5 py-0.5 font-mono text-[10px] text-text-subtle sm:block">
            esc
          </kbd>
        </div>

        {/*
          A `<div role="listbox">` rather than a `<ul>`.

          `ul` already means "list", so putting `role="listbox"` on it is an
          override of a non-interactive element with an interactive role — which is
          exactly what `noNoninteractiveElementToInteractiveRole` exists to catch,
          and it is right to: the override also throws away the implicit list
          semantics a screen reader would otherwise announce. A plain `div` with an
          explicit `role="listbox"` has no semantics to override, so the role is the
          whole story.
        */}
        <div
          ref={listRef}
          id="palette-results"
          className="min-h-0 flex-1 overflow-y-auto p-1.5"
          role="listbox"
          aria-label="Results"
        >
          {hits.length === 0 ? (
            <div className="px-3 py-6 text-center text-[13px] text-text-subtle">
              Nothing matches “{query}”.
            </div>
          ) : (
            hits.map((hit, i) => (
              /*
                `role="presentation"` on the row and `role="option"` on the button
                inside it.

                The straightforward markup — a wrapper with `role="option"` around a
                `<button>` — nests an interactive element inside a role that is not
                interactive and gives the option no focus behaviour of its own. The
                listbox pattern expects its options to *be* the interactive things.
                Making the wrapper presentational puts the button in the listbox's
                place in the accessibility tree, so the option is focusable,
                selectable and announced correctly.

                `aria-activedescendant` on the input, rather than moving DOM focus,
                is what lets someone arrow through results without the caret leaving
                the field — so typing a query and then browsing it are the same
                interaction rather than two that fight over focus.
              */
              <div key={`${hit.kind}:${hit.to}`} role="presentation">
                <button
                  type="button"
                  id={`palette-hit-${i}`}
                  role="option"
                  aria-selected={i === cursor}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(hit.to)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                    i === cursor ? 'bg-surface-inset text-text-strong' : 'text-text-muted',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-md',
                      hit.kind === 'algorithm'
                        ? 'bg-accent/15 text-accent'
                        : 'bg-info-deep/15 text-info',
                    )}
                  >
                    {hit.kind === 'algorithm' ? (
                      <Shapes className="size-3.5" />
                    ) : (
                      <BookOpen className="size-3.5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{hit.title}</span>
                    <span className="block truncate text-[11px] text-text-subtle">
                      {hit.subtitle}
                    </span>
                  </span>
                  {i === cursor ? (
                    <CornerDownLeft className="size-3.5 shrink-0 text-text-subtle" />
                  ) : null}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-border/70 px-3 py-1.5 text-[10px] text-text-subtle">
          <Hint k="↑↓">navigate</Hint>
          <Hint k="↵">open</Hint>
          <Hint k="esc">close</Hint>
          <span className="ml-auto inline-flex items-center gap-1">
            <ArrowRight className="size-3" />
            {hits.length} result{hits.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    </div>
  );
}

function Hint({ k, children }: { k: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <kbd className="rounded border border-border-strong px-1 font-mono">{k}</kbd>
      {children}
    </span>
  );
}

/**
 * The ⌘K trigger, and the global shortcut.
 *
 * Mounted once, on the pages that want it. The listener is on `document` rather
 * than on a focused element so the shortcut works from anywhere, and it ignores
 * events originating in a text field — otherwise pressing ⌘K while typing a custom
 * input into the editor opens the palette and swallows the keystroke.
 */
export function useCommandPalette(onOpen: () => void): {
  open: boolean;
  setOpen: (v: boolean) => void;
} {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isK = e.key === 'k' || e.key === 'K';
      if (!isK || !(e.metaKey || e.ctrlKey)) return;
      const el = e.target as HTMLElement | null;
      const typing =
        el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable === true;
      if (typing) return;
      e.preventDefault();
      onOpen();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onOpen]);

  return { open, setOpen };
}
