import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { setupStandardMocks } from '../test-utils/mocks';

const { mockFS, mockOs } = setupStandardMocks();

const mockRenameSync = mock(() => {});
mockFS.renameSync = mockRenameSync;
void mock.module('fs', () => ({ default: mockFS, ...mockFS }));
void mock.module('node:fs', () => ({ default: mockFS, ...mockFS }));

import * as updateUtils from '../utils/update-utils';
import * as releaseArtifacts from '../utils/update-pr-artifacts';
import * as updateCheck from '../utils/update-check';
import { PRResolutionError } from '../utils/update-pr-artifacts';
import { install, INSTALL_EXIT_CODES } from './install';

const packageVersion = '2.0.0';

const mockConfirm = mock(() => Promise.resolve(true));
void mock.module('@inquirer/prompts', () => ({ confirm: mockConfirm }));

void mock.module('../env', () => ({
  default: { GITHUB_TOKEN: 'mock-github-token' },
}));

void mock.module('octokit', () => ({
  Octokit: function () {
    return {
      rest: {
        repos: {
          getLatestRelease: () =>
            Promise.resolve({
              data: { tag_name: 'v9.9.9', assets: [{ name: 'qnsc-mcp-macos-arm64', id: 1004 }] },
            }),
          getReleaseByTag: () =>
            Promise.resolve({
              data: { tag_name: 'v1.5.0', assets: [{ name: 'qnsc-mcp-macos-arm64', id: 2001 }] },
            }),
        },
      },
    };
  },
}));

void mock.module('../tools/github', () => ({ GH_API_URL: 'https://mock-github-api.com' }));
void mock.module('../utils/update-lock', () => ({
  acquireUpdateLock: mock(() => true),
  releaseUpdateLock: mock(() => {}),
  UPDATE_LOCK_FILE: '/tmp/.qnscmcp-update.lock',
}));
void mock.module('../utils/update-windows', () => ({
  waitForFileLockRelease: mock(() =>
    Promise.resolve({ canProceed: true, fileLockDetected: false, adminRequired: false }),
  ),
  checkWindowsFileLock: mock(() => ({ isLocked: false, noPermission: false, processes: [] })),
  checkDirectoryWritePermission: mock(() => true),
  getProcessDisplayName: (name: string) => name,
}));
void mock.module('../../package.json', () => ({ version: packageVersion }));

const mockExecSync = mock(() => {});
const mockSpawn = mock(() => ({ unref: mock(() => {}), on: mock(() => {}) }));
void mock.module('node:child_process', () => ({ execSync: mockExecSync, spawn: mockSpawn }));
void mock.module('child_process', () => ({ execSync: mockExecSync, spawn: mockSpawn }));

let platformValue = 'darwin';
let archValue = 'arm64';
mockOs.platform.mockImplementation(() => platformValue);
mockOs.arch.mockImplementation(() => archValue);

Object.defineProperty(process, 'execPath', {
  value: '/usr/local/bin/qnsc-mcp',
  configurable: true,
});

