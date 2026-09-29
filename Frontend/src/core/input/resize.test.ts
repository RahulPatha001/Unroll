import { describe, expect, it } from 'vitest';
import { resizeInput } from './resize.ts';
import type { AlgoInput } from './types.ts';

/**
 * `resizeInput` — the missing half of `regeneratesInput`.
 *
 * The count is the easy part. What these tests actually pin down is that the
 * *shape* survives, because a resize that hit the requested length while
 * destroying the property the preset was chosen for would be a fix that teaches
 * something false: a `Reversed` bubble-sort preset grown to 20 elements is the
 * best-case lesson, and the same preset grown to 20 random numbers is no lesson
 * at all.
 */
const isAscending = (a: readonly number[]) =>
  a.every((v, i) => i === 0 || (a[i - 1] as number) <= v);
const isDescending = (a: readonly number[]) =>
  a.every((v, i) => i === 0 || (a[i - 1] as number) >= v);
const isConstant = (a: readonly number[]) => a.every((v) => v === a[0]);
const distinct = (a: readonly unknown[]) => new Set(a.map(String)).size === a.length;

describe('resizeInput', () => {
  it('hits the requested count', () => {
    const input: AlgoInput = { type: 'numbers', values: [3, 1, 4, 1, 5] };
    for (const n of [0, 1, 2, 7, 20, 150]) {
      const out = resizeInput(input, n);
      expect(out.type === 'numbers' ? out.values.length : -1, `n=${n}`).toBe(n);
    }
  });

  it('is a pure function of (input, size), so a share link reproduces it', () => {
    // No seed is threaded in, which is the stronger property and the reason this
    // needs no counter: the same input resized to the same size is identical, so
    // `?input=…&params={"size":20}` lands on exactly the run the sender saw.
    const input: AlgoInput = { type: 'numbers', values: [9, 4, 7, 1, 3, 8] };
    expect(resizeInput(input, 20)).toEqual(resizeInput(input, 20));
    expect(resizeInput(input, 20)).not.toEqual(resizeInput(input, 21));
  });

  it('shrinks from the front, so the prefix of a run is unchanged', () => {
    // Growing and then shrinking should return something recognisably related,
    // not a fresh unrelated array.
    const input: AlgoInput = { type: 'numbers', values: [5, 3, 9, 1, 7] };
    const big = resizeInput(input, 20);
    const small = resizeInput(big, 5);
    expect(small.type === 'numbers' ? small.values : []).toEqual([5, 3, 9, 1, 7]);
  });

  describe('preserves the shape that makes a preset worth choosing', () => {
    it('keeps a descending array descending', () => {
      const out = resizeInput({ type: 'numbers', values: [9, 6, 3, 1] }, 20);
      expect(out.type === 'numbers' && isDescending(out.values)).toBe(true);
    });

    it('keeps an ascending array ascending', () => {
      const out = resizeInput({ type: 'numbers', values: [1, 3, 6, 9] }, 20);
      expect(out.type === 'numbers' && isAscending(out.values)).toBe(true);
    });

    it('keeps an all-equal array all-equal', () => {
      // The `All equal` bubble-sort preset is the best-case O(n) lesson. A resize
      // that made it varied would keep the length and delete the point.
      const out = resizeInput({ type: 'numbers', values: [7, 7, 7, 7] }, 20);
      expect(out.type === 'numbers' && isConstant(out.values)).toBe(true);
      expect(out.type === 'numbers' ? out.values[0] : null).toBe(7);
    });

    it('keeps values inside the range the input already spanned', () => {
      const out = resizeInput({ type: 'numbers', values: [2, 4, 6] }, 30);
      expect(out.type === 'numbers' && out.values.every((v) => v >= 2 && v <= 6)).toBe(true);
    });

    it('keeps a single-value input varied rather than 1..1', () => {
      // A one-element input has no span to draw from, and copying it 20 times
      // would be the `All equal` preset whether or not that was asked for.
      const out = resizeInput({ type: 'numbers', values: [5] }, 20);
      const values = out.type === 'numbers' ? out.values : [];
      expect(values).toHaveLength(20);
      expect(new Set(values).size).toBeGreaterThan(1);
    });

    it('keeps tree values distinct, because a BST of ties is degenerate', () => {
      const out = resizeInput({ type: 'tree', values: [50, 30, 70] }, 12);
      expect(out.type === 'tree' && distinct(out.values)).toBe(true);
      expect(out.type === 'tree' ? out.values.length : -1).toBe(12);
    });

    it('keeps string tree values distinct', () => {
      const out = resizeInput({ type: 'tree', values: ['m', 'c', 'x'] }, 8);
      expect(out.type === 'tree' && distinct(out.values)).toBe(true);
    });

    it('keeps keys numeric when they arrived numeric', () => {
      const out = resizeInput({ type: 'keys', values: [1, 5, 25] }, 12);
      expect(out.type === 'keys' && out.values.every((v) => typeof v === 'number')).toBe(true);
    });

    it('keeps keys textual when they arrived textual', () => {
      const out = resizeInput({ type: 'keys', values: ['a1', 'b2'] }, 8);
      expect(out.type === 'keys' && out.values.every((v) => typeof v === 'string')).toBe(true);
    });

    it("keeps a char input's alphabet, so a palindrome test is still a test", () => {
      const out = resizeInput({ type: 'chars', values: 'aabbcc' }, 18);
      expect(out.type === 'chars' && [...out.values].every((c) => 'abc'.includes(c))).toBe(true);
      expect(out.type === 'chars' ? out.values.length : -1).toBe(18);
    });

    it('keeps word lengths and count', () => {
      const out = resizeInput({ type: 'words', values: ['cat', 'dogs', 'a'] }, 7);
      expect(out.type === 'words' ? out.values.length : -1).toBe(7);
      expect(
        out.type === 'words' ? out.values.map((w) => w.length) : [],
        'word lengths are reused from the input, so a 2-word input stays short',
      ).toEqual([3, 4, 1, 3, 4, 1, 3]);
    });
  });

  describe('honours the algorithm own idea of "size" for a words input', () => {
    /*
      `words` means two different things in this curriculum, and the resizer used
      to guess wrong about one of them.

      `longest-substring` has a `chars` input and its `size` is the string's
      length. `min-window-substring` has a `words` input holding a *pair* — a text
      and the pattern to find in it — and its `size` is the length of the first
      word, which is exactly what its own `sizeOf` reports:

          sizeOf: (input) => input.type === 'words' ? (input.values[0] ?? '').length : 0

      Growing the word *count* there gave thirty words whose first was still the
      original eighteen characters: the control moved, the `n =` on screen did not,
      and the algorithm was handed a different input shape than it declared. The
      fix is not a hardcoded "the first word matters" — it is to build each
      candidate and keep the one the algorithm's own definition agrees with, so a
      future algorithm that means something else describes it in `sizeOf` and is
      correct without a change here.
    */
    const textFirst = (input: AlgoInput) =>
      input.type === 'words' ? (input.values[0] ?? '').length : 0;
    const wordCount = (input: AlgoInput) => (input.type === 'words' ? input.values.length : 0);

    it('grows the first word when sizeOf measures the first word', () => {
      const input: AlgoInput = { type: 'words', values: ['abcabcabcabcabc', 'abc'] };
      const out = resizeInput(input, 30, textFirst);
      expect(out.type === 'words' ? textFirst(out) : -1).toBe(30);
      // And the pattern is untouched, because it is not what was asked about.
      expect(out.type === 'words' ? out.values[1] : null).toBe('abc');
    });

    it('grows the word count when sizeOf measures the count', () => {
      const input: AlgoInput = { type: 'words', values: ['cat', 'dog', 'emu'] };
      const out = resizeInput(input, 8, wordCount);
      expect(out.type === 'words' ? wordCount(out) : -1).toBe(8);
    });

    it('lands on the requested size for the real min-window-substring shape', () => {
      // The shape as the algorithm actually ships it: a text and a pattern.
      const input: AlgoInput = { type: 'words', values: ['abcdefghijklmnopqrst', 'abc'] };
      for (const n of [5, 22, 40, 60]) {
        const out = resizeInput(input, n, textFirst);
        expect(textFirst(out), `n=${n}`).toBe(n);
      }
    });
  });

  describe('shapes with no element count are left alone, explicitly', () => {
    // No algorithm in the curriculum pairs a `regeneratesInput` param with any of
    // these, and inventing a dimension for them would be a guess about which
    // axis to grow. Written out rather than defaulted, so a new input shape is a
    // compile error instead of another silent no-op.
    it('leaves a grid unchanged', () => {
      const g: AlgoInput = { type: 'grid', rows: 2, cols: 2, values: [1, 0, 0, 1] };
      expect(resizeInput(g, 100)).toEqual(g);
    });

    it('leaves a matrix unchanged', () => {
      const m: AlgoInput = {
        type: 'matrix',
        rows: [0, 1],
        cols: 2,
        values: [1, 2, 3, 4],
      };
      expect(resizeInput(m, 100)).toEqual(m);
    });

    it('leaves a graph unchanged', () => {
      const g: AlgoInput = {
        type: 'graph',
        directed: false,
        weighted: false,
        nodes: [
          { id: 'a', x: 0, y: 0 },
          { id: 'b', x: 1, y: 0 },
        ],
        edges: [{ from: 'a', to: 'b', directed: false }],
      };
      expect(resizeInput(g, 100)).toEqual(g);
    });
  });

  it('handles an empty input without throwing or inventing a shape', () => {
    expect(resizeInput({ type: 'numbers', values: [] }, 5).type).toBe('numbers');
    expect(resizeInput({ type: 'chars', values: '' }, 5).type).toBe('chars');
    expect(resizeInput({ type: 'words', values: [] }, 3).type).toBe('words');
  });

  it('handles a fractional or negative size without producing a fractional array', () => {
    const input: AlgoInput = { type: 'numbers', values: [1, 2, 3] };
    for (const n of [2.7, -1, 0, Number.NaN]) {
      const out = resizeInput(input, n);
      const len = out.type === 'numbers' ? out.values.length : -1;
      expect(Number.isInteger(len), `n=${n} produced length ${len}`).toBe(true);
      expect(len, `n=${n}`).toBeGreaterThanOrEqual(0);
    }
  });
});
