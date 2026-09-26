import { byLanguage } from '../../code/anchors.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isChars } from '../../input/types.ts';
import type { LinearFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Balanced brackets — the simplest honest use of a stack.
 *
 * The lesson is not the algorithm, it is the *choice of structure*. A counter
 * cannot solve this: "{][}" is balanced in the sense that the two bracket types
 * cancel, and it is obviously not balanced. You need to remember *which*
 * brackets are open, and "remember what to do next" is what a stack is for.
 *
 * The viewport is `linear` with `flavour: 'stack'`, and the one piece of
 * information the renderer does not draw is the input string being scanned —
 * `LinearFrame` holds the stack, nothing else. So the generator compensates: the
 * current character and its position go in `vars`, and every `note` names the
 * character in words ("Read `{` at position 4"). That is a real limitation of the
 * viewport, not something to paper over with a highlight key nothing renders.
 *
 * Anchors are split per *failure mode* rather than lumped together, because the
 * three ways to be unbalanced are three different bugs: a closer with an empty
 * stack, a closer whose type does not match the top, and a stack that still has
 * something on it at the end.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const OPEN = '([{';
const CLOSE = ')]}'.split('');
const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

/**
 * No seed anywhere: the variable that matters is the *shape* of the bracket
 * string, and each preset is a different way a bracket sequence can be wrong.
 */
const PRESETS: Preset[] = [
  {
    id: 'valid',
    label: 'Valid',
    blurb:
      '{[()]} — three types, correctly nested, ending with an empty stack. Every closer matches the opener directly beneath it, which is the only thing the algorithm ever checks.',
    input: { type: 'chars', values: '{[()]}' },
  },
  {
    id: 'mismatched',
    label: 'Mismatched types',
    blurb:
      '{[)}] — the types cross over: a round closer arrives while a square opener is on top. The stack is not empty, so this is not a "nothing to pop" case; the top is simply the wrong kind of bracket, and no counter could ever see that.',
    input: { type: 'chars', values: '{[)}]' },
  },
  {
    id: 'nested',
    label: 'Deeply nested and valid',
    blurb:
      '{{[({})]}} — five levels of nesting in nine characters. Nothing new algorithmically, but the stack grows to depth 5 and shrinks again, which is what makes the linear space cost visible rather than asserted.',
    input: { type: 'chars', values: '{{[({})]}}' },
  },
  {
    id: 'left-open',
    label: 'Left open',
    blurb:
      '{[()] — every closer matches, and the string still ends with a `{` on the stack. The bug this catches is the one that only shows up at the end: an expression that is balanced everywhere except the outermost pair.',
    input: { type: 'chars', values: '{[()]' },
  },
  {
    id: 'extra-close',
    label: 'Unmatched closer',
    blurb:
      ')}] — a closer with nothing to close. The stack is empty, so a version that pops without checking reads `undefined`/`null` off the top and has to be written very carefully not to accept it by accident.',
    input: { type: 'chars', values: ')}]' },
  },
  {
    id: 'empty',
    label: 'Empty string',
    blurb:
      'Nothing at all. The answer is *yes*, vacuously — the string is balanced because there is no bracket out of place. The degenerate case most "not empty, else false" implementations get wrong, and the one that separates a correct checker from a plausible one.',
    input: { type: 'chars', values: '' },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

export function* balancedBrackets(ctx: RunContext): Generator<LinearFrame> {
  const raw = isChars(ctx.input) ? ctx.input.values : '';
  const expr = String(raw);

  const stack: string[] = [];
  let ops = 0;
  let maxDepth = 0;

  const at = (): number => Math.max(0, stack.length - 1);

  yield {
    kind: 'linear',
    index: 0,
    anchor: 'start',
    caption: 'Empty stack',
    note:
      expr.length === 0
        ? 'An empty string is balanced, vacuously: there is no bracket out of place because there are no brackets. The stack starts and stays empty, and the answer is yes.'
        : `${expr.length} character${expr.length === 1 ? '' : 's'} to read. The stack holds the openers that have not been closed yet, and the only rule is: a closer must match the *top* of the stack, exactly.`,
    flavour: 'stack',
    items: [...stack],
    edges: { top: stack.length },
    highlight: {},
    vars: { depth: 0, maxDepth: 0, ops },
  };

  let answer: boolean | null = null;

  for (let i = 0; i < expr.length; i++) {
    if (ctx.shouldStop()) return;
    const ch = expr[i] as string;

    if (OPEN.includes(ch)) {
      ops++;
      stack.push(ch);
      maxDepth = Math.max(maxDepth, stack.length);
      yield {
        kind: 'linear',
        index: 0,
        anchor: 'push',
        caption: `Position ${i}`,
        note: `Read \`${ch}\` at position ${i} — an opener, so push it. The stack is now ${stack.length} deep (${stack.join(' ')}), and nothing is validated yet: an opener only promises a matching closer will arrive.`,
        flavour: 'stack',
        items: [...stack],
        edges: { top: stack.length },
        highlight: { picked: [stack.length - 1] },
        ops,
        vars: { i, ch, depth: stack.length, maxDepth, ops },
      };
      continue;
    }

    if (CLOSE.includes(ch)) {
      ops++;
      const want = PAIRS[ch] as string;
      const top = stack[stack.length - 1];
      const pos = at();

      if (top === undefined || top !== want) {
        answer = false;
        yield {
          kind: 'linear',
          index: 0,
          anchor: 'mismatch',
          caption: `Position ${i}`,
          note:
            top === undefined
              ? `Read \`${ch}\` at position ${i} and there is nothing on the stack to close it — a closer with no opener. This is the failure a counter cannot detect, and the one that crashes a pop-without-check implementation.`
              : `Read \`${ch}\` at position ${i}. It wants a \`${want}\`, but the top of the stack is a \`${top}\`. The brackets have crossed over, and no amount of counting would have noticed: this is why the stack stores *which* opener, not how many.`,
          flavour: 'stack',
          items: [...stack],
          edges: { top: stack.length },
          highlight: { current: [pos] },
          result: 'unbalanced',
          ops,
          vars: { i, ch, want, top: top ?? '—', depth: stack.length, ops },
        };
        break;
      }

      stack.pop();
      yield {
        kind: 'linear',
        index: 0,
        anchor: 'match',
        caption: `Position ${i}`,
        note: `Read \`${ch}\` at position ${i} and the top is \`${top}\` — a match. Pop it, and the stack drops back to depth ${stack.length}. One pair closed; every character so far is still consistent.`,
        flavour: 'stack',
        items: [...stack],
        edges: { top: stack.length },
        highlight: {},
        ops,
        vars: { i, ch, matched: top, depth: stack.length, maxDepth, ops },
      };
    }

    // Anything that is not a bracket is simply not this algorithm's business.
  }

  if (answer === false) {
    yield {
      kind: 'linear',
      index: 0,
      anchor: 'done',
      caption: 'Not balanced',
      note: `Rejected at the first bad closer, with ${stack.length} node${stack.length === 1 ? '' : 's'} still on the stack. Scanning stopped there on purpose: once a closer has crossed over, nothing later in the string can repair it.`,
      flavour: 'stack',
      items: [...stack],
      edges: { top: stack.length },
      highlight: { current: [at()] },
      result: 'unbalanced',
      ops,
      vars: { depth: stack.length, maxDepth, ops },
    };
    return;
  }

  if (stack.length > 0) {
    yield {
      kind: 'linear',
      index: 0,
      anchor: 'done',
      caption: 'Not balanced',
      note: `Every closer matched, and there is still a \`${stack[stack.length - 1] as string}\` on the stack — it was never closed. Checking the stack at the end is not optional: it is the only way to catch an expression that is balanced everywhere except its outermost pair.`,
      flavour: 'stack',
      items: [...stack],
      edges: { top: stack.length },
      highlight: { current: [at()] },
      result: 'unbalanced',
      ops,
      vars: { depth: stack.length, maxDepth, ops },
    };
    return;
  }

  yield {
    kind: 'linear',
    index: 0,
    anchor: 'done',
    caption: 'Balanced',
    note:
      expr.length === 0
        ? 'The string was empty, so it is balanced. Nothing was pushed and nothing was checked — the check that matters is the one after the loop.'
        : `The stack is empty and every closer matched the opener directly beneath it. ${ops} operation${ops === 1 ? '' : 's'}, and the stack reached depth ${maxDepth} on the way.`,
    flavour: 'stack',
    items: [],
    edges: { top: 0 },
    highlight: {},
    result: 'balanced',
    ops,
    vars: { depth: 0, maxDepth, ops },
  };
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Bracket string',
      kind: 'text' as const,
      default: PRESETS[0]?.input.type === 'chars' ? PRESETS[0].input.values : '',
      maxLength: 60,
    },
  ],
  build: (values: Record<string, unknown>): AlgoInput => ({
    type: 'chars',
    values: typeof values.values === 'string' ? (values.values as string) : '',
  }),
  sizeOf: (input: AlgoInput): number => (input.type === 'chars' ? input.values.length : 0),
};

/* ------------------------------------------------------------------ *
 * 4. The lesson — four languages, one set of anchors
 *
 * All four return a plain `boolean`, which is the natural claim and the one the
 * harness can compare without any coercion: `true` in JavaScript, `True` in
 * Python, `boolean` in Java, `bool` in C++ all serialise to the same JSON.
 * ------------------------------------------------------------------ */

const JS = `const OPEN = '([{';
const WANT = { ')': '(', ']': '[', '}': '{' };

function balanced(s) {
  const stack = [];                                    // @anchor start
  for (const ch of s) {
    if (OPEN.includes(ch)) {
      stack.push(ch);                                  // @anchor push
    } else if (ch in WANT) {
      if (stack.length === 0 || stack[stack.length - 1] !== WANT[ch]) return false;  // @anchor mismatch
      stack.pop();                                     // @anchor match
    }
    // Any other character is not a bracket, so it is simply skipped.
  }
  return stack.length === 0;                           // @anchor done
}`;

const PY = `OPEN = "([{"
WANT = {")": "(", "]": "[", "}": "{"}


def balanced(s):
    stack = []                                        # @anchor start
    for ch in s:
        if ch in OPEN:
            stack.append(ch)                          # @anchor push
        elif ch in WANT:
            if not stack or stack[-1] != WANT[ch]:    # @anchor mismatch
                return False
            stack.pop()                               # @anchor match
        # Any other character is not a bracket, so it is simply skipped.
    return len(stack) == 0                            # @anchor done
`;

const JAVA = `import java.util.ArrayDeque;
import java.util.Deque;

class BalancedBrackets {
    static boolean balanced(String s) {
        Deque<Character> stack = new ArrayDeque<>();  // @anchor start
        for (char ch : s.toCharArray()) {
            if (ch == '(' || ch == '[' || ch == '{') {
                stack.push(ch);                       // @anchor push
            } else if (ch == ')' || ch == ']' || ch == '}') {
                if (stack.isEmpty() || stack.peek() != want(ch)) return false;  // @anchor mismatch
                stack.pop();                          // @anchor match
            }
            // Any other character is not a bracket, so it is simply skipped.
        }
        return stack.isEmpty();                       // @anchor done
    }

    static char want(char close) {
        if (close == ')') return '(';
        if (close == ']') return '[';
        return '{';
    }
}`;

const CPP = `#include <stack>
#include <string>

char want(char close) {
    if (close == ')') return '(';
    if (close == ']') return '[';
    return '{';
}

bool balanced(const std::string& s) {
    std::stack<char> st;                              // @anchor start
    for (char ch : s) {
        if (ch == '(' || ch == '[' || ch == '{') {
            st.push(ch);                              // @anchor push
        } else if (ch == ')' || ch == ']' || ch == '}') {
            if (st.empty() || st.top() != want(ch)) return false;  // @anchor mismatch
            st.pop();                                 // @anchor match
        }
        // Any other character is not a bracket, so it is simply skipped.
    }
    return st.empty();                                // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'An empty array is a perfectly good stack, and JavaScript gives you push/pop on it directly. Note the stack holds the *characters*, not a count: a counter would happily accept "{][}" as balanced, because those two strings do cancel numerically. Storing which opener is on top is the entire reason this problem needs a stack at all.',
    python:
      'A plain list, with `append` for push and `pop` for the pop. The invariant worth writing down before reading the loop: **the top of the stack is the most recent opener that has not yet been closed**. Every decision in the algorithm is a comparison against that one element, which is why the whole thing is O(1) per character.',
    java: 'A `Deque` rather than a `Stack`, and the naming is the trap: `Deque.push` adds to the **head** and `pop` removes from the head. That is stack behaviour, and the reason `Deque` has both `push`/`pop` and `addFirst`/`removeFirst` is that it must also serve as a queue. `java.util.Stack` exists, is a `Vector`, and is synchronised on every operation — do not use it. `ArrayDeque` is not thread-safe and is what you want.',
    cpp: '`std::stack<char>` is an adapter, not a container: it is a `std::deque` underneath with `push`, `pop` and `top`, and it exposes no iteration at all. That restriction is a feature here — a stack you cannot walk backwards is a stack you cannot accidentally corrupt. Note the `empty()` guard before `top()`: on an empty `std::stack`, `top()` is undefined behaviour, not an exception.',
  },
  push: {
    javascript:
      'One character is pushed and nothing is validated. An opener is a *promise* that a matching closer will arrive later, and the algorithm deliberately keeps the promise rather than checking it — a stack is the only place that promise can be stored. `Array.prototype.includes` on a three-character string is O(3) here, which is a very polite way of saying constant time.',
    python:
      'One append, one promise recorded. The push does not check anything, and that is the design: validation is deferred to the closer, because at push time there is genuinely nothing to compare against. The `ch in OPEN` test on a three-character string is a substring search, which is linear in the length of `OPEN` — trivially small, and exactly the kind of thing that stops being trivial if the alphabet grows.',
    java: 'A `Character` is boxed into the `Deque`, which cannot hold primitives. That is the whole reason the stack is a collection of objects rather than a `char[]` plus an index: a linked structure has no way to store a primitive `char` and a null terminator in the same slot. The cost is one small allocation per push, which for a string scan is noise and for a hot parser is not.',
    cpp: 'A `char` goes straight onto the underlying `deque` with no boxing, because `std::stack` stores the element type verbatim. This is the language where the "stack as an array plus an index" alternative is most tempting, and also the language where it pays least to use the real thing: `std::vector` plus an `int` would be faster and would let you corrupt the invariant by decrementing the index twice.',
  },
  mismatch: {
    javascript:
      'The whole check, and both failure modes at once: a stack that is empty has nothing to close, and a stack whose top is the wrong kind of bracket has crossed over. Short-circuit `||` means an empty stack never reaches the array read, so there is no `undefined` to compare — the guard is load-bearing, not decorative.',
    python:
      '`not stack or stack[-1] != WANT[ch]` reads as "either there is nothing to close, or what there is does not match". Python would not crash on an empty stack here — `stack[-1]` would raise `IndexError`, so the `not stack` guard really is required — and the short-circuit means it is only evaluated when the stack is non-empty. Note `!=` compares characters, and character comparison in Python is Unicode-aware, which for ASCII brackets is the same as byte comparison.',
    java: '`isEmpty()` before `peek()` is not optional and the order matters: `Deque.peek()` on an empty deque throws `NoSuchElementException` rather than returning null, so the guard is the difference between returning `false` and throwing. Note also that the check is `!=` on `char`, which is a value comparison — appropriate here precisely because brackets are values and are not aliased.',
    cpp: '`st.empty() || st.top() != want(ch)` — and the `empty()` test is the one line standing between a correct answer and undefined behaviour, because `std::stack::top()` on an empty stack is UB rather than an exception. The compiler is under no obligation to warn, the program may crash or may read garbage, and neither outcome is a useful diagnostic. Short-circuit `||` is what keeps the second operand from running at all.',
  },
  match: {
    javascript:
      'The top is the right bracket, so it is removed. Order matters: the *check* comes before the pop. Popping first and comparing afterwards looks equivalent and is not — it destroys the evidence and makes the mismatch case impossible to write. After this pop the stack is one shorter, and the invariant "top is the most recent unclosed opener" still holds.',
    python:
      'One `pop` after the check. `pop()` returns the removed element, so a version written as `if stack.pop() != WANT[ch]` is shorter and also correct — it just fuses the two anchors into one line, and then the animation can no longer show the moment the pair was accepted. The extra line is bought deliberately, for the same reason the notes here are longer than the code.',
    java: 'The match is accepted and the opener is removed. `Deque.pop` throws `NoSuchElementException` on an empty deque, so this line is only safe because the `isEmpty` guard on the previous line already ran — a fact worth holding onto, because a `Deque` gives you no compile-time help and the failure is a run-time exception from a line that looks harmless.',
    cpp: 'The match is accepted and the opener is popped. After the pop the underlying `deque` may reallocate or reuse a block — that is invisible here, which is the point of the adapter: the algorithm never touches the storage, so the implementation is free to move memory whenever it likes.',
  },
  done: {
    javascript:
      'The final test, and it is a test rather than a leftover. `stack.length === 0` is the only way to catch an expression that is balanced everywhere except its outermost pair, and an empty input is balanced by the same test — vacuously, which is the correct answer and the one a `if (s) ... else false` shape gets wrong.',
    python:
      'One comparison left to do. The interesting case is the empty string: `len([]) == 0` is `True`, so "" is reported as balanced, which is right. Python gets this for free because the loop body never ran and there is no special case to forget; the same correctness in C++ depends on the caller not having pre-seeded the stack.',
    java: '`isEmpty()` rather than `size() == 0`, which is the same test with the intent written down. This line is where the empty-input case is decided, and it decides it correctly: a `Deque` that was never pushed to is empty, so "" is balanced. Note that a *malformed* string has already returned `false` by now — this line only sees the strings that survived every closer.',
    cpp: 'The end-of-scan test, and the one place the whole algorithm can still go wrong: everything up to here has only rejected strings. If the stack is non-empty, the outer pair was never closed, and no closer will ever come. `st.empty()` on a `std::stack` is the only portable way to ask — there is no `size()` in the interface to get wrong.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'balanced',
    python: 'balanced',
    java: 'BalancedBrackets.balanced',
    cpp: 'balanced',
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

/** The claim, in TypeScript, so the four listings are checked against one rule. */
const isBalanced = (s: string): boolean => {
  const stack: string[] = [];
  for (const ch of s) {
    if (OPEN.includes(ch)) stack.push(ch);
    else if (CLOSE.includes(ch)) {
      if (stack[stack.length - 1] !== PAIRS[ch]) return false;
      stack.pop();
    }
  }
  return stack.length === 0;
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const s = p.input.type === 'chars' ? p.input.values : '';
  return { presetId: p.id, args: [s], result: isBalanced(s) };
});

export const balancedBracketsAlgo: AlgoDef<LinearFrame> = {
  id: 'balanced-brackets',
  title: 'Balanced Brackets',
  category: 'stacks-queues',
  summary:
    'Push every opener, and require each closer to match the top of the stack exactly. Balanced means the stack ends empty.',
  intuition:
    'Reach for this whenever the question is whether a *nesting* is well formed rather than whether a count balances: bracket matching, XML and HTML tag nesting, compiler scope checking, the undo stack in an editor, and matching delimiters in a tokenizer all reduce to "does the most recent unclosed thing get closed next". The moment a counter is enough, use a counter — a stack is O(n) memory you do not need. The moment you need to know *which* thing is open, the stack is not optional.',
  complexity: {
    best: 'O(1)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(n)',
    note: 'O(n) time, with an early exit on the first mismatch so a bad string is often rejected in a few characters. Space is O(d), the maximum nesting depth, not O(n) — the "Left open" preset shows the difference between 3 nodes and a 500-character string of brackets. Best case O(1) is the empty string.',
  },
  traits: {
    stable: true,
    inPlace: true,
    online: true,
    allowsDuplicates: true,
    tags: ['O(1) per character', 'nesting', 'early exit', 'stack depth is the space cost'],
  },
  viewport: 'linear',
  level: 'intro',
  params: [],
  inputSpec,
  presets: PRESETS,
  run: balancedBrackets,
  lesson,
  expectations,
  formatResult: (r) => (r ? 'balanced' : 'not balanced'),
  anchors: ['start', 'push', 'mismatch', 'match', 'done'],
};

export default balancedBracketsAlgo;
