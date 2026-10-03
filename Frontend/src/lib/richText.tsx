import { Fragment, type ReactNode } from 'react';

/**
 * Minimal inline markup for the prose the authors write.
 *
 * The narration, the per-anchor notes, the "when to use it" blurbs and the guide
 * articles are plain English by design — no HTML, nothing to sanitise. But they
 * reached for inline markup, and a plain-text renderer shows the marker to the
 * reader: *"the auxiliary stack records \*\*2 again\*\* rather than 8"* and *"`n-1`
 * comparisons"*. That reads as a broken build rather than as emphasis, and the
 * backtick version shipped across all seven articles before anyone looked at a
 * rendered one.
 *
 * So this renders two constructs:
 *
 *  - `**strong**`
 *  - `` `code` ``
 *
 * Deliberately not a Markdown library:
 *
 *  - The need is two constructs. A parser would be a dependency and a surface.
 *  - There is no HTML pass, so there is nothing to sanitise and no
 *    `dangerouslySetInnerHTML`: React escapes every text node it is handed, and the
 *    only markup this produces is a `<strong>` and a `<code>` it creates itself.
 *  - Anything unrecognised is left exactly as written, so the worst case is that a
 *    stray marker stays visible — the same as before, not worse.
 *
 * ## Links, added once there was something to link between
 *
 * A third construct exists:
 *
 *  - `[label](/learn/some-article)`
 *
 * With seven articles there was almost nothing to link *between*, and the one
 * cross-reference that did exist — `[sorting landscape](/learn/sorting-landscape)`
 * in `core/learn/articles/sorting.ts` — rendered as literal Markdown, brackets and
 * all. `learn.test.ts` could not catch it, because a literal string is a perfectly
 * valid string. At eighteen articles, "see also" is how the section becomes
 * readable at all, so a link is now markup rather than something the author has to
 * write around.
 *
 * A URL is the one piece of prose that is not inert, so links get two narrow rules:
 *
 *  - **A link is markup only if it is well formed.** `[text](/learn/typo` has no
 *    closing paren, so it is not a link; it is text, and it stays visible as the typo
 *    it is. Guessing at the intent instead would produce a broken link that looks
 *    deliberate.
 *  - **The href must be a path on this site** — `startsWith('/')` and not
 *    `startsWith('//')`. Anything else is emitted verbatim instead of becoming an
 *    anchor. There is nothing to sanitise *today*, because every string is authored
 *    in-repo, and this line is what keeps that true the day one is not.
 *
 * What this deliberately does not touch: `a[mid]` is not a link, and `[low, high)`
 * is not a link. Recognition needs the complete `](…)` triple, so the bracket-heavy
 * prose every article about arrays is full of renders exactly as it did before. A
 * rule that treated every `[` as markup would have broken the binary search guide in
 * order to add links to the sorting one.
 *
 * And inside a code span `](` is literal, as it is in every Markdown dialect, so a
 * link is only recognised while no code run is open.
 *
 * ## The rule that keeps it small
 *
 * **A marker with no pair is left alone.** An odd number of `**` means the author
 * left one unpaired, and splitting anyway would be actively wrong rather than
 * merely incomplete: `'a ** dangling'` would bold the tail and *delete* the marker,
 * so a typo would read as confident emphasis — the opposite of what the author
 * meant and the opposite of what a reader needs. Leaving the string untouched keeps
 * the mistake visible to the person who can fix it.
 *
 * So the whole string is re-emitted verbatim if either marker is unpaired, and
 * *neither* construct is applied. That is a deliberate all-or-nothing choice: a
 * half-rendered sentence with one bolded run and one literal marker pair looks like
 * a rendering bug in a way that "this string has a typo in it" does not.
 */

/**
 * A run of text.
 *
 * A union rather than an optional `href` so that the `switch` in the renderer
 * narrows: `{ kind: 'link' }` is the only case that can reach `token.href`, and a
 * non-null assertion is not needed anywhere to prove it.
 */
type Token =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; href: string };

/**
 * A marker, or a complete link.
 *
 * The link alternative comes first and is the only one that can match a `[`, so
 * `a[mid]` and `[low, high)` fall straight through to "text" — which is the
 * behaviour that keeps the bracket-heavy guides rendering.
 *
 * The label cannot contain `]`, the href cannot contain whitespace or `)`, and
 * neither can span a line. Those restrictions are what make "well formed" mean
 * something: there is no nesting to get wrong, and an unclosed `[` cannot be
 * mistaken for a link that lost its other half somewhere.
 */
const MARKER = /\[([^\][\n]+)\]\(([^)\s]+)\)|\*\*|`/g;

/** Non-overlapping occurrences, which is how `split` would count them too. */
function countOf(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

/**
 * Whether an href is one this renderer will turn into an anchor.
 *
 * Two checks, both about the scheme rather than about content: a same-site path
 * starts with a single `/`, and a protocol-relative URL starts with `//` — which is
 * why the second check is not redundant. Anything else is left as text.
 */
function isSafeHref(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//');
}

/**
 * Split a string into runs.
 *
 * `null` means the input is malformed — an unpaired marker somewhere — and the
 * caller must render the original string untouched rather than guess.
 *
 * The walk is a single left-to-right pass because a marker is a marker: `**` toggles
 * emphasis, a backtick toggles code, and the run being accumulated belongs to
 * whatever was active *before* the marker that just closed it. Nesting falls out
 * without a special case (`` `a **b** c` `` yields a code run containing a strong
 * run), which is the right amount of support for prose — nothing here writes
 * `` `a *b* c` `` expecting a third interpretation.
 */
