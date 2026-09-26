import { describe, expect, it } from 'vitest';
import { runEveryPreset, runTrace } from '../../trace/materialise.ts';
import type { TreeFrame } from '../../trace/types.ts';
import type { Preset } from '../types.ts';
import { avlRotateAlgo } from './avl-rotate.ts';

/**
 * Golden-trace depth for the AVL rotation visualiser, on top of the shared
 * contract suite and the 4-language parity run.
 *
 * This module sat unregistered — and therefore entirely untested — while its
 * 1,093 lines were built into a lazy chunk on every build and never loaded. So
 * the first question these tests answer is not "is the narration right" but "does
 * it do the thing at all". The narration snapshot comes last, once the structural
 * claims are already established, because a snapshot alone would happily pin a
 * wrong answer.
 */

const preset = (id: string): Preset => {
  const p = avlRotateAlgo.presets.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const run = (id: string) =>
  runTrace(avlRotateAlgo, { input: preset(id).input, presetParams: preset(id).params }).trace;

const last = (id: string): TreeFrame => {
  const f = run(id).at(-1);
  if (!f) throw new Error(`preset ${id} produced no frames`);
  return f;
};

/** In-order walk of the tree as the frame actually presents it. */
function inOrder(frame: TreeFrame): number[] {
  const kids = childrenOf(frame);
  const out: number[] = [];
  const seen = new Set<string>();
  const walk = (id: string | null): void => {
    if (id === null || seen.has(id) || !frame.nodes[id]) return;
    seen.add(id);
    walk(kids.get(id)?.left ?? null);
    out.push(Number(frame.nodes[id]?.value));
    walk(kids.get(id)?.right ?? null);
  };
  walk(frame.root);
  return out;
}

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

const countOf = (id: string, anchor: string): number =>
  run(id).filter((f) => f.anchor === anchor).length;

describe('AVL rotation', () => {
  it('produces a structurally valid trace on every preset', () => {
    for (const { presetId, result } of runEveryPreset(avlRotateAlgo)) {
      expect(result.trace.length, `preset ${presetId}`).toBeGreaterThan(0);
      expect(result.truncated, `preset ${presetId}`).toBe(false);
      expect(result.error, `preset ${presetId}`).toBeUndefined();
    }
  });

  it('leaves every tree balanced', () => {
    // The entire point of the algorithm. If this ever fails, the narration
    // claiming a rebalance is a lie.
    for (const p of avlRotateAlgo.presets) {
      expect(last(p.id).vars?.['balanced'], `preset ${p.id}`).toBe(true);
      expect(lopsidedIn(last(p.id)), `preset ${p.id}: nodes off by more than 1`).toEqual([]);
    }
  });

  it('preserves the sorted order through every rotation', () => {
    /*
     * The defining property of a rotation, and the one a buggy implementation
     * breaks first: it moves nodes *and their subtrees* around, and a mistake in
     * which subtree follows which child turns a balanced tree into one that has
     * silently lost or duplicated values. In-order being sorted at the end of
     * every frame catches that at the exact frame it happened.
     */
    for (const p of avlRotateAlgo.presets) {
      for (const frame of run(p.id)) {
        const order = inOrder(frame);
        if (order.length === 0) continue;
        // Compare numerically only when every value is a number; `bst-insert`
        // style string keys would need a different comparator.
        const sorted = order.every((v) => typeof v === 'number');
        if (sorted) {
          expect(order, `${p.id} @${frame.index}`).toEqual([...order].sort((a, b) => a - b));
        }
      }
    }
  });

  it('rotates exactly as many times as the shape demands', () => {
    /*
     * Rotation count is a property of the *insertion order*, not of the values,
     * so these numbers are exact and any change to them is a real behavioural
     * change rather than a cosmetic one.
     *
     * They are also the numbers a textbook would predict, which is the point of
     * pinning them:
     *   - 3 keys inserted left-to-right: the third insert tips the root, one LL
     *     or RR rotation repairs it.
     *   - 3 keys inserted zig-zag: one double rotation, which the trace shows as
     *     a pair of single rotations around the pivot.
     *   - 6 keys ascending: rotations at key 3, and two at key 5. Total 3.
     */
    const EXPECTED: Record<string, number> = {
      'single-left': 1,
      'single-right': 1,
      'double-left-right': 1,
      'double-right-left': 1,
      ascending: 3,
      descending: 3,
      single: 0,
      empty: 0,
    };
    for (const [id, rotations] of Object.entries(EXPECTED)) {
      expect(last(id).vars?.['rotations'], `preset ${id}`).toBe(rotations);
    }
  });

  it('reports a height that matches the tree it drew', () => {
    // `vars.height` and the rendered tree are two claims about the same thing. The
    // reported height was right while the drawing lost half its nodes, so
    // checking one against the other is the check that would have caught it.
    for (const p of avlRotateAlgo.presets) {
      expect(last(p.id).vars?.['height'], `preset ${p.id}`).toBe(
        heightOf(last(p.id), last(p.id).root),
      );
    }
  });

  it('keeps the tree height minimal for the key count', () => {
    // 6 keys in an AVL tree is height 3, not 4 and not 2. Height 4 means a
    // rotation was missed; height 2 would mean the tree is better balanced than
    // the insertion order allows, which is not possible for a pure insert-only
    // AVL tree.
    expect(last('ascending').vars?.['height']).toBe(3);
    expect(last('descending').vars?.['height']).toBe(3);
    expect(last('single').vars?.['height']).toBe(1);
    expect(last('empty').vars?.['height']).toBe(0);
  });

  it('rebalances rather than merely reporting a tilt', () => {
    // `rotate-right` / `rotate-left` and the two double cases must each actually
    // appear in the trace, and a rotation frame must be followed by one that
    // reports the tree balanced again. Otherwise the algorithm detects the
    // imbalance and then does nothing about it.
    for (const id of ['single-left', 'single-right', 'double-left-right', 'double-right-left']) {
      const frames = run(id);
      const rotated = frames.some(
        (f) => f.anchor.startsWith('rotate') || f.anchor.startsWith('double-'),
      );
      expect(rotated, `${id}: no rotation frame`).toBe(true);
      expect(frames.at(-1)?.vars?.['balanced'], `${id}: never rebalanced`).toBe(true);
    }
  });

  it('emits a rotation anchor for every counted rotation', () => {
    // Ties the `rotations` variable to the frames that justify it, so the count
    // cannot drift away from the trace.
    for (const id of ['single-left', 'double-left-right', 'ascending']) {
      const rotationFrames = run(id).filter(
        (f) => f.anchor.startsWith('rotate') || f.anchor.startsWith('double-'),
      ).length;
      const rotations = last(id).vars?.['rotations'];
      expect(typeof rotations).toBe('number');
      // A double rotation is reported as one rotation but drawn as two steps, so
      // frames >= rotations, and strictly more whenever a double case is present.
      expect(rotationFrames).toBeGreaterThanOrEqual(Number(rotations));
    }
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
        "An empty AVL tree and 6 keys. Each insert walks down as in a plain BST, then walks *back up* the same path recomputing subtree heights and rotating at most once. The hN under each node is its subtree height: 0 for empty, 1 for a leaf.",
        "The first key, 22, becomes the root with height 1 and no children. There is no parent to walk back to, so the fix-up phase is skipped entirely — the very first insert in an AVL tree is always trivially balanced.",
        "32 is larger than 22, and the right slot is empty — so this is the last node on the path and the new key hangs here. Path length 1, and every one of those nodes is about to be visited again on the way back up.",
        "The right slot of 22 was empty, so 32 goes in with height 1. The BST part of an AVL insert is now finished and the tree is a *valid BST that is not yet balanced* — the fix-up below is what makes it an AVL tree, and this frame is the one moment where that is true.",
        "Back up to 22: its subtree is a left child of height 0 and a right child of height 1, so its own height is 1 + 1 = 2. Recomputing heights on the way up is the only new bookkeeping an AVL tree does — one comparison and a max per level.",
      ]
    `);
  });

  it('handles the empty and single-node trees without ceremony', () => {
    // The degenerate inputs are where a tree algorithm usually indexes undefined.
    expect(last('empty').vars?.['nodes']).toBe(0);
    expect(last('empty').root).toBeNull();
    expect(last('single').vars?.['nodes']).toBe(1);
    expect(countOf('empty', 'descend')).toBe(0);
  });
});
