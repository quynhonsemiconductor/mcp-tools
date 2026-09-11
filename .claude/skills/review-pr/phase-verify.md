# Phase 8: Adversarial Verification

**Goal:** Try to disprove every finding. What survives is real.

---

## The Problem This Phase Solves

You found the issues. You believe they're real. That belief is the problem.

Confirmation bias means you'll re-read the same code and see the same "bug" again. Instead, your job here is to **act as defense attorney for the code** — actively try to prove each finding is wrong.

If you can't disprove it, it's real. If you can, kill it.

> **Fix correctness was already validated in Phase 7.** This phase is about whether the *issues themselves* are real.

---

## Step 1: Try to Disprove Every Finding

For each finding, your goal is to make it go away. Not to confirm it.

### 1.1 Search for the Defense

For each finding, ask and answer:

1. **Is this handled somewhere I didn't look?**
   - Read the entire function, not just the flagged line
   - Read 20 lines above and below
   - Search for try/catch wrappers, validation in callers, middleware, error boundaries
   - `git grep` for related error handling or validation

2. **Is there a reason this code is correct?**
   - Is this pattern intentional? (check comments, commit messages, PR description)
   - Does the codebase have a convention that explains this?
   - Is this a deliberate tradeoff the author made?

3. **Am I wrong about how this works?**
   - Did I misread the control flow?
   - Did I misunderstand the types? (check type definitions)
   - Did I assume a value could be null when the type system prevents it?

### 1.2 The Disproof Test

A finding survives ONLY if you can answer **no** to all of these:
- Is this handled elsewhere in the call chain?
- Is there a type constraint that prevents the bad state?
- Is this an intentional pattern with a comment or convention behind it?
- Did I misread the code?

If you answer **yes** to any — kill the finding or downgrade to a Question.

---

## Step 2: Verify External Claims

Any claim about something outside this codebase must have evidence.

| Claim | Required Evidence |
|-------|-------------------|
| "This API is deprecated" | Link to official deprecation notice |
| "This is insecure" | OWASP reference or CVE |
| "This library has a vulnerability" | CVE database or npm audit result |
| "Framework recommends X" | Link to official docs |

**No evidence = no claim.** Downgrade to a Question for Author or remove entirely.

---

## Step 3: Update Confidence

| What you found | Action |
|----------------|--------|
| Evidence the finding is wrong | **REMOVE** it |
| Couldn't disprove it, have evidence it's real | Keep at HIGH |
| Couldn't disprove it, but no concrete evidence either way | Downgrade to MEDIUM or Question |
| External claim with no authoritative source | **REMOVE** or downgrade to Question |

---

## Step 4: Kill Marginal Findings

After trying to disprove each finding, apply a second filter: **can you name the specific bad thing that happens if this isn't fixed?**

For each surviving finding, ask:
- What is the concrete consequence? Name it: crash, wrong result, data loss, security hole, breakage, resource leak. If you can't name one, the finding is a preference, not a problem.
- If you removed this finding from the report, would the report be worse? Or would nobody notice?

**If a finding only survives because "technically it's not wrong to mention it" — kill it.** A shorter report with only meaningful findings is more valuable than a comprehensive one that buries signal in noise.

---

## Step 5: Self-Check

- [ ] Did I genuinely try to disprove each finding, or did I just re-read and nod?
- [ ] Would I bet $20 on each surviving finding?
- [ ] Am I keeping findings just to seem thorough? **If yes, cut them now.**
- [ ] Did I search for handling elsewhere, or just re-read the same code?
- [ ] Does every surviving finding have concrete evidence (code reference, test failure, authoritative source)?
- [ ] Can I name the specific bad thing that happens for every finding? (crash, wrong result, data loss, security hole, breakage) If not, cut it.

---

## Common Ways Findings Die

**"Missing null check"** — but the caller validates, or the type is non-nullable.

**"No error handling"** — but there's a try/catch three frames up, or an error boundary.

**"Deprecated API"** — but it's actually fine; you confused it with a similarly-named API.

**"Security issue"** — but the input comes from internal config, not user input.

**"Race condition"** — but the operation is single-threaded, or there's a lock you didn't see.

**"Missing await"** — but the return value is intentionally a Promise (passed to Promise.all, etc.).

---

## Output

After verification you should have:

1. **Surviving findings** — you tried to disprove them and couldn't
2. **Killed findings** — you found evidence they were wrong
3. **Questions** — things you couldn't resolve either way

Pass surviving findings and questions to Phase 9: Report. It is normal and expected for many reviews to have zero or very few surviving findings after this phase.
