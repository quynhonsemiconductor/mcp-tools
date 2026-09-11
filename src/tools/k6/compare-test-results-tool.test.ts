import { describe, expect, it } from 'bun:test';
import { compareMetrics } from './compare-test-results-tool';

describe('compareMetrics – pure comparison logic', () => {
  const thresholds = {
    http_req_duration_p95: {
      direction: 'lower_is_better' as const,
      maxRegressionPct: 10,
    },
    http_req_failed_rate: {
      direction: 'lower_is_better' as const,
      maxRegressionPct: 5,
    },
    checks_pass_rate: {
      direction: 'higher_is_better' as const,
      maxRegressionPct: 5,
    },
    iterations: {
      direction: 'higher_is_better' as const,
      maxRegressionPct: 10,
    },
  };

  it('should detect no_change when values are identical', () => {
    const base = new Map([['http_req_duration_p95', 200]]);
    const cand = new Map([['http_req_duration_p95', 200]]);
    const { comparison, overallVerdict } = compareMetrics(
      base,
      cand,
      ['http_req_duration_p95'],
      thresholds,
    );
    expect(comparison).toHaveLength(1);
    expect(comparison[0].verdict).toBe('no_change');
    expect(comparison[0].delta).toBe(0);
    expect(overallVerdict).toBe('pass');
  });

  it('should detect regression when p95 increases past threshold (lower_is_better)', () => {
    const base = new Map([['http_req_duration_p95', 100]]);
    const cand = new Map([['http_req_duration_p95', 115]]); // +15%
    const { comparison, overallVerdict, highlights } = compareMetrics(
      base,
      cand,
      ['http_req_duration_p95'],
      thresholds,
    );
    expect(comparison[0].verdict).toBe('regressed');
    expect(overallVerdict).toBe('fail');
    expect(highlights.length).toBeGreaterThan(0);
  });

  it('should detect improvement when p95 decreases (lower_is_better)', () => {
    const base = new Map([['http_req_duration_p95', 200]]);
    const cand = new Map([['http_req_duration_p95', 180]]);
    const { comparison, overallVerdict } = compareMetrics(
      base,
      cand,
      ['http_req_duration_p95'],
      thresholds,
    );
    expect(comparison[0].verdict).toBe('improved');
    expect(overallVerdict).toBe('pass');
  });

  it('should detect regression when checks_pass_rate drops (higher_is_better)', () => {
    const base = new Map([['checks_pass_rate', 100]]);
    const cand = new Map([['checks_pass_rate', 90]]); // -10%
    const { comparison, overallVerdict } = compareMetrics(
      base,
      cand,
      ['checks_pass_rate'],
      thresholds,
    );
    expect(comparison[0].verdict).toBe('regressed');
    expect(overallVerdict).toBe('fail');
  });

  it('should handle multiple metrics and produce per-metric verdicts', () => {
    const base = new Map<string, number>([
      ['http_req_duration_p95', 100],
      ['iterations', 1000],
    ]);
    const cand = new Map<string, number>([
      ['http_req_duration_p95', 100],
      ['iterations', 1200],
    ]);
    const { comparison, overallVerdict } = compareMetrics(
      base,
      cand,
      ['http_req_duration_p95', 'iterations'],
      thresholds,
    );
    expect(comparison).toHaveLength(2);
    expect(comparison[0].verdict).toBe('no_change');
    expect(comparison[1].verdict).toBe('improved');
    expect(overallVerdict).toBe('pass');
  });

  it('should return data_unavailable when metric is missing from one side', () => {
    const base = new Map<string, number>();
    const cand = new Map([['http_req_duration_p95', 50]]);
    const { comparison, overallVerdict } = compareMetrics(
      base,
      cand,
      ['http_req_duration_p95'],
      thresholds,
    );
    expect(comparison[0].verdict).toBe('data_unavailable');
    expect(comparison[0].baseline).toBeNull();
    expect(comparison[0].candidate).toBe(50);
    expect(comparison[0].delta).toBeNull();
    expect(overallVerdict).toBe('warning');
  });

  it('should return warning when delta is non-zero but no threshold is defined', () => {
    const base = new Map([['custom_metric', 100]]);
    const cand = new Map([['custom_metric', 110]]);
    const { overallVerdict } = compareMetrics(
      base,
      cand,
      ['custom_metric'],
      {}, // no thresholds
    );
    expect(overallVerdict).toBe('warning');
  });

  it('should compute correct deltaPct', () => {
    const base = new Map([['http_req_duration_p95', 200]]);
    const cand = new Map([['http_req_duration_p95', 220]]);
    const { comparison } = compareMetrics(base, cand, ['http_req_duration_p95'], thresholds);
    expect(comparison[0].deltaPct).toBe(10);
    expect(comparison[0].delta).toBe(20);
  });
});
