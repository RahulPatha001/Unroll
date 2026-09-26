/**
 * The trace contract — the keystone of the whole application.
 *
 * An algorithm never touches the screen. It is a pure generator that yields
 * `Frame` objects, each one an immutable snapshot of "what the data structure
 * looks like right now, and which semantic step produced it".
 *
 * Two properties make everything downstream cheap:
 *
 *  1. **Snapshots, not deltas.** `index--` is the entire implementation of
 *     "step backwards". Scrubbing to frame N is O(1) in both directions. We
 *     can afford the memory because inputs and frame counts are capped (§7 of
 *     the plan). A delta encoding would cost ~10x the complexity in the player
 *     to save memory we do not need.
 *
 *  2. **Named highlights, not fixed fields.** `highlight: { window: [2,3,4] }`
 *     rather than `active`/`compare`/`sorted` booleans. Adding "highlight the
 *     current sliding window" or "the elements already picked by Quicksort" is
 *     a new *key*, not a new field, a new renderer, and a new colour. This is
 *     what lets 50+ algorithms share one viewport per family.
 *
 * There is no React and no DOM anywhere in `core/` — enforced by a Biome
 * `noRestrictedImports` rule — so algorithms are testable in plain Node and
 * could be extracted into a standalone package or a Worker untouched.
 */

export type NodeId = string;

/** How a cell's value should be rendered. Affects glyphs only, never logic. */
export type CellMode = 'number' | 'char' | 'string' | 'bool';

export type CellValue = number | string;

/**
 * Highlight-group keys are matched against a fixed palette; see `PALETTE_ORDER`.
 *
 * Values are indices for the index-based kinds (array, linear, grid) and node
 * ids for the identity-based ones (tree, trie, graph, linked, hash). Both are
 * allowed everywhere so one `Record<string, ...>` type covers every viewport and
 * a new kind never needs a new highlight type.
 */
export type Highlight = Record<string, Array<NodeId | number>>;

export interface FrameMeta {
  /** Monotonic, 0-based. Assigned by the materialiser, never by the author. */
  index: number;
  /**
   * One sentence, plain language, present tense: what just happened.
   * This is what a screen reader announces and what the student reads first,
   * so it is load-bearing copy — not a debug string.
   */
  note: string;
  /**
   * Names the *semantic step* this frame came from, e.g. `'compare'`,
   * `'swap'`, `'relax'`, `'rotate-right'`.
   *
   * This is the seam between the animation and the code panel. Every language
   * version of the algorithm marks the corresponding line with `# @anchor
   * compare`, and `core/code/anchors.ts` turns that into a line range. So the
   * line highlighted in Python and the line highlighted in Java are provably
   * the same step — which is the entire learning experience. See plan §5.
   */
  anchor: string;
  /** Optional short heading for the viewport, e.g. "Pass 3 of 6". */
  caption?: string;
  /** Running operation count: comparisons, swaps, relaxations, pushes. */
  ops?: number;
  /**
   * Live scalar variables, e.g. `{ i: 3, j: 7, sum: 10, target: 9 }`.
   * Rendered as a live readout under the viewport. Cheap to emit and one of
   * the highest-value teaching aids there is: it makes the invisible concrete.
   */
  vars?: Record<string, CellValue | boolean>;
}

interface Highlighted {
  /**
   * Named groups of highlighted indices (arrays/grids) or node ids
   * (trees/graphs/linked lists). Keys are chosen by the algorithm: `'sorted'`,
   * `'window'`, `'picked'`, `'frontier'`, `'unvisited'`, `'answer'`.
   * Every key gets a colour from a fixed palette and appears in the
   * auto-derived legend, so meaning is never carried by colour alone.
   */
  highlight?: Highlight;
  /**
   * Terminal or notable state, as a free-form string so algorithms can say
   * whatever is true: `'found'`, `'not-found'`, `'sorted'`, `'exhausted'`,
   * `'cycle'`, `'overflow'`, `'negative'`.
   */
  result?: string | null;
}

