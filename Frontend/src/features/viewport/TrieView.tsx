import { memo, useMemo } from 'react';
import type { NodeId, TrieFrame, TrieNode } from '../../core/trace/types.ts';
import { resolveStyle, styleForKey } from './palette.ts';

/**
 * Trie viewport.
 *
 * Laid out as a left-to-right tree, because a trie is a *path* structure: the
 * characters of a word run left to right, and the terminal marker sits at the
 * end of the path. A top-down tree would make that path read vertically and hide
 * the one property that distinguishes a trie from any other tree.
 *
 * The word being inserted or searched is shown underneath with the cursor
 * position, so a student can see *which character* the walk is currently on.
 */

const BOX = 30;

/*
 * The horizontal gap between a node box and the next one along, and why it is 14
 * and not 4.
 *
 * Every edge is labelled with the character it is keyed on, because the whole
 * point of a trie is that you can see *which character* the walk is currently
 * following. The label is `text-[11px]`, and inside an SVG with a `viewBox` a
 * `px` font size is in **user units, not screen pixels** — so it is an 11-unit
 * glyph, and a single character is roughly 7 units wide.
 *
 * `GAP_X - BOX` used to be 4. A 7-unit glyph centred in a 4-unit gap overhangs
 * the boxes on *both* sides, and it had done so for the whole life of this view.
 * It was invisible because the drawing was also tiny: at 166px wide the labels
 * were about 4px, and nobody could read them well enough to notice they were
 * resting on the corners of the boxes they named. Fitting the view to its box
 * fixed the size and exposed the defect, which is the uncomfortable way to
 * discover that a constant was always wrong.
 *
 * Measured at 2.5x before the fix: all eight stray labels overlapped a node box,
 * by 1.2-1.4 units horizontally. 14 units of gap clears the widest glyph with
 * room to spare, and costs horizontal space that fit-to-box absorbs.
 */
const EDGE_LABEL_GAP = 14;
const GAP_X = BOX + EDGE_LABEL_GAP;
const GAP_Y = 52;
const MARGIN = 30;

/*
 * Fit-to-box, and the same three decisions as `TreeView` — see the note there,
 * which is the one worth reading. In short: the drawing is laid out in its own
 * units and the *browser* scales it, via `viewBox` + `xMidYMid meet`; the zoom
 * is capped so a two-node trie cannot become a poster; and the cap is written
 * as a `max-width`/`max-height` clamp in units of the natural size rather than
 * as a measured scale factor, so a window resize re-fits with no
 * `ResizeObserver`, no subscription and no re-render, and nothing in this module
 * touches `window`.
 *
 * The trie is the view that needed it most, because it is the one that starts
 * smallest: the default preset is four words, and at the last frame the drawing
 * measured 166x134 inside a 1046x751 box — a sixth of its width and a fifth of
 * its height. The point of a left-to-right trie is that the path reads as a
 * path, and at 166px wide you could not see it.
 *
 * The cap used to be argued from a defect rather than a taste: the edge labels
 * overlapped the node boxes, so raising the zoom made the overlap more obvious
 * and the cap was the only thing keeping it tolerable. That argument is gone —
 * `EDGE_LABEL_GAP` above fixes the cause — so 2.5 is now a judgement about how
 * large a two-node diagram should get, and nothing more.
 */
const PAD = 4;
const MAX_ZOOM = 2.5;

