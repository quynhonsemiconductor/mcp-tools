import { z } from 'zod';

/** src/tools/k6 env vars (Grafana k6 Cloud) */
export const k6EnvSchema = z.object({
  GRAFANA_K6_TOKEN: z.string().optional().describe('Grafana k6 Cloud API token'),
  GRAFANA_K6_BASE_URL: z
    .string()
    .url()
    .optional()
    .describe('Grafana k6 Cloud API base URL')
    .default('https://api.k6.io'),
  GRAFANA_K6_STACK_ID: z
    .string()
    .optional()
    .describe('Grafana k6 Cloud Stack ID (required for v5/v6 API)'),
  GRAFANA_K6_ORG_ID: z.string().optional().describe('Grafana k6 Cloud Organization ID'),
});
