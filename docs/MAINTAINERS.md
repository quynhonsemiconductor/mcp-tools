# Maintainer's Guide: QNSC MCP Toolkit (`qnsc-mcp`)

> Maintainer-facing map of the repo as it stands in `quynhonsemiconductor/mcp-tools`.
> This is not published to the docs site (it is not in `docs/mkdocs.yml`); it lives here
> for people working on the code. The authoritative inventory of everything the toolkit
> ships is [`TOOLS.md`](../TOOLS.md) at the repo root — regenerate it rather than trusting
> counts quoted in prose.
> Confidence markers: `✓` = ran/traced it this session, `~` = inferred from reading.

## TL;DR (read this first)

- **What it is:** A TypeScript/Bun **MCP (Model Context Protocol) server** that extends AI
  assistants and IDEs with a suite of tools. It builds into a standalone binary (`qnsc-mcp`)
  plus Claude Desktop `.mcpb` bundles. ✓
- **What it actually offers today:** 142 native tools + 82 bundled tools = **224 total, 101
  enabled by default**. Native categories: GitHub (92), Utility (15), Knowledge Graph (9),
  k6 (6), NPM (5), Memory (5), CrUX (4), PostgreSQL (4), Swagger (2). Bundled MCPs:
  sharepoint (56) and chrome-devtools-mcp (26). Plus 3 opt-in local MCP servers, 2 remote
  MCP servers, 8 prompts, and 5 resources. See [`TOOLS.md`](../TOOLS.md). ✓
- **Who uses it:** engineers who connect it to VS Code / JetBrains / Claude Code / Claude
  Desktop. The quickstart docs assume no prior MCP experience, so support skews toward
  install/config help.
- **Current health:** 🟡 — the code builds and the core suites pass, but there are no
  published releases or tags yet, so no binaries are distributed and several capabilities
  are listed-but-not-usable in this org (see below).
