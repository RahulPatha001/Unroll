# Unroll

<img src="public/favicon.svg" width="72" height="72" alt="" align="right" />

**Unroll an algorithm one step at a time — with the exact line of Python, Java,
C++ or JavaScript highlighted and explained.**

The name is the mechanism: a loop, unrolled into steps you can walk. The cursor
above the array is where the loop is *now*; the highlighted line in the listing is
what the machine is *executing*; and the project's whole claim is that those are
the same moment.

The animation and the code are the same program. A hand-translated snippet in
four languages is where this kind of project normally rots, so every translation
here is **executed and diffed against a reference** in CI. A Java listing that
compiles, looks plausible, and computes the wrong thing is a red build, not a
lesson.

```bash
npm install
npm run dev
```

**66 algorithms across 14 families**, each with four language listings, each frame
naming the step it came from. 571 unit and contract tests, 71 four-language parity
tests, 26 end-to-end tests, 87.1 kB gzipped on first load — and the algorithm count
is machine-checked, because every one of those 264 listings is executed and diffed
against the animation's own answer rather than merely type-checked.

The shell is built so nothing moves that the algorithm did not move: the step
narration is a fixed-height card, because step lengths vary enormously and a
content-sized one made the viewport twitch on every frame.

---

## What makes it different

**The highlighted line is derived from the code, not maintained beside it.**
Every frame names the *semantic step* it came from (`compare`, `swap`, `relax`).
Every language version of the algorithm marks the corresponding line with a
trailing `@anchor compare` comment, and a 30-line parser turns those into line
ranges.

So switching from Python to Java keeps the highlight on the *same step* — you see
`if s < target:` and `if (sum < target)` side by side and realise they are one
idea. The mapping cannot rot, because moving a line moves its marker with it.

**Four languages, all verified.** JavaScript, Python, Java and C++, each a clean
standalone implementation, each checked against the others on every preset:

```
$ npm run verify:langs

 Test Files  1 passed (1)
      Tests  61 passed (61)
```

Every algorithm, every preset, all four languages written to a temp file, run, and
diffed against the trace the visualiser will show. A missing toolchain *skips*
rather than fails, so you can work without a JDK. CI installs python3, a JDK and
g++.

**One viewport per family, not per algorithm.** Named cursors
(`left`/`right`, `i`/`j`/`k`, `low`/`high`/`mid`) and named highlight groups
(`window`, `picked`, `unvisited`) are uniform across every frame, so sorting, two
pointers, sliding window and binary search all render through the same component.
Adding an algorithm costs one file.

**Colour means one thing, and the tests say so.** The 35 highlight names are a
closed vocabulary ordered by specificity, and a new name is a build failure until
it is added to both the order and the palette. That is not bureaucracy: ten
algorithms were quietly painting `settled`, `relaxed` and `pivot` in the *same*
amber, because an unrecognised name falls through to the first colour. What is
guaranteed — and checked against every frame of every trace — is that two groups
visible at the same moment never share a colour.

**Data structures are first class.** Buckets rehash, doubly-linked lists rewire,
heaps sift, deques evict — each with a viewport built for the structure rather
than a generic table of numbers.

**The code is not a transcript, it is a control.** Click any line and the
animation jumps to the step that runs it — the anchor contract already knows
which line range belongs to which semantic step, so this is the one direction that
took a reverse lookup rather than a new idea. The panel also scrolls properly
(both axes), and its explanation collapses so a long listing can have the room.

**You can bring your own data.** Every algorithm declares the shape of its input,
so the editor is one generic renderer rather than 56 forms — type an array, a
string, a grid, or a graph edge list and the algorithm runs on it. Your input goes
into the URL, so the run is a link you can reload, bookmark, or send to someone.
The four-language listings still have to agree on the answer, which is what makes
"try it on your own numbers" a check rather than a guess.

---

## Using it

| Key | |
| --- | --- |
| `Space` | play / pause |
| `←` `→` | step one frame |
| `Shift` + `←` `→` | jump 10 |
| `Home` `End` | first / last frame |
| `R` | reset |
| `L` | cycle language |
| `I` | type your own input |
| `P` | toggle pointer labels |
| click a code line | jump to the step that runs it |
| `B` | toggle the algorithm list |
| `C` | show / hide the code panel |
| `Esc` | close whatever is open |
| `?` | shortcuts |

Every visualiser state is in the URL, including the frame and **your own input**,
so a share link points at a *specific run* rather than the start — reload it a
year later and the same array is still in the box, still in the animation, still
on the same step.

Presets are chosen to expose behaviour, not to look nice: reverse-sorted input is
bubble sort's worst case, nearly-sorted input fires its early exit, and lots of
ties is the only way to *see* what stability means.

---

## Commands

| | |
| --- | --- |
| `npm run dev` | dev server |
| `npm run build` | typecheck + production build |
| `npm test` | unit + contract tests over every algorithm (sub-second) |
| `npm run gen:catalog` | regenerate the sidebar metadata — **required** after touching `registry.ts` |
| `npm run verify:langs` | executes JavaScript, Python, Java and C++ and diffs them |
| `npm run test:e2e` | Playwright, behavioural |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Biome |

`npm run verify:langs` needs `python3`, a JDK and `g++` on `PATH`. It compiles
Java through `java -m jdk.compiler/...` rather than the `javac` binary, so a JRE
install is enough.

---

## Layout

```
src/core/          pure: no React, no DOM, enforced by Biome
  trace/           frame types, materialiser, transport reducer
  code/            anchor parsing — the seam to the code panel
  algorithms/      one file per algorithm + the contract test
  input/           seeded RNG, input shapes, generators, custom-input parsing
src/features/      everything that knows about React
  viewport/        one component per frame kind
  code-panel/      the anchor ↔ line highlight
  player/          store, transport, narration, keyboard, URL sync
  input/           the custom-input editor
tools/verify/      the 4-language parity harness and its per-language drivers
docs/              CONTRIBUTING.md (how to add an algorithm), architecture.md
```

`docs/CONTRIBUTING.md` is the guide for adding one; `bubble-sort.ts` is the
reference implementation to copy.

Two boundaries are enforced by *tests* rather than by lint, because lint failed
silently once already and nothing noticed for weeks:

- `src/core/boundary.test.ts` — `core/` imports no Node, and nothing in
  `src/features/` imports `registry.ts`, which would put all 66 algorithms in the
  initial bundle.
- `src/core/algorithms/contract.test.ts` — 14 checks over every algorithm,
  including that no algorithm module sits on disk unregistered.
- `src/core/input/fields.test.ts` — the custom-input round trip: seed the editor
  from a real preset, parse it back, and require the same input out, for every
  algorithm and every preset.

---

## Deploying

Static. No backend, no database, no environment variables.

**Cloudflare Pages** — build `npm run build`, output `dist`. The free tier has
unlimited bandwidth and no non-commercial clause (unlike Vercel Hobby), and its
500 builds/month does not burn out on every push the way Netlify's credits do.

Nothing in the browser bundle needs a toolchain: the verifier is a dev-time Node
tool, and `src/core/` is denied `node:*` imports so it cannot be.

---

## Accessibility

Full keyboard control, an `aria-live` region that reads the current step aloud,
`prefers-reduced-motion` honoured as a hard rule, visible focus rings, and
meaning never carried by colour alone — every highlight group is also named in the
legend and every cursor is a labelled marker.

---

## Licence

MIT for the code. The algorithm listings are original teaching implementations;
they are not copied from any textbook or source.
