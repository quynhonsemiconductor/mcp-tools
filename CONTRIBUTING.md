# Contributing to QNSC MCP Toolkit

This document provides guidelines and instructions for contributing to the project.

## 🚀 Getting Started

This repository is hosted on GitHub at `github.com`. To contribute:

**If you have write access:**
1. Clone the repository directly
2. Create a feature branch and submit a pull request

**If you don't have write access:**
1. Fork the repository to your personal GitHub account
2. Clone your fork locally
3. Add the upstream remote: `git remote add upstream https://github.com/quynhonsemiconductor/mcp-tools.git`
4. Create a feature branch, make changes, and push to your fork
5. Submit a pull request from your fork to the upstream `main` branch

## 💬 Questions and Support

Open a [GitHub issue](https://github.com/quynhonsemiconductor/mcp-tools/issues) for
bugs and feature requests, or a
[discussion](https://github.com/quynhonsemiconductor/mcp-tools/discussions) for
questions about using or developing the toolkit.

## Table of Contents

- [Development Setup](#-development-setup)
- [Code Style and Guidelines](#-code-style-and-guidelines)
- [Creating New Tools](#-creating-new-tools)
- [Creating New Resources](#-creating-new-resources)
- [Testing](#-testing)
- [Git Workflow](#-git-workflow)
- [Reporting Issues](#-reporting-issues)
- [Checks on your PR](#-checks-on-your-pr)
- [Pull Request Process](#-pull-request-process)
- [Release Process](#-release-process)

## 🛠️ Development Setup

1. **Prerequisites**

   Install [Bun](https://bun.sh):
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

   Required versions (from `package.json` engines):
   - Bun: >= 1.3.4
   - Node: >= 22.14.1
   - npm: >= 10.9.2

2. **Initial Setup**

   ```bash
   # Clone the repository
   git clone https://github.com/quynhonsemiconductor/mcp-tools.git
   cd mcp-tools

   # Install dependencies
   bun install
   ```

3. **Available Development Commands**

   ```bash
   # Run MCP server with hot reloading
   bun dev

   # Run web interface for development
   bun dev:web

   # Run MCP inspector
   bun inspector

   # Build the project
   bun build:binary

   # Type checking
   bun typecheck

   # Generate loader files
   bun generate:tools
   bun generate:prompts
   bun generate:resources

   # Create new components interactively
   bun new:tool
   bun new:prompt
   bun new:resource

   # Run tests (--bail stops on first failure for faster feedback)
   bun test --bail

   # Run tests with coverage
   bun test --coverage

   # Run specific test file
   bun test path/to/file.test.ts
   ```

4. **Testing via MCP Inspector**

   Run your local dev server in one terminal:

   ```bash
   bun dev
   ```

   Then run MCP Inspector in another terminal:

   ```bash
   bun inspector
   ```

   When configuring the inspector, select "Streamable HTTP" for the transport type and `http://localhost:8081/mcp` for the URL.

5. **Validating with Claude Code or VSCode**

   Run the MCP server in dev mode with hot reloading:

   ```bash
   bun dev
   ```

   **VSCode configuration** - add to your MCP settings:

   ```json
   "servers": {
        "qnsc-http": {
            "type": "http",
            "url": "http://localhost:8081/mcp"
        }
    }
   ```

   **Claude Code configuration:**

   ```bash
   claude mcp add --transport http qnsc-http http://localhost:8081/mcp --scope user
   ```

   Note: When running the MCP server via HTTP, set your environment variables in your shell before running `bun dev`. The `env` object in `mcp.json` does not apply to HTTP servers.

6. **Building Local Binary**

   Build a local binary for Mac ARM:

   ```bash
   NO_SECURITY_SCAN=1 OUTFILE=qnsc-mcp-macos-arm64 TARGET=bun-darwin-arm64 bun build:binary
   ```

   For a fast build without bundling (useful during development):

   ```bash
   bun build:binary:fast
   ```

## 🎨 Code Style and Guidelines

1. **General Guidelines**
   - Use TypeScript for type safety
   - Follow existing code patterns in the repository
   - Use Zod for schema validation
   - Document code with JSDoc comments
   - Keep functions small and focused on a single responsibility

2. **File Naming Conventions**
   - Tool files: `/src/tools/{category}/{name}-tool.ts` or `/src/tools/{category}/index.ts`
   - Test files: Same name with `.test.ts` suffix (e.g., `get-tool.test.ts`)
   - Tool IDs: kebab-case (e.g., `github-issues-get`)
   - Tool names: camelCase (e.g., `getGithubIssue`)
   - Class names: PascalCase with "Tool" suffix (e.g., `GithubIssuesGetTool`)

3. **Code Organization**
   - Tools are organized by category under `/src/tools/`
   - Use the `@Tool` decorator to register tools with the registry
   - Define schemas separately with Zod and infer types from them

## 🔧 Creating New Tools

1. **Use the Interactive Generator**

   The easiest way to create a new tool is using the provided script:

   ```bash
   bun new:tool
   ```

   This script will:
   - Prompt for your tool's ID, name, description, category, and version
   - Generate a new tool implementation file with proper structure
   - Set up the schema and type definitions
   - Create a placeholder test file
   - Automatically generate a SETUP.md documentation file
   - Register the tool in the loader

   The generated SETUP.md file provides a template for documenting:
   - Tool prerequisites and required accounts
   - Environment variables and secrets with step-by-step instructions
   - Configuration requirements
   - Troubleshooting common issues

   Complete the SETUP.md file with your tool's specific requirements to help users configure your tool correctly.

2. **Tool Implementation Structure**

   All tools should follow this pattern (adjust import path depth based on tool location):

   ```typescript
   import { z } from 'zod';
   import { CatchErrors } from '../../utils';
   import { Tool, type ToolHandler } from '../../registry';

   // 1. Define a schema with Zod
   export const MyToolSchema = z.object({
     param1: z.string().describe('Description of parameter 1'),
     param2: z.number().optional().describe('Description of parameter 2')
   });

   // 2. Create a type from the schema
   export type MyToolParams = z.infer<typeof MyToolSchema>;

   // 3. Create a class with the @Tool decorator
   @Tool({
     id: 'my-tool-id',
     name: 'myTool',
     description: 'Description of what my tool does',
     category: 'CategoryName',
     parameters: MyToolSchema,
     envVars: ['ENV_VAR_NAME'],       // Optional: required environment variables
     includeByDefault: true,           // Optional: include in default tool set
     version: '1.0.0',                 // Optional: tool version
     annotations: {                    // Optional: MCP annotations
       title: 'My Tool',
       readOnlyHint: true,
       openWorldHint: true
     }
   })
   export class MyTool implements ToolHandler {
     @CatchErrors()
     async execute(args: MyToolParams): Promise<string> {
       // 4. Implement the tool's functionality
       const validatedArgs = MyToolSchema.parse(args);

       // Your implementation here

       return JSON.stringify(result);
     }
   }
   ```

3. **Adding Environment Variable Support**

   If your tool requires environment variables:

   1. Update `.env.example` with `ENV_VAR_NAME=`

   2. Add your environment variable to the schema in `src/env.ts`:

      ```typescript
      ENV_VAR_NAME: z.string().optional().describe('My tool envvar'),
      ```

   3. Add `envVars: ['ENV_VAR_NAME']` to your tool's decorator

## 📚 Creating New Resources

To create a new resource, run:

```bash
bun run new:resource
```

This interactive script will:

1. Prompt for your resource's ID, name, description and category
2. Generate a new resource implementation file with proper structure
3. Create a placeholder test file with basic test cases
4. Register the resource in the loader

After creating your resource:

1. Customize the input arguments with your resource's supported arguments (or remove arguments if your resource doesn't have any)
2. Implement the load method with your resource's logic
3. Update the test cases with appropriate assertions
4. Run `bun test path/to/your/resource/index.test.ts` to verify functionality

## 🧪 Testing

1. **Test Structure**

   Each tool should have comprehensive tests covering:
   - Success cases with valid parameters
   - Error handling with invalid parameters
   - Edge cases specific to your tool's functionality

2. **Using Mock Utilities**

   The project provides standard mocks in `src/test-utils/mocks.ts`. These are automatically set up before tests run and include mocks for:
   - File system operations (`mockFS`)
   - Environment variables (`setMockedEnvVar`)
   - Logging (`mockLog`)
   - Configuration (`mockLoadConfig`)
   - External services (Snowflake, FastMCP, etc.)
   - Global `fetch`

   Always leverage these utilities before creating custom mocks. Only create custom mocks when the provided utilities are insufficient.

3. **Testing Best Practices**
   - Use the Bun testing framework (`import { describe, it, expect, mock, spyOn } from 'bun:test'`)
   - Prefer `spyOn` over `mock.module` as the latter is global and doesn't restore automatically
   - Use `beforeEach()` to reset mocks between tests
   - Handle errors with try/catch blocks rather than `expect().rejects`
   - Test both success and failure paths
   - Use `MockUserError` from test utils for error testing

4. **Example Test Pattern**

   ```typescript
   import { beforeEach, describe, expect, it } from 'bun:test';
   import { MockUserError, mockFetch } from '../../test-utils/mocks';
   import { MyTool, MyToolSchema } from './my-tool';

   // Mocks are set up globally by test-utils/mocks.ts before tests run.
   // Import mock references directly (e.g., mockFetch, mockFS, mockLog).

   describe('MyTool', () => {
     let tool: MyTool;

     beforeEach(() => {
       // Create a fresh instance for each test
       tool = new MyTool();
       // Reset mock state between tests
       mockFetch.mockClear();
     });

     it('should have the correct parameters schema', () => {
       expect(MyToolSchema).toBeDefined();
       const schemaShape = MyToolSchema.shape;
       expect(Object.keys(schemaShape)).toContain('param1');
     });

     it('should execute successfully with valid params', async () => {
       mockFetch.mockResolvedValueOnce({
         ok: true,
         json: () => Promise.resolve({ data: 'test' })
       });

       const result = await tool.execute({ param1: 'value' });
       expect(JSON.parse(result)).toEqual({ data: 'test' });
     });

     it('should handle errors gracefully', async () => {
       let error;
       try {
         await tool.execute({} as any);
       } catch (e: any) {
         error = e;
       }
       expect(error).toBeDefined();
       expect(error.message).toContain('Tool execution error');
     });
   });
   ```

   Note: Import paths use relative paths from `src/tools/{category}/`. Adjust the depth (`../../`) based on your tool's location. For domain-specific tools, check if dedicated test utilities exist (e.g., `setupGitHubMocks()` for GitHub tools).

## 🌿 Git Workflow

1. **Branching Model**

   This project uses a single-branch release model:
   - `main` - Development branch. PRs are merged here. [Release Please](https://github.com/googleapis/release-please) tracks it and keeps a release PR up to date.

   Create feature branches from `main`:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/my-new-feature
   ```

2. **Branch Naming**

   Use descriptive branch names prefixed with the type of change:
   - `feature/` for new features
   - `fix/` for bug fixes
   - `docs/` for documentation changes
   - `refactor/` for code refactors
   - `chore/` for maintenance tasks

3. **Conventional Commits**

   All commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

   ```
   <type>[optional scope]: <description>

   [optional body]

   [optional footer(s)]
   ```

   Common types:
   - `feat`: A new feature
   - `fix`: A bug fix
   - `docs`: Documentation changes
   - `style`: Code style changes (formatting, etc.)
   - `refactor`: Code changes that neither fix a bug nor add a feature
   - `test`: Adding or correcting tests
   - `chore`: Changes to build process or auxiliary tools

4. **Version Impact**

   The commit type affects the version number:

   | Commit Type | Description | Version Impact |
   |-------------|-------------|----------------|
   | `feat` | New feature | **MINOR** (1.0.0 -> 1.1.0) |
   | `fix` | Bug fix | **PATCH** (1.0.0 -> 1.0.1) |
   | `refactor` | Code refactoring | **PATCH** (1.0.0 -> 1.0.1) |
   | `style` | Code style changes | **PATCH** (1.0.0 -> 1.0.1) |
   | `docs` | Documentation only | No release |
   | `test` | Adding/updating tests | No release |
   | `chore` | Maintenance tasks | No release |

   To trigger a **MAJOR** release (1.0.0 -> 2.0.0), include `BREAKING CHANGE:` in the commit footer.

5. **Release Cycle** 🔄

   This project uses [Release Please](https://github.com/googleapis/release-please) via the shared `ci` reusable workflow (same as `rova`, `opshub`):

   **How it works:**

   1. **Development**: Create a feature branch from `main` and open a PR with a Conventional Commit message
   2. **Release PR**: Every push to `main` updates a standing `chore(release): vX.Y.Z` PR with the accumulated changelog
   3. **Cutting a release**: Merging that PR bumps `package.json`, updates `CHANGELOG.md`, tags the commit, and publishes a GitHub Release

   Browse all releases on the [Releases page](https://github.com/quynhonsemiconductor/mcp-tools/releases).

6. **Refactoring**

   When refactoring, always use `git mv` to move files instead of deleting and creating new files. This preserves git history.

## 🐛 Reporting Issues

When reporting a bug or issue:

1. Describe the problem clearly
2. Include steps to reproduce the issue
3. Note your environment (OS, Bun version, relevant config)

## ✅ Checks on your PR

Four workflows run against every pull request. There is no label automation and no
CODEOWNERS file, so nothing is applied to your PR automatically — read the checks.

| Workflow | Job(s) | What it enforces |
|---|---|---|
| `ci.yml` | `typecheck`, `lint`, `test` | `tsc --noEmit`, `eslint .`, `bun test --bail` |
| `pr-title.yml` | `pr-title` | PR title parses as a Conventional Commit |
| `agent-forge-guard.yml` | `test-guard` | A PR may not weaken its own tests |
| `security.yml` | `actions-security`, `security` | Pinned actions and dependency scanning |

Two are worth knowing before they surprise you:

- **`lint` fails only on errors.** `eslint .` runs without `--max-warnings`, and the
  codebase carries roughly 1,400 tolerated warnings (mostly `no-explicit-any` and
  `no-unsafe-*` at untyped SDK and JSON boundaries). Do not add errors; you are not
  expected to clear the existing warnings.

- **`test-guard` blocks a net loss of assertions.** If a PR removes more assertions
  from a test file than it adds, the check fails, because a change that weakens its
  own test cannot be reviewed as a change. When the removal is correct — deleting a
  stale `@ts-expect-error`, for instance — say so in the PR body on a line starting
  with `agent-forge: test-edit-approved`, and explain why.

## 📋 Pull Request Process

1. **Before Creating a PR**
   - Run type checking: `bun typecheck`
   - Run linting: `bun x eslint .` (must report zero **errors**; warnings are tolerated)
   - Run tests: `bun test --bail`
   - Ensure code follows the project's style guidelines
   - Document new tools or significant changes

   > **Three tests fail in a full run and are not your fault.** The three
   > `localMcpReferenceValidation` cases in
   > `src/services/validation/checks/qnscmcp/local-mcps.test.ts` pass on their own but
   > fail when the whole suite runs. `src/gateway/local-mcp-manager.test.ts` calls
   > Bun's `mock.module()` on `available-local-servers`, and that replacement is
   > process-global and cannot be undone by `mock.restore()`, so it leaks into any
   > file that runs afterwards. Confirm your change with
   > `bun test <your-file>` and compare a full run against `main` before assuming you
   > broke something.

2. **Creating a PR**
   - Create a PR against the `main` branch
   - Fill out the PR template with a clear description of changes
   - Link any related issues
   - Request reviews from appropriate team members

3. **Review Process**
   - PRs require at least one approval
   - Address any feedback from reviewers
   - All tests must pass before merging

4. **After Merge**
   - When changes are merged to `main`, a **beta** prerelease is automatically created
   - Beta releases allow testing before promoting to stable

## 📦 Release Process

Releases run on [Release Please](https://github.com/googleapis/release-please) via
`.github/workflows/release.yml`, which delegates to the shared `quynhonsemiconductor/ci`
reusable workflow. There is no manual promote step and no separate beta channel.

1. **Release PR**

   Every push to `main` updates a release PR that Release Please keeps open. It
   derives the next version and the changelog entries from the Conventional Commit
   messages since the last release, so `feat:` produces a minor bump and `fix:` a
   patch. While the project is pre-1.0 the config bumps a patch for `feat:` as well.

2. **Cutting a release**

   Merging that PR is the release. Release Please tags `vX.Y.Z`, writes
   `CHANGELOG.md`, updates the version in `package.json` and
   `.release-please-manifest.json`, and publishes a GitHub Release.

3. **Binaries**

   The `v*.*.*` tag triggers `.github/workflows/release-binaries.yml`, which builds
   and attaches, per target, the binary, a `.sha256` checksum and a `.mcpb` package:

   | Target | Artifact |
   |---|---|
   | `bun-darwin-arm64` | `qnsc-mcp-macos-arm64` |
   | `bun-darwin-x64` | `qnsc-mcp-macos-x64` |
   | `bun-linux-x64` | `qnsc-mcp-linux-x64` |

   Windows and Linux arm64 have no matrix entry yet. Nothing is code-signed or
   notarized, so macOS Gatekeeper will flag the binaries until a signing identity is
   in place — see [Release Process](docs/src/development/RELEASE-PROCESS.md). The
   Electron installers under `installer/` are not built by CI.
