import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { setupStandardMocks } from '../test-utils/mocks';

// Set up the standard mocks BEFORE importing update-utils
const { mockFS, mockOs } = setupStandardMocks();

// Add renameSync mock that's missing from standard mocks
const mockRenameSync = mock(() => {});
mockFS.renameSync = mockRenameSync;
void mock.module('fs', () => ({ default: mockFS, ...mockFS }));
void mock.module('node:fs', () => ({ default: mockFS, ...mockFS }));

import * as updateUtils from '../utils/update-utils';
const { checkForUpdates, downloadAndApplyUpdate } = updateUtils;
import { update, UPDATE_EXIT_CODES } from './update';

// Mocked package version for testing
const packageVersion = '1.0.0';

// Mock inquirer confirm
const mockConfirm = mock(() => Promise.resolve(true));
void mock.module('@inquirer/prompts', () => ({
  confirm: mockConfirm,
}));

// Mock env module directly to ensure consistent behavior in all environments
void mock.module('../env', () => ({
  default: {
    GITHUB_TOKEN: 'mock-github-token',
  },
}));

// Console spies - will be set up in beforeEach to survive mock.restore()
let _consoleLogSpy: ReturnType<typeof spyOn>;
let _consoleErrorSpy: ReturnType<typeof spyOn>;

// Mock release data
const MOCK_RELEASE_DATA = {
  tag_name: 'v9.9.9',
  assets: [
    { name: 'qnsc-mcp-linux-x64', id: 1001 },
    { name: 'qnsc-mcp-linux-arm64', id: 1002 },
    { name: 'qnsc-mcp-macos-x64', id: 1003 },
    { name: 'qnsc-mcp-macos-arm64', id: 1004 },
    { name: 'qnsc-mcp-win-x64.exe', id: 1005 },
  ],
};

// Mock Octokit directly for Docker compatibility
// Track constructor args to verify auth token passthrough
const octokitConstructorCalls: any[] = [];
void mock.module('octokit', () => ({
  Octokit: function (options: any) {
    octokitConstructorCalls.push(options);
    return {
      rest: {
        repos: {
          getLatestRelease: () => Promise.resolve({ data: MOCK_RELEASE_DATA }),
          getReleaseByTag: () => Promise.resolve({ data: MOCK_RELEASE_DATA }),
          getReleaseAsset: () => Promise.resolve({ data: Buffer.from('mock binary data') }),
        },
      },
    };
  },
}));

// Mock GitHub API URL
void mock.module('../tools/github', () => ({
  GH_API_URL: 'https://mock-github-api.com',
}));

// Platform control - override the standard mock values as needed
let platformValue = 'darwin';
let archValue = 'arm64';

// Override the standard mock values
mockOs.platform.mockImplementation(() => platformValue);
mockOs.arch.mockImplementation(() => archValue);

// Process mock
Object.defineProperty(process, 'execPath', {
  value: '/usr/local/bin/qnsc-mcp',
  configurable: true,
});

// We need to add execSync and spawn to standard mocks
const mockExecSync = mock(() => {});
const mockSpawnOn = mock(() => {});
const mockSpawn = mock(() => ({
  unref: mock(() => {}),
  on: mockSpawnOn,
}));
void mock.module('node:child_process', () => ({
  execSync: mockExecSync,
  spawn: mockSpawn,
}));
void mock.module('child_process', () => ({
  execSync: mockExecSync,
  spawn: mockSpawn,
}));

// Use the real crypto module - mocking it breaks other tests (e.g., oauth-handler tests)
// that rely on crypto.randomBytes and crypto.createHash working correctly.
// The update tests don't actually need to mock crypto.

// Mock readline for the interactive wait loop
const mockRlOn = mock(() => {});
const mockRlClose = mock(() => {});
const mockCreateInterface = mock(() => ({
  on: mockRlOn,
  close: mockRlClose,
}));
void mock.module('node:readline', () => ({
  default: { createInterface: mockCreateInterface },
  createInterface: mockCreateInterface,
}));

// Mock update-lock module
const mockAcquireUpdateLock = mock(() => true);
const mockReleaseUpdateLock = mock(() => {});
void mock.module('../utils/update-lock', () => ({
  acquireUpdateLock: mockAcquireUpdateLock,
  releaseUpdateLock: mockReleaseUpdateLock,
  UPDATE_LOCK_FILE: '/tmp/.qnscmcp-update.lock',
}));

