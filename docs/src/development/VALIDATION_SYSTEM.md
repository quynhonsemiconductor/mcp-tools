# Validation System Documentation

The QNSC-MCP Toolkit includes an extensible validation system for diagnosing configuration issues. This document explains how the system works and how to add new validation checks.

## Overview

The validation system uses a **registry pattern** to manage validation checks. Checks are:
- **Modular**: Each check is a self-contained unit
- **Reusable**: Checks can be applied to different contexts
- **Prioritized**: Checks run in a defined order
- **Extensible**: New checks can be added easily

## Architecture

### Core Components

1. **ValidationCheck** - Interface that all checks must implement
2. **CheckRegistry** - Singleton that manages all registered checks
3. **ValidationContext** - Context passed to checks containing config data
4. **ConfigValidator** - Facade that coordinates validation

### File Structure

```
src/services/validation/
├── types.ts                    # Core types and interfaces
├── check-registry.ts           # Registry implementation
├── validator.ts                # ConfigValidator facade
├── checks/
│   ├── index.ts               # Registers all checks
│   ├── mcp/                   # MCP config checks
│   │   ├── index.ts           # Register MCP checks
│   │   ├── duplicate-executables.ts
│   │   ├── env-vars.ts
│   │   ├── executable-paths.ts
│   │   ├── hardcoded-secrets.ts
│   │   ├── no-servers.ts
│   │   └── server-names.ts
│   └── qnscmcp/                # QNSC-MCP config checks
│       ├── index.ts           # Register QNSC-MCP checks
│       ├── bundled-mcps.ts
│       ├── category-references.ts
│       ├── local-mcps.ts
│       ├── remote-mcps.ts
│       └── tool-references.ts
└── utils/
    ├── index.ts
    └── placeholder-detection.ts  # Shared utilities
```

## Adding a New Validation Check

### Step 1: Define Your Check

Create a new file in the appropriate directory (`checks/mcp/` or `checks/qnscmcp/`):

```typescript
// src/services/validation/checks/mcp/my-check.ts

import type { McpConfigContext, ValidationCheck, ValidationIssue } from '../../types';

/**
 * Number of X to consider for Y.
 * Extract magic numbers to named constants with clear documentation.
 */
const MY_THRESHOLD = 5;

/**
 * Use priorities from CHECK_PRIORITIES in constants.ts.
 * Lower numbers run first. See the "Check Priorities" section below.
 */
import { CHECK_PRIORITIES } from '../../constants';
const CHECK_PRIORITY = CHECK_PRIORITIES.HARDCODED_SECRETS; // 40

/**
 * Check for [describe what this check does].
 *
 * [Detailed explanation of the check]
 *
 * @example
 * // Example configuration that would trigger this check
 * {
 *   "servers": {
 *     "bad-server": { ... }
 *   }
 * }
 */
export const myValidationCheck: ValidationCheck<McpConfigContext> = {
  id: 'mcp.my-check',                    // Unique ID (namespace.check-name)
  name: 'My validation check',            // Human-readable name
  description: 'Checks for XYZ issues',   // Brief description
  appliesTo: 'mcp-config',                // Context type(s)
  priority: CHECK_PRIORITY,                // Execution priority

  run(context: McpConfigContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const config = context.config as Record<string, unknown>;
    const servers = (config.servers || config.mcpServers || {}) as Record<string, any>;

    // Your validation logic here
    for (const [serverName, serverConfig] of Object.entries(servers)) {
      // Example: Check for missing command
      if (!serverConfig.command) {
        issues.push({
          severity: 'warning',          // 'error' | 'warning' | 'info'
          code: 'MY_ISSUE_CODE',        // Machine-readable code
          message: 'Brief issue description',
          details: 'Additional context or recommended fix',
          serverName                    // Optional: specific server with issue
        });
      }
    }

    return issues;
  }
};
```

### Step 2: Write Tests

Create a test file alongside your check:

