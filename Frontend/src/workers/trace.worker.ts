/// <reference lib="webworker" />

import type { AlgoDef } from '../core/algorithms/types.ts';
import type { AlgoInput } from '../core/input/types.ts';
import { MAX_FRAMES, runTrace } from '../core/trace/materialise.ts';
import type { Frame } from '../core/trace/types.ts';

/**
 * Off-main-thread trace materialisation.
 *
 * Above roughly 500 elements — or an algorithm that projects past ~10k frames —
 * draining the generator blocks the main thread long enough to drop frames, and
 * a visualiser that stutters while explaining itself is self-defeating. The
 * transfer is a structured clone, so there is no serialisation cost beyond the
 * copy, which is trivial against the jank it avoids.
 *
 * Below the threshold the store stays synchronous on purpose: a worker round
 * trip has real latency, and paying it for an 8-element bubble sort would make
 * the common case slower to feel responsive. Both paths produce the identical
 * `Trace`, which is what makes the choice invisible.
 */

export interface WorkerRequest {
  id: number;
  algo: AlgoDef;
  input: AlgoInput;
  params: Record<string, number | string | boolean>;
}

export type WorkerResponse =
  | { id: number; kind: 'progress'; fraction: number }
  | { id: number; kind: 'done'; trace: Frame[]; truncated: boolean; ms: number }
  | { id: number; kind: 'error'; message: string };

/** Above this element count, materialise off the main thread. */
export const WORKER_THRESHOLD = 500;

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const { id, algo, input, params } = event.data;
  const post = (msg: WorkerResponse) => (self as unknown as Worker).postMessage(msg);

  try {
    const started = performance.now();
    const result = runTrace(
      algo,
      { input, params },
      {
        maxFrames: MAX_FRAMES,
        onProgress: (fraction) => post({ id, kind: 'progress', fraction }),
      },
    );
    post({
      id,
      kind: 'done',
      trace: result.trace,
      truncated: result.truncated,
      ms: performance.now() - started,
    });
  } catch (e) {
    post({
      id,
      kind: 'error',
      message: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    });
  }
});

/** Element count for the threshold decision, without pulling in `inputSize`. */
export function roughSize(input: AlgoInput): number {
  switch (input.type) {
    case 'matrix':
      // `rows` here is the list of per-row sizes, not a count.
      return input.rows.length * input.cols;
    case 'grid':
      return input.rows * input.cols;
    case 'graph':
      return input.nodes.length;
    case 'chars':
    case 'numbers':
    case 'words':
    case 'keys':
    case 'tree':
      return input.values.length;
    default:
      return 0;
  }
}
