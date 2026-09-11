import { logWarn } from '../../services/logger';
import { UserError } from '../../utils';

/**
 * SSL configuration for PostgreSQL connections
 */
export interface PostgreSQLSSLConfig {
  /** SSL mode: 'disable', 'prefer', 'require', 'verify-ca', 'verify-full' */
  mode?: 'disable' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';
  /** Path to CA certificate file */
  ca?: string;
  /** Whether to reject unauthorized certificates (default: true) */
  rejectUnauthorized?: boolean;
}

/**
 * PostgreSQL profile configuration containing connection credentials and settings
 */
export interface PostgreSQLProfile {
  host: string;
  port: number;
  user: string;
  password?: string; // Optional when using IAM auth
  database?: string;
  ssl?: boolean | PostgreSQLSSLConfig; // Optional SSL configuration
  authMethod?: 'password' | 'iam'; // Authentication method (default: password)
  region?: string; // AWS region (required for IAM auth)
  awsProfile?: string; // AWS profile name for IAM auth (optional)
}

/**
 * Read PostgreSQL profile from environment variables using the POSTGRES_PROFILE_* pattern
 *
 * Environment variable pattern:
 * - POSTGRES_PROFILE_{PROFILE_NAME}_HOST
 * - POSTGRES_PROFILE_{PROFILE_NAME}_PORT (optional, defaults to 5432)
 * - POSTGRES_PROFILE_{PROFILE_NAME}_USER
 * - POSTGRES_PROFILE_{PROFILE_NAME}_PASSWORD (required for password auth)
 * - POSTGRES_PROFILE_{PROFILE_NAME}_DATABASE (optional)
 * - POSTGRES_PROFILE_{PROFILE_NAME}_SSL (optional, defaults to false)
 * - POSTGRES_PROFILE_{PROFILE_NAME}_SSL_MODE (optional: 'disable' | 'prefer' | 'require' | 'verify-ca' | 'verify-full')
 * - POSTGRES_PROFILE_{PROFILE_NAME}_AUTH_METHOD (optional: 'password' | 'iam', defaults to 'password')
 * - POSTGRES_PROFILE_{PROFILE_NAME}_REGION (required for IAM auth)
 * - POSTGRES_PROFILE_{PROFILE_NAME}_AWS_PROFILE (optional for IAM auth)
 * - POSTGRES_PROFILE_{PROFILE_NAME}_SSL_CA (optional, path to CA certificate)
 *
 * @param profileName Profile name (e.g., 'LOCAL', 'DEV', 'STAGING', 'PRODUCTION')
 * @returns PostgreSQLProfile with connection credentials
 * @throws UserError if required environment variables are not found
 */
export function getPostgreSQLProfile(profileName: string): PostgreSQLProfile {
  // Normalize profile name to uppercase
  const normalizedProfile = profileName.toUpperCase();

  // Build environment variable names
  const hostVar = `POSTGRES_PROFILE_${normalizedProfile}_HOST`;
  const portVar = `POSTGRES_PROFILE_${normalizedProfile}_PORT`;
  const userVar = `POSTGRES_PROFILE_${normalizedProfile}_USER`;
  const passwordVar = `POSTGRES_PROFILE_${normalizedProfile}_PASSWORD`;
  const databaseVar = `POSTGRES_PROFILE_${normalizedProfile}_DATABASE`;
  const sslVar = `POSTGRES_PROFILE_${normalizedProfile}_SSL`;
  const sslModeVar = `POSTGRES_PROFILE_${normalizedProfile}_SSL_MODE`;
  const authMethodVar = `POSTGRES_PROFILE_${normalizedProfile}_AUTH_METHOD`;
  const regionVar = `POSTGRES_PROFILE_${normalizedProfile}_REGION`;
  const awsProfileVar = `POSTGRES_PROFILE_${normalizedProfile}_AWS_PROFILE`;
  const sslCaVar = `POSTGRES_PROFILE_${normalizedProfile}_SSL_CA`;

  // Read environment variables
  const host = process.env[hostVar];
  const port = process.env[portVar];
  const user = process.env[userVar];
  const password = process.env[passwordVar];
  const database = process.env[databaseVar];
  const ssl = process.env[sslVar];
  const sslMode = process.env[sslModeVar] as PostgreSQLSSLConfig['mode'];
  const authMethod = (process.env[authMethodVar] || 'password') as PostgreSQLProfile['authMethod'];
  const region = process.env[regionVar];
  const awsProfile = process.env[awsProfileVar];
  const sslCa = process.env[sslCaVar];

  // Validate required credentials
  if (!host) {
    throw new UserError(
      `Missing required environment variable: ${hostVar}. ` +
        `Please set this variable with your PostgreSQL host for profile ${profileName}.`,
    );
  }

  if (!user) {
    throw new UserError(
      `Missing required environment variable: ${userVar}. ` +
        `Please set this variable with your PostgreSQL username for profile ${profileName}.`,
    );
  }

  // Auth method-specific validation
  if (authMethod === 'iam') {
    // IAM auth validation
    if (!region) {
      throw new UserError(
        `PostgreSQL profile "${profileName}" uses IAM auth but ${regionVar} is not set. ` +
          `Please set the AWS region (e.g., us-east-1).`,
      );
    }

    if (ssl !== 'true' && !sslCa && !sslMode) {
      throw new UserError(
        `PostgreSQL profile "${profileName}" uses IAM auth but SSL is not enabled. ` +
          `IAM authentication requires SSL/TLS connection. Set ${sslVar}=true or ${sslModeVar}=require.`,
      );
    }

    // Password not required for IAM auth, but warn if set
    if (password !== undefined && password !== '') {
      logWarn(
        `PostgreSQL profile "${profileName}" uses IAM auth but ${passwordVar} is set. ` +
          `Password will be ignored in favor of IAM token.`,
      );
    }
  } else {
    // Password auth validation
    if (password === undefined) {
      throw new UserError(
        `Missing required environment variable: ${passwordVar}. ` +
          `Please set this variable with your PostgreSQL password for profile ${profileName}. ` +
          `Use an empty string ("") for no password.`,
      );
    }
  }

  // Build SSL configuration
  let sslConfig: boolean | PostgreSQLSSLConfig | undefined;
  if (sslCa || sslMode) {
    // Custom SSL configuration
    sslConfig = {
      mode: sslMode,
      ca: sslCa,
      rejectUnauthorized: authMethod === 'iam' ? false : true,
    };
  } else if (ssl === 'true') {
    // For IAM auth, use rejectUnauthorized: false for Amazon RDS CA
    if (authMethod === 'iam') {
      sslConfig = {
        rejectUnauthorized: false,
      };
    } else {
      // For password auth, just enable SSL
      sslConfig = true;
    }
  } else {
    sslConfig = undefined;
  }

  return {
    host,
    port: port ? parseInt(port, 10) : 5432,
    user,
    password: authMethod === 'iam' ? undefined : password,
    database,
    ssl: sslConfig,
    authMethod,
    region,
    awsProfile,
  };
}

