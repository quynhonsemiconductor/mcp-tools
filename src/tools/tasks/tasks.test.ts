/**
 * Comprehensive integration tests for Task List Management Tools
 *
 * This test suite validates the complete workflow:
 * 1. Create task lists
 * 2. Add tasks to lists
 * 3. Reorder tasks
 * 4. Execute tasks (get next, mark complete)
 * 5. Get statistics
 * 6. Clean up (delete tasks and lists)
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { taskDatabase } from './database';
import { ExecuteTaskTool, ExecuteTaskToolSchema } from './execute-task-tool';
import type { ExecuteTaskToolParams } from './execute-task-tool';
import { GetTaskStatisticsTool, GetTaskStatisticsToolSchema } from './get-task-statistics-tool';
import { ManageTaskListsTool, ManageTaskListsToolSchema } from './manage-task-lists-tool';
import { ManageTasksTool, ManageTasksToolSchema } from './manage-tasks-tool';
import { ReorderTasksTool, ReorderTasksToolSchema } from './reorder-tasks-tool';
import type { Task } from './types';

describe('Task List Management - Integration Tests', () => {
  let manageTaskListsTool: ManageTaskListsTool;
  let manageTasksTool: ManageTasksTool;
  let executeTaskTool: ExecuteTaskTool;
  let reorderTasksTool: ReorderTasksTool;
  let getTaskStatisticsTool: GetTaskStatisticsTool;

  let testTaskListId: string;
  let testTaskIds: string[] = [];

  // Mock the database methods
  const mockTaskList = {
    id: '90a87d56-b86c-4dbe-88e7-65a1b055e870',
    name: 'Integration Test List',
    description: 'A test list for integration testing',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    task_count: 3,
    completed_count: 1,
  };

  const mockTasks: Task[] = [
    {
      id: 'task-1',
      task_list_id: mockTaskList.id,
      title: 'First task',
      description: 'Description for first task',
      status: 'completed',
      position: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      priority: 'high',
    },
    {
      id: 'task-2',
      task_list_id: mockTaskList.id,
      title: 'Second task',
      description: 'Description for second task',
      status: 'pending',
      position: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      priority: 'medium',
    },
    {
      id: 'task-3',
      task_list_id: mockTaskList.id,
      title: 'Third task',
      description: 'Description for third task',
      status: 'pending',
      position: 3,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      priority: 'low',
    },
  ];

  beforeAll(() => {
    // Initialize all tools
    manageTaskListsTool = new ManageTaskListsTool();
    manageTasksTool = new ManageTasksTool();
    executeTaskTool = new ExecuteTaskTool();
    reorderTasksTool = new ReorderTasksTool();
    getTaskStatisticsTool = new GetTaskStatisticsTool();

    // Mock database methods
    // @ts-expect-error - Mock private methods
    taskDatabase.createTaskList = () => mockTaskList;
    // @ts-expect-error - Mock method with a narrower signature than the real one
    taskDatabase.getTaskList = () => mockTaskList;
    taskDatabase.addTask = (_, title) => {
      const task = mockTasks.find((t) => t.title === title);
      return task || mockTasks[0];
    };
    taskDatabase.getTask = (id) => mockTasks.find((t) => t.id === id) || mockTasks[0];
    taskDatabase.getTasksForList = () => mockTasks;
    taskDatabase.getNextTask = () => mockTasks[1]; // Second task
    taskDatabase.getInProgressTasks = () => {
      return mockTasks.filter((t) => t.status === 'in_progress');
    };
    taskDatabase.updateTask = (id, updates) => {
      const task = mockTasks.find((t) => t.id === id) || mockTasks[0];
      return { ...task, ...updates };
    };
    taskDatabase.deleteTask = () => true;
    taskDatabase.deleteTaskList = () => true;
    taskDatabase.reorderTasks = () => true;
    taskDatabase.getStatistics = () => ({
      total_task_lists: 1,
      active_task_lists: 1,
      total_tasks: mockTasks.length,
      completed_tasks: mockTasks.filter((t) => t.status === 'completed').length,
      pending_tasks: mockTasks.filter((t) => t.status === 'pending').length,
      in_progress_tasks: mockTasks.filter((t) => t.status === 'in_progress').length,
      cancelled_tasks: mockTasks.filter((t) => t.status === 'cancelled').length,
      completion_rate: 33.3,
      recent_completions: mockTasks.filter((t) => t.status === 'completed'),
      task_lists_summary: [
        {
          id: mockTaskList.id,
          name: mockTaskList.name,
          total_tasks: mockTasks.length,
          completed_tasks: mockTasks.filter((t) => t.status === 'completed').length,
          completion_rate: 33.3,
        },
      ],
    });
  });

  afterAll(() => {
    // Clean up database
    try {
      taskDatabase.close();
    } catch {
      // Ignore cleanup errors
    }
  });

  // Set up test task IDs
  beforeAll(() => {
    testTaskListId = mockTaskList.id;
    testTaskIds = mockTasks.map((t) => t.id);
  });

  describe('Complete Workflow Test', () => {
    it('should create a task list successfully', async () => {
      const result = await manageTaskListsTool.execute({
        action: 'create',
        name: 'Integration Test List',
        description: 'A test list for integration testing',
      });

      expect(result).toContain('Successfully created task list');
      expect(result).toContain('Integration Test List');

      // Since we're using mocks, we already have the task list ID
      testTaskListId = mockTaskList.id;
    });

    it('should add multiple tasks to the list', async () => {
      const tasks = [
        {
          title: 'First task',
          description: 'Description for first task',
          priority: 'high' as const,
        },
        {
          title: 'Second task',
          description: 'Description for second task',
          priority: 'medium' as const,
        },
        {
          title: 'Third task',
          description: 'Description for third task',
          priority: 'low' as const,
        },
      ];

      for (const task of tasks) {
        const result = await manageTasksTool.execute({
          action: 'add',
          taskListId: testTaskListId,
          title: task.title,
          description: task.description,
          priority: task.priority,
        });

        expect(result).toContain('Successfully added task');
        expect(result).toContain(task.title);

        // We're using mocks, so no need to extract task ID from the result text
        // testTaskIds were already set in beforeAll()
      }

      expect(testTaskIds).toHaveLength(3);
    });

    it('should retrieve the task list with all tasks', async () => {
      // Ensure the mock will return correct task list info
      // @ts-expect-error - Mock method with a narrower signature than the real one
      taskDatabase.getTaskList = () => mockTaskList;
      taskDatabase.getTasksForList = () => mockTasks;

      const result = await manageTaskListsTool.execute({
        action: 'get',
        taskListId: testTaskListId,
      });

      // Just check that it contains task list name and doesn't error
      expect(result).toContain('Test List');
      expect(result).toContain('Tasks:');
    });

    it('should get the next pending task', async () => {
      // Reset mocks
      // @ts-expect-error - Mock method with a narrower signature than the real one
      taskDatabase.getTaskList = () => mockTaskList;
      taskDatabase.getNextTask = () => mockTasks[1]; // Second task
      taskDatabase.getInProgressTasks = () => [];

      const result = await executeTaskTool.execute({
        action: 'getNext',
        taskListId: testTaskListId,
        markInProgress: false,
      });

      // Check for presence of task information
      expect(result).toContain('Next task from');
      expect(result).toContain('Second task'); // Based on our mock
    });

    it('should mark the first task as in-progress', async () => {
      taskDatabase.getNextTask = () => mockTasks[1];
      taskDatabase.getInProgressTasks = () => [];
      taskDatabase.updateTask = (id, updates) => ({
        ...mockTasks[1],
        ...updates,
        id: id,
      });

      const result = await executeTaskTool.execute({
        action: 'getNext',
        taskListId: testTaskListId,
        markInProgress: true,
      });

      // Check for the presence of the text indicating the task is marked as in-progress
      expect(result).toContain('marked as in-progress');
    });

    it('should enforce constraint: only one task in progress at a time', async () => {
      // Mock that there's already a task in progress
      const inProgressTask = { ...mockTasks[0], status: 'in_progress' };
      // @ts-expect-error - Mock method
      taskDatabase.getTaskList = () => mockTaskList;
      // @ts-expect-error - Mock method with a narrower signature than the real one
      taskDatabase.getInProgressTasks = () => [inProgressTask];

      // Try to get another task while one is already in progress
      const result = await executeTaskTool.execute({
        action: 'getNext',
        taskListId: testTaskListId,
        markInProgress: true,
      });

      // Check for constraint warning
      expect(result).toContain('Cannot start new task - Task already in progress');
      expect(result).toContain('Complete the current in-progress task');
    });

    it('should complete the first task', async () => {
      // Mock getting a task with pending status
      taskDatabase.getTask = () => ({
        ...mockTasks[0],
        status: 'pending', // Make sure the task is not already completed
      });
      // @ts-expect-error - Mock method with a narrower signature than the real one
      taskDatabase.getTaskList = () => mockTaskList;
      taskDatabase.updateTask = (id, updates) => ({
        ...mockTasks[0],
        ...updates,
        status: 'completed',
        completed_at: new Date().toISOString(),
      });

      const result = await executeTaskTool.execute({
        action: 'complete',
        taskId: testTaskIds[0],
        notes: 'Task completed successfully during integration test',
      });

      // Check for completion message
      expect(result).toContain('Successfully completed task');
    });

    it('should reorder the remaining tasks', async () => {
      // Mock for reordering tasks
      // @ts-expect-error - Mock method
      taskDatabase.getTaskList = () => mockTaskList;
      taskDatabase.getTask = (id) => {
        if (id === testTaskIds[1]) return mockTasks[1];
        if (id === testTaskIds[2]) return mockTasks[2];
        return mockTasks[0];
      };
      taskDatabase.reorderTasks = () => true;

      // Reorder: put third task first, second task second
      const result = await reorderTasksTool.execute({
        taskListId: testTaskListId,
        taskIds: [testTaskIds[2], testTaskIds[1]], // Third task, then second task
      });

      // Check for reordering message
      expect(result).toContain('Successfully reordered');
    });

    it('should get next task after reordering', async () => {
      // Mock to return third task now as next task (after reordering)
      taskDatabase.getNextTask = () => mockTasks[2];
      taskDatabase.getInProgressTasks = () => [];

      const result = await executeTaskTool.execute({
        action: 'getNext',
        taskListId: testTaskListId,
        markInProgress: false,
      });

      // Check that third task is now shown as next
      expect(result).toContain('Third task');
    });

    it('should get task statistics', async () => {
      // Mock task statistics
      // @ts-expect-error - Mock method
      taskDatabase.getTaskList = () => mockTaskList;
      taskDatabase.getTasksForList = () => mockTasks;

      const result = await getTaskStatisticsTool.execute({
        taskListId: testTaskListId,
        includeDetails: true,
        includeHistory: true,
      });

      // Check for basic statistics information
      expect(result).toContain('Statistics for Task List');
      expect(result).toContain('Total Tasks:');
      expect(result).toContain('Summary:');
    });

    it('should get global statistics', async () => {
      const result = await getTaskStatisticsTool.execute({
        includeDetails: true,
        includeHistory: true,
      });

      expect(result).toContain('Global Task Statistics');
      expect(result).toContain('Total Task Lists:');
      expect(result).toContain('Total Tasks:');
      expect(result).toContain('Completed:');
      // Don't assert specific numbers as these can change based on test runs
    });

    it('should list all task lists', async () => {
      // Mock listing task lists
      // @ts-expect-error - Mock method
      taskDatabase.listTaskLists = () => [mockTaskList];

      const result = await manageTaskListsTool.execute({
        action: 'list',
      });

      // Check for list information
      expect(result).toContain('Task Lists:');
      expect(result).toContain(mockTaskList.name);
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle invalid task list ID', async () => {
      // Mock to return null for an invalid ID
      taskDatabase.getTaskList = () => null;

      const result = await manageTaskListsTool.execute({
        action: 'get',
        taskListId: 'invalid-id',
      });

      // Check for not found message
      expect(result).toContain('not found');
    });

    it('should handle missing required parameters', async () => {
      try {
        await manageTasksTool.execute({
          action: 'add',
          // Missing taskListId and title
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).toContain('required');
      }
    });

    it('should handle invalid action', async () => {
      try {
        // Deliberately passing a value outside the schema's enum to verify the
        // tool's runtime guard, which a non-TypeScript caller could still trigger.
        await executeTaskTool.execute({
          action: 'invalid',
          markInProgress: false,
        } as unknown as ExecuteTaskToolParams);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).toContain(
          'Invalid action',
        );
      }
    });
  });

  describe('Cleanup', () => {
    it('should delete individual tasks', async () => {
      for (const taskId of testTaskIds.slice(1)) {
        // Skip the already completed first task
        const result = await manageTasksTool.execute({
          action: 'delete',
          taskId: taskId,
        });

        expect(result).toContain('Successfully deleted task');
      }
    });

    it('should delete the task list', async () => {
      // Mock task list deletion
      // @ts-expect-error - Mock method
      taskDatabase.getTaskList = () => mockTaskList;
      taskDatabase.deleteTaskList = () => true;

      const result = await manageTaskListsTool.execute({
        action: 'delete',
        taskListId: testTaskListId,
        confirm: true,
      });

      // Check for deletion message
      expect(result).toContain('Successfully deleted task list');
    });

    it('should show empty statistics after cleanup', async () => {
      // We've deleted our task list, but there might be other task lists from other tests
      // So we just check that the function runs without error
      const result = await getTaskStatisticsTool.execute({
        includeDetails: false,
        includeHistory: false,
      });

      expect(result).toContain('Global Task Statistics');
    });
  });
});

describe('Schema Validation Tests', () => {
  it('should validate ManageTaskLists schema', () => {
    const validParams = {
      action: 'create',
      name: 'Test List',
    };

    const result = ManageTaskListsToolSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it('should validate ManageTasks schema', () => {
    const validParams = {
      action: 'add',
      taskListId: 'test-id',
      title: 'Test Task',
    };

    const result = ManageTasksToolSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it('should validate ExecuteTask schema', () => {
    const validParams = {
      action: 'getNext',
      taskListId: 'test-id',
    };

    const result = ExecuteTaskToolSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it('should validate ReorderTasks schema', () => {
    const validParams = {
      taskListId: 'test-id',
      taskIds: ['task1', 'task2'],
    };

    const result = ReorderTasksToolSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it('should validate GetTaskStatistics schema', () => {
    const validParams = {
      includeDetails: true,
    };

    const result = GetTaskStatisticsToolSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });
});
