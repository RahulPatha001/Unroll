import { byLanguage } from '../../code/anchors.ts';
import { distinctArray, stringWithRun } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isChars } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Longest Substring Without Repeating Characters — the sliding window that
 * turns a naive O(n^2) into a single pass by remembering one thing.
 *
 * The naive version restarts the scan at every start index. The windowed
 * version notices that when a character repeats inside the window, the fix is
 * not to shrink the window by one but to jump `left` straight past the
 * *previous* occurrence — and the only way to know where that is is to keep a
 * last-seen index per character. That table is the whole trick, and it is why
 * this is linear rather than quadratic: every character enters the window once
 * and `left` never moves backwards.
 *
 * The presets are built around how far `left` travels, because that is the only
 * thing that varies: `all-distinct` never moves it, `one-slip` moves it once by
 * one, `far-repeat` moves it once by four, and `cramped` shoves it along on
 * almost every character. Same answer for the first and third is deliberate —
 * the *work* is what the animation is teaching, not the number at the end.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 2400;

/** `distinctArray` over 0..25 mapped to letters: a string with no repeats at all. */
const lettersOf = (seed: number, length: number): string =>
  distinctArray(seed, length, 0, 25)
    .map((k) => String.fromCharCode(97 + k))
    .join('');

/** Copy the string and make position `at` a repeat of position `from`. */
const withRepeatAt = (s: string, from: number, at: number): string => {
  const chars = [...s];
  chars[at] = s[from] as string;
  return chars.join('');
};

const ALL_DISTINCT = lettersOf(SEED, 9);
const ONE_SLIP = withRepeatAt(lettersOf(SEED + 4, 12), 0, 6);
const FAR_REPEAT = withRepeatAt(lettersOf(SEED + 12, 12), 3, 9);
const CRAMPED = stringWithRun(SEED + 32, 14, 1);

