/**
 * env-filter.ts - Environment variable filtering utilities
 *
 * This module provides utilities for filtering environment variables
 * for secure sandbox execution.
 */
import { logDebug } from '../../services/logger';
import { EnvVarConfig } from '../types';

/**
 * Safely filters environment variables to only include those that are:
 * 1. Listed in the provided envVars configuration
 * 2. Part of a safe system environment variable whitelist
 */
export function filterEnvironmentVariables(
  envVars: EnvVarConfig[] | undefined,
  options: {
    customEnv?: Record<string, string>;
    includeSafeSystemVars?: boolean;
  } = {},
): Record<string, string> {
  const { customEnv = {}, includeSafeSystemVars = true } = options;

  const filteredEnv: Record<string, string> = {};

  if (includeSafeSystemVars) {
    const safeSystemEnvVars = [
      // Path-related
      'PATH',
      'PATHEXT',
      // Terminal-related
      'TERM',
      'TERM_PROGRAM',
      'TERM_PROGRAM_VERSION',
      // Locale/language
      'LANG',
      'LANGUAGE',
      'LC_ALL',
      'LC_CTYPE',
      // User/home
      'HOME',
      'USER',
      'USERPROFILE',
      'USERNAME',
      // OS/platform
      'OS',
      'PLATFORM',
      // Temp directories
      'TEMP',
      'TMP',
      'TMPDIR',
      // Time zone
      'TZ',
    ];

    for (const varName of safeSystemEnvVars) {
      if (process.env[varName]) {
        filteredEnv[varName] = process.env[varName]!;
      }
    }
  }

  // Process all environment variables defined in metadata.json
  if (envVars && Array.isArray(envVars)) {
    logDebug(`Supplied environment variables: ${envVars.map((v) => v.name).join(', ')}`);
    for (const envVar of envVars) {
      const envVarName = envVar.name;

      // Priority order: customEnv > process.env > default (never use mock in runtime)
      if (customEnv && envVarName in customEnv) {
        // 1. Use explicitly provided value (highest priority)
        filteredEnv[envVarName] = customEnv[envVarName];
      } else if (process.env[envVarName]) {
        // 2. Use value from process.env
        filteredEnv[envVarName] = process.env[envVarName]!;
      } else if (envVar.default !== undefined) {
        // 3. Use default value if available
        filteredEnv[envVarName] = envVar.default;
      } else if (envVar.required) {
        // Log warning for required variables with no value
        logDebug(`WARNING: Missing required environment variable: ${envVarName}`);

        if (process.env[envVarName]) {
          logDebug(`Note: ${envVarName} exists in process.env but wasn't copied`);
        }
      }
    }
  } else if (customEnv) {
    // If no environment variables are defined, use the custom env
    logDebug('No environment variables defined in metadata.json, using customEnv');
    Object.assign(filteredEnv, customEnv);
  }

  // Log detailed information about the filtered environment variables
  logDebug(`Filtered environment: ${Object.keys(filteredEnv).length} variables`);

  // Log any required variables that might be missing
  if (envVars && Array.isArray(envVars)) {
    for (const envVar of envVars) {
      if (envVar.required && !filteredEnv[envVar.name]) {
        logDebug(
          `WARNING: Required env var ${envVar.name} is missing and no default value is available`,
        );
      }
    }
  }

  return filteredEnv;
}
