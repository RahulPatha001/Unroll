import { memo, useMemo } from 'react';
import type { GridFrame, LinearFrame } from '../../core/trace/types.ts';
import { resolveStyle, styleForKey } from './palette.ts';

/**
 * Grid viewport — matrices, DP tables, and maze-like grids.
 *
 * One component for all three because the frame is uniform, with two optional
 * affordances that earn their keep:
 *
 *  - `rowHeader` / `colHeader` turn it into a DP table with the *strings* down
 *    the side, which is how LCS and edit distance are taught. A DP table
 *    without its headers is a grid of numbers nobody can check.
 *  - `tags` decorate individual cells with where a value came from
 *    (`fromLeft`, `fromAbove`, `diag`, `match`). For dynamic programming, the
 *    provenance of a cell is the entire lesson.
 */
const TAG_STYLE: Record<string, string> = {
  match: 'ring-2 ring-success',
  mismatch: 'ring-2 ring-danger',
  diag: 'ring-2 ring-violet-400',
  fromLeft: 'ring-2 ring-info-deep',
  fromAbove: 'ring-2 ring-accent',
};

export const GridView = memo(function GridView({ frame }: { frame: GridFrame }) {
  const { rows, cols, cells } = frame;
  const filled = useMemo(() => new Set(frame.filled ?? []), [frame.filled]);
  const keys = Object.keys(frame.highlight ?? {});
  const legend = keys.map((k) => ({
    key: k,
    count: frame.highlight?.[k]?.length ?? 0,
    style: styleForKey(k),
  }));
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of Object.values(frame.tags ?? {})) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()];
  }, [frame.tags]);

  const cellSize =
    cols > 24 || rows > 24
      ? 'h-7 w-7 text-[10px]'
      : cols > 12
        ? 'h-9 w-9 text-xs'
        : 'h-11 w-11 text-sm';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <table
          className="border-separate border-spacing-1"
          aria-label={`${rows} by ${cols} grid${frame.rowHeader?.length ? ', showing string headers' : ''}`}
        >
          {frame.colHeader || frame.rowHeader ? (
            <thead>
              <tr>
                {frame.rowHeader ? <th className="h-5 w-5" /> : null}
                {frame.colHeader?.map((ch, i) => (
                  <th
                    key={i}
                    className="w-6 text-center text-[10px] font-bold tracking-wide text-info uppercase"
                  >
                    {ch === ' ' ? '␣' : ch}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                {frame.rowHeader ? (
                  <th className="w-5 pr-1 text-right text-[10px] font-bold text-info">
                    {frame.rowHeader[r] === ' ' ? '␣' : (frame.rowHeader[r] ?? '')}
                  </th>
                ) : null}
                {Array.from({ length: cols }, (_, c) => {
                  const idx = r * cols + c;
                  const value = cells?.[idx];
                  const style = resolveStyle(idx, frame.highlight);
                  const tag = frame.tags?.[idx];
                  const isCursor = frame.cursor?.row === r && frame.cursor?.col === c;
                  const isFilled = filled.has(idx);
                  return (
                    <td key={c} className="p-0">
                      <div
                        className={[
                          cellSize,
                          'flex items-center justify-center rounded border font-semibold tabular-nums',
                          'transition-colors duration-150',
                          isFilled ? 'bg-info-deep/70 text-white' : style.bg,
                          isFilled ? 'border-info-deep' : style.border,
                          style.text,
                          tag ? (TAG_STYLE[tag] ?? '') : '',
                          isCursor ? 'outline-2 outline-offset-1 outline-white' : '',
                        ].join(' ')}
                      >
                        {value === null || value === undefined ? (
                          <span className="text-text-faint">·</span>
                        ) : (
                          String(value)
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
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
            <span className="font-medium text-text-muted">{l.key}</span>
          </span>
        ))}
        {tagCounts.map(([tag, n]) => (
          <span key={tag} className="flex items-center gap-1.5">
            <span
              className={[
                'inline-block h-2.5 w-2.5 rounded-sm bg-surface-overlay',
                TAG_STYLE[tag] ?? '',
              ].join(' ')}
            />
            <span className="font-medium text-text-muted">{tag}</span>
            <span className="tabular-nums text-text-subtle">{n}</span>
          </span>
        ))}
        {frame.cursor ? (
          <span className="ml-auto font-mono text-text-muted">
            cursor [{frame.cursor.row}, {frame.cursor.col}]
          </span>
        ) : null}
      </div>
    </div>
  );
});

/**
 * Linear viewport — stacks, queues, deques, monotonic queues.
 *
 * A queue and a stack look like the same row of boxes, and the only difference
 * a student needs to see is *which end is the entrance*. So the flavour is
 * drawn as an explicit label at each end rather than left implicit.
 */
export const LinearView = memo(function LinearView({ frame }: { frame: LinearFrame }) {
  const keys = Object.keys(frame.highlight ?? {});
  const legend = keys.map((k) => ({
    key: k,
    count: frame.highlight?.[k]?.length ?? 0,
    style: styleForKey(k),
  }));
  const n = frame.items.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <div className="mb-1 flex justify-between text-[10px] font-semibold tracking-wide text-text-subtle uppercase">
          <span>{frame.flavour === 'stack' ? 'top ↑' : 'front'}</span>
          {frame.flavour !== 'stack' ? <span>rear</span> : null}
        </div>
        <div
          className="flex min-h-16 flex-wrap items-stretch gap-1.5"
          role="img"
          aria-label={`${frame.flavour} with ${n} items`}
        >
          {frame.items.length === 0 ? (
            <div className="flex w-full items-center justify-center rounded border border-dashed border-border-strong py-6 text-xs text-text-subtle">
              empty
            </div>
          ) : null}
          {frame.items.map((v, i) => {
            const style = resolveStyle(i, frame.highlight);
            return (
              <div
                key={i}
                className={[
                  'flex h-14 w-14 shrink-0 items-center justify-center rounded border text-sm font-bold tabular-nums',
                  'transition-colors duration-150',
                  style.bg,
                  style.border,
                  style.text,
                ].join(' ')}
              >
                {String(v)}
              </div>
            );
          })}
        </div>
        {frame.edges && Object.keys(frame.edges).length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-text-muted">
            {Object.entries(frame.edges).map(([k, v]) => (
              <span key={k}>
                <span className="font-medium text-text-muted">{k}</span> = {v}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/*
        The auxiliary row. It exists for one algorithm's sake — a min-stack is a
        stack plus a stack of running minima, and without this the trick is
        invisible. Rendered as a second structure rather than a caption because
        the whole lesson is the *correspondence* between the two, and a student
        cannot see a correspondence between a diagram and a sentence.
      */}
      {frame.overlay ? (
        <div className="shrink-0">
          <div className="mb-1 text-[10px] font-semibold tracking-wide text-text-subtle uppercase">
            {frame.overlay.label}
          </div>
          <div className="flex flex-wrap items-stretch gap-1.5">
            {frame.overlay.values.length === 0 ? (
              <div className="flex items-center justify-center rounded border border-dashed border-border-strong px-3 py-2 text-xs text-text-subtle">
                empty
              </div>
            ) : null}
            {frame.overlay.values.map((v, i) => {
              const style = resolveStyle(i, frame.highlight);
              return (
                <div
                  key={i}
                  className={[
                    'flex h-10 w-12 shrink-0 items-center justify-center rounded border text-sm font-bold tabular-nums',
                    'transition-colors duration-150',
                    style.bg,
                    style.border,
                    style.text,
                  ].join(' ')}
                >
                  {String(v)}
                </div>
              );
            })}
          </div>
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
        </ul>
      ) : null}
    </div>
  );
});
