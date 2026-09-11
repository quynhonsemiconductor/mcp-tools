import { z } from 'zod';
import { CatchErrors } from '../../utils';
import { Tool, ToolHandler } from '../registry';
import { CrUXApiError, queryRecord } from './api';
import { normalizeP75, rateMetric } from './thresholds';
import type { CrUXMetricName } from './types';
import { ALL_CRUX_FORM_FACTORS, ALL_CRUX_METRIC_NAMES } from './types';

const DEFAULT_COMPARISON_METRICS: CrUXMetricName[] = [
  'largest_contentful_paint',
  'interaction_to_next_paint',
  'cumulative_layout_shift',
  'first_contentful_paint',
  'experimental_time_to_first_byte',
];

export const CompareOriginsSchema = z.object({
  targets: z
    .array(z.string().url())
    .min(2, 'At least 2 targets are required for comparison.')
    .max(5, 'A maximum of 5 targets are supported.')
    .describe(
      'List of 2–5 origin URLs or page URLs to compare (e.g. ["https://example.com", "https://competitor.com"]). Can mix origins and page URLs.',
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
      'Metrics to compare. Defaults to the 3 Core Web Vitals (LCP, INP, CLS) plus supporting metrics FCP and TTFB.',
    ),
});

export type CompareOriginsParams = z.infer<typeof CompareOriginsSchema>;

@Tool({
  id: 'crux-compare-origins',
  name: 'compareCruxOrigins',
  description:
    'Compare web performance metrics across multiple origins or URLs side-by-side using real-user data from the Google Chrome UX Report (CrUX). Metrics include the 3 Core Web Vitals (LCP, INP, CLS) and supporting metrics FCP and TTFB. Accepts 2–5 targets and returns a normalized comparison table with p75 values and Good/Needs Improvement/Poor ratings for each metric. Ideal for competitive benchmarking or comparing multiple pages on the same site.',
  category: 'CrUX',
  parameters: CompareOriginsSchema,
  version: '1.0.0',
  envVars: ['GOOGLE_CRUX_API_KEY'],
  annotations: {
    title: 'Compare CrUX Origins',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class CompareOriginsTool implements ToolHandler {
  @CatchErrors()
  async execute(args: CompareOriginsParams): Promise<string> {
    const metricsToFetch =
      (args.metrics as CrUXMetricName[] | undefined) ?? DEFAULT_COMPARISON_METRICS;

    // Fetch all targets in parallel; capture errors per target instead of throwing
    const results = await Promise.all(
      args.targets.map(async (target) => {
        const parsed = new URL(target);
        const isOrigin = parsed.pathname === '/' || parsed.pathname === '';
        try {
          const record = await queryRecord({
            ...(isOrigin ? { origin: parsed.origin } : { url: target }),
            formFactor: args.formFactor,
            metrics: metricsToFetch,
          });
          return { target, record, error: null };
        } catch (err: unknown) {
          // Record per-target "not in dataset" (404) and quota (429) errors so
          // the remaining targets' results are preserved; re-throw everything else.
          if (err instanceof CrUXApiError && (err.statusCode === 404 || err.statusCode === 429)) {
            return { target, record: null, error: (err as Error).message };
          }
          throw err;
        }
      }),
    );

    const comparison = metricsToFetch.map((metricName) => {
      const values = results.map(({ target, record, error }) => {
        if (error || !record) {
          return { target, p75: null, rating: 'n/a' as const, error };
        }
        const data = record.metrics[metricName];
        const p75 = normalizeP75(data?.percentiles?.p75);
        return {
          target,
          p75,
          rating: rateMetric(metricName, p75),
          error: null,
        };
      });

      return { metric: metricName, values };
    });

    return JSON.stringify(
      {
        formFactor: args.formFactor ?? 'ALL',
        targets: args.targets,
        collectionPeriods: results.reduce(
          (acc, { target, record }) => {
            if (record) acc[target] = record.collectionPeriod;
            return acc;
          },
          {} as Record<string, unknown>,
        ),
        comparison,
        errors: results.filter((r) => r.error).map(({ target, error }) => ({ target, error })),
      },
      null,
      2,
    );
  }
}
