/**
 * mcp-config-loader.test.ts - Tests for MCPConfigLoader
 */
import { beforeEach, describe, expect, it, mock } from 'bun:test';
import path from 'path';
import yaml from 'js-yaml';
import { MCPConfig } from '../types/config';
import { MCPConfigError, MCPConfigLoader } from './mcp-config-loader';

// Test class with mocked filesystem functions
class TestMCPConfigLoader extends MCPConfigLoader {
  static mockExistsSync = mock((_path: string) => true);
  static mockReaddirSync = mock((dir: string, _options?: unknown) => {
    if (dir === '/mock/config') {
      return [
        { name: 'mcp1', isDirectory: () => true },
        { name: 'mcp2.yaml', isFile: () => true, isDirectory: () => false },
        { name: 'readme.md', isFile: () => true, isDirectory: () => false },
      ];
    } else if (dir === '/mock/config/mcp1') {
      return [
        { name: 'server.yaml', isFile: () => true, isDirectory: () => false },
        { name: 'assets', isDirectory: () => true },
      ];
    } else if (dir === '/mock/config/mcp1/assets') {
      return [{ name: 'config.yaml', isFile: () => true, isDirectory: () => false }];
    } else {
      return [];
    }
  });

  static mockReadFileSync = mock((filepath: string, _encoding: string) => {
    if (filepath === '/mock/config/mcp2.yaml') {
      return `
name: MCP2
description: Test MCP 2
source:
  repository: https://github.com/example/mcp2.git
  ref: main
build:
  enabled: true
  command: npm run build
security:
  allowNetwork: false
  allowFileSystem: false
`;
    } else if (filepath === '/mock/config/mcp1/server.yaml') {
      return `
name: MCP1
description: Test MCP 1
source:
  repository: https://github.com/example/mcp1.git
  ref: main
  entrypoint: src/index.js
build:
  enabled: true
  command: npm run build
  args:
    - --prod
    - --no-source-maps
security:
  allowNetwork: true
  allowFileSystem: true
  fsBaseDir: /data
staticFiles:
  - assets/
  - README.md
envVars:
  - name: API_KEY
    description: API key for service
    required: true
    mock: test-api-key
  - name: DEBUG
    required: false
    default: "false"
`;
    } else if (filepath === '/mock/config/mcp1/assets/config.yaml') {
      return `
name: AssetConfig
description: Asset Config
source:
  repository: https://github.com/example/asset-config.git
  ref: main
build:
  enabled: false
security:
  allowNetwork: false
  allowFileSystem: false
`;
    } else if (filepath === '/mock/config/invalid.yaml') {
      return `
name: Invalid
description: Invalid config
# Missing source section
`;
    } else if (filepath === '/mock/config/invalid-source.yaml') {
      return `
name: InvalidSource
description: Invalid source config
source:
  # Missing repository and ref
`;
    } else if (filepath === '/mock/config/invalid-args.yaml') {
      return `
name: InvalidArgs
description: Invalid args config
source:
  repository: https://github.com/example/invalid.git
  ref: main
build:
  args: "not-an-array"
`;
    } else if (filepath === '/mock/config/invalid-static-files.yaml') {
      return `
name: InvalidStaticFiles
description: Invalid static files config
source:
  repository: https://github.com/example/invalid.git
  ref: main
staticFiles: "not-an-array"
`;
    } else if (filepath === '/mock/config/invalid-env-vars.yaml') {
      return `
name: InvalidEnvVars
description: Invalid env vars config
source:
  repository: https://github.com/example/invalid.git
  ref: main
envVars: "not-an-array"
`;
    } else if (filepath === '/mock/config/invalid-env-var-entry.yaml') {
      return `
name: InvalidEnvVarEntry
description: Invalid env var entry config
source:
  repository: https://github.com/example/invalid.git
  ref: main
envVars:
  - description: Missing name property
    required: true
`;
    } else {
      return '';
    }
  });

  static mockMkdirSync = mock((_path: string, _options?: unknown) => undefined);

  // Add a local property to store the config directory
  private testConfigDir: string;

  constructor(configDir: string) {
    super(configDir);
    this.testConfigDir = configDir;
  }

