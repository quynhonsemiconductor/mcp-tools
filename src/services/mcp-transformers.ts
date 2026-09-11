/**
 * mcp-transformers.ts - Transformation utilities for MCP data
 *
 * This module provides centralized transformation logic to convert different
 * MCP types (bundled, remote, local, native) into unified data structures.
 * This eliminates duplication and ensures consistency across the system.
 */

import type { QnscMcpConfig } from '../config';
import { categorizeLocalTool, type LocalMCPInfo } from '../gateway/local-mcp-client';
import { categorizeRemoteTool, type RemoteMCPInfo } from '../gateway/remote-mcp-client';
import type { BundledMCPInfo } from '../gateway/types/bundle';
import type { LocalMCPServerDefinition } from '../local-mcps/available-local-servers';
import { BUNDLED_CATEGORY, type ToolConfig } from '../registry/types';
import type { RemoteMCPServerDefinition } from '../remote-mcps/available-remote-servers';
import { MCPConnectionStatus, UnifiedEnvVar, UnifiedMCPInfo, UnifiedToolInfo } from './mcp-models';
import { createToolDisplayName, createToolId } from './tool-id-utils';

/**
 * Minimal shape of the env schema used by this module.
 *
 * The real schema is a Zod object; we only read `shape[envVar]?.description`,
 * so we model just that surface to stay decoupled from Zod's full types.
 */
interface EnvSchemaShapeEntry {
  description?: string;
}
interface EnvSchemaLike {
  shape: Record<string, EnvSchemaShapeEntry | undefined>;
}

/**
 * Lazy import of schema to avoid circular dependencies
 */
let envSchema: EnvSchemaLike | null = null;
function getSchema(): EnvSchemaLike {
  if (!envSchema) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    envSchema = (require('../env') as { schema: EnvSchemaLike }).schema;
  }
  return envSchema;
}

/**
 * Transforms environment variables from various formats into unified format
 *
 * Handles three different input formats:
 * 1. Array of env var names (string[]) - from remote/local server definitions
 * 2. Array of EnvVarConfig objects - from bundled MCPs
 * 3. Empty/undefined - returns empty array
 *
 * @param envVars - Environment variables in any supported format
 * @param source - Optional source type for logging purposes
 * @returns Array of unified environment variables
 */
export function transformEnvVars(
  envVars: string[] | Array<{ name: string; description?: string; required?: boolean }> | undefined,
  _source?: string,
): UnifiedEnvVar[] {
  if (!envVars || envVars.length === 0) {
    return [];
  }

  // If it's an array of strings (from server definitions)
  if (typeof envVars[0] === 'string') {
    return (envVars as string[]).map((envVar) => {
      // Look up the environment variable in the schema for description
      try {
        const schema = getSchema();
        const zEnvVar = schema.shape[envVar];
        return {
          key: envVar,
          description: zEnvVar?.description || '',
          required: true, // Environment variables from server definitions are required
        };
      } catch {
        // If schema can't be loaded, return without description
        return {
          key: envVar,
          description: '',
          required: true,
        };
      }
    });
  }

  // If it's an array of objects (from bundled MCPs)
  return (envVars as Array<{ name: string; description?: string; required?: boolean }>).map(
    (envVar) => ({
      key: envVar.name,
      description: envVar.description || '',
      required: envVar.required !== undefined ? envVar.required : false,
    }),
  );
}

/**
 * Aggregates environment variables from MCP-level and all tools
 * Removes duplicates and merges descriptions
 *
 * @param mcpEnvVars - MCP-level environment variables
 * @param tools - Array of tools with potential envVars
 * @returns Aggregated and deduplicated array of environment variables
 */
