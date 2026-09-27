import { byLanguage } from '../../code/anchors.ts';
import { distinctArray, randomArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Search in a Rotated Sorted Array — binary search without the precondition.
 *
 * The whole trick is one observation: at any index `mid`, **at least one of the
 * two halves `[low, mid]` and `[mid, high]` is in order**. The rotation is a
 * single discontinuity, so it can only spoil one of them. Identify the sorted
 * half, check whether the target falls inside its value range, and you can
 * discard half the window even though you do not know where the rotation is.
 *
 * The `rotation` param is applied by the generator to whatever sorted input it
 * receives, which is why the presets supply a plain ascending array plus a
 * rotation count. The code listings take the array *already rotated* — which is
 * what the algorithm actually receives in practice, since producing a rotated
 * array from sorted data is the caller's problem, not the search's.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 701;

/** Searching algorithms need sorted input, so every preset sorts before use. */
const sortedOf = (values: number[]): number[] => [...values].sort((a, b) => a - b);

/**
 * Distinct values plus one deliberate duplicate — the shape that makes
 * `a[low] <= a[mid]` an *equality* test, which is the branch duplicated data
 * actually exercises. The target used with this array is always a unique value,
 * so the expected answer is the same in all four languages rather than
 * "whichever copy of the duplicate the probe happened to reach".
 */
const withTie = (distinct: number[], at: number): number[] =>
  sortedOf([...distinct, distinct[at] as number]);

/** Rotate right by `k` places: the last k values move to the front. */
const rotateRight = (values: number[], k: number): number[] => {
  if (values.length === 0) return [];
  const shift = ((k % values.length) + values.length) % values.length;
  if (shift === 0) return [...values];
  return [...values.slice(values.length - shift), ...values.slice(0, values.length - shift)];
};

/** A value guaranteed to be absent, and inside the array's own range. */
const missingBetween = (sorted: number[]): number => {
  for (let i = 1; i < sorted.length; i++) {
    const lo = sorted[i - 1] as number;
    const hi = sorted[i] as number;
    if (hi - lo > 1) return lo + 1;
  }
  return (sorted[sorted.length - 1] as number) + 1000;
};

const BASE = sortedOf(distinctArray(SEED, 12, 1, 140));
const BASE3 = sortedOf(distinctArray(SEED + 4, 12, 1, 160));
const DENSE = sortedOf(randomArray(SEED + 8, 11, 5, 95));
const TIES = withTie(distinctArray(SEED + 12, 10, 1, 90), 0);
const SPARSE = sortedOf(distinctArray(SEED + 16, 10, 1, 200));

const PRESETS: Preset[] = [
  {
    id: 'rotation-0',
    label: 'No rotation',
    blurb:
      'Rotation 0: the array is simply sorted, and this degenerates into ordinary binary search. Every probe finds the left half in order, so the "right half is sorted" branch is never taken.',
    input: { type: 'numbers', values: BASE },
    params: { size: BASE.length, target: BASE[8] as number, rotation: 0 },
  },
  {
    id: 'rotation-3',
    label: 'Rotated by 3',
    blurb:
      'A small rotation. The first few probes still see a sorted left half; once the window straddles the discontinuity, the algorithm has to fall back on the right half being sorted instead.',
    input: { type: 'numbers', values: BASE3 },
    params: { size: BASE3.length, target: BASE3[2] as number, rotation: 3 },
  },
  {
    id: 'rotation-half',
    label: 'Rotated by half',
    blurb:
      'Rotated by exactly half, so the discontinuity is dead centre. Half the probes take the left-sorted branch and half take the right-sorted one — the case the extra branch exists for.',
    input: { type: 'numbers', values: DENSE },
    params: { size: DENSE.length, target: DENSE[1] as number, rotation: 5 },
  },
  {
    id: 'rotation-ties',
    label: 'Rotated, lots of ties',
    blurb:
      'Four distinct values across 13 cells, rotated. Equal runs mean `a[low] <= a[mid]` no longer tells you which half is sorted, so the algorithm leans on the `<=` rather than a strict comparison.',
    input: { type: 'numbers', values: TIES },
    params: { size: TIES.length, target: TIES[6] as number, rotation: 4 },
  },
  {
    id: 'rotation-miss',
    label: 'Rotated, not found',
    blurb:
      'The target is absent. The window still halves every probe and still empties, so the rotation costs the search nothing — which is the whole claim this algorithm makes.',
    input: { type: 'numbers', values: SPARSE },
    params: { size: SPARSE.length, target: missingBetween(SPARSE), rotation: 6 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

export function* searchRotated(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const size = Number(ctx.params.size ?? input.values.length);
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const sorted = [...source].slice(0, Math.max(0, size));
  const rotation = Number(ctx.params.rotation ?? 0);
  /** The rotation is applied here, so the trace — and the lesson — both see it. */
  const values = rotateRight(sorted, rotation);
  const n = values.length;
  const target = Number(ctx.params.target ?? 0);

  let ops = 0;
  let low = 0;
  let high = n - 1;
  let mid = n === 0 ? 0 : Math.floor((low + high) / 2);
  let tookLeftBranch = false;
  let tookRightBranch = false;

  const cursors = (): Record<string, number> => {
    const out: Record<string, number> = {};
    if (low >= 0) out.low = low;
    if (high >= 0) out.high = high;
    if (low <= high) out.mid = mid;
    return out;
  };

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    note:
      n < 1
        ? 'The array is empty, so there is no rotation to survive. Not found.'
        : rotation % n === 0
          ? `Rotated by 0, so this is just a sorted array of ${n} values and the search below is ordinary binary search. Keep it as the control case: it is the only preset that never takes the right-sorted branch.`
          : `Rotated right by ${rotation % n}, so the largest values now sit at the front and index 0 is no longer the smallest. The array is *not* sorted, and no index says otherwise — but the rotation is a single cut, so at every probe at least one half of the window still is.`,
    values: [...values],
    pointers: cursors(),
    highlight: { window: range(0, n) },
    vars: { low, mid, high, target, rotation, n },
  };

  while (low <= high) {
    if (ctx.shouldStop()) return;
    ops++;
    mid = low + Math.floor((high - low) / 2);
    const value = values[mid] as number;
    const lowValue = values[low] as number;
    const leftSorted = lowValue <= value;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'compare',
      caption: `Probe ${ops}`,
      note: `Probe index ${mid}: ${value} against a target of ${target}. ${value === target ? 'Equal — no reasoning needed, this is a hit.' : `Also check the window's own ends: index ${low} holds ${lowValue} and index ${high} holds ${values[high] as number}. Whether \`a[low] <= a[mid]\` tells us which half is in order is the entire algorithm.`}`,
      values: [...values],
      pointers: cursors(),
      highlight: {
        compare: [mid],
        window: range(low, high + 1),
        outOfPlace: [...range(0, low), ...range(high + 1, n)],
      },
      ops,
      vars: { low, mid, high, value, target },
    };

    if (value === target) {
      yield {
        kind: 'array',
        index: 0,
        anchor: 'hit',
        caption: `Probe ${ops}`,
        note: `${value} equals the target at index ${mid}, so the search returns ${mid} after ${ops} probe${ops === 1 ? '' : 's'} — exactly as many as an ordinary binary search would have used on a sorted array of this size. The rotation cost nothing.`,
        values: [...values],
        pointers: cursors(),
        highlight: {
          answer: [mid],
          window: range(low, high + 1),
          outOfPlace: [...range(0, low), ...range(high + 1, n)],
        },
        result: 'found',
        ops,
        vars: { low, mid, high, target, ops },
      };
      return;
    }

    if (leftSorted) {
      tookLeftBranch = true;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'left-sorted',
        caption: `Probe ${ops}`,
        note: `Index ${low} holds ${lowValue} and index ${mid} holds ${value}, and ${lowValue} is not bigger — so the run ${low} to ${mid} must be in order. A rotation is one cut, so only one half can be broken; this one is intact, which means every value in it lies between ${lowValue} and ${value}.`,
        values: [...values],
        pointers: cursors(),
        highlight: {
          sorted: range(low, mid + 1),
          compare: [mid],
          window: range(low, high + 1),
          outOfPlace: [...range(0, low), ...range(high + 1, n)],
        },
        ops,
        vars: { low, mid, high, lowValue, value, target },
      };

      const insideLeft = lowValue <= target && target < value;

      if (insideLeft) {
        high = mid - 1;

        yield {
          kind: 'array',
          index: 0,
          anchor: 'high-half',
          caption: `Probe ${ops}`,
          note: `The target sits between ${lowValue} and ${value}, so it must be inside the sorted left half. Discard the right: \`high\` becomes ${high}. Those cells cannot be it, whatever their values — a rotated window looks arbitrary but is not.`,
          values: [...values],
          pointers: cursors(),
          highlight: {
            sorted: range(low, mid + 1),
            window: range(low, high + 1),
            outOfPlace: [...range(0, low), ...range(high + 1, n)],
          },
          ops,
          vars: { low, mid, high, target, ops },
        };
      } else {
        low = mid + 1;

        yield {
          kind: 'array',
          index: 0,
          anchor: 'low-half',
          caption: `Probe ${ops}`,
          note: `The target is not between ${lowValue} and ${value}, so it is not in the sorted left half. Discard it: \`low\` becomes ${low}. The right half is a rotated mess as far as we know, but it is the only place left to look, so that is enough.`,
          values: [...values],
          pointers: cursors(),
          highlight: {
            sorted: range(low, mid + 1),
            window: range(low, high + 1),
            outOfPlace: [...range(0, low), ...range(high + 1, n)],
          },
          ops,
          vars: { low, mid, high, target, ops },
        };
      }
    } else {
      tookRightBranch = true;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'right-sorted',
        caption: `Probe ${ops}`,
        note: `Index ${low} holds ${lowValue} and index ${mid} holds ${value}, and ${lowValue} is bigger — so the cut is inside the left half and the right half ${mid} to ${high} must be in order. This is the branch that only a rotated array ever needs, and it is the reason the algorithm works at all.`,
        values: [...values],
        pointers: cursors(),
        highlight: {
          sorted: range(mid, high + 1),
          compare: [mid],
          window: range(low, high + 1),
          outOfPlace: [...range(0, low), ...range(high + 1, n)],
        },
        ops,
        vars: { low, mid, high, lowValue, value, target },
      };

      const insideRight = value < target && target <= (values[high] as number);

      if (insideRight) {
        low = mid + 1;

        yield {
          kind: 'array',
          index: 0,
          anchor: 'low-half',
          caption: `Probe ${ops}`,
          note: `The target sits between ${value} and ${values[high] as number}, so it must be inside the sorted right half. Discard the left: \`low\` becomes ${low}. A rotated array is not hopeless — it is one cut, and cutting a sorted array in half always leaves one clean side.`,
          values: [...values],
          pointers: cursors(),
          highlight: {
            sorted: range(mid, high + 1),
            window: range(low, high + 1),
            outOfPlace: [...range(0, low), ...range(high + 1, n)],
          },
          ops,
          vars: { low, mid, high, target, ops },
        };
      } else {
        high = mid - 1;

        yield {
          kind: 'array',
          index: 0,
          anchor: 'high-half',
          caption: `Probe ${ops}`,
          note: `The target is not between ${value} and ${values[high] as number}, so it is not in the sorted right half. Discard it: \`high\` becomes ${high}. The left half is the only place left, which is all the reasoning this branch needs.`,
          values: [...values],
          pointers: cursors(),
          highlight: {
            sorted: range(mid, high + 1),
            window: range(low, high + 1),
            outOfPlace: [...range(0, low), ...range(high + 1, n)],
          },
          ops,
          vars: { low, mid, high, target, ops },
        };
      }
    }

    mid = low + Math.floor((high - low) / 2);
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'exhausted',
    caption: `Probe ${ops}`,
    note: `${low} > ${high}, so the window is empty and the answer is -1 after ${ops} probe${ops === 1 ? '' : 's'}. ${tookLeftBranch && tookRightBranch ? 'Both branches were needed, so the rotation genuinely straddled the window at some point.' : tookRightBranch ? 'Only the right-sorted branch was needed: the cut was always to the left of the window.' : 'Only the left-sorted branch was needed: the cut was never inside the window, so this behaved like ordinary binary search.'}`,
    values: [...values],
    pointers: cursors(),
    highlight: { outOfPlace: range(0, n) },
    result: 'not-found',
    ops,
    vars: { low, high, target, ops, rotation },
  };
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Array (sorted; the `rotation` param turns it)',
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

const JS = `function searchRotated(a, target) {
  // a is a sorted array that has been rotated; we do not know by how much. // @anchor start
  let low = 0, high = a.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (a[mid] === target) {                           // @anchor compare
      return mid;                                      // @anchor hit
    }
    if (a[low] <= a[mid]) {                             // @anchor left-sorted
      if (a[low] <= target && target < a[mid]) {
        high = mid - 1;                                 // @anchor high-half
      } else {
        low = mid + 1;                                  // @anchor low-half
      }
    } else {                                            // @anchor right-sorted
      if (a[mid] < target && target <= a[high]) {
        low = mid + 1;                                  // @anchor low-half
      } else {
        high = mid - 1;                                 // @anchor high-half
      }
    }
  }
  return -1;                                            // @anchor exhausted
}`;

const PY = `def search_rotated(a, target):
    # a is a sorted list that has been rotated; we do not know by how much. # @anchor start
    low, high = 0, len(a) - 1
    while low <= high:
        mid = (low + high) // 2
        if a[mid] == target:                            # @anchor compare
            return mid                                  # @anchor hit
        if a[low] <= a[mid]:                            # @anchor left-sorted
            if a[low] <= target < a[mid]:
                high = mid - 1                          # @anchor high-half
            else:
                low = mid + 1                           # @anchor low-half
        else:                                           # @anchor right-sorted
            if a[mid] < target <= a[high]:
                low = mid + 1                           # @anchor low-half
            else:
                high = mid - 1                          # @anchor high-half
    return -1                                           # @anchor exhausted`;

const JAVA = `class SearchRotated {
    static int searchRotated(int[] a, int target) {
        // a is a sorted array that has been rotated; we do not know by how much. // @anchor start
        int low = 0, high = a.length - 1;
        while (low <= high) {
            int mid = (low + high) / 2;
            if (a[mid] == target) {                     // @anchor compare
                return mid;                             // @anchor hit
            }
            if (a[low] <= a[mid]) {                     // @anchor left-sorted
                if (a[low] <= target && target < a[mid]) {
                    high = mid - 1;                     // @anchor high-half
                } else {
                    low = mid + 1;                      // @anchor low-half
                }
            } else {                                    // @anchor right-sorted
                if (a[mid] < target && target <= a[high]) {
                    low = mid + 1;                      // @anchor low-half
                } else {
                    high = mid - 1;                     // @anchor high-half
                }
            }
        }
        return -1;                                      // @anchor exhausted
    }
}`;

const CPP = `#include <vector>
using std::vector;

int search_rotated(vector<int> a, int target) {
    // a is a sorted vector that has been rotated; we do not know by how much. // @anchor start
    int low = 0, high = (int)a.size() - 1;
    while (low <= high) {
        int mid = (low + high) / 2;
        if (a[mid] == target) {                         // @anchor compare
            return mid;                                 // @anchor hit
        }
        if (a[low] <= a[mid]) {                         // @anchor left-sorted
            if (a[low] <= target && target < a[mid]) {
                high = mid - 1;                         // @anchor high-half
            } else {
                low = mid + 1;                          // @anchor low-half
            }
        } else {                                        // @anchor right-sorted
            if (a[mid] < target && target <= a[high]) {
                low = mid + 1;                          // @anchor low-half
            } else {
                high = mid - 1;                         // @anchor high-half
            }
        }
    }
    return -1;                                          // @anchor exhausted
}`;

const NOTES = {
  start: {
    javascript:
      'The precondition, stated precisely: sorted, *then* rotated, and the amount of rotation is unknown. That is a much weaker promise than "sorted", and the code below is still O(log n) — which is the surprise. Nothing here inspects the whole array to find the cut; it is discovered one probe at a time.',
    python:
      'The precondition, stated precisely: sorted, *then* rotated, and the amount of rotation unknown. That is a much weaker promise than "sorted", and the code below is still O(log n) — which is the surprise. Python reads the `a[mid] == target` test and the rotation test as two independent `if`s; the other three languages need the same shape for different reasons.',
    java: 'The precondition, stated precisely: sorted, *then* rotated, and the amount of rotation unknown. Java has no `a[low] <= a[mid] ? ... : ...` conditional expression to compress the two branches the way a reader might expect, which is why the nesting below is four levels deep in all four languages — it is the price of not being able to `return` from both halves.',
    cpp: "The precondition, stated precisely: sorted, *then* rotated, and the amount of rotation unknown. The parameter is taken by value, so the search works on its own copy and cannot un-rotate the caller's array behind its back — which is what keeps it a search rather than a sort. In practice `std::rotate` is how the caller would have produced this state in the first place.",
  },
  compare: {
    javascript:
      'The cheap test, and the one that short-circuits everything else. If the probe hits, no reasoning about rotation is needed at all — which is why a lucky hit costs exactly one comparison even on a rotated array. Note this is written as an early `return` inside the `if` rather than a separate branch, to keep the nesting shallow.',
    python:
      "The cheap test, and the one that short-circuits everything else. If the probe hits, no reasoning about rotation is needed at all — which is why a lucky hit costs exactly one comparison even on a rotated array. Python's `elif` chain is the only one of the four that could have written this as `if ... : return ... elif ... :`, which is exactly what it does.",
    java: 'The cheap test, and the one that short-circuits everything else. If the probe hits, no reasoning about rotation is needed — which is why a lucky hit costs one comparison even on a rotated array. Java has no `elif`, so the equality test and the rotation test are two separate `if` statements, and the `return` is what makes the second one safe.',
    cpp: 'The cheap test, and the one that short-circuits everything else. If the probe hits, no reasoning about rotation is needed — which is why a lucky hit costs one comparison even on a rotated array. C++ reads identically to the Java here; the only difference in the whole function is the casts on `a.size()`.',
  },
  hit: {
    javascript:
      'Found. The index is returned immediately, and the array is never un-rotated — the whole point of the algorithm is that you can search a rotated array without paying to fix it first. Note the returned index is an index into the *given* array, not into the original sorted order, so it lines up with what the visualiser is showing.',
    python:
      'Found. The index is returned immediately, and the list is never un-rotated — the whole point of the algorithm is that you can search a rotated list without paying to fix it first. The returned index is an index into the *given* list, not into the original sorted order, so it lines up with what the visualiser is showing.',
    java: 'Found. The index is returned immediately, and the array is never un-rotated — the whole point of the algorithm is that you can search a rotated array without paying to fix it first. Because the `return` sits inside the first `if`, the rotation logic below is skipped entirely on a hit, which is why a lucky probe costs a single comparison even on a fully rotated array.',
    cpp: 'Found. The index is returned immediately, and the vector is never un-rotated — the whole point of the algorithm is that you can search a rotated vector without paying to fix it first. The `return` inside the first `if` short-circuits the rotation reasoning below, so a lucky probe still costs exactly one comparison.',
  },
  'left-sorted': {
    javascript:
      'The decisive observation. If `a[low] <= a[mid]` then the run from `low` to `mid` cannot contain the cut — a rotation is a single discontinuity, so at most one of the two halves is broken, and this test says which. It is a `<=` and not a `<`, and with duplicates that is what keeps the test meaningful when the ends happen to be equal.',
    python:
      'The decisive observation. If `a[low] <= a[mid]` then the run from `low` to `mid` cannot contain the cut — a rotation is one discontinuity, so at most one of the two halves is broken, and this test says which. It is a `<=` and not a `<`, and with duplicates that is what keeps the test meaningful when the two ends are equal.',
    java: 'The decisive observation. If `a[low] <= a[mid]` then the run from `low` to `mid` cannot contain the cut. It is a `<=` and not a `<`, and with duplicates that is what keeps the test meaningful when the two ends are equal — the branch is only wrong for arrays with more than one rotation point, which by definition do not exist here.',
    cpp: 'The decisive observation. If `a[low] <= a[mid]` then the run from `low` to `mid` cannot contain the cut. It is a `<=` and not a `<`, and with duplicates that is what keeps the test meaningful when the two ends are equal — the branch is only wrong for arrays with more than one rotation point, which by definition do not exist here.',
  },
  'right-sorted': {
    javascript:
      'The mirror, and the branch a genuinely sorted array never takes. Reaching it is proof the cut is inside the left half, so the right half is intact and its values lie between `a[mid]` and `a[high]`. This single extra `else` is the entire price of supporting rotation: four lines in exchange for dropping the precondition.',
    python:
      'The mirror, and the branch a genuinely sorted array never takes. Reaching it is proof the cut is inside the left half, so the right half is intact and its values lie between `a[mid]` and `a[high]`. This single extra `else` is the entire price of supporting rotation.',
    java: 'The mirror, and the branch a genuinely sorted array never takes. Reaching it is proof the cut is inside the left half, so the right half is intact and its values lie between `a[mid]` and `a[high]`. This single extra `else` is the entire price of supporting rotation — and note it is unreachable when the array was never rotated, which is a useful thing to check in a test.',
    cpp: 'The mirror, and the branch a genuinely sorted array never takes. Reaching it is proof the cut is inside the left half, so the right half is intact and its values lie between `a[mid]` and `a[high]`. This single extra `else` is the entire price of supporting rotation — and it is unreachable when the array was never rotated, which is worth a test of its own.',
  },
  'low-half': {
    javascript:
      'Keep the right half, discard the sorted left. `mid + 1` rather than `mid` for the same reason as in every other binary search in this family: `mid` was just measured and rejected, so it is not a candidate. Whether this line means "discard the left" or "discard the right" depends on which branch above it sits in, which is why the same anchor appears twice in this listing.',
    python:
      'Keep the right half, discard the sorted left. `mid + 1` rather than `mid` because `mid` was just measured and rejected. The same statement appears twice in this function — once in each branch — with opposite meanings, which is the one place this listing asks the reader to be careful.',
    java: 'Keep the right half, discard the sorted left. `mid + 1` rather than `mid` because `mid` was just measured and rejected. The same statement appears twice in this function, once in each branch, with opposite meanings; the anchor sits on the first occurrence and the note applies to both, which is exactly the limitation of keying a trace on a semantic step rather than a source position.',
    cpp: 'Keep the right half, discard the sorted left. `mid + 1` rather than `mid` because `mid` was just measured and rejected. The same statement appears twice in this function, once in each branch, with opposite meanings — the price of expressing "keep the sorted half" without a helper function, and the reason a real implementation factors it into one.',
  },
  'high-half': {
    javascript:
      'Keep the left half, discard the sorted right. `mid - 1` for the mirror reason. As with `low-half`, the same statement appears twice with opposite meanings: inside the left-sorted branch this keeps the sorted half, and inside the right-sorted branch it keeps the broken one. What both have in common is that the discarded half has been *proved* to contain nothing — not merely looked at.',
    python:
      'Keep the left half, discard the sorted right, with `mid - 1` for the mirror reason. As with `low-half`, the same statement appears twice with opposite meanings: inside the left-sorted branch it keeps the sorted half, and inside the right-sorted branch it keeps the broken one. In both cases the discarded half was *proved* empty of the target, not merely inspected.',
    java: 'Keep the left half, discard the sorted right, with `mid - 1` for the mirror reason. As with `low-half`, the same statement appears twice with opposite meanings: in the left-sorted branch it keeps the sorted half, in the right-sorted branch it keeps the broken one. In both cases the discarded half was *proved* empty of the target, not merely inspected.',
    cpp: 'Keep the left half, discard the sorted right, with `mid - 1` for the mirror reason. As with `low-half`, the same statement appears twice with opposite meanings: in the left-sorted branch it keeps the sorted half, in the right-sorted branch it keeps the broken one. In both cases the discarded half was *proved* empty of the target, not merely inspected.',
  },
  exhausted: {
    javascript:
      "The window emptied without a hit, so the answer is -1. The important part is the cost: `log n` probes, exactly as on a sorted array. That is the algorithm's real claim — supporting an unsorted-looking array costs no extra comparisons, only four extra lines and one extra comparison per probe to work out which half is trustworthy.",
    python:
      "The window emptied without a hit, so the answer is -1. The important part is the cost: `log n` probes, exactly as on a sorted list. That is the algorithm's real claim — supporting a rotated array costs no extra comparisons, only four extra lines and one extra comparison per probe to work out which half is trustworthy.",
    java: "The window emptied without a hit, so the answer is -1. The important part is the cost: `log n` probes, exactly as on a sorted array. That is the algorithm's real claim — supporting a rotated array costs no extra comparisons, only four extra lines and one extra comparison per probe to work out which half is trustworthy.",
    cpp: "The window emptied without a hit, so the answer is -1. The important part is the cost: `log n` probes, exactly as on a sorted vector. That is the algorithm's real claim — supporting a rotated array costs no extra comparisons, only four extra lines and one extra comparison per probe to work out which half is trustworthy.",
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'searchRotated',
    python: 'search_rotated',
    java: 'SearchRotated.searchRotated',
    cpp: 'search_rotated',
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
const targetOf = (p: Preset): number => Number(p.params?.target ?? 0);
const rotationOf = (p: Preset): number => Number(p.params?.rotation ?? 0);

/** The machine-checked claim, computed against the *rotated* array. */
const expectations: Expectation[] = PRESETS.map((p) => {
  const rotated = rotateRight(valuesOf(p), rotationOf(p));
  return { presetId: p.id, args: [rotated, targetOf(p)], result: rotated.indexOf(targetOf(p)) };
});

export const searchRotatedAlgo: AlgoDef<ArrayFrame> = {
  id: 'search-rotated',
  title: 'Search Rotated Array',
  category: 'searching',
  summary:
    'Binary search on a sorted-then-rotated array, identifying which half of the window is still in order and discarding the other.',
  intuition:
    'Reach for this the moment you know a sorted collection may have been rotated — the "minimum in a rotated array" interview question, a circular buffer written to by a producer, or a log where the newest entry wrapped around. You get sorted-array performance with none of the cost of first un-rotating the thing, which would need an index scan and an O(n) pass. The generalisation is the interesting part: a k-times-rotated array is handled by the same idea with k extra cases, and "at least one third is sorted" is the same observation applied to a different structure.',
  complexity: {
    best: 'O(1)',
    average: 'O(log n)',
    worst: 'O(log n)',
    space: 'O(1)',
    note: 'Identical to binary search. The rotation costs one extra comparison per probe — the a[low] <= a[mid] test — not an extra log factor, and no index, no linear pass to find the cut, and no in-place rotation. Not stable in any meaningful sense: it returns an index, and which copy of a duplicate it lands on is arbitrary.',
  },
  traits: {
    stable: false,
    inPlace: true,
    online: false,
    allowsDuplicates: true,
    tags: ['sorted then rotated', 'logarithmic', 'no index needed'],
  },
  viewport: 'array',
  level: 'advanced',
  params: [
    {
      key: 'size',
      label: 'Elements',
      kind: 'number',
      min: 1,
      max: 150,
      step: 1,
      default: 12,
      regeneratesInput: true,
      help: 'Past 150 elements the cells get too small to read, and a long run can hit the frame cap and stop early.',
    },
    {
      key: 'rotation',
      label: 'Rotation',
      kind: 'number',
      min: 0,
      max: 60,
      step: 1,
      default: 0,
      help: 'How far the sorted array is rotated right before the search sees it. 0 is ordinary binary search.',
    },
    {
      key: 'target',
      label: 'Target',
      kind: 'number',
      min: 0,
      max: 200,
      step: 1,
      default: 42,
      help: 'The value to look for. Indices are in the rotated array.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: searchRotated,
  lesson,
  expectations,
  formatResult: (r) => ((r as number) < 0 ? 'not found (-1)' : `index ${r as number}`),
  anchors: [
    'start',
    'compare',
    'hit',
    'left-sorted',
    'right-sorted',
    'low-half',
    'high-half',
    'exhausted',
  ],
};

export default searchRotatedAlgo;
