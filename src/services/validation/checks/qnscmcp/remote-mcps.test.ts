import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { QnscMcpConfigContext } from '../../types';
import { remoteMcpEnvVarValidation, remoteMcpReferenceValidation } from './remote-mcps';

// Dynamically import the server data to handle cases where another test has mocked this module
// Note: Bun's mock.module can have global effects in certain test configurations
let VALID_REMOTE_MCP_IDS: string[] = [];
let FIRST_VALID_ID: string | undefined;
let SERVER_WITH_ENV_VARS: { id: string; name: string; requiredEnvVars?: string[] } | undefined;
let SERVER_WITHOUT_ENV_VARS: { id: string; name: string; requiredEnvVars?: string[] } | undefined;

try {
  // Import the real data, but be resilient if it's been mocked
  const remoteServers = await import('../../../../remote-mcps/available-remote-servers');
  VALID_REMOTE_MCP_IDS = remoteServers.getAvailableRemoteMCPServerIds?.() || [];
  FIRST_VALID_ID = VALID_REMOTE_MCP_IDS[0];
  SERVER_WITH_ENV_VARS = remoteServers.AVAILABLE_REMOTE_MCP_SERVERS?.find(
    (s: any) => s.requiredEnvVars && s.requiredEnvVars.length > 0,
  );
  SERVER_WITHOUT_ENV_VARS = remoteServers.AVAILABLE_REMOTE_MCP_SERVERS?.find(
    (s: any) => !s.requiredEnvVars || s.requiredEnvVars.length === 0,
  );
} catch {
  // Module may be mocked in some test configurations - tests will skip server-dependent cases
}

describe('remoteMcpReferenceValidation', () => {
  const createContext = (tools: Record<string, any> = {}): QnscMcpConfigContext => ({
    type: 'qnsc-mcp-config',
    config: { tools },
    filePath: '/test/.qnscmcp.yaml',
  });

  it('should return no issues when includeRemoteMCPs is empty', () => {
    const context = createContext({ includeRemoteMCPs: [] });
    const issues = remoteMcpReferenceValidation.run(context);
    expect(issues).toHaveLength(0);
  });

  it('should return no issues when tools config is missing', () => {
    const context = createContext({});
    const issues = remoteMcpReferenceValidation.run(context);
    expect(issues).toHaveLength(0);
  });

  it('should warn about unknown remote MCPs', () => {
    const context = createContext({
      includeRemoteMCPs: ['definitely-unknown-remote-mcp-xyz123'],
    });

    const issues = remoteMcpReferenceValidation.run(context);

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('UNKNOWN_REMOTE_MCP');
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].message).toContain('definitely-unknown-remote-mcp-xyz123');
  });

  it('should return no issues for valid remote MCP IDs', () => {
    if (!FIRST_VALID_ID) {
      return;
    }
    const context = createContext({
      includeRemoteMCPs: [FIRST_VALID_ID],
    });

    const issues = remoteMcpReferenceValidation.run(context);

    expect(issues).toHaveLength(0);
  });

  it('should detect multiple invalid remote MCP IDs', () => {
    const context = createContext({
      includeRemoteMCPs: [
        'invalid-one-xyz',
        'invalid-two-xyz',
        ...(FIRST_VALID_ID ? [FIRST_VALID_ID] : []),
      ],
    });

    const issues = remoteMcpReferenceValidation.run(context);

    expect(issues).toHaveLength(2);
    expect(issues[0].message).toContain('invalid-one-xyz');
    expect(issues[1].message).toContain('invalid-two-xyz');
  });

  it('should include available server IDs in details', () => {
    const context = createContext({
      includeRemoteMCPs: ['unknown-mcp-xyz'],
    });

    const issues = remoteMcpReferenceValidation.run(context);

    expect(issues).toHaveLength(1);
    expect(issues[0].details).toBeDefined();
  });
});

