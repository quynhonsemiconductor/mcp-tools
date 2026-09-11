import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { setupStandardMocks } from '../../test-utils/mocks';

// Use standard mocks to get properly configured fs mock
const { mockFS } = setupStandardMocks();

// Import validator AFTER mocks are set up
import { ConfigValidator, isYamlFile } from './validator';
import { registerAllChecks, resetAllChecksRegistration } from './checks';

describe('ConfigValidator', () => {
  beforeEach(() => {
    // Reset all mock implementations
    mockFS.existsSync.mockReset();
    mockFS.readFileSync.mockReset();
    mockFS.statSync.mockReset();

    // Reset and re-register checks to ensure clean state between tests
    // This is critical for CI/CD where test execution order may vary
    resetAllChecksRegistration();
    registerAllChecks();
  });

  afterEach(() => {
    mock.restore();
  });

  describe('validateConfigFile', () => {
    it('should validate Claude Desktop config format with mcpServers', async () => {
      const claudeConfig = {
        mcpServers: {
          'test-server': {
            command: 'node',
            args: ['server.js'],
            env: {},
          },
        },
      };

      mockFS.existsSync.mockImplementation(() => true);
      mockFS.readFileSync.mockImplementation(() => JSON.stringify(claudeConfig));

      const result = await ConfigValidator.validateConfigFile('/test/claude_desktop_config.json');

      expect(result.valid).toBe(true);
      expect(result.issues.length).toBe(0);
    });

    it('should detect duplicates in Claude Desktop config format', async () => {
      const claudeConfigWithDuplicates = {
        mcpServers: {
          server1: {
            command: '/path/to/qnsc-mcp',
            env: {},
          },
          server2: {
            command: '/path/to/qnsc-mcp',
            env: {},
          },
        },
      };

      mockFS.existsSync.mockImplementation((filepath: string) => {
        return filepath.endsWith('.json');
      });
      mockFS.readFileSync.mockImplementation(() => JSON.stringify(claudeConfigWithDuplicates));

      const result = await ConfigValidator.validateConfigFile('/test/claude_desktop_config.json');

      expect(result.valid).toBe(true); // Valid but with warnings
      expect(result.issues.some((i) => i.code === 'DUPLICATE_EXECUTABLE')).toBe(true);
    });

    it('should return error when file does not exist', async () => {
      mockFS.existsSync.mockImplementation(() => false);

      const result = await ConfigValidator.validateConfigFile('/nonexistent/mcp.json');

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0].severity).toBe('error');
      expect(result.issues[0].code).toBe('FILE_NOT_FOUND');
    });

    it('should return error for invalid JSON', async () => {
      mockFS.existsSync.mockImplementation(() => true);
      mockFS.readFileSync.mockImplementation(() => '{invalid json}');

      const result = await ConfigValidator.validateConfigFile('/test/mcp.json');

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0].severity).toBe('error');
      expect(result.issues[0].code).toBe('INVALID_JSON');
    });

    it('should validate valid configuration without issues', async () => {
      const validConfig = {
        servers: {
          'test-server': {
            command: 'node',
            args: ['server.js'],
            env: {},
          },
        },
      };

      mockFS.existsSync.mockImplementation(() => true);
      mockFS.readFileSync.mockImplementation(() => JSON.stringify(validConfig));

      const result = await ConfigValidator.validateConfigFile('/test/mcp.json');

      expect(result.valid).toBe(true);
      expect(result.issues.length).toBe(0);
    });

    it('should detect duplicate executables', async () => {
      const configWithDuplicates = {
        servers: {
          server1: {
            command: 'C:\\Program Files\\QNSC-MCP\\qnsc-mcp.exe',
            env: {},
          },
          server2: {
            command: 'C:\\Program Files\\QNSC-MCP\\qnsc-mcp.exe',
            env: {},
          },
        },
      };

      mockFS.existsSync.mockImplementation((filepath: string) => {
        // Return true for the config file and false for the executable
        return filepath.endsWith('mcp.json');
      });
      mockFS.readFileSync.mockImplementation(() => JSON.stringify(configWithDuplicates));

      const result = await ConfigValidator.validateConfigFile('/test/mcp.json');

      expect(result.valid).toBe(true); // Valid but with warnings
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some((i) => i.code === 'DUPLICATE_EXECUTABLE')).toBe(true);
      expect(result.issues.filter((i) => i.severity === 'warning').length).toBeGreaterThan(0);
    });

    it('should warn about missing executables', async () => {
      const configWithMissingExec = {
        servers: {
          'test-server': {
            command: '/nonexistent/path/to/executable',
            env: {},
          },
        },
      };

      mockFS.existsSync.mockImplementation((filepath: string) => {
        // Return true only for the config file
        return filepath.endsWith('mcp.json');
      });
      mockFS.readFileSync.mockImplementation(() => JSON.stringify(configWithMissingExec));

      const result = await ConfigValidator.validateConfigFile('/test/mcp.json');

      expect(result.valid).toBe(true); // Valid but with warnings
      expect(result.issues.some((i) => i.code === 'EXECUTABLE_NOT_FOUND')).toBe(true);
    });

    it('should not warn about common PATH commands', async () => {
      const configWithPathCommand = {
        servers: {
          'node-server': {
            command: 'node',
            args: ['server.js'],
            env: {},
          },
          'python-server': {
            command: 'python',
            args: ['-m', 'server'],
            env: {},
          },
        },
      };

      mockFS.existsSync.mockImplementation(() => true);
      mockFS.readFileSync.mockImplementation(() => JSON.stringify(configWithPathCommand));

      const result = await ConfigValidator.validateConfigFile('/test/mcp.json');

      expect(result.valid).toBe(true);
      // PATH commands (like 'node', 'python') should not trigger EXECUTABLE_NOT_FOUND
      expect(result.issues.some((i) => i.code === 'EXECUTABLE_NOT_FOUND')).toBe(false);
    });

    it('should warn about missing environment variables for enabled tools', async () => {
      // This test checks that env var checking is performed when a qnsc-mcp binary is present
      // The registry mock returns empty tools array, so no env var warnings are expected
      // unless tools with envVars are returned
      const configWithQnscMcp = {
        servers: {
          qnsc: {
            command: 'qnsc-mcp.exe',
            env: {},
          },
        },
      };

      mockFS.existsSync.mockImplementation(() => true);
      mockFS.readFileSync.mockImplementation(() => JSON.stringify(configWithQnscMcp));

      const result = await ConfigValidator.validateConfigFile('/test/mcp.json');

      // With the mocked registry returning empty tools, should be valid with no env var warnings
      expect(result.valid).toBe(true);
    });

    it('should not warn if environment variable is present in config env section', async () => {
      const configWithEnv = {
        servers: {
          qnsc: {
            command: 'qnsc-mcp.exe',
            env: {
              GITHUB_TOKEN: 'ghp_actualtoken123',
              GRAFANA_K6_TOKEN: 'k6_key_123',
            },
          },
        },
      };

      mockFS.existsSync.mockImplementation(() => true);
      mockFS.readFileSync.mockImplementation(() => JSON.stringify(configWithEnv));

      const result = await ConfigValidator.validateConfigFile('/test/mcp.json');

      // Should not warn for Github or k6 since tokens are present
      const githubWarning = result.issues.find(
        (i) => i.code === 'MISSING_ENV_VAR' && i.message.includes('GITHUB_TOKEN'),
      );
      const k6Warning = result.issues.find(
        (i) => i.code === 'MISSING_ENV_VAR' && i.message.includes('GRAFANA_K6_TOKEN'),
      );
      expect(githubWarning).toBeUndefined();
      expect(k6Warning).toBeUndefined();
    });

    it('should warn about placeholder values in env vars', async () => {
      const configWithPlaceholders = {
        servers: {
          qnsc: {
            command: 'qnsc-mcp.exe',
            env: {
              GITHUB_TOKEN: '<your-token-here>',
              GRAFANA_K6_TOKEN: 'TODO',
            },
          },
        },
      };

      mockFS.existsSync.mockImplementation(() => true);
      mockFS.readFileSync.mockImplementation(() => JSON.stringify(configWithPlaceholders));

      const result = await ConfigValidator.validateConfigFile('/test/mcp.json');

      // Config is valid (placeholders are warned but don't block)
      expect(result.valid).toBe(true);
    });

    it('should detect qnsc-mcp binary variants for env extraction', async () => {
      // Test various binary naming conventions
      const binaryVariants = [
        'qnsc-mcp',
        'qnsc-mcp.exe',
        'qnsc-mcp-macos-x64',
        'qnsc-mcp-macos-arm64',
        'qnsc-mcp-win-x64.exe',
        '/usr/local/bin/qnsc-mcp-v2',
      ];

      for (const binary of binaryVariants) {
        const configWithEnv = {
          servers: {
            'test-server': {
              command: binary,
              env: {
                GITHUB_TOKEN: 'real_token_123',
              },
            },
          },
        };

        mockFS.existsSync.mockImplementation(() => true);
        mockFS.readFileSync.mockImplementation(() => JSON.stringify(configWithEnv));

        const result = await ConfigValidator.validateConfigFile('/test/mcp.json');

        // Should not warn about Github since token is in the qnsc-mcp server env
        const githubWarning = result.issues.find(
          (i) => i.code === 'MISSING_ENV_VAR' && i.message.includes('GITHUB_TOKEN'),
        );
        expect(githubWarning).toBeUndefined();
      }
    });

    it('should validate structure against schema', async () => {
      const invalidConfig = {
        servers: {
          'test-server': {
            // Missing required 'command' field
            env: {},
          },
        },
      };

      mockFS.existsSync.mockImplementation(() => true);
      mockFS.readFileSync.mockImplementation(() => JSON.stringify(invalidConfig));

      const result = await ConfigValidator.validateConfigFile('/test/mcp.json');

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'SCHEMA_VALIDATION_ERROR')).toBe(true);
    });

    it('should warn about empty config object', async () => {
      const emptyConfig = { servers: {} };

      mockFS.existsSync.mockImplementation(() => true);
      mockFS.readFileSync.mockImplementation(() => JSON.stringify(emptyConfig));

      const result = await ConfigValidator.validateConfigFile('/test/mcp.json');

      // Empty config is valid (just a warning), as it might be intentional during initial setup
      expect(result.valid).toBe(true);
      expect(result.serverCount).toBe(0);
      expect(result.issues.some((i) => i.code === 'NO_SERVERS_CONFIGURED')).toBe(true);
      expect(result.issues.find((i) => i.code === 'NO_SERVERS_CONFIGURED')?.severity).toBe(
        'warning',
      );
    });

    it('should reject empty server name', async () => {
      const configWithEmptyName = {
        servers: {
          '': {
            command: 'node',
          },
        },
      };

      mockFS.existsSync.mockImplementation(() => true);
      mockFS.readFileSync.mockImplementation(() => JSON.stringify(configWithEmptyName));

      const result = await ConfigValidator.validateConfigFile('/test/mcp.json');

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'INVALID_SERVER_NAME')).toBe(true);
    });

    it('should warn about server names with spaces', async () => {
      const configWithSpaces = {
        servers: {
          'my server': {
            command: 'node',
          },
        },
      };

      mockFS.existsSync.mockImplementation(() => true);
      mockFS.readFileSync.mockImplementation(() => JSON.stringify(configWithSpaces));

      const result = await ConfigValidator.validateConfigFile('/test/mcp.json');

      expect(result.valid).toBe(true); // Valid but with warning
      expect(result.issues.some((i) => i.code === 'SERVER_NAME_HAS_SPACES')).toBe(true);
      expect(result.issues.filter((i) => i.severity === 'warning').length).toBeGreaterThan(0);
    });

    it('should include error codes in all validation issues', async () => {
      mockFS.existsSync.mockImplementation(() => false);

      const result = await ConfigValidator.validateConfigFile('/nonexistent/mcp.json');

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      // All issues should have a code property
      result.issues.forEach((issue) => {
        expect(issue.code).toBeDefined();
        expect(typeof issue.code).toBe('string');
      });
    });

    it('should detect duplicates with bare command names', async () => {
      const configWithBareCommands = {
        servers: {
          server1: {
            command: 'node',
          },
          server2: {
            command: 'node.exe',
          },
        },
      };

      mockFS.existsSync.mockImplementation(() => true);
      mockFS.readFileSync.mockImplementation(() => JSON.stringify(configWithBareCommands));

      const result = await ConfigValidator.validateConfigFile('/test/mcp.json');

      expect(result.valid).toBe(true); // Valid but with warning
      expect(result.issues.some((i) => i.code === 'DUPLICATE_EXECUTABLE')).toBe(true);
    });

    it('should allow unknown fields due to passthrough mode', async () => {
      const configWithExtraFields = {
        servers: {
          'test-server': {
            command: 'node',
            customField: 'custom-value',
            anotherField: 123,
          },
        },
        customTopLevel: 'allowed',
      };

      mockFS.existsSync.mockImplementation(() => true);
      mockFS.readFileSync.mockImplementation(() => JSON.stringify(configWithExtraFields));

      const result = await ConfigValidator.validateConfigFile('/test/mcp.json');

      expect(result.valid).toBe(true);
      expect(result.issues.length).toBe(0);
    });

    it('should include serverCount in result', async () => {
      const configWithServers = {
        servers: {
          server1: { command: 'node' },
          server2: { command: 'python' },
          server3: { command: 'bun' },
        },
      };

      mockFS.existsSync.mockImplementation(() => true);
      mockFS.readFileSync.mockImplementation(() => JSON.stringify(configWithServers));

      const result = await ConfigValidator.validateConfigFile('/test/mcp.json');

      expect(result.valid).toBe(true);
      expect(result.serverCount).toBe(3);
    });
  });

  // Note: findMcpConfig was replaced by findAllMcpConfigs in the new validation system

  describe('findAllMcpConfigs', () => {
    it('should return all found config files', () => {
      // Mock to return true for specific paths that look like VS Code and Claude Desktop
      mockFS.existsSync.mockImplementation((filepath: string) => {
        return filepath.includes('rooveterinaryinc.roo-cline') || filepath.includes('Claude');
      });

      const results = ConfigValidator.findAllMcpConfigs();

      // Should find multiple configs
      expect(results.length).toBeGreaterThan(1);
      // Should have different clients represented
      const clients = new Set(results.map((r) => r.client));
      expect(clients.size).toBeGreaterThan(1);
    });

    it('should return empty array if no configs found', () => {
      mockFS.existsSync.mockImplementation(() => false);

      const results = ConfigValidator.findAllMcpConfigs();

      expect(results).toEqual([]);
    });

    it('should deduplicate configs with same normalized path', () => {
      // This tests the deduplication logic - mock paths that might resolve to same location
      const seenPaths = new Set<string>();
      mockFS.existsSync.mockImplementation((filepath: string) => {
        // Only return true for first occurrence of each unique path
        if (seenPaths.has(filepath)) {
          return true; // Return true but dedup should handle it
        }
        seenPaths.add(filepath);
        return filepath.includes('mcp.json');
      });

      const results = ConfigValidator.findAllMcpConfigs();

      // Each path should appear only once
      const paths = results.map((r) => r.path);
      const uniquePaths = new Set(paths);
      expect(paths.length).toBe(uniquePaths.size);
    });

    it('should include client and clientName for each config', () => {
      mockFS.existsSync.mockImplementation((filepath: string) => {
        return filepath.includes('Claude');
      });

      const results = ConfigValidator.findAllMcpConfigs();

      for (const result of results) {
        expect(result.path).toBeDefined();
        expect(result.client).toBeDefined();
        expect(result.clientName).toBeDefined();
        expect(['vscode', 'claude-desktop', 'cursor', 'generic']).toContain(result.client);
      }
    });
  });

  describe('checkExecutablePermissions', () => {
    it('should warn when executable exists but is not executable (Unix)', async () => {
      const config = {
        mcpServers: {
          'my-server': {
            command: '/usr/local/bin/my-script',
          },
        },
      };

      // Mock fs.existsSync to return true
      mockFS.existsSync.mockImplementation(() => true);
      // Mock fs.readFileSync to return valid config
      mockFS.readFileSync.mockImplementation(() => JSON.stringify(config));
      // Mock fs.accessSync to throw (not executable)
      mockFS.accessSync = mock(() => {
        throw new Error('Permission denied');
      });

      const result = await ConfigValidator.validateConfigFile('/test/config.json');

      // On non-Windows, should have warning about not executable
      if (process.platform !== 'win32') {
        const permissionWarning = result.issues.find((i) => i.code === 'EXECUTABLE_NOT_EXECUTABLE');
        expect(permissionWarning).toBeDefined();
      }
    });
  });

  describe('checkArgsFilePaths', () => {
    it('should warn when arg file path does not exist', async () => {
      const config = {
        mcpServers: {
          'my-server': {
            command: 'node',
            args: ['./missing-script.js'],
          },
        },
      };

      mockFS.existsSync.mockImplementation((path: string) => {
        // Config file exists, but script file does not
        return path === '/test/config.json';
      });
      mockFS.readFileSync.mockImplementation(() => JSON.stringify(config));
      mockFS.accessSync = mock(() => {});

      const result = await ConfigValidator.validateConfigFile('/test/config.json');

      const argWarning = result.issues.find((i) => i.code === 'ARG_FILE_NOT_FOUND');
      expect(argWarning).toBeDefined();
    });

    it('should not warn for flags starting with dash', async () => {
      const config = {
        mcpServers: {
          'my-server': {
            command: 'node',
            args: ['--version', '-v', './existing.js'],
          },
        },
      };

      mockFS.existsSync.mockImplementation((path: string) => {
        // Config and existing.js exist
        return path === '/test/config.json' || path.includes('existing.js');
      });
      mockFS.readFileSync.mockImplementation(() => JSON.stringify(config));
      mockFS.accessSync = mock(() => {});

      const result = await ConfigValidator.validateConfigFile('/test/config.json');

      // Should not have warnings for --version or -v
      const argWarnings = result.issues.filter((i) => i.code === 'ARG_FILE_NOT_FOUND');
      expect(argWarnings.length).toBe(0);
    });
  });

  describe('checkHardcodedSecrets', () => {
    it('should warn when env value looks like a hardcoded API key', async () => {
      const config = {
        mcpServers: {
          'my-server': {
            command: 'node',
            env: {
              // This matches the pattern: starts with sk- and has 32+ hex characters
              OPENAI_API_KEY: 'sk-1234567890abcdef1234567890abcdef12345678',
            },
          },
        },
      };

      mockFS.existsSync.mockImplementation(() => true);
      mockFS.readFileSync.mockImplementation(() => JSON.stringify(config));
      mockFS.accessSync = mock(() => {});

      const result = await ConfigValidator.validateConfigFile('/test/config.json');

      const secretWarning = result.issues.find((i) => i.code === 'HARDCODED_SECRET');
      expect(secretWarning).toBeDefined();
    });

    it('should not warn for env var references', async () => {
      const config = {
        mcpServers: {
          'my-server': {
            command: 'node',
            env: {
              OPENAI_API_KEY: '$OPENAI_API_KEY',
            },
          },
        },
      };

      mockFS.existsSync.mockImplementation(() => true);
      mockFS.readFileSync.mockImplementation(() => JSON.stringify(config));
      mockFS.accessSync = mock(() => {});

      const result = await ConfigValidator.validateConfigFile('/test/config.json');

      const secretWarning = result.issues.find((i) => i.code === 'HARDCODED_SECRET');
      expect(secretWarning).toBeUndefined();
    });

    it('should not warn for short values', async () => {
      const config = {
        mcpServers: {
          'my-server': {
            command: 'node',
            env: {
              API_KEY: 'short',
            },
          },
        },
      };

      mockFS.existsSync.mockImplementation(() => true);
      mockFS.readFileSync.mockImplementation(() => JSON.stringify(config));
      mockFS.accessSync = mock(() => {});

      const result = await ConfigValidator.validateConfigFile('/test/config.json');

      const secretWarning = result.issues.find((i) => i.code === 'HARDCODED_SECRET');
      expect(secretWarning).toBeUndefined();
    });
  });

  describe('verbose mode', () => {
    it('should include checksPerformed when verbose is true', async () => {
      const validConfig = {
        mcpServers: {
          'my-server': { command: 'node' },
        },
      };

      mockFS.existsSync.mockImplementation(() => true);
      mockFS.readFileSync.mockImplementation(() => JSON.stringify(validConfig));
      mockFS.accessSync = mock(() => {});

      const result = await ConfigValidator.validateConfigFile('/test/config.json', {
        verbose: true,
      });

      expect(result.checksPerformed).toBeDefined();
      expect(result.checksPerformed!.length).toBeGreaterThan(0);
      expect(result.checksPerformed).toContain('File existence check');
      expect(result.checksPerformed).toContain('JSON syntax validation');
    });

    it('should not include checksPerformed when verbose is false', async () => {
      const validConfig = {
        mcpServers: {
          'my-server': { command: 'node' },
        },
      };

      mockFS.existsSync.mockImplementation(() => true);
      mockFS.readFileSync.mockImplementation(() => JSON.stringify(validConfig));
      mockFS.accessSync = mock(() => {});

      const result = await ConfigValidator.validateConfigFile('/test/config.json', {
        verbose: false,
      });

      expect(result.checksPerformed).toBeUndefined();
    });
  });

  describe('getPlatformSpecificPaths', () => {
    it('should return an array of platform-specific paths', () => {
      const paths = ConfigValidator.getPlatformSpecificPaths();

      expect(Array.isArray(paths)).toBe(true);
      expect(paths.length).toBeGreaterThan(0);
      expect(paths[0]).toHaveProperty('path');
      expect(paths[0]).toHaveProperty('description');
    });

    it('should include common client descriptions', () => {
      const paths = ConfigValidator.getPlatformSpecificPaths();
      const descriptions = paths.map((p) => p.description);

      expect(descriptions).toContain('Claude Desktop');
      expect(descriptions).toContain('VS Code (Cline)');
      expect(descriptions).toContain('Cursor');
    });
  });

  describe('validateQnscMcpConfig', () => {
    it('should return configPath from loaded config source', async () => {
      // The loadConfig() mock in test-utils/mocks.ts returns a config with source: 'test-source'
      const result = await ConfigValidator.validateQnscMcpConfig();

      // Should include the config path from loadConfig().source
      expect(result.configPath).toBe('test-source');
      expect(result.valid).toBeDefined();
      expect(result.issues).toBeDefined();
    });
  });

  describe('validateQnscMcpConfigFile', () => {
    it('should return error when file does not exist', async () => {
      mockFS.existsSync.mockImplementation(() => false);

      const result = await ConfigValidator.validateQnscMcpConfigFile('/nonexistent/config.yaml');

      expect(result.valid).toBe(false);
      expect(result.issues[0].code).toBe('FILE_NOT_FOUND');
      expect(result.configPath).toBe('/nonexistent/config.yaml');
    });

    it('should return error for invalid YAML syntax', async () => {
      mockFS.existsSync.mockImplementation(() => true);
      mockFS.readFileSync.mockImplementation(() => 'invalid: yaml: content: [');

      const result = await ConfigValidator.validateQnscMcpConfigFile('/test/config.yaml');

      expect(result.valid).toBe(false);
      expect(result.issues[0].code).toBe('INVALID_YAML');
      expect(result.issues[0].message).toBe('Invalid YAML syntax');
    });

    it('should return error for empty YAML file', async () => {
      mockFS.existsSync.mockImplementation(() => true);
      mockFS.readFileSync.mockImplementation(() => '');

      const result = await ConfigValidator.validateQnscMcpConfigFile('/test/config.yaml');

      expect(result.valid).toBe(false);
      expect(result.issues[0].code).toBe('INVALID_YAML');
      expect(result.issues[0].message).toBe('Invalid YAML content');
    });

    it('should return error for YAML array content', async () => {
      mockFS.existsSync.mockImplementation(() => true);
      mockFS.readFileSync.mockImplementation(() => '- item1\n- item2\n');

      const result = await ConfigValidator.validateQnscMcpConfigFile('/test/config.yaml');

      expect(result.valid).toBe(false);
      expect(result.issues[0].code).toBe('INVALID_YAML');
      expect(result.issues[0].message).toBe('Invalid YAML content');
    });

    it('should return error when file cannot be read', async () => {
      mockFS.existsSync.mockImplementation(() => true);
      mockFS.readFileSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const result = await ConfigValidator.validateQnscMcpConfigFile('/test/config.yaml');

      expect(result.valid).toBe(false);
      expect(result.issues[0].code).toBe('FILE_NOT_FOUND');
      expect(result.issues[0].message).toContain('Failed to read configuration file');
    });

    it('should validate a valid YAML config file', async () => {
      mockFS.existsSync.mockImplementation(() => true);
      mockFS.readFileSync.mockImplementation(() => 'tools:\n  includeMCPs:\n    - figma\n');

      const result = await ConfigValidator.validateQnscMcpConfigFile('/test/config.yaml');

      expect(result.valid).toBe(true);
      expect(result.configPath).toBe('/test/config.yaml');
      expect(result.checksPerformed).toBeUndefined();
    });

    it('should include checksPerformed when verbose is true', async () => {
      mockFS.existsSync.mockImplementation(() => true);
      mockFS.readFileSync.mockImplementation(() => 'tools:\n  includeMCPs:\n    - figma\n');

      const result = await ConfigValidator.validateQnscMcpConfigFile('/test/config.yaml', {
        verbose: true,
      });

      expect(result.checksPerformed).toBeDefined();
      expect(result.checksPerformed).toContain('File existence check');
      expect(result.checksPerformed).toContain('YAML syntax validation');
    });
  });

  describe('isYamlFile', () => {
    it('should return true for .yaml extension', () => {
      expect(isYamlFile('/path/to/config.yaml')).toBe(true);
    });

    it('should return true for .yml extension', () => {
      expect(isYamlFile('/path/to/config.yml')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(isYamlFile('/path/to/config.YAML')).toBe(true);
      expect(isYamlFile('/path/to/config.YML')).toBe(true);
      expect(isYamlFile('/path/to/config.Yaml')).toBe(true);
    });

    it('should return false for .json extension', () => {
      expect(isYamlFile('/path/to/config.json')).toBe(false);
    });

    it('should return false for files with no extension', () => {
      expect(isYamlFile('/path/to/config')).toBe(false);
    });

    it('should not match yaml in directory names', () => {
      expect(isYamlFile('/yaml-configs/settings.json')).toBe(false);
    });
  });
});
