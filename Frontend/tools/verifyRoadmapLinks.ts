/**
 * Check every roadmap link, on demand.
 *
 * ## Why this is a script and not a test
 *
 * Because it needs the network, and a network check in CI is a test that fails for
 * reasons that have nothing to do with the code. Three specific ones, all observed
 * while this data was written:
 *
 *  - **LeetCode returns 403** to anything that is not a browser. A `fetch` from CI is
 *    not a browser.
 *  - **HackerRank returns 404** for every `/challenges/<slug>` deep link. It is a
 *    client-routed single-page app, so the server has no opinion about which challenge
 *    exists and says "not found" to bots and humans alike. Confirmed by fetching
 *    `/challenges/` (200, 535 kB of app shell) and any deep link (404, the same 535 kB).
 *  - **InterviewBit does the same**, which is why the slugs there could not be verified
 *    automatically and were taken from the confirmed `interviewbit.com/problems/<slug>/`
 *    convention instead.
 *
 * So a naive link checker would report LeetCode, HackerRank and InterviewBit as 100%
 * broken and be ignored within a week. What follows instead uses each platform's *own*
 * source of truth where one exists, and only falls back to a request for the three
 * where nothing better is available — and it says which method was used for every
 * result, so a "pass" can be trusted for the reason given.
 *
 * | Platform | Method | Why it is reliable |
 * | --- | --- | --- |
 * | LeetCode | `GET /api/problems/all/`, match the slug | Public catalogue of every problem, with difficulty |
 * | HackerRank | `GET /rest/contests/master/challenges`, paged, match the slug | Same, with difficulty |
 * | GeeksforGeeks | One request per URL, resolved page title | GFG normalises the numeric id away, so the slug decides |
 * | CodeChef | One request per URL, page title | A missing code renders the SPA shell, which is detectable |
 * | HackerEarth | One request per URL, status code | Clean 200/404 for a valid problem slug |
 * | InterviewBit | One request per URL, **expected to fail** | Bot-blocked; reports `skipped` rather than a false `dead` |
 *
 * ## Usage
 *
 *   node tools/verifyRoadmapLinks.ts                     # everything
 *   node tools/verifyRoadmapLinks.ts --only=leetcode     # one platform
 *   node tools/verifyRoadmapLinks.ts --fix-hosts         # print the real host per slug
 *
 * Exits non-zero if anything is dead, so it is usable from a scheduled workflow later
 * even though it is deliberately not in `npm test`.
 */
import {
  PLATFORM_HOST,
  type Platform,
  QUESTION_LIST,
  type Question,
} from '../src/core/roadmap/index.ts';

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length);
const fixHosts = args.includes('--fix-hosts');
/**
 * Parallel requests per site.
 *
 * Defaults to 6, and it is a flag rather than a constant because HackerEarth and
 * GeeksforGeeks both answer a burst of concurrent requests by refusing the connection
 * outright — which looks exactly like "every link on this platform is broken" until you
 * notice that it is a `ConnectTimeoutError` rather than a 404. `--concurrency=1` with a
 * pause between sites is the way to check those two without being throttled.
 *
 * The slices use `prefix.length` rather than hand-counted numbers, because they were
 * hand-counted first and the off-by-one was invisible in the output: slicing
 * `--concurrency=` at 15 yields `''`, and `Number('')` is **0**, not `NaN`. Zero workers
 * means the run finishes instantly, checks nothing, and reports every link as
 * `undefined`. The validator exists so a bad flag can never again produce a
 * clean-looking run that verified nothing at all.
 */
function flagNumber(prefix: string, fallback: number): number {
  const raw = args.find((a) => a.startsWith(prefix))?.slice(prefix.length);
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    process.stderr.write(`${prefix} expects a number >= 1, got "${raw}". Ignoring it.\n`);
    return fallback;
  }
  return n;
}

const concurrency = flagNumber('--concurrency=', 6);
const PAUSE_MS = flagNumber('--pause=', 0);

const PLATFORMS = (Object.keys(PLATFORM_HOST) as Platform[]).filter(
  (p) => !only || only.split(',').includes(p),
);

/** A browser UA. Not for defeating bot protection — the platforms that need it are skipped. */
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

type Verdict = 'ok' | 'dead' | 'skipped';

interface Result {
  question: Question;
  verdict: Verdict;
  detail: string;
}

