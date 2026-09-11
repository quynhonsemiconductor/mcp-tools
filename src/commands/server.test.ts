import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

import * as remotePolicyModule from '../gateway/remote-policy';
import { setupStandardMocks } from '../test-utils/mocks';

// Mock update-utils
const mockNotifyIfUpdateAvailable = mock(() => Promise.resolve());
void mock.module('../utils/update-utils', () => ({
  notifyIfUpdateAvailable: mockNotifyIfUpdateAvailable,
}));

// Mock architecture utils
const mockDisplayArchitectureMismatchWarning = mock(() => {});
void mock.module('../utils/architecture', () => ({
  displayArchitectureMismatchWarning: mockDisplayArchitectureMismatchWarning,
}));

// Mock MCP initializers
const mockInitializeBundledMCPs = mock(() => Promise.resolve());
const mockInitializeRemoteMCPs = mock(() => Promise.resolve(null));
const mockInitializeLocalMCPs = mock(() => Promise.resolve(null));
void mock.module('./bundled-mcp', () => ({
  initializeBundledMCPs: mockInitializeBundledMCPs,
}));
void mock.module('./remote-mcp', () => ({
  initializeRemoteMCPs: mockInitializeRemoteMCPs,
}));

// remote-policy is spied on (not mock.module'd) — mock.module replaces the
// module globally across the whole test process, and remote-policy.test.ts
// imports the same file (via a different relative path that resolves to the
// same module) and needs the real implementation. spyOn + mock.restore()
// (registered globally by test-utils/mocks) keeps this scoped per-test.
let mockFetchRemotePolicy: ReturnType<typeof spyOn>;
let mockApplyRemotePolicy: ReturnType<typeof spyOn>;

void mock.module('./local-mcp', () => ({
  initializeLocalMCPs: mockInitializeLocalMCPs,
}));

// Mock telemetry service
const mockTelemetryInitialize = mock(() => {});
const mockTelemetryRecordUsage = mock(() => {});
const mockTelemetrySetClientInfo = mock(() => {});
const mockTelemetryFlush = mock(() => Promise.resolve());
const mockTelemetryShutdown = mock(() => Promise.resolve());
const mockTelemetryGetClientName = mock((): string | undefined => undefined);
void mock.module('../services/telemetry', () => ({
  default: {
    initialize: mockTelemetryInitialize,
    recordUsage: mockTelemetryRecordUsage,
    setClientInfo: mockTelemetrySetClientInfo,
    getClientName: mockTelemetryGetClientName,
    flush: mockTelemetryFlush,
    shutdown: mockTelemetryShutdown,
  },
}));

// Mock MCP SDK
const mockConnect = mock(() => Promise.resolve());
const mockRegisterTool = mock((_name: string, _config: any, _handler: Function) => {});
const mockUnderlyingServer = {
  oninitialized: undefined as (() => void) | undefined,
  getClientVersion: mock(() => undefined),
  transport: undefined as { sessionId?: string } | undefined,
};
const mockMcpServerInstance = {
  connect: mockConnect,
  registerTool: mockRegisterTool,
  server: mockUnderlyingServer,
};
const MockMcpServer = mock(() => mockMcpServerInstance);
void mock.module('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: MockMcpServer,
}));

// Mock StdioServerTransport
const mockStdioTransportInstance = {};
const MockStdioServerTransport = mock(() => mockStdioTransportInstance);
void mock.module('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: MockStdioServerTransport,
}));

// ExpressStatefulMcpServer is spied on at the prototype (not mock.module'd) —
// mock.module replaces the module globally across the whole test process, and
// services/mcp/mcp-express.test.ts needs the real class to assert what gets
// passed to app.listen(). spyOn + mock.restore() keeps this scoped per-test.
// Spying out start()/shutdown() means no socket is ever opened here.
import { ExpressStatefulMcpServer } from '../services/mcp/mcp-express';
let mockExpressStart: ReturnType<typeof spyOn>;
let _mockExpressShutdown: ReturnType<typeof spyOn>;
// Captured from `this._config` inside the stubbed start(), so these tests still
// assert the exact config server.ts constructs.
let capturedExpressConfig: unknown;

const { mockLog, mockPromptRegistry, mockRegistry, mockResourceRegistry } = setupStandardMocks();

const mockLogWarn = mockLog.logWarn;

// Import ConfigValidator to spyOn (don't use mock.module as it pollutes other tests)
import { ConfigValidator } from '../services/validation';
let mockValidateQnscMcpConfig: ReturnType<typeof spyOn>;

