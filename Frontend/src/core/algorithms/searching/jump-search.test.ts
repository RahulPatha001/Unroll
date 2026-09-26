import { describe, expect, it } from 'vitest';
import { anchorsInTrace } from '../../code/anchors.ts';
import { runEveryPreset, runTrace, validateTrace } from '../../trace/materialise.ts';
import type { Preset } from '../types.ts';
import { jumpSearchAlgo } from './jump-search.ts';

const preset = (id: string): Preset => {
  const p = jumpSearchAlgo.presets.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const run = (id: string) =>
  runTrace(jumpSearchAlgo, { input: preset(id).input, presetParams: preset(id).params });

const countOf = (id: string, anchor: string): number =>
  run(id).trace.filter((f) => f.anchor === anchor).length;

const valuesOf = (id: string): number[] => {
  const input = preset(id).input;
  return input.type === 'numbers' ? input.values : [];
};

const targetOf = (id: string): number => Number(preset(id).params?.['target'] ?? 0);

describe('jump search', () => {
  it('produces a structurally valid trace on every preset', () => {
    for (const { presetId, result } of runEveryPreset(jumpSearchAlgo)) {
      expect(validateTrace(result.trace), `preset ${presetId}`).toEqual([]);
      expect(result.trace.length).toBeGreaterThan(0);
      expect(result.truncated).toBe(false);
    }
  });

  it('pins the narration for the hit-first-block preset', () => {
    // A golden narration snapshot. If this changes, the *teaching* changed, not
    // just the implementation — which is exactly the kind of diff a reviewer
    // wants to see rather than absorb.
    expect(
      run('hit-first-block')
        .trace.slice(0, 6)
        .map((f) => f.note),
    ).toMatchInlineSnapshot(`
      [
        "Looking for 4 in 12 sorted values, cut into 4 blocks of 3. The overlay row is the last index of each block — the only 4 cells the first phase will ever look at.",
        "Check the last cell of block 0, index 2: 34 against a target of 4. Big enough, so this block is where the answer has to be, if it is here at all.",
        "Block 0 is the first block whose last value is big enough, so if the target is present it is in [0, 2] — at most 3 cells, and the jump phase proved every earlier block is too small. Now scan it.",
        "Compare index 0: 2 against the target 4. Not equal — and since the array is sorted, nothing later in this block can be equal either.",
        "Compare index 1: 4 against the target 4. Equal.",
        "4 equals the target at index 1, so the search returns 1 after 3 comparisons in total — 1 for the jumps and 2 for the scan.",
      ]
    `);
  });

  it('reports the index of a match, or -1, matching the expectation', () => {
    for (const p of jumpSearchAlgo.presets) {
      const result = runTrace(jumpSearchAlgo, { input: p.input, presetParams: p.params });
      const last = result.trace.at(-1);
      const expected = jumpSearchAlgo.expectations.find((e) => e.presetId === p.id)?.result;
      expect(expected, `preset ${p.id}`).toBe(valuesOf(p.id).indexOf(targetOf(p.id)));
      if ((expected as number) < 0) {
        expect(last?.result, `preset ${p.id}`).toBe('not-found');
      } else {
        expect(last?.result, `preset ${p.id}`).toBe('found');
        expect(Object.values(last?.pointers ?? {}), `preset ${p.id}`).toContain(expected);
      }
    }
  });

  it('never uses more than two sqrt(n) comparisons', () => {
    // The bound, and the whole reason the algorithm exists: the jump phase costs
    // one comparison per block and the scan phase one per cell of the single
    // block it landed in. n = 12 gives a step of 3, four blocks, so 2 * 4 = 8
    // comparisons is the ceiling and no preset comes close.
    const n = valuesOf('hit-first-block').length;
    const bound = 2 * Math.ceil(Math.sqrt(n));
    expect(bound).toBe(8);
    for (const p of jumpSearchAlgo.presets) {
      const ops = Number(run(p.id).trace.at(-1)?.vars?.['ops'] ?? -1);
      expect(ops, `preset ${p.id}`).toBeLessThanOrEqual(bound);
      expect(countOf(p.id, 'jump') + countOf(p.id, 'scan'), `preset ${p.id}`).toBe(ops);
    }
  });

  it('skips whole blocks with one comparison each', () => {
    // n = 12, step = 3, so four blocks. A target in the first block needs one
    // jump probe; a target in the last needs four. That is the √n against n
    // trade in four numbers.
    expect(countOf('hit-first-block', 'jump')).toBe(1);
    expect(countOf('hit-last-block', 'jump')).toBe(4);
    expect(countOf('hit-first-block', 'scan')).toBe(2);
    expect(countOf('hit-last-block', 'scan')).toBe(2);
    expect(run('hit-last-block').count).toBeGreaterThan(run('hit-first-block').count);
  });

  it('never scans a block at all when the target is past the end', () => {
    // The cheapest failure path in the family. The last fence post is still
    // smaller than the target, which proves every cell is, so the jump phase
    // ends the search by itself — no `block-boundary` frame, no `scan` frame.
    expect(countOf('past-end', 'jump')).toBe(4);
    expect(countOf('past-end', 'scan')).toBe(0);
    expect(countOf('past-end', 'block-boundary')).toBe(0);
    expect(countOf('past-end', 'past-end')).toBe(1);
    expect(run('past-end').trace.at(-1)?.result).toBe('not-found');
  });

  it('scans the whole block before declaring a miss', () => {
    // The other failure path: the target is in a gap, so the jump phase lands on
    // the right block and the scan walks all three of its cells.
    expect(countOf('not-in-array', 'block-boundary')).toBe(1);
    expect(countOf('not-in-array', 'scan')).toBe(3);
    expect(countOf('not-in-array', 'exhausted')).toBe(1);
  });

  it('shows the block boundaries as an overlay row on every frame', () => {
    // Without the overlay the jumps are invisible: the main array looks
    // identical before and after a leap, because nothing is written. The
    // auxiliary row is what turns "it moved" into "it moved to block 3".
    for (const { presetId, result } of runEveryPreset(jumpSearchAlgo)) {
      const p = jumpSearchAlgo.presets.find((x) => x.id === presetId);
      const n = (p?.input.type === 'numbers' ? p.input.values.length : 0) || 0;
      const step = Math.max(1, Math.floor(Math.sqrt(n)));
      // The boundaries the algorithm itself would compute for this length: the
      // last index of each block, with the final short block clipped to n - 1.
      const expected = Array.from(
        { length: Math.ceil(n / step) },
        (_, b) => Math.min((b + 1) * step, n) - 1,
      );
      let withOverlay = 0;
      for (const frame of result.trace) {
        if (!('overlay' in frame) || !frame.overlay) continue;
        withOverlay += 1;
        expect(frame.overlay.label, `preset ${presetId}`).toContain('block');
        expect(frame.overlay.values, `preset ${presetId}`).toEqual(expected);
      }
      expect(withOverlay, `preset ${presetId}: frames without the block row`).toBeGreaterThan(0);
    }
    // n = 11 with a step of 3 gives four blocks ending at 2, 5, 8 and 10 — the
    // last one is short, and that clipped final boundary is the case worth
    // pinning, because it is the one an off-by-one gets wrong.
    const eleven = valuesOf('hit-last-block');
    expect(eleven).toHaveLength(11);
    const step = Math.max(1, Math.floor(Math.sqrt(eleven.length)));
    expect(step).toBe(3);
    expect(
      Array.from(
        { length: Math.ceil(eleven.length / step) },
        (_, b) => Math.min((b + 1) * step, eleven.length) - 1,
      ),
    ).toEqual([2, 5, 8, 10]);
  });

  it('is deterministic: the same input always yields the same trace', () => {
    expect(JSON.stringify(run('hit-first-block').trace)).toBe(
      JSON.stringify(run('hit-first-block').trace),
    );
  });

  it('terminates on degenerate input', () => {
    for (const values of [[], [42]]) {
      const { trace, error, aborted } = runTrace(jumpSearchAlgo, {
        input: { type: 'numbers', values },
        presetParams: { target: 42 },
      });
      expect(error, `values ${JSON.stringify(values)}`).toBeUndefined();
      expect(aborted).toBe(false);
      expect(validateTrace(trace)).toEqual([]);
      expect(trace.at(-1)?.result).toBe(values.length === 0 ? 'not-found' : 'found');
    }
  });

  it('stops when asked to', () => {
    let calls = 0;
    const result = runTrace(
      jumpSearchAlgo,
      { input: preset('hit-last-block').input, presetParams: preset('hit-last-block').params },
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

  it('declares only anchors that its own code can highlight', () => {
    // Union across every preset: `past-end` never reaches the scan, and
    // `not-in-array` never reaches `hit`, so one preset cannot cover them all.
    const reachable = new Set(
      jumpSearchAlgo.presets.flatMap((p) => anchorsInTrace(run(p.id).trace)),
    );
    for (const a of jumpSearchAlgo.anchors) {
      expect(reachable.has(a), `anchor ${a} is never emitted by any preset`).toBe(true);
    }
  });
});
