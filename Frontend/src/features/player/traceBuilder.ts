import type { AlgoDef } from '../../core/algorithms/types.ts';
import type { AlgoInput } from '../../core/input/types.ts';
import { inputSize } from '../../core/input/types.ts';
import { runTrace } from '../../core/trace/materialise.ts';
import type { Frame } from '../../core/trace/types.ts';
import type { WorkerRequest, WorkerResponse } from '../../workers/trace.worker.ts';

/**
 * The one place that decides *how* a trace gets built.
 *
 * Two paths, one output:
 *
 *  - **Synchronous** for the sizes a student actually looks at. A worker round
 *    trip has real latency (structured clone plus scheduling plus a message
 *    hop), and paying ~5-15ms for an 8-element bubble sort would make the common
 *    case feel less responsive, not more.
 *  - **Worker** above `WORKER_THRESHOLD`, where draining the generator would
 *    otherwise block the main thread long enough to drop frames.
 *
 * The fallback matters more than the happy path: a worker can fail to start (a
 * locked-down browser, an environment that blocks module workers). Falling back
 * to the synchronous path means a big input renders slowly instead of not at
 * all, and the caller cannot tell the difference.
 */

const WORKER_THRESHOLD = 500;

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void }
>();

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../../workers/trace.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.addEventListener('message', (e: MessageEvent<WorkerResponse>) => {
      const entry = pending.get(e.data.id);
      if (!entry) return;
      if (e.data.kind === 'progress') return; // progress is advisory only
      pending.delete(e.data.id);
      entry.resolve(e.data);
    });
    worker.addEventListener('error', () => {
      // Give up on the worker for the rest of the session rather than retrying
      // per keystroke; a broken worker is a broken environment.
      workerBroken = true;
      for (const [, entry] of pending) entry.reject(new Error('trace worker failed'));
      pending.clear();
      worker?.terminate();
      worker = null;
    });
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

export interface BuiltTrace {
  trace: Frame[];
  truncated: boolean;
  ms: number;
  error: string | null;
  /** True when the work happened off the main thread. Shown in the status bar. */
  offThread: boolean;
}

export function buildTraceSync(
  algo: AlgoDef,
  input: AlgoInput,
  params: Record<string, number | string | boolean>,
): BuiltTrace {
  const started = performance.now();
  const result = runTrace(algo, { input, params });
  return {
    trace: result.trace,
    truncated: result.truncated,
    ms: performance.now() - started,
    error: result.error ? `${result.error.name}: ${result.error.message}` : null,
    offThread: false,
  };
}

async function buildTraceInWorker(
  algo: AlgoDef,
  input: AlgoInput,
  params: Record<string, number | string | boolean>,
): Promise<BuiltTrace> {
  const w = getWorker();
  if (!w) return buildTraceSync(algo, input, params);

  const id = nextId++;
  const request: WorkerRequest = { id, algo, input, params };
  try {
    const response = await new Promise<WorkerResponse>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage(request);
    });
    if (response.kind === 'error') throw new Error(response.message);
    if (response.kind !== 'done') throw new Error('unexpected worker response');
    return {
      trace: response.trace,
      truncated: response.truncated,
      ms: response.ms,
      error: null,
      offThread: true,
    };
  } catch {
    // The worker is an optimisation, never a dependency.
    return buildTraceSync(algo, input, params);
  }
}

export async function buildTrace(
  algo: AlgoDef,
  input: AlgoInput,
  params: Record<string, number | string | boolean>,
): Promise<BuiltTrace> {
  if (inputSize(input) > WORKER_THRESHOLD) return buildTraceInWorker(algo, input, params);
  return buildTraceSync(algo, input, params);
}
