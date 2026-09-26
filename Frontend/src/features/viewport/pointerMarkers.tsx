/**
 * Pointer markers.
 *
 * A named cursor is the single most reused idea in the whole app: `left`/`right`
 * for two pointers, `i`/`j`/`k` for merge, `low`/`high`/`mid` for binary search,
 * `front`/`rear` for a queue, `j` for a sort's inner loop. Because they are just
 * `Record<string, number>`, all of those algorithms share one renderer — and a
 * new one costs zero code.
 *
 * Markers are rendered *inside* their own cell rather than as an absolutely
 * positioned overlay. That is deliberate: an overlay has to guess cell widths,
 * and it is wrong the moment a bar chart and a cell grid disagree, or the
 * window is resized, or the array wraps. Living inside the cell means the
 * marker is always exactly over the value it names, at any size, in any layout,
 * with no measurement and no `ResizeObserver`.
 *
 * Two pointers can share a cell (a window of length 1, a converging binary
 * search), so they stack rather than overlap into an unreadable smear.
 */
import { pointerHueClass } from './palette.ts';

export interface PointerPlacement {
  name: string;
  index: number;
  /** How many other pointers share this cell, minus one. */
  offset: number;
}

/**
 * Group pointers by the cell they point at, preserving declaration order so
 * `left` is always on top of `right` when they coincide.
 */
export function groupPointers(
  pointers: Record<string, number> | undefined,
): Map<number, PointerPlacement[]> {
  const byIndex = new Map<number, PointerPlacement[]>();
  if (!pointers) return byIndex;
  for (const [name, raw] of Object.entries(pointers)) {
    if (!Number.isFinite(raw)) continue;
    const index = Math.trunc(raw);
    const list = byIndex.get(index) ?? [];
    list.push({ name, index, offset: list.length });
    byIndex.set(index, list);
  }
  return byIndex;
}

export function PointerChip({
  placement,
  allNames,
  showLabel,
  compact,
}: {
  placement: PointerPlacement;
  allNames: string[];
  showLabel: boolean;
  compact: boolean;
}) {
  const hue = pointerHueClass(placement.name, allNames);
  return (
    <span
      className={[
        'pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-sm px-1',
        'bg-slate-950/95 font-bold whitespace-nowrap ring-1 ring-current',
        compact ? 'text-[8px] leading-[13px]' : 'text-[10px] leading-4',
        hue,
        placement.offset > 0 ? 'opacity-80' : '',
      ].join(' ')}
      style={{
        bottom: `calc(100% + 2px + ${placement.offset * (compact ? 13 : 16)}px)`,
        zIndex: 10 - placement.offset,
      }}
      aria-hidden="true"
    >
      {showLabel ? placement.name : '▾'}
    </span>
  );
}

export function CellPointers({
  byIndex,
  index,
  showLabels = true,
  compact = false,
}: {
  byIndex: Map<number, PointerPlacement[]>;
  index: number;
  showLabels?: boolean;
  compact?: boolean;
}) {
  const list = byIndex.get(index);
  if (!list || list.length === 0) return null;
  const allNames = [...byIndex.values()].flat().map((p) => p.name);
  return (
    <>
      {list.map((p) => (
        <PointerChip
          key={p.name}
          placement={p}
          allNames={allNames}
          showLabel={showLabels}
          compact={compact}
        />
      ))}
    </>
  );
}

/**
 * Screen-reader text for the current cursors.
 *
 * Necessary, not optional: a pointer marker is a decorative triangle to a
 * screen reader, and "the cursor is at index 3" is the single most important
 * fact on the screen during a step-through.
 */
export function describePointers(pointers: Record<string, number> | undefined): string {
  if (!pointers) return '';
  const parts = Object.entries(pointers).map(([name, i]) => `${name} at index ${i}`);
  return parts.length > 0 ? `Cursors: ${parts.join(', ')}.` : '';
}
