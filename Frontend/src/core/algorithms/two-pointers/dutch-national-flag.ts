import { byLanguage } from '../../code/anchors.ts';
import { fewDistinctArray, reversedArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Dutch National Flag — the one-pass partition, and the one non-obvious rule in it.
 *
 * Three cursors walk a three-valued array into order: `low` marks the end of the
 * settled 0s, `mid` is the cell under inspection, `high` the start of the
 * settled 2s. The pass is O(n) with O(1) space and writes in place, and every one
 * of those claims is easy. The rule that is not easy is a single missing
 * increment:
 *
 *   **After a swap with `high`, `mid` must not advance.**
 *
 * That swap drops an unexamined value onto index `mid`, because `high` is by
 * definition the far end of the run nobody has looked at yet. Advancing `mid`
 * walks straight past it, and since the pass never comes back, that value stays
 * stranded in the middle band of a finished array. Every implementation of this
 * that has ever shipped the bug has the same shape: it looks correct on sorted
 * input, where the swap is with itself, and it only shows up once a real
 * unexamined value is dragged into the middle.
 *
 * The mirror rule is the one people get wrong in the other direction. After a
 * swap with `low`, `mid` *does* advance — and that is sound, because the value
 * that arrived came from inside the finished 1-run (or from `mid` itself, when
 * the swap is a no-op), so it is already classified. The listings below
 * asymmetric on purpose, and the `swap-low` note says so in each language.
 *
 * Why one pass beats the two-pass version: a quicksort-style partition puts the
 * 2s in place first and still leaves the 1s scattered, so it needs a second
 * sweep to gather them. Here the 1s are settled *as they are passed*, so the
 * single sweep lands all three runs at once.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 2609;

/**
 * The three values as 0, 1 and 2.
 *
 * The algorithm does not care that the numbers are literally 0, 1 and 2 — it
 * cares that they sort into a low, a middle and a high. The generators hand back
 * arbitrary integers, so this maps each distinct value to its rank: order is
 * preserved and nothing else changes. It is the same shape as the generalised
 * algorithm, one step before the specialisation the listings use.
 */
const byRank = (values: number[]): number[] => {
  const distinct = [...new Set(values)].sort((a, b) => a - b);
  return values.map((v) => distinct.indexOf(v));
};

/**
 * `[2, 0, 2, 1, 1, 0]`, hand-written, and the reason is that this arrangement
 * does something no generated array of the same length reliably does: it drags a
 * fresh unexamined value onto index 0 within two steps, which is the one moment
 * the "re-examine, do not advance" rule is visible. A generator that produced
 * mostly 0s would let the pass look like a no-op for the first half of the run.
 */
const SMALL = [2, 0, 2, 1, 1, 0];

/**
 * `[0, 0, 1, 1, 1, 2, 2]`, also hand-written: the best case is a *shape*, not a
 * draw. Every swap in this array is a swap with itself, so the array never
 * changes and each step costs one classification. It is the input that shows the
 * "every cursor advances immediately" case is real rather than theoretical — and
 * it is also the input on which the missing-`mid`-increment bug hides, because
 * every high-swap here is a self-swap and re-examining it costs nothing.
 */
const PARTITIONED = [0, 0, 1, 1, 1, 2, 2];

/** Descending, so the pass opens by dragging 2s to the back one at a time. */
const REVERSED = byRank(reversedArray(SEED + 5, 9, 1, 3));

/** Fourteen values over all three ranks, so the middle band is a real problem. */
const MIXED = byRank(fewDistinctArray(SEED + 13, 14, 3, 1));

/**
 * Seven 1s. `fewDistinctArray` with one distinct value is a generated way of
 * saying "one value", and the point is the degenerate region structure: the 0
 * and 2 runs never grow at all, every step is `already-mid`, and the pass costs
 * n frames and zero swaps.
 */
const ALL_ONES = fewDistinctArray(SEED + 9, 7, 1, 1);

const PRESETS: Preset[] = [
  {
    id: 'small-case',
    label: 'The classic six',
    blurb:
      '`[2, 0, 2, 1, 1, 0]`, spelled out by hand. Within two steps an unexamined 0 has been dragged onto index 0, which is the moment the "re-examine, do not advance" rule is visible — and the three runs come out as 2 zeros, 2 ones and 2 twos.',
    input: { type: 'numbers', values: SMALL },
  },
  {
    id: 'partitioned',
    label: 'Already partitioned',
    blurb:
      'The best case, and the reason the bug this algorithm is famous for survives testing: every swap either is a cell trading with itself or exchanges two cells that already hold the same value, so the array never changes and every cursor advances on sight. On this input "forget to re-examine" costs nothing at all.',
    input: { type: 'numbers', values: PARTITIONED },
  },
  {
    id: 'reversed',
    label: 'Reversed',
    blurb:
      'Four twos, a one, four zeros. The pass opens with four swaps against the far end, each dragging a 0 from the back to the front, and each leaving `mid` exactly where it was so the new arrival could be looked at. The four low-swaps that follow are each with the cell itself — a 0 has arrived exactly where a 0 belongs — and the pass ends after nine classifications.',
    input: { type: 'numbers', values: REVERSED },
  },
  {
    id: 'mixed',
    label: 'Fourteen values, all three ranks',
    blurb:
      'A larger generated array, remapped to 0, 1 and 2 by rank. Nine swaps, six of them against the far end, and a middle band five long when the pass finishes — the part a two-pass partition would still have had to gather in a second sweep.',
    input: { type: 'numbers', values: MIXED },
  },
  {
    id: 'all-ones',
    label: 'All one value',
    blurb:
      'Seven 1s and nothing else. `low` and `high` never move, every step is the cheapest branch, and the answer is the array unchanged — which is the degenerate region structure rather than a special case in the code.',
    input: { type: 'numbers', values: ALL_ONES },
  },
  {
    id: 'degenerate',
    label: 'No values at all',
    blurb:
      'An empty array. `high` starts at -1, the guard `mid <= high` is false on the first test, and the pass is one frame long with no branch taken at all.',
    input: { type: 'numbers', values: [] },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

export function* dutchNationalFlag(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const size = Number(ctx.params.size ?? source.length);
  // Passed through untouched, and deliberately *not* run through `byRank`. A rank
  // remap on an all-one-value input is a remap to all zeros, which would turn the
  // degenerate preset into a different degenerate preset and quietly hide the
  // case the preset exists to show. The precondition is three values that sort
  // into a low, a middle and a high; the presets all satisfy it by construction.
  const values = [...source].slice(0, Math.max(0, size));
  const n = values.length;

  let ops = 0;
  let swaps = 0;
  let low = 0;
  let mid = 0;
  let high = n - 1;

  /** `high` is -1 on an empty array, and a pointer may not leave the array. */
  const cursors = (): Record<string, number> => {
    const out: Record<string, number> = { low, mid };
    if (high >= 0) out.high = high;
    return out;
  };

  /** The four bands the array is always made of, in order. */
  const zeroRun = (): number[] => range(0, low);
  const oneRun = (): number[] => range(low, mid);
  const open = (): number[] => (mid > high ? [] : range(mid, high + 1));
  const twoRun = (): number[] => range(high + 1, n);

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    note:
      n === 0
        ? 'No values, so there is nothing to partition and no band to grow. An empty array is already as partitioned as an empty array can be.'
        : `${n} values drawn from 0, 1 and 2, and three cursors aimed at the same place. The array is always exactly four bands: 0s up to low, 1s from low to mid, unclassified from mid to high, 2s after high. All four are empty, and only the third one is still allowed to change.`,
    values: [...values],
    pointers: cursors(),
    highlight: { window: range(0, n) },
    vars: { n, low, mid, high, ops, swaps },
  };

  while (mid <= high) {
    if (ctx.shouldStop()) return;
    ops++;
    const at = mid;
    const under = values[at] as number;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'loop',
      caption: `Step ${ops} of ${n}`,
      note: `The unclassified band is indices ${mid} to ${high} — ${high - mid + 1} value${high - mid === 0 ? '' : 's'} nobody has looked at yet. The value under inspection is ${under} at index ${mid}, and mid cannot step past it: a swap from the far end drops an unexamined value straight onto index ${mid}, so this cell may have to be classified twice.`,
      values: [...values],
      pointers: cursors(),
      highlight: { output: zeroRun(), window: open(), picked: twoRun() },
      sorted: [0, low],
      ops,
      vars: { n, low, mid, high, under, ops, swaps },
    };

    if (under === 1) {
      mid = mid + 1;
      yield {
        kind: 'array',
        index: 0,
        anchor: 'already-mid',
        caption: `Step ${ops} of ${n}`,
        note: `The value at index ${at} is 1 — the middle value — so it is already standing where it belongs. Nothing is written and only mid moves, to ${mid}, taking the 1-run to [${low}, ${mid}). A run of 1s costs one of these steps per cell and no swap at all, which is what makes this branch the best case of the three.`,
        values: [...values],
        pointers: cursors(),
        highlight: { current: [at], output: zeroRun(), sorted: oneRun() },
        sorted: [0, low],
        ops,
        vars: { n, low, mid, high, ops, swaps },
      };
    } else if (under === 0) {
      const front = low;
      const displaced = values[front] as number;
      values[at] = displaced;
      values[front] = under;
      low = low + 1;
      mid = mid + 1;
      swaps++;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'swap-low',
        caption: `Step ${ops} of ${n}`,
        note: `The value at index ${at} is 0, the low value, and it belongs at the front of the unclassified run. ${
          front === at
            ? `The 0-run has caught up with the cursor, so the swap is with itself at index ${at}`
            : `It trades with the ${displaced} at index ${front}`
        }, and the settled 0-run grows to [0, ${low}). mid does advance to ${mid} here, and that is the asymmetry with the far-end swap: the value that landed on index ${at} came from inside the finished 1-run — or from index ${at} itself, when the swap was a no-op — so it is already classified and needs no second look.`,
        values: [...values],
        pointers: cursors(),
        highlight: {
          swapping: [front, at],
          output: zeroRun(),
          sorted: oneRun(),
        },
        sorted: [0, low],
        ops,
        vars: { n, low, mid, high, swaps, swappedIn: displaced },
      };
    } else {
      const far = high;
      const incoming = values[far] as number;
      values[at] = incoming;
      values[far] = under;
      // `high` shrinks and `mid` deliberately does not: the value that just
      // arrived on index `at` came off the end of the unexamined band, so it has
      // still to be classified. This is the whole trick and the only line in the
      // algorithm that is not symmetric.
      high = high - 1;
      swaps++;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'swap-high',
        caption: `Step ${ops} of ${n}`,
        note:
          far === at
            ? `The value at index ${at} is 2, the high value, and the unclassified band is a single cell, so it is already at the back and the swap is with itself. high shrinks to ${high} and mid stays at ${at}, which is what ends the pass: the band is empty. Advancing here would be harmless *on this step*, because the loop is over either way — which is exactly why this is the frame on which the missing increment hides, and why the \`already-partitioned\` preset passes a buggy implementation perfectly.`
            : `The value at index ${at} is 2, the high value, so it goes to the back: it trades with the unexamined ${incoming} at index ${far} and the settled 2-run grows to start at index ${far}. mid stays at ${at}, because the ${incoming} that just arrived has never been looked at — and advancing here is exactly how a value gets stranded in the middle band of an array the pass has already declared finished.`,
        values: [...values],
        pointers: cursors(),
        highlight: {
          swapping: [at, far],
          output: zeroRun(),
          picked: range(far + 1, n),
        },
        sorted: [0, low],
        ops,
        vars: { n, low, mid, high, swaps, swappedIn: incoming },
      };
    }
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'done',
    note:
      n === 0
        ? 'No values, so there is nothing to place. An empty array is partitioned, and it got there without the loop running a single time.'
        : `${n} value${n === 1 ? '' : 's'}, ${ops} classification${ops === 1 ? '' : 's'} and ${swaps} swap${swaps === 1 ? '' : 's'}, and the array is already in order: ${low} zero${low === 1 ? '' : 's'}, ${mid - low} one${mid - low === 1 ? '' : 's'} and ${n - mid} two${n - mid === 1 ? '' : 's'}. A two-pass quicksort-style partition would put the twos in place on the first sweep and still need a second one to gather the ones; settling the middle value as it is passed is what buys the single pass.`,
    values: [...values],
    pointers: cursors(),
    highlight: { output: zeroRun(), sorted: oneRun(), picked: twoRun() },
    sorted: [0, n],
    result: 'sorted',
    ops,
    vars: { n, low, mid, high, ops, swaps },
  };
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Values (0, 1 or 2)',
      kind: 'numbers' as const,
      default: PRESETS[0]?.input.type === 'numbers' ? PRESETS[0].input.values : [],
    },
  ],
  build: (values: Record<string, unknown>): AlgoInput => ({
    type: 'numbers',
    /*
     * No normalisation, on purpose, and the reason is a trap worth recording.
     * The natural generalisation is to rank whatever arrives into 0, 1, 2 — and
     * on an array holding a single distinct value every element ranks 0, so the
     * `all-ones` preset would silently become an array of zeros and the
     * degenerate case this module exists to show would vanish. The listings
     * therefore name 0, 1 and 2 directly, the field label says so, and a
     * hand-typed array of some other three values is off-contract rather than
     * quietly rewritten.
     */
    values: Array.isArray(values.values) ? (values.values as number[]) : [],
  }),
  sizeOf: (input: AlgoInput): number => (input.type === 'numbers' ? input.values.length : 0),
};

