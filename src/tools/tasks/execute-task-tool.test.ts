import { describe, expect, it, beforeEach, afterEach, spyOn, mock } from 'bun:test';
import { setupStandardMocks } from '../../test-utils/mocks';

// Set up standard mocks
setupStandardMocks();

// Import after mocks
import {
  ExecuteTaskTool,
  ExecuteTaskToolSchema,
  ExecuteTaskToolParams,
  taskDatabase,
} from './index';

describe('ExecuteTaskTool', () => {
  let tool: ExecuteTaskTool;
  let consoleLogSpy: ReturnType<typeof spyOn>;

  // Example valid parameters for testing
  const validParams: ExecuteTaskToolParams = {
    action: 'getNext',
    taskListId: '123456',
  };

  beforeEach(() => {
    tool = new ExecuteTaskTool();
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
    // Mock the taskDatabase methods
    const getTaskListMock = mock((id) => ({ id, name: 'Test Task List' }));
    const getInProgressTasksMock = mock(() => []);
    const getNextTaskMock = mock(() => ({
      id: '123',
      title: 'Test Task',
      status: 'pending',
      position: 1,
      created_at: new Date().toISOString(),
      task_list_id: '123456',
    }));

    // @ts-expect-error - Mock private methods
    taskDatabase.getTaskList = getTaskListMock;
    taskDatabase.getInProgressTasks = getInProgressTasksMock;
    // @ts-expect-error - Mock method with a narrower signature than the real one
    taskDatabase.getNextTask = getNextTaskMock;

    const result = await tool.execute(validParams);
    expect(result).toBeDefined();
    expect(result).toContain('Next task from "Test Task List"');
    expect(result).toContain('Test Task');
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
      const result = ExecuteTaskToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('should reject invalid parameters', () => {
      const invalidParams = {
        // Invalid action value that doesn't match enum
        action: 'invalidAction',
      };
      const result = ExecuteTaskToolSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });
  });

  // Add more test cases as needed
});
