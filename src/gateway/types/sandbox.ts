/**
 * sandbox.ts - Types for MCP sandbox functionality
 *
 * This module provides types related to running MCP servers in sandboxed environments.
 */
import { EnvVarConfig } from './core';

/**
 * Options for creating an MCP sandbox
 */
export interface MCPSandboxOptions {
  verbose?: boolean;
  timeout?: number;
  envVars?: EnvVarConfig[];
  args?: string[];
  env?: Record<string, string>;
}

/**
 * Result of MCP sandbox execution
 */
export interface SandboxMCPResult {
  client: {
    listTools: (options?: unknown) => Promise<{ tools: unknown[] }>;
    callTool: <T = unknown>(name: string, args?: unknown) => Promise<T>;
  };

  transport: {
    close: () => Promise<void>;
  };

  /**
   * Server info
   */
  serverInfo: {
    name: string;
    version: string;
    [key: string]: unknown;
  };

  /**
   * Protocol capabilities
   */
  capabilities: {
    tools: Record<string, unknown>;
    resources: Record<string, unknown>;
    [key: string]: unknown;
  };
}

/**
 * Options for sandbox MCP provider
 */
export interface SandboxMCPProviderOptions extends MCPSandboxOptions {
  /**
   * Path to the extracted MCP directory (overrides bundlePath for execution)
   */
  extractedPath?: string;
}
