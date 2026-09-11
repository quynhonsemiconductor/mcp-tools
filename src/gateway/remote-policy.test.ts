/**
 * remote-policy.test.ts - Tests for remote routing policy
 */
import '../test-utils/mocks';
import { afterEach, beforeEach, describe, expect, it, mock, type Mock } from 'bun:test';
import type { QnscMcpConfig } from '../config';
import type { ToolRegistryManager } from '../registry/tool-registry';
import type { RemoteMCPManager } from './remote-mcp-manager';
import {
  applyRemotePolicy,
  EMPTY_POLICY,
  fetchRemotePolicy,
  isValidPolicyUrl,
  resolvePolicyUrl,
  resolveRemoteServerUrl,
  type RemoteCategoryPolicy,
  type RemotePolicy,
  shouldApplyPolicy,
} from './remote-policy';

// mocks.ts defines logDebug/logInfo/logWarn/logError as `mock(() => {})` with
// no parameter types, so bun infers their `.mock.calls` element type as `[]`.
// The real logger signature is `(message: string, data?: unknown) => void`;
// re-typing here (rather than in mocks.ts, which is out of scope) lets
// `.mock.calls[0][0]` resolve to `string` for the assertions below instead of
// erroring on an out-of-bounds tuple index.
type LogMockFn = Mock<(message: string, data?: unknown) => void>;

// Re-import (not a static top-level import) so this always resolves against
// whatever module is currently registered for 'services/logger' at the time
// the test runs. remote-tool-coercion.test.ts's own setupStandardMocks() call
// re-registers a fresh logger mock later in the same process, and a static
// import captured at this file's load time would keep pointing at the
// now-stale original mock — silently observing zero calls even though
// production code is calling the live one. A dynamic import re-resolves the
// module registry at call time, same as the `require()` this replaces.
async function getLoggerMocks() {
  return (await import('../services/logger')) as unknown as {
    logDebug: LogMockFn;
    logInfo: LogMockFn;
    logWarn: LogMockFn;
    logError: LogMockFn;
  };
}

// --- Mocks for applyRemotePolicy ---

function createMockRegistry(): ToolRegistryManager {
  return {
    addExcludedCategories: mock(() => {}),
    addExcludedTools: mock(() => {}),
    addIncludedCategories: mock(() => {}),
    getConfig: mock(() => ({})),
  } as unknown as ToolRegistryManager;
}

function createMockRemoteMCPManager(
  connectionStatus: Record<string, string> = {},
): RemoteMCPManager {
  return {
    getConnectionStatus: mock(() => connectionStatus),
  } as unknown as RemoteMCPManager;
}

function createMockConfig(overrides: Partial<QnscMcpConfig> = {}): QnscMcpConfig {
  return {
    tools: {
      includeRemoteMCPs: ['k6'],
      include: [],
      exclude: [],
      includeCategories: [],
      excludeCategories: [],
      ...overrides.tools,
    },
    ...overrides,
  } as QnscMcpConfig;
}

// --- fetchRemotePolicy ---

describe('fetchRemotePolicy', () => {
  it('returns EMPTY_POLICY when endpoint is unreachable', async () => {
    const originalFetch = global.fetch;
    global.fetch = mock(() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch;
    const result = await fetchRemotePolicy(2000, 'http://example.com/nonexistent');
    expect(result).toEqual(EMPTY_POLICY);
    global.fetch = originalFetch;
  });

  it('returns EMPTY_POLICY when response is not ok', async () => {
    const originalFetch = global.fetch;
    global.fetch = mock(() =>
      Promise.resolve({ ok: false, status: 503 } as Response),
    ) as unknown as typeof fetch;

    const result = await fetchRemotePolicy(2000, 'http://example.com/policy');
    expect(result).toEqual(EMPTY_POLICY);

    global.fetch = originalFetch;
  });

  it('returns EMPTY_POLICY when response has invalid format', async () => {
    const originalFetch = global.fetch;
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ invalid: true }),
      } as Response),
    ) as unknown as typeof fetch;

    const result = await fetchRemotePolicy(2000, 'http://example.com/policy');
    expect(result).toEqual(EMPTY_POLICY);

    global.fetch = originalFetch;
  });

  it('returns parsed policy on valid response', async () => {
    const validPolicy: RemotePolicy = {
      version: 1,
      policies: {
        k6: {
          enabled: true,
          suppressLocalCategories: ['k6', 'k6: Board'],
        },
      },
    };

    const originalFetch = global.fetch;
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(validPolicy),
      } as Response),
    ) as unknown as typeof fetch;

    const result = await fetchRemotePolicy(2000, 'http://example.com/policy');
    expect(result).toEqual(validPolicy);

    global.fetch = originalFetch;
  });

  it('returns EMPTY_POLICY on timeout', async () => {
    const originalFetch = global.fetch;
    global.fetch = mock(
      (_url: string | URL | Request, opts?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          const timer = setTimeout(() => resolve({ ok: true } as Response), 10000);
          // Respect AbortSignal like real fetch does
          opts?.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    ) as unknown as typeof fetch;

    const result = await fetchRemotePolicy(100, 'http://example.com/policy');
    expect(result).toEqual(EMPTY_POLICY);

    global.fetch = originalFetch;
  });

  it('returns EMPTY_POLICY when response contains invalid JSON', async () => {
    const originalFetch = global.fetch;
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON')),
      } as Response),
    ) as unknown as typeof fetch;

    const result = await fetchRemotePolicy(2000, 'http://example.com/policy');
    expect(result).toEqual(EMPTY_POLICY);

    global.fetch = originalFetch;
  });

  it('returns EMPTY_POLICY on network TypeError', async () => {
    const originalFetch = global.fetch;
    global.fetch = mock(() =>
      Promise.reject(new TypeError('fetch failed')),
    ) as unknown as typeof fetch;

    const result = await fetchRemotePolicy(2000, 'http://example.com/policy');
    expect(result).toEqual(EMPTY_POLICY);

    global.fetch = originalFetch;
  });

  it('returns EMPTY_POLICY when policy version is not 1', async () => {
    const originalFetch = global.fetch;
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            version: 2,
            policies: { k6: { enabled: true, suppressLocalCategories: ['k6'] } },
          }),
      } as Response),
    ) as unknown as typeof fetch;

    const result = await fetchRemotePolicy(2000, 'http://example.com/policy');
    expect(result).toEqual(EMPTY_POLICY);

    global.fetch = originalFetch;
  });
});

