import { byLanguage } from '../../code/anchors.ts';
import {
  fewDistinctArray,
  hillyArray,
  randomArray,
  reversedArray,
} from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Shell Sort — insertion sort with a head start.
 *
 * The trick: run insertion sort over *gapped* subsequences rather than adjacent
 * pairs. At gap 4 you are sorting four interleaved sub-arrays at once, which
 * moves big values a long way in very few writes; by the time the gap reaches 1
 * the array is "almost sorted", and insertion sort at gap 1 finishes it in close
 * to linear time. The gap sequence is the whole design, which is why the trace
 * spends a pass per gap and the caption always names it.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 71;

/**
 * One array per preset, hoisted so a preset's `size` and its `values` can
 * never disagree — the generator honours `params.size`, so a preset that
 * stored more values than it asked for would be silently truncated and the
 * animation would stop matching the code the verification harness runs.
 */
const RANDOM = randomArray(SEED, 10, 10, 98);
const HILLY = hillyArray(SEED + 4, 10);
const REVERSE = reversedArray(SEED + 6, 10, 1, 99);
const DUPLICATES = fewDistinctArray(SEED + 10, 11, 3, 1);

const PRESETS: Preset[] = [
  {
    id: 'random',
    label: 'Random',
    blurb:
      'The everyday case. Big gaps do the heavy lifting; the gap-1 pass is left with a nearly sorted array.',
    input: { type: 'numbers', values: RANDOM },
    params: { size: RANDOM.length },
  },
  {
    id: 'hilly',
    label: 'Hilly',
    blurb:
      'Two interleaved ascending runs with a few spikes. Exactly the shape Shell sort is designed for, and the reason it beats plain insertion sort here.',
    input: { type: 'numbers', values: HILLY },
    params: { size: HILLY.length },
  },
  {
    id: 'reverse',
    label: 'Reversed',
    blurb:
      'The worst case. Every value must travel to the other end, and the early gaps still need a lot of shifting before the array settles.',
    input: { type: 'numbers', values: REVERSE },
    params: { size: REVERSE.length },
  },
  {
    id: 'duplicates',
    label: 'Lots of ties',
    blurb:
      'Only three distinct values, so the strict `>` is tested over and over. Equal values never slide past each other, so the sort stays stable at every gap.',
    input: { type: 'numbers', values: DUPLICATES },
    params: { size: DUPLICATES.length },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

/** The classic halving gap sequence: n/2, n/4, … 1. */
const gapsFor = (n: number): number[] => {
  const out: number[] = [];
  for (let g = Math.floor(n / 2); g >= 1; g = Math.floor(g / 2)) out.push(g);
  return out;
};

export function* shellSort(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const size = Number(ctx.params.size ?? input.values.length);
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const values = [...source].slice(0, Math.max(0, size));
  const n = values.length;

  let ops = 0;
  let shifts = 0;
  const gaps = gapsFor(n);

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    note:
      n < 2
        ? 'Fewer than two elements, so there is nothing to space out. Done.'
        : `Nothing is sorted yet. The gaps ${gaps.join(', ')} will be used in turn, each one an insertion sort over values ${gaps.length > 1 ? 'that far' : 'one'} apart.`,
    values: [...values],
    highlight: { unvisited: range(0, n) },
    vars: { n, gap: gaps[0] ?? 0 },
  };

  let round = 0;
  for (const gap of gaps) {
    round++;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'gap',
      caption: `Gap ${gap} — pass ${round} of ${gaps.length}`,
      note: `Gap ${gap}: sort every subsequence of values ${gap} place${gap === 1 ? '' : 's'} apart. The array is now a weave of ${gap} nearly-sorted run${gap === 1 ? '' : 's'}, which is exactly what makes the final gap-1 pass cheap.`,
      values: [...values],
      highlight: {
        unvisited: range(0, n),
        compare: [0, gap].filter((k) => k < n),
      },
      ops,
      vars: { gap, round, n },
    };

    let moved = 0;
    for (let i = gap; i < n; i++) {
      const key = values[i] as number;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'pick',
        caption: `Gap ${gap} — pass ${round} of ${gaps.length}`,
        note: `Take ${key} from index ${i} and insert it into the run of values ${gap} apart that ends at index ${i - gap}. Values in between are ignored for now — a later gap handles them.`,
        values: [...values],
        pointers: { i },
        highlight: { temp: [i], unvisited: range(0, n) },
        ops,
        vars: { gap, i, key },
      };

      let j = i - gap;
      while (j >= 0) {
        if (ctx.shouldStop()) return;
        ops++;
        const left = values[j] as number;
        const slide = left > key;

        yield {
          kind: 'array',
          index: 0,
          anchor: 'compare',
          caption: `Gap ${gap} — pass ${round} of ${gaps.length}`,
          note: slide
            ? `${left} sits ${gap} place${gap === 1 ? '' : 's'} before ${key} and is bigger, so the pair is out of order for this gap and ${left} has to move one gap-step right.`
            : `${left} is not bigger than ${key}, so this subsequence is in order at index ${j} and the walk stops.`,
          values: [...values],
          pointers: { i, ...(j >= 0 ? { j } : {}) },
          highlight: { compare: [j], temp: [i], unvisited: range(0, n) },
          ops,
          vars: { gap, i, j, key, left },
        };

        if (!slide) break;

        const from = j + gap;
        values[from] = left;
        shifts++;
        moved++;
        j -= gap;

        yield {
          kind: 'array',
          index: 0,
          anchor: 'shift',
          caption: `Gap ${gap} — pass ${round} of ${gaps.length}`,
          note: `Move ${left} right by one gap, from index ${from - gap} to ${from}. The value is leapfrogging ${gap - 1} other values it will never be compared with at this gap — that is where the speed comes from.`,
          values: [...values],
          pointers: { i, ...(j >= 0 ? { j } : {}) },
          highlight: { swapping: [from - gap, from], temp: [i], unvisited: range(0, n) },
          ops,
          vars: { gap, i, j, key, left, shifts },
        };
      }

      const landing = j + gap;
      values[landing] = key;
      moved++;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'insert',
        caption: `Gap ${gap} — pass ${round} of ${gaps.length}`,
        note: `Land ${key} at index ${landing}. Every value at indices ${landing}, ${landing - gap} and so on down to the run start is now in order for gap ${gap}.`,
        values: [...values],
        pointers: { i, landing },
        highlight: { found: [landing], unvisited: range(0, n) },
        ops,
        vars: { gap, i, j, key, shifts },
      };
    }

    yield {
      kind: 'array',
      index: 0,
      anchor: 'gap-done',
      caption: `Gap ${gap} — pass ${round} of ${gaps.length}`,
      note:
        moved === 0
          ? `Gap ${gap} is already satisfied — every subsequence was in order, so nothing moved. Halving the gap gives it more to do.`
          : `Gap ${gap} finished with ${moved} write${moved === 1 ? '' : 's'}. ${gap === 1 ? 'That was a plain insertion sort, and the array is now fully sorted.' : `Halve the gap to ${Math.floor(gap / 2)} and repeat; the array is now ${gaps.length - round} gap${gaps.length - round === 1 ? '' : 's'} away from sorted.`}`,
      values: [...values],
      highlight: gap === 1 ? { sorted: range(0, n) } : { unvisited: range(0, n) },
      ...(gap === 1 ? { sorted: [0, n] as [number, number] } : {}),
      ops,
      vars: { gap, round, moved, shifts },
    };
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'done',
    note: `Sorted after ${ops} comparison${ops === 1 ? '' : 's'} and ${shifts} shift${shifts === 1 ? '' : 's'} across ${gaps.length} gap pass${gaps.length === 1 ? '' : 'es'}. Shell sort is simply insertion sort run repeatedly with a shrinking stride.`,
    values: [...values],
    highlight: { sorted: range(0, n) },
    sorted: [0, n],
    result: 'sorted',
    ops,
    vars: { ops, shifts },
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

