import { byLanguage } from '../../code/anchors.ts';
import { randomArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { LinearFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Min Stack — a stack that can also answer "what is the smallest thing here?"
 * in O(1).
 *
 * This is the one algorithm in the family where the *auxiliary structure is the
 * entire lesson*, so the frame carries two rows: `values` is the data stack and
 * `overlay` is a second, equal-length stack holding the running minimum at each
 * depth. Push grows both; pop shrinks both; the top of the auxiliary stack is
 * always the answer.
 *
 * The subtlety is what the auxiliary stack stores on a push that is *not* a new
 * minimum: it stores the **previous minimum again**, not the new value. That is
 * what keeps the two stacks the same length, which is what makes the pop a plain
 * two-step shrink with nothing to search or scan. The alternative — store only
 * the depths at which the minimum changed, and search backwards on a pop — uses
 * less memory and turns every pop into a linear scan, which is the trade the
 * "compressed" variant makes.
 *
 * ## A note on the viewport
 *
 * `linear` with `flavour: 'stack'`, and the running-minimum stack in `overlay`.
 *
 * That `overlay` field on `LinearFrame` did not exist when this module was first
 * written, and the author used `array` + `ArrayFrame.overlay` instead rather than
 * change the contract — a defensible call. It is now `linear`, because the whole
 * lesson of a min-stack is the *correspondence* between two stacks, and a stack
 * drawn as bars is a category error. `LinearFrame.overlay` was added for exactly
 * this case; see plan §3.2.
 *
 * The traced operation is: push every input value in order, then pop until one
 * element is left, recording the running minimum after each pop. The return value
 * is those minima, comma-joined, with the final minimum last.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 613;

const ascending = [4, 9, 12, 18, 23];
/** A seed where the minimum is set early, then re-set in the middle. */
const seededMixed = randomArray(SEED + 4, 8, 1, 40);
/** Descending: every single push is a new minimum, so the auxiliary stack changes fully. */
const everyPushNewMin = [...randomArray(SEED, 7, 1, 9)].sort((a, b) => b - a);

const PRESETS: Preset[] = [
  {
    id: 'descending-then-low',
    label: 'Minimum moves both ways',
    blurb:
      '7, 3, 9, 2, 8, 1, 5. The running minimum drops to 1 in the middle and climbs back to 7 as the stack empties, so the auxiliary stack shrinks and the answer rises — which is the case a single stored minimum cannot express.',
    input: { type: 'numbers', values: [7, 3, 9, 2, 8, 1, 5] },
  },
  {
    id: 'seeded-mixed',
    label: 'Seeded, minimum set twice',
    blurb:
      'A seeded run where the minimum is 2 for four pushes and 1 for the next four. Nothing is predictable about the shape, which is the point: the auxiliary stack tracks whatever the data does, and every pop reads its top.',
    input: { type: 'numbers', values: seededMixed },
  },
  {
    id: 'first-is-the-min',
    label: 'First value is the minimum',
    blurb:
      '4, 9, 12, 18, 23. Ascending, so the very first push sets the minimum and nothing ever beats it — the auxiliary stack degenerates into the same value repeated. The worst case for this design: O(n) memory to store a constant.',
    input: { type: 'numbers', values: ascending },
  },
  {
    id: 'duplicate-minimum',
    label: 'Duplicated minimum',
    blurb:
      '5, 5, 3, 3, 9. Two values tie for the minimum, and the second 3 is pushed *on top of* the first. Popping exposes a 5 while a 3 was the minimum a moment ago — the case that shows why the auxiliary stack has to be per-depth and not per-value.',
    input: { type: 'numbers', values: [5, 5, 3, 3, 9] },
  },
  {
    id: 'every-push-new-min',
    label: 'Every push is a new minimum',
    blurb:
      'Descending order, so each push beats the previous minimum and the auxiliary stack changes on every single frame. The mirror image of "first value is the minimum": here the auxiliary stack never repeats anything.',
    input: { type: 'numbers', values: everyPushNewMin },
  },
  {
    id: 'single',
    label: 'One value',
    blurb:
      'One push, no pops at all, and the final minimum is simply the value itself. The degenerate case: the auxiliary stack has exactly one entry and `getMin` is a constant-time read of it.',
    input: { type: 'numbers', values: [42] },
  },
  {
    id: 'empty',
    label: 'Empty',
    blurb:
      'Nothing was ever pushed, so there is no minimum at all. This is why the return value is a string rather than a number: `getMin` on an empty stack is undefined in every language, and "" is the one shape all four can agree on.',
    input: { type: 'numbers', values: [] },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const OVERLAY_LABEL = 'running minimum at each depth';

export function* minStack(ctx: RunContext): Generator<LinearFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const values = [...source];

  /** The auxiliary stack: `mins[d]` is the smallest value in the bottom d+1 slots. */
  const mins: number[] = [];
  /** The data stack, shrunk in lockstep with `mins`. */
  const stack: number[] = [];
  let ops = 0;

  yield {
    kind: 'linear',
    flavour: 'stack',
    index: 0,
    anchor: 'start',
    caption: 'Empty',
    note:
      values.length === 0
        ? 'Nothing will be pushed, so there is no minimum to report — the answer is the empty string. A real min-stack would say "underflow" here rather than answer at all.'
        : `${values.length} value${values.length === 1 ? '' : 's'} to push, then pop back down to one. Two stacks of equal length: the values, and the smallest value seen so far at each depth. The top of the second stack is the answer, and keeping them the same length is what makes a pop a two-step shrink with nothing to search.`,
    items: [...stack],
    edges: { top: Math.max(0, stack.length - 1) },
    overlay: { label: OVERLAY_LABEL, values: [...mins], pointers: {} },
    highlight: {},
    vars: { depth: 0, ops },
  };

  for (const v of values) {
    if (ctx.shouldStop()) return;
    ops++;
    const prev = mins[mins.length - 1];
    const isNewMin = prev === undefined || v < prev;
    stack.push(v);
    // On a push that is not a new minimum, the *previous* minimum is stored again.
    mins.push(isNewMin ? v : prev);

    yield {
      kind: 'linear',
      flavour: 'stack',
      index: 0,
      anchor: 'push',
      caption: `Push ${v}`,
      note: isNewMin
        ? `Push ${v}. It is below the previous minimum of ${prev as number}, so the auxiliary stack records ${v} — its own top changes to match.`
        : `Push ${v}. It is not below the minimum of ${prev as number}, so the auxiliary stack records **${prev as number} again** rather than ${v}. That repetition is the trick: the two stacks stay the same length, so a pop never has to search.`,
      items: [...stack],
      edges: { top: Math.max(0, stack.length - 1) },
      overlay: { label: OVERLAY_LABEL, values: [...mins], pointers: { top: mins.length - 1 } },
      // A stack can be empty here (an underflow pop), and -1 is not an index.
      // The guard is the fix: an empty stack simply has nothing to mark.
      highlight: stack.length > 0 ? { current: [stack.length - 1] } : {},
      ops,
      vars: {
        v,
        running: mins[mins.length - 1] as number,
        depth: stack.length,
        newMin: isNewMin,
        ops,
      },
    };
  }

  // Pop back down to one element, reading the running minimum after each pop.
  while (stack.length > 1) {
    if (ctx.shouldStop()) return;
    ops++;
    const popped = stack.pop() as number;
    mins.pop();

    yield {
      kind: 'linear',
      flavour: 'stack',
      index: 0,
      anchor: 'pop',
      caption: `Pop ${popped}`,
      note: `Pop ${popped} off the data stack and pop the auxiliary stack in the same breath. No comparison, no scan, no rollback: the two stacks are the same length by construction, so ${mins[mins.length - 1] as number} is now the minimum of everything that remains.`,
      items: [...stack],
      edges: { top: Math.max(0, stack.length - 1) },
      overlay: { label: OVERLAY_LABEL, values: [...mins], pointers: { top: mins.length - 1 } },
      // A stack can be empty here (an underflow pop), and -1 is not an index.
      // The guard is the fix: an empty stack simply has nothing to mark.
      highlight: stack.length > 0 ? { current: [stack.length - 1] } : {},
      ops,
      vars: { popped, depth: stack.length, ops },
    };

    yield {
      kind: 'linear',
      flavour: 'stack',
      index: 0,
      anchor: 'peek',
      caption: 'getMin()',
      note: `\`getMin\` returns ${mins[mins.length - 1] as number} — the top of the auxiliary stack, one array read. Compare that with rescanning the data stack, which would be ${stack.length} comparisons for the same answer.`,
      items: [...stack],
      edges: { top: Math.max(0, stack.length - 1) },
      overlay: { label: OVERLAY_LABEL, values: [...mins], pointers: { top: mins.length - 1 } },
      highlight: stack.length > 0 ? { answer: [stack.length - 1] } : {},
      ops,
      vars: { min: mins[mins.length - 1] as number, depth: stack.length, ops },
    };
  }

  const last = stack[0];
  yield {
    kind: 'linear',
    flavour: 'stack',
    index: 0,
    anchor: 'done',
    caption: 'Done',
    note:
      last === undefined
        ? 'The stack never held anything, so there is no minimum and the result is the empty string. Four languages cannot agree on "no answer" any other way.'
        : `The last value standing is ${last}, and it is also the minimum of the whole input — which is the sanity check on the entire run: pop everything and the minimum must be the global one. ${ops} operation${ops === 1 ? '' : 's'}.`,
    items: [...stack],
    edges: { top: Math.max(0, stack.length - 1) },
    overlay: {
      label: OVERLAY_LABEL,
      values: [...mins],
      pointers: mins.length > 0 ? { top: mins.length - 1 } : {},
    },
    highlight: last === undefined ? {} : { answer: [0] },
    result: 'minimum',
    ops,
    vars: { depth: stack.length, ops },
  };
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Values to push',
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
 * The listings are the real thing: an `O(1)` `getMin` on top of the stack, not
 * the push/pop trace the animation shows. The return value is a comma-joined
 * string of the running minimum observed after each pop, with the final minimum
 * last — a string because "no minimum at all" has no shared representation.
 * ------------------------------------------------------------------ */

const JS = `function minStackTrace(values) {
  const stack = [];                                // the data stack
  const mins = [];                                 // @anchor start  the auxiliary stack, one entry per depth
  for (const v of values) {
    stack.push(v);                                 // @anchor push
    // A push that is not a new minimum stores the previous minimum AGAIN,
    // which is what keeps the two stacks the same length.
    const prev = mins.length ? mins[mins.length - 1] : null;
    mins.push(prev === null || v < prev ? v : prev);
  }
  const out = [];
  while (stack.length > 1) {
    stack.pop();                                   // @anchor pop
    mins.pop();
    out.push(String(mins[mins.length - 1]));       // @anchor peek
  }
  if (stack.length === 0) return '';               // @anchor done
  out.push(String(stack[0]));
  return out.join(',');
}`;

const PY = `def min_stack_trace(values):
    stack = []                                     # the data stack
    mins = []                                      # @anchor start  one entry per depth
    for v in values:
        stack.append(v)                            # @anchor push
        # Not a new minimum? Store the previous minimum AGAIN, so both
        # stacks stay the same length and a pop never has to search.
        mins.append(v if not mins or v < mins[-1] else mins[-1])
    out = []
    while len(stack) > 1:
        stack.pop()                                # @anchor pop
        mins.pop()
        out.append(str(mins[-1]))                  # @anchor peek
    if not stack:
        return ""                                  # @anchor done
    out.append(str(stack[0]))
    return ",".join(out)
`;

const JAVA = `import java.util.ArrayList;
import java.util.List;

class MinStack {
    static String minStackTrace(int[] values) {
        List<Integer> stack = new ArrayList<>();    // the data stack
        List<Integer> mins = new ArrayList<>();     // @anchor start  one entry per depth
        for (int v : values) {
            stack.add(v);                           // @anchor push
            // Not a new minimum? Store the previous minimum AGAIN, so both
            // stacks stay the same length and a pop never has to search.
            Integer prev = mins.isEmpty() ? null : mins.get(mins.size() - 1);
            mins.add(prev == null || v < prev ? v : prev);
        }
        List<String> out = new ArrayList<>();
        while (stack.size() > 1) {
            stack.remove(stack.size() - 1);         // @anchor pop
            mins.remove(mins.size() - 1);
            out.add(String.valueOf(mins.get(mins.size() - 1)));  // @anchor peek
        }
        if (stack.isEmpty()) return "";             // @anchor done
        out.add(String.valueOf(stack.get(0)));
        return String.join(",", out);
    }
}`;

const CPP = `#include <string>
#include <vector>

std::string min_stack_trace(const std::vector<int>& values) {
    std::vector<int> stack;                        // the data stack
    std::vector<int> mins;                         // @anchor start  one entry per depth
    for (size_t i = 0; i < values.size(); i++) {
        int v = values[i];
        stack.push_back(v);                        // @anchor push
        // Not a new minimum? Store the previous minimum AGAIN, so both
        // stacks stay the same length and a pop never has to search.
        bool empty = mins.empty();
        int prev = empty ? 0 : mins.back();
        mins.push_back(empty || v < prev ? v : prev);
    }
    std::string out;
    while (stack.size() > 1) {
        stack.pop_back();                          // @anchor pop
        mins.pop_back();
        if (!out.empty()) out += ",";
        out += std::to_string(mins.back());        // @anchor peek
    }
    if (stack.empty()) return "";                  // @anchor done
    if (!out.empty()) out += ",";
    out += std::to_string(stack.back());
    return out;
}`;

const NOTES = {
  start: {
    javascript:
      'Two arrays, kept the same length on purpose. `mins` does **not** store "the minimum so far" once — it stores the minimum *at every depth*, so `mins[d]` is the smallest of the bottom d+1 elements. That is the whole design: it trades a second array for a pop that is one element cheaper than the data pop it accompanies.',
    python:
      'Two lists, deliberately the same length. Note the invariant this creates, and it is worth writing down: `mins[i] == min(stack[:i+1])` for every `i`. A single stored minimum would also be O(1) to read, but restoring it after a pop would mean rescanning — this is the design choice that makes the pop constant time.',
    java: 'Two `ArrayList<Integer>`s, and the boxing is the tax Java pays for the design. Every push allocates an `Integer`, so a min-stack costs one extra allocation per push that a `int[]`-plus-index implementation would not. In exchange, `getMin` is `mins.get(mins.size() - 1)` — a bounds-checked array read, with no `Math.min` call in sight. Note also that `prev == null` is reference comparison, which is correct here only because `prev` can only be null or a boxed value that was never null.',
    cpp: 'Two `std::vector<int>`s, and this is the language where the design is closest to free: no boxing, no indirection, and `mins.back()` is a single load. The `empty ? 0 : mins.back()` dance is only there because `back()` on an empty vector is undefined behaviour — a real implementation would use a sentinel or `mins.empty() ? v : std::min(v, mins.back())`, which reads better and has no undefined case at all.',
  },
  push: {
    javascript:
      'Two pushes, one value and one minimum. The decision is the whole algorithm: below the previous minimum, store the new value; otherwise store the previous minimum **again**. Repeating it is what keeps the arrays aligned, and it costs a duplicated entry rather than a search on pop.',
    python:
      '`mins.append(v if not mins or v < mins[-1] else mins[-1])` in one line. The `not mins` guard is the empty-stack case, and without it the very first push raises `IndexError` — the initialisation is inside the loop, not before it, which is why it needs the guard at all.',
    java: 'The data push and the minimum push happen together, always. The ternary re-reads `mins.get(mins.size() - 1)` conceptually on both branches, so the value is computed once into `prev` first — a small readability cost that avoids a second list lookup and, more importantly, keeps the two branches obviously symmetric.',
    cpp: 'One push each, with a `std::min`-shaped decision inlined. Note the comparison is `<` and not `<=`: on a tie, the *earlier* minimum is stored again, which is the same value, so the choice is invisible here — but it is not invisible if you ever change the auxiliary stack to store indices, which is how the "compressed" variant identifies which element set the current minimum.',
  },
  pop: {
    javascript:
      'Two pops, no comparisons, no scanning. The invariant that the two arrays are the same length is doing all the work: whichever minimum was recorded for the depth being removed is exactly the one no longer needed, and the one beneath it is the answer for the depth that remains.',
    python:
      '`stack.pop()` and `mins.pop()`, and the second one is what a naive implementation forgets. Because both lists were appended to in lockstep, popping both is enough — there is no state anywhere that says "the minimum was set by this particular element", which is precisely why this design cannot answer a `getMinNode()` question.',
    java: '`remove(size() - 1)` rather than a `pop`-style helper, because `ArrayList` has no pop: removing the last element is `remove` at the last index, and every call re-checks the bounds. `LinkedList` would give you `removeLast()` and pay a pointer chase per element instead — the classic wrong-data-structure choice for a structure accessed only at one end.',
    cpp: 'Two `pop_back` calls, and `pop_back` on a `std::vector` is trivially cheap: the size is decremented and the destructor runs on the element, which for `int` is a no-op. That is the language where the two-parallel-vectors design is essentially free, and also the language where you should remember that `vector::pop_back` on an empty vector is undefined behaviour — the `while (size() > 1)` guard is the only thing making this safe.',
  },
  peek: {
    javascript:
      'One array read. This is the payoff the whole auxiliary stack exists for: after a pop, "what is the smallest remaining value" is `mins[mins.length - 1]` and nothing else. Rescanning `stack` would give the same answer in `stack.length` comparisons, which is the difference between O(1) and O(n) per query.',
    python:
      '`mins[-1]` — negative indexing, so no length arithmetic and no bounds check beyond the list\'s own. This is the idiomatic Python spelling of "the top of the stack", and it is the line the entire auxiliary structure is in service of. Note the result is stringified immediately: the trace records what `getMin` returned, not the stack.',
    java: "`mins.get(mins.size() - 1)`, an indexed `ArrayList` read, which is a bounds check plus a field load. Java has no way to make that unchecked in ordinary code, so the honest framing is that `getMin` is O(1) *with* a bounds check — the same thing every `List` accessor costs, and the reason the JDK's own `AbstractList` documents the cost rather than pretending it away.",
    cpp: '`mins.back()`, an unchecked read of the last element. Note the asymmetry that makes this design awkward in a typed language: `back()` is unchecked here *because* the `while` loop condition already proved the vector is non-empty. Strip the guard and this line becomes undefined behaviour that a compiler will happily optimise around.',
  },
  done: {
    javascript:
      'Pop back to one element and report it. The empty-stack case is the reason the return type is a string and not a number: `getMin` on an empty stack is `undefined` in JavaScript, `None` in Python, a `NullPointerException` in Java, and `mins.back()` on an empty vector in C++ — four different failures, so the harness needs a shape all four can produce.',
    python:
      '`if not stack: return ""` handles the underflow, and the trailing `stack[0]` is both the final minimum and the sanity check on the whole run: after popping everything, the minimum must be the global minimum. Python would raise `IndexError` on the empty case, which is why the guard is explicit rather than implicit.',
    java: 'The underflow check and then the join. `String.join` is Java 8 and later, and it is the reason the four listings can agree on a string: it is the same comma-join the other three perform with `Array.join`, `str.join` and string `+=` respectively, and the harness compares the result rather than the method used to build it.',
    cpp: 'The final `std::to_string(stack.back())` and the return. Note that the auxiliary stack is never explicitly consulted for the final answer — the one remaining value is trivially its own minimum — which is a small hint that this particular framing of the algorithm is a teaching device rather than the API a real min-stack would expose.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'minStackTrace',
    python: 'min_stack_trace',
    java: 'MinStack.minStackTrace',
    cpp: 'min_stack_trace',
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
 * The claim: push everything, pop back to one, and return the running minimum
 * seen after each pop followed by the final minimum, comma-joined.
 */
const traceOf = (values: number[]): string => {
  const mins: number[] = [];
  for (const v of values) {
    const prev = mins[mins.length - 1];
    mins.push(prev === undefined || v < prev ? v : prev);
  }
  const stack = [...values];
  const out: number[] = [];
  while (stack.length > 1) {
    stack.pop();
    mins.pop();
    out.push(mins[mins.length - 1] as number);
  }
  if (stack.length === 0) return '';
  out.push(stack[0] as number);
  return out.join(',');
};

const valuesOf = (p: Preset): number[] => (p.input.type === 'numbers' ? p.input.values : []);

const expectations: Expectation[] = PRESETS.map((p) => {
  const values = valuesOf(p);
  return { presetId: p.id, args: [values], result: traceOf(values) };
});

export const minStackAlgo: AlgoDef<LinearFrame> = {
  id: 'min-stack',
  title: 'Min Stack',
  category: 'stacks-queues',
  summary:
    'Keep a second stack of running minima, one entry per depth, so that after any pop the smallest remaining value is the top of that stack.',
  intuition:
    'Reach for this when you need O(1) "smallest so far" on a structure whose whole point is that it only accepts at one end and gives things back in reverse — a sliding-window minimum, a monotonic-stack pipeline, a rollback system that has to report its cheapest state, a priority queue with a bounded lifespan. If you can afford O(n) per query, do not build this: a single stored minimum plus a rescan on pop is simpler and uses O(1) memory. If the structure is not stack-shaped, use a real heap and do not pretend otherwise.',
  complexity: {
    best: 'O(1)',
    average: 'O(1)',
    worst: 'O(1)',
    space: 'O(n)',
    note: 'Push, pop and getMin are all O(1) amortised, and getMin is O(1) *worst* case — that is the entire point. The price is a second array the same length as the data: O(n) extra memory to make one query free. The "first value is the minimum" preset is the pathological case, n extra slots to store one repeated number.',
  },
  traits: {
    stable: true,
    inPlace: false,
    online: true,
    allowsDuplicates: true,
    tags: ['O(1) getMin', 'two stacks', 'pushdown automaton', 'space for speed'],
  },
  viewport: 'linear',
  level: 'intermediate',
  params: [],
  inputSpec,
  presets: PRESETS,
  run: minStack,
  lesson,
  expectations,
  formatResult: (r) => `minima: ${String(r)}`,
  anchors: ['start', 'push', 'pop', 'peek', 'done'],
};

export default minStackAlgo;
