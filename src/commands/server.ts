import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig } from '../config';
import type { LocalMCPManager } from '../gateway/local-mcp-manager';
import type { RemoteMCPManager } from '../gateway/remote-mcp-manager';
import { applyRemotePolicy, fetchRemotePolicy, RemotePolicy } from '../gateway/remote-policy';
import { DOCUMENTATION_URLS, GUIDANCE, SUPPORT } from '../lib/guidance-links';
import { promptRegistry, registry } from '../registry';
import { resourceRegistry } from '../registry/resources';
import { logError, logInfo, logWarn } from '../services/logger';
import {
  DEFAULT_MCP_ENDPOINT,
  DEFAULT_MCP_HOST,
  ExpressStatefulMcpServer,
} from '../services/mcp/mcp-express';
import telemetryService from '../services/telemetry';
import { CLI_COMMANDS, ConfigValidator } from '../services/validation';
import { displayArchitectureMismatchWarning } from '../utils/architecture';
import { initializeBundledMCPs } from './bundled-mcp';
import { initializeLocalMCPs } from './local-mcp';
import { initializeRemoteMCPs } from './remote-mcp';

/** External YAML validation tool - only used in one place so not worth centralizing */
const YAML_VALIDATOR_URL = 'https://www.yamllint.com/';

/** Server metadata passed to McpServer constructor */
const MCP_SERVER_INFO = { name: 'QNSC MCP Server', version: '1.0.0' };

const VALID_TRANSPORTS = ['stdio', 'httpStream'] as const;
type TransportType = (typeof VALID_TRANSPORTS)[number];

/** Context passed to error category matchers */
type ErrorMatchContext = {
  msg: string; // lowercase error message
  stack: string; // lowercase stack trace
  errorName: string; // lowercase error name
};

/** Error category for rescue mode diagnostics */
type ErrorCategory = {
  name: string;
  matches: (ctx: ErrorMatchContext) => boolean;
  guidance: string[];
};

/**
 * Error categories for rescue mode diagnostics.
 * Each category has patterns to match and guidance to display.
 * Add new categories here to extend rescue mode diagnostics.
 *
 * Matching strategy: All categories are evaluated, and ALL matching categories
 * are displayed to the user. This is intentional - some errors may have multiple
 * root causes, and showing all relevant guidance helps users troubleshoot.
 * Categories are not mutually exclusive and have no priority ordering.
 */
