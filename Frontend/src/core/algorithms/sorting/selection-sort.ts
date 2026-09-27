import { byLanguage } from '../../code/anchors.ts';
import {
  fewDistinctArray,
  nearlySortedArray,
  randomArray,
  reversedArray,
} from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Selection Sort — find the smallest remaining value, put it where it belongs.
 *
 * The interesting part is not the scan, it is the *ratio*: n²/2 comparisons but
 * at most n - 1 writes. Every other in-place comparison sort trades writes for
 * comparisons; this one throws writes away to buy the tightest possible memory
 * traffic, which is why it keeps turning up on flash, EEPROM and write-heavy
 * logs. The animation below makes that trade visible: the array does not change
 * at all until the single swap at the end of each pass.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 31;

/**
 * One array per preset, hoisted so a preset's `size` and its `values` can
 * never disagree — the generator honours `params.size`, so a preset that
 * stored more values than it asked for would be silently truncated and the
 * animation would stop matching the code the verification harness runs.
 */
const RANDOM = randomArray(SEED, 9, 10, 98);
const NEARLY_SORTED = nearlySortedArray(SEED + 4, 9, 1, 99);
const REVERSE = reversedArray(SEED + 6, 9, 1, 99);
const DUPLICATES = fewDistinctArray(SEED + 10, 10, 3, 1);

const PRESETS: Preset[] = [
  {
    id: 'random',
    label: 'Random',
    blurb: 'The everyday case. The running minimum changes often, so most passes end in a swap.',
    input: { type: 'numbers', values: RANDOM },
    params: { size: RANDOM.length },
  },
  {
    id: 'nearly-sorted',
    label: 'Nearly sorted',
    blurb:
      'Already in order apart from a few nudged pairs. Watch the pass minimum stay put: the comparisons are still quadratic, but the number of writes almost vanishes.',
    input: { type: 'numbers', values: NEARLY_SORTED },
    params: { size: NEARLY_SORTED.length },
  },
  {
    id: 'reverse',
    label: 'Reversed',
    blurb:
      'The worst case for the scan. Every pass has to walk to the far end before it finds the minimum, and every pass ends in a swap.',
    input: { type: 'numbers', values: REVERSE },
    params: { size: REVERSE.length },
  },
  {
    id: 'duplicates',
    label: 'Lots of ties',
    blurb:
      'Only three distinct values, so the strict `<` gets tested constantly. It never moves an equal value past another — that is what makes selection sort stable.',
    input: { type: 'numbers', values: DUPLICATES },
    params: { size: DUPLICATES.length },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

export function* selectionSort(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const size = Number(ctx.params.size ?? input.values.length);
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const values = [...source].slice(0, Math.max(0, size));
  const n = values.length;

  let ops = 0;
  let swaps = 0;

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    note:
      n < 2
        ? 'Fewer than two elements, so there is nothing to pick a minimum from. Done.'
        : `Nothing is settled yet, so the sorted region is empty. Pass 1 will scan all ${n} values to find the smallest.`,
    values: [...values],
    highlight: { unvisited: range(0, n) },
    vars: { n },
  };

  for (let i = 0; i < n - 1; i++) {
    let best = i;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'pass',
      caption: `Pass ${i + 1} of ${n - 1}`,
      note: `Pass ${i + 1} fixes index ${i}. Scan indices ${i + 1} to ${n - 1} remembering the smallest, then put it at ${i} — the one position that will never be touched again.`,
      values: [...values],
      pointers: { i, best },
      highlight: { sorted: range(0, i), unvisited: range(i, n) },
      sorted: [0, i],
      ops,
      vars: { i, best, n },
    };

    for (let j = i + 1; j < n; j++) {
      if (ctx.shouldStop()) return;
      ops++;
      const candidate = values[j] as number;
      const smallest = values[best] as number;
      const improved = candidate < smallest;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'compare',
        caption: `Pass ${i + 1} of ${n - 1}`,
        note: `Compare ${candidate} with the smallest seen so far, ${smallest}. ${improved ? `${candidate} wins, so it becomes the candidate.` : 'No change — the candidate stays where it is.'} Nothing is written.`,
        values: [...values],
        pointers: { i, j, best },
        highlight: { compare: [j, best], sorted: range(0, i), unvisited: range(i, n) },
        sorted: [0, i],
        ops,
        vars: { i, j, best, candidate, smallest },
      };

      if (improved) {
        const previous = best;
        best = j;

        yield {
          kind: 'array',
          index: 0,
          anchor: 'new-min',
          caption: `Pass ${i + 1} of ${n - 1}`,
          note: `${candidate} becomes the new smallest seen so far, so the candidate moves from index ${previous} to ${j}. Not one value changed position — only the index being watched did.`,
          values: [...values],
          pointers: { i, best },
          highlight: { current: [best], sorted: range(0, i), unvisited: range(i, n) },
          sorted: [0, i],
          ops,
          vars: { i, j, best, candidate },
        };
      }
    }

    if (best !== i) {
      const picked = values[best] as number;
      const displaced = values[i] as number;
      values[i] = picked;
      values[best] = displaced;
      swaps++;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'swap-in',
        caption: `Pass ${i + 1} of ${n - 1}`,
        note: `Swap. ${picked} is the smallest of the whole region, so it moves to index ${i} and stays there for good; ${displaced} is pushed into index ${best}, still inside the region still to be sorted.`,
        values: [...values],
        pointers: { i, best },
        highlight: { swapping: [i, best], sorted: range(0, i) },
        sorted: [0, i + 1],
        ops,
        vars: { i, best, picked, displaced, swaps },
      };
    } else {
      yield {
        kind: 'array',
        index: 0,
        anchor: 'no-swap',
        caption: `Pass ${i + 1} of ${n - 1}`,
        note: `${values[i]} was already the smallest of the region, so this pass performed no write at all. The sorted region grows by one anyway.`,
        values: [...values],
        pointers: { i, best },
        highlight: { found: [i], sorted: range(0, i) },
        sorted: [0, i + 1],
        ops,
        vars: { i, best, swaps },
      };
    }
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'done',
    note:
      swaps === 0
        ? `Every value was already the smallest of its region when the pass reached it, so the array is sorted and not one write was needed.`
        : `Every value is in its final position after ${ops} comparison${ops === 1 ? '' : 's'} and only ${swaps} write${swaps === 1 ? '' : 's'}.`,
    values: [...values],
    highlight: { sorted: range(0, n) },
    sorted: [0, n],
    result: 'sorted',
    ops,
    vars: { ops, swaps },
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

