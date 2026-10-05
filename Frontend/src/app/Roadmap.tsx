import { ArrowRight, Check, Filter, Route, Search, Sparkles, Target, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  LEVEL_LABEL,
  LEVELS,
  type Level,
  PLATFORM_LABEL,
  type Platform,
  ROADMAP_TOTALS,
  type Topic,
  topicsByPhase,
} from '../core/roadmap/index.ts';
import { useSolved, useSolvedSet } from '../features/roadmap/progressStore.ts';
import { TopicCard } from '../features/roadmap/TopicCard.tsx';
import { cn } from '../lib/utils.ts';
import { CommandPalette, useCommandPalette } from './CommandPalette.tsx';
import { PageBody, PageShell } from './PageShell.tsx';

/**
 * The practice roadmap.
 *
 * ## What this page is, and what it is not
 *
 * It is a *route map*: an ordered curriculum that says what to learn, in what order,
 * with which problems, and where each problem lives. It is not a list of the ten most
 * popular problems. That distinction is the whole design, and it is worth stating
 * because the popular-problems list is what every DSA page defaults to — and it is
 * useless to a beginner, because it is sorted by popularity rather than by dependency.
 * Doing "Two Sum" before you know what a hash map is is not a shortcut; it teaches you
 * to reach for a hash map before you know why.
 *
 * ## Why the page is a disclosure list and not a grid of cards
 *
 * The information a learner needs at any moment is "where am I", and a grid of 22
 * equal cards expresses position poorly — everything looks equally urgent and nothing
 * looks next. A vertical timeline with a numbered phase spine and per-topic progress
 * answers "where am I" without being read, which is why the spine and the progress bars
 * carry the meaning and the prose is optional.
 *
 * ## The filter narrows, it does not rearrange
 *
 * Filtering changes which questions are *shown inside* a topic; it never reorders the
 * topics or the phases. A learner who searches "graph" mid-topic gets the graph
 * questions from their graph topic, still sitting between the topics they have not
 * reached yet. Reordering to put matches first would destroy the one thing the page is
 * for, in exchange for a result list that a `Cmd+F` on any other page already provides.
 *
 * ## Progress is local, and that is stated on the page
 *
 * There is no account and no server. The ticked questions live in `localStorage`, which
 * means they survive a reload and do not survive clearing site data or moving to
 * another browser. A reader planning eight weeks of study needs to know which kind of
 * record this is, so the hero says so rather than implying it is durable somewhere.
 */
