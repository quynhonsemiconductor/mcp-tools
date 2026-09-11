import { describe, expect, it } from 'bun:test';

import { isUnresolvedPlaceholder, sanitizeEnv } from './env-sanitize';

describe('isUnresolvedPlaceholder', () => {
  it('detects unresolved ${...} placeholders', () => {
    expect(isUnresolvedPlaceholder('${user_config.FOO}')).toBe(true);
  });

  it('returns false for real values, empty strings, and undefined', () => {
    expect(isUnresolvedPlaceholder('https://example.com')).toBe(false);
    expect(isUnresolvedPlaceholder('')).toBe(false);
    expect(isUnresolvedPlaceholder(undefined)).toBe(false);
  });
});

describe('sanitizeEnv', () => {
  it('clears unresolved ${...} placeholders to undefined', () => {
    expect(sanitizeEnv({ FOO: '${user_config.FOO}' }).FOO).toBeUndefined();
  });

  it('clears empty strings to undefined', () => {
    // Regression (v4.12.0 startup crash): Claude Desktop can pass a blank optional
    // user_config field through as an empty string (see sanitizeEnv's docstring for
    // when that happens). Left as '', a `.url()` var fails validation
    // ("Invalid URL") and process.exit(1) kills the entire server, taking down
    // every tool.
    //
    // This holds even for a var that declares a `.default()`: Zod defaults
    // substitute only on `undefined`, never on ''. Normalizing '' to undefined is
    // what lets `.optional()` / `.default()` treat the value as absent.
    expect(sanitizeEnv({ GH_API_URL: '' }).GH_API_URL).toBeUndefined();
  });

  it('clears whitespace-only strings to undefined', () => {
    expect(sanitizeEnv({ FOO: '   ' }).FOO).toBeUndefined();
  });

  it('preserves real values', () => {
    expect(sanitizeEnv({ GH_API_URL: 'https://api.github.com' }).GH_API_URL).toBe(
      'https://api.github.com',
    );
  });

  it('leaves undefined values untouched', () => {
    expect(sanitizeEnv({ FOO: undefined }).FOO).toBeUndefined();
  });
});
