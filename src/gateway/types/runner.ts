/**
 * runner.ts - Types for MCP runner functionality
 *
 * This module provides types related to running and executing MCP servers.
 */
import { EnvVarConfig, SubprocessResult } from './core';
import { MCPSandboxOptions } from './sandbox';

/**
 * Result from an MCP subprocess call
 */
export type MCPSubprocessResult = SubprocessResult;

/**
 * Options for MCP subprocess execution
 */
export interface BunSubprocessOptions extends MCPSandboxOptions {
  rpcTimeout?: number;
  env?: Record<string, string>;
  extractedPath?: string;
  args?: string[];
  envVars?: EnvVarConfig[];
  networkAllowlist?: string[];
  allowedPaths?: string[];
  captureConsole?: boolean; // If true, capture console output to logs
}
