import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { mockFS, mockOs } from '../test-utils/mocks';

// --- Module-level mocks (must be declared before importing the module under test) ---

// Mock child_process (execSync is used on macOS for quarantine removal, execFileSync for sudo)
const mockExecSync = mock(() => '');
const mockExecFileSync = mock(() => Buffer.from(''));
void mock.module('node:child_process', () => ({
  execSync: mockExecSync,
  execFileSync: mockExecFileSync,
  spawn: mock(() => ({ unref: mock(() => {}), on: mock(() => {}) })),
}));

// Mock update-lock so we can observe releaseUpdateLock calls
const mockReleaseUpdateLock = mock(() => {});
const mockAcquireUpdateLock = mock(() => true);
void mock.module('./update-lock', () => ({
  acquireUpdateLock: mockAcquireUpdateLock,
  releaseUpdateLock: mockReleaseUpdateLock,
  UPDATE_LOCK_FILE: '/mock/tmp/.qnscmcp-update.lock',
}));

// Mock GitHub tools (GH_API_URL referenced at module load)
void mock.module('../tools/github', () => ({
  GH_API_URL: 'https://api.github.com',
}));

// Mock Octokit (used by downloadAndApplyUpdate, not applyDownloadedBinary)
void mock.module('octokit', () => ({
  Octokit: function () {
    return { rest: { repos: {} } };
  },
}));

// Mock package.json version (consumed by update-check on load)
void mock.module('../../package.json', () => ({ version: '1.0.0' }));

// Mock embedded credentials (pulled in transitively by update-check)
void mock.module('../services/auth/embedded-credentials', () => ({
  getEmbeddedGenericSecret: mock(() => undefined),
}));

// Mock PR artifact downloader (avoids loading extra deps)
void mock.module('./update-pr-artifacts', () => ({
  downloadPRArtifact: mock(() => Promise.resolve()),
}));

// Mock readline (used by update-windows which is re-exported by update-utils)
void mock.module('node:readline', () => ({
  default: { createInterface: mock(() => ({ on: mock(() => {}), close: mock(() => {}) })) },
  createInterface: mock(() => ({ on: mock(() => {}), close: mock(() => {}) })),
}));

// Re-apply standard fs and os mocks to guarantee they take effect
void mock.module('fs', () => ({ default: mockFS, ...mockFS }));
void mock.module('node:fs', () => ({ default: mockFS, ...mockFS }));
void mock.module('os', () => ({ default: mockOs, ...mockOs }));
void mock.module('node:os', () => ({ default: mockOs, ...mockOs }));

// Mock update-windows to control checkDirectoryWritePermission
const mockCheckDirectoryWritePermission = mock(() => true);
void mock.module('./update-windows', () => ({
  checkDirectoryWritePermission: mockCheckDirectoryWritePermission,
  waitForFileLockRelease: mock(() =>
    Promise.resolve({ canProceed: true, fileLockDetected: false, adminRequired: false }),
  ),
  checkWindowsFileLock: mock(() => ({ isLocked: false, noPermission: false, processes: [] })),
  checkDirectoryWritePermission_original: undefined,
  defaultDeps: {},
  getProcessDisplayName: mock((name: string) => name),
}));

// --- Import module under test AFTER all mocks are registered ---
import { applyDownloadedBinary } from './update-utils';
import telemetry from '../services/telemetry';
import type { UpdateEvent } from '../services/telemetry';

// Spy on telemetry methods instead of mock.module to avoid global leak into telemetry unit tests
const mockRecordUpdateEvent = mock(() => {});
const mockFlush = mock(() => Promise.resolve());
spyOn(telemetry, 'recordUpdateEvent').mockImplementation(mockRecordUpdateEvent);
spyOn(telemetry, 'flush').mockImplementation(mockFlush);

// --- Test constants ---
const TEMP_FILE = '/mock-tmp/qnscmcp-update-abc/qnscmcp-new';
const TEMP_DIR = '/mock-tmp/qnscmcp-update-abc';
const BINARY_PATH = '/usr/local/bin/qnsc-mcp';
const STAGED_PATH = `${BINARY_PATH}.new`;
const BACKUP_PATH = `${BINARY_PATH}.backup`;

