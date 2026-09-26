import { byLanguage } from '../../code/anchors.ts';
import { circleNodes, dagGraph, graphInput, ringGraph } from '../../input/generators.ts';
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
 * Breadth-First Search.
 *
 * The whole lesson is one container choice. Put a queue behind the traversal and
 * nodes come out in order of *hops from the start*, which is the cheapest
 * possible distance measure; put a stack behind the identical code and you get
 * Depth-First Search (see `dfs.ts`). Everything the `graph` viewport draws —
 * the `frontier` bar, the `L0`/`L1`/`L2` labels under each node — is a
 * read-out of that one queue.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 11;

/** A directed ring plus two chords. Cheap edges, so hop-counts and costs agree. */
const RING = ringGraph(SEED, 8, true);

/** The same shape, undirected: every edge appears in the list *twice*. */
const RING_UNDIRECTED = ringGraph(SEED + 8, 7, false);

/** Four columns of two. Edges only ever point right, so it cannot have a cycle. */
const DAG = dagGraph(SEED + 12, 4, 2);

/**
 * Two separate little worlds on one circle of coordinates.
 *
 * Built by hand rather than generated because the point of the preset is a
 * *negative* fact — five of the eight nodes are unreachable — and no generator
 * guarantees that. It is the only way a student sees that BFS is a
 * reachability test and not a way of visiting "everything".
 */
const ISLANDS: { nodes: AlgoGraphNode[]; edges: AlgoGraphEdge[] } = {
  nodes: circleNodes(8),
  edges: [
    { from: 'n0', to: 'n1', directed: true },
    { from: 'n1', to: 'n2', directed: true },
    { from: 'n2', to: 'n0', directed: true },
    { from: 'n3', to: 'n4', directed: true },
    { from: 'n4', to: 'n5', directed: true },
    { from: 'n5', to: 'n6', directed: true },
    { from: 'n6', to: 'n7', directed: true },
  ],
};

