import { byLanguage } from '../../code/anchors.ts';
import { graphInput, weightedGraph } from '../../input/generators.ts';
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
 * A*, which is Dijkstra with a guess bolted onto the queue key.
 *
 * Dijkstra expands whichever node has the smallest known cost *from the start*.
 * A* expands whichever node has the smallest `g + h`, where `g` is the cost already
 * paid and `h` is a guess at the cost still to come. On a map that guess is the
 * crow-flies distance, and the effect is dramatic: the search walks towards the
 * goal instead of fanning out in every direction at once.
 *
 * The whole teaching content of this module is a trade-off with two halves that
 * pull against each other:
 *
 *  - **A better `h` expands fewer nodes.** Every node whose `g + h` exceeds the
 *    optimal cost is one the search never has to touch, so an informed estimate is
 *    worth real money. That is the `corridor` preset, and it is the money shot.
 *  - **A better `h` costs more per node, and an inadmissible one breaks the
 *    answer.** The estimate is computed for every discovered node, and if it ever
 *    *overestimates*, the greedy step stops being sound and the returned cost is
 *    wrong — silently, with no exception anywhere. That is the worst failure mode
 *    an algorithm has, which is why every weight here is built by `span()`.
 *
 * `span(a, b, detour)` returns `ceil(hypot(dx, dy)) + detour` with `detour >= 0`,
 * so no edge is ever cheaper than the ground between its endpoints and therefore
 * no route through it can beat the straight line. That single helper makes the
 * Euclidean heuristic admissible *by construction* rather than by promise, and it
 * is why these presets are hand-built: `weightedGraph` and `ringGraph` produce
 * weights of 1..9 across a 1000-unit drawing box, so an edge of weight 1 can span
 * 800 units of map and the estimate would be wildly inadmissible. Clamping `h`
 * afterwards to hide that would be a lie about what the algorithm computes.
 *
 * The `snare` preset then shows the honest failure mode: an estimate that is
 * admissible and still useless, promising 198 units to a node whose true
 * remaining cost is infinite. Being wrong in *that* direction is the only safe way
 * to be wrong, and the price is expansions rather than a wrong answer.
 *
 * `dijkstra.ts` is the sibling to read first. The relaxation is identical; the
 * differences are the queue key, the early exit, and the fact that the key has a
 * guess mixed into it.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

/**
 * Undirected weights need both directions in a flat edge list, exactly as in
 * `dijkstra.ts`, so the four language implementations receive the doubled list
 * and therefore see the same traversal the animation shows.
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

/** Nodes with ids `n0..` in the order given, laid out by hand. */
function nodesAt(coords: Array<[number, number]>): AlgoGraphNode[] {
  return coords.map(([x, y], i) => ({ id: `n${i}`, label: String(i), x, y }));
}

/**
 * An edge weight that keeps the heuristic admissible.
 *
 * `ceil(hypot(dx, dy))` is the cheapest conceivable way to get between two points,
 * so any weight at or above it cannot make a straight-line estimate optimistic.
 * The `detour` term is the interesting half: it models a road longer than the
 * ground it crosses, which is what makes the heuristic *inaccurate* without making
 * it inadmissible. A detour of 900 on a 200-unit hop is a road nine times the
 * crow-flies cost, and the search will not use it while a straighter one exists.
 */
const span = (a: AlgoGraphNode, b: AlgoGraphNode, detour = 0): number =>
  Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)) + detour;

/**
 * Build a graph from coordinates and index pairs, with every weight from `span`.
 *
 * `links` is a list of `[i, j, detour?]`. Hand-built rather than generated because
 * of the admissibility precondition above, not because hand-building is nicer.
 */
function build(
  coords: Array<[number, number]>,
  links: Array<[number, number, number?]>,
): { nodes: AlgoGraphNode[]; edges: AlgoGraphEdge[] } {
  const nodes = nodesAt(coords);
  const edges = links.map(([i, j, detour]) => ({
    from: `n${i}`,
    to: `n${j}`,
    directed: false,
    weight: span(nodes[i] as AlgoGraphNode, nodes[j] as AlgoGraphNode, detour ?? 0),
  }));
  return { nodes, edges };
}

/**
 * The money shot: a 4x4 lattice whose diagonal is a motorway and everything off it
 * is a mountain road.
 *
 * Coordinates are `100 + 200 * index` on both axes, so the main diagonal is exactly
 * the straight line from the start to the goal and every diagonal hop is
 * `ceil(hypot(200, 200)) = 283`. Every orthogonal hop is `200 + 900 = 1100`: four
 * times the cost of a diagonal hop for a fifth of the ground.
 *
 * Because the diagonal is the line the heuristic measures, `f` along it barely
 * moves — 848.5, 848.7, 848.8, 849.0 — while every off-diagonal neighbour lands
 * above 1800 and simply never gets expanded. The search cannot help but walk the
 * diagonal. Dijkstra on this same graph expands all sixteen nodes, because it has
 * no way to know which way the goal lies.
 */
const CORRIDOR = build(
  [
    [100, 100],
    [300, 100],
    [500, 100],
    [700, 100],
    [100, 300],
    [300, 300],
    [500, 300],
    [700, 300],
    [100, 500],
    [300, 500],
    [500, 500],
    [700, 500],
    [100, 700],
    [300, 700],
    [500, 700],
    [700, 700],
  ],
  [
    // The diagonal, pointing straight at the goal: no detour.
    [0, 5, 0],
    [5, 10, 0],
    [10, 15, 0],
    // Every orthogonal neighbour of every node that has one, at nine times the
    // ground it covers.
    ...Array.from({ length: 15 }, (_, i) => i).flatMap((i) => {
      const out: Array<[number, number, number]> = [];
      if (i % 4 < 3) out.push([i, i + 1, 900]);
      if (Math.floor(i / 4) < 3) out.push([i, i + 4, 900]);
      return out;
    }),
  ],
);

/**
 * Three routes of exactly equal cost, and a three-way tie on `f` to break.
 *
 * Start and goal are 800 apart on a horizontal line. The two side nodes sit on the
 * perpendicular bisector at `(500, 200)` and `(500, 800)`, each exactly
 * `hypot(400, 300) = 500` from both ends, so routing through either costs
 * `500 + 500 = 1000`. The direct edge is 800 of ground plus a 200 detour, so it
 * also costs 1000.
 *
 * That makes the very first decision a genuine three-way tie on `f = 1000`, with
 * the goal itself one of the candidates: `g(goal) = 1000` and `h(goal) = 0` sum to
 * the same 1000 as `500 + 500` for a side node. The ordering has to break that
 * somehow. This one falls back to `g` and then to the node index, so the side
 * nodes go first and the goal third — and nothing is unfair, because three routes
 * cost the same and any of them is a correct answer.
 */
const PLATEAU = build(
  [
    [100, 500],
    [500, 200],
    [500, 800],
    [900, 500],
    [250, 50],
  ],
  [
    [0, 1, 0],
    [1, 3, 0],
    [0, 2, 0],
    [2, 3, 0],
    [0, 3, 200],
    [1, 4, 0],
  ],
);

/**
 * The trap: a straight shot at the goal that dead-ends, beside a real road that
 * detours around the block.
 *
 * The lure is nodes 1, 2 and 3. They run dead at the goal — node 2 sits 198 units
 * from it — so `h` is tiny and `f` says the search is about to arrive. It cannot
 * arrive: node 2 has no edge to the goal, its only other edge goes to the
 * cul-de-sac at node 3, and the true remaining cost from node 2 is infinite. The
 * real route is nodes 0 → 4 → 5, 800 units of motorway each way for 1600, which is
 * *worse* than every single step of the lure.
 *
 * This is the honest failure mode. The heuristic is admissible, so the answer is
 * still right; it is just wrong often enough to be useless locally, and the search
 * pays 160 units of `f` per step to discover that. It also draws the limit: no
 * heuristic over node coordinates can know that a cheap road is a dead end,
 * because that fact is not in the coordinates.
 */
