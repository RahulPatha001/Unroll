import { byLanguage } from '../../code/anchors.ts';
import type { AlgoInput, InputSpec } from '../../input/types.ts';
import { grid } from '../../input/types.ts';
import type {
  CellValue,
  GraphEdge,
  GraphFrame,
  GraphNode,
  Highlight,
  NodeId,
} from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Flood fill, on a grid, drawn as a graph.
 *
 * The trick that makes this fit the `graph` viewport is that a grid *is* a
 * graph: one node per open cell, one edge per pair of open cells that share a
 * side. The layout comes from the cell coordinates, so the picture looks like the
 * grid the student typed in, and the `frontier` bar is the fill's work list.
 *
 * The one decision the algorithm actually makes is the neighbourhood rule, and it
 * is made *before* the traversal starts, when the adjacency is built. Four-way
 * (up, down, left, right) is the default and it is stricter than almost anyone
 * expects: a diagonal wall is an *impassable* barrier, not a thin one, and a
 * region that merely touches another one at a corner does not merge with it.
 * The `staircase` preset exists to make that visible.
 *
 * The traversal is an explicit stack rather than recursion, so the frontier bar
 * shows you the call stack of the recursive version you would normally write —
 * and, unlike the recursive version, it survives a 500,000-cell grid.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets — one row per grid line; '#' is a wall, '.' is open ground
 * ------------------------------------------------------------------ */

