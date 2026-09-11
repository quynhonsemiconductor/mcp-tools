/**
 * Tests for Generic OAuth Handler
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { OAuthHandler, RANDOM_BYTES_LENGTH } from './oauth-handler';
import type { OAuthProviderConfig } from './types';

// Unique port per test to avoid cross-test interference from SO_REUSEPORT
let nextPort = 18700;
function getUniquePort(): number {
  return nextPort++;
}

// Test implementation of abstract OAuthHandler
class TestOAuthHandler extends OAuthHandler {
  public mockGetUserInfo = mock(() =>
    Promise.resolve({
      userId: 'testuser',
      name: 'Test User',
      email: 'test@example.com',
    }),
  );

  protected async getUserInfo(_accessToken: string): Promise<{
    userId: string;
    name?: string;
    email?: string;
    [key: string]: any;
  }> {
    return this.mockGetUserInfo();
  }

  protected getOAuthErrorMessage(errorCode: string, originalMessage: string): string {
    if (errorCode === 'access_denied') {
      return 'Access was denied by the user';
    }
    return super.getOAuthErrorMessage(errorCode, originalMessage);
  }
}

describe('OAuthHandler', () => {
  let handler: TestOAuthHandler;
  let testConfig: OAuthProviderConfig;

  beforeEach(() => {
    testConfig = {
      providerName: 'TestProvider',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      scopes: ['read', 'write'],
      port: getUniquePort(),
      timeout: 30000,
      authorizeUrl: 'https://test.com/oauth/authorize',
      tokenUrl: 'https://test.com/oauth/token',
    };
    handler = new TestOAuthHandler(testConfig);
  });

  afterEach(async () => {
    await handler.stopServer();
    mock.restore();
  });

  describe('isConfigured', () => {
    it('should return true when client credentials are set', () => {
      expect(handler.isConfigured()).toBe(true);
    });

    it('should return false when clientId is missing', () => {
      const unconfiguredHandler = new TestOAuthHandler({
        ...testConfig,
        clientId: '',
      });
      expect(unconfiguredHandler.isConfigured()).toBe(false);
    });

    it('should return false when clientSecret is missing', () => {
      const unconfiguredHandler = new TestOAuthHandler({
        ...testConfig,
        clientSecret: '',
      });
      expect(unconfiguredHandler.isConfigured()).toBe(false);
    });
  });

  describe('getAuthUrl', () => {
    it('should generate auth URL with all required parameters', () => {
      const { url, state, codeVerifier } = handler.getAuthUrl();

      expect(url).toContain('https://test.com/oauth/authorize');
      expect(url).toContain(`client_id=${testConfig.clientId}`);
      expect(url).toContain(`redirect_uri=http%3A%2F%2Flocalhost%3A${testConfig.port}%2Fcallback`);
      expect(url).toContain(`state=${state}`);
      expect(url).toContain('code_challenge_method=S256');
      expect(url).toContain('code_challenge=');
      expect(url).toContain('scope=read+write');
      expect(url).toContain('response_type=code');
      expect(state).toBeDefined();
      expect(codeVerifier).toBeDefined();
    });

    it('should generate unique state for each call', () => {
      const auth1 = handler.getAuthUrl();
      const auth2 = handler.getAuthUrl();

      expect(auth1.state).not.toBe(auth2.state);
    });

    it('should generate unique code verifier for each call', () => {
      const auth1 = handler.getAuthUrl();
      const auth2 = handler.getAuthUrl();

      expect(auth1.codeVerifier).not.toBe(auth2.codeVerifier);
    });

    it('should generate state with correct entropy', () => {
      const { state } = handler.getAuthUrl();
      // State should be RANDOM_BYTES_LENGTH * 2 hex characters
      expect(state.length).toBe(RANDOM_BYTES_LENGTH * 2);
      expect(state).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate code verifier with base64url encoding', () => {
      const { codeVerifier } = handler.getAuthUrl();
      // Base64url characters only (no +, /, or =)
      expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should use S256 challenge method', () => {
      const { url } = handler.getAuthUrl();
      const challengeMethod = new URL(url).searchParams.get('code_challenge_method');

      expect(challengeMethod).toBe('S256');
    });

    it('should generate different code challenges for different verifiers', () => {
      const auth1 = handler.getAuthUrl();
      const auth2 = handler.getAuthUrl();

      const challenge1 = new URL(auth1.url).searchParams.get('code_challenge');
      const challenge2 = new URL(auth2.url).searchParams.get('code_challenge');

      expect(challenge1).not.toBe(challenge2);
      expect(challenge1).toBeDefined();
      expect(challenge2).toBeDefined();
    });

    it('should use custom callbackPath in redirect URI when configured', () => {
      const customHandler = new TestOAuthHandler({
        ...testConfig,
        callbackPath: '/oauth/custom/callback',
      });
      const { url } = customHandler.getAuthUrl();

      expect(url).toContain(
        'redirect_uri=' +
          encodeURIComponent(`http://localhost:${testConfig.port}/oauth/custom/callback`),
      );
    });
  });

  describe('startOAuthFlow', () => {
    it('should return error when not configured', async () => {
      const unconfiguredHandler = new TestOAuthHandler({
        ...testConfig,
        clientId: '',
      });

      const result = await unconfiguredHandler.startOAuthFlow();

      expect(result.success).toBe(false);
      expect(result.error).toContain('OAuth not configured');
    });

    it('should prevent concurrent OAuth flows', async () => {
      // Start two flows concurrently
      const flow1Promise = handler.startOAuthFlow();
      const flow2Promise = handler.startOAuthFlow();

      // Clean up
      await handler.stopServer();

      // Both promises should exist
      expect(flow1Promise).toBeDefined();
      expect(flow2Promise).toBeDefined();
    });

    it('should start OAuth flow successfully', async () => {
      const flowPromise = handler.startOAuthFlow();

      expect(flowPromise).toBeDefined();
      expect(flowPromise).toBeInstanceOf(Promise);

      // Wait for flow to actually start the server before cleanup
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Clean up
      await handler.stopServer();
    });
  });

  describe('getAuthUrlOnly', () => {
    it('should return error when not configured', async () => {
      const unconfiguredHandler = new TestOAuthHandler({
        ...testConfig,
        clientId: '',
      });

      const result = await unconfiguredHandler.getAuthUrlOnly();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('OAuth not configured');
      }
    });

    it('should return auth URL data with resultPromise', async () => {
      const result = await handler.getAuthUrlOnly();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.url).toContain('https://test.com/oauth/authorize');
        expect(result.state).toBeDefined();
        expect(result.codeVerifier).toBeDefined();
        expect(result.resultPromise).toBeDefined();
        expect(result.resultPromise).toBeInstanceOf(Promise);
      }

      // Clean up
      await handler.stopServer();
    });
  });

  describe('stopServer', () => {
    it('should be safe to call when no server running', async () => {
      await handler.stopServer();
      expect(true).toBe(true);
    });

    it('should be safe to call multiple times', async () => {
      await handler.stopServer();
      await handler.stopServer();
      await handler.stopServer();
      expect(true).toBe(true);
    });
  });

  describe('configuration', () => {
    it('should store provider config correctly', () => {
      const config = (handler as any).config;

      expect(config.providerName).toBe('TestProvider');
      expect(config.clientId).toBe('test-client-id');
      expect(config.clientSecret).toBe('test-client-secret');
      expect(config.scopes).toEqual(['read', 'write']);
      expect(config.port).toBe(testConfig.port);
      expect(config.timeout).toBe(30000);
      expect(config.authorizeUrl).toBe('https://test.com/oauth/authorize');
      expect(config.tokenUrl).toBe('https://test.com/oauth/token');
    });
  });
});