// Registry mock aliases
const mockInitialize = mockRegistry.initialize;
const mockRegisterAllTools = mockRegistry.registerAllTools;
const mockGetAllTools = mockRegistry.getAllTools;
const mockGetCategories = mockRegistry.getCategories;
const mockPromptInitialize = mockPromptRegistry.initialize;
const mockRegisterAllPrompts = mockPromptRegistry.registerAllPrompts;
const mockResourceInitialize = mockResourceRegistry.initialize;
const mockRegisterAllResources = mockResourceRegistry.registerAllResources;

import { formatStartupError, startServer } from './server';

describe('Server Command', () => {
  let processExitSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Reset SDK mocks
    MockMcpServer.mockClear();
    mockConnect.mockClear().mockImplementation(() => Promise.resolve());
    mockRegisterTool.mockClear();
    MockStdioServerTransport.mockClear();
    capturedExpressConfig = undefined;
    mockExpressStart = spyOn(ExpressStatefulMcpServer.prototype, 'start').mockImplementation(
      function (this: any) {
        capturedExpressConfig = this._config;
      },
    );
    _mockExpressShutdown = spyOn(ExpressStatefulMcpServer.prototype, 'shutdown').mockImplementation(
      () => Promise.resolve(),
    );
    mockDisplayArchitectureMismatchWarning.mockClear();

    // Reset registry mocks
    mockInitialize.mockClear().mockImplementation(() => Promise.resolve());
    mockRegisterAllTools.mockClear();
    mockGetAllTools.mockClear();
    mockGetCategories.mockClear();
    mockPromptInitialize.mockClear().mockImplementation(() => Promise.resolve());
    mockRegisterAllPrompts.mockClear();
    mockResourceInitialize.mockClear().mockImplementation(() => Promise.resolve());
    mockRegisterAllResources.mockClear();

    // Reset MCP initializer mocks
    mockInitializeBundledMCPs.mockClear().mockImplementation(() => Promise.resolve());
    mockInitializeRemoteMCPs.mockClear().mockImplementation(() => Promise.resolve(null));
    mockInitializeLocalMCPs.mockClear().mockImplementation(() => Promise.resolve(null));
    mockFetchRemotePolicy = spyOn(remotePolicyModule, 'fetchRemotePolicy').mockImplementation(() =>
      Promise.resolve(remotePolicyModule.EMPTY_POLICY),
    );
    mockApplyRemotePolicy = spyOn(remotePolicyModule, 'applyRemotePolicy').mockImplementation((() =>
      Promise.resolve([])) as any,
    );

    // Reset telemetry mocks
    mockTelemetryInitialize.mockClear().mockImplementation(() => {});
    mockTelemetryRecordUsage.mockClear().mockImplementation(() => {});
    mockTelemetryGetClientName.mockClear().mockImplementation(() => undefined);
    mockTelemetryFlush.mockClear().mockImplementation(() => Promise.resolve());
    mockTelemetryShutdown.mockClear().mockImplementation(() => Promise.resolve());

    // Set up spy on ConfigValidator.validateQnscMcpConfig
    mockValidateQnscMcpConfig = spyOn(ConfigValidator, 'validateQnscMcpConfig').mockImplementation(
      () => Promise.resolve({ valid: true, issues: [] }),
    );
    mockLogWarn.mockClear();

    // Mock process.exit
    processExitSpy = spyOn(process, 'exit').mockImplementation((() => undefined) as any);

    // Setup default mock behavior
    mockUnderlyingServer.oninitialized = undefined;
    mockUnderlyingServer.getClientVersion.mockClear();
    mockUnderlyingServer.transport = undefined;
    mockGetAllTools.mockImplementation((filtered?: boolean) => {
      return filtered
        ? [{ id: 'tool1' }, { id: 'tool2' }]
        : [{ id: 'tool1' }, { id: 'tool2' }, { id: 'tool3' }];
    });

    mockGetCategories.mockReturnValue(['category1', 'category2']);
  });

  afterEach(() => {
    processExitSpy.mockRestore();
    mockValidateQnscMcpConfig.mockRestore();
  });

  describe('Transport Configuration', () => {
    it('should start a stdio server with default configuration', async () => {
      await startServer();

      expect(MockMcpServer).toHaveBeenCalledWith({
        name: 'QNSC MCP Server',
        version: '1.0.0',
      });

      // Should create StdioServerTransport and connect
      expect(MockStdioServerTransport).toHaveBeenCalled();
      expect(mockConnect).toHaveBeenCalledWith(mockStdioTransportInstance);

      // Verify registry initialization and registration
      expect(mockInitialize).toHaveBeenCalled();
      expect(mockPromptInitialize).toHaveBeenCalled();
      expect(mockResourceInitialize).toHaveBeenCalled();
      expect(mockRegisterAllTools).toHaveBeenCalledWith(expect.any(Object));
      expect(mockRegisterAllPrompts).toHaveBeenCalledWith(expect.anything());
      expect(mockRegisterAllResources).toHaveBeenCalledWith(expect.anything());
    });

    it('should configure a http streaming server with custom endpoint and port', async () => {
      await startServer('httpStream', '/custom-endpoint', 9000);

      expect(capturedExpressConfig).toEqual({
        port: 9000,
        host: '127.0.0.1',
        endpoint: '/custom-endpoint',
      });
      expect(mockExpressStart).toHaveBeenCalled();
    });

    it('should configure a http streaming server with default port', async () => {
      await startServer('httpStream');

      expect(capturedExpressConfig).toEqual({ port: 8081, host: '127.0.0.1', endpoint: '/mcp' });
      expect(mockExpressStart).toHaveBeenCalled();
    });

    it('should bind loopback by default when no host is given', async () => {
      await startServer('httpStream', '/mcp', 9001);

      expect(capturedExpressConfig).toEqual({ port: 9001, host: '127.0.0.1', endpoint: '/mcp' });
      expect(mockExpressStart).toHaveBeenCalled();
    });

    it('should pass through an explicit host to expose all interfaces', async () => {
      await startServer('httpStream', '/mcp', 9002, '0.0.0.0');

      expect(capturedExpressConfig).toEqual({ port: 9002, host: '0.0.0.0', endpoint: '/mcp' });
      expect(mockExpressStart).toHaveBeenCalled();
    });

    it('should enter rescue mode for an empty host', async () => {
      await startServer('httpStream', '/mcp', 9003, '   ');

      // Should register the rescue mode diagnostic tool
      expect(mockRegisterTool).toHaveBeenCalledTimes(1);
      expect(mockRegisterTool).toHaveBeenCalledWith(
        'startup-diagnostics',
        expect.objectContaining({
          description: expect.stringContaining('rescue mode'),
        }),
        expect.any(Function),
      );

      // In rescue mode, should fall back to stdio transport
      expect(MockStdioServerTransport).toHaveBeenCalled();
      expect(mockConnect).toHaveBeenCalled();
      expect(mockExpressStart).not.toHaveBeenCalled();
      expect(capturedExpressConfig).toBeUndefined();
    });

    it('should enter rescue mode for invalid transport type', async () => {
      await startServer('invalidTransport' as any);

      // Should register the rescue mode diagnostic tool
      expect(mockRegisterTool).toHaveBeenCalledTimes(1);
      expect(mockRegisterTool).toHaveBeenCalledWith(
        'startup-diagnostics',
        expect.objectContaining({
          description: expect.stringContaining('rescue mode'),
        }),
        expect.any(Function),
      );

      // In rescue mode, should fall back to stdio transport
      expect(MockStdioServerTransport).toHaveBeenCalled();
      expect(mockConnect).toHaveBeenCalled();
    });
  });

  describe('Rescue Mode', () => {
    it('should enter rescue mode when registry.initialize throws', async () => {
      const mockError = new Error('Tool loading failed: missing dependency');
      mockInitialize.mockImplementationOnce(() => Promise.reject(mockError));

      await startServer();

      // Should register ONLY the rescue mode tool
      expect(mockRegisterTool).toHaveBeenCalledTimes(1);
      expect(mockRegisterTool).toHaveBeenCalledWith(
        'startup-diagnostics',
        expect.objectContaining({
          description: expect.stringContaining('rescue mode'),
        }),
        expect.any(Function),
      );

      // Should still start the server via stdio
      expect(MockStdioServerTransport).toHaveBeenCalled();
      expect(mockConnect).toHaveBeenCalled();

      // Should NOT call normal registry registration functions
      expect(mockRegisterAllTools).not.toHaveBeenCalled();
    });

    it('should enter rescue mode when tool registration throws', async () => {
      const registrationError = new Error('Tool registration failed');
      mockRegisterAllTools.mockImplementationOnce(() => {
        throw registrationError;
      });

      await startServer();

      // The factory caught the error and registered the rescue tool
      expect(mockRegisterTool).toHaveBeenCalledTimes(1);
      expect(mockRegisterTool).toHaveBeenCalledWith(
        'startup-diagnostics',
        expect.objectContaining({
          description: expect.stringContaining('rescue mode'),
        }),
        expect.any(Function),
      );
      expect(mockConnect).toHaveBeenCalled();
    });

    it('should enter rescue mode when resource initialization throws', async () => {
      mockInitialize.mockImplementationOnce(() => Promise.resolve());
      mockPromptInitialize.mockImplementationOnce(() => Promise.resolve());

      const resourceError = new Error('Resource initialization failed');
      mockResourceInitialize.mockImplementationOnce(() => Promise.reject(resourceError));

      await startServer();

      expect(mockRegisterTool).toHaveBeenCalledTimes(1);
      expect(mockRegisterTool).toHaveBeenCalledWith(
        'startup-diagnostics',
        expect.objectContaining({
          description: expect.stringContaining('rescue mode'),
        }),
        expect.any(Function),
      );
      expect(mockConnect).toHaveBeenCalled();
    });

    it('should enter rescue mode when prompt registry initialization throws', async () => {
      mockInitialize.mockImplementationOnce(() => Promise.resolve());

      const promptError = new Error('Prompt registry initialization failed');
      mockPromptInitialize.mockImplementationOnce(() => Promise.reject(promptError));

      await startServer();

      expect(mockRegisterTool).toHaveBeenCalledTimes(1);
      expect(mockRegisterTool).toHaveBeenCalledWith(
        'startup-diagnostics',
        expect.objectContaining({
          description: expect.stringContaining('rescue mode'),
        }),
        expect.any(Function),
      );
      expect(mockConnect).toHaveBeenCalled();
    });

    it('should enter rescue mode when bundled MCP initialization throws', async () => {
      mockInitialize.mockImplementationOnce(() => Promise.resolve());
      mockPromptInitialize.mockImplementationOnce(() => Promise.resolve());
      mockResourceInitialize.mockImplementationOnce(() => Promise.resolve());

      const bundledError = new Error('Bundled MCP initialization failed');
      mockInitializeBundledMCPs.mockImplementationOnce(() => Promise.reject(bundledError));

      await startServer();

      expect(mockRegisterTool).toHaveBeenCalledTimes(1);
      expect(mockRegisterTool).toHaveBeenCalledWith(
        'startup-diagnostics',
        expect.objectContaining({
          description: expect.stringContaining('rescue mode'),
        }),
        expect.any(Function),
      );
      expect(mockConnect).toHaveBeenCalled();
    });

    it('should enter rescue mode when remote MCP initialization throws', async () => {
      mockInitialize.mockImplementationOnce(() => Promise.resolve());
      mockPromptInitialize.mockImplementationOnce(() => Promise.resolve());
      mockResourceInitialize.mockImplementationOnce(() => Promise.resolve());
      mockInitializeBundledMCPs.mockImplementationOnce(() => Promise.resolve());

      const remoteError = new Error('Remote MCP initialization failed');
      mockInitializeRemoteMCPs.mockImplementationOnce(() => Promise.reject(remoteError));

      await startServer();

      expect(mockRegisterTool).toHaveBeenCalledTimes(1);
      expect(mockRegisterTool).toHaveBeenCalledWith(
        'startup-diagnostics',
        expect.objectContaining({
          description: expect.stringContaining('rescue mode'),
        }),
        expect.any(Function),
      );
      expect(mockConnect).toHaveBeenCalled();
    });

    it('should enter rescue mode when local MCP initialization throws', async () => {
      mockInitialize.mockImplementationOnce(() => Promise.resolve());
      mockPromptInitialize.mockImplementationOnce(() => Promise.resolve());
      mockResourceInitialize.mockImplementationOnce(() => Promise.resolve());
      mockInitializeBundledMCPs.mockImplementationOnce(() => Promise.resolve());
      mockInitializeRemoteMCPs.mockImplementationOnce(() => Promise.resolve(null));

      const localError = new Error('Local MCP initialization failed');
      mockInitializeLocalMCPs.mockImplementationOnce(() => Promise.reject(localError));

      await startServer();

      expect(mockRegisterTool).toHaveBeenCalledTimes(1);
      expect(mockRegisterTool).toHaveBeenCalledWith(
        'startup-diagnostics',
        expect.objectContaining({
          description: expect.stringContaining('rescue mode'),
        }),
        expect.any(Function),
      );
      expect(mockConnect).toHaveBeenCalled();
    });

    it('should format YAML error with specific guidance', () => {
      const error = new Error('YAMLException: bad indentation at line 5, column 3');
      error.name = 'YAMLException';

      const result = formatStartupError(error);

      expect(result).toContain('Malformed Configuration File');
      expect(result).toContain('YAML syntax');
      expect(result).toContain('Incorrect indentation');
      expect(result).toContain('yamllint.com');
    });

    it('should format permission error with specific guidance', () => {
      const error = new Error("EACCES: permission denied, mkdir '/Users/user/.qnscmcp'");
      error.name = 'Error';

      const result = formatStartupError(error);

      expect(result).toContain('Permission Error');
      expect(result).toContain('chmod -R 755');
      expect(result).toContain('sudo chown');
    });

    it('should format module loading error with specific guidance', () => {
      const error = new Error("Cannot find module '@anthropic/sdk'");
      error.name = 'Error';

      const result = formatStartupError(error);

      expect(result).toContain('Tool Loading Error');
      expect(result).toContain('bun install');
      expect(result).toContain('Reinstall dependencies');
    });

    it('should format env var error with specific guidance', () => {
      const error = new Error('Invalid environment variable: QNSC_MCP_CONFIG__TOOLS__INCLUDE');
      error.name = 'Error';

      const result = formatStartupError(error);

      expect(result).toContain('Environment Variable Error');
      expect(result).toContain('QNSC_MCP_CONFIG');
      expect(result).toContain('printenv');
    });

    it('should format schema validation error with specific guidance', () => {
      const error = new Error('Invalid configuration: unrecognized key "foo"');
      error.name = 'Error';

      const result = formatStartupError(error);

      expect(result).toContain('Invalid Configuration Schema');
      expect(result).toContain('qnsc-mcp doctor');
    });

    it('should format missing file error with specific guidance', () => {
      const error = new Error(
        "ENOENT: no such file or directory, open '/Users/user/.qnscmcp/config.yaml'",
      );
      error.name = 'Error';

      const result = formatStartupError(error);

      expect(result).toContain('Missing File or Directory');
      expect(result).toContain('mkdir -p ~/.qnscmcp');
      expect(result).toContain('bun install');
    });

    it('should provide generic guidance for unknown errors', () => {
      const error = new Error('Something completely unexpected happened');
      error.name = 'Error';

      const result = formatStartupError(error);

      expect(result).toContain('Unknown Startup Error');
      expect(result).toContain('minimal config');
      expect(result).toContain('system resources');
    });

    it('should show multiple categories when error matches several patterns', () => {
      // This error matches both "Permission Error" (contains "permission")
      // and "Missing File or Directory" (contains "enoent")
      const error = new Error("ENOENT: permission denied, open '/Users/user/.qnscmcp/data'");
      error.name = 'Error';

      const result = formatStartupError(error);

      // Should indicate multiple causes were detected
      expect(result).toContain('POSSIBLE CAUSES (2 detected)');
      // Should contain guidance from both categories
      expect(result).toContain('Permission Error');
      expect(result).toContain('Missing File or Directory');
    });

    it('should truncate very long stack traces', () => {
      const error = new Error('Test error');
      error.stack = Array(30).fill('at some function').join('\n');

      const result = formatStartupError(error);

      expect(result).toContain('truncated');
      // Should only include first 20 lines of stack
      const stackLines = result.split('\n').filter((l: string) => l.includes('at some'));
      expect(stackLines.length).toBeLessThanOrEqual(20);
    });

    it('should return formatted diagnostics when handler is called', async () => {
      const testError = new Error('Test startup failure');
      mockInitialize.mockImplementationOnce(() => Promise.reject(testError));

      await startServer();

      // Extract the registered tool's handler function (3rd positional arg)
      expect(mockRegisterTool).toHaveBeenCalledTimes(1);
      const [name, , handler] = mockRegisterTool.mock.calls[0];
      expect(name).toBe('startup-diagnostics');

      // Call handler and verify SDK result format
      const result = await handler({});

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Rescue Mode');
      expect(result.content[0].text).toContain('Test startup failure');
      expect(result.content[0].text).toContain('DIAGNOSIS AND SOLUTIONS');
    });

    it('should enter rescue mode for invalid endpoint (missing leading slash)', async () => {
      await startServer('httpStream', 'mcp'); // Missing leading '/'

      // Should register the rescue mode diagnostic tool
      expect(mockRegisterTool).toHaveBeenCalledTimes(1);
      expect(mockRegisterTool).toHaveBeenCalledWith(
        'startup-diagnostics',
        expect.objectContaining({
          description: expect.stringContaining('rescue mode'),
        }),
        expect.any(Function),
      );

      // Verify the error message mentions the invalid endpoint
      const handler = mockRegisterTool.mock.calls[0][2];
      const result = await handler({});
      expect(result.content[0].text).toContain('Invalid endpoint');
      expect(result.content[0].text).toContain('must start with /');
    });

    it('should handle non-Error exceptions gracefully', async () => {
      // Simulate throwing a string instead of an Error
      mockInitialize.mockImplementationOnce(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- intentionally throwing a non-Error to test handling
        throw 'String error thrown';
      });

      await startServer();

      // Should still enter rescue mode
      expect(mockRegisterTool).toHaveBeenCalledTimes(1);
      expect(mockRegisterTool).toHaveBeenCalledWith(
        'startup-diagnostics',
        expect.objectContaining({
          description: expect.stringContaining('rescue mode'),
        }),
        expect.any(Function),
      );

      // Verify the string error is captured in diagnostics
      const handler = mockRegisterTool.mock.calls[0][2];
      const result = await handler({});
      expect(result.content[0].text).toContain('String error thrown');
    });

    it('should handle non-Error object exceptions gracefully', async () => {
      // Simulate throwing an object instead of an Error
      mockInitialize.mockImplementationOnce(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- intentionally throwing a non-Error to test handling
        throw { code: 'CUSTOM_ERROR', detail: 'Something went wrong' };
      });

      await startServer();

      // Should still enter rescue mode
      expect(mockRegisterTool).toHaveBeenCalledTimes(1);

      // Verify the object is JSON stringified in diagnostics
      const handler = mockRegisterTool.mock.calls[0][2];
      const result = await handler({});
      expect(result.content[0].text).toContain('Non-Error thrown');
      expect(result.content[0].text).toContain('CUSTOM_ERROR');
    });
  });

  describe('Remote Routing Policy Sequencing', () => {
    it('fetches the remote policy once, before initializing remote MCPs, and passes it through', async () => {
      const testPolicy = {
        version: 1,
        policies: { k6: { enabled: true, suppressLocalCategories: ['k6'] } },
      };
      mockFetchRemotePolicy.mockImplementationOnce(() => Promise.resolve(testPolicy));

      await startServer();

      expect(mockFetchRemotePolicy).toHaveBeenCalledTimes(1);
      expect(mockInitializeRemoteMCPs).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        testPolicy,
      );
    });

    it('reuses the same fetched policy object for applyRemotePolicy, without a second fetch', async () => {
      const testPolicy = {
        version: 1,
        policies: { k6: { enabled: true, suppressLocalCategories: ['k6'] } },
      };
      mockFetchRemotePolicy.mockImplementationOnce(() => Promise.resolve(testPolicy));
      const mockManager = { getConnectionStatus: mock(() => ({ k6: 'connected' })) };
      mockInitializeRemoteMCPs.mockImplementationOnce(() => Promise.resolve(mockManager as any));

      await startServer();

      expect(mockFetchRemotePolicy).toHaveBeenCalledTimes(1);
      expect(mockApplyRemotePolicy).toHaveBeenCalledTimes(1);
      const [, , , passedPolicy] = mockApplyRemotePolicy.mock.calls[0];
      // Same reference as what fetchRemotePolicy returned — not a re-fetch.
      expect(passedPolicy).toBe(testPolicy);
    });

    it('passes a real (truthy) clientHint through to applyRemotePolicy when telemetry has one', async () => {
      // Every other test in this block leaves mockTelemetryGetClientName at
      // its default (undefined) — this is the only one that exercises the
      // wiring with a real client name, proving the argument that actually
      // reaches applyRemotePolicy is telemetryService.getClientName()'s
      // return value, not e.g. a dropped/misplaced argument.
      const mockManager = { getConnectionStatus: mock(() => ({ k6: 'connected' })) };
      mockInitializeRemoteMCPs.mockImplementationOnce(() => Promise.resolve(mockManager as any));
      mockTelemetryGetClientName.mockImplementationOnce(() => 'vscode');

      await startServer();

      expect(mockApplyRemotePolicy).toHaveBeenCalledTimes(1);
      const [, , , , passedClientHint] = mockApplyRemotePolicy.mock.calls[0];
      expect(passedClientHint).toBe('vscode');
    });

    it('does not enter rescue mode if applyRemotePolicy throws — falls back to local tools only', async () => {
      // Unlike fetchRemotePolicy (documented to never throw, so an unexpected
      // throw there is treated as a genuine contract violation warranting
      // rescue mode — see the test below), applyRemotePolicy operates on
      // live connection state and a policy object that could be malformed in
      // ways not fully guarded against. Its call site has its own local
      // try/catch specifically so a policy-application failure degrades to
      // "continue with all local tools" rather than escalating to full
      // rescue mode (which would drop local tools too). This is the backstop
      // that matters most now that applyRemotePolicy's `policy` parameter is
      // required rather than optional-with-an-internal-fallback-fetch.
      // mockInitializeRemoteMCPs defaults to resolving null (see beforeEach),
      // which means the `if (remoteMCPManager)` block that calls
      // applyRemotePolicy never even runs — without this override, this test
      // would pass regardless of whether the try/catch under test exists at
      // all (confirmed: it did, silently, before this fix).
      const mockManager = { getConnectionStatus: mock(() => ({ k6: 'connected' })) };
      mockInitializeRemoteMCPs.mockImplementationOnce(() => Promise.resolve(mockManager as any));
      mockApplyRemotePolicy.mockImplementationOnce(() =>
        Promise.reject(new Error('simulated policy application failure')),
      );

      await startServer();

      expect(mockRegisterTool).not.toHaveBeenCalledWith(
        'startup-diagnostics',
        expect.anything(),
        expect.anything(),
      );
      expect(mockConnect).toHaveBeenCalled();
    });

    it('enters rescue mode if fetchRemotePolicy ever throws unexpectedly', async () => {
      // fetchRemotePolicy() is documented and implemented to catch every
      // error internally and resolve to EMPTY_POLICY — this simulates a
      // contract violation to confirm startup fails safely (rescue mode,
      // same as every other startup step) rather than silently swallowing
      // an unexpected error.
      mockFetchRemotePolicy.mockImplementationOnce(() =>
        Promise.reject(new Error('network error')),
      );

      await startServer();

      expect(mockRegisterTool).toHaveBeenCalledTimes(1);
      expect(mockRegisterTool).toHaveBeenCalledWith(
        'startup-diagnostics',
        expect.objectContaining({
          description: expect.stringContaining('rescue mode'),
        }),
        expect.any(Function),
      );
      expect(mockConnect).toHaveBeenCalled();
    });
  });

  describe('Signal Handler Cleanup', () => {
    it('should register signal handlers for graceful shutdown', async () => {
      const processOnSpy = spyOn(process, 'on').mockReturnValue(process);

      await startServer();

      // Verify all expected signal handlers are registered
      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('SIGQUIT', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('beforeExit', expect.any(Function));
    });

    it('should execute cleanup when signal handler is invoked', async () => {
      let capturedHandler: Function | null = null;
      spyOn(process, "on").mockImplementation(((event: any, handler: any) => {
        if (event === 'SIGINT') {
          capturedHandler = handler as Function;
        }
        return process;
      }) as any);

      await startServer();

      // Verify handler was captured
      expect(capturedHandler).not.toBeNull();

      // Invoke the cleanup handler
      await capturedHandler!();

      // Verify cleanup actions occurred
      expect(mockTelemetryFlush).toHaveBeenCalled();
      expect(mockTelemetryShutdown).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should only run cleanup once even if called multiple times', async () => {
      let capturedHandler: Function | null = null;
      spyOn(process, "on").mockImplementation(((event: any, handler: any) => {
        if (event === 'SIGINT') {
          capturedHandler = handler as Function;
        }
        return process;
      }) as any);

      await startServer();

      // Call cleanup handler twice
      await capturedHandler!();
      await capturedHandler!();

      // Verify cleanup only ran once
      expect(processExitSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    describe('Server Start Errors', () => {
      it('should log helpful error and exit when expressMCP.start() fails', async () => {
        mockExpressStart.mockImplementationOnce(() => {
          throw new Error('Server start failed');
        });

        await startServer('httpStream', '/mcp', 8081);

        // Should log helpful error message
        expect(mockLog.logError).toHaveBeenCalledWith(expect.stringContaining('transport error'));
        // Should exit with error code
        expect(processExitSpy).toHaveBeenCalledWith(1);
      });
    });
  });

  describe('Startup Validation', () => {
    it('should run config validation on startup', async () => {
      await startServer();

      expect(mockValidateQnscMcpConfig).toHaveBeenCalled();
    });

    it('should log warnings when validation finds issues', async () => {
      mockValidateQnscMcpConfig.mockImplementationOnce(() =>
        Promise.resolve({
          valid: true,
          issues: [
            {
              severity: 'warning',
              code: 'TEST_WARNING',
              message: 'Test warning message',
            },
            {
              severity: 'error',
              code: 'TEST_ERROR',
              message: 'Test error message',
            },
          ],
        }),
      );

      await startServer();

      expect(mockLogWarn).toHaveBeenCalledWith(
        expect.stringContaining('Configuration issues detected'),
      );
      expect(mockLogWarn).toHaveBeenCalledWith(expect.stringContaining('Test warning message'));
      expect(mockLogWarn).toHaveBeenCalledWith(expect.stringContaining('Test error message'));
    });

    it('should not log warnings when validation passes with no issues', async () => {
      mockValidateQnscMcpConfig.mockImplementationOnce(() =>
        Promise.resolve({ valid: true, issues: [] }),
      );

      await startServer();

      // logWarn should not be called for config issues (may be called for other things)
      const configWarningCalls = mockLogWarn.mock.calls.filter((call: any[]) =>
        call[0]?.includes?.('Configuration issues'),
      );
      expect(configWarningCalls.length).toBe(0);
    });

    it('should not block startup when validation throws an error', async () => {
      mockValidateQnscMcpConfig.mockImplementationOnce(() =>
        Promise.reject(new Error('Validation exploded')),
      );

      await startServer();

      // Server should still start despite validation error
      expect(mockConnect).toHaveBeenCalled();
      expect(mockLogWarn).toHaveBeenCalledWith(expect.stringContaining('Config validation failed'));
    });

    it('should filter out info-level issues from startup warnings', async () => {
      mockValidateQnscMcpConfig.mockImplementationOnce(() =>
        Promise.resolve({
          valid: true,
          issues: [
            {
              severity: 'info',
              code: 'TEST_INFO',
              message: 'Info message should not appear',
            },
          ],
        }),
      );

      await startServer();

      // Should not log config issues header for info-only issues
      const configWarningCalls = mockLogWarn.mock.calls.filter((call: any[]) =>
        call[0]?.includes?.('Configuration issues'),
      );
      expect(configWarningCalls.length).toBe(0);
    });
  });

  describe('Telemetry Error Handling', () => {
    it('should continue startup when telemetry initialization fails', async () => {
      mockTelemetryInitialize.mockImplementationOnce(() => {
        throw new Error('Telemetry init failed');
      });

      await startServer();

      // Server should still start
      expect(mockConnect).toHaveBeenCalled();
      // Should log warning about telemetry failure
      expect(mockLogWarn).toHaveBeenCalledWith(
        expect.stringContaining('Telemetry initialization failed'),
      );
    });

    it('should enter rescue mode even when telemetry recording fails', async () => {
      // Make initialization fail to trigger rescue mode
      mockInitialize.mockImplementationOnce(() => Promise.reject(new Error('Init failed')));
      // Make telemetry recording fail
      mockTelemetryRecordUsage.mockImplementationOnce(() => {
        throw new Error('Telemetry recording failed');
      });

      await startServer();

      // Should still register rescue mode tool
      expect(mockRegisterTool).toHaveBeenCalledWith(
        'startup-diagnostics',
        expect.objectContaining({
          description: expect.stringContaining('rescue mode'),
        }),
        expect.any(Function),
      );
      // Server should still start
      expect(mockConnect).toHaveBeenCalled();
    });

    it('should handle telemetry flush/shutdown errors in rescue mode cleanup', async () => {
      // Make initialization fail to trigger rescue mode
      mockInitialize.mockImplementationOnce(() => Promise.reject(new Error('Init failed')));
      // Make telemetry flush fail
      mockTelemetryFlush.mockImplementationOnce(() => Promise.reject(new Error('Flush failed')));

      await startServer();

      // Should still start in rescue mode
      expect(mockRegisterTool).toHaveBeenCalledWith(
        'startup-diagnostics',
        expect.objectContaining({
          description: expect.stringContaining('rescue mode'),
        }),
        expect.any(Function),
      );
      expect(mockConnect).toHaveBeenCalled();
    });
  });
});