// --- resolvePolicyUrl ---

describe('resolvePolicyUrl', () => {
  it('returns explicit policyUrl when provided', () => {
    expect(resolvePolicyUrl('http://custom.example.com/policy')).toBe(
      'http://custom.example.com/policy',
    );
  });

  it('returns non-prod URL for default tier', () => {
    const url = resolvePolicyUrl();
    expect(url).toBe('https://policy.mcp-np.ai.qnsc.vn/config');
  });

  it('returns prod URL for prod tier', () => {
    expect(resolvePolicyUrl(undefined, 'prod')).toBe('https://policy.mcp-prod.ai.qnsc.vn/config');
  });

  it('returns pre-prod URL for pre-prod tier', () => {
    expect(resolvePolicyUrl(undefined, 'pre-prod')).toBe('https://policy.mcp-pp.ai.qnsc.vn/config');
  });

  it('returns undefined for unknown tier', () => {
    expect(resolvePolicyUrl(undefined, 'unknown-tier')).toBeUndefined();
  });
});

// --- shouldApplyPolicy ---

describe('shouldApplyPolicy', () => {
  it('returns false when policy is not enabled', () => {
    const policy: RemoteCategoryPolicy = {
      enabled: false,
      suppressLocalCategories: ['k6'],
    };
    expect(shouldApplyPolicy(policy)).toBe(false);
  });

  it('returns true when policy is enabled with no client filter', () => {
    const policy: RemoteCategoryPolicy = {
      enabled: true,
      suppressLocalCategories: ['k6'],
    };
    expect(shouldApplyPolicy(policy)).toBe(true);
  });

  it('filters by client name', () => {
    const policy: RemoteCategoryPolicy = {
      enabled: true,
      suppressLocalCategories: ['k6'],
      clients: ['vscode'],
    };
    expect(shouldApplyPolicy(policy, 'vscode')).toBe(true);
    expect(shouldApplyPolicy(policy, 'cloud-desktop')).toBe(false);
  });

  it('client matching is case-insensitive', () => {
    const policy: RemoteCategoryPolicy = {
      enabled: true,
      suppressLocalCategories: ['k6'],
      clients: ['VSCode'],
    };
    expect(shouldApplyPolicy(policy, 'vscode')).toBe(true);
  });

  it('does not apply when no clientHint is provided and clients filter is set', () => {
    const policy: RemoteCategoryPolicy = {
      enabled: true,
      suppressLocalCategories: ['k6'],
      clients: ['vscode'],
    };
    // No clientHint = can't confirm client matches, don't suppress
    expect(shouldApplyPolicy(policy)).toBe(false);
  });

  it('ignores non-string entries in clients array', () => {
    const policy = {
      enabled: true,
      suppressLocalCategories: ['k6'],
      clients: ['vscode', 123, null, 'claude-code'],
    } as unknown as RemoteCategoryPolicy;
    expect(shouldApplyPolicy(policy, 'vscode')).toBe(true);
    expect(shouldApplyPolicy(policy, 'claude-code')).toBe(true);
    expect(shouldApplyPolicy(policy, 'other')).toBe(false);
  });

  it('supports multiple client names', () => {
    const policy: RemoteCategoryPolicy = {
      enabled: true,
      suppressLocalCategories: ['k6'],
      clients: ['vscode', 'claude-code'],
    };
    expect(shouldApplyPolicy(policy, 'vscode')).toBe(true);
    expect(shouldApplyPolicy(policy, 'claude-code')).toBe(true);
    expect(shouldApplyPolicy(policy, 'cloud-desktop')).toBe(false);
  });
});

// --- applyRemotePolicy ---

