/**
 * Tests for the logout MCP tool + shared performRemoteLogout core.
 *
 * Verifies local-token clearing, gateway credential-manager URL derivation +
 * browser open, local-server + unknown-server handling, and the tool's JSON
 * response shape.
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import '../../test-utils/mocks';

// Own the 'open' mock locally and (re)apply it at runtime in beforeEach. Other
// test files (remote-mcp-client.test.ts, port-retry.test.ts) also call
// mock.module('open', …) at the top level, and Bun's load-phase mocks are
// last-writer-wins globally — so the shared mock in mocks.ts can lose the race
// depending on file order. A runtime mock.module in beforeEach runs after the
// load phase and reliably re-points the binding this suite asserts against.
const openMock = mock((_url?: string) => Promise.resolve());

import {
  getAvailableRemoteMCPServerIds,
  getRemoteMCPServer,
} from '../../remote-mcps/available-remote-servers';
import { RemoteMcpOauthProvider } from '../../gateway/auth/remote-mcp-oauth-provider';
import { LogoutTool, performRemoteLogout } from './logout-tool';

const IDS = getAvailableRemoteMCPServerIds();
// A platform (gateway-routed) server that uses the per-server OAuth provider —
// exclude entra-id / static-bearer, which never store in qnsc-mcp-remote.
const PLATFORM_ID = IDS.find((i) => {
  const d = getRemoteMCPServer(i);
  return (d?.url ?? '').includes('ai.qnsc.vn') && !d?.authType;
})!;
const ENTRA_ID = IDS.find((i) => getRemoteMCPServer(i)?.authType === 'entra-id');
const LOCAL_ID = IDS.find((i) => /localhost|127\.0\.0\.1/.test(getRemoteMCPServer(i)?.url ?? ''));

// No gateway-routed server ships any more: the 17 that proxied through the hosted
// gateway were removed, leaving one direct entry (aws-knowledge) and one localhost entry
// (figma-dev). performRemoteLogout resolves the id through getRemoteMCPServer itself, so
// the platform branch cannot be reached without such a server in the registry, and a
// module mock is not an option here (mock.module leaks across files in Bun). These cases
// are skipped rather than deleted: the branch is still implemented and correct, and this
// keeps its coverage ready if a gateway-routed server is added again.
const itPlatform = PLATFORM_ID ? it : it.skip;

describe('performRemoteLogout', () => {
  let hasStoredCredentialsSpy: ReturnType<typeof spyOn>;
  let clearStoredCredentialsSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    openMock.mockClear();
    openMock.mockImplementation(() => Promise.resolve());
    // mock.module's factory here is synchronous, so the returned Promise|void is never pending; fire-and-forget by design
    void mock.module('open', () => ({ default: openMock }));
    hasStoredCredentialsSpy = spyOn(RemoteMcpOauthProvider, 'hasStoredCredentials').mockReturnValue(
      false,
    );
    clearStoredCredentialsSpy = spyOn(
      RemoteMcpOauthProvider,
      'clearStoredCredentials',
    ).mockResolvedValue(undefined);
  });

  afterEach(() => {
    hasStoredCredentialsSpy.mockRestore();
    clearStoredCredentialsSpy.mockRestore();
  });

  itPlatform('opens the gateway credential manager for a platform server', async () => {
    const result = await performRemoteLogout(PLATFORM_ID);

    expect(result.ok).toBe(true);
    expect(result.credentialManagerUrl).toMatch(
      /^https:\/\/auth\.mcp-.*\.ai\.qnsc.vn\/oauth\/v2\/manage\/credentials$/,
    );
    expect(result.browserOpened).toBe(true);
    expect(openMock).toHaveBeenCalledWith(result.credentialManagerUrl);
  });

  itPlatform('always clears the local per-server token', async () => {
    await performRemoteLogout(PLATFORM_ID);
    expect(RemoteMcpOauthProvider.clearStoredCredentials).toHaveBeenCalledWith(PLATFORM_ID);
  });

  itPlatform('reports clearedLocalToken when the credential is gone after clearing', async () => {
    hasStoredCredentialsSpy
      .mockReturnValueOnce(true) // before clear: present
      .mockReturnValueOnce(false); // after clear: removed
    const result = await performRemoteLogout(PLATFORM_ID);
    expect(result.clearedLocalToken).toBe(true);
    expect(result.localClearFailed).toBeFalsy();
  });

  itPlatform('reports localClearFailed when the credential is still present after clearing', async () => {
    // Same value before AND after: the keyring delete silently failed.
    hasStoredCredentialsSpy.mockReturnValue(true);
    const result = await performRemoteLogout(PLATFORM_ID);
    expect(result.clearedLocalToken).toBe(false);
    expect(result.localClearFailed).toBe(true);
    expect(result.message).toContain('could not remove');
  });

  itPlatform('does not claim the browser opened when open() throws', async () => {
    openMock.mockImplementationOnce(() => Promise.reject(new Error('no browser')));
    const result = await performRemoteLogout(PLATFORM_ID);
    expect(result.ok).toBe(true);
    expect(result.browserOpened).toBe(false);
    expect(result.credentialManagerUrl).toBeDefined();
    expect(result.message).not.toContain('Opened the credential manager');
    expect(result.message).toContain('Could not open a browser');
  });

  it('does not open a browser for an entra-id (shared SSO) server', async () => {
    if (!ENTRA_ID) return; // no entra-id server registered; skip
    const result = await performRemoteLogout(ENTRA_ID);
    expect(result.ok).toBe(true);
    expect(result.browserOpened).toBe(false);
    expect(result.credentialManagerUrl).toBeUndefined();
    expect(result.clearedLocalToken).toBe(false);
    expect(RemoteMcpOauthProvider.clearStoredCredentials).not.toHaveBeenCalled();
    expect(openMock).not.toHaveBeenCalled();
    expect(result.message.toLowerCase()).toContain('sso');
  });

  itPlatform('derives the AS host as auth.<data-plane-host>', async () => {
    const serverHost = new URL(getRemoteMCPServer(PLATFORM_ID)!.url).hostname;
    const result = await performRemoteLogout(PLATFORM_ID);
    expect(result.credentialManagerUrl).toBe(
      `https://auth.${serverHost}/oauth/v2/manage/credentials`,
    );
  });

  it('returns ok:false for an unknown server and does not open a browser', async () => {
    const result = await performRemoteLogout('not-a-real-server');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Unknown remote MCP server');
    expect(openMock).not.toHaveBeenCalled();
  });

  it('does not open a gateway page for a local (localhost) server', async () => {
    if (!LOCAL_ID) return; // no local server registered; skip
    const result = await performRemoteLogout(LOCAL_ID);
    expect(result.ok).toBe(true);
    expect(result.credentialManagerUrl).toBeUndefined();
    expect(result.browserOpened).toBe(false);
    expect(openMock).not.toHaveBeenCalled();
  });
});

describe('LogoutTool', () => {
  let hasStoredCredentialsSpy: ReturnType<typeof spyOn>;
  let clearStoredCredentialsSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    openMock.mockClear();
    openMock.mockImplementation(() => Promise.resolve());
    // mock.module's factory here is synchronous, so the returned Promise|void is never pending; fire-and-forget by design
    void mock.module('open', () => ({ default: openMock }));
    hasStoredCredentialsSpy = spyOn(RemoteMcpOauthProvider, 'hasStoredCredentials').mockReturnValue(
      false,
    );
    clearStoredCredentialsSpy = spyOn(
      RemoteMcpOauthProvider,
      'clearStoredCredentials',
    ).mockResolvedValue(undefined);
  });

  afterEach(() => {
    hasStoredCredentialsSpy.mockRestore();
    clearStoredCredentialsSpy.mockRestore();
  });

  itPlatform('returns a JSON success payload with the credential-manager URL', async () => {
    const tool = new LogoutTool();
    const json = JSON.parse(await tool.execute({ server: PLATFORM_ID }));

    expect(json.success).toBe(true);
    expect(json.credentialManagerUrl).toContain('/oauth/v2/manage/credentials');
    expect(json.message).toContain('access token expires');
  });

  it('returns success:false for an unknown server', async () => {
    const tool = new LogoutTool();
    const json = JSON.parse(await tool.execute({ server: 'not-a-real-server' }));

    expect(json.success).toBe(false);
    expect(json.message).toContain('Unknown remote MCP server');
  });
});
