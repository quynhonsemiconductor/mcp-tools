import fs from 'fs';
import yaml from 'js-yaml';
import open from 'open';
import os from 'os';
import path from 'path';
import { z } from 'zod';
import index from '../../public/index.html';
// @ts-expect-error - no type declaration for .handlebars asset imports
import emptyState from '../../public/templates/empty-state.handlebars';
// @ts-expect-error - no type declaration for .handlebars asset imports
import historyItem from '../../public/templates/history-item.handlebars';
// @ts-expect-error - no type declaration for .handlebars asset imports
import recentCalls from '../../public/templates/recent-calls.handlebars';
// @ts-expect-error - no type declaration for .handlebars asset imports
import toolCard from '../../public/templates/tool-card.handlebars';
// @ts-expect-error - no type declaration for .handlebars asset imports
import toolHistory from '../../public/templates/tool-history.handlebars';
// @ts-expect-error - no type declaration for .handlebars asset imports
import toolModal from '../../public/templates/tool-modal.handlebars';
import { loadConfig, type QnscMcpConfig } from '../config';
import { schema } from '../env';
import { registry } from '../registry';
import { promptRegistry } from '../registry/prompts';
import { ToolCategories, ToolCategoryMap } from '../registry/types';
import dbService from '../services/db';
import { logError } from '../services/logger';
import { MCPUnifiedService } from '../services/mcp-unified-service';
import { getSetupContent } from '../utils/setup-resolver';
import { notifyIfUpdateAvailable } from '../utils/update-utils';
import { DEFAULT_BUNDLED_MCP_DIR, initializeBundledMCPs } from './bundled-mcp';
import { tailLogFile } from './tail-log-file';

/**
 * Unified MCP Service instance
 * Single source of truth for all MCP operations
 */
let unifiedMcpService: MCPUnifiedService | null = null;
let lastConfigHash: string | null = null;

/**
 * Generates a hash of the config to detect changes.
 * Mirrors MCPUnifiedService's own generateConfigHash() so this command-level
 * check and the service's internal cache-invalidation check key off the same
 * fields (config has no top-level `remoteMcps`/`localMcps` — those live
 * under `tools.includeRemoteMCPs`/`tools.includeLocalMCPs`).
 */
function hashConfig(config: QnscMcpConfig): string {
  return JSON.stringify({
    includeMCPs: config.tools?.includeMCPs || [],
    includeRemoteMCPs: config.tools?.includeRemoteMCPs || [],
    includeLocalMCPs: config.tools?.includeLocalMCPs || [],
  });
}

/**
 * Invalidates the unified MCP service (called when config is saved)
 */
async function invalidateManagers(): Promise<void> {
  if (unifiedMcpService) {
    try {
      await unifiedMcpService.invalidate();
    } catch (error) {
      logError('Error invalidating unified MCP service:', error);
    }
    unifiedMcpService = null;
  }

  lastConfigHash = null;
}

/**
 * Gets or creates the unified MCP service instance
 * This is the new centralized way to access all MCP operations
 */
async function getUnifiedMcpService(config: QnscMcpConfig): Promise<MCPUnifiedService> {
  const currentConfigHash = hashConfig(config);

  // If config changed or service doesn't exist, create/recreate it
  if (!unifiedMcpService || (lastConfigHash && lastConfigHash !== currentConfigHash)) {
    if (unifiedMcpService) {
      await unifiedMcpService.invalidate();
    }

    unifiedMcpService = new MCPUnifiedService(config, registry, {
      bundledMcpDir: DEFAULT_BUNDLED_MCP_DIR,
      enableCache: true,
      cacheTTL: 5 * 60 * 1000, // 5 minutes
    });

    lastConfigHash = currentConfigHash;
  }

  return unifiedMcpService;
}

