import { byLanguage } from '../../code/anchors.ts';
import { fewDistinctArray, randomArray, reversedArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Trapping Rain Water — the two-pointer family's one genuinely asymmetric
 * argument.
 *
 * `pair-sum` and `container-most-water` both retire an endpoint because keeping
 * it cannot produce a better *answer*. Here there is no single answer to
 * improve: the water over column `i` is `min(maxLeft, maxRight) - h[i]`, and
 * both maxima are prefix/suffix quantities that a naive pass computes with two
 * O(n) tables. The two-pointer version gets rid of the tables by noticing
 *
 *   **the smaller of the two boundary maxima is already final.**
 *
 * If `leftMax <= rightMax` then a `rightMax`-high wall already stands to the
 * right of every column the left cursor can still reach, so no amount of
 * scanning the middle can raise a column above `leftMax`. The left side can be
 * settled without knowing anything about the right side — and vice versa. One
 * paragraph, and the O(n²) version becomes O(n) with O(1) space.
 *
 * The asymmetry is the whole lesson, so the trace spends a frame per column on
 * it: a `loop` frame that names both ceilings and says which side is final, a
 * `settle-*` frame that commits, an `add-water` frame that shows the column
 * actually holding water, and a `move` frame that shows the window shrinking.
 * The presets are picked so both arms fire, with and without water, and so the
 * bound at zero is visible rather than asserted.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 2507;

/**
 * A skyline with a 9 at each end and nothing taller inside: the case where the
 * answer is obvious by eye, which is exactly why it is worth animating first.
 * The middle six columns come from a seeded generator, so the shape is real
 * input rather than a tidy ramp — and the two 9s are appended, not generated,
 * because "two walls" is the property under test.
 */
const VALLEY = [9, ...randomArray(SEED + 1, 6, 0, 5), 9];

/**
 * A staircase *rising* to the right, behind one tall bar on the left.
 *
 * Monotone, which is the interesting part: a monotone array is not an input this
 * algorithm finds easy, it is an input that drives one arm to exhaustion. Every
 * step takes the right-hand branch and the running total climbs, because the
 * only thing that can raise a column on the right is the 9 at index 0, and that
 * was measured on the very first step. Reversed, the same staircase would drive
 * the left arm instead.
 */
const STAIRCASE = [9, ...reversedArray(SEED + 5, 8, 1, 9).reverse()];

/** Eight bars, all the same height: the answer is 0, and it is 0 for a reason. */
const FLAT = fewDistinctArray(SEED + 9, 8, 1, 5);

/** Seven bars at ground level: the floor the running maxima start from. */
const GROUND = randomArray(SEED + 13, 7, 0, 0);

/**
 * One wall and nothing else to pair it with.
 *
 * Hand-written on purpose, and not by a generator, because the shape *is* the
 * lesson: a single tall bar is the input that proves water needs two sides. Any
 * generator that produced a spike among varied heights would also produce a
 * second wall and a non-zero answer, which would teach the wrong thing.
 */
const SPIKE = [0, 0, 0, 9, 0, 0, 0];

const PRESETS: Preset[] = [
  {
    id: 'valley',
    label: 'A valley between two walls',
    blurb:
      'A 9 at each end with six lower columns between them. The obvious case: the first step settles the left wall, the second step settles the right one, and from then on every interior column is measured against a ceiling of 9 and holds its difference.',
    input: { type: 'numbers', values: VALLEY },
  },
  {
    id: 'staircase',
    label: 'A staircase to the right',
    blurb:
      'Eight columns climbing from 1 to 8, behind a single 9 on the left. Every step takes the right-hand branch, because the left ceiling of 9 is already the larger one, and the total climbs at each step instead of only at the end. The mirror image of this preset drives the left arm just as hard.',
    input: { type: 'numbers', values: STAIRCASE },
  },
  {
    id: 'spike',
    label: 'One tall bar',
    blurb:
      'Six columns at ground level and one bar at 9. The answer is 0, and the reason is the point: a single wall has no partner, so nothing can be enclosed however tall it gets. This is the input that shows the bound rather than assuming it.',
    input: { type: 'numbers', values: SPIKE },
  },
  {
    id: 'flat',
    label: 'All the same height',
    blurb:
      'Eight bars at 5. The first step raises the left ceiling to 5, the second is forced onto the right arm to catch the right ceiling up, and the remaining six steps alternate nothing at all. Best case: one comparison per column and not one unit of water.',
    input: { type: 'numbers', values: FLAT },
  },
  {
    id: 'ground',
    label: 'Nothing above the ground',
    blurb:
      'Seven columns at 0. Both ceilings start at 0 and no bar can raise them, so the left arm runs to completion without ever consulting the right. The floor the maxima are initialised to is doing real work here — a negative height would not behave.',
    input: { type: 'numbers', values: GROUND },
  },
  {
    id: 'degenerate',
    label: 'No bars at all',
    blurb:
      'An empty array. `high` starts at -1, the loop guard `left <= right` is false on the first test, and the body never runs — so the degenerate case costs one frame and needs no special branch anywhere in the code.',
    input: { type: 'numbers', values: [] },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

export function* trappingRainWater(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const size = Number(ctx.params.size ?? source.length);
  const values = [...source].slice(0, Math.max(0, size));
  const n = values.length;

  let ops = 0;
  let left = 0;
  let right = n - 1;
  /** Tallest bar already settled on the left, and on the right. */
  let leftMax = 0;
  let rightMax = 0;
  let total = 0;
  /** Indices that ended up holding water, so the last frame can show all of them. */
  const wet: number[] = [];

  /** `right` is -1 on an empty array, and a pointer may not leave the array. */
  const cursors = (): Record<string, number> => {
    const out: Record<string, number> = { left };
    if (right >= 0) out.right = right;
    return out;
  };

  /*
   * The two cursor positions, in range and deduplicated. A cursor can be one
   * past the end — `left` reaches n when the last column is settled from the
   * left — and the trace contract rejects a highlight index outside `[0, n)`, so
   * the filter is not cosmetic. It also collapses the two cursors to a single
   * entry on the last column, where they coincide.
   */
  const walls = (): number[] => [...new Set([left, right].filter((i) => i >= 0 && i < n))];

  /** Columns the cursors still bracket. */
  const live = (): number[] => (left > right ? [] : range(left, right + 1));

  /** Columns already settled, on both sides of the window. */
  const done = (): number[] => [...range(0, left), ...range(right + 1, n)];

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    note:
      n < 2
        ? 'Fewer than two bars, so there is no pair of walls and nothing can be enclosed. The total stays at 0.'
        : `Two cursors start at the ends: index 0 is ${values[0] as number} high, index ${n - 1} is ${values[n - 1] as number} high, and nothing has been measured yet. Both ceilings start at 0 — the ground — so the first bar to exceed one becomes its own wall.`,
    values: [...values],
    pointers: cursors(),
    highlight: { window: range(0, n) },
    vars: { n, left, right, leftMax, rightMax, total },
  };

  while (left <= right) {
    if (ctx.shouldStop()) return;
    ops++;
    const goLeft = leftMax <= rightMax;
    const at = goLeft ? left : right;
    const ceiling = goLeft ? leftMax : rightMax;
    const other = goLeft ? rightMax : leftMax;
    const side = goLeft ? 'left' : 'right';
    const between = right - left;
    const away = side === 'left' ? 'right' : 'left';
    const where = `The window is indices ${left} to ${right}: ${between + 1} column${between === 0 ? '' : 's'} that can still change.`;

    /*
     * Three different sentences, because the argument this frame exists to make
     * is genuinely a different argument in the three cases. Before either cursor
     * has met a bar the only ceiling in existence is the ground, which is not the
     * same claim as "the left side is final" even though the branch taken is the
     * same. A tie is the boring case, where either side would have done. The
     * unequal case is the one the whole algorithm turns on, and it is the only
     * one where the note can honestly say "the other side never has to be looked
     * at".
     */
    const whyFinal =
      leftMax === 0 && rightMax === 0
        ? `Neither ceiling has risen above the ground yet, so 0 is the only ceiling there is and the column at index ${at} cannot be filled deeper than that however tall anything in between turns out to be. Whichever cursor meets a bar first will raise one ceiling, and from that step on the comparison has teeth.`
        : other === ceiling
          ? `Both ceilings are ${ceiling}, so neither side is the smaller one and either could be settled — the tie-break picks the ${side} only so the trace stays reproducible. It is safe for the same reason the unequal case is: the far side already stands at ${ceiling}, so the column at index ${at} is capped at ${ceiling} no matter what the ${between} column${between === 1 ? '' : 's'} in between turn out to be.`
          : `leftMax is ${leftMax} and rightMax is ${rightMax}, and ${side}Max at ${ceiling} is the smaller — so the ${side} side is the final one. A bar of ${other} already stands on the far side of the column at index ${at}, so that column cannot be filled deeper than ${ceiling} however the ${between} column${between === 1 ? '' : 's'} in between turn out, and the other side never has to be looked at.`;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'loop',
      caption: `Column ${ops} of ${n}`,
      note: `${where} ${whyFinal}`,
      values: [...values],
      pointers: cursors(),
      highlight: { compare: walls(), window: live(), measured: done() },
      ops,
      vars: { n, left, right, leftMax, rightMax, total },
    };

    const height = values[at] as number;
    const raised = goLeft ? Math.max(leftMax, height) : Math.max(rightMax, height);
    const depth = raised - height;
    const newWall = raised > ceiling;
    // `vars.ceiling` reports `raised`, not the pre-update `ceiling`: the number
    // the column was actually held to is the one worth showing, and it makes
    // `depth === ceiling - height` an identity the per-algorithm test can check
    // rather than a formula it has to re-derive with a `max(0, ...)` around it.

    yield {
      kind: 'array',
      index: 0,
      anchor: goLeft ? 'settle-left' : 'settle-right',
      caption: `Column ${ops} of ${n}`,
      note: newWall
        ? `The bar at index ${at} is ${height}, taller than every bar already passed from the ${side}, so ${side}Max rises to ${height} and the column holds nothing: a new wall is its own ceiling. That raised ceiling is what every bar further ${away} will be measured against.`
        : depth === 0
          ? `The bar at index ${at} is exactly as tall as the ${side} ceiling, ${raised}, so it holds nothing. It still counts as a ceiling itself, and the cursor steps past it.`
          : `The ${side} ceiling is ${raised} and the bar at index ${at} is only ${height}, so the column holds ${raised} - ${height} = ${depth} unit${depth === 1 ? '' : 's'} of water, and it is final: a running maximum only ever rises, so nothing further ${away} can make it deeper.`,
      values: [...values],
      pointers: cursors(),
      highlight: { compare: walls(), window: live(), measured: done() },
      ops,
      vars: { n, left, right, leftMax, rightMax, ceiling: raised, height, depth, total },
    };

    if (depth > 0) {
      total += depth;
      wet.push(at);
      yield {
        kind: 'array',
        index: 0,
        anchor: 'add-water',
        caption: `Column ${ops} of ${n}`,
        note: `${depth} unit${depth === 1 ? '' : 's'} land${depth === 1 ? 's' : ''} on the total, which is now ${total}, and ${ops} of ${n} columns have been settled. The column keeps its water in the picture and the algorithm keeps nothing about it — no per-column record and no prefix table, which is exactly the O(1) space the quadratic version cannot avoid.`,
        values: [...values],
        pointers: cursors(),
        highlight: { filled: [at], window: live(), measured: done() },
        ops,
        vars: { n, left, right, leftMax, rightMax, ceiling: raised, height, depth, total },
      };
    }

    if (goLeft) leftMax = raised;
    else rightMax = raised;
    if (goLeft) left = left + 1;
    else right = right - 1;

    const width = Math.max(0, right - left + 1);

    yield {
      kind: 'array',
      index: 0,
      anchor: 'move',
      caption: `Column ${ops} of ${n}`,
      note: `The ${side} cursor steps to index ${side === 'left' ? left : right}, leaving a window of ${width} column${width === 1 ? '' : 's'}${width === 0 ? ' — the last one, and the loop is over' : ''}. The window can only shrink and every column inside it is measured exactly once, so ${n} steps is the whole budget: a quadratic version that computed a max-left and a max-right per column would look at ${n * n} bars instead of ${n}.`,
      values: [...values],
      pointers: cursors(),
      highlight: { compare: walls(), window: live(), measured: done() },
      ops,
      vars: { n, left, right, leftMax, rightMax, total },
    };
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'done',
    note:
      n === 0
        ? 'The cursors crossed with no column ever inspected, so the total is 0.'
        : total === 0
          ? `All ${n} columns are settled after ${ops} step${ops === 1 ? '' : 's'}, and not one of them holds water: every bar the cursors met was at least as tall as the ceiling it was measured against, so no column ended up lower than a wall on both sides. That is a real answer rather than a missing one, and the frames above say which side was settled at each step. The array was never written to — the ceilings, the cursors and the total are the entire state.`
          : `All ${n} columns are settled after ${ops} step${ops === 1 ? '' : 's'}, and ${wet.length} of them hold water: ${total} unit${total === 1 ? '' : 's'} in total. The array itself was never written to — the ceilings, the cursors and the total are the entire state, which is what one pass with no auxiliary array buys.`,
    values: [...values],
    pointers: cursors(),
    highlight: { filled: wet, measured: range(0, n) },
    result: `${total} units of water`,
    ops,
    vars: { n, total, ops, wet: wet.length },
  };
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Bar heights (in order)',
      kind: 'numbers' as const,
      default: PRESETS[0]?.input.type === 'numbers' ? PRESETS[0].input.values : [],
    },
  ],
  build: (values: Record<string, unknown>): AlgoInput => ({
    type: 'numbers',
    /*
     * Passed through untouched, and the contrast with `pair-sum` is the point:
     * that module sorts here because sortedness is part of its correctness
     * argument. Here the *order* is the whole problem — sorting the skyline
     * would change the answer — so the editor has to hand over the bars exactly
     * as typed, and the one requirement (non-negative heights) is stated in the
     * complexity note rather than enforced here.
     */
    values: Array.isArray(values.values) ? (values.values as number[]) : [],
  }),
  sizeOf: (input: AlgoInput): number => (input.type === 'numbers' ? input.values.length : 0),
};

