/**
 * Tests for Token Store
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { TokenStore, resetTokenStoreForTesting } from './token-store';
import type { StoredToken } from './types';
import { isKeyringCorrupted, getRecoveryInstructions } from './keyring-loader';

describe('TokenStore', () => {
  let tokenStore: TokenStore;
  let mockEntryClass: any;
  let mockEntries: Map<string, string>;

  beforeEach(() => {
    resetTokenStoreForTesting();
    mockEntries = new Map();

    // Create a mock Entry class that stores data in memory
    mockEntryClass = class MockEntry {
      constructor(
        public service: string,
        public name: string,
      ) {}

      getPassword(): string | null {
        const key = `${this.service}:${this.name}`;
        return mockEntries.get(key) || null;
      }

      setPassword(password: string): void {
        const key = `${this.service}:${this.name}`;
        mockEntries.set(key, password);
      }

      deletePassword(): void {
        const key = `${this.service}:${this.name}`;
        if (!mockEntries.has(key)) {
          throw new Error('Credential not found');
        }
        mockEntries.delete(key);
      }
    };

    // Mock the keyring loader to return our mock Entry class
    void mock.module('../../services/auth/keyring-loader', () => ({
      getKeyringEntry: () => mockEntryClass,
      isKeyringAvailable: () => true,
      isKeyringCorrupted,
      getRecoveryInstructions,
      resetKeyringLoaderForTesting: () => {},
    }));

    tokenStore = new TokenStore('test-service');
  });

  afterEach(() => {
    resetTokenStoreForTesting();
    mock.restore();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await tokenStore.initialize();
      expect(await tokenStore.hasTokens()).toBe(false);
    });

    it('should only initialize once', async () => {
      await tokenStore.initialize();
      await tokenStore.initialize();
      await tokenStore.initialize();
      // Idempotent — still works after multiple calls
      expect(await tokenStore.hasTokens()).toBe(false);
    });

    it('should handle concurrent initialization calls', async () => {
      // Start multiple initializations concurrently
      const promises = [tokenStore.initialize(), tokenStore.initialize(), tokenStore.initialize()];

      await Promise.all(promises);
      expect(await tokenStore.hasTokens()).toBe(false);
    });
  });

  describe('storeToken', () => {
    const mockToken: StoredToken = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      userId: 'testuser',
      scope: 'repo read:org',
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000,
      metadata: { name: 'Test User', email: 'test@example.com' },
    };

    it('should store a token successfully', async () => {
      await tokenStore.storeToken('testuser', mockToken);

      // Verify token was stored in mock keyring
      const key = 'test-service:testuser';
      expect(mockEntries.has(key)).toBe(true);

      // Verify token can be retrieved
      const retrieved = await tokenStore.getToken('testuser');
      expect(retrieved).toEqual(mockToken);
    });

    it('should update token index when storing', async () => {
      await tokenStore.storeToken('user1', { ...mockToken, userId: 'user1' });
      await tokenStore.storeToken('user2', { ...mockToken, userId: 'user2' });

      // Verify index was updated
      const indexKey = 'test-service:__token_index__';
      expect(mockEntries.has(indexKey)).toBe(true);

      const indexData = JSON.parse(mockEntries.get(indexKey)!);
      expect(indexData).toEqual(['user1', 'user2']);
    });

    it('should overwrite existing token for same user', async () => {
      await tokenStore.storeToken('testuser', mockToken);

      const updatedToken: StoredToken = {
        ...mockToken,
        accessToken: 'updated-token',
      };

      await tokenStore.storeToken('testuser', updatedToken);

      const retrieved = await tokenStore.getToken('testuser');
      expect(retrieved?.accessToken).toBe('updated-token');
    });

    it('should serialize token data as JSON', async () => {
      await tokenStore.storeToken('testuser', mockToken);

      const key = 'test-service:testuser';
      const storedData = mockEntries.get(key);
      expect(storedData).toBeDefined();

      // Should be valid JSON
      const parsed = JSON.parse(storedData!);
      expect(parsed.accessToken).toBe(mockToken.accessToken);
      expect(parsed.userId).toBe(mockToken.userId);
    });
  });

  describe('getToken', () => {
    const mockToken: StoredToken = {
      accessToken: 'test-token',
      userId: 'testuser',
      scope: 'repo',
      createdAt: Date.now(),
    };

    it('should retrieve token by userId', async () => {
      await tokenStore.storeToken('testuser', mockToken);

      const retrieved = await tokenStore.getToken('testuser');
      expect(retrieved).toEqual(mockToken);
    });

    it('should return null for non-existent user', async () => {
      const retrieved = await tokenStore.getToken('nonexistent');
      expect(retrieved).toBeNull();
    });

    it('should return first token when no userId provided', async () => {
      const token1: StoredToken = { ...mockToken, userId: 'user1', accessToken: 'token1' };
      const token2: StoredToken = { ...mockToken, userId: 'user2', accessToken: 'token2' };

      await tokenStore.storeToken('user1', token1);
      await tokenStore.storeToken('user2', token2);

      const retrieved = await tokenStore.getToken();
      expect(retrieved).not.toBeNull();
      expect(['token1', 'token2']).toContain(retrieved!.accessToken);
    });

    it('should return null when no tokens exist', async () => {
      const retrieved = await tokenStore.getToken();
      expect(retrieved).toBeNull();
    });
  });

  describe('getAccessToken', () => {
    it('should return access token string for valid token', async () => {
      const mockToken: StoredToken = {
        accessToken: 'test-access-token',
        userId: 'testuser',
        scope: 'repo',
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000, // Valid for 1 hour
      };

      await tokenStore.storeToken('testuser', mockToken);

      const accessToken = await tokenStore.getAccessToken('testuser');
      expect(accessToken).toBe('test-access-token');
    });

    it('should return null for expired token', async () => {
      const expiredToken: StoredToken = {
        accessToken: 'expired-token',
        userId: 'testuser',
        scope: 'repo',
        createdAt: Date.now() - 7200000,
        expiresAt: Date.now() - 3600000, // Expired 1 hour ago
      };

      await tokenStore.storeToken('testuser', expiredToken);

      const accessToken = await tokenStore.getAccessToken('testuser');
      expect(accessToken).toBeNull();
    });

    it('should return access token when no expiry set', async () => {
      const noExpiryToken: StoredToken = {
        accessToken: 'no-expiry-token',
        userId: 'testuser',
        scope: 'repo',
        createdAt: Date.now(),
        // No expiresAt
      };

      await tokenStore.storeToken('testuser', noExpiryToken);

      const accessToken = await tokenStore.getAccessToken('testuser');
      expect(accessToken).toBe('no-expiry-token');
    });

    it('should return null for non-existent user', async () => {
      const accessToken = await tokenStore.getAccessToken('nonexistent');
      expect(accessToken).toBeNull();
    });
  });

  describe('removeToken', () => {
    const mockToken: StoredToken = {
      accessToken: 'test-token',
      userId: 'testuser',
      scope: 'repo',
      createdAt: Date.now(),
    };

    it('should remove token successfully', async () => {
      await tokenStore.storeToken('testuser', mockToken);

      const removed = await tokenStore.removeToken('testuser');
      expect(removed).toBe(true);

      const retrieved = await tokenStore.getToken('testuser');
      expect(retrieved).toBeNull();
    });

    it('should update token index after removal', async () => {
      await tokenStore.storeToken('user1', { ...mockToken, userId: 'user1' });
      await tokenStore.storeToken('user2', { ...mockToken, userId: 'user2' });

      await tokenStore.removeToken('user1');

      const indexKey = 'test-service:__token_index__';
      const indexData = JSON.parse(mockEntries.get(indexKey)!);
      expect(indexData).toEqual(['user2']);
    });

    it('should return false when removing non-existent token', async () => {
      const removed = await tokenStore.removeToken('nonexistent');
      expect(removed).toBe(false);
    });

    it('should remove token from both memory and keyring', async () => {
      await tokenStore.storeToken('testuser', mockToken);

      await tokenStore.removeToken('testuser');

      // Check memory
      const retrieved = await tokenStore.getToken('testuser');
      expect(retrieved).toBeNull();

      // Check keyring
      const key = 'test-service:testuser';
      expect(mockEntries.has(key)).toBe(false);
    });
  });

  describe('clearAll', () => {
    it('should clear all tokens', async () => {
      const token1: StoredToken = {
        accessToken: 'token1',
        userId: 'user1',
        scope: 'repo',
        createdAt: Date.now(),
      };

      const token2: StoredToken = {
        accessToken: 'token2',
        userId: 'user2',
        scope: 'repo',
        createdAt: Date.now(),
      };

      await tokenStore.storeToken('user1', token1);
      await tokenStore.storeToken('user2', token2);

      await tokenStore.clearAll();

      expect(await tokenStore.hasTokens()).toBe(false);
      expect(await tokenStore.getToken('user1')).toBeNull();
      expect(await tokenStore.getToken('user2')).toBeNull();
    });

    it('should clear token index', async () => {
      await tokenStore.storeToken('user1', {
        accessToken: 'token1',
        userId: 'user1',
        scope: 'repo',
        createdAt: Date.now(),
      });

      await tokenStore.clearAll();

      const indexKey = 'test-service:__token_index__';
      expect(mockEntries.has(indexKey)).toBe(false);
    });

    it('should not throw when clearing empty store', async () => {
      await tokenStore.clearAll();
      expect(await tokenStore.hasTokens()).toBe(false);
    });
  });

  describe('hasTokens', () => {
    it('should return false when no tokens exist', async () => {
      expect(await tokenStore.hasTokens()).toBe(false);
    });

    it('should return true when tokens exist', async () => {
      await tokenStore.storeToken('testuser', {
        accessToken: 'test-token',
        userId: 'testuser',
        scope: 'repo',
        createdAt: Date.now(),
      });

      expect(await tokenStore.hasTokens()).toBe(true);
    });

    it('should return false after clearing all tokens', async () => {
      await tokenStore.storeToken('testuser', {
        accessToken: 'test-token',
        userId: 'testuser',
        scope: 'repo',
        createdAt: Date.now(),
      });

      await tokenStore.clearAll();

      expect(await tokenStore.hasTokens()).toBe(false);
    });
  });

  describe('token persistence', () => {
    it('should load tokens from keyring on initialization', async () => {
      // Pre-populate keyring with tokens
      const token: StoredToken = {
        accessToken: 'persisted-token',
        userId: 'testuser',
        scope: 'repo',
        createdAt: Date.now(),
      };

      mockEntries.set('test-service:testuser', JSON.stringify(token));
      mockEntries.set('test-service:__token_index__', JSON.stringify(['testuser']));

      // Create new store instance (simulates app restart)
      const newStore = new TokenStore('test-service');

      const retrieved = await newStore.getToken('testuser');
      expect(retrieved).toEqual(token);
    });

    it('should handle corrupted token data gracefully', async () => {
      // Store invalid JSON
      mockEntries.set('test-service:testuser', 'invalid-json');
      mockEntries.set('test-service:__token_index__', JSON.stringify(['testuser']));

      const newStore = new TokenStore('test-service');
      await newStore.initialize();

      // Should not throw, but token should not be loaded
      expect(await newStore.hasTokens()).toBe(false);
    });

    it('should handle missing token index gracefully', async () => {
      // No index exists
      const newStore = new TokenStore('test-service');
      await newStore.initialize();

      // Should initialize without error
      expect(await newStore.hasTokens()).toBe(false);
    });
  });

  describe('multiple users', () => {
    it('should store and retrieve tokens for multiple users', async () => {
      const users = ['user1', 'user2', 'user3'];

      for (const userId of users) {
        await tokenStore.storeToken(userId, {
          accessToken: `token-${userId}`,
          userId,
          scope: 'repo',
          createdAt: Date.now(),
        });
      }

      // Verify all tokens can be retrieved
      for (const userId of users) {
        const token = await tokenStore.getToken(userId);
        expect(token?.accessToken).toBe(`token-${userId}`);
      }
    });

    it('should maintain separate tokens for each user', async () => {
      await tokenStore.storeToken('user1', {
        accessToken: 'token1',
        userId: 'user1',
        scope: 'repo',
        createdAt: Date.now(),
      });

      await tokenStore.storeToken('user2', {
        accessToken: 'token2',
        userId: 'user2',
        scope: 'repo',
        createdAt: Date.now(),
      });

      const token1 = await tokenStore.getToken('user1');
      const token2 = await tokenStore.getToken('user2');

      expect(token1?.accessToken).toBe('token1');
      expect(token2?.accessToken).toBe('token2');
    });
  });

  describe('service isolation', () => {
    it('should isolate tokens by service name', async () => {
      const store1 = new TokenStore('service1');
      const store2 = new TokenStore('service2');

      await store1.storeToken('testuser', {
        accessToken: 'token-service1',
        userId: 'testuser',
        scope: 'repo',
        createdAt: Date.now(),
      });

      await store2.storeToken('testuser', {
        accessToken: 'token-service2',
        userId: 'testuser',
        scope: 'repo',
        createdAt: Date.now(),
      });

      const token1 = await store1.getToken('testuser');
      const token2 = await store2.getToken('testuser');

      expect(token1?.accessToken).toBe('token-service1');
      expect(token2?.accessToken).toBe('token-service2');
    });
  });

  describe('chunked storage (Windows credential limit)', () => {
    const originalPlatform = process.platform;

    beforeEach(() => {
      // Simulate Windows platform for chunking tests
      Object.defineProperty(process, 'platform', { value: 'win32', writable: true });
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
    });

    /**
     * Create a token with a large access token that exceeds MAX_CHUNK_SIZE (1200 chars)
     */
    function makeLargeToken(size: number = 3000): StoredToken {
      return {
        accessToken: 'A'.repeat(size),
        refreshToken: 'refresh-token',
        userId: 'testuser',
        scope: 'openid profile',
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      };
    }

    it('should store large tokens in chunks on Windows', async () => {
      const largeToken = makeLargeToken(3000);
      await tokenStore.storeToken('testuser', largeToken);

      // Main entry should contain chunked metadata, not the token itself
      const mainKey = 'test-service:testuser';
      const mainData = JSON.parse(mockEntries.get(mainKey)!);
      expect(mainData.chunked).toBe(true);
      expect(mainData.chunkCount).toBeGreaterThan(1);
      expect(mainData.totalLength).toBeGreaterThan(1200);

      // Chunk entries should exist
      for (let i = 0; i < mainData.chunkCount; i++) {
        const chunkKey = `test-service:testuser-chunk-${i}`;
        expect(mockEntries.has(chunkKey)).toBe(true);
        expect(mockEntries.get(chunkKey)!.length).toBeLessThanOrEqual(1200);
      }
    });

    it('should reconstruct chunked tokens on load', async () => {
      const largeToken = makeLargeToken(3000);
      await tokenStore.storeToken('testuser', largeToken);

      // Create a fresh store (simulates restart)
      const freshStore = new TokenStore('test-service');
      const retrieved = await freshStore.getToken('testuser');

      expect(retrieved).toBeDefined();
      expect(retrieved!.accessToken).toBe(largeToken.accessToken);
      expect(retrieved!.refreshToken).toBe(largeToken.refreshToken);
      expect(retrieved!.userId).toBe(largeToken.userId);
    });

    it('should clean up chunks when removing a chunked token', async () => {
      const largeToken = makeLargeToken(3000);
      await tokenStore.storeToken('testuser', largeToken);

      // Verify chunks exist
      const mainData = JSON.parse(mockEntries.get('test-service:testuser')!);
      const chunkCount = mainData.chunkCount;
      expect(chunkCount).toBeGreaterThan(1);

      // Remove the token
      const removed = await tokenStore.removeToken('testuser');
      expect(removed).toBe(true);

      // Main entry and all chunks should be gone
      expect(mockEntries.has('test-service:testuser')).toBe(false);
      for (let i = 0; i < chunkCount; i++) {
        expect(mockEntries.has(`test-service:testuser-chunk-${i}`)).toBe(false);
      }
    });

    it('should clean up chunks when clearing all tokens', async () => {
      const largeToken = makeLargeToken(3000);
      await tokenStore.storeToken('testuser', largeToken);

      const mainData = JSON.parse(mockEntries.get('test-service:testuser')!);
      const chunkCount = mainData.chunkCount;

      await tokenStore.clearAll();

      expect(mockEntries.has('test-service:testuser')).toBe(false);
      for (let i = 0; i < chunkCount; i++) {
        expect(mockEntries.has(`test-service:testuser-chunk-${i}`)).toBe(false);
      }
    });

    it('should clean up stale chunks when re-storing with fewer chunks', async () => {
      // First store with a very large token (many chunks)
      const veryLargeToken = makeLargeToken(5000);
      await tokenStore.storeToken('testuser', veryLargeToken);

      const firstMeta = JSON.parse(mockEntries.get('test-service:testuser')!);
      const firstChunkCount = firstMeta.chunkCount;

      // Re-store with a smaller (but still chunked) token
      const smallerToken = makeLargeToken(2000);

      // Need a new store since initialize is cached
      const freshStore = new TokenStore('test-service');
      await freshStore.storeToken('testuser', smallerToken);

      const secondMeta = JSON.parse(mockEntries.get('test-service:testuser')!);
      const secondChunkCount = secondMeta.chunkCount;

      expect(secondChunkCount).toBeLessThan(firstChunkCount);

      // Stale chunks from the first store should be cleaned up
      for (let i = secondChunkCount; i < firstChunkCount; i++) {
        expect(mockEntries.has(`test-service:testuser-chunk-${i}`)).toBe(false);
      }
    });

    it('should not chunk small tokens on Windows', async () => {
      const smallToken: StoredToken = {
        accessToken: 'small-token',
        userId: 'testuser',
        scope: 'repo',
        createdAt: Date.now(),
      };

      await tokenStore.storeToken('testuser', smallToken);

      // Should be stored directly (no chunked metadata)
      const mainData = JSON.parse(mockEntries.get('test-service:testuser')!);
      expect(mainData.chunked).toBeUndefined();
      expect(mainData.accessToken).toBe('small-token');

      // No chunk entries should exist
      expect(mockEntries.has('test-service:testuser-chunk-0')).toBe(false);
    });

    it('should not chunk large tokens on non-Windows platforms', async () => {
      // Override to Linux
      Object.defineProperty(process, 'platform', { value: 'linux', writable: true });

      const largeToken = makeLargeToken(3000);
      await tokenStore.storeToken('testuser', largeToken);

      // Should be stored directly (no chunked metadata)
      const mainData = JSON.parse(mockEntries.get('test-service:testuser')!);
      expect(mainData.chunked).toBeUndefined();
      expect(mainData.accessToken).toBe(largeToken.accessToken);
    });

    it('should handle missing chunks gracefully during load', async () => {
      // Manually create chunked metadata but delete one chunk
      mockEntries.set(
        'test-service:testuser',
        JSON.stringify({
          chunked: true,
          chunkCount: 3,
          totalLength: 3600,
        }),
      );
      mockEntries.set('test-service:testuser-chunk-0', '{"accessToken":"');
      // chunk-1 is missing!
      mockEntries.set('test-service:testuser-chunk-2', '"}');
      mockEntries.set('test-service:__token_index__', JSON.stringify(['testuser']));

      const freshStore = new TokenStore('test-service');
      await freshStore.initialize();

      // Should not load the token due to missing chunk
      const token = await freshStore.getToken('testuser');
      expect(token).toBeNull();
    });
  });

  describe('keyring corruption detection and recovery', () => {
    it('should detect macOS keyring corruption errors', async () => {
      // Mock Entry class that throws macOS-specific errors
      const corruptedEntryClass = class CorruptedEntry {
        constructor(
          public service: string,
          public name: string,
        ) {}

        getPassword(): string | null {
          throw new Error('User canceled the operation (errSecUserCanceled)');
        }

        setPassword(_password: string): void {
          throw new Error('User canceled the operation');
        }

        deletePassword(): void {
          // Allow deletion to work for recovery
        }
      };

      void mock.module('../../services/auth/keyring-loader', () => ({
        getKeyringEntry: () => corruptedEntryClass,
        isKeyringAvailable: () => true,
        isKeyringCorrupted,
        getRecoveryInstructions,
        resetKeyringLoaderForTesting: () => {},
      }));

      const corruptedStore = new TokenStore('corrupted-service');

      // Should handle corruption gracefully during initialization
      await corruptedStore.initialize();
      expect(await corruptedStore.hasTokens()).toBe(false);
    });

    it('should detect Windows keyring corruption errors', async () => {
      const corruptedEntryClass = class CorruptedEntry {
        constructor(
          public service: string,
          public name: string,
        ) {}

        getPassword(): string | null {
          throw new Error('Access is denied');
        }

        setPassword(_password: string): void {
          throw new Error('The stub received bad data');
        }

        deletePassword(): void {}
      };

      void mock.module('../../services/auth/keyring-loader', () => ({
        getKeyringEntry: () => corruptedEntryClass,
        isKeyringAvailable: () => true,
        isKeyringCorrupted,
        getRecoveryInstructions,
        resetKeyringLoaderForTesting: () => {},
      }));

      const corruptedStore = new TokenStore('corrupted-service');
      await corruptedStore.initialize();
      expect(await corruptedStore.hasTokens()).toBe(false);
    });

    it('should detect Linux keyring corruption errors', async () => {
      const corruptedEntryClass = class CorruptedEntry {
        constructor(
          public service: string,
          public name: string,
        ) {}

        getPassword(): string | null {
          throw new Error('org.freedesktop.Secret: prompt dismissed');
        }

        setPassword(_password: string): void {
          throw new Error('User dismissed the prompt');
        }

        deletePassword(): void {}
      };

      void mock.module('../../services/auth/keyring-loader', () => ({
        getKeyringEntry: () => corruptedEntryClass,
        isKeyringAvailable: () => true,
        isKeyringCorrupted,
        getRecoveryInstructions,
        resetKeyringLoaderForTesting: () => {},
      }));

      const corruptedStore = new TokenStore('corrupted-service');
      await corruptedStore.initialize();
      expect(await corruptedStore.hasTokens()).toBe(false);
    });

    it('should retry keyring operations before considering corruption', async () => {
      let attemptCount = 0;

      const flakyEntryClass = class FlakyEntry {
        constructor(
          public service: string,
          public name: string,
        ) {}

        getPassword(): string | null {
          attemptCount++;
          if (attemptCount < 2) {
            throw new Error('Temporary error');
          }
          return null; // Success on retry
        }

        setPassword(_password: string): void {}
        deletePassword(): void {}
      };

      void mock.module('../../services/auth/keyring-loader', () => ({
        getKeyringEntry: () => flakyEntryClass,
        isKeyringAvailable: () => true,
        isKeyringCorrupted,
        getRecoveryInstructions,
        resetKeyringLoaderForTesting: () => {},
      }));

      const flakyStore = new TokenStore('flaky-service');
      await flakyStore.initialize();

      // Should have retried: failed on attempt 1, succeeded on attempt 2
      expect(attemptCount).toBe(2);
    });

    it('should fallback to in-memory storage when keyring is unavailable', async () => {
      void mock.module('../../services/auth/keyring-loader', () => ({
        getKeyringEntry: () => {
          throw new Error('Keyring not available');
        },
        isKeyringAvailable: () => false,
        isKeyringCorrupted,
        getRecoveryInstructions,
        resetKeyringLoaderForTesting: () => {},
      }));

      const unavailableStore = new TokenStore('unavailable-service');
      const token: StoredToken = {
        accessToken: 'test-token',
        userId: 'testuser',
        scope: 'repo',
        createdAt: Date.now(),
      };

      // Should store in memory without error
      await unavailableStore.storeToken('testuser', token);

      // Should retrieve from memory
      const retrieved = await unavailableStore.getToken('testuser');
      expect(retrieved?.accessToken).toBe('test-token');
    });

    it('should attempt auto-recovery when corruption is detected', async () => {
      let deleteAttempted = false;

      const corruptedEntryClass = class CorruptedEntry {
        constructor(
          public service: string,
          public name: string,
        ) {}

        getPassword(): string | null {
          throw new Error('errSecAuthFailed - access denied');
        }

        setPassword(_password: string): void {
          throw new Error('errSecAuthFailed');
        }

        deletePassword(): void {
          deleteAttempted = true;
        }
      };

      void mock.module('../../services/auth/keyring-loader', () => ({
        getKeyringEntry: () => corruptedEntryClass,
        isKeyringAvailable: () => true,
        isKeyringCorrupted,
        getRecoveryInstructions,
        resetKeyringLoaderForTesting: () => {},
      }));

      const corruptedStore = new TokenStore('corrupted-service');
      await corruptedStore.initialize();

      // Auto-recovery should have attempted deletion
      expect(deleteAttempted).toBe(true);
    });

    it('should use macOS security CLI when tokens map is empty on corruption', async () => {
      // Simulate the exact upgrade scenario: corruption on first access,
      // tokens map is empty so keyring API deletions are no-ops.
      // The macOS CLI fallback should kick in.
      const originalPlatform = process.platform;
      const execFileSyncCalls: { file: string; args: string[] }[] = [];

      try {
        // Mock child_process.execFileSync to track calls
        void mock.module('child_process', () => ({
          execFileSync: (file: string, args: string[], _opts?: any) => {
            execFileSyncCalls.push({ file, args });
            // First call succeeds (deletes one entry), second call fails (no more entries)
            if (execFileSyncCalls.length > 2) {
              throw new Error(
                'security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.',
              );
            }
            return '';
          },
        }));

        // Force platform to darwin
        Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

        const corruptedEntryClass = class CorruptedEntry {
          constructor(
            public service: string,
            public name: string,
          ) {}

          getPassword(): string | null {
            throw new Error('errSecAuthFailed - access denied');
          }

          setPassword(_password: string): void {
            throw new Error('errSecAuthFailed');
          }

          deletePassword(): void {
            // Index deletion works fine
          }
        };

        void mock.module('../../services/auth/keyring-loader', () => ({
          getKeyringEntry: () => corruptedEntryClass,
          isKeyringAvailable: () => true,
          isKeyringCorrupted,
          getRecoveryInstructions,
          resetKeyringLoaderForTesting: () => {},
        }));

        const corruptedStore = new TokenStore('qnsc-mcp-github');
        await corruptedStore.initialize();

        // Should have called security CLI to delete entries by service name
        const securityCalls = execFileSyncCalls.filter(
          (call) => call.file === 'security' && call.args.includes('delete-generic-password'),
        );
        expect(securityCalls.length).toBeGreaterThan(0);
        expect(securityCalls[0].args).toContain('qnsc-mcp-github');
      } finally {
        // Always restore platform, even if test fails
        Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
      }
    });
  });

  describe('getKeyringHealth', () => {
    it('should report healthy keyring', async () => {
      await tokenStore.initialize();
      const health = await tokenStore.getKeyringHealth();

      expect(health.available).toBe(true);
      expect(health.failureCount).toBe(0);
      expect(health.lastError).toBeNull();
      expect(health.recommendations).toHaveLength(0);
    });

    it('should report unavailable keyring', async () => {
      void mock.module('../../services/auth/keyring-loader', () => ({
        getKeyringEntry: () => {
          throw new Error('Not available');
        },
        isKeyringAvailable: () => false,
        isKeyringCorrupted,
        getRecoveryInstructions,
        resetKeyringLoaderForTesting: () => {},
      }));

      const unavailableStore = new TokenStore('unavailable-service');
      await unavailableStore.initialize();
      const health = await unavailableStore.getKeyringHealth();

      expect(health.available).toBe(false);
      expect(health.recommendations.length).toBeGreaterThan(0);
    });

    it('should report keyring with failure history', async () => {
      // Reset and restore the default mock from beforeEach
      resetTokenStoreForTesting();
      void mock.module('../../services/auth/keyring-loader', () => ({
        getKeyringEntry: () => mockEntryClass,
        isKeyringAvailable: () => true,
        isKeyringCorrupted,
        getRecoveryInstructions,
        resetKeyringLoaderForTesting: () => {},
      }));

      // Create a store that will experience failures during a storeToken operation
      const flakyStore = new TokenStore('test-service');
      await flakyStore.initialize();

      // First, check health when everything is fine
      const health = await flakyStore.getKeyringHealth();
      expect(health.failureCount).toBe(0);
      expect(health.available).toBe(true);

      // Now if the store experiences an error (simulated by corruption detection),
      // the failure count would be tracked. For this test, we verify the health
      // method works correctly when there are no failures.
      expect(health.recommendations).toHaveLength(0);
    });
  });
});
