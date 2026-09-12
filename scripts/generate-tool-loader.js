#!/usr/bin/env node

import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { fileURLToPath } from 'url';
import { AVAILABLE_LOCAL_MCP_SERVERS } from '../src/local-mcps/available-local-servers';
import { AVAILABLE_REMOTE_MCP_SERVERS } from '../src/remote-mcps/available-remote-servers';
import { OrderedLinkedList } from './ordered-linked-list';

// Get the directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const toolsDir = path.join(rootDir, 'src', 'tools');
const bundledDir = path.join(rootDir, 'bundled');
const outputFile = path.join(rootDir, 'src', 'registry', 'tool-loader.ts');

/**
 * Find all tool files in the tools directory
 * This includes *Tool.ts/js files and index.ts/js files
 */
function findToolFiles(dir, toolFiles = []) {
  if (!fs.existsSync(dir)) {
    return toolFiles;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    // Skip registry.ts, tool-loader.ts, middlewares directory, and node_modules
    // registry.ts is now a re-export of ../registry package
    // middlewares is now a re-export of ../registry/middlewares package
    if (
      entry.name === 'registry.ts' ||
      entry.name === 'tool-loader.ts' ||
      entry.name === 'middlewares' ||
      entry.name === 'node_modules'
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      // Recursively search subdirectories
      findToolFiles(entryPath, toolFiles);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('Tool.ts') ||
        entry.name.endsWith('Tool.js') ||
        entry.name.endsWith('-tool.ts') ||
        entry.name.endsWith('-tool.js') ||
        entry.name === 'index.ts' ||
        entry.name === 'index.js')
    ) {
      // Found a potential tool file
      const relativePath = path.relative(toolsDir, entryPath);
      toolFiles.push(relativePath);
    }
  }

  return toolFiles;
}

/**
 * Deduplicate tool files: if a directory has a non-empty index.ts, skip
 * individual tool files from that same directory (the index covers them).
 */
function deduplicateToolFiles(files) {
  const indexDirs = new Set();
  for (const file of files) {
    const basename = path.basename(file);
    if (basename === 'index.ts' || basename === 'index.js') {
      if (fs.readFileSync(path.join(toolsDir, file), 'utf8').trim().length > 0) {
        indexDirs.add(path.dirname(file));
      }
    }
  }
  return files.filter((file) => {
    const basename = path.basename(file);
    if (basename === 'index.ts' || basename === 'index.js') return true;
    return !indexDirs.has(path.dirname(file));
  });
}

/**
 * Guard against the silent failure mode of barrel-based dedup: once a directory
 * has a non-empty index.ts, `deduplicateToolFiles` skips its individual tool
 * files and imports only the barrel. If a tool file isn't re-exported from that
 * index.ts it would silently vanish from the loader (green build, missing tool).
 *
 * This fails the build loudly instead: for every directory with a non-empty
 * barrel, each sibling file that actually declares a tool (contains `@Tool(`)
 * must be reachable from the barrel via a `'./<module>'` specifier. Abstract
 * base classes and helpers (no `@Tool`) are ignored.
 */
function validateBarrelCompleteness(files) {
  const byDir = {};
  for (const file of files) {
    (byDir[path.dirname(file)] ??= []).push(path.basename(file));
  }

  const problems = [];
  for (const [dir, names] of Object.entries(byDir)) {
    const indexName = names.find(
      (n) => n === 'index.ts' || n === 'index.js'
    );
    if (!indexName) continue;

    const indexContent = fs.readFileSync(
      path.join(toolsDir, dir, indexName),
      'utf8'
    );
    if (indexContent.trim().length === 0) continue;

    for (const name of names) {
      if (name === indexName) continue;
      if (!/(-tool|Tool)\.(ts|js)$/.test(name)) continue;

      const filePath = path.join(toolsDir, dir, name);
      const content = fs.readFileSync(filePath, 'utf8');
      if (!content.includes('@Tool(')) continue; // not an actual tool

      const moduleSpecifier = `./${name.replace(/\.(ts|js)$/, '')}`;
      if (!indexContent.includes(moduleSpecifier)) {
        problems.push(
          `  - ${path.join(dir, name)} declares a tool but is not re-exported from ${path.join(dir, indexName)}`
        );
      }
    }
  }

  if (problems.length > 0) {
    console.error(
      `\nTool loader barrel check failed. The following tool files live in a directory with a non-empty index.ts but are not re-exported from it, so they would be silently dropped from the loader:\n${problems.join('\n')}\n\nAdd an \`export * from './<file>';\` line to the barrel (or remove the stale index.ts).\n`
    );
    process.exit(1);
  }
}

