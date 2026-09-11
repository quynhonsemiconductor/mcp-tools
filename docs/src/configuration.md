# Configuration

QNSC MCP Toolkit uses YAML configuration files to customize which tools are available and how the server behaves.

## Configuration File Locations

Configuration files are loaded in the following priority order:

1. **Custom location**: Specified with the `--config` flag (highest priority)
2. **Current directory**: `./.qnscmcp.yaml` or `./.qnscmcp.yml`
3. **Home directory**:
    - macOS/Linux: `~/.qnscmcp/config.yaml` or `~/.qnscmcp/config.yml`
    - Windows: `%USERPROFILE%\.qnscmcp\config.yaml` or `%USERPROFILE%\.qnscmcp\config.yml`

To generate a starter configuration file, run this in **PowerShell** (Windows) or **Terminal** (macOS/Linux):

```bash
qnsc-mcp generate-config
```

!!! tip "Web Interface"
    Use `qnsc-mcp web` to manage your configuration through a browser-based UI.

## Tool Configuration

### Including and Excluding Tools

Control which tools are available using `include`, `exclude`, `includeCategories`, and `excludeCategories`:

```yaml
tools:
  # Include specific tools by ID
  include:
    - 'queryCruxMetrics'
    - 'searchCode'

  # Exclude specific tools
  exclude:
    - 'deleteGithubGist'

  # Include entire categories
  includeCategories:
    - 'CrUX'
    - 'Github: Issues'
    - 'Github: Pulls'
    - 'Github: Repos'
    - 'Github: Search'
    - 'Utility'

  # Enable remote MCP servers
  includeRemoteMCPs:
    - 'aws-knowledge-mcp-server'

  # Exclude entire categories
  excludeCategories:
    - 'PostgreSQL'
```

!!! note "Category names"
    Run `qnsc-mcp list-tools` to see the exact category names. Native categories are
    `CrUX`, `Github: *` (Actions, Branches, Dependabot, Discussions, Gists, Issues,
    Orgs, Projects, Pulls, Releases, Repos, Search, Wiki), `k6`, `Knowledge Graph`,
    `Memory`, `NPM`, `PostgreSQL`, `Swagger`, and `Utility`.

### Glob Pattern Matching

The `include` and `exclude` fields support glob patterns for flexible tool selection:

```yaml
tools:
  # Combine exact matches with glob patterns
  include:
    - 'queryCruxMetrics'   # Exact match
    - 'queryCrux*'         # All CrUX history/metrics query tools

  # Exclude specific tools by pattern
  exclude:
    - 'delete*'
    - 'deleteGithub*Reaction'
```

**Common Patterns:**

| Pattern | Matches |
|---------|---------|
| `search*` | All tools starting with "search" |
| `*Reaction` | All tools ending with "Reaction" |
| `*Github*` | All tools containing "Github" |

!!! note
    Exclude patterns take precedence over include patterns. If a tool matches both, it will be excluded.

## MCP Server Configuration

### Bundled MCP Servers

Enable third-party MCP servers that are packaged with the toolkit:

```yaml
tools:
  includeMCPs:
    - 'sharepoint'
    - 'chrome-devtools-mcp'
```

