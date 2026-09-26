import { byLanguage } from '../../code/anchors.ts';
import { circleNodes, graphInput, weightedGraph } from '../../input/generators.ts';
import type { AlgoGraphEdge, AlgoGraphNode, AlgoInput, InputSpec } from '../../input/types.ts';
import { isGraph } from '../../input/types.ts';
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
 * Prim's minimum spanning tree: grow one tree, one node at a time.
 *
 * The whole algorithm is a sentence. Start anywhere. Keep a priority queue of the
 * edges that cross from the tree you have built to everything outside it. Take the
 * cheapest, drag its outside endpoint in, and offer that node's own edges. Repeat
 * until every node is in. No union-find, no path search, no cycle test — and that
 * last omission is the whole point, because **an edge whose two ends are both
 * already in the tree is never even a candidate**. Kruskal has to ask "would this
 * close a loop?" about every edge in the graph; Prim never asks, because it only
 * ever looks at edges that straddle the boundary.
 *
 * `kruskal.ts` in this directory is the sibling to read side by side, and the
 * contrast is the best available teaching device:
 *
 *  - **Kruskal builds a forest and merges it; Prim builds one tree and stops.**
 *    On the `islands` preset that is not a cosmetic difference: Prim returns 8,
 *    because it never discovers the component it did not start in, while Kruskal
 *    returns 10 for a spanning *forest* over both. Two correct implementations of
 *    "minimum spanning tree" returning different numbers is the sharpest possible
 *    statement that the algorithm needs a connected graph.
 *  - **The total is the same; the tree need not be.** A minimum spanning tree is
 *    unique only when every weight is distinct. The moment two weights tie, the
 *    *total* is still determined by the graph but the *edge set* is not, and the
 *    two algorithms break the same tie by different rules. The `divergent` preset
 *    is a five-edge graph where Prim and Kruskal each pay 5 and lay completely
 *    different roads, and the note on the tie-break is the honest version of why
 *    the answer an MST function returns is the sum and not the edge list.
 *
 * Everything the lazy heap costs shows up in the trace. Prim's queue cannot fix a
 * key in place, so an edge queued early can come out of the queue long after both
 * its endpoints are in the tree — the `skip-cycle` frames are that price, and the
 * `already-a-tree` preset shows the opposite extreme, where the queue never holds
 * more than one edge and no choice is ever made.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 23;

/**
 * Undirected weights have to be listed **both ways** for the listings, even though
 * the tree is undirected and even though `kruskal.ts` gets away without it.
 *
 * The reason is the `graph` glue. The harness turns `{ nodes, edges }` into an
 * adjacency list by appending each edge to its first endpoint only, so an edge
 * listed once is *reachable from one end and invisible from the other*. That is
 * harmless for Kruskal, which scans every list and only ever asks "does this edge
 * exist, and are its ends in the same component" — direction is not a question it
 * asks. Prim asks a directional question every single step: "which edges leave
 * this node", and a node whose edges were all listed pointing *at* it looks like a
 * dead end. So the doubled list goes into the input, and `read()` below deduplicates
 * the drawn edges again so the viewport still shows one line per road.
 */
function bothWays(edges: AlgoGraphEdge[]): AlgoGraphEdge[] {
  const out: AlgoGraphEdge[] = [];
  for (const e of edges) {
    out.push(e);
    out.push({
      from: e.to,
      to: e.from,
      directed: false,
      ...(e.weight === undefined ? {} : { weight: e.weight }),
    });
  }
  return out;
}

const SPARSE = weightedGraph(SEED, 8);
const DENSE = weightedGraph(SEED + 26, 10);

/**
 * Five nodes, five edges, and two different minimum spanning trees of total 5.
 *
 * This one is hand-built because it is the *smallest* graph I could find where
 * Prim and Kruskal genuinely disagree, and every extra edge is another chance for
 * them to agree again. Here is the whole thing:
 *
 *   - node 0 is a hub with two cheap spokes (to 3 and to 4) and one expensive
 *     one (to 2, cost 2);
 *   - nodes 1 and 2 are joined to each other by a cost-1 edge, and node 1 also has
 *     a cost-2 edge to node 3.
 *
 * The cheapest way to attach the {1, 2} pair to the rest costs 2 either way:
 *
 *  - **Kruskal** takes the three cost-1 edges (0-3, 0-4, 1-2), which leaves node 1
 *    and node 2 already joined, then pays 2 for 0-2. Total 5.
 *  - **Prim** from node 0 takes 0-3 and 0-4, then faces two cost-2 candidates
 *    (0-2 and 1-3). Its tie-break — lowest-numbered node claimed — prefers 1-3,
 *    which drags node 1 in and leaves 1-2 as a cost-1 candidate, so node 2 arrives
 *    for free. Total 5. Same five edges, same money, a different road.
 *
 * That is the whole lesson, and it is not a bug: with tied weights the minimum
 * spanning tree is not unique, and the total is the only part of the answer the
 * graph decides.
 */
const DIVERGENT: { nodes: AlgoGraphNode[]; edges: AlgoGraphEdge[] } = {
  nodes: circleNodes(5),
  edges: [
    { from: 'n0', to: 'n3', directed: false, weight: 1 },
    { from: 'n0', to: 'n4', directed: false, weight: 1 },
    { from: 'n1', to: 'n2', directed: false, weight: 1 },
    { from: 'n0', to: 'n2', directed: false, weight: 2 },
    { from: 'n1', to: 'n3', directed: false, weight: 2 },
  ],
};

/**
 * Already a tree, so there is nothing to decide.
 *
 * Six nodes in a path with five edges of five different weights. Every edge is
 * taken, nothing is ever refused, and the queue never holds more than one
 * candidate: after each node joins, its single forward edge is the only thing that
 * can be taken next. Watching the greedy machinery run with no choices to make is
 * the control experiment for every other preset here — it shows how much of what
 * looked like cleverness was just tie-breaking.
 */
const LADDER: { nodes: AlgoGraphNode[]; edges: AlgoGraphEdge[] } = {
  nodes: circleNodes(6),
  edges: [
    { from: 'n0', to: 'n1', directed: false, weight: 3 },
    { from: 'n1', to: 'n2', directed: false, weight: 1 },
    { from: 'n2', to: 'n3', directed: false, weight: 4 },
    { from: 'n3', to: 'n4', directed: false, weight: 2 },
    { from: 'n4', to: 'n5', directed: false, weight: 5 },
  ],
};

