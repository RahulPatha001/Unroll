import { byLanguage } from '../../code/anchors.ts';
import { distinctArray, fewDistinctArray, randomArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Next Greater Element — a monotonic **decreasing** stack, and the stack is the
 * whole lesson.
 *
 * For every index, the question is: *what is the first value to my right that
 * beats me?* Asked naively, that is an O(n²) scan outwards from every index. The
 * trick is to notice that the questions are nested — the indices still waiting
 * form a run, and when a new value arrives it can answer a whole suffix of that
 * run at once.
 *
 * The invariant is one line: **the stack holds the indices whose answer is
 * still unknown, in non-increasing order of value.** So:
 *
 *   - the top of the stack is the *smallest* value still waiting, which makes it
 *     the first to be beaten by whatever arrives next;
 *   - when the arriving value pops an index, that value is not merely *a*
 *     greater element, it is the *nearest* one — because anything in between was
 *     already seen and was not greater, or the index would have been popped
 *     earlier. That sentence is the correctness argument, and the animation is
 *   - built so a student can watch it happen;
 *   - every index is pushed once and popped at most once, which is the O(n).
 *
 * `non-increasing`, not strictly decreasing: the pop test is a strict `<`, so
 * an *equal* value to the right does not answer anything — it is not greater —
 * and the two equal values sit side by side on the stack. The "all values equal"
 * preset is nothing but that case, and it is the one that fails if you write
 * `<=` by accident.
 *
 * ## Why the overlay row
 *
 * `ArrayFrame.overlay` carries the stack, as **indices**, under a row of values.
 * That is deliberate and it is the only way to make this legible: the algorithm
 * never writes to the input array, so rendering the input alone would show a
 * student a picture that does not change at all while the entire computation
 * happens off-screen. The index rather than the value, because the answer array
 * is keyed by index and the "nearest" argument is an argument about positions.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 631;

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

const PRESETS: Preset[] = [
  {
    id: 'random',
    label: 'Seeded random run',
    blurb:
      'Nine values from one seed, so the shape is decided by data rather than by construction: a couple of single answers, at least one arriving value that pops a whole run of waiting indices at once, and a few indices left over at the end. This is the case that shows what a *batch* answer looks like.',
    input: { type: 'numbers', values: randomArray(SEED, 9, 5, 95) },
  },
  {
    id: 'ascending',
    label: 'Strictly ascending',
    blurb:
      'Every value beats the one before it, so the stack never holds more than one index and every answer is the value immediately to the right. The best case: exactly one push and one pop per step, and the batch pop never happens.',
    input: {
      type: 'numbers',
      values: distinctArray(SEED + 3, 8, 5, 95).sort((a, b) => a - b),
    },
  },
  {
    id: 'descending',
    label: 'Strictly descending',
    blurb:
      'Nothing ever pops during the scan, because nothing bigger ever arrives. Every index is still waiting when the cursor runs off the end, so the whole array is the "no greater element" case and the answer is eight -1s. This is also the worst case for the stack\'s memory: it holds n indices to answer nothing.',
    input: {
      type: 'numbers',
      values: distinctArray(SEED + 6, 8, 5, 95).sort((a, b) => b - a),
    },
  },
  {
    id: 'all-equal',
    label: 'All values equal',
    blurb:
      'Seven identical values. The pop test is a strict `<`, so an equal value to the right is not a greater element and nothing is ever answered: the answer is seven -1s and the stack is seven deep. Change the `<` to `<=` and this preset becomes a run of one-bar answers — which is the cheapest possible way to see why the comparison is strict.',
    input: { type: 'numbers', values: fewDistinctArray(SEED + 9, 7, 1, 5) },
  },
  {
    id: 'single',
    label: 'One value',
    blurb:
      'One index, nothing to compare against, and nothing to its right. The stack holds it for one frame and then the flush tells it that no answer exists. The degenerate case where the sentinel and the stack are both load-bearing.',
    input: { type: 'numbers', values: [42] },
  },
  {
    id: 'empty',
    label: 'Empty',
    blurb:
      'No indices, so no questions and an empty answer. Worth keeping as a preset rather than trusting: "no answer exists" and "there was nothing to ask" are the same array and are reached by completely different code paths.',
    input: { type: 'numbers', values: [] },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

/** The answer for an index with no greater element to its right. */
const NO_ANSWER = -1;

const OVERLAY_LABEL = 'stack (indices), top on the right';

/** `count(2, 'index', 'indices')` -> "2 indices". English plurals do not compose. */
const count = (k: number, one: string, many: string): string => `${k} ${k === 1 ? one : many}`;

export function* nextGreaterElement(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const values = [...source];
  const n = values.length;

  /** Indices whose next greater element has not been seen yet. */
  const stack: number[] = [];
  /** `answer[i]` is the first value to the right of `i` that beats `values[i]`. */
  const answer: number[] = new Array<number>(n).fill(NO_ANSWER);
  /** Indices with a real answer, in the order they were answered. */
  const resolved: number[] = [];
  /**
   * One op per visit and one per answer. Every index is answered exactly once —
   * either by a pop during the scan or by the flush at the end — so a complete
   * run is exactly 2n. The presets do not change that number, which is the
   * linearity claim in a form a test can assert.
   */
  let ops = 0;

  /**
   * The overlay row, as a fresh copy every time.
   *
   * Sharing the array would be the classic frame bug: every frame would show the
   * *final* stack, and stepping backwards would display the future.
   */
  const row = (): { label: string; values: number[]; pointers: Record<string, number> } => ({
    label: OVERLAY_LABEL,
    values: [...stack],
    // -1 is not an index of the overlay row, so an empty stack has no pointer.
    pointers: stack.length > 0 ? { top: stack.length - 1 } : {},
  });

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    caption: `${n} value${n === 1 ? '' : 's'}`,
    note:
      n === 0
        ? 'Nothing to scan: with no elements there is no index to answer for, so the answer is the empty array and the stack stays empty for the whole run. The second row is not decoration — it is the only record of which indices are still waiting.'
        : `Nothing has been scanned and nothing is waiting. Each of the ${count(n, 'value', 'values')} either gets answered by a later value that beats it or ends the run still holding ${NO_ANSWER}, and the row underneath — the stack of unanswered indices — is what tells the two apart.`,
    values: [...values],
    overlay: row(),
    highlight: n > 0 ? { unvisited: range(0, n) } : {},
    ops,
    vars: { n, waiting: 0, answered: 0, ops },
  };

  for (let i = 0; i < n; i++) {
    if (ctx.shouldStop()) return;
    ops++;
    const x = values[i] as number;
    const topIdx = stack[stack.length - 1];
    const topVal = topIdx === undefined ? undefined : (values[topIdx] as number);
    // The tie case gets its own sentence: "equal" is where the strict `<` shows up,
    // and it is the only comparison this algorithm gets wrong by accident.
    const verdict =
      x > (topVal as number)
        ? `${x} beats ${topVal as number}, so index ${topIdx} is answered right here`
        : x === (topVal as number)
          ? `both are ${x}, and an equal value is not *greater*, so the strict < leaves index ${topIdx} waiting`
          : `${topVal as number} is not smaller than ${x}, so index ${topIdx} keeps waiting`;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'scan',
      caption: `Step ${i + 1} of ${n}`,
      note:
        topIdx === undefined
          ? `Index ${i} (value ${x}) is the first value in, so there is nothing on the stack to compare against and nothing to pop. Every value to its right is a candidate answer, and the nearest of them wins.`
          : `Index ${i} (value ${x}) arrives with ${count(stack.length, 'index', 'indices')} still waiting. The top is index ${topIdx} (value ${topVal as number}), and ${verdict}.`,
      values: [...values],
      pointers: { i },
      overlay: row(),
      highlight: {
        current: [i],
        picked: [...stack],
        ...(resolved.length > 0 ? { output: [...resolved] } : {}),
      },
      ops,
      vars: {
        n,
        i,
        x,
        top: topVal ?? NO_ANSWER,
        waiting: stack.length,
        answered: resolved.length,
        ops,
      },
    };

    // The batch pop. Emitted *before* each pop so the index about to be answered
    // is still drawn on the stack, and once per pop rather than collapsed into a
    // single "popped 3 indices" frame — the sequence of tops falling is the part
    // a student has to see.
    let answeredHere = 0;
    while (stack.length > 0 && (values[stack[stack.length - 1] as number] as number) < x) {
      if (ctx.shouldStop()) return;
      ops++;
      const j = stack[stack.length - 1] as number;
      const jv = values[j] as number;
      const adjacent = i - j === 1;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'pop',
        caption: `Step ${i + 1} of ${n}`,
        note: adjacent
          ? `Index ${j} (value ${jv}) has been waiting since step ${j + 1}, and ${x} sits immediately to its right and beats it, so the nearest greater element is the value next door. Pop it — no other candidate can be closer, and this one is already in hand.`
          : `Index ${j} (value ${jv}) has been waiting since step ${j + 1}, and ${x} > ${jv}, so it pops. ${x} is its next greater element because every value in between (indices ${j + 1} to ${i - 1}) was already smaller than ${jv} — anything greater would have popped this index on the way past.`,
        values: [...values],
        pointers: { i },
        overlay: row(),
        highlight: {
          current: [i],
          // The index is still in `stack` at this point, so it has to be taken out
          // of the `picked` group or it would render as both.
          compare: [j],
          picked: stack.slice(0, -1),
        },
        ops,
        vars: { n, i, x, popped: j, poppedValue: jv, waiting: stack.length, ops },
      };

      stack.pop();
      answer[j] = x;
      resolved.push(j);
      answeredHere += 1;
    }

    if (answeredHere > 0) {
      const justAnswered = resolved.slice(-answeredHere);
      yield {
        kind: 'array',
        index: 0,
        anchor: 'resolve',
        caption: `Step ${i + 1} of ${n}`,
        note: `${
          justAnswered.length === 1
            ? 'One answer written'
            : `${justAnswered.length} answers written at once`
        }: ${justAnswered.map((j) => `NGE[${j}] = ${x}`).join(', ')}. ${
          justAnswered.length === 1
            ? 'That index leaves the waiting stack for good, and it can never need a second answer.'
            : 'One arriving value answered a whole run of waiting indices, top first, and they all get the same answer because none of the values between them was greater.'
        } ${
          stack.length === 0
            ? 'The waiting stack is now empty, so the next value starts a fresh run.'
            : `${count(stack.length, 'index', 'indices')} still waiting.`
        }`,
        values: [...values],
        pointers: { i },
        overlay: row(),
        highlight: { output: [...resolved], picked: [...stack] },
        ops,
        vars: { n, i, x, answeredHere, waiting: stack.length, ops },
      };
    }

    const depthBefore = stack.length;
    stack.push(i);

    yield {
      kind: 'array',
      index: 0,
      anchor: 'push',
      caption: `Step ${i + 1} of ${n}`,
      note:
        depthBefore === 0
          ? `The stack was empty, so index ${i} (value ${x}) is the only thing waiting. Its answer can only come from index ${i + 1} onwards${i + 1 < n ? '' : ' — and there is no index after this one, so it will never get one'}.`
          : `Nothing smaller than ${x} is left waiting, so index ${i} joins the stack at depth ${stack.length} and the order is non-increasing again. The top is the smallest value still waiting, which is exactly why whatever arrives next beats it first.`,
      values: [...values],
      pointers: { i },
      overlay: row(),
      highlight: { current: [i], picked: [...stack] },
      ops,
      vars: { n, i, x, waiting: stack.length, answered: resolved.length, ops },
    };
  }

  // The scan is over. Everything still on the stack has no answer, ever — not
  // "not found yet", which is the distinction the whole -1 sentinel exists for.
  const leftovers = [...stack];
  for (let k = 0; k < leftovers.length; k++) {
    if (ctx.shouldStop()) return;
    ops++;
    const j = leftovers[k] as number;
    const jv = values[j] as number;
    const rest = leftovers.length - k - 1;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'no-greater',
      caption: 'No answer',
      note: `The scan has run off the end of the array with index ${j} (value ${jv}) still waiting. ${
        j + 1 <= n - 1
          ? `Every value to its right (indices ${j + 1} to ${n - 1}) has been examined and none was greater than ${jv}, so NGE[${j}] stays ${NO_ANSWER}`
          : `Nothing is to its right at all — index ${j} is the last element — so NGE[${j}] stays ${NO_ANSWER}`
      }, and that is not "not found yet": it is the same ${NO_ANSWER} carrying a different claim. ${
        rest === 0
          ? 'It is the last one, so the stack is now the complete list of indices that have no answer.'
          : `${count(rest, 'more waiting index', 'more waiting indices')} will be told the same thing.`
      }`,
      values: [...values],
      overlay: row(),
      highlight: { unvisited: [j], picked: [...stack] },
      ops,
      vars: { n, noAnswer: j, noAnswerValue: jv, waiting: stack.length, ops },
    };
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'done',
    caption: `${resolved.length} of ${n} answered`,
    note:
      n === 0
        ? 'No indices, so no answers and the result is the empty array. Every preset in this family has to survive this input, because an empty array is what a caller hands you when there is nothing to do.'
        : `${count(resolved.length, 'index', 'indices')} of ${n} got an answer and ${leftovers.length} did not: [${answer.join(', ')}], in input order, with ${NO_ANSWER} wherever nothing to the right was strictly greater. ${count(n, 'visit', 'visits')} and ${count(resolved.length + leftovers.length, 'answer', 'answers')} is ${ops} operations — every index is pushed once and answered once, whatever the data did, and that is the whole of the O(n).`,
    values: [...values],
    overlay: row(),
    highlight: {
      ...(resolved.length > 0 ? { output: [...resolved] } : {}),
      ...(leftovers.length > 0 ? { unvisited: [...leftovers] } : {}),
    },
    result: answer.join(', '),
    ops,
    vars: { n, answered: resolved.length, noAnswer: leftovers.length, ops },
  };
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Values',
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
 * The listings are the real algorithm, not the generator. All four return the
 * same array: for every index, the value of the first strictly greater element
 * to its right, or -1.
 * ------------------------------------------------------------------ */