const PRESETS: Preset[] = [
  {
    id: 'open-field',
    label: 'Open field, 4×5',
    blurb:
      'Twenty open cells, no walls, and a start in the middle of the left edge. The baseline: with nothing to get past, the fill is a pure flood and the stack drains in one long spiral of depth-first pushes. This is what "easy" looks like, so the other presets have something to be different from.',
    input: grid(4, 5, gridCells(['.....', '.....', '.....', '.....'])),
    params: { start: 5 },
  },
  {
    id: 'hollow',
    label: 'A hole in the middle, 5×6',
    blurb:
      'A 2×2 block of wall in the middle of the region. The fill cannot go through it, so it has to travel all the way round — watch the stack grow along the top, squeeze past the corner, and come back underneath. The hole is the lesson: connectivity is about the *path*, not the distance.',
    input: grid(5, 6, gridCells(['......', '......', '..##..', '..##..', '......'])),
  },
  {
    id: 'barrier',
    label: 'A wall with one end, 5×6',
    blurb:
      'A wall running from the top edge down to the fourth row, leaving a single row of gap at the bottom. Everything to the left of the wall is only reachable by going round the end of it, and the `row`/`col` readout shows exactly where the fill is when it makes the turn.',
    input: grid(5, 6, gridCells(['..#...', '..#...', '..#...', '..#...', '......'])),
  },
  {
    id: 'staircase',
    label: 'Diagonal wall, 5×5',
    blurb:
      'A diagonal staircase of wall. Nine of the twenty open cells are never filled, and that is correct: a diagonal chain of blocked cells is a genuine barrier for a four-way fill, and only an eight-way fill would leak through the corners. This is the fact that surprises everybody once.',
    input: grid(5, 5, gridCells(['.#...', '.#...', '..#..', '...#.', '....#'])),
  },
  {
    id: 'two-regions',
    label: 'Two regions, 4×6',
    blurb:
      'A full wall column splits the grid in two. The fill claims the left half and stops, and the right half keeps its `unvisited` colour for ever. Flood fill is a reachability test wearing a paint brush, and this is the preset that says so out loud.',
    input: grid(4, 6, gridCells(['...#..', '...#..', '...#..', '...#..'])),
    params: { start: 6 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

/**
 * The neighbourhood rule, stated once. This four-element list *is* the flood fill:
 * everything downstream is a walk over the edges it produces.
 */
const FOUR_WAY: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [0, -1],
  [0, 1],
  [1, 0],
];

/**
 * Turn the grid into a graph, once.
 *
 * Node ids are the *position in the open-cell list*, which is also the index the
 * `graph` glue maps, so the four language implementations and the animation are
 * looking at the same numbering. The node's visible label is the cell's
 * row-major number in the original grid, which is the number a student would
 * count with, and `vars` carries `row`/`col` for anyone who would rather not.
 */
function read(input: AlgoInput): {
  n: number;
  rows: number;
  cols: number;
  open: number[];
  posOf: Map<number, number>;
  gridOf: number[];
  adj: number[][];
  edges: GraphEdge[];
  nodes: Record<NodeId, GraphNode>;
  coord: (grid: number) => { x: number; y: number };
  rowOf: (pos: number) => number;
  colOf: (pos: number) => number;
} {
  const rows = input.type === 'grid' ? input.rows : 0;
  const cols = input.type === 'grid' ? (input.cols ?? 0) : 0;
  const cells = input.type === 'grid' ? (input.values ?? []) : [];

  const isOpen = (g: number): boolean => {
    const c = cells[g];
    return c !== null && c !== undefined;
  };

  const open: number[] = [];
  const posOf = new Map<number, number>();
  for (let g = 0; g < rows * cols; g++) {
    if (!isOpen(g)) continue;
    posOf.set(g, open.length);
    open.push(g);
  }

  const n = open.length;
  // The layout, computed once per input and never per frame: a cell's position is
  // a property of the grid, not of the traversal.
  const coord = (g: number): { x: number; y: number } => ({
    x: Math.round(90 + ((g % Math.max(1, cols)) * 820) / Math.max(1, cols - 1)),
    y: Math.round(90 + (Math.floor(g / Math.max(1, cols)) * 820) / Math.max(1, rows - 1)),
  });
  const rowOf = (p: number): number => {
    const g = open[p] ?? 0;
    return Math.floor(g / Math.max(1, cols));
  };
  const colOf = (p: number): number => {
    const g = open[p] ?? 0;
    return g % Math.max(1, cols);
  };

  const nodes: Record<NodeId, GraphNode> = {};
  for (let p = 0; p < n; p++) {
    const g = open[p] as number;
    const { x, y } = coord(g);
    nodes[String(p)] = { id: String(p), x, y, label: String(g) };
  }

  // Four-way adjacency: up, left, right, down. No diagonals, ever.
  const adj: number[][] = open.map(() => []);
  const edges: GraphEdge[] = [];
  const drawn = new Set<string>();
  for (let p = 0; p < n; p++) {
    const g = open[p] as number;
    const r = Math.floor(g / Math.max(1, cols));
    const c = g % Math.max(1, cols);
    for (const [dr, dc] of FOUR_WAY) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const other = posOf.get(nr * cols + nc);
      if (other === undefined) continue;
      if (drawn.has(`${Math.min(p, other)}~${Math.max(p, other)}`)) continue;
      drawn.add(`${Math.min(p, other)}~${Math.max(p, other)}`);
      adj[p]?.push(other);
      if (other !== p) adj[other]?.push(p);
      edges.push({ from: String(p), to: String(other), directed: false });
    }
  }

  return {
    n,
    rows,
    cols,
    open,
    posOf,
    gridOf: open,
    adj,
    edges,
    nodes,
    coord,
    rowOf,
    colOf,
  };
}

export function* floodFill(ctx: RunContext): Generator<GraphFrame> {
  const { n, rows, cols, open, posOf, adj, edges, nodes, rowOf, colOf } = read(ctx.input);

  const startParam = Math.round(Number(ctx.params.start ?? 0));
  // The `start` param counts row-major cells of the grid, walls included, so a
  // student can read a cell index off the input and use it directly.
  const startGrid = Math.min(Math.max(0, startParam), Math.max(0, rows * cols - 1));
  const start = posOf.get(startGrid) ?? -1;

  const snap = (
    anchor: string,
    note: string,
    o: {
      caption?: string;
      ops?: number;
      vars?: Record<string, CellValue | boolean>;
      highlight?: Highlight;
      result?: string | null;
    } = {},
  ): GraphFrame => ({
    kind: 'graph',
    index: 0, // the materialiser owns this one
    anchor,
    note,
    nodes: { ...nodes },
    edges: edges.map((e) => ({ ...e })),
    // Stack order, bottom first: the right-hand entry is the next cell to fill.
    frontier: stack.map((p) => String(p)),
    visited: order.map((p) => String(p)),
    ...(o.caption === undefined ? {} : { caption: o.caption }),
    ...(o.ops === undefined ? {} : { ops: o.ops }),
    ...(o.vars === undefined ? {} : { vars: o.vars }),
    ...(o.highlight === undefined ? {} : { highlight: o.highlight }),
    ...(o.result === undefined ? {} : { result: o.result }),
  });

  const stack: number[] = [];
  const order: number[] = [];
  const filled = new Set<number>();
  let ops = 0;

  /** Open cells neither claimed nor waiting — the region still to be reached. */
  const untouched = (): NodeId[] => {
    const out: NodeId[] = [];
    for (let p = 0; p < n; p++) if (!filled.has(p) && !stack.includes(p)) out.push(String(p));
    return out;
  };

  const where = (p: number): string =>
    `row ${rowOf(p)}, col ${colOf(p)} (cell ${open[p] as number})`;

  yield snap(
    'init',
    n === 0
      ? 'Every cell in this grid is a wall, so there is nothing to fill. Done.'
      : `The grid is ${rows}×${cols} with ${n} open cell${n === 1 ? '' : 's'}, and each one is now a node with an edge to every open cell that shares a side with it. That is the whole algorithm: the four-way rule was decided when those edges were drawn, and the fill is now just a walk over them.`,
    {
      caption: n === 0 ? 'All walls' : `${rows}×${cols} · ${n} open · ${edges.length} links`,
      ops,
      highlight: { unvisited: untouched() },
      vars: { rows, cols, open: n, links: edges.length, filled: 0 },
    },
  );

  if (n === 0) {
    yield snap(
      'done',
      'No open cells anywhere, so the fill is empty and there is nothing to show.',
      {
        result: 'empty',
        vars: { rows, cols, filled: 0 },
      },
    );
    return;
  }

  if (start < 0) {
    yield snap(
      'no-start',
      `Cell ${startGrid} is a wall, so the fill has nowhere to begin. Choosing a starting cell that is not open ground is the one way to get an empty fill out of a grid that clearly has open cells in it.`,
      {
        caption: 'Start is a wall',
        ops,
        highlight: { unvisited: untouched() },
        result: 'no-start',
        vars: { rows, cols, open: n, filled: 0 },
      },
    );
    return;
  }

  filled.add(start);
  stack.push(start);
  yield snap(
    'seed',
    `Push ${where(start)} and mark it filled. Marking on *push* rather than on pop is what stops a cell with two open neighbours being filled twice, and marking at all is what stops the fill looping forever in a region with a hole in it.`,
    {
      caption: `Filling from ${where(start)}`,
      ops,
      highlight: { filled: [String(start)], unvisited: untouched() },
      vars: { row: rowOf(start), col: colOf(start), depth: 1, filled: 1, open: n },
    },
  );

  while (stack.length > 0) {
    if (ctx.shouldStop()) return;
    const p = stack.pop() as number;
    ops++;
    const rest = stack.map((q) => String(q));
    order.push(p);

    yield snap(
      'pop',
      `Pop ${where(p)} off the top of the stack and paint it. Popping the *newest* neighbour rather than the oldest is what makes this a flood that pours into one corner and spreads, and it is the same stack discipline as the recursive \`floodFill(r, c)\` everyone writes first — with the call stack made visible.`,
      {
        caption: `${filled.size} of ${n} filled · stack ${rest.length}`,
        ops,
        highlight: { filled: order.map((q) => String(q)), frontier: rest, unvisited: untouched() },
        vars: { row: rowOf(p), col: colOf(p), depth: rest.length, filled: filled.size, open: n },
      },
    );

    for (const q of adj[p] ?? []) {
      if (ctx.shouldStop()) return;
      if (filled.has(q)) {
        yield snap(
          'skip',
          `${where(q)} is already painted, so there is nothing to claim. On a four-way grid this fires about four times per painted cell and does nearly all the work of the loop — which is worth saying plainly, because the number that matters is the painted count, not the number of pushes.`,
          {
            caption: `${filled.size} of ${n} filled · stack ${rest.length}`,
            ops,
            highlight: { filled: order.map((z) => String(z)), frontier: rest },
            vars: {
              row: rowOf(q),
              col: colOf(q),
              from: `${rowOf(p)},${colOf(p)}`,
              filled: filled.size,
            },
          },
        );
        continue;
      }
      filled.add(q);
      stack.push(q);
      yield snap(
        'claim',
        `${where(p)} shares a side with ${where(q)}, so ${where(q)} is marked and pushed. Two writes and two structures: the mark is permanent, the push is a debt. If the two had shared only a *corner* this line would not exist at all — a diagonal pair is not an edge in this graph, which is exactly why a diagonal wall stops a four-way fill dead.`,
        {
          caption: `${filled.size} of ${n} filled · stack ${stack.length}`,
          ops,
          highlight: {
            filled: [...filled].map((q) => String(q)),
            frontier: stack.map((z) => String(z)),
            unvisited: untouched(),
          },
          vars: {
            row: rowOf(q),
            col: colOf(q),
            from: `${rowOf(p)},${colOf(p)}`,
            depth: stack.length,
            filled: filled.size,
          },
        },
      );
    }
  }

  const missed = ids(n).filter((p) => !filled.has(p));
  const missedIds = missed.map((p) => String(p));

  yield snap(
    'exhausted',
    missed.length === 0
      ? `The stack is empty and all ${n} open cells are painted, so the whole region is one component.`
      : `The stack is empty with ${missed.length} open cell${missed.length === 1 ? '' : 's'} still unpainted. An empty stack means no painted cell has an unpainted side-neighbour, which is a proof those cells belong to a *different* region — a diagonal wall is enough to separate them, and a full wall column obviously is.`,
    {
      ops,
      highlight: { filled: order.map((p) => String(p)), unvisited: missedIds },
      result: missed.length === 0 ? 'complete' : 'partial',
      vars: { filled: filled.size, missed: missed.length, open: n, ops },
    },
  );

  yield snap(
    'done',
    `${filled.size} of ${n} open cells filled, in ${ops} pop${ops === 1 ? '' : 's'}. The order is [${order.map((p) => open[p] as number).join(', ')}] — a depth-first sequence, so it is nothing like the concentric rings a queue-based fill would give. The *set* of filled cells is the answer; the order is only the record of how it was reached.`,
    {
      ops,
      highlight: { filled: order.map((p) => String(p)), unvisited: missedIds },
      result: missed.length === 0 ? 'complete' : 'partial',
      vars: { filled: filled.size, missed: missed.length, open: n, ops },
    },
  );
}

/** `0..n-1`, spelled so the intent survives `noUncheckedIndexedAccess`. */
const ids = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

/** One string per row: `.` is open ground, `#` is a wall. */
const toGrid = (rows: unknown): AlgoInput => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return grid(0, 0, []);
  }
  const lines = rows.map((r) => String(r));
  const width = Math.max(...lines.map((l) => l.length));
  const values: Array<number | string | null> = [];
  for (const line of lines) {
    for (let c = 0; c < width; c++) values.push(line[c] === '#' ? null : 1);
  }
  return grid(lines.length, width, values);
};