// Mock update-windows module
// IMPORTANT: getProcessDisplayName must preserve real behavior to avoid breaking other tests
// (mock.module is global and affects all test files that import this module)
const mockWaitForFileLockRelease = mock(() =>
  Promise.resolve({ canProceed: true, fileLockDetected: false, adminRequired: false }),
);

// Inline implementation of getProcessDisplayName to preserve real behavior in the mock
// This is necessary because mock.module is global and we can't import the real function
// before mocks are set up without causing module loading issues
const PROCESS_DISPLAY_NAMES: Record<string, string> = {
  code: 'VS Code',
  'code.exe': 'VS Code',
  'code - insiders': 'VS Code Insiders',
  'code - insiders.exe': 'VS Code Insiders',
  cursor: 'Cursor',
  'cursor.exe': 'Cursor',
  windsurf: 'Windsurf',
  'windsurf.exe': 'Windsurf',
  zed: 'Zed',
  'zed.exe': 'Zed',
  idea64: 'IntelliJ IDEA',
  'idea64.exe': 'IntelliJ IDEA',
  idea: 'IntelliJ IDEA',
  'idea.exe': 'IntelliJ IDEA',
  webstorm64: 'WebStorm',
  'webstorm64.exe': 'WebStorm',
  webstorm: 'WebStorm',
  'webstorm.exe': 'WebStorm',
  pycharm64: 'PyCharm',
  'pycharm64.exe': 'PyCharm',
  pycharm: 'PyCharm',
  'pycharm.exe': 'PyCharm',
  goland64: 'GoLand',
  'goland64.exe': 'GoLand',
  rider64: 'Rider',
  'rider64.exe': 'Rider',
  clion64: 'CLion',
  'clion64.exe': 'CLion',
  rubymine64: 'RubyMine',
  'rubymine64.exe': 'RubyMine',
  phpstorm64: 'PhpStorm',
  'phpstorm64.exe': 'PhpStorm',
  nvim: 'Neovim',
  'nvim.exe': 'Neovim',
  sublime_text: 'Sublime Text',
  'sublime_text.exe': 'Sublime Text',
  atom: 'Atom',
  'atom.exe': 'Atom',
};

const mockGetProcessDisplayName = (processName: string): string => {
  const lowerName = processName.toLowerCase();
  if (PROCESS_DISPLAY_NAMES[lowerName]) {
    return PROCESS_DISPLAY_NAMES[lowerName];
  }
  if (lowerName.includes('insiders')) {
    return 'VS Code Insiders';
  }
  if (lowerName.includes('idea')) {
    return 'IntelliJ IDEA';
  }
  if (lowerName.includes('webstorm')) {
    return 'WebStorm';
  }
  if (lowerName.includes('pycharm')) {
    return 'PyCharm';
  }
  return processName;
};

void mock.module('../utils/update-windows', () => ({
  waitForFileLockRelease: mockWaitForFileLockRelease,
  checkWindowsFileLock: mock(() => ({ isLocked: false, noPermission: false, processes: [] })),
  checkDirectoryWritePermission: mock(() => true),
  getProcessDisplayName: mockGetProcessDisplayName,
}));

// We need to mock the os module BEFORE update-utils is imported
void mock.module('node:os', () => ({
  default: mockOs,
  ...mockOs,
}));
void mock.module('os', () => ({
  default: mockOs,
  ...mockOs,
}));

// Mock package.json require
void mock.module('../../package.json', () => ({
  version: packageVersion,
}));

