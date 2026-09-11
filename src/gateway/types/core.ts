/**
 * core.ts - Fundamental shared types for the MCP toolkit
 *
 * This module provides core type definitions used throughout the MCP toolkit
 * to ensure consistency and reduce duplication.
 */

/**
 * Security configuration
 */
export interface SecurityConfig {
  allowNetwork: boolean;
  allowFileSystem: boolean;
  networkAllowlist?: string[];
  allowedPaths?: string[];
  allowProcessExec?: boolean;
}

/**
 * Environment variable configuration
 */
export interface EnvVarConfig {
  name: string;
  description?: string;
  required: boolean;
  default?: string;
  mock?: string;
}

/**
 * Source repository configuration
 */
export interface SourceConfig {
  repository: string;
  ref: string;
  entrypoint?: string;
  workingDir?: string;
}

/**
 * Build configuration
 */
export interface BuildConfig {
  enabled: boolean;
  command?: string;
  args?: string[];
  startFunction?: string;
  external?: string[];
}

/**
 * Companion server configuration
 */
export interface CompanionConfig {
  name: string;
  description?: string;
  workingDir: string; // Directory relative to repo root
  entrypoint: string; // Path to main entry point relative to workingDir
  build?: BuildConfig;
  staticFiles?: string[]; // Static files to copy, can use source:destination format
}

/**
 * Tool information
 */
export interface ToolInfo {
  name: string;
  description: string;
  schema: unknown;
  annotations?: Record<string, unknown>;
}

/**
 * Subprocess result
 */
export interface SubprocessResult {
  data?: unknown;
  error?: {
    code: string;
    message: string;
    data?: unknown;
  };
}

/**
 * Security risk categories for MCP analysis
 */
export enum SecurityRiskCategory {
  InjectionVulnerabilities = 'injection_vulnerabilities',
  InsecureDataHandling = 'insecure_data_handling',
  AccessControlIssues = 'access_control_issues',
  MaliciousCodePatterns = 'malicious_code_patterns',
  SupplyChainRisks = 'supply_chain_risks',
  SecurityMisconfigurations = 'security_misconfigurations',
  PromptInjectionVectors = 'prompt_injection_vectors',
  ModelExtractionRisks = 'model_extraction_risks',
  NetworkSecurityIssues = 'network_security_issues',
  DataLeakageRisks = 'data_leakage_risks',
}

/**
 * Risk level enum
 */
export enum RiskLevel {
  None = 'none',
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical',
}

/**
 * Security finding interface
 */
export interface SecurityFinding {
  category: SecurityRiskCategory;
  riskLevel: RiskLevel;
  description: string;
  codeSnippet?: string;
  recommendation?: string;
  confidence: number;
  location?: string;
}

/**
 * Security scanner options interface
 */
export interface SecurityScannerOptions {
  verbose?: boolean;
  excludedCategories?: SecurityRiskCategory[];
}

/**
 * Security scan result interface
 */
export interface SecurityScanResult {
  mcpName: string;
  riskScore: number;
  findings: SecurityFinding[];
  scanTime: string;
  summary: string;
  securityCategories: Record<
    SecurityRiskCategory,
    {
      riskLevel: RiskLevel;
      score: number;
    }
  >;
}
