/**
 * config.ts - Types for MCP configuration
 *
 * This module provides types related to configuring MCP servers.
 */
import { BuildConfig, CompanionConfig, EnvVarConfig, SecurityConfig, SourceConfig } from './core';

/**
 * Configuration for a third-party MCP server
 */
export interface MCPConfig {
  name?: string;
  description?: string;
  source: SourceConfig;
  build: BuildConfig;
  security: SecurityConfig;
  staticFiles?: string[];
  envVars?: EnvVarConfig[];
  companions?: CompanionConfig[];
}

/**
 * Result of loading an MCP configuration
 */
export interface MCPConfigResult {
  config: MCPConfig;
  filePath: string;
  fileName: string;
}
