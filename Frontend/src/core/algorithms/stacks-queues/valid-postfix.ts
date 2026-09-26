import { byLanguage } from '../../code/anchors.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isChars } from '../../input/types.ts';
import type { LinearFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Evaluate a postfix (reverse Polish) expression with a stack — and validate it
 * on the way.
 *
 * The evaluation is the easy half and the lesson is the *validation*. Three
 * separate things can be wrong with a postfix expression, and each needs a
 * different check, which is why this module splits them into three anchors
 * rather than one "error" case:
 *
 *  - an operator with fewer than two operands on the stack (`3 +`);
 *  - a token that is neither a number nor a known operator (`3 4 &`);
 *  - a stack that is not exactly one deep at the end (`1 2`), which catches both
 *    a missing operator and a trailing operand.
 *
 * Divide by zero gets a fourth anchor because it is the one input on which the
 * four languages genuinely *disagree about behaviour*, not merely about syntax:
 * JavaScript answers `Infinity`, Java throws `ArithmeticException`, Python raises
 * `ZeroDivisionError`, and C++ integer division by zero is undefined behaviour —
 * usually a `SIGFPE` crash. A portable implementation has to check, which is
 * exactly what the anchor is for.
 *
 * The return value is always a **string**: the decimal result, or `"invalid"`.
 * A number would be natural, but there is no agreed representation for "this
 * expression is malformed" across four languages, and a string makes the failure
 * case as machine-checkable as the success case.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const PRESETS: Preset[] = [
  {
    id: 'simple',
    label: 'One operation',
    blurb:
      '"3 4 +" — two operands, one operator, one result. The whole expression is three tokens, and the invariant is already visible: after the last token the stack holds exactly the value of the expression so far.',
    input: { type: 'chars', values: '3 4 +' },
  },
  {
    id: 'left-associative',
    label: 'Left associative, no parentheses',
    blurb:
      '"2 3 4 * +" — reads as ((2*3)+4). The stack is what supplies the parentheses: pushing 2, 3 and 4, then * consumes the top two and leaves its result where they were, so + finds 6 and 4. This is the entire reason postfix needs no brackets.',
    input: { type: 'chars', values: '2 3 4 * +' },
  },
  {
    id: 'too-few-operands',
    label: 'Operator with no operands',
    blurb:
      '"3 +" — one operand is not enough to subtract from. A version that pops twice without checking gets a null or an exception here, and the "did you pop what you think you popped" bug this catches is the one that silently produces wrong arithmetic rather than crashing.',
    input: { type: 'chars', values: '3 +' },
  },
  {
    id: 'integer-division',
    label: 'Integer division truncates',
    blurb:
      '"9 4 /" — 2, not 2.25. Java and C++ truncate toward zero with integer `/`, JavaScript gives 2.25 from `/` and needs `Math.trunc`, and Python\'s `/` gives 2.25 too while `//` *floors*. Four languages, three different defaults, one number in the expectations.',
    input: { type: 'chars', values: '9 4 /' },
  },
  {
    id: 'divide-by-zero',
    label: 'Divide by zero',
    blurb:
      '"7 0 /" — the one input where the four languages do not merely differ in syntax but differ in *behaviour*: JavaScript says Infinity, Java throws, Python raises, and C++ is undefined. A portable checker has to look, which is what this frame is.',
    input: { type: 'chars', values: '7 0 /' },
  },
  {
    id: 'bad-token',
    label: 'Unknown token',
    blurb:
      '"3 4 &" — both operands are fine and then a token arrives that is neither a number nor one of the four operators. The subtlest of the three failures, because a lenient evaluator will happily push 0 for it and return a plausible wrong answer.',
    input: { type: 'chars', values: '3 4 &' },
  },
  {
    id: 'leftover-operands',
    label: 'Operands left over',
    blurb:
      '"1 2" — no error at all until the very end, when the stack is two deep instead of one. Every token was legal and every operator was applied; the expression is still malformed, and only the final depth check catches it.',
    input: { type: 'chars', values: '1 2' },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const OPS = ['+', '-', '*', '/'];
const INT = /^-?\d+$/;

/** The machine-checkable claim, computed once in TypeScript for all four listings. */
export function postfixResult(expr: string): string {
  const stack: number[] = [];
  for (const token of expr.trim().split(/\s+/)) {
    if (token === '') continue;
    if (OPS.includes(token)) {
      if (stack.length < 2) return 'invalid';
      const b = stack.pop() as number;
      const a = stack.pop() as number;
      if (token === '/' && b === 0) return 'invalid';
      stack.push(
        token === '+' ? a + b : token === '-' ? a - b : token === '*' ? a * b : Math.trunc(a / b),
      );
    } else if (INT.test(token)) {
      stack.push(Number(token));
    } else {
      return 'invalid';
    }
  }
  if (stack.length !== 1) return 'invalid';
  return String(stack[0]);
}

export function* validPostfix(ctx: RunContext): Generator<LinearFrame> {
  const raw = isChars(ctx.input) ? ctx.input.values : '';
  const expr = String(raw);
  const tokens = expr
    .trim()
    .split(/\s+/)
    .filter((t) => t !== '');

  const stack: number[] = [];
  let ops = 0;
  let ok = true;

  const top = (): number => Math.max(0, stack.length - 1);

  function* reject(anchor: string, tok: string, i: number, note: string): Generator<LinearFrame> {
    ok = false;
    yield {
      kind: 'linear',
      index: 0,
      anchor,
      caption: `Token ${i + 1} of ${tokens.length}`,
      note,
      flavour: 'stack',
      items: [...stack],
      edges: { top: stack.length },
      highlight: { current: [top()] },
      result: 'invalid',
      ops,
      vars: { i, token: tok, depth: stack.length, ops },
    };
  }

  yield {
    kind: 'linear',
    index: 0,
    anchor: 'start',
    caption: 'Empty stack',
    note:
      tokens.length === 0
        ? 'An empty expression. Nothing is read and the stack is empty at the end, so this is not a valid expression — one value is required, and "0" would be the smallest such expression.'
        : `${tokens.length} token${tokens.length === 1 ? '' : 's'}: ${tokens.join(' ')}. The invariant is the whole algorithm: **after every token, the stack holds the values of the complete subexpressions read so far, in order.** A number extends it, an operator collapses its top two into one.`,
    flavour: 'stack',
    items: [...stack],
    edges: { top: stack.length },
    highlight: {},
    vars: { depth: 0, tokens: tokens.length, ops },
  };

  for (let i = 0; i < tokens.length && ok; i++) {
    if (ctx.shouldStop()) return;
    ops++;
    const token = tokens[i] as string;

    if (OPS.includes(token)) {
      if (stack.length < 2) {
        yield* reject(
          'too-few',
          token,
          i,
          `Read the operator \`${token}\` as token ${i + 1}, and the stack holds only ${stack.length} value${stack.length === 1 ? '' : 's'}. An operator needs two. A version that pops twice without looking will get a null or throw here — and the versions that quietly pop twice and add a zero are worse still, because they return a plausible wrong answer.`,
        );
        break;
      }
      const b = stack.pop() as number;
      const a = stack.pop() as number;

      if (token === '/' && b === 0) {
        yield* reject(
          'divide-by-zero',
          token,
          i,
          `The right operand is 0, so \`${a} / 0\` has no answer to report. This is the one input on which the four implementations do not merely look different but *behave* differently: JavaScript yields \`Infinity\`, Java throws \`ArithmeticException\`, Python raises \`ZeroDivisionError\`, and C++ integer division by zero is undefined behaviour. Checking is not defensive style here — it is the only portable answer.`,
        );
        break;
      }

      const value =
        token === '+' ? a + b : token === '-' ? a - b : token === '*' ? a * b : Math.trunc(a / b);
      stack.push(value);

      yield {
        kind: 'linear',
        index: 0,
        anchor: 'apply',
        caption: `Token ${i + 1} of ${tokens.length}`,
        note: `Pop ${b} then ${a} — the right operand comes off first, which is why subtraction and division are not commutative here. Apply \`${token}\` to get ${value} and push it back where the two were, so the stack shrinks by exactly one.${token === '/' ? ' Integer division truncates toward zero, matching Java and C++; that is the note the preset is named for.' : ''}`,
        flavour: 'stack',
        items: [...stack],
        edges: { top: stack.length },
        highlight: { picked: [stack.length - 1] },
        ops,
        vars: { i, op: token, a, b, result: value, depth: stack.length, ops },
      };
      continue;
    }

    if (INT.test(token)) {
      stack.push(Number(token));
      yield {
        kind: 'linear',
        index: 0,
        anchor: 'push',
        caption: `Token ${i + 1} of ${tokens.length}`,
        note: `Read the number \`${token}\`. A literal is a subexpression all by itself, so it goes straight on the stack — the depth grows and nothing is validated yet, which is exactly why "${tokens.join(' ')}" needs a final check to be rejected.`,
        flavour: 'stack',
        items: [...stack],
        edges: { top: stack.length },
        highlight: { picked: [stack.length - 1] },
        ops,
        vars: { i, token, value: Number(token), depth: stack.length, ops },
      };
      continue;
    }

    yield* reject(
      'bad-token',
      token,
      i,
      `\`${token}\` is neither a number nor one of ${OPS.join(' ')}. Nothing before it was wrong, which is what makes this the subtle failure: a lenient evaluator that treats an unrecognised token as 0 returns a perfectly plausible wrong answer instead of refusing.`,
    );
  }

  if (ok && stack.length !== 1) {
    yield {
      kind: 'linear',
      index: 0,
      anchor: 'leftovers',
      caption: 'End of expression',
      note:
        stack.length === 0
          ? 'The expression ended with an empty stack, so no value was ever produced. "The stack is one deep at the end" is the check, and an empty stack fails it exactly as a two-deep stack does.'
          : `The expression ended with the stack ${stack.length} deep (${stack.join(' ')}). Every token was legal and every operator applied cleanly, yet the expression is malformed: a complete postfix expression leaves exactly one value. Only this final depth check catches it.`,
      flavour: 'stack',
      items: [...stack],
      edges: { top: stack.length },
      highlight: { current: [top()] },
      result: 'invalid',
      ops,
      vars: { depth: stack.length, ops },
    };
    ok = false;
  }

  if (!ok) {
    yield {
      kind: 'linear',
      index: 0,
      anchor: 'done',
      caption: 'Invalid',
      note: `Rejected after ${ops} operation${ops === 1 ? '' : 's'}. The stack still holds ${stack.length} value${stack.length === 1 ? '' : 's'}; nothing is unwound because a stack evaluator has nothing to undo — the values were never part of any larger structure.`,
      flavour: 'stack',
      items: [...stack],
      edges: { top: stack.length },
      highlight: { current: [top()] },
      result: 'invalid',
      ops,
      vars: { depth: stack.length, ops },
    };
    return;
  }

  const value = stack[0] as number;
  yield {
    kind: 'linear',
    index: 0,
    anchor: 'done',
    caption: `= ${value}`,
    note: `Exactly one value left, so the expression is well formed and evaluates to ${value}. ${ops} token${ops === 1 ? '' : 's'} read, every operator applied to the two values directly beneath it.`,
    flavour: 'stack',
    items: [...stack],
    edges: { top: 1 },
    highlight: { answer: [0] },
    result: 'value',
    ops,
    vars: { value, depth: stack.length, ops },
  };
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Postfix expression',
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
 * All four return a string: the decimal value, or `"invalid"`. That is the only
 * shape that can express both outcomes identically, and it forces every listing
 * to be explicit about *why* it rejected an expression rather than throwing.
 * ------------------------------------------------------------------ */

const JS = `function evaluate(expr) {
  const stack = [];                                          // @anchor start
  for (const token of expr.trim().split(/\\s+/)) {
    if (token === '') continue;
    if ('+-*/'.includes(token)) {
      if (stack.length < 2) return 'invalid';                // @anchor too-few
      const b = stack.pop();                                 // right operand first
      const a = stack.pop();
      if (token === '/' && b === 0) return 'invalid';        // @anchor divide-by-zero
      // Math.trunc because JavaScript's / is float division; Java and C++
      // truncate toward zero for free on integers.
      stack.push(
        token === '+' ? a + b
        : token === '-' ? a - b
        : token === '*' ? a * b
        : Math.trunc(a / b));                                 // @anchor apply
    } else if (/^-?\\d+$/.test(token)) {
      stack.push(Number(token));                              // @anchor push
    } else {
      return 'invalid';                                       // @anchor bad-token
    }
  }
  if (stack.length !== 1) return 'invalid';                   // @anchor leftovers
  return String(stack[0]);                                    // @anchor done
}`;

const PY = `def evaluate(expr):
    stack = []                                               # @anchor start
    for token in expr.split():
        if token in "+-*/":
            if len(stack) < 2:                                # @anchor too-few
                return "invalid"
            b = stack.pop()                                   # right operand first
            a = stack.pop()
            if token == "/" and b == 0:                        # @anchor divide-by-zero
                return "invalid"
            if token == "+":
                stack.append(a + b)
            elif token == "-":
                stack.append(a - b)
            elif token == "*":
                stack.append(a * b)
            else:
                # int() truncates toward zero, like Java and C++. Python's //
                # would FLOOR, so -7 // 2 is -4 where Java gives -3.
                stack.append(int(a / b))                      # @anchor apply
        elif token.lstrip("-").isdigit():
            stack.append(int(token))                          # @anchor push
        else:
            return "invalid"                                  # @anchor bad-token
    if len(stack) != 1:                                       # @anchor leftovers
        return "invalid"
    return str(stack[0])                                      # @anchor done
`;

const JAVA = `import java.util.ArrayDeque;
import java.util.Deque;

class ValidPostfix {
    static String evaluate(String expr) {
        Deque<Integer> stack = new ArrayDeque<>();            // @anchor start
        for (String token : expr.trim().split("\\\\s+")) {
            if (token.isEmpty()) continue;
            if (token.equals("+") || token.equals("-") || token.equals("*") || token.equals("/")) {
                if (stack.size() < 2) return "invalid";       // @anchor too-few
                int b = stack.pop();                          // right operand first
                int a = stack.pop();
                if (token.equals("/") && b == 0) return "invalid";  // @anchor divide-by-zero
                int r;
                if (token.equals("+")) r = a + b;
                else if (token.equals("-")) r = a - b;
                else if (token.equals("*")) r = a * b;
                else r = a / b;                               // @anchor apply
                stack.push(r);
            } else if (token.matches("-?\\\\d+")) {
                stack.push(Integer.parseInt(token));           // @anchor push
            } else {
                return "invalid";                              // @anchor bad-token
            }
        }
        if (stack.size() != 1) return "invalid";              // @anchor leftovers
        return String.valueOf(stack.pop());                    // @anchor done
    }
}`;

const CPP = `#include <sstream>
#include <string>
#include <vector>

std::string evaluate(const std::string& expr) {
    std::vector<int> stack;                                    // @anchor start
    std::string token;
    std::istringstream in(expr);
    while (in >> token) {
        bool isOp = token == "+" || token == "-" || token == "*" || token == "/";
        if (isOp) {
            if (stack.size() < 2) return "invalid";            // @anchor too-few
            int b = stack.back(); stack.pop_back();            // right operand first
            int a = stack.back(); stack.pop_back();
            if (token == "/" && b == 0) return "invalid";      // @anchor divide-by-zero
            if (token == "+") stack.push_back(a + b);
            else if (token == "-") stack.push_back(a - b);
            else if (token == "*") stack.push_back(a * b);
            else stack.push_back(a / b);                       // @anchor apply
        } else {
            bool digits = !token.empty();
            for (size_t k = 0; k < token.size(); k++) {
                if (k == 0 && token[k] == '-') continue;
                if (token[k] < '0' || token[k] > '9') digits = false;
            }
            if (!digits) return "invalid";                     // @anchor bad-token
            stack.push_back(std::stoi(token));                 // @anchor push
        }
    }
    if (stack.size() != 1) return "invalid";                   // @anchor leftovers
    return std::to_string(stack.back());                       // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'An empty array, and the invariant that makes the whole thing work: after every token, the stack holds the values of the complete subexpressions read so far. A literal appends to that list; an operator replaces its top two entries with their combination. The stack *is* the parenthesisation — that is why postfix needs no brackets.',
    python:
      'The same invariant, and Python gets to name it precisely because lists are the natural stack: the list is the sequence of subexpression values, in order. `expr.split()` with no argument already collapses runs of whitespace, which is one small thing Python does for free that the other three listings have to spell with a regular expression.',
    java: 'A `Deque<Integer>` rather than a `Stack`, for the reasons the balanced-brackets module sets out: `java.util.Stack` is a synchronised `Vector` and every operation pays for that. The boxing is the price of the collection — a primitive `int` cannot be a `Deque` element, so every push allocates. `ArrayDeque` is the right answer and the allocation is the cost.',
    cpp: "A `std::vector<int>` used as a stack from the back, which is both faster and simpler than `std::stack` when the values are plain integers — and the tokenizer is a `std::istringstream`, because C++ has no `split`. The `>>` operator skips runs of whitespace for free, which is the same thing Python's bare `split()` does.",
  },
  'too-few': {
    javascript:
      'The check that keeps a pop from reading `undefined`. An operator is only meaningful with two operands, and the stack being too short means the expression is malformed — not that the missing value happens to be zero. Short-circuit returns here rather than pushing a default, which is what separates a validator from something that invents data.',
    python:
      '`len(stack) < 2` before two pops. Python would raise `IndexError` from `pop()` on an empty list, and would happily pop a real value and then fail on the second, so the check has to be on the *depth*, not on the first pop succeeding. Two pops from a one-deep stack is the classic off-by-one that turns a validation error into a wrong answer.',
    java: '`stack.size() < 2` guards two `pop()` calls. Note that `Deque.pop()` on an empty deque throws `NoSuchElementException` rather than returning null, so without this guard the "too few operands" case would surface as an exception from a line that has nothing to do with the problem — the kind of stack trace that costs an afternoon.',
    cpp: 'The depth check before two `pop_back` calls, and in C++ it is not optional in the same way as elsewhere: `pop_back` on an empty vector is undefined behaviour, so the guard is the difference between a returned string and a program the compiler is entitled to optimise into nonsense. Two pops from a one-element vector is a real bug, and a real bug here reads memory that was already freed.',
  },
  'divide-by-zero': {
    javascript:
      'The one place the four implementations would genuinely disagree, and JavaScript is the odd one out: `7 / 0` is `Infinity`, not an error, so an unguarded evaluator returns a plausible-looking string that no other language would produce. Checking costs one comparison and turns an unrepresentable result into a clean "invalid".',
    python:
      'Python raises `ZeroDivisionError` here rather than returning anything, so the check is not about arithmetic at all — it is about turning an exception into a value the harness can compare. Worth internalising: the "obvious" implementation of this algorithm is already correct in Python and still needs this line, because the failure mode being designed for is a malformed expression, not a malformed program.',
    java: '`Integer` division by zero throws `ArithmeticException: / by zero`, so an unguarded version would take down the whole run with a stack trace instead of returning `"invalid"`. In Java, deciding *what a malformed input means* is a real design decision with a real cost attached, and a bare `ArithmeticException` is not an answer.',
    cpp: 'C++ is the language that makes this check mandatory rather than merely wise: signed integer division by zero is **undefined behaviour**, and on real hardware it is usually a `SIGFPE` that kills the process with no message. A compiler is entitled to assume `b != 0` and delete the check you wrote to catch it. This is the clearest example in the whole curriculum of why "it works on my machine" is a memory-management problem too.',
  },
  apply: {
    javascript:
      "The right operand is popped **first**. That ordering is the whole reason `-` and `/` are not commutative here, and the reason a postfix expression can express `(2-3)-4` and `2-(3-4)` differently without any brackets. `Math.trunc` is not optional: JavaScript's `/` always produces a float, so `9 / 4` is 2.25 while Java and C++ give 2.",
    python:
      'Python writes this as a chain of `if`/`elif` and ends on `int(a / b)`. The `int()` matters twice over: it truncates toward zero to match Java and C++, and it is *not* the same as `//`, which floors — so `-7 // 2` is `-4` in Python where Java and C++ both give `-3`. Getting that wrong is invisible on every non-negative input and wrong on every negative one.',
    java: 'Java truncates toward zero for free: `a / b` on two `int`s is integer division, and `-7 / 2` is `-3`, not `-4` and not `-3.5`. That is the C99 rule, and it is the opposite of JavaScript and of mathematical floor division. The `if/else` chain is a little longer than a `switch` on the token would be, and it is here to keep the arithmetic visibly inside the branches.',
    cpp: 'The same integer division as Java, for the same reason and the same standard: C++11 mandates truncation toward zero, so `-7 / 2` is `-3`. Note the vector is used directly, so `stack.back()` followed by `pop_back()` is two calls that a real implementation would fuse — but every extra abstraction here would hide the very thing the frame is about.',
  },
  push: {
    javascript:
      'A literal is a complete subexpression by itself, so it goes straight on. The depth grows and nothing is validated — which is the reason the "operands left over" preset can be made entirely of legal tokens and still be rejected. `Number(token)` on a string that already matched `/^-?\\d+$/` cannot produce `NaN`, so this push is total.',
    python:
      '`token.lstrip("-").isdigit()` is the numeric test, and it is stricter than it looks: `isdigit` rejects `+5`, `1.5` and `1_0`, so those become "invalid" rather than being silently coerced. That strictness is the point of a validating evaluator. The leading-minus strip is a two-character fix that `str.isdigit()` alone would get wrong for every negative number.',
    java: "A regex match, then `Integer.parseInt`. The order matters: matching first means a 40-digit literal is rejected as a bad token rather than throwing `NumberFormatException` from inside the parse, so the failure lands on the anchor that explains it. Java's `matches` is a full-string match, not a search — a habit worth checking, because `String.matches` behaving like `Pattern.find` is a classic surprise.",
    cpp: "A hand-rolled digit test, then `std::stoi`. The loop skips a single leading `-` and requires every other character to be in `'0'..'9'`, so `.` and `+` and empty strings all fail — a validating evaluator has to be as fussy as a compiler here or it will invent numbers. `std::stoi` on a validated token cannot throw, which is the payoff for doing the check by hand.",
  },
  'bad-token': {
    javascript:
      'Neither a number nor one of the four operators. This is the subtle failure: nothing before it was wrong, and a lenient evaluator that treats an unrecognised token as `0` produces a perfectly plausible wrong answer instead of refusing. Refusing is the feature.',
    python:
      'The `else` of the two tests, and in Python the risk is specific: `int("4.5")` raises but `int(float("4.5"))` does not, and a version that reached for a float conversion and a truncation would happily accept decimals this grammar does not have. Rejecting the token is the only answer consistent with the other three languages.',
    java: 'The catch-all, reached only when the token is neither a known operator nor `-?\\d+`. Java\'s `String.matches` is anchored, so `"3x"` fails the numeric test and lands here — which is the behaviour you want, and the behaviour a `Pattern.find` would not give you.',
    cpp: 'The same catch-all, after a hand-rolled digit scan. Note that this listing has no `isdigit` shortcut available in a locale-independent, sign-tolerant form, which is why the loop is written out: C++ would rather you be explicit about the grammar than inherit one from the locale.',
  },
  leftovers: {
    javascript:
      'The end-of-input check, and the only one that catches `"1 2"`. Every token was legal, every operator applied, and the expression is still malformed: a complete postfix expression leaves exactly one value on the stack. Drop this line and the function returns the *top* of a two-deep stack, which is a wrong answer with no error anywhere.',
    python:
      '`len(stack) != 1` — the `!=` rather than `<` is deliberate, because a stack that somehow ended up deeper than one means the invariant is already broken and there is no sensible value to return. And `expr.split()` on an empty string gives an empty list, so the zero-deep case arrives here too and is caught by the same line.',
    java: 'The final `size() != 1`. In Java the alternative — returning `stack.peek()` — would silently accept `"1 2"` and hand back 2, which is exactly the bug this check exists to prevent. Validation that only rejects *early* errors is half a validator; the end state is a separate claim and needs its own test.',
    cpp: 'The same final depth test on the vector. Note that `stack.size()` is a `size_t`, so writing `stack.size() == 1` is safe but `stack.size() - 1` on an empty vector is not — an unsigned underflow, which is a compile-clean way to read out of bounds and a classic C++ bug that has nothing to do with this algorithm.',
  },
  done: {
    javascript:
      "The one value that is left. `String(...)` rather than returning the number, because the function's other return values are strings and the harness compares structurally: a mixed return type would make every failure case a type error instead of a value mismatch, which is a much worse diagnostic.",
    python:
      '`str(stack[0])`, for the same reason: the function returns a string on every path, so a mismatch against the harness is always a *value* mismatch and never a type error. Python would have been perfectly happy to return an int, and the string is a cost paid once to make four languages comparable.',
    java: '`String.valueOf(stack.pop())` — the pop and the format in one. Note `String.valueOf` rather than string concatenation on an `Integer`: both box, but the explicit call is the one that reads unambiguously when the result is being compared against a JSON string by an external harness.',
    cpp: '`std::to_string(stack.back())`. Four different ways of turning an integer into a decimal string across the four listings, and they have to agree byte for byte because the harness compares them as text: `String.valueOf`, `str`, `to_string` and template interpolation all produce `"2"`, not `"2.0"` or `"2 "` — which is worth checking whenever a numeric algorithm is verified.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'evaluate',
    python: 'evaluate',
    java: 'ValidPostfix.evaluate',
    cpp: 'evaluate',
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

const exprOf = (p: Preset): string => (p.input.type === 'chars' ? p.input.values : '');

const expectations: Expectation[] = PRESETS.map((p) => {
  const expr = exprOf(p);
  return { presetId: p.id, args: [expr], result: postfixResult(expr) };
});

export const validPostfixAlgo: AlgoDef<LinearFrame> = {
  id: 'valid-postfix',
  title: 'Evaluate a Postfix Expression',
  category: 'stacks-queues',
  summary:
    'Read the expression left to right: a number goes on the stack, an operator takes the top two and puts their result back. One value left at the end means it was well formed.',
  intuition:
    "Reach for this whenever you are parsing something that cannot fail halfway: an expression language, a bytecode stream, a spreadsheet formula, a shunting-yard conversion. Postfix is the form that needs no lookahead and no error recovery, because every operator's operands are guaranteed to be sitting on top of the stack already — which is why real virtual machines emit postfix and why stack machines (the JVM, WebAssembly) evaluate expressions this way. The validation half matters just as much: an unvalidated evaluator turns malformed input into plausible wrong answers.",
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(n)',
    note: 'O(n) in the token count, with one push or one collapse per token and no rescanning. Space is O(n) in the worst case — a right-nested expression such as "1 2 3 4 + + +" pushes every operand before any operator — and O(√n) for a balanced expression, which is the reason the space cost is worth thinking about rather than assuming.',
  },
  traits: {
    stable: true,
    inPlace: false,
    online: true,
    allowsDuplicates: true,
    tags: ['no parentheses', 'single pass', 'validated', 'stack machine'],
  },
  viewport: 'linear',
  level: 'intermediate',
  params: [],
  inputSpec,
  presets: PRESETS,
  run: validPostfix,
  lesson,
  expectations,
  formatResult: (r) => (r === 'invalid' ? 'invalid expression' : `= ${String(r)}`),
  anchors: [
    'start',
    'too-few',
    'divide-by-zero',
    'apply',
    'push',
    'bad-token',
    'leftovers',
    'done',
  ],
};

export default validPostfixAlgo;
