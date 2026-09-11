import { z } from 'zod';
import { Tool, ToolHandler } from '../../registry';
import { logInfo } from '../../services/logger';
import { CatchErrors } from '../../utils';
import { taskDatabase } from './database';

/**
 * Schema definition for the reorderTasks tool parameters
 */
export const ReorderTasksToolSchema = z.object({
  taskListId: z.string().min(1).describe('ID of the task list containing the tasks to reorder'),
  taskIds: z
    .array(z.string())
    .describe(
      'Array of task IDs in the desired order (first ID will be position 1, second will be position 2, etc.)',
    ),
});

/**
 * Type for the reorderTasks tool parameters
 */
export type ReorderTasksToolParams = z.input<typeof ReorderTasksToolSchema>;

/**
 * reorderTasks - Reorder tasks within a task list by updating their positions
 */
@Tool({
  id: 'reorder-tasks',
  name: 'reorderTasks',
  description: 'Reorder tasks within a task list by updating their positions',
  category: 'Utility',
  parameters: ReorderTasksToolSchema,
  annotations: {
    title: 'reorder-tasks',
  },
})
export class ReorderTasksTool implements ToolHandler {
  /**
   * Execute the tool
   */
  @CatchErrors()
  async execute(args: ReorderTasksToolParams): Promise<string> {
    logInfo(`Executing reorderTasks for task list: ${args.taskListId}`);

    // taskDatabase calls below are synchronous; this await keeps `execute` genuinely
    // async so it matches the ToolHandler interface without a fake Promise wrapper.
    await Promise.resolve();

    try {
      const taskList = taskDatabase.getTaskList(args.taskListId);
      if (!taskList) {
        throw new Error(`Task list with ID "${args.taskListId}" not found`);
      }

      if (args.taskIds.length === 0) {
        throw new Error('At least one task ID must be provided');
      }

      // Verify all task IDs exist and belong to the task list
      const tasks = args.taskIds.map((taskId) => {
        const task = taskDatabase.getTask(taskId);
        if (!task) {
          throw new Error(`Task with ID "${taskId}" not found`);
        }
        if (task.task_list_id !== args.taskListId) {
          throw new Error(`Task "${taskId}" does not belong to task list "${args.taskListId}"`);
        }
        return task;
      });

      // Reorder the tasks
      const success = taskDatabase.reorderTasks(args.taskListId, args.taskIds);

      if (!success) {
        throw new Error('Failed to reorder tasks');
      }

      const reorderedCount = args.taskIds.length;
      const taskTitles = tasks.map((task, index) => `${index + 1}. ${task.title}`).join('\n');

      return [
        `Successfully reordered ${reorderedCount} task${reorderedCount > 1 ? 's' : ''} in task list "${taskList.name}":`,
        '',
        '**New order:**',
        taskTitles,
      ].join('\n');
    } catch (error) {
      throw new Error(
        `Failed to reorder tasks: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
