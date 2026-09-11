/**
 * Tests for Entra ID OAuth Handler
 *
 * Covers T011 (PKCE/handler behavior) and T013 (inherited callback server behavior).
 * Follows the same test pattern as src/tools/github/auth/oauth-handler.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { OAuthError } from '..';
import {
  EntraIdOAuthHandler,
  getEntraIdOAuthHandler,
  resetEntraIdOAuthHandlerForTesting,
} from './oauth-handler';
import type { EntraIdConfig } from './types';

/**
 * Create a minimal valid JWT with the given claims for testing.
 * Does NOT produce a cryptographically valid signature — only used for
 * decodeJwtPayload() which skips verification.
 */
function createTestJwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = 'test-signature';
  return `${header}.${payload}.${signature}`;
}

/** Standard Entra ID config for tests */
const testConfig: EntraIdConfig = {
  clientId: 'test-client-id-uuid',
  tenantId: 'test-tenant-id-uuid',
  platformUrl: 'https://platform.example.com',
  callbackPort: 9876,
  loginTimeoutMs: 120_000,
  scopes: ['openid', 'profile', 'email', 'offline_access', 'api://test-client-id-uuid/access'],
};

const testAuthorizeUrl = 'https://login.microsoftonline.com/test-tenant/oauth2/v2.0/authorize';
const testTokenUrl = 'https://login.microsoftonline.com/test-tenant/oauth2/v2.0/token';

/** Standard JWT claims simulating an Entra ID access token */
const testJwtClaims = {
  oid: 'user-object-id-123',
  sub: 'user-subject-id-456',
  name: 'Test User',
  email: 'test@example.com',
  preferred_username: 'test@qnsc.vn',
  tid: 'test-tenant-id-uuid',
  exp: Math.floor(Date.now() / 1000) + 3600,
};

