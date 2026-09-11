import { describe, expect, it, beforeEach, afterEach, spyOn } from 'bun:test';
import { setupStandardMocks } from '../../test-utils/mocks';

// Set up standard mocks
setupStandardMocks();

// Import after mocks
import { ManageTaskListsTool, ManageTaskListsToolSchema, ManageTaskListsToolParams } from './index';

describe('ManageTaskListsTool', () => {
  let tool: ManageTaskListsTool;
  let consoleLogSpy: ReturnType<typeof spyOn>;

  // Example valid parameters for testing
  const validParams: ManageTaskListsToolParams = {
    action: 'list',
  };

  beforeEach(() => {
    tool = new ManageTaskListsTool();
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

    // Mock the taskDatabase.listTaskLists method
    const mockTaskLists = [
      {
        id: 'list1',
        name: 'Test Task List',
        status: 'active',
        description: 'A test task list',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        task_count: 5,
        completed_count: 2,
      },
    ];

    // @ts-expect-error - Mock private methods
    taskDatabase.listTaskLists = () => mockTaskLists;

    const result = await tool.execute(validParams);
    expect(result).toBeDefined();
    expect(result).toContain('Task Lists:');
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
      const result = ManageTaskListsToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('should reject invalid parameters', () => {
      const invalidParams = {
        // Invalid action that's not in the enum
        action: 'invalid_action',
      };
      const result = ManageTaskListsToolSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });
  });

  // Add more test cases as needed
});
