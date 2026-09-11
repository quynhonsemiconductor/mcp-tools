import { beforeEach, describe, expect, it } from 'bun:test';
import { setupStandardMocks } from '../../test-utils/mocks';

const { setMockedEnvVar, mockFetch } = setupStandardMocks();

/** Shape of a single entry in the audit tool's parsed `metrics` array. */
interface ParsedAuditMetric {
  metric: string;
  rating: string;
  p75: number | null;
  dataAvailable: boolean;
}

const makeAuditRecord = (lcpP75: number, inpP75: number, clsP75: number) => ({
  key: { origin: 'https://example.com' },
  metrics: {
    largest_contentful_paint: {
      histogram: [
        { start: 0, end: 2500, density: 0.7 },
        { start: 2500, end: 4000, density: 0.2 },
        { start: 4000, density: 0.1 },
      ],
      percentiles: { p75: lcpP75 },
    },
    interaction_to_next_paint: {
      histogram: [
        { start: 0, end: 200, density: 0.8 },
        { start: 200, end: 500, density: 0.15 },
        { start: 500, density: 0.05 },
      ],
      percentiles: { p75: inpP75 },
    },
    cumulative_layout_shift: {
      histogram: [
        { start: '0.00', end: '0.10', density: 0.9 },
        { start: '0.10', end: '0.25', density: 0.07 },
        { start: '0.25', density: 0.03 },
      ],
      percentiles: { p75: String(clsP75) },
    },
    first_contentful_paint: {
      histogram: [
        { start: 0, end: 1800, density: 0.75 },
        { start: 1800, end: 3000, density: 0.15 },
        { start: 3000, density: 0.1 },
      ],
      percentiles: { p75: 1600 },
    },
    experimental_time_to_first_byte: {
      histogram: [
        { start: 0, end: 800, density: 0.8 },
        { start: 800, end: 1800, density: 0.15 },
        { start: 1800, density: 0.05 },
      ],
      percentiles: { p75: 600 },
    },
  },
  collectionPeriod: {
    firstDate: { year: 2024, month: 1, day: 1 },
    lastDate: { year: 2024, month: 1, day: 28 },
  },
});

