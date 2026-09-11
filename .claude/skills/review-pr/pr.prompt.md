# PR Review (Parallel Multi-Agent)

A rigorous code review using parallel specialized agents. Agents are spawned selectively based on what changed and each gets rich embedded instructions — no external phase files to read.

**CRITICAL: For PRs with > 5 changed files, you MUST use the Agent tool to spawn parallel review agents. Do NOT review the code yourself. The entire point of this architecture is that each agent gets a fresh context window for deep analysis. Reviewing everything in a single pass defeats this and causes you to miss bugs.**

---

## Review Philosophy

**The diff tells you WHERE to look, not WHAT to review.**

1. Use the diff to identify changed files and functions
2. Read the **entire function/class** containing changes, not just changed lines
3. Check **callers and callees** — does the change break assumptions elsewhere?
4. Understand **why** code exists before suggesting changes

---

## Execution Flow

```
Phase 1: Context + File Classification
     │
Sync Check (synchronize events only)
     │
Phase 2: CI Check (skip for DOCS_ONLY / CONFIG_ONLY)
     │
     ├── Agent: Logic (opus) ─────┐
     ├── Agent: Security ─────────┤  spawned simultaneously
     ├── Agent: Quality ──────────┤  via Agent tool
     └── Agent: Tests ────────────┘
     │
Phase 7: Fix Validation (if concrete fixes)
     │
Phase 8+9: Verify & Report
```

---

## Confidence Scoring

All findings use a 0–100 confidence score. **Only report findings scored ≥ 80.**

| Score | Meaning |
|-------|---------|
| 90–100 | Certain bug, will fail at runtime. Would bet $100. |
| 80–89 | Very likely real. Checked callers, types, and context. |
| 70–79 | Suspicious but couldn't fully confirm. **Do not report.** |
| < 70 | Speculative. **Do not report.** |

---

## Fix Categorization

**CONCRETE** (before/after code) — ALL must be true:
- Fix is self-contained within the flagged code
- No function signatures, return types, or contracts change
- No other files need updating
- You're confident the fix is syntactically and logically correct

**APPROACH-ONLY** (direction + verification steps) — when ANY are true:
- Fix changes a function signature, return type, or interface
- Multiple callers or importers would need updating
- Fix crosses module boundaries
- You're not confident the fix is complete

---

## Finding Output Format

```
**[Issue title]** - [file:line](path)
- **Confidence:** [0-100]
- **Severity:** CRITICAL / HIGH / MEDIUM / LOW (security findings only)
- **Category:** [Logic / Security / Quality / Test Coverage]
- **Issue:** [Clear description]
- **Impact:** [What goes wrong: crash, wrong result, data loss, security hole, etc.]
- **Fix type:** CONCRETE / APPROACH-ONLY
- **Fix:** (concrete) before/after code block
- **Approach:** (approach-only) direction + verify checklist + why not concrete
```

---

## Phase 1: Context + File Classification

Gather context and classify changes. Do NOT read any external phase files — all instructions are in this document.

### 1.1 Get PR info
```bash
gh pr view --json number,title,body,baseRefName,headRefName,author,labels 2>/dev/null
```

### 1.2 Get linked issues
```bash
gh pr view --json body 2>/dev/null | jq -r '.body' | grep -oE '#[0-9]+' | while read issue; do
  gh issue view ${issue#\#} --json title,body 2>/dev/null | jq -r '"Issue \(.title): \(.body | .[0:200])..."'
done
```

### 1.3 Read project conventions
```bash
cat CLAUDE.md 2>/dev/null | head -150
```

### 1.4 List and classify changed files

Use the `.diff/` directory (created by the workflow) to identify all changed files:
```bash
ls .diff/ -R 2>/dev/null
```

Classify each file:
- **source** — `.ts`, `.js`, `.tsx`, `.jsx`, `.py`, `.go`, `.rs`, `.java` (production code)
- **test** — `*.test.ts`, `*.spec.ts`, `__tests__/*`
- **config** — `.yml`, `.yaml`, `.json`, `.toml`, `.env`, `Dockerfile`, `Makefile`
- **docs** — `.md`, `.txt`, `.mdx`, `.rst`

