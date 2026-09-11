import { z } from 'zod';
import { NewRelicRegions } from '../constants';

/** Internal telemetry export to New Relic — not a user-facing tool integration. */
export const newRelicEnvSchema = z.object({
  NEW_RELIC_REGION: z
    .enum(NewRelicRegions)
    .optional()
    .default('US')
    .describe('New Relic region (US, EU, EU2)')
    .brand('mcpb-exclude'),

  NEW_RELIC_LICENSE_KEY_MCP: z
    .string()
    .optional()
    .describe('Optional override for the New Relic license key used by QNSC MCP internal telemetry')
    .brand('mcpb-exclude'),
  NEW_RELIC_OTLP_ENDPOINT: z
    .string()
    .optional()
    .describe(
      'New Relic OTLP endpoint (defaults based on region: US=otlp.nr-data.net, EU=otlp.eu01.nr-data.net, EU2=otlp.eu02.nr-data.net)',
    )
    .brand('mcpb-exclude'),
});
