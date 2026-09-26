import { memo, useMemo } from 'react';
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
          viewBox={`-40 -40 ${VIEW + 80} ${VIEW + 80}`}
          className="h-full w-full"
          role="img"
          aria-label={`Graph with ${nodes.length} nodes and ${frame.edges.length} edges. Frontier size ${frame.frontier.length}, ${frame.visited.length} visited.`}
        >
          <defs>
            <marker id="g-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
              <path d="M0,0 L7,3 L0,6 z" className="fill-slate-500" />
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
                    e.inSet ? 'stroke-emerald-400' : hot ? 'stroke-slate-400' : 'stroke-slate-600'
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
                    className="fill-slate-300 text-[13px] font-semibold"
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
                    className="stroke-slate-500"
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
                      className="fill-slate-900 stroke-slate-500"
                      strokeWidth={1.5}
                    />
                    <text
                      x={R + 1}
                      y={-R - 4}
                      textAnchor="middle"
                      className="fill-emerald-300 text-[15px] font-bold"
                    >
                      {dist === Number.POSITIVE_INFINITY ? '∞' : dist}
                    </text>
                  </>
                ) : null}
                {isVisited ? (
                  <circle r={R - 5} className="fill-none stroke-emerald-400/50" strokeWidth={1.5} />
                ) : null}
                {frame.layer?.[n.id] !== undefined ? (
                  <text y={R + 15} textAnchor="middle" className="fill-slate-500 text-[10px]">
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
            <span className="font-medium text-slate-300">{l.key}</span>
          </span>
        ))}
        {frame.parent ? (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0 w-4 border-t border-dashed border-slate-500" />
            <span className="font-medium text-slate-300">parent</span>
          </span>
        ) : null}
        <span className="ml-auto font-mono text-slate-500">
          {frame.frontier.length > 0
            ? `frontier [${frame.frontier.map(label).join(' ')}]`
            : 'frontier empty'}
        </span>
      </div>
    </div>
  );
});
