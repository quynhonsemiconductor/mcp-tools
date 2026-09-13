/**
 * Microsoft Graph API client.
 *
 * Every request carries a delegated Entra ID token, so Graph applies the signed-in
 * person's own permissions. That is the whole point of this module: a person sees
 * exactly the files and sites they already have, and nothing else.
 *
 * The alternative — application permissions with a certificate, which is what the
 * bundled SharePoint server uses — needs one shared identity granted tenant-wide
 * access, a `.pfx` distributed to every machine, and it produces an audit trail
 * naming the application rather than the person who asked.
 */

import { getEntraIdTokenManager } from '../../services/auth/entra-id';
import { UserError } from '../../utils';

/** Base URL for Microsoft Graph v1.0. */
const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

/** How long to wait on a Graph request before giving up. */
const GRAPH_TIMEOUT_MS = 30_000;

/**
 * Shape of a Graph error body. Graph nests the useful part under `error`.
 */
interface GraphErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

/**
 * Acquire a delegated access token for Microsoft Graph.
 *
 * Triggers an interactive sign-in on first use and reuses the keyring-stored token
 * afterwards, refreshing it when it nears expiry.
 *
 * @returns A bearer token for Graph
 * @throws UserError when Entra is not configured, with what to set
 */
async function getGraphToken(): Promise<string> {
  try {
    const tokenManager = await getEntraIdTokenManager();
    const token = await tokenManager.getToken();
    if (!token) {
      throw new UserError(
        'No Microsoft access token available. Sign in when prompted, or check that ' +
          'ENTRA_CLIENT_ID is set for an app registration with delegated Graph permissions.',
      );
    }
    return token;
  } catch (error) {
    if (error instanceof UserError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new UserError(
      `Microsoft sign-in failed: ${message}\n\n` +
        'This needs an Entra app registration configured as a public client:\n' +
        '  - Platform: Mobile and desktop applications\n' +
        '  - Redirect URIs, all four (the callback server falls back if a port is busy):\n' +
        '      http://localhost:9876/cms/auth/entra/callback\n' +
        '      http://localhost:9877/cms/auth/entra/callback\n' +
        '      http://localhost:9878/cms/auth/entra/callback\n' +
        '      http://localhost:9879/cms/auth/entra/callback\n' +
        '  - Delegated Graph permissions: User.Read, Files.Read, Sites.Read.All\n' +
        'Then set ENTRA_CLIENT_ID. No client secret or certificate is required.',
    );
  }
}

/**
 * Call a Microsoft Graph endpoint as the signed-in user.
 *
 * @param path - Path below the Graph version root, e.g. `/me/drive/root/children`
 * @param init - Additional fetch options; a bearer token is added automatically
 * @returns Parsed JSON response
 * @throws UserError describing what Graph refused and, where useful, why
 */
export async function graphRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await graphFetch(path, init);
  return (await response.json()) as T;
}

/**
 * Call Graph and return the response body as text.
 *
 * Needed for endpoints that do not return JSON — `/content` sends the file itself.
 * Parsing those as JSON throws a SyntaxError, and catching that to return an empty
 * string would make an unreadable file look like an empty one.
 *
 * @param path - Path below the Graph version root
 * @param init - Additional fetch options
 * @returns The raw response body
 */
export async function graphRequestText(path: string, init?: RequestInit): Promise<string> {
  const response = await graphFetch(path, init);
  return await response.text();
}

/**
 * Call Graph and return the response body as bytes.
 *
 * Needed for PDFs, and for Office documents which Graph will convert to PDF via
 * `?format=pdf` — in both cases the useful payload is binary, and the text has to
 * be extracted locally because Graph has no text conversion.
 *
 * @param path - Path below the Graph version root
 * @param init - Additional fetch options
 * @returns The response body as a byte array
 */
export async function graphRequestBytes(path: string, init?: RequestInit): Promise<Uint8Array> {
  const response = await graphFetch(path, init);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Perform an authenticated Graph request and translate failures into UserErrors.
 *
 * @param path - Path below the Graph version root
 * @param init - Additional fetch options
 * @returns The successful Response, for the caller to decode
 */
async function graphFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getGraphToken();
  const url = `${GRAPH_BASE_URL}${path}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GRAPH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === 'AbortError';
    throw new UserError(
      isTimeout
        ? `Microsoft Graph did not respond within ${GRAPH_TIMEOUT_MS / 1000}s`
        : `Could not reach Microsoft Graph: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as GraphErrorBody;
      if (body.error?.message) {
        detail = `${body.error.code ?? response.status}: ${body.error.message}`;
      }
    } catch {
      // Keep the status-only message when the body is not JSON.
    }

    // 403 here almost always means the app registration lacks a consented
    // delegated permission, which is a different fix from a bad request.
    if (response.status === 403) {
      throw new UserError(
        `Microsoft Graph refused the request — ${detail}\n\n` +
          'The signed-in user reached Graph, so this is a permission problem, and there ' +
          'are two possible causes:\n' +
          '  1. The app registration lacks the delegated scope this call needs, or an ' +
          'administrator has not consented to it.\n' +
          '  2. The scope was added after this user last signed in. Scopes are fixed when ' +
          'a token is issued, so an existing token will not carry a newly granted one — ' +
          'signing in again is required.\n' +
          'The second is easy to mistake for the first: the permission looks correct in ' +
          'the portal while every call still fails.',
      );
    }

    throw new UserError(`Microsoft Graph request failed — ${detail}`);
  }

  return response;
}
