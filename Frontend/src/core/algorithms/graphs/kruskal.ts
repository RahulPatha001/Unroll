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
 * Kruskal's minimum spanning tree, over an explicit union-find.
 *
 * Greedy from the cheapest end: look at every edge in weight order and take it
 * unless it would close a loop. "Would close a loop" is the only hard part, and
 * the answer is to stop asking about paths at all — keep a forest of disjoint
 * components, and an edge is safe exactly when its two endpoints are in
 * different components. Union-find answers that in effectively constant time.
 *
 * The `parent` record in every frame is that forest, drawn as dashed lines. The
 * green `inSet` edges are the growing tree. A tree is easy to recognise: the
 * moment two green edges form a triangle, an edge has been correctly refused.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 11;

/**
 * Undirected weights are listed once, and that is the *right* way to feed Kruskal
 * even though the traversal algorithms need both directions. Kruskal never
 * traverses: it only ever asks "are these two in the same component", which is
 * direction-free. Listing an undirected edge twice would not corrupt the answer
 * — the second copy would simply be refused — but it would double the sort for
 * nothing and make the picture show a doubled edge for every real one.
 */
const SPARSE = weightedGraph(SEED, 7);
const DENSE = weightedGraph(SEED + 26, 10);

/**
 * Five edges of weight 1 among seven nodes.
 *
 * Hand-built because the interesting behaviour of a greedy sort-and-keep
 * algorithm is a *tie*, and no seeded generator hands you ties on purpose. Here
 * five weight-1 edges compete for four of them, so exactly one is refused and the
 * moment it happens says everything about the cycle test.
 */
const TIES: { nodes: AlgoGraphNode[]; edges: AlgoGraphEdge[] } = {
  nodes: circleNodes(7),
  edges: [
    { from: 'n0', to: 'n1', directed: false, weight: 1 },
    { from: 'n0', to: 'n2', directed: false, weight: 2 },
    { from: 'n0', to: 'n3', directed: false, weight: 1 },
    { from: 'n1', to: 'n2', directed: false, weight: 1 },
    { from: 'n1', to: 'n4', directed: false, weight: 3 },
    { from: 'n2', to: 'n3', directed: false, weight: 1 },
    { from: 'n2', to: 'n5', directed: false, weight: 2 },
    { from: 'n3', to: 'n5', directed: false, weight: 1 },
    { from: 'n3', to: 'n6', directed: false, weight: 4 },
    { from: 'n4', to: 'n6', directed: false, weight: 1 },
    { from: 'n5', to: 'n6', directed: false, weight: 2 },
  ],
};

/**
 * Two islands and no bridge.
 *
 * There is no spanning tree here, and the honest answer is the minimum spanning
 * *forest*: the cheapest tree inside each component and nothing connecting them.
 * Watching the edge list run out with the `taken` count short of V-1 is the fact
 * that stops people assuming "minimum spanning tree" is always well defined.
 */
