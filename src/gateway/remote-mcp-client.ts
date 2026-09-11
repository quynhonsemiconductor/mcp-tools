/**
 * remote-mcp-client.ts - Client for connecting to remote MCP servers via HTTP streaming
 *
 * This module provides functionality to connect to remote MCP servers using
 * the MCP TypeScript SDK's StreamableHTTPClientTransport and discover their available tools.
 */
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPClientTransportOptions,
  StreamableHTTPError,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { Tool, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import open from 'open';
import { REMOTE_CATEGORY, ToolCategories, ToolConfig } from '../registry/types';
import { SERVICE_AUTH_MAP } from '../services/auth/entra-id/config';
import type { ServiceAuthConfig } from '../services/auth/entra-id/types';
import { logDebug, logError, logInfo, logWarn } from '../services/logger';
import { CALLBACK_TIMEOUT_MESSAGE, OAuthCallbackServer } from '../services/oauth/callback-server';
import { createToolId, getToolDelimiter } from '../services/tool-id-utils';
import { RemoteMcpOauthProvider } from './auth/remote-mcp-oauth-provider';
import {
  acceptsString,
  JsonSchema,
  jsonSchemaToZod,
  looksLikeJsonContainer,
} from './utils/schema-converter';

/**
 * URL query-parameter value shapes we actually substitute/serialize in
 * {@link RemoteMCPClient.buildUrl}: plain strings (env-var substituted),
 * numbers, and booleans. Real-world server configs never pass richer shapes
 * here — this replaces a blanket `any` that hid every downstream access as
 * unsafe.
 */
export type RemoteMCPUrlParameterValue = string | number | boolean;

/**
 * Auth type determines how the remote MCP client authenticates with the server.
 *
 * - 'static': Headers with environment variable substitution (default for legacy entries)
 * - 'static-bearer': Per-request Authorization header from SERVICE_AUTH_MAP, no OAuth
 *   provider, no platform JWT. Use for external partner servers with API key auth (e.g. Smartsheet).
 * - 'oauth': MCP SDK–managed OAuth 2.1 flow (via oAuthClientInformation)
 * - 'entra-id': Entra ID SSO — token obtained via EntraIdTokenManager
 */
export type RemoteAuthType = 'static' | 'static-bearer' | 'oauth' | 'entra-id';

/**
 * Delimiter used for remote MCP tool names
 * Format: serverName{REMOTE_TOOL_DELIMITER}toolName
 * @deprecated Use getToolDelimiter('remote') from tool-id-utils instead
 */
export const REMOTE_TOOL_DELIMITER = '__';
/**
 * @deprecated Use TOOL_PREFIXES.remote from tool-id-utils instead
 */
export const REMOTE_TOOL_ID_PREFIX = 'remote-';

/**
 * Configuration for a remote MCP server
 */
export interface RemoteMCPServerConfig {
  id: string;
  name: string;
  url: string;
  parameters?: Record<string, RemoteMCPUrlParameterValue>;
  headers?: Record<string, string>;
  enabled?: boolean;
  oAuthClientInformation?: OAuthClientInformationMixed;
  oAuthCallbackUrl?: string | URL;
  /**
   * Auth type for this server.
   *
   * - 'static' (default): headers with env-var substitution
   * - 'static-bearer': per-request Authorization header from SERVICE_AUTH_MAP
   * - 'oauth': MCP SDK–managed OAuth 2.1 flow
   * - 'entra-id': Entra ID SSO via EntraIdTokenManager
   */
  authType?: RemoteAuthType;
}

export interface RemoteMCPInfo {
  name: string;
  tools: RemoteMCPTool[];
}

/**
 * Remote MCP tool information
 */
export interface RemoteMCPTool {
  name: string;
  description: string;
  parameters: JsonSchema; // JSON schema for parameters (from tool.inputSchema in MCP spec)
  serverId: string; // ID of the remote server
  serverName: string; // Name of the remote server
  annotations: ToolAnnotations;
}

/**
 * OAuth challenge information passed through from remote server
 */
export interface OAuthChallenge {
  challengeUrl: string;
  state?: string;
  scopes?: string[];
  provider?: string;
}

/**
 * MCP client connection info
 */
interface MCPClientConnection {
  client: Client;
  transport: StreamableHTTPClientTransport;
  config: RemoteMCPServerConfig;
}

/**
 * Create a custom fetch wrapper that attaches fresh Entra ID auth headers on every request.
 *
 * This solves the mid-session token expiry problem: instead of attaching static auth headers
 * once at connection time, this wrapper calls `attachAuthHeaders()` before each request to
 * get a current JWT. The token manager handles proactive refresh (15 min before expiry) and
 * will transparently re-authenticate if the stored token has expired.
 *
 * On a 401 response, the wrapper attempts a non-interactive token refresh and retries once.
 * If non-interactive refresh fails (e.g. no refresh token), it returns the original 401 so
 * the connection-level retry in `connectViaHttp()` can trigger an interactive browser login.
 * This two-layer strategy avoids multiple browser popups for a single auth failure.
 *
 * @param baseUrl - The remote server URL (used by attachAuthHeaders for service API key lookup)
 * @param staticHeaders - Non-auth headers (e.g. x-splunk-token from env var substitution) to merge
 * @returns A FetchLike function suitable for StreamableHTTPClientTransportOptions.fetch
 */
export function createEntraIdFetch(
  baseUrl: string,
  staticHeaders: Record<string, string>,
  serviceId?: string,
): (url: string | URL, init?: RequestInit) => Promise<Response> {
  return async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const { attachAuthHeaders } = await import('../services/auth/middleware/platform-auth');

    // Get fresh auth headers (JWT + service API keys) for this request
    const authHeaders = await attachAuthHeaders(baseUrl, { skipUrlCheck: true, serviceId });

    // The MCP SDK may inject its own lowercase `authorization` header via init?.headers
    // (e.g. from an OAuth provider or default transport behavior). When we have a static
    // Authorization header (vendor API key like "Token <PD_KEY>"), the SDK's empty/wrong
    // `authorization` would silently clobber it due to case-insensitive header merging.
    // Strip the SDK's authorization header so the static vendor header survives.
    const initHeaders = { ...headersToRecord(init?.headers) };
    if (
      staticHeaders['Authorization'] &&
      ('authorization' in initHeaders || 'Authorization' in initHeaders)
    ) {
      delete initHeaders['authorization'];
      delete initHeaders['Authorization'];
      logDebug('Stripped SDK-injected authorization header to preserve static vendor auth header');
    }

    const mergedHeaders: Record<string, string> = {
      ...staticHeaders,
      ...(authHeaders ?? {}),
      ...initHeaders,
    };

    logDebug(`createEntraIdFetch mergedKeys=[${Object.keys(mergedHeaders).join(', ')}]`);

    const response = await fetch(url, {
      ...init,
      headers: mergedHeaders,
    });

    // On 401, attempt non-interactive token refresh and retry once.
    // Non-interactive avoids opening a browser popup — if the refresh token is
    // still valid the retry succeeds silently. If not, we return the 401 so the
    // connection-level handler in connectViaHttp() can trigger interactive login.
    if (response.status === 401) {
      logWarn(`Received 401 during active session, attempting non-interactive token refresh`);
      try {
        const freshHeaders = await attachAuthHeaders(baseUrl, {
          forceRefresh: true,
          skipUrlCheck: true,
          interactive: false,
          serviceId,
        });

        // Reuse the already-stripped initHeaders to avoid SDK authorization clobbering
        const retryMergedHeaders: Record<string, string> = {
          ...staticHeaders,
          ...(freshHeaders ?? {}),
          ...initHeaders,
        };

        return fetch(url, {
          ...init,
          headers: retryMergedHeaders,
        });
      } catch (refreshError) {
        // Non-interactive refresh failed (no refresh token or expired) —
        // return the original 401 so the caller can trigger interactive auth
        logWarn(
          'Non-interactive token refresh failed, returning original 401 response:',
          refreshError,
        );
        return response;
      }
    }

    return response;
  };
}

