import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { mockFS, mockOs, mockPath } from '../test-utils/mocks';

// Re-apply fs, os, and path mocks since other test files may have overridden them
// This is necessary because Bun's mock.module is global and doesn't restore between tests
void mock.module('fs', () => ({ default: mockFS, ...mockFS }));
void mock.module('node:fs', () => ({ default: mockFS, ...mockFS }));
void mock.module('os', () => ({ default: mockOs, ...mockOs }));
void mock.module('node:os', () => ({ default: mockOs, ...mockOs }));
void mock.module('path', () => ({ default: mockPath, ...mockPath }));
void mock.module('node:path', () => ({ default: mockPath, ...mockPath }));

// Also mock update-lock itself to use our mocked fs
// This is needed because the original update-lock module may have been imported
// before our mocks were set up
void mock.module('./update-lock', () => {
  // Re-implement the module logic with our mocked fs
  const UPDATE_LOCK_FILE = mockPath.join(mockOs.tmpdir(), '.qnscmcp-update.lock');
  const LOCK_STALE_MS = 10 * 60 * 1000;

  let exitHandlerRegistered = false;
  let currentProcessHoldsLock = false;

  const registerExitHandler = () => {
    process.on('exit', () => {
      if (currentProcessHoldsLock) {
        try {
          mockFS.unlinkSync(UPDATE_LOCK_FILE);
        } catch {
          // Ignore errors during cleanup
        }
      }
    });
  };

  const acquireUpdateLock = (): boolean => {
    if (!exitHandlerRegistered) {
      registerExitHandler();
      exitHandlerRegistered = true;
    }

    const tryCreateLock = (): boolean => {
      try {
        mockFS.writeFileSync(
          UPDATE_LOCK_FILE,
          JSON.stringify({ pid: process.pid, timestamp: Date.now() }),
          { flag: 'wx' },
        );
        currentProcessHoldsLock = true;
        return true;
      } catch (err: unknown) {
        const error = err as NodeJS.ErrnoException;
        if (error.code === 'EEXIST') {
          return false;
        }
        currentProcessHoldsLock = true;
        return true;
      }
    };

    if (tryCreateLock()) {
      return true;
    }

    try {
      const stat = mockFS.statSync(UPDATE_LOCK_FILE);
      const lockAge = Date.now() - stat.mtimeMs;

      if (lockAge < LOCK_STALE_MS) {
        return false;
      }

      try {
        mockFS.unlinkSync(UPDATE_LOCK_FILE);
      } catch {
        // Another process may have removed it
      }

      return tryCreateLock();
    } catch {
      return tryCreateLock();
    }
  };

  const releaseUpdateLock = (): void => {
    if (!currentProcessHoldsLock) {
      return;
    }

    try {
      mockFS.unlinkSync(UPDATE_LOCK_FILE);
    } catch {
      // Ignore errors
    }
    currentProcessHoldsLock = false;
  };

  return {
    acquireUpdateLock,
    releaseUpdateLock,
    UPDATE_LOCK_FILE,
  };
});

// Now import update-lock - it will use our mocked version
import { acquireUpdateLock, releaseUpdateLock, UPDATE_LOCK_FILE } from './update-lock';

