import { describe, expect, it } from 'vitest';
import { styleForKey } from '../../../features/viewport/palette.ts';
import { anchorsInTrace } from '../../code/anchors.ts';
import { graph } from '../../input/types.ts';
import { runEveryPreset, runTrace, validateTrace } from '../../trace/materialise.ts';
import type { GraphFrame, NodeId } from '../../trace/types.ts';
import { PALETTE_ORDER } from '../../trace/types.ts';
import type { Preset } from '../types.ts';
import { primsMstAlgo } from './prims-mst.ts';

/**
 * Tests for Prim's module, on top of the shared contract suite and the
 * 4-language parity run.
 *
 * Two of these cannot live in `contract.test.ts` at all:
 *
 *  - **The colour check needs the module registered.** Every check in the contract
 *    file looks *down* from `registry.ts`, so an unregistered module is invisible to
 *    it — which is exactly how ten highlight names once shared the `answer` colour
 *    and nothing failed. Asserted locally here, per frame, against the real palette.
 *  - **Parity cannot see the frame data.** The four listings agree with each other
 *    and disagree with this generator all the time when a `GraphFrame` is built
 *    wrongly, and all four being wrong in the same way looks exactly like all four
 *    being right. The immutability assertion below covers the failure mode this
 *    module is most exposed to — `inSet` is a field the generator mutates on an
 *    edge object, and a shared object would paint the whole trace green the moment
 *    one edge was accepted.
 */