const PRESETS: Preset[] = [
  {
    id: 'all-distinct',
    label: 'No repeats at all',
    blurb:
      'Nine different letters, so no character is ever seen twice. The last-seen table fills up and is never read, `left` stays at 0, and the answer is the whole string — the case where the "jump" logic does nothing.',
    input: { type: 'chars', values: ALL_DISTINCT },
  },
  {
    id: 'one-slip',
    label: 'One character, one step',
    blurb:
      'Twelve distinct letters with the first letter repeated at index 6. `left` moves exactly once and by exactly one, so the window is barely disturbed and the answer is eleven.',
    input: { type: 'chars', values: ONE_SLIP },
  },
  {
    id: 'far-repeat',
    label: 'One character, four steps',
    blurb:
      'The same shape of trap, but the repeat is nine positions after its first appearance. One frame throws `left` four steps forward, discarding four perfectly good characters in a single move — the last-seen table is what makes that jump safe.',
    input: { type: 'chars', values: FAR_REPEAT },
  },
  {
    id: 'cramped',
    label: 'Three letters, heavy traffic',
    blurb:
      'Fourteen characters drawn from just three letters, so a repeat turns up every other step and `left` is shoved forward almost constantly. The window can never be longer than three, whatever the string length.',
    input: { type: 'chars', values: CRAMPED },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

export function* longestSubstring(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'chars'; values: string };
  const source = isChars(ctx.input) ? ctx.input.values : input.values;
  const size = Number(ctx.params.size ?? source.length);
  const values = [...source].slice(0, Math.max(0, size));
  const n = values.length;

  let ops = 0;
  let left = 0;
  let best = 0;
  let bestLeft = 0;
  /** The last index each character was seen at. This is the whole data structure. */
  const seen = new Map<string, number>();

  /** One readout per character, so the table is visible and not just claimed. */
  const table = (): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [c, i] of seen) out[c] = i;
    return out;
  };

  const window = (): number[] => range(left, right + 1);
  const gone = (): number[] => range(0, left);
  const answer = (): number[] => (best > 0 ? range(bestLeft, bestLeft + best) : []);

  let right = -1;
  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    note:
      n === 0
        ? 'The string is empty, so the longest substring without repeats is the empty one: length 0.'
        : `The window starts empty and the last-seen table starts empty. Both pointers only ever move right, so a character can be discarded from the window but never has to be re-read.`,
    values: [...values],
    mode: 'char',
    pointers: { left, right: 0 },
    highlight: { unvisited: range(0, n) },
    vars: { n, left, right: 0, best, ...table() },
  };

  for (right = 0; right < n; right++) {
    if (ctx.shouldStop()) return;
    ops++;
    const c = values[right] as string;
    const previous = seen.get(c);

    yield {
      kind: 'array',
      index: 0,
      anchor: 'extend',
      caption: `Step ${ops}`,
      note:
        previous === undefined
          ? `"${c}" has never been seen, so the window can simply grow to include it. Nothing is recorded yet — the table is written at the end of the step, which is the order that makes the *next* lookup correct.`
          : `"${c}" is new to the window but not to the string: it was last seen at index ${previous}. The window grows to ${right - left + 1} characters wide, and the step after this decides what to do about that.`,
      values: [...values],
      mode: 'char',
      pointers: { left, right },
      highlight: { window: window(), unvisited: range(right + 1, n), outOfPlace: gone() },
      ops,
      vars: { right, left, len: right - left + 1, best, previous: previous ?? -1, ...table() },
    };

    if (previous !== undefined) {
      const from = previous + 1;
      const was = left;
      left = from > left ? from : left;
      yield {
        kind: 'array',
        index: 0,
        anchor: 'shrink',
        caption: `Step ${ops}`,
        note:
          from > was
            ? `A repeat. \`left\` jumps from ${was} straight to ${left}, past the earlier "${c}" at index ${previous} and every character between — the window is free of duplicates in a single move rather than by repeated single steps.`
            : `The earlier "${c}" at index ${previous} is already outside the window, so \`left\` stays at ${left}. The \`max\` on this line is the whole reason the algorithm is still linear: \`left\` can be *asked* to move backwards, and it simply refuses.`,
        values: [...values],
        mode: 'char',
        pointers: { left, right },
        highlight: { window: window(), unvisited: range(right + 1, n), outOfPlace: gone() },
        ops,
        vars: { right, left, len: right - left + 1, best, jumped: from, ...table() },
      };
    }

    seen.set(c, right);

    if (right - left + 1 > best) {
      best = right - left + 1;
      bestLeft = left;
      yield {
        kind: 'array',
        index: 0,
        anchor: 'update',
        caption: `Step ${ops}`,
        note: `The window is now ${best} characters long and that beats every window seen so far, so the best answer moves to "${values.slice(bestLeft, bestLeft + best).join('')}" at indices ${bestLeft} to ${bestLeft + best - 1}. The best only ever grows, so this branch stops firing at some point.`,
        values: [...values],
        mode: 'char',
        pointers: { left: bestLeft, right: bestLeft + best - 1 },
        highlight: { answer: answer(), window: window(), outOfPlace: gone() },
        ops,
        vars: { best, bestLeft, ...table() },
      };
    }
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'done',
    note:
      best === 0
        ? 'Nothing was ever recorded, so the answer is 0.'
        : `The right pointer reached the end with a best window of ${best} characters, "${values.slice(bestLeft, bestLeft + best).join('')}". ${ops} step${ops === 1 ? '' : 's'} in total, and the string was read exactly once.`,
    values: [...values],
    mode: 'char',
    pointers: { left: bestLeft, right: bestLeft + best - 1 },
    highlight: { answer: answer() },
    result: best > 0 ? 'found' : 'not-found',
    ops,
    vars: { best, bestLeft, ops },
  };
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'text',
      label: 'String',
      kind: 'text' as const,
      default: PRESETS[0]?.input.type === 'chars' ? PRESETS[0].input.values : '',
      maxLength: 200,
    },
  ],
  build: (values: Record<string, unknown>): AlgoInput => ({
    type: 'chars',
    values: typeof values.text === 'string' ? values.text : '',
  }),
  sizeOf: (input: AlgoInput): number => (input.type === 'chars' ? input.values.length : 0),
};

/* ------------------------------------------------------------------ *
 * 4. The lesson — four languages, one set of anchors
 * ------------------------------------------------------------------ */

const JS = `function longestSubstring(s) {
  const seen = new Map();                            // @anchor start
  let left = 0, best = 0, bestStart = 0;
  for (let right = 0; right < s.length; right++) {    // @anchor extend
    const c = s[right];
    const previous = seen.get(c);
    if (previous !== undefined) left = Math.max(left, previous + 1);  // @anchor shrink
    seen.set(c, right);
    if (right - left + 1 > best) {                    // @anchor update
      best = right - left + 1;
      bestStart = left;
    }
  }
  return best;                                        // @anchor done
}`;

const PY = `def longest_substring(s):
    seen = {}                                         # @anchor start
    left = best = best_start = 0
    for right, c in enumerate(s):                    # @anchor extend
        previous = seen.get(c)                        # @anchor shrink
        if previous is not None:
            left = max(left, previous + 1)
        seen[c] = right
        if right - left + 1 > best:                   # @anchor update
            best = right - left + 1
            best_start = left
    return best                                       # @anchor done`;

