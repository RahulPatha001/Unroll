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
 * Bellman-Ford, and the negative-cycle check.
 *
 * Bellman-Ford is Dijkstra with the priority queue thrown away. Instead of
 * expanding the cheapest node it sweeps the *whole* edge list, V-1 times, and
 * lets the arithmetic sort the propagation out. That sounds dramatically worse
 * — O(V·E) against O((V+E) log V) — and it is. What it buys is the one thing
 * Dijkstra cannot have: **negative edge weights are allowed**, because a
 * shortest path never needs to repeat an edge, so a path with a negative edge is
 * still finite.
 *
 * The free extra is negative-cycle detection. If a pass with no positive
 * in-degree (the V-th pass) still finds an improvement, some node is reachable
 * by a route that gets cheaper every time round, and no shortest path exists.
 * That is a genuinely valuable answer, and it is the reason a shipping router
 * runs Bellman-Ford and not Dijkstra.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 11;

/** Flat edge arrays need an undirected weight listed in both directions. */
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
 * A rebate, drawn as a directed graph.
 *
 * **Directed on purpose.** An undirected edge of weight -8 traversed twice sums
 * to -16, which is a negative cycle by definition — so "an undirected graph with
 * a negative edge" is not a Bellman-Ford input at all, it is an
 * already-negative-cycle input. Learners find this out the hard way, so the
 * preset makes it explicit in its blurb.
 */
const REBATE: { nodes: AlgoGraphNode[]; edges: AlgoGraphEdge[] } = {
  nodes: circleNodes(6),
  edges: [
    { from: 'n0', to: 'n1', directed: true, weight: 4 },
    { from: 'n0', to: 'n2', directed: true, weight: 5 },
    { from: 'n1', to: 'n2', directed: true, weight: -8 },
    { from: 'n2', to: 'n3', directed: true, weight: 3 },
    { from: 'n1', to: 'n3', directed: true, weight: 9 },
    { from: 'n3', to: 'n4', directed: true, weight: 2 },
    { from: 'n4', to: 'n5', directed: true, weight: 6 },
    { from: 'n0', to: 'n5', directed: true, weight: 20 },
  ],
};

/**
 * A loss-making loop, and the reason the extra pass exists.
 *
 * 1 → 2 → 3 → 1 costs -2 -1 + 1 = -2, so going round it once makes every node
 * on it 2 cheaper, and going round twice makes them 4 cheaper. No shortest path
 * to 1, 2 or 3 exists; only node 4, which hangs off the loop by a single
 * positive edge, has a final answer at all.
 */
const LOSS_LOOP: { nodes: AlgoGraphNode[]; edges: AlgoGraphEdge[] } = {
  nodes: circleNodes(5),
  edges: [
    { from: 'n0', to: 'n1', directed: true, weight: 3 },
    { from: 'n1', to: 'n2', directed: true, weight: -2 },
    { from: 'n2', to: 'n3', directed: true, weight: -1 },
    { from: 'n3', to: 'n1', directed: true, weight: 1 },
    { from: 'n2', to: 'n4', directed: true, weight: 2 },
    { from: 'n0', to: 'n4', directed: true, weight: 5 },
  ],
};

