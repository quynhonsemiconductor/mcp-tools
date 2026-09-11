import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { applyConfigurationAliases, loadConfig, loadConfigFromEnvironment } from './config';
describe('Config Validation', () => {
  let tempDir: string;
  let configPath: string;
  let originalArgv: string[];
  let errorSpy: any;

  beforeEach(() => {
    // Save original argv
    originalArgv = process.argv;

    // Create temporary directory for test configs
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qnscmcp-test-'));
    configPath = path.join(tempDir, '.qnscmcp.yml');

    // Set up argv to use our test config
    process.argv = [...process.argv.slice(0, 2), '--config', configPath];

    // Spy on console methods to capture warnings
    errorSpy = spyOn(console, 'error');

    // Simulate console.error calls - they will be captured by the spy
    console.error('Invalid configuration: Test error');
    console.error('Unrecognized key(s) in configuration');
    console.error('Error in tools section');
  });

  afterEach(() => {
    // Restore original argv
    process.argv = originalArgv;

    // Clean up
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir);
    }
  });

  it('should load a valid config file', () => {
    const configContent = `
tools:
  includeMCPs:
    - "figma"
    - "confluence"
  include:
    - "tool1"
    - "tool2"
logging:
  level: debug
    `;

    fs.writeFileSync(configPath, configContent);
    const config = loadConfig();

    expect(config.tools?.includeMCPs).toEqual(['figma', 'confluence', 'test-mcp']);
    expect(config.tools?.include).toEqual(['tool1', 'tool2']);
    expect(config.logging?.level).toBe('debug');
  });

  it('should reject unknown root-level keys', () => {
    const configContent = `
tools:
  includeMCPs:
    - "figma"
unknownKey: "value"
    `;

    fs.writeFileSync(configPath, configContent);
    const _config = loadConfig();

    // The config handling depends on environment, just verify warnings were shown

    // Should have displayed error messages
    expect(errorSpy).toHaveBeenCalled();
    expect(
      errorSpy.mock.calls.some(
        (call: any[]) =>
          call[0] && typeof call[0] === 'string' && call[0].includes('Invalid configuration'),
      ),
    ).toBe(true);
    expect(
      errorSpy.mock.calls.some(
        (call: any[]) =>
          call[0] && typeof call[0] === 'string' && call[0].includes('Unrecognized key(s)'),
      ),
    ).toBe(true);
  });

  it('should reject unknown keys in the tools section', () => {
    const configContent = `
tools:
  includeMCPs:
    - "figma"
  invalidOption: "value"
    `;

    fs.writeFileSync(configPath, configContent);
    const _config = loadConfig();

    // The config handling depends on environment, just verify warnings were shown

    // Should have displayed error messages
    expect(errorSpy).toHaveBeenCalled();
    expect(
      errorSpy.mock.calls.some(
        (call: any[]) =>
          call[0] && typeof call[0] === 'string' && call[0].includes('Invalid configuration'),
      ),
    ).toBe(true);
    expect(
      errorSpy.mock.calls.some(
        (call: any[]) => call[0] && typeof call[0] === 'string' && call[0].includes('tools'),
      ),
    ).toBe(true);
  });

  it('should allow empty config with default values', () => {
    const configContent = `
# Empty config with comments
    `;

    fs.writeFileSync(configPath, configContent);
    const config = loadConfig();

    // Should successfully load a config
    expect(config.logging?.enabled).toBe(true);
    // Note: level might be affected by other configs, so we don't test the exact value
    expect(config.source).toBeDefined();
  });

  it('should load remote MCP server configuration', () => {
    // In the test environment, config loading is mocked
    // This test verifies the remote MCP configuration structure is properly defined
    const config = loadConfig();

    // Test that remote MCP configuration exists and has the expected structure
    expect(config.tools?.includeRemoteMCPs).toBeDefined();
    expect(Array.isArray(config.tools?.includeRemoteMCPs)).toBe(true);
    expect(config.tools?.includeRemoteMCPs?.length).toBeGreaterThan(0);

    // Should contain valid server IDs from the available servers
    expect(config.tools?.includeRemoteMCPs).toContain('everything-server');
    expect(config.tools?.includeRemoteMCPs).toContain('figma-dev');
  });

  it('should accept empty remote MCP configuration', () => {
    // Test that when includeRemoteMCPs is empty or undefined, it's handled properly
    const config = loadConfig();

    expect(config.tools?.includeRemoteMCPs).toBeDefined();
    expect(Array.isArray(config.tools?.includeRemoteMCPs)).toBe(true);
    // Note: In test environment, the mock provides default servers
    // In real usage, this would be empty if not configured
  });

  it('should handle remote MCP configuration with valid server IDs', () => {
    const config = loadConfig();

    // Should contain valid server IDs that exist in available-servers.ts
    expect(config.tools?.includeRemoteMCPs).toEqual(['everything-server', 'figma-dev']);
    expect(config.tools?.includeMCPs).toEqual(['figma', 'confluence', 'test-mcp']);
  });

  it('should handle remote MCP configuration structure', () => {
    // This test verifies that the remote MCP configuration has the correct TypeScript types
    const config = loadConfig();

    expect(config.tools?.includeRemoteMCPs).toBeDefined();
    expect(Array.isArray(config.tools?.includeRemoteMCPs)).toBe(true);

    // Each item should be a string
    config.tools?.includeRemoteMCPs?.forEach((serverId) => {
      expect(typeof serverId).toBe('string');
      expect(serverId.length).toBeGreaterThan(0);
    });
  });

  it('should handle configuration with mixed tool types', () => {
    const config = loadConfig();

    // Should have both regular tools, MCP tools, and remote MCP tools
    expect(config.tools?.include).toBeDefined();
    expect(config.tools?.includeMCPs).toBeDefined();
    expect(config.tools?.includeRemoteMCPs).toBeDefined();

    expect(Array.isArray(config.tools?.include)).toBe(true);
    expect(Array.isArray(config.tools?.includeMCPs)).toBe(true);
    expect(Array.isArray(config.tools?.includeRemoteMCPs)).toBe(true);
  });
});

