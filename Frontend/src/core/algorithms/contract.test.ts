import { readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { styleForKey } from '../../features/viewport/palette.ts';
import type { ParsedCode } from '../code/anchors.ts';
import { anchorsInTrace, LANGS, parseCode, resolveAnchor } from '../code/anchors.ts';
import { runTrace, validateTrace } from '../trace/materialise.ts';
import { PALETTE_ORDER } from '../trace/types.ts';
import { CATALOG_BY_ID } from './catalog.ts';
import { ALL_ALGORITHMS, getAlgorithm } from './registry.ts';

/**
 * The contract test. Runs over *every* algorithm in the registry, on every CI
 * pass.
 *
 * This is the single highest-value test in the project, because it catches the
 * failure mode that a 50-algorithm codebase actually has: someone adds an
 * algorithm, it renders fine on the one input they tried, and nobody notices it
 * emits an anchor with no matching line in the Python listing, or loops forever,
 * or produces a trace with a pointer off the end of the array.
 */
describe('algorithm contract', () => {
  it('has no algorithm module that nobody registered', () => {
    /*
     * `avl-rotate` and `tree-height` sat on disk — 1093 and 682 lines, 40 and 32
     * anchors, all four language listings — and were in neither the registry nor
     * the catalog. They were built into their own lazy chunks on every build and
     * never loaded, never rendered, and never checked by anything: not the
     * contract suite, not the 4-language parity run, not a single test. The
     * sidebar simply did not offer them.
     *
     * Every check in this file looks *down* from the registry, so an unregistered
     * module is invisible to all of them. This looks the other way: from the
     * directory listing back to the registry.
     */
    const registered = new Set(ALL_ALGORITHMS.map((a) => a.id));
    const root = 'src/core/algorithms';
    const orphans: string[] = [];
    for (const dir of readdirSync(root)) {
      if (!statSync(`${root}/${dir}`).isDirectory()) continue;
      for (const file of readdirSync(`${root}/${dir}`)) {
        if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
        // A module's filename is its id. `heapsort` used to live in
        // `heap-sort-extract.ts`, so grepping for either name found half the
        // story; it has been renamed so the two can never disagree again.
        const stem = file.replace(/\.ts$/, '');
        if (!registered.has(stem)) orphans.push(`${dir}/${stem}`);
      }
    }
    expect(
      orphans,
      `Unregistered algorithm modules: ${orphans.join(', ')}. Add them to registry.ts and re-run \`npm run gen:catalog\`, or delete them.`,
    ).toEqual([]);
  });

  it('the catalog and the registry list the same algorithms', () => {
    expect(Object.keys(CATALOG_BY_ID).sort()).toEqual(ALL_ALGORITHMS.map((a) => a.id).sort());
  });

  it('has no metadata drift between the catalog and the modules', () => {
    const problems: string[] = [];
    for (const algo of ALL_ALGORITHMS) {
      const entry = CATALOG_BY_ID[algo.id];
      if (!entry) {
        problems.push(`${algo.id}: missing from the catalog`);
        continue;
      }
      if (entry.title !== algo.title) problems.push(`${algo.id}: title drift`);
      if (entry.summary !== algo.summary) problems.push(`${algo.id}: summary drift`);
      if (entry.category !== algo.category) problems.push(`${algo.id}: category drift`);
      if (entry.viewport !== algo.viewport) problems.push(`${algo.id}: viewport drift`);
      if (entry.level !== algo.level) problems.push(`${algo.id}: level drift`);
    }
    expect(problems).toEqual([]);
  });

  it('gives every algorithm a complete, honest definition', () => {
    for (const algo of ALL_ALGORITHMS) {
      const where = algo.id;
      expect(algo.title.length, `${where}: title`).toBeGreaterThan(0);
      expect(algo.summary.length, `${where}: summary`).toBeGreaterThan(10);
      // `intuition` must answer "when would I use this", not repeat `summary`.
      expect(algo.intuition.length, `${where}: intuition`).toBeGreaterThan(40);
      expect(algo.complexity.average, `${where}: complexity.average`).toMatch(/O\(/);
      expect(algo.complexity.worst, `${where}: complexity.worst`).toMatch(/O\(/);
      expect(algo.complexity.space, `${where}: complexity.space`).toMatch(/O\(/);
      expect(algo.presets.length, `${where}: needs at least one preset`).toBeGreaterThan(0);
      expect(algo.anchors.length, `${where}: needs declared anchors`).toBeGreaterThan(0);
    }
  });

  it('gives every algorithm code in all four languages', () => {
    for (const algo of ALL_ALGORITHMS) {
      for (const lang of LANGS) {
        expect(algo.lesson.code[lang]?.trim().length ?? 0, `${algo.id}/${lang}`).toBeGreaterThan(
          20,
        );
        expect(
          algo.lesson.entry[lang]?.trim().length ?? 0,
          `${algo.id}/${lang} entry`,
        ).toBeGreaterThan(0);
        expect(algo.lesson.glue[lang], `${algo.id}/${lang} glue`).toBeTruthy();
      }
    }
  });

  it('runs, terminates, and produces a valid trace on every preset', () => {
    for (const algo of ALL_ALGORITHMS) {
      for (const preset of algo.presets) {
        const { trace, truncated, error } = runTrace(algo, {
          input: preset.input,
          presetParams: preset.params,
        });
        const where = `${algo.id}/${preset.id}`;
        expect(error, `${where}: threw ${error?.message}`).toBeUndefined();
        expect(trace.length, `${where}: produced no frames`).toBeGreaterThan(0);
        expect(truncated, `${where}: hit the frame cap`).toBe(false);
        expect(validateTrace(trace), `${where}: invalid trace`).toEqual([]);
      }
    }
  });

  it('anchors every reachable frame to a real line in all four languages', () => {
    for (const algo of ALL_ALGORITHMS) {
      const parsed: Record<string, ParsedCode> = {};
      for (const lang of LANGS) parsed[lang] = parseCode(lang, algo.lesson.code[lang]);

      // All four listings must expose the same set of anchors. A language that
      // cannot express a step is a curriculum bug, not a cosmetic one.
      const perLang = LANGS.map((l) => Object.keys(parsed[l]?.anchors ?? {}).sort());
      const reference = perLang[0] ?? [];
      for (const lang of LANGS.slice(1)) {
        expect(perLang[LANGS.indexOf(lang)], `${algo.id}/${lang}: different anchor set`).toEqual(
          reference,
        );
      }

      for (const preset of algo.presets) {
        const { trace } = runTrace(algo, { input: preset.input, presetParams: preset.params });
        const reachable = anchorsInTrace(trace);
        expect(reachable.length, `${algo.id}/${preset.id}: no anchors reached`).toBeGreaterThan(0);

        for (const anchor of reachable) {
          for (const lang of LANGS) {
            const p = parsed[lang] as ParsedCode;
            const range = resolveAnchor(p, anchor);
            expect(range, `${algo.id}: anchor "${anchor}" has no line in ${lang}`).not.toBeNull();
            const line = p.lines[(range?.start ?? 1) - 1] ?? '';
            expect(line, `${algo.id}/${lang}/${anchor}: marker line is blank`).toContain('@anchor');
          }
        }
      }
    }
  });

  it('explains every anchor in every language', () => {
    for (const algo of ALL_ALGORITHMS) {
      for (const lang of LANGS) {
        const notes = algo.lesson.notes[lang] ?? {};
        for (const anchor of algo.anchors) {
          expect(
            notes[anchor]?.length ?? 0,
            `${algo.id}/${lang}/${anchor}: missing note`,
          ).toBeGreaterThan(15);
        }
      }
    }
  });

  it('has no dead anchors: every note is reachable from some trace', () => {
    for (const algo of ALL_ALGORITHMS) {
      const reachable = new Set<string>();
      for (const preset of algo.presets) {
        const { trace } = runTrace(algo, { input: preset.input, presetParams: preset.params });
        for (const a of anchorsInTrace(trace)) reachable.add(a);
      }
      for (const lang of LANGS) {
        for (const key of Object.keys(algo.lesson.notes[lang] ?? {})) {
          expect(
            reachable.has(key),
            `${algo.id}/${lang}: note "${key}" is never reached by any trace`,
          ).toBe(true);
        }
      }
      for (const anchor of algo.anchors) {
        expect(
          reachable.has(anchor),
          `${algo.id}: declared anchor "${anchor}" is never emitted`,
        ).toBe(true);
      }
    }
  });

  it('declares one expectation per preset, and no orphans', () => {
    for (const algo of ALL_ALGORITHMS) {
      const presetIds = new Set(algo.presets.map((p) => p.id));
      const covered = new Set(algo.expectations.map((e) => e.presetId));
      for (const id of presetIds) {
        expect(covered.has(id), `${algo.id}: preset "${id}" has no expectation to verify`).toBe(
          true,
        );
      }
      for (const id of covered) {
        expect(presetIds.has(id), `${algo.id}: expectation "${id}" has no matching preset`).toBe(
          true,
        );
      }
    }
  });

  it('emits only declared anchors', () => {
    for (const algo of ALL_ALGORITHMS) {
      const declared = new Set(algo.anchors);
      for (const preset of algo.presets) {
        const { trace } = runTrace(algo, { input: preset.input, presetParams: preset.params });
        for (const f of trace) {
          expect(
            declared.has(f.anchor),
            `${algo.id}/${preset.id}: undeclared anchor "${f.anchor}"`,
          ).toBe(true);
        }
      }
    }
  });

  it('paints every highlight with a colour of its own', () => {
    /*
     * Ten algorithms across the graph, sorting, sliding-window and linked-list
     * families were emitting highlight keys that were not in `PALETTE_ORDER`:
     * `settled`, `relaxed`, `pivot`, `reached`, `inMst`, `filled`, `tail`,
     * `reversed`, `ids`, `dominated`.
     *
     * `highlightRank` returns `PALETTE_ORDER.length` for an unknown key, and
     * `styleForKey` indexes modulo the style count — so every one of those ten
     * wrapped onto rank 0 and rendered in the `answer` colour. Dijkstra's
     * "settled" nodes, Bellman-Ford's "relaxed" nodes and Quick Sort's "pivot"
     * were all the same amber. Nothing failed: the class was valid, the trace
     * was correct, the legend named the group, and the only symptom was that
     * the one distinction the palette exists to draw was absent.
     *
     * A new highlight name is now a build failure rather than a silent collision.
     * To add one: append it to `PALETTE_ORDER` and add a matching literal style
     * to `palette.ts`. Both files are checked against each other already.
     */
    const known = new Set<string>(PALETTE_ORDER);
    const unknown = new Map<string, Set<string>>();
    for (const algo of ALL_ALGORITHMS) {
      for (const preset of algo.presets) {
        const { trace } = runTrace(algo, { input: preset.input, presetParams: preset.params });
        for (const f of trace) {
          for (const key of Object.keys(f.highlight ?? {})) {
            if (known.has(key)) continue;
            if (!unknown.has(key)) unknown.set(key, new Set());
            unknown.get(key)?.add(algo.id);
          }
        }
      }
    }
    const report = [...unknown.entries()]
      .map(([key, ids]) => `${key} (used by ${[...ids].join(', ')})`)
      .sort();
    expect(
      report,
      `Highlight keys not in PALETTE_ORDER, so they all share one colour: ${report.join('; ')}`,
    ).toEqual([]);
  });

  it('never shows two same-coloured groups in the same frame', () => {
    /*
     * The palette reuses hues across tiers, on purpose: 33 globally distinct
     * colours is not something a student can hold in their head, and a palette
     * that claims otherwise is lying. What is real, and what the eye and the
     * legend both depend on, is the narrower guarantee — the groups visible in
     * *one frame* never collide.
     *
     * This asserts it against actual traces, so a new algorithm cannot introduce
     * a collision by using two ranks that happen to share a hue.
     */
    const clashes = new Set<string>();
    for (const algo of ALL_ALGORITHMS) {
      for (const preset of algo.presets) {
        const { trace } = runTrace(algo, { input: preset.input, presetParams: preset.params });
        for (const f of trace) {
          const byColour = new Map<string, string[]>();
          for (const key of Object.keys(f.highlight ?? {})) {
            // A group with no members is not visible, so it cannot collide.
            if ((f.highlight?.[key]?.length ?? 0) === 0) continue;
            const colour = styleForKey(key).fill;
            byColour.set(colour, [...(byColour.get(colour) ?? []), key]);
          }
          for (const [colour, keys] of byColour) {
            if (keys.length > 1) {
              clashes.add(
                `${algo.id}/${preset.id} @${f.index}: ${keys.join(' + ')} share ${colour}`,
              );
            }
          }
        }
      }
    }
    expect([...clashes].sort(), `${clashes.size} same-frame colour collision(s)`).toEqual([]);
  });
});

describe('registry lookups', () => {
  it('resolves by id and rejects unknown ids', () => {
    expect(getAlgorithm('bubble-sort')?.title).toBe('Bubble Sort');
    expect(getAlgorithm('nope')).toBeUndefined();
  });
});
