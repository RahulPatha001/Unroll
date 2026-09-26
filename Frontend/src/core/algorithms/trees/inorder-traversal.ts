import { byLanguage } from '../../code/anchors.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isKeys } from '../../input/types.ts';
import type { NodeId, TreeFrame, TreeNode } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * In-order Traversal — recursion, with the call stack drawn.
 *
 * The algorithm is three lines. The *point* of animating it is the thing those
 * three lines are hiding: a recursive call pushes a frame, the frame stays alive
 * while its children run, and it comes off again afterwards. The `path` field on
 * every frame is that call stack, root-first, growing on the way down and
 * shrinking on the way back up — and the order in which values are emitted is
 * produced entirely by the *order in which frames are popped*.
 *
 * So the one thing to watch is the difference between the frame that enters a
 * node and the frame that visits it. They have the same node in `path`, and
 * between them the left subtree has been visited and returned — which is why
 * the in-order sequence comes out sorted even though the code reads as "left,
 * then me, then right".
 *
 * The four listings keep the parallel-array representation used across this
 * family, with `-1` for "no child". The interesting cross-language material is
 * the *recursion*: Python and JavaScript close over the arrays for free, C++
 * captures them in a `std::function`, and Java — which has no closures over
 * locals in a static method at all — has to thread every array and the output
 * buffer through the call by hand.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const PRESETS: Preset[] = [
  {
    id: 'balanced',
    label: 'Balanced (6 keys)',
    blurb:
      'The everyday shape. Watch the emitted order: 20, 30, 50, 60, 70, 80 — sorted, even though nothing in the code sorts anything. In-order traversal of a BST *is* the sorted sequence, and that is the theorem this module exists to make visible.',
    input: { type: 'keys', values: [50, 30, 70, 20, 60, 80] },
    params: { count: 6 },
  },
  {
    id: 'perfect',
    label: 'Perfect tree (7 keys, depth 3)',
    blurb:
      'A complete tree, so the stack never gets deeper than 4 frames and every node is visited at the same depth. This is what a balanced tree buys you, drawn as a stack you can count.',
    input: { type: 'keys', values: [50, 25, 75, 12, 37, 62, 87] },
    params: { count: 7 },
  },
  {
    id: 'ascending',
    label: 'Ascending (a right spine)',
    blurb:
      'The worst case for recursion: six nested calls before a single value is emitted, because every left child is empty. The same output, six times the stack.',
    input: { type: 'keys', values: [16, 20, 49, 60, 68, 76] },
    params: { count: 6 },
  },
  {
    id: 'descending',
    label: 'Descending (a left spine)',
    blurb:
      'The mirror image, and a different visiting order for the same reason: the recursion goes as deep as it can to the *left* first, and everything is emitted on the way back up.',
    input: { type: 'keys', values: [76, 68, 60, 49, 20, 16] },
    params: { count: 6 },
  },
  {
    id: 'single',
    label: 'One node',
    blurb:
      'The smallest non-empty tree: one call, one visit, one pop. Worth seeing once, because every longer answer is this answer with frames stacked underneath it.',
    input: { type: 'keys', values: [42] },
    params: { count: 1 },
  },
  {
    id: 'empty',
    label: 'Empty tree',
    blurb:
      'No nodes, so the first call returns immediately and the result is the empty string. The degenerate case must not crash, and it is the one place where "no answer" and "the empty answer" coincide.',
    input: { type: 'keys', values: [] },
    params: { count: 0 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

interface Slot {
  value: number;
  left: number;
  right: number;
  parent: number;
  side: number;
}

const id = (i: number): NodeId => `n${i}`;

function build(keys: number[]): { slots: Slot[]; root: number } {
  const slots: Slot[] = [];
  let root = -1;
  for (const key of keys) {
    if (root === -1) {
      slots.push({ value: key, left: -1, right: -1, parent: -1, side: 0 });
      root = 0;
      continue;
    }
    let cur = root;
    for (;;) {
      const here = slots[cur] as Slot;
      if (key === here.value) break;
      const goLeft = key < here.value;
      if (goLeft ? here.left === -1 : here.right === -1) {
        if (goLeft) here.left = slots.length;
        else here.right = slots.length;
        slots.push({ value: key, left: -1, right: -1, parent: cur, side: goLeft ? -1 : 1 });
        break;
      }
      cur = goLeft ? here.left : here.right;
    }
  }
  return { slots, root };
}

type From = 'root' | 'left' | 'right';

export function* inorderTraversal(ctx: RunContext): Generator<TreeFrame> {
  const raw = isKeys(ctx.input) ? ctx.input.values.map((v) => Number(v)) : [];
  const wanted = Math.max(0, Math.min(12, Math.trunc(Number(ctx.params.count ?? 6))));
  const keys = raw.slice(0, wanted);

  const { slots, root } = build(keys);
  /** The live call stack, root-first. Every frame here is a pending `return`. */
  const stack: NodeId[] = [];
  const out: number[] = [];
  const visited: NodeId[] = [];
  let ops = 0;
  let deepest = 0;

  const snapshot = (): Record<NodeId, TreeNode> => {
    const rec: Record<NodeId, TreeNode> = {};
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i] as Slot;
      rec[id(i)] = {
        id: id(i),
        value: slot.value,
        parent: slot.parent === -1 ? null : id(slot.parent),
        side: slot.side < 0 ? 'left' : slot.side > 0 ? 'right' : 'root',
        depth: depthOf(i),
      };
    }
    return rec;
  };

  /** Nodes that are neither on the stack nor already emitted. */
  const pending = (): NodeId[] => {
    const onStack = new Set<NodeId>(stack);
    return slots.map((_, i) => id(i)).filter((n) => !onStack.has(n) && !visited.includes(n));
  };

  const depthOf = (i: number): number => {
    let d = 0;
    let k = i;
    while (k !== -1) {
      d++;
      k = (slots[k] as Slot).parent;
    }
    return d - 1;
  };

  const frame = (
    anchor: string,
    note: string,
    highlight: Record<string, NodeId[]>,
    vars: Record<string, number | string | boolean>,
  ): TreeFrame => ({
    kind: 'tree',
    index: 0,
    anchor,
    note,
    nodes: snapshot(),
    root: root === -1 ? null : id(root),
    path: [...stack],
    highlight,
    ops,
    vars,
  });

  yield frame(
    'start',
    root === -1
      ? 'The tree is empty, so the very first call has nothing to visit and returns at once. The result is the empty string — a real answer, not an error.'
      : `A tree of ${keys.length} key${keys.length === 1 ? '' : 's'}. The walk visits left subtree, then the node, then right subtree, and the amber spine is the call stack: every node on it has a \`return\` still pending.`,
    { output: [], unvisited: slots.map((_, i) => id(i)) },
    { nodes: slots.length, depth: stack.length, out: '', ops },
  );

  function* walk(i: number, from: From): Generator<TreeFrame> {
    if (ctx.shouldStop()) return;
    ops++;

    if (i === -1) {
      yield frame(
        'null',
        `The ${from === 'left' ? 'left' : from === 'right' ? 'right' : 'root'} slot is empty, so this call returns without pushing a frame. That is why an empty subtree costs a call and nothing else — and why the stack depth is about the tree's height, not its size.`,
        { output: [...visited], current: stack.length ? [stack[stack.length - 1] as NodeId] : [] },
        { depth: stack.length, out: out.join(','), ops },
      );
      return;
    }

    const slot = slots[i] as Slot;
    const sideWord = slot.side < 0 ? 'left child' : slot.side > 0 ? 'right child' : 'root';
    stack.push(id(i));
    deepest = Math.max(deepest, stack.length);

    yield frame(
      from === 'root' ? 'call' : from === 'left' ? 'descend-left' : 'descend-right',
      from === 'root'
        ? `First call, on the root ${slot.value}. A frame is pushed and everything below it is now waiting: the node's value cannot be emitted until its whole left subtree has been visited. Stack depth ${stack.length}.`
        : `Descending into the ${sideWord} ${slot.value}, pushing another frame. The stack is ${stack.length} deep, and every one of those frames is a \`return\` that has not happened yet — that is the entire cost of recursion, drawn.`,
      {
        current: [id(i)],
        output: [...visited],
        unvisited: pending(),
      },
      { at: slot.value, depth: stack.length, max: deepest, out: out.join(','), ops },
    );

    yield* walk(slot.left, 'left');
    if (ctx.shouldStop()) return;

    out.push(slot.value);
    visited.push(id(i));
    yield frame(
      'visit',
      `The left call has returned and popped its frame — the spine is shorter than it was a moment ago. Now ${slot.value} goes into the output, between "everything smaller" and "everything larger". Output so far: ${out.length ? out.join(', ') : '(nothing yet)'}.`,
      { current: [id(i)], answer: [id(i)], output: [...visited] },
      { at: slot.value, depth: stack.length, out: out.join(','), ops },
    );

    yield* walk(slot.right, 'right');
    if (ctx.shouldStop()) return;

    stack.pop();
    const backTo =
      stack.length === 0
        ? 'nobody — the outermost call is finishing'
        : stack.length === 1
          ? 'the root'
          : 'the node below it on the spine';
    yield frame(
      'pop',
      `The call for ${slot.value} is finished, so its frame leaves the call stack and control goes back to ${backTo}. Everything this frame still owed — its value, and its right subtree — has been delivered. This shrinking of the spine is the return, and there is no code for it beyond falling off the end.`,
      { current: stack.length ? [stack[stack.length - 1] as NodeId] : [], output: [...visited] },
      { at: slot.value, depth: stack.length, out: out.join(','), ops },
    );
  }

  yield* walk(root, 'root');

  yield frame(
    'done',
    `The stack is empty and the output is ${out.length > 0 ? out.join(', ') : '(empty)'}. The whole result is produced by the order frames come *off* the stack, not by any comparison in the code — which is why in-order traversal of a BST is sorted and in-order traversal of an arbitrary tree is not. ${deepest} frames deep at worst, ${ops} calls in total.`,
    { answer: [...visited], output: [...visited] },
    { depth: 0, max: deepest, result: out.join(','), ops },
  );
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Keys, in insertion order',
      kind: 'keys' as const,
      default: PRESETS[0]?.input.type === 'keys' ? PRESETS[0].input.values : [],
    },
  ],
  build: (values: Record<string, unknown>): AlgoInput => ({
    type: 'keys',
    values: Array.isArray(values.values) ? (values.values as number[]) : [],
  }),
  sizeOf: (input: AlgoInput): number => (input.type === 'keys' ? input.values.length : 0),
};

