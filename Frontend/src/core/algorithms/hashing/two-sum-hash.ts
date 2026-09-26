import { byLanguage } from '../../code/anchors.ts';
import { arrayWithPairSum, distinctArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { HashFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Two Sum with a hash map — the same problem the two-pointers version solves, at
 * the opposite end of the trade-off.
 *
 * The two-pointers solution is O(n) time and **O(1) space**: keep a left and a
 * right cursor, and the sum tells you which one to move. It works because the
 * array is sorted. This version drops the sortedness requirement and spends
 * memory instead: a map from *value to index* built as you go, so the partner for
 * `a[i]` is one lookup away instead of a scan.
 *
 * The viewport is `hash`, and the map is literally what the renderer draws: each
 * entry is a value with the index it was last seen at, sitting in the bucket its
 * hash selects. `probeNote` spells out the lookup — "need 14, is 14 in the map?"
 * — because the one line `seen.get(target - a[i])` hides a hash computation, a
 * bucket index and a chain walk, and the whole point of this module is that
 * those three are all O(1).
 *
 * ## A caveat about the drawn buckets
 *
 * The listings use each language's *built-in* map (`Map`, `dict`, `HashMap`,
 * `unordered_map`) because that is what a real implementation does and because
 * their bucket layouts are not even comparable across languages. The generator
 * hand-rolls a bucket array with the same rolling hash as the hash-table module
 * so the structure is visible. The bucket indices in the animation are therefore
 * **illustrative**: they are a faithful picture of what a chained hash table does,
 * but they are not the bucket indices `java.util.HashMap` would pick. The
 * *membership* of the map is exact, and that is what the animation is teaching.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 633;

/** Seeded, guaranteed to contain a pair summing to 21; the map reports indices 7 and 8. */
const withPair = arrayWithPairSum(SEED, 10, 21);
const lastElementPair = [50, 1, 2, 3, 20, 21];
const duplicated = [4, 1, 3, 4, 6];
const distinct = distinctArray(SEED + 4, 8, 1, 9);

const PRESETS: Preset[] = [
  {
    id: 'exact-pair',
    label: 'Seeded array, pair at the end',
    blurb:
      'Ten seeded values and a target of 21. The values 7 and 10 each appear twice, so the map overwrites them — and that overwrite is why the reported index is 7 rather than 3. A hash-map two-sum returns *a* valid pair, not the first one.',
    input: { type: 'numbers', values: withPair },
    params: { target: 21 },
  },
  {
    id: 'pair-at-the-end',
    label: 'Only the last two values pair up',
    blurb:
      '50, 1, 2, 3, 20, 21 with a target of 41: the only pair is (4, 5), so the run gets all the way to the final element before anything is found. This is the shape the two-pointers version also has to walk to, and the reason neither version can be sub-linear.',
    input: { type: 'numbers', values: lastElementPair },
    params: { target: 41 },
  },
  {
    id: 'duplicate-value',
    label: 'A value that appears twice',
    blurb:
      '4, 1, 3, 4, 6 with a target of 10. The key 4 is written at index 0 and then overwritten at index 3, so the reported pair is (3, 4) and not (0, 4). Both are correct; which one you get is a direct consequence of overwriting rather than chaining, and it is worth being able to say why.',
    input: { type: 'numbers', values: duplicated },
    params: { target: 10 },
  },
  {
    id: 'no-pair',
    label: 'No pair exists',
    blurb:
      'Eight distinct values between 1 and 9 with a target of 20. Any two of them sum to at most 17, and no value is its own complement, so the map is built completely and the answer is "none". The failure case matters as much as the success case: the two-pointers version has a different one.',
    input: { type: 'numbers', values: distinct },
    params: { target: 20 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

/** Fixed so the drawn map never resizes mid-run; a "seen" map is short-lived. */
const CAPACITY = 16;

/** The same rolling hash as the hash-table module, for the illustrative buckets. */
function slotOf(value: number): number {
  let h = 0;
  const s = String(value);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000003;
  return h % CAPACITY;
}

/** The claim: the pair of indices, or [-1, -1]. */
export function twoSum(a: number[], target: number): number[] {
  const seen = new Map<number, number>();
  for (let i = 0; i < a.length; i++) {
    const v = a[i] as number;
    const j = seen.get(target - v);
    if (j !== undefined) return [j, i];
    seen.set(v, i);
  }
  return [-1, -1];
}

export function* twoSumHash(ctx: RunContext): Generator<HashFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const values = [...source];
  const n = values.length;
  const target = Number(ctx.params.target ?? 21);

  /** value → the index it was last seen at. */
  const seen = new Map<number, number>();
  let ops = 0;

  const buckets = (): HashFrame['buckets'] =>
    Array.from({ length: CAPACITY }, (_, bi) => ({
      id: `b${bi}`,
      entries: [...seen.entries()]
        .filter(([v]) => slotOf(v) === bi)
        .map(([v, i]) => ({ key: String(v), value: i, id: `v${v}` })),
    }));

  const ids = (): string[] => [...seen.keys()].map((v) => `v${v}`);
  const found: number[] = [];

  yield {
    kind: 'hash',
    index: 0,
    anchor: 'start',
    caption: `target ${target}`,
    note: `Looking for two values that add to ${target}, in any order — the array is not sorted, so the two-pointers trick does not apply. The plan: walk once, and remember every value you have already seen together with its index. Then for each new value the only question is "have I seen ${target} minus this before?", and that is one hash lookup.`,
    buckets: buckets(),
    size: 0,
    capacity: CAPACITY,
    highlight: {},
    vars: { n, target, size: 0, ops },
  };

  for (let i = 0; i < n; i++) {
    if (ctx.shouldStop()) return;
    ops++;
    const v = values[i] as number;
    const need = target - v;
    const j = seen.get(need);

    yield {
      kind: 'hash',
      index: 0,
      anchor: 'probe',
      caption: `index ${i}`,
      note: `a[${i}] is ${v}, so its partner must be ${need}. Ask the map: is ${need} in there? ${seen.size === 0 ? 'The map is still empty, so the answer is certainly no.' : `It holds ${seen.size} value${seen.size === 1 ? '' : 's'} so far.`}`,
      buckets: buckets(),
      size: seen.size,
      capacity: CAPACITY,
      probing: slotOf(need),
      probeNote: `need ${need} (${target} - ${v})`,
      highlight: { visited: ids() },
      ops,
      vars: { i, v, need, target, size: seen.size, ops },
    };

    if (j !== undefined) {
      yield {
        kind: 'hash',
        index: 0,
        anchor: 'hit',
        caption: `found at index ${i}`,
        note: `${need} is in the map, last seen at index ${j}. ${v} + ${need} = ${target}, so the answer is indices ${j} and ${i} — found after ${ops} lookup${ops === 1 ? '' : 's'} and ${seen.size} insertion${seen.size === 1 ? '' : 's'}, without ever re-reading an earlier element. The scan stops here.`,
        buckets: buckets(),
        size: seen.size,
        capacity: CAPACITY,
        probing: slotOf(need),
        probeNote: `seen[${need}] = ${j}`,
        highlight: { answer: [`v${need}`] },
        result: 'found',
        ops,
        vars: { i, v, need, found: j, target, ops },
      };
      found.push(j, i);
      break;
    }

    yield {
      kind: 'hash',
      index: 0,
      anchor: 'miss',
      caption: `index ${i}`,
      note: `${need} is not in the map, so ${v} cannot be the second element of a pair ending here — and ${seen.get(v) === undefined ? 'nothing' : `the key ${v} is already mapped to index ${seen.get(v) as number}, so the next write will overwrite it`}. Nothing is lost by moving on: that is the difference from a sorted array, where failing on one side commits you to a direction, while here every element is tested independently.`,
      buckets: buckets(),
      size: seen.size,
      capacity: CAPACITY,
      probing: slotOf(need),
      probeNote: `seen[${need}] — absent`,
      highlight: {},
      ops,
      vars: { i, v, need, size: seen.size, ops },
    };

    const previous = seen.get(v);
    seen.set(v, i);
    yield {
      kind: 'hash',
      index: 0,
      anchor: 'insert',
      caption: `index ${i}`,
      note:
        previous === undefined
          ? `Record ${v} → ${i}. One hash, one bucket, one write. The map now holds ${seen.size} value${seen.size === 1 ? '' : 's'} and the load factor is ${(seen.size / CAPACITY).toFixed(2)} — comfortably under any resize threshold, which is why this map never grows.`
          : `Record ${v} → ${i}, **overwriting** the index it was mapped to (${previous}). The map keeps only the latest index, which is exactly why the duplicate-value preset reports index 3 rather than 0: both are valid answers, and which one you get follows directly from overwriting instead of chaining.`,
      buckets: buckets(),
      size: seen.size,
      capacity: CAPACITY,
      probing: slotOf(v),
      probeNote: `seen[${v}] = ${i}`,
      highlight: { picked: [`v${v}`], visited: ids().filter((x) => x !== `v${v}`) },
      ops,
      vars: { i, v, size: seen.size, ops },
    };
  }

  yield {
    kind: 'hash',
    index: 0,
    anchor: 'done',
    caption: found.length === 2 ? `indices ${found[0]}, ${found[1]}` : 'no pair',
    note:
      found.length === 2
        ? `Indices ${found[0]} and ${found[1]}: ${values[found[0] as number] as number} + ${values[found[1] as number] as number} = ${target}. The whole cost is ${ops} lookup${ops === 1 ? '' : 's'} and ${seen.size} insertion${seen.size === 1 ? '' : 's'} — and the memory cost is the ${seen.size} entries still sitting in the map, which is precisely the trade against the O(1)-space two-pointers version.`
        : `No pair adds to ${target}. The map was built completely — ${seen.size} entries, ${ops} lookups — and the answer is "none". This is the failure the two-pointers version cannot report the same way: it would walk its pointers to the middle and conclude the same thing, but it could only ever do so because the array was sorted.`,
    buckets: buckets(),
    size: seen.size,
    capacity: CAPACITY,
    highlight: found.length === 2 ? { answer: [`v${values[found[0] as number] as number}`] } : {},
    result: found.length === 2 ? 'found' : 'not-found',
    ops,
    vars: { n, target, found: found.length / 2, size: seen.size, ops },
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
 * Every listing uses its language's *built-in* hash map, because that is what a
 * real implementation does and because their bucket layouts are not comparable
 * across languages — a hand-rolled table would be a different algorithm. The
 * notes spend most of their length on how the four say "not in the map".
 * ------------------------------------------------------------------ */

const JS = `function twoSum(a, target) {
  const seen = new Map();                     // @anchor start  value -> index
  for (let i = 0; i < a.length; i++) {
    const need = target - a[i];
    const j = seen.get(need);                // @anchor probe
    if (j !== undefined) return [j, i];      // @anchor hit
    // @anchor miss
    seen.set(a[i], i);                        // @anchor insert
  }
  return [-1, -1];                            // @anchor done
}`;

const PY = `def two_sum(a, target):
    seen = {}                                 # @anchor start  value -> index
    for i, v in enumerate(a):
        need = target - v
        j = seen.get(need)                    # @anchor probe
        if j is not None:
            return [j, i]                     # @anchor hit
        # @anchor miss
        seen[v] = i                           # @anchor insert
    return [-1, -1]                           # @anchor done
`;

const JAVA = `import java.util.HashMap;
import java.util.Map;

class TwoSumHash {
    static int[] twoSum(int[] a, int target) {
        Map<Integer, Integer> seen = new HashMap<>();  // @anchor start  value -> index
        for (int i = 0; i < a.length; i++) {
            int need = target - a[i];
            Integer j = seen.get(need);       // @anchor probe
            if (j != null) return new int[] { j, i };   // @anchor hit
            // @anchor miss
            seen.put(a[i], i);                 // @anchor insert
        }
        return new int[] { -1, -1 };          // @anchor done
    }
}`;

const CPP = `#include <unordered_map>
#include <vector>

std::vector<int> two_sum(const std::vector<int>& a, int target) {
    std::unordered_map<int, int> seen;        // @anchor start  value -> index
    for (int i = 0; i < (int)a.size(); i++) {
        int need = target - a[i];
        auto it = seen.find(need);            // @anchor probe
        if (it != seen.end()) return { it->second, i };  // @anchor hit
        // @anchor miss
        seen[a[i]] = i;                       // @anchor insert
    }
    return { -1, -1 };                        // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'A `Map` from value to index. `Map` rather than a plain object because the keys here are numbers and an object would coerce them to strings — `"4"` and `4` would collide, and `Object.keys` would come back sorted rather than in insertion order. `Map.get` returns `undefined` for a miss, which is a real value a key could legitimately hold, so the check on the next line has to be `!== undefined` and not a truthiness test.',
    python:
      'A `dict`, and the reason the miss test is `is not None` rather than `if j:` is worth spelling out. A dict can genuinely hold `None` as a value, so truthiness would be wrong in general; here the values are indices and `0` is a perfectly good index, which is exactly the case that would break. Since Python 3.7 a `dict` also preserves **insertion order**, so iterating it gives the order the values were seen — a guarantee `HashMap` and `unordered_map` both withhold.',
    java: '`Map<Integer, Integer>` and the boxing is real: a primitive-keyed map does not exist in the JDK, so every `get` and every `put` allocates or reuses an `Integer`. `j != null` is the correct miss test precisely because `seen.get` returns `null` when the key is absent — the one place in this curriculum where the miss test is genuinely about nullness rather than about a sentinel value.',
    cpp: 'A `std::unordered_map`, and `find` rather than `operator[]` on the probe: `seen[need]` would **insert** a default-constructed entry when the key is missing, quietly growing the map on every miss. That is the single most common `unordered_map` bug, and it is why the lookup is a `find` here and the write is a separate line.',
  },
  probe: {
    javascript:
      "One lookup for the complement. Everything expensive is inside it — a hash of `need`, a bucket index, and a walk down that bucket's chain — and all three are O(1) or better, which is the entire argument for this solution over two pointers. `Map` caches its hash per key, so repeated lookups of the same key do not rehash it.",
    python:
      '`seen.get(need)`, and note it is `get` and not `[need]`: subscripting a dict with a missing key raises `KeyError`, which here would abort a run that is merely *incomplete*, not broken. `dict.get` returning `None` is the idiom, and it is the reason the next line tests against `None` rather than against a missing key.',
    java: '`seen.get(need)`, autoboxing the `int` key into an `Integer` before the lookup. The subtlety is that `Integer` caches instances for -128..127, so for small values the *same object* comes back every time — which means a version written as `seen.get(k) == someInteger` would accidentally work for small keys and fail for large ones. Reference comparison on boxed values is a genuine, silent, input-dependent bug and this line is written to avoid it.',
    cpp: '`seen.find(need)` and the iterator is compared against `end()`, never dereferenced until it is known to be valid. An `unordered_map` iterator is invalidated by a rehash — and a rehash happens on insert — so an iterator held across the `seen[need]` write would dangle. Using the result immediately, before the insert, is what makes this safe.',
  },
  hit: {
    javascript:
      'The complement was there, so the pair is (j, i) and the function returns immediately. `i > j` always, because `j` was recorded during an earlier pass — which is the structural reason this returns a pair in increasing index order without needing to compare and swap.',
    python:
      'The pair is returned as a two-element list, in index order for the same reason: `j` came from an earlier iteration. Note that the return type is a list, not a tuple, because the harness compares JSON and a tuple would be converted by the driver rather than by the language itself.',
    java: '`new int[] { j, i }` unboxes both `Integer`s back to `int`, and it has to be written this way because `int[]` is not the same type as `Integer[]` — the array type is decided by the element type, and Java will not quietly bridge it. An `Integer[]` would have been shorter to write and would have forced boxing on every element of the answer.',
    cpp: '`return { it->second, i };` uses the braced initialiser to build a `std::vector<int>` directly, with no named temporary — the C++11 way, and the reason the same line reads so differently from the Java one. Note that returning a `vector` copies or moves it; with a return of a local brace-init the move is elided, with a return of a named local it usually is too, since C++17 guarantees copy elision for prvalues.',
  },
  miss: {
    javascript:
      'The complement is absent, so this value cannot be the second half of a pair ending here, and it is recorded so a *later* value can use it. That is the whole asymmetry with the two-pointers version: there, failing to find a partner on one side commits you to move a cursor; here, failing just means "remember me and carry on", and no element is ever looked at twice.',
    python:
      'Nothing is discarded and nothing is reconsidered — the miss is a pure observation. This is the structural advantage of the hash-map version: it makes no monotonicity assumption, so it works on an unsorted array. The cost is the map itself, which grows to the size of the input.',
    java: 'The miss branch, and the reason there is no `else` block: the miss test already happened on the previous line. Writing it as `if (j == null) { seen.put(...) } else { return ... }` would be the same logic and would bury the one interesting statement (the early return) inside a branch.',
    cpp: 'The same, and the placement matters: the `find` iterator is discarded before the insert, so there is no iterator alive across a potential rehash. The `unordered_map` may rehash when `seen[a[i]] = i` runs, and any iterator obtained before that point would be dangling afterwards — one of the subtlest lifetime bugs in standard C++ containers.',
  },
  insert: {
    javascript:
      'One write. `Map.set` on an existing key overwrites the value, which is why the duplicate-value preset reports the *later* index for a repeated value. `Map` preserves insertion order, so the key keeps its original position in iteration order even though its value changed — the one respect in which it differs from the other three.',
    python:
      '`seen[v] = i` overwrites silently, exactly as `dict` overwrites. Python dictionaries also preserve insertion order, so re-assigning an existing key does not move it to the end — a documented and much-relied-upon behaviour since 3.7, and the reason a dict is a reasonable stand-in for a small ordered table.',
    java: '`seen.put(a[i], i)`. `HashMap.put` returns the *previous* value for the key, so a version that cared about detecting duplicates could use the return value instead of a separate `containsKey` — one hash lookup instead of two. That optimisation is why `putIfAbsent` exists, and it is the idiom a real implementation would reach for.',
    cpp: '`seen[a[i]] = i` uses `operator[]`, which is correct here because we *want* the insert. The same operator on the probe line would have been the bug: it creates a default-constructed `0` for a missing key, so the map would grow by one entry per miss and the miss test would have to become `it->second != 0` — a sentinel test, which is exactly the kind of fragile code `find` exists to avoid.',
  },
  done: {
    javascript:
      '`[-1, -1]` as the "no pair" answer, and a two-element array always so the return shape does not change with the outcome. Returning `null` would be defensible and would be worse: every caller would need a null check, and the harness would have to compare a null against an array.',
    python:
      '`[-1, -1]`, for the same reason as the other three. The alternative of raising an exception for "no pair" would model this as a programming error rather than as an answer, and the caller who passed an unsatisfiable target has not made a mistake worth crashing over.',
    java: 'A two-element `int[]`, so the return type is fixed. `new int[] { -1, -1 }` rather than a shared constant, because returning the same array instance every time would let a caller mutate the result and change what the *next* caller sees — a real hazard with arrays as return values and one reason the immutable `List` is often preferred.',
    cpp: "A braced `{-1, -1}`, which constructs a fresh `vector` each time and so has none of Java's aliasing hazard. Note that a `vector` return is copied or moved on every call; for a two-element vector that is irrelevant, but for a large result `const&` or a move would matter, and choosing wrongly costs more than the algorithm ever does.",
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'twoSum',
    python: 'two_sum',
    java: 'TwoSumHash.twoSum',
    cpp: 'two_sum',
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
const targetOf = (p: Preset): number => Number(p.params?.target ?? 21);

const expectations: Expectation[] = PRESETS.map((p) => {
  const values = valuesOf(p);
  const target = targetOf(p);
  return { presetId: p.id, args: [values, target], result: twoSum(values, target) };
});

export const twoSumHashAlgo: AlgoDef<HashFrame> = {
  id: 'two-sum-hash',
  title: 'Two Sum with a Hash Map',
  category: 'hashing',
  summary:
    'Walk the array once, remembering every value you have seen with its index. For each new value, one lookup answers whether its complement has already passed by.',
  intuition:
    'Reach for this whenever the input is **not sorted** and you are asked whether some pair satisfies a condition — two sum, two difference, a pair that divides evenly, any "is there a partner for this" question. It is the same shape as the sorted two-pointers solution with the precondition inverted: give up O(1) space and O(n) worst-case-with-lookahead, get O(n) time with no ordering requirement and the freedom to stop the instant the answer appears. If the input *is* sorted, prefer two pointers: no hash, no allocation, and the space cost is genuinely zero.',
  complexity: {
    best: 'O(1)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(n)',
    note: 'O(n) average, with a best case of O(1) when the first two values already pair up, and an O(n) worst case on a map with terrible hash distribution. Space is O(n) — a whole map — which is the entire difference from the two-pointers version, and the reason neither is universally better. Values are keys, so a hash of an int is cheap; hashing strings would dominate.',
  },
  traits: {
    stable: true,
    inPlace: false,
    online: true,
    allowsDuplicates: true,
    tags: ['one pass', 'unsorted input', 'early exit', 'O(n) space'],
  },
  viewport: 'hash',
  level: 'intro',
  params: [
    {
      key: 'target',
      label: 'Target sum',
      kind: 'number',
      min: 0,
      max: 120,
      step: 1,
      default: 21,
      help: 'Below the smallest possible pair, or above the largest, and the answer is "no pair" — the failure case is worth watching too.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: twoSumHash,
  lesson,
  expectations,
  formatResult: (r) => {
    const pair = r as number[];
    return pair[0] === -1 ? 'no pair' : `indices ${pair[0]}, ${pair[1]}`;
  },
  anchors: ['start', 'probe', 'hit', 'miss', 'insert', 'done'],
};

export default twoSumHashAlgo;
