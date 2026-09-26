import { describe, expect, it } from 'vitest';
import { runEveryPreset, runTrace } from '../../trace/materialise.ts';
import type { TreeFrame } from '../../trace/types.ts';
import type { Preset } from '../types.ts';
import { treeHeightAlgo } from './tree-height.ts';

/**
 * Golden-trace depth for the tree height / balance checker.
 *
 * The module was written but never registered, so — like `avl-rotate` — it had
 * no coverage at all until now: no contract run, no 4-language parity, no test.
 * The checks below are chosen for what a recursive tree walk can plausibly get
 * wrong, and for the one property that is genuinely worth pinning as a formula.
 */

const preset = (id: string): Preset => {
  const p = treeHeightAlgo.presets.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const run = (id: string) =>
  runTrace(treeHeightAlgo, { input: preset(id).input, presetParams: preset(id).params }).trace;

const last = (id: string): TreeFrame => {
  const f = run(id).at(-1);
  if (!f) throw new Error(`preset ${id} produced no frames`);
  return f;
};

/**
 * Children of every node, derived from the frame's edge list.
 *
 * A `TreeFrame` stores nodes flat with `parent` and `side`, not with `left` and
 * `right` fields. That is deliberate — the same structure can then be rendered as
 * a tree or as a heap's implicit array, and the frame data is identical either
 * way — but it means a helper that reaches for `node.left` silently sees `null`
 * for both children and reports a height of 1 for every tree. TypeScript catches
 * it; a test run alone does not, because Vitest strips types without checking.
 */
function childrenOf(
  frame: TreeFrame,
): Map<string | null, { left: string | null; right: string | null }> {
  const map = new Map<string | null, { left: string | null; right: string | null }>();
  const slot = (id: string | null) => {
    let entry = map.get(id);
    if (!entry) {
      entry = { left: null, right: null };
      map.set(id, entry);
    }
    return entry;
  };
  slot(frame.root);
  for (const node of Object.values(frame.nodes)) {
    const entry = slot(node.parent);
    if (node.side === 'left') entry.left = node.id;
    else if (node.side === 'right') entry.right = node.id;
  }
  return map;
}

function heightOf(frame: TreeFrame, id: string | null): number {
  if (id === null) return 0;
  const kids = childrenOf(frame);
  const seen = new Set<string>();
  const walk = (cur: string | null): number => {
    if (cur === null || seen.has(cur)) return 0;
    seen.add(cur);
    const k = kids.get(cur);
    return 1 + Math.max(walk(k?.left ?? null), walk(k?.right ?? null));
  };
  return walk(id);
}

/** Every node whose two subtree heights differ by more than one. */
function lopsidedIn(frame: TreeFrame): string[] {
  const kids = childrenOf(frame);
  const bad: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string | null): number => {
    if (id === null || seen.has(id)) return 0;
    seen.add(id);
    const k = kids.get(id);
    const l = walk(k?.left ?? null);
    const r = walk(k?.right ?? null);
    if (Math.abs(l - r) > 1) bad.push(id);
    return 1 + Math.max(l, r);
  };
  walk(frame.root);
  return bad;
}