/* ------------------------------------------------------------------ *
 * 4. The lesson — four languages, one set of anchors
 * ------------------------------------------------------------------ */

const JS = `function dutchNationalFlag(a) {
  let low = 0, mid = 0, high = a.length - 1;             // @anchor start
  while (mid <= high) {                                  // @anchor loop
    if (a[mid] === 1) {                                  // @anchor already-mid
      mid = mid + 1;
    } else if (a[mid] === 0) {                            // @anchor swap-low
      const t = a[low];
      a[low] = a[mid];
      a[mid] = t;
      low = low + 1;
      mid = mid + 1;
    } else {                                              // @anchor swap-high
      const t = a[high];
      a[high] = a[mid];
      a[mid] = t;
      high = high - 1;
    }
  }
  return a;                                               // @anchor done
}`;

const PY = `def dutch_national_flag(a):
    low, mid, high = 0, 0, len(a) - 1                    # @anchor start
    while mid <= high:                                    # @anchor loop
        if a[mid] == 1:                                   # @anchor already-mid
            mid += 1
        elif a[mid] == 0:                                 # @anchor swap-low
            a[low], a[mid] = a[mid], a[low]
            low += 1
            mid += 1
        else:                                             # @anchor swap-high
            a[mid], a[high] = a[high], a[mid]
            high -= 1
    return a                                              # @anchor done`;

