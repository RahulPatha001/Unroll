import { describe, expect, it } from 'vitest';
import { styleForKey } from '../../../features/viewport/palette.ts';
import { anchorsInTrace, LANGS, parseCode, resolveAnchor } from '../../code/anchors.ts';
import type { MaterialiseResult } from '../../trace/materialise.ts';
import { runEveryPreset, runTrace, validateTrace } from '../../trace/materialise.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import { PALETTE_ORDER } from '../../trace/types.ts';
import type { Preset } from '../types.ts';
import { nextGreaterElementAlgo, referenceNextGreater } from './next-greater-element.ts';

/**
 * The local contract for this module.
 *
 * `contract.test.ts` looks *down* from the registry, so it cannot see an
 * algorithm until somebody registers it — which is exactly the failure mode the
 * orphan check was added for. Until then, this file has to carry the checks the
 * registry would have enforced, or the module ships unverified:
 *
 *  - valid traces on every preset, and the final answer matches an independent
 *    O(n²) reference (not the generator's own reasoning);
 *  - no two same-coloured highlight groups in one frame, which the palette
 *    cannot guarantee for us because hues are deliberately reused across tiers;
 *  - the overlay row is a well-formed monotonic stack in *every* frame, since
 *    the auxiliary structure is the entire lesson and no other harness looks at
 *    it;
 *  - all four listings expose the same anchor set, every declared anchor has a
 *    note in every language, and every declared anchor is actually emitted.
 */