/* ------------------------------------------------------------------ *
 * 4. The lesson — four languages, one set of anchors
 * ------------------------------------------------------------------ */

const JS = `function trapRainWater(h) {
  let left = 0, right = h.length - 1, leftMax = 0, rightMax = 0, total = 0; // @anchor start
  while (left <= right) {                                                      // @anchor loop
    if (leftMax <= rightMax) {                                                // @anchor settle-left
      leftMax = Math.max(leftMax, h[left]);
      total += leftMax - h[left];                                             // @anchor add-water
      left = left + 1;                                                        // @anchor move
    } else {                                                                   // @anchor settle-right
      rightMax = Math.max(rightMax, h[right]);
      total += rightMax - h[right];                                           // @anchor add-water
      right = right - 1;                                                      // @anchor move
    }
  }
  return total;                                                                // @anchor done
}`;

const PY = `def trap_rain_water(h):
    left, right = 0, len(h) - 1                          # @anchor start
    left_max = right_max = total = 0
    while left <= right:                                 # @anchor loop
        if left_max <= right_max:                        # @anchor settle-left
            left_max = max(left_max, h[left])
            total += left_max - h[left]                  # @anchor add-water
            left += 1                                    # @anchor move
        else:                                            # @anchor settle-right
            right_max = max(right_max, h[right])
            total += right_max - h[right]                # @anchor add-water
            right -= 1                                   # @anchor move
    return total                                         # @anchor done`;

