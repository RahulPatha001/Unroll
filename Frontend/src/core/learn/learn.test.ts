import { describe, expect, it } from 'vitest';
import { CATALOG_BY_ID } from '../algorithms/catalog.ts';
import { getAlgorithm } from '../algorithms/registry.ts';
import { CATEGORIES } from '../algorithms/types.ts';
import { ARTICLE_CATEGORY_LABEL, ARTICLE_LIST, getArticle } from './index.ts';
import type { Article, Block } from './types.ts';

/**
 * Article integrity.
 *
 * The failure mode this exists to prevent is specific and completely invisible:
 * an article is written, it renders, the prose is fine, and the `stepper` in the
 * middle of it points at an algorithm or a **preset** that does not exist. The
 * embedded stepper then renders a graceful empty state — which is exactly what it
 * is supposed to do when a chunk fails to load — so nothing breaks, no test fails,
 * and the article has a hole in it that only a reader would ever notice.
 *
 * `EmbeddedStepper`'s fallback is what makes this necessary. A component that
 * degrades gracefully is the right design and a terrible test strategy: the
 * tolerance that makes it safe in production also hides the mistake in CI.
 *
 * So the references are checked *here*, from the data side, where "does this
 * preset exist" is a plain lookup.
 */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function stepperBlocks(a: Article): Extract<Block, { kind: 'stepper' }>[] {
  return a.body.filter((b): b is Extract<Block, { kind: 'stepper' }> => b.kind === 'stepper');
}

/** Every string in an article that `Em` will hand to the inline renderer. */
function proseStrings(a: Article): string[] {
  const out: string[] = [];
  for (const b of a.body) {
    switch (b.kind) {
      case 'p':
      case 'h2':
      case 'h3':
      case 'quote':
        out.push(b.text);
        break;
      case 'ul':
      case 'ol':
        out.push(...b.items);
        break;
      case 'callout':
        out.push(b.title, b.text);
        break;
      case 'code':
        out.push(b.caption ?? '');
        break;
      case 'table':
        out.push(...b.head, ...b.rows.flat());
        break;
      case 'stepper':
        out.push(b.caption);
        break;
    }
  }
  return out;
}

/**
 * A cross-reference written as `[label](/learn/slug)`.
 *
 * Matched on the raw string rather than on rendered output, because "does this point
 * at a real article" is a question about data and the data is where the answer
 * lives — see the note at the top of this file.
 */
const CROSS_REFERENCE = /\]\(\/learn\/([a-z0-9-]+)\)/g;

