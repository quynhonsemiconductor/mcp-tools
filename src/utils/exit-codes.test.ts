import { describe, expect, it } from 'bun:test';
import { INSTALL_EXIT_CODES } from '../commands/install';
import { EXIT_CODES, mapFailureToExitCode } from './exit-codes';

describe('mapFailureToExitCode', () => {
  it('should return FILE_LOCKED for file_locked', () => {
    expect(mapFailureToExitCode('file_locked')).toBe(INSTALL_EXIT_CODES.FILE_LOCKED);
  });

  it('should return FILE_LOCKED for file_locked_timeout', () => {
    expect(mapFailureToExitCode('file_locked_timeout')).toBe(INSTALL_EXIT_CODES.FILE_LOCKED);
  });

  it('should return PERMISSION_DENIED for permission_denied', () => {
    expect(mapFailureToExitCode('permission_denied')).toBe(INSTALL_EXIT_CODES.PERMISSION_DENIED);
  });

  it('should return DOWNLOAD_FAILED for download_failed', () => {
    expect(mapFailureToExitCode('download_failed')).toBe(INSTALL_EXIT_CODES.DOWNLOAD_FAILED);
  });

  it('should return VERIFICATION_FAILED for verification_failed', () => {
    expect(mapFailureToExitCode('verification_failed')).toBe(
      INSTALL_EXIT_CODES.VERIFICATION_FAILED,
    );
  });

  it('should return CONCURRENT_UPDATE for concurrent_update', () => {
    expect(mapFailureToExitCode('concurrent_update')).toBe(INSTALL_EXIT_CODES.CONCURRENT_UPDATE);
  });

  it('should return BINARY_PATH_UNKNOWN for binary_path_unknown', () => {
    expect(mapFailureToExitCode('binary_path_unknown')).toBe(
      INSTALL_EXIT_CODES.BINARY_PATH_UNKNOWN,
    );
  });

  it('should return FILE_LOCKED for rename_failed', () => {
    expect(mapFailureToExitCode('rename_failed')).toBe(INSTALL_EXIT_CODES.FILE_LOCKED);
  });

  it('should return FILE_LOCKED for copy_failed', () => {
    expect(mapFailureToExitCode('copy_failed')).toBe(INSTALL_EXIT_CODES.FILE_LOCKED);
  });

  it('should return FILE_LOCKED for too_many_backups', () => {
    expect(mapFailureToExitCode('too_many_backups')).toBe(INSTALL_EXIT_CODES.FILE_LOCKED);
  });

  // The compound rollback-broken reasons fall through to GENERAL_ERROR on
  // purpose — see the note in exit-codes.ts. Mapping them to FILE_LOCKED would
  // disable the installer's fresh-install recovery for the worst failure mode.
  it('should return GENERAL_ERROR for rename_failed_rollback_broken', () => {
    expect(mapFailureToExitCode('rename_failed_rollback_broken')).toBe(
      INSTALL_EXIT_CODES.GENERAL_ERROR,
    );
  });

  it('should return GENERAL_ERROR for verification_failed_rollback_broken', () => {
    expect(mapFailureToExitCode('verification_failed_rollback_broken')).toBe(
      INSTALL_EXIT_CODES.GENERAL_ERROR,
    );
  });

  it('should return GENERAL_ERROR for unknown reason', () => {
    expect(mapFailureToExitCode('something_unknown')).toBe(INSTALL_EXIT_CODES.GENERAL_ERROR);
  });

  it('should return GENERAL_ERROR for undefined', () => {
    expect(mapFailureToExitCode(undefined)).toBe(INSTALL_EXIT_CODES.GENERAL_ERROR);
  });
});

// I11: pin the wire contract. These numbers are read by the Electron installer
// (installer/src/update.ts) and by wrapper scripts — changing one is a breaking
// change. The prior suite only asserted the switch's shape (both sides resolved
// from the same object), so a shifted numeric value passed silently.
describe('EXIT_CODES contract', () => {
  it('pins the numeric values', () => {
    expect({ ...EXIT_CODES }).toEqual({
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
      CI_IN_PROGRESS: 11,
    });
  });

  it('stays in sync with the installer package copy', () => {
    // The installer is a separate package and hand-mirrors this map; guard the drift.
    const { UPDATE_EXIT_CODES } = require('../../installer/src/update');
    expect({ ...UPDATE_EXIT_CODES }).toEqual({ ...EXIT_CODES });
  });
});
