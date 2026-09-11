import chalk from 'chalk';
import crypto from 'node:crypto';
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Octokit } from 'octokit';
import { GH_API_URL } from '../tools/github';
import telemetryService, { type UpdateEvent } from '../services/telemetry';
import { logInfo, logError, logDebug } from '../services/logger';
import { downloadPRArtifact, type PRArtifactInfo } from './update-pr-artifacts';

/**
 * Narrow an unknown catch value down to a readable message. Mirrors the
 * `error instanceof Error ? error.message : String(error)` convention used
 * elsewhere in this codebase (e.g. src/commands/install.ts).
 */
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Node decorates thrown errors from fs/child_process calls with extra,
 * non-standard fields depending on the failure:
 *  - `code` for fs errors (ENOENT, EACCES, ...)
 *  - `status`/`signal` for execFileSync/execSync failures (exit code / kill signal)
 * These aren't part of the standard Error type, so read them through a narrow
 * local shape instead of `any`.
 */
interface NodeSystemError extends Error {
  code?: string;
  status?: number | null;
  signal?: NodeJS.Signals | null;
}

const asSystemError = (error: unknown): NodeSystemError | undefined =>
  error instanceof Error ? (error as NodeSystemError) : undefined;

// Re-export from submodules for backwards compatibility
export {
  checkForUpdates,
  silentCheckForUpdates,
  notifyIfUpdateAvailable,
  getAuthToken,
  getPackageVersion,
  type UpdateCheckResult,
} from './update-check';

export { acquireUpdateLock, releaseUpdateLock, UPDATE_LOCK_FILE } from './update-lock';

export {
  checkWindowsFileLock,
  checkDirectoryWritePermission,
  waitForFileLockRelease,
  getProcessDisplayName,
  type FileLockWaitResult,
} from './update-windows';

export {
  checkUpdateResult,
  isMarkerStale,
  SUCCESS_MARKER,
  FAILURE_MARKER,
  MARKER_DIR,
} from './update-markers';

export { getCurrentBinaryPath, getCurrentBinaryDir, getPlatformInfo } from './update-platform';

// Import for internal use
import { getAuthToken, getPackageVersion } from './update-check';
import { acquireUpdateLock, releaseUpdateLock } from './update-lock';
import { checkDirectoryWritePermission, waitForFileLockRelease } from './update-windows';
import { getCurrentBinaryPath, getPlatformInfo } from './update-platform';

/**
 * Helper to send update telemetry and flush before returning.
 * Since update commands may exit the process, we need to ensure telemetry is sent.
 */
const sendUpdateTelemetry = async (event: UpdateEvent): Promise<void> => {
  try {
    telemetryService.recordUpdateEvent(event);
    // Give telemetry a chance to flush (short timeout since we may be exiting)
    await telemetryService.flush(2000);
  } catch {
    // Ignore telemetry errors - don't block the update flow
  }
};

/**
 * Result from downloadAndApplyUpdate
 */
export interface UpdateApplyResult {
  success: boolean;
  failureReason?: string;
}

/**
 * Download and apply update
 */
