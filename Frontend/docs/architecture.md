# Architecture

A short map of the codebase and the reasoning behind its load-bearing decisions.
`plan.md` is the *why*; this is the *what*, for someone about to change it.

---

## `--step-beat`: one step, one moment

The product's claim is that the animation and the code are the same program, and
until now the UI asserted that only *structurally* — a highlighted line, a sentence
about it, a data structure that moved. Three **separate** animations with three
different durations (220ms for the note, 600ms for the line flash, and the data's
own) meant that on every step the three responses arrived slightly apart, and the eye
read them as three unrelated updates that happened to be nearby.

`--step-beat` (260ms) and `--step-ease` in `index.css` are now shared by everything
that reacts to a step:

| Element | Animation |
| --- | --- |
| the narration card's accent bar | `line-locate` (keyed on `index`) |
| the narration sentence | `note-enter` |
| the active code line's accent bar | `line-locate` + `line-flash` |

So on a step change the sentence, the bar beside it and the line it describes all
start and finish together. That is the whole thesis expressed as a timing and colour
relationship — the only form of it a user can actually perceive, and the reason the
narration card carries an accent thread at all when the code panel 700px away
carries the same colour.

`line-flash` was also retimed from 600ms. At 600 it was still fading when the next
step's flash began, so consecutive steps smeared together and a fast reader never
saw it reach the resting highlight — it read as a permanent tint rather than a flash.

---

## The two contracts

Everything in this app descends from two contracts. If you understand these, the
rest is detail.
### 1. The trace contract — animation

An algorithm never touches the screen. It is a pure generator that yields
`Frame` objects, each an immutable snapshot of the data structure at one moment,
tagged with the **semantic step** that produced it.

```
AUTHOR (lazy)          MATERIALISE (eager)        PLAY
Generator<Frame>  ──►  Frame[]                 ──►  scrub index
pure, no DOM              bounded, seekable          O(1) both ways
```

Two properties do all the work:

- **Snapshots, not deltas.** Stepping backwards is `index--`. Scrubbing to frame
  N is `trace[N]`. That is the entire reason for eager materialisation, and it is
  why inputs and frame counts are capped.
- **Named highlights, not fixed fields.** `highlight: { window: [2,3,4] }` rather
  than `active` / `compare` / `sorted` booleans. Adding "highlight the current
  sliding window" or "the elements Quick Sort has already picked" is a new *key*,
  not a new field, a new renderer, and a new colour. This is what lets 50+
  algorithms share one viewport per family.

Files: `src/core/trace/types.ts`, `materialise.ts`, `player.ts`.

### 1a. The colour contract — what a highlight *means*

A highlight key is a name, and a name has to mean the same thing on every
algorithm or it teaches nothing. So the vocabulary is closed and ordered:

```
PALETTE_ORDER (core/trace/types.ts)   35 names, strong → mid → muted
        │                             index == colour rank
        ▼
STYLES (features/viewport/palette.ts) 35 styles, same order
        │
        ▼
five classes per style: bg + fill + text + ink + border + stroke
        DOM <──────────────► SVG
```

The rank order is the point. When several groups cover one cell the lowest rank
wins, so `compare` beats `sorted` and the specific thing happening now is never
hidden by the broad background state.

Three things about this are not obvious, and all three were learned by breaking
them:

- **An unknown key is not an error, it is a collision.** `highlightRank` returns
  `PALETTE_ORDER.length` for a name it does not know, which indexes modulo the
  style count and lands on rank 0 — the `answer` colour. Ten algorithms were
  painting `settled`, `relaxed` and `pivot` in the same amber. A contract check
  now rejects any key outside the vocabulary.
- **The DOM and SVG class families are different properties, not synonyms.**
  `bg-*` sets `background-color`; an SVG shape is painted with `fill`. So styling
  a `<circle>` with `bg-amber-400` leaves it black. `text-*` sets `color`, which
  SVG text does not read either. Four viewports rendered every node as an
  unlabelled black dot, and nothing failed, because a black dot on a dark canvas
  is not an error — it is just missing. Hence `fill` (shapes, paired with `bg`),
  `ink` (text, paired with `text`) and `stroke` (paired with `border`).
- **Class names must be literal in the source.** Tailwind finds utilities by
  scanning source text, so a class assembled at runtime — `text.replace('text-',
  'fill-')` — appears in no file and is never emitted. The palette spells all
  thirty-five styles out, and a test asserts the derivations *match* the literals
  so they cannot drift while staying greppable.

What is guaranteed is deliberately the narrow, honest version: **two groups
visible in the same frame never share a colour**, checked against every frame of
every trace. Globally distinct colours across 35 ranks is not a thing a student
can hold in their head, and a palette that claims otherwise is lying. Hues are
reused across tiers; the muted tail is a slate ramp for the same reason.

### 2. The anchor contract — code

A frame names a *step* (`'compare'`, `'swap'`, `'relax'`). Every language version
of the algorithm marks the corresponding source line with a trailing
`@anchor compare` comment. `core/code/anchors.ts` turns those into line ranges, so
the highlighted line in Python and the highlighted line in Java are provably the
same step.

This is the difference between a visualiser and a code browser with a play button.
It is also the reason the *shown* code is a clean standalone implementation rather
than the generator itself: a generator threaded with
`yield { kind: 'array', highlight }` is unreadable, and showing it would teach the
vis visualiser, not the algorithm.

The cost of keeping two artefacts honest is paid by the **verification harness**
(§5.4 of the plan), which executes all four languages and diffs the results.

Files: `src/core/code/anchors.ts`, `src/core/algorithms/*/**.ts`, `tools/verify/`.

### 3. The input contract — how a student brings their own data

An algorithm declares the shape of its own input and a set of presets, so a new
algorithm never needs a new form control. `InputSpec` is that declaration, and it
has been on all 56 modules since the beginning — what was missing was the thing
that *renders* it, which is why the editor did not exist until now and why adding
it required editing zero algorithm modules.

```
   AlgoInput ──seedFieldText──► text ──parseFieldText──► values
                                        │
                                        └──inputSpec.build──► AlgoInput ──► run
```

**The editor only ever holds text.** One uniform representation for all six field
kinds, so there is no per-kind state to keep in sync, and what the student sees in
the box is literally what gets parsed. Numbers, strings, words, keys and graphs
are all a `<textarea>` plus a parser; a graph is an edge list, not a
drag-to-connect canvas — which is faster to type, keyboard- and screen-reader
navigable, and matches how people write a graph down when thinking about one.

**`InputSpec` has `build` but no `read`, and that asymmetry is deliberate.** The
obvious fix is to add an input → fields direction to the interface, which would
mean editing all 56 modules to satisfy a new required member — for something
derivable from the `AlgoInput` union alone. `seedFieldText` derives it instead,
which is why the reverse direction cost nothing and the forward direction keeps
being a one-liner per algorithm.

Three things in that file are worth knowing before changing them, and all three
were found by the round-trip test rather than by reading the code:

