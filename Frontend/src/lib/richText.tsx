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

type TokenKind = 'text' | 'strong' | 'code';

interface Token {
  kind: TokenKind;
  text: string;
}

/** Either marker, at its own length. Order matters only for readability. */
const MARKER = /\*\*|`/g;

/** Non-overlapping occurrences, which is how `split` would count them too. */
function countOf(text: string, marker: string): number {
  return text.split(marker).length - 1;
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
  const kindNow = (): TokenKind => (code ? 'code' : strong ? 'strong' : 'text');

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
    buf += text.slice(cursor, m.index);
    flush();
    if (m[0] === '**') strong = !strong;
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

export function Em({ text }: { text: string }): ReactNode {
  // Cheap bail-out: the overwhelming majority of strings have no marker at all, and
  // this is called once per rendered note, on every step of playback. Checking two
  // substrings is cheaper than the tokenizer and keeps that path allocation-free.
  if (!text.includes('**') && !text.includes('`')) return text;

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
        const key = `${token.kind}:${n}·${token.text}`;
        switch (token.kind) {
          case 'strong':
            return (
              <strong key={key} className="font-semibold text-text-strong">
                {token.text}
              </strong>
            );
          case 'code':
            return (
              <code key={key} className={CODE_CLASS}>
                {token.text}
              </code>
            );
          default:
            return <Fragment key={key}>{token.text}</Fragment>;
        }
      })}
    </>
  );
}
