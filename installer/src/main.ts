import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn } from 'child_process';
import {
  deobfuscate,
  getInstallConfig as getInstallConfigUtil,
  getShellProfilePath as getShellProfilePathUtil,
  type InstallConfig,
} from './utils';
import { installWindows, installUnix, type PlatformInstallConfig } from './platform-install';
import {
  getLatestRelease,
  downloadBinary,
  fetchExpectedChecksum,
  verifyChecksum,
} from './release';
import {
  getArtifactInfo,
  downloadArtifact,
  fetchArtifactChecksum,
} from './artifact';
import { checkExistingBinary, tryUpdate, evaluateUpdateResult, UPDATE_EXIT_CODES } from './update';

// Embedded releases token (injected at build time)
const OBFUSCATION_KEY = '__OBFUSCATION_KEY_PLACEHOLDER__';
const EMBEDDED_RELEASES_TOKEN = '__RELEASES_TOKEN_PLACEHOLDER__';

// Artifact download configuration (injected at build time for PR builds)
// Type as string to allow comparison after placeholder replacement
const ARTIFACT_SOURCE_MODE: string = '__ARTIFACT_SOURCE_MODE_PLACEHOLDER__';
const WORKFLOW_RUN_ID: string = '__WORKFLOW_RUN_ID_PLACEHOLDER__';

const platform = os.platform();
const arch = os.arch();

/**
 * Result returned from the install IPC handler.
 */
interface InstallResult {
  success: boolean;
  installedPath?: string;
  version?: string;
  wasUpdate?: boolean;
  message?: string;
  error?: string;
  exitCode?: number;
  warnings?: string[];
}

function getReleasesToken(): string | null {
  const token = deobfuscate(EMBEDDED_RELEASES_TOKEN, OBFUSCATION_KEY);
  if (token.startsWith('__') && token.endsWith('__')) {
    return null;
  }
  return token;
}

function getArtifactToken(): string | null {
  if (!isArtifactMode()) return null;
  // Reuse the releases token for artifact downloads (same PAT works for both)
  return getReleasesToken();
}

/**
 * Validate that a workflow run ID is a valid positive integer string.
 * GitHub workflow run IDs are numeric.
 */
function isValidWorkflowRunId(runId: string): boolean {
  // Must be a non-empty string of digits representing a positive integer
  return /^[1-9]\d*$/.test(runId);
}

function isArtifactMode(): boolean {
  return ARTIFACT_SOURCE_MODE === 'artifact' &&
         !WORKFLOW_RUN_ID.startsWith('__') &&
         isValidWorkflowRunId(WORKFLOW_RUN_ID);
}

function getWorkflowRunId(): string {
  if (!isValidWorkflowRunId(WORKFLOW_RUN_ID)) {
    throw new Error(`Invalid workflow run ID: ${WORKFLOW_RUN_ID}. Expected a positive integer.`);
  }
  return WORKFLOW_RUN_ID;
}

function getInstallConfig(): InstallConfig {
  return getInstallConfigUtil(platform, arch);
}

function getShellProfilePath(installDir: string): string | null {
  return getShellProfilePathUtil(installDir, platform, os.homedir(), process.env.SHELL || '/bin/bash', fs.existsSync);
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const preloadPath = path.join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: 600,
    height: 500,
    minWidth: 450,
    minHeight: 400,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: preloadPath,
    },
    icon: path.join(__dirname, '../assets/icon.png'),
  });

  mainWindow.loadFile(path.join(__dirname, '../assets/index.html'));
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

function sendProgress(message: string, percent: number) {
  if (mainWindow) {
    mainWindow.webContents.send('install-progress', { message, percent });
  }
}

async function runPostInstall(binaryPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(binaryPath, ['generate-config'], {
      stdio: 'pipe',
      timeout: 30000,
    });

    let stderr = '';

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve(null);
      } else {
        console.warn('Config generation returned non-zero:', stderr);
        const reason = signal === 'SIGTERM' ? 'timed out' : 'failed';
        const warning = `Configuration generation ${reason}. You can run "qnsc-mcp generate-config" manually after installation.`;
        mainWindow?.webContents.send('install-warning', warning);
        resolve(warning);
      }
    });

    child.on('error', (error) => {
      console.warn('Config generation error:', error);
      const warning = 'Configuration generation failed. You can run "qnsc-mcp generate-config" manually after installation.';
      mainWindow?.webContents.send('install-warning', warning);
      resolve(warning);
    });
  });
}