```typescript
// src/services/validation/checks/mcp/my-check.test.ts

import { describe, expect, it } from 'bun:test';
import type { McpConfigContext } from '../../types';
import { myValidationCheck } from './my-check';

describe('myValidationCheck', () => {
  const createContext = (servers: Record<string, any>): McpConfigContext => ({
    type: 'mcp-config',
    config: { servers },
    filePath: '/test/mcp.json',
    format: 'servers'
  });

  it('should detect the issue', () => {
    const context = createContext({
      'bad-server': {
        // Config that should trigger the check
      }
    });

    const issues = myValidationCheck.run(context);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('MY_ISSUE_CODE');
    expect(issues[0].severity).toBe('warning');
  });

  it('should NOT flag valid configuration', () => {
    const context = createContext({
      'good-server': {
        // Valid config
      }
    });

    const issues = myValidationCheck.run(context);
    expect(issues).toHaveLength(0);
  });

  // Add more tests for edge cases
});
```

### Step 3: Register Your Check

Add your check to the registration module:

```typescript
// src/services/validation/checks/mcp/index.ts

import { myValidationCheck } from './my-check';

export const mcpChecks = [
  noServersCheck,
  serverNameValidation,
  // ... other checks
  myValidationCheck,  // Add here in priority order
];
```

### Step 4: Export Your Check

```typescript
// src/services/validation/checks/mcp/index.ts

export {
  // ... other exports
  myValidationCheck
};
```

## Validation Check Guidelines

### Best Practices

1. **Extract Magic Numbers**: Use named constants in `constants.ts` for thresholds, limits, etc.
   ```typescript
   // In constants.ts
   export const MIN_SECRET_LENGTH = 16;

   // In your check
   import { MIN_SECRET_LENGTH } from '../../constants';
   if (value.length >= MIN_SECRET_LENGTH) // Good
   if (value.length >= 16) // Bad - magic number
   ```

2. **Document Thoroughly**: Use JSDoc with examples showing what triggers the check

3. **Test Comprehensively**: Cover success cases, failure cases, and edge cases

4. **Return Empty Array for Success**: Never return null or undefined
   ```typescript
   return issues;  // Always return the array (may be empty)
   ```

5. **Use Appropriate Severity**:
   - `error`: Critical issues that will cause failures
   - `warning`: Potential problems or anti-patterns
   - `info`: Informational messages

6. **Provide Actionable Details**: Tell users how to fix the issue
   ```typescript
   details: 'Run chmod +x on the file to add execute permissions.'
   ```

### Context Types

Currently supported contexts:

- `'mcp-config'` - MCP configuration files (mcp.json, claude_desktop_config.json)
- `'qnsc-mcp-config'` - QNSC-MCP configuration (.qnscmcp.yaml)

To add a new context type:

1. Add the type to `ValidationContext` union in `types.ts`
2. Create a corresponding context interface
3. Add a type guard function

### Check Priorities

Check priorities are defined in `src/services/validation/constants.ts`. Lower numbers run first.
Priorities are spaced in increments of 5 to allow inserting new checks without renumbering.

| Priority | Constant Name | Purpose | Examples |
|----------|---------------|---------|----------|
| 5 | `CRITICAL` | Foundational checks that others depend on | No servers configured |
| 10-15 | `SERVER_NAMES`, `TOOL_REFERENCES`, `CATEGORY_REFERENCES` | Basic structural validation | Server name format, tool/category references |
| 20-25 | `EXECUTABLE_PATHS`, `BUNDLED_MCP_REFERENCES`, `ARG_FILE_PATHS` | Path and reference validation | Executable exists, file paths valid |
| 30-35 | `DUPLICATE_EXECUTABLES`, `REMOTE_MCP_REFERENCES` | Duplicate and remote MCP validation | Duplicate server detection |
| 40-50 | `HARDCODED_SECRETS`, `LOCAL_MCP_REFERENCES`, `ENV_VARS` | Secret and environment validation | Hardcoded API keys, missing env vars |
| 100 | `FINAL` | Summary checks that run after all others | Zero tools enabled warning |

## Testing Your Check

Run tests:

