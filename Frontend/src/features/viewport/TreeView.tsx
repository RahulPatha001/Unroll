import { memo, useMemo } from 'react';
import type { TreeFrame, TreeNode } from '../../core/trace/types.ts';
import { resolveStyle, styleForKey } from './palette.ts';

/**
 * Tidy tree layout, by depth. ~40 lines, and deliberately not a dependency.
 *
 * Graphviz would give prettier output and cost more than it saves: the layout
 * here is a plain in-order sweep per level, which is exactly what BSTs, heaps
 * and traversal demos need, and — critically — it is *stable*. The same tree
 * always produces the same coordinates, so a node does not jump when an
 * unrelated node is inserted. Visual continuity is the product.
 */

const NODE_W = 44;
const NODE_H = 30;
const LEVEL_GAP = 74;
const MARGIN = 40;

/*
 * Fit-to-box.
 *
 * This drawing used to be `<svg width={width} height={height} className="m-auto
 * max-h-full max-w-full">`, and `max-*` is a ceiling, not a target. A
 * three-node AVL tree laid out at 168x144 units drew at 168x144 in the middle
 * of a 1046px panel — measured, a sixth of its width and a fifth of its height,
 * and the height was the *good* case. The layout above works in its own units
 * and knows nothing about the panel, so the fix is to let the browser do the
 * fitting: a `viewBox` plus `xMidYMid meet` scales the drawing, its strokes and
 * its text together, which is what a diagram wants and what a CSS
 * `transform: scale()` on a wrapper would not.
 *
 * Three things in here are decisions rather than arithmetic:
 *
 *  - **The zoom is capped.** Uncapped, fitting is a zoom control with no stop:
 *    168x144 into 1046x724 is a 5x blow-up, and a 12px node label becomes 60px.
 *    Past roughly this cap the labels stop describing the tree and start
 *    competing with it. It also buys nothing, because what is still unused once
 *    a diagram is this large is the *aspect-ratio* slack — a five-deep chain is
 *    124x440 and cannot fill a landscape box without being cropped, which no
 *    amount of zooming recovers.
 *
 *  - **The cap is expressed in CSS, not in a measurement.** The element is sized
 *    `100%` of its box and clamped to `natural size x cap`, so the browser's own
 *    fit provably cannot exceed the cap. That is what makes it free: a window
 *    resize re-fits with no `ResizeObserver`, no subscription and no re-render,
 *    and a component that re-renders 60x a second during playback adds nothing
 *    to that. It also keeps the module free of `window`, so it still imports in
 *    Node.
 *
 *  - **The viewBox is the layout box plus a hair of slack.** Arrowheads and the
 *    `[i]` caption sit just outside the last node, and `overflow-visible` is
 *    kept because that is what stops them being clipped — which also means
 *    anything drawn outside the viewBox escapes the box the scroll container
 *    was given. The layout's own 40-unit margin does the real work here; four
 *    more is slack on top of it, and no more, because every unit of padding is a
 *    unit the fit has to divide by.
 */
const PAD = 4;
const MAX_ZOOM = 2.5;

interface Placed {
  node: TreeNode;
  x: number;
  y: number;
}

function layout(
  nodes: Record<string, TreeNode>,
  root: string | null,
  arrayIndex: Record<string, number> | undefined,
): { placed: Placed[]; width: number; height: number } {
  if (!root || !nodes[root]) return { placed: [], width: 100, height: 100 };

  const childrenOf = new Map<string, string[]>();
  let maxDepth = 0;
  for (const n of Object.values(nodes)) {
    maxDepth = Math.max(maxDepth, n.depth);
    if (n.parent) {
      const list = childrenOf.get(n.parent) ?? [];
      list.push(n.id);
      childrenOf.set(n.parent, list);
    }
  }

  /*
   * Sibling order is the most consequential decision in this layout, and it
   * depends on what the tree *is*.
   *
   * For a BST, left must be smaller than right, or the diagram contradicts the
   * invariant the algorithm is leaning on. So siblings sort by value.
   *
   * For a binary heap the invariant is different in kind: there is no "left must
   * be smaller" rule at all — the only rule is that a parent beats *both*
   * children, and the children's order is the implicit array's (`2i+1` then
   * `2i+2`). So when the frame sets `asArray`, order by array index so the
   * diagram agrees with the arithmetic. Getting this wrong draws a max-heap
   * with its children apparently swapped, which is exactly the confusion the
   * array view exists to prevent.
   */
  const byArray = arrayIndex !== undefined;
  for (const [, kids] of childrenOf) {
    kids.sort((a, b) => {
      if (byArray) return (arrayIndex[a] ?? 0) - (arrayIndex[b] ?? 0);
      const av = nodes[a]?.value;
      const bv = nodes[b]?.value;
      if (typeof av === 'number' && typeof bv === 'number') return av - bv;
      return String(av).localeCompare(String(bv));
    });
  }

  const placed: Placed[] = [];
  let leafCursor = 0;

  const walk = (id: string, depth: number): number => {
    const kids = childrenOf.get(id) ?? [];
    let x: number;
    if (kids.length === 0) {
      x = leafCursor * NODE_W;
      leafCursor += 1;
    } else {
      const xs = kids.map((k) => walk(k, depth + 1));
      x = (Math.min(...xs) + Math.max(...xs)) / 2;
    }
    const node = nodes[id];
    if (node) placed.push({ node, x, y: depth * LEVEL_GAP });
    return x;
  };

  walk(root, 0);

  const minX = Math.min(...placed.map((p) => p.x));
  const maxX = Math.max(...placed.map((p) => p.x));
  const shift = MARGIN - minX;
  for (const p of placed) p.x += shift;

  return {
    placed,
    width: maxX - minX + NODE_W + MARGIN * 2,
    height: maxDepth * LEVEL_GAP + NODE_H + MARGIN,
  };
}

