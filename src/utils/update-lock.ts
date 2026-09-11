import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Lock file path for preventing concurrent updates
 */
export const UPDATE_LOCK_FILE = path.join(os.tmpdir(), '.qnscmcp-update.lock');

/** Lock is considered stale after 10 minutes */
const LOCK_STALE_MS = 10 * 60 * 1000;

/** Track if we've registered the exit handler */
let exitHandlerRegistered = false;

/** Track if current process holds the lock (for exit handler) */
let currentProcessHoldsLock = false;

/**
 * Acquire an exclusive lock to prevent concurrent updates.
 * Returns true if lock acquired, false if another update is in progress.
 *
 * Uses atomic file creation to avoid TOCTOU race conditions:
 * 1. Try to create lock file atomically (wx flag)
 * 2. If that fails because file exists, check if it's stale
 * 3. If stale, remove and retry once
 */
export const acquireUpdateLock = (): boolean => {
  // Register exit handler on first call to ensure lock cleanup
  if (!exitHandlerRegistered) {
    registerExitHandler();
    exitHandlerRegistered = true;
  }

  const tryCreateLock = (): boolean => {
    try {
      fs.writeFileSync(
        UPDATE_LOCK_FILE,
        JSON.stringify({ pid: process.pid, timestamp: Date.now() }),
        { flag: 'wx' }, // Fail if file exists (atomic create)
      );
      currentProcessHoldsLock = true;
      return true;
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'EEXIST') {
        return false; // Lock exists
      }
      // Other errors (permission denied, etc.) - log but allow update to proceed
      // since failing to create a lock shouldn't block updates entirely
      currentProcessHoldsLock = true; // Treat as if we have the lock
      return true;
    }
  };

  // First attempt: try to create lock atomically
  if (tryCreateLock()) {
    return true;
  }

  // Lock file exists - check if it's stale
  try {
    const stat = fs.statSync(UPDATE_LOCK_FILE);
    const lockAge = Date.now() - stat.mtimeMs;

    if (lockAge < LOCK_STALE_MS) {
      // Lock is recent - another update is in progress
      return false;
    }

    // Lock is stale - try to remove it
    try {
      fs.unlinkSync(UPDATE_LOCK_FILE);
    } catch {
      // Another process may have removed it, or we don't have permission
      // Either way, try to create again
    }

    // Second attempt after removing stale lock
    return tryCreateLock();
  } catch {
    // Can't stat the file - it may have been removed, try to create
    return tryCreateLock();
  }
};

/**
 * Release the update lock.
 * Safe to call multiple times or if lock was never acquired.
 */
export const releaseUpdateLock = (): void => {
  if (!currentProcessHoldsLock) {
    return;
  }
  try {
    fs.unlinkSync(UPDATE_LOCK_FILE);
  } catch {
    // Ignore errors - lock might already be removed
  }
  currentProcessHoldsLock = false;
};

/**
 * Register handlers to release lock on process exit.
 * Ensures lock is cleaned up even on unexpected termination.
 */
const registerExitHandler = (): void => {
  const cleanup = () => {
    if (currentProcessHoldsLock) {
      try {
        fs.unlinkSync(UPDATE_LOCK_FILE);
      } catch {
        // Best effort - ignore errors during exit
      }
      currentProcessHoldsLock = false;
    }
  };

  // Normal exit
  process.on('exit', cleanup);

  // Ctrl+C
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130); // Standard exit code for SIGINT
  });

  // Kill signal
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143); // Standard exit code for SIGTERM
  });

  // Uncaught exceptions - cleanup but let default handler run
  process.on('uncaughtException', (err) => {
    cleanup();
    throw err; // Re-throw to let default handler process it
  });
};
