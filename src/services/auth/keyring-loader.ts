/**
 * Native keyring loader for compiled binaries.
 *
 * This module provides a direct interface to the @napi-rs/keyring native binding.
 * It bypasses the standard @napi-rs/keyring wrapper which uses dynamic requires
 * that don't work correctly when bundled with Bun's --compile flag.
 *
 * The NAPI_RS_NATIVE_LIBRARY_PATH environment variable is set up in src/bin/mcp.ts
 * before any imports, allowing us to directly require the native binding.
 */

import { logDebug, logError } from '../logger';
import type { KeyringEntry, KeyringEntryConstructor } from './types';

// Re-export types for convenience
export type { KeyringEntry, KeyringEntryConstructor };

/** Shape of the native keyring module (either the direct binding or the @napi-rs/keyring package). */
interface KeyringModuleExports {
  Entry?: KeyringEntryConstructor;
}

/** Type guard narrowing an unknown `require()` result to a module exposing an `Entry` export. */
function hasEntryExport(mod: unknown): mod is KeyringModuleExports {
  return typeof mod === 'object' && mod !== null && 'Entry' in mod;
}

/**
 * Cached Entry class reference.
 */
let EntryClass: KeyringEntryConstructor | null = null;

/**
 * Flag to track if we've attempted to load the binding.
 */
let loadAttempted = false;

/**
 * Error from load attempt (if any).
 */
let loadError: Error | null = null;

/**
 * Get the Entry class from the keyring native binding.
 *
 * This function handles loading the native binding in a way that works
 * both in development (using @napi-rs/keyring) and in compiled binaries
 * (using the direct native binding path).
 *
 * @returns The Entry constructor class, or throws if not available
 */
export function getKeyringEntry(): KeyringEntryConstructor {
  if (EntryClass) {
    return EntryClass;
  }

  if (loadAttempted && loadError) {
    throw loadError;
  }

  loadAttempted = true;

  // Try loading via NAPI_RS_NATIVE_LIBRARY_PATH first (for compiled binaries)
  const nativeLibPath = process.env.NAPI_RS_NATIVE_LIBRARY_PATH;
  if (nativeLibPath) {
    try {
      logDebug(`Loading keyring from native path: ${nativeLibPath}`);
      // Use require to load the native binding directly
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const binding: unknown = require(nativeLibPath);
      if (hasEntryExport(binding) && binding.Entry) {
        EntryClass = binding.Entry;
        logDebug('Successfully loaded keyring Entry class from native path');
        return EntryClass;
      }
    } catch (error) {
      logDebug(`Failed to load from native path: ${error instanceof Error ? error.message : String(error)}`);
      // Fall through to try the standard import
    }
  }

  // Fall back to standard @napi-rs/keyring import (for development)
  try {
    logDebug('Loading keyring from @napi-rs/keyring package');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const keyring: unknown = require('@napi-rs/keyring');
    if (hasEntryExport(keyring) && keyring.Entry) {
      EntryClass = keyring.Entry;
      logDebug('Successfully loaded keyring Entry class from package');
      return EntryClass;
    }
  } catch (error) {
    logError(`Failed to load @napi-rs/keyring: ${error instanceof Error ? error.message : String(error)}`);
  }

  loadError = new Error(
    'Failed to load keyring native binding. ' +
      'OS credential storage will not be available. ' +
      `NAPI_RS_NATIVE_LIBRARY_PATH=${nativeLibPath || 'not set'}`,
  );
  throw loadError;
}

/**
 * Check if the keyring binding is available.
 *
 * @returns true if the keyring binding can be loaded, false otherwise
 */
export function isKeyringAvailable(): boolean {
  try {
    getKeyringEntry();
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect if a keyring operation error indicates corruption or access issues.
 * This happens when keyring entries become stale or incompatible after upgrades,
 * causing repeated password prompts or access denied errors.
 *
 * @param error - The error from a keyring operation
 * @returns True if this appears to be corruption requiring recovery
 */
export function isKeyringCorrupted(error: unknown): boolean {
  const errorStr = String(error).toLowerCase();

  // macOS-specific: repeated password prompts or access denied errors
  const macOSIndicators = [
    'user canceled',
    'user interaction required',
    'errsecauthfailed',
    'errsecusercanceled',
    'password required',
    'access denied',
  ];

  // Windows-specific: credential access errors
  // Note: 'element not found' and 'credential not found' are normal "entry doesn't exist"
  // errors, not corruption — they must NOT be listed here to avoid false-positive recovery.
  const windowsIndicators = ['access is denied', 'the stub received bad data'];

  // Linux-specific: secret service errors
  // Note: 'no such secret' and 'nosuchobject' are normal "entry doesn't exist" errors,
  // not corruption — they must NOT trigger recovery.
  const linuxIndicators = ['prompt dismissed', 'user dismissed'];

  const allIndicators = [...macOSIndicators, ...windowsIndicators, ...linuxIndicators];

  if (allIndicators.some((indicator) => errorStr.includes(indicator))) {
    return true;
  }

  // Special handling for freedesktop Secret Service errors: the 'org.freedesktop.secret'
  // prefix appears in all D-Bus errors from this service, including benign "not found"
  // errors like 'org.freedesktop.Secret.Error.NoSuchObject'. Only treat it as corruption
  // if it does NOT look like a "not found" variant.
  if (errorStr.includes('org.freedesktop.secret')) {
    const isNotFound = errorStr.includes('nosuchobject') || errorStr.includes('no such');
    return !isNotFound;
  }

  return false;
}

/**
 * Get platform-specific instructions for manually recovering from keyring corruption.
 *
 * @param serviceName - The keyring service name (e.g., "qnsc-mcp-github")
 * @param platform - The OS platform (defaults to process.platform)
 * @returns Instructions string with commands to run
 */
export function getRecoveryInstructions(
  serviceName: string,
  platform: string = process.platform,
): string {
  if (platform === 'darwin') {
    return (
      `macOS: Open Keychain Access or run these commands:\n` +
      `  security delete-generic-password -s "${serviceName}" ~/Library/Keychains/login.keychain-db\n` +
      `  security delete-generic-password -s "${serviceName}" -a "__token_index__" ~/Library/Keychains/login.keychain-db`
    );
  } else if (platform === 'win32') {
    return (
      `Windows: Open Credential Manager (Control Panel → User Accounts → Credential Manager) ` +
      `and delete entries named "${serviceName}"`
    );
  } else {
    // Linux
    return (
      `Linux: Use your distribution's credential manager (GNOME Keyring, KWallet, etc.) ` +
      `or secret-tool:\n` +
      `  secret-tool clear service "${serviceName}"`
    );
  }
}

/**
 * Reset the cached keyring Entry class for testing purposes.
 * This allows tests to re-evaluate mocks when resetting the token store.
 * @internal Should only be used in test files
 */
export function resetKeyringLoaderForTesting(): void {
  EntryClass = null;
  loadAttempted = false;
  loadError = null;
}
