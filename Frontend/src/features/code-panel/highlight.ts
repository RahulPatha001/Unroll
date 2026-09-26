import { createElement, memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Lang } from '../../core/code/anchors.ts';
import { LANG_META } from '../../core/code/anchors.ts';

/**
 * Syntax highlighting, lazily and *minimally*.
 *
 * Two decisions here, both about not shipping things students never asked for:
 *
 *  1. **Nothing from Shiki is in the initial bundle.** Every import is dynamic
 *     and happens inside `getHighlighter`, called on first render of the code
 *     panel. Until it resolves the listing is plain monospace text, which is
 *     perfectly readable — nobody perceives the difference as a loading state,
 *     they just never see colours.
 *
 *  2. **Only the four grammars we actually show.** Importing the `shiki` barrel
 *     pulls in the full grammar set (a Fortran bundle here, 90kB; a Wolfram
 *     Language one, 260kB) and the Oniguruma WASM engine. Importing
 *     `shiki/core` plus four language modules and the JavaScript regex engine
 *     costs a fraction of that and needs no WASM at all.
 */
/**
 * Grammar loaders, per language, on demand.
 *
 * The C++ TextMate grammar alone is ~70kB gzipped — more than the entire rest of
 * the app. Loading all four the moment the code panel opens would tax every
 * visitor to pay for three languages they may never look at, so each grammar is
 * fetched the first time its tab is actually selected. The core engine, the
 * theme and the JS regex engine are shared and loaded once.
 */
