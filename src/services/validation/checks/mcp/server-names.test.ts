import { describe, expect, it } from 'bun:test';
import type { McpConfigContext } from '../../types';
import { serverNameValidation } from './server-names';

describe('serverNameValidation', () => {
  const createContext = (
    servers: Record<string, any>,
    format: 'servers' | 'mcpServers' = 'servers',
  ): McpConfigContext => ({
    type: 'mcp-config',
    config: format === 'servers' ? { servers } : { mcpServers: servers },
    filePath: '/test/mcp.json',
    format,
  });

  describe('empty server names', () => {
    it('should detect empty server name', () => {
      const context = createContext({
        '': { command: 'node' },
      });

      const issues = serverNameValidation.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('error');
      expect(issues[0].code).toBe('INVALID_SERVER_NAME');
      expect(issues[0].message).toContain('cannot be empty');
    });

    it('should detect whitespace-only server name', () => {
      const context = createContext({
        '   ': { command: 'node' },
      });

      const issues = serverNameValidation.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('error');
      expect(issues[0].code).toBe('INVALID_SERVER_NAME');
    });
  });

  describe('spaces in server names', () => {
    it('should warn about spaces in server names', () => {
      const context = createContext({
        'my server': { command: 'node' },
      });

      const issues = serverNameValidation.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('warning');
      expect(issues[0].code).toBe('SERVER_NAME_HAS_SPACES');
      expect(issues[0].message).toContain('my server');
      expect(issues[0].details).toContain('MCP clients');
    });

    it('should warn about multiple spaces in name', () => {
      const context = createContext({
        'my  test  server': { command: 'node' },
      });

      const issues = serverNameValidation.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('SERVER_NAME_HAS_SPACES');
    });

    it('should NOT generate naming convention info for names with spaces', () => {
      // Names with spaces should only get the space warning, not naming convention info
      const context = createContext({
        'my server': { command: 'node' },
      });

      const issues = serverNameValidation.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('SERVER_NAME_HAS_SPACES');
      // Should NOT also have SERVER_NAME_CONVENTION
      expect(issues.some((i) => i.code === 'SERVER_NAME_CONVENTION')).toBe(false);
    });
  });

  describe('naming convention (kebab-case)', () => {
    it('should suggest kebab-case for camelCase names', () => {
      const context = createContext({
        myServer: { command: 'node' },
      });

      const issues = serverNameValidation.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('info');
      expect(issues[0].code).toBe('SERVER_NAME_CONVENTION');
      expect(issues[0].message).toContain('myServer');
      expect(issues[0].message).toContain("doesn't follow kebab-case");
      expect(issues[0].details).toContain('lowercase');
    });

    it('should suggest kebab-case for PascalCase names', () => {
      const context = createContext({
        MyServer: { command: 'node' },
      });

      const issues = serverNameValidation.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('info');
      expect(issues[0].code).toBe('SERVER_NAME_CONVENTION');
    });

    it('should suggest kebab-case for snake_case names', () => {
      const context = createContext({
        my_server: { command: 'node' },
      });

      const issues = serverNameValidation.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('info');
      expect(issues[0].code).toBe('SERVER_NAME_CONVENTION');
    });

    it('should suggest kebab-case for SCREAMING_CASE names', () => {
      const context = createContext({
        MY_SERVER: { command: 'node' },
      });

      const issues = serverNameValidation.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('info');
      expect(issues[0].code).toBe('SERVER_NAME_CONVENTION');
    });

    it('should NOT flag valid kebab-case names', () => {
      const context = createContext({
        'my-server': { command: 'node' },
        'another-test-server': { command: 'python' },
        server1: { command: 'bun' },
      });

      const issues = serverNameValidation.run(context);

      expect(issues).toHaveLength(0);
    });

    it('should NOT flag simple lowercase names', () => {
      const context = createContext({
        server: { command: 'node' },
        test: { command: 'python' },
      });

      const issues = serverNameValidation.run(context);

      expect(issues).toHaveLength(0);
    });

    it('should NOT flag names starting with numbers after first char', () => {
      const context = createContext({
        server1: { command: 'node' },
        'test-v2': { command: 'python' },
      });

      const issues = serverNameValidation.run(context);

      expect(issues).toHaveLength(0);
    });

    it('should flag names starting with uppercase', () => {
      const context = createContext({
        Server: { command: 'node' },
      });

      const issues = serverNameValidation.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('SERVER_NAME_CONVENTION');
    });

    it('should flag names starting with numbers', () => {
      const context = createContext({
        '123-server': { command: 'node' },
      });

      const issues = serverNameValidation.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('SERVER_NAME_CONVENTION');
    });
  });

  describe('multiple servers', () => {
    it('should check all servers independently', () => {
      const context = createContext({
        '': { command: 'node' }, // Error: empty
        'my server': { command: 'python' }, // Warning: spaces
        MyServer: { command: 'bun' }, // Info: convention
        'valid-server': { command: 'deno' }, // OK
      });

      const issues = serverNameValidation.run(context);

      expect(issues).toHaveLength(3);

      const errorIssue = issues.find((i) => i.severity === 'error');
      const warningIssue = issues.find((i) => i.severity === 'warning');
      const infoIssue = issues.find((i) => i.severity === 'info');

      expect(errorIssue?.code).toBe('INVALID_SERVER_NAME');
      expect(warningIssue?.code).toBe('SERVER_NAME_HAS_SPACES');
      expect(infoIssue?.code).toBe('SERVER_NAME_CONVENTION');
    });
  });

  describe('format compatibility', () => {
    it('should work with mcpServers format', () => {
      const context = createContext(
        {
          MyClaudeServer: { command: 'qnsc-mcp' },
        },
        'mcpServers',
      );

      const issues = serverNameValidation.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('SERVER_NAME_CONVENTION');
    });
  });
});
