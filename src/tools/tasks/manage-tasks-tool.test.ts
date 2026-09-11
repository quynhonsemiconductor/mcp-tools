import { describe, expect, it, beforeEach, afterEach, spyOn, mock } from 'bun:test';
import { setupStandardMocks } from '../../test-utils/mocks';

// Set up standard mocks
setupStandardMocks();

// Import after mocks
import { ManageTasksTool, ManageTasksToolSchema, ManageTasksToolParams } from './index';

describe('ManageTasksTool', () => {
  let tool: ManageTasksTool;
  let consoleLogSpy: ReturnType<typeof spyOn>;

  // Example valid parameters for testing
  const validParams: ManageTasksToolParams = {
    action: 'add',
    taskListId: '123',
    title: 'Test Task',
  };

  beforeEach(() => {
    tool = new ManageTasksTool();
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

    // Mock the taskDatabase methods
    const getTaskListMock = mock(() => ({ id: '123', name: 'Test Task List' }));
    const addTaskMock = mock(() => ({
      id: 'task123',
      title: 'Test Task',
      task_list_id: '123',
    }));

    // @ts-expect-error - Mock methods
    taskDatabase.getTaskList = getTaskListMock;
    // @ts-expect-error - Mock method with a narrower signature than the real one
    taskDatabase.addTask = addTaskMock;

    const result = await tool.execute(validParams);
    expect(result).toBeDefined();
    expect(result).toContain('Successfully added task');
    expect(result).toContain('Test Task');
    expect(result).toContain('Test Task List');
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
      const result = ManageTasksToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('should reject invalid parameters', () => {
      const invalidParams = {
        // Missing required action field
        taskListId: '123',
        title: 'Test Task',
      };
      const result = ManageTasksToolSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });
  });

  // Add more test cases as needed
});
