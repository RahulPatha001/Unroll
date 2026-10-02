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

  /*
   * Cell sizing. Two numbers, and getting the first one wrong is what left an
   * eight-bar chart using a quarter of a 1046px panel.
   *
   * `min` is the legibility floor and is the only hard constraint: a cell
   * narrower than the value's own digits is a cell you cannot read, and once the
   * floors add up to more than the panel the row overflows and the container
   * scrolls sideways, which is the documented behaviour above 40 elements.
   *
   * `max` is not a legibility floor at all — it was 90px for bars and 110px for
   * cells, and it was *inert*: the row was `w-max`, so its width came from the
   * cells' max-content size, which for a two-digit number is about 34px, and the
   * clamp never bound. The row was the problem, not the ceiling. The row is now
   * sized from the width available, and the ceiling only binds on small inputs.
   *
   * The ceiling that is left is deliberately loose. Its job is to stop a
   * three-element input drawing three bars as wide as the panel is tall, which
   * stops reading as a bar chart; it does not bind for anything from about five
   * elements upward, so the common case is governed entirely by the space
   * available. See the note on the overlay row below for why the overlay has to
   * use the same numbers.
   */
  const cellMin = compact ? 12 : n > 40 ? 20 : 34;
  const cellMax = 200;
  const cellStyle = { minWidth: cellMin, maxWidth: cellMax };
  // Resolved to one value rather than layered. `compact` implies `!useBars`, so
  // the compact case used to carry `gap-1` *and* `gap-0.5` at once and which of
  // them won was a question about the generated stylesheet rather than about the
  // code — the same class of mistake as the `lg:translate-x-0` sidebar bug.
  const gap = useBars ? 'gap-[2px]' : compact ? 'gap-0.5' : 'gap-1';

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
            //
            // `w-full min-w-max` rather than `w-max`, and both halves matter. The
            // row used to be `w-max`, which is *only* ever the width of its
            // content — the cells' max-content size, about 34px for a two-digit
            // number — so an eight-bar chart was 286px wide in a 1046px panel and
            // the available width never entered into it. `w-full` makes the
            // space available the target; `min-w-max` keeps the row able to grow
            // past it when the `minWidth` floors add up to more than the panel,
            // which is the documented behaviour above 40 elements and the reason
            // the container scrolls sideways. `w-full` alone would have fixed the
            // width and left the cells overflowing their own row.
            'flex w-full min-w-max min-h-0 flex-1 items-stretch',
            gap,
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
            return (
              <div
                key={i}
                className="relative flex min-w-0 flex-1 flex-col justify-end"
                style={cellStyle}
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
                      'flex items-start justify-center rounded-t-md border-t-2 pt-1',
                      'text-[11px] font-semibold tabular-nums',
                      // One shared spring so the whole picture settles together.
                      // Height is the value changing; background is the meaning
                      // changing; both ride the same curve and finish together.
                      // `transform-gpu` keeps the compositor on the fast path
                      // while the trace rebuilds underneath.
                      'cell-spring transform-gpu',
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
                      'flex h-full items-center justify-center rounded-lg border px-1 text-center',
                      'text-xs font-semibold tabular-nums cell-spring transform-gpu',
                      compact ? 'min-h-5 text-[9px]' : 'min-h-9',
                      style.bg,
                      style.border,
                      style.text,
                      inSorted ? 'ring-2 ring-success-deep/50' : '',
                    ].join(' ')}
                  >
                    <span className="truncate">{text}</span>
                  </div>
                )}
                {!compact ? (
                  <div className="mt-1 text-center text-[9px] text-text-subtle tabular-nums">
                    {i}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {frame.overlay ? (
        <div className="shrink-0">
          <div className="mb-1 text-[10px] font-semibold tracking-wide text-text-subtle uppercase">
            {frame.overlay.label}
          </div>
          {/* Room above the overlay row for its own pointer markers, which
              otherwise land on top of the main array's index labels.

              The cells take the *same* min/max and the same gap as the row
              above, and that is not tidiness. The overlay is a second copy of
              the same values — merge sort's auxiliary array, counting sort's
              output — and the only way a student can see that the auxiliary slot
              3 is the same position as index 3 is for the two rows to line up.
              They did not: the main row clamped at 90 and this one at 110, so
              by the eighth cell the two grids were 140px out of step, and every
              value in the overlay appeared to belong to the wrong bar. */}
          <div className={['flex w-full min-w-max pt-6', gap].join(' ')}>
            {frame.overlay.values.map((v, i) => (
              <div
                key={i}
                className="relative flex h-6 min-w-0 flex-1 items-center justify-center rounded border border-border-strong bg-surface-inset/60 text-[10px] text-text-muted tabular-nums"
                style={cellStyle}
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
              <span className="tabular-nums">{l.count}</span>
            </li>
          ))}
          {sortedRange ? (
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm border border-success-deep bg-success-deep/20" />
              <span className="font-medium text-text-muted">final position</span>
            </li>
          ) : null}
        </ul>
      ) : (
        <div className="shrink-0 text-[10px] text-text-faint">nothing highlighted in this step</div>
      )}
    </div>
  );
});
