# Remote MCP Servers

QNSC MCP now supports connecting to remote MCP servers via HTTP streaming using the MCP TypeScript SDK. This allows you to proxy tools from external MCP servers through your local QNSC MCP instance using the standard MCP protocol.

## Configuration

Select from approved remote MCP servers in your `.qnscmcp.yaml` file:

```yaml
tools:
    ...
    includeRemoteMCPs:
      - internal-api-gateway
      - partner-service-alpha
    ...
```

### Available Remote Servers

The following remote MCP servers are approved for use:

#### Internal Servers

- `internal-api-gateway` - Company internal API gateway providing enterprise data access
- `dev-testing-server` - Internal development server for testing new MCP integrations

#### Partner Servers

- `partner-service-alpha` - Trusted partner service, typically available to the entire enterprise

#### External Servers

- `external-data-service` - Third-party data service typically used by a limited set of business units
- `aws-knowledge-mcp-server` - A remote, fully-managed MCP server hosted by AWS that provides access to the latest AWS docs, API references, What's New Posts, Getting Started information, Builder Center, Blog posts, Architectural references, and Well-Architected guidance.

**Note**: If no `include` list is specified, servers marked as `defaultEnabled: true` will be activated automatically.

## How It Works

1. **Connection**: When QNSC MCP starts, it establishes HTTP streaming connections to all enabled remote servers using the MCP TypeScript SDK
2. **Discovery**: Remote servers are queried using the standard MCP `listTools` method
3. **Registration**: Discovered tools are registered in the local tool registry with a server prefix
4. **Execution**: When a remote tool is called, the request is forwarded using the MCP `callTool` method
5. **Protocol Compliance**: All communication follows the official MCP specification for maximum compatibility

## Tool Naming

Remote tools appear in the tool registry with the format:

```
{server-name}__{tool-name}
```

For example, a tool named `fetch-data` from server `my-remote-server` would appear as:

```
my-remote-server__fetch-data
```

## OAuth Challenge Support

When remote servers require OAuth authentication, QNSC MCP handles the challenge flow:

1. Remote server sends OAuth challenge
2. QNSC MCP passes challenge information to the calling client
3. Client handles OAuth flow with the remote service
4. Subsequent requests include authentication tokens

### OAuth Challenge Format

```javascript
{
  challengeUrl: "https://auth.example.com/oauth/authorize?...",
  state: "random-state-string",
  scopes: ["read", "write"],
  provider: "example-oauth"
}
```

### Entra ID SSO Authentication

For QNSC platform remote servers, authentication is handled automatically via **Entra ID Single Sign-On (SSO)**:

1. When a platform remote tool is invoked, the toolkit detects that the request targets the configured `MCP_PLATFORM_URL`
2. A JWT bearer token is automatically attached to the `Authorization` header
3. If you have a service-specific API key configured, it is included as an additional header
4. Tokens are refreshed automatically in the background
5. If a 401 response is received, the toolkit retries with a force-refreshed token

No additional configuration is needed beyond enabling the remote MCP server — SSO authentication is applied transparently for all platform requests. See the [SSO Authentication guide](../../quickstart/sso-auth.md) for details.

## Security Considerations

- **Environment Variables**: Use environment variables for sensitive data like API keys and tokens
- **HTTPS Required**: Remote MCP servers should use HTTPS endpoints
- **MCP Authentication**: Authentication is handled according to MCP specification
- **Header Security**: Be careful not to log or expose authentication headers — credential values are automatically redacted in logs
- **Transport Security**: HTTP streaming transport includes built-in security features
- **SSO Tokens**: Entra ID tokens are stored in the OS keychain and never written to disk in plain text

## Error Handling

Remote MCP connections include robust error handling using the MCP SDK:

- **Connection Failures**: Failed connections are logged but don't prevent startup
- **Tool Execution Errors**: Remote tool errors are passed through to the client following MCP error format
- **Timeout Handling**: SDK handles appropriate timeouts for HTTP streaming
- **Reconnection**: Automatic reconnection logic is built into the HTTP streaming transport

## Example Configuration

See [`examples/remote-mcp-config.yml`](../examples/remote-mcp-config.yml) for a complete configuration example with multiple remote servers.

## Monitoring

Use the following commands to monitor remote MCP connections:

```bash
# List all tools including remote ones
qnsc-mcp list-tools

# Check server logs for connection status
qnsc-mcp view-logs --tail
```

Remote MCP connection status and statistics are logged during server startup and available in the debug logs.

## Adding New Remote Servers

System administrators can add new approved remote MCP servers to the codebase:

### 1. Add Server Definition

Add the server definition to `src/remote-mcps/available-servers.ts`:

```typescript
{
  id: 'new-server-id',                    // Must be unique
  name: 'New Server Name',
  description: 'Description of server purpose',
  url: 'https://new-server.com/mcp',      // Must be valid HTTPS URL
  requiredEnvVars: ['NEW_SERVER_TOKEN'],  // Required environment variables
  parameters: {                           // Optional parameters
    region: 'us-west-2'
  },
  headers: {                              // Optional authentication headers
    Authorization: 'Bearer ${NEW_SERVER_TOKEN}'
  },
  defaultEnabled: false,                  // Enable by default or not
  category: 'external'                    // Category: internal, partner, external, development
}
```

### 2. Update Documentation

Update this documentation file to include the new server in the "Available Remote Servers" section.

### 3. Environment Variables

Document any required environment variables:

```bash
export NEW_SERVER_TOKEN="your-token-here"
```

### 4. Test Configuration

Test the new server configuration:

```yaml
remoteMCPs:
  include:
    - 'new-server-id'
```

### 5. Validation

The server will validate that:

- Server IDs in configuration exist in the approved list
- Required environment variables are available
- Server connections can be established

Invalid server IDs will be logged as warnings, and the system will continue with valid servers.

### Best Practices for Adding Servers

- **Security**: All servers must use HTTPS endpoints
- **Documentation**: Include clear descriptions and required environment variables
- **Categories**: Use appropriate categories to group related servers
- **Default State**: New external servers should typically have `defaultEnabled: false`
- **Testing**: Thoroughly test new servers before adding to production
- **Approval**: Follow security review processes for new external integrations
