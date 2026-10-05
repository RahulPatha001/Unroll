import { ChevronDown, Eye, Play, Shapes } from 'lucide-react';
import { useState } from 'react';
import { CATALOG_BY_ID } from '../../core/algorithms/catalog.ts';
import { getArticle } from '../../core/learn/index.ts';
import { questionsByLevel, type Topic, topicProgress } from '../../core/roadmap/index.ts';
import { cn } from '../../lib/utils.ts';
import { LevelSpread } from './badges.tsx';
import { useSolvedSet } from './progressStore.ts';
import { QuestionRow } from './QuestionRow.tsx';

/**
 * One topic: a collapsed summary row that expands into the full question list.
 *
 * ## Why a disclosure and not an always-expanded card
 *
 * Twenty-two topics and 324 questions. Rendered open, `/roadmap` is a wall with no
 * shape, and the one thing the page exists to communicate — *the order* — is exactly
 * what a wall destroys. Collapsed, it reads as twenty-two lines, which is the roadmap.
 *
 * ## Both states are mounted; only the height animates
 *
 * `disclosure` → `disclosure-open` transitions `grid-template-rows` between `0fr` and
 * `1fr`, so the panel opens to whatever height its content happens to be without
 * anyone hard-coding a number. The content stays in the DOM either way, which is what
 * makes the transition possible — and it is also why the closed panel needs `inert`,
 * or its thirty links would stay in the tab order while being invisible. `Sidebar.tsx`
 * does exactly the same thing for the same reason.
 *
 * ## `defaultOpen` on the first topic, and only the first
 *
 * A roadmap that opens with everything shut is a list; a roadmap that opens with all
 * twenty-two expanded is the wall. One open card says "this is how a topic looks", and
 * the rest of the page stays scannable.
 */
