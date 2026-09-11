import { afterEach, beforeEach, describe, expect, it, type Mock } from 'bun:test';
import { K6ApiError, K6Client } from './api';
import type { V5MetricResult } from './api';
import { CompareTestResultsTool } from './compare-test-results-tool';
import { GetMetricTimeseriesTool } from './get-metric-timeseries-tool';
import { GetScenarioResultsTool } from './get-scenario-results-tool';
import { GetTestMetricsTool } from './get-test-metrics-tool';
import { ListProjectLoadTestsTool } from './list-project-load-tests-tool';
import { ListUserProjectsTool } from './list-user-projects-tool';

// ── Shared helpers ──

/** Minimal fetch Response stand-in used by every mock implementation below. */
interface MockFetchResponse {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text: () => Promise<string>;
  headers: Headers;
}

// The k6 client (api.ts) always calls fetch() with a plain string URL and a
// headers record, so the mock implementations below only need to handle that
// shape rather than the full fetch() signature.
type MockFetchFn = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<MockFetchResponse>;

/**
 * Resolve the current global.fetch mock fresh on every call rather than caching
 * it. Other test files (loaded in the same bun test process) call
 * setupStandardMocks() again at module scope, which reassigns global.fetch to a
 * new mock instance — caching a reference to the old one would silently stop
 * configuring the fetch calls the tools under test actually make.
 */
function fetchMock(): Mock<MockFetchFn> {
  return global.fetch as unknown as Mock<MockFetchFn>;
}

/** Build a minimal v6 test run response */
function makeTestRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 100,
    test_id: 10,
    project_id: 1,
    status: 'finished',
    result: 'passed',
    created: '2025-01-01T00:00:00Z',
    ended: '2025-01-01T01:00:00Z',
    started_by: 'user@test.com',
    note: '',
    cost: null,
    distribution: null,
    options: null,
    k6_dependencies: {},
    k6_versions: {},
    result_details: null,
    retention_expiry: null,
    status_details: { entered: '2025-01-01T01:00:00Z', type: 'finished' },
    status_history: [],
    ...overrides,
  };
}

/** Build a minimal v5 query response */
function makeV5Response(
  results: Array<{ metric: Record<string, string>; values: Array<[number, string]> }> = [],
) {
  return { data: { result: results, resultType: 'vector' }, status: 'success' };
}

/**
 * Set up fetch to return different responses based on URL patterns.
 * Routes are checked in order; first match wins. Unmatched URLs return empty JSON.
 */
function setupFetchRoutes(routes: Array<{ pattern: string | RegExp; response: unknown }>) {
  fetchMock().mockImplementation((url: string | URL) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    for (const route of routes) {
      const matches =
        typeof route.pattern === 'string'
          ? urlStr.includes(route.pattern)
          : route.pattern.test(urlStr);
      if (matches) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(route.response),
          text: () => Promise.resolve(JSON.stringify(route.response)),
          headers: new Headers(),
        });
      }
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('{}'),
      headers: new Headers(),
    });
  });
}

/** Set up fetch to always return a 401 */
function setupFetchAuthError() {
  fetchMock().mockImplementation(() =>
    Promise.resolve({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Unauthorized' }),
      text: () => Promise.resolve('Unauthorized'),
      headers: new Headers(),
    }),
  );
}

// ── env is mocked by the global test preload; GRAFANA_K6_TOKEN must be set ──
import env from '../../env';

beforeEach(() => {
  env.GRAFANA_K6_TOKEN = 'test-k6-token';
  env.GRAFANA_K6_BASE_URL = 'https://api.k6.io';
  env.GRAFANA_K6_STACK_ID = 'stack-123';
  env.GRAFANA_K6_ORG_ID = undefined;
  fetchMock().mockReset();
});

afterEach(() => {
  fetchMock().mockReset();
});

