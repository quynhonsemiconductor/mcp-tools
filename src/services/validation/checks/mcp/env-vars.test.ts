import { describe, expect, it } from 'bun:test';
import type { McpConfigContext } from '../../types';
import { envVarValidation } from './env-vars';

describe('envVarValidation', () => {
  const createContext = (
    servers: Record<string, any>,
    format: 'servers' | 'mcpServers' = 'servers',
  ): McpConfigContext => ({
    type: 'mcp-config',
    config: format === 'servers' ? { servers } : { mcpServers: servers },
    filePath: '/test/mcp.json',
    format,
  });

  describe('empty value detection', () => {
    it('should detect empty string env values', () => {
      const context = createContext({
        'test-server': {
          command: 'node',
          env: {
            API_KEY: '',
          },
        },
      });

      const issues = envVarValidation.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('MISSING_ENV_VAR');
      expect(issues[0].severity).toBe('warning');
      expect(issues[0].message).toContain('API_KEY');
      expect(issues[0].serverName).toBe('test-server');
    });

    it('should detect whitespace-only env values', () => {
      const context = createContext({
        'test-server': {
          command: 'node',
          env: {
            SECRET: '   ',
          },
        },
      });

      const issues = envVarValidation.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('MISSING_ENV_VAR');
      expect(issues[0].message).toContain('SECRET');
    });

    it('should detect multiple empty values', () => {
      const context = createContext({
        'test-server': {
          command: 'node',
          env: {
            API_KEY: '',
            TOKEN: '  ',
            SECRET: '',
          },
        },
      });

      const issues = envVarValidation.run(context);

      expect(issues).toHaveLength(3);
      expect(issues.every((i) => i.code === 'MISSING_ENV_VAR')).toBe(true);
    });
  });

  describe('placeholder detection', () => {
    it('should detect placeholder values', () => {
      const context = createContext({
        'test-server': {
          command: 'node',
          env: {
            API_KEY: 'your-api-key-here',
          },
        },
      });

      const issues = envVarValidation.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('PLACEHOLDER_ENV_VAR');
      expect(issues[0].message).toContain('API_KEY');
    });

    it('should detect TODO placeholders', () => {
      const context = createContext({
        'test-server': {
          command: 'node',
          env: {
            SECRET: 'TODO',
          },
        },
      });

      const issues = envVarValidation.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('PLACEHOLDER_ENV_VAR');
    });

    it('should detect angle bracket placeholders', () => {
      const context = createContext({
        'test-server': {
          command: 'node',
          env: {
            TOKEN: '<your-token-here>',
          },
        },
      });

      const issues = envVarValidation.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('PLACEHOLDER_ENV_VAR');
    });
  });

  describe('valid values', () => {
    it('should NOT flag valid env values', () => {
      const context = createContext({
        'test-server': {
          command: 'node',
          env: {
            NODE_ENV: 'production',
            PORT: '3000',
            DEBUG: 'true',
          },
        },
      });

      const issues = envVarValidation.run(context);

      expect(issues).toHaveLength(0);
    });

    it('should NOT flag env var references', () => {
      const context = createContext({
        'test-server': {
          command: 'node',
          env: {
            API_KEY: '$API_KEY',
            SECRET: '${SECRET}',
          },
        },
      });

      const issues = envVarValidation.run(context);

      expect(issues).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle servers without env section', () => {
      const context = createContext({
        'test-server': {
          command: 'node',
        },
      });

      const issues = envVarValidation.run(context);

      expect(issues).toHaveLength(0);
    });

    it('should handle null env section', () => {
      const context = createContext({
        'test-server': {
          command: 'node',
          env: null,
        },
      });

      const issues = envVarValidation.run(context);

      expect(issues).toHaveLength(0);
    });

    it('should skip non-string env values', () => {
      const context = createContext({
        'test-server': {
          command: 'node',
          env: {
            NUMBER: 123,
            BOOL: true,
            OBJ: { nested: 'value' },
          },
        },
      });

      const issues = envVarValidation.run(context);

      expect(issues).toHaveLength(0);
    });

    it('should work with mcpServers format', () => {
      const context = createContext(
        {
          claude: {
            command: 'qnsc-mcp',
            env: {
              EMPTY_VAR: '',
            },
          },
        },
        'mcpServers',
      );

      const issues = envVarValidation.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('MISSING_ENV_VAR');
    });

    it('should detect issues across multiple servers', () => {
      const context = createContext({
        server1: {
          command: 'node',
          env: {
            KEY1: '',
          },
        },
        server2: {
          command: 'python',
          env: {
            KEY2: 'your-key',
          },
        },
      });

      const issues = envVarValidation.run(context);

      expect(issues).toHaveLength(2);
      expect(issues[0].serverName).toBe('server1');
      expect(issues[0].code).toBe('MISSING_ENV_VAR');
      expect(issues[1].serverName).toBe('server2');
      expect(issues[1].code).toBe('PLACEHOLDER_ENV_VAR');
    });
  });
});
