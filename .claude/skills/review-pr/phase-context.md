# Phase 1: Context Gathering

**Goal:** Understand what changed and why before reviewing any code.

---

## Step 1: Auto-Detect PR Context

Start by checking if we're on a PR branch with GitHub CLI:

```bash
# Try to get PR info directly (most reliable for context)
gh pr view --json number,title,body,baseRefName,headRefName,author,labels,milestone 2>/dev/null

# If that works, also get linked issues
gh pr view --json body 2>/dev/null | jq -r '.body' | grep -oE '(Fixes|Closes|Resolves) #[0-9]+' | head -5
```

If no PR exists, fall back to git:

```bash
# Get the main branch
MAIN=$(git branch -l main master 2>/dev/null | head -1 | tr -d ' *' || echo "main")

# See all commits on this branch
git log ${MAIN}..HEAD --oneline

# Get the diff stats
git diff ${MAIN}...HEAD --stat
```

If on main/master or no branch commits, review staged/unstaged changes:
```bash
git status
git diff --stat
```

---

## Step 2: Understand the Intent

### From PR (preferred)
```bash
gh pr view --json title,body

# Check for related issues
gh pr view --json body | jq -r '.body' | grep -oE '#[0-9]+' | while read issue; do
  gh issue view ${issue#\#} --json title,body 2>/dev/null | jq -r '"Issue \(.title): \(.body | .[0:200])..."'
done
```

### From commits (fallback)
```bash
git log ${MAIN}..HEAD --format="%B" | head -50
```

---

## Step 3: Read Project Instructions

**IMPORTANT:** Check CLAUDE.md first — it contains project-specific commands and patterns.

```bash
cat CLAUDE.md 2>/dev/null | head -150
cat CONTRIBUTING.md 2>/dev/null | head -50
```

---

## Step 4: Identify Tech Stack

Identify the language, framework, and test framework from `package.json` (or equivalent manifest). Note available scripts for testing, linting, and typechecking.

---

## Step 5: Categorize Change Type

```bash
# Get list of changed files
gh pr view --json files -q '.files[].path' 2>/dev/null || git diff main...HEAD --name-only
```

Categorize as: **DOCS_ONLY**, **CODE_ONLY**, **CODE_WITH_DOCS**, or **CONFIG_ONLY** based on file extensions.

---

## Step 6: Output Context Summary

Before proceeding, output this summary:

```
## Context Summary

**PR:** #[number] - [title] (or "Local changes" if no PR)
**Author:** [username]
**Base branch:** [main/master/etc]
**Change type:** [DOCS_ONLY / CODE_ONLY / CODE_WITH_DOCS / CONFIG_ONLY]
**What changed:** [1-2 sentence summary of the changes]
**Why it changed:** [intent/goal from PR description or commits]
**Linked issues:** [#123, #456 if any]
**Risk areas:** [which changes touch critical paths: auth, payments, data, etc.]
**Tech stack:** [language, framework, test framework]
**Files changed:** [count] files, +[lines added] -[lines removed]
**Key functions modified:** [list the specific functions/classes that were changed]
**Project commands:** [from CLAUDE.md: test, lint, typecheck commands]
**Project conventions:** [any patterns from CLAUDE.md that reviewers should enforce]
```

---

## Decision Point

**If the intent is unclear:**
- Ask ONE specific question before proceeding
- Don't ask generic "what should I focus on?" questions

**If intent is clear:**
- Proceed to Phase 2: CI Verification
