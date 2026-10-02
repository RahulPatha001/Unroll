import { Dices, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATALOG, type CatalogEntry, searchCatalog } from '../core/algorithms/catalog.ts';
import { CATEGORIES, CATEGORY_LABEL, type Category } from '../core/algorithms/types.ts';
import { cn } from '../lib/utils.ts';
import { AlgoRow } from './AlgoRow.tsx';
import { CommandPalette, useCommandPalette } from './CommandPalette.tsx';
import { FamilyRail } from './FamilyRail.tsx';
import { useLibrary, useRecent, useStorageWarning } from './library.ts';
import { PageBody, PageShell } from './PageShell.tsx';

/**
 * The browse page: step one of the flow.
 *
 * ## What changed, and why the previous version was wrong
 *
 * It was a hero, a stats row, a CTA and then a wall of 66 cards. Measured on the
 * captured baselines: **470px of 900px (52%) of preamble on a desktop, and 610px
 * of 844px (72%) on a phone** — where you saw one and a half cards. For a page
 * whose entire job is to let someone pick one of 66 things, that is backwards.
 *
 * Worse, it was the wrong *register*. The rest of this app is a dense,
 * keyboard-driven instrument; the front door was a marketing page with a
 * gradient headline and a glowing button. `index.css` had already made the
 * argument in the other direction — "a pulsing background behind a button is a
 * well-worn way to make an interface feel like a landing page rather than a tool"
 * — and the page then did precisely that. Self-inflicted.
 *
 * So: the claim stays, at one line, because it is genuinely the product's
 * differentiator and both e2e tests assert it. Everything else that was taking
 * that 470px is gone.
 *
 * ## The two things that replaced it
 *
 * - **A family rail.** Fourteen families with counts *and blurbs*. The blurb is
 *    the page's only real guidance, and it already existed — `CATEGORIES` ships a
 *    hand-written line each ("Nodes, edges, traversal", "Trade space for speed").
 *    A pill said "Graphs". A rail says what graphs are, how many there are, and
 *    how to get there. It also bounds the choice: the largest family is ten
 *    algorithms, so picking one means a list that fits on a screen.
 * - **Rows.** Spacious, but roughly half the height of a card, with the text in
 *    one aligned column so the eye scans a straight edge.
 *
 * ## What is deliberately *not* here
 *
 * **A "start here" path.** It was the obvious thing to add and the data killed it.
 * The level split is 19 intro / 37 intermediate / 10 advanced — a three-stage path
 * has stage two as a wall again. And deriving an on-ramp from intro-level
 * algorithms in catalog order gives bubble → insertion → selection → binary search
 * → linear search → container with most water: three quadratic sorts running, then
 * straight into two-pointer container problems. That is not a designed path, it is
 * an accident of ordering, and presenting an accident as pedagogy is worse than
 * offering no path at all.
 *
 * So the only guidance here is *true*: where you actually left off, and the family
 * taxonomy the data already carries.
 *
 * ## Filter state is local, not in the URL
 *
 * Deliberate, and it was true before too. Nobody has ever wanted a shareable
 * "category = graphs, level = advanced" link, and putting it in the query string
 * would collide with the player's own keys the moment a card was followed.
 */

type LevelFilter = CatalogEntry['level'] | 'all';

const LEVELS: Array<{ id: LevelFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'intro', label: 'Intro' },
  { id: 'intermediate', label: 'Middle' },
  { id: 'advanced', label: 'Hard' },
];