/**
 * Import all tool files to trigger @Tool decorators, then read metadata
 * from the toolRegistry instead of regex-parsing file contents.
 */
async function loadToolsFromRegistry(toolFiles) {
  const { toolRegistry } = await import('../src/registry/tool-registry');

  const toolInfos = [];
  const toolsByCategory = {};

  for (const file of toolFiles) {
    const fullPath = path.join(toolsDir, file);
    const registeredBefore = new Set(toolRegistry.keys());

    try {
      await import(fullPath);
    } catch (error) {
      console.error(`Error importing ${file}:`, error.message);
      continue;
    }

    // Find tools newly registered by this file
    for (const [toolId, { config }] of toolRegistry.entries()) {
      if (registeredBefore.has(toolId)) continue;

      toolInfos.push({
        id: config.id,
        name: config.name,
        description: config.description || '',
        category: config.category,
        envVars: config.envVars ? [...config.envVars] : [],
        optionalEnvVars: config.optionalEnvVars
          ? [...config.optionalEnvVars]
          : [],
        includeByDefault: config.includeByDefault || false
      });

      if (!toolsByCategory[config.category]) {
        toolsByCategory[config.category] = [];
      }
      if (!toolsByCategory[config.category].includes(file)) {
        toolsByCategory[config.category].push(file);
      }
    }
  }

  return { toolInfos, toolsByCategory };
}

/**
 * Parse src/env.ts and its per-integration schemas under src/env/*.ts to
 * extract default values and descriptions from Zod schema definitions.
 * Looks for patterns like:
 *   VARNAME: z.string().default('value').describe('description')
 * @returns {Object} Map of env var names to { default: string, description: string }
 */
function parseEnvTsDefaults() {
  const envTsPath = path.join(rootDir, 'src', 'env.ts');
  const envDir = path.join(rootDir, 'src', 'env');
  const envVarData = {};

  try {
    const envFiles = [envTsPath];
    if (fs.existsSync(envDir)) {
      for (const file of fs.readdirSync(envDir)) {
        if (file.endsWith('.ts')) {
          envFiles.push(path.join(envDir, file));
        }
      }
    }
    const content = envFiles
      .map((file) => fs.readFileSync(file, 'utf8'))
      .join('\n');

    // Match patterns like:
    // VARNAME: z.string().default('value')
    // VARNAME: z.string().url().default('value')
    // Can span multiple lines - handle both "z." and "z\n"
    const envVarPattern = /^\s+([A-Z_][A-Z0-9_]*)\s*:\s*z[\s.]/gm;
    let match;

    while ((match = envVarPattern.exec(content)) !== null) {
      const envVarName = match[1];
      const startPos = match.index;

      // Find the end of this env var definition (next env var or closing brace)
      const nextVarMatch = content
        .slice(startPos + match[0].length)
        .search(/^\s+[A-Z_]/m);
      const endPos =
        nextVarMatch !== -1
          ? startPos + match[0].length + nextVarMatch
          : content.indexOf('}', startPos);

      const varDefinition = content.substring(startPos, endPos);

      const varInfo = {};

      // Extract default value - handle both .default('value') and .default("value")
      const defaultMatch = varDefinition.match(
        /\.default\s*\(\s*['"]([^'"]+)['"]\s*\)/
      );
      if (defaultMatch && defaultMatch[1]) {
        varInfo.default = defaultMatch[1];
      }

      // Extract description - handle both .describe('desc') and .describe("desc")
      const describeMatch = varDefinition.match(
        /\.describe\s*\(\s*['"]([^'"]+)['"]\s*\)/
      );
      if (describeMatch && describeMatch[1]) {
        varInfo.description = describeMatch[1];
      }

      const branchMatch = varDefinition.match(
        /\.brand\s*\(\s*['"]([^'"]+)['"]\s*\)/
      );
      if (branchMatch && branchMatch[1]) {
        varInfo.brand = branchMatch[1];
      }

      if (Object.keys(varInfo).length > 0) {
        envVarData[envVarName] = varInfo;
      }
    }

    const defaultCount = Object.values(envVarData).filter(
      (v) => v.default
    ).length;
    console.log(
      `Extracted ${defaultCount} default values and ${Object.keys(envVarData).length} env var definitions from src/env.ts`
    );
  } catch (error) {
    console.error('Error parsing src/env.ts for defaults:', error.message);
  }

  return envVarData;
}