export const downloadAndApplyUpdate = async (options: {
  owner: string;
  repo: string;
  assetId: number;
  toVersion?: string; // Target version for telemetry
  nonInteractive?: boolean; // Skip interactive prompts (for installer)
  authToken?: string; // Pre-resolved auth token (avoids re-calling getAuthToken with expired embedded token)
}): Promise<UpdateApplyResult> => {
  const startTime = performance.now();
  const { arch } = getPlatformInfo();
  const fromVersion = getPackageVersion();

  // Build base telemetry event that we'll update as we go
  const telemetryEvent: UpdateEvent = {
    platform: os.platform(),
    arch: arch,
    fromVersion,
    toVersion: options.toVersion,
    outcome: 'failure', // Default to failure, update on success
  };

  logInfo('Starting update process', {
    fromVersion,
    toVersion: options.toVersion,
    platform: os.platform(),
    arch,
  });

  // Acquire lock to prevent concurrent updates
  if (!acquireUpdateLock()) {
    logError('Update blocked: another update is already in progress');
    console.log('');
    console.log(chalk.yellow('⚠️  Another update is already in progress.'));
    console.log(chalk.dim('   Please wait for it to complete, or try again in a few minutes.'));
    console.log('');

    telemetryEvent.failureReason = 'concurrent_update';
    telemetryEvent.durationMs = Math.round(performance.now() - startTime);
    await sendUpdateTelemetry(telemetryEvent);
    return { success: false, failureReason: 'concurrent_update' };
  }

  try {
    const currentBinaryPath = getCurrentBinaryPath();
    if (!currentBinaryPath) {
      logError('Could not determine path to current binary');
      console.error(`\n❌ ${chalk.red('Could not determine path to current binary')}`);
      telemetryEvent.failureReason = 'binary_path_unknown';
      telemetryEvent.durationMs = Math.round(performance.now() - startTime);
      await sendUpdateTelemetry(telemetryEvent);
      releaseUpdateLock();
      return { success: false, failureReason: 'binary_path_unknown' };
    }

    logDebug('Current binary path', { currentBinaryPath });

    // On Windows, check if file is locked BEFORE downloading
    // This gives the user a chance to close VS Code without wasting time/bandwidth
    if (os.platform() === 'win32') {
      logDebug('Checking for file locks on Windows');
      const lockResult = await waitForFileLockRelease(
        currentBinaryPath,
        300,
        undefined,
        options.nonInteractive,
      );
      if (!lockResult.canProceed) {
        logError('File lock check failed', {
          fileLockDetected: lockResult.fileLockDetected,
          lockingProcess: lockResult.lockingProcess,
          failureReason: lockResult.failureReason,
        });
        // Use the detailed failure info from the lock check
        telemetryEvent.fileLockDetected = lockResult.fileLockDetected;
        telemetryEvent.failureReason = lockResult.failureReason;
        telemetryEvent.lockingProcess = lockResult.lockingProcess;
        telemetryEvent.adminRequired = lockResult.adminRequired;
        telemetryEvent.waitTimeSeconds = lockResult.waitTimeSeconds;
        telemetryEvent.durationMs = Math.round(performance.now() - startTime);
        await sendUpdateTelemetry(telemetryEvent);
        releaseUpdateLock();
        return { success: false, failureReason: lockResult.failureReason || 'file_locked' };
      }
      // Even on success, record if there was an initial lock that got released
      if (lockResult.fileLockDetected) {
        logInfo('File lock was released', {
          lockingProcess: lockResult.lockingProcess,
          waitTimeSeconds: lockResult.waitTimeSeconds,
        });
        telemetryEvent.fileLockDetected = true;
        telemetryEvent.lockingProcess = lockResult.lockingProcess;
        telemetryEvent.waitTimeSeconds = lockResult.waitTimeSeconds;
      }
    }

    // Clean up old update temp directories (older than 1 hour to avoid race with running scripts)
    // Also clean up any orphaned backup files from failed updates
    try {
      const tempBase = os.tmpdir();
      const oldDirs = fs.readdirSync(tempBase).filter((d) => d.startsWith('qnscmcp-update-'));
      const oneHourAgo = Date.now() - 60 * 60 * 1000; // 1 hour, not 24
      for (const dir of oldDirs) {
        try {
          const dirPath = path.join(tempBase, dir);
          const stat = fs.statSync(dirPath);
          if (stat.isDirectory() && stat.mtimeMs < oneHourAgo) {
            fs.rmSync(dirPath, { recursive: true, force: true });
          }
        } catch {
          // Ignore errors cleaning up individual directories
        }
      }
    } catch {
      // Ignore errors during cleanup
    }

    // Clean up orphaned backup files from previous failed updates
    try {
      const backupPath = currentBinaryPath + '.backup';
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
    } catch {
      // Ignore errors - backup might be locked or not exist
    }

    logInfo('Downloading update');
    console.log(chalk.dim('Downloading update...'));

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qnscmcp-update-'));
    const tempFilePath = path.join(tempDir, 'qnscmcp-new');
    logDebug('Created temp directory', { tempDir, tempFilePath });

    try {
      const { owner, repo, assetId } = options;
      // Prefer the pre-resolved token from checkForUpdates (which may have come from OAuth)
      // over calling getAuthToken() again (which might return an expired embedded token)
      const auth = options.authToken || getAuthToken();

      const octokit = new Octokit({
        auth: auth || undefined,
        baseUrl: GH_API_URL,
      });

      logDebug('Fetching release asset', { owner, repo, assetId });
      const { data } = await octokit.rest.repos.getReleaseAsset({
        owner,
        repo,
        asset_id: assetId,
        headers: {
          accept: 'application/octet-stream',
        },
      });

      fs.writeFileSync(tempFilePath, data as unknown as Buffer);
      logInfo('Download complete', { size: (data as unknown as Buffer).length });
    } catch (error) {
      logError('Download failed', { error: errorMessage(error) });
      console.error(`\n❌ ${chalk.red('Download failed:')}`, error);
      telemetryEvent.failureReason = 'download_failed';
      telemetryEvent.durationMs = Math.round(performance.now() - startTime);
      await sendUpdateTelemetry(telemetryEvent);
      releaseUpdateLock();
      return { success: false, failureReason: 'download_failed' };
    }

    return await applyDownloadedBinary(
      tempFilePath,
      tempDir,
      currentBinaryPath,
      startTime,
      telemetryEvent,
      options,
    );
  } catch (error) {
    logError('Unexpected error during update', {
      error: errorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    console.error(`\n❌ ${chalk.red('Failed to download and apply update:')}`, error);
    telemetryEvent.failureReason = 'unknown';
    telemetryEvent.durationMs = Math.round(performance.now() - startTime);
    await sendUpdateTelemetry(telemetryEvent);
    releaseUpdateLock();
    return { success: false, failureReason: 'unknown' };
  }
};

/**
 * Clean up old backup files from previous updates.
 * On Windows, when we update, we rename the running exe to .old (or .old.N) because
 * Windows doesn't allow deleting/overwriting running executables.
 * This function cleans up those .old files on subsequent runs.
 *
 * Should be called early in the application startup.
 */
export const cleanupOldBinaryBackups = (): void => {
  // Only relevant on Windows
  if (os.platform() !== 'win32') {
    return;
  }

  const currentBinaryPath = getCurrentBinaryPath();
  if (!currentBinaryPath) {
    return;
  }

  const cleanedFiles: string[] = [];
  const failedFiles: string[] = [];

  // Build list of potential backup files to clean up
  const backupPaths = [
    currentBinaryPath + '.old',
    ...Array.from({ length: 10 }, (_, i) => `${currentBinaryPath}.old.${i + 1}`),
  ];

  for (const backupPath of backupPaths) {
    if (fs.existsSync(backupPath)) {
      try {
        fs.unlinkSync(backupPath);
        cleanedFiles.push(backupPath);
      } catch {
        failedFiles.push(backupPath);
        // Continue - file might still be locked, will try again next run
      }
    }
  }

  // Log results for debugging
  if (cleanedFiles.length > 0) {
    logInfo('Cleaned up old binary backups', {
      cleanedCount: cleanedFiles.length,
      files: cleanedFiles,
    });
  }
  if (failedFiles.length > 0) {
    // This is expected if old processes haven't fully terminated yet
    // Log at debug level since it's not an error - will retry next run
    logDebug('Some backup files still locked (will retry next run)', {
      failedCount: failedFiles.length,
      files: failedFiles,
    });
  }
};

/**
 * Shared helper: apply a downloaded binary (chmod, quarantine removal, Windows rename-then-replace,
 * SHA256 verification, cleanup, telemetry). Used by both release updates and PR artifact updates.
 */
export const applyDownloadedBinary = async (
  tempFilePath: string,
  tempDir: string,
  currentBinaryPath: string,
  startTime: number,
  telemetryEvent: UpdateEvent,
  options: { toVersion?: string; nonInteractive?: boolean },
): Promise<UpdateApplyResult> => {
  // Make the new binary executable
  fs.chmodSync(tempFilePath, 0o755);

  // On macOS, remove quarantine attribute
  if (os.platform() === 'darwin') {
    try {
      execSync(`xattr -d com.apple.quarantine "${tempFilePath}"`, {
        stdio: 'ignore',
      });
    } catch {
      // Ignore if xattr fails
    }
  }

  if (os.platform() === 'win32') {
    // On Windows, use the rename-then-replace strategy:
    // 1. Rename running exe to .old (Windows allows renaming running executables)
    // 2. Copy new exe into place
    // 3. Verify the update
    // 4. The .old file gets cleaned up on next run

    logInfo('Applying update on Windows');
    console.log(chalk.dim('Applying update...'));

    // Calculate source hash before copy for verification
    const sourceHash = crypto
      .createHash('sha256')
      .update(fs.readFileSync(tempFilePath))
      .digest('hex')
      .toUpperCase();
    const sourceSize = fs.statSync(tempFilePath).size;
    logDebug('Source file verified', { sourceSize, sourceHash });

    // Find an available backup path using incremental naming
    let backupPath = currentBinaryPath + '.old';
    let backupIndex = 0;
    const maxBackupAttempts = 10;

    while (fs.existsSync(backupPath) && backupIndex < maxBackupAttempts) {
      try {
        fs.unlinkSync(backupPath);
        logDebug('Removed existing backup', { backupPath });
        break;
      } catch {
        backupIndex++;
        backupPath = `${currentBinaryPath}.old.${backupIndex}`;
        logDebug('Backup file locked, trying next', { backupPath, backupIndex });
      }
    }

    if (backupIndex >= maxBackupAttempts) {
      logError('Too many locked backup files', { maxBackupAttempts, currentBinaryPath });
      console.error(`\n❌ ${chalk.red('Too many locked backup files exist.')}`);
      console.error(chalk.dim('Multiple previous versions of qnsc-mcp may still be running.'));
      console.error(
        chalk.dim('Please close all terminals and IDEs using qnsc-mcp, then try again.'),
      );
      console.error(chalk.dim('The downloaded binary is preserved at: ') + tempFilePath);
      telemetryEvent.failureReason = 'too_many_backups';
      telemetryEvent.durationMs = Math.round(performance.now() - startTime);
      await sendUpdateTelemetry(telemetryEvent);
      releaseUpdateLock();
      return { success: false, failureReason: 'too_many_backups' };
    }

    try {
      logDebug('Renaming current executable', { from: currentBinaryPath, to: backupPath });
      fs.renameSync(currentBinaryPath, backupPath);
      logInfo('Renamed current executable to backup', { backupPath });
    } catch (renameError) {
      logError('Failed to rename current executable', {
        error: errorMessage(renameError),
        backupPath,
      });
      console.error(
        `\n❌ ${chalk.red('Failed to rename current executable:')} ${errorMessage(renameError)}`,
      );
      console.error(
        chalk.dim('The file may be locked by another process (e.g., VS Code running MCP server).'),
      );
      console.error(chalk.dim('The downloaded binary is preserved at: ') + tempFilePath);
      console.error(chalk.dim('You can manually copy it to: ') + currentBinaryPath);
      telemetryEvent.failureReason = 'rename_failed';
      telemetryEvent.durationMs = Math.round(performance.now() - startTime);
      await sendUpdateTelemetry(telemetryEvent);
      releaseUpdateLock();
      return { success: false, failureReason: 'rename_failed' };
    }

    try {
      logDebug('Copying new binary into place', { from: tempFilePath, to: currentBinaryPath });
      fs.copyFileSync(tempFilePath, currentBinaryPath);
      logInfo('Copied new binary into place');
    } catch (copyError) {
      logError('Failed to copy new executable', { error: errorMessage(copyError) });
      console.error(
        `\n❌ ${chalk.red('Failed to copy new executable:')} ${errorMessage(copyError)}`,
      );
      try {
        fs.renameSync(backupPath, currentBinaryPath);
        logInfo('Restored previous version from backup', { backupPath });
        console.log(chalk.dim('Restored previous version.'));
      } catch (restoreError) {
        logError('Could not restore previous version', {
          error: errorMessage(restoreError),
          backupPath,
        });
        console.error(chalk.red('⚠️  Could not restore previous version!'));
        console.error(chalk.dim('The backup is at: ') + backupPath);
      }
      telemetryEvent.failureReason = 'copy_failed';
      telemetryEvent.durationMs = Math.round(performance.now() - startTime);
      await sendUpdateTelemetry(telemetryEvent);
      releaseUpdateLock();
      return { success: false, failureReason: 'copy_failed' };
    }

    // Verify the update
    const targetSize = fs.statSync(currentBinaryPath).size;
    const targetHash = crypto
      .createHash('sha256')
      .update(fs.readFileSync(currentBinaryPath))
      .digest('hex')
      .toUpperCase();

    logDebug('Verifying update', { sourceSize, targetSize, sourceHash, targetHash });

    if (sourceSize !== targetSize || sourceHash !== targetHash) {
      const mismatchType = sourceSize !== targetSize ? 'size' : 'hash';
      logError('Update verification failed', {
        mismatchType,
        sourceSize,
        targetSize,
        sourceHash,
        targetHash,
      });
      console.error(
        `\n❌ ${chalk.red('Update verification failed:')} ${sourceSize !== targetSize ? 'File size mismatch' : 'Hash mismatch'} after copy.`,
      );
      try {
        fs.unlinkSync(currentBinaryPath);
        fs.renameSync(backupPath, currentBinaryPath);
        logInfo('Restored previous version after verification failure', { backupPath });
        console.log(chalk.dim('Restored previous version.'));
      } catch (restoreError) {
        logError('Could not restore previous version', {
          error: errorMessage(restoreError),
          backupPath,
        });
        console.error(chalk.red('⚠️  Could not restore previous version!'));
        console.error(chalk.dim('The backup is at: ') + backupPath);
      }
      telemetryEvent.failureReason = 'verification_failed';
      telemetryEvent.durationMs = Math.round(performance.now() - startTime);
      await sendUpdateTelemetry(telemetryEvent);
      releaseUpdateLock();
      return { success: false, failureReason: 'verification_failed' };
    }

    // Success! Clean up temp directory (but leave .old file - it gets cleaned up on next run)
    logInfo('Update verification passed');
    fs.rmSync(tempDir, { recursive: true, force: true });

    const durationMs = Math.round(performance.now() - startTime);
    logInfo('Update completed successfully', { toVersion: options.toVersion, durationMs });

    telemetryEvent.outcome = 'success';
    telemetryEvent.durationMs = durationMs;
    await sendUpdateTelemetry(telemetryEvent);

    releaseUpdateLock();
    return { success: true };
  }

  // Non-Windows: staged copy + atomic rename swap.
  // Copying directly over a running binary can fail with ETXTBSY on Unix-like systems.
  logInfo('Applying update (non-Windows)');

  // Check if we have write permission to the binary directory.
  // If not (e.g., /usr/local/bin owned by root), use sudo for file operations,
  // mirroring how the installer handles this (scripts/install.sh).
  const binaryDir = path.dirname(currentBinaryPath);
  let needsSudo: boolean;
  try {
    needsSudo = !checkDirectoryWritePermission(binaryDir);
  } catch (dirCheckError) {
    logError('Binary directory is inaccessible', {
      binaryDir,
      error: errorMessage(dirCheckError),
      code: asSystemError(dirCheckError)?.code,
    });
    console.error(
      `\n❌ ${chalk.red('Binary directory is inaccessible:')} ${errorMessage(dirCheckError)}`,
    );
    console.error(chalk.dim('Check that the directory exists and the filesystem is healthy.'));
    telemetryEvent.failureReason = 'permission_denied';
    telemetryEvent.durationMs = Math.round(performance.now() - startTime);
    await sendUpdateTelemetry(telemetryEvent);
    releaseUpdateLock();
    return { success: false, failureReason: 'permission_denied' };
  }

  if (needsSudo) {
    logInfo('Elevated permissions required for binary directory', { binaryDir });
    if (options.nonInteractive) {
      logError('Cannot elevate permissions in non-interactive mode', { binaryDir });
      console.error(`\n❌ ${chalk.red('Permission denied:')} Cannot write to ${binaryDir}`);
      console.error(
        chalk.dim(
          'Non-interactive mode cannot prompt for sudo. Run interactively or use: sudo qnsc-mcp update',
        ),
      );
      telemetryEvent.failureReason = 'permission_denied';
      telemetryEvent.durationMs = Math.round(performance.now() - startTime);
      await sendUpdateTelemetry(telemetryEvent);
      releaseUpdateLock();
      return { success: false, failureReason: 'permission_denied' };
    }
    console.log(chalk.dim('Elevated permissions required to update in ' + binaryDir));
  }

  // File operation helpers that use sudo when the binary directory is not user-writable.
  // Uses execFileSync with array args to avoid shell injection risks.
  // Timeout prevents indefinite hangs (e.g., sudo credential cache expired during rollback).
  const sudoExec = (args: string[], timeoutMs = 120_000) =>
    execFileSync('sudo', args, { stdio: 'inherit', timeout: timeoutMs });
  const cpFile = (src: string, dest: string) => {
    if (needsSudo) {
      sudoExec(['cp', src, dest]);
    } else {
      fs.copyFileSync(src, dest);
    }
  };
  const mvFile = (src: string, dest: string) => {
    if (needsSudo) {
      sudoExec(['mv', src, dest]);
    } else {
      fs.renameSync(src, dest);
    }
  };
  const rmFile = (filePath: string) => {
    if (needsSudo) {
      sudoExec(['rm', '-f', filePath]);
    } else {
      fs.unlinkSync(filePath);
    }
  };
  const chmodFile = (filePath: string, mode: number) => {
    if (needsSudo) {
      sudoExec(['chmod', mode.toString(8), filePath]);
    } else {
      fs.chmodSync(filePath, mode);
    }
  };

  const sourceHash = crypto
    .createHash('sha256')
    .update(fs.readFileSync(tempFilePath))
    .digest('hex')
    .toUpperCase();
  const sourceSize = fs.statSync(tempFilePath).size;
  logDebug('Source file verified', { sourceSize, sourceHash });

  const stagedPath = `${currentBinaryPath}.new`;
  const backupPath = `${currentBinaryPath}.backup`;

  try {
    if (fs.existsSync(stagedPath)) {
      rmFile(stagedPath);
    }
  } catch (cleanupError) {
    logDebug('Best effort cleanup of stale staged file failed', {
      error: errorMessage(cleanupError),
      stagedPath,
      needsSudo,
    });
  }

  logDebug('Copying new binary to staged path', { from: tempFilePath, to: stagedPath });
  try {
    cpFile(tempFilePath, stagedPath);
    chmodFile(stagedPath, 0o755);
  } catch (copyError) {
    logError('Failed to stage new executable', {
      error: errorMessage(copyError),
      exitCode: asSystemError(copyError)?.status,
      signal: asSystemError(copyError)?.signal,
    });
    console.error(
      `\n❌ ${chalk.red('Failed to stage new executable:')} ${errorMessage(copyError)}`,
    );
    console.error(chalk.dim('The downloaded binary is preserved at: ') + tempFilePath);
    telemetryEvent.failureReason = 'copy_failed';
    telemetryEvent.durationMs = Math.round(performance.now() - startTime);
    await sendUpdateTelemetry(telemetryEvent);
    releaseUpdateLock();
    return { success: false, failureReason: 'copy_failed' };
  }

  let stagedSize: number;
  let stagedHash: string;
  try {
    stagedSize = fs.statSync(stagedPath).size;
    stagedHash = crypto
      .createHash('sha256')
      .update(fs.readFileSync(stagedPath))
      .digest('hex')
      .toUpperCase();
  } catch (readError) {
    logError('Failed to read staged binary for verification', {
      error: errorMessage(readError),
      stagedPath,
      needsSudo,
    });
    console.error(
      `\n❌ ${chalk.red('Failed to verify staged binary:')} ${errorMessage(readError)}`,
    );
    console.error(chalk.dim('The downloaded binary is preserved at: ') + tempFilePath);
    console.error(chalk.dim('The staged binary is at: ') + stagedPath);
    try {
      rmFile(stagedPath);
    } catch (cleanupError) {
      logDebug('Best effort cleanup of failed staged file failed', {
        error: errorMessage(cleanupError),
        stagedPath,
        needsSudo,
      });
    }
    telemetryEvent.failureReason = 'verification_failed';
    telemetryEvent.durationMs = Math.round(performance.now() - startTime);
    await sendUpdateTelemetry(telemetryEvent);
    releaseUpdateLock();
    return { success: false, failureReason: 'verification_failed' };
  }

  logDebug('Verifying staged binary', { sourceSize, stagedSize, sourceHash, stagedHash });

  if (sourceSize !== stagedSize || sourceHash !== stagedHash) {
    const mismatchType = sourceSize !== stagedSize ? 'size' : 'hash';
    logError('Staged binary verification failed', {
      mismatchType,
      sourceSize,
      stagedSize,
      sourceHash,
      stagedHash,
    });
    console.error(
      `\n❌ ${chalk.red('Update verification failed:')} ${sourceSize !== stagedSize ? 'File size mismatch' : 'Hash mismatch'} in staged binary.`,
    );
    console.error(chalk.dim('The downloaded binary is preserved at: ') + tempFilePath);
    console.error(chalk.dim('The staged binary is at: ') + stagedPath);
    try {
      rmFile(stagedPath);
    } catch (cleanupError) {
      logDebug('Best effort cleanup of failed staged file failed', {
        error: errorMessage(cleanupError),
        stagedPath,
        needsSudo,
      });
    }
    telemetryEvent.failureReason = 'verification_failed';
    telemetryEvent.durationMs = Math.round(performance.now() - startTime);
    await sendUpdateTelemetry(telemetryEvent);
    releaseUpdateLock();
    return { success: false, failureReason: 'verification_failed' };
  }

  try {
    if (fs.existsSync(backupPath)) {
      rmFile(backupPath);
    }
  } catch (cleanupError) {
    logDebug('Best effort cleanup of stale backup file failed', {
      error: errorMessage(cleanupError),
      backupPath,
      needsSudo,
    });
  }

  try {
    logDebug('Renaming current executable to backup', { from: currentBinaryPath, to: backupPath });
    mvFile(currentBinaryPath, backupPath);
  } catch (renameError) {
    logError('Failed to rename current executable', {
      error: errorMessage(renameError),
      exitCode: asSystemError(renameError)?.status,
      signal: asSystemError(renameError)?.signal,
      backupPath,
    });
    console.error(`\n❌ ${chalk.red('Failed to prepare binary swap:')} ${errorMessage(renameError)}`);
    console.error(chalk.dim('The file may be locked by another process.'));
    console.error(chalk.dim('The staged binary is preserved at: ') + stagedPath);
    telemetryEvent.failureReason = 'rename_failed';
    telemetryEvent.durationMs = Math.round(performance.now() - startTime);
    await sendUpdateTelemetry(telemetryEvent);
    releaseUpdateLock();
    return { success: false, failureReason: 'rename_failed' };
  }

  try {
    logDebug('Swapping staged binary into place', { from: stagedPath, to: currentBinaryPath });
    mvFile(stagedPath, currentBinaryPath);
  } catch (swapError: unknown) {
    logError('Failed to swap staged binary into place', {
      error: errorMessage(swapError),
      exitCode: asSystemError(swapError)?.status,
      signal: asSystemError(swapError)?.signal,
      stagedPath,
      backupPath,
    });
    console.error(`\n❌ ${chalk.red('Failed to complete binary swap:')} ${errorMessage(swapError)}`);
    let rollbackBroken = false;
    try {
      mvFile(backupPath, currentBinaryPath);
      logInfo('Restored previous version from backup after swap failure', { backupPath });
      console.log(chalk.dim('Restored previous version.'));
    } catch (restoreError: unknown) {
      rollbackBroken = true;
      logError(
        'CRITICAL: Could not restore previous version after swap failure — system may be in broken state',
        { error: errorMessage(restoreError), backupPath, currentBinaryPath, needsSudo },
      );
      console.error(chalk.red('⚠️  Could not restore previous version!'));
      console.error(chalk.dim('The backup is at: ') + backupPath);
      console.error(
        chalk.dim(
          `To restore manually: ${needsSudo ? 'sudo ' : ''}mv ${backupPath} ${currentBinaryPath}`,
        ),
      );
    }
    const failureReason = rollbackBroken ? 'rename_failed_rollback_broken' : 'rename_failed';
    telemetryEvent.failureReason = failureReason;
    telemetryEvent.durationMs = Math.round(performance.now() - startTime);
    await sendUpdateTelemetry(telemetryEvent);
    releaseUpdateLock();
    return { success: false, failureReason };
  }

  let targetSize: number;
  let targetHash: string;
  try {
    targetSize = fs.statSync(currentBinaryPath).size;
    targetHash = crypto
      .createHash('sha256')
      .update(fs.readFileSync(currentBinaryPath))
      .digest('hex')
      .toUpperCase();
  } catch (readError: unknown) {
    const readErrorCode = asSystemError(readError)?.code;
    if (readErrorCode === 'EACCES' || readErrorCode === 'EPERM') {
      // Binary was swapped into place but is unreadable (e.g., root-owned after sudo).
      // Verify the file at least exists before declaring success.
      let fileConfirmedExists = !needsSudo; // Without sudo, EACCES implies the file exists
      if (needsSudo) {
        try {
          execFileSync('sudo', ['test', '-f', currentBinaryPath], { stdio: 'inherit' });
          fileConfirmedExists = true;
        } catch {
          logError('Installed binary does not exist after swap (sudo test -f failed)', {
            currentBinaryPath,
            needsSudo,
          });
        }
      }
      if (fileConfirmedExists) {
        // File exists but is unreadable — treat as success, preserve backup as safety net.
        logError('Could not read installed binary for verification (permission denied)', {
          error: errorMessage(readError),
          code: readErrorCode,
          needsSudo,
        });
        console.log(
          chalk.yellow(
            '⚠️  Could not verify installed binary (permission denied). Update likely succeeded.',
          ),
        );
        console.log(chalk.dim('The backup has been preserved at: ') + backupPath);
        console.log(
          chalk.dim('If the update works correctly, you can remove it with: ') +
            (needsSudo ? `sudo rm ${backupPath}` : `rm ${backupPath}`),
        );
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
          /* best effort */
        }
        const durationMs = Math.round(performance.now() - startTime);
        logInfo('Update completed (unverified, backup preserved)', {
          toVersion: options.toVersion,
          durationMs,
          backupPath,
        });
        telemetryEvent.outcome = 'success';
        telemetryEvent.verificationSkipped = true;
        telemetryEvent.durationMs = durationMs;
        await sendUpdateTelemetry(telemetryEvent);
        releaseUpdateLock();
        return { success: true };
      }
      // File does not exist — fall through to verification failure below
      targetSize = -1;
      targetHash = 'FILE_MISSING';
    } else {
      // Non-permission errors (ENOENT, EIO, etc.) indicate real problems — force verification failure
      logError('Failed to read installed binary for verification', {
        error: errorMessage(readError),
        code: readErrorCode,
        needsSudo,
      });
      targetSize = -1;
      targetHash = 'READ_FAILED';
    }
  }

  logDebug('Verifying final binary', { sourceSize, targetSize, sourceHash, targetHash });

  if (sourceSize !== targetSize || sourceHash !== targetHash) {
    const mismatchType = sourceSize !== targetSize ? 'size' : 'hash';
    logError('Final binary verification failed', {
      mismatchType,
      sourceSize,
      targetSize,
      sourceHash,
      targetHash,
    });
    console.error(
      `\n❌ ${chalk.red('Update verification failed:')} ${sourceSize !== targetSize ? 'File size mismatch' : 'Hash mismatch'} after swap.`,
    );
    let rollbackBroken = false;
    try {
      rmFile(currentBinaryPath);
      mvFile(backupPath, currentBinaryPath);
      logInfo('Restored previous version after verification failure', { backupPath });
      console.log(chalk.dim('Restored previous version.'));
    } catch (restoreError: unknown) {
      rollbackBroken = true;
      logError(
        'CRITICAL: Could not restore previous version after verification failure — system may be in broken state',
        { error: errorMessage(restoreError), backupPath, currentBinaryPath, needsSudo },
      );
      console.error(chalk.red('⚠️  Could not restore previous version!'));
      console.error(chalk.dim('The backup is at: ') + backupPath);
      console.error(
        chalk.dim(
          `To restore manually: ${needsSudo ? 'sudo ' : ''}mv ${backupPath} ${currentBinaryPath}`,
        ),
      );
    }
    const failureReason = rollbackBroken
      ? 'verification_failed_rollback_broken'
      : 'verification_failed';
    telemetryEvent.failureReason = failureReason;
    telemetryEvent.durationMs = Math.round(performance.now() - startTime);
    await sendUpdateTelemetry(telemetryEvent);
    releaseUpdateLock();
    return { success: false, failureReason };
  }

  logInfo('Update verification passed');
  try {
    rmFile(backupPath);
  } catch (cleanupError: unknown) {
    logDebug('Best effort backup cleanup failed', {
      error: errorMessage(cleanupError),
      backupPath,
      needsSudo,
    });
  }
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }

  const durationMs = Math.round(performance.now() - startTime);
  logInfo('Update completed successfully', { toVersion: options.toVersion, durationMs });

  telemetryEvent.outcome = 'success';
  telemetryEvent.durationMs = durationMs;
  await sendUpdateTelemetry(telemetryEvent);

  releaseUpdateLock();
  return { success: true };
};

