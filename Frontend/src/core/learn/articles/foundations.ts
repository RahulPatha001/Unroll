import type { Article } from '../types.ts';

/** The fundamentals: the two data-structure-adjacent algorithms students get wrong most. */

export const BINARY_SEARCH: Article = {
  slug: 'binary-search',
  title: 'Binary search and the off-by-one that eats the world',
  dek: 'Twenty lines of code, and one boundary convention that decides whether it is correct.',
  category: 'searching',
  tags: ['binary search', 'invariant', 'overflow', 'boundary'],
  readMinutes: 10,
  algoId: 'binary-search',
  body: [
    {
      kind: 'p',
      text: 'Binary search is the most famous algorithm in this app and the one most often implemented incorrectly. Not because the idea is hard — "halve the range" is a complete description — but because of one detail that is never specified: **which region is the answer allowed to be in, before the loop starts?**',
    },
    {
      kind: 'p',
      text: 'Get that wrong and you get the two failure modes every practitioner knows: the answer one step off, or an infinite loop.',
    },

    { kind: 'h2', text: 'The invariant, stated precisely' },
    {
      kind: 'p',
      text: 'Pick this convention and the code writes itself: **`[low, high)` — high is exclusive.** Before every iteration, the answer, if it exists, is in `a[low..high-1]`.',
    },
    {
      kind: 'code',
      lang: 'typescript',
      code: `function binarySearch(a: number[], target: number): number {
  // Invariant: if the answer exists, it is in a[low..high).
  let low = 0;
  let high = a.length;

  // high - low, not high > low: when high and low are both ~2^31 the
  // subtraction is safe and the comparison is not. This matters in C and Java,
  // where int is 32-bit and low + (high - low) / 2 is not the same expression as
  // (low + high) / 2. In JavaScript every number is a double and the overflow
  // cannot happen — but writing the safe form costs nothing and it survives the
  // translation to a language where it does.
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);

    if (a[mid] === target) return mid;

    if (a[mid] < target) low = mid + 1;
    else high = mid;
  }
  return -1;   // low === high === the insertion point
}`,
    },
    {
      kind: 'p',
      text: 'Every line is forced by the invariant, and that is the test to apply:',
    },
    {
      kind: 'ul',
      items: [
        '`mid` is inside `[low, high)` because `low < high` implies `low + (high-low)/2 < high`.',
        '`a[mid] < target` → the answer is strictly right of `mid`, so `low = mid + 1`. **+1** because `mid` itself has been ruled out; `low = mid` would not shrink the range and the loop would spin forever.',
        '`a[mid] > target` → the answer is strictly left of `mid`, so `high = mid`. **No +1**, because `mid` is already excluded by `high` being exclusive.',
        'On exit, `low === high`, and the range is empty — so there is no answer.',
      ],
    },
    {
      kind: 'callout',
      tone: 'warn',
      title: 'The asymmetry is the whole thing',
      text: '`low = mid + 1` but `high = mid`. One has the `+1`, the other does not, and it is entirely because `high` is exclusive. Switching to the `[low, high]` inclusive convention means both become `mid ± 1`, and if you change the loop condition without changing both updates you get an infinite loop.',
    },
    {
      kind: 'stepper',
      algoId: 'binary-search',
      caption: 'Binary search. Watch the remaining region — it should halve every single step.',
      preset: 'hit-middle',
    },

    { kind: 'h2', text: 'The four variants, and why they are harder than they look' },
    {
      kind: 'p',
      text: 'Finding an *exact* value is the easy case. The variants ask for something less well-defined, and each has a different convention:',
    },
    {
      kind: 'table',
      head: ['Variant', 'Returns', 'Key subtlety'],
      rows: [
        ['Exact match', 'the index, or -1', 'the base case; everything else follows'],
        [
          'Lower bound',
          'first index where a[i] >= target',
          'may be `a.length` — that is a valid answer, not an error',
        ],
        [
          'Upper bound',
          'first index where a[i] > target',
          '`upper - 1` is the last index where a[i] == target',
        ],
        [
          'First/last occurrence',
          'a range',
          'two bounds and a subtraction; getting the empty case right is the whole problem',
        ],
      ],
    },
    {
      kind: 'p',
      text: 'The classic bug in all four is treating "not found" as an error state when it is really a valid boundary. `lower_bound` on an array whose every element is smaller than the target returns `a.length` — the one-past-the-end position where the target *would* be inserted. Code that indexes with it reads off the end of the array.',
    },
    {
      kind: 'p',
      text: 'This is a good example of why binary search is worth practising separately from the idea. "Halve the range" is understood in thirty seconds. "Return an insertion point that may equal `n`, and do not index with it" is the part that takes an afternoon.',
    },

    { kind: 'h2', text: 'The monotonicity requirement' },
    {
      kind: 'p',
      text: 'The algorithm is correct because the array is **sorted** — more precisely, because `a[mid] < target` really does imply the answer is right of `mid`. That requires the comparison to be monotonic with respect to the search key.',
    },
    {
      kind: 'p',
      text: 'The moment that breaks, binary search silently returns garbage rather than failing. It works on a cyclic-rotated sorted array provided you also know the rotation point; it works on a mountain array with the right two-step comparison; and it does **not** work on a merely *nearly* sorted array. There is no partial credit, which is why the precondition deserves to be in a comment rather than assumed.',
    },

    { kind: 'h2', text: 'Why it is still worth knowing' },
    {
      kind: 'p',
      text: '`O(log n)` is one of the two asymptotic facts that actually change what is possible — the other being that sorting costs `n log n`. Together they are the reason a sorted array is worth its insertion cost: it buys a lookup that is `log₂ n` times faster than a linear scan, which at a million elements is twenty operations instead of a million.',
    },
    {
      kind: 'p',
      text: 'It is also the standard way to find the *boundary* of a monotonic property, which is a much more common shape than exact lookup. "Find the first index where the running sum exceeds `k`" is a lower bound. So is "find the smallest `n` for which the array is sorted". So is "find the last day the temperature dropped below freezing". None of those need a value to exist at all.',
    },
  ],
};

