# Architecture

A short map of the codebase and the reasoning behind its load-bearing decisions.
`plan.md` is the *why*; this is the *what*, for someone about to change it.

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

Files: `src/lib/urlState.ts`, `src/features/player/useUrlSync.ts`.

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
│   │   ├── catalog.ts        pure metadata — the sidebar's whole data source
│   │   ├── registry.ts       eager static imports; Node-only
│   │   ├── contract.test.ts  the contract test (see below)
│   │   └── <family>/         one file per algorithm
│   └── input/                seeded RNG, input shapes, generators,
│                             fields.ts (the custom-input parser)
│
├── features/                 ← everything that knows about React
│   ├── player/               store, transport, narration, keyboard, URL sync
│   ├── viewport/             one component per frame kind
│   ├── code-panel/           the anchor ↔ line highlight
│   ├── controls/             header: complexity, presets, params
│   ├── input/                the custom-input editor
│   ├── nav/                  the algorithm index
│   └── registry/loaders.ts   lazy algorithm loading (import.meta.glob)
│
├── workers/trace.worker.ts   off-main-thread materialisation
├── lib/                      cn(), URL state
└── App.tsx                   the three-column shell

tools/
├── verify/                   the 4-language parity harness
│   ├── harness.ts            compile, run, diff, report
│   └── drivers/              one shared driver per language
└── budget.mjs                initial-payload budget

tests/
├── e2e/                      Playwright, behavioural
└── parity/                   the whole-curriculum parity run
```

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

## Rendering: DOM, with a canvas escape hatch

| Elements | Renderer |
| --- | --- |
| ≤ 150 | DOM (`<div>` + transforms) — styleable, accessible, animatable |
| > 150 | Canvas 2D — avoids thousands of layout/paint ops |

The crossover is measured, not guessed, and it is **per viewport**: a 200-cell grid
costs far more than a 200-bar chart. `ArrayView` and `GridView` are structured so
a canvas implementation can slot in behind the same props.

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

### A layout rule worth knowing

A percentage height does **not** resolve against a `flex: 1 1 0%` parent. Filling
remaining space with `h-full` silently collapses a panel to its content height,
and every bar chart inside then sizes its bars against the wrong box. Use
`flex-1` with `min-h-0` throughout. This cost an afternoon once.

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
| Unit | `npm test` | trace snapshots, transport reducer, anchor parsing |
| Contract | `npm test` | *every* algorithm: runs, terminates, valid trace, every anchor resolves in all four languages, no dead notes, one expectation per preset |
| Parity | `npm run verify:langs` | all four languages return the same thing on every preset — **not** that any of them is right |
| E2E | `npm run test:e2e` | deep links, stepping both directions, the same step highlighted in four languages, a11y announcements |
| Budget | `node tools/budget.mjs` | initial payload under 200 kB gzip |

The **contract test** is the highest-value one. With 66 algorithms the
characteristic failure is not a broken algorithm, it is a module that renders fine
on the one input its author tried and emits an anchor with no matching line in the
Python listing, or loops forever, or walks a pointer off the end of the array. That
test is the thing that catches it, and it runs on all of them every commit.

E2E tests are behavioural, not snapshot-based. A pixel snapshot of a visualiser is
noise — it breaks whenever a colour changes and tells you nothing about whether the
thing works.

**Two gaps in that table, both found the hard way.**

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
