import { byLanguage } from '../../code/anchors.ts';
import { distinctArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isKeys } from '../../input/types.ts';
import type { CellValue, NodeId, TreeFrame, TreeNode } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * AVL Insert with rotations — the module that justifies a tree viewport at all.
 *
 * A plain BST degenerates on sorted input, and "insert in ascending order" is
 * not an adversarial edge case, it is what happens when you load a sorted file.
 * The fix is one extra integer per node (its subtree height) and one extra step
 * per insert (walk back up the path you came down, fixing heights and rotating
 * once if a node has fallen more than one level out of balance).
 *
 * The four cases are all about *which way the new key leaned*:
 *
 *   LL  — left child is also left-heavy  → one right rotation
 *   LR  — left child is right-heavy       → rotate the child left, then right
 *   RR  — right child is also right-heavy → one left rotation
 *   RL  — right child is left-heavy       → rotate the child right, then left
 *
 * A rotation never changes the set of keys or the in-order sequence — it only
 * changes which node is above which. That is why it is legal, and it is worth
 * watching the sorted order survive every one of them.
 *
 * Representation, as across this family: parallel arrays indexed by insertion
 * order, `-1` for "no child", `side` as -1/0/1. On top of that this module adds
 * a `height` array — 0 for an empty subtree, 1 for a leaf — and every node in the
 * frame carries it as `meta: { height }`, which the viewport draws as `hN`.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 97;
const SORTED = distinctArray(SEED, 6, 1, 99).sort((a, b) => a - b);
const REVERSED = [...SORTED].reverse();