/* ------------------------------------------------------------------ *
 * 4. The lesson — four languages, one set of anchors
 * ------------------------------------------------------------------ */

const PARALLEL = `// Parallel arrays indexed by insertion order, -1 for "no child", so the same
// structure is expressible in all four languages without a Node class.`;

const JS = `${PARALLEL}
function inorderTraversal(keys) {
  const value = [], left = [], right = [];                    // @anchor start
  let root = -1;
  for (const key of keys) {
    if (root === -1) {
      value.push(key); left.push(-1); right.push(-1);
      root = 0;
      continue;
    }
    let cur = root;
    for (;;) {
      const goLeft = key < value[cur];
      const free = goLeft ? left[cur] : right[cur];
      if (free !== -1) { cur = free; continue; }
      if (goLeft) left[cur] = value.length; else right[cur] = value.length;
      value.push(key); left.push(-1); right.push(-1);
      break;
    }
  }

  const out = [];
  // \`from\` is only there so a comment can say which side we arrived from; the
  // algorithm does not read it. A closure over \`value\`, \`left\`, \`right\` and
  // \`out\` is free in JavaScript - Java has to be handed all four.
  function walk(i, from) {                                    // @anchor call
    if (i === -1) return;                                     // @anchor null
    walk(left[i], 'left');                                    // @anchor descend-left
    out.push(String(value[i]));                               // @anchor visit
    walk(right[i], 'right');                                  // @anchor descend-right
    // Falling off the end is the \`return\`: this frame is popped.   // @anchor pop
  }
  walk(root, 'root');
  return out.join(',');                                       // @anchor done
}`;

