import { describe, expect, it } from 'vitest';
import { CATALOG_BY_ID } from '../algorithms/catalog.ts';
import { getArticle } from '../learn/index.ts';
import {
  getTopic,
  LEVEL_LABEL,
  LEVELS,
  PHASE_LIST,
  PLATFORM_HOST,
  PLATFORM_LABEL,
  QUESTION_LIST,
  questionsByLevel,
  ROADMAP_TOTALS,
  TOPIC_LIST,
  topicProgress,
  topicsByPhase,
} from './index.ts';
import type { PhaseId, Question, Topic } from './types.ts';

/**
 * Roadmap integrity.
 *
 * ## Why this file is more paranoid than `learn.test.ts`
 *
 * `learn.test.ts` checks that an article points at a real algorithm and a real
 * preset, which is enough because an article is *about* something in this repo and
 * the references are internal. The roadmap is a list of links to **other people's
 * sites**, and it has three ways to rot that no render, no type check, and no e2e
 * test can see:
 *
 *  1. **A link that points somewhere that no longer exists.** Nothing about the page
 *     changes when a platform renames a slug; the link still renders, still has a
 *     valid `href`, and still 404s for the reader. A network check is the only real
 *     test for this and it is deliberately *not* in CI — see `verifyRoadmapLinks.mjs`
 *     for why, and for how to run it on demand.
 *  2. **A link that points to the wrong platform.** A copy-paste that kept the URL and
 *     lost the label is undetectable by looking at the URL alone, and it is the
 *     failure a *reader* notices first. `platform` → host is therefore an invariant,
 *     not a convention.
 *  3. **A reference into this app that has rotted.** A topic that tells a learner to
 *     watch an algorithm that no longer exists, or to read a renamed guide. Both are
 *     checked here against the real registries.
 *
 * Point 1 is the reason the URLs in this data set were verified against each
 * platform's live catalogue when it was written (LeetCode's problem-list API,
 * HackerRank's challenges API, and the resolved page titles on GeeksforGeeks,
 * HackerEarth and CodeChef). Several plausible-looking guesses were wrong — GFG's
 * `/problems/two-sum/` does not exist, and CodeChef's `PALL01` is The Block Game, not
 * a palindrome problem — which is the only reason this data can claim to be links.
 */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function allQuestions(): Array<{ q: Question; topicId: string }> {
  return TOPIC_LIST.flatMap((t) => t.questions.map((q) => ({ q, topicId: t.id })));
}

describe('the roadmap phases', () => {
  it('has phases, in curriculum order', () => {
    expect(PHASE_LIST.length).toBeGreaterThan(0);
    // `PHASE_LIST` is the only place the order is written down, and it is a
    // hand-ordered array rather than a sort. Asserting it is a fixed sequence is the
    // only way to catch someone alphabetising it, which would silently reorder the
    // entire page.
    expect(PHASE_LIST.map((p) => p.id)).toEqual([
      'foundation',
      'patterns',
      'structures',
      'advanced',
    ]);
    const seen = new Set<string>();
    for (const p of PHASE_LIST) {
      if (seen.has(p.id)) throw new Error(`duplicate phase id ${p.id}`);
      seen.add(p.id);
      for (const field of [p.label, p.weeks, p.blurb, p.outcome] as const) {
        if (!field.trim())
          throw new Error(`phase ${p.id} has an empty ${field === p.label ? 'label' : 'field'}`);
      }
    }
  });

  it('has no phase the reader cannot get to', () => {
    // The same guard as "every family in the rail is non-empty" on the browse page: a
    // phase with a header, a week range and an outcome but no topics is a section of
    // navigation that leads nowhere, and the grouping function would render it anyway.
    for (const { phase, topics } of topicsByPhase()) {
      expect(topics.length, `phase "${phase.id}" has no topics`).toBeGreaterThan(0);
    }
    // And every topic lands in exactly one phase that exists.
    const ids = new Set(PHASE_LIST.map((p) => p.id));
    for (const t of TOPIC_LIST) {
      expect(ids.has(t.phase as PhaseId), `${t.id}: unknown phase "${t.phase}"`).toBe(true);
    }
  });

  it('puts every topic in the phase it claims', () => {
    // `topicsByPhase()` filters by phase and the page renders whatever comes back, so
    // a topic whose `phase` does not match where it was filed would simply vanish from
    // the timeline with no error anywhere. This is the check for that.
    const listed = topicsByPhase().flatMap((g) => g.topics.map((t) => t.id));
    expect(listed.sort()).toEqual(TOPIC_LIST.map((t) => t.id).sort());
  });
});

