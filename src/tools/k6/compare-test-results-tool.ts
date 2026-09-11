import { z } from 'zod';
import { CatchErrors } from '../../utils';
import { Tool, ToolHandler } from '../registry';
import type { ComparisonRow, V5MetricResult } from './api';
import { K6Client } from './api';

const DEFAULT_METRICS = [
  'duration_seconds',
  'result',
  'p90_max',
  'p95_max',
  'total_rps',
  'avg_error_rate',
];

const DEFAULT_THRESHOLDS: Record<
  string,
  {
    direction: 'lower_is_better' | 'higher_is_better';
    maxRegressionPct: number;
  }
> = {
  duration_seconds: { direction: 'lower_is_better', maxRegressionPct: 10 },
  p90_max: { direction: 'lower_is_better', maxRegressionPct: 15 },
  p95_max: { direction: 'lower_is_better', maxRegressionPct: 15 },
  total_rps: { direction: 'higher_is_better', maxRegressionPct: 10 },
  avg_error_rate: { direction: 'lower_is_better', maxRegressionPct: 50 },
};

/**
 * Schema definition for the compare test results tool parameters
 */
export const CompareTestResultsToolSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe('ID of the project (metadata-only, included in response for context)'),
  scenarioName: z
    .string()
    .optional()
    .describe(
      'Name of the load test / scenario being compared (metadata-only, included in response for context)',
    ),
  baselineRunId: z.string().describe('Test run ID of the baseline (reference) run'),
  candidateRunId: z.string().describe('Test run ID of the candidate (new) run'),
  metrics: z
    .array(z.string())
    .optional()
    .describe(
      'Metrics to compare (default: duration_seconds, result, p90_max, p95_max, total_rps, avg_error_rate)',
    ),
  thresholds: z
    .record(
      z.string(),
      z.object({
        direction: z.enum(['lower_is_better', 'higher_is_better']),
        maxRegressionPct: z.number().optional(),
      }),
    )
    .optional()
    .describe(
      'Optional threshold overrides per metric defining direction and max regression percentage',
    ),
});

/**
 * Type for the compare test results tool parameters
 */
export type CompareTestResultsToolParams = z.infer<typeof CompareTestResultsToolSchema>;

/**
 * Extract the first numeric value from a V5MetricResult.
 * Returns undefined when data is missing or invalid to avoid fabricating zero values.
 */
