// Import the real modules first to get a reference before mock.module replaces them
const realFs = require('fs');
const realOs = require('os');
const realPath = require('path');
const realConfig = require('../config');
const realEntraIdConfig = require('../services/auth/entra-id/config');
const _realLoadEntraIdConfig = realEntraIdConfig.loadEntraIdConfig;
const realKeyringLoader = require('../services/auth/keyring-loader');

import { afterAll, afterEach, beforeAll, mock } from 'bun:test';
import type { QnscMcpConfig } from '../config';

/**
 * Global mocks for testing environment
 *
 * Do not mock.module any of the modules mocked here, you will break all the tests.
 * In general, prefer spyOn in lieu of mock.module as the latter is global and does not mock.restore()
 *
 * Also prefer module mocking the `export *` style index.ts modules instead of direct imports, this allows
 * the specific module's unit tests to avoid the global module mocks. When doing this, avoid having
 * module files with the same name as the directory since the treeMock implmentation may catch both
 * the index.ts default and the module itself.
 *
 * CRITICAL: If you must override these mocks in a test file (e.g., for CatchErrors or logger),
 * ensure your mock PRESERVES ORIGINAL METHOD BEHAVIOR. Never return hardcoded values - always
 * call the original method. Example:
 *   ✅ GOOD: CatchErrors: () => (target, key, descriptor) => {
 *        const original = descriptor.value;
 *        descriptor.value = async (...args) => await original.apply(this, args);
 *        return descriptor;
 *      }
 *   ❌ BAD:  CatchErrors: () => () => ({ value: () => Promise.resolve("hardcoded") })
 *
 * For more info on how broken mock.module is in bun:
 *   https://github.com/oven-sh/bun/issues/6040
 *   https://github.com/oven-sh/bun/issues/12823
 */

// Bun doesn't have wildcard relative mocks yet, we have to workaround
const treeMock = (id: string, factory: () => any) => {
  ['./', '../', '../../', '../../../', '../../../../'].forEach((prefix) => {
    mock.module(prefix + id, factory);
  });
};

// Create a mock Context class
class MockContext {
  log = {
    error: mock(() => {}),
    info: mock(() => {}),
    debug: mock(() => {}),
  };
  reportProgress = mock(() => {});
  session = {};
}

// Mock UserError class
export class MockUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

/**
 * Options for setupStandardMocks
 */
export interface SetupStandardMocksOptions {
  /** Skip OpenTelemetry mocking (for tests that need custom OTel mocks) */
  skipOtelMocking?: boolean;
}

/** Exported symbol for documentation/type checking (not used at runtime) */
export const SKIP_OTEL_MOCKING = Symbol('SKIP_OTEL_MOCKING');

/**
 * Canonical ambient config returned by the shared `loadConfig` mock. Returns a
 * fresh object each call so tests that mutate the result don't leak into each
 * other. Test files that reset `mockLoadConfig` (e.g. tool-registry.test.ts)
 * must restore via this factory rather than a hand-written subset, so the
 * process-global mock never leaves a thinner shape for a later file to trip on.
 */
export const createDefaultMockConfig = (): QnscMcpConfig => ({
  tools: {
    includeMCPs: ['figma', 'confluence', 'test-mcp'],
    include: ['tool1', 'tool2'],
    exclude: [],
    includeCategories: [],
    excludeCategories: [],
    includeRemoteMCPs: ['everything-server', 'figma-dev'], // Remote MCP servers for testing
    includeLocalMCPs: [],
  },
  logging: {
    enabled: true,
    level: 'debug' as const,
    maxSize: 10,
    maxFiles: 5,
  },
  knowledgeGraph: {
    filePath: '/mock-path/knowledge-graph.json',
  },
  prompts: {
    repositories: [],
  },
  source: 'test-source',
});