const makeTelemetryEvent = (): UpdateEvent => ({
  platform: 'linux',
  arch: 'x64',
  fromVersion: '1.0.0',
  outcome: 'failure',
});

// --- Tests ---

describe('applyDownloadedBinary (non-Windows staged-swap path)', () => {
  beforeEach(() => {
    // Reset call counts and implementations for all fs functions we assert on
    mockFS.copyFileSync.mockReset();
    mockFS.renameSync.mockReset();
    mockFS.chmodSync.mockReset();
    mockFS.unlinkSync.mockReset();
    mockFS.rmSync.mockReset();
    mockFS.readFileSync.mockReset();
    mockFS.statSync.mockReset();
    mockFS.existsSync.mockReset();
    mockReleaseUpdateLock.mockReset();
    mockRecordUpdateEvent.mockReset();

    mockOs.platform.mockReturnValue('linux');
    mockCheckDirectoryWritePermission.mockReturnValue(true);
    // Default: no stale staged or backup files present
    mockFS.existsSync.mockReturnValue(false);
    // Default statSync returns consistent sizes (undefined === undefined passes verification)
    mockFS.statSync.mockReturnValue({ mtime: new Date(), isDirectory: () => false } as any);
    // Default readFileSync returns the same content for all calls (hashes match)
    mockFS.readFileSync.mockReturnValue('');
  });

  it('happy path: stages, swaps atomically, verifies, cleans up backup and temp dir', async () => {
    const result = await applyDownloadedBinary(
      TEMP_FILE,
      TEMP_DIR,
      BINARY_PATH,
      performance.now(),
      makeTelemetryEvent(),
      { toVersion: '2.0.0' },
    );

    expect(result).toEqual({ success: true });

    // Staged copy was written next to the binary (not over it)
    expect(mockFS.copyFileSync).toHaveBeenCalledWith(TEMP_FILE, STAGED_PATH);

    // Atomic swap: current → backup, then staged → current
    expect(mockFS.renameSync).toHaveBeenCalledWith(BINARY_PATH, BACKUP_PATH);
    expect(mockFS.renameSync).toHaveBeenCalledWith(STAGED_PATH, BINARY_PATH);

    // Backup cleaned up after successful verification
    expect(mockFS.unlinkSync).toHaveBeenCalledWith(BACKUP_PATH);

    // Temp dir removed
    expect(mockFS.rmSync).toHaveBeenCalledWith(TEMP_DIR, { recursive: true, force: true });

    // Lock released
    expect(mockReleaseUpdateLock).toHaveBeenCalled();
  });

  it('removes stale staged and backup files left from a previous failed update', async () => {
    mockFS.existsSync.mockReturnValue(true);

    await applyDownloadedBinary(
      TEMP_FILE,
      TEMP_DIR,
      BINARY_PATH,
      performance.now(),
      makeTelemetryEvent(),
      {},
    );

    expect(mockFS.unlinkSync).toHaveBeenCalledWith(STAGED_PATH);
    expect(mockFS.unlinkSync).toHaveBeenCalledWith(BACKUP_PATH);
  });

  it('returns copy_failed when staging the new binary fails (ETXTBSY scenario)', async () => {
    mockFS.copyFileSync.mockImplementationOnce(() => {
      const err: NodeJS.ErrnoException = new Error(
        "ETXTBSY: text file busy, open '/usr/local/bin/qnsc-mcp.new'",
      );
      err.code = 'ETXTBSY';
      throw err;
    });

    const result = await applyDownloadedBinary(
      TEMP_FILE,
      TEMP_DIR,
      BINARY_PATH,
      performance.now(),
      makeTelemetryEvent(),
      {},
    );

    expect(result).toEqual({ success: false, failureReason: 'copy_failed' });
    // Rename step must never have been reached
    expect(mockFS.renameSync).not.toHaveBeenCalled();
    expect(mockReleaseUpdateLock).toHaveBeenCalled();
  });

  it('returns verification_failed when staged binary size does not match source', async () => {
    let statCallCount = 0;
    mockFS.statSync.mockImplementation(() => {
      statCallCount++;
      // Call 1 = source, call 2 = staged (return mismatched size to trigger failure)
      return {
        size: statCallCount === 2 ? 99999 : 1024,
        mtime: new Date(),
        isDirectory: () => false,
      };
    });

    const result = await applyDownloadedBinary(
      TEMP_FILE,
      TEMP_DIR,
      BINARY_PATH,
      performance.now(),
      makeTelemetryEvent(),
      {},
    );

    expect(result).toEqual({ success: false, failureReason: 'verification_failed' });
    // Must not have proceeded to the rename step
    expect(mockFS.renameSync).not.toHaveBeenCalled();
    expect(mockReleaseUpdateLock).toHaveBeenCalled();
  });

  it('returns rename_failed when renaming current binary to backup fails', async () => {
    mockFS.renameSync.mockImplementationOnce(() => {
      throw new Error('EPERM: operation not permitted');
    });

    const result = await applyDownloadedBinary(
      TEMP_FILE,
      TEMP_DIR,
      BINARY_PATH,
      performance.now(),
      makeTelemetryEvent(),
      {},
    );

    expect(result).toEqual({ success: false, failureReason: 'rename_failed' });
    // Only one rename attempted (current → backup); swap never reached
    expect(mockFS.renameSync).toHaveBeenCalledTimes(1);
    expect(mockReleaseUpdateLock).toHaveBeenCalled();
  });

  it('rolls back by restoring backup when the swap rename fails', async () => {
    let renameCallCount = 0;
    mockFS.renameSync.mockImplementation(() => {
      renameCallCount++;
      // Call 1: current → backup (ok), call 2: staged → current (fails)
      // Call 3: backup → current (rollback, must succeed)
      if (renameCallCount === 2) {
        throw new Error('EXDEV: cross-device link not permitted');
      }
    });

    const result = await applyDownloadedBinary(
      TEMP_FILE,
      TEMP_DIR,
      BINARY_PATH,
      performance.now(),
      makeTelemetryEvent(),
      {},
    );

    expect(result).toEqual({ success: false, failureReason: 'rename_failed' });
    // 3 calls: current→backup, staged→current (throws), backup→current (rollback)
    expect(mockFS.renameSync).toHaveBeenCalledTimes(3);
    expect(mockFS.renameSync).toHaveBeenNthCalledWith(3, BACKUP_PATH, BINARY_PATH);
    expect(mockReleaseUpdateLock).toHaveBeenCalled();
  });

  it('rolls back by restoring backup when the final verification hash does not match', async () => {
    // readFileSync is called 3× in the non-Windows path:
    //   1. source hash, 2. staged hash (must match source), 3. target hash (simulate corruption)
    const goodContent = Buffer.from('correct-binary-content');
    const corruptContent = Buffer.from('corrupted-binary-after-swap');
    mockFS.readFileSync
      .mockReturnValueOnce(goodContent) // source hash
      .mockReturnValueOnce(goodContent) // staged hash — matches, passes staged verify
      .mockReturnValueOnce(corruptContent); // target hash — does not match, triggers rollback

    const result = await applyDownloadedBinary(
      TEMP_FILE,
      TEMP_DIR,
      BINARY_PATH,
      performance.now(),
      makeTelemetryEvent(),
      {},
    );

    expect(result).toEqual({ success: false, failureReason: 'verification_failed' });
    // Rollback: delete corrupt target, restore backup
    expect(mockFS.unlinkSync).toHaveBeenCalledWith(BINARY_PATH);
    expect(mockFS.renameSync).toHaveBeenCalledWith(BACKUP_PATH, BINARY_PATH);
    expect(mockReleaseUpdateLock).toHaveBeenCalled();
  });
});

