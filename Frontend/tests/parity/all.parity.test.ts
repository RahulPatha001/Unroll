import { describe, expect, it } from 'vitest';
import { ALL_ALGORITHMS } from '../../src/core/algorithms/registry.ts';
import {
  formatFailures,
  jsonEqual,
  summarise,
  toolchains,
  verifyAlgorithm,
} from '../../tools/verify/harness.ts';

/**
 * Translation parity across the whole curriculum.
 *
 * The single test that makes the code panel trustworthy. For every algorithm,
 * for every preset, for every language with a toolchain present: run the code
 * the student will actually read, and require it to return what the reference
 * returns.
 *
 * A missing toolchain skips rather than fails (plan §10.1) — CI installs
 * python3, a JDK and g++, and a contributor with only a JRE still gets a green
 * suite for the languages they do have.
 */
describe('translation parity (all algorithms)', () => {
  it('reports the toolchains it found', async () => {
    const chains = await toolchains();
    const summary = Object.entries(chains)
      .map(([lang, c]) => `${lang}=${c.available ? 'ok' : 'MISSING'}`)
      .join(' ');
    // Not an assertion, a diagnostic. If this line looks wrong in CI, the skips
    // below are silently hiding failures.
    console.info(`toolchains: ${summary}`);
    expect(chains.javascript?.available).toBe(true);
  });

  for (const algo of ALL_ALGORITHMS) {
    it(`${algo.id}: every language agrees with the reference`, async () => {
      const report = await verifyAlgorithm(algo);
      if (report.failed > 0) {
        throw new Error(`${summarise(report)}\n${formatFailures(report)}`);
      }
      expect(report.failed).toBe(0);
      const chains = await toolchains();
      const available = (Object.keys(chains) as Array<keyof typeof chains>).filter(
        (l) => chains[l]?.available && algo.expectations.length > 0,
      );
      expect(
        report.passed,
        'harness checked nothing — every language was skipped',
      ).toBeGreaterThanOrEqual(algo.expectations.length * Math.max(1, available.length));
    }, 300_000);
  }
});

describe('jsonEqual', () => {
  it('treats 1 and 1.0 as equal', () => {
    expect(jsonEqual(1, 1.0)).toBeNull();
  });

  it('compares arrays structurally and reports the path', () => {
    expect(jsonEqual([1, [2, 3]], [1, [2, 3]])).toBeNull();
    expect(jsonEqual([1, [2, 3]], [1, [2, 4]])).toContain('$[1][1]');
  });

  it('compares objects by union of keys', () => {
    expect(jsonEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBeNull();
    expect(jsonEqual({ a: 1 }, { a: 1, b: undefined })).toBeNull();
    expect(jsonEqual({ a: 1 }, { a: 2 })).toContain('$.a');
  });

  it('handles null on both sides', () => {
    expect(jsonEqual(null, null)).toBeNull();
    expect(jsonEqual(null, 0)).toContain('$');
  });
});
