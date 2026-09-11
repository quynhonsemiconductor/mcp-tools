/**
 * Integration test for re-authentication flow (T039).
 *
 * Tests the full end-to-end re-authentication lifecycle:
 * - Stored tokens cleared on re-auth
 * - Fresh SSO login triggered after clearing
 * - New tokens stored after re-auth completes
 * - Re-auth works when no tokens exist
 *
 * Covers US5-AS1 (clear + fresh login), US5-AS2 (no tokens → direct login),
 * US5-AS3 (new tokens used after re-auth).
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { OAuthResult, StoredToken } from '..';
import { EntraIdTokenManager, resetEntraIdTokenManagerForTesting } from './token-manager';
import type { EntraIdConfig } from './types';

const testConfig: EntraIdConfig = {
  clientId: 'test-client-id-uuid',
  tenantId: 'test-tenant-id-uuid',
  platformUrl: 'https://platform.example.com',
  callbackPort: 9876,
  loginTimeoutMs: 120_000,
  scopes: ['openid', 'profile', 'email', 'offline_access'],
};

const testAuthorizeUrl = 'https://login.microsoftonline.com/test-tenant/oauth2/v2.0/authorize';
const testTokenUrl = 'https://login.microsoftonline.com/test-tenant/oauth2/v2.0/token';

describe('Re-Authentication Flow (Integration)', () => {
  let tokenManager: EntraIdTokenManager;
  let mockTokenStore: any;
  let mockOAuthHandler: any;
  let mockGetEnvToken: any;

  /** Track call order across mocks for sequencing assertions. */
  let callOrder: string[];

  beforeEach(() => {
    resetEntraIdTokenManagerForTesting();
    callOrder = [];

    mockTokenStore = {
      initialize: mock(() => Promise.resolve()),
      storeToken: mock((..._args: any[]) => {
        callOrder.push('storeToken');
        return Promise.resolve();
      }),
      getToken: mock(() => Promise.resolve(null)),
      removeToken: mock(() => Promise.resolve(true)),
      clearAll: mock(() => {
        callOrder.push('clearAll');
        return Promise.resolve();
      }),
      hasTokens: mock(() => Promise.resolve(false)),
    };

    mockOAuthHandler = {
      isConfigured: mock(() => true),
      startOAuthFlow: mock(() => {
        callOrder.push('startOAuthFlow');
        return Promise.resolve<OAuthResult>({
          success: true,
          token: {
            accessToken: 'fresh-reauth-token-abc',
            refreshToken: 'fresh-refresh-token-def',
            userId: 'user-object-id-123',
            scope: 'openid profile email',
            createdAt: Date.now(),
            expiresAt: Date.now() + 3600000,
            metadata: {
              name: 'Re-Auth User',
              email: 'reauth@example.com',
              preferred_username: 'reauth@qnsc.vn',
              tenant_id: 'test-tenant-id-uuid',
            },
          },
        });
      }),
      refreshAccessToken: mock((_refreshToken: string) =>
        Promise.resolve<StoredToken>({
          accessToken: 'refreshed-reauth-token',
          refreshToken: 'rotated-refresh-token',
          userId: 'user-object-id-123',
          scope: 'openid profile email',
          createdAt: Date.now(),
          expiresAt: Date.now() + 3600000,
        }),
      ),
    };

    mockGetEnvToken = mock(() => undefined);

    tokenManager = new EntraIdTokenManager({
      entraConfig: testConfig,
      authorizeUrl: testAuthorizeUrl,
      tokenUrl: testTokenUrl,
      tokenStore: mockTokenStore,
      oauthHandler: mockOAuthHandler,
      getEnvToken: mockGetEnvToken,
    });
  });

  afterEach(() => {
    mock.restore();
  });

  describe('US5-AS1: Clear stored tokens and trigger fresh SSO login', () => {
    it('should clear keyring entries before triggering new SSO login', async () => {
      // Arrange: user has valid stored tokens
      const existingToken: StoredToken = {
        accessToken: 'old-valid-token',
        refreshToken: 'old-refresh-token',
        userId: 'user-object-id-123',
        scope: 'openid profile email',
        createdAt: Date.now() - 1000000,
        expiresAt: Date.now() + 3600000,
        metadata: {
          name: 'Original User',
          email: 'original@example.com',
        },
      };
      mockTokenStore.getToken.mockResolvedValue(existingToken);

      // Act: force re-authentication
      const token = await tokenManager.getToken({ forceRefresh: true });

      // Assert: tokens cleared first, then OAuth flow
      expect(mockTokenStore.clearAll).toHaveBeenCalledTimes(1);
      expect(mockOAuthHandler.startOAuthFlow).toHaveBeenCalledTimes(1);
      expect(callOrder.indexOf('clearAll')).toBeLessThan(callOrder.indexOf('startOAuthFlow'));
      expect(token).toBe('fresh-reauth-token-abc');
    });

    it('should store new tokens after successful re-authentication', async () => {
      // Arrange: user has stored tokens
      mockTokenStore.getToken.mockResolvedValue({
        accessToken: 'old-token',
        userId: 'user-object-id-123',
        scope: 'openid profile email',
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      // Act
      await tokenManager.getToken({ forceRefresh: true });

      // Assert: new tokens from OAuth flow stored
      expect(mockTokenStore.storeToken).toHaveBeenCalledTimes(1);
      expect(mockTokenStore.storeToken).toHaveBeenCalledWith(
        'user-object-id-123',
        expect.objectContaining({
          accessToken: 'fresh-reauth-token-abc',
          refreshToken: 'fresh-refresh-token-def',
          userId: 'user-object-id-123',
          metadata: expect.objectContaining({
            name: 'Re-Auth User',
            email: 'reauth@example.com',
          }),
        }),
      );
    });

    it('should execute clearAll → startOAuthFlow → storeToken in correct order', async () => {
      mockTokenStore.getToken.mockResolvedValue({
        accessToken: 'old-token',
        userId: 'user-object-id-123',
        scope: 'openid profile',
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      await tokenManager.getToken({ forceRefresh: true });

      expect(callOrder).toEqual(['clearAll', 'startOAuthFlow', 'storeToken']);
    });
  });

  describe('US5-AS2: Re-auth when no tokens exist', () => {
    it('should go straight to SSO login when no tokens stored', async () => {
      // Arrange: no stored tokens
      mockTokenStore.getToken.mockResolvedValue(null);
      mockTokenStore.hasTokens.mockResolvedValue(false);

      // Act
      const token = await tokenManager.getToken({ forceRefresh: true });

      // Assert: clearAll still called (no-op), then OAuth flow
      expect(mockTokenStore.clearAll).toHaveBeenCalledTimes(1);
      expect(mockOAuthHandler.startOAuthFlow).toHaveBeenCalledTimes(1);
      expect(token).toBe('fresh-reauth-token-abc');
    });

    it('should store tokens after SSO login even when no prior tokens existed', async () => {
      mockTokenStore.getToken.mockResolvedValue(null);

      await tokenManager.getToken({ forceRefresh: true });

      expect(mockTokenStore.storeToken).toHaveBeenCalledWith(
        'user-object-id-123',
        expect.objectContaining({
          accessToken: 'fresh-reauth-token-abc',
          userId: 'user-object-id-123',
        }),
      );
    });
  });

  describe('US5-AS3: New tokens used after re-auth', () => {
    it('should return new token that can be used for subsequent calls', async () => {
      mockTokenStore.getToken.mockResolvedValue(null);

      const newToken = await tokenManager.getToken({ forceRefresh: true });

      // The fresh token is returned and ready for use
      expect(newToken).toBe('fresh-reauth-token-abc');
      expect(typeof newToken).toBe('string');
      expect(newToken.length).toBeGreaterThan(0);
    });

    it('should use stored token on next getToken call (no force refresh)', async () => {
      // First call: force re-auth
      mockTokenStore.getToken.mockResolvedValue(null);
      await tokenManager.getToken({ forceRefresh: true });

      // Simulate the stored token being available after re-auth
      mockTokenStore.getToken.mockResolvedValue({
        accessToken: 'fresh-reauth-token-abc',
        refreshToken: 'fresh-refresh-token-def',
        userId: 'user-object-id-123',
        scope: 'openid profile email',
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      // Reset mock call counts
      mockOAuthHandler.startOAuthFlow.mockClear();

      // Second call: normal getToken (should use stored token, no SSO)
      const token = await tokenManager.getToken();

      expect(token).toBe('fresh-reauth-token-abc');
      expect(mockOAuthHandler.startOAuthFlow).not.toHaveBeenCalled();
    });
  });

  describe('Re-auth error handling', () => {
    it('should propagate SSO login failure during re-auth', async () => {
      mockTokenStore.getToken.mockResolvedValue(null);
      mockOAuthHandler.startOAuthFlow.mockResolvedValue({
        success: false,
        error: 'Browser login cancelled by user',
      });

      try {
        await tokenManager.getToken({ forceRefresh: true });
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain('Browser login cancelled');
        // clearAll should still have been called before the failure
        expect(mockTokenStore.clearAll).toHaveBeenCalled();
      }
    });

    it('should propagate network error during re-auth', async () => {
      mockTokenStore.getToken.mockResolvedValue(null);
      mockOAuthHandler.startOAuthFlow.mockRejectedValue(
        new Error('Network error: unable to reach Entra ID'),
      );

      try {
        await tokenManager.getToken({ forceRefresh: true });
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain('Network error');
      }
    });
  });
});
