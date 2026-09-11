import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { PostgreSQLBaseTool } from './base-tool';
import type { ToolConfig } from '../registry';

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Mock the postgresql-profile module
const mockGetPostgreSQLProfile = mock();
const mockListAvailablePostgreSQLProfiles = mock();

void mock.module('./postgresql-profile', () => ({
  getPostgreSQLProfile: mockGetPostgreSQLProfile,
  listAvailablePostgreSQLProfiles: mockListAvailablePostgreSQLProfiles,
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

// Test implementation of abstract base class
class TestPostgreSQLTool extends PostgreSQLBaseTool {
  async execute(_args: unknown): Promise<string> {
    return 'test result';
  }
}

describe('PostgreSQLBaseTool', () => {
  let tool: TestPostgreSQLTool;

  beforeEach(() => {
    tool = new TestPostgreSQLTool();
    mockGetPostgreSQLProfile.mockClear();
    mockListAvailablePostgreSQLProfiles.mockClear();
    mockQuery.mockClear();
    mockEnd.mockClear();
    mockConnect.mockClear();
  });

  describe('isEnabled', () => {
    it('should return true when profiles are available', () => {
      mockListAvailablePostgreSQLProfiles.mockReturnValue(['local', 'dev']);

      const result = tool.isEnabled({} as ToolConfig);

      expect(result).toBe(true);
      expect(mockListAvailablePostgreSQLProfiles).toHaveBeenCalled();
    });

    it('should return false when no profiles are available', () => {
      mockListAvailablePostgreSQLProfiles.mockReturnValue([]);

      const result = tool.isEnabled({} as ToolConfig);

      expect(result).toBe(false);
    });
  });

  describe('getConnectionConfig', () => {
    it('should get connection config with password auth', async () => {
      mockGetPostgreSQLProfile.mockReturnValue({
        host: 'localhost',
        port: 5432,
        user: 'testuser',
        password: 'testpass',
        database: 'testdb',
        authMethod: 'password',
      });

      const config = await tool['getConnectionConfig']('local');

      expect(config.host).toBe('localhost');
      expect(config.port).toBe(5432);
      expect(config.user).toBe('testuser');
      expect(config.password).toBe('testpass');
      expect(config.database).toBe('testdb');
    });

    it('should override database when specified', async () => {
      mockGetPostgreSQLProfile.mockReturnValue({
        host: 'localhost',
        port: 5432,
        user: 'testuser',
        password: 'testpass',
        database: 'defaultdb',
        authMethod: 'password',
      });

      const config = await tool['getConnectionConfig']('local', 'customdb');

      expect(config.database).toBe('customdb');
    });

    it('should handle SSL configuration', async () => {
      mockGetPostgreSQLProfile.mockReturnValue({
        host: 'localhost',
        port: 5432,
        user: 'testuser',
        password: 'testpass',
        ssl: true,
        authMethod: 'password',
      });

      const config = await tool['getConnectionConfig']('local');

      expect(config.ssl).toBe(true);
    });
  });

  describe('createClient', () => {
    it('should create and connect client successfully', async () => {
      mockGetPostgreSQLProfile.mockReturnValue({
        host: 'localhost',
        port: 5432,
        user: 'testuser',
        password: 'testpass',
        authMethod: 'password',
      });
      mockConnect.mockResolvedValue(undefined);

      const client = await tool['createClient']('local');

      expect(client).toBeDefined();
      expect(mockConnect).toHaveBeenCalled();
    });

    it('should handle connection errors', async () => {
      mockGetPostgreSQLProfile.mockReturnValue({
        host: 'localhost',
        port: 5432,
        user: 'testuser',
        password: 'testpass',
        authMethod: 'password',
      });
      mockConnect.mockRejectedValue(new Error('Connection refused'));

      let error: unknown;
      try {
        await tool['createClient']('local');
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(getErrorMessage(error)).toContain('Failed to connect');
    });
  });

  describe('executeQuery', () => {
    it('should execute query and return rows', async () => {
      mockGetPostgreSQLProfile.mockReturnValue({
        host: 'localhost',
        port: 5432,
        user: 'testuser',
        password: 'testpass',
        authMethod: 'password',
      });
      mockConnect.mockResolvedValue(undefined);
      mockQuery.mockResolvedValue({
        rows: [{ id: 1, name: 'test' }],
      });

      const rows = await tool['executeQuery']('SELECT * FROM users', [], 'local');

      expect(rows).toEqual([{ id: 1, name: 'test' }]);
      expect(mockConnect).toHaveBeenCalled();
      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM users', []);
      expect(mockEnd).toHaveBeenCalled();
    });

    it('should handle parameterized queries', async () => {
      mockGetPostgreSQLProfile.mockReturnValue({
        host: 'localhost',
        port: 5432,
        user: 'testuser',
        password: 'testpass',
        authMethod: 'password',
      });
      mockConnect.mockResolvedValue(undefined);
      mockQuery.mockResolvedValue({ rows: [] });

      await tool['executeQuery']('SELECT * FROM users WHERE id = $1', [123], 'local');

      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [123]);
    });

    it('should close client on error', async () => {
      mockGetPostgreSQLProfile.mockReturnValue({
        host: 'localhost',
        port: 5432,
        user: 'testuser',
        password: 'testpass',
        authMethod: 'password',
      });
      mockConnect.mockResolvedValue(undefined);
      mockQuery.mockRejectedValue(new Error('Query failed'));

      let error: unknown;
      try {
        await tool['executeQuery']('SELECT * FROM invalid', [], 'local');
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(mockEnd).toHaveBeenCalled();
    });
  });

  describe('validateIdentifier', () => {
    it('should accept valid identifiers', () => {
      expect(() => tool['validateIdentifier']('valid_name', 'Table')).not.toThrow();
      expect(() => tool['validateIdentifier']('table123', 'Table')).not.toThrow();
      expect(() => tool['validateIdentifier']('test-table', 'Table')).not.toThrow();
    });

    it('should reject empty identifiers', () => {
      let error: unknown;
      try {
        tool['validateIdentifier']('', 'Table');
      } catch (e) {
        error = e;
      }
      expect(error).toBeDefined();
      expect(getErrorMessage(error)).toContain('cannot be empty');
    });

    it('should reject identifiers over 63 characters', () => {
      const longName = 'a'.repeat(64);
      let error: unknown;
      try {
        tool['validateIdentifier'](longName, 'Table');
      } catch (e) {
        error = e;
      }
      expect(error).toBeDefined();
      expect(getErrorMessage(error)).toContain('too long');
    });

    it('should reject identifiers with invalid characters', () => {
      const invalidNames = ['table;drop', 'table"name', "table'name", 'table%name', 'table\\name'];

      for (const name of invalidNames) {
        let error: unknown;
        try {
          tool['validateIdentifier'](name, 'Table');
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
        expect(getErrorMessage(error)).toContain('invalid characters');
      }
    });
  });

  describe('escapeIdentifier', () => {
    it('should wrap identifier in double quotes', () => {
      expect(tool['escapeIdentifier']('tablename')).toBe('"tablename"');
    });

    it('should escape double quotes by doubling them', () => {
      expect(tool['escapeIdentifier']('table"name')).toBe('"table""name"');
    });

    it('should handle multiple double quotes', () => {
      expect(tool['escapeIdentifier']('ta"ble"name')).toBe('"ta""ble""name"');
    });
  });

  describe('IAM Authentication', () => {
    it('should handle IAM auth token generation errors', async () => {
      mockGetPostgreSQLProfile.mockReturnValue({
        host: 'test.rds.amazonaws.com',
        port: 5432,
        user: 'testuser',
        region: 'us-east-1',
        authMethod: 'iam',
      });

      // Mock AWS SDK to throw error
      void mock.module('@aws-sdk/rds-signer', () => ({
        Signer: mock(function (this: { getAuthToken: unknown }) {
          this.getAuthToken = mock(() => Promise.reject(new Error('AWS credentials not found')));
          return this;
        }),
      }));

      void mock.module('@aws-sdk/credential-providers', () => ({
        fromEnv: mock(() => ({})),
        fromIni: mock(() => ({})),
      }));

      let error: unknown;
      try {
        await tool['generateIAMAuthToken']('test.rds.amazonaws.com', 5432, 'testuser', 'us-east-1');
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(getErrorMessage(error)).toContain('Failed to generate authentication token');
    });

    it('should throw error when region is missing for IAM auth', async () => {
      mockGetPostgreSQLProfile.mockReturnValue({
        host: 'test.rds.amazonaws.com',
        port: 5432,
        user: 'testuser',
        authMethod: 'iam',
        // region is missing
      });

      let error: unknown;
      try {
        await tool['getConnectionConfig']('local');
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(getErrorMessage(error)).toContain('region is not configured');
    });
  });
});
