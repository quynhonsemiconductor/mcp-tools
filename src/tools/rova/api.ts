/**
 * api.ts — HTTP access to the Rova API.
 *
 * Rova is the company's project tracker: projects, work items, iterations, releases.
 * Its API is REST under a `/v1` prefix and carries 266 endpoints across 22 modules, far
 * more than belongs in a tool surface, so the tools here cover the operations people
 * actually perform and this module is the single seam they share.
 *
 * Authentication is a personal Rova API token rather than the Entra sign-in used
 * elsewhere. Rova's Entra flow is a confidential-client BFF whose purpose is that tokens
 * never leave the server, so reusing it would mean changing Rova's own auth model. Its
 * API tokens are already the right shape: opaque, revoked by deleting a row, and checked
 * against the database on every request. Because the token carries the person's
 * identity, Rova's PolicyGuard scopes every response to the projects that person may
 * read — the same property the GitHub and Microsoft tools have.
 */

import env from '../../env';
import { UserError } from '../../utils';

/** Production API. Overridden with ROVA_API_URL for the dev environment. */
const DEFAULT_BASE_URL = 'https://rova-api.qnsc.vn';

/** Rova answers quickly; a long wait here only delays reporting a real outage. */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Envelope Rova returns for a list.
 *
 * Collections come back as `{ data, pageInfo }` while single resources are returned bare,
 * so callers cannot assume one shape.
 */
export interface RovaPage<T> {
  data?: T[];
  pageInfo?: { total?: number; hasNextPage?: boolean; endCursor?: string };
}

/**
 * Resolve the API base URL without a trailing slash.
 *
 * @returns Base URL for requests
 */
export function rovaBaseUrl(): string {
  return (env.ROVA_API_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/**
 * Read the configured token.
 *
 * @returns The API token
 * @throws When no token is configured
 */
function requireToken(): string {
  const token = env.ROVA_API_TOKEN;
  if (!token) {
    throw new UserError(
      'ROVA_API_TOKEN is not set. Create a personal API token in Rova under API tokens and ' +
        'set it, along with ROVA_API_URL if you are pointing at an environment other than ' +
        'production. The token carries your identity, so results are limited to the projects ' +
        'you can already read.',
    );
  }
  return token;
}

/**
 * Call the Rova API.
 *
 * @param path - Path below the /v1 prefix, e.g. `/work-items/my`
 * @param init - Fetch options; a body is sent as JSON
 * @returns The parsed response
 * @throws UserError with Rova's own message when the request is refused
 */
export async function rovaRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = requireToken();
  const url = `${rovaBaseUrl()}/v1${path.startsWith('/') ? path : `/${path}`}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        // The `rly_` prefix is what routes this to Rova's API-token resolver rather
        // than its JWT path; both arrive as a Bearer value.
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'AbortError';
    throw new UserError(
      timedOut
        ? `Rova did not respond within ${REQUEST_TIMEOUT_MS / 1000}s at ${rovaBaseUrl()}`
        : `Could not reach Rova at ${rovaBaseUrl()}: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // Rova returns { error: { code, message, correlationId } }. The code is the useful
    // part — PROJECT_PERMISSION_DENIED means a missing project scope on the request, not
    // a bad token — and the correlation id is what makes a report traceable in its logs.
    let code = '';
    let message = `HTTP ${response.status}`;
    let correlationId = '';
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string; correlationId?: string };
      };
      code = body.error?.code ?? '';
      message = body.error?.message ?? message;
      correlationId = body.error?.correlationId ?? '';
    } catch {
      // Not JSON; the status alone has to do.
    }

    if (response.status === 401) {
      throw new UserError(
        'Rova rejected the token. It may have been revoked or have expired — create a new ' +
          'personal API token in Rova and update ROVA_API_TOKEN.',
      );
    }
    if (code === 'PROJECT_PERMISSION_DENIED') {
      throw new UserError(
        `Rova refused the request: ${message}\n\n` +
          'This usually means the request needs a project to scope it rather than that ' +
          'access is missing: several collections are only readable within a project. Pass ' +
          'projectId, using listRovaProjects to find it. It can also mean the project is ' +
          'genuinely not one you may read.',
      );
    }

    throw new UserError(
      `Rova request failed — ${code ? `${code}: ` : ''}${message}` +
        (correlationId ? `\ncorrelation id ${correlationId}` : ''),
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * Pull the array out of a response, whichever shape it arrived in.
 *
 * @param body - A page envelope or a bare array
 * @returns The items
 */
export function rovaItems<T>(body: RovaPage<T> | T[] | null | undefined): T[] {
  if (Array.isArray(body)) return body;
  return body?.data ?? [];
}

/** Cached for the process: the signed-in identity does not change while it runs. */
let cachedUserId: string | null = null;

/**
 * The id of the person the token belongs to.
 *
 * Several Rova writes require a user id for something the caller means to be themselves —
 * recording who ran a test, most obviously. Without this, using those tools would mean
 * knowing your own uuid, which nobody does.
 *
 * Read from /bff/me, which answers for an API token as well as a browser session.
 *
 * @returns The current user's id
 * @throws When the identity cannot be resolved
 */
export async function rovaCurrentUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const me = await rovaRequest<{ id?: string; user?: { id?: string } }>('/bff/me');
  const id = me.id ?? me.user?.id;
  if (!id) {
    throw new UserError(
      'Could not work out which Rova user this token belongs to, so a field that needs a user id cannot be filled in. Pass the id explicitly.',
    );
  }
  cachedUserId = id;
  return id;
}