const FOREST: { nodes: AlgoGraphNode[]; edges: AlgoGraphEdge[] } = {
  nodes: circleNodes(7),
  edges: [
    { from: 'n0', to: 'n1', directed: false, weight: 4 },
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
    label: 'Sparse, 7 nodes',
    blurb:
      'Seven nodes, seven edges, three different weights. Exactly one edge is refused and the tree closes after six takes — which is the whole claim: a spanning tree on V nodes has V-1 edges, so the algorithm can afford to be wrong about at most E-V+1 edges.',
    input: graphInput(SPARSE.nodes, SPARSE.edges, { directed: false, weighted: true }),
  },
  {
    id: 'dense',
    label: 'Dense, 10 nodes',
    blurb:
      'Sixteen edges for ten nodes, so seven get refused. The cost of the greedy is visible here: it considers a lot of edges to buy a tree with only nine of them, and the union-find forest turns from a scatter into a single connected blob on the last take.',
    input: graphInput(DENSE.nodes, DENSE.edges, { directed: false, weighted: true }),
  },
  {
    id: 'ties',
    label: 'Five edges of weight 1',
    blurb:
      'Five weight-1 edges competing for four slots. The one that loses is refused by the cycle test, not by weight — a different tie-break order would refuse a different weight-1 edge and build a different tree of the *same* total cost.',
    input: graphInput(TIES.nodes, TIES.edges, { directed: false, weighted: true }),
  },
  {
    id: 'forest',
    label: 'Two components',
    blurb:
      'The edge list runs out before V-1 edges have been taken, because nodes 0-3 and 4-6 share no connection. What comes out is a minimum spanning forest of total weight 10, and the fact that no spanning tree exists is the actual output.',
    input: graphInput(FOREST.nodes, FOREST.edges, { directed: false, weighted: true }),
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

function read(input: AlgoInput): {
  ids: NodeId[];
  label: (i: number) => string;
  edges: GraphEdge[];
  nodes: Record<NodeId, GraphNode>;
} {
  const g = isGraph(input) ? input : null;
  const src: AlgoGraphNode[] = g?.nodes ?? [];
  const ids = src.map((nd) => nd.id);
  const nodes: Record<NodeId, GraphNode> = {};
  for (const nd of src) nodes[nd.id] = { id: nd.id, x: nd.x, y: nd.y, label: nd.label };
  const label = (i: number): string => {
    const id = ids[i];
    return id === undefined ? '?' : (nodes[id]?.label ?? id);
  };
  const edges: GraphEdge[] = (g?.edges ?? []).map((e) => ({
    from: e.from,
    to: e.to,
    directed: false,
    ...(e.weight === undefined ? {} : { weight: e.weight }),
  }));
  return { ids, label, edges, nodes };
}

export function* kruskal(ctx: RunContext): Generator<GraphFrame> {
  const { ids, label, edges, nodes } = read(ctx.input);
  const n = ids.length;
  const at = new Map<NodeId, number>(ids.map((id, i) => [id, i]));

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
    // Fresh every frame: `inSet` is the one field in this algorithm that changes,
    // and a shared array would make stepping backwards show a future tree.
    edges: edges.map((e) => ({ ...e, ...(taken.has(edgeKey(e)) ? { inSet: true } : {}) })),
    // Kruskal has no frontier of nodes: the pending work is a list of *edges*, and
    // GraphFrame.frontier holds node ids. Rather than smuggle edges into it as
    // composite strings, the frontier stays empty and the caption carries the
    // "k of E" position in the sorted list.
    frontier: [],
    visited: tree(),
    // The union-find forest, as a fresh record every frame. Roots map to
    // themselves and GraphView skips those, so only the merges are drawn.
    parent: Object.fromEntries(ids.map((id, i) => [id, ids[par[i] as number] as NodeId])),
    ...(o.caption === undefined ? {} : { caption: o.caption }),
    ...(o.ops === undefined ? {} : { ops: o.ops }),
    ...(o.vars === undefined ? {} : { vars: o.vars }),
    ...(o.highlight === undefined ? {} : { highlight: o.highlight }),
    ...(o.result === undefined ? {} : { result: o.result }),
  });

  const edgeKey = (e: GraphEdge): string => `${e.from}~${e.to}`;
  /** Distinct node ids in the order they joined the tree — the legend counts these. */
  const tree = (): NodeId[] => [...new Set(accepted)];
  interface Candidate {
    w: number;
    u: number;
    v: number;
  }

  // A total order, not just "by weight": the (u, v) tie-break is what makes all
  // four implementations accept the same edge out of a group of equal weights.
  const queue: Candidate[] = edges
    .map((e) => ({
      w: e.weight ?? 1,
      u: at.get(e.from) as number,
      v: at.get(e.to) as number,
    }))
    .sort((a, b) => a.w - b.w || a.u - b.u || a.v - b.v);

  /** Union-find over node positions. Roots point at themselves. */
  const par: number[] = ids.map((_, i) => i);
  const size: number[] = ids.map(() => 1);
  const accepted: NodeId[] = [];
  const taken = new Set<string>();
  let ops = 0;
  let total = 0;

  /**
   * Root of x's component, with full path compression on the way back down: every
   * node walked past is re-pointed at the root, so the forest the viewport draws
   * visibly flattens as the run goes on.
   */
  const find = (x: number): number => {
    let r = x;
    while (par[r] !== r) r = par[r] as number;
    let c = x;
    while (par[c] !== c) {
      const up = par[c] as number;
      par[c] = r;
      c = up;
    }
    return r;
  };

  yield snap(
    'sort',
    n === 0
      ? 'No nodes, no tree. Done.'
      : `Sort all ${edges.length} edges by weight, cheapest first. The sort *is* the algorithm: Kruskal is "cheapest first, keep unless it loops", and the tie-break on the endpoint indices is what makes the choice reproducible when weights tie.`,
    {
      caption: n === 0 ? 'Empty graph' : `${edges.length} edges · cheapest ${queue[0]?.w ?? 0}`,
      ops,
      highlight: { unvisited: ids },
      vars: { n, edges: edges.length, cheapest: queue[0]?.w ?? 0, taken: 0, total: 0 },
    },
  );

  if (n === 0) {
    yield snap('done', 'Zero nodes means a total weight of 0.', {
      result: 'empty',
      vars: { n, total: 0 },
    });
    return;
  }

  for (let k = 0; k < queue.length; k++) {
    if (ctx.shouldStop()) return;
    const c = queue[k] as Candidate;
    const uId = ids[c.u] as NodeId;
    const vId = ids[c.v] as NodeId;
    const rest = queue.slice(k + 1);
    ops++;

    yield snap(
      'consider',
      `Next cheapest edge: ${label(c.u)} – ${label(c.v)}, weight ${c.w}. The question is not "is this cheap" — the sort already settled that — it is "are the two ends already in the same component", and the only thing that can answer that is the forest of accepted edges. ${rest.length} edge${rest.length === 1 ? '' : 's'} still queued behind it.`,
      {
        caption: `${k + 1} of ${queue.length} · total ${total}`,
        ops,
        highlight: { compare: [uId, vId], inMst: tree() },
        vars: { u: label(c.u), v: label(c.v), w: c.w, taken: taken.size, total },
      },
    );

    const ru = find(c.u);
    const rv = find(c.v);

    yield snap(
      'find',
      `Walk the parent pointers up from ${label(c.u)} to reach its root, ${label(ru)}, then from ${label(c.v)} to reach ${label(rv)}, re-pointing everything passed on the way at the root. ${ru === rv ? 'The two roots are the same node, which is the whole cycle test.' : 'The roots differ, so this edge joins two different components.'} The forest drawn in dashed lines is exactly this table, and it gets flatter every time.`,
      {
        caption: `${k + 1} of ${queue.length} · roots ${label(ru)} / ${label(rv)}`,
        ops,
        highlight: { compare: [uId, vId], inMst: tree() },
        vars: {
          u: label(c.u),
          v: label(c.v),
          w: c.w,
          uRoot: label(ru),
          vRoot: label(rv),
          sameRoot: ru === rv,
          taken: taken.size,
        },
      },
    );

    if (ru === rv) {
      yield snap(
        'reject',
        `Both ends are already in the component rooted at ${label(ru)}, so taking ${label(c.u)} – ${label(c.v)} would close a loop. Refused. This is the only test the algorithm needs, and it is why the code never asks what the *path* between the two ends is — that question is exponential, and the forest answers a strictly weaker version of it in constant time.`,
        {
          caption: `${k + 1} of ${queue.length} · refused`,
          ops,
          highlight: { compare: [uId, vId], inMst: tree() },
          result: 'cycle',
          vars: {
            u: label(c.u),
            v: label(c.v),
            w: c.w,
            uRoot: label(ru),
            vRoot: label(rv),
            taken: taken.size,
            total,
          },
        },
      );
      continue;
    }

    // Union by size: the smaller tree hangs off the larger one's root, which is
    // what keeps the forest shallow without relying on path compression alone.
    let big = ru;
    let small = rv;
    if ((size[big] as number) < (size[small] as number)) {
      const t = big;
      big = small;
      small = t;
    }
    par[small] = big;
    size[big] = (size[big] as number) + (size[small] as number);
    accepted.push(uId, vId);
    taken.add(`${uId}~${vId}`);
    total += c.w;

    yield snap(
      'accept',
      `Different components, so take it: ${label(c.u)} – ${label(c.v)} joins the tree for ${c.w}, and ${label(small)} now hangs off ${label(big)} in the union-find forest because the smaller tree was made to hang off the larger. Running total ${total}. Note what is *not* here: no path reconstruction, no matrix, no reachability search.`,
      {
        caption: `${k + 1} of ${queue.length} · total ${total}`,
        ops,
        highlight: { inMst: tree(), compare: [uId, vId] },
        vars: {
          u: label(c.u),
          v: label(c.v),
          w: c.w,
          rootU: label(big),
          rootV: label(small),
          taken: taken.size,
          total,
        },
      },
    );

    if (taken.size === n - 1) {
      yield snap(
        'full',
        `That is ${n - 1} edges on ${n} nodes, and a tree on ${n} nodes has exactly ${n - 1} edges — so the tree is connected and there is nothing cheaper left to find. Stop here: every remaining edge in the queue would close a loop, because all ${n} nodes are already in one component.`,
        {
          caption: `Spanning tree complete · total ${total}`,
          ops,
          highlight: { inMst: tree() },
          result: 'tree',
          vars: { taken: taken.size, needed: n - 1, n, total },
        },
      );
      break;
    }
  }

  if (taken.size < n - 1) {
    yield snap(
      'exhausted',
      `The edge list ran out with only ${taken.size} of the ${n - 1} edges a spanning tree would need. That is not a failure — it means the graph is disconnected, and what has been built is a minimum spanning *forest*: the cheapest tree inside each component. Nodes in different components can never be joined, so no spanning tree of this graph exists.`,
      {
        caption: `Minimum spanning forest · total ${total}`,
        ops,
        highlight: {
          inMst: tree(),
          unvisited: ids.filter((_, i) => !accepted.includes(ids[i] as NodeId)),
        },
        result: 'forest',
        vars: { taken: taken.size, needed: n - 1, n, total },
      },
    );
  }

  yield snap(
    'done',
    `${taken.size} edge${taken.size === 1 ? '' : 's'} accepted out of ${edges.length} considered, for a total weight of ${total}. The answer is just the sum: which particular tree you get depends on how ties in weight are broken, but the *total* is the same for every minimum spanning tree, which is why it is the thing worth returning and the thing worth asserting.`,
    {
      caption: `Total weight ${total}`,
      ops,
      highlight: { inMst: tree() },
      result: taken.size === n - 1 ? 'tree' : 'forest',
      vars: { taken: taken.size, considered: edges.length, n, total },
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

const JS = `function kruskal(adj) {
  // \`adj\` is the neighbour list built from { nodes, edges }: adj[u] holds every
  // [node, weight] pair one edge away from u. An undirected edge appears once,
  // because Kruskal never traverses — it only asks whether two nodes are already
  // in the same component, which does not care which way the edge points.
  const n = Object.keys(adj).length;
  const all = [];
  for (let u = 0; u < n; u++) {
    for (const [v, w] of adj[u] ?? []) all.push([w, u, v]);
  }
  // Cheapest first, then by endpoints: a total order, so ties resolve the same
  // way on every run and in every language.
  all.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);  // @anchor sort
  const parent = Array.from({ length: n }, (_, i) => i);
  const size = new Array(n).fill(1);
  // Union-Find with path halving: every node walked past points straight at the
  // root, so the forest gets shallower as the run goes on.
  const find = (x) => {                                    // @anchor find
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== x) {
      const up = parent[x];
      parent[x] = r;
      x = up;
    }
    return r;
  };
  let total = 0;
  let taken = 0;
  for (const [w, u, v] of all) {                            // @anchor consider
    const ru = find(u);
    const rv = find(v);
    if (ru === rv) continue;                               // @anchor reject
    // Union by size: hang the smaller tree off the larger root.
    let big = ru;
    let small = rv;
    if (size[big] < size[small]) [big, small] = [small, big];
    parent[small] = big;                                   // @anchor accept
    size[big] += size[small];
    total += w;
    taken++;
    if (taken === n - 1) break;                            // @anchor full
  }
  // Falling out of the loop rather than breaking out of it means the edge list
  // ran dry before V-1 edges were taken: the graph is disconnected and what has
  // been built is a minimum spanning forest, not a spanning tree.
  // @anchor exhausted
  return total;                                            // @anchor done
}`;

const PY = `def kruskal(adj):
    # \`adj\` is the neighbour list built from { nodes, edges }: adj[u] holds every
    # (node, weight) pair one edge away from u. An undirected edge appears once,
    # because Kruskal never traverses — it only asks whether two nodes are already
    # in the same component, which does not care which way the edge points.
    n = len(adj)
    all = []
    for u in range(n):
        for v, w in adj.get(u, []):
            all.append((w, u, v))
    # Cheapest first, then by endpoints: a total order, so ties resolve the same
    # way on every run and in every language.
    all.sort()                                             # @anchor sort
    parent = list(range(n))
    size = [1] * n
    # Union-Find with path halving: every node walked past points straight at the
    # root, so the forest gets shallower as the run goes on.
    def find(x):                                           # @anchor find
        r = x
        while parent[r] != r:
            r = parent[r]
        while parent[x] != x:
            parent[x], x = r, parent[x]
        return r
    total = 0
    taken = 0
    for w, u, v in all:                                     # @anchor consider
        ru = find(u)
        rv = find(v)
        if ru == rv:
            continue                                       # @anchor reject
        # Union by size: hang the smaller tree off the larger root.
        big, small = (ru, rv) if size[ru] >= size[rv] else (rv, ru)
        parent[small] = big                                # @anchor accept
        size[big] += size[small]
        total += w
        taken += 1
        if taken == n - 1:
            break                                          # @anchor full
    # Falling out of the loop rather than breaking out of it means the edge list
    # ran dry before V-1 edges were taken: the graph is disconnected and what has
    # been built is a minimum spanning forest, not a spanning tree.
    # @anchor exhausted
    return total                                           # @anchor done`;

const JAVA = `import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

class Kruskal {
    static int kruskal(List<List<int[]>> adj) {
        // adj.get(u) holds every { node, weight } pair one edge away from u. An
        // undirected edge appears once: Kruskal never traverses, it only asks
        // whether two nodes are already in the same component.
        int n = adj.size();
        List<int[]> all = new ArrayList<>();
        for (int u = 0; u < n; u++) {
            for (int[] e : adj.get(u)) all.add(new int[] { e[1], u, e[0] });
        }
        // Cheapest first, then by endpoints: a total order, so ties resolve the
        // same way on every run and in every language.
        all.sort(Comparator.<int[]>comparingInt(a -> a[0])   // @anchor sort
                .thenComparingInt(a -> a[1])
                .thenComparingInt(a -> a[2]));
        int[] parent = new int[n];
        for (int i = 0; i < n; i++) parent[i] = i;
        int[] size = new int[n];
        Arrays.fill(size, 1);
        int total = 0;
        int taken = 0;
        for (int[] e : all) {                                 // @anchor consider
            int w = e[0];
            int u = e[1];
            int v = e[2];
            int ru = find(parent, u);
            int rv = find(parent, v);
            if (ru == rv) continue;                          // @anchor reject
            // Union by size: hang the smaller tree off the larger root.
            int big = ru;
            int small = rv;
            if (size[big] < size[small]) { int t = big; big = small; small = t; }
            parent[small] = big;                              // @anchor accept
            size[big] += size[small];
            total += w;
            taken++;
            if (taken == n - 1) break;                        // @anchor full
        }
        // Falling out of the loop rather than breaking out of it means the edge
        // list ran dry before V-1 edges were taken: the graph is disconnected
        // and what has been built is a minimum spanning forest.
        // @anchor exhausted
        return total;                                        // @anchor done
    }

    // Union-Find root of x, with full path compression on the way back down.
    static int find(int[] parent, int x) {                    // @anchor find
        int r = x;
        while (parent[r] != r) r = parent[r];
        while (parent[x] != x) {
            int up = parent[x];
            parent[x] = r;
            x = up;
        }
        return r;
    }
}`;

const CPP = `#include <vector>
#include <algorithm>
#include <numeric>
#include <utility>
using std::vector;

int kruskal(vector<vector<std::pair<int, int>>> adj) {
    // adj[u] holds every { node, weight } pair one edge away from u. An
    // undirected edge appears once: Kruskal never traverses, it only asks
    // whether two nodes are already in the same component.
    int n = (int)adj.size();
    vector<std::pair<int, std::pair<int, int>>> all;
    for (int u = 0; u < n; u++) {
        for (const auto& e : adj[u]) all.push_back({ e.second, { u, e.first } });
    }
    // Cheapest first, then by endpoints: a total order, so ties resolve the same
    // way on every run and in every language.
    std::sort(all.begin(), all.end());                        // @anchor sort
    vector<int> parent(n);
    std::iota(parent.begin(), parent.end(), 0);
    vector<int> size(n, 1);
    // Union-Find root of x, with full path compression on the way back down. A
    // plain lambda rather than std::function, because the body is not recursive.
    auto find = [&](int x) -> int {                           // @anchor find
        int r = x;
        while (parent[r] != r) r = parent[r];
        while (parent[x] != x) {
            int up = parent[x];
            parent[x] = r;
            x = up;
        }
        return r;
    };
    int total = 0;
    int taken = 0;
    for (const auto& e : all) {                              // @anchor consider
        int w = e.first;
        int u = e.second.first;
        int v = e.second.second;
        int ru = find(u);
        int rv = find(v);
        if (ru == rv) continue;                              // @anchor reject
        // Union by size: hang the smaller tree off the larger root.
        int big = ru;
        int small = rv;
        if (size[big] < size[small]) std::swap(big, small);
        parent[small] = big;                                 // @anchor accept
        size[big] += size[small];
        total += w;
        taken++;
        if (taken == n - 1) break;                           // @anchor full
    }
    // Falling out of the loop rather than breaking out of it means the edge list
    // ran dry before V-1 edges were taken: the graph is disconnected and what has
    // been built is a minimum spanning forest, not a spanning tree.
    // @anchor exhausted
    return total;                                            // @anchor done
}`;

const NOTES = {
  sort: {
    javascript:
      'The sort is the algorithm; the rest is bookkeeping. `all` holds `[weight, u, v]` triples rather than objects because comparing a fixed tuple is shorter than a comparator object, and the extra two comparisons are what make the order *total* — without them two weight-5 edges could be ordered differently by two engines, and the harness would report a mismatch that is not a bug.',
    python:
      "`all.sort()` on `(weight, u, v)` tuples with no key function at all: Python compares tuples element by element, so the lexicographic order of the tuple *is* the total order you want, and `key=lambda e: e[0]` would be both slower and wrong. Python's sort is stable, but stability is irrelevant here precisely because the comparator is already total.",
    java: '`Comparator.comparingInt(...).thenComparingInt(...)` is the three-part comparator spelled out, and it is a lot of ceremony for a sort key. `all.sort(...)` on a `List<int[]>` uses the `Comparator<int[]>` overload — an `int[]` is not `Comparable`, which is why the lambda chain is mandatory rather than optional.',
    cpp: '`std::pair` nests to carry three values, and `std::sort` on pairs is lexicographic by default — the same total order as the Python tuple, for the same reason and with no comparator at all. `std::sort` is *not* stable, so if the sort key were only the weight the accepted edge set would differ between runs; that is why the endpoints are in the key.',
  },
  find: {
    javascript:
      "Two loops, not one: the first walks up to the root, the second walks back down pointing everything it passes at that root. That is path halving's simpler cousin, full path compression, and it is why the forest drawn in the viewport gets visibly flatter as the run proceeds. A recursive version would be shorter and would blow the JS stack on a long chain.",
    python:
      'A nested function closing over `parent`, which is why the two loops can be written without a parameter. Note the tuple assignment `parent[x], x = r, parent[x]` — the right-hand side is evaluated before either write, so this rebinds `parent[x]` to the root and then steps `x` up to where it used to point, in one line. Python has no `--`, and this is the other place that bites.',
    java: 'A recursive helper, so the path compression happens on the way *out* of each recursive call rather than in a second loop. `private static` would be needed for a real class, but this listing keeps it inside the method because the two-line loop version in the other three languages is not expressible as cleanly here without a helper class.',
    cpp: '`std::function` because a lambda cannot call itself without capturing itself, and a plain function would have to take the `parent` vector as a parameter. The non-recursive two-loop form — identical to the JavaScript above — avoids `std::function` entirely and is the version to reach for when the union-find is local.',
  },
  consider: {
    javascript:
      'Edges come off the *sorted* list, so this line and the sort together are the greedy. No priority queue is needed and that is worth noticing: sorting once up front is O(E log E) and gets the cheapest edge first every time, whereas Dijkstra needed a live heap because it discovers edges as it goes.',
    python:
      'Tuple unpacking in the `for` header, so `w`, `u` and `v` are bound for the body with no indexing at all. The alternative — `for e in all: w, u, v = e` — is the same thing written worse, and a common copy-paste error in a loop where the weight comes first.',
    java: '`int[]` per edge means unpacking by index: `e[0]` is the weight, `e[1]` the source, `e[2]` the target, and the order is the reverse of the adjacency pair. A record would fix that readability problem, but records need Java 16 and a driver this old cannot assume one.',
    cpp: 'Structured bindings would make this `auto [w, uv] = e; int u = uv.first;` — closer to the Python, further from the adjacency pair. Reading `e.first` and `e.second.first` out loud is how the two different pair layouts in this function get confused, and the variable names are the defence.',
  },
  reject: {
    javascript:
      '`continue` when the two finds agree, and the comparison is on *roots* rather than on the nodes. That is the whole cycle test: an edge closes a loop exactly when its ends are already joined, and the forest of accepted edges is the only place that fact is recorded — nothing here is looking at a path.',
    python:
      'The same root comparison, and `continue` is free here because the loop body is the rest of the function. Writing it as `if ru != rv: ...` with the body indented instead is the other common shape; the early `continue` is easier to read once the loop gets a third branch.',
    java: 'Comparing `parent[u] == parent[v]` is *not* the same as comparing roots — it is only correct because path compression has already flattened both to the root. `find(u) == find(v)` would be right unconditionally and is the version to write by habit, at the cost of two function calls per edge.',
    cpp: '`std::swap(big, small)` from `<utility>` is the clean way to order the two roots, and it is why that header is in the include list. A hand-rolled `int t = big; big = small; small = t;` is the JavaScript spelling and works identically; `swap` is just the version the standard library bothers to provide.',
  },
  accept: {
    javascript:
      'The single write that merges two components. Union by size — smaller tree hangs off the larger root — is the half of union-find that needs no argument to justify: without it the forest can degenerate into a list of length V and `find` becomes O(V). The other half is the compression in the find above; you want both.',
    python:
      'One line. `parent[small] = big` with no `find` call around it, because `big` and `small` are already roots — that is the invariant that makes union-find constant time, and losing it (by assigning `parent[rv] = ru` when `ru` is not a root) is the classic way to write a correct-looking but quadratic implementation.',
    java: 'The same single write, and the `size` bookkeeping is what makes the *choice* of root meaningful. Without it the choice would be arbitrary, and an arbitrary choice is not wrong but is O(log V) at best instead of effectively constant.',
    cpp: '`parent[small] = big` and `size[big] += size[small]`, both plain vector element writes. The `size` array is not strictly necessary for correctness — a spanning forest of any shape is still a minimum spanning forest — so it is here for the bound, not the answer.',
  },
  full: {
    javascript:
      'A tree on n nodes has exactly n-1 edges, so reaching that count is a *proof* of connectedness rather than a heuristic stopping point. The `break` is what makes Kruskal O(E log E) rather than O(E log E + E) — both trivial, but the break also means the remaining edges are never even looked at, which matters on a dense graph where E is ten times V.',
    python:
      '`break` inside a `for` leaves the loop entirely, which is the behaviour people expect and the reason Python needs no labelled break here. Reaching `n - 1` before the list is exhausted is also the *only* way this algorithm can prove the graph was connected, so the condition is doing double duty as a stopping rule and as a certificate.',
    java: '`break` out of the enhanced-for, which is a plain loop jump with no label needed because the test is in the outermost loop. The count `taken === n - 1` is the certificate: with `n - 1` accepted edges over `n` nodes and no cycle ever accepted, the accepted set is provably a spanning tree.',
    cpp: '`break` out of a range-based for over a `vector`, which is a plain `break` and not an iterator invalidation problem — the loop variable is a reference into `all`, which is untouched here. If the body had modified `all` this would be undefined behaviour, which is a good reason never to modify the container you are ranging over.',
  },
  exhausted: {
    javascript:
      'The edges ran out before a spanning tree was completed, and that is not a failure — it means the graph is disconnected. What has been built is a minimum spanning *forest*: the cheapest tree inside each component, independently. No spanning tree of this graph exists, because nodes in different components have no path between them at any cost. The `find` calls are what would have discovered the disconnection earlier; running off the end of the edge list is the same fact, discovered later.',
    python:
      'The edges ran out before a spanning tree was completed, and that is not a failure — it means the graph is disconnected. What has been built is a minimum spanning *forest*: the cheapest tree inside each component, independently. No spanning tree of this graph exists, because nodes in different components have no path between them at any cost. The `find` calls are what would have discovered the disconnection earlier; running off the end of the edge list is the same fact, discovered later.',
    java: 'The edges ran out before a spanning tree was completed, and that is not a failure — it means the graph is disconnected. What has been built is a minimum spanning *forest*: the cheapest tree inside each component, independently. No spanning tree of this graph exists, because nodes in different components have no path between them at any cost. This is the practical reason Kruskal is preferred in real systems: a disconnected graph yields a usable forest rather than an exception, and the union-find structure is what makes that check O(1) amortised instead of a fresh reachability search.',
    cpp: 'The edges ran out before a spanning tree was completed, and that is not a failure — it means the graph is disconnected. What has been built is a minimum spanning *forest*: the cheapest tree inside each component, independently. No spanning tree of this graph exists, because nodes in different components have no path between them at any cost. The `find` calls are what would have discovered the disconnection earlier; running off the end of the edge list is the same fact, discovered later.',
  },
  done: {
    javascript:
      'A single integer: the total weight of the minimum spanning tree. Returning the *sum* rather than the edge list is a deliberate choice — with ties in weight, different tie-breaks produce different trees of equal cost, so the total is the part of the answer that is actually determined by the graph.',
    python:
      'One `int`, and `sum` would have been equivalent had the edges been kept. The verifier compares this against the other three languages with a numeric tolerance, which is why an integer result is a nicer contract than a list of endpoints that would also have to agree on tie-breaking.',
    java: '`int` rather than `int[]`, for the same reason as everywhere else in this curriculum: the MST weight is the determined quantity. If you needed the actual edges you would keep the accepted triples — and then you would have to pin the tie-break, because two runs could legitimately disagree.',
    cpp: 'An `int` sums to the same value in all four languages, and `long long` would be the right return type for weights that can exceed 2^31. `std::sort` has already thrown away the order information here, which is fine: recovering the edges would mean sorting a second time and is only worth doing when the tree itself is the deliverable.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'kruskal',
    python: 'kruskal',
    java: 'Kruskal.kruskal',
    cpp: 'kruskal',
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
 * The claim is the **total weight** of the minimum spanning forest, as one
 * integer.
 *
 * Not the edge list: with ties in weight, a different but equally valid
 * tie-break picks a different tree. Every total is the same, so the total is the
 * part of the answer the graph actually determines — and the part all four
 * languages can be made to agree on.
 */
const EXPECTED: Record<string, number> = {
  sparse: 34,
  dense: 37,
  ties: 7,
  forest: 10,
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
  return {
    presetId: p.id,
    args: [{ nodes: ids.map((_, i) => i), edges }],
    result: EXPECTED[p.id] ?? 0,
  };
});

export const kruskalAlgo: AlgoDef<GraphFrame> = {
  id: 'kruskal',
  title: "Kruskal's Minimum Spanning Tree",
  category: 'graphs',
  summary:
    'Consider every edge from cheapest to dearest and keep it unless its endpoints are already joined, which is decided by a union-find forest rather than by searching for a path.',
  intuition:
    'Reach for Kruskal when you have to connect things as cheaply as possible: laying fibre or cable between houses, wiring sensors, connecting clusters in a network, minimising the total length of a network, the "cheapest way to connect these pins" in hardware. Its sibling Prim is usually faster on a *dense* graph (one starting vertex, edges pulled from a heap) while Kruskal wins on a *sparse* one and streams beautifully — you can sort the edges on disk and feed them in. If you only need a cheap route between two nodes rather than a cheap way to connect all of them, this is the wrong algorithm: that is Dijkstra, and it is asymptotically cheaper.',
  complexity: {
    best: 'O(E log E)',
    average: 'O(E log E)',
    worst: 'O(E log E)',
    space: 'O(V)',
    note: 'The sort dominates; union-find with union by size and path compression is effectively constant, at O(α(V)) amortised, where α is the inverse Ackermann function and is below 5 for any V a computer can name. Space is the parent and size arrays, not the edge list, which the caller already holds.',
  },
  traits: {
    offline: true,
    tags: ['greedy', 'mst', 'union-find', 'undirected', 'sort-based'],
  },
  viewport: 'graph',
  level: 'advanced',
  params: [],
  inputSpec,
  presets: PRESETS,
  run: kruskal,
  lesson,
  expectations,
  formatResult: (r) => `total weight ${String(r)}`,
  anchors: ['sort', 'find', 'consider', 'reject', 'accept', 'full', 'exhausted', 'done'],
};

export default kruskalAlgo;