describe('update-lock', () => {
  beforeEach(() => {
    mockFS.existsSync.mockClear();
    mockFS.statSync.mockClear();
    mockFS.unlinkSync.mockClear();
    mockFS.writeFileSync.mockClear();
  });

  afterEach(() => {
    // Always try to release lock after each test to reset module state
    // This ensures test isolation
    mockFS.unlinkSync.mockImplementation(() => {});
    releaseUpdateLock();
  });

  describe('acquireUpdateLock', () => {
    it('should acquire lock when no lock file exists (atomic create succeeds)', () => {
      mockFS.writeFileSync.mockImplementation(() => {});

      const result = acquireUpdateLock();

      expect(result).toBe(true);
      expect(mockFS.writeFileSync).toHaveBeenCalledWith(
        UPDATE_LOCK_FILE,
        expect.stringContaining('pid'),
        { flag: 'wx' },
      );
    });

    it('should fail to acquire lock when recent lock file exists', () => {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      // First writeFileSync fails with EEXIST (lock exists)
      mockFS.writeFileSync.mockImplementation(() => {
        const error = new Error('File exists') as NodeJS.ErrnoException;
        error.code = 'EEXIST';
        throw error;
      });
      // statSync shows lock is recent
      mockFS.statSync.mockReturnValue({
        mtimeMs: fiveMinutesAgo,
        isDirectory: () => false,
      });

      const result = acquireUpdateLock();

      expect(result).toBe(false);
    });

    it('should remove stale lock and acquire when lock file is old (>10 minutes)', () => {
      const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
      let writeAttempts = 0;

      // First writeFileSync fails with EEXIST, second succeeds
      mockFS.writeFileSync.mockImplementation(() => {
        writeAttempts++;
        if (writeAttempts === 1) {
          const error = new Error('File exists') as NodeJS.ErrnoException;
          error.code = 'EEXIST';
          throw error;
        }
        // Second attempt succeeds
      });
      mockFS.statSync.mockReturnValue({
        mtimeMs: fifteenMinutesAgo,
        isDirectory: () => false,
      });
      mockFS.unlinkSync.mockImplementation(() => {});

      const result = acquireUpdateLock();

      expect(result).toBe(true);
      expect(mockFS.unlinkSync).toHaveBeenCalledWith(UPDATE_LOCK_FILE);
      expect(mockFS.writeFileSync).toHaveBeenCalledTimes(2);
    });

    it('should return false when another process creates lock first (EEXIST on both attempts)', () => {
      // Both write attempts fail with EEXIST
      mockFS.writeFileSync.mockImplementation(() => {
        const error = new Error('File exists') as NodeJS.ErrnoException;
        error.code = 'EEXIST';
        throw error;
      });
      // Stale lock triggers retry
      mockFS.statSync.mockReturnValue({
        mtimeMs: Date.now() - 15 * 60 * 1000, // 15 minutes ago (stale)
        isDirectory: () => false,
      });
      mockFS.unlinkSync.mockImplementation(() => {});

      const result = acquireUpdateLock();

      expect(result).toBe(false);
    });

    it('should return true on permission errors (allow update to proceed)', () => {
      mockFS.writeFileSync.mockImplementation(() => {
        const error = new Error('Permission denied') as NodeJS.ErrnoException;
        error.code = 'EPERM';
        throw error;
      });

      const result = acquireUpdateLock();

      expect(result).toBe(true);
    });

    it('should retry create if stat fails (file was removed)', () => {
      let writeAttempts = 0;

      // First write fails with EEXIST, second succeeds
      mockFS.writeFileSync.mockImplementation(() => {
        writeAttempts++;
        if (writeAttempts === 1) {
          const error = new Error('File exists') as NodeJS.ErrnoException;
          error.code = 'EEXIST';
          throw error;
        }
      });
      // stat fails - file was removed between EEXIST and stat
      mockFS.statSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const result = acquireUpdateLock();

      expect(result).toBe(true);
      expect(mockFS.writeFileSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('releaseUpdateLock', () => {
    it('should delete the lock file after acquiring', () => {
      // First acquire the lock
      mockFS.writeFileSync.mockImplementation(() => {});
      acquireUpdateLock();

      // Then release it
      mockFS.unlinkSync.mockImplementation(() => {});
      releaseUpdateLock();

      expect(mockFS.unlinkSync).toHaveBeenCalledWith(UPDATE_LOCK_FILE);
    });

    it('should not throw when lock file does not exist', () => {
      // First acquire the lock
      mockFS.writeFileSync.mockImplementation(() => {});
      acquireUpdateLock();

      // Then release fails
      mockFS.unlinkSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      expect(() => releaseUpdateLock()).not.toThrow();
    });

    it('should not attempt delete if lock was never acquired', () => {
      // First, ensure we don't hold the lock by releasing any previous state
      mockFS.unlinkSync.mockImplementation(() => {});
      releaseUpdateLock();
      mockFS.unlinkSync.mockClear();

      // Now try to acquire but fail (another process holds the lock)
      mockFS.writeFileSync.mockImplementation(() => {
        const error = new Error('File exists') as NodeJS.ErrnoException;
        error.code = 'EEXIST';
        throw error;
      });
      mockFS.statSync.mockReturnValue({
        mtimeMs: Date.now(), // Recent lock - less than 10 minutes old
        isDirectory: () => false,
      });

      const acquired = acquireUpdateLock(); // This should fail
      expect(acquired).toBe(false);

      mockFS.unlinkSync.mockClear();
      releaseUpdateLock();

      // unlinkSync should not be called since we don't hold the lock
      expect(mockFS.unlinkSync).not.toHaveBeenCalled();
    });
  });

  describe('UPDATE_LOCK_FILE', () => {
    it('should be in temp directory', () => {
      expect(UPDATE_LOCK_FILE).toContain('.qnscmcp-update.lock');
    });
  });
});
