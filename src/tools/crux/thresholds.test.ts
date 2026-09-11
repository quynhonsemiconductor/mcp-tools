import { describe, expect, it } from 'bun:test';
import { normalizeP75, rateMetric } from './thresholds';
import type { CrUXMetricName } from './types';

describe('rateMetric', () => {
  describe('LCP thresholds (ms)', () => {
    it('rates 2500 as good', () => {
      expect(rateMetric('largest_contentful_paint', 2500)).toBe('good');
    });

    it('rates 2501 as needs-improvement', () => {
      expect(rateMetric('largest_contentful_paint', 2501)).toBe('needs-improvement');
    });

    it('rates 4000 as needs-improvement', () => {
      expect(rateMetric('largest_contentful_paint', 4000)).toBe('needs-improvement');
    });

    it('rates 4001 as poor', () => {
      expect(rateMetric('largest_contentful_paint', 4001)).toBe('poor');
    });
  });

  describe('CLS thresholds (string values)', () => {
    it('rates "0.05" as good', () => {
      expect(rateMetric('cumulative_layout_shift', '0.05')).toBe('good');
    });

    it('rates "0.15" as needs-improvement', () => {
      expect(rateMetric('cumulative_layout_shift', '0.15')).toBe('needs-improvement');
    });

    it('rates "0.3" as poor', () => {
      expect(rateMetric('cumulative_layout_shift', '0.3')).toBe('poor');
    });
  });

  // Table-driven boundary coverage for every rated metric. rateMetric is the
  // single source of truth for audit verdicts and comparison ratings, so a typo
  // in any threshold constant should be caught here. The code uses `<=`, so the
  // exact `good` and `needsImprovement` values are the upper bounds of their bucket.
  describe('threshold boundaries (all rated metrics)', () => {
    // `step` is a small increment that stays within the next bucket — 1ms for
    // the millisecond metrics, 0.01 for the unitless CLS (0–1 scale).
    const cases: Array<{
      metric: CrUXMetricName;
      good: number;
      needsImprovement: number;
      step: number;
    }> = [
      { metric: 'largest_contentful_paint', good: 2500, needsImprovement: 4000, step: 1 },
      { metric: 'interaction_to_next_paint', good: 200, needsImprovement: 500, step: 1 },
      { metric: 'cumulative_layout_shift', good: 0.1, needsImprovement: 0.25, step: 0.01 },
      { metric: 'first_contentful_paint', good: 1800, needsImprovement: 3000, step: 1 },
      { metric: 'experimental_time_to_first_byte', good: 800, needsImprovement: 1800, step: 1 },
      { metric: 'round_trip_time', good: 100, needsImprovement: 300, step: 1 },
    ];

    for (const { metric, good, needsImprovement, step } of cases) {
      describe(metric, () => {
        it(`rates the exact good bound (${good}) as good`, () => {
          expect(rateMetric(metric, good)).toBe('good');
        });
        it('rates just above the good bound as needs-improvement', () => {
          expect(rateMetric(metric, good + step)).toBe('needs-improvement');
        });
        it(`rates the exact needs-improvement bound (${needsImprovement}) as needs-improvement`, () => {
          expect(rateMetric(metric, needsImprovement)).toBe('needs-improvement');
        });
        it('rates just above the needs-improvement bound as poor', () => {
          expect(rateMetric(metric, needsImprovement + step)).toBe('poor');
        });
      });
    }
  });

  describe('normalizeP75', () => {
    it('passes numbers through unchanged', () => {
      expect(normalizeP75(2500)).toBe(2500);
    });
    it('parses string values (CLS) into numbers', () => {
      expect(normalizeP75('0.15')).toBe(0.15);
    });
    it('returns null for null/undefined', () => {
      expect(normalizeP75(null)).toBeNull();
      expect(normalizeP75(undefined)).toBeNull();
    });
    it('returns null for unparseable strings', () => {
      expect(normalizeP75('not-a-number')).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('returns "n/a" for null value', () => {
      expect(rateMetric('largest_contentful_paint', null)).toBe('n/a');
    });

    it('returns "n/a" for undefined value', () => {
      expect(rateMetric('largest_contentful_paint', undefined)).toBe('n/a');
    });

    it('returns "n/a" for NaN value', () => {
      expect(rateMetric('largest_contentful_paint', NaN)).toBe('n/a');
    });

    it('returns "n/a" for unknown metric name', () => {
      expect(rateMetric('unknown_metric' as unknown as CrUXMetricName, 1000)).toBe('n/a');
    });
  });
});
