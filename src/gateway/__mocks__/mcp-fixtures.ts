/**
 * mcp-fixtures.ts - Common test fixtures for MCPs
 *
 * This module provides reusable test fixtures for MCP-related data structures
 * that can be shared across test files to minimize duplication.
 */
import path from 'path';
import { z } from 'zod';
import { ToolCategories, ToolConfig } from '../../registry/types';
import { BundledMCPInfo, EnvVarConfig, MCPMetadata, ToolInfo } from '../types';

/**
 * Common paths for testing
 */
export const testPaths = {
  mcpDir: '/tmp/test-mcps',
  extractorCacheDir: '/tmp/test-extractor-cache',
  bundleOutputDir: '/tmp/test-bundle-output',
  testRepoPath: '/tmp/test-repo',
  defaultEntryPoint: 'index.js',
};

/**
 * Creates a mock MCPToolInfo object
 */
export function createMockToolInfo(
  name: string = 'test_tool',
  description: string = 'Test tool description',
  schema: unknown = {},
): ToolInfo {
  return {
    name,
    description,
    schema,
    annotations: {},
  };
}

/**
 * Creates a mock MCPMetadata object
 */
export function createMockMetadata(partialData: Partial<MCPMetadata> = {}): MCPMetadata {
  return {
    name: 'test-mcp',
    version: '1.0.0',
    entryPoint: 'index.js',
    dependencies: { 'test-dep': '^1.0.0' },
    bundleSize: 1024,
    moduleFormat: 'esm',
    tools: [
      createMockToolInfo('test_tool1', 'First test tool'),
      createMockToolInfo('test_tool2', 'Second test tool'),
    ],
    security: {
      allowNetwork: false,
      allowFileSystem: false,
    },
    ...partialData,
  };
}

/**
 * Creates a mock BundledMCPInfo object
 */
export function createMockBundledMCP(
  name: string = 'test-mcp',
  version: string = '1.0.0',
  basePath: string = testPaths.mcpDir,
  tools: ToolInfo[] = [],
): BundledMCPInfo {
  const mcpPath = path.join(basePath, name, 'index.js');

  return {
    name,
    version,
    path: mcpPath,
    tools:
      tools.length > 0
        ? tools
        : [
            createMockToolInfo('test_tool1', 'First test tool'),
            createMockToolInfo('test_tool2', 'Second test tool'),
          ],
    enabled: true,
    security: {
      allowNetwork: false,
      allowFileSystem: false,
    },
  };
}

/**
 * Creates a mock EnvVarConfig object
 */
export function createMockEnvVar(
  name: string = 'TEST_ENV_VAR',
  required: boolean = true,
  description: string = 'Test environment variable',
  defaultValue: string = '',
  mockValue: string = 'test-value',
): EnvVarConfig {
  return {
    name,
    description,
    required,
    default: defaultValue,
    mock: mockValue,
  };
}

/**
 * Creates a mock JSON-RPC request object
 */
export function createJsonRpcRequest(
  method: string = 'tools/list',
  params: unknown = {},
  id: string | number = Date.now(),
) {
  return {
    jsonrpc: '2.0',
    method,
    params,
    id,
  };
}

/**
 * Creates a mock JSON-RPC response object
 */
export function createJsonRpcResponse(id: string | number, result: unknown) {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

/**
 * Creates a mock JSON-RPC error response object
 */
export function createJsonRpcErrorResponse(
  id: string | number,
  message: string,
  code: number = -32603,
) {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
    },
  };
}

/**
 * Creates a mock initialize response
 */
export function createMockInitializeResponse(
  serverName: string = 'test-mcp-server',
  serverVersion: string = '1.0.0',
) {
  return {
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: {
        list: true,
        call: true,
      },
      resources: {
        list: false,
        read: false,
      },
    },
    serverInfo: {
      name: serverName,
      version: serverVersion,
      description: 'Test MCP Server',
    },
  };
}

/**
 * Creates a mock tools/list response
 */
export function createMockToolsListResponse(tools: BundledMCPInfo[] = []) {
  const defaultTools = [
    createMockToolInfo('test_tool1', 'First test tool'),
    createMockToolInfo('test_tool2', 'Second test tool'),
  ];

  return {
    tools: tools.length > 0 ? tools : defaultTools,
  };
}

/**
 * Creates a mock package.json content for testing
 */
export function createMockPackageJson(
  name: string = 'test-mcp',
  version: string = '1.0.0',
  main: string = 'index.js',
  dependencies: Record<string, string> = {},
) {
  return JSON.stringify(
    {
      name,
      version,
      description: 'Test MCP for testing',
      main,
      dependencies: {
        '@modelcontextprotocol/sdk': '^1.0.0',
        ...dependencies,
      },
    },
    null,
    2,
  );
}

/**
 * Creates mock MCP code for testing
 */
export function createMockMCPCode(
  toolName: string = 'test_tool',
  toolDescription: string = 'Test tool description',
) {
  return `
/**
 * Test MCP implementation
 */
import { Tool } from '@modelcontextprotocol/sdk';

class ${toolName.charAt(0).toUpperCase() + toolName.slice(1)}Tool implements Tool {
  public name = '${toolName}';
  public description = '${toolDescription}';

  public async execute(params: any) {
    // Example implementation
    const message = params.message || 'Hello from test tool!';
    return { message };
  }
}

export default new ${toolName.charAt(0).toUpperCase() + toolName.slice(1)}Tool();
`;
}

/**
 * Creates a mock MCP tool schema for testing
 */
export function createMockToolSchema() {
  return {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Message to echo back',
      },
      number: {
        type: 'number',
        description: 'A test number parameter',
      },
    },
  };
}

/**
 * Creates a mock ToolConfig object for testing
 */
export function createMockToolConfig(
  id: string = 'test-mcp_test-tool',
  name: string = 'test-mcp_test-tool',
  description: string = 'Test tool description',
  category: ToolCategories = 'Bundled',
): ToolConfig {
  return {
    id,
    name,
    description,
    category,
    parameters: z.object({
      message: z.string().optional().describe('Message to echo back'),
      number: z.number().optional().describe('A test number parameter'),
    }),
    includeByDefault: true,
    annotations: {},
  };
}
