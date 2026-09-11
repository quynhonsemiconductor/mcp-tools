/**
 * Shared Entra ID mock setup for middleware tests.
 *
 * Provides a reusable function to mock the `../entra-id` and `../entra-id/config`
 * modules with consistent test fixtures. Avoids duplicating ~40 lines of mock setup
 * across platform-auth, backwards-compat, and dual-layer-auth test files.
 */

import { mock } from 'bun:test';
import type { EntraIdConfig, ServiceAuthConfig } from '../services/auth/entra-id/types';

/** Default test config matching production structure */
const DEFAULT_TEST_CONFIG: EntraIdConfig = {
  clientId: 'test-client-id',
  tenantId: 'test-tenant-id',
  platformUrl: 'https://platform.example.com',
  callbackPort: 9876,
  loginTimeoutMs: 120_000,
  scopes: ['openid'],
};

// Synthetic `example-*` entries so the auth suite anchors on stable fixtures, not
// real services that come and go as they migrate to connectors. splunk/smartsheet
// mirror the real SERVICE_AUTH_MAP: this mock leaks globally (mock.module in Bun),
// so it must stay a superset for tests that read the real map (e.g. remote-mcp-client).
export const DEFAULT_SERVICE_AUTH_MAP: Record<string, ServiceAuthConfig> = {
  'example-service': {
    headerName: 'x-example-token',
    envVar: 'EXAMPLE_SERVICE_TOKEN',
  },
  'example-bearer-service': {
    headerName: 'Authorization',
    envVar: 'EXAMPLE_BEARER_KEY',
    valueTemplate: 'Bearer ${value}',
  },
  splunk: {
    headerName: 'x-splunk-token',
    envVar: 'SPLUNK_TOKEN',
  },
  smartsheet: {
    headerName: 'Authorization',
    envVar: 'SMARTSHEET_API_KEY',
    valueTemplate: 'Bearer ${value}',
  },
};

/**
 * Options for customizing the Entra ID mock setup.
 */
export interface EntraIdMockOptions {
  /** Override the default test config */
  config?: Partial<EntraIdConfig>;
  /** Override the default token value returned by getToken */
  tokenValue?: string;
  /** Override the SERVICE_AUTH_MAP */
  serviceAuthMap?: Record<string, ServiceAuthConfig>;
}

/**
 * Set up mock modules for `../entra-id` and `../entra-id/config`.
 *
 * Must be called at module scope (before imports of the module under test)
 * since `mock.module()` must precede the first import.
 *
 * @param options - Optional overrides for config and token values
 * @returns Object with mock functions for assertions and resets in tests
 */
export function setupEntraIdMocks(options: EntraIdMockOptions = {}) {
  const config = { ...DEFAULT_TEST_CONFIG, ...options.config };
  const tokenValue = options.tokenValue ?? 'test-jwt-token';
  const serviceAuthMap = options.serviceAuthMap ?? DEFAULT_SERVICE_AUTH_MAP;

  const mockGetToken = mock(() => Promise.resolve(tokenValue));
  const mockTokenManager = { getToken: mockGetToken };
  const mockGetEntraIdTokenManager = mock(() => Promise.resolve(mockTokenManager));

  const moduleFactory = () => ({
    getEntraIdTokenManager: mockGetEntraIdTokenManager,
    loadEntraIdConfig: () => config,
    SERVICE_AUTH_MAP: serviceAuthMap,
    CALLBACK_PORTS: [9876, 9877, 9878, 9879],
  });

  const configFactory = () => ({
    loadEntraIdConfig: () => config,
    SERVICE_AUTH_MAP: serviceAuthMap,
    CALLBACK_PORTS: [9876, 9877, 9878, 9879],
  });

  mock.module('../services/auth/entra-id', moduleFactory);
  mock.module('../services/auth/entra-id/config', configFactory);

  return { mockGetToken, mockTokenManager, mockGetEntraIdTokenManager };
}
