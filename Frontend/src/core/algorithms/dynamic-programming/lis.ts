import { byLanguage } from '../../code/anchors.ts';
import { distinctArray, randomArray, reversedArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { ArrayFrame, CellValue } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Longest Increasing Subsequence — patience sorting, and the `prev` array is the
 * whole point.
 *
 * The O(n log n) version keeps a second array, `tails`, where `tails[k]` is the
 * *smallest possible last element* of an increasing run of length k + 1 seen so
 * far. That is the trick: it never stores a subsequence, it stores a frontier,
 * and the frontier is all you need — a smaller ending is always at least as
 * easy to extend.
 *
 * But a frontier cannot be read backwards, so `prev` links are kept alongside
 * it, and *the answer is read out of the links rather than out of the
 * frontier*. That is what the function returns: the length comes from counting
 * the chain, which is also the only way to see that the chain is real. The
 * frontier row and the highlighted chain are the two halves of the lesson, and
 * the invariant that ties them together — `tails.length === chain.length` — is
 * the thing to check when the answer looks wrong.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 505;

const PRESETS: Preset[] = [
  {
    id: 'mixed',
    label: 'Mixed (the everyday case)',
    blurb:
      'Six values where the run gets replaced twice and extended once. Watch the frontier change shape rather than grow — that replacement is the algorithm, not an implementation detail.',
    input: { type: 'numbers', values: randomArray(SEED, 6, 2, 40) },
    params: { count: 6 },
  },
  {
    id: 'ascending',
    label: 'Ascending (every step extends)',
    blurb:
      'Every element extends the frontier, so `tails` only ever grows and the answer is the whole array. The binary search still runs log n times per element even though the answer is obvious.',
    input: { type: 'numbers', values: distinctArray(SEED + 4, 7, 1, 90).sort((a, b) => a - b) },
    params: { count: 7 },
  },
  {
    id: 'descending',
    label: 'Descending (nothing ever extends)',
    blurb:
      'Every element lands on tails[0] and overwrites it, so the frontier never gets deeper than one cell and the answer is 1. This is the case that shows the frontier is a *set of candidate endings*, not a subsequence.',
    input: { type: 'numbers', values: reversedArray(SEED + 8, 6, 2, 90) },
    params: { count: 6 },
  },
  {
    id: 'single',
    label: 'One element',
    blurb:
      'The degenerate case: no binary search runs, the frontier is one cell deep, and the chain has exactly one link. Every longer answer is this answer with more links.',
    input: { type: 'numbers', values: [17] },
    params: { count: 1 },
  },
  {
    id: 'duplicates',
    label: 'Duplicates, 9 elements',
    blurb:
      'The comparison is strictly `<`, so an equal value *replaces* a tail instead of extending one — which is what keeps the result strictly increasing. Relaxing it to `<=` gives the longest non-decreasing subsequence instead, for free.',
    input: { type: 'numbers', values: [4, 7, 4, 9, 2, 9, 5, 5, 11] },
    params: { count: 9 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

export function* lis(ctx: RunContext): Generator<ArrayFrame> {
  const source = isNumbers(ctx.input) ? ctx.input.values : [];
  const wanted = Math.max(1, Math.min(14, Math.trunc(Number(ctx.params.count ?? 6)) || 6));
  const values = [...source].slice(0, wanted);
  const n = values.length;

  /** tails[k] = smallest tail of an increasing run of length k + 1. */
  const tails: number[] = [];
  /**
   * owner[k] = which *element* put that tail there. A tail is a value, and two
   * different elements can hold the same value, so the frontier alone cannot say
   * who to link back to. This array is the bug that every hand-written LIS
   * implementation writes first.
   */
  const owner: number[] = [];
  /** prev[i] = index of the element that came before a[i] in the best run ending at i. */
  const prev: number[] = new Array<number>(n).fill(-1);
  let ops = 0;
  let best = 0;
  let bestIdx = -1;

  /** The chain of indices ending at `i`, walked through the `prev` links. */
  const chainTo = (i: number): number[] => {
    const out: number[] = [];
    let k = i;
    while (k >= 0) {
      out.unshift(k);
      k = prev[k] as number;
    }
    return out;
  };

  const frame = (
    anchor: string,
    note: string,
    highlight: Record<string, Array<number>>,
    vars: Record<string, CellValue | boolean>,
    extra?: { pointer?: number; tailsPointers?: Record<string, number> },
  ): ArrayFrame => ({
    kind: 'array',
    index: 0,
    anchor,
    note,
    values: [...values],
    overlay: {
      label: 'tails[k] = smallest tail of a run of length k + 1',
      values: [...tails],
      mode: 'number',
      ...(extra?.tailsPointers ? { pointers: extra.tailsPointers } : {}),
    },
    highlight,
    ...(extra?.pointer !== undefined ? { pointers: { i: extra.pointer } } : {}),
    ops,
    vars,
  });

  yield frame(
    'start',
    `${n} values, and a second row underneath that starts empty. That row is the frontier: the smallest possible last element for every run length found so far. Its length is 0 now and it is the answer at the end.`,
    { unvisited: [...Array(n)].map((_, k) => k) },
    { n, tails: 0, best: 0, ops },
  );

  for (let i = 0; i < n; i++) {
    if (ctx.shouldStop()) return;
    const x = values[i] as number;
    ops++;

    // Binary search for the first tail that is >= x. Everything strictly before
    // that position is smaller than x, so x can extend the run of length `lo`.
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      if (ctx.shouldStop()) return;
      const mid = (lo + hi) >> 1;
      ops++;
      const t = tails[mid] as number;
      yield frame(
        'search',
        `Where does ${x} belong? tails[${mid}] is ${t}, and ${t < x ? `${t} is smaller, so every tail from ${lo} to ${mid} could be extended by ${x} — the search moves right` : `${t} is already >= ${x}, so ${x} can never extend that run and the answer is at or before ${mid} — the search moves left`}. Live range: [${lo}, ${hi}).`,
        {
          current: [i],
          ...(bestIdx >= 0 ? { best: chainTo(bestIdx) } : {}),
        },
        { i, x, lo, hi, mid, tail: t, ops },
        { tailsPointers: { lo, mid, hi: Math.max(hi, 0) } },
      );
      if (t < x) lo = mid + 1;
      else hi = mid;
    }

    const at = lo;
    const lenHere = at + 1;
    prev[i] = at > 0 ? (owner[at - 1] as number) : -1;
    yield frame(
      'link',
      `The search stopped at frontier index ${at}, so the longest run ending at ${x} has length ${lenHere}. Its predecessor is whichever *element* owns tails[${at - 1}] — element ${prev[i] as number}${at > 0 ? '' : ', and at index 0 there is nothing before it, hence -1'}. This link is the only thing that will let the sequence be rebuilt later; the frontier alone can only report a length.`,
      {
        current: [i],
        answer: [i],
        ...(bestIdx >= 0 ? { best: chainTo(bestIdx) } : {}),
      },
      { i, x, at, len: lenHere, prev: prev[i] as number, ops },
      { pointer: i },
    );

    if (at === tails.length) {
      tails.push(x);
      owner.push(i);
      yield frame(
        'extend',
        `${x} beats every tail in the frontier, so there is nothing to replace and the frontier grows to ${tails.length}. This is the only branch that makes the answer bigger, and it fires exactly when the search landed one past the end.`,
        {
          current: [i],
          answer: [...chainTo(i)],
          ...(bestIdx >= 0 ? { best: chainTo(bestIdx) } : {}),
        },
        { i, x, at, tails: tails.length, len: lenHere, ops },
        { pointer: i },
      );
    } else {
      const replaced = tails[at] as number;
      const replacedOwner = owner[at] as number;
      tails[at] = x;
      owner[at] = i;
      yield frame(
        'replace',
        `tails[${at}] was ${replaced} (put there by element ${replacedOwner}) and ${x} is smaller, so it takes its place — and so does the ownership. The run length does not change, because the length lives in the index and not in the value; what changes is that ${x} is now easier to extend, since anything that could follow ${replaced} can still follow ${x}, and possibly more.`,
        {
          current: [i],
          answer: [...chainTo(i)],
          ...(bestIdx >= 0 ? { best: chainTo(bestIdx) } : {}),
        },
        { i, x, at, replaced, replacedBy: replacedOwner, tails: tails.length, len: lenHere, ops },
        { pointer: i },
      );
    }

    if (lenHere > best) {
      best = lenHere;
      bestIdx = i;
    }
  }

  const finalChain = chainTo(bestIdx);
  yield frame(
    'chain',
    `The frontier is ${tails.length} deep, and the best element sits at frontier index ${best - 1}. Now walk the \`prev\` links back from it: each hop names the element that extended the run one step shorter, so the chain is the answer in reverse. It should come out exactly ${tails.length} long — if it does not, a link was written with the wrong index.`,
    { answer: finalChain, endingHere: finalChain },
    { best: tails.length, chain: finalChain.length, ops },
  );

  const subseq = finalChain.map((k) => values[k] as number);
  yield frame(
    'done',
    `The subsequence is ${subseq.length === 0 ? '(empty)' : subseq.join(' → ')}: ${subseq.length} values, increasing, and *not* contiguous — the whole point of a subsequence rather than a substring. ${ops} comparisons in total, about log n per element, against the n(n-1)/2 of the version that compares every pair.`,
    { answer: finalChain, ...(finalChain.length ? { endingHere: finalChain } : {}) },
    { n, best: finalChain.length, result: subseq.join(' '), ops },
  );
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
 * ------------------------------------------------------------------ */

const JS = `function lis(a) {
  // tails[k] is the smallest tail of an increasing run of length k + 1, so the
  // array stays sorted and the frontier can be binary searched.
  const tails = [];                                           // @anchor start
  // owner[k] is *which element* put that tail there. tails alone is not enough:
  // a tail is a value, and two different elements can hold the same value.
  const owner = [];
  const prev = new Array(a.length).fill(-1);
  let best = 0, bestIdx = -1;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    // First tail that is >= x. Everything before it can be extended by x, and
    // hi starts at length (not length - 1) because this finds an insertion point.
    let lo = 0, hi = tails.length;                            // @anchor search
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    // The run ending at i is one longer than the run ending at owner[lo - 1], so
    // that element is the one immediately before a[i] in the answer.
    prev[i] = lo > 0 ? owner[lo - 1] : -1;                    // @anchor link
    if (lo === tails.length) { tails.push(x); owner.push(i); }  // @anchor extend
    else { tails[lo] = x; owner[lo] = i; }                    // @anchor replace
    if (lo + 1 > best) { best = lo + 1; bestIdx = i; }
  }
  // The frontier knows the length but not the sequence; the links know both.
  let i = bestIdx;                                            // @anchor chain
  const out = [];
  while (i >= 0) { out.push(a[i]); i = prev[i]; }
  out.reverse();
  return out.length;                                          // @anchor done
}`;

const PY = `def lis(a):
    # tails[k] is the smallest tail of an increasing run of length k + 1, so the
    # list stays sorted and the frontier can be binary searched.
    tails = []                                                 # @anchor start
    # owner[k] is *which element* put that tail there. tails alone is not enough:
    # a tail is a value, and two different elements can hold the same value.
    owner = []
    prev = [-1] * len(a)
    best, best_idx = 0, -1
    for i, x in enumerate(a):
        # First tail that is >= x. Everything before it can be extended by x, and
        # hi starts at len(tails) (not len - 1): this finds an insertion point.
        lo, hi = 0, len(tails)                                 # @anchor search
        while lo < hi:
            mid = (lo + hi) // 2
            if tails[mid] < x:
                lo = mid + 1
            else:
                hi = mid
        # The run ending at i is one longer than the run ending at owner[lo - 1],
        # so that element is the one immediately before a[i] in the answer.
        prev[i] = owner[lo - 1] if lo > 0 else -1              # @anchor link
        if lo == len(tails):
            tails.append(x)                                    # @anchor extend
            owner.append(i)
        else:
            tails[lo] = x                                      # @anchor replace
            owner[lo] = i
        if lo + 1 > best:
            best, best_idx = lo + 1, i
    # The frontier knows the length but not the sequence; the links know both.
    i = best_idx                                               # @anchor chain
    out = []
    while i >= 0:
        out.append(a[i])
        i = prev[i]
    out.reverse()
    return len(out)                                            # @anchor done`;

const JAVA = `class Lis {
    static int lis(int[] a) {
        // tails[k] is the smallest tail of an increasing run of length k + 1.
        // A Java array cannot grow, so size carries the live length.
        int[] tails = new int[a.length];                      // @anchor start
        int[] owner = new int[a.length];
        int size = 0;
        int[] prev = new int[a.length];
        int best = 0, bestIdx = -1;
        for (int i = 0; i < a.length; i++) {
            int x = a[i];
            // First tail that is >= x. Everything before it can be extended by x,
            // and hi starts at size (not size - 1): this finds an insertion point.
            int lo = 0, hi = size;                             // @anchor search
            while (lo < hi) {
                int mid = (lo + hi) / 2;
                if (tails[mid] < x) lo = mid + 1;
                else hi = mid;
            }
            // The run ending at i is one longer than the run ending at
            // owner[lo - 1], so that element comes immediately before a[i].
            prev[i] = lo > 0 ? owner[lo - 1] : -1;             // @anchor link
            if (lo == size) { tails[size] = x; owner[size] = i; size++; }  // @anchor extend
            else { tails[lo] = x; owner[lo] = i; }             // @anchor replace
            if (lo + 1 > best) { best = lo + 1; bestIdx = i; }
        }
        // The frontier knows the length but not the sequence; the links know both.
        int i = bestIdx;                                       // @anchor chain
        int count = 0;
        for (int k = i; k >= 0; k = prev[k]) count++;
        return count;                                          // @anchor done
    }
}`;

const CPP = `#include <vector>
using std::vector;

int lis(vector<int> a) {
    // tails[k] is the smallest tail of an increasing run of length k + 1.
    // Preallocated to a.size(): the frontier never gets longer than the input,
    // so the binary search never walks off a reallocation boundary.
    vector<int> tails(a.size(), 0);                            // @anchor start
    vector<int> owner(a.size(), -1);
    int size = 0;
    vector<int> prev(a.size(), -1);
    int best = 0, bestIdx = -1;
    for (int i = 0; i < (int)a.size(); i++) {
        int x = a[i];
        // First tail that is >= x. Everything before it can be extended by x, and
        // hi starts at size (not size - 1): this finds an insertion point.
        int lo = 0, hi = size;                                 // @anchor search
        while (lo < hi) {
            int mid = (lo + hi) / 2;
            if (tails[mid] < x) lo = mid + 1;
            else hi = mid;
        }
        // The run ending at i is one longer than the run ending at owner[lo - 1],
        // so that element comes immediately before a[i] in the answer.
        prev[i] = lo > 0 ? owner[lo - 1] : -1;                 // @anchor link
        if (lo == size) { tails[size] = x; owner[size] = i; size++; }  // @anchor extend
        else { tails[lo] = x; owner[lo] = i; }                 // @anchor replace
        if (lo + 1 > best) { best = lo + 1; bestIdx = i; }
    }
    // The frontier knows the length but not the sequence; the links know both.
    int i = bestIdx;                                           // @anchor chain
    int count = 0;
    for (int k = i; k >= 0; k = prev[k]) count++;
    return count;                                              // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'The frontier starts empty, and it is worth being precise about what it holds: `tails[k]` is not the k-th element of the answer, it is the *smallest possible last element* of any increasing run of length k + 1 found so far. That difference is the whole algorithm — this array is a set of best-case endings, not a subsequence, and reading it left to right gives you nonsense.',
    python:
      'The frontier starts empty, and it is worth being precise about what it holds: `tails[k]` is the smallest possible last element of any increasing run of length k + 1 so far, not the k-th element of the answer. Keeping only the smallest is safe precisely because a smaller ending is always at least as easy to extend — that is what makes the binary search on the next line valid.',
    java: 'The frontier is preallocated to `a.length` and paired with a separate `size`, because a Java array cannot grow. `size` is the live length and every later read has to respect it: `tails[size]` is a zero from the allocation rather than a boundary, and that is precisely how a Java LIS finds a run of zeros that is not in the input.',
    cpp: 'The frontier is preallocated to a.size() and paired with `size`. Preallocation matters more here than in Java: `push_back` would be correct but reallocates every time the frontier grows, and the binary search then touches a different address after each one. The `(int)a.size()` cast in the loop condition is the signed/unsigned conversion that has to be written once and then trusted.',
  },
  search: {
    javascript:
      'The search bounds, and the invariant that makes the binary search correct: `tails` is sorted, so "the first index whose tail is >= x" is a well-defined position. Note `hi = tails.length` rather than `length - 1` — this searches for an *insertion point*, so landing one past the end is a valid answer, and the loop exits on an empty range, which is the answer rather than a failure.',
    python:
      'The search bounds, and the invariant that makes the binary search correct: `tails` is sorted, so the first index whose tail is >= x is well defined. `lo, hi = 0, len(tails)` is a tuple assignment — one statement, two names — and it is the same shape as `int lo = 0, hi = size;` in the other two compiled languages.',
    java: 'The search bounds. `int lo = 0, hi = size;` declares and initialises two locals on one line, which is legal in Java and is why the line reads as a unit. `hi` starts at `size`, not `size - 1`, because this finds an insertion point: an empty range is a valid outcome, not an out-of-bounds one.',
    cpp: 'The search bounds, and the same insertion-point subtlety: `hi` starts at `size` and the loop exits when the range is empty, and that empty range *is* the answer. `(lo + hi) / 2` is safe because both are small non-negative ints; on a large index space the overflow-free `lo + (hi - lo) / 2` form is the one you want.',
  },
  link: {
    javascript:
      'The reconstruction link, and the reason this function is not just `tails.length`. The frontier holds *values*, so it cannot say which element put a tail there — two different elements can hold the same value, and `prev[i] = lo - 1` (the tempting one-liner) links to the wrong element and quietly returns a shorter answer. `owner[lo - 1]` is the fix, and it is the bug every hand-written LIS writes first.',
    python:
      'The reconstruction link. Note the two index spaces being bridged: `lo` indexes the frontier (a run length) while `prev` is indexed by element, so the value that goes into `prev` is *not* `lo - 1` — it is `owner[lo - 1]`, the element that placed that tail. Two index spaces, one array, and a one-character mistake that yields a plausible shorter answer rather than a crash.',
    java: 'The reconstruction link, and the parallel `owner` array is not optional bookkeeping — it is what makes the answer correct. A Java implementation that stored only the tails values would link `prev[i] = lo - 1` and be wrong whenever two elements hold the same value, which is exactly the case the strict `<` comparison was supposed to make safe.',
    cpp: 'The reconstruction link, reading `owner[lo - 1]` rather than `lo - 1`. `owner` is a second preallocated vector rather than a `vector<vector<int>>`, so the two stay cache-adjacent, and both are indexed by run length while `prev` is indexed by element — the one place in this algorithm where the index spaces differ.',
  },
  extend: {
    javascript:
      'The frontier grows, and this is the only branch that makes the answer bigger. It fires exactly when the search landed one past the end, which is why "the frontier grew" and "the answer got longer" are the same event. The owner is pushed alongside the value — a second array that has to be kept in lockstep, and the reason the next line reads `owner[lo - 1]` rather than `lo - 1`.',
    python:
      'The frontier grows, and this is the only branch that makes the answer bigger. `tails.append(x)` and `owner.append(i)` are two calls that must never drift apart; forgetting the second is a bug that only shows up when two elements share a value, which is the sort of bug that survives a year of testing and then breaks on production data.',
    java: 'The frontier grows. `tails[size] = x; owner[size] = i; size++;` is three statements where the frontier values needed one, and that is the honest cost of a fixed-size array: the live length is a variable you maintain by hand, and two arrays means two writes in every branch.',
    cpp: 'The frontier grows. The braced form is needed because the branch now has two statements, and the increment is deliberately *not* inside the subscript — `tails[size++] = x` would still work, but mixing a side effect into an index is how two lines that must stay in step stop being obviously in step.',
  },
  replace: {
    javascript:
      'The frontier is overwritten and the run length does not change, because the length lives in the *index* and not in the value. Replacing a larger tail with a smaller one costs nothing and can never hurt: the old tail is never needed again, and a smaller ending is at least as easy to extend. Both arrays are overwritten together — the value *and* the element that owns it.',
    python:
      'The frontier is overwritten and the run length is unchanged. Overwriting rather than inserting is what keeps this O(1): inserting into a list would shift every later tail, and shifting is exactly the work this layout exists to avoid. `owner[lo] = i` in the same breath keeps the two arrays describing the same frontier.',
    java: 'The frontier is overwritten at index `lo`, guaranteed to be < size by the branch condition, so no bounds check is needed. Overwriting rather than inserting keeps this O(1) — a `System.arraycopy` to make room would be O(n) per element and turn an n log n algorithm into an n² one without changing a single comparison.',
    cpp: 'The frontier is overwritten at index `lo`, guaranteed < size by the branch condition. `[]` does not bounds-check, so that guarantee is load-bearing: written the other way round, a `lo` of `size` would write one past the end of a heap allocation and quietly corrupt whatever the allocator put next.',
  },
  chain: {
    javascript:
      'The walk-back, and the reason `prev` exists at all. The frontier knows how *long* the answer is and nothing about *which* values; the links know both. The chain comes out in reverse order, so it is reversed before use — and its length always equals `tails.length`, which is the cheapest possible invariant check on an implementation.',
    python:
      "The walk-back. Each `prev[i]` hop moves to the element that extended the run one step shorter, so the chain is the answer backwards and `out.reverse()` is not cosmetic. Counting the chain is the function's actual return value, which says something useful: the reconstruction is the proof, and the frontier only ever supplied the length.",
    java: 'The walk-back, and the reconstruction *is* the answer here: the function returns the number of links rather than a separately tracked length, so a bug in the links cannot hide behind a length that happened to be right. Returning the sequence instead would be an int[] plus a reversal; the length is the cheaper contract.',
    cpp: 'The walk-back, counting links rather than reading a tracked length, so the return value is derived from the same structure the animation highlights. A real implementation would push the values into a vector here and return that; the count is what makes the answer checkable without allocating.',
  },
  done: {
    javascript:
      'The answer is the chain length, and the chain is what the highlight has been drawing all along. Two things are worth noticing: the values are increasing but not adjacent, and the frontier row beneath the input is *not* the answer — it holds the smallest possible ending for each length, which is why it can be completely different from the chain and still right.',
    python:
      'The answer is `len(out)`, computed by walking the links rather than by reading `len(tails)`. The two must be equal, and a mismatch is the fastest way to find a bad `prev` or `owner` write: the frontier tracks lengths, the links track elements, and a link written with the wrong index shows up as a chain of the wrong size.',
    java: "The count of links, which equals `size` and equals the length of the longest increasing run. The subtlety for a Java reader: the input `int[]` is never modified, so unlike bubble sort there is nothing to hand back — the answer is a new value and the caller's array is exactly as it was.",
    cpp: 'The count of links. The input vector is taken by value (that is how the harness builds it) and never modified, so there is no "return the array" convention to worry about — the answer is a single int, and `size` at the end of the loop would have given the same number had the links been correct.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'lis',
    python: 'lis',
    java: 'Lis.lis',
    cpp: 'lis',
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
 * The O(n²) definition of the problem, computed directly: for every element,
 * the longest run ending there is one more than the best run ending at some
 * earlier, smaller element. A different algorithm from the frontier sweep, so
 * agreement between the two is a real check.
 */
const quadraticLis = (a: number[]): number => {
  const best = a.map(() => 1);
  let top = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < i; j++) {
      if ((a[j] as number) < (a[i] as number)) {
        best[i] = Math.max(best[i] as number, (best[j] as number) + 1);
      }
    }
    top = Math.max(top, best[i] as number);
  }
  return top;
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const values = valuesOf(p).slice(0, Math.max(1, Math.min(14, Number(p.params?.count ?? 6))));
  return { presetId: p.id, args: [values], result: quadraticLis(values) };
});

export const lisAlgo: AlgoDef<ArrayFrame> = {
  id: 'lis',
  title: 'Longest Increasing Subsequence',
  category: 'dynamic-programming',
  summary:
    'Keep a sorted frontier of the smallest possible tail for every achievable run length, binary search where the next value belongs, and link each element to its predecessor.',
  intuition:
    'Reach for it when the order of your data matters but sorting would destroy it — longest chain of dependent jobs, longest rising run in a price series, the longest set of edits that must happen in sequence. Do not reach for it because of the big-O: the quadratic version is frequently *faster* in practice below a few thousand elements, and the real argument for this one is that it hands you a *better* frontier as a side effect, so a later element is likelier to fit.',
  complexity: {
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(n)',
    note: 'Strictly increasing is required — the comparison is `<`, not `<=`, so duplicates replace rather than extend. Relaxing the comparison to non-decreasing gives the longest non-decreasing subsequence for free, which is why that is not a separate algorithm.',
  },
  traits: {
    stable: true,
    inPlace: false,
    online: false,
    offline: true,
    allowsDuplicates: true,
    tags: ['binary search', 'reconstruction', 'frontier', 'n log n'],
  },
  viewport: 'array',
  level: 'advanced',
  params: [
    {
      key: 'count',
      label: 'Elements',
      kind: 'number',
      min: 1,
      max: 14,
      step: 1,
      default: 6,
      help: 'Capped on purpose: the frontier row and the chain highlights stop being readable past about a dozen.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: lis,
  lesson,
  expectations,
  formatResult: (r) => `length ${r as number}`,
  anchors: ['start', 'search', 'link', 'extend', 'replace', 'chain', 'done'],
};

export default lisAlgo;
