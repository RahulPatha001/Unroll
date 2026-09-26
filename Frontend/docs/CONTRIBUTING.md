# Contributing — how to add an algorithm

Read this before writing a module. It is the shortest path to a *finished*
algorithm, where "finished" means every check in the Definition of Done passes.

The reference implementation is **`src/core/algorithms/sorting/bubble-sort.ts`**.
It is deliberately the most heavily commented file in the repo. Read it end to
end once and the shape of every other module is obvious.

---

## 1. What one algorithm costs

One file. No renderer, no player change, no panel change, no new dependency.

```
src/core/algorithms/<family>/<kebab-name>.ts
```

plus one line in `registry.ts` and one entry in `catalog.ts`.

If you find yourself wanting to add a field to a frame, a new viewport, or a new
highlight colour, **stop** — that is a design change, not a per-algorithm
liberty, and it means the trace contract needs revisiting. Re-read §3.2 of
`plan.md` first.

---

## 2. The file structure

Every module has the same five parts, in this order.

### 2.1 Presets

```ts
const PRESETS: Preset[] = [
  { id: 'random', label: 'Random', blurb: 'The everyday case…', input: … },
  { id: 'reverse', label: 'Reversed', blurb: 'The worst case: …', input: … },
];
```

**Every preset must expose a different behaviour of the algorithm.** A visualiser
that only ever shows friendly input teaches the wrong thing:

| Preset | Why it must exist |
| --- | --- |
| random / typical | the common case |
| worst case | makes the O(n²) real; you cannot see why bubble sort is slow unless you watch it on reversed data |
| best case | makes the early exit / O(n) case visible |
| duplicates / ties | exposes stability, and `>` vs `>=` |
| empty / single | degenerate input must not crash |

Use the seeded generators in `src/core/input/generators.ts` (`randomArray`,
`nearlySortedArray`, `reversedArray`, `fewDistinctArray`, `ringGraph`, `dagGraph`,
`weightedGraph`, `stringWithRun`, `stringPairWithLcs`, …). **Never** call
`Math.random()` — it is denied by lint in `core/`, and it would make the URL
seed meaningless.

Use a *different seed per preset*. Two presets that call the same generator with
the same seed produce the same multiset, which looks like variety and is not.

### 2.2 The generator

```ts
export function* myAlgorithm(ctx: RunContext): Generator<MyFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  let ops = 0;

  yield {
    kind: 'array', index: 0, anchor: 'init',
    note: 'One sentence, present tense, saying what just happened to the data.',
    values: [...values],
    pointers: { i: 0 },
    highlight: { unvisited: range(0, n) },
    ops,
    vars: { i: 0, n },
  };

  for (…) {
    if (ctx.shouldStop()) return;   // cooperative cancellation
    ops++;
    yield { … };
  }
}
```

Rules that are not negotiable:

- **One `yield` per meaningful state change.** Not one per loop iteration if the
  iteration changed nothing; not three if one explains it. The student steps
  through frames, so every frame is a thing they read.
- **`note` is teaching copy.** Present tense. Say what happened *to the data*.
  "Swap them. 71 moves one step right." not "swapped a[j] and a[j+1]".
- **Every `yield` sets `anchor`**, and the anchor must be one you also put in
  `anchors` and marked in all four code listings.
- **`vars`** is the cheapest high-value thing you can emit. If the algorithm
  has loop variables, a running sum, a target, a capacity — show them.
- **Copy `values` into each frame** (`values: [...values]`). Frames are snapshots;
  sharing the array means every frame mutates at once and stepping backwards
  shows the future.
- **Never mutate `ctx`.** Never import React. Never touch the DOM.
- **Prefer the specific highlight name.** `'window'`, `'picked'`, `'unvisited'`
  say what is happening; `'active'`, `'current'`, `'temp'` are the fallback
  bucket. Use a name from `PALETTE_ORDER` — an invented one is a build failure,
  and that is deliberate, because an unrecognised name silently inherits the first
  colour and two unrelated states end up looking identical.

### 2.3 The input spec

```ts
const inputSpec: InputSpec = {
  fields: [{ key: 'values', label: 'Array', kind: 'numbers', default: PRESETS[0]… }],
  build: (v) => ({ type: 'numbers', values: v['values'] as number[] }),
  sizeOf: (i) => i.type === 'numbers' ? i.values.length : 0,
};
```

This is why a new algorithm never needs a new form control — and it is also
load-bearing for the custom-input editor, which renders `fields` directly.

