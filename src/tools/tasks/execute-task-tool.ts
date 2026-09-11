import { z } from 'zod';
import { Tool, ToolHandler } from '../../registry';
import { logInfo } from '../../services/logger';
import { CatchErrors } from '../../utils';
import { taskDatabase } from './database';
import type { Task } from './types';

/**
 * Schema definition for the executeTask tool parameters
 */
export const ExecuteTaskToolSchema = z.object({
  action: z
    .enum(['getNext', 'complete'])
    .describe(
      'Action to perform: getNext to get next pending task, complete to mark task as completed',
    ),
  taskListId: z.string().optional().describe('ID of the task list (required for getNext action)'),
  taskId: z.string().optional().describe('ID of the task (required for complete action)'),
  markInProgress: z
    .boolean()
    .default(false)
    .optional()
    .describe('Mark task as in-progress when getting next task'),
  notes: z.string().optional().describe('Completion notes for complete action'),
});

/**
 * Type for the executeTask tool parameters
 */
export type ExecuteTaskToolParams = z.infer<typeof ExecuteTaskToolSchema>;

/**
 * executeTask - Get next pending task and mark tasks as completed in a unified execution workflow
 *
 * Enforces constraint: Only one task can be in progress at a time per task list.
 * Must complete current in-progress task before starting a new one.
 */
@Tool({
  id: 'execute-task',
  name: 'executeTask',
  description:
    'Get next pending task and mark tasks as completed in a unified execution workflow. Enforces one task in progress at a time per list.',
  category: 'Utility',
  parameters: ExecuteTaskToolSchema,
  annotations: {
    title: 'execute-task',
  },
})
export class ExecuteTaskTool implements ToolHandler {
  /**
   * Execute the tool
   */
  @CatchErrors()
  async execute(args: ExecuteTaskToolParams): Promise<string> {
    logInfo(`Executing executeTask with action: ${args.action}`);

    // taskDatabase calls below are synchronous; this await keeps `execute` genuinely
    // async so it matches the ToolHandler interface without a fake Promise wrapper.
    await Promise.resolve();

    switch (args.action) {
      case 'getNext':
        return this.getNextTask(args);
      case 'complete':
        return this.completeTask(args);
      default:
        throw new Error(`Invalid action: ${String(args.action)}`);
    }
  }

  /**
   * Get the next pending task from a task list
   */
  private getNextTask(args: ExecuteTaskToolParams): string {
    if (!args.taskListId) {
      throw new Error('taskListId is required for getNext action');
    }

    try {
      const taskList = taskDatabase.getTaskList(args.taskListId);
      if (!taskList) {
        throw new Error(`Task list with ID "${args.taskListId}" not found`);
      }

      // Check if there are any in-progress tasks
      const inProgressTasks = taskDatabase.getInProgressTasks(args.taskListId);

      if (inProgressTasks.length > 0) {
        const warningMessage: string[] = [
          `**⚠️ Cannot start new task - Task already in progress:**`,
          ``,
          `**Task List:** "${taskList.name}"`,
          `**In-Progress Task:** ${inProgressTasks[0].title}`,
          `**Task ID:** ${inProgressTasks[0].id}`,
          ``,
          `**📋 Next Steps:**`,
          `1. Complete the current in-progress task using:`,
          `   \`executeTask({ action: 'complete', taskId: '${inProgressTasks[0].id}', notes: 'your completion notes' })\``,
          `2. Then get the next task using:`,
          `   \`executeTask({ action: 'getNext', taskListId: '${args.taskListId}', markInProgress: true })\``,
          ``,
          `**💡 Constraint:** Only one task can be in progress at a time per task list.`,
        ];

        if (inProgressTasks[0].description) {
          warningMessage.splice(5, 0, `**Description:** ${inProgressTasks[0].description}`);
        }

        return warningMessage.join('\n');
      }

      const nextTask = taskDatabase.getNextTask(args.taskListId);

      if (!nextTask) {
        return `No pending tasks found in task list "${taskList.name}". All tasks may be completed or the list is empty.`;
      }

      // Mark as in-progress if requested
      if (args.markInProgress) {
        taskDatabase.updateTask(nextTask.id, { status: 'in_progress' });
      }

      const statusMessage = args.markInProgress ? ' (marked as in-progress)' : '';

      const result = [
        `**Next task from "${taskList.name}"${statusMessage}:**`,
        ``,
        `**ID:** ${nextTask.id}`,
        `**Title:** ${nextTask.title}`,
        `**Position:** ${nextTask.position}`,
        `**Status:** ${args.markInProgress ? 'in_progress' : nextTask.status}`,
        `**Created:** ${new Date(nextTask.created_at).toLocaleDateString()}`,
      ];

      if (nextTask.description) {
        result.push(`**Description:** ${nextTask.description}`);
      }

      if (nextTask.due_date) {
        result.push(`**Due Date:** ${new Date(nextTask.due_date).toLocaleDateString()}`);
      }

      if (nextTask.priority) {
        result.push(`**Priority:** ${nextTask.priority}`);
      }

      if (args.markInProgress) {
        result.push(``, `**📋 Next Steps:**`);
        result.push(`1. Work on this task`);
        result.push(
          `2. When complete, use: \`executeTask({ action: 'complete', taskId: '${nextTask.id}', notes: 'your completion notes' })\``,
        );
        result.push(
          `3. Then get next task: \`executeTask({ action: 'getNext', taskListId: '${args.taskListId}', markInProgress: true })\``,
        );
      } else {
        result.push(``, `**📋 To start working on this task:**`);
        result.push(
          `Use: \`executeTask({ action: 'getNext', taskListId: '${args.taskListId}', markInProgress: true })\``,
        );
      }

      return result.join('\n');
    } catch (error) {
      throw new Error(
        `Failed to get next task: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Mark a task as completed
   */
  private completeTask(args: ExecuteTaskToolParams): string {
    if (!args.taskId) {
      throw new Error('taskId is required for complete action');
    }

    try {
      const task = taskDatabase.getTask(args.taskId);
      if (!task) {
        throw new Error(`Task with ID "${args.taskId}" not found`);
      }

      if (task.status === 'completed') {
        return `Task "${task.title}" is already completed`;
      }

      const updates: Partial<Omit<Task, 'id' | 'task_list_id' | 'created_at'>> = {
        status: 'completed',
      };
      if (args.notes) {
        updates.description = task.description
          ? `${task.description}\n\n**Completion Notes:** ${args.notes}`
          : `**Completion Notes:** ${args.notes}`;
      }

      const updatedTask = taskDatabase.updateTask(args.taskId, updates);

      if (!updatedTask) {
        throw new Error('Failed to mark task as completed');
      }

      const taskList = taskDatabase.getTaskList(task.task_list_id);
      const completedAt = updatedTask.completed_at
        ? new Date(updatedTask.completed_at).toLocaleString()
        : 'now';

      return `Successfully completed task "${task.title}" in task list "${taskList?.name || 'Unknown'}" at ${completedAt}`;
    } catch (error) {
      throw new Error(
        `Failed to complete task: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
