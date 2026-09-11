/**
 * Tests for the logout CLI command.
 *
 * Verifies server-id validation, local-token clearing, browser open to the
 * gateway credential manager, local-server handling, and exit codes. The core
 * logic lives in performRemoteLogout (tools/platform-session/logout-tool); these tests cover
 * the CLI formatting + exit codes on top of it.
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import '../test-utils/mocks';

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
} from '../remote-mcps/available-remote-servers';
import { RemoteMcpOauthProvider } from '../gateway/auth/remote-mcp-oauth-provider';
import { logout, LogoutExitCode } from './logout';

const IDS = getAvailableRemoteMCPServerIds();
// A real platform server (routed through the gateway) that uses the per-server
// OAuth provider — exclude entra-id / static-bearer, which never store locally.
const PLATFORM_ID = IDS.find((i) => {
  const d = getRemoteMCPServer(i);
  return (d?.url ?? '').includes('ai.qnsc.vn') && !d?.authType;
})!;
// The shared-SSO (entra-id) server, if registered.
const ENTRA_ID = IDS.find((i) => getRemoteMCPServer(i)?.authType === 'entra-id');
// A local (localhost) server — figma-dev — if registered.
const LOCAL_ID = IDS.find((i) => /localhost|127\.0\.0\.1/.test(getRemoteMCPServer(i)?.url ?? ''));

// No gateway-routed server ships any more: the 17 that proxied through the hosted
// gateway were removed, leaving one direct entry (aws-knowledge) and one localhost entry
// (figma-dev). performRemoteLogout resolves the id through getRemoteMCPServer itself, so
// the platform branch cannot be reached without such a server in the registry, and a
// module mock is not an option here (mock.module leaks across files in Bun). These cases
// are skipped rather than deleted: the branch is still implemented and correct, and this
// keeps its coverage ready if a gateway-routed server is added again.
const describePlatform = PLATFORM_ID ? describe : describe.skip;

describe('logout command', () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    openMock.mockClear();
    openMock.mockImplementation(() => Promise.resolve());
    void mock.module('open', () => ({ default: openMock }));
    spyOn(RemoteMcpOauthProvider, 'hasStoredCredentials').mockReturnValue(false);
    spyOn(RemoteMcpOauthProvider, 'clearStoredCredentials').mockResolvedValue(undefined);
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    (RemoteMcpOauthProvider.hasStoredCredentials as any).mockRestore?.();
    (RemoteMcpOauthProvider.clearStoredCredentials as any).mockRestore?.();
  });

  const output = () => consoleLogSpy.mock.calls.map((c: any[]) => c[0]).join('\n');

  describePlatform('platform server', () => {
    it('opens the gateway credential manager and returns SUCCESS', async () => {
      const exitCode = await logout(PLATFORM_ID);

      expect(exitCode).toBe(LogoutExitCode.SUCCESS);
      expect(openMock).toHaveBeenCalledTimes(1);
      const url = String((openMock.mock.calls[0] as any[])[0]);
      expect(url).toMatch(/^https:\/\/auth\.mcp-.*\.ai\.qnsc.vn\/oauth\/v2\/manage\/credentials$/);
      expect(output()).toContain('credential manager');
    });

    it('reports clearing the local token when one existed and was removed', async () => {
      (RemoteMcpOauthProvider.hasStoredCredentials as any)
        .mockReturnValueOnce(true) // before clear: present
        .mockReturnValueOnce(false); // after clear: removed

      await logout(PLATFORM_ID);

      expect(RemoteMcpOauthProvider.clearStoredCredentials).toHaveBeenCalledWith(PLATFORM_ID);
      expect(output()).toContain('Cleared the local session token');
    });

    it('warns instead of claiming success when the token could not be removed', async () => {
      // Present before AND after: the keyring delete silently failed.
      (RemoteMcpOauthProvider.hasStoredCredentials as any).mockReturnValue(true);

      await logout(PLATFORM_ID);

      expect(output()).not.toContain('Cleared the local session token');
      expect(output()).toContain('Could not remove the locally stored token');
    });

    it('trims whitespace from the server id', async () => {
      const exitCode = await logout(`  ${PLATFORM_ID}  `);
      expect(exitCode).toBe(LogoutExitCode.SUCCESS);
      expect(openMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('unknown server', () => {
    it('returns FAILURE and does not open a browser', async () => {
      const exitCode = await logout('not-a-real-server');

      expect(exitCode).toBe(LogoutExitCode.FAILURE);
      expect(openMock).not.toHaveBeenCalled();
      expect(output()).toContain('Unknown remote MCP server');
      expect(output()).toContain('not-a-real-server');
    });
  });

  describe('local server', () => {
    it('does not open a gateway page for a localhost server', async () => {
      if (!LOCAL_ID) return; // no local server registered; skip
      const exitCode = await logout(LOCAL_ID);

      expect(exitCode).toBe(LogoutExitCode.SUCCESS);
      expect(openMock).not.toHaveBeenCalled();
      expect(output().toLowerCase()).toContain('local server');
    });
  });

  describe('entra-id (shared SSO) server', () => {
    it('does not open a browser and explains shared SSO', async () => {
      if (!ENTRA_ID) return; // no entra-id server registered; skip
      const exitCode = await logout(ENTRA_ID);

      expect(exitCode).toBe(LogoutExitCode.SUCCESS);
      expect(openMock).not.toHaveBeenCalled();
      expect(output().toLowerCase()).toContain('sso');
    });
  });
});
