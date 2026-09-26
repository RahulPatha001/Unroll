import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createContext, runInContext } from 'node:vm';
import type { AlgoDef, Expectation } from '../../src/core/algorithms/types.ts';
import { LANGS, type Lang } from '../../src/core/code/anchors.ts';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const DRIVERS = join(HERE, 'drivers');

/* ------------------------------------------------------------------ *
 * Toolchain discovery
 *
 * A missing toolchain must SKIP, never fail. Contributors without a JDK
 * still get the unit suite; CI installs all three. See plan §10.1.
 * ------------------------------------------------------------------ */

export interface Toolchain {
  available: boolean;
  reason?: string;
  version?: string;
}

async function probe(cmd: string, args: string[]): Promise<Toolchain> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      timeout: 20_000,
    });
    const version = `${stdout}${stderr}`.split('\n')[0]?.trim() ?? '';
    return { available: true, version };
  } catch (e) {
    return {
      available: false,
      reason: e instanceof Error ? e.message.split('\n')[0] : 'unknown',
    };
  }
}

let cached: Partial<Record<Lang, Toolchain>> | null = null;

export async function toolchains(force = false): Promise<Record<Lang, Toolchain>> {
  if (cached && !force) return cached as Record<Lang, Toolchain>;
  const [py, java, gpp] = await Promise.all([
    probe('python3', ['--version']),
    probe('java', ['-version']),
    probe('g++', ['--version']),
  ]);
  cached = {
    javascript: { available: true, version: process.version },
    python: py,
    // No `javac` binary needed: `java File.java` (JEP 330) compiles in memory
    // using the jdk.compiler module, which ships even in a JRE install. That
    // matters because plenty of developer machines have a JRE on PATH and no
    // JDK, and silently skipping the Java check for those would be a shame.
    java,
    cpp: gpp,
  };
  return cached as Record<Lang, Toolchain>;
}

/** True when the `java` on PATH can compile a source file in memory. */
export async function javaCanCompile(): Promise<boolean> {
  if (!cached?.java?.available) return false;
  const dir = mkdtempSync(join(tmpdir(), 'verify-javaprobe-'));
  try {
    writeFileSync(
      join(dir, 'P.java'),
      'class P { public static void main(String[] a){ System.out.print("ok"); } }',
    );
    const { stdout } = await execFileAsync('java', ['P.java'], {
      cwd: dir,
      timeout: 60_000,
    });
    return stdout.trim() === 'ok';
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ *
 * Result types
 * ------------------------------------------------------------------ */

export interface CaseResult {
  algoId: string;
  presetId: string;
  lang: Lang;
  ok: boolean;
  /** What the implementation returned, after JSON round-tripping. */
  actual?: unknown;
  expected: unknown;
  /** Populated on failure. */
  error?: string;
  /** Populated when the toolchain was absent. */
  skipped?: string;
  durationMs: number;
}

export interface AlgoVerification {
  algoId: string;
  results: CaseResult[];
  passed: number;
  failed: number;
  skipped: number;
}

/* ------------------------------------------------------------------ *
 * Comparison
 * ------------------------------------------------------------------ */

const EPSILON = 1e-9;

/**
 * Structural comparison with a float tolerance.
 *
 * Deliberately *not* deep-equality on the raw values: C++ and Java return
 * `1` where Python returns `1.0` for a division, and a verifier that fails on
 * that teaches nothing. Numbers compare numerically; everything else compares
 * by type-aware structure.
 */
export function jsonEqual(a: unknown, b: unknown, path = '$'): string | null {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Math.abs(a - b) > EPSILON * Math.max(1, Math.abs(a), Math.abs(b))) {
      return `${path}: expected ${b}, got ${a}`;
    }
    return null;
  }
  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b || (a == null && b == null)
      ? null
      : `${path}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return `${path}: array vs non-array`;
    if (a.length !== b.length) return `${path}: length ${a.length} vs expected ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const m = jsonEqual(a[i], b[i], `${path}[${i}]`);
      if (m) return m;
    }
    return null;
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
    for (const k of keys) {
      const m = jsonEqual(ao[k], bo[k], `${path}.${k}`);
      if (m) return m;
    }
    return null;
  }
  if (a !== b) return `${path}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`;
  return null;
}

/* ------------------------------------------------------------------ *
 * Per-language runners
 * ------------------------------------------------------------------ */

