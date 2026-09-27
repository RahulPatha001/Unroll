import { byLanguage } from '../../code/anchors.ts';
import {
  distinctArray,
  nearlySortedArray,
  randomArray,
  reversedArray,
} from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Heap Sort — build a max-heap in the array itself, then take the root away
 * n - 1 times.
 *
 * The heap is never stored as a tree: a binary heap *is* the array, with
 * children at `2i + 1` and `2i + 2`. That is what makes heapsort in place and
 * O(1) in space, and it is why the two highlight groups in every frame matter
 * so much — `sorted` marks the live heap boundary and `compare` marks the exact
 * subtree being sifted, which is the part students usually cannot picture.
 *
 * The `sorted` range field marks the other end of the story: everything from
 * `heapSize` onwards is already in its final position, because the maximum of
 * the heap was the largest value left and it was parked at the far end.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 131;

/**
 * One array per preset, hoisted so a preset's `size` and its `values` can
 * never disagree — the generator honours `params.size`, so a preset that
 * stored more values than it asked for would be silently truncated and the
 * animation would stop matching the code the verification harness runs.
 */
const RANDOM = randomArray(SEED, 9, 10, 98);
const SORTED = nearlySortedArray(SEED + 4, 9, 1, 99).sort((a, b) => a - b);
const REVERSE = reversedArray(SEED + 6, 9, 1, 99);
const DISTINCT = distinctArray(SEED + 10, 9, 1, 120);

