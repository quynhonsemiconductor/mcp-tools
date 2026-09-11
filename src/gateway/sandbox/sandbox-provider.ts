/**
 * Provider for sandboxed MCP servers
 *
 * This module provides access to bundled MCP servers using the BunSubprocessRunner
 * to properly execute MCP servers with STDIO communication.
 */
import fs from 'fs';
import path from 'path';
import { logDebug, logError } from '../../services/logger';
import { MCPSandboxOptions, SandboxMCPResult, ToolInfo } from '../types';
import { BunSubprocessRunner } from './bun-subprocess-runner';

/**
 * Map of active MCP runners by path
 */
const activeMCPRunners = new Map<string, BunSubprocessRunner>();

/**
 * Sandboxed MCP servers provider
 */
export class SandboxProvider {
  /**
   * Initializes a bundled MCP
   * @param bundlePath Path to the bundled MCP file
   * @param options Sandbox options
   * @returns Simple MCP result
   */
  public static async initializeMCP(
    bundlePath: string,
    options: MCPSandboxOptions = {},
  ): Promise<SandboxMCPResult> {
    const resolvedPath = path.resolve(bundlePath);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Bundled MCP not found: ${resolvedPath}`);
    }

    const runner = this.getRunner(resolvedPath, options);
    const { serverInfo, capabilities } = await runner.initialize();

    return {
      client: {
        listTools: async () => {
          const tools = await runner.listTools();
          return { tools };
        },

        callTool: <T = unknown>(name: string, args?: unknown): Promise<T> =>
          runner.callTool(name, args) as Promise<T>,
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

  /**
   * Lists tools from a bundled MCP
   * @param bundlePath Path to the bundled MCP file
   * @param options Sandbox options
   * @returns List of tools
   */
  public static async listTools(
    bundlePath: string,
    options: MCPSandboxOptions = {},
  ): Promise<ToolInfo[]> {
    try {
      const runner = this.getRunner(path.resolve(bundlePath), options);

      return await runner.listTools();
    } catch (error) {
      logError(`Failed to list tools from ${bundlePath}:`, error);
      return [];
    }
  }

  /**
   * Calls a tool on a bundled MCP
   * @param bundlePath Path to the bundled MCP file
   * @param toolName Name of the tool to call
   * @param args Arguments to pass to the tool
   * @param options Sandbox options
   * @returns Result of the tool call
   */
  public static async callTool<T = unknown>(
    bundlePath: string,
    toolName: string,
    args: unknown,
    options: MCPSandboxOptions = {},
  ): Promise<T> {
    const mcpPath = path.resolve(bundlePath);
    const mcpName = path.basename(mcpPath, '.js');

    logDebug(`Calling bundled MCP tool: ${mcpName}/${toolName}`);

    try {
      const runner = this.getRunner(mcpPath, options);
      const result = (await runner.callTool(toolName, args)) as T;

      logDebug(`Bundled MCP tool ${mcpName}/${toolName} completed`);

      return result;
    } catch (error) {
      logDebug(`Bundled MCP tool ${mcpName}/${toolName} failed`, error);

      throw error;
    }
  }

  /**
   * Gets or creates a runner for an MCP
   * @param bundlePath Path to the bundled MCP file
   * @param options Sandbox options
   * @returns BunSubprocessRunner
   */
  private static getRunner(bundlePath: string, options: MCPSandboxOptions): BunSubprocessRunner {
    if (activeMCPRunners.has(bundlePath)) {
      return activeMCPRunners.get(bundlePath)!;
    }

    // Create a new runner
    logDebug(`Creating BunSubprocessRunner`);
    if (options.envVars && options.envVars.length > 0) {
      logDebug(`  envVars: ${options.envVars.map((v) => v.name).join(', ')}`);

      // Check which required env vars are defined in process.env
      const requiredVars = options.envVars.filter((v) => v.required);
      for (const reqVar of requiredVars) {
        if (process.env[reqVar.name]) {
          logDebug(`  ✓ Required env var ${reqVar.name} exists in process.env`);
        } else {
          logDebug(`  ✗ Required env var ${reqVar.name} MISSING in process.env`);
        }
      }
    }

    const runner = new BunSubprocessRunner(bundlePath, options);
    activeMCPRunners.set(bundlePath, runner);

    return runner;
  }
}