const JS = `function shellSort(a) {
  const n = a.length;
  // The gap sequence: n/2, n/4, ... 1. Each gap is an insertion sort. // @anchor start
  for (let gap = Math.floor(n / 2); gap > 0; gap = Math.floor(gap / 2)) { // @anchor gap
    for (let i = gap; i < n; i++) {                        // @anchor pick
      const key = a[i];
      let j = i - gap;
      while (j >= 0 && a[j] > key) {                      // @anchor compare
        a[j + gap] = a[j];                                 // @anchor shift
        j -= gap;
      }
      a[j + gap] = key;                                    // @anchor insert
    }
    // a[0], a[gap], a[2*gap], ... is now in order.          // @anchor gap-done
  }
  return a;                                                // @anchor done
}`;

const PY = `def shell_sort(a):
    n = len(a)
    # The gap sequence: n/2, n/4, ... 1. Each gap is an insertion sort. # @anchor start
    for gap in range(n // 2, 0, -1):                       # @anchor gap
        for i in range(gap, n):                            # @anchor pick
            key = a[i]
            j = i - gap
            while j >= 0 and a[j] > key:                   # @anchor compare
                a[j + gap] = a[j]                          # @anchor shift
                j -= gap
            a[j + gap] = key                               # @anchor insert
        # a[0], a[gap], a[2*gap], ... is now in order.     # @anchor gap-done
    return a                                               # @anchor done`;

