export const EXIT_CODES = {
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
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export function mapFailureToExitCode(failureReason?: string): ExitCode {
  switch (failureReason) {
    case 'file_locked':
    case 'file_locked_timeout':
    case 'rename_failed':
    case 'copy_failed':
    case 'too_many_backups':
      return EXIT_CODES.FILE_LOCKED;
    case 'permission_denied':
      return EXIT_CODES.PERMISSION_DENIED;
    case 'download_failed':
      return EXIT_CODES.DOWNLOAD_FAILED;
    case 'verification_failed':
      return EXIT_CODES.VERIFICATION_FAILED;
    case 'concurrent_update':
      return EXIT_CODES.CONCURRENT_UPDATE;
    case 'binary_path_unknown':
      return EXIT_CODES.BINARY_PATH_UNKNOWN;
    // NOTE: the compound 'rename_failed_rollback_broken' /
    // 'verification_failed_rollback_broken' reasons intentionally fall through
    // to GENERAL_ERROR. Mapping them to FILE_LOCKED/VERIFICATION_FAILED would
    // flip the installer's fresh-install recovery off (its FILE_LOCKED branch
    // sets shouldFallbackToFreshInstall: false) for the exact failure mode that
    // most needs a fresh install. Giving them distinct, recoverable exit codes
    // is tracked as a follow-up.
    default:
      return EXIT_CODES.GENERAL_ERROR;
  }
}