Derive the **change type**: `DOCS_ONLY`, `CONFIG_ONLY`, `TESTS_ONLY`, `CODE_WITH_TESTS`, `CODE_ONLY`.

### 1.5 Output context summary

```
## Context Summary

**PR:** #[number] - [title]
**Author:** [username]
**Change type:** [DOCS_ONLY / CONFIG_ONLY / TESTS_ONLY / CODE_WITH_TESTS / CODE_ONLY]
**What changed:** [1-2 sentences]
**Why:** [from PR description or commits]
**Risk areas:** [auth, payments, data, etc.]
**Files changed:** [count] ([list paths])
**Key functions modified:** [list]
**Project conventions:** [from CLAUDE.md]
```

---

## Sync Check (synchronize events only)

If this is a `synchronize` event, determine the minimal review needed:

```bash
gh pr view <PR_NUMBER> --json reviews --jq '[.reviews[] | select(.author.login == "claudius" or .author.login == "svc-claudius")] | last | {oid: .commit.oid, state: .state} // empty'
```

```bash
git diff <last-review-oid>..HEAD --name-only --no-merges
```

**A. No new commits** (diff empty) → Post "Base-branch sync only — prior verdict stands." and **stop**. No verdict file.

**B. New commits, no source code changed** (only `.md`, `.yml`, `.json`, `.txt`) → **Fast re-review**: read only the changed files, review briefly, carry forward prior verdict and findings. Do NOT re-read source files, re-check CI, or re-verify prior findings.

**C. Source code changed** → Full review (Phase 2 onward).

---

## Phase 2: CI Check

**Skip entirely if change type is `DOCS_ONLY` or `CONFIG_ONLY`.**

Check CI status — do NOT re-run tests or typecheck locally:

```bash
gh pr checks <PR_NUMBER> 2>/dev/null
```

Record results. CI is the source of truth. If CI is PENDING, note it and proceed — the PR can't merge until CI passes regardless.

| Scenario | Verdict Impact |
|----------|----------------|
| CI-enforced check fails | Critical — REQUEST CHANGES |
| CI pending | Note it, continue |
| All checks pass | No automated blockers |

---

## Phases 3–6: Review

### Small PRs (≤ 5 files) → Single-pass direct review

Read all diffs directly and complete the entire review in one pass:

1. **Find issues** — apply all relevant lenses based on change type. For each changed function, read the entire function.
2. **Immediately try to disprove each issue** — is this handled elsewhere? Am I misreading the types? Is this intentional? Score each finding 0–100. Only keep ≥ 80.
3. **Write the verdict and report** — using the Report Template below. Write the verdict file.

Skip Phases 7, 8, and 9 — they are folded into this single pass.

---

### Large PRs (> 5 files) → MUST spawn parallel agents

**You MUST use the Agent tool to spawn these agents. Do NOT attempt to review the code yourself for PRs with > 5 files. Spawn all relevant agents in a single message so they run simultaneously.**

Based on file classification:

| Change type | Agents to spawn |
|-------------|----------------|
| `DOCS_ONLY` | None — review directly, write verdict |
| `CONFIG_ONLY` | None — review directly, write verdict |
| `TESTS_ONLY` | Tests agent only |
| `CODE_ONLY` | Logic + Security + Quality |
| `CODE_WITH_TESTS` | Logic + Security + Quality + Tests |

For each agent, embed the full context summary from Phase 1 in their prompt.

---

### Agent: Logic & Correctness

- **subagent_type:** `general-purpose`
- **model:** `opus`
- **Prompt:**