// ────────────────────────────────────────────────────────────────────────────
// ListUserProjectsTool
// ────────────────────────────────────────────────────────────────────────────
describe('ListUserProjectsTool.execute', () => {
  it('should return authenticated user and project list', async () => {
    setupFetchRoutes([
      {
        pattern: '/v3/account/me',
        response: { user: { email: 'test@example.com', organization_ids: [1] } },
      },
      {
        pattern: '/v6/load_tests',
        response: { value: [{ id: 1, name: 'LT1' }] },
      },
      {
        pattern: '/v3/organizations/1/projects',
        response: { projects: [{ id: 10, name: 'Project A' }] },
      },
      {
        pattern: '/v3/projects/10',
        response: { id: 10, name: 'Project A' },
      },
    ]);

    const tool = new ListUserProjectsTool();
    const result = JSON.parse(await tool.execute({}));

    expect(result.authenticatedUser).toBe('test@example.com');
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].projectId).toBe('10');
    expect(result.projects[0].accessible).toBe(true);
    expect(result.summary.totalProjects).toBe(1);
  });

  it('should throw when token is missing', async () => {
    env.GRAFANA_K6_TOKEN = '';
    try {
      const tool = new ListUserProjectsTool();
      await tool.execute({});
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('GRAFANA_K6_TOKEN');
    }
  });

  it('should mark projects as inaccessible on 404', async () => {
    setupFetchRoutes([
      {
        pattern: '/v3/account/me',
        response: { user: { email: 'u@t.com', organization_ids: [1] } },
      },
      {
        pattern: '/v3/organizations/1/projects',
        response: { projects: [{ id: 99, name: 'Locked' }] },
      },
    ]);

    // Override for project detail to return 404
    const originalImpl = fetchMock().getMockImplementation() as (
      url: string,
    ) => Promise<MockFetchResponse>;
    fetchMock().mockImplementation((url: string) => {
      if (url.includes('/v3/projects/99')) {
        return Promise.resolve({
          ok: false,
          status: 404,
          text: () => Promise.resolve('Not Found'),
          headers: new Headers(),
        });
      }
      if (url.includes('/v6/load_tests')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ value: [] }),
          text: () => Promise.resolve(''),
          headers: new Headers(),
        });
      }
      return originalImpl(url);
    });

    const tool = new ListUserProjectsTool();
    const result = JSON.parse(await tool.execute({}));

    expect(result.projects[0].accessible).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// ListProjectLoadTestsTool