export const TrieView = memo(function TrieView({ frame }: { frame: TrieFrame }) {
  const { placed, width, height } = useMemo(() => {
    const nodes = frame.nodes;
    const childrenOf = new Map<NodeId, TrieNode[]>();
    for (const n of Object.values(nodes)) {
      if (n.parent) {
        const list = childrenOf.get(n.parent) ?? [];
        list.push(n);
        childrenOf.set(n.parent, list);
      }
    }
    for (const [, kids] of childrenOf) kids.sort((a, b) => a.char.localeCompare(b.char));

    const out: Array<{ node: TrieNode; x: number; y: number }> = [];
    let nextY = MARGIN;

    // Leaf-first sweep: each leaf claims a row, parents centre over their
    // children. Same idea as the tree layout, rotated 90 degrees.
    const walk = (id: NodeId): number => {
      const kids = childrenOf.get(id) ?? [];
      let y: number;
      if (kids.length === 0) {
        y = nextY;
        nextY += GAP_Y;
      } else {
        const ys = kids.map((k) => walk(k.id));
        y = (Math.min(...ys) + Math.max(...ys)) / 2;
      }
      const node = nodes[id];
      if (node) out.push({ node, x: MARGIN + node.depth * GAP_X, y });
      return y;
    };
    walk(frame.root);

    const maxY = Math.max(...out.map((p) => p.y), MARGIN);
    return {
      placed: out,
      width: MARGIN * 2 + Math.max(0, ...out.map((p) => p.x - MARGIN)) + GAP_X + BOX,
      height: maxY + BOX + MARGIN,
    };
  }, [frame.nodes, frame.root]);

  const byId = useMemo(() => new Map(placed.map((p) => [p.node.id, p])), [placed]);
  const pathSet = useMemo(() => new Set(frame.path ?? []), [frame.path]);
  const keys = Object.keys(frame.highlight ?? {});
  const legend = keys.map((k) => ({
    key: k,
    count: frame.highlight?.[k]?.length ?? 0,
    style: styleForKey(k),
  }));

  // The floors are the ones the old `width`/`height` attributes carried, which is
  // the only reason they are still here. A root with a single character lays out
  // at 158 units wide — two units under the floor — and a lone root is exactly
  // 90 tall, so both of these are the floor doing the work rather than the
  // layout.
  const vbW = Math.max(width, 160) + PAD * 2;
  const vbH = Math.max(height, 90) + PAD * 2;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <svg
          viewBox={`${-PAD} ${-PAD} ${vbW} ${vbH}`}
          preserveAspectRatio="xMidYMid meet"
          className="m-auto h-full w-full shrink-0 overflow-visible"
          style={{ maxWidth: `${vbW * MAX_ZOOM}px`, maxHeight: `${vbH * MAX_ZOOM}px` }}
          role="img"
          aria-label={`Trie with ${placed.length} nodes${frame.probe ? `, walking "${frame.probe}"` : ''}`}
        >
          <defs>
            <marker
              id="trie-arrow"
              markerWidth="6"
              markerHeight="6"
              refX="5"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L6,3 L0,6 z" className="fill-text-faint" />
            </marker>
          </defs>

          {placed.map((child) => {
            const { node } = child;
            if (!node.parent) return null;
            const parent = byId.get(node.parent);
            if (!parent) return null;
            const onPath = pathSet.has(node.id) && pathSet.has(node.parent);
            return (
              <g key={`e-${node.id}`}>
                <line
                  x1={parent.x + BOX}
                  y1={parent.y + BOX / 2}
                  x2={child.x - 4}
                  y2={child.y + BOX / 2}
                  className={onPath ? 'stroke-accent' : 'stroke-text-faint'}
                  strokeWidth={onPath ? 2.5 : 1.4}
                  markerEnd="url(#trie-arrow)"
                />
                <text
                  x={(parent.x + BOX + child.x) / 2}
                  y={(parent.y + child.y) / 2 + BOX / 2 - 4}
                  textAnchor="middle"
                  className="fill-info text-[11px] font-bold"
                >
                  {node.char}
                </text>
              </g>
            );
          })}

          {placed.map(({ node, x, y }) => {
            const style = resolveStyle(node.id, frame.highlight);
            const onPath = pathSet.has(node.id);
            return (
              <g key={node.id} transform={`translate(${x}, ${y})`}>
                <rect
                  width={BOX}
                  height={BOX}
                  rx={node.isWord ? 3 : 14}
                  className={[style.fill, style.stroke, 'transition-[fill] duration-200'].join(' ')}
                  strokeWidth={onPath ? 2.5 : 1.4}
                />
                <text
                  x={BOX / 2}
                  y={BOX / 2 + 4}
                  textAnchor="middle"
                  className={['text-[12px] font-bold', style.ink].join(' ')}
                >
                  {node.char === '' ? '∅' : node.char}
                </text>
                {node.isWord ? (
                  <circle cx={BOX - 4} cy={4} r={3.5} className="fill-success" />
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      {frame.probe ? (
        <div className="shrink-0 font-mono text-sm">
          {frame.probe.split('').map((ch, i) => (
            <span
              key={i}
              className={[
                'rounded px-0.5',
                frame.probeIndex === i
                  ? 'bg-accent font-bold text-text-inverse'
                  : 'text-text-muted',
                frame.probeIndex !== undefined && i < frame.probeIndex ? 'text-success' : '',
              ].join(' ')}
            >
              {ch}
            </span>
          ))}
          <span className="ml-2 text-[10px] text-text-subtle">
            {frame.probeIndex === undefined
              ? ''
              : frame.probeIndex >= frame.probe.length
                ? '— word complete'
                : `— reading "${frame.probe[frame.probeIndex]}"`}
          </span>
        </div>
      ) : null}

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
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-success" />
            <span className="font-medium text-text-muted">end of a word</span>
          </li>
        </ul>
      ) : null}
    </div>
  );
});
