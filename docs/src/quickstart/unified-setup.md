# Unified Setup Across All Clients (macOS)

!!! warning "macOS only"
    This guide is written for **macOS**. The file paths, shell profile (`.zshrc`), and `launchd` behavior described here are Mac-specific.

Since **Claude Code (CLI)**, **Claude Desktop**, **VS Code Copilot**, and **VS Code Claude** are all separate tools, there is no single centralized place to configure MCP -- you have to configure it in multiple locations. However, you can share environment variables across all of them via your shell profile (`.zshrc`), so API keys are defined once and never duplicated.

This guide shows how to set that up.

!!! info "One source install, shared across clients"
    This guide points every client at the same source checkout (`bun run src/mcp.ts`) and the same shared environment file, so you clone and configure the toolkit once rather than per client.

---

## Prerequisites

- The `mcp-tools` repository cloned locally, with [Bun](https://bun.sh) `>=1.3.11` installed and `bun install` run (see [macOS installation guide](macOS.md))
- Verify it runs, from inside the repo folder:

    ```bash
    bun run src/mcp.ts --version
    ```

!!! note "Commands below use `bun run src/mcp.ts`"
    The toolkit runs from source, so the client configs below invoke `bun run src/mcp.ts` with the repo path as the working directory. If you built a local binary with `bun run build:binary`, substitute its path for that command.

---

## Step 1: Create a Shared Environment File

To avoid duplicating API keys across clients, keep all MCP-related environment variables in a single dedicated file.

Create `~/.qnsc_mcp` with only the credentials this build actually uses:

```bash
export GITHUB_TOKEN=your_key
export GH_TOKEN=your_key
export GOOGLE_CRUX_API_KEY=your_key
export GRAFANA_K6_TOKEN=your_key
export SWAGGER_HUB_API_KEY=your_key
export GEOCODE_MAPS_API_KEY=your_key
```

!!! tip "Only include the keys you need"
    You only need entries for the services you actually use. If you only use CrUX and GitHub, just include those. See [API Key Setup](api-keys.md) for what each key unlocks.

!!! warning "Don't set credentials for removed tools"
    Earlier versions of this file listed variables like `SPLUNK_TOKEN`, `PAGERDUTY_API_KEY`, `FIGMA_API_KEY`, `QNSC_MCP_API_KEY` and `NEW_RELIC_*`. Those tools reached their vendors through a hosted platform gateway that is not deployed for this organization and have been removed, so setting those variables does nothing. `QNSC_MCP_API_KEY` is still read by the Memory tools, but it points at a platform API this organization does not host, so those tools cannot work regardless.

Then source it from your shell profile so the variables are available in any terminal session.

Add to `~/.zshrc` (or `~/.bashrc`):

```bash
source ~/.qnsc_mcp
```

Reload your shell or open a new terminal:

```bash
source ~/.zshrc
```

---

## Step 2: Generate QNSC MCP Configuration

Generate the default tool configuration file, from inside the `mcp-tools` folder:

```bash
bun run src/mcp.ts generate-config
```

This creates `~/.qnscmcp/config.yaml`. Edit it to enable the tool categories you need. Category names must match [`TOOLS.md`](https://github.com/quynhonsemiconductor/mcp-tools/blob/main/TOOLS.md) exactly:

```yaml
tools:
  includeCategories:
    - 'CrUX'
    - 'Github: Issues'
    - 'Github: Pulls'
    - 'Github: Repos'
    - 'Github: Search'
    - 'Utility'

logging:
  enabled: true
  level: info
```

!!! tip
    Enabling too many tools at once may degrade performance. Enable only the categories you need. VS Code Copilot has a limit of 128 tools.

---

## Step 3: Configure Each Client

### Claude Code (CLI) & VS Code Claude Extension

Both Claude Code and the VS Code Claude extension read from the same configuration file.

**File:** `~/.claude.json`

```json
{
  "mcpServers": {
    "qnsc-mcp": {
      "type": "stdio",
      "command": "bun",
      "args": ["run", "src/mcp.ts", "--config", "~/.qnscmcp/config.yaml"],
      "cwd": "/absolute/path/to/mcp-tools"
    }
  }
}
```

Replace `/absolute/path/to/mcp-tools` with the path where you cloned the repository. Since these clients run inside your shell, they automatically inherit the environment variables set via `~/.zshrc`. No `env` block is needed.

---

### Claude Desktop

**File:** `~/Library/Application Support/Claude/claude_desktop_config.json`

!!! warning "Claude Desktop does not inherit your shell environment"
    Claude Desktop launches via macOS `launchd`, which does **not** source `.zshrc` or `.zprofile`. Environment variables like `GOOGLE_CRUX_API_KEY` or `GITHUB_TOKEN` will not be available unless you explicitly source them. The workaround is to wrap the command in a `zsh` shell that sources `~/.qnsc_mcp` first and runs the toolkit from the repo folder.

```json
{
  "mcpServers": {
    "qnsc-mcp": {
      "command": "/bin/zsh",
      "args": ["-c", "source ~/.qnsc_mcp && cd /absolute/path/to/mcp-tools && bun run src/mcp.ts --config ~/.qnscmcp/config.yaml"]
    }
  }
}
```

Replace `/absolute/path/to/mcp-tools` with the path where you cloned the repository. After any changes to this file, fully quit Claude Desktop (`Cmd+Q`) and relaunch it.

---

### VS Code Copilot

**File:** `~/Library/Application Support/Code/User/mcp.json`

```json
{
  "servers": {
    "qnsc-mcp": {
      "command": "bun",
      "type": "stdio",
      "args": ["run", "src/mcp.ts", "--config", "~/.qnscmcp/config.yaml"],
      "cwd": "/absolute/path/to/mcp-tools"
    }
  }
}
```

Replace `/absolute/path/to/mcp-tools` with the path where you cloned the repository. VS Code Copilot inherits environment variables from the shell, so no `env` block or `${input:...}` prompts are needed when using the shared environment file approach.

---

## How It Works

| Client | Config File | Picks Up Env Vars From |
|--------|-------------|----------------------|
| Claude Code (CLI) | `~/.claude.json` | Shell (`.zshrc` sources `~/.qnsc_mcp`) |
| VS Code Claude | `~/.claude.json` | Shell (`.zshrc` sources `~/.qnsc_mcp`) |
| VS Code Copilot | `~/Library/Application Support/Code/User/mcp.json` | Shell (`.zshrc` sources `~/.qnsc_mcp`) |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | Explicit `source ~/.qnsc_mcp` in the `zsh` wrapper |

No duplication, no drift. All API keys live in one file (`~/.qnsc_mcp`), and every client picks them up.

---

## Troubleshooting

### Environment variables not available in Claude Desktop

Claude Desktop uses `launchd` and does not inherit shell environment. Make sure your config uses the `/bin/zsh` wrapper with `source ~/.qnsc_mcp` as shown above.

### Environment variables not available in VS Code

If you launched VS Code from Finder or Spotlight rather than the terminal, it may not have your shell environment. Either:

- Launch VS Code from the terminal: `code .`
- Or restart VS Code after opening a new terminal window

### Tools not appearing

- Verify the toolkit runs from the repo folder: `bun run src/mcp.ts --version`
- Check that `~/.qnscmcp/config.yaml` has at least one tool category enabled
- Confirm each client's `"cwd"` points at your cloned `mcp-tools` folder
- See the [Troubleshooting](../troubleshooting.md) page for more details

### Need the full per-client setup?

For detailed configuration options specific to each client (including `${input:...}` prompts, MCPB, etc.), see:

- [Claude Desktop & Claude Code](clients/claude.md)
- [VS Code](clients/vs-code.md)
- [JetBrains IDEs](clients/jetbrains.md)
