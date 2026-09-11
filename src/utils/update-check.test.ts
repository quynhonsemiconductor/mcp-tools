import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
// Standard mocks are auto-initialized on import; calling setupStandardMocks() again is
// safe. It returns the same fs/path/os objects with their members refreshed, so a later
// call cannot invalidate another file's mockFS reference — see
// test-utils/mocks.stability.test.ts for the invariant.
import '../test-utils/mocks';

// --- Module-level mocks (must be before import of update-check) ---
// IMPORTANT: Only mock modules that no other test file directly tests.
// For shared modules (token-manager, etc.), use spyOn after import instead.
// See CLAUDE.md: "prefer spyOn in lieu of mock.module as the latter is global"

// Mock embedded credentials
const mockGetEmbeddedGenericSecret = mock(() => undefined as string | undefined);
void mock.module('../services/auth/embedded-credentials', () => ({
  getEmbeddedGenericSecret: mockGetEmbeddedGenericSecret,
}));

// Mock GitHub API URL
void mock.module('../tools/github', () => ({
  GH_API_URL: 'https://mock-api.github.com',
}));

// update-platform is NOT mocked — it uses os.platform()/os.arch() which are already
// mocked by standard mocks (darwin/arm64), so getPlatformInfo returns the correct values.
// Mocking it via mock.module would poison other test files sharing this bun process.

// Mock package.json version
void mock.module('../../package.json', () => ({
  version: '3.6.0',
}));

// Octokit mock — controlled per-test via mockGetLatestRelease
const MOCK_RELEASE = {
  tag_name: 'v3.7.0',
  assets: [
    { name: 'qnsc-mcp-macos-arm64', id: 1001 },
    { name: 'qnsc-mcp-linux-x64', id: 1002 },
  ],
};

const mockGetLatestRelease = mock(() => Promise.resolve({ data: MOCK_RELEASE }));
void mock.module('octokit', () => ({
  Octokit: function () {
    return {
      rest: {
        repos: {
          getLatestRelease: mockGetLatestRelease,
        },
      },
    };
  },
}));

// --- Import module under test AFTER mocks ---

import { checkForUpdates, getAuthToken } from './update-check';
// Import as namespace so we can spyOn (avoids global mock.module pollution)
import * as tokenManagerModule from '../tools/github/auth/token-manager';
import * as updatePlatformModule from './update-platform';

// Token manager mock — set up via spyOn (not mock.module) to avoid poisoning token-manager.test.ts
const mockGetToken = mock(() => Promise.resolve('oauth-token'));
const mockTokenManager = { getToken: mockGetToken } as any;