const ERROR_CATEGORIES: ErrorCategory[] = [
  {
    name: 'Malformed Configuration File',
    matches: ({ msg, errorName }) =>
      msg.includes('yaml') ||
      (msg.includes('parse') && (msg.includes('config') || msg.includes('syntax'))) ||
      msg.includes('indentation') ||
      msg.includes('malformed') ||
      errorName === 'yamlexception',
    guidance: [
      'Your .qnscmcp.yaml file may have invalid YAML syntax.',
      '',
      'Common YAML syntax errors:',
      '  • Incorrect indentation (YAML requires consistent spacing)',
      '  • Using tabs instead of spaces',
      '  • Missing colons after keys',
      '  • Unquoted strings containing special characters (: # - etc.)',
      '  • Unclosed quotes or brackets',
      '',
      'To fix:',
      '  1. Find your config file:',
      '     - Current directory: ./.qnscmcp.yaml or ./.qnscmcp.yml',
      '     - Home directory: ~/.qnscmcp/config.yaml or ~/.qnscmcp/config.yml',
      '  2. Check the line mentioned in the error (if shown above)',
      `  3. Validate YAML syntax: ${YAML_VALIDATOR_URL}`,
      '  4. Or temporarily move the file: mv ~/.qnscmcp/config.yaml ~/.qnscmcp/config.yaml.backup',
      `  5. ${GUIDANCE.RESTART_IDE} to reload with fixed/default config`,
    ],
  },
  {
    name: 'Permission Error',
    matches: ({ msg }) =>
      msg.includes('permission') || msg.includes('eacces') || msg.includes('eperm'),
    guidance: [
      'The server cannot access required files or directories.',
      '',
      'To fix:',
      '  1. Check permissions on ~/.qnscmcp directory:',
      '     ls -la ~/.qnscmcp',
      '  2. Fix permissions if needed:',
      '     chmod -R 755 ~/.qnscmcp',
      '  3. Ensure you own the directory:',
      '     sudo chown -R $USER ~/.qnscmcp',
      `  4. ${GUIDANCE.RESTART_IDE} to reload the MCP server`,
    ],
  },
  {
    name: 'Missing File or Directory',
    matches: ({ msg }) => msg.includes('enoent') || msg.includes('no such file'),
    guidance: [
      'A required file or directory cannot be found.',
      '',
      'To fix:',
      '  1. If the error mentions a config file, create the parent directory:',
      '     mkdir -p ~/.qnscmcp',
      '  2. If the error mentions a tool or module, reinstall dependencies:',
      '     cd <mcp-tools-install-dir> && bun install',
      '  3. Check if config file paths in your .qnscmcp.yaml are correct',
      `  4. ${GUIDANCE.RESTART_IDE} to reload the MCP server`,
    ],
  },
  {
    name: 'Tool Loading Error',
    matches: ({ msg, stack }) =>
      msg.includes('cannot find module') ||
      msg.includes('failed to resolve') ||
      (msg.includes('module') && msg.includes('not found')) ||
      // Heuristic: detect CJS module loading failures via stack trace.
      // May not match ESM-only errors or future runtime changes, but provides
      // additive coverage - other patterns still work if this one doesn't match.
      stack.includes('require('),
    guidance: [
      'A tool or dependency failed to load during startup.',
      '',
      'To fix:',
      '  1. Reinstall dependencies:',
      '     cd <mcp-tools-install-dir>',
      '     bun install',
      "  2. Verify you're using the correct runtime version:",
      '     bun --version  (should be >= 1.0.0)',
      '  3. Check for corrupted files in the stack trace above',
      '  4. If issue persists, try reinstalling mcp-tools completely',
      `  5. ${GUIDANCE.RESTART_IDE} to reload the MCP server`,
    ],
  },
  {
    name: 'Environment Variable Error',
    matches: ({ msg }) =>
      msg.includes('qnsc_mcp_config') || (msg.includes('environment') && msg.includes('variable')),
    guidance: [
      'An environment variable has an invalid value or format.',
      '',
      'To fix:',
      '  1. Check QNSC_MCP_CONFIG__* environment variables in your shell:',
      '     printenv | grep QNSC_MCP_CONFIG',
      '  2. Verify environment variables in your .qnscmcp.yaml are valid',
      '  3. Temporarily unset problematic env vars to isolate:',
      '     unset QNSC_MCP_CONFIG__TOOLS__INCLUDE',
      '  4. Review env var format in documentation',
      `  5. ${GUIDANCE.RESTART_IDE} after fixing your environment`,
    ],
  },
  {
    name: 'Invalid Configuration Schema',
    matches: ({ msg }) =>
      msg.includes('unrecognized key') ||
      msg.includes('invalid configuration') ||
      (msg.includes('schema') && msg.includes('valid')),
    guidance: [
      'Your .qnscmcp.yaml has valid YAML syntax but invalid configuration values.',
      '',
      'To fix:',
      '  1. Check the error message for which field is invalid',
      '  2. Review configuration documentation:',
      `     ${DOCUMENTATION_URLS.CONFIGURATION}`,
      '  3. Common schema issues:',
      '     - Typos in field names (includeTools vs include)',
      '     - Wrong data types (string instead of array)',
      '     - Unknown tool/category names',
      '  4. Run CLI doctor for detailed validation:',
      `     ${CLI_COMMANDS.DOCTOR}`,
      `  5. ${GUIDANCE.RESTART_IDE} after fixing the config`,
    ],
  },
];

/** Guidance shown when no error category matches */
const UNKNOWN_ERROR_GUIDANCE = [
  'ISSUE: Unknown Startup Error',
  "The error doesn't match common patterns.\n",
  'To fix:',
  '  1. Review the error details and stack trace above',
  '  2. Try starting with a minimal config (temporarily move your config aside):',
  '     mv ~/.qnscmcp/config.yaml ~/.qnscmcp/config.yaml.backup',
  '  3. Check system resources:',
  '     - Available disk space: df -h',
  '     - Available memory: free -h (Linux) or vm_stat (macOS)',
  '  4. Check for conflicting processes on the same port',
  '  5. Review recent changes to your config or environment',
];

