/**
 * Unit tests for Entra ID config with embedded credentials and env var overrides.
 *
 * Tests that loadEntraIdConfig() properly sources client ID and client secret
 * from env vars or falls back to defaults. In test builds, EMBEDDED_CREDENTIAL_CONTEXT
 * is empty (defined as "{}" in bunfig.toml), so embedded defaults are empty strings.
 * The build pipeline tests verify that actual embedded credentials are injected.
 *
 * NOTE: This test does NOT import test-utils/mocks because it needs the REAL
 * loadEntraIdConfig implementation. Other test files call setupEntraIdMocks()
 * which uses mock.module() to replace entra-id/config globally (Bun's mock.module
 * leaks across test files in the same process). We use require() to capture
 * the real module reference before any mock.module() pollution takes effect.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

// Import the real module reference captured in mocks.ts BEFORE mock.module()
// pollution from setupEntraIdMocks() takes effect. Bun's mock.module() leaks
// across test files in the same process, so we use the pre-captured reference
// from mocks.ts (which loads before any setupEntraIdMocks() calls).
import { realLoadEntraIdConfig as loadEntraIdConfig } from '../../../test-utils/mocks';

describe('Entra ID Config', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save env vars
    savedEnv.ENTRA_CLIENT_ID = process.env.ENTRA_CLIENT_ID;
    savedEnv.ENTRA_CLIENT_SECRET = process.env.ENTRA_CLIENT_SECRET;
    savedEnv.ENTRA_TENANT_ID = process.env.ENTRA_TENANT_ID;
    savedEnv.MCP_PLATFORM_URL = process.env.MCP_PLATFORM_URL;
    savedEnv.MCP_AUTH_CALLBACK_PORT = process.env.MCP_AUTH_CALLBACK_PORT;
    savedEnv.MCP_AUTH_LOGIN_TIMEOUT_MS = process.env.MCP_AUTH_LOGIN_TIMEOUT_MS;
    savedEnv.ENTRA_SCOPES = process.env.ENTRA_SCOPES;

    // Clear env vars to test defaults
    delete process.env.ENTRA_CLIENT_ID;
    delete process.env.ENTRA_CLIENT_SECRET;
    delete process.env.ENTRA_TENANT_ID;
    delete process.env.MCP_PLATFORM_URL;
    delete process.env.MCP_AUTH_CALLBACK_PORT;
    delete process.env.MCP_AUTH_LOGIN_TIMEOUT_MS;
    delete process.env.ENTRA_SCOPES;
  });

  afterEach(() => {
    // Restore env vars
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
    mock.restore();
  });

  describe('env var overrides', () => {
    it('should use ENTRA_CLIENT_ID env var when set', () => {
      process.env.ENTRA_CLIENT_ID = 'env-client-id';
      const config = loadEntraIdConfig();
      expect(config.clientId).toBe('env-client-id');
    });

    it('should use ENTRA_CLIENT_SECRET env var when set', () => {
      process.env.ENTRA_CLIENT_SECRET = 'env-client-secret';
      const config = loadEntraIdConfig();
      expect(config.clientSecret).toBe('env-client-secret');
    });

    it('should use ENTRA_TENANT_ID env var when set', () => {
      process.env.ENTRA_TENANT_ID = 'env-tenant-id';
      const config = loadEntraIdConfig();
      expect(config.tenantId).toBe('env-tenant-id');
    });

    it('should use MCP_PLATFORM_URL env var when set', () => {
      process.env.MCP_PLATFORM_URL = 'https://custom-platform.com';
      const config = loadEntraIdConfig();
      expect(config.platformUrl).toBe('https://custom-platform.com');
    });

    it('should use MCP_AUTH_CALLBACK_PORT env var when set', () => {
      process.env.MCP_AUTH_CALLBACK_PORT = '8888';
      const config = loadEntraIdConfig();
      expect(config.callbackPort).toBe(8888);
    });

    it('should use MCP_AUTH_LOGIN_TIMEOUT_MS env var when set', () => {
      process.env.MCP_AUTH_LOGIN_TIMEOUT_MS = '60000';
      const config = loadEntraIdConfig();
      expect(config.loginTimeoutMs).toBe(60000);
    });

    it('should parse ENTRA_SCOPES env var', () => {
      process.env.ENTRA_SCOPES = 'openid profile custom_scope';
      const config = loadEntraIdConfig();
      expect(config.scopes).toEqual(['openid', 'profile', 'custom_scope']);
    });
  });

  describe('defaults', () => {
    it('should have correct default callback port', () => {
      const config = loadEntraIdConfig();
      expect(config.callbackPort).toBe(9876);
    });

    it('should have correct default login timeout', () => {
      const config = loadEntraIdConfig();
      expect(config.loginTimeoutMs).toBe(120_000);
    });

    it('should include standard OIDC scopes by default', () => {
      const config = loadEntraIdConfig();
      expect(config.scopes).toContain('openid');
      expect(config.scopes).toContain('profile');
      expect(config.scopes).toContain('email');
      expect(config.scopes).toContain('offline_access');
    });

    it('should fall back to default callback port for invalid value', () => {
      process.env.MCP_AUTH_CALLBACK_PORT = 'not-a-number';
      const config = loadEntraIdConfig();
      expect(config.callbackPort).toBe(9876);
    });

    it('should fall back to default login timeout for invalid value', () => {
      process.env.MCP_AUTH_LOGIN_TIMEOUT_MS = 'not-a-number';
      const config = loadEntraIdConfig();
      expect(config.loginTimeoutMs).toBe(120_000);
    });
  });

  describe('scope building', () => {
    it('should include client ID scope when client ID is provided', () => {
      process.env.ENTRA_CLIENT_ID = 'my-client-id';
      const config = loadEntraIdConfig();
      expect(config.scopes).toContain('my-client-id/.default');
    });

    it('should not include empty client ID scope', () => {
      // No client ID env var, no embedded credentials in test build
      const config = loadEntraIdConfig();
      expect(config.scopes).not.toContain('/.default');
    });
  });
});
