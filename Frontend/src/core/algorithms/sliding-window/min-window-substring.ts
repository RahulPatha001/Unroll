import { byLanguage } from '../../code/anchors.ts';
import { stringPairWithLcs, stringWithRun } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Minimum Window Substring — the sliding window that has to *hold* a whole
 * pattern before it will move.
 *
 * Compare this with longest-substring, which shrinks on a duplicate. Here the
 * window is allowed to grow freely and shrinks only while it is *already* valid,
 * and the two moves interleave in a way that produces the real lesson: the
 * window must be allowed to grow, so `right` runs ahead, and every time the
 * window becomes valid the left edge is pushed in as far as it can go before
 * `right` advances again. A window that is valid but not yet minimal is wasted
 * work, and a window that is shrunk too eagerly loses the answer entirely.
 *
 * The two failure presets are the interesting ones. `shared-subsequence` uses a
 * generated pair of strings that provably share a long *subsequence* and share
 * no contiguous window at all — the gap between the two words is the lesson.
 * `pattern-longer-than-text` never enters the loop, because a pattern longer
 * than its text cannot be a substring of it, and the honest return value is the
 * empty string rather than null.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 1201;

const PRESETS: Preset[] = [
  {
    id: 'both-long',
    label: 'Two long strings',
    blurb:
      'An 18-character text against a 6-character pattern, both drawn from a three-letter alphabet. The first valid window is nowhere near minimal, and the shrink loop has to be patient before the answer of 7 shows up.',
    input: {
      type: 'words',
      values: [stringWithRun(SEED, 18, 6), stringWithRun(SEED + 2, 6, 2)],
    },
  },
  {
    id: 'short-target',
    label: 'A tiny pattern',
    blurb:
      'The pattern is two characters long and the text has a run of eight, so the smallest possible window is found almost immediately. The shrink loop does real work here: it walks `left` all the way to the end of the text without ever reporting a window.',
    input: {
      type: 'words',
      values: [stringWithRun(SEED + 4, 20, 8), stringWithRun(SEED + 6, 2, 1)],
    },
  },
  {
    id: 'shared-subsequence',
    label: 'Shared subsequence only',
    blurb:
      'These two strings provably share a long subsequence and share no contiguous window whatsoever. The scan runs to the end having found nothing, and the answer is the empty string — "not found" with a shape all four languages can agree on.',
    input: { type: 'words', values: stringPairWithLcs(SEED + 12, 12) },
  },
  {
    id: 'pattern-longer-than-text',
    label: 'Pattern longer than the text',
    blurb:
      'A four-character text and a nine-character pattern. The loop never runs, because no window in a four-character string can contain a nine-character pattern — the length guard on the first line is the whole answer.',
    input: {
      type: 'words',
      values: [stringWithRun(SEED + 16, 4, 1), stringWithRun(SEED + 20, 9, 3)],
    },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

export function* minWindowSubstring(ctx: RunContext): Generator<ArrayFrame> {
  const words = (ctx.input.type === 'words' ? ctx.input.values : []) as string[];
  const source = words[0] ?? '';
  const pattern = words[1] ?? '';
  const size = Number(ctx.params.size ?? source.length);
  const values = [...source].slice(0, Math.max(0, size));
  const tChars = [...pattern];
  const n = values.length;

  let ops = 0;
  /** Outstanding requirement per character: `need - (count in window)`. */
  const need = new Map<string, number>();
  let have = 0;
  let left = 0;
  let right = -1;
  let bestStart = 0;
  let bestLen = -1;

  /** The requirement table as one readable string, e.g. `a:2 b:1 c:1`. */
  const needText = (): string => {
    const parts: string[] = [];
    for (const [c, k] of need) parts.push(`${c}:${k}`);
    return parts.length > 0 ? parts.join(' ') : '(empty)';
  };

  const window = (): number[] => (right < left ? [] : range(left, right + 1));
  const answer = (): number[] => (bestLen > 0 ? range(bestStart, bestStart + bestLen) : []);
  /** `bestLen` is -1 until a window is found, so the answer cursor needs a guard. */
  const answerCursor = (): Record<string, number> =>
    bestLen > 0 ? { left: bestStart, right: bestStart + bestLen - 1 } : { left: 0, right: 0 };
  /** The overlay marker only exists while the cursor is over the pattern row. */
  const patternCursor = (): Record<string, number> =>
    right >= 0 && right < tChars.length ? { i: right } : {};
  const patternRow = {
    label: 'pattern t',
    values: [...tChars],
    mode: 'char' as const,
  };

  const hopeless = tChars.length === 0 || tChars.length > n;

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    note: hopeless
      ? tChars.length === 0
        ? 'The pattern is empty, so every window contains it and the shortest one is the empty string. No scan needed.'
        : `The pattern is ${tChars.length} characters and the text is only ${n}. No window inside a ${n}-character string can hold a ${tChars.length}-character pattern, so the answer is the empty string and the loop never starts.`
      : `Two cursors on the ${n}-character text, and the ${tChars.length}-character pattern laid out underneath as a reference row. The window starts empty; it grows on the right and shrinks on the left only while it is already a valid match.`,
    values: [...values],
    mode: 'char',
    pointers: { left, right: 0 },
    highlight: { unvisited: range(0, n) },
    overlay: { ...patternRow, pointers: {} },
    vars: { n, pattern: tChars.length, left, right: 0, have: 0 },
  };

  if (hopeless) {
    yield {
      kind: 'array',
      index: 0,
      anchor: 'done',
      note: 'Nothing to search. Return the empty string: a real value with a real length, not null and not -1, so every language returns the same thing.',
      values: [...values],
      mode: 'char',
      highlight: {},
      overlay: { ...patternRow, pointers: {} },
      result: 'not-found',
      ops,
      vars: { n, pattern: tChars.length, ops },
    };
    return;
  }

  for (let k = 0; k < tChars.length; k++) {
    if (ctx.shouldStop()) return;
    ops++;
    const c = tChars[k] as string;
    need.set(c, (need.get(c) ?? 0) + 1);

    yield {
      kind: 'array',
      index: 0,
      anchor: 'need',
      caption: `Pattern ${k + 1} of ${tChars.length}`,
      note:
        k === 0
          ? `The pattern needs "${c}", so its outstanding requirement rises to ${need.get(c) as number}. Counting the pattern up front is what makes the inner loop O(1) per character — a membership test alone cannot tell whether the window holds *enough* copies, and "enough" is the whole condition.`
          : `The pattern needs another "${c}", so its requirement rises to ${need.get(c) as number}. Outstanding requirements across the pattern: ${needText()}.`,
      values: [...values],
      mode: 'char',
      pointers: { left: 0, right: 0 },
      highlight: { unvisited: range(0, n) },
      overlay: { ...patternRow, pointers: { i: k } },
      ops,
      vars: { distinct: need.size, requirement: needText() },
    };
  }

  const distinct = need.size;

  for (right = 0; right < n; right++) {
    if (ctx.shouldStop()) return;
    ops++;
    const c = values[right] as string;
    const inPattern = need.has(c);
    if (inPattern) {
      need.set(c, (need.get(c) as number) - 1);
      if (need.get(c) === 0) have = have + 1;
    }

    yield {
      kind: 'array',
      index: 0,
      anchor: 'extend',
      caption: `Right ${right} of ${n - 1}`,
      note: inPattern
        ? `"${c}" is part of the pattern, and its requirement drops from ${(need.get(c) as number) + 1} to ${need.get(c) as number}${need.get(c) === 0 ? ` — zero outstanding, so the window is now complete (${have} of ${distinct} characters satisfied)` : ''}. The window grows; the left edge does not move.`
        : `"${c}" is not part of the pattern, so it is a passenger: the window grows, nothing is satisfied, and the left edge still cannot move. Passing characters are why the answer is often longer than the pattern.`,
      values: [...values],
      mode: 'char',
      pointers: { left, right },
      highlight: { window: window(), unvisited: range(right + 1, n) },
      overlay: { ...patternRow, pointers: patternCursor() },
      ops,
      vars: { right, left, have, distinct, need: needText() },
    };

    // Shrink as far as the window will go, and only while it is a valid match.
    while (have === distinct && left <= right) {
      if (ctx.shouldStop()) return;
      ops++;
      const width = right - left + 1;
      const was = left;

      if (bestLen < 0 || width < bestLen) {
        const was = bestLen;
        bestLen = width;
        bestStart = left;
        yield {
          kind: 'array',
          index: 0,
          anchor: 'update',
          caption: `Right ${right} of ${n - 1}`,
          note: `The window [${left}, ${right}] is ${width} characters and still contains the whole pattern, so it is a candidate — ${was < 0 ? 'the first complete window so far' : `shorter than the previous best of ${was}`}. Record it as "${values.slice(left, right + 1).join('')}". This is the only place the answer is written.`,
          values: [...values],
          mode: 'char',
          pointers: { left, right },
          highlight: { answer: answer(), window: window() },
          overlay: { ...patternRow, pointers: patternCursor() },
          ops,
          vars: { width, bestLen, bestStart, right, left },
        };
      }

      const d = values[left] as string;
      if (need.has(d)) {
        if (need.get(d) === 0) have = have - 1;
        need.set(d, (need.get(d) as number) + 1);
      }
      left = left + 1;

      yield {
        kind: 'array',
        index: 0,
        anchor: 'shrink',
        caption: `Right ${right} of ${n - 1}`,
        note: need.has(d)
          ? `Drop "${d}" from the left end. ${need.get(d) === 1 ? 'Its requirement rises to 1, so the window is no longer a match and the shrink loop stops here' : 'The window still had spare copies, so it stays a match and the loop goes round again'}. ${left <= right ? `The new left edge is ${left}.` : 'The left edge has run past the right edge: nothing longer than this can be a match ending at this position.'}`
          : `Drop "${d}" from the left end. It was never part of the pattern, so the window stays a match and the loop goes round again — a passenger leaving costs nothing. Left edge is now ${left}.`,
        values: [...values],
        mode: 'char',
        pointers: { left, right },
        highlight: { window: window(), answer: answer(), outOfPlace: range(0, was) },
        overlay: { ...patternRow, pointers: patternCursor() },
        ops,
        vars: { left, right, have, dropped: d, need: needText() },
      };
    }
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'done',
    note:
      bestLen < 0
        ? `The scan reached the end and the window never held the whole pattern at once, so no window exists. The answer is the empty string after ${ops} character${ops === 1 ? '' : 's'} of work — a shared *subsequence* is not a shared *substring*, and only a substring is a contiguous window.`
        : `The shortest window is "${values.slice(bestStart, bestStart + bestLen).join('')}" at indices ${bestStart} to ${bestStart + bestLen - 1}: ${bestLen} characters for a ${tChars.length}-character pattern. Found in ${ops} step${ops === 1 ? '' : 's'}, each pointer moving in one direction only.`,
    values: [...values],
    mode: 'char',
    pointers: answerCursor(),
    highlight: bestLen > 0 ? { answer: answer() } : {},
    overlay: { ...patternRow, pointers: {} },
    result: bestLen > 0 ? 'found' : 'not-found',
    ops,
    vars: { bestLen, bestStart, ops },
  };
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'text',
      label: 'Text',
      kind: 'text' as const,
      default: PRESETS[0]?.input.type === 'words' ? (PRESETS[0].input.values[0] as string) : '',
      maxLength: 200,
    },
    {
      key: 'pattern',
      label: 'Pattern',
      kind: 'text' as const,
      default: PRESETS[0]?.input.type === 'words' ? (PRESETS[0].input.values[1] as string) : '',
      maxLength: 60,
    },
  ],
  build: (values: Record<string, unknown>): AlgoInput => ({
    // Two strings, so the input is a pair of words: the text first, the pattern
    // second. That keeps the editor generic — no new form control for "a second
    // string" — and it is exactly the order the four implementations take.
    type: 'words',
    values: [
      typeof values.text === 'string' ? values.text : '',
      typeof values.pattern === 'string' ? values.pattern : '',
    ],
  }),
  sizeOf: (input: AlgoInput): number =>
    input.type === 'words' ? (input.values[0] ?? '').length : 0,
};