/**
 * Detect if an environment variable name suggests it contains sensitive data
 * @param {string} envVarName - The environment variable name
 * @returns {boolean} True if the variable appears to contain sensitive data
 */
function isSensitiveEnvVar(envVarName) {
  const sensitiveTerms = [
    'TOKEN',
    'KEY',
    'PK',
    'SECRET',
    'PASSWORD',
    'PASS',
    'PASSWD'
  ];
  const upperName = envVarName.toUpperCase();
  return sensitiveTerms.some((term) => upperName.includes(term));
}

/**
 * Discover bundled MCP servers by reading server.yaml files from bundled/{name}/ directories
 * @returns {Array} Array of bundled server definitions with id, name, description, and envVars
 */
function discoverBundledServers() {
  const servers = [];

  if (!fs.existsSync(bundledDir)) {
    console.warn('[bundled discovery] bundled/ directory not found');
    return servers;
  }

  const subdirs = fs
    .readdirSync(bundledDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  for (const dir of subdirs) {
    const serverYamlPath = path.join(bundledDir, dir, 'server.yaml');
    if (!fs.existsSync(serverYamlPath)) {
      continue;
    }

    try {
      const content = fs.readFileSync(serverYamlPath, 'utf8');
      const serverConfig = yaml.load(content);

      if (!serverConfig || !serverConfig.name) {
        console.warn(
          `[bundled discovery] Skipping ${dir}/server.yaml: missing 'name' field`
        );
        continue;
      }

      // Skip servers that aren't built. Every discovered server contributes a
      // user_config prompt to the Claude Desktop bundle, so including one that was
      // never packaged asks the installer to enable something that is not there —
      // browsertools and markdown2pdf both sit at build.enabled: false.
      if (serverConfig.build?.enabled === false) {
        console.log(
          `[bundled discovery] Skipping ${serverConfig.name}: build.enabled is false`
        );
        continue;
      }

      const envVars = (serverConfig.envVars || []).map((ev) => ({
        name: ev.name,
        description: ev.description || `${ev.name} for ${serverConfig.name}`,
        required: ev.required || false,
        default: ev.default || undefined,
        sensitive: isSensitiveEnvVar(ev.name)
      }));

      servers.push({
        id: serverConfig.name,
        name:
          serverConfig.name.charAt(0).toUpperCase() +
          serverConfig.name.slice(1),
        description:
          serverConfig.description || `Bundled ${serverConfig.name} MCP server`,
        envVars
      });
    } catch (error) {
      console.error(
        `[bundled discovery] Error reading ${dir}/server.yaml:`,
        error.message
      );
    }
  }

  console.log(
    `Discovered ${servers.length} bundled MCP servers: ${servers.map((s) => s.id).join(', ')}`
  );
  return servers;
}

class CategoryMatcher {
  _matcher;
  _category;
  constructor(category) {
    this._category = category;
    this._matcher = new RegExp(`^${category.replace(/\*/g, '.*')}$`, 'i');
  }

  get category() {
    return this._category;
  }

  equals(other) {
    return this._matcher.test(other);
  }
}

/**
 * Build an ordered list of toggles and env vars using a linked list.
 *
 * The orderOverride is an array of typed entries:
 *   { type: 'toggle', key: 'Github:*' }     — place a toggle (supports wildcards)
 *   { type: 'envVars', keys: ['GH_API_URL'] } — place uncategorized env vars
 *
 * Phase 1: Process overrides in order, appending matched items to the list.
 * Phase 2: Append remaining unplaced toggles alphabetically, then remaining env vars.
 *
 * @param {Array} allToggles - All toggle entries ({ key, type, data })
 * @param {string[]} uncategorizedEnvVars - Env var names not placed under any toggle
 * @param {Array} orderOverride - Typed ordering entries
 * @returns {Array} Ordered array of { key, type: 'toggle'|'envVar', data }
 */
function buildOrderedList(
  allToggles,
  uncategorizedEnvVars,
  orderOverride = []
) {
  const list = new OrderedLinkedList();
  const unplacedToggles = new Map(allToggles.map((t) => [t.key, t]));
  const unplacedEnvVars = new Set(uncategorizedEnvVars);

  // Phase 1 — process overrides
  for (const entry of orderOverride) {
    if (entry.type === 'toggle') {
      const matcher = new CategoryMatcher(entry.key);
      // Find all matching toggles (wildcards expand to multiple matches)
      const matched = [...unplacedToggles.entries()]
        .filter(([k]) => matcher.equals(k))
        .sort(([a], [b]) => a.localeCompare(b));
      for (const [key, toggle] of matched) {
        list.append(key, 'toggle', toggle);
        unplacedToggles.delete(key);
      }
    } else if (entry.type === 'envVars') {
      for (const envVar of entry.keys || []) {
        if (unplacedEnvVars.has(envVar)) {
          list.append(envVar, 'envVar', envVar);
          unplacedEnvVars.delete(envVar);
        }
      }
    }
  }

  // Phase 2 — append remaining toggles alphabetically
  const remainingToggles = [...unplacedToggles.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  );
  for (const [key, toggle] of remainingToggles) {
    list.append(key, 'toggle', toggle);
  }

  // Append remaining uncategorized env vars alphabetically
  const remainingEnvVars = [...unplacedEnvVars].sort();
  for (const envVar of remainingEnvVars) {
    list.append(envVar, 'envVar', envVar);
  }

  return list.toArray();
}

const wordsToExclude = ['URL', 'API', 'DD', 'GH', 'AS400'];

const escaped = wordsToExclude.map((w) =>
  w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
);
const titleCaseWordExclude = new RegExp(
  `\\b(?!(${escaped.join('|')})\\b)\\w+\\b`,
  'g'
);

/**
 * Update manifest.json with environment variables from tools
 * @param {Array} toolInfos - Array of tool information objects
 */
async function updateManifestEnvVars(
  toolInfos,
  availableCategories,
  toggleOrderOverride = []
) {
  const manifestPath = path.join(rootDir, 'manifest.json');

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const envTsDefaults = Object.entries(parseEnvTsDefaults())
      .filter(([_, { brand }]) => brand !== 'mcpb-exclude')
      .reduce((acc, [key, val]) => {
        acc[key] = val;
        return acc;
      }, {});

    let addedEnvCount = 0;
    let addedUserConfigCount = 0;
    let updatedDefaultCount = 0;

    /**
     * Ensure an env var exists in server.mcp_config.env
     */
    function ensureEnvVar(envVar) {
      if (!manifest.server.mcp_config.env[envVar]) {
        manifest.server.mcp_config.env[envVar] = `\${user_config.${envVar}}`;
        addedEnvCount++;
      }
    }

    /**
     * Ensure a user_config entry exists for a given env var
     */
    function ensureUserConfig(envVar, entry) {
      if (!manifest.user_config[envVar]) {
        manifest.user_config[envVar] = entry;
        addedUserConfigCount++;
      }
    }

    // --- Collect env vars and map them to categories ---
    const envVarToCategories = {};
    for (const tool of toolInfos) {
      if (tool?.envVars?.length > 0) {
        for (const envVar of tool.envVars) {
          (envVarToCategories[envVar] ??= new Set()).add(tool.category);
        }
      }
      if (tool?.optionalEnvVars?.length > 0) {
        for (const envVar of tool.optionalEnvVars) {
          (envVarToCategories[envVar] ??= new Set()).add(tool.category);
        }
      }
    }

    // Include env vars already in manifest and env.ts
    const allEnvVars = new Set([
      ...Object.keys(envVarToCategories),
      ...Object.keys(envTsDefaults)
    ]);

    // Infer categories for env vars that have none
    for (const envVar of allEnvVars) {
      if (envVarToCategories[envVar]?.size) continue;
      for (const category of availableCategories) {
        if (envVar.startsWith(category.toUpperCase().replace(/ /g, '_'))) {
          (envVarToCategories[envVar] ??= new Set()).add(category);
        }
      }
    }

    // --- Build new user_config in order ---
    const newUserConfig = {};

    // Build a map of category -> sorted env vars placed under it
    const envVarsByCategory = {};
    for (const envVar of allEnvVars) {
      const cats = envVarToCategories[envVar]
        ? [...envVarToCategories[envVar]].sort()
        : [];
      const placementCat =
        cats.length > 0
          ? (availableCategories.find((c) => c === cats[cats.length - 1]) ??
            availableCategories.find((c) =>
              c.toUpperCase().startsWith(cats[cats.length - 1].toUpperCase())
            ))
          : null;
      if (placementCat) {
        (envVarsByCategory[placementCat] ??= []).push(envVar);
      } else {
        (envVarsByCategory['__uncategorized__'] ??= []).push(envVar);
      }
    }
    for (const cat of Object.keys(envVarsByCategory)) {
      envVarsByCategory[cat].sort();
    }

    /**
     * Build a user_config entry for a tool env var
     */
    function buildEnvVarEntry(envVar) {
      const cats = envVarToCategories[envVar]
        ? [...envVarToCategories[envVar]].sort()
        : [];
      const categoryStr = cats.length > 0 ? cats.join(', ') : 'various tools';
      const envTsInfo = envTsDefaults[envVar] || {};
      const entry = {
        type: 'string',
        title: envVar
          .replace(/_/g, ' ')
          .replace(
            titleCaseWordExclude,
            (t) => t.charAt(0).toUpperCase() + t.substring(1).toLowerCase()
          ),
        description: envTsInfo.description || `${envVar} for ${categoryStr}`,
        required: false,
        default: '',
        sensitive: isSensitiveEnvVar(envVar)
      };
      if (envTsInfo.default) {
        entry.default = envTsInfo.default;
        updatedDefaultCount++;
      }
      return entry;
    }

    // Categories enabled by default in MCPB — commonly used, low noise.
    // All others default to off (opt-in via Claude Desktop settings UI).
    const defaultOnCategories = new Set([
      'Github: Branches',
      'Github: Issues',
      'Github: Pulls',
      'Github: Releases',
      'Github: Repos',
      'Github: Search',
      'Utility'
    ]);

    // Remote MCPs enabled by default.
    //
    // Was 'slack', which went with the gateway-routed servers and made this list fail
    // its own validation below. aws-knowledge is the sensible default in its place: AWS
    // hosts it publicly, it needs no credentials, so it works on a fresh install with
    // nothing configured. figma-dev is left off — it only answers when the Figma
    // desktop app is running.
    const defaultOnRemoteMCPs = new Set([
      'aws-knowledge-mcp-server'
    ]);

    // Validate that default-on sets reference real entries (catch typos / renames at build time)
    for (const cat of defaultOnCategories) {
      if (!availableCategories.includes(cat)) {
        console.error(`defaultOnCategories contains unknown category: "${cat}"`);
        process.exit(1);
      }
    }
    const remoteServerIds = new Set(AVAILABLE_REMOTE_MCP_SERVERS.map(s => s.id));
    for (const id of defaultOnRemoteMCPs) {
      if (!remoteServerIds.has(id)) {
        console.error(`defaultOnRemoteMCPs contains unknown remote MCP server: "${id}"`);
        process.exit(1);
      }
    }

    // --- Build unified list of all toggles (categories, remote MCPs, local MCPs, bundled MCPs) ---
    const allToggles = [];

    for (const category of [...availableCategories].sort()) {
      allToggles.push({ key: category, type: 'category', data: category });
    }
    for (const server of AVAILABLE_REMOTE_MCP_SERVERS) {
      allToggles.push({ key: server.id, type: 'remote', data: server });
    }
    for (const server of AVAILABLE_LOCAL_MCP_SERVERS) {
      allToggles.push({ key: server.id, type: 'local', data: server });
    }
    for (const server of discoverBundledServers()) {
      // Avoid duplicates if a bundled server shares an id with a remote/local server
      if (!allToggles.some((t) => t.key === server.id)) {
        allToggles.push({ key: server.id, type: 'bundled', data: server });
      }
    }

    // Collect env var names already owned by bundled server toggles (emitted under their parent)
    const bundledEnvVarNames = new Set();
    for (const toggle of allToggles) {
      if (toggle.type === 'bundled') {
        for (const ev of toggle.data.envVars || []) {
          bundledEnvVarNames.add(ev.name);
        }
      }
    }

    // Uncategorized env vars eligible for placement (not already under a bundled toggle)
    const uncategorizedEnvVars = (
      envVarsByCategory['__uncategorized__'] || []
    ).filter((ev) => !bundledEnvVarNames.has(ev));

    // Build the ordered list using the linked list
    const orderedEntries = buildOrderedList(
      allToggles,
      uncategorizedEnvVars,
      toggleOrderOverride
    );

    // --- Emit user_config entries from the ordered list ---

    /** Env var prefix and description label for each server toggle type */
    const serverToggleConfig = {
      remote: { envPrefix: 'INCLUDE_REMOTE_MCPS', label: 'remote mcp' },
      local: { envPrefix: 'INCLUDE_LOCAL_MCPS', label: 'local MCP' },
      bundled: { envPrefix: 'INCLUDE_MCPS', label: 'bundled MCP' }
    };

    /** Register a boolean toggle and record it in newUserConfig */
    function emitBooleanToggle(envVar, title, description, defaultValue = false) {
      ensureEnvVar(envVar);
      ensureUserConfig(envVar, {
        type: 'boolean',
        title,
        description,
        required: false,
        sensitive: false,
        default: defaultValue
      });
      newUserConfig[envVar] = manifest.user_config[envVar];
    }

    /** Emit a list of env vars as tree-nested entries (├─ / └─) under a parent toggle */
    function emitNestedEnvVars(vars) {
      for (let i = 0; i < vars.length; i++) {
        const { name, entry } = vars[i];
        ensureEnvVar(name);
        const prefix = i === vars.length - 1 ? '└─ ' : '├─ ';
        newUserConfig[name] = { ...entry, title: `${prefix}${entry.title}` };
      }
    }

    function emitToggle(toggle) {
      if (toggle.type === 'category') {
        const category = toggle.data;
        const isDefaultOn = defaultOnCategories.has(category);
        emitBooleanToggle(
          `QNSC_MCP_CONFIG__TOOLS__INCLUDE_CATEGORIES__${category}`,
          `Include ${category} tools`,
          `Enable tools in the ${category} category`,
          isDefaultOn
        );

        const placedVars = (envVarsByCategory[category] || []).map(
          (envVar) => ({
            name: envVar,
            entry: buildEnvVarEntry(envVar)
          })
        );
        emitNestedEnvVars(placedVars);
      } else if (toggle.type in serverToggleConfig) {
        const server = toggle.data;
        const { envPrefix, label } = serverToggleConfig[toggle.type];
        const isDefaultOn = toggle.type === 'remote'
          ? defaultOnRemoteMCPs.has(server.id)
          : false;
        emitBooleanToggle(
          `QNSC_MCP_CONFIG__TOOLS__${envPrefix}__${server.id}`,
          server.name,
          `Enable the ${server.id} ${label} server`,
          isDefaultOn
        );
        let serverEnvVars = [];
        switch (toggle.type) {
          case 'local':
            serverEnvVars = Object.keys(server.env || {}).map((key) => ({
              name: key
            }));
          case 'remote':
            serverEnvVars = [
              ...serverEnvVars,
              ...(server.requiredEnvVars || []).map((envVar) => ({
                name: envVar
              }))
            ];
            break;
          case 'bundled':
            serverEnvVars = server.envVars || [];
            break;
        }
        if (serverEnvVars.length > 0) {
          const nestedVars = serverEnvVars.map((ev) => {
            const envTsInfo = envTsDefaults[ev.name] || {};
            const entry = {
              type: 'string',
              title: ev.name
                .replace(/_/g, ' ')
                .replace(
                  titleCaseWordExclude,
                  (t) =>
                    t.charAt(0).toUpperCase() + t.substring(1).toLowerCase()
                ),
              description: envTsInfo.description || ev.description || ev.name,
              required: false,
              default: envTsInfo.default || ev.default || '',
              sensitive: isSensitiveEnvVar(ev.name)
            };
            return { name: ev.name, entry };
          });
          emitNestedEnvVars(nestedVars);
        }
      }
    }

    for (const entry of orderedEntries) {
      if (entry.type === 'toggle') {
        // entry.data is the original toggle object ({ key, type: category|remote|local|bundled, data })
        emitToggle(entry.data);
      } else if (entry.type === 'envVar') {
        const envVar = entry.key;
        ensureEnvVar(envVar);
        newUserConfig[envVar] = buildEnvVarEntry(envVar);
      }
    }

    manifest.user_config = newUserConfig;

    // Write the updated manifest
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

    if (
      addedEnvCount > 0 ||
      addedUserConfigCount > 0 ||
      updatedDefaultCount > 0
    ) {
      console.log(
        `Updated manifest.json: added ${addedEnvCount} env vars, ${addedUserConfigCount} user_config entries, ${updatedDefaultCount} defaults`
      );
    } else {
      console.log('manifest.json is up to date');
    }
  } catch (error) {
    console.error('Error updating manifest.json:', error);
    process.exit(1);
  }
}

