import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { checkRegistry, registerCheck } from './check-registry';
import { isIssueCode, MCP_ISSUE_CODES, QNSCMCP_ISSUE_CODES } from './issue-codes';
import type { McpConfigContext, ValidationCheck, ValidationIssue } from './types';

describe('CheckRegistry', () => {
  // Reset registry between tests
  beforeEach(() => {
    checkRegistry.reset();
  });

  afterEach(() => {
    checkRegistry.reset();
  });

  describe('register', () => {
    it('should register a check successfully', () => {
      const check: ValidationCheck<McpConfigContext> = {
        id: 'test.check-1',
        name: 'Test Check 1',
        description: 'A test check',
        appliesTo: 'mcp-config',
        run: () => [],
      };

      registerCheck(check);

      expect(checkRegistry.getCheck('test.check-1')).toBeDefined();
      expect(checkRegistry.getCheck('test.check-1')?.name).toBe('Test Check 1');
    });

    it('should throw when registering duplicate check ID', () => {
      const check1: ValidationCheck<McpConfigContext> = {
        id: 'test.duplicate',
        name: 'Check 1',
        description: 'First check',
        appliesTo: 'mcp-config',
        run: () => [],
      };

      const check2: ValidationCheck<McpConfigContext> = {
        id: 'test.duplicate',
        name: 'Check 2',
        description: 'Second check with same ID',
        appliesTo: 'mcp-config',
        run: () => [],
      };

      registerCheck(check1);
      expect(() => registerCheck(check2)).toThrow(
        'Check with ID "test.duplicate" is already registered',
      );
    });
  });

  describe('unregister', () => {
    it('should unregister an existing check', () => {
      const check: ValidationCheck<McpConfigContext> = {
        id: 'test.to-remove',
        name: 'Removable Check',
        description: 'Will be removed',
        appliesTo: 'mcp-config',
        run: () => [],
      };

      registerCheck(check);
      expect(checkRegistry.getCheck('test.to-remove')).toBeDefined();

      const result = checkRegistry.unregister('test.to-remove');

      expect(result).toBe(true);
      expect(checkRegistry.getCheck('test.to-remove')).toBeUndefined();
    });

    it('should return false for non-existent check', () => {
      const result = checkRegistry.unregister('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('getChecksFor', () => {
    beforeEach(() => {
      registerCheck({
        id: 'mcp.check-a',
        name: 'MCP Check A',
        description: 'First MCP check',
        appliesTo: 'mcp-config',
        priority: 10,
        run: () => [],
      });

      registerCheck({
        id: 'mcp.check-b',
        name: 'MCP Check B',
        description: 'Second MCP check',
        appliesTo: 'mcp-config',
        priority: 5,
        run: () => [],
      });

      registerCheck({
        id: 'qnscmcp.check-c',
        name: 'QNSC-MCP Check C',
        description: 'QNSC-MCP check',
        appliesTo: 'qnsc-mcp-config',
        priority: 10,
        run: () => [],
      });
    });

    it('should return checks for the specified context type', () => {
      const mcpChecks = checkRegistry.getChecksFor('mcp-config');
      const qnscMcpChecks = checkRegistry.getChecksFor('qnsc-mcp-config');

      expect(mcpChecks).toHaveLength(2);
      expect(qnscMcpChecks).toHaveLength(1);
      expect(qnscMcpChecks[0].id).toBe('qnscmcp.check-c');
    });

    it('should sort checks by priority (lower first)', () => {
      const checks = checkRegistry.getChecksFor('mcp-config');

      expect(checks[0].id).toBe('mcp.check-b'); // priority 5
      expect(checks[1].id).toBe('mcp.check-a'); // priority 10
    });

    it('should filter checks with options.only', () => {
      const checks = checkRegistry.getChecksFor('mcp-config', {
        only: ['mcp.check-a'],
      });

      expect(checks).toHaveLength(1);
      expect(checks[0].id).toBe('mcp.check-a');
    });

    it('should filter out checks with options.skip', () => {
      const checks = checkRegistry.getChecksFor('mcp-config', {
        skip: ['mcp.check-a'],
      });

      expect(checks).toHaveLength(1);
      expect(checks[0].id).toBe('mcp.check-b');
    });
  });

  describe('listChecks', () => {
    it('should list all registered checks sorted by ID', () => {
      registerCheck({
        id: 'z.last',
        name: 'Last Check',
        description: 'Alphabetically last',
        appliesTo: 'mcp-config',
        priority: 10,
        run: () => [],
      });

      registerCheck({
        id: 'a.first',
        name: 'First Check',
        description: 'Alphabetically first',
        appliesTo: 'mcp-config',
        priority: 5,
        run: () => [],
      });

      const checks = checkRegistry.listChecks();

      expect(checks).toHaveLength(2);
      expect(checks[0].id).toBe('a.first');
      expect(checks[1].id).toBe('z.last');
    });

    it('should include all metadata fields', () => {
      registerCheck({
        id: 'test.metadata',
        name: 'Metadata Check',
        description: 'Has all metadata',
        appliesTo: 'mcp-config',
        priority: 42,
        run: () => [],
      });

      const checks = checkRegistry.listChecks();

      expect(checks[0]).toEqual({
        id: 'test.metadata',
        name: 'Metadata Check',
        description: 'Has all metadata',
        appliesTo: 'mcp-config',
        priority: 42,
      });
    });

    it('should return empty array when no checks registered', () => {
      const checks = checkRegistry.listChecks();
      expect(checks).toEqual([]);
    });
  });

  describe('getAllCheckIds', () => {
    it('should return all registered check IDs', () => {
      registerCheck({
        id: 'test.one',
        name: 'One',
        description: 'First',
        appliesTo: 'mcp-config',
        run: () => [],
      });

      registerCheck({
        id: 'test.two',
        name: 'Two',
        description: 'Second',
        appliesTo: 'qnsc-mcp-config',
        run: () => [],
      });

      const ids = checkRegistry.getAllCheckIds();

      expect(ids).toHaveLength(2);
      expect(ids).toContain('test.one');
      expect(ids).toContain('test.two');
    });
  });

  describe('runChecks', () => {
    it('should run all applicable checks and collect issues', async () => {
      registerCheck<McpConfigContext>({
        id: 'test.issue-check',
        name: 'Issue Check',
        description: 'Returns issues',
        appliesTo: 'mcp-config',
        run: (): ValidationIssue[] => [
          {
            severity: 'warning',
            code: 'TEST_WARNING',
            message: 'Test warning message',
          },
        ],
      });

      const context: McpConfigContext = {
        type: 'mcp-config',
        config: { servers: {} },
        filePath: '/test/config.json',
        format: 'servers',
      };

      const result = await checkRegistry.runChecks(context);

      expect(result.valid).toBe(true); // warnings don't make it invalid
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].code).toBe('TEST_WARNING');
    });

    it('should set valid to false when errors are present', async () => {
      registerCheck<McpConfigContext>({
        id: 'test.error-check',
        name: 'Error Check',
        description: 'Returns errors',
        appliesTo: 'mcp-config',
        run: (): ValidationIssue[] => [
          {
            severity: 'error',
            code: 'TEST_ERROR',
            message: 'Test error message',
          },
        ],
      });

      const context: McpConfigContext = {
        type: 'mcp-config',
        config: { servers: {} },
        filePath: '/test/config.json',
        format: 'servers',
      };

      const result = await checkRegistry.runChecks(context);

      expect(result.valid).toBe(false);
    });

    it('should include checksPerformed in verbose mode', async () => {
      registerCheck<McpConfigContext>({
        id: 'test.verbose-check',
        name: 'Verbose Check',
        description: 'Check for verbose test',
        appliesTo: 'mcp-config',
        run: () => [],
      });

      const context: McpConfigContext = {
        type: 'mcp-config',
        config: { servers: {} },
        filePath: '/test/config.json',
        format: 'servers',
      };

      const result = await checkRegistry.runChecks(context, { verbose: true });

      expect(result.checksPerformed).toBeDefined();
      expect(result.checksPerformed).toContain('Verbose Check');
    });

    it('should handle check errors gracefully', async () => {
      registerCheck<McpConfigContext>({
        id: 'test.throwing-check',
        name: 'Throwing Check',
        description: 'Throws an error',
        appliesTo: 'mcp-config',
        run: () => {
          throw new Error('Check exploded');
        },
      });

      const context: McpConfigContext = {
        type: 'mcp-config',
        config: { servers: {} },
        filePath: '/test/config.json',
        format: 'servers',
      };

      const result = await checkRegistry.runChecks(context);

      expect(result.valid).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].code).toBe('CHECK_FAILED');
      expect(result.issues[0].message).toContain('Throwing Check');
      expect(result.issues[0].details).toContain('Check exploded');
    });
  });

  describe('reset', () => {
    it('should clear all registered checks', () => {
      registerCheck({
        id: 'test.clearable',
        name: 'Clearable',
        description: 'Will be cleared',
        appliesTo: 'mcp-config',
        run: () => [],
      });

      expect(checkRegistry.getAllCheckIds()).toHaveLength(1);

      checkRegistry.reset();

      expect(checkRegistry.getAllCheckIds()).toHaveLength(0);
    });
  });
});

