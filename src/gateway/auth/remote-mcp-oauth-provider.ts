import {
  AddClientAuthentication,
  OAuthClientProvider,
} from '@modelcontextprotocol/sdk/client/auth.js';
import {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { logDebug, logInfo, logWarn } from '../../services/logger';
import {
  getKeyringEntry,
  getRecoveryInstructions,
  isKeyringCorrupted,
  type KeyringEntry,
} from '../../services/auth/keyring-loader';
import { RemoteMCPServerConfig } from '../remote-mcp-client';

/**
 * Maximum number of retry attempts for keyring operations before giving up.
 */
const MAX_KEYRING_RETRIES = 2;

/**
 * Skew window (ms) for the RFC 7592 registration-liveness probe.
 *
 * reconcileRegistration() only probes the gateway when the stored registration
 * deadline is within this window (`now > expires_at - SKEW`). MUST be less than
 * the gateway's initial client lifetime (15 min) so a just-registered,
 * not-yet-tokened client does not probe before it can extend its own deadline
 * by issuing a token. See DCR_INVALIDATION_RECONCILIATION.md, Part B.
 */
const SKEW = 5 * 60 * 1000;

/**
 * Timeout (ms) for the registration-liveness probe.
 *
 * The probe runs on the critical connect path (before `client.connect()`), and
 * Bun/Node `fetch` has no default timeout. Without this bound, a gateway that
 * accepts the connection but never responds would hang `connect` forever — a
 * worse dead-end than the browser redirect this feature exists to prevent. On
 * timeout the abort throws into the existing catch (→ proceed best-effort), and
 * the same signal aborts a hanging `.json()` on the 200 branch.
 */
const PROBE_TIMEOUT_MS = 5000;

/**
 * Shape of the JSON metadata blob stored in the main token keyring entry when
 * a token is too large for a single credential-manager entry (Windows) and
 * gets split across `-chunk-N` sibling entries. Distinguishes "this is chunk
 * metadata" from "this is the token object itself" in `tokens()` /
 * `invalidateCredentials()` / `saveTokens()`, which all parse the same entry
 * without knowing in advance which shape it is.
 */
interface ChunkedTokenMetadata {
  chunked: true;
  chunkCount: number;
  totalLength?: number;
}

/**
 * RFC 7592 dynamic-client-registration extras that the SDK's
 * `OAuthClientInformationFullSchema.parse()` strips (they are undeclared
 * fields, so they never reach `saveClientInformation`). Captured out-of-band
 * from the raw DCR response body (see `createRegistrationCaptureFetch`) and
 * persisted in a sibling keyring entry (`${id}-registration`) next to the
 * `${id}-client` client-info blob.
 */
export interface RegistrationExtras {
  /** RFC 7592 bearer token authenticating registration-management requests. */
  registrationAccessToken: string;
  /** RFC 7592 registration-management URI (`{registration_endpoint}/{client_id}`). */
  registrationClientUri?: string;
  /**
   * Deadline signal `registration_expires_at` (Unix seconds).
   *
   * Private, non-standard DCR extension. The upstream platform gateway returned
   * this field on registration and on a 200 from the management endpoint, prefixed with
   * its own company initials. Renamed here to a neutral form. Nothing currently emits it
   * under either name: RFC 7591/7592 define no such field, so for a
   * standards-compliant server this stays undefined and the liveness probe falls back to
   * the registration URI. Kept rather than deleted because the surrounding deadline
   * handling is still wired for any remote server without an authType.
   */
  registrationExpiresAt?: number;
  /**
   * The registration endpoint the DCR POST was issued to (the request URL).
   * Kept so the liveness probe can fall back to `{endpoint}/{client_id}` when
   * `registrationClientUri` is absent from the response.
   */
  registrationEndpoint?: string;
}

/**
 * OAuth provider implementation for remote MCP servers.
 *
 * This class implements the `OAuthClientProvider` interface from the MCP SDK to handle
 * OAuth 2.1 authentication flows for remote MCP server connections. It manages:
 * - Storage and retrieval of OAuth tokens using the system keyring
 * - Storage and retrieval of OAuth client information
 * - PKCE (Proof Key for Code Exchange) code verifier management
 * - Authorization redirect handling
 *
 * Credentials are persisted securely in the system keyring under the service name
 * `qnsc-mcp-remote` with the remote server's ID as the account identifier.
 *
 * @implements {OAuthClientProvider}
 *
 * @example
 * ```typescript
 * const provider = new RemoteMcpOauthProvider(
 *   'http://localhost:3000/callback',
 *   { client_name: 'MCP Client' },
 *   remoteConfig,
 *   (url) => open(url.toString())
 * );
 * ```
 */
export class RemoteMcpOauthProvider implements OAuthClientProvider {
  /** PKCE code verifier for the current authorization flow */
  private _codeVerifier?: string;

  /** Cached OAuth tokens for the current session */
  private _tokens?: OAuthTokens;

  /** Cached OAuth client information */
  private _clientInformation?: OAuthClientInformationMixed;

  /**
   * True once `saveClientInformation()` has been called during this instance's
   * lifetime — i.e. this attempt performed a fresh DCR registration, rather
   * than reusing a cached (keyring) or static (config) client. See
   * `wasFreshlyRegistered()` below for how callers use this.
   */
  private _freshlyRegisteredThisSession = false;

  /** Tracks whether the user was redirected to the authorization URL */
  private _redirectInitiated = false;

  /**
   * Creates a new RemoteMcpOauthProvider instance.
   *
   * @param _redirectUrl - The OAuth redirect URL where the authorization server will send the user after authorization
   * @param _clientMetadata - OAuth client metadata including client name and other registration details
   * @param _remoteConfig - Configuration for the remote MCP server including its ID and optional pre-configured OAuth client information
   * @param onRedirect - Optional callback function invoked when the user needs to be redirected for authorization.
   *                     If not provided, defaults to logging the URL.
   * @param clientMetadataUrl - Optional URL where the client metadata document can be retrieved
   */
  constructor(
    protected readonly _redirectUrl: string | URL,
    protected readonly _clientMetadata: OAuthClientMetadata,
    protected readonly _remoteConfig: RemoteMCPServerConfig,
    onRedirect?: (url: URL, params?: Record<string, unknown>) => void,
    public readonly clientMetadataUrl?: string,
  ) {
    this._onRedirect =
      onRedirect ||
      ((url) => {
        logInfo(`Redirect to: ${url.toString()}`);
      });
    this._clientInformation = this._remoteConfig.oAuthClientInformation;
  }

  /**
   * Builds a throwaway provider for keyring-only credential management (the
   * `logout` command). invalidateCredentials / the keystore getters resolve
   * everything from `_remoteConfig.id`, so a minimal config is sufficient and
   * the redirect URL / client metadata go unused.
   *
   * @param serverId - The remote MCP server's `id` (its keyring account key)
   */
  private static forCredentialManagement(serverId: string): RemoteMcpOauthProvider {
    return new RemoteMcpOauthProvider(
      'http://localhost/callback',
      {
        client_name: 'QNSC Remote MCP Client',
        redirect_uris: ['http://localhost/callback'],
      },
      { id: serverId, name: serverId, url: '' },
    );
  }

  /**
   * Whether a single remote MCP server has OAuth credentials persisted in the
   * `qnsc-mcp-remote` keyring (either tokens or saved client registration).
   *
   * The `logout` command uses this to report honestly. Only servers that
   * authenticate with a static bearer token from an environment variable
   * ('static-bearer') or shared Entra SSO ('entra-id') skip this provider
   * entirely and write nothing here, so for those a false means there is
   * nothing local to clear. This is the
   * gateway OAuth *session* token, distinct from the vendor's sealed key that
   * the gateway holds server-side — a "sealed-key" server such as New Relic
   * (no authType) still signs in via OAuth and DOES store a session token here.
   *
   * @param serverId - The remote MCP server's `id`
   */
  static hasStoredCredentials(serverId: string): boolean {
    const provider = RemoteMcpOauthProvider.forCredentialManagement(serverId);
    const tokens = provider.executeKeyringOp(
      () => provider.keystoreEntry.getPassword(),
      'hasStoredCredentials:tokens',
    );
    const client = provider.executeKeyringOp(
      () => provider.clientKeystoreEntry.getPassword(),
      'hasStoredCredentials:client',
    );
    return Boolean(tokens || client);
  }

  /**
   * Clears all stored OAuth credentials for a single remote MCP server.
   *
   * Deletes the server's tokens, client registration info, and RFC 7592
   * registration extras (plus any chunked token entries) from the system
   * keyring under `qnsc-mcp-remote`. Backs the `logout` command: the next
   * connection to this server triggers a fresh authorization flow. A no-op for
   * servers with nothing stored (static / static-bearer / entra-id auth).
   *
   * @param serverId - The remote MCP server's `id` (its keyring account key)
   */
  static async clearStoredCredentials(serverId: string): Promise<void> {
    const provider = RemoteMcpOauthProvider.forCredentialManagement(serverId);
    await provider.invalidateCredentials('all');
  }

  /**
   * Callback function to handle OAuth authorization redirects.
   * @protected
   */
  protected _onRedirect: (url: URL, params?: Record<string, unknown>) => void;

  /**
   * Gets the OAuth redirect URL.
   * @returns The configured redirect URL for OAuth callbacks
   */
  get redirectUrl(): string | URL | undefined {
    return this._redirectUrl;
  }

  /**
   * Gets the OAuth client metadata.
   * @returns The client metadata used for OAuth client registration
   */
  get clientMetadata(): OAuthClientMetadata {
    return this._clientMetadata;
  }

  /**
   * Generates the OAuth state parameter.
   *
   * The state is derived from the remote MCP server's ID encoded in base64.
   * This allows the callback handler to identify which remote server the
   * authorization response belongs to.
   *
   * @returns Base64-encoded remote server ID to be used as OAuth state
   */
  state(): string | Promise<string> {
    return btoa(this._remoteConfig.id);
  }

  /**
   * Gets the keyring entry for storing OAuth tokens.
   *
   * @returns A KeyringEntry configured for the remote server's token storage
   * @private
   */
  private get keystoreEntry(): KeyringEntry {
    const EntryClass = getKeyringEntry();
    const entry = new EntryClass(`qnsc-mcp-remote`, this._remoteConfig.id);
    return entry;
  }

  /**
   * Gets the keyring entry for storing OAuth client information.
   *
   * Uses a separate keyring entry from tokens with `-client` suffix to store
   * client registration information separately.
   *
   * @returns A KeyringEntry configured for the remote server's client info storage
   * @private
   */
  private get clientKeystoreEntry(): KeyringEntry {
    const EntryClass = getKeyringEntry();
    const entry = new EntryClass(`qnsc-mcp-remote`, `${this._remoteConfig.id}-client`);
    return entry;
  }

  /**
   * Gets the keyring entry for storing RFC 7592 registration extras.
   *
   * A sibling to `clientKeystoreEntry` with a `-registration` suffix, holding
   * the DCR fields the SDK strips (registration access token, management URI,
   * and the out-of-band deadline). Kept separate from the `-client` blob so a
   * deadline refresh never rewrites (whole-object-replaces) the client info.
   *
   * @returns A KeyringEntry configured for the remote server's registration extras
   * @private
   */
  private get registrationKeystoreEntry(): KeyringEntry {
    const EntryClass = getKeyringEntry();
    const entry = new EntryClass(`qnsc-mcp-remote`, `${this._remoteConfig.id}-registration`);
    return entry;
  }

  /**
   * Execute a keyring operation with retry logic and corruption detection.
   * Returns null on failure instead of throwing, since the MCP SDK doesn't
   * expect keyring exceptions from this provider.
   *
   * @param operation - The keyring operation to execute
   * @param operationName - Name of the operation for logging
   * @returns The operation result, or null if the operation failed
   */
  private executeKeyringOp<T>(operation: () => T, operationName: string): T | null {
    for (let attempt = 0; attempt < MAX_KEYRING_RETRIES; attempt++) {
      try {
        return operation();
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logDebug(`${operationName} attempt ${attempt + 1}/${MAX_KEYRING_RETRIES} failed: ${msg}`);

        if (isKeyringCorrupted(error)) {
          logWarn(
            `Keyring corruption detected during ${operationName} for remote MCP ${this._remoteConfig.id}. ` +
              `Credentials may need to be re-created. If this persists, delete the corrupted entries:\n` +
              getRecoveryInstructions('qnsc-mcp-remote'),
          );
          return null;
        }
      }
    }

    logWarn(
      `${operationName} failed after ${MAX_KEYRING_RETRIES} retries for remote MCP ${this._remoteConfig.id}`,
    );
    return null;
  }

  /**
   * Retrieves the OAuth client information.
   *
   * First checks for in-memory cached information, then falls back to the keyring.
   * If the stored information is corrupted (invalid JSON) or the keyring is
   * inaccessible, it invalidates the credentials and returns undefined.
   *
   * @returns The OAuth client information if available, undefined otherwise
   */
  clientInformation(): OAuthClientInformationMixed | undefined {
    if (this._clientInformation) {
      logDebug(
        `Using cached client information for ${this._remoteConfig.id}: client_id=${this._clientInformation.client_id}`,
      );
      return this._clientInformation;
    }
    const clientInformation = this.executeKeyringOp(
      () => this.clientKeystoreEntry.getPassword(),
      'loadClientInformation',
    );
    if (clientInformation) {
      logDebug(
        `Loaded client information for remote MCP: ${this._remoteConfig.id} (${clientInformation.length} chars)`,
      );
      try {
        this._clientInformation = JSON.parse(clientInformation) as OAuthClientInformationMixed;
        logDebug(
          `🔑 Loaded stored OAuth client for ${this._remoteConfig.id}: client_id=${this._clientInformation.client_id}`,
        );
      } catch (e) {
        logWarn(
          `Corrupted client information in keyring for ${this._remoteConfig.id}, clearing`,
          e,
        );
        // clientInformation() is synchronous (dictated by OAuthClientProvider);
        // invalidateCredentials('client') never actually returns a pending
        // Promise in this implementation, so fire-and-forget is safe here.
        void this.invalidateCredentials('client');
        return undefined;
      }
    } else {
      logInfo(
        `No stored client information found for ${this._remoteConfig.id} (will need DCR or static config)`,
      );
    }
    return this._clientInformation;
  }

  /**
   * Saves OAuth client information to both memory and the system keyring.
   * If keyring write fails, the information is still cached in memory.
   *
   * @param clientInformation - The OAuth client information to persist
   */
  saveClientInformation(clientInformation: OAuthClientInformationMixed): void {
    logInfo(
      `💾 Saving OAuth client information for ${this._remoteConfig.id}: client_id=${clientInformation.client_id}`,
    );
    this._clientInformation = clientInformation;
    this._freshlyRegisteredThisSession = true;
    this.executeKeyringOp(
      () => this.clientKeystoreEntry.setPassword(JSON.stringify(this._clientInformation)),
      'saveClientInformation',
    );
  }

  /**
   * Whether the current client information was freshly registered via DCR
   * during this instance's lifetime, as opposed to loaded from the keyring
   * cache or provided as static config. Callers use this to decide whether
   * retrying a failed connection with invalidated credentials could plausibly
   * help (a fresh registration failing again points to a different problem).
   */
  wasFreshlyRegistered(): boolean {
    return this._freshlyRegisteredThisSession;
  }

  /**
   * Reads the stored RFC 7592 registration extras from the `-registration`
   * keyring entry.
   *
   * @returns The parsed extras, or undefined if none are stored (or the entry
   *   is unreadable / corrupted). Absence is the graceful-degradation signal:
   *   a client registered against a gateway without RFC 7592 support (or before
   *   this feature shipped) has no extras and must never probe.
   * @private
   */
  private readRegistrationExtras(): RegistrationExtras | undefined {
    const stored = this.executeKeyringOp(
      () => this.registrationKeystoreEntry.getPassword(),
      'loadRegistrationExtras',
    );
    if (!stored) {
      return undefined;
    }
    try {
      return JSON.parse(stored) as RegistrationExtras;
    } catch {
      logWarn(`Corrupted registration extras in keyring for ${this._remoteConfig.id}, ignoring`);
      return undefined;
    }
  }

  /**
   * Persists RFC 7592 registration extras to the `-registration` keyring entry.
   * @private
   */
  private writeRegistrationExtras(extras: RegistrationExtras): void {
    this.executeKeyringOp(
      () => this.registrationKeystoreEntry.setPassword(JSON.stringify(extras)),
      'saveRegistrationExtras',
    );
  }

  /**
   * Captures the RFC 7592 fields the MCP SDK strips from a DCR response.
   *
   * `OAuthClientInformationFullSchema.parse()` drops the undeclared
   * `registration_access_token`, `registration_client_uri`, and the private
   * `registration_expires_at` deadline before `saveClientInformation` ever
   * sees them, so `createRegistrationCaptureFetch` reads them from the raw
   * response body and hands them here. Stored in the sibling `-registration`
   * entry, separate from the client-info blob.
   *
   * Only invoked when the DCR response actually carried a
   * `registration_access_token` — a pre-7592 gateway therefore leaves no extras
   * stored, which is exactly the graceful-degradation gate `reconcileRegistration`
   * relies on.
   *
   * @param extras - The captured registration extras to persist
   */
  captureRegistrationExtras(extras: RegistrationExtras): void {
    if (!extras.registrationAccessToken) {
      return;
    }
    logDebug(
      `Captured RFC 7592 registration extras for ${this._remoteConfig.id} ` +
        `(hasUri=${!!extras.registrationClientUri}, expiresAt=${extras.registrationExpiresAt ?? 'none'})`,
    );
    this.writeRegistrationExtras(extras);
  }

  /**
   * Reconciles the stored DCR registration against the gateway BEFORE connecting,
   * so an expired/revoked registration is re-registered up front rather than
   * dead-ending the user in a front-channel browser redirect (RFC 6749
   * §4.1.2.1: the AS shows an in-browser error and never redirects back).
   *
   * MUST be called before the initial `client.connect(...)`, never on the
   * `finishAuth` retry — the SDK's code-exchange path throws "Existing OAuth
   * client information is required" if client info is cleared mid-exchange.
   *
   * Graceful-degradation and skew gates (any → no-op, today's behavior):
   * - statically-configured client (`config.oAuthClientInformation`) — never
   *   went through DCR, so there is no registration to reconcile and no
   *   fresher client_id re-registering could ever produce;
   * - no stored client info (SDK will register on connect anyway);
   * - no captured 7592 extras (pre-7592 gateway — never probe);
   * - no / zero deadline, or deadline still outside the {@link SKEW} window.
   *
   * Within the skew window it probes `GET {registration_client_uri}` (falling
   * back to `{registration_endpoint}/{client_id}`) with the registration access
   * token:
   * - 200 → refresh only the stored deadline (never touches client info);
   * - 401/404 → `invalidateCredentials('all')` so the SDK re-registers cleanly;
   * - network / other error → best-effort, keep existing info.
   */
  async reconcileRegistration(): Promise<void> {
    if (this._remoteConfig.oAuthClientInformation) {
      // Static config never went through DCR — there is no registration
      // (extras, deadline, management URI) to reconcile, and invalidating
      // here would just clear the one client_id this server can ever use.
      return;
    }

    const info = this.clientInformation();
    if (!info) {
      // No stored client — the SDK will perform DCR on connect.
      return;
    }

    const extras = this.readRegistrationExtras();
    if (!extras) {
      // No registration extra, invalidate client to ensure we have a valid one
      await this.invalidateCredentials('all');
      return;
    }

    const expiresAt = extras.registrationExpiresAt;
    if (!expiresAt || Date.now() < expiresAt * 1000 - SKEW) {
      // No deadline signal, or comfortably ahead of it — nothing to do.
      return;
    }

    // Resolve the management URI: prefer the stored one, else fall back to
    // {registration_endpoint}/{client_id}.
    let probeUrl = extras.registrationClientUri;
    if (!probeUrl && extras.registrationEndpoint && info.client_id) {
      probeUrl = `${extras.registrationEndpoint.replace(/\/+$/, '')}/${info.client_id}`;
    }
    if (!probeUrl) {
      return;
    }

    logDebug(`Probing registration liveness for ${this._remoteConfig.id} at ${probeUrl}`);

    try {
      const response = await fetch(probeUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${extras.registrationAccessToken}` },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });

      if (response.status === 200) {
        // Registration is live. Pick up the (possibly extended) deadline —
        // deadline only; never rewrite the client-info blob.
        try {
          const body = (await response.json()) as {
            registration_expires_at?: number;
          };
          const fresh = body?.registration_expires_at;
          if (typeof fresh === 'number' && fresh > 0) {
            this.writeRegistrationExtras({
              ...extras,
              registrationExpiresAt: fresh,
            });
            logDebug(`Refreshed registration deadline for ${this._remoteConfig.id} to ${fresh}`);
          }
        } catch (parseError) {
          const msg = parseError instanceof Error ? parseError.message : String(parseError);
          logDebug(`Registration probe 200 body unparseable for ${this._remoteConfig.id}: ${msg}`);
        }
        return;
      }

      if (response.status === 401 || response.status === 404) {
        logInfo(
          `Registration for ${this._remoteConfig.id} is no longer valid (HTTP ${response.status}); ` +
            `clearing credentials so a fresh registration is created before any browser redirect`,
        );
        await this.invalidateCredentials('all');
        return;
      }

      // Any other status: best-effort, proceed with existing credentials.
      logDebug(
        `Registration probe for ${this._remoteConfig.id} returned HTTP ${response.status}; ` +
          `proceeding with existing credentials`,
      );
    } catch (error) {
      // Network / transient error — can't reach the gateway to probe (and
      // couldn't reach it to re-register either). Proceed best-effort.
      const msg = error instanceof Error ? error.message : String(error);
      logDebug(
        `Registration probe failed for ${this._remoteConfig.id}, proceeding with existing credentials: ${msg}`,
      );
    }
  }

  /**
   * Retrieves the OAuth tokens.
   *
   * First checks for in-memory cached tokens, then falls back to the keyring.
   * Handles both regular storage and chunked storage (for large tokens on Windows).
   * If the stored tokens are corrupted (invalid JSON) or the keyring is
   * inaccessible, it invalidates the credentials and returns undefined.
   *
   * @returns The OAuth tokens if available, undefined otherwise
   */
  tokens(): OAuthTokens | undefined {
    if (this._tokens) {
      return this._tokens;
    }
    const storedData = this.executeKeyringOp(() => this.keystoreEntry.getPassword(), 'loadTokens');
    if (storedData) {
      try {
        // Try to parse as metadata first (chunked storage)
        const parsed: unknown = JSON.parse(storedData);

        if (
          parsed &&
          typeof parsed === 'object' &&
          (parsed as ChunkedTokenMetadata).chunked === true
        ) {
          // Reconstruct from chunks
          const chunkCount = (parsed as ChunkedTokenMetadata).chunkCount;
          const chunks: string[] = new Array<string>(chunkCount);
          const EntryClass = getKeyringEntry();

          for (let i = 0; i < chunkCount; i++) {
            const chunkEntry = new EntryClass(
              `qnsc-mcp-remote`,
              `${this._remoteConfig.id}-chunk-${i}`,
            );
            const chunk = this.executeKeyringOp(
              () => chunkEntry.getPassword(),
              `loadTokenChunk:${i}`,
            );
            if (!chunk) {
              logWarn(`Missing chunk ${i} for remote MCP: ${this._remoteConfig.id}`);
              // tokens() is synchronous (dictated by OAuthClientProvider);
              // invalidateCredentials('tokens') never actually returns a
              // pending Promise in this implementation.
              void this.invalidateCredentials('tokens');
              return undefined;
            }
            chunks[i] = chunk;
          }

          const reconstructed = chunks.join('');
          this._tokens = JSON.parse(reconstructed) as OAuthTokens;
          logDebug(
            `Loaded tokens from ${chunkCount} chunks for remote MCP: ${this._remoteConfig.id}`,
          );
        } else {
          // It's already a token object (not chunked metadata)
          this._tokens = parsed as OAuthTokens;
        }
      } catch (e) {
        logWarn(`Failed to parse tokens for remote MCP: ${this._remoteConfig.id}`, e);
        // See comment above: safe fire-and-forget from this sync method.
        void this.invalidateCredentials('tokens');
        return undefined;
      }
      return this._tokens;
    }
    return undefined;
  }

  /**
   * Saves OAuth tokens to both memory and the system keyring.
   * If keyring write fails, tokens are still cached in memory.
   *
   * On Windows, if the token data exceeds the 1200 character limit for credential manager,
   * it will be split into multiple chunks stored across separate credential entries.
   * The limit accounts for UTF-16 encoding overhead.
   *
   * @param tokens - The OAuth tokens to persist (access token, refresh token, etc.)
   */
  saveTokens(tokens: OAuthTokens): void | Promise<void> {
    logDebug(`Saving tokens for remote MCP: ${this._remoteConfig.id}`);
    this._tokens = tokens;
    const tokenString = JSON.stringify(tokens);

    // Windows Credential Manager has a limit of 2560 UTF-16 code units (1280 characters in UTF-16)
    // To be safe with UTF-16 encoding, we use 1200 characters per chunk
    const maxChunkSize = 1200;

    if (tokenString.length > maxChunkSize && process.platform === 'win32') {
      // Split into chunks
      const chunks: string[] = [];
      for (let i = 0; i < tokenString.length; i += maxChunkSize) {
        chunks.push(tokenString.slice(i, i + maxChunkSize));
      }

      const EntryClass = getKeyringEntry();

      // Clean up any existing chunks that may exceed the new chunk count
      try {
        const existingData = this.executeKeyringOp(
          () => this.keystoreEntry.getPassword(),
          'saveTokens:readExisting',
        );
        if (existingData) {
          const existingMeta = JSON.parse(existingData) as Partial<ChunkedTokenMetadata>;
          if (
            existingMeta?.chunked === true &&
            typeof existingMeta.chunkCount === 'number' &&
            existingMeta.chunkCount > chunks.length
          ) {
            for (let i = chunks.length; i < existingMeta.chunkCount; i++) {
              try {
                const staleChunkEntry = new EntryClass(
                  `qnsc-mcp-remote`,
                  `${this._remoteConfig.id}-chunk-${i}`,
                );
                staleChunkEntry.deletePassword();
              } catch {
                /* ignore cleanup errors */
              }
            }
          }
        }
      } catch {
        /* ignore parsing errors during cleanup */
      }

      // Store metadata about chunks in the main entry
      const metadata = {
        chunked: true,
        chunkCount: chunks.length,
        totalLength: tokenString.length,
      };
      this.executeKeyringOp(
        () => this.keystoreEntry.setPassword(JSON.stringify(metadata)),
        'saveTokens:metadata',
      );

      // Store each chunk in a separate credential entry
      for (let i = 0; i < chunks.length; i++) {
        const chunkEntry = new EntryClass(`qnsc-mcp-remote`, `${this._remoteConfig.id}-chunk-${i}`);
        this.executeKeyringOp(() => chunkEntry.setPassword(chunks[i]), `saveTokens:chunk-${i}`);
      }

      logDebug(
        `Tokens split into ${chunks.length} chunks for remote MCP: ${this._remoteConfig.id}`,
      );
    } else {
      // Store directly if small enough
      this.executeKeyringOp(() => this.keystoreEntry.setPassword(tokenString), 'saveTokens');
    }
  }

  /**
   * Whether the user was redirected to the authorization URL.
   *
   * @returns `true` if `redirectToAuthorization` was called, `false` otherwise
   */
  get redirectInitiated(): boolean {
    return this._redirectInitiated;
  }

  /**
   * Handles the redirect to the OAuth authorization URL.
   *
   * Invokes the configured `_onRedirect` callback with the authorization URL.
   * This typically opens a browser for the user to complete authentication.
   *
   * @param authorizationUrl - The OAuth authorization endpoint URL to redirect to
   */
  redirectToAuthorization(authorizationUrl: URL): void | Promise<void> {
    this._redirectInitiated = true;
    logInfo(
      `🌐 OAuth redirect initiated for ${this._remoteConfig.id}: ${authorizationUrl.host}${authorizationUrl.pathname}`,
    );
    this._onRedirect(authorizationUrl);
  }

  /**
   * Saves the PKCE code verifier for the current authorization flow.
   *
   * The code verifier is stored in memory only (not persisted to keyring)
   * as it's only needed for the duration of the authorization flow.
   *
   * @param codeVerifier - The PKCE code verifier string
   */
  saveCodeVerifier(codeVerifier: string): void | Promise<void> {
    this._codeVerifier = codeVerifier;
  }

  /**
   * Retrieves the PKCE code verifier for the current authorization flow.
   *
   * @returns The code verifier string
   * @throws {Error} If the code verifier has not been set
   */
  codeVerifier(): string | Promise<string> {
    if (!this._codeVerifier) {
      throw new Error('Code verifier not set');
    }
    return this._codeVerifier;
  }

  /**
   * Invalidates stored credentials based on the specified scope.
   *
   * Clears both in-memory cache and persisted keyring entries for the
   * specified credential types. Also cleans up any chunked token storage.
   *
   * @param scope - The scope of credentials to invalidate:
   *   - `'all'`: Clears tokens, client information (incl. RFC 7592 registration
   *     extras), and code verifier
   *   - `'client'`: Clears client information and its RFC 7592 registration extras
   *   - `'tokens'`: Clears only OAuth tokens
   *   - `'verifier'`: Clears only the PKCE code verifier
   */
  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier'): void | Promise<void> {
    logInfo(`🗑️ Invalidating credentials for ${this._remoteConfig.id} (scope: ${scope})`);
    if (scope === 'all' || scope === 'tokens') {
      this._tokens = undefined;

      // Check if tokens were stored in chunks and clean them up
      try {
        const storedData = this.executeKeyringOp(
          () => this.keystoreEntry.getPassword(),
          'invalidateCredentials:readTokens',
        );
        if (storedData) {
          const parsed = JSON.parse(storedData) as Partial<ChunkedTokenMetadata>;
          if (parsed && typeof parsed === 'object' && parsed.chunked === true) {
            const chunkCount = parsed.chunkCount ?? 0;
            const EntryClass = getKeyringEntry();

            // Delete all chunks
            for (let i = 0; i < chunkCount; i++) {
              try {
                const chunkEntry = new EntryClass(
                  `qnsc-mcp-remote`,
                  `${this._remoteConfig.id}-chunk-${i}`,
                );
                chunkEntry.deletePassword();
              } catch {
                // Ignore errors when deleting individual chunks
              }
            }
          }
        }
      } catch {
        // Ignore parsing errors during cleanup
      }

      this.executeKeyringOp(
        () => this.keystoreEntry.deletePassword(),
        'invalidateCredentials:deleteTokens',
      );
    }
    if (scope === 'all' || scope === 'client') {
      this._clientInformation = undefined;
      this.executeKeyringOp(
        () => this.clientKeystoreEntry.deletePassword(),
        'invalidateCredentials:deleteClient',
      );
      // Drop the RFC 7592 registration extras alongside the client info so a
      // re-register never reuses a stale registration access token / deadline.
      this.executeKeyringOp(
        () => this.registrationKeystoreEntry.deletePassword(),
        'invalidateCredentials:deleteRegistration',
      );
    }
    if (scope === 'all' || scope === 'verifier') {
      this._codeVerifier = undefined;
    }
  }

  /**
   * Optional method to add client authentication to token requests.
   *
   * If implemented, this function is called to add authentication credentials
   * (e.g., client_id, client_secret) to token endpoint requests.
   */
  addClientAuthentication?: AddClientAuthentication | undefined;

  /**
   * Optional method to prepare additional parameters for token requests.
   *
   * If implemented, this function is called before making token requests to
   * allow adding custom parameters such as scope restrictions.
   *
   * @param scope - Optional OAuth scope string
   * @returns URLSearchParams to merge into the token request, or undefined
   */
  prepareTokenRequest?(
    scope?: string,
  ): URLSearchParams | Promise<URLSearchParams | undefined> | undefined;
}
