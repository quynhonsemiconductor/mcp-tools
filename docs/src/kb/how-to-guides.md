# How-To Guides

Step-by-step guides for common tasks that aren't covered in the main setup docs.

---

## Updating QNSC MCP Toolkit

The built-in update command checks GitHub for a newer release and replaces your binary in place.

### Standard Update

```bash
qnsc-mcp update
```

This will:

1. Check for the latest release of `quynhonsemiconductor/mcp-tools` on GitHub
2. Show you the new version number and ask for confirmation
3. Download and replace the current binary

If no releases have been published yet, the command reports that you are already
on the latest version and makes no changes.

After updating, **restart your IDE** (VS Code, Claude Desktop, JetBrains) so it picks up the new binary.

### Check Without Installing

To see if an update is available without applying it:

```bash
qnsc-mcp update --check-only
```

### Verify Your Current Version

```bash
qnsc-mcp --version
```

### Claude Desktop (MCPB Install)

If you installed via the `.mcpb` file in Claude Desktop, the update process is the same — run `qnsc-mcp update` from a terminal. The MCPB just configures the extension; the binary is shared.

### Windows Update Failures

The update command can fail on Windows due to file locking. If it hangs or the version doesn't change, see the [Windows Troubleshooting](../quickstart/windows.md#update-command-issues) guide for a manual replacement process.

---

## Sharing Credentials Across Multiple Clients

If you use QNSC MCP in multiple clients (VS Code, Claude Desktop, Claude Code, JetBrains), you end up configuring API keys in several places. Here are two approaches to avoid that.

### Option 1: Shell Profile (Recommended)

Store all MCP-related environment variables in a single file and source it from your shell profile. Every client that inherits your shell environment will pick them up automatically.

**1. Create a credentials file:**

```bash
# ~/.qnsc_mcp_env (macOS/Linux)
export GITHUB_TOKEN=your_github_token
export GOOGLE_CRUX_API_KEY=your_crux_key
export GRAFANA_K6_TOKEN=your_k6_token
export SWAGGER_HUB_API_KEY=your_swaggerhub_key
# Add other keys as needed
```

**2. Source it from your shell profile:**

```bash
# Add to ~/.zshrc (macOS) or ~/.bashrc (Linux)
source ~/.qnsc_mcp_env
```

**3. Simplify your client configs** — remove the `env` block since keys come from the environment:

=== "VS Code (mcp.json)"

    ```json
    {
        "servers": {
            "qnsc-mcp": {
                "type": "stdio",
                "command": "qnsc-mcp"
            }
        }
    }
    ```

=== "Claude Desktop (claude_desktop_config.json)"

    ```json
    {
        "mcpServers": {
            "qnsc-mcp": {
                "command": "qnsc-mcp",
                "args": []
            }
        }
    }
    ```

=== "Claude Code (~/.claude.json)"

    ```json
    {
        "mcpServers": {
            "qnsc-mcp": {
                "command": "qnsc-mcp"
            }
        }
    }
    ```

=== "JetBrains (mcp.json)"

    ```json
    {
        "mcpServers": {
            "qnsc-mcp": {
                "type": "stdio",
                "command": "qnsc-mcp"
            }
        }
    }
    ```

!!! note
    VS Code may not inherit shell environment variables on all platforms. If keys aren't picked up, you may still need `${input:...}` or explicit `env` entries for VS Code specifically.

---

## Refreshing Expired VS Code Input Tokens

When using `${input:...}` syntax in VS Code, the values are cached after you enter them. If a token expires or you need to change it, VS Code won't prompt you again automatically.

### Clear Cached Values

1. Open the **Command Palette** (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type `MCP: List Servers`
3. Find `qnsc-mcp` and click the **Stop** button (or right-click → Stop)
4. Then click **Start** — VS Code will re-prompt for all `${input:...}` values

### Alternative: Reset All MCP Input Values

If the above doesn't re-prompt:

1. Open the **Command Palette**
2. Type `MCP: Reset All Cached Inputs` (if available in your VS Code version)
3. Restart the MCP server

### Nuclear Option

If nothing else works:

1. Open the **Command Palette**
2. Type `Developer: Reload Window`
3. VS Code will restart and re-prompt for all input values on next MCP server start

---

## JetBrains API Key Management

JetBrains IDEs do not support VS Code's `${input:...}` syntax for prompting API keys at startup. Here are your options, from most to least recommended.

### Option 1: Environment Variables via Shell Profile (Recommended)

Set your keys in your shell profile so JetBrains inherits them. See [Sharing Credentials Across Multiple Clients](#sharing-credentials-across-multiple-clients) above.

Then use a minimal `mcp.json` with no `env` block:

```json
{
  "mcpServers": {
    "qnsc-mcp": {
      "type": "stdio",
      "command": "qnsc-mcp"
    }
  }
}
```

!!! important
    JetBrains must be launched from a terminal that has the environment variables set, or the variables must be set as system-level environment variables. Launching from Spotlight/Start Menu may not inherit shell profile variables.

### Option 2: System Environment Variables

Set the variables at the OS level so all applications inherit them:

=== "macOS"

    Add to `~/.zshrc`:
    ```bash
    export GOOGLE_CRUX_API_KEY=your_key
    ```

=== "Windows"

    1. Open **System Properties** → **Environment Variables**
    2. Under **User variables**, click **New**
    3. Add `GOOGLE_CRUX_API_KEY` with your key value

=== "Linux"

    Add to `~/.bashrc` or `~/.profile`:
    ```bash
    export GOOGLE_CRUX_API_KEY=your_key
    ```

### Option 3: Hardcoded in Config (Least Secure)

As a last resort, put keys directly in `mcp.json`. This is what the [JetBrains setup guide](../quickstart/clients/jetbrains.md) shows by default:

```json
{
  "mcpServers": {
    "qnsc-mcp": {
      "env": {
        "GOOGLE_CRUX_API_KEY": "your_actual_key_here"
      }
    }
  }
}
```

!!! warning
    Hardcoded keys risk accidental exposure if the file is shared or committed. Prefer environment variables.