/* ------------------------------------------------------------------ *
 * Array family: sorting, two pointers, sliding window, interval scan
 * ------------------------------------------------------------------ */

export interface ArrayFrame extends FrameMeta, Highlighted {
  kind: 'array';
  values: CellValue[];
  mode?: CellMode;
  /** Half-open range `[from, to)` already known to be in final position. */
  sorted?: [number, number];
  /**
   * Named cursors, rendered as labelled markers above the cells. This is what
   * makes two pointers, sliding window, binary search, merge and Kadane all
   * share one renderer: `{ left, right }`, `{ i, j, k }`, `{ low, high, mid }`.
   */
  pointers?: Record<string, number>;
  /**
   * A second row of cells beneath the main one, e.g. the prefix-sum array or a
   * sorted copy shown for comparison. Never more than one — if an algorithm
   * needs two extra rows it needs a different viewport, not a deeper overlay.
   */
  overlay?: {
    label: string;
    values: CellValue[];
    mode?: CellMode;
    pointers?: Record<string, number>;
  };
}

/* ------------------------------------------------------------------ *
 * Stack / queue / deque / monotonic stack
 * ------------------------------------------------------------------ */

export interface LinearFrame extends FrameMeta, Highlighted {
  kind: 'linear';
  flavour: 'stack' | 'queue' | 'deque';
  items: CellValue[];
  mode?: CellMode;
  /**
   * Named edges rather than indices, because the meaning differs per
   * algorithm: `{ top: 3 }` for a stack, `{ front: 0, rear: 4 }` for a queue,
   * `{ left, right }` for a monotonic deque where the window shrinks from both
   * ends. `front: items.length` is a legal "empty queue" marker.
   */
  edges?: Record<string, number>;
  /**
   * A second row beneath the structure.
   *
   * Here for one specific, important reason: **a min-stack is a stack plus an
   * auxiliary stack of running minima**, and the auxiliary stack *is* the
   * algorithm. Rendering only the main stack would show the student a data
   * structure whose entire trick is invisible, which is worse than not
   * animating it at all.
   *
   * So this mirrors `ArrayFrame.overlay` deliberately: one concept, one shape,
   * two viewports, rather than a general "second thing" abstraction that nobody
   * can typecheck.
   */
  overlay?: {
    label: string;
    values: CellValue[];
    mode?: CellMode;
    pointers?: Record<string, number>;
  };
}

/* ------------------------------------------------------------------ *
 * Singly / doubly linked list
 * ------------------------------------------------------------------ */

export interface LinkedNode {
  id: NodeId;
  value: CellValue;
  next: NodeId | null;
  /** Present iff the list is doubly linked. Omitted entirely for singly lists. */
  prev?: NodeId | null;
}

export interface LinkedFrame extends FrameMeta, Highlighted {
  kind: 'linked';
  nodes: LinkedNode[];
  /** Doubly-linked variant renders the `prev` chain and two pointer fields. */
  doubly?: boolean;
  /** Named node ids rendered as labelled arrows, e.g. `{ slow: n3, fast: n7 }`. */
  pointers?: Record<string, NodeId>;
  /** Set when the list is circular and should be drawn as a loop. */
  circular?: boolean;
  /** Highlight the node ids whose `next` field changed in this frame. */
  relinked?: NodeId[];
}

/* ------------------------------------------------------------------ *
 * Hash table: buckets, chains, probing, resizing
 * ------------------------------------------------------------------ */

export interface HashEntry {
  key: string;
  value: CellValue;
  /** Identity of the chain entry, so a highlight survives a rehash. */
  id: NodeId;
}

export interface HashFrame extends FrameMeta, Highlighted {
  kind: 'hash';
  buckets: Array<{ id: NodeId; entries: HashEntry[] }>;
  size: number;
  capacity: number;
  /** Index of the bucket currently being probed, if any. */
  probing?: number;
  /** Human-readable hash of the key in flight, e.g. `"hash('apple') = 7"`. */
  probeNote?: string;
  /** Keys the table has evicted during a resize. */
  evicted?: string[];
}

