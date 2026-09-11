# VS Code

This guide covers configuring QNSC MCP Toolkit with Visual Studio Code.

!!! tip "Using multiple clients?"
    If you use VS Code alongside Claude Code or Claude Desktop, see the [Unified Setup Guide](../unified-setup.md) to share API keys across all clients from a single file.

## Prerequisites

- VS Code with the latest version
- QNSC MCP Toolkit installed (see [macOS](../macOS.md) or [Windows](../windows.md) installation guides)
- MCP (Model Context Protocol -- the standard that lets AI assistants use external tools) support requires VS Code 1.102 or later

## Configure MCP Server

1. Open the **Command Palette** (a search bar for VS Code commands) by pressing `Ctrl+Shift+P` (Windows) or `Cmd+Shift+P` (macOS)
2. Type `MCP: Open User Configuration`
3. Add the QNSC MCP server configuration. This is the complete configuration for all supported services -- you only need the entries for services you use, and you can delete the rest:

```json
{
    "servers": {
        "qnsc-mcp": {
            "type": "stdio",
            "command": "qnsc-mcp",
            "env": {
                "GITHUB_TOKEN": "${input:qnsc_github_token}",
                "GRAFANA_K6_TOKEN": "${input:qnsc_k6_token}",
                "GOOGLE_CRUX_API_KEY": "${input:qnsc_crux_key}",
                "SWAGGER_HUB_API_KEY": "${input:qnsc_swagger_key}"
            }
        }
    },
    "inputs": [
        {
            "type": "promptString",
            "id": "qnsc_github_token",
            "description": "GitHub token (unlocks the 92 GitHub tools)",
            "password": true
        },
        {
            "type": "promptString",
            "id": "qnsc_k6_token",
            "description": "Grafana k6 token",
            "password": true
        },
        {
            "type": "promptString",
            "id": "qnsc_crux_key",
            "description": "Google CrUX API Key",
            "password": true
        },
        {
            "type": "promptString",
            "id": "qnsc_swagger_key",
            "description": "SwaggerHub API Key",
            "password": true
        }
    ]
}
```

!!! tip "GITHUB_TOKEN first"
    `GITHUB_TOKEN` is the one worth setting -- it enables 92 of the tools. All four inputs are optional, and the Knowledge Graph, NPM, PostgreSQL, Chrome DevTools, AWS documentation and most Utility tools work with none of them. Delete the entries you do not need.

!!! tip "Using Input Variables"
    The `${input:...}` syntax prompts you for values when VS Code starts the MCP server. This keeps sensitive tokens (like API keys) out of your configuration files. An API key is a secret token that lets the toolkit access a service on your behalf.

## Windows Users

On Windows, you may need to specify the full path to the executable. Change the `"command"` value to the full path:

```json
{
    "servers": {
        "qnsc-mcp": {
            "type": "stdio",
            "command": "C:\\Program Files\\QNSC-MCP\\qnsc-mcp.exe",
            "env": {
                "GITHUB_TOKEN": "${input:qnsc_github_token}"
            }
        }
    }
}
```

Add the same `"env"` entries and `"inputs"` entries as shown in the full configuration above. Only include the keys for the services you use.

## Configure Tool Categories

After setting up the MCP server, configure which tools to enable by editing the config file (a YAML text file that controls your toolkit settings):

1. Open a terminal (search for "PowerShell" in the Start Menu on Windows, or open Terminal on macOS)
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

1. Save and restart VS Code

## Verify Installation

1. Open the **Command Palette** (`Ctrl+Shift+P` on Windows, `Cmd+Shift+P` on macOS) and type `MCP: List Servers` to see the status of your MCP servers
2. Check that `qnsc-mcp` shows as **Running**
3. Open Chat and verify tools are available

## Troubleshooting

### Server Not Starting

- Check the Output panel for error messages
- Verify the binary is in your PATH (a list of locations where your computer looks for programs): `qnsc-mcp --version`
- Run `qnsc-mcp doctor` to diagnose configuration issues

### Tools Not Appearing

- Verify at least one tool category is enabled in your config
- Check the 128 tool limit for Copilot
- Restart VS Code after configuration changes

### Refreshing Expired Input Tokens

If a cached `${input:...}` value expires or needs to be changed, VS Code won't re-prompt automatically. To force a re-prompt:

1. Open the **Command Palette** (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type `MCP: List Servers` and stop the `qnsc-mcp` server
3. Start it again — VS Code will re-prompt for all input values

If that doesn't work, use `Developer: Reload Window` from the Command Palette.

See the [Knowledge Base](../../kb/how-to-guides.md#refreshing-expired-vs-code-input-tokens) for more options.

### Authentication Errors

- Verify API keys are correct and not expired
- Check that input variables are properly configured
- See [API Key Setup](../api-keys.md) for obtaining keys

## Platform-Specific Installation

For binary installation instructions:

- [macOS Setup](../macOS.md)
- [Windows Setup](../windows.md)
