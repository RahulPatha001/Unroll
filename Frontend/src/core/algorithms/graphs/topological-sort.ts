import { byLanguage } from '../../code/anchors.ts';
import { dagGraph, graphInput } from '../../input/generators.ts';
import type { AlgoGraphNode, AlgoInput, InputSpec } from '../../input/types.ts';
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
 * Topological sort, by Kahn's algorithm.
 *
 * The insight is one sentence long: **a node can go next only when nothing is
 * still pointing at it.** So keep a count of each node's in-edges, put every
 * node whose count has reached zero into a frontier, and drain the frontier. No
 * priority queue, no relaxation, no revisiting — just an integer that only ever
 * goes down.
 *
 * The frontier bar in the viewport *is* that set of zero-in-degree nodes, and
 * watching it is watching the algorithm. When it holds one node the order is
 * forced. When it holds four, the choice between them is arbitrary — which is
 * also the proof that a topological order is usually not unique.
 *
 * Note what the algorithm does *not* need. The traversal reads the graph's
 * out-edges, which is the direction Kahn consumes, so the one structure it has
 * to build is the in-degree table — a single O(V + E) pass. There is no reverse
 * adjacency, no recursion, and no revisiting.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 11;

/**
 * `dagGraph` lays its nodes out in columns, so the picture already looks like
 * the answer: every edge points right, and the sort has to agree.
 *
 * Four different shapes, because the *width of the frontier* is the thing worth
 * comparing. One column per step gives a forced order; four columns of three
 * gives a frontier that regularly holds six nodes at once.
 */
const THREE_COLUMNS = dagGraph(SEED + 36, 3, 3);
const FOUR_COLUMNS = dagGraph(SEED, 4, 2);
const CHAIN = dagGraph(SEED + 20, 4, 1);
const WIDE = dagGraph(SEED + 42, 4, 3);

