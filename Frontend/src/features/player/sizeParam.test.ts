import { beforeEach, describe, expect, it } from 'vitest';
import { usePlayer } from './playerStore.ts';

/**
 * The input/param contract: which one wins when they disagree?
 *
 * ## What went wrong
 *
 * 28 of the 66 algorithms declare a `size` param whose `run` does
 * `input.values.slice(0, size)`. The default is 8 or 9. So an input longer than
 * that was silently truncated, and the truncation was reachable through three
 * doors that each looked correct in isolation:
 *
 *  - the input editor, where typing 30 values drew 8 cells while the header
 *    reported `n = 8` and the "yours" badge claimed the data was in play;
 *  - a share link, because `load()` built the trace with `defaultParams` before
 *    the URL's own `params` were applied — so 32 of 40 values were dropped before
 *    anything could notice, and a link stopped reproducing the run it came from;
 *  - navigating away from a custom input and back.
 *
 * The rule now is that **the input wins**, enforced in the store by
 * `fitSizeParam`, because that is the only place all three doors pass through.
 * These tests exist to hold that line, and each one is named after the door it
 * failed through rather than after the function, because the function is not the
 * thing that regresses — the wiring around it is.
 */

const reset = () => {
  usePlayer.setState({
    algoId: 'bubble-sort',
    algo: null,
    status: 'idle',
    error: null,
    params: {},
    input: { type: 'numbers', values: [] },
    presetId: null,
    inputCustom: false,
    trace: [],
    index: 0,
    isPlaying: false,
    completed: false,
    truncated: false,
    lastRunMs: 0,
    offThread: false,
    lang: 'javascript',
    loop: false,
    shortcutsOpen: false,
  });
};

const values = (n: number) => Array.from({ length: n }, (_, i) => ((i * 7) % 97) + 1);
const arrayLen = () => {
  const f = usePlayer.getState().trace[0];
  return f && f.kind === 'array' ? f.values.length : -1;
};

describe('a size param never silently discards a supplied input', () => {
  beforeEach(reset);

  it('raises size to fit an input set through the editor', async () => {
    // Door 1. The reported symptom was `n = 8` after typing 30 values.
    await usePlayer.getState().load('bubble-sort');
    expect(Number(usePlayer.getState().params['size'])).toBe(8);

    await usePlayer.getState().setInput({ type: 'numbers', values: values(30) });

    expect(Number(usePlayer.getState().params['size'])).toBe(30);
    expect(arrayLen()).toBe(30);
  });

  it('raises size for an input arriving in a share link', async () => {
    // Door 2, and the worst of the three: `load()` builds the trace before the
    // URL's params are applied, so a link carrying 40 values and no `params`
    // rendered 8 cells. The whole point of a link is that it reproduces the run.
    await usePlayer.getState().load('bubble-sort', {
      input: { type: 'numbers', values: values(40) },
    });

    expect(Number(usePlayer.getState().params['size'])).toBe(40);
    expect(arrayLen()).toBe(40);
  });

  it('survives a reload, which is the same path again', async () => {
    await usePlayer.getState().load('bubble-sort');
    await usePlayer.getState().setInput({ type: 'numbers', values: values(25) });
    // Navigating to another algorithm and back re-enters through `load`.
    await usePlayer.getState().load('merge-sort');
    await usePlayer.getState().load('bubble-sort', {
      input: { type: 'numbers', values: values(25) },
    });
    expect(arrayLen()).toBe(25);
  });

  it('leaves a smaller input alone', async () => {
    // The other direction, and the one that would be easy to break while fixing
    // the first: typing 5 values against a default of 8 must not *lower* the
    // parameter. The e2e suite types exactly this, and changing it would mean
    // every run the student asked for is silently re-parameterised.
    await usePlayer.getState().load('bubble-sort');
    await usePlayer.getState().setInput({ type: 'numbers', values: values(5) });
    expect(Number(usePlayer.getState().params['size'])).toBe(8);
    expect(arrayLen()).toBe(5);
  });

  it('respects a size the student deliberately pinned larger', async () => {
    await usePlayer.getState().load('bubble-sort');
    const spec = usePlayer.getState().algo?.params.find((p) => p.key === 'size');
    if (!spec) throw new Error('bubble-sort should declare a `size` param');
    await usePlayer.getState().setParam(spec, 12);
    await usePlayer.getState().setInput({ type: 'numbers', values: values(5) });
    expect(Number(usePlayer.getState().params['size'])).toBe(12);
  });

  it('respects a size the student deliberately pinned smaller', async () => {
    // The documented reason the param exists at all: running bubble sort on four
    // elements is a reasonable thing to want. Fitting must only ever *raise* it.
    await usePlayer.getState().load('bubble-sort');
    const spec = usePlayer.getState().algo?.params.find((p) => p.key === 'size');
    if (!spec) throw new Error('bubble-sort should declare a `size` param');
    await usePlayer.getState().setInput({ type: 'numbers', values: values(30) });
    await usePlayer.getState().setParam(spec, 4);
    expect(Number(usePlayer.getState().params['size'])).toBe(4);
    expect(arrayLen()).toBe(4);
  });

  it("stops at the spec's own ceiling rather than raising without limit", async () => {
    // Above the ceiling the run is genuinely truncated, and the input editor is
    // what tells the student the number. The store's job is only to not exceed
    // what the parameter can express.
    await usePlayer.getState().load('bubble-sort');
    const spec = usePlayer.getState().algo?.params.find((p) => p.key === 'size');
    if (!spec) throw new Error('bubble-sort should declare a `size` param');
    expect(spec.max).toBe(150);

    await usePlayer.getState().setInput({ type: 'numbers', values: values(400) });
    expect(Number(usePlayer.getState().params['size'])).toBe(150);
    expect(arrayLen()).toBe(150);
    // And the extra values are still in state, so reopening the editor shows
    // everything the student typed. Nothing is destroyed by the ceiling.
    const stored = usePlayer.getState().input;
    expect(stored.type === 'numbers' ? stored.values.length : 0).toBe(400);
  });

  it('does not invent a size for an algorithm that has no such param', async () => {
    // dijkstra has no `size`; a graph input must be passed through untouched.
    // Worth asserting because the reconciliation is keyed on the param name, and
    // a version that keyed on the *input* instead would quietly add a `size` to
    // every algorithm in the curriculum.
    await usePlayer.getState().load('dijkstra', {
      input: {
        type: 'graph',
        directed: true,
        weighted: true,
        nodes: [
          { id: 'a', x: 0, y: 0 },
          { id: 'b', x: 1, y: 0 },
          { id: 'c', x: 2, y: 0 },
        ],
        edges: [
          { from: 'a', to: 'b', weight: 4, directed: true },
          { from: 'b', to: 'c', weight: 5, directed: true },
        ],
      },
    });
    expect(usePlayer.getState().params['size']).toBeUndefined();
    expect(usePlayer.getState().trace.length).toBeGreaterThan(0);
  });
});
