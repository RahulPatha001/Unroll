import { type Highlight, highlightRank } from '../../core/trace/types.ts';

/**
 * The highlight palette.
 *
 * Two rules, both accessibility rules rather than taste rules:
 *
 *  1. **Colour is never the only signal.** Every highlight group also appears by
 *     name in the legend, and every pointer is a labelled text marker. A student
 *     who cannot distinguish the hues still knows what each group means.
 *  2. **Ranked, not hashed.** `highlightRank` orders keys by specificity, so the
 *     most meaningful group ("answer", "compare") always wins the primary
 *     colour and broad background groups ("sorted", "visited") get the muted
 *     end of the scale. A hash would make "compare" indigo on one algorithm and
 *     teal on the next, which teaches nothing.
 */

export interface HighlightStyle {
  /** Tailwind background class, for **DOM** elements. */
  bg: string;
  /** Tailwind `fill-*` class for SVG **shapes** — the same colour as `bg`. */
  fill: string;
  /** Tailwind text colour class, for **DOM** elements. */
  text: string;
  /** Tailwind `fill-*` class for SVG **text** — the same colour as `text`. */
  ink: string;
  /** Tailwind border class, for **DOM** elements. */
  border: string;
  /** Tailwind `stroke-*` class for SVG **shapes** — the same colour as `border`. */
  stroke: string;
  /** Non-colour fallback: the glyph shown on the cell, if any. */
  glyph?: string;
}

/**
 * Ordered most-specific first. Index is the colour rank.
 *
 * Authored without `fill`, which is derived below. Typing the colour twice would
 * let a `text-slate-400` sit next to a `fill-rose-400`, which is precisely the
 * silent-legibility bug the `fill` field exists to prevent.
 */
/*
 * One style per rank in `PALETTE_ORDER`, in that order. The two lists live in
 * different files and must agree exactly; `palette.test.ts` asserts it.
 *
 * Every class name is written out **literally**, and that is load-bearing rather
 * than merely tidy. Tailwind finds utilities by scanning source text for
 * class-shaped strings, so a class assembled at runtime — `text.replace('text-',
 * 'fill-')` — appears in no file, is never emitted, and silently does nothing.
 * Deriving them is not an option; the test asserts the derived values *match* the
 * literals, so the two cannot drift while staying greppable.
 *
 * The DOM/SVG split is the other load-bearing part. Each style carries five
 * classes for two rendering targets, and picking the wrong pair fails silently
 * rather than loudly:
 *
 *   - `bg-*` sets `background-color` and `border-*` sets `border-*`. Neither
 *     means anything to an SVG shape, which is painted with `fill` and `stroke`.
 *     Styling an SVG `<circle>` with `bg-amber-400` leaves it at the SVG default
 *     of **black** — so every node in the tree, graph, trie and linked-list
 *     viewports rendered as an unlabelled black dot, and nothing failed, because
 *     a black dot is not an error, it is just missing.
 *   - `text-*` sets `color`, and an SVG glyph is painted with `fill`, which does
 *     not inherit from `color`. A `<text>` styled only with `text-slate-400` is
 *     likewise black-on-black.
 *
 * The same bug twice, and the same fix: give SVG its own real classes instead of
 * hoping the DOM ones carry over.
 *
 * Note that hues *are* reused across tiers, deliberately. What must never
 * collide is two groups visible in the same frame, and `contract.test.ts` asserts
 * that per frame — which is a guarantee a student can actually use, and one that
 * 33 globally-distinct colours could not honestly offer.
 */
