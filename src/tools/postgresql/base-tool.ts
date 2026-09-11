import type { Client } from 'pg';
import {
  throwAuthTokenError,
  throwConnectionError,
  throwQueryError,
  throwValidationError,
} from '../../utils/errors';
import { warnOnce } from '../../utils/utils';
import { ToolConfig, ToolHandler } from '../registry';
import type { PostgreSQLSSLConfig } from './postgresql-profile';
import { getPostgreSQLProfile, listAvailablePostgreSQLProfiles } from './postgresql-profile';

/**
 * PostgreSQL database connection configuration
 */
export interface PostgreSQLConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database?: string;
  ssl?: boolean | PostgreSQLSSLConfig;
  connectionTimeoutMillis?: number;
}

/**
 * Abstract base class for PostgreSQL-related tools that implements the ToolHandler interface.
 * Provides common functionality for PostgreSQL database interactions.
 */
export abstract class PostgreSQLBaseTool implements ToolHandler {
  /**
   * Checks if the tool is enabled based on available PostgreSQL profiles.
   * PostgreSQL tools require at least one POSTGRES_PROFILE_{PROFILE_NAME}_* profile configured.
   */
  isEnabled(_config: ToolConfig): boolean {
    const availableProfiles = listAvailablePostgreSQLProfiles();
    const hasProfiles = availableProfiles.length > 0;

    // Alert once if no profiles are available
    if (!hasProfiles) {
      warnOnce(
        'postgresql-missing-credentials',
        'PostgreSQL tools require at least one POSTGRES_PROFILE_{PROFILE_NAME}_* profile to be configured. ' +
          'Example: POSTGRES_PROFILE_LOCAL_HOST, POSTGRES_PROFILE_LOCAL_USER, POSTGRES_PROFILE_LOCAL_PASSWORD',
      );
    }

    return hasProfiles;
  }

  /**
   * Generate IAM authentication token for AWS RDS PostgreSQL
   *
   * @param host - RDS hostname
   * @param port - RDS port
   * @param user - Database username
   * @param region - AWS region
   * @param awsProfile - Optional AWS profile name for credential isolation
   * @returns Authentication token valid for 15 minutes
   */
  protected async generateIAMAuthToken(
    host: string,
    port: number,
    user: string,
    region: string,
    awsProfile?: string,
  ): Promise<string> {
    try {
      // Lazy load AWS SDK to avoid loading it when not using IAM auth
      const { Signer } = await import('@aws-sdk/rds-signer');
      const { fromEnv, fromIni } = await import('@aws-sdk/credential-providers');

      // Build credential provider chain with profile-specific support
      let credentials;
      if (awsProfile) {
        // Use profile-specific credentials
        credentials = fromIni({ profile: awsProfile });
      } else {
        // Use default credential chain (env vars, EC2/ECS/Lambda roles, etc.)
        credentials = fromEnv();
      }

      const signer = new Signer({
        hostname: host,
        port,
        region,
        username: user,
        credentials,
      });

      const token = await signer.getAuthToken();
      return token;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throwAuthTokenError('PostgreSQL IAM', message, awsProfile);
    }
  }

  /**
   * Get PostgreSQL connection configuration from profile
   *
   * @param profile - Profile name to use (e.g., 'local', 'dev', 'production')
   * @param database - Optional database name to override profile config
   * @returns PostgreSQL connection configuration
   */
  protected async getConnectionConfig(
    profile: string,
    database?: string,
  ): Promise<PostgreSQLConnectionConfig> {
    // Get profile configuration
    const profileConfig = getPostgreSQLProfile(profile);

    const config: PostgreSQLConnectionConfig = {
      host: profileConfig.host,
      port: profileConfig.port,
      user: profileConfig.user,
      password: '', // Will be set based on auth method
      connectionTimeoutMillis: 10000,
    };

    // Handle authentication method
    if (profileConfig.authMethod === 'iam') {
      // Generate IAM auth token
      if (!profileConfig.region) {
        throwValidationError(
          'IAM Authentication',
          `Profile "${profile}" uses IAM auth but region is not configured. Set POSTGRES_PROFILE_${profile.toUpperCase()}_REGION`,
        );
      }

      config.password = await this.generateIAMAuthToken(
        profileConfig.host,
        profileConfig.port,
        profileConfig.user,
        profileConfig.region,
        profileConfig.awsProfile,
      );
    } else {
      // Use password from profile
      config.password = profileConfig.password || '';
    }

    // Database precedence: parameter > profile config
    if (database) {
      config.database = database;
    } else if (profileConfig.database) {
      config.database = profileConfig.database;
    }

    // Add SSL if configured
    if (profileConfig.ssl !== undefined) {
      config.ssl = profileConfig.ssl;
    }

    return config;
  }

  /**
   * Create a database client
   *
   * @param profile - Profile name to use
   * @param database - Optional database name to override
   */
  protected async createClient(profile: string, database?: string): Promise<Client> {
    const config = await this.getConnectionConfig(profile, database);
    const authMethod = getPostgreSQLProfile(profile).authMethod || 'password';

    try {
      const { Client: PgClient } = await import('pg');
      const client = new PgClient(config);
      await client.connect();
      return client;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throwConnectionError('PostgreSQL', message, authMethod);
    }
  }

  /**
   * Execute a SQL query against the PostgreSQL database
   *
   * @param query - SQL query to execute
   * @param params - Query parameters for prepared statement
   * @param profile - Profile name to use
   * @param database - Optional database name to override
   */
  protected async executeQuery(
    query: string,
    params: Array<string | number | boolean | null>,
    profile: string,
    database?: string,
  ): Promise<Record<string, unknown>[]> {
    let client: Client | null = null;

    try {
      client = await this.createClient(profile, database);
      const result = await client.query<Record<string, unknown>>(query, params);
      return result.rows;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throwQueryError('execute query', message);
    } finally {
      if (client) {
        await client.end();
      }
    }
    // Unreachable: throwQueryError above always throws (return type `never`), but TS's
    // control-flow analysis can't prove exhaustiveness through a `finally` block.
    throw new Error('Unreachable: executeQuery must return or throw above');
  }

  /**
   * Validate database identifier
   * Checks for valid PostgreSQL identifier names and prevents SQL injection
   */
  protected validateIdentifier(identifier: string, name: string): void {
    if (!identifier) {
      throwValidationError(name, 'cannot be empty');
    }

    // Check length (PostgreSQL max identifier length is 63 characters - NAMEDATALEN - 1)
    if (identifier.length > 63) {
      throwValidationError(name, 'is too long (max 63 characters)');
    }

    // Check for invalid characters that could indicate SQL injection attempts
    // eslint-disable-next-line no-control-regex -- intentionally matches control chars to reject SQL-identifier-injection payloads
    const invalidChars = /[;\0\x08\x09\x1a\n\r"'\\%]/;
    if (invalidChars.test(identifier)) {
      throwValidationError(
        name,
        'contains invalid characters. Only alphanumeric characters, underscores, and hyphens are allowed',
      );
    }
  }

  /**
   * Escape identifier for safe use in SQL queries
   * Uses double quotes which is PostgreSQL standard for identifiers
   */
  protected escapeIdentifier(identifier: string): string {
    // Replace double quotes with double double quotes to escape them
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  /**
   * Executes the tool's specific functionality.
   * Must be implemented by derived classes.
   */
  abstract execute(args: unknown): Promise<string>;
}
