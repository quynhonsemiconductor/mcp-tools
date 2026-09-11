/**
 * QNSC-MCP Config validation checks
 *
 * This module exports all QNSC-MCP checks and provides explicit registration.
 * Registration state is tracked centrally by the check registry - no
 * module-level boolean flags needed.
 *
 * Note: The "enabled tools count" check was moved to doctor.ts as a cross-config
 * check because it needs visibility into both MCP JSON configs and QNSC-MCP config
 * to accurately determine if any functionality is enabled.
 */

import { registerCheck } from '../../check-registry';

// Import checks (they export their check objects, no side-effect registration)
import { architectureCheck } from './architecture';
import { bundledMcpEnvVarValidation, bundledMcpReferenceValidation } from './bundled-mcps';
import { categoryReferenceValidation } from './category-references';
import { deprecatedConfigAliasCheck } from './deprecated-config-aliases';
import { deprecatedEnvVarCheck } from './deprecated-env-vars';
import { keyringHealthCheck } from './keyring-health';
import { localMcpEnvVarValidation, localMcpReferenceValidation } from './local-mcps';
import { remoteMcpEnvVarValidation, remoteMcpReferenceValidation } from './remote-mcps';
import { tlsTrustStoreCheck } from './tls-trust-store';
import { toolReferenceValidation } from './tool-references';

// Re-export for direct access
export {
  architectureCheck,
  bundledMcpEnvVarValidation,
  bundledMcpReferenceValidation,
  categoryReferenceValidation,
  deprecatedConfigAliasCheck,
  deprecatedEnvVarCheck,
  keyringHealthCheck,
  localMcpEnvVarValidation,
  localMcpReferenceValidation,
  remoteMcpEnvVarValidation,
  remoteMcpReferenceValidation,
  tlsTrustStoreCheck,
  toolReferenceValidation,
};

/**
 * All QNSC-MCP checks in registration order
 */
export const qnscMcpChecks = [
  architectureCheck, // Run early for system-level checks
  keyringHealthCheck, // Run early to detect credential storage issues
  tlsTrustStoreCheck, // Run early to detect TLS trust store issues
  toolReferenceValidation,
  categoryReferenceValidation,
  bundledMcpReferenceValidation,
  bundledMcpEnvVarValidation,
  remoteMcpReferenceValidation,
  remoteMcpEnvVarValidation,
  localMcpReferenceValidation,
  localMcpEnvVarValidation,
  deprecatedEnvVarCheck,
  deprecatedConfigAliasCheck,
];

/**
 * Register all QNSC-MCP checks with the registry.
 * Called by the parent checks/index.ts module, which tracks registration
 * state centrally via the check registry.
 */
export function registerQnscMcpChecks(): void {
  for (const check of qnscMcpChecks) {
    registerCheck(check);
  }
}
