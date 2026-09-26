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
 * Depth-First Search, iterative.
 *
 * Same seven lines of graph logic as `bfs.ts`, one different data structure. Put
 * a *stack* behind the traversal and the algorithm commits to a branch and
 * follows it to the end before coming back — which is why the `frontier` bar
 * here reads right-to-left instead of left-to-right, and why the `L` badges
 * below the nodes are recursion depths rather than levels.
 *
 * The iterative form is deliberate. The recursive version is the one everybody
 * writes first, and the reason to know the loop version is that the stack is
 * *visible*: the `frontier` array is literally the call stack, and on a
 * 100,000-node graph the recursive version is the one that runs out of JVM
 * stack before it runs out of memory.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 11;

/** A directed ring plus two chords — the same picture BFS gets, for contrast. */
const RING = ringGraph(SEED, 8, true);

/** Undirected, so every node has a way back and the "already seen" check earns its keep. */
const RING_UNDIRECTED = ringGraph(SEED + 8, 7, false);

/** Four columns of two, edges only rightwards: a DAG, so the recursion is a tree. */
const DAG = dagGraph(SEED + 12, 4, 2);

/**
 * Two components sharing one set of coordinates.
 *
 * Hand-built because the lesson is a negative one: a traversal that cannot reach
 * a node is not a slower traversal, it is a *different answer*. A generated
 * graph that happened to be disconnected would teach that by accident; this one
 * teaches it on purpose.
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
      'The exact input BFS gets first, so the two animations are comparable: BFS peels the ring off one layer at a time, DFS dives from 0 down the chord to 5 and backtracks. Same graph, same cost, different order.',
    input: graphInput(RING.nodes, RING.edges, { directed: true }),
    params: { start: 0 },
  },
  {
    id: 'undirected',
    label: 'Undirected ring',
    blurb:
      'Both directions of every edge, so the "already seen" test fires constantly. Watch the stack shrink: each backtrack is a pop, and each pop is one return from one level of the equivalent recursive call.',
    input: graphInput(RING_UNDIRECTED.nodes, RING_UNDIRECTED.edges, { directed: false }),
    params: { start: 2 },
  },
  {
    id: 'dag',
    label: 'DAG, 4 columns',
    blurb:
      'Edges only point right, so the depth-first walk is a clean dive with no backtracking at all. The `L` badge on each node is its recursion depth, and it only ever grows while you travel right.',
    input: graphInput(DAG.nodes, DAG.edges, { directed: true }),
    params: { start: 1 },
  },
  {
    id: 'islands',
    label: 'Two islands',
    blurb:
      'The stack empties with five nodes untouched. DFS is a reachability test exactly like BFS; only the *order* it reports in differs, so the set of visited nodes is always identical for the two.',
    input: graphInput(ISLANDS.nodes, ISLANDS.edges, { directed: true }),
    params: { start: 0 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

/**
 * Read the input once into the three things the animation needs: stable
 * coordinates, a traversal adjacency that follows every direction the input
 * lists, and a display edge list collapsed to one arc per pair (an undirected
 * edge is *one* edge; the doubled listing is an artefact of a flat edge array).
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
  for (const nd of src) nodes[nd.id] = { id: nd.id, x: nd.x, y: nd.y, label: nd.label };
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

export function* dfs(ctx: RunContext): Generator<GraphFrame> {
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
    // Bottom of the stack on the left, top on the right: the *right-hand* entry
    // is the one the next pop will take.
    frontier: stack.map((i) => ids[i] as NodeId),
    visited: order.map((i) => ids[i] as NodeId),
    layer: { ...depth },
    ...(o.caption === undefined ? {} : { caption: o.caption }),
    ...(o.ops === undefined ? {} : { ops: o.ops }),
    ...(o.vars === undefined ? {} : { vars: o.vars }),
    ...(o.highlight === undefined ? {} : { highlight: o.highlight }),
    ...(o.result === undefined ? {} : { result: o.result }),
  });

  const stack: number[] = [];
  /** The pop order, which is the algorithm's answer. */
  const order: number[] = [];
  const popped = new Set<number>();
  const depth: Record<NodeId, number> = {};
  /** Discovered, which is a *superset* of the popped set — the cycle guard. */
  const seen = new Set<number>();
  let ops = 0;

  /**
   * Discovered, waiting on the stack, or untouched — the three states partition
   * the graph, so a node is always drawn as one of `visited`, `frontier` or
   * `unvisited` and never falls through to the idle style.
   */
  const untouched = (): NodeId[] => ids.filter((_, i) => !popped.has(i) && !stack.includes(i));

  const start =
    n === 0 ? 0 : Math.min(Math.max(0, Math.round(Number(ctx.params.start ?? 0))), n - 1);

  yield snap(
    'start',
    n === 0
      ? 'The graph has no nodes at all, so there is nothing to explore. Done.'
      : `Nothing explored yet, and the stack is empty. DFS will push ${label(start)} and then commit to the first neighbour it finds, all the way down, before it ever comes back up.`,
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
  stack.push(start);
  depth[ids[start] as NodeId] = 0;

  yield snap(
    'push-start',
    `Mark ${label(start)} seen and push it. The stack now holds the whole pending work list — one entry per node the traversal still owes a visit to — and a pop always takes the *newest* of them, which is what makes the walk dive rather than spread.`,
    {
      caption: 'Stack depth 1',
      highlight: { frontier: [ids[start] as NodeId], unvisited: untouched() },
      vars: { u: label(start), depth: 0, depthMax: 1, visited: 0 },
    },
  );

  while (stack.length > 0) {
    if (ctx.shouldStop()) return;
    const u = stack.pop() as number;
    ops++;
    popped.add(u);
    order.push(u);
    const uId = ids[u] as NodeId;
    const d = depth[uId] ?? 0;
    const rest = stack.map((i) => ids[i] as NodeId);

    yield snap(
      'pop',
      `Pop ${label(u)} off the top of the stack — that is the return from the recursive call that discovered it, ${d} level${d === 1 ? '' : 's'} deep. Because the stack is LIFO, the next pop is ${rest.length > 0 ? `the neighbour of ${label(u)} we deferred` : `the neighbour of whoever pushed ${label(u)}`}, not a sibling: DFS commits to the branch it is on.`,
      {
        caption: `Stack depth ${rest.length}`,
        ops,
        highlight: { active: [uId], frontier: rest, unvisited: untouched() },
        vars: { u: label(u), depth: d, depthMax: rest.length, visited: order.length },
      },
    );

    for (const v of adj[u] ?? []) {
      if (ctx.shouldStop()) return;
      const vId = ids[v] as NodeId;
      if (seen.has(v)) {
        yield snap(
          'skip',
          `${label(u)} points at ${label(v)}, which is already explored, so there is no recursive call to make. Skipping it is what bounds the loop: each node is pushed at most once, so a cycle cannot spin the stack forever.`,
          {
            caption: `Stack depth ${rest.length}`,
            ops,
            highlight: { active: [uId], visited: order.map((i) => ids[i] as NodeId) },
            vars: { u: label(u), v: label(v), depth: depth[vId] ?? -1, visited: order.length },
          },
        );
        continue;
      }
      seen.add(v);
      stack.push(v);
      depth[vId] = d + 1;
      yield snap(
        'discover',
        `Push ${label(v)} at depth ${d + 1} and do not pop anything else first. Every other neighbour of ${label(u)} stays parked underneath it, so the traversal will exhaust ${label(v)}'s whole subtree before it ever looks at them. That is the entire difference from BFS, which would have put ${label(v)} at the *back* of a queue behind all of ${label(u)}'s other neighbours.`,
        {
          caption: `Stack depth ${stack.length}`,
          ops,
          highlight: {
            frontier: stack.map((i) => ids[i] as NodeId),
            visited: order.map((i) => ids[i] as NodeId),
            unvisited: untouched(),
          },
          vars: {
            u: label(u),
            v: label(v),
            depth: d + 1,
            depthMax: stack.length,
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
      ? `The stack is empty and every one of the ${n} nodes has been visited, so the walk covered the whole graph.`
      : `The stack is empty but ${missed.length} node${missed.length === 1 ? '' : 's'} never got pushed: ${missedIds.map((_, i) => label(missed[i] as number)).join(', ')}. An empty stack means there is no unexplored neighbour of anything reached, which is the definition of "these are all the reachable nodes".`,
    {
      ops,
      highlight: { visited: order.map((i) => ids[i] as NodeId), unvisited: missedIds },
      result: missed.length === 0 ? 'complete' : 'partial',
      vars: { visited: order.length, missed: missed.length, n },
    },
  );

  yield snap(
    'done',
    `DFS visited ${order.length} of ${n} nodes in ${ops} pop${ops === 1 ? '' : 's'}. The order is [${order.map((i) => label(i)).join(', ')}] — a depth-first sequence, not a hop-sorted one. Compare it with BFS on the same graph: the *set* of visited nodes is identical, only the sequence differs, and that sequence is a DFS of the graph rather than a ranking of it.`,
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

const JS = `function dfs(adj, start) {
  // \`adj\` is the neighbour list built from { nodes, edges }: adj[u] holds every
  // node one hop from u, in edge order, as [node, weight] pairs. DFS ignores
  // the weight, exactly as BFS does; the two differ only in the container.
  const n = Object.keys(adj).length;
  const seen = new Array(n).fill(false);
  const order = [];
  const stack = [start];                                  // @anchor start
  seen[start] = true;                                     // @anchor push-start
  while (stack.length > 0) {                              // @anchor exhausted
    const u = stack.pop();                                // @anchor pop
    order.push(u);
    // The weight is destructured away: DFS follows edges, it does not pay them.
    for (const [v] of adj[u] ?? []) {
      if (seen[v]) continue;                              // @anchor skip
      seen[v] = true;                                     // @anchor discover
      stack.push(v);
    }
  }
  return order;                                           // @anchor done
}`;

const PY = `def dfs(adj, start):
    # \`adj\` is the neighbour list built from { nodes, edges }: adj[u] holds every
    # node one hop from u, in edge order, as (node, weight) pairs.
    n = len(adj)
    seen = [False] * n
    order = []
    stack = [start]                                       # @anchor start
    seen[start] = True                                    # @anchor push-start
    while stack:                                          # @anchor exhausted
        u = stack.pop()                                   # @anchor pop
        order.append(u)
        # The weight is unpacked and ignored: DFS follows edges, it does not pay them.
        for v, _w in adj.get(u, []):
            if seen[v]:
                continue                                  # @anchor skip
            seen[v] = True                                # @anchor discover
            stack.append(v)
    return order                                          # @anchor done`;

const JAVA = `import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

class Dfs {
    static int[] dfs(List<List<int[]>> adj, int start) {
        // adj.get(u) is the neighbour list built from { nodes, edges }: every
        // node one hop from u, in edge order, as { node, weight } pairs.
        int n = adj.size();
        boolean[] seen = new boolean[n];
        List<Integer> order = new ArrayList<>();
        Deque<Integer> stack = new ArrayDeque<>();        // @anchor start
        stack.push(start);
        seen[start] = true;                                // @anchor push-start
        while (!stack.isEmpty()) {                        // @anchor exhausted
            int u = stack.pop();                           // @anchor pop
            order.add(u);
            // The weight is read into e[0]'s sibling and ignored.
            for (int[] e : adj.get(u)) {
                int v = e[0];
                if (seen[v]) continue;                     // @anchor skip
                seen[v] = true;                            // @anchor discover
                stack.push(v);
            }
        }
        int[] out = new int[order.size()];                 // @anchor done
        for (int i = 0; i < order.size(); i++) out[i] = order.get(i);
        return out;
    }
}`;

const CPP = `#include <vector>
#include <utility>
#include <stack>
using std::vector;
using std::pair;
using std::stack;

vector<int> dfs(vector<vector<pair<int, int>>> adj, int start) {
    // adj[u] is the neighbour list built from { nodes, edges }: every node one
    // hop from u, in edge order, as { node, weight } pairs. adj is taken *by
    // value*, so this is a copy and the caller's graph is never modified.
    int n = (int)adj.size();
    vector<bool> seen(n, false);
    vector<int> order;
    stack<int> s;                                         // @anchor start
    s.push(start);
    seen[start] = true;                                    // @anchor push-start
    while (!s.empty()) {                                   // @anchor exhausted
        int u = s.top();                                   // @anchor pop
        s.pop();
        order.push_back(u);
        // The weight is bound to e and ignored: DFS follows edges, it does not pay them.
        for (const auto& e : adj[u]) {
            int v = e.first;
            if (seen[v]) continue;                         // @anchor skip
            seen[v] = true;                                // @anchor discover
            s.push(v);
        }
    }
    return order;                                          // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'A JavaScript array used as a LIFO stack: `push` and `pop` are both O(1) amortised, and `pop` takes from the *end*. That is the only difference from the BFS listing — the array type never changes, only which end you read.',
    python:
      'A plain Python list is already the right structure: `append` and `pop()` are amortised O(1) and `pop()` takes from the end. Python has no dedicated stack type, which is a genuine advantage of the language here — there is nothing to choose wrongly.',
    java: '`ArrayDeque` is the interface for *both* the stack and the queue; only the two method names differ (`push`/`pop` versus `add`/`poll`). Using one type for both is worth internalising: it is the same object with a different discipline applied, which is exactly the BFS-versus-DFS point.',
    cpp: "`std::stack<int>` is an adapter, not a container — by default it wraps a `std::deque`, and `top()`/`pop()` are O(1). A `vector<int>` with `push_back`/`back()` would be faster in practice because the elements stay contiguous, at the price of the adapter's cleaner interface.",
  },
  'push-start': {
    javascript:
      'Seen *before* the loop, not on pop. This is the whole cycle guard: each node is pushed at most once, so the stack can never grow without bound, and the loop is guaranteed to terminate on a cyclic graph.',
    python:
      '`seen[start] = True` is the entire visited set. Doing it on push rather than on pop is what makes each node appear in `order` at most once, and therefore what makes the traversal O(V + E) rather than exponential.',
    java: 'Java arrays are fixed size but their elements are mutable, so `boolean[] seen` is the cheapest visited set available. The `Deque` boxes every `int` into an `Integer`, which is an allocation per push; `int[]` plus a head index avoids it on hot paths.',
    cpp: '`vector<bool>` is bit-packed, so 1 bit per node rather than 1 byte. It is the idiomatic visited set and also the least obvious: `vector<bool>` hands back a proxy reference rather than a `bool&`, so `auto& x = seen[i]` will not compile.',
  },
  exhausted: {
    javascript:
      'The loop condition is the termination proof. Each iteration pops exactly one node and pushes at most degree(u), and no node is ever pushed twice, so the stack strictly shrinks over a full traversal and cannot spin on a cycle.',
    python:
      '`while stack:` is the emptiness test — a list is falsy when it is empty, so no `len()` call is needed. Contrast with the `deque` in the BFS listing: same loop shape, same `while`, completely different traversal order.',
    java: '`isEmpty()` rather than `size() == 0`: the JDK contract lets an implementation make `isEmpty` cheaper, and it reads as the question it is. `ArrayDeque` forbids nulls, so `pop()` can never hand back an ambiguous null.',
    cpp: '`std::stack` exposes only `top`, `pop`, `push` and `empty` — no indexing, no iteration, no size in the common interface. That restriction is the point: it is impossible to accidentally treat the stack as a queue and read the wrong end.',
  },
  pop: {
    javascript:
      '`pop()` removes and returns the *last* element, i.e. the most recently pushed one. On a graph that means the deepest unexplored branch wins, which is the whole reason a depth-first order comes out at all.',
    python:
      '`pop()` with no argument pops the end of the list. `pop(0)` would pop the front and silently turn this into BFS with O(n) cost — the single most common bug in a hand-written DFS, because the two differ by one character.',
    java: '`pop()` is `Deque.pop`, the mirror of `push`. Taking `top()` first and `pop()` second would also work, and would be two calls where one does; on a `Stack` (the older class) `pop` is *not* declared, which is why `ArrayDeque` is preferred.',
    cpp: '`top()` then `pop()` because `std::stack` has no `pop` that returns a value — `pop` is `void` and you are expected to read `top()` first. Copy the value out before popping, never hold a reference across the pop.',
  },
  skip: {
    javascript:
      'The neighbour is already explored, so no recursive call is made. This bound is the reason the traversal is linear: a node with three parents is still pushed once, and its other two edges are read and discarded.',
    python:
      'Nothing to do. Note that skipping is what stops the classic bug in the *recursive* version, where forgetting the visited test makes a cycle recurse until the stack overflows — here the same test is the `seen` array.',
    java: 'The `continue` skips only the rest of the loop body; the enhanced-for has already bound `e` for this iteration. It is the same control flow as every other language — Java has no `goto`-free way to skip a for-each body, but `continue` does exactly what is needed.',
    cpp: "The range-based `for` has already produced a reference to `e` inside the local copy of `adj`, so reading `e.first` cannot touch the caller's graph. `continue` jumps to the next iteration, leaving the reference to die at the end of this scope.",
  },
  discover: {
    javascript:
      'Push and move on — no inner loop, no recursion, no "handle this neighbour fully before the next one". Every other neighbour of `u` is now buried under `v` on the stack, and none of them will be looked at until `v`\'s entire subtree is exhausted. That is the whole algorithm.',
    python:
      'Python has no fused assignment here worth writing, but note what is *absent*: no `for` around the body. Recursion would call `dfs(v)` and finish that subtree before returning; pushing defers the subtree and returns immediately, which is the iterative transliteration of the same thing.',
    java: '`push` is `ArrayDeque.push` = `addFirst`, the O(1) head insert. Java cannot put a frame on the stack for you, so this line *is* the recursive call: everything `dfs(v)` would have done before recursing happens here, and the rest happens when `v` is popped.',
    cpp: '`s.push(v)` is the iterative stand-in for `dfs(v)`. The value of the explicit `std::stack` is not performance but visibility: the stack is a real object you can inspect, which a recursive call stack in C++ is not — there is no portable way to read one, and at 100,000 nodes deep the real one is a segfault anyway.',
  },
  done: {
    javascript:
      'The return value is the pop order, and it is *not* sorted by anything intrinsic to the graph — it is an artefact of the order neighbours happened to sit in the adjacency list. Two implementations that build the adjacency in a different order will return different sequences and both be correct.',
    python:
      'A list of ints, so the harness can diff it against the other three languages directly. A Python generator would stream the same values without the list, but the verifier needs a value it can compare, so the list is materialised and returned.',
    java: 'The `List<Integer>` is unboxed into an `int[]` before returning, because a boxed list and a primitive array do not produce the same JSON in every driver. The array form is also what a consumer wants: a `dfsOrder[]` indexed by node.',
    cpp: 'The returned `vector<int>` is the visit order, not the stack — the stack has been emptied by the loop. Returning the stack would hand back an empty vector, which is a mistake worth naming because prose calls both of them "the stack".',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'dfs',
    python: 'dfs',
    java: 'Dfs.dfs',
    cpp: 'dfs',
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
 * The claim is the pop order as node indices. Node indices are the positions the
 * `graph` glue maps, and the edge weight is 1 because neither traversal pays
 * attention to cost.
 */
const EXPECTED: Record<string, number[]> = {
  ring: [0, 2, 5, 6, 7, 3, 4, 1],
  undirected: [2, 5, 6, 0, 4, 3, 1],
  dag: [1, 3, 5, 7, 6],
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

export const dfsAlgo: AlgoDef<GraphFrame> = {
  id: 'dfs',
  title: 'Depth-First Search',
  category: 'graphs',
  summary:
    'Follow one branch of the graph as far as it goes before backing up, using a stack, so the visit order traces whole subtrees rather than layers.',
  intuition:
    'Reach for DFS when the *structure* of the walk is the answer, not its length: cycle detection, topological sort (via finish times), strongly connected components, bridge and articulation points, maze and puzzle solving where you want to commit to a corridor, and "is this graph bipartite". It is also the traversal underneath union-find-free maze generation and every flood-fill. Unlike BFS it tells you nothing useful about distance, so if the question is "how far away" you want the queue version instead; unlike a recursive DFS it will not overflow the call stack on a long path, which is why the explicit-stack form is the one worth memorising.',
  complexity: {
    best: 'O(V + E)',
    average: 'O(V + E)',
    worst: 'O(V + E)',
    space: 'O(V)',
    note: 'Same bound as BFS, and it holds on every input: each node is pushed once, each edge is read once. The stack can be as deep as the graph is long, which is the only practical difference — the recursive version stores the same thing in the machine stack instead.',
  },
  traits: { offline: true, tags: ['traversal', 'stack', 'cycle-detection', 'unweighted'] },
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
      help: 'Node index, clamped to the graph. The visit order depends on it, so the traversal can look completely different from a different seat.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: dfs,
  lesson,
  expectations,
  formatResult: (r) => `[${(r as number[]).join(', ')}]`,
  anchors: ['start', 'push-start', 'exhausted', 'pop', 'skip', 'discover', 'done'],
};

export default dfsAlgo;
