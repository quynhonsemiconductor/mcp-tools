/**
 * Log out of a single remote MCP server.
 *
 * "Logging out" means two things. Servers that authenticate to the platform
 * gateway via OAuth have a local per-server session token in the keyring, which
 * this clears locally. The vendor credential the gateway injects per-request
 * lives server-side (registered once, sealed) and is revoked through the
 * gateway's own OIDC-protected credential manager (behind Entra SSO), which this
 * opens in the browser. Servers that authenticate with shared Entra SSO
 * ('entra-id') or a static bearer token from an environment variable
 * ('static-bearer') never install the per-server OAuth provider, so they have
 * nothing per-server to clear or revoke. Shared by the `logout` CLI command and
 * this MCP tool.
 */

import open from 'open';
import { z } from 'zod';
import { Tool, ToolHandler } from '../../registry';
import { CatchErrors } from '../../utils';
import { RemoteMcpOauthProvider } from '../../gateway/auth/remote-mcp-oauth-provider';
import {
  getAvailableRemoteMCPServerIds,
  getRemoteMCPServer,
} from '../../remote-mcps/available-remote-servers';

/** Outcome of a remote-logout attempt, shared by the CLI command and MCP tool. */
export interface RemoteLogoutResult {
  ok: boolean;
  serverId: string;
  serverName?: string;
  /**
   * True if a per-server OAuth token or client registration existed locally and
   * was successfully removed (verified by re-reading the keyring after the
   * delete). False when there was nothing to clear.
   */
  clearedLocalToken: boolean;
  /**
   * True if a local credential existed but is still present after the delete —
   * i.e. the keyring delete silently failed (locked keychain / denied prompt).
   */
  localClearFailed?: boolean;
  /** Gateway credential-manager URL (absent for unknown or local servers). */
  credentialManagerUrl?: string;
  /** True if the browser was opened to the credential manager. */
  browserOpened: boolean;
  message: string;
}

/**
 * Appended whenever a gateway revoke is required. Revocation completes in the
 * browser, and an already-issued access token keeps working until it expires,
 * so logout is not instantaneous for an active session.
 */
export const LOGOUT_RESIDUAL_NOTE =
  'Revoke the credential in the opened page to finish logging out. ' +
  'Any active session keeps working until its access token expires.';

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

/**
 * Log out of one remote MCP server: clear the local per-server token, then open
 * the gateway's credential manager so the user can revoke the stored credential.
 *
 * @param server - Remote MCP server id (e.g. "aws-knowledge-mcp-server")
 */
