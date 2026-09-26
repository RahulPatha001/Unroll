import { byLanguage } from '../../code/anchors.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isKeys } from '../../input/types.ts';
import type { NodeId, TreeFrame, TreeNode } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * BST Delete — three cases, and each one is a different kind of surgery.
 *
 *  - **leaf**: clear one parent pointer. Trivial, and the only case where nothing
 *    has to move.
 *  - **one child**: lift the child into the deleted node's slot. The child moves
 *    up a level, and every key in its subtree is still correctly ordered — the
 *    invariant survives because that child is the only key that could have been
 *    on either side of the parent.
 *  - **two children**: the interesting one. Nothing can simply be lifted into the
 *    hole — either subtree would land on the wrong side of the parent — so the
 *    *in-order successor* (the smallest key in the right subtree) is copied into
 *    the hole and the successor is then deleted, which by construction has no
 *    left child. Two steps that look like a special case are one case plus a
 *    simpler one.
 *
 * The copy-and-delete trick has a visible consequence worth naming: after the
 * delete, the node that *held* the target is still there, holding a different
 * key. An identity-based structure would have to move nodes; an index-based one
 * just rewrites an int — and any iterator or index a caller was holding now
 * refers to a different key, which is why real containers invalidate them here.
 *
 * Representation, as in the rest of this family: parallel arrays indexed by
 * insertion order, `-1` for "no child", `side` as -1/0/1 for left/root/right. A
 * parent array is kept *specifically* so the splice can be O(1) — without it
 * every case would open with a search for the parent.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const KEYS = [50, 30, 70, 20, 60, 80];

const PRESETS: Preset[] = [
  {
    id: 'leaf',
    label: 'Delete a leaf (20)',
    blurb:
      'The easy case: 20 has no children, so one parent pointer becomes "no child" and nothing moves. The tree keeps its shape and its height.',
    input: { type: 'keys', values: KEYS },
    params: { count: 6, remove: 20 },
  },
  {
    id: 'one-child',
    label: 'Delete a node with one child (30)',
    blurb:
      "30 has only a left child, so 20 is lifted into 30's slot and takes its place. The child moves up a level and the height does not change — which is why this case needs no rotation.",
    input: { type: 'keys', values: KEYS },
    params: { count: 6, remove: 30 },
  },
  {
    id: 'two-children',
    label: 'Delete the root (50)',
    blurb:
      '50 has two children, so the smallest key in its right subtree — 60 — is copied into the hole and 60 is then deleted from its own slot. The node that held 50 is still there, holding 60.',
    input: { type: 'keys', values: KEYS },
    params: { count: 6, remove: 50 },
  },
  {
    id: 'missing',
    label: 'Delete a key that is not there (55)',
    blurb:
      'The search falls off the end of the tree, so there is nothing to delete and nothing changes. A delete that silently succeeds on a missing key is a bug you find out about much later, when the data is wrong and nothing points back here.',
    input: { type: 'keys', values: KEYS },
    params: { count: 6, remove: 55 },
  },
  {
    id: 'degenerate',
    label: 'Delete from a list (60 out of 16…76)',
    blurb:
      'Six ascending keys make a right spine, so the search for the target is a linear walk and the splice is a single pointer. Deletion does not repair a tree that insertion already ruined.',
    input: { type: 'keys', values: [16, 20, 49, 60, 68, 76] },
    params: { count: 6, remove: 60 },
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
  /** -1 left, 0 root, 1 right. */
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
        slots.push({
          value: key,
          left: -1,
          right: -1,
          parent: cur,
          side: goLeft ? -1 : 1,
        });
        break;
      }
      cur = goLeft ? here.left : here.right;
    }
  }
  return { slots, root };
}

