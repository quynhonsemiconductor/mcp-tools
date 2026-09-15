# QNSC MCP Toolkit

[![CI](https://github.com/quynhonsemiconductor/mcp-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/quynhonsemiconductor/mcp-tools/actions/workflows/ci.yml)

A Model Context Protocol server that gives Claude access to the systems QNSC works in:
GitHub, Microsoft 365, Rova, and a Chrome browser. Everyone signs in as themselves — the
tools reach only what that person can already see.

Works with Claude Code, Claude Desktop, and any other MCP client.

## Install

Download the file for your platform from
[the latest release](https://github.com/quynhonsemiconductor/mcp-tools/releases/latest).
There are two per platform and the one you want depends on which Claude you use.

### Claude Code

Take the plain binary, without the `.mcpb` extension:

```bash
# macOS on Apple silicon; substitute your platform's file
chmod +x qnsc-mcp-macos-arm64
mv qnsc-mcp-macos-arm64 ~/.local/bin/qnsc-mcp

# Start it once before registering it. A first launch can take longer than Claude
# Code's 30-second connection limit, which reports a failure that is not real.
qnsc-mcp --help >/dev/null

claude mcp add qnsc-mcp -- ~/.local/bin/qnsc-mcp --config fromEnv
claude mcp list        # expect: ✔ Connected
```

If the first `claude mcp list` still times out, run it again — see
[the Claude Code guide](docs/src/quickstart/clients/claude.md) for `MCP_TIMEOUT`.

### Claude Desktop

Take the `.mcpb` file and open it. Claude Desktop installs it and asks which tool
categories to enable; every tool is listed by name on that screen.

### From source

Only needed to work on the toolkit itself. Requires [Bun](https://bun.sh) `>=1.3.11`.

```bash
bun install
bun run src/mcp.ts doctor        # checks config, environment, keyring, TLS
bun run src/mcp.ts list-tools    # everything registered
bun run build:binary             # builds for the current platform
```

## What you get

**199 tools**, listed individually in [`TOOLS.md`](TOOLS.md).

| Area                          | Tools | Signing in                                                   |
| ----------------------------- | ----- | ------------------------------------------------------------ |
| GitHub                        | 88    | Browser OAuth on first use. No personal access token needed. |
| Rova                          | 23    | A personal API token, created in Rova under API tokens       |
| Chrome DevTools               | 29    | Nothing — drives a local Chrome                              |
| Microsoft 365                 | 14    | Browser sign-in with your own Entra account                  |
| Utility, Knowledge Graph, NPM | 29    | Nothing                                                      |
| k6, CrUX, PostgreSQL, Swagger | 16    | One API key each; unused unless you configure them           |

A fresh install enables **17 tools** and offers the rest as opt-in categories. Microsoft
365 is on by default because it needs no configuration; Rova is not, because it needs a
token only you can create.

Everything is read-only except where stated: sending mail, posting in Teams, creating
calendar events, and creating or updating Rova items. Mail recipients are restricted to
the organisation.

## Configure

Enable tools through `.qnscmcp.yaml` in the working directory, or
`~/.qnscmcp/config.yaml`. Category names must match `TOOLS.md` exactly.

```yaml
tools:
  includeCategories:
    - 'Microsoft 365'
    - Rova
    - Utility
    - 'Github: Issues'
    - 'Github: Pulls'
  # Bundled servers are enabled by name, not by category.
  includeMCPs:
    - chrome-devtools-mcp
```

`includeCategories` is an allowlist: a category left out is excluded even when nothing
appears in `excludeCategories`.

Credentials come from the environment, or from the prompts Claude Desktop shows at
install. `qnsc-mcp doctor` reports what is missing.

## Documentation

|                                                |                                                 |
| ---------------------------------------------- | ----------------------------------------------- |
| [`TOOLS.md`](TOOLS.md)                         | every tool, by category                         |
| [`docs/MAINTAINERS.md`](docs/MAINTAINERS.md)   | architecture, and the traps that have cost time |
| [`docs/src/quickstart/`](docs/src/quickstart/) | per-client setup                                |
| [`bundled/README.md`](bundled/README.md)       | how bundled MCP servers are built               |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)           | development workflow                            |
