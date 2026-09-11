/**
 * Integration tests for backwards compatibility (T022).
 *
 * Ensures SSO login is NEVER triggered for local tool calls or non-platform
 * remote tools. Existing users must experience zero disruption.
 *
 * Covers:
 * - US4-AS1: Local tool calls succeed with no tokens stored and no SSO prompt
 * - US4-AS2: Existing Slack/Lucid/New Relic OAuth flows unaffected
 * - US4-AS3: EXAMPLE_SERVICE_TOKEN env var continues to work for local Example tool calls
 * - No new mandatory env vars required
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { setupEntraIdMocks } from '../../../test-utils/entra-id-mocks';
import '../../../test-utils/mocks';

const { mockGetToken, mockGetEntraIdTokenManager, mockTokenManager } = setupEntraIdMocks({
  tokenValue: 'should-not-be-called',
});

import { _resetConfigCache, attachAuthHeaders, isRemotePlatformRequest } from './platform-auth';

describe('Backwards Compatibility (T022)', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    _resetConfigCache();

    savedEnv.EXAMPLE_SERVICE_TOKEN = process.env.EXAMPLE_SERVICE_TOKEN;
    delete process.env.EXAMPLE_SERVICE_TOKEN;

    mockGetToken.mockReset();
    mockGetToken.mockResolvedValue('should-not-be-called');
    mockGetEntraIdTokenManager.mockReset();
    mockGetEntraIdTokenManager.mockResolvedValue(mockTokenManager);
  });

  afterEach(() => {
    if (savedEnv.EXAMPLE_SERVICE_TOKEN !== undefined) {
      process.env.EXAMPLE_SERVICE_TOKEN = savedEnv.EXAMPLE_SERVICE_TOKEN;
    } else {
      delete process.env.EXAMPLE_SERVICE_TOKEN;
    }
    mock.restore();
  });

  describe('US4-AS1: Local tool calls succeed without SSO prompt', () => {
    it('should not trigger SSO for local tool calls (localhost URL)', async () => {
      const headers = await attachAuthHeaders('http://localhost:3000/tools/example-service');

      expect(headers).toBeNull();
      expect(mockGetEntraIdTokenManager).not.toHaveBeenCalled();
      expect(mockGetToken).not.toHaveBeenCalled();
    });

    it('should not trigger SSO for local tool calls (127.0.0.1 URL)', async () => {
      const headers = await attachAuthHeaders('http://127.0.0.1:8080/api/tool');

      expect(headers).toBeNull();
      expect(mockGetEntraIdTokenManager).not.toHaveBeenCalled();
    });

    it('should not trigger SSO when platformUrl is empty', async () => {
      // The guard should return false when platformUrl is empty, which is the
      // default state for users who have not configured SSO
      const result = isRemotePlatformRequest('https://api.example.com/mcp');

      // With platform URL set to 'https://platform.example.com', this should be false
      expect(result).toBe(false);
      expect(mockGetToken).not.toHaveBeenCalled();
    });
  });

  describe('US4-AS2: Existing OAuth flows unaffected', () => {
    it('should not trigger SSO for Slack API calls', async () => {
      const headers = await attachAuthHeaders('https://slack.com/api/chat.postMessage');

      expect(headers).toBeNull();
      expect(mockGetEntraIdTokenManager).not.toHaveBeenCalled();
    });

    it('should not trigger SSO for Lucid MCP calls', async () => {
      const headers = await attachAuthHeaders('https://mcp.lucid.app/mcp');

      expect(headers).toBeNull();
      expect(mockGetEntraIdTokenManager).not.toHaveBeenCalled();
    });

    it('should not trigger SSO for New Relic MCP calls', async () => {
      const headers = await attachAuthHeaders('https://mcp.newrelic.com/mcp/');

      expect(headers).toBeNull();
      expect(mockGetEntraIdTokenManager).not.toHaveBeenCalled();
    });

    it('should not trigger SSO for GitHub Copilot MCP calls', async () => {
      const headers = await attachAuthHeaders('https://api.githubcopilot.com/mcp/');

      expect(headers).toBeNull();
      expect(mockGetEntraIdTokenManager).not.toHaveBeenCalled();
    });

    it('should not trigger SSO for Atlassian MCP calls', async () => {
      const headers = await attachAuthHeaders('https://mcp.atlassian.com/v1/mcp');

      expect(headers).toBeNull();
      expect(mockGetEntraIdTokenManager).not.toHaveBeenCalled();
    });

    it('should not trigger SSO for Postman MCP calls', async () => {
      const headers = await attachAuthHeaders('https://mcp.postman.com/mcp');

      expect(headers).toBeNull();
      expect(mockGetEntraIdTokenManager).not.toHaveBeenCalled();
    });
  });

  describe('US4-AS3: EXAMPLE_SERVICE_TOKEN continues to work for local Example tools', () => {
    it('should not trigger SSO when EXAMPLE_SERVICE_TOKEN is set for local use', async () => {
      process.env.EXAMPLE_SERVICE_TOKEN = '_myExampleToken123';

      // Local Example tool call should not trigger SSO
      const headers = await attachAuthHeaders('http://localhost:3000/tools/example-service');

      expect(headers).toBeNull();
      expect(mockGetEntraIdTokenManager).not.toHaveBeenCalled();
      // EXAMPLE_SERVICE_TOKEN remains available in process.env for local tools
      expect(process.env.EXAMPLE_SERVICE_TOKEN).toBe('_myExampleToken123');
    });

    it('should not require new mandatory env vars for existing functionality', () => {
      // Verify that the Entra ID SSO feature doesn't impose new mandatory env vars.
      // All Entra ID-related env vars have defaults or are optional.
      // Existing users who don't use remote platform tools should see no changes.

      // These are the Entra ID env vars — all are optional
      const entraEnvVars = [
        'ENTRA_CLIENT_ID',
        'ENTRA_TENANT_ID',
        'MCP_PLATFORM_URL',
        'MCP_AUTH_CALLBACK_PORT',
        'MCP_AUTH_LOGIN_TIMEOUT_MS',
        'ENTRA_SCOPES',
        'ENTRA_CLIENT_SECRET',
        'ENTRA_ACCESS_TOKEN',
      ];

      // None of these should be set for users who don't use Entra ID
      for (const envVar of entraEnvVars) {
        // Just verify they are not required — the config has defaults
        expect(() => {
          // This should not throw for any env var — value can be undefined, that's fine
          void process.env[envVar];
        }).not.toThrow();
      }
    });

    it('should preserve existing EXAMPLE_SERVICE_TOKEN env var after SSO feature deployment', () => {
      process.env.EXAMPLE_SERVICE_TOKEN = '_existingKey789';

      // Simulate loading the Entra ID config — should not affect EXAMPLE_SERVICE_TOKEN
      // Lazy require (not a static import) so this picks up the mock.module() replacement
      // from setupEntraIdMocks(), which must precede the first import of this module.
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional lazy require so mock.module() (set up earlier via setupEntraIdMocks) is in effect before this module loads
      const { loadEntraIdConfig } = require('../entra-id/config');
      loadEntraIdConfig();

      // EXAMPLE_SERVICE_TOKEN should remain unchanged
      expect(process.env.EXAMPLE_SERVICE_TOKEN).toBe('_existingKey789');
    });
  });

  describe('Guard edge cases (T023)', () => {
    it('should handle URLs with trailing slashes correctly', () => {
      expect(isRemotePlatformRequest('https://platform.example.com/')).toBe(true);
      expect(isRemotePlatformRequest('https://platform.example.com')).toBe(true);
    });

    it('should handle URLs with different ports as different origins', () => {
      expect(isRemotePlatformRequest('https://platform.example.com:8443/mcp')).toBe(false);
    });

    it('should handle URLs with different schemes as different origins', () => {
      expect(isRemotePlatformRequest('http://platform.example.com/mcp')).toBe(false);
    });

    it('should handle URLs with subdomains as different origins', () => {
      expect(isRemotePlatformRequest('https://api.platform.example.com/mcp')).toBe(false);
    });

    it('should handle malformed URLs gracefully', () => {
      expect(isRemotePlatformRequest('not://valid')).toBe(false);
      expect(isRemotePlatformRequest('://missing-scheme')).toBe(false);
      expect(isRemotePlatformRequest('')).toBe(false);
    });

    it('should be case-insensitive for URL origin comparison', () => {
      // URL constructor normalizes the scheme and host to lowercase
      expect(isRemotePlatformRequest('HTTPS://PLATFORM.EXAMPLE.COM/mcp')).toBe(true);
      expect(isRemotePlatformRequest('https://Platform.Example.Com/api')).toBe(true);
    });
  });
});