/**
 * Two islands, and the trap.
 *
 * Nodes 0-3 hang together and nodes 4-6 hang together, with nothing between them.
 * Prim starts at 0, builds a perfect tree over its own four nodes for a total of
 * 8, and then finds an empty queue. Three nodes are still showing as unvisited,
 * and here is the part worth pausing on: **Prim never even discovered them.**
 *
 * The cheapest tree over the 0-3 component costs 1 + 2 + 5 = 8; the cheapest tree
 * over the 4-6 component costs 1 + 1 = 2. A minimum spanning *forest* over the
 * whole graph therefore costs 10, and that is the number `kruskal.ts` reports on
 * this same input — because Kruskal scans every edge in the graph and builds a
 * tree on both sides. Prim reports 8. Both are correct implementations of their
 * own contract, and they disagree, which is the cleanest possible demonstration
 * that "minimum spanning tree" is only a well-posed question on a connected
 * graph and that Prim's answer additionally depends on where it started.
 */
const ISLANDS: { nodes: AlgoGraphNode[]; edges: AlgoGraphEdge[] } = {
  nodes: circleNodes(7),
  edges: [
    { from: 'n0', to: 'n1', directed: false, weight: 2 },
    { from: 'n0', to: 'n2', directed: false, weight: 1 },
    { from: 'n1', to: 'n2', directed: false, weight: 2 },
    { from: 'n1', to: 'n3', directed: false, weight: 6 },
    { from: 'n2', to: 'n3', directed: false, weight: 5 },
    { from: 'n4', to: 'n5', directed: false, weight: 1 },
    { from: 'n5', to: 'n6', directed: false, weight: 1 },
    { from: 'n4', to: 'n6', directed: false, weight: 3 },
  ],
};

