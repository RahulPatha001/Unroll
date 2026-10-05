import type { Category } from '../algorithms/types.ts';

/**
 * The article format.
 *
 * ## Structured blocks, not Markdown strings
 *
 * The obvious choice was a Markdown string per article and a parser to render it.
 * This is not that, for four reasons that are all about what the articles are
 * *for*:
 *
 *  1. **A `stepper` block.** An article can embed the live, scrubbable
 *     visualisation of the algorithm it is explaining. That is the whole point of
 *     this section — prose about bubble sort competes with every other site, but a
 *     paragraph that says "watch the invariant break" next to a stepper you can
 *     actually drag does not. No Markdown dialect carries that, and every plugin
 *     that tries ends up a `dangerouslySetInnerHTML` island, which is precisely
 *     the thing the rest of this app is careful to avoid.
 *  2. **`core/` must not import React.** `boundary.test.ts` enforces it. Article
 *     *data* is therefore plain data, and the renderer lives in `features/`. A
 *     Markdown string would satisfy that too, so this is not the deciding reason —
 *     but it does mean an article can be unit-tested in plain Node, which is how
 *     the link-integrity test works.
 *  3. **The existing `Em` component already renders `**strong**`** for prose
 *     across 66 algorithms. Reusing it means an article's emphasis and a
 *     narration's emphasis are the same code, rather than two implementations that
 *     disagree about a stray `**`.
 *  4. **A parser is a dependency and a surface.** The need is a dozen block kinds,
 *     not a grammar.
 *
 * `text` fields are plain English with `**strong**` and nothing else. Anything
 * unrecognised is left exactly as written, which is the same "leave it alone
 * otherwise" rule `lib/richText.tsx` documents.
 */

/** The prose blocks. `text` is plain English; see the note above. */
export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; lang: string; code: string; caption?: string }
  | { kind: 'callout'; tone: 'note' | 'warn' | 'good'; title: string; text: string }
  /** A comparison table. `head` and every row must be the same width. */
  | { kind: 'table'; head: string[]; rows: string[][] }
  /**
   * A video worth watching beside the prose.
   *
   * A dedicated block rather than a Markdown link, and the reason is a hard constraint
   * rather than a style preference: `Em` turns `](/…)` into an anchor only when the
   * href is a **path on this site**, by design — `lib/richText.tsx` documents that
   * rule as the thing that keeps the renderer safe. So `[the course](https://youtu.be/…)`
   * renders as literal Markdown, brackets and all, which is the exact failure that file
   * opens with. A block kind is how this repo expresses something the prose renderer
   * cannot: the author supplies a URL, and the renderer owns the anchor — so `target`,
   * `rel` and the `https` check live in one place rather than in every article that
   * wants to cite something.
   */
  | { kind: 'video'; url: string; title: string; source: string; note: string }
  /** The differentiator: the live visualiser, embedded, driven by its own transport. */
  | { kind: 'stepper'; algoId: string; caption: string; preset?: string; frame?: number };

export interface Article {
  /** URL segment. Stable: it is in share links. */
  slug: string;
  title: string;
  /** One line, shown on the index and in the command palette. */
  dek: string;
  /**
   * `concepts` is deliberately not one of the 14 algorithm categories — it is for
   * pieces that cut across them ("recursion is a stack"). Filing those under a
   * category would misfile them, and an index that lies about where something lives
   * is worse than a slightly longer index.
   */
  category: Category | 'concepts';
  tags: string[];
  readMinutes: number;
  /** The visualiser this article is about, if it is about exactly one. */
  algoId?: string;
  body: Block[];
}
