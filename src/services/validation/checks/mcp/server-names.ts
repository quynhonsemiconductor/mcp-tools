/**
 * Server name validation checks for MCP configs
 *
 * Validates that server names follow best practices and don't contain
 * problematic characters that may cause issues with MCP clients.
 *
 * @example
 * // Good server names
 * { "my-server": { ... } }
 * { "myServer": { ... } }
 *
 * // Problematic server names (will trigger warnings)
 * { "my server": { ... } }  // Contains space
 */

import { CHECK_PRIORITIES, VALIDATION_PATTERNS } from '../../constants';
import { MCP_ISSUE_CODES } from '../../issue-codes';
import type { McpConfigContext, ValidationCheck, ValidationIssue } from '../../types';
import { getServersFromContext } from '../../utils';

/**
 * Check for empty or invalid server names.
 *
 * This check validates:
 * - Server names are non-empty
 * - Server names don't contain spaces (warning)
 * - Server names follow naming conventions (info, verbose only)
 */
export const serverNameValidation = {
  id: 'mcp.server-names',
  name: 'Server name validation',
  description: 'Validates that server names are non-empty and valid',
  appliesTo: 'mcp-config',
  priority: CHECK_PRIORITIES.SERVER_NAMES,

  run(context: McpConfigContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const servers = getServersFromContext(context);

    for (const serverName of Object.keys(servers)) {
      // Check for empty names
      if (!serverName || serverName.trim() === '') {
        issues.push({
          severity: 'error',
          code: MCP_ISSUE_CODES.INVALID_SERVER_NAME,
          message: 'Server name cannot be empty',
          serverName: '(empty)',
        });
        continue;
      }

      // Warn about spaces in server names
      if (serverName.includes(' ')) {
        issues.push({
          severity: 'warning',
          code: MCP_ISSUE_CODES.SERVER_NAME_HAS_SPACES,
          message: `Server name "${serverName}" contains spaces`,
          details: 'Server names with spaces may cause issues with some MCP clients',
          serverName,
        });
      }

      // Info: suggest kebab-case naming convention for consistency
      // Only shows in verbose mode and doesn't affect validation status
      if (
        !VALIDATION_PATTERNS.RECOMMENDED_SERVER_NAME.test(serverName) &&
        !serverName.includes(' ')
      ) {
        issues.push({
          severity: 'info',
          code: MCP_ISSUE_CODES.SERVER_NAME_CONVENTION,
          message: `Server name "${serverName}" doesn't follow kebab-case convention`,
          details:
            'Consider using lowercase names with hyphens (e.g., "my-server") for consistency',
          serverName,
        });
      }
    }

    return issues;
  },
} satisfies ValidationCheck<McpConfigContext>;