const PY = `${PARALLEL.replace(/\/\//g, '#')}
def inorder_traversal(keys):
    value, left, right = [], [], []                            # @anchor start
    root = -1
    for key in keys:
        if root == -1:
            value.append(key); left.append(-1); right.append(-1)
            root = 0
            continue
        cur = root
        while True:
            go_left = key < value[cur]
            free = left[cur] if go_left else right[cur]
            if free != -1:
                cur = free
                continue
            if go_left:
                left[cur] = len(value)
            else:
                right[cur] = len(value)
            value.append(key); left.append(-1); right.append(-1)
            break

    out = []
    # \`from\` is only there so a comment can say which side we arrived from; the
    # algorithm does not read it. The closure sees value, left, right and out
    # without being passed them, and out.append mutates rather than rebinds, so
    # no \`nonlocal\` is needed anywhere in this function.
    def walk(i, frm):                                          # @anchor call
        if i == -1:                                             # @anchor null
            return
        walk(left[i], 'left')                                  # @anchor descend-left
        out.append(str(value[i]))                              # @anchor visit
        walk(right[i], 'right')                                # @anchor descend-right
        # Falling off the end is the \`return\`: this frame is popped.   # @anchor pop

    walk(root, 'root')
    return ','.join(out)                                       # @anchor done`;

