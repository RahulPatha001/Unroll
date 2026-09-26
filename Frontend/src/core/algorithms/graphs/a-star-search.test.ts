import { describe, expect, it } from 'vitest';
import { styleForKey } from '../../../features/viewport/palette.ts';
import { anchorsInTrace } from '../../code/anchors.ts';
import { graph } from '../../input/types.ts';
import { runEveryPreset, runTrace, validateTrace } from '../../trace/materialise.ts';
import type { GraphFrame, NodeId } from '../../trace/types.ts';
import { PALETTE_ORDER } from '../../trace/types.ts';
import type { Preset } from '../types.ts';
import { aStarSearchAlgo } from './a-star-search.ts';

/**
 * Tests for the A* module, on top of the shared contract suite and the
 * 4-language parity run.
 *
 * Two of these assertions cannot live in the contract test at all, and that is
 * the reason this file exists:
 *
 *  - **The colour check needs the module registered.** `contract.test.ts` walks
 *    down from `registry.ts`, so an unregistered module is invisible to it. The
 *    per-frame "no two visible groups share a colour" check is repeated here
 *    locally, against `styleForKey`, exactly as the contract test does it.
 *  - **Parity cannot see frame structure.** All four listings would agree on a
 *    wrong predecessor chain, and the harness compares the *returned value*, not
 *    the drawn picture. So the immutability and the path-integrity checks below
 *    are the only things standing between this module and a beautifully narrated
 *    wrong answer.
 */