- **A `words` field splits on newlines and commas, never on spaces.** A `words`
  input is not a list of atoms: `lcs` ships `['the quick fox', 'quick brown fox']`,
  and splitting on whitespace turned two sentences into six words and silently
  changed the algorithm's input.
- **A numeric node name in a graph is that node's literal number.** Numbering
  purely by order of mention is simpler and wrong in a way that is hard to see: it
  renumbers a preset's graph into a *different numbering of the same graph*, so
  the topology survives and the labels silently do not. Node labels are indices
  rather than the names typed, deliberately — the code listings say `adj[0]`, and
  printing `n0` in the viewport would reintroduce by the back door the exact
  mismatch the anchor contract exists to prevent.
- **An edge list cannot mention an isolated vertex**, so `edgeListText` emits a
  `nodes: N` header when one exists. Without it, opening the editor on
  `topological-sort`'s nine-node preset silently dropped a node, because that
  preset has a vertex which is reachable but reaches nothing.

`detect-cycle` declares a `cycleBack` field that its own `build` discards — the
generator reads it from `params`, because the cycle is a property of the list's
wiring rather than of its values. The editor pushes such a field at *both* the
input and the parameter, or the control would silently do nothing.

**The round trip is the contract, and it is tested against everything.** Seed from
a real preset, parse it back, build, and require the input you started with — for
every registered algorithm on every preset. That is what stops the positional
rules above from being clever-but-only-sometimes-right, and it is what makes
"open the editor, change one number, run" trustworthy rather than a trap.

Files: `src/core/input/fields.ts`, `src/core/input/fields.test.ts`,
`src/features/input/InputEditor.tsx`.

### 4. The URL contract — a run is a link

`urlState.ts` could encode an `AlgoInput` before the editor existed, and nothing
called it, so the encoder was dead code: a student who typed their own array could
not reload, share, or send the link. `useUrlSync` is the other half.

Three decisions in it are not obvious:

- **A custom input is only encoded when it differs from the active preset.**
  Otherwise every ordinary link carries a base64 copy of an array the `preset`
  already names — long, unreadable, and worse, a later edit to that preset's data
  would silently not apply to old links. The test is a *value comparison* against
  the preset, not a flag, because a flag has to be set by every path that can
  change the input and the one that forgets is the one that lies to the user.
- **Algorithm changes push a history entry; everything else replaces.** The frame
  index changes up to 60×/second during playback, so pushing per frame makes the
  Back button useless a second after you press play. But "go back to the
  algorithm I was on" is a real expectation, and `replaceState` alone drops it.
- **The read happens before the write subscription.** A subscription that fires
  before the restore completes writes the default preset over a custom input from
  the link, and the link quietly stops working.

And now that there is a router, one more that matters:

- **The router owns the path; `useUrlSync` owns the query string.** They do not
  fight, because a `replaceState` that changes only the query does not fire
  `popstate` — so the router's location goes stale, and nothing on the player route
  reads `location.search` through it. The player reads its state from the store and
  decides which page to render from the *presence of the `algo` key*. A real
  navigation fires `popstate`, the router updates, and `useUrlSync`'s listener
  re-applies the URL to the store. That is also why the per-frame writes use
  `replaceState` and not `pushState`.

Files: `src/lib/urlState.ts`, `src/features/player/useUrlSync.ts`,
`src/app/routes.tsx`.

### 5. The logo

`public/favicon.svg` is three array cells with a named pointer over the middle one
— a paused frame of the product rather than a label for it. The two outer cells
carry the load: lighter is "already walked", darker is "not reached yet", which is
what makes it read as *step 2 of 3* instead of as a bar chart, which is what every
dashboard uses.

Three decisions came from rendering it at 16/20/24/32/48px and looking, rather than
from taste:

- **Three cells, not five.** At 16×16 — a real browser tab — a five-cell row puts
  the gaps under one device pixel and the array collapses into a grey smear.
- **A 0.5 blur on the active cell, not 1.2 and not none.** This is the one
  decoration in the file and it was nearly a decoration that cost the mark its small
  sizes. The cells are 6 units wide with 2.5-unit gaps, so a 1.2 blur bleeds about
  half a pixel into each side of every gap at a 16px render and the row stops being
  three cells. At 48px that same blur is the best-looking version, which is exactly
  what makes it dangerous: a change that improves the screenshot and ruins the
  favicon. SVG cannot branch on rendered size, so the value has to be safe at the
  smallest one. At 0.5 the 16px row is three distinct cells *and* the 48px version
  still has a warm halo.
- **The cells stay equal height.** An earlier idea made them a staircase to suggest
  progress, and it was dropped on inspection: every array cell this app draws is the
  same height, so uneven cells would make the logo misrepresent the thing it
  depicts. A mark that flatters itself at the expense of being accurate is the
  wrong trade in a project whose entire claim is that the picture and the code agree.

`public/icon-maskable.svg` is a separate file, not a copy, because Android may eat
everything outside the central 80% and the regular favicon fills its rounded
square edge to edge — handing that over as `purpose: "maskable"` promises a safe
zone it does not have. The sidebar references the favicon by URL rather than
inlining a `<Logo />` component, so there is one copy of the geometry in the repo
instead of two that can drift.

---

## Directory map