describe('AuditCoreWebVitalsTool', () => {
  beforeEach(() => {
    setMockedEnvVar('GOOGLE_CRUX_API_KEY', 'test-key');
    mockFetch.mockClear();
  });

  it('rates a well-performing site as PASS', async () => {
    mockFetch.mockImplementation(
      async () =>
        new Response(JSON.stringify({ record: makeAuditRecord(2200, 150, 0.05) }), { status: 200 }),
    );

    const { AuditCoreWebVitalsTool } = await import('./audit-core-web-vitals-tool');
    const tool = new AuditCoreWebVitalsTool();
    const result = await tool.execute({ origin: 'https://example.com' });
    const parsed = JSON.parse(result);

    expect(parsed.overallStatus).toBe('PASS');
    expect(parsed.summary.good).toBe(5);
    expect(parsed.summary.poor).toBe(0);
  });

  it('rates a poorly-performing site as FAIL', async () => {
    mockFetch.mockImplementation(
      async () =>
        new Response(JSON.stringify({ record: makeAuditRecord(5000, 600, 0.3) }), { status: 200 }),
    );

    const { AuditCoreWebVitalsTool } = await import('./audit-core-web-vitals-tool');
    const tool = new AuditCoreWebVitalsTool();
    const result = await tool.execute({ origin: 'https://example.com' });
    const parsed = JSON.parse(result);

    expect(parsed.overallStatus).toBe('FAIL');
    const lcpMetric = parsed.metrics.find(
      (m: ParsedAuditMetric) => m.metric === 'largest_contentful_paint',
    );
    expect(lcpMetric.rating).toBe('poor');
    const inpMetric = parsed.metrics.find(
      (m: ParsedAuditMetric) => m.metric === 'interaction_to_next_paint',
    );
    expect(inpMetric.rating).toBe('poor');
  });

  it('applies correct thresholds for CLS (string p75)', async () => {
    mockFetch.mockImplementation(
      async () =>
        new Response(JSON.stringify({ record: makeAuditRecord(2200, 150, 0.15) }), { status: 200 }),
    );

    const { AuditCoreWebVitalsTool } = await import('./audit-core-web-vitals-tool');
    const tool = new AuditCoreWebVitalsTool();
    const result = await tool.execute({ origin: 'https://example.com' });
    const parsed = JSON.parse(result);

    const clsMetric = parsed.metrics.find(
      (m: ParsedAuditMetric) => m.metric === 'cumulative_layout_shift',
    );
    expect(clsMetric.rating).toBe('needs-improvement');
    // CLS p75 arrives from the API as a string ("0.15") — it must be
    // normalized to a number so the output type is consistent with other metrics.
    expect(typeof clsMetric.p75).toBe('number');
    expect(clsMetric.p75).toBe(0.15);
    expect(parsed.overallStatus).toBe('NEEDS IMPROVEMENT');
  });

  it('throws UserError when neither origin nor url provided', async () => {
    const { AuditCoreWebVitalsTool } = await import('./audit-core-web-vitals-tool');
    const tool = new AuditCoreWebVitalsTool();
    try {
      await tool.execute({});
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('Either "origin" or "url" must be provided');
    }
  });

  it('reports NO_DATA when the record has no metric data', async () => {
    mockFetch.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            record: {
              key: { origin: 'https://example.com' },
              metrics: {},
              collectionPeriod: {
                firstDate: { year: 2024, month: 1, day: 1 },
                lastDate: { year: 2024, month: 1, day: 28 },
              },
            },
          }),
          { status: 200 },
        ),
    );

    const { AuditCoreWebVitalsTool } = await import('./audit-core-web-vitals-tool');
    const tool = new AuditCoreWebVitalsTool();
    const result = await tool.execute({ origin: 'https://example.com' });
    const parsed = JSON.parse(result);

    expect(parsed.overallStatus).toBe('NO_DATA');
    expect(parsed.summary.noData).toBe(5);
    expect(parsed.summary.good).toBe(0);
  });

  it('reports NO_DATA (not PASS) when only supporting metrics have data', async () => {
    mockFetch.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            record: {
              key: { origin: 'https://example.com' },
              metrics: {
                first_contentful_paint: {
                  histogram: [{ start: 0, end: 1800, density: 1.0 }],
                  percentiles: { p75: 1500 },
                },
              },
              collectionPeriod: {
                firstDate: { year: 2024, month: 1, day: 1 },
                lastDate: { year: 2024, month: 1, day: 28 },
              },
            },
          }),
          { status: 200 },
        ),
    );

    const { AuditCoreWebVitalsTool } = await import('./audit-core-web-vitals-tool');
    const tool = new AuditCoreWebVitalsTool();
    const result = await tool.execute({ origin: 'https://example.com' });
    const parsed = JSON.parse(result);

    // FCP is present and good, but none of the 3 Core Web Vitals have data, so
    // the CWV verdict is unknowable — must report NO_DATA, never PASS.
    expect(parsed.overallStatus).toBe('NO_DATA');
    // The supporting metric is still surfaced in the metrics array.
    const fcp = parsed.metrics.find(
      (m: ParsedAuditMetric) => m.metric === 'first_contentful_paint',
    );
    expect(fcp.dataAvailable).toBe(true);
  });

  it('does not FAIL when only a supporting metric (TTFB) is poor', async () => {
    // All 3 Core Web Vitals are good; TTFB is poor. Google's official CWV
    // assessment passes, so the headline verdict should be PASS with TTFB
    // reported as a poor supporting diagnostic.
    const record = makeAuditRecord(2200, 150, 0.05);
    record.metrics.experimental_time_to_first_byte.percentiles.p75 = 3000;
    mockFetch.mockImplementation(
      async () => new Response(JSON.stringify({ record }), { status: 200 }),
    );

    const { AuditCoreWebVitalsTool } = await import('./audit-core-web-vitals-tool');
    const tool = new AuditCoreWebVitalsTool();
    const result = await tool.execute({ origin: 'https://example.com' });
    const parsed = JSON.parse(result);

    expect(parsed.overallStatus).toBe('PASS');
    const ttfb = parsed.metrics.find(
      (m: ParsedAuditMetric) => m.metric === 'experimental_time_to_first_byte',
    );
    expect(ttfb.rating).toBe('poor');
    expect(parsed.summary.poor).toBe(1);
  });

  it('reports NO_DATA when the origin is absent from the dataset (404)', async () => {
    // A genuinely absent origin surfaces from the API as a 404. The audit tool
    // catches it and emits a structured NO_DATA result rather than throwing.
    mockFetch.mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { message: 'Origin not in dataset' } }), {
          status: 404,
        }),
    );

    const { AuditCoreWebVitalsTool } = await import('./audit-core-web-vitals-tool');
    const tool = new AuditCoreWebVitalsTool();
    const result = await tool.execute({
      origin: 'https://not-in-dataset.example',
    });
    const parsed = JSON.parse(result);

    expect(parsed.overallStatus).toBe('NO_DATA');
    expect(parsed.target).toBe('https://not-in-dataset.example');
    expect(parsed.metrics).toEqual([]);
    expect(parsed.summary.noData).toBe(5);
    expect(parsed.message).toContain('Origin not in dataset');
  });
});