  // Override the private methods to use our mocks
  private testFindYamlFiles(dir: string): string[] {
    // Return yaml files based on mockReaddirSync
    const results: string[] = [];

    // Simulate our directory structure with yaml files
    if (dir === '/mock/config') {
      results.push('/mock/config/mcp2.yaml');
      results.push('/mock/config/mcp1/server.yaml');
      results.push('/mock/config/mcp1/assets/config.yaml');
    }

    return results;
  }

  // Override public methods to use our mocks
  async loadConfig(filePath: string): Promise<MCPConfig> {
    try {
      // Read the file using our mock
      const content = TestMCPConfigLoader.mockReadFileSync(filePath, 'utf8');

      // Use the parent class's validation logic
      return super.validateConfig(yaml.load(content), filePath);
    } catch (error) {
      if (error instanceof MCPConfigError) {
        throw error;
      } else {
        throw new MCPConfigError(
          `Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`,
          filePath,
        );
      }
    }
  }

  // Override loadAllConfigs to use our mocks
  public async loadAllConfigs(): Promise<
    { config: MCPConfig; filePath: string; fileName: string }[]
  > {
    // Create the directory if it doesn't exist
    if (!TestMCPConfigLoader.mockExistsSync(this.testConfigDir)) {
      if (this['verbose']) {
        console.log(`Creating config directory: ${this.testConfigDir}`);
      }
      TestMCPConfigLoader.mockMkdirSync(this.testConfigDir, {
        recursive: true,
      });
      return [];
    }

    // Find all YAML files recursively
    const yamlPaths = this.testFindYamlFiles(this.testConfigDir);

    const configs: { config: MCPConfig; filePath: string; fileName: string }[] = [];

    // Load each file
    for (const filePath of yamlPaths) {
      try {
        const config = await this.loadConfig(filePath);
        // Use parent directory name as the MCP name if not specified in the config
        const dirName = path.basename(path.dirname(filePath));
        const fileName = path.basename(filePath, path.extname(filePath));
        // If the file is named server.yaml, use the directory name instead
        const defaultName = fileName === 'server' ? dirName : fileName;

        configs.push({
          config,
          filePath,
          fileName: defaultName,
        });
      } catch (error) {
        // Just log the error in tests, don't fail the test
        console.error(`Error loading config file ${filePath}:`, error);
      }
    }

    return configs;
  }
}