export const TreeView = memo(function TreeView({ frame }: { frame: TreeFrame }) {
  const arrayIndex = frame.asArray ? frame.arrayIndex : undefined;
  const { placed, width, height } = useMemo(
    () => layout(frame.nodes, frame.root, arrayIndex),
    [frame.nodes, frame.root, arrayIndex],
  );
  const byId = useMemo(() => new Map(placed.map((p) => [p.node.id, p])), [placed]);
  const pathSet = useMemo(() => new Set(frame.path ?? []), [frame.path]);
  const keys = Object.keys(frame.highlight ?? {});
  const legend = keys.map((k) => ({
    key: k,
    count: frame.highlight?.[k]?.length ?? 0,
    style: styleForKey(k),
  }));

  // The floors are the ones the old `width`/`height` attributes carried, which is
  // the only reason they are still here. A lone root lays out at 124x70, so
  // without them its viewBox would be a 70-unit sliver of a 750px panel; with
  // them it is still tiny, which is the honest answer for a tree with one node.
  const vbW = Math.max(width, 120) + PAD * 2;
  const vbH = Math.max(height, 90) + PAD * 2;

  if (placed.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-subtle">
        The tree is empty.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <svg
          viewBox={`${-PAD} ${-PAD} ${vbW} ${vbH}`}
          preserveAspectRatio="xMidYMid meet"
          className="m-auto h-full w-full shrink-0 overflow-visible"
          style={{ maxWidth: `${vbW * MAX_ZOOM}px`, maxHeight: `${vbH * MAX_ZOOM}px` }}
          role="img"
          aria-label={`Binary tree with ${placed.length} nodes${frame.path?.length ? `, current path of ${frame.path.length} nodes` : ''}`}
        >
          <defs>
            <marker
              id="tree-arrow"
              markerWidth="6"
              markerHeight="6"
              refX="5"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L6,3 L0,6 z" className="fill-text-faint" />
            </marker>
          </defs>

          {/* Edges first so nodes paint on top. */}
          {placed.map((child) =>
            child.node.parent && byId.has(child.node.parent)
              ? (() => {
                  const parent = byId.get(child.node.parent) as Placed;
                  const onPath = pathSet.has(child.node.id) && pathSet.has(child.node.parent);
                  return (
                    <line
                      key={`e-${child.node.id}`}
                      x1={parent.x + NODE_W / 2}
                      y1={parent.y + NODE_H}
                      x2={child.x + NODE_W / 2}
                      y2={child.y}
                      className={onPath ? 'stroke-accent' : 'stroke-text-faint'}
                      strokeWidth={onPath ? 2.5 : 1.5}
                      markerEnd="url(#tree-arrow)"
                    />
                  );
                })()
              : null,
          )}

          {placed.map(({ node, x, y }) => {
            const style = resolveStyle(node.id, frame.highlight);
            const onPath = pathSet.has(node.id);
            const value = typeof node.value === 'number' ? node.value : String(node.value);
            return (
              <g key={node.id} transform={`translate(${x}, ${y})`}>
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={6}
                  className={[style.fill, style.stroke, 'transition-[fill] duration-200'].join(' ')}
                  strokeWidth={onPath ? 2.5 : 1.5}
                />
                <text
                  x={NODE_W / 2}
                  y={NODE_H / 2 + 4}
                  textAnchor="middle"
                  className={['text-[12px] font-bold tabular-nums', style.ink].join(' ')}
                >
                  {value}
                </text>
                {/* The implicit-array index is the whole point of `asArray`: a
                    student must be able to check the `2i+1` / `2i+2` arithmetic
                    against the drawing rather than take it on faith. */}
                {arrayIndex?.[node.id] !== undefined ? (
                  <text
                    x={NODE_W / 2}
                    y={NODE_H + 11}
                    textAnchor="middle"
                    className="fill-accent-deep/80 text-[9px] font-semibold"
                  >
                    [{arrayIndex[node.id]}]
                  </text>
                ) : node.meta?.height !== undefined ? (
                  <text
                    x={NODE_W / 2}
                    y={NODE_H + 11}
                    textAnchor="middle"
                    className="fill-text-subtle text-[8px]"
                  >
                    h{node.meta.height}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      {legend.length > 0 ? (
        <ul className="flex shrink-0 flex-wrap gap-x-3 gap-y-1 text-[10px] text-text-muted">
          {legend.map((l) => (
            <li key={l.key} className="flex items-center gap-1.5">
              <span
                className={[
                  'inline-block h-2.5 w-2.5 rounded-sm border',
                  l.style.bg,
                  l.style.border,
                ].join(' ')}
              />
              <span className="font-medium text-text-muted">{l.key}</span>
            </li>
          ))}
          {arrayIndex ? (
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm border border-accent-deep bg-accent-deep/30" />
              <span className="font-medium text-text-muted">implicit array index</span>
            </li>
          ) : null}
          {frame.path?.length ? (
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 bg-accent" />
              <span className="font-medium text-text-muted">recursion path</span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
});