export function aggregateEnvVars(
  mcpEnvVars: UnifiedEnvVar[],
  tools: UnifiedToolInfo[],
): UnifiedEnvVar[] {
  const envVarMap = new Map<string, UnifiedEnvVar>();

  // Start with MCP-level envVars
  for (const envVar of mcpEnvVars) {
    envVarMap.set(envVar.key, { ...envVar });
  }

  // Add tool-level envVars
  for (const tool of tools) {
    if (tool.envVars) {
      for (const envVar of tool.envVars) {
        const existing = envVarMap.get(envVar.key);
        if (existing) {
          // Merge: keep required if either is required
          // Merge descriptions if different
          envVarMap.set(envVar.key, {
            key: envVar.key,
            description: existing.description || envVar.description,
            required: existing.required || envVar.required,
          });
        } else {
          envVarMap.set(envVar.key, { ...envVar });
        }
      }
    }
  }

  return Array.from(envVarMap.values()).sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Determines if tool envVars should be stored or can be omitted
 * Returns undefined if tool envVars are identical to MCP envVars (for deduplication)
 * Returns the tool envVars if they differ from MCP envVars
 *
 * @param toolEnvVars - Tool-specific environment variables
 * @param mcpEnvVars - MCP-level environment variables
 * @returns Tool envVars if different, undefined if identical (for optimization)
 */
export function deduplicateToolEnvVars(
  toolEnvVars: UnifiedEnvVar[] | undefined,
  mcpEnvVars: UnifiedEnvVar[],
): UnifiedEnvVar[] | undefined {
  // No tool envVars, return undefined
  if (!toolEnvVars || toolEnvVars.length === 0) {
    return undefined;
  }

  // Different lengths means different
  if (toolEnvVars.length !== mcpEnvVars.length) {
    return toolEnvVars;
  }

  // Compare keys
  const toolKeys = new Set(toolEnvVars.map((v) => v.key));
  const mcpKeys = new Set(mcpEnvVars.map((v) => v.key));

  // Check if all keys are the same
  if (toolKeys.size !== mcpKeys.size) {
    return toolEnvVars;
  }

  for (const key of toolKeys) {
    if (!mcpKeys.has(key)) {
      return toolEnvVars;
    }
  }

  // Keys are identical, omit tool envVars for optimization
  return undefined;
}

/**
 * Transforms a tool from any MCP type into unified format
 *
 * @param tool - Tool information from any MCP type
 * @param mcpId - ID of the parent MCP
 * @param mcpName - Name of the parent MCP
 * @param provider - Provider type
 * @param category - Category for the tool (can be from server def or tool itself)
 * @param toolEnvVars - Optional tool-specific environment variables
 * @returns Unified tool information
 */
export function transformTool(
  tool: {
    name: string;
    description: string;
    parameters?: unknown;
    schema?: unknown;
    annotations?: unknown;
    envVars?: string[] | Array<{ name: string; description?: string; required?: boolean }>;
  },
  mcpId: string,
  mcpName: string,
  provider: 'native' | 'bundled' | 'remote' | 'local',
  category: string,
  toolEnvVars?: UnifiedEnvVar[],
): UnifiedToolInfo {
  const toolName = tool.name || 'unknown';
  const toolId = createToolId(provider, mcpName, toolName);
  const displayName = createToolDisplayName(provider, mcpName, toolName);

  // Transform tool envVars if provided in the tool definition
  const transformedToolEnvVars = tool.envVars
    ? transformEnvVars(tool.envVars, `${provider}-tool`)
    : toolEnvVars;

  return {
    id: toolId,
    name: toolName,
    displayName,
    description: tool.description || `Tool from ${mcpName}`,
    category,
    mcpId,
    mcpName,
    provider,
    parameters: tool.parameters || tool.schema || {},
    annotations: tool.annotations || {},
    ...(transformedToolEnvVars &&
      transformedToolEnvVars.length > 0 && { envVars: transformedToolEnvVars }),
  };
}

/** The two envVar formats a tool definition may carry. */
type ToolEnvVars = string[] | Array<{ name: string; description?: string; required?: boolean }>;

/**
 * Safely read an optional `envVars` field from a tool object whose static
 * type does not declare it. Some MCP tool shapes carry per-tool env vars that
 * aren't part of the shared interface, so we narrow at runtime instead of
 * asserting `as any`.
 */
function getToolEnvVars(tool: unknown): ToolEnvVars | undefined {
  if (typeof tool === 'object' && tool !== null && 'envVars' in tool) {
    const envVars = (tool as { envVars?: unknown }).envVars;
    if (Array.isArray(envVars)) {
      return envVars as ToolEnvVars;
    }
  }
  return undefined;
}

/**
 * Transforms a bundled MCP into unified format
 *
 * @param mcp - Bundled MCP information
 * @param config - Configuration object to check if MCP is enabled
 * @returns Unified MCP information
 */
export function transformBundledMCP(mcp: BundledMCPInfo, config: QnscMcpConfig): UnifiedMCPInfo {
  const mcpId = mcp.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const enabled = config.tools?.includeMCPs?.includes(mcp.name) || false;

  // Transform MCP-level envVars
  const mcpEnvVars = transformEnvVars(mcp.envVars, 'bundled');

  // Transform tools
  const tools: UnifiedToolInfo[] = mcp.tools.map((tool) => {
    const transformedTool = transformTool(
      {
        name: tool.name || 'unknown',
        description: tool.description || `Tool from ${mcp.name}`,
        schema: tool.schema,
        annotations: tool.annotations,
        envVars: getToolEnvVars(tool), // Tool may have envVars
      },
      mcpId,
      mcp.name,
      'bundled',
      mcp.name, // Bundled MCPs use the MCP name as category
    );

    // Deduplicate tool envVars if they match MCP envVars
    if (transformedTool.envVars) {
      transformedTool.envVars = deduplicateToolEnvVars(transformedTool.envVars, mcpEnvVars);
    }

    return transformedTool;
  });

  // Aggregate all envVars from MCP-level and tools
  const aggregatedEnvVars = aggregateEnvVars(mcpEnvVars, tools);

  return {
    id: mcpId,
    name: mcp.name,
    displayName: mcp.name,
    description: `Bundled MCP: ${mcp.name}`,
    category: BUNDLED_CATEGORY,
    provider: 'bundled',
    enabled,
    connected: enabled, // Bundled MCPs are "connected" if enabled
    version: mcp.version,
    envVars: aggregatedEnvVars,
    tools,
  };
}

/**
 * Transforms a remote MCP into unified format
 *
 * @param mcpInfo - Remote MCP information from the client
 * @param serverDef - Server definition from available-remote-servers
 * @param connectionStatus - Current connection status
 * @param config - Configuration object to check if MCP is enabled
 * @returns Unified MCP information
 */
export function transformRemoteMCP(
  mcpInfo: RemoteMCPInfo,
  serverDef: RemoteMCPServerDefinition,
  connectionStatus: MCPConnectionStatus,
  config: QnscMcpConfig,
): UnifiedMCPInfo {
  const enabled = config.tools?.includeRemoteMCPs?.includes(serverDef.id) || false;
  const connected = connectionStatus === 'connected';

  // Transform MCP-level envVars
  const mcpEnvVars = transformEnvVars(serverDef.requiredEnvVars, 'remote');

  // Transform tools
  const tools: UnifiedToolInfo[] = mcpInfo.tools.map((tool) => {
    const transformedTool = transformTool(
      {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        annotations: tool.annotations,
        envVars: getToolEnvVars(tool), // Tool may have envVars
      },
      serverDef.id,
      mcpInfo.name,
      'remote',
      categorizeRemoteTool(tool),
    );

    // Deduplicate tool envVars if they match MCP envVars
    if (transformedTool.envVars) {
      transformedTool.envVars = deduplicateToolEnvVars(transformedTool.envVars, mcpEnvVars);
    }

    return transformedTool;
  });

  // Aggregate all envVars from MCP-level and tools
  const aggregatedEnvVars = aggregateEnvVars(mcpEnvVars, tools);

  return {
    id: serverDef.id,
    name: serverDef.name,
    displayName: serverDef.name,
    description: serverDef.description,
    category: serverDef.category,
    provider: 'remote',
    enabled,
    connected,
    url: serverDef.url,
    envVars: aggregatedEnvVars,
    tools,
  };
}

/**
 * Transforms a local MCP into unified format
 *
 * @param mcpInfo - Local MCP information from the client
 * @param serverDef - Server definition from available-local-servers
 * @param connectionStatus - Current connection status
 * @param config - Configuration object to check if MCP is enabled
 * @returns Unified MCP information
 */
export function transformLocalMCP(
  mcpInfo: LocalMCPInfo,
  serverDef: LocalMCPServerDefinition,
  connectionStatus: MCPConnectionStatus,
  config: QnscMcpConfig,
): UnifiedMCPInfo {
  const enabled = config.tools?.includeLocalMCPs?.includes(serverDef.id) || false;
  const connected = connectionStatus === 'connected';

  // Transform MCP-level envVars
  const mcpEnvVars = transformEnvVars(serverDef.requiredEnvVars, 'local');

  // Transform tools
  const tools: UnifiedToolInfo[] = mcpInfo.tools.map((tool) => {
    const transformedTool = transformTool(
      {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        annotations: tool.annotations,
        envVars: getToolEnvVars(tool), // Tool may have envVars
      },
      serverDef.id,
      mcpInfo.name,
      'local',
      categorizeLocalTool(tool),
    );

    // Deduplicate tool envVars if they match MCP envVars
    if (transformedTool.envVars) {
      transformedTool.envVars = deduplicateToolEnvVars(transformedTool.envVars, mcpEnvVars);
    }

    return transformedTool;
  });

  // Aggregate all envVars from MCP-level and tools
  const aggregatedEnvVars = aggregateEnvVars(mcpEnvVars, tools);

  return {
    id: serverDef.id,
    name: serverDef.name,
    displayName: serverDef.id,
    description: serverDef.description,
    category: serverDef.category,
    provider: 'local',
    enabled,
    connected,
    installation: serverDef.installation,
    launch: serverDef.launch,
    envVars: aggregatedEnvVars,
    tools,
  };
}

/**
 * Transforms native tools into unified MCP structures grouped by category
 *
 * Native tools are grouped by their category into logical MCP servers,
 * treating each category as a separate MCP for consistency with the
 * unified data model (similar to bundled, remote, and local MCPs).
 *
 * @param tools - Array of native tool configurations
 * @returns Array of unified MCP information, one per category
 */
export function transformNativeTools(tools: ToolConfig[]): UnifiedMCPInfo[] {
  // Filter native tools and group by category
  const nativeTools = tools.filter((tool) => tool.provider === 'native' || !tool.provider);

  // Group tools by category
  const toolsByCategory = new Map<string, ToolConfig[]>();
  for (const tool of nativeTools) {
    const category = tool.category || 'Uncategorized';
    if (!toolsByCategory.has(category)) {
      toolsByCategory.set(category, []);
    }
    toolsByCategory.get(category)!.push(tool);
  }

  // Create a separate MCP for each category
  const mcps: UnifiedMCPInfo[] = [];

  for (const [category, categoryTools] of toolsByCategory) {
    // Create MCP ID from category (lowercase, hyphenated)
    const mcpId = `native-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const mcpName = `Native: ${category}`;

    // Collect all unique envVars from tools in this category
    const mcpEnvVarsMap = new Map<string, UnifiedEnvVar>();
    for (const tool of categoryTools) {
      if (tool.envVars && tool.envVars.length > 0) {
        const toolEnvVars = transformEnvVars(tool.envVars, 'native');
        for (const envVar of toolEnvVars) {
          if (!mcpEnvVarsMap.has(envVar.key)) {
            mcpEnvVarsMap.set(envVar.key, envVar);
          }
        }
      }
    }
    const mcpEnvVars = Array.from(mcpEnvVarsMap.values());

    // Transform tools for this category
    const transformedTools: UnifiedToolInfo[] = categoryTools.map((tool) => {
      // Transform tool-level envVars if present
      const toolEnvVars =
        tool.envVars && tool.envVars.length > 0
          ? transformEnvVars(tool.envVars, 'native')
          : undefined;

      // Deduplicate: if tool envVars match MCP envVars, omit them
      const deduplicatedToolEnvVars = deduplicateToolEnvVars(toolEnvVars, mcpEnvVars);

      return {
        id: tool.id,
        name: tool.name,
        displayName: tool.name,
        description: tool.description,
        category,
        mcpId,
        mcpName,
        provider: 'native' as const,
        parameters: tool.parameters,
        annotations: tool.annotations || {},
        ...(deduplicatedToolEnvVars &&
          deduplicatedToolEnvVars.length > 0 && { envVars: deduplicatedToolEnvVars }),
      };
    });

    mcps.push({
      id: mcpId,
      name: mcpName,
      displayName: mcpName,
      description: `Built-in native tools for ${category}`,
      category,
      provider: 'native',
      enabled: true,
      connected: true,
      envVars: mcpEnvVars,
      tools: transformedTools,
    });
  }

  // Sort MCPs by category name for consistent ordering
  return mcps.sort((a, b) => a.category.localeCompare(b.category));
}

/**
 * Groups tools by category
 *
 * @param tools - Array of unified tool information
 * @returns Object mapping category names to arrays of tools
 */
export function groupToolsByCategory(tools: UnifiedToolInfo[]): Record<string, UnifiedToolInfo[]> {
  const grouped: Record<string, UnifiedToolInfo[]> = {};

  for (const tool of tools) {
    const category = tool.category || 'Uncategorized';
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(tool);
  }

  return grouped;
}

/**
 * Sorts tools alphabetically by name
 *
 * @param tools - Array of unified tool information
 * @returns Sorted array of tools
 */
export function sortToolsByName(tools: UnifiedToolInfo[]): UnifiedToolInfo[] {
  return [...tools].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Filters tools by enabled status based on configuration
 *
 * @param tools - Array of unified tool information
 * @param mcps - Array of unified MCP information to check enabled status
 * @returns Filtered array of tools from enabled MCPs only
 */
export function filterEnabledTools(
  tools: UnifiedToolInfo[],
  mcps: UnifiedMCPInfo[],
): UnifiedToolInfo[] {
  const enabledMcpIds = new Set(mcps.filter((mcp) => mcp.enabled).map((mcp) => mcp.id));

  return tools.filter((tool) => enabledMcpIds.has(tool.mcpId));
}
