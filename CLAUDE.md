# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install dependencies
bun install

# Run MCP server with hot reloading
bun dev

# Run web interface for development
bun dev:web

# Run MCP inspector
bun inspector

# Build the project
bun build:binary

# Type check (runs `tsc --noEmit --skipLibCheck`)
bun typecheck

# Lint (uses eslint.config.js; there is no `lint` package script)
bun x eslint .

# Generate the tool loader file
bun generate:tools

# Create a new tool interactively
bun new:tool

# Create a new prompt interactively
bun new:prompt

# Generate the prompt loader file
bun generate:prompts

# Run tests
bun test

# Run tests with coverage
bun test --coverage

# Run specific test file
bun test path/to/file.test.ts
```

The full inventory of tools, prompts, resources, and remote/local MCP servers lives in
[`TOOLS.md`](./TOOLS.md), which is generated from source **and** from the running
server, so it is the authoritative list.

## Project Architecture

QNSC MCP Toolkit is a comprehensive platform for extending LLMs through the Model Context Protocol (MCP), specifically focusing on providing specialized tools for QNSC use cases.

## Info

- Uses Bun for package management and build/test
- GitHub Hosted: quynhonsemiconductor/mcp-tools
- Written in Typescript

### Key Components

1. **Tool System**
   - Tools are implemented as classes with the `@Tool` decorator
   - Each tool has a schema defined with Zod for parameter validation
   - Tools are auto-discovered and loaded through the registry system
   - Tools are grouped by category. The categories that actually exist are GitHub,
     Utility, Knowledge Graph, k6, NPM, Memory, CrUX, PostgreSQL, and Swagger — see
     `TOOLS.md` for the current breakdown.

2. **Registry & Loading**
   - Tools are automatically registered via the `@Tool` decorator
   - The `ToolRegistryManager` manages tool registration and filtering
   - `src/registry/tool-loader.ts` is auto-generated (by `bun generate:tools`) to import
     all tool implementations; never hand-edit it
   - The generator scans for files with `@Tool` decorators

3. **Configuration System**
   - YAML configuration file (`.qnscmcp.yaml` or `.qnscmcp.yml`)
   - Can include/exclude specific tools or categories
   - Configuration can be placed in current directory, home directory, or custom location

4. **Server & Transports**
   - Supports multiple transport types (stdio, httpStream)
   - Web interface for tool management and history
   - CLI commands for tool listing and configuration

5. **Testing**
   - Tests use Bun's built-in testing framework from `bun:test`
   - Each tool has an individual test file with `.test.ts` suffix
   - ALWAYS use and leverage the mock utilities from @src/test-utils/mocks.ts before creating custom mocks
   - Only create custom mocks when the provided utilities in src/test-utils/mocks.ts are insufficient
   - Test subclasses are often used to override external dependencies
   - Error testing uses try/catch blocks instead of expect().rejects
   - Repo state: `bun typecheck` passes cleanly (`tsc --noEmit --skipLibCheck` exits 0)
     and `bun x eslint .` reports zero errors, though roughly 1,400 tolerated warnings.
   - **Three tests fail in a full run and are not your change.** `bun test` gives
     3,527 pass / 3 fail; the three are `localMcpReferenceValidation` cases in
     `src/services/validation/checks/qnscmcp/local-mcps.test.ts`. Running that file on
     its own passes all 14, which is the trap: the failures are order-dependent.
     `src/gateway/local-mcp-manager.test.ts` calls Bun's `mock.module()` on
     `available-local-servers`, that replacement is process-global and survives
     `mock.restore()`, and it leaks into any file loaded afterwards. Compare a full run
     against `main` before assuming you broke something, and do not conclude the
     failures are absent from a single-file run.
   - `bun typecheck` through the `bun x` wrapper can report a non-zero exit even when
     tsc finds nothing; run `./node_modules/.bin/tsc --noEmit --skipLibCheck` directly
     for an unambiguous answer.

## Remote MCP Servers

For anything about a remote MCP server — setup, credentials, or endpoints — read
[`src/remote-mcps/README.md`](src/remote-mcps/README.md) first. It lists the two remote
servers that remain (`aws-knowledge-mcp-server` and `figma-dev`) and points at the
per-server `SETUP_<id>.md` guide, which is the authoritative source. The previous fleet
of gateway-proxied servers was removed because the `*.ai.qnsc.vn` gateway is not
deployed for this org. Don't reconstruct setup steps from `available-remote-servers.ts`.

## Creating New Tools

When creating a new tool:

1. Use the `bun new:tool` script which will:
   - Generate boilerplate code with the correct structure
   - Set up schema and type definitions
   - Create a test file
   - Register the tool in the loader

2. Each tool should follow this pattern:
   - Define a schema with Zod for parameters
   - Create a class that implements `ToolHandler`
   - Add the `@Tool` decorator with metadata
   - Implement the `execute` method

3. Always create tests for your tools:
   - Always leverage src/test-utils/mocks.ts utilities for mocking external dependencies
   - Create test subclasses when needed to override network requests
   - Test success and failure cases
   - Verify correct parameters are passed to external services
   - Test error handling with try/catch blocks

## Convention Guidelines

1. **Tool File Structure**
   - Tool classes should be in `/src/tools/{name}` directory
   - Test files should have the same name with `.test.ts` suffix
   - Simple tools can use `index.ts` in their category folder

2. **Naming Conventions**
   - Tool names use camelCase
   - Tool IDs use kebab-case
   - Classes typically use PascalCase with "Tool" suffix

3. **Testing Conventions**
   - Use the Bun testing framework (`import { describe, it, expect, mock } from 'bun:test'`)
   - Create a MockUserError class for error testing
   - Mock modules with `mock.module()` before importing dependencies
   - Use `beforeEach()` to reset mocks between tests
   - Handle errors with try/catch blocks rather than expect().rejects

4. **Git Workflow**
   - All commit messages must follow Conventional Commits format
   - Releases are automatically created when changes are merged to `main`
   - Commit types affect versioning:
     - `fix:`, `refactor:`, `style:` commits trigger PATCH releases
     - `feat:` commits trigger MINOR releases
     - `BREAKING CHANGE:` in the footer triggers MAJOR releases

5. **Refactoring**
   - When refactoring always `git mv` files, do not delete or move them. We must keep our git history!
