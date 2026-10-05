import { PHASE_LIST } from './phases.ts';
import { ADVANCED } from './topics/advanced.ts';
import { FOUNDATION } from './topics/foundation.ts';
import { PATTERNS } from './topics/patterns.ts';
import { STRUCTURES } from './topics/structures.ts';
import type { Level, Phase, Platform, Question, Topic } from './types.ts';

export { PHASE_LIST } from './phases.ts';
export type { Level, Phase, PhaseId, Platform, Question, Topic } from './types.ts';

/**
 * The practice roadmap registry.
 *
 * ## Plain data, for the same reason `core/learn/` is
 *
 * No React, no DOM, no router — `boundary.test.ts` enforces it. The payoff is
 * `roadmap.test.ts`, which can walk all 22 topics and assert that every `algoId`
 * resolves in `catalog.ts`, every `learnSlug` resolves in `core/learn/`, and every
 * question's URL host matches its declared platform. Those are the three ways this
 * page can rot silently, and none of them is visible from the rendered output: a
 * wrong host is still a link, a dead `algoId` is still a button, and a renamed guide
 * is still a link to *something*.
 *
 * ## Import cost, and why this page must stay lazy
 *
 * Every topic is in this module, so the whole curriculum — a few tens of kB of text
 * — lands in the chunk that contains `/roadmap`. That is the same trade `learn/` makes
 * and the reason `routes.tsx` lazy-loads the page rather than importing it eagerly:
 * with `Roadmap` eager, every visitor to `/?algo=bubble-sort` pays for it. The
 * measurement is `tools/budget.mjs`, and it is why the answer is "lazy" rather than
 * "split each topic into its own import" — a second round trip before a single topic
 * renders would be a worse trade than a few kB of text.
 */
export const TOPIC_LIST: readonly Topic[] = [
  ...FOUNDATION,
  ...PATTERNS,
  ...STRUCTURES,
  ...ADVANCED,
];

/** Every question in roadmap order — the order the "start here" hint walks. */
export const QUESTION_LIST: readonly Question[] = TOPIC_LIST.flatMap((t) => t.questions);

const BY_TOPIC_ID: Record<string, Topic> = Object.fromEntries(TOPIC_LIST.map((t) => [t.id, t]));

/** Look up one topic. `undefined` for an unknown id. */
export function getTopic(id: string): Topic | undefined {
  return BY_TOPIC_ID[id];
}

/**
 * Topics grouped by phase, in `PHASE_LIST` order.
 *
 * Driven off `PHASE_LIST` rather than off first appearance in `TOPIC_LIST`, so a phase
 * with no topics yet still renders its header with an honest empty state. That case
 * is reachable — someone adds a phase and forgets the questions — and it is exactly
 * the kind of dead end the family-rail e2e test guards against on the browse page.
 */
export function topicsByPhase(): Array<{ phase: Phase; topics: Topic[] }> {
  return PHASE_LIST.map((phase) => ({
    phase,
    topics: TOPIC_LIST.filter((t) => t.phase === phase.id),
  }));
}

/**
 * The canonical host for each platform.
 *
 * The single source of truth for the one invariant about links that can be checked
 * offline: a question's URL must be on its own platform's host. Every one of these
 * was confirmed against the live site when the roadmap was written, which is the only
 * reason the six shapes are trusted at all — GeeksforGeeks needs a numeric id
 * segment, HackerRank needs `/problem`, and InterviewBit needs a trailing slash.
 */
export const PLATFORM_HOST: Record<Platform, string> = {
  leetcode: 'leetcode.com',
  interviewbit: 'www.interviewbit.com',
  codechef: 'www.codechef.com',
  hackerrank: 'www.hackerrank.com',
  hackerearth: 'www.hackerearth.com',
  gfg: 'www.geeksforgeeks.org',
} as const;

/** Display name and a one-word group label, for the filter row. */
export const PLATFORM_LABEL: Record<Platform, string> = {
  leetcode: 'LeetCode',
  interviewbit: 'InterviewBit',
  codechef: 'CodeChef',
  hackerrank: 'HackerRank',
  hackerearth: 'HackerEarth',
  gfg: 'GeeksforGeeks',
} as const;

export const LEVELS: readonly Level[] = ['easy', 'medium', 'hard'] as const;

/** `easy` → `Easy`, and the word is used in three places so it is defined once. */
export const LEVEL_LABEL: Record<Level, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
} as const;

/** Questions grouped by level within one topic, preserving authored order in each. */
export function questionsByLevel(topic: Topic): Array<{ level: Level; items: Question[] }> {
  return LEVELS.map((level) => ({
    level,
    items: topic.questions.filter((q) => q.level === level),
  })).filter((g) => g.items.length > 0);
}

/** Questions solved out of total, for a progress bar. */
export interface TopicProgress {
  done: number;
  total: number;
  /** 0–1, or 0 when there are no questions. */
  ratio: number;
}

export function topicProgress(topic: Topic, solved: ReadonlySet<string>): TopicProgress {
  const total = topic.questions.length;
  const done = topic.questions.reduce((n, q) => n + (solved.has(q.id) ? 1 : 0), 0);
  return { done, total, ratio: total === 0 ? 0 : done / total };
}

/**
 * Counts across the whole roadmap, for the hero and the phase bars.
 *
 * Computed once at module scope rather than per render: it depends only on static
 * data, so recomputing it on every keystroke of the filter input would be pure waste.
 */
export const ROADMAP_TOTALS = {
  topics: TOPIC_LIST.length,
  questions: QUESTION_LIST.length,
  platforms: Object.keys(PLATFORM_HOST).length,
  /** Questions per level — the number that makes the "all three levels" claim checkable. */
  byLevel: LEVELS.reduce<Record<Level, number>>(
    (acc, level) => {
      acc[level] = QUESTION_LIST.filter((q) => q.level === level).length;
      return acc;
    },
    { easy: 0, medium: 0, hard: 0 },
  ),
  byPlatform: (Object.keys(PLATFORM_HOST) as Platform[]).reduce<Record<string, number>>(
    (acc, p) => {
      acc[p] = QUESTION_LIST.filter((q) => q.platform === p).length;
      return acc;
    },
    {},
  ),
} as const;