```
You are reviewing a pull request for logic errors, correctness issues, and edge cases. You are the most critical agent — your job is to find bugs that will cause runtime failures.

[PASTE FULL CONTEXT SUMMARY FROM PHASE 1 HERE]

## Your Process

For each changed file listed in the context:

1. **Read the ENTIRE function/class** containing changes, not just the diff lines
2. **Understand intent** — what is this supposed to do? Check docstrings, names, PR description
3. **Trace data flow** — input → validation → transformation → output. Where does each input come from? Is it validated? What if validation fails?
4. **Check edge cases** — null/undefined, empty values, boundary values, NaN, unicode, sparse arrays, circular refs
5. **Scan for common bugs:**
   - Off-by-one errors in loops and array indexing
   - Null/undefined property access without null checks
   - Missing `await` on async calls
   - Unhandled promise rejections
   - Race conditions on shared/async state
   - Type coercion issues (truthy/falsy, loose equality)
   - Incorrect comparisons (object reference equality, floating point)
6. **Verify intent matches implementation** — do comments match code? Does code do what PR claims?
7. **Check callers** — if a function signature or return type changed, grep for callers and verify they still work

## Confidence Scoring

Rate each finding 0–100. Only report findings ≥ 80.
- 90–100: Certain bug, will fail at runtime
- 80–89: Very likely real, checked callers and types

Before reporting ANY issue, ask: Is this handled elsewhere? Did I misread the types? Is this intentional?

## Output Format

**[Issue title]** - [file:line](path)
- **Confidence:** [0-100]
- **Category:** Logic
- **Issue:** [description]
- **Impact:** [what goes wrong]
- **Fix type:** CONCRETE / APPROACH-ONLY
- **Fix:** [code] OR **Approach:** [direction + verify steps]

Return "No logic issues found." if none.
```

---

### Agent: Security

- **subagent_type:** `general-purpose`
- **Prompt:**

```
You are reviewing a pull request for security vulnerabilities in an MCP tools codebase. MCP tools receive input from LLMs and users, execute with server privileges, access stored credentials, and make HTTP requests to external APIs.

[PASTE FULL CONTEXT SUMMARY FROM PHASE 1 HERE]

## Your Process — Trace Data Flow, Don't Pattern-Match

For each changed file:

1. **Find dangerous sinks** — execSync(), fetch(), fs.readFile(), SQL queries, innerHTML, logInfo()
2. **Trace backwards** — where does each argument come from? Is it user-controlled?
3. **Check for validation** — is there Zod parsing, allowlist check, or sanitization between input and sink?
4. **Context matters** — execSync('bun build') in a build script = low risk. execSync(`git clone ${args.url}`) in a tool handler = high risk.

## Vulnerability Checklist

Only report where untrusted data actually reaches a dangerous operation without validation:

1. **Command injection** — user input in exec/execSync/spawn shell strings
2. **Sensitive data in logs** — API keys, tokens, credentials, PII in logDebug/logInfo/logError
3. **SSRF** — user-controllable URLs in fetch() without host allowlist
4. **Hardcoded secrets** — API keys/passwords in source. Env vars must go through src/env.ts
5. **Input validation** — missing Zod constraints (.min/.max/.url). Path traversal via unsanitized paths
6. **Unsafe regex (ReDoS)** — user input in new RegExp()
7. **OAuth/Auth** — unvalidated tokens, missing signature verification, open redirects
8. **SQL injection** — string concatenation instead of parameterized queries

## When NOT to Report

- Build scripts (no runtime user input), test files (mock data)
- Hardcoded URLs to known services, logging non-sensitive data
- Theoretical vulnerabilities requiring unlikely conditions

## Confidence Scoring

Rate each finding 0–100. Only report findings ≥ 80. Include **Severity** and describe the attack scenario.

## Output Format

**[Issue title]** - [file:line](path)
- **Confidence:** [0-100]
- **Severity:** CRITICAL / HIGH / MEDIUM / LOW
- **Category:** Security
- **Issue:** [description with attack scenario]
- **Impact:** [what an attacker can do]
- **Fix type:** CONCRETE / APPROACH-ONLY
- **Fix:** [code] OR **Approach:** [direction + verify steps]

Return "No security issues found." if none.
```

---

### Agent: Code Quality & Error Handling

- **subagent_type:** `general-purpose`
- **Prompt:**

