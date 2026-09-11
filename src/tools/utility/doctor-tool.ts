import { z } from 'zod';
import { Tool, ToolHandler } from '../../registry';
import type {
  AggregatedDiagnostics,
  ConfigValidationResult,
  ValidationResult,
} from '../../services/validation';
import {
  formatIssueMessage,
  getRecommendations,
  getSearchedPaths,
  groupBySource,
  runDiagnostics,
} from '../../services/validation';
import { CatchErrors } from '../../utils';

/**
 * Parameters for the doctor tool
 */
export const DoctorToolSchema = z.object({
  configPath: z
    .string()
    .optional()
    .describe(
      'Optional path to specific config file. If omitted, validates all found MCP configs.',
    ),
  verbose: z
    .boolean()
    .optional()
    .default(false)
    .describe('Show all validation checks performed, not just issues.'),
  format: z
    .enum(['human', 'json'])
    .optional()
    .default('human')
    .describe('Output format: human-readable text or structured JSON.'),
});

export type DoctorToolParams = z.input<typeof DoctorToolSchema>;

/**
 * MCP Doctor Tool - Diagnose configuration issues
 *
 * This tool exposes the existing doctor CLI command functionality as an MCP tool
 * that AI assistants can call to help users diagnose configuration problems.
 */
@Tool({
  id: 'doctor',
  name: 'doctor',
  description:
    'Diagnose MCP configuration issues when tools fail with authentication, connection, or permission errors. Checks for missing environment variables (API keys, tokens), invalid paths, and configuration problems. Use this when Splunk, Slack, GitHub, or other external service tools report errors.',
  category: 'Utility',
  parameters: DoctorToolSchema,
  version: '1.0.0',
  includeByDefault: true,
  annotations: {
    title: 'MCP Configuration Diagnostics',
    readOnlyHint: true,
    idempotentHint: true,
  },
})
export class DoctorTool implements ToolHandler {
  /**
   * Execute the doctor diagnostic tool
   */
  @CatchErrors()
  async execute(args: DoctorToolParams): Promise<string> {
    const verbose = args.verbose ?? false;

    // Run diagnostics using shared logic
    const { mcpResults, qnscMcpResult, aggregated } = await runDiagnostics({
      configPath: args.configPath,
      verbose,
    });

    // Handle no configs found
    if (mcpResults.length === 0 && !args.configPath) {
      return this.formatNoConfigsFound();
    }

    // Format output based on requested format
    if (args.format === 'json') {
      return this.formatJsonOutput(mcpResults, qnscMcpResult, aggregated);
    } else {
      return this.formatHumanOutput(mcpResults, aggregated);
    }
  }

  /**
   * Format output when no configs are found
   */
  private formatNoConfigsFound(): string {
    const lines: string[] = [];
    lines.push('🩺 MCP Configuration Diagnostics\n');
    lines.push('No MCP configuration files found in standard locations.\n');
    lines.push('Standard locations checked:');

    const platformPaths = getSearchedPaths();
    platformPaths.forEach(({ path, description }) => {
      lines.push(`  • ${description}: ${path}`);
    });

    lines.push('\nTo get started:');
    lines.push('1. Create a configuration file in one of the standard locations');
    lines.push('2. Or specify a custom config path using the configPath parameter');
    lines.push('\nDocumentation: https://github.com/quynhonsemiconductor/mcp-tools#configuration');

    return lines.join('\n');
  }

