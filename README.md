# QNSC MCP Toolkit

[![CI](https://github.com/quynhonsemiconductor/mcp-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/quynhonsemiconductor/mcp-tools/actions/workflows/ci.yml)

Model Context Protocol server that gives an AI assistant a catalog of tools: GitHub,
SharePoint, Chrome DevTools, AWS documentation, Postgres, a knowledge graph, npm
dependency analysis and more. Works with any MCP client — VS Code, Claude Desktop,
Claude Code, JetBrains.

## What's included

**224 tools**, of which 101 are enabled by default.
[`TOOLS.md`](TOOLS.md) is the full inventory, generated from the running server.

| Surface | Count | Notes |
|---|---|---|
| Native tools | 142 | GitHub (92), Utility (15), Knowledge Graph (9), k6 (6), NPM (5), Memory (5), CrUX (4), PostgreSQL (4), Swagger (2) |
| Bundled MCP tools | 82 | `sharepoint` (56), `chrome-devtools-mcp` (26) — run locally, see [`bundled/README.md`](bundled/README.md) |
| Remote MCP servers | 2 | AWS documentation and Figma Dev Mode; see [Remote servers](#remote-servers) |
| Local MCP servers | 3 | Playwright, Mobile Next, Dart — opt-in subprocesses |
| Prompts | 8 | Code review, diagrams, test plans |
| Resources | 5 | Logs, current config, Kong entities |

Most GitHub tools need a `GITHUB_TOKEN`; the credential each tool requires is listed
in [`TOOLS.md`](TOOLS.md).

## Install

No binaries are published yet — there are no releases or tags on this repository, so
run it from source. Requires [Bun](https://bun.sh) `>=1.3.11`.

```bash
git clone https://github.com/quynhonsemiconductor/mcp-tools.git
cd mcp-tools
bun install

bun run src/mcp.ts --version
bun run src/mcp.ts doctor        # validate config, env, keyring, TLS
bun run src/mcp.ts list-tools    # everything registered
```

To build a local binary: `bun run build:binary` (macOS arm64/x64 and Linux x64;
nothing is code-signed, so macOS Gatekeeper will object).

## Configure

Tools are opt-in through `.qnscmcp.yaml` in the working directory, or
`~/.qnscmcp/config.yaml`. Without one you get the `includeByDefault` set, which
includes all 56 SharePoint tools — usually worth narrowing.

```yaml
tools:
  # Category names must match TOOLS.md exactly.
  includeCategories:
    - Utility
    - Knowledge Graph
    - NPM
    - 'Github: Issues'
    - 'Github: Pulls'

  # Individual tool IDs, if a whole category is too broad.
  include:
    - doctor
    - get-current-time

  includeRemoteMCPs:
    - aws-knowledge-mcp-server

  includeLocalMCPs:
    - playwright-local
```

`bun run src/mcp.ts list-tools --filtered` shows what a config actually enables.
Full reference: [Configuration](docs/src/configuration.md).

## Remote servers

Two, both reached without any hosted infrastructure:

- **`aws-knowledge-mcp-server`** — AWS documentation search and regional availability.
  Public endpoint, no credentials. It connects and its 5 tools register, but calling one
  currently returns `Http operation is not supported for gateway protocol type MCP` from
  AWS. That is the endpoint's own reply — raw `curl` gets the same, for every protocol
  version it will negotiate — so the tools are listed but not yet usable.
- **`figma-dev`** — served by the Figma desktop app on `localhost:3845`.

17 others were removed. They proxied through a platform gateway at `*.ai.qnsc.vn` which
is not deployed for this organization, so none could connect;
[`src/remote-mcps/README.md`](src/remote-mcps/README.md) records what it did. Grafana k6
and GitHub, the two in that set that matter here, are covered by native tools instead.

## Connect a client

| Client | Guide |
|---|---|
| VS Code | [vs-code.md](docs/src/quickstart/clients/vs-code.md) |
| Claude Desktop / Claude Code | [claude.md](docs/src/quickstart/clients/claude.md) |
| Step-by-step from scratch | [getting-started.md](docs/src/quickstart/getting-started.md) |
| macOS / Windows setup | [macOS.md](docs/src/quickstart/macOS.md) · [windows.md](docs/src/quickstart/windows.md) |

Point the client at `qnsc-mcp` (or `bun run src/mcp.ts`) as the command. Restart the
client to pick up changes.

## CLI

```bash
qnsc-mcp                        # start the MCP server (stdio)
qnsc-mcp doctor                 # diagnose config, env, keyring, TLS
qnsc-mcp list-tools [--filtered]  # all tools, or only enabled ones
qnsc-mcp list-prompts           # available prompts
qnsc-mcp list-resources         # available resources
qnsc-mcp generate-config        # scaffold a .qnscmcp.yaml
qnsc-mcp webserver              # web config UI
qnsc-mcp remote-mcp | local-mcp | bundled-mcp   # inspect MCP servers
qnsc-mcp view-logs | tail-log-file
qnsc-mcp --help
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, how to add a tool,
testing, and the release flow. Two things worth knowing before your first PR: `lint`
fails only on errors (~1,400 warnings are tolerated), and three
`localMcpReferenceValidation` tests fail in a full run for reasons that predate your
change.

## Support

[Issues](https://github.com/quynhonsemiconductor/mcp-tools/issues) ·
[Discussions](https://github.com/quynhonsemiconductor/mcp-tools/discussions) ·
[Troubleshooting](docs/src/troubleshooting.md)
