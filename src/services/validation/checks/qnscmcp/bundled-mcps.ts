/**
 * Bundled MCP validation for QNSC-MCP config
 */

import * as fs from 'fs';
import * as path from 'path';
import { QNSC_MCP_DIR } from '../../../../config';
import { resolveSetupPath } from '../../../../utils/setup-resolver';
import { logDebug } from '../../../logger';
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
 * Environment variable definition from MCP metadata.json
 */
interface EnvVarDef {
  name: string;
  description?: string;
  required?: boolean;
}

/**
 * Get the path to the bundled MCPs directory.
 * Uses the user's data directory (~/.qnscmcp/bundled) where MCPs are installed.
 */
function getBundledMcpDir(): string {
  return path.join(QNSC_MCP_DIR, 'bundled');
}

/**
 * Check that bundled MCP references are valid
 */
export const bundledMcpReferenceValidation = {
  id: 'qnsc-mcp.bundled-mcp-references',
  name: 'Bundled MCP reference validation',
  description: 'Validates that includeMCPs references exist in the bundled directory',
  appliesTo: 'qnsc-mcp-config',
  priority: CHECK_PRIORITIES.BUNDLED_MCP_REFERENCES,

  run(context: QnscMcpConfigContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const config = context.config;
    const tools = (config.tools || {}) as QnscMcpToolsConfig;
    const includeMCPs = tools.includeMCPs || [];

    if (includeMCPs.length === 0) return issues;

    // Get list of available bundled MCPs
    const bundledDir = getBundledMcpDir();
    let availableMcps: Set<string> = new Set();

    try {
      if (fs.existsSync(bundledDir)) {
        const dirs = fs
          .readdirSync(bundledDir, { withFileTypes: true })
          .filter((dirent) => dirent.isDirectory())
          .map((dirent) => dirent.name);
        availableMcps = new Set(dirs);
      }
    } catch (error) {
      // Log the error for debugging but skip this check gracefully
      logDebug(
        `Unable to read bundled MCP directory at ${bundledDir}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return issues;
    }

    const configSource = (config.source as string) || '.qnscmcp.yaml';
    const availableMcpList = Array.from(availableMcps);

    for (const mcpName of includeMCPs) {
      if (!availableMcps.has(mcpName)) {
        issues.push({
          severity: 'warning',
          code: QNSCMCP_ISSUE_CODES.UNKNOWN_BUNDLED_MCP,
          message: createSuggestionMessage(
            `Unknown bundled MCP: "${mcpName}"`,
            mcpName,
            availableMcpList,
          ),
          details:
            `Your config (${configSource}) has "${mcpName}" in tools.includeMCPs, ` +
            `but this is not a recognized MCP ID. Check for typos or remove it. ` +
            `Available: ${availableMcpList.join(', ') || '(none installed)'}`,
        });
      } else {
        // Check if metadata.json exists
        const metadataPath = path.join(bundledDir, mcpName, 'metadata.json');
        if (!fs.existsSync(metadataPath)) {
          issues.push({
            severity: 'warning',
            code: QNSCMCP_ISSUE_CODES.BUNDLED_MCP_MISSING_METADATA,
            message: `Bundled MCP "${mcpName}" is missing metadata.json`,
            details:
              `Your config (${configSource}) has "${mcpName}" in tools.includeMCPs, ` +
              `but the MCP installation is incomplete (missing metadata.json). ` +
              `Try reinstalling the MCP or remove it from your config.`,
          });
        }
      }
    }

    return issues;
  },
} satisfies ValidationCheck<QnscMcpConfigContext>;

/**
 * Check that required env vars for bundled MCPs are set
 */
export const bundledMcpEnvVarValidation = {
  id: 'qnsc-mcp.bundled-mcp-env-vars',
  name: 'Bundled MCP environment variable validation',
  description: 'Validates that required environment variables for bundled MCPs are set',
  appliesTo: 'qnsc-mcp-config',
  priority: CHECK_PRIORITIES.BUNDLED_MCP_ENV_VARS,

  run(context: QnscMcpConfigContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const config = context.config;
    const tools = (config.tools || {}) as QnscMcpToolsConfig;
    const includeMCPs = tools.includeMCPs || [];

    if (includeMCPs.length === 0) return issues;

    const bundledDir = getBundledMcpDir();
    const configSource = (config.source as string) || '.qnscmcp.yaml';

    for (const mcpName of includeMCPs) {
      const metadataPath = path.join(bundledDir, mcpName, 'metadata.json');

      try {
        if (!fs.existsSync(metadataPath)) continue;

        const metadataContent = fs.readFileSync(metadataPath, 'utf-8');

        let metadata: Record<string, unknown>;
        try {
          metadata = JSON.parse(metadataContent);
        } catch (parseError) {
          issues.push({
            severity: 'warning',
            code: QNSCMCP_ISSUE_CODES.INVALID_METADATA_JSON,
            message: `Invalid JSON in metadata.json for bundled MCP "${mcpName}"`,
            details: parseError instanceof Error ? parseError.message : 'Unknown parse error',
          });
          continue;
        }

        if (!metadata.envVars || !Array.isArray(metadata.envVars)) continue;

        const missingEnvVars: string[] = [];
        for (const envVarDef of metadata.envVars as EnvVarDef[]) {
          if (!envVarDef.required) continue;

          const envVarName = envVarDef.name;
          const envValue = process.env[envVarName];

          if (!envValue || isPlaceholderValue(envValue)) {
            missingEnvVars.push(envVarName);
          }
        }

        if (missingEnvVars.length > 0) {
          const mcpDisplayName = (metadata.name as string) || mcpName;
          // Check if there's a setup doc for this bundled MCP
          const setupDoc = resolveSetupPath(mcpName, 'bundled');
          const setupHint = setupDoc
            ? ` See bundled/${mcpName}/SETUP.md for configuration instructions.`
            : '';

          issues.push({
            severity: 'warning',
            code: QNSCMCP_ISSUE_CODES.BUNDLED_MCP_MISSING_ENV_VAR,
            message: `Bundled MCP "${mcpName}" is enabled but missing required environment variable(s): ${missingEnvVars.join(', ')}`,
            details:
              `Your config (${configSource}) has "${mcpName}" in tools.includeMCPs, ` +
              `which requires these env vars to run ${mcpDisplayName}. ` +
              `Either set the missing env vars, or remove "${mcpName}" from includeMCPs if you don't need this server.` +
              setupHint,
          });
        }
      } catch (error) {
        // Log file read errors for debugging but continue checking other MCPs
        logDebug(
          `Unable to read metadata for bundled MCP "${mcpName}": ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }
    }

    return issues;
  },
} satisfies ValidationCheck<QnscMcpConfigContext>;
