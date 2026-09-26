import { byLanguage } from '../../code/anchors.ts';
import { randomArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Largest Rectangle in a Histogram — a monotonic **increasing** stack, where the
 * stack is the algorithm rather than an accessory to it.
 *
 * The question is: over all rectangles whose sides sit on the grid lines of the
 * bars, which one has the largest area? The naive answer enumerates every span,
 * keeps a running minimum height, and takes `min × width` — O(n²), and the code
 * is three lines long, which is why it is worth being able to do better.
 *
 * The observation the stack version runs on: **a rectangle's height is always the
 * height of some bar.** So instead of considering spans, consider the n bars as
 * candidate heights, and ask for each one how far it can stretch. A bar can
 * stretch left and right only across bars at least as tall as itself, so:
 *
 *   - while the current bar is *shorter* than the top of the stack, the top has
 *     run out of room. Its right boundary is the bar before the current one, and
 *     its left boundary is whatever is now on top of the stack — because the
 *     stack is non-decreasing, that is by construction the nearest bar to its
 *     left that is no taller;
 *   - so the widest rectangle this bar *owns* is `height × (right - left)`, and it
 *     is never extended again;
 *   - every bar is pushed once and popped at most once, which is the O(n).
 *
 * ## The off-by-one, stated out loud
 *
 * `left` is the new stack top and it is **exclusive** — it is the first bar the
 * rectangle may *not* cover. The right boundary is inclusive. So the width is
 * `right - left`, and when the stack empties, `left` is -1: a virtual bar one
 * position *outside* the array, which is counted. Getting either of those two
 * boundaries wrong by one produces a plausible number on most inputs, which is
 * the worst kind of bug, so every `area` frame puts `left`, `right`, `width`,
 * `height`, `area` and `best` in `vars` rather than folding them into an
 * expression.
 *
 * ## `>` and not `>=`
 *
 * The pop test is a strict `>`, so equal-height bars sit side by side on the
 * stack and a plateau is measured once per bar, with the widest run measured
 * last. `>=` would collapse each plateau as it arrived and measure the same
 * answer with fewer pops — both correct, different frames, and different stories
 * about what the left boundary means. The "plateau" preset exists to make that
 * choice visible.
 *
 * ## Why the overlay row
 *
 * `ArrayFrame.overlay` carries the stack, as **indices**, under the bars. The
 * input array never changes, so without that second row the animation would be a
 * picture of a static array with a cursor moving across it while the entire
 * computation happened off-screen. The sentinel bar at the end is *not* in the
 * overlay: it is a position, not a bar.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 641;

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

const count = (k: number, one: string, many: string): string => `${k} ${k === 1 ? one : many}`;

const PRESETS: Preset[] = [
  {
    id: 'tall-middle',
    label: 'One dominant bar',
    blurb:
      '4, 3, 2, 10, 2, 3, 4. The 10 is the tallest bar in the histogram and it contributes nothing at all: a rectangle at height 10 cannot be wider than one bar, so the winner is the full width at height 2, area 14. A dominant bar is worth exactly its own area, and this is the preset that says so.',
    input: { type: 'numbers', values: [4, 3, 2, 10, 2, 3, 4] },
  },
  {
    id: 'rising-staircase',
    label: 'Rising staircase',
    blurb:
      '2, 4, 6, 8, 10. Nothing pops during the scan — the stack only ever grows — and then the sentinel empties it in one burst, measuring widths 1, 2, 3, 4, 5 from the top down. The tallest bar is not the answer: 6 across three bars is 18. This is the preset that makes the sentinel a step rather than a trick.',
    input: { type: 'numbers', values: [2, 4, 6, 8, 10] },
  },
  {
    id: 'falling-staircase',
    label: 'Falling staircase',
    blurb:
      '10, 8, 6, 4, 2. Exactly one pop per arriving bar, and the left boundary is -1 every time, so the widths climb 1, 2, 3, 4 and the areas are 10, 16, 18, 16. The best area comes from the *middle* of the run, not from its tallest bar — the trade this algorithm exists to search.',
    input: { type: 'numbers', values: [10, 8, 6, 4, 2] },
  },
  {
    id: 'plateau',
    label: 'Plateau of equal bars',
    blurb:
      '7, 7, 7, 7. The pop test is a strict `>`, so equal bars never pop each other and the whole plateau sits on the stack until the sentinel takes them one at a time: widths 1, 2, 3, 4 and areas 7, 14, 21, 28. With `>=` the first three would have collapsed as they arrived and the same 28 would be measured once. Same answer, different frames.',
    input: { type: 'numbers', values: [7, 7, 7, 7] },
  },
  {
    id: 'random',
    label: 'Seeded random bars',
    blurb:
      'Nine bars from one seed, with a mix of rises, falls and ties, so the pops come in uneven bursts and the winning rectangle is neither the tallest bar nor the widest run. The everyday case, where the stack earns its keep without anything being especially clever.',
    input: { type: 'numbers', values: randomArray(SEED, 9, 1, 20) },
  },
  {
    id: 'with-zeros',
    label: 'Zero-height walls',
    blurb:
      '4, 0, 6, 2, 5, 0, 3. A zero-height bar is a wall: no rectangle can cross it, and because the pop test is a strict `>` a zero is never popped — not even by the zero-height sentinel. The two zeros stay on the stack to the end, which is not a leak but the correct picture of two walls still standing.',
    input: { type: 'numbers', values: [4, 0, 6, 2, 5, 0, 3] },
  },
  {
    id: 'single',
    label: 'One bar',
    blurb:
      'A single bar of height 7. Nothing to compare, one push, and the sentinel measures it at width 1 — the whole algorithm in three frames, and the sanity check that area = height × 1 for a one-bar histogram.',
    input: { type: 'numbers', values: [7] },
  },
  {
    id: 'empty',
    label: 'Empty',
    blurb:
      'No bars, so no rectangle and an area of 0. The only work is the sentinel itself: the loop runs once over a bar that is not there, pops nothing, and leaves `best` at its initial 0. Degenerate inputs that fall out of doing nothing are the ones worth shipping as a preset.',
    input: { type: 'numbers', values: [] },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const OVERLAY_LABEL = 'stack (bar indices), top on the right';

export function* largestRectangle(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const values = [...source];
  const n = values.length;

  /**
   * Indices of bars whose rectangle is still allowed to grow rightwards, in
   * non-decreasing order of height. Non-decreasing, not increasing: the pop test
   * is a strict `>`, so equal heights are allowed to sit side by side.
   */
  const stack: number[] = [];
  let best = 0;
  /** The bar that produced `best`, and the span it was measured over. */
  let bestIdx = -1;
  let bestLeft = 0;
  let bestRight = -1;
  /** One op per bar visit (the sentinel included) and one per measurement. */
  let ops = 0;

  /**
   * The overlay row, copied every frame.
   *
   * Frames are snapshots; sharing the array would make every frame in the run
   * display the *final* stack, and stepping backwards would show the future.
   */
  const row = (): { label: string; values: number[]; pointers: Record<string, number> } => ({
    label: OVERLAY_LABEL,
    values: [...stack],
    // -1 is not an index of the overlay row, so an empty stack gets no pointer.
    pointers: stack.length > 0 ? { top: stack.length - 1 } : {},
  });

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    caption: n === 0 ? 'No bars' : `${n} bars`,
    note:
      n === 0
        ? 'No bars, so there is no rectangle at all and the answer is 0. The one thing this algorithm must not do on an empty input is look for a bar to compare against, which is what the stack being empty is for.'
        : `${count(n, 'bar', 'bars')} of height ${values.join(', ')}. A rectangle of height H is limited to the widest run of bars at least H tall, and its height is always the height of some bar — so there are only ${count(n, 'candidate height', 'candidate heights')} to consider, and the row underneath is the set of bars whose rectangle is still open to the right.`,
    values: [...values],
    overlay: row(),
    highlight: n > 0 ? { unvisited: range(0, n) } : {},
    ops,
    vars: { n, best, depth: 0, ops },
  };

  // One extra iteration: `i === n` is the sentinel, a virtual bar of height 0.
  for (let i = 0; i <= n; i++) {
    if (ctx.shouldStop()) return;
    ops++;
    const sentinel = i === n;
    const h = sentinel ? 0 : (values[i] as number);
    const topIdx = stack[stack.length - 1];
    const topH = topIdx === undefined ? undefined : (values[topIdx] as number);

    if (sentinel) {
      yield {
        kind: 'array',
        index: 0,
        anchor: 'sentinel',
        caption: 'Sentinel',
        note:
          n === 0
            ? 'The cursor walks off the end of an empty histogram and onto a virtual bar of height 0. There is nothing on the stack to flush, so nothing is measured and the best area stays at its initial 0 — the degenerate case handled by doing nothing at all.'
            : `The cursor has walked off the end of the histogram and onto a virtual bar of height 0 at index ${n}. Nothing is shorter than 0, so every candidate left on the stack is about to be measured with its right boundary at index ${n - 1}, and nothing more can ever arrive. The sentinel is not a bar: it is never pushed, because a rectangle of height 0 has area 0 and there is no cell to draw for it.`,
        values: [...values],
        pointers: { i },
        overlay: row(),
        highlight: {
          picked: [...stack],
          ...(bestIdx >= 0 ? { best: [bestIdx] } : {}),
        },
        ops,
        vars: { n, i, height: 0, depth: stack.length, best, ops },
      };
    } else {
      yield {
        kind: 'array',
        index: 0,
        anchor: 'scan',
        caption: `Bar ${i + 1} of ${n}`,
        note:
          topIdx === undefined
            ? `Bar ${i} has height ${h} and the stack is empty, so there is nothing to compare it against. It becomes a candidate height, and it will only ever be measured if something shorter arrives to its right.`
            : `Bar ${i} has height ${h}. The stack's top is bar ${topIdx} (height ${topH as number}), and ${h < (topH as number) ? `${h} is shorter, so bar ${topIdx} can never grow again — this is the first bar to its right that is too low` : `${h} is at least as tall, so bar ${topIdx} keeps growing to the right through this one and stays a candidate`}.`,
        values: [...values],
        pointers: { i },
        overlay: row(),
        highlight: {
          current: [i],
          picked: [...stack],
          ...(bestIdx >= 0 ? { best: [bestIdx] } : {}),
        },
        ops,
        vars: { n, i, height: h, top: topIdx ?? -1, depth: stack.length, best, ops },
      };
    }

    while (stack.length > 0 && (values[stack[stack.length - 1] as number] as number) > h) {
      if (ctx.shouldStop()) return;
      ops++;
      const j = stack[stack.length - 1] as number;
      const jh = values[j] as number;
      // The listing reads `left` *after* the pop. The generator can show it one
      // frame earlier because nothing has been popped yet, and showing the
      // boundaries before the arithmetic is the point.
      const leftHint = stack.length >= 2 ? (stack[stack.length - 2] as number) : -1;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'pop',
        caption: `Pop bar ${j}`,
        note: `Bar ${j} (height ${jh}) is finished: ${
          sentinel
            ? `the sentinel of height 0 is the first thing to its right that is shorter`
            : `bar ${i} (height ${h}) is the first thing to its right that is shorter`
        }, so its right boundary is index ${i - 1}. ${
          leftHint === -1
            ? 'Nothing is on the stack beneath it, so the left boundary is -1 — a virtual bar outside the histogram, which is exactly why the width counts it.'
            : `Beneath it is bar ${leftHint} (height ${values[leftHint] as number}), the nearest bar to its left that is no taller, so the left boundary is index ${leftHint} and is excluded from the rectangle.`
        }`,
        values: [...values],
        pointers: { i },
        overlay: row(),
        highlight: sentinel
          ? {
              compare: [j],
              picked: stack.slice(0, -1),
              ...(bestIdx >= 0 ? { best: [bestIdx] } : {}),
            }
          : { current: [i], compare: [j], picked: stack.slice(0, -1) },
        ops,
        vars: { n, i, height: h, popped: j, poppedHeight: jh, left: leftHint, right: i - 1, ops },
      };

      stack.pop();
      // Read the new top *after* the pop: it is the exclusive left boundary.
      const left = stack.length > 0 ? (stack[stack.length - 1] as number) : -1;
      const right = i - 1;
      const width = right - left;
      const area = jh * width;
      const previousBest = best;
      const improved = area > best;
      if (improved) {
        best = area;
        bestIdx = j;
        bestLeft = left + 1;
        bestRight = right;
      }

      yield {
        kind: 'array',
        index: 0,
        anchor: 'area',
        caption: `Area ${area}`,
        note: `Height ${jh} × width ${width} — indices ${left + 1} to ${right}, since ${right} - ${left} = ${width} — is area ${area}. ${
          improved
            ? `That beats the best so far, ${previousBest}, so the winner is now bar ${j} over ${count(width, 'bar', 'bars')}.`
            : `That does not beat the best so far, ${previousBest}, which stays. A rectangle is measured once and never retracted, so the only question left here is whether this one is the biggest yet.`
        }`,
        values: [...values],
        pointers: { i },
        overlay: row(),
        highlight: {
          window: range(left + 1, right + 1),
          // When this bar *is* the new best it is marked as the best rather than
          // twice: `compare` would win the cell anyway, and a legend entry
          // pointing at a cell painted in another colour is worse than no entry.
          ...(bestIdx === j ? {} : { compare: [j] }),
          ...(bestIdx >= 0 ? { best: [bestIdx] } : {}),
        },
        ...(improved ? { result: `best area ${best}` } : {}),
        ops,
        vars: { n, i, height: jh, left, right, width, area, best, ops },
      };
    }

    if (!sentinel) {
      stack.push(i);

      yield {
        kind: 'array',
        index: 0,
        anchor: 'push',
        caption: `Bar ${i + 1} of ${n}`,
        note:
          stack.length === 1
            ? `Bar ${i} (height ${h}) is the only candidate left — the pops emptied the stack — so it now carries the whole run on its own, and it will be measured from index ${i} rightwards until something shorter closes it off.`
            : `Bar ${i} (height ${h}) joins the stack, and the heights are non-decreasing from bottom to top again. Its right boundary stays open: it will be measured when a shorter bar arrives to its right, or by the sentinel if none ever does. That is now ${count(stack.length, 'candidate', 'candidates')}, and the top is the tallest of them.`,
        values: [...values],
        pointers: { i },
        overlay: row(),
        highlight: { current: [i], picked: [...stack] },
        ops,
        vars: { n, i, height: h, depth: stack.length, best, ops },
      };
    }
  }

  // The stack is deliberately *not* drained: whatever is left is the honest
  // picture of what the algorithm ended up holding, and on an input with
  // zero-height bars that is a real and interesting answer rather than a leak.
  const leftovers = [...stack];

  yield {
    kind: 'array',
    index: 0,
    anchor: 'done',
    caption: `Area ${best}`,
    note:
      n === 0
        ? 'No bars and no measurements, so the answer is 0. The loop ran once, over the sentinel, and popped nothing — the degenerate case that needs no branch because doing nothing is already the right answer.'
        : `The largest rectangle has area ${best}: height ${values[bestIdx] as number} across ${count(bestRight - bestLeft + 1, 'bar', 'bars')}, indices ${bestLeft} to ${bestRight}. ${count(n + 1, 'visit', 'visits')} including the sentinel, and each bar was pushed once and popped at most once, so the total work is bounded by ${count(2 * n + 1, 'operation', 'operations')} however tall the bars are. The naive version tries all ${count((n * (n + 1)) / 2, 'span', 'spans')} instead.${
            leftovers.length > 0
              ? ` Bar${leftovers.length === 1 ? '' : 's'} ${leftovers.join(' and ')} ${leftovers.length === 1 ? 'is' : 'are'} still standing on the stack: a height-0 bar is never popped, not even by the zero-height sentinel, and a rectangle at height 0 could only ever have area 0.`
              : ''
          }`,
    values: [...values],
    overlay: row(),
    highlight: bestIdx >= 0 ? { answer: [bestIdx], window: range(bestLeft, bestRight + 1) } : {},
    result: String(best),
    ops,
    vars: { n, area: best, bars: bestIdx >= 0 ? bestRight - bestLeft + 1 : 0, ops },
  };
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Bar heights',
      kind: 'numbers' as const,
      default: PRESETS[0]?.input.type === 'numbers' ? PRESETS[0].input.values : [],
    },
  ],
  build: (values: Record<string, unknown>): AlgoInput => ({
    type: 'numbers',
    values: Array.isArray(values.values) ? (values.values as number[]) : [],
  }),
  sizeOf: (input: AlgoInput): number => (input.type === 'numbers' ? input.values.length : 0),
};

