import { z } from 'zod';
import { Tool } from '../../registry';
import { logInfo } from '../../services/logger';
import { CatchErrors, throwQueryError } from '../../utils';
import { PostgreSQLBaseTool } from './base-tool';

/**
 * PostgreSQL List Databases Tool
 *
 * This tool lists all databases on the PostgreSQL server.
 *
 * Profile Configuration (Required):
 * - POSTGRES_PROFILE_{PROFILE_NAME}_HOST: Database host address
 * - POSTGRES_PROFILE_{PROFILE_NAME}_PORT: Database port (default: 5432)
 * - POSTGRES_PROFILE_{PROFILE_NAME}_USER: Database username
 * - POSTGRES_PROFILE_{PROFILE_NAME}_PASSWORD: Database password
 * - POSTGRES_PROFILE_{PROFILE_NAME}_DATABASE: Default database name (optional)
 * - POSTGRES_PROFILE_{PROFILE_NAME}_SSL: Enable SSL (true/false, default: false)
 *
 * Usage Example:
 * {
 *   "profile": "local",
 *   "includeSystemDatabases": false
 * }
 */

/**
 * Schema definition for the postgresListDatabases tool parameters
 */
export const PostgreSQLListDatabasesToolSchema = z.object({
  profile: z
    .string()
    .describe('PostgreSQL profile name to use (e.g., "local", "dev", "production")'),
  includeSystemDatabases: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Include system databases (postgres, template0, template1) in results (default: false)',
    ),
});

/**
 * Type for the postgresListDatabases tool parameters
 */
export type PostgreSQLListDatabasesToolParams = z.input<typeof PostgreSQLListDatabasesToolSchema>;

/**
 * Row shape returned by the pg_database query
 */
interface DatabaseInfoRow {
  datname: string;
  encoding: string;
  datcollate: string;
  datctype: string;
  datconnlimit: number;
  datistemplate: boolean;
}

/**
 * postgresListDatabases - List all databases on PostgreSQL server
 */
@Tool({
  id: 'postgres-list-databases',
  name: 'postgresListDatabases',
  description:
    'List all databases on the PostgreSQL server. Prefer this over postgresQuery("SELECT datname FROM pg_database"). Returns database names with encoding, collation, and connection settings. System databases (postgres, template0, template1) are excluded by default.',
  category: 'PostgreSQL',
  parameters: PostgreSQLListDatabasesToolSchema,
  version: '1.0.0',
  annotations: {
    title: 'PostgreSQL List Databases',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
})
export class PostgreSQLListDatabasesTool extends PostgreSQLBaseTool {
  /**
   * Execute the list databases query
   */
  @CatchErrors()
  async execute(args: PostgreSQLListDatabasesToolParams): Promise<string> {
    logInfo(
      `Listing PostgreSQL databases using profile "${args.profile}" (includeSystemDatabases: ${args.includeSystemDatabases})`,
    );

    // Build query - exclude system databases by default
    let query = `
      SELECT
        datname,
        pg_encoding_to_char(encoding) as encoding,
        datcollate,
        datctype,
        datconnlimit,
        datistemplate
      FROM pg_database
      WHERE datallowconn = true
    `;

    if (!args.includeSystemDatabases) {
      query += `
        AND datname NOT IN ('postgres', 'template0', 'template1')
        AND NOT datistemplate
      `;
    }

    query += `
      ORDER BY datname
    `;

    try {
      const rows = (await this.executeQuery(
        query,
        [],
        args.profile,
      )) as unknown as DatabaseInfoRow[];

      if (rows.length === 0) {
        return JSON.stringify({
          success: true,
          databases: [],
          count: 0,
          message: 'No databases found',
        });
      }

      // Format output
      const databases = rows.map((row) => ({
        name: row.datname,
        encoding: row.encoding,
        collation: row.datcollate,
        ctype: row.datctype,
        connectionLimit: row.datconnlimit,
        isTemplate: row.datistemplate,
      }));

      return JSON.stringify({
        success: true,
        databases,
        count: databases.length,
        profile: args.profile,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throwQueryError('list PostgreSQL databases', message);
    }
  }
}