const SNARE = build(
  [
    [100, 900],
    [500, 500],
    [760, 240],
    [880, 60],
    [100, 100],
    [900, 100],
    [100, 300],
  ],
  [
    [0, 1, 0],
    [1, 2, 0],
    [2, 3, 0],
    [0, 4, 0],
    [4, 5, 0],
    [0, 6, 900],
  ],
);

/**
 * No path, plus one node that is discovered expensively and then improved.
 *
 * A 3x3 lattice at `{100, 320, 540}` on both axes with node 8 in the far corner.
 * Every orthogonal hop costs `220 + 300 = 520` and the centre shortcut `0 → 4`
 * costs 312, but **no edge touches node 8 at all**. The goal is walled off, so the
 * search expands the eight reachable nodes, drains the queue and never gets to pop
 * it. That is the entire termination argument for the failure case: an unpopped
 * goal is not "nearly there", it is a proof that no path exists.
 *
 * The extra road `0 → 7` (492 of ground plus a 400 detour, so 892) exists to
 * manufacture a *second* bad queue entry. Node 7 is first reached that way at
 * `g = 892` and is then improved to 832 through the centre, so the old entry
 * survives in the queue as a duplicate and pops long after node 7 was closed.
 * Without it, A* on a reachable graph can never produce a stale pop at all, which
 * is a provable fact and gets its own note.
 */
const SPLIT = build(
  [
    [100, 100],
    [320, 100],
    [540, 100],
    [100, 320],
    [320, 320],
    [540, 320],
    [100, 540],
    [320, 540],
    [540, 540],
  ],
  [
    [0, 1, 300],
    [1, 2, 300],
    [3, 4, 300],
    [4, 5, 300],
    [6, 7, 300],
    [0, 3, 300],
    [1, 4, 300],
    [2, 5, 300],
    [3, 6, 300],
    [4, 7, 300],
    [0, 4, 0],
    [0, 7, 400],
  ],
);

/**
 * A seeded random graph, and the honest counter-example.
 *
 * `weightedGraph` gives a connected graph on a circle, which is the one shape
 * where a straight-line heuristic has nothing to say: nearly every edge is a long
 * chord, so the ground it crosses says almost nothing about the cost. The seeded
 * weight is kept as a *detour* (`60x`) rather than as the weight itself, which
 * both keeps the heuristic admissible and makes it nearly worthless. The run that
 * produces is A* expanding about as much as Dijkstra would, and that is the honest
 * headline: **A* is Dijkstra plus an estimate, and where the estimate is bad you
 * get Dijkstra's behaviour and Dijkstra's bill.**
 */
const ORGANIC_RAW = weightedGraph(47, 9);
const ORGANIC: { nodes: AlgoGraphNode[]; edges: AlgoGraphEdge[] } = {
  nodes: ORGANIC_RAW.nodes,
  edges: ORGANIC_RAW.edges.map((e) => {
    const a = ORGANIC_RAW.nodes.find((nd) => nd.id === e.from) as AlgoGraphNode;
    const b = ORGANIC_RAW.nodes.find((nd) => nd.id === e.to) as AlgoGraphNode;
    return { ...e, weight: span(a, b, 60 * (e.weight ?? 1)) };
  }),
};

