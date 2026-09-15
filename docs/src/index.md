# QNSC MCP Toolkit

A Model Context Protocol server that gives Claude access to the systems QNSC works in:
GitHub, Microsoft 365, Rova, and a Chrome browser. Everyone signs in as themselves, so
the tools reach only what that person can already see.

**199 tools.** The per-tool inventory is
[`TOOLS.md`](https://github.com/quynhonsemiconductor/mcp-tools/blob/main/TOOLS.md),
generated from the running server.

| Area | Tools | What signing in needs |
| --- | --- | --- |
| GitHub | 88 | A browser sign-in on first use. No personal access token. |
| Rova | 23 | A personal API token, created in Rova under API tokens |
| Chrome DevTools | 29 | Nothing — it drives a local Chrome |
| Microsoft 365 | 14 | A browser sign-in with your own Entra account |
| Utility, Knowledge Graph, NPM | 29 | Nothing |
| k6, CrUX, PostgreSQL, Swagger | 16 | One API key each, and unused until configured |

A fresh install turns on **17 tools** and offers the rest as categories you tick.
Microsoft 365 is on by default because it needs no configuration. Rova is not, because it
needs a token only you can create.

Everything reads rather than writes, apart from: sending mail, posting in Teams, creating
calendar events, and creating or updating Rova items. Mail recipients are held to the
organisation.

## Install

Download the file for your platform from
[the latest release](https://github.com/quynhonsemiconductor/mcp-tools/releases/latest).
Each platform has two, and which you want depends on which Claude you use.

- **Claude Code** — the plain binary, then `claude mcp add`. See
  [Getting started](quickstart/getting-started.md).
- **Claude Desktop** — the `.mcpb` file. Open it and Claude Desktop installs it, asking
  which categories to enable.

Per-platform notes: [macOS](quickstart/macOS.md), [Windows](quickstart/windows.md),
[Linux](quickstart/linux.md).

Running from source is only needed to work on the toolkit itself, and is covered in
[Getting started](quickstart/getting-started.md).

## Also inside

- **Bundled MCP server:** `chrome-devtools-mcp`, extracted and run locally.
- **Local MCP servers:** `playwright-local`, `mobile-next-local`, `dart-mcp` — opt-in
  subprocesses.
- **Remote MCP server:** `figma-dev`, through the Figma desktop app on `localhost:3845`.
- **8 prompts** and **5 resources**.

`aws-knowledge-mcp-server` is defined but off: AWS's endpoint accepts a handshake and
refuses every tool call with `Http operation is not supported for gateway protocol type
MCP`.
