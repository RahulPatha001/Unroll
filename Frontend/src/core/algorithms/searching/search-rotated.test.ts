import { describe, expect, it } from 'vitest';
import { anchorsInTrace } from '../../code/anchors.ts';
import { runEveryPreset, runTrace, validateTrace } from '../../trace/materialise.ts';
import type { Preset } from '../types.ts';
import { searchRotatedAlgo } from './search-rotated.ts';

const preset = (id: string): Preset => {
  const p = searchRotatedAlgo.presets.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const run = (id: string) =>
  runTrace(searchRotatedAlgo, { input: preset(id).input, presetParams: preset(id).params });

const countOf = (id: string, anchor: string): number =>
  run(id).trace.filter((f) => f.anchor === anchor).length;

const valuesOf = (id: string): number[] => {
  const input = preset(id).input;
  return input.type === 'numbers' ? input.values : [];
};

const targetOf = (id: string): number => Number(preset(id).params?.['target'] ?? 0);
const rotationOf = (id: string): number => Number(preset(id).params?.['rotation'] ?? 0);

/** Rotate right by k, exactly as the generator does before searching. */
const rotateRight = (values: number[], k: number): number[] => {
  if (values.length === 0) return [];
  const shift = ((k % values.length) + values.length) % values.length;
  if (shift === 0) return [...values];
  return [...values.slice(values.length - shift), ...values.slice(0, values.length - shift)];
};

describe('search in a rotated sorted array', () => {
  it('produces a structurally valid trace on every preset', () => {
    for (const { presetId, result } of runEveryPreset(searchRotatedAlgo)) {
      expect(validateTrace(result.trace), `preset ${presetId}`).toEqual([]);
      expect(result.trace.length).toBeGreaterThan(0);
      expect(result.truncated).toBe(false);
    }
  });

  it('pins the narration for the rotation-3 preset', () => {
    // A golden narration snapshot. If this changes, the *teaching* changed, not
    // just the implementation — which is exactly the kind of diff a reviewer
    // wants to see rather than absorb. Rotation 3 is the first preset where the
    // array on screen is genuinely not sorted, so it is the most representative.
    expect(
      run('rotation-3')
        .trace.slice(0, 6)
        .map((f) => f.note),
    ).toMatchInlineSnapshot(`
      [
        "Rotated right by 3, so the largest values now sit at the front and index 0 is no longer the smallest. The array is *not* sorted, and no index says otherwise — but the rotation is a single cut, so at every probe at least one half of the window still is.",
        "Probe index 5: 33 against a target of 33. Equal — no reasoning needed, this is a hit.",
        "33 equals the target at index 5, so the search returns 5 after 1 probe — exactly as many as an ordinary binary search would have used on a sorted array of this size. The rotation cost nothing.",
      ]
    `);
  });

  it('reports the index in the rotated array, matching the expectation', () => {
    for (const p of searchRotatedAlgo.presets) {
      const result = runTrace(searchRotatedAlgo, { input: p.input, presetParams: p.params });
      const last = result.trace.at(-1);
      const rotated = rotateRight(valuesOf(p.id), rotationOf(p.id));
      const expected = rotated.indexOf(targetOf(p.id));

      expect(expected, `preset ${p.id}`).toBe(
        searchRotatedAlgo.expectations.find((e) => e.presetId === p.id)?.result,
      );
      // The expectation is stated against the *rotated* array, which is what the
      // language implementations receive, not the sorted one the preset stores.
      expect(searchRotatedAlgo.expectations.find((e) => e.presetId === p.id)?.args?.[0]).toEqual(
        rotated,
      );
      if (expected < 0) {
        expect(last?.result, `preset ${p.id}`).toBe('not-found');
      } else {
        expect(last?.result, `preset ${p.id}`).toBe('found');
        expect(Object.values(last?.pointers ?? {}), `preset ${p.id}`).toContain(expected);
        expect(rotated[expected], `preset ${p.id}`).toBe(targetOf(p.id));
      }
    }
  });

  it('at rotation 0 it is ordinary binary search and never takes the rotated branch', () => {
    // The control case. With no rotation the array is sorted, so `a[low] <= a[mid]`
    // holds at every probe and the `right-sorted` branch — the four lines that
    // make this algorithm different from binary search — is never reached. If it
    // ever is, the rotation is not being applied, or the branch condition is
    // wrong.
    expect(rotationOf('rotation-0')).toBe(0);
    expect(countOf('rotation-0', 'right-sorted')).toBe(0);
    expect(countOf('rotation-0', 'left-sorted')).toBeGreaterThan(0);
    // The other presets *do* need it, so the assertion above is not vacuous.
    for (const id of ['rotation-half', 'rotation-ties', 'rotation-miss']) {
      expect(countOf(id, 'right-sorted'), id).toBeGreaterThan(0);
    }
  });

  it('costs no more probes than plain binary search would, whatever the rotation', () => {
    // The algorithm's real claim: supporting a rotated array adds four lines and
    // one extra comparison per probe, and no extra *probes*. n = 12, so the bound
    // is ceil(log2(13)) = 4, and every rotation preset comes in at or under it.
    const n = valuesOf('rotation-0').length;
    const bound = Math.ceil(Math.log2(n + 1));
    expect(bound).toBe(4);
    for (const p of searchRotatedAlgo.presets) {
      const probes = Number(run(p.id).trace.at(-1)?.vars?.['ops'] ?? -1);
      expect(probes, `preset ${p.id}`).toBeLessThanOrEqual(bound);
      // Every probe is a `compare`; the branch frames are narration about that
      // same probe, not extra work.
      expect(countOf(p.id, 'compare'), `preset ${p.id}`).toBe(probes);
    }
  });

  it('takes both sorted-half branches once the cut is inside the window', () => {
    // Rotated by half of 11, so the discontinuity is dead centre. The first
    // probes see a sorted left half; the one that straddles the cut has to fall
    // back on the right half being in order instead.
    expect(countOf('rotation-half', 'left-sorted')).toBe(1);
    expect(countOf('rotation-half', 'right-sorted')).toBe(1);
    expect(countOf('rotation-half', 'compare')).toBe(3);
  });

  it('is deterministic: the same input always yields the same trace', () => {
    expect(JSON.stringify(run('rotation-3').trace)).toBe(JSON.stringify(run('rotation-3').trace));
  });

  it('honours the rotation param, so the same array gives different answers', () => {
    // The param is load-bearing, not decoration: one stored array, two searches.
    const id = 'rotation-0';
    const values = valuesOf(id);
    const asIs = runTrace(searchRotatedAlgo, {
      input: preset(id).input,
      presetParams: { target: values[8] as number, rotation: 0 },
    });
    const turned = runTrace(searchRotatedAlgo, {
      input: preset(id).input,
      presetParams: { target: values[8] as number, rotation: 5 },
    });
    expect(asIs.trace.at(-1)?.result).toBe('found');
    expect(turned.trace.at(-1)?.result).toBe('found');
    // Same target value, but it lives at a different index once rotated.
    expect(Object.values(asIs.trace.at(-1)?.pointers ?? {})).toContain(8);
    expect(Object.values(turned.trace.at(-1)?.pointers ?? {})).not.toContain(8);
    expect(rotateRight(values, 5)[8]).not.toBe(values[8] as number);
  });

  it('terminates on degenerate input', () => {
    for (const values of [[], [42]]) {
      const { trace, error, aborted } = runTrace(searchRotatedAlgo, {
        input: { type: 'numbers', values },
        presetParams: { target: 42, rotation: 3 },
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
      searchRotatedAlgo,
      { input: preset('rotation-miss').input, presetParams: preset('rotation-miss').params },
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
    // Union across every preset: the miss preset emits `exhausted` and no `hit`,
    // and only the rotated presets reach `right-sorted`.
    const reachable = new Set(
      searchRotatedAlgo.presets.flatMap((p) => anchorsInTrace(run(p.id).trace)),
    );
    for (const a of searchRotatedAlgo.anchors) {
      expect(reachable.has(a), `anchor ${a} is never emitted by any preset`).toBe(true);
    }
  });
});
