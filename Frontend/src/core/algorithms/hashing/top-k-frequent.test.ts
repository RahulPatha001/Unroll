import { describe, expect, it } from 'vitest';
import { styleForKey } from '../../../features/viewport/palette.ts';
import { anchorsInTrace, LANGS, parseCode, resolveAnchor } from '../../code/anchors.ts';
import type { MaterialiseResult } from '../../trace/materialise.ts';
import { runEveryPreset, runTrace, validateTrace } from '../../trace/materialise.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import { PALETTE_ORDER } from '../../trace/types.ts';
import type { Preset } from '../types.ts';
import { referenceTopK, topKFrequentAlgo } from './top-k-frequent.ts';

/**
 * Top K Frequent Elements — the per-module test.
 *
 * Two of the things checked here cannot be checked by the contract test yet,
 * because the contract test looks down from the registry and this module is not
 * in it: the no-same-colour-in-one-frame rule, and snapshot immutability. Both
 * are asserted locally, against `styleForKey` itself rather than a copy of it.
 *
 * The other reason this file exists is the tie-break rule. `all-ties` is the
 * preset that makes it load-bearing, and the assertions below check the answer
 * against a reference that states the rule once — not against the generator, and
 * not against a hand-written list of expected answers, which would only prove
 * the list agrees with itself.
 */

