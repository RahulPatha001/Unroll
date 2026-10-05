import { lazy, Suspense } from 'react';
import { Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { App } from '../App.tsx';
import { Browse } from './Browse.tsx';
import { NotFound } from './NotFound.tsx';

/**
 * The route table.
 *
 * ## What is eager and what is lazy, and why
 *
 * `App` — the player — is **eager**, and everything else is lazy.
 *
 * That is the opposite of the usual "lazy-load the big thing" instinct, and it is
 * deliberate. The player is the default destination for every link that has ever
 * been shared from this app, and it is the largest surface in the codebase. Lazy
 * loading it would add a round trip to the most common entry in the product, in
 * exchange for making the *browse page* — which is a grid of text and some
 * metadata — wait on a chunk it does not need.
 *
 * So the cost is paid by the pages rather than by the player. `/learn`,
 * `/learn/:slug` and `/compare` each carry an `EmbeddedStepper` or a pair of
 * trace builders, and none of that is in the entry chunk. `tools/budget.mjs`
 * prints the initial payload on every CI run, so the size of this decision is
 * visible rather than assumed.
 *
 * ## `/?algo=<id>` is the player's URL, and it stays that way
 *
 * The player is not at `/algo/:id`. Every deep link this app has ever produced is a
 * query string, `useUrlSync` deliberately distinguishes "the algorithm changed —
 * push a history entry" from "the frame moved — replace", and moving the id into
 * the path would give that logic two sources of truth for one field. The failure
 * mode is not a broken link; it is a Back button that silently stops working.
 *
 * So the split is by *query presence*, not by path:
 *
 * | URL | Renders |
 * | --- | --- |
 * | `/` | the browse page — choose an algorithm |
 * | `/?algo=bubble-sort` | the player, with the full URL contract intact |
 * | `/learn` | the guides index |
 * | `/learn/:slug` | one guide |
 * | `/roadmap` | the practice roadmap — an ordered curriculum of 324 problems |
 * | `/compare` | side by side |
 * | anything else | 404 |
 *
 * And that makes `/` genuinely new: it used to load Bubble Sort, because
 * `urlStateSchema` defaults `algo`. The nine e2e tests that called `page.goto('/')`
 * and expected a running visualiser now ask for `/?algo=bubble-sort` explicitly.
 * The behaviour they assert is unchanged; only the URL they reach it through is.
 *
 * ## How the pages navigate
 *
 * Every page is handed an `onNavigate` callback rather than importing
 * `useNavigate` itself. Two reasons: the components stay testable without a router,
 * and — more usefully — it puts every cross-page transition in one file, so the
 * question "what happens when you click a card" has one answer to read rather than
 * one per component.
 */

/** Guide pages, lazily loaded. See the note on bundling above. */
const ArticlePage = lazy(() =>
  import('./ArticlePage.tsx').then((m) => ({ default: m.ArticlePage })),
);
const ComparePage = lazy(() =>
  import('./ComparePage.tsx').then((m) => ({ default: m.ComparePage })),
);
/*
 * `LearnIndex` is lazy too, and this one is not obvious.
 *
 * It looks like a 60-line list of links — the smallest component on the site. But
 * it imports `articlesByCategory` from `core/learn/index.ts`, and *that* module
 * statically imports every article. So an eager `LearnIndex` put roughly 40 kB of
 * prose — seven long articles — into the entry chunk, where every visitor pays for
 * it to open `/?algo=bubble-sort`.
 *
 * This is the same class of mistake as the `registry.ts` import that `budget.mjs`
 * exists to catch, and the measurement is what found it: with `LearnIndex` eager the
 * honest initial payload was 202.8 kB gzip against a 200 kB budget. `Node
 * articles.test.ts` and the boundary test cannot see it, because the import is
 * perfectly legitimate — it is only the *timing* that is wrong.
 */
const LearnIndex = lazy(() => import('./LearnIndex.tsx').then((m) => ({ default: m.LearnIndex })));
/*
 * `Roadmap` is lazy for the same reason as every other page above, and it is the one
 * page where it matters most: `core/roadmap/index.ts` statically imports all 22
 * topics and 324 questions. An eager import would put the whole curriculum — a few
 * tens of kB of text — into the entry chunk that every visitor to
 * `/?algo=bubble-sort` pays to download.
 *
 * This is the identical trap `LearnIndex` fell into, documented above, and the
 * measurement is what caught it there: 202.8 kB gzip against a 200 kB budget. The way
 * to not repeat it is to add the import to the route table as a `lazy()`, and to run
 * `node tools/budget.mjs` after adding one.
 */
const Roadmap = lazy(() => import('./Roadmap.tsx').then((m) => ({ default: m.Roadmap })));

/**
 * A lazy route's loading state.
 *
 * `fade-in` rather than a spinner because the fallbacks are a few kilobytes of
 * markup and arrive in well under a frame on any connection worth using; a
 * spinner that flashes for 60 ms is worse than the absence of one. `role="status"`
 * with a visually-hidden label so the wait is announced rather than silent.
 */
function RouteFallback() {
  return (
    <div
      role="status"
      className="fade-in flex h-dvh items-center justify-center text-[13px] text-text-subtle"
    >
      <span className="sr-only">Loading</span>
      <span aria-hidden="true">Loading…</span>
    </div>
  );
}

/** The browse page, or the player, depending on whether the URL names an algorithm. */
function RootRoute() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const onNavigate = (to: string) => void navigate(to);

  if (params.has('algo')) return <App />;

  return <Browse pathname={pathname} onNavigate={onNavigate} />;
}

function ArticleRoute() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return <ArticlePage slug={slug} pathname={pathname} onNavigate={(to) => void navigate(to)} />;
}

function CompareRoute() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { a, b } = useParams();
  return (
    <ComparePage
      pathname={pathname}
      onNavigate={(to) => void navigate(to)}
      {...(a ? { initialA: a } : {})}
      {...(b ? { initialB: b } : {})}
    />
  );
}

function LearnIndexRoute() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return <LearnIndex pathname={pathname} onNavigate={(to) => void navigate(to)} />;
}

function RoadmapRoute() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return <Roadmap pathname={pathname} onNavigate={(to) => void navigate(to)} />;
}

function CatchAllRoute() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return <NotFound pathname={pathname} onNavigate={(to) => void navigate(to)} />;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route path="/learn" element={<LearnIndexRoute />} />
        <Route path="/learn/:slug" element={<ArticleRoute />} />
        <Route path="/roadmap" element={<RoadmapRoute />} />
        <Route path="/compare" element={<CompareRoute />} />
        {/* Aliases, so a link written either way lands in the same place. */}
        <Route path="/compare/:a" element={<CompareRoute />} />
        <Route path="/compare/:a/:b" element={<CompareRoute />} />
        <Route path="*" element={<CatchAllRoute />} />
      </Routes>
    </Suspense>
  );
}

export { Browse, NotFound };
