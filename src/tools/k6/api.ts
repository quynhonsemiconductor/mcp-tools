import env from '../../env';
import { logWarn } from '../../services/logger';
import { UserError } from '../../utils';

// ── Error class ──

/**
 * Deterministic error class for the k6 API client
 */
export class K6ApiError extends Error {
  public readonly code: string;
  public readonly details: Record<string, unknown>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'K6ApiError';
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return { code: this.code, message: this.message, details: this.details };
  }
}

// ── Configuration ──

const DEFAULT_K6_BASE_URL = 'https://api.k6.io';
const DEFAULT_K6_TIMEOUT_MS = 30_000;
const DEFAULT_K6_MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 10_000;

export interface K6ClientConfig {
  baseUrl: string;
  token: string;
  stackId?: string;
  orgId?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Resolve k6 client configuration from env vars and optional overrides
 */
function resolveConfig(overrides?: Partial<K6ClientConfig>): K6ClientConfig {
  const baseUrl = overrides?.baseUrl || env.GRAFANA_K6_BASE_URL || DEFAULT_K6_BASE_URL;
  const token = overrides?.token || env.GRAFANA_K6_TOKEN || '';
  const stackId = overrides?.stackId || env.GRAFANA_K6_STACK_ID || undefined;
  const orgId = overrides?.orgId || env.GRAFANA_K6_ORG_ID || undefined;

  if (!token) {
    throw new UserError('GRAFANA_K6_TOKEN is not set.');
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    token,
    stackId,
    orgId,
    timeoutMs: overrides?.timeoutMs ?? DEFAULT_K6_TIMEOUT_MS,
    maxRetries: overrides?.maxRetries ?? DEFAULT_K6_MAX_RETRIES,
  };
}

// ── Types ──

export interface V6ListResponse<T> {
  '@count'?: number;
  '@nextLink'?: string;
  value: T[];
}

export interface V5MetricLabels {
  __name__: string;
  test_run_id: string;
  scenario?: string;
  group?: string;
  method?: string;
  name?: string;
  status?: string;
  load_zone?: string;
  [key: string]: string | undefined;
}

export interface V5MetricResult {
  metric: V5MetricLabels;
  values: Array<[number, string]>;
}

export interface V5QueryResponse {
  data: {
    result: V5MetricResult[];
    resultType?: string;
  };
  status?: string;
}

// ── Shared metric query constants ──

/**
 * Canonical v5 metric query definitions shared across tools.
 * Keeps aggregate (api.ts) and timeseries (get-metric-timeseries-tool.ts) queries in sync.
 */
export const V5_METRIC_QUERIES: Record<string, { metric: string; query: string }> = {
  p90: {
    metric: 'http_req_duration',
    query: 'histogram_quantile(0.90)by(scenario,name,group,method,status,load_zone)',
  },
  p95: {
    metric: 'http_req_duration',
    query: 'histogram_quantile(0.95)by(scenario,name,group,method,status,load_zone)',
  },
  rps: {
    metric: 'http_reqs',
    query: 'increase by(scenario,name,group,method,status,min,max,load_zone)',
  },
  error_rate: {
    metric: 'http_req_failed',
    query: 'rate',
  },
  vus: {
    metric: 'vus',
    query: 'sum(max by (instance_id))',
  },
};

export interface LoadTestApiModel {
  id: number;
  name: string;
  project_id: number;
  created: string;
  updated: string;
  baseline_test_run_id: number | null;
}

export interface TestRunApiModel {
  id: number;
  test_id: number;
  project_id: number;
  status: string;
  result: string | null;
  created: string;
  ended: string | null;
  started_by: string | null;
  note: string;
  cost: Record<string, unknown> | null;
  distribution: unknown[] | null;
  options: Record<string, unknown> | null;
  k6_dependencies: Record<string, string>;
  k6_versions: Record<string, string>;
  result_details: Record<string, unknown> | null;
  retention_expiry: string | null;
  status_details: {
    entered: string;
    type: string;
    extra?: Record<string, unknown> | null;
  };
  status_history: Array<{
    entered: string;
    type: string;
    extra?: Record<string, unknown> | null;
  }>;
}

// ── Tool input/output types ──

export interface ProjectInfo {
  projectId: string;
  projectName: string;
  accessible: boolean;
}

export interface LoadTestInfo {
  loadTestId: string;
  name: string;
  projectId: string;
  created: string;
  updated: string;
  baselineTestRunId: string | null;
}

export interface TestRunResult {
  testRunId: string;
  loadTestId: string;
  loadTestName: string;
  status: string;
  result: string | null;
  created: string;
  ended: string | null;
  startedBy: string | null;
  durationSeconds: number | null;
}

export interface ComparisonRow {
  metric: string;
  baseline: number | null;
  candidate: number | null;
  delta: number | null;
  deltaPct: number | null;
  verdict: 'improved' | 'regressed' | 'no_change' | 'data_unavailable';
}

export interface EndpointMetric {
  scenario: string;
  group: string;
  name: string;
  method: string;
  status: string;
  loadZone: string;
  p90?: number;
  p95?: number;
  rps?: number;
  errorRate?: number;
}

export interface ScenarioSummary {
  scenario: string;
  avgP90?: number;
  maxP90?: number;
  avgP95?: number;
  maxP95?: number;
  totalRps?: number;
  avgErrorRate?: number;
  endpointCount: number;
}

export interface TimeseriesDataPoint {
  timestamp: number;
  value: number;
}

export interface TimeseriesEntry {
  scenario: string;
  group: string;
  name: string;
  method: string;
  status: string;
  loadZone: string;
  dataPoints: TimeseriesDataPoint[];
}

// ── HTTP helpers ──

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface FetchOpts {
  method?: string;
  body?: unknown;
  params?: Record<string, string | number | undefined>;
}

/**
 * Core request function.
 * v3 paths use `Authorization: Token {key}`.
 * v5/v6 paths use `Authorization: Bearer {key}` + `X-Stack-Id`.
 */
async function request<T>(config: K6ClientConfig, path: string, opts: FetchOpts = {}): Promise<T> {
  const { method = 'GET', body, params } = opts;

  let urlStr: string;
  if (path.startsWith('/cloud/v5') && !params) {
    urlStr = `${config.baseUrl}${path}`;
  } else {
    const url = new URL(path, config.baseUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    urlStr = url.toString();
  }

  const isV6 = path.startsWith('/cloud/v6') || path.startsWith('/cloud/v5');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (isV6) {
    headers['Authorization'] = `Bearer ${config.token}`;
    if (config.stackId) {
      headers['X-Stack-Id'] = config.stackId;
    }
  } else {
    headers['Authorization'] = `Token ${config.token}`;
    if (config.orgId) {
      headers['X-K6-Organization'] = config.orgId;
    }
  }

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.maxRetries!; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS);
      await sleep(backoff);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const res = await fetch(urlStr, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.status === 401 || res.status === 403) {
        const text = await res.text().catch(() => '');
        throw new K6ApiError('AUTH_ERROR', `Authentication/permission error (${res.status})`, {
          status: res.status,
          body: text,
        });
      }
      if (res.status === 404) {
        const text = await res.text().catch(() => '');
        throw new K6ApiError('NOT_FOUND', `Resource not found (${res.status})`, {
          status: res.status,
          path,
          body: text,
        });
      }
      if (res.status === 429) {
        lastError = new K6ApiError('RATE_LIMITED', 'Rate limited by k6 API', {
          status: 429,
        });
        continue;
      }
      if (res.status >= 500) {
        lastError = new K6ApiError('SERVER_ERROR', `Server error (${res.status})`, {
          status: res.status,
        });
        continue;
      }

      if (res.status === 204) {
        return {} as T;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new K6ApiError('HTTP_ERROR', `Unexpected status ${res.status}`, {
          status: res.status,
          body: text,
        });
      }

      return (await res.json()) as T;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof K6ApiError && !['RATE_LIMITED', 'SERVER_ERROR'].includes(err.code)) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new K6ApiError('UNKNOWN', 'Request failed after retries');
}

