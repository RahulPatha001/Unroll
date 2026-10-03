import { ArrowRight, BookOpen, ChevronLeft, Sparkles } from 'lucide-react';
import { CATALOG_BY_ID } from '../core/algorithms/catalog.ts';
import { ARTICLE_CATEGORY_LABEL, ARTICLE_LIST, getArticle } from '../core/learn/index.ts';
import { ArticleBody, slugify } from '../features/learn/ArticleBody.tsx';
import { CommandPalette, useCommandPalette } from './CommandPalette.tsx';
import { NotFound } from './NotFound.tsx';
import { PageBody, PageShell } from './PageShell.tsx';

/**
 * One article.
 *
 * ## The table of contents is generated, and that is why it can be trusted
 *
 * Every `h2` block becomes an entry, linking to the id `ArticleBody` gives that
 * same heading via the shared `slugify`. There is no hand-maintained list to fall
 * out of sync with the prose — the failure mode of every other approach, where
 * someone renames a section and the contents link scrolls nowhere with no error.
 *
 * ## An unknown slug is a 404, not a crash
 *
 * `getArticle` returns `undefined` for a slug that is not in the registry, and a
 * shared link to an article that was renamed or removed has to land somewhere
 * honest. It gets the same `NotFound` as a bad URL, which offers the way out —
 * back to Learn, or search for something else. Rendering `undefined.title` instead
 * would produce a white page, which is the one outcome that looks like a crash.
 */
