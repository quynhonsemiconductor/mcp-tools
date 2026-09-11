# Phase 7: Impact Check & Fix Validation

**Goal:** Catch cross-file breakage the review phases missed, then validate every suggested fix.

---

## Why This Phase Exists

Two things earlier review phases can't do well:
1. **Cross-file impact** — each phase looks at individual files, not whether changes break callers in other files
2. **Fix correctness** — suggested fixes are never compiled or tested

---

## Step 1: Cross-File Impact Check (ALWAYS RUN)

Before looking at fixes, check if the PR's own changes break anything.

### 1.1 Identify Changed Functions

From the diff, list every function, method, or exported symbol whose **signature or behavior changed** (not just reformatted or commented).

### 1.2 Search for Callers

For each changed function:
```bash
git grep "functionName" -- "*.ts" "*.js" "*.tsx" "*.jsx"
git grep "import.*functionName" -- "*.ts" "*.js"
```

### 1.3 Check for Breakage

For each caller: Does it pass the right arguments? Handle the new return type? Depend on behavior that changed?

### 1.4 Add New Findings

If callers would break, add as a new finding. If no cross-file breakage found, move on.

---

> **GATE: If no concrete fixes were proposed in Phases 3-6, skip Steps 2-5 and proceed to Phase 8.**

---

## Step 2: Review Fix Categorization

Verify concrete fix classifications. All must be true for CONCRETE:
- Fix is self-contained within the flagged code
- No function signatures, return types, or contracts change
- No other files need updating
- Fix is syntactically and logically plausible

**Override rule:** If a review phase marked something concrete but it changes a contract, downgrade to approach-only.

---

## Step 3: Impact Search

For each concrete fix candidate, perform actual searches:

```bash
git grep "functionName" -- "*.ts" "*.js" "*.tsx" "*.jsx"
git grep "import.*functionName" -- "*.ts" "*.js"
```

| Impact Search Result | Action |
|---------------------|--------|
| No callers outside the changed file | Keep as concrete |
| Callers exist, fix doesn't change contract | Keep as concrete |
| Callers exist AND fix changes contract | **Downgrade to approach-only** |
| Fix requires changes in other files | **Downgrade to approach-only** |

---

## Step 4: Automated Validation

> If the project has no automated checks, skip this step and rely on the impact search.

### 4.1 Establish Baseline
Note current state of checks from Phase 2. Only **new** failures caused by fixes count.

### 4.2 Create Temp Branch, Apply Fixes, Run Checks

```bash
git checkout -b fix-validation-temp
# Apply each concrete fix
```

Run tests **scoped to the changed files only** — do NOT run the full test suite:
```bash
# Derive test paths from the changed files (e.g. src/tools/k6/*.ts → src/tools/k6/)
bun test <directory-of-changed-files> --bail
```

Do NOT run `bun typecheck` — pre-existing errors make it an unreliable signal and it adds significant runtime with no benefit.

### 4.3 Record Results

| Fix | Tests | Verdict |
|-----|-------|---------|
| Fix for Issue #1 | PASS | **Keep** as concrete |
| Fix for Issue #2 | FAIL | **Downgrade** to approach-only |

For downgraded fixes, record **why** they failed.

### 4.4 Cleanup (ALWAYS)
```bash
git checkout -
git branch -D fix-validation-temp
```

---

## Output

Pass categorized and validated fixes to Phase 8. Summary:

```
## Fix Validation Summary

**Concrete fixes validated:** [count] of [total]
**Downgraded to approach-only:** [count] — [reasons]
**Automated checks used:** [scoped tests only]
```
