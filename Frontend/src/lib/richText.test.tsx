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
      '<strong class="font-semibold text-slate-50">2 again</strong>',
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