const PRESETS: Preset[] = [
  {
    id: 'sparse',
    label: 'Sparse, 8 nodes',
    blurb:
      'Seven spokes and three extra chords: ten edges for eight nodes, so the queue does real work and three edges fall away. The green tree grows one node at a time, and notice that most of the refusals are not decisions at all — an edge with both ends already inside the tree is never queued in the first place, which is why Prim needs no union-find.',
    input: graphInput(SPARSE.nodes, bothWays(SPARSE.edges), {
      directed: false,
      weighted: true,
    }),
    params: { start: 0 },
  },
  {
    id: 'dense',
    label: 'Dense, 10 nodes',
    blurb:
      'Fifteen edges for ten nodes. Nine are taken and six fall away, several of them as stale queue entries that come back out only after both their ends are already connected. The cost of a lazy heap, drawn: each of those is a duplicate the container had no way to remove in place.',
    input: graphInput(DENSE.nodes, bothWays(DENSE.edges), {
      directed: false,
      weighted: true,
    }),
    params: { start: 0 },
  },
  {
    id: 'divergent',
    label: 'Where Prim and Kruskal differ',
    blurb:
      'Five edges, and both algorithms pay 5. Prim takes 0-3, 0-4, 1-3 and 1-2, hanging the {1, 2} pair off node 3; Kruskal takes 0-2, 0-3, 0-4 and 1-2, hanging it off node 0. Two of the five edges differ and the total does not move, because a minimum spanning tree is unique only when every weight is distinct — and here two edges cost 2, so which one is taken is settled by a tie-break rather than by the graph.',
    input: graphInput(DIVERGENT.nodes, bothWays(DIVERGENT.edges), {
      directed: false,
      weighted: true,
    }),
    params: { start: 0 },
  },
  {
    id: 'ladder',
    label: 'Already a tree',
    blurb:
      'Six nodes in a path, five edges, all different weights. Every edge is taken and nothing is ever refused, because the queue never holds more than one candidate. The control experiment: all the machinery is still running and none of it is being used.',
    input: graphInput(LADDER.nodes, bothWays(LADDER.edges), {
      directed: false,
      weighted: true,
    }),
    params: { start: 0 },
  },
  {
    id: 'islands',
    label: 'Two islands',
    blurb:
      'Nodes 0-3 and nodes 4-6 share nothing, so the queue drains with 4 of the 7 nodes in the tree. Prim reports 8; Kruskal, which scans every edge, reports 10 for a spanning forest over both islands. Note what Prim never did: it never discovered nodes 4, 5 or 6 at all, so its answer is a tree of its own component rather than of the graph.',
    input: graphInput(ISLANDS.nodes, bothWays(ISLANDS.edges), {
      directed: false,
      weighted: true,
    }),
    params: { start: 0 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

/**
 * Read the input into stable coordinates plus an undirected edge list.
 *
 * The presets feed a doubled edge list so that the four language implementations —
 * which receive whatever adjacency the harness builds — can see every edge from
 * both of its ends. That doubling has to be undone here, because `edges` is what
 * the viewport draws: without the `drawn` set every road would be painted twice,
 * and `inSet` would light up both copies, which is the sort of thing that looks
 * fine and teaches the wrong thing about what was accepted.
 */
function read(input: AlgoInput): {
  ids: NodeId[];
  label: (i: number) => string;
  edges: GraphEdge[];
  nodes: Record<NodeId, GraphNode>;
} {
  const g = isGraph(input) ? input : null;
  const src: AlgoGraphNode[] = g?.nodes ?? [];
  const ids = src.map((nd) => nd.id);
  const at = new Map<NodeId, number>(ids.map((id, i) => [id, i]));
  const nodes: Record<NodeId, GraphNode> = {};
  for (const nd of src) nodes[nd.id] = { id: nd.id, x: nd.x, y: nd.y, label: nd.label };
  const label = (i: number): string => {
    const id = ids[i];
    return id === undefined ? '?' : (nodes[id]?.label ?? id);
  };

  const edges: GraphEdge[] = [];
  const drawn = new Set<string>();
  for (const e of g?.edges ?? []) {
    const u = at.get(e.from);
    const v = at.get(e.to);
    if (u === undefined || v === undefined) continue;
    const key = g?.directed === false ? `${Math.min(u, v)}~${Math.max(u, v)}` : `${u}>${v}`;
    if (drawn.has(key)) continue;
    drawn.add(key);
    edges.push({
      from: e.from,
      to: e.to,
      directed: false,
      ...(e.weight === undefined ? {} : { weight: e.weight }),
    });
  }
  return { ids, label, edges, nodes };
}

const edgeKey = (e: GraphEdge): string => `${e.from}~${e.to}`;

export function* primsMst(ctx: RunContext): Generator<GraphFrame> {
  const { ids, label, edges, nodes } = read(ctx.input);
  const n = ids.length;
  const at = new Map<NodeId, number>(ids.map((id, i) => [id, i]));
  const start =
    n === 0 ? 0 : Math.min(Math.max(0, Math.round(Number(ctx.params.start ?? 0))), n - 1);

  /**
   * The nodes in the tree, in the order they joined. Every frame hands the
   * viewport a fresh array, because `visited` is the tree and a student stepping
   * backwards has to see the tree *shrink*.
   */
  const tree: NodeId[] = [];
  const inTree = new Set<number>();
  const taken = new Set<string>();
  interface Candidate {
    w: number;
    /** The endpoint that will be dragged in. */
    v: number;
    /** The endpoint already in the tree. */
    u: number;
  }
  /** The priority queue, held as explicit (weight, outside, inside) triples. */
  const queue: Candidate[] = [];
  let total = 0;
  let ops = 0;

  /**
   * The total order. Weight first, because that is the algorithm. The two
   * tie-breaks after it exist only so that a run is reproducible: among equally
   * cheap candidates this listing claims the **lower-numbered node**, which is a
   * rule every one of the four implementations can apply without knowing anything
   * about the order the edges arrived in.
   *
   * That rule is also the reason the `divergent` preset exists. Kruskal sorts its
   * edge list by `(weight, u, v)` and Prim breaks the same tie by `(weight, v, u)`,
   * so on a graph with tied weights the two lay different roads for the same money.
   */
  const cmp = (a: Candidate, b: Candidate): number => a.w - b.w || a.v - b.v || a.u - b.u;

  /**
   * The frontier, as the outside endpoints of everything currently queued, in the
   * order it would be popped.
   *
   * `GraphFrame.frontier` holds node ids, and Prim's queue holds *edges*, so this
   * is the closest honest reading of it: the set of nodes the queue could add
   * next. The caption carries the "k edges queued" position that the field cannot.
   */
  const openNodes = (): NodeId[] => {
    const seen = new Set<number>();
    const out: number[] = [];
    for (const c of [...queue].sort(cmp)) {
      if (inTree.has(c.v) || seen.has(c.v)) continue;
      seen.add(c.v);
      out.push(c.v);
    }
    return out.map((i) => ids[i] as NodeId);
  };

  const treeIds = (): NodeId[] => [...tree];
  const untouched = (): NodeId[] => ids.filter((_, i) => !inTree.has(i));

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
    // Fresh array, fresh objects, every frame: `inSet` is the one field this
    // algorithm changes, and a shared edge object would light up the whole trace
    // green the moment the first edge was accepted.
    edges: edges.map((e) => ({ ...e, ...(taken.has(edgeKey(e)) ? { inSet: true } : {}) })),
    frontier: openNodes(),
    visited: treeIds(),
    ...(o.caption === undefined ? {} : { caption: o.caption }),
    ...(o.ops === undefined ? {} : { ops: o.ops }),
    ...(o.vars === undefined ? {} : { vars: o.vars }),
    ...(o.highlight === undefined ? {} : { highlight: o.highlight }),
    ...(o.result === undefined ? {} : { result: o.result }),
  });

  /** The edges touching node `i`, in input order — the candidate scan. */
  const touching = (i: number): Array<{ other: number; w: number; key: string }> => {
    const id = ids[i] as NodeId;
    const out: Array<{ other: number; w: number; key: string }> = [];
    for (const e of edges) {
      if (e.from === id) {
        const j = at.get(e.to);
        if (j !== undefined) out.push({ other: j, w: e.weight ?? 1, key: edgeKey(e) });
      } else if (e.to === id) {
        const j = at.get(e.from);
        if (j !== undefined) out.push({ other: j, w: e.weight ?? 1, key: edgeKey(e) });
      }
    }
    return out;
  };

  yield snap(
    'start',
    n === 0
      ? 'The graph has no nodes, so there is no tree to grow. Done.'
      : `${n} nodes and ${edges.length} edges, and no tree yet: Prim's answer is built rather than found, one node at a time, and it starts by picking a single node to build around. A tree on ${n} nodes has exactly ${Math.max(0, n - 1)} edge${n - 1 === 1 ? '' : 's'}, so that is the number of takes available — and every one of them has to be an edge that reaches something new.`,
    {
      caption: n === 0 ? 'Empty graph' : `${n} nodes · ${edges.length} edges · tree empty`,
      highlight: { unvisited: ids },
      vars: { n, edges: edges.length, taken: 0, needed: Math.max(0, n - 1), total: 0 },
    },
  );

  if (n === 0) {
    yield snap('done', 'Zero nodes means a total weight of 0 and no tree to draw.', {
      result: '0',
      vars: { n, total: 0 },
    });
    return;
  }

  inTree.add(start);
  tree.push(ids[start] as NodeId);
  for (const e of touching(start)) {
    if (!inTree.has(e.other)) queue.push({ w: e.w, v: e.other, u: start });
  }

  yield snap(
    'seed',
    `Start at ${label(start)}: it joins the tree on its own, with no edge to pay for, and all ${queue.length} of its edges to the outside go into the queue. The queue holds *edges*, so the bar underneath is the outside endpoints — the nodes it could bring in next — and ${label(start)}'s own edges are the only candidates that exist so far. Prim's result depends on this choice in a way Kruskal's does not: a different seed vertex can give a different tree of the same total weight.`,
    {
      caption: `Tree of 1 · ${queue.length} queued · total 0`,
      highlight: { inMst: treeIds(), frontier: openNodes() },
      vars: { start: label(start), open: queue.length, taken: 0, total: 0 },
    },
  );

  while (queue.length > 0) {
    if (ctx.shouldStop()) return;
    queue.sort(cmp);
    const entry = queue[0] as Candidate;
    const uId = ids[entry.u] as NodeId;
    const vId = ids[entry.v] as NodeId;

    /*
     * A stale entry is a discard, not a choice, and it is checked *before* the
     * "cheapest of the queue" frame rather than after it. The queue cannot fix a
     * key in place, so an edge queued while its far end was outside can come back
     * out after that end joined the tree some cheaper way; announcing it as the
     * cheapest candidate and then refusing it would be a sentence that contradicts
     * itself, and the `pick-cheapest` note below relies on "exactly one end is
     * inside the tree" being true.
     */
    if (inTree.has(entry.v)) {
      queue.shift();
      ops++;
      yield snap(
        'skip-cycle',
        `The head of the queue is ${label(entry.u)} – ${label(entry.v)} at ${entry.w}, and it is not even a choice: both ends are already in the tree, because ${label(entry.v)} arrived by a cheaper route in the meantime. Thrown away without being taken. This entry is a leftover the queue had no way to delete — a heap cannot lower a key in place, so an earlier, dearer copy of this edge stayed behind when a cheaper route claimed the far end. The already-a-tree preset never produces this frame, because a queue that never holds more than one edge has nothing to fall behind.`,
        {
          caption: `Tree of ${tree.length} · ${queue.length} queued · discarded`,
          ops,
          highlight: { compare: [uId, vId], inMst: treeIds() },
          vars: { u: label(entry.u), v: label(entry.v), w: entry.w, taken: taken.size, total },
        },
      );
      continue;
    }

    const runner = queue.find((c, k) => k > 0 && !inTree.has(c.v));
    yield snap(
      'pick-cheapest',
      `${label(entry.u)} – ${label(entry.v)} is the cheapest of the ${queue.length} queued edge${queue.length === 1 ? '' : 's'}, at ${entry.w}. ${
        !runner
          ? 'Nothing else is queued, so there is nothing to compare it against.'
          : runner.w === entry.w
            ? `The next cheapest is ${label(runner.u)} – ${label(runner.v)} at ${runner.w} as well, so nothing is being decided on cost: the tie-break claims the lower-numbered node, and either choice gives a minimum spanning tree of the same total. This is the one place where Prim and Kruskal can part company, because Kruskal's sort breaks the very same tie on the *first* endpoint instead.`
            : `The next cheapest is ${label(runner.u)} – ${label(runner.v)} at ${runner.w}, so this one leads by ${runner.w - entry.w}.`
      } Taking it is guaranteed safe: exactly one end is inside the tree, so it cannot possibly close a loop. That is the whole difference from Kruskal, which has to establish the same fact with a union-find before it is allowed to touch an edge.`,
      {
        caption: `Tree of ${tree.length} · ${queue.length} queued · total ${total}`,
        ops,
        highlight: { frontier: openNodes(), inMst: treeIds() },
        vars: {
          u: label(entry.u),
          v: label(entry.v),
          w: entry.w,
          next: runner ? `${label(runner.u)}-${label(runner.v)}` : 'none',
          open: queue.length,
          total,
        },
      },
    );

    queue.shift();
    ops++;
    const edge =
      edges.find((e) => e.from === uId && e.to === vId) ??
      edges.find((e) => e.from === vId && e.to === uId);
    if (edge) taken.add(edgeKey(edge));
    inTree.add(entry.v);
    tree.push(vId);
    total += entry.w;
    const justTook = label(entry.v);
    const spokes = touching(entry.v).length;

    yield snap(
      'add-edge',
      `Take it: ${label(entry.u)} – ${label(entry.v)} joins the tree for ${entry.w}, ${justTook} comes in, and the running total is ${total}. The green edge is now part of the answer and the tree has ${tree.length} of the ${n} nodes. ${
        tree.length === n
          ? 'That is every node, so the tree is finished — and anything still sitting in the queue is a leftover that will be discarded when it surfaces.'
          : `Now ${justTook}'s own ${spokes} edge${spokes === 1 ? ' has' : 's have'} to be looked at, and every one that reaches outside becomes a candidate.`
      }`,
      {
        caption: `Tree of ${tree.length} of ${n} · total ${total}`,
        ops,
        highlight: { inMst: treeIds(), answer: [vId] },
        vars: { u: label(entry.u), v: label(entry.v), w: entry.w, taken: taken.size, total, n },
      },
    );

    // The candidate scan. One frame per edge that is *not* offered, because that is
    // a decision worth seeing; the offers themselves are reported by the next frame
    // that reads the queue.
    for (const e of touching(entry.v)) {
      if (ctx.shouldStop()) return;
      if (taken.has(e.key)) continue;
      if (inTree.has(e.other)) {
        yield snap(
          'skip-in-tree',
          `${justTook} – ${label(e.other)} costs ${e.w}, but ${label(e.other)} is already in the tree, so this edge would close a loop and is not even queued. This is the test Kruskal has to perform explicitly with a union-find; Prim gets it for free because the queue is *only ever* offered edges with exactly one end outside. Notice the queue length is unchanged — nothing was added and nothing removed.`,
          {
            caption: `Tree of ${tree.length} · ${queue.length} queued · not a candidate`,
            ops,
            highlight: { compare: [ids[e.other] as NodeId, vId], inMst: treeIds() },
            vars: {
              u: justTook,
              v: label(e.other),
              w: e.w,
              open: queue.length,
              taken: taken.size,
              total,
            },
          },
        );
        continue;
      }
      queue.push({ w: e.w, v: e.other, u: entry.v });
    }
  }

  if (tree.length < n) {
    yield snap(
      'disconnected',
      `The queue is empty with ${tree.length} of ${n} nodes in the tree and only ${taken.size} of the ${n - 1} edges a spanning tree would need. The queue can only empty once every edge out of the tree has been offered and taken, so this is a proof rather than a stopping point: nothing reachable from ${label(start)} is left unconnected, and the ${untouched().length} node${untouched().length === 1 ? '' : 's'} still showing as unvisited are in a different component. Two things follow, and they are the reason this preset exists. No spanning tree of this graph exists, so the total of ${total} is a minimum spanning *tree of the starting component* and nothing more — Kruskal, scanning every edge, would have built a tree on the far side too and reported a larger number. And Prim never even discovered those ${untouched().length} nodes: they are unvisited because no edge out of the tree ever pointed at them, not because they were examined and found unhelpful.`,
      {
        caption: `Forest of ${tree.length} of ${n} · total ${total}`,
        ops,
        highlight: { inMst: treeIds(), unvisited: untouched() },
        result: String(total),
        vars: { inTree: tree.length, n, needed: n - 1, taken: taken.size, total, ops },
      },
    );
  }

  yield snap(
    'done',
    tree.length === n
      ? `${taken.size} edge${taken.size === 1 ? '' : 's'} accepted for a total weight of ${total}, and ${taken.size === n - 1 ? `that is exactly the ${n - 1} a spanning tree on ${n} nodes must have, so the tree is connected and nothing cheaper remains` : `which is more than the ${n - 1} a tree on ${n} nodes should have, so something is wrong above`}. ${ops} queue entr${ops === 1 ? 'y' : 'ies'} examined. What is returned is the sum, not the edge list, and that is deliberate: with tied weights a different tie-break gives a different tree of the same cost, so the total is the only part of the answer the graph actually determines.`
      : `${taken.size} edge${taken.size === 1 ? '' : 's'} accepted for a total weight of ${total}, over the ${tree.length} of ${n} nodes that were reachable from the start. That is a minimum spanning tree of one component, and calling it a minimum spanning forest of the graph would be wrong: the far component is not cheaper, it is simply invisible from here. Read the number as "the cheapest way to connect everything you can reach from node ${label(start)}", which is the question Prim actually answers.`,
    {
      caption:
        tree.length === n ? `Total weight ${total}` : `Start component only · total ${total}`,
      ops,
      highlight: { inMst: treeIds(), ...(tree.length === n ? {} : { unvisited: untouched() }) },
      result: String(total),
      vars: {
        taken: taken.size,
        considered: edges.length,
        n,
        inTree: tree.length,
        total,
        ops,
      },
    },
  );
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec: InputSpec = {
  fields: [{ key: 'graph', label: 'Graph', kind: 'graph' }],
  build: (v: Record<string, unknown>): AlgoInput => {
    const g = v.graph;
    return g && typeof g === 'object' && 'type' in g
      ? (g as AlgoInput)
      : (PRESETS[0]?.input as AlgoInput);
  },
  sizeOf: (i: AlgoInput): number => (i.type === 'graph' ? i.nodes.length : 0),
};

/* ------------------------------------------------------------------ *
 * 4. The lesson — four languages, one set of anchors
 * ------------------------------------------------------------------ */

const JS = `function prim(adj, start) {
  // \`adj\` is the neighbour list built from { nodes, edges }: adj[u] holds every
  // [node, weight] pair one edge away from u. An undirected edge appears once,
  // because Prim never traverses — it only ever looks at the tree it already has.
  const n = Object.keys(adj).length;
  if (n === 0) return 0;
  // The tree starts empty, and this array is the whole of the record that it is:
  // there is no parent pointer and no component table, because an edge is only ever
  // offered when exactly one of its ends is already true in here.
  const inTree = new Array(n).fill(false);                 // @anchor start
  const total = { value: 0 };
  const queue = [];
  // Cheapest first; among equals, claim the lower-numbered node. The second and
  // third terms are only here so a run is reproducible — and they are the reason
  // this listing and Kruskal's can lay different roads for the same money, since
  // Kruskal breaks the same tie on the *first* endpoint instead.
  const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  // JavaScript has no priority queue in the standard library, so here is a minimal
  // binary min-heap over [weight, outside, inside] triples. \`cmp\` returns a
  // difference rather than a boolean, so the tests below have to ask for a sign:
  // any non-zero number is truthy, and testing it directly inverts the sift and
  // quietly turns the heap into a max-heap.
  const push = (item) => {
    queue.push(item);
    for (let i = queue.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (cmp(queue[i], queue[p]) >= 0) break;
      [queue[i], queue[p]] = [queue[p], queue[i]];
      i = p;
    }
  };
  const pop = () => {
    const top = queue[0];
    const last = queue.pop();
    if (queue.length > 0) {
      queue[0] = last;
      for (let i = 0; ; ) {
        let m = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < queue.length && cmp(queue[l], queue[m]) < 0) m = l;
        if (r < queue.length && cmp(queue[r], queue[m]) < 0) m = r;
        if (m === i) break;
        [queue[i], queue[m]] = [queue[m], queue[i]];
        i = m;
      }
    }
    return top;
  };

  inTree[start] = true;                                     // @anchor seed
  for (const [v, w] of adj[start] ?? []) if (!inTree[v]) push([w, v, start]);
  // Running out of candidates with nodes still outside the tree is not a failure to
  // look hard enough: it is a spanning forest, and the far component was never
  // reachable from the start at all.
  while (queue.length > 0) {                                // @anchor disconnected
    const [w, v, u] = pop();                                // @anchor pick-cheapest
    // Both ends already in the tree: this entry went stale in the queue. A heap
    // cannot lower a key in place, so the duplicate is unavoidable.
    if (inTree[v]) continue;                                // @anchor skip-cycle
    inTree[v] = true;
    total.value += w;                                       // @anchor add-edge
    for (const [x, wx] of adj[v] ?? []) {
      // An edge with both ends inside the tree is not even a candidate. That is
      // where Prim's cycle test lives: it never has to ask the question.
      if (inTree[x]) continue;                              // @anchor skip-in-tree
      push([wx, x, v]);
    }
  }
  return total.value;                                       // @anchor done
}`;

const PY = `import heapq


def prim(adj, start):
    # \`adj\` is the neighbour list built from { nodes, edges }: adj[u] holds every
    # (node, weight) pair one edge away from u. An undirected edge appears once,
    # because Prim never traverses — it only ever looks at the tree it already has.
    n = len(adj)
    if n == 0:
        return 0
    # The tree starts empty, and this list is the whole of the record that it is:
    # there is no parent array and no component table, because an edge is only ever
    # offered when exactly one of its ends is already true in here.
    in_tree = [False] * n                                   # @anchor start
    total = 0
    # Cheapest first; among equals, claim the lower-numbered node. The trailing
    # elements are only here so a run is reproducible — and they are the reason
    # this listing and Kruskal's can lay different roads for the same money, since
    # Kruskal breaks the same tie on the *first* endpoint instead. heapq compares
    # tuples element by element, so putting the weight in front makes the whole
    # ordering free: no key function and no comparator.
    heap = []
    in_tree[start] = True                                   # @anchor seed
    for v, w in adj.get(start, []):
        if not in_tree[v]:
            heapq.heappush(heap, (w, v, start))
    # Running out of candidates with nodes still outside the tree is not a failure to
    # look hard enough: it is a spanning forest, and the far component was never
    # reachable from the start at all.
    while heap:                                             # @anchor disconnected
        w, v, u = heapq.heappop(heap)                       # @anchor pick-cheapest
        # Both ends already in the tree: this entry went stale in the queue.
        if in_tree[v]:
            continue                                         # @anchor skip-cycle
        in_tree[v] = True
        total += w                                           # @anchor add-edge
        for x, wx in adj.get(v, []):
            # An edge with both ends inside the tree is not even a candidate. That
            # is where Prim's cycle test lives: it never has to ask the question.
            if in_tree[x]:
                continue                                     # @anchor skip-in-tree
            heapq.heappush(heap, (wx, x, v))
    return total                                             # @anchor done`;

const JAVA = `import java.util.List;
import java.util.PriorityQueue;
import java.util.ArrayList;
import java.util.Comparator;

class Prim {
    static int prim(List<List<int[]>> adj, int start) {
        // adj.get(u) holds every { node, weight } pair one edge away from u. An
        // undirected edge appears once: Prim never traverses, it only looks at the
        // tree it already has.
        int n = adj.size();
        if (n == 0) return 0;
        // The tree starts empty, and this array is the whole of the record that it
        // is: there is no parent array and no component table, because an edge is
        // only ever offered when exactly one of its ends is already true in here.
        boolean[] inTree = new boolean[n];                   // @anchor start
        int total = 0;
        // Cheapest first; among equals, claim the lower-numbered node. The trailing
        // elements are only here so a run is reproducible — and they are the reason
        // this listing and Kruskal's can lay different roads for the same money,
        // since Kruskal breaks the same tie on the *first* endpoint instead. Java
        // has no tuple type before records, so a queue entry is an int[] of
        // { weight, outside, inside } and every term of the order is spelled out.
        Comparator<int[]> byCost = (a, b) -> {
            if (a[0] != b[0]) return Integer.compare(a[0], b[0]);
            if (a[1] != b[1]) return Integer.compare(a[1], b[1]);
            return Integer.compare(a[2], b[2]);
        };
        PriorityQueue<int[]> heap = new PriorityQueue<>(byCost);
        inTree[start] = true;                                // @anchor seed
        for (int[] e : adj.get(start)) {
            if (!inTree[e[0]]) heap.add(new int[] { e[1], e[0], start });
        }
        // Running out of candidates with nodes still outside the tree is not a
        // failure to look hard enough: it is a spanning forest, and the far component
        // was never reachable from the start at all.
        while (!heap.isEmpty()) {                            // @anchor disconnected
            int[] top = heap.poll();                         // @anchor pick-cheapest
            int w = top[0];
            int v = top[1];
            // Both ends already in the tree: this entry went stale in the queue.
            // PriorityQueue has no key update, so the duplicate is unavoidable.
            if (inTree[v]) continue;                         // @anchor skip-cycle
            inTree[v] = true;
            total += w;                                      // @anchor add-edge
            for (int[] e : adj.get(v)) {
                // An edge with both ends inside the tree is not even a candidate.
                // That is where Prim's cycle test lives: it never has to ask.
                if (inTree[e[0]]) continue;                 // @anchor skip-in-tree
                heap.add(new int[] { e[1], e[0], v });
            }
        }
        return total;                                        // @anchor done
    }
}`;

const CPP = `#include <vector>
#include <queue>
#include <utility>
using std::vector;
using std::pair;
using std::priority_queue;
using std::greater;

int prim(vector<vector<pair<int, int>>> adj, int start) {
    // adj[u] holds every { node, weight } pair one edge away from u, in edge order.
    // An undirected edge appears once: Prim never traverses, it only looks at the
    // tree it already has. adj is taken by value, so this is a copy.
    int n = (int)adj.size();
    if (n == 0) return 0;
    // The tree starts empty, and this vector is the whole of the record that it is:
    // there is no parent vector and no component table, because an edge is only ever
    // offered when exactly one of its ends is already true in here.
    vector<bool> inTree(n, false);                           // @anchor start
    int total = 0;
    // Entry is (weight, (outside, inside)). std::greater on a pair is a
    // lexicographic compare that recurses into the inner pair, so this one line buys
    // the cost ordering *and* the tie-break: no comparator object and no lambda.
    // Among equals this claims the lower-numbered node, which is the rule the other
    // three listings spell out — and the rule Kruskal does not use, which is why the
    // two can lay different roads for the same money.
    using Entry = pair<int, pair<int, int> >;
    priority_queue<Entry, vector<Entry>, greater<Entry> > heap;
    inTree[start] = true;                                    // @anchor seed
    for (const auto& e : adj[start]) {
        if (!inTree[e.first]) heap.push({ e.second, { e.first, start } });
    }
    // Running out of candidates with nodes still outside the tree is not a failure to
    // look hard enough: it is a spanning forest, and the far component was never
    // reachable from the start at all.
    while (!heap.empty()) {                                  // @anchor disconnected
        Entry top = heap.top();                              // @anchor pick-cheapest
        heap.pop();
        int w = top.first;
        int v = top.second.first;
        // Both ends already in the tree: this entry went stale in the queue.
        // priority_queue has no decreaseKey, so the duplicate is unavoidable.
        if (inTree[v]) continue;                             // @anchor skip-cycle
        inTree[v] = true;
        total += w;                                          // @anchor add-edge
        for (const auto& e : adj[v]) {
            // An edge with both ends inside the tree is not even a candidate. That
            // is where Prim's cycle test lives: it never has to ask the question.
            if (inTree[e.first]) continue;                   // @anchor skip-in-tree
            heap.push({ e.second, { e.first, v } });
        }
    }
    return total;                                            // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'Nothing is allocated yet, and that is worth noticing: Prim keeps no parent array, no component table, and no matrix. The only state is a boolean per node and the queue. Compare that with Kruskal, which needs a parent array *and* a size array for its union-find, and the shape of the difference between the two algorithms is already visible in their data structures.',
    python:
      'A list of booleans and an integer, and that is the entire state. The V-1 bound is not something this code has to enforce: the loop runs until the heap is empty, and the heap cannot empty before every node is in, because a node in the tree always leaves at least one candidate behind unless there is genuinely nothing left to reach. Python booleans are objects, so `in_tree` costs 8 bytes a pointer per node, which is not a consideration for a graph anyone types by hand.',
    java: '`boolean[]` rather than `Boolean[]`, so there is no boxing and the array is contiguous. The absence of a parent array is the substantive point: nothing here has to be able to answer "are these two nodes already joined", because the queue is only ever offered edges with one end outside the tree. A `PriorityQueue` of `int[]` is the same trade Python\'s tuples make for free, at the cost of a comparator you can see.',
    cpp: '`vector<bool>`, bit-packed, so a million nodes cost 125 KB rather than a million bytes. And no parent vector, no size vector, no `std::function` — because Prim\'s whole cycle test is "is the far end already in the tree", which is the `inTree` array right here. Kruskal needs a union-find precisely because it cannot make that simplification, and that is why its file is the longer of the two.',
  },
  seed: {
    javascript:
      'The start vertex joins the tree for free, and every one of its edges to the outside is pushed in one pass. This is the only genuinely free choice in the algorithm, and it is not a choice about *cost* at all: a different seed vertex gives a different tree of the same total weight, which is why the `start` parameter is a real control rather than a convenience. The push loop is also the only place the graph is read for the first time.',
    python:
      'One line, then the initial candidate list. `heapq.heappush` in a loop is the honest spelling; a list comprehension with a side effect reads worse and is no faster. Note there is no cycle test here either — the `if not in_tree[v]` guard is not about loops, it is about not queueing the seed against itself on a self-loop, and on a graph with no self-loops it never fires.',
    java: 'The seed is the parameter that makes Prim different from Kruskal in a way that is not about ties: change it and the tree changes shape, while the total does not. That is worth demonstrating in a UI, and it is the reason this listing takes a second argument where `kruskal.ts` takes only the graph. `new int[] { e[1], e[0], start }` is the tuple Python writes as `(w, v, start)`, and the reversed field order is the price of not having a record.',
    cpp: "The same three-field entry as everywhere else, pushed once per edge out of the seed. `heap.push({ e.second, { e.first, start } })` nests two pairs, which is more typing than Python's tuple but buys a total order with no comparator at all — and the nested `first` is the *outside* node, which is the one the algorithm is choosing. Getting those two roles the wrong way round compiles and produces a different tree, so the naming is the defence.",
  },
  'pick-cheapest': {
    javascript:
      'The greedy choice, and the sift-down loop is only here because JavaScript has no priority queue in the standard library. Note what is *not* being checked: nothing asks whether taking this edge closes a loop, because exactly one end is already in the tree, so it cannot. The whole safety argument is one sentence, and it is the sentence that lets Prim throw away a union-find.',
    python:
      '`heappop` is C-implemented: swap the root out, re-heapify, return the old root, O(log n) with no Python in the loop. The unpack `w, v, u = ...` names all three fields even though `u` is unused here, and that is deliberate — the entry carries the tree-side endpoint so the scan below knows which side to look from, and dropping the field would mean re-deriving it.',
    java: '`poll()` returns the head and removes it. The `int[]` unpack by index is the tax Java pays for having no tuples: `top[0]` is the weight, `top[1]` the node being claimed, `top[2]` the node it hangs from. A `record` would name them, and needs Java 16, which a driver this old cannot assume — so the index is the price and the comment is the documentation.',
    cpp: '`top()` returns a *reference* into the heap, so copying into `Entry top` before `pop()` is what stops it dangling. Unpacking the nested pair into `w` and `v` immediately keeps the rest readable, and it is the same single line the other three languages hide inside a destructuring pattern.',
  },
  'add-edge': {
    javascript:
      'Three writes: mark the node, add the weight, and then the loop below offers its edges. There is no parent array, so nothing records *which* edge was taken except the queue entry that has already been popped — the tree is the set of accepted edges and nothing needs to reconstruct it. That is why the return value is a sum: the edge list is not a thing this function builds.',
    python:
      "`in_tree[v] = True` then `total += w`. Two statements for the whole of Prim's output, which is worth contrasting with the union-find in `kruskal.ts`: a third of that file exists only to answer a question this function never has to ask. The total is a plain `int`, so it is the same value in all four languages with no sentinel and no floating point anywhere.",
    java: '`total += w` and one boolean write. `int` rather than `long` because the harness compares the four languages with a numeric tolerance and every weight here is a small integer; a real deployment summing fibre lengths would want `long`, and the sentinel-free return type means the change is one word.',
    cpp: "Same two lines. `total` is an `int` and would be a `long long` for anything measured in metres rather than abstract units, which is worth knowing before the first cable-length graph overflows it. Note that nothing writes down *which* edge was taken — the tree is implicit in the `inTree` flags plus the caller's own bookkeeping.",
  },
  'skip-in-tree': {
    javascript:
      'The edge that Prim never thinks about, and the reason the algorithm needs no union-find. Kruskal has to run a `find` on both endpoints of *every* edge in the graph to discover this; Prim discovers it by looking at a boolean while filling the queue. That is the entire practical argument for Prim on a dense graph, and it is invisible if you only read the total.',
    python:
      'One `continue`, and the comment is the lesson: the cycle test is a lookup, not a search. A version that asked "is there already a path between these two?" would be exponential and would be answering a strictly harder question than the one being asked. `in_tree[x]` is O(1) and can never be wrong, because every node in the tree is in the tree by construction.',
    java: 'The same guard, and the reason `kruskal.ts` is twice the length of this one. The comparison is on a boolean array rather than on component roots, which is a *stronger* statement: it does not merely say the two ends are joined, it says they are joined **by the tree**, which is the only thing that matters for a spanning tree.',
    cpp: 'Identical to the Java line, and `vector<bool>` makes the lookup a bit test. The comment above it is doing real work: a reader who has just come from a union-find will assume there is a cycle test coming and be confused by its absence, so the reason has to be written down where they are looking.',
  },
  'skip-cycle': {
    javascript:
      'A stale duplicate: the edge was queued when its far end was outside the tree, and that end joined by some cheaper route in the meantime. A binary heap has no way to lower a key in place, so the old entry is still there. This frame is the visible price of the lazy queue — and note it is the *only* kind of refusal in the algorithm, because everything else was never queued in the first place.',
    python:
      '`heapq` has no `decrease-key`, not because of Python but because it is a general-purpose library, so the duplicate is unavoidable in this shape. The standard alternatives are an indexed heap you write yourself, or a `TreeSet`-style container that supports removal — both more code than the duplicates are worth at the scale where Prim runs. Note that unlike `dijkstra.ts` this branch is *reachable*: Prim pops in cost order but the queue also holds edges whose far end has since been claimed.',
    java: '`PriorityQueue` offers no key update and the JDK provides no `decreaseKey`, so this line is not optional in this formulation. A textbook alternative is an `Edge` class with a `compareTo` plus a position index maintained by hand, which removes the duplicates and the branch together at the cost of a considerably longer class — the trade nearly every implementation makes the easy way.',
    cpp: 'Same story, and `std::set<Entry>` is the one standard container that *does* support erasing a stale entry in O(log n), at the price of a sorted structure: `pop` becomes `*begin()` plus `erase(begin())`, and every push has to check for an existing equal key. Most textbook C++ Prim uses the lazy version above, exactly as here.',
  },
  disconnected: {
    javascript:
      'The loop condition *is* the termination argument: a candidate only exists while some edge leaves the tree, so an empty queue means nothing reachable is left unconnected — not that the algorithm gave up early. On a connected graph the two coincide, because the last node added always leaves at least one edge to offer. On a disconnected one they do not, and the number returned is a tree of the starting component rather than a forest of the graph. `queue.length` reaching 0 with `inTree` short of `n` is the only evidence the caller gets, which is worth knowing before running this on a graph nobody has checked.',
    python:
      '`while heap` is truthy while the list is non-empty, so there is no `len()` call and no sentinel. Running out of candidates is not a failure to look hard enough — it is a proof that nothing reachable from the start is left unconnected. There is no `raise` here and no sentinel in the return either, which is deliberate: a tree of one component is a perfectly good answer and throwing would be the wrong call. The caller tells the two cases apart by counting nodes, not by inspecting the number.',
    java: '`!heap.isEmpty()` rather than a counter, and that is the whole termination argument. The `int` return type covers both the spanning tree and the tree-of-one-component case, so a caller that needs to know which happened has to count its own nodes — which is exactly what a cable-laying tool would want, since "here is your cheapest network" is useful and "sorry, no network" is not. The queue is drained here rather than abandoned, so nothing is left holding memory.',
    cpp: '`!heap.empty()`, and the loop simply ends: no separate code path, no exception, and the forest total is whatever falls out. `<vector>` is in the include list for `vector<bool>` alone here; the union-find in `kruskal.ts` also needs `<numeric>` for `std::iota` and `<algorithm>` for `std::sort`, and this function needs neither — a small but honest measure of how much less machinery growing one node at a time requires.',
  },
  done: {
    javascript:
      'A single integer, and the *deliberate* absence of the edge list. With tied weights, a different tie-break gives a different tree of identical cost, so the total is the part of the answer the graph determines and the tree is not. The `divergent` preset is built to make that concrete: five edges, both algorithms pay 5, and the roads they lay share only three of them.',
    python:
      'One `int`, and the return type needs no conversion at all — no infinity, no sentinel, no "not found" token, which is the whole reason an MST function is pleasant to write. Compare `dijkstra.ts`, which has to turn `inf` into -1 on the way out precisely because "no path" is a possible answer. Here every graph with at least one node has an answer, even a disconnected one.',
    java: '`int`, and no sentinel anywhere in the function. That is the practical reason MST code is short in every language: the answer is always a number, so there is never a second shape to handle and never a magic value a caller could mistake for a cost.',
    cpp: 'An `int` sums identically in all four languages. `long long` would be right for weights in metres or cents, and the only reason it is not here is that every weight in these presets is a small integer. The edge set is discarded: recovering it would mean remembering the popped entries, which is a different function with a different contract.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'prim',
    python: 'prim',
    java: 'Prim.prim',
    cpp: 'prim',
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
 * The claim is one integer: the total weight of the minimum spanning **forest**.
 *
 * Not the edge list, deliberately. A minimum spanning tree is unique only when
 * every weight is distinct, so with any tie at all a different tie-break lays a
 * different set of edges — the `divergent` preset exists to prove exactly that, and
 * `prims-mst.test.ts` checks the edge set against a brute-force reference anyway.
 * The total is the part of the answer the graph determines, so it is the part all
 * four implementations can be made to agree on, and the part worth asserting.
 *
 * Each number below is the output of a deliberately naive reference: repeat "look
 * at every edge, take the globally cheapest one that has exactly one end in the
 * tree" until there is none, rescanning the whole edge list every round. That is
 * O(V * E) with no queue at all, it looks nothing like Prim, and the two cannot
 * share a bug. It is deliberately *not* the spanning-forest reference a Kruskal
 * test would use, because the two disagree on a disconnected graph — 8 against 10
 * on `islands` — and quietly using the wrong one is precisely the bug that preset
 * exists to catch.
 */
const EXPECTED: Record<string, number> = {
  sparse: 13,
  dense: 32,
  divergent: 5,
  ladder: 15,
  islands: 8,
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const ids = (p.input.type === 'graph' ? p.input.nodes : []).map((nd) => nd.id);
  const at = new Map<NodeId, number>(ids.map((id, i) => [id, i]));
  const edges: Array<[number, number, number]> = [];
  for (const e of p.input.type === 'graph' ? p.input.edges : []) {
    const u = at.get(e.from);
    const v = at.get(e.to);
    if (u === undefined || v === undefined) continue;
    edges.push([u, v, e.weight ?? 1]);
  }
  // Every entry of `p.input.edges` is included, both directions of each road
  // included, so the adjacency the four listings receive matches the adjacency the
  // generator walks. Halving it here would be the bug described at the top of the
  // file: Prim would see a node whose edges all point away from it as a dead end.
  return {
    presetId: p.id,
    // Two arguments, exactly as `dijkstra.ts` does it: `graph` glue converts
    // argument 0 into an adjacency list and passes the rest through untouched.
    args: [{ nodes: ids.map((_, i) => i), edges }, Number(p.params?.start ?? 0)],
    result: EXPECTED[p.id] ?? 0,
  };
});

export const primsMstAlgo: AlgoDef<GraphFrame> = {
  id: 'prims-mst',
  title: "Prim's Minimum Spanning Tree",
  category: 'graphs',
  summary:
    'Grow one tree a node at a time: keep a priority queue of the edges crossing from the tree to everything outside it, take the cheapest, and drag its far end in — so an edge that would close a loop is never even a candidate.',
  intuition:
    'Reach for Prim when you are connecting things to *one* place as cheaply as possible and the graph is dense: laying cable from a single exchange to every premises, wiring a circuit from one battery rail, connecting one hub to a network of sensors, the "cheapest way to pipe everything to the plant" problem. Two practical reasons it beats Kruskal more often than the textbooks admit: it needs no union-find, so the code is a third of the size, and it streams — you can start with a partial adjacency and it keeps going. Prefer Kruskal when the graph is sparse, when the edges arrive in a stream you can sort once, or — the case that actually bites — when the graph may be disconnected and you want a forest over every component: Prim cannot even see the components it did not start in, and on the two-island preset here it reports 8 where Kruskal reports 10. And if you only want a cheap route between two nodes rather than a cheap way to connect all of them, this is the wrong algorithm entirely: that is Dijkstra.',
  complexity: {
    best: 'O((V + E) log V)',
    average: 'O((V + E) log V)',
    worst: 'O((V + E) log V)',
    space: 'O(V + E)',
    note: "The binary heap is lazy, so it can hold O(E) entries rather than O(V) and the real bound is O(E log E) on a graph with many parallel edges; an indexed heap with a decreaseKey would be O(V) space and no stale pops. Time is one scan of each node's edges on the way in plus one pop per queue entry, and the edge scans total O(E) because every node is scanned exactly once. Space here is the inTree flags and the queue — the tree itself is not stored.",
  },
  traits: {
    offline: true,
    tags: ['greedy', 'mst', 'priority-queue', 'undirected', 'grow-one-tree'],
  },
  viewport: 'graph',
  level: 'intermediate',
  params: [
    {
      key: 'start',
      label: 'Start node',
      kind: 'number',
      min: 0,
      max: 99,
      step: 1,
      default: 0,
      help: 'The one node that joins the tree for free. Change it and the shape of the tree changes — the total weight never does.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: primsMst,
  lesson,
  expectations,
  formatResult: (r) => `total weight ${String(r)}`,
  anchors: [
    'start',
    'seed',
    'pick-cheapest',
    'add-edge',
    'skip-in-tree',
    'skip-cycle',
    'disconnected',
    'done',
  ],
};

export default primsMstAlgo;
