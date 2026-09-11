import { SpanStatusCode, trace, Tracer } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { Resource, resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import type { LoggerProvider } from '@opentelemetry/sdk-logs';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { platform, release, userInfo } from 'os';
import { type NewRelicRegion } from '../../constants';
import env from '../../env';
import { getAppVersion } from '../../utils';
import { getEmbeddedGenericSecret } from '../auth';
import { RegistryCall } from '../db/types';
import { logDebug, logError } from '../logger';
import { sanitizeLogData, sanitizeLogMessage } from './log-sanitizer';

/**
 * Outcome of an update operation
 */
export type UpdateOutcome =
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'no_update_available'
  | 'deferred'; // For Windows where update happens after process exit

/**
 * Specific failure reasons for update operations.
 * These help diagnose issues without exposing sensitive data.
 */
export type UpdateFailureReason =
  | 'permission_denied' // No write access to binary location
  | 'file_locked' // Binary in use by another process
  | 'file_locked_timeout' // User didn't close blocking app in time
  | 'cancelled' // User cancelled the update (e.g., Ctrl+C during lock wait)
  | 'download_failed' // Failed to download from GitHub
  | 'verification_failed' // Hash/size mismatch after copy
  | 'script_creation_failed' // Failed to create PowerShell script (Windows)
  | 'script_spawn_failed' // Failed to spawn PowerShell (Windows)
  | 'concurrent_update' // Another update already in progress
  | 'binary_path_unknown' // Could not determine current binary path
  | 'auth_failed' // No GitHub token available
  | 'too_many_backups' // Too many locked .old files from previous updates (Windows)
  | 'rename_failed' // Failed to rename running executable (Windows)
  | 'copy_failed' // Failed to copy new executable into place
  | 'rename_failed_rollback_broken' // Rename failed and rollback also failed — system may be broken
  | 'verification_failed_rollback_broken' // Verification failed and rollback also failed — system may be broken
  | 'unknown'; // Catch-all for unexpected errors

/**
 * Event data for update telemetry.
 * Captures key information about update attempts for debugging and analytics.
 *
 * Privacy note: No file paths, usernames, or error stack traces are included.
 * Only categorical data and version strings are sent.
 */
export interface UpdateEvent {
  /** Platform: win32, darwin, linux */
  platform: string;

  /** Architecture: x64, arm64 */
  arch: string;

  /** Version being updated from */
  fromVersion: string;

  /** Version being updated to (if known) */
  toVersion?: string;

  /** Outcome of the update operation */
  outcome: UpdateOutcome;

  /** Specific failure reason (only set when outcome is 'failure') */
  failureReason?: UpdateFailureReason;

  /** Whether the file was initially detected as locked (Windows) */
  fileLockDetected?: boolean;

  /** Name of process holding the lock (e.g., 'VS Code', 'Cursor') */
  lockingProcess?: string;

  /** Whether admin/elevated privileges were required */
  adminRequired?: boolean;

  /** Seconds spent waiting for file lock release (if applicable) */
  waitTimeSeconds?: number;

  /** Duration of the entire update operation in milliseconds */
  durationMs?: number;

  /** Whether this event came from a marker file (async Windows update result) */
  fromMarkerFile?: boolean;

  /** Whether post-swap verification was skipped (e.g., permission denied reading installed binary) */
  verificationSkipped?: boolean;
}

/**
 * Default service name used for OpenTelemetry resource identification.
 * Can be overridden via TelemetryConfig.serviceName.
 */
const DEFAULT_SERVICE_NAME = 'qnsc-mcp';

/**
 * New Relic OTLP trace endpoints by region.
 * @see https://docs.newrelic.com/docs/opentelemetry/best-practices/opentelemetry-otlp/#configure-endpoint-port-protocol
 */
const NR_OTLP_TRACE_ENDPOINTS: Record<NewRelicRegion, string> = {
  US: 'https://otlp.nr-data.net:4318/v1/traces',
  EU: 'https://otlp.eu01.nr-data.net:4318/v1/traces',
  EU2: 'https://otlp.eu02.nr-data.net:4318/v1/traces',
} as const;

/**
 * New Relic OTLP log endpoints by region.
 * @see https://docs.newrelic.com/docs/opentelemetry/best-practices/opentelemetry-otlp/#configure-endpoint-port-protocol
 */
const NR_OTLP_LOG_ENDPOINTS: Record<NewRelicRegion, string> = {
  US: 'https://otlp.nr-data.net:4318/v1/logs',
  EU: 'https://otlp.eu01.nr-data.net:4318/v1/logs',
  EU2: 'https://otlp.eu02.nr-data.net:4318/v1/logs',
} as const;

/**
 * Timeout for flush operations during shutdown (in milliseconds).
 * This prevents blocking indefinitely if New Relic is unreachable.
 */
const FLUSH_TIMEOUT_MS = 5000;

/**
 * Default BatchSpanProcessor configuration for OpenTelemetry span batching.
 *
 * These values are tuned for a CLI tool with moderate telemetry volume:
 * - maxQueueSize: 100 spans max in memory before dropping oldest. Conservative
 *   to limit memory footprint in long-running sessions.
 * - maxExportBatchSize: 50 spans per HTTP request. Balances network efficiency
 *   (fewer requests) against latency (smaller batches export faster).
 * - scheduledDelayMillis: 2000ms between batch exports. Short delay ensures
 *   spans from short-lived CLI commands are exported before process exits.
 * - exportTimeoutMillis: 30000ms max wait per export. Generous timeout handles
 *   slow networks/proxies without failing unnecessarily.
 */
const DEFAULT_BATCH_CONFIG = {
  maxQueueSize: 100,
  maxExportBatchSize: 50,
  scheduledDelayMillis: 2000,
  exportTimeoutMillis: 30000,
} as const;

/**
 * Configuration options for the BatchSpanProcessor.
 * All fields are optional and will use defaults if not specified.
 */
export interface BatchConfig {
  /** Maximum spans in queue before dropping oldest (default: 100) */
  maxQueueSize?: number;
  /** Maximum spans per export batch (default: 50) */
  maxExportBatchSize?: number;
  /** Milliseconds between scheduled exports (default: 2000) */
  scheduledDelayMillis?: number;
  /** Maximum milliseconds to wait for export (default: 30000) */
  exportTimeoutMillis?: number;
}

/**
 * Configuration for the OpenTelemetry-based telemetry service.
 *
 * This interface defines all configurable options for telemetry collection and export.
 * Most options have sensible defaults and don't need to be explicitly set.
 *
 * @example
 * ```typescript
 * // Minimal configuration (uses defaults)
 * const service = new TelemetryService();
 *
 * // Custom configuration
 * const service = new TelemetryService({
 *   licenseKey: 'your-license-key',
 *   region: 'EU',
 *   transportType: 'httpStream'
 * });
 * ```
 */
export interface TelemetryConfig {
  /**
   * New Relic Ingest License Key for OTLP export.
   *
   * Resolution priority:
   * 1. This explicit config value (if provided)
   * 2. NEW_RELIC_LICENSE_KEY_MCP environment variable (explicit manual override)
   * 3. Build-time bundled constant (default for production)
   *
   * IMPORTANT: The generic NEW_RELIC_LICENSE_KEY env var is intentionally NOT
   * used here. Users often have that set for their own New Relic APM agents;
   * using it would silently redirect QNSC MCP telemetry to their account.
   * Only NEW_RELIC_LICENSE_KEY_MCP is recognized as an env var override.
   *
   * An empty string ('') is treated as "no key" and will disable telemetry.
   */
  licenseKey?: string;

  /**
   * Custom OTLP endpoint URL. If not provided, uses New Relic endpoint based on region.
   * @example 'https://otlp.nr-data.net:4318/v1/traces'
   */
  otlpEndpoint?: string;

  /**
   * New Relic region for endpoint selection. Only used if otlpEndpoint is not set.
   * @default 'US'
   */
  region?: NewRelicRegion;

  /**
   * Transport type being used (e.g., 'stdio', 'httpStream').
   * Included in telemetry spans for analytics segmentation.
   */
  transportType?: string;

  /**
   * Application version string (e.g., '2.0.0').
   * If not provided, reads from package.json at runtime.
   */
  appVersion?: string;

  /**
   * Service name for OpenTelemetry resource identification.
   * @default 'qnsc-mcp'
   */
  serviceName?: string;

  /**
   * BatchSpanProcessor configuration for controlling span batching behavior.
   * Useful for tuning export frequency for short-lived CLI commands.
   */
  batchConfig?: BatchConfig;
}

/**
 * OpenTelemetry-based telemetry service for MCP usage tracking.
 *
 * Exports spans to New Relic via OTLP protocol. Telemetry data includes:
 * - Tool/prompt execution metrics (duration, status)
 * - Resource attributes (service name, version, OS info)
 * - User identifier (OS username) for usage analytics
 *
 * **Privacy Note**: The OS username is included in resource attributes for
 * aggregate usage analytics. No tool arguments or results are sent, only
 * payload sizes. Error messages are truncated to prevent accidental PII exposure.
 *
 * @example
 * ```typescript
 * // Initialize at startup
 * telemetryService.initialize();
 *
 * // Record tool usage (sync - exports happen in background)
 * telemetryService.recordUsage({
 *   itemId: 'myTool',
 *   itemType: 'tool',
 *   runTimeMs: 150,
 *   status: 'success'
 * });
 *
 * // Flush before shutdown
 * await telemetryService.flush();
 * await telemetryService.shutdown();
 * ```
 */
/**
 * Log level for telemetry log records.
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

/**
 * Log entry for telemetry export.
 */
export interface LogEntry {
  /** Log level */
  level: LogLevel;
  /** Log message */
  message: string;
  /** Optional structured data */
  data?: unknown;
}

/**
 * OpenTelemetry severity number constants.
 * @see https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber
 */
const SEVERITY_NUMBER = {
  DEBUG: 5,
  INFO: 9,
  WARN: 13,
  ERROR: 17,
} as const;

/**
 * Map log level strings to OpenTelemetry severity numbers.
 */
const LOG_LEVEL_TO_SEVERITY: Record<LogLevel, number> = {
  DEBUG: SEVERITY_NUMBER.DEBUG,
  INFO: SEVERITY_NUMBER.INFO,
  WARN: SEVERITY_NUMBER.WARN,
  ERROR: SEVERITY_NUMBER.ERROR,
};

/**
 * Check whether a value is an unresolved template placeholder.
 *
 * Used only for values read directly from `process.env` (which bypasses
 * the centralized stripping in env.ts). Values from the parsed `env`
 * module are already sanitized.
 */
function isUnresolvedPlaceholder(value: string | undefined): boolean {
  return typeof value === 'string' && value.startsWith('${');
}

export class TelemetryService {
  private tracer: Tracer | null = null;
  private provider: NodeTracerProvider | null = null;
  private loggerProvider: LoggerProvider | null = null;
  private initialized = false;
  private initializationFailed = false;
  private config: TelemetryConfig;
  private resource: Resource | null = null;

  /**
   * Unique identifier for this server session.
   * Generated once at service construction time and remains constant
   * for the lifetime of this TelemetryService instance.
   * Used to correlate all telemetry events from the same MCP server session.
   */
  private readonly sessionId: string;

  /**
   * Counter tracking the sequence of requests within this session.
   * Increments with each recordUsage() call, allowing events to be ordered
   * chronologically within a session even if timestamps are identical.
   */
  private requestSequence: number = 0;

  /**
   * MCP client application name from the protocol handshake.
   * Set after the MCP `initialize` handshake completes via `setClientInfo()`.
   */
  private clientName: string | undefined;

  /**
   * MCP client application version from the protocol handshake.
   * Set after the MCP `initialize` handshake completes via `setClientInfo()`.
   */
  private clientVersion: string | undefined;

  /**
   * Session-scoped MCP client info for multi-session transports (httpStream).
   * Maps transport sessionId to client identity so concurrent sessions
   * don't overwrite each other's client info on the singleton.
   */
  private clientInfoMap: Map<string, { name: string; version: string }> = new Map();

  constructor(config?: Partial<TelemetryConfig>) {
    // Generate a unique session ID for correlating events from this server instance
    this.sessionId = crypto.randomUUID();
    this.config = {
      licenseKey: config?.licenseKey ?? this.resolveLicenseKey(),
      otlpEndpoint: config?.otlpEndpoint ?? env.NEW_RELIC_OTLP_ENDPOINT,
      region: config?.region ?? env.NEW_RELIC_REGION ?? 'US',
      transportType: config?.transportType ?? env.TRANSPORT_TYPE,
      appVersion: config?.appVersion ?? getAppVersion(),
      serviceName: config?.serviceName ?? DEFAULT_SERVICE_NAME,
    };
  }

  /**
   * Resolve the license key for QNSC MCP telemetry.
   *
   * Priority:
   * 1. NEW_RELIC_LICENSE_KEY_MCP env var (explicit manual override)
   * 2. Build-time bundled key (default for production)
   *
   * Note: We intentionally ignore the generic NEW_RELIC_LICENSE_KEY env var.
   * Users may have that set for their own New Relic APM agents; using it
   * here would silently redirect QNSC MCP telemetry to their account.
   */
  private resolveLicenseKey(): string | undefined {
    // Explicit MCP override takes priority (requires manual configuration)
    // Note: env.ts already strips unresolved ${user_config.*} placeholders
    if (env.NEW_RELIC_LICENSE_KEY_MCP) {
      return env.NEW_RELIC_LICENSE_KEY_MCP;
    }

    // Fall back to build-time bundled key
    return getEmbeddedGenericSecret('NEW_RELIC_LICENSE_KEY');
  }

  /**
   * Check if telemetry is enabled.
   *
   * Telemetry requires both conditions:
   * 1. User has not opted out via TELEMETRY=false
   * 2. A valid (non-empty) license key is available
   */
  isEnabled(): boolean {
    // Check opt-out flag first
    if (env.TELEMETRY === false) {
      return false;
    }
    return Boolean(this.config.licenseKey);
  }

  /**
   * Get the OTLP trace endpoint URL based on configuration
   */
  private getOtlpTraceEndpoint(): string {
    if (this.config.otlpEndpoint) {
      return this.config.otlpEndpoint;
    }
    return NR_OTLP_TRACE_ENDPOINTS[this.config.region || 'US'];
  }

  /**
   * Get the OTLP log endpoint URL based on configuration
   */
  private getOtlpLogEndpoint(): string {
    // Use the configured endpoint if provided, but adjust for logs
    if (this.config.otlpEndpoint) {
      // Replace /v1/traces with /v1/logs if the custom endpoint is for traces
      return this.config.otlpEndpoint.replace('/v1/traces', '/v1/logs');
    }
    return NR_OTLP_LOG_ENDPOINTS[this.config.region || 'US'];
  }

  /**
   * Initialize the OpenTelemetry tracer and logger providers.
   *
   * This method is idempotent - multiple calls are safe and only the first
   * successful call has any effect. This is guaranteed because:
   * 1. JavaScript is single-threaded for synchronous code
   * 2. This method is synchronous (no await points where another call could interleave)
   * 3. We set `initialized = true` before returning on success
   *
   * If initialization fails, subsequent calls will not retry to avoid log spam.
   * Create a new TelemetryService instance if retry is needed.
   */
  initialize(): void {
    // Guard: already initialized, previously failed, or telemetry disabled
    if (this.initialized || this.initializationFailed || !this.isEnabled()) {
      return;
    }

    try {
      const traceEndpoint = this.getOtlpTraceEndpoint();
      const logEndpoint = this.getOtlpLogEndpoint();
      const appVersion = this.config.appVersion;
      const serviceName = this.config.serviceName || DEFAULT_SERVICE_NAME;

      logDebug('Telemetry: initializing OpenTelemetry providers', {
        traceEndpoint,
        logEndpoint,
      });

      // Resolve user identifier for analytics correlation
      // Priority: MY_EMAIL env var > OS username
      // Guard against unresolved template placeholders: Claude Desktop injects
      // '${user_config.USERNAME}' when USERNAME isn't configured, and Bun's
      // os.userInfo() may cache that value before our strip function runs.
      const rawEmail = process.env.MY_EMAIL;
      const rawUsername = userInfo().username;
      const userId =
        (rawEmail && !isUnresolvedPlaceholder(rawEmail) ? rawEmail : null) ??
        (rawUsername && !isUnresolvedPlaceholder(rawUsername) ? rawUsername : null) ??
        'unknown';

      // Create shared resource for both trace and log providers
      this.resource = resourceFromAttributes({
        [ATTR_SERVICE_NAME]: serviceName,
        [ATTR_SERVICE_VERSION]: appVersion,
        // Use userId as service.instance.id so New Relic APM "Instances" view
        // groups by user rather than random UUIDs. Session-level correlation
        // is still available via the mcp.session.id span attribute.
        'service.instance.id': userId,
        // Privacy note: User identifier is included for aggregate usage analytics.
        // This enables tracking tool adoption across users without collecting
        // any tool arguments, results, or other potentially sensitive data.
        user: userId,
        'os.type': platform(),
        'os.version': release(),
      });

      // Initialize trace exporter
      const traceExporter = new OTLPTraceExporter({
        url: traceEndpoint,
        headers: {
          'api-key': this.config.licenseKey ?? '',
        },
      });

      this.provider = new NodeTracerProvider({
        resource: this.resource,
        spanProcessors: [
          new BatchSpanProcessor(traceExporter, {
            ...DEFAULT_BATCH_CONFIG,
            ...this.config.batchConfig,
          }),
        ],
      });

      this.provider.register();
      this.tracer = trace.getTracer(serviceName, appVersion);

      // Initialize log provider separately with its own error handling
      // This ensures trace telemetry still works even if log SDK fails to load
      try {
        // Load log SDK modules dynamically using require() for synchronous loading
        // This avoids loading these modules when telemetry is disabled.
        // The require results are typed via `typeof import(...)` so the SDK's
        // real types flow through instead of `any`.
        const { OTLPLogExporter } =
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require('@opentelemetry/exporter-logs-otlp-proto') as typeof import('@opentelemetry/exporter-logs-otlp-proto');
        const { LoggerProvider, BatchLogRecordProcessor } =
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require('@opentelemetry/sdk-logs') as typeof import('@opentelemetry/sdk-logs');

        const logExporter = new OTLPLogExporter({
          url: logEndpoint,
          headers: {
            'api-key': this.config.licenseKey ?? '',
          },
        });

        // Note: As of @opentelemetry/sdk-logs 0.209.0+, processors must be passed
        // in the constructor options rather than added via addLogRecordProcessor()
        this.loggerProvider = new LoggerProvider({
          resource: this.resource,
          processors: [
            new BatchLogRecordProcessor(logExporter, {
              maxQueueSize: DEFAULT_BATCH_CONFIG.maxQueueSize,
              maxExportBatchSize: DEFAULT_BATCH_CONFIG.maxExportBatchSize,
              scheduledDelayMillis: DEFAULT_BATCH_CONFIG.scheduledDelayMillis,
              exportTimeoutMillis: DEFAULT_BATCH_CONFIG.exportTimeoutMillis,
            }),
          ],
        });

        logDebug('Telemetry: log provider initialized');
      } catch (logError) {
        // Log SDK failed to initialize - trace telemetry will still work
        logDebug(
          'Telemetry: log provider initialization failed, logs will only be written to file',
          {
            error: logError instanceof Error ? logError.message : String(logError),
          },
        );
      }

      this.initialized = true;

      logDebug('Telemetry: initialized successfully');
    } catch (error) {
      this.initializationFailed = true;
      logError('Telemetry: failed to initialize', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Maximum byte length for error messages sent to telemetry.
   * Truncating helps prevent sensitive data leakage and keeps payloads reasonable.
   * 512 bytes allows for meaningful error context while limiting exposure.
   */
  private static readonly MAX_ERROR_MESSAGE_BYTES = 512;

  /**
   * Sanitize an error message for telemetry by truncating to a safe byte length.
   *
   * This method truncates based on UTF-8 byte length (not character count) to ensure
   * the output doesn't exceed downstream system limits. Multi-byte characters (emoji,
   * CJK, etc.) are handled correctly by encoding to bytes before truncation.
   *
   * This helps prevent accidentally sending sensitive data (e.g., API keys in URLs,
   * user data in error messages) to external telemetry systems.
   */
  private sanitizeErrorMessage(message: string): string {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(message);

    if (bytes.length <= TelemetryService.MAX_ERROR_MESSAGE_BYTES) {
      return message;
    }

    // Truncate at byte boundary, then decode back to string
    // TextDecoder with 'ignore' option handles incomplete multi-byte sequences
    const truncatedBytes = bytes.slice(0, TelemetryService.MAX_ERROR_MESSAGE_BYTES);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    return decoder.decode(truncatedBytes) + '...';
  }

  /**
   * Record a tool or prompt execution as a span.
   *
   * This method is synchronous - span creation and attribute setting happen
   * immediately. The actual export to New Relic occurs asynchronously in the
   * background via the BatchSpanProcessor, so callers don't need to await.
   */
  recordUsage(call: RegistryCall): void {
    if (!this.isEnabled()) {
      return;
    }

    // Ensure initialized before recording
    if (!this.initialized) {
      this.initialize();
    }

    if (!this.tracer) {
      logDebug('Telemetry: tracer not available, skipping span recording');
      return;
    }

    const spanName = `mcp.${call.itemType}.${call.itemId}`;

    try {
      // Use span.kind = SERVER (1) so spans appear in New Relic APM charts
      // (New Relic filters for span.kind = server OR consumer for throughput/response time)
      // SpanKind enum: INTERNAL=0, SERVER=1, CLIENT=2, PRODUCER=3, CONSUMER=4
      const span = this.tracer.startSpan(spanName, { kind: 1 /* SERVER */ });

      // Build the route for HTTP semantic conventions
      // Format: /mcp/{itemType}/{itemId} (e.g., /mcp/tool/listGithubIssues)
      const httpRoute = `/mcp/${call.itemType}/${call.itemId}`;

      // Increment request sequence for this call
      const currentRequestSequence = ++this.requestSequence;

      // Set common attributes
      // Note: Username and OS info are already set as resource attributes during initialization
      // (user contains email/username, os.type/os.version contain OS info)
      // App version is also a resource attribute (service.version), so no need to duplicate on spans
      // Build core span attributes
      const spanAttributes: Record<string, string | number> = {
        'mcp.item.type': call.itemType,
        'mcp.item.id': call.itemId,
        'mcp.execution.status': call.status ?? 'unknown',
        'mcp.execution.duration.ms': call.runTimeMs,
        'mcp.transport.type': this.config.transportType ?? 'unknown',

        // Session correlation attributes
        // These allow grouping and ordering events from the same MCP server session
        'mcp.session.id': this.sessionId,
        'mcp.session.request_sequence': currentRequestSequence,

        // HTTP semantic convention attributes for New Relic APM Transactions view
        // These make New Relic synthesize apm.service.transaction.duration metrics
        // and show MCP calls in the main APM UI (not just Span Legacy View)
        // See: https://docs.newrelic.com/docs/opentelemetry/get-started/apm-monitoring/opentelemetry-apm-ui/
        'http.request.method': 'POST',
        'http.route': httpRoute,
        'http.response.status_code': call.status === 'failure' ? 500 : 200,
      };

      // Resolve MCP client identity: prefer session-scoped (httpStream),
      // fall back to instance-level (stdio)
      let resolvedClientName = this.clientName;
      let resolvedClientVersion = this.clientVersion;
      if (call.sessionId) {
        const sessionClient = this.clientInfoMap.get(call.sessionId);
        if (sessionClient) {
          resolvedClientName = sessionClient.name;
          resolvedClientVersion = sessionClient.version;
        }
      }
      if (resolvedClientName) {
        spanAttributes['mcp.client.name'] = resolvedClientName;
      }
      if (resolvedClientVersion) {
        spanAttributes['mcp.client.version'] = resolvedClientVersion;
      }

      span.setAttributes(spanAttributes);

      // Add source for tools (first-party, second-party, third-party)
      if (call.source) {
        span.setAttribute('mcp.tool.source', call.source);
      }

      // Add category (e.g., 'Sonar', 'Utility', 'Web')
      if (call.category) {
        span.setAttribute('mcp.item.category', call.category);
      }

      // Add provider type (native, bundled, remote, local)
      if (call.provider) {
        span.setAttribute('mcp.tool.provider', call.provider);
      }

      // Add payload size (not the payload itself for privacy)
      if (call.payload) {
        span.setAttribute('mcp.payload.size', call.payload.length);
      }

      // Set span status based on execution result
      if (call.status === 'failure') {
        const sanitizedError = call.result
          ? this.sanitizeErrorMessage(call.result)
          : 'Unknown error';
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: sanitizedError,
        });

        // Include sanitized request payload on failures for debugging
        // This helps diagnose what input caused the failure
        if (call.payload) {
          const sanitizedPayload = sanitizeLogData(call.payload);
          span.setAttribute(
            'mcp.failure.request',
            typeof sanitizedPayload === 'string'
              ? sanitizedPayload
              : JSON.stringify(sanitizedPayload),
          );
        }
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }

      // End the span
      span.end();

      logDebug(`Telemetry: recorded span ${call.itemType}/${call.itemId}`);
    } catch (error) {
      logError('Telemetry: failed to record span', {
        error: error instanceof Error ? error.message : String(error),
        itemType: call.itemType,
        itemId: call.itemId,
      });
    }
  }

  /**
   * Record an update event as a span.
   *
   * This tracks self-update operations (qnsc-mcp update) to help diagnose
   * issues, especially on Windows where updates can fail due to file locks,
   * permissions, or antivirus interference.
   *
   * Privacy note: Only categorical data is sent. No file paths, usernames,
   * or error stack traces are included in the telemetry.
   *
   * @example
   * ```typescript
   * telemetryService.recordUpdateEvent({
   *   platform: 'win32',
   *   arch: 'x64',
   *   fromVersion: '2.0.0',
   *   toVersion: '2.1.0',
   *   outcome: 'failure',
   *   failureReason: 'file_locked',
   *   fileLockDetected: true,
   *   lockingProcess: 'VS Code'
   * });
   * ```
   */
  recordUpdateEvent(event: UpdateEvent): void {
    if (!this.isEnabled()) {
      return;
    }

    // Ensure initialized before recording
    if (!this.initialized) {
      this.initialize();
    }

    if (!this.tracer) {
      logDebug('Telemetry: tracer not available, skipping update event');
      return;
    }

    const spanName = 'qnsc-mcp.update';

    try {
      // Use span.kind = INTERNAL (0) for update events (internal operations, not user requests)
      // SpanKind enum: INTERNAL=0, SERVER=1, CLIENT=2, PRODUCER=3, CONSUMER=4
      const span = this.tracer.startSpan(spanName, { kind: 0 /* INTERNAL */ });

      // Set core attributes
      span.setAttributes({
        'update.platform': event.platform,
        'update.arch': event.arch,
        'update.from_version': event.fromVersion,
        'update.outcome': event.outcome,
      });

      // Optional attributes
      if (event.toVersion) {
        span.setAttribute('update.to_version', event.toVersion);
      }
      if (event.failureReason) {
        span.setAttribute('update.failure_reason', event.failureReason);
      }
      if (event.fileLockDetected !== undefined) {
        span.setAttribute('update.file_lock_detected', event.fileLockDetected);
      }
      if (event.lockingProcess) {
        span.setAttribute('update.locking_process', event.lockingProcess);
      }
      if (event.adminRequired !== undefined) {
        span.setAttribute('update.admin_required', event.adminRequired);
      }
      if (event.waitTimeSeconds !== undefined) {
        span.setAttribute('update.wait_time_seconds', event.waitTimeSeconds);
      }
      if (event.durationMs !== undefined) {
        span.setAttribute('update.duration_ms', event.durationMs);
      }
      if (event.fromMarkerFile !== undefined) {
        span.setAttribute('update.from_marker_file', event.fromMarkerFile);
      }

      // Set span status
      if (event.outcome === 'failure') {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: event.failureReason || 'Update failed',
        });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }

      span.end();

      logDebug(
        `Telemetry: recorded update event (outcome=${event.outcome}, platform=${event.platform})`,
      );
    } catch (error) {
      logError('Telemetry: failed to record update event', {
        error: error instanceof Error ? error.message : String(error),
        outcome: event.outcome,
      });
    }
  }

  /**
   * Record a log entry to New Relic Logs.
   *
   * This method is synchronous - log creation and attribute setting happen
   * immediately. The actual export to New Relic occurs asynchronously in the
   * background via the BatchLogRecordProcessor.
   *
   * Log data is sanitized before sending to remove sensitive information:
   * - API keys, tokens, secrets, passwords are redacted
   * - Data payloads are truncated to 1KB max
   *
   * @example
   * ```typescript
   * telemetryService.recordLog({
   *   level: 'ERROR',
   *   message: 'GitHub API request failed: 401 Unauthorized',
   *   data: { endpoint: '/repos/owner/name/issues' }
   * });
   * ```
   */
  recordLog(entry: LogEntry): void {
    if (!this.isEnabled()) {
      return;
    }

    // Ensure initialized before recording
    if (!this.initialized) {
      this.initialize();
    }

    if (!this.loggerProvider) {
      // Don't log here to avoid infinite recursion
      return;
    }

    try {
      const logger = this.loggerProvider.getLogger(
        this.config.serviceName || DEFAULT_SERVICE_NAME,
        this.config.appVersion,
      );

      // Sanitize the message and data before sending
      const sanitizedMessage = sanitizeLogMessage(entry.message);
      const sanitizedData = entry.data ? sanitizeLogData(entry.data) : undefined;

      logger.emit({
        severityNumber: LOG_LEVEL_TO_SEVERITY[entry.level],
        severityText: entry.level,
        body: sanitizedMessage,
        attributes: sanitizedData ? { 'log.data': sanitizedData } : undefined,
      });
    } catch {
      // Silently fail to avoid infinite recursion if logging fails
      // We can't call logError here as that would cause recursion
    }
  }

  /**
   * Flush any pending spans and logs, then shutdown the providers
   */
  async shutdown(): Promise<void> {
    const shutdownPromises: Promise<void>[] = [];

    if (this.provider) {
      shutdownPromises.push(
        (async () => {
          try {
            await this.provider!.shutdown();
          } catch (error) {
            logError('Telemetry: failed to shutdown trace provider', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })(),
      );
    }

    if (this.loggerProvider) {
      shutdownPromises.push(
        (async () => {
          try {
            await this.loggerProvider!.shutdown();
          } catch (error) {
            logError('Telemetry: failed to shutdown log provider', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })(),
      );
    }

    if (shutdownPromises.length > 0) {
      await Promise.all(shutdownPromises);
      logDebug('Telemetry: providers shut down successfully');
    }
  }

  /**
   * Force flush any pending spans and logs with a timeout.
   *
   * Uses FLUSH_TIMEOUT_MS to prevent blocking indefinitely if the telemetry
   * backend is unreachable. This is important for graceful shutdown scenarios.
   *
   * @param timeoutMs - Optional custom timeout (defaults to FLUSH_TIMEOUT_MS)
   */
  async flush(timeoutMs: number = FLUSH_TIMEOUT_MS): Promise<void> {
    const flushPromises: Promise<void>[] = [];

    if (this.provider) {
      flushPromises.push(
        (async () => {
          await this.provider!.forceFlush();
        })(),
      );
    }

    if (this.loggerProvider) {
      flushPromises.push(
        (async () => {
          await this.loggerProvider!.forceFlush();
        })(),
      );
    }

    if (flushPromises.length === 0) {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        Promise.all(flushPromises),
        new Promise<void>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Flush timeout')), timeoutMs);
        }),
      ]);
      logDebug('Telemetry: spans and logs flushed');
    } catch (error) {
      // Log but don't throw - flush failures shouldn't block shutdown
      logError('Telemetry: failed to flush telemetry', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      // Always clear the timeout to prevent timer leak
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Get the tracer instance.
   * @internal Exposed for testing purposes only. Do not use in production code.
   */
  getTracer(): Tracer | null {
    return this.tracer;
  }

  /**
   * Check if the service has been successfully initialized.
   * @internal Exposed for testing purposes only. Do not use in production code.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Reset the initialization failed flag to allow retry.
   * @internal Exposed for testing purposes only. Do not use in production code.
   */
  resetInitializationFailed(): void {
    this.initializationFailed = false;
  }

  /**
   * Get the session ID for this telemetry service instance.
   * @internal Exposed for testing purposes only. Do not use in production code.
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get the current request sequence counter value.
   * @internal Exposed for testing purposes only. Do not use in production code.
   */
  getRequestSequence(): number {
    return this.requestSequence;
  }

  /**
   * Set the MCP client identity from the protocol handshake.
   *
   * Called after the MCP `initialize` handshake completes, using the
   * `clientInfo` provided by the connecting client (e.g., Claude Desktop,
   * VS Code Copilot, Cursor). Once set, all subsequent telemetry spans
   * will include `mcp.client.name` and `mcp.client.version` attributes.
   */
  setClientInfo(name: string, version: string, sessionId?: string): void {
    // Always set instance-level as fallback (for stdio / single-session)
    this.clientName = name;
    this.clientVersion = version;
    // Store session-scoped entry for multi-session transports (httpStream)
    if (sessionId) {
      this.clientInfoMap.set(sessionId, { name, version });
    }
    logDebug(
      `Telemetry: client info set (name=${name}, version=${version}${sessionId ? `, session=${sessionId}` : ''})`,
    );
  }

  /**
   * Remove session-scoped client info when a transport session ends.
   * Prevents memory leaks in long-running httpStream servers.
   */
  removeClientInfo(sessionId: string): void {
    this.clientInfoMap.delete(sessionId);
    logDebug(`Telemetry: client info removed for session ${sessionId}`);
  }

  /**
   * Get the MCP client name set during the MCP handshake via `setClientInfo`.
   * Returns undefined before the handshake completes.
   */
  getClientName(): string | undefined {
    return this.clientName;
  }

  /**
   * Get the MCP client version.
   * @internal Exposed for testing purposes only. Do not use in production code.
   */
  getClientVersion(): string | undefined {
    return this.clientVersion;
  }
}

/**
 * Lazy singleton instance. Created on first access to ensure environment
 * variables are set before configuration is resolved.
 */
let _instance: TelemetryService | null = null;

/**
 * Get the singleton telemetry service instance.
 *
 * The instance is created lazily on first access, which ensures that
 * environment variables (like NEW_RELIC_LICENSE_KEY_MCP, TELEMETRY, etc.)
 * are already set when the configuration is resolved.
 *
 * @returns The singleton TelemetryService instance
 */
export function getTelemetryService(): TelemetryService {
  if (_instance === null) {
    _instance = new TelemetryService();
  }
  return _instance;
}

/**
 * Reset the singleton instance (for testing only).
 * @internal
 */
export function resetTelemetryService(): void {
  _instance = null;
}

/**
 * Default export provides the lazy singleton via a getter.
 * This ensures the instance is created on first property access, not at import time.
 */
export default {
  get instance(): TelemetryService {
    return getTelemetryService();
  },
  initialize: () => getTelemetryService().initialize(),
  recordUsage: (call: RegistryCall) => getTelemetryService().recordUsage(call),
  recordUpdateEvent: (event: UpdateEvent) => getTelemetryService().recordUpdateEvent(event),
  recordLog: (entry: LogEntry) => getTelemetryService().recordLog(entry),
  setClientInfo: (name: string, version: string, sessionId?: string) =>
    getTelemetryService().setClientInfo(name, version, sessionId),
  removeClientInfo: (sessionId: string) => getTelemetryService().removeClientInfo(sessionId),
  flush: (timeoutMs?: number) => getTelemetryService().flush(timeoutMs),
  shutdown: () => getTelemetryService().shutdown(),
  isEnabled: () => getTelemetryService().isEnabled(),
  isInitialized: () => getTelemetryService().isInitialized(),
  getTracer: () => getTelemetryService().getTracer(),
  getClientName: () => getTelemetryService().getClientName(),
};