const JS = `function selectionSort(a) {
  const n = a.length;
  // Nothing is settled yet: the sorted region is empty.    // @anchor start
  for (let i = 0; i < n - 1; i++) {                     // @anchor pass
    let best = i;                                       // index of the smallest seen so far
    for (let j = i + 1; j < n; j++) {                   // @anchor compare
      if (a[j] < a[best]) {
        best = j;                                       // @anchor new-min
      }
    }
    if (best !== i) {
      const t = a[i];                                   // @anchor swap-in
      a[i] = a[best];
      a[best] = t;
    } else {                                            // @anchor no-swap
      // a[i] was already the smallest of the region
    }
  }
  return a;                                             // @anchor done
}`;

const PY = `def selection_sort(a):
    n = len(a)
    # Nothing is settled yet: the sorted region is empty.  # @anchor start
    for i in range(n - 1):                              # @anchor pass
        best = i                                        # index of the smallest seen so far
        for j in range(i + 1, n):                       # @anchor compare
            if a[j] < a[best]:
                best = j                                # @anchor new-min
        if best != i:
            a[i], a[best] = a[best], a[i]                # @anchor swap-in
        else:                                           # @anchor no-swap
            pass  # a[i] was already the smallest of the region
    return a                                            # @anchor done`;

const JAVA = `class SelectionSort {
    static int[] selectionSort(int[] a) {
        int n = a.length;
        // Nothing is settled yet: the sorted region is empty. // @anchor start
        for (int i = 0; i < n - 1; i++) {               // @anchor pass
            int best = i;                                // index of the smallest seen so far
            for (int j = i + 1; j < n; j++) {            // @anchor compare
                if (a[j] < a[best]) {
                    best = j;                            // @anchor new-min
                }
            }
            if (best != i) {
                int t = a[i];                            // @anchor swap-in
                a[i] = a[best];
                a[best] = t;
            } else {                                     // @anchor no-swap
                // a[i] was already the smallest of the region
            }
        }
        return a;                                        // @anchor done
    }
}`;