/* ------------------------------------------------------------------ *
 * 4. The lesson — four languages, one set of anchors
 * ------------------------------------------------------------------ */

const JS = `function minWindowSubstring(s, t) {
  if (t.length === 0 || t.length > s.length) return "";         // @anchor start
  const need = new Map();
  for (const c of t) need.set(c, (need.get(c) || 0) + 1);         // @anchor need
  let have = 0, left = 0, bestLen = Infinity, bestStart = 0;
  for (let right = 0; right < s.length; right++) {               // @anchor extend
    const c = s[right];
    if (need.has(c)) {
      need.set(c, need.get(c) - 1);
      if (need.get(c) === 0) have++;
    }
    while (have === need.size) {                                 // @anchor shrink
      const width = right - left + 1;
      if (width < bestLen) {                                     // @anchor update
        bestLen = width;
        bestStart = left;
      }
      const d = s[left];
      if (need.has(d)) {
        if (need.get(d) === 0) have--;
        need.set(d, need.get(d) + 1);
      }
      left = left + 1;
    }
  }
  if (bestLen === Infinity) return "";                           // @anchor done
  return s.slice(bestStart, bestStart + bestLen);
}`;

const PY = `def min_window_substring(s, t):
    if not t or len(t) > len(s):                               # @anchor start
        return ""
    need = {}
    for c in t:                                               # @anchor need
        need[c] = need.get(c, 0) + 1
    have = 0
    left = 0
    best_len = None
    best_start = 0
    for right, c in enumerate(s):                             # @anchor extend
        if c in need:
            need[c] = need[c] - 1
            if need[c] == 0:
                have += 1
        while have == len(need):                              # @anchor shrink
            width = right - left + 1
            if best_len is None or width < best_len:          # @anchor update
                best_len = width
                best_start = left
            d = s[left]
            if d in need:
                if need[d] == 0:
                    have -= 1
                need[d] = need[d] + 1
            left += 1
    if best_len is None:                                      # @anchor done
        return ""
    return s[best_start:best_start + best_len]`;

