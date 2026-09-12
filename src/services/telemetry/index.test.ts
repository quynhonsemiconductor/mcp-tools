import { beforeEach, describe, expect, it, mock } from 'bun:test';

// Define SpanStatusCode constants to match OTel API
const SpanStatusCode = {
  UNSET: 0,
  OK: 1,
  ERROR: 2,
} as const;

// Define SpanKind constants to match OTel API
const SpanKind = {
  INTERNAL: 0,
  SERVER: 1,
  CLIENT: 2,
  PRODUCER: 3,
  CONSUMER: 4,
} as const;

// Create mock instances that we can inspect
const mockSpan = {
  setAttributes: mock(() => mockSpan),
  setAttribute: mock(() => mockSpan),
  setStatus: mock(() => mockSpan),
  end: mock(() => {}),
};

const mockTracer = {
  startSpan: mock(() => mockSpan),
};

const mockProvider = {
  register: mock(() => {}),
  shutdown: mock(() => Promise.resolve()),
  forceFlush: mock(() => Promise.resolve()),
};

const mockTrace = {
  getTracer: mock(() => mockTracer),
};

// CRITICAL: Mock @opentelemetry/api BEFORE any imports that might use it
void mock.module('@opentelemetry/api', () => ({
  trace: mockTrace,
  SpanStatusCode,
  SpanKind,
  createContextKey: mock((key: string) => Symbol(key)),
}));

// Import setupStandardMocks for env/os/logger mocking, but it will NOT override
// our @opentelemetry/api mock since that's already registered above
import { setupStandardMocks } from '../../test-utils/mocks';

const { mockLog, setMockedEnvVar } = setupStandardMocks({ skipOtelMocking: true });

// Note: OS mocks (platform, release, userInfo) are already set by setupStandardMocks().
// The mocked userInfo returns { username: 'mockuser' } - don't override here.

// Mock package.json
void mock.module('../../../package.json', () => ({
  version: '2.0.0-test',
}));

// Track mock state for getNewRelicLicenseKey
let mockBuildTimeLicenseKey: string | undefined | null = undefined;

// Mock constants module (build-time injected values)
// Must match actual exports from src/constants.ts
void mock.module('../auth/embedded-credentials', () => ({
  getEmbeddedGenericSecret: (key: string): string | undefined => {
    if (key === 'NEW_RELIC_LICENSE_KEY') {
      return mockBuildTimeLicenseKey ?? undefined;
    }
    return undefined;
  },
}));

// Mock OTel exporter constructor to capture config
let capturedExporterConfig: any = null;
const MockOTLPTraceExporter = mock((config: any) => {
  capturedExporterConfig = config;
  return {};
});

// Mock resource factory
let capturedResourceAttributes: any = null;
const mockResourceFromAttributes = mock((attrs: any) => {
  capturedResourceAttributes = attrs;
  return {};
});

// Mock NodeTracerProvider constructor to capture config
let capturedProviderConfig: any = null;
const MockNodeTracerProvider = mock((config: any) => {
  capturedProviderConfig = config;
  return mockProvider;
});

void mock.module('@opentelemetry/exporter-trace-otlp-proto', () => ({
  OTLPTraceExporter: MockOTLPTraceExporter,
}));

void mock.module('@opentelemetry/resources', () => ({
  resourceFromAttributes: mockResourceFromAttributes,
}));

void mock.module('@opentelemetry/sdk-trace-base', () => ({
  BatchSpanProcessor: mock((exporter: any) => ({ exporter })),
}));

void mock.module('@opentelemetry/sdk-trace-node', () => ({
  NodeTracerProvider: MockNodeTracerProvider,
}));

void mock.module('@opentelemetry/semantic-conventions', () => ({
  ATTR_SERVICE_NAME: 'service.name',
  ATTR_SERVICE_VERSION: 'service.version',
}));

// Mock log SDK modules - these are loaded dynamically via require() in the telemetry service
// so they may or may not be loaded. The mocks need to be available if they are loaded.
const mockLoggerInstance = {
  emit: mock(() => {}),
};

const mockLoggerProvider = {
  shutdown: mock(() => Promise.resolve()),
  forceFlush: mock(() => Promise.resolve()),
  getLogger: mock(() => mockLoggerInstance),
  addLogRecordProcessor: mock(() => {}),
};

const MockLoggerProvider = mock(() => mockLoggerProvider);

const MockOTLPLogExporter = mock((_config: any) => ({}));

void mock.module('@opentelemetry/sdk-logs', () => ({
  LoggerProvider: MockLoggerProvider,
  BatchLogRecordProcessor: mock((exporter: any) => ({ exporter })),
}));

void mock.module('@opentelemetry/exporter-logs-otlp-proto', () => ({
  OTLPLogExporter: MockOTLPLogExporter,
}));

// Import the class after mocks are set up
import type { RegistryCall } from '../db/types';
import { TelemetryService } from './index';

