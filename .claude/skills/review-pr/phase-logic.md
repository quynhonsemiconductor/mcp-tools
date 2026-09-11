# Phase 3: Logic & Correctness Review

**Goal:** Find bugs, logic errors, and edge cases that would cause runtime failures.

---

## Before You Start

1. Get the list of changed files from Phase 1
2. For each file, read the ENTIRE function/class, not just the diff
3. Every issue needs a fix (concrete or approach-only)

> **STOP before reporting ANY issue:**
> - Did I read the ENTIRE function, not just the changed lines?
> - Could this "bug" be handled elsewhere in the function or callers?
> - If the change affects a function signature, did I check what calls this function?
> - Would I bet $20 this is a real bug?

---

## Step 1: Understand the Code

For each changed function, determine:
1. What is it supposed to do? (docstring, name, context)
2. What are its inputs? (parameters, global state, external calls)
3. What are its outputs? (return value, side effects, mutations)
4. What can go wrong? (errors, edge cases, invalid states)

---

## Step 2: Trace Data Flow

Follow data through the function: Input → Validation → Transformation → Output. Where does each input come from? Is it validated? What happens if validation fails? Is the output what callers expect?

---

## Step 3: Check Edge Cases

For every input, consider null/undefined, empty values, boundary values, and type-specific edge cases (NaN for numbers, unicode for strings, sparse arrays, circular refs, etc.).

---

## Step 4: Scan for Common Bug Patterns

- Off-by-one errors in loops and array indexing
- Null/undefined property access without null checks
- Missing `await` on async calls
- Unhandled promise rejections (`.then()` without `.catch()`)
- Race conditions on shared/async state
- Type coercion issues (truthy/falsy confusion, loose equality)
- Incorrect comparisons (object reference equality, floating point)
- DOM/UI consistency (missing event handlers, inconsistent show/hide)

---

## Step 5: Verify Intent Matches Implementation

- Do comments match what the code actually does?
- Does the code do what the PR description claims?
- Red flags: comment/code mismatch, TODO/FIXME/HACK, commented-out code, unexplained magic numbers

---

## Confidence Levels

| Level | When to Use |
|-------|-------------|
| **HIGH** | Clear logic error, will definitely fail |
| **MEDIUM** | Suspicious pattern, needs author input |
| **LOW** | Unusual code that might be intentional |

**Rule:** If you're not at least MEDIUM confident, don't report it. Verify more first.

---

## Output

Use the Finding Output Format from pr.prompt.md. Also list any complex logic you reviewed and confirmed is correct — this shows thoroughness.

**Do not** report style issues here (that's Phase 5) or assume based on function names alone.
