import { lazy, Suspense, useEffect, useState } from 'react';

/**
 * The ⌘K trigger, the shortcut, and a lazily-loaded dialog.
 *
 * ## Why this file is not the dialog
 *
 * Because of one import. The dialog needs `ARTICLE_LIST` in order to search
 * articles, and `core/learn/index.ts` statically imports **every article**, prose and
 * all. So any *eager* import of the dialog puts the whole guides section into the
 * entry chunk — and `Browse.tsx`, which is eager because it is the home page,
 * renders the palette.
 *
 * That is not a hypothetical. It is how the entry chunk went from 74.9 kB to 113.7 kB
 * gzip when the section grew from seven articles to nineteen, which put the initial
 * payload at 235.7 kB against a 200 kB budget. Neither `learn.test.ts` nor the
 * boundary test can see it, because every import involved is legitimate on its own —
 * it is only the *timing* that is wrong. `node tools/budget.mjs` is what sees it, and
 * `routes.tsx` has a long note on the identical mistake made by `LearnIndex`.
 *
 * ## What it costs, stated plainly
 *
 * The first ⌘K of a session fetches the dialog chunk — which contains the article
 * prose, and is the same chunk `/learn` loads — before the dialog can paint. On a
 * warm connection that is a moment; on a cold one it is a beat with nothing on screen,
 * which is why the fallback is `null` rather than a spinner: a spinner that flashes
 * for 80 ms is worse than the absence of one.
 *
 * That trade is worth taking, because the alternative is charging *every* visitor —
 * including the great majority who never open the palette and never visit `/learn` —
 * for all nineteen articles. The only way to avoid both is to split article metadata
 * from article bodies, which duplicates every title and dek in the repo and buys one
 * keystroke.
 *
 * ## Why the gate is before the `lazy` call
 *
 * `if (!open) return null` rather than a Suspense boundary that is always mounted:
 * the dynamic import inside `lazy()` fires the first time the component *renders*, so
 * mounting the boundary unconditionally would fetch the chunk on every page of the
 * site and recreate the original bug one level deeper.
 */

const Dialog = lazy(() =>
  import('./CommandPaletteDialog.tsx').then((m) => ({ default: m.CommandPaletteDialog })),
);

export function CommandPalette({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (to: string) => void;
}) {
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <Dialog open={open} onClose={onClose} onNavigate={onNavigate} />
    </Suspense>
  );
}

/**
 * The ⌘K trigger, and the global shortcut.
 *
 * Mounted once, on the pages that want it. The listener is on `document` rather than
 * on a focused element so the shortcut works from anywhere, and it ignores events
 * originating in a text field — otherwise pressing ⌘K while typing a custom input
 * into the editor opens the palette and swallows the keystroke.
 *
 * Stays here, eagerly, because it has no dependency on anything: the shortcut has to
 * work on a page whose dialog chunk has not loaded yet.
 */
export function useCommandPalette(onOpen: () => void): {
  open: boolean;
  setOpen: (v: boolean) => void;
} {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isK = e.key === 'k' || e.key === 'K';
      if (!isK || !(e.metaKey || e.ctrlKey)) return;
      const el = e.target as HTMLElement | null;
      const typing =
        el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable === true;
      if (typing) return;
      e.preventDefault();
      onOpen();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onOpen]);

  return { open, setOpen };
}