const inputSpec: InputSpec = {
  fields: [
    {
      key: 'rows',
      label: 'Rows (. open, # wall)',
      kind: 'words',
      default: (PRESETS[0]?.input.type === 'grid' ? rowsOf(PRESETS[0].input) : []) as string[],
    },
  ],
  build: (v: Record<string, unknown>): AlgoInput => toGrid(v.rows),
  sizeOf: (i: AlgoInput): number => (i.type === 'grid' ? i.rows * i.cols : 0),
};

/** Recover the editable row strings from a built grid input. */
function rowsOf(input: Extract<AlgoInput, { type: 'grid' }>): string[] {
  const out: string[] = [];
  for (let r = 0; r < input.rows; r++) {
    let line = '';
    for (let c = 0; c < input.cols; c++) {
      const v = input.values[r * input.cols + c];
      line += v === null || v === undefined ? '#' : '.';
    }
    out.push(line);
  }
  return out;
}

/** Build a grid input from the row strings, so presets stay readable. */
function gridCells(lines: string[]): Array<number | string | null> {
  const width = Math.max(...lines.map((l) => l.length));
  const values: Array<number | string | null> = [];
  for (const line of lines) {
    for (let c = 0; c < width; c++) values.push(line[c] === '#' ? null : 1);
  }
  return values;
}

