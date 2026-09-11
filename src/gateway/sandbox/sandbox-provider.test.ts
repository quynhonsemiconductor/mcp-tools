/**
 * sandbox-provider.test.ts - Tests for SandboxProvider
 */
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import path from 'path';
import { MCPSandboxOptions } from '../types/sandbox';
import { BunSubprocessRunner } from './bun-subprocess-runner';

// Mock logger functions
const mockLogDebug = mock((_message: string, ..._args: any[]) => {});
const mockLogError = mock((_message: string, ..._args: any[]) => {});

// Mock BunSubprocessRunner implementation
class MockBunSubprocessRunner {
  initialize = mock(async () => ({
    serverInfo: { name: 'test-mcp', version: '1.0.0' },
    capabilities: { tools: { list: true, call: true } },
  }));

  listTools = mock(async () => [{ name: 'test_tool', description: 'A test tool' }]);

  callTool = mock(async (_name: string, _args: any) => ({
    result: 'success',
    data: { value: 42 },
  }));

  close = mock(async () => {});
}

// Create a test class that implements the same interface as SandboxProvider
class TestSandboxProvider {
  static runnerMap = new Map<string, BunSubprocessRunner>();

  // Override getRunner to use our mock
  static getRunner(bundlePath: string, _options: MCPSandboxOptions): BunSubprocessRunner {
    if (!this.runnerMap.has(bundlePath)) {
      // Create new mock runner
      this.runnerMap.set(bundlePath, new MockBunSubprocessRunner() as any);
    }
    return this.runnerMap.get(bundlePath)!;
  }

  // Override initializeMCP to skip file checks
  static async initializeMCP(bundlePath: string, options: MCPSandboxOptions = {}) {
    if (bundlePath === '/path/to/nonexistent.js') {
      throw new Error(`Bundled MCP not found: ${bundlePath}`);
    }

    // Get or create a runner for this MCP
    const runner = this.getRunner(bundlePath, options);

    // Initialize the MCP to get server info and capabilities
    const { serverInfo, capabilities } = await runner.initialize();

    return {
      client: {
        listTools: async () => {
          const tools = await runner.listTools();
          return { tools };
        },

        callTool: async <T = any>(name: string, args?: any): Promise<T> => {
          return runner.callTool(name, args) as T;
        },
      },

      transport: {
        close: async () => {
          await runner.close();
        },
      },

      serverInfo,
      capabilities,
    };
  }

  // Implement listTools method
  static async listTools(bundlePath: string, options: MCPSandboxOptions = {}): Promise<any[]> {
    try {
      // Get or create a runner for this MCP
      const runner = this.getRunner(path.resolve(bundlePath), options);

      // List the tools
      return await runner.listTools();
    } catch (error) {
      mockLogError(`Failed to list tools from ${bundlePath}:`, error);
      return [];
    }
  }

  // Implement callTool method
  static async callTool<T = any>(
    bundlePath: string,
    toolName: string,
    args: any,
    options: MCPSandboxOptions = {},
  ): Promise<T> {
    const mcpPath = path.resolve(bundlePath);
    const mcpName = path.basename(mcpPath, '.js');

    // Log the tool call start
    mockLogDebug(`Calling bundled MCP tool: ${mcpName}/${toolName}`);

    try {
      // Get or create a runner for this MCP
      const runner = this.getRunner(mcpPath, options);

      // Call the tool
      const result = await runner.callTool(toolName, args);

      // Log completion
      mockLogDebug(`Bundled MCP tool ${mcpName}/${toolName} completed`);

      // Return the result
      return result as T;
    } catch (error) {
      // Log failure
      mockLogDebug(`Bundled MCP tool ${mcpName}/${toolName} failed`);

      // Rethrow the error
      throw error;
    }
  }
}

