import { z } from 'zod';
import { Tool, ToolHandler } from '../../registry';
import { logInfo } from '../../services/logger';
import { CatchErrors } from '../../utils';
import { taskDatabase } from './database';
import type { Task } from './types';

/**
 * Schema definition for the manageTasks tool parameters
 */
export const ManageTasksToolSchema = z.object({
  action: z
    .enum(['add', 'edit', 'delete', 'insert'])
    .describe('Action to perform: add, edit, delete, or insert'),
  taskListId: z
    .string()
    .optional()
    .describe('ID of the task list (required for add/insert actions)'),
  taskId: z.string().optional().describe('ID of the task (required for edit/delete actions)'),
  title: z.string().optional().describe('Task title (required for add/insert, optional for edit)'),
  description: z.string().optional().describe('Task description (optional for add/insert/edit)'),
  position: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Position for insert action or new position for edit'),
  status: z
    .enum(['pending', 'in_progress', 'completed', 'cancelled'])
    .optional()
    .describe('Task status for edit action'),
  priority: z
    .enum(['low', 'medium', 'high'])
    .optional()
    .describe('Task priority for add/insert/edit actions'),
  dueDate: z.string().optional().describe('Due date for add/insert/edit actions (ISO format)'),
  tags: z.array(z.string()).optional().describe('Task tags for add/insert/edit actions'),
});

/**
 * Type for the manageTasks tool parameters
 */
export type ManageTasksToolParams = z.input<typeof ManageTasksToolSchema>;

/**
 * manageTasks - Add, edit, delete, and insert tasks within task lists with full CRUD capabilities
 */
@Tool({
  id: 'manage-tasks',
  name: 'manageTasks',
  description: 'Add, edit, delete, and insert tasks within task lists with full CRUD capabilities',
  category: 'Utility',
  parameters: ManageTasksToolSchema,
  annotations: {
    title: 'manage-tasks',
  },
})
export class ManageTasksTool implements ToolHandler {
  /**
   * Execute the tool
   */
  @CatchErrors()
  async execute(args: ManageTasksToolParams): Promise<string> {
    logInfo(`Executing manageTasks with action: ${args.action}`);

    // taskDatabase calls below are synchronous; this await keeps `execute` genuinely
    // async so it matches the ToolHandler interface without a fake Promise wrapper.
    await Promise.resolve();

    switch (args.action) {
      case 'add':
        return this.addTask(args);
      case 'edit':
        return this.editTask(args);
      case 'delete':
        return this.deleteTask(args);
      case 'insert':
        return this.insertTask(args);
      default:
        throw new Error(`Invalid action: ${String(args.action)}`);
    }
  }

  /**
   * Add a new task to a task list
   */
  private addTask(args: ManageTasksToolParams): string {
    if (!args.taskListId || !args.title) {
      throw new Error('taskListId and title are required for add action');
    }

    try {
      const taskList = taskDatabase.getTaskList(args.taskListId);
      if (!taskList) {
        throw new Error(`Task list with ID "${args.taskListId}" not found`);
      }

      const task = taskDatabase.addTask(
        args.taskListId,
        args.title,
        args.description,
        args.priority,
        args.dueDate,
        args.tags,
      );

      return `Successfully added task "${args.title}" to task list "${taskList.name}". Task ID: ${task.id}`;
    } catch (error) {
      throw new Error(
        `Failed to add task: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Edit an existing task
   */
  private editTask(args: ManageTasksToolParams): string {
    if (!args.taskId) {
      throw new Error('taskId is required for edit action');
    }

    try {
      const existingTask = taskDatabase.getTask(args.taskId);
      if (!existingTask) {
        throw new Error(`Task with ID "${args.taskId}" not found`);
      }

      const updates: Partial<Omit<Task, 'id' | 'task_list_id' | 'created_at'>> = {};
      if (args.title !== undefined) updates.title = args.title;
      if (args.description !== undefined) updates.description = args.description;
      if (args.status !== undefined) updates.status = args.status;
      if (args.position !== undefined) updates.position = args.position;
      if (args.priority !== undefined) updates.priority = args.priority;
      if (args.dueDate !== undefined) updates.due_date = args.dueDate;
      if (args.tags !== undefined) updates.tags = args.tags;

      const updatedTask = taskDatabase.updateTask(args.taskId, updates);

      if (!updatedTask) {
        throw new Error('Failed to update task');
      }

      const taskList = taskDatabase.getTaskList(updatedTask.task_list_id);
      return `Successfully updated task "${updatedTask.title}" in task list "${taskList?.name || 'Unknown'}"`;
    } catch (error) {
      throw new Error(
        `Failed to edit task: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Delete a task
   */
  private deleteTask(args: ManageTasksToolParams): string {
    if (!args.taskId) {
      throw new Error('taskId is required for delete action');
    }

    try {
      const task = taskDatabase.getTask(args.taskId);
      if (!task) {
        throw new Error(`Task with ID "${args.taskId}" not found`);
      }

      const taskList = taskDatabase.getTaskList(task.task_list_id);
      const success = taskDatabase.deleteTask(args.taskId);

      if (!success) {
        throw new Error('Failed to delete task');
      }

      return `Successfully deleted task "${task.title}" from task list "${taskList?.name || 'Unknown'}"`;
    } catch (error) {
      throw new Error(
        `Failed to delete task: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Insert a task at a specific position
   */
  private insertTask(args: ManageTasksToolParams): string {
    if (!args.taskListId || !args.title || !args.position) {
      throw new Error('taskListId, title, and position are required for insert action');
    }

    try {
      const taskList = taskDatabase.getTaskList(args.taskListId);
      if (!taskList) {
        throw new Error(`Task list with ID "${args.taskListId}" not found`);
      }

      // First, add the task at the end
      const task = taskDatabase.addTask(
        args.taskListId,
        args.title,
        args.description,
        args.priority,
        args.dueDate,
        args.tags,
      );

      // Then move it to the desired position
      const updatedTask = taskDatabase.updateTask(task.id, {
        position: args.position,
      });

      if (!updatedTask) {
        throw new Error('Failed to set task position');
      }

      return `Successfully inserted task "${args.title}" at position ${args.position} in task list "${taskList.name}". Task ID: ${task.id}`;
    } catch (error) {
      throw new Error(
        `Failed to insert task: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
