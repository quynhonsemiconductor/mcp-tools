/* eslint-disable no-console -- config is loaded by the logger itself; importing the logger here would create a circular dependency, so diagnostics use console directly */
import fs from 'fs';
import yaml from 'js-yaml';
import os from 'os';
import path from 'path';
import { z } from 'zod';

/** Narrow an unknown thrown value to a printable message. */
function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Define the base directory for all qnsc-mcp data
export const QNSC_MCP_DIR = path.join(os.homedir(), '.qnscmcp');

// Environment variable prefix for configuration
const ENV_CONFIG_PREFIX = 'QNSC_MCP_CONFIG';
const ENV_DELIMITER = '__';

// Default log rotation settings, shared by the schema default and defaultConfig
const LOG_MAX_SIZE_MB = 10;
const LOG_MAX_FILES = 5;

// Define the schema for the qnscmcp configuration file
const qnscMcpConfigSchema = z
  .object({
    source: z.string().optional(),
    tools: z
      .object({
        include: z
          .union([z.string().transform((val) => [val]), z.array(z.string())])
          .optional()
          .describe('Tool IDs or glob patterns to include (e.g., "my-tool", "prefix-*")'),
        exclude: z
          .union([z.string().transform((val) => [val]), z.array(z.string())])
          .optional()
          .describe('Tool IDs or glob patterns to exclude (e.g., "my-tool", "prefix-*")'),
        includeCategories: z
          .union([z.string().transform((val) => [val]), z.array(z.string())])
          .optional(),
        excludeCategories: z
          .union([z.string().transform((val) => [val]), z.array(z.string())])
          .optional(),
        includeMCPs: z
          .union([z.string().transform((val) => [val]), z.array(z.string())])
          .optional(),
        includeRemoteMCPs: z
          .union([z.string().transform((val) => [val]), z.array(z.string())])
          .optional(),
        includeLocalMCPs: z
          .union([z.string().transform((val) => [val]), z.array(z.string())])
          .optional(),
        mcpArgs: z
          .record(z.string(), z.array(z.string()))
          .optional()
          .describe('CLI arguments for MCPs. Maps MCP name to array of arguments.'),
      })
      .loose()
      .optional(),
    logging: z
      .object({
        enabled: z.boolean().default(true),
        level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
        maxSize: z.number().default(LOG_MAX_SIZE_MB),
        maxFiles: z.number().default(LOG_MAX_FILES),
      })
      .optional(),
    knowledgeGraph: z
      .object({
        filePath: z
          .string()
          .optional()
          .describe(
            'Path to the knowledge graph storage file (default: ~/.qnscmcp/knowledge-graph.json)',
          ),
      })
      .optional(),
    insiders: z
      .boolean()
      .default(false)
      .optional()
      .describe(
        'Enable insiders/preview features such as Entra ID SSO authentication. ' +
          'Set to true to opt in to pre-GA features for testing.',
      ),
    prompts: z
      .object({
        repositories: z
          .array(
            z.object({
              type: z
                .enum(['remote', 'local'])
                .default('remote')
                .describe('Type of repository: remote for Git repos, local for filesystem paths'),
              repo: z
                .string()
                .describe('GHES repository as <org>/<name> for remote, or absolute path for local'),
              branch: z
                .string()
                .describe('Branch or tag to use if not the default (ignored for local type)')
                .optional(),
              include: z
                .array(z.string())
                .describe('Glob filter of paths and files to include')
                .optional(),
            }),
          )
          .optional(),
      })
      .optional(),
  })
  .strict(); // Enforce strict object shape at root level

export type QnscMcpConfig = z.infer<typeof qnscMcpConfigSchema>;

/**
 * Default configuration if no RC file is found
 */