/**
 * Download and apply a PR artifact update.
 * Handles lock acquisition, binary path resolution, Windows file lock checks,
 * artifact download, and delegates to applyDownloadedBinary for installation.
 */
export const downloadAndApplyPRUpdate = async (options: {
  artifactInfo: PRArtifactInfo;
  nonInteractive?: boolean;
}): Promise<UpdateApplyResult> => {
  const { artifactInfo } = options;
  const startTime = performance.now();
  const { arch } = getPlatformInfo();
  const fromVersion = getPackageVersion();

  const toVersion = `pr-${artifactInfo.prNumber}@${artifactInfo.headSha.slice(0, 7)}`;

  const telemetryEvent: UpdateEvent = {
    platform: os.platform(),
    arch,
    fromVersion,
    toVersion,
    outcome: 'failure',
  };

  logInfo('Starting PR artifact update', {
    prNumber: artifactInfo.prNumber,
    headSha: artifactInfo.headSha.slice(0, 7),
    artifactId: artifactInfo.artifactId,
  });

  if (!acquireUpdateLock()) {
    logError('Update blocked: another update is already in progress');
    console.log('');
    console.log(chalk.yellow('⚠️  Another update is already in progress.'));
    console.log(chalk.dim('   Please wait for it to complete, or try again in a few minutes.'));
    console.log('');
    telemetryEvent.failureReason = 'concurrent_update';
    telemetryEvent.durationMs = Math.round(performance.now() - startTime);
    await sendUpdateTelemetry(telemetryEvent);
    return { success: false, failureReason: 'concurrent_update' };
  }

  try {
    const currentBinaryPath = getCurrentBinaryPath();
    if (!currentBinaryPath) {
      logError('Could not determine path to current binary');
      console.error(`\n❌ ${chalk.red('Could not determine path to current binary')}`);
      telemetryEvent.failureReason = 'binary_path_unknown';
      telemetryEvent.durationMs = Math.round(performance.now() - startTime);
      await sendUpdateTelemetry(telemetryEvent);
      releaseUpdateLock();
      return { success: false, failureReason: 'binary_path_unknown' };
    }

    // On Windows, check if file is locked BEFORE downloading
    if (os.platform() === 'win32') {
      const lockResult = await waitForFileLockRelease(
        currentBinaryPath,
        300,
        undefined,
        options.nonInteractive,
      );
      if (!lockResult.canProceed) {
        telemetryEvent.fileLockDetected = lockResult.fileLockDetected;
        telemetryEvent.failureReason = lockResult.failureReason;
        telemetryEvent.lockingProcess = lockResult.lockingProcess;
        telemetryEvent.durationMs = Math.round(performance.now() - startTime);
        await sendUpdateTelemetry(telemetryEvent);
        releaseUpdateLock();
        return { success: false, failureReason: lockResult.failureReason || 'file_locked' };
      }
    }

    logInfo('Downloading PR artifact');
    console.log(chalk.dim('Downloading PR artifact...'));

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qnscmcp-update-'));
    const tempFilePath = path.join(tempDir, 'qnscmcp-new');

    try {
      await downloadPRArtifact({
        artifactId: artifactInfo.artifactId,
        authToken: artifactInfo.authToken,
        destPath: tempFilePath,
      });
    } catch (error: unknown) {
      logError('PR artifact download failed', { error: errorMessage(error) });
      console.error(`\n❌ ${chalk.red('Download failed:')} ${errorMessage(error)}`);
      telemetryEvent.failureReason = 'download_failed';
      telemetryEvent.durationMs = Math.round(performance.now() - startTime);
      await sendUpdateTelemetry(telemetryEvent);
      releaseUpdateLock();
      return { success: false, failureReason: 'download_failed' };
    }

    return await applyDownloadedBinary(
      tempFilePath,
      tempDir,
      currentBinaryPath,
      startTime,
      telemetryEvent,
      { toVersion, nonInteractive: options.nonInteractive },
    );
  } catch (error: unknown) {
    logError('Unexpected error during PR update', {
      error: errorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    console.error(`\n❌ ${chalk.red('Failed to download and apply PR update:')}`, error);
    telemetryEvent.failureReason = 'unknown';
    telemetryEvent.durationMs = Math.round(performance.now() - startTime);
    await sendUpdateTelemetry(telemetryEvent);
    releaseUpdateLock();
    return { success: false, failureReason: 'unknown' };
  }
};
