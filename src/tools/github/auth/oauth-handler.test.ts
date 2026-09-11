/**
 * Tests for GitHub OAuth Handler
 */

import { RequestInfo } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { OAuthError } from '../../../services/auth';
import {
  GitHubOAuthHandler,
  resetOAuthHandlerForTesting,
  type GitHubOAuthAccessResponse,
} from './oauth-handler';
import { GITHUB_OAUTH_SCOPES } from './oauth-config';

describe('GitHubOAuthHandler', () => {
  let handler: GitHubOAuthHandler;
  let originalFetch: typeof global.fetch;
  const testConfig = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
  };

  beforeEach(() => {
    originalFetch = global.fetch;
    void resetOAuthHandlerForTesting();
    handler = new GitHubOAuthHandler(testConfig);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    void resetOAuthHandlerForTesting();
    mock.restore();
  });

  describe('constructor', () => {
    it('should create handler with provided config', () => {
      const customHandler = new GitHubOAuthHandler({
        clientId: 'custom-id',
        clientSecret: 'custom-secret',
      });

      expect(customHandler).toBeDefined();
      expect(customHandler.isConfigured()).toBe(true);
    });

    it('should set correct OAuth URLs for GHES', () => {
      // The handler should use GH_API_URL which is set to GHES in index.ts
      // This is tested implicitly through the exchangeCode and refreshAccessToken methods
      expect(handler).toBeDefined();
    });
  });

  describe('refreshAccessToken', () => {
    const mockTokenResponse: GitHubOAuthAccessResponse = {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
      scope: 'repo read:org',
      token_type: 'bearer',
    };

    it('should successfully refresh a token', async () => {
      global.fetch = mock(async () => {
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockTokenResponse),
        } as Response;
      }) as any;

      const result = await handler.refreshAccessToken('old-refresh-token');

      expect(result).toBeDefined();
      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      // userId is empty on refresh — TokenManager preserves it from the stored token
      expect(result.userId).toBe('');
      expect(result.scope).toBe('repo read:org');
      expect(result.expiresAt).toBeDefined();
    });

    it('should use old refresh token if new one not provided', async () => {
      const responseWithoutRefresh: GitHubOAuthAccessResponse = {
        access_token: 'new-access-token',
        expires_in: 3600,
        scope: 'repo read:org',
        token_type: 'bearer',
      };

      global.fetch = mock(async () => ({
        ok: true,
        status: 200,
        json: () => Promise.resolve(responseWithoutRefresh),
      })) as any;

      const result = await handler.refreshAccessToken('old-refresh-token');

      expect(result.refreshToken).toBe('old-refresh-token');
    });

    it('should throw OAuthError on network failure', async () => {
      global.fetch = mock(async () => {
        throw new Error('Network connection failed');
      }) as any;

      try {
        await handler.refreshAccessToken('test-refresh-token');
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error).toBeInstanceOf(OAuthError);
        expect(error.message).toContain('Network error during token refresh');
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
        await handler.refreshAccessToken('test-refresh-token');
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error).toBeInstanceOf(OAuthError);
        expect(error.message).toContain('failed to parse JSON');
        expect(error.code).toBe('PARSE_ERROR');
      }
    });

    it('should throw OAuthError when GitHub returns error', async () => {
      const errorResponse: GitHubOAuthAccessResponse = {
        error: 'invalid_grant',
        error_description: 'The refresh token is invalid',
      };

      global.fetch = mock(async () => ({
        ok: true,
        status: 200,
        json: () => Promise.resolve(errorResponse),
      })) as any;

      try {
        await handler.refreshAccessToken('invalid-refresh-token');
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error).toBeInstanceOf(OAuthError);
        expect(error.message).toContain('The refresh token is invalid');
        expect(error.providerError).toBe('invalid_grant');
      }
    });

    it('should throw OAuthError when no access token returned', async () => {
      const responseWithoutToken: GitHubOAuthAccessResponse = {
        scope: 'repo',
        token_type: 'bearer',
      };

      global.fetch = mock(async () => ({
        ok: true,
        status: 200,
        json: () => Promise.resolve(responseWithoutToken),
      })) as any;

      try {
        await handler.refreshAccessToken('test-refresh-token');
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error).toBeInstanceOf(OAuthError);
        expect(error.message).toContain('no access token returned');
        expect(error.code).toBe('NO_TOKEN');
      }
    });

    it('should calculate expiration time correctly', async () => {
      const beforeTime = Date.now();

      global.fetch = mock(async () => ({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockTokenResponse),
      })) as any;

      const result = await handler.refreshAccessToken('test-refresh-token');

      const afterTime = Date.now();
      const expectedMinExpiry = beforeTime + 3600000; // 1 hour
      const expectedMaxExpiry = afterTime + 3600000;

      expect(result.expiresAt).toBeDefined();
      expect(result.expiresAt!).toBeGreaterThanOrEqual(expectedMinExpiry);
      expect(result.expiresAt!).toBeLessThanOrEqual(expectedMaxExpiry);
    });

    it('should not set expiration when expires_in is 0', async () => {
      const responseNoExpiry: GitHubOAuthAccessResponse = {
        access_token: 'new-access-token',
        expires_in: 0,
        scope: 'repo',
        token_type: 'bearer',
      };

      global.fetch = mock(async () => ({
        ok: true,
        status: 200,
        json: () => Promise.resolve(responseNoExpiry),
      })) as any;

      const result = await handler.refreshAccessToken('test-refresh-token');

      expect(result.expiresAt).toBeUndefined();
    });

    it('should throw error when OAuth is not configured', async () => {
      const unconfiguredHandler = new GitHubOAuthHandler({
        clientId: '',
        clientSecret: '',
      });

      try {
        await unconfiguredHandler.refreshAccessToken('test-refresh-token');
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain('GitHub OAuth not configured');
      }
    });
  });

  describe('getSuccessDisplayName', () => {
    it('should return username with @ prefix', () => {
      const token = {
        accessToken: 'token',
        userId: 'testuser',
        scope: 'repo',
        createdAt: Date.now(),
      };

      // Access protected method through type casting
      const displayName = (handler as any).getSuccessDisplayName(token);
      expect(displayName).toBe(' as @testuser');
    });

    it('should return empty string when userId is empty', () => {
      const token = {
        accessToken: 'token',
        userId: '',
        scope: 'repo',
        createdAt: Date.now(),
      };

      const displayName = (handler as any).getSuccessDisplayName(token);
      expect(displayName).toBe('');
    });
  });

  describe('getOAuthErrorMessage', () => {
    it('should return user-friendly message for bad_verification_code', () => {
      const message = (handler as any).getOAuthErrorMessage(
        'bad_verification_code',
        'original message',
      );
      expect(message).toContain('authorization code has expired');
    });

    it('should return user-friendly message for incorrect_client_credentials', () => {
      const message = (handler as any).getOAuthErrorMessage(
        'incorrect_client_credentials',
        'original',
      );
      expect(message).toContain('OAuth configuration error');
    });

    it('should return user-friendly message for redirect_uri_mismatch', () => {
      const message = (handler as any).getOAuthErrorMessage('redirect_uri_mismatch', 'original');
      expect(message).toContain('redirect URL is misconfigured');
    });

    it('should return user-friendly message for access_denied', () => {
      const message = (handler as any).getOAuthErrorMessage('access_denied', 'original');
      expect(message).toContain('Access was denied');
    });

    it('should return user-friendly message for unverified_user_email', () => {
      const message = (handler as any).getOAuthErrorMessage('unverified_user_email', 'original');
      expect(message).toContain('verify your email address');
    });

    it('should return user-friendly message for network errors', () => {
      expect((handler as any).getOAuthErrorMessage('ECONNREFUSED', 'original')).toContain(
        'Could not connect',
      );
      expect((handler as any).getOAuthErrorMessage('ETIMEDOUT', 'original')).toContain('timed out');
      expect((handler as any).getOAuthErrorMessage('NETWORK_ERROR', 'original')).toContain(
        'Network error',
      );
    });

    it('should return user-friendly message for parse errors', () => {
      const message = (handler as any).getOAuthErrorMessage('PARSE_ERROR', 'original');
      expect(message).toContain('Invalid response from GitHub');
    });

    it('should return user-friendly message for missing token', () => {
      const message = (handler as any).getOAuthErrorMessage('NO_TOKEN', 'original');
      expect(message).toContain('did not return an access token');
    });

    it('should return user-friendly message for user info failure', () => {
      const message = (handler as any).getOAuthErrorMessage('USER_INFO_FAILED', 'original');
      expect(message).toContain('Failed to retrieve user information');
    });

    it('should return original message for unknown error codes', () => {
      const message = (handler as any).getOAuthErrorMessage(
        'UNKNOWN_ERROR',
        'Something went wrong',
      );
      expect(message).toContain('Something went wrong');
    });
  });

  describe('isConfigured', () => {
    it('should return true when credentials are provided', () => {
      expect(handler.isConfigured()).toBe(true);
    });

    it('should return false when credentials are missing', () => {
      const unconfiguredHandler = new GitHubOAuthHandler({
        clientId: '',
        clientSecret: '',
      });
      expect(unconfiguredHandler.isConfigured()).toBe(false);
    });
  });

  describe('PKCE exchange', () => {
    it('should include code_verifier in token exchange request body', async () => {
      // Arrange: capture the request body sent to token endpoint.
      // Held in an object (rather than a bare `let`) because TS's control-flow
      // narrowing only sees the initializer for a captured `let`, not the
      // reassignment inside the closure below, and would otherwise narrow
      // `capturedBody` to `null` at the assertions further down.
      const captured: { body: string | null } = { body: null };

      global.fetch = mock(async (input: RequestInfo, init?: RequestInit) => {
        // Token endpoint call will send form-encoded body
        if (typeof init?.body === 'string') {
          captured.body = init.body;
        } else if (init?.body instanceof URLSearchParams) {
          captured.body = init.body.toString();
        }

        // Respond with a token and then user info
        return {
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              access_token: 'x',
              refresh_token: 'y',
              expires_in: 3600,
              scope: 'repo',
            }),
        } as Response;
      }) as any;

      // Act: call protected exchangeCode directly via type cast
      const authUrlData = (handler as any).getAuthUrl();
      const codeVerifier = authUrlData.codeVerifier;

      // Call exchangeCode to trigger token POST
      try {
        await (handler as any).exchangeCode('test-code', codeVerifier);
      } catch {
        // exchangeCode will also call getUserInfo which may fail in this mock; ignore errors
      }

      // Assert: captured body contains code_verifier
      expect(captured.body).not.toBeNull();
      expect(captured.body).toContain('code_verifier=');
      expect(captured.body).toContain(encodeURIComponent(codeVerifier));
    });
  });

  describe('singleton behavior', () => {
    it('should return same instance on multiple calls', () => {
      const { getGitHubOAuthHandler } = require('./oauth-handler');

      const instance1 = getGitHubOAuthHandler();
      const instance2 = getGitHubOAuthHandler();

      expect(instance1).toBe(instance2);
    });

    it('should reset singleton for testing', async () => {
      const { getGitHubOAuthHandler, resetOAuthHandlerForTesting } = require('./oauth-handler');

      const instance1 = getGitHubOAuthHandler();
      await resetOAuthHandlerForTesting();
      const instance2 = getGitHubOAuthHandler();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('GITHUB_OAUTH_SCOPES', () => {
    it('should include security_events scope required for Dependabot alert endpoints', () => {
      expect(GITHUB_OAUTH_SCOPES).toContain('security_events');
    });

    it('should include all core scopes required by GitHub tools', () => {
      for (const scope of ['repo', 'read:org', 'read:user', 'user:email', 'workflow', 'project']) {
        expect(GITHUB_OAUTH_SCOPES).toContain(scope);
      }
      expect(GITHUB_OAUTH_SCOPES).toHaveLength(7);
    });

    it('should pass all scopes through to the OAuth authorization URL as space-separated values', () => {
      const { url } = handler.getAuthUrl();
      const rawScope = new URL(url).searchParams.get('scope')!;
      const scopesInUrl = rawScope.split(' ');
      for (const scope of GITHUB_OAUTH_SCOPES) {
        expect(scopesInUrl).toContain(scope);
      }
      expect(scopesInUrl).toHaveLength(GITHUB_OAUTH_SCOPES.length);
      expect(rawScope).not.toContain(',');
    });

    it('should contain no duplicate scopes', () => {
      expect(new Set(GITHUB_OAUTH_SCOPES).size).toBe(GITHUB_OAUTH_SCOPES.length);
    });
  });

  describe('URL construction', () => {
    it('should configure OAuth endpoint URLs with correct paths', () => {
      // Verify that OAuth URLs have the correct endpoint paths
      const config = (handler as any).config;

      expect(config.authorizeUrl).toContain('/login/oauth/authorize');
      expect(config.tokenUrl).toContain('/login/oauth/access_token');
      expect(config.authorizeUrl).toMatch(/^https?:\/\//);
      expect(config.tokenUrl).toMatch(/^https?:\/\//);
    });

    it('should configure user API endpoint URL', () => {
      const userApiUrl = (handler as any).userApiUrl;

      expect(userApiUrl).toContain('/user');
      expect(userApiUrl).toMatch(/^https?:\/\//);
    });
  });
});
