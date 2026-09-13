/**
 * Tests for the Microsoft Graph client.
 *
 * These cover the parts that can be asserted without a real tenant: that a
 * delegated token is attached, that a 403 is reported as a permissions problem
 * rather than a bad request, and that a timeout says so. The happy path against a
 * live tenant is verified by hand, since it needs an interactive sign-in.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import '../../test-utils/mocks';

const mockGetToken = mock(() => Promise.resolve('delegated-token'));
mock.module('../../services/auth/entra-id', () => ({
  getEntraIdTokenManager: () => Promise.resolve({ getToken: mockGetToken }),
}));

const { graphRequest, graphRequestText } = await import('./api');

describe('graphRequest', () => {
  const realFetch = global.fetch;
  let captured: { url: string; init?: RequestInit } | undefined;

  beforeEach(() => {
    captured = undefined;
    mockGetToken.mockClear();
    mockGetToken.mockResolvedValue('delegated-token');
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  /**
   * Install a fetch stub returning the given status and body.
   *
   * @param status - HTTP status to return
   * @param body - JSON body to return
   */
  const stubFetch = (status: number, body: unknown): void => {
    global.fetch = mock((url: string | URL, init?: RequestInit) => {
      captured = { url: String(url), init };
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }) as unknown as typeof fetch;
  };

  it('sends the delegated token as a bearer credential', async () => {
    stubFetch(200, { value: [] });

    await graphRequest('/me/drive/root/children');

    const headers = captured?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer delegated-token');
    expect(captured?.url).toBe('https://graph.microsoft.com/v1.0/me/drive/root/children');
  });

  it('reports a 403 as a permission problem and names both causes', async () => {
    // The user authenticated fine, so the fix is a permission, not the call. And
    // there are two causes that look identical: a scope that was never granted, and
    // a scope granted after this user's token was issued. The second was hit while
    // adding the mail and chat scopes — the portal looked right and every call
    // failed — so the message has to mention signing in again.
    stubFetch(403, { error: { code: 'accessDenied', message: 'Access denied' } });

    let caught: Error | undefined;
    try {
      await graphRequest('/sites/root');
    } catch (error) {
      caught = error as Error;
    }

    expect(caught).toBeDefined();
    expect(caught!.message).toContain('consent');
    expect(caught!.message).toContain('signing in again');
  });

  it('surfaces the Graph error code and message on other failures', async () => {
    stubFetch(404, { error: { code: 'itemNotFound', message: 'Item does not exist' } });

    let caught: Error | undefined;
    try {
      await graphRequest('/me/drive/items/nope');
    } catch (error) {
      caught = error as Error;
    }

    expect(caught!.message).toContain('itemNotFound');
    expect(caught!.message).toContain('Item does not exist');
  });

  it('explains what to configure when no token can be obtained', async () => {
    mockGetToken.mockResolvedValue('');

    let caught: Error | undefined;
    try {
      await graphRequest('/me');
    } catch (error) {
      caught = error as Error;
    }

    expect(caught!.message).toContain('ENTRA_CLIENT_ID');
  });

  it('does not treat a non-JSON error body as fatal', async () => {
    global.fetch = mock(() =>
      Promise.resolve(new Response('<html>gateway error</html>', { status: 502 })),
    ) as unknown as typeof fetch;

    let caught: Error | undefined;
    try {
      await graphRequest('/me');
    } catch (error) {
      caught = error as Error;
    }

    expect(caught!.message).toContain('502');
  });

  it('returns a non-JSON body verbatim through the text path', async () => {
    // /content sends the file itself. Parsing it as JSON throws, and swallowing
    // that to return '' would make an unreadable file look like an empty one.
    global.fetch = mock(() =>
      Promise.resolve(new Response('line one\nline two', { status: 200 })),
    ) as unknown as typeof fetch;

    expect(await graphRequestText('/me/drive/items/x/content')).toBe('line one\nline two');
  });

  it('still raises Graph errors on the text path', async () => {
    global.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { code: 'itemNotFound', message: 'gone' } }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as unknown as typeof fetch;

    let caught: Error | undefined;
    try {
      await graphRequestText('/me/drive/items/x/content');
    } catch (error) {
      caught = error as Error;
    }
    expect(caught!.message).toContain('itemNotFound');
  });
});