describe('applyRemotePolicy', () => {
  it('returns empty array when policy has no entries', async () => {
    const config = createMockConfig();
    const manager = createMockRemoteMCPManager({ k6: 'connected' });
    const registry = createMockRegistry();

    const result = applyRemotePolicy(config, manager, registry, EMPTY_POLICY);
    expect(result).toEqual([]);
    expect(registry.addExcludedCategories).not.toHaveBeenCalled();
  });

  it('returns empty array instead of crashing when policy.policies is missing at runtime', async () => {
    // Same untyped-JSON-over-the-network reasoning as resolveRemoteServerUrl's
    // identical regression test — applyRemotePolicy previously had no guard
    // here (Object.keys(policy.policies) would throw on a bare { version: 1 }).
    const config = createMockConfig();
    const manager = createMockRemoteMCPManager({ k6: 'connected' });
    const registry = createMockRegistry();
    const malformedPolicy = { version: 1 } as unknown as RemotePolicy;

    const result = applyRemotePolicy(config, manager, registry, malformedPolicy);
    expect(result).toEqual([]);
    expect(registry.addExcludedCategories).not.toHaveBeenCalled();
  });

  it('suppresses local categories when remote is connected and policy is enabled', async () => {
    const config = createMockConfig();
    const manager = createMockRemoteMCPManager({ k6: 'connected' });
    const registry = createMockRegistry();

    const policy: RemotePolicy = {
      version: 1,
      policies: {
        k6: {
          enabled: true,
          suppressLocalCategories: ['k6', 'k6: Board'],
        },
      },
    };

    const result = applyRemotePolicy(config, manager, registry, policy);
    expect(result).toEqual(['k6', 'k6: Board']);
    expect(registry.addExcludedCategories).toHaveBeenCalledWith(['k6', 'k6: Board']);
  });

  it('suppresses individual local tools by ID when remote is connected and enabled', async () => {
    const config = createMockConfig({ tools: { includeRemoteMCPs: ['sled'] } });
    const manager = createMockRemoteMCPManager({ sled: 'connected' });
    const registry = createMockRegistry();

    const policy: RemotePolicy = {
      version: 1,
      policies: {
        sled: {
          enabled: true,
          suppressLocalCategories: [],
          suppressLocalTools: ['sled'],
        },
      },
    };

    const result = applyRemotePolicy(config, manager, registry, policy);
    // Return value stays category-scoped; tool suppression is a registry side-effect.
    expect(result).toEqual([]);
    expect(registry.addExcludedTools).toHaveBeenCalledWith(['sled']);
    expect(registry.addExcludedCategories).not.toHaveBeenCalled();
  });

  it('suppresses tools for a tool-only policy entry (no suppressLocalCategories)', async () => {
    const config = createMockConfig({ tools: { includeRemoteMCPs: ['sled'] } });
    const manager = createMockRemoteMCPManager({ sled: 'connected' });
    const registry = createMockRegistry();

    const policy: RemotePolicy = {
      version: 1,
      policies: {
        sled: { enabled: true, suppressLocalTools: ['sled'] },
      },
    };

    applyRemotePolicy(config, manager, registry, policy);
    expect(registry.addExcludedTools).toHaveBeenCalledWith(['sled']);
  });

  it('does not suppress tools when the remote server is not connected', async () => {
    const config = createMockConfig({ tools: { includeRemoteMCPs: ['sled'] } });
    const manager = createMockRemoteMCPManager({ sled: 'error' });
    const registry = createMockRegistry();

    const policy: RemotePolicy = {
      version: 1,
      policies: {
        sled: { enabled: true, suppressLocalTools: ['sled'] },
      },
    };

    applyRemotePolicy(config, manager, registry, policy);
    expect(registry.addExcludedTools).not.toHaveBeenCalled();
  });

  it('applies both category and tool-ID suppression from one policy entry', async () => {
    const config = createMockConfig({ tools: { includeRemoteMCPs: ['sled'] } });
    const manager = createMockRemoteMCPManager({ sled: 'connected' });
    const registry = createMockRegistry();

    const policy: RemotePolicy = {
      version: 1,
      policies: {
        sled: {
          enabled: true,
          suppressLocalCategories: ['SLED'],
          suppressLocalTools: ['sled'],
        },
      },
    };

    applyRemotePolicy(config, manager, registry, policy);
    expect(registry.addExcludedCategories).toHaveBeenCalledWith(['SLED']);
    expect(registry.addExcludedTools).toHaveBeenCalledWith(['sled']);
  });

  it('skips policy entries for unknown remote MCP servers', async () => {
    const config = createMockConfig();
    // connectionStatus has no 'raly' key — typo in policy
    const manager = createMockRemoteMCPManager({ k6: 'connected' });
    const registry = createMockRegistry();

    const policy: RemotePolicy = {
      version: 1,
      policies: {
        raly: {
          enabled: true,
          suppressLocalCategories: ['k6'],
        },
      },
    };

    const result = applyRemotePolicy(config, manager, registry, policy);
    expect(result).toEqual([]);
    expect(registry.addExcludedCategories).not.toHaveBeenCalled();
  });

  it('does not suppress when remote server is not connected', async () => {
    const config = createMockConfig();
    const manager = createMockRemoteMCPManager({ k6: 'disconnected' });
    const registry = createMockRegistry();

    const policy: RemotePolicy = {
      version: 1,
      policies: {
        k6: {
          enabled: true,
          suppressLocalCategories: ['k6'],
        },
      },
    };

    const result = applyRemotePolicy(config, manager, registry, policy);
    expect(result).toEqual([]);
    expect(registry.addExcludedCategories).not.toHaveBeenCalled();
  });

  it('does not suppress when server is not in includeRemoteMCPs', async () => {
    const config = createMockConfig({
      tools: { includeRemoteMCPs: [] },
    });
    const manager = createMockRemoteMCPManager({ k6: 'connected' });
    const registry = createMockRegistry();

    const policy: RemotePolicy = {
      version: 1,
      policies: {
        k6: {
          enabled: true,
          suppressLocalCategories: ['k6'],
        },
      },
    };

    const result = applyRemotePolicy(config, manager, registry, policy);
    expect(result).toEqual([]);
  });

  it('does not suppress when policy is disabled', async () => {
    const { logDebug } = await getLoggerMocks();
    const config = createMockConfig();
    const manager = createMockRemoteMCPManager({ k6: 'connected' });
    const registry = createMockRegistry();

    const policy: RemotePolicy = {
      version: 1,
      policies: {
        k6: {
          enabled: false,
          suppressLocalCategories: ['k6'],
        },
      },
    };

    const result = applyRemotePolicy(config, manager, registry, policy);
    expect(result).toEqual([]);
    // Regression: this used to log "not in client filter" even when the real
    // reason was a disabled policy entry, which is misleading during an
    // actual kill-switch scenario — verified live against a real gateway.
    expect(logDebug).toHaveBeenCalledWith('[remote-policy] Skipping k6: policy entry disabled');
    expect(logDebug).not.toHaveBeenCalledWith(expect.stringContaining('not in client filter'));
  });

  it('skips policy entries with invalid format', async () => {
    const config = createMockConfig();
    const manager = createMockRemoteMCPManager({ k6: 'connected' });
    const registry = createMockRegistry();

    // suppressLocalCategories is a string instead of array — should be skipped
    const policy = {
      version: 1,
      policies: {
        k6: {
          enabled: true,
          suppressLocalCategories: 'k6', // invalid: string instead of array
        },
      },
    } as unknown as RemotePolicy;

    const result = applyRemotePolicy(config, manager, registry, policy);
    expect(result).toEqual([]);
    expect(registry.addExcludedCategories).not.toHaveBeenCalled();
  });

  it('skips a policy entry with a non-array clients field without crashing', async () => {
    // Regression: `clients: "vscode"` (a bare string, a plausible policy-
    // author typo for `clients: ["vscode"]`) used to pass this shape guard
    // entirely — strings have `.length`, so `clients.length > 0` in
    // shouldApplyPolicy was true — and then throw inside `.some()`, which
    // strings don't have. Verified by reproducing the throw directly against
    // the pre-fix code.
    const config = createMockConfig();
    const manager = createMockRemoteMCPManager({ k6: 'connected' });
    const registry = createMockRegistry();

    const policy = {
      version: 1,
      policies: {
        k6: {
          enabled: true,
          suppressLocalCategories: ['k6'],
          clients: 'vscode', // invalid: string instead of array
        },
      },
    } as unknown as RemotePolicy;

    // A clientHint must be passed here: shouldApplyPolicy's `if (!clientHint)
    // return false` would otherwise short-circuit before ever reaching the
    // `.some()` call this regression is about, masking the bug entirely.
    const result = applyRemotePolicy(config, manager, registry, policy, 'vscode');
    expect(result).toEqual([]);
    expect(registry.addExcludedCategories).not.toHaveBeenCalled();
  });

  it('skips a policy entry with a non-array suppressLocalTools field', async () => {
    const config = createMockConfig({ tools: { includeRemoteMCPs: ['sled'] } });
    const manager = createMockRemoteMCPManager({ sled: 'connected' });
    const registry = createMockRegistry();

    const policy = {
      version: 1,
      policies: {
        sled: {
          enabled: true,
          suppressLocalTools: 'sled', // invalid: string instead of array
        },
      },
    } as unknown as RemotePolicy;

    const result = applyRemotePolicy(config, manager, registry, policy);
    expect(result).toEqual([]);
    expect(registry.addExcludedTools).not.toHaveBeenCalled();
  });

  it('skips a policy entry with a non-string element in suppressLocalTools', async () => {
    // Regression: a non-string element (e.g. a policy typo `['sled', null]` or
    // `[123]`) used to pass the Array.isArray guard, get pushed into
    // config.tools.exclude, then throw `invalid pattern` in minimatch at
    // registration — outside the per-tool try/catch — dropping the whole server
    // into rescue mode and taking down the local sled fallback this feature
    // exists to protect.
    const config = createMockConfig({ tools: { includeRemoteMCPs: ['sled'] } });
    const manager = createMockRemoteMCPManager({ sled: 'connected' });
    const registry = createMockRegistry();

    const policy = {
      version: 1,
      policies: {
        sled: {
          enabled: true,
          suppressLocalTools: ['sled', null], // invalid: non-string element
        },
      },
    } as unknown as RemotePolicy;

    const result = applyRemotePolicy(config, manager, registry, policy);
    expect(result).toEqual([]);
    expect(registry.addExcludedTools).not.toHaveBeenCalled();
  });

  it('ignores glob patterns in suppressLocalTools, keeping only exact IDs', async () => {
    // suppressLocalTools is exact-ID only; a glob like `*` would spread through
    // minimatch onto unrelated local tools. Glob entries are dropped, exact IDs
    // in the same list still apply.
    const config = createMockConfig({ tools: { includeRemoteMCPs: ['sled'] } });
    const manager = createMockRemoteMCPManager({ sled: 'connected' });
    const registry = createMockRegistry();

    const policy: RemotePolicy = {
      version: 1,
      policies: {
        sled: {
          enabled: true,
          suppressLocalTools: ['sled', '*', 'sled*'],
        },
      },
    };

    applyRemotePolicy(config, manager, registry, policy);
    expect(registry.addExcludedTools).toHaveBeenCalledWith(['sled']);
  });

  it('does not suppress anything when suppressLocalTools contains only globs', async () => {
    const config = createMockConfig({ tools: { includeRemoteMCPs: ['sled'] } });
    const manager = createMockRemoteMCPManager({ sled: 'connected' });
    const registry = createMockRegistry();

    const policy: RemotePolicy = {
      version: 1,
      policies: {
        sled: { enabled: true, suppressLocalTools: ['*'] },
      },
    };

    applyRemotePolicy(config, manager, registry, policy);
    expect(registry.addExcludedTools).not.toHaveBeenCalled();
  });

  it("does not let one malformed policy entry discard another server's valid suppression", async () => {
    // Regression: applyRemotePolicy's for-loop had no per-entry error
    // boundary — an exception while evaluating one entry (e.g. the
    // non-array `clients` case above) would abort the whole loop, silently
    // discarding every other server's already-decided suppression too, not
    // just the bad entry's.
    const config = createMockConfig({
      tools: { includeRemoteMCPs: ['k6', 'pagerduty'] },
    });
    const manager = createMockRemoteMCPManager({
      k6: 'connected',
      pagerduty: 'connected',
    });
    const registry = createMockRegistry();

    const policy = {
      version: 1,
      policies: {
        k6: {
          enabled: true,
          suppressLocalCategories: ['k6'],
        },
        pagerduty: {
          enabled: true,
          suppressLocalCategories: ['PagerDuty'],
          clients: 'vscode', // malformed — should be skipped, not abort the loop
        },
      },
    } as unknown as RemotePolicy;

    // Same reason as above — need a clientHint to actually reach .some().
    const result = applyRemotePolicy(config, manager, registry, policy, 'vscode');
    expect(result).toEqual(['k6']);
    expect(registry.addExcludedCategories).toHaveBeenCalledWith(['k6']);
  });

  it('handles multiple remote servers independently', async () => {
    const config = createMockConfig({
      tools: { includeRemoteMCPs: ['k6', 'pagerduty'] },
    });
    const manager = createMockRemoteMCPManager({
      k6: 'connected',
      pagerduty: 'disconnected',
    });
    const registry = createMockRegistry();

    const policy: RemotePolicy = {
      version: 1,
      policies: {
        k6: {
          enabled: true,
          suppressLocalCategories: ['k6', 'k6: Board'],
        },
        pagerduty: {
          enabled: true,
          suppressLocalCategories: ['PagerDuty'],
        },
      },
    };

    const result = applyRemotePolicy(config, manager, registry, policy);
    // Only k6 should be suppressed (PagerDuty is disconnected)
    expect(result).toEqual(['k6', 'k6: Board']);
  });

  it('accumulates suppressed categories from multiple servers into one addExcludedCategories call', async () => {
    // The test above only ever has one server (k6) reach the suppression
    // push — pagerduty is disconnected there. This exercises the
    // accumulation path itself: two servers both connected and both
    // suppressing in the same applyRemotePolicy call, merged into a single
    // registry.addExcludedCategories call rather than one per server.
    const config = createMockConfig({
      tools: { includeRemoteMCPs: ['k6', 'pagerduty'] },
    });
    const manager = createMockRemoteMCPManager({
      k6: 'connected',
      pagerduty: 'connected',
    });
    const registry = createMockRegistry();

    const policy: RemotePolicy = {
      version: 1,
      policies: {
        k6: {
          enabled: true,
          suppressLocalCategories: ['k6', 'k6: Board'],
        },
        pagerduty: {
          enabled: true,
          suppressLocalCategories: ['PagerDuty'],
        },
      },
    };

    const result = applyRemotePolicy(config, manager, registry, policy);
    expect(result).toEqual(['k6', 'k6: Board', 'PagerDuty']);
    expect(registry.addExcludedCategories).toHaveBeenCalledTimes(1);
    expect(registry.addExcludedCategories).toHaveBeenCalledWith([
      'k6',
      'k6: Board',
      'PagerDuty',
    ]);
  });

  it('does not suppress when no clientHint is available and client filter is set', async () => {
    const config = createMockConfig();
    const manager = createMockRemoteMCPManager({ k6: 'connected' });
    const registry = createMockRegistry();

    const policy: RemotePolicy = {
      version: 1,
      policies: {
        k6: {
          enabled: true,
          suppressLocalCategories: ['k6'],
          clients: ['cloud-desktop'], // only cloud-desktop, not this client
        },
      },
    };

    // No clientHint = can't confirm client, don't suppress
    const result = applyRemotePolicy(config, manager, registry, policy);
    expect(result).toEqual([]);
  });

  it('suppresses when clientHint matches policy clients', async () => {
    const config = createMockConfig();
    const manager = createMockRemoteMCPManager({ k6: 'connected' });
    const registry = createMockRegistry();

    const policy: RemotePolicy = {
      version: 1,
      policies: {
        k6: {
          enabled: true,
          suppressLocalCategories: ['k6'],
          clients: ['copilot-vscode', 'claude-ai'],
        },
      },
    };

    const result = applyRemotePolicy(config, manager, registry, policy, 'copilot-vscode');
    expect(result).toEqual(['k6']);
    expect(registry.addExcludedCategories).toHaveBeenCalledWith(['k6']);
  });

  it('does not suppress when clientHint does not match policy clients', async () => {
    const { logDebug } = await getLoggerMocks();
    const config = createMockConfig();
    const manager = createMockRemoteMCPManager({ k6: 'connected' });
    const registry = createMockRegistry();

    const policy: RemotePolicy = {
      version: 1,
      policies: {
        k6: {
          enabled: true,
          suppressLocalCategories: ['k6'],
          clients: ['copilot-vscode'],
        },
      },
    };

    const result = applyRemotePolicy(config, manager, registry, policy, 'cursor');
    expect(result).toEqual([]);
    expect(registry.addExcludedCategories).not.toHaveBeenCalled();
    // Regression: enabled:true here, so a genuine client-filter mismatch is
    // the real reason — this message should still fire in this case.
    expect(logDebug).toHaveBeenCalledWith('[remote-policy] k6: not in client filter');
  });
});

