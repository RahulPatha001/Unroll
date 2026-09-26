import { describe, expect, it } from 'vitest';
import type { AlgoInput } from '../core/input/types.ts';
import { decodeInput, isLang, readUrlState, shareText, writeUrlState } from './urlState.ts';

/**
 * URL as state, and specifically the custom-input half of it.
 *
 * `urlState.ts` could already encode an `AlgoInput` before the editor existed —
 * nothing called it. That makes these tests the only thing standing between "the
 * student can share their own array" and a feature that works until the first
 * reload.
 */

const CUSTOM: AlgoInput = { type: 'numbers', values: [42, 7, 13, 1, 99] };

describe('a custom input survives the round trip through the URL', () => {
  it('encodes and decodes an array back to exactly itself', () => {
    const query = writeUrlState({ algo: 'bubble-sort', preset: 'random' }, CUSTOM);
    const state = readUrlState(query);
    expect(state.input).toBeDefined();
    expect(decodeInput(state.input as string)).toEqual(CUSTOM);
  });

  it('round-trips every input shape the curriculum uses', () => {
    const inputs: AlgoInput[] = [
      { type: 'numbers', values: [1, 2, 3] },
      { type: 'numbers', values: [] },
      { type: 'numbers', values: [-1.5, 0, 1e21] },
      { type: 'chars', values: 'racecar' },
      { type: 'words', values: ['the quick fox', 'quick brown fox'] },
      { type: 'keys', values: [3, 'apple', 7] },
      { type: 'tree', values: [8, 3, 10, 1, 6] },
      { type: 'matrix', rows: [2, 2], cols: 2, values: [1, 2, 3, 4] },
      { type: 'grid', rows: 2, cols: 2, values: ['.', '#', null, '.'] },
      {
        type: 'graph',
        nodes: [
          { id: 'n0', label: '0', x: 100, y: 100 },
          { id: 'n1', label: '1', x: 200, y: 200 },
        ],
        edges: [{ from: 'n0', to: 'n1', weight: 3, directed: false }],
        directed: false,
        weighted: true,
      },
    ];
    for (const input of inputs) {
      const query = writeUrlState({ algo: 'bubble-sort' }, input);
      const state = readUrlState(query);
      expect(decodeInput(state.input as string), JSON.stringify(input)).toEqual(input);
    }
  });

  it('survives non-ASCII text', () => {
    // base64 of UTF-8 bytes, not of code units. Getting this wrong produces a
    // link that decodes to mojibake rather than to an error, which is the kind
    // of bug that only shows up for the one student with a non-English name.
    const input: AlgoInput = { type: 'words', values: ['naïve', '日本語', 'emoji 🎉'] };
    const query = writeUrlState({ algo: 'lcs' }, input);
    const state = readUrlState(query);
    expect(decodeInput(state.input as string)).toEqual(input);
  });

  it('omits the payload entirely when the input is just the preset', () => {
    // The size property matters: an ordinary link should stay short enough to
    // read aloud, and a base64 copy of an array the `preset` already names adds
    // nothing.
    const query = writeUrlState({ algo: 'bubble-sort', preset: 'random' });
    expect(query).not.toContain('input=');
    expect(query).not.toContain('v=');
  });

  it('emits a base64url payload, not standard base64', () => {
    // Standard base64 contains `+`, `/` and `=`, all of which are meaningful in a
    // query string. `encodeInput` replaces them (`-`, `_`, and drops the padding),
    // and if that regressed the link would still *look* fine and decode wrongly
    // somewhere along the way — so it is asserted on the raw characters rather
    // than left to the round-trip tests, which can pass by accident when the
    // payload happens to contain no such character.
    const query = writeUrlState({ algo: 'bfs', preset: 'dag' }, CUSTOM);
    const raw = new URLSearchParams(query).get('input') ?? '';
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('leaves no unescaped delimiter inside any single value', () => {
    const query = writeUrlState({ algo: 'bfs', preset: 'dag' }, CUSTOM);
    // Split on the separator, then confirm each half is exactly one `key=value`
    // with nothing extra riding along. A leaked `&` in a value would turn one
    // parameter into two and the tail would be silently discarded on the way in.
    for (const pair of query.slice(1).split('&')) {
      expect(pair, pair).toMatch(/^[^=&]+=[^=&]*$/);
    }
  });
});

describe('a hand-edited or stale link degrades instead of throwing', () => {
  it('returns null for a payload that is not base64 of JSON', () => {
    expect(decodeInput('not-really-base64!!')).toBeNull();
  });

  it('returns null for base64 of something that is not an input', () => {
    const junk = btoa(JSON.stringify({ hello: 'world' }));
    expect(decodeInput(junk)).toBeNull();
  });

  it('returns null for an input of a shape the app does not have', () => {
    // A future or removed shape must not be forced through the union.
    const future = btoa(JSON.stringify({ type: 'quantum', qubits: 3 }));
    expect(decodeInput(future)).toBeNull();
  });

  it('falls back to a real algorithm when the link names one that is gone', () => {
    // A shared link can outlive the algorithm it points at. Landing on a working
    // visualiser beats an error page the student cannot fix.
    const state = readUrlState('?algo=an-algorithm-we-deleted');
    expect(state.algo).toBe('bubble-sort');
  });

  it('falls back to defaults rather than throwing on a malformed query', () => {
    const state = readUrlState('?frame=not-a-number&speed=-4&lang=klingon');
    expect(state.algo).toBe('bubble-sort');
    expect(state.lang).toBe('javascript');
    expect(state.frame).toBeUndefined();
  });

  it('drops a speed the transport does not offer, and keeps everything else', () => {
    // `Speed` is the union 1|2|4|8|16|32|60 and `setSpeed` takes that union, so a
    // schema accepting any integer in 1..60 only type-checks because of a cast
    // somewhere — and `?speed=7` would leave the transport in a state the UI cannot
    // draw and `stepInterval` has no case for.
    const bad = readUrlState('?algo=kadane&preset=random&speed=7');
    expect(bad.speed).toBeUndefined();
    expect(bad.algo).toBe('kadane');
    expect(bad.preset).toBe('random');
  });

  it('accepts every speed the transport actually offers', () => {
    for (const speed of [1, 2, 4, 8, 16, 32, 60]) {
      const state = readUrlState(`?algo=kadane&speed=${speed}`);
      expect(state.speed, `speed=${speed}`).toBe(speed);
    }
  });

  it('reads speed as a number even though the query delivers a string', () => {
    // The subtle half. `z.literal(4)` does not match `"4"`, so validating the set
    // with bare literals fails on every real link and resets all of it to
    // defaults — a spectacular way to lose a feature, and invisible until a
    // student followed a link.
    const state = readUrlState('?algo=kadane&preset=random&speed=8&frame=3');
    expect(state.speed).toBe(8);
    expect(state.frame).toBe(3);
    expect(state.preset).toBe('random');
  });

  it('accepts a negative weight and a zero, which a naive truthiness check drops', () => {
    // `weight: 0` is a legitimate edge cost and `weight: -1` appears in
    // Bellman-Ford's presets. A parser that treated 0 as absent would silently
    // change what the algorithm computes.
    const input: AlgoInput = {
      type: 'graph',
      nodes: [
        { id: 'n0', x: 0, y: 0 },
        { id: 'n1', x: 1, y: 1 },
      ],
      edges: [
        { from: 'n0', to: 'n1', weight: 0, directed: true },
        { from: 'n1', to: 'n0', weight: -1, directed: true },
      ],
      directed: true,
      weighted: true,
    };
    const state = readUrlState(writeUrlState({ algo: 'bellman-ford' }, input));
    expect(decodeInput(state.input as string)).toEqual(input);
  });
});

describe('the ordinary state', () => {
  it('round-trips the algorithm, preset, language and frame', () => {
    const query = writeUrlState({
      algo: 'dijkstra',
      preset: 'trap',
      lang: 'python',
      frame: 42,
      speed: 8,
      loop: true,
    });
    const state = readUrlState(query);
    expect(state.algo).toBe('dijkstra');
    expect(state.preset).toBe('trap');
    expect(state.lang).toBe('python');
    expect(state.frame).toBe(42);
    expect(state.speed).toBe(8);
    expect(state.loop).toBe(true);
  });

  it('round-trips params, which travel as a JSON string', () => {
    // This is the assertion whose absence hid a real bug. `writeUrlState` emits
    // `params={"size":8}` because a query parameter is a string, and the schema
    // asked for an object — so every read failed validation and fell through to
    // defaults, discarding the algorithm, preset, language and input with it.
    // Nothing noticed for as long as nothing *wrote* a URL, so no link in the
    // wild ever carried a `params` key to expose it.
    const query = writeUrlState({
      algo: 'binary-search',
      preset: 'random',
      params: { size: 12, target: 40, ordered: true },
    });
    expect(query).toContain('params=');
    const state = readUrlState(query);
    expect(state.params).toEqual({ size: 12, target: 40, ordered: true });
    // ...and the fields that were being thrown away with it.
    expect(state.algo).toBe('binary-search');
    expect(state.preset).toBe('random');
  });

  it('keeps every other field when params is unparseable', () => {
    // A hand-edited `params` should cost the student their parameters, not the
    // whole link.
    const state = readUrlState('?algo=quick-sort&preset=reverse&params=not-json');
    expect(state.algo).toBe('quick-sort');
    expect(state.preset).toBe('reverse');
    expect(state.params).toBeUndefined();
  });

  it('reads a full hand-written query the way a shared link looks', () => {
    const state = readUrlState(
      '?algo=dijkstra&preset=trap&lang=java&frame=17&speed=2&loop=1&params=%7B%22size%22%3A8%7D',
    );
    expect(state.algo).toBe('dijkstra');
    expect(state.preset).toBe('trap');
    expect(state.lang).toBe('java');
    expect(state.frame).toBe(17);
    expect(state.speed).toBe(2);
    expect(state.loop).toBe(true);
    expect(state.params).toEqual({ size: 8 });
  });

  it('omits frame zero, which is where every run starts anyway', () => {
    expect(writeUrlState({ algo: 'kadane', frame: 0 })).not.toContain('frame=');
  });

  it('narrows a language string', () => {
    expect(isLang('python')).toBe(true);
    expect(isLang('klingon')).toBe(false);
  });

  it('writes a share line naming the algorithm and the step', () => {
    expect(shareText('Bubble Sort', 'Swap them.')).toBe('Bubble Sort — step: Swap them.');
  });
});
