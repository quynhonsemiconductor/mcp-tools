import { z } from 'zod';
import { Tool, ToolHandler } from '../../registry';
import { logInfo } from '../../services/logger';
import { CatchErrors } from '../../utils';
import { taskDatabase } from './database';

/**
 * Schema definition for the getTaskStatistics tool parameters
 */
export const GetTaskStatisticsToolSchema = z.object({
  taskListId: z
    .string()
    .optional()
    .describe('ID of specific task list (omit for global statistics)'),
  includeDetails: z.boolean().default(false).describe('Include detailed breakdown of statistics'),
  includeHistory: z.boolean().default(false).describe('Include task completion history'),
});

/**
 * Type for the getTaskStatistics tool parameters
 */
export type GetTaskStatisticsToolParams = z.input<typeof GetTaskStatisticsToolSchema>;

/**
 * getTaskStatistics - Get task completion statistics and history with comprehensive analytics
 */
@Tool({
  id: 'get-task-statistics',
  name: 'getTaskStatistics',
  description: 'Get task completion statistics and history with comprehensive analytics',
  category: 'Utility',
  parameters: GetTaskStatisticsToolSchema,
  annotations: {
    title: 'get-task-statistics',
    readOnlyHint: true,
  },
})
export class GetTaskStatisticsTool implements ToolHandler {
  /**
   * Execute the tool
   */
  @CatchErrors()
  async execute(args: GetTaskStatisticsToolParams): Promise<string> {
    logInfo(
      `Executing getTaskStatistics${args.taskListId ? ` for task list: ${args.taskListId}` : ' (global)'}`,
    );

    // taskDatabase calls below are synchronous; this await keeps `execute` genuinely
    // async so it matches the ToolHandler interface without a fake Promise wrapper.
    await Promise.resolve();

    try {
      let taskList = null;
      if (args.taskListId) {
        taskList = taskDatabase.getTaskList(args.taskListId);
        if (!taskList) {
          throw new Error(`Task list with ID "${args.taskListId}" not found`);
        }
      }

      const stats = taskDatabase.getStatistics();

      const result = [];

      if (args.taskListId && taskList) {
        result.push(`**Statistics for Task List: ${taskList.name}**`);

        // Get specific task list stats
        const tasks = taskDatabase.getTasksForList(args.taskListId);
        const completed = tasks.filter((t) => t.status === 'completed').length;
        const pending = tasks.filter((t) => t.status === 'pending').length;
        const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
        const cancelled = tasks.filter((t) => t.status === 'cancelled').length;
        const completionRate = tasks.length > 0 ? (completed / tasks.length) * 100 : 0;

        result.push('');
        result.push(`**Summary:**`);
        result.push(`- Total Tasks: ${tasks.length}`);
        result.push(`- Completed: ${completed} (${completionRate.toFixed(1)}%)`);
        result.push(`- Pending: ${pending}`);
        result.push(`- In Progress: ${inProgress}`);
        result.push(`- Cancelled: ${cancelled}`);
        result.push(`- Created: ${new Date(taskList.created_at).toLocaleDateString()}`);
        result.push(`- Last Updated: ${new Date(taskList.updated_at).toLocaleDateString()}`);

        if (args.includeDetails && tasks.length > 0) {
          result.push('');
          result.push('**Detailed Breakdown:**');
          result.push(`- Completion Rate: ${completionRate.toFixed(2)}%`);
          result.push(`- Active Tasks: ${pending + inProgress}`);
          result.push(
            `- Progress Ratio: ${(((completed + inProgress) / tasks.length) * 100).toFixed(1)}%`,
          );
        }

        if (args.includeHistory) {
          const completedTasks = tasks.filter((t) => t.status === 'completed' && t.completed_at);
          if (completedTasks.length > 0) {
            result.push('');
            result.push('**Recent Completions:**');
            completedTasks
              .sort(
                (a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime(),
              )
              .slice(0, 10)
              .forEach((task, index) => {
                result.push(
                  `${index + 1}. ${task.title} - ${new Date(task.completed_at!).toLocaleDateString()}`,
                );
              });
          } else {
            result.push('');
            result.push('**Recent Completions:** None');
          }
        }
      } else {
        result.push('**Global Task Statistics**');
        result.push('');
        result.push(`**Summary:**`);
        result.push(`- Total Task Lists: ${stats.total_task_lists}`);
        result.push(`- Active Task Lists: ${stats.active_task_lists}`);
        result.push(`- Total Tasks: ${stats.total_tasks}`);
        result.push(`- Completed: ${stats.completed_tasks} (${stats.completion_rate.toFixed(1)}%)`);
        result.push(`- Pending: ${stats.pending_tasks}`);
        result.push(`- In Progress: ${stats.in_progress_tasks}`);
        result.push(`- Cancelled: ${stats.cancelled_tasks}`);

        if (args.includeDetails && stats.total_tasks > 0) {
          result.push('');
          result.push('**Detailed Breakdown:**');
          result.push(`- Overall Completion Rate: ${stats.completion_rate.toFixed(2)}%`);
          result.push(`- Active Tasks: ${stats.pending_tasks + stats.in_progress_tasks}`);
          result.push(
            `- Progress Ratio: ${(((stats.completed_tasks + stats.in_progress_tasks) / stats.total_tasks) * 100).toFixed(1)}%`,
          );

          if (stats.task_lists_summary.length > 0) {
            result.push('');
            result.push('**Task List Summary:**');
            stats.task_lists_summary.forEach((summary, index) => {
              result.push(
                `${index + 1}. **${summary.name}**: ${summary.total_tasks} tasks, ${summary.completion_rate.toFixed(1)}% complete`,
              );
            });
          }
        }

        if (args.includeHistory && stats.recent_completions.length > 0) {
          result.push('');
          result.push('**Recent Completions:**');
          stats.recent_completions.forEach((task, index) => {
            const completedDate = task.completed_at
              ? new Date(task.completed_at).toLocaleDateString()
              : 'Unknown';
            result.push(`${index + 1}. ${task.title} - ${completedDate}`);
          });
        } else if (args.includeHistory) {
          result.push('');
          result.push('**Recent Completions:** None');
        }
      }

      return result.join('\n');
    } catch (error) {
      throw new Error(
        `Failed to get task statistics: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