/**
 * Generate category-based dynamic import functions
 */
function generateCategoryLoaders(toolsByCategory) {
  const categories = Object.keys(toolsByCategory).sort();

  let code = `/**
 * Tool loader - AUTO-GENERATED FILE
 *
 * This file is automatically generated by scripts/generate-tool-loader.js
 * Do not edit this file directly - your changes will be overwritten.
 *
 * Tools are organized by category for selective loading to improve startup time.
 * Heavy SDKs are only loaded when their category is actually used.
 */

import { logWarn, logError } from '../services/logger';

/**
 * Map of category names to their loader functions.
 * Each loader function dynamically imports all tools in that category.
 */
export const categoryLoaders: Record<string, () => Promise<void>> = {
`;

  for (const category of categories) {
    const files = toolsByCategory[category];
    const importPaths = files.map((file) => {
      let importPath = '../tools/' + file.replace(/\\/g, '/');
      importPath = importPath.replace(/\.(ts|js)$/, '');
      return importPath;
    });

    code += `  '${category}': async () => {\n`;
    for (const importPath of importPaths) {
      code += `    await import('${importPath}');\n`;
    }
    code += `  },\n`;
  }

  code += `};

/**
 * List of all available categories
 */
export const availableCategories: string[] = ${JSON.stringify(categories, null, 2)};

/**
 * Load tools for specific categories only.
 * This allows skipping heavy SDK imports for categories that are excluded in config.
 *
 * @param categories - Array of category names to load. If empty or undefined, loads all categories.
 * @param excludeCategories - Array of category names to exclude from loading.
 */
export async function loadToolsByCategories(
  categories?: string[],
  excludeCategories?: string[]
): Promise<void> {
  // Expand parent category prefixes (e.g., "Github" -> "Github: Actions", "Github: Branches", etc.)
  const expandParentCategories = (cats: string[]): string[] => {
    const expanded: string[] = [];
    for (const cat of cats) {
      if (availableCategories.includes(cat)) {
        expanded.push(cat);
      } else {
        // Check if it's a parent prefix (e.g., "Github" matches "Github: Actions")
        const children = availableCategories.filter(c => c.startsWith(cat + ': '));
        if (children.length > 0) {
          expanded.push(...children);
        } else {
          expanded.push(cat); // Keep unknown categories so the warning below catches them
        }
      }
    }
    return expanded;
  };

  const expandedCategories = categories && categories.length > 0
    ? expandParentCategories(categories)
    : undefined;

  const expandedExclude = excludeCategories && excludeCategories.length > 0
    ? expandParentCategories(excludeCategories)
    : excludeCategories;

  // Warn about unknown categories
  if (expandedCategories && expandedCategories.length > 0) {
    const unknownCategories = expandedCategories.filter(c => !availableCategories.includes(c));
    if (unknownCategories.length > 0) {
      logWarn(\`[tool-loader] Unknown categories specified in includeCategories: \${unknownCategories.join(', ')}. Available categories: \${availableCategories.join(', ')}\`);
    }
  }

  const categoriesToLoad = expandedCategories && expandedCategories.length > 0
    ? expandedCategories.filter(c => availableCategories.includes(c))
    : availableCategories;

  const excludeSet = new Set(expandedExclude || []);

  // Load categories concurrently using Promise.allSettled for resilience
  // If one category fails to load, others will still be available
  const categoriesToActuallyLoad = categoriesToLoad.filter(category => !excludeSet.has(category));

  const results = await Promise.allSettled(
    categoriesToActuallyLoad.map(async (category) => {
      const loader = categoryLoaders[category];
      if (loader) {
        await loader();
      }
      return category;
    })
  );

  // Log any failed category loads with category name for debugging
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      logError(\`[tool-loader] Failed to load category "\${categoriesToActuallyLoad[i]}": \${result.reason}\`);
    }
  }
}

/**
 * Load all tools (for backward compatibility).
 * Note: For better performance, prefer using loadToolsByCategories with specific categories.
 */
export async function loadAllTools(): Promise<void> {
  await loadToolsByCategories();
}
`;

  return code;
}

