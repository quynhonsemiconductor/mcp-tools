import env from '../../env';
import { UserError } from '../../utils';
import type {
  CrUXHistoryQueryParams,
  CrUXHistoryRecord,
  CrUXQueryParams,
  CrUXRecord,
} from './types';

const BASE_URL = 'https://chromeuxreport.googleapis.com/v1/records';

export class CrUXApiError extends UserError {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

function getApiKey(): string {
  const key = env.GOOGLE_CRUX_API_KEY;
  if (!key) {
    throw new UserError(
      'GOOGLE_CRUX_API_KEY is not set. Please configure your Google CrUX API key.',
    );
  }
  return key;
}

async function post<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const apiKey = getApiKey();
  const url = `${BASE_URL}:${endpoint}`;

  // Send the API key via the x-goog-api-key header rather than a `?key=`
  // query param. Google's API accepts either, but keeping the key out of the
  // URL prevents it from leaking into access/proxy/CDN logs and APM traces
  // that capture request URLs.
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = `CrUX API error: HTTP ${response.status}`;
    try {
      const err = (await response.json()) as { error?: { message?: string } };
      if (err?.error?.message) message = `CrUX API error: ${err.error.message}`;
    } catch {
      // ignore JSON parse failures
    }
    throw new CrUXApiError(message, response.status);
  }

  return response.json() as Promise<T>;
}

/**
 * Query the CrUX daily API for the current 28-day rolling window.
 */
export async function queryRecord(params: CrUXQueryParams): Promise<CrUXRecord> {
  const body: Record<string, unknown> = {};
  if (params.origin) body.origin = params.origin;
  if (params.url) body.url = params.url;
  if (params.formFactor) body.formFactor = params.formFactor;
  if (params.metrics?.length) body.metrics = params.metrics;

  const result = await post<{ record: CrUXRecord | null }>('queryRecord', body);
  if (!result.record) {
    throw new CrUXApiError('No CrUX data available for the requested origin or URL.', 404);
  }
  return result.record;
}

/**
 * Query the CrUX History API for up to 40 weeks of weekly timeseries data.
 */
export async function queryHistoryRecord(
  params: CrUXHistoryQueryParams,
): Promise<CrUXHistoryRecord> {
  const body: Record<string, unknown> = {};
  if (params.origin) body.origin = params.origin;
  if (params.url) body.url = params.url;
  if (params.formFactor) body.formFactor = params.formFactor;
  if (params.metrics?.length) body.metrics = params.metrics;
  if (params.collectionPeriodCount !== undefined)
    body.collectionPeriodCount = params.collectionPeriodCount;

  const result = await post<{ record: CrUXHistoryRecord | null }>('queryHistoryRecord', body);
  if (!result.record) {
    throw new CrUXApiError('No CrUX data available for the requested origin or URL.', 404);
  }
  return result.record;
}
