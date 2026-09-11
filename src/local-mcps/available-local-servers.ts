/**
 * available-local-servers.ts - Predefined list of approved local MCP servers
 *
 * This module contains the approved local MCP servers that users can select from.
 * System administrators control this list to ensure only approved and secure servers are available.
 */

export interface LocalMCPServerDefinition {
  /** Unique identifier for the local MCP server */
  id: string;
  /** Display name for the local MCP server */
  name: string;
  /** Human-readable description of the server's purpose */
  description: string;
  /** Category for grouping servers */
  category: 'internal' | 'partner' | 'external' | 'development';
  /**
   * Installation command(s) for local MCP servers
   * Can be a single command string or an array of commands to run sequentially
   * Each command MUST start with one of: npm, npx, brew, pip, bun, deno, node, python3, python
   * Examples:
   * - Single: 'npm i @playwright/mcp'
   * - Multiple: ['brew tap example-org/tap', 'brew install example-org/tap/example-mcp']
   */
  installation?: string | string[];
  /** Launch command for local MCP servers (e.g., 'npx @playwright/mcp@0.0.52') */
  launch: string;
  /** Required environment variables for the local server */
  requiredEnvVars?: string[];
  /** Optional environment variables to pass to the local server process */
  env?: Record<string, string>;
}

/**
 * Approved local MCP servers that users can select from
 *
 * To add a new server:
 * 1. Add the server definition to this array
 * 2. Update documentation with the new server details
 * 3. Test the server configuration thoroughly
 * 4. Update any relevant security policies
 *
 * These servers are installed and launched locally, connecting via stdio for maximum security.
 */
export const AVAILABLE_LOCAL_MCP_SERVERS: LocalMCPServerDefinition[] = [
  {
    id: 'playwright-local',
    name: 'Playwright',
    description:
      'Local Playwright MCP server for browser automation and testing. Configure CLI arguments via mcpArgs in .qnscmcp.yaml config file. Supports various options including --extension for Chrome extension mode, --browser for browser selection, --headless for headless mode, and more.',
    category: 'development',
    launch: 'npx @playwright/mcp@0.0.52',
    requiredEnvVars: ['PLAYWRIGHT_BROWSERS_PATH'],
    env: {
      PLAYWRIGHT_MCP_EXTENSION_TOKEN: process.env.PLAYWRIGHT_MCP_EXTENSION_TOKEN || '',
    },
  },
  {
    id: 'mobile-next-local',
    name: 'Mobile Next',
    description: 'Mobile Next - MCP server for Mobile Development and Automation',
    category: 'development',
    launch: 'npx @mobilenext/mobile-mcp@0.0.33',
  },
  {
    id: 'dart-mcp',
    name: 'Dart MCP',
    description: 'MCP server for Dart/Flutter cross platform development.',
    category: 'development',
    launch: 'dart mcp-server',
    requiredEnvVars: ['DART_SDK'],
    env: {
      DART_SDK: process.env.DART_SDK!,
    },
  },
];

/**
 * Get a local MCP server definition by ID
 */
export function getLocalMCPServer(id: string): LocalMCPServerDefinition | undefined {
  return AVAILABLE_LOCAL_MCP_SERVERS.find((server) => server.id === id);
}

/**
 * Get all available local MCP server IDs
 */
export function getAvailableLocalMCPServerIds(): string[] {
  return AVAILABLE_LOCAL_MCP_SERVERS.map((server) => server.id);
}

/**
 * Get local MCP servers by category
 */
export function getLocalMCPServersByCategory(
  category: LocalMCPServerDefinition['category'],
): LocalMCPServerDefinition[] {
  return AVAILABLE_LOCAL_MCP_SERVERS.filter((server) => server.category === category);
}

/**
 * Validate that all provided local server IDs are available
 */
export function validateLocalMCPServerIds(serverIds: string[]): {
  valid: string[];
  invalid: string[];
} {
  const availableIds = getAvailableLocalMCPServerIds();
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const id of serverIds) {
    if (availableIds.includes(id)) {
      valid.push(id);
    } else {
      invalid.push(id);
    }
  }

  return { valid, invalid };
}
