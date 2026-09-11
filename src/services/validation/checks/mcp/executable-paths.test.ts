import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import type { McpConfigContext } from '../../types';
import { executablePathValidation, argFilePathValidation } from './executable-paths';

describe('executablePathValidation', () => {
  let existsSyncSpy: ReturnType<typeof spyOn>;
  let accessSyncSpy: ReturnType<typeof spyOn>;
  let platformSpy: ReturnType<typeof spyOn>;

  const createContext = (
    servers: Record<string, any>,
    format: 'servers' | 'mcpServers' = 'servers',
    filePath: string = '/test/mcp.json',
  ): McpConfigContext => ({
    type: 'mcp-config',
    config: format === 'servers' ? { servers } : { mcpServers: servers },
    filePath,
    format,
  });

  beforeEach(() => {
    mock.restore();
    existsSyncSpy = spyOn(fs, 'existsSync');
    accessSyncSpy = spyOn(fs, 'accessSync');
    platformSpy = spyOn(os, 'platform');
  });

  afterEach(() => {
    mock.restore();
  });

  describe('absolute path validation', () => {
    it('should NOT check relative paths or commands relying on PATH', () => {
      existsSyncSpy.mockReturnValue(false);
      platformSpy.mockReturnValue('darwin');

      const context = createContext({
        server1: { command: 'node' },
        server2: { command: 'python' },
        server3: { command: './local-script.sh' },
      });

      const issues = executablePathValidation.run(context);
      // No issues should be reported for non-absolute paths
      expect(issues).toHaveLength(0);
    });

    it('should warn when absolute path executable does not exist', () => {
      existsSyncSpy.mockReturnValue(false);
      platformSpy.mockReturnValue('darwin');

      const context = createContext({
        'test-server': {
          command: '/usr/local/bin/nonexistent',
        },
      });

      const issues = executablePathValidation.run(context);
      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('EXECUTABLE_NOT_FOUND');
      expect(issues[0].message).toContain('/usr/local/bin/nonexistent');
      expect(issues[0].serverName).toBe('test-server');
    });

    it('should NOT warn when absolute path executable exists', () => {
      existsSyncSpy.mockReturnValue(true);
      accessSyncSpy.mockImplementation(() => {});
      platformSpy.mockReturnValue('darwin');

      const context = createContext({
        'test-server': {
          command: '/usr/local/bin/node',
        },
      });

      const issues = executablePathValidation.run(context);
      expect(issues).toHaveLength(0);
    });
  });

  describe('execute permission validation (Unix)', () => {
    it('should warn when file exists but lacks execute permission', () => {
      existsSyncSpy.mockReturnValue(true);
      accessSyncSpy.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });
      platformSpy.mockReturnValue('darwin');

      const context = createContext({
        'test-server': {
          command: '/usr/local/bin/script.sh',
        },
      });

      const issues = executablePathValidation.run(context);
      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('EXECUTABLE_NOT_EXECUTABLE');
      expect(issues[0].details).toContain('chmod +x');
    });

    it('should NOT check execute permissions on Windows', () => {
      existsSyncSpy.mockReturnValue(true);
      platformSpy.mockReturnValue('win32');

      const context = createContext({
        'test-server': {
          command: 'C:\\Program Files\\node\\node.exe',
        },
      });

      const issues = executablePathValidation.run(context);
      // No permission issues should be reported on Windows
      expect(issues).toHaveLength(0);
    });

    it('should NOT warn when file has execute permission', () => {
      existsSyncSpy.mockReturnValue(true);
      accessSyncSpy.mockImplementation(() => {}); // No throw = permission OK
      platformSpy.mockReturnValue('linux');

      const context = createContext({
        'test-server': {
          command: '/usr/bin/python3',
        },
      });

      const issues = executablePathValidation.run(context);
      expect(issues).toHaveLength(0);
    });
  });

  describe('multiple servers', () => {
    it('should check all servers with absolute paths', () => {
      existsSyncSpy.mockReturnValue(false);
      platformSpy.mockReturnValue('darwin');

      const context = createContext({
        server1: { command: '/path/to/exe1' },
        server2: { command: '/path/to/exe2' },
        server3: { command: 'node' }, // Should be skipped
      });

      const issues = executablePathValidation.run(context);
      expect(issues).toHaveLength(2);
      expect(issues[0].serverName).toBe('server1');
      expect(issues[1].serverName).toBe('server2');
    });
  });

  describe('mcpServers format', () => {
    it('should work with mcpServers format', () => {
      existsSyncSpy.mockReturnValue(false);
      platformSpy.mockReturnValue('darwin');

      const context = createContext(
        {
          'test-server': {
            command: '/usr/local/bin/missing',
          },
        },
        'mcpServers',
      );

      const issues = executablePathValidation.run(context);
      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('EXECUTABLE_NOT_FOUND');
    });
  });

  describe('edge cases', () => {
    it('should handle servers without command property', () => {
      platformSpy.mockReturnValue('darwin');

      const context = createContext({
        'test-server': {
          args: ['--help'],
        },
      });

      const issues = executablePathValidation.run(context);
      expect(issues).toHaveLength(0);
    });

    it('should handle empty servers object', () => {
      platformSpy.mockReturnValue('darwin');

      const context = createContext({});

      const issues = executablePathValidation.run(context);
      expect(issues).toHaveLength(0);
    });
  });
});

