# Bundled MCP Servers

<!-- BEGIN MCP STATS -->
Bundled MCPs provide a comprehensive suite of 82 tools across 2 third-party MCP servers.
<!-- END MCP STATS -->

## Available MCPs

<!-- BEGIN MCP TABLE -->
| Name | Version | Tools | Risk Score |
| ---- | ------- | ----- | ---------- |
| [chrome-devtools-mcp](./chrome-devtools-mcp) | 0.12.1 | 26 | N/A |
| [sharepoint](./sharepoint) | 1.0.14 | 56 | 🟢 [25/100](./sharepoint/security-scan.json) |

## Tool Count by MCP

| MCP | Tool Count |
| --- | ---------- |
| sharepoint | 56 |
| chrome-devtools-mcp | 26 |

<!-- END MCP TABLE -->

## Requirements

Currently only Node MCP servers are supported. To securely run these MCPs they are run in an isolated Node process which requires one of the following JavaScript runtimes:

1. **QNSC MCP Binary Runtime** (Recommended for MCPB users)
   - When QNSC MCP is compiled as a Bun executable, it can use itself as a runtime
   - Uses `BUN_BE_BUN=1` environment variable to enable Bun CLI behavior
   - Requires Bun v1.2.16+ compilation
   - No additional installation required when running as an MCPB
   - Automatically detected when running from compiled binary

2. **Bun Runtime** (Recommended for CLI/development)
   - Fast JavaScript runtime with excellent performance
   - Install from: https://bun.sh

3. **Node.js** (Universal fallback)
   - Widely available JavaScript runtime
   - Install from: https://nodejs.org

The QNSC MCP toolkit automatically detects and uses the appropriate runtime:

**Runtime Detection Priority:**
1. System `bun` (if available in PATH) - preferred for development/CLI usage
2. System `node` (if available in PATH) - universal fallback
3. QNSC MCP binary itself via `BUN_BE_BUN=1` - automatic for MCPB users

**When running as MCPB:**
- Uses QNSC MCP binary itself via `BUN_BE_BUN=1` (preferred for MCPB users)
- Falls back to system Bun/Node.js if binary runtime fails
- No system runtime installation required in most cases

**When running via CLI:**
1. System `bun` (if available) - preferred for performance
2. System `node` (if available) - universal fallback
3. QNSC MCP binary itself - last resort fallback

<!-- BEGIN SECURITY SCAN SUMMARY -->
## Security Scan Results

Security scans are performed on each bundled MCP using AWS Bedrock Claude to analyze for potential security issues.

### Security Risk Distribution

#### Risk Score Distribution

| Risk Level | Count | Description |
| ---------- | ----- | ----------- |
| 🔴 High (75-100) | 0 | Critical security issues present |
| 🟠 Medium (40-74) | 0 | Moderate security concerns |
| 🟢 Low (0-39) | 1 | Minor or no security issues |

#### Most Common Vulnerability Types

| Category | Count |
| -------- | ----- |
| Injection Vulnerabilities | 2 |
| Insecure Data Handling | 1 |
| Security Misconfigurations | 1 |
| Network Security Issues | 1 |

### MCPs by Security Risk Score

| MCP | Risk Score | Highest Risk Category | Level | Score |
| --- | ---------- | --------------------- | ----- | ----- |
| 🟢 [sharepoint](./sharepoint) | [25/100](./sharepoint/security-scan.json) | Injection Vulnerabilities | MEDIUM | 50/100 |
<!-- END SECURITY SCAN SUMMARY -->

## Security and Isolation

Each MCP runs in its own sandbox process, ensuring that:

- MCPs cannot affect each other's execution
- Crashes in one MCP don't impact others
- Security policies are enforced at the process level

## Adding New MCPs

To add a new MCP server, create a configuration file in the `bundled` directory following the YAML format:

```yaml
name: my-mcp-server
description: A useful MCP server for specific tasks
source:
  repository: https://github.com/org/repo
  ref: v1.0.0
  entrypoint: dist/index.js
  startFunction: main
build:
  enabled: true
  command: bun run build
envVars:
  - name: API_KEY
    description: API key for the service
    required: true
```

### Sourcing Information

The following config values need to be determined from the MCP server's source code.

- **Repository:** This is the github repo where the MCP server should be pulled from
- **Ref:** This should be a tag or commit SHA if the project doesn't leverage tags
- **Entrypoint:** The built file that is run, you can find generally find this in the server's `package.json`
- **Start Function:** This is rarely needed. But some CJS/mixed module server's may only execute if they detect they're being run and not imported. You should only supply this if the server does not start after being bundled. You can find determine the function that needs to be called from the entrypoint's source.
- **Build Command:** This is the command to run the build. Generally `bun run build` is sufficient.

### Adding Environment Variables

After creating the bundled MCP configuration, you must manually add the environment variables to both `src/env.ts` and `manifest.json`:

1. **Update `src/env.ts`:**
   Add Zod schema definitions for each environment variable in the appropriate section:
   ```typescript
   // MY_MCP_NAME
   MY_MCP_API_KEY: z
     .string()
     .optional()
     .describe('Your API key description'),
   MY_MCP_ENDPOINT: z
     .string()
     .url()
     .default('https://api.example.com')
     .describe('API endpoint URL'),
   ```

2. **Update `manifest.json`:**
   Add environment variables to **two locations**:

   a. In `server.mcp_config.env` section:
   ```json
   "MY_MCP_API_KEY": "${user_config.MY_MCP_API_KEY}",
   "MY_MCP_ENDPOINT": "${user_config.MY_MCP_ENDPOINT}"
   ```

   b. In `user_config` section with full metadata:
   ```json
   "MY_MCP_API_KEY": {
     "type": "string",
     "title": "MY_MCP_API_KEY",
     "description": "Your API key description",
     "required": false,
     "sensitive": true
   },
   "MY_MCP_ENDPOINT": {
     "type": "string",
     "title": "MY_MCP_ENDPOINT",
     "description": "API endpoint URL",
     "required": false,
     "sensitive": false,
     "default": "https://api.example.com"
   }
   ```

**Note:** The `generate-tool-loader.js` script only updates manifest.json for QNSC MCP tools in `src/tools/`. Bundled MCP environment variables must be added manually as described above.
