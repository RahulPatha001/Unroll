import { byLanguage } from '../../code/anchors.ts';
import { distinctArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isKeys } from '../../input/types.ts';
import type { NodeId, TreeFrame, TreeNode } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * BST Insert — the algorithm that looks like three lines and is O(n) in the
 * worst case.
 *
 * The whole method is "walk down comparing, hang the new key where a child slot
 * is empty". Nothing about that is subtle. What *is* subtle, and what the
 * ascending preset exists to show, is that the walk is O(height), and a tree
 * built from sorted input is a list. Every insertion walks the entire list to
 * reach the end. So the algorithm has no worst case in its own code — the worst
 * case is entirely a property of the *order the keys arrive in*, which is why
 * the height is what this module returns.
 *
 * Representation note, and it applies to every tree module in this family: the
 * nodes are **parallel arrays indexed by insertion order**, not objects. A node
 * with two child pointers is the obvious design and it is the wrong one here —
 * `null`, `None`, `nullptr` and "no value" are four different spellings of the
 * same idea, and a cyclic object graph cannot be printed or serialised without
 * a visited set. With index-keyed arrays a child is an `int`, `-1` is the null
 * in all four languages, and the same four listings are possible.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 71;

const PRESETS: Preset[] = [
  {
    id: 'ascending',
    label: 'Ascending (the worst case)',
    blurb:
      'Sorted input, and the reason this algorithm has a bad reputation: every key is larger than the whole tree, so every insertion walks to the end of a list. The result is a degenerate tree — a right spine of depth n, and n(n-1)/2 comparisons to build it.',
    input: { type: 'keys', values: distinctArray(SEED, 6, 1, 99).sort((a, b) => a - b) },
    params: { count: 6 },
  },
  {
    id: 'descending',
    label: 'Descending (the mirror image)',
    blurb:
      'The same disaster reflected: a left spine instead of a right one. Comparing a fixed key against an ever-smaller tree is exactly as slow, which is the clue that the problem is the *shape*, not the direction.',
    input: { type: 'keys', values: distinctArray(SEED + 4, 6, 1, 99).sort((a, b) => b - a) },
    params: { count: 6 },
  },
  {
    id: 'balanced',
    label: 'Balanced random keys',
    blurb:
      'Six random keys land near the middle of the range at each step, so the tree is roughly as shallow as it can be. Height 3 here against height 6 for the sorted input — the same six keys, a factor of two in comparisons, and nothing in the insertion code changed.',
    input: { type: 'keys', values: distinctArray(SEED + 8, 6, 20, 80) },
    params: { count: 6 },
  },
  {
    id: 'duplicates',
    label: 'Duplicates rejected',
    blurb:
      'The third key repeats an earlier one. A strict `<` walk has nowhere to put a value equal to the one it is standing on, so the insert is abandoned and the tree keeps the first copy — which is why this BST cannot hold a multiset.',
    input: { type: 'keys', values: [40, 20, 40, 70, 20, 55] },
    params: { count: 6 },
  },
  {
    id: 'empty',
    label: 'No keys at all',
    blurb:
      'Nothing to insert. The tree stays empty, the height is 0, and the degenerate case does not crash — a check worth making visible, because "height of nothing" is the one answer here that a student has to be told.',
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
  side: 'left' | 'right' | 'root';
  depth: number;
}

const id = (i: number): NodeId => `n${i}`;

export function* bstInsert(ctx: RunContext): Generator<TreeFrame> {
  const raw = isKeys(ctx.input) ? ctx.input.values.map((v) => Number(v)) : [];
  const wanted = Math.max(0, Math.min(12, Math.trunc(Number(ctx.params.count ?? 6))));
  const keys = raw.slice(0, wanted);

  const nodes: Slot[] = [];
  let root = -1;
  let ops = 0;
  /** The current search path, root → the node being compared with. */
  const path: NodeId[] = [];

  const snapshot = (): Record<NodeId, TreeNode> => {
    const out: Record<NodeId, TreeNode> = {};
    for (let i = 0; i < nodes.length; i++) {
      const slot = nodes[i] as Slot;
      out[id(i)] = {
        id: id(i),
        value: slot.value,
        parent: slot.parent === -1 ? null : id(slot.parent),
        side: slot.side,
        depth: slot.depth,
      };
    }
    return out;
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
    path: [...path],
    highlight,
    ops,
    vars,
  });

  yield frame(
    'start',
    keys.length === 0
      ? 'No keys to insert, so the tree is empty and stays empty. The height of an empty tree is 0 — the one answer here that is defined by convention rather than by the algorithm.'
      : `An empty tree and ${keys.length} key${keys.length === 1 ? '' : 's'} to insert: ${keys.join(', ')}. Each insert walks down from the root comparing until it finds an empty child slot, so the total cost is the sum of the heights at the moment of each insert.`,
    {},
    { keys: keys.length, nodes: 0, ops },
  );

  for (let k = 0; k < keys.length; k++) {
    if (ctx.shouldStop()) return;
    const key = keys[k] as number;

    if (root === -1) {
      nodes.push({ value: key, left: -1, right: -1, parent: -1, side: 'root', depth: 0 });
      root = 0;
      ops++;
      path.length = 0;
      yield frame(
        'root',
        `The first key, ${key}, has no node to compare against, so it becomes the root and the tree is no longer empty. Every later key hangs off this one — which is why the very first key inserted gets to decide the shape of the whole tree.`,
        { answer: [id(0)] },
        { key, index: k, nodes: nodes.length, ops },
      );
      continue;
    }

    let cur = root;
    path.length = 0;
    for (;;) {
      if (ctx.shouldStop()) return;
      ops++;
      const here = nodes[cur] as Slot;
      path.push(id(cur));

      if (key === here.value) {
        yield frame(
          'duplicate',
          `${key} equals the key already stored at this node, and a strict walk has no child slot for "equal". The insert is abandoned and the first copy wins. To hold duplicates you need a counter on the node, or an explicit rule for which side equals go — this tree has neither.`,
          { compare: [id(cur)], path: [...path] },
          { key, index: k, at: here.value, nodes: nodes.length, ops },
        );
        break;
      }

      if (key < here.value) {
        yield frame(
          'compare',
          `${key} < ${here.value}, so if ${key} belongs anywhere it is in the left subtree. The left child ${here.left === -1 ? 'is empty, so the walk ends here' : `is ${nodes[here.left]?.value as number}, so keep going left`} — ${path.length} node${path.length === 1 ? '' : 's'} down so far.`,
          { compare: [id(cur)], path: [...path] },
          { key, index: k, at: here.value, depth: path.length, ops },
        );
        if (here.left === -1) {
          const at = nodes.length;
          nodes.push({
            value: key,
            left: -1,
            right: -1,
            parent: cur,
            side: 'left',
            depth: here.depth + 1,
          });
          here.left = at;
          yield frame(
            'attach-left',
            `The left slot was empty, so ${key} becomes the left child and the walk stops. That is the entire insertion: one comparison per level, and no rewriting of anything already in the tree.`,
            { answer: [id(at)], path: [...path, id(at)] },
            { key, index: k, parent: here.value, depth: here.depth + 1, nodes: nodes.length, ops },
          );
          break;
        }
        cur = here.left;
        continue;
      }

      yield frame(
        'compare',
        `${key} > ${here.value}, so the answer is in the right subtree. The right child ${here.right === -1 ? 'is empty, so the walk ends here' : `is ${nodes[here.right]?.value as number}, so keep going right`} — ${path.length} node${path.length === 1 ? '' : 's'} down so far.`,
        { compare: [id(cur)], path: [...path] },
        { key, index: k, at: here.value, depth: path.length, ops },
      );
      if (here.right === -1) {
        const at = nodes.length;
        nodes.push({
          value: key,
          left: -1,
          right: -1,
          parent: cur,
          side: 'right',
          depth: here.depth + 1,
        });
        here.right = at;
        yield frame(
          'attach-right',
          `The right slot was empty, so ${key} becomes the right child. One new node, one pointer written, nothing else touched — the property that makes a plain BST insert cheaper than maintaining a sorted array.`,
          { answer: [id(at)], path: [...path, id(at)] },
          { key, index: k, parent: here.value, depth: here.depth + 1, nodes: nodes.length, ops },
        );
        break;
      }
      cur = here.right;
    }
  }

  path.length = 0;
  let height = 0;
  for (const slot of nodes) height = Math.max(height, slot.depth + 1);

  const degenerate = height >= nodes.length && nodes.length > 1;
  yield frame(
    'height',
    `Every node recorded its depth on the way in, so the height is just the largest depth plus one: ${height} level${height === 1 ? '' : 's'}. ${degenerate ? `That equals the number of nodes, which is the tell-tale sign of a degenerate tree — the structure is a list wearing a tree costume.` : 'A well-shaped tree is shallow, and shallow is what makes every later insert cheap.'}`,
    { answer: nodes.filter((s) => s.depth === height - 1).map((s) => id(nodes.indexOf(s))) },
    { nodes: nodes.length, height, ops },
  );

  yield frame(
    'done',
    `Final height ${height} for ${nodes.length} node${nodes.length === 1 ? '' : 's'}, from ${ops} comparisons. ${degenerate ? 'Every key was compared against every key that arrived before it, which is the O(n²) that makes an unbalanced BST a sorted list with extra steps.' : 'Each insert cost about log2(n) comparisons, which is what a balanced tree buys you.'} The fix is not a better insert — it is a rebalancing pass after the insert, which is exactly what an AVL or red-black tree is.`,
    { answer: nodes.filter((s) => s.depth === height - 1).map((s) => id(nodes.indexOf(s))) },
    { nodes: nodes.length, height, result: height, ops },
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

const PARALLEL = `// Nodes are parallel arrays indexed by insertion order, not objects: a node with
// two child pointers would need a different spelling of "no child" in every
// language (undefined, None, null, -1) and a cyclic object graph cannot be
// printed or serialised. Index-keyed arrays make a child an int and -1 the
// null everywhere, so all four listings can be the same algorithm.`;

const JS = `${PARALLEL}
function bstInsert(keys) {
  const value = [], left = [], right = [], depth = [];        // @anchor start
  let root = -1;
  for (const key of keys) {
    if (root === -1) {                                         // @anchor root
      value.push(key); left.push(-1); right.push(-1); depth.push(0);
      root = 0;
      continue;
    }
    let cur = root;
    for (;;) {
      if (key === value[cur]) break;                           // @anchor duplicate
      if (key < value[cur]) {                                 // @anchor compare
        if (left[cur] === -1) {                                // @anchor attach-left
          left[cur] = value.length;
          value.push(key); left.push(-1); right.push(-1);
          depth.push(depth[cur] + 1);
          break;
        }
        cur = left[cur];                                      // @anchor compare
      } else {
        if (right[cur] === -1) {                               // @anchor attach-right
          right[cur] = value.length;
          value.push(key); left.push(-1); right.push(-1);
          depth.push(depth[cur] + 1);
          break;
        }
        cur = right[cur];                                     // @anchor compare
      }
    }
  }
  // Height in levels: one node is 1, an empty tree is 0.
  let h = 0;                                                   // @anchor height
  for (const d of depth) if (d + 1 > h) h = d + 1;
  return h;                                                    // @anchor done
}`;

const PY = `${PARALLEL.replace(/\/\//g, '#')}
def bst_insert(keys):
    value, left, right, depth = [], [], [], []                  # @anchor start
    root = -1
    for key in keys:
        if root == -1:                                          # @anchor root
            value.append(key); left.append(-1); right.append(-1); depth.append(0)
            root = 0
            continue
        cur = root
        while True:
            if key == value[cur]:
                break                                           # @anchor duplicate
            if key < value[cur]:                            # @anchor compare
                if left[cur] == -1:                             # @anchor attach-left
                    left[cur] = len(value)
                    value.append(key); left.append(-1); right.append(-1)
                    depth.append(depth[cur] + 1)
                    break
                cur = left[cur]                          # @anchor compare
            else:
                if right[cur] == -1:                            # @anchor attach-right
                    right[cur] = len(value)
                    value.append(key); left.append(-1); right.append(-1)
                    depth.append(depth[cur] + 1)
                    break
                cur = right[cur]                         # @anchor compare
    # Height in levels: one node is 1, an empty tree is 0.
    h = 0                                                       # @anchor height
    for d in depth:
        h = max(h, d + 1)
    return h                                                    # @anchor done`;

const JAVA = `${PARALLEL}
class BstInsert {
    static int bstInsert(int[] keys) {
        int n = keys.length;
        int[] value = new int[n], left = new int[n], right = new int[n], depth = new int[n];  // @anchor start
        // Java zero-fills every array, so "no child" has to be written out.
        java.util.Arrays.fill(left, -1);
        java.util.Arrays.fill(right, -1);
        int size = 0, root = -1;
        for (int k = 0; k < n; k++) {
            int key = keys[k];
            if (root == -1) {                                   // @anchor root
                value[0] = key; depth[0] = 0; size = 1; root = 0;
                continue;
            }
            int cur = root;
            for (;;) {
                if (key == value[cur]) break;                   // @anchor duplicate
                if (key < value[cur]) {                    // @anchor compare
                    if (left[cur] == -1) {                      // @anchor attach-left
                        left[cur] = size; value[size] = key;
                        depth[size] = depth[cur] + 1; size++;
                        break;
                    }
                    cur = left[cur];                     // @anchor compare
                } else {
                    if (right[cur] == -1) {                     // @anchor attach-right
                        right[cur] = size; value[size] = key;
                        depth[size] = depth[cur] + 1; size++;
                        break;
                    }
                    cur = right[cur];                    // @anchor compare
                }
            }
        }
        // Height in levels: one node is 1, an empty tree is 0.
        int h = 0;                                              // @anchor height
        for (int i = 0; i < size; i++) h = Math.max(h, depth[i] + 1);
        return h;                                               // @anchor done
    }
}`;

const CPP = `${PARALLEL}
#include <vector>
using std::vector;

int bst_insert(vector<int> keys) {
    vector<int> value, left, right, depth;                     // @anchor start
    int root = -1;
    for (int key : keys) {
        if (root == -1) {                                      // @anchor root
            value.push_back(key); left.push_back(-1);
            right.push_back(-1); depth.push_back(0);
            root = 0;
            continue;
        }
        int cur = root;
        for (;;) {
            if (key == value[cur]) break;                      // @anchor duplicate
            if (key < value[cur]) {                       // @anchor compare
                if (left[cur] == -1) {                         // @anchor attach-left
                    left[cur] = (int)value.size();
                    value.push_back(key); left.push_back(-1); right.push_back(-1);
                    depth.push_back(depth[cur] + 1);
                    break;
                }
                cur = left[cur];                        // @anchor compare
            } else {
                if (right[cur] == -1) {                        // @anchor attach-right
                    right[cur] = (int)value.size();
                    value.push_back(key); left.push_back(-1); right.push_back(-1);
                    depth.push_back(depth[cur] + 1);
                    break;
                }
                cur = right[cur];                       // @anchor compare
            }
        }
    }
    // Height in levels: one node is 1, an empty tree is 0.
    int h = 0;                                                  // @anchor height
    for (int d : depth) if (d + 1 > h) h = d + 1;
    return h;                                                   // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'Four parallel arrays, one slot per node, and `-1` meaning "no child". This is a deliberate choice over `{value, left, right}` objects: with objects, "no child" is `undefined` here, `None` in Python, `null` in Java and `nullptr` in C++, and a parent pointer would make the graph cyclic — unprintable without a visited set. With indices the whole structure is four plain arrays that serialise, diff and compare.',
    python:
      'Four parallel lists, one entry per node, and `-1` meaning "no child". Python would let you write a `Node` class with `self.left = None` in about the same number of lines, and that version would be more idiomatic — but then the four listings would no longer be the same algorithm, and a cyclic parent pointer would need a `__repr__` to avoid infinite recursion.',
    java: 'Four preallocated `int[]`s plus a `size` counter, because a Java array cannot grow. Note the two `Arrays.fill` lines: a fresh int[] is zero-filled, and `0` is a *valid child index*, so without them `left[cur] == 0` would send every second insert back to the first node. This is the bug that makes a Java BST look like it works on small examples.',
    cpp: 'Four `vector<int>`s that grow as needed, so no `size` counter is needed here — the only structural difference from the Java version, and it is why the C++ listing reads more cleanly. The `-1` sentinel is the same in all four languages, which is the entire reason for the parallel-array representation.',
  },
  root: {
    javascript:
      'The first key becomes the root by special case, because an empty tree has no node to compare against. That is the whole special case — one `if` at the top of the loop, and it means the first key inserted gets to decide the shape of everything that follows.',
    python:
      'The first key becomes the root by special case, because there is nothing to compare it against. Written as a `while True` with `break`s rather than recursion: the walk is iterative in all four listings, which keeps the stack out of it entirely and makes the depth count a plain integer.',
    java: 'The first key becomes the root by special case. `value[0] = key; depth[0] = 0; size = 1;` is four statements where the other languages have one `append` chain — the price of preallocating, and the reason a Java BST implementation is noticeably longer than the same algorithm in Python.',
    cpp: 'The first key becomes the root by special case, and `left.push_back(-1)` is what records that the new node has no children. Four `push_back` calls per insert, each of which may reallocate: with a handful of nodes nobody cares, and with a million that is four allocations per node unless you `reserve` — the usual reason a hot BST in C++ is built into a preallocated arena.',
  },
  compare: {
    javascript:
      'The one comparison that decides everything: is the key smaller than this node? There is no third answer, which is why a plain BST cannot store duplicates — `===` is handled before this line precisely because there is no branch for it. Each level costs one comparison, so the cost of the whole insert is the number of nodes on the path, and the *path* is the recursion made linear.',
    python:
      'The one comparison that decides everything: is the key smaller than this node? There is no third answer, which is exactly why a plain BST cannot store duplicates. The walk is a `while True` with two `break`s rather than a recursive call, so the depth of the tree costs heap, not stack — the same reason a threaded BST exists in C and Java.',
    java: 'The one comparison that decides everything. Note that `key < value[cur]` on ints is a primitive comparison, whereas the same BST holding Strings would need `compareTo` and could not use `<` at all — a BST over strings needs a comparator, and forgetting that is a compile error rather than a subtle bug, which is a kindness.',
    cpp: 'The one comparison that decides everything, and the reason the tree shape is decided entirely by the *order* the keys arrive in. The same six keys inserted in a different order produce a different tree with the same set of values — the BST invariant is maintained, but the height is not, and no amount of care in this loop will change that.',
  },
  duplicate: {
    javascript:
      'Equal keys have nowhere to go. A strict `<` walk only offers "smaller" (left) and "larger" (right), so an equal key is dropped on the floor and the first copy wins. This is a real limitation, not a stylistic one: a BST that silently discards duplicates cannot be a set of multisets, and fixing it means a per-node count or a documented tie-break rule.',
    python:
      'Equal keys have nowhere to go, and the `break` abandons the insert *without removing the node slot* — nothing was appended, so the arrays stay consistent. Note that `==` on ints and `==` on strings behave the same here, but in Python a `set` would have deduplicated on the way in for free, and that is a genuinely different data structure with different guarantees.',
    java: 'Equal keys are rejected. There is no `else` branch here because the whole insert is inside a `for (;;)`, so `break` leaves both the inner and the outer loop at once — a small readability win of the labelled-loop style that the other three languages have to fake with a flag or a helper method.',
    cpp: 'Equal keys are rejected, and `break` leaves the infinite `for` loop — which C++ spells `for (;;)` with no condition at all, which reads as an infinite loop until you notice the `break`s. `break` alone would also leave only the inner loop, so an `if` with a single statement here is load-bearing in a way it is not in the other three.',
  },
  'attach-left': {
    javascript:
      "The left slot is empty, so the new key goes there and the walk stops. The index `value.length` is the new node's identity *before* the push, which is the one ordering that has to be right — and it is the same ordering in all four languages, which is what makes the parallel-array version translatable at all.",
    python:
      'The left slot is empty, so the key goes there. `left[cur] = len(value)` writes the *future* index, and the value is appended on the next line — reverse the two and the parent points at a node that does not exist yet, which in Python is a `IndexError` on the next read and in C++ is a read of uninitialised memory.',
    java: 'The left slot is empty, so the key goes there. `left[cur] = size; value[size] = key; depth[size] = depth[cur] + 1; size++;` — the counter is incremented last, on purpose, because `size` is simultaneously "how many nodes exist" and "the index of the node being created". Recording the depth here is what makes the height a one-line calculation at the end instead of a traversal.',
    cpp: 'The left slot is empty, so the key goes there. The `(int)` cast on `value.size()` is the recurring tax of this file: `size()` is `size_t`, and mixing it with the `int` indices used everywhere else is a signed/unsigned mismatch that compiles cleanly and then misbehaves on the first negative number.',
  },
  'attach-right': {
    javascript:
      'The mirror of the left case, and it fires just as often on unsorted data. Symmetry is the reason this algorithm is so short: two branches, each three lines, each doing exactly one thing to the structure — add a node, write one pointer.',
    python:
      'The mirror of the left case. Both branches append to all four lists, which is the price of a parallel-array representation: adding a node is four writes in the same order, and forgetting one of them is a bug that shows up much later as a nonsense traversal.',
    java: 'The mirror of the left case, in the same four-statement shape. Both branches write `depth`, and that is what makes the final height computation a single loop — no traversal, no recursion, no stack: the tree has already paid for its own summary on the way in.',
    cpp: 'The mirror of the left case. Four `push_back` calls, in the same order as every other language, and the parent link is implicit in the index stored in `left[cur]` — no back-pointer array is needed at all, because the direction of the write tells you which side the child is on.',
  },
  height: {
    javascript:
      'The height, in *levels*: a single node is 1 and an empty tree is 0, which is one more than the maximum recorded depth. Measuring in levels rather than edges removes the off-by-one argument, and it makes "height equals node count" a meaningful phrase — the exact signature of a degenerate tree.',
    python:
      'The height in levels, as a maximum over the depths recorded at insert time. The alternative is a traversal, and there are two reasons not to take it: the depths are already in hand, and a height-by-traversal needs the same recursive call that the insert deliberately avoided.',
    java: 'The height in levels, as a loop over the recorded depths. `for (int i = 0; i < size; i++)` rather than over the array, because the array is preallocated to `keys.length` and the unused tail is full of zeros — iterating the array itself would fold those zeros in, which happens to be harmless here and would not be for a maximum of a *negative* value.',
    cpp: 'The height in levels, from the depths recorded at insert time. No traversal, no recursion, no stack — the whole height question is answered by data the insert had to compute anyway, which is the cheapest possible place to get it.',
  },
  done: {
    javascript:
      'The height, and the reason the function returns it: a BST has no search *result* to return, but its shape is the thing worth checking. Height 6 from 6 keys is a list. Height 3 from 6 keys is a tree. The insertion code is identical in both cases — which is the entire argument for a self-balancing tree.',
    python:
      "The height. A plain BST gives you sorted iteration in O(n) and search in O(height), and nothing about the insertion enforces anything — so if the caller cares about height at all, it is the caller's job to rebalance, which is why every production BST (AVL, red-black, treap) pairs this exact insert with a fix-up pass.",
    java: 'The height. Worth saying out loud for a Java reader: the input `int[]` is read and never written, so the caller keeps its array and gets an `int` back. A Java BST that wanted to return the tree would have to return the five arrays, or a `Node` class, and the caller would have to decide who owns it.',
    cpp: "The height. The input vector is taken by value (that is how the harness builds it) and is never modified, so the answer is a single int and the caller's data is untouched. A C++ BST would normally own its nodes and expose an iterator; the parallel-array version here exists to be translatable, not to be the fastest tree in the room.",
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'bstInsert',
    python: 'bst_insert',
    java: 'BstInsert.bstInsert',
    cpp: 'bst_insert',
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

interface RefNode {
  v: number;
  l: RefNode | null;
  r: RefNode | null;
  d: number;
}

/**
 * The same algorithm over a *linked* node structure rather than parallel arrays
 * — a genuinely different representation, which is what makes agreement between
 * the two a check on the algorithm rather than on the spelling. The height is
 * also measured differently: a real post-order traversal rather than a maximum
 * over depths recorded on the way in.
 */
const linkedInsert = (root: RefNode | null, key: number): RefNode | null => {
  if (root === null) return { v: key, l: null, r: null, d: 0 };
  if (key === root.v) return root;
  if (key < root.v) root.l = linkedInsert(root.l, key);
  else root.r = linkedInsert(root.r, key);
  return root;
};

const levelsOf = (node: RefNode | null): number => {
  if (node === null) return 0;
  node.d = 1 + Math.max(levelsOf(node.l), levelsOf(node.r));
  return node.d;
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const keys = keysOf(p);
  let root: RefNode | null = null;
  for (const k of keys) root = linkedInsert(root, k);
  return { presetId: p.id, args: [keys], result: levelsOf(root) };
});

export const bstInsertAlgo: AlgoDef<TreeFrame> = {
  id: 'bst-insert',
  title: 'BST Insert',
  category: 'trees',
  summary:
    'Walk down from the root comparing keys, and hang the new key in the first empty child slot you find.',
  intuition:
    'You would reach for a plain BST when you need ordered traversal for free and the data arrives in a roughly random order — an in-memory symbol table, a small index, a teaching example. You would *not* reach for it on sorted or nearly sorted input, or on adversarial input, because the insert is O(height) and the height is chosen by whoever inserted first. If you do not control the arrival order, you want a self-balancing tree and the honest answer is that the plain BST is only for learning and for the cases where you have proved the order is fine.',
  complexity: {
    best: 'O(log n)',
    average: 'O(log n)',
    worst: 'O(n)',
    space: 'O(n)',
    note: 'One insert is O(height): log n for a balanced tree, n for a degenerate one. The whole build is the sum of those, so sorted input is n(n-1)/2 comparisons. Nothing in the insertion code knows the difference — the worst case is entirely a property of arrival order.',
  },
  traits: {
    stable: true,
    inPlace: false,
    online: true,
    allowsDuplicates: false,
    tags: ['ordered', 'O(log n) average', 'O(n) worst case', 'degenerate on sorted input'],
  },
  viewport: 'tree',
  level: 'intro',
  params: [
    {
      key: 'count',
      label: 'Keys to insert',
      kind: 'number',
      min: 0,
      max: 12,
      step: 1,
      default: 6,
      help: 'Reads that many keys out of the input list. 0 shows the empty tree, which is a case worth being able to see.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: bstInsert,
  lesson,
  expectations,
  formatResult: (r) => `height ${r as number}`,
  anchors: [
    'start',
    'root',
    'compare',
    'duplicate',
    'attach-left',
    'attach-right',
    'height',
    'done',
  ],
};

export default bstInsertAlgo;