```
src/
├── core/                     ← PURE. No React, no DOM. Enforced by Biome.
│   ├── trace/                frame types, materialiser, transport reducer
│   ├── code/                 anchor parsing, Lesson type, stripMarkers
│   ├── algorithms/
│   │   ├── types.ts          AlgoDef, Preset, Expectation, ParamSpec
│   │   ├── catalog.ts        pure metadata — sidebar + browse grid data source
│   │   ├── registry.ts       eager static imports; Node-only
│   │   ├── contract.test.ts  the contract test (see below)
│   │   └── <family>/         one file per algorithm
│   ├── learn/                guide articles as PLAIN DATA (no React, so the
│   │   ├── types.ts          article + block schema; the `stepper` block is
│   │   │                     what lets a guide embed its own visualisation
│   │   ├── articles/         the prose, grouped by conversation:
│   │   │                     sorting · foundations · techniques · greedy ·
│   │   │                     graphs · trees · heaps · stacks · linked-lists ·
│   │   │                     complexity
│   │   ├── index.ts          the registry: order, grouping, labels
│   │   └── learn.test.ts     every algoId / preset / table / cross-link is checked
│   └── input/                seeded RNG, input shapes, generators,
│                             fields.ts (the custom-input parser)
│
├── app/                      ← routing and the pages
│   ├── routes.tsx            the route table — one place to read what is where
│   ├── TopNav.tsx            the site header, on every route
│   ├── PageShell.tsx         h-dvh + overflow-y-auto; the scroll container
│   ├── Browse.tsx            the selection page (`/`)
│   ├── FamilyRail.tsx        14 families, counts + blurbs
│   ├── AlgoRow.tsx           one algorithm in the browse list
│   ├── FamilyGlyph.tsx       a shape mark per frame kind
│   ├── LearnIndex.tsx        the guides index (lazy)
│   ├── ArticlePage.tsx       one guide (lazy)
│   ├── ComparePage.tsx       two algorithms, one input (lazy)
│   ├── NotFound.tsx          the `*` route
│   ├── CommandPalette.tsx    ⌘K shortcut + lazy wrapper (see below)
│   ├── CommandPaletteDialog.tsx  the dialog itself — lazy, because it reaches
│   │                         ARTICLE_LIST and therefore all the prose
│   └── library.ts            favourites + recently viewed (localStorage)
│
├── features/                 ← everything that knows about React
│   ├── player/               store, transport, narration, keyboard, URL sync,
│   │                         Scrubber (the shared range-with-a-track)
│   ├── viewport/             one component per frame kind, each lazily loaded
│   ├── learn/                ArticleBody (blocks → elements) + EmbeddedStepper
│   ├── code-panel/           the anchor ↔ line highlight
│   ├── controls/             header: complexity, presets, params
│   ├── input/                the custom-input editor (lazy)
│   ├── nav/                  the algorithm index
│   └── registry/loaders.ts   lazy algorithm loading (import.meta.glob)
│
├── workers/trace.worker.ts   off-main-thread materialisation
├── lib/                      cn(), URL state, storage, inline markup
├── App.tsx                   the visualiser — a ROUTE, not the application
└── main.tsx                  BrowserRouter + the route table

tools/
├── verify/                   the 4-language parity harness
│   ├── harness.ts            compile, run, diff, report
│   └── drivers/              one shared driver per language
├── budget.mjs                initial-payload budget (walks the import graph)
└── checkTokens.mjs           token utilities actually emit CSS

tests/
├── e2e/                      Playwright: app.spec.ts (the player), pages.spec.ts
├── visual/                   screens.spec.ts (player), pages.spec.ts, harness
└── parity/                   the whole-curriculum parity run
```

### Routing, and why `/` is conditional

The app has six routes. The non-obvious one is the root, which renders the browse
page at `/` and the visualiser at `/?algo=<id>` — the split is **the presence of the
`algo` key**, not the path.

`App.tsx` is therefore a route and not the application. `main.tsx` owns the router,
`app/routes.tsx` owns the table, and everything else is handed an `onNavigate`
callback rather than calling `useNavigate` itself, so cross-page transitions are all
visible in one file.

What is eager is as deliberate as what is lazy. `App` — the player — is **not**
code-split, because it is the default destination for every link this app has ever
shared and lazy-loading it would add a round trip to the most common entry in the
product. The pages pay instead: `/learn`, `/learn/:slug` and `/compare` each carry a
trace builder, and none of that is in the entry chunk.

The one that was *not* obvious is `LearnIndex`. It is a list of links, but it
imports the article registry, and that statically imports every article — so an
eager `LearnIndex` put ~40 kB of prose into the entry chunk where every visitor paid
for it. Same class of mistake as the `registry.ts` import below, same place it was
found: `tools/budget.mjs`.

---

## `core/` is a hard boundary

`src/core/` may not import React, the router, the store, the animation library, or
anything from `node:*`, and may not touch `document`, `window.x`, `localStorage` or
`Math.random()`.

One rule, three things it buys:

1. Algorithms test in milliseconds with no jsdom.
2. `core/` could be lifted into a standalone package or a Worker untouched.
3. A hard stop on the most common way visualiser codebases rot — visualisation
   logic bleeding into algorithm logic.

`Math.random` is denied for a different reason: a golden trace snapshot is only
meaningful if the input that produced it is reproducible, and a share link is only
meaningful if the seed reproduces the run. All randomness goes through
`core/input/rng.ts`, seeded, and the seed is in the URL.

### Enforced twice, and the second time is the one that counts

`biome.jsonc` carries these rules as overrides — **and the config file is named
`.jsonc`, not `.json`, for a reason.** A `//` comment inside `biome.json` is a
parse error. Biome falls back to defaults. Every override in the file silently
stops applying while the config still looks perfectly correct, and a comment sits
there explaining a rule that is not running.

That is the worst class of enforcement failure: green CI, no protection, and false
confidence. It happened here, and nothing failed.

So the boundary is *also* enforced by `src/core/boundary.test.ts`, which reads the
source tree and cannot be switched off by a stray character. It costs milliseconds
and needs no configuration. Belt and braces is not paranoia when the failure mode
is silent.

The test scans source with comments and string literals removed
(`src/lib/stripSource.ts`), for a related reason: a naive grep fires on the
algorithms' own narration — "so the window is empty and the answer is -1" got
reported for touching a browser global. A rule that cannot tell code from prose is
a rule nobody keeps. The stripper recurses into template interpolations, because
`${cond ? 'the window is empty' : 'ok'}` hides prose one level down.

Three limits worth stating, each found by the rule firing on correct code:

- Biome's `noRestrictedGlobals` **cannot** express `Math.random` at all: it matches
  bare identifiers, not member expressions. That is exactly why the test exists
  rather than the lint rule.
- `window` is deliberately *not* in the static denylist. Half this curriculum is
  sliding windows, so `const window = s.slice(...)` is ordinary code, and a static
  rule cannot tell that local from the global. A real `window` access in `core/`
  cannot survive anyway — `core/` runs in a Worker and in Node, neither of which
  has one, so the unit suite fails on the spot. The runtime already covers it;
  the static rule would only add false positives. `document`, `localStorage`,
  `sessionStorage` and `navigator` *are* denied, because no algorithm has a
  legitimate local by those names.
- The stripper is a scanner, not a parser. Regex literals containing quotes could
  confuse it. No algorithm here uses one, and the failure mode is a false positive
  (a test failure someone investigates), not a silently missed violation.

---

## Rendering: DOM, at every size

Everything is DOM. There is no canvas, no `getContext`, no second rendering path.

This section used to promise a second, canvas-based renderer above 150 elements,
with a table, a claimed-measured crossover, and a note that `ArrayView` and
`GridView` were "structured so a canvas implementation can slot in behind the
same props". None of it was true — the renderer was never built, and the same
claim appeared in `InputEditor` and in twenty-one algorithm `help:` strings.
Documentation for a feature that does not exist is worse than a missing feature,
because it is indistinguishable from a bug report: a student reads it, tries it,
and concludes the app is broken.

So: what actually happens above 150 elements?

| Elements | What happens |
| --- | --- |
| ≤ 40 | One cell per element, labelled, room for a pointer marker above it |
| 41–150 | Cells shrink toward a 12px floor, then drop to a compact grid with no labels |
| > 150 | The same, plus a warning: cells are unreadable and `MAX_FRAMES` (50,000) can truncate the run |

The real ceiling is `MAX_FRAMES` in `src/core/trace/materialise.ts`, which
truncates rather than throws. That is the limit worth documenting, because a
truncated trace ends mid-algorithm with nothing on screen saying it was cut
short.

