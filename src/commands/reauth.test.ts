/**
 * Tests for the reauth CLI command.
 *
 * Verifies service routing, case-insensitive matching, unknown/unsupported
 * service handling, success/error output, and exit codes.
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { setupStandardMocks } from '../test-utils/mocks';

setupStandardMocks();

// Mock the auth module before importing the command
const mockReauthenticate = mock(() => Promise.resolve('fresh-token-abc'));
const mockGetToken = mock(() => Promise.resolve('mock-token'));
const mockTokenManager = { getToken: mockGetToken };
const mockGetEntraIdTokenManager = mock(() => Promise.resolve(mockTokenManager));

// The sign-in call is passed to `reauth` rather than mocked at module level; see
// the note in reauth-tool.test.ts for why a module mock could not hold here.

import { reauth, ReauthExitCode } from './reauth';

describe('reauth command', () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    mockReauthenticate.mockClear();
    mockReauthenticate.mockResolvedValue('fresh-token-abc');
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    mock.restore();
  });

  describe('successful re-authentication', () => {
    it('should return SUCCESS for "Platform"', async () => {
      const exitCode = await reauth('Platform', { reauthenticate: mockReauthenticate });

      expect(mockReauthenticate).toHaveBeenCalledTimes(1);
      expect(exitCode).toBe(ReauthExitCode.SUCCESS);
    });

    it('should return SUCCESS for "PLATFORM"', async () => {
      const exitCode = await reauth('PLATFORM', { reauthenticate: mockReauthenticate });

      expect(mockReauthenticate).toHaveBeenCalledTimes(1);
      expect(exitCode).toBe(ReauthExitCode.SUCCESS);
    });

    it('should return SUCCESS for "Entra"', async () => {
      const exitCode = await reauth('Entra', { reauthenticate: mockReauthenticate });

      expect(mockReauthenticate).toHaveBeenCalledTimes(1);
      expect(exitCode).toBe(ReauthExitCode.SUCCESS);
    });

    it('should be case-insensitive ("platform" works)', async () => {
      const exitCode = await reauth('platform', { reauthenticate: mockReauthenticate });

      expect(mockReauthenticate).toHaveBeenCalledTimes(1);
      expect(exitCode).toBe(ReauthExitCode.SUCCESS);
    });

    it('should be case-insensitive ("ENTRA" works)', async () => {
      const exitCode = await reauth('ENTRA', { reauthenticate: mockReauthenticate });

      expect(mockReauthenticate).toHaveBeenCalledTimes(1);
      expect(exitCode).toBe(ReauthExitCode.SUCCESS);
    });

    it('should trim whitespace from service name', async () => {
      const exitCode = await reauth('  Platform  ', { reauthenticate: mockReauthenticate });

      expect(mockReauthenticate).toHaveBeenCalledTimes(1);
      expect(exitCode).toBe(ReauthExitCode.SUCCESS);
    });

    it('should print success message with provider name', async () => {
      await reauth('Platform', { reauthenticate: mockReauthenticate });

      const output = consoleLogSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
      expect(output).toContain('Re-authentication successful');
      expect(output).toContain('Entra ID SSO');
    });
  });

  describe('unknown service', () => {
    it('should return FAILURE for unknown service', async () => {
      const exitCode = await reauth('FooBar', { reauthenticate: mockReauthenticate });

      expect(mockReauthenticate).not.toHaveBeenCalled();
      expect(exitCode).toBe(ReauthExitCode.FAILURE);
    });

    it('should print error with known services list', async () => {
      await reauth('FooBar', { reauthenticate: mockReauthenticate });

      const output = consoleLogSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
      expect(output).toContain('Unknown service');
      expect(output).toContain('FooBar');
      expect(output).toContain('platform');
    });
  });

  describe('unsupported provider', () => {
    it('should return FAILURE for Slack (not yet supported)', async () => {
      const exitCode = await reauth('Slack', { reauthenticate: mockReauthenticate });

      expect(mockReauthenticate).not.toHaveBeenCalled();
      expect(exitCode).toBe(ReauthExitCode.FAILURE);
    });

    it('should print an unknown-service message for Slack', async () => {
      await reauth('Slack', { reauthenticate: mockReauthenticate });

      const output = consoleLogSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
      expect(output).toContain('Unknown service');
      expect(output).not.toContain('Slack OAuth');
    });

    it('should return FAILURE for New Relic', async () => {
      const exitCode = await reauth('New Relic', { reauthenticate: mockReauthenticate });

      expect(mockReauthenticate).not.toHaveBeenCalled();
      expect(exitCode).toBe(ReauthExitCode.FAILURE);
    });

    it('should return FAILURE for Lucid', async () => {
      const exitCode = await reauth('Lucid', { reauthenticate: mockReauthenticate });

      expect(mockReauthenticate).not.toHaveBeenCalled();
      expect(exitCode).toBe(ReauthExitCode.FAILURE);
    });
  });

  describe('error handling', () => {
    it('should return FAILURE when reauthenticate throws', async () => {
      mockReauthenticate.mockRejectedValue(new Error('SSO login timed out'));

      const exitCode = await reauth('Platform', { reauthenticate: mockReauthenticate });
      expect(exitCode).toBe(ReauthExitCode.FAILURE);
    });

    it('should print error message on failure', async () => {
      mockReauthenticate.mockRejectedValue(new Error('SSO login timed out'));

      await reauth('Platform', { reauthenticate: mockReauthenticate });

      const output = consoleLogSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
      expect(output).toContain('Re-authentication failed');
      expect(output).toContain('SSO login timed out');
    });

    it('should handle non-Error throwables', async () => {
      mockReauthenticate.mockRejectedValue('connection lost');

      const exitCode = await reauth('Platform', { reauthenticate: mockReauthenticate });
      expect(exitCode).toBe(ReauthExitCode.FAILURE);
    });

    it('should warn when token is empty', async () => {
      mockReauthenticate.mockResolvedValue('');

      const exitCode = await reauth('Platform', { reauthenticate: mockReauthenticate });
      expect(exitCode).toBe(ReauthExitCode.SUCCESS);

      const output = consoleLogSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
      expect(output).toContain('no token was returned');
    });
  });
});
