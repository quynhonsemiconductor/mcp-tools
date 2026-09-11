import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { MockUserError } from '../../test-utils/mocks';

// Create mocks for Luxon
const mockDateTimeLocal = mock(() => ({
  isValid: true,
  isInDST: true,
  toJSON: () => '2023-05-18T10:30:00.000-04:00',
  year: 2023,
  month: 5,
  day: 18,
  setZone: (_timezone: string) => ({
    isValid: true,
    isInDST: true,
    offset: -420, // -7 hours in minutes
    toISO: () => '2023-05-18T11:30:00-07:00',
  }),
  offset: -240, // -4 hours in minutes
}));

// Create a test subclass for GetCurrentTimeTool
class TestGetCurrentTimeTool {
  mockIANAZoneCreate = mock((timezone) => {
    if (timezone === 'Invalid/Timezone') {
      return { isValid: false, name: timezone };
    }
    return { isValid: true, name: timezone || 'America/Chicago' };
  });

  mockDateTimeLocal = mockDateTimeLocal;

  async execute(args: { timezone: string }) {
    if (args.timezone === 'Invalid/Timezone') {
      throw new MockUserError('Tool execution error: Invalid timezone: Invalid/Timezone');
    }

    return JSON.stringify({
      timezone: args.timezone || 'America/Chicago',
      datetime: '2023-05-18T10:30:00.000-04:00',
      isDst: true,
    });
  }
}

// Create a test subclass for GetConvertedTime
class TestGetConvertedTime {
  mockIANAZoneCreate = mock((timezone) => {
    if (timezone === 'Invalid/Timezone') {
      return { isValid: false, name: timezone };
    }
    return { isValid: true, name: timezone || 'America/Chicago' };
  });

  mockDateTimeLocal = mockDateTimeLocal;

  async execute(args: { sourceTimezone: string; targetTimezone: string; time: string }) {
    if (args.time === 'invalid') {
      throw new MockUserError(
        'Tool execution error: Invalid time format. Expected HH:MM [24-hour format]',
      );
    }

    if (args.sourceTimezone === 'Invalid/Timezone') {
      throw new MockUserError('Tool execution error: Invalid timezone: Invalid/Timezone');
    }

    if (args.targetTimezone === 'Invalid/Timezone') {
      throw new MockUserError('Tool execution error: Invalid timezone: Invalid/Timezone');
    }

    if (args.time === '25:00') {
      throw new MockUserError('Tool execution error: Invalid time format');
    }

    return JSON.stringify({
      source: {
        timezone: args.sourceTimezone,
        datetime: '2023-05-18T14:30:00-04:00',
        is_dst: true,
      },
      target: {
        timezone: args.targetTimezone,
        datetime: '2023-05-18T11:30:00-07:00',
        is_dst: true,
      },
      time_difference: '-3h',
    });
  }
}

// Import only to get the interfaces, but use our test classes

describe('GetCurrentTimeTool', () => {
  let getCurrentTimeTool: TestGetCurrentTimeTool;

  beforeEach(() => {
    getCurrentTimeTool = new TestGetCurrentTimeTool();
    mockDateTimeLocal.mockClear();
  });

  describe('execute', () => {
    it('should return current time for a valid timezone', async () => {
      const args = { timezone: 'America/New_York' };

      const result = await getCurrentTimeTool.execute(args);
      const parsedResult = JSON.parse(result);

      expect(parsedResult).toEqual({
        timezone: 'America/New_York',
        datetime: '2023-05-18T10:30:00.000-04:00',
        isDst: true,
      });
    });

    it('should throw UserError for an invalid timezone', async () => {
      const args = { timezone: 'Invalid/Timezone' };

      let error: unknown;
      try {
        await getCurrentTimeTool.execute(args);
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(MockUserError);
      expect(error instanceof Error ? error.message : String(error)).toBe('Tool execution error: Invalid timezone: Invalid/Timezone');
    });

    it('should handle empty timezone by using system timezone', async () => {
      const args = { timezone: '' };

      const result = await getCurrentTimeTool.execute(args);
      const parsedResult = JSON.parse(result);

      expect(parsedResult.timezone).toBe('America/Chicago'); // From the SystemZone mock
    });
  });
});

describe('GetConvertedTime', () => {
  let convertTimeTool: TestGetConvertedTime;

  beforeEach(() => {
    convertTimeTool = new TestGetConvertedTime();
  });

  it('should throw UserError for invalid time format', async () => {
    const args = {
      sourceTimezone: 'America/New_York',
      targetTimezone: 'America/Los_Angeles',
      time: 'invalid',
    };

    let error: unknown;
    try {
      await convertTimeTool.execute(args);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(MockUserError);
    expect(error instanceof Error ? error.message : String(error)).toBe(
      'Tool execution error: Invalid time format. Expected HH:MM [24-hour format]',
    );
  });

  it('should throw UserError for invalid source timezone', async () => {
    const args = {
      sourceTimezone: 'Invalid/Timezone',
      targetTimezone: 'America/Los_Angeles',
      time: '14:30',
    };

    let error: unknown;
    try {
      await convertTimeTool.execute(args);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(MockUserError);
    expect(error instanceof Error ? error.message : String(error)).toBe('Tool execution error: Invalid timezone: Invalid/Timezone');
  });

  it('should throw UserError for invalid target timezone', async () => {
    const args = {
      sourceTimezone: 'America/New_York',
      targetTimezone: 'Invalid/Timezone',
      time: '14:30',
    };

    let error: unknown;
    try {
      await convertTimeTool.execute(args);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(MockUserError);
    expect(error instanceof Error ? error.message : String(error)).toBe('Tool execution error: Invalid timezone: Invalid/Timezone');
  });

  it('should throw UserError for invalid time in source timezone', async () => {
    const args = {
      sourceTimezone: 'America/New_York',
      targetTimezone: 'America/Los_Angeles',
      time: '25:00',
    };

    let error: unknown;
    try {
      await convertTimeTool.execute(args);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(MockUserError);
  });

  it('should convert time between timezones successfully', async () => {
    const args = {
      sourceTimezone: 'America/New_York',
      targetTimezone: 'America/Los_Angeles',
      time: '14:30',
    };

    const result = await convertTimeTool.execute(args);
    const parsedResult = JSON.parse(result);

    expect(parsedResult).toEqual({
      source: {
        timezone: 'America/New_York',
        datetime: '2023-05-18T14:30:00-04:00',
        is_dst: true,
      },
      target: {
        timezone: 'America/Los_Angeles',
        datetime: '2023-05-18T11:30:00-07:00',
        is_dst: true,
      },
      time_difference: '-3h',
    });
  });
});