const PRESETS: Preset[] = [
  {
    id: 'random',
    label: 'Random',
    blurb:
      'The everyday case. Building the heap already moves most values a long way, so the extraction phase sifts only a couple of levels.',
    input: { type: 'numbers', values: RANDOM },
    params: { size: RANDOM.length },
  },
  {
    id: 'sorted',
    label: 'Already sorted',
    blurb:
      'A genuine surprise, and the reason this preset exists. Building the heap is almost free — the parent is already the largest, so no sift-down finds anything to fix — but the extraction phase then does the *most* work of any preset, because every value swapped in from the tail is the smallest one left and has to travel all the way down. Watch the swap-down count: 18 here, against 12 on reversed data.',
    input: { type: 'numbers', values: SORTED },
    params: { size: SORTED.length },
  },
  {
    id: 'reverse',
    label: 'Reversed',
    blurb:
      'Descending data is the worst input for building the heap: every sift-down travels all the way to the bottom of the subtree. The extraction phase is cheap by contrast.',
    input: { type: 'numbers', values: REVERSE },
    params: { size: REVERSE.length },
  },
  {
    id: 'distinct',
    label: 'All distinct',
    blurb:
      'No ties, so the "which child is bigger" step never has to break a tie and every sift-down is unambiguous.',
    input: { type: 'numbers', values: DISTINCT },
    params: { size: DISTINCT.length },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

/**
 * Indices of the heap-shaped subtree rooted at `root`, clipped to the live heap.
 * A plain level-order walk of `2i + 1` / `2i + 2`, which is what makes the
 * "one `compare` group = the region this sift can still touch" honest.
 */
const subtreeOf = (root: number, size: number): number[] => {
  const out: number[] = [];
  const queue: number[] = [root];
  while (queue.length > 0) {
    const i = queue.shift() as number;
    if (i >= size || out.includes(i)) continue;
    out.push(i);
    queue.push(2 * i + 1, 2 * i + 2);
  }
  return out;
};

export function* heapSort(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const size = Number(ctx.params.size ?? input.values.length);
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const values = [...source].slice(0, Math.max(0, size));
  const n = values.length;

  let ops = 0;
  let sifts = 0;
  /** The live heap is `values[0, heapSize)`; everything past it is final. */
  let heapSize = n;

  /**
   * The two highlight groups the whole visualisation is built around:
   * `sorted` is the live heap boundary, `compare` is the subtree this sift can
   * still reach. Everything else hangs off those two.
   */
  const heap = (
    root: number,
    extra: Record<string, number[]>,
    pointers: Record<string, number>,
  ) => ({
    pointers,
    highlight: { ...extra, compare: subtreeOf(root, heapSize), sorted: range(0, heapSize) },
    ...(heapSize < n ? { sorted: [heapSize, n] as [number, number] } : {}),
    ops,
  });

  function* siftDown(root: number): Generator<ArrayFrame> {
    let at = root;
    let levels = 0;

    while (true) {
      const left = 2 * at + 1;
      const right = left + 1;
      const hasChildren = left < heapSize;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'sift',
        caption: `Heap size ${heapSize}`,
        note: hasChildren
          ? `Sift the value at index ${at} (${values[at] as number}) down. It is too small to sit above its children, so it has to keep moving until it reaches a leaf or until the children turn out to be smaller.`
          : `Index ${at} holds ${values[at] as number} and is a leaf — index ${left} is already past the live boundary ${heapSize} — so there is nothing left for it to be compared against. The sift ends here.`,
        values: [...values],
        ...heap(at, { active: [at] }, { root: at, heapSize }),
        ops,
        vars: { root: at, left, heapSize, levels },
      };

      if (!hasChildren) {
        yield {
          kind: 'array',
          index: 0,
          anchor: 'sift-done',
          caption: `Heap size ${heapSize}`,
          note: `${values[at] as number} is a leaf of the heap, so no child can be bigger. The heap property is restored and the sift is over, having descended ${levels} level${levels === 1 ? '' : 's'}.`,
          values: [...values],
          ...heap(at, { found: [at] }, { root: at, heapSize }),
          ops,
          vars: { root: at, heapSize, levels },
        };
        return;
      }

      yield {
        kind: 'array',
        index: 0,
        anchor: 'children',
        caption: `Heap size ${heapSize}`,
        note: `The children of index ${at} are at 2·${at}+1 = ${left} and 2·${at}+2 = ${right}. ${right < heapSize ? `Both are inside the live heap, so the bigger of them is the candidate to lift above ${values[at] as number}.` : `Index ${right} is already past the live boundary ${heapSize}, so the left child ${values[left] as number} is the only candidate.`}`,
        values: [...values],
        ...heap(
          at,
          { window: [left, right].filter((k) => k < heapSize) },
          { root: at, left, right, heapSize },
        ),
        ops,
        vars: { root: at, left, right, heapSize },
      };

      ops++;
      const leftValue = values[left] as number;
      let biggest = left;
      let biggestValue = leftValue;

      if (right < heapSize) {
        const rightValue = values[right] as number;
        if (rightValue > leftValue) {
          biggest = right;
          biggestValue = rightValue;
        }
        yield {
          kind: 'array',
          index: 0,
          anchor: 'compare',
          caption: `Heap size ${heapSize}`,
          note: `Left child ${leftValue} at index ${left}, right child ${rightValue} at index ${right}. ${rightValue > leftValue ? `${rightValue} is bigger, so the right child becomes the candidate.` : `${leftValue} is the bigger of the two, so the candidate stays on the left.`} The parent ${values[at] as number} now has to beat index ${biggest}.`,
          values: [...values],
          ...heap(at, { current: [at, biggest] }, { root: at, left, right, heapSize }),
          ops,
          vars: { root: at, left, right, leftValue, rightValue },
        };
      } else {
        yield {
          kind: 'array',
          index: 0,
          anchor: 'compare',
          caption: `Heap size ${heapSize}`,
          note: `Only one child is inside the heap: ${leftValue} at index ${left}. It is the candidate to lift, and the parent ${values[at] as number} has to beat it or the sift stops.`,
          values: [...values],
          ...heap(at, { current: [at, left] }, { root: at, left, right, heapSize }),
          ops,
          vars: { root: at, left, right, leftValue },
        };
      }

      const parentValue = values[at] as number;
      if (biggestValue <= parentValue) {
        yield {
          kind: 'array',
          index: 0,
          anchor: 'sift-done',
          caption: `Heap size ${heapSize}`,
          note: `Neither child beats the parent: ${parentValue} is still at least as big as the biggest child ${biggestValue}, so the heap property already held at index ${at} and nothing is written. The sift stopped after ${levels + 1} level${levels + 1 === 1 ? '' : 's'} — this is the cheap case, and it is the one that shows up on already-heap-shaped data.`,
          values: [...values],
          ...heap(at, { found: [at] }, { root: at, heapSize }),
          ops,
          vars: { root: at, heapSize, levels },
        };
        return;
      }

      values[at] = biggestValue;
      values[biggest] = parentValue;
      sifts++;
      levels++;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'swap-down',
        caption: `Heap size ${heapSize}`,
        note: `Swap. ${biggestValue} rises from index ${biggest} to index ${at}, and ${parentValue} drops into the child's slot. ${parentValue} may still be too big down there, so the sift continues from index ${biggest}.`,
        values: [...values],
        ...heap(at, { swapping: [at, biggest] }, { root: at, left: biggest, right, heapSize }),
        ops,
        vars: { root: at, biggest, heapSize, levels, sifts },
      };

      at = biggest;
    }
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    note:
      n < 2
        ? 'Fewer than two elements, so there is no heap to build. Done.'
        : `No heap yet — just ${n} values in a row. Building a max-heap will put the largest value at index 0 and make every parent at least as big as its children at 2i+1 and 2i+2.`,
    values: [...values],
    highlight: { unvisited: range(0, n) },
    vars: { n, heapSize },
  };

  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
    yield {
      kind: 'array',
      index: 0,
      anchor: 'build-heap',
      caption: `Build the heap — node ${i + 1} of ${Math.floor(n / 2)}`,
      note: `Start at index ${i}, the last index that has any children, and work upwards. That direction is what makes the build linear: every node below has already been repaired, so each sift-down only walks a subtree that was already a heap. ${i + 1} of ${Math.floor(n / 2)} nodes done.`,
      values: [...values],
      ...heap(i, { visited: range(0, i) }, { root: i, heapSize, from: i }),
      ops,
      vars: { i, heapSize, n },
    };

    yield* siftDown(i);
  }

  for (let end = n - 1; end > 0; end--) {
    const top = values[0] as number;
    const last = values[end] as number;
    values[0] = last;
    values[end] = top;
    heapSize = end;
    ops++;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'extract',
      caption: `Heap size ${heapSize}`,
      note: `${end === n - 1 ? 'The heap is built, so index 0 holds the largest value in the array. Swap it with the last value in the live heap' : 'Swap the root with the last value in the live heap'}: ${top} goes to index ${end}, which is now final and will never move again. The heap shrinks to ${heapSize} values and ${last} has to be sifted back down from the root.`,
      values: [...values],
      ...heap(0, { found: [end], swapping: [0, end] }, { root: 0, heapSize, end }),
      ops,
      vars: { end, heapSize, max: top },
    };

    yield* siftDown(0);
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'done',
    note: `The last value left in the heap was the smallest of everything, so the array is sorted. ${ops} comparison${ops === 1 ? '' : 's'} and ${sifts} downward swap${sifts === 1 ? '' : 's'} — the same O(n log n) as merge sort, with no buffer and no recursion.`,
    values: [...values],
    highlight: { sorted: range(0, n) },
    sorted: [0, n],
    result: 'sorted',
    ops,
    vars: { ops, sifts, heapSize },
  };
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Array',
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
 * ------------------------------------------------------------------ */