const preset = (id: string): Preset => {
  const p = primsMstAlgo.presets.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const run = (id: string): GraphFrame[] =>
  runTrace(primsMstAlgo, { input: preset(id).input, presetParams: preset(id).params }).trace;

const countOf = (id: string, anchor: string): number =>
  run(id).filter((f) => f.anchor === anchor).length;

const last = (id: string): GraphFrame => {
  const f = run(id).at(-1);
  if (!f) throw new Error(`preset ${id} produced no frames`);
  return f;
};

/** The edges of a preset, deduplicated, exactly as the generator draws them. */
function drawnEdges(p: Preset): Array<[number, number, number]> {
  const input = p.input;
  if (input.type !== 'graph') throw new Error(`preset ${p.id} is not a graph`);
  const ids = input.nodes.map((nd) => nd.id);
  const at = new Map<NodeId, number>(ids.map((id, i) => [id, i]));
  const seen = new Set<string>();
  const out: Array<[number, number, number]> = [];
  for (const e of input.edges) {
    const u = at.get(e.from);
    const v = at.get(e.to);
    if (u === undefined || v === undefined) continue;
    const key = `${Math.min(u, v)}~${Math.max(u, v)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([Math.min(u, v), Math.max(u, v), e.weight ?? 1]);
  }
  return out;
}

/**
 * A deliberately naive Prim: no queue at all.
 *
 * Repeatedly rescan the *whole* edge list and take the globally cheapest edge with
 * exactly one end in the tree. O(V·E), obviously correct, and it shares no
 * structure with a heap-driven implementation — so the two cannot agree by both
 * being wrong in the same way. Deliberately not the spanning-*forest* reference a
 * Kruskal test would use: the two disagree on a disconnected graph (8 against 10 on
 * `islands`), and using the wrong one is precisely the bug that preset exists for.
 */
function bruteForcePrim(
  n: number,
  edges: Array<[number, number, number]>,
  start: number,
): { total: number; set: string[] } {
  const inTree = new Array<boolean>(n).fill(false);
  inTree[start] = true;
  const set: string[] = [];
  let total = 0;
  for (;;) {
    let best: [number, number, number] | null = null;
    for (const [u, v, w] of edges) {
      const a = inTree[u] as boolean;
      const b = inTree[v] as boolean;
      if (a === b) continue;
      if (
        best === null ||
        w < best[2] ||
        (w === best[2] && Math.min(u, v) < Math.min(best[0], best[1]))
      ) {
        best = [Math.min(u, v), Math.max(u, v), w];
      }
    }
    if (best === null) break;
    inTree[best[0]] = true;
    inTree[best[1]] = true;
    set.push(`${best[0]}-${best[1]}`);
    total += best[2];
  }
  return { total, set: set.sort() };
}

/**
 * Kruskal, for the one claim this module exists to make: Prim and Kruskal can lay
 * different trees for the same money. Breaks ties on `(weight, u, v)`, which is
 * what `kruskal.ts` does and is *not* what Prim does.
 */
function kruskalSet(
  n: number,
  edges: Array<[number, number, number]>,
): { total: number; set: string[] } {
  const all = edges.slice().sort((a, b) => a[2] - b[2] || a[0] - b[0] || a[1] - b[1]);
  const par = new Array<number>(n).fill(-1);
  const find = (x: number): number => {
    let r = x;
    while (par[r] !== r) r = par[r] as number;
    while (par[x] !== x) {
      const up = par[x] as number;
      par[x] = r;
      x = up;
    }
    return r;
  };
  for (let i = 0; i < n; i++) par[i] = i;
  const set: string[] = [];
  let total = 0;
  for (const [u, v, w] of all) {
    if (find(u) === find(v)) continue;
    par[find(u)] = find(v);
    set.push(`${u}-${v}`);
    total += w;
    if (set.length === n - 1) break;
  }
  return { total, set: set.sort() };
}

/** Whether every node is reachable from `start` — i.e. whether a spanning tree exists. */
function isConnected(n: number, edges: Array<[number, number, number]>, start: number): boolean {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [u, v] of edges) {
    adj[u]?.push(v);
    adj[v]?.push(u);
  }
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length > 0) {
    const u = stack.pop() as number;
    for (const v of adj[u] ?? []) {
      if (!seen.has(v)) {
        seen.add(v);
        stack.push(v);
      }
    }
  }
  return seen.size === n;
}

/** The edges the frame marks as accepted, as `min-max` index pairs. */
function acceptedOf(frame: GraphFrame, ids: NodeId[]): string[] {
  const at = new Map<NodeId, number>(ids.map((id, i) => [id, i]));
  return (frame.edges ?? [])
    .filter((e) => e.inSet)
    .map((e) => {
      const u = at.get(e.from) as number;
      const v = at.get(e.to) as number;
      return `${Math.min(u, v)}-${Math.max(u, v)}`;
    })
    .sort();
}

describe("Prim's minimum spanning tree", () => {
  it('produces a structurally valid trace on every preset', () => {
    for (const { presetId, result } of runEveryPreset(primsMstAlgo)) {
      expect(validateTrace(result.trace), `preset ${presetId}`).toEqual([]);
      expect(result.trace.length, `preset ${presetId}`).toBeGreaterThan(0);
      expect(result.truncated, `preset ${presetId}`).toBe(false);
      expect(result.error, `preset ${presetId}`).toBeUndefined();
    }
  });

  it('never shows two same-coloured highlight groups in the same frame', () => {
    const known = new Set<string>(PALETTE_ORDER);
    const clashes: string[] = [];
    for (const p of primsMstAlgo.presets) {
      for (const frame of run(p.id)) {
        for (const key of Object.keys(frame.highlight ?? {})) {
          if (!known.has(key)) clashes.push(`${p.id} @${frame.index}: unknown key "${key}"`);
        }
        const byColour = new Map<string, string[]>();
        for (const [key, members] of Object.entries(frame.highlight ?? {})) {
          // A group with no members is not visible, so it cannot collide.
          if (members.length === 0) continue;
          const fill = styleForKey(key).fill;
          byColour.set(fill, [...(byColour.get(fill) ?? []), key]);
        }
        for (const [fill, keys] of byColour) {
          if (keys.length > 1) {
            clashes.push(`${p.id} @${frame.index}: ${keys.join(' + ')} share ${fill}`);
          }
        }
      }
    }
    expect(clashes, clashes.join('; ')).toEqual([]);
  });

  it('hands every frame its own copy of the graph', () => {
    /*
     * `inSet` is the whole visual story of this algorithm, and it is mutated on an
     * edge object. If the `edges` array — or any edge inside it — were shared
     * between frames, the first accepted edge would paint every frame green and
     * stepping backwards would show the finished tree at frame 0. Nothing throws;
     * the trace is a valid array of valid frames that is simply a picture of the
     * end state, repeated.
     */
    for (const p of primsMstAlgo.presets) {
      const frames = run(p.id);
      for (let i = 1; i < frames.length; i++) {
        const a = frames[i - 1] as GraphFrame;
        const b = frames[i] as GraphFrame;
        const where = `${p.id} frames ${i - 1}/${i}`;
        expect(a.nodes, `${where}: shared nodes record`).not.toBe(b.nodes);
        expect(a.edges, `${where}: shared edges array`).not.toBe(b.edges);
        expect(a.frontier, `${where}: shared frontier array`).not.toBe(b.frontier);
        expect(a.visited, `${where}: shared visited array`).not.toBe(b.visited);
        for (let k = 0; k < Math.min(a.edges.length, b.edges.length); k++) {
          expect(a.edges[k], `${where}: shared edge object at ${k}`).not.toBe(b.edges[k]);
        }
      }
    }
  });

  it('only ever grows the set of accepted edges, and never before the first take', () => {
    // The monotonicity a tree has: once a road is in, it stays in. If `inSet` were
    // set before the `add-edge` frame, or cleared by a later frame, the green tree
    // would flicker as the student scrubbed.
    for (const p of primsMstAlgo.presets) {
      let before = 0;
      for (const frame of run(p.id)) {
        const now = (frame.edges ?? []).filter((e) => e.inSet).length;
        expect(now, `${p.id} @${frame.index}: the accepted set shrank`).toBeGreaterThanOrEqual(
          before,
        );
        if (frame.anchor !== 'add-edge') {
          expect(now, `${p.id} @${frame.index}: edges accepted outside an add-edge frame`).toBe(
            before,
          );
        }
        before = now;
      }
      expect(before, `${p.id}: final accepted count`).toBe(
        (last(p.id).edges ?? []).filter((e) => e.inSet).length,
      );
    }
  });

  it('accepts a set that spans every node, has no cycle, and costs the reference total', () => {
    /*
     * The structural claims, checked against the accepted edges the frames actually
     * carry. Three separate properties, because each fails differently: too many
     * edges means a cycle, too few means a forest, and the right count with the
     * wrong sum means the greedy picked badly.
     */
    for (const p of primsMstAlgo.presets) {
      const frame = last(p.id);
      const ids = p.input.type === 'graph' ? p.input.nodes.map((nd) => nd.id) : [];
      const n = ids.length;
      const start = Number(p.params?.['start'] ?? 0);
      const edges = drawnEdges(p);
      const weightOf = (key: string): number => {
        const [a, b] = key.split('-').map(Number) as [number, number];
        return edges.find(([u, v]) => u === a && v === b)?.[2] ?? NaN;
      };

      const accepted = acceptedOf(frame, ids);
      expect(new Set(accepted).size, `${p.id}: an edge was accepted twice`).toBe(accepted.length);

      // No cycle: a forest on n nodes has at most n-1 edges, whatever the weights.
      expect(accepted.length, `${p.id}: more edges than a forest can hold`).toBeLessThanOrEqual(
        n - 1,
      );

      const reference = bruteForcePrim(n, edges, start);
      expect(
        accepted.reduce((a, k) => a + weightOf(k), 0),
        `${p.id}: accepted weights do not sum to the reference total`,
      ).toBe(reference.total);
      expect(Number(frame.vars?.['total']), `${p.id}: reported total`).toBe(reference.total);
      expect(frame.result, `${p.id}: the result string is the total`).toBe(String(reference.total));

      // Spanning or not, the accepted edges must reach every node the frame claims is
      // in the tree, and they must reach it *from the start node*. This has to be a
      // traversal rather than a single pass over the edge list: the edges arrive in
      // the order Prim took them, which is the order the tree grew, so a
      // connect-on-first-sight pass over that list happens to work — and a
      // single-pass check that only works because of the input order is exactly the
      // kind of assertion that stops testing anything the moment the order changes.
      const adjacency = new Map<number, number[]>();
      for (const key of accepted) {
        const [a, b] = key.split('-').map(Number) as [number, number];
        adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
        adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
      }
      const reached = new Set<number>([start]);
      const stack = [start];
      while (stack.length > 0) {
        const u = stack.pop() as number;
        for (const v of adjacency.get(u) ?? []) {
          if (!reached.has(v)) {
            reached.add(v);
            stack.push(v);
          }
        }
      }
      expect(reached.size, `${p.id}: the accepted edges do not reach every claimed node`).toBe(
        frame.visited?.length,
      );

      // A connected graph must yield a spanning tree, i.e. exactly n-1 edges, and
      // must never produce the failure frame. `islands` is the preset that fails
      // this, which is what makes it the one worth having.
      if (isConnected(n, edges, start)) {
        expect(accepted.length, `${p.id}: a connected graph must give n-1 edges`).toBe(n - 1);
        expect(
          countOf(p.id, 'disconnected'),
          `${p.id}: no failure frame on a connected graph`,
        ).toBe(0);
      } else {
        expect(countOf(p.id, 'disconnected'), `${p.id}: a disconnected graph must say so`).toBe(1);
        expect(accepted.length, `${p.id}: a forest, so fewer than n-1 edges`).toBeLessThan(n - 1);
      }
    }
  });

  it('builds a different tree from Kruskal for the same money, on tied weights', () => {
    /*
     * The claim the `divergent` preset exists to make, and it is a claim about two
     * algorithms, so it needs both of them in the test. Five edges, two minimum
     * spanning trees, one total.
     *
     * The mechanism is a tie, and the mechanism is worth pinning: a minimum
     * spanning tree is unique when every weight is distinct, so the *only* way two
     * MST algorithms can disagree is if two edges cost the same and the two break
     * that tie by different rules. Prim claims the lower-numbered node; Kruskal's
     * sort breaks on the first endpoint. If someone "fixes" either tie-break to
     * match the other, this test fails — and the fix would have removed the only
     * interesting thing about the graph.
     */
    const p = preset('divergent');
    const ids = p.input.type === 'graph' ? p.input.nodes.map((nd) => nd.id) : [];
    const edges = drawnEdges(p);
    const accepted = acceptedOf(last('divergent'), ids);
    const kruskal = kruskalSet(ids.length, edges);
    const mine = bruteForcePrim(ids.length, edges, 0);

    expect(
      edges.map(([, , w]) => w),
      'two weights tie, which is the whole point',
    ).toEqual([1, 1, 1, 2, 2]);
    expect(mine.total, 'Prim total').toBe(5);
    expect(kruskal.total, 'Kruskal total on the same graph').toBe(mine.total);
    expect(accepted, 'Prim took 1-3, where Kruskal took 0-2').toEqual(['0-3', '0-4', '1-2', '1-3']);
    expect(kruskal.set, 'Kruskal set').toEqual(['0-2', '0-3', '0-4', '1-2']);
    expect(
      accepted.filter((k) => !kruskal.set.includes(k)),
      'the edges only Prim took',
    ).toEqual(['1-3']);
    expect(
      kruskal.set.filter((k) => !accepted.includes(k)),
      'the edges only Kruskal took',
    ).toEqual(['0-2']);
  });

  it('makes no choice at all on a graph that is already a tree', () => {
    // The control experiment. Five edges on six nodes, all different weights, so
    // every edge is taken, nothing is ever refused, and the queue never holds more
    // than one candidate. If `skip-cycle` or `skip-in-tree` appeared here, the
    // candidate scan would be offering something it should not.
    expect(countOf('ladder', 'add-edge'), 'every edge is taken').toBe(5);
    expect(countOf('ladder', 'skip-cycle'), 'nothing is ever stale').toBe(0);
    expect(countOf('ladder', 'skip-in-tree'), 'nothing is ever refused').toBe(0);
    expect(countOf('ladder', 'disconnected'), 'the tree completes').toBe(0);
    expect(
      last('ladder').edges?.every((e) => e.inSet),
      'every drawn edge is in the tree',
    ).toBe(true);
    // The queue holds one candidate for the whole run, which is the point.
    expect(
      run('ladder').every((f) => (f.frontier?.length ?? 0) <= 1),
      'the frontier never exceeds one candidate',
    ).toBe(true);
  });

  it('returns the start component on a disconnected graph, not a forest', () => {
    /*
     * The trap. Prim reports 8 here; a spanning forest over both islands would be
     * 10, and that is the number `kruskal.ts` reports on the same input. Both are
     * correct implementations of their own contract, and they disagree — which is
     * the cleanest available statement that "minimum spanning tree" is only a
     * well-posed question on a connected graph.
     */
    const p = preset('islands');
    const ids = p.input.type === 'graph' ? p.input.nodes.map((nd) => nd.id) : [];
    const edges = drawnEdges(p);
    const forest = kruskalSet(ids.length, edges);
    const tree = bruteForcePrim(ids.length, edges, 0);

    expect(tree.total, 'the start component costs 8').toBe(8);
    expect(forest.total, 'a spanning forest over both islands would cost 10').toBe(10);
    expect(last('islands').result, 'Prim reports its own component').toBe('8');
    expect(countOf('islands', 'disconnected'), 'the failure frame is emitted').toBe(1);
    expect(last('islands').visited, 'and the far component is never even visited').toEqual([
      'n0',
      'n2',
      'n1',
      'n3',
    ]);
    expect(
      last('islands').highlight?.['unvisited'],
      'so those nodes are highlighted as never-reached, not as rejected',
    ).toHaveLength(3);
  });

  it('pins the narration for the divergent preset', () => {
    // A golden narration snapshot. If this changes, the *teaching* changed, not
    // just the implementation — which is exactly the kind of diff a reviewer wants
    // to see rather than absorb. It comes last on purpose: the structural claims
    // above are what make this snapshot worth trusting.
    expect(
      run('divergent')
        .slice(0, 7)
        .map((f) => f.note),
    ).toMatchInlineSnapshot(`
      [
        "5 nodes and 5 edges, and no tree yet: Prim's answer is built rather than found, one node at a time, and it starts by picking a single node to build around. A tree on 5 nodes has exactly 4 edges, so that is the number of takes available — and every one of them has to be an edge that reaches something new.",
        "Start at 0: it joins the tree on its own, with no edge to pay for, and all 3 of its edges to the outside go into the queue. The queue holds *edges*, so the bar underneath is the outside endpoints — the nodes it could bring in next — and 0's own edges are the only candidates that exist so far. Prim's result depends on this choice in a way Kruskal's does not: a different seed vertex can give a different tree of the same total weight.",
        "0 – 3 is the cheapest of the 3 queued edges, at 1. The next cheapest is 0 – 4 at 1 as well, so nothing is being decided on cost: the tie-break claims the lower-numbered node, and either choice gives a minimum spanning tree of the same total. This is the one place where Prim and Kruskal can part company, because Kruskal's sort breaks the very same tie on the *first* endpoint instead. Taking it is guaranteed safe: exactly one end is inside the tree, so it cannot possibly close a loop. That is the whole difference from Kruskal, which has to establish the same fact with a union-find before it is allowed to touch an edge.",
        "Take it: 0 – 3 joins the tree for 1, 3 comes in, and the running total is 1. The green edge is now part of the answer and the tree has 2 of the 5 nodes. Now 3's own 2 edges have to be looked at, and every one that reaches outside becomes a candidate.",
        "0 – 4 is the cheapest of the 3 queued edges, at 1. The next cheapest is 3 – 1 at 2, so this one leads by 1. Taking it is guaranteed safe: exactly one end is inside the tree, so it cannot possibly close a loop. That is the whole difference from Kruskal, which has to establish the same fact with a union-find before it is allowed to touch an edge.",
        "Take it: 0 – 4 joins the tree for 1, 4 comes in, and the running total is 2. The green edge is now part of the answer and the tree has 3 of the 5 nodes. Now 4's own 1 edge has to be looked at, and every one that reaches outside becomes a candidate.",
        "3 – 1 is the cheapest of the 2 queued edges, at 2. The next cheapest is 0 – 2 at 2 as well, so nothing is being decided on cost: the tie-break claims the lower-numbered node, and either choice gives a minimum spanning tree of the same total. This is the one place where Prim and Kruskal can part company, because Kruskal's sort breaks the very same tie on the *first* endpoint instead. Taking it is guaranteed safe: exactly one end is inside the tree, so it cannot possibly close a loop. That is the whole difference from Kruskal, which has to establish the same fact with a union-find before it is allowed to touch an edge.",
      ]
    `);
  });

  it('is deterministic: the same input always yields the same trace', () => {
    for (const p of primsMstAlgo.presets) {
      const once = run(p.id);
      const twice = run(p.id);
      expect(JSON.stringify(once), `preset ${p.id}`).toBe(JSON.stringify(twice));
    }
  });

  it('terminates on degenerate input', () => {
    const cases: Array<[string, ReturnType<typeof graph>, Record<string, number>]> = [
      [
        'a single node, which is a tree with no edges',
        graph({ nodes: [{ id: 'a', x: 500, y: 500 }], edges: [] }),
        { start: 0 },
      ],
      [
        'three nodes and no edges at all',
        graph({
          nodes: [
            { id: 'a', x: 100, y: 100 },
            { id: 'b', x: 500, y: 500 },
            { id: 'c', x: 900, y: 900 },
          ],
          edges: [],
        }),
        { start: 0 },
      ],
      ['no nodes whatsoever', graph({ nodes: [], edges: [] }), { start: 0 }],
    ];
    for (const [name, input, params] of cases) {
      const { trace, error, aborted } = runTrace(primsMstAlgo, { input, presetParams: params });
      expect(error, name).toBeUndefined();
      expect(aborted, name).toBe(false);
      expect(validateTrace(trace), name).toEqual([]);
      expect(trace.length, name).toBeGreaterThan(0);
      expect(trace.at(-1)?.result, name).toBe('0');
    }
    // A single node *is* a spanning tree, so there is no failure frame to emit.
    expect(countOf('ladder', 'disconnected'), 'ladder: connected').toBe(0);
    const single = runTrace(primsMstAlgo, {
      input: graph({ nodes: [{ id: 'a', x: 500, y: 500 }], edges: [] }),
      presetParams: { start: 0 },
    });
    expect(single.trace.filter((f) => f.anchor === 'done')).toHaveLength(1);
  });

  it('stops when asked to', () => {
    let calls = 0;
    const result = runTrace(
      primsMstAlgo,
      { input: preset('sparse').input, presetParams: preset('sparse').params },
      {
        shouldStop: () => {
          calls += 1;
          return calls > 3;
        },
      },
    );
    expect(result.aborted).toBe(true);
    expect(result.trace.length).toBeLessThan(8);
  });

  it('emits only declared anchors, and every declared anchor is emitted', () => {
    // The union across presets. `skip-cycle` needs a queue with something to fall
    // behind and `disconnected` needs a second component, so neither the ladder nor
    // the connected presets reach them alone — which is why both of those presets
    // are load-bearing rather than decorative.
    const reachable = new Set(primsMstAlgo.presets.flatMap((p) => anchorsInTrace(run(p.id))));
    const declared = new Set(primsMstAlgo.anchors);
    for (const frame of primsMstAlgo.presets.flatMap((p) => run(p.id))) {
      expect(declared.has(frame.anchor), `undeclared anchor "${frame.anchor}"`).toBe(true);
    }
    for (const anchor of primsMstAlgo.anchors) {
      expect(reachable.has(anchor), `anchor "${anchor}" is never emitted by any preset`).toBe(true);
    }
  });

  it('ships the same anchor set in all four listings, with a note in each', () => {
    for (const lang of ['javascript', 'python', 'java', 'cpp'] as const) {
      const code = primsMstAlgo.lesson.code[lang];
      const found = [...code.matchAll(/@anchor\s+([A-Za-z_][A-Za-z0-9_-]*)/g)].map((m) => m[1]);
      expect([...new Set(found)].sort(), `${lang}: anchor set`).toEqual(
        [...primsMstAlgo.anchors].sort(),
      );
      for (const anchor of primsMstAlgo.anchors) {
        const note = primsMstAlgo.lesson.notes[lang]?.[anchor];
        expect(note?.length ?? 0, `${lang}/${anchor}: missing note`).toBeGreaterThan(15);
      }
    }
  });

  it('has one expectation per preset, and each is the total the frame reports', () => {
    for (const p of primsMstAlgo.presets) {
      const ex = primsMstAlgo.expectations.find((e) => e.presetId === p.id);
      expect(ex, `preset ${p.id} has no expectation`).toBeDefined();
      // The harness calls the listing with these arguments, so they have to be the
      // same graph the generator saw — including both directions of every road,
      // which is the bug documented at the top of the module.
      const args = (ex?.args ?? []) as [{ nodes: number[]; edges: number[][] }, number];
      expect(args[0].nodes.length, `${p.id}: node count`).toBe(
        p.input.type === 'graph' ? p.input.nodes.length : 0,
      );
      expect(args[0].edges.length, `${p.id}: doubled edge list`).toBe(
        p.input.type === 'graph' ? p.input.edges.length : 0,
      );
      expect(args[0].edges.length, `${p.id}: every undirected edge is listed both ways`).toBe(
        2 * drawnEdges(p).length,
      );
      // The frame reports the total as a string because `GraphFrame.result` is typed
      // as a node id; the expectation reports it as a number because that is what the
      // four listings return. Same value, two spellings, and the point of this
      // assertion is that they never drift apart.
      expect(Number(ex?.result), `${p.id}: the expectation is the reported total`).toBe(
        Number(last(p.id).result),
      );
    }
  });
});
