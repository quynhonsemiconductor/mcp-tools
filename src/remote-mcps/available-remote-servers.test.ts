import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { setupStandardMocks } from '../test-utils/mocks';

describe('available-remote-servers', () => {
  setupStandardMocks();

  beforeEach(() => {
    mock.restore();
  });




  describe('Platform gateway migration', () => {
    it('should define QNSC_PLATFORM_HOSTS with three tiers in source', async () => {
      const source = await Bun.file(import.meta.dir + '/available-remote-servers.ts').text();
      expect(source).toContain('mcp-prod.ai.qnsc.vn');
      expect(source).toContain('mcp-pp.ai.qnsc.vn');
      expect(source).toContain('mcp-np.ai.qnsc.vn');
    });



    it('should reach aws-knowledge directly, not through the platform gateway', async () => {
      const source = await Bun.file(import.meta.dir + '/available-remote-servers.ts').text();
      // AWS publishes this endpoint publicly with no credentials, so routing it
      // through the gateway only made it fail wherever the gateway is absent.
      expect(source).not.toContain("getPlatformMcpUrl('aws-knowledge')");
      expect(source).toContain("getDirectMcpUrl('aws-knowledge'");
    });

    it('should point aws-knowledge at the published AWS endpoint', async () => {
      const { getRemoteMCPServer } = await import('./available-remote-servers');
      const aws = getRemoteMCPServer('aws-knowledge-mcp-server');

      expect(aws!.url).toBe('https://knowledge-mcp.global.api.aws/mcp');
      // No brokered identity involved, so no client-side auth or env vars.
      expect(aws!.authType).toBeUndefined();
      expect(aws!.requiredEnvVars).toBeUndefined();
      expect(aws!.headers).toBeUndefined();
    });



    it('should not use /ext/ path prefix for migrated proxy servers', async () => {
      const source = await Bun.file(import.meta.dir + '/available-remote-servers.ts').text();
      expect(source).not.toContain('/ext/github');
      expect(source).not.toContain('/ext/pagerduty');
      expect(source).not.toContain('/ext/aws-knowledge');
      expect(source).not.toContain('/ext/cortex');
      expect(source).not.toContain('/ext/bitrise');
    });



    it('aws-knowledge-mcp-server should resolve to the AWS endpoint, not the gateway', async () => {
      const { getRemoteMCPServer } = await import('./available-remote-servers');
      const awsKnowledge = getRemoteMCPServer('aws-knowledge-mcp-server');

      expect(awsKnowledge).toBeDefined();
      // Deliberately not gateway-routed: the AWS endpoint is public and
      // credential-free, so a gateway hop would only add a failure mode.
      expect(awsKnowledge!.url).toBe('https://knowledge-mcp.global.api.aws/mcp');
      expect(awsKnowledge!.url).not.toContain('ai.qnsc.vn');
    });



    it('getPlatformMcpUrl resolves to the tier gateway when no override is set', async () => {
      const { getPlatformMcpUrl } = await import('./available-remote-servers');
      // Default test tier is non-prod (bunfig.toml), so the host is mcp-np.
      expect(getPlatformMcpUrl('splunk')).toBe('https://mcp-np.ai.qnsc.vn/splunk/mcp');
    });

    it('getPlatformMcpUrl honors a {SERVICE}_MCP_URL override', async () => {
      const { getPlatformMcpUrl } = await import('./available-remote-servers');
      process.env.SPLUNK_MCP_URL = 'https://splunk.override.example.com/splunk/mcp';
      try {
        expect(getPlatformMcpUrl('splunk')).toBe('https://splunk.override.example.com/splunk/mcp');
      } finally {
        delete process.env.SPLUNK_MCP_URL;
      }
    });

    it('getPlatformMcpUrl derives the override env var with hyphens converted to underscores', async () => {
      const { getPlatformMcpUrl } = await import('./available-remote-servers');
      // `aws-knowledge` must map to AWS_KNOWLEDGE_MCP_URL, not AWS-KNOWLEDGE_MCP_URL.
      process.env.AWS_KNOWLEDGE_MCP_URL = 'https://aws.override.example.com/aws-knowledge/mcp';
      try {
        expect(getPlatformMcpUrl('aws-knowledge')).toBe(
          'https://aws.override.example.com/aws-knowledge/mcp',
        );
      } finally {
        delete process.env.AWS_KNOWLEDGE_MCP_URL;
      }
    });
  });



  describe('getExternalMcpUrl validation', () => {
    const TEST_ENV_VAR = '__TEST_EXT_MCP_URL__';
    let savedEnv: string | undefined;

    beforeEach(() => {
      savedEnv = process.env[TEST_ENV_VAR];
      delete process.env[TEST_ENV_VAR];
    });

    afterEach(() => {
      if (savedEnv === undefined) {
        delete process.env[TEST_ENV_VAR];
      } else {
        process.env[TEST_ENV_VAR] = savedEnv;
      }
    });

    it('returns the default URL when the env var is unset', async () => {
      const { getExternalMcpUrl } = await import('./available-remote-servers');
      const url = getExternalMcpUrl(TEST_ENV_VAR, 'https://default.example.com');
      expect(url).toBe('https://default.example.com');
    });

    it('returns the override when the override is a valid HTTPS URL', async () => {
      process.env[TEST_ENV_VAR] = 'https://override.example.com/path';
      const { getExternalMcpUrl } = await import('./available-remote-servers');
      const url = getExternalMcpUrl(TEST_ENV_VAR, 'https://default.example.com');
      expect(url).toBe('https://override.example.com/path');
    });

    it('rejects an override that is not a valid URL and falls back to default', async () => {
      process.env[TEST_ENV_VAR] = 'not a url at all';
      const { getExternalMcpUrl } = await import('./available-remote-servers');
      const url = getExternalMcpUrl(TEST_ENV_VAR, 'https://default.example.com');
      expect(url).toBe('https://default.example.com');
    });

    it('rejects a non-HTTPS override and falls back to default', async () => {
      process.env[TEST_ENV_VAR] = 'http://insecure.example.com/path';
      const { getExternalMcpUrl } = await import('./available-remote-servers');
      const url = getExternalMcpUrl(TEST_ENV_VAR, 'https://default.example.com');
      expect(url).toBe('https://default.example.com');
    });

    it('rejects an override whose host is not in the allowlist', async () => {
      process.env[TEST_ENV_VAR] = 'https://attacker.example.com/exfil';
      const { getExternalMcpUrl } = await import('./available-remote-servers');
      const url = getExternalMcpUrl(TEST_ENV_VAR, 'https://default.example.com', [
        'smartsheet.com',
      ]);
      expect(url).toBe('https://default.example.com');
    });

    it('accepts an override whose host exactly matches an allowlist entry', async () => {
      process.env[TEST_ENV_VAR] = 'https://smartsheet.com/mcp';
      const { getExternalMcpUrl } = await import('./available-remote-servers');
      const url = getExternalMcpUrl(TEST_ENV_VAR, 'https://default.example.com', [
        'smartsheet.com',
      ]);
      expect(url).toBe('https://smartsheet.com/mcp');
    });

    it('accepts an override whose host is a subdomain of an allowlist entry', async () => {
      process.env[TEST_ENV_VAR] = 'https://mcp.smartsheet.eu/path';
      const { getExternalMcpUrl } = await import('./available-remote-servers');
      const url = getExternalMcpUrl(TEST_ENV_VAR, 'https://default.example.com', [
        'smartsheet.com',
        'smartsheet.eu',
        'smartsheet.au',
      ]);
      expect(url).toBe('https://mcp.smartsheet.eu/path');
    });

    it('does not match a host that contains the allowlist entry as a substring (no partial match)', async () => {
      // 'evilsmartsheet.com' must NOT match 'smartsheet.com'
      process.env[TEST_ENV_VAR] = 'https://evilsmartsheet.com/mcp';
      const { getExternalMcpUrl } = await import('./available-remote-servers');
      const url = getExternalMcpUrl(TEST_ENV_VAR, 'https://default.example.com', [
        'smartsheet.com',
      ]);
      expect(url).toBe('https://default.example.com');
    });
  });




  // Regression guard for #1300: every entry routed through the consolidated
  // platform gateway (getPlatformMcpUrl → https://mcp-*.ai.qnsc.vn/{name}/mcp)
  // is platform-handled — identity via platform OAuth, per-user credentials
  // injected gateway-side. A client-side authType (e.g. 'entra-id') or
  // requiredEnvVars on such an entry is rejected with 401 by the gateway.
  // Parameterized so new platform-handled entries inherit the guard automatically.

  describe('getDirectMcpUrl', () => {
    const ENV = 'AWS_KNOWLEDGE_MCP_URL';
    const VENDOR = 'https://knowledge-mcp.global.api.aws/mcp';

    afterEach(() => {
      delete process.env[ENV];
    });

    it('returns the vendor endpoint when no override is set', async () => {
      const { getDirectMcpUrl } = await import('./available-remote-servers');
      expect(getDirectMcpUrl('aws-knowledge', VENDOR, ['api.aws'])).toBe(VENDOR);
    });

    it('accepts an override on an allowed vendor domain', async () => {
      const { getDirectMcpUrl } = await import('./available-remote-servers');
      process.env[ENV] = 'https://knowledge-mcp.eu.api.aws/mcp';
      expect(getDirectMcpUrl('aws-knowledge', VENDOR, ['api.aws'])).toBe(
        'https://knowledge-mcp.eu.api.aws/mcp',
      );
    });

    it('rejects an override that redirects off the vendor domain', async () => {
      const { getDirectMcpUrl } = await import('./available-remote-servers');
      process.env[ENV] = 'https://attacker.example.com/mcp';
      expect(getDirectMcpUrl('aws-knowledge', VENDOR, ['api.aws'])).toBe(VENDOR);
    });

    it('rejects a lookalike host that only substring-matches the suffix', async () => {
      const { getDirectMcpUrl } = await import('./available-remote-servers');
      // "notapi.aws" must not satisfy a check for the "api.aws" suffix.
      process.env[ENV] = 'https://notapi.aws/mcp';
      expect(getDirectMcpUrl('aws-knowledge', VENDOR, ['api.aws'])).toBe(VENDOR);
    });

    it('rejects a plaintext http override', async () => {
      const { getDirectMcpUrl } = await import('./available-remote-servers');
      process.env[ENV] = 'http://knowledge-mcp.global.api.aws/mcp';
      expect(getDirectMcpUrl('aws-knowledge', VENDOR, ['api.aws'])).toBe(VENDOR);
    });
  });
});
