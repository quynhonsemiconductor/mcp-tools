import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import type { QnscMcpConfigContext } from '../../types';
import { bundledMcpEnvVarValidation, bundledMcpReferenceValidation } from './bundled-mcps';

describe('bundledMcpReferenceValidation', () => {
  const createContext = (tools: Record<string, any> = {}): QnscMcpConfigContext => ({
    type: 'qnsc-mcp-config',
    config: { tools },
    filePath: '/test/.qnscmcp.yaml',
  });

  let existsSyncSpy: ReturnType<typeof spyOn>;
  let readdirSyncSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    mock.restore();
    existsSyncSpy = spyOn(fs, 'existsSync');
    readdirSyncSpy = spyOn(fs, 'readdirSync');
  });

  afterEach(() => {
    mock.restore();
  });

  it('should return no issues when includeMCPs is empty', () => {
    const context = createContext({ includeMCPs: [] });
    const issues = bundledMcpReferenceValidation.run(context);
    expect(issues).toHaveLength(0);
  });

  it('should return no issues when tools config is missing', () => {
    const context = createContext({});
    const issues = bundledMcpReferenceValidation.run(context);
    expect(issues).toHaveLength(0);
  });

  it('should warn about unknown bundled MCPs', () => {
    existsSyncSpy.mockImplementation((p: string) => {
      if (p.includes('bundled') && !p.includes('metadata.json')) return true;
      if (p.includes('metadata.json')) return false;
      return false;
    });
    readdirSyncSpy.mockReturnValue([
      { name: 'figma', isDirectory: () => true },
      { name: 'confluence', isDirectory: () => true },
    ] as any);

    const context = createContext({
      includeMCPs: ['unknown-mcp'],
    });

    const issues = bundledMcpReferenceValidation.run(context);

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('UNKNOWN_BUNDLED_MCP');
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].message).toContain('unknown-mcp');
    expect(issues[0].details).toContain('figma');
  });

  it('should warn about missing metadata.json for known MCPs', () => {
    existsSyncSpy.mockImplementation((p: string) => {
      if (p.includes('bundled') && !p.includes('metadata.json')) return true;
      if (p.includes('metadata.json')) return false;
      return false;
    });
    readdirSyncSpy.mockReturnValue([{ name: 'figma', isDirectory: () => true }] as any);

    const context = createContext({
      includeMCPs: ['figma'],
    });

    const issues = bundledMcpReferenceValidation.run(context);

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('BUNDLED_MCP_MISSING_METADATA');
    expect(issues[0].message).toContain('figma');
  });

  it('should return no issues for valid MCPs with metadata', () => {
    existsSyncSpy.mockReturnValue(true);
    readdirSyncSpy.mockReturnValue([
      { name: 'figma', isDirectory: () => true },
      { name: 'confluence', isDirectory: () => true },
    ] as any);

    const context = createContext({
      includeMCPs: ['figma', 'confluence'],
    });

    const issues = bundledMcpReferenceValidation.run(context);

    expect(issues).toHaveLength(0);
  });

  it('should handle non-existent bundled directory gracefully', () => {
    existsSyncSpy.mockReturnValue(false);

    const context = createContext({
      includeMCPs: ['figma'],
    });

    const issues = bundledMcpReferenceValidation.run(context);

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('UNKNOWN_BUNDLED_MCP');
    expect(issues[0].details).toContain('(none installed)');
  });

  it('should handle read errors gracefully', () => {
    existsSyncSpy.mockReturnValue(true);
    readdirSyncSpy.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const context = createContext({
      includeMCPs: ['figma'],
    });

    // Should not throw, should return empty issues
    const issues = bundledMcpReferenceValidation.run(context);
    expect(issues).toHaveLength(0);
  });
});

