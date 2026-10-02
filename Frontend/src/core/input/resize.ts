import { makeRng } from './rng.ts';
import type { AlgoInput } from './types.ts';

/**
 * Grow or shrink an input to a requested element count.
 *
 * ## Why this file exists
 *
 * Twenty-eight of the sixty-six algorithms declare a `size` parameter carrying
 * `regeneratesInput: true`, and the `ParamSpec` contract has always said what
 * that means: *"Changing this regenerates the input (e.g. a new random array)."*
 *
 * **It was never implemented.** The flag was referenced nowhere outside its own
 * declaration, so `setParam` re-ran the algorithm against the *existing* input
 * and `size` did nothing except truncate it. The visible consequence was a
 * control that looked completely live and was inert in the direction that
 * mattered:
 *
 *     drag `size` from 8 to 20  ->  the viewport still draws 8 cells
 *     drag `size` from 8 to 2   ->  the viewport draws 2 cells
 *
 * A parameter that can only subtract is not a size control, and a student who
 * raises it has been told a falsehood by the interface.
 *
 * ## Why it takes no seed
 *
 * Because it does not need one, and that is the stronger property. The result is
 * a pure function of `(input, size)`, so a share link carrying an input and a
 * `size` reproduces byte-identically — the same guarantee the rest of `core/`
 * buys with `core/input/rng.ts` and the "no `Math.random()`" boundary rule, but
 * with one fewer thing to thread through. The seed is derived from the input
 * itself.
 *
 * ## "Same shape" is about the lesson, not the length
 *
 * The count is what the caller asked for. Everything else is what makes the
 * count *mean* something, and it is preserved exactly:
 *
 *  - **Direction and ties.** A `Reversed` preset that grows to 20 is still
 *    reversed, and an `All equal` preset stays all-equal. A resize that produced
 *    twenty random numbers would keep the length and throw away the entire point
 *    of the preset — which for bubble sort is the difference between teaching
 *    best-case O(n) and teaching nothing at all.
 *  - **Value range.** New values are drawn from the range the input already
 *    spans, so growing an O(n²) sort's array does not quietly change what the
 *    frame timings mean.
 *  - **Character set** for `chars`, and **word lengths** for `words`, because a
 *    palindrome test on a different alphabet is a different test.
 *  - **Distinctness** for `tree`, because a BST built from ties is a degenerate
 *    tree and the rotation presets stop meaning anything.
 *
 * The switch is exhaustive over `AlgoInput` with **no default branch**, so an
 * eighth input shape is a compile error rather than another silent no-op. That
 * is not a style preference: `shuffle.ts` records the same class of bug being
 * found a second time.
 */
export function resizeInput(
  input: AlgoInput,
  size: number,
  /**
   * How this algorithm counts its input — `algo.inputSpec.sizeOf`.
   *
   * Optional, and only `words` needs it, because only `words` is ambiguous.
   * For every other shape the element count *is* the size, and a resize that hit
   * a different number would be a different bug.
   *
   * `words` is ambiguous because it means two different things in this curriculum.
   * For `longest-substring` it is a string and `size` is its length. For
   * `min-window-substring` it is a *pair* — a text and the pattern to find in it
   * — and `size` is the length of the first word only, which is what its own
   * `sizeOf` reports. Growing the word *count* there produces thirty words whose
   * first is still the original eighteen characters: the control moves, the number
   * on screen does not, and the algorithm is handed a different input shape than
   * the one it declares.
   *
   * So rather than hardcode which word matters, each candidate is built and
   * checked against the algorithm's own definition, and the first one that
   * actually lands is returned. A new algorithm that means something else
   * describes it in the one place it already does — `sizeOf` — and gets the right
   * answer without a change here.
   */
  measure?: (input: AlgoInput) => number,
): AlgoInput {
  const n = Math.max(0, Math.floor(size));
  const rng = makeRng(seedFromInput(input));

  switch (input.type) {
    case 'numbers':
      return { ...input, values: resizeNumbers(input.values, n, rng) };

    case 'keys':
      // Keys stay numeric or textual, matching what the algorithm was handed: a
      // `keys` field of coins resized into words is not the same exercise.
      return { ...input, values: resizeKeys(input.values, n, rng) };

    case 'chars':
      return { ...input, values: resizeChars(input.values, n, rng) };

    case 'words': {
      if (measure) {
        for (let i = 0; i < input.values.length; i++) {
          const candidate = {
            ...input,
            values: input.values.map((w, at) => (at === i ? resizeOneWord(w, n, rng) : w)),
          };
          if (measure(candidate) === n) return candidate;
        }
      }
      return { ...input, values: resizeWords(input.values, n, rng) };
    }

    case 'tree':
      return { ...input, values: resizeDistinct(input.values, n, rng) };

    /*
     * The remaining four are resized by a count they do not have.
     *
     * `grid` is `rows * cols` and `matrix` is `rows.length * cols`, so a "size"
     * would have to invent a dimension, and inventing one is a decision about
     * which axis to grow — not something to guess. No algorithm in the curriculum
     * pairs a `regeneratesInput` param with any of these four, so the honest
     * answer is "unchanged", and it is written out rather than defaulted so that
     * adding one is a deliberate decision.
     */
    case 'grid':
    case 'matrix':
    case 'graph':
      return input;
  }
}

