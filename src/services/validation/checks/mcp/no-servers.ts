/**
 * No servers configured check for MCP configs
 *
 * Validates that the configuration contains at least one MCP server definition.
 * An MCP config without servers is essentially a no-op and likely indicates
 * an incomplete or misconfigured setup.
 *
 * Note on priority vs severity:
 * - Priority is CRITICAL (runs first) because other checks depend on servers existing.
 *   If there are no servers, subsequent checks will simply find nothing to validate.
 * - Severity is "warning" (not "error") because an empty config might be intentional
 *   during initial setup. This is consistent with other "missing/empty" conditions
 *   like NO_TOOLS_ENABLED which also returns a warning.
 *
 * @example
 * // This will trigger a warning
 * { "servers": {} }
 * { "mcpServers": {} }
 *
 * // Valid config with at least one server
 * { "servers": { "my-server": { "command": "node" } } }
 */

import { CHECK_PRIORITIES } from '../../constants';
import { MCP_ISSUE_CODES } from '../../issue-codes';
import type { McpConfigContext, ValidationCheck, ValidationIssue } from '../../types';
import { getServerCount } from '../../utils';

/**
 * Check that at least one server is configured.
 *
 * Uses CRITICAL priority to run early (other checks depend on servers existing),
 * but returns a warning severity since an empty config may be intentional.
 */
export const noServersCheck = {
  id: 'mcp.no-servers',
  name: 'No servers configured check',
  description: 'Warns when no servers are configured',
  appliesTo: 'mcp-config',
  priority: CHECK_PRIORITIES.CRITICAL,

  run(context: McpConfigContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (getServerCount(context) === 0) {
      issues.push({
        severity: 'warning',
        code: MCP_ISSUE_CODES.NO_SERVERS_CONFIGURED,
        message: 'No servers configured',
        details:
          'Configuration file exists but contains no server definitions. This may be intentional during initial setup.',
      });
    }

    return issues;
  },
} satisfies ValidationCheck<McpConfigContext>;
