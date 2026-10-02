import { Star } from 'lucide-react';
import type { CatalogEntry } from '../core/algorithms/catalog.ts';
import { cn } from '../lib/utils.ts';
import { FamilyGlyph, kindLabel } from './FamilyGlyph.tsx';
import { useIsFavourite, useLibrary } from './library.ts';

/**
 * One algorithm, as a row.
 *
 * ## Why a row and not a card
 *
 * Because there are 66 of them. As cards they were 142px tall, which is 9.4
 * thousand pixels of scrolling to see a page whose entire job is letting you *pick
 * one*. As rows they are spacious but roughly half that, and — more importantly —
 * a row's text column lines up, so the eye scans down a straight edge instead of
 * hopping between boxes.
 *
 * "Spacious" here means generous padding and a two-line summary, not minimal
 * height. The original complaint about this page was never that it was dense; it
 * was that **72% of a phone screen was preamble** before the first result.
 *
 * ## The click target is a stretched link, not the row
 *
 * The row is an `<article>` with an absolutely-positioned `<a>` covering it, and the
 * favourite star is a sibling `<button>` above it. The obvious alternative — an
 * `<a>` wrapping the row with a `<button>` inside — is invalid HTML, and browsers
 * disagree about what a click inside a nested interactive element means: some fire
 * the button, some fire the link, some both. A student who stars an algorithm and
 * gets navigated to the visualiser because they meant to save it learns to distrust
 * the star.
 *
 * So the two targets never overlap, and clicking the star cannot navigate.
 *
 * ## No hover translation, and that is not a stylistic choice
 *
 * The first version had `hover:translate-x-0.5` — a 2px nudge, the sort of detail
 * that makes a list feel alive. It broke two e2e tests with
 * **"element is not stable"**, and the reason is worth keeping:
 *
 * A row is a full-width click target. Hover it near the edge of the viewport, the
 * row shifts 2px right, the pointer is now over a different part of the row — or
 * over nothing — so hover is lost, the transform is removed, the row shifts back,
 * hover is regained. The transform oscillates for as long as the pointer rests
 * there. Playwright's actionability check waits for a stable bounding box and
 * therefore never clicks it.
 *
 * A human notices this as a row that feels like it is resisting being clicked. The
 * test only noticed it as a timeout. So the hover is background and border only —
 * the primary target never moves, and the row still reacts.
 *
 * ## The layout collapses on purpose, and this was a bug first
 *
 * The first version of this row put the complexity and the star beside the title
 * at every width. At 390px the title had about 60px to work with and read
 * **"Countin…"** — the name of the algorithm, truncated to seven characters, on a
 * page whose entire purpose is choosing between algorithms by name.
 *
 * The cause is worth recording: the `INTERMEDIATE` level label is ~95px, the
 * complexity ~50px, the star ~28px and the glyph ~56px, which is 229px of a 358px
 * content width before a single letter of the title.
 *
 * So below `sm` the meta block drops to its own line (`w-full`, inside a
 * `flex-wrap` row) and the title gets the full remainder. The name is the one thing
 * on this row that must never be shortened, because it is what you are choosing.
 */

const LEVEL_TONE: Record<CatalogEntry['level'], string> = {
  intro: 'text-success',
  intermediate: 'text-info',
  advanced: 'text-accent',
};

