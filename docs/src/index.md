# QNSC MCP Toolkit

A single Model Context Protocol (MCP) server that gives your AI assistant a large set
of work tools. It ships **224 tools** — 142 native plus 82 from two bundled MCP
servers — of which **101 are enabled by default**. The authoritative, per-tool
inventory is [`TOOLS.md`](https://github.com/quynhonsemiconductor/mcp-tools/blob/main/TOOLS.md).

What's inside:

- **Native tools (142):** GitHub (92), Utility (15), Knowledge Graph (9), k6 (6),
  NPM (5), Memory (5), CrUX (4), PostgreSQL (4), Swagger (2).
- **Bundled MCP servers (82 tools):** `sharepoint` (56) and `chrome-devtools-mcp` (26).
- **Local MCP servers:** `playwright-local`, `mobile-next-local`, `dart-mcp`.
- **Remote MCP servers:** `aws-knowledge-mcp-server` (public AWS endpoint, no
  credentials) and `figma-dev` (via the Figma desktop app on `localhost:3845`).
- **8 prompts** and **5 resources**.

Most tools run with no credentials. The one worth setting first is `GITHUB_TOKEN`,
which unlocks the 92 GitHub tools. See [API Key Setup](quickstart/api-keys.md) for the
full list.

## Choose Your Path

Not sure where to begin? Pick the guide that matches your comfort level.

<div class="grid cards" markdown>

-   :octicons-terminal-16:{ .lg .middle } **I'm comfortable with the command line**

    ---

    Jump straight into installation, configuration, and IDE setup.

    [:octicons-arrow-right-24: Windows Setup](quickstart/windows.md) | [:octicons-arrow-right-24: macOS Setup](quickstart/macOS.md)

-   :octicons-book-16:{ .lg .middle } **I'd like a guided, step-by-step setup**

    ---

    Everything explained from scratch -- no technical experience needed.

    [:octicons-arrow-right-24: Getting Started Guide](quickstart/getting-started.md)

-   :octicons-people-16:{ .lg .middle } **I'm not sure where to start**

    ---

    No worries -- your team lead or manager can help determine the right setup path, or reach out on our [Discussions](https://github.com/quynhonsemiconductor/mcp-tools/discussions) for guidance.

</div>

## Installing

!!! warning "No release has been published yet"
    This repository has no releases and no tags, so there are no prebuilt binaries or
    installers to download. Until CI publishes a release, build from source:

    ```bash
    git clone https://github.com/quynhonsemiconductor/mcp-tools.git
    cd mcp-tools
    bun install
    bun run build
    ```

    The build produces the `qnsc-mcp` binary (and, for Claude Desktop, a `.mcpb`
    bundle) in `dist/`. Point your client at that binary using the guides below.

Client setup once you have the binary:

- [macOS](quickstart/macOS.md) · [Windows](quickstart/windows.md) · [Linux / WSL](quickstart/linux.md)
- [VS Code](quickstart/clients/vs-code.md) · [JetBrains IDEs](quickstart/clients/jetbrains.md) · [Claude Desktop & Claude Code](quickstart/clients/claude.md)
- [API Key Setup](quickstart/api-keys.md) · [Configuration](configuration.md)

## Help

Questions, bugs, and feature requests go through the repository's
[GitHub Issues](https://github.com/quynhonsemiconductor/mcp-tools/issues) and
[Discussions](https://github.com/quynhonsemiconductor/mcp-tools/discussions).