const PRESETS: Preset[] = [
  {
    id: 'single-left',
    label: 'Rotate left once (10, 20, 30)',
    blurb:
      'The simplest imbalance: three ascending keys make a right-right chain, and one left rotation puts 20 at the top. The rotation changes nothing about the order of the keys — only which node is above which.',
    input: { type: 'keys', values: [10, 20, 30] },
    params: { count: 3 },
  },
  {
    id: 'single-right',
    label: 'Rotate right once (30, 20, 10)',
    blurb:
      'The mirror image. The mirror image is worth watching too, because it is the *same* rotation with the roles of left and right swapped, and the code for it is a different five lines.',
    input: { type: 'keys', values: [30, 20, 10] },
    params: { count: 3 },
  },
  {
    id: 'double-left-right',
    label: 'Left-right double rotation (10, 30, 20)',
    blurb:
      'A single rotation would not help: the new key 20 landed in the *left* subtree of 30, so the tree is left-right rather than left-left. Two rotations, the inner one first, and the intermediate state is deliberately illegal — it is a step in the algorithm, not a tree you could build.',
    input: { type: 'keys', values: [10, 30, 20] },
    params: { count: 3 },
  },
  {
    id: 'double-right-left',
    label: 'Right-left double rotation (30, 10, 20)',
    blurb:
      'The other double case, and the reason you cannot decide from the balance factor alone which rotation to use: you also need to know which side the new key came in on. That is why `key` is passed to the fix-up at all.',
    input: { type: 'keys', values: [30, 10, 20] },
    params: { count: 3 },
  },
  {
    id: 'ascending',
    label: 'Ascending — the case a plain BST loses',
    blurb:
      'The same six sorted keys BST Insert turned into a six-deep list. Every insert triggers a rotation, and the height stays at 3 — which is the entire argument for AVL over BST.',
    input: { type: 'keys', values: SORTED },
    params: { count: 6 },
  },
  {
    id: 'descending',
    label: 'Descending (the mirror, same answer)',
    blurb:
      'Descending input, and the same height as ascending. The tree is a different shape with the same number of nodes at the same levels, which is the strongest evidence that the height really is what is being controlled.',
    input: { type: 'keys', values: REVERSED },
    params: { count: 6 },
  },
  {
    id: 'single',
    label: 'One node',
    blurb:
      'Nothing to fix up. A single node has height 1, and there is no parent to walk back to, so the fix-up loop does not run at all.',
    input: { type: 'keys', values: [42] },
    params: { count: 1 },
  },
  {
    id: 'empty',
    label: 'Empty tree',
    blurb:
      'No keys, so no nodes and height 0. The degenerate case that must not crash, and the one place where "no tree" and "a tree of height 0" are the same answer.',
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
  /** -1 left, 0 root, 1 right. */
  side: number;
  height: number;
}

const id = (i: number): NodeId => `n${i}`;

export function* avlRotate(ctx: RunContext): Generator<TreeFrame> {
  const raw = isKeys(ctx.input) ? ctx.input.values.map((v) => Number(v)) : [];
  const wanted = Math.max(0, Math.min(12, Math.trunc(Number(ctx.params.count ?? 6))));
  const keys = raw.slice(0, wanted);

  const slots: Slot[] = [];
  let root = -1;
  const stack: NodeId[] = [];
  let ops = 0;
  let rotations = 0;

  const h = (i: number): number => (i === -1 ? 0 : (slots[i] as Slot).height);

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
        meta: { height: slot.height },
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

  /** Rotate the subtree at p right. Returns the new subtree root. */
  const rotateRight = (p: number): number => {
    const q = (slots[p] as Slot).left;
    const g = (slots[p] as Slot).parent;
    if ((slots[q] as Slot).right !== -1) {
      const b = (slots[q] as Slot).right;
      (slots[b] as Slot).parent = p;
      // `side` says which child slot of its parent a node occupies, and `b` just
      // changed slot: it was q's *right* child and is now p's *left* child. Without
      // this line `parent` and `side` disagree, and a frame is a flat edge list
      // that the renderer turns back into a tree by grouping on exactly those two
      // fields — so the subtree vanishes from the drawing and `p` appears to have
      // lost its left child entirely. It also made the frame's in-order walk drop
      // half the keys, while the algorithm's own `left`/`right` arrays stayed
      // correct, which is why the rotation *looked* fine in the numbers.
      (slots[b] as Slot).side = -1;
    }
    (slots[p] as Slot).left = (slots[q] as Slot).right;
    (slots[q] as Slot).right = p;
    (slots[p] as Slot).parent = q;
    (slots[q] as Slot).parent = g;
    if (g === -1) root = q;
    else if ((slots[p] as Slot).side < 0) (slots[g] as Slot).left = q;
    else (slots[g] as Slot).right = q;
    (slots[q] as Slot).side = g === -1 ? 0 : (slots[p] as Slot).side;
    // p is demoted below q on the right, so -1 here is wrong: it has to be +1.
    (slots[p] as Slot).side = 1;
    // Both heights have to be recomputed, and in this order: p first, because q's
    // new height is 1 + max over children that now includes p.
    (slots[p] as Slot).height =
      1 + Math.max(h((slots[p] as Slot).left), h((slots[p] as Slot).right));
    (slots[q] as Slot).height =
      1 + Math.max(h((slots[q] as Slot).left), h((slots[q] as Slot).right));
    return q;
  };

  const rotateLeft = (p: number): number => {
    const q = (slots[p] as Slot).right;
    const g = (slots[p] as Slot).parent;
    if ((slots[q] as Slot).left !== -1) {
      const b = (slots[q] as Slot).left;
      (slots[b] as Slot).parent = p;
      // Mirror of the right rotation: `b` was q's left child and is now p's right.
      (slots[b] as Slot).side = 1;
    }
    (slots[p] as Slot).right = (slots[q] as Slot).left;
    (slots[q] as Slot).left = p;
    (slots[p] as Slot).parent = q;
    (slots[q] as Slot).parent = g;
    if (g === -1) root = q;
    else if ((slots[p] as Slot).side > 0) (slots[g] as Slot).right = q;
    else (slots[g] as Slot).left = q;
    (slots[q] as Slot).side = g === -1 ? 0 : (slots[p] as Slot).side;
    // Mirror image: a left rotation demotes p to q's *left*, so -1.
    (slots[p] as Slot).side = -1;
    // Both heights recomputed, p first: q's new height depends on it.
    (slots[p] as Slot).height =
      1 + Math.max(h((slots[p] as Slot).left), h((slots[p] as Slot).right));
    (slots[q] as Slot).height =
      1 + Math.max(h((slots[q] as Slot).left), h((slots[q] as Slot).right));
    return q;
  };

  yield frame(
    'start',
    keys.length === 0
      ? 'No keys, so no nodes. An AVL tree with no nodes has height 0, and every node below will show its subtree height as hN under the box.'
      : `An empty AVL tree and ${keys.length} key${keys.length === 1 ? '' : 's'}. Each insert walks down as in a plain BST, then walks *back up* the same path recomputing subtree heights and rotating at most once. The hN under each node is its subtree height: 0 for empty, 1 for a leaf.`,
    {},
    { keys: keys.length, nodes: 0, height: 0, rotations, ops },
  );

  for (let k = 0; k < keys.length; k++) {
    if (ctx.shouldStop()) return;
    const key = keys[k] as number;
    ops++;

    if (root === -1) {
      slots.push({ value: key, left: -1, right: -1, parent: -1, side: 0, height: 1 });
      root = 0;
      ops++;
      yield frame(
        'descend',
        `The first key, ${key}, becomes the root with height 1 and no children. There is no parent to walk back to, so the fix-up phase is skipped entirely — the very first insert in an AVL tree is always trivially balanced.`,
        { answer: [id(0)] },
        { key, index: k, height: 1, rotations, ops },
      );
      continue;
    }

    // ---- descend, recording the path ---------------------------
    const path: number[] = [];
    let cur = root;
    stack.length = 0;
    for (;;) {
      if (ctx.shouldStop()) return;
      ops++;
      const here = slots[cur] as Slot;
      stack.push(id(cur));
      path.push(cur);
      const goLeft = key < here.value;
      const free = goLeft ? here.left : here.right;
      yield frame(
        'descend',
        free === -1
          ? `${key} is ${key < here.value ? 'smaller' : 'larger'} than ${here.value}, and the ${goLeft ? 'left' : 'right'} slot is empty — so this is the last node on the path and the new key hangs here. Path length ${path.length}, and every one of those nodes is about to be visited again on the way back up.`
          : `${key} is ${key < here.value ? 'smaller' : 'larger'} than ${here.value}, so go ${goLeft ? 'left' : 'right'}. The path so far is ${path.length} node${path.length === 1 ? '' : 's'} deep — and this exact list is what the fix-up phase will walk back up, so the descent is doing double duty.`,
        { compare: [id(cur)], path: [...stack] },
        { key, index: k, at: here.value, depth: stack.length, rotations, ops },
      );
      if (free === -1) break;
      cur = free;
    }

    // ---- attach ------------------------------------------------
    const here = slots[cur] as Slot;
    const goLeft = key < here.value;
    const at = slots.length;
    if (goLeft) here.left = at;
    else here.right = at;
    slots.push({
      value: key,
      left: -1,
      right: -1,
      parent: cur,
      side: goLeft ? -1 : 1,
      height: 1,
    });
    stack.length = 0;
    yield frame(
      'attach',
      `The ${goLeft ? 'left' : 'right'} slot of ${here.value} was empty, so ${key} goes in with height 1. The BST part of an AVL insert is now finished and the tree is a *valid BST that is not yet balanced* — the fix-up below is what makes it an AVL tree, and this frame is the one moment where that is true.`,
      { answer: [id(at)], compare: [id(cur)] },
      { key, index: k, at: here.value, depth: 1, height: 1, rotations, ops },
    );

    // ---- fix up, walking back up the path ----------------------
    for (let pi = path.length - 1; pi >= 0; pi--) {
      if (ctx.shouldStop()) return;
      const p = path[pi] as number;
      const node = slots[p] as Slot;
      const lh = h(node.left);
      const rh = h(node.right);
      ops++;
      node.height = 1 + Math.max(lh, rh);
      stack.length = 0;
      stack.push(id(p));
      yield frame(
        'update-height',
        `Back up to ${node.value}: its subtree is a left child of height ${lh} and a right child of height ${rh}, so its own height is 1 + ${Math.max(lh, rh)} = ${node.height}. Recomputing heights on the way up is the only new bookkeeping an AVL tree does — one comparison and a max per level.`,
        { current: [id(p)], compare: node.left === -1 ? [] : [id(node.left)], path: [...stack] },
        { at: node.value, left: lh, right: rh, height: node.height, rotations, ops },
      );

      const bf = lh - rh;
      if (bf > 1 || bf < -1) {
        yield frame(
          'imbalance',
          `Balance factor ${bf > 0 ? '+' : ''}${bf} at ${node.value} — that is ${Math.abs(bf)} levels of imbalance, one more than an AVL tree allows. Height alone is not enough to pick the rotation: the fix-up also needs to know which side the new key arrived on, which is why \`key\` is passed down here.`,
          { compare: [id(p)], answer: [id(p)], path: [...stack] },
          { at: node.value, balance: bf, key, rotations, ops },
        );

        if (bf > 1) {
          const l = node.left;
          if (key < (slots[l] as Slot).value) {
            stack.length = 0;
            stack.push(id(l), id(p));
            yield frame(
              'rotate-right',
              `Left-left case: the new key is smaller than the left child ${(slots[l] as Slot).value}, so the whole shape is a straight lean to the left. One right rotation about ${node.value} promotes ${(slots[l] as Slot).value} and the tree is balanced again.`,
              { compare: [id(p)], answer: [id(l)], path: [...stack] },
              { at: node.value, child: (slots[l] as Slot).value, rotations: rotations + 1, ops },
            );
            rotateRight(p);
            ops++;
            rotations++;
            yield frame(
              'update-height',
              `After the rotation the subtree is one level *shorter* than the insert left it — that is the repair paying for the level the new node added. Both heights are recomputed, in this order: ${node.value} first (h${(slots[p] as Slot).height}), then ${(slots[l] as Slot).value}, because the promoted node's height is measured over children that include the one just recomputed.`,
              { answer: [id(l), id(p)] },
              { at: node.value, child: (slots[l] as Slot).value, rotations, ops },
            );
          } else {
            stack.length = 0;
            stack.push(id(l), id(p));
            yield frame(
              'double-left-right',
              `Left-right case: the new key ${key} is larger than the left child ${(slots[l] as Slot).value}, so this is a lean to the left whose last step went right. A single rotation cannot fix it. Rotate the child left first — which is a *temporarily illegal* AVL tree, and that is fine, it is a step of the algorithm rather than a state anyone stores.`,
              { compare: [id(p), id(l)], answer: [id(l)], path: [...stack] },
              {
                at: node.value,
                child: (slots[l] as Slot).value,
                key,
                rotations: rotations + 1,
                ops,
              },
            );
            rotateLeft(l);
            ops++;
            yield frame(
              'update-height',
              `That inner rotation made the shape left-left: ${key} is now directly under ${node.value}. One more right rotation and the double case collapses into the single case.`,
              { compare: [id(p), id(l)], answer: [id(l)] },
              { at: node.value, child: (slots[l] as Slot).value, rotations: rotations + 1, ops },
            );
            rotateRight(p);
            ops++;
            rotations++;
            yield frame(
              'update-height',
              `Two rotations, one insert, and the sorted order of the keys is untouched — ${node.value} is still to the right of everything under it and to the left of everything above it. That invariant is the only reason a rotation is legal at all.`,
              { answer: [id(p), id(l)] },
              { at: node.value, child: (slots[l] as Slot).value, rotations, ops },
            );
          }
        } else {
          const r = node.right;
          if (key > (slots[r] as Slot).value) {
            stack.length = 0;
            stack.push(id(r), id(p));
            yield frame(
              'rotate-left',
              `Right-right case: the new key is larger than the right child ${(slots[r] as Slot).value}, so the lean is a straight one to the right. One left rotation about ${node.value} promotes ${(slots[r] as Slot).value}. The mirror of the previous case, and a different five lines of code.`,
              { compare: [id(p)], answer: [id(r)], path: [...stack] },
              { at: node.value, child: (slots[r] as Slot).value, rotations: rotations + 1, ops },
            );
            rotateLeft(p);
            ops++;
            rotations++;
            yield frame(
              'update-height',
              `Both affected heights are correct again, and the subtree lost the level the insert added. Nothing about the tree got *shallower* in any absolute sense — the point is that the repair undoes exactly one level of damage, and leaves the rest of the tree alone.`,
              { answer: [id(r), id(p)] },
              { at: node.value, child: (slots[r] as Slot).value, rotations, ops },
            );
          } else {
            stack.length = 0;
            stack.push(id(r), id(p));
            yield frame(
              'double-right-left',
              `Right-left case: the new key ${key} is smaller than the right child ${(slots[r] as Slot).value}, so the lean to the right ended with a step to the left. Rotate the child right first, then the node left — the same two-step as the previous case with every left and right swapped.`,
              { compare: [id(p), id(r)], answer: [id(r)], path: [...stack] },
              {
                at: node.value,
                child: (slots[r] as Slot).value,
                key,
                rotations: rotations + 1,
                ops,
              },
            );
            rotateRight(r);
            ops++;
            yield frame(
              'update-height',
              `The inner rotation made the shape right-right. One left rotation more and it is balanced — and note the in-order sequence has not moved by a single position, which is the property that makes any of this safe.`,
              { compare: [id(p), id(r)], answer: [id(r)] },
              { at: node.value, child: (slots[r] as Slot).value, rotations: rotations + 1, ops },
            );
            rotateLeft(p);
            ops++;
            rotations++;
            yield frame(
              'update-height',
              `Balanced, and the subtree is one level shorter than the insert made it — which is why the walk can stop here: no node above this one got any taller, so none of them can be out of balance. Two rotations is the most an AVL insert ever does.`,
              { answer: [id(p), id(r)] },
              { at: node.value, child: (slots[r] as Slot).value, rotations, ops },
            );
          }
        }
      }
    }
  }

  stack.length = 0;
  const height = h(root);
  const balanced = slots.every((s) => Math.abs(h(s.left) - h(s.right)) <= 1);
  yield frame(
    'done',
    `Height ${height} for ${slots.length} node${slots.length === 1 ? '' : 's'}, after ${rotations} rotation${rotations === 1 ? '' : 's'}. Every node's balance factor is within ±1${balanced ? ', so this is a valid AVL tree' : ''}, and every recorded height still matches the heights below it. The same descent code, one repair pass more, and the depth is now bounded by about 1.44·log2(n) instead of n.`,
    { answer: root === -1 ? [] : [id(root)] },
    { nodes: slots.length, height, rotations, balanced, ops },
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

const PARALLEL = `// Parallel arrays indexed by insertion order, -1 for "no child", and a
// height per node (0 for an empty subtree, 1 for a leaf). That one extra int is
// the entire difference between a BST and an AVL tree.`;

const JS = `${PARALLEL}
function avlRotate(keys) {
  const value = [], left = [], right = [], parent = [], side = [], height = [];  // @anchor start
  let root = -1;
  const h = (i) => (i === -1 ? 0 : height[i]);

  // Rotate the subtree at p to the right: its left child becomes the subtree root.
  function rotateRight(p) {
    const q = left[p], g = parent[p];
    // The side array records which child slot a node sits in. The subtree that moves from
    // q's right into p's left changes slot, so its side has to change with it —
    // parent alone is not enough, and a frame is rebuilt from those two fields.
    if (right[q] !== -1) { parent[right[q]] = p; side[right[q]] = -1; }
    left[p] = right[q];
    right[q] = p;
    parent[p] = q;
    parent[q] = g;
    if (g === -1) root = q;
    else if (side[p] < 0) left[g] = q;
    else right[g] = q;
    side[q] = g === -1 ? 0 : side[p];
    side[p] = 1;
    // Both heights have to be recomputed, and in this order: p first, because q's
    // new height is 1 + max over children that now includes p.
    height[p] = 1 + Math.max(h(left[p]), h(right[p]));
    height[q] = 1 + Math.max(h(left[q]), h(right[q]));
  }

  // The mirror image, with every left and right swapped.
  function rotateLeft(p) {
    const q = right[p], g = parent[p];
    if (left[q] !== -1) { parent[left[q]] = p; side[left[q]] = 1; }
    right[p] = left[q];
    left[q] = p;
    parent[p] = q;
    parent[q] = g;
    if (g === -1) root = q;
    else if (side[p] > 0) right[g] = q;
    else left[g] = q;
    side[q] = g === -1 ? 0 : side[p];
    side[p] = -1;
    // Both heights recomputed, p first: q's new height depends on it.
    height[p] = 1 + Math.max(h(left[p]), h(right[p]));
    height[q] = 1 + Math.max(h(left[q]), h(right[q]));
  }

  // Walk back up one level of the insertion path: fix the height, and rotate
  // once if this node has fallen out of balance.
  function fix(p, key) {
    height[p] = 1 + Math.max(h(left[p]), h(right[p]));      // @anchor update-height
    const bf = h(left[p]) - h(right[p]);
    if (bf > 1 || bf < -1) {                                // @anchor imbalance
      if (bf > 1) {
        const l = left[p];
        if (key < value[l]) rotateRight(p);                 // @anchor rotate-right
        else { rotateLeft(l); rotateRight(p); }             // @anchor double-left-right
      } else {
        const r = right[p];
        if (key > value[r]) rotateLeft(p);                  // @anchor rotate-left
        else { rotateRight(r); rotateLeft(p); }             // @anchor double-right-left
      }
    }
  }

  for (const key of keys) {
    if (root === -1) {
      value.push(key); left.push(-1); right.push(-1);
      parent.push(-1); side.push(0); height.push(1);
      root = 0;
      continue;
    }
    const path = [];
    let cur = root;
    for (;;) {                                              // @anchor descend
      path.push(cur);
      const goLeft = key < value[cur];
      const free = goLeft ? left[cur] : right[cur];
      if (free !== -1) { cur = free; continue; }
      const at = value.length;
      if (goLeft) left[cur] = at; else right[cur] = at;
      value.push(key); left.push(-1); right.push(-1);       // @anchor attach
      parent.push(cur); side.push(goLeft ? -1 : 1); height.push(1);
      break;
    }
    for (let k = path.length - 1; k >= 0; k--) fix(path[k], key);
  }
  return h(root);                                            // @anchor done
}`;

const PY = `${PARALLEL.replace(/\/\//g, '#')}
def avl_rotate(keys):
    value, left, right, parent, side, height = [], [], [], [], [], []  # @anchor start
    root = -1

    def h(i):
        return 0 if i == -1 else height[i]

    # Rotate the subtree at p to the right: its left child becomes the subtree
    # root. \`nonlocal root\` is what lets the helper hand back a new root.
    def rotate_right(p):
        nonlocal root
        q, g = left[p], parent[p]
        # The side array records which child slot a node sits in. The subtree that moves
        # from q's right into p's left changes slot, so its side has to change
        # with it — parent alone is not enough, and a frame is rebuilt from
        # those two fields.
        if right[q] != -1:
            parent[right[q]] = p
            side[right[q]] = -1
        left[p] = right[q]
        right[q] = p
        parent[p] = q
        parent[q] = g
        if g == -1:
            root = q
        elif side[p] < 0:
            left[g] = q
        else:
            right[g] = q
        side[q] = 0 if g == -1 else side[p]
        side[p] = 1
        # Both heights have to be recomputed, and in this order: p first, because
        # q's new height is 1 + max over children that now includes p.
        height[p] = 1 + max(h(left[p]), h(right[p]))
        height[q] = 1 + max(h(left[q]), h(right[q]))
    # The mirror image, with every left and right swapped.
    def rotate_left(p):
        nonlocal root
        q, g = right[p], parent[p]
        if left[q] != -1:
            parent[left[q]] = p
            side[left[q]] = 1
        right[p] = left[q]
        left[q] = p
        parent[p] = q
        parent[q] = g
        if g == -1:
            root = q
        elif side[p] > 0:
            right[g] = q
        else:
            left[g] = q
        side[q] = 0 if g == -1 else side[p]
        side[p] = -1
        # Both heights recomputed, p first: q's new height depends on it.
        height[p] = 1 + max(h(left[p]), h(right[p]))
        height[q] = 1 + max(h(left[q]), h(right[q]))

    # Walk back up one level of the insertion path: fix the height, and rotate
    # once if this node has fallen out of balance.
    def fix(p, key):                                         # @anchor update-height
        height[p] = 1 + max(h(left[p]), h(right[p]))
        bf = h(left[p]) - h(right[p])
        if bf > 1 or bf < -1:                                # @anchor imbalance
            if bf > 1:
                l = left[p]
                if key < value[l]:
                    rotate_right(p)                          # @anchor rotate-right
                else:
                    rotate_left(l)
                    rotate_right(p)                          # @anchor double-left-right
            else:
                r = right[p]
                if key > value[r]:
                    rotate_left(p)                           # @anchor rotate-left
                else:
                    rotate_right(r)
                    rotate_left(p)                           # @anchor double-right-left

    for key in keys:
        if root == -1:
            value.append(key); left.append(-1); right.append(-1)
            parent.append(-1); side.append(0); height.append(1)
            root = 0
            continue
        path = []
        cur = root
        while True:                                          # @anchor descend
            path.append(cur)
            go_left = key < value[cur]
            free = left[cur] if go_left else right[cur]
            if free != -1:
                cur = free
                continue
            at = len(value)
            if go_left:
                left[cur] = at
            else:
                right[cur] = at
            value.append(key); left.append(-1); right.append(-1)  # @anchor attach
            parent.append(cur)
            side.append(-1 if go_left else 1)
            height.append(1)
            break
        for k in range(len(path) - 1, -1, -1):
            fix(path[k], key)
    return h(root)                                            # @anchor done`;

const JAVA = `${PARALLEL}
class AvlRotate {
    // The representation is still parallel arrays keyed by index - see the note
    // above. A static method has no closures over locals, so the arrays live in
    // the fields of this tiny holder. That is the one Java-only concession, and
    // it is what lets rotateRight() replace \`root\` without a one-element box.
    static final class Avl {
        int[] value = new int[64], left = new int[64], right = new int[64];
        int[] parent = new int[64], side = new int[64], height = new int[64];  // @anchor start
        int size = 0, root = -1;

        Avl() {
            java.util.Arrays.fill(left, -1);
            java.util.Arrays.fill(right, -1);
            java.util.Arrays.fill(parent, -1);
        }

        int h(int i) { return i == -1 ? 0 : height[i]; }

        void rotateRight(int p) {
            int q = left[p], g = parent[p];
            // The side array records which child slot a node sits in. The subtree that
            // moves from q's right into p's left changes slot, so its side has
            // to change with it — parent alone is not enough, and a frame is
            // rebuilt from those two fields.
            if (right[q] != -1) { parent[right[q]] = p; side[right[q]] = -1; }
            left[p] = right[q];
            right[q] = p;
            parent[p] = q;
            parent[q] = g;
            if (g == -1) root = q;
            else if (side[p] < 0) left[g] = q;
            else right[g] = q;
            side[q] = g == -1 ? 0 : side[p];
            side[p] = 1;
            // Both heights have to be recomputed, and in this order: p first,
            // because q's new height is 1 + max over children that includes p.
            height[p] = 1 + Math.max(h(left[p]), h(right[p]));
            height[q] = 1 + Math.max(h(left[q]), h(right[q]));
        }

        void rotateLeft(int p) {
            int q = right[p], g = parent[p];
            if (left[q] != -1) { parent[left[q]] = p; side[left[q]] = 1; }
            right[p] = left[q];
            left[q] = p;
            parent[p] = q;
            parent[q] = g;
            if (g == -1) root = q;
            else if (side[p] > 0) right[g] = q;
            else left[g] = q;
            side[q] = g == -1 ? 0 : side[p];
            side[p] = -1;
            // Both heights recomputed, p first: q's new height depends on it.
            height[p] = 1 + Math.max(h(left[p]), h(right[p]));
            height[q] = 1 + Math.max(h(left[q]), h(right[q]));
        }

        // Walk back up one level of the insertion path: fix the height, and
        // rotate once if this node has fallen out of balance.
        void fix(int p, int key) {
            height[p] = 1 + Math.max(h(left[p]), h(right[p]));  // @anchor update-height
            int bf = h(left[p]) - h(right[p]);
            if (bf > 1 || bf < -1) {                            // @anchor imbalance
                if (bf > 1) {
                    int l = left[p];
                    if (key < value[l]) rotateRight(p);         // @anchor rotate-right
                    else { rotateLeft(l); rotateRight(p); }     // @anchor double-left-right
                } else {
                    int r = right[p];
                    if (key > value[r]) rotateLeft(p);          // @anchor rotate-left
                    else { rotateRight(r); rotateLeft(p); }     // @anchor double-right-left
                }
            }
        }
    }

    static int avlRotate(int[] keys) {
        Avl t = new Avl();
        for (int k = 0; k < keys.length; k++) {
            int key = keys[k];
            if (t.root == -1) {
                t.value[0] = key; t.height[0] = 1; t.size = 1; t.root = 0;
                continue;
            }
            int[] path = new int[keys.length];
            int len = 0, cur = t.root;
            for (;;) {                                          // @anchor descend
                path[len++] = cur;
                boolean goLeft = key < t.value[cur];
                int free = goLeft ? t.left[cur] : t.right[cur];
                if (free != -1) { cur = free; continue; }
                if (goLeft) t.left[cur] = t.size; else t.right[cur] = t.size;
                t.value[t.size] = key; t.height[t.size] = 1;    // @anchor attach
                t.parent[t.size] = cur;
                t.side[t.size] = goLeft ? -1 : 1;
                t.size++;
                break;
            }
            for (int p = len - 1; p >= 0; p--) t.fix(path[p], key);
        }
        return t.h(t.root);                                      // @anchor done
    }
}`;

const CPP = `${PARALLEL}
#include <algorithm>
#include <vector>
using std::vector;

int avl_rotate(vector<int> keys) {
    vector<int> value, left, right, parent, side, height;       // @anchor start
    int root = -1;
    auto h = [&](int i) { return i == -1 ? 0 : height[i]; };

    // Rotate the subtree at p to the right: its left child becomes the subtree
    // root. The lambda captures the vectors *and* root by reference, which is
    // what lets the helper replace the root.
    auto rotateRight = [&](int p) {
        int q = left[p], g = parent[p];
        // The side array records which child slot a node sits in. The subtree that moves
        // from q's right into p's left changes slot, so its side has to change
        // with it — parent alone is not enough, and a frame is rebuilt from
        // those two fields.
        if (right[q] != -1) { parent[right[q]] = p; side[right[q]] = -1; }
        left[p] = right[q];
        right[q] = p;
        parent[p] = q;
        parent[q] = g;
        if (g == -1) root = q;
        else if (side[p] < 0) left[g] = q;
        else right[g] = q;
        side[q] = (g == -1 ? 0 : side[p]);
        side[p] = 1;
        // Both heights have to be recomputed, and in this order: p first, because
        // q's new height is 1 + max over children that now includes p.
        height[p] = 1 + std::max(h(left[p]), h(right[p]));
        height[q] = 1 + std::max(h(left[q]), h(right[q]));
    };

    // The mirror image, with every left and right swapped.
    auto rotateLeft = [&](int p) {
        int q = right[p], g = parent[p];
        if (left[q] != -1) { parent[left[q]] = p; side[left[q]] = 1; }
        right[p] = left[q];
        left[q] = p;
        parent[p] = q;
        parent[q] = g;
        if (g == -1) root = q;
        else if (side[p] > 0) right[g] = q;
        else left[g] = q;
        side[q] = (g == -1 ? 0 : side[p]);
        side[p] = -1;
        // Both heights recomputed, p first: q's new height depends on it.
        height[p] = 1 + std::max(h(left[p]), h(right[p]));
        height[q] = 1 + std::max(h(left[q]), h(right[q]));
    };

    // Walk back up one level of the insertion path: fix the height, and rotate
    // once if this node has fallen out of balance.
    auto fix = [&](int p, int key) {
        height[p] = 1 + std::max(h(left[p]), h(right[p]));      // @anchor update-height
        int bf = h(left[p]) - h(right[p]);
        if (bf > 1 || bf < -1) {                                // @anchor imbalance
            if (bf > 1) {
                int l = left[p];
                if (key < value[l]) rotateRight(p);              // @anchor rotate-right
                else { rotateLeft(l); rotateRight(p); }          // @anchor double-left-right
            } else {
                int r = right[p];
                if (key > value[r]) rotateLeft(p);               // @anchor rotate-left
                else { rotateRight(r); rotateLeft(p); }          // @anchor double-right-left
            }
        }
    };

    for (int key : keys) {
        if (root == -1) {
            value.push_back(key); left.push_back(-1); right.push_back(-1);
            parent.push_back(-1); side.push_back(0); height.push_back(1);
            root = 0;
            continue;
        }
        vector<int> path;
        int cur = root;
        for (;;) {                                              // @anchor descend
            path.push_back(cur);
            bool goLeft = key < value[cur];
            int free = goLeft ? left[cur] : right[cur];
            if (free != -1) { cur = free; continue; }
            int at = (int)value.size();
            if (goLeft) left[cur] = at; else right[cur] = at;
            value.push_back(key); left.push_back(-1); right.push_back(-1);  // @anchor attach
            parent.push_back(cur); side.push_back(goLeft ? -1 : 1); height.push_back(1);
            break;
        }
        for (int k = (int)path.size() - 1; k >= 0; k--) fix(path[k], key);
    }
    return h(root);                                             // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'Six parallel arrays, and the sixth one — `height` — is the whole difference between a BST and an AVL tree. `0` for an empty subtree and `1` for a leaf keeps the arithmetic uniform, so `1 + max(h(left), h(right))` is the same formula at every node with no special case for leaves.',
    python:
      'Six parallel lists, and the sixth — `height` — is the entire difference between a BST and an AVL tree. The 0-for-empty / 1-for-leaf convention is what lets the same one-liner work at every node, including leaves, with no branch anywhere in the height computation.',
    java: 'Six int[]s and a `size` counter, plus the three `Arrays.fill` calls in the constructor: a fresh array is zero-filled and `0` is a valid index, so without them every child pointer would point at the first node. The arrays are fields of the `Avl` holder rather than locals because a static method has no closures — the representation is unchanged, only where it is stored.',
    cpp: 'Six vectors, and the sixth — `height` — is the entire difference between a BST and an AVL tree. They grow on demand, so there is no `size` counter and no fill calls, which is the only structural difference from the Java version and the reason this listing is a little shorter while doing the same work.',
  },
  descend: {
    javascript:
      'The BST half of an AVL insert: walk down comparing, exactly as in BST Insert. The one addition is `path.push(cur)` — the descent is doing double duty, because the fix-up phase walks the *same list* back upwards and there is no point searching for the ancestors twice.',
    python:
      'The BST half, identical to BST Insert, plus the `path` list. Collecting the path during the descent is what makes the whole insert O(log n) rather than O(log² n): finding each ancestor separately would be a second search per level, and this is the one piece of bookkeeping that makes the difference obvious.',
    java: 'The BST half, with the path collected into a preallocated `int[]` and a separate `len` counter rather than a list — preallocating to `keys.length` is enough because the path can never be longer than the number of nodes inserted so far.',
    cpp: 'The BST half, with the path in a vector that grows on demand. `path.push_back(cur)` may reallocate, which is harmless here because nothing else holds a pointer into it; the same call in a tighter loop would be worth replacing with a reserved buffer.',
  },
  attach: {
    javascript:
      'The new node goes in with height 1, and the tree is now a valid BST that is *not yet balanced*. This frame is the moment that is true, and it is worth pausing on: an AVL insert is not one atomic step, it is "make a BST, then repair the path", and the repair only ever touches the nodes on the way back up.',
    python:
      'The new node goes in with height 1. Six `append` calls in a fixed order — and that fixed order is the price of parallel arrays: a `Node` object would take one allocation and six attribute writes would not be needed at all, but then the four listings would no longer share a representation.',
    java: 'The new node goes in with height 1. Six array stores and a `size++` where the other three languages have six `append` calls — preallocated storage is faster but demands a counter, and the counter is the thing a future edit will forget to bump.',
    cpp: 'The new node goes in with height 1. Six `push_back` calls, each of which may reallocate; with `reserve(keys.size())` at the top this becomes free, and that is the usual reason a hot AVL implementation in C++ preallocates rather than growing.',
  },
  'update-height': {
    javascript:
      'The height fix-up, run once per node on the way back up. This is the *only* new bookkeeping an AVL tree does: one max and one store per level. It is also why the fix-up can stop as soon as the heights stop changing — a common and worthwhile optimisation, since most inserts change nothing above the first few levels.',
    python:
      'The height fix-up, once per level. `1 + max(h(left[p]), h(right[p]))` is the same expression at every node because `h` maps -1 to 0 — which is the small trick that makes the 0-for-empty convention worth the trouble of explaining.',
    java: 'The height fix-up, once per level, with `h()` as a method on the holder so the -1-to-0 mapping lives in one place. An early exit on "the height did not change" is a standard optimisation: nothing above can be out of balance if nothing above got taller.',
    cpp: 'The height fix-up, once per level, with `std::max` returning a reference and the `int` copy happening on assignment. The lambda `h` inlines at -O2, so the -1 check costs nothing measurable — which is the sort of thing worth knowing before optimising it by hand.',
  },
  imbalance: {
    javascript:
      'The balance check, and the moment the algorithm branches into four cases. The balance factor alone is not enough — it says *which way* the node leans, not *which way the new key came in*, and the difference between a single and a double rotation is exactly that second fact. This is why `fix` takes `key` and not just a node index.',
    python:
      'The balance check. `bf > 1 or bf < -1` rather than `abs(bf) > 1` is the same test written out, and it is the shape the other three languages need because the branches below differ for the two signs — collapsing them with `abs` would hide which case you are in.',
    java: 'The balance check. The two signs need different branches, so the test is written out rather than as `Math.abs(bf) > 1`: the code below reads "if it leans left… else it leans right", and a single `abs` test would have to be re-expanded anyway.',
    cpp: 'The balance check, with the sign determining the branch. A rotation is chosen by the *pair* (lean direction, key direction), and getting the pairing wrong produces a tree that is still a BST but is not balanced — a bug with no exception and no wrong answer, which is the worst kind.',
  },
  'rotate-right': {
    javascript:
      "The left-left case: one right rotation about the imbalanced node, promoting its left child. Six pointer writes and two height stores. The heights are recomputed in a specific order — the demoted node first, because the promoted node's new height is measured over children that now include it — and getting that order wrong gives a tree that looks balanced and measures wrong.",
    python:
      'The left-left case. The helper is a closure over the six lists, so it reads almost like the field accesses it is, and `nonlocal root` is the one line that exists only because a rotation may change which node is the root — a problem the other three languages solve with a lambda capture, a field, and a holder object respectively.',
    java: 'The left-left case. The helper is a method on the holder, so `left[p] = right[q]` is a field write through an object rather than a local array reference — the same source text as the other three, one extra indirection in between. The two height lines and their order are the whole trick, and they are the part implementations most often get wrong.',
    cpp: 'The left-left case, and the lambda captures the vectors by reference, so `left[p] = right[q]` mutates the tree rather than a copy. That single character in the capture list is the difference between an AVL tree and a function that quietly does nothing.',
  },
  'rotate-left': {
    javascript:
      'The right-right case, and the mirror image of the previous one: every left becomes a right and `side[p] > 0` becomes `side[p] < 0`. It is a genuinely different five lines rather than a parameterised rotation, which is why AVL implementations are usually written out longhand — the sign logic is the part that has to be right, and a shared helper with a direction flag hides it.',
    python:
      'The right-right case. A parameterised rotation ("rotate the subtree at p, direction d") would halve the code and make the sign logic harder to read, and the sign logic is what has to be right — so implementations are conventionally written out twice, and the two are checked against each other by eye.',
    java: 'The right-right case, the mirror of the previous one. Together the two helpers are the only place in the file where left and right are asymmetric, and the symmetry is worth checking by eye: every `left` in one is a `right` in the other, and the two `side` writes are the only lines that are not a swap.',
    cpp: 'The right-right case. The two lambdas differ only in which vector they read `q` from and which one they write, and comparing them side by side is the fastest way to convince yourself that a rotation is a rotation rather than two unrelated pointer swaps.',
  },
  'double-left-right': {
    javascript:
      'The left-right case, and the reason a single rotation is not enough: the lean to the left ended with a step to the *right*, so rotating once about the parent would only move the zigzag further down. The child is rotated first — producing a deliberately illegal intermediate tree — and then the shape is left-left and the single rotation applies.',
    python:
      'The left-right case. Two calls in a block, and the intermediate state after `rotate_left(l)` is an AVL tree that is *not balanced* — which is fine, because it exists only between two statements. Writing the double rotation as a recursive call back into the single one, as some textbooks do, hides which rotation is really happening.',
    java: 'The left-right case, two calls in a block. The intermediate state is illegal by the AVL invariant and nobody ever stores it: it is two statements, not a data structure. Worth saying out loud, because "fix it up afterwards" is only safe while "afterwards" means "the next statement".',
    cpp: 'The left-right case, two calls in a block. The two-step form exists because the single rotation only resolves a straight lean; a zigzag needs the inner rotation to straighten it first, and the cost is one extra rotation on the inserts that land here — the worst case for an AVL insert, still O(1) rotations.',
  },
  'double-right-left': {
    javascript:
      'The right-left case, and the mirror of the previous one. All four together are why the fix-up needs the new key passed into it: the balance factor picks the pair of cases, and the key picks the rotation within the pair. A version that only looked at the balance factor would have to try both rotations and roll one back.',
    python:
      'The right-left case. The four cases are a 2x2 decision — lean direction times key direction — and writing them as nested ifs rather than a lookup table is what keeps that structure visible. A table would be shorter and would hide exactly the thing worth seeing.',
    java: 'The right-left case. Both double cases call one rotation and then the other, in that order, and the order matters: doing the outer one first gives a tree that is still unbalanced, and the inner rotation then has to fix a different shape than the reasoning described.',
    cpp: 'The right-left case, and the last of the four. Two rotations is the maximum for any AVL insert, and that bound is what makes insert O(log n) rather than O(n): the cost per level is constant work, plus at most two rotations *in total*, no matter how deep the tree is.',
  },
  done: {
    javascript:
      'The final height, and the number to compare against BST Insert: six sorted keys give depth 6 there and 3 here. The two algorithms have identical descent code and differ only in this fix-up, which is the cleanest available demonstration that O(log n) is a property you *maintain* rather than one you get for free.',
    python:
      'The final height. The whole AVL guarantee in one number: with n nodes the height is at most about 1.44·log2(n+2), so a million nodes are at most 21 levels deep and a search is at most 21 comparisons — against a million for the degenerate BST.',
    java: 'The final height, and a note on the fixed 64-slot arrays: they make the listing readable but cap the tree at 64 nodes, and a real implementation would size them from the input. The alternative — a growable structure — is exactly what the parallel arrays give you for free in the other three languages.',
    cpp: 'The final height. `h(root)` is a lambda call that inlines, and the empty tree returns 0 through the same expression as everything else — no special case, which is the payoff of the 0-for-empty convention and the reason this file has no "if the tree is empty" branch anywhere.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'avlRotate',
    python: 'avl_rotate',
    java: 'AvlRotate.avlRotate',
    cpp: 'avl_rotate',
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
  h: number;
}

/**
 * A linked-node AVL insert, written *recursively* and rotating by returning the
 * new subtree root — a different representation and a different fix-up strategy
 * (bottom-up, using the heights the recursive calls already returned) from the
 * iterative path-walking version under test, so agreement is a real check rather
 * than a restatement.
 */
const refHeight = (n: RefNode | null): number => (n === null ? 0 : n.h);

const refFix = (n: RefNode): number => {
  n.h = 1 + Math.max(refHeight(n.l), refHeight(n.r));
  return n.h;
};

const refRotateRight = (y: RefNode): RefNode => {
  const x = y.l as RefNode;
  y.l = x.r;
  x.r = y;
  refFix(y);
  refFix(x);
  return x;
};

const refRotateLeft = (x: RefNode): RefNode => {
  const y = x.r as RefNode;
  x.r = y.l;
  y.l = x;
  refFix(x);
  refFix(y);
  return y;
};

const refInsert = (root: RefNode | null, key: number): RefNode => {
  if (root === null) return { v: key, l: null, r: null, h: 1 };
  if (key < root.v) root.l = refInsert(root.l, key);
  else if (key > root.v) root.r = refInsert(root.r, key);
  else return root;
  refFix(root);
  const bf = refHeight(root.l) - refHeight(root.r);
  if (bf > 1) {
    const l = root.l as RefNode;
    if (key > l.v) root.l = refRotateLeft(l);
    return refRotateRight(root);
  }
  if (bf < -1) {
    const r = root.r as RefNode;
    if (key < r.v) root.r = refRotateRight(r);
    return refRotateLeft(root);
  }
  return root;
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const keys = keysOf(p);
  let root: RefNode | null = null;
  for (const k of keys) root = refInsert(root, k);
  return { presetId: p.id, args: [keys], result: root?.h ?? 0 };
});

export const avlRotateAlgo: AlgoDef<TreeFrame> = {
  id: 'avl-rotate',
  title: 'AVL Insert',
  category: 'trees',
  summary:
    'Insert as in a BST, then walk back up the same path recomputing subtree heights and rotating at most once to restore balance.',
  intuition:
    'Reach for an AVL tree — or a red-black one — the moment keys arrive in an order you do not control. The descent is identical to a plain BST and the whole difference is the repair pass, which is a handful of pointer writes per insert and buys a hard O(log n) guarantee on every future operation. The reason to pick AVL over a red-black tree is constants: AVL does fewer rotations and is faster to read, red-black does fewer *height updates* and is gentler on the cache when writes are frequent.',
  complexity: {
    best: 'O(log n)',
    average: 'O(log n)',
    worst: 'O(log n)',
    space: 'O(n)',
    note: 'Insert is a descent plus a fix-up along the same path, so O(log n) with a guaranteed worst case, and at most two rotations per insert. The height is bounded by about 1.44·log2(n+2), so a million nodes are at most 21 levels deep. Lookup and delete are the same descent, which is the point: the balance makes *all* of them fast.',
  },
  traits: {
    stable: true,
    inPlace: true,
    online: true,
    allowsDuplicates: false,
    tags: ['self-balancing', 'rotations', 'guaranteed O(log n)', 'path fix-up'],
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
  ],
  inputSpec,
  presets: PRESETS,
  run: avlRotate,
  lesson,
  expectations,
  formatResult: (r) => `height ${r as number}`,
  anchors: [
    'start',
    'descend',
    'attach',
    'update-height',
    'imbalance',
    'rotate-right',
    'rotate-left',
    'double-left-right',
    'double-right-left',
    'done',
  ],
};

export default avlRotateAlgo;