const JAVA = `class MinWindowSubstring {
    static String minWindowSubstring(String s, String t) {
        if (t.isEmpty() || t.length() > s.length()) return "";  // @anchor start
        boolean[] inT = new boolean[256];
        int[] need = new int[256];
        int distinct = 0;
        for (int i = 0; i < t.length(); i++) {                   // @anchor need
            char c = t.charAt(i);
            if (!inT[c]) { inT[c] = true; distinct++; }
            need[c]++;
        }
        int have = 0, left = 0, bestLen = -1, bestStart = 0;
        for (int right = 0; right < s.length(); right++) {        // @anchor extend
            char c = s.charAt(right);
            if (inT[c]) {
                need[c] = need[c] - 1;
                if (need[c] == 0) have++;
            }
            while (have == distinct) {                            // @anchor shrink
                int width = right - left + 1;
                if (bestLen < 0 || width < bestLen) {             // @anchor update
                    bestLen = width;
                    bestStart = left;
                }
                char d = s.charAt(left);
                if (inT[d]) {
                    if (need[d] == 0) have--;
                    need[d]++;
                }
                left = left + 1;
            }
        }
        if (bestLen < 0) return "";                              // @anchor done
        return s.substring(bestStart, bestStart + bestLen);
    }
}`;

const CPP = `#include <string>
using std::string;

string min_window_substring(const string& s, const string& t) {
    if (t.empty() || t.size() > s.size()) return "";             // @anchor start
    bool inT[256] = { false };
    int need[256] = { 0 };
    int distinct = 0;
    for (size_t i = 0; i < t.size(); i++) {                      // @anchor need
        unsigned char c = (unsigned char)t[i];
        if (!inT[c]) { inT[c] = true; distinct++; }
        need[c]++;
    }
    int have = 0, left = 0, bestLen = -1, bestStart = 0;
    for (int right = 0; right < (int)s.size(); right++) {         // @anchor extend
        unsigned char c = (unsigned char)s[right];
        if (inT[c]) {
            need[c] = need[c] - 1;
            if (need[c] == 0) have++;
        }
        while (have == distinct) {                                // @anchor shrink
            int width = right - left + 1;
            if (bestLen < 0 || width < bestLen) {                 // @anchor update
                bestLen = width;
                bestStart = left;
            }
            unsigned char d = (unsigned char)s[left];
            if (inT[d]) {
                if (need[d] == 0) have--;
                need[d]++;
            }
            left = left + 1;
        }
    }
    if (bestLen < 0) return "";                                  // @anchor done
    return s.substr(bestStart, bestLen);
}`;