If a canvas path is ever added, the invariant to preserve is that it is a
*rendering* change only: the same frames, the same highlight keys, the same
`role="img"` descriptions, and the same palette. The palette is the hard part —
its 33 colours are Tailwind class strings, not values, precisely so that a
`fill-` variant can be derived, and `src/features/viewport/palette.test.ts`
enforces that by reading the file from disk.

### 6.1a The viewport must not move unless the algorithm moved it

The step narration is a **fixed-height** card, and this is the one layout rule in
the shell that is not negotiable.

Narration length varies enormously — across the 1,913 frames of a default trace
the median note is 168 characters and the longest is 371. A content-sized
narration block therefore grew and shrank on *every single step*, dragging the
viewport below it up and down with it. On an application whose entire purpose is
that things change on screen, a panel that moves for no reason is worse than
useless: the student cannot distinguish "the data structure changed" from "the
layout breathed", and the one element that has to be trustworthy stops being so.

So the narration is a fixed `h`, the sentence is clamped to the lines that height
affords (`line-clamp`, which truncates visually and leaves the full text in the
DOM for screen readers), and the variable chips sit in a single `flex-nowrap` row
that scrolls sideways rather than wrapping. Wrapping is the same bug by another
route: six variables add a line, four remove it.

This is asserted in the e2e suite, because it is invisible to every other layer —
nothing about it is wrong, only its geometry:

```ts
// the viewport does not resize as the narration changes
for (const frame of [0, 1, max / 3, max / 2, max - 1, max]) {
  await scrub.fill(String(frame));
  seen.add(await regionHeight());
}
expect(seen).toHaveLength(1);
```

Two more layout bugs from the same family are asserted there too, and both were
found by a student rather than by a test:

- **The sidebar toggle was dead on desktop.** The base class list carried
  `lg:translate-x-0`, and a `lg:` variant beats an unprefixed one in the
  generated stylesheet *regardless of the order they are typed in* — so the
  `-translate-x-full` applied when `sidebarOpen` was false was silently
  overridden. Desktop now collapses `width` instead of translating, and `open` is
  honoured at every breakpoint. The general lesson: in a utility-class codebase,
  "which rule wins" is a question about the generated stylesheet, not about the
  order you wrote.
- **The code panel could not scroll vertically.** Its scroll container was a
  plain block with no height of its own, so it grew to fit the listing and
  `overflow-auto` never engaged on that axis. Horizontal scrolling *did* work —
  the `<pre>` is `min-w-max`, and width *is* constrained — which made it look like
  a working scroll box that happened to scroll the wrong way. A 90-line listing
  then overflowed its `overflow: visible` wrapper and painted straight over the
  explanation panel. The fix is one class: `h-full`, against a parent that is
  `min-h-0 flex-1` and therefore has a definite height.

### Re-render discipline

The frame index changes up to 60×/second. Naive subscription re-renders
everything per tick. So:

- Zustand with narrow selectors. A viewport subscribes to `useCurrentFrame`; the
  code listing subscribes to `useCurrentAnchor` — because a swap emits *two* frames
  on one line, and re-highlighting twice is both wasted work and a visible flicker.
- The transport bar subscribes to `useTransportFlags` (derived booleans that
  change at human speed), never to `index` directly.
- Selectors that build a fresh object **must** be wrapped in `useShallow`. Without
  it Zustand's `Object.is` comparison sees a change on every notification and
  React throws "maximum update depth exceeded". This is the single most common
  Zustand mistake in this codebase; it is commented at the one place it applies.

### The transport's one row or two, and why a container query

The transport was two rows at every width: controls, then a scrubber. It is now one
row whenever they fit and two when they do not.

The width that decides it is the **middle column's**, which is
`viewport − 288 sidebar − clamp(360px, 32vw, 560px) code panel`. That expression is
not monotonic in the viewport — the code panel's own clamp widens again past 1536 —
so an `xl:`/`2xl:` variant would be a hardcoded guess that is right at some widths
and wrong at others. `<main>` is therefore `@container` and the row switches at
`@min-[620px]` of its own width: the number at which the controls plus a usable
scrubber actually fit, which is also the property being measured.

Measured after: transport 99px → 65px and the visualisation region 552 → 586 at
1440, 1920 and 2560; unchanged at 1280/1281, where the column is 582px and two rows
is the honest answer.

**At 390 the transport grew from 99 to 127.** That is a deliberate trade, not an
oversight: the controls row is `flex-wrap`, so below the container threshold the
speed selector wraps onto its own line instead of being pushed off the right edge
and clipped. Before, the speed control was *invisible and unreachable* on a phone
and the 99px was bought with a control that could not be used. The visualisation is
still 468px on a 390×844 screen.

### The code explanation, moved inline

The per-anchor note used to be a collapsible pane pinned below the listing, up to
160px — over a third of a laptop's listing. It now renders in the flow, directly
beneath the last line of the active range, which returns all of that to the code.

Three things had to be true for that, and each was found by measuring rather than by
reading:

- **It must be a sibling of the row, not a child.** Inserted as a child of the row
  `div` — which is `flex` — it became a third flex item and sat *beside* the code.
  Measured: the row's text ended at x≈1215 and the note occupied
  `1215,240 1312x49`, pushed to the right of the line it was meant to follow. It is
  now wrapped in a `Fragment` so it stacks underneath.
- **It must override `white-space`.** The listing is a `<pre>`, so the note inherited
  `pre` and its prose never wrapped.
- **It needs a definite width.** The `<pre>` is `min-w-max`, so a block child's
  max-content *is* its unwrapped length — the 1312px note was widening the whole
  listing. `w-[56ch]` caps its contribution; the code, which is longer in every
  listing that scrolls horizontally, keeps deciding the width. Merge Sort's listing
  went from 1563px to 743px once this was fixed.

And the default flipped to **collapsed**. Pinned below the listing, expanded-by-
default was affordable because it did not push the code. Inline, it pushed the code
down by up to 110px. Collapsed shows two clamped lines attached to the line, which is
strictly better than the old arrangement where collapsed meant nothing but a
`line 8 · base-case` label.

`data-anchor`, `data-line` and `data-explained` are unchanged and are contracts, not
instrumentation: the e2e suite proves the *same step* is highlighted in all four
languages by comparing `data-anchor` across a language switch, so all three have to
exist whether or not the note is expanded.

### A layout rule worth knowing

A percentage height does **not** resolve against a `flex: 1 1 0%` parent. Filling
remaining space with `h-full` silently collapses a panel to its content height,
and every bar chart inside then sizes its bars against the wrong box. Use
`flex-1` with `min-h-0` throughout. This cost an afternoon once.

### Columns, drawers, and the rule between them

`src/features/player/panes.ts` owns one invariant:

> At most one pane may be a **drawer** at a time. Any number may be **columns**.