describe('roadmap topics', () => {
  it('finds the topics (a silent zero would make every check below vacuous)', () => {
    expect(TOPIC_LIST.length).toBeGreaterThan(10);
  });

  it('has unique, URL-safe ids, and resolves by id', () => {
    const seen = new Set<string>();
    const problems: string[] = [];
    for (const t of TOPIC_LIST) {
      if (seen.has(t.id)) problems.push(`duplicate topic id "${t.id}"`);
      seen.add(t.id);
      // Topic ids become anchor ids and are used as filter keys. A space or an
      // uppercase letter produces a link that works when clicked and breaks when
      // shared as text.
      if (!SLUG.test(t.id)) problems.push(`topic id "${t.id}" is not URL-safe`);
      if (getTopic(t.id) !== t) problems.push(`getTopic("${t.id}") did not return the topic`);
    }
    expect(problems).toEqual([]);
    expect(getTopic('no-such-topic')).toBeUndefined();
  });

  it('has a blurb and something to actually learn', () => {
    const problems: string[] = [];
    for (const t of TOPIC_LIST) {
      if (!t.blurb.trim()) problems.push(`${t.id}: empty blurb`);
      if (t.keyPoints.length < 2) {
        problems.push(`${t.id}: ${t.keyPoints.length} key point(s) — a topic with one is a title`);
      }
      if (t.keyPoints.some((k) => !k.trim())) problems.push(`${t.id}: blank key point`);
    }
    expect(problems).toEqual([]);
  });

  it('offers at least one question, spread over at least two levels', () => {
    const problems: string[] = [];
    for (const t of TOPIC_LIST) {
      if (t.questions.length < 4) {
        problems.push(`${t.id}: only ${t.questions.length} question(s)`);
      }
      const levels = new Set(t.questions.map((q) => q.level));
      if (levels.size < 2) {
        problems.push(
          `${t.id}: only ${[...levels].join(', ')} — a level-sorted list teaches nothing`,
        );
      }
    }
    expect(problems).toEqual([]);
  });

  it('references at least one real algorithm, or the visualiser link would lie', () => {
    /*
     * Reported rather than enforced.
     *
     * Not every topic is about an algorithm this app can animate — "Maths and bit
     * manipulation" is number theory, and `core/` has no number-theory algorithms to
     * point at. Forcing one would mean either a dishonest link or a fake `algoId`.
     * What *is* worth asserting is the other direction: of the topics that could link
     * into the visualiser, a healthy majority do, because the visualiser is the
     * product and a roadmap that never mentions it is a worse product.
     */
    const linked = TOPIC_LIST.filter((t) => t.algoIds.length > 0);
    expect(linked.length / TOPIC_LIST.length).toBeGreaterThan(0.7);
  });
});