/* ------------------------------------------------------------------ *
 * 4. The lesson — four languages, one set of anchors
 * ------------------------------------------------------------------ */

const JS = `function floodFill(adj, start) {
  // \`adj\` is the neighbour list built from { nodes, edges }, and the graph it
  // describes was built with a FOUR-WAY rule: up, down, left, right. A cell
  // that only touches another one at a corner is not in its neighbour list, and
  // that single fact is why a diagonal wall stops the fill dead.
  const n = Object.keys(adj).length;                     // @anchor init
  const seen = new Array(n).fill(false);
  const order = [];
  const stack = [start];                                  // @anchor seed
  seen[start] = true;
  while (stack.length > 0) {                              // @anchor exhausted
    const u = stack.pop();                                // @anchor pop
    order.push(u);
    // The weight in each [node, weight] pair is never read: a grid has no costs.
    for (const [v] of adj[u] ?? []) {
      if (seen[v]) continue;                              // @anchor skip
      seen[v] = true;                                     // @anchor claim
      stack.push(v);
    }
  }
  return order;                                           // @anchor done
}`;

const PY = `def flood_fill(adj, start):
    # \`adj\` is the neighbour list built from { nodes, edges }, and the graph it
    # describes was built with a FOUR-WAY rule: up, down, left, right. A cell
    # that only touches another at a corner is not in its neighbour list, and
    # that single fact is why a diagonal wall stops the fill dead.
    n = len(adj)                                        # @anchor init
    seen = [False] * n
    order = []
    stack = [start]                                       # @anchor seed
    seen[start] = True
    while stack:                                          # @anchor exhausted
        u = stack.pop()                                   # @anchor pop
        order.append(u)
        # The weight in each (node, weight) pair is never read: a grid has no costs.
        for v, _w in adj.get(u, []):
            if seen[v]:
                continue                                  # @anchor skip
            seen[v] = True                                # @anchor claim
            stack.append(v)
    return order                                          # @anchor done`;