/**
 * Normalize any thrown value into a proper Error instance.
 */
function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error, { cause: error });
  return new Error(`Non-Error thrown: ${JSON.stringify(error)}`, {
    cause: error,
  });
}

/**
 * Register the startup-diagnostics rescue tool on a server.
 */
function registerRescueTool(server: McpServer, error: Error): void {
  server.registerTool(
    'startup-diagnostics',
    {
      description:
        'View detailed diagnostic information about why the MCP server failed to start. This tool is only available when the server is running in rescue mode due to a startup failure. Call this immediately to understand what went wrong and how to fix it.',
      inputSchema: z.object({}),
      annotations: {
        title: '🚑 Startup Diagnostics (Rescue Mode)',
        readOnlyHint: true,
      },
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- implements a Promise-returning interface; async is required by the contract even without an await
    async () => ({
      content: [{ type: 'text' as const, text: formatStartupError(error) }],
    }),
  );
}

/**
 * Record rescue mode telemetry (best-effort, never throws).
 */
function reportRescueModeTelemetry(error: Error): void {
  try {
    telemetryService.recordUsage({
      itemId: 'rescue-mode',
      itemType: 'tool',
      payload: JSON.stringify({ errorName: error.name }),
      runTimeMs: 0,
      status: 'failure',
      result: error.message.slice(0, 500),
    });
  } catch {
    // Silently ignore telemetry errors - rescue mode must proceed
  }
}

/**
 * Validate transport configuration. Throws on invalid config.
 */
function validateTransportConfig(
  transportType: string,
  endpoint: string,
  host: string = DEFAULT_MCP_HOST,
): void {
  if (!VALID_TRANSPORTS.includes(transportType as (typeof VALID_TRANSPORTS)[number])) {
    throw new Error(
      `Invalid transport type: "${transportType}". Valid types: ${VALID_TRANSPORTS.join(', ')}`,
    );
  }
  if (transportType === 'httpStream' && endpoint && !endpoint.startsWith('/')) {
    throw new Error(`Invalid endpoint "${endpoint}": must start with /. Example: /mcp`);
  }
  if (transportType === 'httpStream' && !host.trim()) {
    throw new Error(`Invalid host "${host}": must not be empty. Example: ${DEFAULT_MCP_HOST}`);
  }
}

/**
 * Create a server factory for normal operation.
 * Registers all tools, prompts, and resources.
 * Falls back to rescue mode internally if registration fails.
 */
function createServerFactory(): () => Promise<McpServer> {
  return async () => {
    const server = new McpServer(MCP_SERVER_INFO);
    try {
      registry.registerAllTools(server);
      await promptRegistry.registerAllPrompts(server);
      resourceRegistry.registerAllResources(server);
    } catch (error) {
      const err = normalizeError(error);
      logError('❌ Tool/prompt/resource registration failed. Entering rescue mode...');
      logError(`Error: ${err.message}`);
      registerRescueTool(server, err);
      reportRescueModeTelemetry(err);
    }

    // Capture MCP client identity after protocol handshake completes.
    // The client sends its name/version during initialize, and the SDK
    // stores it on the Server instance. We forward it to telemetry so
    // all subsequent spans include mcp.client.name and mcp.client.version.
    server.server.oninitialized = () => {
      const clientInfo = server.server.getClientVersion();
      if (clientInfo) {
        // Get transport session ID for multi-session scoping (httpStream).
        // StdioServerTransport has no sessionId; StreamableHTTPServerTransport does.
        const transport = server.server.transport;
        const sessionId =
          transport && 'sessionId' in transport
            ? (transport as { sessionId?: string }).sessionId
            : undefined;
        telemetryService.setClientInfo(clientInfo.name, clientInfo.version, sessionId);
        logInfo(`MCP client connected: ${clientInfo.name} v${clientInfo.version}`);
      }
    };

    return server;
  };
}

/**
 * Create a server factory for rescue mode.
 * Only registers the startup diagnostics tool.
 */
function createRescueServerFactory(startupError: Error): () => Promise<McpServer> {
  // eslint-disable-next-line @typescript-eslint/require-await -- implements a Promise-returning interface; async is required by the contract even without an await
  return async () => {
    const server = new McpServer(MCP_SERVER_INFO);
    registerRescueTool(server, startupError);
    return server;
  };
}

/**
 * Start the MCP server with specified transport configuration
 */
export async function startServer(
  transportType: TransportType = 'stdio',
  endpoint: string = DEFAULT_MCP_ENDPOINT,
  port: number = 8081,
  host: string = DEFAULT_MCP_HOST,
): Promise<void> {
  let startupError: Error | null = null;
  let remoteMCPManager: RemoteMCPManager | null = null;
  let localMCPManager: LocalMCPManager | null = null;

  // Initialize telemetry before try block so we can report rescue mode events
  // Wrapped in try/catch - telemetry failure should never prevent server startup
  try {
    telemetryService.initialize();
  } catch (telemetryError) {
    logWarn(
      `Telemetry initialization failed (non-fatal): ${telemetryError instanceof Error ? telemetryError.message : String(telemetryError)}`,
    );
  }

  try {
    // === NORMAL STARTUP PATH ===

    // Validate transport configuration early - invalid config triggers rescue mode
    validateTransportConfig(transportType, endpoint, host);

    // Display architecture mismatch warning early if applicable
    displayArchitectureMismatchWarning();

    // Load configuration
    const config = loadConfig();

    // Warn if both include and includeCategories are configured
    if (
      config.tools?.include &&
      config.tools.include.length > 0 &&
      config.tools?.includeCategories &&
      config.tools.includeCategories.length > 0
    ) {
      logInfo(
        `⚠️  Note: Both 'include' and 'includeCategories' are configured. Tools matching either condition will be included (union/OR logic).`,
      );
    }

    // Initialize the registries (auto-discover tools, prompts, resources)
    await registry.initialize();
    await promptRegistry.initialize();
    await resourceRegistry.initialize();

    // !!! IMPORTANT !!!
    // Initialize bundled MCPs BEFORE validation - extraction must populate
    // the cache directory before validation checks it for known MCP names.
    await initializeBundledMCPs(registry);

    // Run lightweight config validation and log warnings
    await runStartupValidation();

    // Fetch the remote routing policy once, before initializing remote MCPs,
    // so the same policy object can drive both host resolution (which URL a
    // server connects to, applied inside initializeRemoteMCPs) and local-tool
    // suppression (applyRemotePolicy, after connections are established)
    // without a second network call. fetchRemotePolicy() catches every error
    // internally and resolves to EMPTY_POLICY — no try-catch needed here.
    const remotePolicy: RemotePolicy = await fetchRemotePolicy();

    remoteMCPManager = await initializeRemoteMCPs(config, registry, remotePolicy);

    // Apply remote routing policy: suppress local tool categories where
    // a remote server is preferred and successfully connected. Reuses the
    // remotePolicy fetched above — no second fetch.
    // Must run AFTER initializeRemoteMCPs (need connection status)
    // and BEFORE registerAllTools (which applies excludeCategories).
    // Note: clientHint comes from telemetry's MCP handshake capture (PR #976).
    // At startup it may be undefined (handshake hasn't fired yet). Policies
    // with a clients filter will not apply until the client is identified.
    // TODO: Post-handshake re-evaluation (#978 follow-up)
    if (remoteMCPManager) {
      try {
        let clientHint: string | undefined;
        try {
          clientHint = telemetryService.getClientName();
        } catch (e) {
          logInfo(`[remote-policy] Could not get client name: ${e}`);
        }
        if (!clientHint) {
          logWarn(
            '[remote-policy] Client name unavailable at startup — policies with a "clients" filter will not apply until post-handshake re-evaluation is implemented',
          );
        }
        // eslint-disable-next-line @typescript-eslint/await-thenable -- await preserved for consistent async error-flow semantics
        await applyRemotePolicy(config, remoteMCPManager, registry, remotePolicy, clientHint);
      } catch (policyError) {
        logError(
          `[remote-policy] Failed to apply remote policy, continuing with all local tools: ${policyError}`,
        );
      }
    }

    localMCPManager = await initializeLocalMCPs(config, registry);
  } catch (error) {
    // === RESCUE MODE PATH ===
    startupError = normalizeError(error);
    logError('❌ MCP server startup failed. Entering rescue mode...');
    logError(`Error: ${startupError.message}`);
    reportRescueModeTelemetry(startupError);
  }

  // === START SERVER (works in both normal and rescue mode) ===
  const rescueMode = startupError !== null;
  const serverFactory = rescueMode
    ? createRescueServerFactory(startupError!)
    : createServerFactory();

  if (rescueMode) {
    logInfo('🚑 Starting MCP server in RESCUE MODE (limited functionality)');
    logWarn('   Only startup-diagnostics tool available until issues are resolved');
  } else {
    logInfo(`🚀 Starting MCP ${transportType} server`);
  }

  // Helper to flush and shutdown telemetry (best-effort, non-fatal)
  const shutdownTelemetry = async () => {
    try {
      await telemetryService.flush();
      await telemetryService.shutdown();
    } catch (telemetryError) {
      logWarn(
        `Telemetry shutdown failed (non-fatal): ${telemetryError instanceof Error ? telemetryError.message : String(telemetryError)}`,
      );
    }
  };

  let expressMCP: ExpressStatefulMcpServer | null = null;

  // In rescue mode, always fall back to stdio regardless of configured transport
  const effectiveTransport = rescueMode ? 'stdio' : transportType;

  if (effectiveTransport === 'stdio') {
    const transport = new StdioServerTransport();
    const server = await serverFactory();
    await server.connect(transport);
  } else if (effectiveTransport === 'httpStream') {
    expressMCP = new ExpressStatefulMcpServer(serverFactory, {
      port,
      host,
      endpoint,
    });
  }

  // Handle cleanup on exit
  let cleanupRan = false;
  const cleanup = async () => {
    if (cleanupRan) return;
    cleanupRan = true;

    if (rescueMode) {
      logInfo('Shutting down rescue mode server...');
      await shutdownTelemetry();
    } else {
      logInfo('Shutting down MCP server...');
      await shutdownTelemetry();

      if (remoteMCPManager) {
        try {
          await remoteMCPManager.disconnect();
        } catch (err) {
          logWarn(
            `Remote MCP disconnect failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      if (localMCPManager) {
        try {
          await localMCPManager.disconnect();
        } catch (err) {
          logWarn(
            `Local MCP disconnect failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
    if (expressMCP) {
      try {
        await expressMCP.shutdown();
      } catch (err) {
        logWarn(
          `Express MCP server shutdown failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    process.exit(0);
  };

  process
    .on('SIGINT', cleanup)
    .on('SIGQUIT', cleanup)
    .on('SIGTERM', cleanup)
    // beforeExit allows async cleanup before the event loop empties
    // (unlike 'exit' which is sync-only)
    .on('beforeExit', cleanup);

  try {
    if (expressMCP) {
      expressMCP.start();
    }
  } catch (error) {
    // Transport-level failure - can't do rescue mode since server won't start
    const err = error instanceof Error ? error : new Error(String(error));
    logError('❌ MCP server failed to start (transport error)');
    logError(`Error: ${err.message}`);
    logError('');
    logError('This is a transport-level failure - the server cannot start at all.');
    logError('Common causes:');
    logError('  • Port already in use (for httpStream transport)');
    logError('  • Permission denied on port');
    logError('  • Invalid transport configuration');
    logError('');
    logError(`Try: ${CLI_COMMANDS.DOCTOR}`);
    process.exit(1);
  }
}

/**
 * Format a startup error with diagnostics and actionable solutions
 */
export function formatStartupError(error: Error): string {
  const lines: string[] = [];

  lines.push('🚑 MCP Server Rescue Mode - Startup Failure Diagnostics\n');
  lines.push('═'.repeat(70));
  lines.push(
    '\nThe MCP server failed to start normally and is running with limited functionality.',
  );
  lines.push('Only this diagnostic tool is available until the startup issue is resolved.\n');

  lines.push('═'.repeat(70));
  lines.push('\n❌ ERROR DETAILS:\n');
  lines.push(`Error Type: ${error.name}`);
  lines.push(`Message: ${error.message}\n`);

  if (error.stack) {
    lines.push('Stack Trace:');
    // Limit stack trace to first 20 lines to balance diagnostic value with readability
    const allStackLines = error.stack.split('\n');
    const stackLines = allStackLines.slice(0, 20);
    lines.push(stackLines.join('\n'));
    if (allStackLines.length > 20) {
      lines.push('... (truncated - check ~/.qnscmcp/logs/ for full stack trace)');
    }
    lines.push('');
  }

  lines.push('═'.repeat(70));
  lines.push('\n💡 DIAGNOSIS AND SOLUTIONS:\n');

  // Build context for error category matching
  const ctx: ErrorMatchContext = {
    msg: error.message.toLowerCase(),
    stack: (error.stack || '').toLowerCase(),
    errorName: error.name.toLowerCase(),
  };

  // Find all matching categories
  const matches = ERROR_CATEGORIES.filter((cat) => cat.matches(ctx));

  if (matches.length === 0) {
    // No matches - show generic guidance
    UNKNOWN_ERROR_GUIDANCE.forEach((line) => lines.push(line));
  } else if (matches.length === 1) {
    // Single match - show that category
    lines.push(`ISSUE: ${matches[0].name}`);
    matches[0].guidance.forEach((line) => lines.push(line));
  } else {
    // Multiple matches - show all possibilities
    lines.push(`POSSIBLE CAUSES (${matches.length} detected):\n`);
    matches.forEach((match, i) => {
      lines.push(`━━━ ${i + 1}. ${match.name} ━━━`);
      match.guidance.forEach((line) => lines.push(line));
      if (i < matches.length - 1) lines.push('');
    });
  }

  lines.push('\n═'.repeat(70));
  lines.push('\n📚 ADDITIONAL HELP:\n');
  lines.push(`• Run CLI diagnostics: ${CLI_COMMANDS.DOCTOR}`);
  lines.push(`• Configuration guide: ${DOCUMENTATION_URLS.CONFIGURATION}`);
  lines.push(`• Troubleshooting: ${DOCUMENTATION_URLS.TROUBLESHOOTING}`);
  lines.push(`• Ask a question: ${SUPPORT.DISCUSSIONS}`);
  lines.push(`• GitHub Issues: ${DOCUMENTATION_URLS.GITHUB_ISSUES}`);

  lines.push('\n💡 TIP: After fixing the issue, restart your IDE to reload the MCP server.');

  return lines.join('\n');
}

/**
 * Run lightweight config validation on startup and log warnings.
 * This validates the QNSC-MCP config (.qnscmcp.yaml) to catch common issues
 * like invalid tool references, missing env vars, etc.
 *
 * Warnings are logged but don't block server startup.
 */
async function runStartupValidation(): Promise<void> {
  try {
    const result = await ConfigValidator.validateQnscMcpConfig();

    // Log warnings and errors (but don't block startup)
    const issues = result.issues.filter((i) => i.severity === 'warning' || i.severity === 'error');

    if (issues.length > 0) {
      logWarn(`⚠️  Configuration issues detected (run "${CLI_COMMANDS.DOCTOR}" for details):`);
      for (const issue of issues) {
        const prefix = issue.severity === 'error' ? '❌' : '⚠️';
        logWarn(`   ${prefix} ${issue.message}`);
      }
      logWarn('');
      logWarn(`   📚 Config guide: ${DOCUMENTATION_URLS.CONFIGURATION}`);
      logWarn(
        `   💬 Need help? Open an issue at ${SUPPORT.ISSUES} with the output of "${CLI_COMMANDS.DOCTOR}"`,
      );
    }
  } catch (error) {
    // Don't let validation errors crash server startup
    logWarn(`Config validation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
