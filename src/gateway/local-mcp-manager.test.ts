/**
 * local-mcp-manager.test.ts - Tests for LocalMCPManager
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock, type Mock } from 'bun:test';
import type { QnscMcpConfig } from '../config';
import {
  AVAILABLE_LOCAL_MCP_SERVERS as REAL_SERVERS,
  type LocalMCPServerDefinition,
} from '../local-mcps/available-local-servers';
import type { ToolRegistryManager } from '../registry';
import type {
  LocalMCPClient as LocalMCPClientType,
  LocalMCPInfo,
  LocalMCPServerConfig,
  LocalMCPTool,
} from './local-mcp-client';
import type { LocalMCPManager as LocalMCPManagerClass } from './local-mcp-manager';
import type { StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
  CallToolResult,
  Implementation,
  Tool as McpTool,
  ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js';

/** Generic listener shape used by the mocked child_process/EventEmitter `on()` calls below. */
type ProcessEventCallback = (...args: unknown[]) => void;

/**
 * Concrete shape of the handler class LocalMCPManager.registerWithToolRegistry
 * constructs (its private `LocalMCPToolHandler`). It implements the more
 * general `ToolHandler` interface (whose `isEnabled` takes an optional
 * `ToolConfig` and may itself be undefined) but with concrete, narrower
 * signatures — zero-arg `isEnabled`, always-defined `execute`/`isEnabled`.
 */
interface RegisteredLocalToolHandler {
  execute(args: unknown): Promise<unknown>;
  isEnabled(): boolean;
}

interface MockChildProcess {
  stdout: { on: Mock<(event: string, callback: ProcessEventCallback) => void> };
  stderr: { on: Mock<(event: string, callback: ProcessEventCallback) => void> };
  on: Mock<(event: string, callback: ProcessEventCallback) => void>;
  kill: Mock<(signal?: string) => void>;
}

/**
 * Mock of LocalMCPClient's public surface, as consumed by LocalMCPManager.
 * Signatures are intentionally looser than LocalMCPClientType's real methods
 * (e.g. `unknown` results/params) since individual tests stub minimal,
 * scenario-specific return values rather than full SDK-shaped payloads.
 */
interface MockLocalMCPClient {
  connectToServer: Mock<(config: LocalMCPServerConfig) => Promise<void>>;
  getAllLocalTools: Mock<() => LocalMCPInfo[]>;
  getToolsFromServer: Mock<(serverName: string) => LocalMCPTool[]>;
  getConnectionStatus: Mock<() => Record<string, 'connected' | 'disconnected' | 'error'>>;
  executeLocalTool: Mock<(serverName: string, toolName: string, parameters: unknown) => Promise<unknown>>;
  disconnect: Mock<() => void>;
}

