import { describe, expect, it, beforeEach, afterEach, spyOn } from 'bun:test';
import { setupStandardMocks } from '../../test-utils/mocks';

// Set up standard mocks
setupStandardMocks();

// Import after mocks
import {
  GetTaskStatisticsTool,
  GetTaskStatisticsToolSchema,
  GetTaskStatisticsToolParams,
} from './index';

describe('GetTaskStatisticsTool', () => {
  let tool: GetTaskStatisticsTool;
  let consoleLogSpy: ReturnType<typeof spyOn>;

  // Example valid parameters for testing
  const validParams: GetTaskStatisticsToolParams = {
    includeDetails: true,
    includeHistory: false,
  };

  beforeEach(() => {
    tool = new GetTaskStatisticsTool();
    // Spy on console.log to prevent logs during tests
    consoleLogSpy = spyOn(console, 'log');
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(tool).toBeDefined();
  });

  it('should execute with valid parameters', async () => {
    // Import required dependencies
    const { taskDatabase } = await import('./index');

    // Mock the taskDatabase.getStatistics method
    const mockStats = {
      total_task_lists: 11,
      active_task_lists: 11,
      total_tasks: 131,
      completed_tasks: 77,
      pending_tasks: 51,
      in_progress_tasks: 3,
      cancelled_tasks: 0,
      completion_rate: 58.8,
      recent_completions: [],
      task_lists_summary: [],
    };

    taskDatabase.getStatistics = () => mockStats;

    const result = await tool.execute(validParams);
    expect(result).toBeDefined();
    expect(result).toContain('Global Task Statistics');
    expect(result).toContain('Total Tasks: 131');
  });

  it('should handle errors gracefully', async () => {
    // Example test for error handling
    // You can uncomment and modify this as needed for your specific tool
    /*
    const mockProcessInput = mock(() => {
      throw new Error('Test error');
    });

    const originalProcessInput = tool['processInput'];
    tool['processInput'] = mockProcessInput;

    try {
      await tool.execute(validParams);
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect(error instanceof MockUserError).toBe(true);
      expect(error.message).toContain('Tool execution error: Test error');
    }

    // Restore original method
    tool['processInput'] = originalProcessInput;
    */
  });

  describe('schema validation', () => {
    it('should validate correct parameters', () => {
      const result = GetTaskStatisticsToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('should reject invalid parameters', () => {
      const invalidParams = {
        // Invalid parameter type - taskListId should be string, not number
        taskListId: 123,
        includeDetails: 'not-a-boolean', // Should be boolean
      };
      const result = GetTaskStatisticsToolSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });
  });

  // Add more test cases as needed
});