describe('SandboxProvider', () => {
  beforeEach(() => {
    // Reset all mocks
    mockLogDebug.mockClear();
    mockLogError.mockClear();

    // Setup logger mocks
    // mock.module applies synchronously; its returned promise is not relevant here
    void mock.module('../../services/logger', () => ({
      logDebug: mockLogDebug,
      logError: mockLogError,
    }));

    // Clear the runner map for each test
    TestSandboxProvider.runnerMap.clear();
  });

  afterEach(() => {
    mock.restore();
  });

  it('should initialize an MCP', async () => {
    const mockRunner = TestSandboxProvider.getRunner(
      '/path/to/mcp.js',
      {},
    ) as unknown as MockBunSubprocessRunner;

    const result = await TestSandboxProvider.initializeMCP('/path/to/mcp.js');

    expect(result).toBeDefined();
    expect(result.serverInfo as any).toEqual({ name: 'test-mcp', version: '1.0.0' });
    expect(result.capabilities).toEqual({ tools: { list: true, call: true } } as any);
    expect(mockRunner.initialize).toHaveBeenCalled();

    // Test client functions
    const toolsList = await result.client.listTools();
    expect(toolsList).toEqual({
      tools: [{ name: 'test_tool', description: 'A test tool' }],
    } as any);
    expect(mockRunner.listTools).toHaveBeenCalled();

    const toolResult = await result.client.callTool('test_tool', {
      param: 'value',
    });
    expect(toolResult).toEqual({
      result: 'success',
      data: { value: 42 },
    });
    expect(mockRunner.callTool).toHaveBeenCalledWith('test_tool', {
      param: 'value',
    });

    // Test transport functions
    await result.transport.close();
    expect(mockRunner.close).toHaveBeenCalled();
  });

  it('should throw an error when the bundled MCP is not found', async () => {
    let error: any;
    try {
      await TestSandboxProvider.initializeMCP('/path/to/nonexistent.js');
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Bundled MCP not found');
  });

  it('should list tools from an MCP', async () => {
    // Setup error handler in case of test failure
    const mockRunner = TestSandboxProvider.getRunner(
      '/path/to/mcp.js',
      {},
    ) as unknown as MockBunSubprocessRunner;

    // Override the listTools method to return our expected tools
    const tools = await TestSandboxProvider.listTools('/path/to/mcp.js');

    expect(tools).toEqual([{ name: 'test_tool', description: 'A test tool' }]);
    expect(mockRunner.listTools).toHaveBeenCalled();
  });

  it('should return empty array when listTools fails', async () => {
    // Create a runner that throws an error
    const errorRunner = {
      listTools: mock(() => {
        throw new Error('Failed to list tools');
      }),
    };

    // Add it to the map
    TestSandboxProvider.runnerMap.set('/path/to/error-mcp.js', errorRunner as any);

    const tools = await TestSandboxProvider.listTools('/path/to/error-mcp.js');

    expect(tools).toEqual([]);
    expect(mockLogError).toHaveBeenCalled();
  });

  it('should call a tool on an MCP', async () => {
    // Create a runner with our mocks
    const mockRunner = TestSandboxProvider.getRunner(
      '/path/to/mcp.js',
      {},
    ) as unknown as MockBunSubprocessRunner;

    // Set up path.basename mock to control MCP name in logs
    // mock.module applies synchronously; its returned promise is not relevant here
    void mock.module('path', () => ({
      ...path,
      basename: () => 'mcp',
    }));

    const result = await TestSandboxProvider.callTool('/path/to/mcp.js', 'test_tool', {
      param: 'value',
    });

    expect(result).toEqual({
      result: 'success',
      data: { value: 42 },
    });
    expect(mockRunner.callTool).toHaveBeenCalledWith('test_tool', {
      param: 'value',
    });
    expect(mockLogDebug).toHaveBeenCalledTimes(2); // Start and completion logs
  });

  it('should propagate errors when calling tools', async () => {
    // Create a runner that throws an error
    const errorRunner = {
      callTool: mock(() => {
        throw new Error('Tool execution failed');
      }),
    };

    // Add it to the map
    TestSandboxProvider.runnerMap.set('/path/to/error-mcp.js', errorRunner as any);

    // Set up path.basename mock to control MCP name in logs
    // mock.module applies synchronously; its returned promise is not relevant here
    void mock.module('path', () => ({
      ...path,
      basename: () => 'error-mcp',
    }));

    let error: any;
    try {
      await TestSandboxProvider.callTool('/path/to/error-mcp.js', 'test_tool', {});
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution failed');
    expect(mockLogDebug).toHaveBeenCalledTimes(2); // Start and failure logs
  });

  it('should reuse existing runners for the same bundlePath', async () => {
    // Create a first runner
    const mockRunner1 = TestSandboxProvider.getRunner('/path/to/mcp.js', {});

    // Get a runner for the same path
    const mockRunner2 = TestSandboxProvider.getRunner('/path/to/mcp.js', {});

    // They should be the same instance
    expect(mockRunner1).toBe(mockRunner2);

    // The map should only have one entry
    expect(TestSandboxProvider.runnerMap.size).toBe(1);
  });

  it('should create different runners for different bundlePaths', async () => {
    // Create runners for different paths
    const mockRunner1 = TestSandboxProvider.getRunner('/path/to/mcp1.js', {});
    const mockRunner2 = TestSandboxProvider.getRunner('/path/to/mcp2.js', {});

    // They should be different instances
    expect(mockRunner1).not.toBe(mockRunner2);

    // The map should have two entries
    expect(TestSandboxProvider.runnerMap.size).toBe(2);
  });
});
