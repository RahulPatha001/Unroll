import type { AlgoDef } from '../algorithms/types.ts';
import { defaultParams } from '../algorithms/types.ts';
import type { AlgoInput } from '../input/types.ts';
import type { Frame } from './types.ts';

/**
 * Generator<Frame>  ->  Frame[]
 *
 * The eager phase of the two-phase model (plan §3.1). At the "Run" boundary the
 * lazy generator is drained into a flat, seekable array. This is the step that
 * buys O(1) bidirectional seeking: once materialised, "step backwards" is
 * `index--` and "scrub to frame N" is `trace[N]`, with no re-execution and no
 * knowledge of the algorithm in the player.
 *
 * Bounded inputs keep this cheap: 200 elements x 10k frames is a few MB of
 * plain JSON, and it is structured-cloneable to a Worker for free.
 */

export const MAX_FRAMES = 50_000;

export interface RunSpec {
  params?: Record<string, number | string | boolean>;
  input: AlgoInput;
  /** Preset params, merged after `params`. */
  presetParams?: Record<string, number | string | boolean>;
}

/**
 * The one function the app, the tests and the harness all call.
 *
 * It exists because `materialise(algo.run, ctx)` is a footgun: `run` is a
 * function, not a generator, and passing it to `materialise` type-checks fine
 * and then fails at runtime with "gen.next is not a function". Building the
 * `RunContext` in one place also means the seeded `shouldStop` and the param
 * defaults are guaranteed to be wired the same way everywhere.
 */
export function runTrace<TFrame extends Frame>(
  algo: AlgoDef<TFrame>,
  spec: RunSpec,
  options: MaterialiseOptions = {},
): MaterialiseResult<TFrame> {
  const params = {
    ...defaultParams(algo),
    ...(spec.params ?? {}),
    ...(spec.presetParams ?? {}),
  };
  // Cancellation is latched rather than sampled. Two reasons:
  //
  //  - An algorithm may poll `ctx.shouldStop()` itself and `return` early. That
  //    ends the generator cleanly, so `materialise` never gets a chance to set
  //    `aborted` — but the run *was* cancelled, and the UI needs to say so.
  //  - It makes `shouldStop` safe to call from two places (the generator and
  //    the materialiser) without the caller's counter racing against itself.
  let cancelled = false;
  const shouldStop = (): boolean => {
    if (cancelled) return true;
    if (options.shouldStop?.() === true) {
      cancelled = true;
      return true;
    }
    return false;
  };
  const gen = algo.run({ params, input: spec.input, shouldStop });
  const result = materialise(gen, { ...options, shouldStop });
  return cancelled ? { ...result, aborted: true } : result;
}

/** Convenience: run every preset of an algorithm and validate each trace. */
export function runEveryPreset(
  algo: AlgoDef,
  options: MaterialiseOptions = {},
): Array<{ presetId: string; result: MaterialiseResult }> {
  return algo.presets.map((p) => ({
    presetId: p.id,
    result: runTrace(algo, { input: p.input, presetParams: p.params }, options),
  }));
}

export interface MaterialiseOptions {
  /** Hard cap on frame count. Exceeding it truncates and sets `truncated`. */
  maxFrames?: number;
  /**
   * Cooperative cancellation, polled between frames. A runaway algorithm
   * (infinite recursion, a `while` that never advances) must not hang the
   * worker, so this is checked on every single yield rather than only between
   * algorithm-level steps.
   */
  shouldStop?: () => boolean;
  /** Called with a 0..1 progress value, for worker progress reporting. */
  onProgress?: (fraction: number) => void;
}

export interface MaterialiseResult<TFrame extends Frame = Frame> {
  trace: TFrame[];
  /** True if generation hit `maxFrames` and was cut short. */
  truncated: boolean;
  /** True if generation stopped early because `shouldStop()` returned true. */
  aborted: boolean;
  /** Number of frames actually produced. */
  count: number;
  /** Present when generation threw. The partial trace is still returned. */
  error?: { message: string; name: string };
}

export function materialise<TFrame extends Frame>(
  gen: Generator<TFrame, void, void>,
  options: MaterialiseOptions = {},
): MaterialiseResult<TFrame> {
  const { maxFrames = MAX_FRAMES, shouldStop, onProgress } = options;

  const trace: TFrame[] = [];
  let truncated = false;
  let aborted = false;
  let error: { message: string; name: string } | undefined;

  // Progress is reported on a log-ish schedule rather than every frame: at
  // 50k frames, a callback per frame is itself a measurable cost and the
  // consumer only ever renders a percentage.
  const progressEvery = Math.max(1, Math.floor(1000));

  try {
    let step = gen.next();
    while (!step.done) {
      const frame = step.value as TFrame;
      // The author never sets `index`; the materialiser owns it so that the
      // monotonicity invariant is structurally guaranteed, not merely
      // respected by convention across 50+ hand-written generators.
      frame.index = trace.length;
      trace.push(frame);

      if (trace.length % progressEvery === 0) onProgress?.(trace.length / maxFrames);

      if (trace.length >= maxFrames) {
        truncated = true;
        break;
      }
      if (shouldStop?.()) {
        aborted = true;
        break;
      }

      step = gen.next();
    }
  } catch (e) {
    // A partial trace is far more useful to a student than an exception: they
    // can scrub to the last good frame and see where it broke.
    error =
      e instanceof Error
        ? { message: e.message, name: e.name }
        : { message: String(e), name: 'Error' };
  }

  onProgress?.(1);
  return { trace, truncated, aborted, count: trace.length, ...(error ? { error } : {}) };
}