**Your `inputSpec` has to survive a round trip**, because the editor opens
pre-filled from the input on screen: `seedFieldText` reads your input back into
field text, and `parseFieldText` + your `build` have to return the same input.
`fields.test.ts` asserts this for every registered algorithm on every preset, so
it is checked for you — but two rules make it work, and both were found by that
test rather than by reading the code:

- **A `words` field splits on newlines and commas, never on spaces.** A `words`
  input is not a list of atoms: `lcs` ships `['the quick fox', 'quick brown fox']`,
  and splitting on whitespace turned two sentences into six words and silently
  changed the input the algorithm was given.
- **A `graph` field is an edge list.** Nodes are printed and parsed as *indices*,
  because that is what the language listings use (`adj[0]`) — printing the names
  typed would have the drawing and the code disagree, which is the one thing this
  project exists to prevent. A vertex with no edges at all cannot be mentioned in
  an edge list, so the editor emits a `nodes: N` header when one exists.

If your input shape genuinely cannot be expressed by the six field kinds, add the
kind to `InputField` **and** teach `fields.ts` how to seed and parse it. Do not
special-case your algorithm inside the editor.

### 2.4 The lesson — four languages

```ts
const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: { javascript: 'myAlgo', python: 'my_algo', java: 'MyAlgo.myAlgo', cpp: 'my_algo' },
  glue: { javascript: 'auto', python: 'auto', java: 'auto', cpp: 'auto' },
};
```

**The listings are clean, standalone, idiomatic implementations — not the
generator.** The generator is threaded with `yield { kind: 'array', highlight }`
and is unreadable; showing it would teach the visualiser, not the algorithm.
The shown code and the animation are deliberately two artefacts, and
`tests/parity/all.parity.test.ts` is what keeps them honest.

Language rules:

| | JavaScript | Python | Java | C++ |
| --- | --- | --- | --- | --- |
| comments | `//` | `#` | `//` | `//` |
| class | none | none | `class MyAlgo { static … }` | free function + `#include` |
| `entry` | `myAlgo` | `my_algo` | `MyAlgo.myAlgo` | `my_algo` |

- Java **must** have `entry` as `ClassName.methodName`, and the class must be
  top level. `import` lines are hoisted automatically, so write them normally at
  the top of the listing.
- C++ **must** be a single self-contained translation unit; `#include` lines go
  first, and the harness appends its own driver after your code.
- The anchor marker is a trailing comment: `// @anchor compare` or `# @anchor compare`.
- **The same set of anchors must exist in all four listings.** The contract test
  asserts it. A step one language cannot express is a curriculum bug, not a
  cosmetic problem.
- `glue: 'auto'` handles every scalar and sequence argument with the element
  type inferred from the JSON. Use `glue: 'graph'` if the single argument is a
  graph, in which case the function receives an **adjacency structure**:
  `Record<number, Array<[number, number]>>` / `dict[int, list[tuple[int, int]]]` /
  `List<List<int[]>>` / `vector<vector<pair<int, int>>>`, derived from
  `{ nodes: number[], edges: [from, to, weight][] }`. Build the adjacency *inside*
  the driver, never in the shown code — a BFS that rescans the edge list on
  every pop is a different, worse algorithm than the one you are teaching.

Notes are authored **anchor-first** so the four languages sit side by side:

```ts
const NOTES = {
  'compare': {
    javascript: '…', python: '…', java: '…', cpp: '…',
  },
};
```

`byLanguage()` transposes that into the `Record<Lang, Record<anchor, string>>`
that `Lesson` requires, and throws if a translation is missing.

**A note must say what the line does to the data structure, not restate the
line.** And where the languages genuinely differ, *say so* — that difference is
the teaching:

> The pair is already ordered, and `pass` marks "nothing to do". Not swapping
> equal neighbours is what makes bubble sort *stable*: equal values never cross.

### 2.5 Expectations — the machine-checked claim

```ts
const expectations: Expectation[] = PRESETS.map((p) => ({
  presetId: p.id,
  args: [valuesOf(p)],              // JSON arguments, positionally
  result: [...valuesOf(p)].sort((a, b) => a - b),
}));
```

One case per preset. `npm run verify:langs` writes each listing to a temp file,
compiles/runs it, and requires the output to match. **This is the feature that
makes the app trustworthy** — a Java snippet that compiles, looks plausible, and
sorts incorrectly must fail CI rather than reach a student.

---

## 3. Register it

Two one-line edits:

```ts
// src/core/algorithms/registry.ts
import { myAlgo } from './sorting/my-algo.ts';
export const ALL_ALGORITHMS: AlgoDef[] = [ bubbleSortAlgo, /* … */ myAlgo ];
```

