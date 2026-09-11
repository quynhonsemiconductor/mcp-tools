import { describe, expect, it } from 'bun:test';
import type { McpConfigContext } from '../../types';
import { hardcodedSecretsCheck } from './hardcoded-secrets';

describe('hardcodedSecretsCheck', () => {
  const createContext = (
    servers: Record<string, any>,
    format: 'servers' | 'mcpServers' = 'servers',
  ): McpConfigContext => ({
    type: 'mcp-config',
    config: format === 'servers' ? { servers } : { mcpServers: servers },
    filePath: '/test/mcp.json',
    format,
  });

  it('should detect OpenAI-style API keys', () => {
    const context = createContext({
      'test-server': {
        command: 'node',
        env: {
          ANTHROPIC_API_KEY: 'sk-ant-1234567890abcdefghij',
        },
      },
    });

    const issues = hardcodedSecretsCheck.run(context);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('HARDCODED_SECRET');
    expect(issues[0].message).toContain('ANTHROPIC_API_KEY');
  });

  it('should detect hex-based API keys', () => {
    const context = createContext({
      'test-server': {
        command: 'node',
        env: {
          API_KEY: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
        },
      },
    });

    const issues = hardcodedSecretsCheck.run(context);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('HARDCODED_SECRET');
  });

  it('should detect Base64-encoded secrets', () => {
    const context = createContext({
      'test-server': {
        command: 'node',
        env: {
          SECRET: 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY3ODkwYWJjZGVmZ2hpag==',
        },
      },
    });

    const issues = hardcodedSecretsCheck.run(context);
    expect(issues).toHaveLength(1);
  });

  it('should detect GitHub personal access tokens', () => {
    const context = createContext({
      'test-server': {
        command: 'node',
        env: {
          GITHUB_TOKEN: 'ghp_1234567890abcdefghijklmnopqrstuv12',
        },
      },
    });

    const issues = hardcodedSecretsCheck.run(context);
    expect(issues).toHaveLength(1);
  });

  it('should detect JWT tokens', () => {
    const context = createContext({
      'test-server': {
        command: 'node',
        env: {
          AUTH_TOKEN:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
        },
      },
    });

    const issues = hardcodedSecretsCheck.run(context);
    expect(issues).toHaveLength(1);
  });

  it('should detect Anthropic API keys', () => {
    const context = createContext({
      'test-server': {
        command: 'node',
        env: {
          ANTHROPIC_API_KEY:
            'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmno',
        },
      },
    });

    const issues = hardcodedSecretsCheck.run(context);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('ANTHROPIC_API_KEY');
  });

  it('should detect Vercel tokens', () => {
    const context = createContext({
      'test-server': {
        command: 'node',
        env: {
          VERCEL_TOKEN:
            'abcdefghijklmnopqrstuvwx_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz01234567',
        },
      },
    });

    const issues = hardcodedSecretsCheck.run(context);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('VERCEL_TOKEN');
  });

  it('should detect Cloudflare API tokens', () => {
    const context = createContext({
      'test-server': {
        command: 'node',
        env: {
          CLOUDFLARE_API_TOKEN: 'cf_abcdefghijklmnopqrstuvwxyz0123456789abc',
        },
      },
    });

    const issues = hardcodedSecretsCheck.run(context);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('CLOUDFLARE_API_TOKEN');
  });

  it('should detect AWS access key IDs', () => {
    const context = createContext({
      'test-server': {
        command: 'node',
        env: {
          AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE', // Matches AKIA[0-9A-Z]{16} pattern
        },
      },
    });

    const issues = hardcodedSecretsCheck.run(context);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('AWS_ACCESS_KEY_ID');
  });

  it('should detect long suspicious strings for sensitive env names', () => {
    const context = createContext({
      'test-server': {
        command: 'node',
        env: {
          API_SECRET: 'this-is-my-super-secret-key-value',
        },
      },
    });

    const issues = hardcodedSecretsCheck.run(context);
    expect(issues).toHaveLength(1);
  });

  it('should NOT flag environment variable references', () => {
    const context = createContext({
      'test-server': {
        command: 'node',
        env: {
          ANTHROPIC_API_KEY: '$ANTHROPIC_API_KEY',
          OTHER_KEY: '${OTHER_KEY}',
        },
      },
    });

    const issues = hardcodedSecretsCheck.run(context);
    expect(issues).toHaveLength(0);
  });

  it('should NOT flag boolean values', () => {
    const context = createContext({
      'test-server': {
        command: 'node',
        env: {
          SECRET_ENABLED: 'true',
          PASSWORD_REQUIRED: 'false',
        },
      },
    });

    const issues = hardcodedSecretsCheck.run(context);
    expect(issues).toHaveLength(0);
  });

  it('should NOT flag numeric values', () => {
    const context = createContext({
      'test-server': {
        command: 'node',
        env: {
          TOKEN_EXPIRY: '3600',
        },
      },
    });

    const issues = hardcodedSecretsCheck.run(context);
    expect(issues).toHaveLength(0);
  });

  it('should NOT flag file paths', () => {
    const context = createContext({
      'test-server': {
        command: 'node',
        env: {
          PRIVATE_KEY_PATH: '/home/user/.ssh/id_rsa',
          SECRET_FILE: 'C:\\Users\\user\\secrets.txt',
        },
      },
    });

    const issues = hardcodedSecretsCheck.run(context);
    expect(issues).toHaveLength(0);
  });

  it('should NOT flag URLs', () => {
    const context = createContext({
      'test-server': {
        command: 'node',
        env: {
          API_KEY_URL: 'https://example.com/api/key',
          SECRET_ENDPOINT: 'http://localhost:3000/secret',
        },
      },
    });

    const issues = hardcodedSecretsCheck.run(context);
    expect(issues).toHaveLength(0);
  });

  it('should NOT flag short strings even for sensitive names', () => {
    const context = createContext({
      'test-server': {
        command: 'node',
        env: {
          API_KEY: 'test',
          PASSWORD: 'dev',
        },
      },
    });

    const issues = hardcodedSecretsCheck.run(context);
    expect(issues).toHaveLength(0);
  });

  it('should NOT flag non-sensitive environment variables', () => {
    const context = createContext({
      'test-server': {
        command: 'node',
        env: {
          NODE_ENV: 'production',
          DEBUG: 'true',
          PORT: '3000',
        },
      },
    });

    const issues = hardcodedSecretsCheck.run(context);
    expect(issues).toHaveLength(0);
  });

  it('should handle servers without env variables', () => {
    const context = createContext({
      'test-server': {
        command: 'node',
      },
    });

    const issues = hardcodedSecretsCheck.run(context);
    expect(issues).toHaveLength(0);
  });

  it('should include server name in issues', () => {
    const context = createContext({
      'my-server': {
        command: 'node',
        env: {
          API_KEY: 'sk-ant-1234567890abcdefghij',
        },
      },
    });

    const issues = hardcodedSecretsCheck.run(context);
    expect(issues[0].serverName).toBe('my-server');
  });

  it('should detect multiple secrets in same server', () => {
    const context = createContext({
      'test-server': {
        command: 'node',
        env: {
          ANTHROPIC_API_KEY: 'sk-ant-1234567890abcdefghij',
          OPENAI_API_KEY: 'sk-proj-1234567890abcdefghij',
        },
      },
    });

    const issues = hardcodedSecretsCheck.run(context);
    expect(issues).toHaveLength(2);
  });

  it('should detect secrets across multiple servers', () => {
    const context = createContext({
      server1: {
        command: 'node',
        env: {
          API_KEY: 'sk-ant-1234567890abcdefghij',
        },
      },
      server2: {
        command: 'python',
        env: {
          SECRET_TOKEN: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
        },
      },
    });

    const issues = hardcodedSecretsCheck.run(context);
    expect(issues).toHaveLength(2);
    expect(issues[0].serverName).toBe('server1');
    expect(issues[1].serverName).toBe('server2');
  });

  describe('Claude-related config exceptions', () => {
    it('should NOT flag ANTHROPIC_API_KEY for claude server in Claude Desktop config', () => {
      const context: McpConfigContext = {
        type: 'mcp-config',
        config: {
          mcpServers: {
            claude: {
              command: 'node',
              env: {
                ANTHROPIC_API_KEY: 'sk-ant-1234567890abcdefghij',
              },
            },
          },
        },
        filePath: '/Users/test/Library/Application Support/Claude/claude_desktop_config.json',
        format: 'mcpServers',
      };

      const issues = hardcodedSecretsCheck.run(context);
      expect(issues).toHaveLength(0);
    });

    it('should NOT flag ANTHROPIC_API_KEY in VS Code Claude extension config', () => {
      const context: McpConfigContext = {
        type: 'mcp-config',
        config: {
          servers: {
            'my-server': {
              command: 'node',
              env: {
                ANTHROPIC_API_KEY: 'sk-ant-1234567890abcdefghij',
              },
            },
          },
        },
        filePath:
          '/Users/test/Library/Application Support/Code/User/globalStorage/anthropics.claude-code/settings/cline_mcp_settings.json',
        format: 'servers',
      };

      const issues = hardcodedSecretsCheck.run(context);
      expect(issues).toHaveLength(0);
    });

    it('should flag ANTHROPIC_API_KEY in non-Claude config files', () => {
      const context: McpConfigContext = {
        type: 'mcp-config',
        config: {
          servers: {
            'my-server': {
              command: 'node',
              env: {
                ANTHROPIC_API_KEY: 'sk-ant-1234567890abcdefghij',
              },
            },
          },
        },
        filePath: '/Users/test/.config/cline/mcp.json',
        format: 'servers',
      };

      const issues = hardcodedSecretsCheck.run(context);
      expect(issues).toHaveLength(1);
    });

    it('should flag other API keys even in Claude Desktop config', () => {
      const context: McpConfigContext = {
        type: 'mcp-config',
        config: {
          mcpServers: {
            claude: {
              command: 'node',
              env: {
                ANTHROPIC_API_KEY: 'sk-ant-1234567890abcdefghij',
                OPENAI_API_KEY: 'sk-proj-1234567890abcdefghij',
              },
            },
          },
        },
        filePath: '/Users/test/Library/Application Support/Claude/claude_desktop_config.json',
        format: 'mcpServers',
      };

      const issues = hardcodedSecretsCheck.run(context);
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain('OPENAI_API_KEY');
    });
  });
});