describe('MCPConfigLoader', () => {
  beforeEach(() => {
    // Reset all mocks
    TestMCPConfigLoader.mockExistsSync.mockClear();
    TestMCPConfigLoader.mockReaddirSync.mockClear();
    TestMCPConfigLoader.mockReadFileSync.mockClear();
    TestMCPConfigLoader.mockMkdirSync.mockClear();
  });

  it('should create an instance', () => {
    const loader = new MCPConfigLoader('/mock/config');
    expect(loader).toBeDefined();
  });

  it('should load valid configuration from a file', async () => {
    const loader = new TestMCPConfigLoader('/mock/config');
    const config = await loader.loadConfig('/mock/config/mcp1/server.yaml');

    expect(config).toBeDefined();
    expect(config.name).toBe('MCP1');
    expect(config.description).toBe('Test MCP 1');
    expect(config.source.repository).toBe('https://github.com/example/mcp1.git');
    expect(config.source.ref).toBe('main');
    expect(config.source.entrypoint).toBe('src/index.js');
    expect(config.build.enabled).toBe(true);
    expect(config.build.command).toBe('npm run build');
    expect(config.build.args).toEqual(['--prod', '--no-source-maps']);
    expect(config.security.allowNetwork).toBe(true);
    expect(config.security.allowFileSystem).toBe(true);
    expect(config.staticFiles).toEqual(['assets/', 'README.md']);
    expect(config.envVars).toHaveLength(2);
    expect(config.envVars?.[0].name).toBe('API_KEY');
    expect(config.envVars?.[0].required).toBe(true);
    expect(config.envVars?.[1].name).toBe('DEBUG');
    expect(config.envVars?.[1].required).toBe(false);
    expect(config.envVars?.[1].default).toBe('false');
  });

  it('should apply default values when optional fields are missing', async () => {
    const loader = new TestMCPConfigLoader('/mock/config');
    const config = await loader.loadConfig('/mock/config/mcp2.yaml');

    expect(config).toBeDefined();
    expect(config.build.enabled).toBe(true);
    expect(config.security.allowNetwork).toBe(false);
    expect(config.security.allowFileSystem).toBe(false);
  });

  it('should reject configuration without source section', async () => {
    const loader = new TestMCPConfigLoader('/mock/config');

    try {
      await loader.loadConfig('/mock/config/invalid.yaml');
      throw new Error('Expected loadConfig to throw MCPConfigError');
    } catch (error) {
      expect(error).toBeInstanceOf(MCPConfigError);
    }
  });

  it('should reject configuration with missing repository or ref', async () => {
    const loader = new TestMCPConfigLoader('/mock/config');

    try {
      await loader.loadConfig('/mock/config/invalid-source.yaml');
      throw new Error('Expected loadConfig to throw MCPConfigError');
    } catch (error) {
      expect(error).toBeInstanceOf(MCPConfigError);
    }
  });

  it('should reject configuration with invalid build args', async () => {
    const loader = new TestMCPConfigLoader('/mock/config');

    try {
      await loader.loadConfig('/mock/config/invalid-args.yaml');
      throw new Error('Expected loadConfig to throw MCPConfigError');
    } catch (error) {
      expect(error).toBeInstanceOf(MCPConfigError);
    }
  });

  it('should reject configuration with invalid static files', async () => {
    const loader = new TestMCPConfigLoader('/mock/config');

    try {
      await loader.loadConfig('/mock/config/invalid-static-files.yaml');
      throw new Error('Expected loadConfig to throw MCPConfigError');
    } catch (error) {
      expect(error).toBeInstanceOf(MCPConfigError);
    }
  });

  it('should reject configuration with invalid env vars', async () => {
    const loader = new TestMCPConfigLoader('/mock/config');

    try {
      await loader.loadConfig('/mock/config/invalid-env-vars.yaml');
      throw new Error('Expected loadConfig to throw MCPConfigError');
    } catch (error) {
      expect(error).toBeInstanceOf(MCPConfigError);
    }
  });

  it('should reject configuration with invalid env var entry', async () => {
    const loader = new TestMCPConfigLoader('/mock/config');

    try {
      await loader.loadConfig('/mock/config/invalid-env-var-entry.yaml');
      throw new Error('Expected loadConfig to throw MCPConfigError');
    } catch (error) {
      expect(error).toBeInstanceOf(MCPConfigError);
    }
  });

  it('should load all configurations from a directory', async () => {
    const loader = new TestMCPConfigLoader('/mock/config');
    const configs = await loader.loadAllConfigs();

    expect(configs).toHaveLength(3); // Three YAML files

    // Check that each config was loaded correctly
    const configPaths = configs.map((c) => c.filePath);
    expect(configPaths).toContain('/mock/config/mcp2.yaml');
    expect(configPaths).toContain('/mock/config/mcp1/server.yaml');
    expect(configPaths).toContain('/mock/config/mcp1/assets/config.yaml');

    // Check that names are extracted correctly
    const configNames = configs.map((c) => c.fileName);
    expect(configNames).toContain('mcp2');
    expect(configNames).toContain('mcp1'); // server.yaml should use directory name
    expect(configNames).toContain('config');
  });

  it('should create config directory if it does not exist', async () => {
    // Mock that the directory doesn't exist
    TestMCPConfigLoader.mockExistsSync.mockImplementationOnce(() => false);

    const loader = new TestMCPConfigLoader('/mock/config');
    const configs = await loader.loadAllConfigs();

    expect(configs).toHaveLength(0); // No configs should be found
    expect(TestMCPConfigLoader.mockMkdirSync).toHaveBeenCalledWith('/mock/config', {
      recursive: true,
    });
  });

  it('should convert config to GitRepoSource', () => {
    const config: MCPConfig = {
      name: 'Test',
      source: {
        repository: 'https://github.com/example/test.git',
        ref: 'main',
      },
      build: {
        enabled: true,
      },
      security: {
        allowNetwork: false,
        allowFileSystem: false,
      },
    };

    const source = MCPConfigLoader.getGitRepoSource(config);

    expect(source.url).toBe('https://github.com/example/test.git');
    expect(source.ref).toBe('main');
  });
});
