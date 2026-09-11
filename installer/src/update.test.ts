import { describe, it, expect, beforeEach, spyOn } from 'bun:test';
import * as fs from 'fs';
import {
  mockSpawn,
  resetInstallerMocks,
} from './test-utils/mocks';
import { checkExistingBinary, tryUpdate, evaluateUpdateResult, UPDATE_EXIT_CODES } from './update';

describe('update', () => {
  beforeEach(() => {
    resetInstallerMocks();
  });

  describe('checkExistingBinary', () => {
    it('returns null if binary does not exist', async () => {
      const existsSpy = spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = await checkExistingBinary('/path/to/binary');

      expect(result).toBeNull();
      expect(existsSpy).toHaveBeenCalledWith('/path/to/binary');
      existsSpy.mockRestore();
    });

    it('returns version string if binary exists and runs successfully', async () => {
      const existsSpy = spyOn(fs, 'existsSync').mockReturnValue(true);

      const resultPromise = checkExistingBinary('/path/to/binary');

      // Get the spawned process and simulate version output + success
      const spawnedProcess = mockSpawn.mock.results[0].value;
      spawnedProcess.stdout.emit('data', Buffer.from('3.7.0'));
      spawnedProcess.emit('close', 0);

      const result = await resultPromise;
      expect(result).toBe('3.7.0');
      existsSpy.mockRestore();
    });

    it('returns "unknown" if binary exits successfully with no stdout', async () => {
      const existsSpy = spyOn(fs, 'existsSync').mockReturnValue(true);

      const resultPromise = checkExistingBinary('/path/to/binary');

      const spawnedProcess = mockSpawn.mock.results[0].value;
      spawnedProcess.emit('close', 0);

      const result = await resultPromise;
      expect(result).toBe('unknown');
      existsSpy.mockRestore();
    });

    it('returns null if binary exists but exits with error', async () => {
      const existsSpy = spyOn(fs, 'existsSync').mockReturnValue(true);

      const resultPromise = checkExistingBinary('/path/to/binary');

      const spawnedProcess = mockSpawn.mock.results[0].value;
      spawnedProcess.emit('close', 1);

      const result = await resultPromise;
      expect(result).toBeNull();
      existsSpy.mockRestore();
    });

    it('returns null if spawn throws an error', async () => {
      const existsSpy = spyOn(fs, 'existsSync').mockReturnValue(true);

      const resultPromise = checkExistingBinary('/path/to/binary');

      const spawnedProcess = mockSpawn.mock.results[0].value;
      spawnedProcess.emit('error', new Error('spawn failed'));

      const result = await resultPromise;
      expect(result).toBeNull();
      existsSpy.mockRestore();
    });
  });

  describe('tryUpdate', () => {
    it('returns success when update exits with SUCCESS code', async () => {
      const resultPromise = tryUpdate('/path/to/binary');

      const spawnedProcess = mockSpawn.mock.results[0].value;
      spawnedProcess.emit('close', UPDATE_EXIT_CODES.SUCCESS, null);

      const result = await resultPromise;
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(UPDATE_EXIT_CODES.SUCCESS);
      expect(result.message).toBe('Update successful');
    });

    it('returns success when already up to date', async () => {
      const resultPromise = tryUpdate('/path/to/binary');

      const spawnedProcess = mockSpawn.mock.results[0].value;
      spawnedProcess.emit('close', UPDATE_EXIT_CODES.ALREADY_UP_TO_DATE, null);

      const result = await resultPromise;
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(UPDATE_EXIT_CODES.ALREADY_UP_TO_DATE);
      expect(result.message).toBe('Already running the latest version');
    });

    it('returns failure with no fallback when file is locked', async () => {
      const resultPromise = tryUpdate('/path/to/binary');

      const spawnedProcess = mockSpawn.mock.results[0].value;
      spawnedProcess.emit('close', UPDATE_EXIT_CODES.FILE_LOCKED, null);

      const result = await resultPromise;
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(UPDATE_EXIT_CODES.FILE_LOCKED);
      expect(result.shouldFallbackToFreshInstall).toBe(false);
    });

    it('returns failure with fallback when permission denied', async () => {
      const resultPromise = tryUpdate('/path/to/binary');

      const spawnedProcess = mockSpawn.mock.results[0].value;
      spawnedProcess.emit('close', UPDATE_EXIT_CODES.PERMISSION_DENIED, null);

      const result = await resultPromise;
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(UPDATE_EXIT_CODES.PERMISSION_DENIED);
      expect(result.shouldFallbackToFreshInstall).toBe(true);
    });

    it('returns failure with fallback when no auth token', async () => {
      const resultPromise = tryUpdate('/path/to/binary');

      const spawnedProcess = mockSpawn.mock.results[0].value;
      spawnedProcess.emit('close', UPDATE_EXIT_CODES.NO_AUTH_TOKEN, null);

      const result = await resultPromise;
      expect(result.success).toBe(false);
      expect(result.shouldFallbackToFreshInstall).toBe(true);
      expect(result.message).toContain('corrupted');
    });

    it('handles timeout (SIGTERM)', async () => {
      const resultPromise = tryUpdate('/path/to/binary');

      const spawnedProcess = mockSpawn.mock.results[0].value;
      spawnedProcess.emit('close', null, 'SIGTERM');

      const result = await resultPromise;
      expect(result.success).toBe(false);
      expect(result.message).toContain('timed out');
      expect(result.shouldFallbackToFreshInstall).toBe(true);
    });

    it('handles spawn errors', async () => {
      const resultPromise = tryUpdate('/path/to/binary');

      const spawnedProcess = mockSpawn.mock.results[0].value;
      spawnedProcess.emit('error', new Error('spawn ENOENT'));

      const result = await resultPromise;
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(-1);
      expect(result.shouldFallbackToFreshInstall).toBe(true);
    });

    it('captures stderr in failure message', async () => {
      const resultPromise = tryUpdate('/path/to/binary');

      const spawnedProcess = mockSpawn.mock.results[0].value;
      spawnedProcess.stderr.emit('data', Buffer.from('Error: something went wrong'));
      spawnedProcess.emit('close', 99, null);

      const result = await resultPromise;
      expect(result.success).toBe(false);
      expect(result.message).toContain('something went wrong');
    });
  });

  describe('evaluateUpdateResult', () => {
    it('returns "updated" when update succeeds with SUCCESS exit code', () => {
      const result = evaluateUpdateResult(
        { success: true, exitCode: UPDATE_EXIT_CODES.SUCCESS, message: 'Update successful' },
        '3.6.0',
        null
      );
      expect(result.action).toBe('updated');
      expect(result.message).toBe('Update successful');
    });

    it('returns "updated" when ALREADY_UP_TO_DATE and version changed', () => {
      const result = evaluateUpdateResult(
        { success: true, exitCode: UPDATE_EXIT_CODES.ALREADY_UP_TO_DATE, message: 'Already running the latest version' },
        '3.6.0',
        '3.7.0'
      );
      expect(result.action).toBe('updated');
    });

    it('returns "fresh_install" when ALREADY_UP_TO_DATE but version unchanged', () => {
      const result = evaluateUpdateResult(
        { success: true, exitCode: UPDATE_EXIT_CODES.ALREADY_UP_TO_DATE, message: 'Already running the latest version' },
        '3.6.0',
        '3.6.0'
      );
      expect(result.action).toBe('fresh_install');
      expect(result.message).toContain('unchanged');
    });

    it('returns "updated" when ALREADY_UP_TO_DATE and postVersion is null', () => {
      // If we can't read the version after update, trust the binary's claim
      const result = evaluateUpdateResult(
        { success: true, exitCode: UPDATE_EXIT_CODES.ALREADY_UP_TO_DATE },
        '3.6.0',
        null
      );
      expect(result.action).toBe('updated');
    });

    it('returns "abort" when update fails with no fallback (file locked)', () => {
      const result = evaluateUpdateResult(
        { success: false, exitCode: UPDATE_EXIT_CODES.FILE_LOCKED, message: 'File locked', shouldFallbackToFreshInstall: false },
        '3.6.0',
        null
      );
      expect(result.action).toBe('abort');
      expect(result.message).toBe('File locked');
      expect((result as any).exitCode).toBe(UPDATE_EXIT_CODES.FILE_LOCKED);
    });

    it('returns "fresh_install" when update fails with fallback flag', () => {
      const result = evaluateUpdateResult(
        { success: false, exitCode: UPDATE_EXIT_CODES.NO_AUTH_TOKEN, message: 'No auth', shouldFallbackToFreshInstall: true },
        '3.6.0',
        null
      );
      expect(result.action).toBe('fresh_install');
    });

    it('returns "fresh_install" when update fails with permission denied', () => {
      const result = evaluateUpdateResult(
        { success: false, exitCode: UPDATE_EXIT_CODES.PERMISSION_DENIED, message: 'Permission denied', shouldFallbackToFreshInstall: true },
        '3.6.0',
        null
      );
      expect(result.action).toBe('fresh_install');
    });
  });
});