function firstValue(r: V5MetricResult): number | undefined {
  if (r.values && r.values.length > 0) {
    const parsed = parseFloat(r.values[0][1]);
    return isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

/**
 * Pure comparison logic for two metric maps
 */
export function compareMetrics(
  baselineMap: Map<string, number>,
  candidateMap: Map<string, number>,
  metrics: string[],
  thresholds: Record<
    string,
    {
      direction: 'lower_is_better' | 'higher_is_better';
      maxRegressionPct?: number;
    }
  >,
): {
  comparison: ComparisonRow[];
  overallVerdict: 'pass' | 'fail' | 'warning';
  highlights: string[];
} {
  const comparison: ComparisonRow[] = [];
  const highlights: string[] = [];
  let hasRegression = false;
  let hasWarning = false;

  for (const metric of metrics) {
    const baselineHas = baselineMap.has(metric);
    const candidateHas = candidateMap.has(metric);

    if (!baselineHas || !candidateHas) {
      comparison.push({
        metric,
        baseline: baselineHas ? baselineMap.get(metric)! : null,
        candidate: candidateHas ? candidateMap.get(metric)! : null,
        delta: null,
        deltaPct: null,
        verdict: 'data_unavailable',
      });
      hasWarning = true;
      highlights.push(
        `${metric}: data unavailable for ${!baselineHas ? 'baseline' : 'candidate'} run`,
      );
      continue;
    }

    const baseline = baselineMap.get(metric)!;
    const candidate = candidateMap.get(metric)!;
    const delta = candidate - baseline;
    const deltaPct = baseline !== 0 ? (delta / Math.abs(baseline)) * 100 : 0;

    const thresh = thresholds[metric] ?? DEFAULT_THRESHOLDS[metric];
    let verdict: ComparisonRow['verdict'] = 'no_change';

    if (thresh) {
      const isLowerBetter = thresh.direction === 'lower_is_better';
      const regressionPct = thresh.maxRegressionPct ?? 10;

      if (isLowerBetter) {
        if (deltaPct > regressionPct) {
          verdict = 'regressed';
          hasRegression = true;
          highlights.push(
            `${metric} regressed by ${deltaPct.toFixed(1)}% (threshold: ${regressionPct}%)`,
          );
        } else if (delta < 0) {
          verdict = 'improved';
          highlights.push(`${metric} improved by ${Math.abs(deltaPct).toFixed(1)}%`);
        }
      } else {
        if (-deltaPct > regressionPct) {
          verdict = 'regressed';
          hasRegression = true;
          highlights.push(
            `${metric} regressed by ${Math.abs(deltaPct).toFixed(1)}% (threshold: ${regressionPct}%)`,
          );
        } else if (delta > 0) {
          verdict = 'improved';
          highlights.push(`${metric} improved by ${deltaPct.toFixed(1)}%`);
        }
      }
    } else if (delta !== 0) {
      hasWarning = true;
    }

    comparison.push({
      metric,
      baseline,
      candidate,
      delta,
      deltaPct: Math.round(deltaPct * 100) / 100,
      verdict,
    });
  }

  const overallVerdict = hasRegression ? 'fail' : hasWarning ? 'warning' : 'pass';
  return { comparison, overallVerdict, highlights };
}

/**
 * Compute aggregate stats from v5 metric results
 */
function computeAggregateStats(metrics: {
  p90: V5MetricResult[];
  p95: V5MetricResult[];
  rps: V5MetricResult[];
  errorRate: V5MetricResult[];
  vus: V5MetricResult[];
}): Map<string, number> {
  const map = new Map<string, number>();

  if (metrics.p90.length > 0) {
    const values = metrics.p90.map(firstValue).filter((v): v is number => v !== undefined);
    if (values.length > 0) {
      map.set('p90_max', Math.max(...values));
      map.set('p90_avg', values.reduce((a, b) => a + b, 0) / values.length);
    }
  }
  if (metrics.p95.length > 0) {
    const values = metrics.p95.map(firstValue).filter((v): v is number => v !== undefined);
    if (values.length > 0) {
      map.set('p95_max', Math.max(...values));
      map.set('p95_avg', values.reduce((a, b) => a + b, 0) / values.length);
    }
  }
  if (metrics.rps.length > 0) {
    const values = metrics.rps.map(firstValue).filter((v): v is number => v !== undefined);
    if (values.length > 0) {
      map.set(
        'total_rps',
        values.reduce((a, b) => a + b, 0),
      );
    }
  }
  if (metrics.errorRate.length > 0) {
    const values = metrics.errorRate.map(firstValue).filter((v): v is number => v !== undefined);
    if (values.length > 0) {
      map.set('avg_error_rate', values.reduce((a, b) => a + b, 0) / values.length);
    }
  }
  if (metrics.vus.length > 0) {
    const values = metrics.vus.map(firstValue).filter((v): v is number => v !== undefined);
    if (values.length > 0) {
      map.set(
        'total_vus',
        values.reduce((a, b) => a + b, 0),
      );
    }
  }

  return map;
}

/**
 * Compare two k6 Cloud test runs with configurable metrics and thresholds
 */
@Tool({
  id: 'k6-compare-test-results',
  name: 'compareK6TestResults',
  description:
    'Compare two k6 Cloud test runs side-by-side. Fetches both runs via v6 API and real performance metrics via v5 API, then compares P90, P95, RPS, error rate alongside duration and result with configurable thresholds.',
  category: 'k6',
  parameters: CompareTestResultsToolSchema,
  version: '1.0.0',
  envVars: ['GRAFANA_K6_TOKEN'],
  annotations: {
    title: 'Compare k6 Test Results',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class CompareTestResultsTool implements ToolHandler {
  /**
   * Execute the compare test results tool
   */
  @CatchErrors()
  async execute(args: CompareTestResultsToolParams): Promise<string> {
    const client = new K6Client();
    const metrics = args.metrics ?? DEFAULT_METRICS;
    const thresholds = args.thresholds ?? DEFAULT_THRESHOLDS;

    // Fetch both test runs via v6 API
    const [baseRun, candRun] = await Promise.all([
      client.getTestRun(args.baselineRunId),
      client.getTestRun(args.candidateRunId),
    ]);

    const computeDuration = (run: typeof baseRun): number => {
      if (run.ended && run.created) {
        return (new Date(run.ended).getTime() - new Date(run.created).getTime()) / 1000;
      }
      return 0;
    };

    const resultToNum = (r: string | null): number => {
      if (r === 'passed') return 1;
      if (r === 'failed') return 0;
      return -1;
    };

    const baselineMap = new Map<string, number>([
      ['duration_seconds', computeDuration(baseRun)],
      ['result', resultToNum(baseRun.result)],
    ]);
    const candidateMap = new Map<string, number>([
      ['duration_seconds', computeDuration(candRun)],
      ['result', resultToNum(candRun.result)],
    ]);

    // Fetch v5 aggregate metrics for both runs
    const v5MetricNames = [
      'p90_max',
      'p90_avg',
      'p95_max',
      'p95_avg',
      'total_rps',
      'avg_error_rate',
      'total_vus',
    ];
    const hasV5Metrics = metrics.some((m: string) => v5MetricNames.includes(m));

    if (hasV5Metrics) {
      const computeOpts = (run: typeof baseRun) => {
        if (run.created && run.ended) {
          const createdTs = Math.floor(new Date(run.created).getTime() / 1000);
          const endedTs = Math.floor(new Date(run.ended).getTime() / 1000);
          const offset = Math.min(15 * 60, Math.floor((endedTs - createdTs) * 0.2));
          return { start: createdTs + offset, end: endedTs };
        }
        return undefined;
      };

      const [baseMetrics, candMetrics] = await Promise.all([
        client.getTestRunMetrics(args.baselineRunId, computeOpts(baseRun)),
        client.getTestRunMetrics(args.candidateRunId, computeOpts(candRun)),
      ]);

      const baseStats = computeAggregateStats(baseMetrics);
      const candStats = computeAggregateStats(candMetrics);

      for (const [key, val] of baseStats) baselineMap.set(key, val);
      for (const [key, val] of candStats) candidateMap.set(key, val);
    }

    const result = compareMetrics(baselineMap, candidateMap, metrics, thresholds);

    // Add human-readable summary
    result.highlights.unshift(
      `Baseline (${args.baselineRunId}): ${baseRun.status}, result=${baseRun.result}, ${computeDuration(baseRun).toFixed(0)}s`,
      `Candidate (${args.candidateRunId}): ${candRun.status}, result=${candRun.result}, ${computeDuration(candRun).toFixed(0)}s`,
    );

    if (baselineMap.has('p90_max') || candidateMap.has('p90_max')) {
      const bp90 = baselineMap.get('p90_max');
      const cp90 = candidateMap.get('p90_max');
      if (bp90 !== undefined && cp90 !== undefined) {
        result.highlights.push(
          `P90 (max): baseline=${bp90.toFixed(1)}ms, candidate=${cp90.toFixed(1)}ms`,
        );
      }
    }
    if (baselineMap.has('total_rps') || candidateMap.has('total_rps')) {
      const brps = baselineMap.get('total_rps');
      const crps = candidateMap.get('total_rps');
      if (brps !== undefined && crps !== undefined) {
        result.highlights.push(
          `RPS (total): baseline=${brps.toFixed(1)}, candidate=${crps.toFixed(1)}`,
        );
      }
    }
    if (baselineMap.has('avg_error_rate') || candidateMap.has('avg_error_rate')) {
      const ber = baselineMap.get('avg_error_rate');
      const cer = candidateMap.get('avg_error_rate');
      if (ber !== undefined && cer !== undefined) {
        result.highlights.push(
          `Error Rate (avg): baseline=${(ber * 100).toFixed(2)}%, candidate=${(cer * 100).toFixed(2)}%`,
        );
      }
    }

    return JSON.stringify(
      {
        projectId: args.projectId,
        scenarioName: args.scenarioName,
        baselineRunId: args.baselineRunId,
        candidateRunId: args.candidateRunId,
        ...result,
      },
      null,
      2,
    );
  }
}
