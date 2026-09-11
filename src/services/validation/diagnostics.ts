/**
 * Shared diagnostics logic for doctor CLI command and doctor tool.
 *
 * This module contains the core diagnostic functionality used by both
 * the CLI `doctor` command and the MCP `doctor` tool to avoid duplication.
 */

import { loadConfig } from '../../config';
import { logDebug } from '../logger';
import { QNSCMCP_ISSUE_CODES, ISSUE_RECOMMENDATIONS } from './issue-codes';
import type { QnscMcpToolsConfig, ValidationIssue, ValidationResult } from './types';
import { ConfigValidator, isYamlFile, type McpConfigInfo } from './validator';

/**
 * Result for a single config file validation.
 */
export interface ConfigValidationResult {
  /** Information about the config file that was validated */
  configInfo: McpConfigInfo;
  /** The validation result containing issues and validity status */
  result: ValidationResult;
}

/**
 * Aggregated results from all validations
 */
export interface AggregatedDiagnostics {
  /** All issues from all configs, with source information */
  allIssues: (ValidationIssue & { source?: string })[];
  /** All checks performed (for verbose mode) */
  allChecksPerformed: string[];
  /** Whether all configs are valid */
  overallValid: boolean;
  /** Total number of servers across all configs */
  totalServerCount: number;
}

/**
 * Options for running diagnostics
 */
export interface DiagnosticsOptions {
  /** Optional path to specific config file */
  configPath?: string;
  /** Show all checks performed, not just issues */
  verbose?: boolean;
}

/**
 * Full diagnostics result
 */
export interface DiagnosticsResult {
  /** Results for each MCP config file */
  mcpResults: ConfigValidationResult[];
  /** Result for QNSC-MCP config */
  qnscMcpResult: ValidationResult;
  /** Aggregated results */
  aggregated: AggregatedDiagnostics;
}

/**
 * Run configuration diagnostics.
 *
 * This is the core diagnostic function used by both the CLI and MCP tool.
 *
 * @param options Diagnostic options
 * @returns Diagnostic results including all validation issues
 */
export async function runDiagnostics(options: DiagnosticsOptions = {}): Promise<DiagnosticsResult> {
  const { configPath, verbose = false } = options;
  const mcpResults: ConfigValidationResult[] = [];

  if (configPath && isYamlFile(configPath)) {
    // User specified a YAML file - validate as QNSC-MCP config
    const qnscMcpResult = await ConfigValidator.validateQnscMcpConfigFile(configPath, { verbose });

    // Aggregate and return early — no need to auto-discover or re-validate QNSC-MCP config
    const aggregated = aggregateResults(mcpResults, qnscMcpResult, verbose);
    return { mcpResults, qnscMcpResult, aggregated };
  } else if (configPath) {
    // User specified a JSON config - validate as MCP client config
    const result = await ConfigValidator.validateConfigFile(configPath, { verbose });
    mcpResults.push({
      configInfo: { path: configPath, client: 'generic', clientName: 'Custom Path' },
      result,
    });
  } else {
    // Find and validate ALL MCP configs
    const foundConfigs = ConfigValidator.findAllMcpConfigs();

    for (const configInfo of foundConfigs) {
      const result = await ConfigValidator.validateConfigFile(configInfo.path, { verbose });
      mcpResults.push({ configInfo, result });
    }
  }

  // Validate QNSC-MCP config
  const qnscMcpResult = await ConfigValidator.validateQnscMcpConfig({ verbose });

  // Aggregate results
  const aggregated = aggregateResults(mcpResults, qnscMcpResult, verbose);

  return { mcpResults, qnscMcpResult, aggregated };
}

/**
 * Aggregate validation results from multiple configs.
 *
 * Note: The `verbose` parameter only affects the cross-config check entry in checksPerformed.
 * Individual validation results already have their checksPerformed populated (or not) based on
 * whether verbose was passed to the validator - we simply aggregate those here.
 */
export function aggregateResults(
  mcpResults: ConfigValidationResult[],
  qnscMcpResult: ValidationResult,
  verbose: boolean = false,
): AggregatedDiagnostics {
  const allIssues: (ValidationIssue & { source?: string })[] = [];
  const allChecksPerformed: string[] = [];
  let overallValid = true;
  let totalServerCount = 0;

  // Process MCP config results
  for (const { configInfo, result } of mcpResults) {
    result.issues.forEach((issue) => {
      allIssues.push({ ...issue, source: configInfo.clientName });
    });
    if (result.checksPerformed) {
      allChecksPerformed.push(
        ...result.checksPerformed.map((c) => `[${configInfo.clientName}] ${c}`),
      );
    }
    if (!result.valid) {
      overallValid = false;
    }
    totalServerCount += result.serverCount || 0;
  }

  // Process QNSC-MCP config result
  if (!qnscMcpResult.valid) {
    overallValid = false;
  }
  qnscMcpResult.issues.forEach((issue) => {
    allIssues.push({ ...issue, source: 'QNSC-MCP Config' });
  });
  if (qnscMcpResult.checksPerformed) {
    allChecksPerformed.push(...qnscMcpResult.checksPerformed.map((c) => `[QNSC-MCP Config] ${c}`));
  }

  // Cross-config check: Verify at least some functionality is enabled
  const crossConfigIssue = checkEnabledFunctionality(totalServerCount);
  if (crossConfigIssue) {
    allIssues.push({ ...crossConfigIssue, source: 'Cross-Config' });
  }
  if (verbose) {
    allChecksPerformed.push('[Cross-Config] Enabled functionality check');
  }

  return { allIssues, allChecksPerformed, overallValid, totalServerCount };
}

