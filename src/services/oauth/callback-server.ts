import { serve, Server } from 'bun';
import { logError, logInfo } from '../logger';

/**
 * The port number used by the local OAuth callback server.
 * @constant {number}
 */
const CALLBACK_PORT = 8090;

/**
 * Default timeout in milliseconds before the server automatically stops (3 minutes).
 * @constant {number}
 */
const DEFAULT_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * Exact message used when a callback times out (as opposed to an explicit
 * OAuth denial or malformed callback, which reject with a different message —
 * see the `/callback` route below). Exported so callers can distinguish "the
 * user explicitly denied/errored" from "nothing arrived within the window"
 * without string-matching a message defined only here.
 * @constant {string}
 */
export const CALLBACK_TIMEOUT_MESSAGE = 'OAuth callback server timed out';

/**
 * Manages OAuth callback handling for remote MCP server authentication.
 *
 * This singleton class runs a local HTTP server to receive OAuth authorization callbacks
 * from remote MCP servers. It supports multiple concurrent OAuth flows by
 * tracking callbacks using the OAuth state parameter (decoded from base64).
 *
 * The server manages its own lifecycle:
 * - Automatically starts when the first callback is registered
 * - Automatically stops when all pending callbacks are resolved or rejected
 * - Has a 3-minute inactivity timeout that is reset when new callbacks are registered
 *
 * @example
 * ```typescript
 * // Register for callback - server starts automatically
 * const { callbackUrl, codePromise } = OAuthCallbackServer.waitForCallback('my-remote-server');
 *
 * // Use callbackUrl when building the authorization URL
 * const authUrl = buildAuthUrl(callbackUrl);
 *
 * // Wait for the authorization code
 * const authCode = await codePromise;
 * // Server stops automatically when no more pending callbacks
 * ```
 */
export class OAuthCallbackServer {
  /**
   * The singleton instance of the OAuthCallbackServer.
   * @private
   */
  private static _instance: OAuthCallbackServer | null = null;

  /**
   * Map of pending OAuth callbacks, keyed by the decoded state (remote server ID).
   * Each entry contains resolve/reject functions for the associated promise.
   * @private
   */
  private _callbacks: Record<
    string,
    {
      resolve: (value: string | PromiseLike<string>) => void;
      reject: (reason?: any) => void;
    }
  > = {};

  /**
   * The Bun HTTP server instance handling OAuth callbacks.
   * @private
   */
  private _server?: Server<undefined> = undefined;

  /**
   * Timer for automatic server shutdown after inactivity.
   * @private
   */
  private _timeout?: Timer = undefined;

  /**
   * Private constructor to enforce singleton pattern.
   * @private
   */
  private constructor() {}

  /**
   * Gets the singleton instance of the OAuthCallbackServer.
   * @private
   */
  private static getInstance(): OAuthCallbackServer {
    if (!OAuthCallbackServer._instance) {
      OAuthCallbackServer._instance = new OAuthCallbackServer();
    }
    return OAuthCallbackServer._instance;
  }

  public static get REDIRECT_URI(): string {
    return `http://localhost:${CALLBACK_PORT}/callback`;
  }

