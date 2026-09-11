/**
 * remote-mcp-manager.test.ts - Tests for RemoteMCPManager
 *
 * Focused on RemoteMCPManager's own responsibilities — which servers get
 * enabled and what URL each one connects to (including the policy-driven
 * host override added alongside this test file) — not the underlying OAuth/
 * HTTP mechanics, which belong to RemoteMCPClient's own test suite.
 *
 * Uses spyOn on RemoteMCPClient's real prototype (not mock.module) and a
 * real server from AVAILABLE_REMOTE_MCP_SERVERS (not a fake module mock) —
 * mock.module leaks globally across test files in Bun (see test-utils/mocks.ts
 * header comment) and previously broke remote-mcp-client.test.ts when both
 * ran in the same process.
 */
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import type { QnscMcpConfig } from '../config';
import { AVAILABLE_REMOTE_MCP_SERVERS } from '../remote-mcps/available-remote-servers';
import { RemoteMCPClient } from './remote-mcp-client';
import { RemoteMCPManager } from './remote-mcp-manager';
import * as remotePolicyModule from './remote-policy';
import type { RemotePolicy } from './remote-policy';

describe('RemoteMCPManager', () => {
  // Real, existing server definitions — avoids mocking available-remote-servers.
  // Previously datadog and lucid; both went with the 17 gateway-routed servers when the
  // hosted gateway was dropped. These two are what remain, and they cover the same
  // ground: resolveRemoteServerUrl runs for every remote server, so policy override and
  // per-server isolation are not specific to gateway-routed entries.
  const primaryServer = AVAILABLE_REMOTE_MCP_SERVERS.find((s) => s.id === 'aws-knowledge-mcp-server')!;
  const secondaryServer = AVAILABLE_REMOTE_MCP_SERVERS.find((s) => s.id === 'figma-dev')!;

  let connectToServerSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    connectToServerSpy = spyOn(RemoteMCPClient.prototype, 'connectToServer').mockImplementation(
      () => Promise.resolve(),
    );
    spyOn(RemoteMCPClient.prototype, 'getAllRemoteTools').mockImplementation(() => []);
    spyOn(RemoteMCPClient.prototype, 'getConnectionStatus').mockImplementation(() => ({}));
  });

  afterEach(() => {
    mock.restore();
  });

  const mockConfig: QnscMcpConfig = {
    tools: { includeRemoteMCPs: ['aws-knowledge-mcp-server'] },
  } as QnscMcpConfig;

  it("connects using the server's default URL when no policy is provided", async () => {
    const manager = new RemoteMCPManager(mockConfig);
    await manager.initialize();

    expect(connectToServerSpy).toHaveBeenCalledTimes(1);
    const [passedConfig] = connectToServerSpy.mock.calls[0] as [{ url: string }];
    expect(passedConfig.url).toBe(primaryServer.url);
  });

  it("connects using the server's default URL when the policy has no matching entry", async () => {
    const policy: RemotePolicy = { version: 1, policies: {} };
    const manager = new RemoteMCPManager(mockConfig, policy);
    await manager.initialize();

    const [passedConfig] = connectToServerSpy.mock.calls[0] as [{ url: string }];
    expect(passedConfig.url).toBe(primaryServer.url);
  });

  it('connects using the policy-driven url override when enabled and valid', async () => {
    const policy: RemotePolicy = {
      version: 1,
      policies: {
        'aws-knowledge-mcp-server': {
          enabled: true,
          suppressLocalCategories: [],
          url: 'https://mcp.qnsc.vn/aws-knowledge/mcp',
        },
      },
    };
    const manager = new RemoteMCPManager(mockConfig, policy);
    await manager.initialize();

    const [passedConfig] = connectToServerSpy.mock.calls[0] as [{ url: string }];
    expect(passedConfig.url).toBe('https://mcp.qnsc.vn/aws-knowledge/mcp');
  });

  it('falls back to the default URL when the policy entry is disabled', async () => {
    const policy: RemotePolicy = {
      version: 1,
      policies: {
        'aws-knowledge-mcp-server': {
          enabled: false,
          suppressLocalCategories: [],
          url: 'https://mcp.qnsc.vn/aws-knowledge/mcp',
        },
      },
    };
    const manager = new RemoteMCPManager(mockConfig, policy);
    await manager.initialize();

    const [passedConfig] = connectToServerSpy.mock.calls[0] as [{ url: string }];
    expect(passedConfig.url).toBe(primaryServer.url);
  });

  it('prefers a local {SERVICE}_MCP_URL env var over the policy url override', async () => {
    // resolveRemoteServerUrl only checks whether the env var is *set*, not its
    // value — it assumes the caller's defaultUrl (here, primaryServer.url, which
    // was already resolved at module-import time) already reflects it, exactly
    // as getInternalMcpUrl does for real servers. So the assertion below is
    // primaryServer.url as already computed, not this env var's value; what
    // matters is that the policy override gets ignored while it's set.
    process.env.AWS_KNOWLEDGE_MCP_SERVER_MCP_URL = 'https://my-local-tunnel.example.com/aws/mcp';
    try {
      const policy: RemotePolicy = {
        version: 1,
        policies: {
          'aws-knowledge-mcp-server': {
            enabled: true,
            suppressLocalCategories: [],
            url: 'https://mcp.qnsc.vn/aws-knowledge/mcp',
          },
        },
      };
      const manager = new RemoteMCPManager(mockConfig, policy);
      await manager.initialize();

      const [passedConfig] = connectToServerSpy.mock.calls[0] as [{ url: string }];
      expect(passedConfig.url).toBe(primaryServer.url);
    } finally {
      delete process.env.AWS_KNOWLEDGE_MCP_SERVER_MCP_URL;
    }
  });

  it("resolves each server's URL independently within the same initialize() call", async () => {
    // Every test above configures exactly one server — this locks in that
    // the per-server .map() over serversToEnable correctly attributes each
    // server's own resolved URL (a closure/index mistake here wouldn't be
    // caught by a single-server test).
    const multiServerConfig: QnscMcpConfig = {
      tools: { includeRemoteMCPs: ['aws-knowledge-mcp-server', 'figma-dev'] },
    } as QnscMcpConfig;
    const policy: RemotePolicy = {
      version: 1,
      policies: {
        'aws-knowledge-mcp-server': {
          enabled: true,
          suppressLocalCategories: [],
          url: 'https://mcp.qnsc.vn/aws-knowledge/mcp',
        },
        // figma-dev has no policy entry — should keep its own default URL.
      },
    };
    const manager = new RemoteMCPManager(multiServerConfig, policy);
    await manager.initialize();

    expect(connectToServerSpy).toHaveBeenCalledTimes(2);
    const calls = connectToServerSpy.mock.calls as unknown as [{ id: string; url: string }][];
    const primaryCall = calls.find(([config]) => config.id === 'aws-knowledge-mcp-server')!;
    const secondaryCall = calls.find(([config]) => config.id === 'figma-dev')!;
    expect(primaryCall[0].url).toBe('https://mcp.qnsc.vn/aws-knowledge/mcp');
    expect(secondaryCall[0].url).toBe(secondaryServer.url);
  });

  it("isolates one server's URL resolution failure from every other server", async () => {
    // resolveRemoteServerUrl can't throw today (traced every sub-call when
    // this fix was made), but the try/catch around it in initialize()'s
    // .map() callback exists as a structural safety net for if it ever does
    // — without it, one bad policy entry would abort the whole Promise.all
    // and, via the uncaught rejection, take down the entire server startup
    // instead of just that one remote server. Simulates the failure directly
    // to prove the isolation holds, since it's not reachable through real
    // inputs today.
    const realResolveRemoteServerUrl = remotePolicyModule.resolveRemoteServerUrl;
    spyOn(remotePolicyModule, 'resolveRemoteServerUrl').mockImplementation(
      (serverId: string, defaultUrl: string, policy?: RemotePolicy) => {
        if (serverId === 'aws-knowledge-mcp-server') {
          throw new Error('simulated unexpected throw');
        }
        return realResolveRemoteServerUrl(serverId, defaultUrl, policy);
      },
    );

    const multiServerConfig: QnscMcpConfig = {
      tools: { includeRemoteMCPs: ['aws-knowledge-mcp-server', 'figma-dev'] },
    } as QnscMcpConfig;
    const manager = new RemoteMCPManager(multiServerConfig);

    expect(manager.initialize()).resolves.toBeUndefined();

    expect(connectToServerSpy).toHaveBeenCalledTimes(2);
    const calls = connectToServerSpy.mock.calls as unknown as [{ id: string; url: string }][];
    const primaryCall = calls.find(([config]) => config.id === 'aws-knowledge-mcp-server')!;
    const secondaryCall = calls.find(([config]) => config.id === 'figma-dev')!;
    // aws-knowledge falls back to its own default URL rather than being skipped.
    expect(primaryCall[0].url).toBe(primaryServer.url);
    // figma-dev is entirely unaffected by aws-knowledge's simulated failure.
    expect(secondaryCall[0].url).toBe(secondaryServer.url);
  });
});
