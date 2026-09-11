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

  // SharePoint — read by the bundled sharepoint MCP, not by this codebase, which is
  // why they look unreferenced here. Removing them would break its 56 tools.
  AZURE_APPLICATION_ID: z.string().optional().describe('Azure Application ID'),
  AZURE_APPLICATION_CERTIFICATE_THUMBPRINT: z
    .string()
    .optional()
    .describe('Azure Application Certificate Thumbprint'),
  AZURE_APPLICATION_CERTIFICATE_PASSWORD: z
    .string()
    .optional()
    .describe('Azure Application Certificate Password'),
  M365_TENANT_ID: z.string().optional().describe('M365 Tenant ID'),
});
