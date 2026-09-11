/**
 * Generic OAuth handler for local OAuth flow.
 * Manages the OAuth 2.0 flow with PKCE support for secure authentication.
 *
 * This is a provider-agnostic base that can be extended for specific OAuth providers.
 */

import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import { URL, URLSearchParams } from 'node:url';
import open from 'open';
import { logDebug, logError, logInfo, logWarn } from '../logger';
import type {
  GenericOAuthTokenResponse,
  GetAuthUrlResult,
  OAuthProviderConfig,
  OAuthResult,
  StoredToken,
} from './types';
import { OAuthError } from './types';

/** Length in bytes for cryptographically random state/key generation */
export const RANDOM_BYTES_LENGTH = 32;

/** Timeout for token exchange and refresh HTTP requests in milliseconds. */
const TOKEN_FETCH_TIMEOUT_MS = 10_000;

/** Maximum number of concurrent pending OAuth states before cleanup */
const MAX_PENDING_STATES = 10;

/**
 * Pending OAuth state storage with PKCE support.
 * @internal
 */
interface PendingAuth {
  /** Timestamp when the auth flow was initiated */
  createdAt: number;
  /** PKCE code verifier for secure token exchange */
  codeVerifier: string;
  /** Promise resolver for the OAuth result */
  resolve: (result: OAuthResult) => void;
}

/** Map of pending OAuth states to their auth data */
const pendingStates = new Map<string, PendingAuth>();

/**
 * Generate a cryptographically random code verifier for PKCE (Proof Key for Code Exchange).
 *
 * The code verifier is a high-entropy cryptographic random string used in the OAuth 2.0
 * PKCE extension to prevent authorization code interception attacks.
 *
 * @returns A 43-character URL-safe base64-encoded random string (256 bits of entropy)
 * @see https://datatracker.ietf.org/doc/html/rfc7636#section-4.1
 */
function generateCodeVerifier(): string {
  const buffer = crypto.randomBytes(RANDOM_BYTES_LENGTH);
  return buffer.toString('base64url');
}

/**
 * Generate a code challenge from a code verifier using the S256 method.
 *
 * The code challenge is a SHA-256 hash of the code verifier, base64url-encoded.
 *
 * @param verifier - The PKCE code verifier to hash
 * @returns Base64url-encoded SHA-256 hash of the verifier
 * @see https://datatracker.ietf.org/doc/html/rfc7636#section-4.2
 */
function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return hash.toString('base64url');
}

/**
 * Generic OAuth handler for local OAuth flow.
 * Subclasses should implement provider-specific logic.
 */
export abstract class OAuthHandler {
  private server: http.Server | null = null;
  protected config: OAuthProviderConfig;
  /** Promise-based mutex to prevent concurrent OAuth flows */
  private flowPromise: Promise<OAuthResult> | null = null;

  /**
   * Create a new OAuthHandler.
   *
   * @param config - OAuth provider configuration
   */
  constructor(config: OAuthProviderConfig) {
    this.config = config;
  }

  /**
   * Get the ordered list of ports to try for the callback server.
   *
   * Override in subclasses to provide fallback ports when the primary port
   * is occupied. The base implementation returns only the configured port.
   *
   * @returns Array of port numbers to try in order
   */
  protected getPortsToTry(): number[] {
    return [this.config.port];
  }

  /**
   * Check if OAuth is configured.
   */
  isConfigured(): boolean {
    return !!(this.config.clientId && this.config.clientSecret);
  }

  /**
   * Get the callback path for this OAuth flow.
   * Uses config.callbackPath if provided, otherwise defaults to '/callback'.
   * Override in subclasses to customize the callback path.
   */
  protected getCallbackPath(): string {
    return this.config.callbackPath || '/callback';
  }

  /**
   * Whether to include `client_secret` in token exchange and refresh requests.
   * Override to return `false` for public clients (e.g., Entra ID per RFC 8252).
   *
   * @returns `true` to include client_secret (default), `false` to omit it
   */
  protected shouldSendClientSecret(): boolean {
    return true;
  }