```
You are reviewing a pull request for code quality, error handling, silent failures, and type design issues. You have zero tolerance for silent failures and inadequate error handling.

[PASTE FULL CONTEXT SUMMARY FROM PHASE 1 HERE]

## Your Process

For each changed file, systematically analyze these areas:

### Silent Failure & Error Handling Analysis (HIGHEST PRIORITY)

Locate ALL error handling code: try-catch blocks, error callbacks, conditional error branches, fallback logic, optional chaining that might hide errors.

For EVERY catch block or error handler, ask:
- **Is the error logged with sufficient context?** (what operation failed, relevant IDs, state — not just the error message)
- **Does the user/caller receive actionable feedback?** Or does execution silently continue with undefined/default state?
- **Is the catch block specific?** List every type of unexpected error this catch could accidentally suppress
- **Is there fallback logic that masks the real problem?** Falling back to alternative behavior without awareness = hiding bugs
- **Should this error propagate instead of being caught here?** Is it being swallowed when it should bubble up?
- **Are there empty catch blocks?** (absolutely unacceptable — flag immediately)

Patterns that hide errors (flag all of these):
- Empty catch blocks
- Catch blocks that only log and continue with corrupted state
- Returning null/undefined/default values on error without logging
- Using `?.` optional chaining to silently skip operations that might fail for important reasons
- Fallback chains that try multiple approaches without explaining why earlier ones failed
- Retry logic that exhausts attempts without informing the caller

### Type Design Analysis (when new types/interfaces are in the diff)

For each new type, interface, or class:
- **Encapsulation** — are internal implementation details properly hidden? Can invariants be violated from outside?
- **Invariant expression** — does the type make illegal states unrepresentable? Are constraints enforced at construction time?
- **Invariant enforcement** — are all mutation points guarded? Is it impossible to create invalid instances?
- **Anti-patterns** — anemic domain models, types that expose mutable internals, invariants enforced only via documentation, types with too many responsibilities

### Resource Management
- Database connections released in finally blocks?
- File handles closed on error paths?
- Event listeners removed on cleanup/unmount?
- Timers cleared on teardown?

### Pattern Consistency
- Does new code follow existing naming conventions, file structure, error handling patterns?
- Check CLAUDE.md conventions from the context summary

### Performance
- N+1 queries, expensive work in loops, unbounded growth

## What NOT to Report

- Style issues (leave to linters)
- Subjective preferences without concrete consequence
- Issues in unchanged code
- "Best practice says so" without a nameable consequence

## Confidence Scoring

Rate each finding 0–100. Only report findings ≥ 80.

## Output Format

**[Issue title]** - [file:line](path)
- **Confidence:** [0-100]
- **Category:** Quality
- **Issue:** [description]
- **Impact:** [what goes wrong or why it matters]
- **Fix type:** CONCRETE / APPROACH-ONLY
- **Fix:** [code] OR **Approach:** [direction + verify steps]

Return "No quality issues found." if none.
```

---

### Agent: Test Coverage

- **subagent_type:** `general-purpose`
- **Prompt:**

```
You are reviewing a pull request for test coverage gaps and test quality.

[PASTE FULL CONTEXT SUMMARY FROM PHASE 1 HERE]

## Your Process

1. **Identify what needs testing** from the changed files:
   - New functions/methods → should have tests
   - Changed behavior → existing tests should be updated
   - Bug fixes → should have a regression test
   - New error paths → should be tested

2. **Find test files** for changed code (e.g., src/utils/parser.ts → src/utils/parser.test.ts)

3. **Evaluate test quality:**
   - Testing behavior/contracts vs implementation details?
   - Would tests catch regressions from future changes?
   - Over-mocking? If everything is mocked, the test verifies nothing real
   - Test isolation? Tests depending on shared mutable state or execution order?

4. **Assess coverage gaps — critical paths:**
   - Happy path (normal successful operation)
   - Validation failures (invalid input)
   - Error conditions (external failures, exceptions)
   - Edge cases (boundary values, empty inputs)
   - Security boundaries (auth checks, permission errors)

## When NOT to Flag

- Trivial code (simple getters, pass-through functions)
- Generated code or type definitions
- Code tested indirectly via integration tests

## Confidence Scoring

Rate each finding 0–100. Only report findings ≥ 80.

## Output Format

**[Issue title]** - [file:line](path)
- **Confidence:** [0-100]
- **Category:** Test Coverage
- **Issue:** [description]
- **Impact:** [what could break undetected]
- **Fix type:** CONCRETE / APPROACH-ONLY
- **Fix:** [code] OR **Approach:** [direction + verify steps]

Include a coverage summary table:
| Area | Coverage |
|------|----------|
| New functions | X of Y have tests |
| Changed behavior | Updated tests: YES/NO |
| Error paths | X of Y tested |

Return "No test coverage issues found." if none.
```

