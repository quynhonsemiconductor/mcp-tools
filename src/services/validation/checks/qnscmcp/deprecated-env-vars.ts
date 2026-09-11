/**
 * Deprecated environment variable check for QNSC-MCP
 *
 * Detects leftover environment variables from tools that no longer exist here.
 * Nothing reads them, but their presence suggests they still do, so the check
 * names each one and says what happened to it.
 *
 * The tools these belonged to were moved to remote MCP servers upstream, and those
 * servers were removed from this build: they all proxied through a hosted gateway
 * this deployment does not run. So the guidance is that the capability is gone, not
 * that it moved — telling anyone to add `includeRemoteMCPs: [datadog]` would point
 * them at a server that is no longer defined.
 */

import { CHECK_PRIORITIES } from '../../constants';
import { QNSCMCP_ISSUE_CODES } from '../../issue-codes';
import type { QnscMcpConfigContext, ValidationCheck, ValidationIssue } from '../../types';

/**
 * Deprecated env vars and their migration guidance.
 * Kept here (not in config.ts) so the check is self-contained.
 */
const DEPRECATED_ENV_VARS: Record<string, { guidance: string; severity: 'info' | 'warning' }> = {
  NEW_RELIC_API_KEY: {
    guidance:
      'New Relic tools are no longer part of this build. The tools this belonged to were removed along with the gateway-routed remote MCP servers.',
    severity: 'info',
  },
  NEW_RELIC_ACCOUNT_ID: {
    guidance:
      'New Relic tools are no longer part of this build. The tools this belonged to were removed along with the gateway-routed remote MCP servers.',
    severity: 'info',
  },
  NEW_RELIC_ACCOUNT_IDS: {
    guidance:
      'New Relic tools are no longer part of this build. The tools this belonged to were removed along with the gateway-routed remote MCP servers.',
    severity: 'info',
  },
  NEW_RELIC_LICENSE_KEY: {
    guidance:
      'The New Relic tool license key is no longer used. Internal telemetry uses a built-in key by default; set NEW_RELIC_LICENSE_KEY_MCP only if you need to override it.',
    severity: 'info',
  },
  CORTEX_API_BASE_URL: {
    guidance:
      'Cortex tools are no longer part of this build. The tools this belonged to were removed along with the gateway-routed remote MCP servers.',
    severity: 'info',
  },
  DD_API_KEY: {
    guidance:
      'Datadog tools are no longer part of this build. The tools this belonged to were removed along with the gateway-routed remote MCP servers.',
    severity: 'info',
  },
  DD_APP_KEY: {
    guidance:
      'Datadog tools are no longer part of this build. The tools this belonged to were removed along with the gateway-routed remote MCP servers.',
    severity: 'info',
  },
  DD_SITE: {
    guidance:
      'Datadog tools are no longer part of this build. The tools this belonged to were removed along with the gateway-routed remote MCP servers.',
    severity: 'info',
  },
  KONNECT_REGION: {
    guidance:
      'Kong tools are no longer part of this build. The tools this belonged to were removed along with the gateway-routed remote MCP servers.',
    severity: 'warning',
  },
  SMARTSHEET_ENDPOINT: {
    guidance:
      'Smartsheet tools are no longer part of this build. The tools this belonged to were removed along with the gateway-routed remote MCP servers.',
    severity: 'info',
  },
  ALLOW_DELETE_TOOLS: {
    guidance:
      'This flag was specific to the Smartsheet MCP and is silently ignored. The tools this belonged to were removed along with the gateway-routed remote MCP servers.',
    severity: 'info',
  },
};

export const deprecatedEnvVarCheck = {
  id: 'qnscmcp.deprecated-env-vars',
  name: 'Deprecated Environment Variables',
  description: 'Check for leftover environment variables from migrated tools',
  appliesTo: 'qnsc-mcp-config',
  priority: CHECK_PRIORITIES.DEPRECATED_ENV_VARS,

  run(_context: QnscMcpConfigContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const [varName, { guidance, severity }] of Object.entries(DEPRECATED_ENV_VARS)) {
      if (varName in process.env) {
        issues.push({
          severity,
          code: QNSCMCP_ISSUE_CODES.DEPRECATED_ENV_VAR,
          message: `Deprecated env var '${varName}' is set`,
          details: `${guidance} You can safely remove this variable.`,
        });
      }
    }

    return issues;
  },
} satisfies ValidationCheck<QnscMcpConfigContext>;
