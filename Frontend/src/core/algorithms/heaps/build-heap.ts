import { byLanguage } from '../../code/anchors.ts';
import { randomArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { NodeId, TreeFrame, TreeNode } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Build a binary heap bottom-up (Floyd's heapify), which is O(n) rather than the
 * O(n log n) you get from inserting the values one at a time.
 *
 * ## Why a *min*-heap here
 *
 * `TreeView` orders a node's children by value, because it was written for BSTs
 * where "a BST must read as a BST" is the whole point. For a heap that ordering
 * happens to be **correct for a min-heap** and wrong for a max-heap: in a min-heap
 * the array's left child `2i+1` is always the smaller of the two, so sorting
 * children ascending by value reproduces the implicit array exactly. Choosing a
 * min-heap is therefore what keeps the drawn tree and the `2i+1` arithmetic
 * telling the same story. (Its sort sibling in `sorting/heap-sort.ts` is a
 * max-heap for the conventional reason: heapsort there comes out ascending.)
 *
 * The authoritative index arithmetic is in `vars` regardless — `i`, `parent`,
 * `left`, `right` — because a student should never have to infer `2i+1` from a
 * picture.
 *
 * ## Why the arithmetic matters
 *
 * There is no pointer anywhere in a binary heap. The shape is not stored; it is
 * *implied* by the array index: a node's children are at `2i+1` and `2i+2`, and
 * its parent is at `floor((i - 1) / 2)`. That is why a heap is one flat array
 * rather than a linked structure, and why it is cache-friendly in a way a binary
 * tree is not — the indices of a node's children are the next two slots in
 * memory.
 *
 * ## Why bottom-up
 *
 * Inserting n values one at a time is O(n log n) and, worse, the shape depends on
 * the insertion order. Sifting every internal node down once, starting from the
 * last parent and working left, is O(n): the nodes near the bottom move furthest
 * but there are exponentially more of them, and the sum converges. Floyd's result
 * — heap construction in linear time — is one of the few places where a
 * "one operation per element" argument gives strictly better than the obvious
 * bound, and the reason `O(n)` rather than `O(n log n)` is the correct answer for
 * this question.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 709;

const RANDOM = randomArray(SEED, 9, 5, 95);
const ASCENDING = [...randomArray(SEED + 3, 8, 5, 95)].sort((a, b) => a - b);
const DESCENDING = [...randomArray(SEED + 6, 8, 5, 95)].sort((a, b) => b - a);

const PRESETS: Preset[] = [
  {
    id: 'random',
    label: 'Random',
    blurb:
      'Nine seeded values in no order. Most of the sifting happens in the bottom two levels, where the nodes have the fewest children — the shape of the work that makes the whole build linear rather than n log n.',
    input: { type: 'numbers', values: RANDOM },
  },
  {
    id: 'ascending',
    label: 'Already a min-heap',
    blurb:
      'Ascending order, which for a min-heap means the property already holds everywhere. Every sift stops at once and the build does zero swaps — the best case, and a good check that "no work" is detected rather than merely reported.',
    input: { type: 'numbers', values: ASCENDING },
  },
  {
    id: 'descending',
    label: 'Completely inverted',
    blurb:
      'Descending order, so every parent is the largest thing in its subtree and has to travel to the bottom. The worst case for the *number of swaps*, though still O(n) in total — the classic illustration that a linear-time algorithm can still do a quadratic-looking amount of moving.',
    input: { type: 'numbers', values: DESCENDING },
  },
  {
    id: 'single',
    label: 'One value',
    blurb:
      'A one-element heap. There is no internal node at all, so the build loop starts at index -1 and never runs. The degenerate case that a version looping from `n - 1` instead of `floor(n/2) - 1` handles by accident and a version without a length guard handles by crashing.',
    input: { type: 'numbers', values: [7] },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const id = (i: number): NodeId => `n${i}`;

const parentOf = (i: number): number => (i === 0 ? -1 : Math.floor((i - 1) / 2));
const leftOf = (i: number): number => 2 * i + 1;
const rightOf = (i: number): number => 2 * i + 2;
const sideOf = (i: number): TreeNode['side'] => (i === 0 ? 'root' : i % 2 === 1 ? 'left' : 'right');
const depthOf = (i: number): number => {
  let d = 0;
  let x = i;
  while (x > 0) {
    x = parentOf(x);
    d++;
  }
  return d;
};

/** Root → `i`, the sift path. This is what the viewport draws as a highlighted spine. */
const spine = (i: number): NodeId[] => {
  const out: number[] = [];
  for (let x = i; x >= 0; x = parentOf(x)) out.unshift(x);
  return out.map(id);
};

const allIds = (n: number): NodeId[] => Array.from({ length: n }, (_, i) => id(i));

/** Rebuild the whole implicit tree from the array, every frame. */
const treeOf = (values: number[]): Record<NodeId, TreeNode> => {
  const out: Record<NodeId, TreeNode> = {};
  values.forEach((v, i) => {
    out[id(i)] = {
      id: id(i),
      value: v,
      parent: parentOf(i) < 0 ? null : id(parentOf(i)),
      side: sideOf(i),
      depth: depthOf(i),
    };
  });
  return out;
};

const indexOf = (n: number): Record<NodeId, number> =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [id(i), i]));

/** The claim: the array after a bottom-up heapify, which is a valid min-heap. */
export function buildHeap(values: number[]): number[] {
  const a = [...values];
  const n = a.length;
  const sift = (start: number): void => {
    let i = start;
    for (;;) {
      const l = leftOf(i);
      const r = rightOf(i);
      if (l >= n) return;
      const pick = r < n && (a[r] as number) < (a[l] as number) ? r : l;
      if ((a[pick] as number) >= (a[i] as number)) return;
      const t = a[i] as number;
      a[i] = a[pick] as number;
      a[pick] = t;
      i = pick;
    }
  };
  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) sift(i);
  return a;
}

export function* buildHeapFrames(ctx: RunContext): Generator<TreeFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const values = [...source];
  const n = values.length;
  const start = Math.floor(n / 2) - 1;

  let ops = 0;
  const frame = (
    anchor: string,
    note: string,
    i: number,
    caption: string,
    extra: {
      highlight?: Record<string, NodeId[]>;
      vars?: Record<string, number | string | boolean>;
    } = {},
  ): TreeFrame => ({
    kind: 'tree',
    index: 0,
    anchor,
    caption,
    note,
    nodes: treeOf(values),
    root: n > 0 ? id(0) : null,
    path: spine(Math.max(0, Math.min(i, n - 1))),
    asArray: true,
    arrayIndex: indexOf(n),
    highlight: extra.highlight ?? {},
    ops,
    vars: { n, i, parent: parentOf(i), left: leftOf(i), right: rightOf(i), ...(extra.vars ?? {}) },
  });

  yield {
    kind: 'tree',
    index: 0,
    anchor: 'start',
    caption: `${n} values, not yet a heap`,
    note:
      n < 2
        ? 'Fewer than two values, so the heap property is vacuous: whatever is in the array is already a valid heap. The build loop will not even start.'
        : `${n} values laid out as the implicit tree: a node at index i has children at 2i+1 and 2i+2 and a parent at floor((i-1)/2). Nothing about that shape is stored — it falls out of the indices. We want every parent to be no larger than either of its children, and we will get there by sifting down each internal node once, starting from the last parent.`,
    nodes: treeOf(values),
    root: n > 0 ? id(0) : null,
    path: n > 0 ? [id(0)] : [],
    asArray: true,
    arrayIndex: indexOf(n),
    highlight: { unvisited: allIds(n) },
    vars: { n, lastParent: start, i: start, ops },
  };

  for (let i = start; i >= 0; i--) {
    if (ctx.shouldStop()) return;
    ops++;
    const l = leftOf(i);
    const r = rightOf(i);

    yield frame(
      'build-loop',
      `Heapify the node at index ${i} (value ${values[i] as number}). Its children are at 2·${i}+1 = ${l}${l < n ? ` and 2·${i}+2 = ${r}` : ''}${l >= n ? ' — that is past the end of the array, so this node is a leaf and is already settled' : ''}. Sifting down from here is what fixes the whole subtree.`,
      i,
      `Heapify index ${i} of ${start + 1}`,
      { highlight: { current: [id(i)], unvisited: allIds(n) } },
    );

    let j = i;
    for (;;) {
      if (ctx.shouldStop()) return;
      const a = leftOf(j);
      const b = rightOf(j);

      if (a >= n) {
        yield frame(
          'hold',
          `Index ${j} has no children (2·${j}+1 = ${a} is past the end), so there is nothing to compare against. A leaf is always in its final place, and the sift stops.`,
          j,
          `Settle index ${j}`,
          { highlight: { answer: [id(j)], unvisited: allIds(n) } },
        );
        break;
      }

      const pick = b < n && (values[b] as number) < (values[a] as number) ? b : a;
      const vars = {
        left: a,
        right: b,
        smaller: pick,
        childValue: values[pick] as number,
        depth: depthOf(j),
      };

      if ((values[pick] as number) >= (values[j] as number)) {
        yield frame(
          'hold',
          `Children are ${values[a] as number}${b < n ? ` and ${values[b] as number}` : ''} and the smaller of them, ${values[pick] as number}, is not below ${values[j] as number}. The parent already beats both children, so this whole subtree satisfies the heap property and the sift stops here.`,
          j,
          `Settle index ${j}`,
          { highlight: { answer: [id(j)], unvisited: allIds(n) }, vars },
        );
        break;
      }

      ops++;
      yield frame(
        'compare',
        `Compare ${values[j] as number} with its smaller child ${values[pick] as number} (at index ${pick}, 2·${j}+${pick === a ? '1' : '2'}). The child is smaller, so ${values[j] as number} is in the wrong place for a min-heap and has to keep descending.`,
        j,
        `Sift index ${j}`,
        { highlight: { compare: [id(j), id(pick)], unvisited: allIds(n) }, vars },
      );

      const t = values[j] as number;
      values[j] = values[pick] as number;
      values[pick] = t;

      yield frame(
        'swap',
        `Swap them. ${values[j] as number} moves up to index ${j} and ${values[pick] as number} drops to index ${pick}, and the sift continues **from the new index** — which is the whole trick. The node is not fixed where it landed; it is fixed when nothing below it is smaller.`,
        pick,
        `Sift index ${pick}`,
        { highlight: { swapping: [id(j), id(pick)], unvisited: allIds(n) }, vars },
      );

      j = pick;
    }
  }

  yield {
    kind: 'tree',
    index: 0,
    anchor: 'done',
    caption: 'A valid min-heap',
    note:
      n < 2
        ? 'The heap property is vacuous for fewer than two values, so there was never any work to do.'
        : `Every parent is no larger than its children, and the root at index 0 is the smallest of all ${n} values — ${values[0] as number}. ${ops} step${ops === 1 ? '' : 's'} in total, and the total is O(n) even though a single sift can be O(log n): the nodes that move furthest are the ones nearest the leaves, and there are exponentially more of them.`,
    nodes: treeOf(values),
    root: n > 0 ? id(0) : null,
    path: n > 0 ? [id(0)] : [],
    asArray: true,
    arrayIndex: indexOf(n),
    highlight: { sorted: allIds(n) },
    result: n > 0 ? id(0) : null,
    ops,
    vars: { n, root: values[0] ?? 0, ops },
  };
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Values to heapify',
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
 * All four build a min-heap by sifting down from `floor(n/2) - 1`, and all four
 * return the array. The listings are written to be *copied and run* — a heap is
 * a plain array, so there is no structure to hide behind and nothing in the code
 * that a reader could mistake for a data structure it is not.
 * ------------------------------------------------------------------ */

const JS = `function buildHeap(a) {
  const n = a.length;                                // @anchor start
  const siftDown = (i) => {
    for (;;) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l >= n) return;                          // @anchor hold  a leaf is already settled
      const pick = r < n && a[r] < a[l] ? r : l;
      if (a[pick] >= a[i]) return;                // @anchor hold  the parent already wins
      const t = a[i];                             // @anchor compare
      a[i] = a[pick];
      a[pick] = t;
      i = pick;                                   // @anchor swap
    }
  };
  for (let i = (n >> 1) - 1; i >= 0; i--) siftDown(i);   // @anchor build-loop
  return a;                                       // @anchor done
}`;

const PY = `def build_heap(a):
    n = len(a)                                        # @anchor start
    # The child that is too small to stay where it is.
    def sift_down(i):
        while True:
            l = 2 * i + 1
            r = 2 * i + 2
            if l >= n:
                return                            # @anchor hold  a leaf is already settled
            pick = r if r < n and a[r] < a[l] else l
            if a[pick] >= a[i]:
                return                            # @anchor hold  the parent already wins
            a[i], a[pick] = a[pick], a[i]         # @anchor compare
            i = pick                              # @anchor swap
    for i in range(n // 2 - 1, -1, -1):            # @anchor build-loop
        sift_down(i)
    return a                                      # @anchor done
`;

const JAVA = `class BuildHeap {
    static int[] buildHeap(int[] a) {
        final int n = a.length;                  // @anchor start
        for (int k = (n >> 1) - 1; k >= 0; k--) {  // @anchor build-loop
            siftDown(a, n, k);
        }
        return a;                                 // @anchor done
    }

    static void siftDown(int[] a, int n, int i) {
        while (true) {
            int l = 2 * i + 1;
            int r = 2 * i + 2;
            if (l >= n) return;                   // @anchor hold  a leaf is already settled
            int pick = (r < n && a[r] < a[l]) ? r : l;
            if (a[pick] >= a[i]) return;          // @anchor hold  the parent already wins
            int t = a[i];                         // @anchor compare
            a[i] = a[pick];
            a[pick] = t;
            i = pick;                             // @anchor swap
        }
    }
}`;

const CPP = `#include <vector>

void sift_down(std::vector<int>& a, int i) {
    int n = (int)a.size();
    while (true) {
        int l = 2 * i + 1;
        int r = 2 * i + 2;
        if (l >= n) return;                       // @anchor hold  a leaf is already settled
        int pick = (r < n && a[r] < a[l]) ? r : l;
        if (a[pick] >= a[i]) return;              // @anchor hold  the parent already wins
        int t = a[i];                             // @anchor compare
        a[i] = a[pick];
        a[pick] = t;
        i = pick;                                 // @anchor swap
    }
}

std::vector<int> build_heap(std::vector<int> a) {
    int n = (int)a.size();                          // @anchor start
    for (int i = (n >> 1) - 1; i >= 0; i--) sift_down(a, i);     // @anchor build-loop
    return a;                                     // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'Nothing is allocated and nothing is stored. A binary heap is an array plus three formulas — child `2i+1`, child `2i+2`, parent `floor((i-1)/2)` — and that is the entire "structure". It is why a heap is one flat, cache-friendly array where an equivalent binary tree would be n scattered objects, and it is also why there is nothing to traverse: the shape is arithmetic.',
    python:
      'The same three formulas and the same flat array. Python is the language where the implicit tree is easiest to *forget*: a list of lists would also work, and it would be O(n) slower and much harder to reason about, because you would have to maintain the shape rather than compute it. The `2 * i + 1` is the whole data structure.',
    java: 'An `int[]`, mutated in place, and the signature returning the same array it was handed — which is deliberate, because heapify is an in-place operation and a copy would be a lie about the cost. Note `(n >> 1) - 1`: the shift rather than `n / 2` avoids the rounding question entirely for non-negative n, and the `- 1` is the last *internal* node, since every node from n/2 onwards is a leaf.',
    cpp: 'A `std::vector<int>` taken **by value**, so the caller\'s array is untouched and the function can return it. That is the C++ idiom for "I return a modified copy", and it is the reason the Java and Python listings mutate their argument instead: the two conventions are the same decision made under different language rules about what a parameter means.',
  },
  'build-loop': {
    javascript:
      "Start at `(n >> 1) - 1` and walk *leftwards*, because a node's children always have larger indices than it does — sifting a parent can only ever disturb nodes below it, so once a subtree is fixed every earlier node is unaffected. Getting the direction wrong is the classic bug: iterating upwards heapifies the roots and leaves the leaves broken.",
    python:
      '`range(n // 2 - 1, -1, -1)` — inclusive of -1 exclusive stop, so the last index visited is 0. Python is the only one of the four where the loop bounds are self-evidently right, and also the only one where `n // 2` is floor division; in C++ and Java `n / 2` truncates toward zero, which happens to agree for non-negative n and would quietly disagree for a negative length — which cannot exist.',
    java: 'The bounds and the direction, and the reason the loop is a separate method here rather than an inline block: Java has no closures over mutable locals, so an inner `while` loop sharing a mutable `i` with an outer `for` loop is impossible without a method or an array. The `siftDown` helper is not a stylistic choice, it is what the language forces.',
    cpp: 'A `for` loop over the internal nodes, backwards. Note that `sift_down` is a free function taking the vector by reference, which is the C++ way to express "this mutates its argument" — a plain `std::vector<int> a` parameter would silently copy and the heapify would be thrown away, a bug the compiler is perfectly happy with.',
  },
  compare: {
    javascript:
      'Pick the smaller child, then compare it with the parent. The `<=` versus `<` question does not arise here the way it does in a search, but the `>=` on the next line is what makes a tie a no-op — and a min-heap built with `>` instead would happily swap equal values forever without making progress, which is a hang rather than a wrong answer.',
    python:
      'One tuple-swap line where the other languages need three. This is the clearest place in the curriculum where Python is genuinely shorter rather than differently spelled: `a[i], a[pick] = a[pick], a[i]` reads both right-hand sides before writing either, so no temporary is needed and there is no window in which the array holds a duplicate value.',
    java: 'Three statements where Python has one, and the `int t = a[i]` temporary is not optional — Java has no tuple assignment, so the value has to live somewhere while both slots are written. The comparison `a[pick] >= a[i]` is on primitives, so it is a real numeric comparison with no boxing, which is why a heap beats a `Integer[]`-based priority queue on tight loops.',
    cpp: 'The same three statements, and the `t` temporary has a second role in C++: if `a[pick]` and `a[i]` were the same element (they are not, but the compiler has to allow for it) a self-assignment bug would be invisible. Copying first is the habit that makes vector and container swaps safe by habit rather than by proof.',
  },
  swap: {
    javascript:
      '`i = pick` is the line that makes heapify work at all. The node is not finished where it lands; it is finished when nothing below it is smaller. This loop is the whole algorithm, and it is why a single sift can be O(log n) even though the total build is O(n) — the individual sift is the *worst* case and the build is the *average* one.',
    python:
      'One assignment, and the loop condition re-derives `l` and `r` from the new `i` at the top — which is the entire mechanism. Nothing remembers where it has been; the arithmetic recomputes the children. That is the payoff of the implicit layout: there is no pointer to update, so a "move down" is an integer assignment.',
    java: 'Same one assignment, and the reason the method is a loop rather than a recursion: Java would let you write a recursive `siftDown` calling itself on `pick`, and it would be shorter, at the cost of a stack frame per level and no guarantee of tail-call optimisation. A heap sift is at most log n deep, so the stack is not the problem — throughput is.',
    cpp: "Same assignment, same reasoning. The one C++-specific note: `a` is a reference parameter, so `a[i] = ...` writes through to the caller's vector. Had the parameter been by value, every write would have landed in a copy and the function would have returned a heap that never existed — a bug the compiler gives no warning about.",
  },
  hold: {
    javascript:
      'The sift stops, for one of two reasons: no children, or the parent already beats the smaller child. Both mean the subtree rooted here satisfies the heap property, and neither can be fixed by looking further down — every descendant is already at least as large as its own parent, transitively. Two distinct exits, and a version with only one of them loops forever on a leaf.',
    python:
      'The same two exits. `return` rather than `break` inside a `while True`, which is idiomatic but worth naming: a `break` would work identically here because the loop has nothing after it, and would stop working the moment someone appended a step. The `while True` with returns is the shape that survives being edited.',
    java: "Two `return`s from a `void` method, and the leaf check comes *first* because it is the cheaper test — one comparison against `n` rather than two array reads. Getting the order wrong produces an `ArrayIndexOutOfBoundsException` at `a[l]`, which is Java's way of saying the guard was in the wrong place.",
    cpp: 'The same two exits. The leaf test is `l >= n` rather than `l > n`, and the off-by-one is the whole difficulty: a node at the last index has `l = 2n+1` which is well past the end, so `>=` and `>` differ by exactly the case that a heap of n leaves would hit. `l` is always odd and `r` always even, which is why the `r < n` check is separate.',
  },
  done: {
    javascript:
      'The array, mutated in place and returned. A caller that wants the original back has to have copied it — which is the correct contract for an in-place operation and the reason the C++ version takes its argument by value while this one does not.',
    python:
      'The same list object, mutated in place, so `build_heap(a)` and then reading `a` give the same thing twice. Python makes the aliasing visible; a version that quietly built a new list instead would be a semantic change, not an optimisation.',
    java: 'The same `int[]` reference. A static method that mutates its parameter and returns it is unusual in application code — a `void` and a documented "modifies in place" would be the house style — but for a teaching listing returning the array is what lets the harness compare it across four languages.',
    cpp: 'The vector, returned by value and moved rather than copied under C++11 and later. That move is why the parameter is by value: the caller hands over a vector, the function edits it, and the return transfers ownership back with no allocation. Had the parameter been by reference, the return would have been a full copy.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'buildHeap',
    python: 'build_heap',
    java: 'BuildHeap.buildHeap',
    cpp: 'build_heap',
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

/** The claim: the array after a bottom-up min-heapify. */
const expectations: Expectation[] = PRESETS.map((p) => {
  const values = valuesOf(p);
  return { presetId: p.id, args: [values], result: buildHeap(values) };
});

export const buildHeapAlgo: AlgoDef<TreeFrame> = {
  id: 'build-heap',
  title: 'Build a Min-Heap',
  category: 'heaps',
  summary:
    'Sift every internal node down once, starting from the last parent and working left. Total cost O(n), not the O(n log n) of inserting values one at a time.',
  intuition:
    "Reach for this when you already have a batch of values and want constant-time access to the smallest — a batch of tasks ordered by priority, a k-way merge, Dijkstra's frontier, an interval scheduling greedy pass. Do *not* reach for it when you are inserting one value at a time and the input is small: a sorted array or a balanced tree will beat a heap on memory and on worst-case guarantees, and n single pushes into a heap is O(n log n) where this construction is O(n). The whole reason this module exists is that building is strictly cheaper than filling, and almost nobody realises it.",
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    note: 'O(n) for every input, with no best case to speak of — the "already a heap" preset is O(n) too, it just does no swaps. The bound comes from summing the sifts: most nodes are near the leaves and sift furthest, but there are exponentially more of them, so the series converges to a constant times n. Space is O(1) beyond the array, because the array *is* the structure.',
  },
  traits: {
    stable: false,
    inPlace: true,
    online: false,
    allowsDuplicates: true,
    tags: ['linear build', 'implicit tree', 'in place', 'Floyd heapify'],
  },
  viewport: 'tree',
  level: 'intermediate',
  params: [],
  inputSpec,
  presets: PRESETS,
  run: buildHeapFrames,
  lesson,
  expectations,
  formatResult: (r) => `[${(r as number[]).join(', ')}]`,
  anchors: ['start', 'build-loop', 'compare', 'swap', 'hold', 'done'],
};

export default buildHeapAlgo;
