import { beforeEach, describe, expect, it } from 'bun:test';
import { setupStandardMocks } from '../../test-utils/mocks';

const { setMockedEnvVar, mockFetch } = setupStandardMocks();

const makeMockRecord = (origin: string, lcp: number) => ({
  key: { origin },
  metrics: {
    largest_contentful_paint: {
      histogram: [
        { start: 0, end: 2500, density: 0.7 },
        { start: 2500, end: 4000, density: 0.2 },
        { start: 4000, density: 0.1 },
      ],
      percentiles: { p75: lcp },
    },
  },
  collectionPeriod: {
    firstDate: { year: 2024, month: 1, day: 1 },
    lastDate: { year: 2024, month: 1, day: 28 },
  },
});

describe('QueryCruxMetricsTool', () => {
  beforeEach(() => {
    setMockedEnvVar('GOOGLE_CRUX_API_KEY', 'test-key');
    mockFetch.mockClear();
    mockFetch.mockImplementation(
      async () =>
        new Response(JSON.stringify({ record: makeMockRecord('https://example.com', 2200) }), {
          status: 200,
        }),
    );
  });

  it('returns JSON with metric data for an origin query', async () => {
    const { QueryCruxMetricsTool } = await import('./query-metrics-tool');
    const tool = new QueryCruxMetricsTool();
    const result = await tool.execute({ origin: 'https://example.com' });
    const parsed = JSON.parse(result);
    expect(parsed.key.origin).toBe('https://example.com');
    expect(parsed.metrics.largest_contentful_paint.percentiles.p75).toBe(2200);
  });

  it('returns JSON for a URL query', async () => {
    mockFetch.mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({
            record: {
              key: { url: 'https://example.com/page' },
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

    const { QueryCruxMetricsTool } = await import('./query-metrics-tool');
    const tool = new QueryCruxMetricsTool();
    const result = await tool.execute({ url: 'https://example.com/page' });
    const parsed = JSON.parse(result);
    expect(parsed.key.url).toBe('https://example.com/page');
  });

  it('throws UserError when neither origin nor url provided', async () => {
    const { QueryCruxMetricsTool } = await import('./query-metrics-tool');
    const tool = new QueryCruxMetricsTool();
    try {
      await tool.execute({});
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('Either "origin" or "url" must be provided');
    }
  });

  it('throws UserError when both origin and url are provided', async () => {
    const { QueryCruxMetricsTool } = await import('./query-metrics-tool');
    const tool = new QueryCruxMetricsTool();
    try {
      await tool.execute({
        origin: 'https://example.com',
        url: 'https://example.com/page',
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('not both');
    }
  });
});
