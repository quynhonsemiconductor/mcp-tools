/**
 * Tests for document text extraction.
 *
 * The strategy table is the part worth pinning: it decides whether a document is
 * readable at all, and getting it wrong is what made the read tool refuse most real
 * files. Extraction itself is verified against a real PDF by hand, since generating
 * one in a test would only prove the library works.
 */

import { describe, expect, it } from 'bun:test';
import '../../test-utils/mocks';
import { readStrategyFor } from './document-text';

describe('readStrategyFor', () => {
  it('returns text directly for text-like formats', () => {
    for (const mime of [
      'text/plain',
      'text/markdown',
      'application/json',
      'application/xml',
      'application/x-yaml',
    ]) {
      expect(readStrategyFor(mime)).toBe('text');
    }
  });

  it('extracts a PDF rather than converting it', () => {
    expect(readStrategyFor('application/pdf')).toBe('pdf');
  });

  it('converts Office documents first, because Graph has no text conversion', () => {
    for (const mime of [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
    ]) {
      expect(readStrategyFor(mime)).toBe('convert-to-pdf');
    }
  });

  it('refuses formats with no text to extract', () => {
    // Returning bytes for these would hand a model something it cannot read, so the
    // tool names the type and points at the web URL instead.
    for (const mime of ['image/png', 'video/mp4', 'application/zip', 'application/octet-stream']) {
      expect(readStrategyFor(mime)).toBeNull();
    }
  });

  it('treats an unknown type as unreadable rather than guessing', () => {
    expect(readStrategyFor('unknown')).toBeNull();
    expect(readStrategyFor('')).toBeNull();
  });
});
