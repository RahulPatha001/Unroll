import { byLanguage } from '../../code/anchors.ts';
import { stringWithRun } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isChars } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Longest Repeating Character Replacement — a sliding window with a lie in it.
 *
 * A window can be turned into a single repeated character with
 * `length - (most common character in the window)` replacements. The obvious
 * implementation maintains that maximum exactly, which means recomputing or
 * decrementing it every time the left edge moves — and that is where the O(n^2)
 * versions come from.
 *
 * The trick is to keep a *historical* maximum: `maxFreq` is only ever raised,
 * never lowered, so a stale value can be larger than the window's true maximum.
 * That is safe, and the safety argument is the lesson. A stale `maxFreq`
 * *over-estimates* the number of replacements needed, so a window can be
 * rejected when it was in fact fine — but no window is ever accepted that is not
 * genuinely fixable, and the extra strictness can only shorten windows, never
 * lengthen them. The answer is still the optimum because the optimal window is
 * never rejected at the moment it completes.
 *
 * The `k-zero` preset makes the whole thing collapse to "longest run of one
 * character", which is the sanity check: with no replacements allowed there is
 * nothing to replace and the answer must be the longest identical run.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 1033;

const PRESETS: Preset[] = [
  {
    id: 'already-fine',
    label: 'Nothing to replace',
    blurb:
      'Ten identical characters and a budget of two. The window never has to move, `maxFreq` and the true maximum always agree, and the answer is the whole string — the case where the stale-record trick buys nothing and costs nothing.',
    input: { type: 'chars', values: stringWithRun(SEED, 10, 10) },
    params: { k: 2 },
  },
  {
    id: 'long-run',
    label: 'A long run plus noise',
    blurb:
      'Six aces in a row inside a noisy string, with one replacement allowed. The window latches onto the run and then survives on the stale `maxFreq` for several characters after the run has ended, which is the mechanism doing its job.',
    input: { type: 'chars', values: stringWithRun(SEED + 4, 15, 6) },
    params: { k: 1 },
  },
  {
    id: 'crowded',
    label: 'Three letters, one swap',
    blurb:
      'Fourteen characters from a three-letter alphabet with a budget of one. The window is constantly a character or two too long, so `left` advances on nearly every step and the record improves in small increments.',
    input: { type: 'chars', values: stringWithRun(SEED + 8, 14, 3) },
    params: { k: 1 },
  },
  {
    id: 'k-zero',
    label: 'No replacements at all',
    blurb:
      'k = 0. With nothing to spend, "make a window all one character" means "find a window that already is", and the answer is the longest run of a single character. Every window that is not already uniform gets shrunk away.',
    input: { type: 'chars', values: stringWithRun(SEED + 12, 12, 4) },
    params: { k: 0 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

export function* longestRepeatingReplacement(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'chars'; values: string };
  const source = isChars(ctx.input) ? ctx.input.values : input.values;
  const size = Number(ctx.params.size ?? source.length);
  const values = [...source].slice(0, Math.max(0, size));
  const n = values.length;
  const k = Number(ctx.params.k ?? 1);

  let ops = 0;
  let left = 0;
  /** Historical maximum of any character count in any window. Never lowered. */
  let maxFreq = 0;
  let best = 0;
  let bestStart = 0;
  const count = new Map<string, number>();

  const countsText = (): string => {
    const parts: string[] = [];
    for (const [c, v] of count) if (v > 0) parts.push(`${c}:${v}`);
    return parts.length > 0 ? parts.join(' ') : '(empty)';
  };

  const window = (right: number): number[] => range(left, right + 1);
  const answer = (): number[] => (best > 0 ? range(bestStart, bestStart + best) : []);

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    note:
      n === 0
        ? 'The string is empty, so the answer is 0.'
        : `Count the characters in a window that may spend up to ${k} replacement${k === 1 ? '' : 's'}. A window of length L whose most common character appears F times costs L - F to fix, so the test is L - F <= ${k}.`,
    values: [...values],
    mode: 'char',
    pointers: { left: 0, right: 0 },
    highlight: { unvisited: range(0, n) },
    vars: { n, k, left: 0, right: 0, maxFreq: 0, best: 0 },
  };

  for (let right = 0; right < n; right++) {
    if (ctx.shouldStop()) return;
    ops++;
    const c = values[right] as string;
    const seen = (count.get(c) ?? 0) + 1;
    count.set(c, seen);
    const raised = seen > maxFreq;
    if (raised) maxFreq = seen;

    const len = right - left + 1;
    const cost = len - maxFreq;
    yield {
      kind: 'array',
      index: 0,
      anchor: 'extend',
      caption: `Right ${right} of ${n - 1}`,
      note: raised
        ? `"${c}" now appears ${seen} times in the window, which is more than any count this scan has seen, so the record \`maxFreq\` rises to ${maxFreq}. Because the record was just set by this very character, it is exact for this window: replacing everything but the aces costs ${cost}, ${cost <= k ? `within the budget of ${k}` : `over the budget of ${k}`}.`
        : `"${c}" appears ${seen} times in the window, which does not beat the record of ${maxFreq}. The record is left alone — deliberately. Lowering it would mean re-deriving the true maximum every time the left edge moves, and that is the quadratic version nobody wants to write.`,
      values: [...values],
      mode: 'char',
      pointers: { left, right },
      highlight: {
        window: window(right),
        unvisited: range(right + 1, n),
        outOfPlace: range(0, left),
      },
      ops,
      vars: { right, left, len, maxFreq, k, cost, slack: k - cost, best, counts: countsText() },
    };

    if (cost <= k) {
      if (len > best) {
        const was = best;
        best = len;
        bestStart = left;
        yield {
          kind: 'array',
          index: 0,
          anchor: 'accept',
          caption: `Right ${right} of ${n - 1}`,
          note: `${raised ? 'The record was exact, so' : `The record is stale: \`maxFreq\` is ${maxFreq} from an earlier window, and this window's true most-common count may be lower, so the real cost is at most ${cost}`} the window costs ${cost} to fix, which is ${cost === k ? 'exactly' : 'within'} the budget of ${k}. Keep it: ${len} characters, beating the previous best of ${was}.`,
          values: [...values],
          mode: 'char',
          pointers: { left: bestStart, right: bestStart + best - 1 },
          highlight: { answer: answer(), window: window(right), outOfPlace: range(0, left) },
          ops,
          vars: { best, bestStart, len, maxFreq, k, cost, exact: raised },
        };
      }
    }

    // Shrink for as long as the window costs more than the budget allows. The
    // count of the departing character is decremented but `maxFreq` is not —
    // that asymmetry is the entire algorithm.
    while (right - left + 1 - maxFreq > k) {
      if (ctx.shouldStop()) return;
      ops++;
      const dropped = values[left] as string;
      count.set(dropped, (count.get(dropped) as number) - 1);
      left = left + 1;
      const len2 = right - left + 1;
      yield {
        kind: 'array',
        index: 0,
        anchor: 'shrink',
        caption: `Right ${right} of ${n - 1}`,
        note: `The window was ${len2 + 1} characters long and needed ${len2 + 1 - maxFreq} replacements against a budget of ${k}, so it is one too long. Drop the "${dropped}" at the left edge: the left edge only ever moves past characters the answer does not need. Note that \`maxFreq\` stays at ${maxFreq} even though the window no longer holds that many — see the stale-record note on the accept step.`,
        values: [...values],
        mode: 'char',
        pointers: { left, right },
        highlight: { window: window(right), answer: answer(), outOfPlace: range(0, left) },
        ops,
        vars: { left, right, len: len2, maxFreq, k, cost: len2 - maxFreq, counts: countsText() },
      };
    }
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'done',
    note: `The scan finished with a best window of ${best} characters: "${values.slice(bestStart, bestStart + best).join('')}". One pass, no recomputation of the maximum, and ${ops} step${ops === 1 ? '' : 's'} — the record was raised at most ${maxFreq} times in total, which is the bound that makes this linear.`,
    values: [...values],
    mode: 'char',
    pointers: { left: bestStart, right: bestStart + best - 1 },
    highlight: best > 0 ? { answer: answer() } : {},
    result: best > 0 ? 'found' : 'not-found',
    ops,
    vars: { best, bestStart, maxFreq, k, ops },
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

const JS = `function longestRepeatingReplacement(s, k) {
  const count = new Map();                         // @anchor start
  let left = 0, maxFreq = 0, best = 0, bestStart = 0;
  for (let right = 0; right < s.length; right++) {  // @anchor extend
    const c = s[right];
    count.set(c, (count.get(c) || 0) + 1);
    if (count.get(c) > maxFreq) maxFreq = count.get(c);
    if (right - left + 1 - maxFreq <= k) {         // @anchor accept
      if (right - left + 1 > best) { best = right - left + 1; bestStart = left; }
    }
    while (right - left + 1 - maxFreq > k) {       // @anchor shrink
      count.set(s[left], count.get(s[left]) - 1);
      left = left + 1;
    }
  }
  return best;                                      // @anchor done
}`;

const PY = `def longest_repeating_replacement(s, k):
    count = {}                                      # @anchor start
    left = best = best_start = 0
    max_freq = 0
    for right, c in enumerate(s):                   # @anchor extend
        count[c] = count.get(c, 0) + 1
        if count[c] > max_freq:
            max_freq = count[c]
        if right - left + 1 - max_freq <= k:        # @anchor accept
            if right - left + 1 > best:
                best = right - left + 1
                best_start = left
        while right - left + 1 - max_freq > k:      # @anchor shrink
            count[s[left]] = count[s[left]] - 1
            left += 1
    return best                                     # @anchor done`;

const JAVA = `class LongestRepeatingReplacement {
    static int longestRepeatingReplacement(String s, int k) {
        int[] count = new int[256];                          // @anchor start
        int left = 0, maxFreq = 0, best = 0, bestStart = 0;
        for (int right = 0; right < s.length(); right++) {  // @anchor extend
            char c = s.charAt(right);
            count[c]++;
            if (count[c] > maxFreq) maxFreq = count[c];
            if (right - left + 1 - maxFreq <= k) {           // @anchor accept
                if (right - left + 1 > best) {
                    best = right - left + 1;
                    bestStart = left;
                }
            }
            while (right - left + 1 - maxFreq > k) {         // @anchor shrink
                count[s.charAt(left)]--;
                left = left + 1;
            }
        }
        return best;                                         // @anchor done
    }
}`;

const CPP = `#include <string>
using std::string;

int longest_repeating_replacement(const string& s, int k) {
    int count[256] = { 0 };                                  // @anchor start
    int left = 0, maxFreq = 0, best = 0, bestStart = 0;
    for (int right = 0; right < (int)s.size(); right++) {   // @anchor extend
        unsigned char c = (unsigned char)s[right];
        count[c]++;
        if (count[c] > maxFreq) maxFreq = count[c];
        if (right - left + 1 - maxFreq <= k) {               // @anchor accept
            if (right - left + 1 > best) {
                best = right - left + 1;
                bestStart = left;
            }
        }
        while (right - left + 1 - maxFreq > k) {             // @anchor shrink
            count[(unsigned char)s[left]]--;
            left = left + 1;
        }
    }
    return best;                                            // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'An empty table, four integers, and a `Map` that grows on demand. `k` is a plain number rather than part of the data structure, which is worth noticing: the budget never changes during the scan, so only the window and the counts are state.',
    python:
      "An empty dict and three chained assignments to 0, which is Python's way of initialising several names in one statement. `max_freq` is kept separate from the chained line because the other three languages need a declaration each, and keeping the shape parallel is what makes the four listings comparable.",
    java: 'A 256-entry `int` array, which Java zero-initialises for you — there is no `Arrays.fill` here, unlike C++ where `= { 0 }` is doing the same job explicitly. An array rather than a `HashMap<Character,Integer>` because a fixed alphabet makes every lookup an index and boxing a `Character` key per character would dominate the cost.',
    cpp: 'A 256-entry `int` array explicitly zeroed, and the explicit zeroing matters: a local array in C++ is *not* initialised, so without `= { 0 }` this loop would read indeterminate values. The same line in Java needs no initialiser at all, which is one of the largest practical differences between the two languages on this page.',
  },
  extend: {
    javascript:
      'The right edge moves one character at a time and the count for that character goes up by one. The record `maxFreq` is raised here and *nowhere else* — there is no line anywhere in the function that lowers it, and the absence is the algorithm. Recomputing the true maximum here would be O(alphabet) per step and the whole function would stop being linear.',
    python:
      'The right edge moves one character at a time and the count goes up by one. `max_freq` is raised on the next line and never lowered; that asymmetry is the whole trick. Note that a correct-looking alternative — recomputing `max_freq` from `count.values()` after every shrink — is O(alphabet) per step and quietly turns a linear algorithm into a quadratic one.',
    java: 'The right edge moves and the count goes up. `maxFreq` is raised on the next line and never lowered anywhere in the method, which is why this is a single pass: a correct-but-slower version that recomputes the maximum after each shrink is a very common mistake, and it is only visible once you count the work per step.',
    cpp: 'The right edge moves and the count goes up, with `unsigned char` as the index so a byte above 127 stays inside the 256-entry table. The next line raises `maxFreq` and no line ever lowers it — the whole method is O(1) per character for that reason, and O(n) overall.',
  },
  accept: {
    javascript:
      'The test `length - maxFreq <= k` with a `maxFreq` that may be stale. This is the line worth arguing about: a stale record *over*-estimates the replacements needed, so a window can be rejected when it would have been fine — but a window is never accepted that cannot actually be fixed, and rejecting too eagerly only ever costs you a shorter answer, never a wrong one. `bestStart` is tracked alongside `best` so the caller can recover the window without a second scan.',
    python:
      'The test `length - max_freq <= k`, with a `max_freq` that is deliberately never reduced when the left edge moves. The safety argument in one sentence: over-estimating the cost can only reject a window early, and a window is only recorded when the estimate says it fits — so every recorded window is genuinely fixable, and the longest one recorded is the longest one there is.',
    java: 'The test, and the one thing to take away from this function: the guard would still be correct if `maxFreq` were recomputed exactly, it would simply be slower. Because the estimate is only ever too pessimistic, and only the *length* of the recorded window is reported, the result is identical — which is a rare case of an optimisation that is provably free rather than merely usually safe.',
    cpp: "The test, and the asymmetry that makes it safe: `maxFreq` is monotonically non-decreasing, so it is an upper bound on this window's true most-common count, so `length - maxFreq` is a lower bound on the true cost, so the test is conservative. Conservative tests cost answers only when they are *too* strict, and a window that is rejected here is one a later `right` will reconsider anyway.",
  },
  shrink: {
    javascript:
      "The left edge retreats one character at a time, decrementing that character's count. The `while` rather than an `if` is because one character can make the difference between needing k+1 and needing k, and because the departing character may not have been the most common one at all — the loop is the only thing that knows when the window is finally within budget.",
    python:
      'The left edge retreats one character at a time, decrementing the count for the character that left. Note that `count[s[left]]` is read twice — once to fetch, once to store — where the JavaScript line does the same with two `Map` calls; caching it in a local would be the micro-optimisation to reach for if this were in a hot loop.',
    java: "The left edge retreats one character at a time, decrementing that character's count. `count[s.charAt(left)]--` is a read-modify-write on an array slot, so it compiles to a load, a subtract and a store with no allocation and no autoboxing — the reason the array representation exists at all.",
    cpp: 'The left edge retreats one character at a time, with the `unsigned char` cast repeated because the departing character needs the same 0-to-255 guarantee as the arriving one. Dropping the cast on this line alone is the single most common bug in a C++ sliding-window implementation, and it is invisible until the input contains a byte above 127.',
  },
  done: {
    javascript:
      'A single integer. The window itself is not returned even though `bestStart` was maintained, because a range has no honest equivalent in all four languages — Java and C++ would have to allocate a substring or a view to return one, and the length is the portable answer.',
    python:
      'A single integer, and `best_start` is left unused by the return for exactly the portability reason above. A Python caller who wants the substring gets it with one more slice, which is a cheap operation here because the length is known and small.',
    java: 'A single `int`, with no allocation anywhere in the method. Everything the algorithm needed fit in five local variables and a fixed 256-entry array, and the input was only ever read — which is also why this would be safe to call concurrently on a shared string.',
    cpp: 'A single `int`. A C++ caller who wants the window itself could have had a `string_view` for free, since the input outlives the call and `substr` on a `string_view` does not copy — the one version of "return the answer and its range" that is genuinely cheap in this language.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'longestRepeatingReplacement',
    python: 'longest_repeating_replacement',
    java: 'LongestRepeatingReplacement.longestRepeatingReplacement',
    cpp: 'longest_repeating_replacement',
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
const kOf = (p: Preset): number => Number(p.params?.k ?? 1);

/**
 * The claim, checked by definition: for every substring, cost it by
 * length minus its own most-common-character count, and take the longest whose
 * cost fits the budget. O(n^3) with a fresh frequency table per substring, on
 * fifteen characters, and completely independent of the sliding window — which
 * is what makes it a real check on the stale-maxFreq argument rather than a
 * restatement of it.
 */
const replacementLengthOf = (s: string, k: number): number => {
  let best = 0;
  for (let i = 0; i < s.length; i++) {
    for (let j = i; j < s.length; j++) {
      const window = s.slice(i, j + 1);
      const counts = new Map<string, number>();
      let top = 0;
      for (const c of window) {
        const v = (counts.get(c) ?? 0) + 1;
        counts.set(c, v);
        if (v > top) top = v;
      }
      if (window.length - top <= k && window.length > best) best = window.length;
    }
  }
  return best;
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const text = textOf(p);
  const k = kOf(p);
  return { presetId: p.id, args: [text, k], result: replacementLengthOf(text, k) };
});

export const longestRepeatingReplacementAlgo: AlgoDef<ArrayFrame> = {
  id: 'longest-repeating-replacement',
  title: 'Longest Repeating Character Replacement',
  category: 'sliding-window',
  summary:
    'Slide a window along the string and keep the longest one that can be turned into a single repeated character within a budget of k replacements, using a most-frequent-character count that is allowed to go stale.',
  intuition:
    'Reach for this when the question is about *approximate* matches with a bounded number of errors — a spell checker that tolerates two wrong letters, a log scanner looking for the longest stretch that is mostly one event type, a refactoring tool finding the longest block differing from the template in at most k places. The specific insight is the stale maximum: a running "most common character" count that is only ever raised lets you test a window in O(1) without maintaining an exact maximum, which is what separates this from every other sliding-window problem where the quality of the window needs recomputing on the left edge.',
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(min(n, alphabet))',
    note: 'Linear, and the guarantee that makes it linear is that the record is raised at most as many times as the largest character count in the whole string — so the inner while loop runs O(n) times in total across all right values, not per right. The space is the alphabet, so the fixed 256-entry tables in the Java and C++ listings are genuinely O(1) and the Map in the JavaScript one is O(distinct characters).',
  },
  traits: {
    inPlace: true,
    online: true,
    allowsDuplicates: true,
    tags: [
      'single pass',
      'approximate matching',
      'stale record trick',
      'no extra copy of the input',
    ],
  },
  viewport: 'array',
  level: 'advanced',
  params: [
    {
      key: 'size',
      label: 'Characters',
      kind: 'number',
      min: 1,
      max: 60,
      step: 1,
      default: 16,
      regeneratesInput: true,
      help: 'Truncates the string before the scan starts.',
    },
    {
      key: 'k',
      label: 'Replacements allowed (k)',
      kind: 'number',
      min: 0,
      max: 10,
      step: 1,
      default: 1,
      help: 'With k = 0 this becomes "find the longest run of one character".',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: longestRepeatingReplacement,
  lesson,
  expectations,
  formatResult: (r) => `${r as number} characters`,
  anchors: ['start', 'extend', 'accept', 'shrink', 'done'],
};

export default longestRepeatingReplacementAlgo;
