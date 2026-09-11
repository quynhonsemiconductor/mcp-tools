# Phase 6: Test Coverage Review

**Goal:** Ensure new code has adequate test coverage and tests are high quality.

---

## Step 1: Identify What Needs Testing

From the changed files, identify:
- **New functions/methods** — should have tests
- **Changed behavior** — existing tests should be updated
- **Bug fixes** — should have a regression test
- **New error paths** — should be tested

Find test files for changed code (e.g., `src/utils/parser.ts` → `src/utils/parser.test.ts`).

---

## Step 2: Evaluate Existing Tests

Check for these quality issues:
- **Testing implementation vs behavior** — Tests should verify outputs/behavior, not spy on internal method calls
- **Missing edge cases** — Happy path only? Check for invalid input, empty input, null, error conditions
- **Missing error path tests** — Network errors, parse failures, auth failures
- **Over-mocking** — If everything is mocked, the test verifies nothing real. Only mock external dependencies
- **Test isolation** — Tests that depend on shared mutable state or execution order
- **Flaky patterns** — Real timers instead of fake timers, assumptions about ordering

---

## Step 3: Assess Coverage Gaps

### Critical paths to test:
1. Happy path — normal successful operation
2. Validation failures — invalid input handling
3. Error conditions — external failures, exceptions
4. Edge cases — boundary values, empty inputs
5. Security boundaries — auth checks, permission errors

### Common gaps:
- Error branches (bugs hide in error handling)
- Null/undefined inputs (common crash source)
- Cleanup/teardown (resource leaks)
- Configuration variations (works in dev, fails in prod)

---

## When NOT to Flag Missing Tests

- Trivial code (simple getters, pass-through functions)
- Generated code
- Configuration files or type definitions
- Code already tested indirectly via integration tests
- Prototype/experimental code explicitly marked as such

---

## Output

Use the Finding Output Format from pr.prompt.md. Include a coverage assessment table:

```
| Area | Coverage |
|------|----------|
| New functions | X of Y have tests |
| Changed behavior | Updated tests: YES/NO |
| Error paths | X of Y tested |
| Edge cases | [assessment] |
```

Note areas with good coverage.