then regenerate the catalog:

```bash
npm run gen:catalog
```

`catalog.ts` is **generated** — pure metadata, all the sidebar needs, which is why
opening the app does not download 66 algorithms' code. Never edit it by hand; the
generator owns it, and a contract test fails if the two drift. (The generator
writes through a temp file and a rename, so a failed run cannot leave you with a
zero-byte catalog. It did once, when the npm script piped stdout into the file it
was generating.)

The filename must equal the `id`, for two independent reasons: the lazy loader
globs `core/algorithms/**/*.ts` and keys on the filename, and the contract test
treats any module whose filename is not a registered id as an orphan.

> **The orphan failure mode is worth knowing about.** `avl-rotate` and
> `tree-height` were written in full — 1,093 and 682 lines, all four language
> listings — and never added to `registry.ts`. They were built into their own lazy
> chunks on every build, never loaded, never rendered, and never checked by
> anything. Every existing test looks *down* from the registry, so an unregistered
> module is invisible to all of them. The contract test now also looks the other
> way, from the directory listing back to the registry.

**New highlight names are a build failure.** Every key in a frame's `highlight`
must appear in `PALETTE_ORDER` (`src/core/trace/types.ts`) *and* have a matching
style in `src/features/viewport/palette.ts`. Ten algorithms were painting
`settled`, `relaxed` and `pivot` in the same amber, because an unrecognised key
falls through to rank 0. Add the name to the vocabulary, ordered by specificity
(strong → mid → muted), and add the style; the count test keeps the two in step.

---

## 4. Check it

```bash
npm test              # unit + contract, sub-second
npm run verify:langs  # executes all four languages on every preset
npm run typecheck
npm run lint
```

`npm test` covers, across **every** registered algorithm:

- runs, terminates, produces a non-empty valid trace on every preset
- every reachable anchor resolves to a line in all four listings
- all four listings expose the same anchor set
- every anchor has a note in every language
- no dead notes (every key is reachable from some trace)
- no undeclared anchors, and every declared anchor is emitted
- one expectation per preset, no orphans
- pointers in bounds, indices inside highlight groups, hash `size` matching the
  bucket contents
- every highlight key is in the palette vocabulary
- no two same-coloured groups appear in the same frame
- no module on disk is missing from the registry

`verify:langs` skips a language whose toolchain is missing rather than failing,
so you can work without a JDK. CI installs `python3`, a JDK and `g++`.

**A passing parity run is not proof the frame data is right.** The harness compares
each language's *reported output* against the reference trace, so four listings
that share a bug agree with each other perfectly. `avl-rotate` passed parity for
months while every rotation wrote the wrong child slot: `side` was inverted, so
the drawn tree silently lost half its nodes. Frame *structure* needs its own test,
which is what the per-algorithm test files in `sorting/` and `trees/` are for.

**A `TreeFrame` is an edge list, not an adjacency map.** Nodes carry `parent` and
`side`; there is no `left`/`right` field, because the same structure renders as a
tree or as a heap's flat array. A helper that reaches for `node.left` silently
sees `null` for both children and reports a height of 1 for every tree — and
Vitest will not catch it, because it strips types without checking. Run
`npm run typecheck`.

---

## 5. Definition of Done

- [ ] Generator is pure, deterministic, terminates, respects the frame cap.
- [ ] Every preset exposes a genuinely different behaviour; no two presets share
      a seed.
- [ ] `note` reads as teaching copy; `vars` reports the live scalars.
- [ ] `complexity` has real numbers, and `intuition` answers *"when would I
      reach for this?"* rather than restating the summary.
- [ ] Same anchor set in all four listings; every anchor has a note in all four.
- [ ] Notes explain the effect on the data structure, and call out genuine
      cross-language differences.
- [ ] `expectations` covers every preset; `npm run verify:langs` is green.
- [ ] `npm test`, `npm run typecheck`, `npm run lint` are green.
- [ ] No new frame field, no new viewport, no new colour.

---

## 6. Worked checklist for a new frame kind

If you genuinely need one (rare — check first), the cost is:

1. Add the interface to `src/core/trace/types.ts` and to the `Frame` union.
2. `tsc` immediately errors in `Viewport.tsx` at the `never` default branch.
3. Write `src/features/viewport/YourView.tsx`, register it, delete the default
   branch.
4. Teach `validateTrace` the new invariants in `materialise.ts` — bounds checks
   are the whole reason the trace layer is trustworthy.
5. Add a contract test case exercising the new kind.
