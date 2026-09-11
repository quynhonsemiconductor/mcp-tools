/**
 * Tests for Generic Token Manager
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { shouldRefreshToken, TokenManager } from './token-manager';
import { OAuthError, type StoredToken } from './types';

describe('TokenManager', () => {
  let tokenManager: TokenManager;
  let mockTokenStore: any;
  let mockOAuthHandler: any;
  let mockGetEnvToken: any;

  const mockToken: StoredToken = {
    accessToken: 'stored-access-token',
    refreshToken: 'stored-refresh-token',
    userId: 'testuser',
    scope: 'read write',
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600000, // 1 hour from now
  };

  beforeEach(() => {
    // Mock token store
    mockTokenStore = {
      initialize: mock(() => Promise.resolve()),
      getToken: mock(() => Promise.resolve(null)),
      storeToken: mock(() => Promise.resolve()),
      clearAll: mock(() => Promise.resolve()),
      hasTokens: mock(() => Promise.resolve(false)),
    };

    // Mock OAuth handler
    mockOAuthHandler = {
      isConfigured: mock(() => true),
      startOAuthFlow: mock(() =>
        Promise.resolve({
          success: true,
          token: mockToken,
        }),
      ),
      refreshAccessToken: mock(() => Promise.resolve(mockToken)),
    };

    // Mock environment token getter
    mockGetEnvToken = mock(() => undefined);

    // Create token manager with mocks
    tokenManager = new TokenManager({
      tokenStore: mockTokenStore,
      oauthHandler: mockOAuthHandler,
      getEnvToken: mockGetEnvToken,
      providerName: 'TestProvider',
    });
  });

  afterEach(() => {
    mock.restore();
  });

  describe('shouldRefreshToken', () => {
    it('should return false if token has no expiry', () => {
      const token: StoredToken = {
        accessToken: 'token',
        userId: 'user',
        scope: 'scope',
        createdAt: Date.now(),
      };
      expect(shouldRefreshToken(token)).toBe(false);
    });

    it('should return false if token has no refresh token', () => {
      const token: StoredToken = {
        accessToken: 'token',
        userId: 'user',
        scope: 'scope',
        createdAt: Date.now(),
        expiresAt: Date.now() + 600000, // 10 minutes
      };
      expect(shouldRefreshToken(token)).toBe(false);
    });

    it('should return false if token is not in refresh window', () => {
      const token: StoredToken = {
        accessToken: 'token',
        refreshToken: 'refresh',
        userId: 'user',
        scope: 'scope',
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000, // 1 hour - outside refresh window
      };
      expect(shouldRefreshToken(token)).toBe(false);
    });

    it('should return true if token is in refresh window', () => {
      const token: StoredToken = {
        accessToken: 'token',
        refreshToken: 'refresh',
        userId: 'user',
        scope: 'scope',
        createdAt: Date.now(),
        expiresAt: Date.now() + 600000, // 10 minutes - within 15 min threshold
      };
      expect(shouldRefreshToken(token)).toBe(true);
    });

    it('should return false if token is already expired', () => {
      const token: StoredToken = {
        accessToken: 'token',
        refreshToken: 'refresh',
        userId: 'user',
        scope: 'scope',
        createdAt: Date.now() - 7200000,
        expiresAt: Date.now() - 3600000, // Expired 1 hour ago
      };
      expect(shouldRefreshToken(token)).toBe(false);
    });
  });

  describe('getToken', () => {
    it('should return environment token when available', async () => {
      mockGetEnvToken.mockImplementation(() => 'env-token');

      const token = await tokenManager.getToken();

      expect(token).toBe('env-token');
      expect(mockTokenStore.getToken).not.toHaveBeenCalled();
    });

    it('should return stored token when no env token', async () => {
      mockTokenStore.getToken.mockResolvedValue(mockToken);

      const token = await tokenManager.getToken();

      expect(token).toBe('stored-access-token');
      expect(mockTokenStore.getToken).toHaveBeenCalled();
    });

    it('should initiate OAuth flow when no tokens exist', async () => {
      const token = await tokenManager.getToken();

      expect(mockOAuthHandler.startOAuthFlow).toHaveBeenCalled();
      expect(mockTokenStore.storeToken).toHaveBeenCalledWith('testuser', mockToken);
      expect(token).toBe('stored-access-token');
    });

    it('should throw error when OAuth not configured and no tokens', async () => {
      mockOAuthHandler.isConfigured.mockReturnValue(false);

      try {
        await tokenManager.getToken();
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain('authentication required');
      }
    });

    it('should clear stored token on force refresh', async () => {
      await tokenManager.getToken(true);

      expect(mockTokenStore.clearAll).toHaveBeenCalled();
      expect(mockOAuthHandler.startOAuthFlow).toHaveBeenCalled();
    });

    it('should clear stored token on force refresh via options object', async () => {
      await tokenManager.getToken({ forceRefresh: true });

      expect(mockTokenStore.clearAll).toHaveBeenCalled();
      expect(mockOAuthHandler.startOAuthFlow).toHaveBeenCalled();
    });

    it('should skip interactive OAuth flow when interactive is false', async () => {
      try {
        await tokenManager.getToken({ interactive: false });
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain('interactive OAuth is disabled');
        expect(mockOAuthHandler.startOAuthFlow).not.toHaveBeenCalled();
      }
    });

    it('should return stored token when interactive is false and token exists', async () => {
      mockTokenStore.getToken.mockResolvedValue(mockToken);

      const token = await tokenManager.getToken({ interactive: false });

      expect(token).toBe('stored-access-token');
      expect(mockOAuthHandler.startOAuthFlow).not.toHaveBeenCalled();
    });

    it('should handle expired token with refresh token', async () => {
      const expiredToken: StoredToken = {
        ...mockToken,
        expiresAt: Date.now() - 3600000, // Expired 1 hour ago
        refreshToken: 'refresh-token',
      };

      const refreshedToken: StoredToken = {
        ...mockToken,
        accessToken: 'new-access-token',
        expiresAt: Date.now() + 3600000,
      };

      mockTokenStore.getToken.mockResolvedValue(expiredToken);
      mockOAuthHandler.refreshAccessToken.mockResolvedValue(refreshedToken);

      const token = await tokenManager.getToken();

      expect(mockOAuthHandler.refreshAccessToken).toHaveBeenCalledWith('refresh-token');
      expect(mockTokenStore.storeToken).toHaveBeenCalled();
      expect(token).toBe('new-access-token');
    });

    it('should initiate OAuth flow when expired token has no refresh token', async () => {
      const expiredToken: StoredToken = {
        ...mockToken,
        expiresAt: Date.now() - 3600000, // Expired
        refreshToken: undefined,
      };

      mockTokenStore.getToken.mockResolvedValue(expiredToken);

      const token = await tokenManager.getToken();

      expect(mockOAuthHandler.startOAuthFlow).toHaveBeenCalled();
      expect(token).toBe('stored-access-token');
    });

    it('should proactively refresh token in refresh window', async () => {
      const tokenInWindow: StoredToken = {
        ...mockToken,
        expiresAt: Date.now() + 600000, // 10 minutes - within refresh threshold
      };

      const refreshedToken: StoredToken = {
        ...mockToken,
        accessToken: 'refreshed-token',
        expiresAt: Date.now() + 3600000,
      };

      mockTokenStore.getToken.mockResolvedValue(tokenInWindow);
      mockOAuthHandler.refreshAccessToken.mockResolvedValue(refreshedToken);

      const token = await tokenManager.getToken();

      expect(mockOAuthHandler.refreshAccessToken).toHaveBeenCalled();
      expect(token).toBe('refreshed-token');
    });

    it('should return current token if proactive refresh fails', async () => {
      const tokenInWindow: StoredToken = {
        ...mockToken,
        expiresAt: Date.now() + 600000,
      };

      mockTokenStore.getToken.mockResolvedValue(tokenInWindow);
      mockOAuthHandler.refreshAccessToken.mockRejectedValue(new Error('Refresh failed'));

      const token = await tokenManager.getToken();

      // Should fall back to current token since it's still valid
      expect(token).toBe('stored-access-token');
    });

    it('should clear token on unrecoverable refresh error', async () => {
      const tokenInWindow: StoredToken = {
        ...mockToken,
        expiresAt: Date.now() + 600000,
      };

      const unrecoverableError = new OAuthError('Token revoked', 'token_revoked');

      mockTokenStore.getToken.mockResolvedValue(tokenInWindow);
      mockOAuthHandler.refreshAccessToken.mockRejectedValue(unrecoverableError);

      const token = await tokenManager.getToken();

      expect(mockTokenStore.clearAll).toHaveBeenCalled();
      expect(token).toBe('stored-access-token'); // Falls back to current token
    });

    it('should handle concurrent refresh requests', async () => {
      const tokenInWindow: StoredToken = {
        ...mockToken,
        expiresAt: Date.now() + 600000,
      };

      mockTokenStore.getToken.mockResolvedValue(tokenInWindow);
      mockOAuthHandler.refreshAccessToken.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ ...mockToken, accessToken: 'new-token' }), 100);
          }),
      );

      // Start multiple refresh operations concurrently
      const [token1, token2, token3] = await Promise.all([
        tokenManager.getToken(),
        tokenManager.getToken(),
        tokenManager.getToken(),
      ]);

      // All should get the same refreshed token
      expect(token1).toBe('new-token');
      expect(token2).toBe('new-token');
      expect(token3).toBe('new-token');

      // Refresh should only be called once
      expect(mockOAuthHandler.refreshAccessToken).toHaveBeenCalledTimes(1);
    });
  });

  describe('OAuth flow error handling', () => {
    it('should throw error when OAuth flow fails', async () => {
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

    it('should throw generic error when OAuth flow fails without error message', async () => {
      mockOAuthHandler.startOAuthFlow.mockResolvedValue({
        success: false,
      });

      try {
        await tokenManager.getToken();
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain('OAuth flow failed');
      }
    });
  });
});
