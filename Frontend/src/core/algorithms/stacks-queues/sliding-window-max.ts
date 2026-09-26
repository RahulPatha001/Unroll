import { byLanguage } from '../../code/anchors.ts';
import { fewDistinctArray, randomArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { LinearFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Sliding Window Maximum — a monotonic **deque**.
 *
 * The naive answer is O(n·k): for each window, scan it for the maximum. The
 * deque version is O(n) amortised, and the reason it works is a dominance rule:
 *
 *   when a new value arrives, **every smaller value at the back of the deque is
 *   permanently dead** — it can never be the answer of a future window, because
 *   the new value is both bigger and will leave the window later.
 *
 * So the deque only ever holds values in strictly decreasing order from front to
 * back, its front is the current window's maximum, and each value is pushed once
 * and popped at most once. That is the whole algorithm, and the "amortised" in
 * O(n) amortised is exactly this: a single element can cost many pops, but no
 * element costs more than one pop *in total over the whole run*.
 *
 * The `dominated` highlight is the lesson. It names the values that were just
 * proved irrelevant and thrown away, which is the part a student cannot see in
 * the code — in the listing they are simply gone.
 *
 * `flavour: 'deque'` draws the maximum at the *front*, and `edges: { front, rear }`
 * names the two ends. A monotonic deque reads front-to-back as
 * "biggest, then progressively less useful", which is the opposite of a stack's
 * "newest on top", and the label makes that difference explicit.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 617;

/** The everyday case: an unsorted run where the deque is neither full nor tiny. */
const MIXED = randomArray(SEED, 10, 5, 95);
/** Ascending: every new value beats the whole deque, so it is emptied on every step. */
const ASCENDING = [...randomArray(SEED + 3, 9, 5, 95)].sort((a, b) => a - b);
/** Descending: nothing is ever dominated, so the deque fills to k and evicts from the front. */
const DESCENDING = [...randomArray(SEED + 6, 9, 5, 95)].sort((a, b) => b - a);
/** All equal: the tie rule decides everything, and `<=` discards the older copy. */
const ALL_EQUAL = fewDistinctArray(SEED + 9, 9, 1, 5);

const PRESETS: Preset[] = [
  {
    id: 'mixed',
    label: 'Unsorted, window 3',
    blurb:
      'A seeded run of ten values with a window of 3. The deque holds a few candidates, some pushes dominate a smaller value behind them, and one value per step leaves at the front. This is the shape a real stream arrives in.',
    input: { type: 'numbers', values: MIXED },
    params: { k: 3 },
  },
  {
    id: 'ascending',
    label: 'Ascending input',
    blurb:
      "Every new value is bigger than everything in the deque, so every push destroys the entire deque and the maximum is always the value that just arrived. The best case for the dominance rule and the worst case for the deque's memory use — it never holds more than one.",
    input: { type: 'numbers', values: ASCENDING },
    params: { k: 3 },
  },
  {
    id: 'descending',
    label: 'Descending input',
    blurb:
      'Nothing is ever dominated, because nothing bigger ever arrives. The deque grows to the full window and then discards from the *front* as the window slides — the opposite failure mode, and the one that shows the front-expiry rule is not optional.',
    input: { type: 'numbers', values: DESCENDING },
    params: { k: 3 },
  },
  {
    id: 'all-equal',
    label: 'All values equal',
    blurb:
      'Nine identical values. The comparison is `<=`, not `<`, so every arriving value *does* dominate the equal one behind it and the deque stays at one entry. Flip that one character to `<` and the deque fills to k instead — the tie rule is the only thing being tested here.',
    input: { type: 'numbers', values: ALL_EQUAL },
    params: { k: 3 },
  },
  {
    id: 'wide-window',
    label: 'Window wider than needed',
    blurb:
      'A window of 6 over 8 values: only three windows ever close, so most of the run is filling the deque and never expiring anything. The case where the O(n·k) naive version is not much worse, and worth seeing to know when the clever version is not buying you anything.',
    input: { type: 'numbers', values: [...randomArray(SEED + 12, 8, 5, 95)] },
    params: { k: 6 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

const K_MIN = 1;
const K_MAX = 9;

/** The machine-checked claim: the maximum of every window of size k. */
export function windowMaxima(values: number[], k: number): number[] {
  const out: number[] = [];
  if (k < 1) return out;
  for (let i = 0; i + k <= values.length; i++) {
    let best = values[i] as number;
    for (let j = i + 1; j < i + k; j++)
      if ((values[j] as number) > best) best = values[j] as number;
    out.push(best);
  }
  return out;
}

export function* slidingWindowMax(ctx: RunContext): Generator<LinearFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const values = [...source];
  const n = values.length;
  const k = Math.max(K_MIN, Math.min(K_MAX, Math.round(Number(ctx.params.k ?? 3))));

  /**
   * The deque, as `{ index, value }` pairs.
   *
   * Indices are what the algorithm needs — expiry is "my index has left the
   * window" — but `LinearFrame` draws *values*, so both are carried. Every
   * highlight below is a list of **positions in the rendered deque**, not array
   * indices of the input, because that is what `LinearView` resolves against.
   */
  const deque: Array<{ i: number; v: number }> = [];
  const answers: number[] = [];
  let ops = 0;

  const items = (): number[] => deque.map((d) => d.v);
  const edges = (): Record<string, number> => ({ front: 0, rear: deque.length });
  /** "In the current window" — every candidate the deque is still holding. */
  const window = (): number[] => range(0, deque.length);

  yield {
    kind: 'linear',
    index: 0,
    anchor: 'start',
    caption: `Window of ${k}`,
    note:
      n < k
        ? `Only ${n} value${n === 1 ? '' : 's'} for a window of ${k}, so no window ever closes and there is nothing to report. The deque still fills up — the work is not wasted, the question is simply never asked.`
        : `A window of ${k} slides across ${n} values, giving ${n - k + 1} answers. The deque holds *candidate* maxima in decreasing order from front to back; its front is the answer, and anything smaller than a value behind it can be discarded forever. Two things will remove entries: the window moving past them at the front, and a bigger value arriving at the back.`,
    flavour: 'deque',
    items: [],
    edges: edges(),
    highlight: {},
    vars: { n, k, size: 0, ops },
  };

  for (let i = 0; i < n; i++) {
    if (ctx.shouldStop()) return;
    ops++;
    const v = values[i] as number;

    // ---- expire: the front has left the window ------------------------------
    //
    // Emitted *before* the removal so the doomed entry is still on screen and the
    // `dominated` highlight actually points at something.
    const stale = deque[0];
    if (stale !== undefined && stale.i <= i - k) {
      yield {
        kind: 'linear',
        index: 0,
        anchor: 'expire',
        caption: `Step ${i + 1}`,
        note: `${stale.v} arrived at index ${stale.i} and the window is now [${i - k + 1}, ${i}] — it has left. One comparison against the front is enough to know, because the deque is in index order: if the oldest candidate is still inside, every candidate behind it is too.`,
        flavour: 'deque',
        items: items(),
        edges: edges(),
        highlight: { window: window(), dominated: [0] },
        ops,
        vars: { i, v, k, size: deque.length, expired: stale.i, ops },
      };
      while (deque.length > 0 && (deque[0] as { i: number; v: number }).i <= i - k) deque.shift();
    }

    // ---- dominate: the back is now smaller than the arriving value -----------
    const doomed: number[] = [];
    for (let d = deque.length - 1; d >= 0; d--) {
      if ((deque[d] as { i: number; v: number }).v > v) break;
      doomed.unshift(d);
    }

    if (doomed.length > 0) {
      const names = doomed.map((d) => (deque[d] as { i: number; v: number }).v);
      yield {
        kind: 'linear',
        index: 0,
        anchor: 'dominate',
        caption: `Step ${i + 1}`,
        note: `${v} has arrived, and ${names.map((x) => `${x} (<= ${v})`).join(', ')} ${names.length === 1 ? 'is' : 'are'} permanently useless: ${v} is at least as big and leaves the window later, so no future window can ever prefer ${names.length === 1 ? 'it' : 'them'}. This is the rule that makes the whole algorithm linear.`,
        flavour: 'deque',
        items: items(),
        edges: edges(),
        highlight: { window: window(), dominated: doomed },
        ops,
        vars: { i, v, k, size: deque.length, killed: names.length, ops },
      };
      while (deque.length > 0 && (deque[deque.length - 1] as { i: number; v: number }).v <= v) {
        deque.pop();
      }
    }

    deque.push({ i, v });

    yield {
      kind: 'linear',
      index: 0,
      anchor: 'push',
      caption: `Step ${i + 1}`,
      note:
        i + 1 < k
          ? `Push ${v} on the back. The window is not complete yet (${i + 1} of ${k}), so there is no answer to read — the deque is still being built.`
          : `Push ${v} on the back. The window [${i - k + 1}, ${i}] is complete, and because the deque is in decreasing order its front is that window's maximum. One read, no rescan.`,
      flavour: 'deque',
      items: items(),
      edges: edges(),
      highlight: { window: window(), current: [deque.length - 1] },
      ops,
      vars: { i, v, k, size: deque.length, ops },
    };

    if (i + 1 >= k) {
      const best = (deque[0] as { i: number; v: number }).v;
      answers.push(best);
      yield {
        kind: 'linear',
        index: 0,
        anchor: 'answer',
        caption: `Answer ${answers.length} of ${n - k + 1}`,
        note: `The maximum of [${i - k + 1}, ${i}] is ${best}, and it is sitting at the front of the deque. Record it and slide on. Everything behind it is a candidate for a *later* window, which is why none of it is thrown away.`,
        flavour: 'deque',
        items: items(),
        edges: edges(),
        highlight: { answer: [0], window: range(1, deque.length) },
        result: answers.length === n - k + 1 ? 'complete' : 'partial',
        ops,
        vars: { i, k, max: best, found: answers.length, ops },
      };
    }
  }

  yield {
    kind: 'linear',
    index: 0,
    anchor: 'done',
    caption: `${answers.length} answer${answers.length === 1 ? '' : 's'}`,
    note:
      answers.length === 0
        ? `No window ever closed, so there is nothing to report — the input was shorter than the window. ${ops} push${ops === 1 ? '' : 'es'}, and ${deque.length} candidate${deque.length === 1 ? '' : 's'} are still sitting in the deque for a question nobody asked.`
        : `Window maxima: ${answers.join(', ')}. ${ops} step${ops === 1 ? '' : 's'} for ${n} values, because each value is pushed once and popped at most once. A single push can empty the whole deque, but the total number of pops is bounded by the total number of pushes — which is what "amortised" buys.`,
    flavour: 'deque',
    items: items(),
    edges: edges(),
    highlight: deque.length > 0 ? { answer: [0], window: range(1, deque.length) } : {},
    result: answers.length === n - k + 1 ? 'complete' : 'partial',
    ops,
    vars: { n, k, found: answers.length, ops },
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
 * All four return the array of window maxima. `std::deque` is the one real
 * container here and it behaves exactly like the two-array version — the notes
 * say so, because "which deque did you use" is the first question anyone asks.
 * ------------------------------------------------------------------ */

const JS = `function maxSlidingWindow(a, k) {
  const dq = [];                                   // indices, decreasing by value
  const out = [];
  for (let i = 0; i < a.length; i++) {            // @anchor start
    if (dq.length > 0 && dq[0] <= i - k) dq.shift();  // @anchor expire
    while (dq.length > 0 && a[dq[dq.length - 1]] <= a[i]) dq.pop();  // @anchor dominate
    dq.push(i);                                   // @anchor push
    if (i >= k - 1) out.push(a[dq[0]]);           // @anchor answer
  }
  return out;                                      // @anchor done
}`;

const PY = `from collections import deque

def max_sliding_window(a, k):
    dq = deque()                                  # indices, decreasing by value
    out = []
    for i in range(len(a)):                      # @anchor start
        if dq and dq[0] <= i - k:                # @anchor expire
            dq.popleft()
        while dq and a[dq[-1]] <= a[i]:          # @anchor dominate
            dq.pop()
        dq.append(i)                             # @anchor push
        if i >= k - 1:                           # @anchor answer
            out.append(a[dq[0]])
    return out                                      # @anchor done
`;

const JAVA = `import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

class SlidingWindowMax {
    static int[] maxSlidingWindow(int[] a, int k) {
        Deque<Integer> dq = new ArrayDeque<>();  // indices, decreasing by value
        List<Integer> out = new ArrayList<>();
        for (int i = 0; i < a.length; i++) {      // @anchor start
            while (!dq.isEmpty() && dq.peekFirst() <= i - k) dq.pollFirst();  // @anchor expire
            while (!dq.isEmpty() && a[dq.peekLast()] <= a[i]) dq.pollLast();   // @anchor dominate
            dq.offerLast(i);                     // @anchor push
            if (i >= k - 1) out.add(a[dq.peekFirst()]);  // @anchor answer
        }
        int[] res = new int[out.size()];
        for (int i = 0; i < res.length; i++) res[i] = out.get(i);
        return res;                                  // @anchor done
    }
}`;

const CPP = `#include <deque>
#include <vector>

std::vector<int> max_sliding_window(const std::vector<int>& a, int k) {
    std::deque<int> dq;                           // indices, decreasing by value
    std::vector<int> out;
    for (int i = 0; i < (int)a.size(); i++) {     // @anchor start
        while (!dq.empty() && dq.front() <= i - k) dq.pop_front();   // @anchor expire
        while (!dq.empty() && a[dq.back()] <= a[i]) dq.pop_back();  // @anchor dominate
        dq.push_back(i);                          // @anchor push
        if (i >= k - 1) out.push_back(a[dq.front()]);  // @anchor answer
    }
    return out;                                     // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'A plain array used as a deque, with `shift`/`pop` at the two ends. The invariant is the whole algorithm: **indices in the deque have strictly decreasing values, and the front is the current maximum**. Everything else — the expiry, the domination, the answer — follows from keeping that one property true.',
    python:
      "A real `collections.deque`, and the reason to prefer it over a list here is the `popleft`: a list's `pop(0)` is O(n) because every element shifts, which would quietly turn this O(n) algorithm into O(n²). `deque.popleft` is O(1) from the left end, and the container says so in its name.",
    java: 'A `Deque<Integer>`, and note every index is **boxed**: the alternative, an `int[]` with head and tail counters, is what a performance-minded Java implementation would use and it is genuinely faster. `ArrayDeque` also has a fixed initial capacity that grows by doubling, so it reallocates a few times on a long input — a `new ArrayDeque<>(a.length)` up front removes that.',
    cpp: '`std::deque<int>` is the one real container in the four listings, and it is genuinely a double-ended queue: `pop_front` and `pop_back` are both O(1), unlike `std::vector`, where `pop_front` would be O(n). Worth knowing that `std::deque` allocates in 512-byte chunks, so its elements are not contiguous — fine for indices, catastrophic for anything where you assumed you could binary-search it.',
  },
  expire: {
    javascript:
      'Anything whose index has fallen out of the window can go. The test is `dq[0] <= i - k` rather than a loop over the whole deque, and that is only sound because the deque is in index order: if the front has not expired, nothing behind it has. Expired values are never candidates again, so dropping them is free of consequence.',
    python:
      '`dq[0] <= i - k` is the same test, and the same justification applies: the deque is ordered by index, so the oldest candidate is always at the front and one comparison settles whether any expiry is needed. Python spells the front as `dq[0]` and the removal as `popleft()` — two names for the two ends of one object, which is why `deque` rather than a list.',
    java: '`peekFirst() <= i - k` with `pollFirst()`. The `while` form rather than the `if` form of the other three, and it is worth saying why: once the front is stale, the one behind it may be too, so the loop condition is what makes the cleanup correct after a jump of more than one step. With `k = 1` the loop always runs exactly once, which is the sanity check on the boundary.',
    cpp: 'The same single test against the front, and `pop_front` is O(1) on a `std::deque`. A `while` rather than an `if` for the same reason as the Java version: expiry is checked against the front, and after one removal the new front may also be outside the window. `dq.front()` on an empty deque is undefined behaviour, which the `!dq.empty()` guard exists to prevent.',
  },
  dominate: {
    javascript:
      'The heart of the algorithm. A value `x` at the back is worthless once `a[i] >= x` arrives, because `a[i]` is at least as big *and* will leave the window later — so no future window can prefer `x`. Throwing it away is what keeps the deque small; `<=` rather than `<` means an equal value is also discarded, which is safe for a maximum and would not be for a "first maximum" query.',
    python:
      '`while dq and a[dq[-1]] <= a[i]`, popping from the back. The `<=` is the tie rule and it is the only thing the "all values equal" preset is testing: with `<=` the newer equal value evicts the older one and the deque never grows past one entry, while `<` would let both sit there and the deque would fill to k. Neither is wrong for a maximum; they differ in how much memory the run uses.',
    java: '`pollLast()` in a loop, guarded by `peekLast()`. This is the line that makes the algorithm amortised O(1) per element rather than O(k): an individual push can pop the whole deque, but each index is pushed once and popped at most once, so the total work is bounded by the number of pushes. The `<=` is the tie rule, identical to the other three.',
    cpp: 'The same domination loop on `dq.back()`. The two-end discipline is what makes this a deque and not a stack: `pop_back` for domination and `pop_front` for expiry, and both are O(1). A version that used a `std::vector` with `pop_back` for the domination and a separate index for the front would be faster in practice and would not be a deque at all.',
  },
  push: {
    javascript:
      'The index goes on the back. Storing the *index* rather than the value is the choice that makes expiry possible: the value tells you what the candidate is worth, the index tells you when it stops being relevant, and you need both. A deque of values alone cannot implement the expiry rule without a second parallel array.',
    python:
      '`dq.append(i)`. Appending to a `deque` is O(1) amortised at the right end, so the push is as cheap as the pops. The indices are what the answer line dereferences, and holding indices rather than values is why this survives a stream: the input can be a generator and only the last k values need to be retained.',
    java: '`offerLast(i)`, the non-throwing form of `addLast`. `Deque` offers both spellings for every operation — `add`/`offer` and `remove`/`poll` — where the throwing variants exist for the Java 1.2 collection framework and the `offer`/`poll` names came with the collections framework. Mixing them up is a compile error, not a bug, which is a rare and pleasant thing about `Deque`.',
    cpp: '`dq.push_back(i)`, and note the deque now holds at most k indices at any moment — a fact worth checking as an invariant, because it is what bounds the memory and it is not enforced anywhere. The `k - 1` in the answer condition is the mirror image: the first complete window ends at index k-1, not at index k.',
  },
  done: {
    javascript:
      'Finished. Every value was pushed once and popped at most once, so the whole window-maximum sweep is O(n) — the deque only ever holds candidates, never the window itself. Note what is *not* here: the answer array is a side output, not something the deque was maintaining. That separation is why a single push can evict a whole run of smaller values and the total work still stays linear.',
    python:
      'Finished. Every value was pushed once and popped at most once, so the whole window-maximum sweep is O(n) — the deque only ever holds candidates, never the window itself. `collections.deque` is doubly-ended, so `popleft` and `pop` are both O(1); a plain list with an index instead would make every pop O(n) and quietly turn the whole algorithm quadratic. The answers are a side output, not something the deque was maintaining.',
    java: 'Finished. Every value was pushed once and popped at most once, so the whole window-maximum sweep is O(n) — the deque only ever holds candidates, never the window itself. `ArrayDeque` is backed by a resizable array and gives O(1) at both ends, which is the reason for choosing it over a `LinkedList` here: the operations are O(1) either way, but the array version has none of the per-node allocation. The answers are a side output, not something the deque was maintaining.',
    cpp: 'Finished. Every value was pushed once and popped at most once, so the whole window-maximum sweep is O(n) — the deque only ever holds candidates, never the window itself. `std::deque` is O(1) at both ends, unlike `std::vector`, whose `erase(begin())` would be O(n) per pop and quietly turn the whole algorithm quadratic. The answers are a side output, not something the deque was maintaining.',
  },
  answer: {
    javascript:
      'One read: the front of the deque is the maximum of the current window, because the deque is in decreasing order and nothing in front of it has expired. Recording it is O(1) and no window is ever revisited — that is the entire difference from the O(n·k) version, and the reason the total cost is one pass.',
    python:
      '`out.append(a[dq[0]])`. The guard is `i >= k - 1`, so the first k-1 steps deliberately record nothing: a window of size k does not exist until the k-th value has arrived. Getting that boundary off by one is the classic bug here, and it produces a result that is right in the middle and wrong at both ends.',
    java: '`out.add(a[dq.peekFirst()])` into a `List<Integer>`, then a second pass copies it into an `int[]`. That copy is pure ceremony for the harness — a real API would return the `List` — and it is worth naming, because returning `List<Integer>` means the caller pays for boxing they did not ask for, and returning `int[]` means you cannot return an empty result without allocating a zero-length array.',
    cpp: "`out.push_back(a[dq.front()])` into a `std::vector<int>`, which is returned by value and moved rather than copied under C++11 and later. That return-by-move is the reason the C++ version has no trailing copy loop: the Java listing's conversion pass has no C++ equivalent because the language hands it over for free.",
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'maxSlidingWindow',
    python: 'max_sliding_window',
    java: 'SlidingWindowMax.maxSlidingWindow',
    cpp: 'max_sliding_window',
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

const kOf = (p: Preset): number => Math.round(Number(p.params?.k ?? 3));

const expectations: Expectation[] = PRESETS.map((p) => {
  const values = p.input.type === 'numbers' ? p.input.values : [];
  const k = kOf(p);
  return { presetId: p.id, args: [values, k], result: windowMaxima(values, k) };
});

export const slidingWindowMaxAlgo: AlgoDef<LinearFrame> = {
  id: 'sliding-window-max',
  title: 'Sliding Window Maximum',
  category: 'stacks-queues',
  summary:
    "Keep a decreasing deque of candidate maxima. A new value throws away every smaller value behind it, and the front of the deque is the current window's maximum.",
  intuition:
    'Reach for this the moment you need a maximum, a minimum, or an extreme over a *moving* window and the window is wide enough that rescanning it is noticeable — stream monitoring, rolling statistics, feature extraction over time series, the "recent k best" in a leaderboard. The alternative to a deque is a multiset with an expiry queue, which is O(log k) per step and does not degenerate to O(k); prefer the deque for pure speed and the multiset when you need the whole distribution, not just the extreme.',
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(k)',
    note: 'O(n) amortised and O(n) worst case: every value is pushed once and popped at most once, so the pops cannot outnumber the pushes even though a single push can pop the whole deque. Space is O(k), bounded by the window size — and by nothing else, which is what the "ascending input" preset makes obvious: the deque never holds more than one entry.',
  },
  traits: {
    stable: true,
    inPlace: false,
    online: true,
    allowsDuplicates: true,
    tags: ['monotonic deque', 'amortised O(1)', 'one pass', 'stream friendly'],
  },
  viewport: 'linear',
  level: 'intermediate',
  params: [
    {
      key: 'k',
      label: 'Window size',
      kind: 'number',
      min: K_MIN,
      max: K_MAX,
      step: 1,
      default: 3,
      help: 'Bigger than the input and no window ever closes, so there is nothing to report.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: slidingWindowMax,
  lesson,
  expectations,
  formatResult: (r) => `[${(r as number[]).join(', ')}]`,
  anchors: ['start', 'expire', 'dominate', 'push', 'answer', 'done'],
};

export default slidingWindowMaxAlgo;
