# Claude

This guide covers configuration for both Claude Desktop and Claude Code (CLI).

!!! tip "Using multiple clients?"
    If you use Claude Code, Claude Desktop, and VS Code together, see the [Unified Setup Guide](../unified-setup.md) to share API keys across all clients from a single file.

## Claude Desktop

Claude Desktop provides a native desktop experience for interacting with Claude AI, with built-in support for MCP (Model Context Protocol -- the standard that lets AI assistants use external tools) servers.

### Installation via MCPB (Recommended)

The recommended way to install QNSC MCP Tools in Claude Desktop is the MCPB bundle (MCP Bundle -- a packaged installer that sets everything up and prompts you for your own credentials). CI builds one `.mcpb` per platform (macOS arm64/x64, Windows x64, Linux arm64/x64) when a version tag is pushed.

#### Get the MCPB Package

!!! warning "No release has been published yet"
    This repository has no releases and no tags, so there is no `.mcpb` file to download today. Until CI publishes one, build it from source:

    ```bash
    git clone https://github.com/quynhonsemiconductor/mcp-tools.git
    cd mcp-tools
    bun install
    bun run build
    ```

    The build writes the platform binary and the `.mcpb` bundle to `dist/`. Once a release exists, you will instead download the file for your platform (`qnsc-mcp-macos-arm64.mcpb`, `qnsc-mcp-macos-x64.mcpb`, `qnsc-mcp-windows-x64.mcpb`, or the Linux equivalents) from the repository's Releases page.

#### Install in Claude Desktop

1. Open Claude Desktop
2. Go to **Settings** → **Extensions**
3. Click **"Advanced settings"** and find the **Extension Developer** section
4. Click **"Install Extension…"** to open the file browser, then select the `.mcpb` file you downloaded
5. Follow the installation prompts -- Claude Desktop will extract and install the MCP server (a background service that connects Claude to external tools -- you do not need to manage it directly)

#### Configure Settings

During installation, Claude Desktop presents a configuration interface built from the bundle's `user_config`. You can also return to it any time from **Settings** → **Extensions** by clicking the installed **qnsc-mcp** extension to open its settings panel. There you can:

1. **Set API credentials** - Enter your own tokens for the services you want to use. The bundle prompts for four, all optional:
    * **GitHub token** (`GITHUB_TOKEN`) -- unlocks the 92 GitHub tools
    * **Grafana k6 token** (`GRAFANA_K6_TOKEN`) -- 6 load-testing tools
    * **Google CrUX API key** (`GOOGLE_CRUX_API_KEY`) -- 4 Core Web Vitals tools
    * **SwaggerHub API key** (`SWAGGER_HUB_API_KEY`) -- 2 OpenAPI tools

!!! tip
    The configuration UI shows a description for each field. All four are optional -- the Knowledge Graph, NPM, PostgreSQL, Chrome DevTools, AWS documentation and most Utility tools work with none of them.

