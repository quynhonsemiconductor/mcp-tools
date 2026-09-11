import type { CrUXMetricName } from './types';

export type CWVRating = 'good' | 'needs-improvement' | 'poor' | 'n/a';

export interface CWVThreshold {
  good: number;
  needsImprovement: number;
  unit: string;
  label: string;
}

/**
 * Google's published thresholds for Core Web Vitals and supporting metrics.
 * LCP, INP, and CLS are the three Core Web Vitals. FCP and TTFB are supporting
 * metrics with official Google-published thresholds. RTT values are industry
 * heuristics, not official Google thresholds.
 * Values represent the upper bound for each category.
 * Metrics not listed here (form_factors, navigation_types, etc.) use 'n/a'.
 * @see https://web.dev/articles/vitals
 */
export const CWV_THRESHOLDS: Partial<Record<CrUXMetricName, CWVThreshold>> = {
  largest_contentful_paint: {
    good: 2500,
    needsImprovement: 4000,
    unit: 'ms',
    label: 'Largest Contentful Paint (LCP)',
  },
  interaction_to_next_paint: {
    good: 200,
    needsImprovement: 500,
    unit: 'ms',
    label: 'Interaction to Next Paint (INP)',
  },
  cumulative_layout_shift: {
    good: 0.1,
    needsImprovement: 0.25,
    unit: '',
    label: 'Cumulative Layout Shift (CLS)',
  },
  first_contentful_paint: {
    good: 1800,
    needsImprovement: 3000,
    unit: 'ms',
    label: 'First Contentful Paint (FCP)',
  },
  experimental_time_to_first_byte: {
    good: 800,
    needsImprovement: 1800,
    unit: 'ms',
    label: 'Time to First Byte (TTFB)',
  },
  // RTT values (100ms/300ms) are industry heuristics; Google does not publish official RTT thresholds.
  round_trip_time: {
    good: 100,
    needsImprovement: 300,
    unit: 'ms',
    label: 'Round Trip Time (RTT)',
  },
};

/**
 * Normalize a raw CrUX p75 value to a number.
 *
 * CrUX returns most p75 values as numbers, but CLS arrives as a string
 * (e.g. "0.15"). Both the audit and compare tools emit p75 in their output,
 * so they share this helper to keep the field a consistent numeric type.
 * Returns null when the value is absent or unparseable.
 */
export function normalizeP75(p75: number | string | null | undefined): number | null {
  if (p75 === null || p75 === undefined) return null;
  const value = typeof p75 === 'string' ? parseFloat(p75) : p75;
  return isNaN(value) ? null : value;
}

/**
 * Rate a metric value against Google's thresholds.
 */
export function rateMetric(
  metricName: CrUXMetricName,
  p75: number | string | null | undefined,
): CWVRating {
  const threshold = CWV_THRESHOLDS[metricName];
  if (!threshold || p75 === null || p75 === undefined) return 'n/a';

  const value = typeof p75 === 'string' ? parseFloat(p75) : p75;
  if (isNaN(value)) return 'n/a';

  if (value <= threshold.good) return 'good';
  if (value <= threshold.needsImprovement) return 'needs-improvement';
  return 'poor';
}

/**
 * The default set of metrics assessed in an audit.
 * LCP, INP, and CLS are the Core Web Vitals; FCP and TTFB are supporting metrics.
 */
export const DEFAULT_AUDIT_METRICS: CrUXMetricName[] = [
  'largest_contentful_paint',
  'interaction_to_next_paint',
  'cumulative_layout_shift',
  'first_contentful_paint',
  'experimental_time_to_first_byte',
];