const PRESETS: Preset[] = [
  {
    id: 'corridor',
    label: 'One corridor',
    blurb:
      'Sixteen nodes on a 4x4 lattice. The diagonal costs 283 a hop and every orthogonal hop costs 1100, so the search walks the diagonal and stops after four expansions. Dijkstra expands all sixteen here, because it has no idea which way the goal lies.',
    input: graphInput(CORRIDOR.nodes, bothWays(CORRIDOR.edges), {
      directed: false,
      weighted: true,
    }),
    params: { start: 0, goal: 15 },
  },
  {
    id: 'plateau',
    label: 'Three equal routes',
    blurb:
      'Three routes from 0 to 3, each costing exactly 1000, so the very first decision is a three-way tie on f. Nothing is settled by cost — the tie-break is — and the direct edge is the one left recorded as the predecessor, because the comparison is a strict <.',
    input: graphInput(PLATEAU.nodes, bothWays(PLATEAU.edges), {
      directed: false,
      weighted: true,
    }),
    params: { start: 0, goal: 3 },
  },
  {
    id: 'snare',
    label: 'The cheap dead end',
    blurb:
      'Nodes 1-3 head straight at the goal and dead-end 198 units short of it, so f looks wonderful and finds nothing at all. The real road is 0-4-5, 1600 the long way round. The answer is still right: an admissible heuristic is allowed to be wrong, just never in the direction that would make it optimistic.',
    input: graphInput(SNARE.nodes, bothWays(SNARE.edges), {
      directed: false,
      weighted: true,
    }),
    params: { start: 0, goal: 5 },
  },
  {
    id: 'split',
    label: 'Goal walled off',
    blurb:
      'Node 8 is the goal and nothing connects to it. All eight reachable nodes are expanded, the queue drains, and the goal is never popped — which is not "nearly there", it is a proof that no route exists. The road 0-7 also leaves a duplicate entry behind, so the stale pop Dijkstra pays for on every other graph actually happens here.',
    input: graphInput(SPLIT.nodes, bothWays(SPLIT.edges), {
      directed: false,
      weighted: true,
    }),
    params: { start: 0, goal: 8 },
  },
  {
    id: 'no-geometry',
    label: 'No useful geometry',
    blurb:
      'Nine nodes on a circle with chords between distant points and weights that are mostly detour. There is no geometry here for a straight-line guess to measure, so all nine nodes get expanded — exactly what Dijkstra would do on the same graph. A heuristic is only worth its cost on graphs that have the structure it measures.',
    input: graphInput(ORGANIC.nodes, bothWays(ORGANIC.edges), {
      directed: false,
      weighted: true,
    }),
    params: { start: 0, goal: 8 },
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

/** A cost is always a whole number of edge weights, so print it as one. */
const cost = (d: number): string => (Number.isFinite(d) ? String(d) : '∞');
/**
 * An estimate is not, so print one decimal.
 *
 * That is where the interesting differences live: along the `corridor` preset's
 * diagonal the four successive `f` values are 848.5, 848.7, 848.8 and 849.0, and
 * rounding to a whole number would collapse three of them into 849 and make the
 * search order look arbitrary when it is in fact the whole point.
 */
const est = (d: number): string => (Number.isFinite(d) ? d.toFixed(1) : '∞');

export function* aStarSearch(ctx: RunContext): Generator<GraphFrame> {
  const { ids, label, adj, edges, nodes } = read(ctx.input);
  const n = ids.length;
  const clamp = (v: number): number =>
    n === 0 ? 0 : Math.min(Math.max(0, Math.round(Number(v))), n - 1);
  const start = clamp(Number(ctx.params.start ?? 0));
  const goal = clamp(Number(ctx.params.goal ?? n - 1));

  /**
   * The heuristic: crow-flies distance from node `i` to the goal, in the same
   * units as the edge weights — which `span()` guarantees is a floor on the true
   * remaining cost, and that is the whole correctness argument.
   */
  const hOf = (i: number): number => {
    const a = nodes[ids[i] as NodeId] as GraphNode;
    const b = nodes[ids[goal] as NodeId] as GraphNode;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const h: number[] = ids.map((_, i) => (n === 0 ? 0 : hOf(i)));

  /** `g`: the best-known cost *from the start*. This is the badge the viewport draws. */
  const g: Record<NodeId, number> = {};
  for (const id of ids) g[id] = Number.POSITIVE_INFINITY;
  /**
   * The predecessor forest. Roots point at themselves and GraphView skips those, so
   * what gets drawn is exactly the set of links that justified a badge — including
   * the ones later improvements abandoned, which is the honest picture of a
   * heuristic search rather than just the final route.
   */
  const parent: Record<NodeId, NodeId> = {};
  for (const id of ids) parent[id] = id;
  const closed = new Set<number>();
  const order: number[] = [];
  interface Entry {
    f: number;
    g: number;
    v: number;
  }
  /** The open set, held as explicit (f, g, node) triples. */
  const heap: Entry[] = [];
  let pops = 0;

  /**
   * The total order. `f` first — that one word is the entire algorithm — then `g`
   * and the node index so that a tie is resolved the same way in every run and in
   * every language. Without those two fallbacks two nodes with equal `f` could be
   * expanded in either order, and a visualiser whose frames reorder themselves
   * between two identical inputs is worse than one that makes an arbitrary choice
   * and says so.
   */
  const cmp = (a: Entry, b: Entry): number => a.f - b.f || a.g - b.g || a.v - b.v;

  /** Every discovered node not yet expanded, in the order it will be popped. */
  const live = (): number[] => {
    const seen = new Set<number>();
    const out: number[] = [];
    for (const p of [...heap].sort(cmp)) {
      if (closed.has(p.v) || seen.has(p.v)) continue;
      seen.add(p.v);
      out.push(p.v);
    }
    return out;
  };

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
    // The frontier is printed lowest-f first rather than in raw heap order, so the
    // first entry is visibly the node the next frame will expand. The first frame
    // says so out loud, because it is a rendering choice and not something the
    // algorithm guarantees.
    frontier: live().map((i) => ids[i] as NodeId),
    visited: order.map((i) => ids[i] as NodeId),
    distance: { ...g },
    parent: { ...parent },
    ...(o.caption === undefined ? {} : { caption: o.caption }),
    ...(o.ops === undefined ? {} : { ops: o.ops }),
    ...(o.vars === undefined ? {} : { vars: o.vars }),
    ...(o.highlight === undefined ? {} : { highlight: o.highlight }),
    ...(o.result === undefined ? {} : { result: o.result }),
  });

  g[ids[start] as NodeId] = 0;

  yield snap(
    'start',
    n === 0
      ? 'The graph has no nodes, so there is nothing to search and nothing to estimate. Done.'
      : `${label(start)} starts at g = 0 and every other badge at ${cost(Number.POSITIVE_INFINITY)} — g is the distance *from the start*, the only half A* measures for certain. The other half is a guess: the straight-line distance to ${label(goal)}, in the same units as the edge weights, and ${label(goal)}'s own guess is 0 so its f equals its g exactly. Push the start with f = 0 + ${est(h[start] as number)}; the open set now holds every discovered but unexpanded node, printed lowest-f first, so the first entry is always the node the next frame expands.`,
    {
      caption: n === 0 ? 'Empty graph' : `${label(start)} → ${label(goal)}`,
      highlight:
        n === 0
          ? {}
          : {
              active: [ids[start] as NodeId],
              unvisited: ids.filter((_, i) => i !== start),
            },
      vars: { start: label(start), goal: label(goal), g: 0, h: est(h[start] as number), n },
    },
  );

  if (n === 0) {
    yield snap('done', 'Zero nodes means no route and no estimate, so the answer is -1.', {
      result: null,
      vars: { n, cost: -1 },
    });
    return;
  }

  // Pushed after the empty-graph exit above, deliberately: `ids[start]` is undefined
  // on an empty graph, so an entry in the open set would put `undefined` into the
  // frontier and the trace validator would (correctly) reject it.
  heap.push({ f: h[start] as number, g: 0, v: start });

  while (heap.length > 0) {
    if (ctx.shouldStop()) return;
    heap.sort(cmp);
    const entry = heap.shift() as Entry;
    pops++;
    const u = entry.v;
    const uid = ids[u] as NodeId;

    if (closed.has(u)) {
      yield snap(
        'skip-closed',
        `Pop ${label(u)} a second time carrying the stale g of ${cost(entry.g)}, while its badge already reads ${cost(g[uid] as number)} and that is final. The entry is a leftover: a later relaxation pushed a *second* copy and the first one never left the queue. It cannot change the answer — the strict comparison in the relaxation would refuse an update to a closed node anyway — so this frame is pure bookkeeping, the price of a heap that cannot fix a key in place.`,
        {
          caption: `Open ${live().length} · stale pop`,
          ops: pops,
          highlight: { frontier: live().map((i) => ids[i] as NodeId), settled: [uid] },
          vars: { u: label(u), stale: cost(entry.g), g: cost(g[uid] as number), pops },
        },
      );
      continue;
    }

    // The node with the lowest f, and the node it beat. This frame exists because
    // "why that one" is the whole question a student has about A*, and the answer
    // is two numbers rather than a theorem. The rival has to exclude the *same* node,
    // because a stale duplicate of it can still be sitting in the queue and comparing
    // 7 against 7 would be a meaningless thing to print.
    const rival = [...heap].sort(cmp).find((p) => !closed.has(p.v) && p.v !== u);

    yield snap(
      'f-score',
      `${label(u)} has the lowest f in the open set: g ${cost(entry.g)} plus an estimate of ${est(h[u] as number)} gives f ${est(entry.f)}. ${
        !rival
          ? 'It is the only candidate, so there is nothing to compare it against.'
          : est(rival.f - entry.f) === '0.0'
            ? `The best of the rest is ${label(rival.v)} at f ${est(rival.f)} — exactly the same f, so the ordering falls through to g and then to the node index to break the tie. Nothing is being decided on merit here, and that is fine: two nodes with the same f are equally promising, so either may be expanded first.`
            : `The best of the rest is ${label(rival.v)} at f ${est(rival.f)}, so ${label(u)} leads it by ${est(rival.f - entry.f)}.`
      } Dijkstra would have compared ${label(u)}'s g of ${cost(entry.g)} against the other candidates' g instead, and on these graphs the two rankings are not close to the same.`,
      {
        caption: `Open ${live().length + 1} · best f ${est(entry.f)}`,
        ops: pops,
        highlight: {
          frontier: live().map((i) => ids[i] as NodeId),
          compare: rival ? [ids[rival.v] as NodeId] : [],
        },
        vars: {
          u: label(u),
          g: entry.g,
          h: est(h[u] as number),
          f: est(entry.f),
          rival: rival ? label(rival.v) : 'none',
          rivalF: rival ? est(rival.f) : '-',
        },
      },
    );

    yield snap(
      'pop',
      `Expand ${label(u)}: it leaves the open set and joins the closed set, and g ${cost(entry.g)} becomes final. The greedy step is sound *here* for one reason only — h never overestimates, so no route through a node still unexpanded can cost less than f, and f is no better than the best f left in the queue. Make h optimistic and that argument disappears, and the cost this run returns is then simply wrong.`,
      {
        caption: `Expanded ${order.length + 1} of ${n}`,
        ops: pops,
        highlight: { active: [uid], frontier: live().map((i) => ids[i] as NodeId) },
        vars: { u: label(u), g: entry.g, h: est(h[u] as number), open: live().length, pops },
      },
    );

    closed.add(u);
    order.push(u);

    if (u === goal) {
      yield snap(
        'goal',
        `${label(goal)} is the minimum f in the open set, so it is *popped* — not merely reached, and that distinction is the algorithm rather than an optimisation. Reaching the goal only proves the best route found so far costs ${cost(g[uid] as number)}; some undiscovered route could still be cheaper. Popping it proves not, because admissibility guarantees every remaining candidate carries an f at least as large. So the search stops here, ${order.length} node${order.length === 1 ? '' : 's'} expanded and the other ${n - order.length} left untouched.`,
        {
          caption: `Goal popped at ${cost(g[uid] as number)}`,
          ops: pops,
          highlight: { answer: [uid], frontier: live().map((i) => ids[i] as NodeId) },
          result: uid,
          vars: {
            u: label(goal),
            g: entry.g,
            h: est(h[goal] as number),
            f: est(entry.f),
            open: live().length,
            pops,
          },
        },
      );
      break;
    }

    for (const e of adj[u] ?? []) {
      if (ctx.shouldStop()) return;
      const v = e.to;
      const vid = ids[v] as NodeId;
      const ng = (g[uid] as number) + e.w;
      const old = g[vid] as number;
      const hv = h[v] as number;

      yield snap(
        'relax',
        `Edge ${label(u)} → ${label(v)} costs ${e.w}. Routing it through ${label(u)} would put ${label(v)} at ${cost(g[uid] as number)} + ${e.w} = ${cost(ng)}, against a best known ${cost(old)}. ${ng < old ? 'Cheaper, so the badge is about to drop.' : 'Not cheaper, so nothing happens.'} The arithmetic is identical to Dijkstra's and the estimate is not consulted at all — which is the design: h only ever changes the order nodes come out of the queue in, never the cost of anything.`,
        {
          caption: `Expanding ${label(u)}`,
          ops: pops,
          highlight: {
            active: [uid],
            compare: [vid],
            frontier: live().map((i) => ids[i] as NodeId),
          },
          vars: { u: label(u), v: label(v), w: e.w, ng: cost(ng), old: cost(old), pops },
        },
      );

      if (ng < old) {
        g[vid] = ng;
        parent[vid] = uid;
        heap.push({ f: ng + hv, g: ng, v });
        yield snap(
          'tentative',
          `${label(v)} drops from ${cost(old)} to ${cost(ng)}, its predecessor becomes ${label(u)}, and a fresh queue entry goes in keyed on f = ${cost(ng)} + ${est(hv)} = ${est(ng + hv)}. That places it in the open set by the guess as well as the truth, which is how a node found the long way round can still be expanded before one found directly. The old entry, if there was one, is not removed — it stays until it pops and is thrown away.`,
          {
            caption: `Expanded ${order.length} of ${n}`,
            ops: pops,
            highlight: {
              relaxed: [vid],
              active: [uid],
              frontier: live().map((i) => ids[i] as NodeId),
            },
            vars: {
              u: label(u),
              v: label(v),
              ng: cost(ng),
              h: est(hv),
              f: est(ng + hv),
              open: live().length,
              pops,
            },
          },
        );
      }
    }
  }

  const found = closed.has(goal);

  if (!found) {
    yield snap(
      'no-path',
      `The open set drained with ${label(goal)} still unexpanded and its badge still ${cost(Number.POSITIVE_INFINITY)}. ${order.length} of ${n} nodes were expanded and not one of them reached the goal, and an empty queue says much more than "not found yet": every discovered node has been expanded, so nothing reachable from ${label(start)} is left. ${label(goal)} is in a different component, and no route to it exists at any cost. The answer is -1 rather than Infinity — no four languages agree on how to return one.`,
      {
        caption: `No path to ${label(goal)}`,
        ops: pops,
        highlight: { unvisited: ids.filter((_, i) => !closed.has(i)) },
        result: null,
        vars: { goal: label(goal), expanded: order.length, n, pops },
      },
    );
  }

  /**
   * Walk the predecessor chain back from the goal. Every link is an edge that some
   * relaxation actually took, so the chain is a real path whose weights sum to the
   * badge on the goal. That is not automatic: a predecessor written on the wrong
   * relaxation gives a chain that looks connected in the drawing and is not a path
   * in the graph, and a parity run cannot see that because all four listings would
   * agree on the wrong thing.
   */
  const chain: number[] = [];
  for (let v = goal, steps = 0; found && steps <= n; steps++) {
    chain.push(v);
    if (v === start) break;
    const p = parent[ids[v] as NodeId] as NodeId;
    v = ids.indexOf(p);
    if (v < 0) break;
  }
  const path = chain.slice().reverse();
  const pathIds = path.map((i) => ids[i] as NodeId);
  const finalCost = found ? (g[ids[goal] as NodeId] as number) : -1;

  /** Weight of the drawn edge between two adjacent path nodes, or null if absent. */
  const hop = (a: NodeId, b: NodeId): number | null => {
    const e = edges.find((x) => (x.from === a && x.to === b) || (x.from === b && x.to === a));
    return e?.weight ?? null;
  };
  const hopWeights: number[] = [];
  for (let k = 0; k + 1 < pathIds.length; k++) {
    const w = hop(pathIds[k] as NodeId, pathIds[k + 1] as NodeId);
    if (w !== null) hopWeights.push(w);
  }
  const chainTotal = hopWeights.reduce((a, b) => a + b, 0);
  const chainOk = hopWeights.length === Math.max(0, pathIds.length - 1);

  if (found) {
    yield snap(
      'reconstruct',
      `Follow the predecessors back from ${label(goal)}: ${path.map((i) => label(i)).join(' → ')}. ${path.length} node${path.length === 1 ? '' : 's'}, and ${chainOk ? `the edge weights along the chain add up to ${chainTotal}, which is the badge on ${label(goal)}` : 'and every hop is an edge the relaxation actually took'}. The dashed lines are the whole predecessor forest rather than just this route: every badge in the graph is justified by one of them, including the links an improvement later abandoned.`,
      {
        caption: `Path of ${path.length} nodes · cost ${cost(finalCost)}`,
        ops: pops,
        highlight: { path: pathIds, answer: [ids[goal] as NodeId] },
        result: ids[goal] as NodeId,
        vars: { hops: path.length, g: cost(finalCost), pops },
      },
    );
  }

  yield snap(
    'done',
    found
      ? `Cost ${cost(finalCost)} along ${path.length} hop${path.length === 1 ? '' : 's'}, whose weights sum to ${chainOk ? chainTotal : 'an unknown amount'} — the same number, and that equality is the only cross-check the reconstruction has. ${pops} pop${pops === 1 ? '' : 's'} and ${order.length} of ${n} node${order.length === 1 ? '' : 's'} expanded. The return puts the cost first and the route after, because the cost is the part the graph determines: when routes tie, which one is reported is an artefact of the tie-break, and a different valid run could report a different one.`
      : `No route to ${label(goal)}: ${order.length} node${order.length === 1 ? '' : 's'} expanded, ${pops} pop${pops === 1 ? '' : 's'}, and the answer is the single value -1. A* is not asked for a whole distance table here — it is asked one question about one node, and an unreachable goal makes that question unanswerable rather than infinite.`,
    {
      caption: found ? `Cost ${cost(finalCost)}` : 'No path',
      ops: pops,
      highlight: found
        ? { path: pathIds, settled: order.map((i) => ids[i] as NodeId) }
        : { settled: order.map((i) => ids[i] as NodeId) },
      result: found ? (ids[goal] as NodeId) : null,
      vars: found
        ? { hops: path.length, g: cost(finalCost), expanded: order.length, n, pops }
        : { expanded: order.length, n, cost: -1, pops },
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

const JS = `function aStar(adj, pos, start, goal) {
  // \`adj\` is the neighbour list built from { nodes, edges }: adj[u] holds every
  // [node, weight] pair one edge away from u, in edge order. \`pos[i]\` is the
  // [x, y] drawing coordinate of node i, and the heuristic is allowed to look at
  // nothing else.
  const n = Object.keys(adj).length;
  if (n === 0) return [-1];
  const dist = new Array(n).fill(Infinity);
  const cameFrom = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  // h = straight-line distance to the goal. It has to be an *under*-estimate or the
  // greedy step below stops being sound, which is why every weight in these presets
  // is at least the ground it crosses.
  const h = new Array(n);
  for (let i = 0; i < n; i++) {
    h[i] = Math.hypot(pos[i][0] - pos[goal][0], pos[i][1] - pos[goal][1]);
  }
  dist[start] = 0;                                        // @anchor start

  // JavaScript has no priority queue in the standard library, so here is a minimal
  // binary min-heap over [f, g, node] triples. \`cmp\` is the algorithm: order by f,
  // not by g, falling back to g and then the node index so a tie cannot reorder
  // between runs. Change a[0] to a[1] and this function is Dijkstra.
  //
  // It returns a *difference*, not a boolean, so every test below has to ask for a
  // sign. \`if (cmp(a, b)) break;\` is the bug this shape invites: any non-zero
  // number is truthy, so the test silently inverts, the heap becomes a max-heap, and
  // the search walks the most expensive route it can find. Nothing throws, the queue
  // stays a perfectly valid heap, and the only symptom is a too-large answer.
  //                                                       // @anchor f-score
  const heap = [];
  const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  const push = (item) => {
    heap.push(item);
    for (let i = heap.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (cmp(heap[i], heap[p]) >= 0) break;
      [heap[i], heap[p]] = [heap[p], heap[i]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      for (let i = 0; ; ) {
        let m = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < heap.length && cmp(heap[l], heap[m]) < 0) m = l;
        if (r < heap.length && cmp(heap[r], heap[m]) < 0) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m], heap[i]];
        i = m;
      }
    }
    return top;
  };

  push([h[start], 0, start]);
  while (heap.length > 0) {
    const [fu, gu, u] = pop();                            // @anchor pop
    if (done[u]) continue;                                // @anchor skip-closed
    done[u] = true;
    // Popping the goal, not arriving at it, is what makes the answer optimal: an
    // arrival only bounds the best route found so far. Stop before relaxing out.
    if (u === goal) break;                                 // @anchor goal
    for (const [v, w] of adj[u] ?? []) {
      const ng = gu + w;                                   // @anchor relax
      if (ng < dist[v]) {
        dist[v] = ng;                                      // @anchor tentative
        cameFrom[v] = u;
        push([ng + h[v], ng, v]);
      }
    }
  }
  // The queue emptied with the goal never popped, so every discovered node was
  // expanded and none of them reached it: a proof of no path, not a failure to look
  // hard enough.
  if (!done[goal]) return [-1];                           // @anchor no-path
  const path = [];                                         // @anchor reconstruct
  for (let v = goal; v !== -1; v = cameFrom[v]) path.unshift(v);
  // Cost first, path after. A bare -1 means "no route", which is a token all four
  // languages produce and Infinity is not.
  return [dist[goal], ...path];                            // @anchor done
}`;

const PY = `import heapq
import math


def a_star(adj, pos, start, goal):
    # \`adj\` is the neighbour list built from { nodes, edges }: adj[u] holds every
    # (node, weight) pair one edge away from u, in edge order. \`pos[i]\` is the
    # [x, y] drawing coordinate of node i, and the heuristic looks at nothing else.
    n = len(adj)
    if n == 0:
        return [-1]
    dist = [float("inf")] * n
    came_from = [-1] * n
    done = [False] * n
    # h = straight-line distance to the goal. It has to be an *under*-estimate or the
    # greedy step below stops being sound, which is why every weight in these presets
    # is at least the ground it crosses.
    h = [math.hypot(pos[i][0] - pos[goal][0], pos[i][1] - pos[goal][1]) for i in range(n)]
    dist[start] = 0                                        # @anchor start

    # heapq is a C-implemented min-heap and it compares *tuples* element by element, so
    # putting f first makes the whole ordering free: no comparator, no key function,
    # and the trailing node index makes ties deterministic for free. Change (ng, v) to
    # (v, ng) below and this function is Dijkstra.
    #                                                       // @anchor f-score
    heap = [(h[start], 0, start)]
    while heap:
        fu, gu, u = heapq.heappop(heap)                    # @anchor pop
        if done[u]:
            continue                                        # @anchor skip-closed
        done[u] = True
        # Popping the goal, not arriving at it, is what makes the answer optimal: an
        # arrival only bounds the best route found so far. Stop before relaxing out.
        if u == goal:
            break                                           # @anchor goal
        for v, w in adj.get(u, []):
            ng = gu + w                                    # @anchor relax
            if ng < dist[v]:
                dist[v] = ng                               # @anchor tentative
                came_from[v] = u
                heapq.heappush(heap, (ng + h[v], ng, v))
    # The queue emptied with the goal never popped, so every discovered node was
    # expanded and none of them reached it: a proof of no path, not a failure to look
    # hard enough.
    if not done[goal]:
        return [-1]                                        # @anchor no-path
    path = []                                              # @anchor reconstruct
    v = goal
    while v != -1:
        path.append(v)
        v = came_from[v]
    path.reverse()
    # Cost first, path after. A bare -1 means "no route", which is a token all four
    # languages produce and float("inf") is not.
    return [dist[goal]] + path                             # @anchor done`;

const JAVA = `import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.PriorityQueue;

class AStar {
    static int[] aStar(List<List<int[]>> adj, int[][] pos, int start, int goal) {
        // adj.get(u) holds every { node, weight } pair one edge away from u, and
        // pos[i] is the { x, y } drawing coordinate of node i.
        int n = adj.size();
        if (n == 0) return new int[] { -1 };
        int INF = Integer.MAX_VALUE;
        int[] dist = new int[n];
        Arrays.fill(dist, INF);
        int[] cameFrom = new int[n];
        Arrays.fill(cameFrom, -1);
        boolean[] done = new boolean[n];
        // h = straight-line distance to the goal, in double because the drawing
        // coordinates are. It has to be an *under*-estimate or the greedy step below
        // stops being sound, which is why every weight in these presets is at least
        // the ground it crosses.
        double[] h = new double[n];
        for (int i = 0; i < n; i++) {
            h[i] = Math.hypot(pos[i][0] - pos[goal][0], pos[i][1] - pos[goal][1]);
        }
        dist[start] = 0;                                   // @anchor start

        // PriorityQueue is a *min*-heap and the comparator is the algorithm: order by
        // f, not by g, then by g, then by the node index so a tie cannot reorder
        // between runs. Java has no tuple type before records, so a queue entry is a
        // double[] of { f, g, node } and every term of the comparison is spelled out.
        Comparator<double[]> byF = (a, b) -> {
            if (a[0] != b[0]) return Double.compare(a[0], b[0]);
            if (a[1] != b[1]) return Double.compare(a[1], b[1]);
            return Double.compare(a[2], b[2]);
        };
        PriorityQueue<double[]> heap = new PriorityQueue<>(byF);
        heap.add(new double[] { h[start], 0, start });    // @anchor f-score
        while (!heap.isEmpty()) {
            double[] top = heap.poll();                    // @anchor pop
            int u = (int) top[2];
            double gu = top[1];
            if (done[u]) continue;                          // @anchor skip-closed
            done[u] = true;
            // Popping the goal, not arriving at it, is what makes the answer optimal:
            // an arrival only bounds the best route found so far. Stop before relaxing
            // out of it.
            if (u == goal) break;                           // @anchor goal
            for (int[] e : adj.get(u)) {
                int v = e[0];
                // gu is an exact integer held in a double, so the cast below is a
                // no-op in practice: every real cost is a sum of integer weights.
                double ng = gu + e[1];                      // @anchor relax
                if (ng < dist[v]) {
                    dist[v] = (int) ng;                     // @anchor tentative
                    cameFrom[v] = u;
                    heap.add(new double[] { ng + h[v], ng, v });
                }
            }
        }
        // The queue emptied with the goal never popped, so every discovered node was
        // expanded and none of them reached it: a proof of no path, not a failure to
        // look hard enough.
        if (!done[goal]) return new int[] { -1 };           // @anchor no-path
        List<Integer> path = new ArrayList<>();             // @anchor reconstruct
        for (int v = goal; v != -1; v = cameFrom[v]) path.add(v);
        Collections.reverse(path);
        // Cost first, path after. A bare -1 means "no route", which is a token all
        // four languages produce and Integer.MAX_VALUE is not.
        int[] out = new int[path.size() + 1];
        out[0] = dist[goal];
        for (int i = 0; i < path.size(); i++) out[i + 1] = path.get(i);
        return out;                                         // @anchor done
    }
}`;

const CPP = `#include <vector>
#include <queue>
#include <cmath>
#include <utility>
#include <algorithm>
using std::vector;
using std::pair;
using std::priority_queue;
using std::greater;

vector<int> a_star(vector<vector<pair<int, int>>> adj, vector<vector<int>> pos,
                   int start, int goal) {
    // adj[u] holds every { node, weight } pair one edge away from u, and pos[i] is
    // the { x, y } drawing coordinate of node i. Both are taken by value, so these
    // are copies and the caller's graph is untouched.
    int n = (int)adj.size();
    if (n == 0) return { -1 };
    const int INF = 1 << 30;
    vector<int> dist(n, INF);
    vector<int> cameFrom(n, -1);
    vector<bool> done(n, false);
    // h = straight-line distance to the goal, in double because the drawing
    // coordinates are. It has to be an *under*-estimate or the greedy step below
    // stops being sound, which is why every weight in these presets is at least the
    // ground it crosses.
    vector<double> h(n);
    for (int i = 0; i < n; i++)
        h[i] = std::hypot(pos[i][0] - pos[goal][0], pos[i][1] - pos[goal][1]);
    dist[start] = 0;                                       // @anchor start

    // Entry is (f, (g, node)). std::greater on a pair is a lexicographic compare that
    // recurses into the inner pair, so this one line buys the f ordering *and* the
    // tie-break: no comparator object and no lambda. Drop greater<Entry> and
    // priority_queue is a **max**-heap, so the worst node would come out first and
    // the cost would be quietly wrong.
    using Entry = pair<double, pair<int, int> >;
    priority_queue<Entry, vector<Entry>, greater<Entry> > heap;
    heap.push({ h[start], { 0, start } });                 // @anchor f-score
    while (!heap.empty()) {
        Entry top = heap.top();                            // @anchor pop
        heap.pop();
        int u = top.second.second;
        double gu = top.second.first;
        if (done[u]) continue;                             // @anchor skip-closed
        done[u] = true;
        // Popping the goal, not arriving at it, is what makes the answer optimal: an
        // arrival only bounds the best route found so far. Stop before relaxing out.
        if (u == goal) break;                              // @anchor goal
        for (const auto& e : adj[u]) {
            int v = e.first;
            // gu is an exact integer held in a double, so the cast below is a no-op in
            // practice: every real cost is a sum of integer weights.
            double ng = gu + e.second;                     // @anchor relax
            if (ng < dist[v]) {
                dist[v] = (int) ng;                        // @anchor tentative
                cameFrom[v] = u;
                heap.push({ ng + h[v], { (int) ng, v } });
            }
        }
    }
    // The queue emptied with the goal never popped, so every discovered node was
    // expanded and none of them reached it: a proof of no path, not a failure to look
    // hard enough.
    if (!done[goal]) return { -1 };                        // @anchor no-path
    vector<int> path;                                      // @anchor reconstruct
    for (int v = goal; v != -1; v = cameFrom[v]) path.push_back(v);
    std::reverse(path.begin(), path.end());
    // Cost first, path after. A bare -1 means "no route", which is a token all four
    // languages produce and the INF sentinel is not.
    path.insert(path.begin(), dist[goal]);
    return path;                                           // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'One known number and a table of guesses. `dist` starts at `Infinity` rather than a sentinel, which is a real advantage here: `Infinity + w` is still `Infinity`, so the arithmetic below cannot overflow, and `Infinity` compares greater than every finite cost, so a node that has never been reached can never win a relaxation. The price is that `Infinity` is not JSON and serialises as `null`, which is why the answer converts it to -1 once on the way out rather than leaking a value the caller has to know about.',
    python:
      '`[float("inf")] * n` is the same decision as JavaScript\'s `Infinity` and for the same reason: `inf + w` is `inf`, and `inf` compares greater than any integer, so the guard against a sentinel overflow that Java and C++ both need simply does not exist in this language. `math.hypot` is the one import this function needs beyond `heapq`, and it is more accurate than writing the square root out by hand for no benefit a graph this size can measure.',
    java: '`Arrays.fill(dist, INF)` with `INF = Integer.MAX_VALUE`, and note the asymmetry with the two languages above: Java has no infinity in `int`, so the sentinel has to be fabricated. The halving that `dijkstra.ts` needs is *not* needed here, and the reason is worth stating rather than copying: nothing is ever added to a sentinel value, because `ng` is computed from a popped `gu` that is always a real path cost. `h` is a `double[]` because the drawing coordinates are, which is also why the queue entries are `double[]` rather than `int[]`.',
    cpp: '`1 << 30` is the sentinel, and `<limits>` is *not* in the include list the way it is in `dijkstra.ts`. Same reason as the Java above: `ng` comes from a popped `gu`, which is a real path cost, so the sentinel never reaches an addition and never needs headroom. That the same repository needs the halving trick in one algorithm and not the other is a difference worth noticing rather than a coincidence. `std::hypot` also avoids the intermediate overflow that `sqrt(dx*dx + dy*dy)` risks on large coordinates.',
  },
  'f-score': {
    javascript:
      'This comparator *is* A*. Change `a[0]` to `a[1]` and the function is Dijkstra — that one token is the whole distance between the two algorithms, which is why this file exists rather than a paragraph in the Dijkstra one. The two fallback terms are not decoration: without them two nodes with equal `f` could be expanded in either order, and a visualiser that reorders its own frames between two identical runs cannot be scrubbed back and forth. And note the *shape*: `cmp` returns a difference, so the sift tests have to ask for a sign. Writing `if (cmp(a, b)) break;` inverts them, because any non-zero number is truthy — the heap silently becomes a max-heap, the search walks the most expensive route it can find, and nothing throws. The hand-rolled loop exists only because JavaScript has no priority queue at all, not even a third-party one in the default install; the algorithm underneath never has to know it happened.',
    python:
      'There is no comparator to write, and that is the genuine difference between this language and the three beside it. `heapq` compares *tuples* element by element, so putting `f` in the leading slot makes the ordering free — no key function, no comparator — and putting the node index in the trailing slot makes the tie-break free as well. The same total order the JavaScript comparator spells out, arrived at by choosing a data shape instead of writing a function. What `heapq` does not offer is any way to change a key in place, which is what the stale-pop guard two anchors down is for.',
    java: "`PriorityQueue` hands over the ordering, so all that is left to write is the *rule*, and the rule is a three-term comparator: `f`, then `g`, then the node index. Java has no tuple type before records (Java 16), so a queue entry is a `double[]` of `{ f, g, node }` and every term of the comparison is spelled out by hand — the ceremony that Python's tuple and C++'s nested `pair` both get for free. The payoff is `add` and `poll` at O(log n) in a battle-tested heap, which is a better trade than the hand-rolled one the JavaScript listing is forced into.",
    cpp: '`greater<Entry>` on `pair<double, pair<int, int>>` is a lexicographic compare that recurses, so one line of template arguments delivers the `f` ordering *and* the tie-break. Two things go wrong silently here. Drop `greater<Entry>` and `priority_queue` is a **max**-heap, so the function would return the most expensive node first and produce a wrong answer with no error. Flatten the entry to `pair<double, int>` — the obvious thing to write — and there is nowhere to put `g`, so the free lexicographic order has to be replaced by a hand-written comparator.',
  },
  pop: {
    javascript:
      'The sift-down loop restores the heap property by promoting the smaller child and sinking the displaced element, in O(log n). Popping the minimum is the greedy choice, and it is sound only because `h` never overestimates: every node still queued carries an `f` at least as large as this one, and `h` is a floor on what is left to pay, so nothing cheaper can be hiding behind any of them. Substitute `gu` for `fu` in `less` and that argument stops being available — which is the difference between this function and Dijkstra, in four characters.',
    python:
      '`heappop` is C-implemented: it swaps the root to the end, re-heapifies and returns the old root, so O(log n) with no Python in the loop. The `fu, gu, u = heapq.heappop(heap)` unpack here and the `const [fu, gu, u] = pop()` above it are the same one line of work. Note the entry carries `g` as well as `f` precisely so the relaxation below can extend the path that was actually committed to, rather than re-reading a table a later improvement might have moved.',
    java: '`poll()` returns the head and removes it. The cast `(int) top[2]` is the cost of using a `double[]` as a tuple type: Java will not let a heterogeneous array exist, so the node index travels as a double and is read back out. A `record Node(int f, int g, int id)` with a `Comparator.comparingInt` chain is the modern spelling and it needs Java 16, which is why a driver this old cannot assume one — so the `double[]` stays, and the comment above it has to do the explaining that a record would do by being self-describing.',
    cpp: '`top()` returns a *reference* into the heap, so copying into `Entry top` matters twice over: the `pop()` on the next line would otherwise leave it dangling, and `pair` has no default constructor to move-assign into safely. Unpacking the nested pair into `u` and `gu` immediately is what keeps the rest of the function readable, and it is the same single line the other three languages hide inside a destructuring pattern.',
  },
  'skip-closed': {
    javascript:
      "A leftover copy of a node that was already expanded: the price of a heap that cannot fix a key in place. Worth knowing *when* it can happen here, because the answer is almost never. If the goal is reachable, admissibility guarantees every queue entry carries an `f` of at least the optimal cost, while a stale entry carries an `f` strictly larger than its own node's current one — so the goal is always popped first and a stale pop is unreachable. This frame only appears on runs where the goal is *not* reachable and there is no optimal cost to be bounded by. It cannot change the answer either way, which is exactly why the lazy heap is safe.",
    python:
      '`heapq` has no `decrease-key`, not because of Python but because it is a general-purpose library, so a stale entry is unavoidable in this shape. `if done[u]: continue` is the entire guard, and `continue` is the Python spelling of the JavaScript and Java one while C++ needs the loop body braced. The same line is a real cost in C++: `std::set` supports erasing a stale entry in O(log n), at the price of a sorted structure and losing the cheaper pop.',
    java: '`PriorityQueue` offers no key update at all and the JDK provides no `decreaseKey`. The alternatives are an indexed heap written by hand, or a lazy `TreeSet` that does support removal — both more code than the duplicates are worth at this scale. The guard is one line, and as the JavaScript note says, unreachable whenever the goal is reachable: the honest summary is that A* pays for the lazy heap only on the runs where it has nothing better to do anyway.',
    cpp: 'The same story as in Java, with one C++-specific escape hatch: `std::set<Entry>` is the one standard container that *does* support erasing a stale entry in O(log n), at the price of a sorted structure, so `pop` becomes `*begin()` plus `erase(begin())`. Most textbook C++ A* uses the duplicate-skipping version above, and on a reachable goal it is not even exercised.',
  },
  goal: {
    javascript:
      '`u === goal` after the pop and before the relaxation, never during it. This single line is the difference between A* and Dijkstra-with-an-extra-field, and it is a correctness difference rather than a speed one: arriving at the goal only proves the best route *so far* costs `dist[goal]`, while popping it proves nothing cheaper remains, because every unexpanded candidate carries an `f` no smaller. Dijkstra cannot make this exit and still be right — it has to expand every node — so the same code without this line would look fine on all four presets here and be wrong in general.',
    python:
      '`if u == goal: break` — Python needs no flag, no `found` variable and no early `return`, because `break` leaves the loop and control falls through to the reconstruction below. Returning the path directly would work too, but it would put the path-building in two places, and this function has exactly one place that builds a path.',
    java: 'The `break` also skips relaxing the goal\'s own edges, which is a small saving and not the point. The point is that `done[u]` is set *before* the test, so the `if (!done[goal])` guard below can tell "popped and stopped" from "the queue ran dry" with no extra state — and that distinction is the entire failure case.',
    cpp: 'The same `break`, and `<algorithm>` is in the include list for `std::reverse` rather than for anything on this line. Note it leaves the stale entries sitting in the heap, which is fine: the loop is over, and on a reachable goal the heap held nothing that mattered.',
  },
  relax: {
    javascript:
      '`gu + w` uses the *popped* cost rather than `dist[u]`, and for an expanded node the two are equal — but writing `gu` makes it obvious that this is the cost of the path that was actually committed to. `h` is not consulted anywhere on this line, and that is the design rather than an oversight: the estimate changes only the order nodes come out of the queue in, never the arithmetic of the graph. The comparison is strict, so an equal-cost alternative into the same node is ignored and the earlier predecessor stays recorded.',
    python:
      'One line, four languages, no surprises. The strict `<` is what the `plateau` preset is about: three routes cost exactly 1000, the second one to arrive is refused because it is not cheaper, and the recorded predecessor is whichever route the queue happened to try first. A `<=` would rewrite that predecessor for nothing and return a different — equally valid, equally long — path, which is the difference between pinning a path in a test and pinning the cost.',
    java: '`gu + e[1]`, where the `int[]` the driver builds for each edge is `{ node, weight }`: `e[0]` is the destination, `e[1]` the cost. The result is a `double` because `gu` is, and the cast back to `int` is a no-op — every real cost is a sum of integer weights, so it is exactly representable. That is a property of the input rather than of the arithmetic: a graph with fractional weights would need `double[] dist` and a different answer shape, because there would then be no whole-number cost for the four languages to agree on.',
    cpp: '`e.first` is the node and `e.second` is the weight — the opposite order from the nested `Entry` pair in the heap, which holds `(f, (g, node))` and reads `top.second.first` for `g`. Naming both roles at the point of use is the only defence against swapping them, and a swapped pair compiles cleanly and returns wrong costs. The nesting is the price of a free lexicographic tie-break; `struct Entry` with a hand-written `operator<` would be the alternative and would need the comparator spelled out.',
  },
  tentative: {
    javascript:
      'Two writes and a push: lower the recorded cost, then queue the new key. The old entry is *not* removed — that is the deliberate trade, and the stale-pop frame is what pays for it. In exchange both operations are O(log n) and the code stays four lines. Note the pushed key mixes a measured `ng` with a guessed `h`, and that mixture is the entire reason a node found the long way round can be expanded before one found directly: the queue is not ordered by cost from the start, and that is the only thing that has changed since Dijkstra.',
    python:
      '`dist[v] = nd` then `heappush`, and the pushed tuple is `(nd + h[v], nd, v)` — three slots, the first of which is a guess added to a fact. Python builds that tuple for free, and the same three-slot shape is what makes the tie-break in the comparator possible in the other three languages. `heapq` cannot change the key it already holds, so this duplicate is created on purpose rather than by accident.',
    java: 'This is where `PriorityQueue` bites hardest: `dist[v]` changes the *record* while the queue keeps a *copy* of the old key, and the JDK offers no way to fix the queued value. Pushing the duplicate and skipping it later is the standard, and it is why production Java A* often switches to a `TreeSet<Integer>` with explicit removal. `new double[] { ng + h[v], ng, v }` allocates a three-slot array on every relaxation, which the other three languages also do and which is the real per-node cost of a lazy heap.',
    cpp: '`dist[v] = (int) ng` plus one `push`. The nested `Entry` grows a `pair<int, int>` inside a `pair<double, ...>`, so a lazy heap allocates two objects per relaxation; an indexed heap with a `decreaseKey` would allocate none and would not need the stale-pop guard, at the cost of maintaining a position table per node. Most implementations are lazy, and this is that trade in three lines.',
  },
  'no-path': {
    javascript:
      'The goal was never popped, so the queue emptied first — and that says much more than "not found". Every discovered node was expanded, so nothing reachable from the start is left unexamined, which makes an unexpanded goal a statement about the graph rather than about the search. `-1` rather than `Infinity` because `Infinity` is not JSON and no four languages agree on how to return one; a one-element array rather than a bare number because the successful return is an array, and one convention for "no answer" beats a per-language shape difference.',
    python:
      "`return [-1]` before the reconstruction, so `dist[goal]` is never read while it is still `inf`. Python *could* return the `inf` and the harness would compare it numerically, but then Java and C++ would each have to fabricate a float infinity — one convention all four can produce beats a per-language convenience. The reason differs from Dijkstra's, which converts a whole table: here there is exactly one number to convert and it is doing a much larger share of the work.",
    java: '`new int[] { -1 }`, which keeps the return type `int[]` and so avoids smuggling a sentinel into the middle of the array where a caller might read it as a cost. `Integer.MAX_VALUE` was the internal sentinel and must never escape: a caller who forgot to check for it would read a plausible-looking cost of two billion and carry on.',
    cpp: '`return { -1 }`, a braced single-element vector. `1 << 30` was the internal sentinel and is converted once, here, on the way out; a `double`-typed version could use `std::numeric_limits<double>::infinity()` and skip the conversion entirely, at the cost of a return type that Java and Python could not match.',
  },
  reconstruct: {
    javascript:
      'Every step follows `cameFrom`, which was written on the relaxation that lowered a badge, so the chain is a real path in the graph and its edge weights sum to the cost on the goal. That is not automatic: a predecessor recorded on the wrong relaxation gives a chain that looks connected in the drawing and is not a path in the graph, and no parity run can see it, because all four listings would agree on the wrong thing. `unshift` builds the list in forward order without a second array, and the `-1` root sentinel is what stops the walk at the start.',
    python:
      '`while v != -1: path.append(v); v = came_from[v]` and then `reverse()`. Building backwards and reversing once is the other option, and it is worse for a list this short. A comprehension cannot express this loop at all, which is the honest difference between a chain walk and a range: the sequence being consumed is a successor table, not a set of indices.',
    java: '`ArrayList<Integer>` and then `Collections.reverse`, followed by a copy into an `int[]` because the return type is a primitive array — three collections for a list of five integers. That is the honest cost of Java: there is no way to return a boxed `List<Integer>` from a method whose other branch returns `int[]`, and the other branch is fixed by the harness. Filling an `int[]` back to front would avoid the `ArrayList` and the reverse entirely.',
    cpp: '`path.insert(path.begin(), dist[goal])` prepends the cost in one call, the C++ idiom for building a result in order without a second vector — and one of the few places the C++ is genuinely shorter than the JavaScript, which needs a spread to flatten the reconstruction. `std::reverse` is why `<algorithm>` is in the include list; the same header supplies `std::swap` in the hand-rolled heaps of the other algorithms.',
  },
  done: {
    javascript:
      'The cost first and the route after, which fixes the order the answer is read in and makes "no route" a one-element array rather than a differently shaped value. The spread flattens the reconstruction into the return in one step. What is deliberately *not* returned is the whole distance table Dijkstra returns: A* asked one question about one node, and answering more would mean expanding the entire graph, which is the thing the algorithm exists to avoid.',
    python:
      '`[dist[goal]] + path` concatenates two lists — the same shape as the JavaScript spread and the C++ `insert`, arrived at three different ways. A tuple or a dict would both be shapes the other three languages would have to imitate, so a flat list of integers is the only honest common denominator. Every element is a whole number, which is what lets the verifier compare numerically with a tolerance rather than string-matching a formatted table.',
    java: 'An `int[]` sized `path.size() + 1` and filled by two loops. `List<Integer>` would be shorter to build and impossible to return, because the no-route branch returns `int[]` and one return type has to cover both. That constraint is the same reason `bellman-ford.ts` returns a `String` rather than an array with a magic token inside it: one return type, and no sentinel a caller could mistake for data.',
    cpp: 'A `vector<int>` of the cost followed by the path, and `long long` would be the right element type for weights above 2^31 — the `1 << 30` sentinel is already a hint that this is an int-sized problem. `priority_queue` has thrown the insertion order away, which is fine: the order is not part of the answer, and recovering it would mean a second traversal for no gain.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'aStar',
    python: 'a_star',
    java: 'AStar.aStar',
    cpp: 'a_star',
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
 * The claim is `[cost, v0, v1, ...]`: the cheapest cost from `start` to `goal`,
 * then the route that got there. A bare `[-1]` means no route exists.
 *
 * The **costs** are not produced by the generator above. Each is the answer of a
 * deliberately naive Bellman-Ford — repeat "sweep every edge, lower whatever is
 * lower" until a whole sweep changes nothing, which is O(V*E) and bears no
 * resemblance to A*, so the two cannot share a bug. `bellman-ford.ts` in this same
 * directory is that idea with negative edges and a cycle check added, and it is
 * worth reading side by side with this file.
 *
 * The **path** is a different matter, and worth being honest about. Where several
 * routes cost the same — the `plateau` preset has three — the route is decided by
 * the tie-break rather than by the graph, so the cost is the real claim and the
 * path is pinned only because the four implementations and the generator all break
 * ties the same way. `a-star-search.test.ts` checks the path the harder way: that
 * it is a real chain of real edges whose weights sum to the cost, rather than
 * merely equal to the string below.
 */
const EXPECTED: Record<string, number[]> = {
  corridor: [849, 0, 5, 10, 15],
  plateau: [1000, 0, 3],
  snare: [1600, 0, 4, 5],
  split: [-1],
  'no-geometry': [2357, 0, 4, 8],
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const ids = (p.input.type === 'graph' ? p.input.nodes : []).map((nd) => nd.id);
  const at = new Map<NodeId, number>(ids.map((id, i) => [id, i]));
  const pos: Array<[number, number]> = [];
  for (const nd of p.input.type === 'graph' ? p.input.nodes : []) pos.push([nd.x, nd.y]);
  const edges: Array<[number, number, number]> = [];
  for (const e of p.input.type === 'graph' ? p.input.edges : []) {
    const u = at.get(e.from);
    const v = at.get(e.to);
    if (u === undefined || v === undefined) continue;
    edges.push([u, v, e.weight ?? 1]);
  }
  return {
    presetId: p.id,
    args: [
      { nodes: ids.map((_, i) => i), edges },
      pos,
      Number(p.params?.start ?? 0),
      Number(p.params?.goal ?? 0),
    ],
    result: EXPECTED[p.id] ?? [-1],
  };
});

export const aStarSearchAlgo: AlgoDef<GraphFrame> = {
  id: 'a-star-search',
  title: 'A* Search',
  category: 'graphs',
  summary:
    'Dijkstra with a guess mixed into the queue key: expand the node with the lowest g + h, where g is the cost already paid and h is a straight-line estimate of what is left, and stop the moment the goal is popped rather than merely reached.',
  intuition:
    'Reach for A* when you are searching a space that has geometry and a cheap way to guess how far is left: road networks with coordinates, tile maps, puzzle states with a move estimate, a state-space planner, a game AI asking how far the target is. Two preconditions nobody writes down. First, the guess must never be optimistic — overestimate and it returns a wrong answer with no error, which is the worst failure mode available to an algorithm. Second, the guess has to earn its own cost: it is evaluated once per discovered node, so on a graph with no usable geometry A* is Dijkstra with extra arithmetic and a slightly worse constant. If you need every distance rather than one, or there are no coordinates, or a weight can be negative, you want Dijkstra and none of this.',
  complexity: {
    best: 'O((V + E) log V)',
    average: 'O((V + E) log V)',
    worst: 'O((V + E) log V)',
    space: 'O(V + E)',
    note: "Identical to Dijkstra, and that is the ceiling rather than the bill: the bound is reached exactly when h says nothing, which is what the `no-geometry` preset is for. With a perfect h over this module's own weight scheme the search is admissible and consistent, and the node count can drop by an order of magnitude — `corridor` expands 4 of 16. The caveat that matters is not the asymptotics but the precondition: the heuristic must be admissible, and an inadmissible one does not merely slow the search down, it silently returns a wrong cost.",
  },
  traits: {
    offline: true,
    tags: ['heuristic-search', 'shortest-path', 'priority-queue', 'weighted', 'informed-search'],
  },
  viewport: 'graph',
  level: 'advanced',
  params: [
    {
      key: 'start',
      label: 'Start node',
      kind: 'number',
      min: 0,
      max: 99,
      step: 1,
      default: 0,
      help: 'Where the search starts. g is measured from here; h is always measured to the goal, so moving the goal changes which nodes get expanded.',
    },
    {
      key: 'goal',
      label: 'Goal node',
      kind: 'number',
      min: 0,
      max: 99,
      step: 1,
      default: 6,
      help: 'What the search is looking for. The straight-line estimate is the distance to this node, so the heuristic quality is a property of where the goal sits.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: aStarSearch,
  lesson,
  expectations,
  formatResult: (r) => {
    const v = r as number[];
    if (!Array.isArray(v) || v.length === 0 || v[0] === -1) return 'no path';
    return `cost ${v[0]} via ${v.slice(1).join(' → ')}`;
  },
  anchors: [
    'start',
    'f-score',
    'pop',
    'skip-closed',
    'goal',
    'relax',
    'tentative',
    'no-path',
    'reconstruct',
    'done',
  ],
};

export default aStarSearchAlgo;
