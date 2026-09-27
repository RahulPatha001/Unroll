import { memo, useMemo, useRef } from 'react';
import type { GraphFrame, NodeId } from '../../core/trace/types.ts';
import { resolveStyle, styleForKey } from './palette.ts';

/**
 * Graph viewport.
 *
 * Node positions are supplied by the algorithm module as explicit coordinates
 * in a 0..1000 box (see `GraphNode.x/y`). Force-directed layout was rejected in
 * the plan for one reason: it re-settles between frames, so a student cannot
 * track a node with their eyes — which destroys the whole point of stepping
 * through frame by frame. Fixed coordinates also make the layout *identical*
 * across languages, so a student comparing the Python and Java listings is
 * looking at the same picture in both.
 */
const VIEW = 1000;
const R = 26;

/**
 * How much room the drawing needs around the node centres.
 *
 * Not a round number chosen for looks: the distance badge reaches `-(R + 21)`
 * above a node and `R + 5` to its right, the layer caption's baseline sits at
 * `R + 15` with a descender under it, and the node's own stroke adds a couple
 * more. The old fixed viewBox padded by 40, which clipped the top 7 units of
 * every distance badge — visible on every Dijkstra frame, and easy to miss
 * because a clipped rounded rectangle still looks like a rounded rectangle.
 */
const PAD = 52;

/**
 * A floor on the box, in node-centre units.
 *
 * Some layouts are degenerate on one axis: `topological-sort`'s `chain` preset
 * is four nodes on a single row, so its height is zero. Fitting a zero-height
 * box to a 750px panel would draw a 750px-tall line of circles. Two node
 * diameters is the smallest box in which a node and the badge on it still read
 * as a node with a label.
 */
const MIN_SIDE = 2 * R;

/**
 * The zoom ceiling, in pixels per viewBox unit.
 *
 * The coordinates are abstract — a graph is not measured in pixels — so unlike
 * the tree and the trie there is no "natural size" here and this is the only
 * thing bounding the fit. Uncapped, a two-node graph two hundred units apart
 * becomes two 400px circles with 200px labels, which is not a diagram, it is a
 * logo. Every graph algorithm in the curriculum lays its nodes out over most of
 * the 1000-unit box, so this only binds on hand-typed input: measured across all
 * thirteen of them, the tightest fit on any preset is 1.4x.
 *
 * The clamp is written in CSS rather than as a measured scale, for the same
 * reason it is in `TreeView`: the element is sized `100%` of its box and capped
 * at `viewBox size x this`, so the browser's own fit provably cannot exceed the
 * ceiling. That is what makes it free — a window resize re-fits with no
 * `ResizeObserver`, no subscription and no re-render, and nothing here touches
 * `window`, so the module still imports in Node.
 */
const MAX_ZOOM = 2;

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Widen a span symmetrically until it is at least `MIN_SIDE` across. */
function widen(lo: number, hi: number): [number, number] {
  const pad = hi - lo < MIN_SIDE ? (MIN_SIDE - (hi - lo)) / 2 : 0;
  return [lo - pad, hi + pad];
}

/**
 * The box the node centres occupy.
 *
 * A function rather than an inline `Math.min` chain because it is the thing the
 * viewBox is built from, and because the stability guard in the component below
 * needs to be able to compare two of them.
 */
function boundsOf(nodes: Array<{ x: number; y: number }>): Box {
  if (nodes.length === 0) return { x0: 0, y0: 0, x1: VIEW, y1: VIEW };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.x);
    y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x);
    y1 = Math.max(y1, n.y);
  }
  const [ax, bx] = widen(x0, x1);
  const [ay, by] = widen(y0, y1);
  return { x0: ax, y0: ay, x1: bx, y1: by };
}

function edgePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  directed: boolean,
): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Stop at the circle so the arrowhead is not buried under the node.
  const sx = from.x + ux * R;
  const sy = from.y + uy * R;
  const ex = to.x - ux * (directed ? R + 6 : R);
  const ey = to.y - uy * (directed ? R + 6 : R);
  // A gentle arc makes bidirectional pairs distinguishable without colour.
  if (!directed) {
    const mx = (sx + ex) / 2 - uy * 18;
    const my = (sy + ey) / 2 + ux * 18;
    return `M${sx},${sy} Q${mx},${my} ${ex},${ey}`;
  }
  return `M${sx},${sy} L${ex},${ey}`;
}

export const GraphView = memo(function GraphView({ frame }: { frame: GraphFrame }) {
  const nodes = useMemo(() => Object.values(frame.nodes), [frame.nodes]);
  const frontierSet = useMemo(() => new Set(frame.frontier), [frame.frontier]);
  const visitedSet = useMemo(() => new Set(frame.visited), [frame.visited]);

  /*
   * The viewBox is the one thing in this file that is allowed to change what
   * every *other* node looks like: it scales the whole drawing at once. So
   * deriving it from the current frame is only safe if the node set is as stable
   * as the coordinates are, and that is established here rather than assumed.
   *
   * Every graph algorithm in the curriculum reads a static edge list, so the
   * node set is fixed for a run and this box is computed once — measured across
   * all thirteen of them, on every preset, no run ever produces two different
   * node boxes. The guard is here for the one that would not: it holds the
   * widest box seen and resets only when the node set itself changes, so the
   * worst case is a single refit rather than the whole graph breathing on every
   * step. Visual continuity is the product; a rescale is the loudest possible
   * violation of it.
   *
   * Writing a ref during render is normally the thing not to do, and here it is
   * safe for one reason: the value is a union, so it is monotonic and idempotent.
   * A render React throws away can only leave the box one step too large for the
   * next one to inherit, never oscillating, and it resets the moment the node set
   * does. A state variable here would be the same result with more machinery.
   */
  const measured = boundsOf(nodes);
  const held = useRef<{ key: string; box: Box } | null>(null);
  const previous = held.current;
  const nodeKey = nodes.map((n) => n.id).join(' ');
  const box: Box =
    previous && previous.key === nodeKey
      ? {
          x0: Math.min(previous.box.x0, measured.x0),
          y0: Math.min(previous.box.y0, measured.y0),
          x1: Math.max(previous.box.x1, measured.x1),
          y1: Math.max(previous.box.y1, measured.y1),
        }
      : measured;
  held.current = { key: nodeKey, box };

  const vbX = box.x0 - PAD;
  const vbY = box.y0 - PAD;
  const vbW = box.x1 - box.x0 + PAD * 2;
  const vbH = box.y1 - box.y0 + PAD * 2;

  const label = (id: NodeId): string => {
    const n = frame.nodes[id];
    if (!n) return id;
    if (n.label !== undefined) return n.label;
    const stripped = id.replace(/^n/, '');
    return /^\d+$/.test(stripped) ? stripped : id;
  };

  const keys = Object.keys(frame.highlight ?? {});
  const legend = keys.map((k) => ({
    key: k,
    count: frame.highlight?.[k]?.length ?? 0,
    style: styleForKey(k),
  }));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <svg
          viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
          preserveAspectRatio="xMidYMid meet"
          className="m-auto h-full w-full shrink-0"
          style={{ maxWidth: `${vbW * MAX_ZOOM}px`, maxHeight: `${vbH * MAX_ZOOM}px` }}
          role="img"
          aria-label={`Graph with ${nodes.length} nodes and ${frame.edges.length} edges. Frontier size ${frame.frontier.length}, ${frame.visited.length} visited.`}
        >
          <defs>
            <marker id="g-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
              <path d="M0,0 L7,3 L0,6 z" className="fill-text-subtle" />
            </marker>
          </defs>

          {frame.edges.map((e, i) => {
            const a = frame.nodes[e.from];
            const b = frame.nodes[e.to];
            if (!a || !b) return null;
            const hot = frontierSet.has(e.from) || frontierSet.has(e.to);
            return (
              <g key={`${e.from}-${e.to}-${i}`}>
                <path
                  d={edgePath(a, b, e.directed)}
                  className={
                    e.inSet ? 'stroke-success' : hot ? 'stroke-text-muted' : 'stroke-text-faint'
                  }
                  strokeWidth={e.inSet ? 3 : hot ? 2 : 1.5}
                  fill="none"
                  markerEnd={e.directed ? 'url(#g-arrow)' : undefined}
                />
                {e.weight !== undefined ? (
                  <text
                    x={(a.x + b.x) / 2}
                    y={(a.y + b.y) / 2 - 5}
                    textAnchor="middle"
                    className="fill-text-muted text-[13px] font-semibold"
                    stroke="rgb(15 23 42)"
                    strokeWidth={4}
                    paintOrder="stroke"
                  >
                    {e.weight}
                  </text>
                ) : null}
              </g>
            );
          })}

          {/* Union-Find forest, drawn as dashed links behind the nodes. */}
          {frame.parent
            ? nodes.map((n) => {
                const p = frame.parent?.[n.id];
                if (!p || p === n.id) return null;
                const pn = frame.nodes[p];
                if (!pn) return null;
                return (
                  <line
                    key={`uf-${n.id}`}
                    x1={n.x}
                    y1={n.y}
                    x2={pn.x}
                    y2={pn.y}
                    className="stroke-text-subtle"
                    strokeWidth={1}
                    strokeDasharray="3 4"
                  />
                );
              })
            : null}

          {nodes.map((n) => {
            const style = resolveStyle(n.id, frame.highlight);
            const inFrontier = frontierSet.has(n.id);
            const isVisited = visitedSet.has(n.id);
            const dist = frame.distance?.[n.id];
            return (
              <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
                <circle
                  r={R}
                  className={[style.fill, style.stroke, 'transition-[fill] duration-200'].join(' ')}
                  strokeWidth={inFrontier ? 3 : 2}
                />
                <text
                  y={5}
                  textAnchor="middle"
                  className={['text-[15px] font-bold', style.ink].join(' ')}
                >
                  {label(n.id)}
                </text>
                {dist !== undefined ? (
                  <>
                    {/*
                      The badge was 34x19 viewBox units, which renders about 12px
                      tall on screen — too small to read a two- or three-digit
                      distance. It is sized against the node radius so it scales
                      with the graph rather than with the panel.
                    */}
                    <rect
                      x={R - 21}
                      y={-R - 21}
                      width={44}
                      height={25}
                      rx={5}
                      className="fill-surface-raised stroke-text-subtle"
                      strokeWidth={1.5}
                    />
                    <text
                      x={R + 1}
                      y={-R - 4}
                      textAnchor="middle"
                      className="fill-success-strong text-[15px] font-bold"
                    >
                      {dist === Number.POSITIVE_INFINITY ? '∞' : dist}
                    </text>
                  </>
                ) : null}
                {isVisited ? (
                  <circle r={R - 5} className="fill-none stroke-success/50" strokeWidth={1.5} />
                ) : null}
                {frame.layer?.[n.id] !== undefined ? (
                  <text y={R + 15} textAnchor="middle" className="fill-text-subtle text-[10px]">
                    L{frame.layer[n.id]}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-[10px]">
        {legend.map((l) => (
          <span key={l.key} className="flex items-center gap-1.5">
            <span
              className={[
                'inline-block h-2.5 w-2.5 rounded-full border',
                l.style.bg,
                l.style.border,
              ].join(' ')}
            />
            <span className="font-medium text-text-muted">{l.key}</span>
          </span>
        ))}
        {frame.parent ? (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0 w-4 border-t border-dashed border-border-subtle" />
            <span className="font-medium text-text-muted">parent</span>
          </span>
        ) : null}
        <span className="ml-auto font-mono text-text-subtle">
          {frame.frontier.length > 0
            ? `frontier [${frame.frontier.map(label).join(' ')}]`
            : 'frontier empty'}
        </span>
      </div>
    </div>
  );
});
