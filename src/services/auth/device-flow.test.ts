/**
 * Device flow tests.
 *
 * The case that matters most is {@link https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow
 * the one asserting no client secret is ever sent}, because that is the entire reason this grant
 * replaced the browser flow. The rest cover the polling states, each of which is reached by a real
 * person mid sign-in and needs a different answer.
 */

import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
  DeviceFlowError,
  pollForDeviceToken,
  requestDeviceCode,
  type DeviceCodeGrant,
} from './device-flow';

const DEVICE_URL = 'https://github.com/login/device/code';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const CLIENT_ID = 'Ov23liExampleClientId';

const grant = (over: Partial<DeviceCodeGrant> = {}): DeviceCodeGrant => ({
  deviceCode: 'dc-abc',
  userCode: 'WDJB-MJHT',
  verificationUri: 'https://github.com/login/device',
  expiresInSeconds: 900,
  intervalSeconds: 5,
  ...over,
});

/** Every body the fake endpoint was asked with, so a test can assert what was NOT sent. */
let sentBodies: URLSearchParams[] = [];

/**
 * Queue a sequence of JSON responses; each call shifts one off, and the last one repeats.
 *
 * Repeating matters for the expiry case: a provider keeps answering `authorization_pending` for as
 * long as nobody enters the code, so a queue that ran dry would end the loop for the wrong reason
 * and the test would pass without exercising the deadline.
 */
function stubFetch(responses: Array<Record<string, unknown>>) {
  const queue = [...responses];
  let last: Record<string, unknown> = responses[responses.length - 1] ?? {};
  globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
    sentBodies.push(new URLSearchParams(String(init?.body ?? '')));
    const body = queue.length > 0 ? queue.shift()! : last;
    last = body;
    return {
      ok: true,
      status: 200,
      json: async () => body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  sentBodies = [];
});

/** Never actually wait; the interval arithmetic is asserted from the recorded values instead. */
const waits: number[] = [];
const fakeSleep = async (ms: number) => {
  waits.push(ms);
};

describe('requestDeviceCode', () => {
  it('sends the client id and scopes, and no client secret', async () => {
    stubFetch([
      {
        device_code: 'dc-abc',
        user_code: 'WDJB-MJHT',
        verification_uri: 'https://github.com/login/device',
        expires_in: 900,
        interval: 5,
      },
    ]);

    await requestDeviceCode(DEVICE_URL, CLIENT_ID, ['repo', 'read:org']);

    expect(sentBodies[0].get('client_id')).toBe(CLIENT_ID);
    expect(sentBodies[0].get('scope')).toBe('repo read:org');
    // The reason this grant was adopted. GitHub: "The client_secret is not needed for the device
    // flow." If this key ever appears, a secret has to exist to fill it, and a released binary has
    // to carry it.
    expect(sentBodies[0].has('client_secret')).toBe(false);
  });

  it('returns the codes and the provider-supplied timings', async () => {
    stubFetch([
      {
        device_code: 'dc-xyz',
        user_code: 'ABCD-1234',
        verification_uri: 'https://github.com/login/device',
        expires_in: 600,
        interval: 7,
      },
    ]);

    const result = await requestDeviceCode(DEVICE_URL, CLIENT_ID, ['repo']);

    expect(result).toEqual({
      deviceCode: 'dc-xyz',
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
      expiresInSeconds: 600,
      intervalSeconds: 7,
    });
  });

  /**
   * The setting is off by default on a new OAuth app, so this is the first thing a fresh
   * registration hits. The message has to name the checkbox, or the reader has no way to know a
   * checkbox is what stands between them and signing in.
   */
  it('explains how to fix device flow being switched off', async () => {
    stubFetch([{ error: 'device_flow_disabled' }]);

    const err = await requestDeviceCode(DEVICE_URL, CLIENT_ID, ['repo']).catch((e) => e);

    expect(err).toBeInstanceOf(DeviceFlowError);
    expect(err.code).toBe('device_flow_disabled');
    expect(err.message).toContain('Enable Device Flow');
  });

  it('refuses a response that is missing a code', async () => {
    stubFetch([{ device_code: 'dc-abc', expires_in: 900 }]);

    const err = await requestDeviceCode(DEVICE_URL, CLIENT_ID, ['repo']).catch((e) => e);

    expect(err.code).toBe('INCOMPLETE_RESPONSE');
  });
});

