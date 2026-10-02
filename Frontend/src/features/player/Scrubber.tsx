import type { ReactNode } from 'react';
import { cn } from '../../lib/utils.ts';

/**
 * A scrubber with a visible track.
 *
 * The transport's pattern, extracted: an opaque track, a filled proportion
 * behind it, and the real input on top, transparent. It reads position by
 * sight, which is the whole point of a scrubber.
 *
 * The input stays on top rather than being replaced by a div because a `<div>`
 * cannot be dragged, focused, operated with arrow keys, or announced. The
 * visible track is decoration *underneath* a real, accessible control that
 * keeps its `aria-valuetext` — "step 12 of 69" for a screen reader.
 */

export function Scrubber({
  index,
  length,
  onSeek,
  label,
  /** Reachable name, which should say what is being scrubbed. */
  valueText,
  className,
  before,
  after,
}: {
  index: number;
  length: number;
  onSeek: (index: number) => void;
  label: string;
  valueText: string;
  className?: string;
  /** Rendered to the left of the track. Controls, or a step readout. */
  before?: ReactNode;
  /** Rendered to the right of the track. Typically a percentage. */
  after?: ReactNode;
}) {
  const max = Math.max(0, length - 1);
  const pct = max > 0 ? (index / max) * 100 : 0;

  return (
    <div className={cn('group/scrub flex items-center gap-2.5', className)}>
      {before}
      <div className="relative min-w-0 flex-1 py-1.5">
        {/*
          The track and the fill. `pointer-events-none` because the input sits
          on top and owns the drag; the fill is a readout of the same number
          the input already has.
        */}
        <div className="pointer-events-none absolute top-1/2 h-1.5 w-full -translate-y-1/2 overflow-hidden rounded-full bg-surface-inset ring-1 ring-border/50 ring-inset">
          <div
            className={cn(
              'h-full rounded-full bg-gradient-to-r from-accent-deep via-accent to-accent-hover',
              'shadow-sm shadow-accent-deep/25',
              // The fill chases the thumb on one spring so scrubbing reads as
              // a single motion rather than two elements disagreeing.
              'transition-[width] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width]',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={max}
          value={Math.min(index, max)}
          onChange={(e) => onSeek(Number(e.target.value))}
          disabled={length === 0}
          aria-label={label}
          aria-valuetext={valueText}
          className={cn(
            'relative h-1.5 w-full cursor-pointer appearance-none rounded-full bg-transparent',
            '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4',
            '[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4',
            // The thumb breathes on hover so the grab target feels alive
            // without moving the row it sits in.
            '[&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-150',
            'hover:[&::-webkit-slider-thumb]:scale-110 active:[&::-webkit-slider-thumb]:scale-95',
            'disabled:pointer-events-none disabled:opacity-40',
          )}
        />
      </div>
      {after}
    </div>
  );
}
