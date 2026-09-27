import { memo, useMemo } from 'react';
import type { HashFrame } from '../../core/trace/types.ts';
import { resolveStyle, styleForKey } from './palette.ts';

/**
 * Hash table viewport.
 *
 * The whole reason to draw a hash table is the part that is invisible in code:
 * *where the key actually lands*. So every frame shows the bucket array with
 * the hash function spelled out, and the chains hanging off each bucket. Watch
 * a resize rehash every key and the O(1) claim stops being an assertion.
 */
export const HashView = memo(function HashView({ frame }: { frame: HashFrame }) {
  const keys = Object.keys(frame.highlight ?? {});
  const legend = keys.map((k) => ({
    key: k,
    count: frame.highlight?.[k]?.length ?? 0,
    style: styleForKey(k),
  }));

  const load = useMemo(
    () => (frame.capacity > 0 ? frame.size / frame.capacity : 0),
    [frame.size, frame.capacity],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-text-muted">
        <span>
          <span className="font-medium text-text-muted">size</span> {frame.size}
        </span>
        <span>
          <span className="font-medium text-text-muted">capacity</span> {frame.capacity}
        </span>
        <span>
          <span className="font-medium text-text-muted">load factor</span>{' '}
          <span className={load > 0.75 ? 'font-bold text-danger' : 'tabular-nums'}>
            {load.toFixed(2)}
          </span>
          {load > 0.75 ? ' — time to resize' : ''}
        </span>
        {frame.probeNote ? (
          <span className="font-mono text-accent-hover">{frame.probeNote}</span>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 items-stretch gap-1.5 overflow-x-auto">
        {frame.buckets.map((bucket, bi) => {
          const probing = frame.probing === bi;
          return (
            <div
              key={bucket.id}
              className={[
                'flex w-28 shrink-0 flex-col rounded border transition-colors duration-150',
                probing
                  ? 'border-accent bg-accent/10'
                  : 'border-border-strong bg-surface-raised/40',
              ].join(' ')}
            >
              <div
                className={[
                  'border-b px-2 py-1 text-center font-mono text-[10px]',
                  probing
                    ? 'border-accent/50 text-accent-hover'
                    : 'border-border-strong text-text-subtle',
                ].join(' ')}
              >
                [{bi}]
              </div>
              <div className="flex flex-1 flex-col gap-1 p-1.5">
                {bucket.entries.length === 0 ? (
                  <div className="py-2 text-center text-[10px] text-text-faint">—</div>
                ) : null}
                {bucket.entries.map((e) => {
                  const style = resolveStyle(e.id, frame.highlight);
                  return (
                    <div
                      key={e.id}
                      className={[
                        'rounded border px-1.5 py-1 text-center transition-colors duration-150',
                        style.bg,
                        style.border,
                        style.text,
                      ].join(' ')}
                    >
                      <div className="truncate font-mono text-[11px] font-bold">{e.key}</div>
                      <div className="truncate text-[10px] opacity-80 tabular-nums">
                        → {String(e.value)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {frame.evicted?.length ? (
        <div className="shrink-0 text-[10px] text-danger">
          rehashed and moved: {frame.evicted.join(', ')}
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
      ) : (
        <div className="shrink-0 text-[10px] text-text-faint">
          chains are empty — every bucket is a direct hit
        </div>
      )}
    </div>
  );
});
