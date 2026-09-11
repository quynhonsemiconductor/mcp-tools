import { describe, expect, it } from 'bun:test';
import {
  K6ApiError,
  buildV5AggregatePath,
  buildV5RangePath,
  assertV5PathIntegrity,
  assertV5ResponseShape,
} from './api';

describe('K6ApiError', () => {
  it('should store code, message, and details', () => {
    const error = new K6ApiError('AUTH_ERROR', 'Not authenticated', {
      status: 401,
    });
    expect(error.code).toBe('AUTH_ERROR');
    expect(error.message).toBe('Not authenticated');
    expect(error.details).toEqual({ status: 401 });
    expect(error.name).toBe('K6ApiError');
  });

  it('should serialize to JSON', () => {
    const error = new K6ApiError('NOT_FOUND', 'Resource not found');
    const json = error.toJSON();
    expect(json).toEqual({
      code: 'NOT_FOUND',
      message: 'Resource not found',
      details: {},
    });
  });
});

describe('buildV5AggregatePath', () => {
  it('should build a basic aggregate path', () => {
    const path = buildV5AggregatePath('12345', 'http_req_duration', 'histogram_quantile(0.90)');
    expect(path).toBe(
      "/cloud/v5/test_runs/12345/query_aggregate_k6(metric='http_req_duration',query='histogram_quantile(0.90)')",
    );
  });

  it('should include start and end when provided', () => {
    const start = 1700000000;
    const end = 1700003600;
    const path = buildV5AggregatePath('12345', 'http_req_duration', 'histogram_quantile(0.90)', {
      start,
      end,
    });
    expect(path).toContain('start=');
    expect(path).toContain('end=');
    expect(path).not.toContain('%2C');
  });
});

describe('buildV5RangePath', () => {
  it('should build a range query path', () => {
    const start = 1700000000;
    const end = 1700003600;
    const path = buildV5RangePath(
      '12345',
      'http_req_duration',
      'histogram_quantile(0.90)',
      10,
      start,
      end,
    );
    expect(path).toContain('/cloud/v5/test_runs/12345/query_range_k6');
    expect(path).toContain("metric='http_req_duration'");
    expect(path).toContain('step=10');
  });
});

describe('assertV5PathIntegrity', () => {
  it('should pass for a valid path', () => {
    const path =
      "/cloud/v5/test_runs/12345/query_aggregate_k6(metric='http_req_duration',query='histogram_quantile(0.90)')";
    expect(() => assertV5PathIntegrity(path)).not.toThrow();
  });

  it('should throw for URL-encoded commas', () => {
    const path =
      "/cloud/v5/test_runs/12345/query_aggregate_k6(metric='http_req_duration'%2Cquery='histogram_quantile(0.90)')";
    try {
      assertV5PathIntegrity(path);
      expect(true).toBe(false); // should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(K6ApiError);
      expect((error as K6ApiError).code).toBe('V5_URL_ENCODING');
    }
  });

  it('should throw for quoted datetime values', () => {
    const path =
      "/cloud/v5/test_runs/12345/query_aggregate_k6(metric='http_req_duration',start='2023-01-01T00:00:00.000Z')";
    try {
      assertV5PathIntegrity(path);
      expect(true).toBe(false); // should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(K6ApiError);
      expect((error as K6ApiError).code).toBe('V5_DATETIME_QUOTED');
    }
  });
});

describe('assertV5ResponseShape', () => {
  it('should pass for a normal v5 response', () => {
    const resp = {
      data: {
        result: [{ metric: {}, values: [] }],
        resultType: 'vector',
      },
      status: 'success',
    };
    expect(() => assertV5ResponseShape(resp, 'test')).not.toThrow();
  });

  it('should throw for nested data.data.result structure', () => {
    const resp = {
      data: {
        data: {
          result: [{ metric: {}, values: [] }],
        },
      },
    };
    try {
      assertV5ResponseShape(resp, 'test');
      expect(true).toBe(false); // should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(K6ApiError);
      expect((error as K6ApiError).code).toBe('V5_RESPONSE_SHAPE');
    }
  });

  it('should not throw for null/undefined', () => {
    expect(() => assertV5ResponseShape(null, 'test')).not.toThrow();
    expect(() => assertV5ResponseShape(undefined, 'test')).not.toThrow();
  });
});