describe('argFilePathValidation', () => {
  let existsSyncSpy: ReturnType<typeof spyOn>;

  const createContext = (
    servers: Record<string, any>,
    format: 'servers' | 'mcpServers' = 'servers',
    filePath: string = '/test/config/mcp.json',
  ): McpConfigContext => ({
    type: 'mcp-config',
    config: format === 'servers' ? { servers } : { mcpServers: servers },
    filePath,
    format,
  });

  beforeEach(() => {
    mock.restore();
    existsSyncSpy = spyOn(fs, 'existsSync');
  });

  afterEach(() => {
    mock.restore();
  });

  describe('file path detection', () => {
    it('should warn when absolute file path in args does not exist', () => {
      existsSyncSpy.mockReturnValue(false);

      const context = createContext({
        'test-server': {
          command: 'node',
          args: ['/path/to/script.js'],
        },
      });

      const issues = argFilePathValidation.run(context);
      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('ARG_FILE_NOT_FOUND');
      expect(issues[0].message).toContain('/path/to/script.js');
      expect(issues[0].serverName).toBe('test-server');
    });

    it('should warn when relative file path in args does not exist', () => {
      existsSyncSpy.mockReturnValue(false);

      const context = createContext({
        'test-server': {
          command: 'node',
          args: ['./script.js'],
        },
      });

      const issues = argFilePathValidation.run(context);
      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('ARG_FILE_NOT_FOUND');
    });

    it('should NOT warn when file path exists', () => {
      existsSyncSpy.mockReturnValue(true);

      const context = createContext({
        'test-server': {
          command: 'node',
          args: ['/path/to/script.js'],
        },
      });

      const issues = argFilePathValidation.run(context);
      expect(issues).toHaveLength(0);
    });

    it('should detect Windows absolute paths', () => {
      existsSyncSpy.mockReturnValue(false);

      const context = createContext({
        'test-server': {
          command: 'node',
          args: ['C:\\Users\\test\\script.js'],
        },
      });

      const issues = argFilePathValidation.run(context);
      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('ARG_FILE_NOT_FOUND');
    });

    it('should detect paths with directory separators', () => {
      existsSyncSpy.mockReturnValue(false);

      const context = createContext({
        'test-server': {
          command: 'node',
          args: ['src/index.js'],
        },
      });

      const issues = argFilePathValidation.run(context);
      expect(issues).toHaveLength(1);
    });
  });

  describe('non-file arguments', () => {
    it('should NOT check flags (args starting with -)', () => {
      existsSyncSpy.mockReturnValue(false);

      const context = createContext({
        'test-server': {
          command: 'node',
          args: ['--version', '-v', '--config=/path/config.json'],
        },
      });

      const issues = argFilePathValidation.run(context);
      // --config=/path/config.json does not start with -, so it won't be skipped by the flag check
      // but it doesn't look like a file path (contains =), so it depends on implementation
      // Based on the code, flags starting with - are skipped
      expect(issues).toHaveLength(0);
    });

    it('should NOT check simple string arguments', () => {
      existsSyncSpy.mockReturnValue(false);

      const context = createContext({
        'test-server': {
          command: 'node',
          args: ['--mode', 'production', 'start'],
        },
      });

      const issues = argFilePathValidation.run(context);
      expect(issues).toHaveLength(0);
    });

    it('should NOT flag URLs', () => {
      existsSyncSpy.mockReturnValue(false);

      const context = createContext({
        'test-server': {
          command: 'curl',
          args: ['https://example.com/api', 'http://localhost:3000'],
        },
      });

      const issues = argFilePathValidation.run(context);
      expect(issues).toHaveLength(0);
    });
  });

  describe('relative path resolution', () => {
    it('should check relative paths starting with ./', () => {
      // When existsSync returns false, should report the file as missing
      existsSyncSpy.mockReturnValue(false);

      const context = createContext({
        'test-server': {
          command: 'node',
          args: ['./script.js'],
        },
      });

      const issues = argFilePathValidation.run(context);
      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('ARG_FILE_NOT_FOUND');
    });

    it('should NOT warn when relative path file exists', () => {
      // When existsSync returns true, should not report any issues
      existsSyncSpy.mockReturnValue(true);

      const context = createContext({
        'test-server': {
          command: 'node',
          args: ['./script.js'],
        },
      });

      const issues = argFilePathValidation.run(context);
      expect(issues).toHaveLength(0);
    });

    it('should check parent directory paths', () => {
      existsSyncSpy.mockReturnValue(false);

      const context = createContext({
        'test-server': {
          command: 'node',
          args: ['../shared/script.js'],
        },
      });

      const issues = argFilePathValidation.run(context);
      expect(issues).toHaveLength(1);
    });
  });

  describe('multiple args and servers', () => {
    it('should check multiple file paths in args', () => {
      existsSyncSpy.mockReturnValue(false);

      const context = createContext({
        'test-server': {
          command: 'node',
          args: ['./script1.js', './script2.js', '--flag'],
        },
      });

      const issues = argFilePathValidation.run(context);
      expect(issues).toHaveLength(2);
    });

    it('should check args across multiple servers', () => {
      existsSyncSpy.mockReturnValue(false);

      const context = createContext({
        server1: {
          command: 'node',
          args: ['./script1.js'],
        },
        server2: {
          command: 'python',
          args: ['./script2.py'],
        },
      });

      const issues = argFilePathValidation.run(context);
      expect(issues).toHaveLength(2);
      expect(issues[0].serverName).toBe('server1');
      expect(issues[1].serverName).toBe('server2');
    });
  });

  describe('container runtimes and package runners', () => {
    it('should NOT flag a docker image reference (mcp/sonarqube)', () => {
      // existsSync is forced false so any arg treated as a path WOULD warn;
      // a clean result proves the docker command is skipped.
      existsSyncSpy.mockReturnValue(false);

      const context = createContext({
        sonarqube: {
          command: 'docker',
          args: ['run', '-i', '--rm', '-e', 'SONARQUBE_TOKEN', 'mcp/sonarqube'],
        },
      });

      const issues = argFilePathValidation.run(context);
      expect(issues).toHaveLength(0);
    });

    it('should NOT flag a tagged, registry-qualified image', () => {
      existsSyncSpy.mockReturnValue(false);

      const context = createContext({
        sonarqube: {
          command: 'docker',
          args: ['run', '--rm', 'docker.io/mcp/sonarqube:latest'],
        },
      });

      const issues = argFilePathValidation.run(context);
      expect(issues).toHaveLength(0);
    });

    it('should NOT flag image references run via podman', () => {
      existsSyncSpy.mockReturnValue(false);

      const context = createContext({
        server: {
          command: 'podman',
          args: ['run', '--rm', 'ghcr.io/org/image:1.2.3'],
        },
      });

      const issues = argFilePathValidation.run(context);
      expect(issues).toHaveLength(0);
    });

    it('should NOT flag scoped npm packages run via npx', () => {
      existsSyncSpy.mockReturnValue(false);

      const context = createContext({
        'fs-server': {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem'],
        },
      });

      const issues = argFilePathValidation.run(context);
      expect(issues).toHaveLength(0);
    });

    it('should match the command by basename for absolute command paths', () => {
      existsSyncSpy.mockReturnValue(false);

      const context = createContext({
        sonarqube: {
          command: '/usr/local/bin/docker',
          args: ['run', '--rm', 'mcp/sonarqube'],
        },
      });

      const issues = argFilePathValidation.run(context);
      expect(issues).toHaveLength(0);
    });

    it('should STILL flag genuine missing paths for non-runtime commands', () => {
      existsSyncSpy.mockReturnValue(false);

      const context = createContext({
        'node-server': {
          command: 'node',
          args: ['dist/server/index.js'],
        },
      });

      const issues = argFilePathValidation.run(context);
      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('ARG_FILE_NOT_FOUND');
    });
  });

  describe('edge cases', () => {
    it('should handle servers without args', () => {
      const context = createContext({
        'test-server': {
          command: 'node',
        },
      });

      const issues = argFilePathValidation.run(context);
      expect(issues).toHaveLength(0);
    });

    it('should handle empty args array', () => {
      const context = createContext({
        'test-server': {
          command: 'node',
          args: [],
        },
      });

      const issues = argFilePathValidation.run(context);
      expect(issues).toHaveLength(0);
    });

    it('should handle non-array args gracefully', () => {
      const context = createContext({
        'test-server': {
          command: 'node',
          args: 'not-an-array' as any,
        },
      });

      const issues = argFilePathValidation.run(context);
      expect(issues).toHaveLength(0);
    });
  });
});
