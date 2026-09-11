import { describe, expect, it } from 'bun:test';
import { ToolCategoryMap } from '../../../../registry/types';
import type { QnscMcpConfigContext } from '../../types';
import { categoryReferenceValidation } from './category-references';

describe('categoryReferenceValidation', () => {
  const createContext = (tools: Record<string, any> = {}): QnscMcpConfigContext => ({
    type: 'qnsc-mcp-config',
    config: { tools },
    filePath: '/test/.qnscmcp.yaml',
  });

  // Get actual valid categories from the type map
  const validCategories = Object.keys(ToolCategoryMap);

  it('should return no issues for valid includeCategories', () => {
    const context = createContext({
      includeCategories: validCategories.slice(0, 2), // Use actual valid categories
    });

    const issues = categoryReferenceValidation.run(context);

    expect(issues).toHaveLength(0);
  });

  it('should return no issues for valid excludeCategories', () => {
    const context = createContext({
      excludeCategories: validCategories.slice(0, 2),
    });

    const issues = categoryReferenceValidation.run(context);

    expect(issues).toHaveLength(0);
  });

  it('should warn about invalid category in includeCategories', () => {
    const context = createContext({
      includeCategories: ['invalid-category', validCategories[0]],
    });

    const issues = categoryReferenceValidation.run(context);

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('INVALID_CATEGORY_REFERENCE');
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].message).toContain('invalid-category');
    expect(issues[0].message).toContain('includeCategories');
  });

  it('should warn about invalid category in excludeCategories', () => {
    const context = createContext({
      excludeCategories: ['nonexistent-category'],
    });

    const issues = categoryReferenceValidation.run(context);

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('INVALID_CATEGORY_REFERENCE');
    expect(issues[0].message).toContain('nonexistent-category');
    expect(issues[0].message).toContain('excludeCategories');
  });

  it('should check both includeCategories and excludeCategories', () => {
    const context = createContext({
      includeCategories: ['invalid1'],
      excludeCategories: ['invalid2'],
    });

    const issues = categoryReferenceValidation.run(context);

    expect(issues).toHaveLength(2);
    expect(issues.some((i) => i.message.includes('invalid1'))).toBe(true);
    expect(issues.some((i) => i.message.includes('invalid2'))).toBe(true);
  });

  it('should handle empty category lists', () => {
    const context = createContext({
      includeCategories: [],
      excludeCategories: [],
    });

    const issues = categoryReferenceValidation.run(context);

    expect(issues).toHaveLength(0);
  });

  it('should handle missing category lists', () => {
    const context = createContext({});

    const issues = categoryReferenceValidation.run(context);

    expect(issues).toHaveLength(0);
  });

  it('should include valid categories in details', () => {
    const context = createContext({
      includeCategories: ['typo-category'],
    });

    const issues = categoryReferenceValidation.run(context);

    expect(issues).toHaveLength(1);
    expect(issues[0].details).toContain('Valid categories are:');
    // Should include at least one valid category
    expect(validCategories.some((cat) => issues[0].details?.includes(cat))).toBe(true);
  });

  it('should handle multiple invalid categories in same list', () => {
    const context = createContext({
      includeCategories: ['bad1', 'bad2', 'bad3'],
    });

    const issues = categoryReferenceValidation.run(context);

    expect(issues).toHaveLength(3);
    expect(issues.every((i) => i.code === 'INVALID_CATEGORY_REFERENCE')).toBe(true);
  });

  it('should accept parent category prefix in includeCategories', () => {
    // "Github" is a valid parent prefix for "Github: Actions", "Github: Pulls", etc.
    const context = createContext({
      includeCategories: ['Github'],
    });

    const issues = categoryReferenceValidation.run(context);

    expect(issues).toHaveLength(0);
  });

  it('should accept parent category prefix in excludeCategories', () => {
    const context = createContext({
      excludeCategories: ['Github'],
    });

    const issues = categoryReferenceValidation.run(context);

    expect(issues).toHaveLength(0);
  });

  it('should still warn for invalid parent-like prefixes that match no categories', () => {
    const context = createContext({
      includeCategories: ['Nonexistent'],
    });

    const issues = categoryReferenceValidation.run(context);

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('INVALID_CATEGORY_REFERENCE');
  });
});
