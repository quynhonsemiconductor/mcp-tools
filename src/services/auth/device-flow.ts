/**
 * OAuth 2.0 Device Authorization Grant (RFC 8628).
 *
 * The reason this exists rather than the browser flow: a device flow needs no client secret.
 * GitHub says so twice — "The `client_secret` is not needed for the device flow" on the token
 * request, and on refresh the secret is "Required unless the token was generated using the device
 * flow". So a binary that signs in this way carries nothing worth extracting, which the browser
 * flow could not manage: its token exchange lists `client_secret` as required, and PKCE does not
 * change that for an OAuth app.
 *
 * What shipped before was the browser flow with the secret compiled in, XOR-obfuscated against a
 * key compiled in beside it, in a public repository. That is an encoding, not a protection.
 *
 * Provider-agnostic on purpose: the grant is a standard, and the two URLs plus a client id are the
 * whole configuration. Only GitHub is wired to it today.
 *
 * @see https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow
 * @see https://datatracker.ietf.org/doc/html/rfc8628
 */

import { logDebug, logWarn } from '../logger';

/** How long to wait on each HTTP call before giving up on it. */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Fallback poll interval when the provider does not send one. RFC 8628 §3.5 specifies 5 seconds
 * as the default, and GitHub sends `interval` explicitly.
 */
const DEFAULT_POLL_INTERVAL_SECONDS = 5;

/**
 * Added to the interval on `slow_down`. GitHub documents exactly this: "5 extra seconds are added
 * to the minimum interval". It is not a guess and not a backoff multiplier.
 */
const SLOW_DOWN_EXTRA_SECONDS = 5;

/** What the provider returns when asked to start a device authorization. */
export interface DeviceCodeGrant {
  /** Secret half — identifies this attempt when polling. Never shown to anyone. */
  deviceCode: string;
  /** The short code a person types into the browser. Shown; that is its entire job. */
  userCode: string;
  /** Where they type it. */
  verificationUri: string;
  /** Seconds until both codes stop working. GitHub uses 900. */
  expiresInSeconds: number;
  /** Minimum seconds between polls. Polling faster earns `slow_down`. */
  intervalSeconds: number;
}

/** The token half of a successful device authorization. */
export interface DeviceFlowTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds?: number;
  scope?: string;
}

/**
 * A device-flow failure that a person can act on, as distinct from a transport error.
 *
 * `code` is the provider's own error code, so a caller can tell "you have not finished yet" from
 * "device flow is switched off in the app settings" — which look identical in a message and need
 * opposite responses.
 */
export class DeviceFlowError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'DeviceFlowError';
  }
}

/** Provider error codes that mean "keep polling", not "stop". */
const PENDING_CODES = new Set(['authorization_pending', 'slow_down']);

/**
 * Messages for the terminal error codes. Each says what to do, because every one of these is
 * reached by a person who is part-way through signing in and needs to know whether to retry, wait,
 * or go and change a setting.
 */
const TERMINAL_MESSAGES: Record<string, string> = {
  expired_token:
    'The sign-in code expired before it was entered. Run the same request again to get a new one.',
  access_denied: 'Sign-in was cancelled. Run the same request again to get a new code.',
  device_flow_disabled:
    'This OAuth app does not have Device flow enabled. Enable it in the app settings ' +
    '(Settings -> Developer settings -> OAuth Apps -> the app -> Enable Device Flow), then try again.',
  incorrect_client_credentials:
    'The built-in client id was rejected. This is a packaging fault rather than anything you did — ' +
    'please report it.',
  incorrect_device_code: 'The sign-in attempt is no longer valid. Run the same request again.',
  unsupported_grant_type:
    'The provider refused the device grant. This is a packaging fault — please report it.',
};

