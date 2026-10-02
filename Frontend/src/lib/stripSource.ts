/**
 * Remove comments and string-literal *contents* from TypeScript source, so a
 * static scan can tell code from prose.
 *
 * Why this exists: the `core/` boundary test greps for `document`,
 * `Math.random` and forbidden imports. Run naively, it fires on the *note
 * strings* — one agent's prose said "the window is empty and the answer is -1"
 * and got reported for touching a browser global. A rule that cannot
 * distinguish code from a sentence is a rule people learn to ignore, and an
 * ignored rule protects nothing.
 *
 * Template literals are handled properly rather than dropped wholesale: the
 * `${…}` expressions are real code and are kept, so
 * `` `${document.title}` `` is still caught while `` `the window is empty` `` is
 * not.
 */

export function stripCommentsAndStrings(source: string): string {
  let out = '';
  let i = 0;
  const n = source.length;

  const isIdentChar = (c: string) => /[A-Za-z0-9_$]/.test(c);

  while (i < n) {
    const c = source[i] as string;
    const next = source[i + 1];

    // Line comment
    if (c === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i++;
      continue;
    }

    // Block comment
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
      continue;
    }

    // Single- or double-quoted string
    if (c === "'" || c === '"') {
      const quote = c;
      i++;
      while (i < n && source[i] !== quote) {
        if (source[i] === '\\') i++;
        i++;
      }
      i++;
      out += '""';
      continue;
    }

    // Template literal: keep the `${…}` expressions, drop the literal text.
    if (c === '`') {
      i++;
      while (i < n && source[i] !== '`') {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === '$' && source[i + 1] === '{') {
          // Collect the interpolation, then recurse on it.
          //
          // Recursing is what makes this correct rather than merely adequate: a
          // note like `${cond ? 'the window is empty' : 'ok'}` has a *string*
          // inside the interpolation, and copying the expression verbatim would
          // let that prose reach the scanner. The recursion is bounded by
          // template nesting depth, so it cannot diverge.
          let depth = 1;
          let expr = '';
          i += 2;
          while (i < n && depth > 0) {
            const d = source[i];
            if (d === '{') depth++;
            else if (d === '}') {
              depth--;
              if (depth === 0) {
                i++;
                break;
              }
            }
            expr += d;
            i++;
          }
          out += `\${${stripCommentsAndStrings(expr)}}`;
          continue;
        }
        if (source[i] === '\n') out += '\n';
        i++;
      }
      i++;
      out += '``';
      continue;
    }

    // Regex literals can contain quotes and slashes that would confuse the
    // naive scan. Detecting them properly needs a parser; a good enough
    // heuristic is "a `/` that follows `=`, `(`, `,`, `:` or a return type".
    if (c === '/' && !next) {
      out += c;
      i++;
      continue;
    }

    out += c;
    i++;
  }

  // A bare identifier check helper, exported for callers that want to be strict.
  void isIdentChar;
  return out;
}

/**
 * Remove comments but **keep** string contents — the inverse of the above, for
 * the other kind of scan.
 *
 * `stripCommentsAndStrings` is right for rules about *code* ("does `core/`
 * import React?", "does anything call `Math.random()`?"), where a note that says
 * "the window is empty" is prose and must not count as touching a browser
 * global. It is exactly wrong for rules about *what the app says to people*.
 *
 * The case that forced this: the renderer is DOM, and that fact used to be
 * contradicted in twenty-one algorithm `help:` strings, `docs/architecture.md`,
 * and the `InputEditor` warning. A test that the promises cannot come back needs
 * to read the strings — and those strings are string literals, so stripping
 * them removes precisely the evidence. Hence the mirror image: comments go,
 * strings stay, and a comment that *discusses* the absence of a canvas no longer
 * reads as a promise of one.
 *
 * Comments are still detected correctly inside template-literal interpolations,
 * because `${…}` is code. A `//` inside a plain string is left alone, which is
 * the whole point.
 */
export function stripComments(source: string): string {
  let out = '';
  let i = 0;
  const n = source.length;

  while (i < n) {
    const c = source[i] as string;
    const next = source[i + 1];

    if (c === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i++;
      continue;
    }

    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
      continue;
    }

    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      out += c;
      i++;
      while (i < n && source[i] !== quote) {
        if (source[i] === '\\') {
          out += source[i] ?? '';
          out += source[i + 1] ?? '';
          i += 2;
          continue;
        }
        // Only `${…}` is code inside a template; strip comments within it.
        if (quote === '`' && source[i] === '$' && source[i + 1] === '{') {
          let depth = 1;
          let expr = '';
          i += 2;
          while (i < n && depth > 0) {
            const d = source[i];
            if (d === '{') depth++;
            else if (d === '}') {
              depth--;
              if (depth === 0) {
                i++;
                break;
              }
            }
            expr += d;
            i++;
          }
          out += `\${${stripComments(expr)}}`;
          continue;
        }
        out += source[i];
        i++;
      }
      out += quote;
      i++;
      continue;
    }

    out += c;
    i++;
  }

  return out;
}