Getting there was not a styling change. The shell used to hold two independent
booleans, `sidebarOpen` and `codeOpen`, both initialised `true`. Below `xl` the
code panel becomes a `fixed` drawer while the nav is still a column, so the store
said "both open" and the DOM said "one column and one drawer on top of it". A
phone visitor arrived to a 288px nav drawer, a 359px code drawer, a scrim, a 403px
header and a 214px visualisation, all at once, with the transport bar behind
them.

The obvious fix — a single `Overlay = 'none' | 'nav' | 'code' | 'input'` union —
is **also** wrong, and wrong in the direction that breaks the product. It can only
describe one visible pane, but at 1280px and above the nav and the code panel are
both meant to be visible: that is the product claim, that the animation and the
code are the same program. A type that cannot express "two panes visible" gets
that pane deleted to make the type compile. So the distinction that earns its
keep is column-versus-drawer, not which-pane-is-open.

| Width | Nav | Code |
| --- | --- | --- |
| >= 1280 (`xl`) | column | column |
| 1024–1279 (`lg`) | column | drawer |
| < 1024 | drawer | drawer, one at a time |

The middle band is why the rule is about drawers. There the nav is a genuine
column and the code panel is a drawer over it, so two panes are visible at once
and only one is an overlay; a rule of "at most one pane visible" would have
dismissed the nav in a width that has room for it.

Two things that are *not* in `panes.ts`, deliberately:

- **The breakpoints as media queries for the store.** `isDocked()` asks
  `matchMedia` per call rather than caching a listener, because a stale cache is
  a layout bug that only reproduces on some machines. It is called on user action,
  not per frame.
- **A resize hook.** The store enforces the rule when a *pane* is opened or
  closed, and a resize is not that. `App.tsx` subscribes to `change` on both
  queries and calls `syncPanesToWidth()`, because opening both columns on a
  desktop and then dragging the window narrow would otherwise reach the forbidden
  state by the one route that bypasses a setter.

`reconcilePanes` is a pure function with the viewport injected, and it is tested
exhaustively — every starting state, every target, every pane against every
breakpoint arrangement — because the rule is small enough to enumerate and a
combinatorial invariant cannot be proven by example.

### The header's height is unconditional

The header used to be four rows and was the largest thing on screen with nothing
to do with the algorithm: 281px of a 900px window at 1440 wide, 315px at 1280, and
403px of an 844px phone. Worse, its height was a *function of the window's width*,
non-monotonically — 236px at 1200, 315px at 1280, 236px at 1920 — which breaks the
principle in §6.1a: the one element on screen that should only change because the
algorithm changed it was changing because the browser was resized.

Closing that took three fixes, and each one only moved the problem somewhere
else, which is the argument for sweeping a range of widths in a test rather than
checking two:

1. The complexity row used `flex-wrap`, and wrapped at some widths.
2. `flex-nowrap` + `overflow-x: auto` moved the non-determinism to the
   **scrollbar**, which occupies layout space and so appeared only when the
   toolbar overflowed — which depended on whether the code panel was a docked
   column taking 461px. `scroll-fade-x` (`src/index.css`) scrolls without
   occupying a line, and pays back the missing scrollbar with a masked fade.
3. Even then each parameter label could still shrink, and a flex row that *can*
   shrink wraps rather than overflow, so a label wrapped to two or three lines
   inside its own box. `shrink-0 whitespace-nowrap` on the labels closed it.

It is now a measured 77px at every width from 1024 to 2560, for every algorithm
checked. The general lesson: **in a flex row, `flex-nowrap` alone does not give
you a constant height.** It stops the *row* wrapping; it says nothing about items
that can shrink and wrap internally.

Everything explanatory — summary, complexity, traits, "when to use it" — moved
into an **overlay** disclosure rather than an inline one, for the same reason the
input editor is an overlay: an inline expansion would push the visualisation down
when opened. That choice is what makes the header's height unconditional, since
opening the panel cannot change it and neither can resizing the window.

---

## The viewport registry

`src/features/viewport/Viewport.tsx` is the single place frames become pixels.
Its default branch narrows to `never`, so adding a ninth frame kind to the union is
a compile error until a renderer exists:

```tsx
default: {
  const exhaustive: never = frame;
  return <NoViewport frame={exhaustive} />;
}
```

`NoViewport` is unreachable in theory. It exists because "unreachable with a
visible message" beats an unhandled render crash if the union ever grows a member
and the check is bypassed.

Frame kinds: `array`, `linear`, `linked`, `hash`, `tree`, `trie`, `graph`, `grid`.

**All eight renderers are lazily loaded.** A given run needs exactly one — `ArrayView`
draws arrays and has nothing to say about a trie — and they are ~2,000 lines
together, so importing them statically meant every visitor downloaded all eight to
look at a bar chart. The `Suspense` boundary sits *around* the switch rather than
inside each branch, so there is one fallback instead of eight to keep identical, and
any two of them drifting would be indistinguishable.

The fallback occupies exactly the box the renderer will, because a visualisation that
changes size for any reason other than the algorithm is a bug the student can see.
It is deliberately *not* a skeleton of grey bars: a skeleton implies a known shape,
and a graph or a trie has no shape to guess. A placeholder that looks like the real
thing and then becomes something else is worse than an honest blank.

---

## Trace construction: one path, two backends

`src/features/player/traceBuilder.ts` decides *how* a trace gets built:

- **Synchronous** below 500 elements. A worker round trip has real latency, and
  paying ~5–15 ms for an 8-element bubble sort would make the common case feel
  *less* responsive.
- **Worker** above 500, where draining the generator would drop frames.

Both produce an identical `Trace`, so the choice is invisible. A worker that
fails to start falls back to the synchronous path — it is an optimisation, never
a dependency.

A `requestId` guards against out-of-order completion. Without it, switching
algorithms quickly leaves an older worker response landing after a newer
synchronous one, and the viewport briefly shows the previous algorithm's data —
the exact class of bug that makes people distrust a visualiser.

---

## Loading: catalog vs. registry

Two files that look redundant and are not:

- **`catalog.ts`** — pure metadata: id, title, category, summary, viewport, level,
  tags. No generators, no source strings. This is the *entire* data source for the
  sidebar, which is why opening the app does not download 50 algorithms' code and
  200 source listings.
- **`registry.ts`** — eager static imports of every module. Node-only: the test
  suite and the verification harness.

The browser fetches one module on demand via `import.meta.glob` in
`features/registry/loaders.ts`. The filename is the id. The contract test asserts
the catalog and the modules never drift.

`import.meta.glob` emits a dynamic import for *every* match and the bundler
resolves them all at build time, so test files must be excluded **in the glob**
(`['…/**/*.ts', '!**/*.test.ts']`), not in a runtime `if` — a `.test.ts` left in
the graph fails the production build on one of its own imports.

The catalog now also carries each algorithm's `complexity`, which the browse list
shows. It did not before, and the alternative was for that list to load all 66
modules to read two numbers — precisely what the boundary test forbids. So the field
is *duplicated* into the generated file: about 2 kB across the catalog, against 371
kB for the mistake of importing `registry.ts`. `contract.test.ts` asserts the two
copies agree, and `searchCatalog` reads the numbers too, so searching `nlogn` or
`linear` finds the algorithms that have that cost.

