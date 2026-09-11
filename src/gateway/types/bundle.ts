/**
 * bundle.ts - Types for MCP bundling functionality
 *
 * This module provides types related to bundling and packaging MCP servers.
 */
import {
  CompanionConfig,
  EnvVarConfig,
  SecurityConfig,
  SecurityScanResult,
  ToolInfo,
} from './core';

/**
 * Bundled MCP information
 */
export interface BundledMCPInfo {
  path: string;
  name: string;
  version: string;
  tools: ToolInfo[];
  enabled: boolean;
  security?: SecurityConfig;
  envVars?: EnvVarConfig[];
  args?: string[];
}

/**
 * Options for bundling an MCP
 */
export interface MCPBundleOptions {
  mcpName: string;
  mcpSource: string | GitRepoSource;
  entryPoint?: string;
  outputPath?: string;
  buildProject?: boolean;
  buildCommand?: string;
  minify?: boolean;
  sourceMaps?: boolean;
  verbose?: boolean;
  staticFiles?: string[];
  envVars?: EnvVarConfig[];
  args?: string[];
  startFunction?: string;
  security?: Partial<SecurityConfig>;
  companions?: CompanionConfig[];
  external?: string[];
}

/**
 * Result of bundling an MCP
 */
export interface MCPBundleResult {
  bundle: string;
  metadata: MCPMetadata;
  outputDir: string;
  sourceRepoPath?: string;
  cloneResult?: CloneResult;
}

/**
 * Metadata for a companion server
 */
export interface CompanionMetadata {
  name: string;
  description?: string;
  entryPoint: string;
  bundlePath: string;
  dependencies: Record<string, string>;
  moduleFormat: 'esm' | 'commonjs' | 'mixed';
  version?: string;
  staticFiles?: string[];
}

/**
 * MCP metadata extracted during bundling
 */
export interface MCPMetadata {
  name: string;
  version: string;
  entryPoint: string;
  dependencies: Record<string, string>;
  bundleSize: number;
  moduleFormat: 'esm' | 'commonjs' | 'mixed';
  tools?: ToolInfo[];
  envVars?: EnvVarConfig[];
  args?: string[];
  companions?: CompanionMetadata[];

  source?: {
    repository?: string;
    ref?: string;
  };

  security?: SecurityConfig;

  securityScan?: {
    timestamp: string;
    riskScore: number;
    summary: string;
    findingsCount: number;
  };
}

/**
 * Result of bundling an MCP
 */
export interface BundleResult {
  name: string;
  path: string;
  success: boolean;
  error?: string;
  securityScan?: SecurityScanResult;
}

/**
 * Options for batch bundling
 */
export interface BatchBundleOptions extends BaseBundleOptions {
  configDir: string;
  outputDir: string;
}

/**
 * Result of dependency analysis
 */
export interface DependencyAnalysisResult {
  declaredDependencies: Record<string, string>;
  sourceImports: Set<string>;
  entryPoint: string;
  moduleFormat: 'esm' | 'commonjs' | 'mixed';
}

/**
 * Options for bundling MCPs from configuration files
 */
export interface BundleMCPsOptions extends BaseBundleOptions {
  configDir?: string;
  outputDir?: string;
  mcpName?: string;
}

/**
 * Git repository source with required tag
 */
export interface GitRepoSource {
  url: string;
  ref: string;
  workingDir?: string;
}
/**
 * Result of cloning a repository
 */
export interface CloneResult {
  path: string;
  success: boolean;
  error?: string;
  shouldCleanup: boolean;
  workingDir?: string;
}

/**
 * Base bundle options
 */
export interface BaseBundleOptions {
  verbose?: boolean;
  securityScan?: boolean;
}
