/**
 * Local MCP validation for QNSC-MCP config
 */

import {
  AVAILABLE_LOCAL_MCP_SERVERS,
  validateLocalMCPServerIds,
} from '../../../../local-mcps/available-local-servers';
import { CHECK_PRIORITIES } from '../../constants';
import { QNSCMCP_ISSUE_CODES } from '../../issue-codes';
import type {
  QnscMcpConfigContext,
  QnscMcpToolsConfig,
  ValidationCheck,
  ValidationIssue,
} from '../../types';
import { createSuggestionMessage, isPlaceholderValue } from '../../utils';

/**
 * Check that local MCP references are valid
 */
export const localMcpReferenceValidation = {
  id: 'qnsc-mcp.local-mcp-references',
  name: 'Local MCP reference validation',
  description: 'Validates that includeLocalMCPs references are valid server IDs',
  appliesTo: 'qnsc-mcp-config',
  priority: CHECK_PRIORITIES.LOCAL_MCP_REFERENCES,

  run(context: QnscMcpConfigContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const config = context.config;
    const tools = (config.tools || {}) as QnscMcpToolsConfig;
    const includeLocalMCPs = tools.includeLocalMCPs || [];

    if (includeLocalMCPs.length === 0) return issues;

    const { invalid } = validateLocalMCPServerIds(includeLocalMCPs);
    const availableIds = AVAILABLE_LOCAL_MCP_SERVERS.map((s) => s.id);
    const configSource = (config.source as string) || '.qnscmcp.yaml';

    for (const invalidId of invalid) {
      issues.push({
        severity: 'warning',
        code: QNSCMCP_ISSUE_CODES.UNKNOWN_LOCAL_MCP,
        message: createSuggestionMessage(
          `Unknown local MCP server: "${invalidId}"`,
          invalidId,
          availableIds,
        ),
        details:
          `Your config (${configSource}) has "${invalidId}" in tools.includeLocalMCPs, ` +
          `but this is not a recognized server ID. Check for typos or remove it. ` +
          `Available: ${availableIds.join(', ') || '(none configured)'}`,
      });
    }

    return issues;
  },
} satisfies ValidationCheck<QnscMcpConfigContext>;

/**
 * Check that required env vars for local MCPs are set
 */
export const localMcpEnvVarValidation = {
  id: 'qnsc-mcp.local-mcp-env-vars',
  name: 'Local MCP environment variable validation',
  description: 'Validates that required environment variables for local MCPs are set',
  appliesTo: 'qnsc-mcp-config',
  priority: CHECK_PRIORITIES.LOCAL_MCP_ENV_VARS,

  run(context: QnscMcpConfigContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const config = context.config;
    const tools = (config.tools || {}) as QnscMcpToolsConfig;
    const includeLocalMCPs = tools.includeLocalMCPs || [];

    if (includeLocalMCPs.length === 0) return issues;

    const { valid } = validateLocalMCPServerIds(includeLocalMCPs);
    const configSource = (config.source as string) || '.qnscmcp.yaml';

    for (const validId of valid) {
      const serverDef = AVAILABLE_LOCAL_MCP_SERVERS.find((s) => s.id === validId);
      if (serverDef?.requiredEnvVars) {
        const missingEnvVars: string[] = [];
        for (const envVarName of serverDef.requiredEnvVars) {
          const envValue = process.env[envVarName];
          if (!envValue || isPlaceholderValue(envValue)) {
            missingEnvVars.push(envVarName);
          }
        }

        if (missingEnvVars.length > 0) {
          issues.push({
            severity: 'warning',
            code: QNSCMCP_ISSUE_CODES.LOCAL_MCP_MISSING_ENV_VAR,
            message: `Local MCP "${validId}" is enabled but missing required environment variable(s): ${missingEnvVars.join(', ')}`,
            details:
              `Your config (${configSource}) has "${validId}" in tools.includeLocalMCPs, ` +
              `which requires these env vars to run ${serverDef.name}. ` +
              `Either set the missing env vars, or remove "${validId}" from includeLocalMCPs if you don't need this server.`,
          });
        }
      }
    }

    return issues;
  },
} satisfies ValidationCheck<QnscMcpConfigContext>;
