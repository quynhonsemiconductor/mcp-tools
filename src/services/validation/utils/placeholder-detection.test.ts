import { describe, expect, it } from 'bun:test';
import { isPlaceholderValue, PLACEHOLDER_PATTERNS } from './placeholder-detection';

describe('placeholder-detection', () => {
  describe('isPlaceholderValue', () => {
    describe('detects placeholder values', () => {
      it('should detect empty values', () => {
        expect(isPlaceholderValue('')).toBe(true);
        expect(isPlaceholderValue('   ')).toBe(true);
      });

      it('should detect "your-" prefixed values', () => {
        expect(isPlaceholderValue('your-api-key')).toBe(true);
        expect(isPlaceholderValue('your_token')).toBe(true);
        expect(isPlaceholderValue('YOUR-SECRET')).toBe(true);
        expect(isPlaceholderValue('Your_Password')).toBe(true);
      });

      it('should detect angle bracket placeholders', () => {
        expect(isPlaceholderValue('<API_KEY>')).toBe(true);
        expect(isPlaceholderValue('<your-token-here>')).toBe(true);
        expect(isPlaceholderValue('<INSERT_VALUE>')).toBe(true);
      });

      it('should detect square bracket placeholders', () => {
        expect(isPlaceholderValue('[your-key-here]')).toBe(true);
        expect(isPlaceholderValue('[API_KEY]')).toBe(true);
        expect(isPlaceholderValue('[PLACEHOLDER]')).toBe(true);
      });

      it('should detect curly brace placeholders', () => {
        expect(isPlaceholderValue('{placeholder}')).toBe(true);
        expect(isPlaceholderValue('{API_KEY}')).toBe(true);
        expect(isPlaceholderValue('{your-value}')).toBe(true);
      });

      it('should detect "xxx" pattern values', () => {
        expect(isPlaceholderValue('xxxxx')).toBe(true);
        expect(isPlaceholderValue('API_KEY_XXX')).toBe(true);
        expect(isPlaceholderValue('token_xxx_here')).toBe(true);
      });

      it('should detect "placeholder" keyword', () => {
        expect(isPlaceholderValue('placeholder')).toBe(true);
        expect(isPlaceholderValue('PLACEHOLDER_VALUE')).toBe(true);
        expect(isPlaceholderValue('my-placeholder-key')).toBe(true);
      });

      it('should detect "example" keyword (exact match only)', () => {
        expect(isPlaceholderValue('example')).toBe(true);
        expect(isPlaceholderValue('EXAMPLE')).toBe(true);
        expect(isPlaceholderValue('Example')).toBe(true);
      });

      it('should detect "changeme" keyword', () => {
        expect(isPlaceholderValue('changeme')).toBe(true);
        expect(isPlaceholderValue('CHANGEME')).toBe(true);
        expect(isPlaceholderValue('password_changeme')).toBe(true);
      });

      it('should detect "insert-" prefixed values', () => {
        expect(isPlaceholderValue('insert-your-key')).toBe(true);
        expect(isPlaceholderValue('insert_api_key_here')).toBe(true);
        expect(isPlaceholderValue('INSERT-TOKEN')).toBe(true);
      });

      it('should detect "todo" value', () => {
        expect(isPlaceholderValue('todo')).toBe(true);
        expect(isPlaceholderValue('TODO')).toBe(true);
        expect(isPlaceholderValue('Todo')).toBe(true);
      });
    });

    describe('accepts valid values', () => {
      it('should accept actual API key values', () => {
        expect(isPlaceholderValue('sk-ant-1234567890abcdef')).toBe(false);
        expect(isPlaceholderValue('ghp_abcdefghijklmnopqrstuvwxyz123456')).toBe(false);
      });

      it('should accept UUID-like values', () => {
        expect(isPlaceholderValue('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
      });

      it('should accept normal configuration values', () => {
        expect(isPlaceholderValue('production')).toBe(false);
        expect(isPlaceholderValue('true')).toBe(false);
        expect(isPlaceholderValue('3600')).toBe(false);
        expect(isPlaceholderValue('/path/to/file')).toBe(false);
      });

      it('should accept environment variable references', () => {
        expect(isPlaceholderValue('${API_KEY}')).toBe(false); // This has braces but is an env ref
        expect(isPlaceholderValue('$MY_SECRET')).toBe(false);
      });

      it('should accept base64 encoded values', () => {
        expect(isPlaceholderValue('YWJjZGVmZ2hpamtsbW5vcA==')).toBe(false);
      });

      it('should accept hex encoded values', () => {
        expect(isPlaceholderValue('a1b2c3d4e5f6a1b2c3d4e5f6')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should handle null/undefined gracefully via empty check', () => {
        // TypeScript would prevent null/undefined, but test the empty path
        expect(isPlaceholderValue('')).toBe(true);
      });

      it('should not match "your" in the middle of a value', () => {
        // "your" only matches at start with your- or your_
        expect(isPlaceholderValue('newyork')).toBe(false);
        expect(isPlaceholderValue('saveyourself')).toBe(false);
      });

      it('should not match partial bracket patterns', () => {
        expect(isPlaceholderValue('<partial')).toBe(false);
        expect(isPlaceholderValue('partial>')).toBe(false);
        expect(isPlaceholderValue('[partial')).toBe(false);
        expect(isPlaceholderValue('{partial')).toBe(false);
      });

      it('should not flag URLs containing "example"', () => {
        expect(isPlaceholderValue('https://api.example.com')).toBe(false);
        expect(isPlaceholderValue('http://example.org/api')).toBe(false);
        expect(isPlaceholderValue('https://example.com/path/to/resource')).toBe(false);
      });

      it('should not flag file paths containing placeholder-like patterns', () => {
        expect(isPlaceholderValue('/path/to/example/file')).toBe(false);
        expect(isPlaceholderValue('/home/user/placeholder/config')).toBe(false);
        expect(isPlaceholderValue('C:\\Users\\example\\file.txt')).toBe(false);
        expect(isPlaceholderValue('./example/config.json')).toBe(false);
        expect(isPlaceholderValue('../placeholder/data')).toBe(false);
      });

      it('should not flag "example" when part of a larger non-placeholder string', () => {
        // "example" pattern is now exact match only
        expect(isPlaceholderValue('example-token')).toBe(false);
        expect(isPlaceholderValue('EXAMPLE_API_KEY')).toBe(false);
        expect(isPlaceholderValue('my-example-value')).toBe(false);
      });
    });
  });

  describe('PLACEHOLDER_PATTERNS', () => {
    it('should export the patterns array', () => {
      expect(Array.isArray(PLACEHOLDER_PATTERNS)).toBe(true);
      expect(PLACEHOLDER_PATTERNS.length).toBeGreaterThan(0);
    });

    it('should contain RegExp patterns', () => {
      for (const pattern of PLACEHOLDER_PATTERNS) {
        expect(pattern).toBeInstanceOf(RegExp);
      }
    });
  });
});
