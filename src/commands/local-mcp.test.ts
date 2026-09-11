import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

import { setupStandardMocks } from '../test-utils/mocks';
const { mockLoadConfig, mockDisplay } = setupStandardMocks();

// Stub the './local-mcp' module's `initializeLocalMCPs` so the real
// `listLocalMCPs` body can hand back our manager mock. Bun's mock.module is
// global across test files — list-tools.test.ts already replaces this module's
// exports — so we re-pin the full surface here. Our re-pin must come BEFORE
// the import below so the live binding picks up our `initializeLocalMCPs`
// stub when the function body is exercised.
const mockManagerInstance = {
  getAllLocalTools: mock(() => [] as Array<{ name: string; tools: unknown[] }>),
  getStats: mock(() => ({
    totalServers: 0,
    connectedServers: 0,
    totalTools: 0,
    registeredTools: 0,
  })),
  disconnect: mock(() => Promise.resolve()),
};

import * as localMcp from './local-mcp';
const { buildLocalMCPRegistryEntry, listLocalMCPs } = localMcp;
void mock.module('./local-mcp', () => ({
  ...localMcp,
  initializeLocalMCPs: async () => mockManagerInstance as any,
}));

describe('buildLocalMCPRegistryEntry', () => {
  // Primary security-critical behavior of list-local-mcps --json:
  // literal env values must never be written into CLI output.
  it('scrubs env values, emitting only key names', () => {
    const entry = buildLocalMCPRegistryEntry({
      id: 'mock-local',
      name: 'Mock Local Server',
      description: '',
      category: 'internal',
      launch: 'npx some-mcp',
      requiredEnvVars: ['MOCK_TOKEN'],
      env: {
        MOCK_TOKEN: 'literal-token-value-should-not-leak',
        OTHER_SECRET: 'another-literal-secret',
      },
    });

    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain('literal-token-value-should-not-leak');
    expect(serialized).not.toContain('another-literal-secret');

    expect(entry.env).toEqual(['MOCK_TOKEN', 'OTHER_SECRET']);

    expect(entry.id).toBe('mock-local');
    expect(entry.launch).toBe('npx some-mcp');
    expect(entry.requiredEnvVars).toEqual(['MOCK_TOKEN']);
  });

  it('omits optional fields when they are absent', () => {
    const entry = buildLocalMCPRegistryEntry({
      id: 'mock-local',
      name: 'Mock Local Server',
      description: '',
      category: 'internal',
      launch: 'npx some-mcp',
    });

    expect(entry).not.toHaveProperty('installation');
    expect(entry).not.toHaveProperty('requiredEnvVars');
    expect(entry).not.toHaveProperty('env');
  });
});

describe('listLocalMCPs non-JSON path', () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  const originalArgv = process.argv;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    process.argv = [...originalArgv];
    mockLoadConfig.mockClear();
    (mockDisplay.displayHeader as any).mockClear();
    (mockDisplay.displayError as any).mockClear();
    mockManagerInstance.getAllLocalTools.mockClear();
    mockManagerInstance.getStats.mockClear();
    mockManagerInstance.disconnect.mockClear();
    mockManagerInstance.getAllLocalTools.mockImplementation(() => [
      { name: 'mock-server', tools: [{ name: 'tool-a' }, { name: 'tool-b' }] },
    ]);
    mockManagerInstance.getStats.mockImplementation(() => ({
      totalServers: 1,
      connectedServers: 1,
      totalTools: 2,
      registeredTools: 2,
    }));
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    process.argv = originalArgv;
  });

  it('initializes the manager, prints stats, and disconnects in finally', async () => {
    await listLocalMCPs();

    expect(mockDisplay.displayHeader).toHaveBeenCalled();
    expect(mockManagerInstance.getAllLocalTools).toHaveBeenCalled();
    expect(mockManagerInstance.getStats).toHaveBeenCalled();
    expect(mockManagerInstance.disconnect).toHaveBeenCalled();
  });

  it('still calls disconnect when getAllLocalTools throws', async () => {
    const boom = new Error('connection lost');
    mockManagerInstance.getAllLocalTools.mockImplementation(() => {
      throw boom;
    });

    let caught: unknown;
    try {
      await listLocalMCPs();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(boom);
    expect(mockDisplay.displayError).toHaveBeenCalledWith('Failed to list local MCPs', boom);
    expect(mockManagerInstance.disconnect).toHaveBeenCalled();
  });
});

describe('listLocalMCPs --json error handling', () => {
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

  it('surfaces errors through displayError instead of swallowing', async () => {
    const boom = new Error('malformed config');
    mockLoadConfig.mockImplementation(() => {
      throw boom;
    });

    let caught: unknown;
    try {
      await listLocalMCPs();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(boom);
    expect(mockDisplay.displayError).toHaveBeenCalledWith('Failed to list local MCPs', boom);
  });
});
