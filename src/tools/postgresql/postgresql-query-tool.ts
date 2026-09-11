import { z } from 'zod';
import { Tool } from '../../registry';
import { logError, logInfo } from '../../services/logger';
import { CatchErrors, throwQueryError, UserError } from '../../utils';
import { PostgreSQLBaseTool } from './base-tool';

/**
 * PostgreSQL Query Tool
 *
 * This tool executes SQL queries against a PostgreSQL database and returns the results.
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
 *   "query": "SELECT * FROM users WHERE id = $1",
 *   "params": [1],
 *   "database": "my_database"
 * }
 */

/**
 * Schema definition for the postgresQuery tool parameters
 */
export const PostgreSQLQueryToolSchema = z.object({
  profile: z
    .string()
    .describe('PostgreSQL profile name to use (e.g., "local", "dev", "production")'),
  query: z.string().describe('SQL query to execute'),
  params: z
    .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional()
    .default([])
    .describe('Query parameters for prepared statements (strings, numbers, booleans, or null)'),
  database: z
    .string()
    .optional()
    .describe('Database name to execute query against (overrides profile database)'),
  readOnly: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'If true, only SELECT, SHOW, EXPLAIN, and ANALYZE queries are allowed (blocks INSERT, UPDATE, DELETE, DROP, etc.)',
    ),
  skipSafetyChecks: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'DANGEROUS: Skip safety validations for destructive operations. Use with extreme caution. Does not bypass read-only mode.',
    ),
});

/**
 * Type for the postgresQuery tool parameters
 */
export type PostgreSQLQueryToolParams = z.input<typeof PostgreSQLQueryToolSchema>;

/**
 * postgresQuery - Execute SQL queries against PostgreSQL database
 */