describe('bundledMcpEnvVarValidation', () => {
  const createContext = (tools: Record<string, any> = {}): QnscMcpConfigContext => ({
    type: 'qnsc-mcp-config',
    config: { tools },
    filePath: '/test/.qnscmcp.yaml',
  });

  let existsSyncSpy: ReturnType<typeof spyOn>;
  let readFileSyncSpy: ReturnType<typeof spyOn>;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mock.restore();
    existsSyncSpy = spyOn(fs, 'existsSync');
    readFileSyncSpy = spyOn(fs, 'readFileSync');
    // Reset environment
    Object.keys(process.env).forEach((key) => {
      if (key !== 'PATH' && key !== 'HOME') {
        delete process.env[key];
      }
    });
  });

  afterEach(() => {
    mock.restore();
    // Restore original environment
    Object.assign(process.env, originalEnv);
  });

  it('should return no issues when includeMCPs is empty', () => {
    const context = createContext({ includeMCPs: [] });
    const issues = bundledMcpEnvVarValidation.run(context);
    expect(issues).toHaveLength(0);
  });

  it('should warn about missing required env vars', () => {
    existsSyncSpy.mockReturnValue(true);
    readFileSyncSpy.mockReturnValue(
      JSON.stringify({
        name: 'figma',
        envVars: [{ name: 'FIGMA_TOKEN', required: true, description: 'Figma API token' }],
      }),
    );

    const context = createContext({
      includeMCPs: ['figma'],
    });

    const issues = bundledMcpEnvVarValidation.run(context);

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('BUNDLED_MCP_MISSING_ENV_VAR');
    expect(issues[0].message).toContain('FIGMA_TOKEN');
    expect(issues[0].message).toContain('figma');
  });

  it('should NOT warn when required env var is set', () => {
    process.env.FIGMA_TOKEN = 'real-token-value';

    existsSyncSpy.mockReturnValue(true);
    readFileSyncSpy.mockReturnValue(
      JSON.stringify({
        name: 'figma',
        envVars: [{ name: 'FIGMA_TOKEN', required: true }],
      }),
    );

    const context = createContext({
      includeMCPs: ['figma'],
    });

    const issues = bundledMcpEnvVarValidation.run(context);

    expect(issues).toHaveLength(0);
  });

  it('should warn when env var has placeholder value', () => {
    process.env.FIGMA_TOKEN = 'your-token-here';

    existsSyncSpy.mockReturnValue(true);
    readFileSyncSpy.mockReturnValue(
      JSON.stringify({
        name: 'figma',
        envVars: [{ name: 'FIGMA_TOKEN', required: true }],
      }),
    );

    const context = createContext({
      includeMCPs: ['figma'],
    });

    const issues = bundledMcpEnvVarValidation.run(context);

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('BUNDLED_MCP_MISSING_ENV_VAR');
  });

  it('should skip optional env vars', () => {
    existsSyncSpy.mockReturnValue(true);
    readFileSyncSpy.mockReturnValue(
      JSON.stringify({
        name: 'figma',
        envVars: [{ name: 'FIGMA_DEBUG', required: false }],
      }),
    );

    const context = createContext({
      includeMCPs: ['figma'],
    });

    const issues = bundledMcpEnvVarValidation.run(context);

    expect(issues).toHaveLength(0);
  });

  it('should handle invalid JSON in metadata', () => {
    existsSyncSpy.mockReturnValue(true);
    readFileSyncSpy.mockReturnValue('{ invalid json }');

    const context = createContext({
      includeMCPs: ['figma'],
    });

    const issues = bundledMcpEnvVarValidation.run(context);

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('INVALID_METADATA_JSON');
  });

  it('should handle metadata without envVars field', () => {
    existsSyncSpy.mockReturnValue(true);
    readFileSyncSpy.mockReturnValue(
      JSON.stringify({
        name: 'figma',
        // No envVars field
      }),
    );

    const context = createContext({
      includeMCPs: ['figma'],
    });

    const issues = bundledMcpEnvVarValidation.run(context);

    expect(issues).toHaveLength(0);
  });

  it('should skip MCPs without metadata file', () => {
    existsSyncSpy.mockReturnValue(false);

    const context = createContext({
      includeMCPs: ['figma'],
    });

    const issues = bundledMcpEnvVarValidation.run(context);

    expect(issues).toHaveLength(0);
  });

  it('should check multiple MCPs independently', () => {
    existsSyncSpy.mockReturnValue(true);
    readFileSyncSpy.mockImplementation((p: string) => {
      if (p.includes('figma')) {
        return JSON.stringify({
          name: 'figma',
          envVars: [{ name: 'FIGMA_TOKEN', required: true }],
        });
      }
      if (p.includes('confluence')) {
        return JSON.stringify({
          name: 'confluence',
          envVars: [{ name: 'CONFLUENCE_TOKEN', required: true }],
        });
      }
      return '{}';
    });

    const context = createContext({
      includeMCPs: ['figma', 'confluence'],
    });

    const issues = bundledMcpEnvVarValidation.run(context);

    expect(issues).toHaveLength(2);
    expect(issues.some((i) => i.message.includes('FIGMA_TOKEN'))).toBe(true);
    expect(issues.some((i) => i.message.includes('CONFLUENCE_TOKEN'))).toBe(true);
  });

  it('should provide actionable details explaining why env vars are needed', () => {
    existsSyncSpy.mockReturnValue(true);
    readFileSyncSpy.mockReturnValue(
      JSON.stringify({
        name: 'figma',
        envVars: [
          { name: 'FIGMA_TOKEN', required: true, description: 'Your Figma API access token' },
        ],
      }),
    );

    const context: QnscMcpConfigContext = {
      type: 'qnsc-mcp-config',
      config: {
        source: '/home/user/.qnscmcp.yaml',
        tools: {
          includeMCPs: ['figma'],
        },
      },
      filePath: '/test/.qnscmcp.yaml',
    };

    const issues = bundledMcpEnvVarValidation.run(context);

    expect(issues).toHaveLength(1);
    // Should explain that the MCP is enabled in their config
    expect(issues[0].details).toContain('includeMCPs');
    expect(issues[0].details).toContain('figma');
    // Should provide the option to remove the MCP if not needed
    expect(issues[0].details).toContain('remove');
  });

  it('should group all missing env vars into a single issue per MCP', () => {
    existsSyncSpy.mockReturnValue(true);
    readFileSyncSpy.mockReturnValue(
      JSON.stringify({
        name: 'figma',
        envVars: [
          { name: 'FIGMA_TOKEN', required: true },
          { name: 'FIGMA_TEAM_ID', required: true },
          { name: 'FIGMA_PROJECT_ID', required: true },
        ],
      }),
    );

    const context = createContext({
      includeMCPs: ['figma'],
    });

    const issues = bundledMcpEnvVarValidation.run(context);

    // Should have a single issue that lists all missing env vars
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('FIGMA_TOKEN');
    expect(issues[0].message).toContain('FIGMA_TEAM_ID');
    expect(issues[0].message).toContain('FIGMA_PROJECT_ID');
  });
});
