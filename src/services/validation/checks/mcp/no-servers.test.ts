import { describe, expect, it } from 'bun:test';
import type { McpConfigContext } from '../../types';
import { noServersCheck } from './no-servers';

describe('noServersCheck', () => {
  const createContext = (
    config: Record<string, unknown>,
    format: 'servers' | 'mcpServers' = 'servers',
  ): McpConfigContext => ({
    type: 'mcp-config',
    config,
    filePath: '/test/mcp.json',
    format,
  });

  describe('servers format', () => {
    it('should return warning when servers object is empty', () => {
      const context = createContext({ servers: {} });

      const issues = noServersCheck.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('warning');
      expect(issues[0].code).toBe('NO_SERVERS_CONFIGURED');
      expect(issues[0].message).toBe('No servers configured');
    });

    it('should return warning when servers key is missing', () => {
      const context = createContext({});

      const issues = noServersCheck.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('warning');
      expect(issues[0].code).toBe('NO_SERVERS_CONFIGURED');
    });

    it('should NOT return warning when at least one server is configured', () => {
      const context = createContext({
        servers: {
          'my-server': {
            command: 'node',
            args: ['server.js'],
          },
        },
      });

      const issues = noServersCheck.run(context);

      expect(issues).toHaveLength(0);
    });

    it('should NOT return warning when multiple servers are configured', () => {
      const context = createContext({
        servers: {
          server1: { command: 'node' },
          server2: { command: 'python' },
          server3: { command: 'bun' },
        },
      });

      const issues = noServersCheck.run(context);

      expect(issues).toHaveLength(0);
    });
  });

  describe('mcpServers format', () => {
    it('should return warning when mcpServers object is empty', () => {
      const context = createContext({ mcpServers: {} }, 'mcpServers');

      const issues = noServersCheck.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('warning');
      expect(issues[0].code).toBe('NO_SERVERS_CONFIGURED');
    });

    it('should NOT return warning when at least one mcpServer is configured', () => {
      const context = createContext(
        {
          mcpServers: {
            'claude-server': {
              command: 'node',
              args: ['server.js'],
            },
          },
        },
        'mcpServers',
      );

      const issues = noServersCheck.run(context);

      expect(issues).toHaveLength(0);
    });
  });

  describe('check metadata', () => {
    it('should have correct check ID', () => {
      expect(noServersCheck.id).toBe('mcp.no-servers');
    });

    it('should apply to mcp-config context', () => {
      expect(noServersCheck.appliesTo).toBe('mcp-config');
    });

    it('should have CRITICAL priority', () => {
      // CRITICAL priority is 5
      expect(noServersCheck.priority).toBe(5);
    });
  });

  describe('issue details', () => {
    it('should include helpful details in the warning', () => {
      const context = createContext({ servers: {} });

      const issues = noServersCheck.run(context);

      expect(issues[0].details).toBe(
        'Configuration file exists but contains no server definitions. This may be intentional during initial setup.',
      );
    });
  });
});
