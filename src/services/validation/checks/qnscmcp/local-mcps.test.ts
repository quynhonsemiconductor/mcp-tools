import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { QnscMcpConfigContext } from '../../types';
import { localMcpEnvVarValidation, localMcpReferenceValidation } from './local-mcps';

// Dynamically import the server data to handle cases where another test has mocked this module
// Note: Bun's mock.module can have global effects in certain test configurations
let VALID_LOCAL_MCP_IDS: string[] = [];
let FIRST_VALID_ID: string | undefined;
let SERVER_WITH_ENV_VARS: { id: string; name: string; requiredEnvVars?: string[] } | undefined;
let SERVER_WITHOUT_ENV_VARS: { id: string; name: string; requiredEnvVars?: string[] } | undefined;

try {
  // Import the real data, but be resilient if it's been mocked
  const localServers = await import('../../../../local-mcps/available-local-servers');
  VALID_LOCAL_MCP_IDS = localServers.getAvailableLocalMCPServerIds?.() || [];
  FIRST_VALID_ID = VALID_LOCAL_MCP_IDS[0];
  SERVER_WITH_ENV_VARS = localServers.AVAILABLE_LOCAL_MCP_SERVERS?.find(
    (s: any) => s.requiredEnvVars && s.requiredEnvVars.length > 0,
  );
  SERVER_WITHOUT_ENV_VARS = localServers.AVAILABLE_LOCAL_MCP_SERVERS?.find(
    (s: any) => !s.requiredEnvVars || s.requiredEnvVars.length === 0,
  );
} catch {
  // Module may be mocked in some test configurations - tests will skip server-dependent cases
}

describe('localMcpReferenceValidation', () => {
  const createContext = (tools: Record<string, any> = {}): QnscMcpConfigContext => ({
    type: 'qnsc-mcp-config',
    config: { tools },
    filePath: '/test/.qnscmcp.yaml',
  });

  it('should return no issues when includeLocalMCPs is empty', () => {
    const context = createContext({ includeLocalMCPs: [] });
    const issues = localMcpReferenceValidation.run(context);
    expect(issues).toHaveLength(0);
  });

  it('should return no issues when tools config is missing', () => {
    const context = createContext({});
    const issues = localMcpReferenceValidation.run(context);
    expect(issues).toHaveLength(0);
  });

  it('should warn about unknown local MCPs', () => {
    const context = createContext({
      includeLocalMCPs: ['definitely-unknown-local-mcp-xyz123'],
    });

    const issues = localMcpReferenceValidation.run(context);

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('UNKNOWN_LOCAL_MCP');
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].message).toContain('definitely-unknown-local-mcp-xyz123');
  });

  it('should return no issues for valid local MCP IDs', () => {
    if (!FIRST_VALID_ID) {
      // Skip if no local MCPs are defined
      return;
    }
    const context = createContext({
      includeLocalMCPs: [FIRST_VALID_ID],
    });

    const issues = localMcpReferenceValidation.run(context);

    expect(issues).toHaveLength(0);
  });

  it('should detect multiple invalid local MCP IDs', () => {
    const context = createContext({
      includeLocalMCPs: [
        'invalid-one-xyz',
        'invalid-two-xyz',
        ...(FIRST_VALID_ID ? [FIRST_VALID_ID] : []),
      ],
    });

    const issues = localMcpReferenceValidation.run(context);

    expect(issues).toHaveLength(2);
    expect(issues[0].message).toContain('invalid-one-xyz');
    expect(issues[1].message).toContain('invalid-two-xyz');
  });

  it('should include available server IDs in details', () => {
    const context = createContext({
      includeLocalMCPs: ['unknown-mcp-xyz'],
    });

    const issues = localMcpReferenceValidation.run(context);

    expect(issues).toHaveLength(1);
    expect(issues[0].details).toBeDefined();
  });
});