const PRESETS: Preset[] = [
  {
    id: 'sparse',
    label: 'Sparse, all positive',
    blurb:
      'Seven nodes, every weight between 5 and 8. Pass 1 propagates the whole graph at once, pass 2 finds nothing, and the early exit fires — which is the honest admission that Bellman-Ford without negative edges is Dijkstra with the cleverness removed.',
    input: graphInput(SPARSE.nodes, bothWays(SPARSE.edges), { directed: false, weighted: true }),
    params: { start: 0 },
  },
  {
    id: 'dense',
    label: 'Dense, ten nodes',
    blurb:
      'Ten nodes and 32 directed edge entries over a longer chain, so the sweep has to work further before it reaches a fixed point. The `pass` readout counts down to V-1, and the whole point of that bound is proven by the next anchor.',
    input: graphInput(DENSE.nodes, bothWays(DENSE.edges), { directed: false, weighted: true }),
    params: { start: 0 },
  },
  {
    id: 'rebate',
    label: 'A rebate (−8)',
    blurb:
      'One negative edge, and it rewrites the answer: 2 is reachable for -4 via the rebate rather than +5 direct. Note the graph is directed — an *undirected* −8 edge traversed both ways sums to −16 and is a negative cycle the moment you write it down.',
    input: graphInput(REBATE.nodes, REBATE.edges, { directed: true, weighted: true }),
    params: { start: 0 },
  },
  {
    id: 'loss-loop',
    label: 'Loss-making loop',
    blurb:
      '1 → 2 → 3 → 1 sums to −2, so no pass ever comes out quiet. The badges for 1, 2 and 3 fall on every single pass, forever: that is the signature of a negative cycle, and it is why the V-th pass exists at all.',
    input: graphInput(LOSS_LOOP.nodes, LOSS_LOOP.edges, { directed: true, weighted: true }),
    params: { start: 0 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

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

export function* bellmanFord(ctx: RunContext): Generator<GraphFrame> {
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
    // The "frontier" here is the set of nodes whose distance moved this pass,
    // which is the only queue-shaped thing this algorithm has.
    frontier: moved.map((i) => ids[i] as NodeId),
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
  const order: number[] = [];
  let moved: number[] = [];
  let ops = 0;
  let pass = 0;
  let changed = false;
  let cycleEdge: { u: number; v: number } | null = null;

  /** Reachable nodes whose distance is still `∞` — the unreachable remainder. */
  const untouched = (): NodeId[] =>
    ids.filter((_, i) => !Number.isFinite(dist[ids[i] as NodeId] as number));

  dist[ids[start] as NodeId] = 0;
  order.push(start);

  yield snap(
    'init',
    n === 0
      ? 'The graph has no nodes, so there is nothing to relax. Done.'
      : `Set ${label(start)} to 0 and everything else to ${fmt(Number.POSITIVE_INFINITY)}. Bellman-Ford keeps no priority queue at all — it sweeps the entire edge list up to ${Math.max(0, n - 1)} time${n - 1 === 1 ? '' : 's'} and lets the arithmetic do the ordering. It stops early the moment a whole sweep changes nothing, so a run that uses all ${Math.max(0, n - 1)} is the one worth watching.`,
    {
      caption: n === 0 ? 'Empty graph' : `From ${label(start)} · ${Math.max(0, n - 1)} passes`,
      highlight: { active: [ids[start] as NodeId], unvisited: ids.slice(1) },
      vars: { start: label(start), pass: 0, passes: Math.max(0, n - 1), dist: 0, n },
    },
  );

  if (n === 0) {
    yield snap('done', 'Zero nodes, zero distances. The table is empty.', {
      result: 'empty',
      vars: { n },
    });
    return;
  }

  for (pass = 1; pass <= Math.max(0, n - 1); pass++) {
    if (ctx.shouldStop()) return;
    changed = false;
    moved = [];

    yield snap(
      'pass',
      `Pass ${pass} of ${n - 1}. Every distance is swept from scratch in node order — no queue, no heap, no "cheapest first". A shortest path uses at most ${n - 1} edges because it never repeats one, so after ${n - 1} whole sweeps every such path has been accounted for.`,
      {
        caption: `Pass ${pass} of ${n - 1}`,
        ops,
        highlight: {
          active: [ids[start] as NodeId],
          unvisited: ids.slice(1),
        },
        vars: { pass, passes: n - 1, changed, dist: order.length },
      },
    );

    for (let u = 0; u < n; u++) {
      for (const e of adj[u] ?? []) {
        if (ctx.shouldStop()) return;
        const v = e.to;
        const uId = ids[u] as NodeId;
        const vId = ids[v] as NodeId;
        const w = e.w;
        const du = dist[uId] as number;
        if (!Number.isFinite(du)) continue;
        ops++;
        const newDist = du + w;
        const oldDist = dist[vId] as number;

        yield snap(
          'edge',
          `Look at edge ${label(u)} → ${label(v)}, cost ${w}. ${label(u)} stands at ${fmt(du)}; adding this edge would put ${label(v)} at ${fmt(newDist)}, against a current best of ${fmt(oldDist)}.`,
          {
            caption: `Pass ${pass} of ${n - 1}`,
            ops,
            highlight: { active: [uId], compare: [vId] },
            vars: { pass, u: label(u), v: label(v), w, du, dist: oldDist },
          },
        );

        if (newDist < oldDist) {
          dist[vId] = newDist;
          changed = true;
          if (!moved.includes(v)) moved.push(v);
          if (!order.includes(v)) order.push(v);
          yield snap(
            'relax',
            `${fmt(newDist)} beats ${fmt(oldDist)}, so ${label(v)}'s badge drops. In-place, which means the *next* edge in this same pass already sees the new value — that is why the algorithm finishes in fewer than V-1 passes so often, and also why a negative cycle can keep it busy forever.`,
            {
              caption: `Pass ${pass} of ${n - 1}`,
              ops,
              highlight: {
                active: [uId],
                relaxed: [vId],
                frontier: moved.map((i) => ids[i] as NodeId),
              },
              vars: { pass, u: label(u), v: label(v), w, newDist, du, dist: newDist },
            },
          );
        } else {
          yield snap(
            'no-improve',
            `${fmt(newDist)} is not below ${fmt(oldDist)}, so ${label(v)} keeps what it has. Most edges of most graphs land here; the cost of Bellman-Ford is that it re-reads all of them on every pass instead of only the useful ones.`,
            {
              caption: `Pass ${pass} of ${n - 1}`,
              ops,
              highlight: { active: [uId], compare: [vId] },
              vars: { pass, u: label(u), v: label(v), w, newDist, du, dist: oldDist },
            },
          );
        }
      }
    }

    if (!changed) {
      yield snap(
        'early-exit',
        `Pass ${pass} changed nothing. If no edge in the whole graph can be improved, then no *longer* path can be either — appending edges only adds non-negative amounts, or in a graph with no negative cycle, a fixed amount — so the table is already final and the remaining passes would be wasted. This is also a proof that no negative cycle is reachable from ${label(start)}.`,
        {
          caption: `Fixed point after ${pass} pass${pass === 1 ? '' : 'es'}`,
          ops,
          highlight: { settled: order.map((i) => ids[i] as NodeId) },
          result: 'converged',
          vars: { pass, passes: n - 1, changed, dist: order.length },
        },
      );
      break;
    }

    yield snap(
      'changed',
      `Pass ${pass} moved ${moved.length} badge${moved.length === 1 ? '' : 's'}: ${moved.map((_, i) => label(moved[i] as number)).join(', ')}. Something is still propagating, so another sweep is needed. In a graph with no negative cycle this happens at most V-1 times; a pass count past that is the alarm bell.`,
      {
        caption: `Pass ${pass} of ${n - 1} done`,
        ops,
        highlight: { frontier: moved.map((i) => ids[i] as NodeId), unvisited: untouched() },
        vars: { pass, passes: n - 1, changed, dist: order.length, moved: moved.length },
      },
    );
  }

  // The V-th pass. Reaching here means no pass came out quiet, which is exactly
  // the condition a reachable negative cycle creates — and it means the early
  // exit above is sound: a fixed point is incompatible with one.
  if (changed) {
    yield snap(
      'verify',
      `All ${n - 1} passes ran and the last one still moved a badge, so run one more anyway and watch for an improvement. A shortest path never repeats an edge, so if one more relaxation still helps then some path with a cycle in it is getting cheaper every time — there is no shortest path to report.`,
      {
        caption: `Verification pass ${n} of ${n}`,
        ops,
        highlight: { unvisited: untouched() },
        vars: { pass: n, passes: n, changed, dist: order.length },
      },
    );

    for (let u = 0; u < n; u++) {
      for (const e of adj[u] ?? []) {
        if (ctx.shouldStop()) return;
        const v = e.to;
        const uId = ids[u] as NodeId;
        const vId = ids[v] as NodeId;
        const du = dist[uId] as number;
        if (!Number.isFinite(du)) continue;
        ops++;
        if (du + e.w < (dist[vId] as number)) {
          cycleEdge = { u, v };
          yield snap(
            'cycle',
            `Edge ${label(u)} → ${label(v)} still relaxes, even though ${n - 1} passes have already happened. Going round the cycle that contains this edge makes the total cost drop, so the distance to ${label(v)} can be made arbitrarily small: ${label(v)} has no shortest path from ${label(start)}, and neither does anything reachable from it.`,
            {
              caption: `Negative cycle found`,
              ops,
              highlight: { active: [uId], compare: [vId] },
              result: 'negative-cycle',
              vars: { pass: n, u: label(u), v: label(v), w: e.w, dist: dist[vId] as number },
            },
          );
          break;
        }
      }
      if (cycleEdge) break;
    }
  }

  const table = ids.map((_, i) => {
    const d = dist[ids[i] as NodeId] as number;
    return Number.isFinite(d) ? d : -1;
  });

  yield snap(
    'done',
    cycleEdge
      ? `Negative cycle reachable from ${label(start)}, so there is no distance table to return. The result is the literal string NEGATIVE-CYCLE: a string, because no four languages agree on how to spell an array of infinities, and one sentinel all of them can produce beats a per-language convenience.`
      : `Converged after ${pass} pass${pass === 1 ? '' : 'es'} and ${ops} edge examination${ops === 1 ? '' : 's'}. Distances: ${table.join(', ')}, where -1 means no path exists. This run needed no negative edge and it still cost ${ops} edge reads; that ratio, O(V·E) against Dijkstra's O((V+E) log V), is the standing price of being the version that tolerates a weight below zero.`,
    {
      ops,
      highlight: {
        settled: cycleEdge ? [] : order.map((i) => ids[i] as NodeId),
        unvisited: cycleEdge ? ids : untouched(),
      },
      result: cycleEdge ? 'negative-cycle' : 'converged',
      vars: { pass, passes: n - 1, dist: order.length, n, ops },
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

const JS = `function bellmanFord(adj, start) {
  // \`adj\` is the neighbour list built from { nodes, edges }: adj[u] holds every
  // [node, weight] pair one edge away from u, in edge order.
  const n = Object.keys(adj).length;
  const INF = Number.MAX_SAFE_INTEGER;
  const dist = new Array(n).fill(INF);
  dist[start] = 0;                                        // @anchor init
  let changed = true;
  // V - 1 sweeps. A shortest path never repeats a node, so it uses at most
  // V - 1 edges, and one full sweep is enough to account for one more edge.
  for (let pass = 1; pass <= n - 1; pass++) {             // @anchor pass
    changed = false;
    for (let u = 0; u < n; u++) {
      for (const [v, w] of adj[u] ?? []) {
        if (dist[u] === INF) continue;
        const nd = dist[u] + w;                          // @anchor edge
        if (nd < dist[v]) {
          dist[v] = nd;                                  // @anchor relax
          changed = true;                                // @anchor changed
        } else {                                          // @anchor no-improve
          // nd >= dist[v]: this edge is not a cheaper route.
        }
      }
    }
    if (!changed) break;                                  // @anchor early-exit
  }
  // One extra sweep. If anything still relaxes here, a cycle is getting cheaper
  // every time round and no shortest path exists.
  for (let u = 0; u < n; u++) {                           // @anchor verify
    for (const [v, w] of adj[u] ?? []) {
      if (dist[u] !== INF && dist[u] + w < dist[v]) {
        return "NEGATIVE-CYCLE";                          // @anchor cycle
      }
    }
  }
  return dist.map((d) => (d === INF ? -1 : d)).join(',');  // @anchor done
}`;

const PY = `import math


def bellman_ford(adj, start):
    # \`adj\` is the neighbour list built from { nodes, edges }: adj[u] holds every
    # (node, weight) pair one edge away from u, in edge order.
    n = len(adj)
    INF = float("inf")
    dist = [INF] * n
    dist[start] = 0                                       # @anchor init
    changed = True
    # V - 1 sweeps. A shortest path never repeats a node, so it uses at most
    # V - 1 edges, and one full sweep is enough to account for one more edge.
    for _pass in range(1, n):                             # @anchor pass
        changed = False
        for u in range(n):
            for v, w in adj.get(u, []):
                if dist[u] == INF:
                    continue
                nd = dist[u] + w                          # @anchor edge
                if nd < dist[v]:
                    dist[v] = nd                         # @anchor relax
                    changed = True                        # @anchor changed
                else:                                     # @anchor no-improve
                    pass  # nd >= dist[v]: not a cheaper route.
        if not changed:                                   # @anchor early-exit
            break
    # One extra sweep. If anything still relaxes here, a cycle is getting cheaper
    # every time round and no shortest path exists.
    for u in range(n):                                    # @anchor verify
        for v, w in adj.get(u, []):
            if dist[u] != INF and dist[u] + w < dist[v]:
                return "NEGATIVE-CYCLE"                   # @anchor cycle
    return ",".join("-1" if d == INF else str(d) for d in dist)  # @anchor done`;

const JAVA = `import java.util.List;

class BellmanFord {
    static String bellmanFord(List<List<int[]>> adj, int start) {
        // adj.get(u) holds every { node, weight } pair one edge away from u.
        int n = adj.size();
        int INF = Integer.MAX_VALUE / 2;
        int[] dist = new int[n];
        java.util.Arrays.fill(dist, INF);
        dist[start] = 0;                                   // @anchor init
        boolean changed = true;
        // V - 1 sweeps. A shortest path never repeats a node, so it uses at most
        // V - 1 edges, and one full sweep accounts for one more edge.
        for (int pass = 1; pass <= n - 1; pass++) {         // @anchor pass
            changed = false;
            for (int u = 0; u < n; u++) {
                for (int[] e : adj.get(u)) {
                    if (dist[u] == INF) continue;
                    int nd = dist[u] + e[1];                // @anchor edge
                    if (nd < dist[e[0]]) {
                        dist[e[0]] = nd;                    // @anchor relax
                        changed = true;                     // @anchor changed
                    } else {                                // @anchor no-improve
                        // nd >= dist[v]: not a cheaper route.
                    }
                }
            }
            if (!changed) break;                            // @anchor early-exit
        }
        // One extra sweep. If anything still relaxes here, a cycle is getting
        // cheaper every time round and no shortest path exists.
        for (int u = 0; u < n; u++) {                        // @anchor verify
            for (int[] e : adj.get(u)) {
                if (dist[u] != INF && dist[u] + e[1] < dist[e[0]]) {
                    return "NEGATIVE-CYCLE";                 // @anchor cycle
                }
            }
        }
        StringBuilder out = new StringBuilder();             // @anchor done
        for (int i = 0; i < n; i++) {
            if (i > 0) out.append(",");
            out.append(dist[i] == INF ? -1 : dist[i]);
        }
        return out.toString();
    }
}`;

const CPP = `#include <vector>
#include <string>
#include <limits>
#include <utility>
using std::vector;

std::string bellman_ford(vector<vector<std::pair<int, int>>> adj, int start) {
    // adj[u] holds every { node, weight } pair one edge away from u. adj is taken
    // by value, so this is a copy and the caller's graph is never modified.
    int n = (int)adj.size();
    const int INF = std::numeric_limits<int>::max() / 2;
    vector<int> dist(n, INF);
    dist[start] = 0;                                        // @anchor init
    bool changed = true;
    // V - 1 sweeps. A shortest path never repeats a node, so it uses at most
    // V - 1 edges, and one full sweep accounts for one more edge.
    for (int pass = 1; pass <= n - 1; pass++) {              // @anchor pass
        changed = false;
        for (int u = 0; u < n; u++) {
            for (const auto& e : adj[u]) {
                if (dist[u] == INF) continue;
                int nd = dist[u] + e.second;                // @anchor edge
                if (nd < dist[e.first]) {
                    dist[e.first] = nd;                     // @anchor relax
                    changed = true;                         // @anchor changed
                } else {                                     // @anchor no-improve
                    // nd >= dist[v]: not a cheaper route.
                }
            }
        }
        if (!changed) break;                                // @anchor early-exit
    }
    // One extra sweep. If anything still relaxes here, a cycle is getting
    // cheaper every time round and no shortest path exists.
    for (int u = 0; u < n; u++) {                            // @anchor verify
        for (const auto& e : adj[u]) {
            if (dist[u] != INF && dist[u] + e.second < dist[e.first]) {
                return "NEGATIVE-CYCLE";                     // @anchor cycle
            }
        }
    }
    std::string out;                                        // @anchor done
    for (int i = 0; i < n; i++) {
        if (i > 0) out += ",";
        out += std::to_string(dist[i] == INF ? -1 : dist[i]);
    }
    return out;
}`;

const NOTES = {
  init: {
    javascript:
      'One sentinel for "no route yet". `Number.MAX_SAFE_INTEGER` is the safe choice rather than `Infinity` only because the *result* has to be a string four languages can agree on — the arithmetic would be perfectly happy with `Infinity`, and `Infinity + w` is still `Infinity` so no overflow guard is needed here.',
    python:
      '`float("inf")` needs no halving and cannot overflow, and `inf + w` is `inf`, so the guard against a sentinel overflow — which Java and C++ both need — simply does not exist in this language. `math.inf` is the same value imported once instead of re-parsed on every call.',
    java: '`Integer.MAX_VALUE / 2`, and the halving is not optional: `MAX_VALUE + w` wraps negative and a negative number looks like a spectacular improvement, so a sentinel without headroom silently returns a wrong shortest path. `Arrays.fill` is the idiomatic way to set a whole primitive array to one value.',
    cpp: '`std::numeric_limits<int>::max() / 2` for the Java reason, and the failure mode is even worse here: signed overflow is *undefined behaviour*, so an optimising compiler may delete the branch that would have noticed. `<limits>` is the header; halving is the standard trick.',
  },
  pass: {
    javascript:
      'The outer bound is `V - 1` and that number is the whole proof. A shortest path visits no node twice — dropping the cycle makes it no longer, and with a negative cycle there is no shortest path at all — so it uses at most `V - 1` edges, and one full sweep is enough to account for one more edge of it. Note the `let changed` is reset at the *top* of the pass, which is what makes the early exit below meaningful.',
    python:
      '`range(1, n)` is `1 .. n-1`, i.e. V-1 sweeps. Python has no `do/while`, so the `changed = True` before the loop is what guarantees the body runs even when `V - 1` is 0 — the same trick every while-do port needs, and one reason the `for` version is easier to reason about than the `while` version here.',
    java: 'A classic C-style `for` with a counter nobody reads, because the pass *number* is only needed for the caption. Java would let you write `for (int i = 0; i < n - 1; i++)` with a comment instead; the explicit `pass` is kept so all four listings count passes the same way, which is what the frame captions report.',
    cpp: 'The loop variable is unused, which some compilers warn about and every `-Wall` build turns into noise. A cleaner C++ would be `for (int pass = n - 1; pass > 0; pass--)`, counting *down* so the condition reads as "passes remaining" — and so the bound V-1 is on the right of the decrement where you can see it.',
  },
  edge: {
    javascript:
      '`if (dist[u] === INF) continue` is not an optimisation, it is correctness: `Infinity + w` is `Infinity`, so without the guard every edge out of an unreached node would compute a finite-looking comparison against `Infinity` and quietly do nothing — which happens to be the right answer, but by accident rather than by design. The explicit test is there so the intent is legible.',
    python:
      'The same guard, and in Python it is load-bearing in a way it is not in C: `float("inf") + w` is `inf`, so the comparison is safe, but `None` would raise. The `continue` is also cheaper than nesting the rest of the body under an `if`, which is why this shape is the one to copy rather than the "combined" one.',
    java: 'The guard, plus the reason the sentinel had to be halved: `dist[u] + e[1]` is executed on every edge, and if `dist[u]` were the unhalved `MAX_VALUE` the addition would overflow and `nd < dist[v]` would be true for almost every neighbour. The check is one comparison per edge in exchange for never thinking about overflow again.',
    cpp: 'Identical to the Java line, and the reason `<limits>` and the halving exist. A `const int INF` at function scope is also what lets the compiler fold the comparison, which matters at E·V iterations even though it is a single predictable branch.',
  },
  relax: {
    javascript:
      '`dist[v] = nd` writes straight into the array the *rest of this same pass* will read, because the sweep is in-place. That is why Bellman-Ford frequently converges in two passes on a graph whose diameter is short, and equally why a negative cycle makes it never converge: the loop is feeding itself.',
    python:
      'In-place, exactly as in the other three. The interesting consequence is that a node can be improved several times within a single pass, so "one pass = one more edge" is only true for the copy-the-array-then-sweep variant — the version above is faster and gives the same answer, but the pass number stops being a clean interpretation of the path length.',
    java: 'The one write that matters, into a primitive array so the rest of the pass sees it immediately. `e[0]` rather than a named local, because the `int[]` the driver builds has no field names — unpacking it into `int v = e[0]` at the top of the body reads better and costs nothing.',
    cpp: '`dist[e.first]` — the edge pair is `{ node, weight }`, so the destination is `.first` and the weight is `.second`, the opposite order from the `{ distance, node }` pair a priority queue entry would use. Naming both `e` in one function is exactly how that mistake happens; here the different roles are named at the point of use.',
  },
  changed: {
    javascript:
      'The flag that decides whether the outer loop runs again, and the only state carried between passes. It is a *local*, not a field on the graph, which is why the whole algorithm needs O(V) space and not O(V + E): the edges live in the adjacency the caller handed over.',
    python:
      "One boolean, reset to `False` at the top of every pass. Python's booleans are objects, so the flag is a name bound to `True` or `False` rather than a bit — irrelevant at this size, and the reason the reset has to be inside the loop rather than before it.",
    java: 'A local `boolean`, reassigned rather than declared with `++`, because "how many things changed" is never needed: the algorithm only asks *whether* anything did. Counting would buy nothing and would be the first thing to break if the relaxation were ever made conditional per-edge.',
    cpp: 'A plain `bool`, and the loop bound is written so this is the only reason the outer `for` is not a `while (changed)`. A `do/while (changed)` would be shorter and would skip the first pass entirely on some formulations, which is the classic way to get an off-by-one in this algorithm.',
  },
  'no-improve': {
    javascript:
      'The common case, and the whole reason Bellman-Ford is slow: on a graph with V nodes and E edges it re-reads all E of them on every one of the V-1 passes, even though the overwhelming majority of those reads accomplish nothing. Dijkstra avoids this by only ever looking at the edges of the node it is about to expand.',
    python:
      'An `else:` with `pass` and a comment, because the anchor marker has to live on the line the student is meant to be reading. A more honest Python version would put the comment before the `if` and skip the branch, but then there is no line for the note to attach to — the same trade-off appears in every language here.',
    java: 'An empty block holding a comment, purely so the anchor has a line to live on. That is a real cost of anchor-first listings: the code is not quite what you would write without the tooling, and the empty block would otherwise look like an oversight to a reader.',
    cpp: 'Same empty `else`, same reason. The strict `<` on the line above is what puts the negative case here: had it been `<=`, equal-cost routes would count as improvements, the `changed` flag would stay set forever, and the algorithm would never reach its early exit.',
  },
  'early-exit': {
    javascript:
      'A whole sweep with no improvement means a fixed point, and a fixed point means the table is final: no *longer* path can beat it either, because appending more edges to a non-improving prefix cannot suddenly make it cheaper. It is also a proof that no negative cycle is reachable — a negative cycle would keep the flag set forever, which is exactly what the next preset shows.',
    python:
      '`break` out of the pass loop, and the reason the verification sweep below is then *pointless*: if nothing improved, nothing can. This is a soundness argument rather than a speed trick, and it is why the early exit is placed before the verification and not after.',
    java: '`break` leaves the `for` and lands on the verification sweep, which will find nothing and fall through to the join. Java has no labelled break needed here because the early exit is from the outer loop only — the inner loops are already finished by this point, which is the one structural reason this early exit is easy in all four languages.',
    cpp: '`break` out of the pass loop, leaving `changed == false` behind as the flag that tells the reader why the verification sweep is a formality. The `bool changed` therefore has two jobs — control flow and documentation — which is unusual for a local and worth commenting in real code.',
  },
  verify: {
    javascript:
      'The extra sweep, and the reason the bound is V-1 rather than V. A shortest path uses at most V-1 edges, so after V-1 sweeps every such path has been accounted for; if a *further* relaxation still helps, the improvement must involve a cycle, and a cycle that lowers the total cost is by definition a negative cycle.',
    python:
      'The same extra sweep, and the same reasoning. Note that this loop runs even when the early exit fired — it simply finds nothing, because a fixed point cannot be improved. Dropping the guard rather than the loop keeps the code branch-free at the cost of one wasted sweep per run.',
    java: 'A second, unguarded sweep. Writing it as a separate loop rather than "one more iteration of the same loop" is what makes the intent readable, and it is why the count in the caption can say pass 6 of 5 without lying: the verification pass is outside the V-1 bound on purpose.',
    cpp: 'Same unguarded sweep. In C++ this is the one place a reference would have bitten: `dist[u]` is read inside the innermost loop, so the whole condition has to be re-evaluated per edge — hoisting `const int du = dist[u];` would be a premature optimisation that also happens to be wrong the moment a relaxation in the same pass changes `dist[u]`.',
  },
  cycle: {
    javascript:
      'A string, because there is no array of numbers to return. All four languages can produce exactly this one token, and it is unambiguous: the negative-cycle answer is not "some distances are very negative", it is "the question has no answer".',
    python:
      'An early `return` from inside two nested loops, which needs no flag or `break` levels — Python has no labelled break, but returning sidesteps the problem entirely. This is one of the few places where a language without goto is genuinely simpler.',
    java: "A `String`, not an `int[]`, so the method's return type has to be `String` for the whole function. That forces the distance table to be stringified by hand two anchors down; had the return type been `int[]` the negative-cycle case would need a magic sentinel in the array, which is strictly worse to read.",
    cpp: 'Returns a `std::string` literal, which is the same object type as the normal result — so one return type covers both cases. The alternative, an optional or a sentinel in the vector, would push the failure mode into the caller, and a caller that forgets to check it gets a plausible-looking table of nonsense.',
  },
  done: {
    javascript:
      'The table is joined into a string rather than returned as an array. That is a deliberate shape choice for the verifier: `Infinity` is not JSON, `null` does not compare equal to a number in three of the four languages, and -1 is a token every one of them can produce identically.',
    python:
      'A generator expression into `str.join`, which is why the distances are written as text at all. Python could return the list and let the harness compare numerically, but then Java and C++ would each have to invent a float infinity — one convention all four can produce beats a per-language convenience.',
    java: 'A `StringBuilder` rather than string concatenation in a loop: the compiler turns `"a" + x` into a `StringBuilder` anyway, but writing it out keeps the `-1` conversion and the separator in one readable place. `String.join` needs a `String[]` or a stream, which is more ceremony than this is worth for one line.',
    cpp: '`std::to_string` is the C++ equivalent of Python\'s `str` and Java\'s `Integer.toString`, and it comes from `<string>` — the header people forget. There is no `join` in the standard library before C++20, so the `if (i > 0) out += ","` line is the idiom, and getting the separator logic wrong is the classic off-by-one here.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'bellmanFord',
    python: 'bellman_ford',
    java: 'BellmanFord.bellmanFord',
    cpp: 'bellman_ford',
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
 * The result is a **string**, not an array, and that is the point. A distance
 * table needs one shared way of spelling "no path" and one shared way of
 * spelling "there is no answer at all", and a comma-separated line of integers
 * with -1 for the first and the literal NEGATIVE-CYCLE for the second is the
 * only shape all four languages produce byte-identically.
 */
const EXPECTED: Record<string, string> = {
  sparse: '0,5,11,16,5,21,19',
  dense: '0,9,7,6,9,11,10,9,13,10',
  rebate: '0,4,-4,-1,1,7',
  'loss-loop': 'NEGATIVE-CYCLE',
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
    result: EXPECTED[p.id] ?? '',
  };
});

export const bellmanFordAlgo: AlgoDef<GraphFrame> = {
  id: 'bellman-ford',
  title: 'Bellman-Ford',
  category: 'graphs',
  summary:
    'Sweep the whole edge list V-1 times, lowering any distance a cheaper route would beat, and use one extra sweep to prove whether the graph contains a reachable negative cycle.',
  intuition:
    'Reach for Bellman-Ford exactly when Dijkstra is disqualified, which in practice means one of two things: an edge weight can be negative (a rebate, a credit, a currency conversion, a penalty that cancels a cost elsewhere), or you need to *prove* the graph has no negative cycle. That second use is why it survives in shipping routers — a negative cycle means costs that are internally inconsistent, and finding it is worth a great deal more than a shortest path. Do not reach for it otherwise: on a large graph with non-negative weights it is O(V·E) where Dijkstra is O((V+E) log V), and the sparse case is where that hurts most.',
  complexity: {
    best: 'O(V · E)',
    average: 'O(V · E)',
    worst: 'O(V · E)',
    space: 'O(V)',
    note: 'Time is V-1 sweeps of the whole edge list; space is the distance table alone, because the edges live in the adjacency the caller already holds. The early exit makes the common case far cheaper — often two passes — but it is not something you can rely on.',
  },
  traits: {
    offline: true,
    tags: ['shortest-path', 'negative-weights', 'negative-cycle-detection', 'single-source'],
  },
  viewport: 'graph',
  level: 'advanced',
  params: [
    {
      key: 'start',
      label: 'Source node',
      kind: 'number',
      min: 0,
      max: 99,
      step: 1,
      default: 0,
      help: 'Negative cycles only matter if they are *reachable* from here, so moving the source can turn a NEGATIVE-CYCLE result into a perfectly good table.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: bellmanFord,
  lesson,
  expectations,
  formatResult: (r) => String(r),
  anchors: [
    'init',
    'pass',
    'edge',
    'relax',
    'no-improve',
    'changed',
    'early-exit',
    'verify',
    'cycle',
    'done',
  ],
};

export default bellmanFordAlgo;