export const defaultConfig: QnscMcpConfig = {
  insiders: false,
  logging: {
    enabled: true,
    level: 'info',
    maxSize: LOG_MAX_SIZE_MB,
    maxFiles: LOG_MAX_FILES,
  },
  knowledgeGraph: {
    filePath: path.join(QNSC_MCP_DIR, 'knowledge-graph.json'),
  },
  prompts: {
    repositories: [],
  },
  tools: {
    include: [],
    exclude: [],
    includeCategories: [],
    excludeCategories: [],
    includeMCPs: [],
    includeRemoteMCPs: [],
    includeLocalMCPs: [],
  },
};

/**
 * Convert a string value to the appropriate type based on the value content
 */
function coerceValue(value: string): string | number | boolean | string[] {
  // Handle boolean values
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;

  // Handle numeric values
  const numValue = Number(value);
  if (!isNaN(numValue) && value.trim() !== '') return numValue;

  // Handle comma-separated arrays
  if (value.includes(',')) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item);
  }

  return value;
}

/**
 * Set a nested property on an object using a path array
 */
function setNestedProperty(
  obj: Record<string, unknown>,
  pathParts: string[],
  value: unknown,
): void {
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < pathParts.length - 1; i++) {
    const key = pathParts[i];
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  const finalKey = pathParts[pathParts.length - 1];

  // If the property already exists and is an array, and the new value is not an array,
  // append to the existing array (for accumulating values)
  const existing = current[finalKey];
  if (Array.isArray(existing) && !Array.isArray(value)) {
    existing.push(value);
  } else {
    current[finalKey] = value;
  }
}

/**
 * Convert environment variable key to config path
 * e.g., "TOOLS__INCLUDE" -> ["tools", "include"]
 * e.g., "TOOLS__INCLUDE_MCPS" -> ["tools", "includeMCPs"]
 */
function envKeyToConfigPath(envKey: string): string[] {
  return envKey.split(ENV_DELIMITER).map((part) => {
    // Convert SCREAMING_SNAKE_CASE to camelCase
    let result = part.toLowerCase().replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

    // Preserve known acronyms (MCP, MCPs, API, URL, ID)
    result = result
      .replace(/mcps$/i, 'MCPs')
      .replace(/mcp$/i, 'MCP')
      .replace(/api$/i, 'API')
      .replace(/url$/i, 'URL')
      .replace(/id$/i, 'ID');

    return result;
  });
}

/**
 * Known array fields in the config schema, identified by their path
 * These fields support the item syntax: QNSC_MCP_CONFIG__TOOLS__INCLUDE__item-name=true
 */
const ARRAY_FIELD_PATHS = new Set([
  'tools.include',
  'tools.exclude',
  'tools.includeCategories',
  'tools.excludeCategories',
  'tools.includeMCPs',
  'tools.includeRemoteMCPs',
  'tools.includeLocalMCPs',
]);

/**
 * Check if a path (without the last segment) matches a known array field
 * Returns the array field path if matched, null otherwise
 */
function getArrayFieldPath(pathParts: string[]): string | null {
  if (pathParts.length < 2) return null;

  // Check if all but the last segment form a known array field path
  const parentPath = pathParts.slice(0, -1).join('.');
  return ARRAY_FIELD_PATHS.has(parentPath) ? parentPath : null;
}

/**
 * Load configuration from environment variables
 *
 * Environment variables should be prefixed with QNSC_MCP_CONFIG__ and use __ as delimiter
 * for nested properties. Property names use SCREAMING_SNAKE_CASE which is converted to camelCase.
 *
 * Examples:
 *   QNSC_MCP_CONFIG__TOOLS__INCLUDE=tool1,tool2 -> { tools: { include: ["tool1", "tool2"] } }
 *   QNSC_MCP_CONFIG__LOGGING__ENABLED=true -> { logging: { enabled: true } }
 *   QNSC_MCP_CONFIG__LOGGING__LEVEL=debug -> { logging: { level: "debug" } }
 *   QNSC_MCP_CONFIG__LOGGING__MAX_SIZE=20 -> { logging: { maxSize: 20 } }
 *   QNSC_MCP_CONFIG__TOOLS__INCLUDE_CATEGORIES=cat1,cat2 -> { tools: { includeCategories: ["cat1", "cat2"] } }
 *
 * Array item syntax (add individual items to array fields):
 *   QNSC_MCP_CONFIG__TOOLS__INCLUDE__my-tool=true -> { tools: { include: ["my-tool"] } }
 *   QNSC_MCP_CONFIG__TOOLS__INCLUDE_REMOTE_MCPS__server1=true -> { tools: { includeRemoteMCPs: ["server1"] } }
 */
