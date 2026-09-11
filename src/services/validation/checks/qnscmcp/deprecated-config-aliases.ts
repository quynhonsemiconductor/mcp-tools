/**
 * Deprecated configuration alias check for QNSC-MCP
 *
 * Detects legacy config keys in .qnscmcp.yaml that are silently remapped
 * to their current equivalents. Nudges users to update their config directly.
 *
 * CONFIGURATION_ALIASES currently ships empty, so this check reports nothing in
 * practice. The detection logic is exported separately as findDeprecatedAliases
 * so it stays covered independently of whichever aliases happen to ship.
 *
 * This check re-reads the raw YAML file because applyConfigurationAliases()
 * mutates the config in place (splicing matched items), so by the time doctor
 * checks run the deprecated keys have already been removed.
 */

import fs from 'fs';
import yaml from 'js-yaml';
import { CONFIGURATION_ALIASES } from '../../../../config';
import { CHECK_PRIORITIES } from '../../constants';
import { QNSCMCP_ISSUE_CODES } from '../../issue-codes';
import type { QnscMcpConfigContext, ValidationCheck, ValidationIssue } from '../../types';

/**
 * Report an issue for every alias in `aliases` whose legacy key appears in
 * `rawConfig`.
 *
 * @param rawConfig - Parsed, pre-alias configuration object
 * @param aliases - Legacy-key to current-key map to look for
 * @returns One info issue per legacy key found
 */
export function findDeprecatedAliases(
  rawConfig: unknown,
  aliases: Record<string, string>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!rawConfig || typeof rawConfig !== 'object') return issues;

  // Safely walk a dotted path through nested plain objects, returning
  // undefined as soon as a non-object segment is encountered.
  const navigate = (root: unknown, parts: string[]): unknown => {
    let current: unknown = root;
    for (const part of parts) {
      if (typeof current !== 'object' || current === null) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  };

  for (const [aliasPath, targetPath] of Object.entries(aliases)) {
    if (!aliasPath.includes('.[]')) {
      // Non-array alias: check if the property exists
      const parts = aliasPath.split('.');
      const current = navigate(rawConfig, parts);
      if (current !== undefined) {
        issues.push({
          severity: 'info',
          code: QNSCMCP_ISSUE_CODES.DEPRECATED_CONFIG_ALIAS,
          message: `Deprecated config key '${aliasPath}' is in use`,
          details: `Update your .qnscmcp.yaml to use '${targetPath}' directly.`,
        });
      }
      continue;
    }

    const [arrayPathStr, itemMatch] = aliasPath.split('.[].');
    const arrayPathParts = arrayPathStr.split('.').filter((p) => p);

    const sourceArray = navigate(rawConfig, arrayPathParts);

    if (!Array.isArray(sourceArray)) continue;

    const isWildcard = itemMatch.endsWith('*');
    const prefix = isWildcard ? itemMatch.slice(0, -1) : '';
    const hasMatch = sourceArray.some(
      (item: unknown) =>
        typeof item === 'string' && (isWildcard ? item.startsWith(prefix) : item === itemMatch),
    );

    if (!hasMatch) continue;

    const [targetArrayStr, targetItem] = targetPath.split('.[].');
    const targetKey = targetArrayStr.split('.').pop();

    issues.push({
      severity: 'info',
      code: QNSCMCP_ISSUE_CODES.DEPRECATED_CONFIG_ALIAS,
      message: `Deprecated config key '${aliasPath}' is in use`,
      details: `Update your .qnscmcp.yaml to use '${targetKey}: [${targetItem}]' directly.`,
    });
  }

  return issues;
}

export const deprecatedConfigAliasCheck = {
  id: 'qnscmcp.deprecated-config-aliases',
  name: 'Deprecated Configuration Aliases',
  description: 'Check for legacy config keys that are silently remapped',
  appliesTo: 'qnsc-mcp-config',
  priority: CHECK_PRIORITIES.DEPRECATED_CONFIG_ALIASES,

  run(context: QnscMcpConfigContext): ValidationIssue[] {
    if (!context.filePath) return [];

    // Re-read the raw config to see the pre-alias state
    let rawConfig: unknown;
    try {
      const content = fs.readFileSync(context.filePath, 'utf-8');
      rawConfig = yaml.load(content);
    } catch {
      return [];
    }

    return findDeprecatedAliases(rawConfig, CONFIGURATION_ALIASES);
  },
} satisfies ValidationCheck<QnscMcpConfigContext>;
