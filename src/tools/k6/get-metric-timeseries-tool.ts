import { z } from 'zod';
import { CatchErrors } from '../../utils';
import { Tool, ToolHandler } from '../registry';
import type { TimeseriesDataPoint, TimeseriesEntry } from './api';
import { K6ApiError, K6Client, V5_METRIC_QUERIES } from './api';

/**
 * Map user-friendly metric names to v5 API metric+query pairs
 */
const METRIC_QUERIES = V5_METRIC_QUERIES;

/**
 * Schema definition for the get metric timeseries tool parameters
 */
export const GetMetricTimeseriesToolSchema = z.object({
  testRunId: z.string().describe('ID of the test run to get timeseries data for'),
  metric: z
    .enum(['p90', 'p95', 'rps', 'error_rate', 'vus'])
    .describe('Metric to fetch timeseries data for'),
  step: z
    .number()
    .optional()
    .default(10)
    .describe('Step interval in seconds between data points (default: 10)'),
  start: z
    .number()
    .optional()
    .describe('Start timestamp (unix seconds). If omitted, uses test run start time.'),
  end: z
    .number()
    .optional()
    .describe('End timestamp (unix seconds). If omitted, uses test run end time.'),
});

/**
 * Type for the get metric timeseries tool parameters
 */
export type GetMetricTimeseriesToolParams = z.input<typeof GetMetricTimeseriesToolSchema>;

/**
 * Fetch time-series metric data for a k6 Cloud test run via the v5 range API
 */
@Tool({
  id: 'k6-get-metric-timeseries',
  name: 'getK6MetricTimeseries',
  description:
    'Fetch time-series metric data for a k6 Cloud test run via the v5 range API. Returns metric values over time at the specified step interval.',
  category: 'k6',
  parameters: GetMetricTimeseriesToolSchema,
  version: '1.0.0',
  envVars: ['GRAFANA_K6_TOKEN'],
  annotations: {
    title: 'Get k6 Metric Timeseries',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GetMetricTimeseriesTool implements ToolHandler {
  /**
   * Execute the get metric timeseries tool
   */
  @CatchErrors()
  async execute(args: GetMetricTimeseriesToolParams): Promise<string> {
    const client = new K6Client();
    const step = args.step ?? 10;

    const queryDef = METRIC_QUERIES[args.metric];
    if (!queryDef) {
      throw new K6ApiError(
        'INVALID_INPUT',
        `Unknown metric '${args.metric}'. Valid metrics: ${Object.keys(METRIC_QUERIES).join(', ')}`,
      );
    }

    // Determine time window
    let start = args.start;
    let end = args.end;

    if (start === undefined || end === undefined) {
      const run = await client.getTestRun(args.testRunId);
      if (run.created && run.ended) {
        const createdTs = Math.floor(new Date(run.created).getTime() / 1000);
        const endedTs = Math.floor(new Date(run.ended).getTime() / 1000);
        start = start ?? createdTs;
        end = end ?? endedTs;
      } else {
        throw new K6ApiError(
          'INVALID_INPUT',
          'Test run has no created/ended time. Please provide start and end timestamps.',
        );
      }
    }

    // Fetch time-series data via v5 range API
    const response = await client.queryRangeK6(
      args.testRunId,
      queryDef.metric,
      queryDef.query,
      step,
      start,
      end,
    );

    const results = response?.data?.result ?? [];

    // Transform results into TimeseriesEntry objects
    const entries: TimeseriesEntry[] = results.map((r) => {
      const dataPoints: TimeseriesDataPoint[] = (r.values || [])
        .map(([ts, val]) => {
          const parsed = parseFloat(val);
          return isNaN(parsed) ? null : { timestamp: ts, value: parsed };
        })
        .filter((dp): dp is TimeseriesDataPoint => dp !== null);

      return {
        scenario: r.metric.scenario ?? '',
        group: r.metric.group ?? '',
        name: r.metric.name ?? '',
        method: r.metric.method ?? '',
        status: r.metric.status ?? '',
        loadZone: r.metric.load_zone ?? '',
        dataPoints,
      };
    });

    // Compute summary
    let totalDataPoints = 0;
    let minTs: number | undefined;
    let maxTs: number | undefined;

    for (const entry of entries) {
      totalDataPoints += entry.dataPoints.length;
      for (const dp of entry.dataPoints) {
        if (minTs === undefined || dp.timestamp < minTs) minTs = dp.timestamp;
        if (maxTs === undefined || dp.timestamp > maxTs) maxTs = dp.timestamp;
      }
    }

    return JSON.stringify(
      {
        testRunId: args.testRunId,
        metric: args.metric,
        step,
        entries,
        summary: {
          totalEntries: entries.length,
          totalDataPoints,
          timeRangeStart: minTs,
          timeRangeEnd: maxTs,
        },
      },
      null,
      2,
    );
  }
}
