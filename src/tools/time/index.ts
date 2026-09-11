import { DateTime, IANAZone, SystemZone } from 'luxon';
import { z } from 'zod';
import { CatchErrors } from '../../utils';
import { Tool, ToolHandler } from '../registry';

export * from './convert-unix-timestamp-tool';

/**
 * Schema definition for the getCurrentTime tool parameters
 */
export const GetCurrentTimeToolSchema = z.object({
  timezone: z
    .string()
    .describe(
      'IANA timezone name (e.g., "America/New_York", "America/Los_Angeles"). Defaults to system timezone if not provided.',
    ),
});

/**
 * Type for the getCurrentTime tool parameters
 */
export type GetCurrentTimeToolParams = z.infer<typeof GetCurrentTimeToolSchema>;

/**
 * Schema definition for the convertTime tool parameters
 */
export const ConvertTimeToolSchema = z.object({
  sourceTimezone: z
    .string()
    .describe('IANA timezone name (e.g., "America/New_York", "America/Los_Angeles")'),
  targetTimezone: z
    .string()
    .describe('IANA timezone name (e.g., "America/New_York", "America/Los_Angeles")'),
  time: z.string().describe('Time to convert in 24-hour format (HH:MM)'),
});

/**
 * Type for the convertTime tool parameters
 */
export type ConvertTimeToolParams = z.infer<typeof ConvertTimeToolSchema>;

/**
 * Retrieves a valid timezone object based on the provided input.
 * If no timezone is specified, defaults to the local system timezone.
 *
 * @param input - Parameters object containing optional timezone string
 * @returns A valid ZoneInfo object representing the specified timezone
 * @throws Error if the provided timezone is invalid or cannot be parsed
 */
const getCurrentTimeZone = (timezone: string): IANAZone => {
  if (!timezone) {
    timezone = SystemZone.name;
  }

  try {
    const zone = IANAZone.create(timezone);
    if (!zone.isValid) {
      throw new Error(`Invalid timezone: ${timezone}`);
    }

    return zone;
  } catch {
    throw new Error(`Invalid timezone: ${timezone}`);
  }
};

/**
 * getCurrentTime - Get current time in a specific timezone
 */
@Tool({
  id: 'get-current-time',
  name: 'getCurrentTime',
  description: 'Get current time in a specific timezone.',
  category: 'Utility',
  parameters: GetCurrentTimeToolSchema,
  version: '1.0.0',
  annotations: {
    title: 'Current Time',
    readOnlyHint: true,
  },
})
export class GetCurrentTimeTool implements ToolHandler {
  /**
   * Execute the tool to get the current time in a specific timezone
   * @param args - Parameters containing the timezone string
   * @returns A JSON string with the current time and timezone information
   */
  @CatchErrors()
  // eslint-disable-next-line @typescript-eslint/require-await -- execute() must return a Promise to satisfy the ToolHandler interface; this implementation is fully synchronous
  async execute(args: GetCurrentTimeToolParams): Promise<string> {
    const { timezone } = args;
    const zone = getCurrentTimeZone(timezone.trim());
    const datetime = DateTime.local({ zone });
    if (!datetime.isValid) {
      throw new Error(`Invalid timezone: ${timezone}`);
    }

    return JSON.stringify({
      timezone: zone.name,
      datetime,
      isDst: datetime.isInDST,
    });
  }
}

@Tool({
  id: 'get-converted-time',
  name: 'convertTime',
  description: 'Convert time between timezones.',
  category: 'Utility',
  parameters: ConvertTimeToolSchema,
  version: '1.0.0',
  annotations: {
    title: 'Convert Time',
    readOnlyHint: true,
  },
})
export class GetConvertedTime implements ToolHandler {
  /**
   * Execute the tool to convert time between timezones
   * @param args - Parameters containing source and target timezones and time
   * @returns A JSON string with the converted time and timezone information
   */
  @CatchErrors()
  // eslint-disable-next-line @typescript-eslint/require-await -- execute() must return a Promise to satisfy the ToolHandler interface; this implementation is fully synchronous
  async execute(args: ConvertTimeToolParams): Promise<string> {
    const { sourceTimezone, targetTimezone, time } = args;
    const sourceZone = getCurrentTimeZone(sourceTimezone.trim());
    // Verify target timezone is valid but we don't need to store it
    getCurrentTimeZone(targetTimezone.trim());

    const [hours, minutes] = time.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) {
      throw new Error('Invalid time format. Expected HH:MM [24-hour format]');
    }

    const now = DateTime.local({ zone: sourceZone });
    const sourceTime = DateTime.local(now.year, now.month, now.day, hours, minutes).setZone(
      sourceTimezone,
    );

    const targetTime = sourceTime.setZone(targetTimezone);
    const sourceOffset = sourceTime.offset;
    const targetOffset = targetTime.offset;
    const hoursDifference = targetOffset / 60 - sourceOffset / 60;

    const timeDiffStr =
      hoursDifference === Math.floor(hoursDifference)
        ? `${hoursDifference.toFixed(1)}h`
        : `${hoursDifference.toFixed(2).replace(/\.?0+$/, '')}h`;

    return JSON.stringify({
      source: {
        timezone: sourceTimezone,
        datetime: sourceTime.toISO({ suppressMilliseconds: true }),
        is_dst: sourceTime.isInDST,
      },
      target: {
        timezone: targetTimezone,
        datetime: targetTime.toISO({ suppressMilliseconds: true }),
        is_dst: targetTime.isInDST,
      },
      time_difference: timeDiffStr,
    });
  }
}
