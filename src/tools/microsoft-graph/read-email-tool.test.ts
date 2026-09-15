/**
 * Tests for reading an Outlook message.
 *
 * The strategy check is what decides whether an attachment can be read at all, and it
 * carries a limitation that is easy to get wrong: Graph converts Office documents to
 * PDF through an endpoint that operates on a drive item, and an attachment is bytes on
 * a message with no drive item behind it. So a .docx in OneDrive is readable and the
 * same .docx attached to an email is not.
 */

import { describe, expect, it } from 'bun:test';
import '../../test-utils/mocks';
import { readStrategyFor } from './document-text';

describe('attachment readability', () => {
  it('reads PDFs, which are extracted locally', () => {
    expect(readStrategyFor('application/pdf')).toBe('pdf');
  });

  it('reads text formats directly', () => {
    expect(readStrategyFor('text/plain')).toBe('text');
    expect(readStrategyFor('text/csv')).toBe('text');
    expect(readStrategyFor('application/json')).toBe('text');
  });

  it('marks Office documents as needing conversion, which an attachment cannot use', () => {
    // Not 'text' or 'pdf', so the email tool refuses these with an explanation rather
    // than attempting a conversion that only works on a drive item.
    const office = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ];
    for (const mime of office) {
      expect(readStrategyFor(mime)).toBe('convert-to-pdf');
    }
  });

  it('returns null for formats no text can come from', () => {
    expect(readStrategyFor('image/png')).toBeNull();
    expect(readStrategyFor('application/zip')).toBeNull();
    expect(readStrategyFor('application/octet-stream')).toBeNull();
  });
});
