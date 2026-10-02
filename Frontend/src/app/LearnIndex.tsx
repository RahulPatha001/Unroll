import { BookOpen, Clock, Sparkles } from 'lucide-react';
import { ARTICLE_CATEGORY_LABEL, articlesByCategory } from '../core/learn/index.ts';
import { cn } from '../lib/utils.ts';
import { CommandPalette, useCommandPalette } from './CommandPalette.tsx';
import { PageBody, PageShell } from './PageShell.tsx';

/**
 * The Learn index.
 *
 * Grouped by category with the group order following `ARTICLE_LIST`, which is
 * curriculum order rather than alphabetical — the same reasoning that puts bubble
 * sort before quicksort in the sidebar.
 *
 * The cards deliberately do *not* show an embedded stepper. A grid of 66 live
 * visualisations would mean 66 trace builds on this page; the articles are where
 * a stepper belongs, because that is where there is room to say what to look for.
 */
export function LearnIndex({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate: (to: string) => void;
}) {
  const groups = articlesByCategory();
  const { open, setOpen } = useCommandPalette(() => setOpen(true));

  const totalMinutes = groups.reduce(
    (n, g) => n + g.items.reduce((m, a) => m + a.readMinutes, 0),
    0,
  );

  return (
    <PageShell
      pathname={pathname}
      onNavigate={onNavigate}
      title="Learn algorithms — guides that embed the visualisation"
      description="Long-form explanations of the algorithms in Unroll, each with the live, steppable visualisation embedded in the page."
      navSlot={
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="hidden items-center gap-2 rounded-md border border-border-strong bg-surface-inset/60 px-2 py-1 text-[11px] text-text-subtle transition-colors hover:border-border-subtle hover:text-text-muted sm:flex"
          title="Search (⌘K)"
        >
          <Sparkles className="size-3.5" />
          <kbd className="rounded border border-border-strong px-1 font-mono text-[9.5px]">⌘K</kbd>
        </button>
      }
    >
      <PageBody>
        <div className="fade-rise pt-10 pb-8 sm:pt-14">
          <div className="measure">
            <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-tight text-text-strong sm:text-[36px]">
              Read the idea, then{' '}
              <span className="bg-gradient-to-r from-accent to-accent-strong bg-clip-text text-transparent">
                watch it run
              </span>
              .
            </h1>
            <p className="mt-3 text-[14px] leading-relaxed text-text-muted sm:text-[15px]">
              Every guide here has the visualisation embedded in the page, so you can step through
              the exact moment the article is describing instead of trusting a picture of it.
              {totalMinutes > 0 ? ` About ${totalMinutes} minutes in total.` : ''}
            </p>
          </div>
        </div>

        <div className="space-y-10 pb-16">
          {groups.map((group, gi) => (
            <section key={group.category}>
              <div className="mb-3 flex items-baseline gap-2.5">
                <h2
                  className="rise-in text-[15px] font-bold tracking-tight text-text-strong"
                  style={{ '--i': Math.min(gi, 6) } as React.CSSProperties}
                >
                  {ARTICLE_CATEGORY_LABEL[group.category]}
                </h2>
                <span className="text-[11px] text-text-subtle">{group.items.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((a, i) => (
                  <a
                    key={a.slug}
                    href={`/learn/${a.slug}`}
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigate(`/learn/${a.slug}`);
                    }}
                    style={{ '--i': Math.min(i, 14) } as React.CSSProperties}
                    className={cn(
                      'stagger group relative flex flex-col gap-2 rounded-xl border border-border/80 bg-surface-raised/50 p-4',
                      'transition-all duration-200 ease-out',
                      'hover:-translate-y-0.5 hover:border-accent/50 hover:bg-surface-raised/80 hover:shadow-lg hover:shadow-black/30',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <BookOpen className="mt-0.5 size-4 shrink-0 text-info" />
                      <h3 className="min-w-0 flex-1 text-[14.5px] leading-snug font-semibold text-text-strong">
                        {a.title}
                      </h3>
                    </div>
                    <p className="measure line-clamp-3 text-[12px] leading-relaxed text-text-muted/90">
                      {a.dek}
                    </p>
                    <div className="mt-auto flex items-center gap-2 pt-1">
                      <span className="inline-flex items-center gap-1 text-[10px] text-text-subtle">
                        <Clock className="size-3" />
                        {a.readMinutes} min
                      </span>
                      {a.algoId ? (
                        <span className="rounded bg-accent/12 px-1.5 py-0.5 text-[9.5px] font-semibold text-accent">
                          has a stepper
                        </span>
                      ) : null}
                    </div>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      </PageBody>

      <CommandPalette open={open} onClose={() => setOpen(false)} onNavigate={onNavigate} />
    </PageShell>
  );
}