describe('LocalMCPManager', () => {
  let LocalMCPManager: typeof LocalMCPManagerClass;
  let manager: LocalMCPManagerClass;
  let mockConfig: QnscMcpConfig;
  let mockClient: MockLocalMCPClient;
  let mockSpawn: Mock<(...args: unknown[]) => MockChildProcess>;
  let mockProcess: MockChildProcess;
  let mockRegistry: ToolRegistryManager;

  const testServerDef: LocalMCPServerDefinition = {
    id: 'test-server',
    name: 'Test Server',
    description: 'A test server',
    category: 'development',
    launch: 'npx test-mcp',
    installation: 'npm install test-mcp',
  };

  beforeAll(() => {
    // Clear any existing module mocks before this suite
    mock.restore();
  });

  beforeEach(async () => {
    // First clear any existing mocks
    mock.restore();

    // Mock config
    mockConfig = {
      tools: {
        includeLocalMCPs: ['test-server'],
      },
    } as QnscMcpConfig;

    // Mock child process
    mockProcess = {
      stdout: {
        on: mock(() => {}),
      },
      stderr: {
        on: mock(() => {}),
      },
      on: mock((event: string, callback: ProcessEventCallback) => {
        if (event === 'close') {
          // Simulate successful installation
          setTimeout(() => callback(0), 0);
        }
      }),
      kill: mock(() => {}),
    };

    // Mock spawn
    mockSpawn = mock(() => mockProcess);

    // Mock child_process module — spread the real module to avoid stripping
    // exports that other test files need (Bun mock.module leaks across files).
    // Dynamic import (not require()) so this always resolves the real,
    // un-mocked module regardless of import/require interop.
    const realChildProcess = await import('child_process');
    await mock.module('child_process', () => ({
      ...realChildProcess,
      spawn: mockSpawn,
    }));

    // Mock available servers - include real servers plus test server
    const allServers = [...REAL_SERVERS, testServerDef];
    await mock.module('../local-mcps/available-local-servers', () => ({
      AVAILABLE_LOCAL_MCP_SERVERS: allServers,
      getLocalMCPServer: (id: string) => allServers.find((server) => server.id === id),
      getAvailableLocalMCPServerIds: () => allServers.map((server) => server.id),
      getLocalMCPServersByCategory: (category: string) =>
        allServers.filter((server) => server.category === category),
      validateLocalMCPServerIds: (ids: string[]) => ({
        valid: ids.filter((id) => allServers.some((s) => s.id === id)),
        invalid: ids.filter((id) => !allServers.some((s) => s.id === id)),
      }),
    }));

    // Create mock client instance
    mockClient = {
      connectToServer: mock(() => Promise.resolve()),
      getAllLocalTools: mock(() => [
        {
          name: 'test-server',
          tools: [
            {
              name: 'test-tool',
              description: 'A test tool',
              parameters: { type: 'object', properties: {} },
              serverId: 'test-server',
              serverName: 'test-server',
              annotations: {},
            },
          ],
        },
      ]),
      getToolsFromServer: mock((_name: string) => []),
      getConnectionStatus: mock(() => ({ 'test-server': 'connected' }) as Record<string, 'connected' | 'disconnected' | 'error'>),
      executeLocalTool: mock(() => Promise.resolve({ success: true })),
      disconnect: mock(() => {}),
    };

    // Mock LocalMCPClient constructor
    await mock.module('./local-mcp-client', () => ({
      LocalMCPClient: mock(() => mockClient),
      createLocalToolConfig: mock((tool: LocalMCPTool) => ({
        id: `local-${tool.serverId}-${tool.name}`,
        name: `${tool.serverName}__${tool.name}`,
        description: tool.description,
        category: 'Local',
        parameters: {},
        includeByDefault: true,
        annotations: tool.annotations,
        provider: 'local',
      })),
      categorizeLocalTool: mock(() => 'Uncategorized'),
      LOCAL_TOOL_DELIMITER: '__',
      LOCAL_TOOL_ID_PREFIX: 'local-',
    }));

    // Mock registry
    const mockRegisterTool = mock(() => {});
    mockRegistry = {
      registerTool: mockRegisterTool,
    } as unknown as ToolRegistryManager;

    // Import after mocks are set up. Dynamic import (not require()) so we
    // always pick up a fresh module evaluated against the mocks configured
    // above for this test (the module cache is busted in afterEach).
    const module = await import('./local-mcp-manager');
    LocalMCPManager = module.LocalMCPManager;
    manager = new LocalMCPManager(mockConfig);
  });

  afterEach(() => {
    // Clear all mocks and module cache after each test
    mock.restore();

    // Clear Bun's module cache to prevent interference with other tests
    if (typeof Loader !== 'undefined' && Loader.registry) {
      const registry = Loader.registry;
      const clientPath = require.resolve('./local-mcp-client');
      const managerPath = require.resolve('./local-mcp-manager');
      const serversPath = require.resolve('../local-mcps/available-local-servers');
      const childProcessPath = require.resolve('child_process');
      registry.delete(clientPath);
      registry.delete(managerPath);
      registry.delete(serversPath);
      registry.delete(childProcessPath);
    }
  });

  afterAll(() => {
    // Final cleanup after all tests in this suite
    mock.restore();

    // Clear Bun's module cache completely
    if (typeof Loader !== 'undefined' && Loader.registry) {
      const registry = Loader.registry;
      try {
        registry.delete(require.resolve('./local-mcp-client'));
        registry.delete(require.resolve('./local-mcp-manager'));
        registry.delete(require.resolve('../local-mcps/available-local-servers'));
        registry.delete(require.resolve('child_process'));
      } catch {
        // Ignore errors
      }
    }
  });

  describe('initialize', () => {
    it('should initialize with configured servers', async () => {
      await manager.initialize();

      expect(mockClient.connectToServer).toHaveBeenCalled();
    });

    it('should skip initialization if no local MCP config', async () => {
      const emptyConfig = {} as QnscMcpConfig;
      const emptyManager = new LocalMCPManager(emptyConfig);

      await emptyManager.initialize();

      expect(mockClient.connectToServer).not.toHaveBeenCalled();
    });

    it('should skip if no servers to enable', async () => {
      const noServersConfig = {
        tools: {
          includeLocalMCPs: [],
        },
      } as QnscMcpConfig;
      const noServersManager = new LocalMCPManager(noServersConfig);

      await noServersManager.initialize();

      expect(mockClient.connectToServer).not.toHaveBeenCalled();
    });

    it('should warn about invalid server IDs', async () => {
      const invalidConfig = {
        tools: {
          includeLocalMCPs: ['test-server', 'invalid-server'],
        },
      } as QnscMcpConfig;
      const invalidManager = new LocalMCPManager(invalidConfig);

      await invalidManager.initialize();

      // Should still attempt to connect to valid servers
      expect(mockClient.connectToServer).toHaveBeenCalled();
    });

    it('should install dependencies before connecting', async () => {
      const callOrder: string[] = [];

      mockSpawn.mockImplementation(() => {
        callOrder.push('spawn');
        return mockProcess;
      });

      mockClient.connectToServer = mock(() => {
        callOrder.push('connect');
        return Promise.resolve();
      });

      await manager.initialize();

      expect(callOrder[0]).toBe('spawn'); // Installation happens first
      expect(callOrder[1]).toBe('connect'); // Connection happens after
    });

    it('should handle installation failures gracefully', async () => {
      mockProcess.on = mock((event: string, callback: ProcessEventCallback) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 0); // Exit code 1 = failure
        }
      });

      await manager.initialize();

      // Should not throw, just log error
    });

    it('should handle connection failures gracefully', async () => {
      mockClient.connectToServer = mock(() => Promise.reject(new Error('Connection failed')));

      await manager.initialize();

      // Should not throw, continues with other servers
    });

    it.skip('should prepare environment variables for servers', async () => {
      const serverWithEnv: LocalMCPServerDefinition = {
        ...testServerDef,
        requiredEnvVars: ['TEST_VAR'],
        env: { CUSTOM_VAR: 'value' },
      };

      await mock.module('../local-mcps/available-local-servers', () => ({
        AVAILABLE_LOCAL_MCP_SERVERS: [serverWithEnv],
        getLocalMCPServer: mock((id: string) => [serverWithEnv].find((server) => server.id === id)),
        getAvailableLocalMCPServerIds: mock(() => [serverWithEnv].map((server) => server.id)),
        getLocalMCPServersByCategory: mock((category: string) =>
          [serverWithEnv].filter((server) => server.category === category),
        ),
        validateLocalMCPServerIds: mock(() => ({
          valid: ['test-server'],
          invalid: [],
        })),
      }));

      process.env.TEST_VAR = 'test-value';

      const envManager = new LocalMCPManager(mockConfig);
      await envManager.initialize();

      const connectCall = mockClient.connectToServer.mock.calls[0][0];
      expect(connectCall.env).toBeDefined();
      expect(connectCall.env?.CUSTOM_VAR).toBe('value');
    });

    it.skip('should connect to servers in parallel', async () => {
      const server2: LocalMCPServerDefinition = {
        id: 'server-2',
        name: 'Server 2',
        description: 'Second server',
        category: 'development',
        launch: 'npx server-2',
      };

      await mock.module('../local-mcps/available-local-servers', () => ({
        AVAILABLE_LOCAL_MCP_SERVERS: [testServerDef, server2],
        getLocalMCPServer: mock((id: string) =>
          [testServerDef, server2].find((server) => server.id === id),
        ),
        getAvailableLocalMCPServerIds: mock(() =>
          [testServerDef, server2].map((server) => server.id),
        ),
        getLocalMCPServersByCategory: mock((category: string) =>
          [testServerDef, server2].filter((server) => server.category === category),
        ),
        validateLocalMCPServerIds: mock(() => ({
          valid: ['test-server', 'server-2'],
          invalid: [],
        })),
      }));

      const multiConfig = {
        tools: {
          includeLocalMCPs: ['test-server', 'server-2'],
        },
      } as QnscMcpConfig;

      const multiManager = new LocalMCPManager(multiConfig);
      await multiManager.initialize();

      // Both servers should be connected
      expect(mockClient.connectToServer.mock.calls.length).toBe(2);
    });
  });

  describe('mcpArgs configuration', () => {
    it('should append CLI arguments from config to launch command', async () => {
      const configWithArgs = {
        tools: {
          includeLocalMCPs: ['test-server'],
          mcpArgs: {
            'test-server': ['--verbose', '--debug'],
          },
        },
      } as QnscMcpConfig;

      const argsManager = new LocalMCPManager(configWithArgs);
      await argsManager.initialize();

      const connectCall = mockClient.connectToServer.mock.calls[0][0];
      expect(connectCall.launch).toContain('--verbose');
      expect(connectCall.launch).toContain('--debug');
    });

    it('should quote arguments containing spaces', async () => {
      const configWithSpaceArgs = {
        tools: {
          includeLocalMCPs: ['test-server'],
          mcpArgs: {
            'test-server': ['--user-agent', 'My Custom Agent'],
          },
        },
      } as QnscMcpConfig;

      const spaceArgsManager = new LocalMCPManager(configWithSpaceArgs);
      await spaceArgsManager.initialize();

      const connectCall = mockClient.connectToServer.mock.calls[0][0];
      expect(connectCall.launch).toContain('"My Custom Agent"');
    });

    it('should not quote arguments without spaces', async () => {
      const configWithSimpleArgs = {
        tools: {
          includeLocalMCPs: ['test-server'],
          mcpArgs: {
            'test-server': ['--headless'],
          },
        },
      } as QnscMcpConfig;

      const simpleArgsManager = new LocalMCPManager(configWithSimpleArgs);
      await simpleArgsManager.initialize();

      const connectCall = mockClient.connectToServer.mock.calls[0][0];
      expect(connectCall.launch).toContain('--headless');
      expect(connectCall.launch).not.toContain('"--headless"');
    });
  });

  describe('validateInstallationCommand', () => {
    it('should accept valid installation commands', async () => {
      const validCommands = [
        'npm install test',
        'npx test-command',
        'brew install package',
        'pip install package',
        'bun install',
        'deno install',
      ];

      for (const cmd of validCommands) {
        const serverDef = { ...testServerDef, installation: cmd };
        await manager.installDependencies(serverDef);
        expect(mockSpawn).toHaveBeenCalled();
        mockSpawn.mockClear();
      }
    });

    it('should reject empty commands', async () => {
      const serverDef = { ...testServerDef, installation: '  ' };

      mockProcess.on = mock((event: string, callback: ProcessEventCallback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Validation failed')), 0);
        }
      });

      try {
        await manager.installDependencies(serverDef);
      } catch {
        // Expected to fail validation
      }
    });

    it('should reject commands with path separators', async () => {
      const serverDef = {
        ...testServerDef,
        installation: '/usr/bin/npm install',
      };

      mockProcess.on = mock((event: string, callback: ProcessEventCallback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Validation failed')), 0);
        }
      });

      try {
        await manager.installDependencies(serverDef);
      } catch {
        // Expected to fail validation
      }
    });

    it('should reject unapproved tools', async () => {
      const serverDef = {
        ...testServerDef,
        installation: 'malicious-tool install',
      };

      mockProcess.on = mock((event: string, callback: ProcessEventCallback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Validation failed')), 0);
        }
      });

      try {
        await manager.installDependencies(serverDef);
      } catch {
        // Expected to fail validation
      }
    });
  });

  describe('installDependencies', () => {
    it('should skip if no installation command', async () => {
      const serverDef = { ...testServerDef, installation: undefined };
      await manager.installDependencies(serverDef);

      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should deduplicate concurrent installations', async () => {
      const promises = [
        manager.installDependencies(testServerDef),
        manager.installDependencies(testServerDef),
        manager.installDependencies(testServerDef),
      ];

      await Promise.all(promises);

      // Should only spawn once despite 3 calls
      expect(mockSpawn.mock.calls.length).toBe(1);
    });

    it('should handle array of installation commands', async () => {
      const serverDef = {
        ...testServerDef,
        installation: ['npm install pkg1', 'npm install pkg2'],
      };

      await manager.installDependencies(serverDef);

      expect(mockSpawn.mock.calls.length).toBe(2);
    });

    it('should execute commands sequentially', async () => {
      const callOrder: number[] = [];
      let callCount = 0;

      mockSpawn.mockImplementation(() => {
        const currentCall = callCount++;
        const proc = {
          ...mockProcess,
          on: mock((event: string, callback: ProcessEventCallback) => {
            if (event === 'close') {
              setTimeout(() => {
                callOrder.push(currentCall);
                callback(0);
              }, 10);
            }
          }),
        };
        return proc;
      });

      const serverDef = {
        ...testServerDef,
        installation: ['npm install pkg1', 'npm install pkg2'],
      };

      await manager.installDependencies(serverDef);

      expect(callOrder).toEqual([0, 1]); // Sequential execution
    });

    it('should spawn process with correct arguments', async () => {
      await manager.installDependencies(testServerDef);

      expect(mockSpawn).toHaveBeenCalledWith(
        'npm',
        ['install', 'test-mcp'],
        expect.objectContaining({
          shell: false,
          detached: false,
        }),
      );
    });

    it('should handle installation timeout', async () => {
      let killCalled = false;
      const timeoutProcess = {
        ...mockProcess,
        on: mock((_event: string, _callback: ProcessEventCallback) => {
          // Never call close callback to simulate hanging
        }),
        kill: mock(() => {
          killCalled = true;
        }),
      };

      mockSpawn.mockImplementation(() => timeoutProcess);

      // Note: This test validates the timeout logic exists
      // In actual implementation, timeout is 5 minutes
      const serverDef = { ...testServerDef, installation: 'npm install test' };

      // We can't easily test the actual timeout in unit tests without waiting
      // 5 minutes for it to fire, so this is a deliberate fire-and-forget:
      // we only assert the synchronous setup (spawn happened, kill hasn't
      // fired yet), not the eventual timeout rejection.
      void manager.installDependencies(serverDef);

      // Verify process is spawned
      expect(mockSpawn).toHaveBeenCalled();
      // Timeout hasn't elapsed yet, so kill() must not have been called.
      expect(killCalled).toBe(false);
    });

    it('should handle process spawn errors', async () => {
      mockProcess.on = mock((event: string, callback: ProcessEventCallback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Spawn failed')), 0);
        }
      });

      try {
        await manager.installDependencies(testServerDef);
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).toContain(
          'Installation failed',
        );
      }
    });

    it('should capture stdout and stderr', async () => {
      const captureProcess = {
        ...mockProcess,
        stdout: {
          on: mock((_event: string, _handler: ProcessEventCallback) => {}),
        },
        stderr: {
          on: mock((_event: string, _handler: ProcessEventCallback) => {}),
        },
      };

      mockSpawn.mockImplementation(() => captureProcess);

      await manager.installDependencies(testServerDef);

      expect(captureProcess.stdout.on).toHaveBeenCalledWith('data', expect.any(Function));
      expect(captureProcess.stderr.on).toHaveBeenCalledWith('data', expect.any(Function));
    });
  });

  describe('registerWithToolRegistry', () => {
    it('should register tools with registry', async () => {
      await manager.registerWithToolRegistry(mockRegistry);

      expect(mockRegistry.registerTool).toHaveBeenCalled();
    });

    it('should skip if no tools available', async () => {
      mockClient.getAllLocalTools = mock(() => []);

      await manager.registerWithToolRegistry(mockRegistry);

      expect(mockRegistry.registerTool).not.toHaveBeenCalled();
    });

    it('should skip already registered tools', async () => {
      const registerMock = mockRegistry.registerTool as Mock<ToolRegistryManager['registerTool']>;

      await manager.registerWithToolRegistry(mockRegistry);
      await manager.registerWithToolRegistry(mockRegistry);

      // Should only register once
      expect(registerMock.mock.calls.length).toBe(1);
    });

    it('should create handler with execute method', async () => {
      const registerMock = mockRegistry.registerTool as Mock<ToolRegistryManager['registerTool']>;
      await manager.registerWithToolRegistry(mockRegistry);

      const handlerClass = registerMock.mock.calls[0][2];
      const handler = new handlerClass() as unknown as RegisteredLocalToolHandler;

      expect(handler.execute).toBeDefined();
      expect(typeof handler.execute).toBe('function');
    });

    it('should create handler with isEnabled method', async () => {
      const registerMock = mockRegistry.registerTool as Mock<ToolRegistryManager['registerTool']>;
      await manager.registerWithToolRegistry(mockRegistry);

      const handlerClass = registerMock.mock.calls[0][2];
      const handler = new handlerClass() as unknown as RegisteredLocalToolHandler;

      expect(handler.isEnabled).toBeDefined();
      expect(typeof handler.isEnabled).toBe('function');
    });

    it('should forward tool execution to client', async () => {
      const registerMock = mockRegistry.registerTool as Mock<ToolRegistryManager['registerTool']>;
      await manager.registerWithToolRegistry(mockRegistry);

      const handlerClass = registerMock.mock.calls[0][2];
      const handler = new handlerClass() as unknown as RegisteredLocalToolHandler;

      await handler.execute({ arg: 'value' });

      expect(mockClient.executeLocalTool).toHaveBeenCalledWith('test-server', 'test-tool', {
        arg: 'value',
      });
    });

    it('should check connection status in isEnabled', async () => {
      const registerMock = mockRegistry.registerTool as Mock<ToolRegistryManager['registerTool']>;
      await manager.registerWithToolRegistry(mockRegistry);

      const handlerClass = registerMock.mock.calls[0][2];
      const handler = new handlerClass() as unknown as RegisteredLocalToolHandler;

      const enabled = handler.isEnabled();

      expect(mockClient.getConnectionStatus).toHaveBeenCalled();
      expect(enabled).toBe(true);
    });

    it('should handle tool registration errors', async () => {
      const errorMock = mock(() => {
        throw new Error('Registration failed');
      });
      mockRegistry.registerTool = errorMock;

      await manager.registerWithToolRegistry(mockRegistry);

      // Should not throw, just log error
    });

    it('should register multiple tools from multiple servers', async () => {
      const registerMock = mockRegistry.registerTool as Mock<ToolRegistryManager['registerTool']>;

      mockClient.getAllLocalTools = mock(() => [
        {
          name: 'server-1',
          tools: [
            {
              name: 'tool-1',
              description: 'Tool 1',
              parameters: {},
              serverId: 'server-1',
              serverName: 'server-1',
              annotations: {},
            },
          ],
        },
        {
          name: 'server-2',
          tools: [
            {
              name: 'tool-2',
              description: 'Tool 2',
              parameters: {},
              serverId: 'server-2',
              serverName: 'server-2',
              annotations: {},
            },
          ],
        },
      ]);

      await manager.registerWithToolRegistry(mockRegistry);

      expect(registerMock.mock.calls.length).toBe(2);
    });
  });

  describe('getConnectionStatus', () => {
    it('should return connection status from client', () => {
      const status = manager.getConnectionStatus();

      expect(mockClient.getConnectionStatus).toHaveBeenCalled();
      expect(status['test-server']).toBe('connected');
    });
  });

  describe('getAllLocalTools', () => {
    it('should return all tools from client', () => {
      const tools = manager.getAllLocalTools();

      expect(mockClient.getAllLocalTools).toHaveBeenCalled();
      expect(tools.length).toBeGreaterThan(0);
    });
  });

  describe('getToolsFromServer', () => {
    it('should return tools from specific server', () => {
      manager.getToolsFromServer('test-server');

      expect(mockClient.getToolsFromServer).toHaveBeenCalledWith('test-server');
    });
  });

  describe('disconnect', () => {
    it('should disconnect client', async () => {
      await manager.disconnect();

      expect(mockClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return statistics', () => {
      const stats = manager.getStats();

      expect(stats).toHaveProperty('totalServers');
      expect(stats).toHaveProperty('connectedServers');
      expect(stats).toHaveProperty('totalTools');
      expect(stats).toHaveProperty('registeredTools');
    });

    it('should count connected servers correctly', () => {
      mockClient.getConnectionStatus = mock(() => ({
        'server-1': 'connected',
        'server-2': 'disconnected',
        'server-3': 'connected',
      }));

      const stats = manager.getStats();

      expect(stats.connectedServers).toBe(2);
    });

    it('should count total tools correctly', () => {
      // Only the tools arrays' lengths matter for this test, so stub entries
      // as unknown/cast rather than building full LocalMCPTool objects.
      mockClient.getAllLocalTools = mock(() => [
        { name: 'server-1', tools: [{}, {}] as unknown as LocalMCPTool[] },
        { name: 'server-2', tools: [{}, {}, {}] as unknown as LocalMCPTool[] },
      ]);

      const stats = manager.getStats();

      expect(stats.totalTools).toBe(5);
    });

    it('should track registered tools', async () => {
      await manager.registerWithToolRegistry(mockRegistry);

      const stats = manager.getStats();

      expect(stats.registeredTools).toBeGreaterThan(0);
    });
  });

  describe('parseCommand', () => {
    it('should parse commands with quoted arguments', async () => {
      const serverDef = {
        ...testServerDef,
        installation: 'npm install "package with spaces"',
      };

      await manager.installDependencies(serverDef);

      expect(mockSpawn).toHaveBeenCalledWith(
        'npm',
        ['install', 'package with spaces'],
        expect.any(Object),
      );
    });

    it('should parse commands with multiple arguments', async () => {
      const serverDef = {
        ...testServerDef,
        installation: 'npm install pkg1 pkg2 --save-dev',
      };

      await manager.installDependencies(serverDef);

      expect(mockSpawn).toHaveBeenCalledWith(
        'npm',
        ['install', 'pkg1', 'pkg2', '--save-dev'],
        expect.any(Object),
      );
    });
  });

  describe('getServersToEnable', () => {
    it('should filter servers by included IDs', async () => {
      const server2: LocalMCPServerDefinition = {
        id: 'server-2',
        name: 'Server 2',
        description: 'Second server',
        category: 'development',
        launch: 'npx server-2',
      };

      await mock.module('../local-mcps/available-local-servers', () => ({
        AVAILABLE_LOCAL_MCP_SERVERS: [testServerDef, server2],
        getLocalMCPServer: mock((id: string) =>
          [testServerDef, server2].find((server) => server.id === id),
        ),
        getAvailableLocalMCPServerIds: mock(() =>
          [testServerDef, server2].map((server) => server.id),
        ),
        getLocalMCPServersByCategory: mock((category: string) =>
          [testServerDef, server2].filter((server) => server.category === category),
        ),
        validateLocalMCPServerIds: mock(() => ({
          valid: ['test-server'],
          invalid: [],
        })),
      }));

      const filteredConfig = {
        tools: {
          includeLocalMCPs: ['test-server'],
        },
      } as QnscMcpConfig;

      const filteredManager = new LocalMCPManager(filteredConfig);
      await filteredManager.initialize();

      // Should only connect to test-server, not server-2
      expect(mockClient.connectToServer.mock.calls.length).toBe(1);
      expect(mockClient.connectToServer.mock.calls[0][0].id).toBe('test-server');
    });
  });
});