/**
 * Cache of mock objects that must keep their identity for the life of the process.
 *
 * `setupStandardMocks` is called from every test file (57 sites) and each call used
 * to mint fresh mock objects, then re-point `mock.module('fs')` and friends at them.
 * Any file still holding the previous object was left configuring something `fs` no
 * longer resolved to: its `mockFS.existsSync.mockReturnValue(...)` set an
 * expectation nothing read, and the code under test saw a pristine mock. Whether
 * that bit depended on the order Bun loaded files, and Bun's order differs per
 * platform, so the same commit could pass locally and fail in CI.
 *
 * The five files that `import { mockFS } from '../test-utils/mocks'` were the most
 * exposed, which is why three of them carry a defensive `mock.module('fs', ...)`
 * re-registration — a repair that held only until the next caller ran.
 *
 * Identity is cached here, but the `mock.module()` registrations below deliberately
 * still run on every call: other files clobber those registrations (a bare
 * `mock.restore()` drops them), and re-registering is what puts them back. Making
 * the objects stable without also re-registering breaks ~100 tests. Both halves are
 * load-bearing: create once, register every time.
 */
const stableMocks = new Map<string, object>();

/**
 * Returns a per-process-stable object for `key`, with its members refreshed.
 *
 * Two things have to be true at once, and each call site needs both:
 *
 *   - **The container keeps its identity.** A file holding `mockFS` from an earlier
 *     call must still be looking at the object `fs` resolves to. Replacing the object
 *     is what made `mockFS.existsSync.mockReturnValue(...)` configure something
 *     nothing read.
 *   - **The members are fresh.** Rebuilding used to hand every file unconfigured
 *     mocks, which is where test isolation came from. Keeping the old members would
 *     leak one file's `mockReturnValue` and call counts into the next.
 *
 * So the factory runs on every call to produce default members, and those are copied
 * onto the original container. Identity survives, state does not. The
 * `mock.module()` registration that follows each call re-snapshots the refreshed
 * members, and also repairs registrations that other files drop with
 * `mock.restore()` — which is why it must keep running on every call.
 */
const stable = <T extends object>(key: string, create: () => T): T => {
  const defaults = create();
  const existing = stableMocks.get(key) as T | undefined;
  if (!existing) {
    stableMocks.set(key, defaults);
    return defaults;
  }
  return Object.assign(existing, defaults);
};

