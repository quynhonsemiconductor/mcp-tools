/**
 * Remote MCP validation for QNSC-MCP config
 */

import {
  AVAILABLE_REMOTE_MCP_SERVERS,
  validateRemoteMCPServerIds,
} from '../../../../remote-mcps/available-remote-servers';
import { resolveSetupPath } from '../../../../utils/setup-resolver';
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
 * Check that remote MCP references are valid
 */
export const remoteMcpReferenceValidation = {
  id: 'qnsc-mcp.remote-mcp-references',
  name: 'Remote MCP reference validation',
  description: 'Validates that includeRemoteMCPs references are valid server IDs',
  appliesTo: 'qnsc-mcp-config',
  priority: CHECK_PRIORITIES.REMOTE_MCP_REFERENCES,

  run(context: QnscMcpConfigContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const config = context.config;
    const tools = (config.tools || {}) as QnscMcpToolsConfig;
    const includeRemoteMCPs = tools.includeRemoteMCPs || [];

    if (includeRemoteMCPs.length === 0) return issues;

    const { invalid } = validateRemoteMCPServerIds(includeRemoteMCPs);
    const availableIds = AVAILABLE_REMOTE_MCP_SERVERS.map((s) => s.id);
    const configSource = (config.source as string) || '.qnscmcp.yaml';

    for (const invalidId of invalid) {
      issues.push({
        severity: 'warning',
        code: QNSCMCP_ISSUE_CODES.UNKNOWN_REMOTE_MCP,
        message: createSuggestionMessage(
          `Unknown remote MCP server: "${invalidId}"`,
          invalidId,
          availableIds,
        ),
        details:
          `Your config (${configSource}) has "${invalidId}" in tools.includeRemoteMCPs, ` +
          `but this is not a recognized server ID. Check for typos or remove it. ` +
          `Available: ${availableIds.join(', ') || '(none configured)'}`,
      });
    }

    return issues;
  },
} satisfies ValidationCheck<QnscMcpConfigContext>;

/**
 * Check that required env vars for remote MCPs are set
 */
export const remoteMcpEnvVarValidation = {
  id: 'qnsc-mcp.remote-mcp-env-vars',
  name: 'Remote MCP environment variable validation',
  description: 'Validates that required environment variables for remote MCPs are set',
  appliesTo: 'qnsc-mcp-config',
  priority: CHECK_PRIORITIES.REMOTE_MCP_ENV_VARS,

  run(context: QnscMcpConfigContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const config = context.config;
    const tools = (config.tools || {}) as QnscMcpToolsConfig;
    const includeRemoteMCPs = tools.includeRemoteMCPs || [];

    if (includeRemoteMCPs.length === 0) return issues;

    const { valid } = validateRemoteMCPServerIds(includeRemoteMCPs);
    const configSource = (config.source as string) || '.qnscmcp.yaml';

    for (const validId of valid) {
      const serverDef = AVAILABLE_REMOTE_MCP_SERVERS.find((s) => s.id === validId);
      if (serverDef?.requiredEnvVars) {
        const missingEnvVars: string[] = [];
        for (const envVarName of serverDef.requiredEnvVars) {
          const envValue = process.env[envVarName];
          if (!envValue || isPlaceholderValue(envValue)) {
            missingEnvVars.push(envVarName);
          }
        }

        if (missingEnvVars.length > 0) {
          // Check if there's a setup doc for this remote MCP
          const setupDoc = resolveSetupPath(validId, 'remote');
          const setupHint = setupDoc
            ? ` See SETUP_${validId}.md for configuration instructions.`
            : '';

          issues.push({
            severity: 'warning',
            code: QNSCMCP_ISSUE_CODES.REMOTE_MCP_MISSING_ENV_VAR,
            message: `Remote MCP "${validId}" is enabled but missing required environment variable(s): ${missingEnvVars.join(', ')}`,
            details:
              `Your config (${configSource}) has "${validId}" in tools.includeRemoteMCPs, ` +
              `which requires these env vars to authenticate with ${serverDef.name}. ` +
              `Either set the missing env vars, or remove "${validId}" from includeRemoteMCPs if you don't need this server.` +
              setupHint,
          });
        }
      }
    }

    return issues;
  },
} satisfies ValidationCheck<QnscMcpConfigContext>;