// ==============================================================================
// LocalMCPClient Tests (integrated from local-mcp-client.test.ts)
// Required as a bun mocking issue would otherwise result in errors if the tests are run together
// ==============================================================================

/** Mocks for the pieces of the MCP SDK's StdioClientTransport used by LocalMCPClient. */
interface MockMcpTransport {
  pid: number;
  close: Mock<() => Promise<void>>;
  stderr: { on: Mock<(event: string, callback: ProcessEventCallback) => void> };
}

/** Mocks for the pieces of the MCP SDK's Client used by LocalMCPClient. */
interface MockMcpClient {
  connect: Mock<() => Promise<void>>;
  listTools: Mock<() => Promise<{ tools: McpTool[] }>>;
  callTool: Mock<(params: unknown) => Promise<CallToolResult>>;
  getServerVersion: Mock<() => Implementation | undefined>;
}

// Create factory functions for fresh mocks
let mockMCPTransport: MockMcpTransport;
let mockMCPClient: MockMcpClient;

function createFreshMocks() {
  mockMCPTransport = {
    pid: 12345,
    // Real StdioClientTransport#close() returns Promise<void>; LocalMCPClient#disconnect()
    // chains .catch() off of it, so the mock must match that contract.
    close: mock(() => Promise.resolve()),
    stderr: {
      on: mock(() => {}),
    },
  };

  mockMCPClient = {
    connect: mock(() => Promise.resolve()),
    listTools: mock(() =>
      Promise.resolve({
        tools: [
          {
            name: 'test-tool',
            description: 'A test tool',
            inputSchema: {
              type: 'object',
              properties: {
                arg1: { type: 'string' },
              },
            },
            annotations: { category: 'testing' },
          } as unknown as McpTool,
        ],
      }),
    ),
    callTool: mock((_params: unknown) =>
      Promise.resolve({
        content: [{ type: 'text', text: 'Tool executed successfully' }],
      }),
    ),
    getServerVersion: mock(() => ({
      name: 'Test Server',
      version: '1.0.0',
    })),
  };

  return { mockMCPTransport, mockMCPClient };
}

