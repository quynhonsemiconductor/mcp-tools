/**
 * Update logic for existing installations.
 */
import * as fs from 'fs';
import { spawn } from 'child_process';

/**
 * Exit codes from the update command.
 * IMPORTANT: These values must stay in sync with src/utils/exit-codes.ts
 * (the installer is a separate package and cannot import from the main src tree).
 */
export const UPDATE_EXIT_CODES = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  ALREADY_UP_TO_DATE: 2,
  FILE_LOCKED: 3,
  PERMISSION_DENIED: 4,
  DOWNLOAD_FAILED: 5,
  VERIFICATION_FAILED: 6,
  CONCURRENT_UPDATE: 7,
  NO_AUTH_TOKEN: 8,
  BINARY_PATH_UNKNOWN: 9,
  NO_PLATFORM_ASSET: 10,
  // Emitted only by `qnsc-mcp install pr<num>` when CI is still building and no
  // prior build exists. The installer never runs `install`, so it won't receive
  // this — mirrored here only to keep the map in sync with exit-codes.ts.
  CI_IN_PROGRESS: 11
} as const;

export interface UpdateResult {
  success: boolean;
  exitCode: number;
  message?: string;
  shouldFallbackToFreshInstall?: boolean;
}

export type UpdateVerdict =
  | { action: 'updated'; message: string }
  | { action: 'fresh_install'; message: string }
  | { action: 'abort'; message: string; exitCode: number };

/**
 * Decide what the installer should do after attempting a self-update.
 *
 * When the binary reports ALREADY_UP_TO_DATE, we compare the version before and
 * after the update attempt. If the version is unchanged, the binary may have
 * falsely reported success (e.g. expired auth token on <=3.6.0), so we fall
 * through to a fresh install.
 */
export function evaluateUpdateResult(
  updateResult: UpdateResult,
  preVersion: string | null,
  postVersion: string | null
): UpdateVerdict {
  if (updateResult.success) {
    if (updateResult.exitCode === UPDATE_EXIT_CODES.ALREADY_UP_TO_DATE) {
      // Version unchanged → binary may have lied about being up to date
      if (postVersion && preVersion && postVersion === preVersion) {
        return {
          action: 'fresh_install',
          message: 'Version unchanged after update check — performing fresh install.'
        };
      }
    }
    return {
      action: 'updated',
      message: updateResult.message || 'Update complete!'
    };
  }

  if (!updateResult.shouldFallbackToFreshInstall) {
    return {
      action: 'abort',
      message: updateResult.message || 'Update failed',
      exitCode: updateResult.exitCode
    };
  }

  return {
    action: 'fresh_install',
    message: updateResult.message || 'Performing fresh install.'
  };
}

/**
 * Check if an existing qnsc-mcp binary is valid and runnable.
 * Returns the version string if valid, null otherwise.
 */
export async function checkExistingBinary(binaryPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (!fs.existsSync(binaryPath)) {
      resolve(null);
      return;
    }

    const child = spawn(binaryPath, ['--version'], {
      stdio: 'pipe',
      timeout: 10000,
    });

    let stdout = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        const version = stdout.trim();
        resolve(version || 'unknown');
      } else {
        resolve(null);
      }
    });

    child.on('error', () => {
      resolve(null);
    });
  });
}

/**
 * Try to update an existing installation using the qnsc-mcp update command.
 * Returns the result with exit code so the installer can decide what to do.
 */
export async function tryUpdate(binaryPath: string): Promise<UpdateResult> {
  return new Promise((resolve) => {
    const UPDATE_TIMEOUT_MS = 120000;

    const child = spawn(binaryPath, ['update', '--force', '--non-interactive'], {
      stdio: 'pipe',
      timeout: UPDATE_TIMEOUT_MS,
    });

    let stdout = '';
    let stderr = '';
    let wasKilled = false;
    let hasResolved = false;

    // Helper to ensure we only resolve once
    const resolveOnce = (result: UpdateResult) => {
      if (hasResolved) return;
      hasResolved = true;
      resolve(result);
    };

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      if (err.message.includes('TIMEOUT') || err.message.includes('killed')) {
        wasKilled = true;
        // Don't resolve here - let the close event handle it with the wasKilled flag
        return;
      }
      resolveOnce({
        success: false,
        exitCode: -1,
        message: `Failed to run update: ${err.message}`,
        shouldFallbackToFreshInstall: true
      });
    });

    child.on('close', (code, signal) => {
      if (signal === 'SIGTERM' || wasKilled) {
        resolveOnce({
          success: false,
          exitCode: 1,
          message: 'Update timed out. The update process took too long to complete.',
          shouldFallbackToFreshInstall: true
        });
        return;
      }

      const exitCode = code ?? 1;

      switch (exitCode) {
        case UPDATE_EXIT_CODES.SUCCESS:
          resolveOnce({
            success: true,
            exitCode,
            message: 'Update successful'
          });
          break;

        case UPDATE_EXIT_CODES.ALREADY_UP_TO_DATE:
          resolveOnce({
            success: true,
            exitCode,
            message: 'Already running the latest version'
          });
          break;

        case UPDATE_EXIT_CODES.FILE_LOCKED:
          resolveOnce({
            success: false,
            exitCode,
            message: 'The binary is currently in use. Please close any applications using qnsc-mcp (VS Code, Cursor, etc.) and try again.',
            shouldFallbackToFreshInstall: false
          });
          break;

        case UPDATE_EXIT_CODES.PERMISSION_DENIED:
          resolveOnce({
            success: false,
            exitCode,
            message: 'Permission denied. The installer will attempt a fresh install with elevated privileges.',
            shouldFallbackToFreshInstall: true
          });
          break;

        case UPDATE_EXIT_CODES.NO_AUTH_TOKEN:
        case UPDATE_EXIT_CODES.BINARY_PATH_UNKNOWN:
          resolveOnce({
            success: false,
            exitCode,
            message: 'Existing installation may be corrupted. Performing fresh install.',
            shouldFallbackToFreshInstall: true
          });
          break;

        default:
          resolveOnce({
            success: false,
            exitCode,
            message: stderr || stdout || 'Update failed',
            shouldFallbackToFreshInstall: true
          });
      }
    });
  });
}
