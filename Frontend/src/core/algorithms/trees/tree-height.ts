import { byLanguage } from '../../code/anchors.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isKeys } from '../../input/types.ts';
import type { CellValue, NodeId, TreeFrame, TreeNode } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Tree Height — the same tree as In-order Traversal, a different walk, and a
 * different kind of answer.
 *
 * The point of putting these two modules side by side is that the *tree* is
 * identical and only the traversal order differs. In-order emits a value on the
 * way back up the stack and produces the sorted sequence. Post-order measures
 * both subtrees first and only then computes anything about the node — which is
 * the only order in which a height is available, and therefore the only order
 * that can answer "is this tree balanced?".
 *
 * The measure-then-decide order is the whole lesson: at the moment a node is
 * visited, its children's heights are already final, so `|l - r| > 1` is a
 * complete answer with no second pass. An AVL tree is exactly a tree where that
 * test never fires — which is why this walk is the measurement half of every
 * self-balancing insert, and why "check the balance factors" and "rebalance"
 * are the same code path.
 *
 * Every node carries its computed height as `meta: { height }`, which the
 * viewport draws as `hN` underneath the box. Watching those labels appear from
 * the bottom up is the clearest picture of post-order there is.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const PRESETS: Preset[] = [
  {
    id: 'balanced',
    label: 'Balanced (6 keys)',
    blurb:
      'Nothing is ever out of balance, so the check never fires and the hN labels just appear. The height is 3 for six nodes — the minimum a six-node BST can have.',
    input: { type: 'keys', values: [50, 30, 70, 20, 60, 80] },
    params: { count: 6 },
  },
  {
    id: 'perfect',
    label: 'Perfect tree (7 keys, height 3)',
    blurb:
      'A complete tree, so every node has a left and a right subtree of the same height and every balance factor is exactly 0. This is what the AVL invariant looks like when it is not being tested.',
    input: { type: 'keys', values: [50, 25, 75, 12, 37, 62, 87] },
    params: { count: 7 },
  },
  {
    id: 'ascending',
    label: 'Ascending (every node is lopsided)',
    blurb:
      'Six ascending keys make a right spine, so the height is 6 and *every* node below the root fails the balance check. The walk still gets every answer right — it is the tree that is bad, not the measurement.',
    input: { type: 'keys', values: [16, 20, 49, 60, 68, 76] },
    params: { count: 6 },
  },
  {
    id: 'descending',
    label: 'Descending (the mirror, same height)',
    blurb:
      'The same height as ascending from a left spine. Different shape, same measurement, same verdict — which is the clearest possible demonstration that "height" and "balance" are two different questions.',
    input: { type: 'keys', values: [76, 68, 60, 49, 20, 16] },
    params: { count: 6 },
  },
  {
    id: 'single',
    label: 'One node',
    blurb:
      'One node, two empty children, so both sub-heights are 0, the height is 1, and the balance factor is 0. The degenerate case that must not crash, and the base of the whole recurrence.',
    input: { type: 'keys', values: [42] },
    params: { count: 1 },
  },
  {
    id: 'empty',
    label: 'Empty tree',
    blurb:
      'No nodes at all, so the first call returns 0 before anything is measured. Height 0 for an empty tree is a convention, and the one answer in this module that is defined rather than computed.',
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
  /** Filled in by the walk; -1 until the node has been measured. */
  height: number;
}

const id = (i: number): NodeId => `n${i}`;

function build(keys: number[]): { slots: Slot[]; root: number } {
  const slots: Slot[] = [];
  let root = -1;
  for (const key of keys) {
    if (root === -1) {
      slots.push({ value: key, left: -1, right: -1, parent: -1, side: 0, height: -1 });
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
        slots.push({
          value: key,
          left: -1,
          right: -1,
          parent: cur,
          side: goLeft ? -1 : 1,
          height: -1,
        });
        break;
      }
      cur = goLeft ? here.left : here.right;
    }
  }
  return { slots, root };
}

type From = 'root' | 'left' | 'right';