function tokenize(text: string): Token[] | null {
  // Validated before anything is split, so a malformed string never gets
  // half-rendered on the way to discovering it was malformed.
  if (countOf(text, '**') % 2 !== 0) return null;
  if (countOf(text, '`') % 2 !== 0) return null;

  const tokens: Token[] = [];
  let strong = false;
  let code = false;
  /*
   * Which kind the run being accumulated belongs to.
   *
   * `code` wins over `strong`, so `` `a **b** c` `` renders the inner emphasis as
   * strong inside a code run rather than as code — which is what a reader expects,
   * because the backticks are the outer wrapper. The reverse nesting cannot arise
   * from prose.
   */
  const kindNow = (): 'text' | 'strong' | 'code' => (code ? 'code' : strong ? 'strong' : 'text');

  let cursor = 0;
  let buf = '';

  const flush = () => {
    if (buf === '') return;
    tokens.push({ kind: kindNow(), text: buf });
    buf = '';
  };

  MARKER.lastIndex = 0;
  let m = MARKER.exec(text);
  while (m !== null) {
    /*
     * A link that will not be a link is *text*, and text is appended without flushing
     * first — so the run it belongs to stays one run.
     *
     * That detail is not cosmetic. Inside a code span, `` `values[i](x)` `` matches
     * the link pattern at `[i](x)`. Flushing before the decision would push `values`
     * and `[i](x)` as two adjacent code runs, which renders as two boxes with a gap
     * between them — a visible artefact produced by a string with nothing wrong with
     * it. Appending instead leaves one `values[i](x)`, as it should be.
     */
    const label = m[1];
    const href = m[2];
    // Both capture groups are present exactly when the link alternative matched, and
    // `noUncheckedIndexedAccess` makes the point for us: an index into a match array
    // is optional until proven otherwise.
    const isLink = label !== undefined && href !== undefined;
    if (isLink && (code || !isSafeHref(href))) {
      buf += text.slice(cursor, m.index + m[0].length);
      cursor = m.index + m[0].length;
      m = MARKER.exec(text);
      continue;
    }

    buf += text.slice(cursor, m.index);
    flush();

    if (label !== undefined && href !== undefined) {
      /*
       * Note that the emphasis state is *not* reset by a link: `**[a](/x) b**` bolds
       * the text after the link, because that is what the `**` pairs said. A link
       * nested inside emphasis does not inherit the emphasis, which is a fair reading
       * — links read as their own thing, and no article nests one.
       */
      tokens.push({ kind: 'link', text: label, href });
    } else if (m[0] === '**') strong = !strong;
    else code = !code;

    cursor = m.index + m[0].length;
    m = MARKER.exec(text);
  }
  buf += text.slice(cursor);
  flush();

  return tokens;
}

const CODE_CLASS =
  'rounded-[3px] bg-surface-inset/70 px-1 py-px font-mono text-[0.92em] text-accent-hover';

/*
 * Underline rather than colour alone, because these links appear inside body prose
 * where a bare colour change reads as emphasis and not as something clickable.
 */
const LINK_CLASS =
  'font-medium text-accent underline decoration-accent/40 underline-offset-2 transition-colors hover:text-accent-strong hover:decoration-accent-strong';

export function Em({
  text,
  onNavigate,
}: {
  text: string;
  /**
   * Client-side navigation for internal links.
   *
   * Optional because `Em` is also the renderer for an algorithm's per-step
   * narration, which has no links and must not grow a prop it never uses. When it
   * *is* supplied the anchor still carries a real `href` — it stays shareable,
   * middle-clickable and openable in a new tab — and the click is intercepted only
   * to keep the router's history intact.
   */
  onNavigate?: (href: string) => void;
}): ReactNode {
  // Cheap bail-out: the overwhelming majority of strings have no marker at all, and
  // this is called once per rendered note, on every step of playback. Checking three
  // substrings is cheaper than the tokenizer and keeps that path allocation-free.
  if (!text.includes('**') && !text.includes('`') && !text.includes('[')) return text;

  const tokens = tokenize(text);
  // Malformed input, or a string whose markers cancel out and left nothing.
  if (!tokens) return text;
  if (tokens.length === 0) return text;

  /**
   * Keys are the segment's *content* rather than its position, because
   * `a **a** a` produces two identical plain runs and a bare content key would
   * collide — React drops one of the duplicates and the sentence loses a word.
   *
   * The counter disambiguates those repeats. It is created per call, so the same
   * text always produces the same keys: a module-level counter would keep
   * incrementing across renders and remount every `<strong>` on every step, which
   * is the kind of invisible waste that makes a list feel sluggish.
   */
  const occurrences = new Map<string, number>();

  return (
    <>
      {tokens.map((token) => {
        const n = occurrences.get(token.text) ?? 0;
        occurrences.set(token.text, n + 1);
        switch (token.kind) {
          case 'strong':
            return (
              <strong key={`strong:${n}·${token.text}`} className="font-semibold text-text-strong">
                {token.text}
              </strong>
            );
          case 'code':
            return (
              <code key={`code:${n}·${token.text}`} className={CODE_CLASS}>
                {token.text}
              </code>
            );
          case 'link':
            return (
              <a
                // The href is part of the identity: two links with the same label
                // pointing at different articles are different links, and keying on
                // the label alone would let React drop one of them.
                key={`link:${n}·${token.href}`}
                href={token.href}
                onClick={
                  onNavigate
                    ? (e) => {
                        e.preventDefault();
                        onNavigate(token.href);
                      }
                    : undefined
                }
                className={LINK_CLASS}
              >
                {/* The label is tokenized again, so `[**bold** link](/x)` works. */}
                <Em text={token.text} />
              </a>
            );
          default:
            return <Fragment key={`text:${n}·${token.text}`}>{token.text}</Fragment>;
        }
      })}
    </>
  );
}