// IPC Handlers

ipcMain.handle('get-install-info', async () => {
  const config = getInstallConfig();
  const token = getReleasesToken();
  const hasToken = token !== null;
  const artifactMode = isArtifactMode();

  return {
    platform,
    arch,
    binaryName: config.binaryName,
    defaultInstallPath: config.defaultInstallPath,
    requiresElevation: config.requiresElevation,
    hasToken,
    latestVersion: null, // Signal to UI to fetch version separately
    isArtifactMode: artifactMode,
    workflowRunId: artifactMode ? getWorkflowRunId() : null,
  };
});

ipcMain.handle('get-latest-version', async (_event: unknown, beta: boolean = false) => {
  const config = getInstallConfig();

  // In artifact mode, return the PR build info instead of fetching a release
  if (isArtifactMode()) {
    const runId = getWorkflowRunId();
    return { version: `PR build (run ${runId})`, error: null, isArtifactMode: true };
  }

  const token = getReleasesToken();

  try {
    const release = await getLatestRelease(token, config, { beta });
    return { version: release.tagName, error: null, isBeta: release.isPrerelease };
  } catch (e: any) {
    console.error('Failed to fetch latest release:', e);
    return { version: null, error: e.message || 'Failed to fetch version' };
  }
});

ipcMain.handle('select-install-path', async () => {
  const config = getInstallConfig();
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: config.defaultInstallPath,
    title: 'Select Installation Directory',
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('install', async (_event: unknown, installPath: string, addToPath: boolean, beta: boolean = false): Promise<InstallResult> => {
  const config = getInstallConfig();
  const token = getReleasesToken();
  const targetFileName = platform === 'win32' ? 'qnsc-mcp.exe' : 'qnsc-mcp';
  const targetPath = path.join(installPath, targetFileName);

  // Check for existing installation
  sendProgress('Checking for existing installation...', 2);
  const existingVersion = await checkExistingBinary(targetPath);
  const existingBinaryValid = existingVersion !== null;

  // Skip self-update when beta is enabled, since the existing binary's update command
  // doesn't support --beta flag and would update to latest stable instead
  if (existingBinaryValid && !beta) {
    sendProgress('Existing installation found. Checking for updates...', 5);
    const updateResult = await tryUpdate(targetPath);

    const postVersion = updateResult.success && updateResult.exitCode === UPDATE_EXIT_CODES.ALREADY_UP_TO_DATE
      ? await checkExistingBinary(targetPath)
      : null;
    const verdict = evaluateUpdateResult(updateResult, existingVersion, postVersion);

    if (verdict.action === 'updated') {
      sendProgress(verdict.message, 100);
      return {
        success: true,
        installedPath: targetPath,
        version: 'latest',
        wasUpdate: true,
        message: verdict.message
      };
    } else if (verdict.action === 'abort') {
      return {
        success: false,
        error: verdict.message,
        exitCode: verdict.exitCode
      };
    } else {
      sendProgress(verdict.message, 8);
    }
  } else if (existingBinaryValid && beta) {
    // Beta mode with existing installation - skip self-update and do fresh install
    sendProgress('Beta mode: installing beta version...', 8);
  }

  // Fresh install
  const tempDir = os.tmpdir();
  const tempBinaryPath = path.join(tempDir, config.binaryName);
  const warnings: string[] = [];

  try {
    let expectedChecksum: string | null = null;
    let versionTag: string;

    // Check if we're in artifact mode (PR build) or release mode
    if (isArtifactMode()) {
      // Artifact mode: Download from workflow artifacts
      const artifactToken = getArtifactToken();
      if (!artifactToken) {
        return { success: false, error: 'No artifact token available. This installer may not have been built correctly for PR testing.' };
      }

      const runId = getWorkflowRunId();
      sendProgress('Fetching PR artifact info...', 10);
      const artifactInfo = await getArtifactInfo(runId, artifactToken, config);

      // Fetch checksum if available (PR builds may not have checksums during rapid iteration)
      if (artifactInfo.checksumArtifactId && artifactInfo.checksumArtifactName) {
        sendProgress('Fetching checksum...', 15);
        expectedChecksum = await fetchArtifactChecksum(
          artifactInfo.checksumArtifactId,
          artifactToken,
          artifactInfo.checksumArtifactName
        );
        if (!expectedChecksum) {
          const warning = 'Checksum artifact could not be read. Binary integrity will NOT be verified. ' +
            'This is acceptable for PR testing but not for production use.';
          warnings.push(warning);
          console.warn(`[Security] ${warning}`);
        }
      } else {
        const warning = 'No checksum artifact found for this PR build. Binary integrity will NOT be verified. ' +
          'This is acceptable for PR testing but not for production use.';
        warnings.push(warning);
        console.warn(`[Security] ${warning}`);
      }

      sendProgress(`Downloading ${config.binaryName} from PR artifacts...`, 20);
      await downloadArtifact(
        artifactInfo.binaryArtifactId,
        tempBinaryPath,
        artifactToken,
        artifactInfo.binaryArtifactName,
        (percent) => {
          // Progress: 20-75 range (55% of bar for download)
          sendProgress(`Downloading... ${percent}%`, 20 + Math.round(percent * 0.55));
        },
        artifactInfo.binaryArtifactSize
      );

      versionTag = `PR build (run ${runId})`;
    } else {
      // Release mode: Download from GitHub releases (existing behavior)
      sendProgress(beta ? 'Fetching latest beta release...' : 'Fetching latest release info...', 10);
      const release = await getLatestRelease(token, config, { beta });

      if (release.checksumUrl) {
        sendProgress('Fetching checksum...', 15);
        const checksumResult = await fetchExpectedChecksum(release.checksumUrl, token);
        expectedChecksum = checksumResult.checksum;
        if (checksumResult.warning) {
          warnings.push(checksumResult.warning);
        }
      }

      sendProgress(`Downloading ${config.binaryName} (${release.tagName})...`, 20);
      await downloadBinary(release.downloadUrl, tempBinaryPath, token, (percent) => {
        // Progress: 20-75 range (55% of bar for download) - consistent with artifact mode
        sendProgress(`Downloading... ${percent}%`, 20 + Math.round(percent * 0.55));
      });

      versionTag = release.tagName;
    }

    // Verify checksum (for release mode, this is required; for artifact mode, it's optional)
    if (expectedChecksum) {
      sendProgress('Verifying integrity...', 80);
      await verifyChecksum(tempBinaryPath, expectedChecksum);
    } else if (!isArtifactMode()) {
      // Release mode requires checksums
      throw new Error('Checksum file missing from release. This is a release pipeline issue - please report it.');
    }

    sendProgress('Installing...', 85);
    if (platform === 'win32') {
      await installWindows(tempBinaryPath, installPath, targetPath, addToPath);
    } else {
      const platformConfig: PlatformInstallConfig = { platform, getShellProfilePath };
      await installUnix(tempBinaryPath, installPath, targetPath, addToPath, platformConfig);
    }

    try {
      fs.unlinkSync(tempBinaryPath);
    } catch {
      // Ignore cleanup errors
    }

    sendProgress('Generating configuration...', 95);
    const postInstallWarning = await runPostInstall(targetPath);
    if (postInstallWarning) {
      warnings.push(postInstallWarning);
    }

    sendProgress('Installation complete!', 100);
    const result: InstallResult = { success: true, installedPath: targetPath, version: versionTag };
    if (warnings.length > 0) {
      result.warnings = warnings;
    }
    return result;
  } catch (error: any) {
    try {
      fs.unlinkSync(tempBinaryPath);
    } catch {
      // Ignore cleanup errors
    }
    const result: InstallResult = { success: false, error: error.message };
    if (warnings.length > 0) {
      result.warnings = warnings;
    }
    return result;
  }
});

ipcMain.handle('get-version', async () => {
  const packageJson = require('../package.json');
  return packageJson.version;
});
