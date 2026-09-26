import { Fragment, type ReactNode } from 'react';

/**
 * Minimal inline emphasis for the prose the algorithm authors write.
 *
 * The narration, the per-anchor notes and the "when to use it" blurbs are plain
 * English by design — no markup, no HTML, nothing to sanitise. But 28 of them
 * across 13 algorithms reached for `**like this**`, and a plain-text renderer
 * shows the asterisks to the student: *"the auxiliary stack records \*\*2
 * again\*\* rather than 8"*. It reads as a broken build rather than as emphasis,
 * and it shipped in thirteen algorithms before anyone noticed, which is a fair
 * measure of how easy it is to miss.
 *
 * So this renders `**strong**` and nothing else. Deliberately not a Markdown
 * library:
 *
 *  - The need is one construct. A parser would be a dependency and a surface.
 *  - There is no HTML pass, so there is nothing to sanitise and no
 *    `dangerouslySetInnerHTML`: React escapes every text node it is handed, and
 *    the only markup this produces is a `<strong>` element it creates itself.
 *  - Anything unrecognised is left exactly as written, so the worst case is that
 *    a stray `**` stays visible — the same as before, not worse.
 *
 * If a second construct ever shows up (inline `code`, say), this is the place to
 * add it, and the "leave it alone otherwise" rule is the reason it stays small.
 */
export function Em({ text }: { text: string }): ReactNode {
  // Cheap bail-out: the overwhelming majority of strings have no marker at all,
  // and this is called once per rendered note, on every step.
  if (!text.includes('**')) return text;

  // An *odd* number of markers means the author left one unpaired. Splitting
  // anyway would be actively wrong rather than merely incomplete:
  // `'a ** dangling'` splits to ['a ', ' dangling'], and the lone odd-index
  // segment would be bolded and the `**` would vanish — so a typo would read as
  // confident emphasis, which is the opposite of what the author meant and the
  // opposite of what a reader needs. Leaving the string untouched keeps the
  // mistake visible to the person who can fix it.
  const markers = text.split('**').length - 1;
  if (markers % 2 !== 0) return text;

  // `a **b** c` splits to ['a ', 'b', ' c'], so odd indices are the emphasised
  // runs. A doubled marker at either end yields empty plain segments, which
  // render as nothing.
  const parts = text.split('**');

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
      {parts.map((part, i) => {
        const n = occurrences.get(part) ?? 0;
        occurrences.set(part, n + 1);
        const key = `${n}·${part}`;
        return i % 2 === 1 ? (
          <strong key={key} className="font-semibold text-slate-50">
            {part}
          </strong>
        ) : (
          <Fragment key={key}>{part}</Fragment>
        );
      })}
    </>
  );
}