const JS = `function heapSort(a) {
  // No heap yet: just n values in a row.                // @anchor start
  const n = a.length;
  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {  // @anchor build-heap
    siftDown(a, i, n);
  }
  for (let end = n - 1; end > 0; end--) {              // @anchor extract
    const t = a[0];                                    // park the root at the far end
    a[0] = a[end];
    a[end] = t;
    siftDown(a, 0, end);
  }
  return a;                                            // @anchor done
}

function siftDown(a, root, size) {
  while (true) {                                       // @anchor sift
    const left = 2 * root + 1, right = 2 * root + 2;   // @anchor children
    if (left >= size) return;                          // no children: done  // @anchor sift-done
    let big = left;
    if (right < size && a[right] > a[big]) big = right; // @anchor compare
    if (a[big] <= a[root]) return;                     // parent already wins  // @anchor sift-done
    const t = a[root];                                 // @anchor swap-down
    a[root] = a[big];
    a[big] = t;
    root = big;
  }
}`;

const PY = `def heap_sort(a):
    # No heap yet: just n values in a row.               # @anchor start
    n = len(a)
    for i in range(n // 2 - 1, -1, -1):                # @anchor build-heap
        sift_down(a, i, n)
    for end in range(n - 1, 0, -1):                    # @anchor extract
        a[0], a[end] = a[end], a[0]                    # park the root at the far end
        sift_down(a, 0, end)
    return a                                           # @anchor done

def sift_down(a, root, size):
    while True:                                        # @anchor sift
        left, right = 2 * root + 1, 2 * root + 2       # @anchor children
        if left >= size:                                # no children: done
            return                                     # @anchor sift-done
        big = left
        if right < size and a[right] > a[big]:          # @anchor compare
            big = right
        if a[big] <= a[root]:                           # parent already wins
            return                                     # @anchor sift-done
        a[root], a[big] = a[big], a[root]              # @anchor swap-down
        root = big`;