describe('applyDownloadedBinary (sudo escalation for non-writable binary directory)', () => {
  beforeEach(() => {
    mockFS.copyFileSync.mockReset();
    mockFS.renameSync.mockReset();
    mockFS.chmodSync.mockReset();
    mockFS.unlinkSync.mockReset();
    mockFS.rmSync.mockReset();
    mockFS.readFileSync.mockReset();
    mockFS.statSync.mockReset();
    mockFS.existsSync.mockReset();
    mockReleaseUpdateLock.mockReset();
    mockRecordUpdateEvent.mockReset();
    mockExecSync.mockReset();
    mockExecFileSync.mockReset();
    mockCheckDirectoryWritePermission.mockReset();

    mockOs.platform.mockReturnValue('darwin');
    mockFS.existsSync.mockReturnValue(false);
    mockFS.statSync.mockReturnValue({ mtime: new Date(), isDirectory: () => false } as any);
    mockFS.readFileSync.mockReturnValue('');
  });

  /** Helper: extract sudo args from mockExecFileSync calls (filters to calls where first arg is 'sudo') */
  const getSudoCalls = () =>
    mockExecFileSync.mock.calls
      .filter((c: any) => c[0] === 'sudo')
      .map((c: any) => c[1] as string[]);

  it('returns permission_denied in non-interactive mode when directory is not writable', async () => {
    mockCheckDirectoryWritePermission.mockReturnValue(false);

    const result = await applyDownloadedBinary(
      TEMP_FILE,
      TEMP_DIR,
      BINARY_PATH,
      performance.now(),
      makeTelemetryEvent(),
      { nonInteractive: true },
    );

    expect(result).toEqual({ success: false, failureReason: 'permission_denied' });
    // Must not attempt any file operations
    expect(mockFS.copyFileSync).not.toHaveBeenCalled();
    expect(mockFS.renameSync).not.toHaveBeenCalled();
    expect(getSudoCalls()).toHaveLength(0);
    expect(mockReleaseUpdateLock).toHaveBeenCalled();
  });

  it('uses sudo for file operations when directory is not writable', async () => {
    mockCheckDirectoryWritePermission.mockReturnValue(false);

    const result = await applyDownloadedBinary(
      TEMP_FILE,
      TEMP_DIR,
      BINARY_PATH,
      performance.now(),
      makeTelemetryEvent(),
      { toVersion: '2.0.0' },
    );

    expect(result).toEqual({ success: true });

    // Should use execFileSync with sudo instead of direct fs calls for binary dir operations
    const sudoCalls = getSudoCalls();
    expect(
      sudoCalls.some(
        (args: string[]) => args[0] === 'cp' && args[1] === TEMP_FILE && args[2] === STAGED_PATH,
      ),
    ).toBe(true);
    expect(
      sudoCalls.some(
        (args: string[]) => args[0] === 'chmod' && args[1] === '755' && args[2] === STAGED_PATH,
      ),
    ).toBe(true);
    expect(
      sudoCalls.some(
        (args: string[]) => args[0] === 'mv' && args[1] === BINARY_PATH && args[2] === BACKUP_PATH,
      ),
    ).toBe(true);
    expect(
      sudoCalls.some(
        (args: string[]) => args[0] === 'mv' && args[1] === STAGED_PATH && args[2] === BINARY_PATH,
      ),
    ).toBe(true);

    // Direct fs copy/rename should NOT have been used for binary dir operations
    expect(mockFS.copyFileSync).not.toHaveBeenCalled();
    expect(mockFS.renameSync).not.toHaveBeenCalled();

    // Verify sudo is called with stdio: 'inherit' (password prompt visible) and a timeout
    const sudoCall: any = mockExecFileSync.mock.calls.find((c: any) => c[0] === 'sudo');
    expect(sudoCall).toBeDefined();
    expect(sudoCall[2]).toEqual({ stdio: 'inherit', timeout: 120_000 });

    expect(mockReleaseUpdateLock).toHaveBeenCalled();
  });

  it('does not use sudo when directory is writable', async () => {
    mockCheckDirectoryWritePermission.mockReturnValue(true);

    const result = await applyDownloadedBinary(
      TEMP_FILE,
      TEMP_DIR,
      BINARY_PATH,
      performance.now(),
      makeTelemetryEvent(),
      { toVersion: '2.0.0' },
    );

    expect(result).toEqual({ success: true });

    // Should use direct fs calls, not sudo
    expect(getSudoCalls()).toHaveLength(0);

    expect(mockFS.copyFileSync).toHaveBeenCalled();
    expect(mockFS.renameSync).toHaveBeenCalled();

    expect(mockReleaseUpdateLock).toHaveBeenCalled();
  });

  it('cleans up staged file via sudo when staged hash mismatches source', async () => {
    mockCheckDirectoryWritePermission.mockReturnValue(false);
    const goodContent = Buffer.from('correct-binary-content');
    const corruptContent = Buffer.from('corrupted-staged-binary');
    mockFS.readFileSync
      .mockReturnValueOnce(goodContent) // source hash
      .mockReturnValueOnce(corruptContent); // staged hash — mismatch
    // statSync: source size and staged size differ to trigger mismatch
    let statCallCount = 0;
    mockFS.statSync.mockImplementation(() => {
      statCallCount++;
      return {
        size: statCallCount === 2 ? 99999 : 1024,
        mtime: new Date(),
        isDirectory: () => false,
      };
    });

    const result = await applyDownloadedBinary(
      TEMP_FILE,
      TEMP_DIR,
      BINARY_PATH,
      performance.now(),
      makeTelemetryEvent(),
      { toVersion: '2.0.0' },
    );

    expect(result).toEqual({ success: false, failureReason: 'verification_failed' });
    // Staged file should be cleaned up via sudo rm
    const sudoCalls = getSudoCalls();
    expect(sudoCalls.some((args: string[]) => args[0] === 'rm' && args.includes(STAGED_PATH))).toBe(
      true,
    );
    // Rename step must never have been reached
    expect(sudoCalls.filter((args: string[]) => args[0] === 'mv')).toHaveLength(0);
    expect(mockFS.renameSync).not.toHaveBeenCalled();
    expect(mockReleaseUpdateLock).toHaveBeenCalled();
  });

  it('returns copy_failed when sudo cp fails (e.g. user cancels sudo prompt)', async () => {
    mockCheckDirectoryWritePermission.mockReturnValue(false);
    mockExecFileSync.mockImplementation(((cmd: string, args: string[]) => {
      if (cmd === 'sudo' && args[0] === 'cp') {
        throw new Error('sudo: a password is required');
      }
      return Buffer.from('');
    }) as any);

    const result = await applyDownloadedBinary(
      TEMP_FILE,
      TEMP_DIR,
      BINARY_PATH,
      performance.now(),
      makeTelemetryEvent(),
      { toVersion: '2.0.0' },
    );

    expect(result).toEqual({ success: false, failureReason: 'copy_failed' });
    expect(mockFS.renameSync).not.toHaveBeenCalled();
    expect(mockReleaseUpdateLock).toHaveBeenCalled();
  });

  it('rolls back via sudo when swap mv fails', async () => {
    mockCheckDirectoryWritePermission.mockReturnValue(false);
    let mvCallCount = 0;
    mockExecFileSync.mockImplementation(((cmd: string, args: string[]) => {
      if (cmd === 'sudo' && args[0] === 'mv') {
        mvCallCount++;
        // First mv: current → backup (ok). Second mv: staged → current (fail).
        // Third mv: backup → current (rollback, must succeed).
        if (mvCallCount === 2) {
          throw new Error('EXDEV: cross-device link not permitted');
        }
      }
      return Buffer.from('');
    }) as any);

    const result = await applyDownloadedBinary(
      TEMP_FILE,
      TEMP_DIR,
      BINARY_PATH,
      performance.now(),
      makeTelemetryEvent(),
      { toVersion: '2.0.0' },
    );

    expect(result).toEqual({ success: false, failureReason: 'rename_failed' });
    // Verify rollback mv was attempted: backup → current
    const mvCalls = getSudoCalls().filter((args: string[]) => args[0] === 'mv');
    expect(mvCalls).toHaveLength(3);
    expect(mvCalls[2]).toEqual(['mv', BACKUP_PATH, BINARY_PATH]);
    expect(mockReleaseUpdateLock).toHaveBeenCalled();
  });

  it('returns copy_failed when sudo chmod fails after successful cp', async () => {
    mockCheckDirectoryWritePermission.mockReturnValue(false);
    mockExecFileSync.mockImplementation(((cmd: string, args: string[]) => {
      if (cmd === 'sudo' && args[0] === 'chmod') {
        throw new Error('sudo: operation not permitted');
      }
      return Buffer.from('');
    }) as any);

    const result = await applyDownloadedBinary(
      TEMP_FILE,
      TEMP_DIR,
      BINARY_PATH,
      performance.now(),
      makeTelemetryEvent(),
      { toVersion: '2.0.0' },
    );

    expect(result).toEqual({ success: false, failureReason: 'copy_failed' });
    // cp succeeded but chmod failed — both in the same try/catch
    expect(getSudoCalls().some((args: string[]) => args[0] === 'cp')).toBe(true);
    expect(mockReleaseUpdateLock).toHaveBeenCalled();
  });

  it('preserves backup and returns success when post-swap binary cannot be read for verification', async () => {
    mockCheckDirectoryWritePermission.mockReturnValue(false);
    const goodContent = Buffer.from('correct-binary-content');
    mockFS.readFileSync
      .mockReturnValueOnce(goodContent) // source hash
      .mockReturnValueOnce(goodContent); // staged hash — matches
    // Third readFileSync (target hash) is preceded by statSync — make statSync throw
    let statCallCount = 0;
    mockFS.statSync.mockImplementation(() => {
      statCallCount++;
      // Calls 1-2 are source and staged size; call 3 is target (post-swap) — throw EACCES
      if (statCallCount === 3) {
        const err: NodeJS.ErrnoException = new Error('EACCES: permission denied');
        err.code = 'EACCES';
        throw err;
      }
      return { size: 1024, mtime: new Date(), isDirectory: () => false };
    });

    const result = await applyDownloadedBinary(
      TEMP_FILE,
      TEMP_DIR,
      BINARY_PATH,
      performance.now(),
      makeTelemetryEvent(),
      { toVersion: '2.0.0' },
    );

    expect(result).toEqual({ success: true });
    // Backup must NOT be deleted — it's the user's safety net
    const sudoRmCalls = getSudoCalls().filter(
      (args: string[]) => args[0] === 'rm' && args.includes(BACKUP_PATH),
    );
    expect(sudoRmCalls).toHaveLength(0);
    expect(mockReleaseUpdateLock).toHaveBeenCalled();
  });

  it('returns rename_failed_rollback_broken when both swap and rollback mv fail', async () => {
    mockCheckDirectoryWritePermission.mockReturnValue(false);
    let mvCallCount = 0;
    mockExecFileSync.mockImplementation(((cmd: string, args: string[]) => {
      if (cmd === 'sudo' && args[0] === 'mv') {
        mvCallCount++;
        // First mv: current → backup (ok). Second mv: staged → current (fail).
        // Third mv: backup → current (rollback, also fail).
        if (mvCallCount >= 2) {
          throw new Error('EPERM: operation not permitted');
        }
      }
      return Buffer.from('');
    }) as any);

    const result = await applyDownloadedBinary(
      TEMP_FILE,
      TEMP_DIR,
      BINARY_PATH,
      performance.now(),
      makeTelemetryEvent(),
      { toVersion: '2.0.0' },
    );

    expect(result).toEqual({ success: false, failureReason: 'rename_failed_rollback_broken' });
    // Verify rollback mv was attempted (3 mv calls total)
    const mvCalls = getSudoCalls().filter((args: string[]) => args[0] === 'mv');
    expect(mvCalls).toHaveLength(3);
    expect(mockReleaseUpdateLock).toHaveBeenCalled();
  });

  it('returns rename_failed when sudo mv for current-to-backup fails', async () => {
    mockCheckDirectoryWritePermission.mockReturnValue(false);
    mockExecFileSync.mockImplementation(((cmd: string, args: string[]) => {
      if (cmd === 'sudo' && args[0] === 'mv') {
        throw new Error('EPERM: operation not permitted');
      }
      return Buffer.from('');
    }) as any);

    const result = await applyDownloadedBinary(
      TEMP_FILE,
      TEMP_DIR,
      BINARY_PATH,
      performance.now(),
      makeTelemetryEvent(),
      { toVersion: '2.0.0' },
    );

    expect(result).toEqual({ success: false, failureReason: 'rename_failed' });
    // cp and chmod should have succeeded before mv failed
    expect(getSudoCalls().some((args: string[]) => args[0] === 'cp')).toBe(true);
    expect(getSudoCalls().some((args: string[]) => args[0] === 'chmod')).toBe(true);
    // No rollback mv needed since the binary was never moved
    expect(mockReleaseUpdateLock).toHaveBeenCalled();
  });

  it('returns verification_failed when staged binary cannot be read after sudo cp', async () => {
    mockCheckDirectoryWritePermission.mockReturnValue(false);
    const goodContent = Buffer.from('correct-binary-content');
    // readFileSync call 1 = source hash (ok), call 2 = staged hash (throw EACCES)
    let readCallCount = 0;
    mockFS.readFileSync.mockImplementation(() => {
      readCallCount++;
      if (readCallCount === 2) {
        const err: NodeJS.ErrnoException = new Error('EACCES: permission denied');
        err.code = 'EACCES';
        throw err;
      }
      return goodContent;
    });

    const result = await applyDownloadedBinary(
      TEMP_FILE,
      TEMP_DIR,
      BINARY_PATH,
      performance.now(),
      makeTelemetryEvent(),
      { toVersion: '2.0.0' },
    );

    expect(result).toEqual({ success: false, failureReason: 'verification_failed' });
    expect(mockReleaseUpdateLock).toHaveBeenCalled();
  });

  it('triggers rollback when post-swap read fails with non-permission error (ENOENT)', async () => {
    mockCheckDirectoryWritePermission.mockReturnValue(false);
    const goodContent = Buffer.from('correct-binary-content');
    mockFS.readFileSync
      .mockReturnValueOnce(goodContent) // source hash
      .mockReturnValueOnce(goodContent); // staged hash — matches
    // Third readFileSync (target hash) is preceded by statSync — make statSync throw ENOENT
    let statCallCount = 0;
    mockFS.statSync.mockImplementation(() => {
      statCallCount++;
      if (statCallCount === 3) {
        const err: NodeJS.ErrnoException = new Error('ENOENT: no such file or directory');
        err.code = 'ENOENT';
        throw err;
      }
      return { size: 1024, mtime: new Date(), isDirectory: () => false };
    });

    const result = await applyDownloadedBinary(
      TEMP_FILE,
      TEMP_DIR,
      BINARY_PATH,
      performance.now(),
      makeTelemetryEvent(),
      { toVersion: '2.0.0' },
    );

    expect(result).toEqual({ success: false, failureReason: 'verification_failed' });
    // Should attempt rollback (rm + mv), not treat as success
    const sudoCalls = getSudoCalls();
    expect(
      sudoCalls.some(
        (args: string[]) => args[0] === 'mv' && args[1] === BACKUP_PATH && args[2] === BINARY_PATH,
      ),
    ).toBe(true);
    expect(mockReleaseUpdateLock).toHaveBeenCalled();
  });

  it('rolls back via sudo when post-swap verification fails', async () => {
    mockCheckDirectoryWritePermission.mockReturnValue(false);
    const goodContent = Buffer.from('correct-binary-content');
    const corruptContent = Buffer.from('corrupted-binary-after-swap');
    mockFS.readFileSync
      .mockReturnValueOnce(goodContent) // source hash
      .mockReturnValueOnce(goodContent) // staged hash — matches
      .mockReturnValueOnce(corruptContent); // target hash — mismatch triggers rollback

    const result = await applyDownloadedBinary(
      TEMP_FILE,
      TEMP_DIR,
      BINARY_PATH,
      performance.now(),
      makeTelemetryEvent(),
      { toVersion: '2.0.0' },
    );

    expect(result).toEqual({ success: false, failureReason: 'verification_failed' });
    // Rollback should use sudo: rm corrupted target, mv backup back
    const sudoCalls = getSudoCalls();
    expect(sudoCalls.some((args: string[]) => args[0] === 'rm' && args.includes(BINARY_PATH))).toBe(
      true,
    );
    expect(
      sudoCalls.some(
        (args: string[]) => args[0] === 'mv' && args[1] === BACKUP_PATH && args[2] === BINARY_PATH,
      ),
    ).toBe(true);
    expect(mockReleaseUpdateLock).toHaveBeenCalled();
  });

  it('returns verification_failed_rollback_broken when verification fails and rollback also fails', async () => {
    mockCheckDirectoryWritePermission.mockReturnValue(false);
    const goodContent = Buffer.from('correct-binary-content');
    const corruptContent = Buffer.from('corrupted-binary-after-swap');
    mockFS.readFileSync
      .mockReturnValueOnce(goodContent) // source hash
      .mockReturnValueOnce(goodContent) // staged hash — matches
      .mockReturnValueOnce(corruptContent); // target hash — mismatch triggers rollback

    // Make rollback rm fail so rollback is broken
    let rmCallCount = 0;
    mockExecFileSync.mockImplementation(((cmd: string, args: string[]) => {
      if (cmd === 'sudo' && args[0] === 'rm') {
        rmCallCount++;
        // The rm during rollback (removing corrupt binary) should fail
        if (rmCallCount > 0) {
          throw new Error('EPERM: operation not permitted');
        }
      }
      return Buffer.from('');
    }) as any);

    const result = await applyDownloadedBinary(
      TEMP_FILE,
      TEMP_DIR,
      BINARY_PATH,
      performance.now(),
      makeTelemetryEvent(),
      { toVersion: '2.0.0' },
    );

    expect(result).toEqual({
      success: false,
      failureReason: 'verification_failed_rollback_broken',
    });
    expect(mockReleaseUpdateLock).toHaveBeenCalled();
  });

  it('falls through to verification failure when sudo test -f confirms binary is missing after EACCES', async () => {
    mockCheckDirectoryWritePermission.mockReturnValue(false);
    const goodContent = Buffer.from('correct-binary-content');
    mockFS.readFileSync
      .mockReturnValueOnce(goodContent) // source hash
      .mockReturnValueOnce(goodContent); // staged hash — matches
    // statSync on target throws EACCES (permission denied)
    let statCallCount = 0;
    mockFS.statSync.mockImplementation(() => {
      statCallCount++;
      if (statCallCount === 3) {
        const err: NodeJS.ErrnoException = new Error('EACCES: permission denied');
        err.code = 'EACCES';
        throw err;
      }
      return { size: 1024, mtime: new Date(), isDirectory: () => false };
    });
    // sudo test -f fails — file does not exist
    mockExecFileSync.mockImplementation(((cmd: string, args: string[]) => {
      if (cmd === 'sudo' && args[0] === 'test') {
        throw new Error('test: file not found');
      }
      return Buffer.from('');
    }) as any);

    const result = await applyDownloadedBinary(
      TEMP_FILE,
      TEMP_DIR,
      BINARY_PATH,
      performance.now(),
      makeTelemetryEvent(),
      { toVersion: '2.0.0' },
    );

    expect(result).toEqual({ success: false, failureReason: 'verification_failed' });
    // sudo test -f should have been called
    const testCalls = getSudoCalls().filter((args: string[]) => args[0] === 'test');
    expect(testCalls).toHaveLength(1);
    expect(testCalls[0]).toEqual(['test', '-f', BINARY_PATH]);
    // Rollback mv should have been attempted
    const mvCalls = getSudoCalls().filter((args: string[]) => args[0] === 'mv');
    expect(
      mvCalls.some((args: string[]) => args[1] === BACKUP_PATH && args[2] === BINARY_PATH),
    ).toBe(true);
    expect(mockReleaseUpdateLock).toHaveBeenCalled();
  });
});
