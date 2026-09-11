/**
 * Environment variable validation for MCP configs
 *
 * Validates environment variables defined in server configurations:
 * - Detects empty/missing values that will cause runtime failures
 * - Identifies placeholder values that need to be replaced with real values
 *
 * This check helps catch configuration errors before they cause
 * mysterious failures when servers start.
 *
 * @example
 * // These will trigger warnings
 * {
 *   "servers": {
 *     "my-server": {
 *       "env": {
 *         "API_KEY": "",                    // Empty value
 *         "SECRET": "YOUR_SECRET_HERE"     // Placeholder value
 *       }
 *     }
 *   }
 * }
 */

import { CHECK_PRIORITIES } from '../../constants';
import { MCP_ISSUE_CODES } from '../../issue-codes';
import type { McpConfigContext, ValidationCheck, ValidationIssue } from '../../types';
import { forEachServer, isPlaceholderValue } from '../../utils';

/**
 * Check for missing or placeholder environment variables.
 *
 * Validates:
 * - Empty string values (likely unintentional)
 * - Placeholder values like "YOUR_API_KEY", "<secret>", etc.
 */
export const envVarValidation = {
  id: 'mcp.env-vars',
  name: 'Environment variable validation',
  description: 'Checks for missing or placeholder environment variables',
  appliesTo: 'mcp-config',
  priority: CHECK_PRIORITIES.ENV_VARS,

  run(context: McpConfigContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    forEachServer(context, (serverName, serverConfig) => {
      if (!serverConfig.env || typeof serverConfig.env !== 'object') return;

      for (const [envName, envValue] of Object.entries(serverConfig.env)) {
        if (typeof envValue !== 'string') continue;

        // Check for empty values
        if (!envValue || envValue.trim() === '') {
          issues.push({
            severity: 'warning',
            code: MCP_ISSUE_CODES.MISSING_ENV_VAR,
            message: `Empty environment variable: "${envName}"`,
            details: 'This environment variable is defined but has no value.',
            serverName,
          });
          continue;
        }

        // Check for placeholder values
        if (isPlaceholderValue(envValue)) {
          issues.push({
            severity: 'warning',
            code: MCP_ISSUE_CODES.PLACEHOLDER_ENV_VAR,
            message: `Placeholder value detected in "${envName}"`,
            details: `Value "${envValue}" appears to be a placeholder. Replace with the actual value.`,
            serverName,
          });
        }
      }
    });

    return issues;
  },
} satisfies ValidationCheck<McpConfigContext>;