export function ArticlePage({
  slug,
  pathname,
  onNavigate,
}: {
  slug: string;
  pathname: string;
  onNavigate: (to: string) => void;
}) {
  const { open, setOpen } = useCommandPalette(() => setOpen(true));
  const article = getArticle(slug);

  if (!article) {
    return <NotFound pathname={pathname} onNavigate={onNavigate} what="That guide" />;
  }

  const position = ARTICLE_LIST.findIndex((a) => a.slug === slug);
  const next = ARTICLE_LIST[position + 1];
  /*
   * Backwards, too.
   *
   * "Next" alone made the section a corridor: every article pointed forward, so the
   * only way back to something you skipped was the browser. With nineteen articles
   * and a hand-ordered list that is a real cost, and the `previous` link is four
   * lines. `position === -1` cannot happen — an unknown slug has already 404'd above
   * — but `ARTICLE_LIST[position - 1]` on -1 would be `undefined` anyway, which is
   * why this needs no guard of its own.
   */
  const previous = ARTICLE_LIST[position - 1];
  const algo = article.algoId ? CATALOG_BY_ID[article.algoId] : undefined;

  const toc = article.body.filter((b) => b.kind === 'h2');

  return (
    <PageShell
      pathname={pathname}
      onNavigate={onNavigate}
      title={`${article.title} — Unroll`}
      description={article.dek}
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
      <PageBody className="pb-16">
        {/*
          A two-column grid above `lg`, article and contents side by side. The
          breakpoint is `lg` and not `xl` because the contents column is narrow
          (14rem) and the article is capped at `65ch` anyway — at 1024 there is
          still 1024 - 14rem - gutters ≈ 750px of reading width, which is a
          comfortable measure. Above `xl` that same space would be padding.
        */}
        <div className="grid grid-cols-1 gap-10 pt-6 lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-12">
          <article className="min-w-0">
            <a
              href="/learn"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/learn');
              }}
              className="inline-flex items-center gap-1 text-[11.5px] font-medium text-text-subtle transition-colors hover:text-text"
            >
              <ChevronLeft className="size-3.5" />
              All guides
            </a>

            <header className="fade-rise py-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-info-deep/15 px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wide text-info uppercase">
                  {ARTICLE_CATEGORY_LABEL[article.category]}
                </span>
                <span className="inline-flex items-center gap-1 text-[10.5px] text-text-subtle">
                  <BookOpen className="size-3" />
                  {article.readMinutes} min read
                </span>
              </div>
              <h1 className="mt-2.5 text-[28px] leading-[1.15] font-extrabold tracking-tight text-text-strong sm:text-[34px]">
                {article.title}
              </h1>
              <p className="measure mt-3 text-[15px] leading-relaxed text-text-muted">
                {article.dek}
              </p>

              {/*
                The article's own call to the visualiser.

                Only rendered when the article declares an `algoId`, and linked as a
                real `<a>` so it is shareable and openable in a new tab. This is the
                seam between the two halves of the product: the article explains, and
                this is the one click that takes you to the thing being explained.
              */}
              {algo ? (
                <a
                  href={`/?algo=${algo.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(`/?algo=${algo.id}`);
                  }}
                  className="group mt-5 inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3.5 py-2 text-[12.5px] font-semibold text-accent-strong transition-all duration-200 hover:border-accent/70 hover:bg-accent/15 active:scale-[0.98]"
                >
                  Open {algo.title} in the visualiser
                  <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </a>
              ) : null}
            </header>

            {/*
                Tags, rendered as plain text.

                They are the command palette's search vocabulary, so showing them here
                tells the reader something true and useful — these words will find this
                article in ⌘K — rather than offering navigation to a tag index that does
                not exist.
              */}
            {article.tags.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-x-2 gap-y-1">
                {article.tags.map((tag) => (
                  <li key={tag} className="text-[11px] text-text-subtle/90">
                    {tag}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="rule-fade mb-6" />

            <ArticleBody blocks={article.body} onNavigate={onNavigate} />

            {/*
              Previous and next, in one row.

              Two links rather than a single one, in the same order as
              `ARTICLE_LIST`, because that list *is* the reading order and a lone
              "next" quietly contradicts it. Both are `<a>` with a real `href` and an
              intercepted click, so the current URL is always shareable.
            */}
            {previous || next ? (
              <nav aria-label="Other guides" className="mt-12 grid gap-3 sm:grid-cols-2">
                {previous ? (
                  <a
                    href={`/learn/${previous.slug}`}
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigate(`/learn/${previous.slug}`);
                    }}
                    className="stagger group flex items-center gap-3 rounded-xl border border-border/80 bg-surface-raised/40 p-4 transition-all duration-200 hover:border-accent/50 hover:bg-surface-raised/70"
                  >
                    <ChevronLeft className="size-4 shrink-0 text-text-subtle transition-transform duration-200 group-hover:-translate-x-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] font-semibold tracking-wide text-text-subtle uppercase">
                        Previous
                      </span>
                      <span className="block truncate text-[14px] font-semibold text-text-strong">
                        {previous.title}
                      </span>
                    </span>
                  </a>
                ) : (
                  // Keeps the "Next" card on the right on the first article, rather
                  // than jumping to the left column for no reason.
                  <span aria-hidden="true" />
                )}
                {next ? (
                  <a
                    href={`/learn/${next.slug}`}
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigate(`/learn/${next.slug}`);
                    }}
                    className="stagger group flex items-center gap-3 rounded-xl border border-border/80 bg-surface-raised/40 p-4 text-right transition-all duration-200 hover:border-accent/50 hover:bg-surface-raised/70"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] font-semibold tracking-wide text-text-subtle uppercase">
                        Next
                      </span>
                      <span className="block truncate text-[14px] font-semibold text-text-strong">
                        {next.title}
                      </span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-text-subtle transition-transform duration-200 group-hover:translate-x-0.5" />
                  </a>
                ) : null}
              </nav>
            ) : null}
          </article>

          {toc.length > 1 ? (
            <nav aria-label="On this page" className="hidden lg:block">
              <div className="sticky top-6">
                <h2 className="mb-2 text-[10px] font-bold tracking-wide text-text-subtle uppercase">
                  On this page
                </h2>
                <ul className="space-y-1 border-l border-border/70 pl-3">
                  {toc.map((b) =>
                    b.kind === 'h2' ? (
                      <li key={b.text}>
                        <a
                          href={`#${slugify(b.text)}`}
                          className="block text-[11.5px] leading-snug text-text-subtle transition-colors hover:text-text"
                        >
                          {b.text}
                        </a>
                      </li>
                    ) : null,
                  )}
                </ul>
              </div>
            </nav>
          ) : null}
        </div>
      </PageBody>

      <CommandPalette open={open} onClose={() => setOpen(false)} onNavigate={onNavigate} />
    </PageShell>
  );
}