export function TopicCard({
  topic,
  defaultOpen = false,
  onNavigate,
  matchCount,
}: {
  topic: Topic;
  defaultOpen?: boolean;
  /** Passed down so the visualiser and guide links are router transitions. */
  onNavigate: (to: string) => void;
  /**
   * How many of this topic's questions survive the current filters.
   *
   * A filter that hides some of a topic's questions must not hide the topic — the
   * reader searched for "graph" and a topic with two matching questions is still the
   * right place to look. So the card renders the *matches* and reports the rest as a
   * count, rather than the card quietly vanishing.
   */
  matchCount: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const solved = useSolvedSet();
  const { done, total, ratio } = topicProgress(topic, solved);

  const groups = questionsByLevel(topic);
  const complete = total > 0 && done === total;
  const panelId = `topic-panel-${topic.id}`;

  return (
    <article
      data-topic={topic.id}
      className={cn(
        'relative overflow-hidden rounded-xl border bg-surface-raised/40 transition-colors duration-200',
        open
          ? 'border-border-strong bg-surface-raised/70'
          : 'border-border/70 hover:border-border-subtle',
        complete && 'border-success/30',
      )}
    >
      <h3 className="sr-only">{topic.title}</h3>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors duration-150 hover:bg-surface-inset/30"
      >
        {/*
          A completion bar on the card's own left edge rather than in the footer.

          It reads as "how full is this topic" from the collapsed row alone, which is
          the state the reader is in 22 times out of 23. A percentage in the footer
          would only be visible when the card is open — which is exactly when the
          reader can already see the ticked items.
        */}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-[3px] bg-surface-overlay transition-[background-color] duration-300"
          style={done > 0 ? { backgroundColor: 'var(--color-success)' } : undefined}
        />

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'min-w-0 truncate text-[14px] font-semibold tracking-tight',
                complete ? 'text-success-strong' : 'text-text-strong',
              )}
            >
              {topic.title}
            </span>
            {complete ? (
              <span className="shrink-0 rounded bg-success/12 px-1.5 py-px text-[9px] font-bold tracking-wide text-success uppercase">
                done
              </span>
            ) : null}
          </span>
          <span className="flex items-center gap-2.5 text-[10.5px] text-text-subtle">
            <span className="font-mono">
              {done}/{total}
            </span>
            {matchCount < total ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-accent">{matchCount} match the filter</span>
              </>
            ) : null}
          </span>
        </span>

        <LevelSpread questions={topic.questions} />

        <span
          className="hidden shrink-0 items-center gap-1 sm:flex"
          title={
            topic.algoIds.length > 0
              ? 'Algorithms this topic is about'
              : 'No visualiser for this topic yet'
          }
        >
          <Shapes
            aria-hidden="true"
            className={cn(
              'size-3',
              topic.algoIds.length > 0 ? 'text-accent/80' : 'text-text-faint',
            )}
          />
          <span
            className={cn(
              'font-mono text-[9.5px]',
              topic.algoIds.length > 0 ? 'text-text-subtle' : 'text-text-faint',
            )}
          >
            {topic.algoIds.length}
          </span>
        </span>

        <ChevronDown
          aria-hidden="true"
          className={cn(
            'size-4 shrink-0 text-text-subtle transition-transform duration-300 ease-out',
            open && 'rotate-180',
          )}
        />
      </button>

      {/*
        Progress bar. `width` is a percentage string so it can transition, which is one
        of the two places on this page where animating a size is correct — the bar
        *means* "this much", so animating its extent is the content rather than a
        layout reflow. The parent's overflow clips it, and there is nothing to reflow.
      */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-px bg-border/50"
        role="presentation"
      >
        <span
          className="block h-px bg-success/70 transition-[width] duration-500 ease-out"
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </span>

      <div id={panelId} className={open ? 'disclosure-open' : 'disclosure'}>
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-border/60 px-3.5 pt-3 pb-3.5">
            {/*
              `inert` on the collapsed panel rather than conditional rendering.

              It keeps the content in the DOM, which is what lets the height transition
              work at all, and it takes the collapsed panel's links out of the tab
              order — so keyboard focus cannot disappear into an invisible region. The
              `aria-hidden` is not needed once `inert` is present, and adding it would
              only create the "focusable but hidden" contradiction `inert` exists to
              avoid.
            */}
            <div inert={!open} className="space-y-3.5">
              <p className="measure text-[12.5px] leading-relaxed text-text-muted">{topic.blurb}</p>

              {topic.algoIds.length > 0 ? (
                <section aria-label="Watch it first">
                  <h4 className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-text-subtle uppercase">
                    <Play className="size-3" />
                    Watch it first
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {topic.algoIds.map((id) => {
                      const entry = CATALOG_BY_ID[id];
                      return (
                        <a
                          key={id}
                          href={`/?algo=${id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            onNavigate(`/?algo=${id}`);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md border border-accent/25 bg-accent/8 px-2 py-1 text-[11px] font-medium text-accent transition-colors hover:border-accent/50 hover:bg-accent/12"
                          title={entry ? `${entry.title} — open in the visualiser` : id}
                        >
                          <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
                          {entry ? entry.title : id}
                        </a>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {topic.learnSlugs.length > 0 ? (
                <section aria-label="Read the guide">
                  <h4 className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-text-subtle uppercase">
                    <Eye className="size-3" />
                    Read the guide
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {topic.learnSlugs.map((slug) => {
                      const article = getArticle(slug);
                      return (
                        <a
                          key={slug}
                          href={`/learn/${slug}`}
                          onClick={(e) => {
                            e.preventDefault();
                            onNavigate(`/learn/${slug}`);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md border border-info-deep/30 bg-info-deep/10 px-2 py-1 text-[11px] font-medium text-info transition-colors hover:border-info-deep/60"
                          title={article ? article.dek : slug}
                        >
                          <span aria-hidden="true" className="size-1.5 rounded-full bg-info/70" />
                          {article ? article.title : slug}
                        </a>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              <section aria-label="Questions">
                <h4 className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-text-subtle uppercase">
                  Problems
                  <span className="font-mono font-normal normal-case">· work down each level</span>
                </h4>
                <div className="space-y-3">
                  {groups.map((group) => (
                    <div key={group.level}>
                      <h5 className="mb-1 flex items-center gap-2 text-[10.5px] font-semibold text-text-subtle">
                        <span className="uppercase tracking-wide">{group.level}</span>
                        <span aria-hidden="true" className="h-px flex-1 bg-border/70" />
                        <span className="font-mono text-[9.5px] font-normal">
                          {group.items.length}
                        </span>
                      </h5>
                      <ul className="space-y-0.5">
                        {group.items.map((q) => (
                          <QuestionRow key={q.id} question={q} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
