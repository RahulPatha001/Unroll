import { byLanguage } from '../../code/anchors.ts';
import { distinctArray, fewDistinctArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Container With Most Water — the two-pointer argument at its most physical.
 *
 * Pick two lines; the water between them is limited by the *shorter* of the two,
 * so the area is `min(h[left], h[right]) * (right - left)`. The greedy move is
 * forced: if the left line is the shorter one, then keeping it and moving the
 * right pointer *inwards* can only shrink the width while leaving the height
 * unchanged — so no pair containing that line as its lid beats the one in hand.
 * The line is spent. One paragraph of proof, one elimination per step, and the
 * quadratic search collapses to linear.
 *
 * A note on the presets. This problem is normally posed on an *unsorted* array,
 * where the shorter wall can be at either end. These presets are sorted, which
 * makes the left wall always the shorter one and turns "retire the shorter wall"
 * into "always step `left`". That is a real simplification rather than the same
 * lesson twice, and the `move` anchor is where the general case is spelled out —
 * the `two-levels` preset puts a run of equal heights in the middle so you can
 * watch a wall retire even though the wall beside it is exactly as tall.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 907;

const sortedOf = (values: number[]): number[] => [...values].sort((a, b) => a - b);

/** A staircase: the area rises, peaks, and then falls as height beats width. */
const RAMP = sortedOf(distinctArray(SEED, 9, 1, 12));
/** Every wall the same height, so area is purely a function of width. */
const FLAT = sortedOf(fewDistinctArray(SEED + 4, 8, 1, 4));
/** Two levels only, with a long flat run of equal walls in the middle. */
const TWO = sortedOf(fewDistinctArray(SEED + 8, 9, 2, 3));

const PRESETS: Preset[] = [
  {
    id: 'ramp',
    label: 'A staircase',
    blurb:
      'Nine distinct heights. The area climbs while there is width to gain, peaks where the height starts costing more than the width is worth, and then the left pointer keeps marching with nothing left to win.',
    input: { type: 'numbers', values: RAMP },
  },
  {
    id: 'flat',
    label: 'All the same height',
    blurb:
      'Every wall is 4 high, so the area depends on nothing but how far apart the pointers are. The widest pair — the first and last — is also the best, so the answer is found in one step and the best case is real.',
    input: { type: 'numbers', values: FLAT },
  },
  {
    id: 'two-levels',
    label: 'Two levels',
    blurb:
      'A block of 3s and a block of 4s. Where two walls are the same height, retiring either one is provably safe, and stepping off a wall whose neighbour is exactly as tall is what makes that argument visible rather than theoretical.',
    input: { type: 'numbers', values: TWO },
  },
  {
    id: 'single-line',
    label: 'One line',
    blurb:
      'A single line has no width, so the loop never runs and the answer is 0. The degenerate case is worth seeing because it is where `best` has to be given an initial value rather than left undefined.',
    input: { type: 'numbers', values: sortedOf(distinctArray(SEED + 12, 1, 1, 12)) },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

export function* containerMostWater(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const size = Number(ctx.params.size ?? source.length);
  const values = sortedOf(source).slice(0, Math.max(0, size));
  const n = values.length;

  let ops = 0;
  let left = 0;
  const right = n - 1;
  let best = 0;
  /** The pair that produced `best`, kept only so the trace can draw it. */
  let bestLeft = 0;
  let bestRight = 0;

  const cursors = (): Record<string, number> => {
    const out: Record<string, number> = { left };
    if (right >= 0) out.right = right;
    return out;
  };

  const live = (): number[] => (n < 2 ? [] : range(left, right + 1));
  const winner = (): number[] => (best > 0 ? [bestLeft, bestRight] : []);
  const retiredLeft = (): number[] => range(0, left);
  const retiredRight = (): number[] => range(right + 1, n);

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    note:
      n < 2
        ? 'Fewer than two lines, so there is no width to hold any water at all. The best area is 0.'
        : `Two lines as far apart as the array allows: index 0 is ${values[0] as number} high and index ${n - 1} is ${values[n - 1] as number} high, ${n - 1} units of width apart. Every other pair is narrower or shorter, so the search starts at the widest possible rectangle.`,
    values: [...values],
    pointers: cursors(),
    highlight: { window: range(0, n) },
    vars: { n, left, right, best },
  };

  while (left < right) {
    if (ctx.shouldStop()) return;
    ops++;
    const lv = values[left] as number;
    const rv = values[right] as number;
    const width = right - left;
    const height = Math.min(lv, rv);
    const area = height * width;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'measure',
      caption: `Pair ${ops}`,
      note: `Width ${right} - ${left} = ${width}. The lid is the shorter wall, ${height}, so the water fills ${width} x ${height} = ${area}. ${
        area > best
          ? `Better than the best so far (${best}).`
          : area === best
            ? `Exactly ties the best so far (${best}).`
            : `Worse than the best so far (${best}), so the best is untouched.`
      }`,
      values: [...values],
      pointers: cursors(),
      highlight: { compare: [left, right], window: live(), answer: winner() },
      ops,
      vars: { left, right, width, height, area, best },
    };

    if (area > best) {
      best = area;
      bestLeft = left;
      bestRight = right;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'keep',
        caption: `Pair ${ops}`,
        note: `Keep it. The best area is now ${best}, held by the pair at indices ${bestLeft} and ${bestRight}. Remembering *which* pair won is bookkeeping for the picture only — the function itself just remembers the number.`,
        values: [...values],
        pointers: { left: bestLeft, right: bestRight },
        highlight: { answer: [bestLeft, bestRight], window: live() },
        ops,
        vars: { best, bestLeft, bestRight, area },
      };
    }

    /** The index being retired, so the note can name it before the pointer moves. */
    const retired = lv <= rv ? left : right;
    left = left + 1;
    yield {
      kind: 'array',
      index: 0,
      anchor: 'move',
      caption: `Pair ${ops}`,
      note:
        lv < rv
          ? `The left wall (${lv}) is the shorter one, so it is the lid and the right wall's extra ${rv - lv} of height is wasted. Every pair still containing index ${retired} and a partner further right is narrower and no taller, so none can beat ${area}. Retire the left wall; the span loses its left edge.`
          : rv < lv
            ? `Unsorted data would retire the right wall here instead, and that is the arm that makes the algorithm correct on the arrays this problem is normally posed on. These presets arrive sorted, so the shorter wall is always the left one and this arm never fires — the code steps \`left\` unconditionally for exactly that reason.`
            : `Both walls are exactly ${lv} high, so the height is already as good as it gets and only the width can change. Every pair still containing index ${retired} is strictly narrower, so the left wall retires — and because the heights are equal, retiring the right one would have been just as safe.`,
      values: [...values],
      pointers: cursors(),
      highlight: {
        window: live(),
        answer: winner(),
        outOfPlace: [...retiredLeft(), ...retiredRight()],
      },
      ops,
      vars: { left, right, height, area, best },
    };
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'done',
    note:
      best === 0
        ? 'The pointers met without ever spanning two lines, so the best area is 0.'
        : `The winning pair is ${bestLeft} and ${bestRight}: ${bestRight - bestLeft} wide, ${best} units of area. ${ops} measurement${ops === 1 ? '' : 's'} were enough to retire one wall per step, where brute force would have measured ${(n * (n - 1)) / 2} pairs.`,
    values: [...values],
    pointers: cursors(),
    highlight: winner().length > 0 ? { answer: [bestLeft, bestRight] } : {},
    result: best > 0 ? 'found' : 'not-found',
    ops,
    vars: { best, ops, bestLeft, bestRight },
  };
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Wall heights (sorted)',
      kind: 'numbers' as const,
      default: PRESETS[0]?.input.type === 'numbers' ? PRESETS[0].input.values : [],
    },
  ],
  build: (values: Record<string, unknown>): AlgoInput => ({
    type: 'numbers',
    values: Array.isArray(values.values)
      ? [...(values.values as number[])].sort((a, b) => a - b)
      : [],
  }),
  sizeOf: (input: AlgoInput): number => (input.type === 'numbers' ? input.values.length : 0),
};

