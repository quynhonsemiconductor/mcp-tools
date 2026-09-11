import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { setupStandardMocks } from '../../test-utils/mocks';

// Set up standard mocks
setupStandardMocks();

// Import after mocks
import {
  ConvertUnixTimestampTool,
  ConvertUnixTimestampToolParams,
  ConvertUnixTimestampToolSchema,
} from './convert-unix-timestamp-tool';

// Exposes the tool's private parseUnixTimestamp helper for direct testing, without `any`.
interface TestableConvertUnixTimestampTool {
  parseUnixTimestamp(input: string | number): number;
}

describe('ConvertUnixTimestampTool', () => {
  let tool: ConvertUnixTimestampTool;
  let consoleLogSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tool = new ConvertUnixTimestampTool();
    // Spy on console.log to prevent logs during tests
    consoleLogSpy = spyOn(console, 'log');
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('Schema validation', () => {
    it('should validate valid array of timestamps', () => {
      const params = { unixTimestamps: [1640995200, '1640995300'] };
      const result = ConvertUnixTimestampToolSchema.safeParse(params);
      expect(result.success).toBe(true);
    });

    it('should reject empty array of timestamps', () => {
      const params = { unixTimestamps: [] };
      const result = ConvertUnixTimestampToolSchema.safeParse(params);
      expect(result.success).toBe(false);
    });

    it('should reject when unixTimestamps is not provided', () => {
      const params = { format: 'yyyy-MM-dd' };
      const result = ConvertUnixTimestampToolSchema.safeParse(params);
      expect(result.success).toBe(false);
    });
  });

  describe('Valid timestamp conversion', () => {
    it('should convert valid timestamp with default format and timezone', async () => {
      const params: ConvertUnixTimestampToolParams = {
        unixTimestamps: [1640995200], // Jan 1, 2022 00:00:00 UTC
      };

      const result = await tool.execute(params);
      const parsed = JSON.parse(result);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].unixTimestamp).toBe(1640995200);
      expect(parsed[0].format).toBe('ISO');
      expect(parsed[0].timezone).toBe('UTC'); // Default to UTC
      expect(parsed[0].formattedTime).toContain('2022-01-01T00:00:00');
      expect(typeof parsed[0].isDst).toBe('boolean');
    });

    it('should convert string timestamp', async () => {
      const params: ConvertUnixTimestampToolParams = {
        unixTimestamps: ['1640995200'],
      };

      const result = await tool.execute(params);
      const parsed = JSON.parse(result);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].unixTimestamp).toBe(1640995200);
      expect(parsed[0].formattedTime).toContain('2022-01-01');
    });

    it('should convert millisecond timestamp to seconds', async () => {
      const params: ConvertUnixTimestampToolParams = {
        unixTimestamps: [1640995200000], // milliseconds
      };

      const result = await tool.execute(params);
      const parsed = JSON.parse(result);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].unixTimestamp).toBe(1640995200); // converted to seconds
      expect(parsed[0].formattedTime).toContain('2022-01-01');
    });

    it('should handle custom format', async () => {
      const params: ConvertUnixTimestampToolParams = {
        unixTimestamps: [1640995200],
        format: 'yyyy-MM-dd HH:mm:ss',
      };

      const result = await tool.execute(params);
      const parsed = JSON.parse(result);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].format).toBe('yyyy-MM-dd HH:mm:ss');
      expect(parsed[0].formattedTime).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });

    it('should handle custom timezone', async () => {
      const params: ConvertUnixTimestampToolParams = {
        unixTimestamps: [1640995200],
        timezone: 'America/New_York',
      };

      const result = await tool.execute(params);
      const parsed = JSON.parse(result);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].timezone).toBe('America/New_York');
      expect(parsed[0].formattedTime).toContain('2021-12-31T');
    });

    it('should convert array of timestamps', async () => {
      const params: ConvertUnixTimestampToolParams = {
        unixTimestamps: [1640995200, 1640995300], // Jan 1, 2022 timestamps
      };

      const result = await tool.execute(params);
      const parsed = JSON.parse(result);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].unixTimestamp).toBe(1640995200);
      expect(parsed[1].unixTimestamp).toBe(1640995300);
      expect(parsed[0].formattedTime).toContain('2022-01-01T00:00:00');
      expect(parsed[1].formattedTime).toContain('2022-01-01T00:01:40');
    });

    it('should convert array of mixed string and number timestamps', async () => {
      const params: ConvertUnixTimestampToolParams = {
        unixTimestamps: ['1640995200', 1640995300],
      };

      const result = await tool.execute(params);
      const parsed = JSON.parse(result);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].unixTimestamp).toBe(1640995200);
      expect(parsed[1].unixTimestamp).toBe(1640995300);
    });

    it('should handle empty array of timestamps as error case', async () => {
      const params: ConvertUnixTimestampToolParams = {
        unixTimestamps: [],
      };

      try {
        await tool.execute(params);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).toContain(
          "'unixTimestamps' must contain at least one timestamp",
        );
      }
    });

    it('should apply format and timezone to all timestamps in array', async () => {
      const params: ConvertUnixTimestampToolParams = {
        unixTimestamps: [1640995200, 1640995300],
        format: 'yyyy-MM-dd HH:mm:ss',
        timezone: 'America/New_York',
      };

      const result = await tool.execute(params);
      const parsed = JSON.parse(result);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].timezone).toBe('America/New_York');
      expect(parsed[1].timezone).toBe('America/New_York');
      expect(parsed[0].format).toBe('yyyy-MM-dd HH:mm:ss');
      expect(parsed[1].format).toBe('yyyy-MM-dd HH:mm:ss');
      expect(parsed[0].formattedTime).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
      expect(parsed[1].formattedTime).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });

    // Test removed as unixTimestamp is no longer supported
  });

  describe('Invalid timestamp handling', () => {
    it('should throw error for invalid string timestamp', async () => {
      const params: ConvertUnixTimestampToolParams = {
        unixTimestamps: ['invalid'],
      };

      try {
        await tool.execute(params);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).toContain(
          'Invalid unix timestamp: invalid',
        );
      }
    });

    it('should throw error for negative timestamp', async () => {
      const params: ConvertUnixTimestampToolParams = {
        unixTimestamps: [-1],
      };

      try {
        await tool.execute(params);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).toContain(
          'Unix timestamp out of valid range',
        );
      }
    });

    it('should throw error for invalid timezone', async () => {
      const params: ConvertUnixTimestampToolParams = {
        unixTimestamps: [1640995200],
        timezone: 'Invalid/Timezone',
      };

      try {
        await tool.execute(params);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).toContain('Invalid timezone');
      }
    });

    it('should throw error for invalid timestamp in array', async () => {
      const params: ConvertUnixTimestampToolParams = {
        unixTimestamps: [1640995200, 'invalid', 1640995300],
      };

      try {
        await tool.execute(params);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).toContain(
          'Invalid unix timestamp: invalid',
        );
      }
    });

    it('should throw error for out of range timestamp in array', async () => {
      const params: ConvertUnixTimestampToolParams = {
        unixTimestamps: [1640995200, -1, 1640995300],
      };

      try {
        await tool.execute(params);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).toContain(
          'Unix timestamp out of valid range',
        );
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle epoch timestamp (0)', async () => {
      const params: ConvertUnixTimestampToolParams = {
        unixTimestamps: [0],
      };

      const result = await tool.execute(params);
      const parsed = JSON.parse(result);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].unixTimestamp).toBe(0);
      expect(parsed[0].formattedTime).toContain('1970-01-01');
    });

    it('should parse valid number timestamp', () => {
      const result = (tool as unknown as TestableConvertUnixTimestampTool).parseUnixTimestamp(1640995200);
      expect(result).toBe(1640995200);
    });

    it('should convert milliseconds to seconds', () => {
      const result = (tool as unknown as TestableConvertUnixTimestampTool).parseUnixTimestamp(1640995200000);
      expect(result).toBe(1640995200);
    });
  });
});
