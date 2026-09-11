/**
 * mcp-security-scanner.ts - Security analysis for bundled MCP servers
 *
 * This module provides security scanning capabilities for bundled MCP servers
 * using AWS Bedrock Claude to analyze for potential security issues.
 */
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { logInfo, logWarn, logError } from '../../services/logger';
import fs from 'fs';
import handlebars from 'handlebars';
import path from 'path';
import { logIf } from '../../utils';
import { MCPMetadata, SecurityScannerOptions, SecurityScanResult } from '../types';
import { CodeProcessor, SourceFile } from './utils/code-processor';

const MODEL_ID = 'us.anthropic.claude-3-7-sonnet-20250219-v1:0';

/**
 * Default security scanner options
 */
const DEFAULT_SCANNER_OPTIONS: SecurityScannerOptions = {
  verbose: false,
};

/**
 * Hardcoded Glama API URL for MCP information
 */
const GLAMA_API_URL = 'https://glama.ai/api/mcp/v1';

/**
 * Path to the security analysis prompt template
 */
const SECURITY_ANALYSIS_TEMPLATE_PATH = path.join(
  process.cwd(),
  'templates',
  'security-analysis-prompt.js.tmpl',
);

/**
 * Template cache for security analysis prompt
 */
let securityAnalysisTemplateCache: handlebars.TemplateDelegate | null = null;

/**
 * MCP Security Scanner
 *
 * Uses AWS Bedrock Claude to analyze bundled MCP code for security issues
 */

export class MCPSecurityScanner {
  private readonly options: SecurityScannerOptions;
  private readonly bedrockClient: BedrockRuntimeClient;

  /**
   * Collects source files from a directory for security analysis
   * @param sourceDir Directory to scan for source files
   * @returns Array of source files with their contents
   */
  private async collectSourceFiles(sourceDir: string): Promise<SourceFile[]> {
    const sourceFiles: SourceFile[] = [];
    const ignoreDirs = [
      'node_modules',
      '.git',
      'dist',
      'build',
      'coverage',
      'tests',
      'test',
      '__tests__',
      '__mocks__',
    ];
    const ignoreFilePatterns = [
      /\.test\.(ts|js)$/,
      /\.spec\.(ts|js)$/,
      /test_.*\.(ts|js)$/,
      /.*_test\.(ts|js)$/,
    ];
    const allowedExtensions = ['.ts', '.js'];
    const codeProcessor = new CodeProcessor({ verbose: this.options.verbose });

    // Function to check if a file should be ignored
    const shouldIgnoreFile = (fileName: string): boolean => {
      return ignoreFilePatterns.some((pattern) => pattern.test(fileName));
    };

    // Function to recursively scan directories
    const scanDir = async (dir: string, baseDir: string): Promise<void> => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath);

        // Skip ignored directories
        if (entry.isDirectory()) {
          if (!ignoreDirs.includes(entry.name)) {
            await scanDir(fullPath, baseDir);
          }
          continue;
        }

        // Skip test files
        if (shouldIgnoreFile(entry.name)) {
          logIf(`Skipped test file: ${relativePath}`, this.options.verbose!);
          continue;
        }

