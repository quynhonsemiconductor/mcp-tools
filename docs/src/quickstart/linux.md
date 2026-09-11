# Linux / WSL

This guide covers running QNSC MCP Toolkit on Linux distributions and Windows Subsystem for Linux (WSL).

## Run from source (current install path)

There are no published binaries yet — this repository has no releases or tags — so run the toolkit from source with [Bun](https://bun.sh).

### 1. Install Bun

Install [Bun](https://bun.sh) `>=1.3.11` and confirm it:

```bash
bun --version
```

### 2. Clone and install

```bash
git clone https://github.com/quynhonsemiconductor/mcp-tools.git
cd mcp-tools
bun install
```

### 3. Verify it runs

```bash
bun run src/mcp.ts --version
bun run src/mcp.ts doctor        # validate config, env, keyring, TLS
```

### Building a local binary (optional)

To produce a single executable instead of running through Bun:

```bash
bun run build:binary
```

This builds a Linux x64 binary (macOS arm64/x64 are also targets). Nothing is code-signed. Once it is on your PATH you can substitute `qnsc-mcp` for `bun run src/mcp.ts`.

## WSL-Specific Notes

If you're running WSL (Ubuntu, Debian, etc.) on Windows:

- Install Bun **inside** your WSL distribution and clone the repo there. The MCP server then runs inside WSL.
- **VS Code with WSL Remote:** the server runs inside WSL, so configure `mcp.json` to run `bun run src/mcp.ts` with the `"cwd"` set to the repo path inside WSL — no Windows paths needed.
- **Windows-side IDEs:** if your IDE runs on Windows (not in WSL), install Bun and clone the repo on the Windows side instead. See the [Windows setup guide](windows.md).

## Initial Configuration

Generate your configuration file:

```bash
bun run src/mcp.ts generate-config
```

This creates `~/.qnscmcp/config.yaml`. Edit it to enable the tool categories you need. Category names must match [`TOOLS.md`](https://github.com/quynhonsemiconductor/mcp-tools/blob/main/TOOLS.md) exactly:

```bash
nano ~/.qnscmcp/config.yaml
```

```yaml
tools:
  includeCategories:
    - 'CrUX'
    - 'Github: Issues'
    - 'Github: Pulls'
    - 'Github: Repos'
    - 'Github: Search'
    - 'Utility'
```

See the [Configuration Guide](../configuration.md) for all available options.

## Next Steps

1. **Set up your IDE** — follow the guide for your editor:
    - [VS Code](clients/vs-code.md)
    - [JetBrains IDEs](clients/jetbrains.md)
    - [Claude Desktop & Claude Code](clients/claude.md)

2. **Configure API keys** for the services you want to use:
    - [API Key Setup](api-keys.md)
