# Phase 4: Security Review

**Goal:** Find vulnerabilities that could be exploited by attackers.

---

## Threat Model: MCP Tools

**What this system does:**
- MCP tools receive input parameters from LLMs and end users
- Tools execute with server privileges and access stored credentials
- Tools make HTTP requests to external APIs (GitHub, k6, Google CrUX, etc.)
- Tools may execute shell commands or read/write files

**Who could attack and how:**
- A malicious user crafts tool input to exploit injection vulnerabilities
- A compromised dependency executes malicious code
- Secrets leaked in logs expose API access to attackers

**Your job:** Find where untrusted input flows to dangerous operations without validation.

---

## When to Focus Here

Prioritize security review when the PR touches: authentication/authorization, user input handling, database queries, file operations, external API calls, cryptography, session management, or payment processing.

> **First:** Scan the changed files from Phase 1. If none touch these areas, this phase may be brief.
> Don't invent security issues where the code doesn't warrant them.

---

## How to Analyze: Trace Data Flow

Don't just pattern-match. Trace the flow:

1. **Find the sink**: `execSync()`, `fetch()`, `fs.readFile()`, `logInfo()`
2. **Trace backwards**: Where does each argument come from?
3. **Check for validation**: Is there Zod parsing, allowlist check, or sanitization between input and sink?
4. **Context matters**: `execSync('bun build')` in a build script (no user input) is low risk. `execSync(`git clone ${args.url}`)` in a tool handler (user controls input) is high risk.

---

## Vulnerability Checklist

Scan changed code for these categories. Only report issues where untrusted data actually reaches a dangerous operation without adequate validation.

1. **Command injection** — User input interpolated into `exec()`, `execSync()`, `spawn()` shell strings. Safe alternative: array form (`execFileSync('git', ['clone', url])`)
2. **Sensitive data in logs** — API keys, tokens, credentials, PII logged via `logDebug`, `logInfo`, `logError`. Check request/response body logging
3. **SSRF** — User-controllable URLs passed to `fetch()` without host allowlist validation
4. **Hardcoded secrets** — API keys, passwords, tokens in source. Env-specific URLs not using `env.ts`. New env vars must go through `src/env.ts` with Zod validation, not raw `process.env`
5. **Input validation** — Missing or insufficient Zod schema constraints (`.min()`, `.max()`, `.url()`). Path traversal via unsanitized file paths
6. **Unsafe regex (ReDoS)** — User input in `new RegExp()`, or patterns with catastrophic backtracking
7. **OAuth/Auth issues** — Unvalidated tokens, missing signature verification, open redirect via unvalidated redirect URIs, missing CSRF state parameter
8. **SQL injection** — String concatenation in queries instead of parameterized queries
9. **XSS** — User content in `innerHTML` without sanitization
10. **Weak cryptography** — MD5/SHA1 for passwords, `Math.random()` for security tokens
11. **Unsafe deserialization** — Deserializing untrusted data with libraries that execute code

---

## When NOT to Report

- **Build scripts** (`scripts/*.ts`): No runtime user input
- **Test files** (`*.test.ts`): Mock data, not production
- **Hardcoded URLs to known services**: `https://api.k6.io` is fine
- **Logging non-sensitive data**: `logInfo(`Processing ${itemId}`)` where `itemId` is just an ID
- Theoretical vulnerabilities requiring unlikely conditions
- Security features intentionally disabled in dev

---

## Output

Use the Finding Output Format from pr.prompt.md. Security findings must include **Severity** and describe the **Attack Scenario** in the Issue description. Also note areas checked but not relevant to this PR.