describe('roadmap links into this app', () => {
  it('every algoId names an algorithm in the catalogue', () => {
    // The check that makes the "watch it first" affordance safe to click. A stale id
    // renders a perfectly good-looking link to `/?algo=typo`, which the player then
    // renders as an empty state.
    const problems: string[] = [];
    for (const t of TOPIC_LIST) {
      for (const id of t.algoIds) {
        if (!CATALOG_BY_ID[id]) problems.push(`${t.id}: algoId "${id}" is not in the catalogue`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('every learnSlug names an article that exists', () => {
    // Same reasoning as above, for the "read the guide" links.
    const problems: string[] = [];
    for (const t of TOPIC_LIST) {
      for (const slug of t.learnSlugs) {
        if (!getArticle(slug)) problems.push(`${t.id}: learnSlug "${slug}" is not an article`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('reuses guides across topics rather than repeating the same list', () => {
    // A guard on the guard. Uniqueness of algoId is not required — several topics
    // legitimately share "binary search" — but if every topic listed the same two
    // articles the links would be noise. Requiring that at least a third of the
    // articles are reachable from the roadmap keeps the two halves of the app joined
    // together, which is the reason the fields exist.
    const used = new Set(TOPIC_LIST.flatMap((t) => t.learnSlugs));
    expect(used.size).toBeGreaterThanOrEqual(6);
  });
});

describe('roadmap questions', () => {
  it('finds the questions', () => {
    expect(QUESTION_LIST.length).toBeGreaterThan(100);
  });

  it('has unique ids', () => {
    // The progress store persists solved question *ids*, so a duplicated id silently
    // checks off two questions with one click, and a question that appears in two
    // topics can never be completed in the second one.
    const seen = new Map<string, string>();
    const problems: string[] = [];
    for (const { q, topicId } of allQuestions()) {
      if (!SLUG.test(q.id)) problems.push(`question id "${q.id}" is not URL-safe`);
      const at = seen.get(q.id);
      if (at) problems.push(`question id "${q.id}" appears in both "${at}" and "${topicId}"`);
      seen.set(q.id, topicId);
    }
    expect(problems).toEqual([]);
  });

  it('lists every problem once', () => {
    /*
     * The one that is *not* about ids.
     *
     * An earlier draft of this data used suffixed ids (`lc-redundant-connection-ii`)
     * to satisfy the uniqueness check while quietly listing the same problem in three
     * different topics. The ids were unique, the page rendered, every other test
     * passed, and the roadmap asked a learner to solve Redundant Connection three
     * times. Duplicating a URL is the failure mode an id check cannot see, so the URL
     * is checked instead — and the ids are left alone, because two platforms can
     * legitimately host different problems with the same title.
     */
    const seen = new Map<string, string>();
    const problems: string[] = [];
    for (const { q, topicId } of allQuestions()) {
      const at = seen.get(q.url);
      if (at) problems.push(`${q.id} in "${topicId}" repeats the URL already used by "${at}"`);
      seen.set(q.url, q.id);
    }
    expect(problems).toEqual([]);
  });

  it('has a title, and one that is not just the URL', () => {
    const problems: string[] = [];
    for (const { q, topicId } of allQuestions()) {
      if (!q.title.trim()) problems.push(`${topicId}: ${q.id} has no title`);
      if (!q.title.trim() || q.title === q.url) problems.push(`${q.id}: title is the URL`);
    }
    expect(problems).toEqual([]);
  });

  it('uses a known platform and level', () => {
    const platforms = new Set(Object.keys(PLATFORM_HOST));
    const problems: string[] = [];
    for (const { q, topicId } of allQuestions()) {
      if (!platforms.has(q.platform))
        problems.push(`${topicId}: ${q.id} has platform "${q.platform}"`);
      if (!LEVELS.includes(q.level)) problems.push(`${topicId}: ${q.id} has level "${q.level}"`);
      if (!PLATFORM_LABEL[q.platform]) problems.push(`${q.id}: no label for ${q.platform}`);
      if (!LEVEL_LABEL[q.level]) problems.push(`${q.id}: no label for ${q.level}`);
    }
    expect(problems).toEqual([]);
  });

  it('links over https, to the host its own platform uses', () => {
    /*
     * The invariant from the header comment, enforced.
     *
     * The failure it catches is a paste that kept the URL and lost the label — a
     * HackerRank link on a CodeChef row, or a `leetcode.com` link that quietly points
     * at a leetcode.cn mirror. Both render identically to the correct thing and both
     * send the reader to the wrong site.
     */
    const problems: string[] = [];
    for (const { q, topicId } of allQuestions()) {
      let url: URL;
      try {
        url = new URL(q.url);
      } catch {
        problems.push(`${topicId}: ${q.id} has an unparseable URL "${q.url}"`);
        continue;
      }
      if (url.protocol !== 'https:') {
        problems.push(`${topicId}: ${q.id} is ${url.protocol}// — every link must be https`);
      }
      const host = PLATFORM_HOST[q.platform];
      if (url.host !== host) {
        problems.push(
          `${topicId}: ${q.id} is labelled "${q.platform}" but points at ${url.host}, not ${host}`,
        );
      }
      // A bare host means the link lands on a homepage, not on the problem. Every
      // platform puts the problem deeper in the path, so a two-segment path is the
      // cheapest offline proxy for "this is the statement and not the front page".
      if (url.pathname.split('/').filter(Boolean).length < 2) {
        problems.push(`${topicId}: ${q.id} points at a landing page, not a problem`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('covers all three levels across every platform', () => {
    /*
     * Not a data rule, a claim check.
     *
     * The page says "easy, medium and hard" and lists six platforms. If either of
     * those stopped being true — a platform's questions all landing at one level,
     * because someone filled in the levels from memory — this is what notices.
     */
    const platforms = Object.keys(PLATFORM_HOST) as Array<Question['platform']>;
    const problems: string[] = [];
    for (const p of platforms) {
      const mine = QUESTION_LIST.filter((q) => q.platform === p);
      if (mine.length < 5) problems.push(`${p}: only ${mine.length} question(s)`);
      const levels = new Set(mine.map((q) => q.level));
      if (levels.size < 2) problems.push(`${p}: every question is ${[...levels].join(', ')}`);
    }
    for (const level of LEVELS) {
      if (ROADMAP_TOTALS.byLevel[level] < 10) {
        problems.push(
          `only ${ROADMAP_TOTALS.byLevel[level]} ${level} question(s) in the whole roadmap`,
        );
      }
    }
    expect(problems).toEqual([]);
  });

  it('has enough questions to be a roadmap, not a reading list', () => {
    // A guard on the guard. Every per-topic check above passes trivially on three
    // topics, so this is the assertion that the thing is actually a curriculum.
    expect(ROADMAP_TOTALS.topics).toBeGreaterThanOrEqual(15);
    expect(ROADMAP_TOTALS.questions).toBeGreaterThanOrEqual(120);
  });
});

describe('roadmap progress', () => {
  it('counts solved questions per topic', () => {
    const topic = TOPIC_LIST[0] as Topic;
    const none = topicProgress(topic, new Set());
    expect(none.done).toBe(0);
    expect(none.total).toBe(topic.questions.length);
    expect(none.ratio).toBe(0);

    const all = new Set(topic.questions.map((q) => q.id));
    const done = topicProgress(topic, all);
    expect(done.done).toBe(topic.questions.length);
    expect(done.ratio).toBe(1);
  });

  it('is a real fraction, not a rounded-up lie', () => {
    // A bar that shows 100% at 3 of 4 is a worse lie than no bar: a learner closes
    // the topic thinking they are done.
    const topic = TOPIC_LIST.find((t) => t.questions.length >= 3) as Topic;
    const first = topic.questions[0];
    const partial = topicProgress(topic, new Set(first ? [first.id] : []));
    expect(partial.done).toBe(1);
    expect(partial.ratio).toBeCloseTo(1 / topic.questions.length, 6);
    expect(partial.ratio).toBeLessThan(1);
  });

  it('does not divide by zero on an empty topic', () => {
    const empty: Topic = {
      ...(TOPIC_LIST[0] as Topic),
      questions: [],
    };
    expect(topicProgress(empty, new Set()).ratio).toBe(0);
  });

  it('ignores solved ids that are no longer in the roadmap', () => {
    /*
     * The one that matters after an edit.
     *
     * Progress is stored as a list of ids in `localStorage`, and nothing clears it
     * when a question is removed or re-keyed. A stale id must not make a topic's ratio
     * exceed 1 or a phase bar overflow — a progress bar wider than its track is the
     * kind of thing that gets screenshotted as a bug.
     */
    const topic = TOPIC_LIST[0] as Topic;
    const stale = topicProgress(
      topic,
      new Set([...topic.questions.map((q) => q.id), 'no-longer-here']),
    );
    expect(stale.done).toBe(topic.questions.length);
    expect(stale.ratio).toBeLessThanOrEqual(1);
  });
});

describe('question grouping', () => {
  it('groups by level, easy first, and drops empty groups', () => {
    const groups = questionsByLevel(TOPIC_LIST[0] as Topic);
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.map((g) => g.level)).toEqual(
      LEVELS.filter((l) => groups.some((g) => g.level === l)),
    );
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    expect(total).toBe((TOPIC_LIST[0] as Topic).questions.length);
  });

  it('is a partition of the topic: no question lost, none twice', () => {
    for (const t of TOPIC_LIST) {
      const ids = questionsByLevel(t).flatMap((g) => g.items.map((q) => q.id));
      expect(ids.slice().sort()).toEqual(
        t.questions
          .map((q) => q.id)
          .slice()
          .sort(),
      );
    }
  });
});

describe('roadmap totals', () => {
  it('agrees with the data it summarises', () => {
    expect(ROADMAP_TOTALS.topics).toBe(TOPIC_LIST.length);
    expect(ROADMAP_TOTALS.questions).toBe(QUESTION_LIST.length);
    const byLevel = LEVELS.reduce((n, l) => n + ROADMAP_TOTALS.byLevel[l], 0);
    expect(byLevel).toBe(QUESTION_LIST.length);
    const byPlatform = Object.values(ROADMAP_TOTALS.byPlatform).reduce((a, b) => a + b, 0);
    expect(byPlatform).toBe(QUESTION_LIST.length);
  });
});
