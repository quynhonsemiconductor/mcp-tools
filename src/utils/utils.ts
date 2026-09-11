import { execSync } from 'child_process';
import { logWarn } from '../services/logger';
// Read through createRequire, NOT `import pkg from '../../package.json'`.
//
// Both static forms are platform-dependent on the pinned Bun 1.3.11, which is why the
// note that used to sit here was half right: the import-attribute form
// (`with { type: 'json' }`) fails on macOS, and the plain form — its replacement —
// fails on LINUX with the same "Missing 'default' export in module package.json".
// Local runs are macOS and CI is Linux, so each form looks correct to whoever last
// touched it and breaks for everybody else.
//
// createRequire resolves JSON the CommonJS way, which is not subject to the ESM JSON
// module semantics either form depends on, and behaves the same on both platforms.
import { createRequire } from 'module';

const pkg = createRequire(import.meta.url)('../../package.json') as { version?: unknown };

/**
 * Executes an AppleScript command using the `osascript` command-line tool.
 *
 * @param input - The AppleScript code to execute as a string.
 * @returns The output of the executed AppleScript command as a string.
 *
 * @throws Will throw an error if the `osascript` command fails.
 *
 * Note: Standard error output is ignored by redirecting it to `/dev/null`.
 */
export const executeOSAScript = (input: string): string =>
  execSync('osascript', {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'ignore'], // Redirect stderr to /dev/null
  });

/**
 * Logs a message to the console if the condition is true.
 * @param message The message to log.
 * @param condition The condition to check.
 */
export const logIf = (message: string, condition: boolean): void => {
  if (condition) {
    // eslint-disable-next-line no-console -- logIf is the verbose stdout helper; console is intended
    console.log(message);
  }
};

/**
 * Logs a warning message to the console if the condition is true.
 * @param message The warning message to log.
 * @param condition The condition to check.
 */
export const warnIf = (message: string, condition: boolean): void => {
  if (condition) {
    // eslint-disable-next-line no-console -- warnIf is the verbose stderr helper; console is intended
    console.warn(message);
  }
};

/**
 * Keys already warned about via warnOnce, so repeat `isEnabled()` checks
 * (called on every tool-registry filter pass) don't spam the log.
 */
const warnedKeys = new Set<string>();

/**
 * Logs a warning exactly once per distinct `key` for the life of the process.
 * Used by per-category base tools (e.g. PostgreSQL, GitHub) to alert the user
 * once when required credentials/config are missing, instead of on every check.
 */
export const warnOnce = (key: string, message: string): void => {
  if (warnedKeys.has(key)) {
    return;
  }
  warnedKeys.add(key);
  logWarn(message);
};

/**
 * Cached application version to avoid repeated require() calls.
 */
let cachedAppVersion: string | null = null;

/**
 * Get the current application version from package.json.
 * The result is cached to avoid repeated require() calls on hot paths.
 * Returns 'unknown' if the version cannot be determined.
 */
export function getAppVersion(): string {
  if (cachedAppVersion === null) {
    cachedAppVersion = typeof pkg.version === 'string' ? pkg.version : 'unknown';
  }
  return cachedAppVersion;
}
