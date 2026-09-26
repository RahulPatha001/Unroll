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
 * Dijkstra's shortest-path algorithm.
 *
 * This is the module to read if you want to see what a priority queue is *for*.
 * BFS gets away with a plain FIFO queue because "distance" means "hops". The
 * moment edges have different costs, the next node to expand is no longer the
 * oldest one — it is the *cheapest* one — and the container has to change
 * accordingly. Every other part of the algorithm is unchanged.
 *
 * The correctness argument is greedy and worth being able to state: when the
 * minimum tentative distance is popped, no path through an unexpanded node can be
 * cheaper, because every edge is non-negative. That is the assumption Dijkstra
 * makes and the exact thing Bellman-Ford gives up (`bellman-ford.ts`) to buy
 * support for negative edges.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 11;

/**
 * Undirected weights need both directions in a flat edge list.
 *
 * Written once, used by every preset below, and mirrored in the expectation
 * arguments — the four language implementations receive the doubled list, so
 * the traversal they see is the same traversal the animation shows.
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

const SPARSE = weightedGraph(SEED, 7);
const DENSE = weightedGraph(SEED + 26, 10);

/**
 * The greedy trap, hand-built.
 *
 * A cheap two-hop route and an expensive one-hop route between the same two
 * nodes. Any algorithm that looks one hop ahead — BFS above all — takes the
 * direct edge and is wrong. Dijkstra does not, because it is willing to look
 * two steps ahead: it settles 1 at cost 1 before it ever touches 3 at cost 20.
 */
const TRAP: { nodes: AlgoGraphNode[]; edges: AlgoGraphEdge[] } = {
  nodes: circleNodes(5),
  edges: [
    { from: 'n0', to: 'n1', directed: false, weight: 1 },
    { from: 'n1', to: 'n2', directed: false, weight: 1 },
    { from: 'n1', to: 'n3', directed: false, weight: 1 },
    { from: 'n0', to: 'n3', directed: false, weight: 20 },
    { from: 'n3', to: 'n4', directed: false, weight: 1 },
    { from: 'n2', to: 'n4', directed: false, weight: 1 },
  ],
};

/** A road network with a village attached by a single expensive road. */
const SPLIT: { nodes: AlgoGraphNode[]; edges: AlgoGraphEdge[] } = {
  nodes: circleNodes(6),
  edges: [
    { from: 'n0', to: 'n1', directed: false, weight: 4 },
    { from: 'n1', to: 'n2', directed: false, weight: 3 },
    { from: 'n0', to: 'n2', directed: false, weight: 9 },
    { from: 'n2', to: 'n3', directed: false, weight: 2 },
    { from: 'n4', to: 'n5', directed: false, weight: 6 },
  ],
};

