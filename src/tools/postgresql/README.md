# PostgreSQL MCP Tools

Comprehensive PostgreSQL database interaction tools for the Model Context Protocol with profile-based configuration, AWS RDS IAM authentication, and multi-layer safety features.

## Quick Start

### 1. Configure a Profile

```bash
# Local development profile
export POSTGRES_PROFILE_LOCAL_HOST="127.0.0.1"
export POSTGRES_PROFILE_LOCAL_USER="postgres"
export POSTGRES_PROFILE_LOCAL_PASSWORD="localpass"
export POSTGRES_PROFILE_LOCAL_DATABASE="myapp_dev"

# Production profile with SSL
export POSTGRES_PROFILE_PRODUCTION_HOST="prod-postgres.example.com"
export POSTGRES_PROFILE_PRODUCTION_USER="produser"
export POSTGRES_PROFILE_PRODUCTION_PASSWORD="secure_password"
export POSTGRES_PROFILE_PRODUCTION_DATABASE="myapp"
export POSTGRES_PROFILE_PRODUCTION_SSL="true"
```

### 2. Use the Tools

```json
{
  "profile": "local",
  "query": "SELECT * FROM users WHERE status = $1",
  "params": ["active"],
  "readOnly": true
}
```

## Table of Contents

- [Available Tools](#available-tools)
- [Profile Configuration](#profile-configuration)
- [AWS RDS IAM Authentication](#aws-rds-iam-authentication)
- [Safety Features](#safety-features)
- [Tool Selection Guide](#tool-selection-guide)
- [Architecture](#architecture)
- [Security](#security)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## Available Tools

All tools require a `profile` parameter to specify which database instance to use.

### postgresQuery

Execute SQL queries against a PostgreSQL database with parameter binding and safety checks.

**Parameters:**

- `profile` (string, required) - Profile name (e.g., "local", "dev", "production")
- `query` (string, required) - SQL query to execute (use $1, $2, etc. for parameters)
- `params` (array, optional) - Parameters for prepared statement binding
- `database` (string, optional) - Override profile's default database
- `readOnly` (boolean, optional, default: false) - Enable read-only mode (only SELECT/SHOW/EXPLAIN/ANALYZE)
- `skipSafetyChecks` (boolean, optional, default: false) - Bypass safety validations (use with caution)

**Example:**

```json
{
  "profile": "local",
  "query": "SELECT * FROM users WHERE status = $1 LIMIT 100",
  "params": ["active"],
  "readOnly": true
}
```

**Features:**

- PostgreSQL-style parameter binding ($1, $2, etc.) for SQL injection prevention
- Three-layer safety system (read-only, automatic checks, overrides)
- Query validation to prevent dangerous operations
- Automatic connection cleanup

### postgresListDatabases

List all databases on the PostgreSQL server. Prefer this over `postgresQuery("SELECT datname FROM pg_database")`.

**Parameters:**

- `profile` (string, required) - Profile name
- `includeSystemDatabases` (boolean, optional, default: false) - Include system databases (postgres, template0, template1)

**Example:**

```json
{
  "profile": "dev",
  "includeSystemDatabases": false
}
```

**Returns:** Array of database names with encoding, collation, and connection settings

### postgresListTables

List tables in a database with schema support. Prefer this over `postgresQuery("SELECT * FROM information_schema.tables")`.

**Parameters:**

- `profile` (string, required) - Profile name
- `database` (string, optional) - Database name (uses profile default if not specified)
- `schema` (string, optional, default: "public") - Schema name to filter by
- `includeViews` (boolean, optional, default: false) - Include views in results

**Example:**

```json
{
  "profile": "production",
  "database": "myapp",
  "schema": "public",
  "includeViews": false
}
```

**Returns:** Array of tables with schema, name, owner, and size information

### postgresDescribeTable

Get detailed schema information for a table. Prefer this over `postgresQuery("\\d table")`.

**Parameters:**

- `profile` (string, required) - Profile name
- `table` (string, required) - Table name
- `database` (string, optional) - Database name (uses profile default if not specified)
- `schema` (string, optional, default: "public") - Schema name

**Example:**

```json
{
  "profile": "local",
  "table": "users",
  "schema": "public",
  "database": "myapp_dev"
}
```

**Returns:** Table columns (name, type, nullable, default), indexes, constraints, and metadata (size, row count)

## Profile Configuration

### Environment Variable Pattern

Profiles use environment variables with the pattern:

```
POSTGRES_PROFILE_{PROFILE_NAME}_{SETTING}
```

### Required Settings

Each profile requires:

- `POSTGRES_PROFILE_{NAME}_HOST` - Database server host address
- `POSTGRES_PROFILE_{NAME}_USER` - Database username

### Optional Settings

- `POSTGRES_PROFILE_{NAME}_PORT` - Database port (default: 5432)
- `POSTGRES_PROFILE_{NAME}_PASSWORD` - Database password (not required for IAM auth)
- `POSTGRES_PROFILE_{NAME}_DATABASE` - Default database name
- `POSTGRES_PROFILE_{NAME}_SSL` - Enable SSL connection (true/false, default: false)
- `POSTGRES_PROFILE_{NAME}_SSL_MODE` - SSL mode: disable, prefer, require, verify-ca, verify-full
- `POSTGRES_PROFILE_{NAME}_SSL_CA` - Path to CA certificate file

### Example Configurations

#### Local Development

```bash
export POSTGRES_PROFILE_LOCAL_HOST="127.0.0.1"
export POSTGRES_PROFILE_LOCAL_PORT="5432"
export POSTGRES_PROFILE_LOCAL_USER="postgres"
export POSTGRES_PROFILE_LOCAL_PASSWORD="localpass"
export POSTGRES_PROFILE_LOCAL_DATABASE="myapp_dev"
export POSTGRES_PROFILE_LOCAL_SSL="false"
```

#### Production with SSL

```bash
export POSTGRES_PROFILE_PRODUCTION_HOST="prod-postgres.example.com"
export POSTGRES_PROFILE_PRODUCTION_PORT="5432"
export POSTGRES_PROFILE_PRODUCTION_USER="produser"
export POSTGRES_PROFILE_PRODUCTION_PASSWORD="securepass456"
export POSTGRES_PROFILE_PRODUCTION_DATABASE="myapp"
export POSTGRES_PROFILE_PRODUCTION_SSL="true"
export POSTGRES_PROFILE_PRODUCTION_SSL_MODE="require"
```

### Benefits of Profile-Based Configuration

1. **Multiple Environments** - Easily switch between local, dev, staging, and production databases
2. **Security** - Keep credentials separate per environment
3. **Consistency** - Same pattern as MySQL and other QNSC MCP tools
4. **Flexibility** - Override database names per-query while using the same connection profile
5. **Discoverability** - Tools can list available profiles automatically

## AWS RDS IAM Authentication

AWS RDS IAM authentication provides passwordless access to RDS PostgreSQL instances with automatic token rotation.

### Configuration

Add IAM-specific settings to your profile:

```bash
# Required for IAM auth
export POSTGRES_PROFILE_E2E_HOST="db.region.rds.amazonaws.com"
export POSTGRES_PROFILE_E2E_USER="developer_ro"
export POSTGRES_PROFILE_E2E_AUTH_METHOD="iam"
export POSTGRES_PROFILE_E2E_REGION="us-east-1"
export POSTGRES_PROFILE_E2E_SSL="true"  # Required for IAM

# Optional: Specify AWS profile for credentials
export POSTGRES_PROFILE_E2E_AWS_PROFILE="your-aws-profile"
```

### IAM Settings

- `POSTGRES_PROFILE_{NAME}_AUTH_METHOD` - Set to "iam" (default: "password")
- `POSTGRES_PROFILE_{NAME}_REGION` - AWS region (required for IAM)
- `POSTGRES_PROFILE_{NAME}_AWS_PROFILE` - AWS credentials profile (optional)
- `POSTGRES_PROFILE_{NAME}_SSL` - Must be "true" for IAM authentication

### Features

- ✅ **No Password Storage** - Tokens generated on-demand
- ✅ **Automatic Rotation** - 15-minute token lifetime
- ✅ **Audit Trail** - CloudTrail logs IAM authentication
- ✅ **Fine-Grained Permissions** - IAM policies control access
- ✅ **Profile Isolation** - Separate AWS credentials per PostgreSQL profile
- ✅ **Lazy Loading** - AWS SDK only loaded when IAM auth is used
- ✅ **Backwards Compatible** - Password authentication still works

### Required IAM Policies

The IAM user/role needs the `rds-db:connect` permission:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "rds-db:connect",
      "Resource": "arn:aws:rds-db:REGION:ACCOUNT:dbuser:RESOURCE_ID/USERNAME"
    }
  ]
}
```

### SSL Configuration

IAM authentication requires SSL. The tools automatically configure:

```typescript
ssl: {
  rejectUnauthorized: false; // For Amazon RDS CA compatibility
}
```

For custom CA certificates:

```bash
export POSTGRES_PROFILE_{NAME}_SSL_CA="/path/to/ca-cert.pem"
```

### Credential Resolution Order

When using IAM authentication, AWS credentials are resolved in this order:

1. **Profile-specific** - `POSTGRES_PROFILE_{NAME}_AWS_PROFILE`
2. **Global** - `AWS_PROFILE` environment variable
3. **Default AWS credential chain** - ~/.aws/credentials, instance metadata, etc.

### Example

```json
{
  "profile": "e2e",
  "query": "SELECT * FROM orders LIMIT 10",
  "readOnly": true
}
```

## Safety Features

The `postgresQuery` tool includes three layers of safety protection.

### Layer 1: Read-Only Mode

Enable `readOnly: true` to allow only safe operations:

- ✅ `SELECT` - Data retrieval
- ✅ `SHOW` - Display metadata
- ✅ `EXPLAIN` - Query execution plan
- ✅ `ANALYZE` - Query statistics
- ❌ All write operations blocked

**Cannot be overridden** - This is the safest mode for exploratory queries.

```json
{
  "profile": "production",
  "query": "SELECT * FROM users LIMIT 10",
  "readOnly": true
}
```

### Layer 2: Automatic Safety Checks (Default)

These operations are blocked by default unless `skipSafetyChecks: true`:

| Operation                         | Reason                         | Override? |
| --------------------------------- | ------------------------------ | --------- |
| `DROP DATABASE`                   | Destroys entire database       | ✅ Yes    |
| `DROP SCHEMA`                     | Destroys database schema       | ✅ Yes    |
| `TRUNCATE TABLE`                  | Deletes all rows without WHERE | ✅ Yes    |
| `DELETE FROM table` (no WHERE)    | Would delete all rows          | ✅ Yes    |
| `UPDATE table SET ...` (no WHERE) | Would update all rows          | ✅ Yes    |
| Multiple SQL statements           | Security risk (SQL injection)  | ❌ No     |
| System database modifications     | Prevents breaking PostgreSQL   | ❌ No     |
| System schema modifications       | Prevents breaking PostgreSQL   | ❌ No     |
| `LIMIT > 10000`                   | Memory protection              | ❌ No     |

### Layer 3: Always-Enforced Security

These rules **cannot be overridden** with `skipSafetyChecks`:

1. **No Multiple Statements** - Only one SQL command per execution (prevents SQL injection)
2. **No System Database Modifications** - Cannot modify `postgres`, `template0`, `template1`
3. **No System Schema Modifications** - Cannot modify `pg_catalog`, `information_schema`, `pg_toast`
4. **LIMIT Cap** - Maximum 10,000 rows per query (prevents memory exhaustion)

### Usage Examples

**Safe exploratory query:**

```json
{
  "profile": "production",
  "query": "SELECT COUNT(*) FROM orders WHERE status = $1",
  "params": ["pending"],
  "readOnly": true
}
```

**Standard write operation:**

```json
{
  "profile": "dev",
  "query": "UPDATE users SET last_login = NOW() WHERE id = $1",
  "params": [123]
}
```

**Bulk operation (requires override):**

```json
{
  "profile": "dev",
  "query": "DELETE FROM temp_staging WHERE batch_date < NOW() - INTERVAL '7 days'",
  "skipSafetyChecks": true
}
```

## Tool Selection Guide

### Decision Tree

```
Need to interact with PostgreSQL?
├─ Want to see what databases exist?
│  └─ Use: postgresListDatabases ✓
│
├─ Want to see what tables exist in a database?
│  └─ Use: postgresListTables ✓
│
├─ Want to understand a table's structure/schema?
│  └─ Use: postgresDescribeTable ✓
│
└─ Want to query actual data or modify records?
   └─ Use: postgresQuery ✓
```

### Best Practices for AI Assistants

#### Discovery Flow (Recommended)

When working with unfamiliar data:

1. **List databases** → `postgresListDatabases`
2. **List tables** → `postgresListTables`
3. **Describe table** → `postgresDescribeTable`
4. **Query data** → `postgresQuery`

#### Tool Preference

Always prefer specialized tools over `postgresQuery` for common tasks:

| Task           | ❌ Don't Use                                        | ✅ Do Use                |
| -------------- | --------------------------------------------------- | ------------------------ |
| List databases | `postgresQuery("SELECT datname FROM pg_database")` | `postgresListDatabases`  |
| List tables    | `postgresQuery("SELECT * FROM pg_tables")`          | `postgresListTables`     |
| Table schema   | `postgresQuery("\\d users")`                        | `postgresDescribeTable`  |
| Get data       | N/A                                                 | `postgresQuery`          |

#### Why Use Specialized Tools?

- **Better Output Formatting** - Structured data with metadata (sizes, indexes, constraints)
- **Clearer Intent** - Tool name shows what you're doing
- **Safety** - Specialized tools are read-only
- **Performance** - Optimized queries for common operations
- **Schema Awareness** - Handles PostgreSQL schemas properly

## Architecture

### Base Tool Pattern

All PostgreSQL tools extend `PostgreSQLBaseTool` which provides:

- **Connection Management** - Profile-based configuration, IAM token generation
- **Query Execution** - Prepared statements with parameter binding (using $1, $2 syntax)
- **Identifier Validation** - Max 63 chars, no dangerous characters
- **Error Handling** - Comprehensive error messages
- **Safety Checks** - Multi-layer validation

### Tool Hierarchy

```
PostgreSQLBaseTool (Abstract)
├── Connection Management
│   ├── getConnectionConfig() - Handles IAM tokens
│   ├── createClient() - Establishes connection
│   └── executeQuery() - Parameter binding
├── IAM Support
│   └── generateIAMAuthToken() - Lazy loads AWS SDK
└── Safety Features
    ├── validateQuery() - Three-layer checks
    └── isEnabled() - Profile detection

Concrete Tools:
├── PostgreSQLListDatabasesTool (read-only)
├── PostgreSQLListTablesTool (read-only)
├── PostgreSQLDescribeTableTool (read-only)
└── PostgreSQLQueryTool (read-write with safety)
```

### Profile Resolution

1. Read environment variables matching `POSTGRES_PROFILE_{NAME}_*`
2. Validate required fields (HOST, USER)
3. Check auth method (password requires PASSWORD, iam requires REGION)
4. Build SSL configuration based on auth method
5. Return PostgreSQLProfile object

### IAM Token Generation Flow

1. Check `authMethod === 'iam'`
2. Lazy import `@aws-sdk/rds-signer`
3. Lazy import `@aws-sdk/credential-providers`
4. Resolve AWS credentials (profile-specific → global → default chain)
5. Create Signer with region and credentials
6. Generate token for host:port:username (valid 15 minutes)
7. Use token as password in PostgreSQL connection

## Security

### Authentication

- **Password Authentication** - Standard username/password
- **IAM Authentication** - AWS RDS IAM with automatic token rotation
- **SSL/TLS Support** - Optional encryption for all connections
- **Multiple SSL Modes** - disable, prefer, require, verify-ca, verify-full

### Query Protection

- **Identifier Validation** - Max 63 chars (PostgreSQL limit), no dangerous characters
- **Prepared Statements** - Parameter binding prevents SQL injection (using $1, $2, etc.)
- **Query Validation** - Blocks dangerous operations
- **System Database Protection** - Prevents PostgreSQL system modification
- **System Schema Protection** - Prevents pg_catalog, information_schema modification
- **Memory Protection** - LIMIT cap at 10,000 rows
- **Automatic Cleanup** - Connections closed after each operation

### Credential Management

- **No Password Storage** - IAM generates tokens on-demand
- **Profile Isolation** - Separate credentials per environment
- **Audit Trail** - All operations logged
- **Least Privilege** - Tools encourage read-only operations

## PostgreSQL-Specific Features

### Parameter Binding

PostgreSQL uses `$1`, `$2`, etc. for parameter placeholders (not `?` like MySQL):

```json
{
  "profile": "local",
  "query": "SELECT * FROM users WHERE email = $1 AND status = $2",
  "params": ["user@example.com", "active"]
}
```

### Schema Support

PostgreSQL has first-class schema support. All table operations accept a `schema` parameter:

```json
{
  "profile": "production",
  "table": "orders",
  "schema": "sales"
}
```

**Common Schemas:**
- `public` - Default schema for user tables
- `pg_catalog` - System catalog (read-only)
- `information_schema` - SQL standard metadata views (read-only)

### Identifier Limits

PostgreSQL identifier names (tables, columns, schemas) have a maximum length of 63 characters (NAMEDATALEN - 1).

## Testing

### Run Tests

```bash
# All PostgreSQL tests
bun test src/tools/postgresql/

# Specific test file
bun test src/tools/postgresql/base-tool.test.ts
bun test src/tools/postgresql/postgresql-query-tool.test.ts
```

### Test Coverage

- ✅ Password authentication (localhost)
- ✅ IAM authentication (AWS RDS)
- ✅ All four tools (listDatabases, listTables, describeTable, query)
- ✅ Safety checks and overrides
- ✅ Read-only mode enforcement
- ✅ Profile validation
- ✅ Error handling
- ✅ Schema support

## Troubleshooting

### Tools Not Appearing

**Problem**: PostgreSQL tools don't appear in MCP client

**Solutions**:

1. Verify at least one complete profile is configured:
   ```bash
   echo $POSTGRES_PROFILE_LOCAL_HOST
   echo $POSTGRES_PROFILE_LOCAL_USER
   echo $POSTGRES_PROFILE_LOCAL_PASSWORD
   ```
2. Check that HOST, USER, and required auth fields are set
3. Restart MCP server after adding profile variables
4. Check server logs for warning message about missing profiles

### IAM Authentication Issues

**Problem**: "Could not load credentials from any providers"

**Solutions**:

- Check `~/.aws/credentials` has profile configured
- Verify `AWS_PROFILE` or `POSTGRES_PROFILE_{NAME}_AWS_PROFILE` is set
- Test AWS credentials: `aws sts get-caller-identity`

**Problem**: "Failed to generate IAM auth token"

**Solutions**:

- Verify region matches RDS instance region
- Check IAM permissions include `rds-db:connect`
- Confirm RDS user is configured for IAM authentication
- Ensure SSL is enabled: `POSTGRES_PROFILE_{NAME}_SSL=true`

### Query Safety Issues

**Problem**: "DELETE without WHERE clause is not allowed"

**Solutions**:

- Add WHERE clause: `DELETE FROM table WHERE id = $1`
- Override safety checks: `"skipSafetyChecks": true` (use carefully!)

**Problem**: "Read-only mode: Only SELECT queries allowed"

**Solutions**:

- Set `"readOnly": false` to allow write operations
- Or use `postgresQuery` for data retrieval only

### Connection Issues

**Problem**: "Failed to connect to PostgreSQL database"

**Solutions**:

- Verify host, port, username are correct
- Check network connectivity / security groups
- Test with psql CLI: `psql -h host -U user -d database`
- For SSL issues, verify certificate configuration

### Parameter Binding Issues

**Problem**: "syntax error at or near '$1'"

**Solutions**:

- Ensure you're using PostgreSQL parameter syntax ($1, $2), not MySQL syntax (?)
- Parameters must be in the `params` array
- Parameter count must match placeholders

### Schema Issues

**Problem**: "Table not found" but table exists

**Solutions**:

- Specify schema explicitly: `"schema": "myschema"`
- Check table is in correct schema: `postgresListTables` with schema filter
- Default schema is "public" - verify table isn't in a different schema

## Dependencies

```json
{
  "@aws-sdk/rds-signer": "^3.704.0",
  "@aws-sdk/credential-providers": "^3.704.0",
  "pg": "^8.11.3"
}
```

AWS SDK packages are lazily loaded only when IAM authentication is used.

## Category

**PostgreSQL** - Tools are filtered by credentials availability (at least one profile required).