export const setupStandardMocks = (options: SetupStandardMocksOptions = {}) => {
  const mockedEnvVars: Record<string, any> = {
    // Default GitHub API URL for tests
    GH_API_URL: 'https://api.github.com',
  };

  // Mock all relative path variations to env module
  const envModuleMock = () => ({
    default: mockedEnvVars,
    isUnresolvedPlaceholder: (value: string | undefined) =>
      typeof value === 'string' && value.startsWith('${'),
  });
  treeMock('env', envModuleMock);

  function setMockedEnvVar(key: string, value: string | null) {
    if (value === null) {
      delete mockedEnvVars[key];
    } else {
      // Handle boolean conversion for specific boolean environment variables
      if (key === 'TELEMETRY') {
        // Convert string 'true'/'false' to actual boolean
        mockedEnvVars[key] = value.toLowerCase() === 'true';
      } else if (typeof value === 'string' && value.startsWith('${')) {
        // Strip unresolved template placeholders (matches env.ts behavior)
        // Claude Desktop passes literal '${user_config.VAR}' when unconfigured
        delete mockedEnvVars[key];
      } else {
        mockedEnvVars[key] = value;
      }
    }
  }

  const mockFS = stable('fs', () => ({
    ...realFs,
    realFs,
    existsSync: mock(() => {}),
    writeFileSync: mock(() => {}),
    readFileSync: mock(() => ''),
    mkdirSync: mock(() => {}),
    mkdtempSync: mock(() => '/mock-tmp-dir'),
    rmSync: mock(() => {}),
    unlinkSync: mock(() => {}),
    readdirSync: mock(() => []),
    copyFileSync: mock(() => {}),
    mkdir: mock(() => Promise.resolve()),
    stat: mock(() =>
      Promise.resolve({
        size: 1024,
        isDirectory: () => false,
      }),
    ),
    constants: {
      O_CREAT: 0x0100,
      O_TRUNC: 0x0200,
      O_WRONLY: 0x0001,
      F_OK: 0,
      R_OK: 4,
      W_OK: 2,
      X_OK: 1,
    },
    chmodSync: mock(() => {}),
    renameSync: mock(() => {}),
    statSync: mock(() => ({
      mtime: new Date('2023-05-15T12:00:00Z'),
      isDirectory: () => false,
    })),
    createReadStream: mock(() => {
      throw new Error('Read stream error');
    }),
    promises: {
      readFile: mock(() => Promise.resolve('')),
      mkdir: mock(() => Promise.resolve()),
      writeFile: mock(() => Promise.resolve()),
      mkdtemp: mock(() => Promise.resolve('/mock-tmp-dir')),
      access: mock(() => Promise.resolve()),
    },
  }));
  mock.module('fs', () => ({ default: mockFS, ...mockFS }));
  mock.module('node:fs', () => ({ default: mockFS, ...mockFS }));

  const mockPath = stable('path', () => ({
    ...realPath,
    realPath,
    resolve: mock((...parts: string[]) => parts.join('/')),
  }));
  mock.module('path', () => ({ default: mockPath, ...mockPath }));
  mock.module('node:path', () => ({ default: mockPath, ...mockPath }));

  // Create a mockOs that preserves all real functions but overrides specific ones
  const mockOs = stable('os', () => ({
    ...realOs, // Start with all real OS functions
    realOs,
    homedir: mock(() => '/mock-home-dir'),
    userInfo: mock(() => ({ username: 'mockuser' })),
    tmpdir: mock(() => '/mock-tmp-dir'),
    platform: mock(() => 'darwin'),
    arch: mock(() => 'arm64'),
  }));
  mock.module('os', () => ({ default: mockOs, ...mockOs }));
  mock.module('node:os', () => ({ default: mockOs, ...mockOs }));

  const mockLogDebug = mock(() => {});
  const mockLogInfo = mock(() => {});
  const mockLogError = mock(() => {});
  const mockLogWarn = mock(() => {});
  const mockLogger = {
    LOG_DIR: '/mock-log-dir',
    LOG_FILE: '/mock-log-dir/mock-log-file.log',
    logDebug: mockLogDebug,
    logInfo: mockLogInfo,
    logError: mockLogError,
    logWarn: mockLogWarn,
  };
  const loggerModuleExports = {
    default: mockLogger,
    LOG_DIR: '/mock-log-dir',
    LOG_FILE: '/mock-log-dir/mock-log-file.log',
    logDebug: mockLogDebug,
    logInfo: mockLogInfo,
    logError: mockLogError,
    logWarn: mockLogWarn,
  };
  treeMock('services/logger', () => loggerModuleExports);

  const mockLoadConfig = mock((options = {}): QnscMcpConfig => createDefaultMockConfig());
  const mockConfig = {
    QNSC_MCP_DIR: '.',
    defaultConfig: {},
    loadConfig: mockLoadConfig,
    // Use the real loadConfigFromEnvironment for testing env var parsing
    loadConfigFromEnvironment: realConfig.loadConfigFromEnvironment,
    getKnowledgeGraphPath: mock(() => '.'),
  };
  treeMock('config', () => ({ default: mockConfig, ...mockConfig }));

  const mockCatchErrors = mock(() => (target: any, key: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error: any) {
        throw new MockUserError(`Tool execution error: ${error.message}`);
      }
    };
    return descriptor;
  });
  const mockExecuteOSAScript = mock(() => 'mocked data');
  const mockLogIf = mock((message: string, condition: boolean) => {
    if (condition) {
      console.log(message);
    }
  });
  const mockWarnIf = mock((message: string, condition: boolean) => {
    if (condition) {
      console.warn(message);
    }
  });
  const mockGetAppVersion = mock(() => '1.0.0-test');

  // Import real error functions to preserve their behavior (they just throw UserError)
  const {
    throwConfigError,
    throwConnectionError,
    throwQueryError,
    throwAuthTokenError,
    throwValidationError,
  } = require('../utils/errors');

  treeMock('utils', () => ({
    CatchErrors: mockCatchErrors,
    executeOSAScript: mockExecuteOSAScript,
    logIf: mockLogIf,
    warnIf: mockWarnIf,
    getAppVersion: mockGetAppVersion,
    throwConfigError,
    throwConnectionError,
    throwQueryError,
    throwAuthTokenError,
    throwValidationError,
    UserError: MockUserError,
  }));

  // Avoid loading the complete toolset when testing tool registry and similar, speeds up test runtime drastically
  treeMock('registry/tool-loader', () => require('./mock-tool-loader'));

  // Mock registry
  const mockRegistry = {
    initialize: mock(() => Promise.resolve()),
    registerAllTools: mock(() => {}),
    getAllTools: mock((filtered: boolean) => [] as any[]),
    getCategories: mock((filtered: boolean) => [] as string[]),
    getToolsByCategory: mock((category: string) => [] as any[]),
  };
  const mockPromptRegistry = {
    initialize: mock(() => Promise.resolve()),
    registerAllPrompts: mock(() => {}),
    getPromptById: mock(() => null as any),
    getAllPrompts: mock(() => [] as any[]),
    getCategories: mock(() => [] as string[]),
    getPromptsByCategory: mock((category: string) => [] as any[]),
    getPromptSources: mock(() => [] as string[]),
    getFromRegistry: mock((id: string) => null),
  };
  treeMock('registry', () => ({
    Tool: () => (target: any) => target,
    registry: mockRegistry,

    Prompt: () => (target: any) => target,
    prompt: (target: any) => target,
    promptRegistry: mockPromptRegistry,
  }));

  const mockResourceRegistry = {
    initialize: mock(() => Promise.resolve()),
    registerAllResources: mock(() => {}),
    getAllResources: mock(() => [] as any[]),
    getCategories: mock(() => [] as string[]),
    getResourcesByCategory: mock((category: string) => [] as any[]),
    getResourceCount: mock(() => 0),
  };
  treeMock('registry/resources', () => ({
    Resource: () => (target: any) => target,
    resourceRegistry: mockResourceRegistry,
  }));

  // Mock display
  const mockDisplay = {
    displayHeader: mock(() => {}),
    displayError: mock(() => {}),
    writeJsonOutput: mock((data: unknown, indent: number = 2) => {
      // Log to console so tests spying on console.log can capture JSON output
      console.log(JSON.stringify(data, null, indent));
      return Promise.resolve();
    }),
    bold: mock((text: string) => `<bold>${text}</bold>`),
    dim: mock((text: string) => `<dim>${text}</dim>`),
    cyan: mock((text: string) => `<cyan>${text}</cyan>`),
    red: mock((text: string) => `<red>${text}</red>`),
  };
  treeMock('lib/display', () => mockDisplay);

  // Mock OpenTelemetry modules to avoid loading heavy OTel dependencies in tests
  // Skip if the caller has already set up their own OTel mocks (e.g., telemetry tests)
  if (!options.skipOtelMocking) {
    const mockOTelSpan = {
      setAttributes: mock(() => mockOTelSpan),
      setAttribute: mock(() => mockOTelSpan),
      setStatus: mock(() => mockOTelSpan),
      end: mock(() => {}),
    };
    const mockOTelTracer = {
      startSpan: mock(() => mockOTelSpan),
    };
    const mockOTelTrace = {
      getTracer: mock(() => mockOTelTracer),
    };
    const mockOTelProvider = {
      register: mock(() => {}),
      shutdown: mock(() => Promise.resolve()),
      forceFlush: mock(() => Promise.resolve()),
    };
    mock.module('@opentelemetry/api', () => ({
      trace: mockOTelTrace,
      SpanStatusCode: { OK: 1, ERROR: 2, UNSET: 0 },
      context: {},
    }));
    mock.module('@opentelemetry/exporter-trace-otlp-proto', () => ({
      OTLPTraceExporter: mock(() => ({})),
    }));
    mock.module('@opentelemetry/resources', () => ({
      resourceFromAttributes: mock(() => ({})),
    }));
    mock.module('@opentelemetry/sdk-trace-base', () => ({
      BatchSpanProcessor: mock(() => ({})),
    }));
    mock.module('@opentelemetry/sdk-trace-node', () => ({
      NodeTracerProvider: mock(() => mockOTelProvider),
    }));
    mock.module('@opentelemetry/semantic-conventions', () => ({
      ATTR_SERVICE_NAME: 'service.name',
      ATTR_SERVICE_VERSION: 'service.version',
    }));
  }

  // NOTE: ConfigValidator is NOT mocked globally here because:
  // 1. It would break the validation module's own tests (config-validator.test.ts, etc.)
  // 2. Tests that need to mock ConfigValidator should use spyOn() in their beforeEach
  // See server.test.ts for an example of how to properly mock ConfigValidator

  // Mock 'open' package used for opening URLs in browser (e.g., OAuth flows)
  const mockOpen = mock(() => Promise.resolve({ pid: 12345 }));
  mock.module('open', () => ({ default: mockOpen }));

  // Mock @napi-rs/keyring to prevent real OS keychain access in tests.
  // Prevents loading the native binding.
  // Tests that need specific keyring behavior mock keyring-loader directly.
  class MockKeyringEntry {
    constructor(
      public service: string,
      public name: string,
    ) {}
    getPassword(): string | null {
      return null;
    }
    setPassword(_password: string): void {}
    deletePassword(): void {}
  }
  mock.module('@napi-rs/keyring', () => ({
    Entry: MockKeyringEntry,
  }));

  // Global fetch mock
  const mockFetch = mock(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
      headers: new Headers(),
    }),
  ) as any;

  // Assign to global
  global.fetch = mockFetch;

  return {
    setMockedEnvVar,
    mockFS,
    mockPath,
    mockOs,
    mockLog: mockLogger,
    mockLoadConfig,
    mockRegistry,
    mockPromptRegistry,
    mockResourceRegistry,
    mockDisplay,
    mockExecuteOSAScript,
    mockFetch,
    mockOpen,
  };
};