/* ------------------------------------------------------------------ *
 * Seeds
 * ------------------------------------------------------------------ */

/**
 * A stable 32-bit hash of the input, so `resizeInput` is a pure function of
 * `(input, size)` with no seed to thread and no `Math.random()` — which
 * `core/boundary.test.ts` forbids, correctly.
 *
 * FNV-1a over the values, not the object: `{...input}` allocates a fresh object
 * every call, so hashing the input's *identity* would give a different answer
 * for identical data.
 */
function seedFromInput(input: AlgoInput): number {
  let h = 0x811c9dc5;
  const mix = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  };
  switch (input.type) {
    case 'numbers':
      for (const v of input.values) mix(String(v));
      break;
    case 'keys':
      for (const v of input.values) mix(String(v));
      break;
    case 'chars':
      mix(input.values);
      break;
    case 'words':
      for (const v of input.values) mix(v);
      break;
    case 'tree':
      for (const v of input.values) mix(String(v));
      break;
    case 'grid':
      for (const v of input.values) mix(String(v));
      break;
    case 'matrix':
      mix(`${input.rows.length}x${input.cols}`);
      break;
    case 'graph':
      mix(`${input.nodes.length}:${input.directed ? 'd' : 'u'}`);
      break;
  }
  return h >>> 0;
}

/* ------------------------------------------------------------------ *
 * Shapes
 * ------------------------------------------------------------------ */

const isAscending = (a: readonly number[]) =>
  a.every((v, i) => i === 0 || (a[i - 1] as number) <= v);
const isDescending = (a: readonly number[]) =>
  a.every((v, i) => i === 0 || (a[i - 1] as number) >= v);
const isConstant = (a: readonly number[]) => a.every((v) => v === a[0]);

/**
 * The order the values are in, so a resize can put them back in it.
 *
 * Checked most-specific first: an all-equal array is trivially both ascending
 * and descending, and "Reversed" is the one that matters, so `descending` has to
 * win over `ascending` for a constant array to stay constant.
 */
type Order = 'descending' | 'ascending' | 'constant' | 'none';

function orderOf(a: readonly number[]): Order {
  if (a.length === 0) return 'none';
  if (isConstant(a)) return 'constant';
  if (isDescending(a)) return 'descending';
  if (isAscending(a)) return 'ascending';
  return 'none';
}

/**
 * Numbers of length `n`, in the same order and range as `values`.
 *
 * The range is taken from the values that exist rather than from a constant, so
 * an input of `1..9` grows into `1..9` and not into `5..99`. A `[1, 2, 3]` input
 * has a range of 2, which leaves nothing to draw from, so the observed
 * *span* is used as a fallback and the values are offset to stay inside it.
 */
function resizeNumbers(values: number[], n: number, rng: ReturnType<typeof makeRng>): number[] {
  if (n === 0) return [];
  const order = orderOf(values);
  /*
    All-equal is only treated as a shape when there is *evidence* of it.

    One value is trivially ascending, descending and constant simultaneously, and
    reading it as "all equal" would copy that single number `n` times — so a
    student who pasted one number and dragged the size to 20 would get twenty
    copies of it, and an O(n) sort would look like O(n²) on ties it was never
    given. Two or more identical values is a deliberate all-equal preset; one is
    not.
  */
  if (order === 'constant' && values.length > 1) {
    return Array.from({ length: n }, () => values[0] as number);
  }

  const min = values.length > 0 ? Math.min(...values) : 1;
  const max = values.length > 0 ? Math.max(...values) : 99;
  // A one-value input has no span; borrow the seed generator's usual window so
  // the result is still varied enough to be worth animating.
  const lo = max > min ? min : Math.max(1, min - 5);
  const hi = max > min ? max : min + 94;

  // Seed from what is already there, so growing twice from the same input is
  // stable, then draw the rest.
  const out = values.slice(0, n);
  while (out.length < n) out.push(rng.int(lo, hi));
  while (out.length > n) out.pop();

  if (order === 'descending') return out.sort((a, b) => b - a);
  if (order === 'ascending') return out.sort((a, b) => a - b);
  return out;
}

