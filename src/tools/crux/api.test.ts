import { beforeEach, describe, expect, it } from 'bun:test';
import { setupStandardMocks } from '../../test-utils/mocks';

const { setMockedEnvVar, mockFetch } = setupStandardMocks();

const MOCK_RECORD = {
  key: { origin: 'https://example.com' },
  metrics: {
    largest_contentful_paint: {
      histogram: [
        { start: 0, end: 2500, density: 0.75 },
        { start: 2500, end: 4000, density: 0.15 },
        { start: 4000, density: 0.1 },
      ],
      percentiles: { p75: 2200 },
    },
  },
  collectionPeriod: {
    firstDate: { year: 2024, month: 1, day: 1 },
    lastDate: { year: 2024, month: 1, day: 28 },
  },
};

const MOCK_HISTORY_RECORD = {
  key: { origin: 'https://example.com' },
  metrics: {
    largest_contentful_paint: {
      histogramTimeseries: [
        { start: 0, end: 2500, densities: [0.75, 0.76] },
        { start: 2500, end: 4000, densities: [0.15, 0.14] },
        { start: 4000, densities: [0.1, 0.1] },
      ],
      percentilesTimeseries: { p75s: [2200, 2150] },
    },
  },
  collectionPeriods: [
    { firstDate: { year: 2024, month: 1, day: 1 }, lastDate: { year: 2024, month: 1, day: 28 } },
    { firstDate: { year: 2024, month: 1, day: 8 }, lastDate: { year: 2024, month: 2, day: 4 } },
  ],
};

describe('CrUX API client', () => {
  beforeEach(() => {
    setMockedEnvVar('GOOGLE_CRUX_API_KEY', 'test-api-key');
    mockFetch.mockClear();
    mockFetch.mockImplementation(async (url: string, _opts?: RequestInit) => {
      if (url.includes('queryRecord') && !url.includes('queryHistoryRecord')) {
        return new Response(JSON.stringify({ record: MOCK_RECORD }), { status: 200 });
      }
      if (url.includes('queryHistoryRecord')) {
        return new Response(JSON.stringify({ record: MOCK_HISTORY_RECORD }), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    });
  });

  describe('queryRecord', () => {
    it('returns record for origin query', async () => {
      const { queryRecord } = await import('./api');
      const record = await queryRecord({ origin: 'https://example.com' });
      expect(record.key.origin).toBe('https://example.com');
      expect(record.metrics.largest_contentful_paint.percentiles?.p75).toBe(2200);
    });

    it('sends formFactor in request body', async () => {
      const { queryRecord } = await import('./api');
      const record = await queryRecord({
        origin: 'https://example.com',
        formFactor: 'PHONE',
      });
      expect(record).toBeDefined();
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string);
      expect(body.formFactor).toBe('PHONE');
    });

    it('sends the API key via the x-goog-api-key header, not the URL', async () => {
      const { queryRecord } = await import('./api');
      await queryRecord({ origin: 'https://example.com' });
      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers['x-goog-api-key']).toBe('test-api-key');
      // The key must not leak into the URL query string.
      expect(url).not.toContain('key=');
      expect(url).not.toContain('test-api-key');
    });

    it('throws CrUXApiError on API error response', async () => {
      mockFetch.mockImplementation(
        async () =>
          new Response(JSON.stringify({ error: { message: 'Origin not in dataset' } }), {
            status: 404,
          }),
      );

      const { queryRecord, CrUXApiError } = await import('./api');
      try {
        await queryRecord({ origin: 'https://not-in-dataset.example' });
        expect(true).toBe(false); // should not reach
      } catch (err) {
        expect(err).toBeInstanceOf(CrUXApiError);
        expect((err as InstanceType<typeof CrUXApiError>).message).toContain(
          'Origin not in dataset',
        );
      }
    });

    it('falls back to "HTTP {status}" when the error body is not JSON', async () => {
      mockFetch.mockImplementation(async () => new Response('upstream exploded', { status: 500 }));

      const { queryRecord, CrUXApiError } = await import('./api');
      try {
        await queryRecord({ origin: 'https://example.com' });
        expect(true).toBe(false); // should not reach
      } catch (err) {
        expect(err).toBeInstanceOf(CrUXApiError);
        const apiErr = err as InstanceType<typeof CrUXApiError>;
        expect(apiErr.statusCode).toBe(500);
        expect(apiErr.message).toContain('HTTP 500');
      }
    });
  });

  describe('queryHistoryRecord', () => {
    it('returns history record with timeseries data', async () => {
      const { queryHistoryRecord } = await import('./api');
      const record = await queryHistoryRecord({ origin: 'https://example.com' });
      expect(record.collectionPeriods).toHaveLength(2);
      const lcp = record.metrics.largest_contentful_paint;
      expect(lcp.percentilesTimeseries?.p75s).toEqual([2200, 2150]);
    });

    it('sends collectionPeriodCount in request body', async () => {
      const { queryHistoryRecord } = await import('./api');
      await queryHistoryRecord({
        origin: 'https://example.com',
        collectionPeriodCount: 10,
      });
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string);
      expect(body.collectionPeriodCount).toBe(10);
    });

    it('throws CrUXApiError(404) when the API returns 200 with a null record', async () => {
      mockFetch.mockImplementation(
        async () => new Response(JSON.stringify({ record: null }), { status: 200 }),
      );

      const { queryHistoryRecord, CrUXApiError } = await import('./api');
      try {
        await queryHistoryRecord({ origin: 'https://example.com' });
        expect(true).toBe(false); // should not reach
      } catch (err) {
        expect(err).toBeInstanceOf(CrUXApiError);
        const apiErr = err as InstanceType<typeof CrUXApiError>;
        expect(apiErr.statusCode).toBe(404);
        expect(apiErr.message).toContain('No CrUX data available');
      }
    });
  });
});

describe('CrUX API client - missing key', () => {
  it('throws UserError when GOOGLE_CRUX_API_KEY is not set', async () => {
    setMockedEnvVar('GOOGLE_CRUX_API_KEY', null);

    // Re-import to pick up new mock
    const mod = await import('./api');
    try {
      await mod.queryRecord({ origin: 'https://example.com' });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('GOOGLE_CRUX_API_KEY');
    }
  });
});