@Tool({
  id: 'postgres-query',
  name: 'postgresQuery',
  description:
    'Execute custom SQL queries against a PostgreSQL database. Use this for data retrieval (SELECT), modifications (INSERT, UPDATE, DELETE), or operations not covered by specialized tools. For common tasks, prefer specialized tools: postgresListDatabases to list databases, postgresListTables to list tables, postgresDescribeTable to inspect schemas. Supports parameter binding for security.',
  category: 'PostgreSQL',
  parameters: PostgreSQLQueryToolSchema,
  version: '1.0.0',
  annotations: {
    title: 'PostgreSQL Query Execution',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
  },
})
export class PostgreSQLQueryTool extends PostgreSQLBaseTool {
  /**
   * Execute the PostgreSQL query
   */
  @CatchErrors()
  async execute(args: PostgreSQLQueryToolParams): Promise<string> {
    logInfo(
      `Executing PostgreSQL query using profile "${args.profile}" (read-only: ${args.readOnly}, skip-safety: ${args.skipSafetyChecks}): ${args.query.substring(0, 100)}${args.query.length > 100 ? '...' : ''}`,
    );

    // Validate query with safety checks
    this.validateQuery(args.query, args.readOnly ?? false, args.skipSafetyChecks ?? false);

    try {
      const rows = await this.executeQuery(
        args.query,
        args.params ?? [],
        args.profile,
        args.database,
      );

      // Determine query type
      const queryType = this.detectQueryType(args.query);

      return JSON.stringify({
        success: true,
        queryType,
        rows,
        rowCount: rows.length,
        profile: args.profile,
        database: args.database,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError(`PostgreSQL query failed: ${message}`);
      throwQueryError('execute query', message);
    }
  }

  /**
   * Three-layer safety validation system for SQL queries
   *
   * Layer 1: Read-only mode (CANNOT BE OVERRIDDEN)
   *   - Only SELECT, SHOW, EXPLAIN, ANALYZE allowed
   *   - All write operations blocked
   *
   * Layer 2: Automatic safety checks (CAN BE OVERRIDDEN with skipSafetyChecks: true)
   *   - DROP DATABASE/SCHEMA
   *   - TRUNCATE TABLE
   *   - DELETE/UPDATE without WHERE clause
   *
   * Layer 3: Always enforced security (CANNOT BE OVERRIDDEN)
   *   - No multiple statements (prevents SQL injection)
   *   - No system database modifications (postgres, template0, template1)
   *   - No system schema modifications (pg_catalog, information_schema, pg_toast)
   *   - LIMIT cap at 10,000 rows (memory protection)
   *
   * @param query SQL query to validate
   * @param readOnly Whether read-only mode is enabled
   * @param skipSafetyChecks Whether to skip Layer 2 safety checks
   */
  private validateQuery(query: string, readOnly: boolean, skipSafetyChecks: boolean): void {
    const normalizedQuery = query.trim().toUpperCase();

    // Layer 1: Read-only enforcement (CANNOT OVERRIDE)
    if (readOnly) {
      const allowedPatterns = /^(SELECT|SHOW|EXPLAIN|ANALYZE)\s/;
      if (!allowedPatterns.test(normalizedQuery)) {
        throw new UserError(
          'Read-only mode: Only SELECT, SHOW, EXPLAIN, and ANALYZE queries are allowed. ' +
            'Set readOnly: false to allow write operations.',
        );
      }
      return; // Skip other checks if read-only
    }

    // Layer 3: Always enforced security (CANNOT OVERRIDE)

    // Check for multiple statements (SQL injection prevention)
    const semicolonCount = (query.match(/;/g) || []).length;
    const trimmedQuery = query.trim();
    const endsWithSemicolon = trimmedQuery.endsWith(';');

    // Allow single trailing semicolon, but not multiple statements
    if (semicolonCount > 1 || (semicolonCount === 1 && !endsWithSemicolon)) {
      throw new UserError(
        'Multiple SQL statements are not allowed for security reasons. ' +
          'Execute queries one at a time.',
      );
    }

    // System database protection
    const systemDatabases = /\b(postgres|template0|template1)\./i;
    if (
      systemDatabases.test(query) &&
      /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE)\b/i.test(normalizedQuery)
    ) {
      throw new UserError(
        'Modifications to system databases (postgres, template0, template1) are not allowed.',
      );
    }

    // System schema protection
    const systemSchemas = /\b(pg_catalog|information_schema|pg_toast)\./i;
    if (
      systemSchemas.test(query) &&
      /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE)\b/i.test(normalizedQuery)
    ) {
      throw new UserError(
        'Modifications to system schemas (pg_catalog, information_schema, pg_toast) are not allowed.',
      );
    }

    // LIMIT cap for memory protection
    const limitMatch = /\bLIMIT\s+(\d+)/i.exec(query);
    if (limitMatch) {
      const limit = parseInt(limitMatch[1], 10);
      if (limit > 10000) {
        throw new UserError(
          'LIMIT cannot exceed 10,000 rows for memory protection. ' +
            'Use pagination or export tools for larger datasets.',
        );
      }
    }

    // Layer 2: Automatic safety checks (CAN OVERRIDE)
    if (!skipSafetyChecks) {
      // DROP DATABASE or DROP SCHEMA
      if (/DROP\s+(DATABASE|SCHEMA)/i.test(query)) {
        throw new UserError(
          'DROP DATABASE/SCHEMA requires skipSafetyChecks: true. ' +
            'This is a destructive operation that cannot be undone.',
        );
      }

      // TRUNCATE TABLE
      if (/TRUNCATE\s+TABLE/i.test(query)) {
        throw new UserError(
          'TRUNCATE TABLE requires skipSafetyChecks: true. ' +
            'This deletes all rows without conditions and cannot be undone.',
        );
      }

      // DELETE without WHERE
      if (/\bDELETE\s+FROM\b/i.test(query) && !/\bWHERE\b/i.test(query)) {
        throw new UserError(
          'DELETE without WHERE clause requires skipSafetyChecks: true. ' +
            'This would delete ALL rows from the table. Add a WHERE clause or use skipSafetyChecks: true.',
        );
      }

      // UPDATE without WHERE
      if (/\bUPDATE\b/i.test(query) && /\bSET\b/i.test(query) && !/\bWHERE\b/i.test(query)) {
        throw new UserError(
          'UPDATE without WHERE clause requires skipSafetyChecks: true. ' +
            'This would update ALL rows in the table. Add a WHERE clause or use skipSafetyChecks: true.',
        );
      }
    }
  }

  /**
   * Detect query type for informational purposes
   */
  private detectQueryType(query: string): string {
    const normalizedQuery = query.trim().toUpperCase();

    if (normalizedQuery.startsWith('SELECT')) return 'SELECT';
    if (normalizedQuery.startsWith('INSERT')) return 'INSERT';
    if (normalizedQuery.startsWith('UPDATE')) return 'UPDATE';
    if (normalizedQuery.startsWith('DELETE')) return 'DELETE';
    if (normalizedQuery.startsWith('CREATE')) return 'CREATE';
    if (normalizedQuery.startsWith('ALTER')) return 'ALTER';
    if (normalizedQuery.startsWith('DROP')) return 'DROP';
    if (normalizedQuery.startsWith('TRUNCATE')) return 'TRUNCATE';
    if (normalizedQuery.startsWith('SHOW')) return 'SHOW';
    if (normalizedQuery.startsWith('EXPLAIN')) return 'EXPLAIN';
    if (normalizedQuery.startsWith('ANALYZE')) return 'ANALYZE';

    return 'OTHER';
  }
}