describe('Update Command', () => {
  beforeEach(() => {
    _consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    _consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});

    mockExecSync.mockClear();
    mockFS.existsSync.mockClear();
    mockConfirm.mockClear();
    mockConfirm.mockImplementation(() => Promise.resolve(true));

    platformValue = 'darwin';
    archValue = 'arm64';

    mockFS.existsSync.mockImplementation(() => true);
    mockRenameSync.mockClear();
    mockRenameSync.mockImplementation(() => {});

    mockSpawn.mockReset();
    mockSpawnOn.mockClear();
    mockSpawn.mockImplementation(() => ({
      unref: mock(() => {}),
      on: mockSpawnOn,
    }));

    mockRlOn.mockClear();
    mockRlClose.mockClear();
    octokitConstructorCalls.length = 0;
  });

  describe('update functionality', () => {
    it('should have the correct basic mock setup', () => {
      expect(typeof checkForUpdates).toBe('function');
      expect(typeof downloadAndApplyUpdate).toBe('function');
      expect(mockFS.existsSync).toBeDefined();
      expect(mockFS.copyFileSync).toBeDefined();
      expect(mockFS.chmodSync).toBeDefined();
      expect(mockFS.rmSync).toBeDefined();
    });
  });

  describe('downloadAndApplyUpdate', () => {
    it('should download and apply an update successfully on macOS', async () => {
      platformValue = 'darwin';
      archValue = 'arm64';

      mockFS.copyFileSync.mockImplementation(() => {});
      mockFS.mkdtempSync.mockImplementation(() => '/mock-tmp-dir/test');
      mockFS.chmodSync.mockImplementation(() => {});
      mockFS.rmSync.mockImplementation(() => {});
      mockFS.writeFileSync.mockImplementation(() => {});

      const result = await downloadAndApplyUpdate({
        owner: 'quynhonsemiconductor',
        repo: 'mcp-tools',
        assetId: 1004,
      });

      expect(result).toEqual({ success: true });
      expect(mockFS.copyFileSync).toHaveBeenCalled();
      expect(mockFS.chmodSync).toHaveBeenCalled();
    });

    it('should call execSync for xattr on macOS', async () => {
      platformValue = 'darwin';
      archValue = 'arm64';

      mockFS.copyFileSync.mockImplementation(() => {});
      mockFS.mkdtempSync.mockImplementation(() => '/mock-tmp-dir/test');
      mockFS.chmodSync.mockImplementation(() => {});
      mockFS.rmSync.mockImplementation(() => {});
      mockFS.writeFileSync.mockImplementation(() => {});
      mockExecSync.mockClear();

      await downloadAndApplyUpdate({
        owner: 'quynhonsemiconductor',
        repo: 'mcp-tools',
        assetId: 1004,
      });

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('xattr'),
        expect.anything(),
      );
    });

    // Note: Lock file tests removed - they rely on mocking internal modules which is
    // fragile with bun's module mocking system and relative imports. The lock
    // functionality is tested through the update-lock.test.ts unit tests.

    describe('Windows update flow', () => {
      // Note: The Windows update code now uses a synchronous rename-then-replace strategy
      // instead of spawning a background PowerShell script. These tests verify that
      // the new approach doesn't write .ps1 files or spawn PowerShell processes.

      it('should not write PowerShell scripts for Windows updates', async () => {
        platformValue = 'win32';
        archValue = 'x64';

        const writtenPaths: string[] = [];
        mockFS.writeFileSync.mockImplementation((path: string) => {
          writtenPaths.push(path);
        });
        mockFS.mkdtempSync.mockImplementation(() => '/mock-tmp-dir/qnscmcp-update-abc');
        mockFS.statSync.mockImplementation(() => ({ size: 12345 }));
        mockFS.readFileSync.mockImplementation(() => Buffer.from('mock binary data'));
        mockFS.existsSync.mockImplementation(() => false);

        await downloadAndApplyUpdate({
          owner: 'quynhonsemiconductor',
          repo: 'mcp-tools',
          assetId: 1005,
        });

        // Should NOT have written any .ps1 PowerShell scripts
        const ps1Files = writtenPaths.filter((p) => p.endsWith('.ps1'));
        expect(ps1Files.length).toBe(0);
      });

      it('should not spawn PowerShell processes', async () => {
        platformValue = 'win32';
        archValue = 'x64';

        mockFS.writeFileSync.mockImplementation(() => {});
        mockFS.mkdtempSync.mockImplementation(() => '/mock-tmp-dir/qnscmcp-update-abc');
        mockFS.statSync.mockImplementation(() => ({ size: 12345 }));
        mockFS.readFileSync.mockImplementation(() => Buffer.from('mock binary data'));
        mockFS.existsSync.mockImplementation(() => false);

        mockSpawn.mockClear();

        await downloadAndApplyUpdate({
          owner: 'quynhonsemiconductor',
          repo: 'mcp-tools',
          assetId: 1005,
        });

        // If spawn was called, it should NOT have been for PowerShell
        const powershellCalls = mockSpawn.mock.calls.filter((call: any[]) => call[0] === 'powershell.exe');
        expect(powershellCalls.length).toBe(0);
      });
    });

    it('should use authToken instead of getAuthToken when provided', async () => {
      platformValue = 'darwin';
      archValue = 'arm64';

      mockFS.copyFileSync.mockImplementation(() => {});
      mockFS.mkdtempSync.mockImplementation(() => '/mock-tmp-dir/test');
      mockFS.chmodSync.mockImplementation(() => {});
      mockFS.rmSync.mockImplementation(() => {});
      mockFS.writeFileSync.mockImplementation(() => {});

      await downloadAndApplyUpdate({
        owner: 'quynhonsemiconductor',
        repo: 'mcp-tools',
        assetId: 1004,
        authToken: 'oauth-resolved-token',
      });

      // The Octokit constructor used for the download should receive the pre-resolved token
      const downloadCall = octokitConstructorCalls.find(
        (call) => call?.auth === 'oauth-resolved-token',
      );
      expect(downloadCall).toBeDefined();
    });

    it('should not show lock warning on non-Windows platforms', async () => {
      platformValue = 'darwin';
      archValue = 'arm64';

      const consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});

      mockFS.existsSync.mockImplementation(() => true);
      mockFS.mkdtempSync.mockImplementation(() => '/mock-tmp-dir/qnscmcp-update-abc');
      mockFS.writeFileSync.mockImplementation(() => {});
      mockFS.copyFileSync.mockImplementation(() => {});
      mockFS.chmodSync.mockImplementation(() => {});
      mockFS.rmSync.mockImplementation(() => {});

      await downloadAndApplyUpdate({
        owner: 'quynhonsemiconductor',
        repo: 'mcp-tools',
        assetId: 1004,
      });

      const warnCalls = consoleWarnSpy.mock.calls.map((call) => call[0]);
      const hasLockWarning = warnCalls.some(
        (call: string) => call && typeof call === 'string' && call.includes('currently in use'),
      );
      expect(hasLockWarning).toBe(false);

      consoleWarnSpy.mockRestore();
    });
  });

  describe('update() command error paths', () => {
    let processExitSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      processExitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
    });

    it('should exit with NO_AUTH_TOKEN on auth_failed error', async () => {
      spyOn(updateUtils, 'checkForUpdates').mockResolvedValue({
        hasUpdate: false,
        latestVersion: '0.0.0',
        currentVersion: '1.0.0',
        error: 'auth_failed',
      });

      try {
        await update({ nonInteractive: true });
      } catch {
        // Expected — process.exit throws
      }

      expect(processExitSpy).toHaveBeenCalledWith(UPDATE_EXIT_CODES.NO_AUTH_TOKEN);
    });

    it('should exit with GENERAL_ERROR on api_error', async () => {
      spyOn(updateUtils, 'checkForUpdates').mockResolvedValue({
        hasUpdate: false,
        latestVersion: '0.0.0',
        currentVersion: '1.0.0',
        error: 'api_error',
      });

      try {
        await update({ nonInteractive: true });
      } catch {
        // Expected — process.exit throws
      }

      expect(processExitSpy).toHaveBeenCalledWith(UPDATE_EXIT_CODES.GENERAL_ERROR);
    });

    it('should exit with NO_AUTH_TOKEN on no_auth error', async () => {
      spyOn(updateUtils, 'checkForUpdates').mockResolvedValue({
        hasUpdate: false,
        latestVersion: '0.0.0',
        currentVersion: '1.0.0',
        error: 'no_auth',
      });

      try {
        await update({ nonInteractive: true });
      } catch {
        // Expected — process.exit throws
      }

      expect(processExitSpy).toHaveBeenCalledWith(UPDATE_EXIT_CODES.NO_AUTH_TOKEN);
    });
  });

  describe('update() target redirect', () => {
    let processExitSpy: ReturnType<typeof spyOn>;
    let errorSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      processExitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      // The deprecation notice goes to stderr (logError) so it's visible to
      // scripts running --non-interactive.
      errorSpy = spyOn(console, 'error').mockImplementation(() => {});
    });

    it('deprecates "update pr<num>", points at install (on stderr), and does not check for updates', async () => {
      const checkSpy = spyOn(updateUtils, 'checkForUpdates');

      try {
        await update({ target: 'pr899', nonInteractive: true });
      } catch {
        // Expected — process.exit throws
      }

      expect(processExitSpy).toHaveBeenCalledWith(UPDATE_EXIT_CODES.GENERAL_ERROR);
      // A target short-circuits before any update-latest check.
      expect(checkSpy).not.toHaveBeenCalled();
      // Visible on stderr even in --non-interactive mode.
      expect(errorSpy.mock.calls.map((c: any[]) => c.join(' ')).join('\n')).toContain(
        'qnsc-mcp install pr899',
      );
    });

    it('rejects a non-PR target and points at install', async () => {
      const checkSpy = spyOn(updateUtils, 'checkForUpdates');

      try {
        await update({ target: 'v1.2.3' });
      } catch {
        // Expected — process.exit throws
      }

      expect(processExitSpy).toHaveBeenCalledWith(UPDATE_EXIT_CODES.GENERAL_ERROR);
      expect(checkSpy).not.toHaveBeenCalled();
    });
  });
});
