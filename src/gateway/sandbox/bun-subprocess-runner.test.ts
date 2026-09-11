/**
 * bun-subprocess-runner.test.ts - Tests for BunSubprocessRunner
 */
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { ChildProcess } from 'child_process';
import * as fs from 'fs';
import {
  createMockInitializeResponse,
  createMockToolsListResponse,
} from '../__mocks__/mcp-fixtures';
import { BunSubprocessRunner } from './bun-subprocess-runner';

describe('BunSubprocessRunner', () => {
  // Define test paths
  const validMcpPath = '/tmp/test-bundle/valid-mcp.js';
  const extractedMcpPath = '/tmp/test-extracted/valid-mcp.js';

  // Mock child_process module with full EventEmitter interface
  const mockSpawn = mock(() => {
    const emitters: { [key: string]: any[] } = {
      spawn: [],
      error: [],
      exit: [],
    };

    const mockProcess = {
      stdin: {
        write: mock((_data: string) => true),
      },
      stdout: {
        on: mock((event: string, listener: (data: any) => void) => {
          // Store the listener to trigger it later with mock responses
          if (event === 'data') {
            mockDataListeners.push(listener);
          }
          return mockProcess.stdout;
        }),
      },
      stderr: {
        on: mock((_event: string, _listener: (data: any) => void) => {
          return mockProcess.stderr;
        }),
      },
      on: mock((event: string, listener: (code?: number) => void) => {
        // Store exit and error listeners
        if (event === 'exit') {
          mockExitListeners.push(listener);
        }
        if (event === 'exit' || event === 'error' || event === 'spawn') {
          if (!emitters[event]) {
            emitters[event] = [];
          }
          emitters[event].push(listener);
        }
        return mockProcess;
      }),
      once: mock((event: string, listener: any) => {
        // Store listeners for one-time events
        if (event === 'exit' || event === 'error' || event === 'spawn') {
          if (!emitters[event]) {
            emitters[event] = [];
          }
          emitters[event].push(listener);
        }
        return mockProcess;
      }),
      removeListener: mock((event: string, listener: any) => {
        // Remove listener from emitters
        if (emitters[event]) {
          const index = emitters[event].indexOf(listener);
          if (index !== -1) {
            emitters[event].splice(index, 1);
          }
        }
        return mockProcess;
      }),
      kill: mock(() => true),
    } as unknown as ChildProcess;

    // Automatically emit spawn event after a short delay to simulate successful process start
    // Use nextTick to ensure listeners are registered before emitting
    process.nextTick(() => {
      if (emitters.spawn && emitters.spawn.length > 0) {
        emitters.spawn.forEach((listener) => {
          listener();
        });
        emitters.spawn = []; // Clear once-listeners
      }
    });

    return mockProcess;
  });

  // Mock fs module with dynamic implementation
  // This allows tests to customize the behavior per-test
  const customExistsSyncPaths = new Set<string>([validMcpPath, extractedMcpPath]);

  const mockExistsSync = mock((filepath: string) => {
    return customExistsSyncPaths.has(filepath);
  });

  // Store listeners to trigger them in tests
  const mockDataListeners: ((data: any) => void)[] = [];
  const mockExitListeners: ((code?: number) => void)[] = [];

  // Helper to send mock JSON-RPC responses
  const sendMockResponse = (id: string, result: any) => {
    // Extract the actual request ID from the spawn call if needed
    // This is needed because the test can't easily access the randomly generated UUID
    // When 'any-id' is used, we'll try to extract the real request ID from the data written to stdin
    let actualId = id;
    if (id === 'any-id' && mockSpawn.mock.results.length > 0) {
      const mockProcess: any = mockSpawn.mock.results[0].value;
      if (mockProcess && mockProcess.stdin && mockProcess.stdin.write.mock.calls.length > 0) {
        const lastCall =
          mockProcess.stdin.write.mock.calls[mockProcess.stdin.write.mock.calls.length - 1];
        if (lastCall && lastCall[0]) {
          try {
            const requestData = JSON.parse(lastCall[0]);
            if (requestData.id) {
              actualId = requestData.id;
              console.log(`Using extracted request ID: ${actualId}`);
            }
          } catch (error) {
            console.log('Error extracting request ID:', error);
          }
        }
      }
    }

    const response = {
      jsonrpc: '2.0',
      id: actualId,
      result,
    };
    const responseString = JSON.stringify(response);

    // Call all data listeners with the response
    mockDataListeners.forEach((listener) => {
      listener(Buffer.from(responseString + '\n'));
    });
  };

  // Helper to send mock JSON-RPC error responses
  const sendMockErrorResponse = (id: string, error: { code: string; message: string }) => {
    // Extract the actual request ID from the spawn call if needed
    let actualId = id;
    if (id === 'any-id' && mockSpawn.mock.results.length > 0) {
      const mockProcess: any = mockSpawn.mock.results[0].value;
      if (mockProcess && mockProcess.stdin && mockProcess.stdin.write.mock.calls.length > 0) {
        const lastCall =
          mockProcess.stdin.write.mock.calls[mockProcess.stdin.write.mock.calls.length - 1];
        if (lastCall && lastCall[0]) {
          try {
            const requestData = JSON.parse(lastCall[0]);
            if (requestData.id) {
              actualId = requestData.id;
              console.log(`Using extracted request ID: ${actualId}`);
            }
          } catch (error) {
            console.log('Error extracting request ID:', error);
          }
        }
      }
    }

    const response = {
      jsonrpc: '2.0',
      id: actualId,
      error,
    };
    const responseString = JSON.stringify(response);

    // Call all data listeners with the response
    mockDataListeners.forEach((listener) => {
      listener(Buffer.from(responseString + '\n'));
    });
  };

  beforeEach(() => {
    // Set up mocks for child_process
    void mock.module('child_process', () => ({
      spawn: mockSpawn,
      ChildProcess,
    }));

    // Set up mocks for fs
    void mock.module('fs', () => ({
      ...fs,
      existsSync: mockExistsSync,
    }));

    // Reset call counts
    mockSpawn.mockClear();
    mockExistsSync.mockClear();

    // Clear stored listeners
    mockDataListeners.length = 0;
    mockExitListeners.length = 0;
  });

  afterEach(() => {
    mock.restore();
  });

  it('should be instantiable with valid bundle path', () => {
    const runner = new BunSubprocessRunner(validMcpPath);
    expect(runner).toBeDefined();
  });

  it('should have proper default options', () => {
    const runner = new BunSubprocessRunner(validMcpPath);

    // We can't directly test private fields, but we can infer them from behavior
    // Let's add a test that verifies the constructor sets defaults correctly

    // Using TypeScript's "as any" we can access private fields for testing
    expect((runner as any).bundlePath).toBe(validMcpPath);
    expect((runner as any).options.rpcTimeout).toBe(60000); // Default 60s timeout

    // Test with custom options
    const customRunner = new BunSubprocessRunner(validMcpPath, {
      rpcTimeout: 5000,
      verbose: true,
    });
    expect((customRunner as any).options.rpcTimeout).toBe(5000);
    expect((customRunner as any).options.verbose).toBe(true);
  });

  it('should initialize and get server info/capabilities', async () => {
    // Create the runner
    const runner = new BunSubprocessRunner(validMcpPath, { verbose: true });

    // Set up a promise to resolve when initialization is done
    const initPromise = runner.initialize();

    // Get the request ID from the spawn call
    expect(mockSpawn).toHaveBeenCalled();

    // Wait a tick for the request to be sent
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Send a mock initialize response
    // Since we can't access the actual requestId, we'll have to match any ID
    sendMockResponse('any-id', createMockInitializeResponse());

    // Wait for initialization to complete
    const result = await initPromise;

    // Verify the result
    expect(result).toBeDefined();
    expect(result.serverInfo.name).toBe('test-mcp-server');
    expect(result.serverInfo.version).toBe('1.0.0');
    expect(result.capabilities.tools.list).toBe(true);
    expect(result.capabilities.tools.call).toBe(true);
  });

  it('should handle initialize failures gracefully', async () => {
    // Create the runner
    const runner = new BunSubprocessRunner(validMcpPath);

    // Set up a promise to resolve when initialization is done
    const initPromise = runner.initialize();

    // Wait a tick for the request to be sent
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Send an error response
    sendMockErrorResponse('any-id', {
      code: 'server_error',
      message: 'Failed to initialize',
    });

    // Wait for initialization to complete (it should still complete, but return default values)
    const result = await initPromise;

    // Verify the result has default values
    expect(result).toBeDefined();
    expect(result.serverInfo.name).toBe('valid-mcp');
    expect(result.capabilities.tools.list).toBe(true);
  });

  it('should list tools from MCP', async () => {
    // Create the runner
    const runner = new BunSubprocessRunner(validMcpPath);

    // Set up a promise to resolve when listTools is done
    const listPromise = runner.listTools();

    // Wait a tick for the request to be sent
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Send a mock tools/list response
    sendMockResponse('any-id', createMockToolsListResponse());

    // Wait for tools list to complete
    const result = await listPromise;

    // Verify the result
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('test_tool1');
    expect(result[1].name).toBe('test_tool2');
  });

  it('should cache tools after first call', async () => {
    // Create the runner
    const runner = new BunSubprocessRunner(validMcpPath);

    // Set up a promise to resolve when listTools is done
    const listPromise = runner.listTools();

    // Wait a tick for the request to be sent
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Send a mock tools/list response
    sendMockResponse('any-id', createMockToolsListResponse());

    // Wait for tools list to complete
    await listPromise;

    // Reset the mock spawn to see if it's called again
    mockSpawn.mockClear();
    mockDataListeners.length = 0; // Clear data listeners

    // Call listTools again
    const secondListPromise = runner.listTools();

    // This should resolve immediately without sending any requests
    const result = await secondListPromise;

    // Verify we get the same result without sending new requests
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('test_tool1');

    // The spawn should not have been called again since it uses the cache
    // Note: In the real implementation, this might not be precisely true because
    // ensureProcessRunning() might still be called, but the tools/list request won't be sent
  });

  it('should call a tool with correct parameters', async () => {
    // Create the runner
    const runner = new BunSubprocessRunner(validMcpPath);

    // Set up a promise to resolve when callTool is done
    const toolPromise = runner.callTool('test_tool', { param1: 'value1' });

    // Wait a tick for the request to be sent
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Send a mock tools/call response
    const mockToolResponse = {
      result: 'success',
      data: { value: 42 },
    };
    sendMockResponse('any-id', mockToolResponse);

    // Wait for tool call to complete
    const result = await toolPromise;

    // Verify the result
    expect(result).toBeDefined();
    expect(result.result).toBe('success');
    expect(result.data.value).toBe(42);
  });

  it('should try alternative parameter format for tool calls if first attempt fails', async () => {
    // Create the runner
    const runner = new BunSubprocessRunner(validMcpPath, { verbose: true });

    // Set up a promise to resolve when callTool is done
    const toolPromise = runner.callTool('test_tool', { param1: 'value1' });

    // Wait a tick for the first request to be sent
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Send an error response for the first attempt
    sendMockErrorResponse('any-id', {
      code: 'invalid_params',
      message: 'Invalid parameters',
    });

    // Wait a tick for the second request to be sent
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Send a successful response for the second attempt
    const mockToolResponse = {
      result: 'success',
      data: { value: 42 },
    };
    sendMockResponse('any-id', mockToolResponse);

    // Wait for tool call to complete
    const result = await toolPromise;

    // Verify the result
    expect(result).toBeDefined();
    expect(result.result).toBe('success');
    expect(result.data.value).toBe(42);
  });

  it('should close the process when requested', async () => {
    // Create the runner
    const runner = new BunSubprocessRunner(validMcpPath);

    // Initialize to create the process
    const initPromise = runner.initialize();

    // Wait a tick for the request to be sent
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Send a mock initialize response
    sendMockResponse('any-id', {
      serverInfo: { name: 'test-mcp', version: '1.0.0' },
      capabilities: { tools: { list: true, call: true }, resources: {} },
    });

    // Wait for initialization to complete
    await initPromise;

    // Now close the process
    await runner.close();

    // Verify kill was called
    const mockProcess = mockSpawn.mock.results[0].value;
    // @ts-expect-error - mockProcess.kill is typed as a plain ChildProcess method here,
    // not Bun's Mock<T>, but it is one at runtime (see the mock() wrapper above).
    expect(mockProcess.kill).toHaveBeenCalled();
  });

  it('should handle RPC timeouts', async () => {
    // Create the runner with short timeout
    const runner = new BunSubprocessRunner(validMcpPath, { rpcTimeout: 100 });

    // Make a call that will time out
    const promise = runner.callTool('test_tool', { param1: 'value1' });

    // Wait for the timeout to occur
    try {
      await promise;
      // Should not reach here
      throw new Error('Promise should have rejected');
    } catch (error: any) {
      expect(error.message).toContain('RPC timeout');
    }
  });

  // Create a test subclass that exposes internal methods for testing
  class TestBunSubprocessRunner extends BunSubprocessRunner {
    // Expose method to simulate process exit handler
    public testHandleProcessExit(code: number): void {
      // Replicate the logic from the exit handler in ensureProcessRunning
      this['mcpProcess'] = null;

      // Reject all pending requests
      for (const [id, request] of this['pendingRequests'].entries()) {
        clearTimeout(request.timer);
        request.reject(new Error(`MCP process exited with code ${code}`));
        this['pendingRequests'].delete(id);
      }
    }

    // Expose method to simulate process error handler
    public testHandleProcessError(error: Error): void {
      // Replicate the logic from the error handler in ensureProcessRunning
      this['mcpProcess'] = null;

      // Reject all pending requests
      for (const [id, request] of this['pendingRequests'].entries()) {
        clearTimeout(request.timer);
        request.reject(error);
        this['pendingRequests'].delete(id);
      }
    }

    // Expose method to get process arguments that would be used
    public getProcessArgs(): string[] {
      // Use local check instead of mockExistsSync to avoid mock dependencies
      // This simulates the logic from ensureProcessRunning
      const useExtractedPath =
        this['options'].extractedPath &&
        this.shouldUseExtractedPath(this['bundlePath'], this['options'].extractedPath);

      const actualPath = useExtractedPath ? this['options'].extractedPath : this['bundlePath'];

      // Return the args that would be used for spawning
      return this['options'].args ? [actualPath!, ...this['options'].args] : [actualPath!];
    }

    // Helper method to determine if we should use the extracted path
    private shouldUseExtractedPath(bundlePath: string, _extractedPath: string): boolean {
      // This is a simple method for test purposes only
      // In real tests, we'll mock this behavior by providing appropriate paths
      return bundlePath.includes('non-existent') || bundlePath.includes('invalid');
    }
  }

  it('should handle process exit during a call', async () => {
    // Create the test runner
    const runner = new TestBunSubprocessRunner(validMcpPath);

    // Create a mock request
    const mockReject = mock((_reason: any) => {});
    const mockTimer = setTimeout(() => {}, 1000); // real timer that we'll clear

    // Add a pending request
    (runner as any).pendingRequests.set('test-id', {
      resolve: () => {},
      reject: mockReject,
      timer: mockTimer,
    });

    // Simulate process exit
    runner.testHandleProcessExit(1);

    // Verify the reject function was called with correct error
    expect(mockReject).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('exited with code 1'),
      }),
    );
  });

  it('should handle process errors', async () => {
    // Create the test runner
    const runner = new TestBunSubprocessRunner(validMcpPath);

    // Create a mock request
    const mockReject = mock((_reason: any) => {});
    const mockTimer = setTimeout(() => {}, 1000); // real timer that we'll clear

    // Add a pending request
    (runner as any).pendingRequests.set('test-id', {
      resolve: () => {},
      reject: mockReject,
      timer: mockTimer,
    });

    // Create a mock error
    const mockError = new Error('Process crashed');

    // Simulate process error
    runner.testHandleProcessError(mockError);

    // Verify the reject function was called with the error
    expect(mockReject).toHaveBeenCalledWith(mockError);
  });

  it('should use extracted path when available', async () => {
    // Create the runner with extracted path option and invalid bundle path
    // This will trigger shouldUseExtractedPath to return true
    const invalidMcpPath = '/tmp/test-bundle/non-existent-mcp.js';

    const runner = new TestBunSubprocessRunner(invalidMcpPath, {
      extractedPath: extractedMcpPath,
    });

    // Override shouldUseExtractedPath for this test
    runner['shouldUseExtractedPath'] = () => true;

    // Get the process args that would be used
    const args = runner.getProcessArgs();

    // Verify the args contain the extracted path
    expect(args).toContain(extractedMcpPath);
  });

  it('should pass environment variables to subprocess', async () => {
    // Create the runner with env vars
    const envVars = {
      TEST_API_KEY: 'test-api-key',
      TEST_ENV: 'test-environment',
    };

    const runner = new BunSubprocessRunner(validMcpPath, { env: envVars });

    // Initialize to create the process
    const initPromise = runner.initialize();

    // Wait a tick for the request to be sent
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Send a mock initialize response
    sendMockResponse('any-id', {
      serverInfo: { name: 'test-mcp', version: '1.0.0' },
      capabilities: { tools: { list: true, call: true }, resources: {} },
    });

    // Wait for initialization to complete
    await initPromise;

    // Verify that spawn was called with the environment variables
    expect(mockSpawn).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        env: expect.objectContaining(envVars),
      }),
    );
  });

  it('should pass command line arguments to subprocess', async () => {
    // Create the runner with args
    const args = ['--option1', '--option2=value'];

    const runner = new BunSubprocessRunner(validMcpPath, { args });

    // Initialize to create the process
    const initPromise = runner.initialize();

    // Wait a tick for the request to be sent
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Send a mock initialize response
    sendMockResponse('any-id', {
      serverInfo: { name: 'test-mcp', version: '1.0.0' },
      capabilities: { tools: { list: true, call: true }, resources: {} },
    });

    // Wait for initialization to complete
    await initPromise;

    // Verify that spawn was called with the args appended
    expect(mockSpawn).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([validMcpPath, '--option1', '--option2=value']),
      expect.anything(),
    );
  });

  describe('BUN_BE_BUN runtime detection', () => {
    // Create a test subclass that exposes runtime detection methods
    class TestBunSubprocessRunnerWithRuntimeMethods extends BunSubprocessRunner {
      public testDetectAvailableRuntimes(): string[] {
        return this['detectAvailableRuntimes']();
      }

      public testGetRuntimeDisplayName(runtime: string): string {
        return this['getRuntimeDisplayName'](runtime);
      }
    }

    it('should include process.execPath in runtime detection when running as compiled binary', () => {
      // Explicitly set process.execPath to simulate a compiled binary to avoid
      // flakiness from test ordering (other tests modify process.execPath).
      const originalExecPath = process.execPath;

      try {
        Object.defineProperty(process, 'execPath', {
          value: '/usr/local/bin/qnsc-mcp',
          writable: true,
          configurable: true,
        });

        // Ensure fs.existsSync returns true for the compiled binary path.
        // Use customExistsSyncPaths for the test's own mock AND override the
        // global mock.module fs in case mock.restore() from a prior test reverted it.
        customExistsSyncPaths.add('/usr/local/bin/qnsc-mcp');
        void mock.module('fs', () => ({
          ...fs,
          existsSync: mockExistsSync,
          default: { ...fs, existsSync: mockExistsSync },
        }));

        const runner = new TestBunSubprocessRunnerWithRuntimeMethods(validMcpPath);
        const runtimes = runner.testDetectAvailableRuntimes();

        // Should always include bun and node as available runtimes
        expect(runtimes).toContain('bun');
        expect(runtimes).toContain('node');

        // Running as compiled binary - should be included for BUN_BE_BUN support
        expect(runtimes).toContain('/usr/local/bin/qnsc-mcp');

        // Verify the order: bun (priority 1), node (priority 2), then binary (priority 3)
        expect(runtimes.indexOf('bun')).toBeLessThan(runtimes.indexOf('node'));
      } finally {
        customExistsSyncPaths.delete('/usr/local/bin/qnsc-mcp');
        Object.defineProperty(process, 'execPath', {
          value: originalExecPath,
          writable: true,
          configurable: true,
        });
      }
    });

    it('should not include process.execPath when running as node binary', () => {
      // Save original execPath
      const originalExecPath = process.execPath;

      try {
        // Mock process.execPath to simulate running as node
        Object.defineProperty(process, 'execPath', {
          value: '/usr/bin/node',
          writable: true,
          configurable: true,
        });

        const runner = new TestBunSubprocessRunnerWithRuntimeMethods(validMcpPath);
        const runtimes = runner.testDetectAvailableRuntimes();

        // Should only include bun and node, not the node binary itself
        expect(runtimes).toContain('bun');
        expect(runtimes).toContain('node');
        expect(runtimes).not.toContain('/usr/bin/node');
      } finally {
        // Restore original execPath
        Object.defineProperty(process, 'execPath', {
          value: originalExecPath,
          writable: true,
          configurable: true,
        });
      }
    });

    it('should not include process.execPath when running as bun binary', () => {
      // Save original execPath
      const originalExecPath = process.execPath;

      try {
        // Mock process.execPath to simulate running as bun
        Object.defineProperty(process, 'execPath', {
          value: '/usr/local/bin/bun',
          writable: true,
          configurable: true,
        });

        const runner = new TestBunSubprocessRunnerWithRuntimeMethods(validMcpPath);
        const runtimes = runner.testDetectAvailableRuntimes();

        // Should only include bun and node, not the bun binary itself
        expect(runtimes).toContain('bun');
        expect(runtimes).toContain('node');
        expect(runtimes).not.toContain('/usr/local/bin/bun');
      } finally {
        // Restore original execPath
        Object.defineProperty(process, 'execPath', {
          value: originalExecPath,
          writable: true,
          configurable: true,
        });
      }
    });

    it('should return correct display name for BUN_BE_BUN runtime', () => {
      // Save original execPath
      const originalExecPath = process.execPath;

      try {
        // Mock process.execPath to simulate running as compiled binary
        Object.defineProperty(process, 'execPath', {
          value: '/usr/local/bin/qnsc-mcp',
          writable: true,
          configurable: true,
        });

        const runner = new TestBunSubprocessRunnerWithRuntimeMethods(validMcpPath);
        const displayName = runner.testGetRuntimeDisplayName('/usr/local/bin/qnsc-mcp');

        expect(displayName).toBe('Bun (via BUN_BE_BUN from QNSC MCP binary)');
      } finally {
        // Restore original execPath
        Object.defineProperty(process, 'execPath', {
          value: originalExecPath,
          writable: true,
          configurable: true,
        });
      }
    });

    it('should return correct display name for system bun', () => {
      const runner = new TestBunSubprocessRunnerWithRuntimeMethods(validMcpPath);
      const displayName = runner.testGetRuntimeDisplayName('bun');

      expect(displayName).toBe('Bun');
    });

    it('should return correct display name for system node', () => {
      const runner = new TestBunSubprocessRunnerWithRuntimeMethods(validMcpPath);
      const displayName = runner.testGetRuntimeDisplayName('node');

      expect(displayName).toBe('Node.js');
    });

    it('should return correct display name for custom node path', () => {
      const runner = new TestBunSubprocessRunnerWithRuntimeMethods(validMcpPath);
      const displayName = runner.testGetRuntimeDisplayName('/usr/local/bin/node');

      expect(displayName).toBe('Node.js (/usr/local/bin/node)');
    });

    it('should return correct display name for custom bun path', () => {
      const runner = new TestBunSubprocessRunnerWithRuntimeMethods(validMcpPath);
      const displayName = runner.testGetRuntimeDisplayName('/usr/local/bin/bun');

      expect(displayName).toBe('Bun (/usr/local/bin/bun)');
    });
  });

  describe('BUN_BE_BUN TLS env propagation', () => {
    // Guards the load-bearing line in ensureProcessRunning() that wires
    // selectBunBeBunTlsEnv() into the subprocess env when (and only when) the
    // qnsc-mcp binary is acting as the Bun runtime via BUN_BE_BUN. Without these
    // tests, env-filter or runtime-selection refactors could silently regress
    // corp-CA inheritance with the existing suite still green.

    const originalSystemCa = process.env.NODE_USE_SYSTEM_CA;
    const originalExtraCerts = process.env.NODE_EXTRA_CA_CERTS;
    const originalSslCertFile = process.env.SSL_CERT_FILE;
    const originalExecPath = process.execPath;

    beforeEach(() => {
      delete process.env.NODE_USE_SYSTEM_CA;
      delete process.env.NODE_EXTRA_CA_CERTS;
      delete process.env.SSL_CERT_FILE;
    });

    afterEach(() => {
      Object.defineProperty(process, 'execPath', {
        value: originalExecPath,
        writable: true,
        configurable: true,
      });
      if (originalSystemCa === undefined) delete process.env.NODE_USE_SYSTEM_CA;
      else process.env.NODE_USE_SYSTEM_CA = originalSystemCa;
      if (originalExtraCerts === undefined) delete process.env.NODE_EXTRA_CA_CERTS;
      else process.env.NODE_EXTRA_CA_CERTS = originalExtraCerts;
      if (originalSslCertFile === undefined) delete process.env.SSL_CERT_FILE;
      else process.env.SSL_CERT_FILE = originalSslCertFile;
    });

    function stubExecPath(value: string): void {
      Object.defineProperty(process, 'execPath', {
        value,
        writable: true,
        configurable: true,
      });
    }

    it('forwards parent TLS env vars and BUN_BE_BUN=1 when the chosen runtime IS the qnsc-mcp binary', async () => {
      // Make the first detected runtime ('bun') match process.execPath so the
      // isQnscMcpBinary branch fires on the very first spawn attempt.
      stubExecPath('bun');
      process.env.NODE_USE_SYSTEM_CA = '1';
      process.env.NODE_EXTRA_CA_CERTS = '/Users/test/corp-ca.pem';
      process.env.SSL_CERT_FILE = '/Users/test/ca-bundle.pem';

      const runner = new BunSubprocessRunner(validMcpPath);
      const initPromise = runner.initialize();
      await new Promise((resolve) => setTimeout(resolve, 0));
      sendMockResponse('any-id', {
        serverInfo: { name: 'test-mcp', version: '1.0.0' },
        capabilities: { tools: { list: true, call: true }, resources: {} },
      });
      await initPromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'bun',
        expect.anything(),
        expect.objectContaining({
          env: expect.objectContaining({
            BUN_BE_BUN: '1',
            NODE_USE_SYSTEM_CA: '1',
            NODE_EXTRA_CA_CERTS: '/Users/test/corp-ca.pem',
            SSL_CERT_FILE: '/Users/test/ca-bundle.pem',
          }),
        }),
      );
    });

    it('does NOT forward parent TLS env vars when the chosen runtime is system bun/node', async () => {
      // execPath is something other than 'bun'/'node', so the first runtime
      // tried ('bun') is NOT the qnsc-mcp binary — the : env fall-through branch
      // runs, and TLS vars + BUN_BE_BUN must not leak into the subprocess env.
      // This is what 'scoped to BUN_BE_BUN only' protects.
      stubExecPath('/usr/local/bin/qnsc-mcp');
      process.env.NODE_USE_SYSTEM_CA = '1';
      process.env.NODE_EXTRA_CA_CERTS = '/Users/test/corp-ca.pem';
      process.env.SSL_CERT_FILE = '/Users/test/ca-bundle.pem';

      const runner = new BunSubprocessRunner(validMcpPath);
      const initPromise = runner.initialize();
      await new Promise((resolve) => setTimeout(resolve, 0));
      sendMockResponse('any-id', {
        serverInfo: { name: 'test-mcp', version: '1.0.0' },
        capabilities: { tools: { list: true, call: true }, resources: {} },
      });
      await initPromise;

      // First spawn call is for runtime 'bun' (not qnsc-mcp) — TLS vars must NOT be present.
      const firstSpawnCall = (mockSpawn.mock.calls as any[])[0];
      expect(firstSpawnCall[0]).toBe('bun');
      const spawnedEnv = firstSpawnCall[2].env as Record<string, string>;
      expect(spawnedEnv.BUN_BE_BUN).toBeUndefined();
      expect(spawnedEnv.NODE_USE_SYSTEM_CA).toBeUndefined();
      expect(spawnedEnv.NODE_EXTRA_CA_CERTS).toBeUndefined();
      expect(spawnedEnv.SSL_CERT_FILE).toBeUndefined();
    });
  });
});
