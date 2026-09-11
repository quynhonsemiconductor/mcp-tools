# Troubleshooting

This guide covers common issues and how to resolve them.

## Doctor Command

The `doctor` command validates your MCP configuration and identifies common issues:

```bash
qnsc-mcp doctor
```

**What it checks:**

- YAML syntax errors in configuration files
- Duplicate MCP server executables
- Missing environment variables
- Hardcoded secrets (security risk)
- Invalid file paths
- Invalid tool or category references

**Options:**

| Option | Description |
|--------|-------------|
| `--path` | Check a specific configuration file |
| `--json` | Output results as JSON |
| `--verbose` | Show all checks, including passing ones |
| `--quiet` | Only show errors (useful for CI/CD) |

## Rescue Mode

If the MCP server fails to start due to configuration or initialization errors, it automatically enters **Rescue Mode**. This provides diagnostic capabilities even when the server cannot start normally.

### How Rescue Mode Works

- When startup fails, the server starts with limited functionality
- Only one diagnostic tool is available: `startup-diagnostics`
- Your AI assistant can call this tool to diagnose the issue
- The tool provides detailed error information and actionable solutions

### Using Rescue Mode

1. **Recognize Rescue Mode**: You'll see only 1 tool (`startup-diagnostics`) instead of 100+

2. **Ask for help**: Tell your AI assistant something like:
    - "Why isn't my MCP working?"
    - "What's wrong with the server?"
    - "Help me fix the MCP configuration"

3. **Follow the guidance**: The AI will call `startup-diagnostics` and explain:
    - What went wrong
    - Specific steps to fix it
    - How to verify the fix

4. **Restart your IDE**: After fixing the issue, restart your IDE to reload the server normally

### What Rescue Mode Can Diagnose

| Issue | Example |
|-------|---------|
| Malformed YAML | Indentation errors, invalid syntax |
| Permission errors | Can't create directories |
| Missing files | Configuration file not found |
| Invalid schema | Wrong configuration values |
| Tool loading failures | Missing dependencies |
| Environment issues | Misconfigured variables |

### Example Rescue Mode Interaction

```
User: "Why don't I see any of my CrUX tools?"

AI: "I notice the MCP server is in rescue mode. Let me check the diagnostics..."
[Calls startup-diagnostics tool]

AI: "The server failed to start because your .qnscmcp.yaml file has invalid YAML
syntax:

YAMLException: bad indentation at line 5, column 3

This is an indentation error. YAML requires consistent spacing (use spaces, not tabs).

To fix:
1. Open your config file in your editor
   (macOS/Linux: ~/.qnscmcp/config.yaml, Windows: %USERPROFILE%\.qnscmcp\config.yaml)
2. Go to line 5 and check indentation
3. Make sure you're using spaces (2 or 4 per level)
4. Validate syntax at https://www.yamllint.com/
5. Restart VS Code after fixing

Would you like help understanding YAML indentation rules?"
```

## Common Issues

### Server Won't Start

**Symptoms:** No tools appear in your IDE

**Solutions:**

1. Check if another process is using the same port
2. Verify the binary is installed correctly:

   ```bash
   qnsc-mcp --version
   ```

3. Run diagnostics:

   ```bash
   qnsc-mcp doctor
   ```

4. Check the logs:

   ```bash
   qnsc-mcp view-logs --lines 50
   ```

### Tools Not Appearing

**Symptoms:** Server starts but expected tools are missing

**Solutions:**

1. Check your configuration includes the tools:

   ```bash
   qnsc-mcp list-tools --filtered
   ```

2. Verify tool categories are enabled in `.qnscmcp.yaml`
3. Check for exclude patterns that might match your tools

### Authentication Errors

**Symptoms:** Tools fail with authentication or permission errors

**Solutions:**

1. Verify environment variables are set in your IDE's MCP configuration
2. Check that API keys are valid and not expired
3. For GitHub tools, ensure OAuth flow completed successfully
4. See [API Key Setup](quickstart/api-keys.md) for key configuration

### SSO Authentication Issues

**Symptoms:** Platform tools fail with 401 errors, browser SSO window doesn't appear, or token refresh fails

**Solutions:**

1. **Force re-authentication:**

   ```bash
   qnsc-mcp reauth platform
   ```

   This clears cached tokens and triggers a fresh Entra ID SSO login.

2. **Browser window doesn't open:**
    - Ensure a default browser is configured on your system
    - Check that port `9876` (or the configured `MCP_AUTH_CALLBACK_PORT`) is not in use
    - In headless environments, set `ENTRA_ACCESS_TOKEN` directly

3. **Token refresh failures:**
    - Tokens automatically refresh using stored refresh tokens
    - If refresh fails, the toolkit will trigger a new interactive login
    - Persistent failures may indicate the Entra ID App Registration has been modified

4. **Login timeout:**
    - The default SSO login timeout is 120 seconds
    - If you need more time, set `MCP_AUTH_LOGIN_TIMEOUT_MS` to a higher value
    - Example: `MCP_AUTH_LOGIN_TIMEOUT_MS=300000` for 5 minutes

5. **Callback port conflicts:**
    - If port `9876` is in use, set `MCP_AUTH_CALLBACK_PORT` to an available port
    - The server also tries fallback ports `9877`–`9879` automatically
    - Ensure the redirect URI `http://localhost:<port>/cms/auth/entra/callback` is registered in your Entra ID App Registration

6. **Credential storage issues:**
    - Tokens are stored securely in the OS keychain (macOS Keychain / Windows Credential Manager)
    - If keychain access is denied, check system permissions for your IDE or terminal
    - Re-authentication will clear and re-create the stored credentials

### macOS Security Warnings

**Symptoms:** "Cannot be opened because it is from an unidentified developer"

**Solutions:**

**Option 1 - System Settings (Recommended):**

1. Double-click the app (you'll see the warning, click OK)
2. Open **System Settings > Privacy & Security**
3. Scroll down to find the blocked app message
4. Click **"Open Anyway"**

**Option 2 - Terminal:**

After extracting the downloaded `.zip` file, remove the quarantine attribute:

```bash
xattr -cr ~/Downloads/qnsc-mcp-installer.app
```

Then double-click to open normally.

### YAML Syntax Errors

**Symptoms:** Server fails to start with YAML parse error

**Solutions:**

1. Use spaces, not tabs (YAML doesn't allow tabs)
2. Maintain consistent indentation (2 or 4 spaces)
3. Validate your YAML at [yamllint.com](https://www.yamllint.com/)
4. Check for missing colons or quotes

**Common YAML mistakes:**

```yaml
# Wrong - tabs instead of spaces
tools:
 include:  # Tab character here causes error

# Wrong - inconsistent indentation
tools:
  include:
   - 'tool-1'  # 3 spaces instead of 4

# Correct
tools:
  include:
    - 'tool-1'
    - 'tool-2'
```

### Windows-Specific Issues

See the [Windows Quickstart Guide](quickstart/windows.md) for platform-specific troubleshooting.

## Getting Help

If you're still stuck:

1. **Check the logs**: `qnsc-mcp view-logs --tail`
2. **Run diagnostics**: `qnsc-mcp doctor --verbose`
3. **Ask a question**: [Discussions](https://github.com/quynhonsemiconductor/mcp-tools/discussions)

When asking for help, include:

- Output of `qnsc-mcp doctor`
- Relevant log entries
- Your operating system and IDE
- What you were trying to do when the error occurred