!!! tip "Which keys do I need?"
    You only need keys for the services you actually use. If you only need CrUX, just enter your Google CrUX API Key and leave the rest blank. See the [API Key Setup guide](../api-keys.md#which-do-i-need) for details.

#### Edit Configuration File (Optional)

!!! info "You can skip this step"
    If you are just getting started, you can skip this section. The default configuration works for most users. This step is only needed if you want to customize which tool categories are available.

The MCPB installation includes a configuration file (a settings file written in YAML -- a simple text format for configuration) that you can edit directly for advanced settings:

**macOS/Linux:**

```bash
# The config file is located in the MCPB installation directory
open ~/.claude-desktop/mcpb/qnsc-mcp/.qnscmcp.yaml
```

**Windows:**

```cmd
notepad %USERPROFILE%\.claude-desktop\mcpb\qnsc-mcp\.qnscmcp.yaml
```

Example configuration:

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

logging:
  enabled: true
  level: info
  maxSize: 10
  maxFiles: 5
```

!!! warning "Important: Restart Required"
    After making any configuration changes, you must restart Claude Desktop completely for them to take effect. Quit the app (not just close the window), wait a few seconds, then reopen it. On macOS, press Cmd+Q or click **Claude > Quit Claude Desktop** in the menu bar.

#### Restart Claude Desktop

After configuring:

1. Click **"Save"** in the configuration UI
2. **Quit Claude Desktop completely** -- not just close the window. On macOS, press Cmd+Q or click **Claude > Quit Claude Desktop** in the menu bar. On Windows, right-click the Claude icon in the system tray and choose **Quit**.
3. Wait a few seconds, then reopen Claude Desktop
4. The MCP server will automatically start when you begin a new conversation

#### Verify Installation

To verify that QNSC MCP Tools are available:

1. Start a new conversation in Claude Desktop
2. Click the **"+"** button at the bottom of the chat box and select **"Connectors"**
3. **What you should see:** `qnsc-mcp` listed among your connectors, with its QNSC MCP tools available (organized by category such as CrUX, GitHub, Web, etc.)

!!! tip
    You can also confirm the extension is installed and enabled under **Settings** → **Extensions**.

!!! failure "If qnsc-mcp does not appear"
    Make sure you restarted Claude Desktop completely after configuration (see the restart step above). If it still does not appear, check the [Troubleshooting](#tools-not-appearing-in-claude-desktop) section below.

#### Test Functionality

Try a test prompt to confirm everything is working:

```
What QNSC MCP tools do you have access to? Please list them by category.
```

**What you should see:** Claude should respond with a list of available tools organized by category, such as "CrUX," "GitHub: Issues," "Web," and so on. The specific categories depend on your configuration.

Or test a specific tool:

```
Audit the Core Web Vitals for https://example.com
```

---

### Manual Installation (Alternative Method)

If you prefer manual configuration or the MCPB method isn't available, you can configure Claude Desktop manually.

#### Install the Program

First, install the QNSC MCP toolkit following your platform-specific guide:

* [macOS Installation](../macOS.md)
* [Windows Installation](../windows.md)

#### Locate Claude Desktop Configuration

The Claude Desktop configuration file is located at:

**macOS:**

```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows:**

```
%APPDATA%\Claude\claude_desktop_config.json
```

#### Generate QNSC MCP Configuration

In **Command Prompt** (Windows) or **Terminal** (macOS), run:

```
qnsc-mcp generate-config
```

This creates a configuration file at `~/.qnscmcp/config.yaml` (macOS/Linux) or `%USERPROFILE%\.qnscmcp\config.yaml` (Windows).

#### Edit Claude Desktop Configuration

Open `claude_desktop_config.json` file and add the QNSC MCP server configuration.

!!! info "You only need the keys you use"
    The configuration below includes all supported services. You only need to fill in the keys for services you use -- leave the rest as empty strings (`""`).

**macOS/Linux:**

```json
{
  "mcpServers": {
    "qnsc-mcp": {
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

**Windows:**

```json
{
  "mcpServers": {
    "qnsc-mcp": {
      "command": "C:\\Program Files\\QNSC-MCP\\qnsc-mcp.exe",
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

!!! tip
    You can specify a custom configuration file path using the `--config` argument:
    ```json
    "args": ["--config", "/path/to/your/config.yaml"]
    ```

#### Configure Tool Categories

Edit your QNSC MCP configuration file:

**macOS/Linux:**
```bash
open ~/.qnscmcp/config.yaml
```

**Windows (PowerShell):**
```powershell
notepad $env:USERPROFILE\.qnscmcp\config.yaml
```

Specify which tool categories to enable:

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

!!! tip
    Enabling too many tools at once may degrade performance. Enable only the categories you need.

#### Restart and Verify

!!! warning "Important: Restart Required"
    After making any configuration changes, you must restart Claude Desktop completely for them to take effect. Quit the app (not just close the window), wait a few seconds, then reopen it. On macOS, press Cmd+Q or click **Claude > Quit Claude Desktop** in the menu bar. On Windows, right-click the Claude icon in the system tray (bottom-right corner of the taskbar) and choose **Quit**.

1. Save all configuration files
2. **Quit Claude Desktop completely** -- not just close the window (see the warning above)
3. Wait a few seconds, then reopen Claude Desktop
4. Verify tools appear via the **"+"** → **"Connectors"** menu in the chat box, as described in the [Verify Installation](#verify-installation) section above

---

## Claude Code

Claude Code is Anthropic's agentic coding tool, available as a CLI, IDE extension, and web app, with built-in support for MCP servers.

### Prerequisites

* Claude Code CLI installed ([Installation Guide](https://code.claude.com/docs/en/overview))
* QNSC MCP Tools binary installed (see platform-specific installation guides)
* Required API keys for services you want to use
* Anthropic API key

### Locate Claude Code Configuration

Claude Code MCP servers are configured in `~/.claude.json` (user scope) or `.mcp.json` (project scope):

**macOS/Linux:**

```bash
~/.claude.json
```

**Windows:**

```
%USERPROFILE%\.claude.json
```

### Install QNSC MCP Binary

Install the QNSC MCP binary following your platform-specific guide:

* [macOS Installation](../macOS.md)
* [Windows Installation](../windows.md)

Verify installation:

```bash
qnsc-mcp --version
```

### Generate QNSC MCP Configuration

Generate the default configuration file:

```bash
qnsc-mcp generate-config
```

This creates `~/.qnscmcp/config.yaml` (macOS/Linux) or `%USERPROFILE%\.qnscmcp\config.yaml` (Windows).

### Configure Claude Code MCP Settings

Add the QNSC MCP server using the Claude Code CLI:

```bash
claude mcp add qnsc-mcp -- qnsc-mcp
```

Or edit `~/.claude.json` directly:

```json
{
  "mcpServers": {
    "qnsc-mcp": {
      "command": "qnsc-mcp",
      "env": {
        "GITHUB_TOKEN": "",
        "GRAFANA_K6_TOKEN": "",
        "GOOGLE_CRUX_API_KEY": ""
      }
    }
  }
}
```

`GITHUB_TOKEN` is the one worth setting first — it enables 92 of the tools. All three
are optional, and everything else (Knowledge Graph, NPM, Chrome DevTools, AWS
documentation, most Utility tools) works with none of them. If `qnsc-mcp` is not on
your `PATH`, give the full path to the downloaded binary as `command`.

### Configure Tool Categories

Edit your QNSC MCP configuration to specify which tools to enable:

**macOS/Linux:**
```bash
open ~/.qnscmcp/config.yaml
```

**Windows (PowerShell):**
```powershell
notepad $env:USERPROFILE\.qnscmcp\config.yaml
```

Example configuration:

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

logging:
  enabled: true
  level: info
```

!!! tip
    Enabling too many tools at once may degrade performance. Enable only the categories you need.

### Start Claude Code

Launch Claude Code from your terminal:

```bash
claude
```

The MCP server will automatically connect when Claude Code starts.

### Verify Installation

Check that tools are available:

```
What QNSC MCP tools do you have access to? Please group them by category.
```

Or test a specific tool:

```
Can you use CrUX to audit the Core Web Vitals for https://example.com?
```

---

## Troubleshooting

### Tools Not Appearing in Claude Desktop

If tools don't appear after installation:

1. **Verify the extension is installed and enabled:**
    * Open Claude Desktop **Settings → Extensions**
    * Check that `qnsc-mcp` is listed and enabled
    * For connection status and logs, open **Settings → Developer** (Desktop app)
    * Look for any error messages

2. **Check the program installation:**

   ```bash
   qnsc-mcp --version
   ```

3. **Review configuration:**
    * Ensure the configuration file (settings file) exists and has valid YAML (a simple text format for configuration) syntax
    * Verify API keys are set correctly (no extra quotes or spaces)
    * Check that at least one tool category is enabled

4. **Check logs:**
    * **macOS:** `~/Library/Logs/Claude/mcp-server-qnsc-mcp.log`
    * **Windows:** `%APPDATA%\Claude\logs\mcp-server-qnsc-mcp.log`

5. **Completely restart:**
    * Quit Claude Desktop (not just close the window). On macOS, press Cmd+Q or click **Claude > Quit Claude Desktop** in the menu bar. On Windows, right-click the Claude icon in the system tray and choose **Quit**.
    * Wait a few seconds
    * Relaunch Claude Desktop

### Tools Not Appearing in Claude Code

If tools don't appear in Claude Code:

1. **Check MCP server status:**

   ```bash
   claude mcp list
   ```

2. **Verify configuration file syntax:**

* Ensure `~/.claude.json` is valid JSON (no trailing commas)
* Check that paths are correct for your OS

3. **Test the program directly:**

   ```bash
   qnsc-mcp --help
   ```

2. **Review startup output:**
    * Look for connection errors in the terminal
    * Check for authentication failures

3. **Restart Claude Code:**

   ```
   /exit
   claude
   ```

### Authentication Errors

If you're getting authentication or permission errors:

1. **Verify API keys (your service credentials) are correct:**
    * No extra spaces before or after the key
    * No quotes around the key value in environment variables
    * Keys have not expired

2. **Check required permissions:**
    * the CrUX API key must have the Chrome UX Report API enabled
    * a `GITHUB_TOKEN` needs the `repo`, `read:org` and `workflow` scopes for the full GitHub tool set

3. **Obtain new keys:**
    * Refer to the [API Key Setup guide](../api-keys.md) for instructions on generating new keys

### Path Issues on Windows

If Windows can't find the command:

1. **Use absolute path in configuration:**

   ```json
   "command": "C:\\Program Files\\QNSC-MCP\\qnsc-mcp.exe"
   ```

2. **Or add to PATH:**
    * Right-click "This PC" → Properties
    * Advanced system settings → Environment Variables
    * Add the directory containing `qnsc-mcp.exe` to the PATH variable

3. **Check file permissions:**
    * Ensure the executable has run permissions
    * Try running as administrator if needed

### Configuration File Not Found

If QNSC MCP can't find its configuration file:

1. **Generate a new config:**

   ```bash
   qnsc-mcp generate-config
   ```

2. **Specify config path explicitly:**

   ```json
   "args": ["--config", "/full/path/to/.qnscmcp/config.yaml"]
   ```

3. **Check file permissions:**

   ```bash
   # macOS/Linux
   ls -la ~/.qnscmcp/config.yaml

   # Windows
   dir %USERPROFILE%\.qnscmcp\config.yaml
   ```

## Additional Resources

* [QNSC MCP Tools GitHub Repository](https://github.com/quynhonsemiconductor/mcp-tools)
* [QNSC MCP Tools Documentation](https://github.com/quynhonsemiconductor/mcp-tools/blob/main/src/tools/README.md)
* [Model Context Protocol Documentation](https://modelcontextprotocol.io)
* [Claude Desktop Download](https://claude.com/download)
* [Claude Code Documentation](https://code.claude.com/docs/en/overview)

## Getting API Keys

For detailed instructions on obtaining API keys for various services, see the [API Key Setup guide](../api-keys.md), which covers:

* GitHub token (`GITHUB_TOKEN`) -- 92 tools
* Grafana k6 token (`GRAFANA_K6_TOKEN`)
* Google CrUX API Key (`GOOGLE_CRUX_API_KEY`)
* SwaggerHub API key (`SWAGGER_HUB_API_KEY`)
* Geocode Maps API key (`GEOCODE_MAPS_API_KEY`)