---

## The browse page: rows, a rail, and three things that are deliberately absent

The selection page went through a full rewrite, and the reasoning is worth keeping
because two of the decisions were made *against* an obvious feature that the data
killed.

### What the first version cost

It was a hero, a stats row, a glowing CTA and a wall of 66 cards. Measured on its
own captured baselines: **470px of 900px (52%) of preamble on a desktop, and 610px
of 844px (72%) on a phone** — where you saw one and a half cards, on the page whose
entire job is letting you pick one of 66 things.

It was also the wrong register. The rest of the app is a dense keyboard-driven
instrument, and the front door was a marketing page. `index.css` had already made
that argument in the other direction — *"a pulsing background behind a button is a
well-worn way to make an interface feel like a landing page rather than a tool"* —
and the page then did precisely that. The `glow-breathe` keyframe is still in
`index.css` and is now used nowhere, which is the honest end state for a decoration
that should not have shipped.

### The rail, because fourteen things do not fit in a row of pills

A pill row cannot hold fourteen items without either wrapping — which makes the
toolbar's height a function of the window width, the exact defect `index.css`
documents about the player's control row — or scrolling sideways with the last pill
cut in half. The old page did the latter, and a half-visible "Heaps" reads as a
broken layout rather than as "there is more this way".

A rail holds all fourteen vertically at any width, with room for each one's **count
and blurb**. That is the point: `CATEGORIES` ships a hand-written line per family
("Nodes, edges, traversal", "Trade space for speed"), and a pill said "Graphs" where
a rail says what graphs are, how many there are, and how to get there. It also bounds
the choice — the largest family is ten algorithms, so choosing one means a list that
fits on a screen.

The active indicator is a pseudo-element that scales in, **not** a shared sliding
bar. A sliding indicator has to measure the active item's offset, which fights the
rail's own layout and desynchronises the moment the rail wraps or the window resizes
mid-transition.

### Three things that are absent, on purpose

**A learning path.** The obvious feature, and the data killed it twice. The level
split is **19 intro / 37 intermediate / 10 advanced** — a three-stage path has stage
two as a wall again. And deriving an on-ramp from intro-level algorithms in catalog
order gives bubble → insertion → selection → binary search → linear search → container
with most water: three quadratic sorts running, then straight into two-pointer
container problems. That is not a designed path, it is an accident of ordering, and
presenting an accident as pedagogy is worse than offering no path.

So the only guidance is *true*: where you actually left off, and the family taxonomy
the data already carries. A curated on-ramp would be real content work and a
judgement call; it is not something to invent silently.

**Sticky family headings.** They were, and they broke two e2e tests. A pinned 30px
band sits over the list, so anything scrolled to the top of the container lands
underneath it — including the favourite star at a row's far right, which is
focusable and clickable and then silently is not. The heading still marks the
boundary between families as you scroll, and the rail keeps the current family
visible anyway; pinning bought a little orientation and cost a reachable control.

**A hover translation.** A 2px `translate-x` on the row felt like life and made two
tests fail with *"element is not stable"*. A row is a full-width click target: hover
it near the edge of the viewport, it shifts, the pointer is now over a different part
of it, hover is lost, the transform is removed, it shifts back. The transform
oscillates for as long as the pointer rests there. A human notices this as a row
that resists being clicked; the test noticed it as a timeout. Hover is background and
border only.

### The row's two invariants

**An algorithm name is never truncated.** On mobile the name wraps to two lines
(`line-clamp-2`) rather than truncating, because "Longest Repeating Character
Replacement" is 39 characters and `truncate` would cut a real algorithm's name in
half — which is the failure the whole row was rebuilt to avoid. Below `sm` the meta
block drops to its own line, because the complexity, a ~95px `INTERMEDIATE` label and
the star together leave the title about 60px, and Counting Sort rendered as
**"Countin…"**.

**The favourite star is above the stretched link.** The row is an `<article>` with an
`absolute inset-0 z-0` anchor covering it, so the star needs `relative z-10` or it is
unclickable — the click lands on the link and navigates instead of saving, which is
exactly what the two-target design exists to prevent. Dropping that class during a
refactor made it unclickable, and an e2e test caught it.

It also carries `scroll-margin-top`, on the **button** rather than the row, because
`scroll-margin` resolves against the element being scrolled and the browser scrolls
the *focused* element. With the margin only on the row, tabbing to the favourite of
an algorithm 60 rows down put it flush under the sticky toolbar: focused, visible,
and inert.

---

## The guides: articles that embed their own visualisation

`core/learn/` holds article prose as **plain data** — no React, no DOM — and
`features/learn/` renders it. The split is not tidiness; it is what lets
`learn.test.ts` check every article's `algoId`, every `stepper` preset, every table's
shape and every cross-reference in plain Node, with no DOM.

That test earns its keep because `EmbeddedStepper` *degrades gracefully*. A chunk
that fails to load renders an inline note plus a direct link to the full
visualiser, which is the right production behaviour and a terrible test strategy:
the same tolerance that makes it safe in production also hides a stale preset id
from CI. So the references are checked from the data side, where "does this preset
exist" is a plain lookup.

**Nineteen articles**, ordered as a course rather than a catalogue: sorting first
because it is where an algorithm's cost becomes visible, then the general techniques
(two pointers, recursion, divide and conquer, DP, greedy), then the
data-structure-adjacent algorithms (binary search, hashing, tries), then the families
that had nothing at all — stacks, linked lists, heaps, trees and three graph articles.
Articles are grouped into files **by conversation, not one per file**, so that
"what should I use" and the question that motivates it live together; `greedy.ts`
holds greedy and the DP state shapes for exactly that reason, since the two are the
boundary and splitting them hides it.

Four decisions worth recording:

- **Blocks, not Markdown.** The `stepper` block is the reason. A paragraph saying
  "watch the invariant break" next to a stepper you can drag is the thing a static
  illustration of bubble sort cannot be, and no Markdown dialect carries that. Every
  plugin that tries ends up a `dangerouslySetInnerHTML` island — precisely what the
  rest of the app is careful to avoid.
- **No Shiki in articles.** Four or five explanatory code blocks per article would
  mean four or five more dynamic imports of the grammar, most of a second on a cold
  load, on the page a reader is most likely to arrive at from a search result. Plain
  monospace in a box is legible and free.
- **Not built on `playerStore`.** It is a singleton, it owns the URL, and it owns
  the global keyboard shortcuts. Two of them in one page is impossible, and even if
  it were possible an article's stepper would fight the main player over `Space` and
  `Escape`. So it is deliberately a small, self-contained, read-only player: local
  state, no store, no URL, no global shortcuts.