/* ------------------------------------------------------------------ *
 * Tree family: BST, AVL, traversals, binary heap
 * ------------------------------------------------------------------ */

export interface TreeNode {
  id: NodeId;
  value: CellValue;
  parent: NodeId | null;
  side: 'left' | 'right' | 'root';
  depth: number;
  /** Optional payload for rebalancing visuals, e.g. `{ height: 3, size: 7 }`. */
  meta?: Record<string, number>;
}

export interface TreeFrame extends FrameMeta, Highlighted {
  kind: 'tree';
  nodes: Record<NodeId, TreeNode>;
  root: NodeId | null;
  /**
   * Current recursion path, root → current node. Drawn as a highlighted spine
   * so a student can see where the call stack actually is. This is the single
   * most useful thing to render for any recursive algorithm.
   */
  path?: NodeId[];
  /**
   * Binary-heap mode. A heap is conceptually a tree but students think of it
   * as an array, so `asArray` renders the same nodes flat with the index
   * arithmetic (`2i+1`, `2i+2`) shown. The frame data is identical either way.
   */
  asArray?: boolean;
  /** node id → its index in the implicit array. Present iff `asArray`. */
  arrayIndex?: Record<NodeId, number>;
  /** Result is a node id (e.g. the node found) or null. */
  result?: NodeId | null;
}

/* ------------------------------------------------------------------ *
 * Trie / radix tree
 * ------------------------------------------------------------------ */

export interface TrieNode {
  id: NodeId;
  /** Single character for a plain trie, '' for the root. */
  char: string;
  children: NodeId[];
  parent: NodeId | null;
  isWord: boolean;
  /** Character index from the root. Drives the left-to-right layout. */
  depth: number;
}

export interface TrieFrame extends FrameMeta, Highlighted {
  kind: 'trie';
  nodes: Record<NodeId, TrieNode>;
  root: NodeId;
  /** Root → current node while inserting or searching. */
  path?: NodeId[];
  /** The word being inserted / searched, rendered beneath the tree. */
  probe?: string;
  /** Index into `probe` that the cursor is at, so the walk is visible. */
  probeIndex?: number;
}

/* ------------------------------------------------------------------ *
 * Graph family: BFS, DFS, Dijkstra, topo sort, Kruskal, flood fill
 * ------------------------------------------------------------------ */

export interface GraphNode {
  id: NodeId;
  label?: string;
  /**
   * Explicit, stable coordinates in a 0..1000 x 0..1000 box.
   *
   * Computed once per input by the algorithm module, never per frame. A
   * force-directed layout is prettier and was rejected: it re-settles between
   * frames, so a student cannot track a node with their eyes, which destroys
   * the one thing step-by-step playback is for.
   */
  x: number;
  y: number;
}

export interface GraphEdge {
  from: NodeId;
  to: NodeId;
  weight?: number;
  directed: boolean;
  /** Union-Find / MST: whether this edge has been accepted into the forest. */
  inSet?: boolean;
}

export interface GraphFrame extends FrameMeta, Highlighted {
  kind: 'graph';
  nodes: Record<NodeId, GraphNode>;
  edges: GraphEdge[];
  /** Queue or stack contents, in order. Empty array is a valid state. */
  frontier: NodeId[];
  visited: NodeId[];
  /** Dijkstra / Bellman-Ford: current best-known distance per node. */
  distance?: Record<NodeId, number>;
  /** Union-Find: parent pointer per node, rendered as a forest. */
  parent?: Record<NodeId, NodeId>;
  /** BFS depth or topological layer per node; drives layered layout hints. */
  layer?: Record<NodeId, number>;
  result?: NodeId | null;
}

