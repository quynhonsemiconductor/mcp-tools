# JetBrains IDEs

This guide covers configuring QNSC MCP Toolkit with JetBrains IDEs (IntelliJ IDEA, WebStorm, PyCharm, etc.).

## Prerequisites

- A JetBrains IDE with GitHub Copilot support
- [GitHub Copilot plugin](https://plugins.jetbrains.com/plugin/17718-github-copilot) installed
- QNSC MCP binary installed (see [macOS](../macOS.md) or [Windows](../windows.md) installation guides)

## Install GitHub Copilot Plugin

1. Open your JetBrains IDE
2. Go to **Settings** > **Plugins**
3. Search for "GitHub Copilot"
4. Click **Install** and restart the IDE

Or install directly from the [JetBrains Marketplace](https://plugins.jetbrains.com/plugin/17718-github-copilot).

## Configure MCP Server

Edit the Copilot MCP configuration file directly:

- **macOS/Linux:** `~/.config/github-copilot/intellij/mcp.json`
- **Windows:** `%APPDATA%\github-copilot\intellij\mcp.json`

Add the QNSC MCP server configuration:

```json
{
  "mcpServers": {
    "qnsc-mcp": {
      "type": "stdio",
      "command": "qnsc-mcp",
      "args": [],
      "env": {
        "GITHUB_TOKEN": "",
        "GRAFANA_K6_TOKEN": "",
        "GOOGLE_CRUX_API_KEY": "",
        "SWAGGER_HUB_API_KEY": ""
      }
    }
  }
}
```

Fill in your API keys and tokens, then save the file. `GITHUB_TOKEN` unlocks the 92 GitHub tools; all four are optional and everything else (Knowledge Graph, NPM, PostgreSQL, Chrome DevTools, AWS documentation, most Utility tools) works with none of them.

!!! tip "Avoiding Hardcoded Keys"
    JetBrains IDEs don't support VS Code's `${input:...}` syntax for prompting API keys at startup. To avoid hardcoding secrets in this file, set your keys as environment variables in your shell profile instead. See the [JetBrains API Key Management](../../kb/how-to-guides.md#jetbrains-api-key-management) guide for details.

## Windows Users

On Windows, specify the full path to the executable:

```json
{
  "mcpServers": {
    "qnsc-mcp": {
      "type": "stdio",
      "command": "C:\\Program Files\\QNSC-MCP\\qnsc-mcp.exe",
      "args": [],
      "env": {}
    }
  }
}
```

!!! note
    Add your API keys to the `env` object using the same keys shown in the macOS example above.

## Configure Tool Categories

After setting up the MCP server, configure which tools to enable:

1. Open **PowerShell** (Windows) or **Terminal** (macOS/Linux)
2. Edit your config file:

    **macOS/Linux:**
    ```bash
    open ~/.qnscmcp/config.yaml
    ```

    **Windows (PowerShell):**
    ```powershell
    notepad $env:USERPROFILE\.qnscmcp\config.yaml
    ```

3. Enable the categories you need:

    ```yaml
    tools:
      includeCategories:
        - 'CrUX'
        - 'Github: Issues'
        - 'Github: Pulls'
        - 'Github: Repos'
        - 'Github: Search'
        - 'Utility'
        - 'NPM'
    ```

!!! important
    Copilot has a limit of 128 tools selected at any one time. Enable only the categories you need.

4. Save and restart your IDE

## Verify Installation

1. Open the Copilot Chat panel
2. Verify the MCP toggle is enabled
3. Test with a prompt like: "What QNSC MCP tools are available?"

## Troubleshooting

### Server Not Starting

- Verify the binary is in your PATH: `qnsc-mcp --version`
- Check that the `mcp.json` file has valid JSON syntax
- Run `qnsc-mcp doctor` to diagnose configuration issues

### Tools Not Appearing

- Verify at least one tool category is enabled in your config
- Check that the MCP toggle is enabled in Chat
- Restart the IDE after configuration changes

### Authentication Errors

- Verify API keys are filled in correctly (no extra spaces or quotes)
- Check that tokens haven't expired
- See [API Key Setup](../api-keys.md) for obtaining keys

## Platform-Specific Installation

For binary installation instructions:

- [macOS Setup](../macOS.md)
- [Windows Setup](../windows.md)