See the [Bundled MCP README](https://github.com/quynhonsemiconductor/mcp-tools/blob/main/bundled/README.md) for available servers.

### Local MCP Servers

Configure locally installed MCP servers:

```yaml
tools:
  includeLocalMCPs:
    - 'playwright-local'
```

### Remote MCP Servers

Enable remote MCP servers that connect via HTTP:

```yaml
tools:
  includeRemoteMCPs:
    - 'aws-knowledge-mcp-server'
    - 'figma-dev'
```

Only two remote servers are available: `aws-knowledge-mcp-server` (a public AWS
endpoint, no credentials) and `figma-dev` (the Figma desktop app on
`localhost:3845`). See the [Remote MCPs reference](reference/remotes/index.md) for
setup instructions.

### MCP Server Arguments

Pass CLI arguments to MCP servers:

```yaml
tools:
  includeMCPs:
    - 'chrome-devtools-mcp'
  includeLocalMCPs:
    - 'playwright-local'
  mcpArgs:
    # Arguments for bundled MCP
    chrome-devtools-mcp:
      - '--verbose'
    # Arguments for local MCP
    playwright-local:
      - '--headless'
      - '--browser'
      - 'chromium'
```

## Logging Configuration

Configure file-based logging:

```yaml
logging:
  enabled: true
  level: 'debug'  # Options: debug, info, warn, error
  maxSize: 10     # Max file size in MB before rotation
  maxFiles: 5     # Number of rotated files to keep
```

Logs are stored in:

- macOS/Linux: `~/.qnscmcp/logs/mcp-tools.log`
- Windows: `%USERPROFILE%\.qnscmcp\logs\mcp-tools.log`

View logs with:

```bash
# View all logs
qnsc-mcp view-logs

# Tail logs in real-time
qnsc-mcp view-logs --tail

# View last 50 lines
qnsc-mcp view-logs --lines 50
```

**View-Logs Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--tail` | Continuously watch log file for changes | `false` |
| `--lines` | Number of lines to display | All lines |

## Prompt Repository Configuration

Load prompts from external Git repositories:

```yaml
prompts:
  repositories:
    - type: 'remote'                                  # 'remote' (Git repo) or 'local' (filesystem path)
      repo: 'quynhonsemiconductor/prompts-repo'        # <org>/<name> for remote, absolute path for local
      branch: 'main'                                  # Optional: branch or tag (ignored for local)
      include:                                        # Optional: glob filter of paths to include
        - 'prompts/**'
```

## Complete Example

```yaml
# .qnscmcp.yaml
tools:
  # Enable specific categories
  includeCategories:
    - 'CrUX'
    - 'Github: Issues'
    - 'Github: Pulls'
    - 'Github: Repos'
    - 'Github: Search'
    - 'Utility'

  # Enable remote MCP servers
  includeRemoteMCPs:
    - 'aws-knowledge-mcp-server'

  # Include additional tools by ID or pattern
  include:
    - 'queryCruxMetrics'

  # Exclude destructive operations
  exclude:
    - 'delete*'

  # Enable bundled MCP servers
  includeMCPs:
    - 'sharepoint'

logging:
  enabled: true
  level: 'info'
  maxSize: 10
  maxFiles: 5

prompts:
  repositories:
    - repo: 'my-org/my-prompts'
```

## Environment Variables

Many tools require API keys or tokens. These are set as environment variables in your IDE's MCP configuration. See the [API Key Setup Guide](quickstart/api-keys.md) for instructions on obtaining and configuring keys.

### SSO Authentication Variables

For platform tools that use Entra ID Single Sign-On, the following environment variables control the SSO authentication flow. Most deployments use the bundled defaults and require no configuration.

| Variable | Description | Default |
|----------|-------------|---------|
| `ENTRA_CLIENT_ID` | Entra ID App Registration client ID | Bundled default |
| `ENTRA_TENANT_ID` | Entra ID tenant ID for the organization | Bundled default |
| `ENTRA_CLIENT_SECRET` | Client secret (optional, for confidential clients) | None |
| `MCP_PLATFORM_URL` | Remote MCP platform base URL | Bundled default |
| `MCP_AUTH_CALLBACK_PORT` | Local OAuth callback server port | `9876` |
| `MCP_AUTH_LOGIN_TIMEOUT_MS` | SSO login timeout in milliseconds | `120000` (2 min) |
| `ENTRA_ACCESS_TOKEN` | Pre-set access token (bypasses SSO flow, useful for CI/CD) | None |

!!! tip
    In most cases, you do not need to set any SSO variables. The toolkit ships with production defaults that work out of the box. Override these only for development, testing, or custom Entra ID App Registrations.

!!! note "Headless Environments"
    In CI/CD or headless environments where a browser is not available, set `ENTRA_ACCESS_TOKEN` directly to skip the interactive SSO flow.

## CLI Reference

| Command | Description |
|---------|-------------|
| `qnsc-mcp server` | Start the MCP server (default) |
| `qnsc-mcp web` | Launch web configuration UI |
| `qnsc-mcp list-tools` | List all available tools |
| `qnsc-mcp list-tools --filtered` | List only enabled tools |
| `qnsc-mcp generate-config` | Generate template config file |
| `qnsc-mcp doctor` | Diagnose configuration issues |
| `qnsc-mcp view-logs` | View server logs |
| `qnsc-mcp reauth <service>` | Force re-authentication for a service |
| `qnsc-mcp update` | Check for updates |
| `qnsc-mcp --help` | Show all commands and options |

### Reauth Command

The `reauth` command forces a fresh SSO login for a given service, clearing any cached tokens:

```bash
# Re-authenticate with the platform (Entra ID SSO)
qnsc-mcp reauth platform

# 'entra' is an interchangeable alias for the same provider
qnsc-mcp reauth entra
```

> Only Platform / Entra ID services support re-authentication today.

Use this command when:

- You need to switch accounts
- Your tokens have expired or become invalid
- You're troubleshooting authentication issues
- You receive persistent 401 errors

The same functionality is available as an MCP tool (`reauth`) that can be invoked from your AI assistant.