        // Process files with allowed extensions
        const ext = path.extname(entry.name).toLowerCase();
        if (allowedExtensions.includes(ext)) {
          try {
            // Process the file using the CodeProcessor
            const processedFile = await codeProcessor.processSourceFile(fullPath, baseDir);
            sourceFiles.push(processedFile);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logWarn(`Failed to read file ${fullPath}: ${message}`);
          }
        }
      }
    };

    await scanDir(sourceDir, sourceDir);

    // Calculate total token counts
    const totalOriginalTokens = sourceFiles.reduce((sum, file) => sum + file.originalTokens, 0);
    const totalMinifiedTokens = sourceFiles.reduce((sum, file) => sum + file.minifiedTokens, 0);
    const totalReduction = (
      ((totalOriginalTokens - totalMinifiedTokens) / totalOriginalTokens) *
      100
    ).toFixed(1);

    logInfo(
      `Collected ${sourceFiles.length} source files with ${totalMinifiedTokens} tokens (reduced by ${totalReduction}% from ${totalOriginalTokens})`,
    );

    return sourceFiles;
  }

  /**
   * Creates a new MCP security scanner
   * @param options Scanner options
   */
  constructor(options: SecurityScannerOptions = {}) {
    this.options = {
      ...DEFAULT_SCANNER_OPTIONS,
      ...options,
      verbose: options.verbose || false,
    };

    this.bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });

    logIf(
      `Initialized MCP Security Scanner with Bedrock in ${process.env.AWS_REGION || 'us-east-1'}`,
      this.options.verbose!,
    );
  }

  /**
   * Scans an MCP source repository for security issues
   * @param sourceRepoPath Path to the source repository directory
   * @param metadataPath Path to the metadata file
   * @returns Security scan results
   */
  public async scanMCP(sourceRepoPath: string, metadataPath: string): Promise<SecurityScanResult> {
    if (!fs.existsSync(sourceRepoPath)) {
      throw new Error(`MCP source repository not found: ${sourceRepoPath}`);
    }

    if (!fs.existsSync(metadataPath)) {
      throw new Error(`Metadata file not found: ${metadataPath}`);
    }

    // Ensure source path is a directory
    const sourceStats = fs.statSync(sourceRepoPath);
    if (!sourceStats.isDirectory()) {
      throw new Error(`Source repository path must be a directory: ${sourceRepoPath}`);
    }

    // Read metadata
    let metadata: Partial<MCPMetadata> = {};
    try {
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as Partial<MCPMetadata>;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse metadata file: ${message}`);
    }

    // Get MCP name from metadata or source repo path
    let mcpName = metadata.name;
    if (!mcpName) {
      mcpName = path.basename(sourceRepoPath);
    }

    // Extract repository name from metadata if available
    let repoName = '';
    if (metadata.source && metadata.source.repository) {
      // Extract repo name from URL like 'github.com/org/repo'
      const repoMatch = metadata.source.repository.match(/\.com\/([\w-]+\/[\w-]+)/);
      repoName = repoMatch ? repoMatch[1] : mcpName;
    } else {
      repoName = mcpName;
    }

    // Fetch Glama API information
    logIf(`⬇️  Fetching Glama API info for ${repoName}`, this.options.verbose!);

    let glamaApiInfo: Record<string, unknown> = {};
    try {
      glamaApiInfo = await this.fetchGlamaApiInfo(repoName);
    } catch (error) {
      logError(error instanceof Error ? error.message : String(error));
    }

    // Collect and analyze source files with Claude
    logInfo(`Analyzing ${mcpName} source code with Claude...`);

    // Use the source repository path for scanning
    const sourceFiles = await this.collectSourceFiles(sourceRepoPath);
    const scanResult = await this.analyzeWithClaude(sourceFiles, glamaApiInfo, mcpName);

    logInfo(`Scan completed for ${mcpName} with risk score: ${scanResult.riskScore}`);
    logIf(`❕Found ${scanResult.findings.length} security issues`, this.options.verbose!);

    return scanResult;
  }

  /**
   * Fetches additional information from Glama API
   * @param mcpName MCP name to fetch information for
   * @returns Glama API information
   */
  private async fetchGlamaApiInfo(mcpName: string): Promise<Record<string, unknown>> {
    const url = `${GLAMA_API_URL}/servers/${mcpName}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`⛔ Glama API Error: ${response.statusText}`);
    }

    return (await response.json()) as Record<string, unknown>;
  }

  /**
   * Analyzes source files with Claude using AWS Bedrock
   * @param sourceFiles Source files to analyze
   * @param metadata MCP metadata
   * @param glamaApiInfo Glama API information
   * @param mcpName MCP name
   * @returns Security scan results
   */
  private async analyzeWithClaude(
    sourceFiles: SourceFile[],
    glamaApiInfo: Record<string, unknown>,
    mcpName: string,
  ): Promise<SecurityScanResult> {
    const prompt = this.buildSecurityAnalysisPrompt(sourceFiles, glamaApiInfo, mcpName);

    try {
      // Prepare the request for Claude
      const input = {
        modelId: MODEL_ID,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 8000,
          temperature: 0,
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: prompt }],
            },
          ],
        }),
      };

      // Invoke Claude
      const command = new InvokeModelCommand(input);
      const response = await this.bedrockClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body)) as {
        content: { type: string; text: string }[];
      };
      const claudeResponse = responseBody.content[0].text;

      logIf('Received response from Claude', this.options.verbose || false);

      return this.extractSecurityResults(claudeResponse, mcpName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError(`Error analyzing code with Claude: ${message}`);
      throw new Error(`Failed to analyze MCP security: ${message}`);
    }
  }

  /**
   * Builds the security analysis prompt for Claude
   * @param code Code to analyze
   * @param metadata MCP metadata
   * @param glamaApiInfo Glama API information
   * @param mcpName MCP name
   * @returns Prompt for Claude
   */
  /**
   * Get the security analysis template
   * @returns Compiled template function
   */
  private getSecurityAnalysisTemplate(): handlebars.TemplateDelegate {
    if (securityAnalysisTemplateCache) {
      return securityAnalysisTemplateCache;
    }

    try {
      if (!fs.existsSync(SECURITY_ANALYSIS_TEMPLATE_PATH)) {
        throw new Error(`Template file not found: ${SECURITY_ANALYSIS_TEMPLATE_PATH}`);
      }

      // Read and compile the template
      const templateContent = fs.readFileSync(SECURITY_ANALYSIS_TEMPLATE_PATH, 'utf-8');

      if (!templateContent || templateContent.trim().length === 0) {
        throw new Error(`Empty template file: ${SECURITY_ANALYSIS_TEMPLATE_PATH}`);
      }

      const template = handlebars.compile(templateContent);
      securityAnalysisTemplateCache = template;

      return template;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError(`Error loading security analysis template: ${message}`);
      throw new Error(`Failed to load security analysis template: ${message}`);
    }
  }

  private buildSecurityAnalysisPrompt(
    sourceFiles: SourceFile[],
    glamaApiInfo: Record<string, unknown>,
    mcpName: string,
  ): string {
    const template = this.getSecurityAnalysisTemplate();

    // format source files for analysis
    const codeProcessor = new CodeProcessor({ verbose: this.options.verbose });
    const { formattedCode: formattedSourceCode } =
      codeProcessor.formatSourceFilesForPrompt(sourceFiles);

    return template({
      mcpName,
      code: formattedSourceCode,
      glamaApiInfo:
        glamaApiInfo && Object.keys(glamaApiInfo).length > 0
          ? JSON.stringify(glamaApiInfo, null, 2)
          : null,
    });
  }

  /**
   * Extracts security results from Claude's response
   * @param claudeResponse Claude's response
   * @param mcpName MCP name
   * @returns Security scan results
   */
  private extractSecurityResults(claudeResponse: string, mcpName: string): SecurityScanResult {
    try {
      // Extract JSON from Claude's response
      let jsonMatch = claudeResponse.match(/```json\n([\s\S]*?)```/);

      if (!jsonMatch) {
        // Try without the json tag
        jsonMatch = claudeResponse.match(/```\n([\s\S]*?)```/);
      }

      if (!jsonMatch) {
        // If still no match, try to parse the entire response as JSON
        try {
          const result = JSON.parse(claudeResponse) as Partial<SecurityScanResult>;
          return {
            ...result,
            mcpName,
            scanTime: new Date().toISOString(),
          } as SecurityScanResult;
        } catch {
          throw new Error(`Could not parse Claude response as JSON: ${claudeResponse}`);
        }
      }

      const jsonStr = jsonMatch[1];
      const result = JSON.parse(jsonStr) as Partial<SecurityScanResult>;

      return {
        ...result,
        mcpName,
        scanTime: new Date().toISOString(),
      } as SecurityScanResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError(`Error extracting security results: ${message}`);
      throw new Error(`Failed to parse security analysis results: ${message}`);
    }
  }
}

/**
 * Default function to scan an MCP source repository
 * @param sourceRepoPath Path to the MCP source repository directory
 * @param metadataPath Path to the metadata file
 * @param options Scanner options
 * @returns Security scan results
 */
export async function scanMCPSecurity(
  sourceRepoPath: string,
  metadataPath: string,
  options: SecurityScannerOptions = {},
): Promise<SecurityScanResult> {
  const scanner = new MCPSecurityScanner(options);
  return scanner.scanMCP(sourceRepoPath, metadataPath);
}