// ── v5 OData URL builders ──

/**
 * Build the v5 aggregate query path
 */
export function buildV5AggregatePath(
  testRunId: string,
  metric: string,
  query: string,
  opts?: { start?: number; end?: number },
): string {
  let path = `/cloud/v5/test_runs/${testRunId}/query_aggregate_k6(metric='${metric}',query='${query}'`;
  if (opts?.start !== undefined && opts?.end !== undefined) {
    const startIso = new Date(opts.start * 1000).toISOString();
    const endIso = new Date(opts.end * 1000).toISOString();
    path += `,start=${startIso},end=${endIso}`;
  }
  path += `)`;
  return path;
}

/**
 * Build the v5 range query path
 */
export function buildV5RangePath(
  testRunId: string,
  metric: string,
  query: string,
  step: number,
  start: number,
  end: number,
): string {
  const startIso = new Date(start * 1000).toISOString();
  const endIso = new Date(end * 1000).toISOString();
  return `/cloud/v5/test_runs/${testRunId}/query_range_k6(metric='${metric}',query='${query}',step=${step},start=${startIso},end=${endIso})`;
}

/**
 * Validate a v5 OData path hasn't been accidentally URL-encoded
 */
export function assertV5PathIntegrity(path: string): void {
  const BAD_ENCODINGS = ['%2C', '%28', '%29', '%20', '%27'];
  for (const enc of BAD_ENCODINGS) {
    if (path.includes(enc) || path.includes(enc.toLowerCase())) {
      throw new K6ApiError(
        'V5_URL_ENCODING',
        `v5 OData path contains URL-encoded character '${enc}' which will cause a 400 error. Path: ${path}`,
      );
    }
  }
  const quotedDatetimeRe = /(?:start|end)='[^']*T[^']*'/;
  if (quotedDatetimeRe.test(path)) {
    throw new K6ApiError(
      'V5_DATETIME_QUOTED',
      `v5 OData path has a single-quoted datetime value. OData Edm.DateTimeOffset must NOT be quoted. Path: ${path}`,
    );
  }
}