const JS = `function nextGreaterElement(a) {
  const n = a.length;
  const answer = new Array(n).fill(-1);              // @anchor start
  const stack = [];                                  // indices still waiting for an answer
  for (let i = 0; i < n; i++) {                      // @anchor scan
    while (stack.length > 0 && a[stack[stack.length - 1]] < a[i]) {  // @anchor pop
      const j = stack.pop();                         // @anchor resolve
      answer[j] = a[i];
    }
    stack.push(i);                                   // @anchor push
  }
  for (const j of stack) {                           // @anchor no-greater
    answer[j] = -1; // already -1: nothing to the right of j was greater
  }
  return answer;                                     // @anchor done
}`;

const PY = `def next_greater_element(a):
    n = len(a)
    answer = [-1] * n                                # @anchor start
    stack = []                                       # indices still waiting for an answer
    for i in range(n):                               # @anchor scan
        while stack and a[stack[-1]] < a[i]:         # @anchor pop
            j = stack.pop()                          # @anchor resolve
            answer[j] = a[i]
        stack.append(i)                              # @anchor push
    for j in stack:                                  # @anchor no-greater
        answer[j] = -1  # already -1: nothing to the right of j was greater
    return answer                                    # @anchor done
`;

const JAVA = `import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.Deque;

class NextGreaterElement {
    static int[] nextGreaterElement(int[] a) {
        int n = a.length;
        int[] answer = new int[n];
        Arrays.fill(answer, -1);                      // @anchor start
        Deque<Integer> stack = new ArrayDeque<>();    // indices still waiting for an answer
        for (int i = 0; i < n; i++) {                 // @anchor scan
            while (!stack.isEmpty() && a[stack.peekFirst()] < a[i]) {  // @anchor pop
                int j = stack.pop();                  // @anchor resolve
                answer[j] = a[i];
            }
            stack.push(i);                            // @anchor push
        }
        for (int j : stack) {                         // @anchor no-greater
            answer[j] = -1;                           // already -1: nothing to the right was greater
        }
        return answer;                                // @anchor done
    }
}`;

