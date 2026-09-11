/**
 * bun-subprocess-runner.ts - Runner for bundled MCPs using Bun subprocesses
 *
 * This module executes bundled MCPs in separate Bun subprocesses with proper STDIO handling,
 * allowing for secure execution and communication with third-party MCP servers.
 */
import { ChildProcess, execSync, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { logDebug, logError, logInfo, logWarn } from '../../services/logger';
import { selectBunBeBunTlsEnv } from '../../services/tls/setup-trust';
import { BunSubprocessOptions, MCPSubprocessResult, ToolInfo } from '../types';
import { filterEnvironmentVariables } from '../utils/env-filter';

/**
 * Global list for testing purposes
 */
export const _testRunners: any[] = [];

/**
 * Shape of a JSON-RPC 2.0 message as received from the MCP subprocess, covering
 * both responses (id + result/error) and notifications (method, no id).
 */
interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

/** Data payload returned by the MCP `initialize` call */
interface McpInitializeData {
  serverInfo?: { name: string; version: string; [key: string]: any };
  capabilities?: {
    tools: Record<string, any>;
    resources: Record<string, any>;
    [key: string]: any;
  };
}

/** Data payload returned by the MCP `tools/list` call */
interface McpToolsListData {
  tools?: ToolInfo[];
}

/**
 * A runner that executes bundled MCPs in Bun subprocesses with STDIO communication
 */
export class BunSubprocessRunner {
  private bundlePath: string;
  private options: BunSubprocessOptions;
  private mcpProcess: ChildProcess | null = null;
  private toolsCache: ToolInfo[] | null = null;
  // Make pendingRequests public for testing
  public pendingRequests = new Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (reason: any) => void;
      timer: NodeJS.Timeout;
    }
  >();

  // Buffer to collect potential JSON-RPC messages
  private jsonBuffer = '';
  private isCollectingJson = false;

  /**
   * Creates a new BunSubprocessRunner
   * @param bundlePath Path to the bundled MCP file
   * @param options Subprocess options
   */
  constructor(bundlePath: string, options: BunSubprocessOptions = {}) {
    this.bundlePath = bundlePath;
    this.options = {
      ...options,
      rpcTimeout: options.rpcTimeout || 60000, // Default 60s timeout
      captureConsole: options.captureConsole ?? true, // Default to capturing console
    };

    // Add to global list for testing purposes
    if (process.env.NODE_ENV === 'test') {
      _testRunners.push(this);
    }
  }

  /**
   * Initializes the MCP server and returns its capabilities and info
   * @returns Server info and capabilities
   */
  public async initialize(): Promise<{
    serverInfo: { name: string; version: string; [key: string]: any };
    capabilities: {
      tools: Record<string, any>;
      resources: Record<string, any>;
      [key: string]: any;
    };
  }> {
    try {
      // Create the proper initialization parameters per the MCP specification
      const initParams = {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {
            call: true,
            list: true,
          },
          resources: {
            read: true,
            list: true,
          },
        },
        clientInfo: {
          name: 'QNSC MCP Toolkit',
          version: '1.0.0',
        },
      };

      // Call the initialize method with required parameters
      const result = await this.callMCP('initialize', initParams);
      // Extract server info and capabilities
      const data = result.data as McpInitializeData | undefined;
      const serverInfo = data?.serverInfo || {
        name: path.basename(this.bundlePath, '.js'),
        version: '1.0.0',
        description: 'Bundled MCP server',
      };

      const capabilities = data?.capabilities || {
        tools: { list: true, call: true },
        resources: { list: false, read: false },
      };

      return { serverInfo, capabilities };
    } catch (error) {
      if (this.options.verbose) {
        logError('Failed to initialize MCP:', error);
      }

      // Return default values on error
      return {
        serverInfo: {
          name: path.basename(this.bundlePath, '.js'),
          version: '1.0.0',
          description: 'Bundled MCP server (failed to initialize)',
        },
        capabilities: {
          tools: { list: true, call: true },
          resources: { list: false, read: false },
        },
      };
    }
  }

  /**
   * Lists available tools from the MCP
   * @returns Array of tool information
   */
  public async listTools(): Promise<ToolInfo[]> {
    if (this.toolsCache) {
      return this.toolsCache;
    }

    try {
      const result = await this.callMCP('tools/list', {});
      const data = result.data as ToolInfo[] | McpToolsListData | undefined;
      let tools: ToolInfo[] = [];

      if (Array.isArray(data)) {
        tools = data;
      } else {
        tools = data?.tools || [];
      }

      if (this.options.verbose) {
        logDebug(`🔍 Found ${tools.length} tools in MCP bundle response`);
        if (tools.length === 0 && result.data) {
          logWarn(`No tools found in MCP response despite result data existing`);
          logDebug(`Response structure: ${JSON.stringify(result)}`);
        }
      }

      // Cache the tools for future use
      this.toolsCache = tools;

      return tools;
    } catch (error) {
      if (this.options.verbose) {
        logError('Failed to list tools:', error);
      }

      // Return empty array on error
      return [];
    }
  }

  /**
   * Calls a specific tool on the MCP with standardized parameter handling
   *
   * @param toolName Name of the tool to call
   * @param args Arguments to pass to the tool
   * @returns Tool call result
   */
  public async callTool(toolName: string, args: any = {}): Promise<any> {
    try {
      // First, determine if args is already in a specific format
      const requestParams: { name: string; arguments: unknown } = {
        name: toolName,
        arguments: args,
      };

      logDebug(`Parameters:`, requestParams);

      const result = await this.callMCP('tools/call', requestParams);
      return result.data;
    } catch (error) {
      try {
        const fallbackParams: { name: string; params: unknown } = {
          name: toolName,
          params: args,
        };

        const result = await this.callMCP('tools/call', fallbackParams);
        return result.data;
      } catch (fallbackError) {
        const originalMessage = error instanceof Error ? error.message : String(error);
        const fallbackMessage =
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError);

        throw new Error(
          `Failed to call tool '${toolName}'. Tried both 'arguments' and 'params' formats. ` +
            `Original error: ${originalMessage}. Fallback error: ${fallbackMessage}`,
        );
      }
    }
  }

  /**
   * Closes the MCP process and releases resources
   */
  // Kept async: call sites across the codebase (sandbox-provider, mcp-batch-bundler, tests)
  // already `await runner.close()`.
  // eslint-disable-next-line @typescript-eslint/require-await
  public async close(): Promise<void> {
    if (this.mcpProcess) {
      logDebug('Closing MCP subprocess...');

      this.mcpProcess.kill();
      this.mcpProcess = null;

      // Clear pending requests
      for (const [id, request] of this.pendingRequests.entries()) {
        clearTimeout(request.timer);
        request.reject(new Error('MCP process closed'));
        this.pendingRequests.delete(id);
      }
    }
  }

  /**
   * Try to process a data chunk as a JSON-RPC message
   * This method handles both complete JSON-RPC messages and partial messages
   * @param dataStr The data to process
   * @returns True if successfully processed as JSON-RPC, false otherwise
   */
  private tryProcessAsJsonRpc(dataStr: string): boolean {
    // If the data looks like it could be JSON, add it to our buffer and process
    if (dataStr.includes('{') || dataStr.includes('}')) {
      // Process directly through the JSON buffer handler
      return this.processJsonBuffer();
    }

    // Not JSON-related data
    return false;
  }
  /**
   * Process the JSON buffer to extract and handle complete JSON objects
   * @returns True if at least one JSON object was processed, false otherwise
   */
  private processJsonBuffer(): boolean {
    // Make sure we have something to process
    if (!this.jsonBuffer || this.jsonBuffer.trim().length === 0) {
      return false;
    }

    let processedSomething = false;
    let startIndex = 0;

    while (startIndex < this.jsonBuffer.length) {
      // Find the start of a JSON object
      const openBraceIndex = this.jsonBuffer.indexOf('{', startIndex);

      // If no opening brace, clear non-JSON data and return
      if (openBraceIndex === -1) {
        // Clear any non-JSON data that might be in the buffer
        if (startIndex > 0) {
          this.jsonBuffer = this.jsonBuffer.substring(startIndex);
        }
        return processedSomething;
      }

      // Now find the matching closing brace
      let braceCount = 1;
      let closeBraceIndex = -1;

      for (let i = openBraceIndex + 1; i < this.jsonBuffer.length; i++) {
        // Handle string literals properly - they might contain braces that shouldn't be counted
        if (this.jsonBuffer[i] === '"') {
          // Skip to the end of the string literal
          i++;
          while (i < this.jsonBuffer.length && this.jsonBuffer[i] !== '"') {
            // Handle escaped quotes in strings
            if (this.jsonBuffer[i] === '\\' && i + 1 < this.jsonBuffer.length) {
              i++; // Skip the next character (the escaped one)
            }
            i++;
          }
          continue;
        }

        if (this.jsonBuffer[i] === '{') {
          braceCount++;
        } else if (this.jsonBuffer[i] === '}') {
          braceCount--;

          if (braceCount === 0) {
            closeBraceIndex = i;
            break;
          }
        }
      }

      // If we found a complete JSON object
      if (closeBraceIndex !== -1) {
        try {
          // Extract the complete JSON object
          const jsonString = this.jsonBuffer.substring(openBraceIndex, closeBraceIndex + 1);

          // Parse the JSON object
          const response = JSON.parse(jsonString) as JsonRpcMessage;

          // Process this object
          if (this.handleJsonRpcMessage(response)) {
            processedSomething = true;
          }

          // Remove the processed object from the buffer
          this.jsonBuffer =
            this.jsonBuffer.substring(0, openBraceIndex) +
            this.jsonBuffer.substring(closeBraceIndex + 1);

          // Reset the start index to process the next object
          startIndex = 0;
        } catch {
          // Skip this object if there's a parse error
          startIndex = closeBraceIndex + 1;
        }
      } else {
        // No complete JSON object found, move start index past the opening brace
        startIndex = openBraceIndex + 1;
      }
    }

    // Clear the buffer if it gets too large
    if (this.jsonBuffer.length > 500000) {
      // 500KB limit
      logWarn(`JSON buffer exceeded 500KB limit, clearing it to prevent memory issues`);
      this.jsonBuffer = '';
    }

    return processedSomething;
  }

  /**
   * Process a single JSON-RPC message
   * @param response The parsed JSON-RPC message
   * @returns True if the message was successfully processed, false otherwise
   */
  private handleJsonRpcMessage(response: JsonRpcMessage): boolean {
    // Handle JSON-RPC responses (they have an id field)
    if (response.id) {
      // Make sure the ID is properly extracted
      let responseId: string | undefined = response.id;

      // If the response ID is truncated, try to match it with pending requests
      if (responseId && typeof responseId === 'string') {
        // Check for truncated ID match if exact match fails
        if (!this.pendingRequests.has(responseId)) {
          // Check if this ID is a prefix of any pending request ID
          const idToMatch = responseId;
          const matchingKey = Array.from(this.pendingRequests.keys()).find(
            (key) => key.startsWith(idToMatch) || idToMatch.startsWith(key),
          );

          if (matchingKey) {
            // Found a partial match for the ID
            responseId = matchingKey;
          }
        }
      }

      // Now check with the possibly corrected ID
      if (responseId && this.pendingRequests.has(responseId)) {
        const request = this.pendingRequests.get(responseId);
        if (request) {
          // Clear the timeout
          clearTimeout(request.timer);
          this.pendingRequests.delete(responseId);

          // Resolve or reject based on the response
          if (response.error) {
            request.reject(new Error(response.error.message || 'Unknown error'));
          } else {
            request.resolve({ data: response.result });
          }

          return true;
        }
      } else {
        // ID doesn't match any pending request
      }
    }
    // Handle JSON-RPC notifications (they have method but no id)
    else if (response.method) {
      logDebug(`Received MCP notification: ${response.method}`);
      return true;
    }

    return false;
  }

  /**
   * Makes a call to the MCP process
   * @param method Method to call
   * @param params Parameters to pass
   * @returns Call result
   */
  private async callMCP(method: string, params: any): Promise<MCPSubprocessResult> {
    await this.ensureProcessRunning();
    const requestId = randomUUID();
    logDebug(`Calling MCP method: ${method} with ID: ${requestId} and params:`, params);
    return new Promise<MCPSubprocessResult>((resolve, reject) => {
      try {
        // Create the request object
        const request: { jsonrpc: string; id: string; method: string; params: unknown } = {
          jsonrpc: '2.0',
          id: requestId,
          method,
          params,
        };

        // Set up a timeout for the request
        const timer = setTimeout(() => {
          if (this.pendingRequests.has(requestId)) {
            logDebug(`RPC timeout for request ${requestId} after ${this.options.rpcTimeout}ms`);
            this.pendingRequests.delete(requestId);
            reject(new Error(`RPC timeout after ${this.options.rpcTimeout}ms`));
          }
        }, this.options.rpcTimeout);

        // Store the pending request
        this.pendingRequests.set(requestId, { resolve, reject, timer });

        // Send the request to the process
        if (this.mcpProcess && this.mcpProcess.stdin) {
          this.mcpProcess.stdin.write(JSON.stringify(request) + '\n');
        } else {
          logError('MCP process not available for sending request');
          reject(new Error('MCP process not available'));
        }
      } catch (error) {
        logError('Error sending MCP request:', error);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private handleMcpStdOut(data: Buffer): void {
    let output = '';

    try {
      const dataStr = data.toString();

      // Process the raw data through our jsonBuffer first
      this.jsonBuffer += dataStr;

      // Try to extract complete JSON objects from the buffer
      const processedSomething = this.processJsonBuffer();

      // If we processed any complete JSON objects, we can skip normal processing
      if (processedSomething) {
        return;
      }

      // First, check if this could be a JSON-RPC message
      // tryProcessAsJsonRpc already handles response resolution internally
      if (this.tryProcessAsJsonRpc(dataStr)) {
        // Successfully processed as JSON-RPC, skip normal logging
        return;
      }

      // Process as normal log output
      const lines = dataStr.trim().split('\n');
      const charsToShow: string[] = [];
      const maxCharsToShow = 200;

      let mcpName = '';
      let logLevel = '';

      for (const line of lines) {
        if (!line.trim()) continue;

        if (mcpName === '') {
          const pathParts = this.bundlePath.split(path.sep);
          for (let i = 0; i < pathParts.length; i++) {
            if (
              (pathParts[i] === 'bundled' || pathParts[i] === 'bundled-mcps') &&
              i + 1 < pathParts.length
            ) {
              mcpName = pathParts[i + 1]; // Get the actual MCP name
              break;
            }
          }
        }

        if (logLevel === '') {
          // Try to determine if this is a log level message
          const logLevelMatch = line.match(
            /^\[(ERROR|WARN|INFO|DEBUG)\]|^(ERROR|WARN|INFO|DEBUG):/,
          );

          if (logLevelMatch) {
            logLevel = (logLevelMatch[1] || logLevelMatch[2]).toUpperCase();
          }
        }

        charsToShow.push(line);
      }

      logLevel = logLevel || 'INFO';

      let emoji = '🔷'; // Default INFO
      if (logLevel === 'ERROR') emoji = '🔴';
      if (logLevel === 'WARN') emoji = '🟠';
      if (logLevel === 'DEBUG') emoji = '🟣';

      output = charsToShow.join('\n').trim();

      logDebug(`${emoji} MCP ${mcpName} <${logLevel}> ${output.substring(0, maxCharsToShow)} ...`);

      // Process any JSON in the normal log output
      if (output.trim().startsWith('{') && output.trim().endsWith('}')) {
        try {
          // Try parsing as JSON
          const response = JSON.parse(output) as JsonRpcMessage;

          // Process through our handler
          if (this.handleJsonRpcMessage(response)) {
            return;
          }
          // Otherwise continue as normal log
        } catch {
          // Not valid JSON, continue as normal log output
        }
      }

      // Normal log output, already processed
    } catch (processError) {
      logError(`Error processing MCP output "${output}":`, processError);
    }
  }

  private handleMcpStdErr(error: Error): void {
    if (this.options.verbose) {
      logError('MCP process error:', error);
    }

    // Clean up
    this.mcpProcess = null;

    // Reject all pending requests
    for (const [id, request] of this.pendingRequests.entries()) {
      clearTimeout(request.timer);
      request.reject(error);
      this.pendingRequests.delete(id);
    }
  }

  private handleMcpExit(code: number | null): void {
    logDebug(`MCP process exited with code ${code}`);

    // Clean up
    this.mcpProcess = null;

    // Reject all pending requests
    for (const [id, request] of this.pendingRequests.entries()) {
      clearTimeout(request.timer);
      request.reject(new Error(`MCP process exited with code ${code}`));
      this.pendingRequests.delete(id);
    }
  }

  /**
   * Gets a user-friendly display name for the runtime
   * @param runtime - The runtime path or name
   * @returns Human-readable runtime name
   */
  private getRuntimeDisplayName(runtime: string): string {
    // Check if it's the QNSC MCP binary being used as Bun runtime
    if (runtime === process.execPath) {
      return 'Bun (via BUN_BE_BUN from QNSC MCP binary)';
    }

    // Check for Bun or Node in PATH
    if (runtime === 'bun') {
      return 'Bun';
    }
    if (runtime === 'node') {
      return 'Node.js';
    }

    // For any other path, try to extract the runtime name
    const basename = runtime.split(/[\\/]/).pop() || runtime;
    if (basename.startsWith('node')) {
      return `Node.js (${runtime})`;
    }
    if (basename.startsWith('bun')) {
      return `Bun (${runtime})`;
    }

    return runtime;
  }

  /**
   * Detects available JavaScript runtimes in priority order
   * @returns Array of runtime paths to try, in order of preference
   */
  private detectAvailableRuntimes(): string[] {
    const runtimes: string[] = [];

    // Priority 1: System bun (preferred for development)
    runtimes.push('bun');

    // Priority 2: System node (universal fallback)
    runtimes.push('node');

    // Priority 3: QNSC MCP binary itself as Bun runtime (via BUN_BE_BUN)
    // This works when QNSC MCP is compiled as a Bun executable
    // Using BUN_BE_BUN=1 makes the executable behave as the Bun CLI
    // Requires Bun v1.2.16+ and that this is running from a Bun-compiled binary
    try {
      const execPath = process.execPath;
      // Check if we're running from a compiled Bun executable (not 'node' or 'bun' directly)
      if (
        execPath &&
        !execPath.endsWith('/node') &&
        !execPath.endsWith('/bun') &&
        fs.existsSync(execPath)
      ) {
        logDebug(`✅ Found QNSC MCP binary for BUN_BE_BUN runtime: ${execPath}`);
        runtimes.push(execPath);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logDebug(`Could not detect QNSC MCP binary path: ${errorMessage}`);
    }

    return runtimes;
  }

  /**
   * Ensures the MCP process is running
   */
  private async ensureProcessRunning(): Promise<void> {
    if (this.mcpProcess) {
      return;
    }

    // Try to start the MCP with available JavaScript runtimes
    try {
      // Determine which path to use (development vs production)
      let actualPath = this.bundlePath;

      // If the bundle doesn't exist directly then check if we have an extracted path from the cache
      if (!fs.existsSync(this.bundlePath) && this.options.extractedPath) {
        if (fs.existsSync(this.options.extractedPath)) {
          actualPath = this.options.extractedPath;
          if (this.options.verbose) {
            logDebug(`📁 Using extracted MCP path: ${actualPath}`);
          }
        }
      }

      // Need to use a directory structure that matches the original project
      const bundleDir = path.dirname(actualPath);
      const workingDir = path.dirname(bundleDir);

      // Prepare filtered environment variables
      const env = filterEnvironmentVariables(this.options.envVars, {
        customEnv: this.options.env,
      });

      logDebug(`Subprocess environment variables: ${Object.keys(env).join(', ')}`);

      // Prepare spawn command with any args from options
      const spawnArgs = [actualPath, ...(this.options.args || [])];

      // Detect available runtimes and try them in order
      const availableRuntimes = this.detectAvailableRuntimes();
      const errors: string[] = [];

      for (const runtime of availableRuntimes) {
        try {
          logDebug(`Attempting to start bundled MCP with: ${runtime}`);

          // Resolve the absolute path of the runtime for debugging
          let absoluteRuntimePath: string;
          try {
            if (runtime === process.execPath || path.isAbsolute(runtime)) {
              // Already an absolute path
              absoluteRuntimePath = runtime;
            } else {
              // Try to resolve from PATH using 'which' or 'where' command
              const whichCommand = process.platform === 'win32' ? 'where' : 'which';
              try {
                absoluteRuntimePath = execSync(`${whichCommand} ${runtime}`, {
                  encoding: 'utf8',
                  stdio: ['pipe', 'pipe', 'ignore'],
                })
                  .trim()
                  .split('\n')[0]; // Take first result if multiple
              } catch {
                // If which/where fails, fall back to the original runtime name
                absoluteRuntimePath = runtime;
              }
            }
            logDebug(`📍 Resolved runtime absolute path: ${absoluteRuntimePath}`);
          } catch {
            logDebug(`⚠️ Could not resolve absolute path for ${runtime}, using as-is`);
            absoluteRuntimePath = runtime;
          }

          // Check if this runtime is the QNSC MCP binary itself
          // If so, we need to set BUN_BE_BUN=1 to make it act as Bun CLI
          const isQnscMcpBinary = runtime === process.execPath;
          const runtimeEnv = isQnscMcpBinary
            ? { ...env, ...selectBunBeBunTlsEnv(), BUN_BE_BUN: '1' }
            : env;

          if (isQnscMcpBinary) {
            logDebug(`Using QNSC MCP binary as Bun runtime via BUN_BE_BUN=1`);
          }

          // Log the PATH environment variable being sent to subprocess
          if (runtimeEnv.PATH) {
            logDebug(`📂 Subprocess PATH: ${runtimeEnv.PATH}`);
          } else {
            logDebug(`⚠️ No PATH environment variable set for subprocess`);
          }

          // Spawn returns immediately, even if executable doesn't exist
          // We need to wait for either 'spawn' event (success) or 'error' event (failure)
          const childProcess = spawn(runtime, spawnArgs, {
            stdio: ['pipe', 'pipe', process.stderr],
            cwd: workingDir,
            env: runtimeEnv,
          });

          // Wait for the process to actually start or fail
          const spawnResult = await new Promise<{
            success: boolean;
            error?: Error;
          }>((resolve) => {
            let resolved = false;

            const onSpawn = () => {
              if (!resolved) {
                resolved = true;
                cleanup();
                resolve({ success: true });
              }
            };

            const onError = (error: Error) => {
              if (!resolved) {
                resolved = true;
                cleanup();
                resolve({ success: false, error });
              }
            };

            const onExit = (code: number | null) => {
              if (!resolved) {
                resolved = true;
                cleanup();
                resolve({
                  success: false,
                  error: new Error(`Process exited immediately with code ${code}`),
                });
              }
            };

            const cleanup = () => {
              childProcess.removeListener('spawn', onSpawn);
              childProcess.removeListener('error', onError);
              childProcess.removeListener('exit', onExit);
            };

            childProcess.once('spawn', onSpawn);
            childProcess.once('error', onError);
            childProcess.once('exit', onExit);

            // Timeout after 1 second if no events fire
            setTimeout(() => {
              if (!resolved) {
                resolved = true;
                cleanup();
                resolve({
                  success: false,
                  error: new Error('Process spawn timeout'),
                });
              }
            }, 1000);
          });

          // If spawn failed, try next runtime
          if (!spawnResult.success) {
            const errorMsg = spawnResult.error?.message || 'Unknown error';
            errors.push(`${runtime}: ${errorMsg}`);
            logDebug(`⚠️ Failed to start with ${runtime}: ${errorMsg}`);
            childProcess.kill();
            continue;
          }

          // Success! Set up event handlers and store the process
          this.mcpProcess = childProcess;
          if (this.mcpProcess.stdout) {
            this.mcpProcess.stdout.on('data', (data: Buffer) => this.handleMcpStdOut(data));
          }
          this.mcpProcess.on('exit', (code) => this.handleMcpExit(code));
          this.mcpProcess.on('error', (error) => this.handleMcpStdErr(error));

          // Log which runtime was successfully used (always visible, not just debug)
          const runtimeName = this.getRuntimeDisplayName(runtime);
          logInfo(`🚀 Started bundled MCP server using ${runtimeName}`);
          logDebug(`✅ Successfully started MCP with runtime: ${runtime}`);
          return; // Success!
        } catch (runtimeError) {
          const errorMsg =
            runtimeError instanceof Error ? runtimeError.message : String(runtimeError);
          errors.push(`${runtime}: ${errorMsg}`);
          logDebug(`⚠️ Failed to start with ${runtime}: ${errorMsg}`);
          // Continue to next runtime
        }
      }

      // All runtimes failed
      throw new Error(
        `Failed to start MCP process with any available runtime. Tried: ${availableRuntimes.join(', ')}.\n` +
          `Errors:\n${errors.map((e) => `  - ${e}`).join('\n')}\n\n` +
          `Please install one of the following JavaScript runtimes:\n` +
          `  1. Bun runtime (recommended): https://bun.sh\n` +
          `  2. Node.js: https://nodejs.org\n\n` +
          `Note: When running QNSC MCP as a Bun-compiled MCPB, the binary should be able\n` +
          `to use itself as a runtime (via BUN_BE_BUN). If all runtimes failed, ensure\n` +
          `QNSC MCP was compiled with Bun v1.2.16 or later.`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to start MCP process: ${errorMessage}`);
    }
  }
}