describe('update-check', () => {
  beforeEach(() => {
    mockGetEmbeddedGenericSecret.mockReset();
    mockGetEmbeddedGenericSecret.mockReturnValue(undefined);
    mockGetLatestRelease.mockReset();
    mockGetLatestRelease.mockImplementation(() => Promise.resolve({ data: MOCK_RELEASE }));
    mockGetToken.mockReset();
    mockGetToken.mockImplementation(() => Promise.resolve('oauth-token'));
    spyOn(tokenManagerModule, 'getGitHubTokenManager').mockReturnValue(mockTokenManager);
    // Ensure getPlatformInfo returns consistent values regardless of global os mock state
    // (mock.restore() in afterEach can reset os.platform/os.arch mocks between test files)
    spyOn(updatePlatformModule, 'getPlatformInfo').mockReturnValue({
      platform: 'macos',
      arch: 'arm64',
      binaryName: 'qnsc-mcp-macos-arm64',
    });
    delete process.env.GITHUB_TOKEN;
  });

  describe('getAuthToken', () => {
    it('returns embedded token when available', () => {
      mockGetEmbeddedGenericSecret.mockReturnValue('embedded-token');

      const token = getAuthToken();

      expect(token).toBe('embedded-token');
    });

    it('falls back to GITHUB_TOKEN env var', () => {
      process.env.GITHUB_TOKEN = 'env-token';

      const token = getAuthToken();

      expect(token).toBe('env-token');
    });

    it('returns null when no token available', () => {
      const token = getAuthToken();

      expect(token).toBeNull();
    });
  });

  describe('checkForUpdates', () => {
    it('returns update info when quick token succeeds', async () => {
      mockGetEmbeddedGenericSecret.mockReturnValue('embedded-token');

      const result = await checkForUpdates();

      expect(result.hasUpdate).toBe(true);
      expect(result.latestVersion).toBe('3.7.0');
      expect(result.currentVersion).toBe('3.6.0');
      expect(result.authToken).toBe('embedded-token');
      expect(result.error).toBeUndefined();
      expect(result.assetId).toBe(1001);
    });

    it('returns no update when versions match', async () => {
      mockGetEmbeddedGenericSecret.mockReturnValue('embedded-token');
      mockGetLatestRelease.mockImplementation(() =>
        Promise.resolve({ data: { ...MOCK_RELEASE, tag_name: 'v3.6.0' } }),
      );

      const result = await checkForUpdates();

      expect(result.hasUpdate).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it('falls back to OAuth when quick token gets 401', async () => {
      mockGetEmbeddedGenericSecret.mockReturnValue('expired-token');

      let callCount = 0;
      mockGetLatestRelease.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const error: any = new Error('Bad credentials');
          error.status = 401;
          throw error;
        }
        return Promise.resolve({ data: MOCK_RELEASE });
      });

      const result = await checkForUpdates();

      expect(result.hasUpdate).toBe(true);
      expect(result.authToken).toBe('oauth-token');
      expect(result.error).toBeUndefined();
    });

    it('falls back to OAuth when quick token gets 403', async () => {
      mockGetEmbeddedGenericSecret.mockReturnValue('expired-token');

      let callCount = 0;
      mockGetLatestRelease.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const error: any = new Error('Forbidden');
          error.status = 403;
          throw error;
        }
        return Promise.resolve({ data: MOCK_RELEASE });
      });

      const result = await checkForUpdates();

      expect(result.hasUpdate).toBe(true);
      expect(result.authToken).toBe('oauth-token');
    });

    it('returns api_error when quick token gets non-auth error', async () => {
      mockGetEmbeddedGenericSecret.mockReturnValue('some-token');
      mockGetLatestRelease.mockImplementation(() => {
        const error: any = new Error('Network error');
        error.status = 500;
        throw error;
      });

      const result = await checkForUpdates();

      expect(result.error).toBe('api_error');
      expect(result.hasUpdate).toBe(false);
    });

    it('returns auth_failed when both quick token and OAuth token get rejected', async () => {
      mockGetEmbeddedGenericSecret.mockReturnValue('expired-token');
      mockGetLatestRelease.mockImplementation(() => {
        const error: any = new Error('Bad credentials');
        error.status = 401;
        throw error;
      });

      const result = await checkForUpdates();

      expect(result.error).toBe('auth_failed');
      expect(result.hasUpdate).toBe(false);
    });

    it('returns auth_failed when quick token rejected and no OAuth token available', async () => {
      mockGetEmbeddedGenericSecret.mockReturnValue('expired-token');

      let callCount = 0;
      mockGetLatestRelease.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const error: any = new Error('Bad credentials');
          error.status = 401;
          throw error;
        }
        return Promise.resolve({ data: MOCK_RELEASE });
      });

      // OAuth returns nothing
      mockGetToken.mockImplementation(() => {
        throw new Error('No stored token available and interactive OAuth is disabled.');
      });

      const result = await checkForUpdates();

      expect(result.error).toBe('auth_failed');
      expect(result.hasUpdate).toBe(false);
    });

    it('returns no_auth when no token from any source', async () => {
      // No embedded token, no GITHUB_TOKEN, OAuth throws
      mockGetToken.mockImplementation(() => {
        throw new Error('No stored token available and interactive OAuth is disabled.');
      });

      const result = await checkForUpdates();

      expect(result.error).toBe('no_auth');
      expect(result.hasUpdate).toBe(false);
    });

    it('returns api_error when OAuth token gets non-auth error', async () => {
      mockGetEmbeddedGenericSecret.mockReturnValue('expired-token');

      // First call: auth error (triggers fallback)
      // Second call: network error
      let callCount = 0;
      mockGetLatestRelease.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const error: any = new Error('Bad credentials');
          error.status = 401;
          throw error;
        }
        const error: any = new Error('Server error');
        error.status = 500;
        throw error;
      });

      const result = await checkForUpdates();

      expect(result.error).toBe('api_error');
      expect(result.hasUpdate).toBe(false);
    });

    it('passes authToken through in the result for successful quick token', async () => {
      process.env.GITHUB_TOKEN = 'my-github-token';

      const result = await checkForUpdates();

      expect(result.authToken).toBe('my-github-token');
    });

    it('handles prerelease versions by reporting no update', async () => {
      mockGetEmbeddedGenericSecret.mockReturnValue('valid-token');
      mockGetLatestRelease.mockImplementation(() =>
        Promise.resolve({ data: { ...MOCK_RELEASE, tag_name: 'v3.7.0-beta.1' } }),
      );

      const result = await checkForUpdates();

      expect(result.hasUpdate).toBe(false);
      expect(result.error).toBeUndefined();
    });
  });
});