const JAVA = `import java.util.HashMap;
import java.util.Map;

class LongestSubstring {
    static int longestSubstring(String s) {
        Map<Character, Integer> seen = new HashMap<>();    // @anchor start
        int left = 0, best = 0, bestStart = 0;
        for (int right = 0; right < s.length(); right++) {  // @anchor extend
            char c = s.charAt(right);
            Integer previous = seen.get(c);           // @anchor shrink
            if (previous != null) left = Math.max(left, previous + 1);
            seen.put(c, right);
            if (right - left + 1 > best) {            // @anchor update
                best = right - left + 1;
                bestStart = left;
            }
        }
        return best;                                  // @anchor done
    }
}`;

const CPP = `#include <algorithm>
#include <string>
#include <vector>
using std::string;
using std::vector;

int longest_substring(const string& s) {
    vector<int> seen(256, -1);                        // @anchor start
    int left = 0, best = 0, bestStart = 0;
    for (int right = 0; right < (int)s.size(); right++) {   // @anchor extend
        unsigned char c = (unsigned char)s[right];
        int previous = seen[c];                       // @anchor shrink
        if (previous != -1) left = std::max(left, previous + 1);
        seen[c] = right;
        if (right - left + 1 > best) {                // @anchor update
            best = right - left + 1;
            bestStart = left;
        }
    }
    return best;                                      // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'The last-seen table is the algorithm. A Map is used rather than a plain object because a string can be any character, and a key like __proto__ is a real hazard with objects and not with maps. Unlike the C++ listing it also grows on demand instead of being sized up front.',
    python:
      'A dict keyed by one-character strings. Python dicts preserve insertion order and answer a missing key with `None` rather than throwing, so there is no separate "does this key exist" check — the JavaScript version needs one because `Map.get` returns `undefined`, which is also what a stored `undefined` would return.',
    java: 'A `HashMap` keyed by the boxed `Character`, so every lookup boxes a char and every write boxes an `Integer`. An `int[128]` would be faster and is what most production code does; the map is here because it puts the emphasis on the data structure rather than on the array bounds that come with it.',
    cpp: 'A fixed 256-entry table of last-seen indices, one per possible byte, pre-filled with -1 so "never seen" and "seen at 0" are different values. This is O(1) per lookup with no allocation per character, but it is bounded by the alphabet — a `std::map<char,int>` would cover any input at the cost of a tree walk per step.',
  },
  extend: {
    javascript:
      'The window grows by exactly one character per iteration, and `right` never goes back. That is what makes the whole thing linear rather than quadratic: the naive version also only ever reads each character once per *start index*, which is the part that costs n^2.',
    python:
      '`enumerate` gives the index and the character in one pass, where the other three languages index the string explicitly. Note that a Python `str` is not an array of characters but a sequence of code points, so a multi-byte UTF-8 character is one iteration, not four bytes.',
    java: '`s.charAt(right)` is a method call on an immutable `String` and returns a `char`, so nothing is allocated. An older idiom copies into a `char[]` once with `getChars` to avoid the per-character bounds check; the modern JIT usually elides it entirely.',
    cpp: '`unsigned char` is the key type, so a `char` above 127 indexes the table positively instead of reading out of bounds. Casting to `unsigned char` is the standard idiom in every C and C++ `<cctype>`-style table lookup, and forgetting it is a bug that only shows up on non-ASCII input.',
  },
  shrink: {
    javascript:
      '`Math.max` rather than a bare assignment is the load-bearing detail: the previous occurrence can be *behind* `left` already, and assigning unconditionally would drag the window backwards and turn a linear pass into a quadratic one. A frame that asks `left` to retreat shows it refusing.',
    python:
      'The `previous is not None` test is the whole guard, and Python needs no sentinel: a missing key is `None` rather than `-1`, so the table needs no pre-filling — the opposite trade from the C++ listing, which pays 256 writes up front to make the inner test a single comparison.',
    java: 'Two steps in one line, and both matter. The null test is the "never seen" check that Python gets from `is not None` and JavaScript from `!== undefined`; the `Math.max` is what stops `left` moving backwards. A boxed `Integer` here means an allocation-free null check but a `int` would have needed a separate presence flag.',
    cpp: '`std::max` rather than a bare assignment is the load-bearing detail, and `previous != -1` is the presence check the -1 sentinel buys. Note the table is never rolled back when `left` moves: it still holds a stale index for a character that has left the window, and the `max` is what makes that staleness harmless.',
  },
  update: {
    javascript:
      'A running maximum over a quantity that is *not* monotone — the window can grow and shrink — so the branch fires only on genuinely new records. Once it stops firing the rest of the loop is doing window maintenance only, which is the shape of most linear-time optimisations: a hot inner loop and a rarely-taken bookkeeping branch.',
    python:
      'The record is both the length and where it starts, so a caller who wants the substring itself gets it for free. Keeping only the length would be one variable cheaper and would leave the caller with no way to recover the window without a second pass.',
    java: 'The record stores the length and the start, in two `int`s that survive the loop. Nothing here is allocated, so the whole method runs in constant space no matter how long the string is — the property that distinguishes the windowed version from the slice-and-check one.',
    cpp: 'The record is written into the same two locals for the same reason. Note the subtraction order: `right - left + 1` is the window length, and writing it as `right - left` and correcting later is the off-by-one that makes this algorithm return one character too many.',
  },
  done: {
    javascript:
      'A single integer, and `bestStart` is deliberately *not* returned: the function is asking for a length, and a caller who needs the substring re-derives it. Returning an object here would work in JavaScript and Python but has no honest equivalent in Java, which is why the lesson returns the primitive in all four.',
    python:
      'A single integer, matching the other three. Python could return a tuple `(best, best_start)` and the harness would flatten it, but then Java and C++ would have to invent a pair type and the four listings would stop being line-for-line comparable.',
    java: 'A single `int`, chosen so the four return types agree. There is no way to return a substring cheaply in Java — every substring is a fresh object — which is the concrete reason a length is the honest return value here.',
    cpp: 'A single `int`. C++ could return a `std::string_view` into the input at zero cost, which is genuinely the best answer in this language and is worth knowing about: it is the one case in the family where the modern standard library gives you something the other three cannot.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'longestSubstring',
    python: 'longest_substring',
    java: 'LongestSubstring.longestSubstring',
    cpp: 'longest_substring',
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

const textOf = (p: Preset): string => (p.input.type === 'chars' ? p.input.values : '');

/**
 * The claim, computed the slow obvious way: try every substring and keep the
 * longest one whose characters are all distinct. O(n^2) on a 14-character
 * string is free, and it is a genuinely *different* algorithm from the windowed
 * one — which is the point: the expectation should not be a transcription of the
 * listing it is checking.
 */
const longestDistinctOf = (s: string): number => {
  let best = 0;
  for (let i = 0; i < s.length; i++) {
    const used = new Set<string>();
    for (let j = i; j < s.length; j++) {
      const c = s[j] as string;
      if (used.has(c)) break;
      used.add(c);
      if (j - i + 1 > best) best = j - i + 1;
    }
  }
  return best;
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const text = textOf(p);
  return { presetId: p.id, args: [text], result: longestDistinctOf(text) };
});

export const longestSubstringAlgo: AlgoDef<ArrayFrame> = {
  id: 'longest-substring',
  title: 'Longest Substring Without Repeating Characters',
  category: 'sliding-window',
  summary:
    'Slide a window over the string, remembering where each character was last seen, and when a repeat turns up jump the left edge straight past the earlier copy instead of creeping forward one step at a time.',
  intuition:
    'Reach for this whenever a constraint is "no item may appear twice in the window" — a password-strength scan, a log file looking for the longest stretch with no repeated user id, a UI limit like "no duplicate characters in a username". The specific insight worth stealing is the jump: most window problems slide one edge by one, but when the violated condition identifies *which* item conflicts, you can jump directly to the conflict and skip everything in between. That is the difference between a window that is merely correct and one that is also the fastest you can write, and it generalises to any "no duplicates in a contiguous range" question — subarrays with distinct elements, longest substring with at most k distinct, and so on.',
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(min(n, alphabet))',
    note: 'Linear, not quadratic, and the `Math.max` on the shrink step is the reason: without it `left` can be dragged backwards. The space is the alphabet, not the input — which is why a fixed 256-entry table in C++ is a constant and a `Map` in JavaScript is O(distinct characters seen).',
  },
  traits: {
    inPlace: true,
    online: true,
    allowsDuplicates: true,
    tags: ['single pass', 'no extra copy of the input', 'amortised O(1) per character'],
  },
  viewport: 'array',
  level: 'intermediate',
  params: [
    {
      key: 'size',
      label: 'Characters',
      kind: 'number',
      min: 1,
      max: 80,
      step: 1,
      default: 16,
      regeneratesInput: true,
      help: 'Truncates the string before the scan starts.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: longestSubstring,
  lesson,
  expectations,
  formatResult: (r) => `${r as number} characters`,
  anchors: ['start', 'extend', 'shrink', 'update', 'done'],
};

export default longestSubstringAlgo;