describe('remoteMcpEnvVarValidation', () => {
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

  it('should return no issues when includeRemoteMCPs is empty', () => {
    const context = createContext({ includeRemoteMCPs: [] });
    const issues = remoteMcpEnvVarValidation.run(context);
    expect(issues).toHaveLength(0);
  });

  it('should return no issues when tools config is missing', () => {
    const context = createContext({});
    const issues = remoteMcpEnvVarValidation.run(context);
    expect(issues).toHaveLength(0);
  });

  it('should warn about missing required env vars for remote MCPs', () => {
    if (!SERVER_WITH_ENV_VARS) {
      return;
    }
    const context = createContext({
      includeRemoteMCPs: [SERVER_WITH_ENV_VARS.id],
    });

    const issues = remoteMcpEnvVarValidation.run(context);

    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].code).toBe('REMOTE_MCP_MISSING_ENV_VAR');
    expect(issues[0].message).toContain(SERVER_WITH_ENV_VARS.requiredEnvVars![0]);
  });

  it('should NOT warn when required env vars are set', () => {
    if (!SERVER_WITH_ENV_VARS) {
      return;
    }
    // Set all required env vars
    for (const envVar of SERVER_WITH_ENV_VARS.requiredEnvVars!) {
      process.env[envVar] = 'real-value';
    }

    const context = createContext({
      includeRemoteMCPs: [SERVER_WITH_ENV_VARS.id],
    });

    const issues = remoteMcpEnvVarValidation.run(context);

    expect(issues).toHaveLength(0);
  });

  it('should warn when env var has placeholder value', () => {
    if (!SERVER_WITH_ENV_VARS) {
      return;
    }
    // Set first env var to placeholder, others to real values
    process.env[SERVER_WITH_ENV_VARS.requiredEnvVars![0]] = 'your-token-here';
    for (let i = 1; i < SERVER_WITH_ENV_VARS.requiredEnvVars!.length; i++) {
      process.env[SERVER_WITH_ENV_VARS.requiredEnvVars![i]] = 'real-value';
    }

    const context = createContext({
      includeRemoteMCPs: [SERVER_WITH_ENV_VARS.id],
    });

    const issues = remoteMcpEnvVarValidation.run(context);

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('REMOTE_MCP_MISSING_ENV_VAR');
    expect(issues[0].message).toContain(SERVER_WITH_ENV_VARS.requiredEnvVars![0]);
  });

  it('should NOT check env vars for remote MCPs without requiredEnvVars', () => {
    if (!SERVER_WITHOUT_ENV_VARS) {
      return;
    }
    const context = createContext({
      includeRemoteMCPs: [SERVER_WITHOUT_ENV_VARS.id],
    });

    const issues = remoteMcpEnvVarValidation.run(context);

    expect(issues).toHaveLength(0);
  });

  it('should skip invalid remote MCP IDs (only check valid ones)', () => {
    const context = createContext({
      includeRemoteMCPs: [
        'unknown-mcp-xyz',
        ...(SERVER_WITHOUT_ENV_VARS ? [SERVER_WITHOUT_ENV_VARS.id] : []),
      ],
    });

    // Should not throw or produce env var warnings for invalid IDs
    const issues = remoteMcpEnvVarValidation.run(context);

    // Server without env vars should not produce warnings
    expect(issues).toHaveLength(0);
  });

  it('should include server name in issue details', () => {
    if (!SERVER_WITH_ENV_VARS) {
      return;
    }
    const context = createContext({
      includeRemoteMCPs: [SERVER_WITH_ENV_VARS.id],
    });

    const issues = remoteMcpEnvVarValidation.run(context);

    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].details).toContain(SERVER_WITH_ENV_VARS.name);
  });

  it('should only list missing env vars in the issue, not all of them', () => {
    if (!SERVER_WITH_ENV_VARS || SERVER_WITH_ENV_VARS.requiredEnvVars!.length < 2) {
      return;
    }
    // Only set the first required env var
    process.env[SERVER_WITH_ENV_VARS.requiredEnvVars![0]] = 'real-token';

    const context = createContext({
      includeRemoteMCPs: [SERVER_WITH_ENV_VARS.id],
    });

    const issues = remoteMcpEnvVarValidation.run(context);

    // Should have a single issue that lists all missing env vars (but not the set one)
    expect(issues.length).toBe(1);
    expect(issues[0].message).not.toContain(SERVER_WITH_ENV_VARS.requiredEnvVars![0]);
    // Should contain the other missing env vars
    for (let i = 1; i < SERVER_WITH_ENV_VARS.requiredEnvVars!.length; i++) {
      expect(issues[0].message).toContain(SERVER_WITH_ENV_VARS.requiredEnvVars![i]);
    }
  });

  it('should provide actionable details explaining why env vars are needed', () => {
    if (!SERVER_WITH_ENV_VARS) {
      return;
    }
    const context: QnscMcpConfigContext = {
      type: 'qnsc-mcp-config',
      config: {
        source: '/home/user/.qnscmcp.yaml',
        tools: {
          includeRemoteMCPs: [SERVER_WITH_ENV_VARS.id],
        },
      },
      filePath: '/test/.qnscmcp.yaml',
    };

    const issues = remoteMcpEnvVarValidation.run(context);

    expect(issues.length).toBe(1);
    // Should explain that the server is enabled in their config
    expect(issues[0].details).toContain('includeRemoteMCPs');
    expect(issues[0].details).toContain(SERVER_WITH_ENV_VARS.id);
    // Should provide the option to remove the server if not needed
    expect(issues[0].details).toContain('remove');
  });
});
