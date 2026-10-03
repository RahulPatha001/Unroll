import { AlertTriangle, Info, Lightbulb } from 'lucide-react';
import type { Block } from '../../core/learn/types.ts';
import { Em } from '../../lib/richText.tsx';
import { cn } from '../../lib/utils.ts';
import { EmbeddedStepper } from './EmbeddedStepper.tsx';

/**
 * Blocks to elements.
 *
 * Deliberately a `switch` on a discriminated union with no fallthrough and no
 * default case — the same enforcement idea `Viewport.tsx` uses for the `Frame`
 * union. Adding a block kind to `Block` makes this function a compile error until
 * it is handled, so a new block type cannot ship rendering as nothing.
 *
 * ## No `dangerouslySetInnerHTML`, anywhere
 *
 * Every piece of prose in this app is authored in-repo, but "authored in-repo" is
 * a property of *today* and not a guarantee about tomorrow: the moment an article
 * can come from a CMS or a fetch, an HTML passthrough is one refactor away and it
 * is the single most common way a React app grows an XSS hole. `Em` renders a
 * `<strong>` it creates itself from a `**…**` split, React escapes every text node
 * it is handed, and there is no sanitizer to forget to call.
 *
 * ## Why `h2` gets an id
 *
 * The article page builds a table of contents from the `h2` blocks and links to
 * them. `slugify` here and the one in `ArticlePage` have to agree, which is why
 * both live in this file's module scope rather than being written out twice.
 */

const CALLOUT_TONE = {
  note: { icon: Info, ring: 'border-info-deep/40', bg: 'bg-info-deep/10', text: 'text-info' },
  warn: { icon: AlertTriangle, ring: 'border-accent/50', bg: 'bg-accent/10', text: 'text-accent' },
  good: { icon: Lightbulb, ring: 'border-success/40', bg: 'bg-success/10', text: 'text-success' },
} as const;

export function ArticleBody({
  blocks,
  onNavigate,
}: {
  blocks: Block[];
  /**
   * Passed to `Em` so an inline `[label](/learn/…)` cross-reference is a router
   * transition rather than a full document load.
   *
   * The anchor carries a real `href` either way — see `Em` — so this only decides
   * whether the click is intercepted, not whether the link works. Which means the
   * articles are still fully readable as plain Markdown text if this is ever
   * dropped, and nothing depends on it for correctness.
   */
  onNavigate: (to: string) => void;
}) {
  return (
    <div className="space-y-4">
      {blocks.map((block) => (
        <BlockRenderer key={blockKey(block)} block={block} onNavigate={onNavigate} />
      ))}
    </div>
  );
}

/**
 * A stable React key for a block.
 *
 * ## Why not the array index
 *
 * Because it is the wrong identity, and `noArrayIndexKey` is right to object. An
 * index says "this is whatever is in position 3", so inserting a paragraph above a
 * code block makes React reuse the paragraph's DOM for the code block and the
 * browser's scroll position, focus and text selection all go with it. It also
 * silently re-associates any state a block ever grows.
 *
 * Blocks come from a static module and never reorder at runtime, so nothing here
 * *would* misbehave today. The reason to do it properly anyway is that the failure
 * mode only appears once someone edits an article, and by then the cause is three
 * files away from the symptom.
 *
 * ## Why the index is still there, as a suffix
 *
 * Because two blocks genuinely can be identical — two consecutive paragraphs with
 * the same text is unusual but a repeated `code` block with the same body is not
 * impossible — and React needs *distinct* keys among siblings. Content-derived, then
 * position, gives a key that is stable under edits elsewhere and unique always.
 */
function blockKey(block: Block): string {
  const base = (() => {
    switch (block.kind) {
      case 'p':
      case 'h2':
      case 'h3':
      case 'quote':
        return slugify(block.text).slice(0, 40);
      case 'ul':
      case 'ol':
        return slugify(block.items[0] ?? block.kind).slice(0, 40);
      case 'callout':
        return slugify(block.title).slice(0, 40);
      case 'code':
        return `${block.lang}:${slugify(block.caption ?? block.code).slice(0, 30)}`;
      case 'table':
        return `table:${slugify(block.head.join(' ')).slice(0, 30)}`;
      case 'stepper':
        return `stepper:${block.algoId}`;
    }
  })();
  return `${block.kind}:${base}`;
}

