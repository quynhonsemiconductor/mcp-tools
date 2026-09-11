import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { McpConfigContext } from '../../types';
import { envVarExpansionCheck } from './env-var-expansion';

describe('envVarExpansionCheck', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment to original state before each test
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  afterEach(() => {
    // Restore original environment
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  const createContext = (
    servers: Record<string, any>,
    format: 'servers' | 'mcpServers' = 'servers',
  ): McpConfigContext => ({
    type: 'mcp-config',
    config: format === 'servers' ? { servers } : { mcpServers: servers },
    filePath: '/test/mcp.json',
    format,
  });

  describe('missing environment variables', () => {
    it('should warn when ${VAR} references an unset variable', () => {
      delete process.env.MY_UNSET_VAR;

      const context = createContext({
        'test-server': {
          command: 'node',
          env: {
            API_KEY: '${MY_UNSET_VAR}',
          },
        },
      });

      const issues = envVarExpansionCheck.run(context);

      const warnings = issues.filter((i) => i.severity === 'warning');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].code).toBe('ENV_VAR_EXPANSION_MISSING');
      expect(warnings[0].message).toContain('MY_UNSET_VAR');
      expect(warnings[0].serverName).toBe('test-server');
    });

    it('should NOT warn when ${VAR:-default} has a default value', () => {
      delete process.env.MY_UNSET_VAR;

      const context = createContext({
        'test-server': {
          command: 'node',
          env: {
            API_KEY: '${MY_UNSET_VAR:-fallback-value}',
          },
        },
      });

      const issues = envVarExpansionCheck.run(context);

      const warnings = issues.filter((i) => i.severity === 'warning');
      expect(warnings).toHaveLength(0);
    });

    it('should NOT warn when ${VAR} references a set variable', () => {
      process.env.MY_SET_VAR = 'actual-value';

      const context = createContext({
        'test-server': {
          command: 'node',
          env: {
            API_KEY: '${MY_SET_VAR}',
          },
        },
      });

      const issues = envVarExpansionCheck.run(context);

      const warnings = issues.filter((i) => i.severity === 'warning');
      expect(warnings).toHaveLength(0);
    });

    it('should detect multiple missing variables', () => {
      delete process.env.VAR_ONE;
      delete process.env.VAR_TWO;

      const context = createContext({
        'test-server': {
          command: 'node',
          env: {
            KEY1: '${VAR_ONE}',
            KEY2: '${VAR_TWO}',
          },
        },
      });

      const issues = envVarExpansionCheck.run(context);

      const warnings = issues.filter((i) => i.severity === 'warning');
      expect(warnings).toHaveLength(2);
      expect(warnings.some((w) => w.message.includes('VAR_ONE'))).toBe(true);
      expect(warnings.some((w) => w.message.includes('VAR_TWO'))).toBe(true);
    });
  });

  describe('expansion locations', () => {
    it('should detect expansions in command field', () => {
      delete process.env.MY_COMMAND;

      const context = createContext({
        'test-server': {
          command: '${MY_COMMAND}',
        },
      });

      const issues = envVarExpansionCheck.run(context);

      const warnings = issues.filter((i) => i.severity === 'warning');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].details).toContain('command');
    });

    it('should detect expansions in args array', () => {
      delete process.env.MY_ARG;

      const context = createContext({
        'test-server': {
          command: 'node',
          args: ['--config', '${MY_ARG}'],
        },
      });

      const issues = envVarExpansionCheck.run(context);

      const warnings = issues.filter((i) => i.severity === 'warning');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].details).toContain('args');
    });

    it('should detect expansions in url field', () => {
      delete process.env.API_BASE;

      const context = createContext({
        'test-server': {
          type: 'http',
          url: '${API_BASE}/mcp',
        },
      });

      const issues = envVarExpansionCheck.run(context);

      const warnings = issues.filter((i) => i.severity === 'warning');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].details).toContain('url');
    });

    it('should detect expansions in headers', () => {
      delete process.env.AUTH_TOKEN;

      const context = createContext({
        'test-server': {
          type: 'http',
          url: 'https://api.example.com/mcp',
          headers: {
            Authorization: 'Bearer ${AUTH_TOKEN}',
          },
        },
      });

      const issues = envVarExpansionCheck.run(context);

      const warnings = issues.filter((i) => i.severity === 'warning');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].details).toContain('headers.Authorization');
    });
  });

  describe('info messages', () => {
    it('should add info message when variables will be expanded', () => {
      process.env.MY_SET_VAR = 'value';

      const context = createContext({
        'test-server': {
          command: 'node',
          env: {
            KEY: '${MY_SET_VAR}',
          },
        },
      });

      const issues = envVarExpansionCheck.run(context);

      const infos = issues.filter((i) => i.severity === 'info');
      expect(infos).toHaveLength(1);
      expect(infos[0].code).toBe('ENV_VAR_EXPANSION_INFO');
      expect(infos[0].details).toContain('MY_SET_VAR');
    });

    it('should indicate when default value will be used', () => {
      delete process.env.MY_UNSET_VAR;

      const context = createContext({
        'test-server': {
          command: 'node',
          env: {
            KEY: '${MY_UNSET_VAR:-default}',
          },
        },
      });

      const issues = envVarExpansionCheck.run(context);

      const infos = issues.filter((i) => i.severity === 'info');
      expect(infos).toHaveLength(1);
      expect(infos[0].details).toContain('using default');
    });

    it('should NOT add info message when no expansions are present', () => {
      const context = createContext({
        'test-server': {
          command: 'node',
          env: {
            KEY: 'static-value',
          },
        },
      });

      const issues = envVarExpansionCheck.run(context);

      const infos = issues.filter((i) => i.severity === 'info');
      expect(infos).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple expansions in same value', () => {
      delete process.env.VAR1;
      delete process.env.VAR2;

      const context = createContext({
        'test-server': {
          command: 'node',
          env: {
            COMBINED: '${VAR1}:${VAR2}',
          },
        },
      });

      const issues = envVarExpansionCheck.run(context);

      const warnings = issues.filter((i) => i.severity === 'warning');
      expect(warnings).toHaveLength(2);
    });

    it('should handle empty default values', () => {
      delete process.env.MY_VAR;

      const context = createContext({
        'test-server': {
          command: 'node',
          env: {
            KEY: '${MY_VAR:-}',
          },
        },
      });

      const issues = envVarExpansionCheck.run(context);

      // Empty default is still a default, so no warning
      const warnings = issues.filter((i) => i.severity === 'warning');
      expect(warnings).toHaveLength(0);
    });

    it('should handle servers without expandable fields', () => {
      const context = createContext({
        'test-server': {
          command: 'node',
        },
      });

      const issues = envVarExpansionCheck.run(context);

      expect(issues).toHaveLength(0);
    });

    it('should work with mcpServers format', () => {
      delete process.env.MY_VAR;

      const context = createContext(
        {
          claude: {
            command: 'qnsc-mcp',
            env: {
              KEY: '${MY_VAR}',
            },
          },
        },
        'mcpServers',
      );

      const issues = envVarExpansionCheck.run(context);

      const warnings = issues.filter((i) => i.severity === 'warning');
      expect(warnings).toHaveLength(1);
    });

    it('should detect issues across multiple servers', () => {
      delete process.env.VAR1;
      delete process.env.VAR2;

      const context = createContext({
        server1: {
          command: 'node',
          env: {
            KEY: '${VAR1}',
          },
        },
        server2: {
          command: 'python',
          env: {
            KEY: '${VAR2}',
          },
        },
      });

      const issues = envVarExpansionCheck.run(context);

      const warnings = issues.filter((i) => i.severity === 'warning');
      expect(warnings).toHaveLength(2);
      expect(warnings[0].serverName).toBe('server1');
      expect(warnings[1].serverName).toBe('server2');
    });

    it('should warn about $VAR syntax (shell-style without braces)', () => {
      const context = createContext({
        'test-server': {
          command: 'node',
          env: {
            // $VAR without braces works in Copilot but not Claude Code
            KEY: '$MY_VAR',
          },
        },
      });

      const issues = envVarExpansionCheck.run(context);

      const warnings = issues.filter((i) => i.code === 'ENV_VAR_UNSUPPORTED_SYNTAX');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('shell-style');
      expect(warnings[0].message).toContain('$MY_VAR');
      expect(warnings[0].details).toContain('Claude Code');
      expect(warnings[0].details).toContain('${MY_VAR}');
    });

    it('should warn about %VAR% syntax (Windows CMD-style)', () => {
      const context = createContext({
        'test-server': {
          command: 'node',
          env: {
            KEY: '%MY_VAR%',
          },
        },
      });

      const issues = envVarExpansionCheck.run(context);

      const warnings = issues.filter((i) => i.code === 'ENV_VAR_UNSUPPORTED_SYNTAX');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('Windows CMD-style');
      expect(warnings[0].message).toContain('%MY_VAR%');
      expect(warnings[0].details).toContain('treated as a literal string');
      expect(warnings[0].details).toContain('${MY_VAR}');
    });

    it('should warn about $env:VAR syntax (PowerShell-style)', () => {
      const context = createContext({
        'test-server': {
          command: 'node',
          env: {
            KEY: '$env:MY_VAR',
          },
        },
      });

      const issues = envVarExpansionCheck.run(context);

      const warnings = issues.filter((i) => i.code === 'ENV_VAR_UNSUPPORTED_SYNTAX');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('PowerShell-style');
      expect(warnings[0].message).toContain('$env:MY_VAR');
      expect(warnings[0].details).toContain('treated as a literal string');
      expect(warnings[0].details).toContain('${MY_VAR}');
    });

    it('should warn about $env:VAR syntax case-insensitively', () => {
      const context = createContext({
        'test-server': {
          command: 'node',
          env: {
            KEY: '$ENV:MY_VAR',
          },
        },
      });

      const issues = envVarExpansionCheck.run(context);

      const warnings = issues.filter((i) => i.code === 'ENV_VAR_UNSUPPORTED_SYNTAX');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('PowerShell-style');
    });

    it('should detect multiple unsupported syntax patterns in same config', () => {
      const context = createContext({
        'test-server': {
          command: 'node',
          env: {
            KEY1: '$SHELL_VAR',
            KEY2: '%CMD_VAR%',
            KEY3: '$env:PS_VAR',
          },
        },
      });

      const issues = envVarExpansionCheck.run(context);

      const warnings = issues.filter((i) => i.code === 'ENV_VAR_UNSUPPORTED_SYNTAX');
      expect(warnings).toHaveLength(3);
      expect(warnings.some((w) => w.message.includes('shell-style'))).toBe(true);
      expect(warnings.some((w) => w.message.includes('Windows CMD-style'))).toBe(true);
      expect(warnings.some((w) => w.message.includes('PowerShell-style'))).toBe(true);
    });

    it('should detect unsupported syntax in all expandable fields', () => {
      const context = createContext({
        'test-server': {
          command: '$CMD_PATH',
          args: ['--config', '%CONFIG_PATH%'],
          url: '$env:API_URL',
          headers: {
            Authorization: 'Bearer $TOKEN',
          },
        },
      });

      const issues = envVarExpansionCheck.run(context);

      const warnings = issues.filter((i) => i.code === 'ENV_VAR_UNSUPPORTED_SYNTAX');
      expect(warnings).toHaveLength(4);
      expect(warnings.some((w) => w.details?.includes('command'))).toBe(true);
      expect(warnings.some((w) => w.details?.includes('args'))).toBe(true);
      expect(warnings.some((w) => w.details?.includes('url'))).toBe(true);
      expect(warnings.some((w) => w.details?.includes('headers.Authorization'))).toBe(true);
    });

    it('should warn about ${env:VAR} syntax (Copilot-specific)', () => {
      const context = createContext({
        'test-server': {
          command: 'node',
          args: ['--home', '${env:USERPROFILE}'],
        },
      });

      const issues = envVarExpansionCheck.run(context);

      const warnings = issues.filter((i) => i.code === 'ENV_VAR_UNSUPPORTED_SYNTAX');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('Copilot-specific');
      expect(warnings[0].message).toContain('${env:USERPROFILE}');
      expect(warnings[0].details).toContain('GitHub Copilot');
      expect(warnings[0].details).toContain('${USERPROFILE}');
    });

    it('should NOT misparse ${env:VAR} as ${env}', () => {
      const context = createContext({
        'test-server': {
          command: 'node',
          env: {
            HOME: '${env:USERPROFILE}',
          },
        },
      });

      const issues = envVarExpansionCheck.run(context);

      // Should NOT have a warning about missing "env" variable
      const missingEnvWarnings = issues.filter(
        (i) => i.code === 'ENV_VAR_EXPANSION_MISSING' && i.message.includes('env'),
      );
      expect(missingEnvWarnings).toHaveLength(0);
    });

    it('should NOT flag ${VAR} as unsupported (it is the correct syntax)', () => {
      const context = createContext({
        'test-server': {
          command: 'node',
          env: {
            KEY: '${MY_VAR}',
          },
        },
      });

      const issues = envVarExpansionCheck.run(context);

      const unsupportedWarnings = issues.filter((i) => i.code === 'ENV_VAR_UNSUPPORTED_SYNTAX');
      expect(unsupportedWarnings).toHaveLength(0);
    });

    it('should handle complex default values with special characters', () => {
      delete process.env.API_URL;

      const context = createContext({
        'test-server': {
          type: 'http',
          url: '${API_URL:-https://api.example.com/mcp}',
        },
      });

      const issues = envVarExpansionCheck.run(context);

      // Should not warn because there's a default
      const warnings = issues.filter((i) => i.severity === 'warning');
      expect(warnings).toHaveLength(0);

      // Should have info about the default being used
      const infos = issues.filter((i) => i.severity === 'info');
      expect(infos).toHaveLength(1);
    });
  });
});