const JAVA_ENTRY_RE = /^(?:class\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\.([A-Za-z_][A-Za-z0-9_]*)$/;

interface RunOutcome {
  ok: boolean;
  value?: unknown;
  error?: string;
}

async function runPython(
  code: string,
  entry: string,
  glue: string,
  expectation: Expectation,
  dir: string,
): Promise<RunOutcome> {
  const driver = readFileSync(join(DRIVERS, 'python', 'driver.py'), 'utf8');
  writeFileSync(join(dir, 'algo.py'), `${code}\n\n${driver}`);
  writeFileSync(join(dir, 'input.json'), JSON.stringify({ entry, glue, args: expectation.args }));
  try {
    await execFileAsync('python3', ['algo.py', entry, glue], {
      cwd: dir,
      timeout: 30_000,
    });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    const partial = readOutcome(dir);
    return partial.ok ? partial : { ok: false, error: `python3 failed: ${err.split('\n')[0]}` };
  }
  return readOutcome(dir);
}

async function runCpp(
  code: string,
  entry: string,
  expectations: Expectation[],
  dir: string,
): Promise<Map<string, RunOutcome>> {
  // C++ has no `graph` glue yet: the adjacency specialisation is selected by the
  // *declared parameter type* (see FromJ<vector<vector<pair<int,int>>>>), so the
  // same source works whether the JSON is a plain list or a node/edge object.
  // That is the reason the harness is type-driven rather than flag-driven.
  const driver = readFileSync(join(DRIVERS, 'cpp', 'driver.cpp'), 'utf8');
  writeFileSync(
    join(dir, 'main.cpp'),
    `${code}\n\nstatic auto* VERIFY_ENTRY = &${entry};\n\n${driver}`,
  );

  try {
    await execFileAsync('g++', ['-std=c++17', '-O1', '-w', '-o', 'main', 'main.cpp'], {
      cwd: dir,
      timeout: 90_000,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const all = new Map<string, RunOutcome>();
    for (const ex of expectations)
      all.set(ex.presetId, {
        ok: false,
        error: `g++ failed: ${firstLines(msg, 6)}`,
      });
    return all;
  }

  const out = new Map<string, RunOutcome>();
  for (const ex of expectations) {
    writeFileSync(join(dir, 'input.json'), JSON.stringify({ entry, glue: 'auto', args: ex.args }));
    try {
      await execFileAsync('./main', [], { cwd: dir, timeout: 30_000 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const partial = readOutcome(dir);
      out.set(
        ex.presetId,
        partial.ok ? partial : { ok: false, error: `run failed: ${firstLines(msg, 4)}` },
      );
      continue;
    }
    out.set(ex.presetId, readOutcome(dir));
  }
  return out;
}

async function runJava(
  code: string,
  entry: string,
  glue: string,
  expectations: Expectation[],
  dir: string,
): Promise<Map<string, RunOutcome>> {
  const m = JAVA_ENTRY_RE.exec(entry);
  if (!m) {
    const msg = `entry must be "ClassName.methodName", got ${JSON.stringify(entry)}`;
    return new Map(expectations.map((e) => [e.presetId, { ok: false, error: msg }]));
  }
  const [, className, methodName] = m as unknown as [string, string, string];

  const template = readFileSync(join(DRIVERS, 'java', 'runner.template.java'), 'utf8');
  // Java requires every `import` to precede every type declaration, and the
  // Runner class has to come first for the single-file launcher to find main().
  const imports = (code.match(/^\s*import\s+[^\n]+;\s*$/gm) ?? []).map((l) => l.trim()).join('\n');
  const body = code.replace(/^\s*import\s+[^\n]+;\s*$\n?/gm, '');
  const source = template
    .replace('//@@IMPORTS@@', imports)
    .replace(
      'static Class<?> VERIFY_TARGET = Object.class;',
      `static Class<?> VERIFY_TARGET = ${className}.class;`,
    )
    .replace('//@@CODE@@', body);
  writeFileSync(join(dir, 'Runner.java'), source);

  const out = new Map<string, RunOutcome>();

  // Compile once for the whole algorithm, then just re-run per case.
  //
  // The compiler is invoked as a module (`java -m jdk.compiler/...`) rather than
  // via the `javac` binary, because plenty of developer machines have a JRE on
  // PATH with no JDK package installed, and the jdk.compiler module ships in
  // both. Requiring a `javac` executable would silently skip Java verification
  // for exactly the people most likely to be writing the Java snippets.
  try {
    mkdirSync(join(dir, 'out'), { recursive: true });
    await execFileAsync(
      'java',
      ['-m', 'jdk.compiler/com.sun.tools.javac.Main', '-nowarn', '-d', 'out', 'Runner.java'],
      { cwd: dir, timeout: 120_000 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Map(
      expectations.map((ex) => [
        ex.presetId,
        { ok: false, error: `javac failed: ${firstLines(msg, 8)}` },
      ]),
    );
  }

  for (const ex of expectations) {
    writeFileSync(
      join(dir, 'input.json'),
      JSON.stringify({ entryMethod: methodName, glue, args: ex.args }),
    );
    try {
      await execFileAsync('java', ['-cp', 'out', 'Runner'], {
        cwd: dir,
        timeout: 60_000,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const partial = readOutcome(dir);
      out.set(
        ex.presetId,
        partial.ok ? partial : { ok: false, error: `java failed: ${firstLines(msg, 4)}` },
      );
      continue;
    }
    out.set(ex.presetId, readOutcome(dir));
  }
  return out;
}

/**
 * The `graph` glue for JavaScript: `{"nodes": [...], "edges": [[u, v, w], ...]}`
 * becomes `Record<number, Array<[number, number]>>`, mirroring
 * `drivers/python/driver.py` and the Java and C++ templates exactly.
 *
 * Without this the JavaScript listing was the odd one out: it received the raw
 * node/edge object while every other language received adjacency, so a `graph`
 * algorithm could not be verified in JavaScript at all. Node labels map to their
 * position in the `nodes` array, the same as the other three drivers.
 */
function jsToAdjacency(spec: unknown): Record<number, Array<[number, number]>> {
  const g = (spec ?? {}) as { nodes?: unknown[]; edges?: unknown[][] };
  const nodes = Array.isArray(g.nodes) ? g.nodes : [];
  const index = new Map<unknown, number>();
  nodes.forEach((label, i) => {
    index.set(label, i);
  });
  const adj: Record<number, Array<[number, number]>> = {};
  for (let i = 0; i < nodes.length; i++) adj[i] = [];
  for (const e of Array.isArray(g.edges) ? g.edges : []) {
    if (!Array.isArray(e)) continue;
    const u = index.get(e[0]);
    const v = index.get(e[1]);
    if (u === undefined || v === undefined) continue;
    const w = e.length > 2 ? Number(e[2]) : 1;
    (adj[u] as Array<[number, number]>).push([v, w]);
  }
  return adj;
}

/**
 * JavaScript runs in-process in a fresh `node:vm` context.
 *
 * This is a *test* harness and the code under test is code we wrote and review,
 * not user input — the same caveat that makes the browser-side "run my code"
 * feature dangerous does not apply inside our own test suite. `node:vm` is used
 * rather than `new Function` so the snippet gets a genuinely separate global.
 */
function runJavaScript(
  code: string,
  entry: string,
  glue: string,
  expectations: Expectation[],
): Map<string, RunOutcome> {
  const out = new Map<string, RunOutcome>();
  const sandbox = { __name__: entry, console };
  try {
    createContext(sandbox);
    runInContext(
      `${code}\n;globalThis.__result = typeof ${entry} === 'function' ? ${entry} : undefined;`,
      sandbox,
      {
        filename: 'algo.js',
      },
    );
    const fn = (sandbox as Record<string, unknown>).__result;
    if (typeof fn !== 'function') {
      for (const ex of expectations) {
        out.set(ex.presetId, {
          ok: false,
          error: `no function named ${entry} in the JavaScript source`,
        });
      }
      return out;
    }
    for (const ex of expectations) {
      const started = Date.now();
      void started;
      try {
        // The `graph` glue, exactly as the other three drivers do it:
        // turn `{ nodes, edges }` into adjacency before calling.
        const args =
          glue === 'graph'
            ? ex.args.map((a, i) =>
                i === 0 && a !== null && typeof a === 'object' ? jsToAdjacency(a) : a,
              )
            : ex.args;
        const value = (fn as (...a: unknown[]) => unknown)(...args);
        out.set(ex.presetId, {
          ok: true,
          value: JSON.parse(JSON.stringify(value ?? null)),
        });
      } catch (e) {
        out.set(ex.presetId, {
          ok: false,
          error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
        });
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    for (const ex of expectations)
      out.set(ex.presetId, { ok: false, error: `syntax error: ${msg}` });
  }
  return out;
}

function readOutcome(dir: string): RunOutcome {
  const file = join(dir, 'output.json');
  if (!existsSync(file)) return { ok: false, error: 'the implementation wrote no output.json' };
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as RunOutcome;
    return parsed.ok ? { ok: true, value: parsed.value } : { ok: false, error: parsed.error };
  } catch (e) {
    return {
      ok: false,
      error: `unreadable output.json: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

function firstLines(msg: string, n: number): string {
  const all = msg
    .split('\n')
    .filter((l) => l.trim().length > 0)
    // Compiler warnings are noise; the first error is what matters and it is
    // often buried under dozens of unchecked-cast warnings.
    .filter((l) => !/:\s*warning:/.test(l));
  const errors = all.filter((l) => /error/.test(l));
  return (errors.length > 0 ? errors : all).slice(0, n).join(' | ');
}

/* ------------------------------------------------------------------ *
 * The harness
 * ------------------------------------------------------------------ */

export interface VerifyOptions {
  langs?: Lang[];
  /** Only run these preset ids. */
  presets?: string[];
  keepTemp?: boolean;
}

export async function verifyAlgorithm(
  algo: AlgoDef,
  options: VerifyOptions = {},
): Promise<AlgoVerification> {
  const langs = (options.langs ?? [...LANGS]).filter((l) => algo.lesson.code[l]?.trim());
  const chains = await toolchains();
  const results: CaseResult[] = [];

  for (const lang of langs) {
    const chain = chains[lang];
    const expectations = algo.expectations.filter(
      (e) => !options.presets || options.presets.includes(e.presetId),
    );
    if (expectations.length === 0) continue;

    if (!chain?.available) {
      for (const ex of expectations) {
        results.push({
          algoId: algo.id,
          presetId: ex.presetId,
          lang,
          ok: false,
          expected: ex.result,
          skipped: `${lang} toolchain unavailable: ${chain?.reason ?? 'unknown'}`,
          durationMs: 0,
        });
      }
      continue;
    }

    const code = algo.lesson.code[lang] as string;
    const entry = algo.lesson.entry[lang] as string;
    const glue = algo.lesson.glue[lang] as string;

    const dir = mkdtempSync(join(tmpdir(), `verify-${algo.id}-${lang}-`));
    const startedAll = Date.now();
    let outcomes: Map<string, RunOutcome>;
    try {
      if (lang === 'javascript') {
        outcomes = runJavaScript(code, entry, glue, expectations);
      } else if (lang === 'python') {
        outcomes = new Map();
        for (const ex of expectations) {
          const t0 = Date.now();
          const r = await runPython(code, entry, glue, ex, dir);
          outcomes.set(ex.presetId, r);
          results.push(makeCase(algo, ex, lang, r, Date.now() - t0));
        }
        continue;
      } else if (lang === 'cpp') {
        outcomes = await runCpp(code, entry, expectations, dir);
      } else {
        outcomes = await runJava(code, entry, glue, expectations, dir);
      }
    } finally {
      if (!options.keepTemp) rmSync(dir, { recursive: true, force: true });
    }
    const total = Date.now() - startedAll;

    for (const ex of expectations) {
      const r = outcomes.get(ex.presetId) ?? {
        ok: false,
        error: 'no outcome recorded',
      };
      results.push(makeCase(algo, ex, lang, r, Math.round(total / expectations.length)));
    }
  }

  return {
    algoId: algo.id,
    results,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok && !r.skipped).length,
    skipped: results.filter((r) => Boolean(r.skipped)).length,
  };
}

function makeCase(
  algo: AlgoDef,
  ex: Expectation,
  lang: Lang,
  outcome: RunOutcome,
  durationMs: number,
): CaseResult {
  if (!outcome.ok) {
    return {
      algoId: algo.id,
      presetId: ex.presetId,
      lang,
      ok: false,
      expected: ex.result,
      error: outcome.error,
      durationMs,
    };
  }
  const mismatch = jsonEqual(outcome.value, ex.result);
  return {
    algoId: algo.id,
    presetId: ex.presetId,
    lang,
    ok: mismatch === null,
    actual: outcome.value,
    expected: ex.result,
    ...(mismatch === null ? {} : { error: mismatch }),
    durationMs,
  };
}

/** One-line summary suitable for CI logs. */
export function summarise(v: AlgoVerification): string {
  const parts = [`${v.algoId}: ${v.passed} passed`];
  if (v.failed) parts.push(`${v.failed} FAILED`);
  if (v.skipped) parts.push(`${v.skipped} skipped`);
  return parts.join(', ');
}

export function formatFailures(v: AlgoVerification): string {
  return v.results
    .filter((r) => !r.ok)
    .map((r) => {
      const head = `  ${r.algoId} [${r.lang}] preset "${r.presetId}"`;
      if (r.skipped) return `${head}\n    SKIPPED: ${r.skipped}`;
      return `${head}\n    ${r.error}\n    expected: ${JSON.stringify(r.expected)}\n    actual:   ${JSON.stringify(r.actual)}`;
    })
    .join('\n');
}
