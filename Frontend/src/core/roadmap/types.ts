/**
 * The practice-roadmap schema.
 *
 * ## Why this is a fourth data kind, and not another article
 *
 * `core/learn/` already stores prose, and it was tempting to write the roadmap as
 * articles: "Phase 1" as one guide, each topic as a section, the questions as
 * `table` blocks. Three things pushed it out of that shape.
 *
 *  1. **A question is a row, not prose.** A list of 150 problems with a platform
 *     and a difficulty each is tabular data. Rendering it as a Markdown-ish `table`
 *     block means the platform and the difficulty are cells of text, so they cannot
 *     be filtered, counted, sorted, or checked off. The whole value of this page is
 *     the filtering and the progress, and a `table` block has no way to express
 *     either.
 *  2. **A question needs a stable identity that survives a title change.** The
 *     progress store keys solved questions by `id`. An article's identity is its
 *     slug, which is its URL segment — but these questions live on someone else's
 *     site and have no URL in this app at all, so their id is authored here and
 *     asserted unique by `roadmap.test.ts`.
 *  3. **The relationships point *outward* to two other registries.** A topic names
 *     algorithms in `catalog.ts` and guides in `core/learn/`. Neither reference can
 *     be a string in a paragraph, because then the page could not link into the
 *     visualiser and could not be checked for rot.
 *
 * ## No React, no DOM, no router
 *
 * Same rule as everything else under `core/` — see `boundary.test.ts`. That is what
 * lets `roadmap.test.ts` assert every `algoId` resolves against `CATALOG_BY_ID` and
 * every `learnSlug` against `getArticle`, with no renderer in the loop. This is the
 * only check in the app that can catch "this topic tells you to watch an algorithm
 * that no longer exists", and it works because the data never touches React.
 */

/**
 * Where a question lives.
 *
 * Deliberately closed, and deliberately *not* a URL template. An earlier draft
 * derived each link from `platform` + `slug`, which is smaller — but it cannot
 * express the fact that GFG needs a numeric id segment and HackerRank needs
 * `/problem` while InterviewBit needs a trailing slash. Those four different shapes
 * would have become four conditionals in the renderer and one easy place to get it
 * wrong. The link is authored per question and `roadmap.test.ts` checks that its
 * host matches its declared platform, which is the invariant that actually matters:
 * a copy-paste that pasted a HackerRank URL onto a CodeChef row.
 */
export type Platform =
  | 'leetcode'
  | 'interviewbit'
  | 'codechef'
  | 'hackerrank'
  | 'hackerearth'
  | 'gfg';

/** Difficulty, normalised across platforms that do not agree on the words. */
export type Level = 'easy' | 'medium' | 'hard';

/** One problem, on someone else's site. */
export interface Question {
  /**
   * Unique across the whole roadmap, and URL-safe. This is the key the progress
   * store persists, so it must not be reused for a different question.
   */
  id: string;
  /** The problem's name as the platform writes it. */
  title: string;
  platform: Platform;
  level: Level;
  /** Absolute `https` link to the problem statement. Opened in a new tab. */
  url: string;
}

/** A group of questions in the order they should be attempted. */
export interface Topic {
  /** Unique, URL-safe. Becomes the card's anchor id and the filter key. */
  id: string;
  title: string;
  /** Two or three sentences: what this topic is and why it comes when it does. */
  blurb: string;
  phase: PhaseId;
  /**
   * Algorithms in this repo's visualiser that the topic is about, so a learner can
   * watch the idea before trying to implement it. Checked against `CATALOG_BY_ID`.
   */
  algoIds: string[];
  /** Guides in `/learn` that cover the topic. Checked against `getArticle`. */
  learnSlugs: string[];
  /** What to actually be able to do by the end. Short, imperative, 2–5 of them. */
  keyPoints: string[];
  /**
   * The problems. Not sorted here — the order is editorial, easy before hard within
   * a topic, and the renderer groups by level while preserving this order inside
   * each group.
   */
  questions: Question[];
}

/** The four stages of the curriculum. Order is the whole point, so it is an id. */
export type PhaseId = 'foundation' | 'patterns' | 'structures' | 'advanced';

export interface Phase {
  id: PhaseId;
  /** Short title for the timeline node. */
  label: string;
  /** e.g. `Weeks 1–3`. Shown as-is, so it must be honest about being a guide. */
  weeks: string;
  /** One line on what this stage is for. */
  blurb: string;
  /** What a learner can do when the stage is finished. */
  outcome: string;
}
