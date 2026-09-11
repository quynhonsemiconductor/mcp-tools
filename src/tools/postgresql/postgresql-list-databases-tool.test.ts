import { beforeEach, describe, expect, it, mock } from 'bun:test';
import {
  PostgreSQLListDatabasesTool,
  PostgreSQLListDatabasesToolSchema,
} from './postgresql-list-databases-tool';

// Mock the postgresql-profile module
// mock.module's factory here is synchronous, so the returned Promise|void is never pending; fire-and-forget by design
void mock.module('./postgresql-profile', () => ({
  getPostgreSQLProfile: mock(() => ({
    host: 'localhost',
    port: 5432,
    user: 'testuser',
    password: 'testpass',
    database: 'postgres',
    authMethod: 'password',
  })),
  listAvailablePostgreSQLProfiles: mock(() => ['local', 'dev']),
}));

// Mock the pg module
const mockQuery = mock();
const mockEnd = mock();
const mockConnect = mock();

// mock.module's factory here is synchronous, so the returned Promise|void is never pending; fire-and-forget by design
void mock.module('pg', () => ({
  Client: mock(function (this: { query: unknown; connect: unknown; end: unknown }) {
    this.query = mockQuery;
    this.connect = mockConnect;
    this.end = mockEnd;
    return this;
  }),
}));

describe('PostgreSQLListDatabasesTool', () => {
  let tool: PostgreSQLListDatabasesTool;

  beforeEach(() => {
    tool = new PostgreSQLListDatabasesTool();
    mockQuery.mockClear();
    mockEnd.mockClear();
    mockConnect.mockClear();
  });

  it('should validate the schema', () => {
    const schemaShape = PostgreSQLListDatabasesToolSchema.shape;
    expect(Object.keys(schemaShape)).toContain('profile');
    expect(Object.keys(schemaShape)).toContain('includeSystemDatabases');
  });

  it('should execute successfully and list databases', async () => {
    const mockDatabases = [
      {
        datname: 'myapp_db',
        encoding: 'UTF8',
        datcollate: 'en_US.UTF-8',
        datctype: 'en_US.UTF-8',
        datconnlimit: -1,
        datistemplate: false,
      },
      {
        datname: 'test_db',
        encoding: 'UTF8',
        datcollate: 'en_US.UTF-8',
        datctype: 'en_US.UTF-8',
        datconnlimit: -1,
        datistemplate: false,
      },
    ];

    mockConnect.mockResolvedValue(undefined);
    mockQuery.mockResolvedValue({ rows: mockDatabases });

    const result = await tool.execute({
      profile: 'local',
      includeSystemDatabases: false,
    });

    const parsedResult = JSON.parse(result);

    expect(parsedResult.success).toBe(true);
    expect(parsedResult.databases).toHaveLength(2);
    expect(parsedResult.databases[0].name).toBe('myapp_db');
    expect(parsedResult.count).toBe(2);
    expect(parsedResult.profile).toBe('local');
    expect(mockConnect).toHaveBeenCalled();
    expect(mockEnd).toHaveBeenCalled();
  });

  it('should exclude system databases by default', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockQuery.mockResolvedValue({ rows: [] });

    await tool.execute({
      profile: 'local',
    });

    const queryCall = mockQuery.mock.calls[0][0];
    expect(queryCall).toContain("datname NOT IN ('postgres', 'template0', 'template1')");
    expect(queryCall).toContain('NOT datistemplate');
  });

  it('should include system databases when requested', async () => {
    const mockDatabases = [
      {
        datname: 'postgres',
        encoding: 'UTF8',
        datcollate: 'en_US.UTF-8',
        datctype: 'en_US.UTF-8',
        datconnlimit: -1,
        datistemplate: false,
      },
      {
        datname: 'template0',
        encoding: 'UTF8',
        datcollate: 'en_US.UTF-8',
        datctype: 'en_US.UTF-8',
        datconnlimit: -1,
        datistemplate: true,
      },
      {
        datname: 'myapp',
        encoding: 'UTF8',
        datcollate: 'en_US.UTF-8',
        datctype: 'en_US.UTF-8',
        datconnlimit: -1,
        datistemplate: false,
      },
    ];

    mockConnect.mockResolvedValue(undefined);
    mockQuery.mockResolvedValue({ rows: mockDatabases });

    const result = await tool.execute({
      profile: 'local',
      includeSystemDatabases: true,
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.databases).toHaveLength(3);

    const queryCall = mockQuery.mock.calls[0][0];
    expect(queryCall).not.toContain("datname NOT IN ('postgres', 'template0', 'template1')");
  });

  it('should return empty result when no databases found', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await tool.execute({
      profile: 'local',
    });

    const parsedResult = JSON.parse(result);

    expect(parsedResult.success).toBe(true);
    expect(parsedResult.databases).toEqual([]);
    expect(parsedResult.count).toBe(0);
    expect(parsedResult.message).toBe('No databases found');
  });

  it('should handle connection errors gracefully', async () => {
    mockConnect.mockRejectedValue(new Error('Connection refused'));

    let error: unknown;
    try {
      await tool.execute({
        profile: 'local',
      });
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error instanceof Error ? error.message : String(error)).toContain(
      'Tool execution error',
    );
    // Note: mockEnd is NOT called when connection fails because client is never created
  });

  it('should handle query execution errors gracefully', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockQuery.mockRejectedValue(new Error('Query failed: permission denied'));

    let error: unknown;
    try {
      await tool.execute({
        profile: 'local',
      });
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error instanceof Error ? error.message : String(error)).toContain(
      'Tool execution error',
    );
    expect(mockEnd).toHaveBeenCalled();
  });

  it('should validate profile parameter is required', () => {
    const result = PostgreSQLListDatabasesToolSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should use default value for includeSystemDatabases', () => {
    const result = PostgreSQLListDatabasesToolSchema.parse({
      profile: 'local',
    });
    expect(result.includeSystemDatabases).toBe(false);
  });

  it('should format database information correctly', async () => {
    const mockDatabase = {
      datname: 'myapp',
      encoding: 'UTF8',
      datcollate: 'en_US.UTF-8',
      datctype: 'en_US.UTF-8',
      datconnlimit: 100,
      datistemplate: false,
    };

    mockConnect.mockResolvedValue(undefined);
    mockQuery.mockResolvedValue({ rows: [mockDatabase] });

    const result = await tool.execute({
      profile: 'local',
    });

    const parsedResult = JSON.parse(result);
    const db = parsedResult.databases[0];

    expect(db.name).toBe('myapp');
    expect(db.encoding).toBe('UTF8');
    expect(db.collation).toBe('en_US.UTF-8');
    expect(db.ctype).toBe('en_US.UTF-8');
    expect(db.connectionLimit).toBe(100);
    expect(db.isTemplate).toBe(false);
  });
});
