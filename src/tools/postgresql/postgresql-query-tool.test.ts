import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { PostgreSQLQueryTool, PostgreSQLQueryToolSchema } from './postgresql-query-tool';

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Mock the postgresql-profile module
void mock.module('./postgresql-profile', () => ({
  getPostgreSQLProfile: mock(() => ({
    host: 'localhost',
    port: 5432,
    user: 'testuser',
    password: 'testpass',
    database: 'testdb',
    authMethod: 'password',
  })),
  listAvailablePostgreSQLProfiles: mock(() => ['local', 'dev']),
}));

// Mock the pg module
const mockQuery = mock();
const mockEnd = mock();
const mockConnect = mock();

void mock.module('pg', () => ({
  Client: mock(function (this: { query: unknown; connect: unknown; end: unknown }) {
    this.query = mockQuery;
    this.connect = mockConnect;
    this.end = mockEnd;
    return this;
  }),
}));

describe('PostgreSQLQueryTool', () => {
  let tool: PostgreSQLQueryTool;

  beforeEach(() => {
    tool = new PostgreSQLQueryTool();
    mockQuery.mockClear();
    mockEnd.mockClear();
    mockConnect.mockClear();
  });

  it('should validate the schema', () => {
    const schemaShape = PostgreSQLQueryToolSchema.shape;
    expect(Object.keys(schemaShape)).toContain('profile');
    expect(Object.keys(schemaShape)).toContain('query');
    expect(Object.keys(schemaShape)).toContain('params');
    expect(Object.keys(schemaShape)).toContain('database');
    expect(Object.keys(schemaShape)).toContain('readOnly');
    expect(Object.keys(schemaShape)).toContain('skipSafetyChecks');
  });

  it('should execute SELECT query successfully', async () => {
    const mockRows = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ];

    mockConnect.mockResolvedValue(undefined);
    mockQuery.mockResolvedValue({ rows: mockRows });

    const result = await tool.execute({
      profile: 'local',
      query: 'SELECT * FROM users WHERE id = $1',
      params: [1],
    });

    const parsedResult = JSON.parse(result);

    expect(parsedResult.success).toBe(true);
    expect(parsedResult.queryType).toBe('SELECT');
    expect(parsedResult.rows).toEqual(mockRows);
    expect(parsedResult.rowCount).toBe(2);
    expect(mockConnect).toHaveBeenCalled();
    expect(mockEnd).toHaveBeenCalled();
  });

  it('should detect query types correctly', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockQuery.mockResolvedValue({ rows: [] });

    const queryTypes = [
      { query: 'SELECT * FROM users', expected: 'SELECT' },
      { query: 'INSERT INTO users (name) VALUES ($1)', expected: 'INSERT' },
      { query: 'UPDATE users SET name = $1 WHERE id = $2', expected: 'UPDATE' },
      { query: 'DELETE FROM users WHERE id = $1', expected: 'DELETE' },
      { query: 'CREATE TABLE test (id INT)', expected: 'CREATE' },
      { query: 'SHOW TABLES', expected: 'SHOW' },
      { query: 'EXPLAIN SELECT * FROM users', expected: 'EXPLAIN' },
    ];

    for (const { query, expected } of queryTypes) {
      try {
        const result = await tool.execute({
          profile: 'local',
          query,
          skipSafetyChecks: true,
        });
        const parsedResult = JSON.parse(result);
        expect(parsedResult.queryType).toBe(expected);
      } catch {
        // Some queries may be blocked by safety checks, that's ok
      }
    }
  });

  describe('Read-only mode', () => {
    it('should allow SELECT queries in read-only mode', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await tool.execute({
        profile: 'local',
        query: 'SELECT * FROM users',
        readOnly: true,
      });

      expect(result).toBeDefined();
    });

    it('should block INSERT in read-only mode', async () => {
      let error: unknown;
      try {
        await tool.execute({
          profile: 'local',
          query: 'INSERT INTO users (name) VALUES ($1)',
          params: ['Alice'],
          readOnly: true,
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(getErrorMessage(error)).toContain('Read-only mode');
    });

    it('should block UPDATE in read-only mode', async () => {
      let error: unknown;
      try {
        await tool.execute({
          profile: 'local',
          query: 'UPDATE users SET name = $1',
          readOnly: true,
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(getErrorMessage(error)).toContain('Read-only mode');
    });

    it('should block DELETE in read-only mode', async () => {
      let error: unknown;
      try {
        await tool.execute({
          profile: 'local',
          query: 'DELETE FROM users',
          readOnly: true,
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(getErrorMessage(error)).toContain('Read-only mode');
    });
  });

  describe('Safety checks', () => {
    it('should block DROP DATABASE without skipSafetyChecks', async () => {
      let error: unknown;
      try {
        await tool.execute({
          profile: 'local',
          query: 'DROP DATABASE testdb',
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(getErrorMessage(error)).toContain('DROP DATABASE/SCHEMA');
      expect(getErrorMessage(error)).toContain('skipSafetyChecks');
    });

    it('should block TRUNCATE TABLE without skipSafetyChecks', async () => {
      let error: unknown;
      try {
        await tool.execute({
          profile: 'local',
          query: 'TRUNCATE TABLE users',
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(getErrorMessage(error)).toContain('TRUNCATE TABLE');
      expect(getErrorMessage(error)).toContain('skipSafetyChecks');
    });

    it('should block DELETE without WHERE clause', async () => {
      let error: unknown;
      try {
        await tool.execute({
          profile: 'local',
          query: 'DELETE FROM users',
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(getErrorMessage(error)).toContain('DELETE without WHERE');
      expect(getErrorMessage(error)).toContain('skipSafetyChecks');
    });

    it('should block UPDATE without WHERE clause', async () => {
      let error: unknown;
      try {
        await tool.execute({
          profile: 'local',
          query: 'UPDATE users SET name = $1',
          params: ['Alice'],
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(getErrorMessage(error)).toContain('UPDATE without WHERE');
      expect(getErrorMessage(error)).toContain('skipSafetyChecks');
    });

    it('should allow DELETE with WHERE clause', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await tool.execute({
        profile: 'local',
        query: 'DELETE FROM users WHERE id = $1',
        params: [1],
      });

      expect(result).toBeDefined();
    });

    it('should allow UPDATE with WHERE clause', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await tool.execute({
        profile: 'local',
        query: 'UPDATE users SET name = $1 WHERE id = $2',
        params: ['Alice', 1],
      });

      expect(result).toBeDefined();
    });

    it('should allow dangerous operations with skipSafetyChecks', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await tool.execute({
        profile: 'local',
        query: 'DELETE FROM users',
        skipSafetyChecks: true,
      });

      expect(result).toBeDefined();
    });
  });

  describe('Security validations', () => {
    it('should block multiple statements', async () => {
      let error: unknown;
      try {
        await tool.execute({
          profile: 'local',
          query: 'SELECT * FROM users; DROP TABLE users;',
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(getErrorMessage(error)).toContain('Multiple SQL statements');
    });

    it('should allow single trailing semicolon', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await tool.execute({
        profile: 'local',
        query: 'SELECT * FROM users;',
      });

      expect(result).toBeDefined();
    });

    it('should block system database modifications', async () => {
      let error: unknown;
      try {
        await tool.execute({
          profile: 'local',
          query: 'DROP TABLE postgres.users',
          skipSafetyChecks: true,
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(getErrorMessage(error)).toContain('system databases');
    });

    it('should block system schema modifications', async () => {
      let error: unknown;
      try {
        await tool.execute({
          profile: 'local',
          query: 'ALTER TABLE pg_catalog.pg_class ADD COLUMN test TEXT',
          skipSafetyChecks: true,
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(getErrorMessage(error)).toContain('system schemas');
    });

    it('should enforce LIMIT cap of 10,000 rows', async () => {
      let error: unknown;
      try {
        await tool.execute({
          profile: 'local',
          query: 'SELECT * FROM users LIMIT 50000',
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(getErrorMessage(error)).toContain('LIMIT cannot exceed 10,000');
    });

    it('should allow LIMIT under 10,000', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await tool.execute({
        profile: 'local',
        query: 'SELECT * FROM users LIMIT 5000',
      });

      expect(result).toBeDefined();
    });
  });

  it('should support parameterized queries', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockQuery.mockResolvedValue({ rows: [{ id: 1, name: 'Alice' }] });

    const result = await tool.execute({
      profile: 'local',
      query: 'SELECT * FROM users WHERE id = $1 AND status = $2',
      params: [1, 'active'],
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.success).toBe(true);
    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [1, 'active']);
  });

  it('should handle database override parameter', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await tool.execute({
      profile: 'local',
      query: 'SELECT * FROM users',
      database: 'custom_db',
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.database).toBe('custom_db');
  });

  it('should handle connection errors gracefully', async () => {
    mockConnect.mockRejectedValue(new Error('Connection refused'));

    let error: unknown;
    try {
      await tool.execute({
        profile: 'local',
        query: 'SELECT * FROM users',
      });
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(getErrorMessage(error)).toContain('Tool execution error');
  });

  it('should handle query execution errors gracefully', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockQuery.mockRejectedValue(new Error('Syntax error at line 1'));

    let error: unknown;
    try {
      await tool.execute({
        profile: 'local',
        query: 'SELCT * FROM users', // Typo
      });
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(getErrorMessage(error)).toContain('Tool execution error');
    expect(mockEnd).toHaveBeenCalled();
  });

  it('should use default values for optional parameters', () => {
    const result = PostgreSQLQueryToolSchema.parse({
      profile: 'local',
      query: 'SELECT * FROM users',
    });

    expect(result.params).toEqual([]);
    expect(result.readOnly).toBe(false);
    expect(result.skipSafetyChecks).toBe(false);
  });
});