const PRESETS: Preset[] = [
  {
    id: 'sparse',
    label: 'Sparse network',
    blurb:
      'Seven nodes, weights 5 to 8, so almost no edge is a shortcut. Watch the distance badges: they only ever fall, never rise, because the first improvement Dijkstra finds for a node is already the best one.',
    input: graphInput(SPARSE.nodes, bothWays(SPARSE.edges), { directed: false, weighted: true }),
    params: { start: 0 },
  },
  {
    id: 'dense',
    label: 'Dense network',
    blurb:
      'Ten nodes and 32 directed edge entries, with plenty of near-ties in weight. Some nodes improve two or three times before they are settled, and each improvement is its own frame — that churn is the price of not knowing the graph up front.',
    input: graphInput(DENSE.nodes, bothWays(DENSE.edges), { directed: false, weighted: true }),
    params: { start: 0 },
  },
  {
    id: 'trap',
    label: 'The greedy trap',
    blurb:
      'Two routes from 0 to 3: one hop of cost 20, or two hops of cost 1 each. BFS would take the direct edge. Dijkstra settles 1 first, so 3 arrives at cost 2 and the expensive edge is never even relaxed.',
    input: graphInput(TRAP.nodes, bothWays(TRAP.edges), { directed: false, weighted: true }),
    params: { start: 0 },
  },
  {
    id: 'split',
    label: 'Island, unreachable',
    blurb:
      'Nodes 4 and 5 are joined to the rest of the map by nothing at all. Their badge stays `∞` for the whole run, and the final table reports -1 for them, because the priority queue simply runs out before they are ever discovered.',
    input: graphInput(SPLIT.nodes, bothWays(SPLIT.edges), { directed: false, weighted: true }),
    params: { start: 0 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

/** Read the input into stable coordinates plus a weighted traversal adjacency. */
function read(input: AlgoInput): {
  ids: NodeId[];
  label: (i: number) => string;
  adj: Array<Array<{ to: number; w: number }>>;
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

  const adj: Array<Array<{ to: number; w: number }>> = ids.map(() => []);
  const edges: GraphEdge[] = [];
  const drawn = new Set<string>();
  for (const e of g?.edges ?? []) {
    const u = at.get(e.from);
    const v = at.get(e.to);
    if (u === undefined || v === undefined) continue;
    adj[u]?.push({ to: v, w: e.weight ?? 1 });
    const key = g?.directed === false ? `${Math.min(u, v)}~${Math.max(u, v)}` : `${u}>${v}`;
    if (drawn.has(key)) continue;
    drawn.add(key);
    edges.push({
      from: e.from,
      to: e.to,
      directed: g?.directed ?? true,
      ...(e.weight === undefined ? {} : { weight: e.weight }),
    });
  }
  return { ids, label, adj, edges, nodes };
}

const fmt = (d: number): string => (Number.isFinite(d) ? String(d) : '∞');

export function* dijkstra(ctx: RunContext): Generator<GraphFrame> {
  const { ids, label, adj, edges, nodes } = read(ctx.input);
  const n = ids.length;
  const start =
    n === 0 ? 0 : Math.min(Math.max(0, Math.round(Number(ctx.params.start ?? 0))), n - 1);

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
    // The frontier is printed in *distance* order rather than raw heap order, so
    // the first entry is visibly the node that will be settled next. The first
    // push says so out loud, because it is a deliberate rendering choice and not
    // something the algorithm guarantees.
    frontier: open().map((i) => ids[i] as NodeId),
    visited: order.map((i) => ids[i] as NodeId),
    distance: { ...dist },
    ...(o.caption === undefined ? {} : { caption: o.caption }),
    ...(o.ops === undefined ? {} : { ops: o.ops }),
    ...(o.vars === undefined ? {} : { vars: o.vars }),
    ...(o.highlight === undefined ? {} : { highlight: o.highlight }),
    ...(o.result === undefined ? {} : { result: o.result }),
  });

  const dist: Record<NodeId, number> = {};
  for (const id of ids) dist[id] = Number.POSITIVE_INFINITY;
  const settled = new Set<number>();
  const order: number[] = [];
  /** The priority queue, held as explicit (distance, node) pairs. */
  const heap: Array<{ d: number; v: number }> = [];
  /** Every pop, including the stale ones — the count reported as `ops`. */
  let pops = 0;

  /** Every discovered node that is not settled yet, cheapest first. */
  const open = (): number[] => {
    const seen = new Set<number>();
    const out: number[] = [];
    for (const p of [...heap].sort((a, b) => a.d - b.d || a.v - b.v)) {
      if (settled.has(p.v) || seen.has(p.v)) continue;
      seen.add(p.v);
      out.push(p.v);
    }
    return out;
  };

  dist[ids[start] as NodeId] = 0;

  yield snap(
    'start',
    n === 0
      ? 'The graph has no nodes, so there is no distance to compute. Done.'
      : `Every badge reads ${fmt(Number.POSITIVE_INFINITY)} except ${label(start)}, which is 0 because the distance from a node to itself costs nothing. Dijkstra will only ever lower these numbers — that is the invariant the whole algorithm rests on.`,
    {
      caption: n === 0 ? 'Empty graph' : `From ${label(start)}`,
      highlight: { active: [ids[start] as NodeId], unvisited: ids },
      vars: { start: label(start), settled: 0, open: 0, n },
    },
  );

  if (n === 0) {
    yield snap('done', 'Zero nodes means zero distances. Every entry is unreachably far away.', {
      result: 'empty',
      vars: { n },
    });
    return;
  }

  heap.push({ d: 0, v: start });
  yield snap(
    'seed',
    `Push ${label(start)} with its distance 0. The queue now holds the frontier — every node discovered but not yet settled — and the order it is printed in is cheapest first, not insertion first.`,
    {
      caption: 'Frontier 1 · cheapest 0',
      highlight: {
        active: [ids[start] as NodeId],
        frontier: [ids[start] as NodeId],
        unvisited: ids.slice(1),
      },
      vars: { start: label(start), open: 1, settled: 0 },
    },
  );

  while (heap.length > 0) {
    if (ctx.shouldStop()) return;
    heap.sort((a, b) => a.d - b.d || a.v - b.v);
    const top = heap.shift() as { d: number; v: number };
    pops++;
    const u = top.v;
    const uId = ids[u] as NodeId;

    if (settled.has(u)) {
      yield snap(
        'stale',
        `Pop ${label(u)} again at ${fmt(top.d)}, but its distance is already fixed at ${fmt(dist[uId] as number)} and ${fmt(top.d)} is not an improvement. This entry is a leftover: a later relaxation pushed a *second* copy and the old one is now rubbish. Three of the four languages below have no way to remove it in place, so this frame is the price of that.`,
        {
          caption: `Frontier ${open().length} · stale pop`,
          ops: pops,
          highlight: { frontier: open().map((i) => ids[i] as NodeId) },
          vars: { u: label(u), du: top.d, open: open().length, settled: order.length },
        },
      );
      continue;
    }

    yield snap(
      'extract',
      `The queue is empty at the front, so the cheapest known way to reach ${label(u)} costs ${fmt(top.d)}. Extracting the minimum is the one step that is not just bookkeeping: because every edge weight is non-negative, no path that goes through a node we have not reached yet can come in under ${fmt(top.d)}. That is the entire correctness argument, and it is why a negative edge breaks this algorithm.`,
      {
        caption: `Frontier ${open().length + 1} · cheapest ${fmt(top.d)}`,
        ops: pops,
        highlight: {
          active: [uId],
          frontier: open().map((i) => ids[i] as NodeId),
          unvisited: ids.filter((_, i) => !settled.has(i) && i !== u),
        },
        vars: { u: label(u), du: top.d, open: open().length + 1, settled: order.length },
      },
    );

    settled.add(u);
    order.push(u);
    yield snap(
      'settle',
      `Fix ${label(u)} at ${fmt(top.d)}. From here it is never relaxed again and never re-queued, which is what bounds the algorithm: every node is settled once, so every edge out of it is read exactly once.`,
      {
        caption: `Settled ${order.length} of ${n}`,
        ops: pops,
        highlight: { settled: [uId], frontier: open().map((i) => ids[i] as NodeId) },
        vars: { u: label(u), du: top.d, open: open().length, settled: order.length },
      },
    );

    for (const e of adj[u] ?? []) {
      if (ctx.shouldStop()) return;
      const v = e.to;
      const vId = ids[v] as NodeId;
      const w = e.w;
      const oldDist = dist[vId] as number;
      const newDist = (dist[uId] as number) + w;

      if (settled.has(v)) {
        yield snap(
          'no-improve',
          `${label(v)} is already settled at ${fmt(oldDist)}, and ${fmt(newDist)} ≥ ${fmt(oldDist)} — so even if the code had no settled test of its own, the strict comparison would refuse this update. That is why the listing below needs no second guard: a settled distance is optimal, so nothing can beat it.`,
          {
            caption: `Relaxing ${label(u)}`,
            ops: pops,
            highlight: {
              active: [uId],
              settled: [vId],
              frontier: open().map((i) => ids[i] as NodeId),
            },
            vars: { u: label(u), v: label(v), w, newDist, oldDist },
          },
        );
        continue;
      }

      yield snap(
        'relax',
        `Edge ${label(u)} → ${label(v)} costs ${w}. The cheapest route to ${label(v)} found so far is ${fmt(oldDist)}; routing it through ${label(u)} would cost ${fmt(dist[uId] as number)} + ${w} = ${fmt(newDist)}. ${newDist < oldDist ? 'That is cheaper, so the badge is about to drop.' : 'That is not cheaper, so nothing happens.'}`,
        {
          caption: `Relaxing ${label(u)}`,
          ops: pops,
          highlight: {
            active: [uId],
            compare: [vId],
            frontier: open().map((i) => ids[i] as NodeId),
          },
          vars: { u: label(u), v: label(v), w, newDist, oldDist },
        },
      );

      if (newDist < oldDist) {
        dist[vId] = newDist;
        heap.push({ d: newDist, v });
        yield snap(
          'improve',
          `${label(v)} drops from ${fmt(oldDist)} to ${fmt(newDist)}, and a fresh queue entry carrying the new cost is pushed. The stale entry for ${fmt(oldDist)} is still in the queue — that is what the next stale pop is for. Watch the frontier bar: ${label(v)} has jumped to the position its new cost earns it.`,
          {
            caption: `Settled ${order.length} of ${n}`,
            ops: pops,
            highlight: {
              relaxed: [vId],
              active: [uId],
              frontier: open().map((i) => ids[i] as NodeId),
            },
            vars: {
              u: label(u),
              v: label(v),
              w,
              newDist,
              oldDist,
              open: open().length,
              settled: order.length,
            },
          },
        );
      } else {
        yield snap(
          'no-improve',
          `${fmt(newDist)} is not below ${fmt(oldDist)}, so ${label(v)}'s badge stays where it is and nothing is queued. Most edges of a real graph land in this branch: the algorithm's cost is in *reading* edges, not in changing them.`,
          {
            caption: `Relaxing ${label(u)}`,
            ops: pops,
            highlight: {
              active: [uId],
              compare: [vId],
              frontier: open().map((i) => ids[i] as NodeId),
            },
            vars: { u: label(u), v: label(v), w, newDist, oldDist },
          },
        );
      }
    }
  }

  yield snap(
    'exhausted',
    `The priority queue is empty. That is the termination proof: every node is pushed at most once per improvement, and the last pop took the cheapest thing in the queue, so there is nothing left that could lower a distance. ${order.length} of ${n} nodes settled — the ones still showing ${fmt(Number.POSITIVE_INFINITY)} were never reachable at all.`,
    {
      ops: pops,
      highlight: { settled: order.map((i) => ids[i] as NodeId) },
      vars: { settled: order.length, open: 0, n, ops: pops },
    },
  );

  const missed = ids.map((_, i) => i).filter((i) => !settled.has(i));
  const missedIds = missed.map((i) => ids[i] as NodeId);
  const table = ids.map((_, i) => {
    const d = dist[ids[i] as NodeId] as number;
    return Number.isFinite(d) ? d : -1;
  });

  if (missed.length > 0) {
    yield snap(
      'unreachable',
      `The priority queue emptied while ${missed.length} badge${missed.length === 1 ? ' is' : 's are'} still ${fmt(Number.POSITIVE_INFINITY)}: ${missedIds.map((_, i) => label(missed[i] as number)).join(', ')}. The queue only empties when nothing discovered is left unexpanded, so an infinite badge is a proof of no path at all, not an unvisited corner.`,
      {
        ops: pops,
        highlight: { settled: order.map((i) => ids[i] as NodeId), unvisited: missedIds },
        result: 'partial',
        vars: { settled: order.length, unreachable: missed.length, n },
      },
    );
  }

  yield snap(
    'done',
    `Settled ${order.length} of ${n} nodes in ${pops} pop${pops === 1 ? '' : 's'}${pops > order.length ? `, of which ${pops - order.length} were stale duplicates thrown away` : ''}. The distance table is [${table.join(', ')}], where -1 means "no path exists" — the language-independent way of writing ∞, which no four-language return type agrees on. Reconstruct the actual route with the predecessor recorded on every improvement.`,
    {
      ops: pops,
      highlight: { settled: order.map((i) => ids[i] as NodeId), unvisited: missedIds },
      result: missed.length === 0 ? 'complete' : 'partial',
      vars: { settled: order.length, unreachable: missed.length, n, ops: pops },
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

const JS = `function dijkstra(adj, start) {
  // \`adj\` is the neighbour list built from { nodes, edges }: adj[u] holds every
  // [node, weight] pair one edge away from u, in edge order.
  const n = Object.keys(adj).length;
  const dist = new Array(n).fill(Infinity);
  const done = new Array(n).fill(false);
  dist[start] = 0;                                        // @anchor start

  // JavaScript has no priority queue in the standard library, so here is a
  // minimal binary min-heap over [distance, node] pairs. Everything it does is
  // swap-and-sift; the algorithm underneath is unaffected.
  const heap = [];
  const less = (a, b) => a[0] < b[0];
  const push = (item) => {
    heap.push(item);
    for (let i = heap.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (!less(heap[i], heap[p])) break;
      [heap[i], heap[p]] = [heap[p], heap[i]];
      i = p;
    }
  };
  const pop = () => {                                     // @anchor extract
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      for (let i = 0; ; ) {
        let m = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < heap.length && less(heap[l], heap[m])) m = l;
        if (r < heap.length && less(heap[r], heap[m])) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m], heap[i]];
        i = m;
      }
    }
    return top;
  };

  push([0, start]);                                       // @anchor seed
  while (heap.length > 0) {                              // @anchor exhausted
    const [du, u] = pop();
    if (done[u]) continue;                                // @anchor stale
    done[u] = true;                                       // @anchor settle
    for (const [v, w] of adj[u] ?? []) {
      const nd = du + w;                                  // @anchor relax
      if (nd < dist[v]) {
        dist[v] = nd;                                     // @anchor improve
        push([nd, v]);
      } else {
        // nd >= dist[v]: the edge is not a shortcut.
      }                                                   // @anchor no-improve
    }
  }
  // Infinity is not JSON and null is not comparable across four languages, so
  // every unreachable entry becomes -1 here, once, on the way out.
  const out = dist.map((d) => (d === Infinity ? -1 : d));  // @anchor unreachable
  return out;                                              // @anchor done
}`;

const PY = `import heapq


def dijkstra(adj, start):
    # \`adj\` is the neighbour list built from { nodes, edges }: adj[u] holds every
    # (node, weight) pair one edge away from u, in edge order.
    n = len(adj)
    dist = [float("inf")] * n
    done = [False] * n
    dist[start] = 0                                       # @anchor start

    # Python has no built-in priority queue, so the standard library's heapq is
    # the answer. It is a *min*-heap over (distance, node) tuples, and the tuple
    # comparison breaks weight ties on the node index, which makes the whole run
    # deterministic.
    heap = [(0, start)]                                   # @anchor seed
    while heap:                                           # @anchor exhausted
        du, u = heapq.heappop(heap)                       # @anchor extract
        if done[u]:
            continue                                      # @anchor stale
        done[u] = True                                    # @anchor settle
        for v, w in adj.get(u, []):
            nd = du + w                                   # @anchor relax
            if nd < dist[v]:
                dist[v] = nd                              # @anchor improve
                heapq.heappush(heap, (nd, v))
            else:
                pass  # nd >= dist[v]: the edge is not a shortcut.
                                                        # @anchor no-improve
    # Infinity is not JSON and None is not comparable across four languages, so
    # every unreachable entry becomes -1 here, once, on the way out.
    out = [-1 if d == float("inf") else d for d in dist]  # @anchor unreachable
    return out                                            # @anchor done`;

const JAVA = `import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.PriorityQueue;

class Dijkstra {
    static int[] dijkstra(List<List<int[]>> adj, int start) {
        // adj.get(u) holds every { node, weight } pair one edge away from u.
        int n = adj.size();
        int INF = Integer.MAX_VALUE / 2;
        int[] dist = new int[n];
        Arrays.fill(dist, INF);
        boolean[] done = new boolean[n];
        dist[start] = 0;                                   // @anchor start

        // PriorityQueue is a *min*-heap over Comparator.naturalOrder(). There is
        // no way to change a key in place, so an improvement pushes a duplicate
        // entry and the stale one is recognised when it is popped.
        PriorityQueue<int[]> heap = new PriorityQueue<>((a, b) -> a[0] - b[0]);
        heap.add(new int[] { 0, start });                  // @anchor seed
        while (!heap.isEmpty()) {                          // @anchor exhausted
            int[] top = heap.poll();                       // @anchor extract
            int du = top[0];
            int u = top[1];
            if (done[u]) continue;                         // @anchor stale
            done[u] = true;                                // @anchor settle
            for (int[] e : adj.get(u)) {
                int v = e[0];
                int nd = du + e[1];                        // @anchor relax
                if (nd < dist[v]) {
                    dist[v] = nd;                          // @anchor improve
                    heap.add(new int[] { nd, v });
                } else {
                    // nd >= dist[v]: the edge is not a shortcut.
                }                                          // @anchor no-improve
            }
        }
        // Infinity is not JSON and null is not comparable across four languages,
        // so every unreachable entry becomes -1 here, once, on the way out.
        for (int i = 0; i < n; i++) if (dist[i] == INF) dist[i] = -1;
                                                           // @anchor unreachable
        return dist;                                      // @anchor done
    }
}`;

const CPP = `#include <vector>
#include <queue>
#include <limits>
#include <utility>
#include <functional>
using std::vector;
using std::pair;
using std::priority_queue;
using std::greater;

vector<int> dijkstra(vector<vector<pair<int, int>>> adj, int start) {
    // adj[u] holds every { node, weight } pair one edge away from u. adj is
    // taken by value, so this is a copy and the caller's graph is untouched.
    int n = (int)adj.size();
    const int INF = std::numeric_limits<int>::max() / 2;
    vector<int> dist(n, INF);
    vector<bool> done(n, false);
    dist[start] = 0;                                       // @anchor start

    // priority_queue is a *max*-heap by default, so the template arguments are
    // what turn it into the min-heap this algorithm needs. The pair's second
    // element breaks weight ties, which keeps the run deterministic.
    using Entry = pair<int, int>;
    priority_queue<Entry, vector<Entry>, greater<Entry>> heap;
    heap.push({ 0, start });                               // @anchor seed
    while (!heap.empty()) {                                // @anchor exhausted
        Entry top = heap.top();
        heap.pop();
        int du = top.first;
        int u = top.second;                                // @anchor extract
        if (done[u]) continue;                             // @anchor stale
        done[u] = true;                                    // @anchor settle
        for (const auto& e : adj[u]) {
            int v = e.first;
            int nd = du + e.second;                        // @anchor relax
            if (nd < dist[v]) {
                dist[v] = nd;                              // @anchor improve
                heap.push({ nd, v });
            } else {
                // nd >= dist[v]: the edge is not a shortcut.
            }                                              // @anchor no-improve
        }
    }
    // Infinity is not JSON and null is not comparable across four languages, so
    // every unreachable entry becomes -1 here, once, on the way out.
    for (int i = 0; i < n; i++) if (dist[i] == INF) dist[i] = -1;
                                                           // @anchor unreachable
    return dist;                                            // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      '`Infinity` is a real number here, not a sentinel, so `dist[start] + w` on an unreached node would stay `Infinity` and the comparison would quietly do the right thing. That is the one thing Java and C++ cannot copy: `Integer.MAX_VALUE` and `INT_MAX` would *overflow* on the first addition, which is why the two listings below halve the maximum first.',
    python:
      '`float("inf")` compares correctly against every integer, including huge ones, and `inf + w` is still `inf`, so there is no overflow to guard against. `math.inf` is the same value with less typing; `None` would be a bug, because it cannot be compared with `<`.',
    java: '`Integer.MAX_VALUE / 2`, not `Integer.MAX_VALUE`. A sentinel has to leave room for the additions the algorithm performs, and `MAX_VALUE + w` wraps to a negative number that looks like a spectacular improvement. Halving it is the usual, cheap, and sufficient guard.',
    cpp: '`std::numeric_limits<int>::max() / 2` for exactly the Java reason: `INT_MAX + w` is signed overflow and is undefined behaviour, and an optimising compiler is entitled to do anything at all with it. `<limits>` is the header, and halving is the standard trick.',
  },
  seed: {
    javascript:
      'The heap is a hand-rolled binary min-heap because JavaScript has no priority queue in the standard library — not even a third-party one in the default install. The sift-up loop is four lines and the algorithm never has to know it happened. `push` and `pop` are named to match what they do in the other three languages.',
    python:
      "`heapq` is the standard library's answer, and it is a *heap*, not a queue: `heappush`/`heappop` give O(log n) on the cheapest element. It was a separate module until Python 3.3, so old code still has `from heapq import *` at the top. The `(distance, node)` tuple is what makes ties deterministic.",
    java: '`PriorityQueue` with a comparator on the first element only. It is a binary min-heap with the same amortised O(log n) push and pop, and it *looks* like it should support updating a key — it does not, so every improvement pushes a duplicate and the old entry is caught by the `done` check two anchors down.',
    cpp: '`priority_queue<Entry, vector<Entry>, greater<Entry>>` — the default is a **max**-heap, so without `greater<Entry>` this line would return the most expensive node first and the algorithm would quietly return wrong distances. `greater` comes from `<functional>`, and `Entry` is `pair<int,int>` so `first` is the distance and `second` the node.',
  },
  exhausted: {
    javascript:
      'The loop runs until the heap is empty rather than until the node count matches, because a node can be in the heap more than once. Emptying the heap is the termination proof: no discovered node is left unexpanded, so nothing can be improved any further.',
    python:
      '`while heap:` — a list of tuples is truthy while non-empty, so no `len()` call and no sentinel. `heappop` is O(log n) because the heap is kept compact; a sorted list with `list.pop(0)` would be O(n) per pop and quietly turn the algorithm quadratic.',
    java: '`!heap.isEmpty()` rather than a counter, because the heap size is *not* the number of nodes left: duplicates inflate it and settled entries never leave it until popped. A `for (int i = 0; i < n; i++)` loop would be wrong for the same reason, even though it looks like the textbook formulation.',
    cpp: '`!heap.empty()` and `top()` before `pop()`, because `priority_queue::pop` returns nothing. Looping `n` times instead would be a real bug here for the same reason as in Java: the heap can hold more than `n` entries and fewer than `n` pops are needed to empty it.',
  },
  extract: {
    javascript:
      'The sift-down loop restores the heap property by promoting the smaller child and sinking the displaced element, in `O(log n)`. Popping the minimum is the only step that is not bookkeeping — it is the greedy choice, and it is only sound because no edge weight is negative.',
    python:
      '`heappop` is C-implemented and swaps the root to the end, re-heapifies, then returns the old root: O(log n) with no Python in the loop. The `[du, u]` destructuring in JavaScript and the tuple unpack here are the same one line of work; in C++ you have to reach into `.first` and `.second` yourself.',
    java: '`poll()` returns the head and removes it. The array `[distance, node]` is used because Java has no tuple type before records (Java 16) — a record would be nicer, and a `PriorityQueue<Node>` with `Comparable` is the textbook alternative at the cost of boxing.',
    cpp: '`top()` gives a *reference* into the heap, so copying into `Entry top` matters twice over: the `pop()` on the next line would otherwise leave a dangling reference, and `pair` has no default constructor to move-assign into safely.',
  },
  stale: {
    javascript:
      'A leftover copy of a node whose distance was already improved. JavaScript has no way to fix a key inside the heap either, so this guard is needed here too — the `continue` is the whole line. Deleting by value would be `O(n)` and defeat the point of the heap.',
    python:
      "`heapq` has no `decrease-key` — not because it is Python's fault but because it is a general-purpose library — so a stale entry is unavoidable. `if done[u]: continue` is the standard guard, and `continue` is the Python spelling of the JavaScript `continue`, while C++ needs the loop body wrapped in braces.",
    java: 'This frame is the visible cost of `PriorityQueue` having no key update. The JDK offers no `decreaseKey`; the alternatives are an indexed heap you write yourself, or a lazy `TreeSet` that supports removal — both more code than the duplicates are worth at this scale.',
    cpp: 'Same story, and `std::set` is the one standard container that *does* support erasing a stale entry in O(log n) — at the price of a sorted structure, so `pop` becomes `*begin()` plus `erase(begin())`. Most textbook C++ Dijkstra uses the duplicate-skipping version above.',
  },
  settle: {
    javascript:
      '`done[u] = true` is the moment the distance becomes final, and it is the only irreversible step in the algorithm. Everything after this is relaxation *out of* a settled node; nothing will ever relax *into* it, which is exactly the invariant the greedy argument needs.',
    python:
      'A plain `bool` per node. Python lists of booleans are objects, so `done` is a list of `True`/`False` singletons — 8 bytes per entry of pointer, which for a million nodes is 8 MB you would rather not spend, but nothing anyone writes a graph algorithm actually reaches.',
    java: '`boolean[] done` rather than `Boolean[]`, so there is no boxing and the array is contiguous. Note the driver handed us a fresh `List` per case, so mutating anything we derive from it cannot be observed by the caller — a real caller sharing the list would be a different conversation.',
    cpp: '`vector<bool>` again, bit-packed. Marking a node settled is the *only* write to it that is never undone, and it is why the algorithm is "greedy set finalisation": the set of settled nodes grows monotonically and the whole run is a sequence of extensions of it.',
  },
  relax: {
    javascript:
      '`const nd = du + w` uses the *popped* distance rather than `dist[u]`, and for a settled node the two are equal — but writing `du` makes it obvious that this is the cost of the path we are extending. The comparison is strict, so an equal-cost alternative path is ignored and the predecessor stays put.',
    python:
      'One line, four languages, no surprises: integer plus integer. The strict `<` matters for the *ties*: an equal-cost route to the same node would otherwise overwrite the predecessor and produce a longer, still-valid, but different path.',
    java: '`du + e[1]` — the weight is the second slot of the `int[]` the driver builds for every edge. Note the int arithmetic cannot overflow because `dist` values are all well under `INF`, which is why the sentinel had to be halved in the first place.',
    cpp: '`e.first` is the node and `e.second` is the weight, so a `pair<int,int>` edge is read in the opposite order from the `pair<int,int>` entry in the heap. Naming both `Entry` in one function is how bugs like this happen; here the different variable names are the defence.',
  },
  improve: {
    javascript:
      'Two writes and a push: lower the recorded distance, then queue the new cost. The old queue entry is *not* removed — that is the deliberate trade, and the `stale` frame is what pays for it. In exchange, both operations are O(log n) and the code stays four lines.',
    python:
      '`dist[v] = nd` then `heappush`. Python has no tuple-swap that helps here, but note the ordering: lower the recorded distance *before* pushing, so that a `heappop` racing in another thread would still see a consistent table. Single-threaded, it does not matter — but the habit is free.',
    java: 'This is where the `PriorityQueue` limitation bites hardest: `dist[v] = nd` changes the *record* while the queue keeps a *copy* of the old cost, and the JDK offers no way to fix the queued value. Pushing the duplicate and skipping it later is the standard, and is why real-world Java Dijkstra often switches to `TreeSet<Integer>` with explicit removal.',
    cpp: '`std::priority_queue` has no `decreaseKey` either. The two escape hatches are a `std::set<Entry>` keyed on the pair — which supports `erase` in O(log n) at the cost of ordering — or a lazy queue with this exact guard. The lazy version wins on clarity and loses only on the number of pops.',
  },
  'no-improve': {
    javascript:
      "`nd >= dist[v]`, so the badge does not move and nothing is queued. Worth noticing how often this is the common case once the algorithm is running: most edges are not shortcuts, and the algorithm's cost is in *reading* them, not in changing them.",
    python:
      'An `else:` with `pass` and a comment. Python needs the branch to exist to carry the `# @anchor` marker, which is the same reason the JavaScript listing keeps an empty `else` block — the anchor has to live on the line the student is meant to be reading.',
    java: 'An empty block holding only a comment, purely so the anchor marker has a line to live on. This is a real cost of anchor-first code: the listing is not quite what you would write without the tooling, and the comment is what makes the two things line up.',
    cpp: 'Also an empty `else` with a comment. The strict `<` above is what puts the negative case here: had it been `<=`, equal-cost paths would be treated as improvements and the predecessor would be rewritten for nothing.',
  },
  unreachable: {
    javascript:
      'One sweep turns "never reached" into something a caller can act on. `Infinity` is a perfectly good sentinel internally — it compares correctly and never wins a relaxation — but it leaks into the answer as a value the caller must remember to special-case, and `Infinity` survives serialisation as `null` in JSON. Converting once, on the way out, keeps the sentinel internal where it belongs. Note `-1` is safe here only because every edge weight is non-negative, so a real distance can never be negative.',
    python:
      'One sweep turns "never reached" into something a caller can act on. `float("inf")` is a perfectly good sentinel internally — it compares correctly and never wins a relaxation, and `math.inf` is exactly that value — but it leaks into the answer as a value the caller must remember to special-case. Converting once, on the way out, keeps the sentinel internal where it belongs. Note `-1` is safe here only because every edge weight is non-negative, so a real distance can never be negative.',
    java: 'One sweep turns "never reached" into something a caller can act on. Dijkstra needs a real infinity for the initial distances, and `Double.POSITIVE_INFINITY` is it — it compares greater than every finite double and survives arithmetic. But it is a `double`, so a `float("inf")`-style literal is a compile error in Java and the conversion has to be explicit. Converting once, on the way out, keeps the sentinel internal where it belongs. Note `-1` is safe here only because every edge weight is non-negative, so a real distance can never be negative.',
    cpp: 'One sweep turns "never reached" into something a caller can act on. `std::numeric_limits<int>::max()` is the usual sentinel in an integer-typed Dijkstra — there is no infinity in `int`, which is exactly why so many textbook implementations are written with `int` and why this line has to exist at all. A `double`-typed version can use `std::numeric_limits<double>::infinity()` and skip the conversion. Converting once, on the way out, keeps the sentinel internal where it belongs, and `-1` is safe only because every edge weight is non-negative, so a real distance can never be negative.',
  },
  done: {
    javascript:
      'The return shape is an array of ints with -1 for "no path", because `Infinity` is not JSON and `null` is not comparable across four languages. `Array.map` here is a display concern only; the algorithm never inspects its own output.',
    python:
      'A list comprehension turning `inf` into -1. Python could return the `inf` values and the harness would compare them numerically, but then Java and C++ would have to fabricate a float infinity too — one convention that all four can produce beats a per-language convenience.',
    java: '`int[]` with -1 for unreachable, and the `Arrays.fill` for `INF` at the top is the reason the sentinel is not returned by accident. Java has `Double.POSITIVE_INFINITY` if you would rather return doubles, but then the driver writes them as numbers and the "no path" case stops being obvious to a reader.',
    cpp: '`INT_MAX / 2` is an implementation detail of the sentinel and must never escape: the final loop converts it to -1 so the returned vector is pure data. `std::numeric_limits` comes from `<limits>`, and `greater` from `<functional>` — both are the sort of header you forget and then spend twenty minutes on a compile error.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'dijkstra',
    python: 'dijkstra',
    java: 'Dijkstra.dijkstra',
    cpp: 'dijkstra',
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
 * The claim is the distance table: one integer per node in order, with -1 for
 * "no path exists". No four languages agree on how to write infinity, and this
 * shape sidesteps the question entirely.
 */
const EXPECTED: Record<string, number[]> = {
  sparse: [0, 5, 11, 16, 5, 21, 19],
  dense: [0, 9, 7, 6, 9, 11, 10, 9, 13, 10],
  trap: [0, 1, 2, 2, 3],
  split: [0, 4, 7, 9, -1, -1],
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
    args: [{ nodes: ids.map((_, i) => i), edges }, Number(p.params?.start ?? 0)],
    result: EXPECTED[p.id] ?? [],
  };
});

export const dijkstraAlgo: AlgoDef<GraphFrame> = {
  id: 'dijkstra',
  title: "Dijkstra's Shortest Path",
  category: 'graphs',
  summary:
    "Repeatedly expand the discovered node with the smallest tentative distance, lowering each neighbour's best-known cost as you go, until every reachable distance is final.",
  intuition:
    'Reach for Dijkstra when the edges have costs and you want the cheapest route between two points: road networks, latency graphs, "least hops in a weighted pipeline", the cost of a build graph, the cheapest way to sequence jobs with dependencies. The precondition is non-negative weights — a single negative edge breaks it, and the failure is silent, returning a wrong answer rather than an error, so a graph with a rebate or a credit on it must go to Bellman-Ford instead. For *all* pairs rather than one source, run it once per node, or replace it with Floyd-Warshall when the graph is small and dense.',
  complexity: {
    best: 'O((V + E) log V)',
    average: 'O((V + E) log V)',
    worst: 'O((V + E) log V)',
    space: 'O(V + E)',
    note: 'With a lazy binary heap the queue can hold O(E) entries rather than O(V), so a graph with many parallel edges is really O(E log E) — use a decrease-key heap when that matters. There is no worse case: unlike BFS and DFS, the bound holds for every input.',
  },
  traits: {
    offline: true,
    tags: ['priority-queue', 'shortest-path', 'weighted', 'non-negative-weights', 'single-source'],
  },
  viewport: 'graph',
  level: 'intermediate',
  params: [
    {
      key: 'start',
      label: 'Source node',
      kind: 'number',
      min: 0,
      max: 99,
      step: 1,
      default: 0,
      help: 'Single-source: the node every distance is measured from. Change it and the whole table changes.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: dijkstra,
  lesson,
  expectations,
  formatResult: (r) => `[${(r as number[]).join(', ')}]`,
  anchors: [
    'start',
    'seed',
    'exhausted',
    'extract',
    'stale',
    'settle',
    'relax',
    'improve',
    'no-improve',
    'unreachable',
    'done',
  ],
};

export default dijkstraAlgo;