const JAVA = `class DutchNationalFlag {
    static int[] dutchNationalFlag(int[] a) {
        int low = 0, mid = 0, high = a.length - 1;        // @anchor start
        while (mid <= high) {                             // @anchor loop
            if (a[mid] == 1) {                            // @anchor already-mid
                mid = mid + 1;
            } else if (a[mid] == 0) {                     // @anchor swap-low
                int t = a[low];
                a[low] = a[mid];
                a[mid] = t;
                low = low + 1;
                mid = mid + 1;
            } else {                                      // @anchor swap-high
                int t = a[high];
                a[high] = a[mid];
                a[mid] = t;
                high = high - 1;
            }
        }
        return a;                                         // @anchor done
    }
}`;

const CPP = `#include <utility>
#include <vector>
using std::vector;

vector<int> dutch_national_flag(vector<int> a) {
    int low = 0, mid = 0, high = (int)a.size() - 1;      // @anchor start
    while (mid <= high) {                                 // @anchor loop
        if (a[mid] == 1) {                                // @anchor already-mid
            mid = mid + 1;
        } else if (a[mid] == 0) {                         // @anchor swap-low
            std::swap(a[low], a[mid]);
            low = low + 1;
            mid = mid + 1;
        } else {                                          // @anchor swap-high
            std::swap(a[mid], a[high]);
            high = high - 1;
        }
    }
    return a;                                             // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'Three cursors and not one cell written. `low` and `mid` both start at 0 and `high` starts past the last index, so the unclassified band is the whole array and the three settled bands are empty. `high` is -1 on an empty array, which is harmless only because the guard below reads `<=` — the same guard that makes a one-element array work rather than index off the end.',
    python:
      'Tuple assignment binds three names in one statement, which is the only one of the four languages that can do it. `high` is `len(a) - 1`, so it is -1 on an empty list, and the loop guard `mid <= high` is false immediately — the degenerate case is handled by the initialisation rather than by a branch anywhere in the function.',
    java: 'Three `int`s declared in one statement, which Java permits as comma-separated declarators. The parameter is `int[]` rather than `int[][]` or a list, so the same reference the caller passed in is the array that gets sorted — there is no copy anywhere in this method, and that is what makes the O(1) space claim true for this listing.',
    cpp: '`high` is `(int)a.size() - 1`, and the cast is load-bearing rather than decorative: `size()` returns an unsigned type, so without it the subtraction on an empty vector would wrap around to a huge positive number and the guard below would send the loop looking for values that are not there. Also note the parameter is taken **by value** — a copy — so this listing is the one spelling of the algorithm that is not in place; see the `done` note.',
  },
  loop: {
    javascript:
      'One pass, and `mid` is the only cursor guaranteed to move: every iteration either advances it by one or leaves it exactly where it was so the same index can be classified again. The guard is `<=`, not `<`, because the last unclassified cell still has to be dealt with — with a strict `<` an odd-length array would come out with one value left in the middle band.',
    python:
      'The loop ends when the unclassified band is empty, and the cost is bounded by the number of classifications rather than the number of swaps: a column is classified once even where several swaps move it around, and a swap is never more expensive than the test that caused it. `mid` only ever increases, which is the termination argument in one sentence.',
    java: 'The whole algorithm is this loop, and the guard is the part that is easiest to get wrong. `mid <= high` rather than `mid < high` is what makes the last cell of an odd-length array get classified; get it wrong and the array comes out one value short of sorted with no error anywhere.',
    cpp: 'The guard that ends the pass. Once `mid` has passed `high` the unclassified band is empty, so the array is partitioned: `mid` only ever increases and it increases at most n times, which is the entire termination argument. Note that the two swaps here are `std::swap` calls and the two cursor updates are separate statements — nothing in C++ lets one statement mean `low += 1; mid += 1`.',
  },
  'already-mid': {
    javascript:
      'The cheapest step there is: inspect, write nothing, advance. The value is already the middle value, so it belongs exactly where it stands, and the band it leaves behind can never be disturbed by anything later in the pass. A preset of all 1s is n frames long and contains no swap at all, which is what makes the O(n) best case honest rather than rhetorical.',
    python:
      'A 1 needs no work, and the branch exists purely so that `mid` can step over it — there is no `elif` to skip and no assignment to make, just `mid += 1`. The region it leaves behind is final: the algorithm never writes to an index below `mid` again except to move a 0 in, and that write is always correct because 0 belongs in the low band.',
    java: 'Inspect, write nothing, advance. Every settled 1 is one of these frames, so the number of them is exactly the length of the middle run in the finished array — a claim the trace can be checked against, and one the per-algorithm test does check. The `mid = mid + 1` spelling is chosen to match the `low = low + 1` three lines below.',
    cpp: 'No swap and no write — the branch that makes an already-partitioned array cost n cheap steps. It is also the branch that exposes the two-pass alternative: a quicksort-style partition has no such branch, because a 1 it passes over is not yet known to be in its final place and has to be gathered afterwards.',
  },
  'swap-low': {
    javascript:
      'A 0 has been found, so it trades with whatever sits at `low` and the low band grows by one. The temporary is unavoidable — JavaScript cannot swap two array slots in one statement, and the destructuring form `[a[low], a[mid]] = [a[mid], a[low]]` is the same three steps written sideways. And yes, `mid` advances here, which is the asymmetry with the branch below: the value that lands on the old `mid` came from inside the finished 1-run, so it is already classified.',
    python:
      'One tuple swap, two increments, three lines shorter than the other three languages. Python reads both right-hand sides before writing either left-hand side, which is exactly why the exchange cannot lose a value here. Advancing `mid` is sound because the value arriving is a 1 from the settled middle run — or the 0 that was already at `mid`, when `low === mid` and the swap is a no-op.',
    java: 'Swap, then grow both bands. There is no tuple assignment in Java, so the temporary is unavoidable and the three statements are the honest spelling of one exchange. The reason `mid` still advances is worth being precise about: the value arriving at `mid` is either the 1 that stood at `low` or, when `low == mid`, the 0 that was there already. Both are classified, so a second look would find nothing.',
    cpp: 'One call: `std::swap` from `<utility>` exchanges the two cells, and both arguments are lvalues, so it is exactly as good as the three statements the other three languages are forced to write. The two increments stay on two lines. And the asymmetry is deliberate — the value arriving on `mid` came from inside the finished 1-run, which is why advancing here is safe even though it is not safe in the branch below.',
  },
  'swap-high': {
    javascript:
      'The branch with no `mid` increment, and the reason this algorithm is one pass rather than one-and-a-bit. The swap drags an unexamined value out of the far end of the unclassified band onto index `mid`; advancing would step over it, and since the pass never returns, it would sit in the middle band of an array the algorithm has already declared finished. Advance here only by accident and the result is wrong on unsorted input while looking perfectly right on sorted input.',
    python:
      'The one place the algorithm deliberately examines the same index twice. The swap brings a value nobody has classified onto `mid`, so the only correct move is to shrink `high` and go round the loop again — which is why the `mid += 1` that ends the branch above is conspicuously missing here. The other three languages have to spell the exchange out and this one does not, which is a fair summary of the difference between them.',
    java: 'The far-end swap, and the missing `mid = mid + 1` is the entire lesson. Because `high` marks the start of the unclassified band, whatever stood there has never been examined, so the value now on `mid` needs a second look — and a pass that never comes back has no second chance. Every one of the four statements writes; there is deliberately no fifth.',
    cpp: '`high` shrinks and `mid` does not, which makes the invariant easy to check by eye: the unclassified band is exactly `[mid, high]`, and this is the only line that shrinks it from the right without also advancing its left edge. Written the other way round — with `mid = mid + 1; high = high - 1;` — the code looks symmetric, which is precisely how the bug gets shipped.',
  },
  done: {
    javascript:
      'Every value is in one of the three bands and none of them can change. The counts are worth reading off the cursors: `low` zeros, `mid - low` ones and `n - mid` twos, and the array is already sorted. A two-pass quicksort-style partition would have put the twos in place first and still needed a second sweep for the ones, so the reason this one pass suffices is that the 1s are settled as they are passed rather than gathered afterwards.',
    python:
      "The list comes back because it was sorted *in place*: the function mutates the caller's list rather than building a new one, which is the only reason the O(1) space claim survives. Python makes that visible — the object returned is the object passed in — so a caller can keep using their reference and find it already partitioned.",
    java: "The same array object is returned, not a copy, because Java arrays are mutable and the method edits the caller's directly. That is the honest caveat for this algorithm as well: it is **not** stable. A 1 can be swapped leftwards past a 2 when a far-end swap brings it in, and the two never regain their original relative order, so this must not be used to sort records that carry a meaningful tie-break.",
    cpp: "The vector is taken **by value**, so this listing copies: the caller's array is untouched and the partitioned one comes back as the result. That copy is a cost the other three languages do not pay — JavaScript, Python and Java all mutate in place — and it is O(n) space, not O(1). The algorithm is O(1); this one spelling of it is not, and it is the harness's driver, which hands the function a temporary, that forces the copy.",
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'dutchNationalFlag',
    python: 'dutch_national_flag',
    java: 'DutchNationalFlag.dutchNationalFlag',
    cpp: 'dutch_national_flag',
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

/**
 * The claim: the three values in order.
 *
 * Deliberately a sort and not a call into the generator. The four listings
 * implement the one-pass partition, so a reference that also walked the array
 * with three cursors would only prove two copies of one idea agree — the exact
 * failure `avl-rotate` shipped for months, where every language agreed with
 * every other language and all of them were wrong.
 *
 * Sorting *by rank* is the reference for the generalised algorithm, and it is
 * worth saying why this is not quite that: on the `all-ones` preset there is
 * only one distinct value, it ranks 0, and a rank-sorted answer would be a row
 * of zeros where the algorithm correctly leaves a row of ones. The
 * specialisation the listings use is the one that behaves sanely there.
 */
const partitionOf = (values: number[]): number[] => [...values].sort((a, b) => a - b);

const expectations: Expectation[] = PRESETS.map((p) => {
  const values = valuesOf(p);
  return { presetId: p.id, args: [values], result: partitionOf(values) };
});

export const dutchNationalFlagAlgo: AlgoDef<ArrayFrame> = {
  id: 'dutch-national-flag',
  title: 'Dutch National Flag',
  category: 'two-pointers',
  summary:
    'One pass, three cursors: settle a 0 at the front, a 2 at the back, and a 1 where it already stands, never letting the cursor that is inspecting advance past a value a swap has just dragged onto it.',
  intuition:
    'Reach for this the moment an array has to end up grouped into a handful of bands and the bands do not need to be internally sorted — bucketing records by a category, routing values into low/middle/high ranges, putting a three-way classification in order in one sweep of memory you cannot afford to copy twice. The reason to prefer it over the obvious two-pass version is not speed so much as passes: sorting by category is a streaming-friendly operation, and this is the formulation that never revisits a band it has already declared finished. It is also the clearest available demonstration that "do not advance the inspecting cursor after a far-end swap" is a rule you have to be told, rather than something the shape of the code suggests.',
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    note: 'At most n classifications and at most n swaps, and the loop is the only thing that runs — which is what it buys over a two-pass partition at 2n. The caveat is the C++ listing, which takes its vector by value because the verification driver hands the function a temporary, so that one spelling copies O(n); the O(1) claim is about the algorithm, not about every way of writing it down.',
  },
  traits: {
    stable: false,
    inPlace: true,
    offline: true,
    allowsDuplicates: true,
    tags: ['one pass', 'three pointers', 'no extra space', 'not stable'],
  },
  viewport: 'array',
  level: 'intermediate',
  params: [
    {
      key: 'size',
      label: 'Values',
      kind: 'number',
      min: 1,
      max: 150,
      step: 1,
      default: 14,
      regeneratesInput: true,
      help: 'Past 150 elements the cells get too small to read, and a long run can hit the frame cap and stop early.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: dutchNationalFlag,
  lesson,
  expectations,
  formatResult: (r) => `[${(r as number[]).join(', ')}]`,
  anchors: ['start', 'loop', 'already-mid', 'swap-low', 'swap-high', 'done'],
};

export default dutchNationalFlagAlgo;
