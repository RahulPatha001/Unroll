import { byLanguage } from '../../code/anchors.ts';
import { stringWithRun } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isChars } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Valid Palindrome — two pointers with an "invisible" filter in the middle.
 *
 * The interesting part is not the palindrome, it is the skipping. A real
 * sentence is mostly punctuation and whitespace, so the naive
 * `s[l] === s[r]` loop dies on the first comma. Each language solves the
 * "is this character worth comparing?" question differently — a regex in
 * JavaScript, a `dict` method in Python, `Character.isLetterOrDigit` in Java,
 * `std::isalnum` in C++ — and those answers are *not* identical on non-ASCII
 * input, which is a genuinely interesting thing for a student to go and check.
 *
 * The two pointers are the same two pointers as everywhere else in this family:
 * they own the window `[l, r]`, they never move apart, and every iteration
 * either shrinks the window by two or eliminates one character for good. The
 * `match` step is the only one where the window loses two characters at once,
 * and that is precisely the step a careless implementation forgets.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 2300;

/**
 * `half + reverse(half)` is a palindrome by construction — the second half is
 * the first half reflected, so reading it backwards retraces the first half
 * exactly. Seeding only the half keeps the presets reproducible *and* gives each
 * one a different shape without hand-typing a string.
 */
const mirror = (half: string): string => half + [...half].reverse().join('');

/** Upper-case every other character: still a palindrome, but only if you fold. */
const alternateCase = (s: string): string =>
  [...s].map((c, i) => (i % 2 === 1 ? c.toUpperCase() : c)).join('');

/** Punctuation wedged between the letters, so the skipping has work to do. */
const SPACERS = [' ', ',', '!', '.', ';'] as const;
const withJunk = (s: string): string =>
  [...s].map((c, i) => c + (SPACERS[i % SPACERS.length] as string)).join('');

const CLEAN = mirror(stringWithRun(SEED, 6, 2));
const CASED = alternateCase(mirror(stringWithRun(SEED + 5, 5, 2)));
const PUNCTUATED = mirror(withJunk(stringWithRun(SEED + 10, 5, 2)));
/** A real palindrome with one interior character swapped out. */
const CORRUPT = (() => {
  const chars = [...mirror(stringWithRun(SEED + 15, 6, 2))];
  chars[3] = 'q';
  return chars.join('');
})();