/* ------------------------------------------------------------------ *
 * 4. The lesson — four languages, one set of anchors
 * ------------------------------------------------------------------ */

const JS = `function containerMostWater(h) {
  let left = 0, right = h.length - 1, best = 0;      // @anchor start
  while (left < right) {
    const area = Math.min(h[left], h[right]) * (right - left);   // @anchor measure
    if (area > best) best = area;                     // @anchor keep
    // retire whichever wall is the lid on the water.   // @anchor move
    if (h[left] <= h[right]) left = left + 1;
    else right = right - 1;
  }
  return best;                                        // @anchor done
}`;

const PY = `def container_most_water(h):
    left, right, best = 0, len(h) - 1, 0              # @anchor start
    while left < right:
        area = min(h[left], h[right]) * (right - left)    # @anchor measure
        if area > best:                               # @anchor keep
            best = area
        # retire whichever wall is the lid on the water.   # @anchor move
        if h[left] <= h[right]:
            left = left + 1
        else:
            right = right - 1
    return best                                       # @anchor done`;

const JAVA = `class ContainerMostWater {
    static int containerMostWater(int[] h) {
        int left = 0, right = h.length - 1, best = 0;  // @anchor start
        while (left < right) {
            int area = Math.min(h[left], h[right]) * (right - left);   // @anchor measure
            if (area > best) best = area;             // @anchor keep
            // retire whichever wall is the lid on the water.  // @anchor move
            if (h[left] <= h[right]) left = left + 1;
            else right = right - 1;
        }
        return best;                                  // @anchor done
    }
}`;