describe('pollForDeviceToken', () => {
  it('keeps waiting through authorization_pending and returns the token', async () => {
    stubFetch([
      { error: 'authorization_pending' },
      { error: 'authorization_pending' },
      { access_token: 'gho_token', scope: 'repo,read:org', token_type: 'bearer' },
    ]);

    const token = await pollForDeviceToken(TOKEN_URL, CLIENT_ID, grant(), { sleep: fakeSleep });

    expect(token.accessToken).toBe('gho_token');
    expect(token.scope).toBe('repo,read:org');
  });

  it('sends the device grant type, and no client secret', async () => {
    stubFetch([{ access_token: 'gho_token' }]);

    await pollForDeviceToken(TOKEN_URL, CLIENT_ID, grant(), { sleep: fakeSleep });

    expect(sentBodies[0].get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:device_code');
    expect(sentBodies[0].get('device_code')).toBe('dc-abc');
    expect(sentBodies[0].has('client_secret')).toBe(false);
  });

  /**
   * GitHub documents the exact arithmetic: "5 extra seconds are added to the minimum interval".
   * The raise is permanent for the attempt — polling too fast is what caused the error, so going
   * back to the old interval would earn it again.
   */
  it('adds five seconds permanently after slow_down', async () => {
    waits.length = 0;
    stubFetch([
      { error: 'authorization_pending' },
      { error: 'slow_down' },
      { error: 'authorization_pending' },
      { access_token: 'gho_token' },
    ]);

    await pollForDeviceToken(TOKEN_URL, CLIENT_ID, grant({ intervalSeconds: 5 }), {
      sleep: fakeSleep,
    });

    expect(waits).toEqual([5000, 5000, 10000, 10000]);
  });

  it('waits before the first poll rather than after', async () => {
    waits.length = 0;
    stubFetch([{ access_token: 'gho_token' }]);

    await pollForDeviceToken(TOKEN_URL, CLIENT_ID, grant({ intervalSeconds: 5 }), {
      sleep: fakeSleep,
    });

    // One wait, taken before the single request: an immediate poll can only ever be answered
    // `authorization_pending`, because nobody has had time to type the code.
    expect(waits).toEqual([5000]);
  });

  it('stops and explains when the person cancels', async () => {
    stubFetch([{ error: 'access_denied' }]);

    const err = await pollForDeviceToken(TOKEN_URL, CLIENT_ID, grant(), {
      sleep: fakeSleep,
    }).catch((e) => e);

    expect(err.code).toBe('access_denied');
    expect(err.message).toContain('cancelled');
  });

  it('stops when the provider says the code expired', async () => {
    stubFetch([{ error: 'expired_token' }]);

    const err = await pollForDeviceToken(TOKEN_URL, CLIENT_ID, grant(), {
      sleep: fakeSleep,
    }).catch((e) => e);

    expect(err.code).toBe('expired_token');
  });

  /**
   * The deadline is the codes' own lifetime, not a timeout of ours: after `expires_in` the codes
   * stop working, so a further poll cannot succeed and waiting longer only delays the message.
   */
  it('gives up once the codes have outlived expires_in', async () => {
    stubFetch([{ error: 'authorization_pending' }]);
    let clock = 0;
    const err = await pollForDeviceToken(
      TOKEN_URL,
      CLIENT_ID,
      grant({ expiresInSeconds: 10, intervalSeconds: 5 }),
      {
        sleep: async (ms) => {
          clock += ms;
        },
        now: () => clock,
      },
    ).catch((e) => e);

    expect(err.code).toBe('expired_token');
  });

  it('refuses a response carrying neither a token nor an error', async () => {
    stubFetch([{}]);

    const err = await pollForDeviceToken(TOKEN_URL, CLIENT_ID, grant(), {
      sleep: fakeSleep,
    }).catch((e) => e);

    expect(err.code).toBe('EMPTY_RESPONSE');
  });
});
