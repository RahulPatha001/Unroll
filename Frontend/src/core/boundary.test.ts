import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripCommentsAndStrings } from '../lib/stripSource.ts';

/**
 * The `core/` boundary, enforced by test as well as by lint.
 *
 * `biome.jsonc` carries the same rules and they work — but this file exists
 * because of how that went wrong. A `//` comment inside `biome.json` is a parse
 * error; Biome falls back to defaults; and *every override in the file silently
 * stops applying* while the config still looks perfectly correct. That is the
 * worst class of enforcement failure: green CI, no protection, and a comment
 * explaining a rule that is not running.
 *
 * A test that reads the source tree cannot be switched off by a stray character.
 * It costs milliseconds, needs no configuration, and fails loudly.
 *
 * The rules, and why each exists:
 *
 *  - **No React / DOM / animation imports in `core/`.** So algorithms stay
 *    testable in plain Node, `core/` stays extractable into a package or a
 *    Worker, and visualisation logic cannot bleed into algorithm logic.
 *  - **No `node:*` in `core/`.** `core/` runs in the browser. The verification
 *    harness spawns `python3`, `javac` and `g++`; that lives in `tools/`, is a
 *    dev-time Node tool, and must never reach the browser bundle.
 *  - **No `Math.random()` in `core/`.** A golden trace snapshot is only
 *    meaningful if the input that produced it is reproducible, and a share link
 *    is only meaningful if the seed reproduces the run. All randomness goes
 *    through `core/input/rng.ts`. Biome's `noRestrictedGlobals` cannot express
 *    this — it matches bare identifiers, not member expressions — which is
 *    exactly why it needs a test.
 *
 * Every scan runs against source with comments and string literals removed by
 * `stripCommentsAndStrings`, because otherwise the rules fire on the algorithms'
 * own narration ("the window is empty and the answer is -1") and a rule that
 * cannot tell code from prose is a rule nobody keeps.
 */

const CORE = 'src/core';

const FORBIDDEN_IMPORTS: Array<[RegExp, string]> = [
  [/^react(\/.*)?$/, 'React — rendering belongs in src/features/'],
  [/^react-dom(\/.*)?$/, 'React DOM — core/ must not touch the DOM'],
  [/^react-router(\/.*)?$/, 'the router — core/ has no notion of a route'],
  [/^zustand(\/.*)?$/, 'Zustand — the store holds React-facing state, not algorithm state'],
  [/^motion(\/.*)?$/, 'the animation library — core/ emits data, it does not animate'],
  [/^shiki(\/.*)?$/, 'Shiki — highlighting is a code-panel concern'],
  [/^lucide-react(\/.*)?$/, 'icons — a React concern'],
  [/^node:/, 'node builtins — the verification harness in tools/ owns process spawning'],
  [/^(fs|path|child_process|os|url|util)$/, 'node builtins — core/ runs in the browser'],
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** Scannable form: comments and string contents removed, line count preserved. */
function codeOf(file: string): string[] {
  return stripCommentsAndStrings(readFileSync(file, 'utf8')).split('\n');
}

const coreFiles = walk(CORE).filter((f) => !f.endsWith('.test.ts'));

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]{0,400}?from\s+['"]([^'"]+)['"]/g;
const BARE_IMPORT_RE = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;

