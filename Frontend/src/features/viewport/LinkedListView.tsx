import { memo, useMemo } from 'react';
import type { LinkedFrame, LinkedNode, NodeId } from '../../core/trace/types.ts';
import { resolveStyle, styleForKey } from './palette.ts';

/**
 * Linked list viewport.
 *
 * Drawn as an actual chain of boxes and arrows, because the *point* of a linked
 * list is that the elements are not adjacent in memory. A row of cells would
 * look like an array and quietly teach the wrong thing.
 *
 * The `prev` chain is drawn as a second, dimmer row underneath when present,
 * which is what makes "why is a doubly-linked list worth it" self-evident: you
 * can see the backward arrow you would not otherwise have.
 */

const BOX_W = 68;
const BOX_H = 40;
const GAP = 30;
const MARGIN = 26;

function chainOrder(frame: LinkedFrame): NodeId[] {
  const byId = new Map(frame.nodes.map((n) => [n.id, n]));
  const head =
    frame.nodes.find((n) => n.prev === null || n.prev === undefined)?.id ?? frame.nodes[0]?.id;
  if (head === undefined) return [];
  const order: NodeId[] = [];
  const seen = new Set<NodeId>();
  let cur: LinkedNode | undefined = byId.get(head);
  while (cur && !seen.has(cur.id)) {
    order.push(cur.id);
    seen.add(cur.id);
    if (cur.next === null) break;
    cur = byId.get(cur.next);
  }
  // Any node not reachable from the head is an orphan (e.g. mid-rewire), and
  // hiding it would make the algorithm look like it lost data.
  for (const n of frame.nodes) if (!seen.has(n.id)) order.push(n.id);
  return order;
}

