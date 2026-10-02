import { type ReactNode, useEffect } from 'react';
import { cn } from '../lib/utils.ts';
import { TopNav } from './TopNav.tsx';

/**
 * The shell for every page that scrolls.
 *
 * ## The scroll container is this component, not the document
 *
 * `index.css` sets `body { overflow: hidden }`, and that is load-bearing: the
 * player is a fixed-viewport layout where page-level scrolling would move the
 * transport bar off-screen and make it unreachable on a short window. Removing
 * that rule to let an article scroll would trade a deliberate, tested constraint
 * for an incidental convenience — and would let the player's own layout drift
 * depending on which route happened to be mounted.
 *
 * So the rule stays, and each scrolling page becomes its own scroll context:
 * `h-dvh` establishes a fixed-height box that exactly fills the viewport, and
 * `overflow-y-auto` makes *that* the thing that scrolls. The document never
 * scrolls on any route, which is the same guarantee on every page.
 *
 * The trade-off is honest and worth stating: a nested scroll container means the
 * mobile URL bar will not collapse on article pages, because that behaviour is
 * tied to the *document* scrolling. The app is already `h-dvh` throughout, so this
 * is consistent with how the player behaves rather than a new inconsistency — but
 * it is a real cost of the approach, not a free win.
 *
 * ## Why `overscroll-contain` is here
 *
 * Without it, scrolling to the end of a long article and continuing the gesture
 * hands the scroll to the document, which then rubber-bands — a small bounce that
 * reads as the page glitching. `overscroll-contain` ends the chain at this element.
 */
export function PageShell({
  children,
  pathname,
  onNavigate,
  navSlot,
  className,
  title,
  description,
}: {
  children: ReactNode;
  pathname: string;
  onNavigate: (to: string) => void;
  navSlot?: ReactNode;
  className?: string;
  /** The document title, so the tab and the history entry are distinct per page. */
  title: string;
  description: string;
}) {
  return (
    <div className="page-backdrop flex h-dvh flex-col overflow-hidden text-text">
      <PageMeta title={title} description={description} />
      <TopNav pathname={pathname} onNavigate={onNavigate}>
        {navSlot}
      </TopNav>

      {/*
        `flex-1 min-h-0` is the combination that matters. `flex-1` alone on a flex
        child resolves the basis to 0% but does not cap the height, so the element
        grows past the viewport and the scroll container never engages;
        `min-h-0` is what allows it to shrink below its own content size. `App.tsx`
        documents the same trap for the visualisation's height.
      */}
      <main className={cn('fade-in min-h-0 flex-1 overflow-y-auto overscroll-contain', className)}>
        {children}
      </main>
    </div>
  );
}

/**
 * A page-level width container.
 *
 * `max-w-6xl` centred, with the padding that keeps content off the very edge of a
 * phone. Every page's outer wrapper uses it, so the browse grid, an article and
 * the compare view share one horizontal rhythm — three pages that each invented
 * their own gutter is how a site ends up looking like three sites.
 */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6', className)}>{children}</div>;
}

/**
 * Per-page document metadata.
 *
 * Imperative rather than a `<title>` element per page, because the player also
 * owns the document title and two sources for it would fight. This is also the
 * only place in the app that touches `document.title`, so there is exactly one
 * thing to audit when a page's tab label is wrong.
 */
function PageMeta({ title, description }: { title: string; description: string }) {
  useEffect(() => {
    document.title = title;
    // Created rather than assumed: `index.html` ships a description for the
    // player's own share link, and this reuses that tag instead of adding a
    // second one that a crawler would have to guess between.
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', description);
  }, [title, description]);
  return null;
}
