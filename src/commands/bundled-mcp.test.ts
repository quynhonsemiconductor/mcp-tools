import { describe, expect, it } from 'bun:test';

import { setupStandardMocks } from '../test-utils/mocks';
setupStandardMocks();

import { buildBundledMCPJsonEntry } from './bundled-mcp';

describe('buildBundledMCPJsonEntry', () => {
  // EnvVarConfig carries `default` and `mock` fields that can hold real
  // credential values (see env-filter.ts, mcp-batch-bundler.ts). These
  // must never appear in `list-bundled-mcps --json` output.
  it('scrubs EnvVarConfig fields, emitting only name/description/required', () => {
    const entry = buildBundledMCPJsonEntry({
      name: 'mock-bundled',
      version: '1.0.0',
      path: '/mock/path',
      tools: [{ name: 'toolA' } as any],
      enabled: true,
      envVars: [
        {
          name: 'API_KEY',
          description: 'API key for the service',
          required: true,
          default: 'literal-default-secret-should-not-leak',
          mock: 'literal-mock-secret-should-not-leak',
        },
        {
          name: 'OPTIONAL_VAR',
          required: false,
          default: 'another-literal-default',
        },
      ],
      args: ['--flag'],
    });

    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain('literal-default-secret-should-not-leak');
    expect(serialized).not.toContain('literal-mock-secret-should-not-leak');
    expect(serialized).not.toContain('another-literal-default');

    expect(entry.envVars).toEqual([
      {
        name: 'API_KEY',
        description: 'API key for the service',
        required: true,
      },
      {
        name: 'OPTIONAL_VAR',
        description: undefined,
        required: false,
      },
    ]);

    expect(entry.name).toBe('mock-bundled');
    expect(entry.args).toEqual(['--flag']);
  });

  it('omits envVars and args when empty', () => {
    const entry = buildBundledMCPJsonEntry({
      name: 'mock-bundled',
      version: '1.0.0',
      path: '/mock/path',
      tools: [],
      enabled: true,
    });

    expect(entry).not.toHaveProperty('envVars');
    expect(entry).not.toHaveProperty('args');
  });
});
