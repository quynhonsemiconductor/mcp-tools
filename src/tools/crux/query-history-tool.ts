import { z } from 'zod';
import { CatchErrors, UserError } from '../../utils';
import { Tool, ToolHandler } from '../registry';
import { queryHistoryRecord } from './api';
import { ALL_CRUX_FORM_FACTORS, ALL_CRUX_METRIC_NAMES } from './types';
import type { CrUXMetricName } from './types';

export const QueryCruxHistorySchema = z.object({
  origin: z
    .string()
    .url()
    .optional()
    .describe(
      'The origin to query (e.g. https://example.com). Provide either origin or url, not both.',
    ),
  url: z
    .string()
    .url()
    .optional()
    .describe('A specific page URL to query. Provide either origin or url, not both.'),
  formFactor: z
    .enum(ALL_CRUX_FORM_FACTORS)
    .optional()
    .describe(
      'Filter by device class: PHONE, TABLET, or DESKTOP. Omit to aggregate across all devices.',
    ),
  metrics: z
    .array(z.enum(ALL_CRUX_METRIC_NAMES))
    .optional()
    .describe('Specific metrics to retrieve. Omit to get all available metrics.'),
  collectionPeriodCount: z
    .number()
    .int()
    .min(1)
    .max(40)
    .optional()
    .describe(
      'Number of weekly collection periods to return (1–40, default 25). Each period covers a 28-day rolling window. The History API covers approximately the past 40 weeks.',
    ),
});

export type QueryCruxHistoryParams = z.infer<typeof QueryCruxHistorySchema>;

@Tool({
  id: 'crux-query-history',
  name: 'queryCruxHistory',
  description:
    'Query historical Core Web Vitals trends from the Google Chrome UX Report (CrUX) History API for an origin or URL. Returns up to 40 weeks of weekly timeseries data, enabling trend analysis and regression detection. Each data point in the timeseries represents a 28-day rolling average for that week. Use this to track how performance has changed over time.',
  category: 'CrUX',
  parameters: QueryCruxHistorySchema,
  version: '1.0.0',
  envVars: ['GOOGLE_CRUX_API_KEY'],
  annotations: {
    title: 'Query CrUX History',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class QueryCruxHistoryTool implements ToolHandler {
  @CatchErrors()
  async execute(args: QueryCruxHistoryParams): Promise<string> {
    if (!args.origin && !args.url) {
      throw new UserError('Either "origin" or "url" must be provided.');
    }
    if (args.origin && args.url) {
      throw new UserError('Provide either "origin" or "url", not both.');
    }

    const record = await queryHistoryRecord({
      origin: args.origin,
      url: args.url,
      formFactor: args.formFactor,
      metrics: args.metrics as CrUXMetricName[] | undefined,
      collectionPeriodCount: args.collectionPeriodCount,
    });

    return JSON.stringify(record, null, 2);
  }
}
