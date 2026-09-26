import { describe, expect, it } from 'vitest';
import { styleForKey } from '../../../features/viewport/palette.ts';
import { anchorsInTrace, LANGS, parseCode, resolveAnchor } from '../../code/anchors.ts';
import type { MaterialiseResult } from '../../trace/materialise.ts';
import { runEveryPreset, runTrace, validateTrace } from '../../trace/materialise.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import { PALETTE_ORDER } from '../../trace/types.ts';
import type { Preset } from '../types.ts';
import { largestRectangleAlgo, referenceLargestRectangle } from './largest-rectangle.ts';

/**
 * The local contract for this module.
 *
 * `contract.test.ts` looks *down* from the registry, so it cannot see an
 * algorithm until somebody registers it — which is exactly the failure mode the
 * orphan check was added for. Until then, this file carries the checks the
 * registry would have enforced:
 *
 *  - valid traces on every preset, and the final area matches a deliberately
 *    naive O(n²) scan over every `(left, right)` span — the obviously-correct
 *    version, which is a genuinely independent check on the stack;
 *  - the width arithmetic, asserted directly from `vars` on every measurement
 *    frame, because an off-by-one in `left` produces a plausible number on most
 *    inputs rather than an obvious failure;
 *  - no two same-coloured highlight groups in one frame;
 *  - the overlay row is a well-formed non-decreasing stack in *every* frame;
 *  - all four listings expose the same anchor set, every declared anchor has a
 *    note in every language, and every declared anchor is actually emitted.
 */

