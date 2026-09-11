import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import '../test-utils/mocks';

// --- Module-level mocks (must be before import of module under test) ---

const mockGetEmbeddedGenericSecret = mock(() => 'test-embedded-token' as string | undefined);
void mock.module('../services/auth/embedded-credentials', () => ({
  getEmbeddedGenericSecret: mockGetEmbeddedGenericSecret,
}));

void mock.module('../tools/github', () => ({
  GH_API_URL: 'https://mock-api.github.com',
}));

// Mock Octokit — controlled per-test
const mockPullsGet = mock(() =>
  Promise.resolve({
    data: {
      head: { sha: 'abc1234567890', ref: 'feature-branch' },
    },
  }),
);

const mockListWorkflowRuns = mock(() =>
  Promise.resolve({
    data: { workflow_runs: [] as any[] },
  }),
);

const mockListWorkflowRunArtifacts = mock(() =>
  Promise.resolve({
    data: { artifacts: [] as any[] },
  }),
);

const mockDownloadArtifact = mock(() =>
  Promise.resolve({
    data: new ArrayBuffer(0),
  }),
);

const mockGetReleaseByTag = mock(() =>
  Promise.resolve({
    data: {
      tag_name: 'v1.5.0',
      assets: [{ name: 'qnsc-mcp-test-platform', id: 2001 }],
    },
  }),
);

void mock.module('octokit', () => ({
  Octokit: function () {
    return {
      rest: {
        pulls: { get: mockPullsGet },
        actions: {
          listWorkflowRuns: mockListWorkflowRuns,
          listWorkflowRunArtifacts: mockListWorkflowRunArtifacts,
          downloadArtifact: mockDownloadArtifact,
        },
        repos: {
          getReleaseByTag: mockGetReleaseByTag,
        },
      },
    };
  },
}));

// --- Import module under test AFTER mocks ---

import {
  parsePRTarget,
  resolvePRArtifact,
  PRResolutionError,
  fetchReleaseByVersion,
} from './update-pr-artifacts';
// Import as namespace so we can spyOn (avoids global mock.module pollution)
import * as tokenManagerModule from '../tools/github/auth/token-manager';
import * as updatePlatformModule from './update-platform';

// Token manager mock — set up via spyOn (not mock.module) to avoid poisoning other tests
const mockGetToken = mock(() => Promise.resolve('oauth-token' as string | null));
const mockTokenManager = { getToken: mockGetToken } as any;

// Use a consistent test platform name across all environments (CI is linux, local may be darwin)
const TEST_BINARY_NAME = 'qnsc-mcp-test-platform';