export function* bstDelete(ctx: RunContext): Generator<TreeFrame> {
  const raw = isKeys(ctx.input) ? ctx.input.values.map((v) => Number(v)) : [];
  const wanted = Math.max(0, Math.min(12, Math.trunc(Number(ctx.params.count ?? 6))));
  const keys = raw.slice(0, wanted);
  const target = Math.trunc(Number(ctx.params.remove ?? 0));

  const { slots, root } = build(keys);
  let liveRoot = root;
  const path: NodeId[] = [];
  let ops = 0;

  /**
   * Depths from the *current* structure, in one forward pass over the slots.
   * A parent is always created before its children, so a parent's index is
   * always smaller — and re-parenting only moves nodes further up. A slot whose
   * depth is still -1 is therefore unreachable, which is exactly what a deleted
   * node is: no tombstone, no compaction.
   */
  const depths = (): number[] => {
    const d = new Array<number>(slots.length).fill(-1);
    if (liveRoot === -1) return d;
    d[liveRoot] = 0;
    for (let i = 0; i < slots.length; i++) {
      const here = d[i] as number;
      if (here < 0) continue;
      const slot = slots[i] as Slot;
      if (slot.left !== -1) d[slot.left] = here + 1;
      if (slot.right !== -1) d[slot.right] = here + 1;
    }
    return d;
  };

  const levels = (): number => {
    let h = 0;
    for (const x of depths()) if (x >= 0) h = Math.max(h, x + 1);
    return h;
  };

  const snapshot = (): Record<NodeId, TreeNode> => {
    const d = depths();
    const out: Record<NodeId, TreeNode> = {};
    for (let i = 0; i < slots.length; i++) {
      if ((d[i] as number) < 0) continue; // deleted, or never reachable
      const slot = slots[i] as Slot;
      out[id(i)] = {
        id: id(i),
        value: slot.value,
        parent: slot.parent === -1 ? null : id(slot.parent),
        side: slot.side < 0 ? 'left' : slot.side > 0 ? 'right' : 'root',
        depth: d[i] as number,
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
    root: liveRoot === -1 ? null : id(liveRoot),
    path: [...path],
    highlight,
    ops,
    vars,
  });

  const before = levels();

  yield frame(
    'start',
    liveRoot === -1
      ? 'The tree is empty, so there is nothing to search and nothing to delete. Height 0, and the miss costs zero comparisons.'
      : `A tree of ${keys.length} key${keys.length === 1 ? '' : 's'}, height ${before}, and a request to delete ${target}. Deletion is a search plus one case analysis: find the node, then fix the parent — and the case analysis is where all of the difficulty lives.`,
    {},
    { target, nodes: slots.length, height: before, ops },
  );

  // ---- find -------------------------------------------------------
  let cur = liveRoot;
  path.length = 0;
  while (cur !== -1) {
    if (ctx.shouldStop()) return;
    ops++;
    const here = slots[cur] as Slot;
    path.push(id(cur));
    if (target === here.value) break;
    const here2 = here;
    cur = target < here2.value ? here2.left : here2.right;
    yield frame(
      'find',
      `${target} is ${target < here2.value ? 'smaller' : 'larger'} than ${here2.value}, so look ${target < here2.value ? 'left' : 'right'} — ${path.length} node${path.length === 1 ? '' : 's'} down. Nothing has been modified yet, and that is worth noticing: a delete that fails costs exactly what a search costs, because the search *is* the delete until it succeeds.`,
      { compare: [path[path.length - 1] as NodeId], path: [...path] },
      { target, at: here2.value, depth: path.length, ops },
    );
  }

  if (cur === -1) {
    path.length = 0;
    yield frame(
      'case-missing',
      `The walk reached an empty child slot, so ${target} was never in the tree. Nothing was written, and the return value alone cannot tell the caller whether that was a success — which is a design bug in a real API, and the reason every production tree container either returns a boolean or throws.`,
      {},
      { target, deleted: false, ops },
    );
  } else {
    const z = cur;
    const left = (slots[z] as Slot).left;
    const right = (slots[z] as Slot).right;
    const zValue = (slots[z] as Slot).value;

    if (left === -1 && right === -1) {
      const slot = slots[z] as Slot;
      const parentIdx = slot.parent;
      if (parentIdx === -1) liveRoot = -1;
      else if (slot.side < 0) (slots[parentIdx] as Slot).left = -1;
      else (slots[parentIdx] as Slot).right = -1;
      path.length = 0;
      yield frame(
        'case-leaf',
        `${zValue} has no children, so the only thing to do is clear the pointer that reaches it${parentIdx === -1 ? ' — and since it was the root, the tree is now empty' : ` — the ${slot.side < 0 ? 'left' : 'right'} child of ${(slots[parentIdx] as Slot).value} becomes "no child"`}. No node moves and no key is rewritten, so the height provably cannot change.`,
        {
          answer: parentIdx === -1 ? [] : [id(parentIdx)],
          path: parentIdx === -1 ? [] : [id(parentIdx)],
        },
        { target, deleted: true, children: 0, ops },
      );
    } else if (left === -1 || right === -1) {
      const slot = slots[z] as Slot;
      const child = left === -1 ? right : left;
      const parentIdx = slot.parent;
      if (parentIdx === -1) liveRoot = child;
      else if (slot.side < 0) (slots[parentIdx] as Slot).left = child;
      else (slots[parentIdx] as Slot).right = child;
      (slots[child] as Slot).parent = parentIdx;
      path.length = 0;
      yield frame(
        'case-one-child',
        `${zValue} has exactly one child, ${(slots[child] as Slot).value}, and that child takes its place${parentIdx === -1 ? ' — it becomes the root' : ''}. The child moves up one level and nothing else moves. This is safe because it was the *only* key that could have been on either side of the parent, so no ordering is broken and no rotation is needed.`,
        { answer: [id(child)], compare: parentIdx === -1 ? [] : [id(parentIdx)] },
        { target, deleted: true, child: (slots[child] as Slot).value, ops },
      );
    } else {
      // Two children: the in-order successor is the leftmost node on the right.
      let s = right;
      const spine: NodeId[] = [id(z)];
      while ((slots[s] as Slot).left !== -1) {
        s = (slots[s] as Slot).left;
        spine.push(id(s));
      }
      const succValue = (slots[s] as Slot).value;
      yield frame(
        'case-two-children',
        `${zValue} has two children, and there is no way to just remove it: whichever subtree was lifted into its slot would end up on the wrong side of the parent. So find the in-order successor instead — the smallest key in the right subtree, reached by following left pointers until there are none. That is ${succValue}, and by construction it has no left child.`,
        { answer: [id(z)], compare: [id(s)], path: spine },
        { target, successor: succValue, ops },
      );

      (slots[z] as Slot).value = succValue;
      yield frame(
        'swap-value',
        `Copy ${succValue} into the hole. The *value* moves, not the node: the node that used to hold ${zValue} is still in the same place, with the same parent and the same children. The ordering still holds because the successor is greater than everything in the left subtree and smaller than the rest of the right one.`,
        { answer: [id(z)], compare: [id(s)] },
        { target, deleted: true, nowHolds: succValue, ops },
      );

      const sSlot = slots[s] as Slot;
      const sParent = sSlot.parent;
      const sChild = sSlot.right;
      if (sChild !== -1) (slots[sChild] as Slot).parent = sParent;
      if (sParent === z) (slots[z] as Slot).right = sChild;
      else (slots[sParent] as Slot).left = sChild;
      yield frame(
        'unlink-successor',
        `Now remove the successor itself, which is the easy case wearing the hard one's clothes: it has no left child, so its right subtree (${sChild === -1 ? 'nothing at all' : `${(slots[sChild] as Slot).value}`}) takes its place${sParent === z ? ' at the top of the right subtree' : ` under ${(slots[sParent] as Slot).value}`}. That is why the case analysis above has two branches and not three.`,
        { answer: [id(z)], compare: sParent === -1 ? [] : [id(sParent)] },
        { target, deleted: true, nodes: slots.length - 1, ops },
      );
    }
  }

  path.length = 0;
  const after = levels();
  const remaining = Object.keys(snapshot()).length;
  yield frame(
    'done',
    `Height ${after}, down from ${before}, with ${remaining} node${remaining === 1 ? '' : 's'} left. Every case is O(height) — one search, then a constant number of pointer writes. And note what deletion does *not* repair: a tree that insertion already made degenerate stays degenerate, which is the argument for balancing at insert time rather than cleaning up afterwards.`,
    { answer: liveRoot === -1 ? [] : [id(liveRoot)] },
    { target, height: after, was: before, nodes: remaining, ops },
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

const PARALLEL = `// Parallel arrays indexed by insertion order, with a parent array kept
// specifically so deletion can unhook a node in O(1). "No child" is -1 and
// side is -1/0/1 for left/root/right in all four of these languages: with Node
// objects it would be undefined, None, null and nullptr, and the four listings
// would no longer be the same data structure.`;

const JS = `${PARALLEL}
function bstDelete(keys, target) {
  const value = [], left = [], right = [], parent = [], side = [];  // @anchor start
  let root = -1;
  for (const key of keys) {
    if (root === -1) {
      value.push(key); left.push(-1); right.push(-1);
      parent.push(-1); side.push(0);
      root = 0;
      continue;
    }
    let cur = root;
    for (;;) {
      const goLeft = key < value[cur];
      const free = goLeft ? left[cur] : right[cur];
      if (free !== -1) { cur = free; continue; }
      if (goLeft) left[cur] = value.length;
      else right[cur] = value.length;
      value.push(key); left.push(-1); right.push(-1);
      parent.push(cur); side.push(goLeft ? -1 : 1);
      break;
    }
  }

  // Splice \`node\` out of the tree, putting \`replacement\` in its place. One
  // helper serves all three cases: the only difference between them is which
  // index gets passed as the replacement.
  function unlink(node, replacement) {
    const p = parent[node];
    if (p === -1) root = replacement;
    else if (side[node] < 0) left[p] = replacement;
    else right[p] = replacement;
    if (replacement !== -1) parent[replacement] = p;
  }

  // One forward pass over the slots. A parent is always created before its
  // children, so a parent's index is always smaller, and re-parenting only
  // moves nodes up the tree - so a slot still at -1 is unreachable, which is
  // exactly what a deleted node is. No tombstone, no compaction.
  function height() {
    if (root === -1) return 0;
    const d = new Array(value.length).fill(-1);
    d[root] = 0;
    let h = 0;
    for (let i = 0; i < value.length; i++) {
      if (d[i] < 0) continue;
      h = Math.max(h, d[i] + 1);
      if (left[i] !== -1) d[left[i]] = d[i] + 1;
      if (right[i] !== -1) d[right[i]] = d[i] + 1;
    }
    return h;
  }

  let cur = root;                                             // @anchor find
  while (cur !== -1 && value[cur] !== target) {
    cur = target < value[cur] ? left[cur] : right[cur];
  }
  if (cur === -1) return height();                            // @anchor case-missing

  if (left[cur] === -1 && right[cur] === -1) {                // @anchor case-leaf
    unlink(cur, -1);
  } else if (left[cur] === -1 || right[cur] === -1) {          // @anchor case-one-child
    unlink(cur, left[cur] === -1 ? right[cur] : left[cur]);
  } else {
    let s = right[cur];                                       // @anchor case-two-children
    while (left[s] !== -1) s = left[s];
    value[cur] = value[s];                                    // @anchor swap-value
    unlink(s, right[s]);                                      // @anchor unlink-successor
  }
  return height();                                            // @anchor done
}`;

const PY = `${PARALLEL.replace(/\/\//g, '#')}
def bst_delete(keys, target):
    value, left, right, parent, side = [], [], [], [], []     # @anchor start
    root = -1
    for key in keys:
        if root == -1:
            value.append(key); left.append(-1); right.append(-1)
            parent.append(-1); side.append(0)
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
            parent.append(cur); side.append(-1 if go_left else 1)
            break

    # Splice \`node\` out of the tree, putting \`replacement\` in its place. One
    # helper serves all three cases: the only difference between them is which
    # index is passed as the replacement. \`nonlocal root\` is what lets the
    # closure hand a new root back to the caller.
    def unlink(node, replacement):
        nonlocal root
        p = parent[node]
        if p == -1:
            root = replacement
        elif side[node] < 0:
            left[p] = replacement
        else:
            right[p] = replacement
        if replacement != -1:
            parent[replacement] = p

    # One forward pass over the slots. A parent is always created before its
    # children, so a parent's index is always smaller, and re-parenting only
    # moves nodes up the tree - so a slot still at -1 is unreachable, which is
    # exactly what a deleted node is. No tombstone, no compaction.
    def height():
        if root == -1:
            return 0
        d = [-1] * len(value)
        d[root] = 0
        h = 0
        for i in range(len(value)):
            if d[i] < 0:
                continue
            h = max(h, d[i] + 1)
            if left[i] != -1:
                d[left[i]] = d[i] + 1
            if right[i] != -1:
                d[right[i]] = d[i] + 1
        return h

    cur = root                                                  # @anchor find
    while cur != -1 and value[cur] != target:
        cur = left[cur] if target < value[cur] else right[cur]
    if cur == -1:                                              # @anchor case-missing
        return height()

    if left[cur] == -1 and right[cur] == -1:                     # @anchor case-leaf
        unlink(cur, -1)
    elif left[cur] == -1 or right[cur] == -1:                    # @anchor case-one-child
        unlink(cur, right[cur] if left[cur] == -1 else left[cur])
    else:
        s = right[cur]                                           # @anchor case-two-children
        while left[s] != -1:
            s = left[s]
        value[cur] = value[s]                                    # @anchor swap-value
        unlink(s, right[s])                                      # @anchor unlink-successor
    return height()                                              # @anchor done`;

const JAVA = `${PARALLEL}
class BstDelete {
    // One forward pass over the slots. A parent is always created before its
    // children, so a parent's index is always smaller, and re-parenting only
    // moves nodes up the tree - so a slot still at -1 is unreachable, i.e. a
    // deleted node. Static, because a static method cannot close over locals.
    static int height(int[] left, int[] right, int root, int size) {
        if (root == -1) return 0;
        int[] d = new int[size];
        java.util.Arrays.fill(d, -1);
        d[root] = 0;
        int h = 0;
        for (int i = 0; i < size; i++) {
            if (d[i] < 0) continue;
            h = Math.max(h, d[i] + 1);
            if (left[i] != -1) d[left[i]] = d[i] + 1;
            if (right[i] != -1) d[right[i]] = d[i] + 1;
        }
        return h;
    }

    static int bstDelete(int[] keys, int target) {
        int n = keys.length;
        int[] value = new int[n], left = new int[n], right = new int[n];
        int[] parent = new int[n], side = new int[n];          // @anchor start
        java.util.Arrays.fill(left, -1);
        java.util.Arrays.fill(right, -1);
        java.util.Arrays.fill(parent, -1);
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
                value[size] = key; parent[size] = cur;
                side[size] = goLeft ? -1 : 1;
                size++;
                break;
            }
        }
        // A static method cannot close over \`root\` and a helper needs to be
        // able to replace it, so the root lives in a one-element array. The
        // three splices below are therefore inlined rather than shared.
        int[] rootBox = { root };

        int cur = rootBox[0];                                   // @anchor find
        while (cur != -1 && value[cur] != target) {
            cur = target < value[cur] ? left[cur] : right[cur];
        }
        if (cur == -1) {                                        // @anchor case-missing
            return height(left, right, rootBox[0], size);
        }

        if (left[cur] == -1 && right[cur] == -1) {              // @anchor case-leaf
            int p = parent[cur];
            if (p == -1) rootBox[0] = -1;
            else if (side[cur] < 0) left[p] = -1;
            else right[p] = -1;
        } else if (left[cur] == -1 || right[cur] == -1) {        // @anchor case-one-child
            int child = left[cur] == -1 ? right[cur] : left[cur];
            int p = parent[cur];
            if (p == -1) rootBox[0] = child;
            else if (side[cur] < 0) left[p] = child;
            else right[p] = child;
            parent[child] = p;
        } else {
            int s = right[cur];                                 // @anchor case-two-children
            while (left[s] != -1) s = left[s];
            value[cur] = value[s];                              // @anchor swap-value
            int c = right[s], p = parent[s];                    // @anchor unlink-successor
            if (c != -1) parent[c] = p;
            if (p == cur) right[cur] = c;
            else left[p] = c;
        }
        return height(left, right, rootBox[0], size);           // @anchor done
    }
}`;

const CPP = `${PARALLEL}
#include <algorithm>
#include <vector>
using std::vector;

int bst_delete(vector<int> keys, int target) {
    vector<int> value, left, right, parent, side;               // @anchor start
    int root = -1;
    for (int key : keys) {
        if (root == -1) {
            value.push_back(key); left.push_back(-1); right.push_back(-1);
            parent.push_back(-1); side.push_back(0);
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
            parent.push_back(cur); side.push_back(goLeft ? -1 : 1);
            break;
        }
    }

    // Splice a node out, putting \`replacement\` in its place. The lambda captures
    // the vectors *and* root by reference, which is what lets the helper replace
    // the root - the one thing the Java version has to fake with an int[1].
    auto unlink = [&](int node, int replacement) {
        int p = parent[node];
        if (p == -1) root = replacement;
        else if (side[node] < 0) left[p] = replacement;
        else right[p] = replacement;
        if (replacement != -1) parent[replacement] = p;
    };

    // One forward pass over the slots. A parent is always created before its
    // children, so a parent's index is always smaller, and re-parenting only
    // moves nodes up the tree - so a slot still at -1 is unreachable, which is
    // exactly what a deleted node is. No tombstone, no compaction.
    auto height = [&]() {
        if (root == -1) return 0;
        vector<int> d(value.size(), -1);
        d[root] = 0;
        int h = 0;
        for (size_t i = 0; i < value.size(); i++) {
            if (d[i] < 0) continue;
            h = std::max(h, d[i] + 1);
            if (left[i] != -1) d[left[i]] = d[i] + 1;
            if (right[i] != -1) d[right[i]] = d[i] + 1;
        }
        return h;
    };

    int cur = root;                                             // @anchor find
    while (cur != -1 && value[cur] != target) {
        cur = target < value[cur] ? left[cur] : right[cur];
    }
    if (cur == -1) return height();                             // @anchor case-missing

    if (left[cur] == -1 && right[cur] == -1) {                 // @anchor case-leaf
        unlink(cur, -1);
    } else if (left[cur] == -1 || right[cur] == -1) {           // @anchor case-one-child
        unlink(cur, left[cur] == -1 ? right[cur] : left[cur]);
    } else {
        int s = right[cur];                                     // @anchor case-two-children
        while (left[s] != -1) s = left[s];
        value[cur] = value[s];                                  // @anchor swap-value
        unlink(s, right[s]);                                    // @anchor unlink-successor
    }
    return height();                                            // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'Five parallel arrays, and `parent` exists for one reason: deletion needs to unhook a node in constant time. Without a back-pointer, every case would open with a second search for the parent and the "O(height)" claim would depend on which node you deleted. `side` is -1/0/1 so `unlink` knows which of the two pointers to write.',
    python:
      'Five parallel lists, with `parent` kept purely so the splice is O(1). A `Node` class with `self.parent` would be the idiomatic Python and would look shorter — but then the four listings would no longer share a representation, and a parent pointer is a reference cycle the collector has to handle separately from ordinary objects.',
    java: 'Five preallocated int[]s and a `size` counter, so the three `Arrays.fill` calls are not optional: a fresh array is zero-filled, and `0` is a valid child index, a valid parent index, and a valid `side` value. Skip them and the first delete writes to the wrong node — a bug a two-element test would never catch.',
    cpp: 'Five vectors that grow on demand, plus the parent vector the splice needs. No `size` counter and no fill calls, which is the only structural difference from the Java version and the reason this listing is shorter while doing exactly the same thing. The `(int)value.size()` casts are the recurring tax of mixing `size_t` lengths with `int` indices.',
  },
  find: {
    javascript:
      'The search, identical to BST Search. What is new here is that the walk must *find* the node rather than merely test for it, because the fix-up needs the node itself — which is exactly why deletion keeps a parent array and search does not. A failed walk costs the same as a successful one, because the search is the whole of a delete until it succeeds.',
    python:
      'The search. Note the condition tests `cur != -1` first, so an empty tree costs one condition evaluation and no comparisons at all. That ordering is load-bearing: written the other way round, `value[cur]` would be read with cur = -1 and Python would raise IndexError instead of reporting "not found".',
    java: 'The search, with `cur != -1 && value[cur] != target` short-circuiting in that order for the same reason. Java would throw ArrayIndexOutOfBoundsException on the wrong ordering, so the mistake is loud here and silent in the other three — a small argument for checking the sentinel before the data.',
    cpp: 'The search, and note that reading `value[cur]` after a failed `cur != -1` test would be an out-of-bounds vector read: undefined behaviour, not an exception. Short-circuiting is not optional in an index-based representation, which is the one real hazard in this whole file.',
  },
  'case-missing': {
    javascript:
      'Nothing to delete. The function returns the unchanged height, so the caller cannot tell "deleted successfully" from "was not there" by looking at the return value — a design bug in a real API, and the reason production tree containers return a boolean or throw instead.',
    python:
      "Nothing to delete, and the miss is indistinguishable from a success by return value alone. Python's natural answer is to raise KeyError, and a tree implemented over a dict inherits that for free; this function has to choose, and choosing a silent no-op is the least good of the available options.",
    java: 'Nothing to delete. `Map.remove` returns the removed value or null, which *does* distinguish the two cases, because the JDK can return "no value". An int return cannot, so the information is lost — a boolean or an `OptionalInt` would be the honest signature and would cost one word at every call site.',
    cpp: 'Nothing to delete. `std::optional<int>` or a `bool` out-parameter would carry the distinction in the type; returning the height does not, and a caller counting deletions by watching the height will be wrong every time it deletes a key that was not there.',
  },
  'case-leaf': {
    javascript:
      'The easy case: one pointer becomes "no child" and nothing else is touched. No node moves and no key is rewritten, so the height provably cannot change — a leaf contributes at most one level, and that level is still there because its parent is.',
    python:
      'The easy case, and the only one of the three that is obviously correct by inspection. The `unlink` helper exists so all three cases share the surgery, and sharing it is what makes the other two short enough to be obviously correct as well.',
    java: "The easy case, inlined rather than shared: a static method cannot rebind the caller's `root`, so the helper that does that in the other three languages would need a one-element holder array. The three writes inside the branch are exactly what `unlink` does elsewhere — the duplication is a language tax, not a design choice.",
    cpp: 'The easy case, and `unlink(cur, -1)` is a single call because the lambda closes over the vectors and `root` by reference. That is the one thing this language buys over the Java version, and it is what keeps the three cases to three lines each instead of three blocks.',
  },
  'case-one-child': {
    javascript:
      'One child, lifted into the hole, and the child moves up a level. The ordering survives because that child is the only key that could have sat on either side of the parent — nothing else in its subtree is affected, which is why the height is unchanged and no rotation is needed.',
    python:
      "One child, lifted into the hole. The ternary picks the survivor without a branch, and `unlink` rewrites the child's own `parent` as well as the parent's pointer — forgetting the second half is the classic bug, and it produces a tree where the depths disagree with the structure.",
    java: 'One child, lifted into the hole. The nested ternary is the least readable line in the file and an `int child = …` on its own line would be kinder. What matters is `parent[child] = p`: the parent array has to stay authoritative, or the *next* delete will start from a stale parent and splice the wrong node.',
    cpp: "One child, lifted into the hole, with the child's `parent` updated inside `unlink` rather than at the call site. Keeping that write in the helper is what makes the parent array authoritative, which in turn is what lets the next delete start from `parent[node]` without a second search.",
  },
  'case-two-children': {
    javascript:
      'Two children, and this is the only case that is not a one-line fix. Nothing can simply be lifted into the hole — either subtree would land on the wrong side of the parent — so the algorithm copies the in-order successor in and then deletes the successor, which by construction has no left child.',
    python:
      'Two children, and the successor search is just "follow left pointers until there are none": the in-order successor is by definition the smallest key of the right subtree. Walking left is O(height), which is why this case is not more expensive than the other two despite doing twice as much work.',
    java: 'Two children. The successor is the leftmost node of the right subtree, found by the loop on the next line — the same walk as "leftmost node", which is a useful reminder that in-order, pre-order and post-order are three questions about one tree rather than three traversals.',
    cpp: 'Two children. The alternative is to copy the *predecessor* (the largest key in the left subtree) and delete that instead; both are correct, both are O(height), and a real implementation picks one and documents it — switching silently would make the shape of a deleted tree depend on an implementation detail.',
  },
  'swap-value': {
    javascript:
      'The value moves, not the node, and that is the most surprising line in a BST delete: the node that held the target is still in the same place, with the same parent and the same children, holding a different key. It works because an index-based node is a *position* rather than an identity — the key is just a payload in a slot.',
    python:
      'The value moves, not the node, and the reason is the representation: a node is a slot in a list, so it can change its contents and remain the same node. A `Node` object would do the same with `node.value = succ.value`, but a `set` or a `dict` could not express this at all — there is no node to move a value between.',
    java: 'The value moves, not the node, in a single array store. The consequence to be aware of: any index, iterator or node reference a caller was holding now refers to a *different key* than a moment ago. Real containers with iterators have to invalidate them here, and that invalidation is most of why deleting from a tree is a harder API than deleting from an array.',
    cpp: 'The value moves, not the node — the same one-store trick and the same consequence for anyone holding an index. A `vector<int>` slot that referred to the target key now refers to its successor, which is precisely the invalidation problem that makes tree containers harder to use than the algorithm suggests.',
  },
  'unlink-successor': {
    javascript:
      'Removing the successor, which is the easy case wearing the hard one\'s clothes: it has no left child, so `unlink(s, right[s])` handles "successor was a leaf" and "successor had a right child" with the same call. Two branches, not three.',
    python:
      'Removing the successor, and it is always easy *because* of how the successor was chosen: as the leftmost node of a right subtree it cannot have a left child. Passing `right[s]` therefore covers both sub-cases, and a reader who understands why the successor was picked understands why this line is safe.',
    java: 'Removing the successor. The replacement is `right[s]` with no conditional, precisely because `left[s]` is known to be -1 here — that knowledge is what the previous loop bought, and throwing it away by writing a general three-case delete again is the difference between a clean implementation and a duplicated one.',
    cpp: "Removing the successor, with the successor's own right child's parent pointer already updated by the same `unlink` call. Every one of these writes is O(1); the only non-constant work in the whole delete is the two walks, which is what makes deletion as cheap as insertion despite touching more pointers.",
  },
  done: {
    javascript:
      'The height after the splice, from the same one-pass walk the animation draws. The pass works because a parent is always created before its children, so indices increase with depth and a single forward sweep visits every node in dependency order — the representation quietly buys an O(n) height with no recursion and no queue.',
    python:
      'The height after the splice. Unreachable slots are simply skipped, which is why a deleted node needs no tombstone: it is still in the lists, but nothing points at it. That is a real advantage of the index representation and a real cost when you want the memory back — a proper BST frees nodes, this one keeps them.',
    java: 'The height, from a static helper that takes the arrays and the root as arguments. It is called twice in a full delete (once for the "before" picture, once after), which is why it is a method rather than a loop: a recursive `height()` over `Node` objects would read better but would traverse, and a static one over parallel arrays is both faster and honest about the representation.',
    cpp: 'The height, from a lambda that rebuilds the depth array on every call. `std::max` is a template returning a const reference, so the `int` copy happens on assignment — a tiny detail that costs nothing but that a reader has to notice once to stop being surprised by it.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'bstDelete',
    python: 'bst_delete',
    java: 'BstDelete.bstDelete',
    cpp: 'bst_delete',
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
}

/** Build over linked nodes — a different representation, so a real cross-check. */
const buildRef = (keys: number[]): RefNode | null => {
  let root: RefNode | null = null;
  for (const key of keys) {
    if (root === null) {
      root = { v: key, l: null, r: null };
      continue;
    }
    let cur = root;
    for (;;) {
      if (key === cur.v) break;
      if (key < cur.v) {
        if (cur.l === null) {
          cur.l = { v: key, l: null, r: null };
          break;
        }
        cur = cur.l;
      } else {
        if (cur.r === null) {
          cur.r = { v: key, l: null, r: null };
          break;
        }
        cur = cur.r;
      }
    }
  }
  return root;
};

/** Recursive delete over linked nodes, returning the possibly-new subtree root. */
const refDelete = (node: RefNode | null, target: number): RefNode | null => {
  if (node === null) return null;
  if (target < node.v) {
    node.l = refDelete(node.l, target);
    return node;
  }
  if (target > node.v) {
    node.r = refDelete(node.r, target);
    return node;
  }
  if (node.l === null) return node.r;
  if (node.r === null) return node.l;
  let succ = node.r;
  while (succ.l !== null) succ = succ.l;
  node.v = succ.v;
  node.r = refDelete(node.r, succ.v);
  return node;
};

const refLevels = (node: RefNode | null): number =>
  node === null ? 0 : 1 + Math.max(refLevels(node.l), refLevels(node.r));

const expectations: Expectation[] = PRESETS.map((p) => {
  const keys = keysOf(p);
  const target = Number(p.params?.remove ?? 0);
  return {
    presetId: p.id,
    args: [keys, target],
    result: refLevels(refDelete(buildRef(keys), target)),
  };
});

export const bstDeleteAlgo: AlgoDef<TreeFrame> = {
  id: 'bst-delete',
  title: 'BST Delete',
  category: 'trees',
  summary:
    "Find the node, then fix the parent: clear one pointer for a leaf, lift a single child, or copy in the in-order successor and delete it in the successor's place.",
  intuition:
    'Reach for it whenever a key has to leave an ordered structure and you still need order afterwards — a symbol table losing an entry, a priority queue cancelling a job, an index dropping a deleted path. The two-children case dominates every discussion of it because it is the only one that moves a *value* rather than a pointer, and in a real container that invalidates iterators. If your data is small enough to keep sorted in an array, an array delete is O(n) but invalidates nothing anyone is holding.',
  complexity: {
    best: 'O(log n)',
    average: 'O(log n)',
    worst: 'O(n)',
    space: 'O(n)',
    note: 'Two walks and a constant number of pointer writes, both walks O(height). In this index representation nodes are never freed, so repeated insert/delete cycles grow the arrays monotonically — a cost of the representation, not of the algorithm.',
  },
  traits: {
    stable: true,
    inPlace: true,
    online: true,
    allowsDuplicates: false,
    tags: ['ordered', 'pointer surgery', 'successor', 'three cases'],
  },
  viewport: 'tree',
  level: 'advanced',
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
    {
      key: 'remove',
      label: 'Key to delete',
      kind: 'number',
      min: 0,
      max: 200,
      step: 1,
      default: 20,
      help: 'Change it to hit a different case: a leaf, a node with one child, a node with two, or a key that is not there.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: bstDelete,
  lesson,
  expectations,
  formatResult: (r) => `height ${r as number} after the delete`,
  anchors: [
    'start',
    'find',
    'case-missing',
    'case-leaf',
    'case-one-child',
    'case-two-children',
    'swap-value',
    'unlink-successor',
    'done',
  ],
};

export default bstDeleteAlgo;
