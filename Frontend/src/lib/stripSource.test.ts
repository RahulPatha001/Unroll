import { describe, expect, it } from 'vitest';
import { stripCommentsAndStrings } from './stripSource.ts';

/**
 * `stripCommentsAndStrings` is what lets the `core/` boundary test tell code
 * from prose. If it is wrong, the boundary rules either fire on narration or
 * miss real code, so it gets its own tests.
 */
// The `${…}` sequences in the assertions below are the *subject under test* —
// a scanner that has to recognise them cannot be tested with strings that avoid
// them. Biome matches the last comment before the diagnostic, so both the
// start and end suppressions have to be a single line.
// biome-ignore-start lint/suspicious/noTemplateCurlyInString: the ${…} sequences are the subject under test
describe('stripCommentsAndStrings', () => {
  it('removes line comments', () => {
    expect(stripCommentsAndStrings('const a = 1; // Math.random()')).toBe('const a = 1; ');
  });

  it('removes block comments and keeps the line count', () => {
    const src = ['/*', ' * document.title', ' */', 'const a = 1;'].join('\n');
    const out = stripCommentsAndStrings(src);
    expect(out).not.toContain('document');
    expect(out.split('\n')).toHaveLength(4);
    expect(out).toContain('const a = 1;');
  });

  it('empties single- and double-quoted strings but keeps a quote pair', () => {
    // The replacement is always `""` regardless of the original delimiter: the
    // output is only ever scanned, never re-parsed, so normalising keeps the
    // function trivially correct instead of fiddly.
    expect(stripCommentsAndStrings(`const s = 'document.title';`)).toBe('const s = "";');
    expect(stripCommentsAndStrings(`const s = "Math.random()";`)).toBe('const s = "";');
  });

  it('empties template literal text but keeps interpolations', () => {
    const out = stripCommentsAndStrings('const s = `the window is empty ${a + b} ok`;');
    expect(out).not.toContain('window is empty');
    expect(out).toContain('${a + b}');
  });

  it('catches a browser global hidden inside an interpolation', () => {
    const out = stripCommentsAndStrings('const s = `${document.title}`;');
    expect(out).toContain('document');
  });

  it('handles escaped quotes inside strings', () => {
    const out = stripCommentsAndStrings(`const s = 'it\\'s fine'; const t = 1;`);
    expect(out).toContain('const t = 1;');
    expect(out).not.toContain('fine');
  });

  it('leaves code alone', () => {
    const src = 'export function f(a: number): number {\n  return a * 2;\n}';
    expect(stripCommentsAndStrings(src)).toBe(src);
  });

  it('does not treat a division as a comment', () => {
    const out = stripCommentsAndStrings('const half = total / 2; // two');
    expect(out).toContain('const half = total / 2;');
  });

  it('survives the C++ and Java listings, which are template-literal payloads', () => {
    // The listings are strings, so they must vanish entirely — otherwise a
    // `document` inside an example listing would trip the boundary rule.
    const src = ['const CPP = `', '#include <vector>', '// @anchor init', 'int x = 0;', '`;'].join(
      '\n',
    );
    const out = stripCommentsAndStrings(src);
    expect(out).not.toContain('include');
    expect(out).not.toContain('@anchor');
    expect(out).toContain('const CPP = ');
  });
});

describe('stripCommentsAndStrings — nested cases', () => {
  it('recurses into interpolations so strings inside them are emptied too', () => {
    // This exact shape is what the boundary test tripped over: a narration
    // string nested inside a template interpolation, containing the word
    // "window". Copying the expression verbatim let the prose through.
    const src = "note: `${low} > ${high}, so ${cond ? 'the window is empty' : 'ok'}`";
    const out = stripCommentsAndStrings(src);
    expect(out).not.toContain('window');
    expect(out).toContain('${cond ? "" : ""}');
  });

  it('still catches a real global inside an interpolation', () => {
    expect(stripCommentsAndStrings('`${document.title}`')).toContain('document');
  });

  it('handles a nested template inside an interpolation', () => {
    const out = stripCommentsAndStrings('`${a ? `x ${b}` : `y ${c}`}`');
    expect(out).not.toContain('`x');
    expect(out).toContain('${b}');
    expect(out).toContain('${c}');
  });
});
// biome-ignore-end lint/suspicious/noTemplateCurlyInString: see the start above