/* ------------------------------------------------------------------ *
 * 4. The lesson — four languages, one set of anchors
 *
 * All four return the maximum area as a single integer. The listings are the
 * real algorithm: the animation is a different artefact that happens to agree,
 * and the parity harness is what holds them to it.
 * ------------------------------------------------------------------ */

const JS = `function largestRectangleArea(heights) {
  const stack = [];                                   // @anchor start
  const bars = [...heights, 0];                       // @anchor sentinel
  let best = 0;
  for (let i = 0; i < bars.length; i++) {             // @anchor scan
    while (stack.length > 0 && bars[stack[stack.length - 1]] > bars[i]) {  // @anchor pop
      const j = stack.pop();
      // The new top is the EXCLUSIVE left boundary; -1 means "no bar to the left".
      const left = stack.length > 0 ? stack[stack.length - 1] : -1;
      const right = i - 1;                             // inclusive
      const width = right - left;
      const area = bars[j] * width;                   // @anchor area
      if (area > best) best = area;
    }
    stack.push(i);                                    // @anchor push
  }
  return best;                                        // @anchor done
}`;

const PY = `def largest_rectangle_area(heights):
    stack = []                                        # @anchor start
    bars = list(heights) + [0]                        # @anchor sentinel
    best = 0
    for i in range(len(bars)):                        # @anchor scan
        while stack and bars[stack[-1]] > bars[i]:    # @anchor pop
            j = stack.pop()
            # The new top is the EXCLUSIVE left boundary; -1 means "no bar".
            left = stack[-1] if stack else -1
            right = i - 1                             # inclusive
            width = right - left
            area = bars[j] * width                   # @anchor area
            best = max(best, area)
        stack.append(i)                               # @anchor push
    return best                                       # @anchor done
`;