describe('update-pr-artifacts', () => {
  beforeEach(() => {
    mockGetEmbeddedGenericSecret.mockReset();
    mockGetEmbeddedGenericSecret.mockReturnValue('test-embedded-token');
    mockGetToken.mockReset();
    mockGetToken.mockImplementation(() => Promise.resolve('oauth-token'));
    spyOn(tokenManagerModule, 'getGitHubTokenManager').mockReturnValue(mockTokenManager);
    // Use consistent platform info regardless of CI environment (linux) vs local (darwin)
    spyOn(updatePlatformModule, 'getPlatformInfo').mockReturnValue({
      platform: 'test',
      arch: 'x64',
      binaryName: TEST_BINARY_NAME,
    });
    mockPullsGet.mockReset();
    mockPullsGet.mockImplementation(() =>
      Promise.resolve({
        data: {
          head: { sha: 'abc1234567890', ref: 'feature-branch' },
        },
      }),
    );
    mockListWorkflowRuns.mockReset();
    mockListWorkflowRuns.mockImplementation(() =>
      Promise.resolve({
        data: { workflow_runs: [] },
      }),
    );
    mockListWorkflowRunArtifacts.mockReset();
    mockListWorkflowRunArtifacts.mockImplementation(() =>
      Promise.resolve({
        data: { artifacts: [] },
      }),
    );
    delete process.env.GITHUB_TOKEN;
  });

  describe('parsePRTarget', () => {
    it('parses "pr899" into 899', () => {
      expect(parsePRTarget('pr899')).toBe(899);
    });

    it('parses "PR123" (uppercase) into 123', () => {
      expect(parsePRTarget('PR123')).toBe(123);
    });

    it('parses "Pr42" (mixed case) into 42', () => {
      expect(parsePRTarget('Pr42')).toBe(42);
    });

    it('returns null for "foo" (no pr prefix)', () => {
      expect(parsePRTarget('foo')).toBeNull();
    });

    it('returns null for "pr" (no number)', () => {
      expect(parsePRTarget('pr')).toBeNull();
    });

    it('returns null for "pr0" (zero)', () => {
      expect(parsePRTarget('pr0')).toBeNull();
    });

    it('returns null for "123" (number only, no prefix)', () => {
      expect(parsePRTarget('123')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parsePRTarget('')).toBeNull();
    });

    it('returns null for "pr-5" (negative)', () => {
      expect(parsePRTarget('pr-5')).toBeNull();
    });
  });

  describe('resolvePRArtifact', () => {
    it('throws no_auth when no token is available', async () => {
      mockGetEmbeddedGenericSecret.mockReturnValue(undefined);
      // Also ensure OAuth fallback returns nothing
      mockGetToken.mockImplementation(() => {
        throw new Error('No stored token available');
      });

      try {
        await resolvePRArtifact(899);
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error).toBeInstanceOf(PRResolutionError);
        expect(error.code).toBe('no_auth');
      }
    });

    it('throws pr_not_found when PR returns 404', async () => {
      mockPullsGet.mockImplementation(() => {
        const error: any = new Error('Not Found');
        error.status = 404;
        throw error;
      });

      try {
        await resolvePRArtifact(99999);
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(PRResolutionError);
        expect(error.code).toBe('pr_not_found');
        expect(error.message).toContain('PR #99999 not found');
      }
    });

    it('throws api_error when PR fetch fails with non-404', async () => {
      mockPullsGet.mockImplementation(() => {
        const error: any = new Error('Server Error');
        error.status = 500;
        throw error;
      });

      try {
        await resolvePRArtifact(899);
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(PRResolutionError);
        expect(error.code).toBe('api_error');
      }
    });

    it('throws no_runs when no workflow runs exist', async () => {
      // Both SHA search and branch search return empty
      mockListWorkflowRuns.mockImplementation(() =>
        Promise.resolve({
          data: { workflow_runs: [] },
        }),
      );

      try {
        await resolvePRArtifact(899);
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(PRResolutionError);
        expect(error.code).toBe('no_runs');
        expect(error.message).toContain('No workflow runs found');
      }
    });

    it('throws no_platform_artifact when no matching artifact exists', async () => {
      mockListWorkflowRuns.mockImplementation(() =>
        Promise.resolve({
          data: {
            workflow_runs: [
              {
                id: 1001,
                head_sha: 'abc1234567890',
                conclusion: 'success',
                status: 'completed',
              },
            ],
          },
        }),
      );

      // Return artifacts that don't match the test platform name
      mockListWorkflowRunArtifacts.mockImplementation(() =>
        Promise.resolve({
          data: {
            artifacts: [
              { id: 2001, name: 'qnsc-mcp-other-platform', expired: false },
              { id: 2002, name: 'qnsc-mcp-another-platform', expired: false },
            ],
          },
        }),
      );

      try {
        await resolvePRArtifact(899);
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(PRResolutionError);
        expect(error.code).toBe('no_platform_artifact');
        expect(error.message).toContain(TEST_BINARY_NAME);
      }
    });

    it('throws artifact_expired when artifact has expired', async () => {
      mockListWorkflowRuns.mockImplementation(() =>
        Promise.resolve({
          data: {
            workflow_runs: [
              {
                id: 1001,
                head_sha: 'abc1234567890',
                conclusion: 'success',
                status: 'completed',
              },
            ],
          },
        }),
      );

      mockListWorkflowRunArtifacts.mockImplementation(() =>
        Promise.resolve({
          data: {
            artifacts: [{ id: 2001, name: 'qnsc-mcp-test-platform', expired: true }],
          },
        }),
      );

      try {
        await resolvePRArtifact(899);
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(PRResolutionError);
        expect(error.code).toBe('artifact_expired');
        expect(error.message).toContain('expired');
      }
    });

    it('returns PRArtifactInfo for successful run with matching artifact', async () => {
      mockListWorkflowRuns.mockImplementation(() =>
        Promise.resolve({
          data: {
            workflow_runs: [
              {
                id: 1001,
                head_sha: 'abc1234567890',
                conclusion: 'success',
                status: 'completed',
              },
            ],
          },
        }),
      );

      mockListWorkflowRunArtifacts.mockImplementation(() =>
        Promise.resolve({
          data: {
            artifacts: [
              { id: 2001, name: 'qnsc-mcp-test-platform', expired: false },
              { id: 2002, name: 'qnsc-mcp-linux-x64', expired: false },
            ],
          },
        }),
      );

      const result = await resolvePRArtifact(899);

      // Should be a PRArtifactInfo (not PRArtifactPending)
      expect('ciInProgress' in result).toBe(false);
      const info = result as any;
      expect(info.artifactId).toBe(2001);
      expect(info.artifactName).toBe('qnsc-mcp-test-platform');
      expect(info.prNumber).toBe(899);
      expect(info.runId).toBe(1001);
      expect(info.headSha).toBe('abc1234567890');
      expect(info.authToken).toBe('test-embedded-token');
      expect(info.warning).toBeUndefined();
    });

    it('retries with the keyring OAuth token when the quick token is rejected (401)', async () => {
      // Quick (embedded) token is rejected on the first authenticated call
      // (pulls.get); the keyring OAuth token succeeds and is used for the rest.
      mockPullsGet.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { status: 401 }));
      mockListWorkflowRuns.mockImplementation(() =>
        Promise.resolve({
          data: {
            workflow_runs: [
              { id: 1001, head_sha: 'abc1234567890', conclusion: 'success', status: 'completed' },
            ],
          },
        }),
      );
      mockListWorkflowRunArtifacts.mockImplementation(() =>
        Promise.resolve({
          data: { artifacts: [{ id: 2001, name: 'qnsc-mcp-test-platform', expired: false }] },
        }),
      );

      const result = await resolvePRArtifact(899);

      expect('ciInProgress' in result).toBe(false);
      const info = result as any;
      expect(info.artifactId).toBe(2001);
      expect(info.authToken).toBe('oauth-token');
      expect(mockPullsGet).toHaveBeenCalledTimes(2);
    });

    it('throws no_auth when every candidate token is rejected (401/403)', async () => {
      mockPullsGet.mockImplementation(() =>
        Promise.reject(Object.assign(new Error('Forbidden'), { status: 403 })),
      );

      try {
        await resolvePRArtifact(899);
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(PRResolutionError);
        expect(error.code).toBe('no_auth');
      }
    });

    it('returns warning when falling back to a non-successful run', async () => {
      mockListWorkflowRuns.mockImplementation(() =>
        Promise.resolve({
          data: {
            workflow_runs: [
              {
                id: 1001,
                head_sha: 'abc1234567890',
                conclusion: 'failure',
                status: 'completed',
              },
            ],
          },
        }),
      );

      mockListWorkflowRunArtifacts.mockImplementation(() =>
        Promise.resolve({
          data: {
            artifacts: [{ id: 2001, name: 'qnsc-mcp-test-platform', expired: false }],
          },
        }),
      );

      const result = await resolvePRArtifact(899);

      expect('ciInProgress' in result).toBe(false);
      const info = result as any;
      expect(info.artifactId).toBe(2001);
      expect(info.warning).toContain('failure');
    });

    it('returns PRArtifactPending when CI is in progress with no previous build', async () => {
      mockListWorkflowRuns.mockImplementation(() =>
        Promise.resolve({
          data: {
            workflow_runs: [
              {
                id: 1001,
                head_sha: 'abc1234567890',
                conclusion: null,
                status: 'in_progress',
              },
            ],
          },
        }),
      );

      const result = await resolvePRArtifact(899);

      expect('ciInProgress' in result).toBe(true);
      const pending = result as any;
      expect(pending.ciInProgress).toBe(true);
      expect(pending.latestSha).toBe('abc1234567890');
      expect(pending.previousRun).toBeUndefined();
    });

    it('returns PRArtifactPending with previousRun when CI is in progress and older build exists', async () => {
      let callCount = 0;
      mockListWorkflowRuns.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: runs for the latest SHA — only in_progress
          return Promise.resolve({
            data: {
              workflow_runs: [
                {
                  id: 1001,
                  head_sha: 'abc1234567890',
                  conclusion: null,
                  status: 'in_progress',
                },
              ] as any[],
            },
          });
        }
        // Second call: branch search for previous successful runs
        return Promise.resolve({
          data: {
            workflow_runs: [
              {
                id: 900,
                head_sha: 'def5678901234',
                conclusion: 'success',
                status: 'completed',
              },
            ] as any[],
          },
        });
      });

      mockListWorkflowRunArtifacts.mockImplementation(() =>
        Promise.resolve({
          data: {
            artifacts: [{ id: 3001, name: 'qnsc-mcp-test-platform', expired: false }],
          },
        }),
      );

      const result = await resolvePRArtifact(899);

      expect('ciInProgress' in result).toBe(true);
      const pending = result as any;
      expect(pending.ciInProgress).toBe(true);
      expect(pending.latestSha).toBe('abc1234567890');
      expect(pending.previousRun).toBeDefined();
      expect(pending.previousRun.headSha).toBe('def5678901234');
      expect(pending.previousRun.artifactId).toBe(3001);
    });
  });

  describe('fetchReleaseByVersion', () => {
    beforeEach(() => {
      mockGetReleaseByTag.mockClear();
      mockGetReleaseByTag.mockImplementation(() =>
        Promise.resolve({
          data: {
            tag_name: 'v1.5.0',
            assets: [{ name: 'qnsc-mcp-test-platform', id: 2001 }],
          },
        }),
      );
    });

    it('should return asset info for a valid version on the test platform', async () => {
      const result = await fetchReleaseByVersion('1.5.0');
      expect('error' in result).toBe(false);
      if (!('error' in result)) {
        expect(result.version).toBe('1.5.0');
        expect(result.assetId).toBe(2001);
        expect(result.owner).toBe('quynhonsemiconductor');
        expect(result.repo).toBe('mcp-tools');
        // authToken is the only thing authorizing the private-release asset
        // download; a regression dropping it surfaces as a misleading
        // DOWNLOAD_FAILED, so pin it here.
        expect(result.authToken).toBe('test-embedded-token');
      }
    });

    it('should request the v-prefixed tag for the resolved version', async () => {
      await fetchReleaseByVersion('1.5.0');
      expect(mockGetReleaseByTag).toHaveBeenCalledWith({
        owner: 'quynhonsemiconductor',
        repo: 'mcp-tools',
        tag: 'v1.5.0',
      });
    });

    it('should return not_found when release does not exist', async () => {
      mockGetReleaseByTag.mockRejectedValueOnce(
        Object.assign(new Error('Not Found'), { status: 404 }),
      );
      const result = await fetchReleaseByVersion('0.0.1');
      expect(result).toEqual({ error: 'not_found' });
    });

    it('should return no_auth on 401 when no keyring fallback token exists', async () => {
      mockGetToken.mockImplementation(() => Promise.resolve(null));
      mockGetReleaseByTag.mockRejectedValueOnce(
        Object.assign(new Error('Unauthorized'), { status: 401 }),
      );
      const result = await fetchReleaseByVersion('1.5.0');
      expect(result).toEqual({ error: 'no_auth' });
    });

    it('should return forbidden (not no_auth) on 403 when no keyring fallback token exists', async () => {
      mockGetToken.mockImplementation(() => Promise.resolve(null));
      mockGetReleaseByTag.mockRejectedValueOnce(
        Object.assign(new Error('Forbidden'), { status: 403 }),
      );
      const result = await fetchReleaseByVersion('1.5.0');
      expect(result).toEqual({ error: 'forbidden' });
    });

    it('should retry with the keyring OAuth token when the quick token is rejected (401)', async () => {
      // Embedded/quick token is rejected, but a valid keyring OAuth token
      // succeeds — the scenario where `update` works but `install <version>`
      // used to fail with misleading "set GITHUB_TOKEN" advice.
      mockGetToken.mockImplementation(() => Promise.resolve('oauth-token'));
      mockGetReleaseByTag.mockRejectedValueOnce(
        Object.assign(new Error('Unauthorized'), { status: 401 }),
      );
      const result = await fetchReleaseByVersion('1.5.0');
      expect('error' in result).toBe(false);
      if (!('error' in result)) {
        expect(result.authToken).toBe('oauth-token');
        expect(result.assetId).toBe(2001);
      }
      expect(mockGetReleaseByTag).toHaveBeenCalledTimes(2);
    });

    it('should return no_auth when both the quick token and the OAuth fallback are rejected', async () => {
      mockGetToken.mockImplementation(() => Promise.resolve('oauth-token'));
      mockGetReleaseByTag.mockRejectedValue(
        Object.assign(new Error('Unauthorized'), { status: 401 }),
      );
      const result = await fetchReleaseByVersion('1.5.0');
      expect(result).toEqual({ error: 'no_auth' });
      expect(mockGetReleaseByTag).toHaveBeenCalledTimes(2);
    });

    it('should return api_error on unexpected error', async () => {
      mockGetReleaseByTag.mockRejectedValueOnce(
        Object.assign(new Error('Server Error'), { status: 500 }),
      );
      const result = await fetchReleaseByVersion('1.5.0');
      expect(result).toEqual({ error: 'api_error' });
    });

    it('should return no_platform_asset when binary not found in release assets', async () => {
      mockGetReleaseByTag.mockResolvedValueOnce({
        data: {
          tag_name: 'v1.5.0',
          assets: [{ name: 'qnsc-mcp-linux-x64', id: 9001 }],
        },
      });
      const result = await fetchReleaseByVersion('1.5.0');
      expect(result).toEqual({ error: 'no_platform_asset' });
    });
  });
});