describe('tree height and balance', () => {
  it('produces a structurally valid trace on every preset', () => {
    for (const { presetId, result } of runEveryPreset(treeHeightAlgo)) {
      expect(result.trace.length, `preset ${presetId}`).toBeGreaterThan(0);
      expect(result.truncated, `preset ${presetId}`).toBe(false);
      expect(result.error, `preset ${presetId}`).toBeUndefined();
    }
  });

  it('reports the height of the tree it was given', () => {
    // Hand-checkable values, one per shape class.
    expect(last('empty').vars?.['height'], 'empty').toBe(0);
    expect(last('single').vars?.['height'], 'single node').toBe(1);
    // 7 nodes arranged perfectly: 1 + 2 + 4, so three levels.
    expect(last('perfect').vars?.['height'], 'perfect tree of 7').toBe(3);
    // A degenerate right spine of 6 has one node per level, so height 6 — the
    // case that makes the O(n) cost and the O(log n) depth worth teaching.
    expect(last('ascending').vars?.['height'], 'degenerate spine').toBe(6);
    expect(last('descending').vars?.['height'], 'degenerate spine, mirrored').toBe(6);
  });

  it('agrees with an independent height computation on every preset', () => {
    // The reported number is checked against a second implementation that walks
    // the frame, so a bug in the walk and a bug in the summary cannot both be
    // wrong in the same direction without this failing.
    for (const p of treeHeightAlgo.presets) {
      expect(last(p.id).vars?.['height'], `preset ${p.id}`).toBe(
        heightOf(last(p.id), last(p.id).root),
      );
    }
  });

  it('calls a tree balanced exactly when no node is off by more than one', () => {
    // The two reported facts must not be able to disagree. `balanced` is the
    // claim the student reads; `lopsided` is the evidence behind it.
    for (const p of treeHeightAlgo.presets) {
      const frame = last(p.id);
      const actual = lopsidedIn(frame);
      expect(actual.length, `preset ${p.id}: lopsided count`).toBe(frame.vars?.['lopsided']);
      expect(frame.vars?.['balanced'], `preset ${p.id}: balanced flag`).toBe(actual.length === 0);
    }
  });

  it('finds the imbalance in a spine and not in a balanced tree', () => {
    expect(last('ascending').vars?.['balanced']).toBe(false);
    expect(Number(last('ascending').vars?.['lopsided'])).toBeGreaterThan(0);
    for (const id of ['balanced', 'perfect', 'single', 'empty']) {
      expect(last(id).vars?.['balanced'], `preset ${id}`).toBe(true);
      expect(last(id).vars?.['lopsided'], `preset ${id}`).toBe(0);
    }
  });

  it('visits every node once on the way down and once on the way up', () => {
    /*
     * `ops` is the count the narration uses to justify the O(n) claim, and it has
     * a closed form: 2n + 1 visits for n nodes — n descents plus n returns plus
     * the call that returns the answer. The interesting part is that it does
     * *not* depend on the shape. A 6-node spine and a 6-node balanced tree cost
     * the same 13, which is precisely why the walk is O(n) even though the
     * recursion is as deep as the tree.
     */
    for (const p of treeHeightAlgo.presets) {
      const nodes = Number(last(p.id).vars?.['nodes']);
      expect(last(p.id).vars?.['ops'], `preset ${p.id}`).toBe(2 * nodes + 1);
    }
    // Same node count, wildly different shape, identical cost.
    expect(last('ascending').vars?.['ops']).toBe(last('balanced').vars?.['ops']);
  });

  it('describes the null base case as height zero rather than crashing', () => {
    // A recursive walk's most common defect is indexing an absent node. The
    // empty preset must reach `done` through `null` and report 0.
    const empty = run('empty');
    expect(empty.some((f) => f.anchor === 'null')).toBe(true);
    expect(last('empty').vars?.['nodes']).toBe(0);
  });

  it('visits both children of an interior node', () => {
    // Guards the classic one-child-only walk bug: reporting the height of the
    // left spine while ignoring the right.
    const balanced = run('balanced');
    expect(balanced.filter((f) => f.anchor === 'descend-left').length).toBeGreaterThan(0);
    expect(balanced.filter((f) => f.anchor === 'descend-right').length).toBeGreaterThan(0);
  });

  it('pins the narration for the ascending preset', () => {
    // A golden narration snapshot. If this changes, the *teaching* changed, not
    // just the implementation — which is exactly the kind of diff a reviewer
    // wants to see rather than absorb.
    expect(
      run('ascending')
        .slice(0, 5)
        .map((f) => f.note),
    ).toMatchInlineSnapshot(`
      [
        "A tree of 6 keys, and a post-order walk: both subtrees first, then the node. Heights are labelled hN under each box as they are computed, and nothing is labelled before it is known — which is the difference between this traversal and the in-order one.",
        "First call, on the root 16. Nothing can be said about this node yet: its height is 1 + the larger of two heights that do not exist, so the walk has to go and get them.",
        "The left slot is empty, and an empty subtree has height 0 by definition. Returning 0 rather than recursing is what makes the leaf case fall out of the same formula as every other node — no special case for leaves anywhere below.",
        "Descending into the right child 20, pushing another frame. This is post-order doing its work — no value is produced on the way *down*, only on the way back up, which is why the spine here is exactly the same shape as an in-order walk's and the two produce completely different things.",
        "The left slot is empty, and an empty subtree has height 0 by definition. Returning 0 rather than recursing is what makes the leaf case fall out of the same formula as every other node — no special case for leaves anywhere below.",
      ]
    `);
  });
});
