import type { Article } from '../types.ts';

/**
 * Stacks and queues.
 *
 * One article, and the reason is the point: four of the six algorithms in this family
 * are the same two lines of code with a different rule for what to throw away. The
 * fifth (postfix evaluation) is the ordinary stack, included because it is the base
 * case that makes the others legible.
 */
export const MONOTONIC_STACK: Article = {
  slug: 'monotonic-stack',
  title: 'The monotonic stack: five problems, one idea',
  dek: 'Keep a stack in sorted order, and every element you discard is one you have already answered.',
  category: 'stacks-queues',
  tags: ['monotonic stack', 'amortised', 'next greater', 'histogram', 'window'],
  readMinutes: 11,
  body: [
    {
      kind: 'p',
      text: 'A stack is last-in-first-out, which is a strange thing to want until you notice what it is good for: **it is the only structure that can answer "what did I just see?" and forget everything older than it**, in constant time, with no bookkeeping.',
    },
    {
      kind: 'p',
      text: 'This family of algorithms is what happens when you point that property at a problem where the question is always of the form **who is the nearest thing to my left that beats me?** — and the answer is that you should not be deleting elements one at a time. You should be keeping a stack **sorted**, and popping from it whenever the current element makes the top one redundant.',
    },

    { kind: 'h2', text: 'The base case: an ordinary stack' },
    {
      kind: 'p',
      text: 'Postfix evaluation — `3 4 +` means `(3 + 4)` — is a stack for a reason that is easy to miss. The rule "push a number, pop two and push the result" is not a design choice; it is what evaluation order **is**. Every operator consumes two operands, and the order in which the interpreter meets them means the second one it sees is the first one the operator needs.',
    },
    {
      kind: 'stepper',
      algoId: 'valid-postfix',
      caption:
        'Postfix evaluation. The operand order is the subtle part: the right operand comes off first, which is why − and ÷ are not commutative here.',
      preset: 'left-associative',
    },
    {
      kind: 'p',
      text: 'And the error cases are what make it an algorithm rather than a loop. Too few operands, a divide by zero, a token that is neither, leftover operands at the end — four distinct ways to be wrong, and the last one is the one people forget: `"1 2"` is not a valid expression even though nothing about either token is.',
    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'Why the viewport never shows the input string',
      text: 'This app draws the stack and not the expression, which reads as a missing feature until you run it. The compensation is that every note names the character and its position, because a stack visualiser that hides its input teaches you to watch the stack and not to read it.',
    },
    {
      kind: 'p',
      text: 'Bracket matching is the same data structure and the same discipline: push the opener, and when a closer arrives the top must be its partner. The one refinement is early exit — the first mismatch settles the question, so there is no reason to read the rest of the string.',
    },

    { kind: 'h2', text: 'The idea: keep the stack sorted' },
    {
      kind: 'p',
      text: 'Here is the whole technique. Scan left to right. Before pushing the current element, **pop everything it dominates**, and resolve those popped elements on the way out. What is left on the stack is monotonically ordered, so the element at the top is always the most interesting one.',
    },
    {
      kind: 'p',
      text: 'Why pop? Because of what is on the stack when you pop. If element `j` has been waiting since step `2` and the element arriving now is bigger than it, then `j` is finished: this value is its answer, and no future value can be closer. The stack is a list of **unresolved questions**, and popping is the act of answering them.',
    },
    {
      kind: 'stepper',
      algoId: 'next-greater-element',
      caption:
        'Next greater element. One arriving value answers two waiting indices at once — the row underneath the array is the stack, and it is the whole state.',
      preset: 'random',
    },
    {
      kind: 'p',
      text: 'The implementation detail that matters is that the stack holds **indices, not values**. An index is needed to write the answer, and it also carries the position information the value alone has thrown away — which is exactly what the histogram problem needs and the next-greater problem does not.',
    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'Why this is O(n) and not O(n²)',
      text: "Every index is pushed once and popped once. Two facts, and they add up to a linear bound no matter what the data does — this is amortised analysis in its purest form, and the same argument as the hash table's [occasional resize](/learn/reading-big-o). The operation count is not `2n` by coincidence: `n` pushes and exactly `n` answers, because each index is answered exactly once.",
    },
    {
      kind: 'p',
      text: 'What the monotonic order does **not** give you is a sorted result. The stack is sorted, the array is not, and reading the stack out at the end gives you nothing useful. If you need a sorted array, sort it — that is [the sorting landscape](/learn/sorting-landscape), and it is not this.',
    },

    { kind: 'h2', text: 'Instance one: the same shape, two ends' },
    {
      kind: 'p',
      text: 'The next-greater element is the plain version: one pass, one stack, one pop rule. Now put a **window** on it and the stack becomes a **deque**, because elements also have to leave from the front when they fall out of the window.',
    },
    {
      kind: 'stepper',
      algoId: 'sliding-window-max',
      caption:
        'Sliding window maximum. Two different removals: indices expire off the front by position, and values get dominated off the back.',
      preset: 'mixed',
    },
    {
      kind: 'p',
      text: 'That is the entire difference, and both rules are one comparison each. **Expire from the front** when the index is too old to be in the window. **Dominate from the back** when the arriving value is at least as large as the one on top — because a smaller, newer value in the same window makes the older, larger one worthless forever. It can never be the maximum of any window that contains the new element.',
    },
    {
      kind: 'callout',
      tone: 'warn',
      title: '`<=` and not `<`, and that is the whole tie rule',
      text: 'Equal values must kill the older copy. If they did not, a window of seven identical values would accumulate all seven, and the "maximum" would depend on which end you read from. The all-equal preset exists to make that difference visible, and the answer under `<` is always the newest copy.',
    },
    {
      kind: 'p',
      text: 'Note what makes the front the answer: because dominated elements are removed from the back, the deque is **decreasing front to back**, so `deque[0]` is always the maximum of the window. The monotonicity is not a property being maintained for tidiness — it is the mechanism that makes the answer `O(1)` to read.',
    },

    { kind: 'h2', text: 'Instance two: the same shape, with a boundary' },
    {
      kind: 'p',
      text: 'Largest rectangle in a histogram is the same algorithm with one extra thing to work out. When a bar is popped, you have learned two things at once: the height it could have been, and **how wide a rectangle of that height can be** — the width is bounded on the right by the bar that popped it and on the left by whatever is now on top of the stack.',
    },
    {
      kind: 'stepper',
      algoId: 'largest-rectangle',
      caption:
        'Largest rectangle. Each pop measures a rectangle: its left boundary is the new stack top, and its right boundary is the bar that caused the pop.',
      preset: 'tall-middle',
    },
    {
      kind: 'p',
      text: 'That is why the stack holds **bar indices** rather than heights: you need positions. And it is why the boundary arithmetic has an off-by-one that is not really an off-by-one — the left boundary is read **after** the pop and is **exclusive**, while the right boundary is the popping bar and is **inclusive**. An empty stack gives a left boundary of `-1`, a virtual bar outside the histogram, and that `-1` is counted so the width comes out right at the left edge.',
    },
    {
      kind: 'p',
      text: 'The other implementation detail worth copying is the **sentinel**: one extra zero-height bar past the end of the array, which pops everything still on the stack. Without it the last run of bars is never measured — the tallest rectangle is often the one that runs to the end of the input, and the run that finishes last is exactly the one a naive version forgets.',
    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'A zero-height bar is never popped',
      text: 'The pop test is strictly `>`, so a zero bar survives even the zero-height sentinel, and a rectangle at height 0 has area 0 anyway. Harmless — and worth knowing when a trace ends with bars still on the stack that were never resolved, because the ending looks like a bug and is not one.',
    },

    { kind: 'h2', text: 'Instance three: the same shape, remembered forever' },
    {
      kind: 'p',
      text: 'The last variant is the one where nothing is thrown away, because the question cannot be answered until the end. A stack that supports **get minimum in `O(1)`** keeps a second stack alongside the first, and pushes **the current minimum at every depth** rather than only when the minimum changes.',
    },
    {
      kind: 'stepper',
      algoId: 'min-stack',
      caption:
        'The auxiliary stack holds the minimum at each depth, so a pop is two pops with no comparison at all.',
      preset: 'descending-then-low',
    },
    {
      kind: 'p',
      text: 'Push compares against the previous minimum and pushes either the new value or the old minimum again. Pop pops both. `getMin` reads the top of the auxiliary stack. The invariant is one line: **entry `i` of the auxiliary stack is the minimum of the first `i+1` entries of the real stack**, whatever happened to them.',
    },
    {
      kind: 'callout',
      tone: 'warn',
      title: 'Per depth, not per value',
      text: 'The entries have to line up one-to-one with the real stack. Storing only the depths at which the minimum changed is the compressed variant and it works too — but then the pop path needs a comparison and a possible extra pop, which is the trade the naive version declines. In the `first-is-the-min` preset this implementation spends `n` extra slots to remember one repeated number, and that is the price of making `getMin` free.',
    },
    {
      kind: 'p',
      text: 'It is worth noticing that this is the same trick as [a hash table remembering a resize](/learn/reading-big-o) or a heap remembering its structure: **spend space to make a question cheap**. The auxiliary stack is `O(n)` extra to make one operation `O(1)`, which is a good trade exactly when you are asked that question often.',
    },

    { kind: 'h2', text: 'How to recognise it' },
    {
      kind: 'p',
      text: 'The shape appears when a problem has all four of these:',
    },
    {
      kind: 'ol',
      items: [
        '**A left-to-right scan**, so order is already known.',
        '**A nearest-element question** — next greater, largest rectangle, window maximum, minimum so far.',
        '**A transitivity that lets you forget**: if `a > b` arrives after `b`, then `b` is permanently irrelevant, whatever comes next.',
        '**A penalty for rescanning**, which is what stops you from writing the obvious `O(n²)` version.',
      ],
    },
    {
      kind: 'p',
      text: 'Fail the third one and the technique does not apply. If the question is "what is the smallest element so far" with no notion of **nearest**, there is nothing to discard — a smaller value can still be beaten by a **larger** one that comes later, so nothing on the stack is ever redundant. That is why "minimum so far" is a running variable and not a stack problem, while "next greater" is.',
    },
    {
      kind: 'callout',
      tone: 'good',
      title: 'The two-line summary',
      text: 'Keep a stack in sorted order. Before pushing, pop everything the current element beats and answer those elements as they come off. Every push and every pop happens once, so the whole thing is `O(n)` — and the stack is only ever as long as the longest run of unresolved elements, which is why the presets with sorted input show a stack one cell deep.',
    },
  ],
};