export function loadConfigFromEnvironment(): Partial<QnscMcpConfig> {
  const envConfig: Record<string, unknown> = {};
  const prefix = `${ENV_CONFIG_PREFIX}${ENV_DELIMITER}`;

  const configEnvVars = Object.entries(process.env).filter(
    ([key]) => key.startsWith(prefix) && key !== prefix,
  );

  if (configEnvVars.length === 0) {
    return envConfig;
  }

  for (const [key, value] of configEnvVars) {
    if (value === undefined) continue;

    // Remove the prefix to get the config path
    const envKey = key.slice(prefix.length);
    const configPath = envKeyToConfigPath(envKey);

    // Check if this is an array item syntax (e.g., TOOLS__INCLUDE__my-tool=true)
    const arrayFieldPath = getArrayFieldPath(configPath);
    if (arrayFieldPath) {
      // The last segment is the item to add to the array
      // Use the raw value from the env key (not the camelCase converted one)
      // to preserve case sensitivity of array item values
      const rawParts = envKey.split(ENV_DELIMITER);
      const itemName = rawParts[rawParts.length - 1];
      const arrayPath = configPath.slice(0, -1);

      // Only add the item if the value is truthy (true, "true", non-empty string)
      const shouldAdd = value.toLowerCase() === 'true' || (value !== 'false' && value !== '');

      if (shouldAdd) {
        // Ensure the array exists
        let current: Record<string, unknown> = envConfig;
        for (let i = 0; i < arrayPath.length - 1; i++) {
          const pathKey = arrayPath[i];
          if (!(pathKey in current) || typeof current[pathKey] !== 'object' || current[pathKey] === null) {
            current[pathKey] = {};
          }
          current = current[pathKey] as Record<string, unknown>;
        }

        const finalKey = arrayPath[arrayPath.length - 1];
        if (!Array.isArray(current[finalKey])) {
          current[finalKey] = [];
        }
        (current[finalKey] as unknown[]).push(itemName);
      }
    } else {
      // Standard property assignment
      const coercedValue = coerceValue(value);
      setNestedProperty(envConfig, configPath, coercedValue);
    }
  }

  return envConfig;
}

/**
 * Deep merge two objects, with source taking precedence
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    if (sourceVal !== null && typeof sourceVal === 'object' && !Array.isArray(sourceVal)) {
      const targetVal = result[key];
      const base =
        targetVal !== null && typeof targetVal === 'object' && !Array.isArray(targetVal)
          ? (targetVal as Record<string, unknown>)
          : {};
      result[key] = deepMerge(base, sourceVal as Record<string, unknown>);
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal;
    }
  }

  return result;
}

/**
 * Parse command line arguments to find the --config flag
 */
function getConfigPathFromArgs(): string | null {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === '--config') {
      return args[i + 1];
    }
  }
  return null;
}

/**
 * Parse configuration content as YAML
 */
function parseConfig(content: string): unknown {
  return yaml.load(content);
}
/**
 * Get a nested property from an object using a path array
 * Path segments with .[] indicate array access
 */
