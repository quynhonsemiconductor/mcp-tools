import { execSync } from 'child_process';
import { logWarn } from '../services/logger';
// The version comes from a constant, because every way of reading package.json here
// has failed somewhere. The history is worth keeping, since each fix looked correct
// to whoever made it:
//
//   - `import pkg from '...' with { type: 'json' }` — fails on macOS.
//   - `import pkg from '...'` — fails on Linux, "Missing 'default' export".
//   - `createRequire(import.meta.url)('...')` — works in development on both, and
//     broke every compiled binary. This line ran at module scope, so the executable
//     exited before serving a single request: "Cannot find module
//     '../../package.json' from '/$bunfs/root/src/bin/mcp.js'". Releases v0.1.3 and
//     v0.1.4 both shipped that way and neither could start.
//
// Local runs were macOS and CI was Linux, so the platform gap got attention while
// the compiled artifact — the only form teammates install — was never started.
import { PACKAGE_VERSION } from './version';

/**
 * Output limit for `osascript`, well above Node's 1 MB default.
 *
 * The clipboard tool returns images as well as text, so anyone who has taken a
 * screenshot has more than 1 MB on the clipboard, and the read failed with
 * ENOBUFS — a routine action breaking the tool.
 */
export const OSASCRIPT_MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Executes an AppleScript command using the `osascript` command-line tool.
 *
 * @param input - The AppleScript code to execute as a string.
 * @param maxBuffer - Largest output accepted, in bytes.
 * @returns The output of the executed AppleScript command as a string.
 *
 * @throws Will throw an error if the `osascript` command fails.
 *
 * Note: Standard error output is ignored by redirecting it to `/dev/null`.
 */
export const executeOSAScript = (input: string, maxBuffer = OSASCRIPT_MAX_BUFFER): string =>
  execSync('osascript', {
    encoding: 'utf8',
    input,
    maxBuffer,
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
    cachedAppVersion = PACKAGE_VERSION;
  }
  return cachedAppVersion;
}
