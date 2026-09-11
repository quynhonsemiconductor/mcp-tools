/**
 * Integration test for transparent token refresh flow (T036).
 *
 * Tests the full end-to-end token refresh lifecycle:
 * - Expired access token + valid refresh token → transparent refresh
 * - Refresh failure → fallback to browser SSO login
 * - Concurrent refresh guard under parallel load
 *
 * Covers US2-AS1 (transparent refresh), US2-AS2 (refresh failure recovery),
 * US2-AS3 (concurrent refresh serialization).
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { OAuthError, type OAuthResult, type StoredToken } from '..';
import { EntraIdTokenManager, resetEntraIdTokenManagerForTesting } from './token-manager';
import type { EntraIdConfig } from './types';

/**
 * Create a minimal valid JWT with the given claims for testing.
 */
function createTestJwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.test-signature`;
}

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

const jwtClaims = {
  oid: 'user-object-id-123',
  sub: 'user-subject-id-456',
  name: 'Test User',
  email: 'test@example.com',
  preferred_username: 'test@qnsc.vn',
  tid: 'test-tenant-id-uuid',
  exp: Math.floor(Date.now() / 1000) + 3600,
};

const refreshedJwt = createTestJwt({
  ...jwtClaims,
  exp: Math.floor(Date.now() / 1000) + 7200,
});

describe('Token Refresh Flow (Integration)', () => {
  let tokenManager: EntraIdTokenManager;
  let mockTokenStore: any;
  let mockOAuthHandler: any;
  let mockGetEnvToken: any;

  beforeEach(() => {
    resetEntraIdTokenManagerForTesting();

    mockTokenStore = {
      initialize: mock(() => Promise.resolve()),
      storeToken: mock(() => Promise.resolve()),
      getToken: mock(() => Promise.resolve(null)),
      removeToken: mock(() => Promise.resolve(true)),
      clearAll: mock(() => Promise.resolve()),
      hasTokens: mock(() => Promise.resolve(false)),
    };

    mockOAuthHandler = {
      isConfigured: mock(() => true),
      startOAuthFlow: mock(() =>
        Promise.resolve<OAuthResult>({
          success: true,
          token: {
            accessToken: 'fresh-sso-token',
            refreshToken: 'fresh-refresh-token',
            userId: 'user-object-id-123',
            scope: 'openid profile email',
            createdAt: Date.now(),
            expiresAt: Date.now() + 3600000,
            metadata: {
              name: 'Test User',
              email: 'test@example.com',
            },
          },
        }),
      ),
      refreshAccessToken: mock((_refreshToken: string) =>
        Promise.resolve<StoredToken>({
          accessToken: refreshedJwt,
          refreshToken: 'rotated-refresh-token',
          userId: 'user-object-id-123',
          scope: 'openid profile email',
          createdAt: Date.now(),
          expiresAt: Date.now() + 3600000,
          metadata: {
            name: 'Test User',
            email: 'test@example.com',
          },
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

  describe('US2-AS1: Transparent refresh with expired access token + valid refresh token', () => {
    it('should refresh transparently without browser interaction', async () => {
      // Arrange: expired access token with valid refresh token in store
      const expiredToken: StoredToken = {
        accessToken: 'expired-access-token',
        refreshToken: 'valid-refresh-token',
        userId: 'user-object-id-123',
        scope: 'openid profile email',
        createdAt: Date.now() - 7200000,
        expiresAt: Date.now() - 60000, // Expired 1 minute ago
        metadata: {
          name: 'Test User',
          preferred_username: 'test@qnsc.vn',
        },
      };
      mockTokenStore.getToken.mockResolvedValue(expiredToken);

      // Act
      const token = await tokenManager.getToken();

      // Assert: refreshed token returned, no browser flow triggered
      expect(token).toBe(refreshedJwt);
      expect(mockOAuthHandler.refreshAccessToken).toHaveBeenCalledWith('valid-refresh-token');
      expect(mockOAuthHandler.startOAuthFlow).not.toHaveBeenCalled();
    });

    it('should store new tokens after successful refresh', async () => {
      const expiredToken: StoredToken = {
        accessToken: 'expired-access-token',
        refreshToken: 'valid-refresh-token',
        userId: 'user-object-id-123',
        scope: 'openid profile email',
        createdAt: Date.now() - 7200000,
        expiresAt: Date.now() - 60000,
        metadata: { preferred_username: 'test@qnsc.vn' },
      };
      mockTokenStore.getToken.mockResolvedValue(expiredToken);

      await tokenManager.getToken();

      // Verify new token was persisted
      expect(mockTokenStore.storeToken).toHaveBeenCalledTimes(1);
      expect(mockTokenStore.storeToken).toHaveBeenCalledWith(
        'user-object-id-123',
        expect.objectContaining({
          accessToken: refreshedJwt,
          refreshToken: 'rotated-refresh-token',
        }),
      );
    });

    it('should preserve original metadata through refresh', async () => {
      const expiredToken: StoredToken = {
        accessToken: 'expired-access-token',
        refreshToken: 'valid-refresh-token',
        userId: 'user-object-id-123',
        scope: 'openid profile email',
        createdAt: Date.now() - 7200000,
        expiresAt: Date.now() - 60000,
        metadata: {
          preferred_username: 'test@qnsc.vn',
          tenant_id: 'test-tenant-id-uuid',
        },
      };
      mockTokenStore.getToken.mockResolvedValue(expiredToken);

      await tokenManager.getToken();

      expect(mockTokenStore.storeToken).toHaveBeenCalledWith(
        'user-object-id-123',
        expect.objectContaining({
          metadata: expect.objectContaining({
            preferred_username: 'test@qnsc.vn',
            tenant_id: 'test-tenant-id-uuid',
          }),
        }),
      );
    });

    it('should proactively refresh token approaching expiry (within 15-min window)', async () => {
      const tokenNearExpiry: StoredToken = {
        accessToken: 'near-expiry-token',
        refreshToken: 'valid-refresh-token',
        userId: 'user-object-id-123',
        scope: 'openid profile email',
        createdAt: Date.now() - 3000000,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes from now
      };
      mockTokenStore.getToken.mockResolvedValue(tokenNearExpiry);

      const token = await tokenManager.getToken();

      expect(token).toBe(refreshedJwt);
      expect(mockOAuthHandler.refreshAccessToken).toHaveBeenCalled();
      expect(mockOAuthHandler.startOAuthFlow).not.toHaveBeenCalled();
    });
  });

  describe('US2-AS2: Refresh failure triggers full browser SSO login', () => {
    it('should fall back to browser SSO when refresh token is expired (invalid_grant)', async () => {
      const expiredToken: StoredToken = {
        accessToken: 'expired-access-token',
        refreshToken: 'expired-refresh-token',
        userId: 'user-object-id-123',
        scope: 'openid profile email',
        createdAt: Date.now() - 7200000,
        expiresAt: Date.now() - 60000,
      };
      mockTokenStore.getToken.mockResolvedValue(expiredToken);
      mockOAuthHandler.refreshAccessToken.mockRejectedValue(
        new OAuthError('Refresh token expired', 'invalid_grant'),
      );

      const token = await tokenManager.getToken();

      // Should clear invalid tokens, then trigger full SSO login
      expect(mockTokenStore.clearAll).toHaveBeenCalled();
      expect(mockOAuthHandler.startOAuthFlow).toHaveBeenCalled();
      expect(token).toBe('fresh-sso-token');
    });

    it('should fall back to browser SSO on network error during refresh', async () => {
      const expiredToken: StoredToken = {
        accessToken: 'expired-access-token',
        refreshToken: 'valid-refresh-token',
        userId: 'user-object-id-123',
        scope: 'openid profile email',
        createdAt: Date.now() - 7200000,
        expiresAt: Date.now() - 60000,
      };
      mockTokenStore.getToken.mockResolvedValue(expiredToken);
      mockOAuthHandler.refreshAccessToken.mockRejectedValue(
        new OAuthError('Network error', undefined, 'NETWORK_ERROR'),
      );

      const token = await tokenManager.getToken();

      // Network errors are recoverable — should still fall back to OAuth
      expect(mockOAuthHandler.startOAuthFlow).toHaveBeenCalled();
      expect(token).toBe('fresh-sso-token');
    });

    it('should fall back to browser SSO when refresh token is revoked', async () => {
      const expiredToken: StoredToken = {
        accessToken: 'expired-access-token',
        refreshToken: 'revoked-refresh-token',
        userId: 'user-object-id-123',
        scope: 'openid profile email',
        createdAt: Date.now() - 7200000,
        expiresAt: Date.now() - 60000,
      };
      mockTokenStore.getToken.mockResolvedValue(expiredToken);
      mockOAuthHandler.refreshAccessToken.mockRejectedValue(
        new OAuthError('Token was revoked by admin', 'token_revoked'),
      );

      const token = await tokenManager.getToken();

      expect(mockTokenStore.clearAll).toHaveBeenCalled();
      expect(mockOAuthHandler.startOAuthFlow).toHaveBeenCalled();
      expect(token).toBe('fresh-sso-token');
    });
  });

  describe('US2-AS3: Concurrent refresh serialization', () => {
    it('should serialize concurrent refresh requests (only one refresh call)', async () => {
      const tokenNearExpiry: StoredToken = {
        accessToken: 'near-expiry-token',
        refreshToken: 'valid-refresh-token',
        userId: 'user-object-id-123',
        scope: 'openid profile email',
        createdAt: Date.now() - 3000000,
        expiresAt: Date.now() + 5 * 60 * 1000,
      };
      mockTokenStore.getToken.mockResolvedValue(tokenNearExpiry);

      // Slow refresh to ensure concurrent calls overlap
      mockOAuthHandler.refreshAccessToken.mockImplementation(
        () =>
          new Promise<StoredToken>((resolve) => {
            setTimeout(
              () =>
                resolve({
                  accessToken: 'serialized-refreshed-token',
                  refreshToken: 'new-refresh-token',
                  userId: 'user-object-id-123',
                  scope: 'openid profile email',
                  createdAt: Date.now(),
                  expiresAt: Date.now() + 3600000,
                }),
              50,
            );
          }),
      );

      // Fire 5 concurrent getToken calls
      const results = await Promise.all([
        tokenManager.getToken(),
        tokenManager.getToken(),
        tokenManager.getToken(),
        tokenManager.getToken(),
        tokenManager.getToken(),
      ]);

      // All should receive the same refreshed token
      for (const token of results) {
        expect(token).toBe('serialized-refreshed-token');
      }

      // Only ONE actual refresh call should have been made
      expect(mockOAuthHandler.refreshAccessToken).toHaveBeenCalledTimes(1);
    });

    it('should allow new refresh after previous completes', async () => {
      const makeNearExpiryToken = (): StoredToken => ({
        accessToken: 'near-expiry-token',
        refreshToken: 'valid-refresh-token',
        userId: 'user-object-id-123',
        scope: 'openid profile email',
        createdAt: Date.now() - 3000000,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
      mockTokenStore.getToken.mockResolvedValue(makeNearExpiryToken());

      let callCount = 0;
      mockOAuthHandler.refreshAccessToken.mockImplementation(() =>
        Promise.resolve<StoredToken>({
          accessToken: `refreshed-token-${++callCount}`,
          refreshToken: 'new-refresh-token',
          userId: 'user-object-id-123',
          scope: 'openid profile email',
          createdAt: Date.now(),
          expiresAt: Date.now() + 3600000,
        }),
      );

      // First refresh
      const token1 = await tokenManager.getToken();
      expect(token1).toBe('refreshed-token-1');

      // Reset stored token to trigger another refresh
      mockTokenStore.getToken.mockResolvedValue(makeNearExpiryToken());

      // Second refresh — should be a new call, not cached
      const token2 = await tokenManager.getToken();
      expect(token2).toBe('refreshed-token-2');

      expect(mockOAuthHandler.refreshAccessToken).toHaveBeenCalledTimes(2);
    });
  });
});
