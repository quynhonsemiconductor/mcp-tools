import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { doctor, DoctorExitCode } from './doctor';

/**
 * Tests for the doctor command.
 *
 * Note: ConfigValidator is imported dynamically inside each test using `await import()`.
 * This is required for proper mock isolation with Bun's test framework - static imports
 * would cache the module before mocks can be applied, causing spyOn to fail silently.
 * Each test needs a fresh import to ensure mocks are properly applied.
 */
describe('doctor', () => {
  let consoleLogSpy: any;

  beforeEach(() => {
    // Spy on console.log
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    mock.restore();
  });

  it('should return error exit code when no config file is found', async () => {
    // Dynamic import required for mock isolation (see describe block comment)
    const { ConfigValidator } = await import('../services/validation');
    const findAllMcpConfigsSpy = spyOn(ConfigValidator, 'findAllMcpConfigs').mockReturnValue([]);
    spyOn(ConfigValidator, 'validateQnscMcpConfig').mockResolvedValue({ valid: true, issues: [] });

    const exitCode = await doctor();

    expect(findAllMcpConfigsSpy).toHaveBeenCalled();
    expect(exitCode).toBe(DoctorExitCode.VALIDATION_ERROR);
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should output JSON format when no config files found with json option', async () => {
    const { ConfigValidator } = await import('../services/validation');
    spyOn(ConfigValidator, 'findAllMcpConfigs').mockReturnValue([]);

    const exitCode = await doctor(undefined, { json: true });

    expect(exitCode).toBe(DoctorExitCode.VALIDATION_ERROR);

    // Find the JSON output call
    const jsonCall = consoleLogSpy.mock.calls.find((call: any[]) => {
      try {
        const parsed = JSON.parse(call[0]);
        return parsed.valid !== undefined && parsed.issues !== undefined;
      } catch {
        return false;
      }
    });

    expect(jsonCall).toBeDefined();
    const output = JSON.parse(jsonCall[0]);
    expect(output.valid).toBe(false);
    expect(output.configs).toEqual([]);
    expect(output.issues).toHaveLength(1);
    expect(output.issues[0].code).toBe('FILE_NOT_FOUND');
    expect(output.issues[0].severity).toBe('error');
  });

  it('should validate all config files when found', async () => {
    const mockResult = {
      valid: true,
      issues: [],
      serverCount: 2,
    };

    const mockQnscMcpResult = {
      valid: true,
      issues: [],
    };

    const mockConfigs = [
      { path: '/test/vscode/mcp.json', client: 'vscode' as const, clientName: 'VS Code (Cline)' },
      {
        path: '/test/claude/config.json',
        client: 'claude-desktop' as const,
        clientName: 'Claude Desktop',
      },
    ];

    // Mock ConfigValidator methods
    const { ConfigValidator } = await import('../services/validation');
    const findAllMcpConfigsSpy = spyOn(ConfigValidator, 'findAllMcpConfigs').mockReturnValue(
      mockConfigs,
    );
    const validateConfigFileSpy = spyOn(ConfigValidator, 'validateConfigFile').mockResolvedValue(
      mockResult,
    );
    const validateQnscMcpConfigSpy = spyOn(
      ConfigValidator,
      'validateQnscMcpConfig',
    ).mockResolvedValue(mockQnscMcpResult);

    const exitCode = await doctor();

    expect(findAllMcpConfigsSpy).toHaveBeenCalled();
    // Should validate both config files
    expect(validateConfigFileSpy).toHaveBeenCalledTimes(2);
    expect(validateConfigFileSpy).toHaveBeenCalledWith('/test/vscode/mcp.json', { verbose: false });
    expect(validateConfigFileSpy).toHaveBeenCalledWith('/test/claude/config.json', {
      verbose: false,
    });
    expect(validateQnscMcpConfigSpy).toHaveBeenCalledWith({ verbose: false });
    expect(exitCode).toBe(DoctorExitCode.SUCCESS);
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should use provided config path when specified', async () => {
    const mockResult = {
      valid: true,
      issues: [],
    };

    const mockQnscMcpResult = {
      valid: true,
      issues: [],
    };

    // Mock ConfigValidator methods
    const { ConfigValidator } = await import('../services/validation');
    const findAllMcpConfigsSpy = spyOn(ConfigValidator, 'findAllMcpConfigs');
    const validateConfigFileSpy = spyOn(ConfigValidator, 'validateConfigFile').mockResolvedValue(
      mockResult,
    );
    spyOn(ConfigValidator, 'validateQnscMcpConfig').mockResolvedValue(mockQnscMcpResult);

    const exitCode = await doctor('/custom/path/mcp.json');

    // Should NOT call findAllMcpConfigs when path is provided
    expect(findAllMcpConfigsSpy).not.toHaveBeenCalled();
    expect(validateConfigFileSpy).toHaveBeenCalledWith('/custom/path/mcp.json', { verbose: false });
    expect(exitCode).toBe(DoctorExitCode.SUCCESS);
  });

  it('should return error exit code when validation fails', async () => {
    const mockResult = {
      valid: false,
      issues: [
        {
          severity: 'error' as const,
          code: 'INVALID_JSON',
          message: 'Invalid JSON syntax',
          details: 'Unexpected token',
        },
      ],
    };

    const mockQnscMcpResult = {
      valid: true,
      issues: [],
    };

    const mockConfigs = [
      { path: '/test/mcp.json', client: 'vscode' as const, clientName: 'VS Code (Cline)' },
    ];

    const { ConfigValidator } = await import('../services/validation');
    spyOn(ConfigValidator, 'findAllMcpConfigs').mockReturnValue(mockConfigs);
    spyOn(ConfigValidator, 'validateConfigFile').mockResolvedValue(mockResult);
    spyOn(ConfigValidator, 'validateQnscMcpConfig').mockResolvedValue(mockQnscMcpResult);

    const exitCode = await doctor();

    expect(exitCode).toBe(DoctorExitCode.VALIDATION_ERROR);
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should return success for warnings only', async () => {
    const mockResult = {
      valid: true,
      issues: [
        {
          severity: 'warning' as const,
          code: 'DUPLICATE_EXECUTABLE',
          message: 'Duplicate executable found',
          details: 'Servers "server1", "server2" all use the same executable',
        },
      ],
    };

    const mockQnscMcpResult = {
      valid: true,
      issues: [],
    };

    const mockConfigs = [
      { path: '/test/mcp.json', client: 'vscode' as const, clientName: 'VS Code (Cline)' },
    ];

    const { ConfigValidator } = await import('../services/validation');
    spyOn(ConfigValidator, 'findAllMcpConfigs').mockReturnValue(mockConfigs);
    spyOn(ConfigValidator, 'validateConfigFile').mockResolvedValue(mockResult);
    spyOn(ConfigValidator, 'validateQnscMcpConfig').mockResolvedValue(mockQnscMcpResult);

    const exitCode = await doctor();

    // Should return success for warnings only
    expect(exitCode).toBe(DoctorExitCode.SUCCESS);
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should pass verbose flag to validators', async () => {
    const mockResult = {
      valid: true,
      issues: [],
      checksPerformed: ['File existence check', 'JSON syntax validation'],
    };

    const mockQnscMcpResult = {
      valid: true,
      issues: [],
      checksPerformed: ['YAML syntax validation'],
    };

    const mockConfigs = [
      { path: '/test/mcp.json', client: 'vscode' as const, clientName: 'VS Code (Cline)' },
    ];

    const { ConfigValidator } = await import('../services/validation');
    spyOn(ConfigValidator, 'findAllMcpConfigs').mockReturnValue(mockConfigs);
    const validateConfigFileSpy = spyOn(ConfigValidator, 'validateConfigFile').mockResolvedValue(
      mockResult,
    );
    const validateQnscMcpConfigSpy = spyOn(
      ConfigValidator,
      'validateQnscMcpConfig',
    ).mockResolvedValue(mockQnscMcpResult);

    await doctor(undefined, { verbose: true });

    expect(validateConfigFileSpy).toHaveBeenCalledWith('/test/mcp.json', { verbose: true });
    expect(validateQnscMcpConfigSpy).toHaveBeenCalledWith({ verbose: true });
  });

  it('should output JSON format when json option is set', async () => {
    const mockResult = {
      valid: true,
      issues: [],
      serverCount: 1,
    };

    const mockQnscMcpResult = {
      valid: true,
      issues: [],
    };

    const mockConfigs = [
      { path: '/test/mcp.json', client: 'vscode' as const, clientName: 'VS Code (Cline)' },
    ];

    const { ConfigValidator } = await import('../services/validation');
    spyOn(ConfigValidator, 'findAllMcpConfigs').mockReturnValue(mockConfigs);
    spyOn(ConfigValidator, 'validateConfigFile').mockResolvedValue(mockResult);
    spyOn(ConfigValidator, 'validateQnscMcpConfig').mockResolvedValue(mockQnscMcpResult);

    const exitCode = await doctor(undefined, { json: true });

    expect(exitCode).toBe(DoctorExitCode.SUCCESS);

    // Find the JSON output call
    const jsonCall = consoleLogSpy.mock.calls.find((call: any[]) => {
      try {
        const parsed = JSON.parse(call[0]);
        return parsed.valid !== undefined && parsed.configs !== undefined;
      } catch {
        return false;
      }
    });

    expect(jsonCall).toBeDefined();
    const output = JSON.parse(jsonCall[0]);
    expect(output.valid).toBe(true);
    expect(output.configs).toHaveLength(1);
    expect(output.configs[0].path).toBe('/test/mcp.json');
    expect(output.qnscMcpConfig).toBeDefined();
    expect(output.summary).toBeDefined();
  });

  it('should aggregate issues from multiple configs', async () => {
    const mockResult1 = {
      valid: false,
      issues: [
        {
          severity: 'error' as const,
          code: 'INVALID_JSON',
          message: 'Invalid JSON in VS Code config',
        },
      ],
    };

    const mockResult2 = {
      valid: true,
      issues: [
        {
          severity: 'warning' as const,
          code: 'DUPLICATE_EXECUTABLE',
          message: 'Duplicate in Claude config',
        },
      ],
    };

    const mockQnscMcpResult = {
      valid: true,
      issues: [],
    };

    const mockConfigs = [
      { path: '/test/vscode/mcp.json', client: 'vscode' as const, clientName: 'VS Code (Cline)' },
      {
        path: '/test/claude/config.json',
        client: 'claude-desktop' as const,
        clientName: 'Claude Desktop',
      },
    ];

    const { ConfigValidator } = await import('../services/validation');
    spyOn(ConfigValidator, 'findAllMcpConfigs').mockReturnValue(mockConfigs);
    const validateConfigFileSpy = spyOn(ConfigValidator, 'validateConfigFile');
    validateConfigFileSpy.mockResolvedValueOnce(mockResult1);
    validateConfigFileSpy.mockResolvedValueOnce(mockResult2);
    spyOn(ConfigValidator, 'validateQnscMcpConfig').mockResolvedValue(mockQnscMcpResult);

    const exitCode = await doctor();

    // Should return error because one config has errors
    expect(exitCode).toBe(DoctorExitCode.VALIDATION_ERROR);
  });

  it('should return success in quiet mode with no errors', async () => {
    const mockResult = {
      valid: true,
      issues: [],
      serverCount: 1,
    };

    const mockQnscMcpResult = {
      valid: true,
      issues: [],
    };

    const mockConfigs = [
      { path: '/test/vscode/mcp.json', client: 'vscode' as const, clientName: 'VS Code (Cline)' },
    ];

    const { ConfigValidator } = await import('../services/validation');
    spyOn(ConfigValidator, 'findAllMcpConfigs').mockReturnValue(mockConfigs);
    spyOn(ConfigValidator, 'validateConfigFile').mockResolvedValue(mockResult);
    spyOn(ConfigValidator, 'validateQnscMcpConfig').mockResolvedValue(mockQnscMcpResult);

    const exitCode = await doctor(undefined, { quiet: true });

    // Should return success since there are no errors
    expect(exitCode).toBe(DoctorExitCode.SUCCESS);
    // Should have minimal console output in quiet mode
    const logCallCount = consoleLogSpy.mock.calls.length;
    expect(logCallCount).toBeLessThan(5); // Minimal output
  });

  it('should return error in quiet mode when errors exist', async () => {
    const mockResult = {
      valid: false,
      issues: [
        { severity: 'error' as const, code: 'INVALID_JSON', message: 'Invalid JSON syntax' },
      ],
      serverCount: 0,
    };

    const mockQnscMcpResult = {
      valid: true,
      issues: [],
    };

    const mockConfigs = [
      { path: '/test/vscode/mcp.json', client: 'vscode' as const, clientName: 'VS Code (Cline)' },
    ];

    const { ConfigValidator } = await import('../services/validation');
    spyOn(ConfigValidator, 'findAllMcpConfigs').mockReturnValue(mockConfigs);
    spyOn(ConfigValidator, 'validateConfigFile').mockResolvedValue(mockResult);
    spyOn(ConfigValidator, 'validateQnscMcpConfig').mockResolvedValue(mockQnscMcpResult);

    const exitCode = await doctor(undefined, { quiet: true });

    // Should return error code
    expect(exitCode).toBe(DoctorExitCode.VALIDATION_ERROR);
    // Should have logged the error message
    const loggedMessages = consoleLogSpy.mock.calls.map((c: any[]) => c.join(' ')).join(' ');
    expect(loggedMessages).toContain('Error');
  });

  it('should not show warnings in quiet mode', async () => {
    const mockResult = {
      valid: true,
      issues: [
        {
          severity: 'warning' as const,
          code: 'DUPLICATE_EXECUTABLE',
          message: 'Duplicate executable found',
        },
      ],
      serverCount: 1,
    };

    const mockQnscMcpResult = {
      valid: true,
      issues: [],
    };

    const mockConfigs = [
      { path: '/test/vscode/mcp.json', client: 'vscode' as const, clientName: 'VS Code (Cline)' },
    ];

    const { ConfigValidator } = await import('../services/validation');
    spyOn(ConfigValidator, 'findAllMcpConfigs').mockReturnValue(mockConfigs);
    spyOn(ConfigValidator, 'validateConfigFile').mockResolvedValue(mockResult);
    spyOn(ConfigValidator, 'validateQnscMcpConfig').mockResolvedValue(mockQnscMcpResult);

    const exitCode = await doctor(undefined, { quiet: true });

    // Should return success since there are only warnings, no errors
    expect(exitCode).toBe(DoctorExitCode.SUCCESS);
    // Should not have logged warning messages
    const loggedMessages = consoleLogSpy.mock.calls.map((c: any[]) => c.join(' ')).join(' ');
    expect(loggedMessages).not.toContain('Warning');
    expect(loggedMessages).not.toContain('Duplicate');
  });

  it('should handle check execution failures gracefully', async () => {
    // When a validation check throws an error, it should be caught and reported
    // as a CHECK_FAILED issue rather than crashing
    const mockResult = {
      valid: false,
      issues: [
        {
          severity: 'error' as const,
          code: 'CHECK_FAILED',
          message: 'Check "Test check" failed to execute',
          details: 'Simulated check error',
        },
      ],
      serverCount: 1,
    };

    const mockQnscMcpResult = {
      valid: true,
      issues: [],
    };

    const mockConfigs = [
      { path: '/test/mcp.json', client: 'vscode' as const, clientName: 'VS Code (Cline)' },
    ];

    const { ConfigValidator } = await import('../services/validation');
    spyOn(ConfigValidator, 'findAllMcpConfigs').mockReturnValue(mockConfigs);
    spyOn(ConfigValidator, 'validateConfigFile').mockResolvedValue(mockResult);
    spyOn(ConfigValidator, 'validateQnscMcpConfig').mockResolvedValue(mockQnscMcpResult);

    const exitCode = await doctor();

    // Should return error code since CHECK_FAILED is an error
    expect(exitCode).toBe(DoctorExitCode.VALIDATION_ERROR);
    // Should have logged the error
    const loggedMessages = consoleLogSpy.mock.calls.map((c: any[]) => c.join(' ')).join(' ');
    expect(loggedMessages).toContain('Error');
  });

  it('should output complete JSON structure with all optional fields', async () => {
    // Test that JSON output includes all optional fields when present
    const mockResult = {
      valid: false,
      issues: [
        {
          severity: 'error' as const,
          code: 'HARDCODED_SECRET',
          message: 'Potential hardcoded secret in "API_KEY"',
          details: 'Consider using environment variable references',
          serverName: 'my-server',
        },
        {
          severity: 'warning' as const,
          code: 'DUPLICATE_EXECUTABLE',
          message: 'Duplicate executable found',
          details: 'Used by servers: server1, server2',
          // Note: serverName intentionally omitted (duplicates span multiple servers)
        },
      ],
      serverCount: 3,
      checksPerformed: ['File existence check', 'JSON syntax validation', 'Schema validation'],
    };

    const mockQnscMcpResult = {
      valid: true,
      issues: [
        {
          severity: 'info' as const,
          code: 'VALIDATION_SKIPPED',
          message: 'Some validation was skipped',
        },
      ],
      checksPerformed: ['Configuration loading', 'Tool reference validation'],
    };

    const mockConfigs = [
      { path: '/test/mcp.json', client: 'vscode' as const, clientName: 'VS Code (Cline)' },
    ];

    const { ConfigValidator } = await import('../services/validation');
    spyOn(ConfigValidator, 'findAllMcpConfigs').mockReturnValue(mockConfigs);
    spyOn(ConfigValidator, 'validateConfigFile').mockResolvedValue(mockResult);
    spyOn(ConfigValidator, 'validateQnscMcpConfig').mockResolvedValue(mockQnscMcpResult);

    const exitCode = await doctor(undefined, { json: true, verbose: true });

    expect(exitCode).toBe(DoctorExitCode.VALIDATION_ERROR);

    // Find the JSON output call
    const jsonCall = consoleLogSpy.mock.calls.find((call: any[]) => {
      try {
        const parsed = JSON.parse(call[0]);
        return parsed.valid !== undefined && parsed.configs !== undefined;
      } catch {
        return false;
      }
    });

    expect(jsonCall).toBeDefined();
    const output = JSON.parse(jsonCall[0]);

    // Verify top-level structure
    expect(output.valid).toBe(false);
    expect(output.configs).toHaveLength(1);
    expect(output.qnscMcpConfig).toBeDefined();
    expect(output.summary).toBeDefined();
    expect(output.checksPerformed).toBeDefined(); // verbose mode includes this

    // Verify config details
    const configOutput = output.configs[0];
    expect(configOutput.path).toBe('/test/mcp.json');
    expect(configOutput.client).toBe('vscode');
    expect(configOutput.clientName).toBe('VS Code (Cline)');
    expect(configOutput.valid).toBe(false);
    expect(configOutput.serverCount).toBe(3);
    expect(configOutput.issues).toHaveLength(2);

    // Verify issue with serverName
    const errorIssue = configOutput.issues.find((i: any) => i.severity === 'error');
    expect(errorIssue.code).toBe('HARDCODED_SECRET');
    expect(errorIssue.message).toContain('API_KEY');
    expect(errorIssue.details).toBeDefined();
    expect(errorIssue.serverName).toBe('my-server');

    // Verify issue without serverName
    const warningIssue = configOutput.issues.find((i: any) => i.severity === 'warning');
    expect(warningIssue.code).toBe('DUPLICATE_EXECUTABLE');
    expect(warningIssue.serverName).toBeUndefined();

    // Verify QNSC-MCP config
    expect(output.qnscMcpConfig.valid).toBe(true);
    expect(output.qnscMcpConfig.issues).toHaveLength(1);

    // Verify summary
    expect(output.summary.totalConfigs).toBe(1);
    expect(output.summary.totalServerCount).toBe(3);
    expect(output.summary.errorCount).toBe(1);
    expect(output.summary.warningCount).toBe(1);

    // Verify checksPerformed (verbose mode)
    expect(output.checksPerformed).toBeInstanceOf(Array);
    expect(output.checksPerformed.length).toBeGreaterThan(0);
  });

  it('should include QNSC-MCP config paths in search locations when no configs found', async () => {
    const { ConfigValidator } = await import('../services/validation');
    spyOn(ConfigValidator, 'findAllMcpConfigs').mockReturnValue([]);
    // Mock getPlatformSpecificPaths to include our new paths
    spyOn(ConfigValidator, 'getPlatformSpecificPaths').mockReturnValue([
      { path: '/mock-home/.qnscmcp/config.yaml', description: 'QNSC-MCP Config' },
      { path: '/mock-home/.qnscmcp/config.yml', description: 'QNSC-MCP Config' },
      { path: '/mock-home/.mcp.json', description: 'Home directory' },
      { path: './mcp.json', description: 'Current directory' },
    ]);

    const exitCode = await doctor();

    expect(exitCode).toBe(DoctorExitCode.VALIDATION_ERROR);

    // Check that QNSC-MCP paths are mentioned in the output
    const allLogs = consoleLogSpy.mock.calls.map((call: any[]) => call.join(' ')).join(' ');
    expect(allLogs).toContain('QNSC-MCP Config');
    expect(allLogs).toContain('.qnscmcp/config.yaml');
  });

  describe('cross-config enabled functionality check', () => {
    it('should NOT warn when MCP JSON configs have servers', async () => {
      const mockResult = {
        valid: true,
        issues: [],
        serverCount: 2,
      };

      const mockQnscMcpResult = {
        valid: true,
        issues: [],
      };

      const mockConfigs = [
        { path: '/test/mcp.json', client: 'vscode' as const, clientName: 'VS Code (Cline)' },
      ];

      const { ConfigValidator } = await import('../services/validation');
      spyOn(ConfigValidator, 'findAllMcpConfigs').mockReturnValue(mockConfigs);
      spyOn(ConfigValidator, 'validateConfigFile').mockResolvedValue(mockResult);
      spyOn(ConfigValidator, 'validateQnscMcpConfig').mockResolvedValue(mockQnscMcpResult);

      const exitCode = await doctor();

      expect(exitCode).toBe(DoctorExitCode.SUCCESS);
      const loggedMessages = consoleLogSpy.mock.calls.map((c: any[]) => c.join(' ')).join(' ');
      expect(loggedMessages).not.toContain('No MCP servers or tools configured');
    });

    it('should warn when no servers in JSON configs and no tools in QNSC-MCP config', async () => {
      const mockResult = {
        valid: true,
        issues: [],
        serverCount: 0,
      };

      const mockQnscMcpResult = {
        valid: true,
        issues: [],
      };

      const mockConfigs = [
        { path: '/test/mcp.json', client: 'vscode' as const, clientName: 'VS Code (Cline)' },
      ];

      const { ConfigValidator } = await import('../services/validation');
      spyOn(ConfigValidator, 'findAllMcpConfigs').mockReturnValue(mockConfigs);
      spyOn(ConfigValidator, 'validateConfigFile').mockResolvedValue(mockResult);
      spyOn(ConfigValidator, 'validateQnscMcpConfig').mockResolvedValue(mockQnscMcpResult);

      // Mock loadConfig to return empty config (overrides the default mock from mocks.ts)
      const configModule = await import('../config');
      spyOn(configModule, 'loadConfig').mockReturnValue({
        tools: {
          includeMCPs: [],
          include: [],
          exclude: [],
          includeCategories: [],
          excludeCategories: [],
          includeRemoteMCPs: [],
          includeLocalMCPs: [],
        },
        logging: { enabled: false, level: 'info' as const, maxSize: 10, maxFiles: 5 },
        knowledgeGraph: { filePath: '' },
        prompts: { repositories: [] },
        source: '',
      });

      const exitCode = await doctor();

      // Should still be success (it's a warning, not an error)
      expect(exitCode).toBe(DoctorExitCode.SUCCESS);
      const loggedMessages = consoleLogSpy.mock.calls.map((c: any[]) => c.join(' ')).join(' ');
      expect(loggedMessages).toContain('No MCP servers or tools configured');
    });
  });
});