/**
 * Cross-config check: Verify that at least some functionality is enabled.
 *
 * This check examines both:
 * - MCP servers from JSON config files (totalServerCount)
 * - QNSC-MCP config (.qnscmcp.yaml) for bundled/remote/local MCPs and native tools
 *
 * @param totalServerCount - Total number of servers found in MCP JSON configs
 * @returns A validation issue if no functionality is enabled, or undefined if OK
 */
export function checkEnabledFunctionality(totalServerCount: number): ValidationIssue | undefined {
  // If there are MCP servers in JSON configs, we have functionality
  if (totalServerCount > 0) {
    return undefined;
  }

  // Check QNSC-MCP config for bundled/remote/local MCPs
  let qnscMcpConfig: Record<string, unknown> = {};
  let configLoadError: Error | undefined;
  try {
    qnscMcpConfig = loadConfig() as unknown as Record<string, unknown>;
  } catch (error) {
    // Config has errors - capture for reporting
    configLoadError = error instanceof Error ? error : new Error(String(error));
    logDebug(
      `checkEnabledFunctionality: Failed to load QNSC-MCP config: ${configLoadError.message}`,
    );
  }

  // If config failed to load, report that instead of misleading "no tools enabled"
  if (configLoadError) {
    return {
      severity: 'warning',
      code: QNSCMCP_ISSUE_CODES.CONFIG_LOAD_ERROR,
      message: 'Could not load QNSC-MCP config to check enabled functionality',
      details:
        `Failed to parse .qnscmcp.yaml: ${configLoadError.message}. ` +
        `Fix any syntax errors in your config file and run doctor again.`,
    };
  }

  const tools = (qnscMcpConfig.tools || {}) as QnscMcpToolsConfig;
  const includeMCPs = tools.includeMCPs || [];
  const includeRemoteMCPs = tools.includeRemoteMCPs || [];
  const includeLocalMCPs = tools.includeLocalMCPs || [];
  const totalQnscMcpServers =
    includeMCPs.length + includeRemoteMCPs.length + includeLocalMCPs.length;

  // If QNSC-MCP has servers configured, we have functionality
  if (totalQnscMcpServers > 0) {
    return undefined;
  }

  // Check if native tools are configured via include/includeCategories
  const includeTools = tools.include || [];
  const includeCategories = tools.includeCategories || [];
  const hasNativeToolConfig = includeTools.length > 0 || includeCategories.length > 0;

  // If native tools are explicitly configured, assume we have functionality
  if (hasNativeToolConfig) {
    return undefined;
  }

  // No functionality found anywhere
  const configSource = (qnscMcpConfig.source as string) || '.qnscmcp.yaml';
  return {
    severity: 'warning',
    code: QNSCMCP_ISSUE_CODES.NO_TOOLS_ENABLED,
    message: 'No MCP servers or tools configured',
    details:
      `QNSC-MCP has no tools enabled, which means it won't provide any functionality to your AI assistant. ` +
      `To enable tools, edit your config (${configSource}) and add entries to one of these fields under "tools:": ` +
      `includeMCPs (bundled servers), includeRemoteMCPs (remote servers), includeLocalMCPs (local servers), ` +
      `include (specific tool IDs), or includeCategories (tool categories like "Sonar", "Utility", etc.). ` +
      `Note: remote-only servers such as Slack and New Relic are enabled via includeRemoteMCPs, not includeCategories.`,
  };
}

/**
 * Group issues by their source
 */
export function groupBySource(
  issues: (ValidationIssue & { source?: string })[],
): Record<string, ValidationIssue[]> {
  const grouped: Record<string, ValidationIssue[]> = {};
  for (const issue of issues) {
    const source = issue.source || 'Unknown';
    if (!grouped[source]) {
      grouped[source] = [];
    }
    grouped[source].push(issue);
  }
  return grouped;
}

/**
 * Format an issue message, appending server name if present
 */
export function formatIssueMessage(issue: ValidationIssue): string {
  if (issue.serverName) {
    return `${issue.message} (server: ${issue.serverName})`;
  }
  return issue.message;
}

/**
 * Get recommendations for a list of issues.
 * Returns a map of issue code to recommendation lines, deduplicated by code.
 */
export function getRecommendations(issues: ValidationIssue[]): Map<string, string[]> {
  const recommendations = new Map<string, string[]>();

  for (const issue of issues) {
    const recommendation = ISSUE_RECOMMENDATIONS[issue.code as keyof typeof ISSUE_RECOMMENDATIONS];
    if (recommendation && !recommendations.has(issue.code)) {
      recommendations.set(issue.code, [...recommendation]);
    }
  }

  return recommendations;
}

/**
 * Get platform-specific paths that were searched for configs.
 * Wrapper for ConfigValidator.getPlatformSpecificPaths() with proper type inference.
 */
export function getSearchedPaths(): ReturnType<typeof ConfigValidator.getPlatformSpecificPaths> {
  return ConfigValidator.getPlatformSpecificPaths();
}