const JAVA = `class ShellSort {
    static int[] shellSort(int[] a) {
        int n = a.length;
        // The gap sequence: n/2, n/4, ... 1. Each gap is an insertion sort. // @anchor start
        for (int gap = n / 2; gap > 0; gap = gap / 2) {    // @anchor gap
            for (int i = gap; i < n; i++) {                // @anchor pick
                int key = a[i];
                int j = i - gap;
                while (j >= 0 && a[j] > key) {             // @anchor compare
                    a[j + gap] = a[j];                     // @anchor shift
                    j -= gap;
                }
                a[j + gap] = key;                          // @anchor insert
            }
            // a[0], a[gap], a[2*gap], ... is now in order. // @anchor gap-done
        }
        return a;                                          // @anchor done
    }
}`;

const CPP = `#include <vector>
using std::vector;

vector<int> shell_sort(vector<int> a) {
    int n = (int)a.size();
    // The gap sequence: n/2, n/4, ... 1. Each gap is an insertion sort. // @anchor start
    for (int gap = n / 2; gap > 0; gap /= 2) {            // @anchor gap
        for (int i = gap; i < n; i++) {                    // @anchor pick
            int key = a[i];
            int j = i - gap;
            while (j >= 0 && a[j] > key) {                 // @anchor compare
                a[j + gap] = a[j];                         // @anchor shift
                j -= gap;
            }
            a[j + gap] = key;                              // @anchor insert
        }
        // a[0], a[gap], a[2*gap], ... is now in order.    // @anchor gap-done
    }
    return a;                                              // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      "The gap sequence is the entire algorithm; everything after this line is plain insertion sort. Starting at `n / 2` and halving is Shell's original sequence and is a reasonable default, but it is not optimal — Knuth's `3x + 1` sequence needs roughly `n^(1/3)` gaps instead of `log n`, which is measurably faster on large inputs. Swapping the sequence in JavaScript is a one-line change.",
    python:
      "The gap sequence is the entire algorithm; everything after this line is plain insertion sort. The halving sequence is Shell's original, not the fastest one available — but Python's `range(n // 2, 0, -1)` counts down and stops before it reaches 0, so a gap of 1 is the last pass and the loop terminates naturally with no `break` anywhere in the function.",
    java: "The gap sequence is the entire algorithm; everything after this line is plain insertion sort. Java's `n / 2` is integer division, so a one-element array yields `gap = 0` and the outer loop never runs — degenerate input is handled by the arithmetic, not by a guard clause.",
    cpp: 'The gap sequence is the entire algorithm; everything after this line is plain insertion sort. `n / 2` on a signed integer truncates toward zero, so an empty or single-element vector gives `gap = 0` and the loop is skipped automatically. Note the cast on `n`: `size()` returns an unsigned type, and mixing it with the signed loop counter would invite a warning on every comparison.',
  },
  gap: {
    javascript:
      'One gap, one interleaved sort. At gap 4 the array is really four sorted subsequences weaving through each other, and the inner loop sorts all four at once. This is the payoff: a value that belongs 20 places to the left can get there in 5 writes instead of 20, so the expensive "long haul" movement happens while the stride is large.',
    python:
      'One gap, one interleaved sort. At gap 4 the list is really four sorted subsequences weaving through each other, and the inner loop sorts all four at once. A value that belongs 20 places to the left can get there in 5 writes instead of 20 — the long-haul movement happens at large stride, and the final gap-1 pass only has to tidy up.',
    java: 'One gap, one interleaved sort. At gap 4 the array is four subsequences woven together, and the loop below sorts all four simultaneously. This is what makes Shell sort better than insertion sort: the long-distance movement is done in few, long jumps.',
    cpp: 'One gap, one interleaved sort. At gap 4 the vector is four subsequences woven together, and the loop below sorts all four simultaneously. This is the whole trick behind Shell sort: a value twenty places out of place is moved in five writes, not twenty.',
  },
  pick: {
    javascript:
      'Take the value at `i` and hold it, then walk back along *its own* subsequence. Everything not exactly `gap` places away is ignored at this pass — including values that are in the way. That is why Shell sort needs several passes: each gap only partially sorts, and the gaps cooperate.',
    python:
      'Take the value at `i` and hold it, then walk back along *its own* subsequence. Values not exactly `gap` places away are ignored at this pass, even when they sit in the way — which is precisely why several passes are needed. The gaps cooperate: each one leaves the array less unsorted than it found it.',
    java: 'Take the value at `i` and hold it, then walk back along its own subsequence. Values not exactly `gap` places away are ignored at this pass even when they sit in the way, which is why the gaps have to cooperate over several rounds.',
    cpp: 'Take the value at `i` and hold it, then walk back along its own subsequence. Values not exactly `gap` places away are ignored at this pass even when they sit in the way. The copy into `key` is by value, so `a[i]` is free to be overwritten as the subsequence shifts.',
  },
  compare: {
    javascript:
      "Identical to insertion sort's test except that `j` steps by `gap` instead of 1. The comparison is against the element one stride back, not the adjacent one. The strict `>` is what keeps the sort stable at every gap, so ties never overtake each other however often the array is re-ordered.",
    python:
      "Identical to insertion sort's test except that `j` steps by `gap` instead of 1. The strict `>` is what keeps the sort stable at *every* gap: since equal values never slide past each other in any pass, they keep their original relative order all the way down to gap 1.",
    java: "Identical to insertion sort's test except that `j` steps by `gap` instead of 1. The strict `>` is what keeps the sort stable at every gap, so a tie never overtakes another tie however many times the array is re-ordered.",
    cpp: "Identical to insertion sort's test except that `j` steps by `gap` instead of 1. The `&&` short-circuits, so `a[j]` is never read when `j` has gone negative — the same guard bubble sort relies on, and the reason these `j >= 0 &&` tests must stay in that order.",
  },
  shift: {
    javascript:
      'A write `gap` places to the right, not one. The value leapfrogs over `gap - 1` elements it will not be compared with at this pass, and those crossings are exactly where the speed comes from — but they are also why the array is only *partially* sorted when the gap gets small.',
    python:
      'A write `gap` places to the right, not one. The value leapfrogs over `gap - 1` elements it will not be compared with at this pass; those long jumps are the speed, and the partially-sorted result at the end of a pass is the price.',
    java: 'A write `gap` places to the right, not one. The value leapfrogs over `gap - 1` elements it will not meet at this pass. Those crossings are the source of the speed-up and also the reason the array is only partially sorted when the gap is still large.',
    cpp: 'A write `gap` places to the right, not one. The value leapfrogs over `gap - 1` elements it will not meet at this pass — the source of the speed-up, and the reason the array is only partially sorted while the gap is large.',
  },
  insert: {
    javascript:
      'Land the held value, and this subsequence is one element longer and in order. The target index is `j + gap`, exactly as in insertion sort with a stride — and when the walk stopped immediately, `j + gap` is simply `i`, so the value goes back where it came from.',
    python:
      'Land the held value, and this subsequence is one element longer and in order. The target index is `j + gap`, exactly as in insertion sort with a stride; when the walk stopped immediately `j + gap` is `i`, so the value returns to where it started.',
    java: 'Land the held value, and this subsequence is one element longer and in order. The target index is `j + gap`; when the walk stopped immediately that is `i` itself, so the value returns to where it started.',
    cpp: 'Land the held value, and this subsequence is one element longer and in order. The target index is `j + gap`; when the walk stopped immediately that is `i` itself, so the value returns to where it started.',
  },
  'gap-done': {
    javascript:
      'One gap complete. Now the array is a weave of `gap` sorted runs instead of one long unsorted stretch, which is why shrinking the gap is progress rather than busywork: the next pass has a shorter distance to cover. By the time gap reaches 1 the array is nearly sorted, and plain insertion sort at gap 1 is close to linear.',
    python:
      'One gap complete. The array is now a weave of `gap` sorted runs instead of one long unsorted stretch, which is why halving the gap is progress rather than busywork: the next pass has a shorter distance to cover, and by gap 1 the array is nearly sorted.',
    java: 'One gap complete. The array is now a weave of `gap` sorted runs rather than one long unsorted stretch — which is why halving the gap is progress. Shell sort is *not* O(n²) despite the quadratic shape of the code: the large-gap passes remove most of the inversions before the quadratic gap-1 pass ever starts.',
    cpp: 'One gap complete. The array is now a weave of `gap` sorted runs rather than one long unsorted stretch, so halving the gap is progress rather than busywork. The code looks quadratic and the algorithm is not: the big-gap passes destroy most of the inversions before the gap-1 pass begins.',
  },
  done: {
    javascript:
      'The loop stops when `gap` has been halved past 1 to 0, and a gap of 0 is the one thing an insertion sort cannot do — every `j` would be `-0` and no comparison would ever fire. That guard is the entire termination argument, and it is why the last pass is always the gap-1 pass that actually finishes the sort.',
    python:
      'The loop stops when `gap` has been halved past 1 to 0. A gap of 0 would be the one thing an insertion sort cannot do — every `j` would be `i` and the walk would never move — so the descending `range` simply never yields 0, and the last pass is always the gap-1 pass that finishes the sort.',
    java: 'The loop stops when `gap` has been halved past 1 to 0. A gap of 0 would be the one thing an insertion sort cannot do — every `j` would equal `i` and nothing would ever move — so the `gap > 0` condition is the entire termination argument.',
    cpp: 'The loop stops when `gap` has been halved past 1 to 0. A gap of 0 would be the one thing an insertion sort cannot do — every `j` would equal `i` and nothing would move — so the `gap > 0` condition is the entire termination argument, and `gap /= 2` on a signed int reaches it without any special case.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'shellSort',
    python: 'shell_sort',
    java: 'ShellSort.shellSort',
    cpp: 'shell_sort',
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

export const shellSortAlgo: AlgoDef<ArrayFrame> = {
  id: 'shell-sort',
  title: 'Shell Sort',
  category: 'sorting',
  summary:
    'Insertion sort run repeatedly with a shrinking gap, so big values can move a long way in very few writes.',
  intuition:
    "Reach for it when you want something simpler than merge sort but measurably better than quadratic on medium inputs — it is a handful of extra characters over insertion sort and no extra memory at all, which is why it turns up in embedded bootloaders and in library sort fallbacks. The gap sequence is the tuning knob: halving is the simple default, Knuth's `3x + 1` is faster on big inputs, and Sedgewick's is faster still. It is never the fastest option — heapsort beats it on worst case — but it is the best code-to-performance ratio in the family.",
  complexity: {
    best: 'O(n log n)',
    average: 'O(n^1.3)',
    worst: 'O(n^1.5)',
    space: 'O(1)',
    note: 'The bound is genuinely gap-sequence dependent: O(n^1.5) is the bound for the halving sequence shown and for Knuth 3x+1. The O(n²) figure in most textbooks is the bound for an arbitrary gap sequence. Stable, because every pass uses a strict `>`.',
  },
  traits: {
    stable: true,
    inPlace: true,
    online: false,
    allowsDuplicates: true,
    tags: ['quadratic', 'gap sequence', 'exchange sort', 'adaptive'],
  },
  viewport: 'array',
  level: 'intermediate',
  params: [
    {
      key: 'size',
      label: 'Elements',
      kind: 'number',
      min: 2,
      max: 150,
      step: 1,
      default: 10,
      regeneratesInput: true,
      help: 'Beyond 150 the viewport switches to canvas.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: shellSort,
  lesson,
  expectations,
  formatResult: (r) => `[${(r as number[]).join(', ')}]`,
  anchors: ['start', 'gap', 'pick', 'compare', 'shift', 'insert', 'gap-done', 'done'],
};

export default shellSortAlgo;