const JAVA = `class HeapSort {
    static int[] heapSort(int[] a) {
        // No heap yet: just n values in a row.         // @anchor start
        int n = a.length;
        for (int i = n / 2 - 1; i >= 0; i--) {         // @anchor build-heap
            siftDown(a, i, n);
        }
        for (int end = n - 1; end > 0; end--) {         // @anchor extract
            int t = a[0];                               // park the root at the far end
            a[0] = a[end];
            a[end] = t;
            siftDown(a, 0, end);
        }
        return a;                                       // @anchor done
    }

    static void siftDown(int[] a, int root, int size) {
        while (true) {                                  // @anchor sift
            int left = 2 * root + 1, right = 2 * root + 2; // @anchor children
            if (left >= size) return;                   // no children: done   // @anchor sift-done
            int big = left;
            if (right < size && a[right] > a[big]) big = right; // @anchor compare
            if (a[big] <= a[root]) return;              // parent already wins  // @anchor sift-done
            int t = a[root];                            // @anchor swap-down
            a[root] = a[big];
            a[big] = t;
            root = big;
        }
    }
}`;

const CPP = `#include <vector>
using std::vector;

void sift_down(vector<int>& a, int root, int size);

vector<int> heap_sort(vector<int> a) {
    // No heap yet: just n values in a row.              // @anchor start
    int n = (int)a.size();
    for (int i = n / 2 - 1; i >= 0; i--) {             // @anchor build-heap
        sift_down(a, i, n);
    }
    for (int end = n - 1; end > 0; end--) {             // @anchor extract
        int t = a[0];                                   // park the root at the far end
        a[0] = a[end];
        a[end] = t;
        sift_down(a, 0, end);
    }
    return a;                                           // @anchor done
}

void sift_down(vector<int>& a, int root, int size) {
    while (true) {                                      // @anchor sift
        int left = 2 * root + 1, right = 2 * root + 2; // @anchor children
        if (left >= size) return;                       // no children: done   // @anchor sift-done
        int big = left;
        if (right < size && a[right] > a[big]) big = right; // @anchor compare
        if (a[big] <= a[root]) return;                  // parent already wins  // @anchor sift-done
        int t = a[root];                                // @anchor swap-down
        a[root] = a[big];
        a[big] = t;
        root = big;
    }
}`;

