/**
 * Service re-authentication MCP tool (T026).
 *
 * Provides users with a self-service mechanism to force re-authentication
 * for a named service. Routes to the correct auth provider based on the
 * service name (e.g. "Platform" → Entra ID SSO).
 * Exposed as an MCP tool per FR-023.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../../registry';
import { CatchErrors } from '../../utils';

/**
 * Authentication providers the reauth tool can delegate to.
 */
export type AuthProvider = 'entra';

/**
 * Maps user-facing service names (lower-cased) to the authentication
 * provider that backs them.  Extend this map when onboarding new services.
 */
export const SERVICE_TO_PROVIDER: Record<string, AuthProvider> = {
  platform: 'entra',
  entra: 'entra',
};

/**
 * Providers that are actually implemented today.
 * Add entries here as new provider support is shipped.
 */
export const SUPPORTED_PROVIDERS = new Set<AuthProvider>(['entra']);

/**
 * Human-readable labels for each provider (used in response messages).
 */
const PROVIDER_LABELS: Record<AuthProvider, string> = {
  entra: 'Entra ID SSO',
};

export const ReauthSchema = z.object({
  service: z
    .string()
    .describe(
      'The service to re-authenticate with (e.g. "Platform"). Case-insensitive.',
    ),
});
export type ReauthParams = z.infer<typeof ReauthSchema>;

@Tool({
  id: 'reauth',
  name: 'reauth',
  description:
    'Force re-authentication for a given service. Clears stored tokens and triggers a fresh login flow. ' +
    'Currently supports Platform / Entra ID services. ' +
    'Use when troubleshooting auth issues, switching accounts, or recovering from token errors.',
  category: 'Utility',
  parameters: ReauthSchema,
  version: '1.0.0',
  annotations: {
    title: 'Re-authenticate Service',
    destructiveHint: true,
    readOnlyHint: false,
  },
})
export class ReauthTool implements ToolHandler {
  /**
   * Resolve a user-supplied service name to an auth provider and execute
   * re-authentication against it.
   *
   * @param args - Contains the service name to re-authenticate
   * @returns JSON result with success status, provider info, and timing
   */
  @CatchErrors()
  async execute(args: ReauthParams): Promise<string> {
    const normalised = args.service.trim().toLowerCase();

    const provider = SERVICE_TO_PROVIDER[normalised];
    if (!provider) {
      const known = [...new Set(Object.keys(SERVICE_TO_PROVIDER))].join(', ');
      return JSON.stringify({
        success: false,
        message: `Unknown service "${args.service}". Known services: ${known}`,
      });
    }

    if (!SUPPORTED_PROVIDERS.has(provider)) {
      return JSON.stringify({
        success: false,
        message: `Re-authentication for "${args.service}" (${PROVIDER_LABELS[provider]}) is not yet supported. Currently only Platform / Entra ID services are supported.`,
      });
    }

    const startTime = Date.now();
    const token = await this.reauthProvider(provider);
    const elapsedMs = Date.now() - startTime;

    return JSON.stringify({
      success: true,
      message: `Re-authentication successful via ${PROVIDER_LABELS[provider]}. Stored tokens have been cleared and a fresh login was completed.`,
      provider: PROVIDER_LABELS[provider],
      service: args.service,
      elapsedMs,
      tokenAcquired: !!token,
    });
  }

  /**
   * Dispatch re-authentication to the appropriate provider.
   *
   * @param provider - The resolved auth provider key
   * @returns The new access token
   */
  protected async reauthProvider(provider: AuthProvider): Promise<string> {
    switch (provider) {
      case 'entra': {
        const { reauthenticate } = await import('../../services/auth/entra-id');
        return reauthenticate();
      }
      // Future providers will be added here:
      default:
        throw new Error(`No re-authentication handler for provider "${provider}"`);
    }
  }
}