const preset = (id: string): Preset => {
  const p = aStarSearchAlgo.presets.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const run = (id: string): GraphFrame[] =>
  runTrace(aStarSearchAlgo, { input: preset(id).input, presetParams: preset(id).params }).trace;

const countOf = (id: string, anchor: string): number =>
  run(id).filter((f) => f.anchor === anchor).length;

const last = (id: string): GraphFrame => {
  const f = run(id).at(-1);
  if (!f) throw new Error(`preset ${id} produced no frames`);
  return f;
};

/** The graph of a preset as index-based triples, exactly as the harness sees it. */
function flatEdges(p: Preset): { n: number; edges: Array<[number, number, number]> } {
  const input = p.input;
  if (input.type !== 'graph') throw new Error(`preset ${p.id} is not a graph`);
  const ids = input.nodes.map((nd) => nd.id);
  const at = new Map<NodeId, number>(ids.map((id, i) => [id, i]));
  const edges: Array<[number, number, number]> = [];
  for (const e of input.edges) {
    const u = at.get(e.from);
    const v = at.get(e.to);
    if (u === undefined || v === undefined) continue;
    edges.push([u, v, e.weight ?? 1]);
  }
  return { n: ids.length, edges };
}

/**
 * Bellman-Ford, written to be obviously correct rather than fast.
 *
 * Repeat "sweep every edge, lower whatever is lower" until a whole sweep changes
 * nothing. O(V*E), no priority queue, no heuristic, and no structural similarity
 * whatsoever to the generator under test — which is the entire point of using it
 * as the reference. `bellman-ford.ts` in the same directory is this idea plus
 * negative edges and a cycle check.
 */
function bellmanFord(n: number, edges: Array<[number, number, number]>, source: number): number[] {
  const d = new Array<number>(n).fill(Number.POSITIVE_INFINITY);
  d[source] = 0;
  for (let pass = 1; pass <= n; pass++) {
    let changed = false;
    for (const [u, v, w] of edges) {
      const du = d[u] as number;
      if (du + w < (d[v] as number)) {
        d[v] = du + w;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return d;
}

/** Dijkstra by brute-force scan, for the "A* expands fewer nodes" claim. */
function dijkstraSettled(
  n: number,
  edges: Array<[number, number, number]>,
  source: number,
): number {
  const d = new Array<number>(n).fill(Number.POSITIVE_INFINITY);
  const closed = new Array<boolean>(n).fill(false);
  d[source] = 0;
  let count = 0;
  for (let step = 0; step < n; step++) {
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (closed[i]) continue;
      if (best < 0 || (d[i] as number) < (d[best] as number)) best = i;
    }
    if (best < 0 || !Number.isFinite(d[best] as number)) break;
    closed[best] = true;
    const db = d[best] as number;
    count++;
    for (const [u, v, w] of edges) {
      if (u === best && db + w < (d[v] as number)) d[v] = db + w;
      if (v === best && db + w < (d[u] as number)) d[u] = db + w;
    }
  }
  return count;
}

/** The reconstructed path of a run, as node indices. */
const pathOf = (frame: GraphFrame): string[] => (frame.highlight?.['path'] ?? []) as string[];

describe('A* search', () => {
  it('produces a structurally valid trace on every preset', () => {
    for (const { presetId, result } of runEveryPreset(aStarSearchAlgo)) {
      expect(validateTrace(result.trace), `preset ${presetId}`).toEqual([]);
      expect(result.trace.length, `preset ${presetId}`).toBeGreaterThan(0);
      expect(result.truncated, `preset ${presetId}`).toBe(false);
      expect(result.error, `preset ${presetId}`).toBeUndefined();
    }
  });

  it('never shows two same-coloured highlight groups in the same frame', () => {
    /*
     * The contract test asserts this for every *registered* algorithm. This module
     * is not registered yet, so nothing in the suite can see it — which is exactly
     * how the ten highlight names that all rendered in the `answer` colour survived
     * review. Asserted locally, per frame, against the real palette.
     */
    const known = new Set<string>(PALETTE_ORDER);
    const clashes: string[] = [];
    for (const p of aStarSearchAlgo.presets) {
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
     * The documented frame-structure failure mode, and it is invisible from outside:
     * if the generator shares one `nodes` record or one `edges` array across
     * frames, then *every* frame mutates together and stepping backwards shows the
     * future. Nothing throws. The trace is a valid array of valid frames and it is
     * simply a picture of the end state repeated, which is why this assertion
     * exists rather than a reviewer's eye.
     */
    for (const p of aStarSearchAlgo.presets) {
      const frames = run(p.id);
      for (let i = 1; i < frames.length; i++) {
        const a = frames[i - 1] as GraphFrame;
        const b = frames[i] as GraphFrame;
        const where = `${p.id} frames ${i - 1}/${i}`;
        expect(a.nodes, `${where}: shared nodes record`).not.toBe(b.nodes);
        expect(a.edges, `${where}: shared edges array`).not.toBe(b.edges);
        expect(a.frontier, `${where}: shared frontier array`).not.toBe(b.frontier);
        expect(a.visited, `${where}: shared visited array`).not.toBe(b.visited);
        expect(a.distance, `${where}: shared distance record`).not.toBe(b.distance);
        expect(a.parent, `${where}: shared parent record`).not.toBe(b.parent);
        // The array being fresh is not enough: the *elements* have to be fresh too,
        // because `inSet` is mutated in place by the MST algorithms and a shared
        // edge object would make one accepted edge light up the whole trace.
        for (let k = 0; k < Math.min(a.edges.length, b.edges.length); k++) {
          expect(a.edges[k], `${where}: shared edge object at ${k}`).not.toBe(b.edges[k]);
        }
      }
    }
  });

  it('returns the cost an independent Bellman-Ford agrees with, on every preset', () => {
    /*
     * The machine-checkable claim, re-derived rather than read off the module. The
     * pinned numbers in `expectations` came from the same reference; this asserts
     * that the *generator* agrees with it too, which the parity run cannot do —
     * parity only ever compares the four listings with each other.
     */
    for (const p of aStarSearchAlgo.presets) {
      const { n, edges } = flatEdges(p);
      const start = Number(p.params?.['start'] ?? 0);
      const goal = Number(p.params?.['goal'] ?? 0);
      const reference = bellmanFord(n, edges, start)[goal] as number;
      const got = Number(
        last(p.id).vars?.['g'] ?? (reference === Number.POSITIVE_INFINITY ? -1 : NaN),
      );
      if (!Number.isFinite(reference)) {
        expect(last(p.id).result, `${p.id}: an unreachable goal must report no result`).toBeNull();
        expect(last(p.id).vars?.['cost'], `${p.id}`).toBe(-1);
        expect(countOf(p.id, 'no-path'), `${p.id}`).toBe(1);
        expect(countOf(p.id, 'reconstruct'), `${p.id}: nothing to reconstruct`).toBe(0);
      } else {
        expect(got, `${p.id}: cost`).toBe(reference);
        expect(last(p.id).result, `${p.id}: result node id`).toBe(
          p.input.type === 'graph' ? p.input.nodes[goal]?.id : undefined,
        );
        expect(countOf(p.id, 'no-path'), `${p.id}`).toBe(0);
        expect(countOf(p.id, 'reconstruct'), `${p.id}`).toBe(1);
      }
      // The pinned expectation must itself be the reference's cost, so the parity
      // run is checking the same number this test is.
      const pinned = aStarSearchAlgo.expectations.find((e) => e.presetId === p.id)?.result;
      expect((pinned as number[])[0], `${p.id}: pinned expectation cost`).toBe(
        Number.isFinite(reference) ? reference : -1,
      );
    }
  });

  it('reconstructs a path that is a real chain of edges weighing exactly the cost', () => {
    /*
     * The check parity structurally cannot make. A predecessor recorded on the
     * wrong relaxation produces a chain that *looks* connected in the drawing, and
     * all four listings would return the same wrong chain, so every language would
     * agree and the harness would be green. So: every hop must be an edge of the
     * preset, and the weights of those edges must sum to the reported cost.
     */
    for (const p of aStarSearchAlgo.presets) {
      const frame = last(p.id);
      const chain = pathOf(frame);
      if (chain.length === 0) {
        expect(frame.vars?.['cost'], `${p.id}: empty path only for no-path`).toBe(-1);
        continue;
      }
      const weight = (a: NodeId, b: NodeId): number | null => {
        const e = frame.edges.find(
          (x) => (x.from === a && x.to === b) || (x.from === b && x.to === a),
        );
        return e?.weight ?? null;
      };
      let total = 0;
      for (let k = 0; k + 1 < chain.length; k++) {
        const w = weight(chain[k] as NodeId, chain[k + 1] as NodeId);
        expect(
          w,
          `${p.id}: hop ${chain[k]}→${chain[k + 1]} is not an edge of the graph`,
        ).not.toBeNull();
        total += w as number;
      }
      expect(total, `${p.id}: path weights do not sum to the reported cost`).toBe(
        Number(frame.vars?.['g']),
      );
      expect(chain[0], `${p.id}: the path must start at the start node`).toBe(
        p.input.type === 'graph' ? p.input.nodes[Number(p.params?.['start'] ?? 0)]?.id : undefined,
      );
      expect(chain.at(-1), `${p.id}: the path must end at the goal`).toBe(
        p.input.type === 'graph' ? p.input.nodes[Number(p.params?.['goal'] ?? 0)]?.id : undefined,
      );
      // No node may appear twice, or the chain is a walk and not a path.
      expect(new Set(chain).size, `${p.id}: the path revisits a node`).toBe(chain.length);
    }
  });

  it('stops when the goal is *popped*, and only then', () => {
    // The correctness distinction, made observable: on every reachable preset the
    // goal's `goal` frame is the last `pop` frame, and the expansion count is
    // strictly below the number of nodes. A "reached" implementation would carry on
    // and settle everything, which is the entire difference from Dijkstra.
    for (const id of ['corridor', 'plateau', 'snare', 'no-geometry']) {
      const frames = run(id);
      const popAt = frames.map((f, i) => (f.anchor === 'pop' ? i : -1)).filter((i) => i >= 0);
      const goalAt = frames.findIndex((f) => f.anchor === 'goal');
      expect(goalAt, `${id}: no goal frame`).toBeGreaterThan(-1);
      // The goal frame follows the *last* pop with nothing in between: the run ends
      // the moment the goal is expanded rather than relaxing out of it.
      expect(goalAt, `${id}: the goal frame must follow the last pop`).toBe(
        (popAt.at(-1) as number) + 1,
      );
      const n = Object.keys(frames[0]?.nodes ?? {}).length;
      expect(popAt.length, `${id}: never expands a node twice`).toBeLessThanOrEqual(n);
      if (id !== 'no-geometry') {
        // `no-geometry` is the exception and it is deliberate: with no usable
        // geometry the estimate is worth nothing and A* expands the whole graph,
        // exactly as Dijkstra would. Asserted separately, with Dijkstra as the
        // yardstick, in the test below.
        expect(popAt.length, `${id}: stopped before expanding everything`).toBeLessThan(n);
      }
    }
  });

  it('expands far fewer nodes than Dijkstra when the heuristic is worth something', () => {
    /*
     * The money shot, quantified. The `corridor` preset is a 4x4 lattice whose
     * diagonal costs 283 a hop and whose every other step costs 1100, so the
     * straight-line estimate is nearly exact along the diagonal and nearly
     * useless off it. A* walks the diagonal: 4 expansions of 16 nodes. Dijkstra
     * has no estimate at all and settles all 16.
     */
    const p = preset('corridor');
    const { n, edges } = flatEdges(p);
    expect(Object.keys(run('corridor')[0]?.nodes ?? {}).length, 'preset size').toBe(n);
    expect(countOf('corridor', 'pop'), 'A* expansions').toBe(4);
    expect(dijkstraSettled(n, edges, 0), 'Dijkstra expansions on the same graph').toBe(16);

    // ...and the bill is unchanged when the estimate is worthless, which is the
    // other half of the trade-off and is why `no-geometry` exists.
    const organic = flatEdges(preset('no-geometry'));
    expect(countOf('no-geometry', 'pop'), 'A* with no usable geometry').toBe(
      dijkstraSettled(organic.n, organic.edges, 0),
    );
  });

  it('walks the lure before the real road, and still returns the right answer', () => {
    /*
     * The `snare` preset: nodes 1-3 head straight at the goal and dead-end 198
     * units short of it, so the estimate promises a cheap arrival and delivers
     * nothing. Every one of them must be expanded before the first step of the
     * real road, and the cost must still come out at 1600 — an admissible
     * heuristic is allowed to be wrong, just never optimistic.
     */
    const p = preset('snare');
    const order = run('snare')
      .filter((f) => f.anchor === 'pop')
      .map((f) => String(f.vars?.['u']));
    expect(order, 'the lure is walked first').toEqual(['0', '1', '2', '3', '4', '5']);
    const { n, edges } = flatEdges(p);
    expect(Number(last('snare').vars?.['g'])).toBe(bellmanFord(n, edges, 0)[5]);
    expect(pathOf(last('snare'))).toEqual(['n0', 'n4', 'n5']);
  });

  it('breaks a tie on f by g and then by node index, and says so', () => {
    // The `plateau` preset has three routes of exactly equal cost, so the first
    // decision is a genuine three-way tie. Two side nodes tie on f *and* on g, so
    // the node index decides; the goal ties on f but loses on g. The `tentative`
    // frame is where the tie is visible in the data.
    const tied = run('plateau')
      .filter((f) => f.anchor === 'f-score')
      .filter((f) => f.vars?.['rivalF'] !== '-');
    const exactTies = tied.filter((f) => f.vars?.['f'] === f.vars?.['rivalF']);
    expect(exactTies.length, 'plateau should contain an exact f tie').toBeGreaterThan(0);
    for (const f of exactTies) {
      expect(f.note, `frame ${f.index} should name the tie`).toContain('the same f');
    }
    // The recorded route is the direct edge, because the second equal-cost route to
    // arrive is refused by a strict `<` and the first predecessor stays put.
    expect(pathOf(last('plateau'))).toEqual(['n0', 'n3']);
  });

  it('pays for a stale queue entry only when the goal is unreachable', () => {
    /*
     * A provable asymmetry, and the reason the `split` preset carries an extra road.
     * If the goal is reachable then every queue entry carries an `f` of at least the
     * optimal cost, while a stale entry carries an `f` strictly larger than its own
     * node's current one — so the goal is always popped first and a stale pop is
     * unreachable. With no route at all there is no optimal cost to be bounded by,
     * and the duplicate left behind by the 0-7 road really does come off the queue.
     */
    for (const id of ['corridor', 'plateau', 'snare', 'no-geometry']) {
      expect(countOf(id, 'skip-closed'), `${id}: unreachable while the goal is reachable`).toBe(0);
    }
    expect(countOf('split', 'skip-closed'), 'split: the stale pop').toBe(1);
    expect(countOf('split', 'no-path'), 'split: the failure frame').toBe(1);
    expect(last('split').result, 'split: no result node').toBeNull();
    expect(countOf('split', 'goal'), 'split: the goal is never popped').toBe(0);
  });

  it('pins the narration for the corridor preset', () => {
    // A golden narration snapshot. If this changes, the *teaching* changed, not
    // just the implementation — which is exactly the kind of diff a reviewer wants
    // to see rather than absorb. It comes last on purpose: the structural claims
    // above are what make this snapshot worth trusting.
    expect(
      run('corridor')
        .slice(0, 5)
        .map((f) => f.note),
    ).toMatchInlineSnapshot(`
      [
        "0 starts at g = 0 and every other badge at ∞ — g is the distance *from the start*, the only half A* measures for certain. The other half is a guess: the straight-line distance to 15, in the same units as the edge weights, and 15's own guess is 0 so its f equals its g exactly. Push the start with f = 0 + 848.5; the open set now holds every discovered but unexpanded node, printed lowest-f first, so the first entry is always the node the next frame expands.",
        "0 has the lowest f in the open set: g 0 plus an estimate of 848.5 gives f 848.5. It is the only candidate, so there is nothing to compare it against. Dijkstra would have compared 0's g of 0 against the other candidates' g instead, and on these graphs the two rankings are not close to the same.",
        "Expand 0: it leaves the open set and joins the closed set, and g 0 becomes final. The greedy step is sound *here* for one reason only — h never overestimates, so no route through a node still unexpanded can cost less than f, and f is no better than the best f left in the queue. Make h optimistic and that argument disappears, and the cost this run returns is then simply wrong.",
        "Edge 0 → 5 costs 283. Routing it through 0 would put 5 at 0 + 283 = 283, against a best known ∞. Cheaper, so the badge is about to drop. The arithmetic is identical to Dijkstra's and the estimate is not consulted at all — which is the design: h only ever changes the order nodes come out of the queue in, never the cost of anything.",
        "5 drops from ∞ to 283, its predecessor becomes 0, and a fresh queue entry goes in keyed on f = 283 + 565.7 = 848.7. That places it in the open set by the guess as well as the truth, which is how a node found the long way round can still be expanded before one found directly. The old entry, if there was one, is not removed — it stays until it pops and is thrown away.",
      ]
    `);
  });

  it('is deterministic: the same input always yields the same trace', () => {
    for (const p of aStarSearchAlgo.presets) {
      const once = run(p.id);
      const twice = run(p.id);
      expect(JSON.stringify(once), `preset ${p.id}`).toBe(JSON.stringify(twice));
    }
  });

  it('terminates on degenerate input', () => {
    const cases: Array<[string, ReturnType<typeof graph>, Record<string, number>]> = [
      [
        'a single node, which is also the goal',
        graph({ nodes: [{ id: 'a', x: 500, y: 500 }], edges: [] }),
        { start: 0, goal: 0 },
      ],
      [
        'two nodes and no edges at all',
        graph({
          nodes: [
            { id: 'a', x: 100, y: 100 },
            { id: 'b', x: 900, y: 900 },
          ],
          edges: [],
        }),
        { start: 0, goal: 1 },
      ],
      ['no nodes whatsoever', graph({ nodes: [], edges: [] }), { start: 0, goal: 0 }],
    ];
    for (const [name, input, params] of cases) {
      const { trace, error, aborted } = runTrace(aStarSearchAlgo, { input, presetParams: params });
      expect(error, name).toBeUndefined();
      expect(aborted, name).toBe(false);
      expect(validateTrace(trace), name).toEqual([]);
      expect(trace.length, name).toBeGreaterThan(0);
      // Only the edgeless and empty graphs have no answer. A single node that is
      // its own goal has a real one: the route to yourself is empty and free.
      if (name.startsWith('a single node')) expect(trace.at(-1)?.result, name).toBe('a');
      else expect(trace.at(-1)?.result, name).toBeNull();
    }
    // A single node that is the goal is the one degenerate case with a real answer:
    // the route to yourself is empty and costs nothing.
    const single = runTrace(aStarSearchAlgo, {
      input: graph({ nodes: [{ id: 'a', x: 500, y: 500 }], edges: [] }),
      presetParams: { start: 0, goal: 0 },
    });
    expect(Number(single.trace.at(-1)?.vars?.['g'])).toBe(0);
    expect(single.trace.at(-1)?.result).toBe('a');
  });

  it('clamps a goal index that is out of range instead of crashing', () => {
    // The param is a free number in the UI, so 99 on a two-node graph is a thing a
    // student will do. It must resolve to the last node rather than index off the
    // end of the coordinate array.
    const { trace, error } = runTrace(aStarSearchAlgo, {
      input: graph({
        nodes: [
          { id: 'a', x: 100, y: 100 },
          { id: 'b', x: 900, y: 900 },
        ],
        edges: [{ from: 'a', to: 'b', directed: false, weight: 5 }],
      }),
      presetParams: { start: 0, goal: 99 },
    });
    expect(error).toBeUndefined();
    expect(validateTrace(trace)).toEqual([]);
    expect(trace.at(-1)?.result).toBe('b');
    expect(Number(trace.at(-1)?.vars?.['g'])).toBe(5);
  });

  it('stops when asked to', () => {
    let calls = 0;
    const result = runTrace(
      aStarSearchAlgo,
      { input: preset('corridor').input, presetParams: preset('corridor').params },
      {
        shouldStop: () => {
          calls += 1;
          return calls > 3;
        },
      },
    );
    expect(result.aborted).toBe(true);
    expect(result.trace.length).toBeLessThan(10);
  });

  it('emits only declared anchors, and every declared anchor is emitted', () => {
    // The union across every preset: `skip-closed` and `no-path` come only from the
    // walled-off graph, and `goal` and `reconstruct` come from none of them. That is
    // why the disconnected preset is mandatory rather than decorative.
    const reachable = new Set(aStarSearchAlgo.presets.flatMap((p) => anchorsInTrace(run(p.id))));
    const declared = new Set(aStarSearchAlgo.anchors);
    for (const frame of aStarSearchAlgo.presets.flatMap((p) => run(p.id))) {
      expect(declared.has(frame.anchor), `undeclared anchor "${frame.anchor}"`).toBe(true);
    }
    for (const anchor of aStarSearchAlgo.anchors) {
      expect(reachable.has(anchor), `anchor "${anchor}" is never emitted by any preset`).toBe(true);
    }
  });

  it('ships the same anchor set in all four listings, with a note in each', () => {
    // The contract test checks this for registered algorithms; doing it here as
    // well means a listing that drifts is caught before registration rather than
    // after, and `parseCode` keeps the first marker per name, so a duplicate does
    // not mask a missing one.
    for (const lang of ['javascript', 'python', 'java', 'cpp'] as const) {
      const code = aStarSearchAlgo.lesson.code[lang];
      const found = [...code.matchAll(/@anchor\s+([A-Za-z_][A-Za-z0-9_-]*)/g)].map((m) => m[1]);
      expect([...new Set(found)].sort(), `${lang}: anchor set`).toEqual(
        [...aStarSearchAlgo.anchors].sort(),
      );
      for (const anchor of aStarSearchAlgo.anchors) {
        const note = aStarSearchAlgo.lesson.notes[lang]?.[anchor];
        expect(note?.length ?? 0, `${lang}/${anchor}: missing note`).toBeGreaterThan(15);
      }
    }
  });
});
