import { describe, expect, it } from 'bun:test';
import type { McpConfigContext } from '../types';
import { forEachServer, getServerCount, getServersFromContext } from './server-helpers';

describe('server-helpers', () => {
  describe('getServersFromContext', () => {
    it('should extract servers from "servers" format', () => {
      const context: McpConfigContext = {
        type: 'mcp-config',
        config: {
          servers: {
            server1: { command: 'node' },
            server2: { command: 'python' },
          },
        },
        filePath: '/test/config.json',
        format: 'servers',
      };

      const servers = getServersFromContext(context);

      expect(Object.keys(servers)).toEqual(['server1', 'server2']);
      expect(servers['server1'].command).toBe('node');
      expect(servers['server2'].command).toBe('python');
    });

    it('should extract servers from "mcpServers" format', () => {
      const context: McpConfigContext = {
        type: 'mcp-config',
        config: {
          mcpServers: {
            claude: { command: 'qnsc-mcp' },
            other: { command: 'node' },
          },
        },
        filePath: '/test/claude_desktop_config.json',
        format: 'mcpServers',
      };

      const servers = getServersFromContext(context);

      expect(Object.keys(servers)).toEqual(['claude', 'other']);
      expect(servers['claude'].command).toBe('qnsc-mcp');
    });

    it('should return empty object when no servers defined', () => {
      const context: McpConfigContext = {
        type: 'mcp-config',
        config: {},
        filePath: '/test/config.json',
        format: 'servers',
      };

      const servers = getServersFromContext(context);

      expect(servers).toEqual({});
    });

    it('should prefer "servers" over "mcpServers" when both exist', () => {
      const context: McpConfigContext = {
        type: 'mcp-config',
        config: {
          servers: {
            'from-servers': { command: 'first' },
          },
          mcpServers: {
            'from-mcpServers': { command: 'second' },
          },
        },
        filePath: '/test/config.json',
        format: 'servers',
      };

      const servers = getServersFromContext(context);

      // "servers" takes precedence due to || operator
      expect(Object.keys(servers)).toEqual(['from-servers']);
    });
  });

  describe('forEachServer', () => {
    it('should iterate over all servers', () => {
      const context: McpConfigContext = {
        type: 'mcp-config',
        config: {
          servers: {
            server1: { command: 'node', args: ['a.js'] },
            server2: { command: 'python', args: ['b.py'] },
            server3: { command: 'bun' },
          },
        },
        filePath: '/test/config.json',
        format: 'servers',
      };

      const visited: string[] = [];

      forEachServer(context, (serverName, serverConfig) => {
        visited.push(`${serverName}:${serverConfig.command}`);
      });

      expect(visited).toEqual(['server1:node', 'server2:python', 'server3:bun']);
    });

    it('should handle empty servers', () => {
      const context: McpConfigContext = {
        type: 'mcp-config',
        config: { servers: {} },
        filePath: '/test/config.json',
        format: 'servers',
      };

      const visited: string[] = [];

      forEachServer(context, (serverName) => {
        visited.push(serverName);
      });

      expect(visited).toEqual([]);
    });

    it('should provide access to full server config', () => {
      const context: McpConfigContext = {
        type: 'mcp-config',
        config: {
          servers: {
            'my-server': {
              command: 'node',
              args: ['server.js', '--port', '3000'],
              env: { NODE_ENV: 'production' },
            },
          },
        },
        filePath: '/test/config.json',
        format: 'servers',
      };

      forEachServer(context, (serverName, serverConfig) => {
        expect(serverName).toBe('my-server');
        expect(serverConfig.command).toBe('node');
        expect(serverConfig.args).toEqual(['server.js', '--port', '3000']);
        expect(serverConfig.env).toEqual({ NODE_ENV: 'production' });
      });
    });
  });

  describe('getServerCount', () => {
    it('should return correct count for servers format', () => {
      const context: McpConfigContext = {
        type: 'mcp-config',
        config: {
          servers: {
            a: { command: 'node' },
            b: { command: 'python' },
            c: { command: 'bun' },
          },
        },
        filePath: '/test/config.json',
        format: 'servers',
      };

      expect(getServerCount(context)).toBe(3);
    });

    it('should return correct count for mcpServers format', () => {
      const context: McpConfigContext = {
        type: 'mcp-config',
        config: {
          mcpServers: {
            claude: { command: 'qnsc-mcp' },
          },
        },
        filePath: '/test/config.json',
        format: 'mcpServers',
      };

      expect(getServerCount(context)).toBe(1);
    });

    it('should return 0 for empty config', () => {
      const context: McpConfigContext = {
        type: 'mcp-config',
        config: {},
        filePath: '/test/config.json',
        format: 'servers',
      };

      expect(getServerCount(context)).toBe(0);
    });

    it('should return 0 for empty servers object', () => {
      const context: McpConfigContext = {
        type: 'mcp-config',
        config: { servers: {} },
        filePath: '/test/config.json',
        format: 'servers',
      };

      expect(getServerCount(context)).toBe(0);
    });
  });
});