- **The index badges `hasStepper` from the body, not from `algoId`.** Those are
  different questions: `algoId` means "this article is about exactly one algorithm, so
  give the reader a button into the visualiser", while a `stepper` block means "there
  is something here to step through". They only sometimes agree — `sorting-landscape`
  has three steppers and no `algoId`, because it is about eight sorts and none of them
  individually is the subject. The badge used to read `algoId` and claim the opposite
  of the truth for every technique article, which is worse than no badge.

Compare mode makes the same trade for the same reason — two traces in local state,
one shared transport — with one honest constraint it surfaces rather than hides: the
two algorithms must accept the same *input shape*, or the step counts are not
comparable. A mismatch is stated plainly and both keep their own preset, labelled as
such, because a side-by-side that looks authoritative and means nothing is worse
than one that admits its limits.

---

## Inline markup

`lib/richText.tsx` renders `**strong**`, `` `code` `` and `[label](/href)`, and
nothing else.

It is all-or-nothing on purpose: if either marker is unpaired anywhere in the
string, the **whole** string is emitted verbatim. Half-applying would produce a
sentence with one bolded run and one literal marker pair, which reads as a rendering
bug — whereas a sentence with its markers intact reads as a typo, which is what it
is.

This was written after the first seven articles shipped, all of which reached for
backticks and all of which rendered them literally on screen. Nobody noticed for a
while, which is the same failure mode as the 28 narration notes that shipped with
visible `**` before this module existed: prose is rarely read by the person who
wrote it, so a rendering defect in prose is invisible to review. The article
baselines are what caught it this time.

There is now a third construct, `[label](/learn/some-article)`, and it was added for
the same reason: `sorting.ts` already ended with a cross-reference written as
Markdown link syntax, and it rendered **as literal Markdown** — brackets, parens and
all — because only the two inline markers above were understood. Nothing failed. A
literal string is a valid string, and a page of prose still looks like a page of
prose; the only symptom was a reader clicking nothing.

A URL is the one piece of prose that is not inert, so the new construct has two rules:

- **A link is markup only if well formed.** `[text](/learn/typo` has no closing
  paren, so it stays visible as the typo it is. Guessing would produce a broken link
  that looks deliberate.
- **The href must be a path on this site** — `startsWith('/')` and not
  `startsWith('//')`. Anything else is emitted verbatim instead of becoming an anchor.
  There is nothing to sanitise *today*, because every string is authored in-repo, and
  that line is what keeps it true the day one is not.

What it deliberately does not touch: `a[mid]` is not a link and `[low, high)` is not a
link. Recognition needs the complete `](…)` triple, so the bracket-heavy prose every
article about arrays is full of renders exactly as before — a rule that claimed every
`[` as markup would have broken the binary search guide to add links to the sorting
one. `learn.test.ts` now checks that every `/learn/…` in every article resolves, which
is the check whose absence let the original rot.

---

## The prose is not in the entry chunk

Nineteen articles is 52.6 kB gzip of text, and it has to stay out of the entry chunk —
not because it is large in the abstract but because every visitor pays for the entry
chunk and most of them never open the guides.

Getting there took two passes, and the second one is the interesting one:

- **`LearnIndex` is lazy.** This was the first fix, and `routes.tsx` carries a long
  note on it: the page looks like a list of links, but it imports the article
  registry, which statically imports every article.
- **`CommandPalette` is lazy, and the wrapper is separated from the dialog.** The
  palette searches articles, so it needs the same registry — and `Browse.tsx`, which
  is eager because it is the home page, renders the palette. So the leak reopened,
  quietly, when ⌘K gained article search. Growing the section from seven articles to
  nineteen turned a hidden cost into a measured one: **74.9 kB → 113.7 kB gzip on the
  entry chunk, 235.7 kB initial against a 200 kB budget.**

`CommandPalette.tsx` is now the shortcut hook plus a `lazy()` wrapper that gates on
`open` before rendering; `CommandPaletteDialog.tsx` is the dialog. The gate matters:
the dynamic import inside `lazy()` fires on first *render*, so an always-mounted
Suspense boundary would fetch the chunk on every page and reproduce the original bug
one level down.

What it costs is one chunk fetch on the first ⌘K of a session — which happens to be the
same chunk `/learn` loads — in exchange for not charging everyone for nineteen
articles. The alternative, splitting article metadata from article bodies, duplicates
every title and dek in the repository to save one keystroke. Neither `learn.test.ts`
nor `boundary.test.ts` can catch this class of bug: every import involved is
legitimate on its own, and only the *timing* is wrong. `tools/budget.mjs` is the only
thing that sees it, which is the argument for keeping it.


---

## The verification harness

`tools/verify/harness.ts` is the feature that makes the code panel trustworthy.

For every algorithm, every preset, every language with a toolchain present:

1. Write `lesson.code[lang]` to a temp file.
2. Append the **shared** driver for that language.
3. Run it; read `output.json`.
4. JSON-compare against `expectation.result`.

```
tools/verify/drivers/
├── python/driver.py          ~10 lines. import, call, dump.
├── java/runner.template.java reflection + a generic JSON→declared-type coercer
├── cpp/driver.cpp            ~70 lines of minimal JSON, then template deduction
└── javascript/               in-process, in a node:vm sandbox
```

Notes that are not obvious:

- **C++** takes argument types from the function's own signature via template
  deduction, so no per-algorithm type declaration is needed. An unsupported
  argument type is a *compile error*, not a silent wrong answer. Argument types
  are stripped of references and cv-qualifiers first, because
  `void f(const vector<int>&)` is the *idiomatic* C++ spelling and template
  deduction hands the harness `const vector<int>&` — without stripping, the
  failure reads `incomplete type FromJ<const std::vector<int>&>`, which looks like
  a bug in the student's code rather than in the harness.
- **Java** is compiled with `java -m jdk.compiler/com.sun.tools.javac.Main`, not
  the `javac` binary, because plenty of machines have a JRE with no JDK package
  and requiring the binary would silently skip Java verification for exactly the
  people most likely to be writing the Java snippets.
- **Java's** `Runner` class is emitted *last* in the file: the JEP 330 in-memory
  launcher attributes classes in source order, so a class declared after `Runner`
  cannot be referenced from it.
- A missing toolchain **skips**; it does not fail. CI installs all three.

`core/` never spawns a process. The harness is a dev-time Node tool and is never
bundled — the boundary rule is what guarantees that.

---

## Testing layers

| Layer | Command | What it proves |
| --- | --- | --- |
| Unit | `npm test` | trace snapshots, transport reducer, anchor parsing, the pane invariant |
| Contract | `npm test` | *every* algorithm: runs, terminates, valid trace, every anchor resolves in all four languages, no dead notes, one expectation per preset |
| Parity | `npm run verify:langs` | all four languages return the same thing on every preset — **not** that any of them is right |
| E2E | `npm run test:e2e` | deep links, stepping both directions, the same step highlighted in four languages, a11y announcements |
| Pages | `npm run test:e2e` | `/` is the browse page, cards open the right algorithm, ⌘K, favourites survive a reload, guides render, an embedded stepper steps, every route has a 404 with a way out — and each path survives a **cold load**, which is what proves the SPA rewrite exists on that host |
| Visual | `npm run test:visual` | geometry baselines in JSON, plus screenshots at 3 widths per renderer, per UI state, and per page |
| Baselines | `npm run snapshots:update` | refreshes both. Build first — the baselines are of the production bundle |
| Budget | `node tools/budget.mjs` | initial payload under 200 kB gzip, measured by walking the static import graph |