async function get(url: string): Promise<{ status: number; body: string; finalUrl: string }> {
  /*
   * One retry, because a connect timeout is a transient network condition and the whole
   * point of this tool is to be trustworthy: a run that dies halfway through tells you
   * nothing about the links it did not reach, and a run that reported a timeout as a
   * dead link would send someone to fix a URL that is fine.
   */
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html,application/json' },
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
      });
      const body = await res.text();
      return { status: res.status, body, finalUrl: res.url };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `GET ${url} failed: ${lastError instanceof Error ? (lastError.cause?.toString() ?? lastError.message) : String(lastError)}`,
  );
}

/**
 * Bounded concurrency, and never a crash.
 *
 * The first version let a rejection propagate out of `Promise.all` and killed the run
 * on the first flaky connection — which is how a HackerEarth connect timeout threw away
 * a check of 260 other links. A checker that reports "everything is fine" after
 * silently dropping most of its work is worse than one that crashes, so a failed
 * request becomes a `skipped` row with the reason attached.
 */
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  /*
   * A plain array literal rather than `new Array(n)`.
   *
   * `new Array(n)` is a *holey* array, and spreading one yields explicit `undefined`
   * for every index a worker never reached. That is invisible until `results` is full
   * of undefined and something three functions later dereferences `.question`. And a
   * worker can reach nothing at all without warning: a `limit` of 0 produces zero
   * workers, which is how the `--concurrency=` off-by-one produced a clean-looking
   * report of 324 unchecked rows. `Array.from` over a map, then, with the count checked.
   */
  const out: R[] = [];
  let next = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      // Read once, so the index is checked and the value used together.
      const item = items[i] as T;
      out.push(await fn(item));
    }
  });
  await Promise.all(workers);
  if (out.length !== items.length) {
    throw new Error(`mapWithLimit filled ${out.length} of ${items.length} — refusing to report`);
  }
  return out;
}

/** Wraps a per-question check so a network failure is a row, not a crash. */
async function attempt(question: Question, check: () => Promise<Result>): Promise<Result> {
  try {
    return await check();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { question, verdict: 'skipped', detail: `network error — ${reason}` };
  }
}

/* ------------------------------------------------------------------ LeetCode */

/**
 * One catalogue fetch, then a set lookup.
 *
 * `question__title_slug` is the path segment LeetCode itself uses, so this is not a
 * proxy for the real thing — it is the real thing. `paid_only` is reported too,
 * because a roadmap that sends a beginner to a subscriber-only problem is a bad
 * roadmap even though the link works.
 */
async function leetcodeSlugs(): Promise<Set<string>> {
  const { status, body } = await get('https://leetcode.com/api/problems/all/');
  if (status !== 200) throw new Error(`leetcode catalogue: HTTP ${status}`);
  const data = JSON.parse(body) as {
    stat_status_pairs: Array<{ stat: { question__title_slug: string } }>;
  };
  return new Set(data.stat_status_pairs.map((p) => p.stat.question__title_slug));
}

/* --------------------------------------------------------------- HackerRank */

/**
 * The public challenges index, paged.
 *
 * `total` is about 2000 and the endpoint caps a page at 50, so this is ~40 requests
 * once — and once, not once per question, which is the whole reason it is worth the
 * pagination. Difficulty comes back with the slug, which also lets a roadmap author
 * confirm the level they typed.
 */
async function hackerrankSlugs(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let offset = 0; offset < 4000; offset += 50) {
    const { status, body } = await get(
      `https://www.hackerrank.com/rest/contests/master/challenges?limit=50&offset=${offset}`,
    );
    if (status !== 200) throw new Error(`hackerrank index: HTTP ${status}`);
    const json = JSON.parse(body) as { models: Array<{ slug: string; difficulty_name: string }> };
    if (!json.models?.length) break;
    for (const m of json.models) map.set(m.slug, m.difficulty_name);
  }
  return map;
}

/* ------------------------------------------------- per-request verifications */

async function checkGfg(question: Question): Promise<Result> {
  const { body, finalUrl } = await get(question.url);
  // Two independent failure signals, because GFG has two: a hard 404 for a slug it does
  // not know, and a rendered "Oops" page for a slug it knows but that has no id. The
  // second is the one that matters, and it is why a status-code-only check would have
  // passed every broken GFG link in an earlier draft of this data.
  if (/Oops/i.test(body)) return { question, verdict: 'dead', detail: 'GFG "Oops" page' };
  const og = (/<meta property="og:title" content="([^"]*)"/i.exec(body) || [])[1] || '';
  if (!og || /portal for geeks\s*$/i.test(og)) {
    return { question, verdict: 'dead', detail: 'resolved to a non-problem page' };
  }
  return {
    question,
    verdict: 'ok',
    detail: `${og.replace(/ \| Practice \| GeeksforGeeks\s*$/, '')}${finalUrl === question.url ? '' : ` → ${finalUrl}`}`,
  };
}