const JAVA = `import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

class FloodFill {
    static int[] floodFill(List<List<int[]>> adj, int start) {
        // adj.get(u) is the neighbour list built from { nodes, edges }, built
        // with a FOUR-WAY rule: up, down, left, right. A cell that only touches
        // another at a corner is absent, which is why a diagonal wall stops the
        // fill dead.
        int n = adj.size();                                // @anchor init
        boolean[] seen = new boolean[n];
        List<Integer> order = new ArrayList<>();
        Deque<Integer> stack = new ArrayDeque<>();        // @anchor seed
        stack.push(start);
        seen[start] = true;
        while (!stack.isEmpty()) {                        // @anchor exhausted
            int u = stack.pop();                           // @anchor pop
            order.add(u);
            for (int[] e : adj.get(u)) {
                int v = e[0];
                if (seen[v]) continue;                     // @anchor skip
                seen[v] = true;                            // @anchor claim
                stack.push(v);
            }
        }
        int[] out = new int[order.size()];                 // @anchor done
        for (int i = 0; i < order.size(); i++) out[i] = order.get(i);
        return out;
    }
}`;

const CPP = `#include <vector>
#include <stack>
#include <utility>
using std::vector;
using std::pair;
using std::stack;

vector<int> flood_fill(vector<vector<pair<int, int>>> adj, int start) {
    // adj[u] is the neighbour list built from { nodes, edges }, built with a
    // FOUR-WAY rule: up, down, left, right. A cell that only touches another at
    // a corner is absent, and that single fact is why a diagonal wall stops the
    // fill dead. adj is taken by value, so this is a local copy.
    int n = (int)adj.size();                              // @anchor init
    vector<bool> seen(n, false);
    vector<int> order;
    stack<int> s;                                         // @anchor seed
    s.push(start);
    seen[start] = true;
    while (!s.empty()) {                                  // @anchor exhausted
        int u = s.top();                                   // @anchor pop
        s.pop();
        order.push_back(u);
        for (const auto& e : adj[u]) {
            int v = e.first;
            if (seen[v]) continue;                         // @anchor skip
            seen[v] = true;                                // @anchor claim
            s.push(v);
        }
    }
    return order;                                          // @anchor done
}`;