  /**
   * Format human-readable output
   */
  private formatHumanOutput(
    mcpResults: ConfigValidationResult[],
    aggregated: AggregatedDiagnostics,
  ): string {
    const lines: string[] = [];

    // Header
    lines.push('🩺 MCP Configuration Diagnostics\n');

    // List found configs
    if (mcpResults.length > 0) {
      lines.push(`Found ${mcpResults.length} MCP configuration file(s):`);
      for (const { configInfo } of mcpResults) {
        lines.push(`  • ${configInfo.clientName}: ${configInfo.path}`);
      }
      lines.push('');
    }

    // Show verbose checks if requested
    if (aggregated.allChecksPerformed.length > 0) {
      lines.push('Checks performed:');
      aggregated.allChecksPerformed.forEach((check) => {
        lines.push(`  ✓ ${check}`);
      });
      lines.push('');
    }

    // Group issues by severity
    const errors = aggregated.allIssues.filter((i) => i.severity === 'error');
    const warnings = aggregated.allIssues.filter((i) => i.severity === 'warning');
    const infos = aggregated.allIssues.filter((i) => i.severity === 'info');

    // Show success if no issues
    if (errors.length === 0 && warnings.length === 0 && infos.length === 0) {
      lines.push(`✅ All ${mcpResults.length} configuration file(s) are valid - no issues found`);
      lines.push('');
      return lines.join('\n');
    }

    // Display errors grouped by source
    if (errors.length > 0) {
      lines.push(`❌ Errors (${errors.length}):`);
      const errorsBySource = groupBySource(errors);
      for (const [source, sourceErrors] of Object.entries(errorsBySource)) {
        lines.push(`\n  [${source}]`);
        sourceErrors.forEach((issue) => {
          lines.push(`    • ${formatIssueMessage(issue)}`);
          if (issue.details) {
            lines.push(`      ${issue.details}`);
          }
        });
      }
      lines.push('');
    }

    // Display warnings grouped by source
    if (warnings.length > 0) {
      lines.push(`⚠️  Warnings (${warnings.length}):`);
      const warningsBySource = groupBySource(warnings);
      for (const [source, sourceWarnings] of Object.entries(warningsBySource)) {
        lines.push(`\n  [${source}]`);
        sourceWarnings.forEach((issue) => {
          lines.push(`    • ${formatIssueMessage(issue)}`);
          if (issue.details) {
            lines.push(`      ${issue.details}`);
          }
        });
      }
      lines.push('');
    }

    // Display info messages
    if (infos.length > 0) {
      lines.push(`ℹ️  Info (${infos.length}):`);
      const infosBySource = groupBySource(infos);
      for (const [source, sourceInfos] of Object.entries(infosBySource)) {
        lines.push(`\n  [${source}]`);
        sourceInfos.forEach((issue) => {
          lines.push(`    • ${formatIssueMessage(issue)}`);
          if (issue.details) {
            lines.push(`      ${issue.details}`);
          }
        });
      }
      lines.push('');
    }

    // Display recommendations
    const recommendations = getRecommendations([...errors, ...warnings]);
    if (recommendations.size > 0) {
      for (const recLines of recommendations.values()) {
        recLines.forEach((line) => lines.push(line));
        lines.push('');
      }
    }

    // Summary
    lines.push('Summary:');
    lines.push(`  ${mcpResults.length} config file(s) validated`);
    lines.push(`  ${aggregated.totalServerCount} total server(s) configured`);
    lines.push(`  ${errors.length} error(s), ${warnings.length} warning(s) found`);

    if (errors.length > 0) {
      lines.push('\n❌ Configuration has errors that should be fixed');
    } else {
      lines.push('\n✅ Configuration structure is valid (warnings can be reviewed)');
    }

    return lines.join('\n');
  }

  /**
   * Format JSON output
   */
  private formatJsonOutput(
    mcpResults: ConfigValidationResult[],
    qnscMcpResult: ValidationResult,
    aggregated: AggregatedDiagnostics,
  ): string {
    const errors = aggregated.allIssues.filter((i) => i.severity === 'error');
    const warnings = aggregated.allIssues.filter((i) => i.severity === 'warning');

    const output = {
      valid: aggregated.overallValid,
      configs: mcpResults.map(({ configInfo, result }) => ({
        path: configInfo.path,
        client: configInfo.client,
        clientName: configInfo.clientName,
        valid: result.valid,
        serverCount: result.serverCount,
        issues: result.issues,
      })),
      qnscMcpConfig: {
        valid: qnscMcpResult.valid,
        issues: qnscMcpResult.issues,
      },
      summary: {
        totalConfigs: mcpResults.length,
        totalServerCount: aggregated.totalServerCount,
        errorCount: errors.length,
        warningCount: warnings.length,
      },
      ...(aggregated.allChecksPerformed.length > 0 && {
        checksPerformed: aggregated.allChecksPerformed,
      }),
    };

    return JSON.stringify(output, null, 2);
  }
}