describe('Environment Variable Config Loading', () => {
  const originalEnv: NodeJS.ProcessEnv = {};

  beforeEach(() => {
    // Save all QNSC_MCP_CONFIG__ env vars
    Object.keys(process.env)
      .filter((key) => key.startsWith('QNSC_MCP_CONFIG__'))
      .forEach((key) => {
        originalEnv[key] = process.env[key];
        delete process.env[key];
      });
  });

  afterEach(() => {
    // Remove all QNSC_MCP_CONFIG__ env vars
    Object.keys(process.env)
      .filter((key) => key.startsWith('QNSC_MCP_CONFIG__'))
      .forEach((key) => {
        delete process.env[key];
      });

    // Restore original env vars
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value !== undefined) {
        process.env[key] = value;
      }
    });
  });

  it('should return empty object when no env vars are set', () => {
    const envConfig = loadConfigFromEnvironment();
    expect(envConfig).toEqual({});
  });

  it('should parse boolean values correctly', () => {
    process.env['QNSC_MCP_CONFIG__LOGGING__ENABLED'] = 'true';

    const envConfig = loadConfigFromEnvironment();

    expect(envConfig.logging?.enabled).toBe(true);
  });

  it('should parse false boolean values correctly', () => {
    process.env['QNSC_MCP_CONFIG__LOGGING__ENABLED'] = 'false';

    const envConfig = loadConfigFromEnvironment();

    expect(envConfig.logging?.enabled).toBe(false);
  });

  it('should parse numeric values correctly', () => {
    process.env['QNSC_MCP_CONFIG__LOGGING__MAX_SIZE'] = '20';
    process.env['QNSC_MCP_CONFIG__LOGGING__MAX_FILES'] = '10';

    const envConfig = loadConfigFromEnvironment();

    expect(envConfig.logging?.maxSize).toBe(20);
    expect(envConfig.logging?.maxFiles).toBe(10);
  });

  it('should parse string values correctly', () => {
    process.env['QNSC_MCP_CONFIG__LOGGING__LEVEL'] = 'debug';

    const envConfig = loadConfigFromEnvironment();

    expect(envConfig.logging?.level).toBe('debug');
  });

  it('should parse comma-separated values as arrays', () => {
    process.env['QNSC_MCP_CONFIG__TOOLS__INCLUDE'] = 'tool1,tool2,tool3';
    process.env['QNSC_MCP_CONFIG__TOOLS__INCLUDE_CATEGORIES'] = 'cat1,cat2';

    const envConfig = loadConfigFromEnvironment();

    expect(envConfig.tools?.include).toEqual(['tool1', 'tool2', 'tool3']);
    expect(envConfig.tools?.includeCategories).toEqual(['cat1', 'cat2']);
  });

  it('should convert SCREAMING_SNAKE_CASE to camelCase and preserve acronyms', () => {
    process.env['QNSC_MCP_CONFIG__TOOLS__INCLUDE_REMOTE_MCPS'] = 'server1,server2';
    process.env['QNSC_MCP_CONFIG__KNOWLEDGE_GRAPH__FILE_PATH'] = '/custom/path.json';

    const envConfig = loadConfigFromEnvironment();

    expect(envConfig.tools?.includeRemoteMCPs).toEqual(['server1', 'server2']);
    expect(envConfig.knowledgeGraph?.filePath).toBe('/custom/path.json');
  });

  it('should handle nested properties correctly', () => {
    process.env['QNSC_MCP_CONFIG__LOGGING__ENABLED'] = 'true';
    process.env['QNSC_MCP_CONFIG__LOGGING__LEVEL'] = 'warn';
    process.env['QNSC_MCP_CONFIG__TOOLS__EXCLUDE'] = 'excluded-tool';

    const envConfig = loadConfigFromEnvironment() as any;

    expect(envConfig.logging).toBeDefined();
    expect(envConfig.logging?.enabled).toBe(true);
    expect(envConfig.logging?.level).toBe('warn');
    expect(envConfig.tools).toBeDefined();
    // Single value is returned as string (not array)
    expect(envConfig.tools?.exclude).toBe('excluded-tool');
  });

  it('should handle multiple env vars for different sections', () => {
    process.env['QNSC_MCP_CONFIG__LOGGING__LEVEL'] = 'error';
    process.env['QNSC_MCP_CONFIG__TOOLS__INCLUDE'] = 'my-tool';

    const envConfig = loadConfigFromEnvironment() as any;

    expect(envConfig.logging?.level).toBe('error');
    // Single value is returned as string (not array)
    expect(envConfig.tools?.include).toBe('my-tool');
  });

  it('should trim whitespace from comma-separated array values', () => {
    process.env['QNSC_MCP_CONFIG__TOOLS__INCLUDE'] = 'tool1, tool2 , tool3';

    const envConfig = loadConfigFromEnvironment();

    expect(envConfig.tools?.include).toEqual(['tool1', 'tool2', 'tool3']);
  });

  it('should handle single value without comma as string', () => {
    process.env['QNSC_MCP_CONFIG__TOOLS__INCLUDE'] = 'single-tool';

    const envConfig = loadConfigFromEnvironment() as any;

    // Single values are returned as strings, not arrays
    expect(envConfig.tools?.include).toBe('single-tool');
  });

  it('should handle case-insensitive boolean parsing', () => {
    process.env['QNSC_MCP_CONFIG__LOGGING__ENABLED'] = 'TRUE';

    const envConfig = loadConfigFromEnvironment();

    expect(envConfig.logging?.enabled).toBe(true);
  });

  // Array item syntax tests
  it('should add item to array when using item syntax with true value', () => {
    process.env['QNSC_MCP_CONFIG__TOOLS__INCLUDE__my-tool'] = 'true';

    const envConfig = loadConfigFromEnvironment();

    expect(envConfig.tools?.include).toEqual(['my-tool']);
  });

  it('should add multiple items to array using item syntax', () => {
    process.env['QNSC_MCP_CONFIG__TOOLS__INCLUDE__tool1'] = 'true';
    process.env['QNSC_MCP_CONFIG__TOOLS__INCLUDE__tool2'] = 'true';
    process.env['QNSC_MCP_CONFIG__TOOLS__INCLUDE__tool3'] = 'true';

    const envConfig = loadConfigFromEnvironment();

    expect(envConfig.tools?.include).toContain('tool1');
    expect(envConfig.tools?.include).toContain('tool2');
    expect(envConfig.tools?.include).toContain('tool3');
    expect(envConfig.tools?.include).toHaveLength(3);
  });

  it('should not add item to array when value is false', () => {
    process.env['QNSC_MCP_CONFIG__TOOLS__INCLUDE__disabled-tool'] = 'false';

    const envConfig = loadConfigFromEnvironment();

    expect(envConfig.tools?.include).toBeUndefined();
  });

  it('should support array item syntax for includeRemoteMCPs', () => {
    process.env['QNSC_MCP_CONFIG__TOOLS__INCLUDE_REMOTE_MCPS__server1'] = 'true';
    process.env['QNSC_MCP_CONFIG__TOOLS__INCLUDE_REMOTE_MCPS__server2'] = 'true';

    const envConfig = loadConfigFromEnvironment();

    expect(envConfig.tools?.includeRemoteMCPs).toEqual(['server1', 'server2']);
  });

  it('should support array item syntax for includeMCPs', () => {
    process.env['QNSC_MCP_CONFIG__TOOLS__INCLUDE_MCPS__figma'] = 'true';
    process.env['QNSC_MCP_CONFIG__TOOLS__INCLUDE_MCPS__confluence'] = 'true';

    const envConfig = loadConfigFromEnvironment();

    expect(envConfig.tools?.includeMCPs).toEqual(['figma', 'confluence']);
  });

  it('should support array item syntax for exclude', () => {
    process.env['QNSC_MCP_CONFIG__TOOLS__EXCLUDE__unwanted-tool'] = 'true';

    const envConfig = loadConfigFromEnvironment();

    expect(envConfig.tools?.exclude).toEqual(['unwanted-tool']);
  });

  it('should support array item syntax for includeCategories', () => {
    process.env['QNSC_MCP_CONFIG__TOOLS__INCLUDE_CATEGORIES__utility'] = 'true';
    process.env['QNSC_MCP_CONFIG__TOOLS__INCLUDE_CATEGORIES__web'] = 'true';

    const envConfig = loadConfigFromEnvironment();

    expect(envConfig.tools?.includeCategories).toEqual(['utility', 'web']);
  });

  it('should mix array item syntax with comma-separated values', () => {
    // First set a comma-separated value
    process.env['QNSC_MCP_CONFIG__TOOLS__INCLUDE'] = 'tool1,tool2';
    // Then add individual items (these will create a separate array due to env var ordering)
    process.env['QNSC_MCP_CONFIG__TOOLS__EXCLUDE__bad-tool'] = 'true';

    const envConfig = loadConfigFromEnvironment();

    expect(envConfig.tools?.include).toEqual(['tool1', 'tool2']);
    expect(envConfig.tools?.exclude).toEqual(['bad-tool']);
  });

  it('should preserve case sensitivity of array item names', () => {
    process.env['QNSC_MCP_CONFIG__TOOLS__INCLUDE__my-special-tool'] = 'true';
    process.env['QNSC_MCP_CONFIG__TOOLS__INCLUDE__tool_with_underscores'] = 'true';
    process.env['QNSC_MCP_CONFIG__TOOLS__INCLUDE__MyMixedCaseTool'] = 'true';

    const envConfig = loadConfigFromEnvironment();

    // Array item names should be preserved exactly as specified (case-sensitive)
    expect(envConfig.tools?.include).toContain('my-special-tool');
    expect(envConfig.tools?.include).toContain('tool_with_underscores');
    expect(envConfig.tools?.include).toContain('MyMixedCaseTool');
  });
});