export function Browse({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate: (to: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState<Category | 'all'>('all');
  const [level, setLevel] = useState<LevelFilter>('all');

  // `setOpen` is stable, so the ⌘K listener registers once rather than on every
  // keystroke in the search box below.
  const { open, setOpen } = useCommandPalette(() => setOpen(true));

  const recent = useRecent();
  const favourites = useLibrary((s) => s.favourites);
  const storageWarning = useStorageWarning();

  const byText = useMemo(() => searchCatalog(query), [query]);

  /**
   * Counts are computed against the *text* filter only, not the level one.
   *
   * That is a deliberate asymmetry. If a family showed 0 because the level filter
   * excluded everything in it, choosing a level would appear to delete families
   * from the rail — the list would rearrange under the cursor for a change that
   * has nothing to do with what you clicked. Dimming on the *text* filter is
   * honest, because typing a word genuinely can leave a family with nothing.
   */
  const familyCounts = useMemo(() => {
    const counts = {} as Record<Category, number>;
    for (const c of CATEGORIES) counts[c.id] = 0;
    for (const e of byText) counts[e.category] += 1;
    return counts;
  }, [byText]);

  const results = useMemo(
    () =>
      byText.filter(
        (e) =>
          (family === 'all' || e.category === family) && (level === 'all' || e.level === level),
      ),
    [byText, family, level],
  );

  /**
   * One flat list unless a family is chosen.
   *
   * With no family selected the rail is the index and the list is the whole
   * curriculum, so it is grouped by family with a heading each — the same reading
   * order as `LearnIndex`, and the same `CATEGORIES` order, which is curriculum
   * order rather than alphabetical. Choosing a family drops the headings, because
   * ten rows under a heading repeating the rail's own label is a joke.
   */
  const groups = useMemo(() => {
    if (family !== 'all') return [{ category: family as Category | null, items: results }];
    const present = new Set(results.map((e) => e.category));
    if (present.size === 0) return [];
    return CATEGORIES.filter((c) => present.has(c.id)).map((c) => ({
      category: c.id as Category | null,
      items: results.filter((e) => e.category === c.id),
    }));
  }, [results, family]);

  const recentEntries = recent
    .map((id) => CATALOG.find((e) => e.id === id))
    .filter((e): e is CatalogEntry => e !== undefined);

  const favEntries = favourites
    .map((id) => CATALOG.find((e) => e.id === id))
    .filter((e): e is CatalogEntry => e !== undefined);

  const lastViewed = recentEntries[0];

  return (
    <PageShell
      pathname={pathname}
      onNavigate={onNavigate}
      title={`Unroll — ${CATALOG.length} algorithms, step by step, with the code in four languages`}
      description="Step through 66 algorithms with the exact line of Python, Java, C++ or JavaScript highlighted. Every listing is executed and diffed, so the four agree."
      navSlot={<SearchHint onClick={() => setOpen(true)} />}
    >
      <PageBody className="pb-20">
        {/*
          The identity row.

          One line, no gradient, no CTA, no stats. It is here so the page has an
          `h1` and states what the site is — which is the product's real claim, and
          the one thing a first-time visitor cannot infer from a grid of names.

          `fade-rise` rather than `rise-in` because it is the largest thing on the
          page and should arrive slightly behind the nav, not with it.
        */}
        <header className="fade-rise pt-10 pb-7 sm:pt-14">
          <h1 className="max-w-3xl text-[24px] leading-[1.2] font-extrabold tracking-tight text-text-strong sm:text-[30px]">
            The animation and the code are <span className="text-accent">the same program</span>.
          </h1>
          <p className="measure mt-2.5 text-[14px] leading-relaxed text-text-muted">
            {CATALOG.length} algorithms across {CATEGORIES.length} families, each stepping you
            through its own execution — with the exact line of JavaScript, Python, Java or C++
            highlighted as it runs. Every listing is compiled and diffed against the others in CI.
          </p>
        </header>

        {/*
          Continue where you left off.

          A single line, and only when there is something to continue. This is the
          one piece of guidance on the page that is a fact rather than an opinion —
          and it is placed above the family rail because resuming is what most
          people came back to do.
        */}
        {lastViewed ? (
          <div className="fade-in mb-8 flex items-center gap-3 rounded-xl border border-border-strong bg-surface-raised/50 py-3 pr-3 pl-4">
            <span className="shrink-0 text-[10px] font-semibold tracking-wide text-text-subtle uppercase">
              Continue
            </span>
            <a
              href={`/?algo=${lastViewed.id}`}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(`/?algo=${lastViewed.id}`);
              }}
              className="group min-w-0 flex-1 truncate text-[13.5px] font-medium text-text-strong transition-colors hover:text-accent"
            >
              {lastViewed.title}
            </a>
            {recentEntries.length > 1 ? (
              <ChipRow entries={recentEntries.slice(1, 5)} onNavigate={onNavigate} />
            ) : null}
          </div>
        ) : null}

        {favEntries.length > 0 ? (
          <ChipRow
            title="Favourites"
            entries={favEntries}
            onNavigate={onNavigate}
            className="mb-8"
          />
        ) : null}

        {/*
          Rail and list.

          `lg:grid-cols-[15rem_minmax(0,1fr)]` — the rail is narrow because its
          longest label is "Dynamic Programming" and its longest blurb is "Remember
          every sub-answer", both of which need about 13rem at 12px. `minmax(0,1fr)`
          rather than `1fr` so the list column can shrink and its rows truncate
          instead of forcing the grid wider.
        */}
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <FamilyRail counts={familyCounts} selected={family} onSelect={setFamily} />

          <section aria-label="Algorithms" className="min-w-0">
            <Toolbar
              query={query}
              onQuery={setQuery}
              level={level}
              onLevel={setLevel}
              count={results.length}
              onSurprise={() => {
                // `crypto` rather than `Math.random`, matching the determinism rule
                // `boundary.test.ts` enforces in `core/` — using the same source of
                // randomness in two places invites the rule to be relaxed and then
                // broken.
                const draw = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
                const pick = CATALOG[draw % CATALOG.length];
                if (pick !== undefined) onNavigate(`/?algo=${pick.id}`);
              }}
            />

            {results.length === 0 ? (
              <EmptyState
                query={query}
                family={family}
                onReset={() => {
                  setQuery('');
                  setFamily('all');
                  setLevel('all');
                }}
              />
            ) : (
              <div className="mt-3 space-y-10">
                {groups.map((g) => (
                  <div key={g.category ?? 'all'}>
                    {g.category ? (
                      /*
                        Deliberately **not** sticky.

                        It was, and it caused a real defect rather than expressing a
                        preference. A pinned 30px band sits over the list, so anything
                        scrolled to the top of the container lands underneath it —
                        including the favourite star at a row's far right, which is
                        focusable and clickable and then silently is not. Two e2e tests
                        failed with the button "intercepted" by a heading that was 30px
                        tall and, at that moment, doing nothing useful.

                        The translucent version came first and had its own problem: at
                        80% the rows behind it stayed legible through it.

                        The heading still does its job. It is the boundary between two
                        families as you scroll, and the rail keeps the current family
                        visible at all times. Pinning bought a little orientation and
                        cost a reachable control.
                      */
                      <div className="mb-1.5 border-b border-border/50 px-4 pb-2">
                        <div className="flex items-baseline gap-2.5">
                          <h2
                            id={`cat-${g.category}`}
                            className="text-[13px] font-bold tracking-tight text-text-strong"
                          >
                            {CATEGORY_LABEL[g.category]}
                          </h2>
                          <span className="font-mono text-[10.5px] text-text-subtle">
                            {g.items.length}
                          </span>
                          <span className="truncate text-[11.5px] text-text-subtle">
                            {CATEGORIES.find((c) => c.id === g.category)?.blurb}
                          </span>
                        </div>
                      </div>
                    ) : null}
                    {/*
                      Keyed on the *group*, not on the query.

                      This is the one animation detail worth being explicit about: if
                      the rows re-keyed on the search text, every keystroke would
                      restart the stagger and the list would visibly re-animate on
                      each character. Re-keying on the family alone means the
                      entrance plays when you choose a family and stays out of the
                      way while you type.
                    */}
                    <div key={g.category ?? 'all'} className="rise-in">
                      {g.items.map((e, i) => (
                        <AlgoRow key={e.id} entry={e} index={i} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {storageWarning ? (
          <p className="rule-fade mt-12 pt-5 text-center text-[11px] text-text-subtle">
            This browser is blocking local storage, so favourites and recently viewed will not
            survive a reload. Everything else works.
          </p>
        ) : null}
      </PageBody>

      <CommandPalette open={open} onClose={() => setOpen(false)} onNavigate={onNavigate} />
    </PageShell>
  );
}

/** The ⌘K affordance in the nav. */
function SearchHint({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hidden items-center gap-2 rounded-md border border-border-strong bg-surface-inset/60 px-2 py-1 text-[11px] text-text-subtle transition-colors hover:border-border-subtle hover:text-text-muted sm:flex"
      title="Search algorithms and guides (⌘K)"
    >
      <Search className="size-3.5" />
      <span>Search</span>
      <kbd className="rounded border border-border-strong px-1 font-mono text-[9.5px]">⌘K</kbd>
    </button>
  );
}

/**
 * The toolbar: text search, level, count.
 *
 * The family filter is deliberately *not* here — it is the rail, and having it in
 * both places is the same ambiguity as a `?algo=` on two paths. Only the level
 * lives here, because it is a genuine cross-cutting filter (19 / 37 / 10) and not
 * a way of navigating.
 */
function Toolbar({
  query,
  onQuery,
  level,
  onLevel,
  count,
  onSurprise,
}: {
  query: string;
  onQuery: (v: string) => void;
  level: LevelFilter;
  onLevel: (v: LevelFilter) => void;
  count: number;
  onSurprise: () => void;
}) {
  return (
    <>
      {/*
        `bg-surface`, opaque — not `bg-surface/85` with a `backdrop-blur`.

        The translucent version was a real defect rather than a taste question: at 85%
        the rows scrolling underneath stayed legible *through* the toolbar, so a search
        box had a wall of half-visible algorithm summaries behind it. The blur was
        supposed to soften that, but `backdrop-filter` over a flat background does very
        little, and 15% of 66 rows is enough to read.

        Opaque costs nothing and looks deliberate. The `backdrop-blur` goes with it,
        since behind an opaque layer it is a compositing layer that renders nothing.
      */}
      <div className="sticky top-0 z-20 -mx-2 mb-2 border-b border-border/60 bg-surface px-2 py-3">
        <div className="flex items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-text-subtle"
              aria-hidden="true"
            />
            {/*
            The placeholder is short on purpose.

            The previous one was `Filter by name, idea or cost — "stable",
            "nlogn", "shortest path"…`, and at 390px it clipped mid-quote: the
            student saw `"nlogn`, `"shortest path`…` with a dangling opening
            quotation mark. The examples moved to the empty state, which is where
            they are actually useful — the place someone who typed the wrong thing
            ends up.
          */}
            <input
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder={`Search ${CATALOG.length} algorithms…`}
              aria-label="Filter algorithms"
              type="search"
              autoComplete="off"
              className="w-full rounded-lg border border-border-strong bg-surface-raised/70 py-2 pr-8 pl-9 text-[13px] text-text-strong outline-none transition-colors placeholder:text-text-subtle focus:border-accent/60"
            />
            {query ? (
              <button
                type="button"
                onClick={() => onQuery('')}
                aria-label="Clear the filter"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-text-subtle transition-colors hover:bg-surface-inset hover:text-text"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          <LevelFilter level={level} onLevel={onLevel} />

          <span
            className="shrink-0 font-mono text-[11px] text-text-subtle tabular-nums"
            aria-live="polite"
          >
            {count}
          </span>

          <button
            type="button"
            onClick={onSurprise}
            aria-label="Open a random algorithm"
            title="Open a random algorithm"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-strong text-text-muted transition-all duration-150 hover:border-accent/50 hover:bg-surface-inset hover:text-accent active:scale-95"
          >
            <Dices className="size-3.5" />
          </button>
        </div>

        {/*
        The difficulty filter gets its own row on a phone.

        It was `hidden sm:flex` in the first version, which quietly meant **mobile
        had no difficulty filter at all** — a feature that exists on the page and
        cannot be reached on half the screens. Dropping a control on small screens
        because it does not fit is how a page ends up with two different features
        depending on the device, and nobody notices until someone compares.

        So it wraps to a second row rather than disappearing. The second row is
        `sm:hidden`, so it is genuinely an alternative layout and not a duplicate:
        at `sm` and up the control sits beside the search, below that it sits under
        it.
      */}
        <fieldset className="mt-2.5 flex overflow-hidden rounded-lg border border-border-strong sm:hidden">
          <legend className="sr-only">Filter by difficulty</legend>
          {LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => onLevel(l.id)}
              aria-pressed={level === l.id}
              className={cn(
                'flex-1 px-2.5 py-1.5 text-[11.5px] font-medium transition-colors duration-150',
                level === l.id
                  ? 'bg-accent/15 text-accent-strong'
                  : 'text-text-muted hover:bg-surface-inset hover:text-text',
              )}
            >
              {l.label}
            </button>
          ))}
        </fieldset>
      </div>
    </>
  );
}

/** The difficulty control, inline beside the search. Shown from `sm` up. */
function LevelFilter({
  level,
  onLevel,
}: {
  level: LevelFilter;
  onLevel: (v: LevelFilter) => void;
}) {
  return (
    <>
      {/*
        A `fieldset`, not a `div role="group"`.

        It is a genuine set of mutually exclusive controls, and `fieldset` is the
        element that says so — it gives the group a name and makes a screen reader
        announce the four levels as one control set rather than as four loose
        buttons.
      */}
      <fieldset className="hidden shrink-0 overflow-hidden rounded-lg border border-border-strong sm:flex">
        <legend className="sr-only">Filter by difficulty</legend>
        {LEVELS.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => onLevel(l.id)}
            aria-pressed={level === l.id}
            className={cn(
              'px-2.5 py-1.5 text-[11.5px] font-medium transition-colors duration-150',
              level === l.id
                ? 'bg-accent/15 text-accent-strong'
                : 'text-text-muted hover:bg-surface-inset hover:text-text',
            )}
          >
            {l.label}
          </button>
        ))}
      </fieldset>
    </>
  );
}

/**
 * A horizontal run of links. Never wraps, so the row is always exactly one line
 * tall and the section below it never moves — the same reasoning as the player's
 * control row.
 */
function ChipRow({
  title,
  entries,
  onNavigate,
  className,
}: {
  title?: string;
  entries: CatalogEntry[];
  onNavigate: (to: string) => void;
  className?: string;
}) {
  return (
    <section className={className} aria-label={title ?? 'Recently viewed'}>
      {title ? (
        <h2 className="mb-2 text-[10px] font-semibold tracking-wide text-text-subtle uppercase">
          {title}
        </h2>
      ) : null}
      <div className="scroll-fade-x flex flex-nowrap items-center gap-1.5">
        {entries.map((e) => (
          <a
            key={e.id}
            href={`/?algo=${e.id}`}
            onClick={(ev) => {
              ev.preventDefault();
              onNavigate(`/?algo=${e.id}`);
            }}
            className="shrink-0 rounded-full border border-border-strong bg-surface-raised/60 px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap text-text-muted transition-all duration-150 hover:border-accent/50 hover:bg-surface-inset hover:text-text"
          >
            {e.title}
          </a>
        ))}
      </div>
    </section>
  );
}

function EmptyState({
  query,
  family,
  onReset,
}: {
  query: string;
  family: Category | 'all';
  onReset: () => void;
}) {
  return (
    <div className="fade-in mt-8 flex flex-col items-center rounded-2xl border border-dashed border-border-strong px-6 py-14 text-center">
      <p className="text-[15px] font-semibold text-text-strong">
        {query.trim() ? `Nothing matches “${query.trim()}”.` : 'Nothing here.'}
      </p>
      <p className="measure mt-2 text-[13px] leading-relaxed text-text-muted">
        {query.trim() ? (
          <>
            Try a broader term — a family name like <em>graphs</em>, an idea like <em>stable</em>,
            or a cost like <em>nlogn</em>. Or press{' '}
            <kbd className="rounded border border-border-strong px-1 font-mono text-[11px]">⌘K</kbd>{' '}
            to search everything at once.
          </>
        ) : (
          <>
            No algorithm in {CATEGORY_LABEL[family as Category]} matches this difficulty. Clear the
            filters to see all of them.
          </>
        )}
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-5 rounded-lg border border-border-strong px-3.5 py-1.5 text-[12.5px] font-medium text-text-muted transition-colors hover:border-border-subtle hover:bg-surface-inset hover:text-text"
      >
        Clear filters
      </button>
    </div>
  );
}
