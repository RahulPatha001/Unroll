import type { ReactNode } from 'react';
import { cn } from '../../lib/utils.ts';

/**
 * A scrubber with a visible track.
 *
 * ## Why this component exists at all
 *
 * Because `index.css` styles `input[type="range"]` globally, and part of that is
 * `-webkit-appearance: none; background: transparent`. That is right for the main
 * transport, which draws its own filled track behind the input — and it means every
 * *other* range input in the app renders as a bare thumb floating on the panel
 * colour, with nothing to indicate how far along it is.
 *
 * The article stepper and the compare page both had exactly that: a wide empty gap
 * where the slider should be. Not a bug anyone would file — you cannot tell a missing
 * control from a control that is merely subtle until you try to use it.
 *
 * So this is the transport's pattern, extracted: an opaque track, a filled
 * proportion behind it, and the real input on top, transparent. It reads position by
 * sight, which is the whole point of a scrubber.
 *
 * ## Why the input stays on top rather than being replaced by a div
 *
 * Because a `<div>` cannot be dragged, cannot be focused, cannot be operated with the
 * arrow keys, and announces nothing. The visible track is decoration *underneath* a
 * real, accessible control that keeps its `aria-valuetext` — which is what makes
 * "step 12 of 69" available to a screen reader rather than only visible.
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
    <div className={cn('flex items-center gap-2.5', className)}>
      {before}
      <div className="relative min-w-0 flex-1">
        {/*
          The track and the fill.

          `pointer-events-none` because the input sits on top and owns the drag; the
          fill is purely a readout of the same number the input already has, so
          clicking it must go to the input rather than to a div that ignores clicks.
        */}
        <div className="pointer-events-none absolute top-1/2 h-1.5 w-full -translate-y-1/2 overflow-hidden rounded-full bg-surface-inset">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent-deep via-accent to-accent-hover shadow-sm shadow-accent-deep/25 transition-[width] duration-100"
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
            // The thumb is 16px in the global stylesheet but the track here is 6px,
            // so without this the thumb overhangs by 5px on each side and drags the
            // perceived row height up with it.
            '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4',
            '[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4',
            'disabled:pointer-events-none disabled:opacity-40',
          )}
        />
      </div>
      {after}
    </div>
  );
}
