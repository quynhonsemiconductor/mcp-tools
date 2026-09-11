# Phase 9: Report Generation

**Goal:** Synthesize findings into an actionable, accurate report.

---

## Synthesizing Findings

- **Deduplicate** — Multiple phases may flag the same code from different perspectives. Combine into one finding.
- **Preserve confidence levels** — Use the post-verification confidence, not the original rating.
- **Use validated fix formats** — Concrete fixes passed automated checks. Approach-only fixes describe the direction. Don't mix these up.

---

## Report Template

```markdown
## Code Review: [PR title or brief description]

### Verdict: APPROVE / REQUEST CHANGES

**Summary:** [2-3 sentences: what changed, overall assessment, key finding if any]

---

### Automated Checks

| Check | Local Result | In CI? | Blocks Merge? |
|-------|--------------|--------|---------------|
| Tests | PASS/FAIL | YES/NO | YES/NO |
| Lint | PASS/FAIL | YES/NO | YES/NO |
| Types | PASS/FAIL | YES/NO | YES/NO |

---

### Critical (must fix before merge)

> Only include: CI-enforced failures OR real runtime bugs
> Every item needs HIGH confidence

**[Issue title]** - [file:line](path)

[1-2 sentence explanation of the problem and impact]

[Concrete fix or approach-only, per fix-categorization.md]

---

### Should Fix (strongly recommended)

> Issues that are real but don't block CI
> HIGH or MEDIUM confidence

**[Issue title]** - [file:line](path)

[Explanation. Concrete fix or approach-only.]

---

### Missing Tests

> Only if there are meaningful gaps

- **[What needs testing]** - add to [test-file.test.ts](path/to/test-file.test.ts)

---

### Questions for Author

> Clarifications, design discussions, things that seem intentional but unclear

1. [Question]
```

---

## What Goes Where

| Section | What belongs | Confidence |
|---------|-------------|------------|
| **Critical** | CI-enforced failures, runtime bugs, security vulnerabilities | HIGH only |
| **Should Fix** | Real issues that don't block CI | HIGH or MEDIUM |
| **Questions** | Anything unclear, things you couldn't verify | — |

Omit any section that has no items. A report with only "Automated Checks" and a verdict is a valid report — it means the code is solid.

---

## Verdict Decision Tree

```
CI-enforced check fails?
  -> YES -> REQUEST CHANGES
  -> NO -> continue

Real runtime bug found (HIGH confidence)?
  -> YES -> REQUEST CHANGES
  -> NO -> continue

Security vulnerability found (HIGH confidence)?
  -> YES -> REQUEST CHANGES
  -> NO -> continue

Only local check failures or suggestions?
  -> APPROVE (with Should Fix items)
```

---

## Quality Checklist

Before submitting the report:

- [ ] Verdict matches the decision tree
- [ ] "Critical" only contains CI-enforced failures or real bugs
- [ ] Concrete fixes were validated with automated checks
- [ ] Approach-only fixes include verification steps
- [ ] No false claims about "blocking merge"
- [ ] Report is actionable (author knows exactly what to do)
- [ ] Every finding has a nameable consequence (crash, wrong result, data loss, security hole, breakage) — no filler
- [ ] If you removed any single finding, would the report lose value? If not, remove it

---

## Length Guidelines

- **Small PR (<100 lines):** <200 words
- **Medium PR (100-500 lines):** <500 words
- **Large PR (500+ lines):** Longer is fine, but prioritize ruthlessly

3 real issues > 10 maybes. Zero issues with a clean APPROVE is the best possible review outcome — it means the code is good.

---

## IMPORTANT: Write the Verdict File

After posting your report comment, you MUST write a verdict file so the workflow can submit the formal GitHub review:

```json
{"event":"APPROVE"}
// or
{"event":"REQUEST_CHANGES"}
```

You MUST write this file using the Write tool to the verdict path given in your custom instructions (e.g. `{\"event\":\"APPROVE\"}`). The workflow reads it after you finish and submits the formal review as svc-claudius. Do NOT skip this step — without it, no approval or request-changes will show up in GitHub.