const NOTES = {
  start: {
    javascript:
      'One guard, two cases, and both are real: an empty pattern is contained in every window, and a pattern longer than the text cannot be in any. Returning `""` rather than `null` means the caller gets a string it can measure, and it is the same answer all four languages give for "there is no window".',
    python:
      'One guard, two cases. `if not t` is a truthiness test that is also true for the empty string, so the empty-pattern case needs no separate check — a place where Python is shorter than the other three rather than longer, which is rarer than the textbooks suggest.',
    java: 'One guard, two cases, and note what `return ""` costs: a fresh String object on every call. Java has no interned empty-string literal in the language (the constant pool does have one, and `""` does resolve to it), but the general point stands — a language where a substring is always a copy is a language where returning substrings is a real cost, which is why this returns a range and a slice rather than a String.',
    cpp: 'One guard, two cases. `t.size() > s.size()` compares two `size_t` values, both unsigned, so there is no signedness trap here — but a `t.length() - s.length()` formulation on signed ints would be an underflow bug waiting to happen, which is the single most common C++ mistake in sliding-window code.',
  },
  need: {
    javascript:
      'Counting the pattern up front is what makes the inner loop O(1): `need.get(c)` is a hash lookup, so "is this character part of the pattern, and do we still owe a copy" is one question instead of a scan. `(need.get(c) || 0)` is needed because `Map.get` returns `undefined` for a missing key, and `undefined || 0` is the idiom every JavaScript counter uses until you switch to `??`.',
    python:
      'Counting the pattern up front. `need.get(c, 0)` supplies the default as a *second argument*, which is the difference from the JavaScript line above: Python dicts take the fallback in the call, so there is no `|| 0` idiom and no confusion between "missing" and "falsy". The `len(need)` later is the number of distinct characters, which is the target `have` counts towards.',
    java: 'Two arrays rather than a `Map<Character,Integer>`, and that is the honest Java answer: a fixed alphabet turns every hash lookup into an array index, and boxing a `Character` key per test would cost more than the whole rest of the loop. `inT` is what stops a character that is not in the pattern from incrementing `have` — a sentinel value in `need` alone cannot, because 0 is a legitimate outstanding count.',
    cpp: 'Two C arrays, initialised to all-zero, which is exactly what `= { false }` and `= { 0 }` do for a 256-element array. The same `inT` guard appears as in Java, and for the same reason: with a plain counter array, 0 means both "not in the pattern" and "all copies already placed", and one `if` cannot tell them apart.',
  },
  extend: {
    javascript:
      'The right edge moves unconditionally, one character per step, and the left edge does not move at all here. That asymmetry is the algorithm: a window that is allowed to grow freely and shrinks only when complete is the only formulation that finds the *minimum* window rather than merely the first one found.',
    python:
      'The right edge moves unconditionally. `enumerate` gives the index and the character together; note that a Python `str` iterates by code point, so a multi-byte character is one step here and would be four bytes in the C++ listing — the same input, two different iteration granularities.',
    java: 'The right edge moves unconditionally. `s.charAt(right)` is a call on an immutable String and `need[c]` is an array index, so the whole step is two bounds checks and no allocation. A production version would copy `s` into a `char[]` once, because the JIT can hoist that bounds check out of the loop and the copy makes it unconditional.',
    cpp: 'The right edge moves unconditionally, and `unsigned char` is the index type so a byte above 127 lands inside the 256-entry table. The same cast protects the `shrink` line below, and forgetting it on *either* line is an out-of-bounds read on exactly the non-ASCII input the cast exists to support.',
  },
  shrink: {
    javascript:
      'The loop condition is `have === need.size`, not a flag: the number of satisfied characters *is* the validity test, so there is no separate boolean to keep in sync. This is the line where patience pays — a valid but non-minimal window is not the answer, and pushing `left` in until the window stops being valid is what finds the minimal one.',
    python:
      'The loop condition is `have == len(need)`, and `left` is moved *after* the candidate is recorded rather than before. Getting that order wrong is the classic off-by-one here: record first, then shrink, or the smallest window for a given right edge is never seen at all.',
    java: 'The loop condition compares against `distinct`, the count of distinct pattern characters, rather than the pattern length — the window becomes valid when every *kind* of character is present enough times, not when it is long enough. The guard `left` against `right` is implicit in the invariant and worth stating: without it a pattern character that never appears would spin this loop forever.',
    cpp: 'The loop condition compares against `distinct`. Note that `left` is moved after the candidate is recorded, and that the pattern characters are restored rather than merely dropped: `need[d]++` is what makes a later occurrence of `d` count again, and forgetting it is how this algorithm silently loses its second match.',
  },
  update: {
    javascript:
      'One comparison against the running best, and the best is a length plus a start index rather than the substring itself. Storing the range instead of a copy is what keeps the space claim at O(alphabet) — and it is only possible because the text is immutable in JavaScript, so a range is a valid permanent reference to it.',
    python:
      'One comparison against the running best. `best_len is None` rather than a sentinel number, because Python has a real "no value yet" (`None`) that is not a magic number; the other three languages need `-1` or `Integer.MAX_VALUE` and the branch above has to test for it explicitly.',
    java: 'One comparison against the running best. `bestLen < 0` is the sentinel test, and it is why the initial value is `-1` rather than `0`: a window of length zero is a legitimate candidate in a string with an empty pattern, and zero cannot double as "nothing found".',
    cpp: 'One comparison against the running best. The same `-1` sentinel as Java, chosen over `0` for the same reason, and the reason the guard on the first line returns early for an empty pattern is that a zero-length answer and a not-found answer must stay distinguishable.',
  },
  done: {
    javascript:
      'The not-found answer is `""`, the empty string, and that is a deliberate choice over `null`: a caller can measure the result, and all four languages return something with the same shape for "no window". `slice` is used rather than `substring` because it will not silently swap the two arguments if they ever arrive reversed.',
    python:
      'The not-found answer is `""`, and `best_len is None` is what makes the distinction from a legitimate zero-length window possible. Slicing a `str` with `[a:b]` returns a new string, and unlike the other three languages there is no view type that would let the caller avoid the copy.',
    java: 'The not-found answer is `""`, decided by the sentinel rather than by a null return — a primitive `int` cannot be null, and a `String` result that is never null means the caller never has to write a null check first. `substring` allocates a new String, which is the reason the range was kept instead of the text.',
    cpp: 'The not-found answer is `""`, and `substr` is the cheap one here: it returns a `string_view`-like slice of the existing buffer with no allocation, which is the one place in this whole family where C++ can hand back a reference to the input and the other three cannot. That is a real difference, not a stylistic one.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'minWindowSubstring',
    python: 'min_window_substring',
    java: 'MinWindowSubstring.minWindowSubstring',
    cpp: 'min_window_substring',
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

const pairOf = (p: Preset): [string, string] =>
  p.input.type === 'words'
    ? [(p.input.values[0] ?? '') as string, (p.input.values[1] ?? '') as string]
    : ['', ''];

/** Does the window hold every character the pattern needs, with multiplicity? */
const covers = (window: string, pattern: string): boolean => {
  const need = new Map<string, number>();
  for (const c of pattern) need.set(c, (need.get(c) ?? 0) + 1);
  const have = new Map<string, number>();
  for (const c of window) have.set(c, (have.get(c) ?? 0) + 1);
  for (const [c, k] of need) if ((have.get(c) ?? 0) < k) return false;
  return true;
};

/**
 * The claim, checked the stupid way: try every window width in increasing order
 * and every position at that width, and take the first one that holds the
 * pattern's characters. The pattern is a *bag*, not a sequence, so the test is
 * multiplicity rather than a substring search — which is the mistake a reference
 * implementation makes first, and the reason the four listings all carry an
 * explicit requirement table instead of a `contains` call.
 */
const minWindowOf = (s: string, t: string): string => {
  if (t.length === 0 || t.length > s.length) return '';
  for (let width = t.length; width <= s.length; width++) {
    for (let start = 0; start + width <= s.length; start++) {
      const window = s.slice(start, start + width);
      if (covers(window, t)) return window;
    }
  }
  return '';
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const [text, pattern] = pairOf(p);
  return { presetId: p.id, args: [text, pattern], result: minWindowOf(text, pattern) };
});

export const minWindowSubstringAlgo: AlgoDef<ArrayFrame> = {
  id: 'min-window-substring',
  title: 'Minimum Window Substring',
  category: 'sliding-window',
  summary:
    'Grow a window one character at a time from the right, and the moment it contains every character the pattern needs, push the left edge in as far as it will go before letting the right edge move again.',
  intuition:
    'Reach for this when the pattern is a *bag* of things rather than a sequence — "find the tightest block of log lines mentioning every one of these five service names", "the smallest excerpt containing all of these keywords", "the shortest run of readings that covers every sensor". The pattern being unordered is what makes it a sliding window rather than a string search: a set is something you can satisfy incrementally and unsatisfy incrementally, and a fixed-length pattern is the special case where the window size is known in advance and you would use a hash of the window instead. If the pattern *is* ordered and you need the window to contain it in sequence, you want a different algorithm entirely — this one will keep giving you answers that are too large.',
  complexity: {
    best: 'O(n + m)',
    average: 'O(n + m)',
    worst: 'O(n + m)',
    space: 'O(m)',
    note: 'Linear in the text plus linear in the pattern, and the reason is that each pointer moves in one direction only: `right` visits every character once and `left` visits every character once, so the nested loop is not nested in any meaningful sense. Space is the size of the pattern alphabet, not the text — which is why the Java and C++ listings can use two fixed 256-entry arrays and the JavaScript one can use a Map that grows to at most the alphabet size.',
  },
  traits: {
    inPlace: true,
    offline: true,
    allowsDuplicates: true,
    tags: ['single pass', 'unordered pattern', 'returns a range', 'empty string for not-found'],
  },
  viewport: 'array',
  level: 'intermediate',
  params: [
    {
      key: 'size',
      label: 'Text length',
      kind: 'number',
      min: 1,
      max: 60,
      step: 1,
      default: 22,
      regeneratesInput: true,
      help: 'Truncates the text before the scan starts. The pattern is left alone.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: minWindowSubstring,
  lesson,
  expectations,
  formatResult: (r) => {
    const s = r as string;
    return s.length === 0 ? 'no window' : `"${s}" (${s.length} characters)`;
  },
  anchors: ['start', 'need', 'extend', 'shrink', 'update', 'done'],
};

export default minWindowSubstringAlgo;