const STYLES: HighlightStyle[] = [
  // Strong: what is happening *right now*. The only ranks that carry a
  {
    bg: 'bg-amber-400',
    fill: 'fill-amber-400',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-amber-500',
    stroke: 'stroke-amber-500',
    glyph: '★',
  },
  // glyph, because these are the states a student must notice instantly.
  {
    bg: 'bg-emerald-400',
    fill: 'fill-emerald-400',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-emerald-500',
    stroke: 'stroke-emerald-500',
    glyph: '✓',
  },
  {
    bg: 'bg-cyan-400',
    fill: 'fill-cyan-400',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-cyan-500',
    stroke: 'stroke-cyan-500',
    glyph: '◆',
  },
  {
    bg: 'bg-fuchsia-400',
    fill: 'fill-fuchsia-400',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-fuchsia-500',
    stroke: 'stroke-fuchsia-500',
    glyph: '●',
  },
  {
    bg: 'bg-orange-400',
    fill: 'fill-orange-400',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-orange-500',
    stroke: 'stroke-orange-500',
    glyph: '▲',
  },
  {
    bg: 'bg-violet-400',
    fill: 'fill-violet-400',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-violet-500',
    stroke: 'stroke-violet-500',
    glyph: '■',
  },
  {
    bg: 'bg-rose-300',
    fill: 'fill-rose-300',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-rose-400',
    stroke: 'stroke-rose-400',
    glyph: '✕',
  },
  {
    bg: 'bg-sky-300',
    fill: 'fill-sky-300',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-sky-400',
    stroke: 'stroke-sky-400',
    glyph: '+',
  },
  {
    bg: 'bg-red-400',
    fill: 'fill-red-400',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-red-500',
    stroke: 'stroke-red-500',
    glyph: '⇄',
  },
  {
    bg: 'bg-green-500',
    fill: 'fill-green-500',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-green-600',
    stroke: 'stroke-green-600',
    glyph: '⊕',
  },
  {
    bg: 'bg-lime-400',
    fill: 'fill-lime-400',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-lime-500',
    stroke: 'stroke-lime-500',
    glyph: '▩',
  },
  {
    bg: 'bg-teal-400',
    fill: 'fill-teal-400',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-teal-500',
    stroke: 'stroke-teal-500',
    glyph: '⟳',
  },
  {
    bg: 'bg-pink-400',
    fill: 'fill-pink-400',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-pink-500',
    stroke: 'stroke-pink-500',
    glyph: '∞',
  },
  {
    bg: 'bg-rose-500',
    fill: 'fill-rose-500',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-rose-600',
    stroke: 'stroke-rose-600',
    glyph: '⚠',
  },
  {
    bg: 'bg-indigo-400',
    fill: 'fill-indigo-400',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-indigo-500',
    stroke: 'stroke-indigo-500',
    glyph: '◉',
  },
  // Mid: part of the story, but not the instantaneous event.
  {
    bg: 'bg-yellow-300',
    fill: 'fill-yellow-300',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-yellow-400',
    stroke: 'stroke-yellow-400',
    glyph: '⇩',
  },
  // Muted: background state — a slate ramp rather than more hues, because a
  {
    bg: 'bg-teal-300',
    fill: 'fill-teal-300',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-teal-400',
    stroke: 'stroke-teal-400',
  },
  // student cannot usefully tell this many apart, and these cover half the structure.
  {
    bg: 'bg-indigo-300',
    fill: 'fill-indigo-300',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-indigo-400',
    stroke: 'stroke-indigo-400',
  },
  {
    bg: 'bg-sky-200',
    fill: 'fill-sky-200',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-sky-300',
    stroke: 'stroke-sky-300',
  },
  {
    bg: 'bg-purple-200',
    fill: 'fill-purple-200',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-purple-300',
    stroke: 'stroke-purple-300',
  },
  {
    bg: 'bg-lime-300',
    fill: 'fill-lime-300',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-lime-400',
    stroke: 'stroke-lime-400',
  },
  {
    bg: 'bg-orange-300',
    fill: 'fill-orange-300',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-orange-400',
    stroke: 'stroke-orange-400',
  },
  {
    bg: 'bg-green-300',
    fill: 'fill-green-300',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-green-400',
    stroke: 'stroke-green-400',
  },
  {
    bg: 'bg-slate-200',
    fill: 'fill-slate-200',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-slate-300',
    stroke: 'stroke-slate-300',
  },
  {
    bg: 'bg-cyan-200',
    fill: 'fill-cyan-200',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-cyan-300',
    stroke: 'stroke-cyan-300',
  },
  {
    bg: 'bg-indigo-200',
    fill: 'fill-indigo-200',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-indigo-300',
    stroke: 'stroke-indigo-300',
  },
  {
    bg: 'bg-blue-300',
    fill: 'fill-blue-300',
    text: 'text-slate-950',
    ink: 'fill-slate-950',
    border: 'border-blue-400',
    stroke: 'stroke-blue-400',
  },
  {
    bg: 'bg-slate-500/60',
    fill: 'fill-slate-500/60',
    text: 'text-slate-100',
    ink: 'fill-slate-100',
    border: 'border-slate-500/70',
    stroke: 'stroke-slate-500/70',
  },
  {
    bg: 'bg-slate-600/70',
    fill: 'fill-slate-600/70',
    text: 'text-slate-200',
    ink: 'fill-slate-200',
    border: 'border-slate-500',
    stroke: 'stroke-slate-500',
  },
  {
    bg: 'bg-slate-700/60',
    fill: 'fill-slate-700/60',
    text: 'text-slate-300',
    ink: 'fill-slate-300',
    border: 'border-slate-600',
    stroke: 'stroke-slate-600',
  },
  {
    bg: 'bg-slate-700/40',
    fill: 'fill-slate-700/40',
    text: 'text-slate-400',
    ink: 'fill-slate-400',
    border: 'border-slate-600/60',
    stroke: 'stroke-slate-600/60',
  },
  {
    bg: 'bg-slate-800/60',
    fill: 'fill-slate-800/60',
    text: 'text-slate-400',
    ink: 'fill-slate-400',
    border: 'border-slate-700',
    stroke: 'stroke-slate-700',
  },
  {
    bg: 'bg-slate-900/70',
    fill: 'fill-slate-900/70',
    text: 'text-slate-300',
    ink: 'fill-slate-300',
    border: 'border-slate-700/70',
    stroke: 'stroke-slate-700/70',
  },
  {
    bg: 'bg-slate-800/30',
    fill: 'fill-slate-800/30',
    text: 'text-slate-400',
    ink: 'fill-slate-400',
    border: 'border-slate-700/50',
    stroke: 'stroke-slate-700/50',
  },
  {
    bg: 'bg-slate-900/40',
    fill: 'fill-slate-900/40',
    text: 'text-slate-400',
    ink: 'fill-slate-400',
    border: 'border-slate-800',
    stroke: 'stroke-slate-800',
  },
];