export const LinkedListView = memo(function LinkedListView({ frame }: { frame: LinkedFrame }) {
  const order = useMemo(() => chainOrder(frame), [frame]);
  const byId = useMemo(() => new Map(frame.nodes.map((n) => [n.id, n])), [frame.nodes]);
  const pointerNames = Object.keys(frame.pointers ?? {});
  const width = Math.max(160, order.length * (BOX_W + GAP) - GAP + MARGIN * 2);
  const keys = Object.keys(frame.highlight ?? {});
  const legend = keys.map((k) => ({
    key: k,
    count: frame.highlight?.[k]?.length ?? 0,
    style: styleForKey(k),
  }));

  if (order.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        The list is empty.
      </div>
    );
  }

  const xOf = (i: number) => MARGIN + i * (BOX_W + GAP);
  const posOf = new Map<NodeId, number>(order.map((id, i) => [id, i]));
  const tailId = order[order.length - 1] as NodeId;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <svg
          width={width}
          height={frame.doubly ? 168 : 108}
          className="m-auto overflow-visible"
          role="img"
          aria-label={`${frame.doubly ? 'Doubly' : 'Singly'} linked list with ${order.length} nodes: ${order.map((id) => String(byId.get(id)?.value ?? id)).join(' -> ')}`}
        >
          <defs>
            <marker id="ll-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
              <path d="M0,0 L7,3 L0,6 z" className="fill-slate-500" />
            </marker>
            <marker
              id="ll-arrow-back"
              markerWidth="7"
              markerHeight="7"
              refX="1"
              refY="3"
              orient="auto"
            >
              <path d="M7,0 L0,3 L7,6 z" className="fill-slate-600" />
            </marker>
          </defs>

          {/* next arrows */}
          {order.map((id, i) => {
            const n = byId.get(id) as LinkedNode;
            const next = n.next === null ? null : posOf.get(n.next);
            if (next === undefined || next === null) return null;
            const changed = frame.relinked?.includes(id);
            return (
              <line
                key={`n-${id}`}
                x1={xOf(i) + BOX_W}
                y1={BOX_H / 2}
                x2={xOf(next) - 5}
                y2={BOX_H / 2}
                className={changed ? 'stroke-amber-400' : 'stroke-slate-500'}
                strokeWidth={changed ? 2.5 : 1.5}
                markerEnd="url(#ll-arrow)"
              />
            );
          })}

          {/* prev arrows, offset below */}
          {frame.doubly
            ? order.map((id, i) => {
                const n = byId.get(id) as LinkedNode;
                const prev = n.prev === null || n.prev === undefined ? null : posOf.get(n.prev);
                if (prev === undefined || prev === null) return null;
                return (
                  <line
                    key={`p-${id}`}
                    x1={xOf(i)}
                    y1={BOX_H + 44}
                    x2={xOf(prev) + BOX_W + 5}
                    y2={BOX_H + 44}
                    className="stroke-slate-600"
                    strokeWidth={1.25}
                    markerEnd="url(#ll-arrow-back)"
                  />
                );
              })
            : null}

          {order.map((id, i) => {
            const n = byId.get(id) as LinkedNode;
            const style = resolveStyle(id, frame.highlight);
            const value = typeof n.value === 'number' ? n.value : String(n.value);
            const named = pointerNames.filter((p) => frame.pointers?.[p] === id);
            return (
              <g key={id} transform={`translate(${xOf(i)}, ${BOX_H / 2 - BOX_H / 2})`}>
                <rect
                  width={BOX_W}
                  height={BOX_H}
                  rx={6}
                  className={[style.fill, style.stroke, 'transition-[fill] duration-200'].join(' ')}
                  strokeWidth={named.length > 0 ? 3 : 1.5}
                />
                <text
                  x={BOX_W / 2}
                  y={BOX_H / 2 + 5}
                  textAnchor="middle"
                  className={['text-[14px] font-bold tabular-nums', style.ink].join(' ')}
                >
                  {value}
                </text>
                <text
                  x={BOX_W / 2}
                  y={-6}
                  textAnchor="middle"
                  className="fill-slate-500 text-[9px]"
                >
                  {id}
                </text>
                {named.map((p, k) => (
                  <g key={p} transform={`translate(0, ${-24 - k * 16})`}>
                    <rect
                      x={BOX_W / 2 - 22}
                      width={44}
                      height={15}
                      rx={3}
                      className="fill-amber-400"
                    />
                    <text
                      x={BOX_W / 2}
                      y={11}
                      textAnchor="middle"
                      className="fill-slate-950 text-[10px] font-bold"
                    >
                      {p}
                    </text>
                  </g>
                ))}
              </g>
            );
          })}

          {/* head / null tail annotations */}
          <text x={MARGIN} y={BOX_H + 18} className="fill-slate-400 text-[11px] font-semibold">
            head
          </text>
          {frame.circular ? (
            <path
              d={`M${xOf(order.length - 1) + BOX_W / 2},${BOX_H / 2} C${xOf(order.length - 1) + BOX_W / 2 + 70},${BOX_H / 2 + 70} ${xOf(0) - 70},${BOX_H / 2 + 70} ${xOf(0) + BOX_W / 2},${BOX_H / 2 + 4}`}
              className="fill-none stroke-rose-400"
              strokeWidth={2}
              markerEnd="url(#ll-arrow)"
            />
          ) : (
            <text
              x={xOf(order.length - 1) + BOX_W + 6}
              y={BOX_H / 2 + 4}
              className="fill-slate-500 text-[12px] font-mono"
            >
              null
            </text>
          )}
          {frame.circular ? (
            <text x={MARGIN} y={BOX_H + 18} className="fill-rose-400 text-[11px] font-semibold">
              head — circular
            </text>
          ) : null}
        </svg>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-[10px]">
        {legend.map((l) => (
          <span key={l.key} className="flex items-center gap-1.5">
            <span
              className={[
                'inline-block h-2.5 w-2.5 rounded-sm border',
                l.style.bg,
                l.style.border,
              ].join(' ')}
            />
            <span className="font-medium text-slate-300">{l.key}</span>
          </span>
        ))}
        {frame.relinked?.length ? (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-amber-400" />
            <span className="font-medium text-slate-300">just rewired</span>
          </span>
        ) : null}
        {frame.doubly ? (
          <span className="text-slate-500">arrows above: next · arrows below: prev</span>
        ) : null}
        <span className="ml-auto font-mono text-slate-500">
          tail: {String(byId.get(tailId)?.value ?? '')}
        </span>
      </div>
    </div>
  );
});