---

**Do NOT use `run_in_background: true`.** Spawn all agents in a single message — they run in parallel automatically. The orchestrator blocks until all complete and receives all results in one turn. Background mode causes timeout failures when collecting results.

---

## Phase 7: Fix Validation

**Skip if:** no concrete fixes were proposed, OR change type is DOCS_ONLY/CONFIG_ONLY, OR this is the small PR single-pass path.

### 7.1 Cross-file impact check

For every function whose signature or behavior changed:
```bash
git grep "functionName" -- "*.ts" "*.js" "*.tsx" "*.jsx"
git grep "import.*functionName" -- "*.ts" "*.js"
```
For each caller: does it pass the right arguments? Handle the new return type? If callers would break, add as a new finding.

### 7.2 Validate concrete fixes

```bash
git checkout -b fix-validation-temp
# Apply each concrete fix
bun test <directory-of-changed-files> --bail
```

Do NOT run `bun typecheck` or the full test suite.

| Fix | Tests | Action |
|-----|-------|--------|
| Passes | Keep as concrete |
| Fails | Downgrade to approach-only |

### 7.3 Cleanup (ALWAYS)
```bash
git checkout -
git branch -D fix-validation-temp
```

---

## Phase 8+9: Verify & Report

Collect all findings. For each one:

1. **Try to disprove it** — is this handled elsewhere? Type constraint preventing the bad state? Intentional pattern? Did I misread the code?
2. **Kill it if disproved** — remove or downgrade to Question
3. **Re-score** — drop anything below 80 after verification
4. **Name the consequence** — crash, wrong result, data loss, security hole, breakage. Can't name one? Cut it.

---

## Report Template

```markdown
## Code Review: [PR title]

### Verdict: APPROVE / REQUEST CHANGES

**Summary:** [2-3 sentences]

---

### Automated Checks

| Check | Status | Blocks Merge? |
|-------|--------|---------------|
| [name] | PASS/FAIL/PENDING | YES/NO |

---

### Critical (must fix before merge)

> CI-enforced failures OR runtime bugs (confidence ≥ 90)

---

### Should Fix

> Real issues (confidence ≥ 80)

---

### Questions for Author

---

### What Looks Good

> Positive observations — good patterns, solid coverage, clean architecture
```

Omit empty sections. Zero findings with APPROVE = good code.

**Verdict decision tree:**
- CI-enforced check fails → REQUEST CHANGES
- Runtime bug ≥ 90 → REQUEST CHANGES
- Security vulnerability ≥ 90 → REQUEST CHANGES
- Otherwise → APPROVE (even with Should Fix items)

---

## Inline PR Comments

For Critical or Should Fix findings, post inline comments:

```bash
gh api repos/{owner}/{repo}/pulls/{pr_number}/comments \
  --method POST \
  -f body="[finding + fix]" \
  -f commit_id="$(git rev-parse HEAD)" \
  -f path="[file]" \
  -F line=[line] \
  -f side="RIGHT"
```

---

## Quick Reference

| Rule | Meaning |
|------|---------|
| **Confidence ≥ 80** | Hard threshold |
| **MUST spawn agents for > 5 files** | Use the Agent tool — do NOT review code yourself |
| **Selective agents** | Only spawn agents relevant to the change type |
| **No fix = no report** | Every issue needs a fix |
| **Validate before reporting** | Concrete fixes must pass scoped tests |
| **Name the consequence** | Can't name one? Cut the finding |
| **No padding** | Zero findings = good code |

---

## FINAL STEP: Write Verdict File

```json
{"event":"APPROVE"}
// or
{"event":"REQUEST_CHANGES"}
```

You MUST write this file using the Write tool to the verdict path given in your custom instructions. Do NOT skip this step.

**After writing the verdict file, STOP. Do not attempt any further actions, cleanup, or follow-up work.**
