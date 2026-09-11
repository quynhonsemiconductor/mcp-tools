import { z } from 'zod';
import { Tool } from '../../registry';
import { logInfo } from '../../services/logger';
import { CatchErrors } from '../../utils';
import { PostgreSQLBaseTool } from './base-tool';

/**
 * PostgreSQL List Tables Tool
 *
 * This tool lists all tables in a PostgreSQL database with schema support.
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
 *   "database": "myapp",
 *   "schema": "public",
 *   "includeViews": false
 * }
 */

/**
 * Schema definition for the postgresListTables tool parameters
 */
export const PostgreSQLListTablesToolSchema = z.object({
  profile: z
    .string()
    .describe('PostgreSQL profile name to use (e.g., "local", "dev", "production")'),
  database: z
    .string()
    .optional()
    .describe('Database name to list tables from (uses profile database if not provided)'),
  schema: z
    .string()
    .optional()
    .default('public')
    .describe('Schema name to filter by (default: "public")'),
  includeViews: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include views in the results (default: false)'),
});

/**
 * Type for the postgresListTables tool parameters
 */
export type PostgreSQLListTablesToolParams = z.input<typeof PostgreSQLListTablesToolSchema>;

/**
 * Row shape returned by the pg_tables / pg_views queries
 */
interface TableInfoRow {
  schemaname: string;
  tablename: string;
  tableowner: string;
  total_size: string | null;
  table_size: string | null;
  indexes_size: string | null;
  type?: string;
}

/**
 * postgresListTables - List tables in a PostgreSQL database with schema support
 */
@Tool({
  id: 'postgres-list-tables',
  name: 'postgresListTables',
  description:
    'List tables in a database with schema support. Prefer this over postgresQuery("SELECT * FROM information_schema.tables"). Returns table names with schema, owner, and size information. System schemas (pg_catalog, information_schema) are excluded.',
  category: 'PostgreSQL',
  parameters: PostgreSQLListTablesToolSchema,
  version: '1.0.0',
  annotations: {
    title: 'PostgreSQL List Tables',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
})
export class PostgreSQLListTablesTool extends PostgreSQLBaseTool {
  /**
   * Execute the list tables query
   */
  @CatchErrors()
  async execute(args: PostgreSQLListTablesToolParams): Promise<string> {
    logInfo(
      `Listing PostgreSQL tables using profile "${args.profile}" (schema: ${args.schema || 'public'}, includeViews: ${args.includeViews})`,
    );

    // Validate schema name
    const schema = args.schema || 'public';
    this.validateIdentifier(schema, 'Schema name');

    // Build query for tables
    let query = `
      SELECT
        schemaname,
        tablename,
        tableowner,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
        pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
        pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as indexes_size
      FROM pg_tables
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    `;

    // Add schema filter if specified
    if (schema) {
      query += ` AND schemaname = $1`;
    }

    query += `
      ORDER BY schemaname, tablename
    `;

    try {
      const params = schema ? [schema] : [];
      const rows = (await this.executeQuery(
        query,
        params,
        args.profile,
        args.database,
      )) as unknown as TableInfoRow[];

      let allResults = [...rows];

      // If includeViews is true, also fetch views
      if (args.includeViews) {
        let viewQuery = `
          SELECT
            schemaname,
            viewname as tablename,
            viewowner as tableowner,
            NULL as total_size,
            NULL as table_size,
            NULL as indexes_size,
            'VIEW' as type
          FROM pg_views
          WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        `;

        if (schema) {
          viewQuery += ` AND schemaname = $1`;
        }

        viewQuery += `
          ORDER BY schemaname, viewname
        `;

        const viewRows = (await this.executeQuery(
          viewQuery,
          params,
          args.profile,
          args.database,
        )) as unknown as TableInfoRow[];

        allResults = [...allResults, ...viewRows];
      }

      if (allResults.length === 0) {
        return JSON.stringify({
          success: true,
          tables: [],
          count: 0,
          message: `No tables found in schema "${schema}"`,
          schema,
        });
      }

      // Format output
      const tables = allResults.map((row) => ({
        schema: row.schemaname,
        name: row.tablename,
        owner: row.tableowner,
        totalSize: row.total_size,
        tableSize: row.table_size,
        indexesSize: row.indexes_size,
        type: row.type || 'TABLE',
      }));

      return JSON.stringify({
        success: true,
        tables,
        count: tables.length,
        schema,
        profile: args.profile,
        database: args.database,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to list PostgreSQL tables: ${message}`);
    }
  }
}
