/**
 * dependency-analyzer.ts - Analyzes dependencies for third-party MCPs
 *
 * This module handles analyzing dependencies for third-party MCPs to ensure
 * that all required dependencies are included in the bundle.
 */

import { parse as parseImports, initSync as parseInitSync } from 'es-module-lexer';
import fs from 'fs';
import { readFile, readdir, stat } from 'fs/promises';
import { extname, join } from 'path';
import { DependencyAnalysisResult } from '../types';

/**
 * Analyzes dependencies for a third-party MCP
 */
export class DependencyAnalyzer {
  constructor() {
    // Initialize the ESM lexer
    parseInitSync();
  }

  /**
   * Analyze dependencies for an MCP
   * @param mcpDir Directory containing the MCP
   * @returns Dependency analysis result
   */
  public async analyzeDependencies(mcpDir: string): Promise<DependencyAnalysisResult> {
    const declaredDeps = await this.getDeclaredDependencies(mcpDir);
    const entryPoint = await this.detectEntryPoint(mcpDir);
    const { imports, format } = await this.analyzeSourceImports(mcpDir);

    return {
      declaredDependencies: declaredDeps,
      sourceImports: imports,
      entryPoint,
      moduleFormat: format,
    };
  }

  /**
   * Get declared dependencies from package.json
   * @param mcpDir Directory containing the MCP
   * @returns Declared dependencies
   */
  private async getDeclaredDependencies(mcpDir: string): Promise<Record<string, string>> {
    try {
      const packageJsonPath = join(mcpDir, 'package.json');
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
        dependencies?: Record<string, string>;
      };

      // Only include runtime dependencies, not dev dependencies
      return packageJson.dependencies || {};
    } catch {
      // If package.json doesn't exist or can't be read, return empty object
      return {};
    }
  }

  /**
   * Detect entry point for an MCP
   * @param mcpDir Directory containing the MCP
   * @returns Detected entry point (relative to mcpDir)
   */
  private async detectEntryPoint(mcpDir: string): Promise<string> {
    // Try to get entry point from package.json
    try {
      const packageJsonPath = join(mcpDir, 'package.json');
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as Record<
        'main' | 'module' | 'exports',
        string | Record<string, string> | undefined
      >;

      // Check for main fields in priority order
      for (const field of ['main', 'module', 'exports'] as const) {
        const value = packageJson[field];
        if (typeof value === 'string') {
          return value;
        } else if (value && value['.']) {
          // Handle exports: { ".": "./file.js" } pattern
          return value['.'];
        }
      }
    } catch {
      // Ignore package.json errors and fall back to file detection
    }

    // If not found in package.json, look for common entry point files
    const commonEntryPoints = [
      'index.js',
      'main.js',
      'server.js',
      'app.js',
      'mcp.js',
      'build/index.js',
      'build/main.js',
      'build/server.js',
      'src/index.js',
      'dist/index.js',
    ];

    for (const entryPoint of commonEntryPoints) {
      try {
        await stat(join(mcpDir, entryPoint));
        return entryPoint;
      } catch {
        // File doesn't exist, try next candidate
      }
    }

    // If no common entry point found, look for any JS file
    try {
      const files = await readdir(mcpDir);
      const jsFiles = files.filter((file) => file.endsWith('.js'));

      if (jsFiles.length > 0) {
        return jsFiles[0];
      }
    } catch {
      // Ignore directory read errors
    }

    throw new Error(`Could not detect entry point for MCP in ${mcpDir}`);
  }

  /**
   * Analyze source files to find imports
   * @param mcpDir Directory containing the MCP
   * @returns Source imports and detected module format
   */
  private async analyzeSourceImports(
    mcpDir: string,
  ): Promise<{ imports: Set<string>; format: 'esm' | 'commonjs' | 'mixed' }> {
    const imports = new Set<string>();
    let esmFileCount = 0;
    let cjsFileCount = 0;

    // Walk the directory recursively
    await this.walkDirectory(mcpDir, async (filePath) => {
      // Only process JS files
      if (extname(filePath) !== '.js') {
        return;
      }

      try {
        const content = await readFile(filePath, 'utf8');

        // Check for ESM imports
        try {
          const [esmImports] = parseImports(content);
          if (esmImports.length > 0) {
            esmFileCount++;

            for (const imp of esmImports) {
              const importPath = content.substring(imp.s, imp.e);

              // Remove quotes and get the package name
              const cleanPath = importPath.replace(/['"]/g, '');

              // If it's a package import (not relative), add it
              if (!cleanPath.startsWith('.') && !cleanPath.startsWith('/')) {
                imports.add(this.getPackageName(cleanPath));
              }
            }
          }
        } catch {
          // Not valid ESM, ignore parsing error
        }

        // Check for CommonJS requires
        const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
        let match;
        let hasRequire = false;

        while ((match = requireRegex.exec(content)) !== null) {
          hasRequire = true;
          const importPath = match[1];

          // If it's a package import (not relative), add it
          if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
            imports.add(this.getPackageName(importPath));
          }
        }

        if (hasRequire) {
          cjsFileCount++;
        }
      } catch {
        // Ignore file read errors
      }
    });

    // Determine module format
    let format: 'esm' | 'commonjs' | 'mixed';

    // Default to mixed if we can't determine
    format = 'mixed';

    // First check package.json for "type" field as it's the most reliable indicator
    let packageJsonType: string | undefined;
    try {
      const packageJsonPath = join(mcpDir, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
        type?: string;
      };
      packageJsonType = packageJson.type;

      if (packageJsonType === 'module') {
        console.log(`📦 Package.json specifies "type": "module", using ESM format`);
        format = 'esm';
      } else if (packageJsonType === 'commonjs') {
        console.log(`📦 Package.json specifies "type": "commonjs", using CommonJS format`);
        format = 'commonjs';
      }
    } catch {
      // Ignore errors reading package.json
      console.log(`⚠️ Could not read package.json, will rely on file analysis`);
    }

    // If package.json doesn't specify a type or we couldn't read it, use file analysis
    if (!packageJsonType) {
      if (esmFileCount > 0 && cjsFileCount === 0) {
        format = 'esm';
        console.log(`📊 Detected pure ESM module format (${esmFileCount} ESM files)`);
      } else if (cjsFileCount > 0 && esmFileCount === 0) {
        format = 'commonjs';
        console.log(`📊 Detected pure CommonJS module format (${cjsFileCount} CJS files)`);
      } else {
        format = 'mixed';
        console.log(
          `⚠️ Detected mixed module format (${esmFileCount} ESM, ${cjsFileCount} CJS files). Will use CommonJS format for bundling.`,
        );
      }
    }

    return { imports, format };
  }

  /**
   * Walk a directory recursively
   * @param dir Directory to walk
   * @param callback Callback for each file
   */
  private async walkDirectory(
    dir: string,
    callback: (filePath: string) => Promise<void>,
  ): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        // Skip node_modules
        if (entry.name === 'node_modules' || entry.name === '.git') {
          continue;
        }

        if (entry.isDirectory()) {
          await this.walkDirectory(fullPath, callback);
        } else {
          await callback(fullPath);
        }
      }
    } catch {
      // Ignore directory read errors
    }
  }

  /**
   * Get package name from import path
   * @param importPath Import path
   * @returns Package name
   */
  private getPackageName(importPath: string): string {
    // Handle scoped packages (@scope/package)
    if (importPath.startsWith('@')) {
      const parts = importPath.split('/');
      return parts.length > 1 ? `${parts[0]}/${parts[1]}` : importPath;
    }

    // Handle normal packages and subpaths
    return importPath.split('/')[0];
  }
}
