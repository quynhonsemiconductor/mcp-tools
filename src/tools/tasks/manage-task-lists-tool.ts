import { z } from 'zod';
import { Tool, ToolHandler } from '../../registry';
import { logInfo } from '../../services/logger';
import { CatchErrors } from '../../utils';
import { taskDatabase } from './database';

/**
 * Schema definition for the manageTaskLists tool parameters
 */
export const ManageTaskListsToolSchema = z.object({
  action: z
    .enum(['create', 'get', 'list', 'delete'])
    .describe('Action to perform: create, get, list, or delete'),
  taskListId: z
    .string()
    .optional()
    .describe('ID of the task list (required for get/delete actions)'),
  name: z.string().optional().describe('Name of the task list (required for create action)'),
  description: z
    .string()
    .optional()
    .describe('Description of the task list (optional for create action)'),
  status: z
    .enum(['active', 'archived', 'deleted'])
    .optional()
    .describe('Filter by status for list action'),
  confirm: z.boolean().optional().describe('Confirmation flag required for delete action'),
});

/**
 * Type for the manageTaskLists tool parameters
 */
export type ManageTaskListsToolParams = z.input<typeof ManageTaskListsToolSchema>;

/**
 * manageTaskLists - Create, view, delete, and list task lists with comprehensive management capabilities
 */
@Tool({
  id: 'manage-task-lists',
  name: 'manageTaskLists',
  description:
    'Create, view, delete, and list task lists with comprehensive management capabilities',
  category: 'Utility',
  parameters: ManageTaskListsToolSchema,
  annotations: {
    title: 'manage-task-lists',
  },
})
export class ManageTaskListsTool implements ToolHandler {
  /**
   * Execute the tool
   */
  @CatchErrors()
  async execute(args: ManageTaskListsToolParams): Promise<string> {
    logInfo(`Executing manageTaskLists with action: ${args.action}`);

    // taskDatabase calls below are synchronous; this await keeps `execute` genuinely
    // async so it matches the ToolHandler interface without a fake Promise wrapper.
    await Promise.resolve();

    switch (args.action) {
      case 'create':
        return this.createTaskList(args);
      case 'get':
        return this.getTaskList(args);
      case 'list':
        return this.listTaskLists(args);
      case 'delete':
        return this.deleteTaskList(args);
      default:
        throw new Error(`Invalid action: ${String(args.action)}`);
    }
  }

  /**
   * Create a new task list
   */
  private createTaskList(args: ManageTaskListsToolParams): string {
    if (!args.name) {
      throw new Error('Name is required for create action');
    }

    try {
      const taskList = taskDatabase.createTaskList(args.name, args.description);

      return `Successfully created task list "${args.name}" with ID: ${taskList.id}`;
    } catch (error) {
      throw new Error(
        `Failed to create task list: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get a specific task list by ID
   */
  private getTaskList(args: ManageTaskListsToolParams): string {
    if (!args.taskListId) {
      throw new Error('taskListId is required for get action');
    }

    try {
      const taskList = taskDatabase.getTaskList(args.taskListId);

      if (!taskList) {
        return `Task list with ID "${args.taskListId}" not found`;
      }

      const tasks = taskDatabase.getTasksForList(args.taskListId);

      const result = [
        `**Task List: ${taskList.name}**`,
        `ID: ${taskList.id}`,
        `Status: ${taskList.status}`,
        `Created: ${new Date(taskList.created_at).toISOString()}`,
        `Updated: ${new Date(taskList.updated_at).toISOString()}`,
        `Total Tasks: ${taskList.task_count || 0}`,
        `Completed: ${taskList.completed_count || 0}`,
        '',
      ];

      if (taskList.description) {
        result.splice(4, 0, `Description: ${taskList.description}`);
      }

      if (tasks.length > 0) {
        result.push('**Tasks:**');
        tasks.forEach((task, index) => {
          const statusIcon =
            task.status === 'completed'
              ? '✅'
              : task.status === 'in_progress'
                ? '🔄'
                : task.status === 'cancelled'
                  ? '❌'
                  : '⏳';
          result.push(`${index + 1}. ${statusIcon} ${task.title}`);
          if (task.description) {
            result.push(`   ${task.description}`);
          }
        });
      } else {
        result.push('No tasks in this list.');
      }

      return result.join('\n');
    } catch (error) {
      throw new Error(
        `Failed to get task list: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * List all task lists
   */
  private listTaskLists(args: ManageTaskListsToolParams): string {
    try {
      const taskLists = taskDatabase.listTaskLists(args.status);

      if (taskLists.length === 0) {
        const statusFilter = args.status ? ` with status "${args.status}"` : '';
        return `No task lists found${statusFilter}.`;
      }

      const result = ['**Task Lists:**', ''];

      taskLists.forEach((taskList, index) => {
        const completionRate = taskList.task_count
          ? Math.round(((taskList.completed_count || 0) / taskList.task_count) * 100)
          : 0;

        result.push(`${index + 1}. **${taskList.name}** (${taskList.id})`);
        result.push(
          `   Status: ${taskList.status} | Tasks: ${taskList.task_count || 0} | Completed: ${completionRate}%`,
        );

        if (taskList.description) {
          result.push(`   Description: ${taskList.description}`);
        }

        result.push(`   Created: ${new Date(taskList.created_at).toLocaleDateString()}`);
        result.push('');
      });

      return result.join('\n');
    } catch (error) {
      throw new Error(
        `Failed to list task lists: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Delete a task list
   */
  private deleteTaskList(args: ManageTaskListsToolParams): string {
    if (!args.taskListId) {
      throw new Error('taskListId is required for delete action');
    }

    if (!args.confirm) {
      throw new Error('Confirmation is required for delete action. Set confirm: true to proceed.');
    }

    try {
      const taskList = taskDatabase.getTaskList(args.taskListId);

      if (!taskList) {
        return `Task list with ID "${args.taskListId}" not found`;
      }

      const success = taskDatabase.deleteTaskList(args.taskListId);

      if (!success) {
        throw new Error('Failed to delete task list');
      }

      return `Successfully deleted task list "${taskList.name}" and all its tasks`;
    } catch (error) {
      throw new Error(
        `Failed to delete task list: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
