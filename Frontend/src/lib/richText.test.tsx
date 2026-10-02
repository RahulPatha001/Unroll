import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Em } from './richText.tsx';

const html = (text: string): string => renderToStaticMarkup(<Em text={text} />);

describe('inline emphasis', () => {
  it('leaves text without a marker completely alone', () => {
    // The overwhelmingly common case, and the one that must not gain a wrapper:
    // an extra <strong> in the accessibility tree or a stray key is a cost paid
    // by every note in the app to serve the rare one.
    expect(html('No markers at all.')).toBe('No markers at all.');
  });

  it('renders a single emphasised run', () => {
    expect(html('the stack records **2 again** rather than 8')).toContain(
      '<strong class="font-semibold text-text-strong">2 again</strong>',
    );
  });

  it('renders several runs in one string', () => {
    const out = html('a **b** c **d** e');
    expect(out.match(/<strong/g)).toHaveLength(2);
    expect(out).toContain('>b</strong>');
    expect(out).toContain('>d</strong>');
  });

  it('keeps every word when the emphasised text repeats the surrounding text', () => {
    // The duplicate-key trap. `**` splits this into four segments, two of which
    // are the identical string '2 '. A key derived from content alone collides,
    // React drops one of the pair, and the sentence silently loses a word — which
    // is exactly the kind of bug that only shows up in one algorithm's note.
    const out = html('push 2, **2** and 2');
    expect(out.match(/2/g)).toHaveLength(3);
    expect(out).toContain('<strong');
  });

  it('escapes the text rather than interpreting it as markup', () => {
    // There is no HTML pass here at all, so this can only be React's own escaping.
    // Asserted because "we render strings" is exactly the claim that needs a test.
    expect(html('**<script>alert(1)</script>**')).toContain('&lt;script&gt;');
    expect(html('**<script>alert(1)</script>**')).not.toContain('<script>');
  });

  it('leaves an unpaired marker visible rather than emphasising the rest', () => {
    // A dangling `**` has no partner. Splitting anyway would bold everything after
    // it and delete the marker, so a typo would read as confident emphasis —
    // worse than the stray asterisk, because it looks intentional. Leaving the
    // string alone keeps the mistake visible to whoever can fix it.
    expect(html('a ** dangling marker')).toBe('a ** dangling marker');
    expect(html('**opening only')).toBe('**opening only');
  });

  it('handles markers at the very start and end', () => {
    expect(html('**whole string**')).toContain('<strong');
    expect(html('**whole string**')).not.toContain('**');
  });
});

describe('inline code', () => {
  it('renders a code run', () => {
    const out = html('run `n-1` comparisons');
    expect(out).toContain('<code');
    expect(out).toContain('>n-1</code>');
    // The backticks must be *consumed*, not displayed. That was the actual bug:
    // every one of the seven guides wrote `n-1` and the reader saw the backticks,
    // which reads as a broken build rather than as code.
    expect(out).not.toContain('`');
  });

  it('renders several code runs', () => {
    const out = html('`a` then `b`');
    expect(out.match(/<code/g)).toHaveLength(2);
    expect(out).toContain('>a</code>');
    expect(out).toContain('>b</code>');
  });

  it('handles code and emphasis in the same sentence', () => {
    const out = html('the **worst case** is `O(n²)`, not `O(n log n)`');
    expect(out.match(/<code/g)).toHaveLength(2);
    expect(out.match(/<strong/g)).toHaveLength(1);
    expect(out).toContain('>O(n²)</code>');
    expect(out).toContain('>worst case</strong>');
    expect(out).not.toContain('`');
    expect(out).not.toContain('**');
  });

  it('escapes the text rather than interpreting it as markup', () => {
    expect(html('`<img src=x onerror=alert(1)>`')).toContain('&lt;img');
    expect(html('`<img src=x onerror=alert(1)>`')).not.toContain('<img');
  });

  it('leaves an unpaired backtick visible, and does not half-render the rest', () => {
    // The all-or-nothing rule. A string with valid `**` but a dangling backtick is
    // emitted verbatim — no bold, no code. A sentence with one marker pair applied
    // and one left literal looks like a rendering bug; a sentence with its markers
    // intact looks like a typo, which is what it is.
    const out = html('**bold** and a ` dangling backtick');
    expect(out).toBe('**bold** and a ` dangling backtick');
    expect(out).not.toContain('<strong');
    expect(out).not.toContain('<code');
  });

  it('leaves an unpaired emphasis marker alone even when the code is valid', () => {
    // The symmetric case, and the reason validation happens before tokenizing
    // rather than during it.
    const out = html('`code` and a ** dangling bold');
    expect(out).toBe('`code` and a ** dangling bold');
    expect(out).not.toContain('<code');
    expect(out).not.toContain('<strong');
  });

  it('does not count a backtick inside a code span as a second pair', () => {
    // An odd/even count on the raw string is the only thing standing between a
    // typo and a mangled paragraph, so the counting has to be on markers, not on
    // quotes: `` `a` and `b` `` is four backticks and therefore valid.
    const out = html('`a` and `b`');
    expect(out).not.toContain('`');
    expect(out.match(/<code/g)).toHaveLength(2);
  });

  it('keeps repeated code runs distinct', () => {
    // The same duplicate-key trap as `**`, for the same reason: `say `x` then `x``
    // produces three identical code runs, and a content-only key would collide —
    // React drops one and a word disappears.
    const out = html('say `x` then `x` then `x`');
    expect(out.match(/<code/g)).toHaveLength(3);
    // Counted from the element *text*, not from the whole markup: `px-1` and
    // `rounded-[3px]` contain an "x", so a naive `/x/g` over the HTML counts the
    // class names too and passes for the wrong reason.
    expect(out.match(/>([^<]*)</g)?.filter((s) => s === '>x<')).toHaveLength(3);
  });
});