const CPP = `#include <vector>
using std::vector;

vector<int> selection_sort(vector<int> a) {
    int n = (int)a.size();
    // Nothing is settled yet: the sorted region is empty. // @anchor start
    for (int i = 0; i < n - 1; i++) {                   // @anchor pass
        int best = i;                                    // index of the smallest seen so far
        for (int j = i + 1; j < n; j++) {                // @anchor compare
            if (a[j] < a[best]) {
                best = j;                                // @anchor new-min
            }
        }
        if (best != i) {
            int t = a[i];                                // @anchor swap-in
            a[i] = a[best];
            a[best] = t;
        } else {                                         // @anchor no-swap
            // a[i] was already the smallest of the region
        }
    }
    return a;                                            // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'The sorted region starts empty and grows from the left. Selection sort never revisits an index it has already finished, so position `i` is final the moment its pass ends. That is the whole reason it needs O(1) extra memory.',
    python:
      'The sorted region starts empty and grows from the left. A Python list has no fixed length, but nothing here needs one: the algorithm only ever rewrites elements that already exist. Position `i` is final the moment its pass ends, which is what makes it in place.',
    java: 'The sorted region starts empty and grows from the left. A Java `int[]` has a fixed length, but its *elements* are writable, so the same in-place rewrite works here exactly as it does in Python. Position `i` is final the moment its pass ends.',
    cpp: "The sorted region starts empty and grows from the left. `a` was taken by value, so the sort runs on a private copy and the caller's vector is never modified — which is why the function returns `a` rather than editing in place. Within that copy, position `i` is final after its pass.",
  },
  pass: {
    javascript:
      'One pass fixes one position. The inner loop is a plain `j` walk whose only job is to *remember* the smallest value seen — it writes nothing. That separation is the whole character of selection sort: n²/2 comparisons but at most `n - 1` writes, the fewest of any comparison sort that runs in place.',
    python:
      'One pass fixes one position. `range(i + 1, n)` walks the rest of the list remembering the smallest value seen, still writing nothing. That separation is selection sort: n²/2 comparisons but at most `n - 1` writes — the fewest of any in-place comparison sort.',
    java: 'One pass fixes one position. The inner loop walks the rest of the array remembering the smallest value seen and writes nothing at all. That is where the O(n²) comparisons and the O(n) writes come from — the two costs are decoupled here in a way no other in-place comparison sort manages.',
    cpp: 'One pass fixes one position. The inner loop walks the rest of the vector remembering the smallest value seen, without writing a single element. The two costs are decoupled: n²/2 comparisons, at most `n - 1` writes.',
  },
  compare: {
    javascript:
      'One comparison, zero writes. The value at `j` is measured against the *best candidate so far*, not against its left neighbour — that is what separates selection sort from insertion and bubble, and it is why the array does not move until the end of the pass.',
    python:
      'One comparison, zero writes. The value at `j` is measured against the best candidate so far, not against its left neighbour. The `<` is strict, so an equal value leaves `best` alone — and because nothing is ever written during the scan, equal values cannot cross: that is the whole reason selection sort is *stable*.',
    java: 'One comparison, zero writes. The value at `j` is measured against the best candidate so far, not against its left neighbour. The strict `<` refuses to swap equal values, so ties keep their original relative order and the sort is *stable*.',
    cpp: 'One comparison, zero writes. The value at `j` is measured against the best candidate so far, not against its left neighbour. The strict `<` refuses to move an equal value past another, so ties keep their original order and the sort is *stable*.',
  },
  'new-min': {
    javascript:
      'The candidate pointer moves; the data does not. This is the only update selection sort ever makes, and because it happens at most `n - i` times per pass, the total write count stays linear even though the comparison count is quadratic. The two are genuinely independent here.',
    python:
      'The candidate pointer moves, the data does not. `best` is a bare integer, so this costs nothing but a register. Because no element is written until the single exchange at the end of the pass, the region keeps its original ordering the whole time.',
    java: 'The candidate pointer moves, the data does not. `best` is a local `int`, not a reference into the array, so updating it cannot alias anything. That is why a pass can scan a whole region while performing at most one memory write.',
    cpp: '`best` is an index, not a reference, so the exchange at the end of the pass can read either candidate directly and no element is written during the scan. Keeping the scan pure is what holds the write count to one per pass.',
  },
  'swap-in': {
    javascript:
      'One exchange, and index `i` is final. The smallest value of the entire unsorted region lands in the one position that never changes again, so the sorted region grows by exactly one. The displaced value is dumped into the vacated slot, which is still inside the region being sorted — no value is lost, only relocated.',
    python:
      'One exchange, and index `i` is final. Python swaps two elements in a single statement, so the displaced value goes straight into the vacated slot with no temporary. The sorted region grows by exactly one, and the rest of the array is left in the order the scan found it.',
    java: 'One exchange, and index `i` is final. Java has no tuple assignment, so `t` holds the displaced value while both slots are written — the same three steps every other language needs. The sorted region grows by exactly one and the rest of the array keeps its order.',
    cpp: 'One exchange, and index `i` is final. `std::swap` would do this in one call; writing the three steps out is what makes the memory traffic visible. The displaced value ends up in the vacated slot, still inside the region being sorted.',
  },
  'no-swap': {
    javascript:
      'The smallest of the region was already sitting at `i`, so this pass performed no write at all. Note that the comparisons still ran in full: selection sort has no early exit, so the comparison count stays quadratic even here. What collapses on nearly-sorted data is the *write* count — which is exactly what makes it a good choice for flash and for append-only logs.',
    python:
      'The smallest of the region was already at `i`, so this pass performed no write — `pass` marks exactly that. The comparisons still ran in full: there is no early exit, so on nearly-sorted input the comparison count stays quadratic and only the write count collapses.',
    java: 'The smallest of the region was already at `i`, so this pass performed no write. There is no early exit, so the comparisons still total n²/2 even on nearly-sorted input; it is the write count that collapses towards zero.',
    cpp: 'The smallest of the region was already at `i`, so this pass performed no write. There is no early exit, so the comparisons still total n²/2 even on nearly-sorted input; it is the write count that collapses towards zero.',
  },
  done: {
    javascript:
      'Every value is in its final position. The loop stops one pass early — `i < n - 1` — because the last remaining value needs no work: once every other position is fixed, it must already be correct. That bound is also the whole guard for degenerate input.',
    python:
      'Every value is in its final position. `range(n - 1)` runs one pass short of the end, because the final value needs no work once every other position is fixed. And `range` of a negative count is simply empty, so an empty or single-element list is a no-op with no extra branch.',
    java: 'Every value is in its final position. The bound `i < n - 1` skips the last pass, because the final value needs no work once every other position is fixed. For `n` of 0 or 1 the loop body never executes, so degenerate input is safe without a special case.',
    cpp: 'Every value is in its final position. The bound `i < n - 1` skips the last pass, because the final value needs no work once every other position is fixed. With `n <= 1` the loop never runs, so no guard clause is needed at all.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'selectionSort',
    python: 'selection_sort',
    java: 'SelectionSort.selectionSort',
    cpp: 'selection_sort',
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

export const selectionSortAlgo: AlgoDef<ArrayFrame> = {
  id: 'selection-sort',
  title: 'Selection Sort',
  category: 'sorting',
  summary:
    'Scan the unsorted region for its smallest value, then swap that value into the first free position.',
  intuition:
    'Reach for it when reads are free and writes are expensive — sorting a firmware table in flash, or flushing a log you can only append to — because it performs at most n - 1 writes no matter how unsorted the input is. It is also the algorithm to read when you want to see a sort that never revisits a finished position, and it is measurably faster than bubble sort on random data for the same reason, despite the same O(n²) comparisons.',
  complexity: {
    best: 'O(n²)',
    average: 'O(n²)',
    worst: 'O(n²)',
    space: 'O(1)',
    note: 'Always n²/2 comparisons — there is no early exit — but at most n - 1 writes, which is the fewest of any in-place comparison sort. Stable, because the scan only ever compares with `<`.',
  },
  traits: {
    stable: true,
    inPlace: true,
    online: false,
    allowsDuplicates: true,
    tags: ['quadratic', 'minimum writes', 'exchange sort'],
  },
  viewport: 'array',
  level: 'intro',
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
  run: selectionSort,
  lesson,
  expectations,
  formatResult: (r) => `[${(r as number[]).join(', ')}]`,
  anchors: ['start', 'pass', 'compare', 'new-min', 'swap-in', 'no-swap', 'done'],
};

export default selectionSortAlgo;
