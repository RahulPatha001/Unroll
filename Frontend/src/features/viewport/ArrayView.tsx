import { memo, useMemo } from 'react';
import type { ArrayFrame } from '../../core/trace/types.ts';
import { rankedKeys, resolveStyle, styleForKey } from './palette.ts';
import { CellPointers, describePointers, groupPointers } from './pointerMarkers.tsx';

/**
 * The array viewport — the workhorse.
 *
 * One component renders all of: sorting, two pointers, sliding window, binary
 * search, Kadane, prefix sums, interval scanning. Not because those algorithms
 * are similar, but because the *frame* is uniform: cells, named cursors, named
 * highlight groups. Every one of them is expressible in those three ideas, which
 * is the entire bet of the trace contract (plan §3.2).
 *
 * Bars vs. boxed cells is decided here, not by a new frame field: "is this a
 * bar chart or a table" is the viewer's business, and the same frame should
 * render both ways.
 */

/** Above this, individual cells stop being legible and we drop to a compact grid. */
export const DOM_LIMIT = 150;

export interface ArrayViewProps {
  frame: ArrayFrame;
  variant?: 'auto' | 'bars' | 'cells';
  showPointerLabels?: boolean;
  compact?: boolean;
}

function formatValue(v: number | string): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return v;
}

export const ArrayView = memo(function ArrayView({
  frame,
  variant = 'auto',
  showPointerLabels = true,
  compact = false,
}: ArrayViewProps) {
  const values = frame.values;
  const n = values.length;

  const numeric =
    frame.mode !== 'char' && frame.mode !== 'string' && values.every((v) => typeof v === 'number');
  const { min, max } = useMemo(() => {
    if (!numeric) return { min: 0, max: 1 };
    const nums = values as number[];
    return { min: Math.min(0, ...nums), max: Math.max(1, ...nums) };
  }, [values, numeric]);
  const span = Math.max(1e-9, max - min);

  const useBars = variant === 'bars' || (variant === 'auto' && numeric && n <= 60 && !compact);
  const pointerGroups = useMemo(() => groupPointers(frame.pointers), [frame.pointers]);
  const overlayPointers = useMemo(
    () => groupPointers(frame.overlay?.pointers),
    [frame.overlay?.pointers],
  );

  // Groups with nothing in them are noise: a legend entry reading "sorted 0"
  // makes a student hunt for a highlight that is not there.
  const legend = rankedKeys(frame.highlight)
    .map((k) => ({
      key: k,
      count: frame.highlight?.[k]?.length ?? 0,
      style: styleForKey(k),
    }))
    .filter((l) => l.count > 0);

  const sortedRange = frame.sorted;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/*
        Top padding sized for *stacked* pointer markers, not a single one. Merge
        sort puts `lo`, `mid` and `hi` on the same index at the start of a merge,
        so the markers stack upward; with `pt-6` the third one was clipped by the
        container and read as a rendering bug rather than three cursors.
      */}
      <div className="flex min-h-0 flex-1 flex-col overflow-x-auto pt-12">
        <div
          className={[
            // `flex-1` (not `h-full`) so the row always has a definite height and
            // the bars' percentage heights resolve against it.
            'flex w-max min-h-0 flex-1 items-stretch',
            useBars ? 'gap-[2px]' : 'gap-1',
            compact ? 'gap-0.5' : '',
          ].join(' ')}
          role="img"
          aria-label={[
            `Array of ${n} values: ${values.map(formatValue).join(', ')}.`,
            describePointers(frame.pointers),
            sortedRange
              ? `Indices ${sortedRange[0]} to ${sortedRange[1] - 1} are in final position.`
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {values.map((v, i) => {
            const style = resolveStyle(i, frame.highlight);
            const inSorted = sortedRange ? i >= sortedRange[0] && i < sortedRange[1] : false;
            const text = formatValue(v);
            const cellMin = compact ? 12 : n > 40 ? 20 : 34;
            return (
              <div
                key={i}
                className="relative flex min-w-0 flex-1 flex-col justify-end"
                style={{ minWidth: cellMin, maxWidth: useBars ? 90 : 110 }}
              >
                <CellPointers
                  byIndex={pointerGroups}
                  index={i}
                  showLabels={showPointerLabels}
                  compact={compact}
                />
                {useBars ? (
                  <div
                    className={[
                      'flex items-start justify-center rounded-t-sm border-t-2 pt-1',
                      'text-[11px] font-semibold tabular-nums',
                      'transition-[height,background-color] duration-200 ease-out',
                      style.bg,
                      style.border,
                      style.text,
                    ].join(' ')}
                    style={{
                      height: `${6 + ((Number(v) - min) / span) * 86}%`,
                      ...(inSorted ? { boxShadow: 'inset 0 0 0 2px rgb(34 197 94 / 0.5)' } : {}),
                    }}
                  >
                    <span className="px-0.5 leading-3">{text}</span>
                  </div>
                ) : (
                  <div
                    className={[
                      'flex h-full items-center justify-center rounded border px-1 text-center',
                      'text-xs font-semibold tabular-nums transition-colors duration-150',
                      compact ? 'min-h-5 text-[9px]' : 'min-h-9',
                      style.bg,
                      style.border,
                      style.text,
                      inSorted ? 'ring-2 ring-emerald-500/50' : '',
                    ].join(' ')}
                  >
                    <span className="truncate">{text}</span>
                  </div>
                )}
                {!compact ? (
                  <div className="mt-1 text-center text-[9px] text-slate-500 tabular-nums">{i}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {frame.overlay ? (
        <div className="shrink-0">
          <div className="mb-1 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
            {frame.overlay.label}
          </div>
          {/* Room above the overlay row for its own pointer markers, which
              otherwise land on top of the main array's index labels. */}
          <div className="flex gap-[2px] pt-6">
            {frame.overlay.values.map((v, i) => (
              <div
                key={i}
                className="relative flex h-6 min-w-0 flex-1 items-center justify-center rounded border border-slate-700 bg-slate-800/60 text-[10px] text-slate-300 tabular-nums"
                style={{ minWidth: 20, maxWidth: 110 }}
              >
                <CellPointers
                  byIndex={overlayPointers}
                  index={i}
                  showLabels={showPointerLabels}
                  compact
                />
                <span className="truncate px-0.5">{formatValue(v)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {legend.length > 0 ? (
        <ul className="flex shrink-0 flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
          {legend.map((l) => (
            <li key={l.key} className="flex items-center gap-1.5">
              <span
                className={[
                  'inline-block h-2.5 w-2.5 rounded-sm border',
                  l.style.bg,
                  l.style.border,
                ].join(' ')}
              />
              <span className="font-medium text-slate-300">{l.key}</span>
              <span className="tabular-nums">{l.count}</span>
            </li>
          ))}
          {sortedRange ? (
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm border border-emerald-500 bg-emerald-500/20" />
              <span className="font-medium text-slate-300">final position</span>
            </li>
          ) : null}
        </ul>
      ) : (
        <div className="shrink-0 text-[10px] text-slate-600">nothing highlighted in this step</div>
      )}
    </div>
  );
});
