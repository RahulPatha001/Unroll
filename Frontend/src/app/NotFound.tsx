import { Compass, Home, Search } from 'lucide-react';
import { CATALOG } from '../core/algorithms/catalog.ts';
import { CommandPalette, useCommandPalette } from './CommandPalette.tsx';
import { PageBody, PageShell } from './PageShell.tsx';

/**
 * Not found.
 *
 * ## Why it exists at all in a single-page app
 *
 * Because the app now has real paths, and a real path can 404 two ways: a typo, and
 * a link to something that was renamed. Without a route for `*`, the second case
 * renders *nothing at all* — the router finds no match, mounts no element, and the
 * student gets a blank page below the browser chrome. That is the single most
 * common way a client-side router looks broken, and it looks identical to a failed
 * JavaScript bundle.
 *
 * ## It always offers a way out, and never a dead end
 *
 * Three routes, all of which work: home, the catalogue, and search. A 404 that only
 * says "not found" makes the reader do the work of working out what to do next;
 * this one is already the recovery UI.
 *
 * `what` exists so the article page can pass "That guide" and get "That guide does
 * not exist" rather than the vaguer "This page does not exist", which would be
 * technically true and practically unhelpful.
 */
export function NotFound({
  pathname,
  onNavigate,
  what = 'This page',
}: {
  pathname: string;
  onNavigate: (to: string) => void;
  what?: string;
}) {
  const { open, setOpen } = useCommandPalette(() => setOpen(true));

  /*
   * Three real algorithms rather than three decorative suggestions.

   * The strongest possible recovery from a dead link is a working one, and a list
   * of "popular" algorithms that is hard-coded would go stale the day someone adds
   * something better. Taken from the catalog's own first entries — which are in
   * curriculum order, not popularity order — so this is a suggestion about *where to
   * start*, which is what a lost reader actually needs.
   */
  const suggestions = CATALOG.slice(0, 3);

  return (
    <PageShell
      pathname={pathname}
      onNavigate={onNavigate}
      title="Not found — Unroll"
      description="That page does not exist. Here is the way back."
    >
      <PageBody>
        <div className="fade-rise flex min-h-[70vh] flex-col items-center justify-center py-16 text-center">
          <p className="font-mono text-[52px] leading-none font-extrabold text-accent/25">404</p>
          <h1 className="mt-3 text-[24px] font-extrabold tracking-tight text-text-strong">
            {what} does not exist
          </h1>
          <p className="measure mt-2 text-[14px] leading-relaxed text-text-muted">
            The link may be out of date, or the address may have a typo in it. Here is the way back
            — nothing is lost.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/');
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13px] font-bold text-text-inverse shadow-lg shadow-accent-deep/25 transition-all duration-200 hover:bg-accent-hover active:scale-[0.98]"
            >
              <Home className="size-3.5" />
              All algorithms
            </a>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-border-strong px-4 py-2 text-[13px] font-medium text-text-muted transition-all duration-200 hover:border-border-subtle hover:bg-surface-inset/50 hover:text-text active:scale-[0.98]"
            >
              <Search className="size-3.5" />
              Search
              <kbd className="rounded border border-border-strong px-1 font-mono text-[10px]">
                ⌘K
              </kbd>
            </button>
          </div>

          <div className="mt-10 w-full max-w-md">
            <h2 className="mb-2 flex items-center justify-center gap-1.5 text-[10px] font-bold tracking-wide text-text-subtle uppercase">
              <Compass className="size-3" />
              Or start here
            </h2>
            <ul className="flex flex-wrap justify-center gap-1.5">
              {suggestions.map((e) => (
                <li key={e.id}>
                  <a
                    href={`/?algo=${e.id}`}
                    onClick={(ev) => {
                      ev.preventDefault();
                      onNavigate(`/?algo=${e.id}`);
                    }}
                    className="block rounded-full border border-border-strong bg-surface-raised/60 px-3 py-1 text-[12px] font-medium text-text-muted transition-all duration-150 hover:border-accent/50 hover:bg-surface-inset hover:text-text"
                  >
                    {e.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </PageBody>

      <CommandPalette open={open} onClose={() => setOpen(false)} onNavigate={onNavigate} />
    </PageShell>
  );
}
