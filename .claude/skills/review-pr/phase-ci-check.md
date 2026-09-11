# Phase 2: CI Verification

**Goal:** Determine what actually blocks merge vs. what's a local-only issue.

---

## WHY THIS MATTERS

A common review mistake is saying "this blocks merge" when CI doesn't actually check for it. Example: TypeScript errors in a repo where CI only runs tests — saying "REQUEST CHANGES" for typecheck failures would be wrong.

---

## Step 1: Check Actual CI Status

If there's an open PR, get the real CI status directly:

```bash
gh pr checks 2>/dev/null
gh pr checks --json name,state,conclusion,description 2>/dev/null
```

Interpret: `pass`/`success` = passed, `fail`/`failure` = failed (blocks merge if required), `pending` = still running, `skipped` = N/A.

If `gh pr checks` works, skip to Step 3.

---

## Step 2: Analyze CI Configuration (Fallback)

If no PR exists or `gh pr checks` isn't available:

```bash
ls .github/workflows/*.yml 2>/dev/null
grep -h "run:" .github/workflows/*.yml 2>/dev/null | grep -E "(test|lint|typecheck|tsc|build|check)" | head -15
```

Record what CI enforces: Tests (YES/NO), Linting (YES/NO), Type checking (YES/NO), Build (YES/NO).

---

## Step 3: Record Results

CI is the source of truth. Do not re-run tests or typecheck locally — those are already running in the CI pipeline and re-running them adds minutes with no additional signal.

Output this table:

```
## CI Status

| Check | Status | Blocks Merge? |
|-------|--------|---------------|
| [check name] | PASS/FAIL/PENDING | YES/NO |

**Overall:** [PASS / FAIL / PENDING]
**Blocking failures:** [list any, or "none"]
```

If CI is PENDING, note it and proceed — the PR cannot merge until CI passes regardless of the review outcome.

---

## Step 4: Determine Verdict Implications

| Scenario | Verdict Impact |
|----------|----------------|
| CI-enforced check fails | Critical issue — REQUEST CHANGES |
| CI pending | Note it, continue review |
| All checks pass | No automated blockers |

Proceed to Phases 3-6: Code Review.
