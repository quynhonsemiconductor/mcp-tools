import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { setupStandardMocks } from '../test-utils/mocks';
const { mockLoadConfig, mockDisplay } = setupStandardMocks();

import { buildRemoteMCPRegistryEntry, listRemoteMCPs } from './remote-mcp';

describe('buildRemoteMCPRegistryEntry', () => {
  // This is the primary security-critical behavior of the --json path:
  // bearer tokens and other literal header values must never be written
  // into CLI output. A refactor that passes `server.headers` through
  // directly would silently ship credentials.
  it('scrubs header values, emitting only key names', () => {
    const entry = buildRemoteMCPRegistryEntry({
      id: 'mock-remote',
      name: 'Mock Remote Server',
      description: 'Remote server with literal header values for scrubbing test',
      url: 'https://example.com/mcp',
      category: 'internal',
      authType: 'static',
      requiredEnvVars: ['MOCK_TOKEN'],
      headers: {
        Authorization: 'Bearer super-secret-literal-token-xyz',
        'X-Api-Key': 'literal-api-key-abc',
      },
    });

    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain('super-secret-literal-token-xyz');
    expect(serialized).not.toContain('literal-api-key-abc');

    expect(entry.headers).toEqual(['Authorization', 'X-Api-Key']);

    expect(entry.id).toBe('mock-remote');
    expect(entry.authType).toBe('static');
    expect(entry.requiredEnvVars).toEqual(['MOCK_TOKEN']);
  });

  it('excludes internal fields like oAuthClientInformation', () => {
    const entry = buildRemoteMCPRegistryEntry({
      id: 'mock-remote',
      name: 'Mock Remote Server',
      description: '',
      url: 'https://example.com/mcp',
      category: 'internal',
      oAuthClientInformation: { client_id: 'should-not-appear' } as any,
    });

    expect(entry).not.toHaveProperty('oAuthClientInformation');
    expect(JSON.stringify(entry)).not.toContain('should-not-appear');
  });

  it('omits optional fields when they are absent', () => {
    const entry = buildRemoteMCPRegistryEntry({
      id: 'mock-remote',
      name: 'Mock Remote Server',
      description: '',
      url: 'https://example.com/mcp',
      category: 'internal',
    });

    expect(entry).not.toHaveProperty('authType');
    expect(entry).not.toHaveProperty('requiredEnvVars');
    expect(entry).not.toHaveProperty('headers');
  });
});

describe('listRemoteMCPs --json error handling', () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  const originalArgv = process.argv;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    process.argv = [...originalArgv, '--json'];
    mockLoadConfig.mockClear();
    (mockDisplay.displayError as any).mockClear();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    process.argv = originalArgv;
  });

  // Mirrors the behavior tested in local-mcp.test.ts: errors in the --json
  // path must surface through displayError with the correct command label,
  // not be swallowed or mislabeled (the prior copy/paste reported "bundled").
  it('reports "Failed to list remote MCPs" and rethrows on loadConfig failure', async () => {
    const boom = new Error('malformed config');
    mockLoadConfig.mockImplementation(() => {
      throw boom;
    });

    let caught: unknown;
    try {
      await listRemoteMCPs();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(boom);
    expect(mockDisplay.displayError).toHaveBeenCalledWith('Failed to list remote MCPs', boom);
  });
});