  /**
   * Extra parameters to include in the token exchange request body.
   * Override to add provider-specific params (e.g., explicit `grant_type`).
   *
   * @returns Record of additional key-value pairs to merge into the request body
   */
  protected getExtraExchangeParams(): Record<string, string> {
    return {};
  }

  /**
   * Extra parameters to include in the token refresh request body.
   * Override to add provider-specific params (e.g., `scope`).
   *
   * @returns Record of additional key-value pairs to merge into the request body
   */
  protected getExtraRefreshParams(): Record<string, string> {
    return {};
  }

  /**
   * Sanitize an error message before including it in an OAuthError.
   * Override to apply credential redaction or other sanitization.
   *
   * @param message - The raw error message
   * @returns The sanitized message safe for logging/display
   */
  protected sanitizeErrorMessage(message: string): string {
    return message;
  }

  /**
   * Get the redirect URI for this OAuth flow.
   */
  protected getRedirectUri(): string {
    return `http://localhost:${this.config.port}${this.getCallbackPath()}`;
  }

  /**
   * Check if a port already has a listener by attempting a TCP connection.
   *
   * Bun 1.3.11+ enables SO_REUSEPORT on macOS, which allows multiple processes
   * to bind to the same port without EADDRINUSE. This pre-check detects existing
   * listeners so the port-retry logic can skip occupied ports.
   */
  protected isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.createConnection({ port, host: 'localhost' });
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => {
        resolve(false);
      });
      socket.setTimeout(1000, () => {
        socket.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Start the local HTTP callback server, trying fallback ports if needed.
   *
   * Iterates through ports returned by {@link getPortsToTry}. If the primary
   * port is already in use or fails with EADDRINUSE and fallback ports are
   * available, tries the next port. Updates `config.port` to reflect the
   * actual bound port so that `getRedirectUri()` returns the correct value.
   */
  private async startServer(): Promise<void> {
    if (this.server) return;

    const portsToTry = this.getPortsToTry();
    let lastError: Error | null = null;

    for (let i = 0; i < portsToTry.length; i++) {
      const port = portsToTry[i];

      // Pre-check: detect existing listeners even when SO_REUSEPORT is enabled
      if (await this.isPortInUse(port)) {
        const error = new Error(
          `Port ${port} is already in use. ` +
            `This may be caused by:\n` +
            `  • Another OAuth flow in progress\n` +
            `  • A previous OAuth server that didn't shut down cleanly\n` +
            `  • Another application using this port\n\n` +
            `Try: Close other applications, wait a few seconds, or configure ` +
            `a different port for ${this.config.providerName} OAuth.`,
        );
        (error as NodeJS.ErrnoException).code = 'EADDRINUSE';
        lastError = error;

        if (i < portsToTry.length - 1) {
          logWarn(`Port ${port} is already in use, trying next port`);
          continue;
        }
        throw error;
      }

      try {
        await this.bindToPort(port);
        return;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        lastError = error;
        if (
          (error as NodeJS.ErrnoException).code === 'EADDRINUSE' &&
          i < portsToTry.length - 1
        ) {
          logWarn(`Port ${port} is already in use, trying next port`);
          continue;
        }
        throw error;
      }
    }

    throw lastError || new Error('Failed to start OAuth server');
  }

  /**
   * Attempt to bind the callback server to a specific port.
   *
   * @param port - The port number to bind to
   * @throws Error with `code` property set for EADDRINUSE/EACCES errors
   */
  private bindToPort(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        // Fire-and-forget: the HTTP request handler itself is not awaited by http.Server
        void this.handleCallback(req, res);
      });
      this.server = server;

      server.on('error', (err: NodeJS.ErrnoException) => {
        this.server = null;
        if (err.code === 'EADDRINUSE') {
          logError(`Port ${port} is already in use`);
          const error = new Error(
            `Port ${port} is already in use. ` +
              `This may be caused by:\n` +
              `  • Another OAuth flow in progress\n` +
              `  • A previous OAuth server that didn't shut down cleanly\n` +
              `  • Another application using this port\n\n` +
              `Try: Close other applications, wait a few seconds, or configure ` +
              `a different port for ${this.config.providerName} OAuth.`,
          );
          (error as NodeJS.ErrnoException).code = 'EADDRINUSE';
          reject(error);
        } else if (err.code === 'EACCES') {
          logError(`Permission denied for port ${port}: ${err.message}`);
          const error = new Error(
            `Permission denied to use port ${port}. Try running with elevated privileges.`,
          );
          (error as NodeJS.ErrnoException).code = 'EACCES';
          reject(error);
        } else {
          logError(`Failed to start OAuth server: ${err.code} - ${err.message}`);
          reject(new Error(`Failed to start OAuth server: ${err.message}`));
        }
      });

      server.listen(port, 'localhost', () => {
        // Use actual assigned port (important when port 0 is used for OS assignment)
        const address = server.address();
        const actualPort = typeof address === 'object' && address !== null ? address.port : port;
        this.config.port = actualPort;
        logInfo(
          `${this.config.providerName} OAuth callback server started on ${this.getRedirectUri()}`,
        );
        resolve();
      });
    });
  }

  /**
   * Stop the callback server.
   */
  async stopServer(): Promise<void> {
    if (this.server) {
      const server = this.server;
      this.server = null;
      await new Promise<void>((resolve) => {
        server.close(() => {
          logDebug(`${this.config.providerName} OAuth server stopped`);
          resolve();
        });
      });
    }
  }

  /**
   * Handle OAuth callback.
   */
  private async handleCallback(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '', `http://localhost:${this.config.port}`);

    if (url.pathname !== this.getCallbackPath()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    // Find pending auth
    const pending = state ? pendingStates.get(state) : null;

    if (error) {
      this.sendHtml(res, 400, 'Authentication Failed', `Error: ${error}`);
      if (pending) {
        pending.resolve({ success: false, error });
        pendingStates.delete(state!);
      }
      return;
    }

    if (!pending || !code) {
      this.sendHtml(res, 400, 'Invalid Request', 'Missing or expired state parameter');
      return;
    }

    try {
      const token = await this.exchangeCode(code, pending.codeVerifier);

      const displayName = this.getSuccessDisplayName(token);
      this.sendHtml(res, 200, 'Authentication Successful', `You're now connected${displayName}.`);
      pending.resolve({ success: true, token });
      pendingStates.delete(state!);
      logInfo(`${this.config.providerName} OAuth completed for user ${token.userId}`);
    } catch (err) {
      const oauthErr = err instanceof OAuthError ? err : undefined;
      const errorCode = oauthErr?.providerError || oauthErr?.code || 'UNKNOWN';
      const message = err instanceof Error ? err.message : String(err);
      logError(`OAuth code exchange failed [${errorCode}]: ${message}`);

      const userMessage = this.getOAuthErrorMessage(errorCode, message);
      this.sendHtml(res, 500, 'Authentication Failed', userMessage);
      pending.resolve({ success: false, error: `${userMessage} (Error: ${errorCode})` });
      pendingStates.delete(state!);
    } finally {
      // Safety net: ensure state is always cleaned up
      // This handles cases where sendHtml() or other operations throw
      if (state && pendingStates.has(state)) {
        pendingStates.delete(state);
        logWarn(`Cleaned up orphaned OAuth state in finally block: ${state.substring(0, 8)}...`);
      }
    }
  }

  /**
   * Get display name for successful authentication.
   * Subclasses can override to provide provider-specific display names.
   *
   * @param token - The stored token
   * @returns Display name string (e.g., " to MyWorkspace")
   */
  protected getSuccessDisplayName(_token: StoredToken): string {
    return '';
  }

  /**
   * Get user-friendly error message based on OAuth error code.
   * Subclasses can override to provide provider-specific error messages.
   *
   * @param errorCode - The error code from the provider or internal error
   * @param originalMessage - The original error message for logging context
   * @returns User-friendly error message
   */
  protected getOAuthErrorMessage(errorCode: string, originalMessage: string): string {
    const commonErrors: Record<string, string> = {
      ECONNREFUSED: `Could not connect to ${this.config.providerName}. Please check your internet connection.`,
      ETIMEDOUT: `Connection to ${this.config.providerName} timed out. Please try again.`,
      NETWORK_ERROR: 'Network error occurred. Please check your connection and try again.',
      PARSE_ERROR: `Invalid response from ${this.config.providerName}. Please try again.`,
      NO_TOKEN: `${this.config.providerName} did not return an access token. Please try again.`,
      USER_INFO_FAILED: `Failed to retrieve user information from ${this.config.providerName}. Please try again.`,
      access_denied: 'Access was denied. Please authorize the app to continue.',
      UNKNOWN: 'Authentication failed. Please try again.',
    };

    return commonErrors[errorCode] || `Authentication failed: ${originalMessage}`;
  }

  /**
   * Get user information from the provider API.
   * Subclasses must implement this to fetch user info using the access token.
   *
   * @param accessToken - The access token to use
   * @returns User information including userId
   */
  protected abstract getUserInfo(accessToken: string): Promise<{
    userId: string;
    name?: string;
    email?: string;
    [key: string]: any;
  }>;

  /**
   * Exchange authorization code for token using PKCE.
   * Handles the complete OAuth 2.0 token exchange flow including:
   * - HTTP request with PKCE verification
   * - Error handling and validation
   * - User info fetching
   * - Token construction
   *
   * @param code - The authorization code from the provider
   * @param codeVerifier - The PKCE code verifier used to generate the challenge
   * @returns The stored token data
   * @throws OAuthError for network errors, invalid responses, or API errors
   */
  protected async exchangeCode(code: string, codeVerifier: string): Promise<StoredToken> {
    // Make token exchange request
    let response: Response;
    try {
      const params: Record<string, string> = {
        client_id: this.config.clientId,
        code,
        redirect_uri: this.getRedirectUri(),
        grant_type: 'authorization_code',
        ...this.getExtraExchangeParams(),
      };
      if (this.shouldSendClientSecret()) {
        params.client_secret = this.config.clientSecret;
      }

      if (this.config.supportsPkce !== false) {
        params.code_verifier = codeVerifier;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TOKEN_FETCH_TIMEOUT_MS);
      try {
        response = await fetch(this.config.tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: new URLSearchParams(params),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (networkErr) {
      const isTimeout = networkErr instanceof DOMException && networkErr.name === 'AbortError';
      const message = networkErr instanceof Error ? networkErr.message : String(networkErr);
      const code =
        networkErr instanceof Error ? (networkErr as NodeJS.ErrnoException).code : undefined;
      throw new OAuthError(
        isTimeout
          ? `Token exchange timed out after ${TOKEN_FETCH_TIMEOUT_MS / 1000}s`
          : `Network error during token exchange: ${this.sanitizeErrorMessage(message)}`,
        undefined,
        isTimeout ? 'TIMEOUT' : code || 'NETWORK_ERROR',
      );
    }

    // Parse and validate response
    let data: GenericOAuthTokenResponse;
    try {
      data = (await response.json()) as GenericOAuthTokenResponse;
    } catch {
      throw new OAuthError(
        `Invalid response from ${this.config.providerName} API: failed to parse JSON`,
        undefined,
        'PARSE_ERROR',
      );
    }

    if (data.error) {
      throw new OAuthError(
        this.sanitizeErrorMessage(data.error_description || data.error),
        data.error,
      );
    }

    if (!data.access_token) {
      throw new OAuthError(
        'Token exchange failed: no access token returned',
        undefined,
        'NO_TOKEN',
      );
    }

    // Get user info to populate userId and metadata
    const userInfo = await this.getUserInfo(data.access_token);

    const expiresAt =
      data.expires_in && data.expires_in > 0 ? Date.now() + data.expires_in * 1000 : undefined;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      userId: userInfo.userId,
      scope: data.scope || '',
      createdAt: Date.now(),
      expiresAt,
      metadata: { ...userInfo },
    };
  }

  /**
   * Refresh an access token using a refresh token.
   * Handles the complete OAuth 2.0 token refresh flow including:
   * - HTTP request with refresh token
   * - Error handling and validation
   * - User info fetching
   * - Token construction
   *
   * @param refreshToken - The refresh token to use
   * @returns New token data with updated access token and expiration
   * @throws OAuthError for network errors, invalid responses, or API errors
   */
  async refreshAccessToken(refreshToken: string): Promise<StoredToken> {
    if (!this.isConfigured()) {
      throw new Error(
        `${this.config.providerName} OAuth not configured. Set client ID and client secret.`,
      );
    }

    // Make token refresh request
    let response: Response;
    try {
      const params: Record<string, string> = {
        client_id: this.config.clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        ...this.getExtraRefreshParams(),
      };
      if (this.shouldSendClientSecret()) {
        params.client_secret = this.config.clientSecret;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TOKEN_FETCH_TIMEOUT_MS);
      try {
        response = await fetch(this.config.tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: new URLSearchParams(params),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (networkErr) {
      const isTimeout = networkErr instanceof DOMException && networkErr.name === 'AbortError';
      const message = networkErr instanceof Error ? networkErr.message : String(networkErr);
      const code =
        networkErr instanceof Error ? (networkErr as NodeJS.ErrnoException).code : undefined;
      throw new OAuthError(
        isTimeout
          ? `Token refresh timed out after ${TOKEN_FETCH_TIMEOUT_MS / 1000}s`
          : `Network error during token refresh: ${this.sanitizeErrorMessage(message)}`,
        undefined,
        isTimeout ? 'TIMEOUT' : code || 'NETWORK_ERROR',
      );
    }

    // Parse and validate response
    let data: GenericOAuthTokenResponse;
    try {
      data = (await response.json()) as GenericOAuthTokenResponse;
    } catch {
      throw new OAuthError(
        `Invalid response from ${this.config.providerName} API: failed to parse JSON`,
        undefined,
        'PARSE_ERROR',
      );
    }

    if (data.error) {
      throw new OAuthError(
        this.sanitizeErrorMessage(data.error_description || data.error),
        data.error,
      );
    }

    if (!data.access_token) {
      throw new OAuthError('Token refresh failed: no access token returned', undefined, 'NO_TOKEN');
    }

    // Skip getUserInfo() during refresh — user identity doesn't change.
    // TokenManager.executeTokenRefresh() preserves userId and metadata from the stored token.
    const expiresAt =
      data.expires_in && data.expires_in > 0 ? Date.now() + data.expires_in * 1000 : undefined;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      userId: '',
      scope: data.scope || '',
      createdAt: Date.now(),
      expiresAt,
    };
  }

  /**
   * Get the authorization URL with PKCE challenge.
   *
   * @returns The authorization URL, state, and code verifier for PKCE
   */
  getAuthUrl(): { url: string; state: string; codeVerifier: string } {
    const state = crypto.randomBytes(RANDOM_BYTES_LENGTH).toString('hex');
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const url = this.buildAuthorizationUrl(state, codeChallenge);

    return { url, state, codeVerifier };
  }

  /**
   * Build the authorization URL for this provider.
   * Subclasses can override to customize the authorization URL construction.
   *
   * Includes a `nonce` parameter for defense-in-depth against token replay attacks.
   * While PKCE already mitigates code interception, the nonce adds an additional
   * layer of protection by binding the ID token to the specific auth request.
   *
   * @param state - The state parameter
   * @param codeChallenge - The PKCE code challenge
   * @returns The complete authorization URL
   */
  protected buildAuthorizationUrl(state: string, codeChallenge: string): string {
    const scopes = this.config.scopes.join(' ');
    // TODO: store nonce alongside PendingAuth state and validate the `nonce` claim
    // in the returned ID token for full OIDC compliance. Currently sent but not verified
    // — acceptable because PKCE already prevents code interception in the auth code flow.
    const nonce = crypto.randomBytes(RANDOM_BYTES_LENGTH).toString('hex');
    const params: Record<string, string> = {
      client_id: this.config.clientId,
      redirect_uri: this.getRedirectUri(),
      state,
      nonce,
      scope: scopes,
      response_type: 'code',
    };

    if (this.config.supportsPkce !== false) {
      params.code_challenge = codeChallenge;
      params.code_challenge_method = 'S256';
    }

    return `${this.config.authorizeUrl}?${new URLSearchParams(params).toString()}`;
  }

  /**
   * Start OAuth flow - opens browser and waits for callback.
   * Only one OAuth flow can be in progress at a time.
   */
  async startOAuthFlow(): Promise<OAuthResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: `${this.config.providerName} OAuth not configured. Set client ID and client secret.`,
      };
    }

    // If a flow is already in progress, wait for it instead of starting a new one
    if (this.flowPromise) {
      logWarn('OAuth flow already in progress, waiting for existing flow');
      return this.flowPromise;
    }

    // Create and store the flow promise atomically
    this.flowPromise = this.executeOAuthFlow();

    try {
      return await this.flowPromise;
    } finally {
      this.flowPromise = null;
    }
  }

  /**
   * Execute the actual OAuth flow (internal implementation).
   * @internal
   */
  private async executeOAuthFlow(): Promise<OAuthResult> {
    try {
      await this.startServer();
    } catch (err) {
      // Server failed to start - return error result
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to start OAuth server',
      };
    }

    const { url, state, codeVerifier } = this.getAuthUrl();

    return new Promise<OAuthResult>((resolve) => {
      // Clean up old states if too many have accumulated
      if (pendingStates.size >= MAX_PENDING_STATES) {
        logWarn(`Excessive pending OAuth states (${pendingStates.size}), clearing oldest entries`);
        const entries = Array.from(pendingStates.entries());
        entries.sort((a, b) => a[1].createdAt - b[1].createdAt);
        for (let i = 0; i < Math.floor(entries.length / 2); i++) {
          const [oldState, oldPending] = entries[i];
          oldPending.resolve({ success: false, error: 'OAuth flow superseded by newer request' });
          pendingStates.delete(oldState);
        }
      }

      pendingStates.set(state, { createdAt: Date.now(), codeVerifier, resolve });

      // Set timeout for OAuth flow completion
      const timeoutId = setTimeout(() => {
        if (pendingStates.has(state)) {
          pendingStates.delete(state);
          resolve({ success: false, error: 'OAuth timed out' });
        }
      }, this.config.timeout);

      // Open browser
      logInfo(`Opening browser for ${this.config.providerName} OAuth: ${url}`);
      open(url).catch((err: unknown) => {
        // Browser failed to open - fail immediately instead of waiting for timeout
        const message = err instanceof Error ? err.message : String(err);
        logError(`Failed to open browser: ${message}`);
        logWarn(
          `\n⚠️  Could not automatically open browser for ${this.config.providerName} OAuth.\n` +
            `Please manually open this URL in your browser:\n\n` +
            `${url}\n\n` +
            `This can happen in headless environments (SSH, Docker, CI/CD).\n` +
            `If you're in a headless environment, use GITHUB_TOKEN instead.`,
        );

        // Clean up and fail immediately
        clearTimeout(timeoutId);
        if (pendingStates.has(state)) {
          pendingStates.delete(state);
          resolve({
            success: false,
            error: `Failed to open browser: ${message}. In headless environments, use GITHUB_TOKEN instead.`,
          });
        }
      });
    });
  }

  /**
   * Get auth URL without auto-opening browser (includes PKCE).
   * Returns auth URL data and a promise that resolves when OAuth completes.
   *
   * @returns Auth URL data with a resultPromise (success=true), or error object (success=false)
   */
  async getAuthUrlOnly(): Promise<GetAuthUrlResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: `${this.config.providerName} OAuth not configured. Set client ID and client secret.`,
      };
    }

    await this.startServer();
    const authData = this.getAuthUrl();

    const resultPromise = new Promise<OAuthResult>((resolve) => {
      pendingStates.set(authData.state, {
        createdAt: Date.now(),
        codeVerifier: authData.codeVerifier,
        resolve,
      });

      setTimeout(() => {
        if (pendingStates.has(authData.state)) {
          pendingStates.delete(authData.state);
          logDebug(`Cleaned up expired pending OAuth state: ${authData.state.substring(0, 8)}...`);
          resolve({ success: false, error: 'OAuth timed out' });
        }
      }, this.config.timeout);
    });

    return { success: true, ...authData, resultPromise };
  }

  /**
   * Send HTML response to the OAuth callback browser window.
   *
   * @param res - The HTTP response object
   * @param status - HTTP status code (200 for success, 4xx/5xx for errors)
   * @param title - Page title and heading text
   * @param message - Descriptive message shown to the user
   */
  private sendHtml(res: http.ServerResponse, status: number, title: string, message: string): void {
    const html = this.buildOAuthResponseHtml(status === 200, title, message);
    res.writeHead(status, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  /**
   * Build the OAuth response HTML page.
   * Subclasses can override to customize the response page.
   *
   * @param isSuccess - Whether the OAuth flow succeeded
   * @param title - Page title and heading
   * @param message - Message to display to the user
   * @returns Complete HTML document string
   */
  protected buildOAuthResponseHtml(isSuccess: boolean, title: string, message: string): string {
    const icon = isSuccess ? '✓' : '✗';
    const iconColor = isSuccess ? '#10b981' : '#ef4444';
    const bgGradient = isSuccess
      ? 'linear-gradient(135deg, #4ade80 0%, #22c55e 50%, #16a34a 100%)'
      : 'linear-gradient(135deg, #f87171 0%, #ef4444 50%, #dc2626 100%)';

    const closeHint = isSuccess
      ? '<div class="close-hint">You can safely close this window now.</div>'
      : '';

    const css = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      background: ${bgGradient};
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 24px;
      padding: 48px 56px;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      max-width: 420px;
      width: 100%;
      animation: slideUp 0.4s ease-out;
    }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .icon-container {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: ${iconColor}15;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
    }
    .icon { font-size: 40px; color: ${iconColor}; line-height: 1; }
    h1 { color: #1f2937; font-size: 28px; font-weight: 700; margin-bottom: 12px; }
    .message { color: #6b7280; font-size: 16px; line-height: 1.6; margin-bottom: 32px; }
    .provider {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: #9ca3af;
      font-size: 14px;
      padding-top: 24px;
      border-top: 1px solid #f3f4f6;
    }
    .close-hint {
      margin-top: 24px;
      padding: 12px 20px;
      background: #f9fafb;
      border-radius: 12px;
      color: #6b7280;
      font-size: 14px;
    }`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.config.providerName} Authentication - ${title}</title>
  <style>${css}</style>
</head>
<body>
  <div class="card">
    <div class="icon-container">
      <span class="icon">${icon}</span>
    </div>
    <h1>${title}</h1>
    <p class="message">${message}</p>
    ${closeHint}
    <div class="provider">
      Connected with ${this.config.providerName}
    </div>
  </div>
</body>
</html>`;
  }
}
