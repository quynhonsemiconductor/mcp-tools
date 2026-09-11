import '../../../../test-utils/mocks';

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { QnscMcpConfigContext } from '../../types';
import { QNSCMCP_ISSUE_CODES } from '../../issue-codes';
import { tlsTrustStoreCheck } from './tls-trust-store';

describe('tlsTrustStoreCheck', () => {
  const originalPlatform = process.platform;
  const originalSystemCa = process.env.NODE_USE_SYSTEM_CA;
  const originalExtraCerts = process.env.NODE_EXTRA_CA_CERTS;

  let context: QnscMcpConfigContext;

  beforeEach(() => {
    context = {
      type: 'qnsc-mcp-config',
      config: {},
      filePath: '/test/.qnscmcp.yaml',
    };
    delete process.env.NODE_USE_SYSTEM_CA;
    delete process.env.NODE_EXTRA_CA_CERTS;
  });

  afterEach(() => {
    mock.restore();
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    if (originalSystemCa === undefined) delete process.env.NODE_USE_SYSTEM_CA;
    else process.env.NODE_USE_SYSTEM_CA = originalSystemCa;
    if (originalExtraCerts === undefined) delete process.env.NODE_EXTRA_CA_CERTS;
    else process.env.NODE_EXTRA_CA_CERTS = originalExtraCerts;
  });

  function stubPlatform(platform: NodeJS.Platform): void {
    Object.defineProperty(process, 'platform', { value: platform });
  }

  it('has correct metadata', () => {
    expect(tlsTrustStoreCheck.id).toBe('qnscmcp.tls-trust-store');
    expect(tlsTrustStoreCheck.appliesTo).toBe('qnsc-mcp-config');
  });

  it('is a no-op on Linux', async () => {
    stubPlatform('linux');
    process.env.NODE_USE_SYSTEM_CA = '0';
    const issues = tlsTrustStoreCheck.run(context);
    expect(issues).toEqual([]);
  });

  it('passes when defaults are in place on Windows', async () => {
    stubPlatform('win32');
    process.env.NODE_USE_SYSTEM_CA = '1';
    const issues = tlsTrustStoreCheck.run(context);
    expect(issues).toEqual([]);
  });

  it('passes when user has provided a valid NODE_EXTRA_CA_CERTS', async () => {
    stubPlatform('darwin');
    void mock.module('fs', () => ({
      default: { existsSync: () => true },
      existsSync: () => true,
    }));
    process.env.NODE_EXTRA_CA_CERTS = '/Users/test/corp-ca.pem';
    const issues = tlsTrustStoreCheck.run(context);
    expect(issues).toEqual([]);
  });

  it('warns when NODE_EXTRA_CA_CERTS points at a missing file', async () => {
    stubPlatform('win32');
    void mock.module('fs', () => ({
      default: { existsSync: () => false },
      existsSync: () => false,
    }));
    process.env.NODE_EXTRA_CA_CERTS = 'C:\\missing\\ca.pem';
    const issues = tlsTrustStoreCheck.run(context);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].code).toBe(QNSCMCP_ISSUE_CODES.TLS_TRUST_STORE_DISABLED);
    expect(issues[0].message).toContain('does not exist');
  });

  it('warns when NODE_USE_SYSTEM_CA is explicitly disabled with no alternate bundle', async () => {
    stubPlatform('win32');
    process.env.NODE_USE_SYSTEM_CA = '0';
    const issues = tlsTrustStoreCheck.run(context);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].code).toBe(QNSCMCP_ISSUE_CODES.TLS_TRUST_STORE_DISABLED);
    expect(issues[0].message).toContain('NODE_USE_SYSTEM_CA');
  });

  it('does not warn when NODE_USE_SYSTEM_CA is disabled but NODE_EXTRA_CA_CERTS is provided', async () => {
    stubPlatform('darwin');
    void mock.module('fs', () => ({
      default: { existsSync: () => true },
      existsSync: () => true,
    }));
    process.env.NODE_USE_SYSTEM_CA = '0';
    process.env.NODE_EXTRA_CA_CERTS = '/Users/test/corp-ca.pem';
    const issues = tlsTrustStoreCheck.run(context);
    expect(issues).toEqual([]);
  });

  it('passes when both NODE_USE_SYSTEM_CA=1 and a valid NODE_EXTRA_CA_CERTS are set', async () => {
    // Most common corp-laptop state after setupTrustStore() runs and the user
    // also points at a custom PEM bundle. Locks in the contract so a future
    // condition-reorder of run() can't false-positive this combination.
    stubPlatform('darwin');
    void mock.module('fs', () => ({
      default: { existsSync: () => true },
      existsSync: () => true,
    }));
    process.env.NODE_USE_SYSTEM_CA = '1';
    process.env.NODE_EXTRA_CA_CERTS = '/Users/test/corp-ca.pem';
    const issues = tlsTrustStoreCheck.run(context);
    expect(issues).toEqual([]);
  });

  it('warns when NODE_USE_SYSTEM_CA is an empty string with no alternate bundle', async () => {
    // Guards against a `||` (truthy) check silently letting `NODE_USE_SYSTEM_CA=`
    // pass through. Empty string is a user-facing value, not "unset".
    stubPlatform('win32');
    process.env.NODE_USE_SYSTEM_CA = '';
    const issues = tlsTrustStoreCheck.run(context);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].code).toBe(QNSCMCP_ISSUE_CODES.TLS_TRUST_STORE_DISABLED);
  });
});