/**
 * Main function to generate the loader file
 */
async function generateLoader() {
  console.log('Generating tool loader file...');

  // Find all potential tool files by naming convention
  const allToolFiles = findToolFiles(toolsDir);

  // Fail loudly if a tool file in a barrel dir isn't re-exported from index.ts
  // (otherwise dedup below would silently drop it).
  validateBarrelCompleteness(allToolFiles);

  // When a directory has an index.ts, skip individual tool files from that dir
  const dedupedToolFiles = deduplicateToolFiles(allToolFiles);

  // Import tool files to trigger @Tool decorators, then read metadata from the registry
  const { toolInfos, toolsByCategory } =
    await loadToolsFromRegistry(dedupedToolFiles);

  // Sort tool files within each category
  for (const category of Object.keys(toolsByCategory)) {
    toolsByCategory[category].sort();
  }

  // Derive available categories from the registry results
  const availableCategories = Object.keys(toolsByCategory).sort();

  // Generate the category-based loader file content
  const loaderContent = generateCategoryLoaders(toolsByCategory);

  // Write the loader file
  fs.writeFileSync(outputFile, loaderContent);
  console.log(`Generated loader file at: ${outputFile}`);
  console.log(
    `Categories: ${availableCategories.length}, Tools: ${toolInfos.length}`
  );

  // Update the manifest.json with environment variables
  // Ordering override — typed entries control the order of toggles and env vars in user_config.
  //   { type: 'toggle', key: 'Github:*' }        — place a toggle (supports wildcards)
  //   { type: 'envVars', keys: ['GH_API_URL'] }  — place uncategorized env vars at this position
  // Items not listed are appended alphabetically after the overrides.
  const toggleOrderOverride = [
    { type: 'toggle', key: 'Github:*' },
    { type: 'toggle', key: 'lucid' }
  ];
  await updateManifestEnvVars(toolInfos, availableCategories, toggleOrderOverride);
}

// Run the script
generateLoader();
