/**
 * Tests for Teams message text conversion.
 *
 * Two of these exist because CodeQL flagged the first implementation, and both
 * findings were correct: entities were decoded in an order that double-unescaped,
 * and a single tag-stripping pass could reintroduce a tag it had just removed.
 */

import { describe, expect, it } from 'bun:test';
import '../../test-utils/mocks';
import { htmlToTextForTesting as htmlToText } from './list-chats-tool';

describe('htmlToText', () => {
  it('turns a simple HTML message into text', () => {
    expect(htmlToText('<p>Shipping on Friday</p>')).toBe('Shipping on Friday');
  });

  it('treats line breaks and paragraph ends as newlines', () => {
    expect(htmlToText('one<br>two</p>three')).toBe('one\ntwo\nthree');
  });

  it('does not double-unescape an escaped entity', () => {
    // Decoding &amp; before &lt; would turn this into a literal "<", which is the
    // double-escaping bug CodeQL reported. The text is meant to read as "&lt;".
    expect(htmlToText('&amp;lt;')).toBe('&lt;');
    expect(htmlToText('a &amp;amp; b')).toBe('a &amp; b');
  });

  it('does not leave a tag behind when tags are nested', () => {
    // One pass of /<[^>]+>/ removes the inner tag and leaves "<script>" — the
    // incomplete-sanitization finding. Stripping repeats until stable.
    expect(htmlToText('<<div>script>alert(1)<</div>/script>')).not.toContain('<script>');
    expect(htmlToText('<<div>b>bold<</div>/b>')).not.toContain('<b>');
  });

  it('decodes the entities Teams actually emits', () => {
    expect(htmlToText('a&nbsp;b')).toBe('a b');
    expect(htmlToText('&quot;quoted&quot;')).toBe('"quoted"');
    expect(htmlToText('it&#39;s')).toBe("it's");
    expect(htmlToText('x &lt; y &gt; z')).toBe('x < y > z');
  });

  it('collapses the blank lines that paragraph markup leaves behind', () => {
    expect(htmlToText('<p>one</p><p></p><p></p><p>two</p>')).toBe('one\n\ntwo');
  });

  it('returns an empty string for markup with no text', () => {
    expect(htmlToText('<div></div>')).toBe('');
    expect(htmlToText('')).toBe('');
  });

  it('terminates on deeply nested markup rather than looping', () => {
    // The loop is bounded, so a pathological input costs a fixed number of passes.
    const nested = `${'<'.repeat(60)}div${'>'.repeat(60)}text`;
    expect(htmlToText(nested)).toContain('text');
  });
});