/**
 * List available PostgreSQL profiles by scanning environment variables
 * Returns array of profile names that have all required credentials set
 *
 * @returns Array of available profile names
 */
export function listAvailablePostgreSQLProfiles(): string[] {
  const profiles: string[] = [];
  const envVars = Object.keys(process.env);

  // Find all HOST environment variables matching the pattern
  const hostPattern = /^POSTGRES_PROFILE_([^_]+)_HOST$/;

  for (const envVar of envVars) {
    const match = envVar.match(hostPattern);
    if (match) {
      const profileName = match[1];

      // Check if corresponding USER exists (PASSWORD might be optional for IAM)
      const userVar = `POSTGRES_PROFILE_${profileName}_USER`;
      const passwordVar = `POSTGRES_PROFILE_${profileName}_PASSWORD`;
      const authMethodVar = `POSTGRES_PROFILE_${profileName}_AUTH_METHOD`;

      const authMethod = process.env[authMethodVar] || 'password';

      if (process.env[userVar] !== undefined) {
        // For password auth, PASSWORD must be set
        // For IAM auth, PASSWORD is optional
        if (authMethod === 'iam' || process.env[passwordVar] !== undefined) {
          profiles.push(profileName.toLowerCase());
        }
      }
    }
  }

  return profiles.sort();
}

/**
 * Validate that a PostgreSQL profile exists for the given profile name
 *
 * @param profileName Profile name
 * @returns true if profile exists, false otherwise
 */
export function validatePostgreSQLProfile(profileName: string): boolean {
  try {
    getPostgreSQLProfile(profileName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all environment variable names needed for a PostgreSQL profile
 * Useful for documentation and setup guidance
 *
 * @param profileName Profile name
 * @returns Object with environment variable names
 */
export function getPostgreSQLProfileEnvVars(profileName: string) {
  const normalizedProfile = profileName.toUpperCase();

  return {
    host: `POSTGRES_PROFILE_${normalizedProfile}_HOST`,
    port: `POSTGRES_PROFILE_${normalizedProfile}_PORT`,
    user: `POSTGRES_PROFILE_${normalizedProfile}_USER`,
    password: `POSTGRES_PROFILE_${normalizedProfile}_PASSWORD`,
    database: `POSTGRES_PROFILE_${normalizedProfile}_DATABASE`,
    ssl: `POSTGRES_PROFILE_${normalizedProfile}_SSL`,
    sslMode: `POSTGRES_PROFILE_${normalizedProfile}_SSL_MODE`,
    authMethod: `POSTGRES_PROFILE_${normalizedProfile}_AUTH_METHOD`,
    region: `POSTGRES_PROFILE_${normalizedProfile}_REGION`,
    awsProfile: `POSTGRES_PROFILE_${normalizedProfile}_AWS_PROFILE`,
    sslCa: `POSTGRES_PROFILE_${normalizedProfile}_SSL_CA`,
  };
}