const JAVA = `import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.Deque;

class LargestRectangle {
    static int largestRectangleArea(int[] heights) {
        Deque<Integer> stack = new ArrayDeque<>();    // @anchor start
        int[] bars = Arrays.copyOf(heights, heights.length + 1);  // @anchor sentinel
        int best = 0;
        for (int i = 0; i < bars.length; i++) {       // @anchor scan
            while (!stack.isEmpty() && bars[stack.peekFirst()] > bars[i]) {  // @anchor pop
                int j = stack.pop();
                // The new top is the EXCLUSIVE left boundary; -1 means "no bar".
                int left = stack.isEmpty() ? -1 : stack.peekFirst();
                int right = i - 1;                    // inclusive
                int width = right - left;
                int area = bars[j] * width;           // @anchor area
                if (area > best) best = area;
            }
            stack.push(i);                            // @anchor push
        }
        return best;                                  // @anchor done
    }
}`;

const CPP = `#include <vector>

int largest_rectangle_area(const std::vector<int>& heights) {
    std::vector<int> stack;                           // @anchor start
    std::vector<int> bars = heights;                  // @anchor sentinel
    bars.push_back(0);
    int best = 0;
    for (int i = 0; i < (int)bars.size(); i++) {      // @anchor scan
        while (!stack.empty() && bars[stack.back()] > bars[i]) {  // @anchor pop
            const int j = stack.back();
            stack.pop_back();
            // The new top is the EXCLUSIVE left boundary; -1 means "no bar".
            const int left = stack.empty() ? -1 : stack.back();
            const int right = i - 1;                  // inclusive
            const int width = right - left;
            const int area = bars[j] * width;         // @anchor area
            if (area > best) best = area;
        }
        stack.push_back(i);                           // @anchor push
    }
    return best;                                      // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'An empty stack and `best = 0`. What the stack holds is the set of bars whose rectangle is still allowed to grow: a bar is a *candidate height*, and it stays until something shorter arrives to its right. Nothing is ever extended to the left after this point, which is the whole reason the left boundary has to be read off the stack rather than remembered separately for every bar.',
    python:
      'An empty list and `best = 0`. The stack holds indices rather than heights on purpose: the answer is an area, an area needs a *width*, and a width can only be measured if you know where the bar is. Storing heights instead would force a search for the boundaries on every pop, which is the O(n²) version wearing a stack as a disguise.',
    java: "An `ArrayDeque<Integer>` and `best = 0`, empty for the same reason the other three are: nothing has been measured yet. The boxed `Integer` is the recurring tax in this listing — every index on the stack is a small allocation — and an `int[]` with a top counter would trade the readability of `push`/`pop` for the absence of the garbage collector's opinion.",
    cpp: 'An empty `std::vector<int>` used as a stack, plus `best = 0`. A `vector` is the right container for exactly the reason `std::stack<int>` is unnecessary here: `push_back` and `pop_back` are both O(1), only the back is ever touched, and `reserve` can be called once if reallocation noise matters. The cleverness in this algorithm is all in the loop, which is worth saying, because this is the algorithm people reach for a bespoke container class for.',
  },
  sentinel: {
    javascript:
      '`[...heights, 0]` copies the input and appends a bar of height 0. Nothing is shorter than 0, so the sentinel itself pops every candidate that is left, and every rectangle gets a right boundary — this line turns "the loop might end with unmeasured bars" into "the loop cannot". The sentinel is not a bar: it is a position, and that is why the animation draws no cell for it.',
    python:
      "`list(heights) + [0]` — a copy plus one element. The copy is needed because the function is answering a question about its input rather than rewriting it, and Python's lists are mutable objects that have to be defended by hand; the other three get the same isolation from a by-value parameter or a fresh array. On an empty input this line is the entire algorithm: one bar, height 0, nothing to pop.",
    java: '`Arrays.copyOf(heights, heights.length + 1)` gives the sentinel bar for free, because Java zero-fills a copied array. That is the same zero-initialisation that makes the "-1 means no answer" sentinel in Next Greater Element a bug you have to write by hand: one language feature is the trap in one algorithm and the solution in the other, which is worth knowing before reaching for it either way.',
    cpp: "A copy of the input plus one element, so the caller's vector is never modified — `const std::vector<int>&` promises that, and the other three have to arrange the same isolation in their own way. The C++-idiomatic alternative is to skip the copy and treat `i == heights.size()` as height 0 inside the loop; that saves an allocation and costs the readability of the sentinel being a real element the comparisons can see.",
  },
  scan: {
    javascript:
      'One pass over the bars, sentinel included. The comparison is against the top of the stack only, and that is sufficient *because* the stack is non-decreasing: if the top is not shorter than the current bar then nothing beneath it is either, so one comparison settles whether anything has finished.',
    python:
      '`for i in range(len(bars))` with the test `bars[stack[-1]] > bars[i]`. The strict `>` is the tie rule of this algorithm and it is not the same choice as in a monotonic next-greater stack: here it lets equal-height bars sit side by side, so a plateau is measured once per bar and its longest run is measured last. `>=` would collapse each plateau as it arrived and reach the same answer with fewer pops — both correct, different frames.',
    java: '`for (int i = 0; i < bars.length; i++)` with `bars[stack.peekFirst()] > bars[i]`, and the single top comparison is again enough precisely because the stack is non-decreasing. `peekFirst` and not `peekLast`, because `Deque.push` adds to the front: mixing the two ends is the classic way this loop silently measures the wrong bar and returns a plausible number.',
    cpp: 'The same single comparison per iteration, with `(int)bars.size()` in the loop bound because the sentinel made the vector one element longer than the input. The signed `int` indices earn their keep on the next lines, where -1 is the "no bar to the left" marker: unsigned would wrap it to a huge number and quietly compute a width in the billions.',
  },
  pop: {
    javascript:
      'The pop condition, and then the two boundaries. `j` leaves the stack because the current bar is the first to its right that is shorter, which fixes the right boundary at `i - 1`; the `left` line then reads the bar *after* the pop, which is the nearest bar to the left of `j` that is no taller. Reading the top *before* the pop — the classic off-by-one — attributes the rectangle to the wrong bar and quietly reports a smaller width.',
    python:
      '`while stack and bars[stack[-1]] > bars[i]`, popping from the end. The `left` value is taken *after* `stack.pop()`, and that is the one line everybody gets wrong the first time: the new top is the exclusive left boundary, so the width is `right - left` and not `right - left - 1`. The animation shows all three numbers on every pop for exactly that reason.',
    java: '`bars[stack.peekFirst()] > bars[i]`, then the boundaries after the pop, where `left` is -1 whenever the stack has just emptied. That is not a special case but the normal "this rectangle reaches the beginning of the histogram" case, and Java needs no `left - 1` fix-up afterwards — the small ergonomic argument for reading the boundary off the stack instead of storing a separate start index per bar.',
    cpp: 'The same pop, with `back()` read into `j` before `pop_back()` and the new `back()` read into `left` after it. That before/after pair is the whole algorithm: a version that reads `back()` once into a local and reuses it will compile, run, and return a number that is wrong. Both are `int` so that -1 is available as a marker at all; `size_t` would make this line impossible to write.',
  },
  area: {
    javascript:
      '`bars[j] * width`, with the height, both boundaries and the width all in `vars` rather than folded into the expression. The right boundary is inclusive and the left is exclusive, which is why the width is `right - left` and why an emptied stack gives `right - (-1)`: the virtual bar at -1 sits one position outside the histogram and is counted.',
    python:
      'One multiplication and one `max`, with no overflow to consider at these sizes — a genuine difference rather than a cosmetic one, since the same line in C++ or Java wraps silently if heights and widths ever grow large, and the verification harness would report a negative area as an ordinary number rather than as an error.',
    java: '`bars[j] * width` in an `int`, which overflows somewhere around 46,000 square units — a real limit for tall histograms, and the reason a production version either widens the type or compares against `long` candidates. The `if (area > best)` that follows is the only update of the running maximum, and it is monotone: a measured rectangle is never retracted.',
    cpp: 'The same multiplication, with the same `int` overflow caveat as the Java version and one extra wrinkle: the product is computed before the comparison, so a wrapped value compares as a small or negative number, loses to `best`, and the failure mode is a wrong answer with no diagnostic rather than a crash.',
  },
  push: {
    javascript:
      "The arriving index joins the stack unconditionally, and the while loop above has already removed everything taller, so the stack is non-decreasing again the moment this line returns. The bar's right boundary stays open: it will be measured when a shorter bar arrives to its right, or by the sentinel if none ever does.",
    python:
      '`stack.append(i)`, and for the sentinel iteration this pushes a height-0 bar that nothing will ever pop, because nothing is shorter than 0. That is harmless — a rectangle of height 0 has area 0 and cannot beat a real best — and the animation skips the same push, because there is no cell to draw for a bar that does not exist.',
    java: '`stack.push(i)`, boxing the index into an `Integer`. On the final iteration this pushes the sentinel exactly as the other three do, and the only difference from the animation is that the animation has no cell to put it in. The sentinel on the stack is not a leak: it is a bar of height 0, and area 0 can never win.',
    cpp: '`stack.push_back(i)`, on a vector that is never reserved and so grows by doubling. The sentinel is pushed here and not in the animation, for the reason given in the `sentinel` note; the two artefacts disagree about exactly one bar, and that bar is incapable of contributing anything to the answer.',
  },
  done: {
    javascript:
      'The maximum area, read straight off `best`. The loop ran n + 1 times and every bar was pushed once and popped at most once, so the number of measurements is bounded by n however tall the bars get — and the pop loop *looking* quadratic is the whole reason it is worth having a stack rather than the three-line span enumerator it replaces.',
    python:
      'One integer back, with no second pass, no sorting and no prefix arrays: the answer falls out of the pops, and each bar is measured exactly once. The naive version — every `(left, right)` span with a running minimum — is the `expectations` reference in this module, and running both is the fastest way to see what the stack bought.',
    java: 'The single `int` return, and the empty case needs no branch: an empty input produces a one-element array holding just the sentinel, the loop pops nothing, and `best` is still the 0 it started as. Worth noticing, because the naive version needs an explicit "no bars" guard and this one gets the right answer from doing nothing at all.',
    cpp: 'Returned by value, which for an `int` is a copy — the one place in this family where "returned by value is moved" does not apply. The stack is a local and dies with the function; only the area survives, which is about as compact a result as this curriculum gets.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'largestRectangleArea',
    python: 'largest_rectangle_area',
    java: 'LargestRectangle.largestRectangleArea',
    cpp: 'largest_rectangle_area',
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

/**
 * The claim, computed the obviously-correct way: try every span, keep the
 * running minimum height, take `min × width`.
 *
 * Deliberately O(n²) and deliberately shaped nothing like the stack version.
 * The stack is the thing under test, so its expectation has to be independent
 * of it — a reference that shared the stack's reasoning would agree with the
 * stack even when the stack is wrong, which is the failure this project treats
 * as its worst.
 */
export function referenceLargestRectangle(values: number[]): number {
  let best = 0;
  for (let left = 0; left < values.length; left++) {
    let shortest = Number.POSITIVE_INFINITY;
    for (let right = left; right < values.length; right++) {
      shortest = Math.min(shortest, values[right] as number);
      const area = shortest * (right - left + 1);
      if (area > best) best = area;
    }
  }
  return best;
}

const valuesOf = (p: Preset): number[] => (p.input.type === 'numbers' ? p.input.values : []);

const expectations: Expectation[] = PRESETS.map((p) => {
  const values = valuesOf(p);
  return { presetId: p.id, args: [values], result: referenceLargestRectangle(values) };
});

export const largestRectangleAlgo: AlgoDef<ArrayFrame> = {
  id: 'largest-rectangle',
  title: 'Largest Rectangle in a Histogram',
  category: 'stacks-queues',
  summary:
    'Keep a non-decreasing stack of candidate heights. A shorter bar closes off the stack top, whose widest rectangle runs from just after the new stack top to the bar before the current one — and a zero-height sentinel at the end closes off everything that is left.',
  intuition:
    'Reach for this when the input is a *histogram* and the question is about an axis-aligned rectangle, because the stack version is the only formulation that stays linear on a million bars — the naive span scan is 500 billion comparisons there. The same shape turns up in "container with most water" (swap the roles of height and width), in maximal-rectangle problems derived from a binary matrix where each row is a histogram, and in the largest-area-parallelogram-in-a-triangle problem, which starts from this observation and then spends most of its effort on the cases the stack does not cover. If your heights are floats rather than integers a histogram is no longer quite the right model, and you want a convex hull instead.',
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(n)',
    note: 'Amortised O(n) because every bar is pushed exactly once and popped at most once, so a single arriving bar cannot cost more than the pops it causes and those total at most n. The space is O(n) for the stack in the worst case — a strictly *decreasing* histogram never pops until the sentinel and holds every index — and O(1) on a strictly increasing one, where it never holds more than one bar and the whole run of measurements happens in the sentinel burst. The `online` flag needs the same caveat the next-greater stack does: the final burst is an end-of-input event, so an endless stream would need that flush exposed as a separate call.',
  },
  traits: {
    inPlace: false,
    online: true,
    allowsDuplicates: true,
    tags: ['monotonic stack', 'one pass', 'amortised O(1)', 'sentinel bar', 'histogram'],
  },
  viewport: 'array',
  level: 'intermediate',
  params: [],
  inputSpec,
  presets: PRESETS,
  run: largestRectangle,
  lesson,
  expectations,
  formatResult: (r) => `largest area ${r as number}`,
  anchors: ['start', 'sentinel', 'scan', 'pop', 'area', 'push', 'done'],
};

export default largestRectangleAlgo;