const PRESETS: Preset[] = [
  {
    id: 'three-columns',
    label: '3 columns of 3',
    blurb:
      'Nine nodes, seven edges, and a frontier that briefly holds five. The order [0,1,2,3,8,4,5,7,6] is not the column order — 8 comes out fifth because nothing points at it yet, which is the lesson in one frame.',
    input: graphInput(THREE_COLUMNS.nodes, THREE_COLUMNS.edges, { directed: true }),
  },
  {
    id: 'four-columns',
    label: '4 columns of 2',
    blurb:
      'A long chain with two nodes per column. Watch the in-degree readout fall to 0: because edges only go right, the frontier is a moving wall, and each pop releases exactly the column behind it.',
    input: graphInput(FOUR_COLUMNS.nodes, FOUR_COLUMNS.edges, { directed: true }),
  },
  {
    id: 'chain',
    label: 'A forced chain',
    blurb:
      'Four nodes, three edges, one chain. The frontier never holds more than one node, so there is exactly one topological order and the algorithm has no freedom at all. Useful as the degenerate case: any "pick the smallest ready node" tie-break is invisible here.',
    input: graphInput(CHAIN.nodes, CHAIN.edges, { directed: true }),
  },
  {
    id: 'wide',
    label: '4 columns of 3',
    blurb:
      'Twelve nodes and only nine edges, so the graph is sparse and the frontier peaks at six. Six simultaneously valid next moves is the clearest possible statement that a topological order is a *choice*, not a fact about the graph.',
    input: graphInput(WIDE.nodes, WIDE.edges, { directed: true }),
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

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
  for (const nd of src) nodes[nd.id] = { id: nd.id, x: nd.x, y: nd.y, label: nd.label };
  const label = (i: number): string => {
    const id = ids[i];
    return id === undefined ? '?' : (nodes[id]?.label ?? id);
  };

  const adj: number[][] = ids.map(() => []);
  const edges: GraphEdge[] = [];
  for (const e of g?.edges ?? []) {
    const u = at.get(e.from);
    const v = at.get(e.to);
    if (u === undefined || v === undefined) continue;
    adj[u]?.push(v);
    edges.push({ from: e.from, to: e.to, directed: true });
  }
  return { ids, label, adj, edges, nodes };
}

export function* topologicalSort(ctx: RunContext): Generator<GraphFrame> {
  const { ids, label, adj, edges, nodes } = read(ctx.input);
  const n = ids.length;

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
    // The frontier *is* the zero-in-degree set: every node that could legally go
    // next. That single set is the whole algorithm, and the bar under the graph
    // is showing it to you frame by frame.
    frontier: ready.map((i) => ids[i] as NodeId),
    visited: output.map((i) => ids[i] as NodeId),
    layer: { ...position },
    ...(o.caption === undefined ? {} : { caption: o.caption }),
    ...(o.ops === undefined ? {} : { ops: o.ops }),
    ...(o.vars === undefined ? {} : { vars: o.vars }),
    ...(o.highlight === undefined ? {} : { highlight: o.highlight }),
    ...(o.result === undefined ? {} : { result: o.result }),
  });

  const indegree: number[] = ids.map(() => 0);
  const ready: number[] = [];
  const output: number[] = [];
  /** Output position per node, rendered as an `L<n>` badge. */
  const position: Record<NodeId, number> = {};
  let ops = 0;

  for (let u = 0; u < n; u++) {
    for (const v of adj[u] ?? []) indegree[v] = (indegree[v] as number) + 1;
  }

  yield snap(
    'count-indegree',
    n === 0
      ? 'No nodes, no order. Done.'
      : `Count the edges pointing *into* each node. A node's in-degree is the number of things that must happen before it, so the only nodes allowed to go first are the ${ids.map((_, i) => i).filter((i) => indegree[i] === 0).length} whose count is 0. Nothing has been emitted yet.`,
    {
      caption: n === 0 ? 'Empty graph' : `${n} nodes · ${edges.length} edges`,
      ops,
      highlight: { unvisited: ids },
      vars: { n, edges: edges.length, maxIndegree: Math.max(0, ...indegree), emitted: 0 },
    },
  );

  if (n === 0) {
    yield snap('done', 'Zero nodes means an empty order.', { result: 'empty', vars: { n } });
    return;
  }

  for (let u = 0; u < n; u++) if (indegree[u] === 0) ready.push(u);

  yield snap(
    'seed',
    `Put every zero-in-degree node into the frontier: [${ready.map((i) => label(i)).join(', ')}]. The scan is in node order, and the frontier is a FIFO queue, so the tie-break is deterministic — two runs of the same graph always emit the same order, which is what makes this testable at all.`,
    {
      caption: `${output.length} of ${n} emitted · frontier ${ready.length}`,
      ops,
      highlight: { frontier: ready.map((i) => ids[i] as NodeId), unvisited: ids },
      vars: { ready: ready.length, maxReady: ready.length, emitted: 0, n },
    },
  );

  while (ready.length > 0) {
    if (ctx.shouldStop()) return;
    const u = ready.shift() as number;
    const uId = ids[u] as NodeId;
    const slot = output.length;
    ops++;
    const rest = ready.map((i) => ids[i] as NodeId);

    yield snap(
      'take',
      `Take ${label(u)} off the front of the frontier. It is there because nothing points at it any more, and it is at the front because the frontier is a queue — every other zero-in-degree node is equally legal and equally arbitrary, and taking them in a fixed order is the only reason the answer is reproducible.`,
      {
        caption: `${output.length} of ${n} emitted · frontier ${rest.length}`,
        ops,
        highlight: {
          active: [uId],
          frontier: rest,
          unvisited: ids.filter((_, i) => (indegree[i] as number) > 0),
        },
        vars: {
          u: label(u),
          slot,
          ready: rest.length,
          maxReady: ready.length,
          emitted: output.length,
        },
      },
    );

    output.push(u);
    position[uId] = slot;

    yield snap(
      'emit',
      `Append ${label(u)} to the order at position ${slot} (badge L${slot}). Every node already emitted points only at nodes not yet emitted, and that invariant is what makes the result a valid build order: you can execute this list top to bottom and nothing is ever used before it exists.`,
      {
        caption: `[${output.map((i) => label(i)).join(' ')}]`,
        ops,
        highlight: { answer: [uId], frontier: rest },
        vars: { u: label(u), slot, emitted: output.length, ready: rest.length, n },
      },
    );

    for (const v of adj[u] ?? []) {
      if (ctx.shouldStop()) return;
      const vId = ids[v] as NodeId;
      const before = indegree[v] as number;
      const after = before - 1;
      indegree[v] = after;

      if (after > 0) {
        yield snap(
          'blocked',
          `Drop ${label(v)}'s in-degree from ${before} to ${after}. Still ${after} prerequisite${after === 1 ? '' : 's'} outstanding, so it cannot go next and stays out of the frontier. The count is the only state the algorithm keeps.`,
          {
            caption: `${output.length} of ${n} emitted`,
            ops,
            highlight: { active: [uId], remaining: [vId] },
            vars: { u: label(u), v: label(v), before, after, emitted: output.length },
          },
        );
        continue;
      }

      ready.push(v);
      yield snap(
        'free',
        `Drop ${label(v)}'s in-degree to 0, so its last prerequisite — ${label(u)} — is now emitted and it joins the back of the frontier. Note the FIFO discipline: it will be taken after everything already waiting, which keeps the order reproducible.`,
        {
          caption: `${output.length} of ${n} emitted · frontier ${ready.length}`,
          ops,
          highlight: { active: [uId], frontier: ready.map((i) => ids[i] as NodeId) },
          vars: {
            u: label(u),
            v: label(v),
            before,
            after,
            ready: ready.length,
            emitted: output.length,
          },
        },
      );
    }
  }

  const stuck = ids.map((_, i) => i).filter((i) => (indegree[i] as number) > 0);
  if (stuck.length > 0) {
    yield snap(
      'done',
      `The frontier emptied with ${stuck.length} node${stuck.length === 1 ? '' : 's'} never emitted: ${stuck.map((_, i) => label(stuck[i] as number)).join(', ')}. Every one of them still has an unemitted node pointing at it, so the graph has a cycle — an empty frontier before all nodes are out *is* the cycle detector, and it is why this algorithm doubles as one.`,
      {
        caption: `Partial order of ${output.length}`,
        ops,
        highlight: {
          answer: output.map((i) => ids[i] as NodeId),
          unvisited: stuck.map((i) => ids[i] as NodeId),
        },
        result: 'cycle',
        vars: { emitted: output.length, stuck: stuck.length, n },
      },
    );
    return;
  }

  yield snap(
    'done',
    `All ${n} nodes emitted, in ${ops} pop${ops === 1 ? '' : 's'}: [${output.map((i) => label(i)).join(', ')}]. Every edge points from an earlier position to a later one, which is the only property a topological order promises. It is not the *only* such order — the chain preset has exactly one, and the wide preset has astronomically many.`,
    {
      caption: `[${output.map((i) => label(i)).join(' ')}]`,
      ops,
      highlight: { answer: output.map((i) => ids[i] as NodeId) },
      result: 'sorted',
      vars: { emitted: output.length, stuck: 0, n, ops },
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

const JS = `function topologicalSort(adj) {
  // \`adj\` is the neighbour list built from { nodes, edges }: adj[u] holds the
  // nodes one edge *out of* u, as [node, weight] pairs. That is exactly what
  // Kahn's algorithm consumes, so the only thing worth building is the in-degree
  // table — one O(V+E) pass over every edge, before the traversal starts. The
  // weight is never read: a topological order is about precedence, not cost.
  const n = Object.keys(adj).length;
  const indeg = new Array(n).fill(0);
  for (let u = 0; u < n; u++) {
    for (const [v] of adj[u] ?? []) {                      // @anchor count-indegree
      indeg[v]++;
    }
  }
  const ready = [];
  const order = [];
  for (let v = 0; v < n; v++) {                          // @anchor seed
    if (indeg[v] === 0) ready.push(v);
  }
  while (ready.length > 0) {                             // @anchor take
    const u = ready.shift();
    order.push(u);                                        // @anchor emit
    for (const [v] of adj[u] ?? []) {                      // @anchor free
      if (--indeg[v] > 0) continue;                        // @anchor blocked
      ready.push(v);
    }
  }
  return order;                                            // @anchor done
}`;

const PY = `from collections import deque


def topological_sort(adj):
    # \`adj\` is the neighbour list built from { nodes, edges }: adj[u] holds the
    # nodes one edge *out of* u, as (node, weight) pairs. That is exactly what
    # Kahn's algorithm consumes, so the only thing worth building is the in-degree
    # table — one O(V+E) pass over every edge, before the traversal starts. The
    # weight is never read: a topological order is about precedence, not cost.
    n = len(adj)
    indeg = [0] * n
    for u in range(n):
        for v, _w in adj.get(u, []):                      # @anchor count-indegree
            indeg[v] += 1
    ready = deque()
    order = []
    for v in range(n):                                    # @anchor seed
        if indeg[v] == 0:
            ready.append(v)
    while ready:                                          # @anchor take
        u = ready.popleft()
        order.append(u)                                   # @anchor emit
        for v, _w in adj.get(u, []):                      # @anchor free
            indeg[v] -= 1
            if indeg[v] > 0:                              # @anchor blocked
                continue
            ready.append(v)
    return order                                          # @anchor done`;

const JAVA = `import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

class TopologicalSort {
    static int[] topologicalSort(List<List<int[]>> adj) {
        // adj.get(u) holds the nodes one edge *out of* u, as { node, weight }
        // pairs. That is exactly what Kahn's algorithm consumes, so the only
        // thing worth building is the in-degree table: one O(V+E) pass. The
        // weight is never read — a topological order is about precedence.
        int n = adj.size();
        int[] indeg = new int[n];
        for (int u = 0; u < n; u++) {
            for (int[] e : adj.get(u)) {                   // @anchor count-indegree
                indeg[e[0]]++;
            }
        }
        Deque<Integer> ready = new ArrayDeque<>();
        List<Integer> order = new ArrayList<>();
        for (int v = 0; v < n; v++) {                     // @anchor seed
            if (indeg[v] == 0) ready.add(v);
        }
        while (!ready.isEmpty()) {                         // @anchor take
            int u = ready.poll();
            order.add(u);                                  // @anchor emit
            for (int[] e : adj.get(u)) {                   // @anchor free
                int v = e[0];
                if (--indeg[v] > 0) continue;              // @anchor blocked
                ready.add(v);
            }
        }
        int[] out = new int[order.size()];                 // @anchor done
        for (int i = 0; i < order.size(); i++) out[i] = order.get(i);
        return out;
    }
}`;

const CPP = `#include <vector>
#include <queue>
#include <utility>
using std::vector;
using std::pair;
using std::queue;

vector<int> topological_sort(vector<vector<pair<int, int>>> adj) {
    // adj[u] holds the nodes one edge *out of* u, as { node, weight } pairs.
    // That is exactly what Kahn's algorithm consumes, so the only thing worth
    // building is the in-degree table: one O(V+E) pass. The weight is never read
    // — a topological order is about precedence, not cost. adj is taken by
    // value, so this is a copy and the caller's graph is never modified.
    int n = (int)adj.size();
    vector<int> indeg(n, 0);
    for (int u = 0; u < n; u++) {
        for (const auto& e : adj[u]) {                     // @anchor count-indegree
            indeg[e.first]++;
        }
    }
    queue<int> ready;
    vector<int> order;
    for (int v = 0; v < n; v++) {                          // @anchor seed
        if (indeg[v] == 0) ready.push(v);
    }
    while (!ready.empty()) {                                // @anchor take
        int u = ready.front();
        ready.pop();
        order.push_back(u);                                 // @anchor emit
        for (const auto& e : adj[u]) {                      // @anchor free
            int v = e.first;
            if (--indeg[v] > 0) continue;                   // @anchor blocked
            ready.push(v);
        }
    }
    return order;                                           // @anchor done
}`;

const NOTES = {
  'count-indegree': {
    javascript:
      'One counter per node, bumped once per edge, in a single pass over every edge before the traversal starts. This is the *only* structure the algorithm has to build: `adj[u]` already lists what `u` points at, and Kahn wants exactly that, so no reverse adjacency is needed. Rebuilding the in-degrees inside the loop instead would make it O(V·E) and would be a different, much worse algorithm.',
    python:
      '`indeg[v] += 1`, on a list of small ints because Python has no `int[]`. The weight in each `(node, weight)` pair is unpacked into `_w` and thrown away: a topological order is a precedence relation and has nothing to do with cost, which is worth saying because the same graph with weights is a shortest-path problem instead.',
    java: 'An `int[]` of counts, so there is no boxing and the array is contiguous. Note the driver hands over `List<List<int[]>>` — out-edges, exactly what Kahn consumes — so unlike the other three languages Java needs no reverse adjacency here either, and the whole setup is three lines rather than a page.',
    cpp: '`indeg[e.first]++` increments a vector *element*, not a pointer, so the count table is plain data that nothing can reallocate underneath. A `vector<vector<int>>` reverse adjacency would also work and would be wasted work: `adj[u]` is already the list of nodes that `u` releases, which is the direction Kahn consumes.',
  },
  seed: {
    javascript:
      'The initial frontier: every node with in-degree 0, collected in ascending node order. That ordering is not an accident of this listing — it is the tie-break, and it is what makes the output reproducible. Change the scan order and you get a different valid topological order, which is the honest answer to "which one is right?".',
    python:
      'A generator expression inside `deque(...)`, so the whole scan and the container build are one expression. `deque` rather than a list because `popleft()` on a list is O(n); here the frontier is small, but the habit is what stops this being O(V²) on a wide graph.',
    java: '`ArrayDeque` and a for-loop, because Java will not take a stream here without a boxing `.boxed()` and an `IntStream.of(0, n)` that reads worse than the loop. `deque.add(v)` is the O(1) tail insert; `LinkedList` would also be correct and is the other common choice.',
    cpp: '`std::queue<int>`, a thin adapter over a `std::deque` by default. The alternative — a `vector<int>` plus a head index — is often measurably faster and is what a performance-minded C++ programmer writes, but the queue adapter makes the algorithm legible, and legibility is the point of a listing.',
  },
  take: {
    javascript:
      '`shift()` off a plain array. In V8 the vacated slot is reused so this stays O(1), but relying on that is a portability assumption, not a guarantee — on a large DAG the idiomatic JavaScript is a head index into an array, or a `Deque`-like pair of pointers, exactly as the other three languages get from their standard containers.',
    python:
      '`popleft()`, which is the reason `deque` was imported. Note that `order` is a separate list from `ready`: `ready` drains to empty, `order` survives to the return, and conflating the two is the classic way to accidentally return an empty list.',
    java: '`poll()` returns the head and removes it in one call. `order.add(u)` boxes the node into the list, and the final loop unboxes the whole thing into an `int[]` — two conversions, and the reason the return type is the array rather than the list, so the verifier sees the same shape as the other three languages.',
    cpp: '`front()` then `pop()`, because `std::queue::pop` returns `void` — you are expected to read the head first. `order.push_back(u)` is the real output, growing by amortised reallocation; reserving `order.reserve(n)` up front would avoid the copies and is worth doing in production code for a graph of any size.',
  },
  emit: {
    javascript:
      'A node is written into the order and its badge is set to the slot it took. The invariant that makes the result correct is one-directional: every node already emitted points only at nodes not yet emitted. That is not a property of this loop, it is a property of having only ever released *in-degree-zero* nodes — which is why the whole algorithm can be four lines. Follow the badges downwards and you get a build order you can execute top to bottom.',
    python:
      'A node is appended to the order and its badge is set to the slot it took. The invariant that makes the result correct is one-directional: every node already emitted points only at nodes not yet emitted. That is not a property of this loop, it is a property of having only ever released *in-degree-zero* nodes — which is why the whole algorithm can be four lines. Follow the badges downwards and you get a build order you can execute top to bottom.',
    java: 'A node is written into the order and its badge is set to the slot it took. The invariant that makes the result correct is one-directional: every node already emitted points only at nodes not yet emitted. That is not a property of this loop, it is a property of having only ever released *in-degree-zero* nodes — which is why the whole algorithm can be four lines. Java sizes the array once, up front, from the node count, so a topological sort of an n-node graph allocates exactly one array of length n.',
    cpp: 'A node is written into the order and its badge is set to the slot it took. The invariant that makes the result correct is one-directional: every node already emitted points only at nodes not yet emitted. That is not a property of this loop, it is a property of having only ever released *in-degree-zero* nodes — which is why the whole algorithm can be four lines. The order is a `vector` sized once, so appending is amortised O(1) and there is no reallocation in the loop.',
  },
  free: {
    javascript:
      'Walk `u`\'s out-neighbours and drop each count — this is the one place the traversal does real work, and it is why Kahn needs no queue discipline beyond FIFO. `--indeg[v] > 0` uses the pre-decrement value, so the comparison reads "did it *not* reach zero", which is the negation a reader has to work for; the clearer spelling is `indeg[v]--; if (indeg[v] === 0) …`, and the two languages below have to write it the awkward way because they have no `--`.',
    python:
      'A statement then a separate `if`, which is exactly why this reads better than the JavaScript prefix decrement: Python has no `--`, so the two facts — the count fell, and it reached zero — are two lines. `adj.get(u, [])` is a dict lookup returning the existing list; nothing is copied.',
    java: '`adj.get(u)` is the out-edge list the driver built, so the inner loop is over exactly the nodes that `u` unblocks. Java has no `--` on its own statement, so the prefix decrement inside the `if` is the only one-line spelling available, and the evaluation order is what makes it correct: the decrement runs first and its old value feeds the comparison.',
    cpp: '`adj[u]` is the out-edge list, so the inner loop covers exactly the nodes waiting on `u`. `--indeg[v] > 0` is well defined because `indeg` is a `vector<int>`: a decrement on a `vector<bool>` bit-proxy would be its own adventure, and a `pair` field access has to be spelled `e.first` because the weight is `e.second`.',
  },
  blocked: {
    javascript:
      'The node still has prerequisites, so it does not join the frontier. This `continue` is the entire body of the loop iteration for a blocked node, which is why the post-decrement is safe to write inside the condition: nothing after the `if` would run for this `v` anyway.',
    python:
      'An explicit two-statement form, because `--` does not exist. The `continue` is doing real work — without it the code would fall through to the `append` and queue a node that is not ready, which produces an order that is wrong in a way no assertion is likely to notice until something downstream explodes.',
    java: 'Java has no `--` below Java 8, so the decrement is inside the comparison. The subtlety is evaluation order: `--indeg[v]` runs first and its old value feeds the comparison, so a node whose count is 1 goes to 0 and correctly falls through to `ready.add(v)`.',
    cpp: 'Same prefix-decrement trick, same ordering guarantee, and the same care needed: a `vector<bool>` here would be a bit-proxy and `--` on a proxy is a different piece of code entirely. The count is an `int` here precisely because it is decremented on every edge.',
  },
  done: {
    javascript:
      'The order, as node indices. On a DAG it has length n; on a graph with a cycle it is shorter, and that shortfall *is* the cycle detection — a frontier that empties before every node is out means a cycle among the leftovers, and no separate check is needed. The listing does not inspect the length because the caller can.',
    python:
      'A list of ints, which diffs directly against the other three languages. Returning `order` without checking its length is deliberate: the standard practice is to compare `len(order) == n` and report a cycle, and doing that silently inside the sort would hide the more interesting fact from the caller.',
    java: 'The `List<Integer>` is unboxed into an `int[]` on the way out. `int[]` is the right shape for a build order — the caller indexes it by step number — and it is also the only shape all four drivers serialise identically, so a `List<Integer>` here would show up as a parity failure rather than a formatting difference.',
    cpp: 'The returned `vector<int>` has no capacity guarantee worth relying on, and `order` was never reserved, so a large DAG pays for one or two reallocations. `order.reserve(n)` on the line above is the production version; it is omitted here because it is not part of the algorithm and a listing full of incidental tuning obscures the four lines that matter.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'topologicalSort',
    python: 'topological_sort',
    java: 'TopologicalSort.topologicalSort',
    cpp: 'topological_sort',
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
 * The claim is the emitted order as node indices.
 *
 * This is the one algorithm in the family whose answer is only *partly*
 * determined by the graph: whenever two nodes are simultaneously ready, either
 * order is valid. The tie-break that makes it reproducible is spelled out in
 * every listing — seed the frontier by scanning node indices ascending, and
 * drain it FIFO — so all four languages walk the same tie-break and land on the
 * same permutation.
 */
const EXPECTED: Record<string, number[]> = {
  'three-columns': [0, 1, 2, 3, 8, 4, 5, 7, 6],
  'four-columns': [0, 1, 2, 3, 5, 4, 7, 6],
  chain: [0, 1, 2, 3],
  wide: [0, 1, 2, 6, 7, 9, 3, 5, 4, 11, 8, 10],
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
    args: [{ nodes: ids.map((_, i) => i), edges }],
    result: EXPECTED[p.id] ?? [],
  };
});

export const topologicalSortAlgo: AlgoDef<GraphFrame> = {
  id: 'topological-sort',
  title: 'Topological Sort (Kahn)',
  category: 'graphs',
  summary:
    "Repeatedly emit any node with no unemitted in-edges, decrementing its successors' in-degree counts as it goes, until every node has an output position.",
  intuition:
    'Reach for a topological sort the moment something has to happen *after* something else and the "after" relation is acyclic: build systems resolving a target\'s dependencies, course or module prerequisites, task schedulers that must respect a partial order, spreadsheet recalculation, and any "resolve these imports" pass. Two things about it are worth internalising. First, it doubles as a cycle detector — a frontier that empties early means the graph is not a DAG, which is usually the answer you actually wanted. Second, the order is usually not unique, so if you need a *canonical* order you have to add a tie-break yourself (alphabetical, by priority, by longest path first) and that tie-break is a design decision, not a detail.',
  complexity: {
    best: 'O(V + E)',
    average: 'O(V + E)',
    worst: 'O(V + E)',
    space: 'O(V + E)',
    note: 'The extra space over a plain BFS is the transposed edge list, not the frontier: the frontier itself never exceeds V entries. Deterministic given a fixed tie-break, which is unusual for a graph algorithm and is what makes it testable.',
  },
  traits: {
    offline: true,
    tags: ['dag', 'scheduling', 'dependency-order', 'cycle-detection', 'in-degree'],
  },
  viewport: 'graph',
  level: 'intermediate',
  params: [],
  inputSpec,
  presets: PRESETS,
  run: topologicalSort,
  lesson,
  expectations,
  formatResult: (r) => `[${(r as number[]).join(', ')}]`,
  anchors: ['count-indegree', 'seed', 'take', 'emit', 'free', 'blocked', 'done'],
};

export default topologicalSortAlgo;
