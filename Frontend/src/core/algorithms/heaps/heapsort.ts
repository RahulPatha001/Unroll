import { byLanguage } from '../../code/anchors.ts';
import { randomArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { NodeId, TreeFrame, TreeNode } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Heapsort by repeated extraction — the build from `build-heap.ts` followed by
 * `n - 1` extract-and-sift rounds.
 *
 * Two frames carry the whole algorithm and they are worth naming precisely:
 *
 *  - **`extract`** is the only move. The root of the heap is the extreme value;
 *    swapping it with the last element of the *active region* parks it in its
 *    final position and shrinks the region by one. The heap is then n-1 elements
 *    long and only the root is wrong, so a single sift-down from 0 repairs it.
 *  - **`boundary`** is the invariant the whole thing rests on: the elements from
 *    index `end` onwards are in final descending order and are never touched
 *    again. Everything clever about heapsort is the observation that this
 *    boundary means each round is O(log n) rather than O(n).
 *
 * ## Why the output is descending
 *
 * This is a **min**-heap, so the extreme value the root gives you is the
 * *smallest*, and parking smallest-at-the-end repeatedly leaves the array in
 * descending order. That is a deliberate choice, and the reason is visual rather
 * than algorithmic: `TreeView` orders a node's children by value because it was
 * written for BSTs, and for a min-heap that ordering coincides with the implicit
 * array (`2i+1` is the smaller child), so the drawn tree and the index arithmetic
 * tell the same story. Its sibling in `sorting/heap-sort.ts` is a max-heap and
 * comes out ascending; flipping `<` to `>` on the three comparisons is the entire
 * difference between the two.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 811;

const RANDOM = randomArray(SEED, 9, 5, 95);
const ASCENDING = [...randomArray(SEED + 3, 8, 5, 95)].sort((a, b) => a - b);
const DESCENDING = [...randomArray(SEED + 6, 8, 5, 95)].sort((a, b) => b - a);

const PRESETS: Preset[] = [
  {
    id: 'random',
    label: 'Random',
    blurb:
      'Nine seeded values. The build does a handful of sifts in the bottom levels and the extractions do a few swaps each, which is the shape of a real run: nothing dramatic anywhere, and O(n log n) overall.',
    input: { type: 'numbers', values: RANDOM },
  },
  {
    id: 'ascending',
    label: 'Already a min-heap',
    blurb:
      'Ascending input, so the build is a no-op — every parent already beats both children. Each extraction then swaps the root to the end and immediately sifts it back, so the whole sort is n-1 swaps and n-1 one-step sifts. The best case, and the one where heapsort is at its least impressive.',
    input: { type: 'numbers', values: ASCENDING },
  },
  {
    id: 'descending',
    label: 'Worst case for the build',
    blurb:
      'Descending input, so the build is the maximum amount of sift work the construction can do — every parent has to travel to the bottom. The extractions are then nearly free, because the values that arrive at the root are already in roughly the right place. Watch the two phases trade cost against each other.',
    input: { type: 'numbers', values: DESCENDING },
  },
  {
    id: 'single',
    label: 'One value',
    blurb:
      'Nothing to sort and nothing to build: the build loop starts at index -1 and the extraction loop at end = 0, so neither body runs. The degenerate case every loop bound in the algorithm has to survive, and the one where a `for (end = n - 1; end > 0; ...)` written with `>=` instead of `>` would index out of bounds.',
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

const spine = (i: number): NodeId[] => {
  const out: number[] = [];
  for (let x = i; x >= 0; x = parentOf(x)) out.unshift(x);
  return out.map(id);
};

const allIds = (n: number): NodeId[] => Array.from({ length: n }, (_, i) => id(i));
const range = (from: number, to: number): NodeId[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => id(from + i));

/** Rebuild the implicit tree from the array, every frame. */
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

/** The claim: the array after heapsort with a min-heap, i.e. sorted descending. */
export function heapSortDescending(values: number[]): number[] {
  const a = [...values];
  const n = a.length;
  const sift = (i: number, size: number): void => {
    for (;;) {
      const l = 2 * i + 1;
      if (l >= size) return;
      const r = 2 * i + 2;
      const pick = r < size && (a[r] as number) < (a[l] as number) ? r : l;
      if ((a[pick] as number) >= (a[i] as number)) return;
      const t = a[i] as number;
      a[i] = a[pick] as number;
      a[pick] = t;
      i = pick;
    }
  };
  for (let i = (n >> 1) - 1; i >= 0; i--) sift(i, n);
  for (let end = n - 1; end > 0; end--) {
    const t = a[0] as number;
    a[0] = a[end] as number;
    a[end] = t;
    sift(0, end);
  }
  return a;
}

export function* heapSortExtract(ctx: RunContext): Generator<TreeFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const values = [...source];
  const n = values.length;

  let ops = 0;
  /** The region still in play: `[0, heapSize)`. Everything past it is finished. */
  let heapSize = n;
  let extracts = 0;

  const base = (
    anchor: string,
    note: string,
    caption: string,
    extra: {
      i?: number;
      highlight?: Record<string, NodeId[]>;
      vars?: Record<string, number | string | boolean>;
    } = {},
  ): TreeFrame => {
    const at = extra.i ?? 0;
    return {
      kind: 'tree',
      index: 0,
      anchor,
      caption,
      note,
      nodes: treeOf(values),
      root: n > 0 ? id(0) : null,
      path: n > 0 ? spine(Math.max(0, Math.min(at, n - 1))) : [],
      asArray: true,
      arrayIndex: indexOf(n),
      highlight: extra.highlight ?? {},
      ops,
      vars: {
        n,
        i: at,
        parent: parentOf(at),
        left: leftOf(at),
        right: rightOf(at),
        heapSize,
        end: heapSize - 1,
        ops,
        ...(extra.vars ?? {}),
      },
    };
  };

  yield {
    kind: 'tree',
    index: 0,
    anchor: 'start',
    caption: `${n} values, unsorted`,
    note:
      n < 2
        ? 'Fewer than two values, so there is no build to do and no extraction to do. The array is trivially sorted, in either direction.'
        : `${n} values as the implicit tree — children at 2i+1 and 2i+2, parent at floor((i-1)/2). Two phases: build a min-heap in O(n), then repeatedly park the root at the end of the active region. The active region is [0, ${n}); everything at or past it is already final and will never be read again.`,
    nodes: treeOf(values),
    root: n > 0 ? id(0) : null,
    path: n > 0 ? [id(0)] : [],
    asArray: true,
    arrayIndex: indexOf(n),
    highlight: { unvisited: allIds(n) },
    vars: { n, heapSize: n, lastParent: Math.floor(n / 2) - 1, ops },
  };

  /* ---- phase 1: build the min-heap ------------------------------------ */
  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
    if (ctx.shouldStop()) return;
    ops++;
    const l = leftOf(i);

    yield base(
      'build-loop',
      `Build: sift the node at index ${i} (value ${values[i] as number}). Children at 2·${i}+1 = ${l}${l < n ? ` and ${l + 1}` : ''}${l >= n ? ', which is past the end, so it is a leaf and already settled' : ''}.`,
      `Build · heapify index ${i}`,
      { i, highlight: { current: [id(i)], unvisited: allIds(n) } },
    );

    let j = i;
    for (;;) {
      if (ctx.shouldStop()) return;
      const a = leftOf(j);
      const b = rightOf(j);
      if (a >= heapSize) {
        yield base(
          'hold',
          `Index ${j} is a leaf — 2·${j}+1 = ${a} is at or past the end of the active region — so there is nothing to compare and the sift stops.`,
          `Build · settle index ${j}`,
          { i: j, highlight: { answer: [id(j)], unvisited: allIds(n) } },
        );
        break;
      }
      const pick = b < heapSize && (values[b] as number) < (values[a] as number) ? b : a;
      if ((values[pick] as number) >= (values[j] as number)) {
        yield base(
          'hold',
          `The smaller child of index ${j} is ${values[pick] as number} and the parent is ${values[j] as number}, so the parent already wins. The subtree is a heap and the sift stops.`,
          `Build · settle index ${j}`,
          { i: j, highlight: { answer: [id(j)], unvisited: allIds(n) } },
        );
        break;
      }
      ops++;
      yield base(
        'compare',
        `Compare parent ${values[j] as number} at index ${j} with the smaller child ${values[pick] as number} at index ${pick}. The child is smaller, so the parent has to keep descending.`,
        `Build · sift index ${j}`,
        { i: j, highlight: { compare: [id(j), id(pick)], unvisited: allIds(n) } },
      );
      const t = values[j] as number;
      values[j] = values[pick] as number;
      values[pick] = t;
      yield base(
        'swap',
        `Swap: ${values[j] as number} rises to index ${j} and ${values[pick] as number} drops to index ${pick}. The sift resumes from the new index — nothing is final until nothing below is smaller.`,
        `Build · sift index ${pick}`,
        { i: pick, highlight: { swapping: [id(j), id(pick)], unvisited: allIds(n) } },
      );
      j = pick;
    }
  }

  yield base(
    'build-done',
    n < 2
      ? 'There was no internal node to fix, so the array was already a heap.'
      : `The array is now a min-heap: the root is the smallest of all ${n} values, ${values[0] as number}. Phase two never looks at the shape again — it only ever reads the root.`,
    `Build complete · root ${n > 0 ? (values[0] as number) : '—'}`,
    { i: 0, highlight: { answer: n > 0 ? [id(0)] : [], unvisited: allIds(n) } },
  );

  /* ---- phase 2: extract the root, n-1 times ---------------------------- */
  for (let end = n - 1; end > 0; end--) {
    if (ctx.shouldStop()) return;
    ops++;
    extracts++;
    const smallest = values[0] as number;
    const last = values[end] as number;

    yield base(
      'extract',
      `Extract: the root is the smallest value left, ${smallest}. Swap it with index ${end} (${last}) — that parks ${smallest} in its **final** position, and index ${end} becomes the boundary. The heap is now ${end} element${end === 1 ? '' : 's'} long and only the root is wrong.`,
      `Extract ${extracts} of ${Math.max(0, n - 1)}`,
      { i: 0, highlight: { swapping: [id(0), id(end)], unvisited: range(end, n) } },
    );

    const t = values[0] as number;
    values[0] = values[end] as number;
    values[end] = t;
    heapSize = end;

    yield base(
      'boundary',
      `Index ${end} now holds ${values[end] as number} and is never touched again — it is smaller than everything still in the active region, which is exactly the descending-order invariant. The active region is [0, ${end}). ${end} value${end === 1 ? '' : 's'} settled, ${n - end - 1} to go.`,
      `Settled through index ${end}`,
      { i: 0, highlight: { sorted: range(end, n), current: [id(0)] } },
    );

    let j = 0;
    for (;;) {
      if (ctx.shouldStop()) return;
      const a = leftOf(j);
      const b = rightOf(j);
      if (a >= heapSize) {
        yield base(
          'hold',
          `${values[j] as number} at index ${j} has no children inside the active region, so the heap is whole again. This round cost one swap and at most log n comparisons.`,
          `Round ${extracts} complete`,
          { i: j, highlight: { answer: [id(j)], sorted: range(end, n) } },
        );
        break;
      }
      const pick = b < heapSize && (values[b] as number) < (values[a] as number) ? b : a;
      if ((values[pick] as number) >= (values[j] as number)) {
        yield base(
          'hold',
          `The smaller child of index ${j} is ${values[pick] as number} and the parent is ${values[j] as number}, so the heap property holds here. One sift from the root repaired the whole thing, because that is the only node the extraction disturbed.`,
          `Round ${extracts} complete`,
          { i: j, highlight: { answer: [id(j)], sorted: range(end, n) } },
        );
        break;
      }
      ops++;
      yield base(
        'compare',
        `Sift from the root: parent ${values[j] as number} at index ${j} against the smaller child ${values[pick] as number} at index ${pick}. Only indices below ${heapSize} count — anything at or past the boundary is off limits now.`,
        `Round ${extracts} · sift index ${j}`,
        { i: j, highlight: { compare: [id(j), id(pick)], sorted: range(end, n) } },
      );
      const s = values[j] as number;
      values[j] = values[pick] as number;
      values[pick] = s;
      yield base(
        'swap',
        `Swap: ${values[j] as number} rises to index ${j} and ${values[pick] as number} drops to index ${pick}. Both are inside the active region; nothing at or past index ${end} is touched.`,
        `Round ${extracts} · sift index ${pick}`,
        { i: pick, highlight: { swapping: [id(j), id(pick)], sorted: range(end, n) } },
      );
      j = pick;
    }
  }

  yield base(
    'done',
    n < 2
      ? 'Nothing to sort. The single value is trivially in descending order.'
      : `Sorted: ${values.join(', ')}. ${extracts} extraction${extracts === 1 ? '' : 's'} and ${ops} step${ops === 1 ? '' : 's'} in total. Worst-case O(n log n) with O(1) extra space — no auxiliary array at all, which is the one thing a comparison sort cannot usually offer and the reason heapsort is the right answer when memory is tight and the data is on disk.`,
    'Sorted',
    {
      i: 0,
      highlight: { sorted: allIds(n) },
      vars: { min: values[n - 1] ?? 0, max: values[0] ?? 0 },
    },
  );
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Values to sort',
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
 * All four build a min-heap and then extract n-1 times, and all four return the
 * array in **descending** order. The listings take the array by value in C++ and
 * mutate in place elsewhere, which is the same decision expressed under two
 * different sets of language rules.
 * ------------------------------------------------------------------ */

const JS = `function heapSort(a) {
  const n = a.length;                                  // @anchor start
  const siftDown = (i, size) => {
    for (;;) {
      const l = 2 * i + 1;
      if (l >= size) return;                           // @anchor hold  a leaf inside the heap
      const r = 2 * i + 2;
      const pick = r < size && a[r] < a[l] ? r : l;
      if (a[pick] >= a[i]) return;                     // @anchor hold  the parent already wins
      const t = a[i];                                  // @anchor compare
      a[i] = a[pick];
      a[pick] = t;
      i = pick;                                        // @anchor swap
    }
  };
  for (let i = (n >> 1) - 1; i >= 0; i--) siftDown(i, n);   // @anchor build-loop
  // Phase one done: the array is a min-heap, so the root is the smallest value left.  // @anchor build-done
  for (let end = n - 1; end > 0; end--) {              // @anchor extract
    const t = a[0];
    a[0] = a[end];
    a[end] = t;                                        // @anchor boundary
    siftDown(0, end);
  }
  return a;                                            // @anchor done
}`;

const PY = `def heap_sort(a):
    n = len(a)                                         # @anchor start
    def sift_down(i, size):
        while True:
            l = 2 * i + 1
            if l >= size:
                return                                # @anchor hold  a leaf inside the heap
            r = 2 * i + 2
            pick = r if r < size and a[r] < a[l] else l
            if a[pick] >= a[i]:
                return                                # @anchor hold  the parent already wins
            a[i], a[pick] = a[pick], a[i]              # @anchor compare
            i = pick                                  # @anchor swap
    for i in range(n // 2 - 1, -1, -1):                # @anchor build-loop
        sift_down(i, n)
    # Phase one done: the array is a min-heap.        # @anchor build-done
    for end in range(n - 1, 0, -1):                   # @anchor extract
        a[0], a[end] = a[end], a[0]                   # @anchor boundary
        sift_down(0, end)
    return a                                          # @anchor done
`;

const JAVA = `class HeapSortExtract {
    static int[] heapSort(int[] a) {
        int n = a.length;                             // @anchor start
        for (int i = (n >> 1) - 1; i >= 0; i--) siftDown(a, n, i);   // @anchor build-loop
        // Phase one done: the array is a min-heap.  // @anchor build-done
        for (int end = n - 1; end > 0; end--) {       // @anchor extract
            int t = a[0];
            a[0] = a[end];
            a[end] = t;                               // @anchor boundary
            siftDown(a, end, 0);
        }
        return a;                                     // @anchor done
    }

    static void siftDown(int[] a, int size, int i) {
        while (true) {
            int l = 2 * i + 1;
            if (l >= size) return;                    // @anchor hold  a leaf inside the heap
            int r = 2 * i + 2;
            int pick = (r < size && a[r] < a[l]) ? r : l;
            if (a[pick] >= a[i]) return;              // @anchor hold  the parent already wins
            int t = a[i];                           // @anchor compare
            a[i] = a[pick];
            a[pick] = t;
            i = pick;                                 // @anchor swap
        }
    }
}`;

const CPP = `#include <vector>

void sift_down(std::vector<int>& a, int size, int i) {
    while (true) {
        int l = 2 * i + 1;
        if (l >= size) return;                        // @anchor hold  a leaf inside the heap
        int r = 2 * i + 2;
        int pick = (r < size && a[r] < a[l]) ? r : l;
        if (a[pick] >= a[i]) return;                  // @anchor hold  the parent already wins
        int t = a[i];                               // @anchor compare
        a[i] = a[pick];
        a[pick] = t;
        i = pick;                                     // @anchor swap
    }
}

std::vector<int> heap_sort(std::vector<int> a) {
    int n = (int)a.size();                            // @anchor start
    for (int i = (n >> 1) - 1; i >= 0; i--) sift_down(a, n, i);     // @anchor build-loop
    // Phase one done: the array is a min-heap.  // @anchor build-done
    for (int end = n - 1; end > 0; end--) {           // @anchor extract
        int t = a[0];
        a[0] = a[end];
        a[end] = t;                                   // @anchor boundary
        sift_down(a, end, 0);
    }
    return a;                                         // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'The array is both the input and the heap — there is no second structure. Note that `siftDown` takes a `size` argument rather than closing over `n`, because phase two shrinks the heap every round and a sift must not walk into the finished suffix. That one parameter is what stops the sort from corrupting its own output.',
    python:
      'One list for both roles. The nested `sift_down` closes over `a` but takes `size` explicitly, which is the same decision as the other three: the heap gets smaller every round, so its extent has to be a parameter rather than a constant. Python would also let you `del a[end:]` to truncate, and that is a worse answer — the sorted suffix *is* the output.',
    java: 'An `int[]` used in place, and the `siftDown` helper is not optional in Java: the extraction loop reassigns its own `i` on the swap line, and a `for` loop variable cannot be modified from a nested loop. Every Java heapsort in the wild has exactly this shape for exactly this reason, and it is a nice illustration of how much ceremony a language asks for in exchange for static typing.',
    cpp: "A `std::vector<int>` taken **by value**, so the sort is destructive to a local copy and the return hands it back. The alternative — by reference, mutating the caller's vector and returning `void` — is faster and is what production code would do; by-value is chosen here because it is the same contract the other three languages express, and because C++17 guarantees the return is moved rather than copied.",
  },
  'build-loop': {
    javascript:
      "Start at the last internal node and walk left. The direction is not arbitrary: a node's children always have larger indices, so sifting a parent can only disturb nodes *below* it — meaning that once a subtree is fixed, no earlier iteration can break it. Iterating upwards instead heapifies the roots and leaves the leaves wrong, which is the single most common hand-rolled-heap bug.",
    python:
      '`range(n // 2 - 1, -1, -1)`, and the `-1` is the difference between a heap and a broken heap: nodes from index `n // 2` onwards are all leaves and are already trivially valid heaps, so starting there wastes the entire second half of the loop doing nothing.',
    java: 'The same bounds, with `(n >> 1) - 1` rather than `n / 2 - 1`. The shift is exact for non-negative `n` and reads as "half, rounded down", which is what the index arithmetic means — `n / 2` would be identical here and would be a rounding question in the reader\'s head instead.',
    cpp: 'The same loop, and note the `i--` on a signed `int`: had `i` been `size_t` the loop would not terminate, because `0 - 1` wraps to the maximum value and the condition stays true. Unsigned loop counters on downward loops are a classic C++ bug, and the compiler warns about it only if you ask.',
  },
  'build-done': {
    javascript:
      'The array is now a min-heap and the sort is guaranteed to work from here. What phase one buys is a single guarantee — the root is the extreme value — and the entire rest of the algorithm only ever reads the root. Everything after this is that one fact being cashed in repeatedly.',
    python:
      'One invariant, and everything after it is bookkeeping. The reason heap construction is worth separating out is exactly this: it is the only part of heapsort that is not about extraction, and it is the part that is O(n) rather than O(n log n).',
    java: 'The array is a heap. Note that the whole "data structure" is now implicit: no nodes, no pointers, no allocation. A binary heap is one of the very few "classic" data structures with no allocation at all after construction, which is why it is the right choice inside a kernel or a real-time loop where a malloc is not allowed.',
    cpp: 'Still no allocation, and that is the strongest argument for a heap in C++ specifically: `std::priority_queue` is a `vector` with a comparator, and inserting an element is a `push_back` plus a sift, with no node per element and therefore no per-element allocation to slow the allocator down or fragment the heap.',
  },
  extract: {
    javascript:
      'The only move in the sort. The root is the smallest remaining value; swapping it with the last element of the active region puts it where it belongs forever. The subtlety is that the swap *demotes* whatever was at the end into the root, so the heap is now broken in exactly one place — and that is why one sift-down from index 0 is enough, rather than a rebuild.',
    python:
      'A tuple swap, and Python makes the asymmetry explicit: `a[0], a[end] = a[end], a[0]` reads both right-hand sides before writing either, so there is no moment at which the smallest value exists nowhere. That is not just elegance — in a three-statement version the intermediate state is observable, and "observable" is how off-by-one bugs get in.',
    java: 'Three statements where Python has one, and the `int t = a[0]` temporary is again unavoidable: Java has no tuple assignment, so one of the two slots has to hold the value while the other is written. The extraction is a single swap in every language; only the syntax differs.',
    cpp: "The same three statements, and the `int` temporary is free here — no boxing, no allocation. Worth noting for a sort that will be run on millions of elements: heapsort's per-swap cost is a handful of integer moves, and a `std::vector<int>` of a million values is one allocation for the whole sort.",
  },
  boundary: {
    javascript:
      'Index `end` is now final. Everything from here to the end of the array is in descending order and correct, and no later sift is allowed to look at it — which is why `siftDown` is called with `end` and not with `n`. The whole O(n log n) bound lives on this line: each round does O(1) work at the boundary and O(log n) below it, and there are n rounds.',
    python:
      'The boundary, and the second thing worth noticing: the *smallest* value is being parked at the far right, so the array ends up descending. A max-heap would park the largest and come out ascending. Nothing else changes — not the build, not the sift, not the loop bounds — which is a useful thing to be able to state precisely rather than approximately.',
    java: 'The invariant that makes heapsort correct and cheap. Two things are happening on the same pair of lines: the swap is the extraction, and the `siftDown(a, end, 0)` that follows is the repair. The `end` passed to the sift is the *new* heap size, and passing `n` by mistake would silently sort the array into nonsense while looking like it worked.',
    cpp: 'Same boundary, same consequence. Note that the sorted suffix lives in the same `std::vector` as the heap, so there is no second buffer and no allocation after the initial one — the O(1) space claim is not a trick, it is a consequence of the array being the whole data structure.',
  },
  compare: {
    javascript:
      'Pick the smaller of the two children and compare it with the parent. Note the guard `r < size` before reading `a[r]`: the left child existing does not imply the right one does, and a heap of odd size has a node with exactly one child. Getting that check wrong is an out-of-bounds read on the last node of every odd-sized heap.',
    python:
      'One ternary picking the smaller child, then a compare-and-return. The `a[i], a[pick] = a[pick], a[i]` on the following line is the swap, and the fact that it reads as one statement is why the *order* of the two pops matters nowhere here: `l` and `r` are indices, not the values being combined, so there is no "wrong operand first" bug of the kind a stack machine has.',
    java: 'The same three lines, on `int[]` so the comparisons are primitive and unboxed. That is a real performance difference from a `Integer[]`-based heap: a `java.util.PriorityQueue` boxes on every offer and unboxes on every peek, and in a tight loop that allocation is often more expensive than the sift itself.',
    cpp: 'Same three lines, and the `size` parameter is the thing to notice — it is threaded through every call and is the only thing distinguishing the build phase from the extraction phase. A version that closed over a global `n` would look tidier and would sort the already-sorted suffix again, which is not a crash but is a mysterious wrong answer.',
  },
  swap: {
    javascript:
      'The exchange, and then `i = pick` — the descent continues from where the value landed. The node is not finished when it arrives; it is finished when nothing beneath it is smaller. This loop is the entire sort, and it is why a single sift is O(log n) while the whole construction over all nodes is O(n).',
    python:
      'One line and one assignment, and the loop re-derives `l` and `r` from the new `i` at the top of the next turn. Nothing remembers the path taken: the arithmetic recomputes the children from the index, which is the payoff of the implicit layout and the reason there is not a single pointer in the algorithm.',
    java: 'The same two statements. A recursive `siftDown(a, size, pick)` would be shorter and would be at most `log n` frames deep, so the stack is not the danger — throughput is, and a loop has no frame at all.',
    cpp: "The same, and the reassignment is the only pointer-like operation in the entire algorithm. Because `a` is a reference parameter the write lands in the caller's vector; had it been by value the whole sort would have edited a copy and returned an untouched array, with no diagnostic.",
  },
  hold: {
    javascript:
      'The sift stops, for one of two reasons: the node has no children inside the heap, or the parent already beats the smaller child. Both mean the subtree satisfies the heap property, and neither can be fixed by looking further down. Two exits, and a version with only the first one spins forever the moment it reaches a node that has children but is already in order.',
    python:
      'The same two `return`s. The leaf test `l >= size` comes first because it is one comparison against a local rather than two list reads, and the order is not cosmetic: with the tests the other way round, `a[l]` on a leaf is an `IndexError` rather than a clean exit.',
    java: 'Two `return`s from a `void` method. The `size` argument rather than `a.length` is what keeps phase two from walking into the finished suffix — pass `a.length` and the sort would still terminate, still be in place, and still be wrong, which is the worst combination of failure modes available.',
    cpp: 'The same two exits. Note `if (l >= size) return;` comes before the `r` computation precisely so `a[r]` is never read out of range, and that `l` is always odd while `r` is always even — which is why a heap with an odd number of elements can have a node with a left child and no right child, and why the `r < size` guard cannot be folded into the `l >= size` test.',
  },
  done: {
    javascript:
      'The array, in **descending** order, mutated in place. Descending because this is a min-heap: the root hands back the smallest value, and parking the smallest at the end repeatedly leaves the largest at the front. Change the three `<` comparisons to `>` and the identical code comes out ascending — that is the entire distance between a min-heap sort and a max-heap sort.',
    python:
      'The list itself, mutated and returned. A sort that returns a *new* list would double the memory and defeat the one thing heapsort is for, so the in-place contract is not a shortcut here — it is the reason to choose this sort at all.',
    java: 'The same `int[]` reference. A static method that mutates its argument and returns it is unusual in application code, where a `void` plus a documented side effect would be the house style; for this listing it is what lets the harness compare the result across four languages without a bespoke adapter.',
    cpp: 'The vector, returned by value and moved rather than copied. With `std::sort` the same interface hides a whole quicksort/introsort, so a reader who sees `return a;` after a hand-written loop can see exactly what was done — which is the entire point of showing this rather than calling the standard library.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'heapSort',
    python: 'heap_sort',
    java: 'HeapSortExtract.heapSort',
    cpp: 'heap_sort',
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

const expectations: Expectation[] = PRESETS.map((p) => {
  const values = valuesOf(p);
  return { presetId: p.id, args: [values], result: heapSortDescending(values) };
});

export const heapSortExtractAlgo: AlgoDef<TreeFrame> = {
  id: 'heapsort',
  title: 'Heapsort by Extraction (min-heap, descending)',
  category: 'heaps',
  summary:
    'Build a min-heap in O(n), then swap the root to the end of the active region n-1 times, shrinking the region by one and sifting the new root back down each round.',
  intuition:
    'Reach for this when you need a comparison sort with **no auxiliary memory** and a worst case you can rely on: sorting on a device with a small heap, sorting a large file through a fixed buffer, or a priority queue you intend to drain completely. Do not reach for it for speed — it is typically two to three times slower than quicksort on random data, because every comparison is a random memory access rather than a sequential one, and the constant factor lives entirely in cache misses. If you need the input preserved, or the sort is on the critical path, use a different algorithm.',
  complexity: {
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(1)',
    note: 'O(n) to build plus n-1 extractions at O(log n) each, so O(n log n) for *every* input — there is no best case, unlike quicksort. Space is O(1) auxiliary, which is the rarest property a comparison sort has, and it is the whole reason this algorithm exists alongside its faster cousins.',
  },
  traits: {
    stable: false,
    inPlace: true,
    online: false,
    allowsDuplicates: true,
    tags: ['O(1) space', 'worst-case O(n log n)', 'not stable', 'in place'],
  },
  viewport: 'tree',
  level: 'intermediate',
  params: [],
  inputSpec,
  presets: PRESETS,
  run: heapSortExtract,
  lesson,
  expectations,
  formatResult: (r) => `[${(r as number[]).join(', ')}]`,
  anchors: [
    'start',
    'build-loop',
    'build-done',
    'extract',
    'boundary',
    'compare',
    'swap',
    'hold',
    'done',
  ],
};

export default heapSortExtractAlgo;