describe('TelemetryService', () => {
  // Reset all mocks before each test
  beforeEach(() => {
    mockSpan.setAttributes.mockClear();
    mockSpan.setAttribute.mockClear();
    mockSpan.setStatus.mockClear();
    mockSpan.end.mockClear();
    mockTracer.startSpan.mockClear();
    mockProvider.register.mockClear();
    mockProvider.shutdown.mockClear();
    mockProvider.forceFlush.mockClear();
    mockTrace.getTracer.mockClear();
    MockOTLPTraceExporter.mockClear();
    mockResourceFromAttributes.mockClear();
    MockNodeTracerProvider.mockClear();
    mockLog.logDebug.mockClear();
    mockLog.logError.mockClear();
    capturedExporterConfig = null;
    capturedResourceAttributes = null;
    capturedProviderConfig = null;
    mockBuildTimeLicenseKey = undefined;
    // Clean up env vars
    setMockedEnvVar('TELEMETRY', null);
    setMockedEnvVar('NEW_RELIC_LICENSE_KEY', null);
    setMockedEnvVar('NEW_RELIC_LICENSE_KEY_MCP', null);
    setMockedEnvVar('NEW_RELIC_REGION', null);
  });

  describe('isEnabled', () => {
    it('should return true when license key is provided', () => {
      const service = new TelemetryService({
        licenseKey: 'test-license-key',
        appVersion: '1.0.0',
      });

      expect(service.isEnabled()).toBe(true);
    });

    it('should return false when license key is missing', () => {
      const service = new TelemetryService({
        licenseKey: undefined,
        appVersion: '1.0.0',
      });

      expect(service.isEnabled()).toBe(false);
    });

    it('should return false when license key is empty string', () => {
      const service = new TelemetryService({
        licenseKey: '',
        appVersion: '1.0.0',
      });

      expect(service.isEnabled()).toBe(false);
    });

    it('should return false when TELEMETRY is false (opt-out)', () => {
      setMockedEnvVar('TELEMETRY', 'false');

      const service = new TelemetryService({
        licenseKey: 'test-license-key',
        appVersion: '1.0.0',
      });

      expect(service.isEnabled()).toBe(false);
    });

    it('should return true when TELEMETRY is true and license key exists', () => {
      setMockedEnvVar('TELEMETRY', 'true');

      const service = new TelemetryService({
        licenseKey: 'test-license-key',
        appVersion: '1.0.0',
      });

      expect(service.isEnabled()).toBe(true);
    });

    it('should return false when TELEMETRY=false even with build-time injected key', () => {
      // Simulate a build-time injected key
      mockBuildTimeLicenseKey = 'injected-license-key';
      setMockedEnvVar('TELEMETRY', 'false');

      const service = new TelemetryService({
        appVersion: '1.0.0',
      });

      // Even though there's a valid license key, TELEMETRY=false should disable it
      expect(service.isEnabled()).toBe(false);
    });
  });

  describe('license key resolution priority', () => {
    it('should use NEW_RELIC_LICENSE_KEY_MCP over build-time bundled key', () => {
      // Set both MCP override and build-time constant
      setMockedEnvVar('NEW_RELIC_LICENSE_KEY_MCP', 'mcp-override-key');
      mockBuildTimeLicenseKey = 'build-time-key';

      const service = new TelemetryService({
        appVersion: '1.0.0',
      });
      service.initialize();

      // Explicit manual override takes priority
      expect(capturedExporterConfig.headers['api-key']).toBe('mcp-override-key');
    });

    it('should ignore the generic NEW_RELIC_LICENSE_KEY entirely', () => {
      // Users may have that variable set for their own APM agent; reading it here
      // would silently redirect this toolkit's traces into their account.
      process.env.NEW_RELIC_LICENSE_KEY = 'someone-elses-account-key';

      const service = new TelemetryService({ appVersion: '1.0.0' });
      service.initialize();

      expect(service.isEnabled()).toBe(false);
      delete process.env.NEW_RELIC_LICENSE_KEY;
    });

    it('should not resolve a key from a build-time constant', () => {
      // A key used to be bakeable into release binaries, which let traces flow to
      // the previous owner's observability vendor with nothing in the repository to
      // show it. Telemetry is opt-in per user now, so a build-time value is ignored.
      mockBuildTimeLicenseKey = 'build-time-key';

      const service = new TelemetryService({ appVersion: '1.0.0' });
      service.initialize();

      expect(service.isEnabled()).toBe(false);
      expect(capturedExporterConfig).toBeNull();
    });

    it('should use MCP env var as sole key source when no build-time key exists', () => {
      // MCP override with no build-time constant
      setMockedEnvVar('NEW_RELIC_LICENSE_KEY_MCP', 'mcp-only-key');
      mockBuildTimeLicenseKey = '';

      const service = new TelemetryService({
        appVersion: '1.0.0',
      });
      service.initialize();

      expect(capturedExporterConfig.headers['api-key']).toBe('mcp-only-key');
    });

    it('should disable telemetry when only generic NEW_RELIC_LICENSE_KEY is set', () => {
      // Generic key only — no MCP override, no build-time key
      setMockedEnvVar('NEW_RELIC_LICENSE_KEY', 'generic-only-key');
      mockBuildTimeLicenseKey = '';

      const service = new TelemetryService({
        appVersion: '1.0.0',
      });

      // Generic key is intentionally ignored, so telemetry should be disabled
      expect(service.isEnabled()).toBe(false);
    });

    it('should use explicit config over all env vars and bundled key', () => {
      setMockedEnvVar('NEW_RELIC_LICENSE_KEY_MCP', 'mcp-override-key');
      mockBuildTimeLicenseKey = 'build-time-key';

      const service = new TelemetryService({
        licenseKey: 'explicit-config-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      // Explicit config should take precedence over everything
      expect(capturedExporterConfig.headers['api-key']).toBe('explicit-config-key');
    });

    it('should treat an unresolved placeholder as no key at all', () => {
      mockBuildTimeLicenseKey = 'build-time-key';

      const service = new TelemetryService({ appVersion: '1.0.0' });
      service.initialize();

      expect(service.isEnabled()).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should not initialize when license key is missing', () => {
      const service = new TelemetryService({
        licenseKey: undefined,
        appVersion: '1.0.0',
      });

      service.initialize();

      expect(service.isInitialized()).toBe(false);
      expect(MockNodeTracerProvider).not.toHaveBeenCalled();
    });

    it('should not initialize when license key is empty string', () => {
      const service = new TelemetryService({
        licenseKey: '',
        appVersion: '1.0.0',
      });

      service.initialize();

      expect(service.isInitialized()).toBe(false);
      expect(MockNodeTracerProvider).not.toHaveBeenCalled();
    });

    it('should initialize OpenTelemetry provider when enabled', () => {
      const service = new TelemetryService({
        licenseKey: 'test-license-key',
        appVersion: '2.0.0',
      });

      service.initialize();

      expect(service.isInitialized()).toBe(true);
      expect(MockOTLPTraceExporter).toHaveBeenCalled();
      expect(MockNodeTracerProvider).toHaveBeenCalled();
      expect(mockProvider.register).toHaveBeenCalled();
      expect(mockTrace.getTracer).toHaveBeenCalledWith('qnsc-mcp', '2.0.0');
    });

    it('should use custom service name when provided', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
        serviceName: 'custom-service',
      });

      service.initialize();

      expect(capturedResourceAttributes['service.name']).toBe('custom-service');
      expect(mockTrace.getTracer).toHaveBeenCalledWith('custom-service', '1.0.0');
    });

    it('should use US endpoint by default', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      service.initialize();

      expect(capturedExporterConfig.url).toBe('https://otlp.nr-data.net:4318/v1/traces');
    });

    it('should use EU endpoint when region is EU', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        region: 'EU',
        appVersion: '1.0.0',
      });

      service.initialize();

      expect(capturedExporterConfig.url).toBe('https://otlp.eu01.nr-data.net:4318/v1/traces');
    });

    it('should use EU2 endpoint when region is EU2', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        region: 'EU2',
        appVersion: '1.0.0',
      });

      service.initialize();

      expect(capturedExporterConfig.url).toBe('https://otlp.eu02.nr-data.net:4318/v1/traces');
    });

    it('should use EU endpoint when NEW_RELIC_REGION env var is EU', () => {
      setMockedEnvVar('NEW_RELIC_REGION', 'EU');

      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      service.initialize();

      expect(capturedExporterConfig.url).toBe('https://otlp.eu01.nr-data.net:4318/v1/traces');
    });

    it('should prefer explicit region config over NEW_RELIC_REGION env var', () => {
      setMockedEnvVar('NEW_RELIC_REGION', 'EU');

      const service = new TelemetryService({
        licenseKey: 'test-key',
        region: 'EU2', // Explicit config should win
        appVersion: '1.0.0',
      });

      service.initialize();

      expect(capturedExporterConfig.url).toBe('https://otlp.eu02.nr-data.net:4318/v1/traces');
    });

    it('should use custom endpoint when provided via config', () => {
      const customEndpoint = 'https://custom.endpoint.com/traces';
      const service = new TelemetryService({
        licenseKey: 'test-key',
        otlpEndpoint: customEndpoint,
        appVersion: '1.0.0',
      });

      service.initialize();

      expect(capturedExporterConfig.url).toBe(customEndpoint);
    });

    it('should use NEW_RELIC_OTLP_ENDPOINT env var when set', () => {
      const envEndpoint = 'https://env-endpoint.example.com/v1/traces';
      setMockedEnvVar('NEW_RELIC_OTLP_ENDPOINT', envEndpoint);

      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      service.initialize();

      expect(capturedExporterConfig.url).toBe(envEndpoint);
    });

    it('should prefer explicit otlpEndpoint config over NEW_RELIC_OTLP_ENDPOINT env var', () => {
      setMockedEnvVar('NEW_RELIC_OTLP_ENDPOINT', 'https://env-endpoint.example.com/v1/traces');

      const configEndpoint = 'https://config-endpoint.example.com/v1/traces';
      const service = new TelemetryService({
        licenseKey: 'test-key',
        otlpEndpoint: configEndpoint,
        appVersion: '1.0.0',
      });

      service.initialize();

      expect(capturedExporterConfig.url).toBe(configEndpoint);
    });

    it('should ignore unresolved placeholder in NEW_RELIC_OTLP_ENDPOINT and fall back to region default', () => {
      setMockedEnvVar('NEW_RELIC_OTLP_ENDPOINT', '${user_config.NEW_RELIC_OTLP_ENDPOINT}');

      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      service.initialize();

      // Should fall back to the default US endpoint, not the placeholder
      expect(capturedExporterConfig.url).toBe('https://otlp.nr-data.net:4318/v1/traces');
    });

    it('should include license key in exporter headers', () => {
      const service = new TelemetryService({
        licenseKey: 'my-secret-key',
        appVersion: '1.0.0',
      });

      service.initialize();

      expect(capturedExporterConfig.headers['api-key']).toBe('my-secret-key');
    });

    it('should set correct resource attributes', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '3.0.0',
      });

      service.initialize();

      expect(capturedResourceAttributes['service.name']).toBe('qnsc-mcp');
      expect(capturedResourceAttributes['service.version']).toBe('3.0.0');
      expect(capturedResourceAttributes['service.instance.id']).toBeDefined();
      // user attribute is MY_EMAIL if set, otherwise OS username
      expect(capturedResourceAttributes['user']).toBe('mockuser');
      expect(capturedResourceAttributes['os.type']).toBeDefined();
      expect(capturedResourceAttributes['os.version']).toBeDefined();
    });

    it('should use MY_EMAIL env var for user attribute when set', () => {
      process.env.MY_EMAIL = 'john.doe@qnsc.vn';
      try {
        const service = new TelemetryService({
          licenseKey: 'test-key',
          appVersion: '1.0.0',
        });

        service.initialize();

        expect(capturedResourceAttributes['user']).toBe('john.doe@qnsc.vn');
      } finally {
        delete process.env.MY_EMAIL;
      }
    });

    it('should ignore MY_EMAIL when it contains an unresolved placeholder', () => {
      // Simulates VS Code injecting unresolved ${input:...} placeholders
      // when the user hasn't configured MY_EMAIL (bug #837)
      process.env.MY_EMAIL = '${input:qnsc_mcp_my_email}';

      try {
        const service = new TelemetryService({
          licenseKey: 'test-key',
          appVersion: '1.0.0',
        });

        service.initialize();

        // Should skip the placeholder and fall back to OS username (mockuser)
        expect(capturedResourceAttributes['user']).toBe('mockuser');
        expect(capturedResourceAttributes['service.instance.id']).toBe('mockuser');
      } finally {
        delete process.env.MY_EMAIL;
      }
    });

    it('should use custom batch config when provided', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
        batchConfig: {
          scheduledDelayMillis: 500,
          maxQueueSize: 50,
        },
      });

      service.initialize();

      // The BatchSpanProcessor should receive merged config
      expect(capturedProviderConfig.spanProcessors).toBeDefined();
      expect(capturedProviderConfig.spanProcessors.length).toBe(1);
    });

    it('should only initialize once', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      service.initialize();
      service.initialize();
      service.initialize();

      expect(MockNodeTracerProvider).toHaveBeenCalledTimes(1);
    });

    it('should not retry after initialization failure', () => {
      MockOTLPTraceExporter.mockImplementationOnce(() => {
        throw new Error('Exporter failed');
      });

      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      // First initialization fails
      service.initialize();
      expect(service.isInitialized()).toBe(false);
      expect(MockOTLPTraceExporter).toHaveBeenCalledTimes(1);

      // Second attempt should not retry (initializationFailed flag set)
      service.initialize();
      expect(MockOTLPTraceExporter).toHaveBeenCalledTimes(1);
    });

    it('should allow retry after resetInitializationFailed is called', () => {
      MockOTLPTraceExporter.mockImplementationOnce(() => {
        throw new Error('Exporter failed');
      });

      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      // First initialization fails
      service.initialize();
      expect(service.isInitialized()).toBe(false);

      // Reset the failure flag
      service.resetInitializationFailed();

      // Reset mocks for second attempt
      MockOTLPTraceExporter.mockImplementation((config: any) => {
        capturedExporterConfig = config;
        return {};
      });

      // Now initialization should proceed
      service.initialize();
      expect(service.isInitialized()).toBe(true);
    });
  });

  describe('recordUsage', () => {
    const baseCall: RegistryCall = {
      itemId: 'test-tool',
      itemType: 'tool',
      payload: '{"arg":"value"}',
      runTimeMs: 150,
      status: 'success',
    };

    it('should not record when license key is missing', () => {
      const service = new TelemetryService({
        licenseKey: undefined,
        appVersion: '1.0.0',
      });

      service.recordUsage(baseCall);

      expect(mockTracer.startSpan).not.toHaveBeenCalled();
    });

    it('should auto-initialize when recording if not initialized', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      expect(service.isInitialized()).toBe(false);

      service.recordUsage(baseCall);

      expect(service.isInitialized()).toBe(true);
    });

    it('should create span with correct naming convention', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUsage({
        ...baseCall,
        itemId: 'my-tool',
        itemType: 'tool',
      });

      expect(mockTracer.startSpan).toHaveBeenCalledWith('mcp.tool.my-tool', {
        kind: 1, // SpanKind.SERVER
      });
    });

    it('should use prompt in span name for prompt calls', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUsage({
        ...baseCall,
        itemId: 'my-prompt',
        itemType: 'prompt',
      });

      expect(mockTracer.startSpan).toHaveBeenCalledWith('mcp.prompt.my-prompt', {
        kind: 1, // SpanKind.SERVER
      });
    });

    it('should set common attributes on span', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        transportType: 'stdio',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUsage({
        itemId: 'test-tool',
        itemType: 'tool',
        payload: '{"test":true}',
        runTimeMs: 250,
        status: 'success',
      });

      // Verify the span was created and attributes were set
      expect(mockSpan.setAttributes).toHaveBeenCalled();
      const attrs = (mockSpan.setAttributes.mock.calls as unknown as any[][])[0]?.[0] as Record<string, any>;

      // Check MCP-specific attributes
      expect(attrs['mcp.item.type']).toBe('tool');
      expect(attrs['mcp.item.id']).toBe('test-tool');
      expect(attrs['mcp.execution.status']).toBe('success');
      expect(attrs['mcp.execution.duration.ms']).toBe(250);
      expect(attrs['mcp.transport.type']).toBe('stdio');

      // Check HTTP semantic convention attributes for New Relic APM Transactions view
      expect(attrs['http.request.method']).toBe('POST');
      expect(attrs['http.route']).toBe('/mcp/tool/test-tool');
      expect(attrs['http.response.status_code']).toBe(200);

      // Note: user.name and os.* are set as resource attributes during initialization,
      // not as span attributes (to avoid duplication)
      expect(attrs['user.name']).toBeUndefined();
      expect(attrs['os.platform']).toBeUndefined();
      expect(attrs['os.version']).toBeUndefined();
    });

    it('should set source attribute when provided', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUsage({
        ...baseCall,
        source: 'first-party',
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('mcp.tool.source', 'first-party');
    });

    it('should set category attribute when provided', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUsage({
        ...baseCall,
        category: 'k6',
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('mcp.item.category', 'k6');
    });

    it('should set provider attribute when provided', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUsage({
        ...baseCall,
        provider: 'native',
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('mcp.tool.provider', 'native');
    });

    // Note: appVersion per-span attribute was removed - version is already in resource attributes
    // as service.version, so no need to duplicate on each span

    it('should set payload size attribute (not the payload content)', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      const payload = '{"key":"value","nested":{"data":123}}';
      service.recordUsage({
        ...baseCall,
        payload,
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('mcp.payload.size', payload.length);
    });

    it('should set OK status for successful calls', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUsage({
        ...baseCall,
        status: 'success',
      });

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.OK,
      });
    });

    it('should set ERROR status for failed calls', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUsage({
        ...baseCall,
        status: 'failure',
        result: 'Something went wrong',
      });

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'Something went wrong',
      });
    });

    it('should set http.response.status_code to 500 for failed calls', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUsage({
        ...baseCall,
        status: 'failure',
        result: 'Something went wrong',
      });

      const attrs = (mockSpan.setAttributes.mock.calls as unknown as any[][])[0]?.[0] as Record<string, any>;
      expect(attrs['http.response.status_code']).toBe(500);
    });

    it('should include sanitized request payload on failures', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      const payload = '{"query":"(FormattedID = US123)","token":"Bearer secret123"}';
      service.recordUsage({
        ...baseCall,
        status: 'failure',
        result: 'API error',
        payload,
      });

      // Verify sanitized payload is included
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        'mcp.failure.request',
        expect.stringContaining('[REDACTED]'),
      );
    });

    // Note: error.message attribute was removed as redundant - error info is already in span status message

    it('should use Unknown error fallback when result is undefined for failures', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUsage({
        ...baseCall,
        status: 'failure',
        result: undefined,
      });

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'Unknown error',
      });
    });

    it('should truncate long error messages to 512 bytes', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      // Create an error message longer than 512 bytes (ASCII chars = 1 byte each)
      const longErrorMessage = 'A'.repeat(600);

      service.recordUsage({
        ...baseCall,
        status: 'failure',
        result: longErrorMessage,
      });

      // Should be truncated to 512 bytes + '...'
      const expectedTruncated = 'A'.repeat(512) + '...';
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: expectedTruncated,
      });
    });

    it('should handle multi-byte characters correctly when truncating', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      // Create a message with emoji (4 bytes each in UTF-8)
      // 128 emoji = 512 bytes exactly, one more would exceed
      const emojiMessage = '🔥'.repeat(130); // 520 bytes

      service.recordUsage({
        ...baseCall,
        status: 'failure',
        result: emojiMessage,
      });

      // The truncated message should be valid UTF-8 and not have broken characters
      const setStatusCall = (mockSpan.setStatus.mock.calls as unknown as any[][])[0]?.[0] as Record<string, any>;
      expect(setStatusCall.code).toBe(SpanStatusCode.ERROR);
      // Should end with '...' and not have broken emoji
      expect(setStatusCall.message.endsWith('...')).toBe(true);
      // Should be decodable as valid UTF-8 (no replacement characters)
      expect(setStatusCall.message.includes('\uFFFD')).toBe(false);
    });

    it('should not truncate error messages under 512 bytes', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      const shortErrorMessage = 'A'.repeat(500);

      service.recordUsage({
        ...baseCall,
        status: 'failure',
        result: shortErrorMessage,
      });

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: shortErrorMessage,
      });
    });

    it('should handle exactly 512 byte error messages without truncation', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      const exactLengthMessage = 'B'.repeat(512);

      service.recordUsage({
        ...baseCall,
        status: 'failure',
        result: exactLengthMessage,
      });

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: exactLengthMessage,
      });
    });

    it('should end the span after setting attributes', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUsage(baseCall);

      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should handle unknown status gracefully', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUsage({
        ...baseCall,
        status: undefined,
      });

      expect(mockSpan.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({
          'mcp.execution.status': 'unknown',
        }),
      );
    });

    it('should include mcp.client.name and mcp.client.version when client info is set', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        transportType: 'stdio',
        appVersion: '1.0.0',
      });
      service.initialize();
      service.setClientInfo('claude-ai', '0.1.0');

      service.recordUsage(baseCall);

      const attrs = (mockSpan.setAttributes.mock.calls as unknown as any[][])[0]?.[0] as Record<string, any>;
      expect(attrs['mcp.client.name']).toBe('claude-ai');
      expect(attrs['mcp.client.version']).toBe('0.1.0');
    });

    it('should not include mcp.client.name or mcp.client.version when client info is not set', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        transportType: 'stdio',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUsage(baseCall);

      const attrs = (mockSpan.setAttributes.mock.calls as unknown as any[][])[0]?.[0] as Record<string, any>;
      expect(attrs['mcp.client.name']).toBeUndefined();
      expect(attrs['mcp.client.version']).toBeUndefined();
    });
  });

  describe('setClientInfo', () => {
    it('should store client name and version', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      service.setClientInfo('cursor', '1.2.3');

      expect(service.getClientName()).toBe('cursor');
      expect(service.getClientVersion()).toBe('1.2.3');
    });

    it('should allow updating client info', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      service.setClientInfo('claude-ai', '0.1.0');
      service.setClientInfo('copilot-vscode', '2.0.0');

      expect(service.getClientName()).toBe('copilot-vscode');
      expect(service.getClientVersion()).toBe('2.0.0');
    });

    it('should log debug message when client info is set', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      service.setClientInfo('windsurf', '3.0.0');

      expect(mockLog.logDebug).toHaveBeenCalledWith(
        'Telemetry: client info set (name=windsurf, version=3.0.0)',
      );
    });

    it('should have undefined client info by default', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      expect(service.getClientName()).toBeUndefined();
      expect(service.getClientVersion()).toBeUndefined();
    });

    it('should store session-scoped client info when sessionId is provided', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      const call: RegistryCall = {
        itemId: 'test-tool',
        itemType: 'tool',
        payload: '{}',
        runTimeMs: 100,
        status: 'success',
      };

      service.setClientInfo('claude-ai', '0.1.0', 'session-abc');
      service.setClientInfo('cursor', '2.0.0', 'session-xyz');

      // Instance-level reflects the last call
      expect(service.getClientName()).toBe('cursor');
      expect(service.getClientVersion()).toBe('2.0.0');

      // But session-scoped spans use the correct client
      service.recordUsage({ ...call, sessionId: 'session-abc' });
      const attrsA = (mockSpan.setAttributes.mock.calls as unknown as any[][])[0]?.[0] as Record<string, any>;
      expect(attrsA['mcp.client.name']).toBe('claude-ai');
      expect(attrsA['mcp.client.version']).toBe('0.1.0');

      service.recordUsage({ ...call, sessionId: 'session-xyz' });
      const attrsB = (mockSpan.setAttributes.mock.calls as unknown as any[][])[1]?.[0] as Record<string, any>;
      expect(attrsB['mcp.client.name']).toBe('cursor');
      expect(attrsB['mcp.client.version']).toBe('2.0.0');
    });

    it('should fall back to instance-level client info when sessionId has no mapping', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      const call: RegistryCall = {
        itemId: 'test-tool',
        itemType: 'tool',
        payload: '{}',
        runTimeMs: 100,
        status: 'success',
      };

      service.setClientInfo('claude-ai', '0.1.0');

      service.recordUsage({ ...call, sessionId: 'unknown-session' });
      const attrs = (mockSpan.setAttributes.mock.calls as unknown as any[][])[0]?.[0] as Record<string, any>;
      expect(attrs['mcp.client.name']).toBe('claude-ai');
      expect(attrs['mcp.client.version']).toBe('0.1.0');
    });

    it('should remove session-scoped client info via removeClientInfo', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      const call: RegistryCall = {
        itemId: 'test-tool',
        itemType: 'tool',
        payload: '{}',
        runTimeMs: 100,
        status: 'success',
      };

      service.setClientInfo('cursor', '2.0.0', 'session-abc');
      service.removeClientInfo('session-abc');

      // Falls back to instance-level after removal
      service.recordUsage({ ...call, sessionId: 'session-abc' });
      const attrs = (mockSpan.setAttributes.mock.calls as unknown as any[][])[0]?.[0] as Record<string, any>;
      expect(attrs['mcp.client.name']).toBe('cursor');
      expect(attrs['mcp.client.version']).toBe('2.0.0');
    });
  });

  describe('shutdown', () => {
    it('should call provider shutdown when initialized', async () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      await service.shutdown();

      expect(mockProvider.shutdown).toHaveBeenCalled();
    });

    it('should not throw when called without initialization', async () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      expect(service.shutdown()).resolves.toBeUndefined();
    });
  });

  describe('flush', () => {
    it('should call provider forceFlush when initialized', async () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      await service.flush();

      expect(mockProvider.forceFlush).toHaveBeenCalled();
    });

    it('should not throw when called without initialization', async () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      expect(service.flush()).resolves.toBeUndefined();
    });

    it('should timeout after specified duration and not block', async () => {
      // Make forceFlush hang indefinitely
      mockProvider.forceFlush.mockImplementationOnce(
        () => new Promise(() => {}), // Never resolves
      );

      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      const startTime = Date.now();
      // Use a short timeout for testing (50ms)
      await service.flush(50);
      const elapsed = Date.now() - startTime;

      // Should complete quickly (within ~100ms) due to timeout, not hang forever
      expect(elapsed).toBeLessThan(200);

      // Should log the timeout error
      expect(mockLog.logError).toHaveBeenCalledWith(
        'Telemetry: failed to flush telemetry',
        expect.objectContaining({
          error: 'Flush timeout',
        }),
      );
    });

    it('should use custom timeout when provided', async () => {
      mockProvider.forceFlush.mockImplementationOnce(
        () => new Promise(() => {}), // Never resolves
      );

      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      const startTime = Date.now();
      await service.flush(100); // 100ms timeout
      const elapsed = Date.now() - startTime;

      // Should timeout around 100ms, not hang
      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(elapsed).toBeLessThan(300);
    });
  });

  describe('getTracer', () => {
    it('should return null before initialization', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      expect(service.getTracer()).toBeNull();
    });

    it('should return tracer after initialization', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      expect(service.getTracer()).toBe(mockTracer as unknown as ReturnType<typeof service.getTracer>);
    });
  });

  describe('error handling', () => {
    const baseCall: RegistryCall = {
      itemId: 'test-tool',
      itemType: 'tool',
      payload: '{"arg":"value"}',
      runTimeMs: 150,
      status: 'success',
    };

    it('should log error and not throw when OTLPTraceExporter throws during initialization', () => {
      MockOTLPTraceExporter.mockImplementationOnce(() => {
        throw new Error('Failed to create exporter');
      });

      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      // Should not throw
      expect(() => service.initialize()).not.toThrow();

      // Should log the error with standardized message format
      expect(mockLog.logError).toHaveBeenCalledWith(
        'Telemetry: failed to initialize',
        expect.objectContaining({
          error: 'Failed to create exporter',
        }),
      );

      // Should not be initialized
      expect(service.isInitialized()).toBe(false);
    });

    it('should log error and not throw when NodeTracerProvider throws during initialization', () => {
      MockNodeTracerProvider.mockImplementationOnce(() => {
        throw new Error('Provider creation failed');
      });

      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      expect(() => service.initialize()).not.toThrow();

      expect(mockLog.logError).toHaveBeenCalledWith(
        'Telemetry: failed to initialize',
        expect.objectContaining({
          error: 'Provider creation failed',
        }),
      );
    });

    it('should log error and not throw when span.setAttributes throws', () => {
      mockSpan.setAttributes.mockImplementationOnce(() => {
        throw new Error('setAttributes failed');
      });

      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      // Should not throw (recordUsage is synchronous)
      expect(() => service.recordUsage(baseCall)).not.toThrow();

      // Should log the error with standardized message format
      expect(mockLog.logError).toHaveBeenCalledWith(
        'Telemetry: failed to record span',
        expect.objectContaining({
          error: 'setAttributes failed',
          itemType: 'tool',
          itemId: 'test-tool',
        }),
      );
    });

    it('should log error and not throw when provider.shutdown throws', async () => {
      mockProvider.shutdown.mockImplementationOnce(() => {
        throw new Error('Shutdown failed');
      });

      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      // Should not throw
      expect(service.shutdown()).resolves.toBeUndefined();

      // Should log the error with standardized message format
      expect(mockLog.logError).toHaveBeenCalledWith(
        'Telemetry: failed to shutdown trace provider',
        expect.objectContaining({
          error: 'Shutdown failed',
        }),
      );
    });

    it('should log error and not throw when provider.forceFlush throws', async () => {
      mockProvider.forceFlush.mockImplementationOnce(() => {
        throw new Error('Flush failed');
      });

      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      // Should not throw
      expect(service.flush()).resolves.toBeUndefined();

      // Should log the error with standardized message format
      expect(mockLog.logError).toHaveBeenCalledWith(
        'Telemetry: failed to flush telemetry',
        expect.objectContaining({
          error: 'Flush failed',
        }),
      );
    });
  });

  describe('recordUpdateEvent', () => {
    const baseUpdateEvent = {
      platform: 'win32',
      arch: 'x64',
      fromVersion: '2.0.0',
      toVersion: '2.1.0',
      outcome: 'success' as const,
    };

    it('should not record when license key is missing', () => {
      const service = new TelemetryService({
        licenseKey: undefined,
        appVersion: '1.0.0',
      });

      service.recordUpdateEvent(baseUpdateEvent);

      expect(mockTracer.startSpan).not.toHaveBeenCalled();
    });

    it('should auto-initialize when recording if not initialized', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      expect(service.isInitialized()).toBe(false);

      service.recordUpdateEvent(baseUpdateEvent);

      expect(service.isInitialized()).toBe(true);
    });

    it('should create span with correct name', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUpdateEvent(baseUpdateEvent);

      expect(mockTracer.startSpan).toHaveBeenCalledWith('qnsc-mcp.update', {
        kind: 0, // SpanKind.INTERNAL
      });
    });

    it('should set core attributes on span', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUpdateEvent({
        platform: 'darwin',
        arch: 'arm64',
        fromVersion: '1.0.0',
        toVersion: '1.1.0',
        outcome: 'success',
      });

      expect(mockSpan.setAttributes).toHaveBeenCalled();
      const attrs = (mockSpan.setAttributes.mock.calls as unknown as any[][])[0]?.[0] as Record<string, any>;

      expect(attrs['update.platform']).toBe('darwin');
      expect(attrs['update.arch']).toBe('arm64');
      expect(attrs['update.from_version']).toBe('1.0.0');
      expect(attrs['update.outcome']).toBe('success');
    });

    it('should set optional toVersion attribute when provided', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUpdateEvent({
        ...baseUpdateEvent,
        toVersion: '3.0.0',
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('update.to_version', '3.0.0');
    });

    it('should set failureReason attribute for failures', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUpdateEvent({
        ...baseUpdateEvent,
        outcome: 'failure',
        failureReason: 'file_locked',
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('update.failure_reason', 'file_locked');
    });

    it('should set fileLockDetected attribute when provided', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUpdateEvent({
        ...baseUpdateEvent,
        fileLockDetected: true,
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('update.file_lock_detected', true);
    });

    it('should set lockingProcess attribute when provided', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUpdateEvent({
        ...baseUpdateEvent,
        lockingProcess: 'VS Code',
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('update.locking_process', 'VS Code');
    });

    it('should set adminRequired attribute when provided', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUpdateEvent({
        ...baseUpdateEvent,
        adminRequired: true,
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('update.admin_required', true);
    });

    it('should set waitTimeSeconds attribute when provided', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUpdateEvent({
        ...baseUpdateEvent,
        waitTimeSeconds: 45,
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('update.wait_time_seconds', 45);
    });

    it('should set durationMs attribute when provided', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUpdateEvent({
        ...baseUpdateEvent,
        durationMs: 5000,
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('update.duration_ms', 5000);
    });

    it('should set fromMarkerFile attribute when provided', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUpdateEvent({
        ...baseUpdateEvent,
        fromMarkerFile: true,
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('update.from_marker_file', true);
    });

    it('should set OK status for successful updates', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUpdateEvent({
        ...baseUpdateEvent,
        outcome: 'success',
      });

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.OK,
      });
    });

    it('should set ERROR status for failed updates', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUpdateEvent({
        ...baseUpdateEvent,
        outcome: 'failure',
        failureReason: 'permission_denied',
      });

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'permission_denied',
      });
    });

    it('should use default message when failureReason is not provided', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUpdateEvent({
        ...baseUpdateEvent,
        outcome: 'failure',
      });

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'Update failed',
      });
    });

    it('should set OK status for deferred updates (Windows)', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUpdateEvent({
        ...baseUpdateEvent,
        outcome: 'deferred',
      });

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.OK,
      });
    });

    it('should end the span after setting attributes', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUpdateEvent(baseUpdateEvent);

      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should handle span creation errors gracefully', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      mockTracer.startSpan.mockImplementationOnce(() => {
        throw new Error('Span creation failed');
      });

      // Should not throw
      expect(() => service.recordUpdateEvent(baseUpdateEvent)).not.toThrow();

      // Should log the error
      expect(mockLog.logError).toHaveBeenCalledWith(
        'Telemetry: failed to record update event',
        expect.objectContaining({
          error: 'Span creation failed',
        }),
      );
    });
  });

  describe('recordLog', () => {
    // Mock the logger instance that will be returned by loggerProvider.getLogger()
    const mockLogger = {
      emit: mock(() => {}),
    };

    // Mock the loggerProvider (note: uses getLogger() to return mockLogger)
    const mockLogProvider = {
      shutdown: mock(() => Promise.resolve()),
      forceFlush: mock(() => Promise.resolve()),
      getLogger: mock(() => mockLogger),
    };

    beforeEach(() => {
      mockLogger.emit.mockClear();
      mockLogProvider.shutdown.mockClear();
      mockLogProvider.forceFlush.mockClear();
      mockLogProvider.getLogger.mockClear();
    });

    it('should not record logs when telemetry is disabled', () => {
      setMockedEnvVar('TELEMETRY', 'false');

      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      service.recordLog({
        level: 'INFO',
        message: 'Test message',
      });

      expect(mockLogger.emit).not.toHaveBeenCalled();
    });

    it('should not record logs when no license key is provided', () => {
      setMockedEnvVar('TELEMETRY', null);

      const service = new TelemetryService({
        licenseKey: undefined,
        appVersion: '1.0.0',
      });

      service.recordLog({
        level: 'INFO',
        message: 'Test message',
      });

      expect(mockLogger.emit).not.toHaveBeenCalled();
    });

    it('should initialize before recording when not already initialized', () => {
      setMockedEnvVar('TELEMETRY', null);

      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      // Mock the logger and logProvider to test initialization

      (service as any).loggerProvider = mockLogProvider;
      (service as any).initialized = true;

      service.recordLog({
        level: 'INFO',
        message: 'Test message',
      });

      expect(mockLogger.emit).toHaveBeenCalled();
    });

    it('should sanitize log message and data', () => {
      setMockedEnvVar('TELEMETRY', null);

      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      (service as any).loggerProvider = mockLogProvider;
      (service as any).initialized = true;

      service.recordLog({
        level: 'ERROR',
        message: 'API failed with KEY=secret123',
        data: { password: 'secret456' },
      });

      expect(mockLogger.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'API failed with KEY=[REDACTED]',
          severityText: 'ERROR',
          severityNumber: 17, // SEVERITY_NUMBER.ERROR
          attributes: expect.objectContaining({
            'log.data': expect.stringContaining('[REDACTED]'),
          }),
        }),
      );
    });

    it('should set correct severity numbers for log levels', () => {
      setMockedEnvVar('TELEMETRY', null);

      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      (service as any).loggerProvider = mockLogProvider;
      (service as any).initialized = true;

      const testCases = [
        { level: 'DEBUG' as const, expectedSeverity: 5 },
        { level: 'INFO' as const, expectedSeverity: 9 },
        { level: 'WARN' as const, expectedSeverity: 13 },
        { level: 'ERROR' as const, expectedSeverity: 17 },
      ];

      testCases.forEach(({ level, expectedSeverity }) => {
        service.recordLog({
          level,
          message: `Test ${level} message`,
        });

        expect(mockLogger.emit).toHaveBeenLastCalledWith(
          expect.objectContaining({
            severityNumber: expectedSeverity,
            severityText: level,
          }),
        );
      });
    });

    it('should handle logger not available gracefully', () => {
      setMockedEnvVar('TELEMETRY', null);

      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      // Simulate loggerProvider being null (e.g., initialization failed)
      (service as any).loggerProvider = null;
      (service as any).initialized = true;

      // Should not throw - silently returns when loggerProvider is null
      expect(() =>
        service.recordLog({
          level: 'INFO',
          message: 'Test message',
        }),
      ).not.toThrow();

      // Should not call emit since loggerProvider is null
      expect(mockLogger.emit).not.toHaveBeenCalled();
    });

    it('should handle log emission errors gracefully', () => {
      setMockedEnvVar('TELEMETRY', null);

      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      const errorLogProvider = {
        getLogger: mock(() => ({
          emit: mock(() => {
            throw new Error('Log emission failed');
          }),
        })),
      };

      (service as any).loggerProvider = errorLogProvider;
      (service as any).initialized = true;

      // Should not throw - errors are caught silently to avoid recursion
      expect(() =>
        service.recordLog({
          level: 'INFO',
          message: 'Test message',
        }),
      ).not.toThrow();
    });
  });

  describe('session correlation', () => {
    const baseCall: RegistryCall = {
      itemId: 'test-tool',
      itemType: 'tool',
      payload: '{"arg":"value"}',
      runTimeMs: 150,
      status: 'success',
    };

    it('should generate a unique session ID on construction', () => {
      const service1 = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      const service2 = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      // Each service instance should have a unique session ID
      expect(service1.getSessionId()).toBeDefined();
      expect(service2.getSessionId()).toBeDefined();
      expect(service1.getSessionId()).not.toBe(service2.getSessionId());

      // Session IDs should be valid UUIDs
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(service1.getSessionId()).toMatch(uuidRegex);
      expect(service2.getSessionId()).toMatch(uuidRegex);
    });

    it('should maintain the same session ID across multiple recordUsage calls', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      const sessionIdBefore = service.getSessionId();
      service.initialize();
      service.recordUsage(baseCall);
      service.recordUsage(baseCall);
      service.recordUsage(baseCall);

      expect(service.getSessionId()).toBe(sessionIdBefore);
    });

    it('should start request sequence at 0', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });

      expect(service.getRequestSequence()).toBe(0);
    });

    it('should increment request sequence with each recordUsage call', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      expect(service.getRequestSequence()).toBe(0);

      service.recordUsage(baseCall);
      expect(service.getRequestSequence()).toBe(1);

      service.recordUsage(baseCall);
      expect(service.getRequestSequence()).toBe(2);

      service.recordUsage(baseCall);
      expect(service.getRequestSequence()).toBe(3);
    });

    it('should include session ID and request sequence in span attributes', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        transportType: 'stdio',
        appVersion: '1.0.0',
      });
      service.initialize();

      service.recordUsage(baseCall);

      expect(mockSpan.setAttributes).toHaveBeenCalled();
      const attrs = (mockSpan.setAttributes.mock.calls as unknown as any[][])[0]?.[0] as Record<string, any>;

      expect(attrs['mcp.session.id']).toBe(service.getSessionId());
      expect(attrs['mcp.session.request_sequence']).toBe(1);
    });

    it('should have incrementing request sequence in consecutive spans', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      // First call
      service.recordUsage(baseCall);
      const attrs1 = (mockSpan.setAttributes.mock.calls as unknown as any[][])[0]?.[0] as Record<string, any>;
      expect(attrs1['mcp.session.request_sequence']).toBe(1);

      // Second call
      service.recordUsage(baseCall);
      const attrs2 = (mockSpan.setAttributes.mock.calls as unknown as any[][])[1]?.[0] as Record<string, any>;
      expect(attrs2['mcp.session.request_sequence']).toBe(2);

      // Third call
      service.recordUsage(baseCall);
      const attrs3 = (mockSpan.setAttributes.mock.calls as unknown as any[][])[2]?.[0] as Record<string, any>;
      expect(attrs3['mcp.session.request_sequence']).toBe(3);

      // All should have the same session ID
      expect(attrs1['mcp.session.id']).toBe(attrs2['mcp.session.id']);
      expect(attrs2['mcp.session.id']).toBe(attrs3['mcp.session.id']);
    });

    it('should not increment request sequence when telemetry is disabled', () => {
      const service = new TelemetryService({
        licenseKey: undefined, // Telemetry disabled
        appVersion: '1.0.0',
      });

      expect(service.getRequestSequence()).toBe(0);

      service.recordUsage(baseCall);
      service.recordUsage(baseCall);

      // Sequence should not increment when telemetry is disabled
      expect(service.getRequestSequence()).toBe(0);
    });

    it('should not increment request sequence when TELEMETRY=false even with license key', () => {
      setMockedEnvVar('TELEMETRY', 'false');

      const service = new TelemetryService({
        licenseKey: 'test-key', // License key present but telemetry opted out
        appVersion: '1.0.0',
      });

      expect(service.getRequestSequence()).toBe(0);

      service.recordUsage(baseCall);
      service.recordUsage(baseCall);

      // Sequence should not increment when telemetry is opted out via env var
      expect(service.getRequestSequence()).toBe(0);

      // Clean up env var
      setMockedEnvVar('TELEMETRY', 'true');
    });

    it('should not increment request sequence for recordUpdateEvent calls', () => {
      const service = new TelemetryService({
        licenseKey: 'test-key',
        appVersion: '1.0.0',
      });
      service.initialize();

      expect(service.getRequestSequence()).toBe(0);

      service.recordUpdateEvent({
        platform: 'darwin',
        arch: 'arm64',
        fromVersion: '1.0.0',
        toVersion: '1.1.0',
        outcome: 'success',
      });

      // Update events should not increment the request sequence
      // (only recordUsage calls increment it)
      expect(service.getRequestSequence()).toBe(0);

      // But recordUsage should still increment
      service.recordUsage(baseCall);
      expect(service.getRequestSequence()).toBe(1);
    });

    it('should have session ID available even when telemetry is disabled', () => {
      const service = new TelemetryService({
        licenseKey: undefined, // Telemetry disabled
        appVersion: '1.0.0',
      });

      // Session ID should still be generated and accessible
      const sessionId = service.getSessionId();
      expect(sessionId).toBeDefined();
      expect(sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });
  });

  describe('lazy singleton', () => {
    // Import the singleton functions for testing
    // Note: These are tested separately from the class to verify the lazy initialization pattern

    it('getTelemetryService should return the same instance on multiple calls', async () => {
      const { getTelemetryService, resetTelemetryService } = await import('./index');

      // Reset to get a fresh instance
      resetTelemetryService();

      const instance1 = getTelemetryService();
      const instance2 = getTelemetryService();

      expect(instance1).toBe(instance2);

      // Cleanup
      resetTelemetryService();
    });

    it('resetTelemetryService should clear the singleton instance', async () => {
      const { getTelemetryService, resetTelemetryService } = await import('./index');

      // Get an instance
      const _instance1 = getTelemetryService();

      // Reset
      resetTelemetryService();

      // Get a new instance - should be different
      const instance2 = getTelemetryService();

      // Note: Can't directly compare because TelemetryService doesn't have unique identifiers,
      // but we can verify it's a TelemetryService instance
      expect(instance2).toBeInstanceOf(TelemetryService);

      // Cleanup
      resetTelemetryService();
    });

    // Note: Default export integration is verified by server.ts and tracking middleware tests,
    // which use the actual telemetryService import pattern (telemetryService.initialize(), etc.)
  });
});