const NOTES = {
  start: {
    javascript:
      "No heap yet — just values in a row. A binary heap *is* an array: the children of index `i` live at `2i + 1` and `2i + 2`, and that arithmetic is the only thing that makes the tree real. Nothing is allocated here, which is where heapsort's O(1) space comes from.",
    python:
      'No heap yet — just values in a list. A binary heap *is* a list: the children of index `i` live at `2i + 1` and `2i + 2`. Python would equally accept a `heapq` object here, but then the sift-downs would be invisible, and the whole point of the algorithm is watching the root move.',
    java: "No heap yet — just values in a row. The children of index `i` live at `2i + 1` and `2i + 2`, and there is no `Heap` object anywhere: heapsort is the only O(n log n) sort here that needs no extra structure, which is why it is the fallback inside Java's `Arrays.sort` for object arrays.",
    cpp: 'No heap yet — just values in a row. The children of index `i` live at `2i + 1` and `2i + 2`, computed rather than stored. The forward declaration for `sift_down` above is what lets the driver find `heap_sort` first in the file, and it is also why the two functions are free functions rather than members.',
  },
  'build-heap': {
    javascript:
      'Start at the *last* index that has children and work upwards. That direction is what makes the build linear rather than quadratic: every node below has already been fixed, so each sift-down only has to repair a subtree that was already a heap. Summing the heights gives the O(n) — n/2 nodes at depth 1, n/4 at depth 2, and so on.',
    python:
      "Start at the last index that has children and work upwards. `range(n // 2 - 1, -1, -1)` counts *down* to `-1` inclusive, which is Python's idiom for including 0 — getting the bound wrong here is the classic off-by-one that leaves index 0 unsifted, and the result is an array that looks sorted for n - 1 elements and is wrong at one end.",
    java: 'Start at the last index that has children and work upwards. `n / 2 - 1` is the largest `i` with `2i + 1 < n`, so the first sift-down has both children in range. Working upwards is what makes the build linear: n/2 nodes at depth 1, n/4 at depth 2, and the sum of those heights is O(n), not O(n log n).',
    cpp: 'Start at the last index that has children and work upwards. `n / 2 - 1` is the largest `i` with `2i + 1 < n`, and the loop condition `i >= 0` on a signed `int` is what lets it terminate at 0; the same loop with `size_t` would wrap around and run forever.',
  },
  sift: {
    javascript:
      'One iteration of the sift-down, and the whole algorithm is this loop. The value at `root` is too small to sit above its children, so it is pushed down one level at a time until it reaches a leaf or a spot where the children are smaller. `size` is passed explicitly rather than read from `a.length` because the heap is deliberately shrinking while the array is not.',
    python:
      'One iteration of the sift-down, and the whole algorithm is this loop. `size` is passed explicitly rather than taken from `len(a)` because the heap is deliberately shrinking while the list is not — the same array, a smaller valid region. That distinction is what separates heapsort from a priority queue, and it is why the extraction phase works at all.',
    java: 'One iteration of the sift-down, and the whole algorithm is this loop. `size` is passed explicitly rather than taken from `a.length` because the heap is deliberately shrinking while the array is not: the array still holds the sorted tail, but those cells are outside the heap and are never read.',
    cpp: 'One iteration of the sift-down, and the whole algorithm is this loop. `size` is passed explicitly rather than taken from `a.size()` because the heap is deliberately shrinking while the vector is not — the sorted tail lives in the same storage but is outside the heap, and is never read again.',
  },
  children: {
    javascript:
      'The index arithmetic that makes a heap a heap: children of `root` are `2 * root + 1` and `2 * root + 2`. Note that JavaScript has real integer types, so this is exact for any array that fits in memory; the same code in a language with only floating-point numbers would need a cast, which is one small reason heapsort implementations are fussier in JavaScript than they look.',
    python:
      'The index arithmetic that makes a heap a heap: children of `root` are `2 * root + 1` and `2 * root + 2`. Python computes both without a temporary, which reads as one step; the other three languages need either two declarations or a comma-separated one, and none of them can avoid the fact that these are two separate values.',
    java: 'The index arithmetic that makes a heap a heap: children of `root` are `2 * root + 1` and `2 * root + 2`. Two locals, because Java cannot return two values from a declaration — the C++ form below is the only one of the four that reads as a single statement.',
    cpp: 'The index arithmetic that makes a heap a heap: children of `root` are `2 * root + 1` and `2 * root + 2`. C++ is the only language here where two variables can be declared and assigned in one statement, which is why this line reads shorter than its Java counterpart. Watch the types: `2 * root` overflows only for absurd sizes, but `size` being an `int` is a deliberate choice — an `unsigned` size would make `left >= size` safe while breaking the `i >= 0` loop above.',
  },
  compare: {
    javascript:
      'Pick the bigger child, then check it against the parent. Two comparisons decide the level, and the loop repeats once per level — so a sift-down costs O(log n), not O(n). The `right < size` guard is what stops this reading past the live heap; without it you would compare against values that have already been parked in their final positions.',
    python:
      'Pick the bigger child, then check it against the parent. Two comparisons decide the level and the loop repeats once per level, so a sift-down costs O(log n) rather than O(n) — the logarithmic factor in heapsort comes from exactly this. The `right < size` guard is what stops the code reading past the live heap.',
    java: "Pick the bigger child, then check it against the parent. Two comparisons decide a level, and the loop repeats once per level, so a sift-down costs O(log n) — that is where heapsort's logarithmic factor comes from. The `right < size` guard is what stops the read going past the live heap.",
    cpp: "Pick the bigger child, then check it against the parent. Two comparisons decide a level, and the loop repeats once per level, so a sift-down costs O(log n) — that is where heapsort's logarithmic factor comes from. The `right < size` guard is what stops the read going past the live heap.",
  },
  'swap-down': {
    javascript:
      "The only write in a sift-down. The bigger child rises and the parent drops into the child's slot, and the loop restarts from the child's index because the value that just moved down may still be too big for its new children. Three languages need a temporary for this; `std::swap` in C++ is the one place the standard library does it for you.",
    python:
      'The only write in a sift-down. Python swaps the two elements in a single statement, and the loop restarts from the child\'s index because the value that just moved down may still be too big for its new children — that is the whole of "sift down".',
    java: "The only write in a sift-down. Java has no tuple assignment, so `t` is unavoidable, and the loop restarts from the child's index because the value that just moved down may still be too big for its new children.",
    cpp: "The only write in a sift-down. `std::swap` would do it in one call; writing the three steps out is what makes the three memory writes visible. The loop restarts from the child's index because the value that just moved down may still be too big for its new children.",
  },
  'sift-done': {
    javascript:
      'Two different ways to stop, and the trace marks them with the same anchor. Either the node has no children left inside the heap, or the bigger child is not actually bigger than the parent — the heap property already held and there was nothing to fix. The second case is the common one, and it is why sifting an already-ordered array is nearly free.',
    python:
      'Two different ways to stop, and the trace marks them with the same anchor. Either the node has no children left inside the heap, or the bigger child is not actually bigger than the parent — the heap property already held. The second case is the common one, and it is why sifting an already-ordered array costs almost nothing.',
    java: 'Two different ways to stop, both on the same anchor. Either the node has no children left inside the heap, or the bigger child is not actually bigger than the parent. Both `return`s leave the array untouched, which is why a sift-down that finds the heap property already restored performs zero writes.',
    cpp: 'Two different ways to stop, both on the same anchor. Either the node has no children left inside the heap, or the bigger child is not actually bigger than the parent. Both exits leave the array untouched, so a sift-down that finds the property already restored performs zero writes.',
  },
  extract: {
    javascript:
      'Take the root away, because the root of a max-heap is the largest value left. Swapping it to the end of the live heap puts it in its final position permanently — no second pass is needed, which is why heapsort is done when the loop finishes. Then the heap shrinks by one and the value that was swapped in has to be sifted back down.',
    python:
      "Take the root away, because the root of a max-heap is the largest value left. Swapping it to the end of the live heap puts it in its final position permanently — the reason heapsort needs no merge pass or cycle-collection pass. Then the heap shrinks by one and the value swapped in has to be sifted back down. Python's `a[0], a[end] = a[end], a[0]` does the exchange in one statement; the other three need a temporary.",
    java: 'Take the root away, because the root of a max-heap is the largest value left. Swapping it to the end of the live heap puts it in its final position permanently, which is why heapsort needs no merge pass. Then the heap shrinks by one and the value swapped in is sifted back down from the root.',
    cpp: 'Take the root away, because the root of a max-heap is the largest value left. Swapping it to the end of the live heap puts it in its final position permanently — no merge pass, no cycle collection, nothing. Then the heap shrinks by one and the value swapped in is sifted back down.',
  },
  done: {
    javascript:
      'The loop stops when the live heap has one value left, and that value must be the smallest of everything, so the array is sorted. There is no final pass: the same property that makes the root the maximum makes the last element the minimum. And unlike merge sort there was no buffer, and unlike quicksort there was no recursion — the stack depth is one frame.',
    python:
      'The loop stops when the live heap has one value left, and that value must be the smallest of everything. There is no final pass: the property that makes the root the maximum makes the last element the minimum. No buffer was allocated and no recursion happened — the stack depth is one frame for the whole sort.',
    java: 'The loop stops when the live heap has one value left, and that value must be the smallest, so the array is sorted. No buffer, no recursion, no final pass: heapsort is the only sort here that uses neither a scratch array nor the call stack to do its work.',
    cpp: 'The loop stops when the live heap has one value left, and that value must be the smallest, so the vector is sorted. No buffer, no recursion, no final pass — heapsort is the only sort in this family that uses neither a scratch array nor the call stack.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'heapSort',
    python: 'heap_sort',
    java: 'HeapSort.heapSort',
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

const expectations: Expectation[] = PRESETS.map((p) => ({
  presetId: p.id,
  args: [valuesOf(p)],
  result: [...valuesOf(p)].sort((a, b) => a - b),
}));

export const heapSortAlgo: AlgoDef<ArrayFrame> = {
  id: 'heap-sort',
  title: 'Heap Sort',
  category: 'sorting',
  summary:
    'Build a max-heap in the array itself, then repeatedly park the root at the far end and sift the replacement back down.',
  intuition:
    "Reach for it when you need a guaranteed O(n log n) sort with no extra memory and no recursion — embedded systems with kilobytes of RAM, or as introsort's fallback: run quicksort until the recursion gets too deep, then finish with heapsort. It is also the only comparison sort with a *proven* O(n log n) worst case and O(1) space, and it is cache-hostile, which is why a good quicksort still beats it on large real inputs. Not stable, and the constant factor is poor, so it is rarely the first choice when memory is free.",
  complexity: {
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(1)',
    note: 'Building the heap is O(n) because the nodes are sifted bottom-up by decreasing height; the n - 1 extractions are O(n log n) each. Not stable — the sift-down swaps distant elements — and the memory access pattern jumps around the array, so it is measurably slower than quicksort in practice.',
  },
  traits: {
    stable: false,
    inPlace: true,
    online: false,
    allowsDuplicates: true,
    tags: ['divide and conquer', 'heap', 'guaranteed n log n', 'no recursion'],
  },
  viewport: 'array',
  level: 'advanced',
  params: [
    {
      key: 'size',
      label: 'Elements',
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
  run: heapSort,
  lesson,
  expectations,
  formatResult: (r) => `[${(r as number[]).join(', ')}]`,
  anchors: [
    'start',
    'build-heap',
    'sift',
    'children',
    'compare',
    'swap-down',
    'sift-done',
    'extract',
    'done',
  ],
};

export default heapSortAlgo;