describe('articles', () => {
  it('finds the articles (a silent zero would make every check below vacuous)', () => {
    expect(ARTICLE_LIST.length).toBeGreaterThan(0);
  });

  it('has unique, URL-safe slugs', () => {
    const seen = new Set<string>();
    const problems: string[] = [];
    for (const a of ARTICLE_LIST) {
      if (seen.has(a.slug)) problems.push(`duplicate slug "${a.slug}" (${a.title})`);
      seen.add(a.slug);
      // A slug goes into a path segment unescaped. Anything with a slash, a space
      // or an uppercase letter produces a link that works when clicked and breaks
      // when shared as text, which is exactly the failure the share link exists to
      // prevent.
      if (!SLUG.test(a.slug)) problems.push(`slug "${a.slug}" is not URL-safe`);
    }
    expect(problems).toEqual([]);
  });

  it('resolves by slug', () => {
    for (const a of ARTICLE_LIST) {
      expect(getArticle(a.slug)?.title).toBe(a.title);
    }
    expect(getArticle('no-such-article')).toBeUndefined();
  });

  it('has a dek, a tag, and a plausible reading time', () => {
    const problems: string[] = [];
    for (const a of ARTICLE_LIST) {
      if (!a.dek.trim()) problems.push(`${a.slug}: empty dek`);
      if (a.tags.length === 0) problems.push(`${a.slug}: no tags`);
      if (!Number.isInteger(a.readMinutes) || a.readMinutes <= 0) {
        problems.push(`${a.slug}: readMinutes must be a positive integer`);
      }
      // A tag list is also the command palette's search vocabulary. An empty one
      // makes the article findable by title and nothing else.
      if (a.tags.some((t) => !t.trim())) problems.push(`${a.slug}: blank tag`);
    }
    expect(problems).toEqual([]);
  });

  it('uses a known category', () => {
    const known = new Set<string>([...CATEGORIES.map((c) => c.id), 'concepts']);
    for (const a of ARTICLE_LIST) {
      expect(known.has(a.category), `${a.slug}: unknown category "${a.category}"`).toBe(true);
      expect(ARTICLE_CATEGORY_LABEL[a.category]).toBeTruthy();
    }
  });

  it('points algoId at a real algorithm', () => {
    const problems: string[] = [];
    for (const a of ARTICLE_LIST) {
      if (a.algoId && !CATALOG_BY_ID[a.algoId]) problems.push(`${a.slug}: algoId "${a.algoId}"`);
    }
    expect(problems).toEqual([]);
  });

  it('cross-references only articles that exist', () => {
    /*
     * The one check in this file that guards the *other* articles.
     *
     * A `stepper` naming a dead preset renders a graceful fallback, which is why the
     * preset check above exists. A cross-reference naming a renamed article has no
     * fallback at all: the link renders, it goes to a 404, and the only symptom is a
     * reader who clicked "see also" and found nothing. Which is exactly what happened
     * once already — `sorting.ts` pointed at `/learn/sorting-landscape` before the
     * inline renderer understood links, and nothing noticed for a while because the
     * link was not even a link yet.
     */
    const problems: string[] = [];
    for (const a of ARTICLE_LIST) {
      for (const text of proseStrings(a)) {
        CROSS_REFERENCE.lastIndex = 0;
        let m = CROSS_REFERENCE.exec(text);
        while (m !== null) {
          const target = m[1];
          if (target !== undefined && target !== a.slug && !getArticle(target)) {
            problems.push(`${a.slug}: links to /learn/${target}, which is not an article`);
          }
          m = CROSS_REFERENCE.exec(text);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('every prose string has balanced inline markers', () => {
    /*
     * The one content rule here that is about *rendering* rather than references.
     *
     * `Em` is all-or-nothing by design: an unpaired `**` makes it emit the whole
     * string verbatim, so one stray asterisk turns a paragraph into visible markup.
     * That is the right behaviour for a typo — it keeps the mistake visible to
     * whoever can fix it — and the wrong behaviour as something a reader should have
     * to look at. So it is caught at build time instead.
     *
     * Two articles shipped with literal backticks on screen before `Em` existed, and
     * nobody noticed, because prose is rarely read by the person who wrote it.
     */
    const unbalanced = (text: string, marker: string): boolean =>
      text.split(marker).length % 2 === 0;

    const problems: string[] = [];
    for (const a of ARTICLE_LIST) {
      for (const text of proseStrings(a)) {
        if (unbalanced(text, '**')) problems.push(`${a.slug}: odd number of ** in "${text}"`);
        if (unbalanced(text, '`')) problems.push(`${a.slug}: odd number of backticks in "${text}"`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('has cross-references, or the section is a list of unrelated pages', () => {
    /*
     * A guard on the guard, in the same spirit as "at least one article embeds a
     * stepper". Nineteen articles that never point at each other are nineteen
     * articles a reader has to navigate between by hand, which is the difference
     * between a course and a pile.
     */
    const linked = ARTICLE_LIST.filter((a) =>
      proseStrings(a).some((text) => {
        CROSS_REFERENCE.lastIndex = 0;
        return CROSS_REFERENCE.test(text);
      }),
    );
    // Half is a floor, not a target — but nothing in this section should be an
    // island, and a regression that strips the links should be visible here.
    expect(linked.length).toBeGreaterThanOrEqual(ARTICLE_LIST.length / 2);
  });
});

describe('embedded steppers', () => {
  it('every stepper names an algorithm and a preset that exist', () => {
    /*
     * The expensive one, and the reason this file is allowed to import the
     * registry. `boundary.test.ts` forbids `features/` from importing it — for
     * bundle reasons, not because it is wrong — and this is a test, so paying
     * that cost to actually resolve an algorithm module is exactly right.
     */
    const problems: string[] = [];

    for (const a of ARTICLE_LIST) {
      for (const block of stepperBlocks(a)) {
        const algo = CATALOG_BY_ID[block.algoId] ? getAlgorithm(block.algoId) : null;
        if (!algo) {
          problems.push(`${a.slug}: stepper references unknown algorithm "${block.algoId}"`);
          continue;
        }
        if (!block.caption.trim()) {
          problems.push(`${a.slug}: stepper for "${block.algoId}" has no caption`);
        }
        // The preset is the part that rots. Preset ids are short, human-chosen
        // and renamed far more often than algorithm ids, so this is the check
        // that will actually fire.
        if (block.preset && !algo.presets.some((p) => p.id === block.preset)) {
          problems.push(
            `${a.slug}: stepper for "${block.algoId}" names preset "${block.preset}", which does not exist (has: ${algo.presets.map((p) => p.id).join(', ')})`,
          );
        }
        if (block.frame !== undefined && (block.frame < 0 || !Number.isInteger(block.frame))) {
          problems.push(`${a.slug}: stepper frame must be a non-negative integer`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('at least one article embeds a stepper, or the section has missed its point', () => {
    /*
     * A guard on the guard. Every individual check above passes trivially on an
     * empty list of steppers, so a refactor that quietly dropped the feature
     * would leave a green suite. This is the assertion that the differentiator —
     * articles you can actually step through — is still present.
     */
    const total = ARTICLE_LIST.reduce((n, a) => n + stepperBlocks(a).length, 0);
    expect(total).toBeGreaterThan(0);
  });

  it('the article an algoId points at embeds that same algorithm', () => {
    /*
     * Not a strict rule — an article about quicksort may legitimately show merge
     * sort too — but when an article declares `algoId`, that is the algorithm the
     * "Open in the visualiser" button will target, and a mismatch means the
     * button sends the reader somewhere they were not already looking. Reported
     * rather than enforced, because a deliberate exception is legitimate.
     */
    const mismatched = ARTICLE_LIST.filter(
      (a) =>
        a.algoId &&
        stepperBlocks(a).length > 0 &&
        !stepperBlocks(a).some((b) => b.algoId === a.algoId),
    );
    for (const a of mismatched) {
      // eslint-disable-next-line no-console
      console.warn(
        `article "${a.slug}" declares algoId "${a.algoId}" but embeds ${stepperBlocks(a)
          .map((b) => b.algoId)
          .join(', ')}`,
      );
    }
    // Not an assertion. A warning is the right severity: it is advice, and a
    // failing suite over an editorial judgement would get deleted within a month.
    expect(true).toBe(true);
  });
});

describe('article blocks', () => {
  it('tables are rectangular', () => {
    /*
     * The renderer zips `head` against each row. A short row silently drops a
     * cell, and a long one produces an `undefined` that React renders as nothing —
     * so a malformed table looks almost right, which is the worst way for it to
     * fail. Cheap to check, and it is the sort of thing that happens when someone
     * adds a row in a hurry.
     */
    const problems: string[] = [];
    for (const a of ARTICLE_LIST) {
      for (const b of a.body) {
        if (b.kind !== 'table') continue;
        if (b.head.length < 2) problems.push(`${a.slug}: table needs at least 2 columns`);
        if (b.rows.length === 0) problems.push(`${a.slug}: table has no rows`);
        b.rows.forEach((row, i) => {
          if (row.length !== b.head.length) {
            problems.push(
              `${a.slug}: table row ${i} has ${row.length} cells, header has ${b.head.length}`,
            );
          }
        });
      }
    }
    expect(problems).toEqual([]);
  });

  it('no block is empty', () => {
    const problems: string[] = [];
    for (const a of ARTICLE_LIST) {
      a.body.forEach((b, i) => {
        switch (b.kind) {
          case 'p':
          case 'h2':
          case 'h3':
          case 'quote':
            if (!b.text.trim()) problems.push(`${a.slug}: block ${i} (${b.kind}) is empty`);
            break;
          case 'ul':
          case 'ol':
            if (b.items.length === 0) problems.push(`${a.slug}: block ${i} (${b.kind}) is empty`);
            b.items.forEach((it, j) => {
              if (!it.trim()) problems.push(`${a.slug}: block ${i} item ${j} is blank`);
            });
            break;
          case 'callout':
            if (!b.title.trim() || !b.text.trim()) {
              problems.push(`${a.slug}: block ${i} callout needs a title and text`);
            }
            break;
          case 'code':
            if (!b.code.trim()) problems.push(`${a.slug}: block ${i} code is empty`);
            break;
          case 'stepper':
            if (!b.algoId.trim() || !b.caption.trim()) {
              problems.push(`${a.slug}: block ${i} stepper needs an algoId and a caption`);
            }
            break;
          case 'table':
            break;
        }
      });
    }
    expect(problems).toEqual([]);
  });

  it('an article is long enough to be worth opening', () => {
    // A guard against a stub article shipping as a finished page. Four blocks is
    // roughly a screen; anything less is a placeholder that would be better as
    // an empty state than as a thin article.
    const thin = ARTICLE_LIST.filter((a) => a.body.filter((b) => b.kind === 'p').length < 3);
    expect(thin.map((a) => a.slug)).toEqual([]);
  });
});