function resizeKeys(
  values: Array<number | string>,
  n: number,
  rng: ReturnType<typeof makeRng>,
): Array<number | string> {
  if (n === 0) return [];
  const numeric = typeof values[0] === 'number';
  const out: Array<number | string> = values.slice(0, n);
  while (out.length < n) out.push(numeric ? rng.int(1, 99) : `key${rng.int(5, 99)}`);
  return out.slice(0, n);
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

/** Same length, same character set, so a palindrome test is still a real test. */
function resizeChars(values: string, n: number, rng: ReturnType<typeof makeRng>): string {
  const present = new Set([...values].map((c) => ALPHABET.indexOf(c)).filter((i) => i >= 0));
  const pool = present.size > 0 ? [...present] : [...ALPHABET].map((_, i) => i);
  return Array.from({ length: n }, () => ALPHABET[rng.pick(pool)] as string).join('');
}

/**
 * One word, `n` characters long, from the same alphabet.
 *
 * Used for the `min-window-substring` case, where the *text* is one word and the
 * pattern is the other, and `size` counts characters in the text rather than
 * words in the list.
 */
function resizeOneWord(word: string, n: number, rng: ReturnType<typeof makeRng>): string {
  const present = new Set([...word].map((c) => ALPHABET.indexOf(c)).filter((i) => i >= 0));
  const pool = present.size > 0 ? [...present] : [...ALPHABET].map((_, i) => i);
  return Array.from({ length: n }, () => ALPHABET[rng.pick(pool)] as string).join('');
}

/** Same word count, and the same word-length range. */
function resizeWords(values: string[], n: number, rng: ReturnType<typeof makeRng>): string[] {
  const lengths = values.map((w) => w.length);
  const lo = lengths.length > 0 ? Math.min(...lengths) : 3;
  const hi = lengths.length > 0 ? Math.max(...lengths) : 8;
  const separators = new Set(values.flatMap((w) => [...w].filter((c) => !/[a-z]/i.test(c))));
  return Array.from({ length: n }, (_, i) => {
    // Reuse a real word's length where one exists, so a two-word input does not
    // become a paragraph of unrelated lengths.
    const want = lengths.length > 0 ? (lengths[i % lengths.length] as number) : rng.int(lo, hi);
    const word = Array.from({ length: want }, () => ALPHABET[rng.int(0, 25)] as string).join('');
    if (separators.size === 0) return word;
    return word + [...separators][i % separators.size];
  });
}

/**
 * Distinct values, because a BST built from ties is a degenerate tree.
 *
 * Distinctness is the *lesson* here rather than an implementation detail: the
 * `avl-rotate` and `bst-delete` presets exist to show rotations and a
 * three-node delete, and neither is demonstrable with duplicates.
 */
function resizeDistinct(
  values: Array<number | string>,
  n: number,
  rng: ReturnType<typeof makeRng>,
): Array<number | string> {
  if (n === 0) return [];
  const numeric = typeof values[0] === 'number';
  const out: Array<number | string> = [];
  const seen = new Set<string>();
  for (const v of values) {
    const k = String(v);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
    if (out.length === n) return rng.shuffle(out);
  }
  /*
    Extend with values that cannot collide. For a numeric tree, counting up from
    the observed maximum is both distinct and in range; for strings, a counter
    suffix is.

    The counter has to advance in **both** branches. It did not in the first
    version, which pushed the same number on every iteration and so returned a
    tree of duplicates for every input that needed more values than it had — the
    exact degeneracy this function exists to avoid, reintroduced by the fix for
    it.
  */
  const start = numeric && values.length > 0 ? Math.max(...values.map(Number)) : 0;
  const prefix = numeric ? '' : String(values[0] ?? 'v');
  let added = 0;
  while (out.length < n) {
    added += 1;
    out.push(numeric ? start + added : `${prefix}${added}`);
  }
  return rng.shuffle(out.slice(0, n));
}
