import { AlertTriangle, Keyboard, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATALOG, type CatalogEntry, searchCatalog } from '../../core/algorithms/catalog.ts';
import { CATEGORIES, CATEGORY_LABEL, type Category } from '../../core/algorithms/types.ts';
import { cn } from '../../lib/utils.ts';
import { usePlayer } from '../player/playerStore.ts';

/**
 * The algorithm index.
 *
 * Built from `catalog.ts` — pure metadata, no generators, no source listings.
 * That is why opening the app does not download 50 algorithms' worth of code
 * and four languages' worth of listings; only the one selected algorithm is
 * imported, on demand.
 *
 * Navigation only. It used to also carry the current algorithm's "when to use
 * it" prose, which is fifteen lines about one algorithm rendered beneath a
 * 66-item list of all of them; that moved to the header's detail panel.
 */

export function Sidebar() {
  const open = usePlayer((s) => s.sidebarOpen);
  const setOpen = usePlayer((s) => s.setSidebarOpen);
  const algoId = usePlayer((s) => s.algoId);
  const load = usePlayer((s) => s.load);
  const [query, setQuery] = useState('');

  const results = useMemo(() => searchCatalog(query), [query]);
  const grouped = useMemo(() => {
    const byCat = new Map<Category, CatalogEntry[]>();
    for (const e of results) {
      const list = byCat.get(e.category) ?? [];
      list.push(e);
      byCat.set(e.category, list);
    }
    return CATEGORIES.filter((c) => byCat.has(c.id)).map((c) => ({
      ...c,
      items: byCat.get(c.id) ?? [],
    }));
  }, [results]);

  return (
    <>
      {/*
        The scrim, and the same reasoning as the code panel's: it is a
        click-anywhere-else convenience, so it leaves the accessibility tree.
        It used to be named "Close the algorithm list", which is a name the
        drawer's own dismiss button should carry instead — and "Close", which is
        what that button used to be called, is close to meaningless announced out
        of context. So the visible control gets the real name and the backdrop
        gets none, which is also why `tabIndex={-1}` is here: an `aria-hidden`
        element that can still be focused is an ARIA error.
      */}
      {open ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-surface/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <aside
        className={cn(
          'z-40 flex shrink-0 flex-col overflow-hidden border-r border-border/80 bg-surface-raised/80',
          // Mobile: a drawer that slides. Desktop: a column that collapses.
          //
          // The two need different mechanics, and mixing them is what made the
          // menu button look dead. `lg:translate-x-0` used to sit in the base
          // class list, and a `lg:` variant always beats an unprefixed one in the
          // generated stylesheet regardless of the order they appear in the
          // attribute — so on any screen ≥1024px the `-translate-x-full` that
          // `open === false` applies was silently overridden and the sidebar
          // never moved. It is not a "mostly works" case; the button did nothing
          // at all on desktop, which is where most people meet it.
          //
          // So desktop collapses `width` instead of translating, and `open` is
          // honoured at every breakpoint.
          'fixed inset-y-0 left-0 w-72 transition-transform duration-200 ease-out',
          'lg:static lg:translate-x-0 lg:transition-[width] lg:duration-300 lg:ease-out',
          open ? 'translate-x-0 lg:w-72' : '-translate-x-full lg:w-0 lg:border-r-0',
        )}
        // Collapsed, the content is clipped to zero width but still in the tab
        // order and the accessibility tree. `inert` removes both, so a keyboard
        // user cannot tab into an invisible sidebar.
        inert={!open}
        aria-label="Algorithms"
      >
        <div className="flex items-center gap-2.5 border-b border-border/80 bg-surface-raised/50 px-3 py-2.5">
          <img
            src="/favicon.svg"
            alt=""
            width={28}
            height={28}
            className="shrink-0 drop-shadow-sm"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-bold tracking-tight text-text-strong">
              Unroll
            </div>
            <div className="text-[10px] font-medium text-text-subtle">
              {CATALOG.length} algorithm{CATALOG.length === 1 ? '' : 's'} · 4 languages
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md p-1.5 text-text-subtle transition-colors hover:bg-surface-inset hover:text-text-muted lg:hidden"
            aria-label="Close the algorithm list"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="shrink-0 border-b border-border/80 bg-surface-raised/30 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-text-subtle" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${CATALOG.length} algorithms…`}
              className="w-full rounded-lg border border-border-strong/80 bg-surface-inset/80 py-1.5 pr-2 pl-8 text-[12px] text-text placeholder:text-text-subtle transition-colors focus:border-accent/70 focus:bg-surface-inset focus:outline-none"
              aria-label="Search algorithms"
            />
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
          {grouped.length === 0 ? (
            <p className="px-3 py-8 text-center text-[12px] leading-relaxed text-text-subtle">
              Nothing matches &ldquo;{query}&rdquo;.
            </p>
          ) : null}
          {grouped.map((group) => (
            <section key={group.id} className="mb-3">
              <h3 className="px-2 py-1 text-[10px] font-bold tracking-wider text-text-subtle uppercase">
                {group.label}
                <span className="ml-1.5 font-normal normal-case text-text-faint">
                  {group.blurb}
                </span>
              </h3>
              <ul>
                {group.items.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => {
                        void load(entry.id);
                        /*
                         * Dismiss only where the sidebar is a drawer.
                         *
                         * Unconditionally closing made the list vanish every time
                         * you picked an algorithm, which is wrong on desktop: past
                         * `lg` this element is a static column, so "closing" it
                         * meant collapsing the navigation to zero width and hiding
                         * it behind the menu button. Choosing an algorithm from a
                         * list you are still reading is not a dismissal.
                         *
                         * Below `lg` it genuinely is an overlay, and the backdrop
                         * covers the list, so it must go — otherwise the student
                         * taps the algorithm they wanted and appears to be still
                         * looking at the menu.
                         *
                         * 1024px is Tailwind's `lg`, the same breakpoint the class
                         * list above uses. It is spelled out rather than shared
                         * because the two live in different worlds: one is a
                         * generated stylesheet, the other a media query, and
                         * nothing keeps them in step but this comment.
                         */
                        if (!window.matchMedia('(min-width: 1024px)').matches) setOpen(false);
                      }}
                      aria-current={entry.id === algoId ? 'true' : undefined}
                      className={cn(
                        'w-full rounded px-2 py-1.5 text-left transition-colors',
                        entry.id === algoId
                          ? 'bg-accent/15 text-accent-strong ring-1 ring-accent/40'
                          : 'text-text-muted hover:bg-surface-inset',
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[12.5px] font-medium">{entry.title}</span>
                        <LevelDot level={entry.level} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>

        {/*
          The footer is now navigation and nothing else.

          "When to use it" used to live here: a fifteen-line paragraph rendered
          under a 66-item list, so finding an algorithm and reading about it were
          the same scroll, and the paragraph was the only thing in the column
          that was about the *current* algorithm rather than the catalogue. It
          moved into the header's detail panel, which is where you are already
          looking when you want to know what the thing you just picked actually
          does.
        */}
        <div className="shrink-0 border-t border-border/80 bg-surface-raised/40 px-3 py-2">
          <button
            type="button"
            onClick={() => usePlayer.getState().setShortcutsOpen(true)}
            className="flex w-full items-center gap-1.5 text-left text-[10px] text-text-subtle transition-colors hover:text-text-muted"
          >
            <Keyboard className="size-3 shrink-0" />
            keyboard shortcuts
            <kbd className="ml-auto rounded border border-border-strong px-1 font-mono text-[9px] text-text-muted">
              ?
            </kbd>
          </button>
        </div>
      </aside>
    </>
  );
}

function LevelDot({ level }: { level: CatalogEntry['level'] }) {
  const colour =
    level === 'intro' ? 'bg-success' : level === 'intermediate' ? 'bg-accent' : 'bg-danger';
  const label =
    level === 'intro' ? 'Introductory' : level === 'intermediate' ? 'Intermediate' : 'Advanced';
  // `role="img"` so the `aria-label` has something to attach to; a bare span
  // with aria-label is announced as nothing at all.
  return (
    <span
      role="img"
      className={cn('size-1.5 shrink-0 rounded-full', colour)}
      title={label}
      aria-label={label}
    />
  );
}

export { AlertTriangle, CATEGORY_LABEL };
