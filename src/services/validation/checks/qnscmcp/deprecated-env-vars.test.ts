/**
 * Tests for deprecated environment variable validation check
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { deprecatedEnvVarCheck } from './deprecated-env-vars';
import type { QnscMcpConfigContext } from '../../types';
import { QNSCMCP_ISSUE_CODES } from '../../issue-codes';

describe('deprecatedEnvVarCheck', () => {
  let context: QnscMcpConfigContext;

  const deprecatedVars = [
    'NEW_RELIC_API_KEY',
    'NEW_RELIC_ACCOUNT_ID',
    'NEW_RELIC_ACCOUNT_IDS',
    'NEW_RELIC_LICENSE_KEY',
    'CORTEX_API_BASE_URL',
    'DD_API_KEY',
    'DD_APP_KEY',
    'DD_SITE',
    'KONNECT_REGION',
  ];

  beforeEach(() => {
    context = {
      type: 'qnsc-mcp-config',
      config: {},
      filePath: '/test/.qnscmcp.yaml',
    };
    for (const v of deprecatedVars) {
      delete process.env[v];
    }
  });

  afterEach(() => {
    for (const v of deprecatedVars) {
      delete process.env[v];
    }
  });

  it('should have correct metadata', () => {
    expect(deprecatedEnvVarCheck.id).toBe('qnscmcp.deprecated-env-vars');
    expect(deprecatedEnvVarCheck.name).toBe('Deprecated Environment Variables');
    expect(deprecatedEnvVarCheck.appliesTo).toBe('qnsc-mcp-config');
  });

  it('should report no issues when no deprecated vars are set', () => {
    const issues = deprecatedEnvVarCheck.run(context);
    expect(issues).toHaveLength(0);
  });

  it('should report info issue when a deprecated New Relic var is set', () => {
    process.env.NEW_RELIC_API_KEY = 'some-key';
    const issues = deprecatedEnvVarCheck.run(context);

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('info');
    expect(issues[0].code).toBe(QNSCMCP_ISSUE_CODES.DEPRECATED_ENV_VAR);
    expect(issues[0].message).toContain('NEW_RELIC_API_KEY');
    expect(issues[0].details).toContain('safely remove');
  });

  it('should report info issue when deprecated var is set to empty string', () => {
    process.env.NEW_RELIC_API_KEY = '';
    const issues = deprecatedEnvVarCheck.run(context);

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe(QNSCMCP_ISSUE_CODES.DEPRECATED_ENV_VAR);
    expect(issues[0].message).toContain('NEW_RELIC_API_KEY');
  });

  it('should report each deprecated var independently', () => {
    process.env.NEW_RELIC_API_KEY = 'key';
    process.env.NEW_RELIC_ACCOUNT_ID = '123';
    const issues = deprecatedEnvVarCheck.run(context);

    expect(issues).toHaveLength(2);
    expect(issues.map((i) => i.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('NEW_RELIC_API_KEY'),
        expect.stringContaining('NEW_RELIC_ACCOUNT_ID'),
      ]),
    );
  });

  it('should report all deprecated vars when all are set', () => {
    for (const v of deprecatedVars) {
      process.env[v] = 'test-value';
    }
    const issues = deprecatedEnvVarCheck.run(context);

    expect(issues).toHaveLength(9);
    for (const v of deprecatedVars) {
      expect(issues.some((i) => i.message.includes(v))).toBe(true);
    }
  });

  it('should include migration guidance in details', () => {
    process.env.NEW_RELIC_LICENSE_KEY = 'some-key';
    const issues = deprecatedEnvVarCheck.run(context);

    expect(issues[0].details).toContain('NEW_RELIC_LICENSE_KEY_MCP');
  });

  it('should say Cortex tools are gone rather than pointing at a removed server', () => {
    process.env.CORTEX_API_BASE_URL = 'https://api.getcortexapp.com';
    const issues = deprecatedEnvVarCheck.run(context);

    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('CORTEX_API_BASE_URL');
    expect(issues[0].details).toContain('Cortex tools are no longer part of this build');
  });

  it('should report info issue when DD_API_KEY is set', () => {
    process.env.DD_API_KEY = 'some-key';
    const issues = deprecatedEnvVarCheck.run(context);

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('info');
    expect(issues[0].code).toBe(QNSCMCP_ISSUE_CODES.DEPRECATED_ENV_VAR);
    expect(issues[0].message).toContain('DD_API_KEY');
    expect(issues[0].details).toContain('Datadog tools are no longer part of this build');
  });

  it('should report info issue when DD_SITE is set', () => {
    process.env.DD_SITE = 'datadoghq.eu';
    const issues = deprecatedEnvVarCheck.run(context);

    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('DD_SITE');
    expect(issues[0].details).toContain('Datadog tools are no longer part of this build');
  });

  it('should report warning issue when KONNECT_REGION is set', () => {
    process.env.KONNECT_REGION = 'us';
    const issues = deprecatedEnvVarCheck.run(context);

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].code).toBe(QNSCMCP_ISSUE_CODES.DEPRECATED_ENV_VAR);
    expect(issues[0].message).toContain('KONNECT_REGION');
    expect(issues[0].details).toContain('Kong tools are no longer part of this build');
  });
});