/** Shape of both device-flow endpoints' JSON. */
interface DeviceEndpointResponse {
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  expires_in?: number;
  interval?: number;
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

/**
 * POST a form and parse JSON, with a timeout.
 *
 * `Accept: application/json` matters: without it these endpoints answer in
 * `application/x-www-form-urlencoded`, and `response.json()` then throws on a body that was
 * perfectly valid.
 */
async function postForm(url: string, params: Record<string, string>): Promise<DeviceEndpointResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams(params),
      signal: controller.signal,
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    throw new DeviceFlowError(
      isTimeout
        ? `The sign-in service did not respond within ${REQUEST_TIMEOUT_MS / 1000}s.`
        : `Could not reach the sign-in service: ${err instanceof Error ? err.message : String(err)}`,
      isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
    );
  } finally {
    clearTimeout(timeoutId);
  }

  try {
    return (await response.json()) as DeviceEndpointResponse;
  } catch {
    throw new DeviceFlowError(
      `The sign-in service returned a response that could not be read (HTTP ${response.status}).`,
      'PARSE_ERROR',
    );
  }
}

/**
 * Ask the provider to start a device authorization.
 *
 * No client secret is sent, and none is accepted — that is the point of the whole module.
 *
 * @param deviceCodeUrl - The provider's device-code endpoint
 * @param clientId - The public client id
 * @param scopes - Scopes to request, space-joined per RFC 8628
 */
export async function requestDeviceCode(
  deviceCodeUrl: string,
  clientId: string,
  scopes: string[],
): Promise<DeviceCodeGrant> {
  const data = await postForm(deviceCodeUrl, {
    client_id: clientId,
    scope: scopes.join(' '),
  });

  if (data.error) {
    const message = TERMINAL_MESSAGES[data.error] ?? data.error_description ?? data.error;
    throw new DeviceFlowError(message, data.error);
  }

  if (!data.device_code || !data.user_code || !data.verification_uri) {
    throw new DeviceFlowError(
      'The sign-in service did not return a usable code.',
      'INCOMPLETE_RESPONSE',
    );
  }

  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresInSeconds: data.expires_in ?? 900,
    intervalSeconds: data.interval ?? DEFAULT_POLL_INTERVAL_SECONDS,
  };
}

/** Injectable sleep, so tests do not wait in real seconds. */
export type SleepFn = (ms: number) => Promise<void>;

const realSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll until the person finishes authorizing, the codes expire, or the provider refuses.
 *
 * The interval is the provider's, not ours, and `slow_down` raises it permanently for the rest of
 * this attempt rather than for one iteration — polling too fast is what caused the error, so
 * reverting would cause it again.
 *
 * The deadline comes from `expires_in` instead of a fixed timeout, because the codes themselves
 * stop working at that moment and a poll after it can only fail.
 *
 * @param tokenUrl - The provider's token endpoint
 * @param clientId - The public client id
 * @param grant - What {@link requestDeviceCode} returned
 * @param deps - Injectable clock and sleep, for tests
 */
export async function pollForDeviceToken(
  tokenUrl: string,
  clientId: string,
  grant: DeviceCodeGrant,
  deps: { sleep?: SleepFn; now?: () => number } = {},
): Promise<DeviceFlowTokenResponse> {
  const sleep = deps.sleep ?? realSleep;
  const now = deps.now ?? (() => Date.now());

  let intervalSeconds = grant.intervalSeconds;
  const deadline = now() + grant.expiresInSeconds * 1000;

  // Wait before the first poll rather than after: the person has not had time to type anything
  // yet, so an immediate request can only return `authorization_pending`.
  while (now() < deadline) {
    await sleep(intervalSeconds * 1000);

    const data = await postForm(tokenUrl, {
      client_id: clientId,
      device_code: grant.deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });

    if (data.access_token) {
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresInSeconds: data.expires_in,
        scope: data.scope,
      };
    }

    const error = data.error;
    if (!error) {
      throw new DeviceFlowError(
        'The sign-in service returned neither a token nor an error.',
        'EMPTY_RESPONSE',
      );
    }

    if (!PENDING_CODES.has(error)) {
      const message = TERMINAL_MESSAGES[error] ?? data.error_description ?? error;
      throw new DeviceFlowError(message, error);
    }

    if (error === 'slow_down') {
      intervalSeconds += SLOW_DOWN_EXTRA_SECONDS;
      logWarn(`Sign-in polling asked to slow down; waiting ${intervalSeconds}s between checks`);
    } else {
      logDebug('Waiting for sign-in to be completed in the browser');
    }
  }

  throw new DeviceFlowError(
    'The sign-in code expired before it was entered. Run the same request again to get a new one.',
    'expired_token',
  );
}
