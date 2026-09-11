import { describe, expect, it } from 'bun:test';

import { setupStandardMocks } from './mocks';
setupStandardMocks();

import { DEFAULT_SERVICE_AUTH_MAP } from './entra-id-mocks';
import { SERVICE_AUTH_MAP } from '../services/auth/entra-id/config';

// `mock.module` leaks globally in Bun, so setupEntraIdMocks' fixture must stay a
// superset of the real SERVICE_AUTH_MAP — otherwise a test file that reads the
// real map (e.g. remote-mcp-client) silently sees a thinner shape. This asserts
// the invariant so a future addition to the real map that's missing from the
// fixture fails loudly here instead of passing on stale data downstream.
describe('entra-id-mocks fixture', () => {
  it('DEFAULT_SERVICE_AUTH_MAP is a superset of the real SERVICE_AUTH_MAP', () => {
    for (const [service, config] of Object.entries(SERVICE_AUTH_MAP)) {
      expect(
        DEFAULT_SERVICE_AUTH_MAP[service],
        `fixture is missing real service "${service}"`,
      ).toEqual(config);
    }
  });
});