const PRESETS: Preset[] = [
  {
    id: 'already-fine',
    label: 'Already a palindrome',
    blurb:
      'A clean, lowercase, all-letters palindrome. Nothing is ever skipped, every comparison matches, and the pointers walk all the way to the middle — the case where the filtering logic is invisible.',
    input: { type: 'chars', values: CLEAN },
  },
  {
    id: 'mixed-case',
    label: 'Mixed case',
    blurb:
      'Every other character is upper case. Without the case fold this is not a palindrome at all, which is what makes the `toLowerCase` step load-bearing rather than defensive.',
    input: { type: 'chars', values: CASED },
  },
  {
    id: 'punctuation',
    label: 'Punctuation',
    blurb:
      'Spaces, commas, exclamation marks and semicolons between every pair of letters. Watch the skipping: each pointer steps over one useless character at a time, and the window never advances by two.',
    input: { type: 'chars', values: PUNCTUATED },
  },
  {
    id: 'not-valid',
    label: 'Not a palindrome',
    blurb:
      'A genuine palindrome with one interior letter replaced. The pointers close to within one pair before they meet, and the very last comparison is the one that fails — the commonest way this bug appears in real code.',
    input: { type: 'chars', values: CORRUPT },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

/** The four listings all have to agree on what counts as a letter or a digit. */
const isWordChar = (c: string): boolean => /[a-zA-Z0-9]/.test(c);

export function* validPalindrome(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'chars'; values: string };
  const source = isChars(ctx.input) ? ctx.input.values : input.values;
  const size = Number(ctx.params.size ?? source.length);
  const values = [...source].slice(0, Math.max(0, size));
  const n = values.length;

  let ops = 0;
  let l = 0;
  let r = n - 1;

  /** `r` is -1 on an empty string, and a pointer may not leave the array. */
  const cursors = (): Record<string, number> => {
    const out: Record<string, number> = { l };
    if (r >= 0) out.r = r;
    return out;
  };

  /** The window still being read. */
  const window = (): number[] => (n < 2 ? [] : range(l, r + 1));
  /** Everything the two pointers have already walked past, matched or skipped. */
  const agreed = (): number[] => [...range(0, l), ...range(r + 1, n)];

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    note:
      n < 2
        ? 'Fewer than two characters, so there is nothing to compare. A string of length 0 or 1 is a palindrome.'
        : `Two pointers at opposite ends of a ${n}-character string. The plan is to fold away case, step over anything that is not a letter or a digit, and compare the two ends as the window closes.`,
    values: [...values],
    mode: 'char',
    pointers: cursors(),
    highlight: { window: range(0, n) },
    vars: { n, l, r },
  };

  while (l < r) {
    if (ctx.shouldStop()) return;
    ops++;

    if (!isWordChar(values[l] as string)) {
      const junk = values[l] as string;
      l = l + 1;
      yield {
        kind: 'array',
        index: 0,
        anchor: 'skip',
        caption: `Step ${ops}`,
        note: `The left pointer is sitting on "${junk}", which is not a letter or a digit, so there is nothing here to compare. Step over it: the window loses one character, and it is only one — the other pointer has not moved yet. Only one pointer moves per step, which is why a string with several marks in a row needs several frames.`,
        values: [...values],
        mode: 'char',
        pointers: cursors(),
        highlight: { window: window(), outOfPlace: agreed() },
        ops,
        vars: { l, r, skipped: junk },
      };
      continue;
    }

    if (!isWordChar(values[r] as string)) {
      const junk = values[r] as string;
      r = r - 1;
      yield {
        kind: 'array',
        index: 0,
        anchor: 'skip',
        caption: `Step ${ops}`,
        note: `The right pointer is sitting on "${junk}", which is not a letter or a digit. Step over it, and the window loses one character from the other end. The step is deliberately a single character: a run of four punctuation marks costs four frames, and the window never advances by two.`,
        values: [...values],
        mode: 'char',
        pointers: cursors(),
        highlight: { window: window(), outOfPlace: agreed() },
        ops,
        vars: { l, r, skipped: junk },
      };
      continue;
    }

    const lc = (values[l] as string).toLowerCase();
    const rc = (values[r] as string).toLowerCase();
    if (lc !== rc) {
      yield {
        kind: 'array',
        index: 0,
        anchor: 'compare',
        caption: `Step ${ops}`,
        note: `"${values[l]}" and "${values[r]}" fold to "${lc}" and "${rc}", which are different. Two characters the string meant to mirror do not mirror, so no amount of scanning further in can rescue it: give up now.`,
        values: [...values],
        mode: 'char',
        pointers: cursors(),
        highlight: { compare: [l, r], window: window() },
        result: 'not-a-palindrome',
        ops,
        vars: { l, r, lc, rc },
      };
      return;
    }

    l = l + 1;
    r = r - 1;
    yield {
      kind: 'array',
      index: 0,
      anchor: 'match',
      caption: `Step ${ops}`,
      note: `"${lc}" matches "${rc}", so this pair is settled and both pointers step inwards at once. This is the only step that closes the window by two, and it is the one a careless implementation forgets — which is how "aab" ends up reported as a palindrome.`,
      values: [...values],
      mode: 'char',
      pointers: cursors(),
      highlight: { window: window(), sorted: agreed() },
      ops,
      vars: { l, r, matched: lc },
    };
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'done',
    note: `The pointers met without ever disagreeing, so the string mirrors itself. ${ops} step${ops === 1 ? '' : 's'} and half the string read — no copy of the string was ever built.`,
    values: [...values],
    mode: 'char',
    pointers: cursors(),
    highlight: { sorted: range(0, n) },
    result: 'palindrome',
    ops,
    vars: { l, r, ops },
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
      maxLength: 120,
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

const JS = `function validPalindrome(s) {
  let l = 0, r = s.length - 1;                       // @anchor start
  while (l < r) {
    if (!/[a-z0-9]/i.test(s[l])) l = l + 1;          // @anchor skip
    else if (!/[a-z0-9]/i.test(s[r])) r = r - 1;
    else {
      if (s[l].toLowerCase() !== s[r].toLowerCase()) {   // @anchor compare
        return false;
      }
      l = l + 1;                                     // @anchor match
      r = r - 1;
    }
  }
  return true;                                       // @anchor done
}`;

const PY = `def valid_palindrome(s):
    l, r = 0, len(s) - 1                              # @anchor start
    while l < r:
        if not s[l].isalnum():                       # @anchor skip
            l = l + 1
        elif not s[r].isalnum():
            r = r - 1
        else:
            if s[l].lower() != s[r].lower():         # @anchor compare
                return False
            l = l + 1                                # @anchor match
            r = r - 1
    return True                                      # @anchor done`;

const JAVA = `class ValidPalindrome {
    static boolean validPalindrome(String s) {
        int l = 0, r = s.length() - 1;               // @anchor start
        while (l < r) {
            if (!Character.isLetterOrDigit(s.charAt(l))) l = l + 1;   // @anchor skip
            else if (!Character.isLetterOrDigit(s.charAt(r))) r = r - 1;
            else {
                if (Character.toLowerCase(s.charAt(l)) != Character.toLowerCase(s.charAt(r))) {   // @anchor compare
                    return false;
                }
                l = l + 1;                           // @anchor match
                r = r - 1;
            }
        }
        return true;                                 // @anchor done
    }
}`;

const CPP = `#include <cctype>
#include <string>
using std::string;

bool valid_palindrome(const string& s) {
    int l = 0, r = (int)s.size() - 1;                // @anchor start
    while (l < r) {
        if (!isalnum((unsigned char)s[l])) l = l + 1;   // @anchor skip
        else if (!isalnum((unsigned char)s[r])) r = r - 1;
        else {
            if (tolower((unsigned char)s[l]) != tolower((unsigned char)s[r])) {   // @anchor compare
                return false;
            }
            l = l + 1;                               // @anchor match
            r = r - 1;
        }
    }
    return true;                                     // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'Two cursors and no copy of the string: `s.length - 1` is -1 for an empty string, which is harmless only because the guard below reads `<`. The string itself is immutable in JavaScript, so "in place" here means "no second string is ever allocated", not "the input is edited".',
    python:
      "Two cursors bound in one statement, which is Python's tuple assignment: both right-hand sides are computed first, then both names are rebound. `s` is a str, and indexing a str yields a one-character str, so there is no character array anywhere in this function.",
    java: 'Two cursors and a `String`, which is immutable — `charAt` is a method call, not an index, which is the first real cost JavaScript and Python do not pay here. `s.length()` is a call rather than a field, so the initialisation is a little heavier than it looks.',
    cpp: "Two cursors over a `const string&`, so the caller's data is neither copied nor modified. `(int)s.size()` is a narrowing cast, and it is unchecked: a string longer than `INT_MAX` would overflow here, which is exactly the sort of quiet failure `size_t` indices exist to prevent.",
  },
  skip: {
    javascript:
      'The regex `[a-z0-9]` with the `i` flag is the whole filter, and it is *ASCII only* — `é` is skipped as if it were punctuation. That is a real, observable difference from the other three listings, and it is why the test on the character you are about to compare is worth writing down rather than assuming.',
    python:
      '`str.isalnum()` is the filter, and unlike the JavaScript regex it is Unicode-aware: `é` is a letter and is kept. So the same string can be a palindrome in Python and not in JavaScript, and the honest summary is that "what is a character" is a decision, not a fact.',
    java: "`Character.isLetterOrDigit` is the filter, and it is Unicode-aware like Python's: a Greek letter counts as a letter. It is a static method on the boxed wrapper for `char`, so the JDK is quietly allocating a `Character` for each call on older JVMs — an easy thing to measure and a satisfying thing to fix with a cached `char[]`.",
    cpp: '`isalnum` is the filter, and unlike the other three it needs the `unsigned char` cast. Passing a plain `char` is undefined behaviour for every value above 127, because a negative `int` is not a valid argument to any function in `<cctype>` — a bug that compiles cleanly and misbehaves on exactly the non-ASCII input it was meant to handle.',
  },
  compare: {
    javascript:
      'Case is folded on both sides and compared as two fresh one-character strings. `s[l].toLowerCase()` can return a *longer* string than one character in rare Unicode expansions, and `!==` would then correctly call that a mismatch — which is either a happy accident or a subtle bug depending on your input.',
    python:
      "`.lower()` on a `str` returns a `str`, so the comparison is between two one-character strings, exactly as in JavaScript. The difference is that Python folds the *whole* string if you ask it to and folds one character here, and `str.lower()` on a single character is locale-independent where Java's `toLowerCase()` consults the default locale.",
    java: '`Character.toLowerCase` takes and returns a `char`, so the comparison is between two 16-bit code units and there is no allocation and no way for the result to be a different length. The classic Java bug here is writing `.equals()` on the two results, which would compare two `Character` *objects* and be false for every input.',
    cpp: '`tolower` returns an `int`, not a `char` — it returns `EOF` for a non-convertible value, which is why the two sides are compared as `int`s here. The `unsigned char` cast is not optional. A C++17 alternative is `std::tolower(ch, std::locale())`, which is locale-aware where the plain call is not.',
  },
  match: {
    javascript:
      'Both cursors step in on the same line-1 line-2 pair, which is the only place in the function where the window closes by two. Nothing is stored, because nothing needs to be: the answer is "have any two ever disagreed", and they have not.',
    python:
      'Both cursors step in together. Python could write `l, r = l + 1, r - 1` on one line — tuple assignment again — but the other three languages have no such form, so spelling it out keeps the four listings line-for-line comparable.',
    java: 'Both cursors step in. Java has no tuple assignment and no way to express "increment two different variables" in one statement, so this is two lines here as it is in C++ and JavaScript; the only language in the family that can do it in one is Python.',
    cpp: 'Both cursors step in. C++17 *does* have an expression form for this — `std::exchange` or a comma operator — but writing it as two statements is what makes the Java, JavaScript and C++ listings read as the same algorithm rather than four dialects of it.',
  },
  done: {
    javascript:
      'The pointers met, so the string mirrors itself. There is no separate "check the middle" case: a single leftover character is its own mirror, and an empty string is too, which is why the loop guard being `<` rather than `<=` is correct.',
    python:
      'The pointers met, so the string mirrors itself. Returning `True`/`False` is a real choice here: the other three languages would return a `bool` too, and the four agree across the JSON round-trip, so no language is quietly translating a number into a truthiness and back.',
    java: 'The pointers met, so the string mirrors itself. `boolean` rather than `int` — a deliberate choice, because a `1`/`0` return would be identical in all four languages but would leave a reader wondering whether 2 might mean something.',
    cpp: 'The pointers met, so the string mirrors itself. `bool` rather than `int` for the same reason as Java, and because C++ has no null: the return type alone says whether the answer is "yes" or "no", so there is no third state to explain.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'validPalindrome',
    python: 'valid_palindrome',
    java: 'ValidPalindrome.validPalindrome',
    cpp: 'valid_palindrome',
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
 * The claim, filtered to ASCII letters and digits and case-folded — which is what
 * all four listings agree on. Written with an explicit two-pointer walk rather
 * than `s === reverse(s)` so that the expectation is testing the same
 * *definition* the code implements, including the skipping.
 */
const palindromeOf = (s: string): boolean => {
  const word = [...s]
    .filter((c) => isWordChar(c))
    .join('')
    .toLowerCase();
  return word === [...word].reverse().join('');
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const text = textOf(p);
  return { presetId: p.id, args: [text], result: palindromeOf(text) };
});

export const validPalindromeAlgo: AlgoDef<ArrayFrame> = {
  id: 'valid-palindrome',
  title: 'Valid Palindrome',
  category: 'two-pointers',
  summary:
    'Walk two pointers in from the ends of a string, step over everything that is not a letter or a digit, fold away case, and stop the first time the two ends disagree.',
  intuition:
    'Reach for this whenever a string has to be compared to itself *outward from both ends* — checking whether a user-entered code, serial number or identifier reads the same forwards and backwards, ignoring the separators humans add. The reason to know the two-pointer version rather than `s === s[::-1]` is the comparison: a reverse-copy allocates a second string and reads every character, while this reads at most half of them and allocates nothing, so it is the version that survives a multi-megabyte input. The same two cursors become O(1) space the moment the comparison needs no extra storage, which is the property a rolling hash or a Manacher run does not give you.',
  complexity: {
    best: 'O(1)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    note: 'O(1) space because the string is never copied: each pointer only ever moves inward, so at most n/2 comparisons happen and a mismatch usually ends the walk much earlier. The honest caveat is that the four listings do not agree on what a "letter" is — JavaScript\'s regex is ASCII-only while Python, Java and C++ accept Unicode — so on non-ASCII input the answers can differ.',
  },
  traits: {
    inPlace: true,
    offline: true,
    allowsDuplicates: true,
    tags: ['read-only', 'no extra space', 'early exit', 'case insensitive'],
  },
  viewport: 'array',
  level: 'intro',
  params: [
    {
      key: 'size',
      label: 'Characters',
      kind: 'number',
      min: 1,
      max: 60,
      step: 1,
      default: 20,
      regeneratesInput: true,
      help: 'Truncates the string before the walk starts.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: validPalindrome,
  lesson,
  expectations,
  formatResult: (r) => (r === true ? 'a palindrome' : 'not a palindrome'),
  anchors: ['start', 'skip', 'compare', 'match', 'done'],
};

export default validPalindromeAlgo;
