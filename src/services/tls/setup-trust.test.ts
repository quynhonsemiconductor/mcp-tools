import '../../test-utils/mocks';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { selectBunBeBunTlsEnv, setupTrustStore } from './setup-trust';

describe('setupTrustStore', () => {
  const originalPlatform = process.platform;
  const originalNodeUseSystemCa = process.env.NODE_USE_SYSTEM_CA;
  const originalNodeExtraCaCerts = process.env.NODE_EXTRA_CA_CERTS;

  beforeEach(() => {
    delete process.env.NODE_USE_SYSTEM_CA;
    delete process.env.NODE_EXTRA_CA_CERTS;
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    if (originalNodeUseSystemCa === undefined) {
      delete process.env.NODE_USE_SYSTEM_CA;
    } else {
      process.env.NODE_USE_SYSTEM_CA = originalNodeUseSystemCa;
    }
    if (originalNodeExtraCaCerts === undefined) {
      delete process.env.NODE_EXTRA_CA_CERTS;
    } else {
      process.env.NODE_EXTRA_CA_CERTS = originalNodeExtraCaCerts;
    }
  });

  function stubPlatform(platform: NodeJS.Platform): void {
    Object.defineProperty(process, 'platform', { value: platform });
  }

  it('sets NODE_USE_SYSTEM_CA=1 on Windows when no user override', () => {
    stubPlatform('win32');
    setupTrustStore();
    expect(process.env.NODE_USE_SYSTEM_CA).toBe('1');
  });

  it('sets NODE_USE_SYSTEM_CA=1 on macOS when no user override', () => {
    stubPlatform('darwin');
    setupTrustStore();
    expect(process.env.NODE_USE_SYSTEM_CA).toBe('1');
  });

  it('is a no-op on Linux (distro OpenSSL already trusts system CAs)', () => {
    stubPlatform('linux');
    setupTrustStore();
    expect(process.env.NODE_USE_SYSTEM_CA).toBeUndefined();
  });

  it('respects an existing NODE_USE_SYSTEM_CA value', () => {
    stubPlatform('win32');
    process.env.NODE_USE_SYSTEM_CA = '0';
    setupTrustStore();
    expect(process.env.NODE_USE_SYSTEM_CA).toBe('0');
  });

  it('treats NODE_USE_SYSTEM_CA="" (empty string) as unset and enables system CA', () => {
    // The guard intentionally uses `||` so empty-string is considered "no preference"
    // and the auto-wiring still runs. A future refactor to `??` (nullish-only) would
    // silently regress this behavior; this test documents the contract.
    stubPlatform('darwin');
    process.env.NODE_USE_SYSTEM_CA = '';
    setupTrustStore();
    expect(process.env.NODE_USE_SYSTEM_CA).toBe('1');
  });

  it('respects an existing NODE_EXTRA_CA_CERTS and does not also enable system CA', () => {
    // User has opted into a specific PEM bundle; don't override their choice
    // by flipping on the broader system-CA merge.
    stubPlatform('darwin');
    process.env.NODE_EXTRA_CA_CERTS = '/tmp/corp-ca.pem';
    setupTrustStore();
    expect(process.env.NODE_USE_SYSTEM_CA).toBeUndefined();
    expect(process.env.NODE_EXTRA_CA_CERTS).toBe('/tmp/corp-ca.pem');
  });
});

describe('selectBunBeBunTlsEnv', () => {
  const originalSystemCa = process.env.NODE_USE_SYSTEM_CA;
  const originalExtraCerts = process.env.NODE_EXTRA_CA_CERTS;
  const originalSslCertFile = process.env.SSL_CERT_FILE;

  beforeEach(() => {
    delete process.env.NODE_USE_SYSTEM_CA;
    delete process.env.NODE_EXTRA_CA_CERTS;
    delete process.env.SSL_CERT_FILE;
  });

  afterEach(() => {
    if (originalSystemCa === undefined) delete process.env.NODE_USE_SYSTEM_CA;
    else process.env.NODE_USE_SYSTEM_CA = originalSystemCa;
    if (originalExtraCerts === undefined) delete process.env.NODE_EXTRA_CA_CERTS;
    else process.env.NODE_EXTRA_CA_CERTS = originalExtraCerts;
    if (originalSslCertFile === undefined) delete process.env.SSL_CERT_FILE;
    else process.env.SSL_CERT_FILE = originalSslCertFile;
  });

  it('returns an empty object when no TLS vars are set on the parent', () => {
    expect(selectBunBeBunTlsEnv()).toEqual({});
  });

  it('forwards NODE_USE_SYSTEM_CA when set', () => {
    process.env.NODE_USE_SYSTEM_CA = '1';
    expect(selectBunBeBunTlsEnv()).toEqual({ NODE_USE_SYSTEM_CA: '1' });
  });

  it('forwards NODE_EXTRA_CA_CERTS when set', () => {
    process.env.NODE_EXTRA_CA_CERTS = '/tmp/corp-ca.pem';
    expect(selectBunBeBunTlsEnv()).toEqual({ NODE_EXTRA_CA_CERTS: '/tmp/corp-ca.pem' });
  });

  it('forwards SSL_CERT_FILE when set', () => {
    process.env.SSL_CERT_FILE = '/tmp/ca.pem';
    expect(selectBunBeBunTlsEnv()).toEqual({ SSL_CERT_FILE: '/tmp/ca.pem' });
  });

  it('forwards all three when all are set', () => {
    process.env.NODE_USE_SYSTEM_CA = '1';
    process.env.NODE_EXTRA_CA_CERTS = '/tmp/corp-ca.pem';
    process.env.SSL_CERT_FILE = '/tmp/ca.pem';
    expect(selectBunBeBunTlsEnv()).toEqual({
      NODE_USE_SYSTEM_CA: '1',
      NODE_EXTRA_CA_CERTS: '/tmp/corp-ca.pem',
      SSL_CERT_FILE: '/tmp/ca.pem',
    });
  });
});