describe('install command', () => {
  let processExitSpy: ReturnType<typeof spyOn>;
  let consoleLogSpy: ReturnType<typeof spyOn>;

  // Join everything written via console.log so tests can assert on the
  // user-facing messages (upgrade/downgrade/reinstall labels, etc.).
  const loggedOutput = () => consoleLogSpy.mock.calls.map((c: any[]) => String(c[0])).join('\n');

  beforeEach(() => {
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    mockConfirm.mockClear();
    mockConfirm.mockImplementation(() => Promise.resolve(true));

    mockFS.existsSync.mockImplementation(() => true);
    mockFS.copyFileSync.mockImplementation(() => {});
    mockFS.mkdtempSync.mockImplementation(() => '/mock-tmp-dir/test');
    mockFS.chmodSync.mockImplementation(() => {});
    mockFS.rmSync.mockImplementation(() => {});
    mockFS.writeFileSync.mockImplementation(() => {});

    platformValue = 'darwin';
    archValue = 'arm64';
  });

  describe('no target (install latest)', () => {
    it('should exit ALREADY_UP_TO_DATE when already on latest', async () => {
      spyOn(updateUtils, 'checkForUpdates').mockResolvedValue({
        hasUpdate: false,
        latestVersion: packageVersion,
        currentVersion: packageVersion,
      });

      try {
        await install({ nonInteractive: true });
      } catch {
        // Intentionally ignored in test
      }
      expect(processExitSpy).toHaveBeenCalledWith(INSTALL_EXIT_CODES.ALREADY_UP_TO_DATE);
    });

    it('should exit SUCCESS when update is available and confirmed', async () => {
      spyOn(updateUtils, 'checkForUpdates').mockResolvedValue({
        hasUpdate: true,
        latestVersion: '9.9.9',
        currentVersion: packageVersion,
        assetId: 1004,
        owner: 'quynhonsemiconductor',
        repo: 'mcp-tools',
        authToken: 'mock-token',
      });
      spyOn(updateUtils, 'downloadAndApplyUpdate').mockResolvedValue({ success: true });

      try {
        await install({ nonInteractive: true });
      } catch {
        // Intentionally ignored in test
      }
      expect(processExitSpy).toHaveBeenCalledWith(INSTALL_EXIT_CODES.SUCCESS);
    });

    it('should exit NO_AUTH_TOKEN on auth_failed', async () => {
      spyOn(updateUtils, 'checkForUpdates').mockResolvedValue({
        hasUpdate: false,
        latestVersion: '0.0.0',
        currentVersion: packageVersion,
        error: 'auth_failed',
      });

      try {
        await install({ nonInteractive: true });
      } catch {
        // Intentionally ignored in test
      }
      expect(processExitSpy).toHaveBeenCalledWith(INSTALL_EXIT_CODES.NO_AUTH_TOKEN);
    });
  });

  describe('version target', () => {
    it('should install a specific version successfully', async () => {
      spyOn(releaseArtifacts, 'fetchReleaseByVersion').mockResolvedValue({
        assetId: 2001,
        owner: 'quynhonsemiconductor',
        repo: 'mcp-tools',
        version: '1.5.0',
        authToken: 'mock-token',
      });
      const downloadSpy = spyOn(updateUtils, 'downloadAndApplyUpdate').mockResolvedValue({
        success: true,
      });

      try {
        await install({ target: 'v1.5.0', nonInteractive: true });
      } catch {
        // Intentionally ignored in test
      }
      expect(processExitSpy).toHaveBeenCalledWith(INSTALL_EXIT_CODES.SUCCESS);
      // Pin the downloader wiring — a dropped assetId/authToken would otherwise
      // surface as a misleading DOWNLOAD_FAILED in prod while tests stayed green.
      expect(downloadSpy).toHaveBeenCalledWith({
        owner: 'quynhonsemiconductor',
        repo: 'mcp-tools',
        assetId: 2001,
        toVersion: '1.5.0',
        authToken: 'mock-token',
        nonInteractive: true,
      });
    });

    it('should accept version without leading v', async () => {
      spyOn(releaseArtifacts, 'fetchReleaseByVersion').mockResolvedValue({
        assetId: 2001,
        owner: 'quynhonsemiconductor',
        repo: 'mcp-tools',
        version: '1.5.0',
        authToken: 'mock-token',
      });
      spyOn(updateUtils, 'downloadAndApplyUpdate').mockResolvedValue({ success: true });

      try {
        await install({ target: '1.5.0', nonInteractive: true });
      } catch {
        // Intentionally ignored in test
      }
      expect(processExitSpy).toHaveBeenCalledWith(INSTALL_EXIT_CODES.SUCCESS);
    });

    it('should normalize a messy version target before resolving the tag', async () => {
      const fetchSpy = spyOn(releaseArtifacts, 'fetchReleaseByVersion').mockResolvedValue({
        assetId: 2001,
        owner: 'quynhonsemiconductor',
        repo: 'mcp-tools',
        version: '1.2.3',
        authToken: 'mock-token',
      });
      spyOn(updateUtils, 'downloadAndApplyUpdate').mockResolvedValue({ success: true });

      // "vv1.2.3" would 404 as a raw tag; it must be normalized to "1.2.3".
      try {
        await install({ target: 'vv1.2.3', nonInteractive: true });
      } catch {
        // Intentionally ignored in test
      }
      expect(fetchSpy).toHaveBeenCalledWith('1.2.3');
    });

    it('should exit GENERAL_ERROR on invalid semver target', async () => {
      try {
        await install({ target: 'notaversion', nonInteractive: true });
      } catch {
        // Intentionally ignored in test
      }
      // First exit call — the mocked process.exit throws, so asserting the
      // first call (not "has been called with") is what actually pins the code.
      expect(processExitSpy.mock.calls[0]?.[0]).toBe(INSTALL_EXIT_CODES.GENERAL_ERROR);
    });

    it('should exit GENERAL_ERROR when version not found', async () => {
      spyOn(releaseArtifacts, 'fetchReleaseByVersion').mockResolvedValue({ error: 'not_found' });

      try {
        await install({ target: 'v0.0.1', nonInteractive: true });
      } catch {
        // Intentionally ignored in test
      }
      expect(processExitSpy.mock.calls[0]?.[0]).toBe(INSTALL_EXIT_CODES.GENERAL_ERROR);
    });

    it('should exit GENERAL_ERROR on the default/api_error branch', async () => {
      spyOn(releaseArtifacts, 'fetchReleaseByVersion').mockResolvedValue({ error: 'api_error' });

      try {
        await install({ target: 'v1.5.0', nonInteractive: true });
      } catch {
        // Intentionally ignored in test
      }
      expect(processExitSpy.mock.calls[0]?.[0]).toBe(INSTALL_EXIT_CODES.GENERAL_ERROR);
    });

    it('should exit NO_AUTH_TOKEN on auth error from fetchReleaseByVersion', async () => {
      spyOn(releaseArtifacts, 'fetchReleaseByVersion').mockResolvedValue({ error: 'no_auth' });

      try {
        await install({ target: 'v1.5.0', nonInteractive: true });
      } catch {
        // Intentionally ignored in test
      }
      expect(processExitSpy.mock.calls[0]?.[0]).toBe(INSTALL_EXIT_CODES.NO_AUTH_TOKEN);
    });

    it('should exit NO_PLATFORM_ASSET when platform asset missing', async () => {
      spyOn(releaseArtifacts, 'fetchReleaseByVersion').mockResolvedValue({
        error: 'no_platform_asset',
      });

      try {
        await install({ target: 'v1.5.0', nonInteractive: true });
      } catch {
        // Intentionally ignored in test
      }
      expect(processExitSpy.mock.calls[0]?.[0]).toBe(INSTALL_EXIT_CODES.NO_PLATFORM_ASSET);
    });

    it('should skip confirmation with --force', async () => {
      spyOn(releaseArtifacts, 'fetchReleaseByVersion').mockResolvedValue({
        assetId: 2001,
        owner: 'quynhonsemiconductor',
        repo: 'mcp-tools',
        version: '1.5.0',
        authToken: 'mock-token',
      });
      spyOn(updateUtils, 'downloadAndApplyUpdate').mockResolvedValue({ success: true });

      try {
        await install({ target: 'v1.5.0', force: true });
      } catch {
        // Intentionally ignored in test
      }
      expect(mockConfirm).not.toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(INSTALL_EXIT_CODES.SUCCESS);
    });
  });

  describe('PR target', () => {
    it('should install a PR build successfully', async () => {
      const artifactInfo = {
        artifactId: 5001,
        artifactName: 'qnsc-mcp-macos-arm64',
        prNumber: 899,
        runId: 100,
        headSha: 'abc1234',
        authToken: 'mock-token',
      };
      spyOn(releaseArtifacts, 'resolvePRArtifact').mockResolvedValue(artifactInfo);
      const downloadSpy = spyOn(updateUtils, 'downloadAndApplyPRUpdate').mockResolvedValue({
        success: true,
      });

      try {
        await install({ target: 'pr899', nonInteractive: true });
      } catch {
        // Intentionally ignored in test
      }
      expect(processExitSpy).toHaveBeenCalledWith(INSTALL_EXIT_CODES.SUCCESS);
      // Pin the downloader wiring — the resolved artifact must be handed off intact.
      expect(downloadSpy).toHaveBeenCalledWith({ artifactInfo, nonInteractive: true });
    });

    it('should exit DOWNLOAD_FAILED when PR artifact download fails', async () => {
      spyOn(releaseArtifacts, 'resolvePRArtifact').mockResolvedValue({
        artifactId: 5001,
        artifactName: 'qnsc-mcp-macos-arm64',
        prNumber: 899,
        runId: 100,
        headSha: 'abc1234',
        authToken: 'mock-token',
      });
      spyOn(updateUtils, 'downloadAndApplyPRUpdate').mockResolvedValue({
        success: false,
        failureReason: 'download_failed',
      });

      try {
        await install({ target: 'pr899', nonInteractive: true });
      } catch {
        // Intentionally ignored in test
      }
      expect(processExitSpy).toHaveBeenCalledWith(INSTALL_EXIT_CODES.DOWNLOAD_FAILED);
    });

    it('should exit NO_AUTH_TOKEN when PRResolutionError has no_auth code', async () => {
      spyOn(releaseArtifacts, 'resolvePRArtifact').mockRejectedValue(
        new PRResolutionError('Authentication required', 'no_auth'),
      );

      try {
        await install({ target: 'pr899', nonInteractive: true });
      } catch {
        // Intentionally ignored in test
      }
      expect(processExitSpy).toHaveBeenCalledWith(INSTALL_EXIT_CODES.NO_AUTH_TOKEN);
    });

    it('should exit GENERAL_ERROR when PRResolutionError has non-auth code', async () => {
      spyOn(releaseArtifacts, 'resolvePRArtifact').mockRejectedValue(
        new PRResolutionError('PR not found', 'pr_not_found'),
      );

      try {
        await install({ target: 'pr899', nonInteractive: true });
      } catch {
        // Intentionally ignored in test
      }
      expect(processExitSpy).toHaveBeenCalledWith(INSTALL_EXIT_CODES.GENERAL_ERROR);
    });

    it('should exit CI_IN_PROGRESS when CI is building and no previous run exists', async () => {
      spyOn(releaseArtifacts, 'resolvePRArtifact').mockResolvedValue({
        ciInProgress: true,
        latestSha: 'def5678',
        previousRun: undefined,
      });

      try {
        await install({ target: 'pr899', nonInteractive: true });
      } catch {
        // Intentionally ignored in test
      }
      expect(processExitSpy).toHaveBeenCalledWith(INSTALL_EXIT_CODES.CI_IN_PROGRESS);
    });

    it('should install the previous build with --force when CI is in progress', async () => {
      const previousRun = {
        artifactId: 5002,
        artifactName: 'qnsc-mcp-macos-arm64',
        prNumber: 899,
        runId: 99,
        headSha: 'old1234',
        authToken: 'mock-token',
      };
      spyOn(releaseArtifacts, 'resolvePRArtifact').mockResolvedValue({
        ciInProgress: true,
        latestSha: 'def5678',
        previousRun,
      });
      const downloadSpy = spyOn(updateUtils, 'downloadAndApplyPRUpdate').mockResolvedValue({
        success: true,
      });

      // --force is the explicit opt-in to install the older build.
      try {
        await install({ target: 'pr899', force: true, nonInteractive: true });
      } catch {
        // Intentionally ignored in test
      }
      // The *previous* run's artifact must be the one handed to the downloader.
      expect(downloadSpy).toHaveBeenCalledWith({ artifactInfo: previousRun, nonInteractive: true });
      expect(processExitSpy).toHaveBeenCalledWith(INSTALL_EXIT_CODES.SUCCESS);
    });

    it('should exit CI_IN_PROGRESS (not silently install the previous build) when non-interactive without --force', async () => {
      const previousRun = {
        artifactId: 5002,
        artifactName: 'qnsc-mcp-macos-arm64',
        prNumber: 899,
        runId: 99,
        headSha: 'old1234',
        authToken: 'mock-token',
      };
      spyOn(releaseArtifacts, 'resolvePRArtifact').mockResolvedValue({
        ciInProgress: true,
        latestSha: 'def5678',
        previousRun,
      });
      const downloadSpy = spyOn(updateUtils, 'downloadAndApplyPRUpdate');

      try {
        await install({ target: 'pr899', nonInteractive: true });
      } catch {
        // Intentionally ignored in test
      }
      // A non-interactive run must not silently substitute an older commit.
      expect(downloadSpy).not.toHaveBeenCalled();
      expect(processExitSpy.mock.calls[0]?.[0]).toBe(INSTALL_EXIT_CODES.CI_IN_PROGRESS);
    });

    it('should not download when CI is in progress, a previous run exists, and the user declines', async () => {
      spyOn(releaseArtifacts, 'resolvePRArtifact').mockResolvedValue({
        ciInProgress: true,
        latestSha: 'def5678',
        previousRun: {
          artifactId: 5002,
          artifactName: 'qnsc-mcp-macos-arm64',
          prNumber: 899,
          runId: 99,
          headSha: 'old1234',
          authToken: 'mock-token',
        },
      });
      mockConfirm.mockImplementation(() => Promise.resolve(false));
      const downloadSpy = spyOn(updateUtils, 'downloadAndApplyPRUpdate');

      await install({ target: 'pr899' });
      expect(downloadSpy).not.toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should install the previous build when the user accepts interactively', async () => {
      const previousRun = {
        artifactId: 5002,
        artifactName: 'qnsc-mcp-macos-arm64',
        prNumber: 899,
        runId: 99,
        headSha: 'old1234',
        authToken: 'mock-token',
      };
      spyOn(releaseArtifacts, 'resolvePRArtifact').mockResolvedValue({
        ciInProgress: true,
        latestSha: 'def5678',
        previousRun,
      });
      mockConfirm.mockImplementation(() => Promise.resolve(true));
      const downloadSpy = spyOn(updateUtils, 'downloadAndApplyPRUpdate').mockResolvedValue({
        success: true,
      });

      // Interactive (no flags): accepting the confirm prompt installs the previous build.
      try {
        await install({ target: 'pr899' });
      } catch {
        // Intentionally ignored in test
      }
      expect(downloadSpy).toHaveBeenCalledWith({
        artifactInfo: previousRun,
        nonInteractive: undefined,
      });
      expect(processExitSpy).toHaveBeenCalledWith(INSTALL_EXIT_CODES.SUCCESS);
    });

    it('should skip confirmation with --force on PR installs', async () => {
      spyOn(releaseArtifacts, 'resolvePRArtifact').mockResolvedValue({
        artifactId: 5001,
        artifactName: 'qnsc-mcp-macos-arm64',
        prNumber: 899,
        runId: 100,
        headSha: 'abc1234',
        authToken: 'mock-token',
      });
      spyOn(updateUtils, 'downloadAndApplyPRUpdate').mockResolvedValue({ success: true });

      try {
        await install({ target: 'pr899', force: true });
      } catch {
        // Intentionally ignored in test
      }
      expect(mockConfirm).not.toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(INSTALL_EXIT_CODES.SUCCESS);
    });

    it('should not download a PR build when user cancels confirmation', async () => {
      spyOn(releaseArtifacts, 'resolvePRArtifact').mockResolvedValue({
        artifactId: 5001,
        artifactName: 'qnsc-mcp-macos-arm64',
        prNumber: 899,
        runId: 100,
        headSha: 'abc1234',
        authToken: 'mock-token',
      });
      mockConfirm.mockImplementation(() => Promise.resolve(false));
      const downloadSpy = spyOn(updateUtils, 'downloadAndApplyPRUpdate');

      await install({ target: 'pr899' });
      expect(downloadSpy).not.toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });

  describe('version target — download and cancellation', () => {
    it('should exit DOWNLOAD_FAILED when version install download fails', async () => {
      spyOn(releaseArtifacts, 'fetchReleaseByVersion').mockResolvedValue({
        assetId: 2001,
        owner: 'quynhonsemiconductor',
        repo: 'mcp-tools',
        version: '1.5.0',
        authToken: 'mock-token',
      });
      spyOn(updateUtils, 'downloadAndApplyUpdate').mockResolvedValue({
        success: false,
        failureReason: 'download_failed',
      });

      try {
        await install({ target: 'v1.5.0', nonInteractive: true });
      } catch {
        // Intentionally ignored in test
      }
      expect(processExitSpy.mock.calls[0]?.[0]).toBe(INSTALL_EXIT_CODES.DOWNLOAD_FAILED);
    });

    it('should exit NO_AUTH_TOKEN when fetchReleaseByVersion returns forbidden', async () => {
      spyOn(releaseArtifacts, 'fetchReleaseByVersion').mockResolvedValue({ error: 'forbidden' });

      try {
        await install({ target: 'v1.5.0', nonInteractive: true });
      } catch {
        // Intentionally ignored in test
      }
      expect(processExitSpy.mock.calls[0]?.[0]).toBe(INSTALL_EXIT_CODES.NO_AUTH_TOKEN);
    });

    it('should not call downloadAndApplyUpdate when user cancels confirmation', async () => {
      spyOn(releaseArtifacts, 'fetchReleaseByVersion').mockResolvedValue({
        assetId: 2001,
        owner: 'quynhonsemiconductor',
        repo: 'mcp-tools',
        version: '1.5.0',
        authToken: 'mock-token',
      });
      mockConfirm.mockImplementation(() => Promise.resolve(false));
      const downloadSpy = spyOn(updateUtils, 'downloadAndApplyUpdate');

      await install({ target: 'v1.5.0' });
      expect(downloadSpy).not.toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });

  describe('version target — upgrade/downgrade/reinstall label', () => {
    // package.json is mocked to 2.0.0 (getPackageVersion), so the current
    // version is 2.0.0 unless a test overrides it.
    const releaseFor = (version: string) => ({
      assetId: 2001,
      owner: 'quynhonsemiconductor',
      repo: 'mcp-tools',
      version,
      authToken: 'mock-token',
    });

    it('should label an older target version as a downgrade', async () => {
      spyOn(releaseArtifacts, 'fetchReleaseByVersion').mockResolvedValue(releaseFor('1.5.0'));
      spyOn(updateUtils, 'downloadAndApplyUpdate').mockResolvedValue({ success: true });

      try {
        await install({ target: 'v1.5.0', force: true });
      } catch {
        // Intentionally ignored in test
      }
      expect(loggedOutput()).toContain('downgrade');
      expect(loggedOutput()).not.toContain('upgrade');
    });

    it('should label a newer target version as an upgrade', async () => {
      spyOn(releaseArtifacts, 'fetchReleaseByVersion').mockResolvedValue(releaseFor('2.5.0'));
      spyOn(updateUtils, 'downloadAndApplyUpdate').mockResolvedValue({ success: true });

      try {
        await install({ target: 'v2.5.0', force: true });
      } catch {
        // Intentionally ignored in test
      }
      expect(loggedOutput()).toContain('upgrade');
      expect(loggedOutput()).not.toContain('downgrade');
    });

    it('should label the current version as a reinstall', async () => {
      spyOn(releaseArtifacts, 'fetchReleaseByVersion').mockResolvedValue(
        releaseFor(packageVersion),
      );
      spyOn(updateUtils, 'downloadAndApplyUpdate').mockResolvedValue({ success: true });

      try {
        await install({ target: `v${packageVersion}`, force: true });
      } catch {
        // Intentionally ignored in test
      }
      expect(loggedOutput()).toContain('reinstalling current version');
    });

    it('should not throw when the current version is not valid semver', async () => {
      // getPackageVersion can return process.env.APP_VERSION (e.g. "dev"),
      // which is not valid semver. The `comparable` guard must prevent
      // semver.eq/lt from throwing; without it the install aborts with a
      // generic error even though the release was fetched fine.
      spyOn(updateCheck, 'getPackageVersion').mockReturnValue('dev');
      spyOn(releaseArtifacts, 'fetchReleaseByVersion').mockResolvedValue(releaseFor('1.5.0'));
      spyOn(updateUtils, 'downloadAndApplyUpdate').mockResolvedValue({ success: true });

      try {
        await install({ target: 'v1.5.0', force: true });
      } catch {
        // Intentionally ignored in test
      }
      expect(processExitSpy.mock.calls[0]?.[0]).toBe(INSTALL_EXIT_CODES.SUCCESS);
    });
  });
});
