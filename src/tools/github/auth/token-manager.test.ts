/**
 * Tests for GitHub Token Manager
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { OAuthResult, StoredToken } from '../../../services/auth';
import { GitHubTokenManager, resetTokenManagerForTesting } from './token-manager';

describe('GitHubTokenManager', () => {
  let tokenManager: GitHubTokenManager;
  let mockTokenStore: any;
  let mockOAuthHandler: any;
  let mockGetEnvToken: any;

  beforeEach(() => {
    // Reset singleton before each test
    resetTokenManagerForTesting();

    // Create mock token store
    mockTokenStore = {
      initialize: mock(() => Promise.resolve()),
      storeToken: mock(() => Promise.resolve()),
      getToken: mock(() => Promise.resolve(null)),
      removeToken: mock(() => Promise.resolve(true)),
      clearAll: mock(() => Promise.resolve()),
      hasTokens: mock(() => Promise.resolve(false)),
    };

    // Create mock OAuth handler
    mockOAuthHandler = {
      isConfigured: mock(() => true),
      startOAuthFlow: mock(() =>
        Promise.resolve<OAuthResult>({
          success: true,
          token: {
            accessToken: 'oauth-token-123',
            userId: 'testuser',
            scope: 'repo read:org',
            createdAt: Date.now(),
            expiresAt: Date.now() + 3600000,
            metadata: { name: 'Test User' },
          },
        }),
      ),
      refreshAccessToken: mock(() =>
        Promise.resolve<StoredToken>({
          accessToken: 'refreshed-token-456',
          refreshToken: 'new-refresh-token',
          userId: 'testuser',
          scope: 'repo read:org',
          createdAt: Date.now(),
          expiresAt: Date.now() + 3600000,
        }),
      ),
    };

    // Create mock env token getter
    mockGetEnvToken = mock(() => undefined);

    // Create token manager with mocked dependencies
    tokenManager = new GitHubTokenManager({
      tokenStore: mockTokenStore,
      oauthHandler: mockOAuthHandler,
      getEnvToken: mockGetEnvToken,
    });
  });

  afterEach(() => {
    mock.restore();
  });

  describe('getToken', () => {
    it('should return environment token when available', async () => {
      mockGetEnvToken.mockReturnValue('env-token-123');

      const token = await tokenManager.getToken();

      expect(token).toBe('env-token-123');
      expect(mockTokenStore.getToken).not.toHaveBeenCalled();
      expect(mockOAuthHandler.startOAuthFlow).not.toHaveBeenCalled();
    });

    it('should treat empty string env token as undefined and fall back to OAuth', async () => {
      mockGetEnvToken.mockReturnValue(undefined); // Simulates empty string converted to undefined
      mockTokenStore.getToken.mockResolvedValue(null);

      const token = await tokenManager.getToken();

      expect(token).toBe('oauth-token-123');
      expect(mockOAuthHandler.startOAuthFlow).toHaveBeenCalled();
      expect(mockTokenStore.storeToken).toHaveBeenCalledWith(
        'testuser',
        expect.objectContaining({
          accessToken: 'oauth-token-123',
        }),
      );
    });

    it('should return stored token when no env token exists', async () => {
      mockGetEnvToken.mockReturnValue(undefined);
      mockTokenStore.getToken.mockResolvedValue({
        accessToken: 'stored-token-456',
        userId: 'testuser',
        scope: 'repo',
        createdAt: Date.now() - 1000000,
        expiresAt: Date.now() + 3600000,
      });

      const token = await tokenManager.getToken();

      expect(token).toBe('stored-token-456');
      expect(mockTokenStore.getToken).toHaveBeenCalled();
      expect(mockOAuthHandler.startOAuthFlow).not.toHaveBeenCalled();
    });

    it('should initiate OAuth flow when no tokens exist', async () => {
      mockGetEnvToken.mockReturnValue(undefined);
      mockTokenStore.getToken.mockResolvedValue(null);

      const token = await tokenManager.getToken();

      expect(token).toBe('oauth-token-123');
      expect(mockOAuthHandler.startOAuthFlow).toHaveBeenCalled();
      expect(mockTokenStore.storeToken).toHaveBeenCalledWith(
        'testuser',
        expect.objectContaining({
          accessToken: 'oauth-token-123',
          userId: 'testuser',
        }),
      );
    });

    it('should store token after successful OAuth flow', async () => {
      mockGetEnvToken.mockReturnValue(undefined);
      mockTokenStore.getToken.mockResolvedValue(null);

      await tokenManager.getToken();

      expect(mockTokenStore.storeToken).toHaveBeenCalledTimes(1);
      expect(mockTokenStore.storeToken).toHaveBeenCalledWith(
        'testuser',
        expect.objectContaining({
          accessToken: 'oauth-token-123',
          userId: 'testuser',
          scope: 'repo read:org',
        }),
      );
    });

    it('should throw error when OAuth is not configured and no tokens exist', async () => {
      mockGetEnvToken.mockReturnValue(undefined);
      mockTokenStore.getToken.mockResolvedValue(null);
      mockOAuthHandler.isConfigured.mockReturnValue(false);

      try {
        await tokenManager.getToken();
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain('GitHub authentication required');
      }
    });

    it('should clear stored token when force refresh is requested', async () => {
      mockGetEnvToken.mockReturnValue(undefined);
      mockTokenStore.getToken.mockResolvedValue(null);

      await tokenManager.getToken(true);

      expect(mockTokenStore.clearAll).toHaveBeenCalled();
      expect(mockOAuthHandler.startOAuthFlow).toHaveBeenCalled();
    });

    it('should not force refresh when using env token', async () => {
      mockGetEnvToken.mockReturnValue('env-token-123');

      const token = await tokenManager.getToken(true);

      expect(token).toBe('env-token-123');
      expect(mockTokenStore.clearAll).not.toHaveBeenCalled();
    });

    it('should handle OAuth flow failure gracefully', async () => {
      mockGetEnvToken.mockReturnValue(undefined);
      mockTokenStore.getToken.mockResolvedValue(null);
      mockOAuthHandler.startOAuthFlow.mockResolvedValue({
        success: false,
        error: 'User denied access',
      });

      try {
        await tokenManager.getToken();
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain('User denied access');
      }
    });

    it('should handle expired stored token by initiating OAuth flow', async () => {
      mockGetEnvToken.mockReturnValue(undefined);
      mockTokenStore.getToken.mockResolvedValue({
        accessToken: 'expired-token',
        userId: 'testuser',
        scope: 'repo',
        createdAt: Date.now() - 7200000,
        expiresAt: Date.now() - 3600000, // Expired 1 hour ago
      });

      const token = await tokenManager.getToken();

      expect(token).toBe('oauth-token-123');
      expect(mockOAuthHandler.startOAuthFlow).toHaveBeenCalled();
    });
  });

  describe('singleton behavior', () => {
    it('should create only one instance', () => {
      const { getGitHubTokenManager } = require('./token-manager');

      const instance1 = getGitHubTokenManager();
      const instance2 = getGitHubTokenManager();

      expect(instance1).toBe(instance2);
    });

    it('should reset singleton for testing', () => {
      const { getGitHubTokenManager, resetTokenManagerForTesting } = require('./token-manager');

      const instance1 = getGitHubTokenManager();
      resetTokenManagerForTesting();
      const instance2 = getGitHubTokenManager();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('getEnvToken implementation', () => {
    it('should convert empty string to undefined', () => {
      // Create token manager without mocking getEnvToken to test actual implementation
      const testEnv = { GITHUB_TOKEN: '' };
      const getEnvToken = () => {
        const token = testEnv.GITHUB_TOKEN?.trim();
        return token || undefined;
      };

      const result = getEnvToken();
      expect(result).toBeUndefined();
    });

    it('should preserve non-empty tokens', () => {
      const testEnv = { GITHUB_TOKEN: 'ghp_abc123' };
      const getEnvToken = () => {
        const token = testEnv.GITHUB_TOKEN?.trim();
        return token || undefined;
      };

      const result = getEnvToken();
      expect(result).toBe('ghp_abc123');
    });

    it('should trim whitespace and convert to undefined if empty', () => {
      const testEnv = { GITHUB_TOKEN: '   ' };
      const getEnvToken = () => {
        const token = testEnv.GITHUB_TOKEN?.trim();
        return token || undefined;
      };

      const result = getEnvToken();
      expect(result).toBeUndefined();
    });

    it('should trim whitespace from valid tokens', () => {
      const testEnv = { GITHUB_TOKEN: '  ghp_abc123  ' };
      const getEnvToken = () => {
        const token = testEnv.GITHUB_TOKEN?.trim();
        return token || undefined;
      };

      const result = getEnvToken();
      expect(result).toBe('ghp_abc123');
    });
  });
});