const NOTES = {
  init: {
    javascript:
      'The grid becomes a graph, and that is the whole trick. Each open cell is a node; two open cells that share a side get an edge. After this line the flood fill is no longer about geometry at all — it is an ordinary depth-first walk, and every "which neighbours can I go to" question has already been answered by the edges that were drawn. Building the graph is O(rows x cols) because each cell looks at exactly four neighbours.',
    python:
      'The grid becomes a graph, and that is the whole trick. Each open cell is a node; two open cells that share a side get an edge. After this line the flood fill is no longer about geometry at all — it is an ordinary depth-first walk, and every "which neighbours can I go to" question has already been answered by the edges that were drawn. Building the graph is O(rows x cols) because each cell looks at exactly four neighbours, which is why four-way connectivity is a constant factor and not a cost.',
    java: 'The grid becomes a graph, and that is the whole trick. Each open cell is a node; two open cells that share a side get an edge. After this line the flood fill is no longer about geometry at all — it is an ordinary depth-first walk, and every "which neighbours can I go to" question has already been answered by the edges that were drawn. Java spells the two coordinate checks as separate bounds tests on `row` and `col`, so a cell in the last row is simply skipped rather than wrapped — the guard that stops the walk leaving the grid.',
    cpp: 'The grid becomes a graph, and that is the whole trick. Each open cell is a node; two open cells that share a side get an edge. After this line the flood fill is no longer about geometry at all — it is an ordinary depth-first walk, and every "which neighbours can I go to" question has already been answered by the edges that were drawn. The `row` and `col` bounds are checked with signed comparisons, so a negative index never wraps around into a valid-looking cell at the far edge.',
  },
  seed: {
    javascript:
      'The starting cell is pushed and marked in one step, and the mark is what makes the loop terminate: a cell is pushed at most once, so the stack cannot grow without bound even in a region with a hole that leads back on itself. Nothing here knows what a row or a column is — by this point the grid has already become a graph.',
    python:
      'A plain list is the right structure, because `pop()` takes from the end and `append` is amortised O(1). The recursive version most people write is `flood_fill(r, c)` calling itself four times; this loop is the same thing with the call stack promoted to a variable you can print.',
    java: '`ArrayDeque` again, this time driven by `push`/`pop` rather than `add`/`poll`. The class is called `FloodFill` and the method too, which is legal in Java — the method simply shadows nothing, because the type name and the method name live in different namespaces.',
    cpp: '`std::stack<int>`, an adapter over a `std::deque`. A recursive version would be shorter and would overflow the machine stack on a large open region, because a flood fill on an all-open grid recurses to depth proportional to the grid size — which is the practical reason the iterative form is the one worth memorising.',
  },
  exhausted: {
    javascript:
      'The loop condition is the termination proof, and the *shape* of the answer is decided here: an empty stack means no filled cell has an unfilled side-neighbour, so whatever is still unpainted belongs to a different region. That is a reachability answer wearing a paint brush, and it is the same answer BFS would give on the same graph.',
    python:
      'A list is truthy while non-empty, so `while stack:` is the test. Note that nothing here compares against a count of cells: a fill that covered fewer cells than expected is not an error condition, it is a *result*, and the code is written so the caller can tell the difference by looking at the length of the return value.',
    java: '`isEmpty()` on the `ArrayDeque`, the same check the DFS listing uses with `pop` instead of `poll`. The reason flood fill and BFS can share this loop shape is that they are the same algorithm over the same graph — the only difference is which end of the container is read.',
    cpp: '`s.empty()` with `top()` before `pop()`, because `std::stack::pop` returns `void`. `std::stack` deliberately exposes no way to iterate or index, which is a small blessing here: there is no way to accidentally treat the pending list as the painted set and return the wrong one.',
  },
  pop: {
    javascript:
      '`pop()` takes the newest neighbour, so the fill pours into one corner and spreads from there rather than sweeping outwards in rings. Swapping `pop` for `shift` and the array for a queue would give you a breadth-first fill — same filled set, concentric order — and that is the single most instructive edit in this listing.',
    python:
      '`pop()` with no argument, and the contrast with `pop(0)` is the whole difference between this and a breadth-first fill. Python has no dedicated stack type, so there is no class to pick wrongly; the one-character distinction between `pop()` and `pop(0)` is all that separates a flood from a ripple.',
    java: '`stack.pop()` is the mirror of `push`, and it is the line a student should be able to explain without looking: the cell that was discovered *last* is the one that gets painted, which is what makes the fill depth-first. `order.add(u)` records it in the machine-readable answer.',
    cpp: '`top()` then `pop()`: read before removing, because the adapter gives you no combined operation. Copying into a local `int u` first is not optional — a reference into the `std::deque` would be invalidated by the very next line.',
  },
  skip: {
    javascript:
      'The neighbour is already painted, so nothing happens. On a four-way grid this fires roughly four times per cell and does almost all the work of the loop — which is worth saying plainly, because it means the interesting number is the *painted* count, not the number of pushes.',
    python:
      'Nothing to do, and the `continue` is load-bearing: without it a cell with two painted neighbours would be pushed twice and appear twice in the returned order, and every consumer that reconstructs the painted set from the order would still be correct while every consumer that counts cells would not.',
    java: 'The `continue` skips the rest of the body for this `int[]`, and the enhanced-for has already bound `e` for the iteration. `e[0]` is the neighbour and `e[1]` — the weight the graph glue attaches to every edge — is never read, because a grid has no weights.',
    cpp: 'The same skip, and the weight in `e.second` goes unread for the same reason. C++ would let you write `for (auto [v, w] : adj[u])` with structured bindings, but binding an unused `w` is worse than not binding it, so the explicit `e.first` is the tidier of the two.',
  },
  claim: {
    javascript:
      'Two writes and two structures: `seen` is permanent and `stack.push` is a debt. Marking on *discovery* rather than on pop is the one decision that separates a terminating fill from an infinite one, and it is the same decision BFS and DFS make. Getting it wrong shows up as a stack that grows without bound around a hole in the region, and it grows silently until the process dies. `push` is amortised O(1) here, which is why the pending list can be a plain array.',
    python:
      'The same two lines, and Python has no fused way to say "mark and push" in one expression. Note the index: the mark uses the *position* in the open-cell list and the return value uses the same index, so the caller never has to translate between "cell in the grid" and "node in the graph". `append` is amortised O(1), which is what makes a list the right type for a stack here.',
    java: 'A primitive `boolean[]`, so there is no boxing and the array is contiguous, then `push` = `ArrayDeque.addFirst`, the O(1) head insert. Java has no way to interrupt this loop and ask "is this coordinate the same colour", which is why a colour-matching fill and a wall-based fill are two different algorithms — the wall one is the only one a graph shape can express.',
    cpp: '`vector<bool>`, bit-packed: one bit per cell, so a million-cell grid costs 125 KB for its claimed set. It is a `vector<bool>` specialisation rather than a real vector, which is why `auto& b = seen[v]` will not compile here — and nobody ever writes that anyway. `s.push(v)` on a `std::stack` never reallocates in bulk, so there is no reference to invalidate.',
  },
  done: {
    javascript:
      'The return value is the pop order, as indices into the graph the driver built. The *set* of values is the answer — the region that was filled — and the order is a by-product of the stack discipline. A queue-based fill returns a different permutation of the same set, and a verifier that compared the raw arrays would flag two perfectly correct implementations.',
    python:
      "A list of ints, one per painted cell, and its length is how the caller learns that some cells were out of reach. Python could return a `set`, but a set serialises sorted and the driver would then be comparing an implementation detail of Python's hash table rather than the algorithm's answer.",
    java: 'Unboxed into an `int[]`, which is also the right shape for a caller: index by cell and ask whether it was filled, which is a single array lookup rather than a set membership test. `List<Integer>` would be more flexible and slower, and would serialise differently across the four drivers.',
    cpp: 'A `vector<int>` of painted positions. The caller usually wants the boolean vector itself, not the list of indices — but building the list is what makes the traversal observable, and a `vector<bool>` cannot be returned here without losing the order that makes the animation legible.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'floodFill',
    python: 'flood_fill',
    java: 'FloodFill.floodFill',
    cpp: 'flood_fill',
  },
  glue: {
    javascript: 'graph' as const,
    python: 'graph' as const,
    java: 'graph' as const,
    cpp: 'graph' as const,
  },
};

