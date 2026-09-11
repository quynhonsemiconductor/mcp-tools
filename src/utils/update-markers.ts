import chalk from 'chalk';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import telemetryService, { type UpdateEvent } from '../services/telemetry';
import { getPlatformInfo } from './update-platform';
import { getPackageVersion } from './update-check';

/**
 * Marker file paths for async update results (Windows only)
 */
export const MARKER_DIR = os.tmpdir();
export const SUCCESS_MARKER = path.join(MARKER_DIR, '.qnscmcp-update-success');
export const FAILURE_MARKER = path.join(MARKER_DIR, '.qnscmcp-update-failed');

/**
 * Marker file expiry threshold (24 hours)
 */
const MARKER_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Check if a marker file is stale (older than 24 hours).
 * Stale markers are silently removed and not displayed to users.
 */
export const isMarkerStale = (markerPath: string): boolean => {
  try {
    const stat = fs.statSync(markerPath);
    const markerAge = Date.now() - stat.mtimeMs;
    return markerAge > MARKER_EXPIRY_MS;
  } catch {
    return false;
  }
};

/**
 * Send telemetry for a deferred Windows update result.
 * This is called when we find a marker file left by the background PowerShell script.
 */
const sendDeferredUpdateTelemetry = (
  outcome: 'success' | 'failure',
  failureReason?: string,
): void => {
  try {
    const { arch } = getPlatformInfo();
    const currentVersion = getPackageVersion();

    const event: UpdateEvent = {
      platform: os.platform(),
      arch,
      fromVersion: 'unknown', // We don't know what version we updated from
      toVersion: outcome === 'success' ? currentVersion : undefined,
      outcome,
      fromMarkerFile: true,
    };

    if (outcome === 'failure') {
      // Map common failure patterns from marker file content to failure reasons
      if (failureReason?.includes('Verification failed')) {
        event.failureReason = 'verification_failed';
      } else {
        event.failureReason = 'unknown';
      }
    }

    telemetryService.recordUpdateEvent(event);
    // Note: We don't await flush here since this is called during CLI startup.
    // The telemetry will be sent when the CLI exits or during normal batching.
  } catch {
    // Ignore telemetry errors
  }
};

/**
 * Check for update result marker files left by the background update script (Windows only).
 * Displays appropriate success/failure message and cleans up the marker files.
 * This should be called early in CLI startup to inform users of background update results.
 * Marker files older than 24 hours are silently cleaned up without displaying messages.
 */
export const checkUpdateResult = (): void => {
  // Only relevant on Windows where updates happen in background
  if (os.platform() !== 'win32') {
    return;
  }

  try {
    // Check for success marker
    if (fs.existsSync(SUCCESS_MARKER)) {
      // If marker is stale (>24h), silently clean up and don't show message
      if (isMarkerStale(SUCCESS_MARKER)) {
        try {
          fs.unlinkSync(SUCCESS_MARKER);
        } catch {
          // Ignore cleanup errors
        }
        // Continue to check failure marker
      } else {
        const timestamp = fs.readFileSync(SUCCESS_MARKER, 'utf-8').trim();
        console.log('');
        console.log(
          chalk.green('✅ Update completed successfully') +
            (timestamp ? chalk.dim(` (${timestamp})`) : ''),
        );
        console.log('');

        // Send telemetry for the deferred success
        sendDeferredUpdateTelemetry('success');

        // Clean up marker
        try {
          fs.unlinkSync(SUCCESS_MARKER);
        } catch {
          // Ignore cleanup errors
        }
        return;
      }
    }

    // Check for failure marker
    if (fs.existsSync(FAILURE_MARKER)) {
      // If marker is stale (>24h), silently clean up and don't show message
      if (isMarkerStale(FAILURE_MARKER)) {
        try {
          fs.unlinkSync(FAILURE_MARKER);
        } catch {
          // Ignore cleanup errors
        }
        return;
      }

      const failureInfo = fs.readFileSync(FAILURE_MARKER, 'utf-8').trim();
      console.log('');
      console.log(chalk.red('❌ Previous update failed'));
      if (failureInfo) {
        console.log(chalk.dim(`   ${failureInfo}`));
      }
      console.log(chalk.dim(`   Run ${chalk.cyan('qnsc-mcp update')} to try again.`));
      console.log('');

      // Send telemetry for the deferred failure
      sendDeferredUpdateTelemetry('failure', failureInfo);

      // Clean up marker
      try {
        fs.unlinkSync(FAILURE_MARKER);
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch {
    // Silently ignore any errors reading marker files
  }
};