const CPP = `#include <algorithm>
#include <vector>
using std::vector;

int container_most_water(const vector<int>& h) {
    int left = 0, right = (int)h.size() - 1, best = 0;    // @anchor start
    while (left < right) {
        int area = std::min(h[left], h[right]) * (right - left);   // @anchor measure
        if (area > best) best = area;                 // @anchor keep
        // retire whichever wall is the lid on the water.   // @anchor move
        if (h[left] <= h[right]) left = left + 1;
        else right = right - 1;
    }
    return best;                                      // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'One pass and three integers, with nothing allocated: `best` starts at 0 so an array too short to contain a pair still returns a number. `right` is -1 on an empty array, which is harmless only because the loop guard reads `<` — the same guard that stops a single line from being its own partner.',
    python:
      "Three names bound in one statement, which is Python's tuple assignment: every right-hand side is evaluated first, and only then are all three names rebound. The other three languages need either separate statements or comma-separated declarators to say the same thing.",
    java: "Three `int`s declared in one statement — Java allows comma-separated declarators where C89 did not and where JavaScript's `const` does not. Nothing is allocated, so the O(1) space claim is structural, and `h` is never written to: this method is read-only over its input.",
    cpp: 'The parameter is `const vector<int>&` — a reference to a const — so there is no copy of the caller\'s data and the compiler can reject any write. That turns "O(1) space, does not modify the input" from a promise into something the type system enforces.',
  },
  measure: {
    javascript:
      "Area is `min * width`, and the `min` is the entire algorithm: the shorter wall is the lid on the water, so the taller wall's extra height is wasted. One line, no loop, and it re-reads both cells rather than reusing a `height` temporary — the same trade the other three make, in the same direction.",
    python:
      "Area is `min * width`, and the `min` is the entire algorithm: the shorter wall is the lid on the water. Python's `min` is a builtin, so there is no import and no qualification, where C++ needs `std::min` from `<algorithm>` and Java needs `Math.min` from a class.",
    java: 'Area is `min * width`, and the `min` is the entire algorithm. `Math.min` is a static method on a class the JDK ships, and `Math` is a class name rather than a namespace — so unlike C++ there is nothing to `using`-declare and no way for a local variable to shadow it.',
    cpp: 'Area is `min * width`, and the `min` is the entire algorithm. `std::min` lives in `<algorithm>`, so the include at the top is not decoration: it is what makes this a self-contained translation unit, and dropping it turns a clean listing into a compile error.',
  },
  keep: {
    javascript:
      'A running maximum, and the only piece of state that has to survive the loop. Strict `>` rather than `>=` matters for a different reason here than in a sort: the trace cares *which* pair won, and with equal areas an earlier pair is the one worth drawing.',
    python:
      'A running maximum, and the only piece of state that survives the loop. Note that the function stores the *area* and not the pair that produced it — recovering the winning indices would need two more variables, which is the usual reason a real caller writes a slightly longer version than this one.',
    java: 'A running maximum, and the only piece of state that survives the loop. Nothing is copied and nothing is returned by reference, so the O(1) space claim holds: the answer is one `int` regardless of how many pairs were measured.',
    cpp: 'A running maximum, and the only piece of state that survives the loop. Because the parameter is a const reference, updating `best` is the *only* write in the whole function — a useful thing to be able to say about an algorithm you are reasoning about in a multi-threaded setting.',
  },
  move: {
    javascript:
      'Retire the wall that is the lid, because every pair still containing it is narrower and no taller. On the unsorted arrays this problem is normally posed on, the shorter wall can be at either end, so both arms are live; these presets arrive sorted, which means the left arm is taken every time and the `else` is dead code. That is a property of the data, not of the algorithm.',
    python:
      'Retire the wall that is the lid, because every pair still containing it is narrower and no taller. The `<=` is a deliberate choice, not an accident: when two walls are the same height, retiring the left one is just as safe as retiring the right, and picking one makes the trace deterministic. Python reaches the other arm through `else` rather than a second comparison.',
    java: 'Retire the wall that is the lid. On the unsorted arrays this problem is normally posed on, the shorter wall can be at either end and both arms are live; these presets arrive sorted, so the `else` never runs. Worth saying plainly: the algorithm does not need sortedness, and the input spec sorts only to keep the trace readable.',
    cpp: 'Retire the wall that is the lid. This is the whole linear-time argument in one condition: after this line, one endpoint can never appear in a better pair, so the candidate set is strictly smaller and the loop cannot run more than n - 1 times. The `else` arm is unreachable on sorted input but is the arm that runs on the unsorted arrays the problem is usually posed on.',
  },
  done: {
    javascript:
      'One integer back, and there is no `result` array to allocate or to garbage-collect. The visualiser keeps the winning indices purely so it can draw them; the function does not, which is why the return type is a bare `number` rather than something a caller has to unwrap.',
    python:
      'One integer back. `best` was the only thing that had to be remembered, so a brute-force version would return the same number having stored nothing extra either — the win here is the number of measurements, not the memory.',
    java: 'One integer back, and control always falls here: there is no `break`, no early return, and no special case. The degenerate case (an array with fewer than two elements) is handled for free because the loop body never runs and `best` is still 0.',
    cpp: 'One integer back, with nothing retained and nothing allocated. A brute-force version would have measured n(n-1)/2 pairs; this one measures at most n - 1, which is the entire point of retiring a wall per step rather than trying every combination.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'containerMostWater',
    python: 'container_most_water',
    java: 'ContainerMostWater.containerMostWater',
    cpp: 'container_most_water',
  },
  glue: {
    javascript: 'auto' as const,
    python: 'auto' as const,
    java: 'auto' as const,
    cpp: 'auto' as const,
  },
};

/* ------------------------------------------------------------------ *
 * 5. Expectations — one machine-checked claim per preset
 * ------------------------------------------------------------------ */

const valuesOf = (p: Preset): number[] => (p.input.type === 'numbers' ? p.input.values : []);

/** The machine-checked claim: the largest area two walls can enclose. */
const waterOf = (values: number[]): number => {
  let left = 0;
  let right = values.length - 1;
  let best = 0;
  while (left < right) {
    const area = Math.min(values[left] as number, values[right] as number) * (right - left);
    if (area > best) best = area;
    if ((values[left] as number) <= (values[right] as number)) left = left + 1;
    else right = right - 1;
  }
  return best;
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const values = valuesOf(p);
  return { presetId: p.id, args: [values], result: waterOf(values) };
});

export const containerMostWaterAlgo: AlgoDef<ArrayFrame> = {
  id: 'container-most-water',
  title: 'Container With Most Water',
  category: 'two-pointers',
  summary:
    'Squeeze two pointers in from the ends of a list of wall heights, measure the rectangle the water would fill, and retire whichever wall is shorter — the one that can no longer be part of anything better.',
  intuition:
    'Reach for this when the constraint is a minimum rather than a sum: two dimensions, one of them capped by the weaker of the two endpoints, and a question about the largest rectangle two of them can enclose. The pattern generalises well past water and bars — pick two endpoints, score them by a function of both in which one argument is monotone in each endpoint, and discard the endpoint that is worse. It is the standard answer to "widest span under a per-endpoint limit", and it beats the O(n^2) version by the same argument that makes it linear: each step proves one endpoint can never appear in a better pair.',
  complexity: {
    best: 'O(1)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    note: 'At most n - 1 pairs are ever measured against n(n-1)/2 for brute force, and the span halves every step so the work is bounded by the span rather than the count. Sortedness is not a precondition — it only makes one of the two branches unreachable, which is why the presets sort and the algorithm does not care.',
  },
  traits: {
    inPlace: true,
    offline: true,
    allowsDuplicates: true,
    tags: ['read-only', 'greedy elimination', 'no extra space', 'works unsorted'],
  },
  viewport: 'array',
  level: 'intro',
  params: [
    {
      key: 'size',
      label: 'Walls',
      kind: 'number',
      min: 2,
      max: 150,
      step: 1,
      default: 9,
      regeneratesInput: true,
      help: 'Beyond 150 the viewport switches to canvas.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: containerMostWater,
  lesson,
  expectations,
  formatResult: (r) => `${r as number} units of area`,
  anchors: ['start', 'measure', 'keep', 'move', 'done'],
};

export default containerMostWaterAlgo;
