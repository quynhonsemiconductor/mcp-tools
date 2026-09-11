/**
 * Tool reference validation for QNSC-MCP config
 *
 * Note: This check requires the tool registry to be initialized before running.
 * It uses the registry in its current state rather than initializing it,
 * to avoid side effects and slow operations during validation.
 */

import { registry } from '../../../../registry/tool-registry';
import { CHECK_PRIORITIES, CLI_COMMANDS } from '../../constants';
import { QNSCMCP_ISSUE_CODES } from '../../issue-codes';
import { logDebug } from '../../../logger';
import type {
  QnscMcpConfigContext,
  QnscMcpToolsConfig,
  ValidationCheck,
  ValidationIssue,
} from '../../types';
import { createSuggestionMessage } from '../../utils';

/**
 * Check that tool references in include/exclude lists are valid.
 *
 * This check uses the registry in its current state. If the registry
 * has not been initialized, the check will be skipped gracefully.
 */
export const toolReferenceValidation = {
  id: 'qnsc-mcp.tool-references',
  name: 'Tool reference validation',
  description: 'Validates that tool IDs in include/exclude lists exist',
  appliesTo: 'qnsc-mcp-config',
  priority: CHECK_PRIORITIES.TOOL_REFERENCES,

  run(context: QnscMcpConfigContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const config = context.config;
    const tools = (config.tools || {}) as QnscMcpToolsConfig;

    // Check if there are any tool references to validate
    const includeList = tools.include || [];
    const excludeList = tools.exclude || [];
    const hasToolReferences = includeList.length > 0 || excludeList.length > 0;

    // Get available tools from the registry's current state
    // If the registry hasn't been initialized, getAllTools returns an empty array
    let allTools;
    try {
      allTools = registry.getAllTools(false);
    } catch (error) {
      // Registry not available, skip this check
      logDebug(
        `Tool reference validation skipped: registry not available (${error instanceof Error ? error.message : String(error)})`,
      );
      if (hasToolReferences) {
        issues.push({
          severity: 'info',
          code: QNSCMCP_ISSUE_CODES.VALIDATION_SKIPPED,
          message: 'Tool reference validation skipped: registry not available',
          details:
            'Tool IDs in include/exclude lists could not be validated. Run the server to initialize the registry.',
        });
      }
      return issues;
    }

    // If no tools are registered, skip validation (registry likely not initialized)
    if (allTools.length === 0) {
      logDebug('Tool reference validation skipped: no tools registered in registry');
      if (hasToolReferences) {
        issues.push({
          severity: 'info',
          code: QNSCMCP_ISSUE_CODES.VALIDATION_SKIPPED,
          message: 'Tool reference validation skipped: no tools registered',
          details:
            'Tool IDs in include/exclude lists could not be validated. Run the server to initialize the registry.',
        });
      }
      return issues;
    }

    const validToolIds = new Set(allTools.map((t) => t.id));
    const validToolIdList = Array.from(validToolIds);

    // Check include list
    for (const toolId of includeList) {
      if (!validToolIds.has(toolId)) {
        issues.push({
          severity: 'warning',
          code: QNSCMCP_ISSUE_CODES.INVALID_TOOL_REFERENCE,
          message: createSuggestionMessage(
            `Unknown tool in include list: "${toolId}"`,
            toolId,
            validToolIdList,
          ),
          details: `This tool ID does not match any registered tool. Check for typos or run "${CLI_COMMANDS.LIST_TOOLS}" to see available tools.`,
        });
      }
    }

    // Check exclude list
    for (const toolId of excludeList) {
      if (!validToolIds.has(toolId)) {
        issues.push({
          severity: 'warning',
          code: QNSCMCP_ISSUE_CODES.INVALID_TOOL_REFERENCE,
          message: createSuggestionMessage(
            `Unknown tool in exclude list: "${toolId}"`,
            toolId,
            validToolIdList,
          ),
          details: `This tool ID does not match any registered tool. Check for typos or run "${CLI_COMMANDS.LIST_TOOLS}" to see available tools.`,
        });
      }
    }

    return issues;
  },
} satisfies ValidationCheck<QnscMcpConfigContext>;