function getNestedProperty(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (part === '[]') {
      // Current value should be an array, return it as-is for processing
      if (!Array.isArray(current)) {
        return undefined;
      }
      return current;
    }

    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }

    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Backwards-compatibility aliases that remap legacy configuration keys to their
 * current equivalents.
 *
 * Intentionally empty. Every previous entry pointed at a gateway-routed remote
 * server that has since been removed, so applying them rewrote a user's config
 * into one naming servers that do not exist — and the k6 entry actively steered
 * people at a removed remote server when native k6 tools ship in this build.
 * Removal of a server is reported by the deprecated-config and deprecated-env-var
 * checks instead, which say the integration is gone rather than silently
 * renaming it. Add an entry here only when a key's replacement really exists.
 */
export const CONFIGURATION_ALIASES: { [key: string]: string } = {};

/**
 * Apply configuration aliases by mapping old paths to new paths
 * Handles array syntax with .[] to match string items and append to target arrays
 */
export function applyConfigurationAliases(
  config: Record<string, unknown>,
  aliases: Record<string, string> = CONFIGURATION_ALIASES,
): Record<string, unknown> {
  for (const [aliasPath, targetPath] of Object.entries(aliases)) {
    if (aliasPath.includes('.[]')) {
      const [arrayPathStr, itemMatch] = aliasPath.split('.[].');
      const arrayPathParts = arrayPathStr.split('.').filter((p) => p);

      // Navigate to the source array
      let sourceArray: unknown = config;
      for (const part of arrayPathParts) {
        sourceArray =
          sourceArray && typeof sourceArray === 'object'
            ? (sourceArray as Record<string, unknown>)[part]
            : undefined;
      }

      if (!Array.isArray(sourceArray)) {
        continue;
      }

      // Support wildcard matching (e.g., 'pagerduty-*' matches 'pagerduty-list-incidents')
      const isWildcard = itemMatch.endsWith('*');
      const prefix = isWildcard ? itemMatch.slice(0, -1) : '';
      const matchFn = (item: unknown): boolean =>
        typeof item === 'string' && (isWildcard ? item.startsWith(prefix) : item === itemMatch);

      if (!sourceArray.some(matchFn)) {
        continue;
      }

      console.warn(`Configuration key "${aliasPath}" is deprecated, use "${targetPath}" instead.`);

      // Parse the target array path and value to append
      const [targetArrayStr, targetItem] = targetPath.split('.[].');
      const targetArrayParts = targetArrayStr.split('.').filter((p) => p);

      // Navigate to (or create) the parent object for the target array
      let current: Record<string, unknown> = config;
      for (let i = 0; i < targetArrayParts.length - 1; i++) {
        const part = targetArrayParts[i];
        if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
          current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
      }

      const targetArrayKey = targetArrayParts[targetArrayParts.length - 1];
      if (!Array.isArray(current[targetArrayKey])) {
        current[targetArrayKey] = [];
      }

      // Append the target item if not already present
      const targetArr = current[targetArrayKey] as unknown[];
      if (!targetArr.includes(targetItem)) {
        targetArr.push(targetItem);
      }

      // Remove matched entries from source array after target is populated
      for (let i = sourceArray.length - 1; i >= 0; i--) {
        if (matchFn(sourceArray[i])) {
          sourceArray.splice(i, 1);
        }
      }
    } else {
      // Non-array path: simple property copy
      const aliasValue = getNestedProperty(config, aliasPath);
      if (aliasValue !== undefined) {
        console.warn(
          `Configuration key "${aliasPath}" is deprecated, use "${targetPath}" instead.`,
        );
        setNestedProperty(
          config,
          targetPath.split('.').filter((p) => p !== '[]'),
          aliasValue,
        );
      }
    }
  }

  return config;
}

/**
 * Load configuration from RC files and environment variables
 *
 * Configuration is loaded from the following sources (in order of precedence, lowest to highest):
 * 1. Default configuration
 * 2. Config file from: --config argument, ./.qnscmcp.yaml, ./.qnscmcp.yml, ~/.qnscmcp/config.yaml, ~/.qnscmcp/config.yml
 * 3. Environment variables prefixed with QNSC_MCP_CONFIG__
 *
 * Environment variables override file-based configuration.
 */