export function* treeHeight(ctx: RunContext): Generator<TreeFrame> {
  const raw = isKeys(ctx.input) ? ctx.input.values.map((v) => Number(v)) : [];
  const wanted = Math.max(0, Math.min(12, Math.trunc(Number(ctx.params.count ?? 6))));
  const keys = raw.slice(0, wanted);

  const { slots, root } = build(keys);
  /** The live call stack, root-first. */
  const stack: NodeId[] = [];
  const measured: NodeId[] = [];
  const lopsided: NodeId[] = [];
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
        // No label until the node has actually been measured: a height that is
        // printed before it is known is a lie, and this walk is about honesty
        // about which numbers exist yet.
        ...(slot.height >= 0 ? { meta: { height: slot.height } } : {}),
      };
    }
    return rec;
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
    vars: Record<string, CellValue | boolean>,
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
      ? 'The tree is empty, so the very first call returns 0 and nothing is measured. Height 0 is a convention here rather than a computation — the one answer in this module that is defined rather than derived.'
      : `A tree of ${keys.length} key${keys.length === 1 ? '' : 's'}, and a post-order walk: both subtrees first, then the node. Heights are labelled hN under each box as they are computed, and nothing is labelled before it is known — which is the difference between this traversal and the in-order one.`,
    { unvisited: slots.map((_, i) => id(i)) },
    { nodes: slots.length, depth: 0, measured: 0, ops },
  );

  function* walk(i: number, from: From): Generator<TreeFrame> {
    if (ctx.shouldStop()) return;
    ops++;

    if (i === -1) {
      yield frame(
        'null',
        `The ${from === 'left' ? 'left' : from === 'right' ? 'right' : 'root'} slot is empty, and an empty subtree has height 0 by definition. Returning 0 rather than recursing is what makes the leaf case fall out of the same formula as every other node — no special case for leaves anywhere below.`,
        {
          measured: [...measured],
          current: stack.length ? [stack[stack.length - 1] as NodeId] : [],
        },
        { depth: stack.length, measured: measured.length, ops },
      );
      return 0;
    }

    const slot = slots[i] as Slot;
    const sideWord = slot.side < 0 ? 'left child' : slot.side > 0 ? 'right child' : 'root';
    stack.push(id(i));
    deepest = Math.max(deepest, stack.length);

    yield frame(
      from === 'root' ? 'call' : from === 'left' ? 'descend-left' : 'descend-right',
      from === 'root'
        ? `First call, on the root ${slot.value}. Nothing can be said about this node yet: its height is 1 + the larger of two heights that do not exist, so the walk has to go and get them.`
        : `Descending into the ${sideWord} ${slot.value}, pushing another frame. This is post-order doing its work — no value is produced on the way *down*, only on the way back up, which is why the spine here is exactly the same shape as an in-order walk's and the two produce completely different things.`,
      { current: [id(i)], measured: [...measured], unvisited: pending() },
      { at: slot.value, depth: stack.length, max: deepest, ops },
    );

    const l = yield* walk(slot.left, 'left');
    if (ctx.shouldStop()) return 0;
    const r = yield* walk(slot.right, 'right');
    if (ctx.shouldStop()) return 0;

    const h = 1 + Math.max(l, r);
    slot.height = h;
    measured.push(id(i));
    yield frame(
      'combine',
      `Both subtrees are measured, so now this node can be: 1 + max(${l}, ${r}) = ${h}. The hN label appears here and not one step earlier, and that ordering *is* post-order — a node can only be measured once its children have been.`,
      { current: [id(i)], answer: [id(i)], measured: [...measured] },
      { at: slot.value, left: l, right: r, height: h, ops },
    );

    if (Math.abs(l - r) > 1) {
      lopsided.push(id(i));
      stack.length = 0;
      stack.push(id(i));
      yield frame(
        'unbalanced',
        `Height ${l} on the left against ${r} on the right: a difference of ${Math.abs(l - r)}, and a balanced node allows at most 1. This is the single test an AVL tree exists to keep from ever firing, and the rotation it would trigger happens at exactly this node.`,
        { compare: [id(i)], answer: [id(i)], lopsided: [...lopsided] },
        { at: slot.value, left: l, right: r, balance: l - r, height: h, ops },
      );
    }

    stack.pop();
    return h;
  }

  function pending(): NodeId[] {
    const onStack = new Set<NodeId>(stack);
    return slots.map((_, i) => id(i)).filter((n) => !onStack.has(n) && !measured.includes(n));
  }

  const height = yield* walk(root, 'root');
  stack.length = 0;

  yield frame(
    'done',
    `Height ${height} in levels, ${measured.length} node${measured.length === 1 ? '' : 's'} measured in ${ops} calls, and ${lopsided.length} node${lopsided.length === 1 ? '' : 's'} out of balance. Post-order is the only traversal that can answer this in one pass, and that property — children before parents — is the same property that makes the whole of dynamic programming work.`,
    { answer: [...measured], lopsided: [...lopsided] },
    {
      height,
      nodes: slots.length,
      lopsided: lopsided.length,
      balanced: lopsided.length === 0,
      ops,
    },
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

const PARALLEL = `// Parallel arrays indexed by insertion order, -1 for "no child" — the same
// representation as the rest of the tree family, so all four listings are the
// same data structure rather than four dialects of "null".`;

const JS = `${PARALLEL}
function treeHeight(keys) {
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

  const height = new Array(value.length).fill(-1);
  const unbalanced = [];
  // Post-order: both children are measured before anything is said about this
  // node, which is the only order in which a height exists.
  function walk(i, from) {                                     // @anchor call
    if (i === -1) return 0;                                    // @anchor null
    const l = walk(left[i], 'left');                           // @anchor descend-left
    const r = walk(right[i], 'right');                         // @anchor descend-right
    const h = 1 + Math.max(l, r);                              // @anchor combine
    height[i] = h;
    // A balanced node's two subtrees differ by at most one level.
    if (Math.abs(l - r) > 1) unbalanced.push(i);               // @anchor unbalanced
    return h;
  }
  // \`unbalanced\` is what this walk exists to produce: an AVL insert rotates at
  // exactly these nodes. What is returned is the height, because that is the
  // number a caller can check.
  const h = walk(root, 'root');
  return h;                                                    // @anchor done
}`;

const PY = `${PARALLEL.replace(/\/\//g, '#')}
def tree_height(keys):
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

    height = [-1] * len(value)
    unbalanced = []
    # Post-order: both children are measured before anything is said about this
    # node, which is the only order in which a height exists.
    def walk(i, frm):                                          # @anchor call
        if i == -1:                                             # @anchor null
            return 0
        l = walk(left[i], 'left')                              # @anchor descend-left
        r = walk(right[i], 'right')                            # @anchor descend-right
        h = 1 + max(l, r)                                       # @anchor combine
        height[i] = h
        # A balanced node's two subtrees differ by at most one level.
        if abs(l - r) > 1:                                      # @anchor unbalanced
            unbalanced.append(i)
        return h
    # \`unbalanced\` is what this walk exists to produce: an AVL insert rotates at
    # exactly these nodes. What is returned is the height, because that is the
    # number a caller can check.
    h = walk(root, 'root')
    return h                                                    # @anchor done`;

const JAVA = `${PARALLEL}
class TreeHeight {
    // The representation is still parallel arrays keyed by index - see the note
    // above. A static method has no closures over locals, so the arrays live in
    // the fields of this tiny holder, the same concession AVL Rotate makes.
    static final class Walk {
        int[] value = new int[64], left = new int[64], right = new int[64];  // @anchor start
        int[] height = new int[64];
        List<Integer> unbalanced = new ArrayList<>();

        Walk() {
            java.util.Arrays.fill(left, -1);
            java.util.Arrays.fill(right, -1);
            java.util.Arrays.fill(height, -1);
        }

        // Post-order: both children are measured before anything is said about
        // this node, which is the only order in which a height exists.
        int walk(int i, String from) {                           // @anchor call
            if (i == -1) return 0;                              // @anchor null
            int l = walk(left[i], "left");                      // @anchor descend-left
            int r = walk(right[i], "right");                    // @anchor descend-right
            int h = 1 + Math.max(l, r);                         // @anchor combine
            height[i] = h;
            // A balanced node's two subtrees differ by at most one level.
            if (Math.abs(l - r) > 1) unbalanced.add(i);         // @anchor unbalanced
            return h;
        }
    }

    static int treeHeight(int[] keys) {
        Walk w = new Walk();
        int size = 0, root = -1;
        for (int k = 0; k < keys.length; k++) {
            int key = keys[k];
            if (root == -1) { w.value[0] = key; size = 1; root = 0; continue; }
            int cur = root;
            for (;;) {
                boolean goLeft = key < w.value[cur];
                int free = goLeft ? w.left[cur] : w.right[cur];
                if (free != -1) { cur = free; continue; }
                if (goLeft) w.left[cur] = size; else w.right[cur] = size;
                w.value[size] = key; size++;
                break;
            }
        }
        // \`unbalanced\` is what this walk exists to produce: an AVL insert
        // rotates at exactly these nodes. What is returned is the height,
        // because that is the number a caller can check.
        return w.walk(root, "root");                            // @anchor done
    }
}`;

const CPP = `${PARALLEL}
#include <algorithm>
#include <cstdlib>
#include <functional>
#include <vector>
using std::function;
using std::vector;

int tree_height(vector<int> keys) {
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

    vector<int> height(value.size(), -1);
    vector<int> unbalanced;
    // Post-order: both children are measured before anything is said about this
    // node, which is the only order in which a height exists. The recursive
    // lambda has to name itself through a std::function.
    std::function<int(int, const char*)> walk = [&](int i, const char* from) -> int {  // @anchor call
        (void)from;
        if (i == -1) return 0;                                  // @anchor null
        int l = walk(left[i], "left");                          // @anchor descend-left
        int r = walk(right[i], "right");                        // @anchor descend-right
        int h = 1 + std::max(l, r);                             // @anchor combine
        height[i] = h;
        // A balanced node's two subtrees differ by at most one level.
        if (std::abs(l - r) > 1) unbalanced.push_back(i);        // @anchor unbalanced
        return h;
    };
    // \`unbalanced\` is what this walk exists to produce: an AVL insert rotates
    // at exactly these nodes. What is returned is the height, because that is
    // the number a caller can check.
    return walk(root, "root");                                  // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'The build phase, then the two arrays the closure fills in. `height` starts at -1 rather than 0 precisely so that "not measured yet" is distinguishable from "measured and zero" — an empty subtree really does have height 0, so 0 cannot double as the uninitialised marker.',
    python:
      'The build phase, then the measurement state. `[-1] * len(value)` is one object per slot, and -1 is a third state alongside "0 because empty" and "1 because leaf" — worth being explicit about, because collapsing -1 into 0 would make every leaf look like an empty subtree.',
    java: 'The build phase, on the `Walk` holder, and the three `Arrays.fill` calls. The arrays are fields rather than locals because a static method has no closures over locals — the same concession AVL Rotate makes, and the reason this file is a class with a nested holder rather than two free functions.',
    cpp: 'The build phase, then `height` and `unbalanced`. Vectors grow on demand, so there is no size counter and no fill calls — the only structural difference from Java. The `-1` initialiser is the same idea as everywhere else: a distinct "not measured" state, because 0 is a real answer here.',
  },
  call: {
    javascript:
      "Entering the call on the root. The frame is pushed and nothing can be concluded yet — a node's height depends on two numbers that have not been computed — which is the difference between this and an in-order walk, where pushing the frame is all that happens too but the *use* of the frame is completely different.",
    python:
      "Entering the call. A Python frame on the value stack, and the two recursive calls below will make this frame wait. Python's recursion limit (1000 by default) is the practical ceiling on tree height here; a spine of 2000 nodes raises RecursionError, where C++ would segfault and Java would throw StackOverflowError.",
    java: 'Entering the call. `from` is not read by the algorithm at all — it exists so the call sites can be labelled, which is the same trick In-order Traversal uses. The JVM allows far deeper recursion than Python before failing, and the failure is a StackOverflowError that is not worth catching.',
    cpp: 'Entering the call, through a `std::function` rather than a direct call. `walk` must be able to name itself, and a plain lambda cannot, so the type-erased wrapper is the price of a readable recursive lambda; with -O2 the indirect call is often devirtualised away and the cost disappears.',
  },
  null: {
    javascript:
      'The slot is empty, so the subtree has height 0 and this call returns 0 immediately. This single line is why there is no special case for leaves anywhere else in the function: a leaf is just a node whose two recursive calls both return 0, giving 1 + max(0, 0) = 1.',
    python:
      'The slot is empty, so this call returns 0. `return 0` rather than `return None` matters: the caller does `max(l, r)` on the two results, and a `None` in that expression would be a TypeError rather than a wrong number.',
    java: 'The slot is empty, so this call returns 0. Returning a *value* from a recursive function — rather than accumulating into a shared structure, as the traversal modules do — is what makes the arithmetic below work, and it is why this function is a `int` and not a `void`.',
    cpp: "The slot is empty, so this call returns 0. The lambda's return type is declared `-> int` because a recursive `std::function` needs its signature before the body can call itself, and that signature is also what tells `max(l, r)` which overload to use.",
  },
  'descend-left': {
    javascript:
      'The left subtree, measured first. Post-order does not care which child goes first — both are needed before anything is said about this node — so the order is arbitrary, and picking left is a convention rather than a requirement.',
    python:
      'The left subtree. The two calls are separate statements rather than a combined expression, because both results are needed: `max(walk(left), walk(right))` would also work and would be shorter, but it hides the fact that there are two independent recursive descents rather than one nested expression.',
    java: 'The left subtree, into a local. The parameter list is short here only because the arrays are fields of the holder; without it this would be six arguments per call, which is the usual reason Java tree code ends up as an inner class.',
    cpp: 'The left subtree. Nothing about the walk depends on it being left first, and swapping the two lines produces the same heights in a different order — a useful thing to know when a tree is so deep that swapping them changes the maximum stack depth by one frame.',
  },
  'descend-right': {
    javascript:
      'The right subtree, and by the time it returns both heights are final numbers rather than promises. Everything the rest of the function does — the height, the balance check — happens after this line and not before it, which is the entire definition of post-order.',
    python:
      'The right subtree, and the point in the traversal where the recursion bottoms out and starts producing answers. The two results are now plain ints held in the frame, so the three lines below are pure arithmetic on numbers that will not change again.',
    java: 'The right subtree, with its result in a local named `r`. Naming both sub-heights is what makes the two lines below readable: `1 + Math.max(l, r)` and `Math.abs(l - r) > 1` are the same two numbers asked two different questions, and that is the whole balance test.',
    cpp: 'The right subtree. `std::abs` on an int is not the same function as `std::abs` on a double — the double overload lives in <cmath> and this file only includes <algorithm>, which works because the int overload comes in with it. A missing include here is a compile error, which is a better failure than a silent unsigned conversion.',
  },
  combine: {
    javascript:
      "The only line in the traversal that produces a number, and it can only run now: 1 + max of two heights that are already final. Storing it in `height[i]` as well as returning it is the one piece of redundancy here, and it is worth the memory — it is what lets a caller see every node's height without walking the tree again.",
    python:
      'The only line that produces a number, and it can only run now. `height[i] = h` then `return h` is the same value written twice, once for the caller and once for anyone who wants the array afterwards; if you only needed the top-level answer, the array and the store could both go.',
    java: 'The only line that produces a number. `height[i] = h` fills the field array so the measured heights survive the walk, and `return h` hands the value to this node\'s caller — the two uses are different, and a version that only returned would be unable to answer "how tall is every subtree?".',
    cpp: 'The only line that produces a number. `std::max(l, r)` returns a const reference to one of its arguments and the `int` copy happens in the `1 +` — a detail that costs nothing but that surprises people reading `auto`-heavy C++ for the first time.',
  },
  unbalanced: {
    javascript:
      'The balance test, and the reason this traversal exists rather than any other. At this moment both child heights are known, so `Math.abs(l - r) > 1` is a complete answer with no second pass and no extra bookkeeping. An AVL tree is precisely a tree where this never fires.',
    python:
      'The balance test. `abs()` is a builtin on ints and on floats, and the comparison is against 1 rather than 0 — allowing a difference of exactly 1 is what makes a tree with three nodes balanced, and getting that boundary wrong is the classic AVL bug that produces a tree nobody can insert into.',
    java: 'The balance test, and `Math.abs(int)` is an overload that does not promote to double — which is why `Math.abs(l - r) > 1` stays in integer arithmetic. The other `Math.abs` overload takes a double, and mixing them up is a silent promotion bug rather than a compile error in some shapes.',
    cpp: 'The balance test, and `unbalanced.push_back(i)` records the node rather than rotating it: measurement and repair are two separate jobs, and this function only does the first. Every self-balancing structure is this line plus a rotation.',
  },
  done: {
    javascript:
      'The height, in levels: 0 for an empty tree, 1 for a single node. The whole function is O(n) with O(h) stack, and it is the cheapest possible audit of a tree — one pass, no allocation beyond the recursion, and an answer about every node rather than just the root.',
    python:
      'The height, in levels. One pass, O(n) time, O(h) stack — and unlike a search, it says something about *every* node, which is why height and balance are always measured together. A tree that is deep is slow for reasons that have nothing to do with how many keys it holds.',
    java: 'The height, in levels. Note the return goes through `w.walk(root, "root")` and the `unbalanced` list is discarded — which is the honest summary of this module: the measurement is the product, and the caller who wants to act on it needs the list as well as the number.',
    cpp: 'The height, in levels, returned straight out of the `std::function`. The `unbalanced` vector goes out of scope with everything else, which is a real limitation of the shape rather than a bug: a caller that needs to know *where* the tree is lopsided needs this function to hand back more than an int.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'treeHeight',
    python: 'tree_height',
    java: 'TreeHeight.treeHeight',
    cpp: 'tree_height',
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
 * The height computed by a *different* technique: the longest root-to-leaf
 * distance found by breadth-first search, which agrees with the post-order
 * definition and disagrees with nothing.
 */
const breadthFirstHeight = (keys: number[]): number => {
  const { slots, root } = build(keys);
  if (root === -1) return 0;
  let frontier = [root];
  let levels = 0;
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const i of frontier) {
      const slot = slots[i] as Slot;
      if (slot.left !== -1) next.push(slot.left);
      if (slot.right !== -1) next.push(slot.right);
    }
    if (next.length > 0) levels++;
    frontier = next;
  }
  return levels + 1;
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const keys = keysOf(p);
  return { presetId: p.id, args: [keys], result: breadthFirstHeight(keys) };
});

export const treeHeightAlgo: AlgoDef<TreeFrame> = {
  id: 'tree-height',
  title: 'Tree Height',
  category: 'trees',
  summary:
    'Measure both subtrees before touching the node, so a height exists the moment you need it — and a balance check comes out of the same pass.',
  intuition:
    'Reach for it whenever you need to know whether a tree is worth using before you use it: before trusting a recursive traversal, before choosing between a tree and a hash map, or as the first half of every self-balancing insert. The reason it is post-order rather than top-down is the whole point — a height cannot be known until both children have reported, which is exactly the "children before parents" rule that dynamic programming is built on, and the same rule makes a top-down version need either memoisation or repeated work.',
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(h)',
    note: 'Every node is visited once, so the time is always O(n) and there is no interesting best case. The stack is the height — and that is the number worth watching, because a tree whose height is n is a list, however well it is labelled.',
  },
  traits: {
    stable: true,
    inPlace: true,
    online: false,
    allowsDuplicates: false,
    tags: ['recursion', 'post-order', 'balance check', 'O(n)'],
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
  run: treeHeight,
  lesson,
  expectations,
  formatResult: (r) => `height ${r as number}`,
  anchors: [
    'start',
    'call',
    'null',
    'descend-left',
    'descend-right',
    'combine',
    'unbalanced',
    'done',
  ],
};

export default treeHeightAlgo;
