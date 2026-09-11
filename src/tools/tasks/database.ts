/**
 * Database service for Task List Management
 */
import { Database, type SQLQueryBindings } from 'bun:sqlite';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { QNSC_MCP_DIR } from '../../config';
import { logError, logInfo } from '../../services/logger';
import type {
  Task,
  TaskList,
  TaskListRow,
  TaskListStatus,
  TaskRow,
  TaskStatistics,
  TaskStatus,
} from './types';

/**
 * Task Database class for managing task lists and tasks
 */
export class TaskDatabase {
  private db: Database | null = null;
  private dbPath: string;

  constructor() {
    // Create database in QNSC_MCP_DIR/tasks.db
    const dbDir = QNSC_MCP_DIR;
    mkdirSync(dbDir, { recursive: true });
    this.dbPath = join(dbDir, 'tasks.db');
  }

  /**
   * Get database instance with initialization
   */
  private getDb(): Database {
    if (!this.db) {
      this.db = new Database(this.dbPath);
      this.initialize();
    }
    return this.db;
  }

  /**
   * Initialize database with schema creation
   */
  private initialize(): void {
    const db = this.db!;

    // Create task_lists table
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_lists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Create tasks table
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        task_list_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        position INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        due_date TEXT,
        priority TEXT,
        tags TEXT,
        FOREIGN KEY (task_list_id) REFERENCES task_lists(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for performance
    db.exec(`CREATE INDEX IF NOT EXISTS idx_task_lists_status ON task_lists(status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_list_id ON tasks(task_list_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_position ON tasks(task_list_id, position)`);

    logInfo('Task database initialized successfully');
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // Task List Operations

  /**
   * Create a new task list
   */
  createTaskList(name: string, description?: string): TaskList {
    const db = this.getDb();
    const now = new Date().toISOString();
    const id = randomUUID();

    const stmt = db.prepare(`
      INSERT INTO task_lists (id, name, description, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?)
    `);

    stmt.run(id, name, description || null, now, now);

    return {
      id,
      name,
      description,
      status: 'active',
      created_at: now,
      updated_at: now,
      task_count: 0,
      completed_count: 0,
    };
  }

  /**
   * Get a task list by ID
   */
  getTaskList(id: string): TaskList | null {
    const db = this.getDb();

    const stmt = db.prepare(`
      SELECT tl.*, 
             COUNT(t.id) as task_count,
             COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_count
      FROM task_lists tl
      LEFT JOIN tasks t ON tl.id = t.task_list_id AND t.status != 'cancelled'
      WHERE tl.id = ?
      GROUP BY tl.id
    `);

    const row = stmt.get(id) as
      | (TaskListRow & { task_count: number; completed_count: number })
      | null;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      status: row.status as TaskListStatus,
      created_at: row.created_at,
      updated_at: row.updated_at,
      task_count: row.task_count,
      completed_count: row.completed_count,
    };
  }

  /**
   * List all task lists
   */
  listTaskLists(status?: TaskListStatus): TaskList[] {
    const db = this.getDb();

    let query = `
      SELECT tl.*, 
             COUNT(t.id) as task_count,
             COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_count
      FROM task_lists tl
      LEFT JOIN tasks t ON tl.id = t.task_list_id AND t.status != 'cancelled'
    `;

    const params: SQLQueryBindings[] = [];
    if (status) {
      query += ` WHERE tl.status = ?`;
      params.push(status);
    }

    query += ` GROUP BY tl.id ORDER BY tl.created_at DESC`;

    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as (TaskListRow & {
      task_count: number;
      completed_count: number;
    })[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      status: row.status as TaskListStatus,
      created_at: row.created_at,
      updated_at: row.updated_at,
      task_count: row.task_count,
      completed_count: row.completed_count,
    }));
  }

  /**
   * Delete a task list
   */
  deleteTaskList(id: string): boolean {
    const db = this.getDb();

    // Use transaction to ensure data consistency
    const transaction = db.transaction(() => {
      // Delete all tasks in the list first (CASCADE should handle this, but being explicit)
      const deleteTasksStmt = db.prepare(`DELETE FROM tasks WHERE task_list_id = ?`);
      deleteTasksStmt.run(id);

      // Delete the task list
      const deleteListStmt = db.prepare(`DELETE FROM task_lists WHERE id = ?`);
      const result = deleteListStmt.run(id);

      return result.changes > 0;
    });

    return transaction();
  }

  // Task Operations

  /**
   * Add a new task to a task list
   */
  addTask(
    taskListId: string,
    title: string,
    description?: string,
    priority?: 'low' | 'medium' | 'high',
    dueDate?: string,
    tags?: string[],
  ): Task {
    const db = this.getDb();
    const now = new Date().toISOString();
    const id = randomUUID();

    // Get the next position
    const positionStmt = db.prepare(
      `SELECT COALESCE(MAX(position), 0) + 1 as next_position FROM tasks WHERE task_list_id = ?`,
    );
    const { next_position } = positionStmt.get(taskListId) as {
      next_position: number;
    };

    const stmt = db.prepare(`
      INSERT INTO tasks (id, task_list_id, title, description, status, position, created_at, updated_at, due_date, priority, tags)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      taskListId,
      title,
      description || null,
      next_position,
      now,
      now,
      dueDate || null,
      priority || null,
      tags ? JSON.stringify(tags) : null,
    );

    return {
      id,
      task_list_id: taskListId,
      title,
      description,
      status: 'pending',
      position: next_position,
      created_at: now,
      updated_at: now,
      due_date: dueDate,
      priority,
      tags,
    };
  }

  /**
   * Get a task by ID
   */
  getTask(id: string): Task | null {
    const db = this.getDb();

    const stmt = db.prepare(`SELECT * FROM tasks WHERE id = ?`);
    const row = stmt.get(id) as TaskRow | null;

    if (!row) return null;

    return this.mapTaskRowToTask(row);
  }

  /**
   * Get tasks for a task list
   */
  getTasksForList(taskListId: string, status?: TaskStatus): Task[] {
    const db = this.getDb();

    let query = `SELECT * FROM tasks WHERE task_list_id = ?`;
    const params: SQLQueryBindings[] = [taskListId];

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    query += ` ORDER BY position ASC`;

    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as TaskRow[];

    return rows.map((row) => this.mapTaskRowToTask(row));
  }

  /**
   * Update a task
   */
  updateTask(
    id: string,
    updates: Partial<Omit<Task, 'id' | 'task_list_id' | 'created_at'>>,
  ): Task | null {
    const db = this.getDb();
    const now = new Date().toISOString();

    // Build dynamic update query
    const updateFields: string[] = [];
    const values: SQLQueryBindings[] = [];

    if (updates.title !== undefined) {
      updateFields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      updateFields.push('description = ?');
      values.push(updates.description || null);
    }
    if (updates.status !== undefined) {
      updateFields.push('status = ?');
      values.push(updates.status);

      // Set completed_at when status changes to completed
      if (updates.status === 'completed') {
        updateFields.push('completed_at = ?');
        values.push(now);
      } else if (updates.completed_at === undefined) {
        updateFields.push('completed_at = ?');
        values.push(null);
      }
    }
    if (updates.position !== undefined) {
      updateFields.push('position = ?');
      values.push(updates.position);
    }
    if (updates.due_date !== undefined) {
      updateFields.push('due_date = ?');
      values.push(updates.due_date || null);
    }
    if (updates.priority !== undefined) {
      updateFields.push('priority = ?');
      values.push(updates.priority || null);
    }
    if (updates.tags !== undefined) {
      updateFields.push('tags = ?');
      values.push(updates.tags ? JSON.stringify(updates.tags) : null);
    }

    updateFields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    const stmt = db.prepare(`
      UPDATE tasks 
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `);

    const result = stmt.run(...values);

    if (result.changes === 0) return null;

    return this.getTask(id);
  }

  /**
   * Delete a task
   */
  deleteTask(id: string): boolean {
    const db = this.getDb();

    const stmt = db.prepare(`DELETE FROM tasks WHERE id = ?`);
    const result = stmt.run(id);

    return result.changes > 0;
  }

  /**
   * Get the next pending task from any task list
   */
  getNextTask(taskListId?: string): Task | null {
    const db = this.getDb();

    let query = `
      SELECT * FROM tasks 
      WHERE status = 'pending'
    `;
    const params: SQLQueryBindings[] = [];

    if (taskListId) {
      query += ` AND task_list_id = ?`;
      params.push(taskListId);
    }

    query += ` ORDER BY position ASC LIMIT 1`;

    const stmt = db.prepare(query);
    const row = stmt.get(...params) as TaskRow | null;

    if (!row) return null;

    return this.mapTaskRowToTask(row);
  }

  /**
   * Check if there are any in-progress tasks in a task list
   */
  hasInProgressTasks(taskListId: string): boolean {
    const db = this.getDb();

    const stmt = db.prepare(`
      SELECT COUNT(*) as count 
      FROM tasks 
      WHERE task_list_id = ? AND status = 'in_progress'
    `);

    const result = stmt.get(taskListId) as { count: number };
    return result.count > 0;
  }

  /**
   * Get all in-progress tasks in a task list
   */
  getInProgressTasks(taskListId: string): Task[] {
    const db = this.getDb();

    const stmt = db.prepare(`
      SELECT * FROM tasks 
      WHERE task_list_id = ? AND status = 'in_progress'
      ORDER BY position ASC
    `);

    const rows = stmt.all(taskListId) as TaskRow[];
    return rows.map((row) => this.mapTaskRowToTask(row));
  }

  /**
   * Reorder tasks within a task list
   */
  reorderTasks(taskListId: string, taskIds: string[]): boolean {
    const db = this.getDb();

    const transaction = db.transaction(() => {
      const stmt = db.prepare(
        `UPDATE tasks SET position = ?, updated_at = ? WHERE id = ? AND task_list_id = ?`,
      );
      const now = new Date().toISOString();

      for (let i = 0; i < taskIds.length; i++) {
        const result = stmt.run(i + 1, now, taskIds[i], taskListId);
        if (result.changes === 0) {
          throw new Error(`Task ${taskIds[i]} not found or not in task list ${taskListId}`);
        }
      }

      return true;
    });

    try {
      return transaction();
    } catch (error) {
      logError('Error reordering tasks:', error);
      return false;
    }
  }

  /**
   * Get task statistics and history
   */
  getStatistics(): TaskStatistics {
    const db = this.getDb();

    // Get overall statistics
    const overallStmt = db.prepare(`
      SELECT 
        COUNT(DISTINCT tl.id) as total_task_lists,
        COUNT(DISTINCT CASE WHEN tl.status = 'active' THEN tl.id END) as active_task_lists,
        COUNT(t.id) as total_tasks,
        COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
        COUNT(CASE WHEN t.status = 'pending' THEN 1 END) as pending_tasks,
        COUNT(CASE WHEN t.status = 'in_progress' THEN 1 END) as in_progress_tasks,
        COUNT(CASE WHEN t.status = 'cancelled' THEN 1 END) as cancelled_tasks
      FROM task_lists tl
      LEFT JOIN tasks t ON tl.id = t.task_list_id
      WHERE tl.status != 'deleted'
    `);

    const stats = overallStmt.get() as {
      total_task_lists: number;
      active_task_lists: number;
      total_tasks: number;
      completed_tasks: number;
      pending_tasks: number;
      in_progress_tasks: number;
      cancelled_tasks: number;
    };

    // Get recent completions
    const recentStmt = db.prepare(`
      SELECT * FROM tasks 
      WHERE status = 'completed' AND completed_at IS NOT NULL
      ORDER BY completed_at DESC 
      LIMIT 10
    `);

    const recentRows = recentStmt.all() as TaskRow[];
    const recent_completions = recentRows.map((row) => this.mapTaskRowToTask(row));

    // Get task lists summary
    const summaryStmt = db.prepare(`
      SELECT 
        tl.id,
        tl.name,
        COUNT(t.id) as total_tasks,
        COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks
      FROM task_lists tl
      LEFT JOIN tasks t ON tl.id = t.task_list_id AND t.status != 'cancelled'
      WHERE tl.status = 'active'
      GROUP BY tl.id, tl.name
      ORDER BY tl.name
    `);

    const summaryRows = summaryStmt.all() as Array<{
      id: string;
      name: string;
      total_tasks: number;
      completed_tasks: number;
    }>;

    const task_lists_summary = summaryRows.map((row) => ({
      ...row,
      completion_rate: row.total_tasks > 0 ? (row.completed_tasks / row.total_tasks) * 100 : 0,
    }));

    return {
      total_task_lists: stats.total_task_lists,
      active_task_lists: stats.active_task_lists,
      total_tasks: stats.total_tasks,
      completed_tasks: stats.completed_tasks,
      pending_tasks: stats.pending_tasks,
      in_progress_tasks: stats.in_progress_tasks,
      cancelled_tasks: stats.cancelled_tasks,
      completion_rate:
        stats.total_tasks > 0 ? (stats.completed_tasks / stats.total_tasks) * 100 : 0,
      recent_completions,
      task_lists_summary,
    };
  }

  /**
   * Helper method to map database row to Task object
   */
  private mapTaskRowToTask(row: TaskRow): Task {
    return {
      id: row.id,
      task_list_id: row.task_list_id,
      title: row.title,
      description: row.description || undefined,
      status: row.status as TaskStatus,
      position: row.position,
      created_at: row.created_at,
      updated_at: row.updated_at,
      completed_at: row.completed_at || undefined,
      due_date: row.due_date || undefined,
      priority: row.priority as 'low' | 'medium' | 'high' | undefined,
      tags: row.tags ? (JSON.parse(row.tags) as string[]) : undefined,
    };
  }
}

// Export singleton instance
export const taskDatabase = new TaskDatabase();
