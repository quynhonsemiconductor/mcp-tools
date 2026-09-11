/**
 * code-processor.ts - Utilities for processing code for security analysis
 *
 * This module provides utilities for minifying code and counting tokens
 * to optimize the security scanning process.
 */
import { countTokens } from '@anthropic-ai/tokenizer';
import fs from 'fs';
import path from 'path';
import { logIf } from '../../../utils';

/**
 * Interface for a source file to be analyzed
 */
export interface SourceFile {
  path: string;
  content: string;
  relativePath: string;
  originalTokens: number;
  minifiedTokens: number;
  score?: number;
}

/**
 * Class responsible for code processing, minification and token counting
 */
export class CodeProcessor {
  private verbose: boolean;

  /**
   * Creates a new CodeProcessor instance
   * @param verbose Whether to output verbose logs
   */
  constructor(options: { verbose?: boolean } = {}) {
    this.verbose = options.verbose || false;
  }

  /**
   * Minifies TypeScript/JavaScript code to reduce size while preserving security-relevant aspects
   * @param code The source code to minify
   * @returns Minified code
   */
  public minifyTypeScript(code: string): string {
    code = code.replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments
    code = code.replace(
      /\/\/(?!.*?(security|SECURITY|vulnerable|VULNERABLE|hack|exploit|TODO|FIXME|BUG|XXX|password|token|secret|key)).*?$/gm,
      '',
    ); // Remove single-line comments that don't contain security-relevant keywords
    code = code.replace(/:\s*([A-Za-z][A-Za-z0-9_]*(?:<.*?>)?)(\\[\\])?\\s*(?=[,);={])/g, ''); // Remove TypeScript interfaces and types
    code = code.replace(/\s+/g, ' '); // Collapse multiple spaces into one
    code = code.replace(/(\{|\}|\(|\)|\[|\]|,|;|:|\.)\s/g, '$1'); // Whitespace before punctuation
    code = code.replace(/\s(\{|\}|\(|\)|\[|\]|,|;|:|\.)/g, '$1'); // Whitespace around punctuation
    code = code.replace(/\$\{\s+/g, '${'); // Remove space after ${
    code = code.replace(/\s+\}/g, '}'); // Remove space before }
    code = code.replace(/}\s*if\s*\(/g, '} if('); // Join closing brace with if statement
    code = code.replace(/}\s*else\s*{/g, '} else {'); // Fix formatting of else blocks
    code = code.replace(/`\s*\n\s*\$\{/g, '`${'); // Fix line breaks before ${ in template literals
    code = code.replace(/}\s*\n\s*`/g, '}`'); // Fix line breaks between } and ` in template literals
    code = code.replace(/\n\s*\)\s*;/g, ');'); // Fix line breaks before closing parenthesis with semicolon
    code = code.replace(/\n\s*\n+/g, '\n'); // Replace multiple consecutive line breaks with a single one
    code = code.replace(/;\s*(?=\w)/g, '; '); // Keep semicolons inline with next statement

    return code.trim();
  }

  /**
   * Count tokens in a string using the Anthropic tokenizer
   * @param text Text to count tokens for
   * @returns Number of tokens
   */
  public countTokens(text: string): number {
    return countTokens(text);
  }

  /**
   * Process a source file by minifying it and counting tokens
   * @param filePath Full path to the file
   * @param baseDir Base directory for calculating relative paths
   * @returns Processed source file with token counts
   */
  public async processSourceFile(filePath: string, baseDir: string): Promise<SourceFile> {
    const originalContent = await fs.promises.readFile(filePath, 'utf-8');
    const relativePath = path.relative(baseDir, filePath);
    const originalTokenCount = this.countTokens(originalContent);

    // Minify the content
    const minifiedContent = this.minifyTypeScript(originalContent);
    const minifiedTokenCount = this.countTokens(minifiedContent);

    return {
      path: filePath,
      relativePath,
      content: minifiedContent,
      originalTokens: originalTokenCount,
      minifiedTokens: minifiedTokenCount,
    };
  }

  /**
   * Format source files for analysis
   * @param sourceFiles Array of source files
   * @param maxCodeTokens Maximum tokens to include
   * @returns Formatted source code ready for prompt
   */
  public formatSourceFilesForPrompt(
    sourceFiles: SourceFile[],
    maxCodeTokens = 170000,
  ): { formattedCode: string; includedFiles: number; totalTokens: number } {
    // Calculate total tokens
    const totalTokens = sourceFiles.reduce((sum, file) => sum + file.minifiedTokens, 0);

    // Format each file for inclusion
    const formattedFiles: {
      content: string;
      tokens: number;
      path: string;
      score?: number;
    }[] = sourceFiles.map((file) => {
      const fileContent = `File: ${file.relativePath}\n\n${file.content}\n\n`;
      const tokens = this.countTokens(fileContent);
      return {
        content: fileContent,
        tokens,
        path: file.relativePath,
        score: file.score || 0,
      };
    });

    let formattedSourceCode = '';
    let includedFilesCount = 0;

    if (totalTokens > maxCodeTokens) {
      logIf(
        `⚠️ Source code exceeds token limit: ${totalTokens} tokens (limit ${maxCodeTokens}). Prioritizing important files...`,
        this.verbose,
      );

      // Prioritize files that are likely to be security-relevant
      const securityKeywords = [
        'auth',
        'security',
        'permission',
        'token',
        'password',
        'encrypt',
        'decrypt',
        'api',
        'request',
      ];

      // Score files by relevance
      formattedFiles.forEach((file) => {
        // Reset score for each file
        file.score = 0;
        // Higher score for files with security-related terms in path
        for (const keyword of securityKeywords) {
          if (file.path.toLowerCase().includes(keyword)) {
            file.score += 5;
          }
        }
        // Higher score for files with network/fs operations in content
        if (
          file.content.includes('fetch(') ||
          file.content.includes('axios.') ||
          file.content.includes('http.') ||
          file.content.includes('fs.') ||
          file.content.includes('readFile') ||
          file.content.includes('writeFile')
        ) {
          file.score += 10;
        }
      });

      // Sort files by relevance score
      formattedFiles.sort((a, b) => (b.score || 0) - (a.score || 0));

      // Include files until we hit the token limit
      let currentTokens = 0;
      const includedFiles = [];

      for (const file of formattedFiles) {
        if (currentTokens + file.tokens <= maxCodeTokens) {
          includedFiles.push(file.content);
          currentTokens += file.tokens;
          logIf(
            `Included file: ${file.path} (score: ${file.score}, tokens: ${file.tokens})`,
            this.verbose,
          );
          includedFilesCount++;
        } else {
          logIf(`Skipped file due to token limit: ${file.path}`, this.verbose);
        }
      }

      formattedSourceCode = includedFiles.join('---\n\n');
      logIf(
        `📊 Included ${includedFilesCount} of ${sourceFiles.length} files (${Math.round((currentTokens * 100) / totalTokens)}% of total tokens)`,
        this.verbose,
      );
    } else {
      formattedSourceCode = formattedFiles.map((f) => f.content).join('---\n\n');
      includedFilesCount = sourceFiles.length;
    }

    return {
      formattedCode: formattedSourceCode,
      includedFiles: includedFilesCount,
      totalTokens,
    };
  }
}