/**
 * Create a fetch wrapper for servers using static API key auth.
 *
 * Reads the API key from `process.env` on every request (so a key set after
 * process start is picked up). If the key is missing or empty (including
 * whitespace-only), throws so the connection fails fast — a broken-placeholder
 * request never goes over the wire.
 *
 * Unlike `createEntraIdFetch`, this wrapper:
 *   - Does NOT attach `x-gateway-auth` (this is for external partners, not the the platform).
 *   - Does NOT retry on 401 (no OAuth refresh path; a 401 here means the user's
 *     key is invalid and should surface directly).
 *
 * Uses the optional `valueTemplate` on the service entry to format the
 * header value (e.g. `'Bearer ${value}'`). Defaults to the raw env var value.
 *
 * @param serviceId - Key into `authMap`, matching the server id
 * @returns FetchLike suitable for StreamableHTTPClientTransportOptions.fetch
 * @throws if `serviceId` is not present in `authMap`
 */
export function createStaticBearerFetch(
  serviceId: string,
  authMap: Record<string, ServiceAuthConfig> = SERVICE_AUTH_MAP,
): (url: string | URL, init?: RequestInit) => Promise<Response> {
  const serviceConfig = authMap[serviceId];
  if (!serviceConfig) {
    throw new Error(`No SERVICE_AUTH_MAP entry for serviceId '${serviceId}'`);
  }

  return async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const apiKey = process.env[serviceConfig.envVar]?.trim();
    if (!apiKey) {
      throw new Error(
        `Cannot authenticate to ${serviceId}: ${serviceConfig.envVar} is not set. ` +
          `Set it in your Claude Desktop config or shell environment.`,
      );
    }

    // Use the function form of String.prototype.replace to treat apiKey as
    // a literal — string-form replacement interprets $&, $', $`, and $$ as
    // special patterns, which would corrupt keys containing those sequences.
    const headerValue = (serviceConfig.valueTemplate ?? '${value}').replace(
      '${value}',
      () => apiKey,
    );

    const initHeaders = { ...headersToRecord(init?.headers) };
    // Strip any SDK-injected lowercase authorization so our static header wins,
    // but only when we're about to overwrite it (i.e. this service uses Authorization).
    // Mirrors createEntraIdFetch's gating at lines 137-142.
    if (
      serviceConfig.headerName === 'Authorization' ||
      serviceConfig.headerName === 'authorization'
    ) {
      delete initHeaders['authorization'];
      delete initHeaders['Authorization'];
    }

    return fetch(url, {
      ...init,
      headers: {
        ...initHeaders,
        [serviceConfig.headerName]: headerValue,
      },
    });
  };
}

/**
 * Create a pass-through fetch wrapper that captures the RFC 7592 registration
 * fields the MCP SDK's schema strips from a DCR response.
 *
 * On the OAuth path the SDK performs Dynamic Client Registration (RFC 7591) by
 * POSTing to the discovered `registration_endpoint`, then parses the response
 * with `OAuthClientInformationFullSchema` — a `.strip()`-ed schema that DROPS
 * the undeclared `registration_access_token`, `registration_client_uri`, and
 * the private `registration_expires_at` deadline before the provider's
 * `saveClientInformation` ever sees them. This wrapper reads those fields out
 * of the raw response body first and hands them to the provider, which persists
 * them in a sibling keyring entry for the pre-connect liveness probe
 * (`reconcileRegistration`).
 *
 * IMPORTANT — this wrapper is installed as `transportOptions.fetch`, so it sees
 * ALL transport traffic, not just DCR: every MCP protocol POST (`initialize`,
 * `tools/call`, …) flows through it too. It must never buffer or delay that
 * protocol traffic. Two gates keep it clear of the hot path:
 *   1. **Skip the MCP protocol endpoint.** All protocol POSTs go to
 *      `mcpEndpointUrl` (the server `baseUrl`); DCR/token/register POSTs go to
 *      the discovered *authorization-server* endpoints (a different URL). When
 *      the request targets the MCP endpoint, return immediately without
 *      touching the body.
 *   2. **Content-Type gate.** Only attempt `.json()` on an
 *      `application/json` response. MCP Streamable HTTP can answer a POST with
 *      `text/event-stream`; `.json()` on such a clone would not resolve until
 *      the stream closes, hanging `return response` — so SSE is skipped.
 *
 * Detection (after the gates): the DCR call is a POST whose 2xx JSON body
 * carries both a `client_id` and a `registration_access_token`. (Token-endpoint
 * POSTs return `access_token`/`refresh_token` with no top-level `client_id`, so
 * this does not false-positive on them.) The request URL is then the discovered
 * registration endpoint — captured for the probe's fallback URI. The capture is
 * wrapped in try/catch and clones the response before reading, so a parse
 * failure or the single-use body never disturbs the SDK's own read.
 *
 * @param provider - The OAuth provider that will persist the captured extras
 * @param mcpEndpointUrl - The MCP protocol endpoint (server `baseUrl`); protocol
 *   POSTs to this URL are passed straight through untouched
 * @returns A FetchLike function suitable for StreamableHTTPClientTransportOptions.fetch
 */
/**
 * Shape of a successful RFC 7591 Dynamic Client Registration response body,
 * limited to the fields {@link createRegistrationCaptureFetch} reads out of
 * it. Real DCR responses carry additional standard fields (`client_secret`,
 * `redirect_uris`, …) that this wrapper never touches — those are left to
 * the SDK's own schema, so they aren't modeled here.
 */
interface DcrResponseBody {
  client_id?: string;
  registration_access_token?: string;
  registration_client_uri?: string;
  registration_expires_at?: number;
}