async function checkCodechef(question: Question): Promise<Result> {
  const { body } = await get(question.url);
  const title = (/<title>([^<]*)<\/title>/i.exec(body) || [])[1]?.trim() || '';
  if (!/Practice Coding Problem\s*$/i.test(title)) {
    return { question, verdict: 'dead', detail: `title was "${title.slice(0, 40)}"` };
  }
  // A valid problem page is titled "<Name> Practice Coding Problem". An *unknown* code
  // still returns 200 with a generic title, which is why the bare pattern above is not
  // enough on its own — `PALL01` returns "Practice Coding Problem" for a real problem
  // and the same string for a typo.
  const name = title.replace(/\s*Practice Coding Problem\s*$/i, '').trim();
  if (name.toLowerCase() === 'practice coding problem') {
    return { question, verdict: 'dead', detail: 'code not found (SPA shell served)' };
  }
  return { question, verdict: 'ok', detail: name };
}

async function checkHackerearth(question: Question): Promise<Result> {
  const { status } = await get(question.url);
  if (status === 404) return { question, verdict: 'dead', detail: 'HTTP 404' };
  if (status !== 200) return { question, verdict: 'dead', detail: `HTTP ${status}` };
  return { question, verdict: 'ok', detail: 'HTTP 200' };
}

/**
 * InterviewBit, and the honest answer.
 *
 * Every `/problems/<slug>/` returns 404 to a non-browser — including slugs confirmed by
 * search to exist. Rather than report those as dead, which would be noise, they are
 * reported as `skipped` so a reader of the output can tell "not checked" from "broken".
 *
 * Deliberately **not** `async`: there is nothing to await, and an `async` here means
 * this returns a Promise, which `results.push` would store as if it were a result. That
 * bug shipped in this file and only showed up on a *full* run, because every other
 * branch awaits `mapWithLimit` — the tell is that a type check on `Result[]` would have
 * caught it, which is why it is written as an explicit `for` loop rather than `.map`.
 */
function checkInterviewbit(question: Question): Result {
  return {
    question,
    verdict: 'skipped',
    detail: 'bot-blocked: InterviewBit 404s every deep link to non-browsers',
  };
}

/* ------------------------------------------------------------------------ run */

/**
 * The slug a platform's catalogue is keyed by.
 *
 * Not "the last path segment". That is correct for LeetCode and CodeChef by accident
 * and wrong for two of the six: HackerRank ends every deep link in `/problem`, and
 * GeeksforGeeks ends it in a numeric id, so the last segment of
 * `…/challenges/no-prefix-set/problem` is the literal word `problem` and of
 * `…/problems/palindrome-string/1` is `1`. Comparing those against a catalogue
 * reported all 68 HackerRank links and every GFG link as dead, which is a good
 * illustration of why this tool has to be run and read rather than trusted blind.
 */
const SLUG_SEGMENT: Record<Platform, number> = {
  leetcode: 1, // /problems/<slug>
  interviewbit: 1, // /problems/<slug>/
  codechef: 1, // /problems/<CODE>
  hackerrank: 1, // /challenges/<slug>/problem
  hackerearth: 2, // /problem/algorithm/<slug>/
  gfg: 1, // /problems/<slug>/<id>
};

function slugOf(question: Question): string {
  const parts = new URL(question.url).pathname.split('/').filter(Boolean);
  return parts[SLUG_SEGMENT[question.platform]] ?? '';
}

/**
 * Below this many entries, a catalogue fetch did not fail — it was throttled.
 *
 * HackerEarth and GeeksforGeeks both start refusing connections after a few hundred
 * rapid requests, and a throttled response that is still `200` and still well-formed
 * JSON turns into "not in the catalogue" for every link. Which is worse than useless:
 * it reports 68 working links as broken and invites someone to go and change them.
 * So an implausibly small index is a loud `skipped`, never a verdict.
 */
const MIN_CATALOGUE = 100;

