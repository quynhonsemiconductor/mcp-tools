import { z } from 'zod';
import { CatchErrors, UserError } from '../../utils';
import { Tool, ToolHandler } from '../registry';
import { CrUXApiError, queryRecord } from './api';
import { CWV_THRESHOLDS, DEFAULT_AUDIT_METRICS, normalizeP75, rateMetric } from './thresholds';
import { ALL_CRUX_FORM_FACTORS } from './types';

export const AuditCoreWebVitalsSchema = z.object({
  origin: z
    .string()
    .url()
    .optional()
    .describe(
      'The origin to audit (e.g. https://example.com). Provide either origin or url, not both.',
    ),
  url: z
    .string()
    .url()
    .optional()
    .describe('A specific page URL to audit. Provide either origin or url, not both.'),
  formFactor: z
    .enum(ALL_CRUX_FORM_FACTORS)
    .optional()
    .describe(
      'Filter by device class: PHONE, TABLET, or DESKTOP. Omit to aggregate across all devices.',
    ),
});

export type AuditCoreWebVitalsParams = z.infer<typeof AuditCoreWebVitalsSchema>;

@Tool({
  id: 'crux-audit-core-web-vitals',
  name: 'auditCoreWebVitals',
  description:
    "Perform a structured Core Web Vitals audit for an origin or URL using real-user data from the Google Chrome UX Report (CrUX). Retrieves the 3 Core Web Vitals (LCP, INP, CLS) plus supporting metrics FCP and TTFB, and assesses each against Google's official Good/Needs Improvement/Poor thresholds. The overall PASS/FAIL verdict follows Google's official assessment (based on LCP, INP, and CLS); FCP and TTFB are reported as supporting diagnostics. Returns NO_DATA when the origin or URL has no field data in CrUX. Ideal for diagnosing performance issues and communicating results.",
  category: 'CrUX',
  parameters: AuditCoreWebVitalsSchema,
  version: '1.0.0',
  envVars: ['GOOGLE_CRUX_API_KEY'],
  annotations: {
    title: 'Audit Core Web Vitals',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class AuditCoreWebVitalsTool implements ToolHandler {
  @CatchErrors()
  async execute(args: AuditCoreWebVitalsParams): Promise<string> {
    if (!args.origin && !args.url) {
      throw new UserError('Either "origin" or "url" must be provided.');
    }
    if (args.origin && args.url) {
      throw new UserError('Provide either "origin" or "url", not both.');
    }

    const target = args.origin ?? args.url ?? '';

    let record;
    try {
      record = await queryRecord({
        origin: args.origin,
        url: args.url,
        formFactor: args.formFactor,
        metrics: DEFAULT_AUDIT_METRICS,
      });
    } catch (err: unknown) {
      // A genuinely absent origin/URL (not in the CrUX dataset) surfaces as a
      // 404. Rather than throwing, report it as a structured NO_DATA result so
      // the caller can distinguish "no field data" from a real failure.
      if (err instanceof CrUXApiError && err.statusCode === 404) {
        return JSON.stringify(
          {
            target,
            formFactor: args.formFactor ?? 'ALL',
            overallStatus: 'NO_DATA',
            message: err.message,
            summary: {
              total: 0,
              good: 0,
              needsImprovement: 0,
              poor: 0,
              noData: DEFAULT_AUDIT_METRICS.length,
            },
            metrics: [],
          },
          null,
          2,
        );
      }
      throw err;
    }

    const metricResults = DEFAULT_AUDIT_METRICS.map((metricName) => {
      const data = record.metrics[metricName];
      const threshold = CWV_THRESHOLDS[metricName];
      const p75 = normalizeP75(data?.percentiles?.p75);
      const rating = rateMetric(metricName, p75);

      return {
        metric: metricName,
        label: threshold?.label ?? metricName,
        p75,
        unit: threshold?.unit ?? '',
        rating,
        thresholds: threshold
          ? {
              good: `≤ ${threshold.good}${threshold.unit}`,
              needsImprovement: `≤ ${threshold.needsImprovement}${threshold.unit}`,
              poor: `> ${threshold.needsImprovement}${threshold.unit}`,
            }
          : undefined,
        histogram: data?.histogram ?? null,
        dataAvailable: !!data,
      };
    });

    const available = metricResults.filter((m) => m.dataAvailable);
    const passCount = available.filter((m) => m.rating === 'good').length;
    const failCount = available.filter((m) => m.rating === 'poor').length;
    const improvementCount = available.filter((m) => m.rating === 'needs-improvement').length;

    // The headline verdict follows Google's official Core Web Vitals
    // assessment, which is based on LCP, INP, and CLS only. FCP and TTFB are
    // reported in the metrics/summary below as supporting diagnostics but do
    // not affect PASS/FAIL. @see https://web.dev/articles/vitals
    const coreMetricNames: readonly string[] = [
      'largest_contentful_paint',
      'interaction_to_next_paint',
      'cumulative_layout_shift',
    ];
    const coreResults = available.filter((m) => coreMetricNames.includes(m.metric));
    const coreMetricsPresent = coreMetricNames.every((m) =>
      coreResults.some((r) => r.metric === m),
    );
    const coreGood = coreResults.filter((m) => m.rating === 'good').length;
    const corePoor = coreResults.filter((m) => m.rating === 'poor').length;
    const overallStatus =
      coreResults.length === 0
        ? 'NO_DATA'
        : coreMetricsPresent && coreGood === coreResults.length
          ? 'PASS'
          : corePoor > 0
            ? 'FAIL'
            : 'NEEDS IMPROVEMENT';

    return JSON.stringify(
      {
        target,
        formFactor: args.formFactor ?? 'ALL',
        collectionPeriod: record.collectionPeriod,
        overallStatus,
        summary: {
          total: available.length,
          good: passCount,
          needsImprovement: improvementCount,
          poor: failCount,
          noData: metricResults.length - available.length,
        },
        metrics: metricResults,
      },
      null,
      2,
    );
  }
}
