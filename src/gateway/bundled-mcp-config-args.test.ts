/**
 * bundled-mcp-config-args.test.ts - Tests for bundled MCP config-based CLI arguments
 */
import { beforeEach, describe, expect, it, mock, type Mock } from 'bun:test';
import type { QnscMcpConfig } from '../config';
import type { ToolRegistryManager } from '../registry';
import type { ToolConfig, ToolConstructor } from '../registry/types';
import type { BundledMCPInfo } from './types/bundle';
import type { MCPSandboxOptions } from './types/sandbox';

/**
 * Test double for ToolRegistryManager, typed against just the two methods
 * BundledMCPManager.registerWithToolRegistry actually calls, so tests can
 * still inspect `.mock.calls` without an `any`-typed stand-in.
 */
interface MockRegistry {
  getConfig: Mock<() => QnscMcpConfig>;
  registerTool: Mock<(id: string, config: ToolConfig, handlerClass: ToolConstructor) => void>;
}

/**
 * Test-only view of BundledMCPManager exposing its private `bundledMCPs`
 * field, so tests can seed it directly without going through discovery and
 * without resorting to an `any` cast.
 */
type ManagerWithPrivateState = { bundledMCPs: BundledMCPInfo[] };

describe('BundledMCPManager - Config-Based CLI Arguments', () => {
  let mockRegistry: MockRegistry;
  let mockConfig: QnscMcpConfig;

  beforeEach(() => {
    mock.restore();

    mockConfig = {
      tools: {
        includeMCPs: ['test-mcp'],
        mcpArgs: {},
      },
    } as QnscMcpConfig;

    mockRegistry = {
      getConfig: mock(() => mockConfig),
      registerTool: mock(() => {}),
    };
  });

  it('should merge base args with config args', async () => {
    mockConfig.tools!.mcpArgs = {
      'test-mcp': ['--verbose', '--debug'],
    };

    const testMcp: BundledMCPInfo = {
      path: '/test/path.js',
      name: 'test-mcp',
      version: '1.0.0',
      tools: [
        {
          name: 'test-tool',
          description: 'Test tool',
          schema: { type: 'object', properties: {} },
        },
      ],
      enabled: true,
      args: ['--stdio'],
    };

    let capturedArgs: string[] | undefined;

    await mock.module('./sandbox/sandbox-provider', () => ({
      SandboxProvider: {
        callTool: mock((_path: string, _toolName: string, _args: unknown, options: MCPSandboxOptions) => {
          capturedArgs = options.args;
          return Promise.resolve({ success: true });
        }),
      },
    }));

    const { BundledMCPManager } = await import('./bundled-mcp-manager');
    const manager = new BundledMCPManager('/test/dir');

    // Manually set the discovered MCPs for testing
    (manager as unknown as ManagerWithPrivateState).bundledMCPs = [testMcp];

    await manager.registerWithToolRegistry(mockRegistry as unknown as ToolRegistryManager);

    // Execute the tool to trigger args merging
    const toolHandler = mockRegistry.registerTool.mock.calls[0][2];
    const handler = new toolHandler();
    await handler.execute({});

    expect(capturedArgs).toEqual(['--stdio', '--verbose', '--debug']);
  });

  it('should work with only base args (no config args)', async () => {
    // No mcpArgs in config
    delete mockConfig.tools!.mcpArgs;

    const testMcp: BundledMCPInfo = {
      path: '/test/path.js',
      name: 'test-mcp',
      version: '1.0.0',
      tools: [
        {
          name: 'test-tool',
          description: 'Test tool',
          schema: { type: 'object', properties: {} },
        },
      ],
      enabled: true,
      args: ['--stdio'],
    };

    let capturedArgs: string[] | undefined;

    await mock.module('./sandbox/sandbox-provider', () => ({
      SandboxProvider: {
        callTool: mock((_path: string, _toolName: string, _args: unknown, options: MCPSandboxOptions) => {
          capturedArgs = options.args;
          return Promise.resolve({ success: true });
        }),
      },
    }));

    const { BundledMCPManager } = await import('./bundled-mcp-manager');
    const manager = new BundledMCPManager('/test/dir');
    (manager as unknown as ManagerWithPrivateState).bundledMCPs = [testMcp];

    await manager.registerWithToolRegistry(mockRegistry as unknown as ToolRegistryManager);

    const toolHandler = mockRegistry.registerTool.mock.calls[0][2];
    const handler = new toolHandler();
    await handler.execute({});

    expect(capturedArgs).toEqual(['--stdio']);
  });

  it('should work with only config args (no base args)', async () => {
    mockConfig.tools!.mcpArgs = {
      'test-mcp': ['--headless'],
    };

    const testMcp: BundledMCPInfo = {
      path: '/test/path.js',
      name: 'test-mcp',
      version: '1.0.0',
      tools: [
        {
          name: 'test-tool',
          description: 'Test tool',
          schema: { type: 'object', properties: {} },
        },
      ],
      enabled: true,
      // No args field
    };

    let capturedArgs: string[] | undefined;

    await mock.module('./sandbox/sandbox-provider', () => ({
      SandboxProvider: {
        callTool: mock((_path: string, _toolName: string, _args: unknown, options: MCPSandboxOptions) => {
          capturedArgs = options.args;
          return Promise.resolve({ success: true });
        }),
      },
    }));

    const { BundledMCPManager } = await import('./bundled-mcp-manager');
    const manager = new BundledMCPManager('/test/dir');
    (manager as unknown as ManagerWithPrivateState).bundledMCPs = [testMcp];

    await manager.registerWithToolRegistry(mockRegistry as unknown as ToolRegistryManager);

    const toolHandler = mockRegistry.registerTool.mock.calls[0][2];
    const handler = new toolHandler();
    await handler.execute({});

    expect(capturedArgs).toEqual(['--headless']);
  });

  it('should work with no args at all', async () => {
    delete mockConfig.tools!.mcpArgs;

    const testMcp: BundledMCPInfo = {
      path: '/test/path.js',
      name: 'test-mcp',
      version: '1.0.0',
      tools: [
        {
          name: 'test-tool',
          description: 'Test tool',
          schema: { type: 'object', properties: {} },
        },
      ],
      enabled: true,
    };

    let capturedArgs: string[] | undefined;

    await mock.module('./sandbox/sandbox-provider', () => ({
      SandboxProvider: {
        callTool: mock((_path: string, _toolName: string, _args: unknown, options: MCPSandboxOptions) => {
          capturedArgs = options.args;
          return Promise.resolve({ success: true });
        }),
      },
    }));

    const { BundledMCPManager } = await import('./bundled-mcp-manager');
    const manager = new BundledMCPManager('/test/dir');
    (manager as unknown as ManagerWithPrivateState).bundledMCPs = [testMcp];

    await manager.registerWithToolRegistry(mockRegistry as unknown as ToolRegistryManager);

    const toolHandler = mockRegistry.registerTool.mock.calls[0][2];
    const handler = new toolHandler();
    await handler.execute({});

    expect(capturedArgs).toEqual([]);
  });

  it('should handle empty config args array', async () => {
    mockConfig.tools!.mcpArgs = {
      'test-mcp': [],
    };

    const testMcp: BundledMCPInfo = {
      path: '/test/path.js',
      name: 'test-mcp',
      version: '1.0.0',
      tools: [
        {
          name: 'test-tool',
          description: 'Test tool',
          schema: { type: 'object', properties: {} },
        },
      ],
      enabled: true,
      args: ['--stdio'],
    };

    let capturedArgs: string[] | undefined;

    await mock.module('./sandbox/sandbox-provider', () => ({
      SandboxProvider: {
        callTool: mock((_path: string, _toolName: string, _args: unknown, options: MCPSandboxOptions) => {
          capturedArgs = options.args;
          return Promise.resolve({ success: true });
        }),
      },
    }));

    const { BundledMCPManager } = await import('./bundled-mcp-manager');
    const manager = new BundledMCPManager('/test/dir');
    (manager as unknown as ManagerWithPrivateState).bundledMCPs = [testMcp];

    await manager.registerWithToolRegistry(mockRegistry as unknown as ToolRegistryManager);

    const toolHandler = mockRegistry.registerTool.mock.calls[0][2];
    const handler = new toolHandler();
    await handler.execute({});

    expect(capturedArgs).toEqual(['--stdio']);
  });
});
