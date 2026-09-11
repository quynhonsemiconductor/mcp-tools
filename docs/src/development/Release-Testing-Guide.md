# Release Testing Guide

This guide describes how to test QNSC MCP releases before promoting them to production. Browse all releases (including betas under test) on the [Releases page](https://github.com/quynhonsemiconductor/mcp-tools/releases), or go directly to the [latest stable release](https://github.com/quynhonsemiconductor/mcp-tools/releases/latest/).

## Quick Start

```bash
# Test latest stable release
bun run smoke-test

# Test latest beta release
bun run smoke-test --beta

# Test binary from a PR
bun run smoke-test --pr 556
```

This runs CLI smoke tests that validate:

1. Binary starts and responds correctly to CLI commands
2. All expected outputs match (version, help, tool listings, etc.)
3. JSON output is valid and contains expected data

### Test a Local Binary

```bash
# Windows
bun run smoke-test --binary ./qnsc-mcp.exe

# macOS/Linux
bun run smoke-test --binary ./qnsc-mcp
```

## Common Scenarios

### 1. Beta Testing Before Promotion

> "We are ready to start beta testing for the latest beta. Can you begin testing?"

```bash
bun run smoke-test --beta
```

This will:

- Fetch the latest beta/prerelease from GitHub
- Download the binary for your platform
- Run CLI smoke tests
- Report pass/fail status

### 2. PR Testing

> "I have the following PR, could you confirm my changes look good?"

```bash
# Download and test binary from PR workflow artifacts
bun run smoke-test --pr 556
```

This will:

- Fetch the PR to find the head commit SHA
- Find successful workflow runs for that commit
- Download the platform-specific binary artifact
- Extract and run CLI smoke tests
- Cache the binary with PR-specific name (e.g., `qnsc-mcp-win-x64-pr556.exe`)

Alternatively, for local builds:

```bash
# Build binary from current branch, then test
bun run build:binary
bun run smoke-test --local --verbose
```

### 3. Post-Release Verification

> "We have promoted the latest release. Can we confirm it's working?"

```bash
# Test the latest stable release
bun run smoke-test

# Or test a specific version
bun run smoke-test --version v3.2.0 --verbose
```

## CLI Options Reference

| Option | Description |
|--------|-------------|
| `--beta` | Test latest beta/prerelease |
| `--pr <number>` | Download and test binary from PR workflow artifacts |
| `--version <tag>` | Test specific version (e.g., `v3.2.0`) |
| `--binary <path>` | Test a specific binary file |
| `--local` | Only use local binary, skip download |
| `--force` | Force re-download even if cached |
| `--verbose` | Show detailed output |
| `--bail` | Stop on first failure |
| `--filter <pattern>` | Run only tests matching pattern |

## What Gets Tested

| Test | Validates |
|------|-----------|
| `--version` | Binary runs and outputs version |
| `--help` | Help text displays |
| `info` | Info command with tool counts |
| `list-tools` | Tool listing works |
| `list-tools --json` | JSON output is valid |
| `list-prompts` | Prompt listing works |
| `list-resources` | Resource listing works |
| `list-bundled-mcps` | Bundled MCPs listed |
| `list-remote-mcps` | Remote MCPs listed |
| `list-local-mcps` | Local MCPs listed |
| `doctor` | Health check runs |
| `doctor --json` | JSON health output valid |
| `generate-config --help` | Config generation available |
| `update --check-only` | Update checker works |
| `view-logs` | Log viewer runs |

## Output Files

After running smoke tests, you'll find these files in `.smoke-test-binaries/`:

| File | Description |
|------|-------------|
| `qnsc-mcp-*` | Downloaded binary for your platform |
| `test-config.yaml` | Auto-generated test configuration |

In GitHub Actions, a job summary with test results is automatically written to the workflow run.