describe('the core/ boundary', () => {
  it('finds the core sources (a silent zero here would make every other check vacuous)', () => {
    expect(coreFiles.length).toBeGreaterThan(8);
  });

  it('imports nothing from React, the DOM, or Node', () => {
    const problems: string[] = [];
    for (const file of coreFiles) {
      const code = stripCommentsAndStrings(readFileSync(file, 'utf8'));
      for (const re of [IMPORT_RE, BARE_IMPORT_RE]) {
        re.lastIndex = 0;
        let m = re.exec(code);
        while (m) {
          const spec = m[1] ?? '';
          for (const [pattern, why] of FORBIDDEN_IMPORTS) {
            if (pattern.test(spec)) problems.push(`${file}: imports "${spec}" — ${why}`);
          }
          m = re.exec(code);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('never calls Math.random', () => {
    const problems: string[] = [];
    for (const file of coreFiles) {
      if (file.includes('input/rng.ts')) continue; // the one legitimate exception
      codeOf(file).forEach((line, i) => {
        if (line.includes('Math.random')) {
          problems.push(
            `${file}:${i + 1}: Math.random() breaks golden traces and share links — use makeRng from input/rng.ts`,
          );
        }
      });
    }
    expect(problems).toEqual([]);
  });

  it('does not touch browser globals', () => {
    // The import ban is only half the rule; the other half is
    // `document.querySelector` with no import at all.
    //
    // `window` is deliberately NOT in the list, and the reason is worth stating
    // because it was found the hard way. Two problems:
    //
    //  1. Much of this curriculum *is* sliding windows. `highlight: { window:
    //     [...] }` is a central concept and `const window = s.slice(...)` is
    //     ordinary, readable code. A static rule cannot tell that local from the
    //     global, so it cries wolf on correct code — and a rule that cries wolf
    //     gets deleted.
    //  2. A real `window` access in `core/` cannot survive anyway. `core/` runs
    //     in a Worker, which has no `window`, and in Node, which has no
    //     `window` either. The unit suite would fail on the first line of the
    //     algorithm. The runtime already catches this; a static rule adds
    //     nothing and costs false positives.
    //
    // `document`, `localStorage`, `sessionStorage` and `navigator` stay: no
    // algorithm has a legitimate local by those names, so they cost nothing.
    const problems: string[] = [];
    const browserOnly = /\b(document|localStorage|sessionStorage|navigator)\b/;
    for (const file of coreFiles) {
      codeOf(file).forEach((line, i) => {
        if (browserOnly.test(line)) {
          problems.push(`${file}:${i + 1}: touches a browser global — ${line.trim().slice(0, 70)}`);
        }
      });
    }
    expect(problems).toEqual([]);
  });

  it('tolerates a local variable named `window`', () => {
    // The regression guard for the rule above. If this ever starts failing, the
    // boundary check has become a false-positive machine again.
    const src = [
      'const window = s.slice(start, start + width);',
      'if (window.includes(t)) return window;',
      'return { window: [], highlight: { window: [0, 1] } };',
    ].join('\n');
    const code = stripCommentsAndStrings(src);
    expect(code).toContain('const window =');
    expect(code).not.toMatch(/\b(document|localStorage|sessionStorage|navigator)\b/);
  });

  it('does not use setTimeout or requestAnimationFrame to sequence work', () => {
    // A generator that waits on a timer is no longer pure, and `core/` runs in a
    // Worker where `requestAnimationFrame` does not exist at all.
    const problems: string[] = [];
    for (const file of coreFiles) {
      codeOf(file).forEach((line, i) => {
        if (/\b(setTimeout|setInterval|requestAnimationFrame|queueMicrotask)\b/.test(line)) {
          problems.push(
            `${file}:${i + 1}: sequences work with a timer — run() must be a pure generator`,
          );
        }
      });
    }
    expect(problems).toEqual([]);
  });
});

/**
 * The lazy-loading boundary, which is a different rule from the `core/` boundary
 * above and belongs here because it is the same kind of invisible-until-you-
 * measure failure.
 */
describe('the lazy-loading boundary', () => {
  /*
   * Every directory that ships to the browser outside `core/`.
   *
   * `features/` was the only one when this rule was written, because `features/`
   * was the only one. Adding `app/` and `features/learn/` matters more than it
   * looks: both render algorithm frames — `ComparePage` builds two traces and
   * `EmbeddedStepper` builds one — so both are exactly the kind of module that
   * reaches for `registry.ts` to get at an algorithm, and exactly the kind of
   * import that puts 66 generators and 264 source listings into the entry chunk.
   *
   * They go through `loadAlgorithm` instead, which is a dynamic `import()`, so each
   * algorithm stays in its own lazy chunk. This test is what stops a future "just
   * import it directly here" from quietly undoing that.
   */
  const BROWSER_DIRS = ['src/features', 'src/app', 'src/features/learn'];

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts')) out.push(full);
    }
    return out;
  }

  it('never imports algorithms/registry.ts', () => {
    /*
     * `registry.ts` statically imports every algorithm module — 54 generators and
     * 216 source listings. Importing anything from it therefore puts the entire
     * curriculum in the initial bundle.
     *
     * This happened: `playerStore.ts` imported one string constant,
     * `DEFAULT_ALGORITHM_ID`, and the initial payload went from 60 kB to 371 kB
     * gzip. The import looked entirely reasonable, typecheck passed, every test
     * passed, and the only symptom was a build-size number nobody was watching
     * until the CI budget gate failed.
     *
     * So: the constant lives in `catalog.ts` (pure metadata, free to import), and
     * this test makes any future drift a failing test rather than a slow app.
     */
    const offenders: string[] = [];
    for (const dir of BROWSER_DIRS) {
      for (const file of walk(dir)) {
        const code = stripCommentsAndStrings(readFileSync(file, 'utf8'));
        if (/from\s+['"][^'"]*algorithms\/registry\.ts['"]/.test(code)) {
          offenders.push(file);
        }
      }
    }
    expect(
      offenders,
      'browser code must not import algorithms/registry.ts — it would pull the whole curriculum into the initial bundle. Import from catalog.ts, or use loadAlgorithm() for a dynamic import.',
    ).toEqual([]);
  });

  it('reaches algorithms through the lazy loader, not a direct module import', () => {
    /*
     * The rule above catches the registry. This catches the other way to get a
     * similar result: importing one algorithm module *by path* and using it
     * directly.
     *
     * That is a static import too, so it does not blow up the whole curriculum — it
     * silently defeats the code splitting for exactly one algorithm, which is worse
     * in a way, because the bundle table shows a plausible-looking chunk and nothing
     * anywhere fails. `loadAlgorithm` is the only supported way in; anything
     * reaching for a file under `algorithms/<category>/` is bypassing it.
     *
     * The negative lookahead lets through the metadata modules, which are pure data
     * and are meant to be imported directly.
     */
    const offenders: string[] = [];
    const direct =
      /from\s+['"][^'"]*algorithms\/(?!registry\.ts|catalog\.ts|catalog-types\.ts|types\.ts)[a-z-]+\//;
    for (const dir of BROWSER_DIRS) {
      for (const file of walk(dir)) {
        const code = stripCommentsAndStrings(readFileSync(file, 'utf8'));
        if (direct.test(code)) offenders.push(file);
      }
    }
    expect(
      offenders,
      'browser code must reach algorithm modules through loadAlgorithm(), not a direct path import — a direct import defeats the per-algorithm code split.',
    ).toEqual([]);
  });

  it('keeps the catalog importable without any algorithm module', () => {
    // The structural half of the rule: `catalog.ts` exists precisely so the
    // sidebar and the store can read metadata with nothing else pulled in.
    const code = stripCommentsAndStrings(readFileSync('src/core/algorithms/catalog.ts', 'utf8'));
    expect(code).not.toMatch(/from\s+['"][^'"]*registry\.ts['"]/);
    for (const line of code.split('\n')) {
      const m = /from\s+['"]([^'"]+)['"]/.exec(line);
      if (m) {
        expect(m[1], `catalog.ts imports ${m[1]}`).not.toMatch(
          /sorting|searching|graphs|trees|heaps|tries|hashing|linked-lists|stacks-queues|dynamic-programming|two-pointers|sliding-window|greedy|recursion/,
        );
      }
    }
  });
});

/**
 * The `core/learn/` boundary.
 *
 * `core/learn/` is the article *data* layer, and the only reason it lives under
 * `core/` at all is that it is plain data: no React, no DOM, testable in Node.
 * That is what lets `learn.test.ts` check every `algoId` and every preset an
 * article references without rendering anything — which is the only reason a stale
 * reference in an article is caught before a reader finds it.
 *
 * If an article ever grew an import of the algorithm registry, or anything
 * React-shaped, this layer would stop being plain data and that test would need a
 * DOM. So the property is checked rather than assumed, for the same reason the
 * `core/` rules above are.
 */
describe('the learn/ boundary', () => {
  function walkLearn(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walkLearn(full, out);
      else if (/\.ts$/.test(entry)) out.push(full);
    }
    return out;
  }

  it('article data imports no React, no DOM, and no algorithm modules', () => {
    const problems: string[] = [];
    const files = walkLearn('src/core/learn');
    // A silent zero here would make the check vacuous, which is the failure mode
    // this file exists to prevent everywhere.
    expect(files.length).toBeGreaterThan(2);

    for (const file of files) {
      if (file.endsWith('.test.ts')) continue;
      const code = stripCommentsAndStrings(readFileSync(file, 'utf8'));
      for (const re of [IMPORT_RE, BARE_IMPORT_RE]) {
        re.lastIndex = 0;
        let m = re.exec(code);
        while (m) {
          const spec = m[1] ?? '';
          if (
            /^(react|react-dom|shiki|lucide-react|zustand)(\/.*)?$/.test(spec) ||
            /algorithms\/registry\.ts$/.test(spec) ||
            /^node:/.test(spec)
          ) {
            problems.push(`${file}: imports "${spec}" — core/learn is plain data`);
          }
          m = re.exec(code);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
