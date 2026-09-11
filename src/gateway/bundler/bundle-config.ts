/**
 * bundle-config.ts - Configuration for bundling third-party MCPs
 */

import { type BuildConfig } from 'bun';
import { existsSync, mkdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { logIf, warnIf } from '../../utils';

export const DEPS_SOURCE_DELIMITER = '// --- deps-source ---';

/**
 * Default bundling configuration options
 */
export const DEFAULT_BUNDLE_CONFIG = {
  target: 'node',
  format: 'esm',
  minify: true,
  sourceMaps: false,
  // Removed commonModules from external list - these should be bundled directly
  // into each MCP to avoid runtime dependency resolution issues in the binary
  commonModules: [] as string[],
  neverBundle: ['fsevents', 'esbuild', 'node-gyp', 'electron'],
};

/**
 * Create a bundle configuration for a specific MCP
 * @param entryPoint Entry point file
 * @param outputFile Output file path
 * @param options Additional options
 * @returns Bundle configuration
 */
export function createBundleConfig(
  entryPoint: string,
  outputFile: string,
  packageTitle: string,
  options: {
    minify?: boolean;
    sourceMaps?: boolean;
    external?: string[];
    format?: 'esm' | 'cjs' | 'iife';
    verbose?: boolean;
    security?: {
      allowFileSystem?: boolean;
      allowedPaths?: string[];
      allowNetwork?: boolean;
      networkAllowlist?: string[];
    };
  } = {},
): BuildConfig {
  const {
    minify = DEFAULT_BUNDLE_CONFIG.minify,
    sourceMaps = DEFAULT_BUNDLE_CONFIG.sourceMaps,
    format = DEFAULT_BUNDLE_CONFIG.format as 'esm' | 'cjs' | 'iife',
    external = [],
    verbose = false,
  } = options;

  const outdir = path.dirname(outputFile);
  const entryName = path.basename(outputFile);

  // Log file details
  if (verbose) {
    try {
      console.log(`📄 Bundling entry point: ${entryPoint}`);
      console.log(`📄 Output file: ${outputFile}`);
      console.log(`📄 Format: ${format}`);

      // Check if entry point exists
      const stats = statSync(entryPoint);
      console.log(`📄 Entry point size: ${stats.size} bytes`);
      console.log(`📄 Entry point modified: ${stats.mtime.toISOString()}`);

      // Check if output directory exists
      const outputDir = path.dirname(outputFile);
      if (!existsSync(outputDir)) {
        console.log(`📁 Creating output directory: ${outputDir}`);
        mkdirSync(outputDir, { recursive: true });
      }
    } catch (error) {
      console.warn(`Error checking entry point or output directory: ${String(error)}`);
    }
  }

  // Bun doesn't support plugins with callbacks yet. See: https://github.com/oven-sh/bun/issues/2771
  logIf(`🏁 Preparing to bundle...`, true);

  // Get dependencies for banner comment
  let banner = `
/**
 * Bundled MCP Server - Generated ${new Date().toISOString()}
 *
 * Source: ${packageTitle}
 *
 * Bundled Libraries:
`;

  try {
    // Try to find package.json in the entry point directory and parent directory if needed
    let packageJsonPath = path.join(path.dirname(entryPoint), 'package.json');

    // If not found, check the parent directory (common with build/dist folders)
    if (!existsSync(packageJsonPath)) {
      const parentDir = path.resolve(path.dirname(entryPoint), '..');
      const parentPath = path.join(parentDir, 'package.json');

      if (existsSync(parentPath)) {
        packageJsonPath = parentPath;
        logIf(`📦 Found package.json in parent directory: ${packageJsonPath}`, verbose);
      }
    }

    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
        dependencies?: Record<string, string>;
      };
      const dependencies = packageJson.dependencies || {}; // Only use runtime dependencies, not dev deps

      logIf(`📦 Found package.json at: ${packageJsonPath}`, verbose);
      logIf(`📦 Dependencies found: ${Object.keys(dependencies).length}`, verbose);
      // Sort dependencies alphabetically
      const sortedDeps = Object.entries(dependencies).sort((a, b) => a[0].localeCompare(b[0]));

      // Add each dependency
      if (sortedDeps.length === 0) {
        banner += ' * - No dependencies found\n';
      }

      for (const [name, version] of sortedDeps) {
        banner += ` * - ${name}@${version}\n`;
      }
    } else {
      warnIf(
        `⚠️ No package.json found at ${packageJsonPath}, skipping dependency comments`,
        verbose,
      );
      banner += ' * - No dependencies found\n';
    }
  } catch (error) {
    warnIf(
      `Could not read package.json to generate dependency comments: ${String(error)}`,
      verbose,
    );
  }

  banner += ' */\n\n';

  // We now handle auto-start by directly modifying the entry point file in mcp-bundler.ts
  // This approach is more reliable than injecting runtime hacks

  const config: BuildConfig = {
    entrypoints: [entryPoint],
    outdir,
    naming: {
      entry: entryName,
    },
    target: 'node', // Always target node for MCPs
    format,
    minify,
    sourcemap: sourceMaps ? 'external' : 'none',
    external: [
      ...DEFAULT_BUNDLE_CONFIG.neverBundle,
      ...DEFAULT_BUNDLE_CONFIG.commonModules,
      ...external,
    ],
    banner,
  };

  // For ESM modules, we need to handle import.meta.url differently
  if (format === 'esm') {
    // For ESM modules, we can't use JavaScript expressions in define values,
    // only JSON-compatible strings. We'll use a simple placeholder that our sandbox
    // can resolve at runtime.
    logIf('📚 Using ESM format, leaving import.meta.url intact', verbose);
  } else {
    // For CJS format, add a simple replacement
    config.define = {
      'import.meta.url': '"import.meta.url"',
    };

    logIf('📚 Using CJS format with import.meta.url replacement', verbose);
  }

  /**
   * FIXME: For now plugins are disabled as theres a lot of issues with intercepting
   * network/disk access when dealing with ESM/CJS/Mixed modules.

  // Add security plugins if security settings are provided
  if (security) {
    // Initialize plugins array if needed
    config.plugins = config.plugins || [];

    // Add filesystem security plugin
    const fsSecurityOptions: FilesystemSecurityOptions = {
      allowFileSystem: security.allowFileSystem ?? false,
      allowedPaths: security.allowedPaths,
      verbose
    };

    // Pass the format to the filesystem security plugin
    logIf(
      `🔒 Creating filesystem security plugin with format: ${format}`,
      verbose
    );
    config.plugins.push(
      createFilesystemSecurityPlugin(fsSecurityOptions, format)
    );

    // Add network security plugin

    const networkSecurityOptions: NetworkSecurityOptions = {
      allowNetwork:
        security.allowNetwork !== undefined ? security.allowNetwork : false,
      networkAllowlist: security.networkAllowlist,
      verbose
    };

    config.plugins.push(createNetworkSecurityPlugin(networkSecurityOptions));
  }
  */

  return config;
}