const GRAMMAR_LOADERS: Record<Lang, () => Promise<{ default: unknown }>> = {
  javascript: () => import('shiki/langs/javascript.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
};

type ShikiCore = {
  createHighlighterCore(options: unknown): Promise<{
    codeToHtml(code: string, options: { lang: string; theme: string }): string;
    loadLanguage(lang: unknown): Promise<void>;
  }>;
};

let corePromise: Promise<Awaited<ReturnType<ShikiCore['createHighlighterCore']>>> | null = null;
const loadedLangs = new Map<Lang, Promise<void>>();

async function getCore(): Promise<Awaited<ReturnType<ShikiCore['createHighlighterCore']>>> {
  corePromise ??= (async () => {
    const [core, theme, engine] = await Promise.all([
      import('shiki/core') as Promise<ShikiCore>,
      import('shiki/themes/github-dark-default.mjs'),
      import('shiki/engine/javascript'),
    ]);
    return core.createHighlighterCore({
      themes: [theme.default],
      langs: [],
      engine: engine.createJavaScriptRegexEngine(),
    });
  })();
  return corePromise;
}

/** Resolves once `lang` can be highlighted. Safe to call repeatedly. */
async function ensureLang(lang: Lang): Promise<void> {
  const hit = loadedLangs.get(lang);
  if (hit) return hit;
  const p = (async () => {
    const hl = await getCore();
    const grammar = await GRAMMAR_LOADERS[lang]();
    await hl.loadLanguage(grammar.default);
  })();
  loadedLangs.set(lang, p);
  return p;
}

const cache = new Map<string, string>();

/** Tokenise `source` for `lang`, memoised by (lang, source). */
export function useHighlighted(lang: Lang, source: string): string | null {
  const [html, setHtml] = useState<string | null>(() => cache.get(`${lang}:${source}`) ?? null);

  useEffect(() => {
    const key = `${lang}:${source}`;
    const hit = cache.get(key);
    if (hit !== undefined) {
      setHtml(hit);
      return;
    }
    let cancelled = false;
    void ensureLang(lang)
      .then(() => getCore())
      .then((hl) => hl.codeToHtml(source, { lang, theme: 'github-dark-default' }))
      .then((out) => {
        if (cancelled) return;
        cache.set(key, out);
        setHtml(out);
      })
      .catch(() => {
        // Highlighting is decoration. If it fails, plain text is a fine outcome.
        if (!cancelled) setHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [lang, source]);

  return html;
}

/** Discard cached HTML. Only needed if a theme is added at runtime. */
export function clearHighlightCache(): void {
  cache.clear();
}

/**
 * Split shiki's HTML into per-line HTML strings.
 *
 * Shiki emits one `<pre>` containing `<code>` with a `<span class="line">` per
 * line. To highlight *one line* we need the lines separately, so we split on
 * those wrappers. Doing it through the DOM rather than a regex means it stays
 * correct if the token markup changes.
 *
 * Rendered with `dangerouslySetInnerHTML` because the content is Shiki's own
 * escaped token spans — it comes from our bundled grammars applied to our own
 * source strings, never from user input. Worth stating explicitly, because
 * "innerHTML in the app" is exactly the kind of thing that should be justified
 * rather than waved through.
 */
function splitLines(html: string): string[] {
  if (typeof document === 'undefined') return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const code = doc.querySelector('pre code');
  if (!code) return [];
  return Array.from(code.children).map((el) => el.innerHTML);
}

export const HighlightedLines = memo(function HighlightedLines({
  lang,
  source,
  startLine,
  endLine,
  onLineClick,
  className,
}: {
  lang: Lang;
  source: string;
  startLine: number | null;
  endLine: number;
  /**
   * Called with a 1-based line number when a row is clicked.
   *
   * This is a mouse *convenience*, not the primary way to move around: the rows
   * are deliberately left out of the tab order, because a 90-line listing turned
   * into 90 tab stops would make the keyboard — which is how a student actually
   * steps through an algorithm — strictly worse. Stepping stays keyboard-first;
   * clicking a line is the shortcut for "show me that step" without scrubbing.
   */
  onLineClick?: (line: number) => void;
  className?: string;
}) {
  const html = useHighlighted(lang, source);
  const lines = useMemo(() => (html ? splitLines(html) : null), [html]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the active line in view when stepping. `nearest` rather than `center`,
  // so a student reading the code above does not have it yanked away on every
  // single step.
  useEffect(() => {
    if (startLine === null) return;
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-line="${startLine}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [startLine]);

  const plain = useMemo(() => source.replace(/\r\n/g, '\n').split('\n'), [source]);
  const rows = lines ?? plain;

  return createElement(
    'div',
    {
      ref: containerRef,
      // `h-full` is load-bearing, not decoration.
      //
      // This is the scroll container, and a block-level scroll container only
      // scrolls on an axis where it is *smaller* than its content. Given no
      // height of its own it simply grows to fit the `<pre>`, so `overflow-auto`
      // never engaged vertically: horizontal scrolling worked (the `pre` is
      // `min-w-max`, and width is constrained by the parent), and vertical
      // scrolling did not. A long listing therefore overflowed its wrapper —
      // which is `overflow: visible` — and painted straight over the explanation
      // panel pinned below it, taking the bottom of the listing off screen.
      //
      // `h-full` resolves against the parent, which is a `min-h-0 flex-1` box and
      // so has a definite height from the flex layout. Fixed.
      className: ['h-full overflow-auto', className].filter(Boolean).join(' '),
    },
    createElement(
      'pre',
      { className: 'min-w-max py-3 font-mono text-[12.5px] leading-[1.65]' },
      createElement(
        'code',
        null,
        rows.map((content, i) => {
          const n = i + 1;
          const active = startLine !== null && n >= startLine && n <= endLine;
          return createElement(
            'div',
            {
              key: n,
              'data-line': n,
              'aria-current': active ? 'true' : undefined,
              onClick: onLineClick ? () => onLineClick(n) : undefined,
              title: onLineClick ? 'Jump to the step that runs this line' : undefined,
              className: [
                'flex gap-3 border-l-2 pr-4 transition-colors duration-150',
                // Pointer feedback only where the click actually does something.
                onLineClick ? 'cursor-pointer' : '',
                active
                  ? // `line-flash` re-runs because the row is keyed by line and
                    // the animation is applied to a wrapper that mounts afresh on
                    // each step. A plain background colour reads as "selected";
                    // a brief flare reads as "this one, just now", which is the
                    // thing the student is actually watching for.
                    'line-flash border-amber-400 bg-amber-400/10'
                  : 'border-transparent hover:bg-white/[0.03]',
              ].join(' '),
            },
            createElement(
              'span',
              {
                className: [
                  'w-9 shrink-0 select-none pr-2 text-right text-[10.5px] tabular-nums',
                  active ? 'text-amber-300' : 'text-slate-600',
                ].join(' '),
              },
              String(n),
            ),
            createElement('span', {
              className: 'min-w-0 flex-1 whitespace-pre',
              // Shiki's own escaped token spans, from our bundled grammars
              // applied to our own source strings. No user input reaches this
              // path, and rendering the tokens as React elements would mean
              // re-implementing TextMate's nesting, which is the entire value
              // Shiki provides here.
              //
              // The suppression has to be one line: Biome matches the *last*
              // comment before the diagnostic, so a multi-line explanation after
              // the keyword silently stops being a suppression.
              // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki token spans from our own grammars
              dangerouslySetInnerHTML: { __html: content },
            }),
          );
        }),
      ),
    ),
  );
});

export { LANG_META };
