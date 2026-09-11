/**
 * Validation system for MCP configurations
 *
 * This module provides a check-registry-based validation system that is
 * highly extensible. New checks can be added by implementing the
 * ValidationCheck interface and registering them with the registry.
 *
 * @example
 * ```typescript
 * import { ConfigValidator, registerCheck, ValidationCheck, McpConfigContext } from './validation';
 *
 * // Create a custom check
 * const myCheck: ValidationCheck<McpConfigContext> = {
 *   id: 'my-custom-check',
 *   name: 'My Custom Check',
 *   description: 'Checks for something custom',
 *   appliesTo: 'mcp-config',
 *   run(context) {
 *     // Return issues found
 *     return [];
 *   }
 * };
 *
 * // Register it
 * registerCheck(myCheck);
 *
 * // Use the validator
 * const result = await ConfigValidator.validateConfigFile('/path/to/config.json');
 * ```
 */

// Export types
export type {
  QnscMcpConfigContext,
  QnscMcpToolsConfig,
  McpConfigContext,
  McpServerConfig,
  ValidationCheck,
  ValidationContext,
  ValidationIssue,
  ValidationOptions,
  ValidationResult,
  ValidationSeverity,
} from './types';

export { isQnscMcpConfigContext, isMcpConfigContext } from './types';

// Export check registry
export {
  checkRegistry,
  registerCheck,
  validateQnscMcpConfig,
  validateMcpConfig,
} from './check-registry';

// Export validator
export { ConfigValidator } from './validator';
export type { McpConfigInfo } from './validator';

// Export check registration
export { registerAllChecks, resetAllChecksRegistration } from './checks';

// Export issue codes and recommendations
export {
  QNSCMCP_ISSUE_CODES,
  ISSUE_CODES,
  ISSUE_RECOMMENDATIONS,
  isIssueCode,
  MCP_ISSUE_CODES,
} from './issue-codes';
export type { IssueCode } from './issue-codes';

// Export constants for custom check implementations
export {
  ARGS_FOR_EXECUTABLE_UNIQUENESS,
  CHECK_PRIORITIES,
  CLI_COMMANDS,
  DEFAULT_CHECK_PRIORITY,
  MIN_SECRET_LENGTH,
  VALIDATION_PATTERNS,
} from './constants';

// Export utilities for custom check implementations
export { PLACEHOLDER_PATTERNS, isPlaceholderValue } from './utils/placeholder-detection';
export { forEachServer, getServerCount, getServersFromContext } from './utils/server-helpers';

// Export diagnostics for doctor CLI and tool
export {
  aggregateResults,
  checkEnabledFunctionality,
  formatIssueMessage,
  getRecommendations,
  getSearchedPaths,
  groupBySource,
  runDiagnostics,
} from './diagnostics';
export type {
  AggregatedDiagnostics,
  ConfigValidationResult,
  DiagnosticsOptions,
  DiagnosticsResult,
} from './diagnostics';