export async function performRemoteLogout(server: string): Promise<RemoteLogoutResult> {
  const id = server.trim();
  const definition = getRemoteMCPServer(id);

  if (!definition) {
    const known = getAvailableRemoteMCPServerIds().sort().join(', ');
    return {
      ok: false,
      serverId: id,
      clearedLocalToken: false,
      browserOpened: false,
      message: `Unknown remote MCP server "${server}". Known servers: ${known}`,
    };
  }

  // Servers that never install the per-server OAuth provider: shared Entra SSO
  // ('entra-id', whose token lives in a different keyring) and env-var /
  // static-bearer auth. remote-mcp-client only wires RemoteMcpOauthProvider when
  // authType is neither, so there is nothing in qnsc-mcp-remote to clear and no
  // per-server gateway credential to revoke — say so plainly rather than opening
  // a credential-manager page for a credential that isn't there.
  if (definition.authType === 'entra-id' || definition.authType === 'static-bearer') {
    return {
      ok: true,
      serverId: id,
      serverName: definition.name,
      clearedLocalToken: false,
      browserOpened: false,
      message:
        definition.authType === 'entra-id'
          ? `${definition.name} authenticates with shared organization SSO (Entra), not a per-server credential, so there is no separate ${definition.name} credential to clear or revoke here.`
          : `${definition.name} authenticates with an environment variable, so there is no stored credential to clear or revoke.`,
    };
  }

  // Clear the per-server OAuth token stored locally, then re-read to confirm it
  // is actually gone. A keyring delete can silently fail (locked keychain or a
  // denied access prompt) and executeKeyringOp swallows the error, so a
  // pre-delete read alone would let us claim success when nothing was removed.
  const hadStoredCredentials = RemoteMcpOauthProvider.hasStoredCredentials(id);
  await RemoteMcpOauthProvider.clearStoredCredentials(id);
  const stillHasCredentials =
    hadStoredCredentials && RemoteMcpOauthProvider.hasStoredCredentials(id);
  const clearedLocalToken = hadStoredCredentials && !stillHasCredentials;
  const localClearFailed = hadStoredCredentials && stillHasCredentials;
  const clearFailedNote = localClearFailed
    ? `Warning: could not remove the locally stored token for ${definition.name} (the keyring may be locked or access was denied); it may still be present. `
    : '';

  let serverUrl: URL | undefined;
  try {
    serverUrl = new URL(definition.url);
  } catch {
    serverUrl = undefined;
  }

  // Local desktop servers (e.g. figma-dev on localhost) have no platform
  // gateway and therefore no server-side credential to revoke.
  if (!serverUrl || isLocalHostname(serverUrl.hostname)) {
    return {
      ok: true,
      serverId: id,
      serverName: definition.name,
      clearedLocalToken,
      localClearFailed,
      browserOpened: false,
      message:
        clearFailedNote +
        `${definition.name} is a local server with no platform gateway credential to revoke.` +
        (clearedLocalToken ? ' Cleared the local session token.' : ''),
    };
  }

  // The gateway (auth.<data-plane-host>) hosts the OIDC-protected credential
  // manager where per-server credentials are revoked. Open it in the browser.
  const credentialManagerUrl = `https://auth.${serverUrl.hostname}/oauth/v2/manage/credentials`;
  let browserOpened = false;
  try {
    await open(credentialManagerUrl);
    browserOpened = true;
  } catch {
    // Fall back to returning the URL for the user to open manually.
  }

  const openNote = browserOpened
    ? `Opened the credential manager to revoke ${definition.name}.`
    : `Could not open a browser automatically — open the credential manager to revoke ${definition.name}: ${credentialManagerUrl}`;

  return {
    ok: true,
    serverId: id,
    serverName: definition.name,
    clearedLocalToken,
    localClearFailed,
    credentialManagerUrl,
    browserOpened,
    message: `${clearFailedNote}${openNote} ${LOGOUT_RESIDUAL_NOTE}`,
  };
}

export const LogoutSchema = z.object({
  server: z
    .string()
    .describe(
      'The remote MCP server id to log out of (e.g. "aws-knowledge-mcp-server"), as listed by list-remote-mcps.',
    ),
});
export type LogoutParams = z.infer<typeof LogoutSchema>;

@Tool({
  id: 'logout',
  name: 'logout',
  description:
    'Log out of a single remote MCP server. Clears the locally-stored session token and opens the gateway credential manager (behind SSO) to revoke your saved credential for that server. ' +
    'Use when switching accounts or removing access. Revocation completes in the browser; an active session may persist until its access token expires.',
  category: 'Utility',
  parameters: LogoutSchema,
  version: '1.0.0',
  annotations: {
    title: 'Log Out of Remote MCP Server',
    destructiveHint: true,
    readOnlyHint: false,
  },
})
export class LogoutTool implements ToolHandler {
  @CatchErrors()
  async execute(args: LogoutParams): Promise<string> {
    const result = await performRemoteLogout(args.server);
    return JSON.stringify({
      success: result.ok,
      server: result.serverName ?? result.serverId,
      clearedLocalToken: result.clearedLocalToken,
      localClearFailed: result.localClearFailed ?? false,
      credentialManagerUrl: result.credentialManagerUrl,
      browserOpened: result.browserOpened,
      message: result.message,
    });
  }
}
