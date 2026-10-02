import type { Frame } from '../../core/trace/types.ts';
import { ArrayView } from './ArrayView.tsx';
import { GraphView } from './GraphView.tsx';
import { GridView, LinearView } from './GridView.tsx';
import { HashView } from './HashView.tsx';
import { LinkedListView } from './LinkedListView.tsx';
import { NoViewport } from './NoViewport.tsx';
import { TreeView } from './TreeView.tsx';
import { TrieView } from './TrieView.tsx';

/**
 * The renderer registry.
 *
 * The single place where the `Frame` union is turned into pixels. The
 * `never` in the default branch is the enforcement mechanism from plan §3.2:
 * adding a ninth frame kind to the union makes this function a compile error
 * until a renderer exists for it. Without it, a new frame kind would render as
 * a blank box and someone would only find out in production.
 *
 * Each branch is a separately `memo`ised component, so switching algorithms
 * does not remount anything and per-frame updates touch one subtree.
 */
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
