import dbService from '../../services/db/index';
import { RegistryCall } from '../../services/db/types';
import { logDebug, logError } from '../../services/logger';
import telemetryService from '../../services/telemetry';
import { getAppVersion } from '../../utils';
import {
  GenericMiddleware,
  RegistryItemConfig,
  RegistryItemContext,
  getConfigFromContext,
} from './types';

/**
 * Safely record a registry item call by executing both local database storage
 * and OpenTelemetry telemetry export.
 *
 * - Telemetry: recordUsage() is synchronous (span creation is immediate),
 *   but the actual network export happens asynchronously in the background
 *   via the BatchSpanProcessor.
 * - Database: Recording is awaited to ensure persistence before returning.
 */
async function safeRecordCall(call: RegistryCall): Promise<void> {
  // Record telemetry (span creation is sync, export is async in background)
  safeRecordCallTelemetry(call);

  // Record to local database (awaited for persistence)
  await safeRecordCallLocal(call);
}

/**
 * Safely record a call to the local database, catching any database errors
 * to prevent them from affecting execution
 */
async function safeRecordCallLocal(call: RegistryCall): Promise<void> {
  logDebug(`Recording ${call.itemType} call for ${call.itemId}`);

  try {
    // Use the new recordRegistryCall method that handles both tools and prompts
    await dbService.recordRegistryCall(call);
  } catch (error) {
    // Log error but don't let it affect execution
    logError('Failed to record registry call to local database', {
      error: error instanceof Error ? error.message : String(error),
      itemType: call.itemType,
      itemId: call.itemId,
    });
  }
}

/**
 * Safely record telemetry via OpenTelemetry, catching any errors
 * to prevent them from affecting execution.
 *
 * Note: telemetryService.recordUsage() is synchronous - spans are created
 * immediately but exported asynchronously by the BatchSpanProcessor.
 */
function safeRecordCallTelemetry(call: RegistryCall): void {
  logDebug(`Recording ${call.itemType} telemetry for ${call.itemId}`);

  try {
    telemetryService.recordUsage(call);
  } catch (error) {
    // Log error but don't let it affect execution
    logError('Failed to record telemetry span', {
      error: error instanceof Error ? error.message : String(error),
      itemType: call.itemType,
      itemId: call.itemId,
    });
  }
}

/**
 * Builds a RegistryCall record shared by the success and failure paths below.
 */
function buildCallRecord(
  context: RegistryItemContext,
  config: RegistryItemConfig,
  itemType: 'tool' | 'prompt',
  payload: string,
  runTimeMs: number,
  appVersion: string,
  status: 'success' | 'failure',
  result: string,
): RegistryCall {
  return {
    itemId: context.id,
    itemType,
    payload,
    runTimeMs,
    status,
    result,
    source: context.source,
    category: config.category,
    provider: config.provider,
    appVersion,
    sessionId: context.ctx?.sessionId,
  };
}

/**
 * Creates a middleware for tracking registry item executions (tools or prompts)
 * This middleware will only track items that have tracking enabled in their config
 *
 * @template T - Type of context (must extend RegistryItemContext)
 * @template R - Return type from the middleware chain
 * @returns A middleware function that records execution metrics
 */
export function createTrackingMiddleware<
  T extends RegistryItemContext,
  R = unknown,
>(): GenericMiddleware<T, R> {
  // Cache app version at factory creation time - it doesn't change during runtime
  const appVersion = getAppVersion();

  return async (context: T, next: (context: T) => Promise<R>): Promise<R> => {
    // Get the config using the utility function
    const config = getConfigFromContext(context);
    const payload = JSON.stringify(context.args || {});

    // Determine if this is a tool or prompt
    const itemType = 'toolId' in context ? 'tool' : 'prompt';

    // Record start time
    const startTime = performance.now();

    try {
      // Execute the next middleware in the chain
      const result = await next(context);

      // Record end time and calculate duration
      const endTime = performance.now();
      const runTimeMs = Math.round(endTime - startTime);

      // MCP tools can return a non-thrown failure via { isError: true }
      // (e.g., gateway-routed bundled/remote MCPs that catch errors internally
      // and surface them as tool responses). Treat those as failures so NR
      // telemetry matches reality.
      const isMcpErrorResult =
        typeof result === 'object' &&
        result !== null &&
        (result as { isError?: unknown }).isError === true;

      await safeRecordCall(
        buildCallRecord(
          context,
          config,
          itemType,
          payload,
          runTimeMs,
          appVersion,
          isMcpErrorResult ? 'failure' : 'success',
          JSON.stringify(result),
        ),
      );

      // Return the original result
      return result;
    } catch (error) {
      // Record end time and calculate duration even if there's an error
      const endTime = performance.now();
      const runTimeMs = Math.round(endTime - startTime);

      await safeRecordCall(
        buildCallRecord(
          context,
          config,
          itemType,
          payload,
          runTimeMs,
          appVersion,
          'failure',
          error instanceof Error ? error.message : String(error),
        ),
      );

      // Re-throw the error
      throw error;
    }
  };
}