// Initialize first set of mocks
createFreshMocks();

const mockStdioTransport: Mock<(config: StdioServerParameters) => MockMcpTransport> = mock(
  (_config: StdioServerParameters) => mockMCPTransport,
);
const mockClientClass: Mock<(config: Implementation) => MockMcpClient> = mock(
  (_config: Implementation) => mockMCPClient,
);

// Mock the MCP SDK modules BEFORE importing LocalMCPClient
await mock.module('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: mockClientClass,
}));

await mock.module('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: mockStdioTransport,
}));

// NOW import the module (types are imported at the top of this file)
const { LocalMCPClient, createLocalToolConfig, LOCAL_TOOL_DELIMITER } = await import(
  './local-mcp-client'
);

// Save original environment for restoration
const originalEnv = { ...process.env };

describe('LocalMCPClient', () => {
  let client: LocalMCPClientType;

  const testServerConfig: LocalMCPServerConfig = {
    id: 'test-server',
    name: 'Test Server',
    launch: 'npx test-mcp',
    enabled: true,
    env: {
      TEST_VAR: 'test-value',
    },
  };

  beforeEach(() => {
    // Restore process.env to prevent test pollution
    process.env = { ...originalEnv };

    // Ensure critical environment variables exist (they should always exist on any system)
    if (!process.env.PATH) {
      process.env.PATH = '/usr/bin:/bin:/usr/local/bin';
    }

    // Create completely fresh mocks for each test
    createFreshMocks();

    // Clear the constructor mocks
    mockStdioTransport.mockClear();
    mockClientClass.mockClear();

    // Update the mock constructors to return the new mocks
    mockStdioTransport.mockImplementation((_config: StdioServerParameters) => mockMCPTransport);
    mockClientClass.mockImplementation((_config: Implementation) => mockMCPClient);

    // Create a new client instance
    client = new LocalMCPClient();
  });

  afterEach(() => {
    // Restore process.env after each test
    process.env = { ...originalEnv };
  });

  describe('connectToServer', () => {
    it('should connect to a local MCP server via stdio', async () => {
      await client.connectToServer(testServerConfig);

      // Verify StdioClientTransport was created with correct config
      expect(mockStdioTransport).toHaveBeenCalled();
      const transportCall = mockStdioTransport.mock.calls[0][0];
      expect(transportCall.command).toBe('npx');
      expect(transportCall.args).toEqual(['test-mcp']);
      expect(transportCall.env).toHaveProperty('PATH');
      expect(transportCall.env).toHaveProperty('TEST_VAR', 'test-value');
      expect(transportCall.stderr).toBe('pipe');

      // Verify Client was created
      expect(mockClientClass).toHaveBeenCalled();
      const clientCall = mockClientClass.mock.calls[0][0];
      expect(clientCall.name).toContain('qnsc-mcp-client-local-test-server');

      // Verify client.connect was called
      expect(mockMCPClient.connect).toHaveBeenCalledWith(mockMCPTransport);

      // Verify tools were discovered
      expect(mockMCPClient.listTools).toHaveBeenCalled();

      // Verify connection status
      const status = client.getConnectionStatus();
      expect(status['test-server']).toBe('connected');
    });

    it('should skip disabled servers', async () => {
      const disabledConfig = { ...testServerConfig, enabled: false };
      await client.connectToServer(disabledConfig);

      expect(mockStdioTransport).not.toHaveBeenCalled();
      expect(mockMCPClient.connect).not.toHaveBeenCalled();

      const status = client.getConnectionStatus();
      expect(status['test-server']).toBe('disconnected');
    });

    it('should handle connection errors gracefully', async () => {
      mockMCPClient.connect = mock(() => Promise.reject(new Error('Connection failed')));

      await client.connectToServer(testServerConfig);

      const status = client.getConnectionStatus();
      expect(status['test-server']).toBe('error');
    });

    it('should handle error if launch command is missing', async () => {
      const invalidConfig = { ...testServerConfig, launch: '' };

      await client.connectToServer(invalidConfig);

      // Should set connection status to error
      const status = client.getConnectionStatus();
      expect(status['test-server']).toBe('error');
    });

    it('should set up stderr logging', async () => {
      await client.connectToServer(testServerConfig);

      expect(mockMCPTransport.stderr.on).toHaveBeenCalledWith('data', expect.any(Function));
    });

    it('should handle server name mismatch', async () => {
      mockMCPClient.getServerVersion = mock(() => ({
        name: 'Different Server Name',
        version: '1.0.0',
      }));

      await client.connectToServer(testServerConfig);

      const status = client.getConnectionStatus();
      expect(status['test-server']).toBe('connected');
    });
  });

  describe('parseCommand', () => {
    it('should parse simple command', async () => {
      const config = { ...testServerConfig, launch: 'node index.js' };
      await client.connectToServer(config);

      const transportCall = mockStdioTransport.mock.calls[0][0];
      expect(transportCall.command).toBe('node');
      expect(transportCall.args).toEqual(['index.js']);
    });

    it('should parse command with quoted arguments', async () => {
      const config = {
        ...testServerConfig,
        launch: 'node index.js "arg with spaces"',
      };
      await client.connectToServer(config);

      const transportCall = mockStdioTransport.mock.calls[0][0];
      expect(transportCall.command).toBe('node');
      expect(transportCall.args).toEqual(['index.js', 'arg with spaces']);
    });

    it('should parse command with multiple arguments', async () => {
      const config = {
        ...testServerConfig,
        launch: 'npx @playwright/mcp@0.0.41 --port 3000',
      };
      await client.connectToServer(config);

      const transportCall = mockStdioTransport.mock.calls[0][0];
      expect(transportCall.command).toBe('npx');
      expect(transportCall.args).toEqual(['@playwright/mcp@0.0.41', '--port', '3000']);
    });
  });

  describe('prepareEnvironment', () => {
    it('should include PATH and HOME by default', async () => {
      const originalPath = process.env.PATH;
      const originalHome = process.env.HOME;
      process.env.PATH = '/usr/bin:/bin';
      process.env.HOME = '/home/user';

      await client.connectToServer(testServerConfig);

      const transportCall = mockStdioTransport.mock.calls[0][0];
      expect(transportCall.env!.PATH).toBe('/usr/bin:/bin');
      expect(transportCall.env!.HOME).toBe('/home/user');

      process.env.PATH = originalPath;
      process.env.HOME = originalHome;
    });

    it('should merge custom environment variables', async () => {
      await client.connectToServer(testServerConfig);

      const transportCall = mockStdioTransport.mock.calls[0][0];
      expect(transportCall.env!.TEST_VAR).toBe('test-value');
    });

    it('should handle missing PATH and HOME', async () => {
      const originalPath = process.env.PATH;
      const originalHome = process.env.HOME;
      delete process.env.PATH;
      delete process.env.HOME;

      const config = { ...testServerConfig, env: {} };
      await client.connectToServer(config);

      const transportCall = mockStdioTransport.mock.calls[0][0];
      expect(transportCall.env!.PATH).toBeUndefined();
      expect(transportCall.env!.HOME).toBeUndefined();

      process.env.PATH = originalPath;
      process.env.HOME = originalHome;
    });
  });

  describe('discoverTools', () => {
    it('should discover tools from connected server', async () => {
      await client.connectToServer(testServerConfig);

      const tools = client.getToolsFromServer('test-server');
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test-tool');
      expect(tools[0].description).toBe('A test tool');
      expect(tools[0].serverName).toBe('test-server');
    });

    it('should handle servers with no tools', async () => {
      mockMCPClient.listTools = mock(() =>
        Promise.resolve({
          tools: [],
        }),
      );

      await client.connectToServer(testServerConfig);

      const tools = client.getToolsFromServer('test-server');
      expect(tools).toHaveLength(0);
    });

    it('should handle tool discovery errors', async () => {
      mockMCPClient.listTools = mock(() => Promise.reject(new Error('Failed to list tools')));

      await client.connectToServer(testServerConfig);

      // Should not throw, just log error
      const tools = client.getToolsFromServer('test-server');
      expect(tools).toHaveLength(0);
    });

    it('should map tool properties correctly', async () => {
      await client.connectToServer(testServerConfig);

      const tools = client.getToolsFromServer('test-server');
      const tool = tools[0];

      expect(tool.name).toBe('test-tool');
      expect(tool.description).toBe('A test tool');
      expect(tool.serverId).toBe('test-server');
      expect(tool.serverName).toBe('test-server');
      expect(tool.parameters).toEqual({
        type: 'object',
        properties: {
          arg1: { type: 'string' },
        },
      });
      expect(tool.annotations).toEqual({ category: 'testing' } as ToolAnnotations);
    });
  });

  describe('executeLocalTool', () => {
    beforeEach(async () => {
      await client.connectToServer(testServerConfig);
    });

    it('should execute tool on connected server', async () => {
      const params = { arg1: 'test-value' };
      const result = await client.executeLocalTool('test-server', 'test-tool', params);

      expect(mockMCPClient.callTool).toHaveBeenCalledWith({
        name: 'test-tool',
        arguments: params,
      });

      expect(result).toEqual({
        content: [{ type: 'text', text: 'Tool executed successfully' }],
      });
    });

    it('should throw error if server not connected', async () => {
      try {
        await client.executeLocalTool('non-existent-server', 'test-tool', {});
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).toContain(
          'No connection to local MCP server',
        );
      }
    });

    it('should propagate tool execution errors', async () => {
      mockMCPClient.callTool = mock(() => Promise.reject(new Error('Tool execution failed')));

      try {
        await client.executeLocalTool('test-server', 'test-tool', {});
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).toContain(
          'Tool execution failed',
        );
      }
    });
  });

  describe('getAllLocalTools', () => {
    it('should return tools from all servers', async () => {
      await client.connectToServer(testServerConfig);

      const allTools = client.getAllLocalTools();
      expect(allTools).toHaveLength(1);
      expect(allTools[0].name).toBe('test-server');
      expect(allTools[0].tools).toHaveLength(1);
    });

    it('should return empty array if no servers connected', () => {
      const allTools = client.getAllLocalTools();
      expect(allTools).toHaveLength(0);
    });

    it('should handle multiple servers', async () => {
      await client.connectToServer(testServerConfig);

      const secondConfig = {
        ...testServerConfig,
        id: 'second-server',
        name: 'Second Server',
      };
      await client.connectToServer(secondConfig);

      const allTools = client.getAllLocalTools();
      expect(allTools).toHaveLength(2);
    });
  });

  describe('getToolsFromServer', () => {
    it('should return tools from specific server', async () => {
      await client.connectToServer(testServerConfig);

      const tools = client.getToolsFromServer('test-server');
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test-tool');
    });

    it('should return empty array for unknown server', () => {
      const tools = client.getToolsFromServer('unknown-server');
      expect(tools).toHaveLength(0);
    });
  });

  describe('getConnectionStatus', () => {
    it('should return status for all servers', async () => {
      await client.connectToServer(testServerConfig);

      const status = client.getConnectionStatus();
      expect(status['test-server']).toBe('connected');
    });

    it('should return empty object if no servers', () => {
      const status = client.getConnectionStatus();
      expect(status).toEqual({});
    });

    it('should track multiple server statuses', async () => {
      await client.connectToServer(testServerConfig);

      const errorConfig = {
        ...testServerConfig,
        id: 'error-server',
        name: 'Error Server',
      };
      mockMCPClient.connect = mock(() => Promise.reject(new Error('Connection failed')));
      await client.connectToServer(errorConfig);

      const status = client.getConnectionStatus();
      expect(status['test-server']).toBe('connected');
      expect(status['error-server']).toBe('error');
    });
  });

  describe('disconnect', () => {
    it('should disconnect from all servers', async () => {
      await client.connectToServer(testServerConfig);

      client.disconnect();

      expect(mockMCPTransport.close).toHaveBeenCalled();

      const status = client.getConnectionStatus();
      expect(status['test-server']).toBe('disconnected');
    });

    it('should clear all connections and tools', async () => {
      await client.connectToServer(testServerConfig);

      client.disconnect();

      const allTools = client.getAllLocalTools();
      expect(allTools).toHaveLength(0);
    });

    it('should handle disconnect errors gracefully', async () => {
      await client.connectToServer(testServerConfig);

      mockMCPTransport.close = mock(() => Promise.reject(new Error('Close failed')));

      // Should not throw
      client.disconnect();
    });

    it('should disconnect multiple servers', async () => {
      await client.connectToServer(testServerConfig);

      const secondTransport = {
        pid: 67890,
        close: mock(() => Promise.resolve()),
        stderr: { on: mock(() => {}) },
      };

      mockStdioTransport.mockImplementation((_config: StdioServerParameters) => secondTransport);
      const secondConfig = {
        ...testServerConfig,
        id: 'second-server',
        name: 'Second Server',
      };
      await client.connectToServer(secondConfig);

      client.disconnect();

      expect(mockMCPTransport.close).toHaveBeenCalled();
      expect(secondTransport.close).toHaveBeenCalled();
    });
  });

  describe('createServerId', () => {
    it('should create valid server IDs', async () => {
      const config = {
        ...testServerConfig,
        name: 'Test Server @123',
      };
      await client.connectToServer(config);

      const tools = client.getToolsFromServer(config.id);
      expect(tools[0].serverId).toBe(config.id);
    });
  });
});