const CPP = `#include <vector>

std::vector<int> next_greater_element(const std::vector<int>& a) {
    const int n = (int)a.size();
    std::vector<int> answer(n, -1);                   // @anchor start
    std::vector<int> stack;                           // indices still waiting for an answer
    for (int i = 0; i < n; i++) {                     // @anchor scan
        while (!stack.empty() && a[stack.back()] < a[i]) {  // @anchor pop
            const int j = stack.back();               // @anchor resolve
            stack.pop_back();
            answer[j] = a[i];
        }
        stack.push_back(i);                          // @anchor push
    }
    for (int j : stack) {                             // @anchor no-greater
        answer[j] = -1;                               // already -1: nothing to the right was greater
    }
    return answer;                                    // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      '`answer` starts as n copies of -1 and the stack starts empty, so every index already has a value that means "nobody yet". The sentinel is a number rather than `null` because this algorithm never leaves an answer undecided: it either writes a real value or keeps the sentinel for the whole run, and the flush at the end is the only code that ever names the difference.',
    python:
      '`answer = [-1] * n` and an empty list. The sentinel is -1 rather than `None` because all four listings must return the same JSON: a missing answer is a normal, expected outcome here rather than an error, and -1 is the one value Java, C++ and JavaScript can all hold without a special case. `[None] * n` would work in Python alone and would need converting for the other three.',
    java: 'The one genuinely different line in the four listings: `new int[n]` is zero-initialised, so -1 has to be written explicitly with `Arrays.fill`. Forget it and every "no greater element" answer silently reads as 0 — and 0 is a real number, so the output looks like data rather than like a bug. The same trap waits behind `new boolean[n]`, which is why several implementations prefill with `Integer.MAX_VALUE` and compare against the sentinel instead.',
    cpp: '`std::vector<int> answer(n, -1)` is the two-argument constructor, which value-initialises every element to -1. The one-argument constructor is the dangerous neighbour: `std::vector<int> answer(n)` zero-fills, exactly like Java, and every "no greater element" answer then comes back as 0 — a number that looks like a plausible answer rather than like a missing one.',
  },
  scan: {
    javascript:
      'The outer loop is the whole pass: one left-to-right walk in which each value is looked at exactly once. Everything else follows from the row underneath, because the only question this step has to answer is whether the arriving value beats the waiting top.',
    python:
      '`for i in range(n)` — one pass, cursor never moving backwards. Python spells the top of the stack as `stack[-1]`, so the comparison and the pop use one expression with no length arithmetic; the Java and C++ listings need an explicit size or emptiness check to say the same thing, and the cost of that check is the reason this line is longer in three of the four.',
    java: '`for (int i = 0; i < n; i++)` over a `Deque<Integer>`, so every read is a bounds-checked array access and every push boxes an `int` into an `Integer`. The boxing is the tax this language pays for a stack of small values: a parallel `int[]` with a top counter never allocates at all and is what a performance-minded implementation would use, at the cost of an invariant you have to maintain by hand.',
    cpp: '`for (int i = 0; i < n; i++)` with the parameter as `const std::vector<int>&`, so the input is not copied and the only allocation this algorithm makes is the stack. The index type is `int` rather than `size_t` on purpose: `a.size()` is unsigned, so a `size_t` loop variable invites a signed/unsigned comparison warning on every line that also does arithmetic, and warnings you have learned to ignore are warnings that have stopped working.',
  },
  pop: {
    javascript:
      "The loop condition is the entire trick. While the top of the stack is strictly smaller than the arriving value, pop it — the arriving value is then that index's answer, and it is the *nearest* one because of the invariant: anything between the two was already seen and was not greater, or the index would have been popped on the way past. The `while` rather than an `if` is what lets one arriving value answer a whole run of waiting indices.",
    python:
      '`while stack and a[stack[-1]] < a[i]`. Note the strict `<`: an equal value to the right is not a greater element, so it must not pop anything, and the stack is non-increasing rather than strictly decreasing. Writing `<=` here is the most common bug in this algorithm, it type-checks, it passes a look at the code, and it fails the moment two equal values appear in a row.',
    java: '`a[stack.peekFirst()] < a[i]`, one comparison per waiting index that loses, and the loop is what lets a single arriving value answer a whole run. The `peekFirst` is not a typo and it is the one line in the four listings a Java programmer has to think about: `Deque.push` adds to the *front*, so the top of the stack is the front and reading `peekLast` would compare against the oldest index instead. `java.util.Stack` puts `push`/`pop`/`peek` on the front too, which is where the muscle memory comes from — but that class is a synchronised `Vector` and should not be used for this.',
    cpp: '`a[stack.back()] < a[i]` with a `std::vector<int>` used as a stack — `push_back` and `pop_back` are both O(1) and neither invalidates the other indices, so a `vector` is genuinely the right container here and wrapping it in a `std::stack<int>` (which is a `deque` underneath) would only add a layer of indirection. Note that the index must be read *before* `pop_back`: `back()` afterwards names the next index down, and the answer gets written against the wrong element with no error anywhere.',
  },
  resolve: {
    javascript:
      '`answer[j] = a[i]` — one property store, once per answer, and index `j` never enters the stack again. Nothing records *how long* `j` waited, and nothing needs to: the fact that it is being popped at all is the proof that no greater element passed it earlier.',
    python:
      'One list assignment, the only write an answer ever gets. The -1 sentinels that survive to the end are the only entries never overwritten, which is precisely why the flush loop exists; and because a Python list is a reference to a mutable array rather than a fixed-size buffer, the answer array is built at its final length in one expression instead of a preallocate-then-fill pass.',
    java: 'A single array store: O(1), no allocation, and no way for two answers to race. Everything the algorithm produces is one `int[]` of length n written at most n times, which is the same total work as the other three expressed as a store rather than a property set — the reason this is the fastest of the four on a large input and the least forgiving of a wrong index.',
    cpp: "`answer[j] = a[i]`, one store through the vector's buffer, and `j` came off the stack so the vector cannot be reallocating underneath it. That is the real reason the answer array is sized once from `a.size()`: had it been a vector that grew during the loop, every earlier reference into it would have dangled, and the bug would surface as garbage answers rather than as a crash.",
  },
  push: {
    javascript:
      'The arriving index joins the waiting set on top, unconditionally. Pushing without a condition is the point: the while loop has already removed everything smaller, so the stack is non-increasing again the moment this line returns, and the invariant is restored by construction rather than checked.',
    python:
      '`stack.append(i)`, amortised O(1) at the right end, with over-allocation so the append does not copy every time. The index is stored and never the value: the value is already in the list, and it is the index the answer array is keyed by. A stack of values would need a second pass to recover the position, and the position is the interesting half.',
    java: '`stack.push(i)`, which boxes the int into an `Integer` — a small allocation per push, and that GC pressure is the honest cost of the readable version. `addLast` would put the same element at the *other* end, which would then make the comparison read `peekLast`; both are correct, and mixing the two spellings is how a stack ends up with its top on the wrong side. An `int[]` plus a top counter avoids the boxing entirely and is the version to reach for in code that runs in a hot loop.',
    cpp: '`stack.push_back(i)`, and the vector grows by doubling — so a single push can be O(n) when it reallocates while the total is O(n) for all of them. That is the amortised argument behind the O(n) claim, stated concretely. `stack.reserve(n)` would remove the reallocation entirely, at the cost of an assumption that the stack never exceeds the input length; that assumption is true here and is worth stating rather than hiding.',
  },
  'no-greater': {
    javascript:
      'The scan is over and these indices are still waiting, so no answer exists for them: nothing at any position to their right was strictly greater. The loop writes -1 over -1, which changes nothing — it is there so the last thing the algorithm does is say out loud which indices have no answer, which is the only way a reader can tell "does not exist" apart from "not looked for yet".',
    python:
      'Walking the leftovers and writing -1 over -1: a deliberate no-op, kept because naming the failure case is worth more than the two instructions it saves. Python could keep `None` and delete this loop entirely, but then the return type is a list of `int | None` and every caller has to branch — the sentinel keeps the answer uniformly a list of ints, which is what makes the JSON comparison across four languages possible at all.',
    java: '`for (int j : stack) answer[j] = -1;` — a redundant store, for the same reason as the other three. Worth knowing anyway, because this loop deliberately does **not** empty the stack and could not: removing elements from an `ArrayDeque` inside a for-each throws `ConcurrentModificationException` on the next `next()` call. The other three languages can iterate freely here; this one needs an index loop, which is why the flush is written as a walk rather than as a drain. The iteration also runs bottom-first, because `push` put the newest index at the front.',
    cpp: 'A range-for over the leftovers writing -1 over -1. The iterator caveat the Java version has does not apply — the body never touches `stack`, so the iterators stay valid — but it could not pop either: erasing from a `std::vector` while range-iterating invalidates the iterators, and on a small vector that is a silent wrong answer rather than a crash.',
  },
  done: {
    javascript:
      'The answer, in input order, with -1 wherever no greater element exists. Every index is pushed once and answered once, so n visits plus n answers is the whole cost: the "amortised" in O(n) means exactly that, and it is why one step being able to empty the entire stack is not a problem.',
    python:
      'Returning the list. Two things are true at the same time at the end: the answers already written are final, and the ones still missing are missing forever, because there is no more input. A `list[int]` is returned rather than a generator so a student can compare the whole answer against a quadratic reference and know which of the two to trust.',
    java: 'The single `int[]` return — no buffering, no append, and no element of the answer can change after it is written. That last property is what the streaming version of this problem (online next-greater, where the input never ends) cannot offer, and it is the reason this formulation has to keep the last run of the stack until the input does end.',
    cpp: 'Returned by value, and since C++11 that is a move rather than a copy. The stack is a local, so it dies with the function while the caller keeps the answer; nothing is shared and nothing can be mutated afterwards. O(n) space is the price of the O(n) time — a recursive formulation trades that heap for a call stack of depth n, which is a worse trade in every language that has one.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'nextGreaterElement',
    python: 'next_greater_element',
    java: 'NextGreaterElement.nextGreaterElement',
    cpp: 'next_greater_element',
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
 * The claim, computed the obvious way and *independently* of the generator:
 * for every index, walk right until something strictly greater turns up.
 *
 * O(n²) on purpose. The stack version is the thing under test, so its
 * expectation must not be derived from anything resembling it — a reference that
 * shared the stack's reasoning would agree with the stack even when the stack
 * is wrong, which is the failure this project cares most about.
 */
export function referenceNextGreater(values: number[]): number[] {
  const n = values.length;
  const out: number[] = new Array<number>(n).fill(NO_ANSWER);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const right = values[j] as number;
      if (right > (values[i] as number)) {
        out[i] = right;
        break;
      }
    }
  }
  return out;
}

const valuesOf = (p: Preset): number[] => (p.input.type === 'numbers' ? p.input.values : []);

const expectations: Expectation[] = PRESETS.map((p) => {
  const values = valuesOf(p);
  return { presetId: p.id, args: [values], result: referenceNextGreater(values) };
});

export const nextGreaterElementAlgo: AlgoDef<ArrayFrame> = {
  id: 'next-greater-element',
  title: 'Next Greater Element',
  category: 'stacks-queues',
  summary:
    'Walk left to right with a stack of unanswered indices in non-increasing order; every value that beats the top of the stack answers it, and whatever is left at the end has no greater element.',
  intuition:
    'Reach for it the moment a per-position question about the *suffix* arrives in the same left-to-right pass as the data: next warmer day, next higher price, next greater value in an inorder tree walk, first element larger than the current one in a stream. The tell is that many indices are each waiting for the same kind of thing, and the things arrive in the order the questions were asked. If the questions can be batched offline, sorting once and sweeping backwards is simpler code at O(n log n); if the data never ends, this has to give back a *run* of answers at end-of-stream rather than a single one, and that variant is a different function.',
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(n)',
    note: 'Amortised O(n) because every index is pushed exactly once and popped at most once, so the total number of pops cannot exceed n even though a single arriving value can pop the entire stack in one step. The answer array is O(n) whatever the data does; the stack alone is O(1) on strictly ascending input and O(n) on strictly descending input, where all n indices are still waiting when the scan ends and none of them is ever answered. The `online` flag is also worth qualifying: an answer is final the moment it is written, but the -1s can only be named at end of input, so a genuinely endless stream needs a flush you call yourself.',
  },
  traits: {
    inPlace: false,
    online: true,
    allowsDuplicates: true,
    tags: ['monotonic stack', 'one pass', 'amortised O(1)', 'suffix query', 'sentinel -1'],
  },
  viewport: 'array',
  level: 'intermediate',
  params: [],
  inputSpec,
  presets: PRESETS,
  run: nextGreaterElement,
  lesson,
  expectations,
  formatResult: (r) => `[${(r as number[]).join(', ')}]`,
  anchors: ['start', 'scan', 'pop', 'resolve', 'push', 'no-greater', 'done'],
};

export default nextGreaterElementAlgo;