// Perform the standard mock setup once before any tests are imported or ran
const standardMocks = setupStandardMocks();

// Export commonly used mocks for direct import
export const mockFetch = standardMocks.mockFetch;
export const mockFS = standardMocks.mockFS;
export const mockOs = standardMocks.mockOs;
export const mockPath = standardMocks.mockPath;
export const mockLog = standardMocks.mockLog;

// Export real module references captured before mock.module() replaced them.
// Tests that need the real implementation (e.g., config.test.ts) can use these
// to bypass mock.module() pollution that leaks across test files in Bun.
// NOTE: We export the function reference directly (not the module object) because
// Bun's mock.module() mutates the existing module namespace object in-place.
export { _realLoadEntraIdConfig as realLoadEntraIdConfig };

// Export real keyring pure functions for test files that need to mock keyring-loader
// but still want the real isKeyringCorrupted/getRecoveryInstructions behavior.
// These are captured before any mocks are set up, so they're always the real implementations.
export const realIsKeyringCorrupted = realKeyringLoader.isKeyringCorrupted;
export const realGetRecoveryInstructions = realKeyringLoader.getRecoveryInstructions;

beforeAll(() => {
  // global setup
});

afterEach(() => {
  // Clean up all mock state between tests to prevent leakage
  // This is recommended in Bun docs for test isolation
  mock.restore();
});

afterAll(() => {
  // global teardown
});
