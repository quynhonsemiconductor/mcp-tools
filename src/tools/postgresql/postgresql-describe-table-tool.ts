import { z } from 'zod';
import { Tool } from '../../registry';
import { logInfo } from '../../services/logger';
import { CatchErrors } from '../../utils';
import { PostgreSQLBaseTool } from './base-tool';

/**
 * PostgreSQL Describe Table Tool
 *
 * This tool provides detailed schema information for a PostgreSQL table including columns, indexes, and constraints.
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
 *   "table": "users",
 *   "schema": "public",
 *   "database": "myapp"
 * }
 */

/**
 * Schema definition for the postgresDescribeTable tool parameters
 */
export const PostgreSQLDescribeTableToolSchema = z.object({
  profile: z
    .string()
    .describe('PostgreSQL profile name to use (e.g., "local", "dev", "production")'),
  table: z.string().describe('Table name to describe'),
  database: z
    .string()
    .optional()
    .describe('Database name to query (uses profile database if not provided)'),
  schema: z.string().optional().default('public').describe('Schema name (default: "public")'),
});

/**
 * Type for the postgresDescribeTable tool parameters
 */
export type PostgreSQLDescribeTableToolParams = z.infer<typeof PostgreSQLDescribeTableToolSchema>;

/**
 * Row shape returned by the information_schema.columns query
 */
interface ColumnInfoRow {
  column_name: string;
  data_type: string;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  is_nullable: string;
  column_default: string | null;
  ordinal_position: number;
}

/**
 * Row shape returned by the pg_indexes query
 */
interface IndexInfoRow {
  indexname: string;
  indexdef: string;
}

/**
 * Row shape returned by the pg_constraint query
 */
interface ConstraintInfoRow {
  constraint_name: string;
  constraint_type: string;
  definition: string;
}

/**
 * postgresDescribeTable - Get detailed schema information for a PostgreSQL table
 */
@Tool({
  id: 'postgres-describe-table',
  name: 'postgresDescribeTable',
  description:
    'Get detailed schema information about a table including columns, data types, constraints, indexes, and table metadata. Prefer this over postgresQuery("\\d table") or manual information_schema queries. Returns comprehensive table structure information.',
  category: 'PostgreSQL',
  parameters: PostgreSQLDescribeTableToolSchema,
  version: '1.0.0',
  annotations: {
    title: 'PostgreSQL Describe Table',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
})
export class PostgreSQLDescribeTableTool extends PostgreSQLBaseTool {
  /**
   * Execute the describe table query
   */
  @CatchErrors()
  async execute(args: PostgreSQLDescribeTableToolParams): Promise<string> {
    logInfo(
      `Describing PostgreSQL table "${args.schema}.${args.table}" using profile "${args.profile}"`,
    );

    const schema = args.schema || 'public';

    // Validate identifiers
    this.validateIdentifier(args.table, 'Table name');
    this.validateIdentifier(schema, 'Schema name');

    try {
      // 1. Get column information
      const columnQuery = `
        SELECT
          column_name,
          data_type,
          character_maximum_length,
          numeric_precision,
          numeric_scale,
          is_nullable,
          column_default,
          ordinal_position
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `;

      const columns = (await this.executeQuery(
        columnQuery,
        [schema, args.table],
        args.profile,
        args.database,
      )) as unknown as ColumnInfoRow[];

      if (columns.length === 0) {
        throw new Error(`Table "${schema}.${args.table}" not found or does not exist`);
      }

      // 2. Get indexes
      const indexQuery = `
        SELECT
          indexname,
          indexdef
        FROM pg_indexes
        WHERE schemaname = $1 AND tablename = $2
        ORDER BY indexname
      `;

      const indexes = (await this.executeQuery(
        indexQuery,
        [schema, args.table],
        args.profile,
        args.database,
      )) as unknown as IndexInfoRow[];

      // 3. Get constraints
      const constraintQuery = `
        SELECT
          con.conname as constraint_name,
          con.contype as constraint_type,
          pg_get_constraintdef(con.oid) as definition
        FROM pg_constraint con
        INNER JOIN pg_class rel ON rel.oid = con.conrelid
        INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = $1 AND rel.relname = $2
        ORDER BY con.conname
      `;

      const constraints = (await this.executeQuery(
        constraintQuery,
        [schema, args.table],
        args.profile,
        args.database,
      )) as unknown as ConstraintInfoRow[];

      // 4. Get table metadata
      const metadataQuery = `
        SELECT
          pg_size_pretty(pg_total_relation_size($1||'.'||$2)) as total_size,
          pg_size_pretty(pg_relation_size($1||'.'||$2)) as table_size,
          pg_size_pretty(pg_indexes_size($1||'.'||$2)) as indexes_size,
          (SELECT reltuples::bigint FROM pg_class WHERE oid = ($1||'.'||$2)::regclass) as row_estimate
      `;

      const metadata = await this.executeQuery(
        metadataQuery,
        [schema, args.table],
        args.profile,
        args.database,
      );

      // Format output
      const formattedColumns = columns.map((col) => ({
        name: col.column_name,
        type: col.data_type,
        maxLength: col.character_maximum_length,
        precision: col.numeric_precision,
        scale: col.numeric_scale,
        nullable: col.is_nullable === 'YES',
        default: col.column_default,
        position: col.ordinal_position,
      }));

      const formattedIndexes = indexes.map((idx) => ({
        name: idx.indexname,
        definition: idx.indexdef,
      }));

      const formattedConstraints = constraints.map((con) => {
        const typeMap: Record<string, string> = {
          p: 'PRIMARY KEY',
          f: 'FOREIGN KEY',
          u: 'UNIQUE',
          c: 'CHECK',
          x: 'EXCLUSION',
          t: 'TRIGGER',
        };

        return {
          name: con.constraint_name,
          type: typeMap[con.constraint_type] || con.constraint_type,
          definition: con.definition,
        };
      });

      const result = {
        success: true,
        table: {
          schema,
          name: args.table,
          columns: formattedColumns,
          indexes: formattedIndexes,
          constraints: formattedConstraints,
          metadata: metadata[0] || {},
        },
        profile: args.profile,
        database: args.database,
      };

      return JSON.stringify(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to describe PostgreSQL table: ${message}`);
    }
  }
}