export async function startWebServer(port: number): Promise<void> {
  const warned: Set<string> = new Set();
  await registry.initialize();
  await promptRegistry.initialize();
  await initializeBundledMCPs(registry);

  Bun.serve({
    port,
    websocket: {
      message() {},
    },
    routes: {
      // SPA
      '/': index,
      '/logs': index,
      '/config': index,
      '/config-editor': index,
      '/tools': index,

      // handlebars templates
      '/templates': () => {
        return Response.json({
          'empty-state': fs.readFileSync(emptyState as string, 'utf8'),
          historyItem: fs.readFileSync(historyItem as string, 'utf8'),
          'tool-card': fs.readFileSync(toolCard as string, 'utf8'),
          'tool-history': fs.readFileSync(toolHistory as string, 'utf8'),
          'tool-modal': fs.readFileSync(toolModal as string, 'utf8'),
          'recent-calls': fs.readFileSync(recentCalls as string, 'utf8'),
        });
      },

      // API route to get all tools (unified endpoint including native, bundled, remote, and local)
      '/api/tools': async () => {
        try {
          const config = loadConfig();
          const mcpService = await getUnifiedMcpService(config);

          // Get all tools from the unified service
          const allTools = await mcpService.getAllTools();

          // Transform to API response format with backward compatibility
          const formattedTools = allTools.map((tool) => ({
            id: tool.id,
            name: tool.name,
            description: tool.description,
            category: tool.category,
            // Parameters are a JSON-schema-like blob whose exact shape varies by
            // provider (native tools use zod-derived schemas, others pass through
            // raw JSON) — relayed as-is to the client, never introspected here.
            parameters: tool.parameters as unknown,
            envVars: tool.envVars || [], // Include tool-level envVars if present
            provider: tool.provider,
          }));

          // Sort all tools alphabetically by name
          return Response.json({
            tools: formattedTools.sort((a, b) => a.name.localeCompare(b.name)),
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logError('Error in /api/tools endpoint:', error);
          return new Response(`Error retrieving tools: ${errorMessage}`, {
            status: 500,
          });
        }
      },

      // API route for config operations
      '/api/config': {
        GET: () => {
          const config = loadConfig();
          return Response.json(config);
        },
        POST: async (req) => {
          try {
            const contentType = req.headers.get('content-type') || '';
            let configContent;
            let configFilePath;
            if (
              contentType.includes('application/x-www-form-urlencoded') ||
              contentType.includes('multipart/form-data')
            ) {
              const formData = await req.formData();
              configContent = formData.get('content') as string;
              configFilePath = formData.get('filePath') as string;
            } else {
              return new Response('Unsupported content type', { status: 415 });
            }

            if (!configContent) {
              return new Response('Missing content', {
                status: 400,
              });
            }

            // Determine where to save the config file
            let targetPath: string;
            if (configFilePath) {
              targetPath = path.resolve(configFilePath);
            } else {
              // Default target to /.qnscmcp/config.yaml in user home directory
              targetPath = path.join(os.homedir(), '.qnscmcp', 'config.yaml');
            }

            // Write the config content to the file
            try {
              fs.writeFileSync(targetPath, configContent, 'utf8');

              // Invalidate manager instances since config changed
              await invalidateManagers();
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              return new Response(`Failed to write config file: ${errorMessage}`, {
                status: 500,
              });
            }

            return Response.json({ success: true, filePath: configFilePath });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return new Response(`Error saving config: ${errorMessage}`, {
              status: 500,
            });
          }
        },
      },

      // API route to get all categories
      '/api/categories': () => {
        const categories = registry.getCategories(false);
        return Response.json(categories);
      },

      // API route to get logs content
      // Reads only the tail of the log file for performance (log files can be up to 10MB)
      '/api/logs': (req) => {
        const QNSC_MCP_DIR = path.join(os.homedir(), '.qnscmcp');
        const LOG_DIR = path.join(QNSC_MCP_DIR, 'logs');
        const LOG_FILE = path.join(LOG_DIR, 'mcp-tools.log');

        try {
          const url = new URL(req.url);
          const requestedLines = parseInt(url.searchParams.get('lines') || '1000', 10);
          const lines = Math.min(
            Math.max(1, Number.isNaN(requestedLines) ? 1000 : requestedLines),
            10000,
          );

          return new Response(tailLogFile(LOG_FILE, lines));
        } catch (error) {
          // Missing/rotated log file — let openSync's ENOENT bubble up here
          // rather than racing existsSync against the open. 404 is the right
          // signal; a generic 500 with a technical ENOENT message is not.
          if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            return new Response('Log file not found', { status: 404 });
          }
          const errorMessage = error instanceof Error ? error.message : String(error);
          logError('Error in /api/logs endpoint:', error);
          return new Response(`Error reading logs: ${errorMessage}`, {
            status: 500,
          });
        }
      },

      // API route to get tools by category
      '/api/tools/by-category': () => {
        const categorizedTools: Record<string, { parentToolId: string; tools: any[] }> = {};
        const categories = registry.getCategories(false);

        categories.forEach((category) => {
          const tools = registry.getToolsByCategory(category, false);

          // Get parent tool ID from ToolCategoryMap
          const parentToolId =
            ToolCategoryMap[category as ToolCategories] || category.toLowerCase();

          categorizedTools[category] = {
            parentToolId,
            tools: tools.map(({ id, name, description, parameters, envVars, provider }) => ({
              id,
              name,
              description,
              parameters: z.toJSONSchema(parameters, { unrepresentable: 'any' }),
              envVars:
                envVars?.map((envVar) => {
                  const zEnvVar = schema.shape[envVar];
                  if (!zEnvVar) {
                    if (!warned.has(envVar)) {
                      console.warn(
                        `Warning: Environment variable "${envVar}" for tool "${name}" is not defined in the schema.`,
                      );
                      warned.add(envVar);
                    }
                  } else {
                    return {
                      name: envVar,
                      description: zEnvVar.description || '',
                      required: !zEnvVar.isOptional(),
                    };
                  }
                }) || [],
              provider: provider || 'native',
            })),
          };
        });

        return Response.json(categorizedTools);
      },

      // API route to get bundled MCP servers
      '/api/bundled-mcps': async () => {
        try {
          const config = loadConfig();
          const service = await getUnifiedMcpService(config);
          const allMcps = await service.getAllMCPs();

          // Filter for bundled MCPs only
          const bundledMcps = allMcps.filter((mcp) => mcp.provider === 'bundled');

          // Map MCPs to a simplified format for the frontend
          const formattedMcps = bundledMcps.map((mcp) => ({
            id: mcp.id,
            name: mcp.name,
            displayName: mcp.displayName,
            version: mcp.version,
            enabled: mcp.enabled,
            tools: mcp.tools.map((tool) => ({
              id: tool.id,
              name: tool.name,
              description: tool.description,
            })),
            envVars: mcp.envVars,
          }));

          return Response.json(formattedMcps);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return new Response(`Error retrieving bundled MCPs: ${errorMessage}`, { status: 500 });
        }
      },

      // API route to get available remote MCP servers
      '/api/remote-mcps': async () => {
        try {
          const config = loadConfig();
          const service = await getUnifiedMcpService(config);
          const allMcps = await service.getAllMCPs();

          // Filter for remote MCPs only
          const remoteMcps = allMcps.filter((mcp) => mcp.provider === 'remote');

          // Map to format expected by frontend
          const formattedServers = remoteMcps.map((mcp) => ({
            id: mcp.id,
            name: mcp.name,
            displayName: mcp.displayName,
            description: mcp.description,
            category: mcp.category,
            enabled: mcp.enabled,
            status: mcp.connected ? 'connected' : 'disconnected',
            toolCount: mcp.tools.length,
            url: mcp.url,
            envVars: mcp.envVars.map((ev) => ev.key),
          }));

          return Response.json(formattedServers);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return new Response(`Error retrieving remote MCPs: ${errorMessage}`, {
            status: 500,
          });
        }
      },

      // API route to get remote MCP server connection status
      '/api/remote-mcps/status': async () => {
        try {
          const config = loadConfig();
          const service = await getUnifiedMcpService(config);
          const allMcps = await service.getAllMCPs();

          // Filter for remote MCPs and build connection status
          const remoteMcps = allMcps.filter((mcp) => mcp.provider === 'remote');

          const connectionStatus: Record<string, 'connected' | 'disconnected' | 'error'> = {};
          let connectedServers = 0;
          let totalTools = 0;

          for (const mcp of remoteMcps) {
            connectionStatus[mcp.id] = mcp.connected ? 'connected' : 'disconnected';
            if (mcp.connected) {
              connectedServers++;
            }
            totalTools += mcp.tools.length;
          }

          return Response.json({
            connections: connectionStatus,
            stats: {
              totalServers: remoteMcps.length,
              connectedServers,
              totalTools,
              registeredTools: totalTools, // Same as totalTools in this context
            },
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return new Response(`Error retrieving remote MCP status: ${errorMessage}`, {
            status: 500,
          });
        }
      },

      // API route to get local MCP servers
      '/api/local-mcps': async () => {
        try {
          const config = loadConfig();
          const service = await getUnifiedMcpService(config);
          const allMcps = await service.getAllMCPs();

          // Filter for local MCPs only
          const localMcps = allMcps.filter((mcp) => mcp.provider === 'local');

          // Map to format expected by frontend
          const formattedServers = localMcps.map((mcp) => ({
            id: mcp.id,
            name: mcp.name,
            displayName: mcp.displayName,
            description: mcp.description,
            category: mcp.category,
            enabled: mcp.enabled,
            status: mcp.connected ? 'connected' : 'disconnected',
            toolCount: mcp.tools.length,
            envVars: mcp.envVars.map((ev) => ev.key),
          }));

          return Response.json(formattedServers);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return new Response(`Error retrieving local MCPs: ${errorMessage}`, {
            status: 500,
          });
        }
      },

      // API route to get local MCP server connection status
      '/api/local-mcps/status': async () => {
        try {
          const config = loadConfig();
          const service = await getUnifiedMcpService(config);
          const allMcps = await service.getAllMCPs();

          // Filter for local MCPs and build connection status
          const localMcps = allMcps.filter((mcp) => mcp.provider === 'local');

          const connectionStatus: Record<string, 'connected' | 'disconnected' | 'error'> = {};
          let connectedServers = 0;
          let totalTools = 0;

          for (const mcp of localMcps) {
            connectionStatus[mcp.id] = mcp.connected ? 'connected' : 'disconnected';
            if (mcp.connected) {
              connectedServers++;
            }
            totalTools += mcp.tools.length;
          }

          return Response.json({
            connections: connectionStatus,
            stats: {
              totalServers: localMcps.length,
              connectedServers,
              totalTools,
              registeredTools: totalTools, // Same as totalTools in this context
            },
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return new Response(`Error retrieving local MCP status: ${errorMessage}`, {
            status: 500,
          });
        }
      },

      // API route to get remote MCP tools (lazy loaded with initialization)
      // This endpoint initializes connections and returns tools for all enabled remote MCPs
      '/api/remote-mcps/tools': async () => {
        try {
          const config = loadConfig();
          const service = await getUnifiedMcpService(config);

          // Get all MCPs (this triggers initialization)
          const allMcps = await service.getAllMCPs();

          // Filter for remote MCPs only
          const remoteMcps = allMcps.filter((mcp) => mcp.provider === 'remote' && mcp.enabled);

          // Format response - group tools by category
          const mcps = remoteMcps.map((mcp) => {
            const toolsByCategory: Record<string, any[]> = {};
            for (const tool of mcp.tools) {
              const cat = tool.category || 'Uncategorized';
              if (!toolsByCategory[cat]) toolsByCategory[cat] = [];
              toolsByCategory[cat].push({
                id: tool.id,
                name: tool.name,
                description: tool.description,
                category: cat,
              });
            }

            return {
              id: mcp.id,
              name: mcp.name,
              displayName: mcp.displayName,
              connected: mcp.connected,
              tools: Object.values(toolsByCategory).flat(),
            };
          });

          return Response.json({ mcps });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logError('Error retrieving remote MCP tools:', error);
          return new Response(`Error retrieving remote MCP tools: ${errorMessage}`, {
            status: 500,
          });
        }
      },

      // API route to get local MCP tools (lazy loaded with initialization)
      // This endpoint initializes connections and returns tools for all enabled local MCPs
      '/api/local-mcps/tools': async () => {
        try {
          const config = loadConfig();
          const service = await getUnifiedMcpService(config);

          // Get all MCPs (this triggers initialization)
          const allMcps = await service.getAllMCPs();

          // Filter for local MCPs only
          const localMcps = allMcps.filter((mcp) => mcp.provider === 'local' && mcp.enabled);

          // Format response - group tools by category
          const mcps = localMcps.map((mcp) => {
            const toolsByCategory: Record<string, any[]> = {};
            for (const tool of mcp.tools) {
              const cat = tool.category || 'Uncategorized';
              if (!toolsByCategory[cat]) toolsByCategory[cat] = [];
              toolsByCategory[cat].push({
                id: tool.id,
                name: tool.name,
                description: tool.description,
                category: cat,
              });
            }

            return {
              id: mcp.id,
              name: mcp.name,
              displayName: mcp.displayName,
              connected: mcp.connected,
              tools: Object.values(toolsByCategory).flat(),
            };
          });

          return Response.json({ mcps });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logError('Error retrieving local MCP tools:', error);
          return new Response(`Error retrieving local MCP tools: ${errorMessage}`, { status: 500 });
        }
      },

      // API route to parse uploaded config
      '/api/config/parse': async (req) => {
        try {
          const formData = await req.formData();
          const fileEntry = formData.get('config');
          if (!(fileEntry instanceof File)) {
            return new Response('Invalid file provided', { status: 400 });
          }
          const file = fileEntry;

          if (!file) {
            return new Response('No file provided', { status: 400 });
          }

          const configContent = await file.text();
          const config = yaml.load(configContent);
          return Response.json(config);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return new Response(`Error parsing config: ${errorMessage}`, {
            status: 400,
          });
        }
      },

      // API route to get recent tool calls
      '/api/tools/recent': async () => {
        try {
          // Get the 10 most recent tool calls with limit applied at the database level
          const recentCalls = await dbService.getAllToolCalls(10);

          // Format the calls for display
          const formattedCalls = recentCalls.map((call) => {
            let result: unknown = call.result;
            try {
              result = JSON.parse(call.result || '{}');
            } catch {
              // Not valid JSON — keep the raw stored string as-is.
            }

            let payload: unknown = call.payload;
            try {
              payload = JSON.parse(call.payload || '{}');
            } catch {
              // Not valid JSON — keep the raw stored string as-is.
            }

            // Get tool details if available
            const tool = registry.getToolById(call.toolId) || {
              name: call.toolId,
              category: 'Unknown',
            };

            return {
              ...call,
              result,
              payload,
              toolName: tool.name,
              toolCategory: tool.category,
            };
          });

          return Response.json(formattedCalls);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return new Response(`Error retrieving recent calls: ${errorMessage}`, {
            status: 500,
          });
        }
      },

      // API route to get a specific tool (supports all tool types: native, bundled, remote, local)
      '/api/tools/:id': async (req: any) => {
        const toolId = req.params.id;

        try {
          const config = loadConfig();
          const service = await getUnifiedMcpService(config);

          // Get tool from unified service
          const tool = await service.getToolById(toolId);

          if (!tool) {
            return new Response('Tool not found', { status: 404 });
          }

          // Get call statistics
          const callStats = await dbService.getToolCallCount(toolId);

          // Format response based on provider type
          const response: any = {
            id: tool.id,
            name: tool.name,
            description: tool.description,
            category: tool.category,
            provider: tool.provider,
            parameters:
              tool.provider === 'native'
                ? z.toJSONSchema(tool.parameters, { unrepresentable: 'any' })
                : tool.parameters,
            callStats: callStats.map(({ count, status }) => ({
              count,
              status: status.charAt(0).toUpperCase() + status.slice(1),
            })),
          };

          // Get the parent MCP info for all tools
          const allMcps = await service.getAllMCPs();
          const parentMcp = allMcps.find((mcp) => mcp.tools.some((t) => t.id === toolId));

          if (parentMcp) {
            response.mcpName = parentMcp.name;
            // Include MCP-level envVars (aggregated from all tools)
            response.mcpEnvVars = parentMcp.envVars;
            // Include tool-specific envVars if present
            response.toolEnvVars = tool.envVars || [];
            // For backward compatibility, set envVars to MCP-level
            response.envVars = parentMcp.envVars;

            if (parentMcp.version) {
              response.mcpVersion = parentMcp.version;
            }
          } else {
            // Fallback for tools without parent MCP
            response.envVars = [];
            response.mcpEnvVars = [];
            response.toolEnvVars = [];
          }

          return Response.json(response);
        } catch (error) {
          logError('Error retrieving tool details:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          return new Response(`Error retrieving tool: ${errorMessage}`, {
            status: 500,
          });
        }
      },

      // API route to get history for a specific tool
      '/api/tools/:id/history': async (req: any) => {
        const toolId = req.params.id;

        try {
          const config = loadConfig();
          const service = await getUnifiedMcpService(config);

          // Check if tool exists using unified service
          const tool = await service.getToolById(toolId);

          if (!tool) {
            return new Response('Tool not found', { status: 404 });
          }

          const calls = await dbService.getToolCallsByToolId(toolId);
          if (calls.length === 0) {
            return new Response('No history found for this tool', {
              status: 404,
            });
          }

          return Response.json(
            calls.map((call) => {
              let result = call.result;
              try {
                result = JSON.parse(call.result || '{}');
              } catch {
                // Not valid JSON — keep the raw stored string as-is.
              }

              let payload = call.payload;
              try {
                payload = JSON.parse(call.payload || '{}');
              } catch {
                // Not valid JSON — keep the raw stored string as-is.
              }

              return { ...call, result, payload };
            }),
          );
        } catch (error) {
          logError('Error retrieving tool history:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          return new Response(`Error retrieving tool history: ${errorMessage}`, {
            status: 500,
          });
        }
      },

      // API route to get setup documentation for a tool
      '/api/setup/:toolIdentifier': (req: any) => {
        const toolIdentifier = req.params.toolIdentifier;

        // Get required source type from query parameter (native, bundled, or remote)
        const url = new URL(req.url);
        const sourceType = url.searchParams.get('type') as
          | 'native'
          | 'bundled'
          | 'remote'
          | 'local'
          | null;

        // Validate that sourceType is provided
        if (!sourceType || !['native', 'bundled', 'remote', 'local'].includes(sourceType)) {
          return Response.json(
            {
              error: 'Missing or invalid required query parameter: type',
              message:
                'The "type" query parameter is required and must be one of: native, bundled, remote, local',
              toolId: toolIdentifier,
              exists: false,
            },
            { status: 400 },
          );
        }

        try {
          const setupResult = getSetupContent(toolIdentifier, sourceType);

          if (!setupResult.exists) {
            return Response.json(
              {
                error: 'Setup documentation not found',
                toolId: toolIdentifier,
                exists: false,
                requestedType: sourceType,
              },
              { status: 404 },
            );
          }

          return Response.json({
            toolId: toolIdentifier,
            content: setupResult.content,
            exists: setupResult.exists,
            filePath: setupResult.filePath,
            source: setupResult.source,
          });
        } catch (error) {
          console.error(`Error retrieving setup for ${toolIdentifier}:`, error);
          return Response.json(
            {
              error: 'Failed to retrieve setup documentation',
              toolId: toolIdentifier,
              exists: false,
              message: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 },
          );
        }
      },

      // API route to get all MCP servers with their tools (unified endpoint)
      // Returns a unified view of all MCP servers (bundled, remote, local, native) with their tools
      // Note: Does not include tool parameters - use /api/tools/:id for detailed tool information
      // Response structure:
      // {
      //   "mcps": [
      //     {
      //       "id": string,                    // Unique identifier for the MCP
      //       "name": string,                  // Display name
      //       "description": string,           // Description of the MCP
      //       "category": string,              // Category (e.g., 'Bundled', 'development', 'native')
      //       "provider": string,              // Provider type: 'bundled', 'remote', 'local', or 'native'
      //       "enabled": boolean,              // Whether the MCP is enabled in config
      //       "connected": boolean,            // Whether the MCP is currently connected
      //       "version"?: string,              // Version (bundled MCPs only)
      //       "url"?: string,                  // URL (remote MCPs only)
      //       "envVars": [                     // Required environment variables
      //         {
      //           "key": string,               // Environment variable name
      //           "description": string,       // Description
      //           "required": boolean          // Whether it's required
      //         }
      //       ],
      //       "tools": [                       // List of tools provided by this MCP
      //         {
      //           "id": string,                // Unique tool identifier
      //           "name": string,              // Tool name
      //           "description": string,       // Tool description
      //           "category": string           // Tool category
      //         }
      //       ]
      //     }
      //   ]
      // }
      '/api/mcps': async () => {
        try {
          const config = loadConfig();
          const service = await getUnifiedMcpService(config);
          const allMcps = await service.getAllMCPs();

          // Transform to API response format
          const mcps = allMcps.map((mcp) => {
            // Group tools by their category
            const toolsByCategory: Record<string, any[]> = {};
            for (const tool of mcp.tools) {
              const cat = tool.category || 'Uncategorized';
              if (!toolsByCategory[cat]) toolsByCategory[cat] = [];
              toolsByCategory[cat].push({
                id: tool.id,
                name: tool.name,
                description: tool.description,
                category: cat,
              });
            }

            return {
              id: mcp.id,
              name: mcp.name,
              displayName: mcp.displayName,
              description: mcp.description,
              category: mcp.category,
              provider: mcp.provider,
              enabled: mcp.enabled,
              connected: mcp.connected,
              ...(mcp.version && { version: mcp.version }),
              ...(mcp.url && { url: mcp.url }),
              envVars: mcp.envVars,
              tools: Object.values(toolsByCategory).flat(),
            };
          });

          return Response.json({ mcps });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return new Response(`Error retrieving MCPs: ${errorMessage}`, {
            status: 500,
          });
        }
      },
    },

    // Handle errors
    error(error) {
      console.error('Server error:', error);
      return new Response(`Server error: ${error.message}`, {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      });
    },
  });

  console.log(`✨🥖 QNSC MCP Web Running at: http://localhost:${port}`);
  void open(`http://localhost:${port}`);

  // Run a silent update check at the end
  try {
    await notifyIfUpdateAvailable();
  } catch {
    // Silently ignore any errors from the update check
  }
}