async function main(): Promise<void> {
  const byPlatform = new Map<Platform, Question[]>();
  for (const q of QUESTION_LIST) {
    if (!PLATFORMS.includes(q.platform)) continue;
    const list = byPlatform.get(q.platform) ?? [];
    list.push(q);
    byPlatform.set(q.platform, list);
  }

  const results: Result[] = [];
  const notes: string[] = [];

  for (const platform of PLATFORMS) {
    const questions = byPlatform.get(platform) ?? [];
    if (questions.length === 0) continue;
    process.stderr.write(`\n${platform}: checking ${questions.length}…\n`);

    if (platform === 'leetcode') {
      const slugs = await leetcodeSlugs();
      if (slugs.size < MIN_CATALOGUE) {
        results.push(
          ...questions.map((q) => ({
            question: q,
            verdict: 'skipped' as const,
            detail: `catalogue truncated (${slugs.size})`,
          })),
        );
        notes.push(
          'leetcode: catalogue came back implausibly small — treated as throttled, not as 134 dead links.',
        );
      } else {
        results.push(
          ...questions.map((q) => {
            const slug = slugOf(q);
            return slugs.has(slug)
              ? { question: q, verdict: 'ok' as const, detail: 'in catalogue' }
              : {
                  question: q,
                  verdict: 'dead' as const,
                  detail: `slug "${slug}" not in /api/problems/all/`,
                };
          }),
        );
      }
    } else if (platform === 'hackerrank') {
      const slugs = await hackerrankSlugs();
      if (slugs.size < MIN_CATALOGUE) {
        results.push(
          ...questions.map((q) => ({
            question: q,
            verdict: 'skipped' as const,
            detail: `index truncated (${slugs.size})`,
          })),
        );
        notes.push(
          'hackerrank: index came back implausibly small — treated as throttled, not as 68 dead links.',
        );
      } else {
        results.push(
          ...questions.map((q) => {
            const slug = slugOf(q);
            const found = slugs.get(slug);
            return found
              ? { question: q, verdict: 'ok' as const, detail: `in index (${found})` }
              : {
                  question: q,
                  verdict: 'dead' as const,
                  detail: `slug "${slug}" not in the challenge index`,
                };
          }),
        );
      }
    } else if (platform === 'gfg') {
      results.push(
        ...(await mapWithLimit(questions, concurrency, (q) => attempt(q, () => checkGfg(q)))),
      );
    } else if (platform === 'codechef') {
      results.push(
        ...(await mapWithLimit(questions, concurrency, (q) => attempt(q, () => checkCodechef(q)))),
      );
    } else if (platform === 'hackerearth') {
      results.push(
        ...(await mapWithLimit(questions, concurrency, (q) =>
          attempt(q, () => checkHackerearth(q)),
        )),
      );
    } else {
      /*
       * `map(checkInterviewbit)` — which is how this was written first — is a bug, and a
       * quiet one. `Array.map` does not await, so the array filled with *promises* and
       * `results` ended up holding 37 unresolved objects that look like results and throw
       * three screenfuls later, somewhere unrelated. It only surfaced on a full run, because
       * every per-request branch awaits `mapWithLimit`. Written out longhand so the sync
       * boundary is visible, and `checkInterviewbit` is not `async`.
       */
      for (const question of questions) results.push(checkInterviewbit(question));
      notes.push(
        'interviewbit: not verified. The platform 404s every deep link to non-browsers, so ' +
          'a status check would report 100% breakage for links that are known to work.',
      );
    }

    if (PAUSE_MS > 0) await new Promise((r) => setTimeout(r, PAUSE_MS));

    // A platform where *nothing* connected is almost always throttling, not a hundred
    // dead links. Saying so explicitly is the difference between a tool that gets
    // re-run and one that gets ignored after the first false alarm.
    const mine = results.filter((r) => r.question.platform === platform);
    if (mine.length > 0 && mine.every((r) => r.verdict === 'skipped')) {
      notes.push(
        `${platform}: every request failed to connect. This site is rate-limiting this machine — ` +
          `re-run with --concurrency=1 --pause=1500. No verdict was reached for these links.`,
      );
    }
  }

  if (fixHosts) {
    for (const r of results) {
      process.stdout.write(`${r.verdict}\t${r.detail}\t${r.question.url}\n`);
    }
  }

  const dead = results.filter((r) => r.verdict === 'dead');
  const ok = results.filter((r) => r.verdict === 'ok');
  const skipped = results.filter((r) => r.verdict === 'skipped');

  process.stdout.write(`\n${'='.repeat(64)}\n`);
  for (const r of [...dead, ...skipped, ...ok]) {
    const mark = r.verdict === 'ok' ? '  ok' : r.verdict === 'dead' ? ' DEAD' : ' skip';
    process.stdout.write(`${mark}  ${r.question.id.padEnd(38)} ${r.detail}\n`);
  }
  process.stdout.write(`${'='.repeat(64)}\n`);
  for (const n of notes) process.stdout.write(`note: ${n}\n`);
  process.stdout.write(
    `\n${ok.length} ok, ${dead.length} dead, ${skipped.length} skipped, of ${results.length}\n`,
  );

  process.exit(dead.length > 0 ? 1 : 0);
}

await main();
