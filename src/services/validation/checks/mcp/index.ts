/**
 * MCP Config validation checks
 *
 * This module exports all MCP checks and provides explicit registration.
 * Registration state is tracked centrally by the check registry - no
 * module-level boolean flags needed.
 */

import { registerCheck } from '../../check-registry';

// Import checks (they export their check objects, no side-effect registration)
import { duplicateExecutableCheck } from './duplicate-executables';
import { envVarExpansionCheck } from './env-var-expansion';
import { envVarValidation } from './env-vars';
import { argFilePathValidation, executablePathValidation } from './executable-paths';
import { hardcodedSecretsCheck } from './hardcoded-secrets';
import { noServersCheck } from './no-servers';
import { serverNameValidation } from './server-names';

// Re-export for direct access
export {
  argFilePathValidation,
  duplicateExecutableCheck,
  envVarExpansionCheck,
  envVarValidation,
  executablePathValidation,
  hardcodedSecretsCheck,
  noServersCheck,
  serverNameValidation,
};

/**
 * All MCP checks in registration order
 */
export const mcpChecks = [
  noServersCheck,
  serverNameValidation,
  executablePathValidation,
  argFilePathValidation,
  duplicateExecutableCheck,
  hardcodedSecretsCheck,
  envVarValidation,
  envVarExpansionCheck,
];

/**
 * Register all MCP checks with the registry.
 * Called by the parent checks/index.ts module, which tracks registration
 * state centrally via the check registry.
 */
export function registerMcpChecks(): void {
  for (const check of mcpChecks) {
    registerCheck(check);
  }
}
