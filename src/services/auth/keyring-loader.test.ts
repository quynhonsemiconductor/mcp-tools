/**
 * Tests for Keyring Loader
 *
 * Note: These tests verify the keyring loader's basic functionality.
 * Since @napi-rs/keyring is a native module, we test caching, availability,
 * and reset behavior rather than attempting to mock native bindings.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  getKeyringEntry,
  isKeyringAvailable,
  isKeyringCorrupted,
  resetKeyringLoaderForTesting,
} from './keyring-loader';

describe('KeyringLoader', () => {
  beforeEach(() => {
    resetKeyringLoaderForTesting();
  });

  afterEach(() => {
    resetKeyringLoaderForTesting();
  });

  describe('getKeyringEntry', () => {
    it('should return an Entry constructor', () => {
      try {
        const Entry = getKeyringEntry();
        expect(Entry).toBeDefined();
        expect(typeof Entry).toBe('function');
      } catch (error: any) {
        // If keyring is not available on this system, that's okay
        // The error message should be descriptive
        expect(error.message).toContain('Failed to load keyring native binding');
      }
    });

    it('should cache the Entry class across multiple calls', () => {
      try {
        const Entry1 = getKeyringEntry();
        const Entry2 = getKeyringEntry();

        // Should return the exact same reference (cached)
        expect(Entry1).toBe(Entry2);
      } catch (error: any) {
        // If keyring fails to load, verify it fails consistently
        let secondError: Error | null = null;
        try {
          getKeyringEntry();
        } catch (e: any) {
          secondError = e;
        }
        // Should throw the same cached error
        expect(secondError).toBe(error);
      }
    });

    it('should be able to create Entry instances when available', () => {
      try {
        const Entry = getKeyringEntry();
        const entry = new Entry('test-service', 'test-user');

        expect(entry).toBeDefined();
        expect(typeof entry.getPassword).toBe('function');
        expect(typeof entry.setPassword).toBe('function');
        expect(typeof entry.deletePassword).toBe('function');
      } catch (error: any) {
        // Keyring not available on this system - skip test
        expect(error.message).toContain('Failed to load keyring native binding');
      }
    });
  });

  describe('isKeyringAvailable', () => {
    it('should return a boolean', () => {
      const available = isKeyringAvailable();
      expect(typeof available).toBe('boolean');
    });

    it('should return the same result on multiple calls', () => {
      const result1 = isKeyringAvailable();
      const result2 = isKeyringAvailable();

      expect(result1).toBe(result2);
    });

    it('should match getKeyringEntry success/failure', () => {
      const available = isKeyringAvailable();

      if (available) {
        // If available, getKeyringEntry should succeed
        expect(() => getKeyringEntry()).not.toThrow();
      } else {
        // If not available, getKeyringEntry should throw
        try {
          getKeyringEntry();
          expect(true).toBe(false); // Should not reach here
        } catch (error: any) {
          expect(error.message).toContain('Failed to load keyring native binding');
        }
      }
    });
  });

  describe('resetKeyringLoaderForTesting', () => {
    it('should allow re-evaluation of keyring loading', () => {
      // First call
      const firstResult = isKeyringAvailable();

      // Reset
      resetKeyringLoaderForTesting();

      // Second call after reset
      const secondResult = isKeyringAvailable();

      // Should get consistent results
      expect(firstResult).toBe(secondResult);
    });

    it('should clear cached Entry class', () => {
      if (!isKeyringAvailable()) {
        // Skip if keyring not available
        return;
      }

      // Load Entry class
      const Entry1 = getKeyringEntry();
      expect(Entry1).toBeDefined();

      // Reset should clear the cache
      resetKeyringLoaderForTesting();

      // Load again - should work but we can't verify it's a new instance
      // without being able to track load calls
      const Entry2 = getKeyringEntry();
      expect(Entry2).toBeDefined();
      expect(typeof Entry2).toBe('function');
    });

    it('should clear cached errors', () => {
      // Trigger initial load (success or failure)
      isKeyringAvailable();

      // Reset
      resetKeyringLoaderForTesting();

      // Should still work after reset
      const available = isKeyringAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('Entry class functionality', () => {
    it('should have required methods when available', () => {
      if (!isKeyringAvailable()) {
        // Skip if keyring not available
        return;
      }

      const Entry = getKeyringEntry();
      const entry = new Entry('test-service', 'test-name');

      // Verify interface
      expect(entry).toBeDefined();
      expect(typeof entry.getPassword).toBe('function');
      expect(typeof entry.setPassword).toBe('function');
      expect(typeof entry.deletePassword).toBe('function');
    });

    it('should accept service and name in constructor', () => {
      if (!isKeyringAvailable()) {
        return;
      }

      const Entry = getKeyringEntry();

      // Should not throw when creating with valid parameters
      expect(() => {
        const entry = new Entry('my-service', 'my-username');
        expect(entry).toBeDefined();
      }).not.toThrow();
    });
  });

  describe('isKeyringCorrupted', () => {
    // macOS indicators
    it('should detect macOS user canceled error', () => {
      expect(isKeyringCorrupted(new Error('User canceled the operation'))).toBe(true);
    });

    it('should detect macOS errSecAuthFailed error', () => {
      expect(isKeyringCorrupted(new Error('errSecAuthFailed - access denied'))).toBe(true);
    });

    it('should detect macOS errSecUserCanceled error', () => {
      expect(isKeyringCorrupted(new Error('errSecUserCanceled'))).toBe(true);
    });

    it('should detect macOS user interaction required error', () => {
      expect(isKeyringCorrupted(new Error('User interaction required'))).toBe(true);
    });

    it('should detect macOS password required error', () => {
      expect(isKeyringCorrupted(new Error('Password required to unlock keychain'))).toBe(true);
    });

    it('should detect macOS access denied error', () => {
      expect(isKeyringCorrupted(new Error('access denied by keychain'))).toBe(true);
    });

    // Windows indicators
    it('should detect Windows access is denied error', () => {
      expect(isKeyringCorrupted(new Error('Access is denied'))).toBe(true);
    });

    it('should detect Windows stub received bad data error', () => {
      expect(isKeyringCorrupted(new Error('The stub received bad data'))).toBe(true);
    });

    // Linux indicators
    it('should detect Linux secret service error', () => {
      expect(isKeyringCorrupted(new Error('org.freedesktop.Secret: prompt dismissed'))).toBe(true);
    });

    it('should detect Linux prompt dismissed error', () => {
      expect(isKeyringCorrupted(new Error('prompt dismissed by user'))).toBe(true);
    });

    it('should detect Linux user dismissed error', () => {
      expect(isKeyringCorrupted(new Error('User dismissed the prompt'))).toBe(true);
    });

    // Non-corruption errors (must NOT trigger recovery)
    it('should return false for credential not found errors', () => {
      expect(isKeyringCorrupted(new Error('Credential not found'))).toBe(false);
    });

    it('should return false for element not found errors', () => {
      expect(isKeyringCorrupted(new Error('Element not found'))).toBe(false);
    });

    it('should return false for no such secret errors', () => {
      expect(isKeyringCorrupted(new Error('No such secret'))).toBe(false);
    });

    it('should return false for generic errors', () => {
      expect(isKeyringCorrupted(new Error('Something went wrong'))).toBe(false);
    });

    it('should return false for network errors', () => {
      expect(isKeyringCorrupted(new Error('ECONNREFUSED'))).toBe(false);
    });

    // Edge cases
    it('should handle non-Error objects', () => {
      expect(isKeyringCorrupted('some string error')).toBe(false);
    });

    it('should handle null and undefined', () => {
      expect(isKeyringCorrupted(null)).toBe(false);
      expect(isKeyringCorrupted(undefined)).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isKeyringCorrupted(new Error('USER CANCELED'))).toBe(true);
      expect(isKeyringCorrupted(new Error('ERRSECAUTHFAILED'))).toBe(true);
    });

    // freedesktop Secret Service special-case handling
    it('should detect freedesktop secret service errors that are not "not found"', () => {
      expect(isKeyringCorrupted(new Error('org.freedesktop.Secret.Error.IsLocked'))).toBe(true);
    });

    it('should not treat freedesktop NoSuchObject as corruption', () => {
      expect(isKeyringCorrupted(new Error('org.freedesktop.Secret.Error.NoSuchObject'))).toBe(
        false,
      );
    });

    it('should not treat freedesktop "no such" variants as corruption', () => {
      expect(isKeyringCorrupted(new Error('org.freedesktop.Secret: no such item'))).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should provide descriptive error when keyring unavailable', () => {
      if (isKeyringAvailable()) {
        // Skip if keyring IS available
        return;
      }

      try {
        getKeyringEntry();
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.message).toContain('Failed to load keyring native binding');
        expect(error.message).toContain('OS credential storage will not be available');
        expect(error.message).toContain('NAPI_RS_NATIVE_LIBRARY_PATH');
      }
    });

    it('should cache and reuse error on subsequent calls', () => {
      if (isKeyringAvailable()) {
        // Skip if keyring IS available
        return;
      }

      let error1: Error | null = null;
      let error2: Error | null = null;

      try {
        getKeyringEntry();
      } catch (e: any) {
        error1 = e;
      }

      try {
        getKeyringEntry();
      } catch (e: any) {
        error2 = e;
      }

      expect(error1).toBe(error2); // Same error instance (cached)
    });
  });
});
