import { byLanguage } from '../../code/anchors.ts';
import { randomArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { ArrayFrame, CellValue, Highlight } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Top K Frequent Elements — a frequency table, and the tie-break nobody tells
 * you about.
 *
 * ## The rule, stated once, and it must be identical in all four listings
 *
 * > Rank by **count descending**, and break an equal count by **first appearance
 * > in the input ascending**.
 *
 * The second clause is not decoration. When two values have the same frequency
 * the data does not say which comes first — the input is a bag of occurrences,
 * not a ranking — so without an explicit rule the *answer is not determined*.
 * That is not a philosophical point: a real implementation that omitted it would
 * return `[8, 5]` on one run and `[5, 8]` on the next, purely because a hash
 * table's iteration order changed. `java.util.HashMap` and
 * `std::unordered_map` make no ordering promise at all, `dict` and `Map` do
 * promise insertion order, and relying on that difference is how a Python
 * implementation and a Java implementation of the same function end up
 * disagreeing. The `all-ties` preset exists so that the rule is not optional: it
 * is four values, each appearing three times, and nothing but the tie-break
 * decides the answer.
 *
 * The rule also has to make the comparison a **total** order, which it does —
 * no two distinct values share a first-appearance index — and that is what makes
 * the answer independent of the order the candidates are visited in. The
 * generator walks them in first-appearance order anyway, because that is the
 * order that makes the animation legible, and the C++ listing has to keep that
 * order by hand because `std::map` is sorted by *value*.
 *
 * ## Why there is an overlay row
 *
 * The main row is the input, and it never changes — that is the point of a
 * counting pass. Without a second row the student would see "7 again" forty
 * times and never watch `count[7]` climb from 1 to 2 to 3, which is the entire
 * reason the table exists. Worse, the *selection* pass reads only from the
 * table, so a trace with no table would show an algorithm making a decision
 * about data the student cannot see. `ArrayFrame.overlay` is exactly "a second
 * row of cells beneath the main one", so the frequency table goes there: one
 * cell per distinct value, in the order the values were first seen, each cell
 * reading `7×3`. It grows as the scan discovers values, which is the shape of
 * the data structure being made visible.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 *
 * Most of these are built from an exact *frequency profile* at seeded positions.
 * That is deliberate: this algorithm's behaviour is a function of the frequency
 * profile and the first-appearance order, and both have to be controlled
 * exactly. A plain `randomArray` of 15 values gives a profile nobody can
 * predict, and the tie-break — the only interesting decision in the algorithm —
 * would then be decided by noise. The profile fixes the counts; the seed varies
 * the order, so no two presets share a first-appearance sequence.
 * ------------------------------------------------------------------ */

/**
 * An array with an exact count per value, placed at a seeded permutation of
 * positions.
 *
 * The values are consecutive integers from 5 upwards, one per profile entry, so
 * the notes can talk about "7 appears three times" instead of "the value at
 * slot 2". The *order the values first appear in* comes from the seed, which is
 * what the tie-break keys on — so the profile is fixed and the tie is not.
 */
function profileArray(seed: number, profile: number[]): number[] {
  const total = profile.reduce((a, b) => a + b, 0);
  // A bucket list: value j repeated profile[j] times, then a seeded permutation
  // of it. Sorting the indices by their random keys is a Fisher-Yates that uses
  // the shared generator rather than a second RNG.
  const bucket: number[] = [];
  profile.forEach((count, j) => {
    for (let t = 0; t < count; t++) bucket.push(j);
  });
  const keys = randomArray(seed, Math.max(1, total), 0, 9999);
  const order = bucket.map((_, i) => i).sort((a, b) => (keys[a] ?? 0) - (keys[b] ?? 0));
  return order.map((i) => 5 + (bucket[i] ?? 0));
}

const PRESETS: Preset[] = [
  {
    id: 'clear-winner',
    label: 'No ties at all, k = 3',
    blurb:
      'Five values with five different counts — 5 appears five times, 6 four times, 7 three, 8 twice, 9 once. There is not a single tie anywhere in this input, so the ranking is completely determined by the data and the tie-break rule is never consulted. That is what a "sane" input looks like, and it is why the next preset exists.',
    input: { type: 'numbers', values: profileArray(11, [5, 4, 3, 2, 1]) },
    params: { k: 3 },
  },
  {
    id: 'all-ties',
    label: 'Every value tied, k = 2',
    blurb:
      'Four values, each appearing exactly three times, and a request for two. Every comparison is a tie on count, so the answer is decided entirely by the tie-break: the two values that appear earliest in the input, 5 at index 0 and 6 at index 1. Nothing here is implied by the frequencies — the frequencies are identical. This is the preset that makes the rule non-optional, and it is why the rule is stated identically in all four listings.',
    input: { type: 'numbers', values: profileArray(21, [3, 3, 3, 3]) },
    params: { k: 2 },
  },
  {
    id: 'k-of-one',
    label: 'k = 1, all tied',
    blurb:
      'Three values, all appearing twice, and a request for a single winner. The most common interview phrasing of the same question, and the sharpest version of it: "the most frequent element" is not well defined here, so the implementation has to decide, and the decision has to be written down. The winner is 5, purely because it appears at index 0.',
    input: { type: 'numbers', values: profileArray(31, [2, 2, 2]) },
    params: { k: 1 },
  },
  {
    id: 'k-equals-distinct',
    label: 'k = the number of distinct values',
    blurb:
      'Four distinct values with k = 4, so nothing is ever discarded and the `evict` branch never runs. Use it to see the *order* the answer comes back in: 7 first on three occurrences, then 5 and 6 tied on two — 5 before 6, decided by the tie-break — and 8 last on one. The same rule that decides what to keep also decides how the answer is ordered.',
    input: { type: 'numbers', values: profileArray(41, [2, 2, 3, 1]) },
    params: { k: 4 },
  },
  {
    id: 'dominant',
    label: 'One value dominates, k = 2',
    blurb:
      'Eleven occurrences, of which 11 accounts for five, and six other values appear once each. Watch the running answer be wrong twice before the data corrects it: 8 arrives first and takes a slot on a single occurrence, 6 arrives second and takes the other, and 11 arrives third and evicts 6. Second place then goes to 8 — the earliest of six values that are all equally rare, which is the least informative answer a top-k query can give and a fair thing to notice.',
    input: { type: 'numbers', values: profileArray(64, [1, 1, 1, 1, 1, 1, 5]) },
    params: { k: 2 },
  },
  {
    id: 'single-value',
    label: 'One element, k = 1',
    blurb:
      'A single element, hand-written because a generated one would be indistinguishable. The table gains one entry, the selection pass has nothing to compare it against, and the answer is the element itself. It is the degenerate case that catches the two easy mistakes: a result array initialised to `[]` with no push, and a "no distinct values" special case that mistakes an empty table for a failure.',
    input: { type: 'numbers', values: [42] },
    params: { k: 1 },
  },
  {
    id: 'empty',
    label: 'Empty input, k = 2',
    blurb:
      'Nothing at all, and the answer is an empty list rather than an error. Every language has to survive this: Python returns a list, Java and C++ have to size an array from an empty collection, and a JavaScript `Math.max(...[])` would quietly answer -Infinity rather than throw. Worth seeing once, because "top 2 of nothing" is a question real code does get asked.',
    input: { type: 'numbers', values: [] },
    params: { k: 2 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

/**
 * Drop empty groups. A legend entry reading "visited 0" is noise, and an empty
 * group is not on screen, so it must not be counted as a colour either.
 */
function visible(groups: Highlight): Highlight {
  const out: Highlight = {};
  for (const [key, list] of Object.entries(groups)) {
    if (list.length > 0) out[key] = list;
  }
  return out;
}

const ids = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
/** `0..to-1`, spelled so the intent survives `noUncheckedIndexedAccess`. */
const range = (from: number, to: number): number[] => (to <= from ? [] : ids(to - from));

export function* topKFrequent(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const values: CellValue[] = [...source];
  const n = values.length;
  // `k` is clamped to 1 rather than trusted: a `kind: 'number'` param can be
  // typed as 0, and "top 0 of anything" is a legitimate request whose answer is
  // an empty list, not a crash.
  const k = Math.max(1, Math.round(Number(ctx.params.k ?? 1)));

  /** The frequency table. Insertion order is the first-appearance order. */
  const count = new Map<number, number>();
  const firstAt = new Map<number, number>();
  /** The running answer, at most k long, kept in final answer order. */
  const top: number[] = [];
  let ops = 0;

  /** `7×3` — the overlay cell for one table entry. */
  const cell = (v: number): string => `${v}×${count.get(v) ?? 0}`;

  /**
   * The rule, as a comparator: count descending, then first appearance
   * ascending. Written once here and mirrored, character for character in
   * meaning, by the four listings. `sort` in JavaScript and `list.sort` in
   * Python are both stable, so neither *needs* the second clause; `std::sort` is
   * not stable and absolutely does.
   */
  const rank = (x: number, y: number): number => {
    const cx = count.get(x) ?? 0;
    const cy = count.get(y) ?? 0;
    if (cx !== cy) return cy - cx;
    return (firstAt.get(x) ?? 0) - (firstAt.get(y) ?? 0);
  };

  /** Every input index holding `v` — the bridge from a value back to the row. */
  const indicesOf = (v: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) if (values[i] === v) out.push(i);
    return out;
  };

  const pickedIndices = (): number[] => {
    const out: number[] = [];
    for (const v of top) out.push(...indicesOf(v));
    return out;
  };

  const snap = (
    anchor: string,
    note: string,
    o: {
      caption?: string;
      ops?: number;
      vars?: Record<string, CellValue | boolean>;
      highlight?: Highlight;
      pointers?: Record<string, number>;
      overlayPointers?: Record<string, number>;
      result?: string;
    } = {},
  ): ArrayFrame => ({
    kind: 'array',
    index: 0, // the materialiser owns this one
    anchor,
    note,
    values: [...values],
    mode: 'number',
    overlay: {
      label: 'frequency table (value×count)',
      // A fresh array every frame: these are the same strings, but they are a
      // snapshot too, and a shared reference would let a later frame's write
      // show up in an earlier one.
      values: [...count.keys()].map(cell),
      mode: 'string',
      ...(o.overlayPointers === undefined ? {} : { pointers: o.overlayPointers }),
    },
    ...(o.caption === undefined ? {} : { caption: o.caption }),
    ...(o.ops === undefined ? {} : { ops: o.ops }),
    ...(o.vars === undefined ? {} : { vars: o.vars }),
    ...(o.highlight === undefined ? {} : { highlight: visible(o.highlight) }),
    ...(o.pointers === undefined ? {} : { pointers: o.pointers }),
    ...(o.result === undefined ? {} : { result: o.result }),
  });

  yield snap(
    'start',
    n === 0
      ? 'Nothing to count, so the table stays empty and the answer is an empty list rather than an error. The pass below never runs and the k = 2 request is simply unanswered.'
      : `${n} value${n === 1 ? '' : 's'} to count, and the top ${k} wanted. Two passes: first count every value into a frequency table, then pick the k best out of it. Nothing in the array moves — the main row is the input, and the second row below it is the table being built.`,
    {
      caption: `k = ${k} of ${n}`,
      ops,
      highlight: { unvisited: ids(n) },
      vars: { n, k, distinct: 0, ops },
    },
  );

  /* ---- pass 1: count ---- */

  for (let i = 0; i < n; i++) {
    if (ctx.shouldStop()) return;
    ops++;
    const v = values[i] as number;
    const before = count.get(v);
    const known = before !== undefined;

    yield snap(
      'scan',
      known
        ? `Index ${i} holds ${v}, and the table already has it: ${before} so far. The lookup is the whole cost — one hash, one bucket, a walk down that bucket's chain — and it is what makes this pass O(n) instead of the O(n²) a "for each value, rescan the whole input" implementation would be.`
        : `Index ${i} holds ${v}, and the table has never seen it. A miss costs the same as a hit, which is the property that makes counting a linear pass rather than a nested one. ${count.size} distinct value${count.size === 1 ? '' : 's'} so far.`,
      {
        caption: `counting · index ${i} of ${n - 1}`,
        ops,
        highlight: { current: [i], visited: range(0, i) },
        pointers: { i },
        overlayPointers: known ? { v: [...count.keys()].indexOf(v) } : {},
        vars: { i, v, n, k, distinct: count.size, ops },
      },
    );

    if (known) {
      yield snap(
        'existing',
        `${v} is already in the table at ${before} occurrence${before === 1 ? '' : 's'}, so the next line only increments. The key keeps its original position in the table — a re-assignment never moves a Map or dict entry to the end — which is exactly why the table doubles as the record of first appearance.`,
        {
          caption: `counting · index ${i} of ${n - 1}`,
          ops,
          highlight: { current: [i], visited: range(0, i) },
          pointers: { i },
          overlayPointers: { v: [...count.keys()].indexOf(v) },
          vars: { i, v, n, k, count: before, distinct: count.size },
        },
      );
    }

    count.set(v, (before ?? 0) + 1);
    if (!known) firstAt.set(v, i);

    yield snap(
      'count',
      known
        ? `${v} goes to ${(before as number) + 1}. Nothing new enters the table: the key already existed, so the table is still ${count.size} entries and the only thing that moved is a number inside one of them.`
        : `${v} is written into the table with a count of 1, at first-seen position ${i}. New keys are appended, so the table's order is the order the values appeared in — which is not an accident, it is the tie-break rule's data.`,
      {
        caption: known
          ? `counting · ${v} is at ${(before as number) + 1}`
          : `counting · new value ${v}`,
        ops,
        highlight: { current: [i], visited: range(0, i) },
        pointers: { i },
        overlayPointers: { v: [...count.keys()].indexOf(v) },
        vars: known
          ? { i, v, n, k, count: (before as number) + 1, distinct: count.size }
          : { i, v, n, k, count: 1, distinct: count.size },
      },
    );
  }

  /* ---- pass 2: select ---- */

  const candidates = [...count.keys()];
  const distinct = candidates.length;

  yield snap(
    'select',
    distinct === 0
      ? 'The table is empty, so there is nothing to weigh against anything and the answer is the empty list. A selection pass that assumed a non-empty table would be off by one here, which is the whole content of the empty preset.'
      : `The count is done: ${distinct} distinct value${distinct === 1 ? '' : 's'} in the table, and ${ops} lookup${ops === 1 ? '' : 's'} so far. The selection pass now walks the keys in first-appearance order and asks one question per key — is this value better than the current k-th best? — keeping only the answer. No full sort is needed, and the k-th best only ever improves, so a candidate that loses once is out for good.`,
    {
      caption: `selecting · ${distinct} distinct`,
      ops,
      highlight: { picked: pickedIndices() },
      vars: { n, k, distinct, ops },
    },
  );

  for (let c = 0; c < distinct; c++) {
    if (ctx.shouldStop()) return;
    const v = candidates[c] as number;
    const cv = count.get(v) ?? 0;
    const fv = firstAt.get(v) ?? 0;
    const full = top.length === k;
    const last = full ? (top[top.length - 1] as number) : undefined;
    const enters = !full || rank(v, last as number) < 0;

    if (enters) {
      yield snap(
        'select',
        full
          ? `Weigh ${v} (${cv} occurrence${cv === 1 ? '' : 's'}, first seen at index ${fv}) against the k-th best, ${last} (${count.get(last as number)} occurrence${count.get(last as number) === 1 ? '' : 's'}, first seen at index ${firstAt.get(last as number)}). ${cv > (count.get(last as number) as number) ? `More occurrences, so ${v} wins outright and the comparison never reaches the tie-break.` : cv < (count.get(last as number) as number) ? `Fewer occurrences, so ${v} loses outright.` : `The counts are equal at ${cv}, so the tie-break decides: ${fv} < ${firstAt.get(last as number)} means ${v} appeared earlier, so ${v} wins.`}`
          : `The answer holds ${top.length} of ${k}, so there is no k-th best to beat yet and ${v} simply takes the next free slot. This is the "the list is not full" half of the same decision — with one comparison instead of two, and no tie-break needed.`,
        {
          caption: `selecting · ${v} into [${top.join(', ')}]`,
          ops,
          highlight: { compare: indicesOf(v), picked: pickedIndices() },
          overlayPointers: { v: c },
          vars: { n, k, distinct, candidate: v, c, best: last ?? 0, ops },
        },
      );

      top.push(v);
      top.sort(rank);
      const wasFull = full;

      yield snap(
        'insert',
        `${v} joins the answer, which is now [${top.join(', ')}] — kept in answer order, most frequent first, so the ordering is free rather than a second thing to compute. ${wasFull ? `The list has briefly outgrown k, and the next line is what puts it back.` : `${k - top.length} slot${k - top.length === 1 ? '' : 's'} still free.`}`,
        {
          caption: `selecting · [${top.join(', ')}]`,
          ops,
          highlight: { compare: indicesOf(v), picked: pickedIndices() },
          overlayPointers: { v: c },
          vars: { n, k, distinct, kept: top.length, ops },
        },
      );

      if (top.length > k) {
        const out = top.pop() as number;
        yield snap(
          'evict',
          `${out} came off the end: it is the least of the ${k + 1} values now held, and the answer is [${top.join(', ')}]. Two things worth being clear about. ${out} is still in the frequency table — only the *selection* dropped it, and its count never changed. And it can never come back: the k-th best can only improve as more candidates are weighed, so a value that lost to it has already lost.`,
          {
            caption: `selecting · [${top.join(', ')}]`,
            ops,
            highlight: { compare: indicesOf(out), picked: pickedIndices() },
            overlayPointers: { v: c },
            vars: { n, k, distinct, kept: top.length, dropped: out, ops },
          },
        );
      }
      continue;
    }

    yield snap(
      'select',
      `${v} (${cv} occurrence${cv === 1 ? '' : 's'}, first at index ${fv}) is weighed against the k-th best ${last} (${count.get(last as number)} occurrence${count.get(last as number) === 1 ? '' : 's'}, first at index ${firstAt.get(last as number)}) and loses: ${cv < (count.get(last as number) as number) ? 'fewer occurrences' : `an equal count, and ${fv} is later than ${firstAt.get(last as number)}, so the tie-break goes against it`}. It is out of the answer for good — the k-th best only improves, so nothing later can re-open this. ${top.length} of ${k} slots filled.`,
      {
        caption: `selecting · ${v} rejected`,
        ops,
        highlight: { compare: indicesOf(v), picked: pickedIndices() },
        overlayPointers: { v: c },
        vars: { n, k, distinct, candidate: v, c, best: last ?? 0, ops },
      },
    );
  }

  const answer = [...top];
  yield snap(
    'done',
    answer.length === 0
      ? `Nothing was ever inserted, so the answer is the empty list. ${ops} lookup${ops === 1 ? '' : 's'} on an input of ${n} value${n === 1 ? '' : 's'}: the degenerate case, and the one where a "no result" special case is worth having rather than a crash.`
      : `The answer is [${answer.join(', ')}]: ${answer.map((v) => `${v} (${count.get(v)})`).join(', ')}. Counting took one linear pass — ${n} lookup${n === 1 ? '' : 's'} — and the selection pass weighed ${distinct} candidate${distinct === 1 ? '' : 's'} against a running answer of at most ${k}, so no candidate list is ever sorted in full. Ties were broken by first appearance throughout, which is a rule this implementation had to be told, not one the data provided.`,
    {
      caption: `top ${answer.length} of ${distinct}`,
      ops,
      // `output` rather than `picked`: the working state is green and the answer
      // is yellow, so the last frame is visibly a different kind of statement
      // from the ones before it.
      highlight: { output: pickedIndices() },
      result: answer.join(', '),
      vars: { n, k, distinct, kept: answer.length, ops },
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

const JS = `function topK(a, k) {
  // One entry per distinct value, holding how many times it occurs and where it
  // was first seen. Insertion order is the first-appearance order.
  const seen = new Map();                          // @anchor start  value -> { count, first }
  for (let i = 0; i < a.length; i++) {             // @anchor scan
    const v = a[i];
    const e = seen.get(v);
    if (e) {
      e.count = e.count + 1;                       // @anchor existing
    } else {
      seen.set(v, { count: 1, first: i });         // @anchor count
    }
  }

  // THE TIE-BREAK RULE, and it must be identical in all four listings:
  // higher count first, and on an equal count the value seen EARLIEST wins.
  // Without the second clause the answer is not determined by the data.
  const rank = (x, y) => {
    if (seen.get(x).count !== seen.get(y).count) return seen.get(y).count - seen.get(x).count;
    return seen.get(x).first - seen.get(y).first;
  };

  const top = [];                                  // at most k, in answer order
  for (const v of seen.keys()) {                   // candidates, first-seen first
    if (top.length === k && rank(v, top[top.length - 1]) >= 0) continue;  // @anchor select
    top.push(v);                                   // @anchor insert
    top.sort(rank);
    if (top.length > k) top.pop();                 // @anchor evict
  }
  return top;                                      // @anchor done
}`;

const PY = `from functools import cmp_to_key


def top_k(a, k):
    # One entry per distinct value: [how many times it occurs, where it was
    # first seen]. A list rather than a tuple, because tuples are immutable and
    # the count has to change in place.
    seen = {}                                      # @anchor start  value -> [count, first]
    for i, v in enumerate(a):                      # @anchor scan
        e = seen.get(v)
        if e is not None:
            e[0] += 1                             # @anchor existing
        else:
            seen[v] = [1, i]                       # @anchor count

    # THE TIE-BREAK RULE, and it must be identical in all four listings:
    # higher count first, and on an equal count the value seen EARLIEST wins.
    # Without the second clause the answer is not determined by the data.
    def rank(x, y):
        if seen[x][0] != seen[y][0]:
            return seen[y][0] - seen[x][0]
        return seen[x][1] - seen[y][1]

    top = []                                       # at most k, in answer order
    for v in seen:                                 # candidates, first-seen first
        if len(top) == k and rank(v, top[-1]) >= 0:
            continue                               # @anchor select
        top.append(v)                              # @anchor insert
        top.sort(key=cmp_to_key(rank))
        if len(top) > k:
            top.pop()                              # @anchor evict
    return top                                     # @anchor done`;

const JAVA = `import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

class TopKFrequent {
    static int[] topK(int[] a, int k) {
        // One entry per distinct value: { occurrences, first-seen index }. An
        // int[] rather than a record, because the count has to change in place.
        Map<Integer, int[]> seen = new LinkedHashMap<>();  // @anchor start
        for (int i = 0; i < a.length; i++) {              // @anchor scan
            int v = a[i];
            int[] e = seen.get(v);
            if (e != null) {
                e[0] += 1;                                // @anchor existing
            } else {
                seen.put(v, new int[] { 1, i });           // @anchor count
            }
        }

        // THE TIE-BREAK RULE, and it must be identical in all four listings:
        // higher count first, and on an equal count the value seen EARLIEST wins.
        // Without the second clause the answer is not determined by the data.
        Comparator<Integer> rank = (x, y) -> {
            if (seen.get(x)[0] != seen.get(y)[0]) return seen.get(y)[0] - seen.get(x)[0];
            return seen.get(x)[1] - seen.get(y)[1];
        };

        List<Integer> top = new ArrayList<>();     // at most k, in answer order
        for (int v : seen.keySet()) {               // candidates, first-seen first
            if (top.size() == k && rank.compare(v, top.get(top.size() - 1)) >= 0) {
                continue;                          // @anchor select
            }
            top.add(v);                            // @anchor insert
            top.sort(rank);
            if (top.size() > k) {
                top.remove(top.size() - 1);         // @anchor evict
            }
        }
        int[] out = new int[top.size()];            // @anchor done
        for (int i = 0; i < top.size(); i++) out[i] = top.get(i);
        return out;
    }
}`;

const CPP = `#include <algorithm>
#include <map>
#include <utility>
#include <vector>
using std::map;
using std::pair;
using std::vector;

// One entry per distinct value: { occurrences, first-seen index }.
struct Entry {
    int count;
    int first;
};

vector<int> top_k(const vector<int>& a, int k) {
    // std::map is ordered by VALUE, which is not the tie-break order, so the
    // first-appearance order is kept by hand in \`order\`. The other three
    // listings get it free from their maps.
    map<int, Entry> seen;                          // @anchor start  value -> { count, first }
    vector<int> order;
    for (int i = 0; i < (int)a.size(); i++) {      // @anchor scan
        int v = a[i];
        auto it = seen.find(v);                    // find, not operator[]: the
        if (it != seen.end()) {                    // read must not insert
            it->second.count += 1;                 // @anchor existing
        } else {
            seen[v] = Entry{ 1, i };               // @anchor count
            order.push_back(v);
        }
    }

    // THE TIE-BREAK RULE, and it must be identical in all four listings:
    // higher count first, and on an equal count the value seen EARLIEST wins.
    // Without the second clause the answer is not determined by the data --
    // and std::sort is not stable, so the clause is load-bearing here.
    auto rank = [&](int x, int y) {
        if (seen[x].count != seen[y].count) return seen[x].count > seen[y].count;
        return seen[x].first < seen[y].first;
    };

    vector<int> top;                               // at most k, in answer order
    for (int v : order) {                          // candidates, first-seen first
        if ((int)top.size() == k && !rank(v, top[top.size() - 1])) continue;  // @anchor select
        top.push_back(v);                          // @anchor insert
        sort(top.begin(), top.end(), rank);
        if ((int)top.size() > k) top.pop_back();    // @anchor evict
    }
    return top;                                    // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'An empty `Map` from value to a two-field record, and the choice of record is load-bearing: the count has to change *in place* later, so the map stores an object rather than a number. A `seen.get(v).count += 1` works because the object is shared by reference — write `const copy = { ...e }` and the increment lands nowhere.',
    python:
      'A dict whose values are two-element **lists**, not tuples. Tuples are immutable, so `[1, i]` is the only shape that lets the existing branch mutate in place; a tuple version would have to rebuild the entry, which allocates on every repeat and is the reason this line does not read `seen[v] = (1, i)`.',
    java: 'A `LinkedHashMap`, not a `HashMap` — and that is the whole reason the class is named that way. `HashMap` makes no ordering promise, so "the values in the order they first appeared" would be a false statement about it; `LinkedHashMap` keeps insertion order and that is exactly the order the tie-break needs.',
    cpp: 'A `std::map<int, Entry>`, and its ordering is by *value*, which is the wrong order for this algorithm — so the first-appearance order is kept separately in `order`, a vector that only ever grows. This is the one place the four listings differ in shape rather than syntax, and it changes nothing: the comparison below is a total order, so candidate order cannot affect the answer.',
  },
  scan: {
    javascript:
      'The counting pass, and `a[i]` is the only read. Nothing in the input is ever written, which is what makes the main row of the animation a still image while the second row does all the moving.',
    python:
      '`enumerate(a)` rather than an index counter, so `i` and `v` are produced together and cannot disagree. The pass is O(n) and the array is untouched; every cost in this algorithm lives in the map lookup, not in the loop.',
    java: 'The same single pass, with `int v = a[i]` hoisted so the boxing for the `get` happens once per iteration instead of once per use. Java arrays are fixed size but their elements are not, so this passes for in-place work in general — this algorithm just does not need it.',
    cpp: 'A range-free loop over `(int)a.size()`, so the bound is evaluated once and a `size_t`/`int` mismatch never appears. `a` arrives by `const&`, so no copy of the input is made — the count table is the only memory this costs.',
  },
  existing: {
    javascript:
      'The key was found, so the entry object is mutated in place and the map keeps exactly as many entries as it had. This is the difference between O(n) and O(n²): the alternative of counting by rescanning the prefix for every new occurrence is the same question asked the slow way.',
    python:
      '`e[0] += 1` mutates the list stored in the dict, which reaches all the way back into `seen` because there is only ever one of them. `if e:` would happen to work here — a two-element list is always truthy, even `[0, 0]` — but `is not None` is the habit worth keeping, because a one-element list would be falsy.',
    java: '`e[0] += 1` writes through the `int[]` the map holds, so the map is never re-`put`. That matters: `put` on an existing key is legal but pointless work, and a version that re-`put` a fresh array would allocate on every single occurrence.',
    cpp: '`it->second.count += 1` through the iterator, which stays valid because nothing has been inserted. Using `seen[v].count` here instead of `find` would be the classic `unordered_map` bug in reverse — the read would insert a default entry for a value that was supposed to be absent, and the table would grow on every miss.',
  },
  count: {
    javascript:
      'A brand-new key with a count of 1 and its first-seen index. Both fields are written here because this is the only moment the first-seen index is knowable; every later occurrence must leave it alone, which is what makes it a usable tie-break.',
    python:
      '`seen[v] = [1, i]` does three things at once: inserts the key, sets the count to 1, and records where the value first appeared. Splitting it across three lines would be more readable and would give the tie-break rule a second place to go wrong.',
    java: '`new int[] { 1, i }` allocates the two-field record. There is no `struct`, so a two-element array is the smallest mutable thing available; the cost is one allocation per *distinct value*, not per occurrence, which is the right way round.',
    cpp: '`seen[v] = Entry{ 1, i }` uses `operator[]`, which is correct here precisely because we do want the insert — the same operator on the previous line would have been the bug. `order.push_back(v)` has no anchor of its own because it is bookkeeping, not a step.',
  },
  select: {
    javascript:
      'The weigh-in, and the only comparison the algorithm makes. `rank` is the tie-break rule itself: unequal counts fall out on the first clause, and an equal count falls through to first-seen. Because the comparison is a total order — no two values share a first-seen index — a candidate that loses here can never win later.',
    python:
      'The `len(top) == k` half matters as much as the comparison: while the answer is not full there is nothing to beat, and comparing against `top[-1]` would raise `IndexError` on the very first candidate. Python reaches `top[-1]` rather than `top[len(top)-1]` for the obvious reason, and the negative index is also the idiomatic "last element".',
    java: '`rank.compare(v, top.get(top.size() - 1))` is `>= 0` to reject, which keeps the "reject" reading of the comparator. `Comparator` returns an `int` and cannot throw on this input, but a comparator that read `seen.get(x)` for an absent key would return `null` and then throw on unboxing — the type system does not catch that one.',
    cpp: '`!rank(v, top.back())` inverts the JavaScript `>= 0`, because the C++ comparator returns a *bool* — "x outranks y" — rather than a signed distance. Writing it as a sign-returning comparator to match the other three would be a translation error waiting to happen, so the note is here rather than in a comment.',
  },
  insert: {
    javascript:
      'One `push` plus a `sort`, so the answer list is *always* in final order and the final frame needs no ordering step of its own. Re-sorting a list of at most k+1 elements on every insertion is not a performance concern; it is what removes a whole class of bug.',
    python:
      '`top.sort(key=cmp_to_key(rank))`, and the adapter is the whole Python-specific story: `list.sort` takes a **key function**, called once per element, and compares the results — so handing it a two-argument comparator raises `TypeError` rather than misbehaving. `cmp_to_key` wraps a comparator into a key that returns an object with `__lt__`, which is how a two-argument comparison gets through a one-argument interface.',
    java: '`top.sort(rank)` takes the `Comparator` directly — no wrapper, no lambda. `List.sort` is a stable merge sort, so it would already have kept equal elements in first-seen order; the tie-break clause is still required, because relying on a stability guarantee is not the same as stating the rule.',
    cpp: '`sort(top.begin(), top.end(), rank)` re-sorts the whole list on every insertion, and `std::sort` is an introsort that is **not** stable — so with a count-only comparator this line would return tied values in an order that depends on the size of the array and its initial layout. The first-seen clause is what makes that impossible rather than merely unlikely.',
  },
  evict: {
    javascript:
      'The tail comes off, and the list is back to k. Note what is *not* undone: the value stays in `seen`, so its count is still correct — only the selection dropped it. That separation is why the second pass is cheap: it never has to recompute or re-examine anything.',
    python:
      '`top.pop()` discards the return value, which is safe because the value is still in `seen`. `top.pop(-1)` would be equivalent and is the spelling that makes "the tail" explicit; `del top[-1]` is also legal and reads as "delete this element" rather than "return and discard".',
    java: '`top.remove(top.size() - 1)` rather than `top.remove(Integer)`, because there is a real overload trap here: `remove(int)` takes an *index* while `remove(Object)` takes the value, and a boxed `Integer` argument resolves to the index version. Getting it wrong deletes the wrong element and throws nothing.',
    cpp: '`top.pop_back()` on a `std::vector`, which is why the container is a vector rather than a `std::set` or `std::multiset`: a sorted set would de-duplicate equal keys, and there are no equal keys here only by construction — a value cannot appear twice in the answer, which is a property worth being able to assert.',
  },
  done: {
    javascript:
      'The array of values, in answer order, and nothing else — no counts, no indices. The caller who wants the counts has them: they are one lookup each. Returning the indices instead would be a defensible design and a different question, and it would make this function a two-pointer problem rather than a counting one.',
    python:
      'A list of ints, which the driver serialises directly. Returning a tuple would also work — the driver converts it — but a list is the type a caller will actually append to, and the function returns a fresh list every call rather than a shared default, so two calls cannot interfere.',
    java: 'Unboxed into a fresh `int[]`, sized from `top.size()` *after* the loop, so the empty-input case produces a zero-length array rather than a null. `new int[top.size()]` is legal with size 0; `new int[0]` is a special case in some older runtimes, which is a portability wart nobody should have to think about.',
    cpp: "A `vector<int>` by value, and a returned local is moved rather than copied under C++17, so returning `top` costs nothing. `const&` would be wrong here — it would dangle the moment the caller's next statement ran — and returning `top` rather than a reference is the whole reason the local can be reused as the working buffer during the loop.",
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'topK',
    python: 'top_k',
    java: 'TopKFrequent.topK',
    cpp: 'top_k',
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
 * The independent reference.
 *
 * THE TIE-BREAK RULE, stated once and repeated nowhere else in this file's
 * arithmetic: rank by count descending, and break an equal count by first
 * appearance ascending.
 *
 * Deliberately a *different route* from the generator: it sorts every distinct
 * value once and takes the first k, where the generator keeps a running answer
 * of at most k and re-sorts only that. Two different algorithms, one stated rule,
 * and the parity harness runs the four listings against this, so a listing that
 * drops the tie-break clause fails here rather than in production.
 */
export function referenceTopK(values: number[], k: number): number[] {
  const total: number[] = [];
  const counts = new Map<number, number>();
  const firsts = new Map<number, number>();
  for (let i = 0; i < values.length; i++) {
    const v = values[i] as number;
    if (!counts.has(v)) {
      counts.set(v, 0);
      firsts.set(v, i);
      total.push(v);
    }
    counts.set(v, (counts.get(v) as number) + 1);
  }
  total.sort((x, y) => {
    const cx = counts.get(x) as number;
    const cy = counts.get(y) as number;
    if (cx !== cy) return cy - cx;
    return (firsts.get(x) as number) - (firsts.get(y) as number);
  });
  return total.slice(0, Math.max(0, k));
}

const valuesOf = (p: Preset): number[] => (p.input.type === 'numbers' ? p.input.values : []);

const expectations: Expectation[] = PRESETS.map((p) => {
  const values = valuesOf(p);
  const k = Math.max(1, Math.round(Number(p.params?.k ?? 1)));
  return { presetId: p.id, args: [values, k], result: referenceTopK(values, k) };
});

export const topKFrequentAlgo: AlgoDef<ArrayFrame> = {
  id: 'top-k-frequent',
  title: 'Top K Frequent Elements',
  category: 'hashing',
  summary:
    'Count every value into a frequency table, then keep the k with the highest counts, breaking an equal count by whichever value appeared earliest in the input.',
  intuition:
    'Reach for this when the question is "what shows up most here" and the input is too big to sort: log lines, a vocabulary you want the head of, a leaderboard, "which three tags am I overusing". The counting pass is the reusable part and is worth stealing on its own — it is the standard way to turn "are these two multisets the same" into two O(n) passes with O(distinct) memory, and the same table answers "how many distinct values", "which appears exactly once" and "what is the mode". Two honest warnings: the table is O(distinct) memory, so for one mode only, Boyer-Moore uses constant space; and if you need a full ordering rather than the head of it, sort.',
  complexity: {
    best: 'O(n)',
    average: 'O(n + d·log d)',
    worst: 'O(n + d·log d)',
    space: 'O(d)',
    note: 'd is the number of distinct values. The counting pass is O(n) on a good hash, and the selection pass is O(d log d) in these listings because each insertion re-sorts the answer — O(d log k) with a real heap, which matters when k is 1 and d is millions. The caveat nobody mentions is the tie-break: on equal counts the answer is *not* determined by the data, so the rule — higher count first, and on a tie the value seen earliest in the input — is a decision this implementation has to make out loud. It is stated identically in all four listings, because that is what makes the four agree rather than each returning a valid answer of its own.',
  },
  traits: {
    // `stable` is a sorting claim and is deliberately absent. What *is* true
    // here is narrower and more useful: the answer is fully determined, because
    // the tie-break is a total order rather than whatever the hash table's
    // iteration order happened to be.
    inPlace: false,
    online: false,
    offline: true,
    tags: [
      'counting',
      'one pass',
      'frequency map',
      'top-k',
      'rule: count desc, first-seen asc',
      'answer is fully determined',
    ],
  },
  viewport: 'array',
  level: 'intermediate',
  params: [
    {
      key: 'k',
      label: 'How many (k)',
      kind: 'number',
      min: 1,
      max: 12,
      step: 1,
      default: 2,
      help: 'Ask for more than there are distinct values and the answer is simply all of them — worth seeing once, because a "return exactly k" version has to invent something.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: topKFrequent,
  lesson,
  expectations,
  formatResult: (r) => {
    const top = r as number[];
    return top.length === 0 ? 'no values' : `top ${top.length}: [${top.join(', ')}]`;
  },
  anchors: ['start', 'scan', 'existing', 'count', 'select', 'insert', 'evict', 'done'],
};

export default topKFrequentAlgo;
