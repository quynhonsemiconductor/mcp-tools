import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { DoctorTool } from './doctor-tool';
import { ConfigValidator } from '../../services/validation/validator';

describe('DoctorTool', () => {
  let tool: DoctorTool;
  let validateConfigFileSpy: ReturnType<typeof spyOn>;
  let validateQnscMcpConfigSpy: ReturnType<typeof spyOn>;
  let findAllMcpConfigsSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tool = new DoctorTool();

    // Spy on ConfigValidator methods
    validateConfigFileSpy = spyOn(ConfigValidator, 'validateConfigFile');
    validateQnscMcpConfigSpy = spyOn(ConfigValidator, 'validateQnscMcpConfig');
    findAllMcpConfigsSpy = spyOn(ConfigValidator, 'findAllMcpConfigs');
  });

  describe('execute', () => {
    it('should validate all found configs when no configPath specified', async () => {
      findAllMcpConfigsSpy.mockReturnValue([
        { path: '/path/to/vscode.json', client: 'vscode', clientName: 'VS Code' },
        { path: '/path/to/claude.json', client: 'claude', clientName: 'Claude Desktop' },
      ]);
      validateConfigFileSpy.mockResolvedValue({
        valid: true,
        issues: [],
        serverCount: 2,
        checksPerformed: ['Check executables', 'Check env vars'],
      });
      validateQnscMcpConfigSpy.mockResolvedValue({
        valid: true,
        issues: [],
        checksPerformed: ['Check tool references'],
      });

      const result = await tool.execute({});

      expect(result).toContain('Found 2 MCP configuration file(s)');
      expect(result).toContain('VS Code');
      expect(result).toContain('Claude Desktop');
      expect(result).toContain('✅');
      expect(findAllMcpConfigsSpy).toHaveBeenCalled();
      expect(validateConfigFileSpy).toHaveBeenCalledTimes(2);
      expect(validateQnscMcpConfigSpy).toHaveBeenCalled();
    });

    it('should validate specific config when configPath provided', async () => {
      validateConfigFileSpy.mockResolvedValue({
        valid: true,
        issues: [],
        serverCount: 1,
      });
      validateQnscMcpConfigSpy.mockResolvedValue({
        valid: true,
        issues: [],
      });

      const result = await tool.execute({ configPath: '/custom/path/config.json' });

      expect(result).toContain('Custom Path');
      expect(result).toContain('/custom/path/config.json');
      expect(validateConfigFileSpy).toHaveBeenCalledWith('/custom/path/config.json', {
        verbose: false,
      });
      expect(findAllMcpConfigsSpy).not.toHaveBeenCalled();
    });

    it('should return human-readable format by default', async () => {
      findAllMcpConfigsSpy.mockReturnValue([
        { path: '/path/to/config.json', client: 'vscode', clientName: 'VS Code' },
      ]);
      validateConfigFileSpy.mockResolvedValue({
        valid: false,
        issues: [
          {
            severity: 'error' as const,
            code: 'MISSING_ENV_VAR',
            message: 'Missing environment variable: GRAFANA_K6_TOKEN',
            details: 'Set this in your shell profile',
            serverName: 'k6-server',
          },
        ],
        serverCount: 1,
      });
      validateQnscMcpConfigSpy.mockResolvedValue({
        valid: true,
        issues: [],
      });

      const result = await tool.execute({});

      expect(result).toContain('🩺 MCP Configuration Diagnostics');
      expect(result).toContain('❌ Errors');
      expect(result).toContain('GRAFANA_K6_TOKEN');
      expect(result).toContain('k6-server');
      expect(result).toContain('Set this in your shell profile');
      expect(result).not.toContain('{'); // Not JSON
    });

    it('should return JSON format when specified', async () => {
      findAllMcpConfigsSpy.mockReturnValue([
        { path: '/path/to/config.json', client: 'vscode', clientName: 'VS Code' },
      ]);
      validateConfigFileSpy.mockResolvedValue({
        valid: false,
        issues: [
          {
            severity: 'warning' as const,
            code: 'MISSING_ENV_VAR',
            message: 'Missing environment variable',
            serverName: 'test-server',
          },
        ],
        serverCount: 1,
      });
      validateQnscMcpConfigSpy.mockResolvedValue({
        valid: true,
        issues: [],
      });

      const result = await tool.execute({ format: 'json' });

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('valid');
      expect(parsed).toHaveProperty('configs');
      expect(parsed).toHaveProperty('qnscMcpConfig');
      expect(parsed).toHaveProperty('summary');
      expect(parsed.valid).toBe(false);
      expect(parsed.configs).toHaveLength(1);
      expect(parsed.summary.errorCount).toBe(0);
      expect(parsed.summary.warningCount).toBe(1);
    });

    it('should include verbose checks when verbose=true', async () => {
      findAllMcpConfigsSpy.mockReturnValue([
        { path: '/path/to/config.json', client: 'vscode', clientName: 'VS Code' },
      ]);
      validateConfigFileSpy.mockResolvedValue({
        valid: true,
        issues: [],
        serverCount: 1,
        checksPerformed: ['Check executables', 'Check env vars', 'Check file paths'],
      });
      validateQnscMcpConfigSpy.mockResolvedValue({
        valid: true,
        issues: [],
        checksPerformed: ['Check tool references', 'Check category references'],
      });

      const result = await tool.execute({ verbose: true });

      expect(result).toContain('Checks performed:');
      expect(result).toContain('✓ [VS Code] Check executables');
      expect(result).toContain('✓ [VS Code] Check env vars');
      expect(result).toContain('✓ [QNSC-MCP Config] Check tool references');
      expect(validateConfigFileSpy).toHaveBeenCalledWith(expect.any(String), { verbose: true });
    });

    it('should handle no configs found gracefully', async () => {
      findAllMcpConfigsSpy.mockReturnValue([]);

      const result = await tool.execute({});

      expect(result).toContain('No MCP configuration files found');
      expect(result).toContain('Standard locations checked');
      expect(result).toContain('To get started');
      expect(validateConfigFileSpy).not.toHaveBeenCalled();
    });

    it('should aggregate issues from multiple configs', async () => {
      findAllMcpConfigsSpy.mockReturnValue([
        { path: '/path/to/vscode.json', client: 'vscode', clientName: 'VS Code' },
        { path: '/path/to/claude.json', client: 'claude', clientName: 'Claude Desktop' },
      ]);
      validateConfigFileSpy.mockResolvedValueOnce({
        valid: false,
        issues: [
          {
            severity: 'error' as const,
            code: 'MISSING_ENV_VAR',
            message: 'Missing GRAFANA_K6_TOKEN',
            serverName: 'k6-server',
          },
        ],
        serverCount: 1,
      });
      validateConfigFileSpy.mockResolvedValueOnce({
        valid: false,
        issues: [
          {
            severity: 'warning' as const,
            code: 'EXECUTABLE_NOT_FOUND',
            message: 'Executable not found',
            serverName: 'slack-server',
          },
        ],
        serverCount: 1,
      });
      validateQnscMcpConfigSpy.mockResolvedValue({
        valid: true,
        issues: [],
      });

      const result = await tool.execute({});

      expect(result).toContain('❌ Errors (1)');
      expect(result).toContain('⚠️  Warnings (1)');
      expect(result).toContain('[VS Code]');
      expect(result).toContain('[Claude Desktop]');
      expect(result).toContain('GRAFANA_K6_TOKEN');
      expect(result).toContain('Executable not found');
    });

    it('should include QNSC-MCP config validation', async () => {
      findAllMcpConfigsSpy.mockReturnValue([
        { path: '/path/to/config.json', client: 'vscode', clientName: 'VS Code' },
      ]);
      validateConfigFileSpy.mockResolvedValue({
        valid: true,
        issues: [],
        serverCount: 1,
      });
      validateQnscMcpConfigSpy.mockResolvedValue({
        valid: false,
        issues: [
          {
            severity: 'warning' as const,
            code: 'INVALID_TOOL_REFERENCE',
            message: 'Unknown tool: invalid-tool-id',
          },
        ],
      });

      const result = await tool.execute({});

      expect(result).toContain('[QNSC-MCP Config]');
      expect(result).toContain('Unknown tool: invalid-tool-id');
      expect(validateQnscMcpConfigSpy).toHaveBeenCalled();
    });

    it('should format recommendations for common issues', async () => {
      findAllMcpConfigsSpy.mockReturnValue([
        { path: '/path/to/config.json', client: 'vscode', clientName: 'VS Code' },
      ]);
      validateConfigFileSpy.mockResolvedValue({
        valid: false,
        issues: [
          {
            severity: 'warning' as const,
            code: 'MISSING_ENV_VAR',
            message: 'Missing environment variable',
            serverName: 'test-server',
          },
        ],
        serverCount: 1,
      });
      validateQnscMcpConfigSpy.mockResolvedValue({
        valid: true,
        issues: [],
      });

      const result = await tool.execute({});

      expect(result).toContain('💡 Recommendation');
      expect(result).toContain('missing environment variables');
    });

    it('should handle validation errors gracefully', async () => {
      findAllMcpConfigsSpy.mockReturnValue([
        { path: '/path/to/config.json', client: 'vscode', clientName: 'VS Code' },
      ]);
      validateConfigFileSpy.mockRejectedValue(new Error('Failed to read config file'));
      validateQnscMcpConfigSpy.mockResolvedValue({
        valid: true,
        issues: [],
      });

      try {
        await tool.execute({});
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).toContain('Tool execution error');
        expect(message).toContain('Failed to read config file');
      }
    });

    it('should show summary statistics correctly', async () => {
      findAllMcpConfigsSpy.mockReturnValue([
        { path: '/path/to/config1.json', client: 'vscode', clientName: 'VS Code' },
        { path: '/path/to/config2.json', client: 'claude', clientName: 'Claude Desktop' },
      ]);
      validateConfigFileSpy.mockResolvedValueOnce({
        valid: false,
        issues: [
          {
            severity: 'error' as const,
            code: 'ERROR_CODE',
            message: 'Error message',
          },
        ],
        serverCount: 3,
      });
      validateConfigFileSpy.mockResolvedValueOnce({
        valid: false,
        issues: [
          {
            severity: 'warning' as const,
            code: 'WARNING_CODE',
            message: 'Warning message',
          },
          {
            severity: 'warning' as const,
            code: 'WARNING_CODE_2',
            message: 'Warning message 2',
          },
        ],
        serverCount: 2,
      });
      validateQnscMcpConfigSpy.mockResolvedValue({
        valid: true,
        issues: [],
      });

      const result = await tool.execute({});

      expect(result).toContain('Summary:');
      expect(result).toContain('2 config file(s) validated');
      expect(result).toContain('5 total server(s) configured');
      expect(result).toContain('1 error(s), 2 warning(s) found');
      expect(result).toContain('❌ Configuration has errors that should be fixed');
    });

    it('should show success message when all configs valid', async () => {
      findAllMcpConfigsSpy.mockReturnValue([
        { path: '/path/to/config.json', client: 'vscode', clientName: 'VS Code' },
      ]);
      validateConfigFileSpy.mockResolvedValue({
        valid: true,
        issues: [],
        serverCount: 2,
      });
      validateQnscMcpConfigSpy.mockResolvedValue({
        valid: true,
        issues: [],
      });

      const result = await tool.execute({});

      expect(result).toContain('✅ All 1 configuration file(s) are valid - no issues found');
    });

    it('should format issue messages with server names', async () => {
      findAllMcpConfigsSpy.mockReturnValue([
        { path: '/path/to/config.json', client: 'vscode', clientName: 'VS Code' },
      ]);
      validateConfigFileSpy.mockResolvedValue({
        valid: false,
        issues: [
          {
            severity: 'error' as const,
            code: 'ERROR_CODE',
            message: 'Test error',
            serverName: 'my-server',
          },
        ],
        serverCount: 1,
      });
      validateQnscMcpConfigSpy.mockResolvedValue({
        valid: true,
        issues: [],
      });

      const result = await tool.execute({});

      expect(result).toContain('Test error (server: my-server)');
    });

    it('should group issues by source', async () => {
      findAllMcpConfigsSpy.mockReturnValue([
        { path: '/path/to/vscode.json', client: 'vscode', clientName: 'VS Code' },
        { path: '/path/to/claude.json', client: 'claude', clientName: 'Claude Desktop' },
      ]);
      validateConfigFileSpy.mockResolvedValueOnce({
        valid: false,
        issues: [
          {
            severity: 'error' as const,
            code: 'ERROR_1',
            message: 'VS Code error',
          },
        ],
        serverCount: 1,
      });
      validateConfigFileSpy.mockResolvedValueOnce({
        valid: false,
        issues: [
          {
            severity: 'error' as const,
            code: 'ERROR_2',
            message: 'Claude error',
          },
        ],
        serverCount: 1,
      });
      validateQnscMcpConfigSpy.mockResolvedValue({
        valid: false,
        issues: [
          {
            severity: 'error' as const,
            code: 'ERROR_3',
            message: 'QNSC-MCP error',
          },
        ],
      });

      const result = await tool.execute({});

      // Check that issues are grouped by source
      const vsCodeIndex = result.indexOf('[VS Code]');
      const claudeIndex = result.indexOf('[Claude Desktop]');
      const qnscMcpIndex = result.indexOf('[QNSC-MCP Config]');

      expect(vsCodeIndex).toBeGreaterThan(-1);
      expect(claudeIndex).toBeGreaterThan(vsCodeIndex);
      expect(qnscMcpIndex).toBeGreaterThan(claudeIndex);

      // Check that each error appears after its source header
      expect(result.indexOf('VS Code error')).toBeGreaterThan(vsCodeIndex);
      expect(result.indexOf('Claude error')).toBeGreaterThan(claudeIndex);
      expect(result.indexOf('QNSC-MCP error')).toBeGreaterThan(qnscMcpIndex);
    });
  });
});