/**
 * Validate that a v5 response has the expected shape
 */
export function assertV5ResponseShape(resp: unknown, caller: string): void {
  if (resp === null || resp === undefined || typeof resp !== 'object') {
    return;
  }
  const r = resp as Record<string, unknown>;
  if (!r.data || typeof r.data !== 'object') {
    return;
  }
  const data = r.data as Record<string, unknown>;
  if ('data' in data && typeof data.data === 'object' && data.data !== null) {
    const nested = data.data as Record<string, unknown>;
    if (Array.isArray(nested.result)) {
      throw new K6ApiError(
        'V5_RESPONSE_SHAPE',
        `${caller}: v5 response has nested data.data.result structure instead of data.result.`,
      );
    }
  }
}

// ── Public API ──

/**
 * k6 Cloud API client supporting v3, v5, and v6 endpoints
 */
export class K6Client {
  private config: K6ClientConfig;

  constructor(overrides?: Partial<K6ClientConfig>) {
    this.config = resolveConfig(overrides);
  }

  // ── v3 endpoints ──

  /** GET /v3/account/me */
  async getMe(): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(this.config, '/v3/account/me');
  }

  /** GET /v3/organizations */
  async getOrganizations(): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(this.config, '/v3/organizations');
  }

  /** GET /v3/organizations/{orgId}/projects */
  async listOrgProjects(orgId: string): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(this.config, `/v3/organizations/${orgId}/projects`);
  }

  /** GET /v3/projects/{id} */
  async getProject(projectId: string): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(this.config, `/v3/projects/${projectId}`);
  }

  /** List projects across all user orgs (v3) */
  async listAllProjects(): Promise<Array<Record<string, unknown>>> {
    const me = await this.getMe();
    const orgIds: number[] =
      (me as { user?: { organization_ids?: number[] } }).user?.organization_ids ?? [];
    const all: Array<Record<string, unknown>> = [];
    for (const orgId of orgIds) {
      try {
        const data = await this.listOrgProjects(String(orgId));
        const projects: unknown[] = (data as { projects?: unknown[] }).projects ?? [];
        for (const p of projects) {
          all.push(p as Record<string, unknown>);
        }
      } catch (err) {
        if (err instanceof K6ApiError && ['AUTH_ERROR', 'NOT_FOUND'].includes(err.code)) {
          continue; // expected: user may not have access to all orgs
        }
        throw err; // unexpected: don't silently eat network/server errors
      }
    }
    return all;
  }

  // ── v6 endpoints ──

  /** GET /cloud/v6/load_tests */
  async listLoadTests(opts?: {
    top?: number;
    skip?: number;
    orderby?: string;
    name?: string;
    count?: boolean;
  }): Promise<V6ListResponse<LoadTestApiModel>> {
    const params: Record<string, string | number | undefined> = {};
    if (opts?.top !== undefined) params['$top'] = opts.top;
    if (opts?.skip !== undefined) params['$skip'] = opts.skip;
    if (opts?.orderby) params['$orderby'] = opts.orderby;
    if (opts?.name) params['name'] = opts.name;
    if (opts?.count) params['$count'] = 'true';
    return request<V6ListResponse<LoadTestApiModel>>(this.config, '/cloud/v6/load_tests', {
      params,
    });
  }

  /** GET /cloud/v6/projects/{id}/load_tests */
  async listProjectLoadTests(
    projectId: string,
    opts?: {
      top?: number;
      skip?: number;
      orderby?: string;
      name?: string;
      count?: boolean;
    },
  ): Promise<V6ListResponse<LoadTestApiModel>> {
    const params: Record<string, string | number | undefined> = {};
    if (opts?.top !== undefined) params['$top'] = opts.top;
    if (opts?.skip !== undefined) params['$skip'] = opts.skip;
    if (opts?.orderby) params['$orderby'] = opts.orderby;
    if (opts?.name) params['name'] = opts.name;
    if (opts?.count) params['$count'] = 'true';
    return request<V6ListResponse<LoadTestApiModel>>(
      this.config,
      `/cloud/v6/projects/${projectId}/load_tests`,
      { params },
    );
  }

  /** GET /cloud/v6/load_tests/{id} */
  async getLoadTest(loadTestId: string): Promise<LoadTestApiModel> {
    return request<LoadTestApiModel>(this.config, `/cloud/v6/load_tests/${loadTestId}`);
  }

  /** GET /cloud/v6/load_tests/{id}/test_runs */
  async listLoadTestRuns(
    loadTestId: string,
    opts?: {
      top?: number;
      skip?: number;
      orderby?: string;
      count?: boolean;
    },
  ): Promise<V6ListResponse<TestRunApiModel>> {
    const params: Record<string, string | number | undefined> = {};
    if (opts?.top !== undefined) params['$top'] = opts.top;
    if (opts?.skip !== undefined) params['$skip'] = opts.skip;
    if (opts?.orderby) params['$orderby'] = opts.orderby;
    if (opts?.count) params['$count'] = 'true';
    return request<V6ListResponse<TestRunApiModel>>(
      this.config,
      `/cloud/v6/load_tests/${loadTestId}/test_runs`,
      { params },
    );
  }

  /** GET /cloud/v6/test_runs/{id} */
  async getTestRun(testRunId: string): Promise<TestRunApiModel> {
    return request<TestRunApiModel>(this.config, `/cloud/v6/test_runs/${testRunId}`);
  }

  // ── v5 endpoints (metrics) ──

  /** Query aggregate metrics for a test run */
  async queryAggregateK6(
    testRunId: string,
    metric: string,
    query: string,
    opts?: { start?: number; end?: number },
  ): Promise<V5QueryResponse> {
    const path = buildV5AggregatePath(testRunId, metric, query, opts);
    assertV5PathIntegrity(path);
    const resp = await request<V5QueryResponse>(this.config, path);
    assertV5ResponseShape(resp, 'queryAggregateK6');
    return resp;
  }

  /** Query time-series metrics for a test run */
  async queryRangeK6(
    testRunId: string,
    metric: string,
    query: string,
    step: number,
    start: number,
    end: number,
  ): Promise<V5QueryResponse> {
    const path = buildV5RangePath(testRunId, metric, query, step, start, end);
    assertV5PathIntegrity(path);
    const resp = await request<V5QueryResponse>(this.config, path);
    assertV5ResponseShape(resp, 'queryRangeK6');
    return resp;
  }

  /** Fetch all key aggregate metrics for a test run in one call */
  async getTestRunMetrics(
    testRunId: string,
    opts?: { start?: number; end?: number },
  ): Promise<{
    p90: V5MetricResult[];
    p95: V5MetricResult[];
    rps: V5MetricResult[];
    errorRate: V5MetricResult[];
    vus: V5MetricResult[];
  }> {
    const [p90Resp, p95Resp, rpsResp, errorRateResp, vusResp] = await Promise.all([
      this.queryAggregateK6(
        testRunId,
        V5_METRIC_QUERIES.p90.metric,
        V5_METRIC_QUERIES.p90.query,
        opts,
      ),
      this.queryAggregateK6(
        testRunId,
        V5_METRIC_QUERIES.p95.metric,
        V5_METRIC_QUERIES.p95.query,
        opts,
      ),
      this.queryAggregateK6(
        testRunId,
        V5_METRIC_QUERIES.rps.metric,
        V5_METRIC_QUERIES.rps.query,
        opts,
      ),
      this.queryAggregateK6(
        testRunId,
        V5_METRIC_QUERIES.error_rate.metric,
        V5_METRIC_QUERIES.error_rate.query,
      ),
      this.queryAggregateK6(testRunId, V5_METRIC_QUERIES.vus.metric, V5_METRIC_QUERIES.vus.query),
    ]);

    const extractResult = (resp: V5QueryResponse | undefined, label: string): V5MetricResult[] => {
      const result = resp?.data?.result;
      if (!result) {
        logWarn(
          `k6 getTestRunMetrics: missing data.result for '${label}' in test run ${testRunId}`,
        );
        return [];
      }
      return result;
    };

    return {
      p90: extractResult(p90Resp, 'p90'),
      p95: extractResult(p95Resp, 'p95'),
      rps: extractResult(rpsResp, 'rps'),
      errorRate: extractResult(errorRateResp, 'errorRate'),
      vus: extractResult(vusResp, 'vus'),
    };
  }
}
