import { Check } from 'lucide-react';
import { CATEGORIES, type Category } from '../core/algorithms/types.ts';
import { cn } from '../lib/utils.ts';

/**
 * The family rail.
 *
 * ## Why a rail and not a row of pills
 *
 * Because a row of pills cannot hold fourteen items without either wrapping (which
 * changes height as the window narrows — the exact defect `index.css` documents
 * about the player's control row) or scrolling sideways with the last one cut in
 * half. The old page did the latter, and a half-visible "Heaps" reads as a broken
 * layout rather than as "there is more this way".
 *
 * A rail holds all fourteen vertically, at any width, with room for each one's
 * **count and blurb**. That is the whole point: "Nodes, edges, traversal" beside
 * "Graphs · 10" is the only real guidance on this page, because it is the only
 * taxonomy the data actually has. A pill says "Graphs". A rail says what graphs
 * are, how many there are, and lets you go there.
 *
 * It also makes the choice *bounded*. The largest family is ten algorithms, so
 * choosing one means a list that fits on a screen — versus scrolling a wall of 66
 * and hoping.
 *
 * ## The blurb is a real sentence, so it wraps
 *
 * Which is why the rail items are `text-left` and not a fixed height. `CATEGORIES`
 * carries a hand-written line per family, and they range from "Nodes and arrows" to
 * "Remember every sub-answer". Clamping them would cut the informative half.
 */
export function FamilyRail({
  counts,
  selected,
  onSelect,
}: {
  /** How many results each family has *after* the text filter. */
  counts: Record<Category, number>;
  selected: Category | 'all';
  onSelect: (c: Category | 'all') => void;
}) {
  const total = CATEGORIES.reduce((n, c) => n + (counts[c.id] ?? 0), 0);

  return (
    <nav aria-label="Algorithm families" className="lg:sticky lg:top-6">
      <h2 className="mb-2 px-3 text-[10px] font-bold tracking-wide text-text-subtle uppercase">
        Families
      </h2>
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        <RailItem
          active={selected === 'all'}
          onClick={() => onSelect('all')}
          label="All families"
          count={total}
          dataFamily="all"
        />
        {CATEGORIES.map((c) => (
          <RailItem
            key={c.id}
            active={selected === c.id}
            onClick={() => onSelect(selected === c.id ? 'all' : c.id)}
            label={c.label}
            count={counts[c.id] ?? 0}
            blurb={c.blurb}
            dataFamily={c.id}
            // A family with nothing matching the current search is dimmed rather
            // than removed: removing it makes the rail jump around under the
            // cursor as you type, which is worse than a control that is visibly
            // empty.
            muted={(counts[c.id] ?? 0) === 0}
          />
        ))}
      </ul>
    </nav>
  );
}

function RailItem({
  active,
  onClick,
  label,
  count,
  blurb,
  dataFamily,
  muted,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  blurb?: string;
  dataFamily: string;
  muted?: boolean;
}) {
  return (
    <li className="shrink-0 lg:shrink">
      <button
        type="button"
        data-family={dataFamily}
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          'group relative w-full rounded-lg px-3 py-2 text-left transition-colors duration-200',
          // The accent bar: a pseudo-element that scales in from the middle rather
          // than a moving indicator. A shared sliding indicator has to measure the
          // active item's offset, which fights the rail's own layout and breaks the
          // moment the rail wraps or the window resizes mid-transition. Scaling
          // this one costs nothing and cannot desynchronise.
          'before:absolute before:top-1/2 before:left-0 before:h-4 before:w-[2px]',
          'before:-translate-y-1/2 before:scale-y-0 before:rounded-full before:bg-accent',
          'before:transition-transform before:duration-200 before:ease-out',
          active && 'before:scale-y-100',
          active
            ? 'bg-surface-inset text-text-strong'
            : 'text-text-muted hover:bg-surface-inset/60 hover:text-text',
          muted && !active && 'opacity-40',
        )}
      >
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium whitespace-nowrap lg:whitespace-normal">
            {label}
          </span>
          <span
            className={cn(
              'shrink-0 font-mono text-[10.5px] tabular-nums',
              active ? 'text-accent' : 'text-text-faint',
            )}
          >
            {count}
          </span>
          {active ? (
            <Check className="size-3 shrink-0 text-accent lg:hidden" aria-hidden="true" />
          ) : null}
        </span>
        {/*
          The blurb is the page's only real guidance, so it is visible on the wide
          rail and dropped on the horizontal one — where fourteen of them would be
          unreadable anyway.
        */}
        {blurb ? (
          <span className="mt-0.5 hidden text-[10.5px] leading-snug text-text-subtle lg:block">
            {blurb}
          </span>
        ) : null}
      </button>
    </li>
  );
}