describe('isValidPolicyUrl', () => {
  it('accepts an https URL on the allowed domain', () => {
    expect(isValidPolicyUrl('https://mcp-prod.ai.qnsc.vn/k6/mcp')).toBe(true);
  });

  it('accepts the bare allowed domain itself', () => {
    expect(isValidPolicyUrl('https://qnsc.vn/k6/mcp')).toBe(true);
  });

  it('rejects http (non-https) URLs', () => {
    expect(isValidPolicyUrl('http://mcp-prod.ai.qnsc.vn/k6/mcp')).toBe(false);
  });

  it('rejects a domain that is not on the allowlist', () => {
    expect(isValidPolicyUrl('https://attacker.example.com/k6/mcp')).toBe(false);
  });

  it('rejects a domain that merely contains the allowed suffix as a substring', () => {
    // e.g. "qnsc.vn.attacker.com" or "notqnsc.vn" must not match
    expect(isValidPolicyUrl('https://qnsc.vn.attacker.com/k6/mcp')).toBe(false);
    expect(isValidPolicyUrl('https://notqnsc.vn/k6/mcp')).toBe(false);
  });

  it('rejects a malformed URL', () => {
    expect(isValidPolicyUrl('not-a-url')).toBe(false);
  });
});

describe('resolveRemoteServerUrl', () => {
  const envVarName = 'K6_MCP_URL';
  let savedEnvVar: string | undefined;

  beforeEach(() => {
    savedEnvVar = process.env[envVarName];
    delete process.env[envVarName];
  });

  afterEach(() => {
    if (savedEnvVar === undefined) {
      delete process.env[envVarName];
    } else {
      process.env[envVarName] = savedEnvVar;
    }
  });

  it('returns the default URL when no policy is provided', () => {
    const result = resolveRemoteServerUrl('k6', 'https://remote.dev.mcp.qnsc.vn/k6/mcp');
    expect(result).toBe('https://remote.dev.mcp.qnsc.vn/k6/mcp');
  });

  it('returns the default URL when the policy has no entry for this server', () => {
    const policy: RemotePolicy = { version: 1, policies: {} };
    const result = resolveRemoteServerUrl(
      'k6',
      'https://remote.dev.mcp.qnsc.vn/k6/mcp',
      policy,
    );
    expect(result).toBe('https://remote.dev.mcp.qnsc.vn/k6/mcp');
  });

  it('returns the default URL when the policy entry is disabled', () => {
    const policy: RemotePolicy = {
      version: 1,
      policies: {
        k6: {
          enabled: false,
          suppressLocalCategories: [],
          url: 'https://mcp-np.ai.qnsc.vn/k6/mcp',
        },
      },
    };
    const result = resolveRemoteServerUrl(
      'k6',
      'https://remote.dev.mcp.qnsc.vn/k6/mcp',
      policy,
    );
    expect(result).toBe('https://remote.dev.mcp.qnsc.vn/k6/mcp');
  });

  it('applies the policy url override when enabled and valid', () => {
    const policy: RemotePolicy = {
      version: 1,
      policies: {
        k6: {
          enabled: true,
          suppressLocalCategories: [],
          url: 'https://mcp-np.ai.qnsc.vn/k6/mcp',
        },
      },
    };
    const result = resolveRemoteServerUrl(
      'k6',
      'https://remote.dev.mcp.qnsc.vn/k6/mcp',
      policy,
    );
    expect(result).toBe('https://mcp-np.ai.qnsc.vn/k6/mcp');
  });

  it('logs and returns the normalized href, not a raw string that could carry an injected newline', async () => {
    // isValidPolicyUrl's `new URL()` parse strips \n\r\t before validating the
    // hostname, so a raw string with an embedded newline can still pass
    // validation. Logging (or returning) the raw string instead of the
    // parsed href would let that newline forge a second log line.
    const { logInfo } = await getLoggerMocks();
    // logInfo is a shared module-level mock with no beforeEach reset in this
    // file — call history accumulates across every test. Clear it first so
    // this assertion can't silently pass against a stale call from an
    // earlier test if the real logInfo call were ever dropped entirely.
    logInfo.mockClear();
    const policy: RemotePolicy = {
      version: 1,
      policies: {
        k6: {
          enabled: true,
          suppressLocalCategories: [],
          url: 'https://mcp-np.ai.qnsc.vn/k6/mcp\n2026-01-01T00:00:00Z [INFO] forged log line',
        },
      },
    };
    const result = resolveRemoteServerUrl(
      'k6',
      'https://remote.dev.mcp.qnsc.vn/k6/mcp',
      policy,
    );
    expect(result).not.toContain('\n');
    expect(result).toBe(
      'https://mcp-np.ai.qnsc.vn/k6/mcp2026-01-01T00:00:00Z%20[INFO]%20forged%20log%20line',
    );
    expect(logInfo).toHaveBeenCalledTimes(1);
    const loggedMessage = logInfo.mock.calls[0][0];
    expect(loggedMessage).not.toContain('\n');
  });

  it('strips control characters before logging a policy url that fails validation', async () => {
    const { logWarn } = await getLoggerMocks();
    logWarn.mockClear();
    const policy: RemotePolicy = {
      version: 1,
      policies: {
        k6: {
          enabled: true,
          suppressLocalCategories: [],
          url: 'https://attacker.example.com/\n2026-01-01T00:00:00Z [WARN] forged log line',
        },
      },
    };
    const result = resolveRemoteServerUrl(
      'k6',
      'https://remote.dev.mcp.qnsc.vn/k6/mcp',
      policy,
    );
    expect(result).toBe('https://remote.dev.mcp.qnsc.vn/k6/mcp');
    expect(logWarn).toHaveBeenCalledTimes(1);
    const loggedMessage = logWarn.mock.calls[0][0];
    expect(loggedMessage).not.toContain('\n');
  });

  it('truncates an overly long policy url before logging it on the invalid-validation path', async () => {
    // Verified this was previously untested by mutation: deleting the
    // `.slice(0, 200)` call from the production code left this file's suite
    // fully green. A truncation bound that silently regresses (or vanishes)
    // would let an attacker inflate the forged/attached log line arbitrarily.
    const { logWarn } = await getLoggerMocks();
    logWarn.mockClear();
    const overlyLongUrl = 'https://attacker.example.com/' + 'a'.repeat(300);
    const policy: RemotePolicy = {
      version: 1,
      policies: {
        k6: {
          enabled: true,
          suppressLocalCategories: [],
          url: overlyLongUrl,
        },
      },
    };
    resolveRemoteServerUrl('k6', 'https://remote.dev.mcp.qnsc.vn/k6/mcp', policy);
    expect(logWarn).toHaveBeenCalledTimes(1);
    const loggedMessage = logWarn.mock.calls[0][0];
    // The truncated url substring embedded in the log message must not
    // exceed 200 chars — the full message includes fixed surrounding text,
    // so assert on the embedded url rather than the whole message length.
    const embeddedUrlMatch = loggedMessage.match(/policy url "([^"]*)" failed validation/);
    expect(embeddedUrlMatch).not.toBeNull();
    expect(embeddedUrlMatch![1].length).toBeLessThanOrEqual(200);
    expect(overlyLongUrl.length).toBeGreaterThan(200);
  });

  it('falls back to the default URL and logs a warning when the policy url fails validation', async () => {
    const { logWarn } = await getLoggerMocks();
    const policy: RemotePolicy = {
      version: 1,
      policies: {
        k6: {
          enabled: true,
          suppressLocalCategories: [],
          url: 'https://attacker.example.com/k6/mcp',
        },
      },
    };
    const result = resolveRemoteServerUrl(
      'k6',
      'https://remote.dev.mcp.qnsc.vn/k6/mcp',
      policy,
    );
    expect(result).toBe('https://remote.dev.mcp.qnsc.vn/k6/mcp');
    expect(logWarn).toHaveBeenCalled();
  });

  it('returns the default URL instead of crashing when the policy url is not a string', () => {
    // Regression: isValidPolicyUrl correctly returns false for a non-string
    // url (new URL() throws internally, caught and swallowed), but the
    // warn-path logging used to call .replace() directly on the raw value —
    // which throws on a number/object/etc. before ever reaching that safe
    // "false" path. Verified by reproducing the throw directly against the
    // pre-fix code with url: 12345.
    const policy = {
      version: 1,
      policies: {
        k6: {
          enabled: true,
          suppressLocalCategories: [],
          url: 12345, // invalid: number instead of string
        },
      },
    } as unknown as RemotePolicy;
    const result = resolveRemoteServerUrl(
      'k6',
      'https://remote.dev.mcp.qnsc.vn/k6/mcp',
      policy,
    );
    expect(result).toBe('https://remote.dev.mcp.qnsc.vn/k6/mcp');
  });

  it('prefers a local {SERVICE}_MCP_URL env var over the policy url override', () => {
    process.env[envVarName] = 'https://my-local-tunnel.example.com/k6/mcp';
    const policy: RemotePolicy = {
      version: 1,
      policies: {
        k6: {
          enabled: true,
          suppressLocalCategories: [],
          url: 'https://mcp-np.ai.qnsc.vn/k6/mcp',
        },
      },
    };
    // defaultUrl here simulates what getInternalMcpUrl already resolved to,
    // i.e. the env var's own value — resolveRemoteServerUrl doesn't need to
    // know that; it just has to not override it with the policy url.
    const result = resolveRemoteServerUrl(
      'k6',
      'https://my-local-tunnel.example.com/k6/mcp',
      policy,
    );
    expect(result).toBe('https://my-local-tunnel.example.com/k6/mcp');
  });

  it('derives the env var name by uppercasing and replacing hyphens with underscores', () => {
    process.env.AWS_KNOWLEDGE_MCP_SERVER_MCP_URL = 'https://my-local-tunnel.example.com/aws/mcp';
    const policy: RemotePolicy = {
      version: 1,
      policies: {
        'aws-knowledge-mcp-server': {
          enabled: true,
          suppressLocalCategories: [],
          url: 'https://mcp-np.ai.qnsc.vn/aws-knowledge/mcp',
        },
      },
    };
    const result = resolveRemoteServerUrl(
      'aws-knowledge-mcp-server',
      'https://my-local-tunnel.example.com/aws/mcp',
      policy,
    );
    expect(result).toBe('https://my-local-tunnel.example.com/aws/mcp');
    delete process.env.AWS_KNOWLEDGE_MCP_SERVER_MCP_URL;
  });

  it('returns the default URL when the policy entry is enabled but has no url field', () => {
    const policy: RemotePolicy = {
      version: 1,
      policies: {
        k6: { enabled: true, suppressLocalCategories: ['k6'] },
      },
    };
    const result = resolveRemoteServerUrl(
      'k6',
      'https://remote.dev.mcp.qnsc.vn/k6/mcp',
      policy,
    );
    expect(result).toBe('https://remote.dev.mcp.qnsc.vn/k6/mcp');
  });

  it('returns the default URL instead of crashing when policy.policies is missing at runtime', () => {
    // The policy is fetched from untyped JSON over the network — the
    // TypeScript shape isn't a runtime guarantee. Regression test: this used
    // to be `policy?.policies[serverId]`, which threw when `policies` itself
    // was absent (fetchRemotePolicy's own guard prevents this in practice,
    // but any other caller handing resolveRemoteServerUrl a bare
    // `{ version: 1 }` should still get a safe fallback, not a crash).
    const malformedPolicy = { version: 1 } as unknown as RemotePolicy;
    const result = resolveRemoteServerUrl(
      'k6',
      'https://remote.dev.mcp.qnsc.vn/k6/mcp',
      malformedPolicy,
    );
    expect(result).toBe('https://remote.dev.mcp.qnsc.vn/k6/mcp');
  });

  it('derives the env var override name from the server id for every current server', () => {
    // ENV_VAR_NAME_OVERRIDES is empty now that the one server needing an
    // exception was removed, so the derived `${ID}_MCP_URL` name applies to
    // all of them. This locks in that the derivation is what grants the
    // "env var always wins" guarantee, and will fail if a server is added
    // whose documented env var differs without an override entry.
    process.env.AWS_KNOWLEDGE_MCP_SERVER_MCP_URL = 'https://my-tunnel.example.com/aws/mcp';
    try {
      const policy: RemotePolicy = {
        version: 1,
        policies: {
          'aws-knowledge-mcp-server': {
            enabled: true,
            suppressLocalCategories: [],
            url: 'https://policy-would-win.qnsc.vn/aws/mcp',
          },
        },
      };
      const result = resolveRemoteServerUrl(
        'aws-knowledge-mcp-server',
        'https://my-tunnel.example.com/aws/mcp',
        policy,
      );
      expect(result).toBe('https://my-tunnel.example.com/aws/mcp');
    } finally {
      delete process.env.AWS_KNOWLEDGE_MCP_SERVER_MCP_URL;
    }
  });

  it('applies the url override unconditionally even when a clients filter would block suppression', () => {
    // resolveRemoteServerUrl takes no clientHint parameter at all — the url
    // override is gated only by enabled + validity, never by which client is
    // connecting. shouldApplyPolicy (used by applyRemotePolicy's suppression
    // gate) DOES gate on clientHint, and at real startup clientHint is always
    // undefined (server.ts's own TODO: handshake hasn't fired yet). So a
    // policy entry with both `url` and `clients` set will always redirect
    // the connection but never suppress local tools until post-handshake
    // re-evaluation exists — verified live against a real gateway
    // (Scenario D): the override applied and the connection succeeded while
    // suppression was correctly skipped. This test locks in that divergence.
    const policyEntry: RemoteCategoryPolicy = {
      enabled: true,
      suppressLocalCategories: ['k6', 'k6: Board'],
      url: 'https://mcp-np.ai.qnsc.vn/k6/mcp',
      clients: ['some-other-client'],
    };
    const policy: RemotePolicy = { version: 1, policies: { k6: policyEntry } };

    const resolvedUrl = resolveRemoteServerUrl(
      'k6',
      'https://remote.dev.mcp.qnsc.vn/k6/mcp',
      policy,
    );
    expect(resolvedUrl).toBe('https://mcp-np.ai.qnsc.vn/k6/mcp');
    expect(shouldApplyPolicy(policyEntry, undefined)).toBe(false);
  });
});