const preset = (id: string): Preset => {
  const p = largestRectangleAlgo.presets.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

const run = (id: string) => runTrace(largestRectangleAlgo, { input: preset(id).input });

const valuesOf = (id: string): number[] => {
  const input = preset(id).input;
  return input.type === 'numbers' ? input.values : [];
};

/** `runEveryPreset` with the frame narrowed to this module's. See the sibling test. */
const everyPreset = (): Array<{ presetId: string; result: MaterialiseResult<ArrayFrame> }> =>
  largestRectangleAlgo.presets.map((p) => ({
    presetId: p.id,
    result: runTrace(largestRectangleAlgo, { input: p.input, presetParams: p.params }),
  }));

const areaOf = (frame: { result?: string | null } | undefined): number =>
  frame?.result === undefined || frame?.result === null ? 0 : Number(frame.result);

describe('largest rectangle in a histogram', () => {
  it('produces a structurally valid trace on every preset', () => {
    // `runEveryPreset` rather than the local helper, deliberately: this is the
    // same entry point the registry-level contract test uses.
    for (const { presetId, result } of runEveryPreset(largestRectangleAlgo)) {
      expect(result.error, `preset ${presetId}`).toBeUndefined();
      expect(result.trace.length, `preset ${presetId}`).toBeGreaterThan(0);
      expect(result.truncated, `preset ${presetId}`).toBe(false);
      expect(validateTrace(result.trace), `preset ${presetId}`).toEqual([]);
    }
  });

  it('pins the narration for the tall-middle preset', () => {
    // A golden narration snapshot: if this changes, the *teaching* changed. The
    // chosen slice is the part worth pinning — a pop, the boundary arithmetic it
    // produces, and the push that follows.
    expect(
      run('tall-middle')
        .trace.slice(3, 10)
        .map((f) => f.note),
    ).toMatchInlineSnapshot(`
      [
        "Bar 1 has height 3. The stack's top is bar 0 (height 4), and 3 is shorter, so bar 0 can never grow again — this is the first bar to its right that is too low.",
        "Bar 0 (height 4) is finished: bar 1 (height 3) is the first thing to its right that is shorter, so its right boundary is index 0. Nothing is on the stack beneath it, so the left boundary is -1 — a virtual bar outside the histogram, which is exactly why the width counts it.",
        "Height 4 × width 1 — indices 0 to 0, since 0 - -1 = 1 — is area 4. That beats the best so far, 0, so the winner is now bar 0 over 1 bar.",
        "Bar 1 (height 3) is the only candidate left — the pops emptied the stack — so it now carries the whole run on its own, and it will be measured from index 1 rightwards until something shorter closes it off.",
        "Bar 2 has height 2. The stack's top is bar 1 (height 3), and 2 is shorter, so bar 1 can never grow again — this is the first bar to its right that is too low.",
        "Bar 1 (height 3) is finished: bar 2 (height 2) is the first thing to its right that is shorter, so its right boundary is index 1. Nothing is on the stack beneath it, so the left boundary is -1 — a virtual bar outside the histogram, which is exactly why the width counts it.",
        "Height 3 × width 2 — indices 0 to 1, since 1 - -1 = 2 — is area 6. That beats the best so far, 4, so the winner is now bar 1 over 2 bars.",
      ]
    `);
  });

  it('ends on the area the quadratic reference computes', () => {
    // The independent check: every `(left, right)` span with a running minimum
    // height. Three lines, quadratic, and impossible to get subtly wrong — which
    // is exactly what a reference has to be.
    for (const { presetId, result } of everyPreset()) {
      const last = result.trace[result.trace.length - 1];
      expect(areaOf(last), `preset ${presetId}`).toBe(
        referenceLargestRectangle(valuesOf(presetId)),
      );
      expect(last?.anchor, `preset ${presetId}`).toBe('done');
    }
  });

  it('has expectations that agree with the same reference', () => {
    for (const p of largestRectangleAlgo.presets) {
      const e = largestRectangleAlgo.expectations.find((x) => x.presetId === p.id);
      expect(e, `preset ${p.id} has no expectation`).toBeDefined();
      expect(e?.args[0], `preset ${p.id} args`).toEqual(valuesOf(p.id));
      expect(e?.result, `preset ${p.id} result`).toBe(referenceLargestRectangle(valuesOf(p.id)));
    }
    expect(largestRectangleAlgo.expectations).toHaveLength(largestRectangleAlgo.presets.length);
  });

  it('does the width arithmetic correctly on every single measurement', () => {
    // The off-by-one, asserted rather than described. Every `area` frame must
    // satisfy all of it at once: the left boundary is exclusive, the right is
    // inclusive, the width is their difference, the area is height × width, and
    // the highlighted window is exactly the span between them. A generator that
    // used `right - left - 1` would still produce a plausible final answer on
    // most inputs, so this is the assertion that catches it.
    let measured = 0;
    for (const { presetId, result } of everyPreset()) {
      for (const frame of result.trace) {
        if (frame.anchor !== 'area') continue;
        measured += 1;
        const where = `preset ${presetId} frame ${frame.index}`;
        const v = frame.vars ?? {};
        const left = Number(v['left']);
        const right = Number(v['right']);
        const width = Number(v['width']);
        const height = Number(v['height']);
        const area = Number(v['area']);
        expect(right - left, `${where}: width is not right - left`).toBe(width);
        expect(height * width, `${where}: area is not height x width`).toBe(area);
        expect(width, `${where}: non-positive width`).toBeGreaterThan(0);
        // The window group is the rectangle the narration claims to be measuring,
        // and it must be a real rectangle: nothing inside it shorter than the
        // height, at least one bar in it exactly the height, and the bar just
        // past it too short to extend. A generator that used `right - left - 1`
        // would still produce a plausible final answer on most inputs, so this is
        // the assertion that catches it.
        expect(frame.highlight?.['window'], `${where}: no window group`).toEqual(
          Array.from({ length: width }, (_, k) => left + 1 + k),
        );
        const span = frame.values.slice(left + 1, right + 1);
        for (let k = 0; k < span.length; k++) {
          expect(
            span[k],
            `${where}: bar ${left + 1 + k} is shorter than the height`,
          ).toBeGreaterThanOrEqual(height);
        }
        expect(span, `${where}: no bar of height ${height} inside its own rectangle`).toContain(
          height,
        );
        expect(
          frame.values[right + 1] ?? 0,
          `${where}: the rectangle could grow right`,
        ).toBeLessThan(height);
      }
    }
    expect(measured).toBeGreaterThan(20);
  });

  it('never retracts a best area, and reports the winning span', () => {
    for (const { presetId, result } of everyPreset()) {
      const values = valuesOf(presetId);
      let seen = 0;
      for (const frame of result.trace) {
        // Only the frames that carry a running maximum have one to compare.
        const raw = frame.vars?.['best'];
        if (raw === undefined) continue;
        const best = Number(raw);
        expect(
          best,
          `preset ${presetId} frame ${frame.index}: best went down`,
        ).toBeGreaterThanOrEqual(seen);
        seen = best;
      }
      const last = result.trace[result.trace.length - 1];
      if (values.length === 0) return;
      const window = last?.highlight?.['window'] ?? [];
      const answer = last?.highlight?.['answer'] ?? [];
      expect(window.length, `preset ${presetId}: no winning span marked`).toBeGreaterThan(0);
      expect(answer, `preset ${presetId}: no winning bar marked`).toHaveLength(1);
      // The marked span really does have the marked area, recomputed here.
      const height = values[answer[0] as number] as number;
      expect(height * window.length, `preset ${presetId}: marked span is wrong`).toBe(seen);
    }
  });

  it('costs at most 2n + 1 operations whatever the data does', () => {
    // n + 1 bar visits including the sentinel, and at most n measurements, since
    // every bar is pushed once and popped at most once. The rising staircase is
    // the case that pins the other end: nothing pops during the scan, so all five
    // of its measurements happen in the sentinel burst.
    for (const { presetId, result } of everyPreset()) {
      const last = result.trace[result.trace.length - 1];
      const n = valuesOf(presetId).length;
      const ops = Number(last?.vars?.['ops']);
      expect(ops, `preset ${presetId}`).toBeLessThanOrEqual(2 * n + 1);
      expect(ops, `preset ${presetId}`).toBeGreaterThanOrEqual(n + 1);
    }
    const countOf = (id: string, anchor: string): number =>
      run(id).trace.filter((f) => f.anchor === anchor).length;
    expect(countOf('rising-staircase', 'scan')).toBe(valuesOf('rising-staircase').length);
    expect(countOf('rising-staircase', 'pop')).toBe(valuesOf('rising-staircase').length);
    expect(countOf('rising-staircase', 'sentinel')).toBe(1);
    expect(countOf('empty', 'scan')).toBe(0);
    expect(countOf('empty', 'area')).toBe(0);
  });

  it('never shows two same-coloured groups in the same frame', () => {
    // The palette deliberately reuses hues across tiers, so the guarantee that
    // matters is the narrow one: within one frame, never a collision.
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

  it('uses only highlight names the palette knows, and at most three at a time', () => {
    const known = new Set<string>(PALETTE_ORDER);
    for (const { presetId, result } of everyPreset()) {
      for (const frame of result.trace) {
        const entries = Object.entries(frame.highlight ?? {});
        for (const [key] of entries) {
          expect(known.has(key), `preset ${presetId}: unknown highlight "${key}"`).toBe(true);
        }
        const visible = entries.filter(([, v]) => v.length > 0);
        expect(
          visible.length,
          `preset ${presetId} frame ${frame.index}: ${visible.length} groups`,
        ).toBeLessThanOrEqual(3);
      }
    }
  });

  it('draws the non-decreasing stack in the overlay row of every frame', () => {
    // The frame-structure assertion this project asks for. The stack is invisible
    // to the parity harness and it is the entire algorithm, so nothing else would
    // catch an overlay that is unordered, holds a stale index, or shares an array
    // between frames. Three invariants:
    //
    //   1. the overlay holds *indices* into the row above, in increasing order;
    //   2. the heights those indices point at are non-decreasing left to right.
    //      Non-decreasing, not increasing: the pop test is a strict `>`, so two
    //      bars of equal height are allowed to sit side by side, and that is
    //      exactly what the plateau preset is there to show;
    //   3. it is never longer than the array, and it never contains the sentinel
    //      index n — the sentinel is a position, not a bar, and there is no cell
    //      to point at.
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
          expect(idx, `${where}: overlay index ${idx} is the sentinel`).toBeLessThan(n);
          if (k === 0) continue;
          const prevIdx = stack[k - 1] as number;
          expect(idx, `${where}: indices are not increasing`).toBeGreaterThan(prevIdx);
          expect(
            frame.values[idx] as number,
            `${where}: stack is not non-decreasing at ${prevIdx} -> ${idx}`,
          ).toBeGreaterThanOrEqual(frame.values[prevIdx] as number);
        }
        // A copied array, not the live one: two frames of the same run must not
        // share the overlay, or stepping backwards shows the future.
        expect(overlay?.values, where).not.toBe(frame.values);
      }
    }
  });

  it('keeps the sentinel off the stack and the cursor in bounds', () => {
    // The sentinel bar is a *position*: the `i` pointer walks to n, which
    // `validateTrace` allows (a pointer may sit one past the last cell), but no
    // highlight group may name index n.
    for (const { presetId, result } of everyPreset()) {
      for (const frame of result.trace) {
        const where = `preset ${presetId} frame ${frame.index}`;
        if (frame.anchor !== 'sentinel') continue;
        expect(Number(frame.pointers?.['i']), `${where}: sentinel cursor`).toBe(
          valuesOf(presetId).length,
        );
        expect(
          Object.values(frame.highlight ?? {}).flat(),
          `${where}: sentinel marked a bar`,
        ).not.toContain(valuesOf(presetId).length);
      }
    }
  });

  it('measures a plateau once per bar, and the longest run last', () => {
    // The `>` vs `>=` choice, in numbers. Four equal bars: with a strict `>`
    // nothing pops during the scan, and the sentinel measures widths 1, 2, 3, 4
    // in turn — so the widest run is measured *last* and wins. With `>=` the
    // first three would have collapsed as they arrived and the same area would be
    // measured once. Both are correct; only one of them draws these frames.
    const areas = run('plateau')
      .trace.filter((f) => f.anchor === 'area')
      .map((f) => Number(f.vars?.['area']));
    expect(areas).toEqual([7, 14, 21, 28]);
    expect(run('plateau').trace.filter((f) => f.anchor === 'scan')).toHaveLength(4);
  });

  it('treats a zero-height bar as a wall, not as a candidate height', () => {
    // `4, 0, 6, 2, 5, 0, 3`: nothing can cross a zero, so the winner is the 6
    // alone at area 6 — and the two zero bars are still on the stack at the end,
    // because nothing is shorter than 0. Not a leak: a height-0 rectangle has
    // area 0 and can never win.
    const last = run('with-zeros').trace.at(-1);
    expect(areaOf(last)).toBe(6);
    expect(last?.overlay?.values).toEqual([1, 5]);
    expect(last?.highlight?.['answer']).toEqual([2]);
  });

  it('is deterministic: the same input always yields the same trace', () => {
    expect(JSON.stringify(run('random').trace)).toBe(JSON.stringify(run('random').trace));
    expect(JSON.stringify(run('with-zeros').trace)).toBe(JSON.stringify(run('with-zeros').trace));
  });

  it('terminates on degenerate input', () => {
    for (const values of [[], [0], [7], [5, 5], [0, 0, 0], [3, 1, 4, 1, 5]]) {
      const { trace, error, aborted } = runTrace(largestRectangleAlgo, {
        input: { type: 'numbers', values },
      });
      expect(error, `values ${JSON.stringify(values)}`).toBeUndefined();
      expect(aborted, `values ${JSON.stringify(values)}`).toBe(false);
      expect(trace.length, `values ${JSON.stringify(values)}`).toBeGreaterThan(0);
      expect(validateTrace(trace), `values ${JSON.stringify(values)}`).toEqual([]);
      expect(areaOf(trace.at(-1)), `values ${JSON.stringify(values)}`).toBe(
        referenceLargestRectangle(values),
      );
    }
  });

  it('stops when asked to', () => {
    let calls = 0;
    const result = runTrace(
      largestRectangleAlgo,
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
    const sets = LANGS.map((lang) =>
      Object.keys(parseCode(lang, largestRectangleAlgo.lesson.code[lang]).anchors).sort(),
    );
    expect(sets[1]).toEqual(sets[0]);
    expect(sets[2]).toEqual(sets[0]);
    expect(sets[3]).toEqual(sets[0]);
    expect(sets[0]?.sort()).toEqual([...largestRectangleAlgo.anchors].sort());

    for (const lang of LANGS) {
      const parsed = parseCode(lang, largestRectangleAlgo.lesson.code[lang]);
      for (const anchor of largestRectangleAlgo.anchors) {
        expect(resolveAnchor(parsed, anchor), `${lang}/${anchor}`).not.toBeNull();
        const notes = largestRectangleAlgo.lesson.notes[lang] ?? {};
        expect(notes[anchor]?.length ?? 0, `${lang}/${anchor}: missing note`).toBeGreaterThan(15);
        // The notes are authored anchor-first so the four languages sit side by
        // side; four identical strings means the cross-language difference the
        // docs ask for was never written.
        expect(
          new Set(LANGS.map((l) => largestRectangleAlgo.lesson.notes[l]?.[anchor])).size,
          `${anchor}: all four notes are identical`,
        ).toBeGreaterThan(1);
      }
    }
  });

  it('emits every declared anchor from some preset, and nothing undeclared', () => {
    const reachable = new Set(
      largestRectangleAlgo.presets.flatMap((p) => anchorsInTrace(run(p.id).trace)),
    );
    for (const a of largestRectangleAlgo.anchors) {
      expect(reachable.has(a), `anchor ${a} is never emitted by any preset`).toBe(true);
    }
    const declared = new Set(largestRectangleAlgo.anchors);
    for (const { presetId, result } of everyPreset()) {
      for (const frame of result.trace) {
        expect(declared.has(frame.anchor), `preset ${presetId}: ${frame.anchor}`).toBe(true);
      }
      for (const lang of LANGS) {
        for (const key of Object.keys(largestRectangleAlgo.lesson.notes[lang] ?? {})) {
          expect(reachable.has(key), `${lang}: note "${key}" is never reached`).toBe(true);
        }
      }
    }
  });
});
