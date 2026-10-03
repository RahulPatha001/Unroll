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

  it('leaves a bracket that is not a link completely alone', () => {
    /*
     * The regression this whole construct had to avoid.
     *
     * Almost every article about arrays is written in `a[mid]`, `a[low..high-1]` and
     * `[low, high)`. A rule that treated any `[` as the start of markup would have
     * eaten those brackets — or refused to render the emphasis around them, which is
     * worse and much harder to spot. Recognition requires the complete `](…)`, so an
     * index expression is just text.
     */
    const out = html('`a[mid]` and `a[low..high-1]`, and the range `[low, high)`');
    expect(out).not.toContain('<a ');
    expect(out.match(/<code/g)).toHaveLength(3);
    expect(out).not.toContain('`');
  });

  it('consumes the brackets of an index expression rather than leaving them', () => {
    const out = html('`a[mid]`');
    expect(out).toContain('>a[mid]</code>');
    expect(out).not.toContain('`');
  });

  it('does not treat ]( inside a code span as a link', () => {
    // `](` is literal inside a code span, as in every Markdown dialect:
    // `` `values[i](x)` `` is an expression, not a link.
    //
    // The second assertion is the one that matters. Recognising-and-refusing is only
    // half the behaviour; if refusing also *split* the run, the code span would
    // render as two adjacent boxes with a gap, which is a visible artefact caused by
    // a string with nothing wrong with it.
    const out = html('call `values[i](x)` twice');
    expect(out).not.toContain('<a ');
    expect(out.match(/<code/g)).toHaveLength(1);
    expect(out).toContain('>values[i](x)</code>');
  });
});

describe('inline links', () => {
  it('renders a same-site link as a real anchor', () => {
    // A real `href`, not a click handler: it has to survive being copied out of the
    // page, middle-clicked and opened in a new tab.
    const out = html('see the [sorting landscape](/learn/sorting-landscape) next');
    expect(out).toContain('href="/learn/sorting-landscape"');
    expect(out).toContain('>sorting landscape</a>');
    // And the markup must be *consumed* — the original bug was brackets and parens
    // rendered as literal text, which reads as a broken build.
    expect(out).not.toContain('[');
    expect(out).not.toContain('](');
  });

  it('renders emphasis inside a link label', () => {
    const out = html('read [**the sorting landscape**](/learn/sorting-landscape)');
    expect(out).toContain('<strong');
    expect(out).toContain('>the sorting landscape</strong></a>');
  });

  it('keeps two links with the same label but different targets', () => {
    // Content-only keys would collide here and React would drop one of the two
    // anchors — the same duplicate-key trap as `**` and `` ` ``.
    const out = html('[one](/learn/binary-search) and [one](/learn/hash-tables)');
    expect(out.match(/<a /g)).toHaveLength(2);
    expect(out).toContain('href="/learn/binary-search"');
    expect(out).toContain('href="/learn/hash-tables"');
  });

  it('handles a link, emphasis and code in the same sentence', () => {
    const out = html('the **worst case** is `O(n²)` — see [greedy](/learn/greedy)');
    expect(out).toContain('<strong');
    expect(out).toContain('<code');
    expect(out).toContain('href="/learn/greedy"');
    expect(out).not.toContain('**');
    expect(out).not.toContain('`');
  });

  it('leaves an unclosed link as text rather than guessing at the intent', () => {
    // A missing paren is a typo. Rendering a plausible-looking broken link hides it;
    // leaving the characters visible hands the mistake back to whoever can fix it.
    expect(html('[sorting landscape](/learn/sorting-landscape')).toBe(
      '[sorting landscape](/learn/sorting-landscape',
    );
    expect(html('[sorting landscape /learn/sorting-landscape)')).not.toContain('<a ');
  });

  it('refuses an href that is not a path on this site', () => {
    // The one piece of prose that is not inert. Content is authored in-repo today, so
    // this is defence for a future rather than for a live bug — but it is cheap, and
    // it is what keeps "there is nothing here to sanitise" true rather than merely
    // currently true.
    for (const href of [
      'javascript:alert(1)',
      'https://example.com/x',
      '//example.com',
      'learn/x',
    ]) {
      const out = html(`click [here](${href})`);
      expect(out, href).not.toContain('<a ');
      expect(out, href).toContain(href); // visible, so the mistake is findable
    }
  });

  it('intercepts the click only when a navigation handler is given', () => {
    const withNav = renderToStaticMarkup(
      <Em text="[next](/learn/bfs-and-dfs)" onNavigate={() => undefined} />,
    );
    // `renderToStaticMarkup` cannot exercise the handler, so what is asserted here is
    // that supplying one does not change the markup — the href is still there either
    // way, which is what makes a shared link work.
    expect(withNav).toContain('href="/learn/bfs-and-dfs"');
    expect(html('plain')).toBe('plain');
  });
});
