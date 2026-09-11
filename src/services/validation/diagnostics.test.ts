import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { setupStandardMocks } from '../../test-utils/mocks';

// Get mock references (mocks.ts sets up module-level mocks, we call again to get references)
const { mockLoadConfig } = setupStandardMocks();

// Import after mocks are set up
import {
  aggregateResults,
  checkEnabledFunctionality,
  formatIssueMessage,
  getRecommendations,
  getSearchedPaths,
  groupBySource,
  runDiagnostics,
} from './diagnostics';
import { QNSCMCP_ISSUE_CODES, ISSUE_RECOMMENDATIONS, MCP_ISSUE_CODES } from './issue-codes';
import type { ValidationIssue, ValidationResult } from './types';
import { ConfigValidator } from './validator';

describe('diagnostics', () => {
  beforeEach(() => {
    mockLoadConfig.mockReset();
    // Default: return config with some tools enabled so cross-config check passes
    mockLoadConfig.mockReturnValue({
      tools: { includeMCPs: ['test-mcp'] },
      source: 'test-config.yaml',
    });
  });

  afterEach(() => {
    mock.restore();
  });

  describe('groupBySource', () => {
    it('groups issues by source', () => {
      const issues: (ValidationIssue & { source?: string })[] = [
        { severity: 'error', code: 'TEST1', message: 'Error 1', source: 'Claude Desktop' },
        { severity: 'warning', code: 'TEST2', message: 'Warning 1', source: 'VS Code' },
        { severity: 'error', code: 'TEST3', message: 'Error 2', source: 'Claude Desktop' },
      ];

      const grouped = groupBySource(issues);

      expect(Object.keys(grouped)).toEqual(['Claude Desktop', 'VS Code']);
      expect(grouped['Claude Desktop']).toHaveLength(2);
      expect(grouped['VS Code']).toHaveLength(1);
    });

    it('uses "Unknown" for issues without source', () => {
      const issues: (ValidationIssue & { source?: string })[] = [
        { severity: 'error', code: 'TEST1', message: 'Error 1' },
        { severity: 'warning', code: 'TEST2', message: 'Warning 1', source: 'Known Source' },
      ];

      const grouped = groupBySource(issues);

      expect(grouped['Unknown']).toHaveLength(1);
      expect(grouped['Known Source']).toHaveLength(1);
    });

    it('handles empty array', () => {
      const grouped = groupBySource([]);
      expect(Object.keys(grouped)).toHaveLength(0);
    });
  });

  describe('formatIssueMessage', () => {
    it('returns message as-is when no serverName', () => {
      const issue: ValidationIssue = {
        severity: 'error',
        code: 'TEST',
        message: 'Test error message',
      };

      expect(formatIssueMessage(issue)).toBe('Test error message');
    });

    it('appends server name when present', () => {
      const issue: ValidationIssue = {
        severity: 'warning',
        code: 'TEST',
        message: 'Missing env var',
        serverName: 'my-server',
      };

      expect(formatIssueMessage(issue)).toBe('Missing env var (server: my-server)');
    });
  });

  describe('getRecommendations', () => {
    it('returns recommendations for known issue codes', () => {
      const issues: ValidationIssue[] = [
        { severity: 'error', code: MCP_ISSUE_CODES.EXECUTABLE_NOT_FOUND, message: 'Exe not found' },
      ];

      const recommendations = getRecommendations(issues);

      expect(recommendations.size).toBe(1);
      const firstRec = recommendations.values().next().value;
      expect(firstRec).toEqual(ISSUE_RECOMMENDATIONS[MCP_ISSUE_CODES.EXECUTABLE_NOT_FOUND]);
    });

    it('deduplicates recommendations for same issue type', () => {
      const issues: ValidationIssue[] = [
        {
          severity: 'error',
          code: MCP_ISSUE_CODES.EXECUTABLE_NOT_FOUND,
          message: 'Exe 1 not found',
        },
        {
          severity: 'error',
          code: MCP_ISSUE_CODES.EXECUTABLE_NOT_FOUND,
          message: 'Exe 2 not found',
        },
      ];

      const recommendations = getRecommendations(issues);

      // Should only have one recommendation even though there are two issues with same code
      expect(recommendations.size).toBe(1);
    });

    it('returns multiple recommendations for different issue types', () => {
      const issues: ValidationIssue[] = [
        { severity: 'error', code: MCP_ISSUE_CODES.EXECUTABLE_NOT_FOUND, message: 'Exe not found' },
        { severity: 'warning', code: MCP_ISSUE_CODES.HARDCODED_SECRET, message: 'Secret found' },
      ];

      const recommendations = getRecommendations(issues);

      expect(recommendations.size).toBe(2);
    });

    it('returns empty map for unknown issue codes', () => {
      const issues: ValidationIssue[] = [
        { severity: 'error', code: 'UNKNOWN_CODE', message: 'Unknown issue' },
      ];

      const recommendations = getRecommendations(issues);

      expect(recommendations.size).toBe(0);
    });

    it('returns empty map for empty issues array', () => {
      const recommendations = getRecommendations([]);
      expect(recommendations.size).toBe(0);
    });

    it('returns recommendation for CONFIG_LOAD_ERROR', () => {
      const issues: ValidationIssue[] = [
        {
          severity: 'warning',
          code: QNSCMCP_ISSUE_CODES.CONFIG_LOAD_ERROR,
          message: 'Config load error',
        },
      ];

      const recommendations = getRecommendations(issues);

      expect(recommendations.size).toBe(1);
      const rec = recommendations.get(QNSCMCP_ISSUE_CODES.CONFIG_LOAD_ERROR);
      expect(rec).toBeDefined();
      expect(rec![0]).toContain('config load errors');
    });
  });

  describe('getSearchedPaths', () => {
    it('returns array of platform-specific paths', () => {
      const paths = getSearchedPaths();

      expect(Array.isArray(paths)).toBe(true);
      expect(paths.length).toBeGreaterThan(0);
      // Each path should have path and description properties
      paths.forEach((p) => {
        expect(p).toHaveProperty('path');
        expect(p).toHaveProperty('description');
        expect(typeof p.path).toBe('string');
        expect(typeof p.description).toBe('string');
      });
    });
  });

  describe('aggregateResults', () => {
    it('combines issues from multiple configs', () => {
      const mcpResults = [
        {
          configInfo: { path: '/path/1', client: 'claude', clientName: 'Claude Desktop' },
          result: {
            valid: true,
            issues: [{ severity: 'warning' as const, code: 'WARN1', message: 'Warning 1' }],
            serverCount: 2,
          },
        },
        {
          configInfo: { path: '/path/2', client: 'vscode', clientName: 'VS Code' },
          result: {
            valid: true,
            issues: [{ severity: 'error' as const, code: 'ERR1', message: 'Error 1' }],
            serverCount: 1,
          },
        },
      ];

      const qnscMcpResult: ValidationResult = {
        valid: true,
        issues: [{ severity: 'info' as const, code: 'INFO1', message: 'Info 1' }],
      };

      const aggregated = aggregateResults(mcpResults as any[], qnscMcpResult);

      expect(aggregated.allIssues).toHaveLength(3);
      expect(aggregated.totalServerCount).toBe(3);
    });

    it('sets overallValid to false when any config is invalid', () => {
      const mcpResults = [
        {
          configInfo: { path: '/path/1', client: 'claude', clientName: 'Claude Desktop' },
          result: { valid: false, issues: [], serverCount: 0 },
        },
      ];

      const qnscMcpResult: ValidationResult = { valid: true, issues: [] };

      const aggregated = aggregateResults(mcpResults as any[], qnscMcpResult);

      expect(aggregated.overallValid).toBe(false);
    });

    it('sets overallValid to false when qnscMcpResult is invalid', () => {
      const mcpResults = [
        {
          configInfo: { path: '/path/1', client: 'claude', clientName: 'Claude Desktop' },
          result: { valid: true, issues: [], serverCount: 1 },
        },
      ];

      const qnscMcpResult: ValidationResult = { valid: false, issues: [] };

      const aggregated = aggregateResults(mcpResults as any[], qnscMcpResult);

      expect(aggregated.overallValid).toBe(false);
    });

    it('adds source to each issue', () => {
      const mcpResults = [
        {
          configInfo: { path: '/path/1', client: 'claude', clientName: 'Claude Desktop' },
          result: {
            valid: true,
            issues: [{ severity: 'warning' as const, code: 'WARN1', message: 'Warning' }],
            serverCount: 1,
          },
        },
      ];

      const qnscMcpResult: ValidationResult = {
        valid: true,
        issues: [{ severity: 'info' as const, code: 'INFO1', message: 'Info' }],
      };

      const aggregated = aggregateResults(mcpResults as any[], qnscMcpResult);

      expect(aggregated.allIssues[0].source).toBe('Claude Desktop');
      expect(aggregated.allIssues[1].source).toBe('QNSC-MCP Config');
    });

    it('collects checksPerformed when verbose', () => {
      const mcpResults = [
        {
          configInfo: { path: '/path/1', client: 'claude', clientName: 'Claude Desktop' },
          result: {
            valid: true,
            issues: [],
            serverCount: 1,
            checksPerformed: ['Check 1', 'Check 2'],
          },
        },
      ];

      const qnscMcpResult: ValidationResult = {
        valid: true,
        issues: [],
        checksPerformed: ['QNSC Check 1'],
      };

      const aggregated = aggregateResults(mcpResults as any[], qnscMcpResult, true);

      expect(aggregated.allChecksPerformed).toContain('[Claude Desktop] Check 1');
      expect(aggregated.allChecksPerformed).toContain('[Claude Desktop] Check 2');
      expect(aggregated.allChecksPerformed).toContain('[QNSC-MCP Config] QNSC Check 1');
      expect(aggregated.allChecksPerformed).toContain('[Cross-Config] Enabled functionality check');
    });
  });

  describe('checkEnabledFunctionality', () => {
    it('returns undefined when totalServerCount > 0', () => {
      const result = checkEnabledFunctionality(1);
      expect(result).toBeUndefined();
    });

    it('returns undefined when includeMCPs are configured', () => {
      mockLoadConfig.mockReturnValue({
        tools: { includeMCPs: ['figma'] },
      });

      const result = checkEnabledFunctionality(0);
      expect(result).toBeUndefined();
    });

    it('returns undefined when includeRemoteMCPs are configured', () => {
      mockLoadConfig.mockReturnValue({
        tools: { includeRemoteMCPs: ['remote-server'] },
      });

      const result = checkEnabledFunctionality(0);
      expect(result).toBeUndefined();
    });

    it('returns undefined when includeLocalMCPs are configured', () => {
      mockLoadConfig.mockReturnValue({
        tools: { includeLocalMCPs: ['local-server'] },
      });

      const result = checkEnabledFunctionality(0);
      expect(result).toBeUndefined();
    });

    it('returns undefined when include tools are configured', () => {
      mockLoadConfig.mockReturnValue({
        tools: { include: ['some-tool'] },
      });

      const result = checkEnabledFunctionality(0);
      expect(result).toBeUndefined();
    });

    it('returns undefined when includeCategories are configured', () => {
      mockLoadConfig.mockReturnValue({
        tools: { includeCategories: ['k6'] },
      });

      const result = checkEnabledFunctionality(0);
      expect(result).toBeUndefined();
    });

    it('returns warning when nothing is configured', () => {
      mockLoadConfig.mockReturnValue({
        tools: {},
        source: 'test-config.yaml',
      });

      const result = checkEnabledFunctionality(0);

      expect(result).toBeDefined();
      expect(result!.severity).toBe('warning');
      expect(result!.code).toBe(QNSCMCP_ISSUE_CODES.NO_TOOLS_ENABLED);
      expect(result!.message).toBe('No MCP servers or tools configured');
    });

    it('returns config load error when config parsing fails', () => {
      mockLoadConfig.mockImplementation(() => {
        throw new Error('Invalid YAML syntax');
      });

      const result = checkEnabledFunctionality(0);

      expect(result).toBeDefined();
      expect(result!.severity).toBe('warning');
      expect(result!.code).toBe(QNSCMCP_ISSUE_CODES.CONFIG_LOAD_ERROR);
      expect(result!.message).toContain('Could not load QNSC-MCP config');
      expect(result!.details).toContain('Invalid YAML syntax');
    });

    it('uses config source in details message', () => {
      mockLoadConfig.mockReturnValue({
        tools: {},
        source: 'custom-config.yaml',
      });

      const result = checkEnabledFunctionality(0);

      expect(result!.details).toContain('custom-config.yaml');
    });
  });

  describe('runDiagnostics', () => {
    let validateConfigFileSpy: ReturnType<typeof spyOn>;
    let validateQnscMcpConfigSpy: ReturnType<typeof spyOn>;
    let findAllMcpConfigsSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      // Set up spies for ConfigValidator methods
      validateConfigFileSpy = spyOn(ConfigValidator, 'validateConfigFile');
      validateQnscMcpConfigSpy = spyOn(ConfigValidator, 'validateQnscMcpConfig');
      findAllMcpConfigsSpy = spyOn(ConfigValidator, 'findAllMcpConfigs');
    });

    it('validates specific config when configPath is provided', async () => {
      validateConfigFileSpy.mockResolvedValue({
        valid: true,
        issues: [],
        serverCount: 2,
      });
      validateQnscMcpConfigSpy.mockResolvedValue({
        valid: true,
        issues: [],
      });

      const result = await runDiagnostics({ configPath: '/custom/path.json' });

      expect(validateConfigFileSpy).toHaveBeenCalledWith('/custom/path.json', { verbose: false });
      expect(findAllMcpConfigsSpy).not.toHaveBeenCalled();
      expect(result.mcpResults).toHaveLength(1);
      expect(result.mcpResults[0].configInfo.path).toBe('/custom/path.json');
      expect(result.mcpResults[0].configInfo.clientName).toBe('Custom Path');
    });

    it('routes YAML configPath to validateQnscMcpConfigFile', async () => {
      const validateQnscMcpConfigFileSpy = spyOn(ConfigValidator, 'validateQnscMcpConfigFile');
      validateQnscMcpConfigFileSpy.mockResolvedValue({
        valid: true,
        issues: [],
        configPath: '/custom/config.yaml',
      });

      const result = await runDiagnostics({ configPath: '/custom/config.yaml' });

      expect(validateQnscMcpConfigFileSpy).toHaveBeenCalledWith('/custom/config.yaml', {
        verbose: false,
      });
      expect(validateConfigFileSpy).not.toHaveBeenCalled();
      expect(findAllMcpConfigsSpy).not.toHaveBeenCalled();
      // YAML path goes to qnscMcpResult, not mcpResults
      expect(result.mcpResults).toHaveLength(0);
      expect(result.qnscMcpResult.configPath).toBe('/custom/config.yaml');
    });

    it('routes .yml configPath to validateQnscMcpConfigFile', async () => {
      const validateQnscMcpConfigFileSpy = spyOn(ConfigValidator, 'validateQnscMcpConfigFile');
      validateQnscMcpConfigFileSpy.mockResolvedValue({
        valid: true,
        issues: [],
        configPath: '/custom/config.yml',
      });

      const result = await runDiagnostics({ configPath: '/custom/config.yml' });

      expect(validateQnscMcpConfigFileSpy).toHaveBeenCalledWith('/custom/config.yml', {
        verbose: false,
      });
      expect(validateConfigFileSpy).not.toHaveBeenCalled();
      expect(result.mcpResults).toHaveLength(0);
    });

    it('finds and validates all configs when no configPath provided', async () => {
      findAllMcpConfigsSpy.mockReturnValue([
        { path: '/path/to/claude.json', client: 'claude', clientName: 'Claude Desktop' },
        { path: '/path/to/vscode.json', client: 'vscode', clientName: 'VS Code' },
      ]);
      validateConfigFileSpy.mockResolvedValue({
        valid: true,
        issues: [],
        serverCount: 1,
      });
      validateQnscMcpConfigSpy.mockResolvedValue({
        valid: true,
        issues: [],
      });

      const result = await runDiagnostics();

      expect(findAllMcpConfigsSpy).toHaveBeenCalled();
      expect(validateConfigFileSpy).toHaveBeenCalledTimes(2);
      expect(result.mcpResults).toHaveLength(2);
      expect(result.aggregated.totalServerCount).toBe(2);
    });

    it('returns aggregated results with issues from all sources', async () => {
      findAllMcpConfigsSpy.mockReturnValue([
        { path: '/path/to/claude.json', client: 'claude', clientName: 'Claude Desktop' },
      ]);
      validateConfigFileSpy.mockResolvedValue({
        valid: false,
        issues: [{ severity: 'error', code: 'MCP_ERROR', message: 'MCP issue' }],
        serverCount: 1,
      });
      validateQnscMcpConfigSpy.mockResolvedValue({
        valid: true,
        issues: [{ severity: 'warning', code: 'QNSC_WARN', message: 'QNSC warning' }],
      });

      const result = await runDiagnostics();

      expect(result.aggregated.allIssues).toHaveLength(2);
      expect(result.aggregated.allIssues[0].source).toBe('Claude Desktop');
      expect(result.aggregated.allIssues[1].source).toBe('QNSC-MCP Config');
      expect(result.aggregated.overallValid).toBe(false);
    });

    it('passes verbose flag to validators', async () => {
      findAllMcpConfigsSpy.mockReturnValue([
        { path: '/path/to/config.json', client: 'claude', clientName: 'Claude Desktop' },
      ]);
      validateConfigFileSpy.mockResolvedValue({
        valid: true,
        issues: [],
        serverCount: 1,
        checksPerformed: ['Check 1'],
      });
      validateQnscMcpConfigSpy.mockResolvedValue({
        valid: true,
        issues: [],
        checksPerformed: ['QNSC Check'],
      });

      const result = await runDiagnostics({ verbose: true });

      expect(validateConfigFileSpy).toHaveBeenCalledWith('/path/to/config.json', { verbose: true });
      expect(validateQnscMcpConfigSpy).toHaveBeenCalledWith({ verbose: true });
      expect(result.aggregated.allChecksPerformed).toContain('[Claude Desktop] Check 1');
      expect(result.aggregated.allChecksPerformed).toContain('[QNSC-MCP Config] QNSC Check');
    });

    it('returns empty mcpResults when no configs found', async () => {
      findAllMcpConfigsSpy.mockReturnValue([]);
      validateQnscMcpConfigSpy.mockResolvedValue({
        valid: true,
        issues: [],
      });

      const result = await runDiagnostics();

      expect(result.mcpResults).toHaveLength(0);
      expect(result.qnscMcpResult).toBeDefined();
    });

    it('handles validation errors in specified configPath', async () => {
      validateConfigFileSpy.mockResolvedValue({
        valid: false,
        issues: [{ severity: 'error', code: 'PARSE_ERROR', message: 'Invalid JSON syntax' }],
        serverCount: 0,
      });
      validateQnscMcpConfigSpy.mockResolvedValue({
        valid: true,
        issues: [],
      });

      const result = await runDiagnostics({ configPath: '/invalid/config.json' });

      expect(result.mcpResults).toHaveLength(1);
      expect(result.mcpResults[0].result.valid).toBe(false);
      expect(result.mcpResults[0].result.issues[0].code).toBe('PARSE_ERROR');
      expect(result.aggregated.overallValid).toBe(false);
    });

    it('always validates QNSC-MCP config even when configPath is provided', async () => {
      validateConfigFileSpy.mockResolvedValue({
        valid: true,
        issues: [],
        serverCount: 1,
      });
      validateQnscMcpConfigSpy.mockResolvedValue({
        valid: true,
        issues: [],
      });

      await runDiagnostics({ configPath: '/specific/config.json' });

      // Both the specific config AND QNSC-MCP config should be validated
      expect(validateConfigFileSpy).toHaveBeenCalledTimes(1);
      expect(validateQnscMcpConfigSpy).toHaveBeenCalledTimes(1);
    });
  });
});