const preset = (id: string): Preset => {
  const p = nextGreaterElementAlgo.presets.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const run = (id: string) => runTrace(nextGreaterElementAlgo, { input: preset(id).input });

/**
 * Every preset, typed to this module's frame.
 *
 * `runEveryPreset` takes the untyped `AlgoDef` and so hands back the whole
 * `Frame` union, where `overlay` and `values` do not exist on the members that
 * lack them. This is the same walk with the frame narrowed, because the frame
 * assertions below are about *array* frames and about the overlay row.
 */
const everyPreset = (): Array<{ presetId: string; result: MaterialiseResult<ArrayFrame> }> =>
  nextGreaterElementAlgo.presets.map((p) => ({
    presetId: p.id,
    result: runTrace(nextGreaterElementAlgo, { input: p.input, presetParams: p.params }),
  }));

const valuesOf = (id: string): number[] => {
  const input = preset(id).input;
  return input.type === 'numbers' ? input.values : [];
};

/**
 * The answer array, read back off the final frame.
 *
 * `FrameMeta.result` is a string, so the answer is parsed back out of it rather
 * than carried in a field. That is a feature of the assertion: it also checks
 * the `result` chip a student reads is the whole answer rather than a summary.
 */
const answerOf = (frame: { result?: string | null } | undefined): number[] =>
  !frame?.result ? [] : (frame.result as string).split(', ').map(Number);

describe('next greater element', () => {
  it('produces a structurally valid trace on every preset', () => {
    // `runEveryPreset` rather than the local helper, deliberately: this is the
    // same entry point the registry-level contract test uses, so this assertion
    // stays honest if the two ever drift.
    for (const { presetId, result } of runEveryPreset(nextGreaterElementAlgo)) {
      expect(result.error, `preset ${presetId}`).toBeUndefined();
      expect(result.trace.length, `preset ${presetId}`).toBeGreaterThan(0);
      expect(result.truncated, `preset ${presetId}`).toBe(false);
      expect(validateTrace(result.trace), `preset ${presetId}`).toEqual([]);
    }
  });

  it('pins the narration for the random preset', () => {
    // A golden narration snapshot. If this changes, the *teaching* changed, not
    // just the implementation — which is exactly the kind of diff a reviewer
    // wants to see rather than absorb. The first nine frames are chosen to
    // include a *batch* pop, which is the frame the whole algorithm exists for.
    expect(
      run('random')
        .trace.slice(0, 9)
        .map((f) => f.note),
    ).toMatchInlineSnapshot(`
      [
        "Nothing has been scanned and nothing is waiting. Each of the 9 values either gets answered by a later value that beats it or ends the run still holding -1, and the row underneath — the stack of unanswered indices — is what tells the two apart.",
        "Index 0 (value 44) is the first value in, so there is nothing on the stack to compare against and nothing to pop. Every value to its right is a candidate answer, and the nearest of them wins.",
        "The stack was empty, so index 0 (value 44) is the only thing waiting. Its answer can only come from index 1 onwards.",
        "Index 1 (value 28) arrives with 1 index still waiting. The top is index 0 (value 44), and 44 is not smaller than 28, so index 0 keeps waiting.",
        "Nothing smaller than 28 is left waiting, so index 1 joins the stack at depth 2 and the order is non-increasing again. The top is the smallest value still waiting, which is exactly why whatever arrives next beats it first.",
        "Index 2 (value 53) arrives with 2 indices still waiting. The top is index 1 (value 28), and 53 beats 28, so index 1 is answered right here.",
        "Index 1 (value 28) has been waiting since step 2, and 53 sits immediately to its right and beats it, so the nearest greater element is the value next door. Pop it — no other candidate can be closer, and this one is already in hand.",
        "Index 0 (value 44) has been waiting since step 1, and 53 > 44, so it pops. 53 is its next greater element because every value in between (indices 1 to 1) was already smaller than 44 — anything greater would have popped this index on the way past.",
        "2 answers written at once: NGE[1] = 53, NGE[0] = 53. One arriving value answered a whole run of waiting indices, top first, and they all get the same answer because none of the values between them was greater. The waiting stack is now empty, so the next value starts a fresh run.",
      ]
    `);
  });

  it('ends on the answer the quadratic reference computes', () => {
    // The independent check: a plain outward scan per index, with no stack and
    // no shared reasoning. If the stack version and this ever disagree, one of
    // them is wrong and the disagreement is the bug report.
    for (const { presetId, result } of everyPreset()) {
      const last = result.trace[result.trace.length - 1];
      expect(answerOf(last), `preset ${presetId}`).toEqual(
        referenceNextGreater(valuesOf(presetId)),
      );
      expect(last?.anchor, `preset ${presetId}`).toBe('done');
    }
  });

  it('has expectations that agree with the same reference', () => {
    // The machine-checked claim and the reference must be the same claim, or
    // `verify:langs` is checking the four listings against a lie.
    for (const p of nextGreaterElementAlgo.presets) {
      const e = nextGreaterElementAlgo.expectations.find((x) => x.presetId === p.id);
      expect(e, `preset ${p.id} has no expectation`).toBeDefined();
      expect(e?.args[0], `preset ${p.id} args`).toEqual(valuesOf(p.id));
      expect(e?.result, `preset ${p.id} result`).toEqual(referenceNextGreater(valuesOf(p.id)));
    }
    expect(nextGreaterElementAlgo.expectations).toHaveLength(nextGreaterElementAlgo.presets.length);
  });

  it('costs exactly 2n operations whatever the data does', () => {
    // n visits, one per index; and n answers, because every index is answered
    // exactly once — by a pop during the scan or by the flush at the end. The
    // presets differ enormously in shape and not at all in cost, which is the
    // linearity claim stated as a number a test can hold.
    for (const { presetId, result } of everyPreset()) {
      const last = result.trace[result.trace.length - 1];
      const n = valuesOf(presetId).length;
      expect(Number(last?.vars?.['ops']), `preset ${presetId}`).toBe(2 * n);
    }
  });

  it('never shows two same-coloured groups in the same frame', () => {
    // The palette deliberately reuses hues across tiers — 33 distinguishable
    // colours is not a thing a student can hold in their head — so the guarantee
    // that matters is the narrow one: within one frame, never a collision.
    for (const { presetId, result } of everyPreset()) {
      for (const frame of result.trace) {
        const byColour = new Map<string, string[]>();
        for (const [key, idxs] of Object.entries(frame.highlight ?? {})) {
          // A group with no members is not visible, so it cannot collide.
          if (idxs.length === 0) continue;
          const colour = styleForKey(key).fill;
          byColour.set(colour, [...(byColour.get(colour) ?? []), key]);
        }
        for (const [colour, keys] of byColour) {
          expect(
            keys.length,
            `preset ${presetId} frame ${frame.index}: ${keys.join(' + ')} share ${colour}`,
          ).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('uses only highlight names the palette knows', () => {
    // An unknown key wraps onto rank 0 and silently becomes the `answer` colour.
    const known = new Set<string>(PALETTE_ORDER);
    const used = new Set<string>();
    for (const { result } of everyPreset()) {
      for (const frame of result.trace) {
        for (const key of Object.keys(frame.highlight ?? {})) used.add(key);
      }
    }
    expect([...used].filter((k) => !known.has(k))).toEqual([]);
    // And never more than three groups at once, which is what keeps the legend
    // readable on a nine-cell row.
    for (const { result } of everyPreset()) {
      for (const frame of result.trace) {
        const groups = Object.entries(frame.highlight ?? {}).filter(([, v]) => v.length > 0);
        expect(
          groups.length,
          `frame ${frame.index} has ${groups.length} groups`,
        ).toBeLessThanOrEqual(3);
      }
    }
  });

  it('draws the monotonic stack in the overlay row of every frame', () => {
    // The frame-structure assertion this project asks for. The stack is invisible
    // to the parity harness and it is the entire algorithm, so nothing else in
    // the suite would catch an overlay that is unordered, holds a stale index, or
    // shares an array between frames. Three invariants:
    //
    //   1. the overlay holds *indices* into the row above, in increasing order —
    //      an index is pushed once and popped from the end, so the sequence can
    //      never go backwards or repeat;
    //   2. the values those indices point at are non-increasing left to right,
    //      which is the invariant the whole "one pass is enough" argument rests
    //      on. Non-increasing, not decreasing: the pop test is a strict `<`, so
    //      two equal values are allowed to sit side by side;
    //   3. it is never longer than the array, because every entry in it is an
    //      index of that array.
    for (const { presetId, result } of everyPreset()) {
      const n = valuesOf(presetId).length;
      for (const frame of result.trace) {
        const where = `preset ${presetId} frame ${frame.index}`;
        const overlay = frame.overlay;
        expect(overlay, `${where}: no overlay row`).toBeDefined();
        expect(overlay?.label, where).toContain('stack');
        expect(overlay?.label, where).toContain('indices');
        const stack = overlay?.values ?? [];
        expect(stack.length, `${where}: stack longer than the array`).toBeLessThanOrEqual(n);
        for (let k = 0; k < stack.length; k++) {
          const idx = stack[k] as number;
          expect(Number.isInteger(idx), `${where}: overlay entry ${idx} is not an index`).toBe(
            true,
          );
          expect(idx, `${where}: overlay index ${idx} outside [0, ${n})`).toBeGreaterThanOrEqual(0);
          expect(idx, `${where}: overlay index ${idx} outside [0, ${n})`).toBeLessThan(n);
          if (k === 0) continue;
          const prevIdx = stack[k - 1] as number;
          expect(idx, `${where}: indices are not increasing`).toBeGreaterThan(prevIdx);
          const prevVal = frame.values[prevIdx] as number;
          const val = frame.values[idx] as number;
          expect(
            val,
            `${where}: stack is not non-increasing at ${prevIdx} -> ${idx}`,
          ).toBeLessThanOrEqual(prevVal);
        }
        // A copied array, not the live one: two frames of the same run must not
        // share the overlay, or stepping backwards shows the future.
        expect(overlay?.values, where).not.toBe(frame.values);
      }
    }
  });

  it('marks a stack top in the overlay whenever the stack is not empty', () => {
    // The overlay's `top` pointer is how the student sees which end the pops come
    // from, and -1 is not a legal index, so an empty stack must have no pointer.
    for (const { presetId, result } of everyPreset()) {
      for (const frame of result.trace) {
        const depth = frame.overlay?.values.length ?? 0;
        const top = frame.overlay?.pointers?.['top'];
        if (depth === 0) expect(top, `preset ${presetId} frame ${frame.index}`).toBeUndefined();
        else expect(top, `preset ${presetId} frame ${frame.index}`).toBe(depth - 1);
      }
    }
  });

  it('reaches the no-greater path, and only where it should', () => {
    // The leftover flush is a first-class step, not an afterthought: descending
    // input and all-equal input never pop during the scan, so the whole array is
    // the "no answer" case, and ascending input pops on every single step.
    const countOf = (id: string, anchor: string): number =>
      run(id).trace.filter((f) => f.anchor === anchor).length;

    expect(countOf('descending', 'no-greater')).toBe(valuesOf('descending').length);
    expect(countOf('all-equal', 'no-greater')).toBe(valuesOf('all-equal').length);
    expect(countOf('ascending', 'no-greater')).toBe(1);
    expect(countOf('empty', 'no-greater')).toBe(0);
    expect(countOf('ascending', 'pop')).toBe(valuesOf('ascending').length - 1);
    // Every pop is its own frame, and every batch is summarised once: the random
    // run is the only preset with a value that answers more than one at a time.
    expect(countOf('random', 'resolve')).toBeGreaterThan(0);
    expect(countOf('random', 'resolve')).toBeLessThan(countOf('random', 'pop'));
  });

  it('treats an equal value to the right as no answer at all', () => {
    // The strict `<`, in one assertion. Every value in this preset is 5, so a
    // `<=` pop test would answer each index with the next 5 — a plausible-looking
    // array of answers that is wrong in every position.
    const equal = valuesOf('all-equal');
    expect(equal.length).toBeGreaterThan(2);
    expect(new Set(equal).size).toBe(1);
    expect(answerOf(run('all-equal').trace.at(-1))).toEqual(equal.map(() => -1));
  });

  it('is deterministic: the same input always yields the same trace', () => {
    expect(JSON.stringify(run('random').trace)).toBe(JSON.stringify(run('random').trace));
    expect(JSON.stringify(run('descending').trace)).toBe(JSON.stringify(run('descending').trace));
  });

  it('terminates on degenerate input', () => {
    for (const values of [[], [42], [7, 7], [1, 2]]) {
      const { trace, error, aborted } = runTrace(nextGreaterElementAlgo, {
        input: { type: 'numbers', values },
      });
      expect(error, `values ${JSON.stringify(values)}`).toBeUndefined();
      expect(aborted, `values ${JSON.stringify(values)}`).toBe(false);
      expect(trace.length, `values ${JSON.stringify(values)}`).toBeGreaterThan(0);
      expect(validateTrace(trace), `values ${JSON.stringify(values)}`).toEqual([]);
      expect(answerOf(trace.at(-1)), `values ${JSON.stringify(values)}`).toEqual(
        referenceNextGreater(values),
      );
    }
  });

  it('stops when asked to', () => {
    // `runTrace` polls `shouldStop` between frames, which is exactly how the
    // app's worker cancels a runaway algorithm.
    let calls = 0;
    const result = runTrace(
      nextGreaterElementAlgo,
      { input: preset('random').input },
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

  it('gives every language the same anchors, and every anchor a note', () => {
    // The four listings are separate artefacts and the contract test cannot see
    // them until the module is registered, so the "same set of anchors in all
    // four" rule is checked here.
    const sets = LANGS.map((lang) =>
      Object.keys(parseCode(lang, nextGreaterElementAlgo.lesson.code[lang]).anchors).sort(),
    );
    expect(sets[1]).toEqual(sets[0]);
    expect(sets[2]).toEqual(sets[0]);
    expect(sets[3]).toEqual(sets[0]);
    expect(sets[0]?.sort()).toEqual([...nextGreaterElementAlgo.anchors].sort());

    for (const lang of LANGS) {
      const parsed = parseCode(lang, nextGreaterElementAlgo.lesson.code[lang]);
      for (const anchor of nextGreaterElementAlgo.anchors) {
        expect(resolveAnchor(parsed, anchor), `${lang}/${anchor}`).not.toBeNull();
        const notes = nextGreaterElementAlgo.lesson.notes[lang] ?? {};
        expect(notes[anchor]?.length ?? 0, `${lang}/${anchor}: missing note`).toBeGreaterThan(15);
        // The notes are authored anchor-first precisely so the four languages sit
        // side by side; identical text in all four means the cross-language
        // difference the docs ask for was never written.
        expect(
          new Set(LANGS.map((l) => nextGreaterElementAlgo.lesson.notes[l]?.[anchor])).size,
          `${anchor}: all four notes are identical`,
        ).toBeGreaterThan(1);
      }
    }
  });

  it('emits every declared anchor from some preset, and nothing undeclared', () => {
    // Union across every preset: the no-greater path is unreachable from
    // ascending input, so no single preset can cover them all.
    const reachable = new Set(
      nextGreaterElementAlgo.presets.flatMap((p) => anchorsInTrace(run(p.id).trace)),
    );
    for (const a of nextGreaterElementAlgo.anchors) {
      expect(reachable.has(a), `anchor ${a} is never emitted by any preset`).toBe(true);
    }
    const declared = new Set(nextGreaterElementAlgo.anchors);
    for (const { presetId, result } of everyPreset()) {
      for (const frame of result.trace) {
        expect(declared.has(frame.anchor), `preset ${presetId}: ${frame.anchor}`).toBe(true);
      }
      // No dead notes either: a note the code never reaches is a note about a
      // line a student will never see highlighted.
      for (const lang of LANGS) {
        for (const key of Object.keys(nextGreaterElementAlgo.lesson.notes[lang] ?? {})) {
          expect(reachable.has(key), `${lang}: note "${key}" is never reached`).toBe(true);
        }
      }
    }
  });
});