/**
 * How many distinct styles the palette has.
 *
 * Exported so a test can assert it equals `PALETTE_ORDER.length`. The two lists
 * live in different files and must agree exactly: when the style list was one
 * short, the last two highlight names wrapped onto the *first* two colours, and
 * `visited` rendered identically to `picked`. Nothing failed — the styles were
 * all valid Tailwind classes, the traces were correct, and the only symptom was
 * a student unable to tell two states apart.
 */
export const STYLE_COUNT: number = STYLES.length;

/** The muted style for "part of the structure, not part of the story". */
export const IDLE: HighlightStyle = {
  bg: 'bg-slate-800/40',
  fill: 'fill-slate-800/40',
  text: 'text-slate-200',
  ink: 'fill-slate-200',
  border: 'border-slate-700',
  stroke: 'stroke-slate-700',
};

export const BASE: HighlightStyle = {
  bg: 'bg-slate-800',
  fill: 'fill-slate-800',
  text: 'text-slate-100',
  ink: 'fill-slate-100',
  border: 'border-slate-700',
  stroke: 'stroke-slate-700',
};

/** Sorted so a cell's most specific group is found first. */
export function rankedKeys(highlight: Highlight | undefined): string[] {
  if (!highlight) return [];
  return Object.keys(highlight).sort((a, b) => highlightRank(a) - highlightRank(b));
}

export function styleForKey(key: string): HighlightStyle {
  return STYLES[highlightRank(key) % STYLES.length] as HighlightStyle;
}

/**
 * Resolve one cell/node to its style.
 *
 * The first key in rank order that contains the cell wins. So if a frame marks
 * both `compare: [3]` and `sorted: [0..8]`, index 3 renders as "compare" —
 * which is the point: the specific thing happening now must never be hidden by
 * the broad background state.
 */
export function resolveStyle(
  id: number | string,
  highlight: Highlight | undefined,
): HighlightStyle {
  if (!highlight) return BASE;
  for (const key of rankedKeys(highlight)) {
    const list = highlight[key];
    if (list?.includes(id)) return styleForKey(key);
  }
  return BASE;
}

export function resolveGlyph(id: number | string, highlight: Highlight | undefined): string | null {
  if (!highlight) return null;
  for (const key of rankedKeys(highlight)) {
    const list = highlight[key];
    if (list?.includes(id)) return styleForKey(key).glyph ?? null;
  }
  return null;
}

/** A stable colour for pointer markers, so `i` is always the same hue. */
const POINTER_HUES = [
  'text-amber-300',
  'text-sky-300',
  'text-emerald-300',
  'text-fuchsia-300',
  'text-orange-300',
  'text-violet-300',
  'text-teal-300',
  'text-rose-300',
];

export function pointerHueClass(name: string, all: string[]): string {
  const i = all.indexOf(name);
  return POINTER_HUES[(i === -1 ? 0 : i) % POINTER_HUES.length] as string;
}