describe('EntraIdOAuthHandler', () => {
  let handler: EntraIdOAuthHandler;
  let originalFetch: typeof global.fetch;

  beforeEach(async () => {
    originalFetch = global.fetch;
    await resetEntraIdOAuthHandlerForTesting();
    handler = new EntraIdOAuthHandler(testConfig, testAuthorizeUrl, testTokenUrl);
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    await resetEntraIdOAuthHandlerForTesting();
    mock.restore();
  });

  describe('constructor', () => {
    it('should create handler with Entra ID config', () => {
      expect(handler).toBeDefined();
      expect(handler.isConfigured()).toBe(true);
    });

    it('should set provider name to Entra ID', () => {
      const config = (handler as any).config;
      expect(config.providerName).toBe('Entra ID');
    });

    it('should set empty clientSecret for public client', () => {
      const config = (handler as any).config;
      expect(config.clientSecret).toBe('');
    });

    it('should configure scopes from EntraIdConfig', () => {
      const config = (handler as any).config;
      expect(config.scopes).toEqual(testConfig.scopes);
    });

    it('should configure port and timeout from EntraIdConfig', () => {
      const config = (handler as any).config;
      expect(config.port).toBe(9876);
      expect(config.timeout).toBe(120_000);
    });

    it('should configure OIDC-discovered endpoints', () => {
      const config = (handler as any).config;
      expect(config.authorizeUrl).toBe(testAuthorizeUrl);
      expect(config.tokenUrl).toBe(testTokenUrl);
    });
  });

  describe('isConfigured', () => {
    it('should return true when clientId is set', () => {
      expect(handler.isConfigured()).toBe(true);
    });

    it('should return false when clientId is empty', () => {
      const unconfigured = new EntraIdOAuthHandler(
        { ...testConfig, clientId: '' },
        testAuthorizeUrl,
        testTokenUrl,
      );
      expect(unconfigured.isConfigured()).toBe(false);
    });

    it('should return true even without clientSecret (public client)', () => {
      // This is the key difference from GitHub — no secret required
      expect(handler.isConfigured()).toBe(true);
      const config = (handler as any).config;
      expect(config.clientSecret).toBe('');
    });
  });

  describe('PKCE (inherited from base OAuthHandler)', () => {
    it('should generate auth URL with PKCE S256 code challenge', () => {
      const authData = (handler as any).getAuthUrl();

      expect(authData.url).toContain('code_challenge=');
      expect(authData.url).toContain('code_challenge_method=S256');
      expect(authData.codeVerifier).toBeDefined();
      expect(authData.codeVerifier.length).toBeGreaterThan(0);
      expect(authData.state).toBeDefined();
    });

    it('should generate unique code verifiers on each call', () => {
      const auth1 = (handler as any).getAuthUrl();
      const auth2 = (handler as any).getAuthUrl();

      expect(auth1.codeVerifier).not.toBe(auth2.codeVerifier);
    });

    it('should generate unique state on each call', () => {
      const auth1 = (handler as any).getAuthUrl();
      const auth2 = (handler as any).getAuthUrl();

      expect(auth1.state).not.toBe(auth2.state);
    });

    it('should include client_id and scopes in auth URL', () => {
      const authData = (handler as any).getAuthUrl();

      expect(authData.url).toContain(`client_id=${testConfig.clientId}`);
      expect(authData.url).toContain('response_type=code');
      expect(authData.url).toContain('scope=');
    });

    it('should include redirect_uri with configured port and Entra callback path', () => {
      const authData = (handler as any).getAuthUrl();
      expect(authData.url).toContain(
        `redirect_uri=${encodeURIComponent(`http://localhost:${testConfig.callbackPort}/cms/auth/entra/callback`)}`,
      );
    });
  });

  describe('exchangeCode (public client — no client_secret)', () => {
    const testAccessToken = createTestJwt(testJwtClaims);

    it('should exchange code without client_secret', async () => {
      let capturedBody = '';

      global.fetch = mock(async (_input: any, init?: RequestInit) => {
        if (init?.body) {
          capturedBody =
            init.body instanceof URLSearchParams
              ? init.body.toString()
              : typeof init.body === 'string'
                ? init.body
                : '';
        }
        return {
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              access_token: testAccessToken,
              refresh_token: 'test-refresh-token',
              expires_in: 3600,
              scope: 'openid profile email',
              token_type: 'Bearer',
            }),
        } as Response;
      }) as any;

      await (handler as any).exchangeCode('test-auth-code', 'test-code-verifier');

      expect(capturedBody).not.toBe('');
      expect(capturedBody).toContain('client_id=test-client-id-uuid');
      expect(capturedBody).toContain('grant_type=authorization_code');
      expect(capturedBody).toContain('code=test-auth-code');
      expect(capturedBody).toContain('code_verifier=test-code-verifier');
      // Key assertion: no client_secret
      expect(capturedBody).not.toContain('client_secret');
    });

    it('should extract user info from JWT claims', async () => {
      global.fetch = mock(async () => ({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: testAccessToken,
            refresh_token: 'test-refresh-token',
            expires_in: 3600,
            scope: 'openid profile email',
            token_type: 'Bearer',
          }),
      })) as any;

      const result = await (handler as any).exchangeCode('test-code', 'test-verifier');

      expect(result.userId).toBe('user-object-id-123');
      expect(result.metadata?.name).toBe('Test User');
      expect(result.metadata?.email).toBe('test@example.com');
      expect(result.metadata?.preferred_username).toBe('test@qnsc.vn');
      expect(result.metadata?.tenant_id).toBe('test-tenant-id-uuid');
    });

    it('should calculate expiration time from expires_in', async () => {
      const beforeTime = Date.now();

      global.fetch = mock(async () => ({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: testAccessToken,
            refresh_token: 'test-refresh-token',
            expires_in: 3600,
            scope: 'openid',
            token_type: 'Bearer',
          }),
      })) as any;

      const result = await (handler as any).exchangeCode('test-code', 'test-verifier');

      const afterTime = Date.now();
      expect(result.expiresAt).toBeGreaterThanOrEqual(beforeTime + 3600 * 1000);
      expect(result.expiresAt).toBeLessThanOrEqual(afterTime + 3600 * 1000);
    });

    it('should throw OAuthError on network failure', async () => {
      global.fetch = mock(async () => {
        throw new Error('Network connection failed');
      }) as any;

      try {
        await (handler as any).exchangeCode('test-code', 'test-verifier');
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(OAuthError);
        expect(error.message).toContain('Network error during token exchange');
        expect(error.code).toBe('NETWORK_ERROR');
      }
    });

    it('should throw OAuthError on invalid JSON response', async () => {
      global.fetch = mock(async () => ({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('Invalid JSON')),
      })) as any;

      try {
        await (handler as any).exchangeCode('test-code', 'test-verifier');
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(OAuthError);
        expect(error.message).toContain('failed to parse JSON');
        expect(error.code).toBe('PARSE_ERROR');
      }
    });

    it('should throw OAuthError when Entra ID returns error response', async () => {
      global.fetch = mock(async () => ({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            error: 'invalid_grant',
            error_description: 'The authorization code has expired',
          }),
      })) as any;

      try {
        await (handler as any).exchangeCode('test-code', 'test-verifier');
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(OAuthError);
        expect(error.message).toContain('authorization code has expired');
        expect(error.providerError).toBe('invalid_grant');
      }
    });

    it('should throw OAuthError when no access token returned', async () => {
      global.fetch = mock(async () => ({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            token_type: 'Bearer',
            scope: 'openid',
          }),
      })) as any;

      try {
        await (handler as any).exchangeCode('test-code', 'test-verifier');
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(OAuthError);
        expect(error.message).toContain('no access token returned');
        expect(error.code).toBe('NO_TOKEN');
      }
    });

    it('should throw OAuthError when JWT is missing user identifier', async () => {
      const jwtWithNoClaims = createTestJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });

      global.fetch = mock(async () => ({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: jwtWithNoClaims,
            refresh_token: 'test-refresh',
            expires_in: 3600,
            token_type: 'Bearer',
          }),
      })) as any;

      try {
        await (handler as any).exchangeCode('test-code', 'test-verifier');
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(OAuthError);
        expect(error.message).toContain('missing user identifier');
        expect(error.code).toBe('USER_INFO_FAILED');
      }
    });

    it('should throw OAuthError when access token is not a valid JWT', async () => {
      global.fetch = mock(async () => ({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: 'not-a-jwt',
            refresh_token: 'test-refresh',
            expires_in: 3600,
            token_type: 'Bearer',
          }),
      })) as any;

      try {
        await (handler as any).exchangeCode('test-code', 'test-verifier');
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(OAuthError);
        expect(error.message).toContain('Failed to decode access token');
        expect(error.code).toBe('USER_INFO_FAILED');
      }
    });

    it('should use sub claim as fallback when oid is missing', async () => {
      const jwtWithSubOnly = createTestJwt({
        sub: 'subject-only-id',
        name: 'Sub User',
      });

      global.fetch = mock(async () => ({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: jwtWithSubOnly,
            refresh_token: 'test-refresh',
            expires_in: 3600,
            token_type: 'Bearer',
          }),
      })) as any;

      const result = await (handler as any).exchangeCode('test-code', 'test-verifier');
      expect(result.userId).toBe('subject-only-id');
    });
  });

  describe('refreshAccessToken (confidential client — with client_secret)', () => {
    const testAccessToken = createTestJwt(testJwtClaims);

    it('should include client_secret when configured', async () => {
      const confidentialConfig: EntraIdConfig = {
        ...testConfig,
        clientSecret: 'test-secret-value',
      };
      const confidentialHandler = new EntraIdOAuthHandler(
        confidentialConfig,
        testAuthorizeUrl,
        testTokenUrl,
      );

      let capturedBody = '';
      global.fetch = mock(async (_input: any, init?: RequestInit) => {
        if (init?.body) {
          capturedBody =
            init.body instanceof URLSearchParams
              ? init.body.toString()
              : typeof init.body === 'string'
                ? init.body
                : '';
        }
        return {
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              access_token: testAccessToken,
              refresh_token: 'new-refresh-token',
              expires_in: 3600,
              scope: 'openid profile email',
              token_type: 'Bearer',
            }),
        } as Response;
      }) as any;

      await confidentialHandler.refreshAccessToken('old-refresh-token');

      expect(capturedBody).toContain('client_secret=test-secret-value');
      expect(capturedBody).toContain('client_id=test-client-id-uuid');
      expect(capturedBody).toContain('grant_type=refresh_token');
    });

    it('should include client_secret in exchangeCode when configured', async () => {
      const confidentialConfig: EntraIdConfig = {
        ...testConfig,
        clientSecret: 'test-secret-value',
      };
      const confidentialHandler = new EntraIdOAuthHandler(
        confidentialConfig,
        testAuthorizeUrl,
        testTokenUrl,
      );

      let capturedBody = '';
      global.fetch = mock(async (_input: any, init?: RequestInit) => {
        if (init?.body) {
          capturedBody =
            init.body instanceof URLSearchParams
              ? init.body.toString()
              : typeof init.body === 'string'
                ? init.body
                : '';
        }
        return {
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              access_token: testAccessToken,
              refresh_token: 'test-refresh-token',
              expires_in: 3600,
              scope: 'openid profile email',
              token_type: 'Bearer',
            }),
        } as Response;
      }) as any;

      await (confidentialHandler as any).exchangeCode('test-auth-code', 'test-code-verifier');

      expect(capturedBody).toContain('client_secret=test-secret-value');
      expect(capturedBody).toContain('grant_type=authorization_code');
    });
  });

  describe('refreshAccessToken (public client — no client_secret)', () => {
    const testAccessToken = createTestJwt(testJwtClaims);

    it('should refresh token without client_secret', async () => {
      let capturedBody = '';

      global.fetch = mock(async (_input: any, init?: RequestInit) => {
        if (init?.body) {
          capturedBody =
            init.body instanceof URLSearchParams
              ? init.body.toString()
              : typeof init.body === 'string'
                ? init.body
                : '';
        }
        return {
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              access_token: testAccessToken,
              refresh_token: 'new-refresh-token',
              expires_in: 3600,
              scope: 'openid profile email',
              token_type: 'Bearer',
            }),
        } as Response;
      }) as any;

      const result = await handler.refreshAccessToken('old-refresh-token');

      expect(capturedBody).not.toBe('');
      expect(capturedBody).toContain('client_id=test-client-id-uuid');
      expect(capturedBody).toContain('grant_type=refresh_token');
      expect(capturedBody).toContain('refresh_token=old-refresh-token');
      // Key assertion: no client_secret
      expect(capturedBody).not.toContain('client_secret');
      // Key assertion: includes scope
      expect(capturedBody).toContain('scope=');

      expect(result.accessToken).toBe(testAccessToken);
      expect(result.refreshToken).toBe('new-refresh-token');
      // userId is empty during refresh — base class skips getUserInfo() and
      // relies on TokenManager.executeTokenRefresh() to preserve the stored userId
      expect(result.userId).toBe('');
    });

    it('should keep old refresh token when new one not provided', async () => {
      global.fetch = mock(async () => ({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: testAccessToken,
            expires_in: 3600,
            scope: 'openid',
            token_type: 'Bearer',
          }),
      })) as any;

      const result = await handler.refreshAccessToken('old-refresh-token');
      expect(result.refreshToken).toBe('old-refresh-token');
    });

    it('should throw OAuthError on network failure during refresh', async () => {
      global.fetch = mock(async () => {
        throw new Error('Network connection failed');
      }) as any;

      try {
        await handler.refreshAccessToken('test-refresh-token');
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(OAuthError);
        expect(error.message).toContain('Network error during token refresh');
        expect(error.code).toBe('NETWORK_ERROR');
      }
    });

    it('should throw OAuthError on invalid JSON response during refresh', async () => {
      global.fetch = mock(async () => ({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('Invalid JSON')),
      })) as any;

      try {
        await handler.refreshAccessToken('test-refresh-token');
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(OAuthError);
        expect(error.message).toContain('failed to parse JSON');
        expect(error.code).toBe('PARSE_ERROR');
      }
    });

    it('should throw OAuthError when Entra ID returns error during refresh', async () => {
      global.fetch = mock(async () => ({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            error: 'invalid_grant',
            error_description: 'The refresh token has expired',
          }),
      })) as any;

      try {
        await handler.refreshAccessToken('expired-refresh-token');
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(OAuthError);
        expect(error.message).toContain('refresh token has expired');
        expect(error.providerError).toBe('invalid_grant');
      }
    });

    it('should throw error when handler is not configured', async () => {
      const unconfigured = new EntraIdOAuthHandler(
        { ...testConfig, clientId: '' },
        testAuthorizeUrl,
        testTokenUrl,
      );

      try {
        await unconfigured.refreshAccessToken('test-refresh-token');
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('Entra ID OAuth not configured');
      }
    });
  });

  describe('getUserInfo (JWT decode)', () => {
    it('should extract oid, name, email, preferred_username, tid from JWT', async () => {
      const jwt = createTestJwt(testJwtClaims);
      const result = await (handler as any).getUserInfo(jwt);

      expect(result.userId).toBe('user-object-id-123');
      expect(result.name).toBe('Test User');
      expect(result.email).toBe('test@example.com');
      expect(result.preferred_username).toBe('test@qnsc.vn');
      expect(result.tenant_id).toBe('test-tenant-id-uuid');
    });

    it('should use preferred_username as email fallback', async () => {
      const jwt = createTestJwt({
        oid: 'user-id',
        preferred_username: 'user@domain.com',
        // no email claim
      });
      const result = await (handler as any).getUserInfo(jwt);

      expect(result.email).toBe('user@domain.com');
    });

    it('should fall back to sub when oid is missing', async () => {
      const jwt = createTestJwt({
        sub: 'subject-id-only',
        name: 'Sub User',
      });
      const result = await (handler as any).getUserInfo(jwt);

      expect(result.userId).toBe('subject-id-only');
    });

    it('should throw when JWT is not valid', async () => {
      try {
        await (handler as any).getUserInfo('not-a-jwt');
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(OAuthError);
        expect(error.code).toBe('USER_INFO_FAILED');
      }
    });

    it('should throw when JWT has no oid or sub claims', async () => {
      const jwt = createTestJwt({ name: 'No ID User' });

      try {
        await (handler as any).getUserInfo(jwt);
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(OAuthError);
        expect(error.message).toContain('missing user identifier');
      }
    });
  });

  describe('getSuccessDisplayName', () => {
    it('should return preferred_username when available', () => {
      const token = {
        accessToken: 'token',
        userId: 'user-id',
        scope: 'openid',
        createdAt: Date.now(),
        metadata: { preferred_username: 'test@qnsc.vn', email: 'test@example.com' },
      };
      const name = (handler as any).getSuccessDisplayName(token);
      expect(name).toBe(' as test@qnsc.vn');
    });

    it('should fall back to email when preferred_username is missing', () => {
      const token = {
        accessToken: 'token',
        userId: 'user-id',
        scope: 'openid',
        createdAt: Date.now(),
        metadata: { email: 'test@example.com' },
      };
      const name = (handler as any).getSuccessDisplayName(token);
      expect(name).toBe(' as test@example.com');
    });

    it('should fall back to userId when no metadata', () => {
      const token = {
        accessToken: 'token',
        userId: 'user-object-id',
        scope: 'openid',
        createdAt: Date.now(),
      };
      const name = (handler as any).getSuccessDisplayName(token);
      expect(name).toBe(' as user-object-id');
    });

    it('should return empty string when userId is empty and no metadata', () => {
      const token = {
        accessToken: 'token',
        userId: '',
        scope: 'openid',
        createdAt: Date.now(),
      };
      const name = (handler as any).getSuccessDisplayName(token);
      expect(name).toBe('');
    });
  });

  describe('getOAuthErrorMessage', () => {
    it('should return Entra-specific message for AADSTS50076 (MFA required)', () => {
      const msg = (handler as any).getOAuthErrorMessage('AADSTS50076', 'original');
      expect(msg).toContain('Multi-factor authentication required');
    });

    it('should return Entra-specific message for AADSTS65001 (admin consent)', () => {
      const msg = (handler as any).getOAuthErrorMessage('AADSTS65001', 'original');
      expect(msg).toContain('Admin consent required');
    });

    it('should return Entra-specific message for AADSTS70011 (invalid scope)', () => {
      const msg = (handler as any).getOAuthErrorMessage('AADSTS70011', 'original');
      expect(msg).toContain('Invalid scope');
    });

    it('should return Entra-specific message for AADSTS700016 (app not found)', () => {
      const msg = (handler as any).getOAuthErrorMessage('AADSTS700016', 'original');
      expect(msg).toContain('Application not found');
    });

    it('should return Entra-specific message for invalid_grant', () => {
      const msg = (handler as any).getOAuthErrorMessage('invalid_grant', 'original');
      expect(msg).toContain('authorization code or refresh token has expired');
    });

    it('should return Entra-specific message for consent_required', () => {
      const msg = (handler as any).getOAuthErrorMessage('consent_required', 'original');
      expect(msg).toContain('Admin consent required');
    });

    it('should return Entra-specific message for AADSTS530003 (compliant device)', () => {
      const msg = (handler as any).getOAuthErrorMessage('AADSTS530003', 'original');
      expect(msg).toContain('compliant device');
    });

    it('should fall back to base class for common errors', () => {
      expect((handler as any).getOAuthErrorMessage('ECONNREFUSED', 'original')).toContain(
        'Could not connect',
      );
      expect((handler as any).getOAuthErrorMessage('ETIMEDOUT', 'original')).toContain('timed out');
      expect((handler as any).getOAuthErrorMessage('access_denied', 'original')).toContain(
        'Access was denied',
      );
    });

    it('should return original message for unknown error codes', () => {
      const msg = (handler as any).getOAuthErrorMessage('UNKNOWN_CODE', 'Something broke');
      expect(msg).toContain('Something broke');
    });
  });

  describe('singleton behavior', () => {
    it('should return same instance from getEntraIdOAuthHandler', () => {
      const inst1 = getEntraIdOAuthHandler(testConfig, testAuthorizeUrl, testTokenUrl);
      const inst2 = getEntraIdOAuthHandler(testConfig, testAuthorizeUrl, testTokenUrl);

      expect(inst1).toBe(inst2);
    });

    it('should reset singleton for testing', async () => {
      const inst1 = getEntraIdOAuthHandler(testConfig, testAuthorizeUrl, testTokenUrl);
      await resetEntraIdOAuthHandlerForTesting();
      const inst2 = getEntraIdOAuthHandler(testConfig, testAuthorizeUrl, testTokenUrl);

      expect(inst1).not.toBe(inst2);
    });
  });
});
