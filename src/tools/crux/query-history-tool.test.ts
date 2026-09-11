import { beforeEach, describe, expect, it } from 'bun:test';
import { setupStandardMocks } from '../../test-utils/mocks';

const { setMockedEnvVar, mockFetch } = setupStandardMocks();

const makeHistoryRecord = (origin: string) => ({
  key: { origin },
  metrics: {
    largest_contentful_paint: {
      histogramTimeseries: [
        { start: 0, end: 2500, densities: [0.75, 0.76, 0.74] },
        { start: 2500, end: 4000, densities: [0.15, 0.14, 0.16] },
        { start: 4000, densities: [0.1, 0.1, 0.1] },
      ],
      percentilesTimeseries: { p75s: [2200, 2150, 2180] },
    },
  },
  collectionPeriods: [
    { firstDate: { year: 2024, month: 1, day: 1 }, lastDate: { year: 2024, month: 1, day: 28 } },
    { firstDate: { year: 2024, month: 1, day: 8 }, lastDate: { year: 2024, month: 2, day: 4 } },
    { firstDate: { year: 2024, month: 1, day: 15 }, lastDate: { year: 2024, month: 2, day: 11 } },
  ],
});

describe('QueryCruxHistoryTool', () => {
  beforeEach(() => {
    setMockedEnvVar('GOOGLE_CRUX_API_KEY', 'test-key');
    mockFetch.mockClear();
    mockFetch.mockImplementation(
      async () =>
        new Response(JSON.stringify({ record: makeHistoryRecord('https://example.com') }), {
          status: 200,
        }),
    );
  });

  it('returns timeseries data for an origin', async () => {
    const { QueryCruxHistoryTool } = await import('./query-history-tool');
    const tool = new QueryCruxHistoryTool();
    const result = await tool.execute({ origin: 'https://example.com' });
    const parsed = JSON.parse(result);
    expect(parsed.collectionPeriods).toHaveLength(3);
    expect(parsed.metrics.largest_contentful_paint.percentilesTimeseries.p75s).toEqual([
      2200, 2150, 2180,
    ]);
  });

  it('passes collectionPeriodCount to the API', async () => {
    const { QueryCruxHistoryTool } = await import('./query-history-tool');
    const tool = new QueryCruxHistoryTool();
    await tool.execute({ origin: 'https://example.com', collectionPeriodCount: 5 });
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body.collectionPeriodCount).toBe(5);
  });

  it('throws UserError when neither origin nor url provided', async () => {
    const { QueryCruxHistoryTool } = await import('./query-history-tool');
    const tool = new QueryCruxHistoryTool();
    try {
      await tool.execute({});
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('Either "origin" or "url" must be provided');
    }
  });

  it('handles NaN densities in ineligible periods gracefully', async () => {
    mockFetch.mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({
            record: {
              key: { origin: 'https://new-site.com' },
              metrics: {
                largest_contentful_paint: {
                  histogramTimeseries: [
                    { start: 0, end: 2500, densities: ['NaN', 0.75] },
                    { start: 2500, end: 4000, densities: ['NaN', 0.15] },
                    { start: 4000, densities: ['NaN', 0.1] },
                  ],
                  percentilesTimeseries: { p75s: [null, 2200] },
                },
              },
              collectionPeriods: [
                {
                  firstDate: { year: 2024, month: 1, day: 1 },
                  lastDate: { year: 2024, month: 1, day: 28 },
                },
                {
                  firstDate: { year: 2024, month: 1, day: 8 },
                  lastDate: { year: 2024, month: 2, day: 4 },
                },
              ],
            },
          }),
          { status: 200 },
        ),
    );

    const { QueryCruxHistoryTool } = await import('./query-history-tool');
    const tool = new QueryCruxHistoryTool();
    const result = await tool.execute({ origin: 'https://new-site.com' });
    const parsed = JSON.parse(result);
    // Should return data without throwing
    expect(parsed.collectionPeriods).toHaveLength(2);
    expect(parsed.metrics.largest_contentful_paint.percentilesTimeseries.p75s[0]).toBeNull();
  });
});