// ────────────────────────────────────────────────────────────────────────────
describe('ListProjectLoadTestsTool.execute', () => {
  it('should list load tests by project ID', async () => {
    setupFetchRoutes([
      {
        pattern: '/v6/projects/42/load_tests',
        response: {
          value: [
            {
              id: 1,
              name: 'Login Flow',
              project_id: 42,
              created: '2025-01-01',
              updated: '2025-01-02',
              baseline_test_run_id: null,
            },
            {
              id: 2,
              name: 'API Tests',
              project_id: 42,
              created: '2025-01-03',
              updated: '2025-01-04',
              baseline_test_run_id: 100,
            },
          ],
        },
      },
    ]);

    const tool = new ListProjectLoadTestsTool();
    const result = JSON.parse(await tool.execute({ projectId: '42' }));

    expect(result.projectId).toBe('42');
    expect(result.loadTests).toHaveLength(2);
    expect(result.loadTests[0].name).toBe('Login Flow');
    expect(result.loadTests[1].baselineTestRunId).toBe('100');
    expect(result.summary.totalLoadTests).toBe(2);
  });

  it('should resolve project by name', async () => {
    setupFetchRoutes([
      {
        pattern: '/v3/account/me',
        response: { user: { email: 'u@t.com', organization_ids: [1] } },
      },
      {
        pattern: '/v3/organizations/1/projects',
        response: { projects: [{ id: 55, name: 'My Project' }] },
      },
      {
        pattern: '/v6/projects/55/load_tests',
        response: { value: [] },
      },
    ]);

    const tool = new ListProjectLoadTestsTool();
    const result = JSON.parse(await tool.execute({ projectName: 'my project' }));

    expect(result.projectId).toBe('55');
    expect(result.loadTests).toHaveLength(0);
  });

  it('should throw when neither projectId nor projectName given', async () => {
    const tool = new ListProjectLoadTestsTool();
    try {
      await tool.execute({});
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('projectId');
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GetScenarioResultsTool
// ────────────────────────────────────────────────────────────────────────────
describe('GetScenarioResultsTool.execute', () => {
  it('should fetch a specific test run by ID', async () => {
    const run = makeTestRun({ id: 200, test_id: 10 });
    setupFetchRoutes([{ pattern: '/v6/test_runs/200', response: run }]);

    const tool = new GetScenarioResultsTool();
    const result = JSON.parse(
      await tool.execute({
        projectId: '1',
        scenarioName: 'Login',
        testRunId: '200',
      }),
    );

    expect(result.results).toHaveLength(1);
    expect(result.results[0].testRunId).toBe('200');
    expect(result.results[0].status).toBe('finished');
    expect(result.summary.totalRecords).toBe(1);
  });

  it('should list recent runs by scenario name', async () => {
    const run1 = makeTestRun({ id: 301 });
    const run2 = makeTestRun({ id: 302 });

    setupFetchRoutes([
      {
        pattern: '/v6/projects/1/load_tests',
        response: { value: [{ id: 10, name: 'Login Flow' }] },
      },
      {
        pattern: '/v6/load_tests/10/test_runs',
        response: { value: [run1, run2] },
      },
    ]);

    const tool = new GetScenarioResultsTool();
    const result = JSON.parse(
      await tool.execute({
        projectId: '1',
        scenarioName: 'Login Flow',
      }),
    );

    expect(result.results).toHaveLength(2);
    expect(result.summary.loadTestId).toBe('10');
  });

  it('should return empty results when no matching load test found', async () => {
    setupFetchRoutes([
      {
        pattern: '/v6/projects/1/load_tests',
        response: { value: [] },
      },
    ]);

    const tool = new GetScenarioResultsTool();
    const result = JSON.parse(
      await tool.execute({
        projectId: '1',
        scenarioName: 'NonexistentTest',
      }),
    );

    expect(result.results).toHaveLength(0);
    expect(result.summary.totalRecords).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GetTestMetricsTool
// ────────────────────────────────────────────────────────────────────────────
describe('GetTestMetricsTool.execute', () => {
  it('should fetch metrics for a test run', async () => {
    const run = makeTestRun({ id: 100 });
    const v5Result: { metric: Record<string, string>; values: Array<[number, string]> } = {
      metric: {
        __name__: 'http_req_duration',
        test_run_id: '100',
        scenario: 'default',
        name: '/api/login',
        method: 'POST',
        status: '200',
        group: '',
        load_zone: '',
      },
      values: [[1700000000, '150.5']],
    };

    setupFetchRoutes([
      { pattern: '/v6/test_runs/100', response: run },
      { pattern: '/v5/', response: makeV5Response([v5Result]) },
    ]);

    const tool = new GetTestMetricsTool();
    const result = JSON.parse(await tool.execute({ testRunId: '100' }));

    expect(result.testRunId).toBe('100');
    expect(result.status).toBe('finished');
    expect(result.endpointMetrics.length).toBeGreaterThanOrEqual(0);
    expect(result.summary).toBeDefined();
    expect(result.summary.totalEndpoints).toBeDefined();
  });

  it('should respect metrics filter', async () => {
    const run = makeTestRun({ id: 100 });

    setupFetchRoutes([
      { pattern: '/v6/test_runs/100', response: run },
      { pattern: '/v5/', response: makeV5Response([]) },
    ]);

    const tool = new GetTestMetricsTool();
    const result = JSON.parse(
      await tool.execute({
        testRunId: '100',
        metrics: ['p90'],
      }),
    );

    expect(result.endpointMetrics).toEqual([]);
    expect(result.summary.totalEndpoints).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GetMetricTimeseriesTool
// ────────────────────────────────────────────────────────────────────────────
describe('GetMetricTimeseriesTool.execute', () => {
  it('should fetch timeseries data for a metric', async () => {
    const run = makeTestRun({ id: 100 });
    const v5Range = makeV5Response([
      {
        metric: {
          __name__: 'http_req_duration',
          test_run_id: '100',
          scenario: 'default',
          name: '/api',
          method: 'GET',
          status: '200',
          group: '',
          load_zone: '',
        },
        values: [
          [1700000000, '100.0'],
          [1700000010, '110.0'],
          [1700000020, '105.0'],
        ],
      },
    ]);

    setupFetchRoutes([
      { pattern: '/v6/test_runs/100', response: run },
      { pattern: '/v5/', response: v5Range },
    ]);

    const tool = new GetMetricTimeseriesTool();
    const result = JSON.parse(
      await tool.execute({
        testRunId: '100',
        metric: 'p90',
      }),
    );

    expect(result.testRunId).toBe('100');
    expect(result.metric).toBe('p90');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].dataPoints).toHaveLength(3);
    expect(result.summary.totalDataPoints).toBe(3);
  });

  it('should use provided start/end timestamps', async () => {
    setupFetchRoutes([{ pattern: '/v5/', response: makeV5Response([]) }]);

    const tool = new GetMetricTimeseriesTool();
    const result = JSON.parse(
      await tool.execute({
        testRunId: '100',
        metric: 'rps',
        start: 1700000000,
        end: 1700003600,
        step: 30,
      }),
    );

    expect(result.step).toBe(30);
    expect(result.entries).toHaveLength(0);
    expect(result.summary.totalDataPoints).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// CompareTestResultsTool
// ────────────────────────────────────────────────────────────────────────────
describe('CompareTestResultsTool.execute', () => {
  it('should compare two test runs', async () => {
    const baseRun = makeTestRun({ id: 100, result: 'passed' });
    const candRun = makeTestRun({ id: 200, result: 'passed' });
    const v5Result = (
      val: string,
    ): { metric: Record<string, string>; values: Array<[number, string]> } => ({
      metric: {
        __name__: 'http_req_duration',
        test_run_id: '100',
        scenario: 'default',
        name: '',
        method: '',
        status: '',
        group: '',
        load_zone: '',
      },
      values: [[1700000000, val]],
    });

    setupFetchRoutes([
      { pattern: '/v6/test_runs/100', response: baseRun },
      { pattern: '/v6/test_runs/200', response: candRun },
      { pattern: '/v5/', response: makeV5Response([v5Result('150.0')]) },
    ]);

    const tool = new CompareTestResultsTool();
    const result = JSON.parse(
      await tool.execute({
        baselineRunId: '100',
        candidateRunId: '200',
        metrics: ['duration_seconds', 'result'],
      }),
    );

    expect(result.baselineRunId).toBe('100');
    expect(result.candidateRunId).toBe('200');
    expect(result.overallVerdict).toBeDefined();
    expect(result.comparison).toBeInstanceOf(Array);
  });

  it('should detect regression when candidate metrics are worse', async () => {
    const baseRun = makeTestRun({ id: 100, result: 'passed' });
    const candRun = makeTestRun({ id: 200, result: 'failed' });

    setupFetchRoutes([
      { pattern: '/v6/test_runs/100', response: baseRun },
      { pattern: '/v6/test_runs/200', response: candRun },
    ]);

    const tool = new CompareTestResultsTool();
    const result = JSON.parse(
      await tool.execute({
        baselineRunId: '100',
        candidateRunId: '200',
        metrics: ['result'],
      }),
    );

    const resultRow = result.comparison.find((r: { metric: string }) => r.metric === 'result');
    expect(resultRow).toBeDefined();
    expect(resultRow.baseline).toBe(1);
    expect(resultRow.candidate).toBe(0);
  });

  it('should include v5 metrics when requested', async () => {
    const baseRun = makeTestRun({ id: 100 });
    const candRun = makeTestRun({ id: 200 });

    setupFetchRoutes([
      { pattern: '/v6/test_runs/100', response: baseRun },
      { pattern: '/v6/test_runs/200', response: candRun },
      { pattern: '/v5/', response: makeV5Response([]) },
    ]);

    const tool = new CompareTestResultsTool();
    const result = JSON.parse(
      await tool.execute({
        baselineRunId: '100',
        candidateRunId: '200',
        metrics: ['p90_max', 'total_rps'],
      }),
    );

    expect(result.overallVerdict).toBeDefined();
    expect(result.highlights).toBeInstanceOf(Array);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// K6Client.request – auth header and error handling
// ────────────────────────────────────────────────────────────────────────────
describe('K6Client – request behaviour', () => {
  it('should use Token auth for v3 endpoints', async () => {
    let capturedHeaders: Record<string, string> = {};
    fetchMock().mockImplementation((_url: string, opts?: { headers?: Record<string, string> }) => {
      capturedHeaders = opts?.headers ?? {};
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ user: { email: 'test@t.com' } }),
        text: () => Promise.resolve('{}'),
        headers: new Headers(),
      });
    });

    const client = new K6Client();
    await client.getMe();

    expect(capturedHeaders['Authorization']).toBe('Token test-k6-token');
  });

  it('should use Bearer auth for v6 endpoints', async () => {
    let capturedHeaders: Record<string, string> = {};
    fetchMock().mockImplementation((_url: string, opts?: { headers?: Record<string, string> }) => {
      capturedHeaders = opts?.headers ?? {};
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 1,
            test_id: 1,
            project_id: 1,
            status: 'finished',
            result: 'passed',
            created: '2025-01-01T00:00:00Z',
            ended: '2025-01-01T01:00:00Z',
            started_by: null,
            note: '',
            cost: null,
            distribution: null,
            options: null,
            k6_dependencies: {},
            k6_versions: {},
            result_details: null,
            retention_expiry: null,
            status_details: { entered: '', type: '' },
            status_history: [],
          }),
        text: () => Promise.resolve('{}'),
        headers: new Headers(),
      });
    });

    const client = new K6Client();
    await client.getTestRun('1');

    expect(capturedHeaders['Authorization']).toBe('Bearer test-k6-token');
    expect(capturedHeaders['X-Stack-Id']).toBe('stack-123');
  });

  it('should throw K6ApiError AUTH_ERROR on 401', async () => {
    setupFetchAuthError();
    const client = new K6Client();
    try {
      await client.getMe();
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(K6ApiError);
      expect((err as K6ApiError).code).toBe('AUTH_ERROR');
    }
  });

  it('should throw K6ApiError NOT_FOUND on 404', async () => {
    fetchMock().mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
        headers: new Headers(),
      }),
    );
    const client = new K6Client();
    try {
      await client.getProject('nonexistent');
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(K6ApiError);
      expect((err as K6ApiError).code).toBe('NOT_FOUND');
    }
  });

  it('listAllProjects should rethrow non-auth errors', async () => {
    fetchMock().mockImplementation((url: string) => {
      if (url.includes('/v3/account/me')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ user: { organization_ids: [1] } }),
          text: () => Promise.resolve('{}'),
          headers: new Headers(),
        });
      }
      if (url.includes('/v3/organizations/1/projects')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error'),
          headers: new Headers(),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('{}'),
        headers: new Headers(),
      });
    });

    const client = new K6Client({ maxRetries: 0 });
    try {
      await client.listAllProjects();
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(K6ApiError);
      expect((err as K6ApiError).code).toBe('SERVER_ERROR');
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// K6Client.getTestRunMetrics – per-metric query verification
// ────────────────────────────────────────────────────────────────────────────
describe('K6Client.getTestRunMetrics', () => {
  it('should send distinct queries for each metric type', async () => {
    const capturedUrls: string[] = [];
    fetchMock().mockImplementation((url: string) => {
      capturedUrls.push(url);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ data: { result: [], resultType: 'vector' }, status: 'success' }),
        text: () => Promise.resolve('{}'),
        headers: new Headers(),
      });
    });

    const client = new K6Client();
    await client.getTestRunMetrics('42');

    const v5Urls = capturedUrls.filter((u) => u.includes('/v5/'));
    expect(v5Urls.length).toBe(5);
    expect(v5Urls.some((u) => u.includes('histogram_quantile(0.90)'))).toBe(true);
    expect(v5Urls.some((u) => u.includes('histogram_quantile(0.95)'))).toBe(true);
    expect(v5Urls.some((u) => u.includes('http_reqs'))).toBe(true);
    expect(v5Urls.some((u) => u.includes('http_req_failed'))).toBe(true);
    expect(v5Urls.some((u) => u.includes("metric='vus'"))).toBe(true);
  });

  it('should return per-metric results with specific v5 URL matching', async () => {
    const p90Result: V5MetricResult = {
      metric: { __name__: 'http_req_duration', test_run_id: '42', scenario: 'default' },
      values: [[1700000000, '120.5']],
    };
    const rpsResult: V5MetricResult = {
      metric: { __name__: 'http_reqs', test_run_id: '42', scenario: 'default' },
      values: [[1700000000, '5000']],
    };

    fetchMock().mockImplementation((url: string) => {
      let result: V5MetricResult[] = [];
      if (url.includes('histogram_quantile(0.90)')) {
        result = [p90Result];
      } else if (url.includes('http_reqs') && url.includes('increase')) {
        result = [rpsResult];
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: { result, resultType: 'vector' }, status: 'success' }),
        text: () => Promise.resolve('{}'),
        headers: new Headers(),
      });
    });

    const client = new K6Client();
    const metrics = await client.getTestRunMetrics('42');

    expect(metrics.p90).toHaveLength(1);
    expect(metrics.p90[0].values[0][1]).toBe('120.5');
    expect(metrics.rps).toHaveLength(1);
    expect(metrics.rps[0].values[0][1]).toBe('5000');
    expect(metrics.p95).toHaveLength(0);
    expect(metrics.errorRate).toHaveLength(0);
  });
});
