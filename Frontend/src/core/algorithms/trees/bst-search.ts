import { byLanguage } from '../../code/anchors.ts';
import { distinctArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isKeys } from '../../input/types.ts';
import type { NodeId, TreeFrame, TreeNode } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * BST Search — the algorithm that is only as good as the tree it is given.
 *
 * Structurally this is insertion with the attachments removed: walk down,
 * compare, pick a side, repeat. The interesting part is what happens when the
 * walk *misses*, and why a miss is exactly as cheap as a hit. On a sorted array
 * a failed search costs n comparisons because nothing was ever organised to
 * throw anything away; here every comparison discards a whole subtree, so both
 * outcomes cost about log2(n) — which is only true if the tree is balanced, and
 * that is why the degenerate presets are the first thing to look at rather than
 * the last.
 *
 * Same representation as BST Insert: parallel arrays indexed by insertion
 * order, `-1` for "no child", so the four listings are the same algorithm
 * rather than four dialects of "null".
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 83;

const PRESETS: Preset[] = [
  {
    id: 'hit-middle',
    label: 'Found on the second probe',
    blurb:
      'The everyday case. Two comparisons against a six-node tree, and the second one is enough — every subtree the walk passed is now irrelevant, which is the whole reason the search is logarithmic.',
    input: { type: 'keys', values: distinctArray(SEED, 6, 10, 90) },
    params: { count: 6, target: 56 },
  },
  {
    id: 'hit-leaf',
    label: 'Found on the last probe',
    blurb:
      'The target is the deepest node in the tree, so every comparison was needed. Still log n comparisons — but now every node on the path was load-bearing, and one more level of depth is exactly one more comparison.',
    input: { type: 'keys', values: distinctArray(SEED + 4, 6, 10, 90) },
    params: { count: 6, target: 63 },
  },
  {
    id: 'miss-between',
    label: 'Not found (falls off the end)',
    blurb:
      'The target sits in a gap between two keys. The walk reaches a null child and stops — having compared three values, not six, because the tree had already thrown most of them away.',
    input: { type: 'keys', values: distinctArray(SEED + 8, 6, 10, 90) },
    params: { count: 6, target: 50 },
  },
  {
    id: 'degenerate',
    label: 'A list pretending to be a tree',
    blurb:
      'Six ascending keys make a right spine, so a search is a linear scan with extra steps — every key before the target is compared. This is the same tree shape BST Insert built, and it is why "O(log n)" is a statement about the shape, not about the data structure.',
    input: { type: 'keys', values: distinctArray(SEED + 12, 6, 10, 90).sort((a, b) => a - b) },
    params: { count: 6, target: 88 },
  },
  {
    id: 'empty',
    label: 'Empty tree',
    blurb:
      'No nodes at all, so there is no root to compare against and the search fails immediately — zero comparisons. An empty structure is not a special case here; it is a null child that happens to be the root.',
    input: { type: 'keys', values: [] },
    params: { count: 0, target: 40 },
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

/** Build the tree without narrating it: for the search modules it is the input. */
function build(keys: number[]): { slots: Slot[]; root: number } {
  const slots: Slot[] = [];
  let root = -1;
  for (const key of keys) {
    if (root === -1) {
      slots.push({ value: key, left: -1, right: -1, parent: -1, side: 'root', depth: 0 });
      root = 0;
      continue;
    }
    let cur = root;
    for (;;) {
      const here = slots[cur] as Slot;
      if (key === here.value) break;
      if (key < here.value) {
        if (here.left === -1) {
          here.left = slots.length;
          slots.push({
            value: key,
            left: -1,
            right: -1,
            parent: cur,
            side: 'left',
            depth: here.depth + 1,
          });
          break;
        }
        cur = here.left;
      } else {
        if (here.right === -1) {
          here.right = slots.length;
          slots.push({
            value: key,
            left: -1,
            right: -1,
            parent: cur,
            side: 'right',
            depth: here.depth + 1,
          });
          break;
        }
        cur = here.right;
      }
    }
  }
  return { slots, root };
}

export function* bstSearch(ctx: RunContext): Generator<TreeFrame> {
  const raw = isKeys(ctx.input) ? ctx.input.values.map((v) => Number(v)) : [];
  const wanted = Math.max(0, Math.min(12, Math.trunc(Number(ctx.params.count ?? 6))));
  const keys = raw.slice(0, wanted);
  const target = Math.trunc(Number(ctx.params.target ?? 0));

  const { slots, root } = build(keys);
  const path: NodeId[] = [];
  let ops = 0;

  const snapshot = (): Record<NodeId, TreeNode> => {
    const out: Record<NodeId, TreeNode> = {};
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i] as Slot;
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
    result?: NodeId | null,
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
    ...(result !== undefined ? { result } : {}),
  });

  let foundIdx = -1;
  let cur = root;
  path.length = 0;

  yield frame(
    'start',
    root === -1
      ? `The tree is empty, so there is no root to compare ${target} against. The search ends before it starts, for zero comparisons — the cheapest possible miss.`
      : `A tree built from ${keys.length} key${keys.length === 1 ? '' : 's'} in the order given, and a target of ${target}. The walk starts at the root and each comparison discards a whole subtree, so this should take about log2(${keys.length + 1}) comparisons.`,
    {},
    { target, nodes: slots.length, depth: 0, ops },
  );

  while (cur !== -1) {
    if (ctx.shouldStop()) return;
    ops++;
    const here = slots[cur] as Slot;
    path.push(id(cur));
    const verdict = target < here.value ? 'smaller' : target > here.value ? 'larger' : 'equal';

    if (verdict === 'equal') {
      foundIdx = cur;
      yield frame(
        'found',
        `${target} is exactly the key stored at this node, so the search is over. ${ops} comparison${ops === 1 ? '' : 's'} — and the other ${slots.length - 1} keys were never looked at.`,
        { answer: [id(cur)], path: [...path] },
        { target, at: here.value, depth: path.length, ops },
        id(cur),
      );
      break;
    }

    yield frame(
      'compare',
      `${target} is ${verdict} than ${here.value}, so it cannot be in this node's subtree. The key itself is not present, and neither is anything in the direction we are about to abandon.`,
      { compare: [id(cur)], path: [...path] },
      { target, at: here.value, depth: path.length, ops },
    );

    if (verdict === 'smaller') {
      const next = here.left;
      if (next === -1) break;
      yield frame(
        'go-left',
        `Go left. ${(slots[next] as Slot).value} is the next node to compare against, and everything in its right subtree is now known not to contain ${target} — the discard is free and total.`,
        { current: [id(next)], path: [...path] },
        { target, at: (slots[next] as Slot).value, depth: path.length, ops },
      );
      cur = next;
    } else {
      const next = here.right;
      if (next === -1) break;
      yield frame(
        'go-right',
        `Go right. ${(slots[next] as Slot).value} is the next node to compare against, and this node plus its whole left subtree are behind us.`,
        { current: [id(next)], path: [...path] },
        { target, at: (slots[next] as Slot).value, depth: path.length, ops },
      );
      cur = next;
    }
  }

  path.length = 0;
  const found = foundIdx >= 0;

  yield frame(
    found ? 'found' : 'not-found',
    found
      ? `Found: ${target} is at the node the walk ended on, after ${ops} comparison${ops === 1 ? '' : 's'}. The path is root to that node and nothing longer, which is why the answer took so few comparisons.`
      : `No node held ${target}. The walk reached an empty child slot, which is the only way a BST search can fail — there is no "I looked everywhere" step, because the tree has already proved the absence at every step. -1 is the not-found answer, and a caller that forgets to check it will happily index an array at -1.`,
    found ? { answer: [id(foundIdx)] } : {},
    { target, comparisons: ops, result: found ? target : -1, ops },
    found ? id(foundIdx) : null,
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

const PARALLEL = `// Nodes are parallel arrays indexed by insertion order, so a child is an int and
// -1 is "no child" in all four languages (undefined / None / null / nullptr would
// each be a different spelling of the same idea).`;

const JS = `${PARALLEL}
function bstSearch(keys, target) {
  const value = [], left = [], right = [], depth = [];        // @anchor start
  let root = -1;
  for (const key of keys) {
    if (root === -1) {
      value.push(key); left.push(-1); right.push(-1); depth.push(0);
      root = 0;
      continue;
    }
    let cur = root;
    for (;;) {
      if (key === value[cur]) break;
      if (key < value[cur]) {
        if (left[cur] === -1) {
          left[cur] = value.length;
          value.push(key); left.push(-1); right.push(-1); depth.push(depth[cur] + 1);
          break;
        }
        cur = left[cur];
      } else {
        if (right[cur] === -1) {
          right[cur] = value.length;
          value.push(key); left.push(-1); right.push(-1); depth.push(depth[cur] + 1);
          break;
        }
        cur = right[cur];
      }
    }
  }
  let cur = root;                                             // @anchor compare
  while (cur !== -1) {
    if (target === value[cur]) return value[cur];             // @anchor found
    if (target < value[cur]) cur = left[cur];                 // @anchor go-left
    else cur = right[cur];                                    // @anchor go-right
  }
  return -1;                                                  // @anchor not-found
}`;

const PY = `${PARALLEL.replace(/\/\//g, '#')}
def bst_search(keys, target):
    value, left, right, depth = [], [], [], []                  # @anchor start
    root = -1
    for key in keys:
        if root == -1:
            value.append(key); left.append(-1); right.append(-1); depth.append(0)
            root = 0
            continue
        cur = root
        while True:
            if key == value[cur]:
                break
            if key < value[cur]:
                if left[cur] == -1:
                    left[cur] = len(value)
                    value.append(key); left.append(-1); right.append(-1)
                    depth.append(depth[cur] + 1)
                    break
                cur = left[cur]
            else:
                if right[cur] == -1:
                    right[cur] = len(value)
                    value.append(key); left.append(-1); right.append(-1)
                    depth.append(depth[cur] + 1)
                    break
                cur = right[cur]
    cur = root                                                  # @anchor compare
    while cur != -1:
        if target == value[cur]:                                # @anchor found
            return value[cur]
        if target < value[cur]:
            cur = left[cur]                                     # @anchor go-left
        else:
            cur = right[cur]                                    # @anchor go-right
    return -1                                                   # @anchor not-found`;

const JAVA = `${PARALLEL}
class BstSearch {
    static int bstSearch(int[] keys, int target) {
        int n = keys.length;
        int[] value = new int[n], left = new int[n], right = new int[n], depth = new int[n];  // @anchor start
        java.util.Arrays.fill(left, -1);
        java.util.Arrays.fill(right, -1);
        int size = 0, root = -1;
        for (int k = 0; k < n; k++) {
            int key = keys[k];
            if (root == -1) { value[0] = key; depth[0] = 0; size = 1; root = 0; continue; }
            int cur = root;
            for (;;) {
                if (key == value[cur]) break;
                if (key < value[cur]) {
                    if (left[cur] == -1) {
                        left[cur] = size; value[size] = key;
                        depth[size] = depth[cur] + 1; size++;
                        break;
                    }
                    cur = left[cur];
                } else {
                    if (right[cur] == -1) {
                        right[cur] = size; value[size] = key;
                        depth[size] = depth[cur] + 1; size++;
                        break;
                    }
                    cur = right[cur];
                }
            }
        }
        int cur = root;                                         // @anchor compare
        while (cur != -1) {
            if (target == value[cur]) return value[cur];        // @anchor found
            if (target < value[cur]) cur = left[cur];            // @anchor go-left
            else cur = right[cur];                               // @anchor go-right
        }
        return -1;                                              // @anchor not-found
    }
}`;

const CPP = `${PARALLEL}
#include <vector>
using std::vector;

int bst_search(vector<int> keys, int target) {
    vector<int> value, left, right, depth;                     // @anchor start
    int root = -1;
    for (int key : keys) {
        if (root == -1) {
            value.push_back(key); left.push_back(-1);
            right.push_back(-1); depth.push_back(0);
            root = 0;
            continue;
        }
        int cur = root;
        for (;;) {
            if (key == value[cur]) break;
            if (key < value[cur]) {
                if (left[cur] == -1) {
                    left[cur] = (int)value.size();
                    value.push_back(key); left.push_back(-1); right.push_back(-1);
                    depth.push_back(depth[cur] + 1);
                    break;
                }
                cur = left[cur];
            } else {
                if (right[cur] == -1) {
                    right[cur] = (int)value.size();
                    value.push_back(key); left.push_back(-1); right.push_back(-1);
                    depth.push_back(depth[cur] + 1);
                    break;
                }
                cur = right[cur];
            }
        }
    }
    int cur = root;                                             // @anchor compare
    while (cur != -1) {
        if (target == value[cur]) return value[cur];            // @anchor found
        if (target < value[cur]) cur = left[cur];               // @anchor go-left
        else cur = right[cur];                                  // @anchor go-right
    }
    return -1;                                                  // @anchor not-found
}`;

const NOTES = {
  start: {
    javascript:
      'The build phase — the same algorithm as BST Insert, kept here so the function is self-contained. The four parallel arrays are the whole representation: a child is an `int` index, and `-1` is the null. With objects instead, "no child" would be `undefined` here and `None`, `null` and `nullptr` elsewhere, and four listings of "the same" tree would stop being the same tree.',
    python:
      'The build phase, identical to BST Insert. `depth` is recorded on the way in so the animation can draw a spine without a traversal — the search itself never reads it, which is worth knowing: a production BST would not store depths at all and would recompute them on demand, because a field that exists only for drawing is a field that can go stale.',
    java: 'The build phase, identical to BST Insert, and the reason this class is twenty lines longer than the algorithm needs. The two `Arrays.fill` calls are the Java-specific hazard: a fresh int[] is zero-filled and `0` is a valid child index, so without them the second key inserted would be attached to the first node twice.',
    cpp: 'The build phase, identical to BST Insert. The vectors grow as they go, so there is no `size` counter here and no `Arrays.fill` equivalent — the only structural difference from the Java version, and the reason this listing reads more cleanly than the one above it.',
  },
  compare: {
    javascript:
      'The search proper, and the invariant that makes it logarithmic: the tree is ordered, so one comparison eliminates an entire subtree rather than one element. That is the difference from a linear scan and it holds for *misses* too — the same argument that proves a miss is cheap is the one that proves it is correct.',
    python:
      'The search proper, and the invariant that makes it logarithmic: the tree is ordered, so one comparison eliminates an entire subtree. `while cur != -1` rather than a recursive helper — the walk is iterative in all four listings, so the depth of the tree costs heap and not the call stack, which is what lets this handle a degenerate tree without blowing up.',
    java: 'The search proper. `cur` is a plain int, so the loop is pointer-chasing through four arrays with no object headers and no null checks — the fastest of the four versions, and for exactly the reason that the representation is uglier. A `TreeMap` in the JDK does the same walk with `Node` objects and pays for them in cache misses.',
    cpp: 'The search proper, with `cur` as an index into the vectors. Every step is a bounds-checked read, so in a sanitiser build this is where a corrupted index would be caught — which is the one genuine advantage of index-keyed nodes over raw pointers, where the same bug is a segfault with no diagnostic.',
  },
  found: {
    javascript:
      'The hit. It returns `value[cur]` rather than the index, which is the right default for a search API and the wrong one for "delete this key" — the same walk cannot serve both, which is why a real container exposes `indexOf`, `get` and `remove` as three methods over one private walk.',
    python:
      'The hit, returning the value rather than the index. Python would raise KeyError on a miss in a dict-based version, which is the nicer failure mode; here the miss is a `-1` return like every other language, and the caller has to remember to check it.',
    java: 'The hit. A `Map.get`-shaped API would return `null` for a miss, and this returns `-1` — which is indistinguishable from a legitimate value of -1, and is the reason the parallel-array representation picked a *child* sentinel of -1 but a *found* sentinel that has to be documented.',
    cpp: 'The hit. `std::optional<int>` would say "no value" in the type system instead of in a comment, and the whole `-1` convention — used three times in this file, for no-child and for not-found — would collapse to one concept with a name. That is the single biggest readability win available in this listing and it costs one include.',
  },
  'go-left': {
    javascript:
      'Left, because the target is smaller than this node — and the whole subtree hanging off that left child is smaller still, so the entire branch is discarded without being read. `left[cur]` can be -1, and the loop condition is what turns that into a miss rather than a crash.',
    python:
      "Left, discarding everything in the left subtree of the node we just passed. Assigning `cur = left[cur]` with no existence check is safe *only* because -1 fails the loop condition — a Python `None` here would raise on the next comparison, which is the trade for using an integer sentinel instead of the language's own null.",
    java: 'Left, with no null check, because -1 fails `cur != -1`. That is the payoff of an integer sentinel: there is exactly one "not a node" value and it is tested with a comparison rather than with a type check. The cost is that -1 is now doing double duty in this file, as both "no child" and "not found".',
    cpp: 'Left, and the assignment is the whole step. Nothing is freed and nothing is rewritten — a search in an array-backed tree touches memory but never mutates it, which is why a `const` version of this function is a two-word change and a `Node`-pointer version is not.',
  },
  'go-right': {
    javascript:
      'Right, the mirror of the left step, and it is the only remaining option: the target is not equal to this node and not smaller, so it must be larger. Three outcomes, two branches — which is the tightest possible search loop, and also why a BST cannot store a key equal to the one it is standing on.',
    python:
      'Right, the mirror of the left step. Two comparisons per level at worst, so the cost is 2·log2(n) rather than log2(n) — the constant that makes a BST search competitive with binary search on an array, and the reason nobody bothers with a BST when the data is already an array.',
    java: 'Right, the mirror of the left step. The loop is a textbook `while (cur != -1)` with one return, and the whole search is four lines of real code; everything above it is the build. A `TreeMap.floorKey` would be the same walk with a different ending, which is a good way to see that these are one algorithm wearing different clothes.',
    cpp: 'Right, the mirror of the left step. Notice that no comparison count is kept anywhere — the cost of a BST search is inferred from the height, not measured. If you need the comparison count (and a real profiler does), you have to count it explicitly, because the tree has no idea how long it has been walked.',
  },
  'not-found': {
    javascript:
      'The miss, and the only way one can happen: the walk reached an empty child slot. There is no final "did I check everything" pass, because at every step the tree proved the absence for a whole subtree. `-1` is therefore a documented contract, not a defensive value — and the fact that it collides with a legitimate key of -1 is the argument for `null`.',
    python:
      'The miss: the loop condition failed, so `cur` is -1 and there is nothing left to compare against. A Python dict would have raised KeyError here instead, which is strictly better for debugging — an explicit exception beats a sentinel that a caller might forget, and that is the main reason the four languages do not agree on how to spell "absent".',
    java: 'The miss. An `OptionalInt` return would move the check into the type system; `-1` moves it into a comment. Worth knowing when reading a Java BST: because the sentinel is a legal key value, a tree that genuinely stores -1 has an ambiguous `get`, and fixing that means changing the contract, not the algorithm.',
    cpp: 'The miss. A BST search that fails has still done O(log n) work, which is the property that makes this structure worth using for lookups — a linear scan would have read every key. The `-1` is the same sentinel as the child links, so a reader has to notice which meaning applies; `std::optional` would have made that ambiguity impossible.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'bstSearch',
    python: 'bst_search',
    java: 'BstSearch.bstSearch',
    cpp: 'bst_search',
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
 * Search by building a sorted copy and binary searching it — a completely
 * different data structure reaching the same verdict, so agreement is a real
 * check rather than a restatement of the walk.
 */
const viaSortedCopy = (keys: number[], target: number): number => {
  const sorted = [...new Set(keys)].sort((a, b) => a - b);
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = sorted[mid] as number;
    if (v === target) return v;
    if (v < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const keys = keysOf(p);
  const target = Number(p.params?.target ?? 0);
  return { presetId: p.id, args: [keys, target], result: viaSortedCopy(keys, target) };
});

export const bstSearchAlgo: AlgoDef<TreeFrame> = {
  id: 'bst-search',
  title: 'BST Search',
  category: 'trees',
  summary:
    'Walk down from the root, comparing at each node and discarding the subtree the target cannot be in.',
  intuition:
    'Reach for a BST when the data is not an array but you still need ordered access *and* fast lookup — a symbol table, a priority queue, anything that wants "find the next larger key" without scanning. The precondition is the shape, not the interface: an unbalanced tree gives you linear search with a fancier data structure, so if you cannot control insertion order you want a self-balancing tree, and if your data is already a sorted array, binary search beats this on both time and memory.',
  complexity: {
    best: 'O(1)',
    average: 'O(log n)',
    worst: 'O(n)',
    space: 'O(n)',
    note: 'Best case is a lucky probe at the root. The worst case is the degenerate tree, where search degrades to a linear scan — the same tree BST Insert builds from sorted input, which is why that preset is the one to look at first.',
  },
  traits: {
    stable: true,
    inPlace: false,
    online: true,
    allowsDuplicates: false,
    tags: ['ordered', 'O(log n) average', 'O(n) worst case', 'pointer chasing'],
  },
  viewport: 'tree',
  level: 'intro',
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
      key: 'target',
      label: 'Key to find',
      kind: 'number',
      min: 0,
      max: 200,
      step: 1,
      default: 45,
      help: 'Change it and the search restarts from the root.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: bstSearch,
  lesson,
  expectations,
  formatResult: (r) => ((r as number) < 0 ? 'not found (-1)' : `found ${r as number}`),
  anchors: ['start', 'compare', 'found', 'go-left', 'go-right', 'not-found'],
};

export default bstSearchAlgo;
