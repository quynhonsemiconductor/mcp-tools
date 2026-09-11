/**
 * Category reference validation for QNSC-MCP config
 */

import { ToolCategoryMap } from '../../../../registry/types';
import { CHECK_PRIORITIES } from '../../constants';
import { QNSCMCP_ISSUE_CODES } from '../../issue-codes';
import type {
  QnscMcpConfigContext,
  QnscMcpToolsConfig,
  ValidationCheck,
  ValidationIssue,
} from '../../types';
import { createSuggestionMessage } from '../../utils';

/** Maximum number of categories to show in the error details before truncating */
const MAX_CATEGORIES_TO_DISPLAY = 5;

/**
 * Format a list of valid categories for display, truncating if necessary.
 */
function formatCategoryList(categories: Set<string>): string {
  const categoryArray = Array.from(categories);
  if (categoryArray.length <= MAX_CATEGORIES_TO_DISPLAY) {
    return categoryArray.join(', ');
  }
  const displayed = categoryArray.slice(0, MAX_CATEGORIES_TO_DISPLAY).join(', ');
  const remaining = categoryArray.length - MAX_CATEGORIES_TO_DISPLAY;
  return `${displayed}, and ${remaining} more`;
}

/**
 * Check that category references are valid
 */
export const categoryReferenceValidation = {
  id: 'qnsc-mcp.category-references',
  name: 'Category reference validation',
  description: 'Validates that category names in includeCategories/excludeCategories are valid',
  appliesTo: 'qnsc-mcp-config',
  priority: CHECK_PRIORITIES.CATEGORY_REFERENCES,

  run(context: QnscMcpConfigContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const config = context.config;
    const tools = (config.tools || {}) as QnscMcpToolsConfig;

    const validCategories = new Set(Object.keys(ToolCategoryMap));
    const validCategoryList = Array.from(validCategories);

    // Build a set of valid parent category prefixes (e.g., "Github" from "Github: Actions")
    const validParentPrefixes = new Set<string>();
    for (const cat of validCategories) {
      const colonIndex = cat.indexOf(':');
      if (colonIndex !== -1) {
        validParentPrefixes.add(cat.substring(0, colonIndex).trim());
      }
    }

    // Check includeCategories
    const includeCategories = tools.includeCategories || [];
    for (const category of includeCategories) {
      if (!validCategories.has(category) && !validParentPrefixes.has(category)) {
        issues.push({
          severity: 'warning',
          code: QNSCMCP_ISSUE_CODES.INVALID_CATEGORY_REFERENCE,
          message: createSuggestionMessage(
            `Unknown category in includeCategories: "${category}"`,
            category,
            validCategoryList,
          ),
          details: `Valid categories are: ${formatCategoryList(validCategories)}`,
        });
      }
    }

    // Check excludeCategories
    const excludeCategories = tools.excludeCategories || [];
    for (const category of excludeCategories) {
      if (!validCategories.has(category) && !validParentPrefixes.has(category)) {
        issues.push({
          severity: 'warning',
          code: QNSCMCP_ISSUE_CODES.INVALID_CATEGORY_REFERENCE,
          message: createSuggestionMessage(
            `Unknown category in excludeCategories: "${category}"`,
            category,
            validCategoryList,
          ),
          details: `Valid categories are: ${formatCategoryList(validCategories)}`,
        });
      }
    }

    return issues;
  },
} satisfies ValidationCheck<QnscMcpConfigContext>;
