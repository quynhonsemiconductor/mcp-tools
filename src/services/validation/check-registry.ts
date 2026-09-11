/**
 * Registry for validation checks
 *
 * Checks are registered explicitly via registerCheck() and validators
 * query the registry to get applicable checks for their context type.
 */

import { logDebug } from '../logger';
import { DEFAULT_CHECK_PRIORITY } from './constants';
import { MCP_ISSUE_CODES } from './issue-codes';
import type {
  QnscMcpConfigContext,
  McpConfigContext,
  ValidationCheck,
  ValidationContext,
  ValidationIssue,
  ValidationOptions,
  ValidationResult,
} from './types';

/**
 * Global registry of validation checks
 */
class CheckRegistry {
  private checks: Map<string, ValidationCheck> = new Map();

  /**
   * Register a validation check
   * @param check The check to register
   * @throws Error if a check with the same ID is already registered
   */
  register<T extends ValidationContext>(check: ValidationCheck<T>): void {
    if (this.checks.has(check.id)) {
      throw new Error(`Check with ID "${check.id}" is already registered`);
    }
    this.checks.set(check.id, check as ValidationCheck);
  }

  /**
   * Unregister a check by ID (useful for testing)
   */
  unregister(id: string): boolean {
    return this.checks.delete(id);
  }

  /**
   * Reset the registry to its initial state.
   * Clears all registered checks. Use in tests to ensure clean state between test runs.
   */
  reset(): void {
    this.checks.clear();
  }

  /**
   * Get all checks that apply to a given context type
   * @param contextType The type of context to get checks for
   * @param options Optional filtering options (only/skip)
   * @returns Array of checks sorted by priority
   */
  getChecksFor(
    contextType: ValidationContext['type'],
    options: ValidationOptions = {},
  ): ValidationCheck[] {
    const applicableChecks: ValidationCheck[] = [];

    for (const check of this.checks.values()) {
      const appliesTo = Array.isArray(check.appliesTo) ? check.appliesTo : [check.appliesTo];

      if (appliesTo.includes(contextType)) {
        // Apply filtering based on options
        if (options.only && options.only.length > 0) {
          if (!options.only.includes(check.id)) {
            continue;
          }
        }
        if (options.skip && options.skip.includes(check.id)) {
          continue;
        }
        applicableChecks.push(check);
      }
    }

    // Sort by priority (lower first), then by ID for deterministic ordering
    return applicableChecks.sort((a, b) => {
      const priorityDiff =
        (a.priority ?? DEFAULT_CHECK_PRIORITY) - (b.priority ?? DEFAULT_CHECK_PRIORITY);
      if (priorityDiff !== 0) return priorityDiff;
      return a.id.localeCompare(b.id);
    });
  }

  /**
   * Get a check by ID
   */
  getCheck(id: string): ValidationCheck | undefined {
    return this.checks.get(id);
  }

  /**
   * Get all registered check IDs
   */
  getAllCheckIds(): string[] {
    return Array.from(this.checks.keys());
  }

  /**
   * List all registered checks with their metadata.
   * Useful for displaying available checks or debugging.
   * @returns Array of check metadata objects sorted by ID
   */
  listChecks(): {
    id: string;
    name: string;
    description: string;
    appliesTo: string | string[];
    priority?: number;
  }[] {
    return Array.from(this.checks.values())
      .map((check) => ({
        id: check.id,
        name: check.name,
        description: check.description,
        appliesTo: check.appliesTo,
        priority: check.priority,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Run all applicable checks for a context
   * @param context The validation context
   * @param options Validation options (including filtering via only/skip)
   * @returns Aggregated validation result
   */
  async runChecks(
    context: ValidationContext,
    options: ValidationOptions = {},
  ): Promise<ValidationResult> {
    const checks = this.getChecksFor(context.type, options);
    const allIssues: ValidationIssue[] = [];
    const checksPerformed: string[] = [];

    for (const check of checks) {
      checksPerformed.push(check.name);

      try {
        const issues = await Promise.resolve(check.run(context));
        allIssues.push(...issues);
      } catch (error) {
        // Log the error for debugging, but still report it as an issue
        logDebug(
          `Check "${check.id}" threw an error: ${error instanceof Error ? error.message : String(error)}`,
        );
        allIssues.push({
          severity: 'error',
          code: MCP_ISSUE_CODES.CHECK_FAILED,
          message: `Check "${check.name}" failed to execute`,
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const hasErrors = allIssues.some((i) => i.severity === 'error');

    return {
      valid: !hasErrors,
      issues: allIssues,
      ...(options.verbose && { checksPerformed }),
    };
  }
}

/**
 * Singleton instance of the check registry
 */
export const checkRegistry = new CheckRegistry();

/**
 * Register a check with the registry.
 * This is the preferred way to register checks explicitly.
 */
export function registerCheck<T extends ValidationContext>(
  check: ValidationCheck<T>,
): ValidationCheck<T> {
  checkRegistry.register(check);
  return check;
}

/**
 * Run MCP config validation
 */
export async function validateMcpConfig(
  context: McpConfigContext,
  options: ValidationOptions = {},
): Promise<ValidationResult> {
  const result = await checkRegistry.runChecks(context, options);

  // Count servers for MCP configs
  const config = context.config;
  const servers = (config.servers || config.mcpServers || {}) as Record<string, unknown>;
  result.serverCount = Object.keys(servers).length;

  return result;
}

/**
 * Run QNSC-MCP config validation.
 *
 * Note: Unlike validateMcpConfig, this does not set serverCount on the result
 * because QNSC-MCP configs don't have a "servers" concept - they configure
 * which tools/MCPs to enable, not server definitions.
 */
export async function validateQnscMcpConfig(
  context: QnscMcpConfigContext,
  options: ValidationOptions = {},
): Promise<ValidationResult> {
  return checkRegistry.runChecks(context, options);
}