/* ------------------------------------------------------------------ *
 * 5. Expectations — one machine-checked claim per preset
 * ------------------------------------------------------------------ */

/**
 * The claim is the fill order, as indices into the open-cell list — the same
 * numbering the `graph` glue maps and the same node ids the viewport labels.
 *
 * It is a *sequence* rather than a set, which pins down the stack discipline and
 * not just the outcome. That is deliberate: two fills can cover the same cells and
 * differ only in order, and if only the set were checked a queue-based fill would
 * pass for a stack-based one.
 */
const EXPECTED: Record<string, number[]> = {
  'open-field': [5, 10, 15, 16, 17, 18, 19, 14, 9, 8, 7, 2, 1, 3, 4, 13, 12, 11, 6, 0],
  hollow: [
    0, 6, 12, 16, 20, 21, 22, 23, 24, 25, 19, 15, 14, 10, 9, 8, 2, 3, 4, 5, 11, 18, 17, 13, 7, 1,
  ],
  barrier: [
    0, 5, 10, 15, 20, 21, 22, 23, 24, 25, 19, 14, 13, 12, 7, 2, 3, 4, 8, 9, 18, 17, 16, 11, 6, 1,
  ],
  staircase: [0, 4, 8, 12, 16, 17, 18, 19, 14, 13, 9],
  'two-regions': [6, 11, 16, 17, 15, 12, 10, 7, 2, 5, 0, 1],
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const input = p.input;
  const cells = input.type === 'grid' ? (input.values ?? []) : [];
  const rows = input.type === 'grid' ? input.rows : 0;
  const cols = input.type === 'grid' ? input.cols : 0;
  const open: number[] = [];
  for (let g = 0; g < cells.length; g++) {
    if (cells[g] !== null && cells[g] !== undefined) open.push(g);
  }
  const posOf = new Map<number, number>(open.map((g, i) => [g, i]));

  // The four-way adjacency, built in exactly the order the generator builds it and
  // then flattened. Two details matter and both are about the *order*:
  //
  //  - one [from, to] pair per **direction**, because the `graph` glue adds no
  //    reverse of its own — it appends `from -> to` and stops. An undirected grid
  //    therefore has to be spelled out both ways round, exactly as the traversal
  //    algorithms' undirected presets are.
  //  - the pairs are emitted grouped by source, in the generator's own neighbour
  //    order, so the adjacency each language reconstructs is the adjacency the
  //    animation walked. A flood fill's *order* is an artefact of that order.
  const adj: number[][] = open.map(() => []);
  for (let p = 0; p < open.length; p++) {
    const g = open[p] as number;
    const r = Math.floor(g / Math.max(1, cols));
    const c = g % Math.max(1, cols);
    for (const [dr, dc] of FOUR_WAY) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const other = posOf.get(nr * cols + nc);
      if (other === undefined) continue;
      adj[p]?.push(other);
    }
  }
  const edges: Array<[number, number, number]> = [];
  for (let u = 0; u < adj.length; u++) {
    for (const v of adj[u] ?? []) edges.push([u, v, 1]);
  }

  return {
    presetId: p.id,
    args: [{ nodes: open.map((_, i) => i), edges }, Number(p.params?.start ?? 0)],
    result: EXPECTED[p.id] ?? [],
  };
});

