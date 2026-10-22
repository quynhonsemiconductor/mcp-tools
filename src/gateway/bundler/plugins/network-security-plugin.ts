/**
 * network-security-plugin.ts - esbuild/Bun plugin for network security
 *
 * This plugin intercepts all network-related module imports during the build process
 * and replaces them with secure shim modules that block or restrict network operations.
 */
import type { BunPlugin } from 'bun';
import fs from 'fs';
import handlebars from 'handlebars';
import { join } from 'path';
import { logIf } from '../../../utils';

/**
 * Security settings for the network plugin
 */
export interface NetworkSecurityOptions {
  allowNetwork: boolean;
  networkAllowlist?: string[];
  verbose?: boolean;
}

/**
 * List of network modules to intercept
 */
const NETWORK_MODULES = ['http', 'https', 'net', 'dns', 'dgram', 'tls'];

// Template paths
const TEMPLATE_DIR = join(process.cwd(), 'templates');
const TEMPLATE_PATHS: Record<string, string> = {
  http: join(TEMPLATE_DIR, 'network-http.js.tmpl'),
  https: join(TEMPLATE_DIR, 'network-http.js.tmpl'), // http and https share the same template
  net: join(TEMPLATE_DIR, 'network-net.js.tmpl'),
  dns: join(TEMPLATE_DIR, 'network-dns.js.tmpl'),
  dgram: join(TEMPLATE_DIR, 'network-dgram.js.tmpl'),
  tls: join(TEMPLATE_DIR, 'network-tls.js.tmpl'),
  fetch: join(TEMPLATE_DIR, 'network-fetch.js.tmpl'),
  generic: join(TEMPLATE_DIR, 'network-generic.js.tmpl'),
};

// Template cache
const templateCache: Record<string, handlebars.TemplateDelegate> = {};

/**
 * Load and compile a template from the given path
 *
 * @param templatePath Path to the template file
 * @returns Compiled template function
 */