  /**
   * Starts the local OAuth callback server if not already running.
   * @private
   */
  private start(): string | URL {
    if (this._server) {
      return this._server.url;
    }

    const manager = this;
    this._server = serve({
      hostname: 'localhost',
      port: CALLBACK_PORT,
      routes: {
        '/favicon.ico': () => new Response(null, { status: 404 }),
        // eslint-disable-next-line @typescript-eslint/require-await -- implements a Promise-returning interface; async is required by the contract even without an await
        '/callback': async (req) => {
          const parsedUrl = new URL(req.url, 'http://localhost');
          const code = parsedUrl.searchParams.get('code');
          const error = parsedUrl.searchParams.get('error');
          const state = parsedUrl.searchParams.get('state');

          if (code && state) {
            logInfo('✅ OAuth authorization code received via callback');
            manager.resolveCallback(state, code);
            return new Response(
              `
        <html>
          <body>
            <h1>Authorization Successful!</h1>
            <p>You can close this window and return to the terminal.</p>
            <script>setTimeout(() => window.close(), 2000);</script>
          </body>
        </html>
              `,
              { status: 200, headers: { 'Content-Type': 'text/html' } },
            );
          } else if (error && state) {
            logError(`❌ OAuth authorization error received: ${error}`);
            manager.rejectCallback(state, new Error(error));
            return new Response(
              `
        <html>
          <body>
            <h1>Authorization Failed</h1>
            <p>Error: ${error}</p>
            <script>setTimeout(() => window.close(), 2000);</script>
          </body>
        </html>
              `,
              { status: 400, headers: { 'Content-Type': 'text/html' } },
            );
          } else {
            logError(`❌ OAuth callback received without code or error ${req.url}`);
            if (state) {
              manager.rejectCallback(state, new Error('Invalid callback parameters'));
            }
            return new Response('Bad request', { status: 400 });
          }
        },
      },
      fetch(_) {
        return new Response('Not found', { status: 404 });
      },
    });
    return this._server.url;
  }

  /**
   * Resolves a callback and stops the server if no more pending callbacks.
   * @private
   */
  private resolveCallback(state: string, code: string) {
    const decodedState = atob(state);
    if (this._callbacks[decodedState]) {
      const { resolve } = this._callbacks[decodedState];
      resolve(code);
      delete this._callbacks[decodedState];
      void this.stopIfIdle();
    }
  }

  /**
   * Rejects a callback and stops the server if no more pending callbacks.
   * @private
   */
  private rejectCallback(state: string, error: Error) {
    const decodedState = atob(state);
    if (this._callbacks[decodedState]) {
      const { reject } = this._callbacks[decodedState];
      reject(error);
      delete this._callbacks[decodedState];
      void this.stopIfIdle();
    }
  }

  /**
   * Stops the server if there are no pending callbacks.
   * @private
   */
  private async stopIfIdle() {
    if (Object.keys(this._callbacks).length === 0 && this._server) {
      this.clearTimeout();
      await this._server.stop();
      this._server = undefined;
    }
  }

  /**
   * Resets the inactivity timeout. Called when a new callback is registered.
   * @private
   */
  private resetTimeout() {
    this.clearTimeout();
    this._timeout = setTimeout(() => {
      void this.handleTimeout();
    }, DEFAULT_TIMEOUT_MS);
  }

  /**
   * Clears the inactivity timeout.
   * @private
   */
  private clearTimeout() {
    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = undefined;
    }
  }

  /**
   * Handles timeout by rejecting all pending callbacks and stopping the server.
   * @private
   */
  private async handleTimeout() {
    logError('⏱️ OAuth callback server timed out');
    const error = new Error(CALLBACK_TIMEOUT_MESSAGE);
    Object.values(this._callbacks).forEach(({ reject }) => {
      reject(error);
    });
    this._callbacks = {};
    if (this._server) {
      await this._server.stop();
      this._server = undefined;
    }
    this._timeout = undefined;
  }

  /**
   * Registers a callback listener for a specific remote server's OAuth flow.
   *
   * This is the only public interaction point with the callback server.
   * The server automatically starts when this method is called (if not already running)
   * and automatically stops when all pending callbacks have been resolved or rejected.
   *
   * @param id - The remote server ID to wait for (matches the decoded OAuth state)
   * @returns `codePromise`: A promise that resolves with the authorization code
   * @throws {Error} If a callback is already registered for the given ID
   *
   * @example
   * ```typescript
   * const codePromise = OAuthCallbackServer.waitForCallback('my-remote-server');
   * // Use callbackUrl in the authorization request
   * // Wait for codePromise to get the authorization code
   * ```
   */
  static waitForCallback(id: string): Promise<string> {
    const instance = OAuthCallbackServer.getInstance();

    instance.start();

    const codePromise = new Promise<string>((resolve, reject) => {
      if (instance._callbacks[id]) {
        reject(new Error(`Callback already registered for ${id}`));
        return;
      }
      instance._callbacks[id] = { resolve, reject };
      instance.resetTimeout();
    });

    return codePromise;
  }
}