/* ------------------------------------------------------------------ *
 * Grid / matrix / DP table
 * ------------------------------------------------------------------ */

export interface GridFrame extends FrameMeta, Highlighted {
  kind: 'grid';
  rows: number;
  cols: number;
  /** Row-major, length `rows * cols`. `null` renders as an empty cell. */
  cells: CellValue[] | null;
  /** Optional headers, e.g. the characters of `s1` down the left of an LCS table. */
  rowHeader?: string[];
  colHeader?: string[];
  mode?: CellMode;
  /**
   * Per-cell decoration keyed by row-major index: `'match'`, `'mismatch'`,
   * `'fromAbove'`, `'fromLeft'`, `'diag'`. Drives the legend for DP tables,
   * where *where a value came from* is the entire lesson.
   */
  tags?: Record<number, string>;
  /**
   * A single walkable cell, for grid-search algorithms (flood fill, maze
   * solving). Separate from `highlight` because exactly one cell is special
   * and it needs its own affordance.
   */
  cursor?: { row: number; col: number };
  /** Region already claimed, e.g. a filled island. Rendered as solid cells. */
  filled?: number[];
}

/** The closed set of frame shapes. Adding a member is a design change, not a per-algorithm liberty. */
export type Frame =
  | ArrayFrame
  | LinearFrame
  | LinkedFrame
  | HashFrame
  | TreeFrame
  | TrieFrame
  | GraphFrame
  | GridFrame;

/** Discriminators, for exhaustive switches. */
export const FRAME_KINDS = [
  'array',
  'linear',
  'linked',
  'hash',
  'tree',
  'trie',
  'graph',
  'grid',
] as const satisfies readonly Frame['kind'][];

export type FrameKind = (typeof FRAME_KINDS)[number];

/**
 * The highlight vocabulary, ordered most-specific first — the index **is** the
 * colour rank. When several groups cover one cell the lowest rank wins, so a
 * broad background state never hides the specific thing happening now.
 *
 * Every key any algorithm emits must appear here. That is not a formality: an
 * unrecognised key gets `PALETTE_ORDER.length` as its rank, which wraps onto
 * rank 0, so two unrelated states would share the `answer` colour and the one
 * distinction the palette exists to draw would silently disappear. Ten such keys
 * shipped once. `contract.test.ts` now fails the build on a new one.
 *
 * The guarantee that matters is not that all ranks are globally distinct — 33
 * distinguishable hues is not a thing a student can do. It is that the groups
 * *visible in any single frame* never collide, which `contract.test.ts` asserts
 * per frame and per algorithm.
 */
export const PALETTE_ORDER = [
  // ── Strong: what is happening *right now* ───────────────────────────────
  // Saturated, and the only ranks carrying a glyph, because these are the
  // states a student must notice the instant they appear.
  'answer',
  'picked',
  'found',
  'current',
  'active',
  'compare',
  'swapping',
  'temp',
  'pivot',
  'inMst',
  'filled',
  'tail',
  'cycle',
  'lopsided',
  'endingHere',
  'output',
  // ── Mid: part of the story, but not the instantaneous event ─────────────
  'frontier',
  'path',
  'reached',
  'relaxed',
  'unvisited',
  'reversed',
  'best',
  'measured',
  'diag',
  'fromAbove',
  'fromLeft',
  'window',
  // ── Muted: background state ─────────────────────────────────────────────
  // A slate ramp rather than more hues, on purpose. These are the ranks that
  // most often cover half the structure at once, and a student cannot usefully
  // tell 33 colours apart. Quiet-by-lightness is the honest signal here.
  'remaining',
  'sorted',
  'outOfPlace',
  'visited',
  'settled',
  'dominated',
  'ids',
] as const;

/** Deterministic fallback so an unknown highlight key still gets a stable colour. */
export function highlightRank(key: string): number {
  const i = (PALETTE_ORDER as readonly string[]).indexOf(key);
  return i === -1 ? PALETTE_ORDER.length : i;
}
