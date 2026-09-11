import { z } from 'zod';
import { CatchErrors } from '../../utils';
import { Tool, ToolHandler } from '../registry';
import { K6Client } from './api';
import type { V5MetricResult, EndpointMetric, ScenarioSummary } from './api';

/**
 * Schema definition for the get test metrics tool parameters
 */
export const GetTestMetricsToolSchema = z.object({
  testRunId: z.string().describe('ID of the test run to get metrics for'),
  metrics: z
    .array(z.enum(['p90', 'p95', 'rps', 'error_rate', 'vus']))
    .optional()
    .describe('Which metrics to retrieve (default: all). Options: p90, p95, rps, error_rate, vus'),
  groupBy: z
    .enum(['scenario', 'endpoint', 'group'])
    .optional()
    .describe(
      'How to group scenario summaries (default: scenario). Options: scenario, endpoint, group',
    ),
});

/**
 * Type for the get test metrics tool parameters
 */
export type GetTestMetricsToolParams = z.infer<typeof GetTestMetricsToolSchema>;

/**
 * Build a composite key from metric labels for joining P90/RPS/error data
 */
function metricKey(r: V5MetricResult): string {
  const m = r.metric;
  return [
    m.scenario ?? '',
    m.group ?? '',
    m.name ?? '',
    m.method ?? '',
    m.status ?? '',
    m.load_zone ?? '',
  ].join('|');
}

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
 * Fetch real performance metrics for a k6 Cloud test run via the v5 API
 */