const JAVA = `import java.util.ArrayList;
import java.util.List;

${PARALLEL}
class InorderTraversal {
    // Java has no closures over locals in a static method, so the arrays and the
    // output list are threaded through every call by hand. That verbosity is the
    // price of the "no Node class" decision, and it is why recursive helpers in
    // Java so often get wrapped in an inner class instead.
    static void walk(int i, String from, int[] value, int[] left, int[] right, List<String> out) {  // @anchor call
        if (i == -1) return;                                    // @anchor null
        walk(left[i], "left", value, left, right, out);         // @anchor descend-left
        out.add(String.valueOf(value[i]));                      // @anchor visit
        walk(right[i], "right", value, left, right, out);       // @anchor descend-right
        // Falling off the end is the \`return\`: this frame is popped.   // @anchor pop
    }

    static String inorderTraversal(int[] keys) {
        int n = keys.length;
        int[] value = new int[n], left = new int[n], right = new int[n];  // @anchor start
        java.util.Arrays.fill(left, -1);
        java.util.Arrays.fill(right, -1);
        int size = 0, root = -1;
        for (int k = 0; k < n; k++) {
            int key = keys[k];
            if (root == -1) { value[0] = key; size = 1; root = 0; continue; }
            int cur = root;
            for (;;) {
                boolean goLeft = key < value[cur];
                int free = goLeft ? left[cur] : right[cur];
                if (free != -1) { cur = free; continue; }
                if (goLeft) left[cur] = size; else right[cur] = size;
                value[size] = key; size++;
                break;
            }
        }
        List<String> out = new ArrayList<>();
        walk(root, "root", value, left, right, out);
        return String.join(",", out);                           // @anchor done
    }
}`;

