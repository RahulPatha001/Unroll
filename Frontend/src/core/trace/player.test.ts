import { describe, expect, it } from 'vitest';
import {
  clampIndex,
  DEFAULT_SPEED,
  deriveView,
  initialTransport,
  SPEEDS,
  stepInterval,
  transport,
} from './player.ts';
import type { Frame } from './types.ts';

const frames = (n: number): Frame[] =>
  Array.from({ length: n }, (_, i) => ({
    kind: 'array',
    index: i,
    anchor: 'step',
    note: `step ${i}`,
    values: [i],
  }));

describe('clampIndex', () => {
  it('clamps to the valid range and floors', () => {
    expect(clampIndex(-5, 10)).toBe(0);
    expect(clampIndex(99, 10)).toBe(9);
    expect(clampIndex(3.7, 10)).toBe(3);
    expect(clampIndex(0, 0)).toBe(0);
  });
});

describe('deriveView', () => {
  const trace = frames(5);

  it('maps index to frame, progress and flags', () => {
    const v = deriveView(trace, 2, false, false);
    expect(v.frame?.index).toBe(2);
    expect(v.length).toBe(5);
    expect(v.progress).toBeCloseTo(0.5);
    expect(v.canStepBack).toBe(true);
    expect(v.canStepForward).toBe(true);
    expect(v.atStart).toBe(false);
    expect(v.atEnd).toBe(false);
  });

  it('handles the single-frame trace without dividing by zero', () => {
    const v = deriveView(frames(1), 0, false, false);
    expect(v.progress).toBe(1);
    expect(v.canStepForward).toBe(false);
    expect(v.atStart).toBe(true);
    expect(v.atEnd).toBe(true);
  });

  it('handles the empty trace', () => {
    const v = deriveView([], 0, false, false);
    expect(v.frame).toBeNull();
    expect(v.progress).toBe(0);
    expect(v.completed).toBe(false);
  });
});

describe('transport reducer', () => {
  it('steps forward and back', () => {
    let s = initialTransport();
    s = transport(s, { type: 'stepForward' }, 10);
    s = transport(s, { type: 'stepForward' }, 10);
    expect(s.index).toBe(2);
    s = transport(s, { type: 'stepBack' }, 10);
    expect(s.index).toBe(1);
  });

  it('keeps playing when stepped manually', () => {
    // Students scrub backwards mid-playback to re-read a step. Cancelling
    // playback on manual input is the common choice and the wrong one.
    let s = { ...initialTransport(), isPlaying: true };
    s = transport(s, { type: 'stepBack' }, 10);
    expect(s.isPlaying).toBe(true);
  });

  it('pauses when stepping past the last frame', () => {
    let s = { ...initialTransport(), index: 2, isPlaying: true };
    s = transport(s, { type: 'stepForward' }, 3);
    expect(s.index).toBe(2);
    expect(s.isPlaying).toBe(false);
  });

  it('restarts from the beginning when play is pressed at the end', () => {
    let s = { ...initialTransport(), index: 4, completed: true };
    s = transport(s, { type: 'play' }, 5);
    expect(s.index).toBe(0);
    expect(s.isPlaying).toBe(true);
    expect(s.completed).toBe(false);
  });

  it('does not loop silently at the end', () => {
    let s = { ...initialTransport(), index: 4 };
    s = transport(s, { type: 'toggle' }, 5);
    expect(s.index).toBe(0);
  });

  it('jumps, seeks, and clamps', () => {
    let s = initialTransport();
    s = transport(s, { type: 'jump', delta: 4 }, 10);
    expect(s.index).toBe(4);
    s = transport(s, { type: 'jump', delta: -100 }, 10);
    expect(s.index).toBe(0);
    s = transport(s, { type: 'seek', index: 99 }, 10);
    expect(s.index).toBe(9);
    s = transport(s, { type: 'seek', index: -1 }, 10);
    expect(s.index).toBe(0);
  });

  it('marks completed once the final frame has been reached', () => {
    let s = initialTransport();
    s = transport(s, { type: 'last' }, 4);
    expect(s.completed).toBe(true);
    expect(s.isPlaying).toBe(false);
  });

  it('resets', () => {
    let s = { ...initialTransport(), index: 7, isPlaying: true, completed: true };
    s = transport(s, { type: 'reset' }, 10);
    expect(s).toMatchObject({ index: 0, isPlaying: false, completed: false });
  });

  it('is a no-op on an empty trace', () => {
    const s = initialTransport();
    expect(transport(s, { type: 'play' }, 0)).toBe(s);
  });

  it('changes speed without touching the playhead', () => {
    const s = { ...initialTransport(), index: 5 };
    const next = transport(s, { type: 'setSpeed', speed: 32 }, 10);
    expect(next).toMatchObject({ index: 5, speed: 32 });
  });
});

describe('speed', () => {
  it('has a sane interval floor so 60fps is not asked for 240fps', () => {
    for (const s of SPEEDS) expect(stepInterval(s)).toBeGreaterThanOrEqual(16);
  });

  it('scales monotonically', () => {
    const intervals = SPEEDS.map(stepInterval);
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i] as number).toBeLessThan(intervals[i - 1] as number);
    }
  });

  it('has a default inside the offered set', () => {
    expect(SPEEDS).toContain(DEFAULT_SPEED);
  });
});