describe('isIssueCode', () => {
  it('should return true for valid MCP issue codes', () => {
    expect(isIssueCode(MCP_ISSUE_CODES.FILE_NOT_FOUND)).toBe(true);
    expect(isIssueCode(MCP_ISSUE_CODES.INVALID_JSON)).toBe(true);
    expect(isIssueCode(MCP_ISSUE_CODES.HARDCODED_SECRET)).toBe(true);
    expect(isIssueCode(MCP_ISSUE_CODES.DUPLICATE_EXECUTABLE)).toBe(true);
  });

  it('should return true for valid QNSC-MCP issue codes', () => {
    expect(isIssueCode(QNSCMCP_ISSUE_CODES.INVALID_TOOL_REFERENCE)).toBe(true);
    expect(isIssueCode(QNSCMCP_ISSUE_CODES.UNKNOWN_BUNDLED_MCP)).toBe(true);
    expect(isIssueCode(QNSCMCP_ISSUE_CODES.NO_TOOLS_ENABLED)).toBe(true);
  });

  it('should return false for invalid issue codes', () => {
    expect(isIssueCode('NOT_A_REAL_CODE')).toBe(false);
    expect(isIssueCode('RANDOM_STRING')).toBe(false);
    expect(isIssueCode('')).toBe(false);
    expect(isIssueCode('file_not_found')).toBe(false); // Case sensitive
  });
});