export function AlgoRow({ entry, index }: { entry: CatalogEntry; index: number }) {
  const favourite = useIsFavourite(entry.id);
  const toggle = useLibrary((s) => s.toggleFavourite);

  const diverges = entry.complexity.worst !== entry.complexity.average;

  return (
    <article
      /*
        `--i` drives the stagger, clamped by the caller.

        The clamp is load-bearing. At 26ms per step, row 40 would wait over a
        second — which reads as a page being *slow* rather than as choreography.
        Fifteen is where the ramp stops being a ramp, and the remainder simply
        appear with the rest.
      */
      style={{ '--i': Math.min(index, 15) } as React.CSSProperties}
      className={cn(
        /*
          `scroll-mt-15` is not decoration.

          The toolbar is sticky at the top of the scroll container and the family
          headings are sticky at 60px, so a row that gets scrolled to — by
          `scrollIntoView`, by the browser scrolling a focused element into view, or
          by a screen reader following the list — lands *underneath* them. The
          favourite star at the row's far right ends up behind the toolbar, and a
          click there hits the toolbar instead.

          `scroll-margin-top` is the standard remedy and it fixes the accessibility
          case as well as the test: a keyboard user tabbing through the list gets
          every row in a readable position rather than one hidden under a bar.
        */
        'stagger group relative flex scroll-mt-16 flex-wrap items-start gap-x-3 gap-y-1.5 rounded-xl border border-transparent px-3 py-3 sm:min-h-20 sm:flex-nowrap sm:items-center sm:gap-x-4 sm:px-4 sm:py-4',
        'transition-[background-color,border-color] duration-200 ease-out',
        'hover:border-border-strong hover:bg-surface-raised/60',
        favourite && 'border-accent/25 hover:border-accent/40',
      )}
    >
      <a
        href={`/?algo=${entry.id}`}
        data-algo={entry.id}
        className="absolute inset-0 z-0 rounded-xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        <span className="sr-only">Open {entry.title} in the visualiser</span>
      </a>

      {/*
        The shape mark, on a plate that lights up on hover.

        It is the only element that reacts to hover before the text does, which is
        what gives 66 identical rows a left edge to align on and stops the list
        reading as a wall of interchangeable lines.

        `text-text-subtle` rather than `text-text-faint`: `faint` is `slate-600`,
        about 2.6:1 on this chrome, and it is a token reserved for genuinely
        decorative marks. That is technically defensible here and practically
        wrong — at that contrast the glyphs read as *missing* rather than as quiet.
      */}
      <span
        className={cn(
          'relative z-10 flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 sm:size-10',
          'bg-surface-raised/70 text-text-subtle transition-all duration-200',
          'group-hover:border-accent/40 group-hover:text-accent',
        )}
        title={`Shows as ${kindLabel(entry.viewport)}`}
      >
        <FamilyGlyph kind={entry.viewport} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2.5">
          {/*
            `line-clamp-2 sm:truncate`.

            Wraps on a phone, truncates on a desktop — and both halves of that are
            deliberate. Wrapping matters because "Longest Repeating Character
            Replacement" is 39 characters and does not fit a 390px line at any
            font-size worth using; `truncate` there would cut a real algorithm's
            name to "Longest Repeating Charac…", which is the exact failure this row
            was rebuilt to avoid. Two lines is enough for every name in the catalog.

            From `sm` the row is wide enough that no title wraps, and `truncate`
            keeps a hypothetical future long name from making one row taller than its
            neighbours — which matters because the glyph column is aligned by the rows
            sharing a height.
          */}
          <h3 className="line-clamp-2 text-[14.5px] leading-tight font-semibold text-text-strong sm:truncate">
            {entry.title}
          </h3>
          <span
            className={cn(
              'hidden shrink-0 text-[9.5px] font-semibold tracking-wide uppercase sm:inline',
              LEVEL_TONE[entry.level],
            )}
          >
            {entry.level}
          </span>
        </div>
        {/*
          Two lines. `line-clamp-2` rather than a fixed height, so a one-sentence
          summary leaves the row short and a two-sentence one fills it.
        */}
        <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-text-muted/90">
          {entry.summary}
        </p>
      </div>

      {/*
        The meta block.

        `w-full` inside a `flex-wrap` row puts it on its own line below the text on a
        phone, and it returns to the right edge from `sm` up.

        `pl-11` and not `ml-11`: the indent is *padding*, so it sits inside the
        `w-full`. As a margin it is added on top of the full width and pushes the star
        44px past the right edge of the screen — which is exactly what the first
        attempt did, clipping the favourite control off the row entirely on a phone.
      */}
      <div className="flex w-full shrink-0 items-center gap-3 pl-11 sm:w-auto sm:pl-0">
        <span
          className={cn(
            'font-mono text-[11.5px] tabular-nums',
            diverges ? 'text-text-muted' : 'text-text-subtle',
          )}
          title={`best ${entry.complexity.best ?? '—'} · average ${entry.complexity.average} · worst ${entry.complexity.worst} · space ${entry.complexity.space}`}
        >
          {diverges
            ? `${entry.complexity.average} / ${entry.complexity.worst}`
            : entry.complexity.average}
        </span>

        <span
          className={cn(
            'text-[9.5px] font-semibold tracking-wide uppercase sm:hidden',
            LEVEL_TONE[entry.level],
          )}
        >
          {entry.level}
        </span>

        <button
          type="button"
          /*
            `scroll-mt-16` again, on the button rather than the row.

            It has to be here. `scroll-margin` is resolved against the element being
            scrolled, and the browser — or an automated click — scrolls the *focused
            element*, which is the star, not the `<article>` that carries the margin.
            With the margin only on the row, tabbing to the favourite of an algorithm
            60 rows down scrolls it flush to the top of the container, where the
            sticky toolbar sits on top of it: the control is focused, it is visible to
            the eye, and pressing Space does nothing because the click lands on the
            bar above.
          */
          style={{ scrollMarginTop: '4rem' }}
          onClick={() => void toggle(entry.id)}
          aria-pressed={favourite}
          aria-label={
            favourite
              ? `Remove ${entry.title} from favourites`
              : `Save ${entry.title} to favourites`
          }
          className={cn(
            /*
              `relative z-10`, and it is load-bearing rather than decorative.

              The stretched link is `absolute inset-0 z-0` and covers the entire row,
              so the star has to be positioned *and* above it or it is unclickable.
              This was dropped while the meta block was being restructured and two
              e2e tests caught it: the click landed on the link and navigated to the
              visualiser instead of saving the algorithm, which is precisely the
              failure this component's whole click-target design exists to prevent.
            */
            'relative z-10 ml-auto rounded-md p-1.5 transition-all duration-150 sm:ml-0',
            favourite
              ? 'text-accent hover:scale-110'
              : 'text-text-faint hover:bg-surface-inset hover:text-text-muted',
          )}
        >
          <Star className={cn('size-4', favourite && 'fill-current')} />
        </button>
      </div>
    </article>
  );
}