@Tool({
  id: 'k6-get-test-metrics',
  name: 'getK6TestMetrics',
  description:
    'Fetch real performance metrics for a k6 Cloud test run via the v5 API. Returns per-endpoint and per-scenario P90, P95, RPS, error rate, and VUs with automatic ramp-up offset.',
  category: 'k6',
  parameters: GetTestMetricsToolSchema,
  version: '1.0.0',
  envVars: ['GRAFANA_K6_TOKEN'],
  annotations: {
    title: 'Get k6 Test Metrics',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GetTestMetricsTool implements ToolHandler {
  /**
   * Execute the get test metrics tool
   */
  @CatchErrors()
  async execute(args: GetTestMetricsToolParams): Promise<string> {
    const client = new K6Client();
    const requestedMetrics = args.metrics ?? ['p90', 'p95', 'rps', 'error_rate', 'vus'];

    // Fetch test run metadata to get start/end times
    const run = await client.getTestRun(args.testRunId);
    const durationMs =
      run.ended && run.created
        ? new Date(run.ended).getTime() - new Date(run.created).getTime()
        : null;

    // Calculate time window with ramp-up offset
    let metricOpts: { start?: number; end?: number } | undefined;
    if (run.created && run.ended) {
      const createdTs = Math.floor(new Date(run.created).getTime() / 1000);
      const endedTs = Math.floor(new Date(run.ended).getTime() / 1000);
      const offset = Math.min(15 * 60, Math.floor((endedTs - createdTs) * 0.2));
      metricOpts = { start: createdTs + offset, end: endedTs };
    }

    // Fetch all requested metrics via v5 API
    const allMetrics = await client.getTestRunMetrics(args.testRunId, metricOpts);

    // Build lookup maps by composite key
    const p90Map = new Map<string, number>();
    const p95Map = new Map<string, number>();
    const rpsMap = new Map<string, number>();
    const errorRateMap = new Map<string, number>();

    if (requestedMetrics.includes('p90')) {
      for (const r of allMetrics.p90) {
        const val = firstValue(r);
        if (val !== undefined) p90Map.set(metricKey(r), val);
      }
    }
    if (requestedMetrics.includes('p95')) {
      for (const r of allMetrics.p95) {
        const val = firstValue(r);
        if (val !== undefined) p95Map.set(metricKey(r), val);
      }
    }
    if (requestedMetrics.includes('rps')) {
      for (const r of allMetrics.rps) {
        const val = firstValue(r);
        if (val !== undefined) rpsMap.set(metricKey(r), val);
      }
    }
    if (requestedMetrics.includes('error_rate')) {
      for (const r of allMetrics.errorRate) {
        const val = firstValue(r);
        if (val !== undefined) errorRateMap.set(metricKey(r), val);
      }
    }

    // Collect all unique keys
    const allKeys = new Set<string>([
      ...p90Map.keys(),
      ...p95Map.keys(),
      ...rpsMap.keys(),
      ...errorRateMap.keys(),
    ]);

    // Build a label map for each key
    const labelMap = new Map<string, V5MetricResult['metric']>();
    for (const dataset of [allMetrics.p90, allMetrics.p95, allMetrics.rps, allMetrics.errorRate]) {
      for (const r of dataset) {
        const key = metricKey(r);
        if (!labelMap.has(key)) labelMap.set(key, r.metric);
      }
    }

    // Build per-endpoint metrics
    const endpointMetrics: EndpointMetric[] = [];
    for (const key of allKeys) {
      const labels = labelMap.get(key);
      if (!labels) continue;

      const entry: EndpointMetric = {
        scenario: labels.scenario ?? '',
        group: labels.group ?? '',
        name: labels.name ?? '',
        method: labels.method ?? '',
        status: labels.status ?? '',
        loadZone: labels.load_zone ?? '',
      };

      if (p90Map.has(key)) entry.p90 = Math.round(p90Map.get(key)! * 100) / 100;
      if (p95Map.has(key)) entry.p95 = Math.round(p95Map.get(key)! * 100) / 100;
      if (rpsMap.has(key)) entry.rps = Math.round(rpsMap.get(key)! * 100) / 100;
      if (errorRateMap.has(key))
        entry.errorRate = Math.round(errorRateMap.get(key)! * 10000) / 10000;

      endpointMetrics.push(entry);
    }

    // Group by scenario or requested groupBy
    const groupField = args.groupBy ?? 'scenario';
    const scenarioGroups = new Map<string, EndpointMetric[]>();

    for (const em of endpointMetrics) {
      const groupKey =
        groupField === 'endpoint'
          ? `${em.scenario}|${em.name}`
          : groupField === 'group'
            ? `${em.scenario}|${em.group}`
            : em.scenario;
      if (!scenarioGroups.has(groupKey)) scenarioGroups.set(groupKey, []);
      scenarioGroups.get(groupKey)!.push(em);
    }

    // Build scenario summaries
    const scenarioSummaries: ScenarioSummary[] = [];
    for (const [scenario, endpoints] of scenarioGroups) {
      const p90Values = endpoints.filter((e) => e.p90 !== undefined).map((e) => e.p90!);
      const p95Values = endpoints.filter((e) => e.p95 !== undefined).map((e) => e.p95!);
      const rpsValues = endpoints.filter((e) => e.rps !== undefined).map((e) => e.rps!);
      const errorRateValues = endpoints
        .filter((e) => e.errorRate !== undefined)
        .map((e) => e.errorRate!);

      const summary: ScenarioSummary = {
        scenario,
        endpointCount: endpoints.length,
      };

      if (p90Values.length > 0) {
        summary.avgP90 =
          Math.round((p90Values.reduce((a, b) => a + b, 0) / p90Values.length) * 100) / 100;
        summary.maxP90 = Math.round(Math.max(...p90Values) * 100) / 100;
      }
      if (p95Values.length > 0) {
        summary.avgP95 =
          Math.round((p95Values.reduce((a, b) => a + b, 0) / p95Values.length) * 100) / 100;
        summary.maxP95 = Math.round(Math.max(...p95Values) * 100) / 100;
      }
      if (rpsValues.length > 0) {
        summary.totalRps = Math.round(rpsValues.reduce((a, b) => a + b, 0) * 100) / 100;
      }
      if (errorRateValues.length > 0) {
        summary.avgErrorRate =
          Math.round(
            (errorRateValues.reduce((a, b) => a + b, 0) / errorRateValues.length) * 10000,
          ) / 10000;
      }

      scenarioSummaries.push(summary);
    }

    // Compute overall summary
    const allP90 = endpointMetrics.filter((e) => e.p90 !== undefined).map((e) => e.p90!);
    const allP95 = endpointMetrics.filter((e) => e.p95 !== undefined).map((e) => e.p95!);
    const allRps = endpointMetrics.filter((e) => e.rps !== undefined).map((e) => e.rps!);
    const allErr = endpointMetrics
      .filter((e) => e.errorRate !== undefined)
      .map((e) => e.errorRate!);

    let totalVus: number | undefined;
    if (requestedMetrics.includes('vus') && allMetrics.vus.length > 0) {
      const vusValues = allMetrics.vus
        .map((r) => firstValue(r))
        .filter((v): v is number => v !== undefined);
      totalVus = vusValues.length > 0 ? vusValues.reduce((sum, v) => sum + v, 0) : undefined;
    }

    return JSON.stringify(
      {
        testRunId: args.testRunId,
        status: run.status,
        result: run.result,
        created: run.created,
        ended: run.ended,
        durationSeconds: durationMs !== null ? Math.round(durationMs / 1000) : null,
        totalVus,
        endpointMetrics,
        scenarioSummaries,
        summary: {
          totalEndpoints: endpointMetrics.length,
          totalScenarios: scenarioSummaries.length,
          overallP90: allP90.length > 0 ? Math.round(Math.max(...allP90) * 100) / 100 : undefined,
          overallP95: allP95.length > 0 ? Math.round(Math.max(...allP95) * 100) / 100 : undefined,
          overallRps:
            allRps.length > 0
              ? Math.round(allRps.reduce((a, b) => a + b, 0) * 100) / 100
              : undefined,
          overallErrorRate:
            allErr.length > 0
              ? Math.round((allErr.reduce((a, b) => a + b, 0) / allErr.length) * 10000) / 10000
              : undefined,
        },
      },
      null,
      2,
    );
  }
}
