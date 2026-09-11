import { beforeEach, describe, expect, it } from 'bun:test';
import { setupStandardMocks } from '../../test-utils/mocks';

const { setMockedEnvVar, mockFetch } = setupStandardMocks();

interface CruxRequestBody {
  origin?: string;
  url?: string;
}

interface ParsedComparisonValue {
  target: string;
  p75: number | null;
  rating: string;
  error: string | null;
}

interface ParsedComparisonRow {
  metric: string;
  values: ParsedComparisonValue[];
}

const makeRecord = (target: string, lcp: number, isOrigin = true) => ({
  key: isOrigin ? { origin: target } : { url: target },
  metrics: {
    largest_contentful_paint: { percentiles: { p75: lcp } },
    interaction_to_next_paint: { percentiles: { p75: 180 } },
    cumulative_layout_shift: { percentiles: { p75: '0.05' } },
    first_contentful_paint: { percentiles: { p75: 1500 } },
    experimental_time_to_first_byte: { percentiles: { p75: 600 } },
  },
  collectionPeriod: {
    firstDate: { year: 2024, month: 1, day: 1 },
    lastDate: { year: 2024, month: 1, day: 28 },
  },
});

describe('CompareOriginsTool', () => {
  beforeEach(() => {
    setMockedEnvVar('GOOGLE_CRUX_API_KEY', 'test-key');
    mockFetch.mockClear();
    mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
      const body = JSON.parse((opts?.body as string) ?? '{}');
      const target = body.origin ?? body.url;
      const lcp = target?.includes('fast') ? 1800 : 3500;
      return new Response(JSON.stringify({ record: makeRecord(target, lcp) }), {
        status: 200,
      });
    });
  });

  it('returns a comparison for 2 origins', async () => {
    const { CompareOriginsTool } = await import('./compare-origins-tool');
    const tool = new CompareOriginsTool();
    const result = await tool.execute({
      targets: ['https://fast.example.com', 'https://slow.example.com'],
    });
    const parsed = JSON.parse(result);
    expect(parsed.targets).toHaveLength(2);
    expect(parsed.comparison).toBeDefined();
    const lcpRow = parsed.comparison.find(
      (c: ParsedComparisonRow) => c.metric === 'largest_contentful_paint',
    );
    expect(lcpRow.values).toHaveLength(2);
    // fast site should be good, slow site needs-improvement or poor
    const fastVal = lcpRow.values.find((v: ParsedComparisonValue) => !!v.target.includes('fast'));
    expect(fastVal.rating).toBe('good');
    const slowVal = lcpRow.values.find((v: ParsedComparisonValue) => !!v.target.includes('slow'));
    expect(['needs-improvement', 'poor']).toContain(slowVal.rating);
  });

  it('emits CLS p75 as a number, consistent with the audit tool', async () => {
    // CrUX returns CLS p75 as a string (e.g. "0.05"). The compare output must
    // normalize it to a number so p75 is a consistent numeric type across every
    // metric row (the audit tool does the same via the shared normalizeP75).
    const { CompareOriginsTool } = await import('./compare-origins-tool');
    const tool = new CompareOriginsTool();
    const result = await tool.execute({
      targets: ['https://fast.example.com', 'https://slow.example.com'],
    });
    const parsed = JSON.parse(result);
    const clsRow = parsed.comparison.find(
      (c: ParsedComparisonRow) => c.metric === 'cumulative_layout_shift',
    );
    for (const value of clsRow.values) {
      expect(typeof value.p75).toBe('number');
    }
    expect(clsRow.values[0].p75).toBe(0.05);
  });

  it('handles API errors gracefully per target', async () => {
    mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
      const body = JSON.parse((opts?.body as string) ?? '{}');
      if (body.origin?.includes('error')) {
        return new Response(JSON.stringify({ error: { message: 'Not in dataset' } }), {
          status: 404,
        });
      }
      return new Response(JSON.stringify({ record: makeRecord(body.origin, 2000) }), {
        status: 200,
      });
    });

    const { CompareOriginsTool } = await import('./compare-origins-tool');
    const tool = new CompareOriginsTool();
    const result = await tool.execute({
      targets: ['https://good.example.com', 'https://error.example.com'],
    });
    const parsed = JSON.parse(result);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0].target).toContain('error');
  });

  it('records a 429 quota error per target instead of discarding other results', async () => {
    mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
      const body = JSON.parse((opts?.body as string) ?? '{}');
      if (body.origin?.includes('quota')) {
        return new Response(JSON.stringify({ error: { message: 'Quota exceeded' } }), {
          status: 429,
        });
      }
      return new Response(JSON.stringify({ record: makeRecord(body.origin, 2000) }), {
        status: 200,
      });
    });

    const { CompareOriginsTool } = await import('./compare-origins-tool');
    const tool = new CompareOriginsTool();
    const result = await tool.execute({
      targets: ['https://good.example.com', 'https://quota.example.com'],
    });
    const parsed = JSON.parse(result);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0].target).toContain('quota');
    expect(parsed.errors[0].error).toContain('Quota exceeded');
    // The non-erroring target still produced a rating
    const lcpRow = parsed.comparison.find(
      (c: ParsedComparisonRow) => c.metric === 'largest_contentful_paint',
    );
    const goodVal = lcpRow.values.find((v: ParsedComparisonValue) => !!v.target.includes('good'));
    expect(goodVal.rating).not.toBe('n/a');
  });

  it('re-throws non-404/429 errors instead of swallowing them', async () => {
    mockFetch.mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { message: 'Internal error' } }), {
          status: 500,
        }),
    );

    const { CompareOriginsTool } = await import('./compare-origins-tool');
    const tool = new CompareOriginsTool();
    try {
      await tool.execute({
        targets: ['https://a.example.com', 'https://b.example.com'],
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('Internal error');
    }
  });

  it('throws UserError for fewer than 2 targets (Zod validation)', async () => {
    const { CompareOriginsSchema } = await import('./compare-origins-tool');
    const result = CompareOriginsSchema.safeParse({
      targets: ['https://only-one.com'],
    });
    expect(result.success).toBe(false);
  });

  it('throws UserError for more than 5 targets (Zod validation)', async () => {
    const { CompareOriginsSchema } = await import('./compare-origins-tool');
    const result = CompareOriginsSchema.safeParse({
      targets: [
        'https://a.com',
        'https://b.com',
        'https://c.com',
        'https://d.com',
        'https://e.com',
        'https://f.com',
      ],
    });
    expect(result.success).toBe(false);
  });

  it('normalizes trailing-slash origins', async () => {
    const { CompareOriginsTool } = await import('./compare-origins-tool');
    const tool = new CompareOriginsTool();
    await tool.execute({
      targets: ['https://example.com/', 'https://other.example.com/'],
    });
    const requestBodies = mockFetch.mock.calls.map(
      ([, opts]: [string, RequestInit]) => JSON.parse(opts.body as string) as CruxRequestBody,
    );
    expect(requestBodies.every((b: CruxRequestBody) => 'origin' in b && !('url' in b))).toBe(true);
    expect(requestBodies[0].origin).toBe('https://example.com');
  });

  it('routes path-bearing URLs as page URL (url key), not origin', async () => {
    const { CompareOriginsTool } = await import('./compare-origins-tool');
    const tool = new CompareOriginsTool();
    await tool.execute({
      targets: ['https://example.com', 'https://example.com/page'],
    });
    const requestBodies = mockFetch.mock.calls.map(
      ([, opts]: [string, RequestInit]) => JSON.parse(opts.body as string) as CruxRequestBody,
    );
    const originBody = requestBodies.find((b: CruxRequestBody) => 'origin' in b);
    const urlBody = requestBodies.find((b: CruxRequestBody) => 'url' in b);
    expect(originBody).toBeDefined();
    expect(originBody!.origin).toBe('https://example.com');
    expect(urlBody).toBeDefined();
    expect(urlBody!.url).toBe('https://example.com/page');
  });
});