### The budget tool's measurement was broken, and that is the interesting part

It used to classify a file as initial by filename pattern: `/^index-.*\.(js|css)$/`
or `/^[a-z-]+\.(js|css)$/`. Both are wrong, and the second is wrong in the dangerous
direction — Vite and rolldown hash every emitted filename, so a chunk called
`react.js` is emitted as `react-BhrwgiWi.js`, the regex does not match, and **React
was never counted**. 78 kB gzip, the single largest thing a visitor downloads.

So the gate read 106 kB and passed green while the real first load was over 200 kB.
Worse, it read as *evidence of health*: a number well under budget, on a build that
was over it. A safety net that does not measure the thing it names is worse than no
safety net, because it is trusted.

Whether a chunk is initial is a property of the **graph**, not of its name, so it is
now computed by breadth-first walk of static imports from the entry. Two details
were both wrong in the first attempt and are worth keeping in mind if this is ever
rewritten:

- **The space before `from` is optional.** Minified output is `import{r as
  e}from"./a.js"`. A pattern written `\sfrom` matches nothing in a built bundle, the
  walk finds zero imports, and every chunk is classified lazy.
- **The specifier body must exclude `(` and `)`**, which is what separates
  `import{x}from"./a.js"` (follow it) from `import("./a.js")` (do not). Without it
  the walk pulls the entire lazy curriculum into the initial total.

And there is now a guard: if the react vendor chunk is missing from the initial set,
the script fails. That is the symptom of the measurement breaking again, and it is
worth a loud failure rather than another comfortable-looking number.

Fixing the measurement is what found the two real over-budget imports — the eager
`LearnIndex` pulling 40 kB of article prose, and `InputEditor`'s ~19 kB, which is a
transient sheet that was *already* only mounted when open — plus the eight eagerly
imported viewport renderers, of which any single run needs one.
| Tokens | `npm run check:tokens` | every token utility referenced in `src/` emits a rule in the built CSS |
| Articles | `npm test` | every article's `algoId`, `stepper` preset and table shape resolves; slugs unique and URL-safe |

The **contract test** is the highest-value one. With 66 algorithms the
characteristic failure is not a broken algorithm, it is a module that renders fine
on the one input its author tried and emits an anchor with no matching line in the
Python listing, or loops forever, or walks a pointer off the end of the array. That
test is the thing that catches it, and it runs on all of them every commit.

**On snapshots.** E2E tests here are behavioural, and that is still the right
default: a behavioural test says what the app *does*, and survives a redesign. But
this repo had zero layout coverage for a long time, and three of the worst defects
it ever had were invisible to every test in the suite — the header changed height
when the window was resized, both overlays defaulted to open on a phone, and the
code panel and the nav stacked on top of each other at 1024. None of them change
behaviour, so no amount of behavioural testing would have found them.

So there are now two visual layers, and the split between them is the point:

- **Geometry, as JSON.** Bounding boxes of the header, narration card,
  visualisation region and transport, compared numerically. A pixel diff *cannot*
  catch a 2px reflow — it is a handful of antialiased pixels against a tolerance
  chosen to absorb font-rendering differences, so it scores as a pass. A reflow is
  a *relationship* between two measurements, and a pinned number cannot express a
  relationship. The `maxDiffPixelRatio` is 0.002, deliberately tiny: it exists to
  absorb antialiasing, not to permit a layout change.
- **Screenshots**, for "does it still look right", at 3 widths per renderer and
  per UI state — not the full cross-product. 21 images for the player plus 11 for
  the pages, byte-identical across consecutive runs, which is verified rather than
  assumed.

The pages get their own spec (`visual/pages.spec.ts`) rather than being appended to
`screens.spec.ts`, because the settle condition is a different *kind* of thing. A
player fixture is photographable once the trace is built and Shiki has resolved; a
guide is photographable once its stepper has drawn a frame, and each page has a
different answer. One shared `settle` would make every capture pay for every other
page's loading — and, worse, a stepper that never resolved would make the suite slow
rather than making one baseline wrong.

That distinction caught two real defects rather than confirming the design. The
browse-filtered baseline could not find the family heading it was supposed to be
freezing, which turned out to be a grouping rule that rendered *no* heading when a
filter narrowed to a single family. And the article baseline photographed a bar
chart as a thin strip at the top of an empty box, because the stepper's viewport
wrapper was a plain block and every viewport's root is `flex-1` in a column —
so the chart had no definite height to resolve against. Neither was visible by
reading the code.

A defect is nearly always a *relationship* — "these two boxes must not both be
open", "this box's height must not depend on that one's" — and that is what the
numeric layer is for. Screenshots are the weaker tool here and are used for the
thing they are actually good at.

**Determinism was the hard part, and it is mostly Shiki.** Highlighting is four
dynamic `import()`s, so the code panel paints plain monospace text and then
repaints with colour — and since the panel is a docked column at every viewport
where it matters, *every* baseline was racing it. Hence `data-highlighted` on the
listing, which distinguishes `pending` (wait) from `unavailable` (the documented
plain-text fallback *is* the answer; stop waiting). The other two sources are the
lazily-imported algorithm chunk, and the playback clock, which is a
`requestAnimationFrame` loop — asserted paused, since a clock that is not
injectable is cheaper to not start than to freeze. Notably, `prefers-reduced-motion`
is deliberately *not* emulated: the app honours it as a real user setting that also
disables the speed control, so a baseline captured under it would not match what a
default visitor sees.

**Two gaps in the table above, both found the hard way.**

*Parity cannot see a shared bug.* It diffs each language's reported output against
the reference trace, so four listings that are wrong in the same way agree
perfectly. `avl-rotate` passed parity while every rotation wrote the wrong child
slot — the drawn tree silently lost half its nodes, and the algorithm's own
`left`/`right` arrays stayed correct, so the *numbers* looked fine. Frame
structure needs its own assertions; that is what the per-algorithm test files are
for, and why a handful of families have one.

*Every test looks down from the registry.* An algorithm module that was never
registered is invisible to all of them: `avl-rotate` and `tree-height` sat on
disk, were built into lazy chunks, and were never rendered, run, or checked. One
contract check now lists the directory and looks back.

---

## Adding an algorithm

See `docs/CONTRIBUTING.md`. The short version: one file, one line in `registry.ts`,
`npm run gen:catalog`, and the contract + parity tests do the rest.

The rule that matters: **if you need a new frame field, a new viewport, or a new
colour, stop.** That is a change to the trace contract, not a per-algorithm
liberty.