const PRESETS: Preset[] = [
  {
    id: 'ring',
    label: 'Directed ring',
    blurb:
      'Eight nodes on a circle with two chords. The `L0`/`L1`/`L2` badges under the nodes are the whole result: BFS finds the fewest *hops*, and a ring makes the wrap-around from 7 back to 0 visible.',
    input: graphInput(RING.nodes, RING.edges, { directed: true }),
    params: { start: 0 },
  },
  {
    id: 'undirected',
    label: 'Undirected ring',
    blurb:
      'Every edge is listed in both directions, so each node has two ways back. A directed BFS only follows the arrows; here the frontier is symmetric and both of node 2’s neighbours go green at once.',
    input: graphInput(RING_UNDIRECTED.nodes, RING_UNDIRECTED.edges, { directed: false }),
    params: { start: 2 },
  },
  {
    id: 'dag',
    label: 'DAG, 4 columns',
    blurb:
      'Edges only point right, so BFS from the second column reaches five of the eight nodes and the remaining three are permanently out of range. Notice the frontier can hold two nodes at once — that is the whole mechanism.',
    input: graphInput(DAG.nodes, DAG.edges, { directed: true }),
    params: { start: 1 },
  },
  {
    id: 'islands',
    label: 'Two islands',
    blurb:
      'The circle of coordinates is shared, the edges are not: nodes 3 to 7 are in another component. Their distance label stays `∞` and they are never enqueued, which is what "unreachable" actually looks like.',
    input: graphInput(ISLANDS.nodes, ISLANDS.edges, { directed: true }),
    params: { start: 0 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

/**
 * One pass over the input, producing everything the animation and the
 * verification harness need from a single source of truth.
 *
 * The two views are deliberately *not* the same object. `adj` keeps every
 * direction the input lists, because that is what the traversal must follow and
 * what the `graph` glue hands the four language implementations. `edges` is
 * collapsed to one arc per pair, because that is what an undirected edge
 * *looks* like — `GraphView` draws it as a single bowed arc, and drawing the
 * mirror image too would just be noise.
 */
function read(input: AlgoInput): {
  ids: NodeId[];
  label: (i: number) => string;
  adj: number[][];
  edges: GraphEdge[];
  nodes: Record<NodeId, GraphNode>;
} {
  const g = isGraph(input) ? input : null;
  const src: AlgoGraphNode[] = g?.nodes ?? [];
  const ids = src.map((nd) => nd.id);
  const at = new Map<NodeId, number>(ids.map((id, i) => [id, i]));
  const nodes: Record<NodeId, GraphNode> = {};
  for (const nd of src) {
    nodes[nd.id] = { id: nd.id, x: nd.x, y: nd.y, label: nd.label };
  }
  const label = (i: number): string => {
    const id = ids[i];
    return id === undefined ? '?' : (nodes[id]?.label ?? id);
  };

  const adj: number[][] = ids.map(() => []);
  const edges: GraphEdge[] = [];
  const drawn = new Set<string>();
  for (const e of g?.edges ?? []) {
    const u = at.get(e.from);
    const v = at.get(e.to);
    if (u === undefined || v === undefined) continue;
    adj[u]?.push(v);
    const key = g?.directed === false ? `${Math.min(u, v)}~${Math.max(u, v)}` : `${u}>${v}`;
    if (drawn.has(key)) continue;
    drawn.add(key);
    edges.push({ from: e.from, to: e.to, directed: g?.directed ?? true });
  }
  return { ids, label, adj, edges, nodes };
}

export function* bfs(ctx: RunContext): Generator<GraphFrame> {
  const { ids, label, adj, edges, nodes } = read(ctx.input);
  const n = ids.length;

  /** Snapshots, not deltas: every frame gets its own objects. */
  const snap = (
    anchor: string,
    note: string,
    o: {
      caption?: string;
      ops?: number;
      vars?: Record<string, CellValue | boolean>;
      highlight?: Highlight;
      layer?: Record<NodeId, number>;
      result?: string | null;
    } = {},
  ): GraphFrame => ({
    kind: 'graph',
    index: 0, // the materialiser owns this one
    anchor,
    note,
    nodes: { ...nodes },
    edges: edges.map((e) => ({ ...e })),
    frontier: queue.map((i) => ids[i] as NodeId),
    visited: order.map((i) => ids[i] as NodeId),
    layer: { ...layer },
    ...(o.caption === undefined ? {} : { caption: o.caption }),
    ...(o.ops === undefined ? {} : { ops: o.ops }),
    ...(o.vars === undefined ? {} : { vars: o.vars }),
    ...(o.highlight === undefined ? {} : { highlight: o.highlight }),
    ...(o.result === undefined ? {} : { result: o.result }),
  });

  const queue: number[] = [];
  const order: number[] = [];
  const layer: Record<NodeId, number> = {};
  const seen = new Set<number>();
  let ops = 0;

  /** Nodes nothing has claimed yet — the "not discovered" part of the picture. */
  const untouched = (): NodeId[] => ids.filter((_, i) => !seen.has(i) && !queue.includes(i));

  const start =
    n === 0 ? 0 : Math.min(Math.max(0, Math.round(Number(ctx.params.start ?? 0))), n - 1);

  yield snap(
    'start',
    n === 0
      ? 'The graph has no nodes at all, so there is nowhere to search. Done.'
      : `Nothing has been reached yet. The queue is empty and every one of the ${n} nodes is still unvisited, so the whole picture is unvisited. BFS will start at ${label(start)}.`,
    {
      caption: n === 0 ? 'Empty graph' : `Start at ${label(start)}`,
      highlight: { unvisited: ids },
      vars: { n, start: label(start) },
    },
  );

  if (n === 0) {
    yield snap('done', 'Zero nodes means zero order. The result is the empty list.', {
      result: 'empty',
      vars: { n, visited: 0 },
    });
    return;
  }

  seen.add(start);
  order.push(start);
  queue.push(start);
  layer[ids[start] as NodeId] = 0;

  yield snap(
    'enqueue-start',
    `Mark ${label(start)} as seen and push it. Marking it *now* rather than when it is dequeued is what stops a node with two parents being queued twice — and that marking is the only thing that stops BFS looping forever on a cycle.`,
    {
      caption: 'Layer 0',
      highlight: { frontier: [ids[start] as NodeId], visited: [ids[start] as NodeId] },
      vars: { u: label(start), layer: 0, queue: 1, visited: 1 },
    },
  );

  while (queue.length > 0) {
    if (ctx.shouldStop()) return;
    const u = queue.shift() as number;
    ops++;
    const uId = ids[u] as NodeId;
    const depth = layer[uId] ?? 0;
    const rest = queue.map((i) => ids[i] as NodeId);

    yield snap(
      'dequeue',
      `Take ${label(u)} off the front of the queue. It was enqueued at layer ${depth}, so this is the cheapest way to be at ${label(u)} — and because the queue is FIFO, every node at layer ${depth} comes out before any node at layer ${depth + 1}.`,
      {
        caption: `Layer ${depth} · queue ${rest.length}`,
        ops,
        highlight: { active: [uId], frontier: rest, unvisited: untouched() },
        vars: { u: label(u), layer: depth, queue: rest.length, visited: order.length },
      },
    );

    for (const v of adj[u] ?? []) {
      if (ctx.shouldStop()) return;
      const vId = ids[v] as NodeId;
      if (seen.has(v)) {
        yield snap(
          'seen',
          `${label(u)} points at ${label(v)}, but ${label(v)} is already in the visited set, so it is skipped. This is the check that makes BFS O(V + E): an edge is looked at once when its source is dequeued and never again.`,
          {
            caption: `Layer ${depth} · queue ${rest.length}`,
            ops,
            highlight: { active: [uId], visited: order.map((i) => ids[i] as NodeId) },
            vars: { u: label(u), v: label(v), layer: layer[vId] ?? -1, visited: order.length },
          },
        );
        continue;
      }
      seen.add(v);
      order.push(v);
      queue.push(v);
      layer[vId] = depth + 1;
      const after = queue.map((i) => ids[i] as NodeId);
      yield snap(
        'discover',
        `${label(v)} has never been seen, so it joins the back of the queue at layer ${depth + 1}. It goes on the *back*, not the front — that single word is the difference between breadth-first and depth-first, and it is why ${label(v)} is ${depth + 1} hops away rather than "however deep the stack happened to be".`,
        {
          caption: `Layer ${depth + 1} · queue ${after.length}`,
          ops,
          highlight: {
            frontier: after,
            visited: order.map((i) => ids[i] as NodeId),
            unvisited: untouched(),
          },
          vars: {
            u: label(u),
            v: label(v),
            layer: depth + 1,
            queue: after.length,
            visited: order.length,
          },
        },
      );
    }
  }

  const missed = ids.map((_, i) => i).filter((i) => !seen.has(i));
  const missedIds = missed.map((i) => ids[i] as NodeId);

  yield snap(
    'exhausted',
    missed.length === 0
      ? `The queue is empty and the visited set holds all ${n} nodes, so the search covered the whole graph.`
      : `The queue is empty but ${missed.length} node${missed.length === 1 ? '' : 's'} never arrived: ${missedIds.map((_, i) => label(missed[i] as number)).join(', ')}. The queue empties when the reachable set is exhausted, so an empty queue with a grey node is a proof of unreachability, not a bug.`,
    {
      ops,
      highlight: { visited: order.map((i) => ids[i] as NodeId), unvisited: missedIds },
      result: missed.length === 0 ? 'complete' : 'partial',
      vars: { visited: order.length, missed: missed.length, n },
    },
  );

  yield snap(
    'done',
    `BFS visited ${order.length} of ${n} nodes in ${ops} dequeue${ops === 1 ? '' : 's'}. The dequeue order *is* the answer: [${order.map((i) => label(i)).join(', ')}]. It is sorted by hop count from the start, and within one hop by the order the parents came off the queue, so every node doubles as a shortest-hop certificate.`,
    {
      ops,
      highlight: { visited: order.map((i) => ids[i] as NodeId), unvisited: missedIds },
      result: missed.length === 0 ? 'complete' : 'partial',
      vars: { visited: order.length, missed: missed.length, n, ops },
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

const JS = `function bfs(adj, start) {
  // \`adj\` is the neighbour list built from { nodes, edges }: adj[u] holds every
  // node one hop from u, in edge order, as [node, weight] pairs. The graph is
  // never re-scanned, so a pop costs O(degree(u)) rather than O(E).
  const n = Object.keys(adj).length;
  const seen = new Array(n).fill(false);
  const order = [];
  const queue = [start];                                  // @anchor start
  seen[start] = true;                                     // @anchor enqueue-start
  while (queue.length > 0) {                              // @anchor exhausted
    const u = queue.shift();                              // @anchor dequeue
    order.push(u);
    // The weight is destructured away: BFS counts hops, not cost.
    for (const [v] of adj[u] ?? []) {
      if (seen[v]) continue;                              // @anchor seen
      seen[v] = true;                                     // @anchor discover
      queue.push(v);
    }
  }
  return order;                                           // @anchor done
}`;

const PY = `from collections import deque


def bfs(adj, start):
    # \`adj\` is the neighbour list built from { nodes, edges }: adj[u] holds every
    # node one hop from u, in edge order, as (node, weight) pairs.
    n = len(adj)
    seen = [False] * n
    order = []
    queue = deque([start])                                # @anchor start
    seen[start] = True                                    # @anchor enqueue-start
    while queue:                                          # @anchor exhausted
        u = queue.popleft()                               # @anchor dequeue
        order.append(u)
        # The weight is unpacked and ignored: BFS counts hops, not cost.
        for v, _w in adj.get(u, []):
            if seen[v]:
                continue                                  # @anchor seen
            seen[v] = True                                # @anchor discover
            queue.append(v)
    return order                                          # @anchor done`;

const JAVA = `import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

class Bfs {
    static int[] bfs(List<List<int[]>> adj, int start) {
        // adj.get(u) is the neighbour list built from { nodes, edges }: every
        // node one hop from u, in edge order, as { node, weight } pairs.
        int n = adj.size();
        boolean[] seen = new boolean[n];
        List<Integer> order = new ArrayList<>();
        Deque<Integer> queue = new ArrayDeque<>();        // @anchor start
        queue.add(start);
        seen[start] = true;                                // @anchor enqueue-start
        while (!queue.isEmpty()) {                        // @anchor exhausted
            int u = queue.poll();                          // @anchor dequeue
            order.add(u);
            // The weight is read into _ and ignored: BFS counts hops, not cost.
            for (int[] e : adj.get(u)) {
                int v = e[0];
                if (seen[v]) continue;                     // @anchor seen
                seen[v] = true;                            // @anchor discover
                queue.add(v);
            }
        }
        int[] out = new int[order.size()];                 // @anchor done
        for (int i = 0; i < order.size(); i++) out[i] = order.get(i);
        return out;
    }
}`;

const CPP = `#include <vector>
#include <utility>
using std::vector;
using std::pair;

vector<int> bfs(vector<vector<pair<int, int>>> adj, int start) {
    // adj[u] is the neighbour list built from { nodes, edges }: every node one
    // hop from u, in edge order, as { node, weight } pairs. adj is taken *by
    // value*, so this is a copy and the caller's graph is never modified.
    int n = (int)adj.size();
    vector<bool> seen(n, false);
    vector<int> order;
    vector<int> queue;                                     // @anchor start
    queue.push_back(start);
    seen[start] = true;                                    // @anchor enqueue-start
    while (!queue.empty()) {                               // @anchor exhausted
        int u = queue.front();                             // @anchor dequeue
        queue.erase(queue.begin());
        order.push_back(u);
        // The weight is bound to w and ignored: BFS counts hops, not cost.
        for (const auto& e : adj[u]) {
            int v = e.first;
            if (seen[v]) continue;                         // @anchor seen
            seen[v] = true;                                // @anchor discover
            queue.push_back(v);
        }
    }
    return order;                                          // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'The queue is seeded with the start node and nothing else. `Record<number, …>` is a plain object here, so `Object.keys(adj).length` is how you recover the node count — JavaScript has no `adj.size`.',
    python:
      'Python needs `collections.deque` because a plain list has no O(1) pop from the front: `queue.pop(0)` is O(n) and turns the whole traversal into O(V·E). `deque` is also the only reason this is a queue and not a stack.',
    java: '`ArrayDeque` is the interface for both ends; `add`/`poll` are the queue operations. A `LinkedList` would also work and is the other common choice, but `ArrayDeque` is what the JDK documents for this and it allocates one array instead of a node per element.',
    cpp: 'A `std::vector` used as a queue is a trap: `erase(begin())` is O(n). The idiomatic C++ queue is `std::queue<int>`, but a vector with an index head never reallocates and is often faster, so a hand-rolled head index is defensible. Here the erase keeps the listing short and the graph is small enough that it does not matter.',
  },
  'enqueue-start': {
    javascript:
      'Mark the start seen *before* the loop, not when it is dequeued. That single `fill(false)` plus this one write is the entire cycle guard: every node is enqueued at most once, so the loop always terminates.',
    python:
      '`seen[start] = True` is the whole visited set, one boolean per node. Doing it here rather than on dequeue is what makes the traversal O(V + E): a node with two parents is still enqueued once.',
    java: 'Java arrays are fixed size and their elements are mutable, so `boolean[] seen` is both the cheapest and the clearest visited set. Boxing the queue into `Integer` costs an allocation per element; on a hot path `int[]` plus a head index avoids it.',
    cpp: '`vector<bool>` is a bit-packed specialisation, so it uses 1 bit per node rather than 1 byte. It is the idiomatic choice for a visited set, and it is *not* a normal vector — taking a reference to an element of a `vector<bool>` does not compile.',
  },
  exhausted: {
    javascript:
      'The loop condition is the whole termination proof. BFS enqueues each node exactly once, so the queue shrinks by one and grows by at most degree(u) per iteration; it cannot grow forever, and when it empties the reachable set is exactly the visited set.',
    python:
      'A `deque` is truthy while it has elements, so `while queue:` is the emptiness test. Note there is no `len(queue) > 0` dance and no sentinel value: an empty `deque` is falsy, which is the idiomatic Python way to say "nothing left to do".',
    java: '`isEmpty()` rather than `size() == 0` — the JDK contract allows an implementation to make `isEmpty` cheaper, and it reads as the question it actually is. `ArrayDeque` also forbids nulls, so `poll()` returning null can never be confused with a queued null.',
    cpp: 'C++ has no `pop_front` on a vector, which is exactly why the two common idioms are `std::queue<int>` (a `std::deque` underneath) or a vector plus a separate head index. `std::deque::pop_front` *is* O(1), unlike `vector::erase(begin())`.',
  },
  dequeue: {
    javascript:
      '`shift()` is O(1) here because V8 keeps the array dense and reuses the freed slot at the front; the usual "arrays are bad queues" warning applies to older engines and to other languages, not to this one. `order.push(u)` is the answer being built — it is the dequeue sequence, which for BFS is sorted by hop count.',
    python:
      '`popleft()` is O(1) and the reason `deque` was chosen. Note that the *order* list is a separate structure: the queue is a working buffer that drains to nothing, while `order` is the output that survives to the return.',
    java: '`poll()` returns the head and removes it, or null when empty. The alternative, `peek()` followed by `remove()`, is two operations and two chances to get it wrong. Because the driver hands you a fresh `List` per case, the queue here is not aliased to anything the caller can see.',
    cpp: '`front()` then `erase(begin())` is two operations where `std::queue` would give you a single `pop()`. The `front()` read has to happen first because `erase` invalidates every iterator and reference into the vector — including the element you were about to copy out.',
  },
  seen: {
    javascript:
      'The neighbour is already in the visited set, so the edge is dropped. This is the reason BFS is O(V + E) and not O(V·E): an edge is examined once, when its source is dequeued, and then never looked at again. Without this check a cycle would enqueue its nodes forever.',
    python:
      'Nothing to do: the neighbour was already reached, by this node or by some other node at the same or a lower layer. Skipping it is what keeps the queue bounded — a node is enqueued on the *first* edge that reaches it and never again.',
    java: 'The `continue` is inside a for-each over an `int[]`, so it only skips the rest of the body; the enhanced-for has already fetched the element, which is why `int v = e[0]` has to come *before* the check.',
    cpp: "Range-based `for` over `adj[u]` hands you a `const auto&` reference into the adjacency vector, so `e.first` reads the neighbour without copying the pair. Note the adjacency itself is a local copy (taken by value), so nothing here can accidentally mutate the caller's graph.",
  },
  discover: {
    javascript:
      "Two writes, two different data structures: `seen` is the permanent record and `queue` is the temporary frontier. The push goes on the *back*, which is what makes the next dequeue a node at the same layer rather than a child of this one. In JavaScript an array's `push` is amortised O(1).",
    python:
      'Python has no `seen[v] = True; queue.append(v)` shorthand worth using — unlike tuple swapping, there is nothing to fuse. `append` is amortised O(1) on a list and on a `deque` alike; the only O(1)-or-worse choice in this whole function would have been `insert(0, v)`.',
    java: '`queue.add(v)` is `ArrayDeque.addLast` under the hood, the O(1) tail insert. Java has no way to change a queued element, so the "mark and enqueue" pair is written out every time — a contrast worth holding on to for Dijkstra, where the same restriction forces duplicate entries into the queue.',
    cpp: '`push_back` is amortised O(1), and it reallocates and copies when it grows, which is why the vector is a copy taken by value: growing it cannot invalidate anything the caller holds. A `std::queue<int>` wraps a `std::deque` and never reallocates in bulk at all.',
  },
  done: {
    javascript:
      'The return value is the dequeue order, which is the interesting output: sorted by hop count from `start`, and within a hop by the order the parents were dequeued. That makes it a shortest-hop path certificate for every node in the list, which is the actual use of BFS.',
    python:
      'Returning a list of ints is the shape the verifier can compare directly across all four languages. A Python generator (`yield` from a function) would avoid the list, but the harness needs a value it can diff, so the list is built and returned.',
    java: 'Java cannot return `List<Integer>` and expect the same JSON as a Python list of small ints, so the list is converted to `int[]` here. An `int[]` is also the right type for the consumer: a `shortestHop[]` array indexed by node is exactly what a routing or "levels in a puzzle" caller wants.',
    cpp: 'The returned `vector<int>` is *not* the queue: the queue has been drained to empty, and what comes back is the visit order, built separately. Returning the queue itself would hand back an empty vector — a mistake worth naming because both are called "the queue" in prose.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'bfs',
    python: 'bfs',
    java: 'Bfs.bfs',
    cpp: 'bfs',
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
 * What the four implementations are claiming, per preset, is the dequeue order
 * as node indices. The nodes array is the positional index list the `graph`
 * glue maps, and each edge carries the hop weight 1 because BFS ignores cost.
 */
const EXPECTED: Record<string, number[]> = {
  ring: [0, 1, 2, 3, 5, 4, 6, 7],
  undirected: [2, 1, 3, 5, 0, 4, 6],
  dag: [1, 3, 5, 6, 7],
  islands: [0, 1, 2],
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const ids = (p.input.type === 'graph' ? p.input.nodes : []).map((nd) => nd.id);
  const at = new Map<NodeId, number>(ids.map((id, i) => [id, i]));
  const edges: Array<[number, number, number]> = [];
  for (const e of p.input.type === 'graph' ? p.input.edges : []) {
    const u = at.get(e.from);
    const v = at.get(e.to);
    if (u === undefined || v === undefined) continue;
    edges.push([u, v, 1]);
  }
  return {
    presetId: p.id,
    args: [{ nodes: ids.map((_, i) => i), edges }, Number(p.params?.start ?? 0)],
    result: EXPECTED[p.id] ?? [],
  };
});

export const bfsAlgo: AlgoDef<GraphFrame> = {
  id: 'bfs',
  title: 'Breadth-First Search',
  category: 'graphs',
  summary:
    'Flood the graph outwards one hop at a time from a start node, using a queue, so the first time a node is reached is by a path with the fewest edges.',
  intuition:
    'Reach for BFS whenever "how many steps, not how much" is the question: shortest route in an unweighted map, minimum moves in a puzzle or a Rubik-like state, friends-of-friends, the level you unlock in a skill tree, the depth of the shallowest node in a dependency graph. It is also the cheapest way to ask "is this reachable at all", which is why cycle detection, connected components and bipartite checking are all BFS in disguise. Do not reach for it when the edges are weighted — hop count is then simply the wrong distance, and Dijkstra is the same code with a better container.',
  complexity: {
    best: 'O(V + E)',
    average: 'O(V + E)',
    worst: 'O(V + E)',
    space: 'O(V)',
    note: 'Every node is enqueued once and every edge is read once, so the cost is the size of the graph — there is no worst case to fear and no input on which it degrades.',
  },
  traits: { offline: true, tags: ['traversal', 'shortest-hop-path', 'queue', 'unweighted'] },
  viewport: 'graph',
  level: 'intro',
  params: [
    {
      key: 'start',
      label: 'Start node',
      kind: 'number',
      min: 0,
      max: 99,
      step: 1,
      default: 0,
      help: 'Node index, clamped to the graph. Everything BFS reports is relative to here.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: bfs,
  lesson,
  expectations,
  formatResult: (r) => `[${(r as number[]).join(', ')}]`,
  anchors: ['start', 'enqueue-start', 'exhausted', 'dequeue', 'seen', 'discover', 'done'],
};

export default bfsAlgo;