describe('localMcpEnvVarValidation', () => {
  const createContext = (tools: Record<string, any> = {}): QnscMcpConfigContext => ({
    type: 'qnsc-mcp-config',
    config: { tools },
    filePath: '/test/.qnscmcp.yaml',
  });

  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment variables relevant to tests
    if (SERVER_WITH_ENV_VARS?.requiredEnvVars) {
      for (const envVar of SERVER_WITH_ENV_VARS.requiredEnvVars) {
        delete process.env[envVar];
      }
    }
  });

  afterEach(() => {
    // Restore original environment
    Object.assign(process.env, originalEnv);
  });

  it('should return no issues when includeLocalMCPs is empty', () => {
    const context = createContext({ includeLocalMCPs: [] });
    const issues = localMcpEnvVarValidation.run(context);
    expect(issues).toHaveLength(0);
  });

  it('should return no issues when tools config is missing', () => {
    const context = createContext({});
    const issues = localMcpEnvVarValidation.run(context);
    expect(issues).toHaveLength(0);
  });

  it('should warn about missing required env vars for local MCPs', () => {
    if (!SERVER_WITH_ENV_VARS) {
      // Skip if no server with required env vars is defined
      return;
    }
    const context = createContext({
      includeLocalMCPs: [SERVER_WITH_ENV_VARS.id],
    });

    const issues = localMcpEnvVarValidation.run(context);

    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].code).toBe('LOCAL_MCP_MISSING_ENV_VAR');
    expect(issues[0].message).toContain(SERVER_WITH_ENV_VARS.requiredEnvVars![0]);
    expect(issues[0].message).toContain(SERVER_WITH_ENV_VARS.id);
  });

  it('should NOT warn when required env var is set', () => {
    if (!SERVER_WITH_ENV_VARS) {
      return;
    }
    // Set all required env vars
    for (const envVar of SERVER_WITH_ENV_VARS.requiredEnvVars!) {
      process.env[envVar] = '/some/real/path';
    }

    const context = createContext({
      includeLocalMCPs: [SERVER_WITH_ENV_VARS.id],
    });

    const issues = localMcpEnvVarValidation.run(context);

    expect(issues).toHaveLength(0);
  });

  it('should warn when env var has placeholder value', () => {
    if (!SERVER_WITH_ENV_VARS) {
      return;
    }
    // Set a placeholder value
    process.env[SERVER_WITH_ENV_VARS.requiredEnvVars![0]] = 'your-path-here';

    const context = createContext({
      includeLocalMCPs: [SERVER_WITH_ENV_VARS.id],
    });

    const issues = localMcpEnvVarValidation.run(context);

    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].code).toBe('LOCAL_MCP_MISSING_ENV_VAR');
  });

  it('should NOT check env vars for local MCPs without requiredEnvVars', () => {
    if (!SERVER_WITHOUT_ENV_VARS) {
      return;
    }
    const context = createContext({
      includeLocalMCPs: [SERVER_WITHOUT_ENV_VARS.id],
    });

    const issues = localMcpEnvVarValidation.run(context);

    expect(issues).toHaveLength(0);
  });

  it('should skip invalid local MCP IDs (only check valid ones)', () => {
    const context = createContext({
      includeLocalMCPs: [
        'unknown-mcp-xyz',
        ...(SERVER_WITHOUT_ENV_VARS ? [SERVER_WITHOUT_ENV_VARS.id] : []),
      ],
    });

    // Should not throw or produce env var warnings for invalid IDs
    const issues = localMcpEnvVarValidation.run(context);

    // Server without env vars should not produce warnings
    expect(issues).toHaveLength(0);
  });

  it('should include server name in issue details', () => {
    if (!SERVER_WITH_ENV_VARS) {
      return;
    }
    const context = createContext({
      includeLocalMCPs: [SERVER_WITH_ENV_VARS.id],
    });

    const issues = localMcpEnvVarValidation.run(context);

    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].details).toContain(SERVER_WITH_ENV_VARS.name);
  });
});
