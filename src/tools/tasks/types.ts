/**
 * Type definitions for the Task List Management system
 */

/**
 * Status types for tasks
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

/**
 * Status types for task lists
 */
export type TaskListStatus = 'active' | 'archived' | 'deleted';

/**
 * Action types for task list management
 */
export type TaskListAction = 'create' | 'get' | 'list' | 'delete';

/**
 * Action types for task management
 */
export type TaskAction = 'add' | 'edit' | 'delete' | 'insert';

/**
 * Action types for task execution
 */
export type ExecuteAction = 'getNext' | 'complete';

/**
 * Task List interface
 */
export interface TaskList {
  id: string;
  name: string;
  description?: string;
  status: TaskListStatus;
  created_at: string;
  updated_at: string;
  task_count?: number;
  completed_count?: number;
}

/**
 * Task interface
 */
export interface Task {
  id: string;
  task_list_id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  position: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  due_date?: string;
  priority?: 'low' | 'medium' | 'high';
  tags?: string[];
}

/**
 * Task Statistics interface
 */
export interface TaskStatistics {
  total_task_lists: number;
  active_task_lists: number;
  total_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  in_progress_tasks: number;
  cancelled_tasks: number;
  completion_rate: number;
  recent_completions: Task[];
  task_lists_summary: Array<{
    id: string;
    name: string;
    total_tasks: number;
    completed_tasks: number;
    completion_rate: number;
  }>;
}

/**
 * Database row interfaces for internal use
 */
export interface TaskListRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: string;
  task_list_id: string;
  title: string;
  description: string | null;
  status: string;
  position: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  due_date: string | null;
  priority: string | null;
  tags: string | null;
}
