/**
 * PostgreSQL MCP Tools
 *
 * Comprehensive PostgreSQL database interaction tools with profile-based configuration,
 * AWS RDS IAM authentication support, and multi-layer safety features.
 */

// Profile management
export {
  getPostgreSQLProfile,
  getPostgreSQLProfileEnvVars,
  listAvailablePostgreSQLProfiles,
  validatePostgreSQLProfile,
  type PostgreSQLProfile,
  type PostgreSQLSSLConfig,
} from './postgresql-profile';

// Base tool class
export { PostgreSQLBaseTool } from './base-tool';

// Concrete tools
export { PostgreSQLDescribeTableTool } from './postgresql-describe-table-tool';
export { PostgreSQLListDatabasesTool } from './postgresql-list-databases-tool';
export { PostgreSQLListTablesTool } from './postgresql-list-tables-tool';
export { PostgreSQLQueryTool } from './postgresql-query-tool';
