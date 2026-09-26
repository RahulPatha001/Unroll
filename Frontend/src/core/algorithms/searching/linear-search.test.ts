import { describe, expect, it } from 'vitest';
import { anchorsInTrace } from '../../code/anchors.ts';
import { runEveryPreset, runTrace, validateTrace } from '../../trace/materialise.ts';
import type { Preset } from '../types.ts';
import { linearSearchAlgo } from './linear-search.ts';

const preset = (id: string): Preset => {
  const p = linearSearchAlgo.presets.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const run = (id: string) =>
  runTrace(linearSearchAlgo, { input: preset(id).input, presetParams: preset(id).params });

const countOf = (id: string, anchor: string): number =>
  run(id).trace.filter((f) => f.anchor === anchor).length;

const valuesOf = (id: string): number[] => {
  const input = preset(id).input;
  return input.type === 'numbers' ? input.values : [];
};

const targetOf = (id: string): number => Number(preset(id).params?.['target'] ?? 0);

describe('linear search', () => {
  it('produces a structurally valid trace on every preset', () => {
    for (const { presetId, result } of runEveryPreset(linearSearchAlgo)) {
      expect(validateTrace(result.trace), `preset ${presetId}`).toEqual([]);
      expect(result.trace.length).toBeGreaterThan(0);
      expect(result.truncated).toBe(false);
    }
  });

  it('pins the narration for the hit-early preset', () => {
    // A golden narration snapshot. If this changes, the *teaching* changed, not
    // just the implementation — which is exactly the kind of diff a reviewer
    // wants to see rather than absorb.
    expect(
      run('hit-early')
        .trace.slice(0, 6)
        .map((f) => f.note),
    ).toMatchInlineSnapshot(`
      [
        "Looking for 49 in 11 values. The array is in whatever order it arrived — linear search asks nothing of it, which is both its convenience and its limit.",
        "Compare index 0: 23 against the target 49. Not equal — the scan moves one cell right and everything before this index is now ruled out.",
        "Compare index 1: 37 against the target 49. Not equal — the scan moves one cell right and everything before this index is now ruled out.",
        "Compare index 2: 49 against the target 49. They are equal.",
        "49 equals the target at index 2, so the scan stops and returns 2. The 2 cells already visited were never the answer — that is the whole cost model, one comparison per cell.",
      ]
    `);
  });

  it('reports the index of the first match, or -1, matching the expectation', () => {
    for (const p of linearSearchAlgo.presets) {
      const result = runTrace(linearSearchAlgo, { input: p.input, presetParams: p.params });
      const last = result.trace.at(-1);
      const expected = linearSearchAlgo.expectations.find((e) => e.presetId === p.id)?.result;
      expect(expected, `preset ${p.id}`).toBe(valuesOf(p.id).indexOf(targetOf(p.id)));
      if ((expected as number) < 0) {
        expect(last?.result, `preset ${p.id}`).toBe('not-found');
      } else {
        expect(last?.result, `preset ${p.id}`).toBe('found');
        expect(Object.values(last?.pointers ?? {}), `preset ${p.id}`).toContain(expected);
      }
    }
  });

  it('costs one comparison per cell examined, and a miss always costs n', () => {
    // The whole cost model, and the asymmetry that motivates every index and
    // hash table in the family: finding a value costs however many cells
    // preceded it, but proving it *absent* costs every cell, every time.
    expect(Number(run('first-of-many').trace.at(-1)?.vars?.['ops'] ?? -1)).toBe(1);
    expect(Number(run('hit-early').trace.at(-1)?.vars?.['ops'] ?? -1)).toBe(3);
    expect(Number(run('hit-late').trace.at(-1)?.vars?.['ops'] ?? -1)).toBe(11);
    // A miss scans the entire array.
    expect(countOf('not-found', 'scan')).toBe(valuesOf('not-found').length);
    expect(countOf('hit-late', 'scan')).toBe(valuesOf('hit-late').length);
    // A hit stops at the match.
    expect(countOf('hit-early', 'scan')).toBe(3);
  });

  it('a late hit costs materially more than an early one', () => {
    // n = 11 either way; only the position of the target differs. This is the
    // gap binary search exists to close.
    expect(run('hit-late').count).toBeGreaterThan(run('hit-early').count * 2);
  });

  it('returns the leftmost match when the target repeats', () => {
    // Five of the twelve cells hold 2, and the scan runs in index order, so the
    // answer is 0 and the other four are never looked at. This is the one
    // behavioural difference from a hash lookup, which is also order-blind.
    expect(countOf('first-of-many', 'scan')).toBe(1);
    expect(run('first-of-many').trace.at(-1)?.result).toBe('found');
    expect(targetOf('first-of-many')).toBe(2);
    expect(valuesOf('first-of-many').filter((v) => v === 2).length).toBeGreaterThan(1);
  });

  it('is deterministic: the same input always yields the same trace', () => {
    expect(JSON.stringify(run('hit-early').trace)).toBe(JSON.stringify(run('hit-early').trace));
  });

  it('terminates on degenerate input', () => {
    for (const values of [[], [42]]) {
      const { trace, error, aborted } = runTrace(linearSearchAlgo, {
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
      linearSearchAlgo,
      { input: preset('hit-late').input, presetParams: preset('hit-late').params },
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
    // Union across every preset: no single preset emits both `found` and
    // `exhausted`, so checking one would be checking a subset.
    const reachable = new Set(
      linearSearchAlgo.presets.flatMap((p) => anchorsInTrace(run(p.id).trace)),
    );
    for (const a of linearSearchAlgo.anchors) {
      expect(reachable.has(a), `anchor ${a} is never emitted by any preset`).toBe(true);
    }
  });
});
