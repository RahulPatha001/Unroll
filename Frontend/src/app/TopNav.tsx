import { BookOpen, Columns2, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/utils.ts';

/**
 * The site header.
 *
 * ## Why the player needed one at all
 *
 * Until this existed, the only chrome was the sidebar and the algorithm's own
 * header, which meant the visualiser was a closed room: there was no way *out*
 * of it except the browser's Back button or the logo in the tab strip. That is
 * survivable when the app is one page and unreachable when it is five. Every
 * navigation affordance in the product now routes through here.
 *
 * ## The height budget
 *
 * `h-11`, and that number is a decision rather than a default. The player is a
 * fixed-viewport layout whose vertical budget is genuinely tight — header,
 * narration card, visualisation and transport all compete, and `LayoutHeader`
 * regression tests assert that the header measures the same at every width and
 * that opening the detail panel resizes nothing. Adding 44px to the top of that
 * column is the single most disruptive change available to this milestone, so it
 * is the smallest value that still reads as a deliberate bar rather than a
 * sliver, and `tests/visual/layout.spec.ts` re-measures the player with it in
 * place.
 *
 * ## It is not sticky, and that is deliberate
 *
 * `sticky top-0` would be the obvious choice for a scrolling article. But this
 * bar sits inside a `h-dvh` column whose only child scrolls, so `position: fixed`
 * would have to be paired with a body-level padding hack, and `sticky` against a
 * non-scrolling parent does nothing at all. Rather than ship a nav that appears to
 * stick and then scrolls away — the kind of thing that reads as a bug — it is a
 * plain block at the top of the page, and the article's own table of contents is
 * what stays reachable while reading.
 */

export interface NavLink {
  to: string;
  label: string;
  icon: ReactNode;
}

export const NAV_LINKS: NavLink[] = [
  { to: '/', label: 'Algorithms', icon: <Search className="size-3.5" /> },
  { to: '/learn', label: 'Learn', icon: <BookOpen className="size-3.5" /> },
  { to: '/compare', label: 'Compare', icon: <Columns2 className="size-3.5" /> },
];

export function TopNav({
  /** The active route's pathname, for the current-page indicator. */
  pathname,
  /** Right-aligned slot — the command-palette trigger, on the pages that have one. */
  children,
  onNavigate,
}: {
  pathname: string;
  children?: ReactNode;
  onNavigate: (to: string) => void;
}) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-1 border-b border-border/70 bg-surface-raised/70 px-2 backdrop-blur-md sm:px-3">
      <a
        href="/"
        onClick={(e) => {
          // Intercepted so the browse page is a client transition. Left as a real
          // `href` rather than a `<Link>` because the header is rendered outside
          // the router's `<Routes>` in one mount path, and an anchor with a valid
          // href still works if that ever stops being true — including for a
          // middle-click or "open in new tab", which `onClick`-preventDefault
          // preserves.
          e.preventDefault();
          onNavigate('/');
        }}
        className="group mr-1 flex shrink-0 items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-surface-inset"
        title="Unroll — home"
      >
        <span
          aria-hidden="true"
          className="flex size-5 items-center justify-center rounded-[5px] bg-gradient-to-br from-accent to-accent-deep font-mono text-[10px] font-bold text-text-inverse shadow-sm shadow-accent-deep/30 transition-transform duration-200 group-hover:scale-105"
        >
          U
        </span>
        <span className="text-[13px] font-bold tracking-tight text-text-strong">Unroll</span>
      </a>

      <nav aria-label="Sections" className="flex min-w-0 items-center gap-0.5">
        {NAV_LINKS.map((l) => {
          // Exact match for `/`, prefix match elsewhere, so `/learn/quick-sort`
          // keeps "Learn" lit. The `!` is not `startsWith('/')` precisely because
          // every route starts with a slash.
          const active = l.to === '/' ? pathname === '/' : pathname.startsWith(l.to);
          return (
            <a
              key={l.to}
              href={l.to}
              aria-current={active ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(l.to);
              }}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium transition-all duration-150',
                active
                  ? 'bg-surface-inset text-text-strong shadow-sm ring-1 ring-border-strong/60'
                  : 'text-text-muted hover:bg-surface-inset/70 hover:text-text',
              )}
            >
              {l.icon}
              <span className="hidden sm:inline">{l.label}</span>
            </a>
          );
        })}
      </nav>

      <div className="ml-auto flex min-w-0 items-center gap-1">{children}</div>
    </header>
  );
}
