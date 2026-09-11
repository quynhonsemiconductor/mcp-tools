/**
 * fs-security-plugin.ts - esbuild/Bun plugin for filesystem security
 *
 * This plugin intercepts all fs and fs/promises imports during the build process
 * and replaces them with a secure shim module that blocks or restricts file operations.
 */
import type { BunPlugin } from 'bun';
import fs from 'fs';
import handlebars from 'handlebars';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { logIf } from '../../../utils';

/**
 * Security settings for the filesystem plugin
 */
export interface FilesystemSecurityOptions {
  allowFileSystem: boolean;
  allowedPaths?: string[];
  verbose?: boolean;
}

// Template path
const TEMPLATE_PATH = join(process.cwd(), 'templates', 'fs-security.js.tmpl');

// Template cache
let templateCache: handlebars.TemplateDelegate | null = null;

/**
 * Load and compile the filesystem security template
 *
 * @returns Compiled template function
 */
function getTemplate(): handlebars.TemplateDelegate {
  if (templateCache) {
    return templateCache;
  }

  try {
    if (!fs.existsSync(TEMPLATE_PATH)) {
      console.log(`Template file does not exist: ${TEMPLATE_PATH}`);
      throw new Error(`Template file not found: ${TEMPLATE_PATH}`);
    }

    // Read and compile the template
    const templateContent = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

    if (!templateContent || templateContent.trim().length === 0) {
      console.log(`Template file is empty: ${TEMPLATE_PATH}`);
      throw new Error(`Empty template file: ${TEMPLATE_PATH}`);
    }

    const template = handlebars.compile(templateContent);
    templateCache = template;

    return template;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Error loading template from ${TEMPLATE_PATH}: ${message}`);
    throw new Error(`Failed to load filesystem security template: ${message}`);
  }
}

/**
 * Create a secure filesystem shim that can be imported in place of fs/fs.promises
 *
 * @param options Security options
 * @returns Generated shim code
 */
/**
 * Process allowed paths, converting magic words to actual paths
 *
 * @param allowedPaths Array of allowed paths
 * @returns Array of processed paths
 */
function processAllowedPaths(allowedPaths: string[] | undefined): string[] {
  if (!allowedPaths || allowedPaths.length === 0) {
    return [];
  }

  return allowedPaths.map((path) => {
    // Process magic words
    if (path === 'CWD') {
      return process.cwd();
    } else if (path === 'TEMP' || path === 'TMP') {
      return tmpdir();
    } else if (path === 'HOME') {
      return homedir();
    } else if (path.includes('{{CWD}}')) {
      return path.replace(/\{\{CWD\}\}/g, process.cwd());
    } else if (path.includes('{{TEMP}}') || path.includes('{{TMP}}')) {
      return path.replace(/\{\{(?:TEMP|TMP)\}\}/g, tmpdir());
    } else if (path.includes('{{HOME}}')) {
      return path.replace(/\{\{HOME\}\}/g, homedir());
    }
    // Return as-is if it's a regular path
    return path;
  });
}

function generateSecureFilesystemShim(
  options: FilesystemSecurityOptions,
  format: 'esm' | 'cjs' | 'iife' = 'cjs',
): string {
  const { verbose = false, allowedPaths } = options;

  // Note: This function should only be called for restricted or blocked access
  // When full access is allowed, we return a no-op plugin that doesn't intercept fs

  // Process allowed paths if provided
  const processedAllowedPaths = processAllowedPaths(allowedPaths);

  // Get template
  const template = getTemplate();

  // Render template with options, including the module format
  return template({
    allowedPaths: processedAllowedPaths,
    verbose: verbose,
    format: format, // Pass the format to the template
    isEsm: format === 'esm', // Add a helper for handlebars conditionals
    isCjs: format === 'cjs' || format === 'iife', // Consider iife as CJS for our purposes
  });
}

/**
 * Create a filesystem security plugin for the bundler
 *
 * @param options Security options for filesystem access
 * @returns Plugin configuration
 */
export function createFilesystemSecurityPlugin(
  options: FilesystemSecurityOptions,
  format: 'esm' | 'cjs' | 'iife' = 'cjs',
): BunPlugin {
  const { allowFileSystem, allowedPaths, verbose = false } = options;

  // If filesystem access is allowed without restrictions, return a no-op plugin
  if (allowFileSystem && (!allowedPaths || allowedPaths.length === 0)) {
    logIf(`[FS Security Plugin] Filesystem access is allowed, skipping interception`, verbose);

    return {
      name: 'fs-security-plugin-noop',
      setup() {
        // No-op plugin, don't intercept anything
      },
    };
  }

  // Otherwise continue with restricted or blocked access
  // Create temporary directory for the shim files
  const tempDir = join(process.cwd(), 'node_modules', '.fs-security-shim');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Generate shim code with the correct format
  const shimCode = generateSecureFilesystemShim(options, format);

  // Write shim files
  const fsShimPath = join(tempDir, 'fs.js');
  const fsPromisesShimPath = join(tempDir, 'promises.js');

  fs.writeFileSync(fsShimPath, shimCode);

  // Create format-specific promises shim based on the bundle format
  if (format === 'esm') {
    // ESM format
    logIf(`[FS Security Plugin] Creating ESM promises shim`, verbose);
    fs.writeFileSync(fsPromisesShimPath, `export * from './fs.js';`);
  } else {
    // CJS format
    logIf(`[FS Security Plugin] Creating CommonJS promises shim`, verbose);
    fs.writeFileSync(
      fsPromisesShimPath,
      `
const fs = require('./fs.js');
module.exports = fs.promises;
Object.keys(fs).forEach(key => {
  module.exports[key] = fs[key];
});
`,
    );
  }

  return {
    name: 'fs-security-plugin',
    setup(build) {
      // Intercept fs imports
      build.onResolve({ filter: /^fs$/ }, (_args) => {
        return { path: fsShimPath };
      });

      // Intercept fs/promises imports
      build.onResolve({ filter: /^fs\/promises$/ }, (_args) => {
        return { path: fsPromisesShimPath };
      });
    },
  };
}