```bash
# Test your specific check
bun test src/services/validation/checks/mcp/my-check.test.ts

# Test all validation checks
bun test src/services/validation/

# Test with coverage
bun test --coverage src/services/validation/checks/mcp/my-check.test.ts
```

## Using the Check in Doctor Command

Once registered, your check will automatically run when users execute:

```bash
# Validate all configs
qnsc-mcp doctor

# Validate specific config
qnsc-mcp doctor --path /path/to/config.json

# Verbose mode (shows check names)
qnsc-mcp doctor --verbose

# JSON output
qnsc-mcp doctor --json
```

## Advanced: Async Checks

If your check needs to perform async operations:

```typescript
export const myAsyncCheck: ValidationCheck<McpConfigContext> = {
  id: 'mcp.my-async-check',
  name: 'My async check',
  description: 'Performs async validation',
  appliesTo: 'mcp-config',
  priority: 40,

  async run(context: McpConfigContext): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    // Perform async operations
    const result = await someAsyncOperation();

    if (!result.valid) {
      issues.push({
        severity: 'error',
        code: 'ASYNC_ERROR',
        message: 'Async check failed'
      });
    }

    return issues;
  }
};
```

## Advanced: Shared Utilities

For checks that share common logic, create utilities in `utils/`:

```typescript
// src/services/validation/utils/my-util.ts

export function isValidPattern(value: string): boolean {
  // Shared validation logic
  return /pattern/.test(value);
}
```

Import in your checks:

```typescript
import { isValidPattern } from '../../utils';
```

## Error Handling

The check registry automatically wraps check execution with error handling:

- If a check throws an error, it's caught and reported as a `CHECK_FAILED` issue
- The error message is included in the details
- Other checks continue to run

## Example: Complete Check Implementation

See `src/services/validation/checks/mcp/hardcoded-secrets.ts` for a complete example that demonstrates:
- Named constants for magic numbers
- Comprehensive JSDoc documentation
- Pattern matching for secret detection
- Platform-specific exceptions (Claude configs)
- Thorough test coverage

## Special Cases: Claude Configuration Files

### Hardcoded Secrets Exception

**Important**: The hardcoded secrets check (`mcp.hardcoded-secrets`) does **NOT** apply to Claude-specific configuration files. These configurations legitimately require hardcoded Anthropic API keys and are automatically exempted:

1. **Claude Desktop**: `claude_desktop_config.json`
   - Location (macOS): `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Location (Linux): `~/.config/claude/claude_desktop_config.json`
   - Location (Windows): `%APPDATA%\Claude\claude_desktop_config.json`
   - Server name: `"claude"`
   - Format: `mcpServers`

2. **VS Code Claude Extension**: `cline_mcp_settings.json`
   - Location: `~/Library/Application Support/Code/User/globalStorage/anthropics.claude-code/settings/cline_mcp_settings.json`
   - Any server name
   - Any format

These files require `ANTHROPIC_API_KEY` to be hardcoded in the configuration file by design. The doctor command will not flag these as security issues.

**All other MCP configuration files** should use environment variable references for secrets:

```json
// Good: Use environment variable reference
{
  "servers": {
    "my-server": {
      "command": "node",
      "env": {
        "API_KEY": "${MY_API_KEY}"  // ✅ Good
      }
    }
  }
}

// Bad: Hardcoded secret (will be flagged)
{
  "servers": {
    "my-server": {
      "command": "node",
      "env": {
        "API_KEY": "sk-proj-abc123..."  // ❌ Will trigger warning
      }
    }
  }
}
```

## Contributing

When contributing new validation checks:

1. Follow the existing patterns and conventions
2. Add comprehensive tests (aim for 100% coverage)
3. Document all public functions with JSDoc
4. Extract magic numbers to named constants
5. Add examples showing what triggers the check
6. Test on multiple platforms if relevant (Windows, macOS, Linux)

## Questions?

For questions about the validation system, check:
- Existing checks for reference implementations
- `types.ts` for available interfaces
- Test files for usage examples