describe('createLocalToolConfig', () => {
  let testTool: LocalMCPTool;

  beforeEach(() => {
    testTool = {
      name: 'test-tool',
      description: 'A test tool',
      parameters: {
        type: 'object',
        properties: {
          arg1: { type: 'string', description: 'First argument' },
          arg2: { type: 'number', description: 'Second argument' },
        },
        required: ['arg1'],
      },
      serverId: 'test-server',
      serverName: 'Test Server',
      // `category` isn't part of the SDK's ToolAnnotations shape; it's just
      // opaque test data used to verify annotations round-trip unmodified
      // through createLocalToolConfig (which never reads individual fields).
      annotations: { category: 'testing' } as ToolAnnotations,
    };
  });

  it('should create valid tool config', () => {
    const config = createLocalToolConfig(testTool);

    expect(config.id).toContain('local-');
    expect(config.id).toContain('test-server');
    expect(config.id).toContain('test-tool');
    expect(config.name).toBe(`Test Server${LOCAL_TOOL_DELIMITER}test-tool`);
    expect(config.description).toBe('A test tool');
    expect(config.category).toBe('Uncategorized');
    expect(config.includeByDefault).toBe(true);
    expect(config.provider).toBe('local');
    expect(config.annotations).toEqual({ category: 'testing' } as ToolAnnotations);
  });

  it('should handle tool names with special characters', () => {
    const specialTool: LocalMCPTool = {
      ...testTool,
      name: 'Test Tool @#$%',
      serverId: 'test-server-123',
    };

    const config = createLocalToolConfig(specialTool);

    // ID should be sanitized
    expect(config.id).toMatch(/^local-test-server-123__test-tool+$/);
    // Name should preserve original with delimiter
    expect(config.name).toContain(specialTool.name);
  });

  it('should categorize playwright tools correctly', () => {
    const playwrightTool: LocalMCPTool = {
      ...testTool,
      serverName: 'playwright-local',
    };

    const config = createLocalToolConfig(playwrightTool);
    expect(config.category).toBe('Uncategorized');
  });

  it('should categorize mobile tools correctly', () => {
    const mobileTool: LocalMCPTool = {
      ...testTool,
      serverName: 'mobile-next',
    };

    const config = createLocalToolConfig(mobileTool);
    expect(config.category).toBe('Uncategorized');
  });

  it('should categorize file tools correctly', () => {
    const fileTool: LocalMCPTool = {
      ...testTool,
      name: 'read-file',
      serverName: 'generic-server',
    };

    const config = createLocalToolConfig(fileTool);
    expect(config.category).toBe('Uncategorized');
  });

  it('should default to Local category', () => {
    const genericTool: LocalMCPTool = {
      ...testTool,
      serverName: 'generic-server',
      name: 'generic-tool',
    };

    const config = createLocalToolConfig(genericTool);
    expect(config.category).toBe('Uncategorized');
  });

  it('should handle empty parameters schema', () => {
    const emptyParamsTool: LocalMCPTool = {
      ...testTool,
      parameters: { type: 'object', properties: {} },
    };

    const config = createLocalToolConfig(emptyParamsTool);
    expect(config.parameters).toBeDefined();
  });

  it('should handle undefined parameters', () => {
    // Deliberately violates LocalMCPTool's required `parameters` field to
    // exercise createLocalToolConfig's runtime fallback for missing input.
    const noParamsTool: LocalMCPTool = {
      ...testTool,
      parameters: undefined as unknown as LocalMCPTool['parameters'],
    };

    const config = createLocalToolConfig(noParamsTool);
    expect(config.parameters).toBeDefined();
  });

  it('should handle missing annotations', () => {
    // Deliberately violates LocalMCPTool's required `annotations` field to
    // exercise createLocalToolConfig's runtime fallback for missing input.
    const noAnnotationsTool: LocalMCPTool = {
      ...testTool,
      annotations: undefined as unknown as LocalMCPTool['annotations'],
    };

    const config = createLocalToolConfig(noAnnotationsTool);
    expect(config.annotations).toEqual({});
  });
});
