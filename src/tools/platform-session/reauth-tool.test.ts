/**
 * Tests for the service re-authentication MCP tool (T026).
 *
 * Verifies tool structure, schema validation, service-to-provider routing,
 * case-insensitive matching, and execute behavior using mock dependencies.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { MockUserError, setupStandardMocks } from '../../test-utils/mocks';

setupStandardMocks();

// Mock the auth module before importing the tool
const mockReauthenticate = mock(() => Promise.resolve('fresh-token-abc'));
const mockGetToken = mock(() => Promise.resolve('mock-token'));
const mockTokenManager = { getToken: mockGetToken };
const mockGetEntraIdTokenManager = mock(() => Promise.resolve(mockTokenManager));

// The sign-in call is injected into the tool rather than mocked at module level.
// Three test files register competing factories for this module and Bun keeps
// whichever ran last process-wide, so a module mock here was overwritten by one
// that omits `reauthenticate` — passing 9 tests locally and failing them on Linux.

import { ReauthSchema, ReauthTool, SERVICE_TO_PROVIDER, SUPPORTED_PROVIDERS } from './reauth-tool';

describe('ReauthTool', () => {
  let tool: ReauthTool;

  beforeEach(() => {
    tool = new ReauthTool(mockReauthenticate);
    mockReauthenticate.mockClear();
    mockReauthenticate.mockResolvedValue('fresh-token-abc');
  });

  afterEach(() => {
    mock.restore();
  });

  it('should be defined', () => {
    expect(tool).toBeDefined();
  });

  it('should have an execute method', () => {
    expect(tool).toHaveProperty('execute');
    expect(typeof tool.execute).toBe('function');
  });

  describe('schema validation', () => {
    it('should accept a service string', () => {
      const result = ReauthSchema.safeParse({ service: 'Platform' });
      expect(result.success).toBe(true);
    });

    it('should reject missing service', () => {
      const result = ReauthSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject non-string service', () => {
      const result = ReauthSchema.safeParse({ service: 123 });
      expect(result.success).toBe(false);
    });
  });

  describe('service-to-provider mapping', () => {
    it('should map "platform" to entra', () => {
      expect(SERVICE_TO_PROVIDER['platform']).toBe('entra');
    });

    it('should map "entra" to entra', () => {
      expect(SERVICE_TO_PROVIDER['entra']).toBe('entra');
    });

    it('should not map services whose servers are not part of this build', () => {
      for (const removed of ['slack', 'new relic', 'newrelic', 'lucid']) {
        expect(SERVICE_TO_PROVIDER[removed]).toBeUndefined();
      }
    });

    it('should map every declared service to a supported provider', () => {
      for (const provider of Object.values(SERVICE_TO_PROVIDER)) {
        expect(SUPPORTED_PROVIDERS.has(provider)).toBe(true);
      }
    });

    it('should only have entra as a supported provider for now', () => {
      expect(SUPPORTED_PROVIDERS.has('entra')).toBe(true);
      expect(SUPPORTED_PROVIDERS.size).toBe(1);
    });
  });

  describe('execute — Entra ID (Platform) services', () => {
    it('should re-authenticate when service is "Platform"', async () => {
      const result = await tool.execute({ service: 'Platform' });

      expect(mockReauthenticate).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.tokenAcquired).toBe(true);
      expect(parsed.provider).toBe('Entra ID SSO');
      expect(parsed.service).toBe('Platform');
      expect(parsed.message).toContain('Re-authentication successful');
      expect(typeof parsed.elapsedMs).toBe('number');
    });

    it('should be case-insensitive ("platform" vs "Platform")', async () => {
      const result = await tool.execute({ service: 'platform' });

      expect(mockReauthenticate).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
    });

    it('should handle mixed case ("PLATFORM")', async () => {
      const result = await tool.execute({ service: 'PLATFORM' });

      expect(mockReauthenticate).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.provider).toBe('Entra ID SSO');
    });

    it('should handle "Entra" as a service name', async () => {
      const result = await tool.execute({ service: 'Entra' });

      expect(mockReauthenticate).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
    });

    it('should trim whitespace from service name', async () => {
      const result = await tool.execute({ service: '  Platform  ' });

      expect(mockReauthenticate).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
    });

    it('should include elapsed time in response', async () => {
      mockReauthenticate.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve('token'), 10)),
      );

      const result = await tool.execute({ service: 'Platform' });
      const parsed = JSON.parse(result);
      expect(parsed.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle reauthenticate returning empty token', async () => {
      mockReauthenticate.mockResolvedValue('');

      const result = await tool.execute({ service: 'Platform' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.tokenAcquired).toBe(false);
    });
  });

  describe('execute — unknown service', () => {
    it('should return failure for unknown service', async () => {
      const result = await tool.execute({ service: 'UnknownService' });

      expect(mockReauthenticate).not.toHaveBeenCalled();
      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.message).toContain('Unknown service');
      expect(parsed.message).toContain('UnknownService');
    });

    it('should list known services in the error message', async () => {
      const result = await tool.execute({ service: 'FooBar' });
      const parsed = JSON.parse(result);

      expect(parsed.message).toContain('platform');
      expect(parsed.message).toContain('entra');
    });
  });

  describe('execute — services removed from this build', () => {
    it.each([['Slack'], ['New Relic'], ['Lucid']])(
      'should report %s as an unknown service, not as unsupported',
      async (service) => {
        const result = await tool.execute({ service });

        expect(mockReauthenticate).not.toHaveBeenCalled();
        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(false);
        expect(parsed.message).toContain('Unknown service');
        expect(parsed.message).not.toContain('not yet supported');
      },
    );
  });

  describe('execute — error handling', () => {
    it('should propagate error when reauthenticate fails', async () => {
      mockReauthenticate.mockRejectedValue(new Error('SSO login timed out'));

      try {
        await tool.execute({ service: 'Platform' });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(MockUserError);
        expect(error instanceof Error ? error.message : String(error)).toContain(
          'SSO login timed out',
        );
      }
    });

    it('should propagate error when user cancels authentication', async () => {
      mockReauthenticate.mockRejectedValue(
        new Error('Entra ID OAuth flow failed: User cancelled authentication'),
      );

      try {
        await tool.execute({ service: 'Platform' });
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(MockUserError);
        expect(error instanceof Error ? error.message : String(error)).toContain(
          'User cancelled',
        );
      }
    });
  });
});