export const HASH_TABLES: Article = {
  slug: 'hash-tables',
  title: 'Hash tables: trading a guarantee for a hope',
  dek: 'How a hash map gets O(1) average, and the exact assumptions that average depends on.',
  category: 'hashing',
  tags: ['hash', 'collision', 'load factor', 'open addressing'],
  readMinutes: 10,
  algoId: 'hash-table',
  body: [
    {
      kind: 'p',
      text: 'A hash table is the only data structure in ordinary use that is **O(1) with no worst-case guarantee at all**. Every other structure trades something specific: a tree gives you ordering and pays `log n`, a heap gives you the extreme and gives up everything else. The hash table trades the worst case for the average, and it is usually a good trade.',
    },

    { kind: 'h2', text: 'The idea' },
    {
      kind: 'p',
      text: 'A hash function maps a key to a slot. You compute where a key *must* live when you insert it, and recompute the same value when you look it up — so a lookup is one hash computation plus one array access. There is no traversal, no comparison against other elements, and therefore no reason for the cost to depend on how many elements are stored.',
    },
    {
      kind: 'p',
      text: '`O(1)` is the whole appeal. An array is `O(1)` to read but `O(n)` to search, and the hash table is the attempt to keep the first property while getting rid of the second.',
    },
    {
      kind: 'stepper',
      algoId: 'hash-table',
      caption:
        'Insertion into a hash table. Watch the probe sequence when two keys land in the same bucket.',
      preset: 'roomy',
    },

    { kind: 'h2', text: 'Collisions are not a bug' },
    {
      kind: 'p',
      text: 'A hash function maps from an unbounded key space to a finite number of slots, so by the pigeonhole principle collisions are **guaranteed** once you have more keys than slots. No choice of function avoids this. Two keys simply map to the same bucket, and something has to be done about it.',
    },
    {
      kind: 'p',
      text: 'There are exactly two strategies, and the choice is mostly about cache behaviour rather than about correctness.',
    },

    { kind: 'h3', text: 'Separate chaining' },
    {
      kind: 'p',
      text: 'Each bucket holds a list. Insert is an append. Lookup walks the list, comparing keys. The table is an array of lists.',
    },
    {
      kind: 'ul',
      items: [
        'Insert and delete are trivially correct — no tombstones, no rehash-on-delete.',
        'Memory is one allocation per bucket plus one per node, so it is the more allocation-heavy of the two.',
        'Good cache locality on the list, poor on the table of buckets when it grows large.',
      ],
    },

    { kind: 'h3', text: 'Open addressing' },
    {
      kind: 'p',
      text: 'Every element lives in the array itself. A collision means you probe for another slot — linearly, quadratically, or by a second hash — until you find an empty one. No lists, no per-node allocation, and the whole table is one contiguous block of memory, which is why it is usually the faster one in practice.',
    },
    {
      kind: 'ul',
      items: [
        '**Linear probing** probes `h, h+1, h+2…`. Simple and cache-friendly, but suffers clustering: occupied runs grow, and a long run degrades every lookup that touches it.',
        '**Quadratic probing** probes `h, h+1, h+4, h+9…`. Breaks up clusters, but can fail to find a free slot even when one exists, which forces a fallback probe or a resize.',
        '**Double hashing** uses `h1 + i·h2` with two independent hashes. The most even distribution, and the hardest to reason about.',
      ],
    },
    {
      kind: 'callout',
      tone: 'warn',
      title: 'Deletion needs a tombstone',
      text: 'In open addressing you cannot simply clear a slot. A later lookup probing through that slot treats an empty slot as proof the key is absent — which is what makes probing terminate. Deleting a key therefore leaves a "was occupied" marker, and a table full of tombstones needs rehashing. Chaining has no such problem, which is its main practical advantage.',
    },

    { kind: 'h2', text: 'What O(1) average actually assumes' },
    {
      kind: 'p',
      text: 'The claim rests on load factor and hash quality together. **Load factor** is the ratio of stored elements to slots; past about 0.7, probing sequences lengthen sharply and the average cost climbs. **Hash quality** is how uniformly keys spread — and this is the part that is a *social* assumption rather than a mathematical one.',
    },
    {
      kind: 'p',
      text: 'A hash function that an adversary can predict turns an average case into a worst case. HashDoS is not hypothetical: it is the standard denial-of-service attack against web applications that hash user-supplied strings with an unseeded function. Defending means seeding the function per process, so the same key maps differently in different runs.',
    },
    {
      kind: 'p',
      text: 'This is worth internalising as a habit. **An `O(1)` data structure keyed by untrusted input is only `O(1)` if you seeded the hash.** The guarantee is about the average over keys, and "average over all possible keys" and "average over the keys an attacker chooses" are different distributions.',
    },

    { kind: 'h2', text: 'What a hash table cannot do' },
    {
      kind: 'ul',
      items: [
        '**Ordered iteration.** Keys come out in hash order, which is arbitrary. If you need sorted keys or a range query, use a tree.',
        '**Ordered navigation.** No "next larger key". Every operation is a lookup, never a neighbour query.',
        '**Cheap deletion of arbitrary elements** under open addressing, for the tombstone reason above.',
        '**Worst-case anything.** A deliberately chosen key set can push every operation to `O(n)`.',
      ],
    },
    {
      kind: 'p',
      text: 'Which is the summary: a hash table is the right structure when you are doing *lookups* and do not care about order. The moment order becomes a requirement, the tree is the better tool, and the `log n` is the price of that ordering.',
    },
  ],
};
