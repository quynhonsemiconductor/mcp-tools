/**
 * Tests for keyring health validation check
 */

import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test';
import { keyringHealthCheck } from './keyring-health';
import type { QnscMcpConfigContext } from '../../types';
import { QNSCMCP_ISSUE_CODES } from '../../issue-codes';

describe('keyringHealthCheck', () => {
  let context: QnscMcpConfigContext;

  beforeEach(() => {
    context = {
      type: 'qnsc-mcp-config',
      config: {},
      filePath: '/test/.qnscmcp.yaml',
    };
  });

  afterEach(() => {
    mock.restore();
  });

  it('should have correct metadata', () => {
    expect(keyringHealthCheck.id).toBe('qnscmcp.keyring-health');
    expect(keyringHealthCheck.name).toBe('Keyring Health Check');
    expect(keyringHealthCheck.appliesTo).toBe('qnsc-mcp-config');
    expect(keyringHealthCheck.priority).toBe(15);
  });

  it('should report info when keyring is unavailable', async () => {
    // Mock keyring as unavailable
    void mock.module('../../../auth/keyring-loader', () => ({
      isKeyringAvailable: () => false,
      getKeyringEntry: () => {
        throw new Error('Not available');
      },
    }));

    const issues = await keyringHealthCheck.run(context);

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('info');
    expect(issues[0].code).toBe(QNSCMCP_ISSUE_CODES.KEYRING_UNAVAILABLE);
    expect(issues[0].message).toContain('not available');
  });

  it('should pass when keyring is healthy', async () => {
    // Mock healthy keyring
    void mock.module('../../../auth/keyring-loader', () => ({
      isKeyringAvailable: () => true,
      getKeyringEntry: () =>
        class MockEntry {
          constructor(
            public service: string,
            public name: string,
          ) {}
          getPassword() {
            return null;
          }
          setPassword(_password: string) {}
          deletePassword() {}
        },
    }));

    void mock.module('../../../auth/token-store', () => ({
      TokenStore: class MockTokenStore {
        async initialize() {}
        async getKeyringHealth() {
          return {
            available: true,
            failureCount: 0,
            lastError: null,
            recommendations: [],
          };
        }
      },
    }));

    const issues = await keyringHealthCheck.run(context);

    expect(issues).toHaveLength(0);
  });

  it('should detect keyring failures and report warnings', async () => {
    // Mock keyring with failures
    void mock.module('../../../auth/keyring-loader', () => ({
      isKeyringAvailable: () => true,
      getKeyringEntry: () =>
        class MockEntry {
          constructor(
            public service: string,
            public name: string,
          ) {}
          getPassword() {
            return null;
          }
          setPassword(_password: string) {}
          deletePassword() {}
        },
    }));

    void mock.module('../../../auth/token-store', () => ({
      TokenStore: class MockTokenStore {
        async initialize() {}
        async getKeyringHealth() {
          return {
            available: true,
            failureCount: 3,
            lastError: 'User canceled the operation',
            recommendations: ['Manual recovery needed'],
          };
        }
      },
    }));

    const issues = await keyringHealthCheck.run(context);

    expect(issues.length).toBeGreaterThan(0);
    const warnings = issues.filter((i) => i.severity === 'warning');
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].code).toBe(QNSCMCP_ISSUE_CODES.KEYRING_CORRUPTION);
  });

  it('should include platform-specific recovery instructions', async () => {
    void mock.module('../../../auth/keyring-loader', () => ({
      isKeyringAvailable: () => true,
      getKeyringEntry: () =>
        class MockEntry {
          constructor(
            public service: string,
            public name: string,
          ) {}
          getPassword() {
            return null;
          }
          setPassword(_password: string) {}
          deletePassword() {}
        },
    }));

    void mock.module('../../../auth/token-store', () => ({
      TokenStore: class MockTokenStore {
        async initialize() {}
        async getKeyringHealth() {
          return {
            available: true,
            failureCount: 2,
            lastError: 'Access denied',
            recommendations: [],
          };
        }
      },
    }));

    const issues = await keyringHealthCheck.run(context);

    const warnings = issues.filter((i) => i.severity === 'warning');
    expect(warnings.length).toBeGreaterThan(0);
    const details = warnings[0].details || '';
    // Should contain platform-specific instructions
    expect(
      details.includes('security delete-generic-password') || // macOS
        details.includes('Credential Manager') || // Windows
        details.includes('secret-tool'), // Linux
    ).toBe(true);
  });

  it('should handle errors gracefully without failing validation', async () => {
    // Mock that throws during health check
    void mock.module('../../../auth/keyring-loader', () => ({
      isKeyringAvailable: () => true,
      getKeyringEntry: () => {
        throw new Error('Unexpected error');
      },
    }));

    void mock.module('../../../auth/token-store', () => ({
      TokenStore: class MockTokenStore {
        async initialize() {
          throw new Error('Initialization failed');
        }
        async getKeyringHealth() {
          throw new Error('Health check failed');
        }
      },
    }));

    // Should not throw, just return empty issues or handle gracefully
    const issues = await keyringHealthCheck.run(context);

    // Check may return issues or empty array, but should not throw
    expect(Array.isArray(issues)).toBe(true);
  });

  it('should check multiple services (GitHub, Slack)', async () => {
    const initializedServices: string[] = [];

    void mock.module('../../../auth/keyring-loader', () => ({
      isKeyringAvailable: () => true,
      getKeyringEntry: () =>
        class MockEntry {
          constructor(
            public service: string,
            public name: string,
          ) {}
          getPassword() {
            return null;
          }
          setPassword(_password: string) {}
          deletePassword() {}
        },
    }));

    void mock.module('../../../auth/token-store', () => ({
      TokenStore: class MockTokenStore {
        constructor(serviceName: string) {
          initializedServices.push(serviceName);
        }
        async initialize() {}
        async getKeyringHealth() {
          return {
            available: true,
            failureCount: 0,
            lastError: null,
            recommendations: [],
          };
        }
      },
    }));

    await keyringHealthCheck.run(context);

    // Should check GitHub and Slack
    expect(initializedServices).toContain('qnsc-mcp-github');
    expect(initializedServices).toContain('qnsc-mcp-slack');
    // Mural's local tools were decommissioned in favor of the connector, so its
    // keystore is orphaned and must not be probed.
    expect(initializedServices).not.toContain('qnsc-mcp-mural');
  });
});