export const floodFillAlgo: AlgoDef<GraphFrame> = {
  id: 'flood-fill',
  title: 'Flood Fill',
  category: 'graphs',
  summary:
    "Claim every cell reachable from a start cell by four-way steps, using an explicit stack, so the painted set is exactly the start cell's connected component.",
  intuition:
    'Reach for flood fill whenever the question is "which parts of this are the same piece as that one" — the paint bucket in an editor, "connected" or "reachable" territory on a strategy map, marking a region of a maze, finding all squares of one colour in a puzzle, and, underneath all of those, deciding whether a game board has a path anywhere. The neighbourhood rule is the decision worth remembering: four-way is the default and it treats a diagonal touch as a wall, which is right for territory and wrong for "is this blob one blob". Colour-matching fills are a genuinely different algorithm — they need the cell\'s value, which a graph shape cannot carry — so when the walls are implied by colour, do the test inside the loop instead.',
  complexity: {
    best: 'O(R · C)',
    average: 'O(R · C)',
    worst: 'O(R · C)',
    space: 'O(R · C)',
    note: 'A four-way fill on an R×C grid touches every open cell once and reads at most four edges per cell, so it is linear in the grid and there is no input that makes it worse. Space is the claimed set plus the stack, and the stack is bounded by 3 per painted cell — not by the grid size, which is what makes the iterative version safe where the recursive one is not.',
  },
  traits: { offline: true, tags: ['grid', 'traversal', 'stack', 'reachability', 'four-way'] },
  viewport: 'graph',
  level: 'intermediate',
  params: [
    {
      key: 'start',
      label: 'Start cell',
      kind: 'number',
      min: 0,
      max: 200,
      step: 1,
      default: 0,
      help: 'Row-major cell number, walls included. Point it at a wall and the fill is empty, which is itself worth seeing once.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: floodFill,
  lesson,
  expectations,
  formatResult: (r) => `filled ${(r as number[]).length} cells: [${(r as number[]).join(', ')}]`,
  anchors: ['init', 'seed', 'exhausted', 'pop', 'skip', 'claim', 'done'],
};

export default floodFillAlgo;
