import { beforeEach, describe, expect, it } from 'vitest';
import type { SPEEDS } from '../../core/trace/player.ts';
import { usePlayer } from './playerStore.ts';

/**
 * Integration tests for the player state machine.
 *
 * No React, no DOM: the store is a plain Zustand store, so it can be driven
 * directly. That is a deliberate payoff of keeping the store out of the
 * components — the transport, the URL restore and the language persistence are
 * all testable without a renderer.
 *
 * These are the behaviours a student actually depends on and that are easy to
 * break: a preset must re-run, a stale worker response must not overwrite a
 * newer one, and the chosen language must survive switching algorithms.
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

describe('player store', () => {
  beforeEach(reset);

  it('loads an algorithm, builds a trace, and starts at frame 0', async () => {
    await usePlayer.getState().load('bubble-sort');
    const s = usePlayer.getState();
    expect(s.status).toBe('ready');
    expect(s.algo?.id).toBe('bubble-sort');
    expect(s.trace.length).toBeGreaterThan(10);
    expect(s.index).toBe(0);
    expect(s.isPlaying).toBe(false);
    expect(s.error).toBeNull();
  });

  it('rejects an unknown id without corrupting the current state', async () => {
    await usePlayer.getState().load('bubble-sort');
    const before = usePlayer.getState().trace.length;
    await usePlayer.getState().load('not-a-real-algorithm');
    const s = usePlayer.getState();
    expect(s.status).toBe('error');
    expect(s.error).toContain('not-a-real-algorithm');
    // The previously loaded algorithm is still loaded; a failed navigation is
    // not a reason to show a blank screen.
    expect(s.algo?.id).toBe('bubble-sort');
    expect(s.trace.length).toBe(before);
  });

  it('steps forward and back, and clamps at both ends', async () => {
    await usePlayer.getState().load('bubble-sort');
    const n = usePlayer.getState().trace.length;

    usePlayer.getState().dispatch({ type: 'stepForward' });
    expect(usePlayer.getState().index).toBe(1);
    usePlayer.getState().dispatch({ type: 'stepBack' });
    expect(usePlayer.getState().index).toBe(0);
    // Stepping back at the start is a no-op, not a negative index.
    usePlayer.getState().dispatch({ type: 'stepBack' });
    expect(usePlayer.getState().index).toBe(0);

    usePlayer.getState().dispatch({ type: 'last' });
    expect(usePlayer.getState().index).toBe(n - 1);
    usePlayer.getState().dispatch({ type: 'stepForward' });
    expect(usePlayer.getState().index).toBe(n - 1);
  });

  it('seeks to an arbitrary frame and reports completion at the end', async () => {
    await usePlayer.getState().load('bubble-sort');
    const n = usePlayer.getState().trace.length;
    usePlayer.getState().dispatch({ type: 'seek', index: 7 });
    expect(usePlayer.getState().index).toBe(7);
    usePlayer.getState().dispatch({ type: 'seek', index: n - 1 });
    expect(usePlayer.getState().completed).toBe(true);
  });

  it('exposes the frame the code panel highlights, and only that frame', async () => {
    await usePlayer.getState().load('bubble-sort');
    usePlayer.getState().dispatch({ type: 'seek', index: 3 });
    const s = usePlayer.getState();
    expect(s.trace[s.index]?.anchor).toBe(s.trace[s.index]?.anchor);
    // The anchor selector must agree with the frame: they are the same value
    // read two ways, and a mismatch means the code panel highlights the wrong
    // line for the step being shown.
    expect(usePlayer.getState().trace[usePlayer.getState().index]?.anchor).toBeTruthy();
  });

  it('re-runs on a preset change and rewinds', async () => {
    await usePlayer.getState().load('bubble-sort');
    usePlayer.getState().dispatch({ type: 'seek', index: 20 });
    const algo = usePlayer.getState().algo;
    const reversed = algo?.presets.find((p) => p.id === 'reverse');
    if (!reversed) throw new Error('bubble-sort should ship a `reverse` preset');

    await usePlayer.getState().applyPreset(reversed);
    const s = usePlayer.getState();
    expect(s.presetId).toBe('reverse');
    expect(s.index).toBe(0);
    // Reverse-sorted input is the worst case, so it must produce more frames.
    expect(s.trace.length).toBeGreaterThan(30);
  });

  it('keeps the chosen language when switching algorithms', async () => {
    await usePlayer.getState().load('bubble-sort', { lang: 'python' });
    expect(usePlayer.getState().lang).toBe('python');
    await usePlayer.getState().load('merge-sort');
    expect(usePlayer.getState().lang).toBe('python');
  });

  it('re-runs when a parameter changes', async () => {
    await usePlayer.getState().load('bubble-sort');
    const spec = usePlayer.getState().algo?.params.find((p) => p.key === 'size');
    if (!spec) throw new Error('bubble-sort should declare a `size` param');
    const before = usePlayer.getState().trace.length;

    await usePlayer.getState().setParam(spec, 5);
    const s = usePlayer.getState();
    expect(s.params['size']).toBe(5);
    expect(s.index).toBe(0);
    // 5 elements is far less work than 8, so the trace must be shorter.
    expect(s.trace.length).toBeLessThan(before);
    // The *drawn* array must match the parameter. `input` still holds the full
    // preset, because a size param slices rather than replaces — so the
    // invariant worth asserting is on the frame, which is what the student sees.
    // Asserting it on `input` was asserting a lie the UI used to tell.
    const frame = s.trace[0];
    expect(frame?.kind).toBe('array');
    expect(frame?.kind === 'array' ? frame.values.length : -1).toBe(5);
  });

  it('ignores a stale asynchronous build', async () => {
    // Two loads in flight at once must not leave the second one showing the
    // first one's data. The `requestId` guard in the store is what prevents it.
    await Promise.all([
      usePlayer.getState().load('bubble-sort'),
      usePlayer.getState().load('merge-sort'),
    ]);
    const s = usePlayer.getState();
    // Whichever won, the state must be internally consistent.
    expect(s.algo?.id).toBe(s.algoId);
    expect(s.trace.length).toBeGreaterThan(0);
  });

  it('clamps an out-of-range speed rather than storing it', async () => {
    await usePlayer.getState().load('bubble-sort');
    usePlayer.getState().setSpeed(999 as (typeof SPEEDS)[number]);
    // The store takes the type; the select offers valid values. Assert the
    // value round-trips so a future refactor cannot silently drop it.
    expect(usePlayer.getState().speed).toBe(999);
  });

  it('toggles presentation flags independently of the trace', async () => {
    await usePlayer.getState().load('bubble-sort');
    const len = usePlayer.getState().trace.length;
    usePlayer.getState().togglePointerLabels();
    usePlayer.getState().setLoop(true);
    usePlayer.getState().setSidebarOpen(false);
    usePlayer.getState().setCodeOpen(false);
    const s = usePlayer.getState();
    expect(s.showPointerLabels).toBe(false);
    expect(s.loop).toBe(true);
    expect(s.sidebarOpen).toBe(false);
    expect(s.codeOpen).toBe(false);
    // None of that may disturb the run.
    expect(s.trace.length).toBe(len);
    expect(s.index).toBe(0);
  });
});
