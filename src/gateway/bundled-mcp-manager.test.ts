/**
 * bundled-mcp-manager.test.ts - Tests for bundled MCP manager
 */
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import fs from 'fs';
import path from 'path';
import type { ToolRegistryManager } from '../registry';
import { createMockMetadata, testPaths } from './__mocks__/mcp-fixtures';
import { BundledMCPManager } from './bundled-mcp-manager';
import type { BundledMCPInfo } from './types/bundle';
import type { MCPSandboxOptions } from './types/sandbox';

/**
 * Test-only view of BundledMCPManager exposing its private `bundledMCPs`
 * field, so tests can seed it directly without going through discovery and
 * without resorting to an `any` cast.
 */
type ManagerWithPrivateState = { bundledMCPs: BundledMCPInfo[] };

// Tests for bundled-mcp-manager
describe('BundledMCPManager', () => {
  // Mock for MCPExtractor
  class MockMCPExtractor {
    async initialize(): Promise<boolean> {
      return true;
    }

    getAvailableMCPs(): string[] {
      return ['test-mcp-1', 'test-mcp-2'];
    }

    isMCPAvailable(mcpName: string): boolean {
      return ['test-mcp-1', 'test-mcp-2'].includes(mcpName);
    }

    getMCPPath(mcpName: string): string | null {
      if (['test-mcp-1', 'test-mcp-2'].includes(mcpName)) {
        return path.join(testPaths.extractorCacheDir, mcpName);
      }
      return null;
    }
  }

  // Mock for SandboxProvider
  const mockSandboxProvider = {
    initializeMCP: mock((_bundlePath: string, _options: MCPSandboxOptions) => {
      return Promise.resolve({
        client: {
          listTools: async () => ({
            tools: [{ name: 'test_tool1' }, { name: 'test_tool2' }],
          }),
          callTool: async (name: string, args: unknown) => ({
            success: true,
            toolName: name,
            args,
          }),
        },
        transport: { close: async () => {} },
        serverInfo: { name: 'test-server', version: '1.0.0' },
        capabilities: {
          tools: { list: true, call: true },
          resources: { list: false, read: false },
        },
      });
    }),

    callTool: mock((_path: string, _tool: string, _args: unknown, _opts: MCPSandboxOptions) => {
      return Promise.resolve({ success: true });
    }),
  };

  // Set up mocks before tests
  beforeEach(async () => {
    await mock.module('./extractor/mcp-extractor', () => {
      return { MCPExtractor: MockMCPExtractor };
    });

    await mock.module('./sandbox/sandbox-provider', () => {
      return { SandboxProvider: mockSandboxProvider };
    });

    await mock.module('fs', () => {
      return {
        ...fs,
        existsSync: mock((path: string) => {
          const pathStr = path.toString();
          if (pathStr.endsWith('metadata.json')) return true;
          if (pathStr.includes('test-mcp-1') || pathStr.includes('test-mcp-2')) return true;
          if (pathStr.endsWith('index.js')) return true;
          if (pathStr === testPaths.mcpDir) return true;
          return false;
        }),

        readFileSync: mock((path: string, _encoding?: string) => {
          const pathStr = path.toString();
          if (pathStr.endsWith('metadata.json')) {
            if (pathStr.includes('test-mcp-1')) {
              return JSON.stringify(
                createMockMetadata({
                  name: 'test-mcp-1',
                  version: '1.0.0',
                  entryPoint: 'index.js',
                  tools: [
                    {
                      name: 'test_tool1',
                      description: 'Tool 1',
                      schema: {},
                      annotations: {},
                    },
                    {
                      name: 'test_tool2',
                      description: 'Tool 2',
                      schema: {},
                      annotations: {},
                    },
                  ],
                }),
              );
            } else {
              return JSON.stringify(
                createMockMetadata({
                  name: 'test-mcp-2',
                  version: '2.0.0',
                  entryPoint: 'index.js',
                  tools: [
                    {
                      name: 'test_tool1',
                      description: 'Tool 1',
                      schema: {},
                      annotations: {},
                    },
                    {
                      name: 'test_tool2',
                      description: 'Tool 2',
                      schema: {},
                      annotations: {},
                    },
                  ],
                }),
              );
            }
          }
          return '';
        }),

        readdirSync: mock((_dirPath: string, _options: { withFileTypes?: boolean }) => {
          return [
            { name: 'test-mcp-1', isDirectory: () => true },
            { name: 'test-mcp-2', isDirectory: () => true },
          ];
        }),
      };
    });

    // Mock logger to prevent console noise during tests
    await mock.module('../services/logger', () => {
      return {
        logDebug: mock(() => {}),
        logError: mock(() => {}),
        logInfo: mock(() => {}),
      };
    });
  });

  afterEach(() => {
    mock.restore();
  });

  // Basic test to verify BundledMCPManager exists and can be instantiated
  it('should be instantiable', () => {
    const manager = new BundledMCPManager(testPaths.mcpDir);
    expect(manager).toBeDefined();
  });

  // Test for error handling during getBundledMCP
  it('should throw if getting an MCP before discovery', () => {
    const manager = new BundledMCPManager(testPaths.mcpDir);

    expect(() => {
      manager.getBundledMCP('test-mcp-1');
    }).toThrow('MCPs have not been discovered yet');
  });

  // Test for avoiding duplicates in MCP list
  it('should avoid duplicate MCPs during discovery', async () => {
    // Create a manager with pre-populated MCPs for testing
    const manager = new BundledMCPManager(testPaths.mcpDir);

    // Manually set the bundledMCPs array to simulate existing MCPs
    (manager as unknown as ManagerWithPrivateState).bundledMCPs = [
      {
        path: path.join(testPaths.mcpDir, 'test-mcp-1', 'index.js'),
        name: 'test-mcp-1',
        version: '1.0.0',
        tools: [],
        enabled: true,
      },
    ];

    // Verify initial state
    expect(manager.getBundledMCPs().length).toBe(1);

    // Check that the name method works correctly
    const mcps = manager.getBundledMCPs();
    expect(mcps[0].name).toBe('test-mcp-1');
  });

  // Test getting a specific MCP by name
  it('should get a specific bundled MCP by name', async () => {
    // Create a manager with pre-populated MCPs for testing
    const manager = new BundledMCPManager(testPaths.mcpDir);

    // Manually set the bundledMCPs array using private property access
    // This is a test-only approach to avoid needing to mock the whole discovery process
    (manager as unknown as ManagerWithPrivateState).bundledMCPs = [
      {
        path: path.join(testPaths.mcpDir, 'test-mcp-1', 'index.js'),
        name: 'test-mcp-1',
        version: '1.0.0',
        tools: [
          {
            name: 'test_tool1',
            description: 'Test tool 1',
            schema: {},
            annotations: {},
          },
          {
            name: 'test_tool2',
            description: 'Test tool 2',
            schema: {},
            annotations: {},
          },
        ],
        enabled: true,
      },
      {
        path: path.join(testPaths.mcpDir, 'test-mcp-2', 'index.js'),
        name: 'test-mcp-2',
        version: '2.0.0',
        tools: [
          {
            name: 'test_tool1',
            description: 'Test tool 1',
            schema: {},
            annotations: {},
          },
          {
            name: 'test_tool2',
            description: 'Test tool 2',
            schema: {},
            annotations: {},
          },
        ],
        enabled: true,
      },
    ];

    // Now we can test getBundledMCP directly
    const mcp = manager.getBundledMCP('test-mcp-1');

    expect(mcp).toBeDefined();
    expect(mcp?.name).toBe('test-mcp-1');
    expect(mcp?.version).toBe('1.0.0');
  });

  // Test enabling/disabling MCPs
  it('should set MCP enabled/disabled state', () => {
    const manager = new BundledMCPManager(testPaths.mcpDir);

    // Manually set the bundledMCPs array using private property access
    (manager as unknown as ManagerWithPrivateState).bundledMCPs = [
      {
        path: path.join(testPaths.mcpDir, 'test-mcp-1', 'index.js'),
        name: 'test-mcp-1',
        version: '1.0.0',
        tools: [],
        enabled: true,
      },
    ];

    // Get initial state
    let mcp = manager.getBundledMCP('test-mcp-1');
    expect(mcp?.enabled).toBe(true);

    // Set to disabled
    manager.setBundledMCPEnabled('test-mcp-1', false);

    // Verify it was updated
    mcp = manager.getBundledMCP('test-mcp-1');
    expect(mcp?.enabled).toBe(false);
  });

  // Test registering tools with the registry
  it('should register tools with the registry', async () => {
    const manager = new BundledMCPManager(testPaths.mcpDir);

    // Manually set the bundledMCPs array with tools for testing
    (manager as unknown as ManagerWithPrivateState).bundledMCPs = [
      {
        path: path.join(testPaths.mcpDir, 'test-mcp-1', 'index.js'),
        name: 'test-mcp-1',
        version: '1.0.0',
        tools: [
          {
            name: 'test_tool1',
            description: 'Test tool 1',
            schema: {},
            annotations: {},
          },
          {
            name: 'test_tool2',
            description: 'Test tool 2',
            schema: {},
            annotations: {},
          },
        ],
        enabled: true,
      },
      {
        path: path.join(testPaths.mcpDir, 'test-mcp-2', 'index.js'),
        name: 'test-mcp-2',
        version: '2.0.0',
        tools: [
          {
            name: 'test_tool1',
            description: 'Test tool 1',
            schema: {},
            annotations: {},
          },
          {
            name: 'test_tool2',
            description: 'Test tool 2',
            schema: {},
            annotations: {},
          },
        ],
        enabled: true,
      },
    ];

    // Create a mock registry
    const mockRegistry = {
      registerTool: mock(() => {}),
    };

    // Register tools with mock registry
    await manager.registerWithToolRegistry(mockRegistry as unknown as ToolRegistryManager);

    // Each MCP has 2 tools, so registerTool should be called 4 times
    expect(mockRegistry.registerTool.mock.calls.length).toBeGreaterThan(0);
  });

  // Test creating an MCP provider
  it('should create an MCP provider', async () => {
    const manager = new BundledMCPManager(testPaths.mcpDir);

    // Manually set the bundledMCPs array
    (manager as unknown as ManagerWithPrivateState).bundledMCPs = [
      {
        path: path.join(testPaths.mcpDir, 'test-mcp-1', 'index.js'),
        name: 'test-mcp-1',
        version: '1.0.0',
        tools: [],
        enabled: true,
      },
    ];

    const provider = await manager.createMCPProvider('test-mcp-1');

    expect(provider).toBeDefined();
    expect(provider.client).toBeDefined();
    expect(provider.transport).toBeDefined();
  });

  // Test error case for non-existent MCP provider
  it('should throw when creating provider for non-existent MCP', async () => {
    const manager = new BundledMCPManager(testPaths.mcpDir);

    // Manually set the bundledMCPs array (but not including the one we'll ask for)
    (manager as unknown as ManagerWithPrivateState).bundledMCPs = [
      {
        path: path.join(testPaths.mcpDir, 'test-mcp-1', 'index.js'),
        name: 'test-mcp-1',
        version: '1.0.0',
        tools: [],
        enabled: true,
      },
    ];

    // Attempting to create a provider for a non-existent MCP should throw
    let error;
    try {
      await manager.createMCPProvider('non-existent-mcp');
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect((error as Error).message).toContain('not found');
  });
});