/**
 * Structural invariants every trace must satisfy. Cheap to check, and they
 * catch the single most common class of bug in a codebase like this: an
 * off-by-one in a loop bound, or a pointer that walks off the end of the array.
 *
 * Returns a list of human-readable violations. Empty list means the trace is
 * internally consistent. Deliberately not a type-level check — these are
 * runtime facts about generator behaviour.
 */
export function validateTrace(trace: readonly Frame[]): string[] {
  const problems: string[] = [];

  if (trace.length === 0) problems.push('trace is empty: the algorithm produced no frames');

  let prev = -1;
  for (const f of trace) {
    if (f.index !== prev + 1) {
      problems.push(`frame ${f.index}: index is not contiguous (expected ${prev + 1})`);
    }
    prev = f.index;

    if (!f.anchor) problems.push(`frame ${f.index}: missing anchor`);
    if (!f.note) problems.push(`frame ${f.index}: missing note`);

    if (f.kind === 'array') {
      const n = f.values.length;
      for (const [name, i] of Object.entries(f.pointers ?? {})) {
        if (!Number.isInteger(i) || i < 0 || i > n) {
          problems.push(`frame ${f.index}: pointer '${name}' = ${i} is outside [0, ${n}]`);
        }
      }
      if (f.sorted) {
        const [lo, hi] = f.sorted;
        if (lo < 0 || hi > n || lo > hi) {
          problems.push(
            `frame ${f.index}: sorted range [${lo}, ${hi}) is not a valid half-open range`,
          );
        }
      }
      for (const [key, idxs] of Object.entries(f.highlight ?? {})) {
        for (const i of idxs) {
          if (typeof i !== 'number' || i < 0 || i >= n) {
            problems.push(`frame ${f.index}: highlight '${key}' index ${i} is outside [0, ${n})`);
          }
        }
      }
    }

    if (f.kind === 'linear') {
      for (const [name, e] of Object.entries(f.edges ?? {})) {
        if (e < 0 || e > f.items.length) {
          problems.push(
            `frame ${f.index}: edge '${name}' = ${e} is outside [0, ${f.items.length}]`,
          );
        }
      }
    }

    if (f.kind === 'grid') {
      if (f.cells && f.cells.length !== f.rows * f.cols) {
        problems.push(
          `frame ${f.index}: cells.length ${f.cells.length} !== rows*cols ${f.rows * f.cols}`,
        );
      }
      if (f.cursor) {
        const { row, col } = f.cursor;
        if (row < 0 || row >= f.rows || col < 0 || col >= f.cols) {
          problems.push(
            `frame ${f.index}: cursor (${row}, ${col}) is outside the ${f.rows}x${f.cols} grid`,
          );
        }
      }
    }

    if (f.kind === 'graph') {
      for (const [name, id] of Object.entries(f.highlight ?? {})) {
        for (const nodeId of id) {
          if (!(nodeId in f.nodes)) {
            problems.push(
              `frame ${f.index}: highlight '${name}' references unknown node '${nodeId}'`,
            );
          }
        }
      }
      for (const id of [...f.frontier, ...f.visited]) {
        if (!(id in f.nodes)) {
          problems.push(`frame ${f.index}: frontier/visited references unknown node '${id}'`);
        }
      }
    }

    if (f.kind === 'tree' || f.kind === 'trie') {
      for (const [name, ids] of Object.entries(f.highlight ?? {})) {
        for (const nodeId of ids) {
          if (!(nodeId in f.nodes)) {
            problems.push(
              `frame ${f.index}: highlight '${name}' references unknown node '${nodeId}'`,
            );
          }
        }
      }
      for (const id of f.path ?? []) {
        if (!(id in f.nodes)) {
          problems.push(`frame ${f.index}: path references unknown node '${id}'`);
        }
      }
    }

    if (f.kind === 'linked') {
      const ids = new Set(f.nodes.map((nd) => nd.id));
      for (const nd of f.nodes) {
        if (nd.next !== null && !ids.has(nd.next)) {
          problems.push(`frame ${f.index}: node '${nd.id}' points to unknown next '${nd.next}'`);
        }
        if (nd.prev !== undefined && nd.prev !== null && !ids.has(nd.prev)) {
          problems.push(`frame ${f.index}: node '${nd.id}' points to unknown prev '${nd.prev}'`);
        }
      }
      for (const [name, nodeId] of Object.entries(f.pointers ?? {})) {
        if (!ids.has(nodeId))
          problems.push(`frame ${f.index}: pointer '${name}' -> unknown node '${nodeId}'`);
      }
    }

    if (f.kind === 'hash') {
      let total = 0;
      for (const b of f.buckets) total += b.entries.length;
      if (total !== f.size) {
        problems.push(`frame ${f.index}: buckets hold ${total} entries but size says ${f.size}`);
      }
      if (f.probing !== undefined && (f.probing < 0 || f.probing >= f.capacity)) {
        problems.push(
          `frame ${f.index}: probing bucket ${f.probing} outside capacity ${f.capacity}`,
        );
      }
    }
  }

  return problems;
}