export function Roadmap({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate: (to: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [platforms, setPlatforms] = useState<Set<Platform>>(() => new Set());
  const [levels, setLevels] = useState<Set<Level>>(() => new Set());
  const [hideSolved, setHideSolved] = useState(false);

  const { open, setOpen } = useCommandPalette(() => setOpen(true));
  const solvedSet = useSolvedSet();
  const solvedCount = useSolved((s) => s.solved.length);
  const clearSolved = useSolved((s) => s.clearSolved);

  const filtering = query.trim() !== '' || platforms.size > 0 || levels.size > 0 || hideSolved;

  /**
   * Which questions each topic shows.
   *
   * Computed once per render from the whole list rather than filtering per topic, so a
   * topic with zero matches is still rendered — see `TopicCard`'s `matchCount`. The
   * alternative, dropping empty topics, means a search for "graph" silently deletes the
   * roadmap around the answer, and the reader loses their place.
   */
  const matchesByTopic = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, Topic['questions']>();
    for (const topic of topicsByPhase().flatMap((g) => g.topics)) {
      map.set(
        topic.id,
        topic.questions.filter((question) => {
          if (platforms.size > 0 && !platforms.has(question.platform)) return false;
          if (levels.size > 0 && !levels.has(question.level)) return false;
          if (hideSolved && solvedSet.has(question.id)) return false;
          if (q === '') return true;
          return (
            question.title.toLowerCase().includes(q) ||
            topic.title.toLowerCase().includes(q) ||
            question.platform.includes(q) ||
            question.level.includes(q)
          );
        }),
      );
    }
    return map;
  }, [query, platforms, levels, hideSolved, solvedSet]);

  const groups = topicsByPhase();
  const visibleTopics = groups.reduce((n, g) => n + g.topics.length, 0);
  const visibleQuestions = [...matchesByTopic.values()].reduce((n, qs) => n + qs.length, 0);

  const overallRatio = ROADMAP_TOTALS.questions === 0 ? 0 : solvedCount / ROADMAP_TOTALS.questions;

  /**
   * The next thing to do.
   *
   * The first unticked question in roadmap order — not in the current filter. A "next"
   * that respects the filter is a nice touch, but it is the wrong touch: someone who
   * filters to "graph" mid-topic is *looking* for graph questions, and being told to go
   * and do two-sum is a worse answer than being told where they left off.
   */
  const nextUp = (() => {
    for (const group of groups) {
      for (const topic of group.topics) {
        for (const q of topic.questions) {
          if (!solvedSet.has(q.id)) return { question: q, topic };
        }
      }
    }
    return null;
  })();

  function resetFilters(): void {
    setQuery('');
    setPlatforms(new Set());
    setLevels(new Set());
    setHideSolved(false);
  }

  const toggleIn = <T,>(set: Set<T>, value: T, apply: (next: Set<T>) => void): void => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    apply(next);
  };

  return (
    <PageShell
      pathname={pathname}
      onNavigate={onNavigate}
      title="Practice roadmap — Unroll"
      /*
       * Counts derived, not written.

       * A meta description with "22 topics across four phases, 324 curated problems"
       * typed into it is a lie waiting for the next person to add a problem, and it is
       * the kind of lie a search engine is the last to notice and a reader is the first
       * to. Interpolating `ROADMAP_TOTALS` means adding a question cannot desync it.
       */
      description={`An ordered DSA roadmap for beginners: ${ROADMAP_TOTALS.topics} topics across four phases, ${ROADMAP_TOTALS.questions} curated LeetCode, InterviewBit, CodeChef, HackerRank, HackerEarth and GeeksforGeeks problems, easy to hard, with progress tracking.`}
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
        {/* --------------------------------------------------------------- hero */}
        <div className="fade-rise relative pt-10 pb-8 sm:pt-14">
          {/*
            The dot grid, masked to fade out before it reaches the text.

            `page-backdrop`'s gradient wash is right for a page of prose and wrong for a
            page that opens with a *plan*: a wash reads as a landing page, and this is a
            tool. Dots read as a worksheet. The mask is what stops it competing with the
            headline — texture that is uniform to the edges of a section sits *behind*
            the text like a mistake, and texture that fades is read as depth.
          */}
          <div
            aria-hidden="true"
            className="dot-grid pointer-events-none absolute inset-x-0 -top-6 -bottom-8 opacity-45 [mask-image:radial-gradient(70%_75%_at_22%_0%,black,transparent)]"
          />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="measure">
              <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border-strong/80 bg-surface-raised/60 px-2.5 py-1 text-[10.5px] font-medium text-text-subtle">
                <Route className="size-3 text-accent" />
                {ROADMAP_TOTALS.topics} topics · {ROADMAP_TOTALS.questions} problems ·{' '}
                {ROADMAP_TOTALS.platforms} platforms
              </p>
              {/*
                `sr-only` restatement of the level split, for a screen reader and for
                search engines: the visible badges below are the numbers, and this is
                the claim they support. "Easy, medium and hard" is a promise the page
                makes in three places, so it should be legible as one sentence somewhere
                rather than only as coloured dots.
              */}
              <p className="sr-only">
                Problems at all three difficulties: {ROADMAP_TOTALS.byLevel.easy} easy,{' '}
                {ROADMAP_TOTALS.byLevel.medium} medium, {ROADMAP_TOTALS.byLevel.hard} hard.
              </p>
              <h1 className="text-[30px] leading-[1.08] font-extrabold tracking-tight text-text-strong sm:text-[38px]">
                A roadmap, not a{' '}
                <span className="bg-gradient-to-r from-accent to-accent-strong bg-clip-text text-transparent">
                  top-100 list
                </span>
              </h1>
              <p className="mt-3 text-[14px] leading-relaxed text-text-muted sm:text-[15px]">
                Ordered the way the ideas depend on each other, not by popularity. Work down it and
                every later topic is built from the one above it — and every problem links to the
                site it actually lives on.
              </p>
            </div>

            {/*
              The progress panel. Stated as a number, a bar, and a sentence in that
              order, because a bar alone ("12%") is not obviously a proportion of
              anything, and the sentence is what tells the reader whether to trust the
              bar.
            */}
            <div className="w-full shrink-0 rounded-xl border border-border/80 bg-surface-raised/50 p-4 lg:w-[19rem]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] font-bold tracking-wide text-text-subtle uppercase">
                  Your progress
                </span>
                <span className="font-mono text-[11px] text-text-subtle">
                  {solvedCount}/{ROADMAP_TOTALS.questions}
                </span>
              </div>
              <ProgressBar ratio={overallRatio} />
              <p className="mt-2.5 text-[11px] leading-relaxed text-text-subtle">
                {solvedCount === 0
                  ? 'Nothing ticked yet. Open the first topic and start anywhere.'
                  : `${Math.round(overallRatio * 100)}% of the roadmap solved.`}{' '}
                <span className="text-text-faint">
                  Ticks are saved in this browser only — no account, nothing sent anywhere.
                </span>
              </p>

              {solvedCount > 0 ? (
                <button
                  type="button"
                  onClick={clearSolved}
                  className="press-in mt-2.5 text-[10.5px] text-text-subtle underline decoration-dotted underline-offset-2 transition-colors hover:text-danger"
                >
                  Clear all progress
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------ next up card */}
        {nextUp ? (
          <a
            href={nextUp.question.url}
            target="_blank"
            rel="noopener noreferrer"
            className="stagger group mb-8 flex items-center gap-3 rounded-xl border border-accent/25 bg-accent/6 px-4 py-3 transition-all duration-200 hover:border-accent/50 hover:bg-accent/10"
            style={{ '--i': 0 } as React.CSSProperties}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/15">
              <Target className="size-4 text-accent" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold tracking-wide text-accent uppercase">
                {solvedCount === 0 ? 'Start here' : 'Up next'}
              </span>
              <span className="block truncate text-[13.5px] font-semibold text-text-strong">
                {nextUp.question.title}
              </span>
              <span className="block truncate text-[11px] text-text-subtle">
                {nextUp.topic.title} · {LEVEL_LABEL[nextUp.question.level]} ·{' '}
                {PLATFORM_LABEL[nextUp.question.platform]}
              </span>
            </span>
            <ArrowRight
              aria-hidden="true"
              className="size-4 shrink-0 text-accent transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </a>
        ) : (
          <div className="mb-8 flex items-center gap-3 rounded-xl border border-success/30 bg-success/8 px-4 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-success/15">
              <Check className="size-4 text-success" strokeWidth={3} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold text-success-strong">
                Every problem on the roadmap is ticked.
              </span>
              <span className="block text-[11px] text-text-subtle">
                Interview a few strangers instead — the hard problems on these platforms are shallow
                compared to a real conversation.
              </span>
            </span>
          </div>
        )}

        {/* ------------------------------------------------------------ filters */}
        <div className="sticky top-0 z-20 -mx-4 mb-8 border-y border-border/60 bg-surface/85 px-4 py-2.5 backdrop-blur-md sm:-mx-6 sm:px-6">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-text-subtle"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter by problem, topic, platform or level…"
                  aria-label="Filter roadmap questions"
                  className="w-full rounded-lg border border-border-strong/70 bg-surface-inset/50 py-1.5 pr-2 pl-8 text-[12.5px] text-text-strong transition-colors outline-none placeholder:text-text-subtle focus:border-accent/60"
                />
              </div>
              <button
                type="button"
                onClick={() => setHideSolved((v) => !v)}
                aria-pressed={hideSolved}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors duration-150',
                  hideSolved
                    ? 'border-accent/50 bg-accent/12 text-accent'
                    : 'border-border-strong/70 bg-surface-inset/40 text-text-subtle hover:text-text-muted',
                )}
                title="Hide questions you have already ticked"
              >
                <Check className="size-3" />
                <span className="hidden sm:inline">Hide solved</span>
              </button>
              {filtering ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="press-in flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[11.5px] text-text-subtle transition-colors hover:text-text"
                >
                  <X className="size-3" />
                  Reset
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
              <span className="flex items-center gap-1 pr-1 text-[10px] font-bold tracking-wide text-text-faint uppercase">
                <Filter className="size-2.5" />
                Site
              </span>
              {(Object.keys(PLATFORM_LABEL) as Platform[]).map((p) => {
                const on = platforms.has(p);
                const n = ROADMAP_TOTALS.byPlatform[p] ?? 0;
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleIn(platforms, p, setPlatforms)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-all duration-150 active:scale-[0.97]',
                      on
                        ? 'border-accent/50 bg-accent/12 text-accent'
                        : 'border-border-strong/70 bg-surface-inset/40 text-text-subtle hover:border-border-subtle hover:text-text-muted',
                    )}
                  >
                    {PLATFORM_LABEL[p]}
                    <span className="font-mono text-[9px] opacity-70">{n}</span>
                  </button>
                );
              })}

              <span
                aria-hidden="true"
                className="mx-1 hidden h-3.5 w-px bg-border-strong sm:block"
              />

              <span className="flex items-center gap-1 pr-1 text-[10px] font-bold tracking-wide text-text-faint uppercase">
                Level
              </span>
              {LEVELS.map((l) => {
                const on = levels.has(l);
                return (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleIn(levels, l, setLevels)}
                    className={cn(
                      'rounded-md border px-2 py-0.5 text-[11px] font-medium transition-all duration-150 active:scale-[0.97]',
                      on
                        ? 'border-accent/50 bg-accent/12 text-accent'
                        : 'border-border-strong/70 bg-surface-inset/40 text-text-subtle hover:border-border-subtle hover:text-text-muted',
                    )}
                  >
                    {LEVEL_LABEL[l]}
                    <span className="ml-1.5 font-mono text-[9px] opacity-70">
                      {ROADMAP_TOTALS.byLevel[l]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------------- timeline */}
        {visibleQuestions === 0 ? (
          <div className="fade-rise flex min-h-[40vh] flex-col items-center justify-center py-12 text-center">
            <p className="text-[15px] font-semibold text-text-strong">
              Nothing matches those filters
            </p>
            <p className="measure mt-2 text-[13px] leading-relaxed text-text-muted">
              Every topic is still in the order it should be attempted in — the filter only hides
              problems, so nothing has been lost.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="press-in mt-5 inline-flex items-center gap-2 rounded-lg border border-border-strong px-4 py-2 text-[13px] font-medium text-text-muted transition-all duration-200 hover:border-border-subtle hover:bg-surface-inset/50 hover:text-text"
            >
              <X className="size-3.5" />
              Clear all filters
            </button>
          </div>
        ) : (
          <ol className="relative space-y-12 pb-20">
            {/*
              The spine. `rail-grow` scales it from the top so the roadmap reads as
              being drawn downward, and it is behind everything with no `z-index` of its
              own — it is a background, and the phase nodes sit on it.
            */}
            <span
              aria-hidden="true"
              className="rail-grow pointer-events-none absolute top-2 bottom-8 left-[13px] hidden w-px bg-gradient-to-b from-accent/45 via-border-strong to-transparent md:block"
            />

            {groups.map(({ phase, topics }, gi) => {
              const phaseQuestions = topics.flatMap((t) => t.questions);
              const phaseDone = phaseQuestions.filter((q) => solvedSet.has(q.id)).length;
              const phaseRatio =
                phaseQuestions.length === 0 ? 0 : phaseDone / phaseQuestions.length;

              return (
                <li
                  key={phase.id}
                  className="rise-in relative"
                  style={{ '--i': Math.min(gi, 4) } as React.CSSProperties}
                >
                  <div className="mb-5 flex gap-4 md:gap-5">
                    {/* phase node */}
                    <div className="relative z-10 shrink-0">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'node-breathe flex size-[26px] items-center justify-center rounded-full border-2 font-mono text-[11px] font-bold',
                          phaseDone > 0
                            ? 'border-accent/70 bg-surface text-accent shadow-lg shadow-accent-deep/20'
                            : 'border-border-strong bg-surface text-text-subtle',
                        )}
                      >
                        {gi + 1}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                        <h2 className="text-[19px] font-bold tracking-tight text-text-strong">
                          {phase.label}
                        </h2>
                        <span className="rounded bg-surface-inset px-1.5 py-0.5 font-mono text-[9.5px] text-text-subtle">
                          {phase.weeks}
                        </span>
                        <span className="text-[10.5px] text-text-subtle">
                          {topics.length} topics · {phaseQuestions.length} problems
                        </span>
                      </div>
                      <p className="measure mt-1.5 text-[13px] leading-relaxed text-text-muted">
                        {phase.blurb}
                      </p>
                      <p className="measure mt-2 rounded-lg border border-border/70 bg-surface-raised/40 px-3 py-2 text-[12px] leading-relaxed text-text-subtle">
                        <span className="font-bold tracking-wide text-text-muted uppercase">
                          By the end
                        </span>{' '}
                        {phase.outcome}
                      </p>

                      <div className="mt-3 flex items-center gap-2.5">
                        {/*
                          The label names the phase. Five bars with the same
                          accessible name is not a cosmetic problem — a screen reader
                          announces "progress bar, 0 percent" five times with nothing to
                          tell them apart, which is the same reason the four phases are
                          distinct headings rather than one heading with sub-labels.
                        */}
                        <ProgressBar
                          ratio={phaseRatio}
                          sheen={gi * 260}
                          className="max-w-xs"
                          label={`${phase.label} progress`}
                        />
                        <span className="shrink-0 font-mono text-[10px] text-text-subtle">
                          {phaseDone}/{phaseQuestions.length}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5 md:pl-[42px]">
                    {topics.map((topic, ti) => (
                      <TopicCard
                        key={topic.id}
                        topic={topic}
                        defaultOpen={gi === 0 && ti === 0}
                        onNavigate={onNavigate}
                        matchCount={(matchesByTopic.get(topic.id) ?? []).length}
                      />
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <footer className="rule-fade mb-16" />
        <p className="measure pb-16 text-[11.5px] leading-relaxed text-text-subtle">
          Links are hand-checked against each platform&rsquo;s catalogue, but sites rename problems
          and move things around. If a link is dead, the problem name is enough to find it again in
          the site&rsquo;s own search. {visibleTopics} topics and {visibleQuestions} problems shown
          {filtering ? ' after filtering' : ''}.
        </p>
      </PageBody>

      <CommandPalette open={open} onClose={() => setOpen(false)} onNavigate={onNavigate} />
    </PageShell>
  );
}

/**
 * A determinate progress bar.
 *
 * ## Two layers, and why
 *
 * The fill is the bar. The sheen on top of it is a gradient that slides across, and it
 * is gated on `ratio > 0` so a bar at zero does not shimmer — a moving highlight on an
 * empty track reads as "loading", which is exactly the wrong message for "you have not
 * started".
 *
 * ## `role="progressbar"` with all three ARIA values
 *
 * `aria-valuenow` alone is meaningless, because "12 out of what?" is not answerable
 * from a number. `valuemin` and `valuemax` are what let a screen reader say "12%",
 * and the visible `aria-label` is what says *which* progress.
 *
 * ## The width transition is one of two legal size animations
 *
 * The other is the timeline's `scaleY`. Both animate a dimension of a box the reader
 * is reading *as* a dimension — the bar's length means the value — and neither is
 * inside the player, where a reflow would be indistinguishable from the algorithm
 * having changed.
 */
function ProgressBar({
  ratio,
  sheen = 0,
  className,
  label = 'Overall roadmap progress',
}: {
  ratio: number;
  /** Stagger, so the phase bars shimmer one after another rather than in unison. */
  sheen?: number;
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1, ratio));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
      className={cn(
        'relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-inset',
        className,
      )}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent to-accent-strong transition-[width] duration-700 ease-out"
        style={{ width: `${pct * 100}%` }}
      />
      {pct > 0 ? (
        <div
          aria-hidden="true"
          className="bar-sheen absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent"
          style={{ '--sheen': `${sheen}ms` } as React.CSSProperties}
        />
      ) : null}
    </div>
  );
}
