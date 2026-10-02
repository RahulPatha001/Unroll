import { lazy, Suspense } from 'react';
import type { Frame } from '../../core/trace/types.ts';
import { NoViewport } from './NoViewport.tsx';

/**
 * The renderer registry.
 *
 * The single place where the `Frame` union is turned into pixels. The `never` in
 * the default branch is the enforcement mechanism from plan §3.2: adding a ninth
 * frame kind to the union makes this function a compile error until a renderer
 * exists for it. Without it, a new frame kind would render as a blank box and
 * someone would only find out in production.
 *
 * ## Every renderer is lazily loaded, and that is a measured decision
 *
 * All eight renderers are ~2,000 lines between them, and a given run needs exactly
 * **one** of them — `ArrayView` draws arrays and has nothing to say about a trie.
 * Importing them statically meant every visitor downloaded all eight to look at a
 * bar chart.
 *
 * This was found by measurement rather than by inspection, which is the point worth
 * recording: `tools/budget.mjs` used to classify a chunk as "initial" by a filename
 * regex that never matched rolldown's hashed names, so React's 78.6 kB and the
 * catalog's 16.4 kB were both excluded from the reported total. The gate read
 * 106 kB and passed while the real first load was over 200. Once the tool walked the
 * actual static import graph, the renderer fan-out was the largest thing left to cut.
 *
 * ## The fallback must not resize anything
 *
 * `LoadingViewport` occupies exactly the box the renderer will, so the fetch never
 * causes a reflow — the same rule the whole layout is built around, since a
 * visualisation that changes size for any reason other than the algorithm is a bug
 * the student can see.
 *
 * Deliberately *not* a skeleton of grey bars. A skeleton implies a known shape, and
 * a graph or a trie has no shape to guess; a placeholder that looks like the real
 * thing and then becomes something else is worse than an honest blank.
 */
function LoadingViewport() {
  return (
    <div className="flex h-full w-full items-center justify-center text-[12px] text-text-subtle">
      Preparing the view…
    </div>
  );
}

const ArrayView = lazy(() => import('./ArrayView.tsx').then((m) => ({ default: m.ArrayView })));
const GridView = lazy(() => import('./GridView.tsx').then((m) => ({ default: m.GridView })));
const LinearView = lazy(() => import('./GridView.tsx').then((m) => ({ default: m.LinearView })));
const HashView = lazy(() => import('./HashView.tsx').then((m) => ({ default: m.HashView })));
const LinkedListView = lazy(() =>
  import('./LinkedListView.tsx').then((m) => ({ default: m.LinkedListView })),
);
const TreeView = lazy(() => import('./TreeView.tsx').then((m) => ({ default: m.TreeView })));
const TrieView = lazy(() => import('./TrieView.tsx').then((m) => ({ default: m.TrieView })));
const GraphView = lazy(() => import('./GraphView.tsx').then((m) => ({ default: m.GraphView })));

export function Viewport({
  frame,
  showPointerLabels,
}: {
  frame: Frame | null;
  showPointerLabels?: boolean;
}) {
  if (!frame) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-subtle">
        Press play to run the algorithm.
      </div>
    );
  }

  return (
    <Suspense fallback={<LoadingViewport />}>{renderFrame(frame, showPointerLabels)}</Suspense>
  );
}

/**
 * Frame to element.
 *
 * Split out from `Viewport` so the `switch` and its `never` check are in one place
 * and the `Suspense` boundary wraps a stable child. Putting the boundary *inside*
 * each branch instead would give eight fallbacks to keep identical, and any two of
 * them that drifted would be indistinguishable.
 */
function renderFrame(frame: Frame, showPointerLabels?: boolean) {
  switch (frame.kind) {
    case 'array':
      return (
        <ArrayView
          frame={frame}
          showPointerLabels={showPointerLabels}
          compact={frame.values.length > 90}
        />
      );
    case 'linear':
      return <LinearView frame={frame} />;
    case 'linked':
      return <LinkedListView frame={frame} />;
    case 'hash':
      return <HashView frame={frame} />;
    case 'tree':
      return <TreeView frame={frame} />;
    case 'trie':
      return <TrieView frame={frame} />;
    case 'graph':
      return <GraphView frame={frame} />;
    case 'grid':
      return <GridView frame={frame} />;
    default: {
      const exhaustive: never = frame;
      return <NoViewport frame={exhaustive} />;
    }
  }
}

export { ArrayView, GraphView, GridView, HashView, LinearView, LinkedListView, TreeView, TrieView };
