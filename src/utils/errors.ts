abstract class MCPError extends Error {
  public constructor(message?: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnexpectedStateError extends MCPError {
  public extras?: Record<string, any>;

  public constructor(message: string, extras?: Record<string, any>) {
    super(message);
    this.name = new.target.name;
    this.extras = extras;
  }
}

/**
 * An error that is meant to be surfaced to the user.
 */
export class UserError extends UnexpectedStateError {}

/**
 * Error utility functions for standardized error handling across tools
 */

/**
 * Throw a user-friendly configuration error for missing environment variables
 *
 * @param envVar - Name of the environment variable
 * @param example - Example value or usage guidance
 * @throws UserError with helpful context
 */
export function throwConfigError(envVar: string, example: string): never {
  throw new UserError(
    `Missing configuration: ${envVar}\n` +
      `Set this environment variable or add to ~/.qnscmcp/config.yaml\n` +
      `Example: ${example}`,
  );
}

/**
 * Throw a user-friendly connection error with troubleshooting guidance
 *
 * @param service - Name of the service (e.g., "PostgreSQL", "MySQL")
 * @param details - Error details from the underlying client
 * @param authMethod - Authentication method being used (optional)
 * @throws UserError with connection troubleshooting help
 */
export function throwConnectionError(service: string, details: string, authMethod?: string): never {
  const authInfo = authMethod ? ` using ${authMethod} authentication` : '';
  throw new UserError(
    `Failed to connect to ${service}${authInfo}\n` +
      `Error: ${details}\n\n` +
      `Troubleshooting:\n` +
      `- Verify the host and port are correct\n` +
      `- Check that credentials are valid\n` +
      `- Ensure the database server is running and accessible\n` +
      `- Check firewall rules and network connectivity`,
  );
}

/**
 * Throw a user-friendly query execution error
 *
 * @param operation - Description of the operation (e.g., "list databases", "execute query")
 * @param details - Error details from the database client
 * @throws UserError with query troubleshooting help
 */
export function throwQueryError(operation: string, details: string): never {
  throw new UserError(
    `Failed to ${operation}\n` +
      `Error: ${details}\n\n` +
      `Possible causes:\n` +
      `- SQL syntax error\n` +
      `- Table or column doesn't exist\n` +
      `- Insufficient permissions\n` +
      `- Database connection was lost`,
  );
}

/**
 * Throw a user-friendly authentication error for token generation
 *
 * @param service - Name of the service (e.g., "PostgreSQL IAM")
 * @param details - Error details
 * @param awsProfile - AWS profile name if applicable
 * @throws UserError with auth troubleshooting help
 */
export function throwAuthTokenError(service: string, details: string, awsProfile?: string): never {
  const profileInfo = awsProfile ? ` using AWS profile "${awsProfile}"` : '';
  throw new UserError(
    `Failed to generate authentication token for ${service}${profileInfo}\n` +
      `Error: ${details}\n\n` +
      `Troubleshooting:\n` +
      `- Ensure AWS credentials are configured\n` +
      `- Verify IAM permissions include rds-db:connect\n` +
      `- Check that the AWS region is correct\n` +
      `${awsProfile ? `- Verify AWS profile "${awsProfile}" exists\n` : ''}`,
  );
}

/**
 * Throw a validation error for invalid identifiers
 *
 * @param identifierType - Type of identifier (e.g., "Database name", "Table name")
 * @param issue - Description of the validation issue
 * @throws UserError with validation details
 */
export function throwValidationError(identifierType: string, issue: string): never {
  throw new UserError(
    `Invalid ${identifierType}: ${issue}\n\n` +
      `Requirements:\n` +
      `- Must not be empty\n` +
      `- Maximum 63 characters\n` +
      `- Only alphanumeric characters, underscores, and hyphens allowed`,
  );
}
