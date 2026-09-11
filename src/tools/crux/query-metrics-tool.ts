import { z } from 'zod';
import { CatchErrors, UserError } from '../../utils';
import { Tool, ToolHandler } from '../registry';
import { queryRecord } from './api';
import { ALL_CRUX_FORM_FACTORS, ALL_CRUX_METRIC_NAMES } from './types';
import type { CrUXMetricName } from './types';

export const QueryCruxMetricsSchema = z.object({
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
    .describe(
      'A specific page URL to query (e.g. https://example.com/page). Provide either origin or url, not both.',
    ),
  formFactor: z
    .enum(ALL_CRUX_FORM_FACTORS)
    .optional()
    .describe(
      'Filter by device class: PHONE, TABLET, or DESKTOP. Omit to aggregate across all devices.',
    ),
  metrics: z
    .array(z.enum(ALL_CRUX_METRIC_NAMES))
    .optional()
    .describe(
      'Specific metrics to retrieve. Omit to get all available metrics. Core Web Vitals: largest_contentful_paint, interaction_to_next_paint, cumulative_layout_shift. Also available: first_contentful_paint, experimental_time_to_first_byte, form_factors, navigation_types, round_trip_time, and LCP image subpart metrics.',
    ),
});

export type QueryCruxMetricsParams = z.infer<typeof QueryCruxMetricsSchema>;

@Tool({
  id: 'crux-query-metrics',
  name: 'queryCruxMetrics',
  description:
    'Query current Core Web Vitals and performance metrics from the Google Chrome UX Report (CrUX) for an origin or URL. Returns the latest 28-day rolling window of real-user experience data including LCP, INP, CLS, FCP, TTFB, and more. Use this to get a snapshot of field performance data for a website or page.',
  category: 'CrUX',
  parameters: QueryCruxMetricsSchema,
  version: '1.0.0',
  envVars: ['GOOGLE_CRUX_API_KEY'],
  annotations: {
    title: 'Query CrUX Metrics',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class QueryCruxMetricsTool implements ToolHandler {
  @CatchErrors()
  async execute(args: QueryCruxMetricsParams): Promise<string> {
    if (!args.origin && !args.url) {
      throw new UserError('Either "origin" or "url" must be provided.');
    }
    if (args.origin && args.url) {
      throw new UserError('Provide either "origin" or "url", not both.');
    }

    const record = await queryRecord({
      origin: args.origin,
      url: args.url,
      formFactor: args.formFactor,
      metrics: args.metrics as CrUXMetricName[] | undefined,
    });

    return JSON.stringify(record, null, 2);
  }
}