- **If you're here to support a user or debug:** jump to
  [§6 Supporting & debugging](#6-supporting-users--debugging-runbook).
- **The one mental model to hold:** a _tool_ is a `@Tool`-decorated class that auto-registers
  into a global registry; a **generated loader** (`src/registry/tool-loader.ts`) is what makes
  tools visible. See §3.

### What is listed but not usable here

Some capabilities register (so they appear in `list-tools`) but cannot actually work in this
org, because they depend on infrastructure that is not deployed for `quynhonsemiconductor`:

- **Memory tools (`addMemory`, `updateMemory`)** require `QNSC_MCP_API_KEY`, which points at a
  platform API this org does not host — so those calls fail. ✓ (TOOLS.md; src/tools/memory)
- **`aws-knowledge-mcp-server`** connects to the public AWS endpoint and registers 5 tools with
  no credentials, but calling one currently returns an error from AWS — reachable but not
  usable at the moment. ✓
- The old remote fleet (17 servers) was **removed**; see §5. Do not describe Rally, New Relic,
  Splunk, Salesforce, Snowflake, Kong (as a remote server), Datadog, PagerDuty, Slack, Stripe,
  or the rest as available — they are gone.

## 1. What & why

`qnsc-mcp` exists so AI assistants can take real actions through one configurable,
self-contained binary instead of a dozen separate integrations. ✓ (README.md, CLAUDE.md)

Where it sits in the system:

- **Upstream:** an MCP client (VS Code, JetBrains, Claude Code/Desktop) launches `qnsc-mcp` and
  speaks MCP over stdio or HTTP stream.
- **Downstream:** the toolkit calls external services directly. The two remaining remote MCP
  servers are reached **without** any org gateway: `aws-knowledge-mcp-server` hits AWS's public
  endpoint `knowledge-mcp.global.api.aws`, and `figma-dev` talks to the Figma desktop app on
  `localhost:3845`. ✓ (src/remote-mcps/available-remote-servers.ts)
- **Note:** there is no server-side gateway, `infra/`, `terraform/`, or `k8s/` in this repo. The
  hosted platform gateway that the removed fleet used (`*.ai.qnsc.vn`) is not deployed for this
  org and its hostnames have no DNS records. ✓

## 2. Get it running (the confidence check)

The fastest way to prove the repo is alive.

- **Prereqs:** **Bun ≥ 1.3.11** (the CI pin; `engines.bun` enforces the floor). A `preinstall`
  hook (`scripts/check-bun-version.cjs`) hard-exits if your Bun is below the engine floor. ✓
  Package manager is Bun only (no `package-lock.json`).
- **Setup:** `bun install`.
- **Run the server:** `bun dev` (runs `build:prep`, then watches `src/mcp.ts` with
  `--transportType httpStream` — note it's httpStream, _not_ stdio). Web config UI: `bun dev:web`.
  MCP Inspector: `bun inspector`. ✓ (package.json)
  - The `httpStream` transport binds **`127.0.0.1` only** by default. Flags: `--port`
    (default 8081), `--endpoint` (default `/mcp`), and `--host` (default `127.0.0.1`).
    To reach the server from another machine or container you must opt in with
    `--host 0.0.0.0` — there is **no authentication** on this transport, so anything that can
    reach the socket gets a fully-authorized MCP session with whatever credentials the server
    was launched with. The MCP SDK's `localhostHostValidation()` middleware only checks the
    `Host` header (DNS-rebinding protection, trivially spoofed by non-browser clients) and is
    not access control.
- **List tools:** `bun run src/mcp.ts list-tools` (add `--filtered` to show only what a config
  enables). ✓
- **Typecheck:** `bun typecheck` runs `tsc --noEmit --skipLibCheck`. In this working tree it
  passes (0 errors). ✓ Note: the `bun x` wrapper can report a non-zero exit even when tsc finds
  nothing; run `./node_modules/.bin/tsc --noEmit --skipLibCheck` directly for an unambiguous
  result. ✓
- **Tests:** `bun test`. Don't run the whole suite casually — it's large and pulls in heavy
  global mocks. The validation suite (`src/services/validation/`) passes, including the six
  `localMcpReferenceValidation` tests in
  `src/services/validation/checks/qnscmcp/local-mcps.test.ts`. ✓
- **Build the binary:** `bun build:binary` (= `bun run scripts/build.ts`): version bump → prep
  assets → generate loaders → bundle MCPs → embed native keyring binding → `Bun.build({compile})`
  → package `.mcpb`. ✓ (scripts/build.ts)
- **Setup gotchas:** copy `.env.example` → `.env` before running; `src/env.ts` auto-loads
  `dotenv` at import. OAuth in `bun dev` needs _real_ env-var credentials — embedded build-time
  creds only exist in a compiled binary (§4.E).

## 3. Architecture & mental model

**The things you must understand:**

1. **`@Tool` decorator + global registry.** Each tool is a class; importing the file runs the
   decorator, which registers `{config, handlerClass}` into a module-level `Map`
   (`toolRegistry`). ✓ (src/registry/tool-registry.ts)
2. **The generated, category-keyed loader.** `src/registry/tool-loader.ts` is **auto-generated**
   (`bun generate:tools` → `scripts/generate-tool-loader.js`) and is what actually imports tools,
   grouped by category for lazy loading. **A tool not imported by this loader is invisible no
   matter how perfect its decorator.** Never hand-edit it. ✓
3. **Two-phase lifecycle: initialize (discover all) → registerAllTools (filter + register).**
   Discovery loads every tool so the config UI can show them; the include/exclude filtering
   happens later at registration. Tools default to **excluded** unless `includeByDefault: true`
   or explicitly enabled in config. ✓
4. **One registry, four tool sources.** Native tools (`src/tools/`), **bundled** MCPs, **local**
   MCPs, and **remote** MCPs all become `ToolConfig` entries in the same registry and look
   identical to the client. The "gateway" code (`src/gateway/`) integrates the latter three. ✓
   (src/registry/types.ts — `ToolProvider = 'native'|'bundled'|'remote'|'local'`)
5. **A middleware chain wraps every `execute`** — env-validation → guardrails → tracking — before
   the tool's own logic, which is itself wrapped by `@CatchErrors()` that converts throws into
   `UserError`. ✓ (tool-registry.ts)

**How a tool call flows (traced with `getCurrentTime`):** ✓
client `tools/call` → transport (`StdioServerTransport`, or `ExpressStatefulMcpServer` for
httpStream) → MCP SDK validates args against the tool's Zod `inputSchema` → registered bound
`handler.execute` → middleware chain → `Tool.execute()` (src/tools/time/index.ts) → result
passed through `contentTransformer` into MCP `{content:[{type:'text'}]}` shape. For a **remote**
tool, `execute` is a generated wrapper that makes a network call to the remote endpoint instead.

**Code map (`src/`):** ✓
| Dir | Owns |
|-----|------|
| `tools/` | All native tool implementations, one dir per category |
| `registry/` | The heart: decorator+manager, **generated** loaders, `types.ts`, middlewares |
| `gateway/` | Integration of bundled/local/remote MCPs; sandbox, bundler, security, env-tier |
| `services/` | Cross-cutting infra: `auth/` (OAuth/keyring/Entra), `telemetry/`, `logger/`, `mcp/` (express transport), `validation/` (doctor) |
| `commands/` | CLI handlers: server, web, doctor, reauth, list-\*, generate-config, update |
| `remote-mcps/`, `local-mcps/` | Admin-curated allowlists of approved servers + SETUP docs |
| `bin/` | The **binary** entrypoint (`src/bin/mcp.ts`) — distinct from `src/mcp.ts` (dev) |
| `config.ts`, `env.ts` | YAML config loading + env-var schema |

**Credentials that matter (per `TOOLS.md`):** `GITHUB_TOKEN` unlocks the 92 GitHub tools
(targets `api.github.com`); `GRAFANA_K6_TOKEN` the 6 k6 tools; `GOOGLE_CRUX_API_KEY` the 4 CrUX
tools; `SWAGGER_HUB_API_KEY` one Swagger tool; `GEOCODE_MAPS_API_KEY` the location tool; and
`AZURE_APPLICATION_*` / `M365_TENANT_ID` the bundled sharepoint MCP. `QNSC_MCP_API_KEY` is
declared for the Memory tools but points at a platform API this org does not host. Auth code
lives in `src/services/auth/` (OAuth 2.1 + PKCE, OS keyring token storage, Microsoft Entra ID);
env vars are validated in `src/env.ts`. ✓

## 4. Nuances & landmines ⚠️

The most valuable section. Each: what it is → why it bites → what to do.

- **0c. Bundling a server copies only the directory holding its entrypoint.** This is the
  trap the chrome-devtools-mcp 1.9.0 upgrade turned on. That release moved the CLI to
  `build/src/bin/chrome-devtools-mcp.js`, so the copy root moved with it and the sibling
  `build/src/third_party/issue-descriptions` — 251 markdown files the server reads at
  startup — was silently left behind, giving ENOENT before any request was answered.
  Data a server needs at runtime must be listed in `staticFiles`, as a plain path: a
  `source:destination` entry is resolved against a different root and lands outside the
  bundle. Three more things bit on the way, all now handled: bun skips a nested
  `overrides` block with only a warning, which dropped upstream's puppeteer-core pin and
  produced dozens of misleading "has no exported member" errors — use
  `build.installCommand: npm install`; `main` still points at the old entry, which is now
  a library that exits 0 having produced nothing, so the server looks like it starts and
  serves nothing; and the committed `bundled/<name>/metadata.json` is only refreshed when
  the version or ref changes, so once a broken run has written the new version, later good
  runs skip it and it keeps a stale empty tool list. Reset that file if the tool count
  looks wrong.

  **Two ways this misleads you while testing.** The runtime extracts from `mcps.tar`,
  which `generate:bundles` does not rewrite — only `build:bundle` does — so a test after
  `generate:bundles` alone can report the _previous_ version working perfectly. Always
  check `~/.qnscmcp/bundled/<name>/metadata.json` for the version actually loaded. And the
  security scan needs AWS credentials; when it fails it takes the tool-recording step with
  it, so use `NO_SECURITY_SCAN=true` locally as the release workflow does.

- **0. A green release does not mean a working binary.** Nothing in the pipeline started
  the artifact until v0.1.5, and v0.1.3 and v0.1.4 both shipped an executable that exited
  immediately: `Cannot find module '../../package.json'`. Reading package.json at module
  scope resolves under `bun run` and never inside a single-file executable, so typecheck
  and the unit suite both pass while the shipped thing is dead. **Never read package.json
  at runtime — use `PACKAGE_VERSION` from `src/utils/version.ts`**, which is injected as a
  literal by `scripts/build.ts`. `scripts/smoke-binary.ts` now starts the binary in CI and
  requires a `tools/list` reply before upload. Note also that a static JSON import does not
  help: bun rewrites it to `createRequire`, and a `new URL` next to `import.meta.url` is
  treated as an asset reference and resolved too.

- **0b. Nested parentheses in a commit body stop release-please.** A body line reading
  `readFileSync` followed by a call wrapped in another call failed to parse with
  `unexpected token '(' ... valid tokens [)]`, so the commit was dropped, `commits: 0` was
  reported and **no release PR appeared even though the merge was green**. The changelog is
  built from the squashed body, so this silently withholds releases. Keep bodies plain prose
  and avoid nesting one call inside another. If a release PR does not appear, read the
  release-please log for `commit could not be parsed` before assuming a permissions problem.

- **A. The global test mocks are load-bearing and fragile.** `src/test-utils/mocks.ts` runs
  `setupStandardMocks()` once at import and mutates global modules. **Do NOT `mock.module`
  anything it already mocks — you break tests** (see the file header). Override
  `CatchErrors`/`logger` only by _preserving original behavior_ (it ships GOOD/BAD examples).
  Prefer `spyOn` — Bun's `mock.module` is global, doesn't auto-restore, and is known-buggy
  (oven-sh/bun#6040, #12823). ✓
- **B. Generated artifacts — rebuild, never hand-edit.** All carry an AUTO-GENERATED header, and
  several are git-ignored: `src/registry/tool-loader.ts`, `prompts-loader.ts`, `resources-loader.ts`
  (run with **node**, not bun), `src/generated/setup-docs.ts` (gitignored), `manifest.json` (built
  from `manifest.json.tmpl`, gitignored — edit the `.tmpl`), `mcps.tar`. **`bun dev` runs
  `build:prep` first, which regenerates all loaders** — so any hand-edit to them is silently
  overwritten on the next dev run. ✓
- **C. Compiled binary ≠ `bun dev`.** Several things only exist in the compiled binary:
  - **Embedded credentials:** a release embeds the **GitHub OAuth client id and no secret**.
    GitHub signs in with the device grant (RFC 8628), which sends no `client_secret` and needs
    none to refresh the token it issued, so there is nothing secret to carry. Up to and including
    v0.1.11 the secret WAS embedded, XOR-obfuscated against a key compiled in beside it — an
    encoding, not a protection, in a public repository. `scripts/assert-no-embedded-secret.ts` runs
    in CI and at release against the built artifact and fails if a `clientSecret` appears for a
    device-flow provider; it was verified to fail against the published v0.1.11 binary. The
    obfuscation machinery remains for Entra and `RELEASES_TOKEN`. Because nothing is embedded for
    `bun dev` either, **OAuth in `bun dev` still needs a real `GITHUB_CLIENT_ID` in the env** — but
    no secret.
  - **Native keyring binding:** `@napi-rs/keyring` loads a native `.node` at import; the binary
    entrypoint (`src/bin/mcp.ts`) extracts it to a temp dir and sets `NAPI_RS_NATIVE_LIBRARY_PATH`
    _before_ any other import. `keyring-loader.ts` exists because Bun's `--compile` breaks dynamic
    requires. Be careful editing `isKeyringCorrupted()` — its indicator list deliberately
    _excludes_ "not found"/"NoSuchObject" to avoid false-positive password re-prompts. ✓
  - **Embedded-asset ENOENT:** compiled binaries can hit `ENOENT: 'mcps.tar'` because a static
    `import { readFile } from 'fs/promises'` captures the unpatched `fs` before `bun-assets.ts`
    monkey-patches it. This **cannot reproduce under `bun test`** (mocks no-op `fs`); there's a
    standalone `*.verify.ts` script for it. Classic "works in dev, fails in binary." ✓
- **D. Swallowed errors to know about.** The PostgreSQL connection probe
  (`src/tools/postgresql/postgresql-profile.ts:215-216`) returns `false` on _any_ error, so an
  auth/network failure looks like "can't connect." Keep this in mind when debugging connection
  issues. ✓
- **E. Unfinished surfaces (don't assume they work):** config-based filtering of **resources and
  prompts is a TODO**; `vectordb` is a stub; OIDC nonce is not validated; bundler plugins are
  disabled. ~ (grep the TODOs before relying on any of these)

## 5. CI/CD & distribution

There is no "production deployment" here in the usual sense — this repo builds a client binary,
and the server-side gateway the removed fleet relied on is not part of it and is not deployed
for this org.

- **CI (`.github/workflows/`):** ✓
  - `ci.yml` — on PR + push to `main`: three jobs, `bun run typecheck`, `bun x eslint .`, and
    `bun test`. Bun pinned to `1.3.11`.
  - `security.yml` — thin caller of the shared `quynhonsemiconductor/ci` reusable suite: Semgrep
    (SAST), Gitleaks (secrets), osv-scanner (dependency CVEs). Container scanning is disabled
    (`scan_container: false`) because this repo ships binaries, not an image. Also runs weekly.
  - `release.yml` — Release Please via the shared `quynhonsemiconductor/ci` reusable workflow:
    opens a `chore(release): vX.Y.Z` PR on each `main` push and tags when it merges.
  - `release-binaries.yml` — on a `v*.*.*` tag: builds all 5 targets (darwin arm64/x64, linux
    x64/arm64, windows x64) + `.mcpb` bundles and attaches them, with SHA-256 checksums, as
    GitHub Release assets. **Binaries are unsigned/ad-hoc-signed** — there is no macOS Developer
    ID cert for QNSC yet, so first-run needs a Gatekeeper right-click-Open.
  - `pr-title.yml` — conventional-commit lint on the PR title.
- **Release model:** Release Please (Conventional Commits). `fix`/`refactor`/`style` → patch,
  `feat` → minor, `BREAKING CHANGE` → major. **There are currently no releases and no tags on
  this repository**, so the binary workflow has not fired and no binaries are published. Install
  by building from source. `CHANGELOG.md` is managed by Release Please. ✓ (README.md)
- **Observability:** the binary can emit OpenTelemetry spans/logs via OTLP if telemetry is
  configured (`TELEMETRY=false` opts out), but there is no org New Relic account or operations
  dashboard wired up for this repo — do not send people to one. ~

## 6. Supporting users & debugging (runbook)

Support is mostly install/config help from GitHub Issues and Discussions. **Always run
`qnsc-mcp doctor` first** — it's the self-diagnosing entry point (validates config, env, keyring,
TLS, and reports unknown server ids). Common issues:

- **"doctor says: must have either 'servers' or 'mcpServers' key"** → Claude Desktop rewrites
  `claude_desktop_config.json` when switching between chat/code modes and clobbers the MCP block.
  Re-add the `qnsc-mcp` server entry. (Common on Windows.) ✓
- **Memory tools error / do nothing** → `addMemory`/`updateMemory` need `QNSC_MCP_API_KEY`, which
  points at a platform API this org does not host. Those calls cannot succeed here. ✓
- **`aws-knowledge-mcp-server` lists tools but a call errors** → the AWS public endpoint is
  reachable and registers 5 tools, but calling one currently returns an error from AWS. Listed,
  not usable at the moment. ✓
- **A removed remote server "stopped working"** → 17 remote servers were removed (§5). They are
  gone, not broken. Point users at native tools or a vendor's own MCP endpoint.
- **"OAuth / scope error when running `bun run dev`"** → expected: `bun dev` has no embedded OAuth
  creds (§4.C). Use real env-var credentials, or the compiled binary. ✓
- **"Stopped connecting" / "server disconnected"** → confirm the binary path in the IDE config
  and run `doctor`. `qnsc-mcp list-tools --filtered` shows what a config actually enables — a
  remote server that failed to connect contributes no tools. ~
- **Escalation:** [GitHub Issues](https://github.com/quynhonsemiconductor/mcp-tools/issues) and
  [Discussions](https://github.com/quynhonsemiconductor/mcp-tools/discussions). There is no Slack
  workspace for this org's toolkit.

## 7. Who & where

- **Owners / CODEOWNERS:** `* @quynhonsemiconductor/mcp-tools-maintainers` (whole repo). ✓
- **Repo:** [`quynhonsemiconductor/mcp-tools`](https://github.com/quynhonsemiconductor/mcp-tools).
- **Docs:** MkDocs site under `docs/src/` (this MAINTAINERS.md is intentionally outside it).
  The GitHub Pages site (`quynhonsemiconductor.github.io/mcp-tools`) is **not published** — no
  workflow deploys it — so link to in-repo markdown instead.
- **Inventory:** [`TOOLS.md`](../TOOLS.md). Remote servers: [`src/remote-mcps/README.md`](../src/remote-mcps/README.md).

## 8. History & decisions (append-only)

Newest first. Each session that learns something adds a line — capture the _why_, never delete
past entries.

- **Remote fleet removed:** 17 of 19 remote MCP servers (atlassian, datadog, pagerduty, slack,
  stripe, newrelic, postman, kong, cortex, bitrise, smartsheet, logrocket, lucid, pendo,
  amplitude, k6, and a `github` proxy) were deleted. They all proxied through a hosted platform
  gateway at `*.ai.qnsc.vn`, which is not deployed for this org and has no DNS records, so every
  one failed to connect. Only `aws-knowledge-mcp-server` (public AWS endpoint) and `figma-dev`
  (localhost) remain, both reached without a gateway. See `src/remote-mcps/README.md`.
- **Ownership moved to QNSC (`quynhonsemiconductor/mcp-tools`).** The earlier "production"
  pipeline described in old revisions of this guide — GHE Releases, the S3 `ngp-nonprod-downloads`
  bucket, `Delivery-Platform/gitflow`, a New Relic operations dashboard, a Slack support channel —
  does **not** exist here and has been removed from this document. Current CI/CD is in §5. There
  are no releases or tags yet, so no binaries are published.
- **2026-08-10 — httpStream bind address:** The `httpStream` transport was binding the wildcard
  interface with no authentication while logging "listening on localhost". Added a `--host` flag
  defaulting to `127.0.0.1`; remote access is now opt-in via `--host 0.0.0.0`. `--endpoint` was
  dead code (routes hardcoded `/mcp`); now honored.