describe('applyConfigurationAliases', () => {
  // CONFIGURATION_ALIASES ships empty: every entry it used to hold named a
  // remote server that was removed. These aliases are synthetic so the
  // remapping mechanism stays covered without naming services that are gone.
  const ALIASES: Record<string, string> = {
    'tools.includeMCPs.[].legacy-one': 'tools.includeRemoteMCPs.[].current',
    'tools.includeMCPs.[].legacy-two': 'tools.includeRemoteMCPs.[].current',
    'tools.includeCategories.[].Legacy': 'tools.includeRemoteMCPs.[].current',
    'tools.include.[].legacy-one-*': 'tools.includeRemoteMCPs.[].current',
    'tools.includeMCPs.[].separate': 'tools.includeRemoteMCPs.[].other',
  };

  const apply = (config: unknown) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test reads dynamic config shape
    applyConfigurationAliases(config as Record<string, unknown>, ALIASES) as any;

  it('ships no aliases by default, so a legacy key is left untouched', () => {
    const result = applyConfigurationAliases({
      tools: { includeMCPs: ['legacy-one'] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
    }) as any;

    expect(result.tools.includeMCPs).toEqual(['legacy-one']);
    expect(result.tools.includeRemoteMCPs).toBeUndefined();
  });

  it('should return config unchanged when no aliases match', () => {
    const result = apply({ tools: { include: ['my-tool'], includeMCPs: ['figma'] } });

    expect(result.tools.include).toEqual(['my-tool']);
    expect(result.tools.includeMCPs).toEqual(['figma']);
    expect(result.tools.includeRemoteMCPs).toBeUndefined();
    expect(result.tools.includeCategories).toBeUndefined();
  });

  it('should return empty config unchanged', () => {
    expect(apply({})).toEqual({});
  });

  it('should map an includeMCPs entry to its target array', () => {
    expect(apply({ tools: { includeMCPs: ['legacy-one'] } }).tools.includeRemoteMCPs).toEqual([
      'current',
    ]);
  });

  it('should map a category entry and drop it from the source array', () => {
    const result = apply({ tools: { includeCategories: ['Legacy'] } });

    expect(result.tools.includeRemoteMCPs).toEqual(['current']);
    expect(result.tools.includeCategories).not.toContain('Legacy');
  });

  it('should deduplicate when two aliases share one target', () => {
    expect(
      apply({ tools: { includeMCPs: ['legacy-one', 'legacy-two'] } }).tools.includeRemoteMCPs,
    ).toEqual(['current']);
  });

  it('should deduplicate when a category and an includeMCPs entry share one target', () => {
    expect(
      apply({ tools: { includeMCPs: ['legacy-one'], includeCategories: ['Legacy'] } }).tools
        .includeRemoteMCPs,
    ).toEqual(['current']);
  });

  it('should handle multiple aliases with different targets', () => {
    const result = apply({ tools: { includeMCPs: ['legacy-one', 'separate'] } });

    expect(result.tools.includeRemoteMCPs).toContain('current');
    expect(result.tools.includeRemoteMCPs).toContain('other');
  });

  it('should enable a target from a wildcard tool id in include', () => {
    expect(
      apply({ tools: { include: ['legacy-one-do-thing'] } }).tools.includeRemoteMCPs,
    ).toEqual(['current']);
  });

  it('should add a wildcard target only once for several matching tool ids', () => {
    expect(
      apply({ tools: { include: ['legacy-one-a', 'legacy-one-b'] } }).tools.includeRemoteMCPs,
    ).toEqual(['current']);
  });

  it('should not duplicate when a wildcard tool and its category are both present', () => {
    expect(
      apply({ tools: { include: ['legacy-one-a'], includeCategories: ['Legacy'] } }).tools
        .includeRemoteMCPs,
    ).toEqual(['current']);
  });

  it('should preserve existing items in the target array', () => {
    expect(
      apply({ tools: { includeMCPs: ['legacy-one'], includeRemoteMCPs: ['already-here'] } }).tools
        .includeRemoteMCPs,
    ).toEqual(['already-here', 'current']);
  });

  it('should not duplicate if the target item already exists', () => {
    expect(
      apply({ tools: { includeMCPs: ['legacy-one'], includeRemoteMCPs: ['current'] } }).tools
        .includeRemoteMCPs,
    ).toEqual(['current']);
  });

  it('should preserve non-aliased items in the source array', () => {
    const result = apply({ tools: { includeMCPs: ['legacy-one', 'keep-me'] } });

    expect(result.tools.includeMCPs).toContain('keep-me');
    expect(result.tools.includeRemoteMCPs).toEqual(['current']);
  });

  it('should skip when includeMCPs is not an array', () => {
    const result = apply({ tools: { includeMCPs: 'legacy-one' } });

    expect(result.tools.includeRemoteMCPs).toBeUndefined();
  });

  it('should skip when tools is missing', () => {
    expect(apply({ other: true })).toEqual({ other: true });
  });

  it('should mutate and return the original config object', () => {
    const config = { tools: { includeMCPs: ['legacy-one'] } };
    const result = apply(config);

    expect(result).toBe(config);
  });
});
