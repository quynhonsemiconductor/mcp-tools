/**
 * mcp-transformers.test.ts - Unit tests for MCP transformation utilities
 */

import { describe, expect, test } from 'bun:test';
import type { UnifiedMCPInfo, UnifiedToolInfo } from './mcp-models';
import {
  filterEnabledTools,
  groupToolsByCategory,
  sortToolsByName,
  transformBundledMCP,
  transformEnvVars,
  transformLocalMCP,
  transformNativeTools,
  transformRemoteMCP,
  transformTool,
} from './mcp-transformers';

describe('mcp-transformers', () => {
  describe('transformEnvVars', () => {
    test('transforms array of strings', () => {
      const envVars = ['GRAFANA_K6_TOKEN', 'K6_PROJECT'];
      const result = transformEnvVars(envVars);

      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('GRAFANA_K6_TOKEN');
      expect(result[0].required).toBe(true);
      expect(result[1].key).toBe('K6_PROJECT');
      expect(result[1].required).toBe(true);
      // Description may or may not be present depending on if schema loads
    });

    test('transforms array of objects from bundled MCPs', () => {
      const envVars = [
        { name: 'API_KEY', description: 'API key for service', required: true },
        { name: 'API_URL', description: 'Service URL', required: false },
      ];
      const result = transformEnvVars(envVars);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        key: 'API_KEY',
        description: 'API key for service',
        required: true,
      });
      expect(result[1]).toEqual({
        key: 'API_URL',
        description: 'Service URL',
        required: false,
      });
    });

    test('handles undefined envVars', () => {
      const result = transformEnvVars(undefined);
      expect(result).toEqual([]);
    });

    test('handles empty array', () => {
      const result = transformEnvVars([]);
      expect(result).toEqual([]);
    });

    test('handles envVars not in schema', () => {
      const envVars = ['UNKNOWN_VAR'];
      const result = transformEnvVars(envVars);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        key: 'UNKNOWN_VAR',
        description: '',
        required: true,
      });
    });
  });

  describe('transformTool', () => {
    test('transforms bundled tool', () => {
      const tool = {
        name: 'browser_click',
        description: 'Click on a web element',
        schema: { type: 'object', properties: {} },
        annotations: { category: 'browser' },
      };

      const result = transformTool(
        tool,
        'playwright',
        'Playwright',
        'bundled',
        'Browser Automation',
      );

      expect(result).toEqual({
        id: 'playwright__browser-click',
        name: 'browser_click',
        displayName: 'Playwright__browser_click',
        description: 'Click on a web element',
        category: 'Browser Automation',
        mcpId: 'playwright',
        mcpName: 'Playwright',
        provider: 'bundled',
        parameters: { type: 'object', properties: {} },
        annotations: { category: 'browser' },
      });
    });

    test('transforms remote tool', () => {
      const tool = {
        name: 'createIssue',
        description: 'Create a GitHub issue',
        parameters: { type: 'object' },
      };

      const result = transformTool(tool, 'github-remote', 'GitHub', 'remote', 'Development');

      expect(result).toEqual({
        id: 'remote-github__createissue',
        name: 'createIssue',
        displayName: 'GitHub__createIssue',
        description: 'Create a GitHub issue',
        category: 'Development',
        mcpId: 'github-remote',
        mcpName: 'GitHub',
        provider: 'remote',
        parameters: { type: 'object' },
        annotations: {},
      });
    });

    test('handles unknown tool name', () => {
      const tool = {
        name: '',
        description: 'A tool',
      };

      const result = transformTool(tool, 'mcp', 'MCP', 'bundled', 'General');

      expect(result.name).toBe('unknown');
      expect(result.id).toBe('mcp__unknown');
    });

    test('generates default description if missing', () => {
      const tool = {
        name: 'mytool',
        description: '',
      };

      const result = transformTool(tool, 'mcp', 'MCP', 'bundled', 'General');

      expect(result.description).toBe('Tool from MCP');
    });
  });

  describe('transformBundledMCP', () => {
    test('transforms bundled MCP with tools', () => {
      const mcp = {
        path: '/path/to/mcp',
        name: 'Playwright',
        version: '1.0.0',
        enabled: true,
        tools: [
          {
            name: 'browser_click',
            description: 'Click element',
            schema: { type: 'object' },
            annotations: {},
          },
        ],
        envVars: [{ name: 'BROWSER_PATH', description: 'Browser path', required: false }],
      };

      const config = {
        tools: { includeMCPs: ['Playwright'] },
      };

      const result = transformBundledMCP(mcp, config as any);

      expect(result.id).toBe('playwright');
      expect(result.name).toBe('Playwright');
      expect(result.provider).toBe('bundled');
      expect(result.enabled).toBe(true);
      expect(result.connected).toBe(true);
      expect(result.version).toBe('1.0.0');
      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].id).toBe('playwright__browser-click');
    });

    test('marks MCP as disabled if not in config', () => {
      const mcp = {
        path: '/path/to/mcp',
        name: 'Test MCP',
        version: '1.0.0',
        enabled: false,
        tools: [],
        envVars: [],
      };

      const config = {
        tools: { includeMCPs: [] },
      };

      const result = transformBundledMCP(mcp, config as any);

      expect(result.enabled).toBe(false);
      expect(result.connected).toBe(false);
    });
  });

  describe('transformRemoteMCP', () => {
    test('transforms remote MCP with tools', () => {
      const mcpInfo = {
        name: 'GitHub',
        tools: [
          {
            name: 'createIssue',
            description: 'Create issue',
            parameters: {},
            serverId: 'github',
            serverName: 'GitHub',
            annotations: {},
          },
        ],
      };

      const serverDef = {
        id: 'github-remote',
        name: 'GitHub',
        description: 'GitHub integration',
        category: 'Development',
        url: 'https://api.github.com',
        requiredEnvVars: ['GITHUB_TOKEN'],
      };

      const config = {
        tools: { includeRemoteMCPs: ['github-remote'] },
      };

      const result = transformRemoteMCP(
        mcpInfo as any,
        serverDef as any,
        'connected',
        config as any,
      );

      expect(result.id).toBe('github-remote');
      expect(result.provider).toBe('remote');
      expect(result.enabled).toBe(true);
      expect(result.connected).toBe(true);
      expect(result.url).toBe('https://api.github.com');
      expect(result.tools).toHaveLength(1);
    });
  });

  describe('transformLocalMCP', () => {
    test('transforms local MCP with tools', () => {
      const mcpInfo = {
        name: 'FileSystem',
        tools: [
          {
            name: 'readFile',
            description: 'Read file',
            parameters: {},
            serverId: 'filesystem',
            serverName: 'FileSystem',
            annotations: {},
          },
        ],
      };

      const serverDef = {
        id: 'filesystem-local',
        name: 'FileSystem',
        description: 'File system operations',
        category: 'System',
        launch: 'node filesystem-mcp.js',
        requiredEnvVars: [],
      };

      const config = {
        tools: { includeLocalMCPs: ['filesystem-local'] },
      };

      const result = transformLocalMCP(
        mcpInfo as any,
        serverDef as any,
        'connected',
        config as any,
      );

      expect(result.id).toBe('filesystem-local');
      expect(result.provider).toBe('local');
      expect(result.enabled).toBe(true);
      expect(result.connected).toBe(true);
      expect(result.launch).toBe('node filesystem-mcp.js');
      expect(result.tools).toHaveLength(1);
    });
  });

  describe('transformNativeTools', () => {
    test('transforms native tools into multiple MCPs grouped by category', () => {
      const tools = [
        {
          id: 'webfetch',
          name: 'webFetch',
          description: 'Fetch from web',
          category: 'Web',
          parameters: {} as any,
          provider: 'native' as const,
        },
        {
          id: 'websearch',
          name: 'webSearch',
          description: 'Search web',
          category: 'Web',
          parameters: {} as any,
          provider: 'native' as const,
        },
        {
          id: 'dbquery',
          name: 'dbQuery',
          description: 'Query database',
          category: 'Database',
          parameters: {} as any,
          provider: 'native' as const,
        },
      ];

      const result = transformNativeTools(tools as any);

      // Should have 2 MCPs (one for Web, one for Database)
      expect(result).toHaveLength(2);

      // Check they're sorted by category
      expect(result[0].category).toBe('Database');
      expect(result[1].category).toBe('Web');

      // Check Database MCP
      expect(result[0].id).toBe('native-database');
      expect(result[0].name).toBe('Native: Database');
      expect(result[0].provider).toBe('native');
      expect(result[0].enabled).toBe(true);
      expect(result[0].connected).toBe(true);
      expect(result[0].tools).toHaveLength(1);
      expect(result[0].tools[0].id).toBe('dbquery');
      expect(result[0].tools[0].mcpId).toBe('native-database');

      // Check Web MCP
      expect(result[1].id).toBe('native-web');
      expect(result[1].name).toBe('Native: Web');
      expect(result[1].tools).toHaveLength(2);
      expect(result[1].tools[0].id).toBe('webfetch');
      expect(result[1].tools[1].id).toBe('websearch');
      expect(result[1].tools[0].mcpId).toBe('native-web');
    });

    test('filters out non-native tools', () => {
      const tools = [
        {
          id: 'webfetch',
          name: 'webFetch',
          description: 'Fetch from web',
          category: 'Web',
          parameters: {} as any,
          provider: 'native' as const,
        },
        {
          id: 'remote-tool',
          name: 'remoteTool',
          description: 'Remote tool',
          category: 'Remote',
          parameters: {} as any,
          provider: 'remote' as const,
        },
      ];

      const result = transformNativeTools(tools as any);

      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('Web');
      expect(result[0].tools).toHaveLength(1);
      expect(result[0].tools[0].id).toBe('webfetch');
    });

    test('handles tools without category as Uncategorized', () => {
      const tools = [
        {
          id: 'tool1',
          name: 'tool1',
          description: 'Tool without category',
          parameters: {} as any,
          provider: 'native' as const,
        },
      ];

      const result = transformNativeTools(tools as any);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('native-uncategorized');
      expect(result[0].category).toBe('Uncategorized');
      expect(result[0].name).toBe('Native: Uncategorized');
    });

    test('creates clean MCP IDs from category names', () => {
      const tools = [
        {
          id: 'tool1',
          name: 'tool1',
          description: 'Tool',
          category: 'QNSC Internal',
          parameters: {} as any,
          provider: 'native' as const,
        },
        {
          id: 'tool2',
          name: 'tool2',
          description: 'Tool',
          category: 'Github: Issues',
          parameters: {} as any,
          provider: 'native' as const,
        },
      ];

      const result = transformNativeTools(tools as any);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('native-github-issues');
      expect(result[1].id).toBe('native-qnsc-internal');
    });
  });

  describe('groupToolsByCategory', () => {
    test('groups tools by category', () => {
      const tools: UnifiedToolInfo[] = [
        {
          id: 'tool1',
          name: 'tool1',
          displayName: 'Tool 1',
          description: 'Tool 1',
          category: 'Web',
          mcpId: 'mcp1',
          mcpName: 'MCP1',
          provider: 'native',
          parameters: {},
          annotations: {},
        },
        {
          id: 'tool2',
          name: 'tool2',
          displayName: 'Tool 2',
          description: 'Tool 2',
          category: 'Web',
          mcpId: 'mcp1',
          mcpName: 'MCP1',
          provider: 'native',
          parameters: {},
          annotations: {},
        },
        {
          id: 'tool3',
          name: 'tool3',
          displayName: 'Tool 3',
          description: 'Tool 3',
          category: 'Database',
          mcpId: 'mcp2',
          mcpName: 'MCP2',
          provider: 'bundled',
          parameters: {},
          annotations: {},
        },
      ];

      const result = groupToolsByCategory(tools);

      expect(Object.keys(result)).toHaveLength(2);
      expect(result.Web).toHaveLength(2);
      expect(result.Database).toHaveLength(1);
    });

    test('handles tools without category', () => {
      const tools: UnifiedToolInfo[] = [
        {
          id: 'tool1',
          name: 'tool1',
          displayName: 'Tool 1',
          description: 'Tool 1',
          category: '',
          mcpId: 'mcp1',
          mcpName: 'MCP1',
          provider: 'native',
          parameters: {},
          annotations: {},
        } as any,
      ];

      const result = groupToolsByCategory(tools);

      expect(result.Uncategorized).toHaveLength(1);
    });
  });

  describe('sortToolsByName', () => {
    test('sorts tools alphabetically', () => {
      const tools: UnifiedToolInfo[] = [
        { name: 'zebra', id: 'z', displayName: 'z' } as any,
        { name: 'apple', id: 'a', displayName: 'a' } as any,
        { name: 'mango', id: 'm', displayName: 'm' } as any,
      ];

      const result = sortToolsByName(tools);

      expect(result[0].name).toBe('apple');
      expect(result[1].name).toBe('mango');
      expect(result[2].name).toBe('zebra');
    });

    test('does not mutate original array', () => {
      const tools: UnifiedToolInfo[] = [
        { name: 'zebra', id: 'z', displayName: 'z' } as any,
        { name: 'apple', id: 'a', displayName: 'a' } as any,
      ];

      const originalFirst = tools[0].name;
      sortToolsByName(tools);

      expect(tools[0].name).toBe(originalFirst);
    });
  });

  describe('filterEnabledTools', () => {
    test('filters tools from enabled MCPs', () => {
      const tools: UnifiedToolInfo[] = [
        { id: 'tool1', mcpId: 'mcp1', name: 'tool1' } as any,
        { id: 'tool2', mcpId: 'mcp2', name: 'tool2' } as any,
        { id: 'tool3', mcpId: 'mcp3', name: 'tool3' } as any,
      ];

      const mcps: UnifiedMCPInfo[] = [
        { id: 'mcp1', enabled: true } as any,
        { id: 'mcp2', enabled: false } as any,
        { id: 'mcp3', enabled: true } as any,
      ];

      const result = filterEnabledTools(tools, mcps);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('tool1');
      expect(result[1].id).toBe('tool3');
    });

    test('returns empty array if no MCPs enabled', () => {
      const tools: UnifiedToolInfo[] = [{ id: 'tool1', mcpId: 'mcp1', name: 'tool1' } as any];

      const mcps: UnifiedMCPInfo[] = [{ id: 'mcp1', enabled: false } as any];

      const result = filterEnabledTools(tools, mcps);

      expect(result).toEqual([]);
    });
  });
});
