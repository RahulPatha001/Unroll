import type { Frame } from '../../core/trace/types.ts';

/**
 * The exhaustiveness backstop.
 *
 * `Viewport` narrows to `never` by the time it gets here, so this component
 * should be unreachable. It exists anyway, because "unreachable" plus a visible
 * message beats an unhandled render crash if the union ever grows a member and
 * the exhaustiveness check is bypassed (e.g. a frame cast from JSON).
 */
export function NoViewport({ frame }: { frame: never }) {
  const kind = (frame as { kind?: unknown } | null)?.kind;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="text-sm font-semibold text-danger">
        No renderer for frame kind &quot;{String(kind)}&quot;
      </p>
      <p className="max-w-sm text-xs text-text-subtle">
        This is a bug in the app, not in the algorithm. Add a renderer to{' '}
        <code className="text-text-muted">src/features/viewport/Viewport.tsx</code>.
      </p>
    </div>
  );
}

export type { Frame };
