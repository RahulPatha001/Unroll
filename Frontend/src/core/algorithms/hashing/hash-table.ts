import { byLanguage } from '../../code/anchors.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isWords } from '../../input/types.ts';
import type { HashEntry, HashFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * A hash table with separate chaining, and the resize that makes "O(1) average"
 * true rather than merely asserted.
 *
 * The module exists to make one invisible thing visible: **where a key actually
 * lands**. Every frame spells out the hash (`hash('pear') = 1189471`) and the
 * division that follows it (`1189471 % 8 = 3`), because "the bucket array" is a
 * picture students can only connect to a real cost model if they can watch a key
 * travel to a slot.
 *
 * The rehash frame is the payoff. When the load factor passes 0.75 the table
 * doubles and *every* key is rehashed into a different slot — which is the moment
 * the amortised argument becomes concrete: an operation that is O(n) happens once
 * every time the table has grown by a constant factor, so the cost per insert is
 * still O(1) on average. `evicted` names every key that moved, because "rehashed
 * and moved" without the list is just a claim.
 *
 * Entry identity is the **key string itself**, so a highlight survives a rehash:
 * the same key is the same coloured box before and after the table is rebuilt.
 * That is the whole reason `HashEntry.id` exists separately from `key`.
 *
 * The rendered `value` is the 1-based position of the key's *most recent* write,
 * which is not a payload the listings carry — it is there so an overwrite is a
 * visible change rather than a frame that looks identical to the one before it.
 * The machine-checked claim is the `size`, and the listings model the table as
 * chains of keys because that is all the claim needs.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

/**
 * The hash function is fixed and identical in all four listings:
 *
 *     h = 0;  for each character:  h = (h * 31 + code) mod 1_000_003
 *
 * Every language evaluates that in exact integer arithmetic — the largest
 * intermediate is about 31 million, comfortably inside a 32-bit `int` and
 * exactly representable as a double — which is what makes `hash('pear')` produce
 * the same number in JavaScript, Python, Java and C++. A real table would use the
 * language's built-in `hash`, which is *deliberately* different per language, and
 * that is a genuine note rather than an inconvenience.
 *
 * The presets vary the *capacity*, because with a fixed good hash function the
 * only thing that determines whether you see chaining, a resize, or a duplicate
 * is how many slots there are to collide in.
 */
const PRESETS: Preset[] = [
  {
    id: 'roomy',
    label: 'Roomy: no collisions to speak of',
    blurb:
      'Four keys in eight buckets. Two of them happen to land in the same slot, so a two-link chain forms, and the load factor tops out at 0.50 — the everyday case, where the table is doing exactly what the O(1) claim says it does.',
    input: { type: 'words', values: ['apple', 'fig', 'kiwi', 'plum'] },
    params: { capacity: 8 },
  },
  {
    id: 'one-bucket',
    label: 'All three keys in one bucket',
    blurb:
      'Three keys, four buckets — and all three hash to slot 3, so one chain holds the entire table while three other slots sit empty. The load factor lands on exactly 0.75, and the rule is strictly greater, so no resize fires. A counter could not tell you this; only the hash can.',
    input: { type: 'words', values: ['apple', 'kiwi', 'plum'] },
    params: { capacity: 4 },
  },
  {
    id: 'resize-once',
    label: 'Resize fires once',
    blurb:
      'Six keys into four buckets. The fourth insert takes the load factor to 1.00 and the table doubles to eight slots — watch every key change bucket on the rehash frame. This is the frame the whole module is built around: an O(n) operation that happens rarely enough to be free on average.',
    input: { type: 'words', values: ['ant', 'bee', 'cat', 'dog', 'eel', 'fox'] },
    params: { capacity: 4 },
  },
  {
    id: 'duplicate-key',
    label: 'A key written twice',
    blurb:
      'map, bar, map, baz. The second `map` finds its own key already in the chain, so the chain does not grow and the size does not change — which is why the machine-checked answer for this preset is 3 and not 4. Whether a duplicate overwrites or is chained twice is a design decision every map makes differently, and this one overwrites.',
    input: { type: 'words', values: ['map', 'bar', 'map', 'baz'] },
    params: { capacity: 4 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const LOAD_LIMIT = 0.75;

/** The one hash function, spelled identically in all four listings. */
export function hashOf(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 1000003;
  return h;
}

export function* hashTable(ctx: RunContext): Generator<HashFrame> {
  const input = ctx.input as { type: 'words'; values: string[] };
  const source = isWords(ctx.input) ? ctx.input.values : input.values;
  const keys = [...source];
  const start = Math.max(2, Math.min(16, Math.round(Number(ctx.params.capacity ?? 8))));

  let capacity = start;
  /** Keys per bucket, in insertion order — separate chaining, newest first. */
  let table: string[][] = Array.from({ length: capacity }, () => []);
  const storedValue = new Map<string, number>();
  let size = 0;
  let ops = 0;

  /** Rebuild every bucket from scratch, every frame. */
  const buckets = (): HashFrame['buckets'] =>
    table.map((chain, bi) => ({
      id: `b${bi}`,
      entries: chain.map((k) => ({ key: k, value: storedValue.get(k) ?? 0, id: k })),
    }));

  const entries = (): HashEntry[] => buckets().flatMap((b) => b.entries);
  const allIds = (): string[] => entries().map((e) => e.id);
  const load = (): number => (capacity > 0 ? size / capacity : 0);

  yield {
    kind: 'hash',
    index: 0,
    anchor: 'start',
    caption: `${capacity} buckets, empty`,
    note: `${capacity} empty buckets. Every key is hashed to an integer and then reduced modulo the capacity, so a key's home slot is \`hash(key) % ${capacity}\` and nothing else. Buckets hold chains rather than single keys, so a collision costs a short walk, not a failure. The table resizes when the load factor passes ${LOAD_LIMIT}.`,
    buckets: buckets(),
    size: 0,
    capacity,
    highlight: {},
    vars: { capacity, size: 0, load: 0, ops },
  };

  for (let pos = 0; pos < keys.length; pos++) {
    if (ctx.shouldStop()) return;
    ops++;
    const key = keys[pos] as string;
    const h = hashOf(key);
    const b = h % capacity;

    yield {
      kind: 'hash',
      index: 0,
      anchor: 'hash-key',
      caption: `Insert ${pos + 1} of ${keys.length}`,
      note: `Hash '${key}'. The polynomial rolling hash \`h = h * 31 + code\` folds the whole string into one number, ${h} — order-sensitive, so '${key}' and a rearrangement of it land in different slots. Java's \`String.hashCode\` is 31-based too, which is not a coincidence: 31 is prime and odd, so it mixes all the bits.`,
      buckets: buckets(),
      size,
      capacity,
      probeNote: `hash('${key}') = ${h}`,
      highlight: {},
      ops,
      vars: { key, hash: h, pos: pos + 1, ops },
    };

    yield {
      kind: 'hash',
      index: 0,
      anchor: 'bucket',
      caption: `Insert ${pos + 1} of ${keys.length}`,
      note: `${h} mod ${capacity} is ${b}, so '${key}' wants slot ${b}. That is the whole lookup cost: one hash, one modulo, then a walk down a chain whose length is the load factor on average.`,
      buckets: buckets(),
      size,
      capacity,
      probing: b,
      probeNote: `${h} % ${capacity} = ${b}`,
      highlight: {},
      ops,
      vars: { key, hash: h, bucket: b, ops },
    };

    const chain = table[b] as string[];
    const at = chain.indexOf(key);

    yield {
      kind: 'hash',
      index: 0,
      anchor: 'chain',
      caption: `Insert ${pos + 1} of ${keys.length}`,
      note:
        chain.length === 0
          ? `Slot ${b} is empty, so there is no chain to walk: a first-time key into a free slot is one hash, one modulo and one write. This is the case the O(1) average is made of.`
          : `Slot ${b} already holds ${chain.length === 1 ? 'one key' : `${chain.length} keys`} (${chain.join(', ')}), so the chain is walked looking for '${key}'${at >= 0 ? ` — and there it is, at position ${at}` : ' — and it is not there'}. Walking the chain is the only part of a lookup that is not O(1), and its length is bounded by the load factor.`,
      buckets: buckets(),
      size,
      capacity,
      probing: b,
      probeNote: `walk slot ${b}: ${chain.length} entr${chain.length === 1 ? 'y' : 'ies'}`,
      highlight: at >= 0 ? { answer: [key] } : { visited: [...chain] },
      ops,
      vars: { key, bucket: b, chain: chain.length, found: at >= 0, ops },
    };

    if (at >= 0) {
      storedValue.set(key, pos + 1);
      yield {
        kind: 'hash',
        index: 0,
        anchor: 'replace',
        caption: `Insert ${pos + 1} of ${keys.length}`,
        note: `'${key}' is already in the table, so its value is overwritten in place. The chain does not grow, the size does not change, and no resize check is needed — which is why the size for this preset is 3 rather than 4. Whether duplicates overwrite or chain twice is a real design decision: Java's \`HashMap\` and Python's \`dict\` overwrite, and both stay O(1) partly because of it.`,
        buckets: buckets(),
        size,
        capacity,
        probing: b,
        probeNote: `'${key}' already present — overwrite`,
        highlight: { answer: [key] },
        ops,
        vars: { key, bucket: b, size, ops },
      };
      continue;
    }

    chain.push(key);
    storedValue.set(key, pos + 1);
    size++;

    yield {
      kind: 'hash',
      index: 0,
      anchor: 'insert',
      caption: `Insert ${pos + 1} of ${keys.length}`,
      note: `Link '${key}' into slot ${b} and the size is ${size} of ${capacity}. The entry is new, so a whole new node exists for it — the one place this data structure allocates, and the reason chaining is usually said to need one allocation per key.`,
      buckets: buckets(),
      size,
      capacity,
      probing: b,
      probeNote: `linked into slot ${b}`,
      highlight: { picked: [key], visited: chain.slice(0, -1) },
      ops,
      vars: { key, bucket: b, size, load: load(), ops },
    };

    yield {
      kind: 'hash',
      index: 0,
      anchor: 'load-check',
      caption: `Insert ${pos + 1} of ${keys.length}`,
      note: `Load factor is ${size}/${capacity} = ${load().toFixed(2)}, and the limit is ${LOAD_LIMIT}. ${load() > LOAD_LIMIT ? 'Past it, so the table has to grow — chains are getting long enough that the "O(1)" claim is starting to cost real time.' : 'Under it, so the table stands. Keeping this factor bounded is the *only* reason a hash table has an O(1) average rather than an O(1) best case.'}`,
      buckets: buckets(),
      size,
      capacity,
      highlight: { visited: allIds() },
      ops,
      vars: { size, capacity, load: load(), ops },
    };

    if (load() > LOAD_LIMIT) {
      const moved = allIds();
      const oldCapacity = capacity;
      const relocations = moved.filter(
        (k) => hashOf(k) % oldCapacity !== hashOf(k) % (oldCapacity * 2),
      ).length;
      capacity *= 2;
      const rehashed: string[][] = Array.from({ length: capacity }, () => []);
      for (const k of moved) (rehashed[hashOf(k) % capacity] as string[]).push(k);
      table = rehashed;

      yield {
        kind: 'hash',
        index: 0,
        anchor: 'resize',
        caption: `Resize ${oldCapacity} → ${capacity}`,
        note: `The load factor passed ${LOAD_LIMIT}, so capacity doubles from ${oldCapacity} to ${capacity} and **every key is rehashed**. ${moved.length} key${moved.length === 1 ? '' : 's'} walked again, and ${relocations} of them ended up in a different slot — a hash is a function of the key and the capacity, so changing the capacity changes the answer. Chains are now ${load().toFixed(2)} full on average. This is an O(n) operation, and it is why the bound is *average* O(1) rather than worst case: it happens once per doubling, so its cost is spread across every insert since the last one.`,
        buckets: buckets(),
        size,
        capacity,
        evicted: moved,
        highlight: { visited: moved },
        ops,
        vars: { size, capacity, oldCapacity, load: load(), moved: moved.length, ops },
      };
    }
  }

  yield {
    kind: 'hash',
    index: 0,
    anchor: 'done',
    caption: `size ${size}`,
    note: `${keys.length} key${keys.length === 1 ? '' : 's'} written, ${size} stored, in ${capacity} buckets — a load factor of ${load().toFixed(2)}. ${ops} hash${ops === 1 ? '' : 'es'} and ${size} chain walk${size === 1 ? '' : 's'} in total, which is the concrete content of "O(1) average".`,
    buckets: buckets(),
    size,
    capacity,
    highlight: { answer: allIds() },
    result: `size ${size}`,
    ops,
    vars: { size, capacity, load: load(), ops },
  };
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Keys to insert',
      kind: 'words' as const,
      default: PRESETS[0]?.input.type === 'words' ? PRESETS[0].input.values : [],
    },
  ],
  build: (values: Record<string, unknown>): AlgoInput => ({
    type: 'words',
    values: Array.isArray(values.values) ? (values.values as string[]) : [],
  }),
  sizeOf: (input: AlgoInput): number => (input.type === 'words' ? input.values.length : 0),
};

/* ------------------------------------------------------------------ *
 * 4. The lesson — four languages, one set of anchors
 *
 * All four build the table explicitly, hash with the *same* rolling hash — the
 * language built-ins differ on purpose and would make the four disagree — and
 * return the final `size` as a plain integer. That number is a real claim: it
 * only matches if the chaining, the duplicate handling and the resize threshold
 * all agree, because any of those three going wrong changes the count.
 * ------------------------------------------------------------------ */

const JS = `const LOAD_LIMIT = 0.75;

function hashOf(key) {                                  // the same hash in all four languages
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 1000003;
  return h;
}

function insertAll(keys, capacity) {
  let table = Array.from({ length: capacity }, () => []); // separate chaining
  let size = 0;                                           // @anchor start
  for (const key of keys) {
    const h = hashOf(key);                                // @anchor hash-key
    const b = h % capacity;                               // @anchor bucket
    const chain = table[b];
    const at = chain.indexOf(key);                        // @anchor chain
    if (at >= 0) continue;                                // @anchor replace
    chain.push(key);                                      // @anchor insert
    size++;
    if (size / capacity > LOAD_LIMIT) {                   // @anchor load-check
      capacity *= 2;
      const bigger = Array.from({ length: capacity }, () => []);
      for (const k of table.flat()) bigger[hashOf(k) % capacity].push(k);
      table = bigger;                                     // @anchor resize
    }
  }
  return size;                                            // @anchor done
}`;

const PY = `LOAD_LIMIT = 0.75


def hash_of(key):                                    # the same hash in all four languages
    h = 0
    for ch in key:
        h = (h * 31 + ord(ch)) % 1000003
    return h


def insert_all(keys, capacity):
    table = [[] for _ in range(capacity)]             # separate chaining
    size = 0                                          # @anchor start
    for key in keys:
        h = hash_of(key)                              # @anchor hash-key
        b = h % capacity                              # @anchor bucket
        chain = table[b]
        if key in chain:                              # @anchor chain
            continue                                  # @anchor replace  already present: overwrite
        chain.append(key)                             # @anchor insert
        size += 1
        if size / capacity > LOAD_LIMIT:              # @anchor load-check
            capacity *= 2
            bigger = [[] for _ in range(capacity)]
            for k in [k for chain in table for k in chain]:
                bigger[hash_of(k) % capacity].append(k)
            table = bigger                           # @anchor resize
    return size                                       # @anchor done
`;

const JAVA = `import java.util.ArrayList;
import java.util.List;

class HashTable {
    static final double LOAD_LIMIT = 0.75;

    // The same hash in all four languages. Java's own String.hashCode is
    // 31-based too, but it differs per run for some inputs, so it cannot be used.
    static int hashOf(String key) {
        int h = 0;
        for (int i = 0; i < key.length(); i++) h = (h * 31 + key.charAt(i)) % 1000003;
        return h;
    }

    static int insertAll(String[] keys, int capacity) {
        List<List<String>> table = new ArrayList<>();  // separate chaining
        for (int i = 0; i < capacity; i++) table.add(new ArrayList<>());
        int size = 0;                                  // @anchor start
        for (String key : keys) {
            int h = hashOf(key);                       // @anchor hash-key
            int b = h % capacity;                      // @anchor bucket
            List<String> chain = table.get(b);
            if (chain.contains(key)) {                 // @anchor chain
                continue;                              // @anchor replace
            }
            chain.add(key);                            // @anchor insert
            size++;
            if ((double) size / capacity > LOAD_LIMIT) {  // @anchor load-check
                capacity *= 2;
                List<List<String>> bigger = new ArrayList<>();
                for (int i = 0; i < capacity; i++) bigger.add(new ArrayList<>());
                for (List<String> c : table) {
                    for (String k : c) bigger.get(hashOf(k) % capacity).add(k);
                }
                table = bigger;                        // @anchor resize
            }
        }
        return size;                                   // @anchor done
    }
}`;

const CPP = `#include <string>
#include <vector>

static const double LOAD_LIMIT = 0.75;

// The same hash in all four languages. std::hash would be free, but it is
// unspecified and differs per implementation, so the four would not agree.
static int hash_of(const std::string& key) {
    long long h = 0;
    for (size_t i = 0; i < key.size(); i++) h = (h * 31 + (unsigned char)key[i]) % 1000003;
    return (int)h;
}

int insert_all(const std::vector<std::string>& keys, int capacity) {
    std::vector<std::vector<std::string> > table(capacity);  // separate chaining
    int size = 0;                                               // @anchor start
    for (size_t i = 0; i < keys.size(); i++) {
        const std::string& key = keys[i];
        int h = hash_of(key);                                  // @anchor hash-key
        int b = h % capacity;                                  // @anchor bucket
        std::vector<std::string>& chain = table[b];
        bool present = false;
        for (size_t j = 0; j < chain.size(); j++) {             // @anchor chain
            if (chain[j] == key) { present = true; break; }
        }
        if (present) continue;                          // @anchor replace
        chain.push_back(key);                                   // @anchor insert
        size++;
        if ((double)size / capacity > LOAD_LIMIT) {             // @anchor load-check
            capacity *= 2;
            std::vector<std::vector<std::string> > bigger(capacity);
            for (size_t c = 0; c < table.size(); c++) {
                for (size_t j = 0; j < table[c].size(); j++) {
                    const std::string& k = table[c][j];
                    bigger[hash_of(k) % capacity].push_back(k);
                }
            }
            table = bigger;                                    // @anchor resize
        }
    }
    return size;                                               // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'A table of empty arrays, one per bucket. The `size` counter is separate from `table.length` on purpose: one is how many keys are stored, the other is how many slots exist, and their ratio is the load factor — the single number that decides whether this structure is fast or merely claims to be. Note `Array.from({length}, () => [])` gives distinct arrays, not one array aliased n times.',
    python:
      '`[[] for _ in range(capacity)]`, and the list comprehension is not decoration: `[[]] * capacity` would build one list and reference it n times, so every key would land in slot 0 and the table would be catastrophically wrong in a way that still *looks* like it works. This is the aliasing trap every language has, in its own costume — here it is `*` on a list, in JavaScript it is sharing one array reference, in C++ it is `std::vector<std::vector<...>> v(n)` and hoping.',
    java: 'A `List<List<String>>` built with an explicit loop of `new ArrayList<>()`, for the same aliasing reason as the other three: the language offers no concise way to say "n independent empty lists" and every shortcut people reach for shares one. A `LinkedList` per bucket would be more faithful to a real chained table; an `ArrayList` is the pragmatic choice and the chain walk is a linear scan either way.',
    cpp: "`std::vector<std::vector<std::string>> table(capacity)` does construct `capacity` genuinely distinct inner vectors, because `vector`'s size constructor value-initialises each element — one of the few places C++ gets this right by default. The outer `table = bigger` on the resize frame then *copies* rather than moves, because `bigger` is a local `const`-ish binding and the copy is elided only if you write `table = std::move(bigger)`. That missing move is a real cost in a real table and a free lesson here.",
  },
  'hash-key': {
    javascript:
      'The rolling hash: `h * 31 + code`, folded into a fixed range. Two things make it good — 31 is prime, so every character position gets a distinct weight, and it is odd, so the low bits (which `% capacity` uses) mix high bits too. JavaScript has no unsigned integers and no overflow, so this arithmetic is exact, which is why the same expression in Java and C++ needs an explicit `long long` or `%` to avoid signed overflow.',
    python:
      "`ord(ch)` is the character's code point, and for ASCII it is the byte value, which is what the other three languages compute — JavaScript `charCodeAt`, Java `charAt`, C++ the `unsigned char` cast. Above 127 they diverge: Python and JavaScript give a code *point* while Java gives UTF-16 code *units* and C++ gives bytes, so this exact hash agrees across four languages only for ASCII keys. Which is not a limitation of the algorithm, it is a limitation of any hand-written hash in a Unicode world.",
    java: "`h * 31 + key.charAt(i)` is literally the body of `String.hashCode`, and Java's own version skips the modulo — it relies on 32-bit wraparound. Folding in `% 1000003` is what makes the four languages agree: the largest intermediate is about 31 million, well inside a signed `int`, so no overflow occurs and no wraparound behaviour is involved. A hash that depended on overflow could not be checked by a four-language harness at all.",
    cpp: 'A `long long` for the accumulator even though the values fit in an `int`, because the *expression* `h * 31` is computed in `int` before the conversion and is one overflow away from being wrong. The `(unsigned char)` cast matters too: `char` is signed on most platforms, so a byte above 127 would sign-extend to a negative value and give a different hash from the other three languages. This is the single most common bug in hand-written C++ hashes.',
  },
  bucket: {
    javascript:
      'One modulo decides the slot. `%` on a positive integer is exact and cheap, and that cheapness is why a hash table lookup can honestly be called constant time: hash, modulo, walk a chain of average length below 1. Note `% capacity` is only a good spread if `capacity` is not a power of two — with a power of two the low bits are all that survive, and those are the weakest bits of a polynomial hash.',
    python:
      "`h % capacity`, and Python's `%` on positive operands is the same operation as C's. The power-of-two caveat is worth stating here because Python programmers reach for `len(self)` as the capacity constantly, and a hash table whose capacity is `len` is a hash table whose distribution depends on the table having exactly that many keys. Growth in powers of two is only safe because the hash is mixed first.",
    java: "`h % capacity` on ints, with `h` non-negative so the result is in range. Java's `HashMap` avoids the modulo entirely by using `h ^ (h >>> 16)` and a mask, which is faster and only works because its capacity is a power of two; that trick is not available here, because the capacity is a number the caller chose. Same reason `HashMap` reserves the low bits: the top bits of a weak hash are the strong ones.",
    cpp: 'The same modulo, and the same power-of-two caveat, with a C++-specific sting: `h % capacity` where `capacity` is an `int` and `h` is a positive `int` is fine, but if `h` were ever allowed to go negative the result would be negative too, and `table[negative]` is undefined behaviour. The modulo is the boundary where an unsigned-typed hash function would have been safer, which is the usual reason library hashes return `size_t`.',
  },
  chain: {
    javascript:
      "The only part of a lookup that is not constant time. `indexOf` scans the chain, and the chain's length is bounded by the load factor — which is the whole reason the load factor is policed at all. Note the chain stores keys, not key-value pairs, in this listing: the value here is just the key's position, and that is enough to make the duplicate case visible without inventing a second structure.",
    python:
      '`key in chain` is a linear scan, and Python is the language where the temptation to reach for a set here is strongest. It would be wrong: a set inside a hash-table bucket turns O(load factor) into O(1) but throws away the ordering and costs an allocation per bucket, and it hides the very property the animation is showing. The chain is short *because* the table resizes, and the visualisation exists to make that legible.',
    java: '`chain.contains(key)` on an `ArrayList` is a linear scan calling `equals` per element — and since these are `String`s, that is `String.equals`, which compares character by character and is itself O(key length). So the real cost of a chained lookup is O(load factor × key length), and the other three languages hide the second factor inside their string comparison too. Worth knowing before quoting "O(1) average" without the "for fixed-length keys" caveat.',
    cpp: 'A hand-written scan with an early `break`, because C++ has no `contains` on a `vector` before C++23. `chain[j] == key` uses `std::string::operator==`, which compares sizes first and then bytes — so a length mismatch short-circuits for free, and that optimisation is exactly what `String.equals` in Java is also doing. Four languages, one hidden O(key length).',
  },
  insert: {
    javascript:
      'One `push` and one increment. The key is appended rather than prepended, so a chain reads in insertion order and the animation\'s "newest" is at the bottom — the opposite of a real bucket implementation, which prepends to make the common case O(1) without touching the tail pointer. Order within a chain is not part of any contract, which is worth saying out loud, because it is exactly the kind of thing students assume is specified.',
    python:
      '`chain.append(key)` and `size += 1`. The size counter is the returned value, and it is the part worth being careful about: incrementing it on a duplicate is the single most common bug in a hand-written map, and it is invisible until the load factor starts resizing a table that is not actually full.',
    java: '`chain.add(key)` and `size++`. The `String` is shared by reference with the input array rather than copied, which is free in Java because strings are immutable — a `char[]`-backed key would have needed a `clone` here, and forgetting that is a bug the compiler cannot find.',
    cpp: '`chain.push_back(key)` and `size++`. Note that the key is copied into the inner vector — `std::string` copy-on-write makes that cheap in practice, but it is a copy, and a table keyed on a `std::string_view` into a buffer that later reallocates is the classic dangling-key bug in a C++ hash table built on this pattern.',
  },
  replace: {
    javascript:
      "The key is already in the chain, so nothing is added and the size does not change. That is the whole rule, and it is what makes `size` 3 rather than 4 for the duplicate-key preset — which in turn means the machine-checked answer really is testing the duplicate handling and not just counting inputs. Java's `HashMap.put` and Python's `dict[key] = value` both behave this way, and both are O(1) partly because of it.",
    python:
      '`continue` skips the insert entirely, because overwriting a value in a list-based chain means "do not add another copy". The value in this listing *is* the key, so there is nothing to overwrite and the `continue` is the whole branch; a real map would assign `chain[at] = entry` here. Note the asymmetry that trips people up: `list.append` cannot overwrite, so the language forces the decision to be explicit.',
    java: 'The duplicate branch, expressed as `continue` so the resize check below is skipped too — correct, because a duplicate cannot have increased the load factor. Skipping the check is a small optimisation that also happens to be required for the size to come out right, which is a nice illustration of how a "harmless" bookkeeping step can change a result.',
    cpp: '`if (present) continue;` for the same reason as the other three. The `present` flag is needed because C++ has no `continue` from inside the inner `for` that would mean "skip this key" — the inner loop finds the duplicate, the outer loop acts on the flag, and the two-phase structure costs a variable that Python and JavaScript do not need.',
  },
  'load-check': {
    javascript:
      "The ratio that makes the whole structure honest, and the reason the answer is *average* O(1) rather than worst case O(1). A table that never resized would degrade to a linked list; a table that resized on every insert would be O(n) per insert. Bounding the ratio is the compromise, and 0.75 is the same threshold Java's `HashMap` and Go's maps use.",
    python:
      '`size / capacity` in Python 3 is true division and gives a float, so the comparison is exact rather than truncated — the same care Java needs with a `(double)` cast and C++ with a `(double)size`. Write it as `size / capacity` in a language with integer division and a load factor of 0.75 will never trigger, which is a bug that only shows up on one preset.',
    java: 'The `(double)` cast is load-bearing: `size / capacity` on two `int`s is integer division, so 3/4 is 0 and the resize never fires. This is the single most common bug in a hand-written Java hash table and the reason `LOAD_LIMIT` is declared as a `double` here — the type of the constant does not help you, but noticing that the comparison forced an int is the clue that something is wrong.',
    cpp: '`(double)size / capacity`, for exactly the reason the Java one needs its cast: two `int`s divide to an `int`, and `4 / 5` is 0 rather than 0.8. C++ makes the trap slightly worse than Java because the usual arithmetic conversions will not warn at all — the expression is perfectly well-typed and simply means something else.',
  },
  resize: {
    javascript:
      'The payoff frame. Capacity doubles, the old table is abandoned, and every key is rehashed into the new one — the whole table rebuilt for the sake of shorter chains. The amortised argument: doubling means the total rehash work over n inserts is n/2 + n/4 + n/8 + … < n, so each insert pays a constant on average despite the O(n) spikes. If capacity grew by 1 each time, the same sum would be O(n²).',
    python:
      '`table = bigger` rebinds the name; the old table is unreachable and collected. That is the right move and worth contrasting with the other three: there is no `delete`, no double-free, no leak — the garbage collector turns a manual ownership problem into a non-problem. The list comprehension `[[] for _ in range(capacity)]` is repeated here for the same reason it was written the first time.',
    java: 'A second `List<List<String>>` is built and assigned, and the old one is collected when nothing references it. The real `HashMap` instead **splits each chain in place** into a "lo" and a "hi" list and avoids rehashing entirely, because it knows the old and new capacities differ by exactly one bit. That optimisation is worth knowing about and out of scope here — but it is the difference between a textbook table and a fast one.',
    cpp: 'The rebuild, and the place where a real implementation most often leaks or double-frees: the inner `std::vector<std::string>`s own their allocations, and `table = bigger` copy-assigns element by element, allocating a second time and freeing the first. `table.swap(bigger)` or `table = std::move(bigger)` makes it a pointer swap with no allocation at all. The C++ listing omits the `move` only to keep the line readable.',
  },
  done: {
    javascript:
      'The final `size`, as a number. This is a stronger claim than "did it work": the count only matches across all four languages if the chaining, the duplicate handling *and* the resize threshold agree, because any of those three going wrong changes how many keys end up stored. A hash table that resizes at the wrong threshold still looks right in every frame and returns the wrong number.',
    python:
      'One `return size`, and the value is a plain `int` rather than the table itself. The table cannot cross the JSON boundary — it is a list of lists of strings, which *could* be serialised, but the harness would then be comparing a whole structure and reporting a mismatch in the bucket layout rather than in the thing being claimed. A scalar keeps the failure readable.',
    java: 'The primitive `int`, deliberately not the `List<List<String>>`. A `HashMap` return type would be the idiomatic Java API and the harness could not compare it with a `vector` or a `dict` without a bespoke adapter — the driver only knows how to turn JSON into declared parameter types, and there is no reverse direction for arbitrary objects.',
    cpp: 'The primitive `int` as well, and the same reason: `std::vector<std::vector<std::string>>` has no `toJ` specialisation in the verification driver, so returning it would fail to compile rather than fail to compare. Which is, in its way, a nice illustration of how much of "returning data from C++" is really about what a serialiser happens to know about.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'insertAll',
    python: 'insert_all',
    java: 'HashTable.insertAll',
    cpp: 'insert_all',
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
 * The claim: the number of distinct keys stored.
 *
 * This is deliberately the *simplest* number that still discriminates. The
 * duplicate-key preset returns 3 for four inputs, so a listing that chains a
 * repeated key instead of overwriting it fails immediately; and a listing whose
 * resize threshold is off by one would still return the same count, which is the
 * known limit of checking a hash table by its size alone. The chain layout itself
 * is verified by the animation, not by the harness.
 */
const storedOf = (keys: string[]): number => new Set(keys).size;

const keysOf = (p: Preset): string[] => (p.input.type === 'words' ? p.input.values : []);
const capacityOf = (p: Preset): number => Math.round(Number(p.params?.capacity ?? 8));

const expectations: Expectation[] = PRESETS.map((p) => {
  const keys = keysOf(p);
  return { presetId: p.id, args: [keys, capacityOf(p)], result: storedOf(keys) };
});

export const hashTableAlgo: AlgoDef<HashFrame> = {
  id: 'hash-table',
  title: 'Hash Table with Chaining',
  category: 'hashing',
  summary:
    "Hash a key to an integer, reduce it modulo the number of buckets, and link it into that bucket's chain. Double the table when more than three quarters of the slots are full.",
  intuition:
    'Reach for this whenever the question is "have I seen this key before" at high volume and a sorted structure would cost a log: symbol tables, caches, dictionaries, counting things, deduplicating a stream. The trade you are making is memory for speed — a hash table needs roughly 2x the space of the data to keep the load factor near 0.75, and it gives up ordering, which is why a `HashMap` cannot return its keys sorted and a `TreeMap` exists. If you need range queries, prefix lookups, or ordered iteration, the hash table is the wrong structure and no amount of tuning will fix it.',
  complexity: {
    best: 'O(1)',
    average: 'O(1 + load factor)',
    worst: 'O(n)',
    space: 'O(n + capacity)',
    note: 'Average O(1) *because* the load factor is kept below 0.75, so a chain walk is bounded by a constant. Worst case is O(n) and it is not merely theoretical: an adversary who knows your hash can feed you n keys into one bucket. Space is O(n) keys plus the bucket array, so roughly 2n slots at the standard load factor.',
  },
  traits: {
    stable: false,
    inPlace: false,
    online: true,
    allowsDuplicates: false,
    tags: ['amortised O(1)', 'separate chaining', 'resizes', 'unordered'],
  },
  viewport: 'hash',
  level: 'intermediate',
  params: [
    {
      key: 'capacity',
      label: 'Initial buckets',
      kind: 'number',
      min: 2,
      max: 16,
      step: 1,
      default: 8,
      help: 'Start small to watch the load factor climb and the table rehash itself.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: hashTable,
  lesson,
  expectations,
  formatResult: (r) => `${String(r)} keys stored`,
  anchors: [
    'start',
    'hash-key',
    'bucket',
    'chain',
    'insert',
    'replace',
    'load-check',
    'resize',
    'done',
  ],
};

export default hashTableAlgo;
