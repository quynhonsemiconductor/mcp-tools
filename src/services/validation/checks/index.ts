/**
 * Validation checks registration
 *
 * This module registers all validation checks with the check registry.
 * Import this module to ensure all checks are available.
 *
 * Note: Registration is tracked using the check registry's own state via
 * getAllCheckIds(). This eliminates the need for separate module-level
 * boolean flags and ensures the registration state is always in sync
 * with the actual registry contents.
 */

import { checkRegistry } from '../check-registry';
import { registerQnscMcpChecks } from './qnscmcp';
import { registerMcpChecks } from './mcp';

// IDs of checks registered by each module - used to determine if registration has occurred
const MCP_CHECK_PREFIX = 'mcp.';
const QNSCMCP_CHECK_PREFIX = 'qnsc-mcp.';

/**
 * Check if MCP checks have been registered
 */
function areMcpChecksRegistered(): boolean {
  return checkRegistry.getAllCheckIds().some((id) => id.startsWith(MCP_CHECK_PREFIX));
}

/**
 * Check if QNSC-MCP checks have been registered
 */
function areQnscMcpChecksRegistered(): boolean {
  return checkRegistry.getAllCheckIds().some((id) => id.startsWith(QNSCMCP_CHECK_PREFIX));
}

/**
 * Register all validation checks.
 * This is idempotent - calling multiple times has no effect.
 *
 * Uses the registry state to determine if checks are already registered,
 * avoiding the need for separate boolean flags.
 *
 * Note: This implementation assumes single-threaded Node.js execution.
 * The check-then-register pattern is safe because JavaScript is single-threaded
 * and there's no await between the check and registration.
 */
export function registerAllChecks(): void {
  if (!areMcpChecksRegistered()) {
    registerMcpChecks();
  }

  if (!areQnscMcpChecksRegistered()) {
    registerQnscMcpChecks();
  }
}

/**
 * Reset all registration states.
 * This clears the check registry, which automatically resets registration state.
 * Only intended for use in tests.
 */
export function resetAllChecksRegistration(): void {
  checkRegistry.reset();
}

// Re-export check modules for direct access
export * from './qnscmcp';
export * from './mcp';
