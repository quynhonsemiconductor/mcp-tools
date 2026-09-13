import { z } from 'zod';

/**
 * Credentials for integrations that are not plain local tools.
 *
 * Every variable here is surfaced to users at install time: the build generates a
 * `user_config` prompt per declared var into the Claude Desktop bundle manifest (see
 * scripts/generate-tool-loader.js, which scans this directory). So a variable left
 * here after its integration is gone becomes a prompt asking someone to configure
 * something that cannot work. Ten were removed on that basis along with the
 * gateway-routed remote servers they belonged to: PagerDuty, Slack, Postman, Stripe,
 * Bitrise, Atlassian and Cortex.
 */
export const remoteMcpCredentialsEnvSchema = z.object({
  // SwaggerHub — 2 native tools
  SWAGGER_HUB_API_KEY: z.string().optional().describe('Swagger Hub API Key'),
});