const JAVA = `class TrapRainWater {
    static int trapRainWater(int[] h) {
        int left = 0, right = h.length - 1;              // @anchor start
        int leftMax = 0, rightMax = 0, total = 0;
        while (left <= right) {                          // @anchor loop
            if (leftMax <= rightMax) {                   // @anchor settle-left
                leftMax = Math.max(leftMax, h[left]);
                total += leftMax - h[left];              // @anchor add-water
                left = left + 1;                         // @anchor move
            } else {                                     // @anchor settle-right
                rightMax = Math.max(rightMax, h[right]);
                total += rightMax - h[right];            // @anchor add-water
                right = right - 1;                       // @anchor move
            }
        }
        return total;                                    // @anchor done
    }
}`;

const CPP = `#include <algorithm>
#include <vector>
using std::vector;

int trap_rain_water(const vector<int>& h) {
    int left = 0, right = (int)h.size() - 1;            // @anchor start
    int leftMax = 0, rightMax = 0, total = 0;
    while (left <= right) {                              // @anchor loop
        if (leftMax <= rightMax) {                       // @anchor settle-left
            leftMax = std::max(leftMax, h[left]);
            total += leftMax - h[left];                  // @anchor add-water
            left = left + 1;                             // @anchor move
        } else {                                         // @anchor settle-right
            rightMax = std::max(rightMax, h[right]);
            total += rightMax - h[right];                // @anchor add-water
            right = right - 1;                           // @anchor move
        }
    }
    return total;                                        // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'Nothing is written: four cursors and a running total, and the two maxima start at 0 rather than at the first and last bar. That initialisation is a claim about the problem — 0 is the ground, so a bar taller than everything before it becomes its own wall and holds nothing. JavaScript has no integer type, so a large enough skyline would lose precision here rather than overflow loudly.',
    python:
      "Tuple assignment binds three names from one line, and it is the other three languages' only way to say this in one statement. The two maxima start at 0 for the same reason they do in the other three: 0 is the ground. Python integers are arbitrary precision, so the total on the last line of the loop cannot overflow here even where the other three would wrap silently.",
    java: "Two declarations, three `int`s between them, and not one element of `h` written. The parameter is `int[]`, which is a mutable reference type rather than a copy, so the function genuinely reads the caller's array and genuinely never changes it. The `int` total would overflow silently on a tall enough skyline rather than throwing.",
    cpp: '`const vector<int>&` makes the read-only claim structural: the compiler rejects any write to a bar, so "does not modify its input" and "O(1) space" stop being promises and become facts the type system checks. The `(int)` on `h.size()` is load-bearing too — `size()` is unsigned, so without the cast the `- 1` on an empty vector would wrap to a huge positive number.',
  },
  loop: {
    javascript:
      'The window between the cursors is the only part of the array that can still change, and this comparison decides which end is safe. `leftMax <= rightMax` means the *smaller* wall is the one that is final: a column can never rise above the tallest bar on either side of it, and a bar of `rightMax` already stands beyond everything the left cursor can reach. So the left side is settled without the right side ever being consulted. The guard is `<=`, not `<`, because the last surviving column still has to be measured.',
    python:
      'One comparison per column, and it is the whole algorithm: the smaller of the two running maxima is the ceiling that cannot be beaten from further in, so that side is final and the other side can be ignored. The `<=` is a tie-break rather than a correctness requirement — when both maxima are equal either end is equally final, and picking one keeps the trace reproducible. Python reaches the other end through `else`, which is why this listing is a line shorter than the Java and C++ ones.',
    java: 'The guard is `mid <= high` in the other algorithm and `left <= right` here, and both are `<=` on purpose: with a strict `<` the last surviving column of an odd-length array would never be measured. The comparison inside then picks the end whose ceiling is final, which is what turns a pair of O(n) prefix and suffix maxima into two integers.',
    cpp: 'The comparison is the whole linear-time argument in one condition. Each of the two integers on the line above is a running maximum over the bars already passed, so the smaller one is a ceiling that nothing beyond the window can raise. One settled column per iteration, and the window strictly shrinks: that is why this is O(n) where the prefix-and-suffix version is O(n^2).',
  },
  'settle-left': {
    javascript:
      'The left side is the final one, so the column at `left` is measured now and never touched again. `Math.max` raising the ceiling is the only way a ceiling moves, and it only ever moves up: that monotonicity is what makes a single pass sound, because a column already measured against a ceiling can never turn out to need more water.',
    python:
      'Committing to the left side means the column under `left` is decided for good. `max(left_max, h[left])` is the only statement that changes a ceiling, and it is monotonic by construction. Python reaches for the builtin `max`; C++ needs `std::max` from `<algorithm>` and Java needs `Math.max` from a class, so the same line is spelled three ways.',
    java: 'The left side is final, so the column at `left` is measured and retired. `Math.max` is a static method on `java.lang.Math`, which is auto-imported and `final`, so unlike C++ there is nothing to import and no local variable that could shadow it. One subtlety worth stating: the accumulation on the next line is skipped entirely when the bar is a new ceiling, and that is not an optimisation but a requirement.',
    cpp: 'The left side is final, so the column at `left` is measured and retired. `std::max` is a function template in `<algorithm>`, which is why the include at the top is not decoration: dropping it turns this listing into a compile error rather than a wrong answer. The ceiling it writes is monotonic, so no settled column ever needs revisiting.',
  },
  'add-water': {
    javascript:
      'One addition, and the column is finished — it keeps its water in the drawing but the function keeps nothing. The quadratic version of this problem needs a prefix maximum and a suffix maximum array, one entry per column, which is O(n) space; folding both into two running integers is the entire reason this version needs no auxiliary structure at all.',
    python:
      'The depth joins the total and nothing is recorded per column. Building a list of depths so a caller could inspect or draw them is exactly the extra O(n) space this algorithm exists to avoid, so the function hands back a single integer and the picture is left to the caller.',
    java: 'The depth is added to a running `int` and the column is retired. `int` is 32 bits and signed, so roughly two billion units of water would wrap to a negative answer with no exception thrown — the one genuine overflow hazard in this listing, and the reason the harness only ever runs it on modest skylines.',
    cpp: 'The depth joins the total in `int` arithmetic. Because the parameter is a const reference nothing is copied and nothing is allocated, so a million-bar skyline costs no extra memory here — the same property that makes the O(1) space claim true, and the reason a `double` variant would need a second thought about precision rather than about space.',
  },
  move: {
    javascript:
      'The cursor on the settled side steps one place inward, and the window loses a column permanently. `left = left + 1` rather than `left++` is only style — the compiled behaviour is identical — but writing it symmetrically with the `right = right - 1` three lines below makes the two branches easy to check against each other by eye, which is worth more here than terseness.',
    python:
      'One place inward, and the window shrinks by one. The effect on the data is the same as the other three languages, and so is the reason it is safe: the ceiling on this side can only rise, so a column already measured against it cannot come back. `left += 1` here and `right -= 1` below are the only two writes to a cursor in the whole function.',
    java: 'The settled side steps inward and the window is one column shorter. Java has no compound-assignment requirement in either direction, and the chosen spelling is symmetric with the branch above rather than minimal, because in an algorithm this small the readable symmetry is worth more than the saved keystrokes.',
    cpp: 'The settled side steps inward. The two branches are exact mirror images, and that is a useful thing about this listing: the window always shrinks from whichever end was just settled, never from both, which is what bounds the loop at n iterations.',
  },
  'settle-right': {
    javascript:
      'The mirror arm, and on an unsorted skyline both arms are live — the shorter wall can be at either end. Sortedness is *not* a precondition here, unlike in `pair-sum`; these presets are chosen to drive each arm to exhaustion, and this one is the arm that does the work in a rising staircase.',
    python:
      'The mirror arm, reached through `else` rather than a second comparison, which is why this listing has one fewer line than the Java and C++ versions. What decides the branch is a comparison of two running maxima rather than a property of the data, so no ordering of the bars can make either arm dead — a monotone staircase simply runs the other one to exhaustion.',
    java: 'The mirror arm, with the same three statements the left arm above has: raise the ceiling, accumulate the depth, move the cursor. Anything shorter in one branch is a bug waiting to happen, which is the real reason the two arms are written out rather than refactored into a helper — a helper would have to be handed which side to move.',
    cpp: 'The mirror arm, reading `h[right]` through a const reference rather than copying it. Because the parameter is a const reference, updating `rightMax` and the total are the *only* writes in the whole function, which is a useful thing to be able to say about an algorithm you are reasoning about with several threads in the picture.',
  },
  done: {
    javascript:
      'One number back, and there is no result array to allocate or garbage-collect. The array was never modified either, so a caller can hand in the same buffer it got back — the function is a pure read, and the visualisation keeps the per-column water depths purely so the picture can show them.',
    python:
      'A single integer, and control always falls here: there is no `break` and no early return. The degenerate cases need no special handling at all, because on an empty or single-element list the loop body simply never runs and `total` is still 0 when control arrives.',
    java: 'One `int` back, with no special case for an array shorter than two elements: the guard is false on the first test and `total` is still 0. A two-pass prefix-and-suffix implementation of the same question needs two arrays of n integers to answer it, so the two versions differ by a memory class and not by a constant factor.',
    cpp: 'The total, with nothing retained and nothing allocated. The loop guard is what makes the degenerate inputs free: on an empty vector `right` is -1, so `left <= right` is false on the very first test and the body never runs — which is exactly why the guard reads `<=` and not `<`.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'trapRainWater',
    python: 'trap_rain_water',
    java: 'TrapRainWater.trapRainWater',
    cpp: 'trap_rain_water',
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

/**
 * The claim, written out the slow and obvious way: for every column, the
 * tallest bar at or to its left, the tallest bar at or to its right, the lesser
 * of the two, minus the column, floored at zero.
 *
 * This is deliberately O(n^2) and shares no code with the generator above. The
 * four language listings implement the *two-pointer* version, so checking them
 * against another two-pointer implementation would only prove that two copies of
 * the same idea agree. Checking them against the formula the problem statement
 * is actually asking for is the only version of this test that can fail.
 */
const waterByScan = (values: number[]): number => {
  let total = 0;
  for (let i = 0; i < values.length; i++) {
    const here = values[i] as number;
    let maxLeft = here;
    for (let k = 0; k <= i; k++) maxLeft = Math.max(maxLeft, values[k] as number);
    let maxRight = here;
    for (let k = i; k < values.length; k++) maxRight = Math.max(maxRight, values[k] as number);
    total += Math.max(0, Math.min(maxLeft, maxRight) - here);
  }
  return total;
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const values = valuesOf(p);
  return { presetId: p.id, args: [values], result: waterByScan(values) };
});

export const trappingRainWaterAlgo: AlgoDef<ArrayFrame> = {
  id: 'trapping-rain-water',
  title: 'Trapping Rain Water',
  category: 'two-pointers',
  summary:
    'Walk two cursors in from the ends of a skyline and settle the column behind whichever running maximum is smaller, because that ceiling is already the tallest one the column can ever see.',
  intuition:
    'Reach for this whenever the question is "how much of X sits in the gap" — surface area under a terrain profile, water against a skyline, the largest rectangle that fits under a histogram. The shape of the problem is what makes it a two-pointer problem and not a stack problem: the quantity at a column depends on two running extremes, and the extremes are *monotone*, so one of them is always redundant. A monotone stack is the alternative when the extremes are not monotone, at the price of O(n) space and a much harder argument. Nothing here is written to the input, so it is also the right shape to reach for when the array is read-only and large enough that the O(n) auxiliary tables of the obvious solution would not fit.',
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    note: 'One step per column, so the cost is n rather than the n^2 bar visits of a per-column max-left/max-right scan — and unlike a sort, the best and worst cases are the same case, because the window shrinks by exactly one either way. The caveat is the initialisation: both maxima start at 0, which encodes "the ground is at zero and heights are non-negative". A negative bar would make the algorithm add water above ground level and report a total that is quietly wrong rather than an error.',
  },
  traits: {
    inPlace: true,
    offline: true,
    allowsDuplicates: true,
    tags: ['read-only', 'no extra space', 'greedy elimination', 'works unsorted'],
  },
  viewport: 'array',
  level: 'intro',
  params: [
    {
      key: 'size',
      label: 'Bars',
      kind: 'number',
      min: 2,
      max: 150,
      step: 1,
      default: 9,
      regeneratesInput: true,
      help: 'Past 150 elements the cells get too small to read, and a long run can hit the frame cap and stop early.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: trappingRainWater,
  lesson,
  expectations,
  formatResult: (r) => `${r as number} units of water`,
  anchors: ['start', 'loop', 'settle-left', 'add-water', 'move', 'settle-right', 'done'],
};

export default trappingRainWaterAlgo;
