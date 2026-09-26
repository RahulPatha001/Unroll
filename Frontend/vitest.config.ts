import { defineConfig } from 'vitest/config';

/**
 * Two projects, because they have genuinely different shapes:
 *
 *  - `unit`   — the pure `src/core/` layer. No DOM, no jsdom, must stay sub-second.
 *               This is what contributors run constantly.
 *  - `parity` — the multilingual verification harness. Spawns `python3`, `javac`+`java`
 *               and `g++`, compiles, executes and diffs every language implementation of
 *               every algorithm. Slow, so it is a separate command (`npm run verify:langs`).
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          // `.test.tsx` as well as `.test.ts`. A handful of the most useful
          // things to assert about this app are pure functions that happen to
          // return JSX — the inline-emphasis renderer in `lib/richText.tsx` is
          // one — and a test glob that silently skipped them would make "there is
          // no test for this" indistinguishable from "no test was collected",
          // which is the worst possible failure mode for a glob.
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tools/**/*.test.ts'],
          exclude: ['**/node_modules/**', 'src/**/*.parity.test.ts'],
        },
      },
      {
        test: {
          name: 'parity',
          environment: 'node',
          include: ['src/**/*.parity.test.ts', 'tests/parity/**/*.test.ts'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
          // Compiling one file per language per algorithm is IO heavy; a little
          // parallelism here turns minutes into seconds.
          fileParallelism: true,
          pool: 'forks',
        },
      },
    ],
  },
});