export function loadConfig(): QnscMcpConfig {
  // Check for --config command line argument
  const configFromArg = getConfigPathFromArgs();

  // Create the .qnscmcp directory if it doesn't exist
  if (!fs.existsSync(QNSC_MCP_DIR)) {
    fs.mkdirSync(QNSC_MCP_DIR, { recursive: true });
  }

  // Possible config file locations
  const configPaths =
    configFromArg !== 'fromEnv'
      ? [
          // From command line (if specified)
          ...(configFromArg ? [configFromArg] : []),
          // Local directory
          path.join(process.cwd(), '.qnscmcp.yaml'),
          path.join(process.cwd(), '.qnscmcp.yml'),
          // Home directory (.qnscmcp/config.yaml)
          path.join(QNSC_MCP_DIR, 'config.yaml'),
          path.join(QNSC_MCP_DIR, 'config.yml'),
        ]
      : [];

  // Load environment configuration
  const environmentConfig = loadConfigFromEnvironment();

  // Try each config file location in order
  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const configContent = fs.readFileSync(configPath, 'utf8');
        const config = parseConfig(configContent);

        // Validate the config with our schema (with auto-normalization)
        const result = qnscMcpConfigSchema.safeParse(config);
        if (result.success) {
          // Merge: defaults <- file config <- environment config
          const fileConfig = {
            source: configPath,
            ...result.data,
            knowledgeGraph: {
              filePath:
                result.data.knowledgeGraph?.filePath ||
                path.join(QNSC_MCP_DIR, 'knowledge-graph.json'),
            },
          };

          const mergedConfig = applyConfigurationAliases(
            deepMerge(deepMerge(defaultConfig, fileConfig), environmentConfig) as QnscMcpConfig,
          );

          // Preserve the source from file config
          mergedConfig.source = configPath;

          return qnscMcpConfigSchema.parse(mergedConfig);
        } else {
          // Format the error in a more user-friendly way
          console.error(`Invalid configuration in ${configPath}. Using default config.`);
          console.error('Configuration errors:');

          const formatErrors = (errors: z.ZodIssue[], path: string = '') => {
            for (const error of errors) {
              const errorPath = path ? `${path}.${error.path.join('.')}` : error.path.join('.');

              if (error.code === 'unrecognized_keys') {
                console.error(
                  `  - Unrecognized key(s) at "${errorPath || 'root'}": ${error.message}`,
                );
              } else {
                console.error(`  - Error at "${errorPath}": ${error.message}`);
              }
            }
          };

          formatErrors(result.error.issues);
        }
      } catch (error) {
        console.error(
          `Error loading config from ${configPath}: ${errMsg(error)}. Using default config.`,
        );
      }
    }
  }

  // No config file found, merge defaults with environment config
  if (Object.keys(environmentConfig).length > 0) {
    console.warn('No config file found, using environment configuration');
    try {
      const mergedConfig = applyConfigurationAliases(deepMerge(defaultConfig, environmentConfig));
      return qnscMcpConfigSchema.parse(mergedConfig);
    } catch (error) {
      console.error(
        `Error applying configuration aliases: ${errMsg(error)}. Using environment config without aliases.`,
      );
      return qnscMcpConfigSchema.parse(deepMerge(defaultConfig, environmentConfig));
    }
  }

  // No config file and no env config — still run alias checks for deprecated env var warnings
  try {
    applyConfigurationAliases(structuredClone(defaultConfig));
  } catch (error) {
    console.error(`Error checking configuration aliases: ${errMsg(error)}`);
  }

  console.warn(
    'Using default configuration (only tools with includeByDefault: true will be enabled)',
  );
  return defaultConfig;
}

/**
 * Get the configured knowledge graph file path
 */
export function getKnowledgeGraphPath(): string {
  const config = loadConfig();
  return config.knowledgeGraph?.filePath || path.join(QNSC_MCP_DIR, 'knowledge-graph.json');
}