const CPP = `${PARALLEL}
#include <functional>
#include <string>
#include <vector>
using std::function;
using std::string;
using std::vector;

string inorder_traversal(vector<int> keys) {
    vector<int> value, left, right;                             // @anchor start
    int root = -1;
    for (int key : keys) {
        if (root == -1) {
            value.push_back(key); left.push_back(-1); right.push_back(-1);
            root = 0;
            continue;
        }
        int cur = root;
        for (;;) {
            bool goLeft = key < value[cur];
            int free = goLeft ? left[cur] : right[cur];
            if (free != -1) { cur = free; continue; }
            if (goLeft) left[cur] = (int)value.size();
            else right[cur] = (int)value.size();
            value.push_back(key); left.push_back(-1); right.push_back(-1);
            break;
        }
    }

    vector<string> out;
    // std::function rather than a plain lambda: a lambda cannot name itself, and
    // a recursive function needs to. The capture-by-reference list is what gives
    // C++ the same closure behaviour Python and JavaScript have for free.
    function<void(int, const char*)> walk = [&](int i, const char* from) {  // @anchor call
        (void)from;  // only here so a comment can name the side we came from
        if (i == -1) return;                                     // @anchor null
        walk(left[i], "left");                                   // @anchor descend-left
        out.push_back(std::to_string(value[i]));                 // @anchor visit
        walk(right[i], "right");                                 // @anchor descend-right
        // Falling off the end is the \`return\`: this frame is popped.   // @anchor pop
    };
    walk(root, "root");
    string joined;
    for (size_t i = 0; i < out.size(); i++) {
        if (i) joined += ",";
        joined += out[i];
    }
    return joined;                                               // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'The build phase, then the arrays the closure will capture. JavaScript closures see the enclosing `value`, `left`, `right` and `out` without being passed them, which is why `walk` below takes only a node index — and why this whole function is four arguments shorter than the Java one.',
    python:
      'The build phase, identical to the other three. The `while True` here is broken by the `break` at the end of the body — the same shape as the `for (;;)` in Java and C++, and the reason all four listings look alike at this point even though three of them spell "loop forever" differently.',
    java: 'The build phase, and the three `Arrays.fill` calls. The preallocation is what a Java BST always costs: a fresh int[] is zero-filled, and `0` is a valid index, so without them the tree would be a ring pointing at its own first node.',
    cpp: 'The build phase. The vectors grow on demand so there is no size counter and no fill, which is the only structural difference from the Java version — and the reason this listing is a little shorter while doing the same work.',
  },
  call: {
    javascript:
      'The first activation, on the root. Calling a function pushes a frame onto the call stack, and that frame stays alive — holding `i` — until this function returns. That is the entire mechanism: the value of the root cannot be emitted yet because its frame is still waiting on the line below.',
    python:
      "The first activation. A Python frame is a real object on the interpreter's value stack, and `sys.setrecursionlimit` (1000 by default) is a hard cap on how many of these can be alive at once. Six nodes is nothing; a degenerate tree of a thousand is a RecursionError, which is a failure mode the other three languages share but do not report this early.",
    java: 'The first activation. The JVM sizes its stack generously — roughly a megabyte of frames — so this throws StackOverflowError far later than Python would, and with no way to catch it usefully. The other thing to notice is the parameter list: a static method has no closure, so the arrays come along on every call.',
    cpp: 'The first activation. C++ gives you no recursion limit at all, only the real stack: blow through it and the process dies with a segmentation fault, with no unwinding and no diagnostic. That is the worst of the four failure modes, and it is why an iterative version with an explicit stack is the right habit for a tall tree.',
  },
  null: {
    javascript:
      'The slot is empty, so the call returns without pushing a frame. This is the line that terminates the recursion, and it is why the stack depth tracks the *height* of the tree rather than its size: a subtree with no nodes costs one call and zero frames.',
    python:
      'The slot is empty, so the call returns. This single line is the base case, and it is the one thing every recursive function needs and every recursive bug forgets — a missing base case is not a wrong answer, it is a RecursionError thousands of calls later.',
    java: 'The slot is empty, so the call returns. `return;` with no value, because `walk` is void and accumulates into the shared list rather than returning anything — a design that avoids threading a result type back up through every frame, at the cost of a mutable output parameter.',
    cpp: 'The slot is empty, so the call returns. `return;` in a `void` lambda, accumulating into the captured vector. The capture is why C++ needs no output parameter here, and the reason this function is a shorter read than the Java version even though it is the same algorithm.',
  },
  'descend-left': {
    javascript:
      'The recursive call, and the whole traversal in one line. Nothing is emitted before it and nothing is skipped after it, which is the definition of "in order" — and the reason the output is sorted even though this function contains no comparison at all.',
    python:
      'The recursive call. Note what is *not* here: no `nonlocal`, because `out.append` mutates a list in place rather than rebinding the name. A version that wrote `out = out + [value[i]]` would need `nonlocal out` and would be O(n²) besides — a small change that turns a linear walk into a quadratic one.',
    java: 'The recursive call, carrying five extra arguments. Every array is passed down the stack and none of them changes, so a real implementation would wrap them in a small object and pass one reference — the standard Java answer to "recursion needs too many parameters".',
    cpp: 'The recursive call. `walk` is a `std::function`, so this line is an indirect call through a type-erased wrapper rather than a direct one; with a plain lambda C++ would have to use the awkward `self(self, ...)` trick, because a lambda cannot refer to itself by name. The wrapper costs a nanosecond and buys readable recursion.',
  },
  visit: {
    javascript:
      'The visit, and it happens *between* the two calls — that is the entire definition of in-order. The value is emitted after the left subtree has been fully visited and before the right subtree has been started, so everything already in `out` is smaller and everything still to come is larger.',
    python:
      'The visit. `str(value[i])` is what makes the result a string rather than a list of numbers — the same function returns "1,2" and not [1, 2], and every language here has to say the conversion explicitly, which is a small reminder that the return type is a contract rather than a detail.',
    java: 'The visit. `String.valueOf(value[i])` boxes an int into a String, and `List<String>` is the output type, so the join at the end is free. Returning a list of strings rather than a joined string would be a different API — and a better one if the caller wants to iterate the result, which is a real trade-off about what a traversal should hand back.',
    cpp: 'The visit, and `std::to_string` is the conversion every C++ string API seems to need somewhere. Pushing strings into a vector and joining at the end — rather than concatenating as we go — is what keeps this O(n): `joined += out[i]` in a loop with std::string would be O(n²) in the worst case.',
  },
  'descend-right': {
    javascript:
      'The right subtree, visited last, and the last thing this frame does. After it returns, there is nothing left in this activation, so the frame is discarded and control resumes in the caller — which is the pop, one line below.',
    python:
      'The right subtree. The order left / self / right is the only thing separating an in-order traversal from a pre-order one, and it is worth noticing how little separates them: swap the first two lines and you get a completely different, equally simple algorithm with a completely different output.',
    java: 'The right subtree. The three lines — call, visit, call — are the whole traversal, and they are in this order for the same reason they are in every other language: the ordering is the algorithm, not an implementation detail of it.',
    cpp: 'The right subtree. By the time this line runs, every value smaller than this node has been emitted and none larger has, which is the invariant that makes in-order traversal of a BST a sort. Change the column order and the invariant is gone.',
  },
  pop: {
    javascript:
      'Falling off the end of the function *is* the return, and it is what pops the frame. There is no explicit `return` statement here on purpose: for a void function, reaching the closing brace and returning nothing do the same thing, and the frame disappears either way — which is the part students find hardest to believe.',
    python:
      'Falling off the end returns None, which is discarded. The frame is destroyed as the call completes, and the locals it was holding — `i`, and the value it had pushed — are released. CPython keeps that frame in a free list rather than freeing it, which is why deep recursion here costs memory but not much time.',
    java: 'Falling off the end of a void method returns to the caller, and the frame is reclaimed. The JIT can see the frame is dead at exactly that point, which is the point where it is allowed to reuse that stack space — so recursion costs memory only for as long as a frame is actually reachable.',
    cpp: 'Falling off the end destroys the frame. With -O2 the compiler may keep the whole activation in registers instead of on the stack, and it may inline a whole subtree of calls — which is why a tail-recursive version of this walk can run in constant stack space in C++ but not in the other three.',
  },
  done: {
    javascript:
      'The empty stack and the joined string. The result is produced entirely by the order frames come *off* the stack, not by any comparison in the code — which is exactly why in-order traversal of a BST is the sorted sequence and in-order traversal of an arbitrary tree is not. `join` on an empty array gives "", and that is a legitimate answer here.',
    python:
      "The empty stack and the joined string. `','.join([])` is `''`, so an empty tree returns the empty string rather than raising — worth knowing, because a caller that splits the result on commas gets `['']` rather than `[]`, and that is a bug waiting for the empty case.",
    java: 'The empty stack and the joined string. `String.join(",", out)` on an empty list is `""`. A real implementation would offer both a `String` and an `Iterator` version, because forcing every caller to re-parse a comma-joined string is the sort of convenience that becomes a bottleneck in a hot loop.',
    cpp: 'The empty stack and the joined string, built by hand because C++17 has no `join` — the loop is three lines, and the `if (i)` is what avoids a leading comma. This is the one place in the file where the language is visibly more work than the other three, and it is the price of not having a standard library for it yet.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'inorderTraversal',
    python: 'inorder_traversal',
    java: 'InorderTraversal.inorderTraversal',
    cpp: 'inorder_traversal',
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

const keysOf = (p: Preset): number[] => {
  const raw = p.input.type === 'keys' ? p.input.values.map((v) => Number(v)) : [];
  return raw.slice(0, Math.max(0, Math.min(12, Number(p.params?.count ?? 6))));
};

/**
 * Iterative in-order with an explicit stack — the same walk with the recursion
 * removed, so agreement is a check on the traversal rather than on the spelling.
 */
const iterativeInorder = (keys: number[]): string => {
  const { slots, root } = build(keys);
  const out: number[] = [];
  const stack: number[] = [];
  let cur = root;
  for (;;) {
    while (cur !== -1) {
      stack.push(cur);
      cur = (slots[cur] as Slot).left;
    }
    if (stack.length === 0) break;
    const node = stack.pop() as number;
    out.push((slots[node] as Slot).value);
    cur = (slots[node] as Slot).right;
  }
  return out.join(',');
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const keys = keysOf(p);
  return { presetId: p.id, args: [keys], result: iterativeInorder(keys) };
});

export const inorderTraversalAlgo: AlgoDef<TreeFrame> = {
  id: 'inorder-traversal',
  title: 'In-order Traversal',
  category: 'trees',
  summary:
    'Visit the left subtree, then the node, then the right subtree — and watch the call stack push and pop as the output appears in sorted order.',
  intuition:
    'Reach for it whenever a tree has to be *read* rather than searched: printing a directory listing in name order, draining a priority queue in order, walking a syntax tree left to right, or flattening a nested structure into a flat list. Its real value is that in-order traversal of a BST is a sort that costs nothing beyond the walk — and the real cost is the stack, which is why a tree that insertion made tall will overflow a recursive traversal long before it makes lookups slow.',
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(h)',
    note: 'Every node is visited once, so the time is always O(n). The space is the stack depth, i.e. the tree height: O(log n) balanced, O(n) degenerate — and the recursive form turns that into a real risk, since Python raises RecursionError around a thousand frames and C++ segfaults when the machine stack runs out.',
  },
  traits: {
    stable: true,
    inPlace: true,
    online: false,
    allowsDuplicates: false,
    tags: ['recursion', 'call stack', 'sorted output', 'O(n)'],
  },
  viewport: 'tree',
  level: 'intermediate',
  params: [
    {
      key: 'count',
      label: 'Keys inserted',
      kind: 'number',
      min: 0,
      max: 12,
      step: 1,
      default: 6,
      help: 'The tree is built from this many keys, in the order given.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: inorderTraversal,
  lesson,
  expectations,
  formatResult: (r) => (r === '' ? '(empty)' : String(r)),
  anchors: ['start', 'call', 'null', 'descend-left', 'visit', 'descend-right', 'pop', 'done'],
};

export default inorderTraversalAlgo;
