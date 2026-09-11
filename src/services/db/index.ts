import { Database } from 'bun:sqlite';

import fs from 'fs';
import path from 'path';

import { QNSC_MCP_DIR } from '../../config';
import { CallStatus, RegistryCall, ToolCall, ToolCallStatus } from './types';

// Define the database file path
const DB_PATH = path.join(QNSC_MCP_DIR, 'toolcalls.db');

/** Row shape returned by `PRAGMA table_info(...)`. */
interface PragmaColumn {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
}

/** Aggregated status count row returned by the `GROUP BY status` count queries. */
interface CallCountRow {
  status: string;
  count: number;
}

// Ensure the data directory exists
if (!fs.existsSync(QNSC_MCP_DIR)) {
  fs.mkdirSync(QNSC_MCP_DIR, { recursive: true });
}

/**
 * Database service for managing tool calls
 */
class DatabaseService {
  private db: Database | null = null;
  private initialized = false;

  /**
   * Get database instance, initializing if needed
   */
  private getDb(): Database {
    if (!this.db) {
      this.db = new Database(DB_PATH);
      this.initialize();
    }
    return this.db;
  }

  /**
   * Initialize database schema if needed
   */
  private initialize(): void {
    if (this.initialized) return;

    const db = this.getDb();

    // Check if tool_calls table exists
    const tableExists = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='tool_calls'")
      .get();

    if (!tableExists) {
      // Create the tool_calls table if it doesn't exist
      db.exec(`
        CREATE TABLE IF NOT EXISTS tool_calls (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          toolId TEXT NOT NULL,
          payload TEXT NOT NULL,
          runTimeMs INTEGER NOT NULL,
          status TEXT NOT NULL,
          result TEXT,
          source TEXT DEFAULT 'first-party',
          timestamp INTEGER DEFAULT (strftime('%s','now')),
          appVersion TEXT
        )
      `);
    } else {
      // Check if the source column exists
      const hasSourceColumn = (db.query('PRAGMA table_info(tool_calls)').all() as PragmaColumn[]).some(
        (col) => col.name === 'source',
      );

      if (!hasSourceColumn) {
        // Add source column if it doesn't exist
        db.exec(`ALTER TABLE tool_calls ADD COLUMN source TEXT DEFAULT 'first-party'`);

        // Update existing rows to set source to first-party
        db.exec(`UPDATE tool_calls SET source = 'first-party' WHERE source IS NULL`);
      }

      // Check if the appVersion column exists
      const hasAppVersionColumn = (
        db.query('PRAGMA table_info(tool_calls)').all() as PragmaColumn[]
      ).some((col) => col.name === 'appVersion');

      if (!hasAppVersionColumn) {
        // Add appVersion column if it doesn't exist
        db.exec(`ALTER TABLE tool_calls ADD COLUMN appVersion TEXT`);
      }
    }

    // Create the prompt_calls table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS prompt_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        promptId TEXT NOT NULL,
        payload TEXT NOT NULL,
        runTimeMs INTEGER NOT NULL,
        status TEXT NOT NULL,
        result TEXT,
        timestamp INTEGER DEFAULT (strftime('%s','now')),
        appVersion TEXT
      )
    `);

    // Add indices for better query performance
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tool_calls_tool_id ON tool_calls(toolId);
      CREATE INDEX IF NOT EXISTS idx_tool_calls_status ON tool_calls(status);
      CREATE INDEX IF NOT EXISTS idx_prompt_calls_prompt_id ON prompt_calls(promptId);
      CREATE INDEX IF NOT EXISTS idx_prompt_calls_status ON prompt_calls(status);
    `);

    this.initialized = true;
  }

  /**
   * Record a registry call in the database based on its type
   */
  async recordRegistryCall(call: RegistryCall): Promise<void> {
    if (call.itemType === 'tool') {
      await this.recordToolCall({
        toolId: call.itemId,
        payload: call.payload,
        runTimeMs: call.runTimeMs,
        status: call.status,
        result: call.result,
        source: call.source,
        appVersion: call.appVersion,
      });
    } else if (call.itemType === 'prompt') {
      await this.recordPromptCall(call);
    }
  }

  /**
   * Record a new tool call in the database
   *
   * Returns a Promise for interface consistency with the rest of the service, even though
   * the underlying bun:sqlite driver is synchronous.
   */
  recordToolCall(toolCall: ToolCall): Promise<void> {
    const db = this.getDb();
    const status = toolCall.status || 'success';

    db.run(
      'INSERT INTO tool_calls (toolId, payload, runTimeMs, status, result, source, appVersion) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        toolCall.toolId,
        toolCall.payload,
        toolCall.runTimeMs,
        status,
        toolCall.result || null,
        toolCall.source || 'first-party',
        toolCall.appVersion || null,
      ],
    );
    return Promise.resolve();
  }

  /**
   * Record a new prompt call in the database
   *
   * Returns a Promise for interface consistency with the rest of the service, even though
   * the underlying bun:sqlite driver is synchronous.
   */
  recordPromptCall(promptCall: RegistryCall): Promise<void> {
    if (promptCall.itemType !== 'prompt') {
      throw new Error('Invalid item type for prompt call');
    }

    const db = this.getDb();
    const status = promptCall.status || 'success';

    db.run(
      'INSERT INTO prompt_calls (promptId, payload, runTimeMs, status, result, appVersion) VALUES (?, ?, ?, ?, ?, ?)',
      [
        promptCall.itemId,
        promptCall.payload,
        promptCall.runTimeMs,
        status,
        promptCall.result || null,
        promptCall.appVersion || null,
      ],
    );
    return Promise.resolve();
  }

  /**
   * Get a prompt call by ID
   */
  getPromptCall(id: number): Promise<RegistryCall | null> {
    const row = this.getDb()
      .query(
        'SELECT id, promptId AS itemId, "prompt" AS itemType, payload, runTimeMs, status, result, timestamp, appVersion FROM prompt_calls WHERE id = $id',
      )
      .get({ $id: id }) as RegistryCall;

    return Promise.resolve(row || null);
  }

  /**
   * Retrieves the count of prompt calls with the specified ID from the database.
   */
  getPromptCallCount(promptId: string): Promise<CallCountRow[]> {
    return Promise.resolve(
      this.getDb()
        .query(
          'SELECT status, COUNT(*) as count FROM prompt_calls WHERE promptId = $promptId GROUP BY status',
        )
        .all({ $promptId: promptId }) as CallCountRow[],
    );
  }

  /**
   * Get all prompt calls
   */
  getAllPromptCalls(): Promise<RegistryCall[]> {
    return Promise.resolve(
      this.getDb()
        .query(
          'SELECT id, promptId AS itemId, "prompt" AS itemType, payload, runTimeMs, status, result, timestamp, appVersion FROM prompt_calls ORDER BY timestamp DESC',
        )
        .all() as RegistryCall[],
    );
  }

  /**
   * Get prompt calls for a specific prompt
   */
  getPromptCallsByPromptId(promptId: string): Promise<RegistryCall[]> {
    return Promise.resolve(
      this.getDb()
        .query(
          'SELECT id, promptId AS itemId, "prompt" AS itemType, payload, runTimeMs, status, result, timestamp, appVersion FROM prompt_calls WHERE promptId = $promptId ORDER BY timestamp DESC',
        )
        .all({ $promptId: promptId }) as RegistryCall[],
    );
  }

  /**
   * Get prompt calls by status
   */
  getPromptCallsByStatus(status: CallStatus): Promise<RegistryCall[]> {
    return Promise.resolve(
      this.getDb()
        .query(
          'SELECT id, promptId AS itemId, "prompt" AS itemType, payload, runTimeMs, status, result, timestamp, appVersion FROM prompt_calls WHERE status = $status ORDER BY timestamp DESC',
        )
        .all({ $status: status }) as RegistryCall[],
    );
  }

  /**
   * Get a tool call by ID
   */
  getToolCall(id: number): Promise<ToolCall | null> {
    const row = this.getDb()
      .query('SELECT * FROM tool_calls WHERE id = $id')
      .get({ $id: id }) as ToolCall;

    return Promise.resolve(row || null);
  }

  /**
   * Retrieves the count of tool calls with the specified ID from the database.
   */
  getToolCallCount(toolId: string): Promise<CallCountRow[]> {
    return Promise.resolve(
      this.getDb()
        .query(
          'SELECT status, COUNT(*) as count FROM tool_calls WHERE toolId = $toolId GROUP BY status',
        )
        .all({ $toolId: toolId }) as CallCountRow[],
    );
  }

  /**
   * Get all tool calls
   * @param limit Optional number of records to return
   */
  getAllToolCalls(limit?: number): Promise<ToolCall[]> {
    if (limit && limit > 0) {
      return Promise.resolve(
        this.getDb()
          .query('SELECT * FROM tool_calls ORDER BY timestamp DESC LIMIT ?')
          .all(limit) as ToolCall[],
      );
    }

    return Promise.resolve(
      this.getDb().query('SELECT * FROM tool_calls ORDER BY timestamp DESC').all() as ToolCall[],
    );
  }

  /**
   * Get tool calls for a specific tool
   */
  getToolCallsByToolId(toolId: string): Promise<ToolCall[]> {
    return Promise.resolve(
      this.getDb()
        .query('SELECT * FROM tool_calls WHERE toolId = $toolId ORDER BY timestamp DESC')
        .all({ $toolId: toolId }) as ToolCall[],
    );
  }

  /**
   * Get tool calls by status
   */
  getToolCallsByStatus(status: ToolCallStatus): Promise<ToolCall[]> {
    return Promise.resolve(
      this.getDb()
        .query('SELECT * FROM tool_calls WHERE status = $status ORDER BY timestamp DESC')
        .all({ $status: status }) as ToolCall[],
    );
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Export as a singleton
const dbService = new DatabaseService();
export default dbService;
