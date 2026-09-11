import { describe, expect, it } from 'bun:test';
import type { McpConfigContext } from '../../types';
import { duplicateExecutableCheck } from './duplicate-executables';

describe('duplicateExecutableCheck', () => {
  const createContext = (servers: Record<string, any>): McpConfigContext => ({
    type: 'mcp-config',
    config: { servers },
    filePath: '/test/mcp.json',
    format: 'servers',
  });

  it('should detect duplicate executables with same command and args', () => {
    const context = createContext({
      server1: {
        command: '/usr/bin/node',
        args: ['server.js'],
      },
      server2: {
        command: '/usr/bin/node',
        args: ['server.js'],
      },
    });

    const issues = duplicateExecutableCheck.run(context);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('DUPLICATE_EXECUTABLE');
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].details).toContain('server1');
    expect(issues[0].details).toContain('server2');
  });

  it('should NOT detect duplicates when args differ', () => {
    const context = createContext({
      server1: {
        command: '/usr/bin/node',
        args: ['server1.js'],
      },
      server2: {
        command: '/usr/bin/node',
        args: ['server2.js'],
      },
    });

    const issues = duplicateExecutableCheck.run(context);
    expect(issues).toHaveLength(0);
  });

  it('should normalize command paths for comparison', () => {
    const context = createContext({
      server1: {
        command: '/usr/bin/node',
        args: ['server.js'],
      },
      server2: {
        command: '/usr/local/bin/node',
        args: ['server.js'],
      },
      server3: {
        command: 'node',
        args: ['server.js'],
      },
    });

    const issues = duplicateExecutableCheck.run(context);
    expect(issues).toHaveLength(1);
    expect(issues[0].details).toContain('server1');
    expect(issues[0].details).toContain('server2');
    expect(issues[0].details).toContain('server3');
  });

  it('should handle Windows executables with .exe extension', () => {
    const context = createContext({
      server1: {
        command: 'node.exe',
        args: ['server.js', 'arg1'],
      },
      server2: {
        command: 'Node.EXE', // Different casing
        args: ['server.js', 'arg1'],
      },
    });

    const issues = duplicateExecutableCheck.run(context);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('node.exe');
  });

  it('should consider first two args for uniqueness', () => {
    const context = createContext({
      server1: {
        command: 'node',
        args: ['server.js', 'arg1'],
      },
      server2: {
        command: 'node',
        args: ['server.js', 'arg2'],
      },
    });

    // Different second arg, should NOT be considered duplicates
    const issues = duplicateExecutableCheck.run(context);
    expect(issues).toHaveLength(0);
  });

  it('should detect duplicates with identical first two args', () => {
    const context = createContext({
      server1: {
        command: 'node',
        args: ['server.js', 'arg1', 'differentArg'],
      },
      server2: {
        command: 'node',
        args: ['server.js', 'arg1', 'anotherDifferentArg'],
      },
    });

    // Same first two args, should be considered duplicates
    const issues = duplicateExecutableCheck.run(context);
    expect(issues).toHaveLength(1);
  });

  it('should NOT flag servers without args', () => {
    const context = createContext({
      server1: {
        command: 'node',
      },
      server2: {
        command: 'python',
      },
    });

    const issues = duplicateExecutableCheck.run(context);
    expect(issues).toHaveLength(0);
  });

  it('should handle servers without command', () => {
    const context = createContext({
      server1: {
        args: ['server.js'],
      },
      server2: {
        args: ['other.js'],
      },
    });

    const issues = duplicateExecutableCheck.run(context);
    expect(issues).toHaveLength(0);
  });

  it('should handle mixed servers with and without args', () => {
    const context = createContext({
      server1: {
        command: 'node',
        args: ['server.js'],
      },
      server2: {
        command: 'node',
        args: ['server.js'],
      },
      server3: {
        command: 'node',
      },
    });

    // server1 and server2 are duplicates (same command + first arg)
    // server3 is different (no args)
    const issues = duplicateExecutableCheck.run(context);
    expect(issues).toHaveLength(1);
    expect(issues[0].details).toContain('server1');
    expect(issues[0].details).toContain('server2');
    expect(issues[0].details).not.toContain('server3');
  });

  it('should handle three or more duplicates', () => {
    const context = createContext({
      server1: {
        command: '/usr/bin/node',
        args: ['index.js'],
      },
      server2: {
        command: 'node',
        args: ['index.js'],
      },
      server3: {
        command: '/usr/local/bin/node',
        args: ['index.js'],
      },
    });

    const issues = duplicateExecutableCheck.run(context);
    expect(issues).toHaveLength(1);
    expect(issues[0].details).toContain('server1');
    expect(issues[0].details).toContain('server2');
    expect(issues[0].details).toContain('server3');
  });

  it('should show all unique command paths in message', () => {
    const context = createContext({
      server1: {
        command: '/usr/bin/node',
        args: ['server.js'],
      },
      server2: {
        command: '/usr/local/bin/node',
        args: ['server.js'],
      },
    });

    const issues = duplicateExecutableCheck.run(context);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('/usr/bin/node');
    expect(issues[0].message).toContain('/usr/local/bin/node');
  });

  it('should handle shell scripts', () => {
    const context = createContext({
      server1: {
        command: '/path/to/script.sh',
        args: [],
      },
      server2: {
        command: '/other/path/script.sh',
        args: [],
      },
    });

    const issues = duplicateExecutableCheck.run(context);
    expect(issues).toHaveLength(1);
  });

  it('should handle case-insensitive matching', () => {
    const context = createContext({
      server1: {
        command: 'Node.exe',
        args: ['server.js'],
      },
      server2: {
        command: 'NODE.EXE',
        args: ['server.js'],
      },
    });

    const issues = duplicateExecutableCheck.run(context);
    expect(issues).toHaveLength(1);
  });

  it('should work with mcpServers format', () => {
    const context: McpConfigContext = {
      type: 'mcp-config',
      config: {
        mcpServers: {
          server1: {
            command: 'node',
            args: ['server.js'],
          },
          server2: {
            command: 'node',
            args: ['server.js'],
          },
        },
      },
      filePath: '/test/config.json',
      format: 'mcpServers',
    };

    const issues = duplicateExecutableCheck.run(context);
    expect(issues).toHaveLength(1);
  });
});
