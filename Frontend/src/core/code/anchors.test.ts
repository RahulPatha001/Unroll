import { describe, expect, it } from 'vitest';
import { anchorsInTrace, LANGS, parseCode, resolveAnchor, stripMarkers } from './anchors.ts';

describe('parseCode', () => {
  const source = [
    'def two_pointer_sum(nums, target):',
    '    a = sorted(nums)                    # @anchor init',
    '    while left < right:                 # @anchor while-cond',
    '        s = a[left] + a[right]',
    '',
  ].join('\n');

  it('maps every anchor to its 1-based line', () => {
    const parsed = parseCode('python', source);
    expect(parsed.anchors.init).toEqual({ start: 2, end: 2 });
    expect(parsed.anchors['while-cond']).toEqual({ start: 3, end: 3 });
  });

  it('keeps the marker text so tooltips can show the anchored line', () => {
    const parsed = parseCode('python', source);
    expect(parsed.markerLines.init?.text).toBe(
      'a = sorted(nums)                    # @anchor init',
    );
  });

  it('handles every comment syntax the four languages use', () => {
    for (const lang of LANGS) {
      const line = lang === 'python' ? 'x = 1  # @anchor step' : 'int x = 1;  // @anchor step';
      const parsed = parseCode(lang, line);
      expect(parsed.anchors.step, lang).toEqual({ start: 1, end: 1 });
    }
  });

  it('accepts hyphens and underscores in anchor names', () => {
    const parsed = parseCode('javascript', 'if (a > b) { // @anchor move-left\n');
    expect(parsed.anchors['move-left']).toBeDefined();
    const parsed2 = parseCode('javascript', 'if (a > b) { // @anchor move_left\n');
    expect(parsed2.anchors.move_left).toBeDefined();
  });

  it('picks up an @anchor inside a string literal, and documents why that is fine', () => {
    // The marker scan is intentionally simple: it does not tokenise, so an
    // `@anchor` inside a string literal is read as a real marker. Documenting
    // the limitation beats pretending it does not exist.
    //
    // Why it is acceptable: no listing contains "@anchor" inside a string, and
    // the failure mode is loud rather than silent. A bogus anchor makes the
    // contract test's "all four listings expose the same anchor set" check fail,
    // because the same string appears in one source and not in the others. A
    // full tokenizer would cost more than it saves.
    const parsed = parseCode(
      'javascript',
      'const s = "@anchor init"; // real marker @anchor actual\n',
    );
    expect(Object.keys(parsed.anchors).sort()).toEqual(['actual', 'init']);
  });

  it('takes the first line when an anchor is genuinely duplicated', () => {
    const parsed = parseCode('javascript', 'a(); // @anchor x\nb(); // @anchor x\n');
    expect(parsed.anchors.x).toEqual({ start: 1, end: 1 });
  });

  it('normalises CRLF', () => {
    const parsed = parseCode('javascript', 'a(); // @anchor x\r\nb();');
    expect(parsed.lines).toEqual(['a(); // @anchor x', 'b();']);
    expect(parsed.anchors.x?.start).toBe(1);
  });

  it('returns null for an unknown anchor rather than throwing', () => {
    const parsed = parseCode('python', source);
    expect(resolveAnchor(parsed, 'nope')).toBeNull();
    expect(resolveAnchor(parsed, undefined)).toBeNull();
  });
});

describe('anchorsInTrace', () => {
  it('collects unique anchors in first-seen order', () => {
    const frames = [{ anchor: 'b' }, { anchor: 'a' }, { anchor: 'b' }, { anchor: 'c' }];
    expect(anchorsInTrace(frames)).toEqual(['b', 'a', 'c']);
  });
});

describe('stripMarkers', () => {
  it('removes a trailing marker comment and its padding', () => {
    expect(stripMarkers('  for (let i = 0; i < n; i++) {        // @anchor outer-loop')).toBe(
      '  for (let i = 0; i < n; i++) {',
    );
  });

  it('handles the python comment syntax', () => {
    expect(stripMarkers('    for j in range(n):                 # @anchor inner')).toBe(
      '    for j in range(n):',
    );
  });

  it('preserves line numbers exactly', () => {
    const src = ['a();  // @anchor one', '', 'b();', '// c  // @anchor two', 'd();'].join('\n');
    const out = stripMarkers(src);
    expect(out.split('\n')).toHaveLength(src.split('\n').length);
    expect(out).toBe(['a();', '', 'b();', '// c', 'd();'].join('\n'));
  });

  it('keeps the anchor resolvable against the stripped source', () => {
    // The whole design depends on this: the panel highlights line N of the
    // *stripped* source using a line number derived from the *original*.
    const src = ['x = 1', 'y = 2   // @anchor second', 'z = 3'].join('\n');
    const parsed = parseCode('javascript', src);
    const stripped = stripMarkers(src).split('\n');
    const line = parsed.anchors.second?.start ?? -1;
    expect(stripped[line - 1]).toBe('y = 2');
  });

  it('leaves ordinary trailing comments alone', () => {
    expect(stripMarkers('int t = a[j];  // remember the old value')).toBe(
      'int t = a[j];  // remember the old value',
    );
  });

  it('leaves a marker inside a string literal alone', () => {
    const src = 'System.out.println("@anchor not-a-marker");';
    expect(stripMarkers(src)).toBe(src);
  });
});

describe('parseCode — several anchors on one line', () => {
  it('resolves every marker, not just the first', () => {
    // Real case: edit distance's cost line is the "match" step and the
    // "mismatch" step at once, and the two deserve different explanations.
    const parsed = parseCode(
      'javascript',
      'const cost = a[i] === b[j] ? 0 : 1;  // @anchor match  @anchor mismatch',
    );
    expect(parsed.anchors['match']).toEqual({ start: 1, end: 1 });
    expect(parsed.anchors['mismatch']).toEqual({ start: 1, end: 1 });
  });

  it('handles the python comment syntax too', () => {
    const parsed = parseCode(
      'python',
      'cost = 0 if a == b else 1  # @anchor match  @anchor mismatch',
    );
    expect(parsed.anchors['mismatch']?.start).toBe(1);
  });

  it('strips both markers from the displayed source', () => {
    const out = stripMarkers(
      'const cost = a[i] === b[j] ? 0 : 1;  // @anchor match  @anchor mismatch',
    );
    expect(out).toBe('const cost = a[i] === b[j] ? 0 : 1;');
  });

  it('keeps the line count stable when several anchors collapse', () => {
    const src = ['a();  // @anchor one  @anchor two', 'b();'].join('\n');
    expect(stripMarkers(src).split('\n')).toHaveLength(2);
  });

  it('still takes the first line when an anchor is genuinely duplicated', () => {
    const parsed = parseCode('javascript', 'a();  // @anchor x\nb();  // @anchor x');
    expect(parsed.anchors['x']).toEqual({ start: 1, end: 1 });
  });
});