function BlockRenderer({ block, onNavigate }: { block: Block; onNavigate: (to: string) => void }) {
  switch (block.kind) {
    case 'p':
      return (
        <p className="measure text-[14.5px] leading-[1.75] text-text-muted">
          <Em text={block.text} onNavigate={onNavigate} />
        </p>
      );

    case 'h2':
      return (
        <h2
          id={slugify(block.text)}
          className="scroll-mt-20 pt-4 text-[19px] font-bold tracking-tight text-text-strong"
        >
          {block.text}
        </h2>
      );

    case 'h3':
      return (
        <h3
          id={slugify(block.text)}
          className="scroll-mt-20 pt-2 text-[15.5px] font-bold tracking-tight text-text-strong"
        >
          {block.text}
        </h3>
      );

    case 'ul':
      return (
        <ul className="measure space-y-1.5">
          {block.items.map((item) => (
            <li
              key={slugify(item).slice(0, 48) || 'item'}
              className="flex gap-2.5 text-[14px] leading-[1.7] text-text-muted"
            >
              <span
                aria-hidden="true"
                className="mt-[9px] size-1.5 shrink-0 rounded-full bg-accent/70"
              />
              <span>
                <Em text={item} onNavigate={onNavigate} />
              </span>
            </li>
          ))}
        </ul>
      );

    case 'ol':
      return (
        <ol className="measure space-y-2">
          {block.items.map((item, i) => (
            <li
              key={slugify(item).slice(0, 48) || 'item'}
              className="flex gap-3 text-[14px] leading-[1.7] text-text-muted"
            >
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-surface-inset font-mono text-[10.5px] font-bold text-text-subtle">
                {i + 1}
              </span>
              <span>
                <Em text={item} onNavigate={onNavigate} />
              </span>
            </li>
          ))}
        </ol>
      );

    case 'quote':
      return (
        <blockquote className="measure border-l-2 border-accent/60 py-1 pl-4 text-[14.5px] leading-[1.7] text-text-muted italic">
          <Em text={block.text} onNavigate={onNavigate} />
        </blockquote>
      );

    case 'callout': {
      const tone = CALLOUT_TONE[block.tone];
      const Icon = tone.icon;
      return (
        <aside
          className={cn('measure rounded-xl border px-4 py-3', tone.ring, tone.bg)}
          aria-label={block.title}
        >
          <div className="flex items-center gap-2">
            <Icon className={cn('size-4 shrink-0', tone.text)} />
            <span className={cn('text-[11px] font-bold tracking-wide uppercase', tone.text)}>
              {block.title}
            </span>
          </div>
          <p className="mt-1.5 text-[13.5px] leading-[1.7] text-text-muted">
            <Em text={block.text} onNavigate={onNavigate} />
          </p>
        </aside>
      );
    }

    case 'code':
      return (
        <figure className="overflow-hidden rounded-xl border border-border-strong bg-surface-inset/50">
          <figcaption className="flex items-center gap-2 border-b border-border/70 px-3 py-1.5">
            <span className="rounded bg-surface-overlay px-1.5 py-0.5 font-mono text-[9.5px] font-semibold tracking-wide text-text-muted uppercase">
              {block.lang}
            </span>
            {block.caption ? (
              <span className="min-w-0 flex-1 truncate text-[11px] text-text-subtle">
                {block.caption}
              </span>
            ) : null}
          </figcaption>
          {/*
            `pre` rather than Shiki.

            An article has four or five code blocks and they are explanatory, not
            the product. Highlighting them would mean five more dynamic imports of
            the grammar — which is most of a second on a cold load, on the page a
            reader is most likely to arrive at from a search result. Plain monospace
            in a box is legible and free, and the *listing* that the app exists to
            highlight is one click away in the visualiser.
          */}
          <pre className="overflow-x-auto px-3.5 py-3">
            <code className="font-mono text-[12.5px] leading-[1.65] text-text-muted">
              {block.code}
            </code>
          </pre>
        </figure>
      );

    case 'table':
      return (
        <div className="measure overflow-x-auto rounded-xl border border-border-strong">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-surface-inset/60">
                {block.head.map((h) => (
                  <th
                    key={slugify(h).slice(0, 32) || 'col'}
                    scope="col"
                    className="px-3 py-2 text-[11px] font-bold tracking-wide text-text-muted uppercase"
                  >
                    <Em text={h} onNavigate={onNavigate} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr
                  key={`row-${slugify(row[0] ?? String(ri)).slice(0, 40)}`}
                  className="border-t border-border/70 transition-colors hover:bg-surface-inset/30"
                >
                  {row.map((cell, ci) => (
                    <td
                      // Keyed on the *column* rather than the position, which is
                      // both meaningful and what keeps `noArrayIndexKey` quiet: an
                      // index here would be re-used whenever a column were inserted,
                      // and the `left` alignment is positional anyway.
                      key={`${slugify(block.head[ci] ?? 'col')}-${slugify(cell).slice(0, 24)}`}
                      className={cn(
                        'px-3 py-2 text-[12.5px] leading-relaxed text-text-muted',
                        // First column is the subject of the row, so it gets the
                        // weight; the rest are data and stay monospaced where they
                        // contain complexity notation, which is most of them.
                        ci === 0 ? 'font-semibold text-text-strong' : 'font-mono text-[11.5px]',
                      )}
                    >
                      <Em text={cell} onNavigate={onNavigate} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'stepper':
      return (
        <EmbeddedStepper
          algoId={block.algoId}
          preset={block.preset}
          frame={block.frame}
          caption={block.caption}
        />
      );
  }
}

/**
 * Heading id.
 *
 * Exported so the article page's table of contents produces the same ids the
 * headings do. Two implementations of "make an anchor out of a heading" that
 * differ by a space-to-dash would produce a table of contents that silently
 * scrolls nowhere, and nothing in the type system would catch it.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