export function createRegistrationCaptureFetch(
  provider: RemoteMcpOauthProvider,
  mcpEndpointUrl: string | URL,
): (url: string | URL, init?: RequestInit) => Promise<Response> {
  return async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const response = await fetch(url, init);

    try {
      const method = (init?.method ?? 'GET').toUpperCase();

      // Never inspect protocol traffic to the MCP endpoint — that is the
      // universal request path (initialize, tools/call, SSE streams).
      if (method === 'POST' && response.ok && !isSameEndpoint(url, mcpEndpointUrl)) {
        // Only JSON bodies can be a DCR response. Skipping non-JSON (notably
        // text/event-stream) avoids a .json() that would block until the
        // stream closes.
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          // Clone before reading — the body is single-use and the SDK's
          // registerClient reads the original response after us.
          const body = (await response.clone().json()) as DcrResponseBody;
          if (
            body &&
            typeof body.client_id === 'string' &&
            typeof body.registration_access_token === 'string'
          ) {
            provider.captureRegistrationExtras({
              registrationAccessToken: body.registration_access_token,
              registrationClientUri: body.registration_client_uri,
              registrationExpiresAt: body.registration_expires_at,
              registrationEndpoint: typeof url === 'string' ? url : url.toString(),
            });
          }
        }
      }
    } catch (error) {
      // Never let capture break the real DCR call — the SDK still gets the
      // untouched original response below.
      logDebug(
        `Registration extras capture skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return response;
  };
}

/**
 * Tolerant same-endpoint comparison for the registration capture fetch: are
 * `a` and `b` the same URL (by normalized `href`)? If either fails to parse,
 * returns false so the caller falls through to the content-type + body-shape
 * check (a protocol JSON response simply won't match the DCR shape).
 */
function isSameEndpoint(a: string | URL, b: string | URL): boolean {
  try {
    return new URL(a.toString()).href === new URL(b.toString()).href;
  } catch {
    return false;
  }
}

/**
 * Convert various header representations to a plain Record.
 *
 * @param headers - Headers from RequestInit (may be Headers, string[][], or Record)
 * @returns Plain key-value record of headers
 */
/**
 * Reads a numeric `.code` off an arbitrary thrown value, if present. Errors
 * from the MCP SDK / underlying transport carry this in different shapes
 * (real `StreamableHTTPError`, a structurally-similar duplicate class from
 * bundler duplication, or an ad-hoc object) — this narrows `unknown` down to
 * just the one field callers need without resorting to `any`.
 */
function getErrorNumericCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as Record<string, unknown>).code;
  return typeof code === 'number' ? code : undefined;
}

/**
 * Detects the various shapes a 401 error can take across the MCP SDK,
 * Node's fetch, and ad-hoc thrown objects: a numeric `.code`/`.statusCode`/
 * `.status` of 401, or a `.message` mentioning "HTTP 401" / the raw
 * `"Unauthorized"` JSON body some non-OAuth servers return.
 */
function hasHttp401Shape(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as Record<string, unknown>;
  if (
    candidate.code === 401 ||
    candidate.statusCode === 401 ||
    candidate.status === 401
  ) {
    return true;
  }
  const message = typeof candidate.message === 'string' ? candidate.message : undefined;
  return message?.includes('HTTP 401') || message?.includes('"Unauthorized"') || false;
}

function headersToRecord(headers: RequestInit['headers'] | undefined): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const record: Record<string, string> = {};
    headers.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }
  if (Array.isArray(headers)) {
    const record: Record<string, string> = {};
    for (const [key, value] of headers) {
      record[key] = value;
    }
    return record;
  }
  return headers as Record<string, string>;
}

/**
 * A single content item within a {@link RemoteToolResult}. Modeled loosely —
 * `type` as a plain string and `text` as optional, plus an index signature —
 * rather than reproducing the SDK's full per-`type` content union (text /
 * image / audio / resource / resource_link), since every shape this method
 * actually constructs or forwards carries these two fields.
 */
export interface RemoteToolResultContentItem {
  type: string;
  text?: string;
  [key: string]: unknown;
}

/**
 * Result of {@link RemoteMCPClient.executeRemoteTool}: either the remote
 * server's own tool-call result (forwarded from the MCP SDK, minus the
 * stripped `structuredContent` — see where it's stripped below) or one of
 * this method's own structured error shapes (session-expiry / no-connection
 * / execution failure). Both carry `content`/`isError`, which is what
 * callers actually rely on.
 */
export interface RemoteToolResult {
  // Optional: the SDK's CallToolResult also supports a legacy `toolResult`
  // shape (CompatibilityCallToolResultSchema) with no `content` array.
  content?: RemoteToolResultContentItem[];
  isError?: boolean;
  success?: boolean;
  error?: string;
  timestamp?: string;
  [key: string]: unknown;
}

/**
 * Client for connecting to and managing remote MCP servers using HTTP streaming
 */
export class RemoteMCPClient {
  /**
   * Static-bearer services, keyed by server id.
   *
   * Injectable because the shipped map is empty: the one service that used it
   * was removed with the gateway-routed servers. Passing a map keeps the
   * mechanism testable without re-registering the config module, which would
   * leak across test files.
   */
  private readonly authMap: Record<string, ServiceAuthConfig>;
  private connections: Map<string, MCPClientConnection> = new Map();
  private tools: Map<string, RemoteMCPTool[]> = new Map();
  private connectionStatus: Map<string, 'connected' | 'disconnected' | 'error'> = new Map();
  private reconnectPromises: Map<string, Promise<void>> = new Map();

  /**
   * @param authMap - Static-bearer service definitions; defaults to the shipped map
   */
  constructor(authMap: Record<string, ServiceAuthConfig> = SERVICE_AUTH_MAP) {
    this.authMap = authMap;
  }
  private disposed = false;

  /**
   * Connect to a remote MCP server using HTTP streaming
   */
  public async connectToServer(config: RemoteMCPServerConfig): Promise<void> {
    if (!config.enabled) {
      logInfo(`Remote MCP server ${config.name} is disabled, skipping`);
      this.connectionStatus.set(config.name, 'disconnected');
      return;
    }

    try {
      await this.connectViaHttp(config);
      // connectViaHttp may bail out early (e.g. missing env var for static-bearer),
      // setting status to 'disconnected' without storing a connection. Only run
      // discoverTools when a connection was actually established.
      if (this.connections.has(config.id)) {
        await this.discoverTools(config.id);
      }
    } catch (error: unknown) {
      const errorDetail = error instanceof Error ? error.message : String(error);
      const errorCause = error instanceof Error ? error.cause : undefined;
      logError(
        `Failed to connect to remote MCP server ${config.id}: ${errorDetail}`,
        errorCause ?? error,
      );
      this.connectionStatus.set(config.id, 'error');
    }
  }

  // Not async — open()'s rejection is handled inline via .catch, so there is
  // no await expression needed. Keeping this synchronous also means the
  // OAuth redirect callback (which cannot itself be async) can call it
  // without producing a floating promise.
  private openBrowser(url: string): void {
    logInfo(`🌐 Opening browser for authorization: ${url}`);
    void open(url).catch((error: unknown) => {
      logError(`Failed to open browser: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  /**
   * Connect to a remote MCP server via HTTP streaming
   */
  private async connectViaHttp(
    config: RemoteMCPServerConfig,
    isRetryAfterCallbackTimeout = false,
  ): Promise<void> {
    logInfo(`🔌 Connecting to remote MCP server: ${config.name} via HTTP streaming`);

    // Create MCP client with HTTP streaming transport
    const baseUrl = this.buildUrl(config.url, config.parameters || {});

    // static-bearer: external partner servers using a static API key in the
    // Authorization header. Check the env var up front; bail out cleanly if
    // missing so we don't send a broken Authorization placeholder that would
    // trigger an OAuth DCR fallback on the partner side. See issue #1148.
    if (config.authType === 'static-bearer') {
      const serviceConfig = this.authMap[config.id];
      if (!serviceConfig) {
        throw new Error(
          `Server ${config.id} has authType 'static-bearer' but no static-bearer service entry`,
        );
      }
      const apiKey = process.env[serviceConfig.envVar]?.trim();
      if (!apiKey) {
        logWarn(
          `Skipping remote MCP server ${config.name}: ${serviceConfig.envVar} is not set. ` +
            `Set it in your Claude Desktop config or shell environment to enable this server.`,
        );
        this.connectionStatus.set(config.id, 'disconnected');
        return;
      }
    }

    const clientMetadata: OAuthClientMetadata = {
      client_name: 'QNSC Remote MCP Client',
      redirect_uris: [config.oAuthCallbackUrl?.toString() || OAuthCallbackServer.REDIRECT_URI],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
    };

    const authProvider = new RemoteMcpOauthProvider(
      config.oAuthCallbackUrl || OAuthCallbackServer.REDIRECT_URI,
      clientMetadata,
      config,
      (redirectUrl: URL) => {
        logInfo(`📌 OAuth redirect handler called - Opening browser to: ${redirectUrl.toString()}`);
        this.openBrowser(redirectUrl.toString());
      },
    );

    // Prepare transport options with authentication headers.
    // For Entra ID and static-bearer auth, skip the OAuth authProvider — we
    // manage auth via headers. Setting authProvider would cause the MCP SDK to
    // intercept 401 responses and try to parse them as OAuth errors, which fails
    // when the server returns a non-OAuth body like {"message":"Unauthorized"}.
    const transportOptions: StreamableHTTPClientTransportOptions = {};
    if (config.authType !== 'entra-id' && config.authType !== 'static-bearer') {
      transportOptions.authProvider = authProvider;
      // Capture the RFC 7592 registration extras the SDK's schema strips from
      // the DCR response (registration access token / management URI / deadline)
      // so reconcileRegistration can probe registration liveness before connect.
      // Pass baseUrl so protocol POSTs to the MCP endpoint are never inspected.
      transportOptions.fetch = createRegistrationCaptureFetch(authProvider, baseUrl);
    }

    if (config.headers) {
      const processedHeaders = this.processHeaders(config.headers);
      transportOptions.requestInit = {
        headers: processedHeaders,
      };
    }

    // static-bearer: install per-request fetch wrapper that attaches the
    // Authorization header from SERVICE_AUTH_MAP. No platform JWT, no 401 retry.
    if (config.authType === 'static-bearer') {
      logDebug(`Setting up static-bearer auth fetch for ${config.name}`);
      transportOptions.fetch = createStaticBearerFetch(config.id, this.authMap);
    }

    // Entra ID SSO: use a custom fetch wrapper for per-request token refresh (T021, T039).
    // Instead of attaching static auth headers at connection time, we wrap the global
    // fetch so that every outgoing request gets fresh Entra ID + service API key headers.
    // This ensures tokens are automatically refreshed mid-session when they expire.
    if (config.authType === 'entra-id') {
      logDebug(`Setting up per-request Entra ID auth fetch for ${config.name}`);
      const staticHeaders = (transportOptions.requestInit?.headers ?? {}) as Record<string, string>;
      transportOptions.fetch = createEntraIdFetch(baseUrl, staticHeaders, config.id);
    }

    let transport = new StreamableHTTPClientTransport(new URL(baseUrl), transportOptions);

    const client = new Client({
      name: `qnsc-mcp-client-${config.id}`,
      version: '1.0.0',
    });

    try {
      // Connect to the remote server
      logInfo(`Connecting to remote MCP server at ${baseUrl}`);
      logInfo(
        `Auth state for ${config.id}: hasTokens=${!!authProvider.tokens()}, hasClientInfo=${!!authProvider.clientInformation()}, hasStaticClientInfo=${!!config.oAuthClientInformation}`,
      );
      // OAuth path only: reconcile a possibly-expired/revoked DCR registration
      // BEFORE connecting, so a dead registration is re-registered up front
      // instead of dead-ending the user in a front-channel browser redirect.
      // Must run before connect — never on the finishAuth retry (the SDK's
      // code-exchange path can't recover once client info is cleared).
      if (config.authType !== 'entra-id' && config.authType !== 'static-bearer') {
        await authProvider.reconcileRegistration();
      }
      await client.connect(transport);
    } catch (error) {
      // Detect 401 errors across different error shapes
      const is401 = error instanceof UnauthorizedError || hasHttp401Shape(error);

      // The SDK throws UnauthorizedError when auth() returns 'REDIRECT' (browser opened).
      // However, auth() may also throw other errors (e.g., DCR failure) AFTER
      // the browser redirect was initiated. In both cases, we should wait for the
      // OAuth callback to complete.
      const isUnauthorized = error instanceof UnauthorizedError;
      const isAuthRedirectInProgress = authProvider.redirectInitiated;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logInfo(
        `Connection error for ${config.id}: type=${error?.constructor?.name}, ` +
          `isUnauthorized=${isUnauthorized}, redirectInitiated=${isAuthRedirectInProgress}, ` +
          `message=${errorMessage}`,
      );

      // Entra ID 401 retry: force token refresh and rebuild transport (T038)
      if (config.authType === 'entra-id' && is401) {
        logWarn(
          `Received 401 from ${config.name} with Entra ID auth, forcing token refresh and retrying`,
        );
        // Sanitize error message before logging — may contain credential fragments (FR-024)
        const { sanitizeForLogging } = await import('../services/auth/credential-redaction');
        logDebug(`401 error details: ${sanitizeForLogging(errorMessage)}`);

        // Force-refresh the token in the token manager so the custom fetch uses new creds
        const { attachAuthHeaders } = await import('../services/auth/middleware/platform-auth');
        await attachAuthHeaders(baseUrl, {
          forceRefresh: true,
          skipUrlCheck: true,
          serviceId: config.id,
        });

        // Rebuild transport — the custom fetch will pick up the refreshed token
        transport = new StreamableHTTPClientTransport(new URL(baseUrl), transportOptions);
        await client.connect(transport);
      } else if (isUnauthorized || isAuthRedirectInProgress) {
        if (!isUnauthorized) {
          logInfo(
            `OAuth redirect was initiated for ${config.id}, waiting for callback despite error: ${errorMessage}`,
          );
        }

        const callbackPromise = OAuthCallbackServer.waitForCallback(config.id);
        logInfo(`⏳ Waiting for OAuth callback for ${config.id}...`);

        let authCode: string;
        try {
          authCode = await callbackPromise;
        } catch (callbackError) {
          const callbackErrorMessage =
            callbackError instanceof Error ? callbackError.message : String(callbackError);

          // The callback never arrived (timeout, denied consent, or another
          // OAuth error — we can't tell which from here). Usually the user
          // gave up, but this is also exactly what a stale cached client_id
          // looks like: the authorization server rejects it on its own domain
          // and never redirects back at all (root-caused via local repro of
          // the #1206/#1212 migration that was reverted as #1229 for Slack/New
          // Relic auth failures). See maybeRetryWithFreshClient for the guard
          // rationale and isRetryAfterCallbackTimeout's one-retry bound.
          const retry = this.maybeRetryWithFreshClient(
            config,
            authProvider,
            isRetryAfterCallbackTimeout,
            callbackErrorMessage,
          );
          if (retry) return retry;
          logWarn(`OAuth callback failed for ${config.id}: ${callbackErrorMessage}`);
          throw new Error(
            `OAuth authentication failed for remote MCP server ${config.id}: ${callbackErrorMessage}. ` +
              `Ensure the server supports OAuth discovery or has oAuthClientInformation configured.`,
            { cause: callbackError },
          );
        }

        logInfo(`🔑 Authorization code received for ${config.id}, finishing auth...`);
        await transport.finishAuth(authCode);

        // We have to replace the transport after finishing auth
        transport = new StreamableHTTPClientTransport(new URL(baseUrl), transportOptions);

        // Retry connection after completing OAuth flow
        logInfo(`🔄 Retrying connection to ${config.id} after OAuth flow...`);
        await client.connect(transport);
      } else if (is401) {
        // Non-OAuth 401 — the server returned an auth error that the SDK could
        // not parse as a standard OAuth error (e.g. {"message":"Unauthorized"}).
        // Wrap it in a clearer message instead of exposing the raw Zod parse error.
        throw new Error(
          `Authentication failed for ${config.name} (HTTP 401). ` +
            `Check that the required credentials or environment variables are configured correctly.`,
        );
      } else {
        // Auth flow failed before redirect — possibly stale credentials from a
        // previous version or DCR client info that is no longer valid.
        // Clear cached credentials and retry once before giving up.
        logWarn(
          `OAuth failed for ${config.id} before redirect (${error?.constructor?.name}: ${errorMessage}). ` +
            `Clearing cached credentials and retrying...`,
        );

        // Await 'all' scope: the retry immediately below re-reads credentials
        // via reconcileRegistration/the SDK's own auth() path, so clearing
        // must actually finish first (unlike the 'client'/'tokens' scopes
        // elsewhere in this codebase, which are genuinely fire-and-forget).
        await authProvider.invalidateCredentials('all');

        try {
          // Create a fresh transport for the retry
          transport = new StreamableHTTPClientTransport(new URL(baseUrl), transportOptions);

          logInfo(`🔄 Retrying connection to ${config.id} with cleared credentials...`);
          await client.connect(transport);

          // If we get here with an UnauthorizedError or redirect, handle the OAuth flow
        } catch (retryError) {
          const isRetryUnauthorized = retryError instanceof UnauthorizedError;
          const isRetryRedirect = authProvider.redirectInitiated;
          const retryMessage =
            retryError instanceof Error ? retryError.message : String(retryError);

          logInfo(
            `Retry error for ${config.id}: type=${retryError?.constructor?.name}, ` +
              `isUnauthorized=${isRetryUnauthorized}, redirectInitiated=${isRetryRedirect}, ` +
              `message=${retryMessage}`,
          );

          if (isRetryUnauthorized || isRetryRedirect) {
            if (!isRetryUnauthorized) {
              logInfo(
                `OAuth redirect was initiated for ${config.id} on retry, waiting for callback despite error: ${retryMessage}`,
              );
            }

            const callbackPromise = OAuthCallbackServer.waitForCallback(config.id);
            logInfo(`⏳ Waiting for OAuth callback for ${config.id} (retry)...`);

            // Same stale-cached-client guard as the callback wait above — see
            // maybeRetryWithFreshClient for the rationale. Reached via a
            // different path (initial connect failed non-auth first, then
            // this retry threw UnauthorizedError).
            let authCode: string;
            try {
              authCode = await callbackPromise;
            } catch (callbackError) {
              const callbackErrorMessage =
                callbackError instanceof Error ? callbackError.message : String(callbackError);
              const retry = this.maybeRetryWithFreshClient(
                config,
                authProvider,
                isRetryAfterCallbackTimeout,
                callbackErrorMessage,
                ' on retry',
              );
              if (retry) return retry;
              logWarn(`OAuth callback failed for ${config.id} on retry: ${callbackErrorMessage}`);
              throw new Error(
                `OAuth authentication failed for remote MCP server ${config.id}: ${callbackErrorMessage}. ` +
                  `Ensure the server supports OAuth discovery or has oAuthClientInformation configured.`,
                { cause: callbackError },
              );
            }

            logInfo(`🔑 Authorization code received for ${config.id}, finishing auth (retry)...`);
            await transport.finishAuth(authCode);

            transport = new StreamableHTTPClientTransport(new URL(baseUrl), transportOptions);

            logInfo(`🔄 Retrying connection to ${config.id} after OAuth flow (retry)...`);
            await client.connect(transport);
          } else {
            // Both the original and retry attempts failed without triggering OAuth redirect
            throw new Error(
              `OAuth authentication failed for remote MCP server ${config.id}: ${retryMessage}. ` +
                `Original error: ${errorMessage}. ` +
                `Ensure the server supports OAuth discovery or has oAuthClientInformation configured.`,
              { cause: retryError },
            );
          }
        }
      }
    }

    // Store the connection
    this.connections.set(config.id, {
      client,
      transport,
      config,
    });
    const serverVersion = client.getServerVersion();

    if (config.name !== serverVersion?.name) {
      logDebug(
        `Note: Configured server name (${config.name}) differs from server-reported name (${serverVersion?.name})`,
      );
    }

    this.connectionStatus.set(config.id, 'connected');
    logInfo(
      `✅ Connected to remote MCP server: ${serverVersion?.name} (${serverVersion?.version})`,
    );
  }

  /**
   * Shared guard for connectViaHttp's two OAuth-callback-timeout call sites.
   * The callback never arriving is usually the user giving up, but it's also
   * exactly what a stale cached client_id looks like: the authorization
   * server rejects it on its own domain and never redirects back at all
   * (root-caused via local repro of the #1206/#1212 migration reverted as
   * #1229 for Slack/New Relic auth failures). Retrying only makes sense when
   * there's a cached client that DCR could actually replace, so this returns
   * null (meaning: give up instead) when any of:
   * - `callbackErrorMessage` isn't the callback server's timeout message —
   *   an explicit OAuth denial or malformed callback rejects with a
   *   different message (see callback-server.ts's `/callback` route) and
   *   means the user (or the server) explicitly said no; retrying would
   *   just waste another browser popup on the same answer, not recover from
   *   a stale client_id.
   * - `isRetryAfterCallbackTimeout` — already a retry; bounds this to
   *   exactly one attempt regardless, so a persistently-failing server can't
   *   loop forever.
   * - `config.oAuthClientInformation` is set — a statically-configured
   *   server (e.g. newrelic/slack); re-registering can't produce a
   *   different client_id there.
   * - `authProvider.wasFreshlyRegistered()` — the client was already
   *   freshly registered this attempt; retrying the same fresh client won't
   *   fix a different underlying problem.
   *
   * Otherwise, invalidates the cached client (and its tokens — a client_id
   * stale enough to be silently rejected on its own domain almost certainly
   * minted tokens that are equally unusable; the SDK's own auth() flow only
   * reaches this interactive-redirect branch after confirming stored tokens
   * are absent or already failed to refresh, so there's no still-valid-
   * tokens case here to preserve) and returns the promise for a fresh
   * `connectViaHttp` retry.
   *
   * @param logSuffix - Distinguishes which call site logged the retry (e.g.
   *   ' on retry' for the pre-redirect-failure retry path).
   */
  private maybeRetryWithFreshClient(
    config: RemoteMCPServerConfig,
    authProvider: RemoteMcpOauthProvider,
    isRetryAfterCallbackTimeout: boolean,
    callbackErrorMessage: string,
    logSuffix = '',
  ): Promise<void> | null {
    if (
      callbackErrorMessage !== CALLBACK_TIMEOUT_MESSAGE ||
      isRetryAfterCallbackTimeout ||
      config.oAuthClientInformation ||
      authProvider.wasFreshlyRegistered()
    ) {
      return null;
    }
    logWarn(
      `OAuth callback failed for ${config.id}${logSuffix} (${callbackErrorMessage}) using cached client info — ` +
        `invalidating and retrying once with fresh registration...`,
    );
    // maybeRetryWithFreshClient is intentionally synchronous (its `null`
    // sentinel return lets callers branch before any promise exists), so it
    // can't simply `await` invalidateCredentials(). Instead, sequence the
    // (possibly-pending) invalidation ahead of the connect retry via
    // Promise.resolve().then — this still guarantees invalidation completes
    // before connectViaHttp runs, without floating the promise.
    return Promise.resolve(authProvider.invalidateCredentials('all')).then(() =>
      this.connectViaHttp(config, true),
    );
  }

  /**
   * Detect whether an error indicates the remote session has expired or been terminated.
   * Per the MCP Streamable HTTP session management spec, when the server responds with
   * HTTP 404 for an unknown session ID, the client MUST start a new session.
   */
  private isSessionExpired(error: unknown): boolean {
    if (error instanceof StreamableHTTPError && error.code === 404) {
      return true;
    }
    // Structural check: the error may not be an instanceof StreamableHTTPError
    // (e.g., due to bundler duplication when building with `bun build:binary`)
    // but still carry a numeric .code property. Verify constructor name or message
    // prefix to avoid false-positives on unrelated errors (e.g., McpError with
    // an application-defined JSON-RPC code that happens to be 404).
    if (
      getErrorNumericCode(error) === 404 &&
      error instanceof Error &&
      (error.constructor?.name === 'StreamableHTTPError' ||
        error.message?.startsWith('Streamable HTTP error'))
    ) {
      return true;
    }
    // Fallback: match the error message text for errors that are NOT StreamableHTTPErrors.
    // This catches cases where session expiry surfaces as a plain Error (e.g., from
    // middleware, custom transports, or server frameworks that don't use StreamableHTTPError).
    // Match "Session not found" with word boundaries to avoid false-positives on unrelated
    // errors. This does NOT match on -32001 directly since that JSON-RPC error code is
    // also used by the SDK for generic request timeouts (ErrorCode.RequestTimeout).
    // NOTE: This could false-positive on a non-transport Error whose message happens to
    // contain "Session not found" — the cost is one unnecessary reconnection attempt,
    // which is acceptable vs. the cost of a false-negative (user stuck with a dead session).
    // Skip this fallback for StreamableHTTPErrors with a known non-404 code — those are
    // legitimate HTTP errors (e.g., 500) whose body may happen to contain the phrase.
    const numericCode = getErrorNumericCode(error);
    if (
      numericCode !== undefined &&
      numericCode !== 404 &&
      error instanceof Error &&
      (error.constructor?.name === 'StreamableHTTPError' ||
        error.message?.startsWith('Streamable HTTP error'))
    ) {
      return false;
    }
    const message = error instanceof Error ? error.message : String(error);
    return /\bSession not found\b/i.test(message);
  }

  /**
   * Re-initialize a connection to a remote server after session expiry.
   * Tears down the old transport and creates a fresh session (connectViaHttp creates
   * a new Client and transport, which sends an initialize request to the server).
   */
  private async reconnectServer(serverId: string): Promise<void> {
    const existing = this.connections.get(serverId);
    if (!existing) {
      throw new Error(`No connection found for server ${serverId} to reconnect`);
    }

    const { config, transport: oldTransport } = existing;

    logInfo(`Re-initializing connection to ${config.name} after session expiry`);

    // Tear down the old connection
    try {
      await oldTransport.close();
    } catch (closeError) {
      logWarn(`Transport cleanup failed for ${serverId} during session reconnection:`, closeError);
    }
    this.connections.delete(serverId);
    this.tools.delete(serverId);

    // Guard: if disconnect() was called while we were tearing down the old
    // connection, do not establish a new one — it would leak.
    if (this.disposed) {
      throw new Error(`Client has been disconnected, aborting reconnection to ${serverId}`);
    }

    // Establish a fresh connection (new transport, new InitializeRequest, no session ID)
    try {
      await this.connectViaHttp(config);

      // Re-check after the async connect — disconnect() may have been called while
      // connectViaHttp was awaiting the server handshake.
      if (this.disposed) {
        // Clean up the connection that connectViaHttp just stored
        const freshConn = this.connections.get(serverId);
        if (freshConn) {
          try {
            await freshConn.transport.close();
          } catch {
            /* best-effort */
          }
          this.connections.delete(serverId);
        }
        throw new Error(`Client has been disconnected, aborting reconnection to ${serverId}`);
      }

      // Mirror connectToServer's guard: if the static-bearer bail-out fired in
      // connectViaHttp (env var missing), no connection was established and
      // discoverTools would throw "No connection found", flipping status from
      // the intentional 'disconnected' to 'error'. Leave the disconnected status
      // intact and return — there's no session to discover tools on.
      if (!this.connections.has(serverId)) {
        logInfo(
          `Skipping tool discovery for ${serverId}: no connection established by reconnect (likely missing required env var)`,
        );
        return;
      }

      await this.discoverTools(serverId);
    } catch (error) {
      this.connectionStatus.set(serverId, 'error');
      throw error;
    }

    logInfo(`Successfully re-initialized connection to ${config.name}`);
  }

  /**
   * Discover tools from a connected remote server.
   * @param serverId The server ID used as the connection key (matches config.id)
   */
  private async discoverTools(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      throw new Error(`No connection found for server ${serverId}`);
    }

    try {
      logDebug(`Discovering tools from remote MCP server: ${serverId}`);

      // Use the MCP client to list available tools
      const toolsResponse = await connection.client.listTools();

      if (toolsResponse.tools && toolsResponse.tools.length > 0) {
        this.handleToolsResponse(serverId, toolsResponse.tools);
      } else {
        logInfo(`No tools found on remote MCP server: ${serverId}`);
        // Still create an empty entry to track that we tried
        this.tools.set(serverId, []);
      }
    } catch (error) {
      logError(`Failed to discover tools from ${serverId}:`, error);
      // Re-throw so connectToServer knows tool discovery failed.
      // Without this, the server appears "connected" but has zero tools available.
      throw error;
    }
  }

  /**
   * Handle tools response from remote server
   */
  private handleToolsResponse(serverName: string, tools: Tool[]): void {
    const remoteMCPTools: RemoteMCPTool[] = tools.map((tool) => ({
      name: tool.name,
      annotations: tool.annotations || {},
      description: tool.description || '',
      // The SDK's own Tool['inputSchema'] type only guarantees the top-level
      // JSON-Schema envelope (`type`, `properties?`, `required?`) and types
      // each property value as bare `object` — it doesn't model nested
      // schema fields (`anyOf`, `$ref`, `enum`, …) the way JsonSchema does.
      // The runtime value IS a JSON Schema document (from the remote
      // server's tools/list response); this cast reflects that real shape.
      parameters: tool.inputSchema as JsonSchema,
      serverId: this.createServerId(serverName),
      serverName,
    }));

    this.tools.set(serverName, remoteMCPTools);
    logInfo(`📦 Discovered ${remoteMCPTools.length} tools from remote MCP server: ${serverName}`);
  }

  /**
   * Execute a tool on a remote server using MCP protocol
   */
  public async executeRemoteTool(
    serverName: string,
    toolName: string,
    // `parameters` arrives as `unknown` because callers implement
    // ToolExecuteFunction's loosely-typed `args: any` (registry/types.ts)
    // with a stricter `unknown` — but real MCP tool call arguments are
    // always object-shaped (or absent) per the SDK's CallToolRequest schema.
    parameters: unknown,
    isRetry = false,
  ): Promise<RemoteToolResult> {
    let connection = this.connections.get(serverName);
    if (!connection) {
      // If a reconnection is in progress for this server, wait for it to complete
      // before returning "no connection" — the connection may reappear momentarily.
      const pendingReconnect = this.reconnectPromises.get(serverName);
      if (pendingReconnect) {
        try {
          await pendingReconnect;
          connection = this.connections.get(serverName);
        } catch {
          // Reconnection failed — fall through to the error below
        }
      }
      if (!connection) {
        return {
          success: false,
          error: `No connection to remote MCP server: ${serverName}`,
          content: [
            {
              type: 'text',
              text: `Error executing ${toolName}: no connection to ${serverName} (server may be reconnecting)`,
            },
          ],
          isError: true,
          timestamp: new Date().toISOString(),
        };
      }
    }

    // Coerce any parameter values that are JSON strings into objects/arrays.
    // Some MCP clients (e.g. Claude.ai) serialize untyped parameters as JSON
    // strings instead of objects when the schema lacks an explicit type.
    // Pass the tool's input schema so we only coerce parameters that are NOT
    // explicitly typed as "string" — avoiding false positives on legitimate strings.
    //
    // NOTE: On the normal SDK request path this is now defense-in-depth: the
    // registered schema (see createRemoteToolConfig -> jsonSchemaToZod with
    // coerceTopLevelJsonStrings) already parses stringified top-level params
    // BEFORE validation, so `parameters` here are usually already coerced (this
    // call is then a no-op). It is retained to cover any path that reaches
    // executeRemoteTool without going through SDK schema validation.
    const toolDef = this.tools.get(serverName)?.find((t) => t.name === toolName);
    const inputSchema = toolDef?.parameters;
    // Narrow the unknown `parameters` to the object-or-absent shape
    // coerceJsonStringParameters (and the SDK's own CallToolRequest schema)
    // actually accept — see the `parameters` doc comment above. A non-object,
    // non-null/undefined `parameters` isn't a shape the MCP spec allows for
    // tool call arguments; treat it the same as "absent" rather than forcing
    // it through as a malformed argument.
    const coercedParameters =
      parameters && typeof parameters === 'object'
        ? coerceJsonStringParameters(parameters as Record<string, unknown>, inputSchema)
        : undefined;

    try {
      logDebug(
        `Executing remote tool ${toolName} on ${serverName} with parameters:`,
        coercedParameters,
      );

      // Use the MCP client to call the tool
      const rawResult = await connection.client.callTool({
        name: toolName,
        arguments: coercedParameters,
      });

      logDebug(`Remote tool execution result:`, rawResult);

      // Strip structuredContent — some servers include it but the MCP spec does
      // not guarantee its shape, and forwarding it can confuse downstream consumers.
      const { structuredContent, ...result } = rawResult;
      // Discarded — the MCP spec doesn't guarantee structuredContent's shape,
      // and forwarding it can confuse downstream consumers (see comment above).
      void structuredContent;
      // Return the result content in a standardized format
      return result;
    } catch (error) {
      // Session expired (404 or equivalent) — re-initialize the connection and retry once
      if (!isRetry && this.isSessionExpired(error)) {
        logWarn(`Session expired for ${serverName}, re-initializing connection and retrying`);

        // Reconnect (deduplicate concurrent reconnection via shared promise)
        try {
          if (!this.reconnectPromises.has(serverName)) {
            const promise = this.reconnectServer(serverName).finally(() => {
              this.reconnectPromises.delete(serverName);
            });
            this.reconnectPromises.set(serverName, promise);
          }
          await this.reconnectPromises.get(serverName)!;
        } catch (reconnectError) {
          logError(`Failed to re-establish session for ${serverName}:`, reconnectError);
          return {
            success: false,
            error:
              reconnectError instanceof Error ? reconnectError.message : String(reconnectError),
            content: [
              {
                type: 'text',
                text: `Error executing ${toolName}: session expired and reconnection failed — ${reconnectError instanceof Error ? reconnectError.message : String(reconnectError)}`,
              },
            ],
            isError: true,
            timestamp: new Date().toISOString(),
          };
        }

        // Retry on the fresh session (recursive call with isRetry=true prevents infinite loop)
        return this.executeRemoteTool(serverName, toolName, parameters, true);
      }

      // Retry also hit session expiry — the server cannot maintain sessions
      if (isRetry && this.isSessionExpired(error)) {
        logError(
          `Tool ${toolName} failed on ${serverName}: session expired again immediately after reconnection`,
          error,
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          content: [
            {
              type: 'text',
              text: `Error executing ${toolName}: session expired again immediately after reconnection — the remote server may be unable to maintain sessions — ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          timestamp: new Date().toISOString(),
        };
      }

      logError(`Failed to execute tool ${toolName} on ${serverName}:`, error);

      // Return error result in standardized format
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        content: [
          {
            type: 'text',
            text: `Error executing ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Process headers with environment variable substitution
   */
  private processHeaders(headers: Record<string, string>): Record<string, string> {
    const processed: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      // Substitute environment variables of the form ${VAR_NAME}
      processed[key] = value.replace(/\$\{([^}]+)\}/g, (match: string, varName: string) => {
        const envValue = process.env[varName];
        if (envValue === undefined) {
          logError(`Environment variable ${varName} not found, using placeholder`);
          return match; // Keep original placeholder if env var not found
        }
        return envValue;
      });
    }

    return processed;
  }

  /**
   * Build URL with query parameters
   */
  private buildUrl(baseUrl: string, parameters: Record<string, RemoteMCPUrlParameterValue>): string {
    const url = new URL(baseUrl);

    // Process parameters with environment variable substitution
    for (const [key, value] of Object.entries(parameters)) {
      let processedValue: RemoteMCPUrlParameterValue = value;

      if (typeof value === 'string') {
        processedValue = value.replace(/\$\{([^}]+)\}/g, (match: string, varName: string) => {
          const envValue = process.env[varName];
          if (envValue === undefined) {
            logError(`Environment variable ${varName} not found in parameter ${key}`);
            return match;
          }
          return envValue;
        });
      }

      url.searchParams.set(key, processedValue.toString());
    }

    return url.toString();
  }

  /**
   * Create a unique server ID
   */
  private createServerId(serverName: string): string {
    return serverName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }

  /**
   * Get all tools from all connected remote servers
   */
  public getAllRemoteTools(): RemoteMCPInfo[] {
    return Array.from(this.tools).map(([name, tools]) => ({ name, tools }));
  }

  /**
   * Get tools from a specific remote server
   */
  public getToolsFromServer(serverName: string): RemoteMCPTool[] {
    return this.tools.get(serverName) || [];
  }

  /**
   * Disconnect from all remote servers
   */
  public async disconnect(): Promise<void> {
    this.disposed = true;
    const pending = [...this.reconnectPromises.values()];
    this.reconnectPromises.clear();
    await Promise.allSettled(pending);

    for (const [serverName, connection] of this.connections) {
      try {
        // Close the transport connection
        await connection.transport.close();
        this.connectionStatus.set(serverName, 'disconnected');
        logDebug(`Disconnected from remote MCP server: ${serverName}`);
      } catch (error) {
        logError(`Error disconnecting from server ${serverName}:`, error);
      }
    }

    this.connections.clear();
    this.tools.clear();
  }

  /**
   * Get connection status for all servers
   */
  public getConnectionStatus(): Record<string, 'connected' | 'disconnected' | 'error'> {
    const status: Record<string, 'connected' | 'disconnected' | 'error'> = {};

    // Include all servers with an active connection
    for (const serverName of this.connections.keys()) {
      status[serverName] = this.connectionStatus.get(serverName) || 'disconnected';
    }

    // Include servers in error/disconnected state even if the connection was torn down
    for (const [serverName, state] of this.connectionStatus) {
      if (!(serverName in status)) {
        status[serverName] = state;
      }
    }

    return status;
  }
}

/**
 * Coerce parameter values that are JSON-encoded strings into their parsed
 * equivalents.  Some MCP clients (notably Claude.ai) serialize parameters as
 * JSON strings when the tool schema omits an explicit `type` (i.e. the
 * parameter is typed as `any`).  The remote server then rejects the string
 * with "not of type object".  This function detects such cases and parses
 * the strings so the remote server receives proper objects/arrays.
 *
 * Only top-level parameter values are coerced; nested values within
 * objects/arrays are left as-is.
 *
 * When an `inputSchema` is provided, parameters whose schema can accept a
 * string (literal/array/union/$ref string, or string enum) are never coerced —
 * this prevents transforming legitimate string values that happen to contain
 * valid JSON. Shares the `acceptsString` predicate with the pre-validation
 * coercion in schema-converter so both paths skip the same shapes.
 *
 * If `parameters` is null/undefined or not an object, it is returned as-is
 * (defensive guard for runtime safety).
 */
// Overload documents the defensive null/undefined early-return below;
// `unknown` deliberately isn't accepted for `parameters` itself — see
// executeRemoteTool, the one caller that receives untyped input, for how it
// narrows before calling in.
export function coerceJsonStringParameters(
  parameters: null | undefined,
  inputSchema?: JsonSchema,
): null | undefined;
export function coerceJsonStringParameters(
  parameters: Record<string, unknown>,
  inputSchema?: JsonSchema,
): Record<string, unknown>;
export function coerceJsonStringParameters(
  parameters: Record<string, unknown> | null | undefined,
  inputSchema?: JsonSchema,
): Record<string, unknown> | null | undefined {
  if (!parameters || typeof parameters !== 'object') {
    return parameters;
  }

  const schemaProperties = inputSchema?.properties;

  const coerced: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parameters)) {
    // Skip coercion if the schema says this parameter can be a string
    const propSchema = schemaProperties?.[key];
    if (propSchema && inputSchema && acceptsString(propSchema, inputSchema)) {
      coerced[key] = value;
      continue;
    }

    if (looksLikeJsonContainer(value)) {
      try {
        const parsed: unknown = JSON.parse(value);
        logDebug(`Coerced parameter "${key}" from JSON string to ${typeof parsed}`);
        coerced[key] = parsed;
      } catch (error) {
        logWarn(
          `Parameter "${key}" looks like JSON but failed to parse — keeping original string. Error: ${error instanceof Error ? error.message : String(error)}`,
        );
        coerced[key] = value;
      }
    } else {
      coerced[key] = value;
    }
  }
  return coerced;
}

/**
 * Create a tool configuration from a remote MCP tool
 */
export function createRemoteToolConfig(remoteTool: RemoteMCPTool): ToolConfig {
  // Create a unique tool ID using centralized utility
  const toolId = createToolId('remote', remoteTool.serverId, remoteTool.name);

  // Convert JSON schema to Zod schema.
  // coerceTopLevelJsonStrings wraps each non-string top-level property in a
  // z.preprocess() so a stringified object/array arg (sent by some clients, e.g.
  // Claude.ai / Claude Code — see PagerDuty query_model, issue #1263) is parsed
  // BEFORE the MCP SDK validates the registered schema. Without this the SDK
  // rejects the string (-32602 … expected object, received string) before the
  // in-handler coercion below can run.
  const parametersSchema = jsonSchemaToZod(
    remoteTool.parameters || { type: 'object', properties: {} },
    { coerceTopLevelJsonStrings: true },
  );

  // Determine category based on server name and tool name
  const category = categorizeRemoteTool(remoteTool);

  const delimiter = getToolDelimiter('remote');
  return {
    id: toolId,
    name: `${remoteTool.serverName}${delimiter}${remoteTool.name}`,
    description: remoteTool.description,
    category: category,
    parameters: parametersSchema,
    includeByDefault: true, // Remote tools are opt-in by configuration
    annotations: remoteTool.annotations || {},
    provider: 'remote',
  };
}

/**
 * Categorize a remote tool based on server name and tool functionality.
 * Remote tools use the 'Remote' category to distinguish them from local
 * tools of the same domain (e.g., local 'Sonar' vs remote 'Remote').
 * This separation is important for the remote policy system which
 * suppresses local categories via excludeCategories without affecting
 * the corresponding remote tools.
 */
export function categorizeRemoteTool(_remoteTool: RemoteMCPTool): ToolCategories {
  return REMOTE_CATEGORY;
}