function getTemplate(templatePath: string): handlebars.TemplateDelegate {
  if (templateCache[templatePath]) {
    return templateCache[templatePath];
  }

  try {
    if (!fs.existsSync(templatePath)) {
      console.log(`Template file does not exist: ${templatePath}`);
      throw new Error(`Template file not found: ${templatePath}`);
    }

    // Read and compile the template
    const templateContent = fs.readFileSync(templatePath, 'utf-8');

    if (!templateContent || templateContent.trim().length === 0) {
      console.log(`Template file is empty: ${templatePath}`);
      throw new Error(`Empty template file: ${templatePath}`);
    }

    const template = handlebars.compile(templateContent);
    templateCache[templatePath] = template;

    return template;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Error loading template from ${templatePath}: ${message}`);
    throw new Error(`Failed to load security template: ${message}`);
  }
}

/**
 * Generate a secure network shim for a specific module using templates
 *
 * @param options Security options
 * @param moduleName Name of the network module being replaced
 * @returns Generated shim code
 */
function generateSecureNetworkShim(options: NetworkSecurityOptions, moduleName: string): string {
  const { networkAllowlist, verbose = false } = options;

  // Get the appropriate template path
  const templatePath = TEMPLATE_PATHS[moduleName] || TEMPLATE_PATHS.generic;

  // Get template
  const template = getTemplate(templatePath);

  // Render template with options
  return template({
    moduleName,
    hasAllowlist: networkAllowlist && networkAllowlist.length > 0,
    allowlistJSON: JSON.stringify(networkAllowlist || []),
    verbose,
  });
}

/**
 * Create a network security plugin for the bundler
 *
 * @param options Security options for network access
 * @returns Plugin configuration
 */
export function createNetworkSecurityPlugin(options: NetworkSecurityOptions): BunPlugin {
  const { allowNetwork, networkAllowlist, verbose = false } = options;

  // If network access is allowed without restrictions, return a no-op plugin
  if (allowNetwork && (!networkAllowlist || networkAllowlist.length === 0)) {
    logIf(`[Network Security Plugin] Network access is allowed, skipping interception`, verbose);

    return {
      name: 'network-security-plugin-noop',
      setup() {
        // No-op plugin, don't intercept anything
      },
    };
  }

  // Otherwise continue with restricted or blocked access
  // Create temporary directory for the shim files
  const tempDir = join(process.cwd(), 'node_modules', '.network-security-shim');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const shimPaths: Record<string, string> = {};

  // Generate the fetch API security shim
  const fetchShimCode = generateSecureNetworkShim(options, 'fetch');
  const fetchShimPath = join(tempDir, 'fetch-shim.js');
  fs.writeFileSync(fetchShimPath, fetchShimCode);

  // Create an entry point file that loads the fetch security
  const fetchEntryPath = join(tempDir, 'fetch-entry.js');
  const fetchEntryContent = `
    // Fetch security entry point
    import './fetch-shim.js';
  `;
  fs.writeFileSync(fetchEntryPath, fetchEntryContent);

  for (const moduleName of NETWORK_MODULES) {
    // Generate shim code
    const shimCode = generateSecureNetworkShim(options, moduleName);

    // Write shim file
    const shimPath = join(tempDir, `${moduleName}.js`);
    fs.writeFileSync(shimPath, shimCode);

    // Store path for interception
    shimPaths[moduleName] = shimPath;
  }

  logIf(`[Network Security Plugin] Created network security shims in ${tempDir}`, verbose);

  return {
    name: 'network-security-plugin',
    setup(build) {
      // Add a virtual entry point for our fetch security
      build.onResolve({ filter: /^__secure_fetch__$/ }, () => {
        logIf(`[Network Security Plugin] Resolved virtual module __secure_fetch__`, verbose);

        return { path: fetchShimPath, namespace: 'secure-fetch-ns' };
      });

      // Handle loading the fetch security shim
      build.onLoad({ filter: /.*/, namespace: 'secure-fetch-ns' }, () => {
        logIf(`[Network Security Plugin] Loading fetch security shim`, verbose);

        return {
          contents: fetchShimCode,
          loader: 'js',
        };
      });

      // Inject fetch security into entry point files
      build.onLoad({ filter: /.*\.js$/ }, (args) => {
        // Skip our generated files and node_modules
        if (
          args.path.includes('.network-security-shim') ||
          args.path.includes('.fs-security-shim') ||
          args.path.includes('node_modules')
        ) {
          return undefined;
        }

        logIf(`[Network Security Plugin] Checking file: ${args.path}`, verbose);

        // Read the file content
        const source = fs.readFileSync(args.path, 'utf8');

        // Detect if this is an entry point file that might use fetch
        const isEntryPoint =
          args.path.includes('index.js') ||
          args.path.includes('main.js') ||
          args.path.endsWith('.mjs') ||
          args.path.includes('mcp') ||
          source.includes('@modelcontextprotocol/sdk');

        if (isEntryPoint || source.includes('fetch(')) {
          logIf(`[Network Security Plugin] Adding fetch security to file: ${args.path}`, verbose);

          // Instead of importing, directly inject the fetch security code
          // This avoids issues with module imports in different contexts
          const securityWrapper = `// Fetch API Security - Added by Network Security Plugin
(function() {
${fetchShimCode}
})();

`;

          // Inject the security code at the beginning of the file
          const newSource = securityWrapper + source;

          return {
            contents: newSource,
            loader: args.path.endsWith('.ts') ? 'ts' : 'js',
          };
        }

        // For other files, continue with normal processing
        return undefined;
      });

      // Also inject fetch security into any file that imports fetch API
      build.onLoad({ filter: /\.(js|ts|mjs|cjs)$/ }, (args) => {
        // Skip already processed files, node_modules and our security shims
        if (
          args.path.includes('.network-security-shim') ||
          args.path.includes('.fs-security-shim') ||
          args.path.includes('node_modules')
        ) {
          return undefined;
        }

        // Read the file content
        const source = fs.readFileSync(args.path, 'utf8');

        // Look for fetch usage patterns
        if (
          source.includes('fetch(') ||
          source.includes('window.fetch') ||
          source.includes('global.fetch') ||
          source.includes('globalThis.fetch')
        ) {
          logIf(
            `[Network Security Plugin] Adding fetch security to file with fetch usage: ${args.path}`,
            verbose,
          );

          // Inject the security wrapper
          const securityWrapper = `// Fetch API Security - Added by Network Security Plugin
(function() {
${fetchShimCode}
})();

`;

          // Inject the security code at the beginning of the file
          const newSource = securityWrapper + source;

          return {
            contents: newSource,
            loader: args.path.endsWith('.ts') ? 'ts' : 'js',
          };
        }

        // For other files, continue with normal processing
        return undefined;
      });

      // Intercept network module imports
      for (const moduleName of NETWORK_MODULES) {
        build.onResolve({ filter: new RegExp(`^${moduleName}$`) }, (args) => {
          logIf(
            `[Network Security Plugin] Intercepted ${moduleName} import from ${args.importer}`,
            verbose,
          );

          return { path: shimPaths[moduleName] };
        });
      }
    },
  };
}
