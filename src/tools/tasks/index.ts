/**
 * Task List Management Tools - Index
 *
 * This module provides comprehensive task list management capabilities
 * through 5 consolidated tools:
 *
 * 1. ManageTaskListsTool - Create, view, delete, and list task lists
 * 2. ManageTasksTool - Add, edit, delete, and insert tasks
 * 3. ExecuteTaskTool - Get next pending task and mark tasks complete
 * 4. ReorderTasksTool - Reorder tasks within task lists
 * 5. GetTaskStatisticsTool - Get analytics and completion statistics
 */

// Export all tool classes
export { ExecuteTaskTool } from './execute-task-tool';
export { GetTaskStatisticsTool } from './get-task-statistics-tool';
export { ManageTaskListsTool } from './manage-task-lists-tool';
export { ManageTasksTool } from './manage-tasks-tool';
export { ReorderTasksTool } from './reorder-tasks-tool';

// Export all types
export type { ExecuteTaskToolParams } from './execute-task-tool';
export type { GetTaskStatisticsToolParams } from './get-task-statistics-tool';
export type { ManageTaskListsToolParams } from './manage-task-lists-tool';
export type { ManageTasksToolParams } from './manage-tasks-tool';
export type { ReorderTasksToolParams } from './reorder-tasks-tool';
export * from './types';

// Export database service
export { taskDatabase } from './database';

// Export schemas for external use
export { ExecuteTaskToolSchema } from './execute-task-tool';
export { GetTaskStatisticsToolSchema } from './get-task-statistics-tool';
export { ManageTaskListsToolSchema } from './manage-task-lists-tool';
export { ManageTasksToolSchema } from './manage-tasks-tool';
export { ReorderTasksToolSchema } from './reorder-tasks-tool';