const preset = (id: string): Preset => {
  const p = topKFrequentAlgo.presets.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const run = (id: string): MaterialiseResult<ArrayFrame> =>
  runTrace(topKFrequentAlgo, { input: preset(id).input, presetParams: preset(id).params });

/**
 * `runEveryPreset` over every preset, re-typed so the frames are `ArrayFrame`s.
 * The helper is still the one the contract test uses, so nothing here can drift
 * from what the registry-wide sweep will do once this module is registered.
 */
const everyPreset = (): Array<{ presetId: string; result: MaterialiseResult<ArrayFrame> }> =>
  runEveryPreset(topKFrequentAlgo).map((r) => ({
    presetId: r.presetId,
    result: r.result as MaterialiseResult<ArrayFrame>,
  }));

/** A preset's input values and effective `k`, narrowed once. */
const specOf = (id: string): { values: number[]; k: number } => {
  const p = preset(id);
  const values = p.input.type === 'numbers' ? p.input.values : [];
  return { values, k: Math.max(1, Math.round(Number(p.params?.k ?? 1))) };
};

const claimedResult = (id: string): number[] => {
  const e = topKFrequentAlgo.expectations.find((x) => x.presetId === id);
  if (!e) throw new Error(`no expectation for ${id}`);
  return e.result as number[];
};

/** `result` on the last frame, which is where the k values are reported. */
const finalAnswer = (trace: ArrayFrame[]): number[] => {
  const raw = trace[trace.length - 1]?.result;
  if (typeof raw !== 'string' || raw.length === 0) return [];
  return raw.split(',').map((s) => Number(s.trim()));
};

const distinctOf = (id: string): number => new Set(specOf(id).values).size;

describe('top k frequent — trace shape', () => {
  it('produces a structurally valid trace on every preset', () => {
    for (const { presetId, result } of everyPreset()) {
      expect(validateTrace(result.trace), `preset ${presetId}`).toEqual([]);
      expect(result.trace.length, `preset ${presetId}: no frames`).toBeGreaterThan(0);
      expect(result.truncated, `preset ${presetId}: hit the frame cap`).toBe(false);
      expect(result.error, `preset ${presetId}: threw`).toBeUndefined();
    }
  });

  it('pins the narration for the all-ties preset', () => {
    // A golden narration snapshot. The all-ties preset is the one where the
    // tie-break rule *is* the answer, so its wording is the thing most worth
    // pinning: a rewrite that quietly dropped the rule would be a teaching
    // regression, not a refactor. The counting frames come first, then every
    // frame that makes the selection decision — which on this input is nothing
    // but tie-breaks.
    const { trace } = run('all-ties');
    const deciding = new Set(['select', 'insert', 'evict', 'done']);
    expect([
      ...trace.slice(0, 2).map((f) => f.note),
      ...trace.filter((f) => deciding.has(f.anchor)).map((f) => f.note),
    ]).toMatchInlineSnapshot(`
      [
        "12 values to count, and the top 2 wanted. Two passes: first count every value into a frequency table, then pick the k best out of it. Nothing in the array moves — the main row is the input, and the second row below it is the table being built.",
        "Index 0 holds 8, and the table has never seen it. A miss costs the same as a hit, which is the property that makes counting a linear pass rather than a nested one. 0 distinct values so far.",
        "The count is done: 4 distinct values in the table, and 12 lookups so far. The selection pass now walks the keys in first-appearance order and asks one question per key — is this value better than the current k-th best? — keeping only the answer. No full sort is needed, and the k-th best only ever improves, so a candidate that loses once is out for good.",
        "The answer holds 0 of 2, so there is no k-th best to beat yet and 8 simply takes the next free slot. This is the "the list is not full" half of the same decision — with one comparison instead of two, and no tie-break needed.",
        "8 joins the answer, which is now [8] — kept in answer order, most frequent first, so the ordering is free rather than a second thing to compute. 1 slot still free.",
        "The answer holds 1 of 2, so there is no k-th best to beat yet and 5 simply takes the next free slot. This is the "the list is not full" half of the same decision — with one comparison instead of two, and no tie-break needed.",
        "5 joins the answer, which is now [8, 5] — kept in answer order, most frequent first, so the ordering is free rather than a second thing to compute. 0 slots still free.",
        "7 (3 occurrences, first at index 3) is weighed against the k-th best 5 (3 occurrences, first at index 1) and loses: an equal count, and 3 is later than 1, so the tie-break goes against it. It is out of the answer for good — the k-th best only improves, so nothing later can re-open this. 2 of 2 slots filled.",
        "6 (3 occurrences, first at index 4) is weighed against the k-th best 5 (3 occurrences, first at index 1) and loses: an equal count, and 4 is later than 1, so the tie-break goes against it. It is out of the answer for good — the k-th best only improves, so nothing later can re-open this. 2 of 2 slots filled.",
        "The answer is [8, 5]: 8 (3), 5 (3). Counting took one linear pass — 12 lookups — and the selection pass weighed 4 candidates against a running answer of at most 2, so no candidate list is ever sorted in full. Ties were broken by first appearance throughout, which is a rule this implementation had to be told, not one the data provided.",
      ]
    `);
  });

  it('is deterministic: the same input always yields the same trace', () => {
    for (const p of topKFrequentAlgo.presets) {
      const a = runTrace(topKFrequentAlgo, { input: p.input, presetParams: p.params });
      const b = runTrace(topKFrequentAlgo, { input: p.input, presetParams: p.params });
      expect(JSON.stringify(a.trace), p.id).toBe(JSON.stringify(b.trace));
    }
  });

  it('does not throw on an empty array or a single element', () => {
    const empty = runTrace(topKFrequentAlgo, {
      input: { type: 'numbers', values: [] },
      params: { k: 2 },
    });
    expect(empty.error).toBeUndefined();
    expect(empty.trace.length).toBeGreaterThan(0);
    expect(finalAnswer(empty.trace)).toEqual([]);

    const one = runTrace(topKFrequentAlgo, {
      input: { type: 'numbers', values: [42] },
      params: { k: 1 },
    });
    expect(one.error).toBeUndefined();
    expect(finalAnswer(one.trace)).toEqual([42]);
  });

  it('never emits an undeclared anchor, and every declared anchor is emitted', () => {
    const declared = new Set(topKFrequentAlgo.anchors);
    const reachable = new Set<string>();
    for (const { presetId, result } of everyPreset()) {
      for (const f of result.trace) {
        expect(declared.has(f.anchor), `${presetId}: undeclared anchor "${f.anchor}"`).toBe(true);
        reachable.add(f.anchor);
      }
    }
    for (const a of topKFrequentAlgo.anchors) {
      expect(reachable.has(a), `anchor "${a}" is never emitted by any preset`).toBe(true);
    }
  });

  it('marks the same line in all four listings for every anchor', () => {
    const perLang = LANGS.map((l) =>
      Object.keys(parseCode(l, topKFrequentAlgo.lesson.code[l]).anchors).sort(),
    );
    for (let i = 1; i < perLang.length; i++) {
      expect(perLang[i], `anchor set differs in ${LANGS[i]}`).toEqual(perLang[0]);
    }
    for (const a of topKFrequentAlgo.anchors) {
      for (const l of LANGS) {
        const p = parseCode(l, topKFrequentAlgo.lesson.code[l]);
        const range = resolveAnchor(p, a);
        expect(range, `${l}: anchor "${a}" has no line`).not.toBeNull();
        expect(p.lines[(range?.start ?? 1) - 1] ?? '', `${l}/${a}`).toContain('@anchor');
      }
    }
  });

  it('gives every anchor a note in every language, and no note is dead', () => {
    const reachable = new Set<string>();
    for (const { result } of everyPreset()) {
      for (const a of anchorsInTrace(result.trace)) reachable.add(a);
    }
    for (const l of LANGS) {
      const notes = topKFrequentAlgo.lesson.notes[l] ?? {};
      for (const a of topKFrequentAlgo.anchors) {
        expect(notes[a]?.length ?? 0, `${l}/${a}: missing note`).toBeGreaterThan(15);
      }
      for (const key of Object.keys(notes)) {
        expect(reachable.has(key), `${l}: note "${key}" is never reached`).toBe(true);
      }
    }
  });

  it('states the tie-break rule in the code, not only in the copy', () => {
    // The rule has to appear in all four listings, because that is what makes
    // the four agree. A listing that omitted it would return a valid but
    // different answer and the parity harness would fail — this is the check
    // that catches it before that happens.
    for (const l of LANGS) {
      const code = topKFrequentAlgo.lesson.code[l];
      expect(code, `${l}: no tie-break comment`).toMatch(/TIE-BREAK RULE/);
      expect(code, `${l}: no first-appearance clause`).toMatch(/first/i);
    }
  });
});

describe('top k frequent — palette and snapshots', () => {
  it('never shows two same-coloured highlight groups in one frame', () => {
    const known = new Set<string>(PALETTE_ORDER);
    const clashes: string[] = [];
    for (const { presetId, result } of everyPreset()) {
      for (const f of result.trace) {
        const byColour = new Map<string, string[]>();
        for (const key of Object.keys(f.highlight ?? {})) {
          expect(known.has(key), `${presetId}: "${key}" is not in PALETTE_ORDER`).toBe(true);
          if ((f.highlight?.[key]?.length ?? 0) === 0) continue;
          const colour = styleForKey(key).fill;
          byColour.set(colour, [...(byColour.get(colour) ?? []), key]);
        }
        for (const [colour, keys] of byColour) {
          if (keys.length > 1) {
            clashes.push(`${presetId} @${f.index}: ${keys.join(' + ')} share ${colour}`);
          }
        }
      }
    }
    expect(clashes, clashes.join('; ')).toEqual([]);
  });

  it('keeps at most three highlight groups visible in any frame', () => {
    for (const { presetId, result } of everyPreset()) {
      for (const f of result.trace) {
        const live = Object.keys(f.highlight ?? {}).filter(
          (key) => (f.highlight?.[key]?.length ?? 0) > 0,
        );
        expect(live.length, `${presetId} @${f.index}: ${live.join(' + ')}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('copies values and the overlay into every frame, so none is shared', () => {
    // Frames are snapshots. The overlay is the one that is easy to get wrong:
    // its cells are rebuilt from the map on every frame, and a cached array
    // would quietly rewrite history.
    for (const { presetId, result } of everyPreset()) {
      const seenValues = new Set<unknown>();
      const seenOverlay = new Set<unknown>();
      for (const f of result.trace) {
        expect(seenValues.has(f.values), `${presetId} @${f.index}: values is shared`).toBe(false);
        seenValues.add(f.values);
        const overlay = f.overlay?.values;
        if (overlay === undefined) continue;
        expect(seenOverlay.has(overlay), `${presetId} @${f.index}: overlay is shared`).toBe(false);
        seenOverlay.add(overlay);
      }
    }
  });

  it('leaves the main row exactly as the input, in every frame', () => {
    // The counting pass must not touch the array it is counting. If a frame ever
    // reported a reordered or shortened `values`, the whole lesson would be a
    // lie while still looking perfectly plausible.
    for (const p of topKFrequentAlgo.presets) {
      const expected = p.input.type === 'numbers' ? p.input.values : [];
      for (const f of runTrace(topKFrequentAlgo, { input: p.input, presetParams: p.params })
        .trace) {
        expect(f.values, p.id).toEqual(expected);
      }
    }
  });

  it('grows the frequency table one cell at a time and never shrinks it', () => {
    for (const { presetId, result } of everyPreset()) {
      let previous = 0;
      for (const f of result.trace) {
        const size = f.overlay?.values.length ?? 0;
        expect(size, `${presetId} @${f.index}: table shrank`).toBeGreaterThanOrEqual(previous);
        expect(size, `${presetId} @${f.index}: table is bigger than the input`).toBeLessThanOrEqual(
          specOf(presetId).values.length,
        );
        previous = size;
      }
      // And it must end up holding every distinct value, or the selection pass
      // would be choosing from an incomplete table.
      expect(previous, `${presetId}: table did not reach every distinct value`).toBe(
        distinctOf(presetId),
      );
    }
  });
});

describe('top k frequent — the answer', () => {
  it('agrees with the reference on every preset', () => {
    for (const { presetId, result } of everyPreset()) {
      const { values, k } = specOf(presetId);
      expect(finalAnswer(result.trace), `${presetId}: trace answer`).toEqual(
        referenceTopK(values, k),
      );
      // ...and the machine-checkable claim, which is what the four language
      // listings are verified against. Same rule, independently computed.
      expect(claimedResult(presetId), `${presetId}: expectation`).toEqual(referenceTopK(values, k));
    }
  });

  it('never repeats a value and never returns more than there are distinct values', () => {
    for (const { presetId, result } of everyPreset()) {
      const answer = finalAnswer(result.trace);
      const { k } = specOf(presetId);
      const distinct = distinctOf(presetId);
      expect(new Set(answer).size, `${presetId}: the answer repeats a value`).toBe(answer.length);
      expect(answer.length, `${presetId}: longer than the distinct count`).toBeLessThanOrEqual(
        distinct,
      );
      expect(answer.length, `${presetId}: wrong length for k=${k}`).toBe(Math.min(k, distinct));
    }
  });

  it('sorts the answer by count descending, then by first appearance', () => {
    // The ordering is half the answer, so it is checked directly rather than
    // only through the reference.
    for (const { presetId, result } of everyPreset()) {
      const { values } = specOf(presetId);
      const counts = new Map<number, number>();
      const firsts = new Map<number, number>();
      values.forEach((v, i) => {
        counts.set(v, (counts.get(v) ?? 0) + 1);
        if (!firsts.has(v)) firsts.set(v, i);
      });
      const answer = finalAnswer(result.trace);
      for (let i = 1; i < answer.length; i++) {
        const a = answer[i - 1] as number;
        const b = answer[i] as number;
        const ordered =
          (counts.get(a) as number) > (counts.get(b) as number) ||
          ((counts.get(a) as number) === (counts.get(b) as number) &&
            (firsts.get(a) as number) < (firsts.get(b) as number));
        expect(ordered, `${presetId}: ${b} is out of order after ${a}`).toBe(true);
      }
    }
  });

  it('decides the all-ties preset entirely on first appearance', () => {
    // Four values, three occurrences each, k = 2. With the tie-break clause
    // missing this would be an arbitrary pair; with it, it is the two values
    // that appear first — a fact about the input, checkable by eye.
    const { values } = specOf('all-ties');
    const counts = new Map<number, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    // Every value really is tied — otherwise the preset is not testing anything.
    expect(new Set(counts.values()).size, 'all-ties is not actually all ties').toBe(1);

    const seen: number[] = [];
    for (const v of values) if (!seen.includes(v)) seen.push(v);
    expect(seen).toHaveLength(4);
    expect(claimedResult('all-ties')).toEqual(seen.slice(0, 2));
    expect(finalAnswer(run('all-ties').trace)).toEqual(seen.slice(0, 2));
  });

  it('answers k = 1 on a tie with the first value in the input', () => {
    const { values } = specOf('k-of-one');
    expect(claimedResult('k-of-one')).toEqual([values[0]]);
    expect(claimedResult('k-of-one')).toHaveLength(1);
  });

  it('returns every distinct value when k exceeds the distinct count', () => {
    expect(claimedResult('k-equals-distinct')).toHaveLength(4);
    expect(new Set(claimedResult('k-equals-distinct')).size).toBe(4);
  });

  it('evicts on the dominant preset, and the eviction is not a deletion', () => {
    // The value that occurs most arrives third, by which time two singletons
    // have taken both slots and one of them is pushed out. It is still in the
    // table afterwards: only the *selection* dropped it.
    const { trace } = run('dominant');
    expect(trace.filter((f) => f.anchor === 'evict').length).toBeGreaterThan(0);
    const last = trace[trace.length - 1] as ArrayFrame;
    expect(last.overlay?.values.length).toBe(distinctOf('dominant'));
    expect(claimedResult('dominant')).toHaveLength(2);
  });

  it('only reaches the selection anchors when there is a table to select from', () => {
    // An empty input announces the selection pass and then finds nothing to
    // weigh: no `insert`, no `evict`, and no `count` because nothing was read.
    expect(anchorsInTrace(run('empty').trace)).toEqual(['start', 'select', 'done']);
    const single = anchorsInTrace(run('single-value').trace);
    expect(single).toContain('insert');
    expect(single).not.toContain('evict');
  });

  it('declares one expectation per preset, with values and k positional', () => {
    const ids = topKFrequentAlgo.presets.map((p) => p.id);
    expect(topKFrequentAlgo.expectations.map((e) => e.presetId)).toEqual(ids);
    for (const e of topKFrequentAlgo.expectations) {
      expect(e.args, e.presetId).toHaveLength(2);
      const [values, k] = e.args as [number[], number];
      expect(Array.isArray(values), `${e.presetId}: first arg must be the values`).toBe(true);
      expect(Number.isInteger(k) && k >= 1, `${e.presetId}: k must be a positive integer`).toBe(
        true,
      );
      expect(Array.isArray(e.result), `${e.presetId}: result must be a list`).toBe(true);
    }
  });

  it('exposes k as a number param with a floor of 1', () => {
    const k = topKFrequentAlgo.params.find((p) => p.key === 'k');
    expect(k).toBeDefined();
    expect(k?.kind).toBe('number');
    expect(k?.min).toBe(1);
  });

  it('survives k larger than the input, and k typed as 0', () => {
    const values = [3, 3, 4];
    const big = runTrace(topKFrequentAlgo, {
      input: { type: 'numbers', values },
      params: { k: 9 },
    });
    expect(big.error).toBeUndefined();
    expect(finalAnswer(big.trace)).toEqual([3, 4]);
    const zero = runTrace(topKFrequentAlgo, {
      input: { type: 'numbers', values },
      params: { k: 0 },
    });
    expect(zero.error).toBeUndefined();
    // k is clamped to 1 rather than trusted: "top 0 of anything" is a legitimate
    // request and the answer is a single value, not a crash.
    expect(finalAnswer(zero.trace)).toEqual([3]);
  });

  it('stops when asked to', () => {
    let calls = 0;
    const result = runTrace(
      topKFrequentAlgo,
      { input: preset('clear-winner').input, presetParams: preset('clear-winner').params },
      {
        shouldStop: () => {
          calls += 1;
          return calls > 5;
        },
      },
    );
    expect(result.aborted).toBe(true);
    expect(result.trace.length).toBeLessThan(20);
  });
});
