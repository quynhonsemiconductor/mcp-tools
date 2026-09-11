# SSO Authentication

!!! warning "Not usable in this organization"
    The Entra ID SSO flow described here exists only to authenticate against the QNSC **platform gateway** (`*.ai.qnsc.vn`). That gateway is **not deployed for this organization** — it has no DNS records — and every remote MCP server that relied on it has been removed. There is nothing to sign in to, so the SSO flow cannot complete. The two remote servers that remain (`aws-knowledge-mcp-server` and `figma-dev`) do **not** use SSO. This page is kept only to document the mechanism, which still exists in the codebase.

QNSC MCP Toolkit contains an **Entra ID Single Sign-On (SSO)** implementation for authenticating with QNSC platform services. When a platform gateway is reachable, it lets you authenticate once via your browser instead of managing API keys by hand. With no gateway deployed, the flow has nothing to authenticate against.

## How It Was Meant to Work

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────┐
│  MCP     │────▶│  Local OAuth  │────▶│  Entra ID    │────▶│  Platform│
│  Client  │     │  Callback     │     │  (Azure AD)  │     │  Gateway │
│          │◀────│  Server       │◀────│              │◀────│          │
└──────────┘     └──────────────┘     └──────────────┘     └──────────┘
```

1. **First use**: when a platform tool is invoked, the toolkit opens your default browser to the Entra ID login page
2. **Authentication**: you sign in with your QNSC credentials (supports MFA)
3. **Token exchange**: after login, tokens are stored in your OS keychain
4. **Automatic refresh**: tokens are refreshed in the background
5. **Platform request**: the JWT is sent to the platform gateway

Steps 4–5 have no destination here, because the gateway is not deployed.

## Token Storage

Where the flow does run (against a reachable gateway), tokens are stored in your operating system's credential store rather than on disk in plain text:

- **macOS**: Keychain Access (service: `qnsc-mcp-entra-id`)
- **Windows**: Windows Credential Manager (target: `qnsc-mcp-entra-id`)
- **Linux**: Secret Service API / libsecret

Token values are redacted from logs (`bun run src/mcp.ts view-logs`), error messages, and tool response payloads.

## Re-authentication Commands

The platform-session re-authentication tooling still ships and will run, even though it currently has no gateway to reach.

### CLI Command

```bash
bun run src/mcp.ts reauth platform
```

This clears any stored tokens and triggers a new Entra ID login attempt. `platform` and `entra` are interchangeable aliases for the same provider:

```bash
bun run src/mcp.ts reauth entra    # same provider, direct name
```

> Only Platform / Entra ID is a recognized provider for re-authentication. Other service names return a "not yet supported" message. (If you built a local binary, substitute `qnsc-mcp` for `bun run src/mcp.ts`.)

### MCP Tool

Your AI assistant can also trigger re-authentication using the `reauth` tool:

> "Please re-authenticate with the platform"

The tool accepts a `service` parameter (e.g. "Platform" or "Entra") and performs the same flow as the CLI command.

## Environment Variables

The SSO environment variables (`ENTRA_CLIENT_ID`, `ENTRA_TENANT_ID`, `MCP_PLATFORM_URL`, `MCP_AUTH_CALLBACK_PORT`, `MCP_AUTH_LOGIN_TIMEOUT_MS`, `ENTRA_ACCESS_TOKEN`) are documented in [Configuration → SSO Authentication Variables](../configuration.md#sso-authentication-variables). Setting them will not make platform tools work while the gateway is undeployed.

## Local Tools Are Unaffected

SSO applies only to platform (gateway) requests. Every native, bundled, and local tool in this build runs without any authentication setup — credentials for the tools that need them are plain environment variables (see [API Key Setup](api-keys.md)), not SSO.
