import { z } from 'zod';

/**
 * Core, cross-cutting env vars — not owned by any single tool category.
 */
export const coreEnvSchema = z.object({
  // Telemetry opt-out
  TELEMETRY: z.coerce
    .boolean()
    .default(true)
    .describe('Enable telemetry (set to "false" to disable)'),

  // Kong Konnect (remote MCP authentication)

  // QNSC MCP API (used by memory, search, and vectordb tools)
  // No default — the upstream API isn't reachable from QNSC. Set to
  // QNSC's own embeddings API once one exists.
  QNSC_MCP_API_BASE_URL: z.string().url().optional().describe('QNSC MCP Server API base URL'),
  QNSC_MCP_API_KEY: z.string().optional().describe('QNSC MCP Server API key'),

  // MCP Server
  TRANSPORT_TYPE: z
    .enum(['stdio', 'httpStream'])
    .optional()
    .default('stdio')
    .describe('MCP server transport type'),
});
