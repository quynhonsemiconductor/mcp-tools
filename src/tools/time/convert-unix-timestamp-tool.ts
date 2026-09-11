import { DateTime, IANAZone } from 'luxon';
import { z } from 'zod';
import { Tool, ToolHandler } from '../../registry';
import { CatchErrors } from '../../utils';

/**
 * Schema definition for the convertUnixTimestamp tool parameters
 */
export const ConvertUnixTimestampToolSchema = z
  .object({
    unixTimestamps: z
      .array(z.union([z.string(), z.number()]))
      .describe(
        'Array of Unix timestamps in seconds (e.g., 1640995200) or milliseconds (e.g., 1640995200000)',
      ),
    format: z
      .string()
      .optional()
      .describe(
        'Output format string using Luxon tokens (e.g., "yyyy-MM-dd HH:mm:ss", "MMM dd, yyyy"). Defaults to ISO format if not provided.',
      ),
    timezone: z
      .string()
      .optional()
      .describe(
        'IANA timezone name (e.g., "America/New_York", "UTC"). Defaults to UTC if not provided.',
      ),
  })
  .refine((data) => data.unixTimestamps.length > 0, {
    message: "'unixTimestamps' must contain at least one timestamp",
    path: ['unixTimestamps'],
  });

/**
 * Type for the convertUnixTimestamp tool parameters
 */
export type ConvertUnixTimestampToolParams = z.infer<typeof ConvertUnixTimestampToolSchema>;

/**
 * Helper function to get a valid timezone object based on the provided input.
 * If no timezone is specified, defaults to UTC for consistency.
 *
 * @param timezone - Optional timezone string
 * @returns A valid ZoneInfo object representing the specified timezone
 * @throws Error if the provided timezone is invalid or cannot be parsed
 */
const getTimezoneOrDefault = (timezone?: string): IANAZone => {
  // Default to UTC if no timezone provided or in test environment
  const targetTimezone = timezone || 'UTC';

  try {
    const zone = IANAZone.create(targetTimezone);
    if (!zone.isValid) {
      throw new Error(`Invalid timezone: ${targetTimezone}`);
    }

    return zone;
  } catch {
    throw new Error(`Invalid timezone: ${targetTimezone}`);
  }
};

/**
 * convertUnixTimestamp - Convert unix timestamps to human readable time representations
 */
@Tool({
  id: 'convert-unix-timestamp',
  name: 'convertUnixTimestamp',
  description: 'Convert unix timestamps to human readable time representations',
  category: 'Utility',
  parameters: ConvertUnixTimestampToolSchema,
  version: '1.0.0',
  annotations: {
    title: 'Convert Unix Timestamp',
    readOnlyHint: true,
  },
})
export class ConvertUnixTimestampTool implements ToolHandler {
  /**
   * Execute the tool to convert Unix timestamp(s) to formatted datetime(s)
   * @param args - Parameters containing Unix timestamp(s), optional format, and timezone
   * @returns A JSON string with the converted datetime information
   */
  @CatchErrors()
  // eslint-disable-next-line @typescript-eslint/require-await -- execute() must return a Promise to satisfy the ToolHandler interface; this implementation is fully synchronous
  async execute(args: ConvertUnixTimestampToolParams): Promise<string> {
    const { unixTimestamps, format, timezone } = args;

    if (unixTimestamps.length === 0) {
      // This should never happen due to schema validation, but just in case
      throw new Error("'unixTimestamps' must contain at least one timestamp");
    }

    // Process timestamps
    const results = unixTimestamps.map((ts) => this.convertSingleTimestamp(ts, format, timezone));
    return JSON.stringify(results);
  }

  /**
   * Convert a single Unix timestamp to formatted datetime
   * @param unixTimestamp - Unix timestamp as string or number
   * @param format - Optional format string
   * @param timezone - Optional timezone string
   * @returns Object with converted datetime information
   */
  private convertSingleTimestamp(
    unixTimestamp: string | number,
    format?: string,
    timezone?: string,
  ) {
    // Convert to number and validate
    const timestamp = this.parseUnixTimestamp(unixTimestamp);

    // Get timezone
    const zone = getTimezoneOrDefault(timezone);

    // Convert to DateTime
    const datetime = DateTime.fromSeconds(timestamp, { zone });

    if (!datetime.isValid) {
      throw new Error(`Failed to create valid datetime from timestamp: ${timestamp}`);
    }

    // Format the output
    const formattedTime = format
      ? datetime.toFormat(format)
      : datetime.toISO({ suppressMilliseconds: true });

    return {
      unixTimestamp: timestamp,
      timezone: zone.name,
      formattedTime,
      format: format || 'ISO',
      isDst: datetime.isInDST,
      iso: datetime.toISO({ suppressMilliseconds: true }),
      utc: datetime.toUTC().toISO({ suppressMilliseconds: true }),
    };
  }

  /**
   * Parse and validate Unix timestamp from string or number input
   * Handles both seconds and milliseconds timestamps
   * @param input - Unix timestamp as string or number
   * @returns Unix timestamp in seconds
   * @throws Error if the timestamp is invalid
   */
  private parseUnixTimestamp(input: string | number): number {
    let timestamp: number;

    if (typeof input === 'string') {
      timestamp = Number(input);
      if (isNaN(timestamp)) {
        throw new Error(`Invalid unix timestamp: ${input}. Must be a valid number.`);
      }
    } else {
      timestamp = input;
    }

    // Check if timestamp is in milliseconds (13 digits) and convert to seconds
    if (timestamp > 9999999999) {
      // Greater than max 10-digit timestamp (year 2286)
      timestamp = Math.floor(timestamp / 1000);
    }

    // Validate reasonable timestamp range (1970 to year 2100)
    if (timestamp < 0 || timestamp > 4102444800) {
      throw new Error(
        `Unix timestamp out of valid range: ${timestamp}. Must be between 0 and 4102444800 (year 2100).`,
      );
    }

    return timestamp;
  }
}
